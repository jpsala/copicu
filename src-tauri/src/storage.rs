use base64::{engine::general_purpose::STANDARD as BASE64_STANDARD, Engine as _};
use rusqlite::{params, params_from_iter, types::Value, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    time::{SystemTime, UNIX_EPOCH},
};
#[path = "storage/blobs.rs"]
mod blobs;
#[path = "storage/schema.rs"]
mod schema;
#[path = "storage/search.rs"]
mod search;

use self::blobs::{
    blob_path_is_referenced, path_to_db_string, relative_blob_path, write_blob, IMAGE_BLOB_DIR,
    THUMBNAIL_BLOB_DIR,
};
use self::schema::MIGRATIONS;
#[cfg(test)]
use self::schema::MIGRATIONS_SLICE;
use self::search::{
    compile_search_plan, explain_history_query, finish_history_page, history_item_select_columns,
    history_page_sql, history_where_clause, parse_history_query, search_plan_from_query,
};
#[cfg(test)]
use self::search::{days_from_civil, HasFilter};
pub use self::search::{
    SearchPlanDateFieldV1, SearchPlanDateFilterV1, SearchPlanDateOpV1, SearchPlanFiltersV1,
    SearchPlanHasV1, SearchPlanKindV1, SearchPlanMissingV1, SearchPlanRelativeDateV1,
    SearchPlanRelativeUnitV1, SearchPlanSortDirectionV1, SearchPlanSortFieldV1, SearchPlanSortV1,
    SearchPlanTextV1, SearchPlanV1,
};
#[cfg(test)]
use rusqlite_migration::Migrations;

const DATABASE_FILE_NAME: &str = "copicu.sqlite3";
const UNLIMITED_HISTORY_LIMIT: i64 = 0;
const QUERY_LIMIT: i64 = 100;
const DEFAULT_HISTORY_PAGE_LIMIT: i64 = 60;
const MIN_HISTORY_PAGE_LIMIT: i64 = 1;
const MAX_HISTORY_PAGE_LIMIT: i64 = 100;
const HISTORY_PREVIEW_CHAR_LIMIT: i64 = 2_000;
const MILLIS_PER_DAY: i64 = 86_400_000;
const APP_SETTINGS_KEY: &str = "app";
const SETTINGS_SCHEMA_VERSION: u32 = 1;
const DEFAULT_AI_ENDPOINT: &str = "https://openrouter.ai/api/v1";
const DEFAULT_AI_MODEL: &str = "openai/gpt-4.1-mini";
const DEFAULT_GLOBAL_SHORTCUT: &str = "Ctrl+Shift+,";
const MIN_RETENTION_COUNT: i64 = 100;
const MAX_RETENTION_COUNT: i64 = 100_000;

#[derive(Clone)]
pub struct AppStorage {
    conn: Arc<Mutex<Connection>>,
    db_path: PathBuf,
    app_data_dir: PathBuf,
}

#[derive(Clone, Serialize)]
pub struct HistoryItem {
    id: i64,
    content_kind: String,
    text: String,
    preview_text: String,
    text_char_count: i64,
    includes_content: bool,
    normalized_hash: String,
    created_at_unix_ms: i64,
    last_used_at_unix_ms: i64,
    last_copied_at_unix_ms: i64,
    copy_count: i64,
    mime_primary: Option<String>,
    blob_path: Option<String>,
    thumbnail_path: Option<String>,
    byte_size: Option<i64>,
    width: Option<i64>,
    height: Option<i64>,
    thumbnail_data_url: Option<String>,
    title: Option<String>,
    notes: Option<String>,
    tags: Option<String>,
    is_marked: bool,
    marked_at_unix_ms: Option<i64>,
}

impl HistoryItem {
    pub fn content_kind(&self) -> &str {
        &self.content_kind
    }

    pub fn text(&self) -> &str {
        &self.text
    }

