//! Host-owned OIDC/device onboarding. Public UI intentions cannot supply account
//! identity, credentials, public keys or wire packets. Only a deliberately shown
//! recovery code crosses the Settings boundary; it never enters clipboard/Actions.
use super::{
    config::{self, StoredConfig},
    crypto::{self, ChannelKey, DeviceSigner, Entropy, Sensitive, SystemEntropy},
    custody::{KeyKind, Vault},
    enrollment::EnrollmentKey,
    product, runtime,
    transport::{self, RelayClient},
};
use crate::storage::AppStorage;
use base64::{
    engine::general_purpose::{STANDARD, URL_SAFE_NO_PAD},
    Engine,
};
use chacha20poly1305::{
    aead::{Aead, KeyInit, Payload},
    Key, XChaCha20Poly1305,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;

const DOMAIN: &[u8] = b"Copicu.shared.identity.v3\0";
const RECOVERY_REFERENCE: &str = "account_recovery_v3";
const SERVICE_ENDPOINT: &str = "https://sharing.jpsala.dev/";

fn fixed_service_endpoint(endpoint: &str, allow_loopback: bool) -> Result<String, String> {
    let url = reqwest::Url::parse(endpoint).map_err(|_| "Invalid internal sharing endpoint")?;
    let fixture = allow_loopback
        && url.scheme() == "http"
        && url
            .host_str()
            .is_some_and(|host| matches!(host, "127.0.0.1" | "[::1]"));
    if (url.as_str() != SERVICE_ENDPOINT && !fixture)
        || !url.username().is_empty()
        || url.password().is_some()
        || url.path() != "/"
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err(
            "Copicu Sharing uses its internal service. Retry with the current application.".into(),
        );
    }
    Ok(url.into())
}

