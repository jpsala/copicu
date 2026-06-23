#![cfg_attr(test, allow(dead_code))]

mod actions;
pub mod ai_planner;
mod clipboard;
mod clipboard_probe;
mod enrichment;
mod host;
mod hotkeys;
mod image_capture;
mod markdown_output;
mod script_editor;
pub mod storage;
mod surface_registry;
mod ui_host;
mod window_focus;
#[cfg(not(test))]
mod window_state;

#[cfg(not(test))]
use std::{
    collections::HashMap,
    path::Path,
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        mpsc, Arc, Mutex,
    },
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
#[cfg(not(test))]
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager, PhysicalPosition, PhysicalSize, State, WebviewUrl, WebviewWindowBuilder,
    WindowEvent,
};
#[cfg(not(test))]
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};
#[cfg(not(test))]
use tauri_plugin_clipboard_manager::ClipboardExt;
#[cfg(not(test))]
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

#[cfg(not(test))]
const MAIN_WINDOW_LABEL: &str = surface_registry::MAIN;
#[cfg(not(test))]
const NOTIFICATIONS_WINDOW_LABEL: &str = surface_registry::NOTIFICATIONS;
#[cfg(not(test))]
const UI_HOST_WINDOW_LABEL: &str = ui_host::UI_HOST_WINDOW_LABEL;
#[cfg(not(test))]
const SETTINGS_WINDOW_LABEL: &str = surface_registry::SETTINGS;
#[cfg(not(test))]
const AI_OUTPUT_WINDOW_LABEL: &str = surface_registry::AI_OUTPUT;
#[cfg(not(test))]
const METADATA_WINDOW_LABEL: &str = surface_registry::METADATA;
#[cfg(not(test))]
const WHICHKEY_WINDOW_LABEL: &str = surface_registry::WHICHKEY;
const NOTIFICATION_TOAST_EVENT: &str = "copicu://toast";
#[cfg(not(test))]
const AI_OUTPUT_OPEN_EVENT: &str = "copicu://ai-output/open";
#[cfg(not(test))]
const COMPOUND_HOTKEY_PENDING_EVENT: &str = "copicu://hotkeys/compound-pending";
#[cfg(not(test))]
const PICKER_FILTER_EVENT: &str = "copicu://picker/filter";
#[cfg(not(test))]
const SETTINGS_FOCUS_SECTION_EVENT: &str = "copicu://settings/focus-section";
const PICKER_PIN_STATE_EVENT: &str = "copicu://picker/pin-state";
#[cfg(not(test))]
const HISTORY_CHANGED_EVENT: &str = "copicu://history/changed";
#[cfg(not(test))]
const METADATA_OPEN_EVENT: &str = "copicu://metadata/open";
#[cfg(not(test))]
const NOTIFICATIONS_WINDOW_WIDTH: u32 = 340;
#[cfg(not(test))]
const NOTIFICATIONS_WINDOW_HEIGHT: u32 = 430;
#[cfg(not(test))]
const NOTIFICATIONS_WINDOW_MARGIN: i32 = 10;
#[cfg(not(test))]
const TRAY_TOGGLE_ID: &str = "toggle";
#[cfg(not(test))]
const TRAY_SETTINGS_ID: &str = "settings";
#[cfg(not(test))]
const TRAY_EDIT_SCRIPTS_ID: &str = "edit-scripts";
#[cfg(not(test))]
const TRAY_QUIT_ID: &str = "quit";
#[cfg(not(test))]
const PICKER_SHORTCUT_LABEL: &str = "Ctrl+Shift+,";
#[cfg(not(test))]
const HIDE_ON_FOCUS_LOST_DELAY: Duration = Duration::from_millis(320);
#[cfg(not(test))]
const STARTUP_HIDE_ENFORCE_INTERVAL: Duration = Duration::from_millis(100);
#[cfg(not(test))]
const STARTUP_HIDE_ENFORCE_ATTEMPTS: usize = 24;
#[cfg(not(test))]
const NATIVE_WINDOW_TASK_DELAY: Duration = Duration::from_millis(90);
#[cfg(not(test))]
const METADATA_PREWARM_DELAY: Duration = Duration::from_millis(350);
#[cfg(not(test))]
const SCRIPT_ACTION_REFRESH_INTERVAL: Duration = Duration::from_millis(1500);
#[cfg(not(test))]
const COMPOUND_HOTKEY_STEP_TIMEOUT: Duration = Duration::from_millis(10_000);
#[cfg(not(test))]
const ENABLE_COMPOUND_GLOBAL_SHORTCUTS: bool = true;
#[cfg(not(test))]
const ENABLE_COMPOUND_TEMPORARY_NEXT_STEPS: bool = false;

#[cfg(not(test))]
#[derive(Clone, Default)]
struct PickerFocusPolicy {
    generation: Arc<AtomicU64>,
}

#[cfg(not(test))]
#[derive(Clone, Default)]
pub(crate) struct PickerSessionController {
    reset_pending: Arc<AtomicBool>,
    generation: Arc<AtomicU64>,
}

#[cfg(not(test))]
#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct PickerSessionSnapshot {
    reset: bool,
    generation: u64,
}

#[cfg(not(test))]
#[derive(Clone)]
struct InitialMainWindowHide {
    pending: Arc<AtomicBool>,
}

#[cfg(not(test))]
#[derive(Clone, Default)]
struct GlobalScriptShortcuts {
    actions_by_shortcut: Arc<Mutex<HashMap<Shortcut, GlobalScriptShortcutAction>>>,
}

#[cfg(not(test))]
#[derive(Clone, Default)]
struct CompoundShortcutRuntime {
    state: Arc<Mutex<CompoundShortcutState>>,
}

#[cfg(not(test))]
#[derive(Default)]
struct CompoundShortcutState {
    registry: hotkeys::ShortcutRegistry,
    prefixes_by_shortcut: HashMap<Shortcut, hotkeys::HotkeySequence>,
    temporary_next_steps_by_shortcut: HashMap<Shortcut, hotkeys::HotkeyStep>,
    pending: Option<PendingCompoundShortcut>,
    pending_generation: u64,
}

#[cfg(not(test))]
#[derive(Clone)]
struct PendingCompoundShortcut {
    prefix: hotkeys::HotkeySequence,
    started_at: Instant,
    updated_at: Instant,
    generation: u64,
}

#[cfg(not(test))]
#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct CompoundShortcutPendingInfo {
    prefix_label: String,
    next_steps: Vec<String>,
    entries: Vec<WhichKeyEntry>,
    expires_at_unix_ms: u128,
}

#[cfg(not(test))]
#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct HotkeyNormalizationResult {
    normalized: Option<String>,
    valid: bool,
    error: Option<String>,
}

#[cfg(not(test))]
#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeShortcutStatus {
    label: String,
    registered: bool,
    supported: bool,
    error: Option<String>,
}

#[cfg(not(test))]
#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct AppShortcutStatus {
    picker: NativeShortcutStatus,
    pin: NativeShortcutStatus,
}

#[cfg(not(test))]
impl Default for NativeShortcutStatus {
    fn default() -> Self {
        Self {
            label: String::new(),
            registered: false,
            supported: false,
            error: None,
        }
    }
}

#[cfg(not(test))]
#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct WhichKeyEntry {
    key: String,
    label: String,
    group: String,
    route_id: String,
    disabled: bool,
    diagnostic: Option<String>,
}

#[cfg(not(test))]
#[derive(Clone)]
struct CurrentPickerShortcut {
    shortcut: Arc<Mutex<Shortcut>>,
    status: Arc<Mutex<NativeShortcutStatus>>,
}

#[cfg(not(test))]
#[derive(Clone, Default)]
struct CurrentPickerPinShortcut {
    shortcut: Arc<Mutex<Option<Shortcut>>>,
    status: Arc<Mutex<NativeShortcutStatus>>,
}

#[cfg(not(test))]
#[derive(Clone)]
struct GlobalScriptShortcutAction {
    action_id: String,
    shortcut_label: String,
    selection: actions::SelectionRequirement,
}

#[cfg(not(test))]
#[cfg(debug_assertions)]
fn dev_log(args: std::fmt::Arguments<'_>) {
    eprintln!("{args}");
}

#[cfg(not(test))]
#[cfg(not(debug_assertions))]
fn dev_log(_args: std::fmt::Arguments<'_>) {}

#[cfg(not(test))]
fn diag_log(_event: &str, _detail: impl AsRef<str>) {
    #[cfg(debug_assertions)]
    {
        let unix_ms = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_millis())
            .unwrap_or_default();
        eprintln!("[diag {unix_ms}] {_event}: {}", _detail.as_ref());
    }
}

#[cfg(not(test))]
fn require_surface_window<R: tauri::Runtime>(
    window: &tauri::WebviewWindow<R>,
    allowed_labels: &[&str],
    command: &str,
) -> Result<(), String> {
    if allowed_labels.iter().any(|label| *label == window.label()) {
        return Ok(());
    }

    Err(format!(
        "{command} cannot be called from window '{}'",
        window.label()
    ))
}

#[cfg(not(test))]
fn build_surface_window<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    label: &str,
) -> Result<tauri::WebviewWindow<R>, String> {
    let surface = surface_registry::require(label)?;
    let started_at = Instant::now();
    diag_log(
        "surface.build.start",
        format!(
            "label={} route={} lifecycle={:?}",
            surface.label, surface.route, surface.lifecycle
        ),
    );
    dev_log(format_args!(
        "build surface: label={} kind={:?} chrome={:?} lifecycle={:?} bounds={:?} capability={}",
        surface.label,
        surface.kind,
        surface.chrome,
        surface.lifecycle,
        surface.bounds_policy,
        surface.capability
    ));
    let mut builder =
        WebviewWindowBuilder::new(app, surface.label, WebviewUrl::App(surface.route.into()))
            .title(surface.title)
            .inner_size(surface.width as f64, surface.height as f64)
            .min_inner_size(surface.min_width as f64, surface.min_height as f64)
            .decorations(surface.decorations)
            .transparent(surface.transparent)
            .resizable(surface.resizable)
            .shadow(surface.shadow)
            .skip_taskbar(surface.skip_taskbar)
            .always_on_top(surface.always_on_top)
            .visible(false)
            .focused(false);

    if let (Some(max_width), Some(max_height)) = (surface.max_width, surface.max_height) {
        builder = builder.max_inner_size(max_width as f64, max_height as f64);
    }

    let window = builder
        .build()
        .map_err(|error| format!("{} window build failed: {error}", surface.label))?;
    diag_log(
        "surface.build.done",
        format!(
            "label={} elapsed_ms={}",
            surface.label,
            started_at.elapsed().as_millis()
        ),
    );
    Ok(window)
}

#[cfg(not(test))]
impl PickerFocusPolicy {
    fn cancel_pending_hide(&self) {
        self.generation.fetch_add(1, Ordering::SeqCst);
    }

    fn schedule_hide<R: tauri::Runtime>(&self, window: tauri::Window<R>) {
        let generation = self.generation.fetch_add(1, Ordering::SeqCst) + 1;
        let policy = self.clone();
        let app = window.app_handle().clone();

        thread::spawn(move || {
            thread::sleep(HIDE_ON_FOCUS_LOST_DELAY);
            if policy.generation.load(Ordering::SeqCst) != generation {
                return;
            }

            let reset_app = app.clone();
            if let Err(error) = app.run_on_main_thread(move || {
                if window.is_focused().unwrap_or(false)
                    || !window.is_visible().unwrap_or(false)
                    || window.is_always_on_top().unwrap_or(false)
                    || !should_hide_on_focus_lost(&window)
                {
                    return;
                }

                if let Err(error) = window.hide() {
                    eprintln!("window delayed hide on focus lost failed: {error}");
                } else {
                    if let Some(session) = reset_app.try_state::<PickerSessionController>() {
                        session.mark_transient_hidden();
                    }
                    diag_log("window.focus.hide", "focus lost");
                }
            }) {
                eprintln!("window delayed hide dispatch failed: {error}");
            }
        });
    }
}

#[cfg(not(test))]
impl PickerSessionController {
    pub(crate) fn mark_transient_hidden(&self) {
        self.reset_pending.store(true, Ordering::SeqCst);
        self.generation.fetch_add(1, Ordering::SeqCst);
    }

    fn consume_snapshot(&self) -> PickerSessionSnapshot {
        PickerSessionSnapshot {
            reset: self.reset_pending.swap(false, Ordering::SeqCst),
            generation: self.generation.load(Ordering::SeqCst),
        }
    }
}

#[cfg(not(test))]
impl Default for InitialMainWindowHide {
    fn default() -> Self {
        Self {
            pending: Arc::new(AtomicBool::new(true)),
        }
    }
}

#[cfg(not(test))]
impl InitialMainWindowHide {
    fn cancel(&self) {
        self.pending.store(false, Ordering::SeqCst);
    }

    fn is_pending(&self) -> bool {
        self.pending.load(Ordering::SeqCst)
    }

    fn hide_now<R: tauri::Runtime>(&self, window: &tauri::Window<R>, reason: &str) -> bool {
        if !self.is_pending() {
            return false;
        }

        if let Err(error) = window.hide() {
            eprintln!("initial main window hide failed: {error}");
            return false;
        }

        diag_log("window.startup.hide", reason);
        true
    }

    fn schedule<R: tauri::Runtime + 'static>(&self, window: tauri::WebviewWindow<R>) {
        let policy = self.clone();
        let app = window.app_handle().clone();
        thread::spawn(move || {
            for attempt in 1..=STARTUP_HIDE_ENFORCE_ATTEMPTS {
                thread::sleep(STARTUP_HIDE_ENFORCE_INTERVAL);
                if !policy.is_pending() {
                    return;
                }

                let policy_for_main_thread = policy.clone();
                let window_for_main_thread = window.clone();
                if let Err(error) = app.run_on_main_thread(move || {
                    if policy_for_main_thread.is_pending()
                        && window_for_main_thread.is_visible().unwrap_or(false)
                    {
                        if let Err(error) = window_for_main_thread.hide() {
                            eprintln!("initial main window delayed hide failed: {error}");
                        } else {
                            diag_log(
                                "window.startup.hide",
                                format!("delayed enforcement attempt={attempt}"),
                            );
                        }
                    }
                }) {
                    eprintln!("initial main window hide dispatch failed: {error}");
                }
            }
        });
    }
}

#[cfg(not(test))]
impl Default for CurrentPickerShortcut {
    fn default() -> Self {
        Self {
            shortcut: Arc::new(Mutex::new(picker_shortcut())),
            status: Arc::new(Mutex::new(NativeShortcutStatus {
                label: PICKER_SHORTCUT_LABEL.to_string(),
                registered: false,
                supported: true,
                error: None,
            })),
        }
    }
}

#[cfg(not(test))]
impl CurrentPickerShortcut {
    fn get(&self) -> Shortcut {
        self.shortcut
            .lock()
            .map(|shortcut| *shortcut)
            .unwrap_or_else(|_| picker_shortcut())
    }

    fn set(&self, next_shortcut: Shortcut) {
        match self.shortcut.lock() {
            Ok(mut shortcut) => {
                *shortcut = next_shortcut;
            }
            Err(_) => eprintln!("picker shortcut mutex poisoned"),
        }
    }

    fn status(&self) -> NativeShortcutStatus {
        self.status
            .lock()
            .map(|status| status.clone())
            .unwrap_or_else(|_| NativeShortcutStatus {
                label: PICKER_SHORTCUT_LABEL.to_string(),
                registered: false,
                supported: true,
                error: Some("picker shortcut status unavailable".to_string()),
            })
    }

    fn set_status(&self, status: NativeShortcutStatus) {
        match self.status.lock() {
            Ok(mut current) => {
                *current = status;
            }
            Err(_) => eprintln!("picker shortcut status mutex poisoned"),
        }
    }
}

#[cfg(not(test))]
impl CurrentPickerPinShortcut {
    fn get(&self) -> Option<Shortcut> {
        self.shortcut.lock().ok().and_then(|shortcut| *shortcut)
    }

    fn set(&self, next_shortcut: Option<Shortcut>) {
        match self.shortcut.lock() {
            Ok(mut shortcut) => {
                *shortcut = next_shortcut;
            }
            Err(_) => eprintln!("picker pin shortcut mutex poisoned"),
        }
    }

    fn status(&self) -> NativeShortcutStatus {
        self.status
            .lock()
            .map(|status| status.clone())
            .unwrap_or_else(|_| NativeShortcutStatus {
                label: String::new(),
                registered: false,
                supported: false,
                error: Some("picker pin shortcut status unavailable".to_string()),
            })
    }

