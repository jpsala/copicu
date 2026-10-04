//! New profiles through the real host and HTTP OIDC/SQLite/DPAPI/HPKE. No real
//! profile, Windows clipboard, capture, UI account or installed binary is used.
use super::super::config::ConnectionInput;
use super::*;
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
    time::Duration,
};
static NEXT: AtomicU64 = AtomicU64::new(0);
struct Fixture {
    child: Child,
    stdin: ChildStdin,
    lines: mpsc::Receiver<String>,
    reader: Option<thread::JoinHandle<()>>,
    root: PathBuf,
    endpoint: String,
}
impl Fixture {
    fn new() -> Self {
        Self::with_custody(false)
    }
    fn with_custody(managed: bool) -> Self {
        let root = std::env::temp_dir().join(format!(
            "copicu-identity-v3-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::SeqCst)
        ));
        fs::create_dir(&root).unwrap();
        let mut child = Command::new("bun")
            .arg("tests/manual/shared-identity-relay.mjs")
            .current_dir(PathBuf::from(env!("CARGO_MANIFEST_DIR")).parent().unwrap())
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .unwrap();
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
        let mut f = Self {
            child,
            stdin,
            lines,
            reader: Some(reader),
            root,
            endpoint: String::new(),
        };
        let result =
            f.ask(json!({"dbPath":f.root.join("relay.sqlite"),"environment":"identity_synthetic","managedCustody":managed}));
        f.endpoint = result["url"].as_str().unwrap().into();
        f
    }
    fn ask(&mut self, input: Value) -> Value {
        serde_json::to_writer(&mut self.stdin, &input).unwrap();
        self.stdin.write_all(b"\n").unwrap();
        self.stdin.flush().unwrap();
        let line = self.lines.recv_timeout(Duration::from_secs(20)).unwrap();
        assert!(line.len() < 1024);
        serde_json::from_str(&line).unwrap()
    }
    fn profile(&self, name: &str) -> AppStorage {
        AppStorage::open(&self.root.join(name)).unwrap()
    }
    fn login(&mut self, storage: &AppStorage, name: &str) -> Value {
        assert_eq!(
            start(storage, &self.endpoint, name).unwrap()["state"],
            "waiting"
        );
        assert!(
            !runtime::snapshot(storage).unwrap().configured
                || load(storage).unwrap().unwrap().replaces_device_id.is_some()
        );
        let state = load(storage).unwrap().unwrap();
        let vault = runtime::vault(&runtime::store(storage).unwrap(), &state.config).unwrap();
        assert_eq!(
            self.ask(json!({"command":"browser","url":browser_url(&state,&vault).unwrap()}))["ack"],
            true
        );
        status(storage).unwrap()
    }
    fn approve(&mut self, source: &AppStorage, target: &AppStorage, op: &str) -> Value {
        let source_status = status(source).unwrap();
        let target_status = status(target).unwrap();
        device_action(source,json!({"kind":"approve","operationId":op,"deviceId":target_status["deviceId"],"fingerprint":target_status["fingerprint"],"expectedRevision":source_status["revision"]})).unwrap()
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
        if let Some(reader) = self.reader.take() {
            let _ = reader.join();
        }
        use std::os::windows::fs::MetadataExt;
        if self.root.parent() == Some(std::env::temp_dir().as_path())
            && self
                .root
                .file_name()
                .unwrap()
                .to_string_lossy()
                .starts_with("copicu-identity-v3-")
            && fs::symlink_metadata(&self.root)
                .is_ok_and(|m| m.is_dir() && m.file_attributes() & 0x400 == 0)
        {
            let _ = fs::remove_dir_all(&self.root);
        }
    }
}
fn create(storage: &AppStorage, op: &str, name: &str) -> String {
    product::operation(
        storage,
        json!({"kind":"create","operationId":op,"name":name}),
    )
    .unwrap()["resource"]["id"]
        .as_str()
        .unwrap()
        .into()
}
fn connect(storage: &AppStorage, id: &str) {
    let input = ConnectionInput {
        id: "general".into(),
        channel_id: id.into(),
        kind: "general".into(),
        folder_id: None,
        direction: "both".into(),
        move_reception: false,
    };
    let head = runtime::prepare_connection_head(storage, &input).unwrap();
    runtime::connect_with_head(storage, input, head).unwrap();
}
fn send(storage: &AppStorage, id: &str, text: &str) -> String {
    runtime::poll_once(storage).unwrap();
    let pub_id = runtime::publish_text(storage, id, text, "syntheticTest").unwrap()
        ["publicationId"]
        .as_str()
        .unwrap()
        .to_owned();
    runtime::poll_once(storage).unwrap();
    assert!(runtime::snapshot(storage)
        .unwrap()
        .outbox
        .iter()
        .any(|p| p["publicationId"] == pub_id && p["state"] == "accepted"));
    pub_id
}

