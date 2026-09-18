use crate::storage::{HistoryMovePosition, HistorySearchMode, HistorySearchRequest};
use serde_json::{json, Map, Value};
use std::{
    fs::OpenOptions,
    io::Write,
    path::{Path, PathBuf},
};
use tauri::{Emitter, Manager};

use crate::assistant_database as database;

const HISTORY_CHANGED_EVENT: &str = "copicu://history/changed";
const MAX_EXPORT_BYTES: usize = 32 * 1024 * 1024;

pub fn catalog() -> Value {
    serde_json::from_str(include_str!("../../scripts/assistant-tools.json"))
        .expect("assistant tool catalog must be valid JSON")
}

fn emit_history_changed(app: &tauri::AppHandle) -> bool {
    app.emit(HISTORY_CHANGED_EVENT, ()).is_ok()
}

fn id(value: Option<&Value>, field: &str) -> Result<i64, String> {
    let text = value
        .and_then(Value::as_str)
        .ok_or_else(|| format!("{field} must be a decimal string"))?;
    if text.is_empty() || !text.bytes().all(|b| b.is_ascii_digit()) {
        return Err(format!("{field} must be a decimal string"));
    }
    text.parse::<i64>()
        .map_err(|_| format!("{field} is out of range"))
}

fn item_json(item: &crate::storage::HistoryItem, include_content: bool) -> Result<Value, String> {
    let raw =
        serde_json::to_value(item).map_err(|e| format!("failed to encode history item: {e}"))?;
    let Some(object) = raw.as_object() else {
        return Err("history item encoding was not an object".to_string());
    };
    let mut out = Map::new();
    let renames = [
        ("id", "id"),
        ("content_kind", "contentKind"),
        ("text", "text"),
        ("preview_text", "previewText"),
        ("text_char_count", "textCharCount"),
        ("includes_content", "includesContent"),
        ("normalized_hash", "normalizedHash"),
        ("created_at_unix_ms", "createdAtUnixMs"),
        ("last_used_at_unix_ms", "lastUsedAtUnixMs"),
        ("last_copied_at_unix_ms", "lastCopiedAtUnixMs"),
        ("copy_count", "copyCount"),
        ("mime_primary", "mimePrimary"),
        ("blob_path", "blobPath"),
        ("thumbnail_path", "thumbnailPath"),
        ("byte_size", "byteSize"),
        ("width", "width"),
        ("height", "height"),
        ("thumbnail_data_url", "thumbnailDataUrl"),
        ("title", "title"),
        ("notes", "notes"),
        ("tags", "tags"),
        ("is_marked", "isMarked"),
        ("marked_at_unix_ms", "markedAtUnixMs"),
        ("is_inbox", "isInbox"),
        ("inbox_at_unix_ms", "inboxAtUnixMs"),
    ];
    for (from, to) in renames {
        if matches!(from, "blob_path" | "thumbnail_path" | "thumbnail_data_url") {
            continue;
        }
        if from == "text" && !include_content {
            continue;
        }
        if let Some(value) = object.get(from) {
            if from == "id" {
                out.insert(
                    to.to_string(),
                    Value::String(value.as_i64().unwrap_or_default().to_string()),
                );
            } else {
                out.insert(to.to_string(), value.clone());
            }
        }
    }
    Ok(Value::Object(out))
}

fn path_from_arg(args: &Value) -> Result<PathBuf, String> {
    let value = args
        .get("targetPath")
        .and_then(Value::as_str)
        .ok_or_else(|| "targetPath is required".to_string())?;
    if value.trim().is_empty() {
        return Err("targetPath cannot be empty".to_string());
    }
    let path = PathBuf::from(value);
    if !path.is_absolute() {
        return Err("targetPath must be an absolute path".to_string());
    }
    #[cfg(windows)]
    {
        let is_local_drive = value.as_bytes().get(1) == Some(&b':')
            && value
                .as_bytes()
                .first()
                .is_some_and(u8::is_ascii_alphabetic)
            && matches!(value.as_bytes().get(2), Some(b'\\' | b'/'));
        if !is_local_drive
            || value[2..].contains(':')
            || value[3..]
                .split(['/', '\\'])
                .any(|part| invalid_windows_name(part) && part != "." && part != "..")
        {
            return Err(
                "targetPath must be a local absolute path without ADS or device names".to_string(),
            );
        }
    }
    Ok(path)
}

fn invalid_windows_name(value: &str) -> bool {
    let stem = value
        .split('.')
        .next()
        .unwrap_or("")
        .trim_end_matches([' ', '.'])
        .to_ascii_uppercase();
    value.chars().any(|c| {
        c.is_control() || matches!(c, '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*')
    }) || value.ends_with([' ', '.'])
        || matches!(stem.as_str(), "CON" | "PRN" | "AUX" | "NUL" | "CLOCK$")
        || ["COM", "LPT"].iter().any(|prefix| {
            stem.strip_prefix(prefix).is_some_and(|suffix| {
                matches!(
                    suffix,
                    "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "¹" | "²" | "³"
                )
            })
        })
}

