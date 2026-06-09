use base64::{engine::general_purpose::STANDARD as BASE64_STANDARD, Engine as _};
use rusqlite::{params, params_from_iter, types::Value, Connection, OptionalExtension};
use rusqlite_migration::{Migrations, M};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    time::{SystemTime, UNIX_EPOCH},
};

const DATABASE_FILE_NAME: &str = "copicu.sqlite3";
const UNLIMITED_HISTORY_LIMIT: i64 = 0;
const QUERY_LIMIT: i64 = 100;
const DEFAULT_HISTORY_PAGE_LIMIT: i64 = 60;
const MIN_HISTORY_PAGE_LIMIT: i64 = 1;
const MAX_HISTORY_PAGE_LIMIT: i64 = 100;
const MILLIS_PER_DAY: i64 = 86_400_000;
const IMAGE_BLOB_DIR: &str = "blobs/images";
const THUMBNAIL_BLOB_DIR: &str = "blobs/thumbnails";
const APP_SETTINGS_KEY: &str = "app";
const SETTINGS_SCHEMA_VERSION: u32 = 1;
const DEFAULT_AI_ENDPOINT: &str = "https://openrouter.ai/api/v1";
const DEFAULT_AI_MODEL: &str = "openai/gpt-4.1-mini";
const MIN_RETENTION_COUNT: i64 = 100;
const MAX_RETENTION_COUNT: i64 = 100_000;

