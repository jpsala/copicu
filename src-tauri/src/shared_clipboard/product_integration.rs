//! Real Rust host -> synthetic Bun relay -> isolated Rust recipient, with actual
//! HPKE/XChaCha/Ed25519/DPAPI. No Windows clipboard or real profile is opened.
use super::super::{
    config::{ConfigureInput, ConnectionInput},
    crypto::DeviceSigner,
    runtime,
};
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
}
impl Fixture {
    fn start(signers: &[DeviceSigner]) -> (Self, String, String) {
        let root = std::env::temp_dir().join(format!(
            "copicu-product-v2-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::SeqCst)
        ));
        fs::create_dir(&root).unwrap();
        let mut child = Command::new("bun")
            .arg("tests/manual/shared-control-relay.mjs")
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
        let mut fixture = Self {
            child,
            stdin,
            lines,
            reader: Some(reader),
            root,
        };
        fixture.send(json!({"dbPath":fixture.root.join("relay.sqlite"),"environment":"product_test","persons":[{"id":"alice","name":"Synthetic Alice"},{"id":"bob","name":"Synthetic Bob"}],"channels":[{"id":"bootstrap","key_epoch":"1","owner_person_id":"alice"}],"devices":signers.iter().enumerate().map(|(i,s)|json!({"id":format!("device_{i}"),"person_id":if i==2{"bob"}else{"alice"},"token":format!("synthetic_private_token_device_{i}_00000000000"),"public_key":STANDARD.encode(s.public()),"grants":[{"channel_id":"bootstrap","key_epoch":"1","publish":i!=2,"read":true,"report":true}]})).collect::<Vec<_>>() }));
        let result = fixture.receive();
        let endpoint = result["url"].as_str().unwrap().into();
        let issuer = result["issuer"].as_str().unwrap().into();
        (fixture, endpoint, issuer)
    }
    fn send(&mut self, v: Value) {
        serde_json::to_writer(&mut self.stdin, &v).unwrap();
        self.stdin.write_all(b"\n").unwrap();
        self.stdin.flush().unwrap();
    }
    fn receive(&self) -> Value {
        let text = self.lines.recv_timeout(Duration::from_secs(15)).unwrap();
        assert!(text.len() < 1024);
        serde_json::from_str(&text).unwrap()
    }
    fn fault(&mut self, mode: &str) {
        self.send(json!({"command":"fault","mode":mode,"kind":"create"}));
        assert_eq!(self.receive()["ack"], true);
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
                .starts_with("copicu-product-v2-")
            && fs::symlink_metadata(&self.root)
                .is_ok_and(|m| m.is_dir() && m.file_attributes() & 0x400 == 0)
        {
            let _ = fs::remove_dir_all(&self.root);
        }
    }
}
fn enrolled(
    f: &Fixture,
    index: usize,
    signers: &[DeviceSigner],
    endpoint: &str,
    issuer: &str,
) -> AppStorage {
    let profile = f.root.join(format!("profile_{index}"));
    let storage = AppStorage::open(&profile).unwrap();
    let bundle = f.root.join(format!("bundle_{index}.json"));
    let seed = signers[index].export_secret();
    let value = json!({"version":1,"environment":"product_test","deviceId":format!("device_{index}"),"endpoint":endpoint,"allowLoopback":true,"bearer":format!("synthetic_private_token_device_{index}_00000000000"),"signingSeed":STANDARD.encode(&seed.0),"issuerPublicKey":issuer,"channels":[{"id":"bootstrap","name":"Synthetic bootstrap","epoch":1,"canPublish":index!=2,"key":STANDARD.encode([37;32]),"grants":signers.iter().enumerate().map(|(i,s)|json!({"deviceId":format!("device_{i}"),"publicKey":STANDARD.encode(s.public()),"revision":1})).collect::<Vec<_>>()}]});
    fs::write(&bundle, serde_json::to_vec(&value).unwrap()).unwrap();
    let preview = runtime::enrollment_preview(&storage, bundle.to_str().unwrap()).unwrap();
    runtime::configure(
        &storage,
        ConfigureInput {
            bundle_path: bundle.to_string_lossy().into_owned(),
            confirmed_fingerprint: preview.fingerprint,
        },
    )
    .unwrap();
    storage
}
fn resource(catalog: &Value, id: &str) -> Value {
    catalog["resources"]
        .as_array()
        .unwrap()
        .iter()
        .find(|r| r["id"] == id)
        .unwrap()
        .clone()
}
fn publish(storage: &AppStorage, channel: &str, text: &str) -> String {
    runtime::poll_once(storage).unwrap();
    let queued = runtime::publish_text(storage, channel, text, "syntheticTest").unwrap();
    runtime::poll_once(storage).unwrap();
    let id = queued["publicationId"].as_str().unwrap().to_owned();
    assert!(runtime::snapshot(storage)
        .unwrap()
        .outbox
        .iter()
        .any(|v| v["publicationId"] == id && v["state"] == "accepted"));
    id
}
#[test]
fn runtime_drains_twenty_publications_without_aging_live_lease_and_respects_pause() {
    let _runtime = runtime::TEST_RUNTIME.lock().unwrap();
    let signers = (0..2)
        .map(|_| DeviceSigner::generate(&mut SystemEntropy).unwrap())
        .collect::<Vec<_>>();
    let (fixture, endpoint, issuer) = Fixture::start(&signers);
    let owner = enrolled(&fixture, 0, &signers, &endpoint, &issuer);
    let receiver = enrolled(&fixture, 1, &signers, &endpoint, &issuer);
    let connection = ConnectionInput {
        id: "general".into(), channel_id: "bootstrap".into(), kind: "general".into(),
        folder_id: None, direction: "receive".into(), move_reception: false,
    };
    let head = runtime::prepare_connection_head(&receiver, &connection).unwrap();
    runtime::connect_with_head(&receiver, connection, head).unwrap();
    runtime::poll_once(&owner).unwrap();
    let publications = (0..20).map(|i| runtime::publish_text(
        &owner, "bootstrap", &format!("synthetic-burst-{i}"), "syntheticTest",
    ).unwrap()["publicationId"].as_str().unwrap().to_owned()).collect::<Vec<_>>();
    runtime::poll_once(&owner).unwrap();
    let status = runtime::snapshot(&owner).unwrap();
    assert!(publications.iter().all(|id| status.outbox.iter().any(
        |r| r["publicationId"] == *id && r["state"] == "accepted"
    )), "one bounded poll drains a local twenty-publication burst");
    assert!(runtime::poll_once(&receiver).unwrap().history_changed);
    assert_eq!(runtime::snapshot(&receiver).unwrap().receipts.len(), 20);
    runtime::poll_once(&receiver).unwrap();
    assert_eq!(runtime::snapshot(&receiver).unwrap().receipts.len(), 20);
    let queued = runtime::publish_text(&owner, "bootstrap", "synthetic-paused-batch", "syntheticTest").unwrap();
    runtime::set_flow_paused(&owner, Some("bootstrap"), Some(true), None).unwrap();
    runtime::poll_once(&owner).unwrap();
    assert!(runtime::snapshot(&owner).unwrap().outbox.iter().any(
        |r| r["publicationId"] == queued["publicationId"] && r["state"] == "queued"
    ));
    runtime::set_flow_paused(&owner, Some("bootstrap"), Some(false), None).unwrap();
    runtime::poll_once(&owner).unwrap();
    assert!(runtime::snapshot(&owner).unwrap().outbox.iter().any(
        |r| r["publicationId"] == queued["publicationId"] && r["state"] == "accepted"
    ));
}

