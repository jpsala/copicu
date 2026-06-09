use serde::Deserialize;
#[cfg(not(test))]
use tauri::{AppHandle, Runtime, WebviewWindow};
#[cfg(not(test))]
use tauri_plugin_clipboard_manager::ClipboardExt;

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivateItemRequest {
    pub item_id: i64,
    pub copy: bool,
    pub mark_used: bool,
    pub hide_picker: bool,
    pub focus_previous: bool,
    pub paste: bool,
    pub paste_shortcut: PasteShortcut,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum PasteShortcut {
    Default,
    ShiftInsert,
    CtrlV,
}

#[cfg(not(test))]
pub fn activate_item<R: Runtime>(
    app: &AppHandle<R>,
    window: Option<&WebviewWindow<R>>,
    storage: &crate::storage::AppStorage,
    suppression: &crate::clipboard::SelfWriteSuppression,
    previous_window: &crate::window_focus::PreviousWindow,
    request: ActivateItemRequest,
) -> Result<(), String> {
    if request.copy {
        write_item(app, storage, suppression, request.item_id)?;
    }
    if request.mark_used {
        mark_used(storage, request.item_id)?;
    }
    if request.hide_picker {
        let window =
            window.ok_or_else(|| "picker window is required to hide picker".to_string())?;
        hide_picker(window)?;
    }
    if request.focus_previous {
        previous_window.focus_previous()?;
    }
    if request.paste {
        previous_window.send_paste_shortcut(&request.paste_shortcut)?;
    }

    Ok(())
}

#[cfg(not(test))]
pub fn write_item<R: Runtime>(
    app: &AppHandle<R>,
    storage: &crate::storage::AppStorage,
    suppression: &crate::clipboard::SelfWriteSuppression,
    item_id: i64,
) -> Result<(), String> {
    let item = storage.get_item(item_id)?;
    suppression.suppress_hash(item.normalized_hash().to_string());

    if item.content_kind() == "image" {
        let png_bytes = storage.read_blob_for_item(&item)?;
        crate::image_capture::write_png_to_clipboard(&png_bytes).map_err(|error| {
            suppression.clear_if_hash(item.normalized_hash());
            error
        })
    } else {
        app.clipboard().write_text(item.text()).map_err(|error| {
            suppression.clear_if_hash(item.normalized_hash());
            format!("failed to write selected item to clipboard: {error}")
        })
    }
}

pub fn mark_used(storage: &crate::storage::AppStorage, item_id: i64) -> Result<(), String> {
    storage.mark_used(item_id)
}

#[cfg(not(test))]
pub fn hide_picker<R: Runtime>(window: &WebviewWindow<R>) -> Result<(), String> {
    window
        .hide()
        .map_err(|error| format!("failed to hide picker window: {error}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn activate_item_request_accepts_frontend_camel_case_shape() {
        let request: ActivateItemRequest = serde_json::from_value(serde_json::json!({
            "itemId": 7,
            "copy": true,
            "markUsed": true,
            "hidePicker": true,
            "focusPrevious": false,
            "paste": false,
            "pasteShortcut": "default"
        }))
        .expect("request should deserialize");

        assert_eq!(request.item_id, 7);
        assert!(request.copy);
        assert!(request.mark_used);
        assert!(request.hide_picker);
        assert!(!request.focus_previous);
        assert!(!request.paste);
        assert_eq!(request.paste_shortcut, PasteShortcut::Default);
    }
}
