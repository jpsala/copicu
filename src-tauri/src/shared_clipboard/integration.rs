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
              {"id":"receiver","token":RECEIVER_TOKEN,"public_key":STANDARD.encode(receiver.public()),"grants":[{"channel_id":"test_channel","key_epoch":"1","publish":false,"read":true,"report":true}]}
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