#[test]
fn managed_account_links_equal_pcs_and_delivers_text_image_rotation_and_restart() {
    let _serial = runtime::TEST_RUNTIME.lock().unwrap();
    let mut f = Fixture::with_custody(true);
    let a = f.profile("managed_work");
    let b = f.profile("managed_home");
    let c = f.profile("managed_later");
    assert_eq!(f.login(&a, "Synthetic Work")["state"], "active");
    assert_eq!(f.login(&b, "Synthetic Home")["state"], "active");
    let rid = create(&a, "managed_create", "Synthetic managed ñ 🙂");
    assert_eq!(
        product::catalog(&b).unwrap()["resources"][0]["name"],
        "Synthetic managed ñ 🙂"
    );
    assert!(runtime::snapshot(&b).unwrap().connections.is_empty());
    connect(&a, &rid);
    connect(&b, &rid);
    let publication = send(&a, &rid, "synthetic managed text λ");
    runtime::poll_once(&b).unwrap();
    let receipt = runtime::snapshot(&b)
        .unwrap()
        .receipts
        .into_iter()
        .find(|r| r["publicationId"] == publication)
        .unwrap();
    assert_eq!(
        runtime::receipt_text(
            &b,
            receipt["subscriptionId"].as_str().unwrap(),
            &publication
        )
        .unwrap(),
        "synthetic managed text λ"
    );
    let image = crate::clipboard_content::ClipboardContent::Image(
        crate::image_capture::synthetic_image(3, 2).png_bytes,
    );
    let cfg = runtime::required(&a).unwrap();
    let image_id = runtime::publish_content(&a, &rid, &image, "syntheticTest").unwrap()
        ["publicationId"]
        .as_str()
        .unwrap()
        .to_owned();
    runtime::poll_once(&a).unwrap();
    runtime::poll_once(&b).unwrap();
    let saved = runtime::snapshot(&b)
        .unwrap()
        .receipts
        .into_iter()
        .find(|r| r["publicationId"] == image_id)
        .unwrap();
    let content =
        runtime::receipt_content(&b, saved["subscriptionId"].as_str().unwrap(), &image_id).unwrap();
    assert!(content == image);
    assert!(runtime::snapshot(&b)
        .unwrap()
        .channels
        .iter()
        .all(|ch| !ch.update_clipboard && !ch.receive_action_enabled));
    assert_eq!(f.login(&c, "Synthetic Later")["state"], "active");
    assert_eq!(
        product::catalog(&c).unwrap()["resources"][0]["keyState"],
        "ready"
    );
    assert!(runtime::snapshot(&c).unwrap().connections.is_empty());
    assert!(runtime::snapshot(&c).unwrap().receipts.is_empty());
    let catalog = product::catalog(&a).unwrap();
    product::operation(&a,json!({"kind":"rotate","operationId":"managed_rotate","resourceId":rid,"expectedRevision":catalog["resources"][0]["revision"]})).unwrap();
    product::catalog(&b).unwrap();
    assert_eq!(
        runtime::required(&b).unwrap().channels[0].epoch,
        cfg.channels[0].epoch + 1
    );
    // Rotation fences the old receive range. Reconcile the new live head before
    // publishing, as the background worker does, without replaying history.
    runtime::poll_once(&a).unwrap();
    runtime::poll_once(&b).unwrap();
    let reverse = send(&b, &rid, "synthetic after rotation");
    runtime::poll_once(&a).unwrap();
    assert!(runtime::snapshot(&a)
        .unwrap()
        .receipts
        .iter()
        .any(|r| r["publicationId"] == reverse));
    f.ask(json!({"command":"restart"}));
    assert_eq!(status(&c).unwrap()["state"], "active");
    assert_eq!(
        product::catalog(&c).unwrap()["resources"][0]["keyState"],
        "ready"
    );
    drop(c);
    drop(b);
    drop(a);
}