#[test]
fn images_cross_encrypted_relay_save_preview_and_copy_without_capture_echo() {
    use crate::clipboard_content::ClipboardContent;
    let _runtime = runtime::TEST_RUNTIME.lock().unwrap();
    let signers = (0..2).map(|_| DeviceSigner::generate(&mut SystemEntropy).unwrap()).collect::<Vec<_>>();
    let (fixture, endpoint, issuer) = Fixture::start(&signers);
    let owner = enrolled(&fixture, 0, &signers, &endpoint, &issuer);
    let receiver = enrolled(&fixture, 1, &signers, &endpoint, &issuer);
    refresh_catalog(&owner, true).unwrap();
    refresh_catalog(&receiver, true).unwrap();
    let folder = receiver.create_folder_path("/Synthetic images").unwrap();
    let owner_connection = ConnectionInput { id:"general".into(),channel_id:"bootstrap".into(),kind:"general".into(),folder_id:None,direction:"send".into(),move_reception:false };
    let head = runtime::prepare_connection_head(&owner, &owner_connection).unwrap();
    runtime::connect_with_head(&owner, owner_connection, head).unwrap();
    let connection = ConnectionInput { id:format!("folder_{}",folder.id),channel_id:"bootstrap".into(),kind:"folder".into(),folder_id:Some(folder.id),direction:"both".into(),move_reception:false };
    let head = runtime::prepare_connection_head(&receiver, &connection).unwrap();
    runtime::connect_with_head(&receiver, connection, head).unwrap();
    let mut policy = runtime::snapshot(&receiver).unwrap().channels[0].clone();
    policy.update_clipboard = true;
    runtime::update_channel(&receiver, policy).unwrap();
    runtime::poll_once(&owner).unwrap();
    runtime::poll_once(&receiver).unwrap();
    let image = crate::image_capture::synthetic_image(800,600);
    assert!(image.png_bytes.len() > 1024 * 1024, "fixture exceeds the old text-only bound");
    let item = owner.insert_image(&image).unwrap();
    assert_eq!(runtime::snapshot(&owner).unwrap().outbox.len(), 1, "new image ingress queues automatically");
    owner.insert_image(&image).unwrap();
    assert_eq!(runtime::snapshot(&owner).unwrap().outbox.len(), 1, "recapture is not a new ingress");
    runtime::poll_once(&owner).unwrap();
    let arrival = runtime::poll_once(&receiver).unwrap();
    assert!(arrival.history_changed);
    assert_eq!(arrival.effects.len(), 1);
    let effect = &arrival.effects[0];
    assert!(effect.content == ClipboardContent::Image(image.png_bytes.clone()));
    assert!(effect.action_id.is_none(), "text script Actions do not run with fabricated image text");
    let state = runtime::snapshot(&receiver).unwrap();
    let local_id = state.receipts[0]["localItemId"].as_i64().unwrap();
    let received = receiver.get_item(local_id).unwrap();
    assert_eq!(received.content_kind(), "image");
    assert_eq!(received.normalized_hash(), image.normalized_hash);
    assert_eq!(receiver.read_blob_for_item(&received).unwrap(), image.png_bytes);
    assert!(receiver.get_item_preview(local_id).is_ok());
    assert!(runtime::snapshot(&receiver).unwrap().outbox.is_empty());
    assert_eq!(runtime::publish_folder_ingress(&receiver, Some(folder.id),local_id,false).unwrap(),0);
    let attempt = runtime::claim_clipboard(&receiver, effect).unwrap();
    runtime::finish_clipboard(&receiver,&effect.subscription_id,&attempt,"applied").unwrap();
    assert!(runtime::claim_clipboard(&receiver,effect).is_err());
    assert!(runtime::receipt_text(&receiver,&effect.subscription_id,&effect.publication_id).is_err());
    let content = runtime::receipt_content(&receiver,&effect.subscription_id,&effect.publication_id).unwrap();
    assert_eq!(content.preview().unwrap()["kind"], "image");
    let history = runtime::history_page(&receiver,"bootstrap",None).unwrap();
    assert_eq!(history["entries"][0]["kind"], "image");
    assert!(history["entries"][0]["text"].is_null());
    let duplicate = runtime::historical_import(&receiver,"bootstrap",&effect.publication_id,None).unwrap();
    assert_eq!(duplicate["itemId"],local_id);
    assert_eq!(duplicate["folderId"],folder.id);
    assert_eq!(duplicate["alreadyExists"],true);
    assert_eq!(owner.get_item(item).unwrap().content_kind(), "image");
    runtime::set_flow_paused(&receiver,None,None,Some(true)).unwrap();
    assert!(runtime::claim_clipboard(&receiver,effect).is_err());
}