fn sanitize_action_value(mut value: Value) -> Value {
    if let Some(script) = value.get_mut("script").and_then(Value::as_object_mut) {
        script.remove("path");
    }
    value
}

fn api_declarations(app: &tauri::AppHandle) -> Result<Value, String> {
    let mut candidates = Vec::new();
    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push(resource_dir.join("bundled-scripts/copicu-action.d.ts"));
        candidates.push(resource_dir.join("scripts/examples/copicu-action.d.ts"));
    }
    if let Ok(current_dir) = std::env::current_dir() {
        candidates.push(current_dir.join("scripts/examples/copicu-action.d.ts"));
    }
    for path in candidates {
        if let Ok(content) = std::fs::read_to_string(&path) {
            return Ok(json!({"name":"copicu-action.d.ts","content":content,"source":"bundled"}));
        }
    }
    Err("copicu-action declarations are unavailable in this build".to_string())
}

fn decimal_ids(arguments: &Value, key: &str) -> Result<Vec<i64>, String> {
    let Some(value) = arguments.get(key) else {
        return Ok(Vec::new());
    };
    let values = value
        .as_array()
        .ok_or_else(|| format!("{key} must be an array of decimal strings"))?;
    values.iter().map(|value| id(Some(value), key)).collect()
}
fn create_new(path: &Path, bytes: &[u8]) -> Result<usize, String> {
    if bytes.len() > MAX_EXPORT_BYTES {
        return Err(format!("export exceeds {} byte limit", MAX_EXPORT_BYTES));
    }
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)
        .map_err(|e| {
            format!("refusing export because target cannot be created without overwrite: {e}")
        })?;
    if let Err(error) = file.write_all(bytes) {
        drop(file);
        let _ = std::fs::remove_file(path);
        return Err(format!(
            "failed to write export (partial file removed): {error}"
        ));
    }
    Ok(bytes.len())
}

