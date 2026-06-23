use serde_json::json;
use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
    sync::{Mutex, OnceLock},
    time::{SystemTime, UNIX_EPOCH},
};

const LOG_FILE_NAME: &str = "diagnostics.jsonl";
const PREVIOUS_LOG_FILE_NAME: &str = "diagnostics.previous.jsonl";
const MAX_LOG_BYTES: u64 = 5 * 1024 * 1024;

static LOG_PATH: OnceLock<Mutex<Option<PathBuf>>> = OnceLock::new();

pub fn init(app_data_dir: &Path) {
    let path = app_data_dir.join(LOG_FILE_NAME);
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }

    let state = LOG_PATH.get_or_init(|| Mutex::new(None));
    if let Ok(mut current) = state.lock() {
        *current = Some(path.clone());
    }

    rotate_if_needed(&path);
}

pub fn log_event(event: &str, detail: impl AsRef<str>) {
    let Some(path) = current_path() else {
        return;
    };

    let state = LOG_PATH.get_or_init(|| Mutex::new(None));
    let Ok(_guard) = state.lock() else {
        return;
    };

    rotate_if_needed(&path);

    let now_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default();
    let line = json!({
        "ts_ms": now_ms,
        "pid": std::process::id(),
        "event": event,
        "detail": detail.as_ref(),
    })
    .to_string();

    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(&path) {
        let _ = writeln!(file, "{line}");
    }
}

fn current_path() -> Option<PathBuf> {
    LOG_PATH
        .get()
        .and_then(|state| state.lock().ok().and_then(|path| path.clone()))
}

fn rotate_if_needed(path: &Path) {
    let Ok(metadata) = fs::metadata(path) else {
        return;
    };
    if metadata.len() < MAX_LOG_BYTES {
        return;
    }

    let previous = path.with_file_name(PREVIOUS_LOG_FILE_NAME);
    let _ = fs::remove_file(&previous);
    let _ = fs::rename(path, previous);
}