    fn set_status(&self, status: NativeShortcutStatus) {
        match self.status.lock() {
            Ok(mut current) => {
                *current = status;
            }
            Err(_) => eprintln!("picker pin shortcut status mutex poisoned"),
        }
    }
}

#[cfg(not(test))]
#[tauri::command]
fn get_capture_stats<R: tauri::Runtime>(app: tauri::AppHandle<R>) -> clipboard::CaptureStats {
    app.try_state::<clipboard::ClipboardCapture>()
        .map(|capture| capture.stats())
        .unwrap_or_default()
}

#[cfg(not(test))]
#[tauri::command]
fn get_capture_snapshot<R: tauri::Runtime>(app: tauri::AppHandle<R>) -> clipboard::CaptureSnapshot {
    app.try_state::<clipboard::ClipboardCapture>()
        .map(|capture| capture.snapshot())
        .unwrap_or_default()
}

#[cfg(not(test))]
#[tauri::command]
fn get_clipboard_probe() -> Result<clipboard_probe::ClipboardProbe, String> {
    clipboard_probe::probe_clipboard()
}

#[cfg(not(test))]
#[tauri::command]
fn get_main_window_pin_state<R: tauri::Runtime>(app: tauri::AppHandle<R>) -> Result<bool, String> {
    let window = app
        .get_webview_window(MAIN_WINDOW_LABEL)
        .ok_or_else(|| "main window not available".to_string())?;
    window
        .is_always_on_top()
        .map_err(|error| format!("failed to read main window pin state: {error}"))
}

#[cfg(not(test))]
#[tauri::command]
fn set_main_window_pin_state<R: tauri::Runtime + 'static>(
    app: tauri::AppHandle<R>,
    pinned: bool,
) -> Result<bool, String> {
    let (tx, rx) = mpsc::channel();
    let app_for_main_thread = app.clone();
    app.run_on_main_thread(move || {
        let result = set_main_window_pin_state_on_main_thread(&app_for_main_thread, pinned);
        let _ = tx.send(result);
    })
    .map_err(|error| format!("main window pin dispatch failed: {error}"))?;

    rx.recv_timeout(Duration::from_secs(2))
        .map_err(|error| format!("main window pin dispatch did not complete: {error}"))?
}

#[cfg(not(test))]
fn set_main_window_pin_state_on_main_thread<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    pinned: bool,
) -> Result<bool, String> {
    let window = app
        .get_webview_window(MAIN_WINDOW_LABEL)
        .ok_or_else(|| "main window not available".to_string())?;
    window
        .set_always_on_top(pinned)
        .map_err(|error| format!("failed to set main window pin state: {error}"))?;
    let actual_pinned = window
        .is_always_on_top()
        .map_err(|error| format!("failed to read main window pin state after set: {error}"))?;
    emit_picker_pin_state(app, actual_pinned);
    Ok(actual_pinned)
}

#[cfg(not(test))]
#[tauri::command]
fn get_app_about_info() -> AppAboutInfo {
    AppAboutInfo {
        name: "Copicu",
        version: env!("CARGO_PKG_VERSION"),
        description: "A fast local clipboard manager inspired by CopyQ, built for keyboard-first Windows workflows.",
        target: if cfg!(debug_assertions) { "debug" } else { "release" },
    }
}

#[cfg(not(test))]
#[tauri::command]
fn get_app_shortcut_status<R: tauri::Runtime>(app: tauri::AppHandle<R>) -> AppShortcutStatus {
    let picker = app
        .try_state::<CurrentPickerShortcut>()
        .map(|current| current.status())
        .unwrap_or_else(|| NativeShortcutStatus {
            label: PICKER_SHORTCUT_LABEL.to_string(),
            registered: false,
            supported: true,
            error: Some("picker shortcut state unavailable".to_string()),
        });
    let pin = app
        .try_state::<CurrentPickerPinShortcut>()
        .map(|current| current.status())
        .unwrap_or_else(|| NativeShortcutStatus {
            label: String::new(),
            registered: false,
            supported: false,
            error: Some("picker pin shortcut state unavailable".to_string()),
        });

    AppShortcutStatus { picker, pin }
}

#[cfg(not(test))]
#[tauri::command]
fn list_recent_items(
    storage: State<'_, storage::AppStorage>,
) -> Result<Vec<storage::HistoryItem>, String> {
    storage.list_recent()
}

#[cfg(not(test))]
#[tauri::command]
fn search_items(
    storage: State<'_, storage::AppStorage>,
    query: String,
) -> Result<Vec<storage::HistoryItem>, String> {
    storage.search(&query)
}

#[cfg(not(test))]
#[tauri::command]
fn list_history_page(
    storage: State<'_, storage::AppStorage>,
    request: storage::HistoryPageRequest,
) -> Result<storage::HistoryPage, String> {
    storage.list_page(request)
}

#[cfg(not(test))]
#[tauri::command]
fn history_search(
    app: tauri::AppHandle,
    storage: State<'_, storage::AppStorage>,
    request: storage::HistorySearchRequest,
) -> Result<storage::HistoryPage, String> {
    if request.mode == storage::HistorySearchMode::Ai {
        return history_search_with_ai_planner(&app, &storage, request);
    }
    storage.history_search(request)
}

#[cfg(not(test))]
fn history_search_with_ai_planner(
    app: &tauri::AppHandle,
    storage: &storage::AppStorage,
    request: storage::HistorySearchRequest,
) -> Result<storage::HistoryPage, String> {
    let settings = storage.get_settings()?;
    let plan = match ai_planner::plan_history_search(&settings.ai, &request.query, "") {
        Ok(plan) => plan,
        Err(error) => {
            let original_query = request.query.clone();
            let mut fallback_request = request;
            fallback_request.mode = storage::HistorySearchMode::Structured;
            fallback_request.explain = true;
            let mut page = storage.history_search(fallback_request)?;
            page.interpreted_query = Some(original_query);
            page.explanation =
                Some("AI search unavailable; using structured local history search.".to_string());
            page.warnings.push(error);
            return Ok(page);
        }
    };
    if plan.intent == ai_planner::AiSearchIntent::HistoryAction {
        return execute_ai_history_action_plan(app, storage, request, plan);
    }
    let mut planned_request = request.clone();
    planned_request.query = plan.query.trim().to_string();
    planned_request.mode = storage::HistorySearchMode::Structured;
    planned_request.explain = true;

    let mut page = storage.history_search(planned_request)?;
    page.interpreted_query = Some(plan.query);
    page.explanation = Some(plan.explanation);
    if let Some(question) = plan.needs_clarification {
        page.warnings
            .push(format!("AI clarification suggested: {question}"));
    }
    page.warnings.extend(plan.warnings);
    let _ = app.emit(
        NOTIFICATION_TOAST_EVENT,
        serde_json::json!({
            "title": "AI search",
            "message": page.explanation.clone().unwrap_or_else(|| "Planned history search".to_string()),
            "tone": "info",
            "durationMs": 2800
        }),
    );
    Ok(page)
}

#[cfg(not(test))]
fn execute_ai_history_action_plan(
    app: &tauri::AppHandle,
    storage: &storage::AppStorage,
    request: storage::HistorySearchRequest,
    plan: ai_planner::AiHistorySearchPlan,
) -> Result<storage::HistoryPage, String> {
    match plan
        .action
        .ok_or_else(|| "AI planner returned action intent without action".to_string())?
    {
        ai_planner::AiHistoryActionPlan::RunAiScript { prompt } => {
            let script_context =
                request
                    .ai_context
                    .clone()
                    .unwrap_or(ai_planner::AiScriptContext {
                        current_query: request.query.clone(),
                        visible_item_ids: Vec::new(),
                        active_item_id: None,
                        current_item_id: None,
                        selected_item_ids: Vec::new(),
                    });
            let settings = storage.get_settings()?;
            let script_plan =
                ai_planner::plan_ai_script(&settings.ai, &prompt, script_context.clone())?;
            eprintln!(
                "AI script generated from ai: id={} capabilities={} summary={}",
                script_plan.id,
                script_plan.capabilities.join(","),
                script_plan.summary
            );
            eprintln!("AI script source:\n{}", script_plan.script);

            let action = actions::ActionDefinition {
                id: script_plan.id.clone(),
                title: script_plan.title.clone(),
                description: script_plan.summary.clone(),
                shortcut: None,
                triggers: vec![actions::Trigger::DevRun],
                input: actions::ActionInput {
                    source: actions::ActionInputSource::None,
                    selection: actions::SelectionRequirement::None,
                    kinds: None,
                    mime: None,
                    query: None,
                },
                capabilities: script_plan.capabilities.clone(),
                builtin: false,
                source: actions::ActionSource::Script,
                script: None,
                diagnostics: Vec::new(),
                logging: Some(actions::ActionLogging {
                    name: Some(format!(
                        "{}.jsonl",
                        script_plan.id.replace(['/', '\\'], ".")
                    )),
                    redact: true,
                }),
            };
            let suppression = app
                .state::<clipboard::SelfWriteSuppression>()
                .inner()
                .clone();
            let previous_window = app.state::<window_focus::PreviousWindow>().inner().clone();
            let window = app.get_webview_window(MAIN_WINDOW_LABEL);
            let result = actions::run_temporary_script_action(
                app,
                window.as_ref(),
                storage,
                &suppression,
                &previous_window,
                action,
                &script_plan.script,
                actions::ActionContext {
                    trigger: actions::Trigger::DevRun,
                    shortcut: None,
                    current_item_id: script_context.current_item_id,
                    selected_item_ids: script_context.selected_item_ids.clone(),
                    view: Some(actions::ActionViewContext {
                        query: script_context.current_query.clone(),
                        visible_item_ids: script_context.visible_item_ids.clone(),
                        current_index: None,
                    }),
                },
            );

            let mut refreshed_request = request.clone();
            refreshed_request.query = script_plan
                .display_query
                .as_deref()
                .map(str::trim)
                .unwrap_or("")
                .to_string();
            refreshed_request.mode = storage::HistorySearchMode::Structured;
            refreshed_request.explain = true;
            let mut page = storage.history_search(refreshed_request)?;
            page.interpreted_query = Some(
                script_plan
                    .display_query
                    .as_deref()
                    .map(str::trim)
                    .unwrap_or("")
                    .to_string(),
            );
            page.explanation = Some(format!("{}: {}", script_plan.summary, result.message));
            if let Some(question) = plan.needs_clarification {
                page.warnings
                    .push(format!("AI clarification suggested: {question}"));
            }
            if result.status == actions::ActionRunStatus::Failed {
                page.warnings
                    .push(format!("AI script failed: {}", result.message));
            }
            page.warnings.extend(plan.warnings);
            page.warnings.extend(script_plan.warnings);
            let _ = app.emit(
                NOTIFICATION_TOAST_EVENT,
                serde_json::json!({
                    "title": "AI action",
                    "message": page.explanation.clone().unwrap_or_else(|| "Updated history items".to_string()),
                    "tone": "info",
                    "durationMs": 2200
                }),
            );
            Ok(page)
        }
    }
}

#[cfg(not(test))]
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct AiScriptRunRequest {
    prompt: String,
    context: Option<ai_planner::AiScriptContext>,
}

#[cfg(not(test))]
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct AiScriptRunResponse {
    script: String,
    capabilities: Vec<String>,
    summary: String,
    warnings: Vec<String>,
    result: actions::ActionRunResult,
}

#[cfg(not(test))]
#[tauri::command]
fn ai_script_run(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    storage: State<'_, storage::AppStorage>,
    suppression: State<'_, clipboard::SelfWriteSuppression>,
    previous_window: State<'_, window_focus::PreviousWindow>,
    request: AiScriptRunRequest,
) -> Result<AiScriptRunResponse, String> {
    let settings = storage.get_settings()?;
    let context = request.context.unwrap_or(ai_planner::AiScriptContext {
        current_query: String::new(),
        visible_item_ids: Vec::new(),
        active_item_id: None,
        current_item_id: None,
        selected_item_ids: Vec::new(),
    });
    let plan = ai_planner::plan_ai_script(&settings.ai, &request.prompt, context.clone())?;
    eprintln!(
        "AI script generated: id={} capabilities={} summary={}",
        plan.id,
        plan.capabilities.join(","),
        plan.summary
    );
    eprintln!("AI script source:\n{}", plan.script);

    let action = actions::ActionDefinition {
        id: plan.id.clone(),
        title: plan.title.clone(),
        description: plan.summary.clone(),
        shortcut: None,
        triggers: vec![actions::Trigger::DevRun],
        input: actions::ActionInput {
            source: actions::ActionInputSource::None,
            selection: actions::SelectionRequirement::None,
            kinds: None,
            mime: None,
            query: None,
        },
        capabilities: plan.capabilities.clone(),
        builtin: false,
        source: actions::ActionSource::Script,
        script: None,
        diagnostics: Vec::new(),
        logging: Some(actions::ActionLogging {
            name: Some(format!("{}.jsonl", plan.id.replace(['/', '\\'], "."))),
            redact: true,
        }),
    };
    let result = actions::run_temporary_script_action(
        &app,
        Some(&window),
        &storage,
        &suppression,
        &previous_window,
        action,
        &plan.script,
        actions::ActionContext {
            trigger: actions::Trigger::DevRun,
            shortcut: None,
            current_item_id: context.current_item_id,
            selected_item_ids: context.selected_item_ids.clone(),
            view: Some(actions::ActionViewContext {
                query: context.current_query.clone(),
                visible_item_ids: context.visible_item_ids.clone(),
                current_index: None,
            }),
        },
    );

    Ok(AiScriptRunResponse {
        script: plan.script,
        capabilities: plan.capabilities,
        summary: plan.summary,
        warnings: plan.warnings,
        result,
    })
}

#[cfg(not(test))]
#[tauri::command]
fn record_renderer_diagnostic(event: String, detail: Option<String>) {
    diag_log(
        "renderer",
        format!("{event} {}", detail.unwrap_or_default()),
    );
}

#[cfg(not(test))]
#[tauri::command]
fn show_picker(app: tauri::AppHandle) -> Result<(), String> {
    show_main_window(&app, false)
}

#[cfg(not(test))]
#[tauri::command]
fn hide_picker(window: tauri::WebviewWindow) -> Result<(), String> {
    require_surface_window(&window, &[MAIN_WINDOW_LABEL], "hide_picker")?;
    host::hide_picker(&window)
}

#[cfg(not(test))]
#[tauri::command]
fn consume_picker_session_snapshot(
    window: tauri::WebviewWindow,
    session: tauri::State<PickerSessionController>,
) -> Result<PickerSessionSnapshot, String> {
    require_surface_window(
        &window,
        &[MAIN_WINDOW_LABEL],
        "consume_picker_session_snapshot",
    )?;
    Ok(session.consume_snapshot())
}

#[cfg(not(test))]
#[tauri::command]
fn open_settings_window(app: tauri::AppHandle) -> Result<(), String> {
    thread::spawn(move || {
        let app_for_main_thread = app.clone();
        if let Err(error) = app.run_on_main_thread(move || {
            if let Err(error) = open_settings_window_on_main_thread(&app_for_main_thread) {
                eprintln!("{error}");
            }
        }) {
            eprintln!("settings window dispatch failed: {error}");
        }
    });
    Ok(())
}

#[cfg(not(test))]
#[tauri::command]
fn close_settings_window(window: tauri::WebviewWindow) -> Result<(), String> {
    if window.label() != SETTINGS_WINDOW_LABEL {
        return Err("close_settings_window can only be called from settings".to_string());
    }

    window
        .hide()
        .map_err(|error| format!("settings window hide failed: {error}"))
}

#[cfg(not(test))]
#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct AppAboutInfo {
    name: &'static str,
    version: &'static str,
    description: &'static str,
    target: &'static str,
}

#[cfg(not(test))]
#[derive(serde::Deserialize, serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MarkdownOutputPayload {
    title: String,
    markdown: String,
    summary: Option<String>,
    source: Option<String>,
    suggested_file_name: Option<String>,
}

#[cfg(not(test))]
#[derive(Clone, Default)]
struct AiOutputState {
    latest: Arc<Mutex<Option<MarkdownOutputPayload>>>,
}

#[cfg(not(test))]
impl AiOutputState {
    fn set_latest(&self, payload: MarkdownOutputPayload) -> Result<(), String> {
        let mut latest = self
            .latest
            .lock()
            .map_err(|_| "ai-output state lock poisoned".to_string())?;
        *latest = Some(payload);
        Ok(())
    }