#[test]
fn managed_custody_migrates_legacy_keys_without_reconnecting_or_changing_effects() {
    let _serial = runtime::TEST_RUNTIME.lock().unwrap();
    let mut f = Fixture::new();
    let a = f.profile("legacy_work");
    let b = f.profile("legacy_pending");
    f.login(&a, "Synthetic Legacy Work");
    let rid = create(&a, "legacy_managed_migration", "Synthetic legacy clipboard");
    connect(&a, &rid);
    let legacy_publication = send(&a, &rid, "synthetic before migration");
    assert_eq!(f.login(&b, "Synthetic Legacy Home")["state"], "pending");
    let before = runtime::required(&a).unwrap();
    f.ask(json!({"command":"custody"}));
    // Opening the upgraded owner deposits current keys; no peer approval occurs.
    assert_eq!(product::catalog(&a).unwrap()["keyCustody"], "service");
    assert_eq!(status(&b).unwrap()["state"], "active");
    let resources = product::catalog(&b).unwrap();
    assert_eq!(
        resources["resources"][0]["name"],
        "Synthetic legacy clipboard"
    );
    let after = runtime::required(&a).unwrap();
    assert_eq!(after.channels[0].epoch, before.channels[0].epoch);
    assert!(after.channels[0].policy == before.channels[0].policy);
    assert_eq!(runtime::snapshot(&a).unwrap().connections.len(), 1);
    assert!(runtime::snapshot(&b).unwrap().connections.is_empty());
    assert!(runtime::snapshot(&b).unwrap().receipts.is_empty());
    connect(&b, &rid);
    let publication = send(&a, &rid, "synthetic migrated text");
    runtime::poll_once(&b).unwrap();
    assert!(runtime::snapshot(&b)
        .unwrap()
        .receipts
        .iter()
        .any(|r| r["publicationId"] == publication));
    assert!(!runtime::snapshot(&b)
        .unwrap()
        .receipts
        .iter()
        .any(|r| r["publicationId"] == legacy_publication));
    f.ask(json!({"command":"restart"}));
    assert_eq!(
        product::catalog(&b).unwrap()["resources"][0]["keyState"],
        "ready"
    );
    drop(b);
    drop(a);
}

#[test]
fn oidc_new_profiles_approve_real_hpke_bidirectional_offline_pause_revoke_and_relink() {
    let _serial = runtime::TEST_RUNTIME.lock().unwrap();
    let mut f = Fixture::new();
    let a = f.profile("work");
    let b = f.profile("home");
    let owner = f.login(&a, "Synthetic Work");
    assert_eq!(owner["state"], "active");
    assert!(product::catalog(&a).unwrap()["resources"]
        .as_array()
        .unwrap()
        .is_empty());
    let rid = create(&a, "synthetic_create", "Synthetic clipboard ñ 🙂");
    let pending = f.login(&b, "Synthetic Home");
    assert_eq!(pending["state"], "pending");
    assert!(!runtime::snapshot(&b).unwrap().configured);
    f.ask(json!({"command":"restart"}));
    assert_eq!(status(&b).unwrap()["state"], "pending");
    let source = status(&a).unwrap();
    assert!(!source["devices"][0]
        .as_object()
        .unwrap()
        .contains_key("signingPublicKey"));
    assert!(device_action(&a,json!({"kind":"approve","operationId":"wrong_fp","deviceId":pending["deviceId"],"fingerprint":"wrong","expectedRevision":source["revision"]})).is_err());
    f.ask(json!({"command":"fault","mode":"after","kind":"approve"}));
    let intention = json!({"kind":"approve","operationId":"lost_approve","deviceId":pending["deviceId"],"fingerprint":pending["fingerprint"],"expectedRevision":source["revision"]});
    assert!(device_action(&a, intention.clone()).is_err());
    device_action(&a, intention).unwrap();
    assert_eq!(status(&b).unwrap()["state"], "active");
    let catalogue = product::catalog(&b).unwrap();
    assert_eq!(
        catalogue["resources"][0]["name"],
        "Synthetic clipboard ñ 🙂"
    );
    assert_eq!(catalogue["resources"][0]["keyState"], "ready");
    let before = runtime::snapshot(&b).unwrap();
    assert!(before.connections.is_empty());
    assert!(before.receipts.is_empty());
    assert!(before.channels.iter().all(|c| !c.receive_enabled
        && !c.update_clipboard
        && !c.receive_action_enabled
        && !c.publish_folder_enabled));
    connect(&a, &rid);
    connect(&b, &rid);
    let p = send(&a, &rid, "synthetic Work → Home ñ 🙂");
    runtime::poll_once(&b).unwrap();
    let received = runtime::snapshot(&b).unwrap();
    let receipt = received
        .receipts
        .iter()
        .find(|r| r["publicationId"] == p)
        .unwrap();
    assert_eq!(
        runtime::receipt_text(&b, receipt["subscriptionId"].as_str().unwrap(), &p).unwrap(),
        "synthetic Work → Home ñ 🙂"
    );
    let reverse = send(&b, &rid, "synthetic Home → Work λ");
    runtime::poll_once(&a).unwrap();
    assert!(runtime::snapshot(&a)
        .unwrap()
        .receipts
        .iter()
        .any(|r| r["publicationId"] == reverse));
    runtime::set_flow_paused(&b, None, None, Some(true)).unwrap();
    let during = send(&a, &rid, "synthetic paused arrival");
    runtime::poll_once(&b).unwrap();
    assert!(!runtime::snapshot(&b)
        .unwrap()
        .receipts
        .iter()
        .any(|r| r["publicationId"] == during));
    let heads = runtime::prepare_receive_resume(&b, None, Some(false)).unwrap();
    runtime::set_flow_paused_with_heads(&b, None, None, Some(false), heads).unwrap();
    runtime::poll_once(&b).unwrap();
    assert!(!runtime::snapshot(&b)
        .unwrap()
        .receipts
        .iter()
        .any(|r| r["publicationId"] == during));
    f.ask(json!({"command":"offline"}));
    assert_eq!(status(&b).unwrap()["state"], "offline");
    f.ask(json!({"command":"restart"}));
    assert_eq!(status(&b).unwrap()["state"], "active");
    let other = create(&b, "home_create", "Synthetic created on Home");
    let updated = product::catalog(&a).unwrap();
    assert!(updated["resources"]
        .as_array()
        .unwrap()
        .iter()
        .any(|r| r["id"] == other && r["keyState"] == "ready"));
    let source = status(&a).unwrap();
    let target = status(&b).unwrap();
    device_action(&a,json!({"kind":"revoke","operationId":"retire_home","deviceId":target["deviceId"],"fingerprint":target["fingerprint"],"expectedRevision":source["revision"]})).unwrap();
    assert_eq!(status(&b).unwrap()["state"], "revoked");
    assert!(runtime::snapshot(&b).unwrap().receive_paused);
    let restarted = f.login(&b, "Synthetic Home relinked");
    assert_eq!(restarted["state"], "pending");
    assert_ne!(restarted["deviceId"], target["deviceId"]);
    f.approve(&a, &b, "relink_home");
    assert_eq!(status(&b).unwrap()["state"], "active");
    let relinked = runtime::snapshot(&b).unwrap();
    assert!(relinked.connections.is_empty());
    assert!(relinked
        .channels
        .iter()
        .all(|c| !c.receive_enabled && !c.update_clipboard && !c.receive_action_enabled));
    assert!(relinked.receipts.iter().any(|r| r["publicationId"] == p));
    let receipt = relinked
        .receipts
        .iter()
        .find(|r| r["publicationId"] == p)
        .unwrap();
    assert_eq!(
        runtime::receipt_text(&b, receipt["subscriptionId"].as_str().unwrap(), &p).unwrap(),
        "synthetic Work → Home ñ 🙂"
    );
    drop(b);
    drop(a);
}

