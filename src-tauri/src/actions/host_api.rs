use tauri::{AppHandle, Runtime, WebviewWindow};

use super::{
    script_ai_respond_markdown, script_clipboard_read, script_commands_run, script_history_get,
    script_history_remove, script_history_search, script_history_update, script_ui_alert,
    script_ui_confirm, script_ui_input, ActionDefinition, ScriptHostCall,
};

pub(super) fn dispatch_script_host_call<R: Runtime>(
    app: &AppHandle<R>,
    window: Option<&WebviewWindow<R>>,
    storage: &crate::storage::AppStorage,
    previous_window: &crate::window_focus::PreviousWindow,
    action: &ActionDefinition,
    call: &ScriptHostCall,
) -> Result<serde_json::Value, String> {
    match call.method.as_str() {
        "history.search" => script_history_search(storage, call.payload.clone()),
        "history.get" => script_history_get(storage, call.payload.clone()),
        "history.update" => script_history_update(storage, call.payload.clone()),
        "history.remove" => script_history_remove(storage, call.payload.clone()),
        "clipboard.read" => script_clipboard_read(app),
        "ui.alert" => script_ui_alert(app, call.payload.clone()),
        "ui.confirm" => script_ui_confirm(app, call.payload.clone()),
        "ui.input" => script_ui_input(app, call.payload.clone()),
        "ai.respondMarkdown" | "ai.summarizeMarkdown" => {
            script_ai_respond_markdown(storage, call.method.as_str(), call.payload.clone())
        }
        "commands.run" => {
            script_commands_run(window, previous_window, action, call.payload.clone())
        }
        _ => Err(format!("unsupported script host method: {}", call.method)),
    }
}