    fn latest(&self) -> Result<Option<MarkdownOutputPayload>, String> {
        self.latest
            .lock()
            .map_err(|_| "ai-output state lock poisoned".to_string())
            .map(|latest| latest.clone())
    }
}

#[cfg(not(test))]
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct OpenMetadataWindowRequest {
    item_id: i64,
}

#[cfg(not(test))]
#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct MetadataEditorPayload {
    item: storage::HistoryItem,
    capture_context_events: Vec<storage::CaptureContextEvent>,
}

#[cfg(not(test))]
#[derive(Clone, Default)]
struct MetadataEditorState {
    latest: Arc<Mutex<Option<MetadataEditorPayload>>>,
}

#[cfg(not(test))]
impl MetadataEditorState {
    fn set_latest(&self, payload: MetadataEditorPayload) -> Result<(), String> {
        let mut latest = self
            .latest
            .lock()
            .map_err(|_| "metadata state lock poisoned".to_string())?;
        *latest = Some(payload);
        Ok(())
    }

    fn latest(&self) -> Result<Option<MetadataEditorPayload>, String> {
        self.latest
            .lock()
            .map_err(|_| "metadata state lock poisoned".to_string())
            .map(|latest| latest.clone())
    }
}

#[cfg(not(test))]
#[tauri::command]
fn open_markdown_output(
    app: tauri::AppHandle,
    payload: MarkdownOutputPayload,
) -> Result<(), String> {
    open_ai_output_window(&app, payload)
}

#[cfg(not(test))]
#[tauri::command]
fn open_metadata_window(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    storage: State<'_, storage::AppStorage>,
    request: OpenMetadataWindowRequest,
) -> Result<bool, String> {
    let started_at = Instant::now();
    diag_log(
        "metadata.open.command.start",
        format!(
            "source_window={} item_id={}",
            window.label(),
            request.item_id
        ),
    );
    require_surface_window(&window, &[MAIN_WINDOW_LABEL], "open_metadata_window")?;
    let fetch_started_at = Instant::now();
    let item = storage.get_item(request.item_id)?;
    let capture_context_events = storage.list_capture_context_events(request.item_id, 12)?;
    diag_log(
        "metadata.open.item-fetch.done",
        format!(
            "item_id={} elapsed_ms={} total_ms={}",
            request.item_id,
            fetch_started_at.elapsed().as_millis(),
            started_at.elapsed().as_millis()
        ),
    );
    let item_id = request.item_id;
    thread::spawn(move || {
        let app_for_main_thread = app.clone();
        if let Err(error) = app.run_on_main_thread(move || {
            if let Err(error) = open_metadata_editor_window(
                &app_for_main_thread,
                MetadataEditorPayload {
                    item,
                    capture_context_events,
                },
            ) {
                eprintln!("metadata window open failed: {error}");
            }
        }) {
            eprintln!("metadata window dispatch failed: {error}");
        }
    });
    diag_log(
        "metadata.open.command.dispatched",
        format!(
            "item_id={} total_ms={}",
            item_id,
            started_at.elapsed().as_millis()
        ),
    );
    Ok(true)
}

#[cfg(not(test))]
#[tauri::command]
fn pending_metadata_editor(
    window: tauri::WebviewWindow,
    state: State<'_, MetadataEditorState>,
) -> Result<Option<MetadataEditorPayload>, String> {
    require_surface_window(&window, &[METADATA_WINDOW_LABEL], "pending_metadata_editor")?;
    let payload = state.latest()?;
    diag_log(
        "metadata.pending",
        format!(
            "window={} has_payload={} item_id={}",
            window.label(),
            payload.is_some(),
            payload
                .as_ref()
                .map(|payload| payload.item.id())
                .unwrap_or_default()
        ),
    );
    Ok(payload)
}

#[cfg(not(test))]
#[tauri::command]
fn close_metadata_window(window: tauri::WebviewWindow) -> Result<(), String> {
    require_surface_window(&window, &[METADATA_WINDOW_LABEL], "close_metadata_window")?;
    let started_at = Instant::now();
    window
        .hide()
        .map_err(|error| format!("metadata window hide failed: {error}"))?;
    diag_log(
        "metadata.close.hide.done",
        format!("elapsed_ms={}", started_at.elapsed().as_millis()),
    );
    Ok(())
}

#[cfg(not(test))]
#[tauri::command]
fn pending_ai_output(
    window: tauri::WebviewWindow,
    state: State<'_, AiOutputState>,
) -> Result<Option<MarkdownOutputPayload>, String> {
    require_surface_window(&window, &[AI_OUTPUT_WINDOW_LABEL], "pending_ai_output")?;
    state.latest()
}

#[cfg(not(test))]
#[tauri::command]
fn copy_markdown_output(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    suppression: State<'_, clipboard::SelfWriteSuppression>,
    markdown: String,
) -> Result<(), String> {
    require_surface_window(&window, &[AI_OUTPUT_WINDOW_LABEL], "copy_markdown_output")?;
    let hash = storage::hash_text(&markdown);
    suppression.suppress_hash(hash.clone());
    app.clipboard().write_text(markdown).map_err(|error| {
        suppression.clear_if_hash(&hash);
        format!("failed to copy markdown output: {error}")
    })
}

#[cfg(not(test))]
#[tauri::command]
fn add_markdown_output_to_history(
    window: tauri::WebviewWindow,
    storage: State<'_, storage::AppStorage>,
    markdown: String,
) -> Result<i64, String> {
    require_surface_window(
        &window,
        &[AI_OUTPUT_WINDOW_LABEL],
        "add_markdown_output_to_history",
    )?;
    let hash = storage::hash_text(&markdown);
    storage.insert_text(&markdown, &hash)
}

#[cfg(not(test))]
#[tauri::command]
fn export_markdown_output(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    payload: MarkdownOutputPayload,
) -> Result<String, String> {
    require_surface_window(&window, &[AI_OUTPUT_WINDOW_LABEL], "export_markdown_output")?;
    let document_dir = app
        .path()
        .document_dir()
        .map_err(|error| format!("failed to resolve Documents folder: {error}"))?;
    let export_dir = document_dir.join("Copicu").join("Exports");
    std::fs::create_dir_all(&export_dir).map_err(|error| {
        format!(
            "failed to create export folder {}: {error}",
            export_dir.display()
        )
    })?;
    let file_name = markdown_output::safe_file_name(
        payload
            .suggested_file_name
            .as_deref()
            .unwrap_or(payload.title.as_str()),
    );
    let path = markdown_output::unique_path(&export_dir, &file_name);
    std::fs::write(&path, payload.markdown)
        .map_err(|error| format!("failed to write markdown file {}: {error}", path.display()))?;
    Ok(path.to_string_lossy().into_owned())
}

#[cfg(not(test))]
#[tauri::command]
fn position_notifications_window(app: tauri::AppHandle) -> Result<(), String> {
    setup_notifications_window(&app)?;
    position_notifications_window_for_monitor(&app)
}

#[cfg(not(test))]
#[tauri::command]
fn resolve_ui_host_request(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    ui_host: State<'_, ui_host::UiHostState>,
    request: ui_host::UiHostResolveRequest,
) -> Result<(), String> {
    require_surface_window(&window, &[UI_HOST_WINDOW_LABEL], "resolve_ui_host_request")?;
    ui_host.resolve(request)?;
    if let Some(window) = app.get_webview_window(UI_HOST_WINDOW_LABEL) {
        if let Err(error) = window.hide() {
            eprintln!("ui-host hide after resolve failed: {error}");
        }
    }
    Ok(())
}

#[cfg(not(test))]
#[tauri::command]
fn pending_ui_host_request(
    window: tauri::WebviewWindow,
    ui_host: State<'_, ui_host::UiHostState>,
) -> Result<Option<serde_json::Value>, String> {
    require_surface_window(&window, &[UI_HOST_WINDOW_LABEL], "pending_ui_host_request")?;
    ui_host.active_request()
}

#[cfg(not(test))]
#[tauri::command]
fn write_history_item(
    app: tauri::AppHandle,
    storage: State<'_, storage::AppStorage>,
    suppression: State<'_, clipboard::SelfWriteSuppression>,
    id: i64,
) -> Result<(), String> {
    host::write_item(&app, &storage, &suppression, id)
}

#[cfg(not(test))]
#[tauri::command]
fn mark_history_item_used(storage: State<'_, storage::AppStorage>, id: i64) -> Result<(), String> {
    host::mark_used(&storage, id)
}

#[cfg(not(test))]
#[tauri::command]
fn set_history_items_marked(
    storage: State<'_, storage::AppStorage>,
    request: storage::SetHistoryItemsMarkedRequest,
) -> Result<(), String> {
    storage.set_items_marked(request)
}

#[cfg(not(test))]
#[tauri::command]
fn set_history_query_marked(
    storage: State<'_, storage::AppStorage>,
    request: storage::SetHistoryQueryMarkedRequest,
) -> Result<(), String> {
    storage.set_query_marked(request)
}

#[cfg(not(test))]
#[tauri::command]
fn clear_marked_history_items(storage: State<'_, storage::AppStorage>) -> Result<(), String> {
    storage.clear_marked()
}

#[cfg(not(test))]
#[tauri::command]
fn count_marked_history_items(storage: State<'_, storage::AppStorage>) -> Result<i64, String> {
    storage.count_marked()
}

#[cfg(not(test))]
#[tauri::command]
fn update_history_item(
    window: tauri::WebviewWindow,
    storage: State<'_, storage::AppStorage>,
    request: storage::UpdateHistoryItemRequest,
) -> Result<(), String> {
    require_surface_window(
        &window,
        &[MAIN_WINDOW_LABEL, METADATA_WINDOW_LABEL],
        "update_history_item",
    )?;
    storage.update_item(request)
}

#[cfg(not(test))]
#[tauri::command]
fn create_history_item(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    storage: State<'_, storage::AppStorage>,
    request: storage::CreateHistoryItemRequest,
) -> Result<storage::CreateHistoryItemResult, String> {
    require_surface_window(&window, &[MAIN_WINDOW_LABEL], "create_history_item")?;
    let result = storage.create_text_item(request)?;
    if let Err(error) = app.emit(
        HISTORY_CHANGED_EVENT,
        serde_json::json!({
            "itemId": result.id,
            "contentKind": "text",
        }),
    ) {
        eprintln!("history changed emit failed: {error}");
    }
    Ok(result)
}

#[cfg(not(test))]
#[tauri::command]
fn delete_history_item(
    window: tauri::WebviewWindow,
    storage: State<'_, storage::AppStorage>,
    id: i64,
) -> Result<(), String> {
    require_surface_window(&window, &[MAIN_WINDOW_LABEL], "delete_history_item")?;
    storage.delete_item(id)
}

#[cfg(not(test))]
#[tauri::command]
fn get_history_item(
    storage: State<'_, storage::AppStorage>,
    id: i64,
) -> Result<storage::HistoryItem, String> {
    storage.get_item(id)
}

#[cfg(not(test))]
#[tauri::command]
fn get_settings(storage: State<'_, storage::AppStorage>) -> Result<storage::AppSettings, String> {
    storage.get_settings()
}

#[cfg(not(test))]
#[tauri::command]
fn update_settings(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    storage: State<'_, storage::AppStorage>,
    mut settings: storage::AppSettings,
) -> Result<storage::AppSettings, String> {
    require_surface_window(&window, &[SETTINGS_WINDOW_LABEL], "update_settings")?;
    settings.general.global_shortcut =
        normalize_picker_global_shortcut(&settings.general.global_shortcut)?;
    settings.picker.pin_toggle_shortcut =
        normalize_optional_single_shortcut(&settings.picker.pin_toggle_shortcut, "pin toggle")?;
    settings.picker.settings_shortcut =
        normalize_optional_single_shortcut(&settings.picker.settings_shortcut, "settings")?;
    apply_autostart_setting(&app, settings.general.launch_on_startup)?;
    let next_settings = storage.update_settings(settings)?;
    apply_picker_keep_open_window_policy(&app, &next_settings);
    actions::refresh_script_action_cache(&storage)?;
    refresh_global_shortcuts_from_storage(&app, &storage)?;
    Ok(next_settings)
}

#[cfg(not(test))]
#[tauri::command]
fn set_picker_keep_open(
    window: tauri::WebviewWindow,
    storage: State<'_, storage::AppStorage>,
    keep_open: bool,
) -> Result<storage::AppSettings, String> {
    require_surface_window(&window, &[MAIN_WINDOW_LABEL], "set_picker_keep_open")?;
    let mut settings = storage.get_settings()?;
    settings.picker.hide_on_focus_lost = !keep_open;
    let next_settings = storage.update_settings(settings)?;
    apply_picker_keep_open_policy_to_window(&window, &next_settings)?;
    diag_log(
        "picker.keep_open",
        format!(
            "keep_open={keep_open} hide_on_focus_lost={}",
            next_settings.picker.hide_on_focus_lost
        ),
    );
    Ok(next_settings)
}

#[cfg(not(test))]
#[tauri::command]
fn edit_scripts_in_vscode(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    storage: State<'_, storage::AppStorage>,
) -> Result<(), String> {
    require_surface_window(&window, &[SETTINGS_WINDOW_LABEL], "edit_scripts_in_vscode")?;
    script_editor::open_scripts_path_in_vscode(&app, &storage, None)
}

#[cfg(not(test))]
#[tauri::command]
fn edit_script_in_vscode(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    storage: State<'_, storage::AppStorage>,
    path: String,
) -> Result<(), String> {
    require_surface_window(&window, &[SETTINGS_WINDOW_LABEL], "edit_script_in_vscode")?;
    script_editor::open_scripts_path_in_vscode(&app, &storage, Some(Path::new(&path)))
}

#[cfg(not(test))]
fn normalize_picker_global_shortcut(input: &str) -> Result<String, String> {
    let sequence = hotkeys::HotkeySequence::parse(input)
        .map_err(|error| format!("invalid picker shortcut: {error}"))?;
    if !sequence.is_simple() {
        return Err("picker shortcut must be a single shortcut, not a sequence".to_string());
    }
    let normalized = sequence.to_string();
    if shortcut_from_label(&normalized).is_none() {
        return Err(format!("unsupported picker shortcut: {normalized}"));
    }
    Ok(normalized)
}

#[cfg(not(test))]
fn normalize_optional_single_shortcut(input: &str, label: &str) -> Result<String, String> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Ok(String::new());
    }

    let sequence = hotkeys::HotkeySequence::parse(trimmed)
        .map_err(|error| format!("invalid {label} shortcut: {error}"))?;
    if !sequence.is_simple() {
        return Err(format!(
            "{label} shortcut must be a single shortcut, not a sequence"
        ));
    }
    let normalized = sequence.to_string();
    if shortcut_from_label(&normalized).is_none() {
        return Err(format!("unsupported {label} shortcut: {normalized}"));
    }
    Ok(normalized)
}

#[cfg(not(test))]
#[tauri::command]
fn list_tags(storage: State<'_, storage::AppStorage>) -> Result<Vec<storage::TagSummary>, String> {
    storage.list_tags()
}

#[cfg(not(test))]
#[tauri::command]
fn create_tag(
    window: tauri::WebviewWindow,
    storage: State<'_, storage::AppStorage>,
    request: storage::CreateTagRequest,
) -> Result<storage::TagSummary, String> {
    require_surface_window(&window, &[SETTINGS_WINDOW_LABEL], "create_tag")?;
    storage.create_tag(request)
}

#[cfg(not(test))]
#[tauri::command]
fn update_tag_config(
    window: tauri::WebviewWindow,
    storage: State<'_, storage::AppStorage>,
    request: storage::UpdateTagConfigRequest,
) -> Result<storage::TagSummary, String> {
    require_surface_window(&window, &[SETTINGS_WINDOW_LABEL], "update_tag_config")?;
    storage.update_tag_config(request)
}

#[cfg(not(test))]
#[tauri::command]
fn normalize_hotkey_sequence(input: String) -> HotkeyNormalizationResult {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return HotkeyNormalizationResult {
            normalized: None,
            valid: true,
            error: None,
        };
    }

    match hotkeys::HotkeySequence::parse(trimmed) {
        Ok(sequence) => HotkeyNormalizationResult {
            normalized: Some(sequence.to_string()),
            valid: true,
            error: None,
        },
        Err(error) => HotkeyNormalizationResult {
            normalized: None,
            valid: false,
            error: Some(error),
        },
    }
}

#[cfg(not(test))]
#[tauri::command]
fn set_item_tags(
    window: tauri::WebviewWindow,
    storage: State<'_, storage::AppStorage>,
    request: storage::SetItemTagsRequest,
) -> Result<(), String> {
    require_surface_window(&window, &[MAIN_WINDOW_LABEL], "set_item_tags")?;
    storage.set_item_tags(request)
}