    pub fn normalized_hash(&self) -> &str {
        &self.normalized_hash
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateHistoryItemRequest {
    pub id: i64,
    pub text: String,
    pub title: Option<String>,
    pub notes: Option<String>,
    pub tags: Option<String>,
    pub mime_primary: Option<String>,
    pub marked: Option<bool>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetHistoryItemsMarkedRequest {
    pub ids: Vec<i64>,
    pub marked: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetHistoryQueryMarkedRequest {
    pub query: String,
    pub marked: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct HistoryPageCursor {
    after_sort_unix_ms: i64,
    after_id: i64,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryPageRequest {
    pub query: String,
    pub cursor: Option<HistoryPageCursor>,
    pub limit: Option<i64>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum HistorySearchMode {
    Plain,
    Structured,
    Ai,
}

impl Default for HistorySearchMode {
    fn default() -> Self {
        Self::Structured
    }
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistorySearchRequest {
    pub query: String,
    pub cursor: Option<HistoryPageCursor>,
    pub limit: Option<i64>,
    #[serde(default)]
    pub plan: Option<SearchPlanV1>,
    #[serde(default)]
    pub mode: HistorySearchMode,
    #[serde(default)]
    pub include_content: bool,
    #[serde(default = "default_true")]
    pub include_counts: bool,
    #[serde(default)]
    pub explain: bool,
    #[serde(default)]
    pub ai_context: Option<crate::ai_planner::AiScriptContext>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryPage {
    pub items: Vec<HistoryItem>,
    pub next_cursor: Option<HistoryPageCursor>,
    pub total_count: Option<i64>,
    pub filtered_count: Option<i64>,
    pub interpreted_query: Option<String>,
    pub explanation: Option<String>,
    pub warnings: Vec<String>,
}

pub struct NewActionRun {
    pub action_id: String,
    pub trigger: String,
    pub status: String,
    pub started_at_unix_ms: i64,
    pub finished_at_unix_ms: i64,
    pub duration_ms: i64,
    pub input_summary_json: String,
    pub error_class: Option<String>,
    pub error_message: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CachedScriptDiagnostic {
    pub file_path: String,
    pub action_id: String,
    pub severity: String,
    pub message: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TagSummary {
    pub id: i64,
    pub slug: String,
    pub label: String,
    pub color: Option<String>,
    pub pinned: bool,
    pub sort_order: Option<i64>,
    pub item_count: i64,
    pub auto_apply_enabled: bool,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateTagRequest {
    pub label: String,
    #[serde(default)]
    pub color: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateTagConfigRequest {
    pub tag_id: i64,
    #[serde(default)]
    pub label: Option<String>,
    #[serde(default)]
    pub color: Option<Option<String>>,
    #[serde(default)]
    pub pinned: Option<bool>,
    #[serde(default)]
    pub sort_order: Option<Option<i64>>,
    #[serde(default)]
    pub hotkey: Option<Option<String>>,
    #[serde(default)]
    pub auto_apply_enabled: Option<bool>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetItemTagsRequest {
    pub item_id: i64,
    pub tags: Vec<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub schema_version: u32,
    pub general: GeneralSettings,
    pub picker: PickerSettings,
    pub history: HistorySettings,
    pub appearance: AppearanceSettings,
    #[serde(default)]
    pub scripts: ScriptsSettings,
    #[serde(default)]
    pub ai: AiSettings,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GeneralSettings {
    pub global_shortcut: String,
    #[serde(default)]
    pub launch_on_startup: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PickerSettings {
    pub hide_on_focus_lost: bool,
    pub enter_action: EnterAction,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum EnterAction {
    Copy,
    Paste,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct HistorySettings {
    pub retention_count: i64,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AppearanceSettings {
    pub theme: ThemeSetting,
    #[serde(default)]
    pub theme_id: ThemeId,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ScriptsSettings {
    pub folder_path: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiSettings {
    pub enabled: bool,
    pub endpoint: String,
    pub model: String,
}

impl Default for AiSettings {
    fn default() -> Self {
        Self {
            enabled: false,
            endpoint: DEFAULT_AI_ENDPOINT.to_string(),
            model: DEFAULT_AI_MODEL.to_string(),
        }
    }
}

impl Default for ScriptsSettings {
    fn default() -> Self {
        Self {
            folder_path: default_scripts_folder_path(),
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ThemeSetting {
    System,
    Light,
    Dark,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ThemeId {
    #[default]
    Default,
    Graphite,
    Code,
    HighContrast,
    Midnight,
    Blueprint,
    Moss,
    Rose,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            schema_version: SETTINGS_SCHEMA_VERSION,
            general: GeneralSettings {
                global_shortcut: default_global_shortcut(),
                launch_on_startup: false,
            },
            picker: PickerSettings {
                hide_on_focus_lost: true,
                enter_action: EnterAction::Copy,
            },
            history: HistorySettings {
                retention_count: UNLIMITED_HISTORY_LIMIT,
            },
            appearance: AppearanceSettings {
                theme: ThemeSetting::System,
                theme_id: ThemeId::Default,
            },
            scripts: ScriptsSettings::default(),
            ai: AiSettings::default(),
        }
    }
}

fn default_global_shortcut() -> String {
    std::env::var_os("COPICU_GLOBAL_SHORTCUT")
        .map(PathBuf::from)
        .filter(|value| !value.as_os_str().is_empty())
        .map(|value| value.to_string_lossy().into_owned())
        .unwrap_or_else(|| DEFAULT_GLOBAL_SHORTCUT.to_string())
}

impl AppStorage {
    pub fn open(app_data_dir: &Path) -> Result<Self, String> {
        std::fs::create_dir_all(app_data_dir).map_err(|error| {
            format!(
                "failed to create app data dir {}: {error}",
                app_data_dir.display()
            )
        })?;

        let db_path = app_data_dir.join(DATABASE_FILE_NAME);
        let mut conn = Connection::open(&db_path)
            .map_err(|error| format!("failed to open sqlite database: {error}"))?;

        conn.pragma_update(None, "journal_mode", "WAL")
            .map_err(|error| format!("failed to enable sqlite WAL mode: {error}"))?;
        MIGRATIONS
            .to_latest(&mut conn)
            .map_err(|error| format!("failed to migrate sqlite database: {error}"))?;

        Ok(Self {
            conn: Arc::new(Mutex::new(conn)),
            db_path,
            app_data_dir: app_data_dir.to_path_buf(),
        })
    }

    pub fn db_path(&self) -> &Path {
        &self.db_path
    }

    pub fn insert_text(&self, text: &str, normalized_hash: &str) -> Result<i64, String> {
        let now = now_unix_ms();
        let (item_id, pruned_blobs) = {
            let conn = self
                .conn
                .lock()
                .map_err(|_| "sqlite connection mutex poisoned".to_string())?;

            if let Some(existing_id) = bump_existing_capture(&conn, normalized_hash, now)? {
                let pruned_blobs = prune_history_from_conn(&conn)?;
                (existing_id, pruned_blobs)
            } else {
                conn.execute(
                    "INSERT INTO clipboard_items (
                        content_kind,
                        text,
                        normalized_hash,
                        created_at_unix_ms,
                        last_used_at_unix_ms,
                        last_copied_at_unix_ms,
                        copy_count
                    ) VALUES ('text', ?1, ?2, ?3, ?3, ?3, 1)",
                    params![text, normalized_hash, now],
                )
                .map_err(|error| format!("failed to insert clipboard text item: {error}"))?;

                let item_id = conn.last_insert_rowid();
                let pruned_blobs = prune_history_from_conn(&conn)?;
                (item_id, pruned_blobs)
            }
        };

        self.remove_blob_paths(pruned_blobs);
        Ok(item_id)
    }

    pub fn insert_image(&self, image: &crate::image_capture::CapturedImage) -> Result<i64, String> {
        let image_relative_path = relative_blob_path(IMAGE_BLOB_DIR, &image.normalized_hash);
        let thumbnail_relative_path =
            relative_blob_path(THUMBNAIL_BLOB_DIR, &image.normalized_hash);
        let now = now_unix_ms();
        let text = format!(
            "[image] {}x{} PNG {} bytes",
            image.width,
            image.height,
            image.png_bytes.len()
        );
        let image_path = self.app_data_dir.join(&image_relative_path);
        let thumbnail_path = self.app_data_dir.join(&thumbnail_relative_path);
        let (item_id, pruned_blobs) = {
            let conn = self
                .conn
                .lock()
                .map_err(|_| "sqlite connection mutex poisoned".to_string())?;

            if let Some(existing_id) = bump_existing_capture(&conn, &image.normalized_hash, now)? {
                let pruned_blobs = prune_history_from_conn(&conn)?;
                (existing_id, pruned_blobs)
            } else {
                write_blob(&image_path, &image.png_bytes)?;
                write_blob(&thumbnail_path, &image.thumbnail_png_bytes)?;
                conn.execute(
                    "INSERT INTO clipboard_items (
                        content_kind,
                        text,
                        normalized_hash,
                        created_at_unix_ms,
                        last_used_at_unix_ms,
                        last_copied_at_unix_ms,
                        copy_count,
                        mime_primary,
                        blob_path,
                        thumbnail_path,
                        byte_size,
                        width,
                        height
                    ) VALUES ('image', ?1, ?2, ?3, ?3, ?3, 1, 'image/png', ?4, ?5, ?6, ?7, ?8)",
                    params![
                        text,
                        image.normalized_hash,
                        now,
                        path_to_db_string(&image_relative_path),
                        path_to_db_string(&thumbnail_relative_path),
                        image.png_bytes.len() as i64,
                        image.width as i64,
                        image.height as i64
                    ],
                )
                .map_err(|error| format!("failed to insert clipboard image item: {error}"))?;

                let item_id = conn.last_insert_rowid();
                let pruned_blobs = prune_history_from_conn(&conn)?;
                (item_id, pruned_blobs)
            }
        };

        self.remove_blob_paths(pruned_blobs);
        Ok(item_id)
    }

    pub fn list_recent(&self) -> Result<Vec<HistoryItem>, String> {
        let mut items = {
            let conn = self
                .conn
                .lock()
                .map_err(|_| "sqlite connection mutex poisoned".to_string())?;
            self.query_items(
                &conn,
                &format!(
                    "SELECT {}
                     FROM clipboard_items
                     ORDER BY COALESCE(last_copied_at_unix_ms, created_at_unix_ms) DESC, id DESC
                     LIMIT ?1",
                    history_item_select_columns(true)
                ),
                params![QUERY_LIMIT],
            )?
        };
        self.attach_thumbnail_data_urls(&mut items);
        Ok(items)
    }

    pub fn list_page(&self, request: HistoryPageRequest) -> Result<HistoryPage, String> {
        self.history_search(HistorySearchRequest {
            query: request.query,
            cursor: request.cursor,
            limit: request.limit,
            plan: None,
            mode: HistorySearchMode::Structured,
            include_content: false,
            include_counts: true,
            explain: false,
            ai_context: None,
        })
    }

    pub fn history_search(&self, request: HistorySearchRequest) -> Result<HistoryPage, String> {
        let trimmed = request.query.trim();
        let mut warnings = Vec::new();
        if request.mode == HistorySearchMode::Ai {
            warnings.push(
                "AI search planning is not implemented yet; using structured search".to_string(),
            );
        }
        let conn = self
            .conn
            .lock()
            .map_err(|_| "sqlite connection mutex poisoned".to_string())?;

        let plan = request
            .plan
            .clone()
            .unwrap_or_else(|| search_plan_from_query(trimmed));
        let compiled = compile_search_plan(&plan)?;
        let where_sql = compiled.where_sql;
        let mut query_params = compiled.params;
        let effective_limit = request
            .limit
            .or(compiled.limit)
            .unwrap_or(DEFAULT_HISTORY_PAGE_LIMIT)
            .clamp(MIN_HISTORY_PAGE_LIMIT, MAX_HISTORY_PAGE_LIMIT);
        let query_limit = effective_limit + 1;
        let (total_count, filtered_count) = if request.include_counts {
            let total_count = count_history_items(&conn, "", &[])?;
            let filtered_count = if where_sql.is_empty() {
                total_count
            } else {
                count_history_items(&conn, &where_sql, &query_params)?
            };
            (Some(total_count), Some(filtered_count))
        } else {
            (None, None)
        };
        if let Some(cursor) = request.cursor {
            query_params.push(Value::Integer(cursor.after_sort_unix_ms));
            query_params.push(Value::Integer(cursor.after_sort_unix_ms));
            query_params.push(Value::Integer(cursor.after_id));
            let cursor_clause = "(COALESCE(last_copied_at_unix_ms, created_at_unix_ms) < ?
                OR (COALESCE(last_copied_at_unix_ms, created_at_unix_ms) = ? AND id < ?))";
            let next_where_sql = if where_sql.is_empty() {
                format!("WHERE {cursor_clause}")
            } else {
                format!("{where_sql} AND {cursor_clause}")
            };
            query_params.push(Value::Integer(query_limit));
            let sql = history_page_sql(
                &next_where_sql,
                &compiled.order_sql,
                request.include_content,
            );
            let mut items = self.query_items(&conn, &sql, params_from_iter(query_params.iter()))?;
            let mut page = finish_history_page(
                &mut items,
                effective_limit,
                total_count,
                filtered_count,
                request.explain.then(|| trimmed.to_string()),
                request.explain.then(|| explain_history_query(trimmed)),
                warnings,
            )?;
            drop(conn);
            self.attach_thumbnail_data_urls(&mut page.items);
            return Ok(page);
        }

        query_params.push(Value::Integer(query_limit));
        let sql = history_page_sql(&where_sql, &compiled.order_sql, request.include_content);
        let mut items = self.query_items(&conn, &sql, params_from_iter(query_params.iter()))?;

        let mut page = finish_history_page(
            &mut items,
            effective_limit,
            total_count,
            filtered_count,
            request.explain.then(|| trimmed.to_string()),
            request.explain.then(|| explain_history_query(trimmed)),
            warnings,
        )?;
        drop(conn);
        self.attach_thumbnail_data_urls(&mut page.items);
        Ok(page)
    }

    pub fn get_item(&self, id: i64) -> Result<HistoryItem, String> {
        let mut items = {
            let conn = self
                .conn
                .lock()
                .map_err(|_| "sqlite connection mutex poisoned".to_string())?;
            self.query_items(
                &conn,
                &format!(
                    "SELECT {}
                     FROM clipboard_items
                     WHERE id = ?1
                     LIMIT 1",
                    history_item_select_columns(true)
                ),
                params![id],
            )?
        };
        self.attach_thumbnail_data_urls(&mut items);

        items
            .pop()
            .ok_or_else(|| format!("clipboard item not found: {id}"))
    }

    pub fn mark_used(&self, id: i64) -> Result<(), String> {
        let now = now_unix_ms();
        let conn = self
            .conn
            .lock()
            .map_err(|_| "sqlite connection mutex poisoned".to_string())?;

        let updated = conn
            .execute(
                "UPDATE clipboard_items
                 SET last_used_at_unix_ms = ?1
                 WHERE id = ?2",
                params![now, id],
            )
            .map_err(|error| format!("failed to update clipboard item usage: {error}"))?;

        if updated == 0 {
            Err(format!("clipboard item not found: {id}"))
        } else {
            Ok(())
        }
    }

    pub fn set_items_marked(&self, request: SetHistoryItemsMarkedRequest) -> Result<(), String> {
        if request.ids.is_empty() {
            return Ok(());
        }

        let now = now_unix_ms();
        let mut placeholders = Vec::with_capacity(request.ids.len());
        let mut query_params = Vec::with_capacity(request.ids.len() + 2);
        query_params.push(Value::Integer(if request.marked { 1 } else { 0 }));
        query_params.push(if request.marked {
            Value::Integer(now)
        } else {
            Value::Null
        });
        for id in request.ids {
            placeholders.push("?".to_string());
            query_params.push(Value::Integer(id));
        }

        let conn = self
            .conn
            .lock()
            .map_err(|_| "sqlite connection mutex poisoned".to_string())?;
        let sql = format!(
            "UPDATE clipboard_items
             SET is_marked = ?,
                 marked_at_unix_ms = ?
             WHERE id IN ({})",
            placeholders.join(", ")
        );
        conn.execute(&sql, params_from_iter(query_params.iter()))
            .map_err(|error| format!("failed to update marked clipboard items: {error}"))?;

        Ok(())
    }

    pub fn set_query_marked(&self, request: SetHistoryQueryMarkedRequest) -> Result<(), String> {
        let now = now_unix_ms();
        let parsed_query = parse_history_query(request.query.trim());
        let (where_sql, mut filter_params) = history_where_clause(&parsed_query);
        let mut query_params = Vec::with_capacity(filter_params.len() + 2);
        query_params.push(Value::Integer(if request.marked { 1 } else { 0 }));
        query_params.push(if request.marked {
            Value::Integer(now)
        } else {
            Value::Null
        });
        query_params.append(&mut filter_params);

        let conn = self
            .conn
            .lock()
            .map_err(|_| "sqlite connection mutex poisoned".to_string())?;
        let sql = format!(
            "UPDATE clipboard_items
             SET is_marked = ?,
                 marked_at_unix_ms = ?
             {where_sql}"
        );
        conn.execute(&sql, params_from_iter(query_params.iter()))
            .map_err(|error| format!("failed to update marked clipboard query: {error}"))?;

        Ok(())
    }

    pub fn clear_marked(&self) -> Result<(), String> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| "sqlite connection mutex poisoned".to_string())?;
        conn.execute(
            "UPDATE clipboard_items
             SET is_marked = 0,
                 marked_at_unix_ms = NULL
             WHERE is_marked != 0",
            [],
        )
        .map_err(|error| format!("failed to clear marked clipboard items: {error}"))?;

        Ok(())
    }

    pub fn count_marked(&self) -> Result<i64, String> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| "sqlite connection mutex poisoned".to_string())?;
        conn.query_row(
            "SELECT COUNT(*) FROM clipboard_items WHERE is_marked != 0",
            [],
            |row| row.get(0),
        )
        .map_err(|error| format!("failed to count marked clipboard items: {error}"))
    }

    pub fn update_item(&self, request: UpdateHistoryItemRequest) -> Result<(), String> {
        let existing = self.get_item(request.id)?;
        let next_text = normalize_text_for_storage(&request.text);
        if next_text.is_empty() {
            return Err("clipboard item text cannot be empty".to_string());
        }

        let existing_hash = existing.normalized_hash.clone();
        let next_hash = if existing.content_kind == "text" {
            hash_text(&next_text)
        } else {
            existing_hash.clone()
        };

        let conn = self
            .conn
            .lock()
            .map_err(|_| "sqlite connection mutex poisoned".to_string())?;
        if next_hash != existing_hash {
            let duplicate_id = conn
                .query_row(
                    "SELECT id
                     FROM clipboard_items
                     WHERE normalized_hash = ?1 AND id != ?2
                     LIMIT 1",
                    params![next_hash, request.id],
                    |row| row.get::<_, i64>(0),
                )
                .map(Some)
                .or_else(|error| {
                    if matches!(error, rusqlite::Error::QueryReturnedNoRows) {
                        Ok(None)
                    } else {
                        Err(error)
                    }
                })
                .map_err(|error| format!("failed to check duplicate clipboard item: {error}"))?;
            if let Some(duplicate_id) = duplicate_id {
                return Err(format!(
                    "clipboard item text duplicates existing item: {duplicate_id}"
                ));
            }
        }

        let next_tags = normalize_optional_text(request.tags);
        let updated = conn
            .execute(
                "UPDATE clipboard_items
                 SET text = ?1,
                     normalized_hash = ?2,
                     title = ?3,
                     notes = ?4,
                     tags = ?5,
                     mime_primary = ?6,
                     is_marked = ?7,
                     marked_at_unix_ms = ?8
                 WHERE id = ?9",
                params![
                    next_text,
                    next_hash,
                    normalize_optional_text(request.title),
                    normalize_optional_text(request.notes),
                    next_tags,
                    normalize_optional_text(request.mime_primary),
                    request.marked.unwrap_or(existing.is_marked) as i64,
                    match request.marked {
                        Some(true) => Some(now_unix_ms()),
                        Some(false) => None,
                        None => existing.marked_at_unix_ms,
                    },
                    request.id
                ],
            )
            .map_err(|error| format!("failed to update clipboard item: {error}"))?;

        if updated == 0 {
            Err(format!("clipboard item not found: {}", request.id))
        } else {
            sync_item_tags_from_legacy_string(&conn, request.id, next_tags.as_deref())?;
            Ok(())
        }
    }

    pub fn delete_item(&self, id: i64) -> Result<(), String> {
        let item = self.get_item(id)?;
        let conn = self
            .conn
            .lock()
            .map_err(|_| "sqlite connection mutex poisoned".to_string())?;

        conn.execute(
            "DELETE FROM clipboard_item_tags WHERE item_id = ?1",
            params![id],
        )
        .map_err(|error| format!("failed to delete clipboard item tags: {error}"))?;

        let deleted = conn
            .execute("DELETE FROM clipboard_items WHERE id = ?1", params![id])
            .map_err(|error| format!("failed to delete clipboard item: {error}"))?;

        if deleted == 0 {
            return Err(format!("clipboard item not found: {id}"));
        }

        drop(conn);
        self.remove_item_blobs(&item);
        Ok(())
    }

    pub fn search(&self, query: &str) -> Result<Vec<HistoryItem>, String> {
        let trimmed = query.trim();
        let mut items = {
            let conn = self
                .conn
                .lock()
                .map_err(|_| "sqlite connection mutex poisoned".to_string())?;
            let compiled = compile_search_plan(&search_plan_from_query(trimmed))?;
            let where_sql = compiled.where_sql;
            let mut query_params = compiled.params;
            query_params.push(Value::Integer(QUERY_LIMIT));
            let sql = history_page_sql(&where_sql, &compiled.order_sql, true);

            self.query_items(&conn, &sql, params_from_iter(query_params.iter()))?
        };
        self.attach_thumbnail_data_urls(&mut items);
        Ok(items)
    }

    pub fn read_blob_for_item(&self, item: &HistoryItem) -> Result<Vec<u8>, String> {
        let relative_path = item
            .blob_path
            .as_deref()
            .ok_or_else(|| format!("clipboard item has no blob: {}", item.id))?;
        let path = self.resolve_relative_blob_path(relative_path)?;

        std::fs::read(&path)
            .map_err(|error| format!("failed to read blob {}: {error}", path.display()))
    }

    pub fn get_settings(&self) -> Result<AppSettings, String> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| "sqlite connection mutex poisoned".to_string())?;

        let settings = settings_from_conn(&conn)?;
        ensure_scripts_folder(&settings)?;
        Ok(settings)
    }

    pub fn update_settings(&self, settings: AppSettings) -> Result<AppSettings, String> {
        validate_settings(&settings)?;
        ensure_scripts_folder(&settings)?;
        let value_json = serde_json::to_string(&settings)
            .map_err(|error| format!("failed to encode settings: {error}"))?;
        let now = now_unix_ms();
        let conn = self
            .conn
            .lock()
            .map_err(|_| "sqlite connection mutex poisoned".to_string())?;

        conn.execute(
            "INSERT INTO app_settings (key, value_json, updated_at_unix_ms)
             VALUES (?1, ?2, ?3)
             ON CONFLICT(key) DO UPDATE SET
                value_json = excluded.value_json,
                updated_at_unix_ms = excluded.updated_at_unix_ms",
            params![APP_SETTINGS_KEY, value_json, now],
        )
        .map_err(|error| format!("failed to persist settings: {error}"))?;

        Ok(settings)
    }

    pub fn list_tags(&self) -> Result<Vec<TagSummary>, String> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| "sqlite connection mutex poisoned".to_string())?;
        query_tag_summaries(&conn, None)
    }

    pub fn create_tag(&self, request: CreateTagRequest) -> Result<TagSummary, String> {
        let (slug, label) = normalize_tag_label(&request.label)?;
        let now = now_unix_ms();
        let conn = self
            .conn
            .lock()
            .map_err(|_| "sqlite connection mutex poisoned".to_string())?;

        conn.execute(
            "INSERT INTO tags (slug, label, color, created_at_unix_ms, updated_at_unix_ms)
             VALUES (?1, ?2, ?3, ?4, ?4)
             ON CONFLICT(slug) DO UPDATE SET
                label = excluded.label,
                color = COALESCE(excluded.color, tags.color),
                updated_at_unix_ms = excluded.updated_at_unix_ms",
            params![slug, label, normalize_optional_text(request.color), now],
        )
        .map_err(|error| format!("failed to create tag: {error}"))?;
        let tag_id = tag_id_by_slug(&conn, &slug)?;
        query_tag_summaries(&conn, Some(tag_id))?
            .pop()
            .ok_or_else(|| format!("tag not found after create: {slug}"))
    }

    pub fn update_tag_config(&self, request: UpdateTagConfigRequest) -> Result<TagSummary, String> {
        let now = now_unix_ms();
        let conn = self
            .conn
            .lock()
            .map_err(|_| "sqlite connection mutex poisoned".to_string())?;
        let existing = query_tag_summaries(&conn, Some(request.tag_id))?
            .pop()
            .ok_or_else(|| format!("tag not found: {}", request.tag_id))?;

        let (next_slug, next_label) = if let Some(label) = request.label {
            normalize_tag_label(&label)?
        } else {
            (existing.slug.clone(), existing.label.clone())
        };
        conn.execute(
            "UPDATE tags
             SET slug = ?1,
                 label = ?2,
                 color = ?3,
                 pinned = ?4,
                 sort_order = ?5,
                 updated_at_unix_ms = ?6
             WHERE id = ?7",
            params![
                next_slug,
                next_label,
                request.color.unwrap_or(existing.color),
                request.pinned.unwrap_or(existing.pinned) as i64,
                request.sort_order.unwrap_or(existing.sort_order),
                now,
                request.tag_id
            ],
        )
        .map_err(|error| format!("failed to update tag: {error}"))?;

        if request.hotkey.is_some() || request.auto_apply_enabled.is_some() {
            let existing_hotkey = conn
                .query_row(
                    "SELECT hotkey FROM tag_configs WHERE tag_id = ?1",
                    params![request.tag_id],
                    |row| row.get::<_, Option<String>>(0),
                )
                .optional()
                .map_err(|error| format!("failed to read tag config: {error}"))?
                .flatten();
            let next_hotkey = request.hotkey.unwrap_or(existing_hotkey);
            let next_auto_apply_enabled = request
                .auto_apply_enabled
                .unwrap_or(existing.auto_apply_enabled);
            let updated = conn
                .execute(
                    "UPDATE tag_configs
                     SET hotkey = ?1,
                         auto_apply_enabled = ?2,
                         updated_at_unix_ms = ?3
                     WHERE tag_id = ?4",
                    params![
                        next_hotkey,
                        next_auto_apply_enabled as i64,
                        now,
                        request.tag_id
                    ],
                )
                .map_err(|error| format!("failed to update tag config: {error}"))?;

            if updated == 0 {
                conn.execute(
                    "INSERT INTO tag_configs (
                        tag_id,
                        hotkey,
                        auto_apply_enabled,
                        created_at_unix_ms,
                        updated_at_unix_ms
                     ) VALUES (?1, ?2, ?3, ?4, ?4)",
                    params![
                        request.tag_id,
                        next_hotkey,
                        next_auto_apply_enabled as i64,
                        now
                    ],
                )
                .map_err(|error| format!("failed to update tag config: {error}"))?;
            }
        }

        sync_legacy_tags_for_tag(&conn, request.tag_id)?;
        query_tag_summaries(&conn, Some(request.tag_id))?
            .pop()
            .ok_or_else(|| format!("tag not found after update: {}", request.tag_id))
    }

    pub fn set_item_tags(&self, request: SetItemTagsRequest) -> Result<(), String> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| "sqlite connection mutex poisoned".to_string())?;
        ensure_item_exists(&conn, request.item_id)?;
        set_item_tags_from_values(&conn, request.item_id, &request.tags)?;
        Ok(())
    }

    pub fn insert_action_run(&self, run: NewActionRun) -> Result<i64, String> {
        serde_json::from_str::<serde_json::Value>(&run.input_summary_json)
            .map_err(|error| format!("invalid action input summary json: {error}"))?;

        let conn = self
            .conn
            .lock()
            .map_err(|_| "sqlite connection mutex poisoned".to_string())?;

        conn.execute(
            "INSERT INTO action_runs (
                action_id,
                trigger,
                status,
                started_at_unix_ms,
                finished_at_unix_ms,
                duration_ms,
                input_summary_json,
                error_class,
                error_message
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                run.action_id,
                run.trigger,
                run.status,
                run.started_at_unix_ms,
                run.finished_at_unix_ms,
                run.duration_ms,
                run.input_summary_json,
                run.error_class,
                run.error_message
            ],
        )
        .map_err(|error| format!("failed to insert action run: {error}"))?;

        Ok(conn.last_insert_rowid())
    }

    pub fn replace_script_action_cache(
        &self,
        actions: &[crate::actions::ActionDefinition],
    ) -> Result<(), String> {
        let now = now_unix_ms();
        let mut conn = self
            .conn
            .lock()
            .map_err(|_| "sqlite connection mutex poisoned".to_string())?;
        let tx = conn
            .transaction()
            .map_err(|error| format!("failed to start script action cache refresh: {error}"))?;

        tx.execute("DELETE FROM script_action_diagnostics", [])
            .map_err(|error| format!("failed to clear script action diagnostics cache: {error}"))?;
        tx.execute("DELETE FROM script_action_registry", [])
            .map_err(|error| format!("failed to clear script action registry cache: {error}"))?;

        for action in actions {
            let Some(script) = &action.script else {
                continue;
            };
            let definition_json = serde_json::to_string(action)
                .map_err(|error| format!("failed to encode script action definition: {error}"))?;

            tx.execute(
                "INSERT INTO script_action_registry (
                    file_path,
                    action_id,
                    file_name,
                    title,
                    description,
                    source_hash,
                    definition_json,
                    diagnostic_count,
                    refreshed_at_unix_ms
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                params![
                    script.path,
                    action.id,
                    script.file_name,
                    action.title,
                    action.description,
                    script.source_hash,
                    definition_json,
                    action.diagnostics.len() as i64,
                    now,
                ],
            )
            .map_err(|error| format!("failed to cache script action registry: {error}"))?;

            for diagnostic in &action.diagnostics {
                tx.execute(
                    "INSERT INTO script_action_diagnostics (
                        file_path,
                        action_id,
                        severity,
                        message,
                        refreshed_at_unix_ms
                     ) VALUES (?1, ?2, ?3, ?4, ?5)",
                    params![
                        script.path,
                        action.id,
                        diagnostic_severity_value(&diagnostic.severity),
                        diagnostic.message,
                        now,
                    ],
                )
                .map_err(|error| format!("failed to cache script action diagnostic: {error}"))?;
            }
        }

        tx.commit()
            .map_err(|error| format!("failed to commit script action cache refresh: {error}"))
    }

    pub fn list_cached_script_actions(
        &self,
    ) -> Result<Vec<crate::actions::ActionDefinition>, String> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| "sqlite connection mutex poisoned".to_string())?;
        let mut statement = conn
            .prepare(
                "SELECT definition_json
                 FROM script_action_registry
                 ORDER BY file_path COLLATE NOCASE",
            )
            .map_err(|error| format!("failed to prepare script action registry query: {error}"))?;
        let rows = statement
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(|error| format!("failed to query script action registry: {error}"))?;

        rows.map(|row| {
            let definition_json =
                row.map_err(|error| format!("failed to read script action registry row: {error}"))?;
            serde_json::from_str(&definition_json)
                .map_err(|error| format!("failed to decode cached script action: {error}"))
        })
        .collect()
    }

    pub fn list_cached_script_diagnostics(&self) -> Result<Vec<CachedScriptDiagnostic>, String> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| "sqlite connection mutex poisoned".to_string())?;
        let mut statement = conn
            .prepare(
                "SELECT file_path, action_id, severity, message
                 FROM script_action_diagnostics
                 ORDER BY file_path COLLATE NOCASE, id",
            )
            .map_err(|error| {
                format!("failed to prepare script action diagnostics query: {error}")
            })?;
        let rows = statement
            .query_map([], |row| {
                Ok(CachedScriptDiagnostic {
                    file_path: row.get(0)?,
                    action_id: row.get(1)?,
                    severity: row.get(2)?,
                    message: row.get(3)?,
                })
            })
            .map_err(|error| format!("failed to query script action diagnostics: {error}"))?;

        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|error| format!("failed to read script action diagnostics row: {error}"))
    }

    fn query_items<P>(
        &self,
        conn: &Connection,
        sql: &str,
        params: P,
    ) -> Result<Vec<HistoryItem>, String>
    where
        P: rusqlite::Params,
    {
        query_items(conn, sql, params)
    }

    fn attach_thumbnail_data_urls(&self, items: &mut [HistoryItem]) {
        for item in items {
            item.thumbnail_data_url = self.thumbnail_data_url(item);
        }
    }

    fn thumbnail_data_url(&self, item: &HistoryItem) -> Option<String> {
        let relative_path = item.thumbnail_path.as_deref()?;
        let path = self.resolve_relative_blob_path(relative_path).ok()?;
        let bytes = std::fs::read(path).ok()?;
        Some(format!(
            "data:image/png;base64,{}",
            BASE64_STANDARD.encode(bytes)
        ))
    }

    fn resolve_relative_blob_path(&self, relative_path: &str) -> Result<PathBuf, String> {
        blobs::resolve_relative_blob_path(&self.app_data_dir, relative_path)
    }

    fn remove_item_blobs(&self, item: &HistoryItem) {
        self.remove_blob_paths([ItemBlobPaths {
            blob_path: item.blob_path.clone(),
            thumbnail_path: item.thumbnail_path.clone(),
        }]);
    }

    fn remove_blob_paths<I>(&self, blob_paths: I)
    where
        I: IntoIterator<Item = ItemBlobPaths>,
    {
        let blob_paths = blob_paths.into_iter().collect::<Vec<_>>();
        if blob_paths.is_empty() {
            return;
        }

        let conn = match self.conn.lock() {
            Ok(conn) => conn,
            Err(_) => return,
        };
        for blob_paths in blob_paths {
            for relative_path in [blob_paths.blob_path, blob_paths.thumbnail_path]
                .into_iter()
                .flatten()
            {
                if blob_path_is_referenced(&conn, &relative_path).unwrap_or(true) {
                    continue;
                }
                self.remove_relative_blob_path(&relative_path);
            }
        }
    }

    fn remove_relative_blob_path(&self, relative_path: &str) {
        let relative_path = relative_path.trim();
        if relative_path.is_empty() {
            return;
        }
        if let Ok(path) = self.resolve_relative_blob_path(relative_path) {
            let _ = std::fs::remove_file(path);
        }
    }
}

struct ItemBlobPaths {
    blob_path: Option<String>,
    thumbnail_path: Option<String>,
}

fn query_items<P>(conn: &Connection, sql: &str, params: P) -> Result<Vec<HistoryItem>, String>
where
    P: rusqlite::Params,
{
    let mut statement = conn
        .prepare(sql)
        .map_err(|error| format!("failed to prepare clipboard history query: {error}"))?;
    let rows = statement
        .query_map(params, |row| {
            Ok(HistoryItem {
                id: row.get(0)?,
                content_kind: row.get(1)?,
                text: row.get(2)?,
                preview_text: row.get(3)?,
                text_char_count: row.get(4)?,
                includes_content: row.get(5)?,
                normalized_hash: row.get(6)?,
                created_at_unix_ms: row.get(7)?,
                last_used_at_unix_ms: row.get(8)?,
                last_copied_at_unix_ms: row.get(9)?,
                copy_count: row.get(10)?,
                mime_primary: row.get(11)?,
                blob_path: row.get(12)?,
                thumbnail_path: row.get(13)?,
                byte_size: row.get(14)?,
                width: row.get(15)?,
                height: row.get(16)?,
                thumbnail_data_url: None,
                title: row.get(17)?,
                notes: row.get(18)?,
                tags: row.get(19)?,
                is_marked: row.get(20)?,
                marked_at_unix_ms: row.get(21)?,
            })
        })
        .map_err(|error| format!("failed to query clipboard history: {error}"))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("failed to read clipboard history row: {error}"))
}

fn count_history_items(
    conn: &Connection,
    where_sql: &str,
    params: &[Value],
) -> Result<i64, String> {
    let sql = format!("SELECT COUNT(*) FROM clipboard_items {where_sql}");
    conn.query_row(&sql, params_from_iter(params.iter()), |row| row.get(0))
        .map_err(|error| format!("failed to count clipboard history: {error}"))
}

fn default_true() -> bool {
    true
}

fn query_tag_summaries(conn: &Connection, tag_id: Option<i64>) -> Result<Vec<TagSummary>, String> {
    let filter_sql = if tag_id.is_some() {
        "WHERE tags.id = ?1"
    } else {
        ""
    };
    let sql = format!(
        "SELECT
            tags.id,
            tags.slug,
            tags.label,
            tags.color,
            tags.pinned,
            tags.sort_order,
            COUNT(clipboard_item_tags.item_id) AS item_count,
            COALESCE(tag_configs.auto_apply_enabled, 0) AS auto_apply_enabled
         FROM tags
         LEFT JOIN clipboard_item_tags ON clipboard_item_tags.tag_id = tags.id
         LEFT JOIN tag_configs ON tag_configs.tag_id = tags.id
         {filter_sql}
         GROUP BY tags.id, tag_configs.id
         ORDER BY tags.pinned DESC, tags.sort_order IS NULL, tags.sort_order ASC, item_count DESC, tags.label COLLATE NOCASE ASC"
    );
    let mut statement = conn
        .prepare(&sql)
        .map_err(|error| format!("failed to prepare tag query: {error}"))?;
    let params = tag_id
        .map(|id| vec![Value::Integer(id)])
        .unwrap_or_default();
    let rows = statement
        .query_map(params_from_iter(params.iter()), |row| {
            Ok(TagSummary {
                id: row.get(0)?,
                slug: row.get(1)?,
                label: row.get(2)?,
                color: row.get(3)?,
                pinned: row.get::<_, i64>(4)? != 0,
                sort_order: row.get(5)?,
                item_count: row.get(6)?,
                auto_apply_enabled: row.get::<_, i64>(7)? != 0,
            })
        })
        .map_err(|error| format!("failed to query tags: {error}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("failed to read tag row: {error}"))
}

fn normalize_tag_label(value: &str) -> Result<(String, String), String> {
    let label = value.trim().trim_start_matches('#').trim().to_string();
    if label.is_empty() {
        return Err("tag label cannot be empty".to_string());
    }
    let slug = label
        .chars()
        .filter_map(|ch| {
            if ch.is_alphanumeric() || matches!(ch, '-' | '_' | '/') {
                Some(ch.to_ascii_lowercase())
            } else if ch.is_whitespace() {
                Some('-')
            } else {
                None
            }
        })
        .collect::<String>()
        .split('-')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("-");
    if slug.is_empty() {
        return Err("tag label must contain letters or numbers".to_string());
    }
    Ok((slug, label))
}

fn normalize_tag_values(values: &[String]) -> Result<Vec<(String, String)>, String> {
    let mut normalized = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for value in values {
        let (slug, label) = normalize_tag_label(value)?;
        if seen.insert(slug.clone()) {
            normalized.push((slug, label));
        }
    }
    Ok(normalized)
}

fn legacy_tags_to_values(value: Option<&str>) -> Vec<String> {
    value
        .unwrap_or_default()
        .replace(',', " ")
        .split_whitespace()
        .map(|tag| tag.trim().trim_start_matches('#').trim().to_string())
        .filter(|tag| !tag.is_empty())
        .collect()
}

fn legacy_tag_string_from_labels(labels: &[String]) -> Option<String> {
    if labels.is_empty() {
        return None;
    }
    Some(
        labels
            .iter()
            .map(|label| format!("#{label}"))
            .collect::<Vec<_>>()
            .join(" "),
    )
}

fn ensure_item_exists(conn: &Connection, item_id: i64) -> Result<(), String> {
    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM clipboard_items WHERE id = ?1",
            params![item_id],
            |row| row.get(0),
        )
        .map_err(|error| format!("failed to check clipboard item: {error}"))?;
    if count == 0 {
        Err(format!("clipboard item not found: {item_id}"))
    } else {
        Ok(())
    }
}

fn tag_id_by_slug(conn: &Connection, slug: &str) -> Result<i64, String> {
    conn.query_row(
        "SELECT id FROM tags WHERE slug = ?1",
        params![slug],
        |row| row.get(0),
    )
    .map_err(|error| format!("failed to load tag id for {slug}: {error}"))
}

fn set_item_tags_from_values(
    conn: &Connection,
    item_id: i64,
    values: &[String],
) -> Result<(), String> {
    let normalized = normalize_tag_values(values)?;
    let now = now_unix_ms();
    conn.execute(
        "DELETE FROM clipboard_item_tags WHERE item_id = ?1",
        params![item_id],
    )
    .map_err(|error| format!("failed to clear item tags: {error}"))?;
    let mut labels = Vec::new();
    for (slug, label) in normalized {
        conn.execute(
            "INSERT INTO tags (slug, label, created_at_unix_ms, updated_at_unix_ms)
             VALUES (?1, ?2, ?3, ?3)
             ON CONFLICT(slug) DO UPDATE SET
                label = excluded.label,
                updated_at_unix_ms = excluded.updated_at_unix_ms",
            params![slug, label, now],
        )
        .map_err(|error| format!("failed to upsert tag: {error}"))?;
        let tag_id = tag_id_by_slug(conn, &slug)?;
        conn.execute(
            "INSERT OR IGNORE INTO clipboard_item_tags (
                item_id,
                tag_id,
                created_at_unix_ms,
                source,
                confidence
             ) VALUES (?1, ?2, ?3, 'manual', NULL)",
            params![item_id, tag_id, now],
        )
        .map_err(|error| format!("failed to link item tag: {error}"))?;
        labels.push(label);
    }
    conn.execute(
        "UPDATE clipboard_items SET tags = ?1 WHERE id = ?2",
        params![legacy_tag_string_from_labels(&labels), item_id],
    )
    .map_err(|error| format!("failed to sync legacy item tags: {error}"))?;
    Ok(())
}

fn sync_item_tags_from_legacy_string(
    conn: &Connection,
    item_id: i64,
    legacy_tags: Option<&str>,
) -> Result<(), String> {
    set_item_tags_from_values(conn, item_id, &legacy_tags_to_values(legacy_tags))
}

fn sync_legacy_tags_for_tag(conn: &Connection, tag_id: i64) -> Result<(), String> {
    let mut statement = conn
        .prepare("SELECT item_id FROM clipboard_item_tags WHERE tag_id = ?1")
        .map_err(|error| format!("failed to prepare tag item sync: {error}"))?;
    let item_ids = statement
        .query_map(params![tag_id], |row| row.get::<_, i64>(0))
        .map_err(|error| format!("failed to query tag item sync: {error}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("failed to read tag item sync row: {error}"))?;
    for item_id in item_ids {
        let mut labels_statement = conn
            .prepare(
                "SELECT tags.label
                 FROM clipboard_item_tags
                 JOIN tags ON tags.id = clipboard_item_tags.tag_id
                 WHERE clipboard_item_tags.item_id = ?1
                 ORDER BY tags.label COLLATE NOCASE ASC",
            )
            .map_err(|error| format!("failed to prepare legacy tag labels: {error}"))?;
        let labels = labels_statement
            .query_map(params![item_id], |row| row.get::<_, String>(0))
            .map_err(|error| format!("failed to query legacy tag labels: {error}"))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| format!("failed to read legacy tag label row: {error}"))?;
        conn.execute(
            "UPDATE clipboard_items SET tags = ?1 WHERE id = ?2",
            params![legacy_tag_string_from_labels(&labels), item_id],
        )
        .map_err(|error| format!("failed to update legacy tags after tag change: {error}"))?;
    }
    Ok(())
}

fn bump_existing_capture(
    conn: &Connection,
    normalized_hash: &str,
    copied_at_unix_ms: i64,
) -> Result<Option<i64>, String> {
    let existing_id = conn
        .query_row(
            "SELECT id
             FROM clipboard_items
             WHERE normalized_hash = ?1
             ORDER BY COALESCE(last_copied_at_unix_ms, created_at_unix_ms) DESC, id DESC
             LIMIT 1",
            params![normalized_hash],
            |row| row.get::<_, i64>(0),
        )
        .map(Some)
        .or_else(|error| {
            if matches!(error, rusqlite::Error::QueryReturnedNoRows) {
                Ok(None)
            } else {
                Err(error)
            }
        })
        .map_err(|error| format!("failed to check existing clipboard item: {error}"))?;

    let Some(existing_id) = existing_id else {
        return Ok(None);
    };

    conn.execute(
        "UPDATE clipboard_items
         SET last_copied_at_unix_ms = ?1,
             copy_count = COALESCE(copy_count, 1) + 1
         WHERE id = ?2",
        params![copied_at_unix_ms, existing_id],
    )
    .map_err(|error| format!("failed to move existing clipboard item to top: {error}"))?;

    Ok(Some(existing_id))
}

fn escape_like(query: &str) -> String {
    query
        .replace('\\', "\\\\")
        .replace('%', "\\%")
        .replace('_', "\\_")
}

fn normalize_text_for_storage(text: &str) -> String {
    text.replace("\r\n", "\n").trim().to_string()
}

fn normalize_optional_text(text: Option<String>) -> Option<String> {
    text.map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

pub(crate) fn hash_text(text: &str) -> String {
    let digest = Sha256::digest(text.as_bytes());
    digest.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn now_unix_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis().min(i64::MAX as u128) as i64)
        .unwrap_or_default()
}

fn default_scripts_folder_path() -> String {
    default_scripts_folder_path_from_env(
        std::env::var_os("COPICU_SCRIPTS_DIR"),
        std::env::var_os("USERPROFILE"),
        std::env::var_os("HOME"),
    )
}

fn default_scripts_folder_path_from_env(
    copicu_scripts_dir: Option<std::ffi::OsString>,
    user_profile: Option<std::ffi::OsString>,
    home: Option<std::ffi::OsString>,
) -> String {
    if let Some(path) = copicu_scripts_dir
        .map(PathBuf::from)
        .filter(|path| !path.as_os_str().is_empty())
    {
        return path.to_string_lossy().into_owned();
    }

    user_profile
        .or(home)
        .map(PathBuf::from)
        .map(|path| path.join("Documents").join("Copicu").join("Scripts"))
        .unwrap_or_else(|| PathBuf::from("Copicu").join("Scripts"))
        .to_string_lossy()
        .into_owned()
}

fn settings_from_conn(conn: &Connection) -> Result<AppSettings, String> {
    let value_json: Option<String> = conn
        .query_row(
            "SELECT value_json FROM app_settings WHERE key = ?1",
            params![APP_SETTINGS_KEY],
            |row| row.get(0),
        )
        .map(Some)
        .or_else(|error| {
            if matches!(error, rusqlite::Error::QueryReturnedNoRows) {
                Ok(None)
            } else {
                Err(error)
            }
        })
        .map_err(|error| format!("failed to read settings: {error}"))?;

    let Some(value_json) = value_json else {
        return Ok(AppSettings::default());
    };

    let mut settings: AppSettings = serde_json::from_str(&value_json)
        .map_err(|error| format!("failed to parse settings: {error}"))?;
    normalize_loaded_settings(&mut settings);
    validate_settings(&settings)?;
    Ok(settings)
}

fn normalize_loaded_settings(settings: &mut AppSettings) {
    let endpoint = settings.ai.endpoint.trim().trim_end_matches('/');
    let model = settings.ai.model.trim();
    if endpoint.is_empty() {
        settings.ai.endpoint = DEFAULT_AI_ENDPOINT.to_string();
    } else {
        settings.ai.endpoint = endpoint.to_string();
    }
    if model.is_empty() {
        settings.ai.model = DEFAULT_AI_MODEL.to_string();
    } else {
        settings.ai.model = model.to_string();
    }
}

fn retention_limit_from_conn(conn: &Connection) -> i64 {
    settings_from_conn(conn)
        .map(|settings| settings.history.retention_count)
        .unwrap_or(UNLIMITED_HISTORY_LIMIT)
}

fn prune_history_from_conn(conn: &Connection) -> Result<Vec<ItemBlobPaths>, String> {
    let limit = retention_limit_from_conn(conn);
    if limit == UNLIMITED_HISTORY_LIMIT {
        return Ok(Vec::new());
    }

    let pruned_blobs = pruned_blob_paths_from_conn(conn, limit)?;

    conn.execute(
        "DELETE FROM clipboard_item_tags
         WHERE item_id NOT IN (
            SELECT id FROM clipboard_items
            ORDER BY COALESCE(last_copied_at_unix_ms, created_at_unix_ms) DESC, id DESC
            LIMIT ?1
         )",
        params![limit],
    )
    .map_err(|error| format!("failed to prune clipboard item tags: {error}"))?;

    conn.execute(
        "DELETE FROM clipboard_items
         WHERE id NOT IN (
            SELECT id FROM clipboard_items
            ORDER BY COALESCE(last_copied_at_unix_ms, created_at_unix_ms) DESC, id DESC
            LIMIT ?1
         )",
        params![limit],
    )
    .map_err(|error| format!("failed to prune clipboard history: {error}"))?;

    Ok(pruned_blobs)
}

fn pruned_blob_paths_from_conn(
    conn: &Connection,
    limit: i64,
) -> Result<Vec<ItemBlobPaths>, String> {
    let mut statement = conn
        .prepare(
            "SELECT blob_path, thumbnail_path
             FROM clipboard_items
             WHERE id NOT IN (
                SELECT id FROM clipboard_items
                ORDER BY COALESCE(last_copied_at_unix_ms, created_at_unix_ms) DESC, id DESC
                LIMIT ?1
             )
             AND (
                (blob_path IS NOT NULL AND TRIM(blob_path) != '')
                OR (thumbnail_path IS NOT NULL AND TRIM(thumbnail_path) != '')
             )",
        )
        .map_err(|error| format!("failed to prepare pruned blob query: {error}"))?;
    let rows = statement
        .query_map(params![limit], |row| {
            Ok(ItemBlobPaths {
                blob_path: row.get(0)?,
                thumbnail_path: row.get(1)?,
            })
        })
        .map_err(|error| format!("failed to query pruned blobs: {error}"))?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("failed to read pruned blob row: {error}"))
}

fn validate_settings(settings: &AppSettings) -> Result<(), String> {
    if settings.schema_version != SETTINGS_SCHEMA_VERSION {
        return Err(format!(
            "unsupported settings schema version: {}",
            settings.schema_version
        ));
    }
    if settings.general.global_shortcut.trim().is_empty() {
        return Err("global shortcut cannot be empty".to_string());
    }
    if settings.scripts.folder_path.trim().is_empty() {
        return Err("scripts folder path cannot be empty".to_string());
    }
    if settings.ai.enabled {
        if settings.ai.endpoint.trim().is_empty() {
            return Err("AI endpoint cannot be empty when AI is enabled".to_string());
        }
        if settings.ai.model.trim().is_empty() {
            return Err("AI model cannot be empty when AI is enabled".to_string());
        }
    }
    if settings.history.retention_count != UNLIMITED_HISTORY_LIMIT
        && (settings.history.retention_count < MIN_RETENTION_COUNT
            || settings.history.retention_count > MAX_RETENTION_COUNT)
    {
        return Err(format!(
            "retention count must be 0 for unlimited or between {MIN_RETENTION_COUNT} and {MAX_RETENTION_COUNT}"
        ));
    }

    Ok(())
}

fn ensure_scripts_folder(settings: &AppSettings) -> Result<(), String> {
    let folder_path = settings.scripts.folder_path.trim();
    std::fs::create_dir_all(folder_path)
        .map_err(|error| format!("failed to create scripts folder {folder_path}: {error}"))
}

fn diagnostic_severity_value(severity: &crate::actions::DiagnosticSeverity) -> &'static str {
    match severity {
        crate::actions::DiagnosticSeverity::Info => "info",
        crate::actions::DiagnosticSeverity::Warning => "warning",
        crate::actions::DiagnosticSeverity::Error => "error",
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;
    use std::sync::{Arc, Mutex};
    use std::time::Instant;

    #[test]
    fn escape_like_escapes_wildcards_and_escape_character() {
        assert_eq!(escape_like(r"a\b%c_d"), r"a\\b\%c\_d");
    }

    #[test]
    fn blob_path_resolution_rejects_absolute_paths() {
        let storage = test_storage();

        assert!(storage
            .resolve_relative_blob_path(r"C:\temp\image.png")
            .is_err());
        assert!(storage
            .resolve_relative_blob_path(r"\\server\share\image.png")
            .is_err());
    }

    #[test]
    fn blob_path_resolution_rejects_parent_segments() {
        let storage = test_storage();

        assert!(storage.resolve_relative_blob_path("../image.png").is_err());
        assert!(storage
            .resolve_relative_blob_path("blobs/../image.png")
            .is_err());
    }

    #[test]
    fn blob_path_resolution_accepts_safe_relative_paths() {
        let storage = test_storage();

        let resolved = storage
            .resolve_relative_blob_path("blobs/thumbnails/hash.png")
            .expect("safe thumbnail path should resolve");

        assert_eq!(
            resolved,
            storage.app_data_dir.join("blobs/thumbnails/hash.png")
        );
    }

    #[test]
    fn settings_default_when_not_persisted() {
        let storage = test_storage_with_migrations();

        assert_eq!(
            storage.get_settings().expect("settings should load"),
            AppSettings::default()
        );
    }

    #[test]
    fn settings_validation_rejects_invalid_retention_count() {
        let mut settings = AppSettings::default();
        settings.history.retention_count = 99;

        assert!(validate_settings(&settings).is_err());
    }

    #[test]
    fn settings_deserialize_old_schema_adds_scripts_defaults() {
        let json = r#"{
            "schemaVersion": 1,
            "general": { "globalShortcut": "Ctrl+Shift+," },
            "picker": { "hideOnFocusLost": true, "enterAction": "copy" },
            "history": { "retentionCount": 0 },
            "appearance": { "theme": "system" }
        }"#;

        let settings: AppSettings =
            serde_json::from_str(json).expect("old settings should deserialize");

        assert_eq!(settings.scripts, ScriptsSettings::default());
        assert_eq!(settings.ai, AiSettings::default());
        assert_eq!(settings.appearance.theme_id, ThemeId::Default);
        validate_settings(&settings).expect("old settings with script defaults should validate");
    }