const MIGRATIONS_SLICE: &[M<'_>] = &[
    M::up(
        r#"
    CREATE TABLE clipboard_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        content_kind TEXT NOT NULL,
        text TEXT NOT NULL,
        normalized_hash TEXT NOT NULL,
        created_at_unix_ms INTEGER NOT NULL,
        last_used_at_unix_ms INTEGER NOT NULL
    );

    CREATE INDEX idx_clipboard_items_created_at
        ON clipboard_items(created_at_unix_ms DESC);

    CREATE INDEX idx_clipboard_items_normalized_hash
        ON clipboard_items(normalized_hash);
    "#,
    ),
    M::up(
        r#"
    ALTER TABLE clipboard_items ADD COLUMN mime_primary TEXT;
    ALTER TABLE clipboard_items ADD COLUMN blob_path TEXT;
    ALTER TABLE clipboard_items ADD COLUMN thumbnail_path TEXT;
    ALTER TABLE clipboard_items ADD COLUMN byte_size INTEGER;
    ALTER TABLE clipboard_items ADD COLUMN width INTEGER;
    ALTER TABLE clipboard_items ADD COLUMN height INTEGER;
    "#,
    ),
    M::up(
        r#"
    ALTER TABLE clipboard_items ADD COLUMN title TEXT;
    ALTER TABLE clipboard_items ADD COLUMN notes TEXT;
    ALTER TABLE clipboard_items ADD COLUMN tags TEXT;
    "#,
    ),
    M::up(
        r#"
    CREATE TABLE app_settings (
        key TEXT PRIMARY KEY,
        value_json TEXT NOT NULL,
        updated_at_unix_ms INTEGER NOT NULL
    );
    "#,
    ),
    M::up(
        r#"
    ALTER TABLE clipboard_items ADD COLUMN last_copied_at_unix_ms INTEGER;
    ALTER TABLE clipboard_items ADD COLUMN copy_count INTEGER NOT NULL DEFAULT 1;

    UPDATE clipboard_items
    SET last_copied_at_unix_ms = created_at_unix_ms
    WHERE last_copied_at_unix_ms IS NULL;

    CREATE INDEX idx_clipboard_items_last_copied_at
        ON clipboard_items(last_copied_at_unix_ms DESC);
    "#,
    ),
    M::up(
        r#"
    UPDATE clipboard_items
    SET
        created_at_unix_ms = (
            SELECT MIN(d.created_at_unix_ms)
            FROM clipboard_items d
            WHERE d.normalized_hash = clipboard_items.normalized_hash
        ),
        last_used_at_unix_ms = (
            SELECT MAX(d.last_used_at_unix_ms)
            FROM clipboard_items d
            WHERE d.normalized_hash = clipboard_items.normalized_hash
        ),
        last_copied_at_unix_ms = (
            SELECT MAX(COALESCE(d.last_copied_at_unix_ms, d.created_at_unix_ms))
            FROM clipboard_items d
            WHERE d.normalized_hash = clipboard_items.normalized_hash
        ),
        copy_count = (
            SELECT SUM(COALESCE(d.copy_count, 1))
            FROM clipboard_items d
            WHERE d.normalized_hash = clipboard_items.normalized_hash
        ),
        title = COALESCE(
            NULLIF(TRIM(title), ''),
            (
                SELECT d.title
                FROM clipboard_items d
                WHERE d.normalized_hash = clipboard_items.normalized_hash
                    AND d.title IS NOT NULL
                    AND TRIM(d.title) != ''
                ORDER BY COALESCE(d.last_copied_at_unix_ms, d.created_at_unix_ms) DESC, d.id DESC
                LIMIT 1
            )
        ),
        notes = COALESCE(
            NULLIF(TRIM(notes), ''),
            (
                SELECT d.notes
                FROM clipboard_items d
                WHERE d.normalized_hash = clipboard_items.normalized_hash
                    AND d.notes IS NOT NULL
                    AND TRIM(d.notes) != ''
                ORDER BY COALESCE(d.last_copied_at_unix_ms, d.created_at_unix_ms) DESC, d.id DESC
                LIMIT 1
            )
        ),
        tags = COALESCE(
            NULLIF(TRIM(tags), ''),
            (
                SELECT d.tags
                FROM clipboard_items d
                WHERE d.normalized_hash = clipboard_items.normalized_hash
                    AND d.tags IS NOT NULL
                    AND TRIM(d.tags) != ''
                ORDER BY COALESCE(d.last_copied_at_unix_ms, d.created_at_unix_ms) DESC, d.id DESC
                LIMIT 1
            )
        )
    WHERE id IN (
        SELECT keeper_id
        FROM (
            SELECT
                id AS keeper_id,
                ROW_NUMBER() OVER (
                    PARTITION BY normalized_hash
                    ORDER BY COALESCE(last_copied_at_unix_ms, created_at_unix_ms) DESC, id DESC
                ) AS rn
            FROM clipboard_items
        )
        WHERE rn = 1
    );

    DELETE FROM clipboard_items
    WHERE id IN (
        SELECT duplicate_id
        FROM (
            SELECT
                id AS duplicate_id,
                ROW_NUMBER() OVER (
                    PARTITION BY normalized_hash
                    ORDER BY COALESCE(last_copied_at_unix_ms, created_at_unix_ms) DESC, id DESC
                ) AS rn
            FROM clipboard_items
        )
        WHERE rn > 1
    );

    DROP INDEX IF EXISTS idx_clipboard_items_normalized_hash;
    CREATE UNIQUE INDEX idx_clipboard_items_normalized_hash
        ON clipboard_items(normalized_hash);
    "#,
    ),
    M::up(
        r#"
    CREATE TABLE action_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        action_id TEXT NOT NULL,
        trigger TEXT NOT NULL,
        status TEXT NOT NULL,
        started_at_unix_ms INTEGER NOT NULL,
        finished_at_unix_ms INTEGER NOT NULL,
        duration_ms INTEGER NOT NULL,
        input_summary_json TEXT NOT NULL,
        error_class TEXT,
        error_message TEXT
    );

    CREATE INDEX idx_action_runs_started_at
        ON action_runs(started_at_unix_ms DESC);

    CREATE INDEX idx_action_runs_action_id
        ON action_runs(action_id, started_at_unix_ms DESC);
    "#,
    ),
    M::up(
        r#"
    CREATE TABLE script_action_registry (
        file_path TEXT PRIMARY KEY,
        action_id TEXT NOT NULL,
        file_name TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        source_hash TEXT NOT NULL,
        definition_json TEXT NOT NULL,
        diagnostic_count INTEGER NOT NULL,
        refreshed_at_unix_ms INTEGER NOT NULL
    );

    CREATE INDEX idx_script_action_registry_action_id
        ON script_action_registry(action_id);

    CREATE TABLE script_action_diagnostics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_path TEXT NOT NULL,
        action_id TEXT NOT NULL,
        severity TEXT NOT NULL,
        message TEXT NOT NULL,
        refreshed_at_unix_ms INTEGER NOT NULL
    );

    CREATE INDEX idx_script_action_diagnostics_file_path
        ON script_action_diagnostics(file_path);
    "#,
    ),
    M::up(
        r#"
    ALTER TABLE clipboard_items ADD COLUMN is_marked INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE clipboard_items ADD COLUMN marked_at_unix_ms INTEGER;

    CREATE INDEX idx_clipboard_items_is_marked
        ON clipboard_items(is_marked, marked_at_unix_ms DESC);
    "#,
    ),
    M::up(
        r##"
    CREATE TABLE tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        slug TEXT NOT NULL UNIQUE,
        label TEXT NOT NULL,
        color TEXT,
        pinned INTEGER NOT NULL DEFAULT 0,
        sort_order INTEGER,
        created_at_unix_ms INTEGER NOT NULL,
        updated_at_unix_ms INTEGER NOT NULL
    );

    CREATE TABLE clipboard_item_tags (
        item_id INTEGER NOT NULL,
        tag_id INTEGER NOT NULL,
        created_at_unix_ms INTEGER NOT NULL,
        source TEXT NOT NULL DEFAULT 'manual',
        confidence REAL,
        PRIMARY KEY (item_id, tag_id),
        FOREIGN KEY (item_id) REFERENCES clipboard_items(id) ON DELETE CASCADE,
        FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
    );

    CREATE INDEX idx_clipboard_item_tags_tag_id
        ON clipboard_item_tags(tag_id, item_id);

    CREATE TABLE tag_configs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tag_id INTEGER NOT NULL UNIQUE,
        hotkey TEXT,
        auto_apply_enabled INTEGER NOT NULL DEFAULT 0,
        created_at_unix_ms INTEGER NOT NULL,
        updated_at_unix_ms INTEGER NOT NULL,
        FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
    );

    CREATE UNIQUE INDEX idx_tag_configs_hotkey
        ON tag_configs(hotkey)
        WHERE hotkey IS NOT NULL AND TRIM(hotkey) != '';

    WITH RECURSIVE
        raw_items(item_id, rest, token) AS (
            SELECT
                id,
                TRIM(REPLACE(REPLACE(COALESCE(tags, ''), ',', ' '), '#', '')) || ' ',
                ''
            FROM clipboard_items
            WHERE tags IS NOT NULL AND TRIM(tags) != ''
            UNION ALL
            SELECT
                item_id,
                LTRIM(SUBSTR(rest, INSTR(rest, ' ') + 1)),
                TRIM(SUBSTR(rest, 1, INSTR(rest, ' ') - 1))
            FROM raw_items
            WHERE rest != ''
        ),
        normalized(item_id, slug, label) AS (
            SELECT DISTINCT
                item_id,
                LOWER(token),
                token
            FROM raw_items
            WHERE token != ''
        )
    INSERT OR IGNORE INTO tags (slug, label, created_at_unix_ms, updated_at_unix_ms)
    SELECT slug, label, 0, 0
    FROM normalized;

    WITH RECURSIVE
        raw_items(item_id, rest, token) AS (
            SELECT
                id,
                TRIM(REPLACE(REPLACE(COALESCE(tags, ''), ',', ' '), '#', '')) || ' ',
                ''
            FROM clipboard_items
            WHERE tags IS NOT NULL AND TRIM(tags) != ''
            UNION ALL
            SELECT
                item_id,
                LTRIM(SUBSTR(rest, INSTR(rest, ' ') + 1)),
                TRIM(SUBSTR(rest, 1, INSTR(rest, ' ') - 1))
            FROM raw_items
            WHERE rest != ''
        ),
        normalized(item_id, slug) AS (
            SELECT DISTINCT item_id, LOWER(token)
            FROM raw_items
            WHERE token != ''
        )
    INSERT OR IGNORE INTO clipboard_item_tags (item_id, tag_id, created_at_unix_ms, source, confidence)
    SELECT normalized.item_id, tags.id, 0, 'manual', NULL
    FROM normalized
    JOIN tags ON tags.slug = normalized.slug;
    "##,
    ),
];
const MIGRATIONS: Migrations<'_> = Migrations::from_slice(MIGRATIONS_SLICE);

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
    pub total_count: i64,
    pub filtered_count: i64,
    pub interpreted_query: Option<String>,
    pub explanation: Option<String>,
    pub warnings: Vec<String>,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SearchPlanV1 {
    pub schema_version: u8,
    #[serde(default)]
    pub text: Option<SearchPlanTextV1>,
    #[serde(default)]
    pub filters: Option<SearchPlanFiltersV1>,
    #[serde(default)]
    pub sort: Vec<SearchPlanSortV1>,
    #[serde(default)]
    pub limit: Option<i64>,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SearchPlanTextV1 {
    #[serde(default)]
    pub all: Vec<String>,
    #[serde(default)]
    pub any: Vec<String>,
    #[serde(default)]
    pub phrases: Vec<String>,
    #[serde(default)]
    pub exclude: Vec<String>,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SearchPlanFiltersV1 {
    #[serde(default)]
    pub kind: Vec<SearchPlanKindV1>,
    #[serde(default)]
    pub not_kind: Vec<SearchPlanKindV1>,
    #[serde(default)]
    pub mime: Vec<String>,
    #[serde(default)]
    pub not_mime: Vec<String>,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub not_tags: Vec<String>,
    #[serde(default)]
    pub has: Vec<SearchPlanHasV1>,
    #[serde(default)]
    pub missing: Vec<SearchPlanMissingV1>,
    #[serde(default)]
    pub marked: Option<bool>,
    #[serde(default)]
    pub date: Vec<SearchPlanDateFilterV1>,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum SearchPlanKindV1 {
    Text,
    Image,
    Html,
    File,
    Unknown,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum SearchPlanHasV1 {
    Text,
    Title,
    Notes,
    Tags,
    Metadata,
    Mime,
    Blob,
    Image,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum SearchPlanMissingV1 {
    Title,
    Notes,
    Tags,
    Metadata,
    Mime,
    Blob,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SearchPlanDateFilterV1 {
    pub field: SearchPlanDateFieldV1,
    pub op: SearchPlanDateOpV1,
    #[serde(default)]
    pub value: Option<String>,
    #[serde(default)]
    pub end_value: Option<String>,
    #[serde(default)]
    pub relative: Option<SearchPlanRelativeDateV1>,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum SearchPlanDateFieldV1 {
    Created,
    LastUsed,
    LastCopied,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum SearchPlanDateOpV1 {
    After,
    Before,
    On,
    Between,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SearchPlanRelativeDateV1 {
    pub amount: i64,
    pub unit: SearchPlanRelativeUnitV1,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum SearchPlanRelativeUnitV1 {
    Minute,
    Hour,
    Day,
    Week,
    Month,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SearchPlanSortV1 {
    pub field: SearchPlanSortFieldV1,
    pub direction: SearchPlanSortDirectionV1,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum SearchPlanSortFieldV1 {
    Created,
    LastUsed,
    LastCopied,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum SearchPlanSortDirectionV1 {
    Asc,
    Desc,
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
                global_shortcut: "Ctrl+Shift+,".to_string(),
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
        let conn = self
            .conn
            .lock()
            .map_err(|_| "sqlite connection mutex poisoned".to_string())?;

        if let Some(existing_id) = bump_existing_capture(&conn, normalized_hash, now)? {
            prune_history_from_conn(&conn)?;
            return Ok(existing_id);
        }

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

        prune_history_from_conn(&conn)?;

        Ok(conn.last_insert_rowid())
    }

    pub fn insert_image(&self, image: &crate::image_capture::CapturedImage) -> Result<i64, String> {
        let image_relative_path = relative_blob_path(IMAGE_BLOB_DIR, &image.normalized_hash);
        let thumbnail_relative_path =
            relative_blob_path(THUMBNAIL_BLOB_DIR, &image.normalized_hash);
        let image_path = self.app_data_dir.join(&image_relative_path);
        let thumbnail_path = self.app_data_dir.join(&thumbnail_relative_path);

        write_blob(&image_path, &image.png_bytes)?;
        write_blob(&thumbnail_path, &image.thumbnail_png_bytes)?;

        let now = now_unix_ms();
        let text = format!(
            "[image] {}x{} PNG {} bytes",
            image.width,
            image.height,
            image.png_bytes.len()
        );
        let conn = self
            .conn
            .lock()
            .map_err(|_| "sqlite connection mutex poisoned".to_string())?;

        if let Some(existing_id) = bump_existing_capture(&conn, &image.normalized_hash, now)? {
            self.prune_history(&conn)?;
            return Ok(existing_id);
        }

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

        self.prune_history(&conn)?;

        Ok(conn.last_insert_rowid())
    }

    pub fn list_recent(&self) -> Result<Vec<HistoryItem>, String> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| "sqlite connection mutex poisoned".to_string())?;
        self.query_items(
            &conn,
            "SELECT id, content_kind, text, normalized_hash, created_at_unix_ms, last_used_at_unix_ms,
                    COALESCE(last_copied_at_unix_ms, created_at_unix_ms), COALESCE(copy_count, 1),
                    mime_primary, blob_path, thumbnail_path, byte_size, width, height,
                    title, notes, tags, is_marked, marked_at_unix_ms
             FROM clipboard_items
             ORDER BY COALESCE(last_copied_at_unix_ms, created_at_unix_ms) DESC, id DESC
             LIMIT ?1",
            params![QUERY_LIMIT],
        )
    }

    pub fn list_page(&self, request: HistoryPageRequest) -> Result<HistoryPage, String> {
        self.history_search(HistorySearchRequest {
            query: request.query,
            cursor: request.cursor,
            limit: request.limit,
            plan: None,
            mode: HistorySearchMode::Structured,
            include_content: true,
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
        let _include_content = request.include_content;
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
        let total_count = count_history_items(&conn, "", &[])?;
        let filtered_count = if where_sql.is_empty() {
            total_count
        } else {
            count_history_items(&conn, &where_sql, &query_params)?
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
            let sql = history_page_sql(&next_where_sql, &compiled.order_sql);
            let mut items = self.query_items(&conn, &sql, params_from_iter(query_params.iter()))?;
            return finish_history_page(
                &mut items,
                effective_limit,
                total_count,
                filtered_count,
                request.explain.then(|| trimmed.to_string()),
                request.explain.then(|| explain_history_query(trimmed)),
                warnings,
            );
        }

        query_params.push(Value::Integer(query_limit));
        let sql = history_page_sql(&where_sql, &compiled.order_sql);
        let mut items = self.query_items(&conn, &sql, params_from_iter(query_params.iter()))?;

        finish_history_page(
            &mut items,
            effective_limit,
            total_count,
            filtered_count,
            request.explain.then(|| trimmed.to_string()),
            request.explain.then(|| explain_history_query(trimmed)),
            warnings,
        )
    }

    pub fn get_item(&self, id: i64) -> Result<HistoryItem, String> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| "sqlite connection mutex poisoned".to_string())?;
        let mut items = self.query_items(
            &conn,
            "SELECT id, content_kind, text, normalized_hash, created_at_unix_ms, last_used_at_unix_ms,
                    COALESCE(last_copied_at_unix_ms, created_at_unix_ms), COALESCE(copy_count, 1),
                    mime_primary, blob_path, thumbnail_path, byte_size, width, height,
                    title, notes, tags, is_marked, marked_at_unix_ms
             FROM clipboard_items
             WHERE id = ?1
             LIMIT 1",
            params![id],
        )?;

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
        let conn = self
            .conn
            .lock()
            .map_err(|_| "sqlite connection mutex poisoned".to_string())?;
        let compiled = compile_search_plan(&search_plan_from_query(trimmed))?;
        let where_sql = compiled.where_sql;
        let mut query_params = compiled.params;
        query_params.push(Value::Integer(QUERY_LIMIT));
        let sql = history_page_sql(&where_sql, &compiled.order_sql);

        self.query_items(&conn, &sql, params_from_iter(query_params.iter()))
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

    fn prune_history(&self, conn: &Connection) -> Result<(), String> {
        prune_history_from_conn(conn)
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
        let mut items = query_items(conn, sql, params)?;
        for item in &mut items {
            item.thumbnail_data_url = self.thumbnail_data_url(item);
        }
        Ok(items)
    }

    fn thumbnail_data_url(&self, item: &HistoryItem) -> Option<String> {
        let relative_path = if item.content_kind == "image" {
            item.blob_path.as_deref()
        } else {
            item.thumbnail_path.as_deref()
        }?;
        let path = self.resolve_relative_blob_path(relative_path).ok()?;
        let bytes = std::fs::read(path).ok()?;
        Some(format!(
            "data:image/png;base64,{}",
            BASE64_STANDARD.encode(bytes)
        ))
    }

    fn resolve_relative_blob_path(&self, relative_path: &str) -> Result<PathBuf, String> {
        let relative = Path::new(relative_path);
        if relative.is_absolute()
            || relative
                .components()
                .any(|component| matches!(component, std::path::Component::ParentDir))
        {
            return Err(format!("invalid blob path: {relative_path}"));
        }

        Ok(self.app_data_dir.join(relative))
    }

    fn remove_item_blobs(&self, item: &HistoryItem) {
        for relative_path in [item.blob_path.as_deref(), item.thumbnail_path.as_deref()]
            .into_iter()
            .flatten()
        {
            if let Ok(path) = self.resolve_relative_blob_path(relative_path) {
                let _ = std::fs::remove_file(path);
            }
        }
    }
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
                normalized_hash: row.get(3)?,
                created_at_unix_ms: row.get(4)?,
                last_used_at_unix_ms: row.get(5)?,
                last_copied_at_unix_ms: row.get(6)?,
                copy_count: row.get(7)?,
                mime_primary: row.get(8)?,
                blob_path: row.get(9)?,
                thumbnail_path: row.get(10)?,
                byte_size: row.get(11)?,
                width: row.get(12)?,
                height: row.get(13)?,
                thumbnail_data_url: None,
                title: row.get(14)?,
                notes: row.get(15)?,
                tags: row.get(16)?,
                is_marked: row.get(17)?,
                marked_at_unix_ms: row.get(18)?,
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

#[derive(Clone, Debug, Default, PartialEq, Eq)]
struct ParsedHistoryQuery {
    text_terms: Vec<String>,
    excluded_text_terms: Vec<String>,
    tags: Vec<String>,
    excluded_tags: Vec<String>,
    kinds: Vec<String>,
    excluded_kinds: Vec<String>,
    mimes: Vec<String>,
    excluded_mimes: Vec<String>,
    has_filters: Vec<HasFilter>,
    missing_filters: Vec<HasFilter>,
    marked_filters: Vec<bool>,
    after_unix_ms: Option<i64>,
    before_unix_ms: Option<i64>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum HasFilter {
    Text,
    Title,
    Notes,
    Tags,
    Metadata,
    Mime,
    Blob,
    Image,
}

fn parse_history_query(query: &str) -> ParsedHistoryQuery {
    let mut parsed = ParsedHistoryQuery::default();
    for token in tokenize_query(query) {
        let (negated, raw_token) = token
            .strip_prefix('-')
            .filter(|value| !value.is_empty())
            .map(|value| (true, value))
            .unwrap_or((false, token.as_str()));

        if let Some(tag) = raw_token.strip_prefix('#') {
            push_tag_filter(&mut parsed, tag, negated);
            continue;
        }

        let Some((key, value)) = raw_token.split_once(':') else {
            push_text_filter(&mut parsed, raw_token, negated);
            continue;
        };

        let key = key.to_ascii_lowercase();
        match key.as_str() {
            "tag" | "tags" => {
                for value in split_filter_values(value) {
                    push_tag_filter(&mut parsed, value, negated);
                }
            }
            "kind" | "type" => {
                for value in split_filter_values(value) {
                    push_kind_filter(&mut parsed, value, negated);
                }
            }
            "is" => {
                for value in split_filter_values(value) {
                    push_is_filter(&mut parsed, value, negated);
                }
            }
            "mime" => {
                for value in split_filter_values(value) {
                    push_mime_filter(&mut parsed, value, negated);
                }
            }
            "has" => {
                for value in split_filter_values(value) {
                    push_has_filter(&mut parsed, value, negated);
                }
            }
            "after" | "since" => {
                if !negated {
                    parsed.after_unix_ms = parse_date_or_relative_ms(value, DateBound::Start);
                } else {
                    push_text_filter(&mut parsed, raw_token, negated);
                }
            }
            "before" | "until" => {
                if !negated {
                    parsed.before_unix_ms = parse_date_or_relative_ms(value, DateBound::Start);
                } else {
                    push_text_filter(&mut parsed, raw_token, negated);
                }
            }
            "on" => {
                if !negated {
                    if let Some(start) = parse_date_or_relative_ms(value, DateBound::Start) {
                        parsed.after_unix_ms = Some(start);
                        parsed.before_unix_ms = Some(start.saturating_add(MILLIS_PER_DAY));
                    }
                } else {
                    push_text_filter(&mut parsed, raw_token, negated);
                }
            }
            _ => push_text_filter(&mut parsed, raw_token, negated),
        }
    }

    parsed
}

fn tokenize_query(query: &str) -> Vec<String> {
    let mut tokens = Vec::new();
    let mut current = String::new();
    let mut in_quote = false;
    let mut escaped = false;

    for ch in query.chars() {
        if escaped {
            current.push(ch);
            escaped = false;
            continue;
        }

        match ch {
            '\\' if in_quote => escaped = true,
            '"' => in_quote = !in_quote,
            ch if ch.is_whitespace() && !in_quote => {
                if !current.is_empty() {
                    tokens.push(std::mem::take(&mut current));
                }
            }
            _ => current.push(ch),
        }
    }

    if !current.is_empty() {
        tokens.push(current);
    }

    tokens
}

fn split_filter_values(value: &str) -> impl Iterator<Item = &str> {
    value
        .split(',')
        .map(str::trim)
        .filter(|value| !value.is_empty())
}

fn push_text_filter(parsed: &mut ParsedHistoryQuery, value: &str, negated: bool) {
    let value = value.trim();
    if value.is_empty() {
        return;
    }

    if negated {
        parsed.excluded_text_terms.push(value.to_string());
    } else {
        parsed.text_terms.push(value.to_string());
    }
}

fn push_tag_filter(parsed: &mut ParsedHistoryQuery, value: &str, negated: bool) {
    let value = value.trim().trim_start_matches('#');
    if value.is_empty() {
        return;
    }

    if negated {
        parsed.excluded_tags.push(value.to_string());
    } else {
        parsed.tags.push(value.to_string());
    }
}

fn push_kind_filter(parsed: &mut ParsedHistoryQuery, value: &str, negated: bool) {
    let value = value.trim().to_ascii_lowercase();
    if value.is_empty() {
        return;
    }

    if negated {
        parsed.excluded_kinds.push(value);
    } else {
        parsed.kinds.push(value);
    }
}

fn push_is_filter(parsed: &mut ParsedHistoryQuery, value: &str, negated: bool) {
    let value = value.trim().to_ascii_lowercase();
    if value.is_empty() {
        return;
    }

    match value.as_str() {
        "marked" | "checked" => {
            parsed.marked_filters.push(!negated);
        }
        "unmarked" | "unchecked" => {
            parsed.marked_filters.push(negated);
        }
        _ => push_text_filter(parsed, &format!("is:{value}"), negated),
    }
}

fn push_mime_filter(parsed: &mut ParsedHistoryQuery, value: &str, negated: bool) {
    let value = value.trim().to_ascii_lowercase();
    if value.is_empty() {
        return;
    }

    if negated {
        parsed.excluded_mimes.push(value);
    } else {
        parsed.mimes.push(value);
    }
}

fn push_has_filter(parsed: &mut ParsedHistoryQuery, value: &str, negated: bool) {
    let Some(filter) = parse_has_filter(value) else {
        push_text_filter(parsed, &format!("has:{value}"), negated);
        return;
    };

    if negated {
        parsed.missing_filters.push(filter);
    } else {
        parsed.has_filters.push(filter);
    }
}

fn parse_has_filter(value: &str) -> Option<HasFilter> {
    match value.trim().to_ascii_lowercase().as_str() {
        "text" => Some(HasFilter::Text),
        "title" => Some(HasFilter::Title),
        "note" | "notes" => Some(HasFilter::Notes),
        "tag" | "tags" => Some(HasFilter::Tags),
        "metadata" | "meta" => Some(HasFilter::Metadata),
        "mime" => Some(HasFilter::Mime),
        "blob" | "file" => Some(HasFilter::Blob),
        "image" => Some(HasFilter::Image),
        _ => None,
    }
}

struct CompiledHistorySearch {
    where_sql: String,
    params: Vec<Value>,
    order_sql: String,
    limit: Option<i64>,
}

fn search_plan_from_query(query: &str) -> SearchPlanV1 {
    parsed_query_to_search_plan(parse_history_query(query))
}

fn parsed_query_to_search_plan(query: ParsedHistoryQuery) -> SearchPlanV1 {
    let mut text = SearchPlanTextV1::default();
    text.all = query.text_terms;
    text.exclude = query.excluded_text_terms;

    let mut filters = SearchPlanFiltersV1::default();
    filters.tags = query.tags;
    filters.not_tags = query.excluded_tags;
    filters.kind = query
        .kinds
        .iter()
        .filter_map(|kind| parse_search_plan_kind(kind))
        .collect();
    filters.not_kind = query
        .excluded_kinds
        .iter()
        .filter_map(|kind| parse_search_plan_kind(kind))
        .collect();
    filters.mime = query.mimes;
    filters.not_mime = query.excluded_mimes;
    filters.has = query.has_filters.iter().copied().map(Into::into).collect();
    filters.missing = query
        .missing_filters
        .iter()
        .filter_map(|filter| SearchPlanMissingV1::try_from(*filter).ok())
        .collect();
    if let Some(marked) = query.marked_filters.last() {
        filters.marked = Some(*marked);
    }
    if let Some(after_unix_ms) = query.after_unix_ms {
        filters.date.push(SearchPlanDateFilterV1 {
            field: SearchPlanDateFieldV1::Created,
            op: SearchPlanDateOpV1::After,
            value: Some(format_unix_ms_ymd(after_unix_ms)),
            end_value: None,
            relative: None,
        });
    }
    if let Some(before_unix_ms) = query.before_unix_ms {
        filters.date.push(SearchPlanDateFilterV1 {
            field: SearchPlanDateFieldV1::Created,
            op: SearchPlanDateOpV1::Before,
            value: Some(format_unix_ms_ymd(before_unix_ms)),
            end_value: None,
            relative: None,
        });
    }

    SearchPlanV1 {
        schema_version: 1,
        text: Some(text).filter(|text| {
            !text.all.is_empty()
                || !text.any.is_empty()
                || !text.phrases.is_empty()
                || !text.exclude.is_empty()
        }),
        filters: Some(filters).filter(|filters| !filters.is_empty()),
        sort: Vec::new(),
        limit: None,
    }
}

impl SearchPlanFiltersV1 {
    fn is_empty(&self) -> bool {
        self.kind.is_empty()
            && self.not_kind.is_empty()
            && self.mime.is_empty()
            && self.not_mime.is_empty()
            && self.tags.is_empty()
            && self.not_tags.is_empty()
            && self.has.is_empty()
            && self.missing.is_empty()
            && self.marked.is_none()
            && self.date.is_empty()
    }
}

fn compile_search_plan(plan: &SearchPlanV1) -> Result<CompiledHistorySearch, String> {
    if plan.schema_version != 1 {
        return Err(format!(
            "unsupported search plan schema version: {}",
            plan.schema_version
        ));
    }

    let mut clauses = Vec::new();
    let mut params = Vec::new();

    if let Some(text) = &plan.text {
        for term in clean_values(&text.all) {
            push_text_like_clause(&mut clauses, &mut params, term, false);
        }
        if !text.any.is_empty() {
            let mut any_clauses = Vec::new();
            let mut any_params = Vec::new();
            for term in clean_values(&text.any) {
                push_text_like_clause(&mut any_clauses, &mut any_params, term, false);
            }
            if !any_clauses.is_empty() {
                clauses.push(format!("({})", any_clauses.join(" OR ")));
                params.extend(any_params);
            }
        }
        for phrase in clean_values(&text.phrases) {
            push_text_like_clause(&mut clauses, &mut params, phrase, false);
        }
        for term in clean_values(&text.exclude) {
            push_text_like_clause(&mut clauses, &mut params, term, true);
        }
    }

    if let Some(filters) = &plan.filters {
        for tag in clean_values(&filters.tags) {
            push_tag_clause(&mut clauses, &mut params, tag, false);
        }
        for tag in clean_values(&filters.not_tags) {
            push_tag_clause(&mut clauses, &mut params, tag, true);
        }
        for kind in &filters.kind {
            clauses.push("content_kind = ?".to_string());
            params.push(Value::Text(search_plan_kind_value(*kind).to_string()));
        }
        for kind in &filters.not_kind {
            clauses.push("content_kind != ?".to_string());
            params.push(Value::Text(search_plan_kind_value(*kind).to_string()));
        }
        for mime in clean_values(&filters.mime) {
            push_mime_clause(&mut clauses, &mut params, mime, false);
        }
        for mime in clean_values(&filters.not_mime) {
            push_mime_clause(&mut clauses, &mut params, mime, true);
        }
        for filter in &filters.has {
            clauses.push(has_filter_sql((*filter).into(), false));
        }
        for filter in &filters.missing {
            clauses.push(has_filter_sql((*filter).into(), true));
        }
        if let Some(marked) = filters.marked {
            clauses.push(if marked {
                "is_marked != 0".to_string()
            } else {
                "is_marked = 0".to_string()
            });
        }
        for date_filter in &filters.date {
            compile_date_filter(date_filter, &mut clauses, &mut params)?;
        }
    }

    let where_sql = if clauses.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", clauses.join(" AND "))
    };

    Ok(CompiledHistorySearch {
        where_sql,
        params,
        order_sql: compile_order_sql(&plan.sort),
        limit: plan
            .limit
            .map(|limit| limit.clamp(MIN_HISTORY_PAGE_LIMIT, MAX_HISTORY_PAGE_LIMIT)),
    })
}

fn history_page_sql(where_sql: &str, order_sql: &str) -> String {
    format!(
        "SELECT id, content_kind, text, normalized_hash, created_at_unix_ms, last_used_at_unix_ms,
                COALESCE(last_copied_at_unix_ms, created_at_unix_ms), COALESCE(copy_count, 1),
                mime_primary, blob_path, thumbnail_path, byte_size, width, height,
                title, notes, tags, is_marked, marked_at_unix_ms
         FROM clipboard_items
         {where_sql}
         ORDER BY {order_sql}
         LIMIT ?"
    )
}

fn history_where_clause(query: &ParsedHistoryQuery) -> (String, Vec<Value>) {
    let mut clauses = Vec::new();
    let mut params = Vec::new();

    for term in &query.text_terms {
        push_text_like_clause(&mut clauses, &mut params, term, false);
    }
    for term in &query.excluded_text_terms {
        push_text_like_clause(&mut clauses, &mut params, term, true);
    }
    for tag in &query.tags {
        push_tag_clause(&mut clauses, &mut params, tag, false);
    }
    for tag in &query.excluded_tags {
        push_tag_clause(&mut clauses, &mut params, tag, true);
    }
    for kind in &query.kinds {
        clauses.push("content_kind = ?".to_string());
        params.push(Value::Text(kind.clone()));
    }
    for kind in &query.excluded_kinds {
        clauses.push("content_kind != ?".to_string());
        params.push(Value::Text(kind.clone()));
    }
    for mime in &query.mimes {
        push_mime_clause(&mut clauses, &mut params, mime, false);
    }
    for mime in &query.excluded_mimes {
        push_mime_clause(&mut clauses, &mut params, mime, true);
    }
    for filter in &query.has_filters {
        clauses.push(has_filter_sql(*filter, false));
    }
    for filter in &query.missing_filters {
        clauses.push(has_filter_sql(*filter, true));
    }
    for marked in &query.marked_filters {
        if *marked {
            clauses.push("is_marked != 0".to_string());
        } else {
            clauses.push("is_marked = 0".to_string());
        }
    }
    if let Some(after_unix_ms) = query.after_unix_ms {
        clauses.push("created_at_unix_ms >= ?".to_string());
        params.push(Value::Integer(after_unix_ms));
    }
    if let Some(before_unix_ms) = query.before_unix_ms {
        clauses.push("created_at_unix_ms < ?".to_string());
        params.push(Value::Integer(before_unix_ms));
    }

    let where_sql = if clauses.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", clauses.join(" AND "))
    };

    (where_sql, params)
}

fn clean_values(values: &[String]) -> impl Iterator<Item = &str> {
    values
        .iter()
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
}

fn compile_order_sql(sort: &[SearchPlanSortV1]) -> String {
    if sort.is_empty() {
        return "COALESCE(last_copied_at_unix_ms, created_at_unix_ms) DESC, id DESC".to_string();
    }

    let mut parts = sort
        .iter()
        .take(3)
        .map(|sort| {
            format!(
                "{} {}",
                sort_field_sql(sort.field),
                sort_direction_sql(sort.direction)
            )
        })
        .collect::<Vec<_>>();
    parts.push("id DESC".to_string());
    parts.join(", ")
}

fn sort_field_sql(field: SearchPlanSortFieldV1) -> &'static str {
    match field {
        SearchPlanSortFieldV1::Created => "created_at_unix_ms",
        SearchPlanSortFieldV1::LastUsed => "last_used_at_unix_ms",
        SearchPlanSortFieldV1::LastCopied => "COALESCE(last_copied_at_unix_ms, created_at_unix_ms)",
    }
}

fn sort_direction_sql(direction: SearchPlanSortDirectionV1) -> &'static str {
    match direction {
        SearchPlanSortDirectionV1::Asc => "ASC",
        SearchPlanSortDirectionV1::Desc => "DESC",
    }
}

fn compile_date_filter(
    filter: &SearchPlanDateFilterV1,
    clauses: &mut Vec<String>,
    params: &mut Vec<Value>,
) -> Result<(), String> {
    let field = date_field_sql(filter.field);
    match filter.op {
        SearchPlanDateOpV1::After => {
            let value = resolve_plan_date_ms(filter, false)?
                .ok_or_else(|| "date filter `after` requires value or relative".to_string())?;
            clauses.push(format!("{field} >= ?"));
            params.push(Value::Integer(value));
        }
        SearchPlanDateOpV1::Before => {
            let value = resolve_plan_date_ms(filter, false)?
                .ok_or_else(|| "date filter `before` requires value or relative".to_string())?;
            clauses.push(format!("{field} < ?"));
            params.push(Value::Integer(value));
        }
        SearchPlanDateOpV1::On => {
            let start = resolve_plan_date_ms(filter, false)?
                .ok_or_else(|| "date filter `on` requires value or relative".to_string())?;
            clauses.push(format!("{field} >= ?"));
            params.push(Value::Integer(start));
            clauses.push(format!("{field} < ?"));
            params.push(Value::Integer(start.saturating_add(MILLIS_PER_DAY)));
        }
        SearchPlanDateOpV1::Between => {
            let start = resolve_plan_date_ms(filter, false)?
                .ok_or_else(|| "date filter `between` requires value or relative".to_string())?;
            let end = resolve_plan_end_date_ms(filter)?
                .ok_or_else(|| "date filter `between` requires endValue".to_string())?;
            clauses.push(format!("{field} >= ?"));
            params.push(Value::Integer(start));
            clauses.push(format!("{field} < ?"));
            params.push(Value::Integer(end));
        }
    }
    Ok(())
}

fn date_field_sql(field: SearchPlanDateFieldV1) -> &'static str {
    match field {
        SearchPlanDateFieldV1::Created => "created_at_unix_ms",
        SearchPlanDateFieldV1::LastUsed => "last_used_at_unix_ms",
        SearchPlanDateFieldV1::LastCopied => "COALESCE(last_copied_at_unix_ms, created_at_unix_ms)",
    }
}

fn resolve_plan_date_ms(
    filter: &SearchPlanDateFilterV1,
    day_start: bool,
) -> Result<Option<i64>, String> {
    if let Some(relative) = &filter.relative {
        return resolve_relative_date_ms(relative).map(Some);
    }
    filter
        .value
        .as_deref()
        .map(|value| parse_plan_date_ms(value, day_start))
        .transpose()
}

fn resolve_plan_end_date_ms(filter: &SearchPlanDateFilterV1) -> Result<Option<i64>, String> {
    filter
        .end_value
        .as_deref()
        .map(|value| parse_plan_date_ms(value, false))
        .transpose()
}

fn parse_plan_date_ms(value: &str, _day_start: bool) -> Result<i64, String> {
    parse_date_or_relative_ms(value, DateBound::Start)
        .or_else(|| parse_iso_datetime_unix_ms(value))
        .ok_or_else(|| format!("invalid search plan date: {value}"))
}

fn resolve_relative_date_ms(relative: &SearchPlanRelativeDateV1) -> Result<i64, String> {
    if !(1..=10_000).contains(&relative.amount) {
        return Err("relative date amount must be between 1 and 10000".to_string());
    }
    let unit_ms = match relative.unit {
        SearchPlanRelativeUnitV1::Minute => 60_000,
        SearchPlanRelativeUnitV1::Hour => 3_600_000,
        SearchPlanRelativeUnitV1::Day => MILLIS_PER_DAY,
        SearchPlanRelativeUnitV1::Week => MILLIS_PER_DAY * 7,
        SearchPlanRelativeUnitV1::Month => MILLIS_PER_DAY * 30,
    };
    Ok(now_unix_ms().saturating_sub(relative.amount.saturating_mul(unit_ms)))
}

fn parse_search_plan_kind(value: &str) -> Option<SearchPlanKindV1> {
    match value.trim().to_ascii_lowercase().as_str() {
        "text" => Some(SearchPlanKindV1::Text),
        "image" => Some(SearchPlanKindV1::Image),
        "html" => Some(SearchPlanKindV1::Html),
        "file" | "file-list" => Some(SearchPlanKindV1::File),
        "unknown" => Some(SearchPlanKindV1::Unknown),
        _ => None,
    }
}

fn search_plan_kind_value(kind: SearchPlanKindV1) -> &'static str {
    match kind {
        SearchPlanKindV1::Text => "text",
        SearchPlanKindV1::Image => "image",
        SearchPlanKindV1::Html => "html",
        SearchPlanKindV1::File => "file",
        SearchPlanKindV1::Unknown => "unknown",
    }
}

impl From<HasFilter> for SearchPlanHasV1 {
    fn from(value: HasFilter) -> Self {
        match value {
            HasFilter::Text => Self::Text,
            HasFilter::Title => Self::Title,
            HasFilter::Notes => Self::Notes,
            HasFilter::Tags => Self::Tags,
            HasFilter::Metadata => Self::Metadata,
            HasFilter::Mime => Self::Mime,
            HasFilter::Blob => Self::Blob,
            HasFilter::Image => Self::Image,
        }
    }
}

impl From<SearchPlanHasV1> for HasFilter {
    fn from(value: SearchPlanHasV1) -> Self {
        match value {
            SearchPlanHasV1::Text => Self::Text,
            SearchPlanHasV1::Title => Self::Title,
            SearchPlanHasV1::Notes => Self::Notes,
            SearchPlanHasV1::Tags => Self::Tags,
            SearchPlanHasV1::Metadata => Self::Metadata,
            SearchPlanHasV1::Mime => Self::Mime,
            SearchPlanHasV1::Blob => Self::Blob,
            SearchPlanHasV1::Image => Self::Image,
        }
    }
}

impl TryFrom<HasFilter> for SearchPlanMissingV1 {
    type Error = ();

    fn try_from(value: HasFilter) -> Result<Self, Self::Error> {
        match value {
            HasFilter::Title => Ok(Self::Title),
            HasFilter::Notes => Ok(Self::Notes),
            HasFilter::Tags => Ok(Self::Tags),
            HasFilter::Metadata => Ok(Self::Metadata),
            HasFilter::Mime => Ok(Self::Mime),
            HasFilter::Blob => Ok(Self::Blob),
            HasFilter::Text | HasFilter::Image => Err(()),
        }
    }
}

impl From<SearchPlanMissingV1> for HasFilter {
    fn from(value: SearchPlanMissingV1) -> Self {
        match value {
            SearchPlanMissingV1::Title => Self::Title,
            SearchPlanMissingV1::Notes => Self::Notes,
            SearchPlanMissingV1::Tags => Self::Tags,
            SearchPlanMissingV1::Metadata => Self::Metadata,
            SearchPlanMissingV1::Mime => Self::Mime,
            SearchPlanMissingV1::Blob => Self::Blob,
        }
    }
}

fn push_text_like_clause(
    clauses: &mut Vec<String>,
    params: &mut Vec<Value>,
    term: &str,
    negated: bool,
) {
    let fields = [
        "COALESCE(text, '')",
        "COALESCE(title, '')",
        "COALESCE(notes, '')",
        "COALESCE(tags, '')",
        "COALESCE(mime_primary, '')",
        "content_kind",
    ];
    let joined = fields
        .iter()
        .map(|field| format!("{field} LIKE ? ESCAPE '\\'"))
        .collect::<Vec<_>>()
        .join(" OR ");
    let clause = if negated {
        format!("NOT ({joined})")
    } else {
        format!("({joined})")
    };
    let pattern = like_contains_pattern(term);

    clauses.push(clause);
    for _ in fields {
        params.push(Value::Text(pattern.clone()));
    }
}

fn push_tag_clause(clauses: &mut Vec<String>, params: &mut Vec<Value>, value: &str, negated: bool) {
    let (slug, _) = normalize_tag_label(value).unwrap_or_else(|_| {
        (
            value.trim().trim_start_matches('#').to_ascii_lowercase(),
            value.to_string(),
        )
    });
    let clause = "(
        EXISTS (
            SELECT 1
            FROM clipboard_item_tags
            JOIN tags normalized_tags ON normalized_tags.id = clipboard_item_tags.tag_id
            WHERE clipboard_item_tags.item_id = clipboard_items.id
                AND normalized_tags.slug LIKE ? ESCAPE '\\'
        )
        OR COALESCE(clipboard_items.tags, '') LIKE ? ESCAPE '\\'
    )";
    if negated {
        clauses.push(format!("NOT {clause}"));
    } else {
        clauses.push(clause.to_string());
    }
    params.push(Value::Text(like_contains_pattern(&slug)));
    params.push(Value::Text(like_contains_pattern(value)));
}

fn push_mime_clause(clauses: &mut Vec<String>, params: &mut Vec<Value>, mime: &str, negated: bool) {
    let wildcard = mime.ends_with("/*");
    let pattern = if wildcard {
        format!("{}%", escape_like(mime.trim_end_matches('*')))
    } else {
        escape_like(mime)
    };
    let operator = if negated { "NOT LIKE" } else { "LIKE" };

    clauses.push(format!(
        "COALESCE(mime_primary, '') {operator} ? ESCAPE '\\'"
    ));
    params.push(Value::Text(pattern));
}

fn has_filter_sql(filter: HasFilter, missing: bool) -> String {
    let present = match filter {
        HasFilter::Text => "TRIM(text) != ''",
        HasFilter::Title => "title IS NOT NULL AND TRIM(title) != ''",
        HasFilter::Notes => "notes IS NOT NULL AND TRIM(notes) != ''",
        HasFilter::Tags => {
            "EXISTS (
                SELECT 1
                FROM clipboard_item_tags
                WHERE clipboard_item_tags.item_id = clipboard_items.id
             )
             OR (tags IS NOT NULL AND TRIM(tags) != '')"
        }
        HasFilter::Metadata => {
            "(title IS NOT NULL AND TRIM(title) != '')
             OR (notes IS NOT NULL AND TRIM(notes) != '')
             OR EXISTS (
                SELECT 1
                FROM clipboard_item_tags
                WHERE clipboard_item_tags.item_id = clipboard_items.id
             )
             OR (tags IS NOT NULL AND TRIM(tags) != '')"
        }
        HasFilter::Mime => "mime_primary IS NOT NULL AND TRIM(mime_primary) != ''",
        HasFilter::Blob => "blob_path IS NOT NULL AND TRIM(blob_path) != ''",
        HasFilter::Image => "content_kind = 'image'",
    };

    if missing {
        format!("NOT ({present})")
    } else {
        format!("({present})")
    }
}

fn like_contains_pattern(value: &str) -> String {
    format!("%{}%", escape_like(value))
}

fn finish_history_page(
    items: &mut Vec<HistoryItem>,
    limit: i64,
    total_count: i64,
    filtered_count: i64,
    interpreted_query: Option<String>,
    explanation: Option<String>,
    warnings: Vec<String>,
) -> Result<HistoryPage, String> {
    let next_cursor = if items.len() as i64 > limit {
        items.truncate(limit as usize);
        items.last().map(|item| HistoryPageCursor {
            after_sort_unix_ms: item.last_copied_at_unix_ms,
            after_id: item.id,
        })
    } else {
        None
    };

    Ok(HistoryPage {
        items: std::mem::take(items),
        next_cursor,
        total_count,
        filtered_count,
        interpreted_query,
        explanation,
        warnings,
    })
}

fn explain_history_query(query: &str) -> String {
    if query.trim().is_empty() {
        "All history, ordered by most recently copied or captured.".to_string()
    } else {
        format!("Structured local history search for `{}`.", query.trim())
    }
}

#[derive(Clone, Copy)]
enum DateBound {
    Start,
}

fn parse_date_or_relative_ms(value: &str, _bound: DateBound) -> Option<i64> {
    let value = value.trim().to_ascii_lowercase();
    if value.is_empty() {
        return None;
    }

    let now_ms = now_unix_ms();
    match value.as_str() {
        "today" => return Some(day_start_unix_ms(now_ms)),
        "yesterday" => return Some(day_start_unix_ms(now_ms).saturating_sub(MILLIS_PER_DAY)),
        _ => {}
    }

    if let Some(days) = value
        .strip_suffix('d')
        .and_then(|days| days.parse::<i64>().ok())
    {
        return Some(now_ms.saturating_sub(days.saturating_mul(MILLIS_PER_DAY)));
    }

    parse_ymd_start_unix_ms(&value)
}

fn parse_iso_datetime_unix_ms(value: &str) -> Option<i64> {
    let value = value.trim();
    let (date, time) = value.split_once('T')?;
    let date_ms = parse_ymd_start_unix_ms(date)?;
    let time = time.trim_end_matches('Z');
    let time = time
        .split_once(['+', '-'])
        .map(|(time, _)| time)
        .unwrap_or(time);
    let mut parts = time.split(':');
    let hour = parts.next()?.parse::<i64>().ok()?;
    let minute = parts.next().unwrap_or("0").parse::<i64>().ok()?;
    let second_part = parts.next().unwrap_or("0");
    let second = second_part
        .split_once('.')
        .map(|(second, _)| second)
        .unwrap_or(second_part)
        .parse::<i64>()
        .ok()?;
    if !(0..=23).contains(&hour) || !(0..=59).contains(&minute) || !(0..=59).contains(&second) {
        return None;
    }
    Some(date_ms + hour * 3_600_000 + minute * 60_000 + second * 1_000)
}

fn format_unix_ms_ymd(unix_ms: i64) -> String {
    let days = unix_ms.div_euclid(MILLIS_PER_DAY);
    let (year, month, day) = civil_from_days(days);
    format!("{year:04}-{month:02}-{day:02}")
}

fn day_start_unix_ms(unix_ms: i64) -> i64 {
    unix_ms.div_euclid(MILLIS_PER_DAY) * MILLIS_PER_DAY
}

fn parse_ymd_start_unix_ms(value: &str) -> Option<i64> {
    let mut parts = value.split('-');
    let year = parts.next()?.parse::<i64>().ok()?;
    let month = parts.next()?.parse::<i64>().ok()?;
    let day = parts.next()?.parse::<i64>().ok()?;
    if parts.next().is_some() || !(1..=12).contains(&month) || !(1..=31).contains(&day) {
        return None;
    }

    Some(days_from_civil(year, month, day)? * MILLIS_PER_DAY)
}

fn days_from_civil(year: i64, month: i64, day: i64) -> Option<i64> {
    let month_lengths = [
        31,
        28 + i64::from(is_leap_year(year)),
        31,
        30,
        31,
        30,
        31,
        31,
        30,
        31,
        30,
        31,
    ];
    let month_index = usize::try_from(month - 1).ok()?;
    if day < 1 || day > month_lengths[month_index] {
        return None;
    }

    let adjusted_year = year - i64::from(month <= 2);
    let era = adjusted_year.div_euclid(400);
    let year_of_era = adjusted_year - era * 400;
    let adjusted_month = month + if month > 2 { -3 } else { 9 };
    let day_of_year = (153 * adjusted_month + 2) / 5 + day - 1;
    let day_of_era = year_of_era * 365 + year_of_era / 4 - year_of_era / 100 + day_of_year;

    Some(era * 146_097 + day_of_era - 719_468)
}

fn civil_from_days(days_since_unix_epoch: i64) -> (i64, i64, i64) {
    let days = days_since_unix_epoch + 719_468;
    let era = days.div_euclid(146_097);
    let day_of_era = days - era * 146_097;
    let year_of_era =
        (day_of_era - day_of_era / 1_460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
    let mut year = year_of_era + era * 400;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let month_prime = (5 * day_of_year + 2) / 153;
    let day = day_of_year - (153 * month_prime + 2) / 5 + 1;
    let month = month_prime + if month_prime < 10 { 3 } else { -9 };
    year += i64::from(month <= 2);
    (year, month, day)
}

fn is_leap_year(year: i64) -> bool {
    (year % 4 == 0 && year % 100 != 0) || year % 400 == 0
}

fn relative_blob_path(kind_dir: &str, hash: &str) -> PathBuf {
    Path::new(kind_dir).join(format!("{hash}.png"))
}

fn path_to_db_string(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

fn write_blob(path: &Path, bytes: &[u8]) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|error| format!("failed to create blob dir {}: {error}", parent.display()))?;
    }

    std::fs::write(path, bytes)
        .map_err(|error| format!("failed to write blob {}: {error}", path.display()))
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

fn prune_history_from_conn(conn: &Connection) -> Result<(), String> {
    let limit = retention_limit_from_conn(conn);
    if limit == UNLIMITED_HISTORY_LIMIT {
        return Ok(());
    }

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

    Ok(())
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
        assert_eq!(first_page.total_count, 5);
        assert_eq!(first_page.filtered_count, 5);
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
        assert_eq!(second_page.total_count, 5);
        assert_eq!(second_page.filtered_count, 5);
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
        assert_eq!(first_page.total_count, 5);
        assert_eq!(first_page.filtered_count, 4);

        let second_page = storage
            .list_page(HistoryPageRequest {
                query: "needle".to_string(),
                cursor: first_page.next_cursor,
                limit: Some(2),
            })
            .expect("second search page should load");
        assert_eq!(ids(&second_page.items), vec![2, 1]);
        assert_eq!(second_page.next_cursor, None);
        assert_eq!(second_page.total_count, 5);
        assert_eq!(second_page.filtered_count, 4);
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
        assert_eq!(page.total_count, 2);
        assert_eq!(page.items[0].created_at_unix_ms, 10_001);
        assert!(page.items[0].last_copied_at_unix_ms >= page.items[1].last_copied_at_unix_ms);
        assert_eq!(page.items[0].copy_count, 2);
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