#[cfg(not(test))]
#[tauri::command]
fn list_builtin_actions() -> Vec<actions::ActionDefinition> {
    actions::builtin_actions()
}

#[cfg(not(test))]
#[tauri::command]
fn list_actions(
    app: tauri::AppHandle,
    storage: State<'_, storage::AppStorage>,
) -> Result<Vec<actions::ActionDefinition>, String> {
    let actions = actions::list_actions(&storage)?;
    let settings = storage.get_settings()?;
    refresh_global_shortcuts(&app, &actions, &settings);
    Ok(actions)
}

#[cfg(not(test))]
#[tauri::command]
fn refresh_script_action_cache(
    app: tauri::AppHandle,
    storage: State<'_, storage::AppStorage>,
) -> Result<Vec<actions::ActionDefinition>, String> {
    actions::refresh_script_action_cache(&storage)?;
    let actions = actions::list_actions(&storage)?;
    let settings = storage.get_settings()?;
    refresh_global_shortcuts(&app, &actions, &settings);
    Ok(actions)
}

#[cfg(not(test))]
#[tauri::command]
fn open_picker_for_tag(app: tauri::AppHandle, slug: String) -> Result<(), String> {
    open_picker_for_tag_slug(app, slug)
}

#[cfg(not(test))]
#[tauri::command]
fn list_script_action_diagnostics(
    storage: State<'_, storage::AppStorage>,
) -> Result<Vec<storage::CachedScriptDiagnostic>, String> {
    storage.list_cached_script_diagnostics()
}

#[cfg(not(test))]
#[tauri::command]
fn run_action(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    storage: State<'_, storage::AppStorage>,
    suppression: State<'_, clipboard::SelfWriteSuppression>,
    previous_window: State<'_, window_focus::PreviousWindow>,
    request: actions::RunActionRequest,
) -> actions::ActionRunResult {
    actions::run_action(
        &app,
        Some(&window),
        &storage,
        &suppression,
        &previous_window,
        request,
    )
}

#[cfg(not(test))]
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct CompoundHotkeyStepRequest {
    shortcut: String,
}

#[cfg(not(test))]
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct CompoundHotkeyStepResponse {
    handled: bool,
    pending: bool,
    executed: bool,
    diagnostic: Option<String>,
}

#[cfg(not(test))]
#[tauri::command]
fn handle_compound_hotkey_step(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    runtime: State<'_, CompoundShortcutRuntime>,
    request: CompoundHotkeyStepRequest,
) -> CompoundHotkeyStepResponse {
    if let Err(error) = require_surface_window(
        &window,
        &[WHICHKEY_WINDOW_LABEL],
        "handle_compound_hotkey_step",
    ) {
        return CompoundHotkeyStepResponse {
            handled: false,
            pending: false,
            executed: false,
            diagnostic: Some(error),
        };
    }
    eprintln!("compound shortcut step requested: {}", request.shortcut);
    let step = match hotkeys::HotkeyStep::parse(&request.shortcut) {
        Ok(step) => step,
        Err(error) => {
            eprintln!("compound shortcut step parse failed: {error}");
            runtime.clear_pending();
            return CompoundHotkeyStepResponse {
                handled: false,
                pending: false,
                executed: false,
                diagnostic: Some(error),
            };
        }
    };

    clear_compound_temporary_shortcuts(&app, &runtime);
    match runtime.advance(step) {
        CompoundShortcutOutcome::Pending => {
            if let Some(pending_info) = runtime.pending_info() {
                if ENABLE_COMPOUND_TEMPORARY_NEXT_STEPS {
                    register_compound_temporary_next_steps(&app, &runtime, &pending_info);
                    let _ = app.emit(COMPOUND_HOTKEY_PENDING_EVENT, pending_info);
                }
            }
            CompoundHotkeyStepResponse {
                handled: true,
                pending: true,
                executed: false,
                diagnostic: None,
            }
        }
        CompoundShortcutOutcome::Matched(route, shortcut_label) => {
            execute_shortcut_route(app, route, shortcut_label);
            CompoundHotkeyStepResponse {
                handled: true,
                pending: false,
                executed: true,
                diagnostic: None,
            }
        }
        CompoundShortcutOutcome::Expired => CompoundHotkeyStepResponse {
            handled: true,
            pending: false,
            executed: false,
            diagnostic: Some("compound shortcut expired".to_string()),
        },
        CompoundShortcutOutcome::NoMatch => CompoundHotkeyStepResponse {
            handled: false,
            pending: false,
            executed: false,
            diagnostic: Some("compound shortcut did not match".to_string()),
        },
        CompoundShortcutOutcome::Idle => CompoundHotkeyStepResponse {
            handled: false,
            pending: false,
            executed: false,
            diagnostic: None,
        },
    }
}

#[cfg(not(test))]
#[tauri::command]
fn clear_compound_hotkey_pending(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    runtime: State<'_, CompoundShortcutRuntime>,
) {
    if let Err(error) = require_surface_window(
        &window,
        &[WHICHKEY_WINDOW_LABEL],
        "clear_compound_hotkey_pending",
    ) {
        eprintln!("{error}");
        return;
    }
    eprintln!("compound shortcut pending clear requested by command");
    clear_compound_temporary_shortcuts(&app, &runtime);
    runtime.clear_pending();
}

#[cfg(not(test))]
fn clear_compound_hotkey_pending_for_app<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    if let Some(runtime) = app.try_state::<CompoundShortcutRuntime>() {
        eprintln!("compound shortcut pending clear requested by app");
        clear_compound_temporary_shortcuts(app, &runtime);
        runtime.clear_pending();
    }
}

#[cfg(not(test))]
#[tauri::command]
fn get_compound_hotkey_pending(
    window: tauri::WebviewWindow,
    runtime: State<'_, CompoundShortcutRuntime>,
) -> Option<CompoundShortcutPendingInfo> {
    if let Err(error) = require_surface_window(
        &window,
        &[MAIN_WINDOW_LABEL, WHICHKEY_WINDOW_LABEL],
        "get_compound_hotkey_pending",
    ) {
        eprintln!("{error}");
        return None;
    }
    runtime.pending_info()
}

#[cfg(not(test))]
#[tauri::command]
fn hide_whichkey_window(window: tauri::WebviewWindow) -> Result<(), String> {
    if window.label() != WHICHKEY_WINDOW_LABEL {
        return Err("hide_whichkey_window can only be called from whichkey".to_string());
    }
    window
        .destroy()
        .map_err(|error| format!("whichkey window destroy failed: {error}"))
}

#[cfg(not(test))]
#[tauri::command]
fn activate_item(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    storage: State<'_, storage::AppStorage>,
    suppression: State<'_, clipboard::SelfWriteSuppression>,
    previous_window: State<'_, window_focus::PreviousWindow>,
    request: host::ActivateItemRequest,
) -> Result<(), String> {
    require_surface_window(&window, &[MAIN_WINDOW_LABEL], "activate_item")?;
    host::activate_item(
        &app,
        Some(&window),
        &storage,
        &suppression,
        &previous_window,
        request,
    )
}

#[cfg(not(test))]
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    if event.state == ShortcutState::Pressed {
                        handle_global_shortcut(app, shortcut);
                    }
                })
                .build(),
        )
        .on_window_event(|window, event| {
            match window.label() {
                MAIN_WINDOW_LABEL => match event {
                    WindowEvent::CloseRequested { api, .. } => {
                        diag_log("window.event", "main close requested");
                        api.prevent_close();
                        save_window_bounds_from_event(window);
                        if let Err(error) = window.hide() {
                            eprintln!("window hide on close failed: {error}");
                        }
                    }
                    WindowEvent::Focused(true)
                    | WindowEvent::Moved(_)
                    | WindowEvent::Resized(_) => {
                        diag_log("window.event", format!("main {event:?}"));
                        if matches!(event, WindowEvent::Moved(_) | WindowEvent::Resized(_)) {
                            save_window_bounds_from_event(window);
                        }
                        if matches!(event, WindowEvent::Focused(true))
                            && window
                                .app_handle()
                                .try_state::<InitialMainWindowHide>()
                                .map(|policy| policy.hide_now(window, "initial focus"))
                                .unwrap_or(false)
                        {
                            return;
                        }
                        let focus_policy = window.app_handle().state::<PickerFocusPolicy>();
                        focus_policy.cancel_pending_hide();
                    }
                    WindowEvent::Focused(false) if should_hide_on_focus_lost(window) => {
                        diag_log("window.event", "main focused false schedule hide");
                        save_window_bounds_from_event(window);
                        let focus_policy = window.app_handle().state::<PickerFocusPolicy>();
                        focus_policy.schedule_hide(window.clone());
                    }
                    WindowEvent::Focused(false) => {
                        diag_log("window.event", "main focused false hide disabled");
                        save_window_bounds_from_event(window);
                    }
                    _ => {}
                },
                SETTINGS_WINDOW_LABEL => match event {
                    WindowEvent::CloseRequested { api, .. } => {
                        diag_log("window.event", "settings close requested");
                        api.prevent_close();
                        save_window_bounds_from_event(window);
                        if let Err(error) = window.hide() {
                            eprintln!("settings window hide on close failed: {error}");
                        }
                    }
                    WindowEvent::Moved(_)
                    | WindowEvent::Resized(_)
                    | WindowEvent::Focused(false) => {
                        save_window_bounds_from_event(window);
                    }
                    _ => {}
                },
                AI_OUTPUT_WINDOW_LABEL => match event {
                    WindowEvent::CloseRequested { .. }
                    | WindowEvent::Moved(_)
                    | WindowEvent::Resized(_)
                    | WindowEvent::Focused(false) => {
                        save_window_bounds_from_event(window);
                    }
                    _ => {}
                },
                METADATA_WINDOW_LABEL => match event {
                    WindowEvent::CloseRequested { api, .. } => {
                        diag_log("window.event", "metadata close requested");
                        api.prevent_close();
                        save_window_bounds_from_event(window);
                        if let Err(error) = window.hide() {
                            eprintln!("metadata window hide on close failed: {error}");
                        }
                    }
                    WindowEvent::Moved(_)
                    | WindowEvent::Resized(_)
                    | WindowEvent::Focused(false) => {
                        save_window_bounds_from_event(window);
                    }
                    _ => {}
                },
                WHICHKEY_WINDOW_LABEL => match event {
                    WindowEvent::CloseRequested { api, .. } => {
                        diag_log("window.event", "whichkey close requested");
                        clear_compound_hotkey_pending_for_app(window.app_handle());
                        let _ = api;
                    }
                    WindowEvent::Focused(false) => {
                        diag_log("window.event", "whichkey focused false");
                    }
                    _ => {}
                },
                _ => {}
            };
        })
        .on_menu_event(|app, event| match event.id().as_ref() {
            TRAY_TOGGLE_ID => {
                spawn_toggle_main_window(app.clone());
            }
            TRAY_SETTINGS_ID => {
                spawn_open_settings_window(app.clone());
            }
            TRAY_EDIT_SCRIPTS_ID => {
                let result = app
                    .try_state::<storage::AppStorage>()
                    .ok_or_else(|| "app storage not available".to_string())
                    .and_then(|storage| {
                        script_editor::open_scripts_folder_in_vscode(app, &storage)
                    });
                if let Err(error) = result {
                    emit_toast_on_main_thread(
                        app.clone(),
                        actions::ActionToast {
                            title: Some("Edit scripts".to_string()),
                            message: error,
                            tone: actions::ToastTone::Warning,
                            duration_ms: Some(4_500),
                        },
                        "tray edit scripts",
                    );
                }
            }
            TRAY_QUIT_ID => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                eprintln!("tray left click: toggle main window requested");
                spawn_toggle_main_window(tray.app_handle().clone());
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_capture_stats,
            get_capture_snapshot,
            get_clipboard_probe,
            get_main_window_pin_state,
            set_main_window_pin_state,
            get_app_about_info,
            get_app_shortcut_status,
            list_recent_items,
            search_items,
            list_history_page,
            history_search,
            show_picker,
            hide_picker,
            consume_picker_session_snapshot,
            open_settings_window,
            hide_whichkey_window,
            close_settings_window,
            position_notifications_window,
            record_renderer_diagnostic,
            open_markdown_output,
            open_metadata_window,
            pending_metadata_editor,
            close_metadata_window,
            pending_ai_output,
            copy_markdown_output,
            add_markdown_output_to_history,
            export_markdown_output,
            resolve_ui_host_request,
            pending_ui_host_request,
            write_history_item,
            mark_history_item_used,
            set_history_items_marked,
            set_history_query_marked,
            clear_marked_history_items,
            count_marked_history_items,
            update_history_item,
            create_history_item,
            delete_history_item,
            get_history_item,
            get_settings,
            update_settings,
            set_picker_keep_open,
            edit_scripts_in_vscode,
            edit_script_in_vscode,
            list_tags,
            create_tag,
            update_tag_config,
            open_picker_for_tag,
            normalize_hotkey_sequence,
            set_item_tags,
            list_builtin_actions,
            list_actions,
            refresh_script_action_cache,
            list_script_action_diagnostics,
            run_action,
            handle_compound_hotkey_step,
            clear_compound_hotkey_pending,
            get_compound_hotkey_pending,
            ai_script_run,
            activate_item
        ])
        .setup(|app| {
            app.handle().plugin(tauri_plugin_autostart::init(
                MacosLauncher::LaunchAgent,
                None,
            ))?;
            app.handle().plugin(tauri_plugin_dialog::init())?;
            setup_tray(app)?;
            log_shortcut_registration(app);
            let app_data_dir = std::env::var_os("COPICU_APP_DATA_DIR")
                .map(std::path::PathBuf::from)
                .map(Ok)
                .unwrap_or_else(|| {
                    app.path()
                        .app_data_dir()
                        .map_err(|error| tauri::Error::Anyhow(error.into()))
                })?;
            let storage = storage::AppStorage::open(&app_data_dir)
                .map_err(|error| tauri::Error::Anyhow(std::io::Error::other(error).into()))?;
            dev_log(format_args!(
                "sqlite storage ready: {}",
                storage.db_path().display()
            ));
            let window_registry = window_state::WindowStateRegistry::open(app_data_dir.clone());

            app.manage(PickerFocusPolicy::default());
            app.manage(PickerSessionController::default());
            let initial_main_window_hide = InitialMainWindowHide::default();
            app.manage(initial_main_window_hide.clone());
            app.manage(GlobalScriptShortcuts::default());
            app.manage(CompoundShortcutRuntime::default());
            app.manage(CurrentPickerShortcut::default());
            app.manage(CurrentPickerPinShortcut::default());
            app.manage(ui_host::UiHostState::default());
            app.manage(AiOutputState::default());
            app.manage(MetadataEditorState::default());
            app.manage(window_registry.clone());
            app.manage(storage.clone());
            let suppression = clipboard::SelfWriteSuppression::default();
            app.manage(suppression.clone());
            let previous_window = window_focus::PreviousWindow::default();
            if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
                if let Err(error) = initialize_picker_window(&window) {
                    eprintln!("picker window configuration failed: {error}");
                }
                if let Err(error) =
                    window_registry.restore(&window, window_state::RestoreTarget::LastMonitor)
                {
                    eprintln!("picker window state restore failed: {error}");
                }
                log_main_window_startup_state(&window);
                initial_main_window_hide.schedule(window.clone());
                schedule_dev_empty_root_recovery(window.clone());
                if let Err(error) = previous_window.register_own_window(&window) {
                    eprintln!("own window registration failed: {error}");
                }
            }
            previous_window.spawn_foreground_tracker();
            app.manage(previous_window.clone());
            if std::env::var_os("COPICU_DISABLE_CLIPBOARD_WATCHER").is_some() {
                eprintln!("clipboard watcher disabled by COPICU_DISABLE_CLIPBOARD_WATCHER");
            } else {
                match clipboard::spawn_text_watcher(
                    app.handle().clone(),
                    storage.clone(),
                    suppression,
                    previous_window,
                ) {
                    Ok(capture) => {
                        app.manage(capture);
                    }
                    Err(error) => eprintln!("clipboard watcher failed to start: {error}"),
                }
            }
            if let Err(error) = actions::refresh_script_action_cache(&storage) {
                eprintln!("script action startup refresh failed: {error}");
            }
            if let Err(error) = refresh_global_shortcuts_from_storage(app.handle(), &storage) {
                eprintln!("global shortcut registration failed: {error}");
            }
            if std::env::var_os("COPICU_TAURI_DEV").is_some() {
                diag_log("metadata.prewarm.skip", "tauri_dev_vite");
            } else {
                spawn_prewarm_metadata_window(app.handle().clone());
            }
            spawn_script_action_refresh(app.handle().clone(), storage);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Copicu");
}

