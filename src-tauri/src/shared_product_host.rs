//! Product commands. Renderer intent never grants remote permission or key access.
use crate::storage;
use tauri::State;

fn trusted(window: &tauri::WebviewWindow) -> Result<(), String> {
    if matches!(
        window.label(),
        crate::MAIN_WINDOW_LABEL | crate::SETTINGS_WINDOW_LABEL
    ) {
        Ok(())
    } else {
        Err("Sharing is available only in the picker and Settings".into())
    }
}

#[tauri::command]
pub(crate) async fn shared_clipboard_catalog(
    window: tauri::WebviewWindow,
    storage: State<'_, storage::AppStorage>,
) -> Result<serde_json::Value, String> {
    trusted(&window)?;
    let storage = storage.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        #[cfg(feature = "shared-clipboard")]
        {
            crate::shared_clipboard::product::catalog(&storage)
        }
        #[cfg(not(feature = "shared-clipboard"))]
        {
            let _ = storage;
            Err("Sharing is unavailable in this build".into())
        }
    })
    .await
    .map_err(|_| "Sharing catalog worker failed")?
}

#[tauri::command]
pub(crate) async fn shared_clipboard_operation(
    window: tauri::WebviewWindow,
    storage: State<'_, storage::AppStorage>,
    input: serde_json::Value,
) -> Result<serde_json::Value, String> {
    trusted(&window)?;
    let storage = storage.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        #[cfg(feature = "shared-clipboard")]
        {
            crate::shared_clipboard::product::operation(&storage, input)
        }
        #[cfg(not(feature = "shared-clipboard"))]
        {
            let _ = (storage, input);
            Err("Sharing is unavailable in this build".into())
        }
    })
    .await
    .map_err(|_| "Sharing operation worker failed")?
}

#[tauri::command]
pub(crate) async fn shared_clipboard_connection(
    window: tauri::WebviewWindow,
    storage: State<'_, storage::AppStorage>,
    action: String,
    input: serde_json::Value,
) -> Result<serde_json::Value, String> {
    trusted(&window)?;
    let storage = storage.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        #[cfg(feature = "shared-clipboard")]
        {
            use crate::shared_clipboard::{config::ConnectionInput, runtime};
            let snapshot = match action.as_str() {
                "connect" => {
                    let input = serde_json::from_value::<ConnectionInput>(input)
                        .map_err(|_| "Invalid sharing connection")?;
                    let head = runtime::prepare_connection_head(&storage, &input)?;
                    let _barrier = crate::shared_native::EFFECT_BARRIER
                        .lock()
                        .map_err(|_| "Sharing effect barrier failed")?;
                    runtime::connect_with_head(&storage, input, head)?
                }
                "disconnect" => {
                    let _barrier = crate::shared_native::EFFECT_BARRIER
                        .lock()
                        .map_err(|_| "Sharing effect barrier failed")?;
                    runtime::disconnect(
                        &storage,
                        input["id"].as_str().ok_or("Connection ID is required")?,
                    )?
                }
                "scope" => {
                    let _barrier = crate::shared_native::EFFECT_BARRIER
                        .lock()
                        .map_err(|_| "Sharing effect barrier failed")?;
                    runtime::set_general_scope(
                        &storage,
                        input["scope"].as_str().ok_or("Sharing scope is required")?,
                    )?
                }
                "pause" => {
                    #[derive(serde::Deserialize)]
                    #[serde(rename_all = "camelCase", deny_unknown_fields)]
                    struct Pause {
                        channel_id: Option<String>,
                        send_paused: Option<bool>,
                        receive_paused: Option<bool>,
                    }
                    let p: Pause =
                        serde_json::from_value(input).map_err(|_| "Invalid sharing pause")?;
                    let heads = runtime::prepare_receive_resume(
                        &storage,
                        p.channel_id.as_deref(),
                        p.receive_paused,
                    )?;
                    let _barrier = crate::shared_native::EFFECT_BARRIER
                        .lock()
                        .map_err(|_| "Sharing effect barrier failed")?;
                    runtime::set_flow_paused_with_heads(
                        &storage,
                        p.channel_id.as_deref(),
                        p.send_paused,
                        p.receive_paused,
                        heads,
                    )?
                }
                _ => return Err("Unknown sharing connection operation".into()),
            };
            serde_json::to_value(snapshot).map_err(|_| "Cannot read sharing status".into())
        }
        #[cfg(not(feature = "shared-clipboard"))]
        {
            let _ = (storage, action, input);
            Err("Sharing is unavailable in this build".into())
        }
    })
    .await
    .map_err(|_| "Sharing connection worker failed")?
}

