//! Host-owned V2 control facade. The renderer supplies intentions, never identity,
//! bearer, clear channel keys, device public keys or encrypted wire payloads.
use super::{
    config::{self, StoredChannel, StoredConfig, StoredGrant},
    crypto::{self, ChannelKey, Entropy, SystemEntropy},
    custody::{KeyKind, Vault},
    runtime,
};
use crate::storage::{
    shared::{Grant, Policy, Subscribe},
    AppStorage,
};
use base64::{engine::general_purpose::STANDARD, Engine};
use chacha20poly1305::{
    aead::{Aead, KeyInit, Payload},
    Key, XChaCha20Poly1305, XNonce,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    fs::OpenOptions,
    io::{Read, Write},
    path::Path,
};
#[path = "product_crypto.rs"]
pub(super) mod product_crypto;
#[path = "product_custody.rs"]
mod product_custody;
#[cfg(all(test, windows))]
#[path = "product_integration.rs"]
mod product_integration;

fn enrollment(vault: &Vault, c: &StoredConfig) -> Result<super::enrollment::EnrollmentKey, String> {
    let binding = runtime::binding(c, KeyKind::Enrollment, "product_enrollment_v2", 1);
    match vault.load_enrollment(&binding) {
        Ok(k) => Ok(k),
        Err(super::custody::Error::Missing) => {
            let k = super::enrollment::EnrollmentKey::generate(&mut SystemEntropy).map_err(fail)?;
            vault.store_enrollment(&binding, &k).map_err(fail)?;
            Ok(k)
        }
        Err(e) => Err(fail(e)),
    }
}
fn sign_wire(vault: &Vault, c: &StoredConfig, mut wire: Value) -> Result<Value, String> {
    let mut bytes = b"Copicu.shared.control.v2\0".to_vec();
    bytes.extend(serde_json::to_vec(&wire).map_err(fail)?);
    wire["signature"] = json!(STANDARD.encode(runtime::signer(vault, c)?.sign(&bytes)));
    Ok(wire)
}
pub(super) fn raw_catalog(vault: &Vault, c: &StoredConfig) -> Result<Value, String> {
    let kem = enrollment(vault, c)?;
    let register = sign_wire(
        vault,
        c,
        json!({"intent_id":"register_kem_v2","kind":"register_device_key","kem_public_key":STANDARD.encode(kem.public())}),
    )?;
    let client = runtime::client(vault, c)?;
    client
        .request_control("POST", "/v2/operations", Some(&register))
        .map_err(remote)?;
    let mut catalog = client
        .request_control("GET", "/v2/catalog", None)
        .map_err(remote)?;
    if product_custody::migrate(vault, c, &catalog)? {
        catalog = client.request_control("GET", "/v2/catalog", None).map_err(remote)?;
    }
    Ok(catalog)
}
pub(super) fn epoch_reference(resource: &str, epoch: u64) -> String {
    format!(
        "resource_key_{}_{epoch}",
        &config::hex(&Sha256::digest(resource.as_bytes()))[..24]
    )
}
fn import_packages(
    storage: &AppStorage,
    c: &mut StoredConfig,
    vault: &Vault,
    catalog: &Value,
) -> Result<(), String> {
    let devices = catalog["devices"]
        .as_array()
        .ok_or("Invalid trusted device catalog")?;
    let kem = enrollment(vault, c)?;
    let signer = runtime::signer(vault, c)?;
    let store = runtime::store(storage)?;
    let visible = catalog["resources"]
        .as_array()
        .ok_or("Invalid resource catalog")?;
    for ch in &mut c.channels {
        let marker = store.profile_dir().join(&c.vault_name).join(format!(
            "audience_{}.json",
            &config::hex(&Sha256::digest(ch.policy.id.as_bytes()))[..24]
        ));
        if marker.exists() && !visible.iter().any(|r| r["id"] == ch.policy.id) {
            ch.policy.can_publish = false;
            ch.policy.receive_enabled = false;
            ch.policy.publish_folder_enabled = false;
            ch.receive_needs_head = true;
            let sid = subscription_id(&ch.policy.id);
            let head = store.bootstrap_head(&sid).map_err(fail)?;
            store.policy(&sid, Policy::Paused, head).map_err(fail)?;
            for grant in &ch.grants {
                let _ = store.revoke_grant(
                    &c.environment,
                    &ch.policy.id,
                    &grant.device_id,
                    grant.revision.saturating_add(1),
                );
            }
            ch.grants.clear();
        }
    }
    for resource in catalog["resources"]
        .as_array()
        .ok_or("Invalid resource catalog")?
    {
        let rid = id(resource, "id")?;
        let epoch = resource["keyEpoch"]
            .as_str()
            .and_then(|s| s.parse::<u64>().ok())
            .ok_or("Invalid resource epoch")?;
        // Preserve older approved keys for separately authorized historical reads.
        for package in resource["packages"]
            .as_array()
            .ok_or("Invalid key package list")?
        {
            let packet = &package["package"];
            let owner = devices
                .iter()
                .find(|d| d["deviceId"] == packet["ownerDeviceId"])
                .ok_or("Package owner is not a linked trusted device")?;
            product_custody::verify_package_owner(c, catalog, packet, owner)?;
            let key =
                product_crypto::unwrap(&c.environment, &c.device_id, &kem, &signer, packet, owner)?;
            let packet_epoch = packet["epoch"]
                .as_str()
                .and_then(|s| s.parse::<u64>().ok())
                .ok_or("Invalid package epoch")?;
            if packet["resourceId"] != rid || packet_epoch > epoch {
                return Err("Key package resource or epoch mismatch".into());
            }
            vault
                .store_channel(
                    &runtime::binding(
                        c,
                        KeyKind::Channel {
                            channel: rid.clone(),
                        },
                        &epoch_reference(&rid, packet_epoch),
                        packet_epoch,
                    ),
                    &key,
                )
                .map_err(fail)?;
        }
        let prior = c
            .channels
            .iter()
            .find(|ch| ch.policy.id == rid)
            .map(|ch| (ch.epoch, ch.policy.can_publish));
        let reference = epoch_reference(&rid, epoch);
        let key = match vault.load_channel(&runtime::binding(
            c,
            KeyKind::Channel {
                channel: rid.clone(),
            },
            &reference,
            epoch,
        )) {
            Ok(k) => Some(k),
            Err(super::custody::Error::Missing) => {
                if let Some(ch) = c
                    .channels
                    .iter()
                    .find(|ch| ch.policy.id == rid && ch.epoch == epoch)
                {
                    runtime::key(vault, c, ch).ok()
                } else {
                    // A committed create may have lost its response before local
                    // installation. Its operation ID deterministically locates
                    // the protected key, never regenerating a remote resource.
                    let intent = catalog["operations"].as_array().and_then(|ops| {
                        ops.iter()
                            .find(|op| op["kind"] == "create" && op["resourceId"] == rid)
                    });
                    intent
                        .and_then(|op| op["operationId"].as_str())
                        .and_then(|op| {
                            vault
                                .load_channel(&runtime::binding(
                                    c,
                                    KeyKind::Channel {
                                        channel: rid.clone(),
                                    },
                                    &format!("product_key_{}", token(c, op)),
                                    epoch,
                                ))
                                .ok()
                        })
                }
            }
            Err(e) => return Err(fail(e)),
        };
        if let Some(key) = key {
            let name = if resource["metadata"].is_null() {
                c.channels
                    .iter()
                    .find(|ch| ch.policy.id == rid)
                    .map(|ch| ch.policy.name.clone())
                    .unwrap_or_else(|| "Shared clipboard".into())
            } else {
                decrypt_name(c, &rid, epoch, &key, &resource["metadata"])?
            };
            install(storage, c, vault, resource, &key, reference, name)?;
        }
        let audience = resource["participants"]
            .as_array()
            .ok_or("Invalid audience")?
            .iter()
            .filter(|p| p["revoked"] == 0)
            .map(|p| p["id"].clone())
            .collect::<Vec<_>>();
        let audience_path = runtime::store(storage)?
            .profile_dir()
            .join(&c.vault_name)
            .join(format!(
                "audience_{}.json",
                &config::hex(&Sha256::digest(rid.as_bytes()))[..24]
            ));
        let current = serde_json::to_vec(&audience).map_err(fail)?;
        let previous = std::fs::read(&audience_path).ok();
        let audience_changed = previous.as_ref().is_some_and(|p| p != &current);
        let permission_changed = prior.is_some_and(|(old_epoch, can_publish)| {
            old_epoch != epoch
                || can_publish
                    != (resource["permission"] != "read" && resource["keyState"] == "ready")
        });
        if audience_changed || permission_changed {
            if let Some(ch) = c.channels.iter_mut().find(|ch| ch.policy.id == rid) {
                if audience_changed {
                    ch.policy.send_paused = true;
                }
                ch.receive_needs_head = true;
            }
            let sid = subscription_id(&rid);
            let head = store.bootstrap_head(&sid).map_err(fail)?;
            store.policy(&sid, Policy::Paused, head).map_err(fail)?;
        }
        std::fs::write(&audience_path, &current).map_err(fail)?;
    }
    runtime::save(&runtime::store(storage)?, c)?;
    Ok(())
}
fn subscription_id(resource: &str) -> String {
    if resource.len() <= 120 {
        format!("channel_{resource}")
    } else {
        format!(
            "channel_{}",
            config::hex(&Sha256::digest(resource.as_bytes()))
        )
    }
}

