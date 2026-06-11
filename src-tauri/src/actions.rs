use serde::{Deserialize, Serialize};
#[cfg(not(test))]
use serde_json::json;
use std::{
    process::{Child, ExitStatus},
    thread,
    time::{Duration, Instant},
};

#[cfg(not(test))]
use std::{
    io::{BufRead, BufReader, Read, Write},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::mpsc,
    time::{SystemTime, UNIX_EPOCH},
};

#[cfg(not(test))]
use tauri::{AppHandle, Emitter, Manager, Runtime, WebviewWindow};
#[cfg(not(test))]
use tauri_plugin_clipboard_manager::ClipboardExt;
#[cfg(not(test))]
use tauri_plugin_notification::NotificationExt;

#[path = "actions/capabilities.rs"]
mod capabilities;
#[path = "actions/discovery.rs"]
mod discovery;
#[cfg(not(test))]
#[path = "actions/host_api.rs"]
mod host_api;
#[cfg(not(test))]
#[path = "actions/input.rs"]
mod input;
#[path = "actions/logging.rs"]
mod logging;
#[path = "actions/shortcuts.rs"]
mod shortcuts;
#[path = "actions/url.rs"]
mod url;

use self::capabilities::{
    unsupported_script_capabilities, validate_script_command_capabilities,
    validate_script_host_capabilities,
};
use self::discovery::discover_script_actions;
#[cfg(not(test))]
use self::host_api::dispatch_script_host_call;
#[cfg(not(test))]
use self::input::validate_action_input;
use self::logging::now_unix_ms;
#[cfg(not(test))]
use self::logging::{input_summary_json, redact_error};
pub use self::shortcuts::normalize_shortcut_string;
const PASTE_PLAIN_ID: &str = "builtin.pastePlain";
const JOIN_SELECTED_ID: &str = "builtin.joinSelected";
const OPEN_URL_ID: &str = "builtin.openUrl";
const MAIN_WINDOW_LABEL: &str = "main";
const NOTIFICATIONS_WINDOW_LABEL: &str = "notifications";
const NOTIFICATION_TOAST_EVENT: &str = "copicu://toast";
const PICKER_FILTER_EVENT: &str = "copicu://picker/filter";
#[cfg(not(test))]
const SCRIPT_RUNNER_TIMEOUT: Duration = Duration::from_secs(15);
const SCRIPT_RUNNER_TIMEOUT_ERROR_PREFIX: &str = "script runner timed out after";

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ActionDefinition {
    pub id: String,
    pub title: String,
    pub description: String,
    pub shortcut: Option<String>,
    pub triggers: Vec<Trigger>,
    pub input: ActionInput,
    pub capabilities: Vec<String>,
    pub builtin: bool,
    pub source: ActionSource,
    pub script: Option<ScriptActionMetadata>,
    pub diagnostics: Vec<ActionDiagnostic>,
    pub logging: Option<ActionLogging>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ActionSource {
    Builtin,
    Script,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ScriptActionMetadata {
    pub path: String,
    pub file_name: String,
    pub source_hash: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ActionDiagnostic {
    pub severity: DiagnosticSeverity,
    pub message: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum DiagnosticSeverity {
    Info,
    Warning,
    Error,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ActionLogging {
    pub name: Option<String>,
    pub redact: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum Trigger {
    ItemMenu,
    CommandPalette,
    LocalShortcut,
    GlobalShortcut,
    ClipboardChange,
    Tray,
    Cli,
    DevRun,
}

impl Trigger {
    fn as_log_value(&self) -> &'static str {
        match self {
            Self::ItemMenu => "itemMenu",
            Self::CommandPalette => "commandPalette",
            Self::LocalShortcut => "localShortcut",
            Self::GlobalShortcut => "globalShortcut",
            Self::ClipboardChange => "clipboardChange",
            Self::Tray => "tray",
            Self::Cli => "cli",
            Self::DevRun => "devRun",
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum SelectionRequirement {
    None,
    Optional,
    One,
    OneOrMore,
    Many,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ActionInputSource {
    PickerSelection,
    Clipboard,
    HistorySearch,
    None,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ClipKind {
    Text,
    Html,
    Image,
    FileList,
    Unknown,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ActionInput {
    pub source: ActionInputSource,
    pub selection: SelectionRequirement,
    pub kinds: Option<Vec<ClipKind>>,
    pub mime: Option<Vec<String>>,
    pub query: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ActionContext {
    pub trigger: Trigger,
    pub shortcut: Option<String>,
    pub current_item_id: Option<i64>,
    pub selected_item_ids: Vec<i64>,
    pub view: Option<ActionViewContext>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ActionViewContext {
    pub query: String,
    pub visible_item_ids: Vec<i64>,
    pub current_index: Option<i64>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunActionRequest {
    pub action_id: String,
    pub context: ActionContext,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ActionRunResult {
    pub action_id: String,
    pub status: ActionRunStatus,
    pub message: String,
    pub toasts: Vec<ActionToast>,
    pub effects: Vec<ActionEffect>,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ActionRunStatus {
    Completed,
    Failed,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ActionToast {
    pub title: Option<String>,
    pub message: String,
    pub tone: ToastTone,
    pub duration_ms: Option<i64>,
}

#[cfg(not(test))]
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ActionNotification {
    pub title: Option<String>,
    pub body: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ToastTone {
    Info,
    Success,
    Warning,
    Danger,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", tag = "type")]
pub enum ActionEffect {
    #[serde(rename = "picker.filter")]
    PickerFilter { query: String },
}

pub fn builtin_actions() -> Vec<ActionDefinition> {
    vec![
        ActionDefinition {
            id: PASTE_PLAIN_ID.to_string(),
            title: "Paste plain".to_string(),
            description: "Paste the selected text item as plain text.".to_string(),
            shortcut: None,
            triggers: vec![Trigger::ItemMenu, Trigger::CommandPalette],
            input: ActionInput {
                source: ActionInputSource::PickerSelection,
                selection: SelectionRequirement::One,
                kinds: Some(vec![ClipKind::Text]),
                mime: Some(vec!["text/plain".to_string()]),
                query: None,
            },
            capabilities: vec![
                "history:read-content".to_string(),
                "clipboard:write".to_string(),
                "window:focus-previous".to_string(),
                "input:paste".to_string(),
            ],
            builtin: true,
            source: ActionSource::Builtin,
            script: None,
            diagnostics: Vec::new(),
            logging: None,
        },
        ActionDefinition {
            id: JOIN_SELECTED_ID.to_string(),
            title: "Join selected".to_string(),
            description: "Join selected text items and copy the result.".to_string(),
            shortcut: None,
            triggers: vec![Trigger::ItemMenu, Trigger::CommandPalette],
            input: ActionInput {
                source: ActionInputSource::PickerSelection,
                selection: SelectionRequirement::OneOrMore,
                kinds: Some(vec![ClipKind::Text]),
                mime: Some(vec!["text/plain".to_string()]),
                query: None,
            },
            capabilities: vec![
                "history:read-content".to_string(),
                "clipboard:write".to_string(),
            ],
            builtin: true,
            source: ActionSource::Builtin,
            script: None,
            diagnostics: Vec::new(),
            logging: None,
        },
        ActionDefinition {
            id: OPEN_URL_ID.to_string(),
            title: "Open URL".to_string(),
            description: "Open the first URL found in the selected item.".to_string(),
            shortcut: None,
            triggers: vec![Trigger::ItemMenu, Trigger::CommandPalette],
            input: ActionInput {
                source: ActionInputSource::PickerSelection,
                selection: SelectionRequirement::One,
                kinds: Some(vec![ClipKind::Text]),
                mime: None,
                query: None,
            },
            capabilities: vec![
                "history:read-content".to_string(),
                "shell:open-url".to_string(),
            ],
            builtin: true,
            source: ActionSource::Builtin,
            script: None,
            diagnostics: Vec::new(),
            logging: None,
        },
    ]
}

pub fn list_actions(storage: &crate::storage::AppStorage) -> Result<Vec<ActionDefinition>, String> {
    let mut actions = builtin_actions();
    actions.extend(storage.list_cached_script_actions()?);
    Ok(actions)
}

pub fn refresh_script_action_cache(
    storage: &crate::storage::AppStorage,
) -> Result<Vec<ActionDefinition>, String> {
    let settings = storage.get_settings()?;
    let mut discovered_scripts = discover_script_actions(&settings.scripts.folder_path)?;
    annotate_global_shortcut_diagnostics(&mut discovered_scripts);
    storage.replace_script_action_cache(&discovered_scripts)?;
    Ok(discovered_scripts)
}

fn annotate_global_shortcut_diagnostics(actions: &mut [ActionDefinition]) {
    let mut counts = std::collections::BTreeMap::<String, usize>::new();
    for action in actions.iter() {
        if action.source == ActionSource::Script
            && action.triggers.contains(&Trigger::GlobalShortcut)
        {
            if let Some(shortcut) = normalize_shortcut_string(action.shortcut.as_deref()) {
                *counts.entry(shortcut).or_default() += 1;
            }
        }
    }

    for action in actions.iter_mut() {
        if action.source != ActionSource::Script
            || !action.triggers.contains(&Trigger::GlobalShortcut)
        {
            continue;
        }

        let Some(shortcut) = normalize_shortcut_string(action.shortcut.as_deref()) else {
            action.diagnostics.push(ActionDiagnostic {
                severity: DiagnosticSeverity::Error,
                message: "globalShortcut trigger requires a valid shortcut".to_string(),
            });
            continue;
        };

        if shortcut == "Ctrl+Shift+," {
            action.diagnostics.push(ActionDiagnostic {
                severity: DiagnosticSeverity::Error,
                message: "global shortcut is reserved for opening Copicu".to_string(),
            });
        }

        if counts.get(&shortcut).copied().unwrap_or_default() > 1 {
            action.diagnostics.push(ActionDiagnostic {
                severity: DiagnosticSeverity::Error,
                message: format!("global shortcut collides with another script: {shortcut}"),
            });
        }

        if !matches!(
            action.input.selection,
            SelectionRequirement::None | SelectionRequirement::Optional
        ) {
            action.diagnostics.push(ActionDiagnostic {
                severity: DiagnosticSeverity::Error,
                message: "globalShortcut actions must accept an empty selection context"
                    .to_string(),
            });
        }

        let unsupported = unsupported_script_capabilities(action);
        if !unsupported.is_empty() {
            action.diagnostics.push(ActionDiagnostic {
                severity: DiagnosticSeverity::Error,
                message: format!(
                    "globalShortcut action uses unsupported capabilities: {}",
                    unsupported.join(", ")
                ),
            });
        }
    }
}

#[cfg(not(test))]
pub fn run_action<R: Runtime + 'static>(
    app: &AppHandle<R>,
    window: Option<&WebviewWindow<R>>,
    storage: &crate::storage::AppStorage,
    suppression: &crate::clipboard::SelfWriteSuppression,
    previous_window: &crate::window_focus::PreviousWindow,
    request: RunActionRequest,
) -> ActionRunResult {
    let started_at = now_unix_ms();
    let input_summary_json = input_summary_json(storage, &request.context);
    let result = match request.action_id.as_str() {
        PASTE_PLAIN_ID => paste_plain(app, window, storage, suppression, previous_window, &request)
            .map(|message| ScriptOrBuiltinRun {
                message,
                toasts: Vec::new(),
                effects: Vec::new(),
            }),
        JOIN_SELECTED_ID => {
            join_selected(app, storage, suppression, &request).map(|message| ScriptOrBuiltinRun {
                message,
                toasts: Vec::new(),
                effects: Vec::new(),
            })
        }
        OPEN_URL_ID => {
            url::open_selected_url(storage, &request).map(|message| ScriptOrBuiltinRun {
                message,
                toasts: Vec::new(),
                effects: Vec::new(),
            })
        }
        _ => run_script_action(app, window, storage, suppression, previous_window, &request),
    };
    let finished_at = now_unix_ms();

    let (status, message, toasts, effects, error_class, error_message) = match result {
        Ok(run) => (
            ActionRunStatus::Completed,
            run.message,
            run.toasts,
            run.effects,
            None,
            None,
        ),
        Err(error) => (
            ActionRunStatus::Failed,
            error.clone(),
            Vec::new(),
            Vec::new(),
            Some("ActionError".to_string()),
            Some(redact_error(&error)),
        ),
    };

    if let Err(error) = storage.insert_action_run(crate::storage::NewActionRun {
        action_id: request.action_id.clone(),
        trigger: request.context.trigger.as_log_value().to_string(),
        status: match status {
            ActionRunStatus::Completed => "completed".to_string(),
            ActionRunStatus::Failed => "failed".to_string(),
        },
        started_at_unix_ms: started_at,
        finished_at_unix_ms: finished_at,
        duration_ms: finished_at.saturating_sub(started_at),
        input_summary_json,
        error_class,
        error_message,
    }) {
        eprintln!("action run logging failed: {error}");
    }

    ActionRunResult {
        action_id: request.action_id,
        status,
        message,
        toasts,
        effects,
    }
}

#[cfg(not(test))]
struct ScriptOrBuiltinRun {
    message: String,
    toasts: Vec<ActionToast>,
    effects: Vec<ActionEffect>,
}

#[cfg(not(test))]
fn paste_plain<R: Runtime>(
    app: &AppHandle<R>,
    window: Option<&WebviewWindow<R>>,
    storage: &crate::storage::AppStorage,
    suppression: &crate::clipboard::SelfWriteSuppression,
    previous_window: &crate::window_focus::PreviousWindow,
    request: &RunActionRequest,
) -> Result<String, String> {
    let item_id = require_one_selected(&request.context)?;
    let item = storage.get_item(item_id)?;
    if item.content_kind() != "text" {
        return Err("paste plain requires a text item".to_string());
    }

    suppression.suppress_hash(item.normalized_hash().to_string());
    app.clipboard().write_text(item.text()).map_err(|error| {
        suppression.clear_if_hash(item.normalized_hash());
        format!("failed to write plain text to clipboard: {error}")
    })?;
    storage.mark_used(item_id)?;
    if let Some(window) = window {
        crate::host::hide_picker(window)?;
    }
    previous_window.focus_previous()?;
    previous_window.send_paste_shortcut(&crate::host::PasteShortcut::Default)?;

    Ok("Pasted plain text".to_string())
}

#[cfg(not(test))]
fn join_selected<R: Runtime>(
    app: &AppHandle<R>,
    storage: &crate::storage::AppStorage,
    suppression: &crate::clipboard::SelfWriteSuppression,
    request: &RunActionRequest,
) -> Result<String, String> {
    let item_ids = require_one_or_more_selected(&request.context)?;
    let mut parts = Vec::with_capacity(item_ids.len());
    for item_id in item_ids {
        let item = storage.get_item(*item_id)?;
        if item.content_kind() != "text" {
            return Err("join selected requires text items".to_string());
        }
        parts.push(item.text().to_string());
        storage.mark_used(*item_id)?;
    }

    let joined = parts.join("\n\n");
    let hash = crate::storage::hash_text(&joined);
    suppression.suppress_hash(hash.clone());
    app.clipboard().write_text(joined).map_err(|error| {
        suppression.clear_if_hash(&hash);
        format!("failed to write joined text to clipboard: {error}")
    })?;

    Ok(format!("Joined {} items", parts.len()))
}

#[cfg(not(test))]
fn require_one_selected(context: &ActionContext) -> Result<i64, String> {
    if context.selected_item_ids.len() != 1 {
        return Err("action requires exactly one selected item".to_string());
    }
    Ok(context.selected_item_ids[0])
}

#[cfg(not(test))]
fn require_one_or_more_selected(context: &ActionContext) -> Result<&[i64], String> {
    if context.selected_item_ids.is_empty() {
        return Err("action requires selected items".to_string());
    }
    Ok(&context.selected_item_ids)
}

#[cfg(not(test))]
fn run_script_action<R: Runtime>(
    app: &AppHandle<R>,
    window: Option<&WebviewWindow<R>>,
    storage: &crate::storage::AppStorage,
    suppression: &crate::clipboard::SelfWriteSuppression,
    previous_window: &crate::window_focus::PreviousWindow,
    request: &RunActionRequest,
) -> Result<ScriptOrBuiltinRun, String> {
    let action = find_script_action(storage, &request.action_id)?
        .ok_or_else(|| format!("unknown action: {}", request.action_id))?;
    if action
        .diagnostics
        .iter()
        .any(|diagnostic| diagnostic.severity == DiagnosticSeverity::Error)
    {
        return Err("script action has diagnostics errors".to_string());
    }
    if !matches!(
        request.context.trigger,
        Trigger::DevRun
            | Trigger::CommandPalette
            | Trigger::ItemMenu
            | Trigger::LocalShortcut
            | Trigger::GlobalShortcut
            | Trigger::ClipboardChange
    ) {
        return Err(
            "script actions can only run from manual, shortcut, or clipboardChange triggers in this slice"
                .to_string(),
        );
    }
    if !action.triggers.contains(&request.context.trigger) {
        return Err(format!(
            "script action does not declare trigger {}",
            request.context.trigger.as_log_value()
        ));
    }
    validate_action_input(storage, &action, &request.context)?;

    let script = action
        .script
        .as_ref()
        .ok_or_else(|| "script action is missing source metadata".to_string())?;
    let action_file = PathBuf::from(&script.path);
    if !action_file.exists() {
        return Err(format!("script file not found: {}", action_file.display()));
    }

    run_script_action_definition(
        app,
        window,
        storage,
        suppression,
        previous_window,
        action,
        action_file,
        request.context.clone(),
    )
}

#[cfg(not(test))]
pub fn run_temporary_script_action<R: Runtime + 'static>(
    app: &AppHandle<R>,
    window: Option<&WebviewWindow<R>>,
    storage: &crate::storage::AppStorage,
    suppression: &crate::clipboard::SelfWriteSuppression,
    previous_window: &crate::window_focus::PreviousWindow,
    action: ActionDefinition,
    script_source: &str,
    context: ActionContext,
) -> ActionRunResult {
    let started_at = now_unix_ms();
    let input_summary_json = input_summary_json(storage, &context);
    let temp_path = std::env::temp_dir().join(format!(
        "copicu-ai-script-{}-{}.ts",
        started_at,
        std::process::id()
    ));
    let run_result = (|| {
        std::fs::write(&temp_path, script_source)
            .map_err(|error| format!("failed to write temporary AI script: {error}"))?;
        run_script_action_definition(
            app,
            window,
            storage,
            suppression,
            previous_window,
            action.clone(),
            temp_path.clone(),
            context.clone(),
        )
    })();
    let _ = std::fs::remove_file(&temp_path);
    let finished_at = now_unix_ms();

    let (status, message, toasts, effects, error_class, error_message) = match run_result {
        Ok(run) => (
            ActionRunStatus::Completed,
            run.message,
            run.toasts,
            run.effects,
            None,
            None,
        ),
        Err(error) => (
            ActionRunStatus::Failed,
            error.clone(),
            Vec::new(),
            Vec::new(),
            Some("AiScriptError".to_string()),
            Some(redact_error(&error)),
        ),
    };

    if let Err(error) = storage.insert_action_run(crate::storage::NewActionRun {
        action_id: action.id.clone(),
        trigger: context.trigger.as_log_value().to_string(),
        status: match status {
            ActionRunStatus::Completed => "completed".to_string(),
            ActionRunStatus::Failed => "failed".to_string(),
        },
        started_at_unix_ms: started_at,
        finished_at_unix_ms: finished_at,
        duration_ms: finished_at.saturating_sub(started_at),
        input_summary_json,
        error_class,
        error_message,
    }) {
        eprintln!("AI script action run logging failed: {error}");
    }

    ActionRunResult {
        action_id: action.id,
        status,
        message,
        toasts,
        effects,
    }
}

#[cfg(not(test))]
fn run_script_action_definition<R: Runtime + 'static>(
    app: &AppHandle<R>,
    window: Option<&WebviewWindow<R>>,
    storage: &crate::storage::AppStorage,
    suppression: &crate::clipboard::SelfWriteSuppression,
    previous_window: &crate::window_focus::PreviousWindow,
    action: ActionDefinition,
    action_file: PathBuf,
    context: ActionContext,
) -> Result<ScriptOrBuiltinRun, String> {
    if !unsupported_script_capabilities(&action).is_empty() {
        return Err(format!(
            "script action uses unsupported capabilities: {}",
            unsupported_script_capabilities(&action).join(", ")
        ));
    }
    validate_action_input(storage, &action, &context)?;

    let settings = storage.get_settings()?;
    let logs_folder = Path::new(&settings.scripts.folder_path).join(".logs");
    let selection_items = script_selection_items(storage, &context.selected_item_ids)?;
    let runner_request = ScriptRunnerRequest {
        action_file: action_file.to_string_lossy().into_owned(),
        logs_folder: logs_folder.to_string_lossy().into_owned(),
        action,
        context,
        selection_items,
    };
    let runner_result =
        run_node_script_runner(app, window, storage, previous_window, &runner_request)?;
    let mut toasts = Vec::new();
    let mut effects = Vec::new();

    for operation in runner_result.raw_operations {
        match operation {
            ScriptOperation::ClipboardWriteText { text } => {
                let hash = crate::storage::hash_text(&text);
                suppression.suppress_hash(hash.clone());
                app.clipboard().write_text(text).map_err(|error| {
                    suppression.clear_if_hash(&hash);
                    format!("script failed to write clipboard text: {error}")
                })?;
            }
            ScriptOperation::ClipboardWriteItem { item_id } => {
                crate::host::write_item(
                    app,
                    storage,
                    suppression,
                    parse_script_item_id(&item_id)?,
                )?;
            }
            ScriptOperation::UiToast { toast } => toasts.push(toast),
            ScriptOperation::UiNotify { notification } => {
                send_script_notification_on_main_thread(app, notification)?;
            }
            ScriptOperation::UiMarkdownOutput { output } => {
                open_ai_output_window_on_main_thread(app, output)?;
            }
            ScriptOperation::PickerOpen { options } => {
                let window =
                    window.ok_or_else(|| "picker window is required to open picker".to_string())?;
                open_picker_window_on_main_thread(window.clone(), previous_window, options)?;
            }
            ScriptOperation::PickerFilter { query } => {
                effects.push(ActionEffect::PickerFilter { query });
            }
            ScriptOperation::PickerActivate { item_id, options } => {
                crate::host::activate_item(
                    app,
                    window,
                    storage,
                    suppression,
                    previous_window,
                    crate::host::ActivateItemRequest {
                        item_id: parse_script_item_id(&item_id)?,
                        copy: options.copy,
                        mark_used: options.mark_used,
                        hide_picker: options.hide_picker,
                        focus_previous: options.focus_previous,
                        paste: options.paste,
                        paste_shortcut: options.paste_shortcut,
                    },
                )?;
            }
            ScriptOperation::PickerShow => {
                let window =
                    window.ok_or_else(|| "picker window is required to show picker".to_string())?;
                show_picker_window_on_main_thread(window.clone())?;
            }
            ScriptOperation::PickerHide => {
                let window =
                    window.ok_or_else(|| "picker window is required to hide picker".to_string())?;
                hide_picker_window_on_main_thread(window.clone())?;
            }
            ScriptOperation::WindowRememberPrevious => {
                previous_window.remember_foreground_excluding(window)?;
            }
            ScriptOperation::WindowFocusPrevious => {
                previous_window.focus_previous()?;
            }
            ScriptOperation::InputPaste { shortcut } => {
                previous_window.send_paste_shortcut(&shortcut)?;
            }
        }
    }

    if runner_result.status == "failed" {
        return Err(runner_result.message);
    }

    let message = if runner_result.log_count > 0 {
        format!(
            "{} ({} log entries)",
            runner_result.message, runner_result.log_count
        )
    } else {
        runner_result.message
    };

    Ok(ScriptOrBuiltinRun {
        message,
        toasts,
        effects,
    })
}

#[cfg(not(test))]
fn send_script_notification<R: Runtime>(
    app: &AppHandle<R>,
    notification: ActionNotification,
) -> Result<(), String> {
    let title = notification
        .title
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("Copicu");
    let body = notification.body.trim();
    if body.is_empty() {
        return Ok(());
    }

    let native_title = title.to_string();
    let native_body = body.to_string();
    app.emit_to(
        MAIN_WINDOW_LABEL,
        NOTIFICATION_TOAST_EVENT,
        ActionToast {
            title: Some(native_title.clone()),
            message: native_body.clone(),
            tone: ToastTone::Info,
            duration_ms: Some(2800),
        },
    )
    .map_err(|error| format!("failed to emit script notification toast: {error}"))?;

    let app = app.clone();
    thread::spawn(move || {
        if let Err(error) = app
            .notification()
            .builder()
            .title(&native_title)
            .body(&native_body)
            .show()
        {
            eprintln!("script native notification failed: {error}");
        }
    });

    Ok(())
}

#[cfg(not(test))]
fn send_script_notification_on_main_thread<R: Runtime + 'static>(
    app: &AppHandle<R>,
    notification: ActionNotification,
) -> Result<(), String> {
    let app = app.clone();
    app.clone()
        .run_on_main_thread(move || {
            if let Err(error) = send_script_notification(&app, notification) {
                eprintln!("script native notification failed: {error}");
            }
        })
        .map_err(|error| format!("native notification dispatch failed: {error}"))
}

#[cfg(not(test))]
fn open_ai_output_window_on_main_thread<R: Runtime + 'static>(
    app: &AppHandle<R>,
    output: crate::MarkdownOutputPayload,
) -> Result<(), String> {
    let app = app.clone();
    app.clone()
        .run_on_main_thread(move || {
            if let Err(error) = crate::open_ai_output_window(&app, output) {
                eprintln!("script markdown output failed: {error}");
            }
        })
        .map_err(|error| format!("markdown output dispatch failed: {error}"))
}

#[cfg(not(test))]
fn show_picker_window_on_main_thread<R: Runtime + 'static>(
    window: WebviewWindow<R>,
) -> Result<(), String> {
    let app = window.app_handle().clone();
    app.run_on_main_thread(move || {
        if let Err(error) = window.show() {
            eprintln!("script picker show failed: {error}");
            return;
        }
        if let Err(error) = window.set_focus() {
            eprintln!("script picker focus failed: {error}");
        }
    })
    .map_err(|error| format!("picker show dispatch failed: {error}"))
}

#[cfg(not(test))]
fn open_picker_window_on_main_thread<R: Runtime + 'static>(
    window: WebviewWindow<R>,
    previous_window: &crate::window_focus::PreviousWindow,
    options: ScriptPickerOpenOptions,
) -> Result<(), String> {
    if options.remember_previous.unwrap_or(false) {
        previous_window.remember_foreground_excluding(Some(&window))?;
    }

    let app = window.app_handle().clone();
    app.run_on_main_thread(move || {
        let started = std::time::Instant::now();
        script_diag_log(
            "script.picker.open.start",
            format!(
                "show={} focus={:?} query={}",
                options.show.unwrap_or(true),
                options.focus.unwrap_or(PickerOpenFocus::Search),
                options
                    .query
                    .as_ref()
                    .map(|query| !query.is_empty())
                    .unwrap_or(false)
            ),
        );
        if options.show.unwrap_or(true) {
            if let Err(error) = window.show() {
                eprintln!("script picker open show failed: {error}");
                return;
            }
            script_diag_log("script.picker.open.step", "show ok");
            if let Err(error) = window.unminimize() {
                eprintln!("script picker open unminimize failed: {error}");
            } else {
                script_diag_log("script.picker.open.step", "unminimize ok");
            }
        }
        if options.focus.unwrap_or(PickerOpenFocus::Search) != PickerOpenFocus::None {
            if let Err(error) = window.set_focus() {
                eprintln!("script picker open focus failed: {error}");
            } else {
                script_diag_log("script.picker.open.step", "set_focus requested");
            }
            if !window.is_focused().unwrap_or(false) {
                if let Err(error) = crate::window_focus::focus_tauri_window(&window) {
                    eprintln!("script picker open native focus failed: {error}");
                } else {
                    script_diag_log("script.picker.open.step", "native focus ok");
                }
            }
            if !window.is_focused().unwrap_or(false) {
                std::thread::sleep(std::time::Duration::from_millis(60));
                if let Err(error) = window.set_focus() {
                    eprintln!("script picker open delayed focus failed: {error}");
                } else {
                    script_diag_log("script.picker.open.step", "delayed set_focus requested");
                }
                if !window.is_focused().unwrap_or(false) {
                    if let Err(error) = crate::window_focus::focus_tauri_window(&window) {
                        eprintln!("script picker open delayed native focus failed: {error}");
                    } else {
                        script_diag_log("script.picker.open.step", "delayed native focus ok");
                    }
                }
            }
        }
        if let Some(query) = options.query {
            emit_picker_filter_deferred(window.clone(), query);
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
        script_diag_log(
            "script.picker.open.done",
            format!(
                "elapsed_ms={} visible={visible} focused={focused} position={position} size={size}",
                started.elapsed().as_millis()
            ),
        );
    })
    .map_err(|error| format!("picker open dispatch failed: {error}"))
}

#[cfg(not(test))]
fn emit_picker_filter_deferred<R: Runtime + 'static>(window: WebviewWindow<R>, query: String) {
    thread::spawn(move || {
        thread::sleep(std::time::Duration::from_millis(180));
        let app = window.app_handle().clone();
        if let Err(error) = app.run_on_main_thread(move || {
            if let Err(error) =
                window.emit(PICKER_FILTER_EVENT, serde_json::json!({ "query": query }))
            {
                eprintln!("script picker open filter emit failed: {error}");
            } else {
                script_diag_log("script.picker.open.step", "filter emitted deferred");
            }
        }) {
            eprintln!("script picker open filter dispatch failed: {error}");
        }
    });
}

#[cfg(not(test))]
fn script_diag_log(event: &str, detail: impl AsRef<str>) {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default();
    eprintln!("[diag {now}] {event}: {}", detail.as_ref());
}

#[cfg(not(test))]
fn hide_picker_window_on_main_thread<R: Runtime + 'static>(
    window: WebviewWindow<R>,
) -> Result<(), String> {
    let app = window.app_handle().clone();
    app.run_on_main_thread(move || {
        if let Err(error) = crate::host::hide_picker(&window) {
            eprintln!("script picker hide failed: {error}");
        }
    })
    .map_err(|error| format!("picker hide dispatch failed: {error}"))
}

#[cfg(not(test))]
fn emit_script_toast_on_main_thread<R: Runtime + 'static>(
    app: &AppHandle<R>,
    toast: ActionToast,
    source: &'static str,
) {
    let app = app.clone();
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
pub fn run_clipboard_change_actions<R: Runtime>(
    app: &AppHandle<R>,
    storage: &crate::storage::AppStorage,
    suppression: &crate::clipboard::SelfWriteSuppression,
    previous_window: &crate::window_focus::PreviousWindow,
    item_id: i64,
) {
    if std::env::var("COPICU_DISABLE_CLIPBOARD_CHANGE_ACTIONS")
        .map(|value| matches!(value.as_str(), "1" | "true" | "TRUE" | "yes" | "YES"))
        .unwrap_or(false)
    {
        return;
    }

    let actions = match storage.list_cached_script_actions() {
        Ok(actions) => actions,
        Err(error) => {
            eprintln!("clipboardChange script cache read failed: {error}");
            return;
        }
    };
    let window = app.get_webview_window("main");

    for action in actions {
        if !is_clipboard_change_candidate(storage, &action, item_id) {
            continue;
        }

        let result = run_action(
            app,
            window.as_ref(),
            storage,
            suppression,
            previous_window,
            RunActionRequest {
                action_id: action.id.clone(),
                context: ActionContext {
                    trigger: Trigger::ClipboardChange,
                    shortcut: None,
                    current_item_id: Some(item_id),
                    selected_item_ids: Vec::new(),
                    view: None,
                },
            },
        );

        eprintln!(
            "clipboardChange script run: {} -> {:?}: {}",
            action.id, result.status, result.message
        );
        for toast in result.toasts {
            emit_script_toast_on_main_thread(app, toast.clone(), "clipboardChange script");
            eprintln!(
                "clipboardChange script toast from {}: {}",
                action.id, toast.message
            );
        }
    }
}

#[cfg(not(test))]
fn is_clipboard_change_candidate(
    storage: &crate::storage::AppStorage,
    action: &ActionDefinition,
    item_id: i64,
) -> bool {
    if action.source != ActionSource::Script
        || !action.triggers.contains(&Trigger::ClipboardChange)
        || action
            .diagnostics
            .iter()
            .any(|diagnostic| diagnostic.severity == DiagnosticSeverity::Error)
        || action.input.source != ActionInputSource::Clipboard
        || !matches!(
            action.input.selection,
            SelectionRequirement::None | SelectionRequirement::Optional
        )
    {
        return false;
    }

    if !unsupported_script_capabilities(action).is_empty() {
        return false;
    }

    let context = ActionContext {
        trigger: Trigger::ClipboardChange,
        shortcut: None,
        current_item_id: Some(item_id),
        selected_item_ids: Vec::new(),
        view: None,
    };

    validate_action_input(storage, action, &context).is_ok()
}

#[cfg(not(test))]
fn find_script_action(
    storage: &crate::storage::AppStorage,
    action_id: &str,
) -> Result<Option<ActionDefinition>, String> {
    let actions = storage.list_cached_script_actions()?;
    Ok(actions.into_iter().find(|action| action.id == action_id))
}

#[cfg(not(test))]
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ScriptRunnerRequest {
    action_file: String,
    logs_folder: String,
    action: ActionDefinition,
    context: ActionContext,
    selection_items: Vec<ScriptSelectionItem>,
}

#[cfg(not(test))]
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ScriptSelectionItem {
    id: String,
    kind: String,
    text: Option<String>,
    title: Option<String>,
    notes: Option<String>,
    tags: Vec<String>,
    mime_primary: Option<String>,
}

#[cfg(not(test))]
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ScriptRunnerResult {
    status: String,
    message: String,
    raw_operations: Vec<ScriptOperation>,
    log_count: i64,
}

#[cfg(not(test))]
#[derive(Deserialize)]
#[serde(tag = "type")]
enum ScriptOperation {
    #[serde(rename = "clipboard.writeText")]
    ClipboardWriteText { text: String },
    #[serde(rename = "clipboard.writeItem")]
    ClipboardWriteItem {
        #[serde(rename = "itemId")]
        item_id: String,
    },
    #[serde(rename = "ui.toast")]
    UiToast { toast: ActionToast },
    #[serde(rename = "ui.notify")]
    UiNotify { notification: ActionNotification },
    #[serde(rename = "ui.markdownOutput")]
    UiMarkdownOutput {
        output: crate::MarkdownOutputPayload,
    },
    #[serde(rename = "picker.filter")]
    PickerFilter { query: String },
    #[serde(rename = "picker.open")]
    PickerOpen { options: ScriptPickerOpenOptions },
    #[serde(rename = "picker.activate")]
    PickerActivate {
        #[serde(rename = "itemId")]
        item_id: String,
        options: ScriptPickerActivateOptions,
    },
    #[serde(rename = "picker.show")]
    PickerShow,
    #[serde(rename = "picker.hide")]
    PickerHide,
    #[serde(rename = "window.rememberPrevious")]
    WindowRememberPrevious,
    #[serde(rename = "window.focusPrevious")]
    WindowFocusPrevious,
    #[serde(rename = "input.paste")]
    InputPaste {
        shortcut: crate::host::PasteShortcut,
    },
}

#[cfg(not(test))]
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ScriptPickerActivateOptions {
    copy: bool,
    mark_used: bool,
    hide_picker: bool,
    focus_previous: bool,
    paste: bool,
    paste_shortcut: crate::host::PasteShortcut,
}

#[cfg(not(test))]
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ScriptPickerOpenOptions {
    query: Option<String>,
    remember_previous: Option<bool>,
    show: Option<bool>,
    focus: Option<PickerOpenFocus>,
}

#[cfg(not(test))]
#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
enum PickerOpenFocus {
    Search,
    None,
}

#[cfg(not(test))]
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ScriptHostCall {
    #[serde(rename = "kind")]
    _kind: String,
    id: i64,
    method: String,
    payload: serde_json::Value,
}

#[cfg(not(test))]
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ScriptCommandsRunPayload {
    command_id: String,
    params: serde_json::Value,
}

#[cfg(not(test))]
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ScriptProtocolResult {
    #[serde(rename = "kind")]
    _kind: String,
    result: ScriptRunnerResult,
}

#[cfg(not(test))]
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct HistorySearchPayload {
    query: String,
    limit: Option<i64>,
    content: Option<bool>,
}

#[cfg(not(test))]
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct HistoryGetPayload {
    id: String,
    content: Option<bool>,
}

#[cfg(not(test))]
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct HistoryUpdatePayload {
    id: String,
    patch: ScriptHistoryPatch,
}

#[cfg(not(test))]
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct HistoryRemovePayload {
    id: String,
}

#[cfg(not(test))]
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ScriptHistoryPatch {
    text: Option<Option<String>>,
    title: Option<Option<String>>,
    notes: Option<Option<String>>,
    tags: Option<Option<serde_json::Value>>,
    marked: Option<bool>,
}

#[cfg(not(test))]
fn script_selection_items(
    storage: &crate::storage::AppStorage,
    item_ids: &[i64],
) -> Result<Vec<ScriptSelectionItem>, String> {
    item_ids
        .iter()
        .map(|item_id| {
            let item = storage.get_item(*item_id)?;
            let value = serde_json::to_value(&item)
                .map_err(|error| format!("failed to encode selected item: {error}"))?;
            Ok(ScriptSelectionItem {
                id: value["id"].as_i64().unwrap_or(*item_id).to_string(),
                kind: value["content_kind"]
                    .as_str()
                    .unwrap_or("unknown")
                    .to_string(),
                text: value["text"].as_str().map(ToString::to_string),
                title: value["title"].as_str().map(ToString::to_string),
                notes: value["notes"].as_str().map(ToString::to_string),
                tags: value["tags"]
                    .as_str()
                    .map(parse_script_tags)
                    .unwrap_or_default(),
                mime_primary: value["mime_primary"].as_str().map(ToString::to_string),
            })
        })
        .collect()
}

#[cfg(not(test))]
fn parse_script_tags(value: &str) -> Vec<String> {
    value
        .split(|character: char| character.is_whitespace() || character == ',')
        .map(str::trim)
        .filter(|part| !part.is_empty())
        .map(ToString::to_string)
        .collect()
}

#[cfg(not(test))]
fn handle_script_host_call<R: Runtime>(
    app: &AppHandle<R>,
    window: Option<&WebviewWindow<R>>,
    storage: &crate::storage::AppStorage,
    previous_window: &crate::window_focus::PreviousWindow,
    action: &ActionDefinition,
    call: &ScriptHostCall,
) -> String {
    let result = validate_script_host_capabilities(action, call.method.as_str()).and_then(|()| {
        dispatch_script_host_call(app, window, storage, previous_window, action, call)
    });

    match result {
        Ok(result) => json!({
            "kind": "hostResponse",
            "id": call.id,
            "result": result
        })
        .to_string(),
        Err(error) => json!({
            "kind": "hostResponse",
            "id": call.id,
            "error": redact_error(&error)
        })
        .to_string(),
    }
}

#[cfg(not(test))]
fn script_commands_run<R: Runtime + 'static>(
    window: Option<&WebviewWindow<R>>,
    previous_window: &crate::window_focus::PreviousWindow,
    action: &ActionDefinition,
    payload: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let payload: ScriptCommandsRunPayload = serde_json::from_value(payload)
        .map_err(|error| format!("invalid commands.run payload: {error}"))?;
    validate_script_command_capabilities(action, payload.command_id.as_str())?;

    match payload.command_id.as_str() {
        "picker.open" => {
            let options: ScriptPickerOpenOptions = serde_json::from_value(payload.params)
                .map_err(|error| format!("invalid picker.open command params: {error}"))?;
            let window =
                window.ok_or_else(|| "picker window is required to run picker.open".to_string())?;
            open_picker_window_on_main_thread(window.clone(), previous_window, options)?;
            Ok(json!(null))
        }
        _ => Err(format!("unsupported host command: {}", payload.command_id)),
    }
}

#[cfg(not(test))]
fn script_ui_alert<R: Runtime>(
    app: &AppHandle<R>,
    payload: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let options: crate::ui_host::UiAlertOptions = serde_json::from_value(payload)
        .map_err(|error| format!("invalid ui.alert payload: {error}"))?;
    crate::ui_host::request_alert(app, options).map(|()| json!(null))
}

#[cfg(not(test))]
fn script_ui_confirm<R: Runtime>(
    app: &AppHandle<R>,
    payload: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let options: crate::ui_host::UiConfirmOptions = serde_json::from_value(payload)
        .map_err(|error| format!("invalid ui.confirm payload: {error}"))?;
    crate::ui_host::request_confirm(app, options).map(|value| json!(value))
}

#[cfg(not(test))]
fn script_ui_input<R: Runtime>(
    app: &AppHandle<R>,
    payload: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let options: crate::ui_host::UiInputOptions = serde_json::from_value(payload)
        .map_err(|error| format!("invalid ui.input payload: {error}"))?;
    crate::ui_host::request_input(app, options).map(|value| json!(value))
}

#[cfg(not(test))]
fn script_clipboard_read<R: Runtime>(app: &AppHandle<R>) -> Result<serde_json::Value, String> {
    let text = app
        .clipboard()
        .read_text()
        .map_err(|error| format!("failed to read clipboard text: {error}"))?;
    Ok(json!({ "text": text }))
}

#[cfg(not(test))]
fn script_ai_respond_markdown(
    storage: &crate::storage::AppStorage,
    method: &str,
    payload: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let request = if method == "ai.summarizeMarkdown" {
        legacy_summary_payload_to_response(payload)?
    } else {
        serde_json::from_value::<crate::ai_planner::AiMarkdownResponseRequest>(payload)
            .map_err(|error| format!("invalid ai.respondMarkdown payload: {error}"))?
    };
    let settings = storage.get_settings()?;
    let markdown = crate::ai_planner::respond_markdown(&settings.ai, request)?;
    Ok(json!({ "markdown": markdown }))
}

#[cfg(not(test))]
fn legacy_summary_payload_to_response(
    payload: serde_json::Value,
) -> Result<crate::ai_planner::AiMarkdownResponseRequest, String> {
    #[derive(serde::Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct LegacySummaryRequest {
        instruction: String,
        #[serde(default)]
        title: Option<String>,
        #[serde(default)]
        items: Vec<crate::ai_planner::AiMarkdownResponseItem>,
    }

    let legacy: LegacySummaryRequest = serde_json::from_value(payload)
        .map_err(|error| format!("invalid ai.summarizeMarkdown payload: {error}"))?;
    Ok(crate::ai_planner::AiMarkdownResponseRequest {
        instruction: legacy.instruction,
        context: crate::ai_planner::AiMarkdownResponseContext {
            title: legacy.title,
            source: Some("copicu.ai.summarizeMarkdown".to_string()),
            ..Default::default()
        },
        items: legacy.items,
    })
}

#[cfg(not(test))]
fn script_history_search(
    storage: &crate::storage::AppStorage,
    payload: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let payload: HistorySearchPayload = serde_json::from_value(payload)
        .map_err(|error| format!("invalid history.search payload: {error}"))?;
    let page = storage.history_search(crate::storage::HistorySearchRequest {
        query: payload.query,
        cursor: None,
        limit: payload.limit,
        plan: None,
        mode: crate::storage::HistorySearchMode::Structured,
        include_content: payload.content.unwrap_or(false),
        include_counts: true,
        explain: false,
        ai_context: None,
    })?;
    let content = payload.content.unwrap_or(false);
    serde_json::to_value(
        page.items
            .iter()
            .map(|item| script_item_from_history(item, content))
            .collect::<Vec<_>>(),
    )
    .map_err(|error| format!("failed to encode history.search result: {error}"))
}

#[cfg(not(test))]
fn script_history_get(
    storage: &crate::storage::AppStorage,
    payload: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let payload: HistoryGetPayload = serde_json::from_value(payload)
        .map_err(|error| format!("invalid history.get payload: {error}"))?;
    let item = storage.get_item(parse_script_item_id(&payload.id)?)?;
    serde_json::to_value(script_item_from_history(
        &item,
        payload.content.unwrap_or(false),
    ))
    .map_err(|error| format!("failed to encode history.get result: {error}"))
}

#[cfg(not(test))]
fn script_history_remove(
    storage: &crate::storage::AppStorage,
    payload: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let payload: HistoryRemovePayload = serde_json::from_value(payload)
        .map_err(|error| format!("invalid history.remove payload: {error}"))?;
    storage.delete_item(parse_script_item_id(&payload.id)?)?;
    Ok(json!(null))
}

#[cfg(not(test))]
fn script_history_update(
    storage: &crate::storage::AppStorage,
    payload: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let payload: HistoryUpdatePayload = serde_json::from_value(payload)
        .map_err(|error| format!("invalid history.update payload: {error}"))?;
    let item_id = parse_script_item_id(&payload.id)?;
    if payload.patch.marked.is_some()
        && payload.patch.text.is_none()
        && payload.patch.title.is_none()
        && payload.patch.notes.is_none()
        && payload.patch.tags.is_none()
    {
        storage.set_items_marked(crate::storage::SetHistoryItemsMarkedRequest {
            ids: vec![item_id],
            marked: payload.patch.marked.unwrap_or(false),
        })?;
        return Ok(json!(null));
    }
    let existing = storage.get_item(item_id)?;
    let existing_value = serde_json::to_value(&existing)
        .map_err(|error| format!("failed to encode existing item: {error}"))?;
    let request = crate::storage::UpdateHistoryItemRequest {
        id: item_id,
        text: payload
            .patch
            .text
            .flatten()
            .unwrap_or_else(|| existing_value["text"].as_str().unwrap_or("").to_string()),
        title: payload
            .patch
            .title
            .flatten()
            .or_else(|| existing_value["title"].as_str().map(ToString::to_string)),
        notes: payload
            .patch
            .notes
            .flatten()
            .or_else(|| existing_value["notes"].as_str().map(ToString::to_string)),
        tags: payload
            .patch
            .tags
            .flatten()
            .map(script_tags_to_string)
            .or_else(|| existing_value["tags"].as_str().map(ToString::to_string)),
        mime_primary: existing_value["mime_primary"]
            .as_str()
            .map(ToString::to_string),
        marked: payload.patch.marked,
    };
    storage.update_item(request)?;
    Ok(json!(null))
}

#[cfg(not(test))]
fn script_item_from_history(
    item: &crate::storage::HistoryItem,
    content: bool,
) -> ScriptSelectionItem {
    let value = serde_json::to_value(item).unwrap_or_else(|_| json!({}));
    ScriptSelectionItem {
        id: value["id"].as_i64().unwrap_or_default().to_string(),
        kind: value["content_kind"]
            .as_str()
            .unwrap_or("unknown")
            .to_string(),
        text: if content {
            value["text"].as_str().map(ToString::to_string)
        } else {
            None
        },
        title: value["title"].as_str().map(ToString::to_string),
        notes: value["notes"].as_str().map(ToString::to_string),
        tags: value["tags"]
            .as_str()
            .map(parse_script_tags)
            .unwrap_or_default(),
        mime_primary: value["mime_primary"].as_str().map(ToString::to_string),
    }
}

#[cfg(not(test))]
fn script_tags_to_string(value: serde_json::Value) -> String {
    if let Some(items) = value.as_array() {
        return items
            .iter()
            .filter_map(serde_json::Value::as_str)
            .map(str::trim)
            .filter(|part| !part.is_empty())
            .collect::<Vec<_>>()
            .join(" ");
    }
    value.as_str().unwrap_or_default().to_string()
}

#[cfg(not(test))]
fn parse_script_item_id(value: &str) -> Result<i64, String> {
    value
        .parse::<i64>()
        .map_err(|_| format!("invalid item id: {value}"))
}

#[cfg(not(test))]
fn run_node_script_runner<R: Runtime>(
    app: &AppHandle<R>,
    window: Option<&WebviewWindow<R>>,
    storage: &crate::storage::AppStorage,
    previous_window: &crate::window_focus::PreviousWindow,
    request: &ScriptRunnerRequest,
) -> Result<ScriptRunnerResult, String> {
    let runner_path = find_script_runner_path()?;
    let project_root = runner_path
        .parent()
        .and_then(Path::parent)
        .ok_or_else(|| format!("invalid script runner path: {}", runner_path.display()))?;
    let mut child = Command::new("node")
        .arg(&runner_path)
        .current_dir(project_root)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("failed to start Node script runner: {error}"))?;

    let mut stdin = child
        .stdin
        .take()
        .ok_or_else(|| "failed to open script runner stdin".to_string())?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "failed to open script runner stdout".to_string())?;
    let mut stderr = child
        .stderr
        .take()
        .ok_or_else(|| "failed to open script runner stderr".to_string())?;
    let stderr_reader = thread::spawn(move || {
        let mut text = String::new();
        let _ = stderr.read_to_string(&mut text);
        text
    });
    let (stdout_tx, stdout_rx) = mpsc::channel::<Result<String, String>>();
    let stdout_reader = thread::spawn(move || {
        for line in BufReader::new(stdout).lines() {
            let message =
                line.map_err(|error| format!("failed to read script runner output: {error}"));
            let should_stop = message.is_err();
            if stdout_tx.send(message).is_err() || should_stop {
                break;
            }
        }
    });

    let payload = serde_json::to_string(request)
        .map_err(|error| format!("failed to encode script runner request: {error}"))?;
    writeln!(stdin, "{payload}")
        .map_err(|error| format!("failed to write script runner request: {error}"))?;

    let mut result: Option<ScriptRunnerResult> = None;
    let started_at = Instant::now();
    loop {
        if let Some(status) = child
            .try_wait()
            .map_err(|error| format!("failed to poll script runner: {error}"))?
        {
            if !status.success() && result.as_ref().is_none_or(|value| value.status != "failed") {
                break;
            }
        }

        let elapsed = started_at.elapsed();
        if elapsed >= SCRIPT_RUNNER_TIMEOUT {
            let error = kill_timed_out_script_runner(&mut child);
            drop(stdin);
            let _ = stdout_reader.join();
            let _ = stderr_reader.join();
            return Err(error);
        }

        let wait_for = SCRIPT_RUNNER_TIMEOUT.saturating_sub(elapsed);
        let line = match stdout_rx.recv_timeout(wait_for) {
            Ok(line) => line?,
            Err(mpsc::RecvTimeoutError::Timeout) => {
                let error = kill_timed_out_script_runner(&mut child);
                drop(stdin);
                let _ = stdout_reader.join();
                let _ = stderr_reader.join();
                return Err(error);
            }
            Err(mpsc::RecvTimeoutError::Disconnected) => break,
        };
        if line.trim().is_empty() {
            continue;
        }
        let value: serde_json::Value = serde_json::from_str(&line)
            .map_err(|error| format!("failed to decode script runner protocol: {error}"))?;
        match value.get("kind").and_then(serde_json::Value::as_str) {
            Some("hostCall") => {
                let call: ScriptHostCall = serde_json::from_value(value)
                    .map_err(|error| format!("failed to decode script host call: {error}"))?;
                let response = handle_script_host_call(
                    app,
                    window,
                    storage,
                    previous_window,
                    &request.action,
                    &call,
                );
                writeln!(stdin, "{}", response)
                    .map_err(|error| format!("failed to write script host response: {error}"))?;
            }
            Some("result") => {
                let protocol_result: ScriptProtocolResult = serde_json::from_value(value)
                    .map_err(|error| format!("failed to decode script runner result: {error}"))?;
                result = Some(protocol_result.result);
                break;
            }
            _ => {
                return Err("script runner produced invalid protocol message".to_string());
            }
        }
    }

    drop(stdin);
    let status = wait_for_script_runner_exit(&mut child, started_at)?;
    let _ = stdout_reader.join();
    let stderr = stderr_reader.join().unwrap_or_default();
    let result = result.ok_or_else(|| {
        format!(
            "script runner produced no result{}",
            if stderr.trim().is_empty() {
                String::new()
            } else {
                format!(": {}", redact_error(stderr.trim()))
            }
        )
    })?;
    if !status.success() && result.status != "failed" {
        return Err(format!(
            "script runner failed: {}",
            redact_error(stderr.trim())
        ));
    }
    Ok(result)
}

#[cfg(not(test))]
fn wait_for_script_runner_exit(
    child: &mut Child,
    started_at: Instant,
) -> Result<ExitStatus, String> {
    wait_for_child_exit_with_timeout(child, started_at, SCRIPT_RUNNER_TIMEOUT)
}

fn wait_for_child_exit_with_timeout(
    child: &mut Child,
    started_at: Instant,
    timeout: Duration,
) -> Result<ExitStatus, String> {
    loop {
        if let Some(status) = child
            .try_wait()
            .map_err(|error| format!("failed to poll script runner: {error}"))?
        {
            return Ok(status);
        }
        let elapsed = started_at.elapsed();
        if elapsed >= timeout {
            return Err(kill_timed_out_child(child, timeout));
        }
        thread::sleep(Duration::from_millis(25).min(timeout - elapsed));
    }
}

#[cfg(not(test))]
fn kill_timed_out_script_runner(child: &mut Child) -> String {
    kill_timed_out_child(child, SCRIPT_RUNNER_TIMEOUT)
}

fn kill_timed_out_child(child: &mut Child, timeout: Duration) -> String {
    let _ = child.kill();
    let _ = child.wait();
    format!(
        "{} {}ms",
        SCRIPT_RUNNER_TIMEOUT_ERROR_PREFIX,
        timeout.as_millis()
    )
}

#[cfg(not(test))]
fn find_script_runner_path() -> Result<PathBuf, String> {
    let mut roots = Vec::new();
    if let Ok(current_dir) = std::env::current_dir() {
        roots.push(current_dir);
    }
    if let Ok(current_exe) = std::env::current_exe() {
        if let Some(parent) = current_exe.parent() {
            roots.push(parent.to_path_buf());
        }
    }

    for root in roots {
        for ancestor in root.ancestors() {
            let candidate = ancestor.join("scripts").join("copicu-script-runner.mjs");
            if candidate.exists() {
                return Ok(candidate);
            }
            let sibling_candidate = ancestor
                .parent()
                .map(|parent| parent.join("scripts").join("copicu-script-runner.mjs"));
            if let Some(candidate) = sibling_candidate {
                if candidate.exists() {
                    return Ok(candidate);
                }
            }
        }
    }

    Err("scripts/copicu-script-runner.mjs not found".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn registry_has_stable_builtin_ids() {
        let actions = builtin_actions();
        let ids: Vec<_> = actions.iter().map(|action| action.id.as_str()).collect();

        assert_eq!(ids, vec![PASTE_PLAIN_ID, JOIN_SELECTED_ID, OPEN_URL_ID]);
        assert!(actions.iter().all(|action| action.builtin));
    }

    #[test]
    fn action_context_accepts_frontend_camel_case_shape() {
        let context: ActionContext = serde_json::from_value(serde_json::json!({
            "trigger": "itemMenu",
            "shortcut": null,
            "currentItemId": 7,
            "selectedItemIds": [7, 8],
            "view": {
                "query": "tag:test",
                "visibleItemIds": [7, 8, 9],
                "currentIndex": 0
            }
        }))
        .expect("context should deserialize");

        assert_eq!(context.trigger, Trigger::ItemMenu);
        assert_eq!(context.selected_item_ids, vec![7, 8]);
        assert_eq!(context.view.expect("view").visible_item_ids.len(), 3);
    }

    #[test]
    fn first_url_trims_common_punctuation() {
        assert_eq!(
            url::first_url("open (https://example.test/path).").as_deref(),
            Some("https://example.test/path")
        );
    }

    #[test]
    fn script_discovery_extracts_define_action_metadata() {
        let path = write_temp_script(
            "valid-action.ts",
            r#"
            export default defineAction({
              id: "examples.valid",
              title: "Valid Example",
              description: "Reads selected text",
              shortcut: "Ctrl+Alt+J",
              triggers: ["itemMenu", "commandPalette", "localShortcut"],
              input: {
                source: "pickerSelection",
                selection: "oneOrMore",
                kinds: ["text"],
                mime: ["text/plain"]
              },
              capabilities: ["history:read-content", "clipboard:write"],
              logging: { name: "valid-example.jsonl" },
              async run() {}
            });
            "#,
        );

        let action = super::discovery::discover_script_action(&path);

        assert_eq!(action.id, "examples.valid");
        assert_eq!(action.title, "Valid Example");
        assert_eq!(action.source, ActionSource::Script);
        assert!(!action.builtin);
        assert_eq!(action.shortcut.as_deref(), Some("Ctrl+Alt+J"));
        assert_eq!(
            action.triggers,
            vec![
                Trigger::ItemMenu,
                Trigger::CommandPalette,
                Trigger::LocalShortcut
            ]
        );
        assert_eq!(action.input.selection, SelectionRequirement::OneOrMore);
        assert_eq!(action.input.kinds, Some(vec![ClipKind::Text]));
        assert_eq!(
            action.logging.expect("logging").name.as_deref(),
            Some("valid-example.jsonl")
        );
        assert_eq!(action.diagnostics, Vec::new());
    }

    #[test]
    fn script_discovery_reports_invalid_log_name() {
        let path = write_temp_script(
            "bad-log.ts",
            r#"
            export default defineAction({
              id: "examples.badLog",
              title: "Bad Log",
              triggers: ["devRun"],
              input: { source: "none", selection: "none" },
              capabilities: ["log:write"],
              logging: { name: "../bad.jsonl" },
              run() {}
            });
            "#,
        );

        let action = super::discovery::discover_script_action(&path);

        assert_eq!(action.id, "examples.badLog");
        assert!(action
            .diagnostics
            .iter()
            .any(|diagnostic| diagnostic.message.contains("logging.name")));
    }

    #[test]
    fn list_actions_reads_cache_and_refresh_materializes_scripts() {
        let base_dir = std::env::temp_dir().join(format!(
            "copicu-action-cache-test-{}-{}",
            std::process::id(),
            now_unix_ms()
        ));
        let app_data_dir = base_dir.join("app-data");
        let scripts_dir = base_dir.join("scripts");
        std::fs::create_dir_all(&scripts_dir).expect("scripts dir should be created");
        std::fs::write(
            scripts_dir.join("cached-action.ts"),
            r#"
            export default defineAction({
              id: "examples.cacheOnly",
              title: "Cache Only",
              triggers: ["devRun"],
              input: { source: "none", selection: "none" },
              capabilities: [],
              async run() {}
            });
            "#,
        )
        .expect("synthetic script should write");

        let storage =
            crate::storage::AppStorage::open(&app_data_dir).expect("test storage should open");
        let mut settings = storage
            .get_settings()
            .expect("settings should load for cache test");
        settings.scripts.folder_path = scripts_dir.to_string_lossy().into_owned();
        storage
            .update_settings(settings)
            .expect("script folder setting should persist");

        let cached_before_refresh = list_actions(&storage).expect("cached actions should list");
        assert_eq!(cached_before_refresh.len(), builtin_actions().len());
        assert!(!cached_before_refresh
            .iter()
            .any(|action| action.id == "examples.cacheOnly"));

        let refreshed =
            refresh_script_action_cache(&storage).expect("script cache should refresh explicitly");
        assert_eq!(refreshed.len(), 1);
        assert_eq!(refreshed[0].id, "examples.cacheOnly");

        let cached_after_refresh = list_actions(&storage).expect("cached actions should list");
        assert!(cached_after_refresh
            .iter()
            .any(|action| action.id == "examples.cacheOnly"));

        let _ = std::fs::remove_dir_all(base_dir);
    }

    #[test]
    fn shortcut_normalization_matches_frontend_shape() {
        assert_eq!(
            normalize_shortcut_string(Some("control + alt + j")).as_deref(),
            Some("Ctrl+Alt+J")
        );
        assert_eq!(
            normalize_shortcut_string(Some("Ctrl+Shift+Comma")).as_deref(),
            Some("Ctrl+Shift+,")
        );
        assert_eq!(normalize_shortcut_string(Some("J")), None);
        assert_eq!(normalize_shortcut_string(Some("Ctrl+Nope")), None);
    }

    #[test]
    fn global_shortcut_diagnostics_reject_reserved_and_duplicates() {
        let mut actions = vec![
            test_script_action(
                "examples.reserved",
                "Ctrl+Shift+,",
                SelectionRequirement::None,
            ),
            test_script_action("examples.one", "Ctrl+Alt+J", SelectionRequirement::None),
            test_script_action("examples.two", "ctrl+alt+j", SelectionRequirement::None),
            test_script_action(
                "examples.selection",
                "Ctrl+Alt+K",
                SelectionRequirement::One,
            ),
            {
                let mut action = test_script_action(
                    "examples.unsupported",
                    "Ctrl+Alt+L",
                    SelectionRequirement::None,
                );
                action.capabilities = vec!["network:fetch".to_string()];
                action
            },
        ];

        annotate_global_shortcut_diagnostics(&mut actions);

        assert!(actions[0]
            .diagnostics
            .iter()
            .any(|diagnostic| diagnostic.message.contains("reserved")));
        assert!(actions[1]
            .diagnostics
            .iter()
            .any(|diagnostic| diagnostic.message.contains("collides")));
        assert!(actions[2]
            .diagnostics
            .iter()
            .any(|diagnostic| diagnostic.message.contains("collides")));
        assert!(actions[3]
            .diagnostics
            .iter()
            .any(|diagnostic| diagnostic.message.contains("empty selection")));
        assert!(actions[4]
            .diagnostics
            .iter()
            .any(|diagnostic| diagnostic.message.contains("unsupported capabilities")));
    }

    #[test]
    fn script_host_gateway_denies_history_remove_without_delete_capability() {
        let action =
            test_script_action("examples.delete", "Ctrl+Alt+D", SelectionRequirement::None);

        let error = validate_script_host_capabilities(&action, "history.remove")
            .expect_err("history.remove should require history:delete");

        assert!(error.contains("history.remove requires history:delete capability"));
    }

    #[test]
    fn script_host_gateway_denies_clipboard_read_without_read_capability() {
        let action = test_script_action(
            "examples.clipboard",
            "Ctrl+Alt+C",
            SelectionRequirement::None,
        );

        let error = validate_script_host_capabilities(&action, "clipboard.read")
            .expect_err("clipboard.read should require clipboard:read");

        assert!(error.contains("clipboard.read requires clipboard:read capability"));
    }

    #[test]
    fn script_host_gateway_allows_declared_host_capability() {
        let mut action =
            test_script_action("examples.search", "Ctrl+Alt+S", SelectionRequirement::None);
        action.capabilities = vec!["history:search".to_string()];

        validate_script_host_capabilities(&action, "history.search")
            .expect("history.search should allow history:search");
    }

    #[test]
    fn commands_run_picker_open_requires_command_specific_capability() {
        let mut action =
            test_script_action("examples.picker", "Ctrl+Alt+P", SelectionRequirement::None);
        action.capabilities = vec!["commands:run".to_string()];

        let error = validate_script_command_capabilities(&action, "picker.open")
            .expect_err("picker.open should require picker:open");

        assert!(error.contains("picker.open command requires picker:open capability"));
    }

    #[test]
    fn commands_run_picker_open_allows_declared_capabilities() {
        let mut action =
            test_script_action("examples.picker", "Ctrl+Alt+P", SelectionRequirement::None);
        action.capabilities = vec!["commands:run".to_string(), "picker:open".to_string()];

        validate_script_command_capabilities(&action, "picker.open")
            .expect("picker.open should allow commands:run plus picker:open");
    }

    #[test]
    fn script_runner_wait_timeout_kills_synthetic_child() {
        let mut child = std::process::Command::new("powershell")
            .args(["-NoProfile", "-Command", "Start-Sleep -Seconds 5"])
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .spawn()
            .expect("synthetic child should start");

        let error =
            wait_for_child_exit_with_timeout(&mut child, Instant::now(), Duration::from_millis(50))
                .expect_err("synthetic child should time out");

        assert!(error.contains(SCRIPT_RUNNER_TIMEOUT_ERROR_PREFIX));
        assert!(child
            .try_wait()
            .expect("child status should be readable")
            .is_some());
    }

    fn test_script_action(
        id: &str,
        shortcut: &str,
        selection: SelectionRequirement,
    ) -> ActionDefinition {
        ActionDefinition {
            id: id.to_string(),
            title: id.to_string(),
            description: String::new(),
            shortcut: Some(shortcut.to_string()),
            triggers: vec![Trigger::GlobalShortcut],
            input: ActionInput {
                source: ActionInputSource::None,
                selection,
                kinds: None,
                mime: None,
                query: None,
            },
            capabilities: Vec::new(),
            builtin: false,
            source: ActionSource::Script,
            script: Some(ScriptActionMetadata {
                path: format!("{id}.ts"),
                file_name: format!("{id}.ts"),
                source_hash: "hash".to_string(),
            }),
            diagnostics: Vec::new(),
            logging: None,
        }
    }

    fn write_temp_script(file_name: &str, source: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("copicu-action-test-{}", now_unix_ms()));
        std::fs::create_dir_all(&dir).expect("temp dir should be created");
        let path = dir.join(file_name);
        std::fs::write(&path, source).expect("temp script should be written");
        path
    }
}
