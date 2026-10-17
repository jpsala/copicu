//! Local, explicit clip-to-file export. No clipboard writes or public scripting API.
pub mod batch;
mod naming;
use crate::storage::AppStorage;
use serde::Serialize;
use std::{
    fs::{self, OpenOptions},
    io::{self, Write},
    path::{Path, PathBuf},
};
use unicode_normalization::UnicodeNormalization;

pub const MAX_EXPORT_BYTES: usize = 32 * 1024 * 1024;

/// Shared no-replace primitive. Remove only the file created by this call on failure.
pub fn create_new(path: &Path, bytes: &[u8]) -> io::Result<usize> {
    if bytes.len() > MAX_EXPORT_BYTES {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "export exceeds 32 MiB limit",
        ));
    }
    create_new_with(path, |file| {
        file.write_all(bytes).and_then(|_| file.sync_all())
    })?;
    Ok(bytes.len())
}

fn create_new_with(
    path: &Path,
    write: impl FnOnce(&mut fs::File) -> io::Result<()>,
) -> io::Result<()> {
    let mut file = OpenOptions::new().write(true).create_new(true).open(path)?;
    if let Err(error) = write(&mut file) {
        drop(file);
        return match fs::remove_file(path) {
            Ok(()) => Err(error),
            Err(_) => Err(io::Error::new(
                error.kind(),
                "write failed; partial file could not be removed",
            )),
        };
    }
    Ok(())
}

pub fn suggested_folder(default: &str, last: Option<String>) -> Option<String> {
    if default.trim().is_empty() {
        last
    } else {
        Some(default.to_string())
    }
}

pub fn destination(path: &str) -> Result<PathBuf, String> {
    let path = Path::new(path);
    if !path.is_absolute() || !path.is_dir() {
        return Err("Choose an existing, accessible absolute destination folder".into());
    }
    path.canonicalize()
        .map_err(|_| "Destination folder is inaccessible".into())
}

/// Open only an existing directory, never a file, URI, command or shell string.
pub fn open_destination(folder: &str) -> Result<(), String> {
    let resolved = destination(folder)?;
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::ffi::OsStrExt;
        use windows::{
            core::{w, PCWSTR},
            Win32::UI::{Shell::ShellExecuteW, WindowsAndMessaging::SW_SHOWNORMAL},
        };
        // Explorer's shell namespace uses ordinary DOS/UNC paths, not verbatim prefixes.
        let raw = resolved.to_string_lossy();
        let shell_path = if let Some(unc) = raw.strip_prefix(r"\\?\UNC\") {
            format!(r"\\{unc}")
        } else {
            raw.strip_prefix(r"\\?\").unwrap_or(&raw).to_string()
        };
        let path: Vec<u16> = std::ffi::OsStr::new(&shell_path)
            .encode_wide()
            .chain(Some(0))
            .collect();
        let result = unsafe {
            ShellExecuteW(
                None,
                w!("open"),
                PCWSTR(path.as_ptr()),
                PCWSTR::null(),
                PCWSTR::null(),
                SW_SHOWNORMAL,
            )
        };
        if result.0 as isize <= 32 {
            return Err(
                "Files were saved, but Windows could not open the destination folder".into(),
            );
        }
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = resolved;
        Err("Opening the destination folder is supported on Windows only".into())
    }
}

fn basename(title: &str) -> String {
    let mut name: String = title
        .nfc()
        .map(|c| {
            if c.is_control() || "<>:\"/\\|?*".contains(c) {
                '_'
            } else {
                c
            }
        })
        .take(80)
        .collect();
    name = name.trim().trim_matches('.').trim().to_string();
    let stem = name.split('.').next().unwrap_or("").to_uppercase();
    if name.is_empty()
        || matches!(stem.as_str(), "CON" | "PRN" | "AUX" | "NUL" | "CLOCK$")
        || (stem.starts_with("COM") || stem.starts_with("LPT")) && stem.chars().count() == 4
    {
        name = format!("clip_{name}");
    }
    name
}