#[cfg(not(test))]
fn setup_notifications_window<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Result<(), String> {
    if app.get_webview_window(NOTIFICATIONS_WINDOW_LABEL).is_none() {
        build_surface_window(app, NOTIFICATIONS_WINDOW_LABEL)?;
    }

    position_notifications_window_for_monitor(app)?;
    Ok(())
}

#[cfg(not(test))]
fn spawn_prewarm_metadata_window<R: tauri::Runtime + 'static>(app: tauri::AppHandle<R>) {
    thread::spawn(move || {
        thread::sleep(METADATA_PREWARM_DELAY);
        let app_for_main_thread = app.clone();
        if let Err(error) = app.run_on_main_thread(move || {
            if app_for_main_thread
                .get_webview_window(METADATA_WINDOW_LABEL)
                .is_some()
            {
                diag_log("metadata.prewarm.skip", "already_exists");
                return;
            }

            let started_at = Instant::now();
            diag_log("metadata.prewarm.start", "label=metadata");
            let window = match build_surface_window(&app_for_main_thread, METADATA_WINDOW_LABEL) {
                Ok(window) => window,
                Err(error) => {
                    eprintln!("metadata prewarm build failed: {error}");
                    diag_log("metadata.prewarm.failed", error);
                    return;
                }
            };

            if let Some(registry) =
                app_for_main_thread.try_state::<window_state::WindowStateRegistry>()
            {
                if let Err(error) =
                    registry.restore(&window, window_state::RestoreTarget::LastMonitor)
                {
                    eprintln!("metadata prewarm restore failed: {error}");
                }
            }
            if let Err(error) = window.hide() {
                eprintln!("metadata prewarm hide failed: {error}");
            }

            diag_log(
                "metadata.prewarm.done",
                format!(
                    "elapsed_ms={} visible={}",
                    started_at.elapsed().as_millis(),
                    window.is_visible().unwrap_or(false)
                ),
            );
        }) {
            eprintln!("metadata prewarm dispatch failed: {error}");
        }
    });
}

#[cfg(not(test))]
fn open_settings_window_on_main_thread<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> Result<(), String> {
    let window = match app.get_webview_window(SETTINGS_WINDOW_LABEL) {
        Some(window) => window,
        None => build_surface_window(app, SETTINGS_WINDOW_LABEL)?,
    };

    if let Some(registry) = app.try_state::<window_state::WindowStateRegistry>() {
        registry
            .restore(&window, window_state::RestoreTarget::LastMonitor)
            .map_err(|error| format!("settings window state restore failed: {error}"))?;
    }
    window
        .show()
        .map_err(|error| format!("settings window show failed: {error}"))?;
    window
        .unminimize()
        .map_err(|error| format!("settings window unminimize failed: {error}"))?;
    window
        .set_focus()
        .map_err(|error| format!("settings window focus failed: {error}"))?;
    Ok(())
}

#[cfg(not(test))]
#[allow(dead_code)]
fn open_whichkey_window_on_main_thread<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(WHICHKEY_WINDOW_LABEL) {
        window
            .destroy()
            .map_err(|error| format!("whichkey stale window destroy failed: {error}"))?;
    }

    let window = build_surface_window(app, WHICHKEY_WINDOW_LABEL)?;

    let previous_window = app.state::<window_focus::PreviousWindow>();
    if let Err(error) = previous_window.remember_foreground_excluding(Some(&window)) {
        eprintln!("previous window remember for whichkey failed: {error}");
    }

    position_whichkey_window_for_monitor(app, &window)?;
    window
        .show()
        .map_err(|error| format!("whichkey window show failed: {error}"))?;
    window
        .set_always_on_top(true)
        .map_err(|error| format!("whichkey window always-on-top failed: {error}"))?;
    window
        .unminimize()
        .map_err(|error| format!("whichkey window unminimize failed: {error}"))?;
    window
        .set_focus()
        .map_err(|error| format!("whichkey window focus failed: {error}"))?;
    if !window.is_focused().unwrap_or(false) {
        if let Err(error) = window_focus::focus_tauri_window(&window) {
            eprintln!("whichkey native focus failed: {error}");
        }
    }
    Ok(())
}

#[cfg(not(test))]
pub(crate) fn open_ai_output_window<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    payload: MarkdownOutputPayload,
) -> Result<(), String> {
    if let Some(state) = app.try_state::<AiOutputState>() {
        state.set_latest(payload.clone())?;
    }

    let window = match app.get_webview_window(AI_OUTPUT_WINDOW_LABEL) {
        Some(window) => window,
        None => build_surface_window(app, AI_OUTPUT_WINDOW_LABEL)?,
    };

    if let Some(registry) = app.try_state::<window_state::WindowStateRegistry>() {
        registry
            .restore(&window, window_state::RestoreTarget::LastMonitor)
            .map_err(|error| format!("ai-output window state restore failed: {error}"))?;
    }
    window
        .show()
        .map_err(|error| format!("ai-output window show failed: {error}"))?;
    window
        .unminimize()
        .map_err(|error| format!("ai-output window unminimize failed: {error}"))?;
    window
        .set_focus()
        .map_err(|error| format!("ai-output window focus failed: {error}"))?;
    window
        .emit(AI_OUTPUT_OPEN_EVENT, payload)
        .map_err(|error| format!("ai-output emit failed: {error}"))?;
    Ok(())
}

#[cfg(not(test))]
fn open_metadata_editor_window<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    payload: MetadataEditorPayload,
) -> Result<(), String> {
    let started_at = Instant::now();
    let item_id = payload.item.id();
    let cache_hit = app.get_webview_window(METADATA_WINDOW_LABEL).is_some();
    diag_log(
        "metadata.open.backend.start",
        format!("item_id={} cache_hit={}", item_id, cache_hit),
    );
    if let Some(state) = app.try_state::<MetadataEditorState>() {
        state.set_latest(payload.clone())?;
        diag_log(
            "metadata.open.pending-set.done",
            format!(
                "item_id={} total_ms={}",
                item_id,
                started_at.elapsed().as_millis()
            ),
        );
    }

    let window = match app.get_webview_window(METADATA_WINDOW_LABEL) {
        Some(window) => window,
        None => build_surface_window(app, METADATA_WINDOW_LABEL)?,
    };
    diag_log(
        "metadata.open.window-ready",
        format!(
            "item_id={} cache_hit={} total_ms={}",
            item_id,
            cache_hit,
            started_at.elapsed().as_millis()
        ),
    );

    if let Some(registry) = app.try_state::<window_state::WindowStateRegistry>() {
        let restore_started_at = Instant::now();
        registry
            .restore(&window, window_state::RestoreTarget::LastMonitor)
            .map_err(|error| format!("metadata window state restore failed: {error}"))?;
        diag_log(
            "metadata.open.restore.done",
            format!(
                "item_id={} elapsed_ms={} total_ms={}",
                item_id,
                restore_started_at.elapsed().as_millis(),
                started_at.elapsed().as_millis()
            ),
        );
    }
    let show_started_at = Instant::now();
    window
        .show()
        .map_err(|error| format!("metadata window show failed: {error}"))?;
    diag_log(
        "metadata.open.show.done",
        format!(
            "item_id={} elapsed_ms={} total_ms={}",
            item_id,
            show_started_at.elapsed().as_millis(),
            started_at.elapsed().as_millis()
        ),
    );
    window
        .unminimize()
        .map_err(|error| format!("metadata window unminimize failed: {error}"))?;
    let focus_started_at = Instant::now();
    window
        .set_focus()
        .map_err(|error| format!("metadata window focus failed: {error}"))?;
    if !window.is_focused().unwrap_or(false) {
        if let Err(error) = window_focus::focus_tauri_window(&window) {
            eprintln!("metadata native focus failed: {error}");
        }
    }
    diag_log(
        "metadata.open.focus.done",
        format!(
            "item_id={} elapsed_ms={} total_ms={} focused={}",
            item_id,
            focus_started_at.elapsed().as_millis(),
            started_at.elapsed().as_millis(),
            window.is_focused().unwrap_or(false)
        ),
    );
    let emit_started_at = Instant::now();
    window
        .emit(METADATA_OPEN_EVENT, payload)
        .map_err(|error| format!("metadata emit failed: {error}"))?;
    diag_log(
        "metadata.open.emit.done",
        format!(
            "item_id={} elapsed_ms={} total_ms={}",
            item_id,
            emit_started_at.elapsed().as_millis(),
            started_at.elapsed().as_millis()
        ),
    );
    Ok(())
}

#[cfg(not(test))]
fn position_notifications_window_for_monitor<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> Result<(), String> {
    let Some(window) = app.get_webview_window(NOTIFICATIONS_WINDOW_LABEL) else {
        return Err("notifications window not found".to_string());
    };

    let monitor = app
        .get_webview_window(MAIN_WINDOW_LABEL)
        .and_then(|main| main.current_monitor().ok().flatten())
        .or_else(|| app.primary_monitor().ok().flatten());
    let Some(monitor) = monitor else {
        return Ok(());
    };

    let monitor_position = monitor.position();
    let monitor_size = monitor.size();
    let x = monitor_position.x + monitor_size.width as i32
        - NOTIFICATIONS_WINDOW_WIDTH as i32
        - NOTIFICATIONS_WINDOW_MARGIN;
    let y = monitor_position.y + NOTIFICATIONS_WINDOW_MARGIN;

    window
        .set_size(PhysicalSize::new(
            NOTIFICATIONS_WINDOW_WIDTH,
            NOTIFICATIONS_WINDOW_HEIGHT,
        ))
        .map_err(|error| format!("notifications window size failed: {error}"))?;
    window
        .set_position(PhysicalPosition::new(x, y))
        .map_err(|error| format!("notifications window position failed: {error}"))?;
    window
        .set_always_on_top(true)
        .map_err(|error| format!("notifications window always-on-top failed: {error}"))?;
    Ok(())
}

#[cfg(not(test))]
#[allow(dead_code)]
fn position_whichkey_window_for_monitor<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    window: &tauri::WebviewWindow<R>,
) -> Result<(), String> {
    let monitor = app
        .get_webview_window(MAIN_WINDOW_LABEL)
        .and_then(|main| main.current_monitor().ok().flatten())
        .or_else(|| app.primary_monitor().ok().flatten());
    let Some(monitor) = monitor else {
        return Ok(());
    };

    let monitor_position = monitor.position();
    let monitor_size = monitor.size();
    let surface = surface_registry::require(WHICHKEY_WINDOW_LABEL)?;
    let x = monitor_position.x + ((monitor_size.width.saturating_sub(surface.width)) / 2) as i32;
    let y = monitor_position.y + monitor_size.height as i32 - surface.height as i32 - 96;

    window
        .set_position(PhysicalPosition::new(x, y))
        .map_err(|error| format!("whichkey window position failed: {error}"))?;
    Ok(())
}

#[cfg(not(test))]
fn setup_tray(app: &mut tauri::App) -> tauri::Result<()> {
    let is_dev_profile = std::env::var_os("COPICU_APP_DATA_DIR").is_some();
    let app_label = if is_dev_profile {
        "Copicu Dev"
    } else {
        "Copicu"
    };
    let toggle_label = if is_dev_profile {
        "Toggle Copicu Dev"
    } else {
        "Toggle Copicu"
    };

    let toggle = MenuItem::with_id(app, TRAY_TOGGLE_ID, toggle_label, true, None::<&str>)?;
    let settings = MenuItem::with_id(app, TRAY_SETTINGS_ID, "Settings", true, None::<&str>)?;
    let edit_scripts = MenuItem::with_id(
        app,
        TRAY_EDIT_SCRIPTS_ID,
        "Edit scripts",
        true,
        None::<&str>,
    )?;
    let quit = MenuItem::with_id(app, TRAY_QUIT_ID, "Quit", true, None::<&str>)?;
    let primary_separator = PredefinedMenuItem::separator(app)?;
    let menu = Menu::with_items(
        app,
        &[&toggle, &settings, &edit_scripts, &primary_separator, &quit],
    )?;

    let mut tray_builder = TrayIconBuilder::with_id("main")
        .tooltip(app_label)
        .menu(&menu)
        .show_menu_on_left_click(false);

    if is_dev_profile {
        tray_builder = tray_builder.icon(tauri::include_image!("icons/tray-dev.png").clone());
    } else if let Some(icon) = app.default_window_icon() {
        tray_builder = tray_builder.icon(icon.clone());
    }

    tray_builder.build(app)?;
    Ok(())
}

#[cfg(not(test))]
fn show_main_window<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    remember_previous: bool,
) -> Result<(), String> {
    show_main_window_with_focus(app, remember_previous, true)
}

#[cfg(not(test))]
fn show_main_window_with_focus<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    remember_previous: bool,
    focus_window: bool,
) -> Result<(), String> {
    let started = Instant::now();
    diag_log(
        "window.show.start",
        format!("remember_previous={remember_previous} focus={focus_window}"),
    );
    let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) else {
        return Err("main window not found".to_string());
    };

    if remember_previous {
        let previous_window = app.state::<window_focus::PreviousWindow>();
        if let Err(error) = previous_window.remember_foreground_excluding(Some(&window)) {
            eprintln!("previous window remember failed: {error}");
        }
    }

    if let Some(initial_hide) = app.try_state::<InitialMainWindowHide>() {
        initial_hide.cancel();
    }

    if let Some(registry) = app.try_state::<window_state::WindowStateRegistry>() {
        if let Err(error) = registry.restore(&window, window_state::RestoreTarget::CursorMonitor) {
            eprintln!("main window state restore failed: {error}");
        }
    }
    if let Err(error) = window.show() {
        return Err(format!("window show failed: {error}"));
    }
    diag_log("window.show.step", "show ok");
    if let Err(error) = window.unminimize() {
        return Err(format!("window unminimize failed: {error}"));
    }
    diag_log("window.show.step", "unminimize ok");

    if focus_window {
        if let Err(error) = window.set_focus() {
            return Err(format!("window focus failed: {error}"));
        }
        diag_log("window.show.step", "set_focus requested");
        if !window.is_focused().unwrap_or(false) {
            if let Err(error) = window_focus::focus_tauri_window(&window) {
                eprintln!("window native focus failed: {error}");
            } else {
                diag_log("window.show.step", "native focus ok");
            }
        }
        if !window.is_focused().unwrap_or(false) {
            thread::sleep(Duration::from_millis(60));
            if let Err(error) = window.set_focus() {
                eprintln!("window delayed focus failed: {error}");
            } else {
                diag_log("window.show.step", "delayed set_focus requested");
            }
            if !window.is_focused().unwrap_or(false) {
                if let Err(error) = window_focus::focus_tauri_window(&window) {
                    eprintln!("window delayed native focus failed: {error}");
                } else {
                    diag_log("window.show.step", "delayed native focus ok");
                }
            }
        }
    } else {
        if let Err(error) = window_focus::show_tauri_window_no_activate(&window) {
            eprintln!("window no-activate show failed: {error}");
        } else {
            diag_log("window.show.step", "show no-activate ok");
        }
    }

    let visible = window.is_visible().unwrap_or(false);
    let focused = window.is_focused().unwrap_or(false);
    let position = window
        .outer_position()
        .map(|position| format!("{},{}", position.x, position.y))
        .unwrap_or_else(|error| format!("unknown:{error}"));
    let size = window
        .outer_size()
        .map(|size| format!("{}x{}", size.width, size.height))
        .unwrap_or_else(|error| format!("unknown:{error}"));
    eprintln!(
        "main window show ok: visible={visible} focused={focused} position={position} size={size}"
    );
    diag_log(
        "window.show.done",
        format!(
            "elapsed_ms={} visible={visible} focused={focused} position={position} size={size}",
            started.elapsed().as_millis()
        ),
    );

    Ok(())
}

#[cfg(not(test))]
fn initialize_picker_window<R: tauri::Runtime>(
    window: &tauri::WebviewWindow<R>,
) -> Result<(), String> {
    if let Some(registry) = window
        .app_handle()
        .try_state::<window_state::WindowStateRegistry>()
    {
        registry.apply_runtime_config(window)?;
    }
    window
        .set_always_on_top(false)
        .map_err(|error| format!("window initial always-on-top reset failed: {error}"))?;
    if let Some(storage) = window.app_handle().try_state::<storage::AppStorage>() {
        let settings = storage.get_settings()?;
        apply_picker_keep_open_policy_to_window(window, &settings)?;
    }
    Ok(())
}

