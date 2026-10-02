//! Host-only enrollment file. Secrets never cross the renderer/Actions boundary.
//! A private provisioning bundle is an explicit local enrollment method; its
//! fingerprint must be compared with the trusted owner before confirmation.
use super::{
    crypto::{self, DeviceSigner, Sensitive},
    transport::RelayClient,
};
use base64::{engine::general_purpose::STANDARD, Engine};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
#[cfg(not(windows))]
use std::fs::File;
use std::{io::Read, path::Path};

#[derive(Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct ChannelPolicy {
    pub id: String,
    pub name: String,
    pub can_publish: bool,
    #[serde(default)]
    pub send_paused: bool,
    #[serde(default)]
    pub receive_paused: bool,
    #[serde(default)]
    pub default_send_channel: bool,
    pub receive_enabled: bool,
    pub publish_folder_enabled: bool,
    pub publish_folder_id: Option<i64>,
    pub save_to_folder: bool,
    pub receive_folder_id: Option<i64>,
    pub update_clipboard: bool,
    #[serde(default)]
    pub receive_action_enabled: bool,
    #[serde(default)]
    pub receive_action_writes_clipboard: bool,
    #[serde(default)]
    pub receive_action_id: Option<String>,
    #[serde(default)]
    pub receive_action_forward_channel_ids: Vec<String>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct ConfigureInput {
    pub bundle_path: String,
    pub confirmed_fingerprint: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct EnrollmentPreview {
    pub fingerprint: String,
    pub environment: String,
    pub device_id: String,
    pub endpoint: String,
    pub channels: Vec<ChannelPolicy>,
    pub device_public_key: String,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Bundle {
    pub version: u8,
    pub environment: String,
    pub device_id: String,
    pub endpoint: String,
    pub allow_loopback: bool,
    pub bearer: String,
    pub signing_seed: String,
    pub issuer_public_key: String,
    pub channels: Vec<BundleChannel>,
}
impl Drop for Bundle {
    fn drop(&mut self) {
        // Owned temporary secret strings are scrubbed without changing length.
        unsafe {
            self.bearer.as_bytes_mut().fill(0);
            self.signing_seed.as_bytes_mut().fill(0);
            for c in &mut self.channels {
                c.key.as_bytes_mut().fill(0);
            }
        }
    }
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct BundleChannel {
    pub id: String,
    pub name: String,
    pub epoch: u64,
    pub can_publish: bool,
    pub key: String,
    pub grants: Vec<StoredGrant>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct StoredGrant {
    pub device_id: String,
    pub public_key: String,
    pub revision: u64,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct StoredChannel {
    pub policy: ChannelPolicy,
    pub epoch: u64,
    pub key_reference: String,
    pub grants: Vec<StoredGrant>,
    #[serde(default)]
    pub receive_needs_head: bool,
}
#[derive(Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct Connection {
    pub id: String,
    pub channel_id: String,
    pub kind: String,
    pub folder_id: Option<i64>,
    pub direction: String,
}
impl Connection {
    pub(super) fn sends(&self) -> bool {
        matches!(self.direction.as_str(), "send" | "both")
    }
    pub(super) fn receives(&self) -> bool {
        matches!(self.direction.as_str(), "receive" | "both")
    }
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct ConnectionInput {
    pub id: String,
    pub channel_id: String,
    pub kind: String,
    pub folder_id: Option<i64>,
    pub direction: String,
    #[serde(default)]
    pub move_reception: bool,
}
fn default_general_scope() -> String {
    "unfiled".into()
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct StoredConfig {
    pub environment: String,
    pub device_id: String,
    pub endpoint: String,
    pub allow_loopback: bool,
    pub issuer_public_key: String,
    pub enrollment_fingerprint: String,
    pub vault_name: String,
    pub signing_reference: String,
    pub bearer_reference: String,
    pub paused: bool,
    #[serde(default)]
    pub send_paused: bool,
    #[serde(default)]
    pub receive_paused: bool,
    #[serde(default)]
    pub connections: Vec<Connection>,
    #[serde(default)]
    pub connection_version: u8,
    #[serde(default = "default_general_scope")]
    pub general_send_scope: String,
    #[serde(default)]
    pub action_targets: std::collections::HashMap<String, String>,
    #[serde(default)]
    pub send_active_shortcut: Option<String>,
    #[serde(default)]
    pub send_clipboard_shortcut: Option<String>,
    pub channels: Vec<StoredChannel>,
}
pub(super) fn bytes32(encoded: &str) -> Result<[u8; 32], String> {
    let value = STANDARD
        .decode(encoded)
        .map_err(|_| "Invalid enrollment key")?;
    if STANDARD.encode(&value) != encoded {
        return Err("Invalid enrollment key".into());
    }
    value
        .try_into()
        .map_err(|_| "Invalid enrollment key".into())
}
pub(super) fn secret32(encoded: &str) -> Result<Sensitive, String> {
    let value = Sensitive(
        STANDARD
            .decode(encoded)
            .map_err(|_| "Invalid enrollment key")?,
    );
    if value.0.len() != 32 || STANDARD.encode(&value.0) != encoded {
        return Err("Invalid enrollment key".into());
    }
    Ok(value)
}
pub(super) fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}
pub(super) fn load_bundle(path: &str) -> Result<(Bundle, EnrollmentPreview), String> {
    let path = Path::new(path);
    if !path.is_absolute() {
        return Err("Enrollment file needs an absolute local path".into());
    }
    #[cfg(windows)]
    {
        use std::{
            os::windows::fs::{MetadataExt, OpenOptionsExt},
            path::{Component, Prefix},
        };
        if !matches!(path.components().next(),Some(Component::Prefix(p)) if matches!(p.kind(),Prefix::Disk(_)|Prefix::VerbatimDisk(_)))
        {
            return Err("Enrollment file must be on a local drive".into());
        }
        if path
            .ancestors()
            .any(|p| std::fs::symlink_metadata(p).is_ok_and(|m| m.file_attributes() & 0x400 != 0))
        {
            return Err("Enrollment file cannot use reparse points".into());
        }
        let mut file = std::fs::OpenOptions::new()
            .read(true)
            .share_mode(1)
            .custom_flags(0x00200000)
            .open(path)
            .map_err(|_| "Cannot open enrollment file")?;
        let meta = file
            .metadata()
            .map_err(|_| "Cannot inspect enrollment file")?;
        if !meta.is_file() || meta.file_attributes() & 0x400 != 0 || meta.len() > 65536 {
            return Err("Invalid enrollment file".into());
        }
        let mut data = Sensitive(Vec::new());
        file.by_ref()
            .take(65537)
            .read_to_end(&mut data.0)
            .map_err(|_| "Cannot read enrollment file")?;
        return decode_bundle(&data.0);
    }
    #[cfg(not(windows))]
    {
        let mut data = Sensitive(Vec::new());
        File::open(path)
            .map_err(|_| "Cannot open enrollment file")?
            .take(65537)
            .read_to_end(&mut data.0)
            .map_err(|_| "Cannot read enrollment file")?;
        decode_bundle(&data.0)
    }
}
fn decode_bundle(data: &[u8]) -> Result<(Bundle, EnrollmentPreview), String> {
    if data.len() > 65536 {
        return Err("Enrollment file is too large".into());
    }
    let b: Bundle = serde_json::from_slice(data).map_err(|_| "Invalid enrollment file")?;
    if b.version != 1
        || !crypto::valid_id(&b.environment)
        || !crypto::valid_id(&b.device_id)
        || b.channels.is_empty()
        || b.channels.len() > 32
    {
        return Err("Invalid enrollment scope".into());
    }
    // This constructor validates TLS/loopback/token format, without doing IO.
    RelayClient::new(
        &b.endpoint,
        &b.environment,
        &b.device_id,
        &b.bearer,
        b.allow_loopback,
    )
    .map_err(|error| match error {
        super::transport::Error::InvalidEndpoint => {
            "Invalid relay endpoint: use HTTPS or explicitly allowed loopback"
        }
        super::transport::Error::InvalidInput => "Invalid relay credential format",
        _ => "Cannot initialize the secure relay client",
    })?;
    let signer = DeviceSigner::restore_secret(secret32(&b.signing_seed)?)
        .map_err(|_| "Invalid device identity")?;
    let issuer = bytes32(&b.issuer_public_key)?;
    let issuer_key =
        ed25519_dalek::VerifyingKey::from_bytes(&issuer).map_err(|_| "Invalid issuer")?;
    if issuer_key.is_weak() {
        return Err("Invalid issuer".into());
    }
    let mut ids = std::collections::HashSet::new();
    let mut policies = Vec::new();
    let mut descriptors = Vec::new();
    for c in &b.channels {
        if !crypto::valid_id(&c.id)
            || !ids.insert(&c.id)
            || c.epoch == 0
            || c.name.is_empty()
            || c.name.len() > 128
            || c.grants.is_empty()
            || c.grants.len() > 256
        {
            return Err("Invalid enrollment channel".into());
        }
        let key = secret32(&c.key)?;
        let mut devices = std::collections::HashSet::new();
        for g in &c.grants {
            let public = bytes32(&g.public_key)?;
            let key = ed25519_dalek::VerifyingKey::from_bytes(&public)
                .map_err(|_| "Invalid publisher grant")?;
            if !crypto::valid_id(&g.device_id)
                || !devices.insert(&g.device_id)
                || g.revision == 0
                || key.is_weak()
            {
                return Err("Invalid publisher grant".into());
            }
        }
        if c.can_publish
            && !c.grants.iter().any(|g| {
                g.device_id == b.device_id && bytes32(&g.public_key).ok() == Some(signer.public())
            })
        {
            return Err("Local publish identity is not enrolled".into());
        }
        descriptors.push(serde_json::json!({"id":c.id,"name":c.name,"epoch":c.epoch,"canPublish":c.can_publish,"keyHash":hex(&Sha256::digest(&key.0)),"grants":c.grants}));
        policies.push(ChannelPolicy {
            id: c.id.clone(),
            name: c.name.clone(),
            can_publish: c.can_publish,
            send_paused: false,
            receive_paused: false,
            default_send_channel: false,
            receive_enabled: false,
            publish_folder_enabled: false,
            publish_folder_id: None,
            save_to_folder: false,
            receive_folder_id: None,
            update_clipboard: false,
            receive_action_enabled: false,
            receive_action_writes_clipboard: false,
            receive_action_id: None,
            receive_action_forward_channel_ids: vec![],
        });
    }
    let descriptor = serde_json::json!({"domain":"Copicu.local.enrollment.v1","environment":b.environment,"deviceId":b.device_id,"endpoint":b.endpoint,"allowLoopback":b.allow_loopback,"publicKey":STANDARD.encode(signer.public()),"issuer":b.issuer_public_key,"credentialHash":hex(&Sha256::digest(b.bearer.as_bytes())),"channels":descriptors});
    let fingerprint = hex(&Sha256::digest(
        serde_json::to_vec(&descriptor).map_err(|_| "Invalid enrollment descriptor")?,
    ));
    let preview = EnrollmentPreview {
        fingerprint,
        environment: b.environment.clone(),
        device_id: b.device_id.clone(),
        endpoint: b.endpoint.clone(),
        channels: policies,
        device_public_key: STANDARD.encode(signer.public()),
    };
    Ok((b, preview))
}