pub fn execute(
    app: &tauri::AppHandle,
    storage: &crate::storage::AppStorage,
    context: &crate::assistant::AssistantContext,
    name: &str,
    arguments: Value,
) -> Result<Value, String> {
    match name {
        "context_get" => {
            serde_json::to_value(context).map_err(|e| format!("failed to encode context: {e}"))
        }
        "database_query" => database::query(
            storage.db_path(),
            arguments
                .get("sql")
                .and_then(Value::as_str)
                .ok_or_else(|| "sql is required".to_string())?,
            arguments
                .get("limit")
                .and_then(Value::as_u64)
                .map(|v| v as usize),
        ),
        "history_search" => {
            let query = arguments
                .get("query")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string();
            let cursor = match arguments.get("cursor") {
                Some(value) if !value.is_null() => Some(
                    serde_json::from_value(value.clone())
                        .map_err(|e| format!("invalid history cursor: {e}"))?,
                ),
                _ => None,
            };
            let request = HistorySearchRequest {
                query,
                display_query: None,
                cursor,
                limit: arguments.get("limit").and_then(Value::as_i64),
                plan: None,
                mode: HistorySearchMode::Structured,
                include_content: arguments
                    .get("includeContent")
                    .and_then(Value::as_bool)
                    .unwrap_or(false),
                include_counts: true,
                explain: false,
                ai_context: None,
                applied_descriptor: None,
            };
            let page = storage.history_search(request)?;
            let mut out = serde_json::to_value(&page)
                .map_err(|e| format!("failed to encode history page: {e}"))?;
            if let Some(object) = out.as_object_mut() {
                object.insert(
                    "items".to_string(),
                    Value::Array(
                        page.items
                            .iter()
                            .map(|item| {
                                item_json(
                                    item,
                                    arguments
                                        .get("includeContent")
                                        .and_then(Value::as_bool)
                                        .unwrap_or(false),
                                )
                            })
                            .collect::<Result<Vec<_>, _>>()?,
                    ),
                );
            }
            Ok(out)
        }
        "database_schema" => {
            let mut schema = database::schema(storage.db_path())?;
            let settings = storage.get_settings()?;
            if let Some(object) = schema.as_object_mut() {
                object.insert(
                    "settings".to_string(),
                    json!({
                        "aiEnabled": settings.ai.enabled,
                        "endpoint": settings.ai.endpoint,
                        "model": settings.ai.model,
                        "apiKeyConfigured": !settings.ai.api_key.is_empty(),
                    }),
                );
            }
            Ok(schema)
        }
        "history_get" => {
            let item = storage.get_item(id(arguments.get("itemId"), "itemId")?)?;
            item_json(
                &item,
                arguments
                    .get("includeContent")
                    .and_then(Value::as_bool)
                    .unwrap_or(false),
            )
        }
        "history_create" => {
            let mut result = crate::actions::script_history_create(storage, arguments)?;
            result["historyChanged"] = json!(emit_history_changed(app));
            Ok(result)
        }
        "history_update" => {
            let item_id = id(arguments.get("itemId"), "itemId")?;
            let patch = arguments
                .get("patch")
                .filter(|patch| patch.is_object())
                .ok_or_else(|| "patch must be an object".to_string())?;
            crate::actions::script_history_update(
                storage,
                json!({"id":item_id.to_string(),"patch":patch}),
            )?;
            Ok(json!({"itemId": item_id.to_string(), "historyChanged": emit_history_changed(app)}))
        }
        "history_remove" => {
            let item_id = id(arguments.get("itemId"), "itemId")?;
            storage.delete_item(item_id)?;
            Ok(
                json!({"itemId": item_id.to_string(), "removed": true, "historyChanged": emit_history_changed(app)}),
            )
        }
        "history_promote" => {
            let item_id = id(arguments.get("itemId"), "itemId")?;
            storage.move_to_position(item_id, HistoryMovePosition::Top)?;
            Ok(
                json!({"itemId": item_id.to_string(), "promoted": true, "historyChanged": emit_history_changed(app)}),
            )
        }
        "picker_focus" => {
            let item_id = id(arguments.get("itemId"), "itemId")?;
            storage.get_item(item_id)?;
            let session = app.state::<crate::picker_session::PickerSessionController>();
            let request_id = session.begin_focus(item_id);
            if let Err(error) = crate::show_picker_for_assistant_focus(app) {
                session.fail_focus(&request_id, error.clone());
                return Err(error);
            }
            app.emit(
                "copicu://picker/focus",
                json!({"requestId": request_id, "itemId": item_id}),
            )
            .map_err(|error| {
                let message = format!("failed to request picker focus: {error}");
                session.fail_focus(&request_id, message.clone());
                message
            })?;
            session
                .wait_for_focus(&request_id)
                .map(|_| json!({"itemId": item_id.to_string(), "focused": true}))
        }
        "image_read" => {
            let item_id = id(arguments.get("itemId"), "itemId")?;
            let item = storage.get_item(item_id)?;
            if item.content_kind() != "image" {
                return Err(format!("history item is not an image: {item_id}"));
            }
            let data_url = storage.read_item_preview_image_data_url(item_id)?;
            let mime = data_url
                .strip_prefix("data:")
                .and_then(|value| value.split(';').next())
                .unwrap_or("image/png");
            Ok(json!({"itemId": item_id.to_string(), "mimeType": mime, "dataUrl": data_url}))
        }
        "tags_list" => serde_json::to_value(storage.list_tags()?)
            .map_err(|e| format!("failed to encode tags: {e}")),
        "export_text" => {
            let item_id = id(arguments.get("itemId"), "itemId")?;
            let item = storage.get_item(item_id)?;
            if item.content_kind() == "image" {
                return Err("export_text requires a text history item".to_string());
            }
            let path = path_from_arg(&arguments)?;
            let bytes = item.text().as_bytes();
            let written = create_new(&path, bytes)?;
            Ok(
                json!({"itemId": item_id.to_string(), "targetPath": path.to_string_lossy(), "bytes": written, "overwrote": false}),
            )
        }
        "export_image" => {
            let item_id = id(arguments.get("itemId"), "itemId")?;
            let item = storage.get_item(item_id)?;
            if item.content_kind() != "image" {
                return Err("export_image requires an image history item".to_string());
            }
            let path = path_from_arg(&arguments)?;
            let bytes = storage.read_blob_for_item(&item)?;
            let written = create_new(&path, &bytes)?;
            Ok(
                json!({"itemId": item_id.to_string(), "targetPath": path.to_string_lossy(), "bytes": written, "overwrote": false}),
            )
        }
        "action_list" => {
            let actions = crate::actions::list_actions(storage)?;
            Ok(Value::Array(
                actions
                    .into_iter()
                    .map(|action| {
                        serde_json::to_value(action)
                            .map(sanitize_action_value)
                            .map_err(|e| format!("failed to encode action: {e}"))
                    })
                    .collect::<Result<Vec<_>, _>>()?,
            ))
        }
        "api_describe" => api_declarations(app),
        "action_run" => {
            #[cfg(not(test))]
            {
                let action_id = arguments
                    .get("actionId")
                    .and_then(Value::as_str)
                    .ok_or_else(|| "actionId is required".to_string())?;
                let trigger = match arguments.get("trigger") {
                    Some(value) => serde_json::from_value(value.clone())
                        .map_err(|error| format!("invalid action trigger: {error}"))?,
                    None => crate::actions::Trigger::CommandPalette,
                };
                let selected_item_ids = decimal_ids(&arguments, "selectedItemIds")?;
                let visible_item_ids = decimal_ids(&arguments, "visibleItemIds")?;
                let request = crate::actions::RunActionRequest {
                    action_id: action_id.to_string(),
                    context: crate::actions::ActionContext {
                        trigger,
                        shortcut: None,
                        current_item_id: match arguments.get("activeItemId") {
                            Some(value) if !value.is_null() => {
                                Some(id(Some(value), "activeItemId")?)
                            }
                            _ => None,
                        },
                        selected_item_ids,
                        view: Some(crate::actions::ActionViewContext {
                            query: arguments
                                .get("query")
                                .and_then(Value::as_str)
                                .unwrap_or_default()
                                .to_string(),
                            visible_item_ids,
                            current_index: None,
                        }),
                    },
                };
                let suppression = app
                    .state::<crate::clipboard::SelfWriteSuppression>()
                    .inner()
                    .clone();
                let previous_window = app
                    .state::<crate::window_focus::PreviousWindow>()
                    .inner()
                    .clone();
                let main_window = app.get_webview_window("main");
                let result = crate::actions::run_action(
                    app,
                    main_window.as_ref(),
                    storage,
                    &suppression,
                    &previous_window,
                    request,
                );
                emit_history_changed(app);
                if result.status == crate::actions::ActionRunStatus::Failed {
                    return Err(format!(
                        "Action failed; any completed effects were not rolled back: {}",
                        result.message
                    ));
                }
                for effect in &result.effects {
                    let crate::actions::ActionEffect::PickerFilter { query } = effect;
                    app.emit_to("main", "copicu://picker/filter", json!({"query": query}))
                        .map_err(|error| {
                            format!("action completed but picker refresh failed: {error}")
                        })?;
                }
                return serde_json::to_value(result)
                    .map_err(|e| format!("failed to encode action result: {e}"));
            }
            #[cfg(test)]
            {
                Err("action_run is unavailable in unit-test builds".to_string())
            }
        }
        "script_save" => {
            let source = arguments
                .get("source")
                .and_then(Value::as_str)
                .ok_or_else(|| "source is required".to_string())?;
            if !source.contains("defineAction") {
                return Err("script source must define an action with defineAction".to_string());
            }
            let settings = storage.get_settings()?;
            let filename = arguments
                .get("fileName")
                .and_then(Value::as_str)
                .filter(|s| !s.trim().is_empty())
                .unwrap_or("assistant-action.ts");
            if invalid_windows_name(filename)
                || filename.contains("..")
                || !(filename.ends_with(".ts")
                    || filename.ends_with(".js")
                    || filename.ends_with(".mjs"))
            {
                return Err(
                    "fileName must be a simple non-device .ts, .js, or .mjs script filename"
                        .to_string(),
                );
            }
            let path = Path::new(&settings.scripts.folder_path).join(filename);
            if path.exists() {
                return Err("script already exists; refusing overwrite".to_string());
            }
            let definition = crate::actions::parse_script_action(&path, source);
            if definition
                .diagnostics
                .iter()
                .any(|diagnostic| diagnostic.severity == crate::actions::DiagnosticSeverity::Error)
            {
                return Err(format!(
                    "script manifest is invalid: {}",
                    serde_json::to_string(&definition.diagnostics).unwrap_or_default()
                ));
            }
            if definition
                .triggers
                .contains(&crate::actions::Trigger::ClipboardChange)
                && arguments
                    .get("activateClipboardChange")
                    .and_then(Value::as_bool)
                    != Some(true)
            {
                return Err("Saving a clipboardChange script enables ongoing automatic execution. Explicitly request activateClipboardChange=true and review that scope before saving.".to_string());
            }
            std::fs::create_dir_all(&settings.scripts.folder_path)
                .map_err(|e| format!("failed to create scripts folder: {e}"))?;
            create_new(&path, source.as_bytes())?;
            let actions = crate::actions::refresh_script_action_cache(storage)?;
            let discovered = actions.iter().find(|action| {
                action
                    .script
                    .as_ref()
                    .map(|s| Path::new(&s.path) == path)
                    .unwrap_or(false)
            });
            let Some(action) = discovered else {
                return Err("script was saved but action discovery found no manifest".to_string());
            };
            if action.diagnostics.iter().any(|diagnostic| {
                matches!(
                    diagnostic.severity,
                    crate::actions::DiagnosticSeverity::Error
                )
            }) {
                return Err("script was saved but its manifest has diagnostics errors".to_string());
            }
            Ok(
                json!({"fileName": filename, "discovered": true, "action": sanitize_action_value(serde_json::to_value(action).unwrap_or(Value::Null))}),
            )
        }
        _ => Err(format!("unknown assistant operation: {name}")),
    }
}
