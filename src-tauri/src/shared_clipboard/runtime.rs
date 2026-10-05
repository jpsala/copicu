//! Integrated local runtime: private enrollment, bounded encrypted outbox,
//! authenticated receipts, opt-in folder policies and metadata-only status.
//! Native effects remain host-owned and require durable claims and revalidation.
use super::{
    config::*,
    crypto::{self, ChannelKey, DeviceSigner, Entropy, ReceivePolicy, SystemEntropy, VerifiedContent},
    custody::{Binding, KeyKind, Vault},
    diagnostics::{SyncDiagnostic, SyncError},
    transport::{self, LeaseProof, RelayClient, Report},
    wire::{self, Envelope, Freshness},
};
use crate::storage::{
    shared::{Grant, HistoryOutcome, Policy, RuntimeStore, Subscribe, VerifiedArrival},
    AppStorage,
};
use serde::Serialize;
use serde_json::{json, Value};
use crate::clipboard_content::ClipboardContent;
use sha2::{Digest, Sha256};
use std::{
    collections::{HashMap, HashSet},
    sync::{Mutex, OnceLock},
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

pub(super) static WORKER: Mutex<()> = Mutex::new(());
// Remote IO is serialized separately from bounded local admission.
pub(super) static NETWORK: Mutex<()> = Mutex::new(());
// Runtime HTTP tests share the shipping transport singleton. Keep their
// multi-poll assertions separate while pure/storage tests remain parallel.
#[cfg(test)]
pub(super) static TEST_RUNTIME: Mutex<()> = Mutex::new(());
static CONNECTED: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();
static LEASES: OnceLock<Mutex<HashMap<String, (LeaseProof, Instant)>>> = OnceLock::new();
static STARTED: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();
static PRUNED: OnceLock<Mutex<HashMap<String, Instant>>> = OnceLock::new();
fn error(_: impl std::fmt::Debug) -> String {
    "Shared clipboard local storage operation failed".into()
}
pub(super) fn now() -> Result<u64, String> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(error)?
        .as_millis()
        .try_into()
        .map_err(error)
}
pub(super) fn store(storage: &AppStorage) -> Result<RuntimeStore<'_>, String> {
    let store = RuntimeStore::init(storage).map_err(error)?;
    store.ensure_product_schema().map_err(error)?;
    Ok(store)
}
pub(super) fn config(storage: &AppStorage) -> Result<Option<StoredConfig>, String> {
    RuntimeStore::config_json(storage)
        .map_err(error)?
        .map(|s| {
            let mut config: StoredConfig = serde_json::from_str(&s)
                .map_err(|_| "Invalid shared clipboard configuration".to_string())?;
            migrate_connections(&mut config);
            Ok(config)
        })
        .transpose()
}
pub(super) fn required(storage: &AppStorage) -> Result<StoredConfig, String> {
    config(storage)?.ok_or("Shared clipboard is not configured".into())
}
pub(super) fn save(store: &RuntimeStore<'_>, c: &StoredConfig) -> Result<(), String> {
    store
        .save_config(&serde_json::to_string(c).map_err(error)?)
        .map_err(error)
}
fn migrate_connections(c: &mut StoredConfig) {
    if c.connection_version != 0 {
        return;
    }
    for ch in &c.channels {
        let p = &ch.policy;
        if p.publish_folder_enabled {
            c.connections.push(Connection {
                id: format!("legacy_send_{}", p.id),
                channel_id: p.id.clone(),
                kind: "folder".into(),
                folder_id: p.publish_folder_id,
                direction: "send".into(),
            });
        }
        if p.receive_enabled {
            c.connections.push(Connection {
                id: format!("legacy_receive_{}", p.id),
                channel_id: p.id.clone(),
                kind: if p.save_to_folder {
                    "folder"
                } else {
                    "general"
                }
                .into(),
                folder_id: p.receive_folder_id,
                direction: "receive".into(),
            });
        }
    }
    c.connection_version = 1;
}
fn send_is_paused(c: &StoredConfig, ch: &StoredChannel) -> bool {
    c.paused || c.send_paused || ch.policy.send_paused
}
fn receive_is_paused(c: &StoredConfig, ch: &StoredChannel) -> bool {
    c.paused || c.receive_paused || ch.policy.receive_paused
}
fn ingress_matches(
    c: &StoredConfig,
    ch: &StoredChannel,
    folder: Option<i64>,
    new_ingress: bool,
) -> bool {
    ch.policy.can_publish
        && !send_is_paused(c, ch)
        && c.connections.iter().any(|v| {
            v.channel_id == ch.policy.id
                && v.sends()
                && ((v.kind == "folder" && v.folder_id == folder)
                    || (v.kind == "general"
                        && new_ingress
                        && (c.general_send_scope == "all" || folder.is_none())))
        })
}
fn publication_prefix(source: &str) -> &str {
    if source == "receivingAction" {
        "forwarded_v1"
    } else {
        "publication"
    }
}
fn can_forward_publication(publication: &str) -> bool {
    !publication.starts_with("forwarded_v1_")
}
fn connection_policy(c: &mut StoredConfig, channel_id: &str) {
    let incoming = c
        .connections
        .iter()
        .find(|v| v.channel_id == channel_id && v.receives());
    let outgoing = c
        .connections
        .iter()
        .find(|v| v.channel_id == channel_id && v.sends() && v.kind == "folder");
    if let Some(ch) = c.channels.iter_mut().find(|v| v.policy.id == channel_id) {
        ch.policy.publish_folder_enabled = outgoing.is_some();
        ch.policy.publish_folder_id = outgoing.and_then(|v| v.folder_id);
        ch.policy.receive_enabled = incoming.is_some();
        ch.policy.save_to_folder = incoming.is_some();
        ch.policy.receive_folder_id = incoming.and_then(|v| {
            if v.kind == "folder" {
                v.folder_id
            } else {
                None
            }
        });
    }
}
pub(crate) struct PreparedHead {
    config_digest: [u8; 32],
    input_digest: [u8; 32],
    boundary: Option<(String, u64)>,
    generation: Option<u64>,
}
pub(crate) struct PreparedHeads {
    config_digest: [u8; 32],
    channel_id: Option<String>,
    receive_paused: Option<bool>,
    boundaries: Vec<(String, u64)>,
    generations: Vec<(String, u64)>,
}
fn config_digest(c: &StoredConfig) -> Result<[u8; 32], String> {
    Ok(
        Sha256::digest(
            serde_json::to_vec(&serde_json::to_value(c).map_err(error)?).map_err(error)?,
        )
        .into(),
    )
}
fn connection_digest(input: &ConnectionInput) -> Result<[u8; 32], String> {
    Ok(Sha256::digest(serde_json::to_vec(&json!({"id":input.id,"channelId":input.channel_id,"kind":input.kind,"folderId":input.folder_id,"direction":input.direction,"moveReception":input.move_reception})).map_err(error)?).into())
}
fn same_reception(a: Option<&Connection>, b: Option<&Connection>) -> bool {
    match (a, b) {
        (None, None) => true,
        (Some(a), Some(b)) => {
            a.id == b.id
                && a.channel_id == b.channel_id
                && a.kind == b.kind
                && a.folder_id == b.folder_id
        }
        _ => false,
    }
}
fn recover_startup_once(storage: &AppStorage) -> Result<(), String> {
    let _admission = WORKER.lock().map_err(error)?;
    let s = store(storage)?;
    let mut started = STARTED
        .get_or_init(Default::default)
        .lock()
        .map_err(error)?;
    let profile = context_key(&s, "startup");
    if !started.contains(&profile) {
        s.recover_startup().map_err(error)?;
        started.insert(profile);
    }
    Ok(())
}
fn fetch_head(storage: &AppStorage, c: &StoredConfig, channel_id: &str) -> Result<u64, String> {
    let s = store(storage)?;
    let v = vault(&s, c)?;
    let page = client(&v, c)?
        .sync(
            channel_id,
            s.bootstrap_head(&sid(channel_id)).map_err(error)?,
        )
        .map_err(|_| {
            "Cannot establish the receiving boundary; previous connection was preserved".to_string()
        })?;
    page.head
        .parse()
        .map_err(|_| "Invalid receiving boundary".into())
}
pub(crate) fn prepare_connection_head(
    storage: &AppStorage,
    input: &ConnectionInput,
) -> Result<PreparedHead, String> {
    // Recovery must precede the acknowledged connection boundary, including
    // when the UI connects before the background worker's first poll.
    recover_startup_once(storage)?;
    let c = required(storage)?;
    let ch = channel(&c, &input.channel_id)?;
    if !crypto::valid_id(&input.id)
        || !matches!(input.kind.as_str(), "general" | "folder")
        || !matches!(input.direction.as_str(), "send" | "receive" | "both")
        || (input.kind == "general" && input.folder_id.is_some())
        || (matches!(input.direction.as_str(), "send" | "both") && !ch.policy.can_publish)
    {
        return Err("Invalid or unauthorized shared clipboard connection".into());
    }
    if let Some(folder) = input.folder_id {
        if folder <= 0 || !store(storage)?.folder_exists(folder).map_err(error)? {
            return Err("Connection folder does not exist".into());
        }
    }
    let requested = Connection {
        id: input.id.clone(),
        channel_id: input.channel_id.clone(),
        kind: input.kind.clone(),
        folder_id: input.folder_id,
        direction: input.direction.clone(),
    };
    let old = c
        .connections
        .iter()
        .find(|v| v.channel_id == input.channel_id && v.receives());
    if requested.receives() && old.is_some_and(|v| v.id != input.id) && !input.move_reception {
        return Err("Channel already receives elsewhere; explicitly move reception".into());
    }
    let generation = if requested.receives()
        && (!same_reception(old, Some(&requested)) || ch.receive_needs_head)
    {
        Some(
            store(storage)?
                .fence(&sid(&input.channel_id))
                .map_err(error)?
                .generation,
        )
    } else {
        None
    };
    let boundary = if generation.is_some() {
        Some((
            input.channel_id.clone(),
            fetch_head(storage, &c, &input.channel_id)?,
        ))
    } else {
        None
    };
    Ok(PreparedHead {
        config_digest: config_digest(&c)?,
        input_digest: connection_digest(input)?,
        boundary,
        generation,
    })
}
pub(crate) fn connect_with_head(
    storage: &AppStorage,
    input: ConnectionInput,
    head: PreparedHead,
) -> Result<SharedSnapshot, String> {
    connect_internal(storage, input, Some(head))
}
#[cfg(test)]
pub(crate) fn connect(
    storage: &AppStorage,
    input: ConnectionInput,
) -> Result<SharedSnapshot, String> {
    connect_internal(storage, input, None)
}
fn connect_internal(
    storage: &AppStorage,
    input: ConnectionInput,
    prepared: Option<PreparedHead>,
) -> Result<SharedSnapshot, String> {
    let _guard = WORKER.lock().map_err(error)?;
    let mut c = required(storage)?;
    if let Some(ref prepared) = prepared {
        if prepared.config_digest != config_digest(&c)?
            || prepared.input_digest != connection_digest(&input)?
        {
            return Err("Shared clipboard configuration changed during connection; retry".into());
        }
    }
    let s = store(storage)?;
    if let Some(ref prepared) = prepared {
        if let Some((ref id, _)) = prepared.boundary {
            if Some(s.fence(&sid(id)).map_err(error)?.generation) != prepared.generation {
                return Err("Receiving generation changed during connection; retry".into());
            }
        }
    }
    if !crypto::valid_id(&input.id)
        || !matches!(input.kind.as_str(), "general" | "folder")
        || !matches!(input.direction.as_str(), "send" | "receive" | "both")
        || (input.kind == "general" && input.folder_id.is_some())
    {
        return Err("Invalid shared clipboard connection".into());
    }
    if let Some(folder) = input.folder_id {
        if folder <= 0 || !s.folder_exists(folder).map_err(error)? {
            return Err("Connection folder does not exist".into());
        }
    }
    let connection = Connection {
        id: input.id,
        channel_id: input.channel_id,
        kind: input.kind,
        folder_id: input.folder_id,
        direction: input.direction,
    };
    let ch = channel(&c, &connection.channel_id)?;
    if connection.sends() && !ch.policy.can_publish {
        return Err("Publishing to this channel is not authorized".into());
    }
    let previous = c
        .connections
        .iter()
        .find(|v| v.id == connection.id)
        .cloned();
    let prior_receiver = c
        .connections
        .iter()
        .find(|v| v.channel_id == connection.channel_id && v.receives())
        .cloned();
    if connection.receives() {
        let conflicts = c.connections.iter().any(|v| {
            v.id != connection.id && v.channel_id == connection.channel_id && v.receives()
        });
        if conflicts && !input.move_reception {
            return Err("Channel already receives elsewhere; explicitly move reception".into());
        }
        if conflicts {
            c.connections.retain_mut(|v| {
                if v.id != connection.id && v.channel_id == connection.channel_id && v.receives() {
                    if v.sends() {
                        v.direction = "send".into();
                        true
                    } else {
                        false
                    }
                } else {
                    true
                }
            });
        }
    }
    c.connections.retain(|v| v.id != connection.id);
    c.connections.push(connection.clone());
    let mut changes = vec![];
    if let Some(previous) = previous.filter(|v| v.channel_id != connection.channel_id) {
        connection_policy(&mut c, &previous.channel_id);
        if previous.receives() {
            let ch = c
                .channels
                .iter_mut()
                .find(|v| v.policy.id == previous.channel_id)
                .unwrap();
            ch.receive_needs_head = ch.policy.receive_enabled;
            changes.push((
                sid(&previous.channel_id),
                ch.policy.save_to_folder,
                ch.policy.receive_folder_id,
            ));
        }
    }
    connection_policy(&mut c, &connection.channel_id);
    let receiver = c
        .connections
        .iter()
        .find(|v| v.channel_id == connection.channel_id && v.receives())
        .cloned();
    if !same_reception(prior_receiver.as_ref(), receiver.as_ref())
        || prepared.as_ref().is_some_and(|v| v.boundary.is_some())
    {
        let ch = c
            .channels
            .iter_mut()
            .find(|v| v.policy.id == connection.channel_id)
            .unwrap();
        ch.receive_needs_head = receiver.is_some() && prepared.is_none();
        changes.push((
            sid(&connection.channel_id),
            ch.policy.save_to_folder,
            ch.policy.receive_folder_id,
        ));
    }
    let heads: Vec<(String, u64)> = prepared
        .as_ref()
        .and_then(|v| v.boundary.as_ref())
        .map(|(id, head)| vec![(sid(id), *head)])
        .unwrap_or_default();
    s.save_transition_with_heads(&serde_json::to_string(&c).map_err(error)?, &changes, &heads)
        .map_err(error)?;
    for (subscription, _, _) in changes {
        // Clear all channel cache entries touched by this atomic transition.
        for ch in &c.channels {
            if sid(&ch.policy.id) == subscription {
                CONNECTED
                    .get_or_init(Default::default)
                    .lock()
                    .map_err(error)?
                    .remove(&context_key(&s, &ch.policy.id));
            }
        }
    }
    if let Some((id, _)) = prepared.and_then(|v| v.boundary) {
        CONNECTED
            .get_or_init(Default::default)
            .lock()
            .map_err(error)?
            .insert(context_key(&s, &id));
    }
    snapshot(storage)
}
pub(crate) fn disconnect(storage: &AppStorage, id: &str) -> Result<SharedSnapshot, String> {
    let _guard = WORKER.lock().map_err(error)?;
    let mut c = required(storage)?;
    let Some(connection) = c.connections.iter().find(|v| v.id == id).cloned() else {
        return snapshot(storage);
    };
    c.connections.retain(|v| v.id != id);
    connection_policy(&mut c, &connection.channel_id);
    let s = store(storage)?;
    if connection.receives() {
        let ch = c
            .channels
            .iter()
            .find(|v| v.policy.id == connection.channel_id)
            .unwrap();
        s.save_connection_transition(
            &serde_json::to_string(&c).map_err(error)?,
            &[(
                sid(&connection.channel_id),
                ch.policy.save_to_folder,
                ch.policy.receive_folder_id,
            )],
        )
        .map_err(error)?;
        CONNECTED
            .get_or_init(Default::default)
            .lock()
            .map_err(error)?
            .remove(&context_key(&s, &connection.channel_id));
    } else {
        save(&s, &c)?;
    }
    snapshot(storage)
}
pub(crate) fn set_general_scope(
    storage: &AppStorage,
    scope: &str,
) -> Result<SharedSnapshot, String> {
    if !matches!(scope, "unfiled" | "all") {
        return Err("Invalid general sending scope".into());
    }
    let _guard = WORKER.lock().map_err(error)?;
    let mut c = required(storage)?;
    c.general_send_scope = scope.into();
    save(&store(storage)?, &c)?;
    snapshot(storage)
}
pub(crate) fn action_target(
    storage: &AppStorage,
    action_id: &str,
) -> Result<Option<String>, String> {
    let c = required(storage)?;
    Ok(c.action_targets.get(action_id).cloned())
}
pub(crate) fn set_action_target(
    storage: &AppStorage,
    action_id: &str,
    channel_id: Option<&str>,
) -> Result<SharedSnapshot, String> {
    if action_id.is_empty() || action_id.len() > 128 {
        return Err("Invalid Action ID".into());
    }
    let _guard = WORKER.lock().map_err(error)?;
    let mut c = required(storage)?;
    if let Some(id) = channel_id {
        if !channel(&c, id)?.policy.can_publish {
            return Err("Action target does not allow publishing".into());
        }
        if !c.action_targets.contains_key(action_id) && c.action_targets.len() >= 256 {
            return Err("Too many Action targets".into());
        }
        c.action_targets.insert(action_id.into(), id.into());
    } else {
        c.action_targets.remove(action_id);
    }
    save(&store(storage)?, &c)?;
    snapshot(storage)
}
fn apply_flow(
    c: &mut StoredConfig,
    channel_id: Option<&str>,
    send_paused: Option<bool>,
    receive_paused: Option<bool>,
) -> Result<(), String> {
    if let Some(id) = channel_id {
        let ch = c
            .channels
            .iter_mut()
            .find(|v| v.policy.id == id)
            .ok_or("Channel is not enrolled")?;
        if let Some(paused) = send_paused {
            ch.policy.send_paused = paused;
        }
        if let Some(paused) = receive_paused {
            ch.policy.receive_paused = paused;
        }
    } else {
        if c.paused {
            c.send_paused = true;
            c.receive_paused = true;
            c.paused = false;
        }
        if let Some(paused) = send_paused {
            c.send_paused = paused;
        }
        if let Some(paused) = receive_paused {
            c.receive_paused = paused;
        }
    }
    Ok(())
}
pub(crate) fn prepare_receive_resume(
    storage: &AppStorage,
    channel_id: Option<&str>,
    receive_paused: Option<bool>,
) -> Result<PreparedHeads, String> {
    recover_startup_once(storage)?;
    let c = required(storage)?;
    let mut after = c.clone();
    apply_flow(&mut after, channel_id, None, receive_paused)?;
    let mut boundaries = vec![];
    let mut generations = vec![];
    if receive_paused == Some(false) {
        for ch in &c.channels {
            let next = channel(&after, &ch.policy.id)?;
            if receive_is_paused(&c, ch)
                && !receive_is_paused(&after, next)
                && next.policy.receive_enabled
            {
                generations.push((
                    ch.policy.id.clone(),
                    store(storage)?
                        .fence(&sid(&ch.policy.id))
                        .map_err(error)?
                        .generation,
                ));
                boundaries.push((
                    ch.policy.id.clone(),
                    fetch_head(storage, &c, &ch.policy.id)?,
                ));
            }
        }
    }
    Ok(PreparedHeads {
        config_digest: config_digest(&c)?,
        channel_id: channel_id.map(str::to_owned),
        receive_paused,
        boundaries,
        generations,
    })
}
pub(crate) fn set_flow_paused_with_heads(
    storage: &AppStorage,
    channel_id: Option<&str>,
    send_paused: Option<bool>,
    receive_paused: Option<bool>,
    heads: PreparedHeads,
) -> Result<SharedSnapshot, String> {
    set_flow_internal(
        storage,
        channel_id,
        send_paused,
        receive_paused,
        Some(heads),
    )
}
#[cfg(test)]
pub(crate) fn set_flow_paused(
    storage: &AppStorage,
    channel_id: Option<&str>,
    send_paused: Option<bool>,
    receive_paused: Option<bool>,
) -> Result<SharedSnapshot, String> {
    set_flow_internal(storage, channel_id, send_paused, receive_paused, None)
}
fn set_flow_internal(
    storage: &AppStorage,
    channel_id: Option<&str>,
    send_paused: Option<bool>,
    receive_paused: Option<bool>,
    prepared: Option<PreparedHeads>,
) -> Result<SharedSnapshot, String> {
    let _guard = WORKER.lock().map_err(error)?;
    let mut c = required(storage)?;
    if let Some(ref prepared) = prepared {
        if prepared.config_digest != config_digest(&c)?
            || prepared.channel_id.as_deref() != channel_id
            || prepared.receive_paused != receive_paused
        {
            return Err("Shared clipboard configuration changed during resume; retry".into());
        }
    }
    let s = store(storage)?;
    if let Some(ref prepared) = prepared {
        for (id, generation) in &prepared.generations {
            if s.fence(&sid(id)).map_err(error)?.generation != *generation {
                return Err("Receiving generation changed during resume; retry".into());
            }
        }
    }
    if let Some(id) = channel_id {
        channel(&c, id)?;
    }
    let before: HashMap<String, bool> = c
        .channels
        .iter()
        .map(|ch| (ch.policy.id.clone(), receive_is_paused(&c, ch)))
        .collect();
    apply_flow(&mut c, channel_id, send_paused, receive_paused)?;
    let changed: Vec<String> = c
        .channels
        .iter()
        .filter(|ch| before.get(&ch.policy.id).copied() != Some(receive_is_paused(&c, ch)))
        .map(|ch| ch.policy.id.clone())
        .collect();
    let mut transitions = vec![];
    for id in &changed {
        let ch = c.channels.iter_mut().find(|v| &v.policy.id == id).unwrap();
        ch.receive_needs_head = !prepared
            .as_ref()
            .is_some_and(|v| v.boundaries.iter().any(|(channel, _)| channel == id));
        transitions.push((
            sid(id),
            ch.policy.save_to_folder,
            ch.policy.receive_folder_id,
        ));
    }
    let heads: Vec<(String, u64)> = prepared
        .as_ref()
        .map(|v| {
            v.boundaries
                .iter()
                .map(|(id, head)| (sid(id), *head))
                .collect()
        })
        .unwrap_or_default();
    s.save_transition_with_heads(
        &serde_json::to_string(&c).map_err(error)?,
        &transitions,
        &heads,
    )
    .map_err(error)?;
    for id in changed {
        CONNECTED
            .get_or_init(Default::default)
            .lock()
            .map_err(error)?
            .remove(&context_key(&s, &id));
    }
    if let Some(prepared) = prepared {
        for (id, _) in prepared.boundaries {
            CONNECTED
                .get_or_init(Default::default)
                .lock()
                .map_err(error)?
                .insert(context_key(&s, &id));
        }
    }
    for ch in &c.channels {
        if send_is_paused(&c, ch) {
            LEASES
                .get_or_init(Default::default)
                .lock()
                .map_err(error)?
                .remove(&context_key(&s, &ch.policy.id));
        }
    }
    snapshot(storage)
}
fn historical_request_raw(
    storage: &AppStorage,
    channel_id: &str,
    path: &str,
) -> Result<(StoredConfig, StoredChannel, Value), String> {
    let c = required(storage)?;
    let ch = channel(&c, channel_id)?.clone();
    let s = store(storage)?;
    let v = vault(&s, &c)?;
    let relay = client(&v, &c)?;
    let page = relay
        .request_control("GET", path, None)
        .map_err(|_| "Historical range is unavailable or access was denied".to_string())?;
    // Revalidate local authority after network IO. Pauses do not prohibit an
    // explicit history query; audience/lifecycle changes invalidate it.
    let current = required(storage)?;
    let current_ch = channel(&current, channel_id)?;
    if current.environment != c.environment
        || current_ch.epoch != ch.epoch
        || current_ch.key_reference != ch.key_reference
        || current_ch
            .grants
            .iter()
            .map(|v| (&v.device_id, &v.public_key, v.revision))
            .collect::<Vec<_>>()
            != ch
                .grants
                .iter()
                .map(|v| (&v.device_id, &v.public_key, v.revision))
                .collect::<Vec<_>>()
    {
        return Err("Historical access changed during the request".into());
    }
    Ok((c, ch, page))
}
pub(crate) fn history_page(
    storage: &AppStorage,
    channel_id: &str,
    before: Option<&str>,
) -> Result<Value, String> {
    let _network = NETWORK
        .try_lock()
        .map_err(|_| "Sharing transport is busy; retry this history query".to_string())?;
    let cursor = match before {
        None => 0,
        Some("0") => 0,
        Some(value) => wire::counter(value).map_err(|_| "Invalid historical cursor")?,
    };
    let (c, ch, page) = historical_request_raw(
        storage,
        channel_id,
        &format!("/v2/resources/{channel_id}/history?cursor={cursor}&limit=50"),
    )?;
    let rows = page
        .get("entries")
        .and_then(Value::as_array)
        .ok_or("Invalid historical response")?;
    if rows.len() > 50 {
        return Err("Historical response is too large".into());
    }
    let mut entries = Vec::new();
    let mut last = cursor;
    for row in rows {
        let entry: transport::Entry =
            serde_json::from_value(row.clone()).map_err(|_| "Invalid historical entry")?;
        let sequence =
            wire::counter(&entry.server_sequence).map_err(|_| "Invalid historical sequence")?;
        if sequence <= last {
            return Err("Historical sequences are not ordered".into());
        }
        last = sequence;
        let e = &entry.envelope;
        let mut value = json!({"publicationId":e.publication_id,"channelId":channel_id,"sequence":entry.server_sequence,"originDeviceId":e.device_id,"expiresAtUnixMs":e.expires_at_unix_ms,"status":"unavailable"});
        if let Ok(text) = super::product::open_history_envelope(storage, &c, &ch, e) {
            let preview = text.content().preview()?;
            for (key, item) in preview.as_object().ok_or("Invalid publication preview")? { value[key] = item.clone(); }
            value["status"] = json!("available");
        }
        entries.push(value);
    }
    let head = page
        .get("head")
        .and_then(Value::as_str)
        .ok_or("Invalid historical head")?;
    let floor = page
        .get("history_floor")
        .or_else(|| page.get("floor"))
        .and_then(Value::as_str)
        .unwrap_or("0");
    let more = page
        .get("has_more")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    Ok(
        json!({"entries":entries,"before":if more {Some(last.to_string())} else {None},"head":head,"floor":floor}),
    )
}
fn historical_verified(
    storage: &AppStorage,
    channel_id: &str,
    publication: &str,
) -> Result<VerifiedContent, String> {
    if !crypto::valid_id(publication) {
        return Err("Invalid publication ID".into());
    }
    let (c, ch, response) = historical_request_raw(
        storage,
        channel_id,
        &format!("/v2/resources/{channel_id}/history/{publication}"),
    )?;
    let entry: transport::Entry = serde_json::from_value(
        response
            .get("entry")
            .filter(|e| !e.is_null())
            .ok_or("Publication is unavailable in the authorized historical range")?
            .clone(),
    )
    .map_err(|_| "Invalid historical entry")?;
    if entry.envelope.publication_id != publication {
        return Err("Historical publication ID mismatch".into());
    }
    super::product::open_history_envelope(storage, &c, &ch, &entry.envelope)
}
pub(crate) fn historical_text(
    storage: &AppStorage,
    channel_id: &str,
    publication: &str,
) -> Result<String, String> {
    let _network = NETWORK.lock().map_err(error)?;
    historical_verified(storage, channel_id, publication)?.content().text().map(str::to_owned)
        .ok_or_else(|| "This publication is an image; use Copy image".into())
}
pub(crate) fn prepare_historical_copy(
    storage: &AppStorage,
    channel_id: &str,
    publication: &str,
) -> Result<VerifiedContent, String> {
    let _network = NETWORK.lock().map_err(error)?;
    historical_verified(storage, channel_id, publication)
}
// Caller holds EFFECT_BARRIER. Revalidate authenticated bytes against current
// access immediately before the native writer, without a second network call.
pub(crate) fn admit_historical_copy(
    storage: &AppStorage,
    verified: &VerifiedContent,
) -> Result<ClipboardContent, String> {
    let _admission = WORKER.lock().map_err(error)?;
    let c = required(storage)?;
    let ch = channel(&c, &verified.envelope().channel_id)?;
    let current = super::product::open_history_envelope(storage, &c, ch, verified.envelope())?;
    store(storage)?
        .provenance_hash(&current.content().hash(), None)
        .map_err(error)?;
    Ok(current.content().clone())
}
pub(crate) fn historical_import(
    storage: &AppStorage,
    channel_id: &str,
    publication: &str,
    folder_id: Option<i64>,
) -> Result<Value, String> {
    let _network = NETWORK.lock().map_err(error)?;
    let verified = historical_verified(storage, channel_id, publication)?;
    let _admission = WORKER.lock().map_err(error)?;
    let c = required(storage)?;
    let ch = channel(&c, channel_id)?;
    let s = store(storage)?;
    let verified = super::product::open_history_envelope(storage, &c, ch, verified.envelope())?;
    s.import_manual(&verified, folder_id, now()?).map_err(error)
}

