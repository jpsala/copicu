//! Standalone synthetic sender for local visual/native verification. Compiled
//! only with both opt-in sharing and native-fixture features. No product startup.
use crate::{
    shared_clipboard::{config::ConfigureInput, runtime},
    storage::AppStorage,
};
use std::{
    path::{Path, PathBuf},
    time::{Duration, Instant},
};

fn boundary(profile: &Path, bundle: &Path) -> Result<(), String> {
    let workspace = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .ok_or("Missing workspace")?
        .join(".codex-run")
        .canonicalize()
        .map_err(|_| "Missing fixture directory")?;
    let root = bundle
        .parent()
        .ok_or("Invalid synthetic bundle path")?
        .canonicalize()
        .map_err(|_| "Cannot inspect synthetic fixture")?;
    if root.parent() != Some(workspace.as_path())
        || !root
            .file_name()
            .is_some_and(|v| v.to_string_lossy().starts_with("shared-product-"))
        || profile
            .parent()
            .and_then(|p| p.canonicalize().ok())
            .as_deref()
            != Some(root.as_path())
        || !matches!(
            profile.file_name().and_then(|s| s.to_str()),
            Some("sender-profile" | "receiver-profile")
        )
        || bundle.file_name()
            != Some(std::ffi::OsStr::new(
                if profile.file_name() == Some(std::ffi::OsStr::new("sender-profile")) {
                    "sender-enrollment.json"
                } else {
                    "receiver-enrollment.json"
                },
            ))
    {
        return Err("Publisher requires its owned synthetic sender profile and bundle".into());
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        for path in [root.as_path(), bundle, profile] {
            if std::fs::symlink_metadata(path).is_ok_and(|m| m.file_attributes() & 0x400 != 0) {
                return Err("Synthetic fixture cannot use reparse paths".into());
            }
        }
    }
    if std::fs::read(root.join("synthetic.marker")).map_err(|_| "Missing synthetic marker")?
        != b"Copicu synthetic shared product fixture v1\n"
    {
        return Err("Invalid synthetic marker".into());
    }
    let marker = root.join(format!(
        "{}.marker",
        profile
            .file_name()
            .ok_or("Invalid fixture profile")?
            .to_string_lossy()
    ));
    if std::fs::read(marker).map_err(|_| "Missing owned synthetic profile marker")?
        != b"Copicu synthetic shared product fixture v1\n"
    {
        return Err("Invalid synthetic profile marker".into());
    }
    Ok(())
}
pub fn run() -> Result<(), String> {
    let args = std::env::args().skip(1).collect::<Vec<_>>();
    if args == ["--native-image-roundtrip", "--allow-clipboard-mutation"] {
        return native_image_roundtrip();
    }
    let prepare = args.first().is_some_and(|s| s == "--prepare-profile");
    let read = args
        .first()
        .is_some_and(|s| s == "--read-relay" || s == "--inspect");
    if (!prepare && !read && (args.len() != 4 || args[0] != "--publish"))
        || ((prepare || read) && args.len() != 3)
    {
        return Err(
            "Usage: shared-clipboard-product --publish PROFILE BUNDLE synthetic-text".into(),
        );
    }
    let profile = PathBuf::from(&args[1]);
    let bundle = PathBuf::from(&args[2]);
    boundary(&profile, &bundle)?;
    let storage = AppStorage::open(&profile)?;
    if prepare {
        let mut settings = storage.get_settings()?;
        settings.general.capture_enabled = false;
        settings.general.launch_on_startup = false;
        settings.auto_update.enabled = false;
        settings.ai.enabled = false;
        settings.scripts.folder_path = profile
            .parent()
            .ok_or("Missing fixture root")?
            .join("synthetic-scripts")
            .to_string_lossy()
            .into_owned();
        storage.update_settings(settings)?;
        println!(
            "{}",
            serde_json::json!({"profile":profile,"prepared":true,"captureEnabled":false,"autoUpdateEnabled":false})
        );
        return Ok(());
    }
    if read {
        if args[0] == "--inspect" {
            println!(
                "{}",
                serde_json::to_string(&runtime::snapshot(&storage)?)
                    .map_err(|_| "Cannot serialize fixture status")?
            );
        } else {
            println!(
                "{}",
                serde_json::to_string(&runtime::fixture_read_relay(&storage)?)
                    .map_err(|_| "Cannot serialize synthetic relay results")?
            );
        }
        return Ok(());
    }
    if profile.file_name() != Some(std::ffi::OsStr::new("sender-profile")) {
        return Err("Publishing is restricted to the owned sender profile".into());
    }
    let text = &args[3];
    if !text.starts_with("synthetic-") || text.len() > 16384 {
        return Err("Only explicit synthetic- text is accepted by this fixture".into());
    }
    let preview = runtime::enrollment_preview(&storage, &args[2])?;
    if preview.environment != "synthetic_product_fixture"
        || preview.device_id != "synthetic_owner"
        || !preview.endpoint.starts_with("http://127.0.0.1:")
    {
        return Err("Synthetic publisher requires the local generated identity".into());
    }
    if !runtime::snapshot(&storage)?.configured {
        // Deliberate simulated enrollment for the synthetic publisher only.
        runtime::configure(
            &storage,
            ConfigureInput {
                bundle_path: args[2].clone(),
                confirmed_fingerprint: preview.fingerprint,
            },
        )?;
    }
    runtime::poll_once(&storage)?; // Acquire the signed live lease before sealing.
    let channel = runtime::default_publish_channel(&storage)?;
    let result = runtime::publish_text(&storage, &channel, text, "syntheticNativeFixture")?;
    let publication = result["publicationId"]
        .as_str()
        .ok_or("Missing publication identifier")?;
    let started = Instant::now();
    loop {
        runtime::poll_once(&storage)?;
        let status = runtime::snapshot(&storage)?;
        if let Some(row) = status
            .outbox
            .iter()
            .find(|row| row["publicationId"] == publication)
        {
            if row["state"] == "accepted" {
                println!(
                    "{}",
                    serde_json::json!({"publicationId":publication,"state":"accepted"})
                );
                return Ok(());
            }
            if row["state"] == "rejected" || row["state"] == "expired" {
                return Err("Synthetic publication was rejected".into());
            }
        }
        if started.elapsed() > Duration::from_secs(8) {
            return Err("Synthetic publication remains queued".into());
        }
        std::thread::sleep(Duration::from_millis(100));
    }
}