pub(crate) fn service_endpoint() -> Result<String, String> {
    #[cfg(debug_assertions)]
    if let Ok(endpoint) = std::env::var("COPICU_SHARED_IDENTITY_ENDPOINT") {
        return fixed_service_endpoint(&endpoint, allowed_loopback());
    }
    Ok(SERVICE_ENDPOINT.into())
}
#[cfg(all(test, windows))]
#[path = "identity_integration.rs"]
mod integration;
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct LocalIdentity {
    config: StoredConfig,
    state: String,
    session_id: String,
    name: String,
    person_id: Option<String>,
    recovery_digest: Option<String>,
    #[serde(default)]
    replaces_device_id: Option<String>,
    #[serde(default)]
    replaces_person_id: Option<String>,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RecoveryKey {
    resource_id: String,
    epoch: u64,
    key: String,
}
impl Drop for RecoveryKey {
    fn drop(&mut self) {
        unsafe {
            self.key.as_bytes_mut().fill(0);
        }
    }
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RecoveryManifest {
    version: u8,
    endpoint: String,
    environment: String,
    person_id: String,
    keys: Vec<RecoveryKey>,
}
fn fail(_: impl std::fmt::Debug) -> String {
    "Cannot access protected sharing identity".into()
}
fn remote(e: transport::Error) -> String {
    match e {
        transport::Error::Denied => {
            "Sign-in or device access was denied. Check account admission or device approval."
        }
        transport::Error::Expired => "Sign-in expired or was cancelled. Start sign-in again.",
        transport::Error::Conflict => {
            "The account or clipboard changed. Refresh and review before retrying."
        }
        transport::Error::Unsupported => {
            "Copicu Sharing cannot complete device sign-in. Update Copicu and retry."
        }
        transport::Error::Quota => "The service reached its account or device limit.",
        _ => return format!("Cannot reach Copicu Sharing at {SERVICE_ENDPOINT}. Check your internet connection and retry."),
    }
    .into()
}
fn load(storage: &AppStorage) -> Result<Option<LocalIdentity>, String> {
    runtime::store(storage)?
        .identity_json()
        .map_err(fail)?
        .map(|s| serde_json::from_str(&s).map_err(fail))
        .transpose()
}
fn save(storage: &AppStorage, state: &LocalIdentity) -> Result<(), String> {
    runtime::store(storage)?
        .save_identity(&serde_json::to_string(state).map_err(fail)?)
        .map_err(fail)
}
fn bytes(value: &Value) -> Result<Vec<u8>, String> {
    let mut value = value.clone();
    let map = value.as_object_mut().ok_or("Invalid device intention")?;
    map.remove("signature");
    map.remove("recoverySignature");
    let mut bytes = DOMAIN.to_vec();
    bytes.extend(serde_json::to_vec(&value).map_err(fail)?);
    Ok(bytes)
}
fn signed(vault: &Vault, c: &StoredConfig, mut value: Value) -> Result<Value, String> {
    value["signature"] = json!(STANDARD.encode(runtime::signer(vault, c)?.sign(&bytes(&value)?)));
    Ok(value)
}
fn random_secret() -> Result<Sensitive, String> {
    let mut value = Sensitive(vec![0; 32]);
    SystemEntropy.fill(&mut value.0).map_err(fail)?;
    Ok(Sensitive(URL_SAFE_NO_PAD.encode(&value.0).into_bytes()))
}
fn text(value: &Sensitive) -> Result<&str, String> {
    std::str::from_utf8(&value.0).map_err(fail)
}
fn credential(vault: &Vault, c: &StoredConfig, reference: &str) -> Result<Sensitive, String> {
    vault
        .load_credential(&runtime::binding(c, KeyKind::Credential, reference, 1))
        .map_err(fail)
}
fn allowed_loopback() -> bool {
    cfg!(test)
        || (cfg!(debug_assertions)
            && std::env::var("COPICU_SHARED_IDENTITY_LOOPBACK").as_deref() == Ok("1"))
}
fn start_wire(state: &LocalIdentity, vault: &Vault) -> Result<Value, String> {
    let c = &state.config;
    let verifier = credential(vault, c, "identity_verifier_v3")?;
    let browser = credential(vault, c, "identity_browser_v3")?;
    let bearer = credential(vault, c, &c.bearer_reference)?;
    let kem = vault
        .load_enrollment(&runtime::binding(
            c,
            KeyKind::Enrollment,
            "product_enrollment_v2",
            1,
        ))
        .map_err(fail)?;
    signed(
        vault,
        c,
        json!({"sessionId":state.session_id,"environment":c.environment,"endpoint":c.endpoint,"deviceId":c.device_id,"name":state.name,"signingPublicKey":STANDARD.encode(runtime::signer(vault,c)?.public()),"kemPublicKey":STANDARD.encode(kem.public()),"tokenHash":config::hex(&Sha256::digest(&bearer.0)),"challenge":URL_SAFE_NO_PAD.encode(Sha256::digest(&verifier.0)),"browserChallenge":URL_SAFE_NO_PAD.encode(Sha256::digest(&browser.0))}),
    )
}
fn browser_url(state: &LocalIdentity, vault: &Vault) -> Result<String, String> {
    let mut url = reqwest::Url::parse(&state.config.endpoint)
        .map_err(fail)?
        .join("v3/auth/browser")
        .map_err(fail)?;
    let ticket = credential(vault, &state.config, "identity_browser_v3")?;
    url.query_pairs_mut()
        .append_pair("session", &state.session_id)
        .append_pair("ticket", text(&ticket)?);
    Ok(url.into())
}
pub(crate) fn start(storage: &AppStorage, endpoint: &str, name: &str) -> Result<Value, String> {
    let endpoint = fixed_service_endpoint(endpoint, allowed_loopback())?;
    let endpoint = endpoint.as_str();
    let _network = runtime::NETWORK.lock().map_err(fail)?;
    let previous_config = runtime::config(storage)?;
    let previous_state = load(storage)?;
    let relinking = previous_config.is_some()
        && previous_state.as_ref().is_some_and(|s| {
            s.state == "revoked"
                || (s.replaces_device_id.is_some()
                    && matches!(
                        s.state.as_str(),
                        "waiting" | "pending" | "expired" | "cancelled"
                    ))
        });
    if previous_config.is_some() && !relinking {
        return Err("This profile is already linked. Manage its devices below.".into());
    }
    let name = name.trim();
    if name.is_empty() || name.len() > 80 || name.chars().any(char::is_control) {
        return Err("Choose a device name of up to 80 characters".into());
    }
    let discovery = RelayClient::new(
        endpoint,
        "onboarding",
        "onboarding",
        &"0".repeat(43),
        allowed_loopback(),
    )
    .map_err(|_| "Cannot use the internal sharing service. Update Copicu and retry.".to_string())?;
    let info = discovery
        .request_identity("GET", "/v3/info", None)
        .map_err(remote)?;
    let environment = info["environment"]
        .as_str()
        .filter(|v| crypto::valid_id(v))
        .ok_or("Invalid sharing service identity")?;
    let endpoint = reqwest::Url::parse(endpoint).map_err(fail)?.to_string();
    if relinking
        && previous_config.as_ref().is_some_and(|c| {
            c.endpoint != endpoint
                || c.environment != environment
                || info["issuerPublicKey"] != c.issuer_public_key
        })
    {
        return Err(
            "Relink this profile to its original service. Use a new profile for another service."
                .into(),
        );
    }
    if info["version"] != 3 || info["identity"] != "oidc" || info["endpoint"] != endpoint {
        return Err("This URL is not the configured sign-in service".into());
    }
    let issuer = info["issuerPublicKey"]
        .as_str()
        .ok_or("Missing service signing identity")?;
    let issuer_key = config::bytes32(issuer)?;
    let vk = ed25519_dalek::VerifyingKey::from_bytes(&issuer_key).map_err(fail)?;
    if vk.is_weak() {
        return Err("Invalid service signing identity".into());
    }
    let state = if let Some(state) = load(storage)?.filter(|s| s.state == "waiting") {
        if state.config.endpoint != endpoint
            || state.config.environment != environment
            || state.config.issuer_public_key != issuer
            || state.name != name
        {
            return Err("Cancel the pending sign-in before changing service or device".into());
        }
        state
    } else {
        let _worker = runtime::WORKER.lock().map_err(fail)?;
        let store = runtime::store(storage)?;
        let vault_name = runtime::random_id("shared_vault")?;
        let vault = Vault::create(store.profile_dir(), &vault_name).map_err(fail)?;
        let c:StoredConfig=serde_json::from_value(json!({"environment":environment,"deviceId":runtime::random_id("device")?,"endpoint":endpoint,"allowLoopback":allowed_loopback(),"issuerPublicKey":issuer,"enrollmentFingerprint":"oidc_v3","vaultName":vault_name,"signingReference":"device_signing","bearerReference":"relay_credential","paused":false,"sendPaused":false,"receivePaused":false,"connections":[],"connectionVersion":1,"generalSendScope":"unfiled","actionTargets":{},"sendActiveShortcut":null,"sendClipboardShortcut":null,"channels":[]})).map_err(fail)?;
        vault
            .store_signer(
                &runtime::binding(&c, KeyKind::Signing, &c.signing_reference, 1),
                &DeviceSigner::generate(&mut SystemEntropy).map_err(fail)?,
            )
            .map_err(fail)?;
        vault
            .store_enrollment(
                &runtime::binding(&c, KeyKind::Enrollment, "product_enrollment_v2", 1),
                &EnrollmentKey::generate(&mut SystemEntropy).map_err(fail)?,
            )
            .map_err(fail)?;
        for reference in [
            &c.bearer_reference,
            "identity_verifier_v3",
            "identity_browser_v3",
        ] {
            let value = random_secret()?;
            vault
                .store_credential(
                    &runtime::binding(&c, KeyKind::Credential, reference, 1),
                    text(&value)?,
                )
                .map_err(fail)?;
        }
        let state = LocalIdentity {
            config: c,
            state: "waiting".into(),
            session_id: runtime::random_id("session")?,
            name: name.into(),
            person_id: None,
            recovery_digest: None,
            replaces_device_id: previous_config.as_ref().map(|c| c.device_id.clone()),
            replaces_person_id: previous_state
                .as_ref()
                .and_then(|s| s.replaces_person_id.clone().or_else(|| s.person_id.clone())),
        };
        save(storage, &state)?;
        state
    };
    let vault = runtime::vault(&runtime::store(storage)?, &state.config)?;
    runtime::client(&vault, &state.config)?
        .request_identity("POST", "/v3/auth/start", Some(&start_wire(&state, &vault)?))
        .map_err(remote)?;
    open_browser(&browser_url(&state, &vault)?)?;
    Ok(
        json!({"state":"waiting","endpoint":state.config.endpoint,"name":state.name,"deviceId":state.config.device_id,"devices":[]}),
    )
}
fn activate(storage: &AppStorage, state: &mut LocalIdentity) -> Result<(), String> {
    if state
        .replaces_person_id
        .as_ref()
        .is_some_and(|p| Some(p) != state.person_id.as_ref())
    {
        return Err(
            "Sign in with this profile's original account. Use a new profile for another account."
                .into(),
        );
    }
    let _barrier = crate::shared_native::EFFECT_BARRIER.lock().map_err(fail)?;
    let _worker = runtime::WORKER.lock().map_err(fail)?;
    let latest = load(storage)?.ok_or("Sign-in was cancelled")?;
    if latest.session_id != state.session_id || latest.state == "cancelled" {
        return Err("Sign-in changed during request".into());
    }
    if let Some(c) = runtime::config(storage)? {
        if c.device_id != state.config.device_id || c.endpoint != state.config.endpoint {
            if state.replaces_device_id.as_deref() != Some(c.device_id.as_str())
                || !(c.send_paused && c.receive_paused)
            {
                return Err("Another device identity is already linked".into());
            }
            runtime::store(storage)?
                .activate_relinked_identity(
                    &c.device_id,
                    &state.config.environment,
                    &state.config.device_id,
                    &serde_json::to_string(&state.config).map_err(fail)?,
                )
                .map_err(fail)?;
        }
    } else {
        runtime::save(&runtime::store(storage)?, &state.config)?;
    }
    state.state = "active".into();
    save(storage, state)
}
fn public(mut raw: Value, state: &LocalIdentity, vault: &Vault) -> Value {
    raw["endpoint"] = json!(state.config.endpoint);
    raw["name"] = json!(state.name);
    raw["recoveryReady"] = json!(!raw["recovery"].is_null());
    raw["localRecoveryCode"] = json!(credential(vault, &state.config, RECOVERY_REFERENCE).is_ok());
    raw.as_object_mut().map(|m| m.remove("recovery"));
    if let Some(devices) = raw["devices"].as_array_mut() {
        for d in devices {
            if let Some(m) = d.as_object_mut() {
                m.remove("signingPublicKey");
                m.remove("kemPublicKey");
            }
        }
    }
    raw
}
fn status_locked(storage: &AppStorage) -> Result<Value, String> {
    let Some(mut state) = load(storage)? else {
        return Ok(
            json!({"state":if runtime::config(storage)?.is_some(){"technical"}else{"unconfigured"},"devices":[]}),
        );
    };
    if matches!(state.state.as_str(), "cancelled" | "expired" | "revoked") {
        return Ok(
            json!({"state":state.state,"endpoint":state.config.endpoint,"name":state.name,"devices":[]}),
        );
    }
    let vault = runtime::vault(&runtime::store(storage)?, &state.config)?;
    let client = runtime::client(&vault, &state.config)?;
    let result = if state.state == "waiting" {
        let verifier = credential(&vault, &state.config, "identity_verifier_v3")?;
        client.request_identity(
            "POST",
            "/v3/auth/poll",
            Some(&signed(
                &vault,
                &state.config,
                json!({"sessionId":state.session_id,"verifier":text(&verifier)?}),
            )?),
        )
    } else {
        client.request_identity("GET", "/v3/identity", None)
    };
    let raw = match result {
        Ok(value) => value,
        Err(e) => {
            if e == transport::Error::Expired {
                state.state = "expired".into();
                save(storage, &state)?;
            } else if e == transport::Error::Denied && state.state != "waiting" {
                state.state = "revoked".into();
                save(storage, &state)?;
                if let Some(c) = runtime::config(storage)? {
                    product::revoke_control_identity(storage, &c);
                    pause_local(storage)?;
                }
            }
            return Ok(
                json!({"state":if e==transport::Error::Unavailable{"offline"}else{&state.state},"previousState":state.state,"endpoint":state.config.endpoint,"name":state.name,"error":remote(e),"devices":[]}),
            );
        }
    };
    if raw["state"] == "waiting" {
        return Ok(
            json!({"state":"waiting","endpoint":state.config.endpoint,"name":state.name,"devices":[]}),
        );
    }
    if raw["deviceId"] != state.config.device_id {
        return Err("Sign-in device identity mismatch".into());
    }
    let person = raw["personId"]
        .as_str()
        .filter(|s| crypto::valid_id(s))
        .ok_or("Missing authenticated account")?;
    if state.person_id.as_deref().is_some_and(|p| p != person) {
        return Err("Sign-in account identity changed".into());
    }
    state.person_id = Some(person.into());
    state.config.enrollment_fingerprint = raw["fingerprint"]
        .as_str()
        .ok_or("Missing device fingerprint")?
        .into();
    if raw["state"] == "active" {
        let newly = state.state != "active";
        activate(storage, &mut state)?;
        if newly {
            product::refresh_catalog(storage, false)?;
        }
    } else if raw["state"] == "pending" {
        state.state = "pending".into();
        save(storage, &state)?;
    } else {
        return Err("Unknown service enrollment state".into());
    }
    Ok(public(raw, &state, &vault))
}
pub(crate) fn status(storage: &AppStorage) -> Result<Value, String> {
    let _network = runtime::NETWORK.lock().map_err(fail)?;
    status_locked(storage)
}
pub(crate) fn cancel(storage: &AppStorage) -> Result<Value, String> {
    let _network = runtime::NETWORK.lock().map_err(fail)?;
    let mut state = load(storage)?.ok_or("No sign-in is pending")?;
    if !matches!(state.state.as_str(), "waiting" | "pending" | "expired") {
        return Err("Only a pending sign-in can be cancelled".into());
    }
    let vault = runtime::vault(&runtime::store(storage)?, &state.config)?;
    let verifier = credential(&vault, &state.config, "identity_verifier_v3")?;
    let input = signed(
        &vault,
        &state.config,
        json!({"sessionId":state.session_id,"verifier":text(&verifier)?}),
    )?;
    runtime::client(&vault, &state.config)?
        .request_identity("POST", "/v3/auth/cancel", Some(&input))
        .map_err(remote)?;
    state.state = "cancelled".into();
    save(storage, &state)?;
    Ok(json!({"state":"cancelled","devices":[]}))
}
pub(crate) fn reopen(storage: &AppStorage) -> Result<Value, String> {
    let _network = runtime::NETWORK.lock().map_err(fail)?;
    let state = load(storage)?.ok_or("Start sign-in first")?;
    if state.state != "waiting" {
        return Err("There is no browser sign-in to open".into());
    }
    let vault = runtime::vault(&runtime::store(storage)?, &state.config)?;
    runtime::client(&vault, &state.config)?
        .request_identity("POST", "/v3/auth/start", Some(&start_wire(&state, &vault)?))
        .map_err(remote)?;
    open_browser(&browser_url(&state, &vault)?)?;
    Ok(json!({"state":"waiting","endpoint":state.config.endpoint,"name":state.name,"devices":[]}))
}
fn durable_action(
    storage: &AppStorage,
    c: &StoredConfig,
    operation_id: &str,
    input_digest: &str,
    wire: Value,
) -> Result<Value, String> {
    if !crypto::valid_id(operation_id) {
        return Err("Invalid device operation ID".into());
    }
    let store = runtime::store(storage)?;
    let id = format!(
        "{}_{}",
        &config::hex(&Sha256::digest(c.device_id.as_bytes()))[..16],
        operation_id
    );
    let wire = if let Some(saved) = store.identity_intent(&id).map_err(fail)? {
        let saved: Value = serde_json::from_str(&saved).map_err(fail)?;
        if saved["inputDigest"] != input_digest {
            return Err("Device operation ID was reused with different input".into());
        }
        saved["wire"].clone()
    } else {
        store
            .save_identity_intent(
                &id,
                &json!({"inputDigest":input_digest,"wire":wire}).to_string(),
            )
            .map_err(fail)?;
        wire
    };
    let vault = runtime::vault(&store, c)?;
    runtime::client(&vault, c)?
        .request_identity("POST", "/v3/identity/actions", Some(&wire))
        .map_err(remote)
}
fn resource_packets(
    c: &StoredConfig,
    vault: &Vault,
    catalog: &Value,
    target: &Value,
) -> Result<Vec<Value>, String> {
    let signer = runtime::signer(vault, c)?;
    let mut resources = Vec::new();
    for resource in catalog["resources"]
        .as_array()
        .ok_or("Invalid resource catalog")?
    {
        let rid = resource["id"].as_str().ok_or("Invalid resource ID")?;
        let Some(ch) = c.channels.iter().find(|ch| ch.policy.id == rid) else {
            continue;
        };
        if resource["keyEpoch"] != ch.epoch.to_string() {
            continue;
        }
        let mut keys = vec![(ch.epoch, runtime::key(vault, c, ch)?)];
        for old in resource["retainedEpochs"]
            .as_array()
            .ok_or("Invalid historical epochs")?
        {
            let epoch = old
                .as_str()
                .and_then(|s| s.parse::<u64>().ok())
                .ok_or("Invalid historical epoch")?;
            if epoch == ch.epoch {
                continue;
            }
            if let Ok(key) = vault.load_channel(&runtime::binding(
                c,
                KeyKind::Channel {
                    channel: rid.into(),
                },
                &product::epoch_reference(rid, epoch),
                epoch,
            )) {
                keys.push((epoch, key));
            }
        }
        let packets = keys
            .iter()
            .map(|(epoch, key)| {
                product::product_crypto::wrap(
                    &c.environment,
                    rid,
                    *epoch,
                    key,
                    &signer,
                    &c.device_id,
                    target,
                    &mut SystemEntropy,
                )
            })
            .collect::<Result<Vec<_>, String>>()?;
        resources.push(json!({"resourceId":rid,"revision":resource["revision"],"epoch":ch.epoch.to_string(),"packages":packets}));
    }
    Ok(resources)
}
pub(crate) fn device_action(storage: &AppStorage, input: Value) -> Result<Value, String> {
    let _network = runtime::NETWORK.lock().map_err(fail)?;
    if input.as_object().is_none_or(|m| {
        m.keys().any(|k| {
            ![
                "kind",
                "operationId",
                "deviceId",
                "fingerprint",
                "expectedRevision",
            ]
            .contains(&k.as_str())
        })
    }) {
        return Err("Invalid device action fields".into());
    }
    let kind = input["kind"].as_str().ok_or("Missing device action")?;
    if !["approve", "revoke"].contains(&kind) {
        return Err("Unsupported device action".into());
    }
    let operation_id = input["operationId"]
        .as_str()
        .ok_or("Missing device operation ID")?;
    let state = load(storage)?
        .filter(|s| s.state == "active")
        .ok_or("Device sign-in is required")?;
    let c = runtime::required(storage)?;
    let vault = runtime::vault(&runtime::store(storage)?, &c)?;
    let digest = config::hex(&Sha256::digest(serde_json::to_vec(&input).map_err(fail)?));
    let saved_id = format!(
        "{}_{}",
        &config::hex(&Sha256::digest(c.device_id.as_bytes()))[..16],
        operation_id
    );
    let result = if runtime::store(storage)?
        .identity_intent(&saved_id)
        .map_err(fail)?
        .is_some()
    {
        durable_action(storage, &c, operation_id, &digest, Value::Null)?
    } else {
        let account = runtime::client(&vault, &c)?
            .request_identity("GET", "/v3/identity", None)
            .map_err(remote)?;
        if input["expectedRevision"] != account["revision"] {
            return Err("Device list changed. Refresh and compare its fingerprint again.".into());
        }
        let target = account["devices"]
            .as_array()
            .and_then(|v| v.iter().find(|d| d["deviceId"] == input["deviceId"]))
            .ok_or("Device request is no longer available")?;
        if input["fingerprint"] != target["fingerprint"]
            || target["personId"] != state.person_id.as_deref().unwrap_or("")
        {
            return Err("Device fingerprint does not match this account".into());
        }
        let mut wire = input.clone();
        if kind == "approve" {
            product::refresh_catalog(storage, false)?;
            let c = runtime::required(storage)?;
            let catalog = product::raw_catalog(&vault, &c)?;
            wire["resources"] = json!(resource_packets(&c, &vault, &catalog, target)?);
        }
        durable_action(
            storage,
            &c,
            operation_id,
            &digest,
            signed(&vault, &c, wire)?,
        )?
    };
    if kind == "revoke" && input["deviceId"] == c.device_id {
        product::revoke_control_identity(storage, &c);
        pause_local(storage)?;
        let mut state = state;
        state.state = "revoked".into();
        save(storage, &state)?;
        return Ok(json!({"state":"revoked","devices":[],"result":result}));
    }
    if kind == "approve" {
        product::refresh_catalog(storage, false)?;
    }
    let mut status = status_locked(storage)?;
    status["result"] = result;
    Ok(status)
}
fn pause_local(storage: &AppStorage) -> Result<(), String> {
    let heads = runtime::prepare_receive_resume(storage, None, Some(true))?;
    let _barrier = crate::shared_native::EFFECT_BARRIER.lock().map_err(fail)?;
    runtime::set_flow_paused_with_heads(storage, None, Some(true), Some(true), heads)?;
    Ok(())
}
fn recovery_signer(code: &str) -> Result<DeviceSigner, String> {
    let code = code.trim().replace(' ', "").replace('-', "");
    // Code presentation uses hex so stripping separators cannot alter base64url.
    if code.len() != 64 || !code.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err("Enter the complete 64-character recovery code".into());
    }
    let mut seed = Sensitive(Vec::with_capacity(32));
    for i in (0..64).step_by(2) {
        seed.0
            .push(u8::from_str_radix(&code[i..i + 2], 16).map_err(fail)?);
    }
    DeviceSigner::restore_secret(seed).map_err(fail)
}
fn recovery_aad(c: &StoredConfig, person: &str) -> Vec<u8> {
    let mut aad = b"Copicu.shared.recovery.v3\0".to_vec();
    aad.extend(
        serde_json::to_vec(
            &json!({"endpoint":c.endpoint,"environment":c.environment,"personId":person}),
        )
        .expect("static JSON"),
    );
    aad
}
fn recovery_cipher(signer: &DeviceSigner) -> Result<XChaCha20Poly1305, String> {
    let seed = signer.export_secret();
    let mut hash = Sha256::new();
    hash.update(b"Copicu.shared.recovery-encryption.v3\0");
    hash.update(&seed.0);
    let key = Sensitive(hash.finalize().to_vec());
    let key: &Key = key.0.as_slice().try_into().map_err(fail)?;
    Ok(XChaCha20Poly1305::new(key))
}
fn decrypt_recovery(
    c: &StoredConfig,
    person: &str,
    signer: &DeviceSigner,
    blob: &Value,
) -> Result<RecoveryManifest, String> {
    let nonce = STANDARD
        .decode(
            blob["nonce"]
                .as_str()
                .ok_or("Recovery snapshot is unavailable")?,
        )
        .map_err(fail)?;
    if nonce.len() != 24 {
        return Err("Invalid recovery snapshot".into());
    }
    let cipher = STANDARD
        .decode(
            blob["ciphertext"]
                .as_str()
                .ok_or("Recovery snapshot is unavailable")?,
        )
        .map_err(fail)?;
    if cipher.len() > 1048576 {
        return Err("Recovery snapshot is too large".into());
    }
    let clear = Sensitive(
        recovery_cipher(signer)?
            .decrypt(
                nonce.as_slice().try_into().map_err(fail)?,
                Payload {
                    msg: &cipher,
                    aad: &recovery_aad(c, person),
                },
            )
            .map_err(|_| "Recovery code cannot authenticate this account snapshot")?,
    );
    let manifest: RecoveryManifest = serde_json::from_slice(&clear.0).map_err(fail)?;
    if manifest.version != 1
        || manifest.endpoint != c.endpoint
        || manifest.environment != c.environment
        || manifest.person_id != person
        || manifest.keys.len() > 16384
    {
        return Err("Recovery snapshot belongs to another account or service".into());
    }
    Ok(manifest)
}
pub(super) fn backup(
    storage: &AppStorage,
    c: &StoredConfig,
    vault: &Vault,
    catalog: &Value,
) -> Result<(), String> {
    let Some(mut state) =
        load(storage)?.filter(|s| s.state == "active" && s.config.device_id == c.device_id)
    else {
        return Ok(());
    };
    let Ok(code) = credential(vault, c, RECOVERY_REFERENCE) else {
        return Ok(());
    };
    let signer = recovery_signer(text(&code)?)?;
    let person = state
        .person_id
        .as_deref()
        .ok_or("Missing recovery account")?;
    let client = runtime::client(vault, c)?;
    let account = client
        .request_identity("GET", "/v3/identity", None)
        .map_err(remote)?;
    let recovery = &account["recovery"];
    if !recovery.is_null() && recovery["publicKey"] != STANDARD.encode(signer.public()) {
        return Err("Recovery key changed. Review the saved code.".into());
    }
    let mut values: BTreeMap<(String, u64), String> = BTreeMap::new();
    if !recovery.is_null() {
        for key in &decrypt_recovery(c, person, &signer, &recovery["blob"])?.keys {
            values.insert((key.resource_id.clone(), key.epoch), key.key.clone());
        }
    }
    let resources = catalog["resources"]
        .as_array()
        .ok_or("Missing authorized recovery resources")?;
    values.retain(|(rid, epoch), _| {
        resources.iter().any(|r| {
            r["id"] == *rid
                && (r["keyEpoch"] == epoch.to_string()
                    || r["retainedEpochs"]
                        .as_array()
                        .is_some_and(|v| v.iter().any(|e| e == &json!(epoch.to_string()))))
        })
    });
    for r in resources {
        let rid = r["id"].as_str().ok_or("Invalid recovery resource")?;
        let Some(ch) = c.channels.iter().find(|ch| ch.policy.id == rid) else {
            continue;
        };
        let mut epochs = r["retainedEpochs"].as_array().cloned().unwrap_or_default();
        epochs.push(json!(ch.epoch.to_string()));
        for e in epochs {
            let epoch = e
                .as_str()
                .and_then(|s| s.parse::<u64>().ok())
                .ok_or("Invalid recovery epoch")?;
            let key = if epoch == ch.epoch {
                runtime::key(vault, c, ch)
            } else {
                vault
                    .load_channel(&runtime::binding(
                        c,
                        KeyKind::Channel {
                            channel: rid.into(),
                        },
                        &product::epoch_reference(rid, epoch),
                        epoch,
                    ))
                    .map_err(fail)
            };
            if let Ok(key) = key {
                values.insert((rid.into(), epoch), STANDARD.encode(key.secret()));
            }
        }
    }
    let manifest = RecoveryManifest {
        version: 1,
        endpoint: c.endpoint.clone(),
        environment: c.environment.clone(),
        person_id: person.into(),
        keys: values
            .into_iter()
            .map(|((resource_id, epoch), key)| RecoveryKey {
                resource_id,
                epoch,
                key,
            })
            .collect(),
    };
    let clear = Sensitive(serde_json::to_vec(&manifest).map_err(fail)?);
    let digest = config::hex(&Sha256::digest(&clear.0));
    if !recovery.is_null() {
        let existing = decrypt_recovery(c, person, &signer, &recovery["blob"])?;
        let prior = Sensitive(serde_json::to_vec(&existing).map_err(fail)?);
        if Sha256::digest(&prior.0) == Sha256::digest(&clear.0) {
            state.recovery_digest = Some(digest);
            save(storage, &state)?;
            return Ok(());
        }
    }
    let mut nonce = [0; 24];
    SystemEntropy.fill(&mut nonce).map_err(fail)?;
    let ciphertext = recovery_cipher(&signer)?
        .encrypt(
            nonce.as_slice().try_into().map_err(fail)?,
            Payload {
                msg: &clear.0,
                aad: &recovery_aad(c, person),
            },
        )
        .map_err(fail)?;
    let wire = signed(
        vault,
        c,
        json!({"operationId":runtime::random_id("recovery_snapshot")?,"kind":"recovery_save","expectedRevision":account["revision"],"recoveryRevision":if recovery.is_null(){json!("0")}else{recovery["revision"].clone()},"publicKey":STANDARD.encode(signer.public()),"blob":{"nonce":STANDARD.encode(nonce),"ciphertext":STANDARD.encode(ciphertext)}}),
    )?;
    client
        .request_identity("POST", "/v3/identity/actions", Some(&wire))
        .map_err(remote)?;
    state.recovery_digest = Some(digest);
    save(storage, &state)
}
pub(crate) fn setup_recovery(
    storage: &AppStorage,
    existing: Option<&str>,
) -> Result<Value, String> {
    let _network = runtime::NETWORK.lock().map_err(fail)?;
    let state = load(storage)?
        .filter(|s| s.state == "active")
        .ok_or("Sign in and approve this device first")?;
    product::refresh_catalog(storage, false)?;
    let c = runtime::required(storage)?;
    let vault = runtime::vault(&runtime::store(storage)?, &c)?;
    let client = runtime::client(&vault, &c)?;
    let account = client
        .request_identity("GET", "/v3/identity", None)
        .map_err(remote)?;
    let code = if let Some(code) = existing {
        let signer = recovery_signer(code)?;
        let seed = signer.export_secret();
        Sensitive(config::hex(&seed.0).into_bytes())
    } else if let Ok(code) = credential(&vault, &c, RECOVERY_REFERENCE) {
        code
    } else {
        if !account["recovery"].is_null() {
            return Err(
                "Recovery already exists. Enter its saved code to update the snapshot on this PC."
                    .into(),
            );
        }
        let mut seed = Sensitive(vec![0; 32]);
        SystemEntropy.fill(&mut seed.0).map_err(fail)?;
        Sensitive(config::hex(&seed.0).into_bytes())
    };
    let signer = recovery_signer(text(&code)?)?;
    if !account["recovery"].is_null()
        && account["recovery"]["publicKey"] != STANDARD.encode(signer.public())
    {
        return Err("This code does not match the account recovery key".into());
    }
    vault
        .store_credential(
            &runtime::binding(&c, KeyKind::Credential, RECOVERY_REFERENCE, 1),
            text(&code)?,
        )
        .map_err(fail)?;
    let catalog = product::raw_catalog(&vault, &c)?;
    backup(storage, &c, &vault, &catalog)?;
    let mut result = status_locked(storage)?;
    result["code"] = json!(text(&code)?);
    result["name"] = json!(state.name);
    Ok(result)
}
pub(crate) fn recover(
    storage: &AppStorage,
    code: &str,
    operation_id: &str,
) -> Result<Value, String> {
    let _network = runtime::NETWORK.lock().map_err(fail)?;
    let mut state = load(storage)?
        .filter(|s| s.state == "pending")
        .ok_or("Sign in on this new device before recovering")?;
    let c = &state.config;
    let vault = runtime::vault(&runtime::store(storage)?, c)?;
    let client = runtime::client(&vault, c)?;
    let recovery_signer = recovery_signer(code)?;
    let person = state
        .person_id
        .as_deref()
        .ok_or("Missing authenticated account")?;
    let digest = config::hex(&Sha256::digest(bytes(
        &json!({"kind":"recover","operationId":operation_id,"personId":person,"deviceId":c.device_id,"recoveryPublicKey":STANDARD.encode(recovery_signer.public())}),
    )?));
    let intent_id = format!(
        "{}_{}",
        &config::hex(&Sha256::digest(c.device_id.as_bytes()))[..16],
        operation_id
    );
    if let Some(saved) = runtime::store(storage)?
        .identity_intent(&intent_id)
        .map_err(fail)?
    {
        let saved: Value = serde_json::from_str(&saved).map_err(fail)?;
        if saved["inputDigest"] != digest {
            return Err("Recovery operation ID was reused with different input".into());
        }
        persist_recovery_code(&vault, c, &recovery_signer)?;
        let result = durable_action(storage, c, operation_id, &digest, Value::Null)?;
        return finish_recovery(storage, &mut state, result);
    }
    let account = client
        .request_identity("GET", "/v3/identity", None)
        .map_err(remote)?;
    let recovery = &account["recovery"];
    if recovery["publicKey"] != STANDARD.encode(recovery_signer.public()) {
        return Err("This recovery code does not match the signed-in account".into());
    }
    let manifest = decrypt_recovery(c, person, &recovery_signer, &recovery["blob"])?;
    // Preserve the proven code before an ambiguous remote commit. Status can
    // then finish activation after a restart without discarding recovery custody.
    persist_recovery_code(&vault, c, &recovery_signer)?;
    let mut prepare = json!({"operationId":runtime::random_id("recovery_prepare")?,"kind":"recovery_prepare","expectedRevision":account["revision"],"recoveryRevision":recovery["revision"]});
    prepare["recoverySignature"] = json!(STANDARD.encode(recovery_signer.sign(&bytes(&prepare)?)));
    prepare = signed(&vault, c, prepare)?;
    let catalog = client
        .request_identity("POST", "/v3/identity/actions", Some(&prepare))
        .map_err(remote)?;
    let target = account["devices"]
        .as_array()
        .and_then(|v| v.iter().find(|d| d["deviceId"] == c.device_id))
        .ok_or("Missing recovery device identity")?;
    let signer = runtime::signer(&vault, c)?;
    let mut resources = Vec::new();
    for resource in catalog["resources"]
        .as_array()
        .ok_or("Missing recovery resource catalog")?
    {
        let rid = resource["id"].as_str().ok_or("Invalid recovery resource")?;
        let epoch = resource["keyEpoch"]
            .as_str()
            .and_then(|s| s.parse::<u64>().ok())
            .ok_or("Invalid recovery epoch")?;
        if !manifest
            .keys
            .iter()
            .any(|k| k.resource_id == rid && k.epoch == epoch)
        {
            continue;
        }
        let mut packets = Vec::new();
        for k in &manifest.keys {
            if k.resource_id != rid
                || (k.epoch != epoch
                    && !resource["retainedEpochs"]
                        .as_array()
                        .is_some_and(|v| v.contains(&json!(k.epoch.to_string()))))
            {
                continue;
            }
            let key = ChannelKey::from_secret(
                c.environment.clone(),
                rid.into(),
                k.epoch,
                config::secret32(&k.key)?,
            )
            .map_err(fail)?;
            packets.push(product::product_crypto::wrap(
                &c.environment,
                rid,
                k.epoch,
                &key,
                &signer,
                &c.device_id,
                target,
                &mut SystemEntropy,
            )?);
        }
        resources.push(json!({"resourceId":rid,"revision":resource["revision"],"epoch":epoch.to_string(),"packages":packets}));
    }
    let mut wire = json!({"kind":"recover","operationId":operation_id,"expectedRevision":account["revision"],"recoveryRevision":recovery["revision"],"resources":resources});
    wire["recoverySignature"] = json!(STANDARD.encode(recovery_signer.sign(&bytes(&wire)?)));
    wire = signed(&vault, c, wire)?;
    let result = durable_action(storage, c, operation_id, &digest, wire)?;
    finish_recovery(storage, &mut state, result)
}
fn persist_recovery_code(
    vault: &Vault,
    c: &StoredConfig,
    recovery_signer: &DeviceSigner,
) -> Result<(), String> {
    let seed = recovery_signer.export_secret();
    let code = Sensitive(config::hex(&seed.0).into_bytes());
    vault
        .store_credential(
            &runtime::binding(c, KeyKind::Credential, RECOVERY_REFERENCE, 1),
            text(&code)?,
        )
        .map_err(fail)
}
fn finish_recovery(
    storage: &AppStorage,
    state: &mut LocalIdentity,
    result: Value,
) -> Result<Value, String> {
    activate(storage, state)?;
    product::refresh_catalog(storage, false)?;
    let mut status = status_locked(storage)?;
    status["result"] = result;
    Ok(status)
}
#[cfg(all(windows, not(test)))]
fn open_browser(url: &str) -> Result<(), String> {
    use windows::{
        core::HSTRING,
        Win32::{
            Foundation::HWND,
            UI::{Shell::ShellExecuteW, WindowsAndMessaging::SW_SHOWNORMAL},
        },
    };
    let result = unsafe {
        ShellExecuteW(
            Some(HWND::default()),
            &HSTRING::from("open"),
            &HSTRING::from(url),
            None,
            None,
            SW_SHOWNORMAL,
        )
    };
    if result.0 as isize <= 32 {
        Err("Could not open the system browser. Retry opening sign-in.".into())
    } else {
        Ok(())
    }
}
#[cfg(test)]
fn open_browser(_: &str) -> Result<(), String> {
    Ok(())
}
#[cfg(all(not(windows), not(test)))]
fn open_browser(_: &str) -> Result<(), String> {
    Err("Device sign-in needs a supported system browser".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn service_is_fixed_and_only_explicit_tests_can_use_literal_loopback() {
        assert_eq!(
            fixed_service_endpoint("https://sharing.jpsala.dev", false).unwrap(),
            SERVICE_ENDPOINT
        );
        for endpoint in [
            "http://sharing.jpsala.dev/",
            "https://other.example/",
            "https://sharing.jpsala.dev:444/",
            "https://user@sharing.jpsala.dev/",
            "https://sharing.jpsala.dev/path",
            "https://sharing.jpsala.dev/?endpoint=other",
            "https://sharing.jpsala.dev/#other",
        ] {
            assert!(fixed_service_endpoint(endpoint, false).is_err());
            assert!(fixed_service_endpoint(endpoint, true).is_err());
        }
        assert!(fixed_service_endpoint("http://127.0.0.1:5454/", false).is_err());
        assert!(fixed_service_endpoint("http://127.0.0.1:5454/", true).is_ok());
        assert!(fixed_service_endpoint("http://[::1]:5454/", true).is_ok());
        assert!(fixed_service_endpoint("http://localhost:5454/", true).is_err());
        assert!(fixed_service_endpoint("http://127.0.0.1.example:5454/", true).is_err());
    }
    #[test]
    fn recovery_code_is_random_seed_not_a_password_and_ciphertext_is_account_bound() {
        let c:StoredConfig=serde_json::from_value(json!({"environment":"synthetic","deviceId":"synthetic_device","endpoint":"https://synthetic.invalid/","allowLoopback":false,"issuerPublicKey":"synthetic","enrollmentFingerprint":"synthetic","vaultName":"synthetic_vault","signingReference":"synthetic_signing","bearerReference":"synthetic_bearer","paused":false,"channels":[]})).unwrap();
        assert!(recovery_signer("short password").is_err());
        let signer = recovery_signer(&"17".repeat(32)).unwrap();
        let manifest = RecoveryManifest {
            version: 1,
            endpoint: c.endpoint.clone(),
            environment: c.environment.clone(),
            person_id: "synthetic_person".into(),
            keys: vec![RecoveryKey {
                resource_id: "synthetic_resource".into(),
                epoch: 1,
                key: STANDARD.encode([7; 32]),
            }],
        };
        let clear = Sensitive(serde_json::to_vec(&manifest).unwrap());
        let nonce = [3; 24];
        let encrypted = recovery_cipher(&signer)
            .unwrap()
            .encrypt(
                nonce.as_slice().try_into().unwrap(),
                Payload {
                    msg: &clear.0,
                    aad: &recovery_aad(&c, "synthetic_person"),
                },
            )
            .unwrap();
        let blob = json!({"nonce":STANDARD.encode(nonce),"ciphertext":STANDARD.encode(encrypted)});
        assert_eq!(
            decrypt_recovery(&c, "synthetic_person", &signer, &blob)
                .unwrap()
                .keys
                .len(),
            1
        );
        assert!(decrypt_recovery(&c, "other_person", &signer, &blob).is_err());
        assert!(decrypt_recovery(
            &c,
            "synthetic_person",
            &recovery_signer(&"18".repeat(32)).unwrap(),
            &blob
        )
        .is_err());
        assert_eq!(
            bytes(&json!({"b":2,"a":1,"signature":"omitted"})).unwrap(),
            [DOMAIN, b"{\"a\":1,\"b\":2}"].concat()
        );
    }
}