#[cfg(test)]
mod connection_tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};
    fn fixture() -> (std::path::PathBuf, AppStorage) {
        static NEXT: AtomicU64 = AtomicU64::new(0);
        let dir = std::env::temp_dir().join(format!(
            "copicu-shared-connections-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        let storage = AppStorage::open(&dir).unwrap();
        let s = store(&storage).unwrap();
        let mut c:StoredConfig=serde_json::from_value(json!({"environment":"synthetic","deviceId":"synthetic_device","endpoint":"http://127.0.0.1:1/","allowLoopback":true,"issuerPublicKey":"synthetic","enrollmentFingerprint":"synthetic","vaultName":"synthetic_vault","signingReference":"synthetic_signing","bearerReference":"synthetic_bearer","paused":false,"connectionVersion":1,"channels":[]})).unwrap();
        for id in ["channel_a", "channel_b"] {
            let policy:ChannelPolicy=serde_json::from_value(json!({"id":id,"name":id,"canPublish":true,"receiveEnabled":false,"publishFolderEnabled":false,"publishFolderId":null,"saveToFolder":false,"receiveFolderId":null,"updateClipboard":false})).unwrap();
            s.subscribe(Subscribe {
                id: sid(id),
                environment: c.environment.clone(),
                channel: id.into(),
                local_device: c.device_id.clone(),
                head: 0,
                history_enabled: false,
                folder_id: None,
            })
            .unwrap();
            c.channels.push(StoredChannel {
                policy,
                epoch: 1,
                key_reference: "synthetic_key".into(),
                grants: vec![],
                receive_needs_head: false,
            });
        }
        save(&s, &c).unwrap();
        (dir, storage)
    }
    fn input(
        id: &str,
        channel: &str,
        kind: &str,
        direction: &str,
        move_reception: bool,
    ) -> ConnectionInput {
        ConnectionInput {
            id: id.into(),
            channel_id: channel.into(),
            kind: kind.into(),
            folder_id: None,
            direction: direction.into(),
            move_reception,
        }
    }
    #[test]
    fn prepared_connection_commits_head_before_ack_and_rejects_identity_or_generation_drift() {
        let (dir, s) = fixture();
        let input = self::input("general", "channel_a", "general", "receive", false);
        let c = required(&s).unwrap();
        let store = store(&s).unwrap();
        let head = PreparedHead {
            config_digest: config_digest(&c).unwrap(),
            input_digest: connection_digest(&input).unwrap(),
            boundary: Some(("channel_a".into(), 10)),
            generation: Some(store.fence(&sid("channel_a")).unwrap().generation),
        };
        connect_with_head(&s, input, head).unwrap();
        assert_eq!(store.fence(&sid("channel_a")).unwrap().cursor, 10);
        assert!(!required(&s).unwrap().channels[0].receive_needs_head);
        assert!(CONNECTED
            .get()
            .unwrap()
            .lock()
            .unwrap()
            .contains(&context_key(&store, "channel_a")));
        let input = self::input("general", "channel_b", "general", "receive", false);
        let c = required(&s).unwrap();
        let head = PreparedHead {
            config_digest: config_digest(&c).unwrap(),
            input_digest: connection_digest(&input).unwrap(),
            boundary: Some(("channel_b".into(), 11)),
            generation: Some(store.fence(&sid("channel_b")).unwrap().generation),
        };
        store.policy(&sid("channel_b"), Policy::Paused, 0).unwrap();
        assert!(connect_with_head(&s, input, head)
            .err()
            .unwrap()
            .contains("generation changed"));
        assert_eq!(required(&s).unwrap().connections[0].channel_id, "channel_a");
        let input = self::input("general", "channel_b", "general", "receive", false);
        let c = required(&s).unwrap();
        let head = PreparedHead {
            config_digest: config_digest(&c).unwrap(),
            input_digest: connection_digest(&input).unwrap(),
            boundary: Some(("channel_b".into(), 11)),
            generation: Some(store.fence(&sid("channel_b")).unwrap().generation),
        };
        set_general_scope(&s, "all").unwrap();
        assert!(connect_with_head(&s, input, head)
            .err()
            .unwrap()
            .contains("configuration changed"));
        drop(s);
        std::fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn preparation_without_reception_does_not_require_network_and_offline_receive_preserves_previous(
    ) {
        let (dir, s) = fixture();
        let send = input("general", "channel_a", "general", "send", false);
        let head = prepare_connection_head(&s, &send).unwrap();
        assert!(head.boundary.is_none());
        connect_with_head(&s, send, head).unwrap();
        let receive = input("general", "channel_a", "general", "receive", false);
        assert!(prepare_connection_head(&s, &receive).is_err());
        assert_eq!(required(&s).unwrap().connections[0].direction, "send");
        let heads = prepare_receive_resume(&s, None, None).unwrap();
        assert!(heads.boundaries.is_empty());
        set_flow_paused_with_heads(&s, None, Some(true), None, heads).unwrap();
        assert!(snapshot(&s).unwrap().send_paused);
        drop(s);
        std::fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn prepared_resume_commits_skip_boundary_without_second_head_sampling() {
        let (dir, s) = fixture();
        connect(
            &s,
            input("general", "channel_a", "general", "receive", false),
        )
        .unwrap();
        set_flow_paused(&s, Some("channel_a"), None, Some(true)).unwrap();
        let c = required(&s).unwrap();
        let store = store(&s).unwrap();
        let heads = PreparedHeads {
            config_digest: config_digest(&c).unwrap(),
            channel_id: Some("channel_a".into()),
            receive_paused: Some(false),
            boundaries: vec![("channel_a".into(), 20)],
            generations: vec![(
                "channel_a".into(),
                store.fence(&sid("channel_a")).unwrap().generation,
            )],
        };
        set_flow_paused_with_heads(&s, Some("channel_a"), None, Some(false), heads).unwrap();
        assert_eq!(store.fence(&sid("channel_a")).unwrap().cursor, 20);
        assert!(!required(&s).unwrap().channels[0].receive_needs_head);
        assert!(CONNECTED
            .get()
            .unwrap()
            .lock()
            .unwrap()
            .contains(&context_key(&store, "channel_a")));
        drop(s);
        std::fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn one_receiver_explicit_transfer_and_change_resource_by_id() {
        let (dir, s) = fixture();
        connect(
            &s,
            input("folder_root", "channel_a", "folder", "both", false),
        )
        .unwrap();
        assert!(connect(
            &s,
            input("general", "channel_a", "general", "receive", false)
        )
        .is_err());
        connect(
            &s,
            input("general", "channel_a", "general", "receive", true),
        )
        .unwrap();
        let c = required(&s).unwrap();
        assert_eq!(c.connections.iter().filter(|v| v.receives()).count(), 1);
        assert_eq!(
            c.connections
                .iter()
                .find(|v| v.id == "folder_root")
                .unwrap()
                .direction,
            "send"
        );
        connect(
            &s,
            input("general", "channel_b", "general", "receive", false),
        )
        .unwrap();
        let c = required(&s).unwrap();
        assert!(!channel(&c, "channel_a").unwrap().policy.receive_enabled);
        assert!(channel(&c, "channel_b").unwrap().receive_needs_head);
        assert_eq!(c.connections.len(), 2);
        drop(s);
        std::fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn global_pause_dominates_preserves_channel_flags_across_restart() {
        let (dir, s) = fixture();
        set_flow_paused(&s, Some("channel_a"), Some(true), Some(true)).unwrap();
        set_flow_paused(&s, None, Some(true), Some(true)).unwrap();
        set_flow_paused(&s, None, Some(false), Some(false)).unwrap();
        assert!(publish_text(&s, "channel_a", "synthetic-only", "SDK")
            .unwrap_err()
            .contains("sending is paused"));
        let c = required(&s).unwrap();
        assert!(send_is_paused(&c, channel(&c, "channel_a").unwrap()));
        assert!(!send_is_paused(&c, channel(&c, "channel_b").unwrap()));
        assert!(receive_is_paused(&c, channel(&c, "channel_a").unwrap()));
        assert!(c.channels.iter().all(|ch| ch.receive_needs_head));
        drop(s);
        let reopened = AppStorage::open(&dir).unwrap();
        assert!(snapshot(&reopened).unwrap().channels[0].receive_paused);
        drop(reopened);
        std::fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn general_scope_excludes_moves_and_coalesces_folder_overlap() {
        let (dir, s) = fixture();
        connect(&s, input("general", "channel_a", "general", "send", false)).unwrap();
        let c = required(&s).unwrap();
        let ch = channel(&c, "channel_a").unwrap();
        assert!(ingress_matches(&c, ch, None, true));
        assert!(!ingress_matches(&c, ch, Some(9), true));
        assert!(!ingress_matches(&c, ch, None, false));
        set_general_scope(&s, "all").unwrap();
        let mut c = required(&s).unwrap();
        c.connections.push(Connection {
            id: "synthetic_folder".into(),
            channel_id: "channel_a".into(),
            kind: "folder".into(),
            folder_id: Some(9),
            direction: "send".into(),
        });
        assert!(ingress_matches(
            &c,
            channel(&c, "channel_a").unwrap(),
            Some(9),
            true
        ));
        assert!(ingress_matches(
            &c,
            channel(&c, "channel_a").unwrap(),
            Some(9),
            false
        ));
        assert!(!ingress_matches(
            &c,
            channel(&c, "channel_b").unwrap(),
            Some(9),
            true
        ));
        drop(s);
        std::fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn resume_skips_range_atomically_and_rejects_late_generation() {
        let (dir, s) = fixture();
        let store = store(&s).unwrap();
        let before = store.fence(&sid("channel_a")).unwrap();
        let after = store.resume_at_head(&sid("channel_a"), 12).unwrap();
        assert_eq!(after.cursor, 12);
        assert!(after.generation > before.generation);
        assert_eq!(store.bootstrap_head(&sid("channel_a")).unwrap(), 12);
        assert!(store.resume_at_head(&sid("channel_a"), 11).is_err());
        assert_eq!(store.fence(&sid("channel_a")).unwrap(), after);
        drop(s);
        std::fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn legacy_migration_is_deterministic_and_preserves_optins() {
        let (dir, s) = fixture();
        let mut c = required(&s).unwrap();
        c.connection_version = 0;
        c.channels[0].policy.publish_folder_enabled = true;
        c.channels[0].policy.receive_enabled = true;
        c.channels[0].policy.save_to_folder = false;
        migrate_connections(&mut c);
        let first = c.connections.clone();
        migrate_connections(&mut c);
        assert!(c.connections == first);
        assert_eq!(c.connections.len(), 2);
        assert!(!c.channels[0].policy.save_to_folder);
        assert!(!c.channels[0].receive_needs_head);
        drop(s);
        std::fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn failed_connection_transaction_retains_previous_resource_and_fence() {
        let (dir, s) = fixture();
        connect(
            &s,
            input("general", "channel_a", "general", "receive", false),
        )
        .unwrap();
        let store = store(&s).unwrap();
        let before = store.fence(&sid("channel_a")).unwrap();
        assert!(store
            .save_connection_transition(
                "{}",
                &[
                    (sid("channel_a"), true, None),
                    ("missing_subscription".into(), true, None)
                ]
            )
            .is_err());
        assert_eq!(store.fence(&sid("channel_a")).unwrap(), before);
        assert_eq!(required(&s).unwrap().connections[0].channel_id, "channel_a");
        drop(s);
        std::fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn signed_one_hop_forward_rejects_loops_and_directional_pauses() {
        use base64::Engine;
        let (dir, storage) = fixture();
        connect(
            &storage,
            input("incoming", "channel_a", "general", "receive", false),
        )
        .unwrap();
        let mut c = required(&storage).unwrap();
        c.channels[0].policy.receive_action_enabled = true;
        c.channels[0].policy.receive_action_id = Some("synthetic_action".into());
        c.channels[0].policy.receive_action_forward_channel_ids = vec!["channel_b".into()];
        let signing = DeviceSigner::generate(&mut SystemEntropy).unwrap();
        let key = ChannelKey::generate(
            "synthetic".into(),
            "channel_a".into(),
            1,
            &mut SystemEntropy,
        )
        .unwrap();
        let store = store(&storage).unwrap();
        store
            .set_grant(Grant {
                environment: "synthetic".into(),
                channel: "channel_a".into(),
                origin: "remote_synthetic".into(),
                public_key: signing.public(),
                epoch: 1,
                revision: 1,
            })
            .unwrap();
        c.channels[0].grants = vec![StoredGrant {
            device_id: "remote_synthetic".into(),
            public_key: base64::engine::general_purpose::STANDARD.encode(signing.public()),
            revision: 1,
        }];
        save(&store, &c).unwrap();
        let mut fence = store
            .policy(&sid("channel_a"), Policy::ReceiveMetadata, 0)
            .unwrap();
        for (sequence, publication) in [(1, "forwarded_v1_synthetic"), (2, "publication_synthetic")]
        {
            let envelope = crypto::seal(
                Envelope {
                    version: 1,
                    environment: "synthetic".into(),
                    channel_id: "channel_a".into(),
                    publication_id: publication.into(),
                    device_id: "remote_synthetic".into(),
                    origin_ordinal: sequence.to_string(),
                    key_epoch: "1".into(),
                    expires_at_unix_ms: (now().unwrap() + 10000).to_string(),
                    freshness: Freshness::Deferred,
                    nonce: vec![],
                    ciphertext: vec![],
                    signature: vec![],
                },
                "synthetic forwarding text",
                &key,
                &signing,
                &mut SystemEntropy,
            )
            .unwrap();
            let text = open_envelope(&c, &c.channels[0], &key, &envelope, now().unwrap()).unwrap();
            fence = store
                .admit_page(
                    &sid("channel_a"),
                    fence,
                    &[VerifiedArrival {
                        server_sequence: sequence,
                        text: &text,
                    }],
                    now().unwrap(),
                )
                .unwrap();
        }
        assert!(validate_reception_forward(
            &storage,
            "channel_a",
            "forwarded_v1_synthetic",
            "channel_b",
            fence.generation,
            "synthetic_action"
        )
        .unwrap_err()
        .contains("one authenticated hop"));
        validate_reception_forward(
            &storage,
            "channel_a",
            "publication_synthetic",
            "channel_b",
            fence.generation,
            "synthetic_action",
        )
        .unwrap();
        assert!(validate_reception_forward(
            &storage,
            "channel_a",
            "publication_synthetic",
            "channel_a",
            fence.generation,
            "synthetic_action"
        )
        .is_err());
        set_flow_paused(&storage, Some("channel_b"), Some(true), None).unwrap();
        assert!(validate_reception_forward(
            &storage,
            "channel_a",
            "publication_synthetic",
            "channel_b",
            fence.generation,
            "synthetic_action"
        )
        .is_err());
        set_flow_paused(&storage, Some("channel_b"), Some(false), None).unwrap();
        set_flow_paused(&storage, Some("channel_a"), None, Some(true)).unwrap();
        assert!(validate_reception_forward(
            &storage,
            "channel_a",
            "publication_synthetic",
            "channel_b",
            fence.generation,
            "synthetic_action"
        )
        .is_err());
        assert_eq!(publication_prefix("receivingAction"), "forwarded_v1");
        drop(storage);
        std::fs::remove_dir_all(dir).unwrap();
    }
}
fn sid(channel: &str) -> String {
    if channel.len() <= 120 {
        format!("channel_{channel}")
    } else {
        format!("channel_{}", hex(&Sha256::digest(channel.as_bytes())))
    }
}
fn context_key(store: &RuntimeStore<'_>, channel: &str) -> String {
    format!("{}|{channel}", store.profile_dir().display())
}
pub(super) fn binding(c: &StoredConfig, kind: KeyKind, reference: &str, epoch: u64) -> Binding {
    Binding {
        environment: c.environment.clone(),
        profile: "shared_product_v1".into(),
        device: c.device_id.clone(),
        kind,
        epoch,
        reference: reference.into(),
    }
}
pub(super) fn vault(store: &RuntimeStore<'_>, c: &StoredConfig) -> Result<Vault, String> {
    Vault::reopen(&store.profile_dir().join(&c.vault_name))
        .map_err(|_| "Cannot open protected sharing keys".into())
}
pub(super) fn key(
    vault: &Vault,
    c: &StoredConfig,
    ch: &StoredChannel,
) -> Result<ChannelKey, String> {
    vault
        .load_channel(&binding(
            c,
            KeyKind::Channel {
                channel: ch.policy.id.clone(),
            },
            &ch.key_reference,
            ch.epoch,
        ))
        .map_err(|_| "Cannot open protected channel key".into())
}
pub(super) fn signer(vault: &Vault, c: &StoredConfig) -> Result<DeviceSigner, String> {
    vault
        .load_signer(&binding(c, KeyKind::Signing, &c.signing_reference, 1))
        .map_err(|_| "Cannot open protected device identity".into())
}
pub(super) fn client(vault: &Vault, c: &StoredConfig) -> Result<RelayClient, String> {
    let token = vault
        .load_credential(&binding(c, KeyKind::Credential, &c.bearer_reference, 1))
        .map_err(|_| "Cannot open protected relay credential")?;
    let token = std::str::from_utf8(&token.0).map_err(error)?;
    RelayClient::with_timeout(
        &c.endpoint,
        &c.environment,
        &c.device_id,
        token,
        c.allow_loopback,
        Duration::from_secs(3),
    )
    .map_err(|_| "Invalid relay configuration".into())
}
pub(super) fn random_id(prefix: &str) -> Result<String, String> {
    let mut bytes = [0; 16];
    SystemEntropy.fill(&mut bytes).map_err(error)?;
    Ok(format!("{prefix}_{}", hex(&bytes)))
}
fn channel<'a>(c: &'a StoredConfig, id: &str) -> Result<&'a StoredChannel, String> {
    c.channels
        .iter()
        .find(|ch| ch.policy.id == id)
        .ok_or("Channel is not enrolled".into())
}
pub(super) fn open_envelope(
    c: &StoredConfig,
    ch: &StoredChannel,
    k: &ChannelKey,
    e: &Envelope,
    at: u64,
) -> Result<VerifiedContent, String> {
    let grant = ch
        .grants
        .iter()
        .find(|g| g.device_id == e.device_id)
        .ok_or("Publisher is not enrolled")?;
    let lease = match &e.freshness {
        Freshness::Live { lease_id } => Some(lease_id.as_str()),
        Freshness::Deferred => None,
    };
    crypto::open(
        e,
        k,
        &ReceivePolicy {
            environment: &c.environment,
            channel: &ch.policy.id,
            device: &e.device_id,
            signing_key: bytes32(&grant.public_key)?,
            epoch: ch.epoch,
            now_unix_ms: at,
            last_origin_ordinal: 0,
            live_lease: lease,
        },
    )
    .map_err(|_| "Publication could not be authenticated".into())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SharedSnapshot {
    pub identity_state: Option<String>,
    pub control_sync_state: String,
    pub unavailable_channel_ids: Vec<String>,
    pub available: bool,
    pub configured: bool,
    pub paused: bool,
    pub send_paused: bool,
    pub receive_paused: bool,
    pub connections: Vec<Connection>,
    pub general_send_scope: String,
    pub action_targets: HashMap<String, String>,
    pub environment: Option<String>,
    pub device_id: Option<String>,
    pub endpoint: Option<String>,
    pub channels: Vec<ChannelPolicy>,
    pub outbox: Vec<Value>,
    pub receipts: Vec<Value>,
    pub last_error: Option<String>,
    pub sync_diagnostic: Option<SyncDiagnostic>,
    pub send_active_shortcut: Option<String>,
    pub send_clipboard_shortcut: Option<String>,
}
pub(crate) fn snapshot(storage: &AppStorage) -> Result<SharedSnapshot, String> {
    let Some(c) = config(storage)? else {
        return Ok(SharedSnapshot {
            identity_state: None,
            control_sync_state: "off".into(),
            unavailable_channel_ids: vec![],
            available: true,
            configured: false,
            paused: true,
            send_paused: true,
            receive_paused: true,
            connections: vec![],
            general_send_scope: "unfiled".into(),
            action_targets: HashMap::new(),
            environment: None,
            device_id: None,
            endpoint: None,
            channels: vec![],
            outbox: vec![],
            receipts: vec![],
            last_error: None,
            sync_diagnostic: None,
            send_active_shortcut: None,
            send_clipboard_shortcut: None,
        });
    };
    let (outbox, receipts, last_error, sync_diagnostic) = store(storage)?.summaries().map_err(error)?;
    let control_sync_state = store(storage)?.control_status(None).map_err(error)?;
    let catalog = store(storage)?
        .control_cache(&super::control_sync::identity(&c))
        .map_err(error)?
        .map(|json| serde_json::from_str::<Value>(&json).map_err(error))
        .transpose()?;
    let unavailable_channel_ids = c.channels.iter().filter(|channel| {
        control_sync_state == "denied" || catalog.as_ref().is_some_and(|catalog| {
            catalog["resources"].as_array().is_some_and(|resources| {
                !resources.iter().any(|resource| resource["id"] == channel.policy.id)
            })
        })
    }).map(|channel| channel.policy.id.clone()).collect();
    Ok(SharedSnapshot {
        identity_state: store(storage)?.identity_json().map_err(error)?.and_then(|raw|serde_json::from_str::<Value>(&raw).ok()).and_then(|v|v["state"].as_str().map(str::to_owned)),
        control_sync_state,
        unavailable_channel_ids,
        available: true,
        configured: true,
        paused: c.paused,
        send_paused: c.paused || c.send_paused,
        receive_paused: c.paused || c.receive_paused,
        connections: c.connections,
        general_send_scope: c.general_send_scope,
        action_targets: c.action_targets,
        environment: Some(c.environment),
        device_id: Some(c.device_id),
        endpoint: Some(c.endpoint),
        channels: c.channels.into_iter().map(|c| c.policy).collect(),
        outbox,
        receipts,
        last_error,
        sync_diagnostic,
        send_active_shortcut: c.send_active_shortcut,
        send_clipboard_shortcut: c.send_clipboard_shortcut,
    })
}
pub(crate) fn enrollment_preview(
    _storage: &AppStorage,
    path: &str,
) -> Result<EnrollmentPreview, String> {
    load_bundle(path).map(|(_, p)| p)
}
pub(crate) fn configure(
    storage: &AppStorage,
    input: ConfigureInput,
) -> Result<SharedSnapshot, String> {
    let _guard = WORKER.lock().map_err(error)?;
    if config(storage)?.is_some() {
        return Err("This profile is already enrolled; pause it before changing devices".into());
    }
    let (bundle, preview) = load_bundle(&input.bundle_path)?;
    if input.confirmed_fingerprint != preview.fingerprint {
        return Err("The confirmed fingerprint does not match the enrollment file".into());
    }
    let s = store(storage)?;
    let name = random_id("shared_vault")?;
    let v = Vault::create(s.profile_dir(), &name)
        .map_err(|_| "Cannot create protected sharing vault")?;
    let mut c = StoredConfig {
        environment: bundle.environment.clone(),
        device_id: bundle.device_id.clone(),
        endpoint: bundle.endpoint.clone(),
        allow_loopback: bundle.allow_loopback,
        issuer_public_key: bundle.issuer_public_key.clone(),
        enrollment_fingerprint: preview.fingerprint,
        vault_name: name,
        signing_reference: "device_signing".into(),
        bearer_reference: "relay_credential".into(),
        paused: false,
        send_paused: false,
        receive_paused: false,
        connections: vec![],
        connection_version: 1,
        general_send_scope: "unfiled".into(),
        action_targets: HashMap::new(),
        send_active_shortcut: None,
        send_clipboard_shortcut: None,
        channels: vec![],
    };
    let signing = DeviceSigner::restore_secret(secret32(&bundle.signing_seed)?).map_err(error)?;
    v.store_signer(
        &binding(&c, KeyKind::Signing, &c.signing_reference, 1),
        &signing,
    )
    .map_err(error)?;
    v.store_credential(
        &binding(&c, KeyKind::Credential, &c.bearer_reference, 1),
        &bundle.bearer,
    )
    .map_err(error)?;
    for (b, policy) in bundle.channels.iter().zip(preview.channels) {
        let reference = random_id("channel_key")?;
        let k = ChannelKey::from_secret(
            c.environment.clone(),
            b.id.clone(),
            b.epoch,
            secret32(&b.key)?,
        )
        .map_err(error)?;
        v.store_channel(
            &binding(
                &c,
                KeyKind::Channel {
                    channel: b.id.clone(),
                },
                &reference,
                b.epoch,
            ),
            &k,
        )
        .map_err(error)?;
        for g in &b.grants {
            s.set_grant(Grant {
                environment: c.environment.clone(),
                channel: b.id.clone(),
                origin: g.device_id.clone(),
                public_key: bytes32(&g.public_key)?,
                epoch: b.epoch,
                revision: g.revision,
            })
            .map_err(error)?;
        }
        s.subscribe(Subscribe {
            id: sid(&b.id),
            environment: c.environment.clone(),
            channel: b.id.clone(),
            local_device: c.device_id.clone(),
            head: 0,
            history_enabled: false,
            folder_id: None,
        })
        .map_err(error)?;
        c.channels.push(StoredChannel {
            policy,
            epoch: b.epoch,
            key_reference: reference,
            grants: b.grants.clone(),
            receive_needs_head: false,
        });
    }
    save(&s, &c)?;
    snapshot(storage)
}
pub(crate) fn update_channel(
    storage: &AppStorage,
    policy: ChannelPolicy,
) -> Result<SharedSnapshot, String> {
    let _guard = WORKER.lock().map_err(error)?;
    let mut c = required(storage)?;
    let s = store(storage)?;
    let index = c
        .channels
        .iter()
        .position(|ch| ch.policy.id == policy.id)
        .ok_or("Channel is not enrolled")?;
    let previous_policy = c.channels[index].policy.clone();
    if policy.can_publish != c.channels[index].policy.can_publish
        || policy.name != c.channels[index].policy.name
        || (policy.publish_folder_enabled && !policy.can_publish)
    {
        return Err("Channel permissions cannot be changed by a folder policy".into());
    }
    let action_writer = policy.receive_action_enabled && policy.receive_action_writes_clipboard;
    if policy.update_clipboard && action_writer {
        return Err(
            "Choose the channel clipboard writer or its receiving Action writer, not both".into(),
        );
    }
    if (policy.update_clipboard || action_writer)
        && c.channels.iter().enumerate().any(|(i, ch)| {
            i != index
                && (ch.policy.update_clipboard
                    || (ch.policy.receive_action_enabled
                        && ch.policy.receive_action_writes_clipboard))
        })
    {
        return Err("Only one channel can update the Windows clipboard automatically".into());
    }
    if policy.default_send_channel
        && (!policy.can_publish
            || c.channels
                .iter()
                .enumerate()
                .any(|(i, ch)| i != index && ch.policy.default_send_channel))
    {
        return Err("Choose only one default publishing channel".into());
    }
    if policy.receive_action_forward_channel_ids.iter().any(|id| {
        id == &policy.id
            || channel(&c, id).is_err()
            || !channel(&c, id).is_ok_and(|ch| ch.policy.can_publish)
    }) {
        return Err("Forwarding targets must be other authorized publishing channels".into());
    }
    if policy.receive_action_enabled
        && policy
            .receive_action_id
            .as_ref()
            .is_none_or(|v| v.is_empty() || v.len() > 128)
    {
        return Err("Choose an authorized receiving Action".into());
    }
    if let Some(folder) = policy.publish_folder_id {
        if folder <= 0 {
            return Err("Invalid publishing folder".into());
        }
        if policy.publish_folder_enabled && !s.folder_exists(folder).map_err(error)? {
            return Err("Publishing folder no longer exists".into());
        }
    }
    s.history_policy(
        &sid(&policy.id),
        policy.save_to_folder,
        policy.receive_folder_id,
    )
    .map_err(error)?;
    let head = s.bootstrap_head(&sid(&policy.id)).map_err(error)?;
    s.policy(&sid(&policy.id), Policy::Paused, head)
        .map_err(error)?;
    CONNECTED
        .get_or_init(Default::default)
        .lock()
        .map_err(error)?
        .remove(&context_key(&s, &policy.id));
    c.channels[index].policy = policy;
    c.channels[index].receive_needs_head = c.channels[index].policy.receive_enabled;
    let policy = &c.channels[index].policy;
    if previous_policy.publish_folder_enabled != policy.publish_folder_enabled
        || previous_policy.publish_folder_id != policy.publish_folder_id
        || previous_policy.receive_enabled != policy.receive_enabled
        || previous_policy.save_to_folder != policy.save_to_folder
        || previous_policy.receive_folder_id != policy.receive_folder_id
    {
        let channel_id = policy.id.clone();
        c.connections.retain(|v| v.channel_id != channel_id);
        if policy.publish_folder_enabled {
            c.connections.push(Connection {
                id: format!("legacy_send_{channel_id}"),
                channel_id: channel_id.clone(),
                kind: "folder".into(),
                folder_id: policy.publish_folder_id,
                direction: "send".into(),
            });
        }
        if policy.receive_enabled {
            c.connections.push(Connection {
                id: format!("legacy_receive_{channel_id}"),
                channel_id,
                kind: if policy.save_to_folder {
                    "folder"
                } else {
                    "general"
                }
                .into(),
                folder_id: policy.receive_folder_id,
                direction: "receive".into(),
            });
        }
    }
    save(&s, &c)?;
    snapshot(storage)
}
#[cfg(test)]
pub(crate) fn set_paused(storage: &AppStorage, paused: bool) -> Result<SharedSnapshot, String> {
    let _guard = WORKER.lock().map_err(error)?;
    let mut c = required(storage)?;
    let s = store(storage)?;
    for ch in &c.channels {
        let head = s.bootstrap_head(&sid(&ch.policy.id)).map_err(error)?;
        s.policy(&sid(&ch.policy.id), Policy::Paused, head)
            .map_err(error)?;
        CONNECTED
            .get_or_init(Default::default)
            .lock()
            .map_err(error)?
            .remove(&context_key(&s, &ch.policy.id));
        LEASES
            .get_or_init(Default::default)
            .lock()
            .map_err(error)?
            .remove(&context_key(&s, &ch.policy.id));
    }
    c.paused = paused;
    for ch in &mut c.channels {
        ch.receive_needs_head = true;
    }
    save(&s, &c)?;
    snapshot(storage)
}
pub(crate) fn record_error(storage: &AppStorage, reason: &str) {
    if config(storage).ok().flatten().is_some() {
        if let Ok(s) = store(storage) {
            let _ = s.record_error(Some(reason));
        }
    }
}
pub(crate) fn record_sync_error(storage: &AppStorage, failure: SyncError) {
    if let Ok(s) = store(storage) {
        if let Ok(json) = serde_json::to_string(&failure.diagnostic(now().ok(), None)) {
            let _ = s.record_network_error(Some(&json));
        }
    }
}
pub(crate) fn publish_channels(storage: &AppStorage) -> Result<Value, String> {
    let c = required(storage)?;
    Ok(json!(c
        .channels
        .iter()
        .filter(|ch| ch.policy.can_publish)
        .map(|ch| json!({"id":ch.policy.id,"name":ch.policy.name}))
        .collect::<Vec<_>>()))
}
pub(crate) fn default_publish_channel(storage: &AppStorage) -> Result<String, String> {
    let c = required(storage)?;
    let allowed = c
        .channels
        .iter()
        .filter(|ch| ch.policy.can_publish)
        .collect::<Vec<_>>();
    if let Some(ch) = allowed.iter().find(|ch| ch.policy.default_send_channel) {
        return Ok(ch.policy.id.clone());
    }
    if allowed.len() == 1 {
        return Ok(allowed[0].policy.id.clone());
    }
    Err("Choose a default publishing channel for the Send shortcuts".into())
}
pub(crate) fn set_default_channel(
    storage: &AppStorage,
    channel_id: &str,
) -> Result<SharedSnapshot, String> {
    let _guard = WORKER.lock().map_err(error)?;
    let mut c = required(storage)?;
    if !channel(&c, channel_id)?.policy.can_publish {
        return Err("This channel does not permit publishing".into());
    }
    for ch in &mut c.channels {
        ch.policy.default_send_channel = ch.policy.id == channel_id;
    }
    save(&store(storage)?, &c)?;
    snapshot(storage)
}
pub(crate) fn configured_hotkeys(storage: &AppStorage) -> Result<Vec<(String, String)>, String> {
    let Some(c) = config(storage)? else {
        return Ok(vec![]);
    };
    let mut keys = Vec::new();
    if let Some(key) = c.send_active_shortcut {
        keys.push(("builtin.sharedSendActive".into(), key));
    }
    if let Some(key) = c.send_clipboard_shortcut {
        keys.push(("builtin.sharedSendClipboard".into(), key));
    }
    Ok(keys)
}
/// Host validates OS shortcut availability/conflicts before persisting.
pub(crate) fn set_hotkeys(
    storage: &AppStorage,
    active: Option<String>,
    clipboard: Option<String>,
) -> Result<SharedSnapshot, String> {
    let _worker = WORKER.lock().map_err(error)?;
    if active
        .as_ref()
        .is_some_and(|v| v.is_empty() || v.len() > 128)
        || clipboard
            .as_ref()
            .is_some_and(|v| v.is_empty() || v.len() > 128)
        || active.is_some() && active == clipboard
    {
        return Err("Choose distinct supported Send shortcuts".into());
    }
    let mut c = required(storage)?;
    c.send_active_shortcut = active;
    c.send_clipboard_shortcut = clipboard;
    save(&store(storage)?, &c)?;
    snapshot(storage)
}
pub(crate) fn publish_text(
    storage: &AppStorage,
    channel_id: &str,
    text: &str,
    _source: &str,
) -> Result<Value, String> {
    let _worker = WORKER.lock().map_err(error)?;
    publish_text_unlocked(storage, channel_id, text, _source)
}
fn publish_text_unlocked(
    storage: &AppStorage,
    channel_id: &str,
    text: &str,
    _source: &str,
) -> Result<Value, String> {
    publish_content_unlocked(storage, channel_id, &ClipboardContent::Text(text.into()), _source)
}
pub(crate) fn publish_content(storage: &AppStorage, channel_id: &str, content: &ClipboardContent, source: &str) -> Result<Value, String> {
    let _worker = WORKER.lock().map_err(error)?;
    publish_content_unlocked(storage, channel_id, content, source)
}
pub(crate) fn authorize_publish(storage: &AppStorage, channel_id: &str) -> Result<(), String> {
    let c = required(storage)?;
    let ch = channel(&c, channel_id)?;
    if send_is_paused(&c, ch) || !ch.policy.can_publish { return Err("Shared clipboard sending is paused or access was denied".into()); }
    Ok(())
}
fn publish_content_unlocked(storage: &AppStorage, channel_id: &str, content: &ClipboardContent, _source: &str) -> Result<Value, String> {
    let c = required(storage)?;
    let ch = channel(&c, channel_id)?;
    if send_is_paused(&c, ch) {
        return Err("Shared clipboard sending is paused".into());
    }
    if !ch.policy.can_publish {
        return Err("Publishing to this channel is not authorized".into());
    }
    content.validate()?;
    let s = store(storage)?;
    let v = vault(&s, &c)?;
    let k = key(&v, &c, ch)?;
    let signing = signer(&v, &c)?;
    // Signed publication ID marks a host-assigned, one-hop receiving Action
    // forward. The next receiver cannot automatically forward it again.
    let publication = random_id(publication_prefix(_source))?;
    let at = now()?;
    let freshness = LEASES
        .get_or_init(Default::default)
        .lock()
        .map_err(error)?
        .get(&context_key(&s, channel_id))
        .and_then(|(lease, start)| {
            let duration = wire::counter(&lease.max_duration_ms).ok()?;
            let expiry = wire::counter(&lease.expires_at_unix_ms).ok()?;
            if start.elapsed().as_millis() < u128::from(duration) && at < expiry {
                Some(Freshness::Live {
                    lease_id: lease.lease_id.clone(),
                })
            } else {
                None
            }
        })
        .unwrap_or(Freshness::Deferred);
    let ordinal = s
        .reserve(&publication, &c.environment, channel_id, &c.device_id)
        .map_err(error)?;
    let sealed = crypto::seal_content(
        Envelope {
            version: 1,
            environment: c.environment.clone(),
            channel_id: channel_id.into(),
            publication_id: publication.clone(),
            device_id: c.device_id.clone(),
            origin_ordinal: ordinal.to_string(),
            key_epoch: ch.epoch.to_string(),
            expires_at_unix_ms: at
                .checked_add(86_400_000)
                .ok_or("Clock is outside the supported range")?
                .to_string(),
            freshness,
            nonce: vec![],
            ciphertext: vec![],
            signature: vec![],
        },
        content,
        &k,
        &signing,
        &mut SystemEntropy,
    );
    let result = sealed
        .map_err(error)
        .and_then(|e| s.queue(&e, at).map_err(error));
    if let Err(err) = result {
        let _ = s.abandon_preparing(&publication);
        return Err(err);
    }
    Ok(json!({"publicationId":publication,"state":"queued"}))
}
pub(crate) fn is_remote_item_or_text(
    storage: &AppStorage,
    item: Option<i64>,
    text: &str,
) -> Result<bool, String> {
    if config(storage)?.is_none() {
        return Ok(false);
    }
    store(storage)?.is_remote(item, text).map_err(error)
}
pub(crate) fn publish_folder_ingress(
    storage: &AppStorage,
    folder: Option<i64>,
    item: i64,
    new_ingress: bool,
) -> Result<usize, String> {
    let _worker = WORKER.lock().map_err(error)?;
    let Some(c) = config(storage)? else {
        return Ok(0);
    };
    if c.paused || c.send_paused {
        return Ok(0);
    }
    let clip = storage.get_item(item)?;
    if !matches!(clip.content_kind(), "text" | "image")
        || store(storage)?.is_remote_hash(Some(item), clip.normalized_hash()).map_err(error)? {
        return Ok(0);
    }
    let content = ClipboardContent::from_item(storage, item)?;
    let mut count = 0;
    for ch in &c.channels {
        if ingress_matches(&c, ch, folder, new_ingress) {
            publish_content_unlocked(storage, &ch.policy.id, &content, "folderIngress")?;
            count += 1;
        }
    }
    Ok(count)
}

pub(crate) struct IncomingEffect {
    pub subscription_id: String,
    pub publication_id: String,
    pub channel_id: String,
    pub origin_device_id: String,
    pub generation: u64,
    pub sequence: u64,
    pub content: ClipboardContent,
    pub lease_expires_at_unix_ms: u64,
    pub lease_started: Instant,
    pub lease_duration_ms: u64,
    pub action_id: Option<String>,
    pub update_clipboard: bool,
}
pub(crate) struct PollResult {
    pub effects: Vec<IncomingEffect>,
    pub history_changed: bool,
}
pub(crate) fn poll_once(storage: &AppStorage) -> Result<PollResult, SyncError> {
    let Ok(_worker) = NETWORK.try_lock() else {
        return Ok(PollResult {
            effects: vec![],
            history_changed: false,
        });
    };
    let Some(c) = config(storage).map_err(|reason| SyncError::at("Read sharing configuration", reason))? else {
        return Ok(PollResult {
            effects: vec![],
            history_changed: false,
        });
    };
    let s = store(storage).map_err(|reason| SyncError::at("Open local sharing storage", reason))?;
    recover_startup_once(storage).map_err(|reason| SyncError::at("Recover local sharing state", reason))?;
    let mut result = PollResult {
        effects: vec![],
        history_changed: false,
    };
    {
        let profile = context_key(&s, "retention");
        let mut pruned = PRUNED.get_or_init(Default::default).lock().map_err(error)?;
        if pruned
            .get(&profile)
            .is_none_or(|last| last.elapsed() > Duration::from_secs(60))
        {
            let _admission = WORKER.lock().map_err(error)?;
            s.prune_product(now()?).map_err(|cause| SyncError::at("Clean up expired sharing data", error(cause)))?;
            pruned.insert(profile, Instant::now());
        }
    }
    if c.paused {
        return Ok(result);
    }
    let v = Vault::reopen(&s.profile_dir().join(&c.vault_name))
        .map_err(|cause| SyncError::keys("Open protected sharing keys", cause))?;
    let relay = client(&v, &c).map_err(|reason| SyncError::at("Prepare sharing service credentials", reason))?;
    let signing = v.load_signer(&binding(&c, KeyKind::Signing, &c.signing_reference, 1))
        .map_err(|cause| SyncError::keys("Open protected device identity", cause))?;
    let issuer = bytes32(&c.issuer_public_key).map_err(|_| SyncError::at("Read sharing service identity", "Invalid shared clipboard configuration".into()))?;
    let mut failed = None;
    for ch in &c.channels {
        let outcome = poll_channel(&s, &c, ch, &v, &relay, &signing, &issuer, &mut result);
        if let Err(failure) = outcome {
            failed = Some(failure.diagnostic(now().ok(), Some(ch.policy.id.clone())));
            CONNECTED
                .get_or_init(Default::default)
                .lock()
                .map_err(error)?
                .remove(&context_key(&s, &ch.policy.id));
            LEASES
                .get_or_init(Default::default)
                .lock()
                .map_err(error)?
                .remove(&context_key(&s, &ch.policy.id));
            break;
        }
    }
    let diagnostic_json = failed.as_ref().map(serde_json::to_string).transpose().map_err(error)?;
    s.record_network_error(diagnostic_json.as_deref()).map_err(error)?;
    Ok(result)
}
fn poll_channel(
    s: &RuntimeStore<'_>,
    c: &StoredConfig,
    ch: &StoredChannel,
    v: &Vault,
    relay: &RelayClient,
    signing: &DeviceSigner,
    issuer: &[u8; 32],
    result: &mut PollResult,
) -> Result<(), SyncError> {
    {
        let _admission = WORKER.lock().map_err(error)?;
        let current = required(s.storage_ref())?;
        if current.paused || channel(&current, &ch.policy.id)?.policy != ch.policy {
            return Ok(());
        }
    }
    if ch.policy.can_publish && !send_is_paused(c, ch) {
        // Drain a bounded FIFO batch so a short burst does not age behind one
        // dispatch per poll. Recheck pause/access before every request; retain
        // immutable envelopes and the real result of an in-flight request.
        let dispatch_started = Instant::now();
        for _ in 0..32 {
            if dispatch_started.elapsed() >= Duration::from_secs(1) {
                break;
            }
            let dispatch = {
                let _admission = WORKER.lock().map_err(error)?;
                let current = required(s.storage_ref())?;
                let current_channel = channel(&current, &ch.policy.id)?;
                if send_is_paused(&current, current_channel)
                    || !current_channel.policy.can_publish
                    || current_channel.policy != ch.policy
                {
                    None
                } else {
                    s.queued(&c.environment, &ch.policy.id, &c.device_id, now()?)
                        .map_err(error)?
                }
            };
            let Some(e) = dispatch else {
                break;
            };
            match relay.publish(&e) {
                Ok(ack) => s
                    .accepted(
                        &e.publication_id,
                        wire::counter(&ack.server_sequence).map_err(error)?,
                    )
                    .map_err(error)?,
                Err(cause @ (
                    transport::Error::Denied
                    | transport::Error::Conflict
                    | transport::Error::Rejected
                    | transport::Error::TooLarge
                )) => {
                    s.reject_queued(&e.publication_id).map_err(error)?;
                    return Err(SyncError::transport("Send queued publication", cause));
                }
                Err(cause) => return Err(SyncError::transport("Send queued publication", cause)),
            }
        }
        let cache = LEASES.get_or_init(Default::default);
        let refresh = cache
            .lock()
            .map_err(error)?
            .get(&context_key(s, &ch.policy.id))
            .is_none_or(|(_, at)| at.elapsed() > Duration::from_secs(5));
        if refresh {
            let started = Instant::now();
            let lease = relay
                .lease(&ch.policy.id, issuer)
                .map_err(|cause| SyncError::transport("Acquire live publication lease", cause))?;
            let _admission = WORKER.lock().map_err(error)?;
            let current = required(s.storage_ref())?;
            let current_channel = channel(&current, &ch.policy.id)?;
            if !send_is_paused(&current, current_channel) && current_channel.policy.can_publish {
                cache
                    .lock()
                    .map_err(error)?
                    .insert(context_key(s, &ch.policy.id), (lease, started));
            }
        }
    }
    if !ch.policy.receive_enabled || receive_is_paused(c, ch) {
        return Ok(());
    }
    let subscription = sid(&ch.policy.id);
    let mut fence = s.fence(&subscription).map_err(error)?;
    let received = Instant::now();
    let page = relay
        .sync(&ch.policy.id, fence.cursor)
        .map_err(|cause| SyncError::transport("Receive shared publications", cause))?;
    let admission = WORKER.lock().map_err(error)?;
    let current = required(s.storage_ref())?;
    if receive_is_paused(&current, channel(&current, &ch.policy.id)?)
        || channel(&current, &ch.policy.id)?.policy != ch.policy
        || s.fence(&subscription).map_err(error)? != fence
    {
        return Ok(());
    }
    if ch.receive_needs_head {
        // Connection/resume skips its existing range. History remains available
        // through the independent manual API, without delivery cursor changes.
        s.resume_at_head(&subscription, page.head.parse().map_err(error)?)
            .map_err(error)?;
        let mut current = current;
        current
            .channels
            .iter_mut()
            .find(|v| v.policy.id == ch.policy.id)
            .unwrap()
            .receive_needs_head = false;
        save(s, &current)?;
        CONNECTED
            .get_or_init(Default::default)
            .lock()
            .map_err(error)?
            .insert(context_key(s, &ch.policy.id));
        return Ok(());
    }
    let connected = CONNECTED.get_or_init(Default::default);
    let first = connected
        .lock()
        .map_err(error)?
        .insert(context_key(s, &ch.policy.id));
    if first {
        fence = s
            .policy(
                &subscription,
                Policy::ReceiveMetadata,
                page.head.parse().map_err(error)?,
            )
            .map_err(error)?;
    }
    if let Some(gap) = &page.gap {
        fence = s
            .gap(
                &subscription,
                &random_id("gap")?,
                fence,
                gap.last_lost.parse().map_err(error)?,
                page.head.parse().map_err(error)?,
            )
            .map_err(error)?;
    }
    let k = v.load_channel(&binding(c, KeyKind::Channel { channel: ch.policy.id.clone() }, &ch.key_reference, ch.epoch))
        .map_err(|cause| SyncError::keys("Open protected reception key", cause))?;
    let bootstrap = s.bootstrap_head(&subscription).map_err(error)?;
    for entry in page.entries {
        let sequence = wire::counter(&entry.server_sequence).map_err(error)?;
        let e = &entry.envelope;
        let at = now()?;
        let verified = match open_envelope(c, ch, &k, e, at) {
            Ok(v) => v,
            Err(_) => {
                fence = s
                    .admit_unavailable(&subscription, fence, sequence, e, false, at)
                    .map_err(error)?;
                continue;
            }
        };
        // Reject a live claim without the pinned issuer proof. A malformed row
        // stays visible and cannot block subsequent valid publications.
        let lease = match (&e.freshness, &entry.lease_proof) {
            (Freshness::Live { lease_id }, Some(proof))
                if proof.lease_id == *lease_id
                    && proof
                        .verify_scope(issuer, &c.environment, &ch.policy.id, &e.device_id)
                        .is_ok() =>
            {
                Some(proof)
            }
            (Freshness::Deferred, None) => None,
            _ => {
                fence = s
                    .admit_unavailable(&subscription, fence, sequence, e, false, at)
                    .map_err(error)?;
                continue;
            }
        };
        fence = s
            .admit_page(
                &subscription,
                fence,
                &[VerifiedArrival {
                    server_sequence: sequence,
                    text: &verified,
                }],
                at,
            )
            .map_err(error)?;
        if e.device_id == c.device_id {
            continue;
        }
        s.provenance_hash(&verified.content().hash(), None).map_err(error)?;
        if ch.policy.save_to_folder {
            match s.history_import(&subscription, fence, &verified, &random_id("history")?, at) {
                Ok(HistoryOutcome::Applied { item }) => {
                    s.provenance_hash(&verified.content().hash(), item).map_err(error)?;
                    result.history_changed = true;
                }
                Ok(HistoryOutcome::MissingFolder) => {}
                Err(_) => {}
            }
        }
        if !first
            && sequence > bootstrap
            && (ch.policy.update_clipboard || ch.policy.receive_action_enabled)
        {
            if let Some(lease) = lease {
                let expiry = wire::counter(&lease.expires_at_unix_ms).map_err(error)?;
                let duration = wire::counter(&lease.max_duration_ms).map_err(error)?;
                if at < expiry && received.elapsed().as_millis() < u128::from(duration) {
                    result.effects.push(IncomingEffect {
                        subscription_id: subscription.clone(),
                        publication_id: e.publication_id.clone(),
                        channel_id: ch.policy.id.clone(),
                        origin_device_id: e.device_id.clone(),
                        generation: fence.generation,
                        sequence,
                        content: verified.content().clone(),
                        lease_expires_at_unix_ms: expiry,
                        lease_started: received,
                        lease_duration_ms: duration,
                        action_id: if ch.policy.receive_action_enabled && verified.content().text().is_some() {
                            ch.policy.receive_action_id.clone()
                        } else {
                            None
                        },
                        update_clipboard: ch.policy.update_clipboard,
                    });
                }
            }
        }
    }
    drop(admission);
    for p in s.report_pending(&subscription).map_err(error)? {
        let mut report = Report {
            attempt_id: p.attempt_id.clone(),
            publication_id: p.publication_id,
            sink: p.sink,
            outcome: p.outcome,
            signature: String::new(),
        };
        report
            .sign(&p.environment, &p.channel, &p.device, signing)
            .map_err(error)?;
        relay
            .report(&p.channel, &report)
            .map_err(|cause| SyncError::transport("Acknowledge delivery report", cause))?;
        s.ack_report(&subscription, &p.attempt_id).map_err(error)?;
    }
    // One latest writer per channel/sink; intermediate eligible publications
    // remain visible for manual copying, without overwriting Windows in a burst.
    let last = result
        .effects
        .iter()
        .rposition(|e| e.channel_id == ch.policy.id);
    if let Some(last) = last {
        let publication = result.effects[last].publication_id.clone();
        for effect in result
            .effects
            .iter_mut()
            .filter(|e| e.channel_id == ch.policy.id && e.publication_id != publication)
        {
            effect.update_clipboard = false;
        }
        result
            .effects
            .retain(|e| e.update_clipboard || e.action_id.is_some());
    }
    Ok(())
}
pub(crate) fn receipt_text(
    storage: &AppStorage,
    subscription: &str,
    publication: &str,
) -> Result<String, String> {
    let c = required(storage)?;
    let s = store(storage)?;
    let v = vault(&s, &c)?;
    let e = s
        .receipt_envelope(subscription, publication)
        .map_err(error)?;
    let ch = channel(&c, &e.channel_id)?;
    let k = key(&v, &c, ch)?;
    open_envelope(&c, ch, &k, &e, now()?)?.content().text()
        .map(str::to_owned).ok_or_else(|| "This reception is an image; use Copy image".into())
}
pub(crate) fn receipt_content(storage: &AppStorage, subscription: &str, publication: &str) -> Result<ClipboardContent, String> {
    let c = required(storage)?;
    let s = store(storage)?;
    let v = vault(&s, &c)?;
    let e = s.receipt_envelope(subscription, publication).map_err(error)?;
    let ch = channel(&c, &e.channel_id)?;
    Ok(open_envelope(&c, ch, &key(&v, &c, ch)?, &e, now()?)?.content().clone())
}
pub(crate) fn claim_clipboard(
    storage: &AppStorage,
    effect: &IncomingEffect,
) -> Result<String, String> {
    let _worker = WORKER.lock().map_err(error)?;
    let c = required(storage)?;
    let ch = channel(&c, &effect.channel_id)?;
    if receive_is_paused(&c, ch)
        || !ch.policy.receive_enabled
        || !ch.policy.update_clipboard
        || !effect.update_clipboard
        || now()? >= effect.lease_expires_at_unix_ms
        || effect.lease_started.elapsed().as_millis() >= u128::from(effect.lease_duration_ms)
    {
        return Err("Automatic clipboard delivery is no longer eligible".into());
    }
    let s = store(storage)?;
    let fence = s.fence(&effect.subscription_id).map_err(error)?;
    if fence.generation != effect.generation {
        return Err("Subscription changed before delivery".into());
    }
    let v = vault(&s, &c)?;
    let e = s
        .receipt_envelope(&effect.subscription_id, &effect.publication_id)
        .map_err(error)?;
    let text = open_envelope(&c, ch, &key(&v, &c, ch)?, &e, now()?)?;
    if text.content() != &effect.content {
        return Err("Receipt changed before delivery".into());
    }
    let attempt = random_id("clipboard")?;
    s.claim_clipboard(
        &effect.subscription_id,
        &effect.publication_id,
        fence,
        &text,
        &attempt,
        now()?,
    )
    .map_err(error)?;
    Ok(attempt)
}
pub(crate) fn finish_clipboard(
    storage: &AppStorage,
    subscription: &str,
    attempt: &str,
    outcome: &str,
) -> Result<(), String> {
    store(storage)?
        .finish_clipboard(subscription, attempt, outcome)
        .map_err(error)
}
pub(crate) fn validate_reception_action(
    storage: &AppStorage,
    channel_id: &str,
    publication: &str,
    generation: u64,
    action_id: &str,
) -> Result<(), String> {
    let c = required(storage)?;
    let ch = channel(&c, channel_id)?;
    if receive_is_paused(&c, ch)
        || !ch.policy.receive_enabled
        || !ch.policy.receive_action_enabled
        || ch.policy.receive_action_id.as_deref() != Some(action_id)
    {
        return Err("Receiving Action is no longer authorized".into());
    }
    let s = store(storage)?;
    if s.fence(&sid(channel_id)).map_err(error)?.generation != generation {
        return Err("Receiving Action generation changed".into());
    }
    s.receipt_envelope(&sid(channel_id), publication)
        .map_err(error)?;
    Ok(())
}
pub(crate) fn validate_reception_writer(
    storage: &AppStorage,
    channel_id: &str,
    publication: &str,
    generation: u64,
    action_id: &str,
) -> Result<(), String> {
    validate_reception_action(storage, channel_id, publication, generation, action_id)?;
    let c = required(storage)?;
    let ch = channel(&c, channel_id)?;
    if !ch.policy.receive_action_writes_clipboard || ch.policy.update_clipboard {
        return Err("This receiving Action cannot update the Windows clipboard".into());
    }
    Ok(())
}
fn claim_action_clipboard_unlocked(
    storage: &AppStorage,
    channel_id: &str,
    publication: &str,
    generation: u64,
    action_id: &str,
    original_text: Option<&str>,
    transformed_text: &str,
) -> Result<String, String> {
    if transformed_text.is_empty() || transformed_text.len() > wire::MAX_TEXT_BYTES {
        return Err("Receiving Action output must be nonempty plain text up to 1 MiB".into());
    }
    validate_reception_writer(storage, channel_id, publication, generation, action_id)?;
    let c = required(storage)?;
    let ch = channel(&c, channel_id)?;
    let s = store(storage)?;
    let v = vault(&s, &c)?;
    let subscription = sid(channel_id);
    let fence = s.fence(&subscription).map_err(error)?;
    let envelope = s
        .receipt_envelope(&subscription, publication)
        .map_err(error)?;
    let verified = open_envelope(&c, ch, &key(&v, &c, ch)?, &envelope, now()?)?;
    if original_text.is_some_and(|text| text != verified.text()) {
        return Err("The receiving Action's immutable publication changed".into());
    }
    let attempt = random_id("action_clipboard")?;
    s.claim_clipboard(
        &subscription,
        publication,
        fence,
        &verified,
        &attempt,
        now()?,
    )
    .map_err(error)?;
    if let Err(err) = s.provenance(transformed_text, None) {
        let _ = s.finish_clipboard(&subscription, &attempt, "failed");
        return Err(error(err));
    }
    Ok(attempt)
}
pub(crate) fn claim_action_clipboard(
    storage: &AppStorage,
    channel_id: &str,
    publication: &str,
    generation: u64,
    action_id: &str,
    transformed_text: &str,
) -> Result<String, String> {
    let _worker = WORKER.lock().map_err(error)?;
    claim_action_clipboard_unlocked(
        storage,
        channel_id,
        publication,
        generation,
        action_id,
        None,
        transformed_text,
    )
}
pub(crate) fn claim_reception_action_clipboard(
    storage: &AppStorage,
    channel_id: &str,
    publication: &str,
    generation: u64,
    action_id: &str,
    original_text: &str,
    transformed_text: &str,
    lease_expires_unix_ms: u64,
    lease_started: Instant,
    lease_duration_ms: u64,
) -> Result<String, String> {
    let _worker = WORKER.lock().map_err(error)?;
    if lease_duration_ms == 0
        || lease_duration_ms > 10_000
        || now()? >= lease_expires_unix_ms
        || lease_started.elapsed().as_millis() >= u128::from(lease_duration_ms)
    {
        return Err("The receiving Action's clipboard delivery is no longer live".into());
    }
    claim_action_clipboard_unlocked(
        storage,
        channel_id,
        publication,
        generation,
        action_id,
        Some(original_text),
        transformed_text,
    )
}
pub(crate) fn validate_reception_forward(
    storage: &AppStorage,
    origin_channel: &str,
    origin_publication: &str,
    target_channel: &str,
    generation: u64,
    action_id: &str,
) -> Result<(), String> {
    let c = required(storage)?;
    let origin = channel(&c, origin_channel)?;
    let target = channel(&c, target_channel)?;
    if receive_is_paused(&c, origin)
        || send_is_paused(&c, target)
        || !origin.policy.receive_enabled
        || !origin.policy.receive_action_enabled
        || origin.policy.receive_action_id.as_deref() != Some(action_id)
        || !origin
            .policy
            .receive_action_forward_channel_ids
            .iter()
            .any(|id| id == target_channel)
        || !target.policy.can_publish
        || origin_channel == target_channel
    {
        return Err("Forwarding from this reception is not authorized".into());
    }
    if store(storage)?
        .fence(&sid(origin_channel))
        .map_err(error)?
        .generation
        != generation
    {
        return Err("Receiving Action generation changed".into());
    }
    let envelope = store(storage)?
        .receipt_envelope(&sid(origin_channel), origin_publication)
        .map_err(error)?;
    if !can_forward_publication(&envelope.publication_id) {
        return Err("Automatic forwarding is limited to one authenticated hop".into());
    }
    Ok(())
}
pub(crate) fn publish_reception_text(
    storage: &AppStorage,
    origin_channel: &str,
    origin_publication: &str,
    target_channel: &str,
    generation: u64,
    action_id: &str,
    text: &str,
) -> Result<Value, String> {
    let _worker = WORKER.lock().map_err(error)?;
    validate_reception_forward(
        storage,
        origin_channel,
        origin_publication,
        target_channel,
        generation,
        action_id,
    )?;
    publish_text_unlocked(storage, target_channel, text, "receivingAction")
}
pub(crate) fn claim_action(
    storage: &AppStorage,
    effect: &IncomingEffect,
) -> Result<String, String> {
    let _worker = WORKER.lock().map_err(error)?;
    let action = effect
        .action_id
        .as_deref()
        .ok_or("No receiving Action is bound")?;
    validate_reception_action(
        storage,
        &effect.channel_id,
        &effect.publication_id,
        effect.generation,
        action,
    )?;
    if now()? >= effect.lease_expires_at_unix_ms
        || effect.lease_started.elapsed().as_millis() >= u128::from(effect.lease_duration_ms)
    {
        return Err("Receiving Action is no longer live".into());
    }
    let s = store(storage)?;
    let attempt = random_id("action")?;
    s.claim_action(
        &effect.subscription_id,
        &effect.publication_id,
        effect.generation,
        &attempt,
        now()?,
    )
    .map_err(error)?;
    Ok(attempt)
}
pub(crate) fn finish_action(
    storage: &AppStorage,
    subscription: &str,
    attempt: &str,
    outcome: &str,
) -> Result<(), String> {
    store(storage)?
        .finish_clipboard(subscription, attempt, outcome)
        .map_err(error)
}
pub(crate) fn claim_manual_clipboard(
    storage: &AppStorage,
    subscription: &str,
    publication: &str,
) -> Result<String, String> {
    let _worker = WORKER.lock().map_err(error)?;
    let c = required(storage)?;
    let s = store(storage)?;
    let v = vault(&s, &c)?;
    let e = s
        .receipt_envelope(subscription, publication)
        .map_err(error)?;
    let ch = channel(&c, &e.channel_id)?;
    let text = open_envelope(&c, ch, &key(&v, &c, ch)?, &e, now()?)?;
    let attempt = random_id("manual_clipboard")?;
    s.claim_manual_clipboard(subscription, publication, &text, &attempt, now()?)
        .map_err(error)?;
    Ok(attempt)
}
pub(crate) fn skip_effect(
    storage: &AppStorage,
    effect: &IncomingEffect,
    sink: &str,
    reason: &str,
) -> Result<(), String> {
    store(storage)?
        .skip_effect(
            &effect.subscription_id,
            &effect.publication_id,
            effect.generation,
            &random_id("skipped")?,
            sink,
            reason,
        )
        .map_err(error)
}
/// Read-only inspection for the standalone native fixture; cannot recover
/// claims or start another executor against an app's currently open profile.
#[cfg(feature = "shared-clipboard-n1")]
pub(crate) fn fixture_read_relay(storage: &AppStorage) -> Result<Vec<Value>, String> {
    let c = required(storage)?;
    if c.environment != "synthetic_product_fixture"
        || !c.allow_loopback
        || !c.endpoint.starts_with("http://127.0.0.1:")
    {
        return Err("Only the owned loopback synthetic relay can be inspected".into());
    }
    let s = store(storage)?;
    let v = vault(&s, &c)?;
    let relay = client(&v, &c)?;
    let mut results = Vec::new();
    for ch in &c.channels {
        let k = key(&v, &c, ch)?;
        let mut cursor = 0u64;
        for _ in 0..100 {
            let page = relay
                .sync(&ch.policy.id, cursor)
                .map_err(|_| "Cannot inspect synthetic relay")?;
            for entry in &page.entries {
                let text = open_envelope(&c, ch, &k, &entry.envelope, now()?)?;
                if text.text().starts_with("synthetic-") && text.text().len() <= 16384 {
                    results.push(json!({"publicationId":entry.envelope.publication_id,"originDeviceId":entry.envelope.device_id,"channelId":ch.policy.id,"sequence":entry.server_sequence,"text":text.text()}));
                } else {
                    results.push(
                        json!({"publicationId":entry.envelope.publication_id,"filtered":true}),
                    );
                }
            }
            let next = page.next_cursor.parse::<u64>().map_err(error)?;
            let head = page.head.parse::<u64>().map_err(error)?;
            if next >= head {
                break;
            }
            if next <= cursor {
                return Err("Synthetic relay cursor did not advance".into());
            }
            cursor = next;
        }
    }
    Ok(results)
}