fn write_unique(
    folder: &Path,
    base: &str,
    extension: &str,
    bytes: &[u8],
) -> Result<String, String> {
    for suffix in 0..10000 {
        let name = if suffix == 0 {
            format!("{base}.{extension}")
        } else {
            format!("{base} ({suffix}).{extension}")
        };
        // Windows-equivalent preflight even when tests run on case-sensitive disks.
        let exists = fs::read_dir(folder)
            .map_err(|_| "Cannot read destination folder")?
            .try_fold(false, |found, entry| {
                entry.map(|e| {
                    found || e.file_name().to_string_lossy().to_lowercase() == name.to_lowercase()
                })
            })
            .map_err(|_| "Cannot inspect destination folder")?;
        if exists {
            continue;
        }
        match create_new(&folder.join(&name), bytes) {
            Ok(_) => return Ok(name),
            Err(e) if e.kind() == io::ErrorKind::AlreadyExists => continue,
            Err(e) => return Err(format!("Cannot save file without overwrite: {e}")),
        }
    }
    Err("Too many filename collisions".into())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ItemResult {
    pub item_id: i64,
    pub status: &'static str,
    pub detail: String,
    pub warning: Option<String>,
}

pub fn export_item(
    storage: &AppStorage,
    id: i64,
    ordinal: usize,
    folder: &str,
) -> Result<ItemResult, String> {
    if id <= 0 || ordinal == 0 {
        return Err("Invalid selection item or ordinal".into());
    }
    let folder_path = destination(folder)?;
    let file = match materialize(storage, id, ordinal) {
        Ok(file) => file,
        Err(result) if result.status == "failed" => return Err(result.detail),
        Err(result) => return Ok(result),
    };
    let name = write_unique(&folder_path, &file.base, file.extension, &file.bytes)?;
    let warning = storage
        .remember_export_folder(folder)
        .err()
        .map(|_| "File saved, but last destination could not be remembered".into());
    Ok(ItemResult {
        item_id: id,
        status: "saved",
        detail: name,
        warning,
    })
}

struct ExportFile {
    bytes: Vec<u8>,
    extension: &'static str,
    base: String,
    ordinal: usize,
}

fn result(id: i64, status: &'static str, detail: impl Into<String>) -> ItemResult {
    ItemResult {
        item_id: id,
        status,
        detail: detail.into(),
        warning: None,
    }
}

fn materialize(storage: &AppStorage, id: i64, ordinal: usize) -> Result<ExportFile, ItemResult> {
    let item = storage
        .get_item(id)
        .map_err(|error| result(id, "failed", error))?;
    let (bytes, extension) = match item.content_kind() {
        "text"
            if item.mime_primary().is_none_or(|mime| {
                mime.split(';')
                    .next()
                    .unwrap_or("")
                    .trim()
                    .eq_ignore_ascii_case("text/plain")
            }) =>
        {
            (item.text().as_bytes().to_vec(), "txt")
        }
        "image" => {
            let bytes = storage
                .read_blob_for_item(&item)
                .map_err(|error| result(id, "failed", error))?;
            // Captures are normalized PNGs. Do not trust the MIME field or blob suffix.
            if crate::image_capture::validate_png(&bytes).is_err() {
                return Err(ItemResult {
                    item_id: id,
                    status: "skipped",
                    detail: "Unsupported or invalid image format (only stored PNG is supported)"
                        .into(),
                    warning: None,
                });
            }
            (bytes, "png")
        }
        _ => {
            return Err(ItemResult {
                item_id: id,
                status: "skipped",
                detail: "Unsupported clip representation; no file written".into(),
                warning: None,
            })
        }
    };
    let fallback = format!("{}-{id}", item.content_kind());
    let base = format!(
        "{ordinal:04}-{}",
        basename(
            item.title()
                .filter(|s| !s.trim().is_empty())
                .unwrap_or(&fallback)
        )
    );
    if bytes.len() > MAX_EXPORT_BYTES {
        return Err(result(id, "failed", "Clip exceeds the 32 MiB export limit"));
    }
    Ok(ExportFile {
        bytes,
        extension,
        base,
        ordinal,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    fn folder() -> PathBuf {
        let path = std::env::temp_dir().join(format!(
            "copicu-export-test-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir(&path).unwrap();
        path
    }
    #[test]
    fn selected_text_image_and_metadata_are_preserved() {
        use crate::storage::{SetHistoryItemsMarkedRequest, UpdateItemMetadataRequest};
        let root = folder();
        let output = root.join("output");
        fs::create_dir(&output).unwrap();
        let storage = AppStorage::open(&root.join("profile")).unwrap();
        let text_id = storage
            .insert_text("synthetic héllo\n", "export-text")
            .unwrap();
        let untouched_id = storage
            .insert_text("not selected", "export-unselected")
            .unwrap();
        storage
            .update_item_metadata(UpdateItemMetadataRequest {
                id: text_id,
                title: Some("../CON:*".into()),
                notes: Some("keep notes".into()),
                tags: vec![],
            })
            .unwrap();
        storage
            .set_items_marked(SetHistoryItemsMarkedRequest {
                ids: vec![text_id],
                marked: true,
            })
            .unwrap();
        let image = crate::image_capture::synthetic_image(2, 3);
        let image_id = storage.insert_image(&image).unwrap();
        let before = serde_json::to_value(storage.get_item(text_id).unwrap()).unwrap();
        let image_before = serde_json::to_value(storage.get_item(image_id).unwrap()).unwrap();
        let text_result = export_item(&storage, text_id, 1, output.to_str().unwrap()).unwrap();
        let image_result = export_item(&storage, image_id, 2, output.to_str().unwrap()).unwrap();
        assert_eq!(text_result.status, "saved");
        assert_eq!(image_result.status, "saved");
        assert!(text_result.detail.starts_with("0001-"));
        assert!(image_result.detail.starts_with("0002-"));
        assert!(image_result.detail.ends_with(".png"));
        assert_eq!(
            fs::read(output.join(text_result.detail)).unwrap(),
            "synthetic héllo\n".as_bytes()
        );
        assert_eq!(
            fs::read(output.join(image_result.detail)).unwrap(),
            image.png_bytes
        );
        assert_eq!(fs::read_dir(&output).unwrap().count(), 2);
        assert_eq!(
            before,
            serde_json::to_value(storage.get_item(text_id).unwrap()).unwrap()
        );
        assert_eq!(
            image_before,
            serde_json::to_value(storage.get_item(image_id).unwrap()).unwrap()
        );
        assert_eq!(
            storage.get_item(untouched_id).unwrap().text(),
            "not selected"
        );
        assert_eq!(
            storage.last_export_folder().unwrap().as_deref(),
            output.to_str()
        );
        drop(storage);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn omitted_deleted_and_failed_items_do_not_remember_destination() {
        use crate::storage::UpdateHistoryItemRequest;
        let root = folder();
        let output = root.join("output");
        fs::create_dir(&output).unwrap();
        let storage = AppStorage::open(&root.join("profile")).unwrap();
        let id = storage
            .insert_text("<b>synthetic rich text</b>", "export-rich")
            .unwrap();
        storage
            .update_item(UpdateHistoryItemRequest {
                id,
                text: "<b>synthetic rich text</b>".into(),
                title: None,
                notes: None,
                tags: None,
                mime_primary: Some("text/html".into()),
                marked: None,
            })
            .unwrap();
        let omitted = export_item(&storage, id, 1, output.to_str().unwrap()).unwrap();
        assert_eq!(omitted.status, "skipped");
        assert!(storage.last_export_folder().unwrap().is_none());
        storage.delete_item(id).unwrap();
        assert!(export_item(&storage, id, 1, output.to_str().unwrap()).is_err());
        assert!(export_item(&storage, id, 1, root.join("missing").to_str().unwrap()).is_err());
        assert!(storage.last_export_folder().unwrap().is_none());
        assert_eq!(fs::read_dir(&output).unwrap().count(), 0);
        drop(storage);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn default_and_last_destination_persist_independently() {
        let root = folder();
        let profile = root.join("profile");
        let storage = AppStorage::open(&profile).unwrap();
        let mut settings = storage.get_settings().unwrap();
        let mut legacy = serde_json::to_value(&settings).unwrap();
        legacy.as_object_mut().unwrap().remove("export");
        assert_eq!(
            serde_json::from_value::<crate::storage::AppSettings>(legacy)
                .unwrap()
                .export
                .default_folder,
            ""
        );
        settings.scripts.folder_path = root.join("scripts").to_string_lossy().into();
        settings.export.default_folder = root.join("default").to_string_lossy().into();
        settings.export.open_destination_after_save = true;
        settings.export.ai_names = true;
        settings.export.naming_model = "synthetic-model".into();
        storage.update_settings(settings.clone()).unwrap();
        storage
            .remember_export_folder(root.join("last").to_str().unwrap())
            .unwrap();
        // A stale Settings save must not restore or erase last destination state.
        storage.update_settings(settings.clone()).unwrap();
        drop(storage);
        let reopened = AppStorage::open(&profile).unwrap();
        assert_eq!(reopened.get_settings().unwrap().export, settings.export);
        assert_eq!(
            reopened.last_export_folder().unwrap().as_deref(),
            root.join("last").to_str()
        );
        drop(reopened);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn destination_precedence_is_default_then_last_then_native() {
        assert_eq!(
            suggested_folder("configured", Some("last".into())).as_deref(),
            Some("configured")
        );
        assert_eq!(
            suggested_folder("", Some("last".into())).as_deref(),
            Some("last")
        );
        assert_eq!(suggested_folder(" ", None), None);
    }

    #[test]
    fn failed_write_removes_only_its_own_partial_file() {
        let dir = folder();
        let target = dir.join("partial.txt");
        fs::write(dir.join("existing.txt"), b"keep").unwrap();
        assert!(create_new_with(&target, |file| {
            file.write_all(b"partial bytes")?;
            Err(io::Error::new(
                io::ErrorKind::WriteZero,
                "synthetic disk failure",
            ))
        })
        .is_err());
        assert!(!target.exists());
        assert_eq!(fs::read(dir.join("existing.txt")).unwrap(), b"keep");
        assert!(create_new(&target, &vec![0; MAX_EXPORT_BYTES + 1]).is_err());
        assert!(!target.exists());
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn concurrent_exports_do_not_replace_each_other() {
        let dir = folder();
        let threads: Vec<_> = [b"first".to_vec(), b"second".to_vec()]
            .into_iter()
            .map(|bytes| {
                let dir = dir.clone();
                std::thread::spawn(move || {
                    let name = write_unique(&dir, "0001-race", "txt", &bytes).unwrap();
                    (name, bytes)
                })
            })
            .collect();
        let written: Vec<_> = threads
            .into_iter()
            .map(|thread| thread.join().unwrap())
            .collect();
        assert_ne!(written[0].0, written[1].0);
        for (name, bytes) in written {
            assert_eq!(fs::read(dir.join(name)).unwrap(), bytes);
        }
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn unsupported_image_bytes_are_not_written_as_png() {
        let root = folder();
        let output = root.join("output");
        fs::create_dir(&output).unwrap();
        let storage = AppStorage::open(&root.join("profile")).unwrap();
        let image = crate::image_capture::CapturedImage {
            width: 1,
            height: 1,
            png_bytes: b"not a PNG".to_vec(),
            thumbnail_png_bytes: b"synthetic thumbnail".to_vec(),
            normalized_hash: "invalid-export-image".into(),
        };
        let id = storage.insert_image(&image).unwrap();
        assert_eq!(
            export_item(&storage, id, 1, output.to_str().unwrap())
                .unwrap()
                .status,
            "skipped"
        );
        assert_eq!(fs::read_dir(&output).unwrap().count(), 0);
        assert!(storage.last_export_folder().unwrap().is_none());
        drop(storage);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn safe_names() {
        for title in [
            "../bad\\path:*. ",
            "CON",
            "NUL.txt",
            "LPT1",
            "",
            "..",
            "a\nfile",
        ] {
            let name = basename(title);
            assert!(!name.is_empty());
            assert!(!name.contains(['/', '\\', ':', '*', '\n']));
            assert!(!name.ends_with(['.', ' ']));
        }
        assert_eq!(basename("Cafe\u{301}"), "Café");
        assert!(basename(&"x".repeat(500)).len() <= 80);
    }
    #[test]
    fn bytes_collisions_and_no_replace() {
        let dir = folder();
        fs::write(dir.join("0001-HELLO.TXT"), b"original").unwrap();
        let name = write_unique(&dir, "0001-hello", "txt", "héllo\n".as_bytes()).unwrap();
        assert_eq!(name, "0001-hello (1).txt");
        assert_eq!(fs::read(dir.join(name)).unwrap(), "héllo\n".as_bytes());
        assert!(create_new(&dir.join("0001-HELLO.TXT"), b"changed").is_err());
        assert_eq!(fs::read(dir.join("0001-HELLO.TXT")).unwrap(), b"original");
        fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn invalid_destination_and_failed_creation() {
        assert!(destination("relative/path").is_err());
        assert!(open_destination("relative/path").is_err());
        let dir = folder();
        assert!(destination(dir.join("missing").to_str().unwrap()).is_err());
        assert!(create_new(&dir, b"data").is_err());
        assert_eq!(fs::read_dir(&dir).unwrap().count(), 0);
        fs::remove_dir_all(dir).unwrap();
    }
}