fn fail(_: impl std::fmt::Debug) -> String {
    "Shared resource operation failed".into()
}
fn remote(e: super::transport::Error) -> String {
    match e {
        super::transport::Error::Denied => "Shared resource access denied or revoked",
        super::transport::Error::Conflict => "Shared resource changed; refresh before retrying",
        super::transport::Error::Unavailable => "Relay unavailable; retry this same operation",
        super::transport::Error::Quota => "Shared resource capacity reached",
        _ => "Shared resource request rejected",
    }
    .into()
}
fn id(input: &Value, field: &str) -> Result<String, String> {
    input[field]
        .as_str()
        .filter(|s| crypto::valid_id(s))
        .map(str::to_owned)
        .ok_or_else(|| format!("Invalid {field}"))
}
fn token(c: &StoredConfig, op: &str) -> String {
    config::hex(&Sha256::digest(
        format!("{}\0{}\0{op}", c.environment, c.device_id).as_bytes(),
    ))[..32]
        .into()
}
fn metadata_aad(c: &StoredConfig, resource: &str, epoch: u64) -> Vec<u8> {
    format!(
        "Copicu.shared.resource-name.v2\0{}\0{resource}\0{epoch}",
        c.environment
    )
    .into_bytes()
}
fn encrypt_name(
    c: &StoredConfig,
    resource: &str,
    epoch: u64,
    key: &ChannelKey,
    name: &str,
) -> Result<Value, String> {
    if name.trim().is_empty() || name.chars().count() > 120 {
        return Err("Use a resource name of 1–120 characters".into());
    }
    let mut nonce = [0u8; 24];
    SystemEntropy.fill(&mut nonce).map_err(fail)?;
    let secret: &Key = key.secret().try_into().map_err(fail)?;
    let iv: &XNonce = nonce.as_slice().try_into().map_err(fail)?;
    let ciphertext = XChaCha20Poly1305::new(secret)
        .encrypt(
            iv,
            Payload {
                msg: name.trim().as_bytes(),
                aad: &metadata_aad(c, resource, epoch),
            },
        )
        .map_err(fail)?;
    Ok(json!({"nonce":STANDARD.encode(nonce),"ciphertext":STANDARD.encode(ciphertext)}))
}
fn decrypt_name(
    c: &StoredConfig,
    resource: &str,
    epoch: u64,
    key: &ChannelKey,
    value: &Value,
) -> Result<String, String> {
    let nonce = STANDARD
        .decode(value["nonce"].as_str().ok_or("Invalid resource metadata")?)
        .map_err(fail)?;
    let ciphertext = STANDARD
        .decode(
            value["ciphertext"]
                .as_str()
                .ok_or("Invalid resource metadata")?,
        )
        .map_err(fail)?;
    if nonce.len() != 24 || ciphertext.len() > 2048 {
        return Err("Invalid resource metadata".into());
    }
    let secret: &Key = key.secret().try_into().map_err(fail)?;
    let iv: &XNonce = nonce.as_slice().try_into().map_err(fail)?;
    let clear = XChaCha20Poly1305::new(secret)
        .decrypt(
            iv,
            Payload {
                msg: &ciphertext,
                aad: &metadata_aad(c, resource, epoch),
            },
        )
        .map_err(|_| "Resource metadata could not be authenticated")?;
    String::from_utf8(clear).map_err(fail)
}
fn public_resource(c: &StoredConfig, vault: &Vault, mut resource: Value) -> Value {
    let local = c
        .channels
        .iter()
        .find(|ch| resource["id"].as_str() == Some(ch.policy.id.as_str()));
    let name = local.and_then(|ch| {
        let key = runtime::key(vault, c, ch).ok()?;
        if resource["metadata"].is_null() {
            return Some(ch.policy.name.clone());
        } // Explicit legacy synthetic bootstrap.
        decrypt_name(c, &ch.policy.id, ch.epoch, &key, &resource["metadata"]).ok()
    });
    resource["name"] = json!(name
        .clone()
        .unwrap_or_else(|| if resource.get("custodyMissingEpochs").is_some() { "Shared clipboard (keys awaiting migration)".into() } else { "Shared clipboard (key approval pending)".into() }));
    if name.is_none() {
        resource["keyState"] = json!("pending");
        if resource.get("custodyMissingEpochs").is_some() { resource["keyMessage"] = json!("Update and open Copicu on a PC with this clipboard's keys. The service will make them available to your account."); }
    }
    if let Some(object) = resource.as_object_mut() {
        object.remove("metadata");
        object.remove("packages");
        object.remove("publisherKeys");
    }
    resource
}
pub(crate) fn catalog(storage: &AppStorage) -> Result<Value, String> {
    let _network = runtime::NETWORK.lock().map_err(fail)?;
    refresh_catalog(storage, false)
}
pub(super) fn revoke_control_identity(storage: &AppStorage, expected: &StoredConfig) {
    let Ok(_barrier)=crate::shared_native::EFFECT_BARRIER.lock() else {return;};
    let Ok(_worker)=runtime::WORKER.lock() else {return;};
    let Ok(mut c)=runtime::required(storage) else {return;};
    if super::control_sync::identity(&c)!=super::control_sync::identity(expected) {return;}
    let Ok(store)=runtime::store(storage) else {return;};
    for channel in &mut c.channels {
        channel.policy.can_publish=false; channel.policy.receive_enabled=false; channel.policy.publish_folder_enabled=false; channel.receive_needs_head=true;
        let sid=subscription_id(&channel.policy.id);
        if let Ok(head)=store.bootstrap_head(&sid) {let _=store.policy(&sid,Policy::Paused,head);}
        for grant in &channel.grants {let _=store.revoke_grant(&c.environment,&channel.policy.id,&grant.device_id,grant.revision.saturating_add(1));}
        channel.grants.clear();
    }
    let _=runtime::save(&store,&c);
    if let Ok(Some(saved))=store.control_cache(&super::control_sync::identity(&c)) {
        if let Ok(mut value)=serde_json::from_str::<Value>(&saved) {
            value["resources"]=json!([]);value["invitations"]=json!([]);
            if let Ok(mark)=super::control_sync::Watermark::from_catalog(&value,&c) {let _=store.save_control_cache(&super::control_sync::identity(&c),&mark.person_id,&mark.generation,mark.cursor,&value.to_string());}
        }
    }
}
pub(super) fn refresh_catalog(storage: &AppStorage, automatic: bool) -> Result<Value, String> {
    let mut c = runtime::required(storage)?;
    let store = runtime::store(storage)?;
    let vault = runtime::vault(&store, &c)?;
    let mut result = raw_catalog(&vault, &c)?;
    // Validate feed scope before importing any package or changing local grants.
    let control_mark = if result["control"].is_null() { None } else {
        Some(super::control_sync::Watermark::from_catalog(&result, &c)?)
    };
    let _barrier = crate::shared_native::EFFECT_BARRIER.lock().map_err(fail)?;
    let _worker = runtime::WORKER.lock().map_err(fail)?;
    let latest = runtime::required(storage)?;
    if super::control_sync::identity(&latest) != super::control_sync::identity(&c) || (automatic && latest.paused) {
        return Err("Sharing identity changed during request".into());
    }
    c = latest;
    if let Some(saved) = store.control_cache(&super::control_sync::identity(&c)).map_err(fail)? {
        let saved: Value = serde_json::from_str(&saved).map_err(fail)?;
        if saved["control"]["generation"] == result["control"]["generation"]
            && saved["control"]["cursor"].as_str().and_then(|v| v.parse::<u64>().ok()) > result["control"]["cursor"].as_str().and_then(|v| v.parse::<u64>().ok()) {
            return Ok(saved);
        }
    }
    import_packages(storage, &mut c, &vault, &result)?;
    let resources = result["resources"]
        .as_array()
        .ok_or("Invalid resource catalog")?
        .iter()
        .cloned()
        .map(|r| public_resource(&c, &vault, r))
        .collect::<Vec<_>>();
    result["resources"] = json!(resources);
    let reviews=result["devices"].as_array().ok_or("Invalid linked device catalog")?.iter().filter(|device|device["serviceCustody"]!=true).map(|device|{
        let transcript=json!({"environment":c.environment,"personId":device["personId"],"deviceId":device["deviceId"],"signingPublicKey":device["signingPublicKey"],"kemPublicKey":device["kemPublicKey"]});
        let mut bytes=b"Copicu.shared.linked-device-review.v2\0".to_vec();bytes.extend(serde_json::to_vec(&transcript).map_err(fail)?);
        Ok(json!({"personId":device["personId"],"deviceId":device["deviceId"],"fingerprint":config::hex(&Sha256::digest(bytes)),"state":if device["revoked"]==true{"revoked"}else if device["kemPublicKey"].is_null(){"pending"}else{"ready"}}))
    }).collect::<Result<Vec<Value>,String>>()?;
    result["deviceReviews"] = json!(reviews);
    let committed = result["operations"].as_array().cloned().unwrap_or_default();
    let mut pending = Vec::new();
    for entry in std::fs::read_dir(store.profile_dir().join(&c.vault_name)).map_err(fail)? {
        let entry = entry.map_err(fail)?;
        let name = entry.file_name();
        let name = name.to_string_lossy();
        if name.starts_with("intent_")
            && name.ends_with(".json")
            && !name.starts_with("intent_tmp_")
        {
            if let Some(record) = read_intent(&entry.path())? {
                let op = record.wire["intent_id"]
                    .as_str()
                    .ok_or("Invalid saved operation ID")?;
                if !committed.iter().any(|v| v["operationId"] == op) {
                    pending.push(json!({"operationId":op,"kind":record.wire["kind"],"resourceId":record.wire["resource_id"],"status":"pending","recoverable":true}));
                }
            }
        }
    }
    result["pendingOperations"] = json!(pending);
    if let Some(object) = result.as_object_mut() {
        object.remove("devices");
        object.remove("custody");
    }
    if let Some(mark) = control_mark {
        store.save_control_cache(&super::control_sync::identity(&c), &mark.person_id, &mark.generation, mark.cursor, &serde_json::to_string(&result).map_err(fail)?).map_err(fail)?;
    }
    drop(_worker);
    drop(_barrier);
    if result["mode"] == "private" {
        if let Err(reason) = super::identity::backup(storage, &c, &vault, &result) {
            runtime::record_error(storage, &reason);
        }
    }
    Ok(result)
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct IntentRecord {
    input_digest: String,
    wire: Value,
}
fn read_intent(path: &Path) -> Result<Option<IntentRecord>, String> {
    let file = match std::fs::File::open(path) {
        Ok(v) => v,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(e) => return Err(fail(e)),
    };
    let mut bytes = Vec::new();
    file.take(131073).read_to_end(&mut bytes).map_err(fail)?;
    if bytes.len() > 131072 {
        return Err("Invalid saved shared operation".into());
    }
    serde_json::from_slice(&bytes).map(Some).map_err(fail)
}
pub(super) fn install(
    storage: &AppStorage,
    c: &mut StoredConfig,
    vault: &Vault,
    resource: &Value,
    key: &ChannelKey,
    key_reference: String,
    name: String,
) -> Result<(), String> {
    let rid = id(resource, "id")?;
    let epoch = resource["keyEpoch"]
        .as_str()
        .and_then(|s| s.parse::<u64>().ok())
        .ok_or("Invalid resource epoch")?;
    let revision = resource["revision"]
        .as_str()
        .and_then(|s| s.parse::<u64>().ok())
        .ok_or("Invalid resource revision")?;
    let head = resource["head"]
        .as_str()
        .and_then(|s| s.parse::<u64>().ok())
        .ok_or("Invalid resource head")?;
    let store = runtime::store(storage)?;
    vault
        .store_channel(
            &runtime::binding(
                c,
                KeyKind::Channel {
                    channel: rid.clone(),
                },
                &key_reference,
                epoch,
            ),
            key,
        )
        .map_err(fail)?;
    let grants = resource["publisherKeys"]
        .as_array()
        .ok_or("Invalid publisher catalog")?
        .iter()
        .map(|p| {
            let device_id = id(p, "deviceId")?;
            let public_key = p["publicKey"]
                .as_str()
                .ok_or("Invalid publisher key")?
                .to_owned();
            if p["authorized"] != false {
                store
                    .set_grant(Grant {
                        environment: c.environment.clone(),
                        channel: rid.clone(),
                        origin: device_id.clone(),
                        public_key: config::bytes32(&public_key)?,
                        epoch,
                        revision,
                    })
                    .map_err(fail)?;
            } else if c
                .channels
                .iter()
                .find(|ch| ch.policy.id == rid)
                .is_some_and(|ch| ch.grants.iter().any(|g| g.device_id == device_id))
            {
                // Already revoked at this revision is idempotent. Missing historical
                // signers remain usable for manual verification, never live grants.
                match store.revoke_grant(&c.environment, &rid, &device_id, revision) {
                    Ok(()) | Err(crate::storage::shared::Error::Missing) => {}
                    Err(error) => return Err(fail(error)),
                }
            }
            Ok(StoredGrant {
                device_id,
                public_key,
                revision,
            })
        })
        .collect::<Result<Vec<_>, String>>()?;
    let mut policy: config::ChannelPolicy = if let Some(ch) =
        c.channels.iter().find(|ch| ch.policy.id == rid)
    {
        ch.policy.clone()
    } else {
        serde_json::from_value(json!({"id":rid,"name":name,"canPublish":resource["permission"]!="read","defaultSendChannel":false,"receiveEnabled":false,"publishFolderEnabled":false,"publishFolderId":null,"saveToFolder":false,"receiveFolderId":null,"updateClipboard":false,"receiveActionEnabled":false,"receiveActionWritesClipboard":false,"receiveActionId":null,"receiveActionForwardChannelIds":[],"sendPaused":false,"receivePaused":false})).map_err(fail)?
    };
    policy.name = name;
    policy.can_publish = resource["permission"] != "read" && resource["keyState"] == "ready";
    let ch = StoredChannel {
        policy,
        epoch,
        key_reference,
        grants,
        receive_needs_head: true,
    };
    if let Some(existing) = c.channels.iter_mut().find(|ch| ch.policy.id == rid) {
        let needs_head = existing.epoch != epoch || existing.receive_needs_head;
        *existing = ch;
        existing.receive_needs_head = needs_head;
    } else {
        let sid = if rid.len() <= 120 {
            format!("channel_{rid}")
        } else {
            format!("channel_{}", config::hex(&Sha256::digest(rid.as_bytes())))
        };
        store
            .subscribe_product(Subscribe {
                id: sid,
                environment: c.environment.clone(),
                channel: rid,
                local_device: c.device_id.clone(),
                head,
                history_enabled: false,
                folder_id: None,
            })
            .map_err(fail)?;
        c.channels.push(ch);
    }
    runtime::save(&store, c)
}
pub(crate) fn operation(storage: &AppStorage, input: Value) -> Result<Value, String> {
    let _network = runtime::NETWORK.lock().map_err(fail)?;
    let mut c = runtime::required(storage)?;
    let store = runtime::store(storage)?;
    let vault = runtime::vault(&store, &c)?;
    let operation_id = id(&input, "operationId")?;
    let mut kind = id(&input, "kind")?;
    if input.as_object().is_none_or(|m| {
        m.keys().any(|k| {
            ![
                "operationId",
                "kind",
                "resourceId",
                "expectedRevision",
                "name",
                "personId",
                "permission",
                "includeHistory",
                "invitationId",
            ]
            .contains(&k.as_str())
        })
    }) {
        return Err("Unsupported resource operation fields".into());
    }
    if ![
        "create", "rename", "delete", "leave", "invite", "accept", "revoke", "approve", "rotate",
        "recover",
    ]
    .contains(&kind.as_str())
    {
        return Err("Unsupported shared resource operation".into());
    }
    let digest = config::hex(&Sha256::digest(serde_json::to_vec(&input).map_err(fail)?));
    let suffix = token(&c, &operation_id);
    let intent_path = store
        .profile_dir()
        .join(&c.vault_name)
        .join(format!("intent_{suffix}.json"));
    let key_reference = format!("product_key_{suffix}");
    let existing = read_intent(&intent_path)?;
    let mut generated_key = None;
    let wire = if let Some(record) = existing {
        if kind == "recover" {
            kind = id(&record.wire, "kind")?;
        } else if record.input_digest != digest {
            return Err("Operation ID already used with different input".into());
        }
        record.wire
    } else {
        if kind == "recover" {
            return Err("No saved operation exists for this device".into());
        }
        let mut wire = json!({"intent_id":operation_id,"kind":kind});
        let resource = if kind == "create" {
            format!("resource_{suffix}")
        } else if kind == "accept" {
            String::new()
        } else {
            id(&input, "resourceId")?
        };
        if !resource.is_empty() {
            wire["resource_id"] = json!(resource);
        }
        if kind != "create" && kind != "accept" {
            let rev = input["expectedRevision"]
                .as_str()
                .filter(|v| v.parse::<u64>().is_ok_and(|n| n > 0))
                .ok_or("A current resource revision is required")?;
            wire["expected_revision"] = json!(rev);
        }
        if kind == "approve" || kind == "rotate" {
            let catalog = raw_catalog(&vault, &c)?;
            {
                let _barrier = crate::shared_native::EFFECT_BARRIER.lock().map_err(fail)?;
                let _worker = runtime::WORKER.lock().map_err(fail)?;
                let latest = runtime::required(storage)?;
                if latest.environment != c.environment || latest.device_id != c.device_id {
                    return Err("Sharing identity changed during approval".into());
                }
                c = latest;
                import_packages(storage, &mut c, &vault, &catalog)?;
            }
            let current = catalog["resources"]
                .as_array()
                .and_then(|v| v.iter().find(|r| r["id"] == resource))
                .ok_or("Shared resource unavailable")?;
            if current["permission"] != "owner" {
                return Err("Only the owner can approve keys".into());
            }
            if current["revision"] != input["expectedRevision"] {
                return Err("Shared resource changed; refresh before approving".into());
            }
            let invitation = if kind == "approve" {
                Some(
                    current["invites"]
                        .as_array()
                        .and_then(|v| {
                            v.iter().find(|i| {
                                i["id"] == input["invitationId"] && i["state"] == "accepted"
                            })
                        })
                        .ok_or("Invitation must be accepted before approval")?,
                )
            } else {
                None
            };
            let rotating = kind == "rotate"
                || current["keyState"] == "pending"
                || invitation.is_some_and(|i| i["includeHistory"] == 0);
            let old_epoch = current["keyEpoch"]
                .as_str()
                .and_then(|v| v.parse::<u64>().ok())
                .ok_or("Invalid key epoch")?;
            let epoch = if rotating {
                old_epoch.checked_add(1).ok_or("Key epoch exhausted")?
            } else {
                old_epoch
            };
            let ch = c
                .channels
                .iter()
                .find(|ch| ch.policy.id == resource)
                .ok_or("Owner key is not linked")?;
            let key = if rotating {
                let binding = runtime::binding(
                    &c,
                    KeyKind::Channel {
                        channel: resource.clone(),
                    },
                    &key_reference,
                    epoch,
                );
                match vault.load_channel(&binding) {
                    Ok(k) => k,
                    Err(super::custody::Error::Missing) => {
                        let k = ChannelKey::generate(
                            c.environment.clone(),
                            resource.clone(),
                            epoch,
                            &mut SystemEntropy,
                        )
                        .map_err(fail)?;
                        vault.store_channel(&binding, &k).map_err(fail)?;
                        k
                    }
                    Err(e) => return Err(fail(e)),
                }
            } else {
                runtime::key(&vault, &c, ch)?
            };
            let mut people = current["participants"]
                .as_array()
                .ok_or("Invalid participant catalog")?
                .iter()
                .filter(|p| p["revoked"] == 0)
                .filter_map(|p| p["id"].as_str())
                .collect::<Vec<_>>();
            if let Some(invite) = invitation {
                people.push(invite["personId"].as_str().ok_or("Invalid invitee")?);
            }
            let signer = runtime::signer(&vault, &c)?;
            let packets = catalog["devices"]
                .as_array()
                .ok_or("Invalid device catalog")?
                .iter()
                .filter(|d| {
                    d["revoked"] != true
                        && d["personId"].as_str().is_some_and(|p| people.contains(&p))
                })
                .map(|d| {
                    product_crypto::wrap(
                        &c.environment,
                        &resource,
                        epoch,
                        &key,
                        &signer,
                        &c.device_id,
                        d,
                        &mut SystemEntropy,
                    )
                })
                .collect::<Result<Vec<_>, String>>()?;
            wire["packages"] = json!(packets);
            if let Some(target) = product_custody::target(&c, &catalog)? {
                wire["custody_packages"] = json!([product_crypto::wrap_service(&c.environment, &resource, epoch, &key, &signer, &c.device_id, target, &mut SystemEntropy)?]);
                wire.as_object_mut().unwrap().remove("packages");
            }
            if let Some(invite) = invitation.filter(|i| i["includeHistory"] == 1) {
                let mut historical = Vec::new();
                for old in current["retainedEpochs"]
                    .as_array()
                    .ok_or("Invalid historical epoch catalog")?
                {
                    let old_epoch = old
                        .as_str()
                        .and_then(|s| s.parse::<u64>().ok())
                        .ok_or("Invalid historical epoch")?;
                    if old_epoch == epoch {
                        continue;
                    }
                    let key = if old_epoch == ch.epoch {
                        runtime::key(&vault, &c, ch)?
                    } else {
                        vault
                            .load_channel(&runtime::binding(
                                &c,
                                KeyKind::Channel {
                                    channel: resource.clone(),
                                },
                                &epoch_reference(&resource, old_epoch),
                                old_epoch,
                            ))
                            .map_err(|_| {
                                "Owner historical key unavailable; history cannot be granted"
                            })?
                    };
                    let packets = catalog["devices"]
                        .as_array()
                        .ok_or("Invalid device catalog")?
                        .iter()
                        .filter(|d| d["revoked"] != true && d["personId"] == invite["personId"])
                        .map(|d| {
                            product_crypto::wrap(
                                &c.environment,
                                &resource,
                                old_epoch,
                                &key,
                                &signer,
                                &c.device_id,
                                d,
                                &mut SystemEntropy,
                            )
                        })
                        .collect::<Result<Vec<_>, String>>()?;
                    historical.push(json!({"epoch":old_epoch.to_string(),"packages":packets}));
                    if let Some(target) = product_custody::target(&c, &catalog)? {
                        wire["custody_packages"].as_array_mut().ok_or("Missing service key package")?.push(product_crypto::wrap_service(&c.environment, &resource, old_epoch, &key, &signer, &c.device_id, target, &mut SystemEntropy)?);
                    }
                }
                wire["history_packages"] = json!(historical);
                if catalog["keyCustody"] == "service" { wire.as_object_mut().unwrap().remove("history_packages"); }
            }
            if rotating {
                wire["metadata"] = encrypt_name(&c, &resource, epoch, &key, &ch.policy.name)?;
            }
        }
        if kind == "create" || kind == "rename" {
            let name = input["name"].as_str().ok_or("Resource name is required")?;
            if kind == "create" {
                let binding = runtime::binding(
                    &c,
                    KeyKind::Channel {
                        channel: resource.clone(),
                    },
                    &key_reference,
                    1,
                );
                let key = match vault.load_channel(&binding) {
                    Ok(key) => key,
                    Err(super::custody::Error::Missing) => {
                        let key = ChannelKey::generate(
                            c.environment.clone(),
                            resource.clone(),
                            1,
                            &mut SystemEntropy,
                        )
                        .map_err(fail)?;
                        vault.store_channel(&binding, &key).map_err(fail)?;
                        key
                    }
                    Err(e) => return Err(fail(e)),
                };
                wire["metadata"] = encrypt_name(&c, &resource, 1, &key, name)?;
                let catalog = raw_catalog(&vault, &c)?;
                if catalog["mode"] == "private" {
                    let signer = runtime::signer(&vault, &c)?;
                    let packets = catalog["devices"].as_array().ok_or("Invalid device catalog")?.iter()
                        .filter(|d| d["revoked"] != true && d["personId"] == catalog["person"]["id"])
                        .map(|d| product_crypto::wrap(&c.environment, &resource, 1, &key, &signer, &c.device_id, d, &mut SystemEntropy))
                        .collect::<Result<Vec<_>, String>>()?;
                    wire["packages"] = json!(packets);
                    if let Some(target) = product_custody::target(&c, &catalog)? {
                        wire["custody_packages"] = json!([product_crypto::wrap_service(&c.environment, &resource, 1, &key, &signer, &c.device_id, target, &mut SystemEntropy)?]);
                        wire.as_object_mut().unwrap().remove("packages");
                    }
                }
                generated_key = Some(key);
            } else {
                let channel = c
                    .channels
                    .iter()
                    .find(|ch| ch.policy.id == resource)
                    .ok_or("Resource key is not approved on this device")?;
                wire["metadata"] = encrypt_name(
                    &c,
                    &resource,
                    channel.epoch,
                    &runtime::key(&vault, &c, channel)?,
                    name,
                )?;
            }
        }
        for (source, target) in [
            ("personId", "person_id"),
            ("permission", "permission"),
            ("includeHistory", "include_history"),
            ("invitationId", "invitation_id"),
        ] {
            if let Some(value) = input.get(source) {
                wire[target] = value.clone();
            }
        }
        let wire = sign_wire(&vault, &c, wire)?;
        let record = IntentRecord {
            input_digest: digest,
            wire: wire.clone(),
        };
        let temporary =
            intent_path.with_file_name(format!("{}.json", runtime::random_id("intent_tmp")?));
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)
            .map_err(fail)?;
        file.write_all(&serde_json::to_vec(&record).map_err(fail)?)
            .map_err(fail)?;
        file.sync_all().map_err(fail)?;
        drop(file);
        std::fs::rename(&temporary, &intent_path).map_err(fail)?;
        wire
    };
    let mut result = runtime::client(&vault, &c)?
        .request_control("POST", "/v2/operations", Some(&wire))
        .map_err(remote)?;
    let latest_catalog = raw_catalog(&vault, &c)?;
    let _barrier = crate::shared_native::EFFECT_BARRIER.lock().map_err(fail)?;
    let _worker = runtime::WORKER.lock().map_err(fail)?;
    let latest = runtime::required(storage)?;
    if latest.environment != c.environment
        || latest.device_id != c.device_id
        || latest.vault_name != c.vault_name
    {
        return Err("Sharing identity changed during operation".into());
    }
    c = latest;
    if kind == "approve" || kind == "rotate" {
        import_packages(storage, &mut c, &vault, &latest_catalog)?;
    } else if kind == "create" {
        let rid = id(&result["resource"], "id")?;
        let actual = latest_catalog["resources"]
            .as_array()
            .and_then(|v| v.iter().find(|r| r["id"] == rid))
            .ok_or("Operation committed earlier; resource no longer available")?;
        result["resource"] = actual.clone();
        let resource = &result["resource"];
        let rid = id(resource, "id")?;
        let key = match generated_key {
            Some(k) => k,
            None => vault
                .load_channel(&runtime::binding(
                    &c,
                    KeyKind::Channel { channel: rid },
                    &key_reference,
                    1,
                ))
                .map_err(fail)?,
        };
        let name = decrypt_name(
            &c,
            resource["id"].as_str().ok_or("Invalid resource")?,
            1,
            &key,
            &resource["metadata"],
        )?;
        install(storage, &mut c, &vault, resource, &key, key_reference, name)?;
    } else if kind == "rename" {
        // Fresh catalog import below installs the current encrypted label. A
        // recovered stale rename cannot overwrite a newer revision locally.
    } else if kind == "delete" || kind == "leave" {
        let rid = id(&wire, "resource_id")?;
        if let Some(ch) = c.channels.iter_mut().find(|ch| ch.policy.id == rid) {
            ch.policy.can_publish = false;
            ch.policy.receive_enabled = false;
            ch.policy.publish_folder_enabled = false;
            ch.policy.send_paused = true;
            ch.policy.receive_paused = true;
        }
        let sid = subscription_id(&rid);
        let head = store.bootstrap_head(&sid).map_err(fail)?;
        store.policy(&sid, Policy::Paused, head).map_err(fail)?;
        c.connections.retain(|conn| conn.channel_id != rid);
        runtime::save(&store, &c)?;
    } else if kind == "revoke" {
        let rid = id(&wire, "resource_id")?;
        if let Some(ch) = c.channels.iter_mut().find(|ch| ch.policy.id == rid) {
            ch.policy.send_paused = true;
        }
        runtime::save(&store, &c)?;
    }
    import_packages(storage, &mut c, &vault, &latest_catalog)?;
    if result.get("resource").is_some() {
        result["resource"] = public_resource(&c, &vault, result["resource"].clone());
    }
    drop(_worker);
    drop(_barrier);
    if latest_catalog["mode"] == "private" && latest_catalog["keyCustody"] != "service" {
        if let Err(reason) = super::identity::backup(storage, &c, &vault, &latest_catalog) {
            runtime::record_error(storage, &reason);
        }
    }
    Ok(result)
}