#[tauri::command]
pub(crate) async fn shared_clipboard_history(
    window: tauri::WebviewWindow,
    storage: State<'_, storage::AppStorage>,
    channel_id: String,
    before: Option<String>,
) -> Result<serde_json::Value, String> {
    trusted(&window)?;
    let storage = storage.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        #[cfg(feature = "shared-clipboard")]
        {
            crate::shared_clipboard::runtime::history_page(&storage, &channel_id, before.as_deref())
        }
        #[cfg(not(feature = "shared-clipboard"))]
        {
            let _ = (storage, channel_id, before);
            Err("Sharing is unavailable in this build".into())
        }
    })
    .await
    .map_err(|_| "Sharing history worker failed")?
}

#[tauri::command]
pub(crate) async fn shared_clipboard_publish(
    window: tauri::WebviewWindow,
    storage: State<'_, storage::AppStorage>,
    channel_id: String,
    text: String,
) -> Result<serde_json::Value, String> {
    trusted(&window)?;
    let storage = storage.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        #[cfg(feature = "shared-clipboard")]
        {
            crate::shared_clipboard::runtime::publish_text(
                &storage,
                &channel_id,
                &text,
                "manualSharedView",
            )
        }
        #[cfg(not(feature = "shared-clipboard"))]
        {
            let _ = (storage, channel_id, text);
            Err("Sharing is unavailable in this build".into())
        }
    })
    .await
    .map_err(|_| "Sharing publication worker failed")?
}

#[tauri::command]
pub(crate) async fn shared_clipboard_history_action(
    window: tauri::WebviewWindow,
    storage: State<'_, storage::AppStorage>,
    channel_id: String,
    publication_id: String,
    action: String,
    folder_id: Option<i64>,
) -> Result<serde_json::Value, String> {
    trusted(&window)?;
    let storage = storage.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        #[cfg(feature = "shared-clipboard")]
        {
            use crate::{shared_clipboard::runtime, shared_native};
            match action.as_str() {
                "save" => {
                    runtime::historical_import(&storage, &channel_id, &publication_id, folder_id)
                }
                "copy" => {
                    let sequence = shared_native::sequence().ok_or("Clipboard unavailable")?;
                    let verified =
                        runtime::prepare_historical_copy(&storage, &channel_id, &publication_id)?;
                    let _barrier = shared_native::EFFECT_BARRIER
                        .lock()
                        .map_err(|_| "Sharing effect barrier failed")?;
                    let text = runtime::admit_historical_copy(&storage, &verified)?;
                    let outcome = shared_native::write(&text, sequence);
                    if outcome != "applied" {
                        return Err(format!("Could not copy shared publication: {outcome}"));
                    }
                    Ok(serde_json::json!({"outcome":"applied"}))
                }
                _ => Err("Unknown history action".into()),
            }
        }
        #[cfg(not(feature = "shared-clipboard"))]
        {
            let _ = (storage, channel_id, publication_id, action, folder_id);
            Err("Sharing is unavailable in this build".into())
        }
    })
    .await
    .map_err(|_| "Sharing history action worker failed")?
}

#[tauri::command]
pub(crate) async fn shared_clipboard_action_target(
    window: tauri::WebviewWindow,
    storage: State<'_, storage::AppStorage>,
    action_id: String,
    channel_id: Option<String>,
) -> Result<serde_json::Value, String> {
    trusted(&window)?;
    let storage = storage.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        #[cfg(feature = "shared-clipboard")]
        {
            if let Some(ref channel) = channel_id {
                crate::actions::validate_shared_publish_destination(&storage, &action_id, channel)?;
            }
            serde_json::to_value(crate::shared_clipboard::runtime::set_action_target(
                &storage,
                &action_id,
                channel_id.as_deref(),
            )?)
            .map_err(|_| "Cannot read sharing status".into())
        }
        #[cfg(not(feature = "shared-clipboard"))]
        {
            let _ = (storage, action_id, channel_id);
            Err("Sharing is unavailable in this build".into())
        }
    })
    .await
    .map_err(|_| "Sharing Action target worker failed")?
}
