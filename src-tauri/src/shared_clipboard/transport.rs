//! Bounded, authenticated HTTP transport. Payload authenticity belongs to C1;
//! receiving a well-shaped page never authorizes an effect or decrypts its body.

use super::crypto::DeviceSigner;
use super::wire::{self, Envelope, MAX_ENVELOPE_JSON_BYTES};
use base64::{engine::general_purpose::STANDARD, Engine};
use ed25519_dalek::{Signature, VerifyingKey};
use reqwest::{
    blocking::{Client, RequestBuilder},
    header::{HeaderMap, HeaderValue, AUTHORIZATION, CONTENT_TYPE},
    redirect::Policy,
    Url,
};
use rustls_platform_verifier::BuilderVerifierExt;
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use std::{io::Read, sync::Arc, time::Duration};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Error {
    InvalidEndpoint,
    InvalidInput,
    InvalidResponse,
    Denied,
    Conflict,
    Expired,
    TooLarge,
    Quota,
    Rejected,
    Unavailable,
    Unsupported,
}
type Result<T> = std::result::Result<T, Error>;

pub(crate) fn id(value: &str) -> Result<()> {
    if value.is_empty()
        || value.len() > 128
        || !value
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_'))
    {
        return Err(Error::InvalidInput);
    }
    Ok(())
}

fn decimal(value: &str) -> Result<u64> {
    if value == "0" {
        Ok(0)
    } else {
        wire::counter(value).map_err(|_| Error::InvalidResponse)
    }
}

fn frame(out: &mut Vec<u8>, value: &str) {
    out.extend_from_slice(&(value.len() as u32).to_be_bytes());
    out.extend_from_slice(value.as_bytes());
}