#[test]
fn rust_sse_replay_live_reconciles_durable_control_without_receipt_effects() {
    use crate::shared_clipboard::control_sync;
    use std::sync::{Arc, atomic::AtomicBool};
    let _runtime=runtime::TEST_RUNTIME.lock().unwrap();
    let signers=(0..2).map(|_| DeviceSigner::generate(&mut SystemEntropy).unwrap()).collect::<Vec<_>>();
    let (fixture,endpoint,issuer)=Fixture::start(&signers);
    let owner=enrolled(&fixture,0,&signers,&endpoint,&issuer);
    let sibling=enrolled(&fixture,1,&signers,&endpoint,&issuer);
    catalog(&owner).unwrap();
    let snapshot=catalog(&sibling).unwrap();
    runtime::set_flow_paused(&sibling,None,Some(true),Some(true)).unwrap();
    let c=runtime::required(&sibling).unwrap();
    let mark=control_sync::Watermark::from_catalog(&snapshot,&c).unwrap();
    let created=operation(&owner,json!({"operationId":"sse_create","kind":"create","name":"Synthetic SSE"})).unwrap();
    let channel=created["resource"]["id"].as_str().unwrap();
    let (wake,rx)=mpsc::sync_channel(1);
    let (publication_wake,publications)=mpsc::sync_channel(1);
    let task=control_sync::stream(&c,&sibling,mark,wake,publication_wake,Arc::new(AtomicBool::new(false))).unwrap();
    rx.recv_timeout(Duration::from_secs(5)).unwrap();
    let applied=refresh_catalog(&sibling,true).unwrap();
    assert_eq!(resource(&applied,channel)["revision"],"1");
    let cached=runtime::store(&sibling).unwrap().control_cache(&control_sync::identity(&c)).unwrap().unwrap();
    assert_eq!(serde_json::from_str::<Value>(&cached).unwrap()["control"],applied["control"]);
    assert!(runtime::snapshot(&sibling).unwrap().receipts.is_empty());
    operation(&owner,json!({"operationId":"sse_rename","kind":"rename","resourceId":channel,"expectedRevision":"1","name":"Synthetic remote rename"})).unwrap();
    rx.recv_timeout(Duration::from_secs(5)).unwrap();
    assert_eq!(resource(&refresh_catalog(&sibling,true).unwrap(),channel)["revision"],"2");
    // Ordinary HTTP publication remains available while the dedicated SSE waits.
    publish(&owner,channel,"synthetic-dedicated-transport");
    publications.recv_timeout(Duration::from_secs(5)).unwrap();
    assert!(rx.try_recv().is_err(), "a publication hint does not pull or invalidate the catalog");
    assert!(runtime::snapshot(&sibling).unwrap().receipts.is_empty());
    let started=std::time::Instant::now();task.abort();let _=tauri::async_runtime::block_on(task);
    assert!(started.elapsed()<Duration::from_secs(1));
}