#[cfg(not(test))]
fn apply_picker_keep_open_window_policy<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    settings: &storage::AppSettings,
) {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        if let Err(error) = apply_picker_keep_open_policy_to_window(&window, settings) {
            eprintln!("picker keep-open window policy failed: {error}");
        }
    }
}

#[cfg(not(test))]
fn apply_picker_keep_open_policy_to_window<R: tauri::Runtime>(
    window: &tauri::WebviewWindow<R>,
    settings: &storage::AppSettings,
) -> Result<(), String> {
    let keep_open = !settings.picker.hide_on_focus_lost;
    let skip_taskbar = !keep_open;
    window
        .set_skip_taskbar(skip_taskbar)
        .map_err(|error| format!("picker skip-taskbar policy failed: {error}"))?;
    diag_log(
        "picker.keep_open.window_policy",
        format!("keep_open={keep_open} skip_taskbar={skip_taskbar}"),
    );
    Ok(())
}

#[cfg(not(test))]
fn save_window_bounds_from_event<R: tauri::Runtime>(window: &tauri::Window<R>) {
    if let Some(registry) = window
        .app_handle()
        .try_state::<window_state::WindowStateRegistry>()
    {
        if let Err(error) = registry.save_from_window_event(window) {
            eprintln!("window state save failed: {error}");
        }
    }
}

#[cfg(not(test))]
fn log_main_window_startup_state<R: tauri::Runtime>(window: &tauri::WebviewWindow<R>) {
    let visible = window.is_visible().unwrap_or(false);
    let focused = window.is_focused().unwrap_or(false);
    let always_on_top = window.is_always_on_top().unwrap_or(false);
    dev_log(format_args!(
        "main window startup state: visible={visible} focused={focused} always_on_top={always_on_top}"
    ));
    diag_log(
        "window.startup",
        format!("visible={visible} focused={focused} always_on_top={always_on_top}"),
    );
}

#[cfg(all(not(test), debug_assertions))]
fn schedule_dev_empty_root_recovery<R: tauri::Runtime + 'static>(_window: tauri::WebviewWindow<R>) {
}

#[cfg(any(test, not(debug_assertions)))]
fn schedule_dev_empty_root_recovery<R: tauri::Runtime + 'static>(_window: tauri::WebviewWindow<R>) {
}

#[cfg(not(test))]
fn should_hide_on_focus_lost<R: tauri::Runtime>(window: &tauri::Window<R>) -> bool {
    if window.is_always_on_top().unwrap_or(false) {
        return false;
    }

    window
        .app_handle()
        .try_state::<storage::AppStorage>()
        .and_then(|storage| storage.get_settings().ok())
        .map(|settings| settings.picker.hide_on_focus_lost)
        .unwrap_or(true)
}

#[cfg(not(test))]
fn apply_autostart_setting<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    enabled: bool,
) -> Result<(), String> {
    let autostart = app.autolaunch();
    if enabled {
        autostart
            .enable()
            .map_err(|error| format!("failed to enable launch on startup: {error}"))?;
    } else {
        let was_enabled = autostart.is_enabled().unwrap_or(false);
        if !was_enabled {
            return Ok(());
        }
        if let Err(error) = autostart.disable() {
            if !autostart.is_enabled().unwrap_or(false) {
                return Ok(());
            }
            return Err(format!("failed to disable launch on startup: {error}"));
        }
    }
    Ok(())
}

#[cfg(test)]
fn apply_autostart_setting<R: tauri::Runtime>(
    _app: &tauri::AppHandle<R>,
    _enabled: bool,
) -> Result<(), String> {
    Ok(())
}

#[cfg(not(test))]
fn toggle_main_window<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Result<(), String> {
    let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) else {
        return Err("main window not found".to_string());
    };

    diag_log(
        "window.toggle",
        format!("visible={}", window.is_visible().unwrap_or(false)),
    );
    if window.is_visible().unwrap_or(false) {
        host::hide_picker(&window)?;
        eprintln!("main window toggle ok: hidden");
        diag_log("window.toggle", "hidden");
        return Ok(());
    }

    show_main_window(app, true)
}

#[cfg(not(test))]
fn toggle_main_window_without_focus<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> Result<(), String> {
    let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) else {
        return Err("main window not found".to_string());
    };
    let visible = window.is_visible().unwrap_or(false);
    let focused = window.is_focused().unwrap_or(false);
    let foreground = visible && (focused || window_focus::is_tauri_window_foreground(&window));

    diag_log(
        "window.toggle.no_focus",
        format!("visible={visible} focused={focused} foreground={foreground}"),
    );
    if visible {
        let pinned = window.is_always_on_top().unwrap_or(false);
        let keep_open = app
            .try_state::<storage::AppStorage>()
            .and_then(|storage| storage.get_settings().ok())
            .map(|settings| !settings.picker.hide_on_focus_lost)
            .unwrap_or(false);
        if (pinned || keep_open) && !focused {
            eprintln!("main window no-focus toggle ok: focused persistent picker");
            diag_log(
                "window.toggle.no_focus",
                format!(
                    "focus persistent focused={focused} foreground={foreground} pinned={pinned} keep_open={keep_open}"
                ),
            );
            return show_main_window_with_focus(app, true, true);
        }

        host::hide_picker(&window)?;
        eprintln!("main window no-focus toggle ok: hidden");
        diag_log(
            "window.toggle.no_focus",
            format!(
                "hidden focused={focused} foreground={foreground} pinned={pinned} keep_open={keep_open}"
            ),
        );
        return Ok(());
    }

    show_main_window_with_focus(app, true, false)
}

#[cfg(not(test))]
fn toggle_main_window_pin<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Result<(), String> {
    let window = app
        .get_webview_window(MAIN_WINDOW_LABEL)
        .ok_or_else(|| "main window not available".to_string())?;
    let next_pinned = !window
        .is_always_on_top()
        .map_err(|error| format!("failed to read main window pin state: {error}"))?;
    window
        .set_always_on_top(next_pinned)
        .map_err(|error| format!("failed to set main window pin state: {error}"))?;
    emit_picker_pin_state(app, next_pinned);
    Ok(())
}

#[cfg(not(test))]
fn spawn_open_settings_window<R: tauri::Runtime + 'static>(app: tauri::AppHandle<R>) {
    thread::spawn(move || {
        thread::sleep(NATIVE_WINDOW_TASK_DELAY);
        let app_for_main_thread = app.clone();
        if let Err(error) = app.run_on_main_thread(move || {
            if let Err(error) = open_settings_window_on_main_thread(&app_for_main_thread) {
                eprintln!("{error}");
            }
        }) {
            eprintln!("settings window dispatch failed: {error}");
        }
    });
}

#[cfg(not(test))]
fn spawn_toggle_main_window<R: tauri::Runtime + 'static>(app: tauri::AppHandle<R>) {
    thread::spawn(move || {
        thread::sleep(NATIVE_WINDOW_TASK_DELAY);
        let app_for_main_thread = app.clone();
        if let Err(error) = app.run_on_main_thread(move || {
            if let Err(error) = toggle_main_window(&app_for_main_thread) {
                eprintln!("{error}");
            }
        }) {
            eprintln!("main window toggle dispatch failed: {error}");
        }
    });
}

#[cfg(not(test))]
fn spawn_toggle_main_window_without_focus<R: tauri::Runtime + 'static>(app: tauri::AppHandle<R>) {
    thread::spawn(move || {
        thread::sleep(NATIVE_WINDOW_TASK_DELAY);
        let app_for_main_thread = app.clone();
        if let Err(error) = app.run_on_main_thread(move || {
            if let Err(error) = toggle_main_window_without_focus(&app_for_main_thread) {
                eprintln!("{error}");
            }
        }) {
            eprintln!("main window no-focus toggle dispatch failed: {error}");
        }
    });
}

#[cfg(not(test))]
fn spawn_toggle_main_window_pin<R: tauri::Runtime + 'static>(app: tauri::AppHandle<R>) {
    thread::spawn(move || {
        thread::sleep(NATIVE_WINDOW_TASK_DELAY);
        let app_for_main_thread = app.clone();
        if let Err(error) = app.run_on_main_thread(move || {
            if let Err(error) = toggle_main_window_pin(&app_for_main_thread) {
                eprintln!("{error}");
            }
        }) {
            eprintln!("main window pin toggle dispatch failed: {error}");
        }
    });
}

#[cfg(not(test))]
fn handle_global_shortcut<R: tauri::Runtime + 'static>(
    app: &tauri::AppHandle<R>,
    shortcut: &Shortcut,
) {
    if let Some(step) = app
        .try_state::<CompoundShortcutRuntime>()
        .and_then(|runtime| runtime.temporary_step_for_shortcut(shortcut))
    {
        eprintln!("compound shortcut temporary step pressed: {shortcut:?}");
        if let Some(runtime) = app.try_state::<CompoundShortcutRuntime>() {
            let runtime = runtime.inner().clone();
            let app: tauri::AppHandle<R> = app.clone();
            thread::spawn(move || {
                thread::sleep(NATIVE_WINDOW_TASK_DELAY);
                clear_compound_temporary_shortcuts(&app, &runtime);
                handle_compound_shortcut_outcome(&app, runtime.advance(step));
            });
        }
        return;
    }

    let picker_shortcut = app
        .try_state::<CurrentPickerShortcut>()
        .map(|current| current.get())
        .unwrap_or_else(picker_shortcut);
    if *shortcut == picker_shortcut {
        eprintln!("global shortcut pressed: {shortcut:?}");
        if std::env::var_os("COPICU_PICKER_NO_ACTIVATE").is_some() {
            spawn_toggle_main_window_without_focus(app.clone());
        } else {
            spawn_toggle_main_window(app.clone());
        }
        return;
    }

    if app
        .try_state::<CurrentPickerPinShortcut>()
        .and_then(|current| current.get())
        .is_some_and(|pin_shortcut| *shortcut == pin_shortcut)
    {
        eprintln!("picker pin shortcut pressed: {shortcut:?}");
        spawn_toggle_main_window_pin(app.clone());
        return;
    }

    let Some(shortcut_action) = app
        .try_state::<GlobalScriptShortcuts>()
        .and_then(|shortcuts| shortcuts.action_for(shortcut))
    else {
        if let Some(pending_info) = app
            .try_state::<CompoundShortcutRuntime>()
            .and_then(|runtime| runtime.begin_for_shortcut(shortcut))
        {
            eprintln!("compound shortcut prefix pressed: {shortcut:?}");
            if let Some(runtime) = app.try_state::<CompoundShortcutRuntime>() {
                let runtime = runtime.inner().clone();
                let app: tauri::AppHandle<R> = app.clone();
                let pending_info_for_thread = pending_info.clone();
                thread::spawn(move || {
                    if ENABLE_COMPOUND_TEMPORARY_NEXT_STEPS {
                        register_compound_temporary_next_steps(
                            &app,
                            &runtime,
                            &pending_info_for_thread,
                        );
                    } else {
                        thread::sleep(NATIVE_WINDOW_TASK_DELAY);
                        let app_for_main_thread = app.clone();
                        if let Err(error) = app.run_on_main_thread(move || {
                            if let Err(error) = show_main_window(&app_for_main_thread, true) {
                                eprintln!("{error}");
                            }
                        }) {
                            eprintln!("compound main window show dispatch failed: {error}");
                        }
                        thread::sleep(Duration::from_millis(120));
                    }
                    if ENABLE_COMPOUND_TEMPORARY_NEXT_STEPS {
                        emit_compound_pending_on_main_thread(app, pending_info_for_thread);
                    }
                });
            } else {
                if ENABLE_COMPOUND_TEMPORARY_NEXT_STEPS {
                    emit_compound_pending_on_main_thread(app.clone(), pending_info);
                }
            }
            return;
        }
        eprintln!("unmapped global shortcut pressed: {shortcut:?}");
        return;
    };

    let app = app.clone();
    thread::spawn(move || run_global_script_shortcut(app, shortcut_action));
}

#[cfg(not(test))]
impl GlobalScriptShortcuts {
    fn current_shortcuts(&self) -> Vec<Shortcut> {
        self.actions_by_shortcut
            .lock()
            .map(|current| current.keys().copied().collect())
            .unwrap_or_default()
    }

    fn replace(&self, next: HashMap<Shortcut, GlobalScriptShortcutAction>) {
        match self.actions_by_shortcut.lock() {
            Ok(mut current) => {
                *current = next;
            }
            Err(_) => eprintln!("global script shortcuts mutex poisoned"),
        }
    }

    fn action_for(&self, shortcut: &Shortcut) -> Option<GlobalScriptShortcutAction> {
        self.actions_by_shortcut
            .lock()
            .ok()
            .and_then(|current| current.get(shortcut).cloned())
    }
}

#[cfg(not(test))]
enum CompoundShortcutOutcome {
    Idle,
    Pending,
    Matched(hotkeys::ShortcutRoute, String),
    NoMatch,
    Expired,
}

#[cfg(not(test))]
impl CompoundShortcutRuntime {
    fn replace(
        &self,
        registry: hotkeys::ShortcutRegistry,
        prefixes_by_shortcut: HashMap<Shortcut, hotkeys::HotkeySequence>,
    ) {
        match self.state.lock() {
            Ok(mut state) => {
                state.registry = registry;
                state.prefixes_by_shortcut = prefixes_by_shortcut;
                state.temporary_next_steps_by_shortcut.clear();
                if state.pending.is_none() {
                    state.pending_generation = state.pending_generation.wrapping_add(1);
                }
            }
            Err(_) => eprintln!("compound shortcut runtime mutex poisoned"),
        }
    }

    fn current_prefix_shortcuts(&self) -> Vec<Shortcut> {
        self.state
            .lock()
            .map(|state| state.prefixes_by_shortcut.keys().copied().collect())
            .unwrap_or_default()
    }

    fn begin_for_shortcut(&self, shortcut: &Shortcut) -> Option<CompoundShortcutPendingInfo> {
        let now = Instant::now();
        let result = match self.state.lock() {
            Ok(mut state) => {
                let Some(prefix) = state.prefixes_by_shortcut.get(shortcut).cloned() else {
                    return None;
                };
                state.pending_generation = state.pending_generation.wrapping_add(1);
                let generation = state.pending_generation;
                let entries = state.whichkey_entries(&prefix);
                let next_steps = entries.iter().map(|entry| entry.key.clone()).collect();
                let info = CompoundShortcutPendingInfo {
                    prefix_label: prefix.to_string(),
                    next_steps,
                    entries,
                    expires_at_unix_ms: unix_ms_after(COMPOUND_HOTKEY_STEP_TIMEOUT),
                };
                state.pending = Some(PendingCompoundShortcut {
                    prefix,
                    started_at: now,
                    updated_at: now,
                    generation,
                });
                Some((info, generation))
            }
            Err(_) => {
                eprintln!("compound shortcut runtime mutex poisoned");
                None
            }
        };

        result.map(|(info, _generation)| info)
    }

    fn temporary_step_for_shortcut(&self, shortcut: &Shortcut) -> Option<hotkeys::HotkeyStep> {
        self.state.lock().ok().and_then(|state| {
            state
                .temporary_next_steps_by_shortcut
                .get(shortcut)
                .cloned()
        })
    }

    fn replace_temporary_next_steps(
        &self,
        next_steps_by_shortcut: HashMap<Shortcut, hotkeys::HotkeyStep>,
    ) {
        match self.state.lock() {
            Ok(mut state) => {
                state.temporary_next_steps_by_shortcut = next_steps_by_shortcut;
            }
            Err(_) => eprintln!("compound shortcut runtime mutex poisoned"),
        }
    }

    fn take_temporary_next_step_shortcuts(&self) -> Vec<Shortcut> {
        match self.state.lock() {
            Ok(mut state) => {
                let shortcuts = state
                    .temporary_next_steps_by_shortcut
                    .keys()
                    .copied()
                    .collect::<Vec<_>>();
                state.temporary_next_steps_by_shortcut.clear();
                shortcuts
            }
            Err(_) => {
                eprintln!("compound shortcut runtime mutex poisoned");
                Vec::new()
            }
        }
    }

    fn current_pending_generation(&self) -> Option<u64> {
        self.state
            .lock()
            .ok()
            .and_then(|state| state.pending.as_ref().map(|pending| pending.generation))
    }

