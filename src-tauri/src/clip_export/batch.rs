//! One ephemeral, picker-owned export; no persistent jobs or public scripting API.
#[cfg(test)]
#[path = "batch_tests.rs"]
mod tests;
use super::{materialize, result, ItemResult, MAX_EXPORT_BYTES};
use crate::storage::AppStorage;
use serde::Serialize;
use std::{
    fs::{self, File, OpenOptions},
    io::{self, Write},
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicU64, Ordering},
        Mutex,
    },
    time::{SystemTime, UNIX_EPOCH},
};
use zip::{write::SimpleFileOptions, CompressionMethod, ZipWriter};

const MAX_BATCH_BYTES: usize = 512 * 1024 * 1024;
static NEXT: AtomicU64 = AtomicU64::new(1);

#[derive(Default)]
pub struct ExportState(Mutex<Option<Session>>);
struct Session {
    token: String,
    ids: Vec<i64>,
    cursor: usize,
    folder: PathBuf,
    naming: super::naming::Naming,
    zip: Option<ZipWriter<File>>,
    temporary: Option<PathBuf>,
    total_bytes: usize,
    completed: usize,
    poisoned: bool,
}
impl Session {
    fn cleanup(&mut self) -> Result<(), String> {
        drop(self.zip.take());
        if let Some(path) = self.temporary.as_ref() {
            match fs::remove_file(path) {
                Ok(()) => {}
                Err(error) if error.kind() == io::ErrorKind::NotFound => {}
                Err(_) => return Err("The export's own temporary ZIP could not be removed".into()),
            }
        }
        self.temporary = None;
        Ok(())
    }
}
impl Drop for Session {
    fn drop(&mut self) {
        let _ = self.cleanup();
    }
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Finished {
    pub archive: Option<String>,
    pub published: bool,
    pub warning: Option<String>,
}

impl ExportState {
    pub fn begin(
        &self,
        storage: &AppStorage,
        folder: &str,
        ids: Vec<i64>,
        compressed: bool,
        allow_ai: bool,
    ) -> Result<String, String> {
        if ids.is_empty()
            || ids.len() > 10_000
            || ids.iter().any(|id| *id <= 0)
            || ids.iter().collect::<std::collections::HashSet<_>>().len() != ids.len()
        {
            return Err(
                "Choose between 1 and 10,000 distinct clips; no scope fallback is applied".into(),
            );
        }
        let folder = super::destination(folder)?;
        let settings = storage.get_settings()?;
        let token = format!(
            "{}-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map_err(|_| "Invalid clock")?
                .as_nanos(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        );
        let mut session = Session {
            token: token.clone(),
            ids,
            cursor: 0,
            folder: folder.clone(),
            naming: super::naming::Naming::new(&settings, allow_ai),
            zip: None,
            temporary: None,
            total_bytes: 0,
            completed: 0,
            poisoned: false,
        };
        if compressed {
            let temporary = folder.join(format!(".copicu-export-{token}.tmp"));
            let file = OpenOptions::new()
                .write(true)
                .read(true)
                .create_new(true)
                .open(&temporary)
                .map_err(|_| "Cannot create temporary ZIP in destination")?;
            session.temporary = Some(temporary);
            session.zip = Some(ZipWriter::new(file));
        }
        // A new explicit invocation replaces only an unfinished operation owned by
        // this same picker (e.g. after renderer reload), cleaning its own temp.
        let mut state = self.0.lock().map_err(|_| "Export state unavailable")?;
        if let Some(mut old) = state.take() {
            old.cleanup()?;
        }
        *state = Some(session);
        Ok(token)
    }

    pub fn next(&self, storage: &AppStorage, token: &str) -> Result<ItemResult, String> {
        let mut state = self.0.lock().map_err(|_| "Export state unavailable")?;
        let session = state
            .as_mut()
            .filter(|s| s.token == token)
            .ok_or("Export operation expired")?;
        let id = *session
            .ids
            .get(session.cursor)
            .ok_or("All requested clips were processed")?;
        session.cursor += 1;
        let mut file = match materialize(storage, id, session.cursor) {
            Ok(file) => file,
            Err(item) => return Ok(item),
        };
        if file.bytes.len() > MAX_EXPORT_BYTES
            || session.total_bytes.saturating_add(file.bytes.len()) > MAX_BATCH_BYTES
        {
            return Ok(result(
                id,
                "failed",
                "Export exceeds the 32 MiB per item or 512 MiB batch limit",
            ));
        }
        if session.poisoned {
            return Ok(result(
                id,
                "failed",
                "ZIP write failed; package will not be published",
            ));
        }
        let warning = session.naming.apply(&mut file);
        let mut outcome = if let Some(writer) = session.zip.as_mut() {
            let name = format!("{}.{}", file.base, file.extension);
            let options = SimpleFileOptions::default()
                .compression_method(CompressionMethod::Deflated)
                .unix_permissions(0o600);
            if writer.start_file(&name, options).is_err() || writer.write_all(&file.bytes).is_err()
            {
                session.poisoned = true;
                result(
                    id,
                    "failed",
                    "Could not write ZIP entry; package will not be published",
                )
            } else {
                session.completed += 1;
                session.total_bytes += file.bytes.len();
                result(id, "prepared", name)
            }
        } else {
            match super::write_unique(&session.folder, &file.base, file.extension, &file.bytes) {
                Ok(name) => {
                    session.completed += 1;
                    session.total_bytes += file.bytes.len();
                    let mut item = result(id, "saved", name);
                    if storage
                        .remember_export_folder(&session.folder.to_string_lossy())
                        .is_err()
                    {
                        item.warning =
                            Some("File saved, but last destination could not be remembered".into());
                    }
                    item
                }
                Err(error) => result(id, "failed", error),
            }
        };
        outcome.warning = match (outcome.warning, warning) {
            (Some(a), Some(b)) => Some(format!("{a}. {b}")),
            (a, b) => a.or(b),
        };
        Ok(outcome)
    }

    pub fn finish(
        &self,
        storage: &AppStorage,
        token: &str,
        publish: bool,
    ) -> Result<Finished, String> {
        let mut state = self.0.lock().map_err(|_| "Export state unavailable")?;
        if !state.as_ref().is_some_and(|s| s.token == token) {
            return Err("Export operation expired".into());
        }
        let mut session = state.take().ok_or("Export operation expired")?;
        let outcome: Result<Finished, String> = (|| {
            if session.temporary.is_none() {
                return Ok(Finished {
                    archive: None,
                    published: session.completed > 0,
                    warning: None,
                });
            }
            if !publish || session.completed == 0 {
                return Ok(Finished {
                    archive: None,
                    published: false,
                    warning: None,
                });
            }
            if session.cursor != session.ids.len() {
                return Err("Cannot publish ZIP before processing the requested selection".into());
            }
            if session.poisoned {
                return Err("ZIP write failed; no archive was published".into());
            }
            let file = session
                .zip
                .take()
                .ok_or("ZIP unavailable")?
                .finish()
                .map_err(|_| "Could not finalize ZIP; no archive published")?;
            file.sync_all()
                .map_err(|_| "Could not synchronize ZIP; no archive published")?;
            drop(file);
            let temporary = session
                .temporary
                .as_ref()
                .ok_or("ZIP temporary unavailable")?;
            let base = format!(
                "Copicu-clips-{}",
                SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .map_err(|_| "Invalid clock")?
                    .as_millis()
            );
            let name = publish_unique(temporary, &session.folder, &base)?;
            session.temporary = None;
            let warning = storage
                .remember_export_folder(&session.folder.to_string_lossy())
                .err()
                .map(|_| "ZIP saved, but last destination could not be remembered".into());
            Ok(Finished {
                archive: Some(name),
                published: true,
                warning,
            })
        })();
        match (session.cleanup(), outcome) {
            (Err(cleanup), Ok(mut finished)) => {
                finished.warning = Some(match finished.warning {
                    Some(warning) => format!("{warning}. {cleanup}"),
                    None => cleanup,
                });
                Ok(finished)
            }
            (Err(cleanup), Err(error)) => Err(format!("{error}. {cleanup}")),
            (Ok(()), outcome) => outcome,
        }
    }
}

fn publish_unique(temporary: &Path, folder: &Path, base: &str) -> Result<String, String> {
    for suffix in 0..10_000 {
        let name = if suffix == 0 {
            format!("{base}.zip")
        } else {
            format!("{base} ({suffix}).zip")
        };
        let exists = fs::read_dir(folder)
            .map_err(|_| "Cannot inspect ZIP destination")?
            .try_fold(false, |found, entry| {
                entry.map(|e| {
                    found || e.file_name().to_string_lossy().to_lowercase() == name.to_lowercase()
                })
            })
            .map_err(|_| "Cannot inspect ZIP destination")?;
        if exists {
            continue;
        }
        match move_no_replace(temporary, &folder.join(&name)) {
            Ok(()) => return Ok(name),
            Err(error)
                if error.kind() == io::ErrorKind::AlreadyExists
                    || matches!(error.raw_os_error(), Some(80 | 183)) =>
            {
                continue
            }
            Err(_) => return Err("Could not publish ZIP without replacing an existing file".into()),
        }
    }
    Err("Too many ZIP filename collisions".into())
}
fn move_no_replace(source: &Path, target: &Path) -> io::Result<()> {
    #[cfg(windows)]
    {
        use std::os::windows::ffi::OsStrExt;
        use windows::{core::PCWSTR, Win32::Storage::FileSystem::MoveFileW};
        let a: Vec<u16> = source.as_os_str().encode_wide().chain(Some(0)).collect();
        let b: Vec<u16> = target.as_os_str().encode_wide().chain(Some(0)).collect();
        unsafe { MoveFileW(PCWSTR(a.as_ptr()), PCWSTR(b.as_ptr())) }
            // Preserve the captured Win32 error: constructing the windows Error
            // can itself change thread-local GetLastError before this callback.
            .map_err(|error| io::Error::from_raw_os_error(error.code().0 & 0xffff))
    }
    #[cfg(not(windows))]
    {
        fs::hard_link(source, target)?;
        fs::remove_file(source)
    }
}