#[test]
fn publication_hints_replay_preserve_pause_resume_dedupe_and_native_opt_ins() {
    use crate::shared_clipboard::control_sync;
    use std::sync::{Arc, atomic::AtomicBool};
    let _runtime = runtime::TEST_RUNTIME.lock().unwrap();
    let signers = (0..2).map(|_| DeviceSigner::generate(&mut SystemEntropy).unwrap()).collect::<Vec<_>>();
    let (fixture, endpoint, issuer) = Fixture::start(&signers);
    let owner = enrolled(&fixture, 0, &signers, &endpoint, &issuer);
    let receiver = enrolled(&fixture, 1, &signers, &endpoint, &issuer);
    let snapshot = refresh_catalog(&receiver, true).unwrap();
    let c = runtime::required(&receiver).unwrap();
    let mark = control_sync::Watermark::from_catalog(&snapshot, &c).unwrap();
    let connection = ConnectionInput {
        id: "general".into(), channel_id: "bootstrap".into(), kind: "general".into(),
        folder_id: None, direction: "receive".into(), move_reception: false,
    };
    let head = runtime::prepare_connection_head(&receiver, &connection).unwrap();
    runtime::connect_with_head(&receiver, connection, head).unwrap();
    runtime::set_flow_paused(&receiver, None, Some(true), Some(true)).unwrap();
    let (catalog_wake, catalog_hints) = mpsc::sync_channel(1);
    let (publication_wake, hints) = mpsc::sync_channel(1);
    let task = control_sync::stream(&c, &receiver, mark.clone(), catalog_wake, publication_wake,
        Arc::new(AtomicBool::new(false))).unwrap();
    runtime::poll_once(&owner).unwrap();
    for i in 0..20 {
        runtime::publish_text(&owner, "bootstrap", &format!("synthetic-SSE-paused-{i}"), "syntheticTest").unwrap();
    }
    runtime::poll_once(&owner).unwrap();
    hints.recv_timeout(Duration::from_secs(5)).unwrap();
    assert!(catalog_hints.try_recv().is_err());
    runtime::poll_once(&receiver).unwrap();
    assert!(runtime::snapshot(&receiver).unwrap().receipts.is_empty());
    let cache = runtime::store(&receiver).unwrap().control_cache(&control_sync::identity(&c)).unwrap().unwrap();
    assert_eq!(serde_json::from_str::<Value>(&cache).unwrap()["control"], snapshot["control"]);
    task.abort(); let _ = tauri::async_runtime::block_on(task);

    runtime::set_flow_paused(&receiver, None, None, Some(false)).unwrap();
    runtime::poll_once(&receiver).unwrap();
    assert!(runtime::snapshot(&receiver).unwrap().receipts.is_empty(), "resume skips the paused burst");
    let id = publish(&owner, "bootstrap", "synthetic-SSE-after-resume");
    let (catalog_wake, catalog_hints) = mpsc::sync_channel(1);
    let (publication_wake, hints) = mpsc::sync_channel(1);
    let task = control_sync::stream(&c, &receiver, mark, catalog_wake, publication_wake,
        Arc::new(AtomicBool::new(false))).unwrap();
    hints.recv_timeout(Duration::from_secs(5)).unwrap(); // durable replay includes the paused burst
    assert!(catalog_hints.try_recv().is_err());
    runtime::poll_once(&receiver).unwrap();
    runtime::poll_once(&receiver).unwrap();
    let state = runtime::snapshot(&receiver).unwrap();
    assert_eq!(state.receipts.len(), 1);
    assert_eq!(state.receipts[0]["publicationId"], id);
    assert!(state.outbox.is_empty(), "a received publication cannot echo");
    assert!(runtime::required(&receiver).unwrap().channels.iter().all(|ch|
        !ch.policy.update_clipboard && !ch.policy.receive_action_enabled));
    task.abort(); let _ = tauri::async_runtime::block_on(task);
}