    fn advance(&self, step: hotkeys::HotkeyStep) -> CompoundShortcutOutcome {
        let now = Instant::now();
        match self.state.lock() {
            Ok(mut state) => {
                let Some(pending) = state.pending.clone() else {
                    return CompoundShortcutOutcome::Idle;
                };
                if now.duration_since(pending.updated_at) > COMPOUND_HOTKEY_STEP_TIMEOUT {
                    state.pending = None;
                    state.temporary_next_steps_by_shortcut.clear();
                    return CompoundShortcutOutcome::Expired;
                }

                let next_prefix = pending.prefix.prefixed_with(step);
                if let Some(route) = state.registry.resolve(&next_prefix).cloned() {
                    state.pending = None;
                    state.temporary_next_steps_by_shortcut.clear();
                    return CompoundShortcutOutcome::Matched(route, next_prefix.to_string());
                }

                if state
                    .registry
                    .next_steps(&next_prefix)
                    .is_some_and(|steps| !steps.is_empty())
                {
                    state.pending = Some(PendingCompoundShortcut {
                        prefix: next_prefix,
                        started_at: pending.started_at,
                        updated_at: now,
                        generation: pending.generation,
                    });
                    return CompoundShortcutOutcome::Pending;
                }

                state.pending = None;
                state.temporary_next_steps_by_shortcut.clear();
                CompoundShortcutOutcome::NoMatch
            }
            Err(_) => {
                eprintln!("compound shortcut runtime mutex poisoned");
                CompoundShortcutOutcome::NoMatch
            }
        }
    }

    fn pending_info(&self) -> Option<CompoundShortcutPendingInfo> {
        let now = Instant::now();
        match self.state.lock() {
            Ok(mut state) => {
                let Some(pending) = state.pending.clone() else {
                    return None;
                };
                if now.duration_since(pending.updated_at) > COMPOUND_HOTKEY_STEP_TIMEOUT {
                    eprintln!("compound shortcut pending expired during sync");
                    state.pending = None;
                    state.temporary_next_steps_by_shortcut.clear();
                    state.pending_generation = state.pending_generation.wrapping_add(1);
                    return None;
                }
                let remaining = COMPOUND_HOTKEY_STEP_TIMEOUT
                    .saturating_sub(now.duration_since(pending.updated_at));
                let entries = state.whichkey_entries(&pending.prefix);
                let next_steps = entries.iter().map(|entry| entry.key.clone()).collect();
                Some(CompoundShortcutPendingInfo {
                    prefix_label: pending.prefix.to_string(),
                    next_steps,
                    entries,
                    expires_at_unix_ms: unix_ms_after(remaining),
                })
            }
            Err(_) => {
                eprintln!("compound shortcut runtime mutex poisoned");
                None
            }
        }
    }

    fn clear_pending(&self) {
        match self.state.lock() {
            Ok(mut state) => {
                if state.pending.is_some() {
                    eprintln!("compound shortcut pending cleared");
                }
                state.pending = None;
                state.temporary_next_steps_by_shortcut.clear();
                state.pending_generation = state.pending_generation.wrapping_add(1);
            }
            Err(_) => eprintln!("compound shortcut runtime mutex poisoned"),
        }
    }

    fn clear_pending_generation(&self, generation: u64) -> bool {
        match self.state.lock() {
            Ok(mut state) => {
                if state
                    .pending
                    .as_ref()
                    .is_some_and(|pending| pending.generation == generation)
                {
                    eprintln!("compound shortcut pending auto-expired");
                    state.pending = None;
                    state.temporary_next_steps_by_shortcut.clear();
                    state.pending_generation = state.pending_generation.wrapping_add(1);
                    return true;
                }
                false
            }
            Err(_) => {
                eprintln!("compound shortcut runtime mutex poisoned");
                false
            }
        }
    }
}

#[cfg(not(test))]
impl CompoundShortcutState {
    fn whichkey_entries(&self, prefix: &hotkeys::HotkeySequence) -> Vec<WhichKeyEntry> {
        self.registry
            .next_step_routes(prefix)
            .unwrap_or_default()
            .into_iter()
            .map(|entry| {
                let (group, label) = whichkey_route_label(&entry.route, &entry.id);
                WhichKeyEntry {
                    key: entry.step.to_string(),
                    label,
                    group,
                    route_id: entry.id,
                    disabled: false,
                    diagnostic: None,
                }
            })
            .collect()
    }
}

#[cfg(not(test))]
fn whichkey_route_label(route: &hotkeys::ShortcutRoute, fallback_id: &str) -> (String, String) {
    let (group, label) = match route {
        hotkeys::ShortcutRoute::PickerOpen => ("Picker".to_string(), "Open picker".to_string()),
        hotkeys::ShortcutRoute::ScriptRun { action_id } => {
            ("Scripts".to_string(), readable_route_label(action_id))
        }
        hotkeys::ShortcutRoute::Command { command_id } => {
            ("Commands".to_string(), readable_route_label(command_id))
        }
        hotkeys::ShortcutRoute::WhichKeyOpen { .. } => {
            ("WhichKey".to_string(), "Show shortcuts".to_string())
        }
    };
    if label.trim().is_empty() {
        (group, fallback_id.to_string())
    } else {
        (group, label)
    }
}

#[cfg(not(test))]
fn readable_route_label(id: &str) -> String {
    id.rsplit(['.', '/'])
        .next()
        .unwrap_or(id)
        .replace(['_', '-'], " ")
}

#[cfg(not(test))]
fn unix_ms_after(duration: Duration) -> u128 {
    SystemTime::now()
        .checked_add(duration)
        .unwrap_or_else(SystemTime::now)
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_millis())
        .unwrap_or_default()
}

#[cfg(not(test))]
fn refresh_global_shortcuts_from_storage<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    storage: &storage::AppStorage,
) -> Result<(), String> {
    let actions = actions::list_actions(storage)?;
    let settings = storage.get_settings()?;
    refresh_global_shortcuts(app, &actions, &settings);
    Ok(())
}

#[cfg(not(test))]
fn refresh_global_shortcuts<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    actions: &[actions::ActionDefinition],
    settings: &storage::AppSettings,
) {
    refresh_picker_shortcut_from_settings(app, settings);
    refresh_picker_pin_shortcut_from_settings(app, settings);

    if let Some(shortcuts) = app.try_state::<GlobalScriptShortcuts>() {
        for shortcut in shortcuts.current_shortcuts() {
            if let Err(error) = app.global_shortcut().unregister(shortcut) {
                eprintln!("global script shortcut unregister failed: {shortcut:?}: {error}");
            }
        }
    }
    if let Some(compound) = app.try_state::<CompoundShortcutRuntime>() {
        clear_compound_temporary_shortcuts(app, &compound);
        for shortcut in compound.current_prefix_shortcuts() {
            if let Err(error) = app.global_shortcut().unregister(shortcut) {
                eprintln!("compound shortcut prefix unregister failed: {shortcut:?}: {error}");
            }
        }
    }

    let mut registered = HashMap::new();
    let mut compound_registry = hotkeys::ShortcutRegistry::default();
    let mut compound_prefixes = HashMap::new();
    for action in actions {
        if action.source != actions::ActionSource::Script
            || !action.triggers.contains(&actions::Trigger::GlobalShortcut)
            || action
                .diagnostics
                .iter()
                .any(|diagnostic| diagnostic.severity == actions::DiagnosticSeverity::Error)
        {
            continue;
        }

        let Some(shortcut_label) = actions::normalize_shortcut_string(action.shortcut.as_deref())
        else {
            continue;
        };
        let sequence = match hotkeys::HotkeySequence::parse(&shortcut_label) {
            Ok(sequence) => sequence,
            Err(error) => {
                eprintln!(
                    "global script shortcut not registered for {}: invalid shortcut {}: {}",
                    action.id, shortcut_label, error
                );
                continue;
            }
        };

        let Some(first_step) = sequence.first_step() else {
            continue;
        };
        let Some(shortcut) = shortcut_from_label(&first_step.to_string()) else {
            eprintln!(
                "global script shortcut not registered for {}: unsupported shortcut {}",
                action.id, shortcut_label
            );
            continue;
        };

        if sequence.is_simple() {
            register_simple_global_script_shortcut(
                app,
                &mut registered,
                action,
                shortcut,
                shortcut_label,
            );
            continue;
        }

        if !ENABLE_COMPOUND_GLOBAL_SHORTCUTS {
            eprintln!(
                "compound script shortcut temporarily disabled for {} ({})",
                action.id, shortcut_label
            );
            continue;
        }

        if let Err(diagnostic) =
            compound_registry.register_sequence(hotkeys::ShortcutRegistration {
                id: action.id.clone(),
                sequence: sequence.clone(),
                route: hotkeys::ShortcutRoute::ScriptRun {
                    action_id: action.id.clone(),
                },
            })
        {
            eprintln!(
                "compound script shortcut not registered for {} ({}): {}",
                action.id, shortcut_label, diagnostic.message
            );
            continue;
        }

        if compound_prefixes.contains_key(&shortcut) {
            dev_log(format_args!(
                "compound script shortcut shares registered prefix: {} -> {}",
                first_step, action.id
            ));
            continue;
        }

        if app.global_shortcut().is_registered(shortcut) {
            eprintln!(
                "compound script shortcut prefix not registered for {}: already registered {}",
                action.id, first_step
            );
            continue;
        }

        match app.global_shortcut().register(shortcut) {
            Ok(()) => {
                dev_log(format_args!(
                    "compound script shortcut prefix registered: {} -> {}",
                    first_step, action.id
                ));
                compound_prefixes.insert(
                    shortcut,
                    hotkeys::HotkeySequence::parse(&first_step.to_string())
                        .expect("first step parses"),
                );
            }
            Err(error) => eprintln!(
                "compound script shortcut prefix registration failed for {} ({}): {error}",
                action.id, first_step
            ),
        }
    }

    if let Some(shortcuts) = app.try_state::<GlobalScriptShortcuts>() {
        shortcuts.replace(registered);
    }
    if let Some(compound) = app.try_state::<CompoundShortcutRuntime>() {
        compound.replace(compound_registry, compound_prefixes);
    }
}

#[cfg(not(test))]
fn register_simple_global_script_shortcut<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    registered: &mut HashMap<Shortcut, GlobalScriptShortcutAction>,
    action: &actions::ActionDefinition,
    shortcut: Shortcut,
    shortcut_label: String,
) {
    if app.global_shortcut().is_registered(shortcut) {
        eprintln!(
            "global script shortcut not registered for {}: already registered {}",
            action.id, shortcut_label
        );
        return;
    }

    match app.global_shortcut().register(shortcut) {
        Ok(()) => {
            dev_log(format_args!(
                "global script shortcut registered: {} -> {}",
                shortcut_label, action.id
            ));
            registered.insert(
                shortcut,
                GlobalScriptShortcutAction {
                    action_id: action.id.clone(),
                    shortcut_label,
                    selection: action.input.selection.clone(),
                },
            );
        }
        Err(error) => eprintln!(
            "global script shortcut registration failed for {} ({}): {error}",
            action.id, shortcut_label
        ),
    }
}

#[cfg(not(test))]
fn refresh_picker_shortcut_from_settings<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    settings: &storage::AppSettings,
) {
    let Some(current) = app.try_state::<CurrentPickerShortcut>() else {
        eprintln!("picker shortcut state not ready");
        return;
    };
    let Some(next_shortcut) = shortcut_from_label(&settings.general.global_shortcut) else {
        eprintln!(
            "picker shortcut not refreshed: unsupported shortcut {}",
            settings.general.global_shortcut
        );
        current.set_status(NativeShortcutStatus {
            label: settings.general.global_shortcut.clone(),
            registered: false,
            supported: false,
            error: Some("unsupported shortcut".to_string()),
        });
        return;
    };

    let previous_shortcut = current.get();
    let already_registered = app.global_shortcut().is_registered(next_shortcut);
    if previous_shortcut == next_shortcut && already_registered {
        current.set_status(NativeShortcutStatus {
            label: settings.general.global_shortcut.clone(),
            registered: true,
            supported: true,
            error: None,
        });
        return;
    }

    if app.global_shortcut().is_registered(previous_shortcut) {
        if let Err(error) = app.global_shortcut().unregister(previous_shortcut) {
            eprintln!("picker shortcut unregister failed: {previous_shortcut:?}: {error}");
        }
    }

    match app.global_shortcut().register(next_shortcut) {
        Ok(()) => {
            current.set(next_shortcut);
            current.set_status(NativeShortcutStatus {
                label: settings.general.global_shortcut.clone(),
                registered: true,
                supported: true,
                error: None,
            });
            eprintln!(
                "picker shortcut registered from settings: {}",
                settings.general.global_shortcut
            );
        }
        Err(error) => {
            eprintln!(
                "picker shortcut registration failed for {}: {error}",
                settings.general.global_shortcut
            );
            current.set_status(NativeShortcutStatus {
                label: settings.general.global_shortcut.clone(),
                registered: false,
                supported: true,
                error: Some(error.to_string()),
            });
            if !app.global_shortcut().is_registered(previous_shortcut) {
                if let Err(restore_error) = app.global_shortcut().register(previous_shortcut) {
                    eprintln!(
                        "picker shortcut restore failed for {previous_shortcut:?}: {restore_error}"
                    );
                }
            }
        }
    }
}

#[cfg(not(test))]
fn refresh_picker_pin_shortcut_from_settings<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    settings: &storage::AppSettings,
) {
    let Some(current) = app.try_state::<CurrentPickerPinShortcut>() else {
        eprintln!("picker pin shortcut state not ready");
        return;
    };
    let next_shortcut = if settings.picker.pin_toggle_shortcut.trim().is_empty() {
        None
    } else {
        shortcut_from_label(&settings.picker.pin_toggle_shortcut)
    };

    if !settings.picker.pin_toggle_shortcut.trim().is_empty() && next_shortcut.is_none() {
        current.set_status(NativeShortcutStatus {
            label: settings.picker.pin_toggle_shortcut.clone(),
            registered: false,
            supported: false,
            error: Some("unsupported shortcut".to_string()),
        });
        eprintln!(
            "picker pin shortcut not refreshed: unsupported shortcut {}",
            settings.picker.pin_toggle_shortcut
        );
        return;
    }

    let previous_shortcut = current.get();
    let already_registered = next_shortcut
        .map(|shortcut| app.global_shortcut().is_registered(shortcut))
        .unwrap_or(false);
    if previous_shortcut == next_shortcut && already_registered {
        current.set_status(NativeShortcutStatus {
            label: settings.picker.pin_toggle_shortcut.clone(),
            registered: true,
            supported: true,
            error: None,
        });
        return;
    }

    if let Some(previous_shortcut) = previous_shortcut {
        if app.global_shortcut().is_registered(previous_shortcut) {
            if let Err(error) = app.global_shortcut().unregister(previous_shortcut) {
                eprintln!("picker pin shortcut unregister failed: {previous_shortcut:?}: {error}");
            }
        }
    }

    let Some(next_shortcut) = next_shortcut else {
        current.set(None);
        current.set_status(NativeShortcutStatus {
            label: settings.picker.pin_toggle_shortcut.clone(),
            registered: false,
            supported: true,
            error: None,
        });
        eprintln!("picker pin shortcut disabled from settings");
        return;
    };

    match app.global_shortcut().register(next_shortcut) {
        Ok(()) => {
            current.set(Some(next_shortcut));
            current.set_status(NativeShortcutStatus {
                label: settings.picker.pin_toggle_shortcut.clone(),
                registered: true,
                supported: true,
                error: None,
            });
            eprintln!(
                "picker pin shortcut registered from settings: {}",
                settings.picker.pin_toggle_shortcut
            );
        }
        Err(error) => {
            eprintln!(
                "picker pin shortcut registration failed for {}: {error}",
                settings.picker.pin_toggle_shortcut
            );
            current.set_status(NativeShortcutStatus {
                label: settings.picker.pin_toggle_shortcut.clone(),
                registered: false,
                supported: true,
                error: Some(error.to_string()),
            });
            if let Some(previous_shortcut) = previous_shortcut {
                if !app.global_shortcut().is_registered(previous_shortcut) {
                    if let Err(restore_error) = app.global_shortcut().register(previous_shortcut) {
                        eprintln!(
                            "picker pin shortcut restore failed for {previous_shortcut:?}: {restore_error}"
                        );
                    } else {
                        current.set(Some(previous_shortcut));
                    }
                }
            }
        }
    }
}