fn native_image_roundtrip() -> Result<(), String> {
    use crate::{clipboard_content::ClipboardContent, shared_native};
    use clipboard_rs::{Clipboard, ClipboardContext};
    let clipboard = ClipboardContext::new().map_err(|_| "Cannot initialize synthetic clipboard test")?;
    clipboard.set_text("COPICU_SYNTH_NATIVE_IMAGE_START".into()).map_err(|_| "Cannot prepare synthetic clipboard")?;
    let image = crate::image_capture::synthetic_image(64,48);
    let content = ClipboardContent::Image(image.png_bytes);
    let sequence = shared_native::sequence().ok_or("Missing Windows clipboard sequence")?;
    let outcome = shared_native::write_content(&content,sequence);
    if outcome != "applied" { return Err(format!("Synthetic image write did not apply: {outcome}")); }
    let sequence = shared_native::sequence().ok_or("Missing image sequence")?;
    let read = shared_native::snapshot_content(sequence)?;
    if read != content { return Err("Synthetic image pixels or alpha changed in Windows round-trip".into()); }
    if !shared_native::is_remote_write(&content.hash()) { return Err("Synthetic image write lost its provenance".into()); }
    let expired = shared_native::write_content_before(&content,sequence,Some(1),Some(0));
    if expired != "clipboardStale" || shared_native::sequence() != Some(sequence) { return Err("Expired image write mutated Windows".into()); }
    clipboard.set_text("COPICU_SYNTH_NATIVE_IMAGE_END".into()).map_err(|_| "Cannot finish synthetic clipboard test")?;
    if shared_native::write_content(&content,sequence) != "clipboardStale" { return Err("Stale image write was admitted".into()); }
    if shared_native::snapshot(shared_native::sequence().ok_or("Missing final sequence")?)? != "COPICU_SYNTH_NATIVE_IMAGE_END" { return Err("Stale image write overwrote synthetic text".into()); }
    println!("{}", serde_json::json!({"synthetic":true,"imageWrite":true,"pixelAndAlphaRoundTrip":true,"provenance":true,"expiredNoMutation":true,"staleNoMutation":true}));
    Ok(())
}