#[test]
fn rust_control_two_people_three_devices_hpke_history_revocation_and_intent_recovery() {
    let _runtime = runtime::TEST_RUNTIME.lock().unwrap();
    let signers = (0..3)
        .map(|_| DeviceSigner::generate(&mut SystemEntropy).unwrap())
        .collect::<Vec<_>>();
    let (mut fixture, endpoint, issuer) = Fixture::start(&signers);
    let owner = enrolled(&fixture, 0, &signers, &endpoint, &issuer);
    let sibling = enrolled(&fixture, 1, &signers, &endpoint, &issuer);
    let reader = enrolled(&fixture, 2, &signers, &endpoint, &issuer);
    catalog(&owner).unwrap();
    catalog(&sibling).unwrap();
    catalog(&reader).unwrap();
    fixture.fault("before");
    assert!(operation(
        &owner,
        json!({"operationId":"recover_before","kind":"create","name":"Synthetic pending"})
    )
    .is_err());
    let pending = catalog(&owner).unwrap();
    assert!(pending["pendingOperations"]
        .as_array()
        .unwrap()
        .iter()
        .any(|v| v["operationId"] == "recover_before"));
    let recovered = operation(
        &owner,
        json!({"operationId":"recover_before","kind":"recover"}),
    )
    .unwrap();
    assert_eq!(recovered["resource"]["name"], "Synthetic pending");
    fixture.fault("after");
    assert!(operation(
        &owner,
        json!({"operationId":"recover_after","kind":"create","name":"Synthetic lost response"})
    )
    .is_err());
    let cat = catalog(&owner).unwrap();
    assert!(cat["resources"]
        .as_array()
        .unwrap()
        .iter()
        .any(|v| v["name"] == "Synthetic lost response"));
    let created = operation(
        &owner,
        json!({"operationId":"create_main","kind":"create","name":"Synthetic collaboration"}),
    )
    .unwrap();
    let channel = created["resource"]["id"].as_str().unwrap().to_owned();
    assert!(!catalog(&reader).unwrap()["resources"]
        .as_array()
        .unwrap()
        .iter()
        .any(|v| v["id"] == channel));
    assert_eq!(
        resource(&catalog(&sibling).unwrap(), &channel)["keyState"],
        "pending"
    );
    let publication = publish(&owner, &channel, "synthetic-before-invitation");
    let invited=operation(&owner,json!({"operationId":"invite_main","kind":"invite","resourceId":channel,"expectedRevision":"1","personId":"bob","permission":"read","includeHistory":true})).unwrap();
    operation(
        &reader,
        json!({"operationId":"accept_main","kind":"accept","invitationId":invited["invitationId"]}),
    )
    .unwrap();
    operation(&owner,json!({"operationId":"approve_main","kind":"approve","resourceId":channel,"expectedRevision":"2","invitationId":invited["invitationId"]})).unwrap();
    let receiver_cat = catalog(&reader).unwrap();
    assert_eq!(
        resource(&receiver_cat, &channel)["name"],
        "Synthetic collaboration"
    );
    assert_eq!(
        resource(&catalog(&sibling).unwrap(), &channel)["keyState"],
        "ready"
    );
    let before = runtime::snapshot(&reader).unwrap();
    assert_eq!(
        runtime::historical_text(&reader, &channel, &publication).unwrap(),
        "synthetic-before-invitation"
    );
    let after = runtime::snapshot(&reader).unwrap();
    assert_eq!(before.receipts.len(), after.receipts.len());
    assert!(runtime::publish_text(&reader, &channel, "synthetic-reader-denied", "test").is_err());
    assert!(
        runtime::snapshot(&owner)
            .unwrap()
            .channels
            .iter()
            .find(|p| p.id == channel)
            .unwrap()
            .send_paused
    );
    runtime::set_flow_paused(&owner, Some(&channel), Some(false), None).unwrap();
    runtime::connect(
        &reader,
        ConnectionInput {
            id: "receive_main".into(),
            channel_id: channel.clone(),
            kind: "general".into(),
            folder_id: None,
            direction: "receive".into(),
            move_reception: false,
        },
    )
    .unwrap();
    runtime::poll_once(&reader).unwrap();
    let fresh = publish(&owner, &channel, "synthetic-live-after-connect");
    runtime::poll_once(&reader).unwrap();
    assert!(runtime::snapshot(&reader)
        .unwrap()
        .receipts
        .iter()
        .any(|r| r["publicationId"] == fresh));
    let pending_copy = runtime::prepare_historical_copy(&reader, &channel, &fresh).unwrap();
    operation(&owner,json!({"operationId":"revoke_main","kind":"revoke","resourceId":channel,"expectedRevision":"3","personId":"bob"})).unwrap();
    assert!(runtime::historical_text(&reader, &channel, &fresh).is_err());
    catalog(&reader).unwrap();
    let removed = runtime::snapshot(&reader).unwrap();
    assert!(removed.unavailable_channel_ids.contains(&channel));
    assert!(removed
        .connections
        .iter()
        .any(|connection| connection.channel_id == channel));
    assert!(
        runtime::admit_historical_copy(&reader, &pending_copy).is_err(),
        "access revoked after fetch cannot reach the native writer"
    );
    let p = runtime::snapshot(&reader)
        .unwrap()
        .channels
        .into_iter()
        .find(|p| p.id == channel)
        .unwrap();
    assert!(!p.receive_enabled && !p.can_publish);
    operation(&owner,json!({"operationId":"rotate_main","kind":"rotate","resourceId":channel,"expectedRevision":"4"})).unwrap();
    runtime::set_flow_paused(&owner, Some(&channel), Some(false), None).unwrap();
    let later = publish(&owner, &channel, "synthetic-new-epoch");
    assert!(!later.is_empty());
    assert_eq!(
        runtime::historical_text(&owner, &channel, &publication).unwrap(),
        "synthetic-before-invitation"
    );
    // A new person without history receives a fresh epoch; old ciphertext remains
    // unavailable through both paginated and direct lookup. A writer's historical
    // signing key survives their later revocation without restoring live grants.
    let second=operation(&owner,json!({"operationId":"create_nohistory","kind":"create","name":"Synthetic without prior history"})).unwrap();
    let second_id = second["resource"]["id"].as_str().unwrap().to_owned();
    let prior = publish(&owner, &second_id, "synthetic-private-before-sharing");
    let invite=operation(&owner,json!({"operationId":"invite_nohistory","kind":"invite","resourceId":second_id,"expectedRevision":"1","personId":"bob","permission":"write","includeHistory":false})).unwrap();
    operation(&reader,json!({"operationId":"accept_nohistory","kind":"accept","invitationId":invite["invitationId"]})).unwrap();
    operation(&owner,json!({"operationId":"approve_nohistory","kind":"approve","resourceId":second_id,"expectedRevision":"2","invitationId":invite["invitationId"]})).unwrap();
    catalog(&reader).unwrap();
    assert!(runtime::historical_text(&reader, &second_id, &prior).is_err());
    assert!(
        runtime::history_page(&reader, &second_id, None).unwrap()["entries"]
            .as_array()
            .unwrap()
            .is_empty()
    );
    let authored = publish(&reader, &second_id, "synthetic-by-writer-later-revoked");
    operation(&owner,json!({"operationId":"revoke_writer","kind":"revoke","resourceId":second_id,"expectedRevision":"3","personId":"bob"})).unwrap();
    assert_eq!(
        runtime::historical_text(&owner, &second_id, &authored).unwrap(),
        "synthetic-by-writer-later-revoked"
    );
    catalog(&owner).unwrap();
}