    #[test]
    fn settings_validation_rejects_enabled_ai_without_model_config() {
        let mut settings = AppSettings::default();
        settings.ai.enabled = true;
        settings.ai.model = String::new();

        assert!(validate_settings(&settings)
            .expect_err("invalid AI settings should fail")
            .contains("AI model"));
    }

    #[test]
    fn default_scripts_folder_prefers_explicit_env_override() {
        assert_eq!(
            default_scripts_folder_path_from_env(
                Some(r"C:\CopicuScripts".into()),
                Some(r"C:\Users\JP".into()),
                Some(r"C:\Users\Other".into()),
            ),
            r"C:\CopicuScripts"
        );
        assert_eq!(
            default_scripts_folder_path_from_env(
                None,
                Some(r"C:\Users\JP".into()),
                Some(r"C:\Users\Other".into()),
            ),
            r"C:\Users\JP\Documents\Copicu\Scripts"
        );
        assert_eq!(
            default_scripts_folder_path_from_env(None, None, None),
            r"Copicu\Scripts"
        );
    }

    #[test]
    fn action_run_log_persists_redacted_summary_metadata() {
        let storage = test_storage_with_migrations();

        let run_id = storage
            .insert_action_run(NewActionRun {
                action_id: "builtin.joinSelected".to_string(),
                trigger: "itemMenu".to_string(),
                status: "completed".to_string(),
                started_at_unix_ms: 40_000,
                finished_at_unix_ms: 40_012,
                duration_ms: 12,
                input_summary_json: r#"{"selectedCount":2,"kinds":{"text":2}}"#.to_string(),
                error_class: None,
                error_message: None,
            })
            .expect("action run should insert");

        let conn = storage
            .conn
            .lock()
            .expect("test sqlite connection lock should work");
        let stored: (String, String, i64, String) = conn
            .query_row(
                "SELECT action_id, status, duration_ms, input_summary_json
                 FROM action_runs
                 WHERE id = ?1",
                params![run_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
            )
            .expect("action run should be readable");

        assert_eq!(stored.0, "builtin.joinSelected");
        assert_eq!(stored.1, "completed");
        assert_eq!(stored.2, 12);
        assert!(!stored.3.contains("COPICU_SYNTH"));
    }

    #[test]
    fn script_action_cache_persists_registry_and_diagnostics() {
        let storage = test_storage_with_migrations();
        let action = crate::actions::ActionDefinition {
            id: "examples.cached".to_string(),
            title: "Cached Example".to_string(),
            description: "Registry metadata only".to_string(),
            shortcut: Some("Ctrl+Alt+C".to_string()),
            triggers: vec![crate::actions::Trigger::DevRun],
            input: crate::actions::ActionInput {
                source: crate::actions::ActionInputSource::None,
                selection: crate::actions::SelectionRequirement::None,
                kinds: None,
                mime: None,
                query: None,
            },
            capabilities: vec!["log:write".to_string()],
            builtin: false,
            source: crate::actions::ActionSource::Script,
            script: Some(crate::actions::ScriptActionMetadata {
                path: r"C:\Users\JP\Documents\Copicu\Scripts\cached.ts".to_string(),
                file_name: "cached.ts".to_string(),
                source_hash: "hash-cached".to_string(),
            }),
            diagnostics: vec![crate::actions::ActionDiagnostic {
                severity: crate::actions::DiagnosticSeverity::Warning,
                message: "synthetic warning".to_string(),
            }],
            logging: Some(crate::actions::ActionLogging {
                name: Some("cached.jsonl".to_string()),
                redact: true,
            }),
        };

        storage
            .replace_script_action_cache(std::slice::from_ref(&action))
            .expect("script action cache should refresh");

        let cached = storage
            .list_cached_script_actions()
            .expect("script action cache should be readable");
        assert_eq!(cached, vec![action]);

        let diagnostics = storage
            .list_cached_script_diagnostics()
            .expect("script diagnostics cache should be readable");
        assert_eq!(diagnostics.len(), 1);
        assert_eq!(diagnostics[0].action_id, "examples.cached");
        assert_eq!(diagnostics[0].severity, "warning");
        assert_eq!(diagnostics[0].message, "synthetic warning");
        assert!(diagnostics[0].file_path.ends_with("cached.ts"));
    }

    #[test]
    fn list_page_uses_keyset_cursor() {
        let storage = test_storage_with_migrations();
        for id in 1..=5 {
            insert_test_text_item(&storage, id, 10_000 + id, &format!("item {id}"));
        }

        let first_page = storage
            .list_page(HistoryPageRequest {
                query: String::new(),
                cursor: None,
                limit: Some(2),
            })
            .expect("first page should load");
        assert_eq!(ids(&first_page.items), vec![5, 4]);
        assert_eq!(first_page.total_count, Some(5));
        assert_eq!(first_page.filtered_count, Some(5));
        assert_eq!(
            first_page.next_cursor,
            Some(HistoryPageCursor {
                after_sort_unix_ms: 10_004,
                after_id: 4,
            })
        );

        let second_page = storage
            .list_page(HistoryPageRequest {
                query: String::new(),
                cursor: first_page.next_cursor,
                limit: Some(2),
            })
            .expect("second page should load");
        assert_eq!(ids(&second_page.items), vec![3, 2]);
        assert_eq!(second_page.total_count, Some(5));
        assert_eq!(second_page.filtered_count, Some(5));
    }

    #[test]
    fn history_search_explains_and_warns_for_ai_mode_without_planner() {
        let storage = test_storage_with_migrations();
        insert_test_text_item(&storage, 1, 10_001, "sqlite migration note");

        let page = storage
            .history_search(HistorySearchRequest {
                query: "sqlite".to_string(),
                cursor: None,
                limit: Some(10),
                plan: None,
                mode: HistorySearchMode::Ai,
                include_content: true,
                include_counts: true,
                explain: true,
                ai_context: None,
            })
            .expect("history search should load");

        assert_eq!(ids(&page.items), vec![1]);
        assert_eq!(page.interpreted_query.as_deref(), Some("sqlite"));
        assert!(page
            .explanation
            .as_deref()
            .unwrap_or_default()
            .contains("Structured local history search"));
        assert!(page.warnings.iter().any(|warning| warning.contains("AI")));
    }

    #[test]
    fn list_page_searches_with_cursor() {
        let storage = test_storage_with_migrations();
        for id in 1..=5 {
            let text = if id == 4 { "other" } else { "needle" };
            insert_test_text_item(&storage, id, 20_000 + id, text);
        }

        let first_page = storage
            .list_page(HistoryPageRequest {
                query: "needle".to_string(),
                cursor: None,
                limit: Some(2),
            })
            .expect("first search page should load");
        assert_eq!(ids(&first_page.items), vec![5, 3]);
        assert_eq!(first_page.total_count, Some(5));
        assert_eq!(first_page.filtered_count, Some(4));

        let second_page = storage
            .list_page(HistoryPageRequest {
                query: "needle".to_string(),
                cursor: first_page.next_cursor,
                limit: Some(2),
            })
            .expect("second search page should load");
        assert_eq!(ids(&second_page.items), vec![2, 1]);
        assert_eq!(second_page.next_cursor, None);
        assert_eq!(second_page.total_count, Some(5));
        assert_eq!(second_page.filtered_count, Some(4));
    }

    #[test]
    fn insert_text_recapture_moves_existing_item_to_top_without_duplicate() {
        let storage = test_storage_with_migrations();
        insert_test_text_item(&storage, 1, 10_001, "older");
        insert_test_text_item(&storage, 2, 10_002, "newer");

        storage
            .insert_text("older", "hash-1")
            .expect("existing item should be bumped");

        let page = storage
            .list_page(HistoryPageRequest {
                query: String::new(),
                cursor: None,
                limit: Some(10),
            })
            .expect("history should load");

        assert_eq!(ids(&page.items), vec![1, 2]);
        assert_eq!(page.total_count, Some(2));
        assert_eq!(page.items[0].created_at_unix_ms, 10_001);
        assert!(page.items[0].last_copied_at_unix_ms >= page.items[1].last_copied_at_unix_ms);
        assert_eq!(page.items[0].copy_count, 2);
    }

    #[test]
    fn history_search_without_content_returns_preview_dto() {
        let storage = test_storage_with_migrations();
        let full_text = format!(
            "COPICU_SYNTH_PREVIEW_START {} COPICU_SYNTH_PREVIEW_END",
            "synthetic-long-body ".repeat(180)
        );
        insert_test_text_item(&storage, 1, 10_001, &full_text);

        let preview_page = storage
            .history_search(HistorySearchRequest {
                query: String::new(),
                cursor: None,
                limit: Some(10),
                plan: None,
                mode: HistorySearchMode::Structured,
                include_content: false,
                include_counts: true,
                explain: false,
                ai_context: None,
            })
            .expect("preview page should load");

        let preview_item = &preview_page.items[0];
        assert!(!preview_item.includes_content);
        assert_eq!(preview_item.text(), preview_item.preview_text);
        assert_eq!(
            preview_item.text_char_count,
            full_text.chars().count() as i64
        );
        assert!(preview_item.text().chars().count() <= HISTORY_PREVIEW_CHAR_LIMIT as usize);
        assert!(!preview_item.text().contains("COPICU_SYNTH_PREVIEW_END"));

        let full_page = storage
            .history_search(HistorySearchRequest {
                query: String::new(),
                cursor: None,
                limit: Some(10),
                plan: None,
                mode: HistorySearchMode::Structured,
                include_content: true,
                include_counts: true,
                explain: false,
                ai_context: None,
            })
            .expect("full page should load");

        assert!(full_page.items[0].includes_content);
        assert_eq!(full_page.items[0].text(), full_text);
    }

    #[test]
    fn image_history_item_uses_thumbnail_data_url_from_thumbnail_path() {
        let storage = test_storage_with_migrations();
        let main_relative_path = Path::new(IMAGE_BLOB_DIR).join("synthetic-main.png");
        let thumbnail_relative_path = Path::new(THUMBNAIL_BLOB_DIR).join("synthetic-thumb.png");
        let main_path = storage.app_data_dir.join(&main_relative_path);
        let thumbnail_path = storage.app_data_dir.join(&thumbnail_relative_path);
        let main_bytes = b"synthetic-main-png-bytes";
        let thumbnail_bytes = b"synthetic-thumbnail-png-bytes";
        write_blob(&main_path, main_bytes).expect("main blob should write");
        write_blob(&thumbnail_path, thumbnail_bytes).expect("thumbnail blob should write");
        insert_test_image_item(
            &storage,
            1,
            10_001,
            &path_to_db_string(&main_relative_path),
            &path_to_db_string(&thumbnail_relative_path),
        );

        let page = storage
            .history_search(HistorySearchRequest {
                query: String::new(),
                cursor: None,
                limit: Some(10),
                plan: None,
                mode: HistorySearchMode::Structured,
                include_content: false,
                include_counts: true,
                explain: false,
                ai_context: None,
            })
            .expect("image page should load");

        let data_url = page.items[0]
            .thumbnail_data_url
            .as_deref()
            .expect("thumbnail data URL should be present");
        assert!(data_url.ends_with(&BASE64_STANDARD.encode(thumbnail_bytes)));
        assert!(!data_url.ends_with(&BASE64_STANDARD.encode(main_bytes)));
    }

    #[test]
    fn prune_history_removes_image_blob_and_thumbnail_files() {
        let storage = test_storage_with_migrations();
        let mut settings = AppSettings::default();
        settings.history.retention_count = MIN_RETENTION_COUNT;
        let settings_json =
            serde_json::to_string(&settings).expect("test settings should serialize");
        {
            let conn = storage
                .conn
                .lock()
                .expect("test sqlite connection lock should work");
            conn.execute(
                "INSERT INTO app_settings (key, value_json, updated_at_unix_ms)
                 VALUES (?1, ?2, 1)",
                params![APP_SETTINGS_KEY, settings_json],
            )
            .expect("test retention settings should persist");
        }

        let main_relative_path = Path::new(IMAGE_BLOB_DIR).join("synthetic-pruned-main.png");
        let thumbnail_relative_path =
            Path::new(THUMBNAIL_BLOB_DIR).join("synthetic-pruned-thumb.png");
        let main_path = storage.app_data_dir.join(&main_relative_path);
        let thumbnail_path = storage.app_data_dir.join(&thumbnail_relative_path);
        write_blob(&main_path, b"synthetic-pruned-main-png-bytes").expect("main blob should write");
        write_blob(&thumbnail_path, b"synthetic-pruned-thumbnail-png-bytes")
            .expect("thumbnail blob should write");
        insert_test_image_item(
            &storage,
            1,
            10_001,
            &path_to_db_string(&main_relative_path),
            &path_to_db_string(&thumbnail_relative_path),
        );

        for id in 2..=MIN_RETENTION_COUNT {
            let text = format!("synthetic retention filler {id}");
            insert_test_text_item(&storage, id, 10_001 + id, &text);
        }

        assert!(main_path.exists());
        assert!(thumbnail_path.exists());

        storage
            .insert_text(
                "synthetic retention trigger",
                "synthetic-retention-trigger-hash",
            )
            .expect("trigger insert should prune history");

        assert!(storage.get_item(1).is_err());
        assert!(!main_path.exists());
        assert!(!thumbnail_path.exists());
    }

    #[test]
    fn history_search_can_skip_counts_for_interactive_pages() {
        let storage = test_storage_with_migrations();
        for id in 1..=4 {
            insert_test_text_item(
                &storage,
                id,
                50_000 + id,
                &format!("synthetic scalable search needle {id}"),
            );
        }

        let page = storage
            .history_search(HistorySearchRequest {
                query: "needle".to_string(),
                cursor: None,
                limit: Some(2),
                plan: None,
                mode: HistorySearchMode::Structured,
                include_content: false,
                include_counts: false,
                explain: false,
                ai_context: None,
            })
            .expect("history search without counts should load");

        assert_eq!(ids(&page.items), vec![4, 3]);
        assert_eq!(
            page.next_cursor,
            Some(HistoryPageCursor {
                after_sort_unix_ms: 50_003,
                after_id: 3,
            })
        );
        assert_eq!(page.total_count, None);
        assert_eq!(page.filtered_count, None);
    }

    #[test]
    fn migration_consolidates_existing_duplicate_hashes() {
        let mut conn = Connection::open_in_memory().expect("in-memory sqlite should open");
        let migrations_before_consolidation = Migrations::from_slice(&MIGRATIONS_SLICE[..5]);
        migrations_before_consolidation
            .to_latest(&mut conn)
            .expect("pre-consolidation migrations should run");

        for (id, created_at, last_copied_at, copy_count, title) in [
            (1, 10_001, 20_001, 2, None),
            (2, 10_002, 20_003, 3, Some("keeper title")),
            (3, 10_003, 20_002, 4, None),
        ] {
            conn.execute(
                "INSERT INTO clipboard_items (
                    id,
                    content_kind,
                    text,
                    normalized_hash,
                    created_at_unix_ms,
                    last_used_at_unix_ms,
                    last_copied_at_unix_ms,
                    copy_count,
                    title
                ) VALUES (?1, 'text', 'duplicate text', 'same-hash', ?2, ?3, ?4, ?5, ?6)",
                params![
                    id,
                    created_at,
                    created_at + 100,
                    last_copied_at,
                    copy_count,
                    title
                ],
            )
            .expect("duplicate test row should insert before unique migration");
        }

        MIGRATIONS
            .to_latest(&mut conn)
            .expect("consolidation migration should run");

        let storage = AppStorage {
            conn: Arc::new(Mutex::new(conn)),
            db_path: PathBuf::from("test.sqlite3"),
            app_data_dir: std::env::temp_dir(),
        };
        let page = storage
            .list_page(HistoryPageRequest {
                query: String::new(),
                cursor: None,
                limit: Some(10),
            })
            .expect("history should load after consolidation");

        assert_eq!(ids(&page.items), vec![2]);
        assert_eq!(page.items[0].created_at_unix_ms, 10_001);
        assert_eq!(page.items[0].last_copied_at_unix_ms, 20_003);
        assert_eq!(page.items[0].copy_count, 9);
        assert_eq!(page.items[0].title.as_deref(), Some("keeper title"));

        let duplicate_insert = storage
            .conn
            .lock()
            .expect("test sqlite connection lock should work")
            .execute(
                "INSERT INTO clipboard_items (
                    content_kind,
                    text,
                    normalized_hash,
                    created_at_unix_ms,
                    last_used_at_unix_ms,
                    last_copied_at_unix_ms,
                    copy_count
                ) VALUES ('text', 'duplicate text', 'same-hash', 30_000, 30_000, 30_000, 1)",
                [],
            );
        assert!(duplicate_insert.is_err());
    }

    #[test]
    fn migration_normalizes_legacy_clipboard_item_tags() {
        let mut conn = Connection::open_in_memory().expect("in-memory sqlite should open");
        let migrations_before_tags = Migrations::from_slice(&MIGRATIONS_SLICE[..9]);
        migrations_before_tags
            .to_latest(&mut conn)
            .expect("pre-tag migrations should run");
        conn.execute(
            "INSERT INTO clipboard_items (
                id,
                content_kind,
                text,
                normalized_hash,
                created_at_unix_ms,
                last_used_at_unix_ms,
                last_copied_at_unix_ms,
                copy_count,
                tags
            ) VALUES (1, 'text', 'synthetic tagged text', 'hash-1', 10, 10, 10, 1, '#Work backend')",
            [],
        )
        .expect("legacy tagged item should insert");

        MIGRATIONS
            .to_latest(&mut conn)
            .expect("tag migration should run");
        let storage = AppStorage {
            conn: Arc::new(Mutex::new(conn)),
            db_path: PathBuf::from("test.sqlite3"),
            app_data_dir: std::env::temp_dir(),
        };

        let tags = storage.list_tags().expect("tags should list");
        assert_eq!(tags.len(), 2);
        assert!(tags
            .iter()
            .any(|tag| tag.slug == "work" && tag.item_count == 1));
        assert!(tags
            .iter()
            .any(|tag| tag.slug == "backend" && tag.item_count == 1));
    }

    #[test]
    fn set_item_tags_updates_relations_legacy_string_and_search() {
        let storage = test_storage_with_migrations();
        insert_test_text_item(&storage, 1, 40_001, "synthetic backend note");

        storage
            .set_item_tags(SetItemTagsRequest {
                item_id: 1,
                tags: vec!["Backend".to_string(), "#Work".to_string()],
            })
            .expect("item tags should update");

        let tags = storage.list_tags().expect("tags should list");
        assert!(tags
            .iter()
            .any(|tag| tag.slug == "backend" && tag.item_count == 1));
        assert!(tags
            .iter()
            .any(|tag| tag.slug == "work" && tag.item_count == 1));
        assert_eq!(
            storage
                .get_item(1)
                .expect("item should load")
                .tags
                .as_deref(),
            Some("#Backend #Work")
        );

        let page = storage
            .history_search(HistorySearchRequest {
                query: "tag:backend".to_string(),
                cursor: None,
                limit: Some(10),
                plan: None,
                mode: HistorySearchMode::Structured,
                include_content: true,
                include_counts: true,
                explain: false,
                ai_context: None,
            })
            .expect("tag search should load");
        assert_eq!(ids(&page.items), vec![1]);
    }

    #[test]
    fn parse_history_query_extracts_structured_filters() {
        let parsed = parse_history_query(
            r#"tag:ypf "sqlite migration" -kind:image has:notes before:2026-06-03"#,
        );

        assert_eq!(parsed.tags, vec!["ypf"]);
        assert_eq!(parsed.text_terms, vec!["sqlite migration"]);
        assert_eq!(parsed.excluded_kinds, vec!["image"]);
        assert_eq!(parsed.has_filters, vec![HasFilter::Notes]);
        assert_eq!(
            parsed.before_unix_ms,
            Some(days_from_civil(2026, 6, 3).expect("valid date") * MILLIS_PER_DAY)
        );
    }

    #[test]
    fn parse_history_query_extracts_marked_filters() {
        let checked = parse_history_query("is:checked");
        assert_eq!(checked.marked_filters, vec![true]);

        let unchecked = parse_history_query("is:unchecked");
        assert_eq!(unchecked.marked_filters, vec![false]);

        let negated_marked = parse_history_query("-is:marked");
        assert_eq!(negated_marked.marked_filters, vec![false]);

        let selected = parse_history_query("is:selected");
        assert!(selected.marked_filters.is_empty());
        assert_eq!(selected.text_terms, vec!["is:selected"]);
    }

    #[test]
    fn list_page_applies_structured_query_filters() {
        let storage = test_storage_with_migrations();
        insert_test_item(
            &storage,
            TestItem {
                id: 1,
                created_at: 30_001,
                content_kind: "text",
                text: "sqlite migration snippet",
                mime_primary: Some("text/plain"),
                title: Some("DB snippet"),
                notes: None,
                tags: Some("ypf backend"),
            },
        );
        insert_test_item(
            &storage,
            TestItem {
                id: 2,
                created_at: 30_002,
                content_kind: "text",
                text: "sqlite migration snippet",
                mime_primary: Some("text/plain"),
                title: None,
                notes: None,
                tags: Some("personal"),
            },
        );
        insert_test_item(
            &storage,
            TestItem {
                id: 3,
                created_at: 30_003,
                content_kind: "image",
                text: "[image] 400x200 PNG",
                mime_primary: Some("image/png"),
                title: Some("Chrome error"),
                notes: Some("sqlite migration error screenshot"),
                tags: Some("ypf error"),
            },
        );

        let text_page = storage
            .list_page(HistoryPageRequest {
                query: r#"tag:ypf "sqlite migration" -kind:image"#.to_string(),
                cursor: None,
                limit: Some(10),
            })
            .expect("structured text query should load");
        assert_eq!(ids(&text_page.items), vec![1]);

        let image_page = storage
            .list_page(HistoryPageRequest {
                query: "kind:image has:notes tag:ypf mime:image/*".to_string(),
                cursor: None,
                limit: Some(10),
            })
            .expect("structured image query should load");
        assert_eq!(ids(&image_page.items), vec![3]);
    }

    #[test]
    fn list_page_filters_marked_and_unmarked_items() {
        let storage = test_storage_with_migrations();
        insert_test_text_item(&storage, 1, 30_001, "first checked clip");
        insert_test_text_item(&storage, 2, 30_002, "second unchecked clip");
        insert_test_text_item(&storage, 3, 30_003, "third checked clip");

        storage
            .set_items_marked(SetHistoryItemsMarkedRequest {
                ids: vec![1, 3],
                marked: true,
            })
            .expect("test items should be marked");

        let checked_page = storage
            .list_page(HistoryPageRequest {
                query: "is:checked".to_string(),
                cursor: None,
                limit: Some(10),
            })
            .expect("checked query should load");
        assert_eq!(ids(&checked_page.items), vec![3, 1]);

        let unchecked_page = storage
            .list_page(HistoryPageRequest {
                query: "-is:marked".to_string(),
                cursor: None,
                limit: Some(10),
            })
            .expect("unchecked query should load");
        assert_eq!(ids(&unchecked_page.items), vec![2]);
    }

    #[test]
    fn list_page_filters_by_iso_date_bounds() {
        let storage = test_storage_with_migrations();
        let june_first = days_from_civil(2026, 6, 1).expect("valid date") * MILLIS_PER_DAY;
        let june_second = days_from_civil(2026, 6, 2).expect("valid date") * MILLIS_PER_DAY;
        insert_test_text_item(&storage, 1, june_first, "older");
        insert_test_text_item(&storage, 2, june_second, "newer");

        let page = storage
            .list_page(HistoryPageRequest {
                query: "after:2026-06-02".to_string(),
                cursor: None,
                limit: Some(10),
            })
            .expect("date query should load");

        assert_eq!(ids(&page.items), vec![2]);
    }

    #[test]
    fn search_plan_compiler_uses_params_for_text_and_metadata_filters() {
        let plan = SearchPlanV1 {
            schema_version: 1,
            text: Some(SearchPlanTextV1 {
                all: vec!["sqlite".to_string()],
                exclude: vec!["secret".to_string()],
                ..SearchPlanTextV1::default()
            }),
            filters: Some(SearchPlanFiltersV1 {
                kind: vec![SearchPlanKindV1::Text],
                has: vec![SearchPlanHasV1::Metadata],
                marked: Some(true),
                ..SearchPlanFiltersV1::default()
            }),
            sort: vec![SearchPlanSortV1 {
                field: SearchPlanSortFieldV1::Created,
                direction: SearchPlanSortDirectionV1::Asc,
            }],
            limit: Some(250),
        };

        let compiled = compile_search_plan(&plan).expect("plan should compile");

        assert!(compiled.where_sql.contains("content_kind = ?"));
        assert!(compiled.where_sql.contains("is_marked != 0"));
        assert!(compiled.where_sql.contains("title IS NOT NULL"));
        assert!(compiled.params.iter().any(|param| match param {
            Value::Text(value) => value == "%sqlite%",
            _ => false,
        }));
        assert!(!compiled.where_sql.contains("sqlite"));
        assert_eq!(compiled.order_sql, "created_at_unix_ms ASC, id DESC");
        assert_eq!(compiled.limit, Some(MAX_HISTORY_PAGE_LIMIT));
    }

    #[test]
    fn search_plan_compiler_supports_relative_dates() {
        let plan = SearchPlanV1 {
            schema_version: 1,
            filters: Some(SearchPlanFiltersV1 {
                date: vec![SearchPlanDateFilterV1 {
                    field: SearchPlanDateFieldV1::Created,
                    op: SearchPlanDateOpV1::After,
                    value: None,
                    end_value: None,
                    relative: Some(SearchPlanRelativeDateV1 {
                        amount: 3,
                        unit: SearchPlanRelativeUnitV1::Day,
                    }),
                }],
                ..SearchPlanFiltersV1::default()
            }),
            ..SearchPlanV1 {
                schema_version: 1,
                ..SearchPlanV1::default()
            }
        };
        let before = now_unix_ms().saturating_sub(3 * MILLIS_PER_DAY);
        let compiled = compile_search_plan(&plan).expect("relative date plan should compile");
        let after = now_unix_ms().saturating_sub(3 * MILLIS_PER_DAY);

        assert_eq!(compiled.where_sql, "WHERE created_at_unix_ms >= ?");
        let Value::Integer(value) = compiled.params[0] else {
            panic!("relative date should compile to integer param");
        };
        assert!(value >= before && value <= after.saturating_add(1_000));
    }

    #[test]
    #[ignore = "synthetic 50k benchmark for architecture hardening phase 7"]
    fn synthetic_50k_history_search_benchmark() {
        let storage = test_storage_with_migrations();
        let insert_started = Instant::now();
        {
            let mut conn = storage
                .conn
                .lock()
                .expect("test sqlite connection lock should work");
            let tx = conn
                .transaction()
                .expect("benchmark transaction should start");
            {
                let mut statement = tx
                    .prepare(
                        "INSERT INTO clipboard_items (
                            content_kind,
                            text,
                            normalized_hash,
                            created_at_unix_ms,
                            last_used_at_unix_ms,
                            last_copied_at_unix_ms,
                            copy_count
                        ) VALUES ('text', ?1, ?2, ?3, ?3, ?3, 1)",
                    )
                    .expect("benchmark insert statement should prepare");
                for id in 1..=50_000_i64 {
                    let marker = if id % 100 == 0 {
                        "phase7-target-needle"
                    } else {
                        "phase7-common-filler"
                    };
                    let text = format!("synthetic {marker} item {id}");
                    statement
                        .execute(params![text, format!("phase7-hash-{id}"), id])
                        .expect("benchmark item should insert");
                }
            }
            tx.commit().expect("benchmark transaction should commit");
        }
        let insert_ms = insert_started.elapsed().as_millis();

        let recent_started = Instant::now();
        let recent_page = storage
            .history_search(HistorySearchRequest {
                query: String::new(),
                cursor: None,
                limit: Some(60),
                plan: None,
                mode: HistorySearchMode::Structured,
                include_content: false,
                include_counts: false,
                explain: false,
                ai_context: None,
            })
            .expect("recent benchmark query should load");
        let recent_ms = recent_started.elapsed().as_millis();

        let target_started = Instant::now();
        let target_page = storage
            .history_search(HistorySearchRequest {
                query: "phase7-target-needle".to_string(),
                cursor: None,
                limit: Some(60),
                plan: None,
                mode: HistorySearchMode::Structured,
                include_content: false,
                include_counts: false,
                explain: false,
                ai_context: None,
            })
            .expect("target benchmark query should load");
        let target_ms = target_started.elapsed().as_millis();

        let counted_started = Instant::now();
        let counted_page = storage
            .history_search(HistorySearchRequest {
                query: "phase7-target-needle".to_string(),
                cursor: None,
                limit: Some(60),
                plan: None,
                mode: HistorySearchMode::Structured,
                include_content: false,
                include_counts: true,
                explain: false,
                ai_context: None,
            })
            .expect("counted benchmark query should load");
        let counted_ms = counted_started.elapsed().as_millis();

        assert_eq!(recent_page.items.len(), 60);
        assert_eq!(target_page.items.len(), 60);
        assert_eq!(counted_page.filtered_count, Some(500));

        eprintln!(
            "synthetic_50k_history_search_benchmark insert_ms={insert_ms} recent_ms={recent_ms} target_ms={target_ms} counted_target_ms={counted_ms}"
        );
    }

    #[test]
    fn history_search_accepts_search_plan() {
        let storage = test_storage_with_migrations();
        insert_test_item(
            &storage,
            TestItem {
                id: 1,
                created_at: 30_001,
                content_kind: "text",
                text: "sqlite migration snippet",
                mime_primary: Some("text/plain"),
                title: Some("DB snippet"),
                notes: Some("has metadata"),
                tags: Some("backend"),
            },
        );
        insert_test_text_item(&storage, 2, 30_002, "other snippet");
        storage
            .set_items_marked(SetHistoryItemsMarkedRequest {
                ids: vec![1],
                marked: true,
            })
            .expect("test item should be marked");

        let page = storage
            .history_search(HistorySearchRequest {
                query: String::new(),
                cursor: None,
                limit: None,
                plan: Some(SearchPlanV1 {
                    schema_version: 1,
                    text: Some(SearchPlanTextV1 {
                        all: vec!["sqlite".to_string()],
                        ..SearchPlanTextV1::default()
                    }),
                    filters: Some(SearchPlanFiltersV1 {
                        kind: vec![SearchPlanKindV1::Text],
                        has: vec![SearchPlanHasV1::Metadata],
                        marked: Some(true),
                        ..SearchPlanFiltersV1::default()
                    }),
                    sort: Vec::new(),
                    limit: Some(10),
                }),
                mode: HistorySearchMode::Structured,
                include_content: true,
                include_counts: true,
                explain: false,
                ai_context: None,
            })
            .expect("plan search should load");

        assert_eq!(ids(&page.items), vec![1]);
    }

    fn test_storage() -> AppStorage {
        let app_data_dir =
            std::env::temp_dir().join(format!("copicu-storage-test-{}", now_unix_ms()));

        AppStorage {
            conn: Arc::new(Mutex::new(
                Connection::open_in_memory().expect("in-memory sqlite should open"),
            )),
            db_path: app_data_dir.join(DATABASE_FILE_NAME),
            app_data_dir,
        }
    }

    fn test_storage_with_migrations() -> AppStorage {
        let app_data_dir =
            std::env::temp_dir().join(format!("copicu-storage-test-{}", now_unix_ms()));
        let mut conn = Connection::open_in_memory().expect("in-memory sqlite should open");
        MIGRATIONS
            .to_latest(&mut conn)
            .expect("migrations should run");

        AppStorage {
            conn: Arc::new(Mutex::new(conn)),
            db_path: app_data_dir.join(DATABASE_FILE_NAME),
            app_data_dir,
        }
    }

    fn insert_test_text_item(storage: &AppStorage, id: i64, created_at: i64, text: &str) {
        insert_test_item(
            storage,
            TestItem {
                id,
                created_at,
                content_kind: "text",
                text,
                mime_primary: None,
                title: None,
                notes: None,
                tags: None,
            },
        );
    }

    fn insert_test_image_item(
        storage: &AppStorage,
        id: i64,
        created_at: i64,
        blob_path: &str,
        thumbnail_path: &str,
    ) {
        let conn = storage
            .conn
            .lock()
            .expect("test sqlite connection lock should work");
        conn.execute(
            "INSERT INTO clipboard_items (
                id,
                content_kind,
                text,
                normalized_hash,
                created_at_unix_ms,
                last_used_at_unix_ms,
                last_copied_at_unix_ms,
                copy_count,
                mime_primary,
                blob_path,
                thumbnail_path,
                byte_size,
                width,
                height
            ) VALUES (?1, 'image', ?2, ?3, ?4, ?4, ?4, 1, 'image/png', ?5, ?6, ?7, 32, 32)",
            params![
                id,
                "[image] 32x32 PNG synthetic bytes",
                format!("hash-image-{id}"),
                created_at,
                blob_path,
                thumbnail_path,
                24_i64,
            ],
        )
        .expect("test image item should insert");
    }

    struct TestItem<'a> {
        id: i64,
        created_at: i64,
        content_kind: &'a str,
        text: &'a str,
        mime_primary: Option<&'a str>,
        title: Option<&'a str>,
        notes: Option<&'a str>,
        tags: Option<&'a str>,
    }

    fn insert_test_item(storage: &AppStorage, item: TestItem<'_>) {
        let conn = storage
            .conn
            .lock()
            .expect("test sqlite connection lock should work");
        conn.execute(
            "INSERT INTO clipboard_items (
                id,
                content_kind,
                text,
                normalized_hash,
                created_at_unix_ms,
                last_used_at_unix_ms,
                mime_primary,
                title,
                notes,
                tags
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?5, ?6, ?7, ?8, ?9)",
            params![
                item.id,
                item.content_kind,
                item.text,
                format!("hash-{}", item.id),
                item.created_at,
                item.mime_primary,
                item.title,
                item.notes,
                item.tags
            ],
        )
        .expect("test item should insert");
    }

    fn ids(items: &[HistoryItem]) -> Vec<i64> {
        items.iter().map(|item| item.id).collect()
    }
}