pub(super) fn open_history_envelope(
    storage: &AppStorage,
    c: &StoredConfig,
    ch: &StoredChannel,
    e: &super::wire::Envelope,
) -> Result<crypto::VerifiedContent, String> {
    let epoch = super::wire::counter(&e.key_epoch).map_err(fail)?;
    let store = runtime::store(storage)?;
    let vault = runtime::vault(&store, c)?;
    let key = if epoch == ch.epoch {
        runtime::key(&vault, c, ch)?
    } else {
        vault
            .load_channel(&runtime::binding(
                c,
                KeyKind::Channel {
                    channel: ch.policy.id.clone(),
                },
                &epoch_reference(&ch.policy.id, epoch),
                epoch,
            ))
            .map_err(|_| "Historical key not granted")?
    };
    let grant = ch
        .grants
        .iter()
        .find(|g| g.device_id == e.device_id)
        .ok_or("Historical signing identity unavailable")?;
    crypto::open(
        e,
        &key,
        &crypto::ReceivePolicy {
            environment: &c.environment,
            channel: &ch.policy.id,
            device: &e.device_id,
            signing_key: config::bytes32(&grant.public_key)?,
            epoch,
            now_unix_ms: runtime::now()?,
            last_origin_ordinal: 0,
            live_lease: match &e.freshness {
                super::wire::Freshness::Live { lease_id } => Some(lease_id.as_str()),
                _ => None,
            },
        },
    )
    .map_err(|_| "Historical publication authentication failed".into())
}