#[test]
fn real_e2ee_recovery_authenticates_keys_retires_devices_preserves_history_and_requires_rotation() {
    let _serial = runtime::TEST_RUNTIME.lock().unwrap();
    let mut f = Fixture::new();
    let a = f.profile("source");
    let b = f.profile("restored");
    f.login(&a, "Synthetic original");
    let rid = create(&a, "before_recovery", "Synthetic recoverable clipboard");
    let setup = setup_recovery(&a, None).unwrap();
    let code = Sensitive(setup["code"].as_str().unwrap().as_bytes().to_vec());
    assert_eq!(code.0.len(), 64);
    let source = status(&a).unwrap();
    assert!(source["recoveryReady"].as_bool().unwrap());
    assert!(!source.as_object().unwrap().contains_key("code"));
    send(&a, &rid, "synthetic before device loss");
    let pending = f.login(&b, "Synthetic recovered");
    assert_eq!(pending["state"], "pending");
    assert_eq!(pending["recoveryReady"], true);
    assert!(recover(&b, &"42".repeat(32), "wrong_recovery").is_err());
    f.ask(json!({"command":"fault","mode":"after","kind":"recover"}));
    assert!(recover(&b, text(&code).unwrap(), "restore_with_code").is_err());
    f.ask(json!({"command":"restart"}));
    let restored = recover(&b, text(&code).unwrap(), "restore_with_code").unwrap();
    assert_eq!(restored["state"], "active");
    assert_eq!(restored["localRecoveryCode"], true);
    assert_eq!(status(&a).unwrap()["state"], "revoked");
    let snapshot = runtime::snapshot(&b).unwrap();
    assert!(snapshot.connections.is_empty());
    assert!(snapshot.receipts.is_empty());
    assert!(!snapshot.channels[0].can_publish);
    let catalogue = product::catalog(&b).unwrap();
    let resource = &catalogue["resources"][0];
    assert_eq!(resource["name"], "Synthetic recoverable clipboard");
    assert!(runtime::publish_text(
        &b,
        &rid,
        "synthetic cannot send before rotation",
        "syntheticTest"
    )
    .is_err());
    product::operation(&b,json!({"kind":"rotate","operationId":"rotate_after_recovery","resourceId":rid,"expectedRevision":resource["revision"]})).unwrap();
    assert_eq!(
        runtime::history_page(&b, &rid, None).unwrap()["entries"][0]["text"],
        "synthetic before device loss"
    );
    assert!(runtime::snapshot(&b).unwrap().receipts.is_empty());
    drop(b);
    drop(a);
}
