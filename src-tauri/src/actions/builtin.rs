use super::{
    ActionDefinition, ActionInput, ActionInputSource, ActionSource, ClipKind, SelectionRequirement,
    Trigger,
};

pub(super) const PASTE_PLAIN_ID: &str = "builtin.pastePlain";
pub(super) const JOIN_SELECTED_ID: &str = "builtin.joinSelected";
pub(super) const OPEN_URL_ID: &str = "builtin.openUrl";

pub(super) fn builtin_actions() -> Vec<ActionDefinition> {
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

#[cfg(not(test))]
pub(super) fn paste_plain<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    window: Option<&tauri::WebviewWindow<R>>,
    storage: &crate::storage::AppStorage,
    suppression: &crate::clipboard::SelfWriteSuppression,
    previous_window: &crate::window_focus::PreviousWindow,
    request: &super::RunActionRequest,
) -> Result<String, String> {
    use tauri_plugin_clipboard_manager::ClipboardExt;

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
    if storage.get_settings()?.picker.promote_active_on_copy {
        storage.mark_copied(item_id)?;
    }
    storage.mark_used(item_id)?;
    if let Some(window) = window {
        crate::host::hide_picker(window)?;
    }
    previous_window.focus_previous()?;
    previous_window.send_paste_shortcut(&crate::host::PasteShortcut::Default)?;

    Ok("Pasted plain text".to_string())
}

#[cfg(not(test))]
pub(super) fn join_selected<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    storage: &crate::storage::AppStorage,
    suppression: &crate::clipboard::SelfWriteSuppression,
    request: &super::RunActionRequest,
) -> Result<String, String> {
    use tauri_plugin_clipboard_manager::ClipboardExt;

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
fn require_one_selected(context: &super::ActionContext) -> Result<i64, String> {
    if context.selected_item_ids.len() != 1 {
        return Err("action requires exactly one selected item".to_string());
    }
    Ok(context.selected_item_ids[0])
}

#[cfg(not(test))]
fn require_one_or_more_selected(context: &super::ActionContext) -> Result<&[i64], String> {
    if context.selected_item_ids.is_empty() {
        return Err("action requires selected items".to_string());
    }
    Ok(&context.selected_item_ids)
}
