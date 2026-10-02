//! One cancellable stream per profile. Hints coalesce; only an applied snapshot
//! advances control water. Publication hints only wake the existing V1 worker.
use super::{
    config::StoredConfig,
    custody::KeyKind,
    product, runtime,
    transport::{Error, RelayClient},
};
use crate::storage::AppStorage;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc, Arc,
    },
    time::{Duration, Instant},
};
use tauri::{Emitter, Manager};
static STOP: AtomicBool = AtomicBool::new(false);
pub(crate) fn stop() {
    STOP.store(true, Ordering::Release);
}

pub(super) fn identity(c: &StoredConfig) -> String {
    super::config::hex(&Sha256::digest(
        serde_json::to_vec(&json!([
            c.environment,
            c.device_id,
            c.endpoint,
            c.vault_name,
            c.enrollment_fingerprint,
            c.signing_reference,
            c.bearer_reference
        ]))
        .expect("identity serialization"),
    ))
}
#[derive(Clone)]
pub(super) struct Watermark {
    pub person_id: String,
    pub generation: String,
    pub cursor: u64,
}
impl Watermark {
    pub(super) fn from_catalog(value: &Value, c: &StoredConfig) -> Result<Self, String> {
        let mark = &value["control"];
        let person = mark["personId"]
            .as_str()
            .filter(|v| super::crypto::valid_id(v))
            .ok_or("Invalid control person")?;
        let generation = mark["generation"]
            .as_str()
            .filter(|v| v.len() == 32 && v.bytes().all(|b| b.is_ascii_hexdigit()))
            .ok_or("Invalid control generation")?;
        let cursor = mark["cursor"]
            .as_str()
            .and_then(|v| decimal(v).ok())
            .ok_or("Invalid control cursor")?;
        if mark["version"] != 1
            || mark["environment"] != c.environment
            || value["person"]["id"] != person
        {
            return Err("Control snapshot scope mismatch".into());
        }
        Ok(Self {
            person_id: person.into(),
            generation: generation.into(),
            cursor,
        })
    }
}
fn decimal(value: &str) -> Result<u64, Error> {
    if value.is_empty()
        || value.len() > 20
        || !value.bytes().all(|b| b.is_ascii_digit())
        || (value.len() > 1 && value.starts_with('0'))
    {
        return Err(Error::InvalidResponse);
    }
    value.parse().map_err(|_| Error::InvalidResponse)
}