fn verify(key: &[u8; 32], bytes: &[u8], encoded: &str) -> Result<()> {
    if encoded.len() != 88 {
        return Err(Error::InvalidResponse);
    }
    let signature = STANDARD
        .decode(encoded)
        .map_err(|_| Error::InvalidResponse)?;
    if STANDARD.encode(&signature) != encoded {
        return Err(Error::InvalidResponse);
    }
    let signature = Signature::from_slice(&signature).map_err(|_| Error::InvalidResponse)?;
    let key = VerifyingKey::from_bytes(key).map_err(|_| Error::InvalidResponse)?;
    if key.is_weak() {
        return Err(Error::Denied);
    }
    key.verify_strict(bytes, &signature)
        .map_err(|_| Error::Denied)
}

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct Channel {
    pub(crate) id: String,
    pub(crate) key_epoch: String,
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct Channels {
    pub(crate) channels: Vec<Channel>,
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct Acceptance {
    pub(crate) publication_id: String,
    pub(crate) server_sequence: String,
    pub(crate) accepted_at_unix_ms: String,
    pub(crate) expires_at_unix_ms: String,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct LeaseProof {
    pub(crate) lease_id: String,
    pub(crate) environment: String,
    pub(crate) channel_id: String,
    pub(crate) device_id: String,
    pub(crate) issued_at_unix_ms: String,
    pub(crate) expires_at_unix_ms: String,
    pub(crate) max_duration_ms: String,
    pub(crate) signature: String,
}
impl LeaseProof {
    pub(crate) fn signing_bytes(&self) -> Result<Vec<u8>> {
        let mut out = b"Copicu.shared.lease.v1\0".to_vec();
        for value in [
            &self.lease_id,
            &self.environment,
            &self.channel_id,
            &self.device_id,
        ] {
            id(value)?;
            frame(&mut out, value);
        }
        let issued = wire::counter(&self.issued_at_unix_ms).map_err(|_| Error::InvalidResponse)?;
        let expires =
            wire::counter(&self.expires_at_unix_ms).map_err(|_| Error::InvalidResponse)?;
        let duration = wire::counter(&self.max_duration_ms).map_err(|_| Error::InvalidResponse)?;
        if duration > 10_000 || issued.checked_add(duration) != Some(expires) {
            return Err(Error::InvalidResponse);
        }
        for value in [issued, expires, duration] {
            out.extend_from_slice(&value.to_be_bytes());
        }
        Ok(out)
    }
    // Cryptographic lease proof only. The receiver must separately apply its
    // stream/bootstrap/generation and monotonic eligibility guards.
    pub(crate) fn verify_scope(
        &self,
        issuer: &[u8; 32],
        environment: &str,
        channel: &str,
        device: &str,
    ) -> Result<()> {
        if self.environment != environment || self.channel_id != channel || self.device_id != device
        {
            return Err(Error::Denied);
        }
        verify(issuer, &self.signing_bytes()?, &self.signature)
    }
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct Entry {
    pub(crate) server_sequence: String,
    pub(crate) envelope: Envelope,
    pub(crate) lease_proof: Option<LeaseProof>,
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct Gap {
    pub(crate) first_lost: String,
    pub(crate) last_lost: String,
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct Page {
    pub(crate) environment: String,
    pub(crate) channel_id: String,
    pub(crate) head: String,
    pub(crate) retention_floor: String,
    pub(crate) next_cursor: String,
    pub(crate) entries: Vec<Entry>,
    pub(crate) gap: Option<Gap>,
}
impl Page {
    fn validate(&self, environment: &str, channel: &str, cursor: u64) -> Result<()> {
        if self.environment != environment || self.channel_id != channel || self.entries.len() > 50
        {
            return Err(Error::InvalidResponse);
        }
        let head = decimal(&self.head)?;
        let floor = wire::counter(&self.retention_floor).map_err(|_| Error::InvalidResponse)?;
        let next = decimal(&self.next_cursor)?;
        if head < cursor || floor - 1 > head || next > head {
            return Err(Error::InvalidResponse);
        }
        let mut previous = cursor;
        if let Some(gap) = &self.gap {
            let last_lost = decimal(&gap.last_lost)?;
            if decimal(&gap.first_lost)? != cursor.checked_add(1).ok_or(Error::InvalidResponse)?
                || last_lost <= cursor
                || last_lost > head
                || last_lost < floor - 1
            {
                return Err(Error::InvalidResponse);
            }
            // Expiry can leave a hole after an older retained publication;
            // retention_floor is the first retained row, not every local gap.
            previous = last_lost;
        } else if floor - 1 > cursor {
            return Err(Error::InvalidResponse);
        }
        let mut publications = std::collections::HashSet::new();
        for entry in &self.entries {
            let sequence =
                wire::counter(&entry.server_sequence).map_err(|_| Error::InvalidResponse)?;
            if sequence != previous.checked_add(1).ok_or(Error::InvalidResponse)?
                || sequence > head
                || entry.envelope.environment != environment
                || entry.envelope.channel_id != channel
                || !publications.insert(&entry.envelope.publication_id)
            {
                return Err(Error::InvalidResponse);
            }
            entry
                .envelope
                .validate_shape()
                .map_err(|_| Error::InvalidResponse)?;
            previous = sequence;
        }
        if previous != next {
            return Err(Error::InvalidResponse);
        }
        Ok(())
    }
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct Notice {
    pub(crate) head: String,
    pub(crate) heartbeat: Option<bool>,
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct Report {
    pub(crate) attempt_id: String,
    pub(crate) publication_id: String,
    pub(crate) sink: String,
    pub(crate) outcome: String,
    pub(crate) signature: String,
}
impl Report {
    pub(crate) fn signing_bytes(
        &self,
        environment: &str,
        channel: &str,
        device: &str,
    ) -> Result<Vec<u8>> {
        if !["clipboard", "history", "action"].contains(&self.sink.as_str())
            || !["applied", "failed", "uncertain", "skipped"].contains(&self.outcome.as_str())
        {
            return Err(Error::InvalidInput);
        }
        let mut out = b"Copicu.shared.report.v1\0".to_vec();
        for value in [
            environment,
            channel,
            device,
            &self.attempt_id,
            &self.publication_id,
            &self.sink,
            &self.outcome,
        ] {
            id(value)?;
            frame(&mut out, value);
        }
        Ok(out)
    }
    pub(crate) fn sign(
        &mut self,
        environment: &str,
        channel: &str,
        device: &str,
        key: &DeviceSigner,
    ) -> Result<()> {
        self.signature =
            STANDARD.encode(key.sign(&self.signing_bytes(environment, channel, device)?));
        Ok(())
    }
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct ReportAck {
    pub(crate) attempt_id: String,
    pub(crate) status: String,
}

// Neither client nor bearer credentials implement Debug/Serialize.
pub(crate) struct RelayClient {
    endpoint: Url,
    environment: String,
    device: String,
    client: Client,
}
impl RelayClient {
    pub(crate) fn new(
        endpoint: &str,
        environment: &str,
        device: &str,
        token: &str,
        allow_loopback_fixture: bool,
    ) -> Result<Self> {
        Self::with_timeout(
            endpoint,
            environment,
            device,
            token,
            allow_loopback_fixture,
            Duration::from_secs(12),
        )
    }
    pub(super) fn with_timeout(
        endpoint: &str,
        environment: &str,
        device: &str,
        token: &str,
        allow_loopback_fixture: bool,
        timeout: Duration,
    ) -> Result<Self> {
        let (endpoint, headers, tls) = Self::settings(endpoint, environment, device, token, allow_loopback_fixture)?;
        let client = Client::builder()
            .default_headers(headers)
            .redirect(Policy::none())
            .no_proxy()
            .connect_timeout(Duration::from_secs(2))
            .timeout(timeout)
            .tls_backend_preconfigured(tls)
            .build()
            .map_err(|_| Error::Unavailable)?;
        Ok(Self { endpoint, environment: environment.into(), device: device.into(), client })
    }
    fn settings(endpoint: &str, environment: &str, device: &str, token: &str, allow_loopback_fixture: bool) -> Result<(Url, HeaderMap, rustls::ClientConfig)> {
        id(environment)?;
        id(device)?;
        let endpoint = Url::parse(endpoint).map_err(|_| Error::InvalidEndpoint)?;
        let loopback = endpoint
            .host_str()
            .is_some_and(|host| host == "127.0.0.1" || host == "[::1]");
        if (endpoint.scheme() != "https"
            && !(allow_loopback_fixture && endpoint.scheme() == "http" && loopback))
            || !endpoint.username().is_empty()
            || endpoint.password().is_some()
            || endpoint.query().is_some()
            || endpoint.fragment().is_some()
            || endpoint.path() != "/"
        {
            return Err(Error::InvalidEndpoint);
        }
        if !(32..=128).contains(&token.len())
            || !token
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_'))
        {
            return Err(Error::InvalidInput);
        }
        // Select this client's provider explicitly. Another subsystem may have
        // installed a process default; that is not an enrollment failure.
        let tls = rustls::ClientConfig::builder_with_provider(Arc::new(
            rustls::crypto::ring::default_provider(),
        ))
        .with_safe_default_protocol_versions()
        .map_err(|_| Error::Unavailable)?
        .with_platform_verifier()
        .map_err(|_| Error::Unavailable)?
        .with_no_client_auth();
        let mut authorization =
            HeaderValue::from_str(&format!("Bearer {token}")).map_err(|_| Error::InvalidInput)?;
        authorization.set_sensitive(true);
        let mut headers = HeaderMap::new();
        headers.insert(AUTHORIZATION, authorization);
        Ok((endpoint, headers, tls))
    }
    pub(super) fn event_client(endpoint: &str, environment: &str, device: &str, token: &str, allow_loopback_fixture: bool) -> Result<(Url, reqwest::Client)> {
        let (endpoint, headers, tls) = Self::settings(endpoint, environment, device, token, allow_loopback_fixture)?;
        let client = reqwest::Client::builder().default_headers(headers).redirect(Policy::none()).no_proxy()
            .connect_timeout(Duration::from_secs(2)).read_timeout(Duration::from_secs(12))
            .tls_backend_preconfigured(tls).build().map_err(|_| Error::Unavailable)?;
        Ok((endpoint, client))
    }
    fn channel_url(&self, channel: &str, operation: &str) -> Result<Url> {
        id(channel)?;
        self.endpoint
            .join(&format!("v1/channels/{channel}/{operation}"))
            .map_err(|_| Error::InvalidEndpoint)
    }
    /// Same authenticated, bounded client; callers cannot redirect credentials
    /// to an external URL or escape the versioned control-plane prefix.
    pub(super) fn request_control(
        &self,
        method: &str,
        path: &str,
        input: Option<&serde_json::Value>,
    ) -> Result<serde_json::Value> {
        if !path.starts_with("/v2/") { return Err(Error::InvalidInput); }
        self.request_api(method, path, input)
    }
    pub(super) fn request_identity(&self, method: &str, path: &str, input: Option<&serde_json::Value>) -> Result<serde_json::Value> {
        if !path.starts_with("/v3/") { return Err(Error::InvalidInput); }
        self.request_api(method, path, input)
    }
    fn request_api(&self, method: &str, path: &str, input: Option<&serde_json::Value>) -> Result<serde_json::Value> {
        if path.contains("..")
            || path.contains('#')
            || path.contains('\\')
        {
            return Err(Error::InvalidInput);
        }
        let method = match method {
            "GET" => reqwest::Method::GET,
            "POST" => reqwest::Method::POST,
            "DELETE" => reqwest::Method::DELETE,
            "PATCH" => reqwest::Method::PATCH,
            _ => return Err(Error::InvalidInput),
        };
        let url = self
            .endpoint
            .join(path)
            .map_err(|_| Error::InvalidEndpoint)?;
        if url.origin() != self.endpoint.origin() {
            return Err(Error::InvalidEndpoint);
        }
        let mut request = self.client.request(method, url);
        if path.contains("/history") { request = request.timeout(Duration::from_secs(45)); }
        if let Some(input) = input {
            let body = serde_json::to_vec(input).map_err(|_| Error::InvalidInput)?;
            if body.len() > MAX_ENVELOPE_JSON_BYTES {
                return Err(Error::TooLarge);
            }
            request = request.header(CONTENT_TYPE, "application/json").body(body);
        }
        self.send(request)
    }
    fn send<T: DeserializeOwned>(&self, request: RequestBuilder) -> Result<T> {
        let response = request.send().map_err(|_| Error::Unavailable)?;
        match response.status().as_u16() {
            200..=299 => {}
            401 | 403 => return Err(Error::Denied),
            404 | 405 | 501 => return Err(Error::Unsupported),
            409 => return Err(Error::Conflict),
            410 => return Err(Error::Expired),
            413 => return Err(Error::TooLarge),
            429 => return Err(Error::Quota),
            400 | 422 => return Err(Error::Rejected),
            500..=599 => return Err(Error::Unavailable),
            _ => return Err(Error::InvalidResponse),
        }
        if !response
            .headers()
            .get(CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .is_some_and(|v| v.split(';').next() == Some("application/json"))
        {
            return Err(Error::InvalidResponse);
        }
        if response
            .content_length()
            .is_some_and(|size| size > MAX_ENVELOPE_JSON_BYTES as u64)
        {
            return Err(Error::TooLarge);
        }
        let mut body = Vec::new();
        response
            .take(MAX_ENVELOPE_JSON_BYTES as u64 + 1)
            .read_to_end(&mut body)
            .map_err(|_| Error::Unavailable)?;
        if body.len() > MAX_ENVELOPE_JSON_BYTES {
            return Err(Error::TooLarge);
        }
        serde_json::from_slice(&body).map_err(|_| Error::InvalidResponse)
    }
    pub(crate) fn channels(&self) -> Result<Channels> {
        let value: Channels = self.send(
            self.client.get(
                self.endpoint
                    .join("v1/channels")
                    .map_err(|_| Error::InvalidEndpoint)?,
            ),
        )?;
        if value.channels.len() > 100 {
            return Err(Error::TooLarge);
        }
        let mut ids = std::collections::HashSet::new();
        for channel in &value.channels {
            id(&channel.id)?;
            wire::counter(&channel.key_epoch).map_err(|_| Error::InvalidResponse)?;
            if !ids.insert(&channel.id) {
                return Err(Error::InvalidResponse);
            }
        }
        Ok(value)
    }
    pub(crate) fn publish(&self, envelope: &Envelope) -> Result<Acceptance> {
        envelope.validate_shape().map_err(|_| Error::InvalidInput)?;
        if envelope.environment != self.environment || envelope.device_id != self.device {
            return Err(Error::Denied);
        }
        let body = serde_json::to_vec(envelope).map_err(|_| Error::InvalidInput)?;
        if body.len() > MAX_ENVELOPE_JSON_BYTES {
            return Err(Error::TooLarge);
        }
        let value: Acceptance = self.send(
            self.client
                .post(self.channel_url(&envelope.channel_id, "publish")?)
                .timeout(Duration::from_secs(45))
                .header(CONTENT_TYPE, "application/json")
                .body(body),
        )?;
        if value.publication_id != envelope.publication_id
            || wire::counter(&value.server_sequence).is_err()
            || wire::counter(&value.accepted_at_unix_ms).is_err()
            || value.expires_at_unix_ms != envelope.expires_at_unix_ms
            || decimal(&value.accepted_at_unix_ms)? >= decimal(&value.expires_at_unix_ms)?
        {
            return Err(Error::InvalidResponse);
        }
        Ok(value)
    }
    pub(crate) fn sync(&self, channel: &str, cursor: u64) -> Result<Page> {
        let mut url = self.channel_url(channel, "sync")?;
        url.query_pairs_mut()
            .append_pair("cursor", &cursor.to_string())
            .append_pair("limit", "50");
        let value: Page = self.send(self.client.get(url).timeout(Duration::from_secs(45)))?;
        value.validate(&self.environment, channel, cursor)?;
        Ok(value)
    }
    pub(crate) fn lease(&self, channel: &str, issuer: &[u8; 32]) -> Result<LeaseProof> {
        let value: LeaseProof = self.send(
            self.client
                .post(self.channel_url(channel, "lease")?)
                .json(&serde_json::json!({})),
        )?;
        value.verify_scope(issuer, &self.environment, channel, &self.device)?;
        Ok(value)
    }
    pub(crate) fn watch(&self, channel: &str, head: u64) -> Result<Notice> {
        let mut url = self.channel_url(channel, "watch")?;
        url.query_pairs_mut().append_pair("head", &head.to_string());
        let value: Notice = self.send(self.client.get(url))?;
        if decimal(&value.head)? < head {
            return Err(Error::InvalidResponse);
        }
        Ok(value)
    }
    pub(crate) fn report(&self, channel: &str, report: &Report) -> Result<ReportAck> {
        report.signing_bytes(&self.environment, channel, &self.device)?;
        if report.signature.len() != 88 {
            return Err(Error::InvalidInput);
        }
        let ack: ReportAck = self.send(
            self.client
                .post(self.channel_url(channel, "report")?)
                .json(report),
        )?;
        if ack.attempt_id != report.attempt_id || ack.status != "ack" {
            return Err(Error::InvalidResponse);
        }
        Ok(ack)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::{Signer, SigningKey};
    use std::{net::TcpListener, thread};
    const TOKEN: &str = "synthetic-transport-token-000000000000";
    fn server(status: &str, headers: &str, body: &str) -> (String, thread::JoinHandle<String>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = format!("http://{}/", listener.local_addr().unwrap());
        let response = format!(
            "HTTP/1.1 {status}\r\nConnection: close\r\nContent-Length: {}\r\n{headers}\r\n{body}",
            body.len()
        );
        let handle = thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            stream
                .set_read_timeout(Some(Duration::from_secs(2)))
                .unwrap();
            let mut request = [0; 8192];
            let length = stream.read(&mut request).unwrap();
            let _ = std::io::Write::write_all(&mut stream, response.as_bytes());
            String::from_utf8_lossy(&request[..length]).into_owned()
        });
        (address, handle)
    }
    #[test]
    fn endpoints_require_https_or_explicit_literal_loopback_without_url_credentials() {
        for endpoint in [
            "http://example.com/",
            "http://localhost/",
            "file:///tmp/x",
            "https://token@example.com/",
            "https://example.com/?token=x",
            "https://example.com/#x",
            "https://example.com/path",
        ] {
            assert!(
                RelayClient::new(endpoint, "env", "dev", TOKEN, true).is_err(),
                "{endpoint}"
            );
        }
        assert!(RelayClient::new("http://127.0.0.1/", "env", "dev", TOKEN, false).is_err());
        assert!(RelayClient::new("https://example.com/", "env", "dev", TOKEN, false).is_ok());
    }
    #[test]
    fn real_http_preserves_large_unsigned_metadata_and_header_only_authentication() {
        let (url, handle) = server(
            "200 OK",
            "Content-Type: application/json\r\n",
            r#"{"head":"18446744073709551615","heartbeat":true}"#,
        );
        let client = RelayClient::new(&url, "env", "dev", TOKEN, true).unwrap();
        let notice = client.watch("channel-A", u64::MAX - 1).unwrap();
        assert_eq!(decimal(&notice.head).unwrap(), u64::MAX);
        let request = handle.join().unwrap();
        assert!(request.starts_with("GET /v1/channels/channel-A/watch?head=18446744073709551614 "));
        assert!(request
            .to_ascii_lowercase()
            .contains(&format!("authorization: bearer {TOKEN}")));
        assert!(!request.lines().next().unwrap().contains(TOKEN));
    }
    #[test]
    fn redirect_denial_malformed_and_oversize_responses_remain_metadata_errors() {
        for (status, headers, body, expected) in [
            (
                "302 Found",
                "Location: http://127.0.0.1:1/\r\n",
                "",
                Error::InvalidResponse,
            ),
            (
                "403 Forbidden",
                "Content-Type: application/json\r\n",
                r#"{"private":"synthetic"}"#,
                Error::Denied,
            ),
            (
                "200 OK",
                "Content-Type: application/json\r\n",
                r#"{"channels":[],"unknown":true}"#,
                Error::InvalidResponse,
            ),
            (
                "200 OK",
                "Content-Type: text/html\r\n",
                "<secret>",
                Error::InvalidResponse,
            ),
        ] {
            let (url, handle) = server(status, headers, body);
            let client = RelayClient::new(&url, "env", "dev", TOKEN, true).unwrap();
            assert_eq!(client.channels().err(), Some(expected));
            handle.join().unwrap();
        }
        let (url, handle) = server(
            "200 OK",
            "Content-Type: application/json\r\n",
            &" ".repeat(MAX_ENVELOPE_JSON_BYTES + 1),
        );
        let client = RelayClient::new(&url, "env", "dev", TOKEN, true).unwrap();
        assert_eq!(client.channels().err(), Some(Error::TooLarge));
        // The client may close before the server finishes sending the oversized body.
        let _ = handle.join();
    }
    #[test]
    fn signed_lease_and_report_bind_every_scope_and_reject_tamper() {
        let key = SigningKey::from_bytes(&[23; 32]);
        let public = key.verifying_key().to_bytes();
        let mut lease = LeaseProof {
            lease_id: "lease-A".into(),
            environment: "env".into(),
            channel_id: "chan".into(),
            device_id: "dev".into(),
            issued_at_unix_ms: "1000".into(),
            expires_at_unix_ms: "11000".into(),
            max_duration_ms: "10000".into(),
            signature: String::new(),
        };
        lease.signature = STANDARD.encode(key.sign(&lease.signing_bytes().unwrap()).to_bytes());
        assert!(lease.verify_scope(&public, "env", "chan", "dev").is_ok());
        assert_eq!(
            lease.verify_scope(&public, "other", "chan", "dev"),
            Err(Error::Denied)
        );
        lease.device_id = "other".into();
        assert_eq!(
            lease.verify_scope(&public, "env", "chan", "other"),
            Err(Error::Denied)
        );
        let mut report = Report {
            attempt_id: "attempt-A".into(),
            publication_id: "pub-A".into(),
            sink: "clipboard".into(),
            outcome: "uncertain".into(),
            signature: String::new(),
        };
        struct Seed;
        impl super::super::crypto::Entropy for Seed {
            fn fill(&mut self, bytes: &mut [u8]) -> super::super::crypto::Result<()> {
                bytes.fill(23);
                Ok(())
            }
        }
        let signer = DeviceSigner::generate(&mut Seed).unwrap();
        report.sign("env", "chan", "dev", &signer).unwrap();
        assert!(verify(
            &public,
            &report.signing_bytes("env", "chan", "dev").unwrap(),
            &report.signature
        )
        .is_ok());
        report.outcome = "applied".into();
        assert_eq!(
            verify(
                &public,
                &report.signing_bytes("env", "chan", "dev").unwrap(),
                &report.signature
            ),
            Err(Error::Denied)
        );
    }
    #[test]
    fn empty_retention_gap_and_cross_scope_page_are_explicit() {
        let page = Page {
            environment: "env".into(),
            channel_id: "chan".into(),
            head: "5".into(),
            retention_floor: "6".into(),
            next_cursor: "5".into(),
            entries: vec![],
            gap: Some(Gap {
                first_lost: "1".into(),
                last_lost: "5".into(),
            }),
        };
        assert!(page.validate("env", "chan", 0).is_ok());
        assert_eq!(
            page.validate("other", "chan", 0),
            Err(Error::InvalidResponse)
        );
        assert_eq!(page.validate("env", "chan", 6), Err(Error::InvalidResponse));
    }
    #[test]
    fn interior_expiry_gap_advances_explicitly_without_requiring_global_floor() {
        let mut page = Page {
            environment: "env".into(),
            channel_id: "chan".into(),
            head: "3".into(),
            retention_floor: "1".into(),
            next_cursor: "2".into(),
            entries: vec![],
            gap: Some(Gap {
                first_lost: "2".into(),
                last_lost: "2".into(),
            }),
        };
        assert!(page.validate("env", "chan", 1).is_ok());
        page.gap.as_mut().unwrap().last_lost = "4".into();
        assert_eq!(page.validate("env", "chan", 1), Err(Error::InvalidResponse));
        page.gap.as_mut().unwrap().last_lost = "1".into();
        assert_eq!(page.validate("env", "chan", 1), Err(Error::InvalidResponse));
    }
}
#[cfg(test)]
#[test]
fn client_provider_is_independent_from_process_default() {
    let _ = rustls::crypto::ring::default_provider().install_default();
    assert!(RelayClient::new(
        "https://example.com/",
        "env",
        "dev",
        "synthetic-transport-token-000000000000",
        false
    )
    .is_ok());
    assert!(RelayClient::new(
        "http://127.0.0.1/",
        "env",
        "dev",
        "synthetic-transport-token-000000000000",
        true
    )
    .is_ok());
}
