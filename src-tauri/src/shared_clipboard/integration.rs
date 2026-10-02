//! Actual Rust E2EE -> Bun HTTP/SQLite -> Rust receiver with synthetic identities.
//! Simulated fingerprint approval is not proof of human enrollment or two PCs.
use super::{crypto::*, enrollment::*, transport::*, wire::*};
use crate::storage::{
    shared::{Grant, HistoryOutcome, Policy, RuntimeStore, Subscribe, VerifiedArrival},
    AppStorage,
};
use base64::{engine::general_purpose::STANDARD, Engine};
use serde_json::{json, Value};
use std::{
    fs,
    io::{BufRead, BufReader, Write},
    path::PathBuf,
    process::{Child, ChildStdin, Command, Stdio},
    sync::{
        atomic::{AtomicU64, Ordering},
        mpsc,
    },
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
static NEXT: AtomicU64 = AtomicU64::new(0);
const OWNER_TOKEN: &str = "synthetic_owner_token_00000000000000000000";
const RECEIVER_TOKEN: &str = "synthetic_receiver_token_00000000000000000";
struct Fixture {
    child: Child,
    stdin: ChildStdin,
    lines: mpsc::Receiver<String>,
    root: PathBuf,
    reader: Option<thread::JoinHandle<()>>,
}
impl Fixture {
    fn new(owner: &DeviceSigner, receiver: &DeviceSigner) -> (Self, String, [u8; 32]) {
        Self::with_receiver_publish(owner, receiver, false)
    }
    fn with_receiver_publish(
        owner: &DeviceSigner,
        receiver: &DeviceSigner,
        receiver_publish: bool,
    ) -> (Self, String, [u8; 32]) {
        let parent = std::env::temp_dir();
        let name = format!(
            "copicu-c1-interop-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::SeqCst)
        );
        let root = parent.join(name);
        assert!(!root.exists());
        fs::create_dir(&root).unwrap();
        let mut child = Command::new("bun")
            .arg("tests/manual/shared-clipboard-c1-relay.mjs")
            .current_dir(PathBuf::from(env!("CARGO_MANIFEST_DIR")).parent().unwrap())
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .expect("installed Bun fixture runtime");
        let stdin = child.stdin.take().unwrap();
        let output = child.stdout.take().unwrap();
        let (tx, lines) = mpsc::channel();
        let reader = thread::spawn(move || {
            for line in BufReader::new(output).lines() {
                if let Ok(line) = line {
                    if tx.send(line).is_err() {
                        break;
                    }
                } else {
                    break;
                }
            }
        });
        let mut fixture = Self {
            child,
            stdin,
            lines,
            root,
            reader: Some(reader),
        };
        fixture.send(json!({"dbPath":fixture.root.join("relay.sqlite"), "environment":"test_env",
            "channels":[{"id":"test_channel","key_epoch":"1"}],
            "devices":[
              {"id":"owner","token":OWNER_TOKEN,"public_key":STANDARD.encode(owner.public()),"grants":[{"channel_id":"test_channel","key_epoch":"1","publish":true,"read":true,"report":true}]},
              {"id":"receiver","token":RECEIVER_TOKEN,"public_key":STANDARD.encode(receiver.public()),"grants":[{"channel_id":"test_channel","key_epoch":"1","publish":receiver_publish,"read":true,"report":true}]}
            ]}));
        let ready = fixture.receive();
        let url = ready["url"].as_str().unwrap().to_string();
        let issuer: [u8; 32] = STANDARD
            .decode(ready["issuer"].as_str().unwrap())
            .unwrap()
            .try_into()
            .unwrap();
        (fixture, url, issuer)
    }
    fn send(&mut self, value: Value) {
        serde_json::to_writer(&mut self.stdin, &value).unwrap();
        self.stdin.write_all(b"\n").unwrap();
        self.stdin.flush().unwrap();
    }
    fn receive(&self) -> Value {
        let line = self
            .lines
            .recv_timeout(Duration::from_secs(15))
            .expect("bounded fixture reply");
        assert!(line.len() < 1024);
        serde_json::from_str(&line).unwrap()
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        // Only the child and fresh directory owned by this fixture are closed.
        let _ = self.child.kill();
        let _ = self.child.wait();
        if let Some(reader) = self.reader.take() {
            let _ = reader.join();
        }
        use std::os::windows::fs::MetadataExt;
        let clean_root = fs::symlink_metadata(&self.root)
            .is_ok_and(|m| m.is_dir() && m.file_attributes() & 0x400 == 0);
        let expected = std::env::temp_dir()
            .canonicalize()
            .ok()
            .map(|parent| parent.join(self.root.file_name().unwrap()));
        if self.root.parent() == Some(std::env::temp_dir().as_path())
            && self
                .root
                .file_name()
                .unwrap()
                .to_string_lossy()
                .starts_with("copicu-c1-interop-")
            && clean_root
            && self.root.canonicalize().ok() == expected
        {
            let _ = fs::remove_dir_all(&self.root);
        }
    }
}
fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis()
        .try_into()
        .unwrap()
}
fn publication(id: &str, ordinal: u64, lease: &str, expiry: u64) -> Envelope {
    Envelope {
        version: 1,
        environment: "test_env".into(),
        channel_id: "test_channel".into(),
        publication_id: id.into(),
        device_id: "owner".into(),
        origin_ordinal: ordinal.to_string(),
        key_epoch: "1".into(),
        expires_at_unix_ms: expiry.to_string(),
        freshness: Freshness::Live {
            lease_id: lease.into(),
        },
        nonce: vec![],
        ciphertext: vec![],
        signature: vec![],
    }
}
#[test]
fn product_runtime_enrollment_folder_dedupe_live_claim_pause_and_recovery() {
    let _runtime = super::runtime::TEST_RUNTIME.lock().unwrap();
    use super::{config::ConfigureInput, runtime};
    use crate::storage::{CreateHistoryItemRequest, MetadataFolderIntent};
    let owner = DeviceSigner::generate(&mut SystemEntropy).unwrap();
    let receiver = DeviceSigner::generate(&mut SystemEntropy).unwrap();
    let channel = ChannelKey::generate(
        "test_env".into(),
        "test_channel".into(),
        1,
        &mut SystemEntropy,
    )
    .unwrap();
    let (fixture, url, issuer) = Fixture::with_receiver_publish(&owner, &receiver, true);
    let owner_storage = AppStorage::open(&fixture.root.join("owner_profile")).unwrap();
    let receiver_storage = AppStorage::open(&fixture.root.join("receiver_profile")).unwrap();
    let enroll = |storage: &AppStorage,
                  device: &str,
                  signer: &DeviceSigner,
                  token: &str,
                  publish: bool| {
        let bundle = fixture.root.join(format!("{device}_enrollment.json"));
        let seed = signer.export_secret();
        let value = json!({"version":1,"environment":"test_env","deviceId":device,"endpoint":url,"allowLoopback":true,"bearer":token,"signingSeed":STANDARD.encode(&seed.0),"issuerPublicKey":STANDARD.encode(issuer),"channels":[{"id":"test_channel","name":"Synthetic channel","epoch":1,"canPublish":publish,"key":STANDARD.encode(channel.secret()),"grants":[{"deviceId":"owner","publicKey":STANDARD.encode(owner.public()),"revision":1},{"deviceId":"receiver","publicKey":STANDARD.encode(receiver.public()),"revision":1}]}]});
        fs::write(&bundle, serde_json::to_vec(&value).unwrap()).unwrap();
        let path = bundle.to_str().unwrap();
        let preview = runtime::enrollment_preview(storage, path).unwrap();
        assert!(runtime::configure(
            storage,
            ConfigureInput {
                bundle_path: path.into(),
                confirmed_fingerprint: "wrong".into()
            }
        )
        .is_err());
        runtime::configure(
            storage,
            ConfigureInput {
                bundle_path: path.into(),
                confirmed_fingerprint: preview.fingerprint,
            },
        )
        .unwrap()
    };
    let owner_status = enroll(&owner_storage, "owner", &owner, OWNER_TOKEN, true);
    let receiver_status = enroll(
        &receiver_storage,
        "receiver",
        &receiver,
        RECEIVER_TOKEN,
        true,
    );
    assert!(owner_status.receipts.is_empty());
    assert!(receiver_status.receipts.is_empty());
    let existing = receiver_storage
        .create_text_item(CreateHistoryItemRequest {
            text: "synthetic product shared text".into(),
            title: Some("Preserved local title".into()),
            notes: None,
            tags: vec!["local".into()],
            mime_primary: None,
            folder: Some(MetadataFolderIntent::Create {
                path: "Local originals".into(),
            }),
        })
        .unwrap();
    let mut receive = receiver_status.channels[0].clone();
    receive.receive_enabled = true;
    receive.save_to_folder = true;
    receive.update_clipboard = true;
    runtime::update_channel(&receiver_storage, receive).unwrap();
    let connection = super::config::ConnectionInput {
        id: "legacy_receive_test_channel".into(),
        channel_id: "test_channel".into(),
        kind: "folder".into(),
        folder_id: None,
        direction: "receive".into(),
        move_reception: false,
    };
    let head = runtime::prepare_connection_head(&receiver_storage, &connection).unwrap();
    runtime::connect_with_head(&receiver_storage, connection, head).unwrap();
    assert!(runtime::poll_once(&owner_storage)
        .unwrap()
        .effects
        .is_empty());
    // Publish before the first receiver poll: connection already committed its head.
    let published = runtime::publish_text(
        &owner_storage,
        "test_channel",
        "synthetic product shared text",
        "syntheticTest",
    )
    .unwrap();
    assert_eq!(published["state"], "queued");
    runtime::poll_once(&owner_storage).unwrap();
    let result = runtime::poll_once(&receiver_storage).unwrap();
    assert!(result.history_changed);
    assert_eq!(result.effects.len(), 1);
    let effect = &result.effects[0];
    assert_eq!(effect.text, "synthetic product shared text");
    let status = runtime::snapshot(&receiver_storage).unwrap();
    assert_eq!(status.receipts.len(), 1);
    assert_eq!(status.receipts[0]["localItemId"], existing.id);
    assert_eq!(
        receiver_storage.get_item_tags(existing.id).unwrap(),
        vec!["local"]
    );
    assert!(runtime::is_remote_item_or_text(
        &receiver_storage,
        Some(existing.id),
        effect.text.as_str()
    )
    .unwrap());
    assert_eq!(
        runtime::publish_folder_ingress(&receiver_storage, None, existing.id, false).unwrap(),
        0
    );
    assert_eq!(
        runtime::receipt_text(
            &receiver_storage,
            &effect.subscription_id,
            &effect.publication_id
        )
        .unwrap(),
        effect.text
    );
    let attempt = runtime::claim_clipboard(&receiver_storage, effect).unwrap();
    assert!(runtime::claim_clipboard(&receiver_storage, effect).is_err());
    runtime::finish_clipboard(
        &receiver_storage,
        &effect.subscription_id,
        &attempt,
        "skipped",
    )
    .unwrap();
    assert!(runtime::claim_clipboard(&receiver_storage, effect).is_err());
    let manual = runtime::claim_manual_clipboard(
        &receiver_storage,
        &effect.subscription_id,
        &effect.publication_id,
    )
    .unwrap();
    runtime::finish_clipboard(
        &receiver_storage,
        &effect.subscription_id,
        &manual,
        "applied",
    )
    .unwrap();
    runtime::set_paused(&receiver_storage, true).unwrap();
    assert!(runtime::claim_clipboard(&receiver_storage, effect).is_err());
    runtime::publish_text(
        &owner_storage,
        "test_channel",
        "synthetic paused recovery text",
        "syntheticTest",
    )
    .unwrap();
    runtime::poll_once(&owner_storage).unwrap();
    let heads = runtime::prepare_receive_resume(&receiver_storage, None, Some(false)).unwrap();
    // This publication is after the prepared boundary and before local commit.
    runtime::publish_text(
        &owner_storage,
        "test_channel",
        "synthetic fresh after resume",
        "syntheticTest",
    )
    .unwrap();
    runtime::poll_once(&owner_storage).unwrap();
    runtime::set_flow_paused_with_heads(&receiver_storage, None, Some(false), Some(false), heads)
        .unwrap();
    let fresh = runtime::poll_once(&receiver_storage).unwrap();
    assert!(fresh.history_changed);
    assert_eq!(fresh.effects.len(), 1);
    assert_eq!(fresh.effects[0].text, "synthetic fresh after resume");
    assert_eq!(
        runtime::snapshot(&receiver_storage).unwrap().receipts.len(),
        2
    );
    for pending in &fresh.effects {
        if pending.update_clipboard {
            let attempt = runtime::claim_clipboard(&receiver_storage, pending).unwrap();
            runtime::finish_clipboard(
                &receiver_storage,
                &pending.subscription_id,
                &attempt,
                "skipped",
            )
            .unwrap();
        }
    }
    runtime::poll_once(&receiver_storage).unwrap(); // Complete metadata reports before retention.
    assert_eq!(
        runtime::snapshot(&owner_storage)
            .unwrap()
            .outbox
            .iter()
            .filter(|p| p["state"] == "accepted")
            .count(),
        3
    );
    assert!(runtime::configure(
        &owner_storage,
        ConfigureInput {
            bundle_path: "C:/nope".into(),
            confirmed_fingerprint: "nope".into()
        }
    )
    .is_err());
    let before = runtime::snapshot(&owner_storage).unwrap().outbox.len();
    let make = |storage: &AppStorage, text: &str, folder: Option<MetadataFolderIntent>| {
        storage
            .create_text_item(CreateHistoryItemRequest {
                text: text.into(),
                title: None,
                notes: None,
                tags: vec!["synthetic".into()],
                mime_primary: None,
                folder,
            })
            .unwrap()
    };
    let existing_local = make(&owner_storage, "synthetic previous content", None);
    assert_eq!(
        runtime::snapshot(&owner_storage).unwrap().outbox.len(),
        before
    );
    let mut publishing = runtime::snapshot(&owner_storage).unwrap().channels[0].clone();
    publishing.publish_folder_enabled = true;
    publishing.publish_folder_id = None;
    runtime::update_channel(&owner_storage, publishing).unwrap();
    assert_eq!(
        runtime::snapshot(&owner_storage).unwrap().outbox.len(),
        before,
        "Connecting Root must not publish prior content"
    );
    let new_root = make(&owner_storage, "synthetic new root content", None);
    assert_eq!(
        runtime::snapshot(&owner_storage).unwrap().outbox.len(),
        before + 1
    );
    owner_storage
        .update_item_metadata(crate::storage::UpdateItemMetadataRequest {
            id: new_root.id,
            title: Some("Synthetic title edit".into()),
            notes: None,
            tags: vec!["changed".into()],
        })
        .unwrap();
    assert_eq!(
        runtime::snapshot(&owner_storage).unwrap().outbox.len(),
        before + 1,
        "Tag or title edits are not folder ingress"
    );
    let child = make(
        &owner_storage,
        "synthetic child content",
        Some(MetadataFolderIntent::Create {
            path: "Child".into(),
        }),
    );
    assert_eq!(
        runtime::snapshot(&owner_storage).unwrap().outbox.len(),
        before + 1,
        "Root publishing excludes descendants"
    );
    assert_eq!(
        owner_storage
            .move_history_items_to_folder(vec![child.id, child.id], None)
            .unwrap(),
        1
    );
    assert_eq!(
        runtime::snapshot(&owner_storage).unwrap().outbox.len(),
        before + 2,
        "Batch ingress sends each actually moved clip once"
    );
    assert_eq!(
        owner_storage
            .move_history_items_to_folder(vec![child.id], None)
            .unwrap(),
        0
    );
    assert_eq!(
        runtime::snapshot(&owner_storage).unwrap().outbox.len(),
        before + 2
    );
    assert_eq!(
        make(&owner_storage, "synthetic previous content", None).id,
        existing_local.id
    );
    assert_eq!(
        runtime::snapshot(&owner_storage).unwrap().outbox.len(),
        before + 2,
        "Existing dedupe does not create ingress"
    );
    let mut receive_publish = runtime::snapshot(&receiver_storage).unwrap().channels[0].clone();
    receive_publish.publish_folder_enabled = true;
    receive_publish.publish_folder_id = None;
    runtime::update_channel(&receiver_storage, receive_publish).unwrap();
    receiver_storage
        .move_history_items_to_folder(vec![existing.id], None)
        .unwrap();
    assert!(
        runtime::snapshot(&receiver_storage)
            .unwrap()
            .outbox
            .is_empty(),
        "Moving a remote-origin clip must not echo"
    );
    assert!(
        runtime::validate_reception_writer(
            &receiver_storage,
            "test_channel",
            &effect.publication_id,
            effect.generation,
            "synthetic_writer"
        )
        .is_err(),
        "Receiving Actions cannot write by default"
    );
    let mut writer_policy = runtime::snapshot(&receiver_storage).unwrap().channels[0].clone();
    writer_policy.receive_action_enabled = true;
    writer_policy.receive_action_id = Some("synthetic_writer".into());
    writer_policy.receive_action_writes_clipboard = true;
    assert!(
        runtime::update_channel(&receiver_storage, writer_policy.clone()).is_err(),
        "A built-in and Action writer cannot coexist on a channel"
    );
    writer_policy.update_clipboard = false;
    runtime::update_channel(&receiver_storage, writer_policy.clone()).unwrap();
    assert!(
        runtime::claim_reception_action_clipboard(
            &receiver_storage,
            "test_channel",
            &effect.publication_id,
            effect.generation,
            "synthetic_writer",
            &effect.text,
            "synthetic-transformed-output",
            effect.lease_expires_at_unix_ms,
            effect.lease_started,
            effect.lease_duration_ms
        )
        .is_err(),
        "Changing writer policy invalidates prior reception generations"
    );
    runtime::poll_once(&receiver_storage).unwrap(); // Set the new recovery barrier.
    runtime::poll_once(&owner_storage).unwrap(); // Drain the two queued new clips.
    let action_reception = runtime::poll_once(&receiver_storage).unwrap();
    assert_eq!(action_reception.effects.len(), 2);
    assert!(runtime::claim_clipboard(&receiver_storage, &action_reception.effects[0]).is_err());
    let action_effect = action_reception.effects.last().unwrap();
    assert!(!action_effect.update_clipboard);
    let transformed = "synthetic-transformed-script-output";
    let writer_attempt = runtime::claim_reception_action_clipboard(
        &receiver_storage,
        "test_channel",
        &action_effect.publication_id,
        action_effect.generation,
        "synthetic_writer",
        &action_effect.text,
        transformed,
        action_effect.lease_expires_at_unix_ms,
        action_effect.lease_started,
        action_effect.lease_duration_ms,
    )
    .unwrap();
    assert!(
        runtime::is_remote_item_or_text(&receiver_storage, None, transformed).unwrap(),
        "Transformed output keeps remote provenance before native mutation"
    );
    assert!(
        runtime::claim_reception_action_clipboard(
            &receiver_storage,
            "test_channel",
            &action_effect.publication_id,
            action_effect.generation,
            "synthetic_writer",
            &action_effect.text,
            transformed,
            action_effect.lease_expires_at_unix_ms,
            action_effect.lease_started,
            action_effect.lease_duration_ms
        )
        .is_err(),
        "An automatic script output cannot claim Windows twice"
    );
    runtime::finish_clipboard(
        &receiver_storage,
        &action_effect.subscription_id,
        &writer_attempt,
        "skipped",
    )
    .unwrap();
    writer_policy.receive_action_enabled = false;
    runtime::update_channel(&receiver_storage, writer_policy).unwrap();
    assert!(
        runtime::validate_reception_writer(
            &receiver_storage,
            "test_channel",
            &action_effect.publication_id,
            action_effect.generation,
            "synthetic_writer"
        )
        .is_err(),
        "Disabling the bound Action immediately revokes writer authorization"
    );
    runtime::poll_once(&receiver_storage).unwrap(); // Commit the changed-policy head.
    runtime::poll_once(&receiver_storage).unwrap(); // Acknowledge settled effects' metadata.
    let accepted_before_prune = runtime::snapshot(&owner_storage)
        .unwrap()
        .outbox
        .iter()
        .filter(|p| p["state"] == "accepted")
        .count();
    let expired_time = now() + 86_400_001;
    let owner_store = RuntimeStore::init(&owner_storage).unwrap();
    owner_store.prune_product(expired_time).unwrap();
    assert!(owner_store
        .queued("test_env", "test_channel", "owner", expired_time)
        .unwrap()
        .is_none());
    assert_eq!(
        owner_store
            .reserve(
                published["publicationId"].as_str().unwrap(),
                "test_env",
                "test_channel",
                "owner"
            )
            .err(),
        Some(crate::storage::shared::Error::Expired)
    );
    assert_eq!(
        runtime::snapshot(&owner_storage)
            .unwrap()
            .outbox
            .iter()
            .filter(|p| p["state"] == "accepted")
            .count(),
        accepted_before_prune,
        "Payload pruning preserves accepted publication metadata"
    );
    let receiver_store = RuntimeStore::init(&receiver_storage).unwrap();
    receiver_store.prune_product(expired_time).unwrap();
    assert!(
        receiver_store
            .receipt_envelope(&effect.subscription_id, &effect.publication_id)
            .is_err(),
        "Expired encrypted receipt payload is removed"
    );
    let expired_status = runtime::snapshot(&receiver_storage).unwrap();
    assert!(expired_status
        .receipts
        .iter()
        .all(|r| r["acquisition"] == "expired"));
    assert!(
        expired_status
            .receipts
            .iter()
            .all(|r| r["originDeviceId"] == "owner"),
        "Origin metadata survives encrypted payload removal"
    );
    assert!(
        runtime::is_remote_item_or_text(&receiver_storage, Some(existing.id), effect.text.as_str())
            .unwrap(),
        "Payload pruning does not clear provenance of an existing local item"
    );
    // Drop SQLite/vault handles before the fixture performs guarded cleanup.
    drop(receiver_storage);
    drop(owner_storage);
    drop(fixture);
}
#[test]
fn encrypted_http_roundtrip_enrollment_watch_retry_report_revocation() {
    let mut entropy = SystemEntropy;
    let owner = DeviceSigner::generate(&mut entropy).unwrap();
    let receiver = DeviceSigner::generate(&mut entropy).unwrap();
    let owner_kem = EnrollmentKey::generate(&mut entropy).unwrap();
    let receiver_kem = EnrollmentKey::generate(&mut entropy).unwrap();
    let key =
        ChannelKey::generate("test_env".into(), "test_channel".into(), 1, &mut entropy).unwrap();
    let at = now();
    let transcript = Transcript {
        environment: "test_env".into(),
        channel: "test_channel".into(),
        invitation: "invitation".into(),
        epoch: 1,
        expires_at_unix_ms: at + 120_000,
        owner: Identity {
            device: "owner".into(),
            signing: owner.public(),
            kem: owner_kem.public(),
        },
        recipient: Identity {
            device: "receiver".into(),
            signing: receiver.public(),
            kem: receiver_kem.public(),
        },
    };
    // Test-only simulated comparison, not an enrollment UI approval.
    let approval = OutOfBandApproval::confirm(
        &transcript,
        transcript.fingerprint().unwrap(),
        UserDecision::Approve,
    )
    .unwrap();
    let mut invitation = Invitation::new(transcript.clone(), at).unwrap();
    let mut recipient_invitation = RecipientInvitation::new(transcript, at).unwrap();
    let transfer = invitation
        .offer(&approval, &key, &owner, &mut entropy, at)
        .unwrap();
    let (received_key, confirmation) = recipient_invitation
        .accept(&approval, &transfer, &receiver_kem, &receiver, at)
        .unwrap();
    invitation.confirm(&transfer, &confirmation, at).unwrap();
    let (mut fixture, url, issuer) = Fixture::new(&owner, &receiver);
    // Persist only synthetic fixture keys. Reopen before sending/receiving so
    // the HTTP test also exercises actual current-user DPAPI custody.
    let binding = |device: &str, reference: &str, kind| super::custody::Binding {
        environment: "test_env".into(),
        profile: format!("fixture_{device}"),
        device: device.into(),
        kind,
        epoch: 1,
        reference: reference.into(),
    };
    let owner_binding = binding("owner", "owner_signer", super::custody::KeyKind::Signing);
    let receiver_binding = binding(
        "receiver",
        "receiver_signer",
        super::custody::KeyKind::Signing,
    );
    let channel_kind = || super::custody::KeyKind::Channel {
        channel: "test_channel".into(),
    };
    let owner_channel = binding("owner", "owner_channel", channel_kind());
    let receiver_channel = binding("receiver", "receiver_channel", channel_kind());
    {
        let vault = super::custody::Vault::create(&fixture.root, "keys").unwrap();
        vault.store_signer(&owner_binding, &owner).unwrap();
        vault.store_signer(&receiver_binding, &receiver).unwrap();
        vault.store_channel(&owner_channel, &key).unwrap();
        vault
            .store_channel(&receiver_channel, &received_key)
            .unwrap();
    }
    let (owner, receiver, key, received_key) = {
        let vault = super::custody::Vault::reopen(&fixture.root.join("keys")).unwrap();
        (
            vault.load_signer(&owner_binding).unwrap(),
            vault.load_signer(&receiver_binding).unwrap(),
            vault.load_channel(&owner_channel).unwrap(),
            vault.load_channel(&receiver_channel).unwrap(),
        )
    };
    let sender = RelayClient::new(&url, "test_env", "owner", OWNER_TOKEN, true).unwrap();
    let receiver_client =
        RelayClient::new(&url, "test_env", "receiver", RECEIVER_TOKEN, true).unwrap();
    assert_eq!(receiver_client.channels().unwrap().channels.len(), 1);
    let lease = sender.lease("test_channel", &issuer).unwrap();
    let text = "Copicu synthetic interop — á漢字\0end";
    let first = seal(
        publication("publication_one", 1, &lease.lease_id, now() + 120_000),
        text,
        &key,
        &owner,
        &mut entropy,
    )
    .unwrap();
    let ack = sender.publish(&first).unwrap();
    assert_eq!(ack.server_sequence, "1");
    assert_eq!(sender.publish(&first).unwrap().server_sequence, "1");
    let second = seal(
        publication("publication_two", 2, &lease.lease_id, now() + 120_000),
        text,
        &key,
        &owner,
        &mut entropy,
    )
    .unwrap();
    assert_ne!(first.nonce, second.nonce);
    assert_ne!(first.ciphertext, second.ciphertext);
    assert_eq!(sender.publish(&second).unwrap().server_sequence, "2");
    let page = receiver_client.sync("test_channel", 0).unwrap();
    assert_eq!(page.entries.len(), 2);
    let profile = fixture.root.join("receiver_profile");
    assert!(!profile.exists());
    let storage = AppStorage::open(&profile).unwrap();
    let store = RuntimeStore::init(&storage).unwrap();
    store
        .set_grant(Grant {
            environment: "test_env".into(),
            channel: "test_channel".into(),
            origin: "owner".into(),
            public_key: owner.public(),
            epoch: 1,
            revision: 1,
        })
        .unwrap();
    store
        .subscribe(Subscribe {
            id: "subscription".into(),
            environment: "test_env".into(),
            channel: "test_channel".into(),
            local_device: "receiver".into(),
            head: 0,
            history_enabled: true,
            folder_id: None,
        })
        .unwrap();
    let fence = store
        .policy("subscription", Policy::ReceiveMetadata, 0)
        .unwrap();
    let mut last = 0;
    let mut verified = vec![];
    for entry in &page.entries {
        let proof = entry.lease_proof.as_ref().unwrap();
        proof
            .verify_scope(&issuer, "test_env", "test_channel", "owner")
            .unwrap();
        let policy = ReceivePolicy {
            environment: "test_env",
            channel: "test_channel",
            device: "owner",
            signing_key: owner.public(),
            epoch: 1,
            now_unix_ms: now(),
            last_origin_ordinal: last,
            live_lease: Some(&proof.lease_id),
        };
        let opened = open(&entry.envelope, &received_key, &policy).unwrap();
        assert_eq!(opened.text(), text);
        verified.push(opened);
        last = counter(&entry.envelope.origin_ordinal).unwrap();
        let replay = ReceivePolicy {
            last_origin_ordinal: last,
            ..policy
        };
        assert!(matches!(
            open(&entry.envelope, &received_key, &replay),
            Err(super::crypto::Error::Replay)
        ));
        let mut tamper = entry.envelope.clone();
        tamper.ciphertext[0] ^= 1;
        assert!(open(&tamper, &received_key, &policy).is_err());
    }
    let arrivals: Vec<_> = page
        .entries
        .iter()
        .zip(&verified)
        .map(|(entry, text)| VerifiedArrival {
            server_sequence: counter(&entry.server_sequence).unwrap(),
            text,
        })
        .collect();
    let admitted = store
        .admit_page("subscription", fence, &arrivals, now())
        .unwrap();
    assert_eq!(admitted.cursor, 2);
    assert_eq!(
        store
            .admit_page("subscription", fence, &arrivals, now())
            .unwrap(),
        admitted
    );
    let first_item = match store
        .history_import("subscription", admitted, &verified[0], "history_one", now())
        .unwrap()
    {
        HistoryOutcome::Applied { item: Some(item) } => item,
        _ => panic!("synthetic import failed"),
    };
    match store
        .history_import("subscription", admitted, &verified[1], "history_two", now())
        .unwrap()
    {
        HistoryOutcome::Applied { item: Some(item) } => assert_eq!(item, first_item),
        _ => panic!("synthetic dedupe failed"),
    }
    assert_eq!(storage.get_item(first_item).unwrap().text(), text);
    assert_eq!(store.report_pending("subscription").unwrap().len(), 2);
    // Reopen the local profile before reporting: same attempts, no reimport.
    drop(store);
    drop(storage);
    let storage = AppStorage::open(&profile).unwrap();
    let store = RuntimeStore::init(&storage).unwrap();
    let pending: Vec<crate::storage::shared::PendingReport> =
        store.report_pending("subscription").unwrap();
    assert_eq!(pending.len(), 2);
    for pending in pending {
        let mut metadata = Report {
            attempt_id: pending.attempt_id,
            publication_id: pending.publication_id,
            sink: pending.sink,
            outcome: pending.outcome,
            signature: String::new(),
        };
        metadata
            .sign(
                &pending.environment,
                &pending.channel,
                &pending.device,
                &receiver,
            )
            .unwrap();
        receiver_client.report(&pending.channel, &metadata).unwrap();
        receiver_client.report(&pending.channel, &metadata).unwrap();
        store
            .ack_report("subscription", &metadata.attempt_id)
            .unwrap();
    }
    assert!(store.report_pending("subscription").unwrap().is_empty());
    assert_eq!(storage.get_item(first_item).unwrap().text(), text);
    let mut report = Report {
        attempt_id: "attempt_one".into(),
        publication_id: first.publication_id.clone(),
        sink: "clipboard".into(),
        outcome: "uncertain".into(),
        signature: String::new(),
    };
    report
        .sign("test_env", "test_channel", "receiver", &receiver)
        .unwrap();
    receiver_client.report("test_channel", &report).unwrap();
    receiver_client.report("test_channel", &report).unwrap();
    report.outcome = "applied".into();
    report
        .sign("test_env", "test_channel", "receiver", &receiver)
        .unwrap();
    assert!(matches!(
        receiver_client.report("test_channel", &report),
        Err(super::transport::Error::Conflict)
    ));
    let watch = thread::spawn(move || receiver_client.watch("test_channel", 2).unwrap().head);
    let third = seal(
        publication("publication_three", 3, &lease.lease_id, now() + 120_000),
        text,
        &key,
        &owner,
        &mut entropy,
    )
    .unwrap();
    sender.publish(&third).unwrap();
    assert_eq!(watch.join().unwrap(), "3");
    fixture.send(json!({"command":"revoke","device":"receiver"}));
    assert_eq!(fixture.receive()["ack"], true);
    let revoked = RelayClient::new(&url, "test_env", "receiver", RECEIVER_TOKEN, true).unwrap();
    assert!(matches!(
        revoked.sync("test_channel", 0),
        Err(super::transport::Error::Denied)
    ));
}