#[derive(Default)]
struct Parser {
    line: Vec<u8>,
    data: String,
    event: String,
    id: String,
    frame_bytes: usize,
    cr: bool,
}
impl Parser {
    fn push(
        &mut self,
        bytes: &[u8],
        mut emit: impl FnMut(&str, &str, &str) -> Result<(), Error>,
    ) -> Result<(), Error> {
        for &byte in bytes {
            if self.cr && byte == b'\n' {
                self.cr = false;
                continue;
            }
            self.cr = false;
            if byte == b'\n' || byte == b'\r' {
                self.cr = byte == b'\r';
                let line = std::str::from_utf8(&self.line).map_err(|_| Error::InvalidResponse)?;
                if line.is_empty() {
                    if !self.data.is_empty() {
                        emit(&self.event, self.data.trim_end_matches('\n'), &self.id)?;
                    }
                    self.data.clear();
                    self.event.clear();
                    self.id.clear();
                    self.frame_bytes = 0;
                } else if !line.starts_with(':') {
                    let (field, value) = line.split_once(':').unwrap_or((line, ""));
                    let value = value.strip_prefix(' ').unwrap_or(value);
                    match field {
                        "data" => {
                            self.data.push_str(value);
                            self.data.push('\n');
                        }
                        "event" => self.event = value.into(),
                        "id" if !value.contains('\0') => self.id = value.into(),
                        _ => {}
                    }
                }
                self.line.clear();
            } else {
                self.line.push(byte);
            }
            self.frame_bytes += 1;
            if self.line.len() > 4096 || self.frame_bytes > 16384 {
                return Err(Error::TooLarge);
            }
        }
        Ok(())
    }
}
async fn consume(
    client: reqwest::Client,
    mut url: reqwest::Url,
    mark: Watermark,
    wake: mpsc::SyncSender<()>,
    publication_wake: mpsc::SyncSender<()>,
    healthy: Arc<AtomicBool>,
) -> Result<(), Error> {
    url.set_path("/v2/events");
    url.query_pairs_mut()
        .append_pair("generation", &mark.generation)
        .append_pair("personId", &mark.person_id)
        .append_pair("cursor", &mark.cursor.to_string());
    let mut response = client
        .get(url)
        .header("accept", "text/event-stream")
        .send()
        .await
        .map_err(|_| Error::Unavailable)?;
    match response.status().as_u16() {
        200 => {}
        401 | 403 => return Err(Error::Denied),
        404 | 405 | 501 => return Err(Error::Unsupported),
        429 => return Err(Error::Quota),
        _ => return Err(Error::Unavailable),
    }
    if !response
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .is_some_and(|v| v.split(';').next() == Some("text/event-stream"))
    {
        return Err(Error::InvalidResponse);
    }
    healthy.store(true, Ordering::Release);
    let mut parser = Parser::default();
    let mut seen = mark.cursor;
    while let Some(chunk) = response.chunk().await.map_err(|_| Error::Unavailable)? {
        let mut reset = false;
        parser.push(&chunk, |kind, data, event_id| {
            if kind == "reset" {
                reset = true;
                let _ = wake.try_send(());
                return Ok(());
            }
            if kind != "control" {
                return Ok(());
            }
            let value: Value = serde_json::from_str(data).map_err(|_| Error::InvalidResponse)?;
            if value["version"] != 1 {
                return Err(Error::InvalidResponse);
            }
            let publication = value["type"] == "publication_head_changed";
            if !publication
                && !matches!(
                    value["type"].as_str(),
                    Some("catalog_changed" | "resource_removed" | "devices_changed")
                )
            {
                return Ok(());
            }
            let mut scope = event_id.split(':');
            let generation = scope.next().ok_or(Error::InvalidResponse)?;
            let person = scope.next().ok_or(Error::InvalidResponse)?;
            let cursor = scope.next().ok_or(Error::InvalidResponse)?;
            if person != mark.person_id || scope.next().is_some() {
                return Err(Error::InvalidResponse);
            }
            let cursor = decimal(cursor)?;
            if generation != mark.generation
                || value["cursor"].as_str().and_then(|v| decimal(v).ok()) != Some(cursor)
            {
                return Err(Error::InvalidResponse);
            }
            if let Some(resource) = value["resourceId"].as_str() {
                super::transport::id(resource)?;
            } else if publication {
                return Err(Error::InvalidResponse);
            }
            if publication
                && value["head"]
                    .as_str()
                    .and_then(|v| decimal(v).ok())
                    .is_none_or(|head| head == 0)
            {
                return Err(Error::InvalidResponse);
            }
            if cursor > seen {
                seen = cursor;
                if publication {
                    let _ = publication_wake.try_send(());
                } else {
                    let _ = wake.try_send(());
                }
            }
            Ok(())
        })?;
        if reset {
            return Ok(());
        }
    }
    Ok(())
}
pub(super) fn stream(
    c: &StoredConfig,
    storage: &AppStorage,
    mark: Watermark,
    wake: mpsc::SyncSender<()>,
    publication_wake: mpsc::SyncSender<()>,
    healthy: Arc<AtomicBool>,
) -> Result<tauri::async_runtime::JoinHandle<Result<(), Error>>, String> {
    let store = runtime::store(storage)?;
    let vault = runtime::vault(&store, c)?;
    let token = vault
        .load_credential(&runtime::binding(
            c,
            KeyKind::Credential,
            &c.bearer_reference,
            1,
        ))
        .map_err(|_| "Cannot open control credential")?;
    let token = std::str::from_utf8(&token.0).map_err(|_| "Invalid control credential")?;
    let (url, client) = RelayClient::event_client(
        &c.endpoint,
        &c.environment,
        &c.device_id,
        token,
        c.allow_loopback,
    )
    .map_err(|_| "Invalid control transport")?;
    Ok(tauri::async_runtime::spawn(consume(
        client,
        url,
        mark,
        wake,
        publication_wake,
        healthy,
    )))
}
fn state<R: tauri::Runtime>(app: &tauri::AppHandle<R>, storage: &AppStorage, value: &str) {
    if let Ok(store) = runtime::store(storage) {
        if store.control_status(None).ok().as_deref() != Some(value) {
            let _ = store.control_status(Some(value));
            let _ = app.emit("shared-catalog-invalidated", json!({"state":value}));
        }
    }
}
/// Starts with the existing host, independent of any open renderer/window.
pub(crate) fn start<R: tauri::Runtime + 'static>(
    app: tauri::AppHandle<R>,
    publication_wake: mpsc::SyncSender<()>,
) {
    std::thread::spawn(move || {
        let storage = app.state::<AppStorage>().inner().clone();
        let mut owner = String::new();
        let mut task: Option<tauri::async_runtime::JoinHandle<Result<(), Error>>> = None;
        let (wake, hints) = mpsc::sync_channel(1);
        let healthy = Arc::new(AtomicBool::new(false));
        let mut retry = Instant::now();
        let mut backoff = 1u64;
        let mut fallback = false;
        let mut denied = false;
        let mut need_snapshot = true;
        while !STOP.load(Ordering::Acquire) {
            let config = runtime::config(&storage).ok().flatten();
            let active = config.as_ref().filter(|c| !c.paused);
            let next = active.map(identity).unwrap_or_default();
            if next != owner {
                if let Some(handle) = task.take() {
                    handle.abort();
                    let _ = tauri::async_runtime::block_on(handle);
                }
                owner = next;
                backoff = 1;
                retry = Instant::now();
                fallback = false;
                denied = false;
                need_snapshot = true;
                while hints.try_recv().is_ok() {}
            }
            let Some(c) = active else {
                if config.is_some() {
                    state(&app, &storage, "off");
                }
                std::thread::sleep(Duration::from_millis(200));
                continue;
            };
            let changed = hints.try_recv().is_ok();
            if changed {
                need_snapshot = true;
            }
            if healthy.swap(false, Ordering::AcqRel) {
                backoff = 1;
                state(&app, &storage, "live");
            }
            if task.as_ref().is_some_and(|t| t.inner().is_finished()) {
                let result = tauri::async_runtime::block_on(task.take().unwrap()).ok();
                match result {
                    Some(Err(Error::Denied)) => {
                        denied = true;
                        product::revoke_control_identity(&storage, c);
                        state(&app, &storage, "denied");
                    }
                    Some(Err(Error::Unsupported)) => {
                        fallback = true;
                        state(&app, &storage, "unsupported");
                    }
                    _ => state(&app, &storage, "offline"),
                }
                let jitter = runtime::now().unwrap_or(0) % 251;
                retry = Instant::now()
                    + Duration::from_millis(if fallback {
                        55_000 + jitter * 10
                    } else {
                        backoff * 1000 + jitter
                    });
                backoff = (backoff * 2).min(30);
                need_snapshot = true;
            }
            if !denied
                && (changed || (Instant::now() >= retry && (need_snapshot || task.is_none())))
            {
                let before = runtime::store(&storage)
                    .ok()
                    .and_then(|s| s.control_cache(&owner).ok().flatten());
                match product::refresh_catalog(&storage, true) {
                    Ok(value) => {
                        // The pull may have raced a pause/reconfiguration.
                        if runtime::config(&storage)
                            .ok()
                            .flatten()
                            .as_ref()
                            .filter(|v| !v.paused)
                            .map(identity)
                            .as_deref()
                            != Some(owner.as_str())
                        {
                            continue;
                        }
                        let after = runtime::store(&storage)
                            .ok()
                            .and_then(|s| s.control_cache(&owner).ok().flatten());
                        if before != after {
                            let _ = app.emit(
                                "shared-catalog-invalidated",
                                json!({"state":if fallback {"unsupported"} else {"live"}}),
                            );
                        }
                        need_snapshot = false;
                        if task.is_none() && !fallback {
                            match Watermark::from_catalog(&value, c) {
                                Ok(mark) => {
                                    match stream(
                                        c,
                                        &storage,
                                        mark,
                                        wake.clone(),
                                        publication_wake.clone(),
                                        healthy.clone(),
                                    ) {
                                        Ok(handle) => {
                                            task = Some(handle);
                                            state(&app, &storage, "connecting");
                                        }
                                        Err(_) => {
                                            retry = Instant::now() + Duration::from_secs(backoff);
                                            backoff = (backoff * 2).min(30);
                                        }
                                    }
                                }
                                Err(_) => {
                                    fallback = true;
                                    state(&app, &storage, "unsupported");
                                }
                            }
                        }
                        if fallback {
                            retry = Instant::now()
                                + Duration::from_secs(55 + runtime::now().unwrap_or(0) % 5);
                        }
                    }
                    Err(error) => {
                        if runtime::config(&storage)
                            .ok()
                            .flatten()
                            .as_ref()
                            .filter(|v| !v.paused)
                            .map(identity)
                            .as_deref()
                            != Some(owner.as_str())
                        {
                            continue;
                        }
                        if error == "Shared resource access denied or revoked" {
                            if let Some(handle) = task.take() {
                                handle.abort();
                                let _ = tauri::async_runtime::block_on(handle);
                            }
                            denied = true;
                            product::revoke_control_identity(&storage, c);
                            state(&app, &storage, "denied");
                        } else {
                            state(&app, &storage, "offline");
                            retry = Instant::now() + Duration::from_secs(backoff);
                            backoff = (backoff * 2).min(30);
                        }
                    }
                }
            }
            std::thread::sleep(Duration::from_millis(100));
        }
        if let Some(handle) = task {
            handle.abort();
            let _ = tauri::async_runtime::block_on(handle);
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn parser_splits_utf8_crlf_multiline_and_ignores_comments() {
        let bytes=": heartbeat\r\nevent: control\r\nid: abc:1\r\ndata: {\"name\":\"ñ\",\r\ndata: \"n\":1}\r\n\r\n".as_bytes();
        for split in 0..bytes.len() {
            let mut parser = Parser::default();
            let mut frames = Vec::new();
            parser
                .push(&bytes[..split], |k, d, i| {
                    frames.push((k.to_string(), d.to_string(), i.to_string()));
                    Ok(())
                })
                .unwrap();
            parser
                .push(&bytes[split..], |k, d, i| {
                    frames.push((k.to_string(), d.to_string(), i.to_string()));
                    Ok(())
                })
                .unwrap();
            assert_eq!(frames.len(), 1);
            assert_eq!(frames[0].2, "abc:1");
            assert_eq!(
                serde_json::from_str::<Value>(&frames[0].1).unwrap()["name"],
                "ñ"
            );
        }
    }
    #[test]
    fn parser_bounds_unknown_frames_and_decimal_is_u64() {
        assert_eq!(decimal("18446744073709551615").unwrap(), u64::MAX);
        assert!(decimal("01").is_err());
        assert!(decimal("18446744073709551616").is_err());
        let mut p = Parser::default();
        assert_eq!(
            p.push(&vec![b'a'; 4097], |_, _, _| Ok(())),
            Err(Error::TooLarge)
        );
        let mut p = Parser::default();
        assert!(p.push(&[0xff, b'\n'], |_, _, _| Ok(())).is_err());
    }
}