#[cfg(not(test))]
fn spawn_script_action_refresh<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    storage: storage::AppStorage,
) {
    thread::Builder::new()
        .name("copicu-script-actions-refresh".to_string())
        .spawn(move || {
            let mut last_signature = script_folder_signature(&storage).unwrap_or_default();
            loop {
                thread::sleep(SCRIPT_ACTION_REFRESH_INTERVAL);
                let signature = match script_folder_signature(&storage) {
                    Ok(signature) => signature,
                    Err(error) => {
                        eprintln!("script action refresh signature failed: {error}");
                        continue;
                    }
                };
                if signature == last_signature {
                    continue;
                }
                last_signature = signature;

                match actions::refresh_script_action_cache(&storage) {
                    Ok(_) => {
                        let app_for_main_thread = app.clone();
                        let storage_for_main_thread = storage.clone();
                        if let Err(error) = app.run_on_main_thread(move || {
                            if let Err(error) = refresh_global_shortcuts_from_storage(
                                &app_for_main_thread,
                                &storage_for_main_thread,
                            ) {
                                eprintln!("script action refresh shortcut update failed: {error}");
                            }
                        }) {
                            eprintln!("script action refresh shortcut dispatch failed: {error}");
                        }
                        eprintln!("script actions refreshed after filesystem change");
                    }
                    Err(error) => eprintln!("script action refresh failed: {error}"),
                }
            }
        })
        .expect("failed to spawn script action refresh thread");
}

#[cfg(not(test))]
fn script_folder_signature(storage: &storage::AppStorage) -> Result<String, String> {
    let settings = storage.get_settings()?;
    let folder = std::path::Path::new(&settings.scripts.folder_path);
    if !folder.exists() {
        return Ok(format!("{}|missing", folder.display()));
    }

    let mut parts = Vec::new();
    let entries = std::fs::read_dir(folder).map_err(|error| {
        format!(
            "failed to read scripts folder {}: {error}",
            folder.display()
        )
    })?;
    for entry in entries.filter_map(Result::ok) {
        let path = entry.path();
        if !is_script_refresh_file(&path) {
            continue;
        }
        let metadata = match entry.metadata() {
            Ok(metadata) => metadata,
            Err(error) => {
                parts.push(format!("{}|metadata-error:{error}", path.display()));
                continue;
            }
        };
        let modified = metadata
            .modified()
            .ok()
            .and_then(|value| value.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|value| value.as_millis())
            .unwrap_or_default();
        parts.push(format!(
            "{}|{}|{}",
            path.display(),
            metadata.len(),
            modified
        ));
    }
    parts.sort();
    Ok(format!("{}|{}", folder.display(), parts.join(";")))
}

#[cfg(not(test))]
fn is_script_refresh_file(path: &std::path::Path) -> bool {
    if path
        .file_name()
        .is_some_and(|name| name.to_string_lossy().ends_with(".d.ts"))
    {
        return false;
    }

    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| matches!(extension, "ts" | "js" | "mjs"))
}

#[cfg(not(test))]
fn run_global_script_shortcut<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    shortcut_action: GlobalScriptShortcutAction,
) {
    let storage = app.state::<storage::AppStorage>().inner().clone();
    let suppression = app
        .state::<clipboard::SelfWriteSuppression>()
        .inner()
        .clone();
    let previous_window = app.state::<window_focus::PreviousWindow>().inner().clone();
    let window = app.get_webview_window(MAIN_WINDOW_LABEL);
    let current_item_id = if shortcut_action.selection == actions::SelectionRequirement::Active {
        match storage.list_recent() {
            Ok(items) => items.first().map(|item| item.id()),
            Err(error) => {
                eprintln!(
                    "global script shortcut active item lookup failed for {}: {}",
                    shortcut_action.action_id, error
                );
                None
            }
        }
    } else {
        None
    };
    let result = actions::run_action(
        &app,
        window.as_ref(),
        &storage,
        &suppression,
        &previous_window,
        actions::RunActionRequest {
            action_id: shortcut_action.action_id.clone(),
            context: actions::ActionContext {
                trigger: actions::Trigger::GlobalShortcut,
                shortcut: Some(shortcut_action.shortcut_label.clone()),
                current_item_id,
                selected_item_ids: Vec::new(),
                view: None,
            },
        },
    );

    eprintln!(
        "global script shortcut run: {} via {} -> {:?}: {}",
        shortcut_action.action_id, shortcut_action.shortcut_label, result.status, result.message
    );
    for toast in result.toasts {
        emit_toast_on_main_thread(app.clone(), toast.clone(), "global script shortcut");
        eprintln!(
            "global script shortcut toast from {}: {}",
            shortcut_action.action_id, toast.message
        );
    }
}

#[cfg(not(test))]
fn open_picker_for_tag_slug<R: tauri::Runtime + 'static>(
    app: tauri::AppHandle<R>,
    slug: String,
) -> Result<(), String> {
    let query = format!("tag:{}", slug.trim().trim_start_matches('#'));
    let app_for_main_thread = app.clone();
    app.run_on_main_thread(move || {
        if let Err(error) = show_main_window(&app_for_main_thread, true) {
            eprintln!("tag picker show failed for {query}: {error}");
            return;
        }
        if let Err(error) = app_for_main_thread.emit_to(
            MAIN_WINDOW_LABEL,
            PICKER_FILTER_EVENT,
            serde_json::json!({ "query": query }),
        ) {
            eprintln!("tag picker filter emit failed: {error}");
        }
    })
    .map_err(|error| format!("tag picker dispatch failed: {error}"))
}

#[cfg(not(test))]
fn clear_compound_temporary_shortcuts<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    runtime: &CompoundShortcutRuntime,
) {
    for shortcut in runtime.take_temporary_next_step_shortcuts() {
        if app.global_shortcut().is_registered(shortcut) {
            if let Err(error) = app.global_shortcut().unregister(shortcut) {
                eprintln!("compound temporary shortcut unregister failed: {shortcut:?}: {error}");
            }
        }
    }
}

#[cfg(not(test))]
fn register_compound_temporary_next_steps<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    runtime: &CompoundShortcutRuntime,
    pending_info: &CompoundShortcutPendingInfo,
) {
    clear_compound_temporary_shortcuts(app, runtime);

    let mut registered = HashMap::new();
    let mut registered_shortcuts = Vec::new();
    for step_label in &pending_info.next_steps {
        let Ok(step) = hotkeys::HotkeyStep::parse(step_label) else {
            eprintln!("compound temporary shortcut skipped: invalid next step {step_label}");
            continue;
        };
        let Some(shortcut) = shortcut_from_label(&step.to_string()) else {
            eprintln!("compound temporary shortcut skipped: unsupported next step {step}");
            continue;
        };
        if app.global_shortcut().is_registered(shortcut) {
            eprintln!("compound temporary shortcut skipped: already registered {step}");
            continue;
        }
        match app.global_shortcut().register(shortcut) {
            Ok(()) => {
                eprintln!(
                    "compound temporary shortcut registered: {} after {}",
                    step, pending_info.prefix_label
                );
                registered.insert(shortcut, step);
                registered_shortcuts.push(shortcut);
            }
            Err(error) => eprintln!(
                "compound temporary shortcut registration failed for {} after {}: {error}",
                step, pending_info.prefix_label
            ),
        }
    }

    runtime.replace_temporary_next_steps(registered);
    let Some(generation) = runtime.current_pending_generation() else {
        return;
    };

    let app = app.clone();
    let runtime = runtime.clone();
    thread::spawn(move || {
        thread::sleep(COMPOUND_HOTKEY_STEP_TIMEOUT + Duration::from_millis(150));
        if !runtime.clear_pending_generation(generation) {
            return;
        }
        for shortcut in registered_shortcuts {
            if app.global_shortcut().is_registered(shortcut) {
                if let Err(error) = app.global_shortcut().unregister(shortcut) {
                    eprintln!(
                        "compound temporary shortcut timeout unregister failed: {shortcut:?}: {error}"
                    );
                }
            }
        }
    });
}

#[cfg(not(test))]
fn handle_compound_shortcut_outcome<R: tauri::Runtime + 'static>(
    app: &tauri::AppHandle<R>,
    outcome: CompoundShortcutOutcome,
) {
    match outcome {
        CompoundShortcutOutcome::Pending => {
            let Some(runtime) = app.try_state::<CompoundShortcutRuntime>() else {
                return;
            };
            if let Some(pending_info) = runtime.pending_info() {
                if ENABLE_COMPOUND_TEMPORARY_NEXT_STEPS {
                    register_compound_temporary_next_steps(app, &runtime, &pending_info);
                    emit_compound_pending_on_main_thread(app.clone(), pending_info);
                }
            }
        }
        CompoundShortcutOutcome::Matched(route, shortcut_label) => {
            execute_shortcut_route(app.clone(), route, shortcut_label);
        }
        CompoundShortcutOutcome::Expired => eprintln!("compound shortcut expired"),
        CompoundShortcutOutcome::NoMatch => eprintln!("compound shortcut did not match"),
        CompoundShortcutOutcome::Idle => {
            eprintln!("compound shortcut step ignored: no pending state")
        }
    }
}

#[cfg(not(test))]
fn emit_compound_pending_on_main_thread<R: tauri::Runtime + 'static>(
    app: tauri::AppHandle<R>,
    pending_info: CompoundShortcutPendingInfo,
) {
    let app_for_main_thread = app.clone();
    if let Err(error) = app.run_on_main_thread(move || {
        if let Err(error) = app_for_main_thread.emit(COMPOUND_HOTKEY_PENDING_EVENT, pending_info) {
            eprintln!("compound pending emit failed: {error}");
        }
    }) {
        eprintln!("compound pending emit dispatch failed: {error}");
    }
}

#[cfg(not(test))]
fn emit_toast_on_main_thread<R: tauri::Runtime + 'static>(
    app: tauri::AppHandle<R>,
    toast: actions::ActionToast,
    source: &'static str,
) {
    let app_for_main_thread = app.clone();
    if let Err(error) = app.run_on_main_thread(move || {
        if let Err(error) = app_for_main_thread.emit_to(
            NOTIFICATIONS_WINDOW_LABEL,
            NOTIFICATION_TOAST_EVENT,
            &toast,
        ) {
            eprintln!("{source} toast emit failed: {error}");
        }
    }) {
        eprintln!("{source} toast emit dispatch failed: {error}");
    }
}

#[cfg(not(test))]
fn emit_picker_pin_state<R: tauri::Runtime>(app: &tauri::AppHandle<R>, pinned: bool) {
    if let Err(error) = app.emit_to(MAIN_WINDOW_LABEL, PICKER_PIN_STATE_EVENT, pinned) {
        eprintln!("picker pin state emit failed: {error}");
    }
}

#[cfg(not(test))]
fn focus_settings_section<R: tauri::Runtime + 'static>(
    app: tauri::AppHandle<R>,
    section: &'static str,
) {
    thread::spawn(move || {
        thread::sleep(Duration::from_millis(150));
        let app_for_main_thread = app.clone();
        if let Err(error) = app.run_on_main_thread(move || {
            if let Err(error) = app_for_main_thread.emit_to(
                SETTINGS_WINDOW_LABEL,
                SETTINGS_FOCUS_SECTION_EVENT,
                section,
            ) {
                eprintln!("settings focus section emit failed: {error}");
            }
        }) {
            eprintln!("settings focus section dispatch failed: {error}");
        }
    });
}

#[cfg(not(test))]
fn execute_shortcut_route<R: tauri::Runtime + 'static>(
    app: tauri::AppHandle<R>,
    route: hotkeys::ShortcutRoute,
    shortcut_label: String,
) {
    match route {
        hotkeys::ShortcutRoute::PickerOpen => {
            spawn_toggle_main_window(app);
        }
        hotkeys::ShortcutRoute::ScriptRun { action_id } => {
            thread::spawn(move || {
                run_global_script_shortcut(
                    app,
                    GlobalScriptShortcutAction {
                        action_id,
                        shortcut_label,
                        selection: actions::SelectionRequirement::None,
                    },
                )
            });
        }
        hotkeys::ShortcutRoute::Command { command_id } => {
            eprintln!("command shortcut route not implemented yet: {command_id}");
        }
        hotkeys::ShortcutRoute::WhichKeyOpen { prefix } => {
            eprintln!("whichkey shortcut route not implemented yet: {prefix:?}");
        }
    }
}

#[cfg(not(test))]
fn shortcut_from_label(label: &str) -> Option<Shortcut> {
    let mut parts = label.split('+').collect::<Vec<_>>();
    let key = parts.pop()?;
    let mut modifiers = Modifiers::empty();
    for modifier in parts {
        match modifier {
            "Ctrl" => modifiers |= Modifiers::CONTROL,
            "Alt" => modifiers |= Modifiers::ALT,
            "Shift" => modifiers |= Modifiers::SHIFT,
            "Meta" => modifiers |= Modifiers::META,
            _ => return None,
        }
    }
    Some(Shortcut::new(
        if modifiers.is_empty() {
            None
        } else {
            Some(modifiers)
        },
        code_from_shortcut_key(key)?,
    ))
}

#[cfg(not(test))]
fn code_from_shortcut_key(key: &str) -> Option<Code> {
    match key {
        "A" => Some(Code::KeyA),
        "B" => Some(Code::KeyB),
        "C" => Some(Code::KeyC),
        "D" => Some(Code::KeyD),
        "E" => Some(Code::KeyE),
        "F" => Some(Code::KeyF),
        "G" => Some(Code::KeyG),
        "H" => Some(Code::KeyH),
        "I" => Some(Code::KeyI),
        "J" => Some(Code::KeyJ),
        "K" => Some(Code::KeyK),
        "L" => Some(Code::KeyL),
        "M" => Some(Code::KeyM),
        "N" => Some(Code::KeyN),
        "O" => Some(Code::KeyO),
        "P" => Some(Code::KeyP),
        "Q" => Some(Code::KeyQ),
        "R" => Some(Code::KeyR),
        "S" => Some(Code::KeyS),
        "T" => Some(Code::KeyT),
        "U" => Some(Code::KeyU),
        "V" => Some(Code::KeyV),
        "W" => Some(Code::KeyW),
        "X" => Some(Code::KeyX),
        "Y" => Some(Code::KeyY),
        "Z" => Some(Code::KeyZ),
        "0" => Some(Code::Digit0),
        "1" => Some(Code::Digit1),
        "2" => Some(Code::Digit2),
        "3" => Some(Code::Digit3),
        "4" => Some(Code::Digit4),
        "5" => Some(Code::Digit5),
        "6" => Some(Code::Digit6),
        "7" => Some(Code::Digit7),
        "8" => Some(Code::Digit8),
        "9" => Some(Code::Digit9),
        "," => Some(Code::Comma),
        "." => Some(Code::Period),
        "/" => Some(Code::Slash),
        ";" => Some(Code::Semicolon),
        "'" => Some(Code::Quote),
        "[" => Some(Code::BracketLeft),
        "]" => Some(Code::BracketRight),
        "\\" => Some(Code::Backslash),
        "-" => Some(Code::Minus),
        "=" => Some(Code::Equal),
        "`" => Some(Code::Backquote),
        "Enter" => Some(Code::Enter),
        "Space" => Some(Code::Space),
        "Tab" => Some(Code::Tab),
        "Backspace" => Some(Code::Backspace),
        "Delete" => Some(Code::Delete),
        "End" => Some(Code::End),
        "Escape" => Some(Code::Escape),
        "Home" => Some(Code::Home),
        "Insert" => Some(Code::Insert),
        "PageDown" => Some(Code::PageDown),
        "PageUp" => Some(Code::PageUp),
        "ArrowDown" => Some(Code::ArrowDown),
        "ArrowLeft" => Some(Code::ArrowLeft),
        "ArrowRight" => Some(Code::ArrowRight),
        "ArrowUp" => Some(Code::ArrowUp),
        "F1" => Some(Code::F1),
        "F2" => Some(Code::F2),
        "F3" => Some(Code::F3),
        "F4" => Some(Code::F4),
        "F5" => Some(Code::F5),
        "F6" => Some(Code::F6),
        "F7" => Some(Code::F7),
        "F8" => Some(Code::F8),
        "F9" => Some(Code::F9),
        "F10" => Some(Code::F10),
        "F11" => Some(Code::F11),
        "F12" => Some(Code::F12),
        _ => None,
    }
}

#[cfg(not(test))]
fn log_shortcut_registration<R: tauri::Runtime, M: Manager<R>>(app: &M) {
    if app.global_shortcut().is_registered(picker_shortcut()) {
        dev_log(format_args!(
            "global shortcut registered: {PICKER_SHORTCUT_LABEL}"
        ));
    } else {
        eprintln!("global shortcut not registered: {PICKER_SHORTCUT_LABEL}");
    }
}

#[cfg(not(test))]
fn picker_shortcut() -> Shortcut {
    Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::Comma)
}
