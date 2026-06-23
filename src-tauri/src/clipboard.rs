use crate::storage::{CaptureContext, CaptureFormatContext};
use clipboard_rs::{
    Clipboard, ClipboardContext, ClipboardHandler, ClipboardWatcher, ClipboardWatcherContext,
};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{
    collections::VecDeque,
    error::Error,
    sync::{Arc, Mutex},
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Emitter, Runtime};

const COALESCE_WINDOW: Duration = Duration::from_millis(150);
const SELF_WRITE_SUPPRESSION_WINDOW: Duration = Duration::from_millis(1500);
const MAX_CAPTURE_EVENTS: usize = 80;
const MAX_TEXT_PREVIEW_CHARS: usize = 700;
const HISTORY_CHANGED_EVENT: &str = "copicu://history/changed";
const CLIPBOARD_RETRY_DELAYS: [Duration; 4] = [
    Duration::from_millis(8),
    Duration::from_millis(16),
    Duration::from_millis(32),
    Duration::from_millis(64),
];

#[cfg(debug_assertions)]
fn dev_log(args: std::fmt::Arguments<'_>) {
    eprintln!("{args}");
}

#[cfg(not(debug_assertions))]
fn dev_log(_args: std::fmt::Arguments<'_>) {}

#[cfg(not(test))]
fn persistent_log(event: &str, detail: impl AsRef<str>) {
    crate::diag_log(event, detail);
}

#[cfg(test)]
fn persistent_log(_event: &str, _detail: impl AsRef<str>) {}

fn elapsed_ms(started_at: Instant) -> u128 {
    started_at.elapsed().as_millis()
}

#[derive(Clone, Default, Serialize)]
pub struct CaptureStats {
    captured_count: u64,
    captured_image_count: u64,
    ignored_duplicate_count: u64,
    ignored_empty_count: u64,
    ignored_image_with_text_count: u64,
    self_write_suppressed_count: u64,
    read_error_count: u64,
    event_count: u64,
}

#[derive(Clone, Default, Serialize)]
pub struct CaptureSnapshot {
    stats: CaptureStats,
    events: Vec<CaptureEvent>,
}

#[derive(Clone, Serialize)]
pub struct CaptureEvent {
    index: u64,
    at_unix_ms: u128,
    outcome: CaptureOutcome,
    has_probe: bool,
    probe_error: Option<String>,
    probe: Option<crate::clipboard_probe::ClipboardProbe>,
    text_preview: Option<String>,
    text_char_count: Option<usize>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum CaptureOutcome {
    CapturedText,
    CapturedImage,
    IgnoredDuplicateOrCoalesced,
    IgnoredEmpty,
    SelfWriteSuppressed,
    ReadError,
}

#[derive(Default)]
struct ClipboardCaptureState {
    last_hash: Option<String>,
    last_change_at: Option<Instant>,
    captured_count: u64,
    captured_image_count: u64,
    ignored_duplicate_count: u64,
    ignored_empty_count: u64,
    ignored_image_with_text_count: u64,
    self_write_suppressed_count: u64,
    read_error_count: u64,
    event_count: u64,
    events: VecDeque<CaptureEvent>,
}

pub struct ClipboardCapture {
    state: Arc<Mutex<ClipboardCaptureState>>,
}

#[derive(Clone, Default)]
pub struct SelfWriteSuppression {
    pending: Arc<Mutex<Option<PendingSelfWrite>>>,
}

struct PendingSelfWrite {
    normalized_hash: String,
    expires_at: Instant,
}

struct TextClipboardHandler<R: Runtime> {
    app: AppHandle<R>,
    clipboard: ClipboardContext,
    state: Arc<Mutex<ClipboardCaptureState>>,
    suppression: SelfWriteSuppression,
    storage: crate::storage::AppStorage,
    previous_window: crate::window_focus::PreviousWindow,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct HistoryChangedEvent {
    item_id: i64,
    content_kind: &'static str,
}

impl<R: Runtime> TextClipboardHandler<R> {
    fn new(
        app: AppHandle<R>,
        state: Arc<Mutex<ClipboardCaptureState>>,
        suppression: SelfWriteSuppression,
        storage: crate::storage::AppStorage,
        previous_window: crate::window_focus::PreviousWindow,
    ) -> clipboard_rs::Result<Self> {
        Ok(Self {
            app,
            clipboard: ClipboardContext::new()?,
            state,
            suppression,
            storage,
            previous_window,
        })
    }
}

impl<R: Runtime> ClipboardHandler for TextClipboardHandler<R> {
    fn on_clipboard_change(&mut self) {
        let started_at = Instant::now();
        let probe_result = crate::clipboard_probe::probe_clipboard();
        let has_image_without_text = probe_result
            .as_ref()
            .is_ok_and(|probe| probe.has_image && !probe.has_text);
        let has_image_with_text = probe_result
            .as_ref()
            .is_ok_and(|probe| probe.has_image && probe.has_text);
        persistent_log(
            "clipboard.event.start",
            format!(
                "has_image_without_text={has_image_without_text} has_image_with_text={has_image_with_text} probe_ok={}",
                probe_result.is_ok()
            ),
        );

        if has_image_without_text {
            self.capture_image(probe_result, started_at);
            return;
        }

        let text = match get_text_with_retry(&mut self.clipboard) {
            Ok(text) => text,
            Err(error) => {
                record_event(&self.state, CaptureOutcome::ReadError, probe_result, None);
                persistent_log(
                    "clipboard.event.end",
                    format!(
                        "outcome=read_error kind=text duration_ms={} error={error}",
                        elapsed_ms(started_at)
                    ),
                );
                dev_log(format_args!("clipboard read skipped: {error}"));
                return;
            }
        };

        let normalized = normalize_text(&text);
        if normalized.is_empty() {
            record_event(
                &self.state,
                CaptureOutcome::IgnoredEmpty,
                probe_result,
                None,
            );
            persistent_log(
                "clipboard.event.end",
                format!(
                    "outcome=ignored_empty kind=text duration_ms={}",
                    elapsed_ms(started_at)
                ),
            );
            dev_log(format_args!("clipboard text ignored: empty"));
            return;
        }

        let text_char_count = normalized.chars().count();
        let preview = TextPreview {
            text: preview_text(&normalized),
            char_count: text_char_count,
        };
        let hash = hash_text(&normalized);
        if self.suppression.consume_if_matches(&hash) {
            record_event(
                &self.state,
                CaptureOutcome::SelfWriteSuppressed,
                probe_result,
                Some(preview),
            );
            persistent_log(
                "clipboard.event.end",
                format!(
                    "outcome=self_write_suppressed kind=text chars={text_char_count} duration_ms={}",
                    elapsed_ms(started_at)
                ),
            );
            dev_log(format_args!("clipboard text ignored: self_write"));
            return;
        }

        if has_image_with_text {
            note_image_with_text_skipped(&self.state);
            dev_log(format_args!("clipboard image ignored: text_available"));
        }

        let outcome = record_candidate(
            &self.state,
            hash.clone(),
            probe_result.clone(),
            Some(preview),
            CaptureOutcome::CapturedText,
        );
        match outcome {
            CaptureOutcome::CapturedText => {
                let capture_context = capture_context_from_probe("clipboard", &probe_result);
                match self.storage.insert_text_with_context(
                    &normalized,
                    &hash,
                    Some(capture_context),
                ) {
                    Ok(item_id) => {
                        self.apply_builtin_enrichment(item_id, &normalized);
                        self.emit_history_changed(item_id, "text");
                        self.run_clipboard_change_actions(item_id);
                        persistent_log(
                            "clipboard.event.end",
                            format!(
                                "outcome=captured_text item_id={item_id} chars={text_char_count} image_with_text_skipped={has_image_with_text} duration_ms={}",
                                elapsed_ms(started_at)
                            ),
                        );
                    }
                    Err(error) => {
                        persistent_log(
                            "clipboard.event.end",
                            format!(
                                "outcome=storage_error kind=text chars={text_char_count} duration_ms={} error={error}",
                                elapsed_ms(started_at)
                            ),
                        );
                        eprintln!("clipboard storage insert failed: {error}");
                    }
                }
                dev_log(format_args!("clipboard text captured"));
            }
            CaptureOutcome::IgnoredDuplicateOrCoalesced => {
                persistent_log(
                    "clipboard.event.end",
                    format!(
                        "outcome=ignored_duplicate_or_coalesced kind=text chars={text_char_count} duration_ms={}",
                        elapsed_ms(started_at)
                    ),
                );
                dev_log(format_args!(
                    "clipboard text ignored: duplicate_or_coalesced"
                ));
            }
            CaptureOutcome::IgnoredEmpty
            | CaptureOutcome::CapturedImage
            | CaptureOutcome::SelfWriteSuppressed
            | CaptureOutcome::ReadError => {}
        };
    }
}

impl<R: Runtime> TextClipboardHandler<R> {
    fn capture_image(
        &self,
        probe_result: Result<crate::clipboard_probe::ClipboardProbe, String>,
        started_at: Instant,
    ) {
        let image = match crate::image_capture::read_clipboard_image() {
            Ok(image) => image,
            Err(error) => {
                record_event(&self.state, CaptureOutcome::ReadError, probe_result, None);
                persistent_log(
                    "clipboard.event.end",
                    format!(
                        "outcome=read_error kind=image duration_ms={} error={error}",
                        elapsed_ms(started_at)
                    ),
                );
                dev_log(format_args!("clipboard image read skipped: {error}"));
                return;
            }
        };

        if self.suppression.consume_if_matches(&image.normalized_hash) {
            record_event(
                &self.state,
                CaptureOutcome::SelfWriteSuppressed,
                probe_result,
                None,
            );
            persistent_log(
                "clipboard.event.end",
                format!(
                    "outcome=self_write_suppressed kind=image bytes={} duration_ms={}",
                    image.png_bytes.len(),
                    elapsed_ms(started_at)
                ),
            );
            dev_log(format_args!("clipboard image ignored: self_write"));
            return;
        }

        let outcome = record_candidate(
            &self.state,
            image.normalized_hash.clone(),
            probe_result.clone(),
            None,
            CaptureOutcome::CapturedImage,
        );
        match outcome {
            CaptureOutcome::CapturedImage => {
                let capture_context = capture_context_from_probe("clipboard", &probe_result);
                match self
                    .storage
                    .insert_image_with_context(&image, Some(capture_context))
                {
                    Ok(item_id) => {
                        self.emit_history_changed(item_id, "image");
                        self.run_clipboard_change_actions(item_id);
                        persistent_log(
                            "clipboard.event.end",
                            format!(
                                "outcome=captured_image item_id={item_id} width={} height={} bytes={} duration_ms={}",
                                image.width,
                                image.height,
                                image.png_bytes.len(),
                                elapsed_ms(started_at)
                            ),
                        );
                    }
                    Err(error) => {
                        persistent_log(
                            "clipboard.event.end",
                            format!(
                                "outcome=storage_error kind=image bytes={} duration_ms={} error={error}",
                                image.png_bytes.len(),
                                elapsed_ms(started_at)
                            ),
                        );
                        eprintln!("clipboard image storage insert failed: {error}");
                    }
                }
                dev_log(format_args!(
                    "clipboard image captured: {}x{} {} bytes",
                    image.width,
                    image.height,
                    image.png_bytes.len()
                ));
            }
            CaptureOutcome::IgnoredDuplicateOrCoalesced => {
                persistent_log(
                    "clipboard.event.end",
                    format!(
                        "outcome=ignored_duplicate_or_coalesced kind=image bytes={} duration_ms={}",
                        image.png_bytes.len(),
                        elapsed_ms(started_at)
                    ),
                );
                dev_log(format_args!(
                    "clipboard image ignored: duplicate_or_coalesced"
                ));
            }
            CaptureOutcome::CapturedText
            | CaptureOutcome::IgnoredEmpty
            | CaptureOutcome::SelfWriteSuppressed
            | CaptureOutcome::ReadError => {}
        };
    }

    fn run_clipboard_change_actions(&self, item_id: i64) {
        #[cfg(not(test))]
        crate::actions::run_clipboard_change_actions(
            &self.app,
            &self.storage,
            &self.suppression,
            &self.previous_window,
            item_id,
        );
        #[cfg(test)]
        let _ = item_id;
    }

    fn apply_builtin_enrichment(&self, item_id: i64, text: &str) {
        let settings = match self.storage.get_settings() {
            Ok(settings) => settings.enrichment,
            Err(error) => {
                eprintln!("clipboard builtin enrichment settings load failed: {error}");
                return;
            }
        };
        if !settings.enabled
            || settings.apply_mode != crate::enrichment::EnrichmentApplyMode::AutoApply
        {
            return;
        }

        let tags = crate::enrichment::detect_text_builtin_tags(text, &settings);
        if tags.is_empty() {
            return;
        }

        match self.storage.apply_builtin_enrichment(item_id, &tags) {
            Ok(applied) if !applied.is_empty() => {
                dev_log(format_args!(
                    "clipboard builtin enrichment applied: item_id={item_id} tags={}",
                    applied.join(",")
                ));
            }
            Ok(_) => {}
            Err(error) => eprintln!("clipboard builtin enrichment failed: {error}"),
        }
    }

    fn emit_history_changed(&self, item_id: i64, content_kind: &'static str) {
        if let Err(error) = self.app.emit(
            HISTORY_CHANGED_EVENT,
            HistoryChangedEvent {
                item_id,
                content_kind,
            },
        ) {
            eprintln!("history changed emit failed: {error}");
        }
    }
}

impl ClipboardCapture {
    pub fn stats(&self) -> CaptureStats {
        let state = self.state.lock().expect("clipboard state mutex poisoned");

        capture_stats(&state)
    }

    pub fn snapshot(&self) -> CaptureSnapshot {
        let state = self.state.lock().expect("clipboard state mutex poisoned");

        CaptureSnapshot {
            stats: capture_stats(&state),
            events: state.events.iter().cloned().rev().collect(),
        }
    }
}

impl SelfWriteSuppression {
    pub fn suppress_hash(&self, normalized_hash: String) {
        let mut pending = self
            .pending
            .lock()
            .expect("self-write suppression mutex poisoned");

        *pending = Some(PendingSelfWrite {
            normalized_hash,
            expires_at: Instant::now() + SELF_WRITE_SUPPRESSION_WINDOW,
        });
    }

    pub fn clear_if_hash(&self, normalized_hash: &str) {
        let mut pending = self
            .pending
            .lock()
            .expect("self-write suppression mutex poisoned");

        if pending
            .as_ref()
            .is_some_and(|pending| pending.normalized_hash == normalized_hash)
        {
            *pending = None;
        }
    }

    fn consume_if_matches(&self, normalized_hash: &str) -> bool {
        let mut pending = self
            .pending
            .lock()
            .expect("self-write suppression mutex poisoned");

        let Some(current) = pending.as_ref() else {
            return false;
        };

        if Instant::now() > current.expires_at {
            *pending = None;
            return false;
        }

        if current.normalized_hash != normalized_hash {
            return false;
        }

        *pending = None;
        true
    }
}

pub fn spawn_text_watcher<R: Runtime>(
    app: AppHandle<R>,
    storage: crate::storage::AppStorage,
    suppression: SelfWriteSuppression,
    previous_window: crate::window_focus::PreviousWindow,
) -> clipboard_rs::Result<ClipboardCapture> {
    let state = Arc::new(Mutex::new(ClipboardCaptureState::default()));
    let handler = TextClipboardHandler::new(
        app,
        Arc::clone(&state),
        suppression,
        storage,
        previous_window,
    )?;
    let mut watcher = ClipboardWatcherContext::<TextClipboardHandler<R>>::new()?;
    watcher.add_handler(handler);
    let capture = ClipboardCapture {
        state: Arc::clone(&state),
    };

    thread::Builder::new()
        .name("copicu-clipboard-watch".to_string())
        .spawn(move || {
            dev_log(format_args!("clipboard watcher started"));
            watcher.start_watch();
        })
        .map_err(|error| -> Box<dyn Error + Send + Sync> { Box::new(error) })?;

    Ok(capture)
}

fn normalize_text(text: &str) -> String {
    text.replace("\r\n", "\n").trim().to_string()
}

fn hash_text(text: &str) -> String {
    let digest = Sha256::digest(text.as_bytes());
    digest.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn get_text_with_retry(clipboard: &mut ClipboardContext) -> clipboard_rs::Result<String> {
    retry_clipboard_operation(|| clipboard.get_text(), &CLIPBOARD_RETRY_DELAYS)
}

fn retry_clipboard_operation<T, E, F>(mut operation: F, delays: &[Duration]) -> Result<T, E>
where
    F: FnMut() -> Result<T, E>,
{
    for delay in delays {
        match operation() {
            Ok(value) => return Ok(value),
            Err(_) => thread::sleep(*delay),
        }
    }

    operation()
}

fn capture_context_from_probe(
    source_kind: &str,
    probe_result: &Result<crate::clipboard_probe::ClipboardProbe, String>,
) -> CaptureContext {
    let foreground = crate::window_focus::foreground_window_snapshot();
    let probe = probe_result.as_ref().ok();
    CaptureContext {
        source_kind: source_kind.to_string(),
        source_app_name: foreground
            .as_ref()
            .and_then(|window| window.process_name.clone()),
        source_app_path: foreground
            .as_ref()
            .and_then(|window| window.process_path.clone()),
        source_process_id: foreground
            .as_ref()
            .and_then(|window| window.process_id.map(i64::from)),
        source_window_id: foreground.as_ref().map(|window| window.window_id as i64),
        source_window_title: foreground.as_ref().and_then(|window| window.title.clone()),
        clipboard_platform: probe.map(|probe| probe.platform.to_string()),
        clipboard_sequence_number: probe.and_then(|probe| probe.sequence_number.map(i64::from)),
        clipboard_format_count: probe.map(|probe| i64::from(probe.format_count)),
        clipboard_formats: probe
            .map(|probe| {
                probe
                    .formats
                    .iter()
                    .map(|format| CaptureFormatContext {
                        id: format.id,
                        name: format.name.clone(),
                        kind: format!("{:?}", format.kind).to_ascii_lowercase(),
                        handle_size_bytes: format.handle_size_bytes.map(|value| value as i64),
                    })
                    .collect()
            })
            .unwrap_or_default(),
    }
}

fn record_candidate(
    state: &Arc<Mutex<ClipboardCaptureState>>,
    hash: String,
    probe_result: Result<crate::clipboard_probe::ClipboardProbe, String>,
    preview: Option<TextPreview>,
    captured_outcome: CaptureOutcome,
) -> CaptureOutcome {
    let mut state = state.lock().expect("clipboard state mutex poisoned");
    let now = Instant::now();
    let duplicate = state.last_hash.as_ref() == Some(&hash);
    let coalesced = state
        .last_change_at
        .is_some_and(|last_change_at| now.duration_since(last_change_at) <= COALESCE_WINDOW);

    if duplicate || coalesced {
        state.ignored_duplicate_count += 1;
        state.last_change_at = Some(now);
        push_event(
            &mut state,
            CaptureOutcome::IgnoredDuplicateOrCoalesced,
            probe_result,
            preview,
        );
        return CaptureOutcome::IgnoredDuplicateOrCoalesced;
    }

    state.last_hash = Some(hash);
    state.last_change_at = Some(now);
    state.captured_count += 1;
    if matches!(captured_outcome, CaptureOutcome::CapturedImage) {
        state.captured_image_count += 1;
    }
    push_event(&mut state, captured_outcome.clone(), probe_result, preview);
    captured_outcome
}

fn record_event(
    state: &Arc<Mutex<ClipboardCaptureState>>,
    outcome: CaptureOutcome,
    probe_result: Result<crate::clipboard_probe::ClipboardProbe, String>,
    preview: Option<TextPreview>,
) {
    let mut state = state.lock().expect("clipboard state mutex poisoned");

    match &outcome {
        CaptureOutcome::IgnoredEmpty => state.ignored_empty_count += 1,
        CaptureOutcome::SelfWriteSuppressed => state.self_write_suppressed_count += 1,
        CaptureOutcome::ReadError => state.read_error_count += 1,
        CaptureOutcome::CapturedText
        | CaptureOutcome::CapturedImage
        | CaptureOutcome::IgnoredDuplicateOrCoalesced => {}
    }

    push_event(&mut state, outcome, probe_result, preview);
}

fn note_image_with_text_skipped(state: &Arc<Mutex<ClipboardCaptureState>>) {
    let mut state = state.lock().expect("clipboard state mutex poisoned");
    state.ignored_image_with_text_count += 1;
}

fn push_event(
    state: &mut ClipboardCaptureState,
    outcome: CaptureOutcome,
    probe_result: Result<crate::clipboard_probe::ClipboardProbe, String>,
    preview: Option<TextPreview>,
) {
    state.event_count += 1;

    let (probe, probe_error) = match probe_result {
        Ok(probe) => (Some(probe), None),
        Err(error) => (None, Some(error)),
    };

    state.events.push_back(CaptureEvent {
        index: state.event_count,
        at_unix_ms: now_unix_ms(),
        outcome,
        has_probe: probe.is_some(),
        probe_error,
        probe,
        text_preview: preview.as_ref().map(|preview| preview.text.clone()),
        text_char_count: preview.map(|preview| preview.char_count),
    });

    while state.events.len() > MAX_CAPTURE_EVENTS {
        state.events.pop_front();
    }
}

struct TextPreview {
    text: String,
    char_count: usize,
}

fn preview_text(text: &str) -> String {
    let mut preview = String::new();
    for character in text.chars().take(MAX_TEXT_PREVIEW_CHARS) {
        preview.push(character);
    }
    preview
}

fn capture_stats(state: &ClipboardCaptureState) -> CaptureStats {
    CaptureStats {
        captured_count: state.captured_count,
        captured_image_count: state.captured_image_count,
        ignored_duplicate_count: state.ignored_duplicate_count,
        ignored_empty_count: state.ignored_empty_count,
        ignored_image_with_text_count: state.ignored_image_with_text_count,
        self_write_suppressed_count: state.self_write_suppressed_count,
        read_error_count: state.read_error_count,
        event_count: state.event_count,
    }
}

fn now_unix_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_text_trims_and_normalizes_newlines() {
        assert_eq!(normalize_text("  one\r\ntwo  "), "one\ntwo");
    }

    #[test]
    fn hash_text_is_stable() {
        assert_eq!(hash_text("same"), hash_text("same"));
        assert_ne!(hash_text("same"), hash_text("other"));
    }

    #[test]
    fn retry_clipboard_operation_retries_until_success() {
        let mut attempts = 0;

        let result = retry_clipboard_operation(
            || {
                attempts += 1;
                if attempts < 3 {
                    Err("locked")
                } else {
                    Ok("ready")
                }
            },
            &[Duration::ZERO, Duration::ZERO],
        );

        assert_eq!(result, Ok("ready"));
        assert_eq!(attempts, 3);
    }

    #[test]
    fn record_candidate_ignores_consecutive_duplicates() {
        let state = Arc::new(Mutex::new(ClipboardCaptureState::default()));
        let first = hash_text("first");

        let empty_probe = || Err("test probe skipped".to_string());

        assert!(matches!(
            record_candidate(
                &state,
                first.clone(),
                empty_probe(),
                None,
                CaptureOutcome::CapturedText
            ),
            CaptureOutcome::CapturedText
        ));
        assert!(matches!(
            record_candidate(
                &state,
                first,
                empty_probe(),
                None,
                CaptureOutcome::CapturedText
            ),
            CaptureOutcome::IgnoredDuplicateOrCoalesced
        ));

        let state = state.lock().expect("clipboard state mutex poisoned");
        assert_eq!(state.captured_count, 1);
        assert_eq!(state.ignored_duplicate_count, 1);
        assert_eq!(state.event_count, 2);
    }

    #[test]
    fn self_write_suppression_consumes_matching_hash_once() {
        let suppression = SelfWriteSuppression::default();
        let hash = hash_text("synthetic");

        suppression.suppress_hash(hash.clone());

        assert!(suppression.consume_if_matches(&hash));
        assert!(!suppression.consume_if_matches(&hash));
    }

    #[test]
    fn self_write_suppression_keeps_different_hash_pending() {
        let suppression = SelfWriteSuppression::default();
        let hash = hash_text("synthetic");

        suppression.suppress_hash(hash.clone());

        assert!(!suppression.consume_if_matches(&hash_text("other")));
        assert!(suppression.consume_if_matches(&hash));
    }
}
