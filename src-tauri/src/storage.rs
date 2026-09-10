use base64::{engine::general_purpose::STANDARD as BASE64_STANDARD, Engine as _};
use rusqlite::functions::FunctionFlags;
use rusqlite::{
    params, params_from_iter,
    types::{Type, Value, ValueRef},
    Connection, Error as SqliteError, OpenFlags, OptionalExtension,
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, BTreeSet, HashMap},
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc, Mutex,
    },
    time::{Duration, SystemTime, UNIX_EPOCH},
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
    compile_search_evidence, compile_search_plan, explain_history_query, finish_history_page,
    history_item_select_columns, history_page_sql, search_plan_from_query,
    search_plan_has_positive_evidence, search_query_explanation, SearchMatch,
};
#[cfg(test)]
use self::search::{days_from_civil, parse_history_query, HasFilter};
pub use self::search::{
    SearchPlanDateFieldV1, SearchPlanDateFilterV1, SearchPlanDateOpV1, SearchPlanFiltersV1,
    SearchPlanHasV1, SearchPlanKindV1, SearchPlanMissingV1, SearchPlanRelativeDateV1,
    SearchPlanRelativeUnitV1, SearchPlanSortDirectionV1, SearchPlanSortFieldV1, SearchPlanSortV1,
    SearchPlanTextScopeV1, SearchPlanTextV1, SearchPlanV1,
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
const DEFAULT_PASTE_NEXT_SHORTCUT: &str = "Ctrl+Alt+F11";
const MIN_RETENTION_COUNT: i64 = 100;
const MAX_RETENTION_COUNT: i64 = 100_000;
const MAX_METADATA_SELECTION_ITEMS: usize = 100;
const METADATA_CAPTURE_EVENT_LIMIT: i64 = 12;
pub const METADATA_SNAPSHOT_STALE: &str = "METADATA_SNAPSHOT_STALE";

type BoxError = Box<dyn std::error::Error + Send + Sync + 'static>;

fn add_regexp_function(conn: &Connection) -> Result<(), String> {
    conn.create_scalar_function(
        "legacy_tag_matches",
        2,
        FunctionFlags::SQLITE_UTF8 | FunctionFlags::SQLITE_DETERMINISTIC,
        |ctx| {
            let legacy = ctx.get::<String>(0)?;
            let slug = ctx.get::<String>(1)?;
            Ok(legacy_tags_to_values(Some(&legacy)).iter().any(|value| {
                normalize_tag_label(value).is_ok_and(|(candidate, _)| {
                    candidate == slug
                        || candidate
                            .strip_prefix(&slug)
                            .is_some_and(|tail| tail.starts_with('/'))
                })
            }))
        },
    )
    .map_err(|error| format!("failed to register SQLite legacy tag matcher: {error}"))?;
    conn.create_scalar_function(
        "regexp",
        2,
        FunctionFlags::SQLITE_UTF8 | FunctionFlags::SQLITE_DETERMINISTIC,
        |ctx| {
            let regexp: Arc<regex::Regex> =
                ctx.get_or_create_aux(0, |value| -> Result<_, BoxError> {
                    Ok(regex::RegexBuilder::new(value.as_str()?)
                        .case_insensitive(true)
                        .build()?)
                })?;
            let text = ctx
                .get_raw(1)
                .as_str()
                .map_err(|error| SqliteError::UserFunctionError(error.into()))?;
            Ok(regexp.is_match(text))
        },
    )
    .map_err(|error| format!("failed to register SQLite regexp function: {error}"))
}
#[cfg(test)]
struct FindScanGate {
    reached: std::sync::Barrier,
    release: std::sync::Barrier,
}

#[derive(Clone)]
pub struct AppStorage {
    conn: Arc<Mutex<Connection>>,
    db_path: PathBuf,
    app_data_dir: PathBuf,
    mutation_epoch: Arc<AtomicU64>,
    #[cfg(test)]
    find_scan_gate: Arc<Mutex<Option<Arc<FindScanGate>>>>,
}

/// The small, non-sensitive row projection consumed by the ephemeral Find worker.
/// Keeping this separate from `HistoryItem` prevents the session index from retaining
/// blobs, MIME data, hashes or other technical fields that Find never renders.
#[derive(Clone, Debug)]
pub(crate) struct FindSourceItem {
    pub id: i64,
    pub content_kind: String,
    pub text: String,
    pub title: Option<String>,
    pub notes: Option<String>,
    pub tags: Option<String>,
    pub tag_labels: Vec<String>,
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
    is_inbox: bool,
    inbox_at_unix_ms: Option<i64>,
    #[serde(default)]
    search_matches: Vec<SearchMatch>,
}

impl HistoryItem {
    pub fn id(&self) -> i64 {
        self.id
    }

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

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ItemPreviewPayload {
    pub item_id: i64,
    pub content_kind: String,
    pub text: String,
    pub mime_primary: Option<String>,
    pub thumbnail_data_url: Option<String>,
    pub width: Option<i64>,
    pub height: Option<i64>,
    pub title: Option<String>,
}

impl From<HistoryItem> for ItemPreviewPayload {
    fn from(item: HistoryItem) -> Self {
        Self {
            item_id: item.id,
            content_kind: item.content_kind,
            text: item.text,
            mime_primary: item.mime_primary,
            thumbnail_data_url: item.thumbnail_data_url,
            width: item.width,
            height: item.height,
            title: item.title,
        }
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
pub struct UpdateItemMetadataRequest {
    pub id: i64,
    pub title: Option<String>,
    pub notes: Option<String>,
    pub tags: Vec<String>,
    #[serde(default)]
    pub properties: ScenarioProperties,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateHistoryItemRequest {
    pub text: String,
    pub title: Option<String>,
    pub notes: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub properties: ScenarioProperties,
    pub mime_primary: Option<String>,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CreateHistoryItemResult {
    pub id: i64,
    pub created: bool,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CaptureContext {
    pub source_kind: String,
    pub source_app_name: Option<String>,
    pub source_app_path: Option<String>,
    pub source_process_id: Option<i64>,
    pub source_window_id: Option<i64>,
    pub source_window_title: Option<String>,
    pub clipboard_platform: Option<String>,
    pub clipboard_sequence_number: Option<i64>,
    pub clipboard_format_count: Option<i64>,
    #[serde(default)]
    pub clipboard_formats: Vec<CaptureFormatContext>,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CaptureContextEvent {
    pub id: i64,
    pub captured_at_unix_ms: i64,
    pub source_kind: String,
    pub source_app_name: Option<String>,
    pub source_app_path: Option<String>,
    pub source_process_id: Option<i64>,
    pub source_window_id: Option<i64>,
    pub source_window_title: Option<String>,
    pub content_kind: String,
    pub mime_primary: Option<String>,
    pub clipboard_platform: Option<String>,
    pub clipboard_sequence_number: Option<i64>,
    pub clipboard_format_count: Option<i64>,
    pub clipboard_formats_text: Option<String>,
    pub byte_size: Option<i64>,
    pub text_char_count: Option<i64>,
    pub line_count: Option<i64>,
    pub domain: Option<String>,
    pub scenario_id: Option<i64>,
    pub scenario_session_id: Option<String>,
    pub scenario_revision: Option<i64>,
}

#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MetadataTagEntry {
    pub value: String,
    pub source: String,
    pub confidence: Option<f64>,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MetadataPropertyEntry {
    pub key: String,
    pub value: String,
    pub source: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MetadataSelectionRequest {
    pub item_ids: Vec<i64>,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum MetadataPresence {
    All,
    Some,
    None,
}

#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MetadataSourceCount {
    pub source: String,
    pub count: usize,
    pub confidence_min: Option<f64>,
    pub confidence_max: Option<f64>,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ScalarAggregateState {
    Same,
    Mixed,
    Empty,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ScalarAggregate {
    pub state: ScalarAggregateState,
    pub value: Option<String>,
    pub populated_count: usize,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MetadataTagConfig {
    pub tag_id: i64,
    pub color: Option<String>,
    pub pinned: bool,
}

#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SetValueAggregate {
    pub key: String,
    pub label: String,
    pub presence: MetadataPresence,
    pub present_count: usize,
    pub total_count: usize,
    pub sources: Vec<MetadataSourceCount>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tag_config: Option<MetadataTagConfig>,
}

#[derive(Clone, Debug, Default, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MetadataPropertyAggregates {
    pub client: Vec<SetValueAggregate>,
    pub project: Vec<SetValueAggregate>,
    pub activity: Vec<SetValueAggregate>,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MetadataSingleItem {
    pub content_preview: String,
    pub content_kind: String,
    pub capture_context_events: Vec<CaptureContextEvent>,
}

#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MetadataSelectionSnapshot {
    pub item_ids: Vec<i64>,
    pub item_count: usize,
    pub snapshot_token: String,
    pub title: ScalarAggregate,
    pub notes: ScalarAggregate,
    pub tags: Vec<SetValueAggregate>,
    pub properties: MetadataPropertyAggregates,
    pub single_item: Option<MetadataSingleItem>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(tag = "op", rename_all = "camelCase")]
pub enum ScalarIntent {
    Untouched,
    Set { value: String },
    Clear,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(tag = "op", rename_all = "camelCase")]
pub enum NotesIntent {
    Untouched,
    ReplaceAll { value: String },
    AppendToEach { value: String },
    ClearAll,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetValueIntent {
    pub key: String,
    pub op: SetValueIntentOp,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum SetValueIntentOp {
    Untouched,
    Add,
    Remove,
}

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MetadataPropertyIntents {
    #[serde(default)]
    pub client: Vec<SetValueIntent>,
    #[serde(default)]
    pub project: Vec<SetValueIntent>,
    #[serde(default)]
    pub activity: Vec<SetValueIntent>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MetadataSelectionIntent {
    pub item_ids: Vec<i64>,
    pub expected_snapshot_token: String,
    pub title: ScalarIntent,
    pub notes: NotesIntent,
    #[serde(default)]
    pub tags: Vec<SetValueIntent>,
    #[serde(default)]
    pub properties: MetadataPropertyIntents,
}

#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MetadataSelectionApplyResult {
    pub snapshot: MetadataSelectionSnapshot,
    pub changed_item_count: usize,
    pub title_changed_count: usize,
    pub notes_changed_count: usize,
    pub tag_relation_changes: usize,
    pub property_relation_changes: usize,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CaptureFormatContext {
    pub id: u32,
    pub name: String,
    pub kind: String,
    pub handle_size_bytes: Option<i64>,
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
    #[serde(default, alias = "descriptor")]
    pub applied_descriptor: Option<AppliedSearchDescriptor>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct HistoryPageCursor {
    after_sort_unix_ms: i64,
    after_id: i64,
    after_is_inbox: bool,
    after_inbox_at_unix_ms: Option<i64>,
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

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum AppliedSearchMode {
    Structured,
    Ai,
}

impl From<HistorySearchMode> for AppliedSearchMode {
    fn from(value: HistorySearchMode) -> Self {
        match value {
            HistorySearchMode::Ai => Self::Ai,
            HistorySearchMode::Plain | HistorySearchMode::Structured => Self::Structured,
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AppliedSearchDescriptor {
    pub schema_version: u8,
    pub display_query: String,
    pub effective_query: String,
    pub mode: AppliedSearchMode,
    pub plan: SearchPlanV1,
    pub fingerprint: String,
}

impl AppliedSearchDescriptor {
    pub const SCHEMA_VERSION: u8 = 1;

    pub fn for_query(
        display_query: impl Into<String>,
        effective_query: impl Into<String>,
        mode: AppliedSearchMode,
    ) -> Result<Self, String> {
        let effective_query = effective_query.into();
        let plan = search_plan_from_query(effective_query.trim());
        Self::new(display_query, effective_query, mode, plan)
    }

    pub fn new(
        display_query: impl Into<String>,
        effective_query: impl Into<String>,
        mode: AppliedSearchMode,
        plan: SearchPlanV1,
    ) -> Result<Self, String> {
        compile_search_plan(&plan)?;
        let descriptor = Self {
            schema_version: Self::SCHEMA_VERSION,
            display_query: display_query.into(),
            effective_query: effective_query.into(),
            mode,
            plan,
            fingerprint: String::new(),
        };
        Ok(Self {
            fingerprint: descriptor.fingerprint_for_plan()?,
            ..descriptor
        })
    }

    pub fn validate(&self) -> Result<(), String> {
        if self.schema_version != Self::SCHEMA_VERSION {
            return Err(format!(
                "unsupported applied search descriptor schema version: {}",
                self.schema_version
            ));
        }
        compile_search_plan(&self.plan)?;
        let expected = self.fingerprint_for_plan()?;
        if self.fingerprint != expected {
            return Err(
                "applied search descriptor fingerprint does not match its plan".to_string(),
            );
        }
        Ok(())
    }

    fn fingerprint_for_plan(&self) -> Result<String, String> {
        let basis = serde_json::json!({
            "schemaVersion": self.schema_version,
            "mode": self.mode,
            "plan": self.plan,
        });
        let encoded = serde_json::to_vec(&basis)
            .map_err(|error| format!("serialize applied search descriptor fingerprint: {error}"))?;
        let digest = Sha256::digest(encoded);
        Ok(digest.iter().map(|byte| format!("{byte:02x}")).collect())
    }
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistorySearchRequest {
    pub query: String,
    #[serde(default)]
    pub display_query: Option<String>,
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
    #[serde(default, alias = "descriptor")]
    pub applied_descriptor: Option<AppliedSearchDescriptor>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistorySearchChip {
    pub label: String,
    pub query_without_clause: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistorySearchDiagnostic {
    pub severity: String,
    pub code: String,
    pub message: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistorySearchExplanation {
    pub version: u8,
    pub chips: Vec<HistorySearchChip>,
    pub diagnostics: Vec<HistorySearchDiagnostic>,
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
    pub query_explanation: Option<HistorySearchExplanation>,
    pub warnings: Vec<String>,
    pub applied_descriptor: Option<AppliedSearchDescriptor>,
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

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ApplyItemTagsMode {
    Replace,
    Patch,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ApplyItemTagsRequest {
    pub item_ids: Vec<i64>,
    pub tags: Vec<String>,
    #[serde(default)]
    pub remove_tags: Vec<String>,
    pub mode: ApplyItemTagsMode,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SavedHistoryView {
    pub id: i64,
    pub title: String,
    pub query: String,
    pub open_mode: String,
    pub hotkey: Option<String>,
    pub pinned: bool,
    pub sort_order: Option<i64>,
    pub capture_tags: Vec<String>,
    pub created_at_unix_ms: i64,
    pub updated_at_unix_ms: i64,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateSavedHistoryViewRequest {
    pub title: String,
    pub query: String,
    #[serde(default)]
    pub hotkey: Option<String>,
    #[serde(default)]
    pub capture_tags: Vec<String>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateSavedHistoryViewRequest {
    pub id: i64,
    pub title: String,
    pub query: String,
    #[serde(default)]
    pub hotkey: Option<String>,
    pub pinned: bool,
    #[serde(default)]
    pub sort_order: Option<i64>,
    #[serde(default)]
    pub capture_tags: Vec<String>,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ScenarioProperties {
    #[serde(default)]
    pub client: Vec<String>,
    #[serde(default)]
    pub project: Vec<String>,
    #[serde(default)]
    pub activity: Vec<String>,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Scenario {
    pub id: i64,
    pub name: String,
    pub query: String,
    pub revision: i64,
    pub properties: ScenarioProperties,
    pub tags: Vec<String>,
    pub created_at_unix_ms: i64,
    pub updated_at_unix_ms: i64,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateScenarioRequest {
    pub name: String,
    pub query: String,
    #[serde(default)]
    pub properties: ScenarioProperties,
    #[serde(default)]
    pub tags: Vec<String>,
}

pub type CreateScenarioFromQueryRequest = CreateScenarioRequest;

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateScenarioRequest {
    pub id: i64,
    pub name: String,
    pub query: String,
    #[serde(default)]
    pub properties: ScenarioProperties,
    #[serde(default)]
    pub tags: Vec<String>,
}

pub type UpdateScenarioFromQueryRequest = UpdateScenarioRequest;

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ActiveScenarioSession {
    pub session_id: String,
    pub scenario_id: i64,
    pub scenario_name: String,
    pub scenario_revision: i64,
    pub query: String,
    pub properties: ScenarioProperties,
    pub tags: Vec<String>,
    pub started_at_unix_ms: i64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum HistoryMovePosition {
    Top,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum HistoryNeighborDirection {
    Older,
    Newer,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub schema_version: u32,
    pub general: GeneralSettings,
    #[serde(default)]
    pub auto_update: AutoUpdateSettings,
    pub picker: PickerSettings,
    pub history: HistorySettings,
    pub appearance: AppearanceSettings,
    #[serde(default)]
    pub editor: EditorSettings,
    #[serde(default)]
    pub tray: TraySettings,
    #[serde(default)]
    pub scripts: ScriptsSettings,
    #[serde(default)]
    pub enrichment: crate::enrichment::EnrichmentSettings,
    #[serde(default)]
    pub ai: AiSettings,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GeneralSettings {
    pub global_shortcut: String,
    #[serde(default = "default_inbox_shortcut")]
    pub inbox_shortcut: String,
    #[serde(default = "default_paste_next_shortcut")]
    pub paste_next_shortcut: String,
    #[serde(default)]
    pub launch_on_startup: bool,
    #[serde(default = "default_capture_enabled")]
    pub capture_enabled: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AutoUpdateSettings {
    #[serde(default = "default_auto_update_enabled")]
    pub enabled: bool,
    #[serde(default = "default_auto_update_check_interval_minutes")]
    pub check_interval_minutes: i64,
}

impl Default for AutoUpdateSettings {
    fn default() -> Self {
        Self {
            enabled: default_auto_update_enabled(),
            check_interval_minutes: default_auto_update_check_interval_minutes(),
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PickerSettings {
    pub hide_on_focus_lost: bool,
    pub enter_action: EnterAction,
    #[serde(default = "default_promote_active_on_copy")]
    pub promote_active_on_copy: bool,
    #[serde(default)]
    pub search_trigger_mode: SearchTriggerMode,
    #[serde(default)]
    pub defer_structured_search_until_enter: bool,
    #[serde(default = "default_search_scopes")]
    pub default_search_scopes: Vec<SearchDefaultScope>,
    #[serde(default = "default_excluded_search_scopes")]
    pub default_excluded_search_scopes: Vec<SearchPlanTextScopeV1>,
    #[serde(default = "default_pin_toggle_shortcut")]
    pub pin_toggle_shortcut: String,
    #[serde(default = "default_settings_shortcut")]
    pub settings_shortcut: String,
    #[serde(default = "default_preview_shortcut")]
    pub preview_shortcut: String,
    #[serde(default)]
    pub external_editor_shortcut: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum EnterAction {
    Copy,
    Paste,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum SearchTriggerMode {
    #[default]
    Realtime,
    Enter,
    Manual,
}

#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum SearchDefaultScope {
    #[default]
    All,
    Content,
    Metadata,
    Title,
    Notes,
    Tags,
    Context,
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
pub struct EditorSettings {
    pub font_family: EditorFontFamily,
    pub font_size: u8,
    pub line_height: EditorLineHeight,
    pub wrap_lines: bool,
    pub tab_size: u8,
    pub line_numbers: bool,
    pub highlight_active_line: bool,
    #[serde(default)]
    pub external_editor_path: String,
}

impl Default for EditorSettings {
    fn default() -> Self {
        Self {
            font_family: EditorFontFamily::SystemMono,
            font_size: 13,
            line_height: EditorLineHeight::Comfortable,
            wrap_lines: true,
            tab_size: 4,
            line_numbers: true,
            highlight_active_line: true,
            external_editor_path: String::new(),
        }
    }
}

#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum EditorFontFamily {
    #[default]
    SystemMono,
    CascadiaMono,
    Consolas,
    UiSans,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum EditorLineHeight {
    Compact,
    #[default]
    Comfortable,
    Relaxed,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
#[derive(Default)]
pub struct TraySettings {
    #[serde(default)]
    pub vscode_path: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ScriptsSettings {
    pub folder_path: String,
    #[serde(default)]
    pub vscode_path: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiSettings {
    pub enabled: bool,
    pub endpoint: String,
    pub model: String,
    #[serde(default)]
    pub api_key: String,
}

impl Default for AiSettings {
    fn default() -> Self {
        Self {
            enabled: false,
            endpoint: DEFAULT_AI_ENDPOINT.to_string(),
            model: DEFAULT_AI_MODEL.to_string(),
            api_key: String::new(),
        }
    }
}

impl Default for ScriptsSettings {
    fn default() -> Self {
        Self {
            folder_path: default_scripts_folder_path(),
            vscode_path: String::new(),
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
                inbox_shortcut: default_inbox_shortcut(),
                paste_next_shortcut: default_paste_next_shortcut(),
                launch_on_startup: false,
                capture_enabled: default_capture_enabled(),
            },
            auto_update: AutoUpdateSettings::default(),
            picker: PickerSettings {
                hide_on_focus_lost: true,
                enter_action: EnterAction::Copy,
                promote_active_on_copy: default_promote_active_on_copy(),
                search_trigger_mode: SearchTriggerMode::Realtime,
                defer_structured_search_until_enter: false,
                default_search_scopes: default_search_scopes(),
                default_excluded_search_scopes: default_excluded_search_scopes(),
                pin_toggle_shortcut: default_pin_toggle_shortcut(),
                settings_shortcut: default_settings_shortcut(),
                preview_shortcut: default_preview_shortcut(),
                external_editor_shortcut: String::new(),
            },
            history: HistorySettings {
                retention_count: UNLIMITED_HISTORY_LIMIT,
            },
            appearance: AppearanceSettings {
                theme: ThemeSetting::System,
                theme_id: ThemeId::Default,
            },
            editor: EditorSettings::default(),
            tray: TraySettings::default(),
            scripts: ScriptsSettings::default(),
            enrichment: crate::enrichment::EnrichmentSettings::default(),
            ai: AiSettings::default(),
        }
    }
}

fn default_capture_enabled() -> bool {
    true
}

fn default_auto_update_enabled() -> bool {
    true
}

fn default_auto_update_check_interval_minutes() -> i64 {
    60
}

fn default_promote_active_on_copy() -> bool {
    true
}
fn default_excluded_search_scopes() -> Vec<SearchPlanTextScopeV1> {
    Vec::new()
}

fn default_search_scopes() -> Vec<SearchDefaultScope> {
    vec![SearchDefaultScope::All]
}

fn default_pin_toggle_shortcut() -> String {
    "F8".to_string()
}

fn default_settings_shortcut() -> String {
    "Ctrl+,".to_string()
}

fn default_preview_shortcut() -> String {
    "Alt+Enter".to_string()
}

fn default_global_shortcut() -> String {
    std::env::var_os("COPICU_GLOBAL_SHORTCUT")
        .map(PathBuf::from)
        .filter(|value| !value.as_os_str().is_empty())
        .map(|value| value.to_string_lossy().into_owned())
        .unwrap_or_else(|| DEFAULT_GLOBAL_SHORTCUT.to_string())
}
fn default_inbox_shortcut() -> String {
    "Ctrl+Alt+I".to_string()
}

fn default_paste_next_shortcut() -> String {
    DEFAULT_PASTE_NEXT_SHORTCUT.to_string()
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
        add_regexp_function(&conn)?;

        Ok(Self {
            conn: Arc::new(Mutex::new(conn)),
            db_path,
            app_data_dir: app_data_dir.to_path_buf(),
            mutation_epoch: Arc::new(AtomicU64::new(0)),
            #[cfg(test)]
            find_scan_gate: Arc::new(Mutex::new(None)),
        })
    }

    pub fn db_path(&self) -> &Path {
        &self.db_path
    }

    pub(crate) fn mutation_epoch(&self) -> Arc<AtomicU64> {
        self.mutation_epoch.clone()
    }

    fn bump_mutation_epoch(&self) {
        self.mutation_epoch.fetch_add(1, Ordering::SeqCst);
    }

    #[cfg(test)]
    fn install_find_before_first_row_gate(&self, gate: Arc<FindScanGate>) {
        *self
            .find_scan_gate
            .lock()
            .expect("Find scan gate lock should work") = Some(gate);
    }

    #[cfg(test)]
    fn wait_for_find_before_first_row_gate(&self) {
        let gate = self
            .find_scan_gate
            .lock()
            .expect("Find scan gate lock should work")
            .take();
        if let Some(gate) = gate {
            gate.reached.wait();
            gate.release.wait();
        }
    }

    /// Read the applied Search snapshot through a dedicated read-only WAL connection.
    ///
    /// This deliberately does not touch `self.conn`: the operational connection is
    /// guarded by a mutex and is used by capture/write paths. Find can therefore scan
    /// a stable result set without retaining that mutex or a transaction after this
    /// method returns.
    #[allow(dead_code)]
    pub(crate) fn read_find_items(
        &self,
        descriptor: &AppliedSearchDescriptor,
    ) -> Result<Vec<FindSourceItem>, String> {
        let cancelled = Arc::new(AtomicBool::new(false));
        let epoch = self.mutation_epoch.load(Ordering::SeqCst);
        self.read_find_items_cancelable(descriptor, cancelled, self.mutation_epoch.clone(), epoch)
    }

    pub(crate) fn read_find_items_cancelable(
        &self,
        descriptor: &AppliedSearchDescriptor,
        cancelled: Arc<AtomicBool>,
        mutation_epoch: Arc<AtomicU64>,
        expected_epoch: u64,
    ) -> Result<Vec<FindSourceItem>, String> {
        descriptor.validate()?;
        let conn = Connection::open_with_flags(&self.db_path, OpenFlags::SQLITE_OPEN_READ_ONLY)
            .map_err(|error| format!("failed to open Find read-only sqlite connection: {error}"))?;
        conn.busy_timeout(Duration::from_millis(250))
            .map_err(|error| format!("failed to configure Find sqlite busy timeout: {error}"))?;

        let compiled = compile_search_plan(&descriptor.plan)?;
        let limit = compiled.limit;
        let mut sql = format!(
            "SELECT id, content_kind, text, title, notes, tags
                    , (SELECT GROUP_CONCAT(label, char(31))
                       FROM (
                           SELECT tags.label AS label
                           FROM clipboard_item_tags
                           JOIN tags ON tags.id = clipboard_item_tags.tag_id
                           WHERE clipboard_item_tags.item_id = clipboard_items.id
                           ORDER BY tags.label COLLATE NOCASE ASC, tags.id ASC
                       )) AS relation_tags
             FROM clipboard_items
             {}
             ORDER BY {}",
            compiled.where_sql, compiled.order_sql
        );
        if limit.is_some() {
            sql.push_str(" LIMIT ?");
        }

        // Find's None limit is intentionally a complete snapshot: the shared
        // history page default must not silently truncate global navigation.
        let interrupt_handle = conn.get_interrupt_handle();
        let interrupt_watcher = conn.get_interrupt_handle();
        let transaction = conn
            .unchecked_transaction()
            .map_err(|error| format!("failed to start Find sqlite snapshot: {error}"))?;
        let mut statement = transaction
            .prepare(&sql)
            .map_err(|error| format!("failed to prepare Find snapshot query: {error}"))?;
        let mut query_params = compiled.params;
        if let Some(limit) = limit {
            query_params.push(Value::Integer(limit));
        }
        if cancelled.load(Ordering::SeqCst)
            || mutation_epoch.load(Ordering::SeqCst) != expected_epoch
        {
            interrupt_handle.interrupt();
        }
        let stop_watcher = Arc::new(AtomicBool::new(false));
        let stop_watcher_thread = stop_watcher.clone();
        let cancelled_watcher = cancelled.clone();
        let mutation_epoch_watcher = mutation_epoch.clone();
        let watcher = std::thread::spawn(move || {
            while !stop_watcher_thread.load(Ordering::SeqCst) {
                if cancelled_watcher.load(Ordering::SeqCst)
                    || mutation_epoch_watcher.load(Ordering::SeqCst) != expected_epoch
                {
                    interrupt_watcher.interrupt();
                    break;
                }
                std::thread::sleep(Duration::from_millis(1));
            }
        });
        let scan_result = (|| {
            let mut rows = statement
                .query(params_from_iter(query_params.iter()))
                .map_err(|error| format!("failed to query Find snapshot: {error}"))?;

            #[cfg(test)]
            self.wait_for_find_before_first_row_gate();

            let mut items = Vec::new();
            let mut row_index = 0usize;
            while let Some(row) = rows
                .next()
                .map_err(|error| format!("failed to read Find snapshot row: {error}"))?
            {
                if row_index % 32 == 0 {
                    if cancelled.load(Ordering::SeqCst) {
                        return Err("find start superseded".to_string());
                    }
                    if mutation_epoch.load(Ordering::SeqCst) != expected_epoch {
                        return Err("find session invalidated".to_string());
                    }
                }
                let relation_tags = row
                    .get::<_, Option<String>>(6)
                    .map_err(|error| format!("failed to decode Find relation tags: {error}"))?;
                let tag_labels = relation_tags
                    .as_deref()
                    .map(|value| value.split('\u{1f}').map(str::to_string).collect())
                    .unwrap_or_default();
                items.push(FindSourceItem {
                    id: row
                        .get(0)
                        .map_err(|error| format!("failed to decode Find item id: {error}"))?,
                    content_kind: row
                        .get(1)
                        .map_err(|error| format!("failed to decode Find content kind: {error}"))?,
                    text: row
                        .get(2)
                        .map_err(|error| format!("failed to decode Find text: {error}"))?,
                    title: row
                        .get(3)
                        .map_err(|error| format!("failed to decode Find title: {error}"))?,
                    notes: row
                        .get(4)
                        .map_err(|error| format!("failed to decode Find notes: {error}"))?,
                    tags: row
                        .get(5)
                        .map_err(|error| format!("failed to decode Find tags: {error}"))?,
                    tag_labels,
                });
                row_index += 1;
            }
            Ok(items)
        })();

        stop_watcher.store(true, Ordering::SeqCst);
        let _ = watcher.join();
        if cancelled.load(Ordering::SeqCst) {
            return Err("find start superseded".to_string());
        }
        if mutation_epoch.load(Ordering::SeqCst) != expected_epoch {
            return Err("find session invalidated".to_string());
        }
        let items = scan_result?;
        drop(statement);
        transaction
            .commit()
            .map_err(|error| format!("failed to close Find sqlite snapshot: {error}"))?;
        Ok(items)
    }

    pub(crate) fn read_find_item(&self, item_id: i64) -> Result<Option<FindSourceItem>, String> {
        let conn = Connection::open_with_flags(&self.db_path, OpenFlags::SQLITE_OPEN_READ_ONLY)
            .map_err(|error| format!("failed to open Find target sqlite connection: {error}"))?;
        conn.busy_timeout(Duration::from_millis(250))
            .map_err(|error| {
                format!("failed to configure Find target sqlite busy timeout: {error}")
            })?;
        conn.query_row(
            "SELECT id, content_kind, text, title, notes, tags,
                    (SELECT GROUP_CONCAT(label, char(31))
                     FROM (
                         SELECT tags.label AS label
                         FROM clipboard_item_tags
                         JOIN tags ON tags.id = clipboard_item_tags.tag_id
                         WHERE clipboard_item_tags.item_id = clipboard_items.id
                         ORDER BY tags.label COLLATE NOCASE ASC, tags.id ASC
                     )) AS relation_tags
             FROM clipboard_items
             WHERE id = ?1",
            params![item_id],
            |row| {
                let relation_tags = row.get::<_, Option<String>>(6)?;
                let tag_labels = relation_tags
                    .as_deref()
                    .map(|value| value.split('\u{1f}').map(str::to_string).collect())
                    .unwrap_or_default();
                Ok(FindSourceItem {
                    id: row.get(0)?,
                    content_kind: row.get(1)?,
                    text: row.get(2)?,
                    title: row.get(3)?,
                    notes: row.get(4)?,
                    tags: row.get(5)?,
                    tag_labels,
                })
            },
        )
        .optional()
        .map_err(|error| format!("failed to read Find target item: {error}"))
    }

    #[cfg(test)]
    pub(crate) fn insert_find_benchmark_items(&self, count: i64) -> Result<(), String> {
        let mut conn = self
            .conn
            .lock()
            .map_err(|_| "sqlite connection mutex poisoned".to_string())?;
        let tx = conn
            .transaction()
            .map_err(|error| format!("failed to start Find benchmark insert: {error}"))?;
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
            .map_err(|error| format!("failed to prepare Find benchmark insert: {error}"))?;
        for id in 1..=count {
            let text = format!("invoice body with a stable token {id}");
            statement
                .execute(params![text, format!("find-benchmark-hash-{id}"), id])
                .map_err(|error| format!("failed to insert Find benchmark item: {error}"))?;
        }
        drop(statement);
        tx.commit()
            .map_err(|error| format!("failed to commit Find benchmark insert: {error}"))
    }

    pub fn insert_text(&self, text: &str, normalized_hash: &str) -> Result<i64, String> {
        self.insert_text_with_context(text, normalized_hash, None, &[])
    }

    pub fn insert_text_with_context(
        &self,
        text: &str,
        normalized_hash: &str,
        capture_context: Option<CaptureContext>,
        capture_tags: &[String],
    ) -> Result<i64, String> {
        self.insert_text_with_scenario(text, normalized_hash, capture_context, capture_tags, None)
    }

    pub fn insert_text_with_scenario(
        &self,
        text: &str,
        normalized_hash: &str,
        capture_context: Option<CaptureContext>,
        capture_tags: &[String],
        active_scenario: Option<ActiveScenarioSession>,
    ) -> Result<i64, String> {
        let normalized_capture_tags = normalize_tag_values(capture_tags)?;
        let now = now_unix_ms();
        let text_char_count = text.chars().count() as i64;
        let line_count = text.lines().count().max(1) as i64;
        let domain = first_url_domain(text);
        let (item_id, prune_outcome, projection_changed) = {
            let mut conn = self
                .conn
                .lock()
                .map_err(|_| "sqlite connection mutex poisoned".to_string())?;
            let tx = conn
                .transaction()
                .map_err(|error| format!("failed to start clipboard text capture: {error}"))?;

            let existing_id = bump_existing_capture(&tx, normalized_hash, now)?;
            let before_projection = existing_id
                .map(|id| item_projection_signature(&tx, id))
                .transpose()?;
            let item_id = if let Some(existing_id) = existing_id {
                existing_id
            } else {
                tx.execute(
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

                tx.last_insert_rowid()
            };

            for (slug, label) in &normalized_capture_tags {
                add_item_tag_relation(&tx, item_id, slug, label, "context", None)?;
            }
            sync_legacy_tags_for_item(&tx, item_id)?;
            if let Some(scenario) = active_scenario.as_ref() {
                apply_scenario_patch(&tx, item_id, scenario)?;
            }
            let context_pruned = record_capture_event(
                &tx,
                item_id,
                now,
                "text",
                Some("text/plain"),
                None,
                Some(text_char_count),
                Some(line_count),
                domain.as_deref(),
                capture_context.as_ref(),
                active_scenario.as_ref(),
            )?;
            let after_projection = existing_id
                .map(|id| item_projection_signature(&tx, id))
                .transpose()?;
            let projection_changed = context_pruned || before_projection != after_projection;
            let prune_outcome = prune_history_from_conn(&tx)?;
            tx.commit()
                .map_err(|error| format!("failed to commit clipboard text capture: {error}"))?;
            (item_id, prune_outcome, projection_changed)
        };

        if projection_changed || prune_outcome.removed_items > 0 {
            self.bump_mutation_epoch();
        }
        self.remove_blob_paths(prune_outcome.blob_paths);
        Ok(item_id)
    }

    pub fn list_capture_context_events(
        &self,
        item_id: i64,
        limit: i64,
    ) -> Result<Vec<CaptureContextEvent>, String> {
        let limit = limit.clamp(1, 50);
        let conn = self
            .conn
            .lock()
            .map_err(|_| "sqlite connection mutex poisoned".to_string())?;
        let mut statement = conn
            .prepare(
                "SELECT
                    id,
                    captured_at_unix_ms,
                    source_kind,
                    source_app_name,
                    source_app_path,
                    source_process_id,
                    source_window_id,
                    source_window_title,
                    content_kind,
                    mime_primary,
                    clipboard_platform,
                    clipboard_sequence_number,
                    clipboard_format_count,
                    clipboard_formats_text,
                    byte_size,
                    text_char_count,
                    line_count,
                    domain,
                    scenario_id,
                    scenario_session_id,
                    scenario_revision
                 FROM clipboard_item_capture_events
                 WHERE item_id = ?1
                 ORDER BY captured_at_unix_ms DESC, id DESC
                 LIMIT ?2",
            )
            .map_err(|error| format!("failed to prepare capture context query: {error}"))?;
        let rows = statement
            .query_map(params![item_id, limit], |row| {
                Ok(CaptureContextEvent {
                    id: row.get(0)?,
                    captured_at_unix_ms: row.get(1)?,
                    source_kind: row.get(2)?,
                    source_app_name: row.get(3)?,
                    source_app_path: row.get(4)?,
                    source_process_id: row.get(5)?,
                    source_window_id: row.get(6)?,
                    source_window_title: row.get(7)?,
                    content_kind: row.get(8)?,
                    mime_primary: row.get(9)?,
                    clipboard_platform: row.get(10)?,
                    clipboard_sequence_number: row.get(11)?,
                    clipboard_format_count: row.get(12)?,
                    clipboard_formats_text: row.get(13)?,
                    byte_size: row.get(14)?,
                    text_char_count: row.get(15)?,
                    line_count: row.get(16)?,
                    domain: row.get(17)?,
                    scenario_id: row.get(18)?,
                    scenario_session_id: row.get(19)?,
                    scenario_revision: row.get(20)?,
                })
            })
            .map_err(|error| format!("failed to query capture context: {error}"))?;

        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|error| format!("failed to read capture context row: {error}"))
    }

    pub fn create_text_item(
        &self,
        request: CreateHistoryItemRequest,
    ) -> Result<CreateHistoryItemResult, String> {
        let text = normalize_text_for_storage(&request.text);
        if text.is_empty() {
            return Err("new item content cannot be empty".to_string());
        }

        let title = normalize_optional_text(request.title);
        let notes = normalize_optional_text(request.notes);
        let normalized_tags = normalize_tag_values(&request.tags)?;
        let tags = (!normalized_tags.is_empty()).then(|| {
            normalized_tags
                .iter()
                .map(|(_, label)| label.as_str())
                .collect::<Vec<_>>()
                .join("\n")
        });
        let normalized_properties = normalize_scenario_properties(&request.properties)?;
        let mime_primary = normalize_optional_text(request.mime_primary)
            .or_else(|| Some("text/plain".to_string()));
        let normalized_hash = hash_text(&text);
        let text_char_count = text.chars().count() as i64;
        let line_count = text.lines().count().max(1) as i64;
        let domain = first_url_domain(&text);
        let manual_context = CaptureContext {
            source_kind: "manual".to_string(),
            ..CaptureContext::default()
        };
        let now = now_unix_ms();
        let (result, prune_outcome, projection_changed) = {
            let conn = self
                .conn
                .lock()
                .map_err(|_| "sqlite connection mutex poisoned".to_string())?;
            let conn = conn
                .unchecked_transaction()
                .map_err(|error| format!("failed to begin manual item creation: {error}"))?;

            let existing = conn
                .query_row(
                    "SELECT id, title, notes, mime_primary
                     FROM clipboard_items
                     WHERE normalized_hash = ?1",
                    params![normalized_hash],
                    |row| {
                        Ok((
                            row.get::<_, i64>(0)?,
                            row.get::<_, Option<String>>(1)?,
                            row.get::<_, Option<String>>(2)?,
                            row.get::<_, Option<String>>(3)?,
                        ))
                    },
                )
                .optional()
                .map_err(|error| format!("failed to inspect existing manual item: {error}"))?;

            if let Some((existing_id, existing_title, existing_notes, existing_mime)) = existing {
                let before_projection = item_projection_signature(&conn, existing_id)?;
                let next_title = title.or(existing_title);
                let next_notes = append_optional_notes(existing_notes, notes);
                for (slug, label) in &normalized_tags {
                    add_item_tag_relation(&conn, existing_id, slug, label, "manual", None)?;
                }
                for value in &normalized_properties.client {
                    add_item_property(&conn, existing_id, "client", value, "manual")?;
                }
                for value in &normalized_properties.project {
                    add_item_property(&conn, existing_id, "project", value, "manual")?;
                }
                for value in &normalized_properties.activity {
                    add_item_property(&conn, existing_id, "activity", value, "manual")?;
                }
                let next_mime = mime_primary.or(existing_mime);
                let event_mime = next_mime.clone();
                conn.execute(
                    "UPDATE clipboard_items
                     SET last_copied_at_unix_ms = ?1,
                         copy_count = COALESCE(copy_count, 1) + 1,
                         title = ?2,
                         notes = ?3,
                         mime_primary = ?4
                     WHERE id = ?5",
                    params![now, next_title, next_notes, next_mime, existing_id],
                )
                .map_err(|error| format!("failed to update existing manual item: {error}"))?;
                sync_legacy_tags_for_item(&conn, existing_id)?;
                let projection_changed =
                    before_projection != item_projection_signature(&conn, existing_id)?;

                let context_pruned = record_capture_event(
                    &conn,
                    existing_id,
                    now,
                    "text",
                    event_mime.as_deref(),
                    None,
                    Some(text_char_count),
                    Some(line_count),
                    domain.as_deref(),
                    Some(&manual_context),
                    None,
                )?;
                let projection_changed = projection_changed || context_pruned;
                let prune_outcome = prune_history_from_conn(&conn)?;
                conn.commit()
                    .map_err(|error| format!("failed to commit manual item creation: {error}"))?;
                (
                    CreateHistoryItemResult {
                        id: existing_id,
                        created: false,
                    },
                    prune_outcome,
                    projection_changed,
                )
            } else {
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
                        title,
                        notes,
                        tags
                    ) VALUES ('text', ?1, ?2, ?3, ?3, ?3, 1, ?4, ?5, ?6, ?7)",
                    params![text, normalized_hash, now, mime_primary, title, notes, tags],
                )
                .map_err(|error| format!("failed to create manual text item: {error}"))?;

                let item_id = conn.last_insert_rowid();
                for (slug, label) in &normalized_tags {
                    add_item_tag_relation(&conn, item_id, slug, label, "manual", None)?;
                }
                for value in &normalized_properties.client {
                    add_item_property(&conn, item_id, "client", value, "manual")?;
                }
                for value in &normalized_properties.project {
                    add_item_property(&conn, item_id, "project", value, "manual")?;
                }
                for value in &normalized_properties.activity {
                    add_item_property(&conn, item_id, "activity", value, "manual")?;
                }
                sync_legacy_tags_for_item(&conn, item_id)?;
                record_capture_event(
                    &conn,
                    item_id,
                    now,
                    "text",
                    mime_primary.as_deref(),
                    None,
                    Some(text_char_count),
                    Some(line_count),
                    domain.as_deref(),
                    Some(&manual_context),
                    None,
                )?;
                let prune_outcome = prune_history_from_conn(&conn)?;
                conn.commit()
                    .map_err(|error| format!("failed to commit manual item creation: {error}"))?;
                (
                    CreateHistoryItemResult {
                        id: item_id,
                        created: true,
                    },
                    prune_outcome,
                    false,
                )
            }
        };

        if projection_changed || prune_outcome.removed_items > 0 {
            self.bump_mutation_epoch();
        }
        self.remove_blob_paths(prune_outcome.blob_paths);
        Ok(result)
    }

    pub fn insert_image(&self, image: &crate::image_capture::CapturedImage) -> Result<i64, String> {
        self.insert_image_with_context(image, None, &[])
    }

    pub fn insert_image_with_context(
        &self,
        image: &crate::image_capture::CapturedImage,
        capture_context: Option<CaptureContext>,
        capture_tags: &[String],
    ) -> Result<i64, String> {
        self.insert_image_with_scenario(image, capture_context, capture_tags, None)
    }

    pub fn insert_image_with_scenario(
        &self,
        image: &crate::image_capture::CapturedImage,
        capture_context: Option<CaptureContext>,
        capture_tags: &[String],
        active_scenario: Option<ActiveScenarioSession>,
    ) -> Result<i64, String> {
        let normalized_capture_tags = normalize_tag_values(capture_tags)?;
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
        let capture_result = (|| -> Result<_, String> {
            let mut conn = self
                .conn
                .lock()
                .map_err(|_| "sqlite connection mutex poisoned".to_string())?;
            let tx = conn
                .transaction()
                .map_err(|error| format!("failed to start clipboard image capture: {error}"))?;

            let existing_id = bump_existing_capture(&tx, &image.normalized_hash, now)?;
            let before_projection = existing_id
                .map(|id| item_projection_signature(&tx, id))
                .transpose()?;
            write_blob(&image_path, &image.png_bytes)?;
            write_blob(&thumbnail_path, &image.thumbnail_png_bytes)?;
            let item_id = if let Some(existing_id) = existing_id {
                tx.execute(
                    "UPDATE clipboard_items SET blob_path = ?1, thumbnail_path = ?2
                     WHERE id = ?3 AND content_kind = 'image'",
                    params![
                        path_to_db_string(&image_relative_path),
                        path_to_db_string(&thumbnail_relative_path),
                        existing_id
                    ],
                )
                .map_err(|error| format!("failed to restore image paths on recapture: {error}"))?;
                existing_id
            } else {
                tx.execute(
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

                tx.last_insert_rowid()
            };

            for (slug, label) in &normalized_capture_tags {
                add_item_tag_relation(&tx, item_id, slug, label, "context", None)?;
            }
            sync_legacy_tags_for_item(&tx, item_id)?;
            if let Some(scenario) = active_scenario.as_ref() {
                apply_scenario_patch(&tx, item_id, scenario)?;
            }
            let context_pruned = record_capture_event(
                &tx,
                item_id,
                now,
                "image",
                Some("image/png"),
                Some(image.png_bytes.len() as i64),
                None,
                None,
                None,
                capture_context.as_ref(),
                active_scenario.as_ref(),
            )?;
            let after_projection = existing_id
                .map(|id| item_projection_signature(&tx, id))
                .transpose()?;
            let projection_changed = context_pruned || before_projection != after_projection;
            let prune_outcome = prune_history_from_conn(&tx)?;
            tx.commit()
                .map_err(|error| format!("failed to commit clipboard image capture: {error}"))?;
            Ok((item_id, prune_outcome, projection_changed))
        })();
        let (item_id, prune_outcome, projection_changed) = match capture_result {
            Ok(outcome) => outcome,
            Err(error) => {
                self.remove_blob_paths([ItemBlobPaths {
                    blob_path: Some(path_to_db_string(&image_relative_path)),
                    thumbnail_path: Some(path_to_db_string(&thumbnail_relative_path)),
                }]);
                return Err(error);
            }
        };

        if projection_changed || prune_outcome.removed_items > 0 {
            self.bump_mutation_epoch();
        }
        self.remove_blob_paths(prune_outcome.blob_paths);
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
            display_query: None,
            cursor: request.cursor,
            limit: request.limit,
            plan: None,
            mode: HistorySearchMode::Structured,
            include_content: false,
            include_counts: true,
            explain: false,
            ai_context: None,
            applied_descriptor: None,
        })
    }

    pub fn history_search(&self, request: HistorySearchRequest) -> Result<HistoryPage, String> {
        let trimmed = request.query.trim();
        let query_explanation = search_query_explanation(trimmed);
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
        if request.plan.is_none()
            && query_explanation
                .diagnostics
                .iter()
                .any(|diagnostic| diagnostic.severity == "error")
        {
            let total_count = request
                .include_counts
                .then(|| count_history_items(&conn, "", &[]))
                .transpose()?;
            return Ok(HistoryPage {
                items: Vec::new(),
                next_cursor: None,
                total_count,
                filtered_count: request.include_counts.then_some(0),
                interpreted_query: request.explain.then(|| trimmed.to_string()),
                explanation: request
                    .explain
                    .then(|| "Fix the structured search syntax before searching.".to_string()),
                query_explanation: request.explain.then_some(query_explanation),
                warnings,
                applied_descriptor: None,
            });
        }

        let descriptor = if let Some(descriptor) = request.applied_descriptor.clone() {
            descriptor.validate()?;
            if request.cursor.is_some() && descriptor.effective_query.trim() != trimmed {
                return Err(
                    "applied search descriptor does not match the request query".to_string()
                );
            }
            Some(descriptor)
        } else {
            let plan = request
                .plan
                .clone()
                .unwrap_or_else(|| search_plan_from_query(trimmed));
            Some(AppliedSearchDescriptor::new(
                request
                    .display_query
                    .clone()
                    .unwrap_or_else(|| trimmed.to_string()),
                trimmed,
                request.mode.clone().into(),
                plan,
            )?)
        };
        let plan = descriptor
            .as_ref()
            .map(|descriptor| descriptor.plan.clone())
            .unwrap_or_else(|| search_plan_from_query(trimmed));
        let custom_sort = !plan.sort.is_empty();
        if request.cursor.is_some() && custom_sort {
            return Err("cursor pagination with custom sort is not supported yet".to_string());
        }
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
            let inbox_at = cursor
                .after_is_inbox
                .then_some(cursor.after_inbox_at_unix_ms)
                .flatten();
            query_params.push(Value::Integer(i64::from(cursor.after_is_inbox)));
            query_params.push(Value::Integer(i64::from(inbox_at.is_some())));
            query_params.push(Value::Integer(inbox_at.unwrap_or(0)));
            query_params.push(Value::Integer(cursor.after_sort_unix_ms));
            query_params.push(Value::Integer(cursor.after_id));
            let cursor_clause = "(
                (is_inbox != 0),
                (CASE WHEN is_inbox != 0 THEN inbox_at_unix_ms END IS NOT NULL),
                COALESCE(CASE WHEN is_inbox != 0 THEN inbox_at_unix_ms END, 0),
                COALESCE(last_copied_at_unix_ms, created_at_unix_ms), id
            ) < (?, ?, ?, ?, ?)";
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
                request.explain.then(|| query_explanation.clone()),
                warnings,
                descriptor.clone(),
            )?;
            if let Some(applied) = page.applied_descriptor.as_ref() {
                attach_search_matches(
                    &conn,
                    &mut page.items,
                    &applied.plan,
                    request.include_content,
                )?;
            }
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
            request.explain.then_some(query_explanation),
            warnings,
            descriptor,
        )?;
        if let Some(applied) = page.applied_descriptor.as_ref() {
            attach_search_matches(
                &conn,
                &mut page.items,
                &applied.plan,
                request.include_content,
            )?;
        }
        if custom_sort {
            page.next_cursor = None;
        }
        drop(conn);
        self.attach_thumbnail_data_urls(&mut page.items);
        Ok(page)
    }

    pub fn get_items_preview(
        &self,
        ids: Vec<i64>,
        applied_descriptor: Option<AppliedSearchDescriptor>,
    ) -> Result<Vec<HistoryItem>, String> {
        if ids.len() > MAX_HISTORY_PAGE_LIMIT as usize {
            return Err("item preview request cannot exceed 100 IDs".to_string());
        }
        if ids.is_empty() {
            return Ok(Vec::new());
        }
        if let Some(descriptor) = applied_descriptor.as_ref() {
            descriptor.validate()?;
        }
        let placeholders = vec!["?"; ids.len()].join(",");
        let mut items = {
            let conn = self
                .conn
                .lock()
                .map_err(|_| "sqlite connection mutex poisoned".to_string())?;
            let mut items = self.query_items(
                &conn,
                &format!(
                    "SELECT {} FROM clipboard_items WHERE id IN ({placeholders}) ORDER BY id",
                    history_item_select_columns(false),
                ),
                params_from_iter(ids.iter()),
            )?;
            if let Some(descriptor) = applied_descriptor.as_ref() {
                attach_search_matches(&conn, &mut items, &descriptor.plan, false)?;
            }
            items
        };
        self.attach_thumbnail_data_urls(&mut items);
        Ok(items)
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

    pub fn get_neighbor_item(
        &self,
        id: i64,
        direction: HistoryNeighborDirection,
        wrap: bool,
    ) -> Result<Option<HistoryItem>, String> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| "sqlite connection mutex poisoned".to_string())?;
        let (comparison, order) = match direction {
            HistoryNeighborDirection::Older => ("<", "DESC"),
            HistoryNeighborDirection::Newer => (">", "ASC"),
        };
        let mut items = self.query_items(
            &conn,
            &format!(
                "SELECT {}
                 FROM clipboard_items
                 WHERE id {comparison} ?1
                 ORDER BY id {order}
                 LIMIT 1",
                history_item_select_columns(true)
            ),
            params![id],
        )?;
        if items.is_empty() && wrap {
            let wrap_order = match direction {
                HistoryNeighborDirection::Older => "DESC",
                HistoryNeighborDirection::Newer => "ASC",
            };
            items = self.query_items(
                &conn,
                &format!(
                    "SELECT {}
                     FROM clipboard_items
                     ORDER BY id {wrap_order}
                     LIMIT 1",
                    history_item_select_columns(true)
                ),
                [],
            )?;
        }
        Ok(items.pop())
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
            self.bump_mutation_epoch();
            Ok(())
        }
    }

    pub fn move_to_position(&self, id: i64, position: HistoryMovePosition) -> Result<(), String> {
        let now = now_unix_ms();
        let conn = self
            .conn
            .lock()
            .map_err(|_| "sqlite connection mutex poisoned".to_string())?;
        let sort_timestamp = match position {
            HistoryMovePosition::Top => now,
        };

        let updated = conn
            .execute(
                "UPDATE clipboard_items
                 SET last_copied_at_unix_ms = ?1,
                     copy_count = COALESCE(copy_count, 1) + 1
                 WHERE id = ?2",
                params![sort_timestamp, id],
            )
            .map_err(|error| format!("failed to update clipboard item copy usage: {error}"))?;

        if updated == 0 {
            Err(format!("clipboard item not found: {id}"))
        } else {
            self.bump_mutation_epoch();
            Ok(())
        }
    }

    pub fn promote_to_top(&self, id: i64) -> Result<(), String> {
        self.move_to_position(id, HistoryMovePosition::Top)
    }

    pub fn mark_copied(&self, id: i64) -> Result<(), String> {
        self.promote_to_top(id)
    }
    pub fn set_history_item_inbox(&self, id: i64, inbox: bool) -> Result<(), String> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| "sqlite connection mutex poisoned".to_string())?;
        let updated = conn
            .execute(
                "UPDATE clipboard_items
                 SET is_inbox = ?1,
                     inbox_at_unix_ms = CASE WHEN ?1 != 0 THEN ?2 ELSE NULL END
                 WHERE id = ?3",
                params![inbox as i64, now_unix_ms(), id],
            )
            .map_err(|error| format!("failed to update inbox state: {error}"))?;
        if updated == 0 {
            return Err(format!("clipboard item not found: {id}"));
        }
        self.bump_mutation_epoch();
        Ok(())
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

        self.bump_mutation_epoch();
        Ok(())
    }

    pub fn set_query_marked(&self, request: SetHistoryQueryMarkedRequest) -> Result<(), String> {
        let now = now_unix_ms();
        let trimmed_query = request.query.trim();
        if search_query_explanation(trimmed_query)
            .diagnostics
            .iter()
            .any(|diagnostic| diagnostic.severity == "error")
        {
            return Err("query has invalid structured syntax; refusing marked update".to_string());
        }
        let descriptor = request.applied_descriptor.ok_or_else(|| {
            "applied search descriptor is required for marked query updates".to_string()
        })?;
        descriptor.validate()?;
        if descriptor.effective_query.trim() != trimmed_query {
            return Err("applied search descriptor does not match the marked query".to_string());
        }
        let plan = descriptor.plan;
        let compiled = compile_search_plan(&plan)?;
        if !trimmed_query.is_empty() && compiled.where_sql.is_empty() {
            return Err(
                "query has no effective filters; refusing a global marked update".to_string(),
            );
        }
        let mut filter_params = compiled.params;
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
             {}",
            compiled.where_sql
        );
        conn.execute(&sql, params_from_iter(query_params.iter()))
            .map_err(|error| format!("failed to update marked clipboard query: {error}"))?;

        self.bump_mutation_epoch();
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

        self.bump_mutation_epoch();
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
        let conn = self
            .conn
            .lock()
            .map_err(|_| "sqlite connection mutex poisoned".to_string())?;
        let tx = conn
            .unchecked_transaction()
            .map_err(|error| format!("failed to begin item update: {error}"))?;
        update_item_text_from_conn(&tx, request.id, &request.text)?;
        tx.execute(
            "UPDATE clipboard_items
             SET title = ?1, notes = ?2, mime_primary = ?3,
                 is_marked = COALESCE(?4, is_marked),
                 marked_at_unix_ms = CASE WHEN ?4 IS NULL THEN marked_at_unix_ms
                     WHEN ?4 != 0 THEN ?5 ELSE NULL END
             WHERE id = ?6",
            params![
                normalize_optional_text(request.title),
                normalize_optional_text(request.notes),
                normalize_optional_text(request.mime_primary),
                request.marked.map(i64::from),
                now_unix_ms(),
                request.id,
            ],
        )
        .map_err(|error| format!("failed to update clipboard item: {error}"))?;
        sync_item_tags_from_legacy_string(&tx, request.id, request.tags.as_deref())?;
        tx.commit()
            .map_err(|error| format!("failed to commit item update: {error}"))?;
        self.bump_mutation_epoch();
        Ok(())
    }

    pub fn update_item_text(&self, id: i64, text: String) -> Result<(), String> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| "sqlite connection mutex poisoned".to_string())?;
        let tx = conn
            .unchecked_transaction()
            .map_err(|error| format!("failed to begin text update: {error}"))?;
        update_item_text_from_conn(&tx, id, &text)?;
        tx.commit()
            .map_err(|error| format!("failed to commit text update: {error}"))?;
        self.bump_mutation_epoch();
        Ok(())
    }

    pub fn update_item_metadata(&self, request: UpdateItemMetadataRequest) -> Result<(), String> {
        let mut conn = self
            .conn
            .lock()
            .map_err(|_| "sqlite connection mutex poisoned".to_string())?;
        let transaction = conn
            .transaction()
            .map_err(|error| format!("failed to begin metadata update: {error}"))?;
        ensure_item_exists(&transaction, request.id)?;
        transaction
            .execute(
                "UPDATE clipboard_items SET title = ?1, notes = ?2 WHERE id = ?3",
                params![
                    normalize_optional_text(request.title),
                    normalize_optional_text(request.notes),
                    request.id,
                ],
            )
            .map_err(|error| format!("failed to update clipboard item metadata: {error}"))?;
        set_item_tags_from_values(&transaction, request.id, &request.tags)?;
        replace_item_property_values(
            &transaction,
            request.id,
            "client",
            &request.properties.client,
        )?;
        replace_item_property_values(
            &transaction,
            request.id,
            "project",
            &request.properties.project,
        )?;
        replace_item_property_values(
            &transaction,
            request.id,
            "activity",
            &request.properties.activity,
        )?;
        transaction
            .commit()
            .map_err(|error| format!("failed to commit metadata update: {error}"))?;
        self.bump_mutation_epoch();
        Ok(())
    }
    pub fn get_metadata_selection_snapshot(
        &self,
        request: MetadataSelectionRequest,
    ) -> Result<MetadataSelectionSnapshot, String> {
        let item_ids = normalize_metadata_selection_ids(&request.item_ids)?;
        let conn = self
            .conn
            .lock()
            .map_err(|_| "sqlite connection mutex poisoned".to_string())?;
        metadata_selection_snapshot_from_conn(&conn, &item_ids)
    }

    pub fn apply_metadata_selection_intent(
        &self,
        intent: MetadataSelectionIntent,
    ) -> Result<MetadataSelectionApplyResult, String> {
        let mut conn = self
            .conn
            .lock()
            .map_err(|_| "sqlite connection mutex poisoned".to_string())?;
        let transaction = conn
            .transaction()
            .map_err(|error| format!("failed to begin metadata selection update: {error}"))?;
        let item_ids = normalize_metadata_selection_ids(&intent.item_ids)?;
        let current = metadata_selection_snapshot_from_conn(&transaction, &item_ids)?;
        if current.snapshot_token != intent.expected_snapshot_token {
            return Err(format!(
                "{METADATA_SNAPSHOT_STALE}: editable metadata changed; reload selection"
            ));
        }

        let mut changed_items = BTreeSet::new();
        let mut tag_changed_items = BTreeSet::new();
        let mut title_changed_count = 0;
        let mut notes_changed_count = 0;
        let mut tag_relation_changes = 0;
        let mut property_relation_changes = 0;

        for item_id in &item_ids {
            let (current_title, current_notes) = transaction
                .query_row(
                    "SELECT title, notes FROM clipboard_items WHERE id = ?1",
                    params![item_id],
                    |row| Ok((row.get::<_, Option<String>>(0)?, row.get::<_, Option<String>>(1)?)),
                )
                .map_err(|error| format!("failed to read scalar metadata: {error}"))?;

            let next_title = match &intent.title {
                ScalarIntent::Untouched => current_title.clone(),
                ScalarIntent::Set { value } => normalize_optional_text(Some(value.clone())),
                ScalarIntent::Clear => None,
            };
            if !matches!(intent.title, ScalarIntent::Untouched) && next_title != current_title {
                transaction
                    .execute(
                        "UPDATE clipboard_items SET title = ?1 WHERE id = ?2",
                        params![next_title, item_id],
                    )
                    .map_err(|error| format!("failed to update selection title: {error}"))?;
                title_changed_count += 1;
                changed_items.insert(*item_id);
            }

            let next_notes = match &intent.notes {
                NotesIntent::Untouched => current_notes.clone(),
                NotesIntent::ReplaceAll { value } => normalize_optional_text(Some(value.clone())),
                NotesIntent::AppendToEach { value } => {
                    let addition = normalize_optional_text(Some(value.clone()));
                    match (current_notes.clone(), addition) {
                        (existing, None) => existing,
                        (None, Some(addition)) => Some(addition),
                        (Some(existing), Some(addition)) => {
                            Some(format!("{existing}\n\n{addition}"))
                        }
                    }
                }
                NotesIntent::ClearAll => None,
            };
            if !matches!(intent.notes, NotesIntent::Untouched) && next_notes != current_notes {
                transaction
                    .execute(
                        "UPDATE clipboard_items SET notes = ?1 WHERE id = ?2",
                        params![next_notes, item_id],
                    )
                    .map_err(|error| format!("failed to update selection notes: {error}"))?;
                notes_changed_count += 1;
                changed_items.insert(*item_id);
            }
        }

        let normalized_tag_intents = normalize_tag_intents(&intent.tags)?;
        for (slug, label, op) in normalized_tag_intents {
            if op == SetValueIntentOp::Untouched {
                continue;
            }
            for item_id in &item_ids {
                let existing = transaction
                    .query_row(
                        "SELECT tags.label
                         FROM clipboard_item_tags
                         JOIN tags ON tags.id = clipboard_item_tags.tag_id
                         WHERE clipboard_item_tags.item_id = ?1 AND tags.slug = ?2",
                        params![item_id, slug],
                        |row| row.get::<_, String>(0),
                    )
                    .optional()
                    .map_err(|error| format!("failed to inspect selection tag: {error}"))?;
                match (op, existing) {
                    (SetValueIntentOp::Add, None) => {
                        if add_item_tag_relation(
                            &transaction,
                            *item_id,
                            &slug,
                            &label,
                            "manual",
                            None,
                        )? {
                            tag_relation_changes += 1;
                            changed_items.insert(*item_id);
                            tag_changed_items.insert(*item_id);
                        }
                    }
                    (SetValueIntentOp::Remove, Some(existing_label)) => {
                        suppress_metadata_value(
                            &transaction,
                            *item_id,
                            "tag",
                            "",
                            &existing_label,
                            &slug,
                        )?;
                        let tag_id = tag_id_by_slug(&transaction, &slug)?;
                        transaction
                            .execute(
                                "DELETE FROM clipboard_item_tags WHERE item_id = ?1 AND tag_id = ?2",
                                params![item_id, tag_id],
                            )
                            .map_err(|error| {
                                format!("failed to remove selection tag relation: {error}")
                            })?;
                        tag_relation_changes += 1;
                        changed_items.insert(*item_id);
                        tag_changed_items.insert(*item_id);
                    }
                    _ => {}
                }
            }
        }

        for (property_key, intents) in [
            ("client", &intent.properties.client),
            ("project", &intent.properties.project),
            ("activity", &intent.properties.activity),
        ] {
            for (value, normalized_value, op) in normalize_property_intents(intents)? {
                if op == SetValueIntentOp::Untouched {
                    continue;
                }
                for item_id in &item_ids {
                    let existing = transaction
                        .query_row(
                            "SELECT value FROM clipboard_item_properties
                             WHERE item_id = ?1 AND property_key = ?2 AND normalized_value = ?3",
                            params![item_id, property_key, normalized_value],
                            |row| row.get::<_, String>(0),
                        )
                        .optional()
                        .map_err(|error| {
                            format!("failed to inspect selection property: {error}")
                        })?;
                    match (op, existing) {
                        (SetValueIntentOp::Add, None) => {
                            if add_item_property(
                                &transaction,
                                *item_id,
                                property_key,
                                &value,
                                "manual",
                            )? {
                                property_relation_changes += 1;
                                changed_items.insert(*item_id);
                            }
                        }
                        (SetValueIntentOp::Remove, Some(existing_value)) => {
                            suppress_metadata_value(
                                &transaction,
                                *item_id,
                                "property",
                                property_key,
                                &existing_value,
                                &normalized_value,
                            )?;
                            transaction
                                .execute(
                                    "DELETE FROM clipboard_item_properties
                                     WHERE item_id = ?1 AND property_key = ?2
                                       AND normalized_value = ?3",
                                    params![item_id, property_key, normalized_value],
                                )
                                .map_err(|error| {
                                    format!(
                                        "failed to remove selection property relation: {error}"
                                    )
                                })?;
                            property_relation_changes += 1;
                            changed_items.insert(*item_id);
                        }
                        _ => {}
                    }
                }
            }
        }

        for item_id in &tag_changed_items {
            sync_legacy_tags_for_item(&transaction, *item_id)?;
        }
        let snapshot = metadata_selection_snapshot_from_conn(&transaction, &item_ids)?;
        transaction
            .commit()
            .map_err(|error| format!("failed to commit metadata selection update: {error}"))?;
        if !changed_items.is_empty() {
            self.bump_mutation_epoch();
        }
        Ok(MetadataSelectionApplyResult {
            snapshot,
            changed_item_count: changed_items.len(),
            title_changed_count,
            notes_changed_count,
            tag_relation_changes,
            property_relation_changes,
        })
    }

    pub fn list_item_properties(&self, item_id: i64) -> Result<ScenarioProperties, String> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| "sqlite connection mutex poisoned".to_string())?;
        ensure_item_exists(&conn, item_id)?;
        scenario_properties_for_item(&conn, item_id)
    }

    pub fn list_item_property_entries(
        &self,
        item_id: i64,
    ) -> Result<Vec<MetadataPropertyEntry>, String> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| "sqlite connection mutex poisoned".to_string())?;
        ensure_item_exists(&conn, item_id)?;
        item_property_entries(&conn, item_id)
    }

    pub fn delete_item(&self, id: i64) -> Result<(), String> {
        let item = self.get_item(id)?;
        let conn = self
            .conn
            .lock()
            .map_err(|_| "sqlite connection mutex poisoned".to_string())?;

        let deleted = conn
            .execute("DELETE FROM clipboard_items WHERE id = ?1", params![id])
            .map_err(|error| format!("failed to delete clipboard item: {error}"))?;

        if deleted == 0 {
            return Err(format!("clipboard item not found: {id}"));
        }

        drop(conn);
        self.remove_item_blobs(&item);
        self.bump_mutation_epoch();
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

    pub fn get_item_preview(&self, id: i64) -> Result<ItemPreviewPayload, String> {
        self.get_item(id).map(ItemPreviewPayload::from)
    }

    pub fn read_item_preview_image_data_url(&self, id: i64) -> Result<String, String> {
        let item = self.get_item(id)?;
        if item.content_kind != "image" {
            return Err(format!("clipboard item is not an image: {id}"));
        }
        let png = self.read_blob_for_item(&item)?;
        Ok(format!(
            "data:image/png;base64,{}",
            BASE64_STANDARD.encode(png)
        ))
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

    pub fn update_settings(&self, mut settings: AppSettings) -> Result<AppSettings, String> {
        normalize_loaded_settings(&mut settings);
        validate_settings(&settings)?;
        ensure_scripts_folder(&settings)?;
        let conn = self
            .conn
            .lock()
            .map_err(|_| "sqlite connection mutex poisoned".to_string())?;
        persist_settings_to_conn(&conn, &settings)?;
        Ok(settings)
    }

    pub fn update_search_trigger_mode(
        &self,
        mode: SearchTriggerMode,
    ) -> Result<AppSettings, String> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| "sqlite connection mutex poisoned".to_string())?;
        let mut settings = settings_from_conn(&conn)?;
        settings.picker.search_trigger_mode = if mode == SearchTriggerMode::Manual {
            SearchTriggerMode::Enter
        } else {
            mode
        };
        validate_settings(&settings)?;
        persist_settings_to_conn(&conn, &settings)?;
        Ok(settings)
    }
    pub fn update_default_search_scopes(
        &self,
        included: Vec<SearchDefaultScope>,
        excluded: Vec<SearchPlanTextScopeV1>,
    ) -> Result<AppSettings, String> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| "sqlite connection mutex poisoned".to_string())?;
        let mut settings = settings_from_conn(&conn)?;
        settings.picker.default_search_scopes = included;
        settings.picker.default_excluded_search_scopes = excluded;
        normalize_default_search_scopes(&mut settings.picker);
        validate_settings(&settings)?;
        persist_settings_to_conn(&conn, &settings)?;
        Ok(settings)
    }

    pub fn list_tags(&self) -> Result<Vec<TagSummary>, String> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| "sqlite connection mutex poisoned".to_string())?;
        query_tag_summaries(&conn, None)
    }

    pub fn list_saved_history_views(&self) -> Result<Vec<SavedHistoryView>, String> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| "sqlite connection mutex poisoned".to_string())?;
        let mut statement = conn
            .prepare(
                "SELECT id, title, query, open_mode, hotkey, pinned, sort_order, capture_tags, created_at_unix_ms, updated_at_unix_ms
                 FROM saved_history_views
                 ORDER BY pinned DESC, sort_order ASC, title COLLATE NOCASE ASC, id ASC",
            )
            .map_err(|error| format!("failed to prepare saved history views query: {error}"))?;
        let rows = statement
            .query_map([], saved_history_view_from_row)
            .map_err(|error| format!("failed to query saved history views: {error}"))?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|error| format!("failed to read saved history view row: {error}"))
    }

    pub fn create_saved_history_view(
        &self,
        request: CreateSavedHistoryViewRequest,
    ) -> Result<SavedHistoryView, String> {
        validate_saved_history_view(&request.title, &request.query)?;
        let capture_tags = normalized_tag_labels_json(&request.capture_tags)?;
        let title = request.title.trim();
        let query = request.query.trim();
        let now = now_unix_ms();
        let conn = self
            .conn
            .lock()
            .map_err(|_| "sqlite connection mutex poisoned".to_string())?;
        conn.execute(
            "INSERT INTO saved_history_views (
                title, query, hotkey, capture_tags, created_at_unix_ms, updated_at_unix_ms
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?5)",
            params![
                title,
                query,
                normalize_optional_text(request.hotkey),
                capture_tags,
                now
            ],
        )
        .map_err(|error| format!("failed to create saved history view: {error}"))?;
        let id = conn.last_insert_rowid();
        conn.query_row(
            "SELECT id, title, query, open_mode, hotkey, pinned, sort_order, capture_tags, created_at_unix_ms, updated_at_unix_ms
             FROM saved_history_views WHERE id = ?1",
            params![id],
            saved_history_view_from_row,
        )
        .map_err(|error| format!("failed to read saved history view after create: {error}"))
    }

    pub fn update_saved_history_view(
        &self,
        request: UpdateSavedHistoryViewRequest,
    ) -> Result<SavedHistoryView, String> {
        validate_saved_history_view(&request.title, &request.query)?;
        let capture_tags = normalized_tag_labels_json(&request.capture_tags)?;
        let conn = self
            .conn
            .lock()
            .map_err(|_| "sqlite connection mutex poisoned".to_string())?;
        let changed = conn.execute(
            "UPDATE saved_history_views
             SET title = ?1, query = ?2, hotkey = ?3, pinned = ?4, sort_order = ?5, capture_tags = ?6, updated_at_unix_ms = ?7
             WHERE id = ?8",
            params![
                request.title.trim(),
                request.query.trim(),
                normalize_optional_text(request.hotkey),
                i64::from(request.pinned),
                request.sort_order,
                capture_tags,
                now_unix_ms(),
                request.id,
            ],
        ).map_err(|error| format!("failed to update saved history view: {error}"))?;
        if changed == 0 {
            return Err("saved history view not found".to_string());
        }
        conn.query_row(
            "SELECT id, title, query, open_mode, hotkey, pinned, sort_order, capture_tags, created_at_unix_ms, updated_at_unix_ms
             FROM saved_history_views WHERE id = ?1",
            params![request.id],
            saved_history_view_from_row,
        ).map_err(|error| format!("failed to read saved history view after update: {error}"))
    }

    pub fn delete_saved_history_view(&self, id: i64) -> Result<(), String> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| "sqlite connection mutex poisoned".to_string())?;
        if conn
            .execute("DELETE FROM saved_history_views WHERE id = ?1", params![id])
            .map_err(|error| format!("failed to delete saved history view: {error}"))?
            == 0
        {
            return Err("saved history view not found".to_string());
        }
        Ok(())
    }

    pub fn get_saved_history_view(&self, id: i64) -> Result<SavedHistoryView, String> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| "sqlite connection mutex poisoned".to_string())?;
        conn.query_row(
            "SELECT id, title, query, open_mode, hotkey, pinned, sort_order, capture_tags, created_at_unix_ms, updated_at_unix_ms
             FROM saved_history_views WHERE id = ?1",
            params![id],
            saved_history_view_from_row,
        ).map_err(|error| format!("saved history view not found: {error}"))
    }

    pub fn list_scenarios(&self) -> Result<Vec<Scenario>, String> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| "sqlite connection mutex poisoned".to_string())?;
        let mut statement = conn
            .prepare(
                "SELECT id, name, query, revision, client_values_json, project_values_json,
                        activity_values_json, tags_json, created_at_unix_ms, updated_at_unix_ms
                 FROM scenarios
                 ORDER BY name COLLATE NOCASE ASC, id ASC",
            )
            .map_err(|error| format!("failed to prepare scenarios query: {error}"))?;
        let rows = statement
            .query_map([], scenario_from_row)
            .map_err(|error| format!("failed to query scenarios: {error}"))?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|error| format!("failed to read scenario row: {error}"))
    }

    pub fn get_scenario(&self, id: i64) -> Result<Scenario, String> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| "sqlite connection mutex poisoned".to_string())?;
        conn.query_row(
            "SELECT id, name, query, revision, client_values_json, project_values_json,
                    activity_values_json, tags_json, created_at_unix_ms, updated_at_unix_ms
             FROM scenarios
             WHERE id = ?1",
            params![id],
            scenario_from_row,
        )
        .map_err(|error| format!("scenario not found: {error}"))
    }

    pub fn create_scenario(&self, request: CreateScenarioRequest) -> Result<Scenario, String> {
        let name = validate_scenario_name(&request.name)?;
        validate_scenario_query(&request.query)?;
        let properties = normalize_scenario_properties(&request.properties)?;
        let tags = normalize_tag_values(&request.tags)?
            .into_iter()
            .map(|(_, label)| label)
            .collect::<Vec<_>>();
        let now = now_unix_ms();
        let conn = self
            .conn
            .lock()
            .map_err(|_| "sqlite connection mutex poisoned".to_string())?;
        conn.execute(
            "INSERT INTO scenarios (
                name, query, revision, client_values_json, project_values_json,
                activity_values_json, tags_json, created_at_unix_ms, updated_at_unix_ms
             ) VALUES (?1, ?2, 1, ?3, ?4, ?5, ?6, ?7, ?7)",
            params![
                name,
                request.query.trim(),
                encode_values(&properties.client)?,
                encode_values(&properties.project)?,
                encode_values(&properties.activity)?,
                encode_values(&tags)?,
                now,
            ],
        )
        .map_err(|error| format!("failed to create scenario: {error}"))?;
        let id = conn.last_insert_rowid();
        drop(conn);
        self.get_scenario(id)
    }

    pub fn create_scenario_from_query(
        &self,
        request: CreateScenarioFromQueryRequest,
    ) -> Result<Scenario, String> {
        self.create_scenario(request)
    }

    pub fn update_scenario_from_query(
        &self,
        request: UpdateScenarioFromQueryRequest,
    ) -> Result<Scenario, String> {
        self.update_scenario(request)
    }

    pub fn update_scenario(&self, request: UpdateScenarioRequest) -> Result<Scenario, String> {
        let name = validate_scenario_name(&request.name)?;
        validate_scenario_query(&request.query)?;
        let properties = normalize_scenario_properties(&request.properties)?;
        let tags = normalize_tag_values(&request.tags)?
            .into_iter()
            .map(|(_, label)| label)
            .collect::<Vec<_>>();
        let conn = self
            .conn
            .lock()
            .map_err(|_| "sqlite connection mutex poisoned".to_string())?;
        let changed = conn
            .execute(
                "UPDATE scenarios
                 SET name = ?1,
                     query = ?2,
                     revision = revision + 1,
                     client_values_json = ?3,
                     project_values_json = ?4,
                     activity_values_json = ?5,
                     tags_json = ?6,
                     updated_at_unix_ms = ?7
                 WHERE id = ?8",
                params![
                    name,
                    request.query.trim(),
                    encode_values(&properties.client)?,
                    encode_values(&properties.project)?,
                    encode_values(&properties.activity)?,
                    encode_values(&tags)?,
                    now_unix_ms(),
                    request.id,
                ],
            )
            .map_err(|error| format!("failed to update scenario: {error}"))?;
        if changed == 0 {
            return Err("scenario not found".to_string());
        }
        drop(conn);
        self.get_scenario(request.id)
    }

    pub fn delete_scenario(&self, id: i64) -> Result<(), String> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| "sqlite connection mutex poisoned".to_string())?;
        if conn
            .execute("DELETE FROM scenarios WHERE id = ?1", params![id])
            .map_err(|error| format!("failed to delete scenario: {error}"))?
            == 0
        {
            return Err("scenario not found".to_string());
        }
        Ok(())
    }

    pub fn create_tag(&self, request: CreateTagRequest) -> Result<TagSummary, String> {
        let (slug, label) = normalize_tag_label(&request.label)?;
        let now = now_unix_ms();
        let conn = self
            .conn
            .lock()
            .map_err(|_| "sqlite connection mutex poisoned".to_string())?;
        let conn = conn
            .unchecked_transaction()
            .map_err(|error| format!("failed to begin tag creation: {error}"))?;

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
        sync_legacy_tags_for_tag(&conn, tag_id)?;
        let summary = query_tag_summaries(&conn, Some(tag_id))?
            .pop()
            .ok_or_else(|| format!("tag not found after create: {slug}"))?;
        conn.commit()
            .map_err(|error| format!("failed to commit tag creation: {error}"))?;
        self.bump_mutation_epoch();
        Ok(summary)
    }

    pub fn update_tag_config(&self, request: UpdateTagConfigRequest) -> Result<TagSummary, String> {
        let now = now_unix_ms();
        let conn = self
            .conn
            .lock()
            .map_err(|_| "sqlite connection mutex poisoned".to_string())?;
        let conn = conn
            .unchecked_transaction()
            .map_err(|error| format!("failed to begin tag update: {error}"))?;
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
        let summary = query_tag_summaries(&conn, Some(request.tag_id))?
            .pop()
            .ok_or_else(|| format!("tag not found after update: {}", request.tag_id))?;
        conn.commit()
            .map_err(|error| format!("failed to commit tag update: {error}"))?;
        self.bump_mutation_epoch();
        Ok(summary)
    }

    pub fn delete_tag(&self, tag_id: i64) -> Result<(), String> {
        let mut conn = self
            .conn
            .lock()
            .map_err(|_| "sqlite connection mutex poisoned".to_string())?;
        let tx = conn
            .transaction()
            .map_err(|error| format!("failed to start tag deletion: {error}"))?;
        let tag = query_tag_summaries(&tx, Some(tag_id))?
            .pop()
            .ok_or_else(|| format!("tag not found: {tag_id}"))?;
        let item_ids = {
            let mut statement = tx
                .prepare("SELECT item_id FROM clipboard_item_tags WHERE tag_id = ?1")
                .map_err(|error| format!("failed to prepare tag item deletion: {error}"))?;
            let rows = statement
                .query_map(params![tag_id], |row| row.get::<_, i64>(0))
                .map_err(|error| format!("failed to read tag items: {error}"))?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|error| format!("failed to collect tag items: {error}"))?;
            rows
        };

        let remove_from_json = |json: &str| -> Result<String, String> {
            let filtered = serde_json::from_str::<Vec<String>>(json)
                .map_err(|error| format!("failed to decode tag values: {error}"))?
                .into_iter()
                .filter(|value| {
                    normalize_tag_label(value)
                        .map(|(slug, _)| slug != tag.slug)
                        .unwrap_or(true)
                })
                .collect::<Vec<_>>();
            encode_values(&filtered)
        };

        let scenarios = {
            let mut statement = tx
                .prepare("SELECT id, tags_json FROM scenarios")
                .map_err(|error| format!("failed to prepare scenario tag cleanup: {error}"))?;
            let rows = statement
                .query_map([], |row| {
                    Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
                })
                .map_err(|error| format!("failed to read scenario tags: {error}"))?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|error| format!("failed to collect scenario tags: {error}"))?;
            rows
        };
        for (scenario_id, tags_json) in scenarios {
            let next_tags = remove_from_json(&tags_json)?;
            if next_tags != tags_json {
                tx.execute(
                    "UPDATE scenarios SET tags_json = ?1, revision = revision + 1,
                            updated_at_unix_ms = ?2 WHERE id = ?3",
                    params![next_tags, now_unix_ms(), scenario_id],
                )
                .map_err(|error| format!("failed to remove tag from scenario: {error}"))?;
            }
        }

        let views = {
            let mut statement = tx
                .prepare("SELECT id, capture_tags FROM saved_history_views")
                .map_err(|error| format!("failed to prepare capture tag cleanup: {error}"))?;
            let rows = statement
                .query_map([], |row| {
                    Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
                })
                .map_err(|error| format!("failed to read capture tags: {error}"))?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|error| format!("failed to collect capture tags: {error}"))?;
            rows
        };
        for (view_id, capture_tags) in views {
            let next_tags = remove_from_json(&capture_tags)?;
            if next_tags != capture_tags {
                tx.execute(
                    "UPDATE saved_history_views SET capture_tags = ?1, updated_at_unix_ms = ?2
                     WHERE id = ?3",
                    params![next_tags, now_unix_ms(), view_id],
                )
                .map_err(|error| format!("failed to remove tag from saved view: {error}"))?;
            }
        }

        tx.execute("DELETE FROM tags WHERE id = ?1", params![tag_id])
            .map_err(|error| format!("failed to delete tag: {error}"))?;
        for item_id in item_ids {
            sync_legacy_tags_for_item(&tx, item_id)?;
        }
        tx.commit()
            .map_err(|error| format!("failed to commit tag deletion: {error}"))?;
        self.bump_mutation_epoch();
        Ok(())
    }

    pub fn get_item_tags(&self, item_id: i64) -> Result<Vec<String>, String> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| "sqlite connection mutex poisoned".to_string())?;
        ensure_item_exists(&conn, item_id)?;
        item_tag_labels(&conn, item_id)
    }

    pub fn get_item_tag_entries(&self, item_id: i64) -> Result<Vec<MetadataTagEntry>, String> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| "sqlite connection mutex poisoned".to_string())?;
        ensure_item_exists(&conn, item_id)?;
        item_tag_entries(&conn, item_id)
    }

    pub fn set_item_tags(&self, request: SetItemTagsRequest) -> Result<(), String> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| "sqlite connection mutex poisoned".to_string())?;
        let conn = conn
            .unchecked_transaction()
            .map_err(|error| format!("failed to begin item tags update: {error}"))?;
        ensure_item_exists(&conn, request.item_id)?;
        set_item_tags_from_values(&conn, request.item_id, &request.tags)?;
        conn.commit()
            .map_err(|error| format!("failed to commit item tags update: {error}"))?;
        self.bump_mutation_epoch();
        Ok(())
    }

    pub fn apply_item_tags(&self, request: ApplyItemTagsRequest) -> Result<(), String> {
        let normalized_tags = normalize_tag_values(&request.tags)?;
        let normalized_remove_tags = normalize_tag_values(&request.remove_tags)?;
        let normalized_values = normalized_tags
            .iter()
            .map(|(_, label)| label.clone())
            .collect::<Vec<_>>();
        let added_slugs = normalized_tags
            .iter()
            .map(|(slug, _)| slug)
            .collect::<BTreeSet<_>>();
        if normalized_remove_tags
            .iter()
            .any(|(slug, _)| added_slugs.contains(slug))
        {
            return Err("the same tag cannot be added and removed in one update".to_string());
        }
        let item_ids = request.item_ids.into_iter().collect::<BTreeSet<_>>();
        if item_ids.is_empty() {
            return Err("item tag update requires at least one item".to_string());
        }
        let mut conn = self
            .conn
            .lock()
            .map_err(|_| "sqlite connection mutex poisoned".to_string())?;
        let tx = conn
            .transaction()
            .map_err(|error| format!("failed to start item tag update: {error}"))?;

        for item_id in &item_ids {
            ensure_item_exists(&tx, *item_id)?;
        }
        for item_id in item_ids {
            match request.mode {
                ApplyItemTagsMode::Replace => {
                    if !normalized_remove_tags.is_empty() {
                        return Err("replace tag updates cannot include removed tags".to_string());
                    }
                    set_item_tags_from_values(&tx, item_id, &normalized_values)?;
                }
                ApplyItemTagsMode::Patch => {
                    for (slug, label) in &normalized_remove_tags {
                        suppress_metadata_value(&tx, item_id, "tag", "", label, slug)?;
                        tx.execute(
                            "DELETE FROM clipboard_item_tags
                             WHERE item_id = ?1 AND tag_id = (SELECT id FROM tags WHERE slug = ?2)",
                            params![item_id, slug],
                        )
                        .map_err(|error| format!("failed to remove item tag: {error}"))?;
                    }
                    for (slug, label) in &normalized_tags {
                        add_item_tag_relation(&tx, item_id, slug, label, "manual", None)?;
                    }
                    sync_legacy_tags_for_item(&tx, item_id)?;
                }
            }
        }

        tx.commit()
            .map_err(|error| format!("failed to commit item tag update: {error}"))?;
        self.bump_mutation_epoch();
        Ok(())
    }

    pub fn apply_builtin_enrichment(
        &self,
        item_id: i64,
        expected_hash: &str,
        tags: &[crate::enrichment::BuiltinEnrichmentMatch],
    ) -> Result<Vec<String>, String> {
        if tags.is_empty() {
            return Ok(Vec::new());
        }

        let conn = self
            .conn
            .lock()
            .map_err(|_| "sqlite connection mutex poisoned".to_string())?;
        let conn = conn
            .unchecked_transaction()
            .map_err(|error| format!("failed to begin enrichment: {error}"))?;
        let current_hash: Option<String> = conn
            .query_row(
                "SELECT normalized_hash FROM clipboard_items WHERE id = ?1",
                [item_id],
                |row| row.get(0),
            )
            .optional()
            .map_err(|error| format!("failed to verify enrichment content: {error}"))?;
        if current_hash.as_deref() != Some(expected_hash) {
            return Ok(Vec::new());
        }

        let mut applied = Vec::new();
        for tag in tags {
            let slug = tag.tag.slug();
            let label = tag.tag.label();
            if add_item_tag_relation(
                &conn,
                item_id,
                slug,
                label,
                "rule",
                Some(tag.confidence.into()),
            )? {
                applied.push(slug.to_string());
            }
        }
        sync_legacy_tags_for_item(&conn, item_id)?;
        conn.commit()
            .map_err(|error| format!("failed to commit enrichment: {error}"))?;
        if !applied.is_empty() {
            self.bump_mutation_epoch();
        }
        Ok(applied)
    }

    pub fn list_item_rule_tag_slugs(&self, item_id: i64) -> Result<Vec<String>, String> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| "sqlite connection mutex poisoned".to_string())?;
        ensure_item_exists(&conn, item_id)?;

        let mut statement = conn
            .prepare(
                "SELECT tags.slug
                 FROM clipboard_item_tags
                 JOIN tags ON tags.id = clipboard_item_tags.tag_id
                 WHERE clipboard_item_tags.item_id = ?1
                   AND clipboard_item_tags.source = 'rule'
                 ORDER BY tags.slug ASC",
            )
            .map_err(|error| format!("failed to prepare rule tag query: {error}"))?;
        let rows = statement
            .query_map(params![item_id], |row| row.get::<_, String>(0))
            .map_err(|error| format!("failed to query rule tags: {error}"))?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|error| format!("failed to read rule tag row: {error}"))
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

#[derive(Serialize)]
struct MetadataFingerprintProjection<'a> {
    item_ids: &'a [i64],
    scalars: &'a [(i64, Option<String>, Option<String>)],
    tags: &'a [(i64, String, String, Option<String>)],
    properties: &'a [(i64, String, String, String, String)],
}

#[derive(Default)]
struct SourceAggregateBuilder {
    count: usize,
    confidence_min: Option<f64>,
    confidence_max: Option<f64>,
}

struct SetAggregateBuilder {
    label: String,
    item_ids: BTreeSet<i64>,
    sources: BTreeMap<String, SourceAggregateBuilder>,
    tag_config: Option<MetadataTagConfig>,
}

fn normalize_metadata_selection_ids(item_ids: &[i64]) -> Result<Vec<i64>, String> {
    if item_ids.is_empty() {
        return Err("metadata selection requires at least one item id".to_string());
    }
    let item_ids = item_ids.iter().copied().collect::<BTreeSet<_>>();
    if item_ids.len() > MAX_METADATA_SELECTION_ITEMS {
        return Err(format!(
            "metadata selection exceeds limit of {MAX_METADATA_SELECTION_ITEMS} items"
        ));
    }
    if item_ids.iter().any(|id| *id <= 0) {
        return Err("metadata selection item ids must be positive".to_string());
    }
    Ok(item_ids.into_iter().collect())
}

fn normalize_tag_intents(
    intents: &[SetValueIntent],
) -> Result<Vec<(String, String, SetValueIntentOp)>, String> {
    let mut normalized = Vec::with_capacity(intents.len());
    let mut seen = BTreeSet::new();
    for intent in intents {
        let (slug, label) = normalize_tag_label(&intent.key)?;
        if !seen.insert(slug.clone()) {
            return Err(format!("duplicate metadata tag intent: {slug}"));
        }
        normalized.push((slug, label, intent.op));
    }
    Ok(normalized)
}

fn normalize_property_intents(
    intents: &[SetValueIntent],
) -> Result<Vec<(String, String, SetValueIntentOp)>, String> {
    let mut normalized = Vec::with_capacity(intents.len());
    let mut seen = BTreeSet::new();
    for intent in intents {
        let values = normalize_metadata_values(std::slice::from_ref(&intent.key))?;
        let value = values
            .into_iter()
            .next()
            .ok_or_else(|| "metadata property intent key cannot be empty".to_string())?;
        let normalized_value = normalized_metadata_value(&value);
        if !seen.insert(normalized_value.clone()) {
            return Err(format!(
                "duplicate metadata property intent: {normalized_value}"
            ));
        }
        normalized.push((value, normalized_value, intent.op));
    }
    Ok(normalized)
}

fn scalar_aggregate(values: &[Option<String>]) -> ScalarAggregate {
    let populated_count = values.iter().filter(|value| value.is_some()).count();
    if populated_count == 0 {
        return ScalarAggregate {
            state: ScalarAggregateState::Empty,
            value: None,
            populated_count,
        };
    }
    let first = values[0].as_ref();
    if values.iter().all(|value| value.as_ref() == first) {
        ScalarAggregate {
            state: ScalarAggregateState::Same,
            value: values[0].clone(),
            populated_count,
        }
    } else {
        ScalarAggregate {
            state: ScalarAggregateState::Mixed,
            value: None,
            populated_count,
        }
    }
}

fn finish_set_aggregates(
    builders: BTreeMap<String, SetAggregateBuilder>,
    total_count: usize,
) -> Vec<SetValueAggregate> {
    builders
        .into_iter()
        .map(|(key, builder)| {
            let present_count = builder.item_ids.len();
            let presence = if present_count == total_count {
                MetadataPresence::All
            } else if present_count == 0 {
                MetadataPresence::None
            } else {
                MetadataPresence::Some
            };
            let sources = builder
                .sources
                .into_iter()
                .map(|(source, aggregate)| MetadataSourceCount {
                    source,
                    count: aggregate.count,
                    confidence_min: aggregate.confidence_min,
                    confidence_max: aggregate.confidence_max,
                })
                .collect();
            SetValueAggregate {
                key,
                label: builder.label,
                presence,
                present_count,
                total_count,
                sources,
                tag_config: builder.tag_config,
            }
        })
        .collect()
}

fn record_set_aggregate(
    builders: &mut BTreeMap<String, SetAggregateBuilder>,
    key: String,
    label: String,
    item_id: i64,
    source: String,
    confidence: Option<f64>,
    tag_config: Option<MetadataTagConfig>,
) {
    let builder = builders.entry(key).or_insert_with(|| SetAggregateBuilder {
        label,
        item_ids: BTreeSet::new(),
        sources: BTreeMap::new(),
        tag_config,
    });
    builder.item_ids.insert(item_id);
    let source = builder.sources.entry(source).or_default();
    source.count += 1;
    if let Some(confidence) = confidence {
        source.confidence_min =
            Some(source.confidence_min.map_or(confidence, |value| value.min(confidence)));
        source.confidence_max =
            Some(source.confidence_max.map_or(confidence, |value| value.max(confidence)));
    }
}

fn metadata_selection_snapshot_from_conn(
    conn: &Connection,
    item_ids: &[i64],
) -> Result<MetadataSelectionSnapshot, String> {
    let placeholders = vec!["?"; item_ids.len()].join(",");
    let mut scalars = Vec::with_capacity(item_ids.len());
    let mut content = Vec::with_capacity(item_ids.len());
    let item_sql = format!(
        "SELECT id, title, notes, content_kind, text
         FROM clipboard_items
         WHERE id IN ({placeholders})
         ORDER BY id ASC"
    );
    let mut items = conn
        .prepare(&item_sql)
        .map_err(|error| format!("failed to prepare metadata selection items: {error}"))?;
    let item_rows = items
        .query_map(params_from_iter(item_ids.iter()), |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, Option<String>>(1)?,
                row.get::<_, Option<String>>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
            ))
        })
        .map_err(|error| format!("failed to query metadata selection items: {error}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("failed to read metadata selection item: {error}"))?;
    if item_rows.len() != item_ids.len() {
        let found = item_rows.iter().map(|row| row.0).collect::<BTreeSet<_>>();
        let missing = item_ids
            .iter()
            .find(|item_id| !found.contains(item_id))
            .copied()
            .unwrap_or_default();
        return Err(format!("clipboard item not found: {missing}"));
    }
    for (item_id, title, notes, content_kind, text) in item_rows {
        scalars.push((item_id, title, notes));
        content.push((item_id, content_kind, text));
    }

    let mut tag_builders = BTreeMap::new();
    let mut tag_projection = Vec::new();
    let tag_sql = format!(
        "SELECT clipboard_item_tags.item_id, tags.slug, tags.label,
                clipboard_item_tags.source, clipboard_item_tags.confidence,
                tags.id, tags.color, tags.pinned
         FROM clipboard_item_tags
         JOIN tags ON tags.id = clipboard_item_tags.tag_id
         WHERE clipboard_item_tags.item_id IN ({placeholders})
         ORDER BY clipboard_item_tags.item_id ASC, tags.slug ASC"
    );
    let mut tags = conn
        .prepare(&tag_sql)
        .map_err(|error| format!("failed to prepare metadata selection tags: {error}"))?;
    let tag_rows = tags
        .query_map(params_from_iter(item_ids.iter()), |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, Option<f64>>(4)?,
                row.get::<_, i64>(5)?,
                row.get::<_, Option<String>>(6)?,
                row.get::<_, i64>(7)? != 0,
            ))
        })
        .map_err(|error| format!("failed to query metadata selection tags: {error}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("failed to read metadata selection tag: {error}"))?;
    for (item_id, slug, label, source, confidence, tag_id, color, pinned) in tag_rows {
        tag_projection.push((
            item_id,
            slug.clone(),
            source.clone(),
            confidence.map(|value| value.to_string()),
        ));
        record_set_aggregate(
            &mut tag_builders,
            slug,
            label,
            item_id,
            source,
            confidence,
            Some(MetadataTagConfig {
                tag_id,
                color,
                pinned,
            }),
        );
    }

    let mut property_builders: BTreeMap<String, BTreeMap<String, SetAggregateBuilder>> =
        BTreeMap::new();
    let mut property_projection = Vec::new();
    let property_sql = format!(
        "SELECT item_id, property_key, normalized_value, value, source
         FROM clipboard_item_properties
         WHERE item_id IN ({placeholders})
           AND property_key IN ('client', 'project', 'activity')
         ORDER BY item_id ASC, property_key ASC, normalized_value ASC"
    );
    let mut properties = conn
        .prepare(&property_sql)
        .map_err(|error| format!("failed to prepare metadata selection properties: {error}"))?;
    let property_rows = properties
        .query_map(params_from_iter(item_ids.iter()), |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
            ))
        })
        .map_err(|error| format!("failed to query metadata selection properties: {error}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("failed to read metadata selection property: {error}"))?;
    for (item_id, property_key, normalized_value, value, source) in property_rows {
        property_projection.push((
            item_id,
            property_key.clone(),
            normalized_value.clone(),
            value.clone(),
            source.clone(),
        ));
        record_set_aggregate(
            property_builders.entry(property_key).or_default(),
            normalized_value,
            value,
            item_id,
            source,
            None,
            None,
        );
    }

    let mut property_catalog = conn
        .prepare(
            "SELECT property_key, normalized_value, MIN(value)
             FROM clipboard_item_properties
             WHERE property_key IN ('client', 'project', 'activity')
             GROUP BY property_key, normalized_value
             ORDER BY property_key ASC, normalized_value ASC",
        )
        .map_err(|error| format!("failed to prepare metadata property catalog: {error}"))?;
    let property_catalog_rows = property_catalog
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            ))
        })
        .map_err(|error| format!("failed to query metadata property catalog: {error}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("failed to read metadata property catalog: {error}"))?;
    for (property_key, normalized_value, value) in property_catalog_rows {
        property_builders
            .entry(property_key)
            .or_default()
            .entry(normalized_value)
            .or_insert_with(|| SetAggregateBuilder {
                label: value,
                item_ids: BTreeSet::new(),
                sources: BTreeMap::new(),
                tag_config: None,
            });
    }

    let title_values = scalars
        .iter()
        .map(|(_, title, _)| title.clone())
        .collect::<Vec<_>>();
    let notes_values = scalars
        .iter()
        .map(|(_, _, notes)| notes.clone())
        .collect::<Vec<_>>();
    let fingerprint = serde_json::to_vec(&MetadataFingerprintProjection {
        item_ids,
        scalars: &scalars,
        tags: &tag_projection,
        properties: &property_projection,
    })
    .map_err(|error| format!("failed to serialize metadata snapshot projection: {error}"))?;
    let snapshot_token = hash_text(
        std::str::from_utf8(&fingerprint)
            .map_err(|error| format!("metadata snapshot projection is not UTF-8: {error}"))?,
    );
    let mut property_aggregates = |key: &str| {
        finish_set_aggregates(
            property_builders.remove(key).unwrap_or_default(),
            item_ids.len(),
        )
    };
    let single_item = if item_ids.len() == 1 {
        let (_, content_kind, text) = &content[0];
        Some(MetadataSingleItem {
            content_preview: text.chars().take(HISTORY_PREVIEW_CHAR_LIMIT as usize).collect(),
            content_kind: content_kind.clone(),
            capture_context_events: capture_context_events_from_conn(
                conn,
                item_ids[0],
                METADATA_CAPTURE_EVENT_LIMIT,
            )?,
        })
    } else {
        None
    };

    Ok(MetadataSelectionSnapshot {
        item_ids: item_ids.to_vec(),
        item_count: item_ids.len(),
        snapshot_token,
        title: scalar_aggregate(&title_values),
        notes: scalar_aggregate(&notes_values),
        tags: finish_set_aggregates(tag_builders, item_ids.len()),
        properties: MetadataPropertyAggregates {
            client: property_aggregates("client"),
            project: property_aggregates("project"),
            activity: property_aggregates("activity"),
        },
        single_item,
    })
}

fn capture_context_events_from_conn(
    conn: &Connection,
    item_id: i64,
    limit: i64,
) -> Result<Vec<CaptureContextEvent>, String> {
    let mut statement = conn
        .prepare(
            "SELECT id, captured_at_unix_ms, source_kind, source_app_name, source_app_path,
                    source_process_id, source_window_id, source_window_title, content_kind,
                    mime_primary, clipboard_platform, clipboard_sequence_number,
                    clipboard_format_count, clipboard_formats_text, byte_size, text_char_count,
                    line_count, domain, scenario_id, scenario_session_id, scenario_revision
             FROM clipboard_item_capture_events
             WHERE item_id = ?1
             ORDER BY captured_at_unix_ms DESC, id DESC
             LIMIT ?2",
        )
        .map_err(|error| format!("failed to prepare capture context query: {error}"))?;
    let rows = statement
        .query_map(params![item_id, limit.clamp(1, 50)], |row| {
            Ok(CaptureContextEvent {
                id: row.get(0)?,
                captured_at_unix_ms: row.get(1)?,
                source_kind: row.get(2)?,
                source_app_name: row.get(3)?,
                source_app_path: row.get(4)?,
                source_process_id: row.get(5)?,
                source_window_id: row.get(6)?,
                source_window_title: row.get(7)?,
                content_kind: row.get(8)?,
                mime_primary: row.get(9)?,
                clipboard_platform: row.get(10)?,
                clipboard_sequence_number: row.get(11)?,
                clipboard_format_count: row.get(12)?,
                clipboard_formats_text: row.get(13)?,
                byte_size: row.get(14)?,
                text_char_count: row.get(15)?,
                line_count: row.get(16)?,
                domain: row.get(17)?,
                scenario_id: row.get(18)?,
                scenario_session_id: row.get(19)?,
                scenario_revision: row.get(20)?,
            })
        })
        .map_err(|error| format!("failed to query capture context: {error}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("failed to read capture context row: {error}"))
}

struct ItemBlobPaths {
    blob_path: Option<String>,
    thumbnail_path: Option<String>,
}

struct PruneOutcome {
    blob_paths: Vec<ItemBlobPaths>,
    removed_items: usize,
}

#[derive(PartialEq, Eq)]
struct ItemProjectionSignature {
    title: Option<String>,
    notes: Option<String>,
    tags: Option<String>,
    relation_labels: Vec<String>,
}

fn item_projection_signature(
    conn: &Connection,
    item_id: i64,
) -> Result<ItemProjectionSignature, String> {
    // Capture recency and event history are intentionally absent: a pure
    // recapture keeps Find stable, while visible metadata/tag changes do not.
    let (title, notes, tags) = conn
        .query_row(
            "SELECT title, notes, tags FROM clipboard_items WHERE id = ?1",
            params![item_id],
            |row| {
                Ok((
                    row.get::<_, Option<String>>(0)?,
                    row.get::<_, Option<String>>(1)?,
                    row.get::<_, Option<String>>(2)?,
                ))
            },
        )
        .map_err(|error| format!("failed to read Find projection signature: {error}"))?;
    Ok(ItemProjectionSignature {
        title,
        notes,
        tags,
        relation_labels: item_tag_labels(conn, item_id)?,
    })
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
                is_inbox: row.get::<_, i64>(22)? != 0,
                inbox_at_unix_ms: row.get(23)?,
                search_matches: Vec::new(),
            })
        })
        .map_err(|error| format!("failed to query clipboard history: {error}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("failed to read clipboard history row: {error}"))
}

fn attach_search_matches(
    conn: &Connection,
    items: &mut [HistoryItem],
    plan: &SearchPlanV1,
    include_content: bool,
) -> Result<(), String> {
    if items.is_empty() || !search_plan_has_positive_evidence(plan) {
        return Ok(());
    }
    let placeholders = vec!["?"; items.len()].join(",");
    let text_expr = if include_content { "NULL" } else { "text" };
    let sql = format!(
        "SELECT id, {text_expr}, title, notes, tags, mime_primary, content_kind,
                context_search_text
         FROM clipboard_items
         WHERE id IN ({placeholders})"
    );
    let ids = items.iter().map(|item| item.id).collect::<Vec<_>>();
    let index_by_id = items
        .iter()
        .enumerate()
        .map(|(index, item)| (item.id, index))
        .collect::<HashMap<_, _>>();
    let matcher = compile_search_evidence(plan)?;
    let mut statement = conn
        .prepare(&sql)
        .map_err(|error| format!("failed to prepare search evidence query: {error}"))?;
    let mut rows = statement
        .query(params_from_iter(ids.iter()))
        .map_err(|error| format!("failed to query search evidence: {error}"))?;
    while let Some(row) = rows
        .next()
        .map_err(|error| format!("failed to read search evidence row: {error}"))?
    {
        let id = row
            .get::<_, i64>(0)
            .map_err(|error| format!("failed to decode search evidence item id: {error}"))?;
        let Some(&index) = index_by_id.get(&id) else {
            continue;
        };
        let optional_text = |column| -> Result<Option<&str>, String> {
            let value = row
                .get_ref(column)
                .map_err(|error| format!("failed to decode search evidence field: {error}"))?;
            if matches!(value, ValueRef::Null) {
                Ok(None)
            } else {
                value
                    .as_str()
                    .map(Some)
                    .map_err(|error| format!("failed to decode search evidence text: {error}"))
            }
        };
        let content = if include_content {
            items[index].text.as_str()
        } else {
            optional_text(1)?.unwrap_or("")
        };
        let evidence = matcher.matches(
            content,
            optional_text(2)?,
            optional_text(3)?,
            optional_text(4)?,
            optional_text(5)?,
            optional_text(6)?.unwrap_or(""),
            optional_text(7)?,
        );
        items[index].search_matches = evidence;
    }
    Ok(())
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
            (
                SELECT COUNT(DISTINCT hierarchy_links.item_id)
                FROM clipboard_item_tags hierarchy_links
                JOIN tags hierarchy_tags ON hierarchy_tags.id = hierarchy_links.tag_id
                WHERE hierarchy_tags.slug = tags.slug
                   OR hierarchy_tags.slug LIKE tags.slug || '/%'
            ) AS item_count,
            COALESCE(tag_configs.auto_apply_enabled, 0) AS auto_apply_enabled
         FROM tags
         LEFT JOIN tag_configs ON tag_configs.tag_id = tags.id
         {filter_sql}
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
    // Installed slugs use ASCII folding only. Preserve non-ASCII case (É != é)
    // and hierarchy separators; changing Unicode identity requires collision review.
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

fn normalized_tag_labels_json(values: &[String]) -> Result<String, String> {
    let labels = normalize_tag_values(values)?
        .into_iter()
        .map(|(_, label)| label)
        .collect::<Vec<_>>();
    serde_json::to_string(&labels)
        .map_err(|error| format!("failed to encode capture tags: {error}"))
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

// Content edits must never reconstruct metadata from the compatibility cache.
fn update_item_text_from_conn(conn: &Connection, id: i64, text: &str) -> Result<(), String> {
    let text = normalize_text_for_storage(text);
    if text.is_empty() {
        return Err("clipboard item text cannot be empty".to_string());
    }
    let content_kind: String = conn
        .query_row(
            "SELECT content_kind FROM clipboard_items WHERE id = ?1",
            params![id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| format!("failed to read clipboard item: {error}"))?
        .ok_or_else(|| format!("clipboard item not found: {id}"))?;
    let next_hash = (content_kind == "text").then(|| hash_text(&text));
    if let Some(hash) = next_hash.as_deref() {
        let duplicate_id: Option<i64> = conn
            .query_row(
                "SELECT id FROM clipboard_items WHERE normalized_hash = ?1 AND id != ?2 LIMIT 1",
                params![hash, id],
                |row| row.get(0),
            )
            .optional()
            .map_err(|error| format!("failed to check duplicate clipboard item: {error}"))?;
        if let Some(duplicate_id) = duplicate_id {
            return Err(format!(
                "clipboard item text duplicates existing item: {duplicate_id}"
            ));
        }
    }
    conn.execute(
        "UPDATE clipboard_items SET text = ?1, normalized_hash = COALESCE(?2, normalized_hash)
         WHERE id = ?3",
        params![text, next_hash, id],
    )
    .map_err(|error| format!("failed to update clipboard item text: {error}"))?;
    Ok(())
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

fn add_item_tag_relation(
    conn: &Connection,
    item_id: i64,
    slug: &str,
    label: &str,
    source: &str,
    confidence: Option<f64>,
) -> Result<bool, String> {
    if source != "manual" && metadata_value_is_suppressed(conn, item_id, "tag", "", slug)? {
        return Ok(false);
    }
    if source == "manual" {
        clear_metadata_suppression(conn, item_id, "tag", "", slug)?;
    }

    let now = now_unix_ms();
    conn.execute(
        "INSERT INTO tags (slug, label, created_at_unix_ms, updated_at_unix_ms)
         VALUES (?1, ?2, ?3, ?3)
         ON CONFLICT(slug) DO NOTHING",
        params![slug, label, now],
    )
    .map_err(|error| format!("failed to upsert tag: {error}"))?;
    let tag_id = tag_id_by_slug(conn, slug)?;
    let existing_source = conn
        .query_row(
            "SELECT source FROM clipboard_item_tags WHERE item_id = ?1 AND tag_id = ?2",
            params![item_id, tag_id],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|error| format!("failed to inspect item tag source: {error}"))?;
    if let Some(existing_source) = existing_source {
        if metadata_source_rank(source) > metadata_source_rank(&existing_source) {
            conn.execute(
                "UPDATE clipboard_item_tags
                 SET source = ?1, confidence = ?2, created_at_unix_ms = ?3
                 WHERE item_id = ?4 AND tag_id = ?5",
                params![source, confidence, now, item_id, tag_id],
            )
            .map_err(|error| format!("failed to promote item tag source: {error}"))?;
        }
        return Ok(false);
    }

    conn.execute(
        "INSERT INTO clipboard_item_tags (
            item_id, tag_id, created_at_unix_ms, source, confidence
         ) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![item_id, tag_id, now, source, confidence],
    )
    .map_err(|error| format!("failed to link item tag: {error}"))?;
    Ok(true)
}

fn set_item_tags_from_values(
    conn: &Connection,
    item_id: i64,
    values: &[String],
) -> Result<(), String> {
    let normalized = normalize_tag_values(values)?;
    let desired_slugs = normalized
        .iter()
        .map(|(slug, _)| slug.as_str())
        .collect::<BTreeSet<_>>();
    let mut existing_statement = conn
        .prepare(
            "SELECT tags.slug, tags.label
             FROM clipboard_item_tags
             JOIN tags ON tags.id = clipboard_item_tags.tag_id
             WHERE clipboard_item_tags.item_id = ?1",
        )
        .map_err(|error| format!("failed to prepare existing item tags: {error}"))?;
    let existing = existing_statement
        .query_map(params![item_id], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|error| format!("failed to query existing item tags: {error}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("failed to read existing item tag: {error}"))?;
    drop(existing_statement);
    let existing_slugs = existing
        .iter()
        .map(|(slug, _)| slug.clone())
        .collect::<BTreeSet<_>>();
    for (slug, label) in &existing {
        if desired_slugs.contains(slug.as_str()) {
            continue;
        }
        suppress_metadata_value(conn, item_id, "tag", "", label, slug)?;
        let tag_id = tag_id_by_slug(conn, slug)?;
        conn.execute(
            "DELETE FROM clipboard_item_tags WHERE item_id = ?1 AND tag_id = ?2",
            params![item_id, tag_id],
        )
        .map_err(|error| format!("failed to remove item tag: {error}"))?;
    }

    for (slug, label) in &normalized {
        if existing_slugs.contains(slug) {
            continue;
        }
        add_item_tag_relation(conn, item_id, slug, label, "manual", None)?;
    }
    sync_legacy_tags_for_item(conn, item_id)
}

fn item_tag_labels(conn: &Connection, item_id: i64) -> Result<Vec<String>, String> {
    let mut statement = conn
        .prepare(
            "SELECT tags.label
             FROM clipboard_item_tags
             JOIN tags ON tags.id = clipboard_item_tags.tag_id
             WHERE clipboard_item_tags.item_id = ?1
             ORDER BY tags.label COLLATE NOCASE ASC, tags.id ASC",
        )
        .map_err(|error| format!("failed to prepare item tag labels: {error}"))?;
    let rows = statement
        .query_map(params![item_id], |row| row.get::<_, String>(0))
        .map_err(|error| format!("failed to query item tag labels: {error}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("failed to read item tag label row: {error}"))
}

fn sync_legacy_tags_for_item(conn: &Connection, item_id: i64) -> Result<(), String> {
    let labels = item_tag_labels(conn, item_id)?;
    conn.execute(
        "UPDATE clipboard_items SET tags = ?1 WHERE id = ?2",
        params![legacy_tag_string_from_labels(&labels), item_id],
    )
    .map_err(|error| format!("failed to update legacy tags after item sync: {error}"))?;
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
        sync_legacy_tags_for_item(conn, item_id)?;
    }
    Ok(())
}

fn metadata_source_rank(source: &str) -> u8 {
    match source {
        "manual" => 3,
        "scenario" | "context" => 2,
        _ => 1,
    }
}

fn normalized_metadata_value(value: &str) -> String {
    value.trim().to_lowercase()
}

fn normalize_metadata_values(values: &[String]) -> Result<Vec<String>, String> {
    let mut normalized = Vec::new();
    let mut seen = BTreeSet::new();
    for value in values {
        let value = value.trim();
        if value.is_empty() {
            continue;
        }
        if value.chars().count() > 160 {
            return Err("metadata values cannot exceed 160 characters".to_string());
        }
        let key = normalized_metadata_value(value);
        if seen.insert(key) {
            normalized.push(value.to_string());
        }
    }
    Ok(normalized)
}

fn normalize_scenario_properties(
    properties: &ScenarioProperties,
) -> Result<ScenarioProperties, String> {
    Ok(ScenarioProperties {
        client: normalize_metadata_values(&properties.client)?,
        project: normalize_metadata_values(&properties.project)?,
        activity: normalize_metadata_values(&properties.activity)?,
    })
}

fn metadata_value_is_suppressed(
    conn: &Connection,
    item_id: i64,
    metadata_kind: &str,
    metadata_key: &str,
    normalized_value: &str,
) -> Result<bool, String> {
    conn.query_row(
        "SELECT EXISTS(
            SELECT 1 FROM clipboard_item_metadata_suppressions
            WHERE item_id = ?1 AND metadata_kind = ?2 AND metadata_key = ?3
              AND normalized_value = ?4
        )",
        params![item_id, metadata_kind, metadata_key, normalized_value],
        |row| row.get::<_, bool>(0),
    )
    .map_err(|error| format!("failed to inspect metadata suppression: {error}"))
}

fn suppress_metadata_value(
    conn: &Connection,
    item_id: i64,
    metadata_kind: &str,
    metadata_key: &str,
    value: &str,
    normalized_value: &str,
) -> Result<(), String> {
    conn.execute(
        "INSERT INTO clipboard_item_metadata_suppressions (
            item_id, metadata_kind, metadata_key, value, normalized_value, created_at_unix_ms
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT(item_id, metadata_kind, metadata_key, normalized_value) DO UPDATE SET
            value = excluded.value,
            created_at_unix_ms = excluded.created_at_unix_ms",
        params![
            item_id,
            metadata_kind,
            metadata_key,
            value,
            normalized_value,
            now_unix_ms()
        ],
    )
    .map_err(|error| format!("failed to suppress metadata value: {error}"))?;
    Ok(())
}

fn clear_metadata_suppression(
    conn: &Connection,
    item_id: i64,
    metadata_kind: &str,
    metadata_key: &str,
    normalized_value: &str,
) -> Result<(), String> {
    conn.execute(
        "DELETE FROM clipboard_item_metadata_suppressions
         WHERE item_id = ?1 AND metadata_kind = ?2 AND metadata_key = ?3
           AND normalized_value = ?4",
        params![item_id, metadata_kind, metadata_key, normalized_value],
    )
    .map_err(|error| format!("failed to restore metadata value: {error}"))?;
    Ok(())
}

fn add_item_property(
    conn: &Connection,
    item_id: i64,
    property_key: &str,
    value: &str,
    source: &str,
) -> Result<bool, String> {
    let normalized_value = normalized_metadata_value(value);
    if source != "manual"
        && metadata_value_is_suppressed(conn, item_id, "property", property_key, &normalized_value)?
    {
        return Ok(false);
    }
    if source == "manual" {
        clear_metadata_suppression(conn, item_id, "property", property_key, &normalized_value)?;
    }
    let existing_source = conn
        .query_row(
            "SELECT source FROM clipboard_item_properties
             WHERE item_id = ?1 AND property_key = ?2 AND normalized_value = ?3",
            params![item_id, property_key, normalized_value],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|error| format!("failed to inspect item property source: {error}"))?;
    let now = now_unix_ms();
    if let Some(existing_source) = existing_source {
        if metadata_source_rank(source) > metadata_source_rank(&existing_source) {
            conn.execute(
                "UPDATE clipboard_item_properties
                 SET value = ?1, source = ?2, updated_at_unix_ms = ?3
                 WHERE item_id = ?4 AND property_key = ?5 AND normalized_value = ?6",
                params![value, source, now, item_id, property_key, normalized_value],
            )
            .map_err(|error| format!("failed to promote item property source: {error}"))?;
        }
        return Ok(false);
    }
    conn.execute(
        "INSERT INTO clipboard_item_properties (
            item_id, property_key, value, normalized_value, source,
            created_at_unix_ms, updated_at_unix_ms
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)",
        params![item_id, property_key, value, normalized_value, source, now],
    )
    .map_err(|error| format!("failed to add item property: {error}"))?;
    Ok(true)
}

fn replace_item_property_values(
    conn: &Connection,
    item_id: i64,
    property_key: &str,
    values: &[String],
) -> Result<(), String> {
    let normalized = normalize_metadata_values(values)?;
    let desired = normalized
        .iter()
        .map(|value| normalized_metadata_value(value))
        .collect::<BTreeSet<_>>();
    let mut statement = conn
        .prepare(
            "SELECT value, normalized_value FROM clipboard_item_properties
             WHERE item_id = ?1 AND property_key = ?2",
        )
        .map_err(|error| format!("failed to prepare existing item properties: {error}"))?;
    let existing = statement
        .query_map(params![item_id, property_key], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|error| format!("failed to query existing item properties: {error}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("failed to read existing item property: {error}"))?;
    drop(statement);
    let existing_normalized = existing
        .iter()
        .map(|(_, normalized_value)| normalized_value.clone())
        .collect::<BTreeSet<_>>();
    for (value, normalized_value) in &existing {
        if desired.contains(normalized_value) {
            continue;
        }
        suppress_metadata_value(
            conn,
            item_id,
            "property",
            property_key,
            value,
            normalized_value,
        )?;
        conn.execute(
            "DELETE FROM clipboard_item_properties
             WHERE item_id = ?1 AND property_key = ?2 AND normalized_value = ?3",
            params![item_id, property_key, normalized_value],
        )
        .map_err(|error| format!("failed to remove item property: {error}"))?;
    }
    for value in normalized {
        if existing_normalized.contains(&normalized_metadata_value(&value)) {
            continue;
        }
        add_item_property(conn, item_id, property_key, &value, "manual")?;
    }
    Ok(())
}

fn item_tag_entries(conn: &Connection, item_id: i64) -> Result<Vec<MetadataTagEntry>, String> {
    let mut statement = conn
        .prepare(
            "SELECT tags.label, clipboard_item_tags.source, clipboard_item_tags.confidence
             FROM clipboard_item_tags
             JOIN tags ON tags.id = clipboard_item_tags.tag_id
             WHERE clipboard_item_tags.item_id = ?1
             ORDER BY tags.label COLLATE NOCASE ASC, tags.id ASC",
        )
        .map_err(|error| format!("failed to prepare item tag entries: {error}"))?;
    let rows = statement
        .query_map(params![item_id], |row| {
            Ok(MetadataTagEntry {
                value: row.get(0)?,
                source: row.get(1)?,
                confidence: row.get(2)?,
            })
        })
        .map_err(|error| format!("failed to query item tag entries: {error}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("failed to read item tag entry row: {error}"))
}

fn item_property_entries(
    conn: &Connection,
    item_id: i64,
) -> Result<Vec<MetadataPropertyEntry>, String> {
    let mut statement = conn
        .prepare(
            "SELECT property_key, value, source FROM clipboard_item_properties
             WHERE item_id = ?1
             ORDER BY property_key ASC, value COLLATE NOCASE ASC",
        )
        .map_err(|error| format!("failed to prepare item property entries: {error}"))?;
    let rows = statement
        .query_map(params![item_id], |row| {
            Ok(MetadataPropertyEntry {
                key: row.get(0)?,
                value: row.get(1)?,
                source: row.get(2)?,
            })
        })
        .map_err(|error| format!("failed to query item property entries: {error}"))?;
    let entries = rows
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("failed to read item property entry row: {error}"))?;
    Ok(entries
        .into_iter()
        .filter(|entry| matches!(entry.key.as_str(), "client" | "project" | "activity"))
        .collect())
}

fn scenario_properties_for_item(
    conn: &Connection,
    item_id: i64,
) -> Result<ScenarioProperties, String> {
    let mut properties = ScenarioProperties::default();
    let mut statement = conn
        .prepare(
            "SELECT property_key, value FROM clipboard_item_properties
             WHERE item_id = ?1
             ORDER BY property_key ASC, value COLLATE NOCASE ASC",
        )
        .map_err(|error| format!("failed to prepare item properties query: {error}"))?;
    let rows = statement
        .query_map(params![item_id], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|error| format!("failed to query item properties: {error}"))?;
    for row in rows {
        let (key, value) = row.map_err(|error| format!("failed to read item property: {error}"))?;
        match key.as_str() {
            "client" => properties.client.push(value),
            "project" => properties.project.push(value),
            "activity" => properties.activity.push(value),
            _ => {}
        }
    }
    Ok(properties)
}

fn apply_scenario_patch(
    conn: &Connection,
    item_id: i64,
    scenario: &ActiveScenarioSession,
) -> Result<(), String> {
    for value in &scenario.properties.client {
        add_item_property(conn, item_id, "client", value, "scenario")?;
    }
    for value in &scenario.properties.project {
        add_item_property(conn, item_id, "project", value, "scenario")?;
    }
    for value in &scenario.properties.activity {
        add_item_property(conn, item_id, "activity", value, "scenario")?;
    }
    let tags = normalize_tag_values(&scenario.tags)?;
    for (slug, label) in tags {
        add_item_tag_relation(conn, item_id, &slug, &label, "scenario", None)?;
    }
    if !scenario.tags.is_empty() {
        sync_legacy_tags_for_item(conn, item_id)?;
    }
    Ok(())
}

// All writers call this inside their capture transaction. The result tells Find
// that existing result membership may have shrunk even without editable changes.
fn record_capture_event(
    conn: &Connection,
    item_id: i64,
    captured_at_unix_ms: i64,
    content_kind: &str,
    mime_primary: Option<&str>,
    byte_size: Option<i64>,
    text_char_count: Option<i64>,
    line_count: Option<i64>,
    domain: Option<&str>,
    capture_context: Option<&CaptureContext>,
    active_scenario: Option<&ActiveScenarioSession>,
) -> Result<bool, String> {
    let fallback_context;
    let context = if let Some(context) = capture_context {
        context
    } else {
        fallback_context = CaptureContext {
            source_kind: "clipboard".to_string(),
            ..CaptureContext::default()
        };
        &fallback_context
    };
    let source_kind = normalize_source_kind(&context.source_kind);
    let formats_text = clipboard_formats_text(&context.clipboard_formats);
    let formats_json =
        serde_json::to_string(&context.clipboard_formats).unwrap_or_else(|_| "[]".to_string());
    let event_json = serde_json::to_string(context)
        .map_err(|error| format!("failed to serialize capture context: {error}"))?;
    let scenario_snapshot_json = active_scenario
        .map(serde_json::to_string)
        .transpose()
        .map_err(|error| format!("failed to serialize scenario snapshot: {error}"))?;

    conn.execute(
        "INSERT INTO clipboard_item_capture_events (
            item_id,
            captured_at_unix_ms,
            source_kind,
            source_app_name,
            source_app_path,
            source_process_id,
            source_window_id,
            source_window_title,
            content_kind,
            mime_primary,
            clipboard_platform,
            clipboard_sequence_number,
            clipboard_format_count,
            clipboard_formats_text,
            clipboard_formats_json,
            byte_size,
            text_char_count,
            line_count,
            domain,
            event_json,
            scenario_id,
            scenario_session_id,
            scenario_revision,
            scenario_snapshot_json
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24)",
        params![
            item_id,
            captured_at_unix_ms,
            source_kind,
            context.source_app_name.as_deref(),
            context.source_app_path.as_deref(),
            context.source_process_id,
            context.source_window_id,
            context.source_window_title.as_deref(),
            content_kind,
            mime_primary,
            context.clipboard_platform.as_deref(),
            context.clipboard_sequence_number,
            context.clipboard_format_count,
            formats_text.as_str(),
            formats_json.as_str(),
            byte_size,
            text_char_count,
            line_count,
            domain,
            event_json.as_str(),
            active_scenario.map(|scenario| scenario.scenario_id),
            active_scenario.map(|scenario| scenario.session_id.as_str()),
            active_scenario.map(|scenario| scenario.scenario_revision),
            scenario_snapshot_json.as_deref()
        ],
    )
    .map_err(|error| format!("failed to insert capture context: {error}"))?;

    let removed = conn
        .execute(
            "DELETE FROM clipboard_item_capture_events
         WHERE item_id = ?1 AND id NOT IN (
             SELECT id FROM clipboard_item_capture_events WHERE item_id = ?1
             ORDER BY captured_at_unix_ms DESC, id DESC LIMIT 3
         )",
            params![item_id],
        )
        .map_err(|error| format!("failed to prune capture context: {error}"))?;

    // Rebuild from authoritative columns, not accumulated text or event JSON.
    // The same timestamp/ID order is used by retention and the metadata reader.
    let mut statement = conn
        .prepare(
            "SELECT captured_at_unix_ms, content_kind, mime_primary, byte_size,
                text_char_count, line_count, domain, source_kind, source_app_name,
                source_app_path, source_process_id, source_window_id,
                source_window_title, clipboard_platform, clipboard_sequence_number,
                clipboard_format_count, COALESCE(clipboard_formats_text, '')
         FROM clipboard_item_capture_events WHERE item_id = ?1
         ORDER BY captured_at_unix_ms DESC, id DESC",
        )
        .map_err(|error| format!("failed to prepare retained capture context: {error}"))?;
    let rows = statement
        .query_map(params![item_id], |row| {
            let context = CaptureContext {
                source_kind: row.get(7)?,
                source_app_name: row.get(8)?,
                source_app_path: row.get(9)?,
                source_process_id: row.get(10)?,
                source_window_id: row.get(11)?,
                source_window_title: row.get(12)?,
                clipboard_platform: row.get(13)?,
                clipboard_sequence_number: row.get(14)?,
                clipboard_format_count: row.get(15)?,
                ..CaptureContext::default()
            };
            Ok(capture_context_search_text(
                row.get(0)?,
                &row.get::<_, String>(1)?,
                row.get::<_, Option<String>>(2)?.as_deref(),
                row.get(3)?,
                row.get(4)?,
                row.get(5)?,
                row.get::<_, Option<String>>(6)?.as_deref(),
                &context,
                &row.get::<_, String>(16)?,
            ))
        })
        .map_err(|error| format!("failed to query retained capture context: {error}"))?;
    let mut next_context_text = String::new();
    for row in rows {
        let text =
            row.map_err(|error| format!("failed to read retained capture context: {error}"))?;
        if !next_context_text.is_empty() {
            next_context_text.push(' ');
        }
        next_context_text.push_str(&text);
    }
    conn.execute(
        "UPDATE clipboard_items
         SET context_search_text = ?1
         WHERE id = ?2",
        params![next_context_text, item_id],
    )
    .map_err(|error| format!("failed to update capture context search text: {error}"))?;

    Ok(removed > 0)
}

fn normalize_source_kind(source_kind: &str) -> &str {
    match source_kind.trim() {
        "" => "clipboard",
        value => value,
    }
}

fn clipboard_formats_text(formats: &[CaptureFormatContext]) -> String {
    formats
        .iter()
        .flat_map(|format| [format.name.as_str(), format.kind.as_str()])
        .filter(|value| !value.trim().is_empty())
        .collect::<Vec<_>>()
        .join(" ")
}

#[allow(clippy::too_many_arguments)]
fn capture_context_search_text(
    captured_at_unix_ms: i64,
    content_kind: &str,
    mime_primary: Option<&str>,
    byte_size: Option<i64>,
    text_char_count: Option<i64>,
    line_count: Option<i64>,
    domain: Option<&str>,
    context: &CaptureContext,
    formats_text: &str,
) -> String {
    let mut parts = vec![
        normalize_source_kind(&context.source_kind).to_string(),
        content_kind.to_string(),
        captured_at_unix_ms.to_string(),
    ];
    parts.extend(context.source_app_name.clone());
    parts.extend(context.source_app_path.clone());
    parts.extend(context.source_process_id.map(|value| value.to_string()));
    parts.extend(context.source_window_id.map(|value| value.to_string()));
    parts.extend(context.source_window_title.clone());
    parts.extend(context.clipboard_platform.clone());
    parts.extend(
        context
            .clipboard_sequence_number
            .map(|value| value.to_string()),
    );
    parts.extend(
        context
            .clipboard_format_count
            .map(|value| value.to_string()),
    );
    parts.extend(mime_primary.map(str::to_string));
    parts.extend(byte_size.map(|value| value.to_string()));
    parts.extend(text_char_count.map(|value| value.to_string()));
    parts.extend(line_count.map(|value| value.to_string()));
    parts.extend(domain.map(str::to_string));
    if !formats_text.trim().is_empty() {
        parts.push(formats_text.to_string());
    }
    parts.join(" ")
}

fn first_url_domain(text: &str) -> Option<String> {
    text.split_whitespace().find_map(|token| {
        token_domain(token.trim_matches(|ch: char| {
            matches!(
                ch,
                '<' | '>' | '(' | ')' | '[' | ']' | '{' | '}' | '"' | '\'' | ',' | ';'
            )
        }))
    })
}

fn token_domain(token: &str) -> Option<String> {
    let rest = token
        .strip_prefix("https://")
        .or_else(|| token.strip_prefix("http://"))?;
    let domain = rest
        .split(['/', '?', '#', ':'])
        .next()
        .unwrap_or("")
        .trim()
        .to_ascii_lowercase();
    (!domain.is_empty()).then_some(domain)
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

fn append_optional_notes(existing: Option<String>, addition: Option<String>) -> Option<String> {
    match (existing, addition) {
        (None, None) => None,
        (Some(existing), None) | (None, Some(existing)) => Some(existing),
        (Some(existing), Some(addition)) => {
            if existing.lines().any(|line| line.trim() == addition.trim()) {
                Some(existing)
            } else {
                Some(format!("{existing}\n{addition}"))
            }
        }
    }
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

fn saved_history_view_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<SavedHistoryView> {
    let capture_tags_json = row.get::<_, String>(7)?;
    let capture_tags = serde_json::from_str(&capture_tags_json).map_err(|error| {
        rusqlite::Error::FromSqlConversionFailure(7, Type::Text, Box::new(error))
    })?;
    Ok(SavedHistoryView {
        id: row.get(0)?,
        title: row.get(1)?,
        query: row.get(2)?,
        open_mode: row.get(3)?,
        hotkey: row.get(4)?,
        pinned: row.get::<_, i64>(5)? != 0,
        sort_order: row.get(6)?,
        capture_tags,
        created_at_unix_ms: row.get(8)?,
        updated_at_unix_ms: row.get(9)?,
    })
}

fn scenario_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Scenario> {
    let decode = |index: usize| -> rusqlite::Result<Vec<String>> {
        let json = row.get::<_, String>(index)?;
        serde_json::from_str(&json).map_err(|error| {
            rusqlite::Error::FromSqlConversionFailure(index, Type::Text, Box::new(error))
        })
    };
    Ok(Scenario {
        id: row.get(0)?,
        name: row.get(1)?,
        query: row.get(2)?,
        revision: row.get(3)?,
        properties: ScenarioProperties {
            client: decode(4)?,
            project: decode(5)?,
            activity: decode(6)?,
        },
        tags: decode(7)?,
        created_at_unix_ms: row.get(8)?,
        updated_at_unix_ms: row.get(9)?,
    })
}

fn encode_values(values: &[String]) -> Result<String, String> {
    serde_json::to_string(values)
        .map_err(|error| format!("failed to encode metadata values: {error}"))
}

fn validate_scenario_name(name: &str) -> Result<String, String> {
    let name = name.trim();
    if name.is_empty() {
        return Err("scenario name is required".to_string());
    }
    if name.chars().count() > 120 {
        return Err("scenario name cannot exceed 120 characters".to_string());
    }
    Ok(name.to_string())
}

fn validate_scenario_query(query: &str) -> Result<(), String> {
    if search_query_explanation(query.trim())
        .diagnostics
        .iter()
        .any(|diagnostic| diagnostic.severity == "error")
    {
        return Err("invalid scenario query".to_string());
    }
    Ok(())
}

fn validate_saved_history_view(title: &str, query: &str) -> Result<(), String> {
    if title.trim().is_empty() {
        return Err("saved history view title is required".to_string());
    }
    if search_query_explanation(query.trim())
        .diagnostics
        .iter()
        .any(|diagnostic| diagnostic.severity == "error")
    {
        return Err("invalid saved history view query".to_string());
    }
    Ok(())
}

fn persist_settings_to_conn(conn: &Connection, settings: &AppSettings) -> Result<(), String> {
    let value_json = serde_json::to_string(settings)
        .map_err(|error| format!("failed to encode settings: {error}"))?;
    conn.execute(
        "INSERT INTO app_settings (key, value_json, updated_at_unix_ms)
         VALUES (?1, ?2, ?3)
         ON CONFLICT(key) DO UPDATE SET
            value_json = excluded.value_json,
            updated_at_unix_ms = excluded.updated_at_unix_ms",
        params![APP_SETTINGS_KEY, value_json, now_unix_ms()],
    )
    .map_err(|error| format!("failed to persist settings: {error}"))?;
    Ok(())
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
    if settings.picker.search_trigger_mode == SearchTriggerMode::Manual {
        settings.picker.search_trigger_mode = SearchTriggerMode::Enter;
    }
    normalize_default_search_scopes(&mut settings.picker);
    let legacy_vscode_path = settings.tray.vscode_path.trim();
    let scripts_vscode_path = settings.scripts.vscode_path.trim();
    if scripts_vscode_path.is_empty() && !legacy_vscode_path.is_empty() {
        settings.scripts.vscode_path = legacy_vscode_path.to_string();
    } else {
        settings.scripts.vscode_path = scripts_vscode_path.to_string();
    }
    settings.tray.vscode_path.clear();
    settings.scripts.folder_path = settings.scripts.folder_path.trim().to_string();
    settings.general.paste_next_shortcut = settings.general.paste_next_shortcut.trim().to_string();
    settings.picker.pin_toggle_shortcut = settings.picker.pin_toggle_shortcut.trim().to_string();
    settings.picker.settings_shortcut = settings.picker.settings_shortcut.trim().to_string();
    settings.picker.external_editor_shortcut =
        settings.picker.external_editor_shortcut.trim().to_string();
    settings.editor.external_editor_path = settings.editor.external_editor_path.trim().to_string();
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
    settings.ai.api_key = settings.ai.api_key.trim().to_string();
}

fn normalize_default_search_scopes(picker: &mut PickerSettings) {
    if picker.default_search_scopes.len() > 1 {
        picker
            .default_search_scopes
            .retain(|scope| *scope != SearchDefaultScope::All);
    }
    if picker.default_search_scopes.is_empty() {
        picker.default_search_scopes = default_search_scopes();
    }
    picker.default_search_scopes.dedup();
    let mut unique_excluded_scopes =
        Vec::with_capacity(picker.default_excluded_search_scopes.len());
    for scope in picker.default_excluded_search_scopes.drain(..) {
        if !unique_excluded_scopes.contains(&scope) {
            unique_excluded_scopes.push(scope);
        }
    }
    picker.default_excluded_search_scopes = unique_excluded_scopes;
}

fn retention_limit_from_conn(conn: &Connection) -> i64 {
    settings_from_conn(conn)
        .map(|settings| settings.history.retention_count)
        .unwrap_or(UNLIMITED_HISTORY_LIMIT)
}

fn prune_history_from_conn(conn: &Connection) -> Result<PruneOutcome, String> {
    let limit = retention_limit_from_conn(conn);
    if limit == UNLIMITED_HISTORY_LIMIT {
        return Ok(PruneOutcome {
            blob_paths: Vec::new(),
            removed_items: 0,
        });
    }

    let removed_items = conn
        .query_row(
            "SELECT COUNT(*) FROM clipboard_items
             WHERE id NOT IN (
                SELECT id FROM clipboard_items WHERE is_inbox != 0
                UNION ALL
                SELECT id FROM (
                    SELECT id FROM clipboard_items
                    WHERE is_inbox = 0
                    ORDER BY COALESCE(last_copied_at_unix_ms, created_at_unix_ms) DESC, id DESC
                    LIMIT ?1
                )
             )",
            params![limit],
            |row| row.get::<_, i64>(0),
        )
        .map_err(|error| format!("failed to count pruned clipboard history: {error}"))?
        as usize;
    let pruned_blobs = pruned_blob_paths_from_conn(conn, limit)?;

    conn.execute(
        "DELETE FROM clipboard_item_tags
         WHERE item_id NOT IN (
            SELECT id FROM clipboard_items WHERE is_inbox != 0
            UNION ALL
            SELECT id FROM (
                SELECT id FROM clipboard_items
                WHERE is_inbox = 0
                ORDER BY COALESCE(last_copied_at_unix_ms, created_at_unix_ms) DESC, id DESC
                LIMIT ?1
            )
         )",
        params![limit],
    )
    .map_err(|error| format!("failed to prune clipboard item tags: {error}"))?;

    conn.execute(
        "DELETE FROM clipboard_items
         WHERE id NOT IN (
            SELECT id FROM clipboard_items WHERE is_inbox != 0
            UNION ALL
            SELECT id FROM (
                SELECT id FROM clipboard_items
                WHERE is_inbox = 0
                ORDER BY COALESCE(last_copied_at_unix_ms, created_at_unix_ms) DESC, id DESC
                LIMIT ?1
            )
         )",
        params![limit],
    )
    .map_err(|error| format!("failed to prune clipboard history: {error}"))?;

    Ok(PruneOutcome {
        blob_paths: pruned_blobs,
        removed_items,
    })
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
                SELECT id FROM clipboard_items WHERE is_inbox != 0
                UNION ALL
                SELECT id FROM (
                    SELECT id FROM clipboard_items
                    WHERE is_inbox = 0
                    ORDER BY COALESCE(last_copied_at_unix_ms, created_at_unix_ms) DESC, id DESC
                    LIMIT ?1
                )
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
    let paste_next =
        crate::hotkeys::HotkeySequence::parse(settings.general.paste_next_shortcut.trim())
            .map_err(|error| format!("invalid paste next shortcut: {error}"))?;
    if !paste_next.is_simple() {
        return Err("paste next shortcut must be a single shortcut, not a sequence".to_string());
    }
    if !(15..=1440).contains(&settings.auto_update.check_interval_minutes) {
        return Err("auto-update check interval must be between 15 and 1440 minutes".to_string());
    }
    if contains_hotkey_sequence_delimiter(&settings.picker.pin_toggle_shortcut) {
        return Err("pin toggle shortcut must be a single shortcut".to_string());
    }
    if contains_hotkey_sequence_delimiter(&settings.picker.settings_shortcut) {
        return Err("settings shortcut must be a single shortcut".to_string());
    }
    if settings.picker.preview_shortcut.trim().is_empty() {
        return Err("preview shortcut cannot be empty".to_string());
    }
    if contains_hotkey_sequence_delimiter(&settings.picker.preview_shortcut) {
        return Err("preview shortcut must be a single shortcut".to_string());
    }
    if !(11..=20).contains(&settings.editor.font_size) {
        return Err("editor font size must be between 11 and 20".to_string());
    }
    if !matches!(settings.editor.tab_size, 2 | 4 | 8) {
        return Err("editor tab size must be 2, 4, or 8".to_string());
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

fn contains_hotkey_sequence_delimiter(shortcut: &str) -> bool {
    shortcut.char_indices().any(|(index, character)| {
        character == ','
            && shortcut[index + character.len_utf8()..]
                .chars()
                .next()
                .is_some_and(char::is_whitespace)
    })
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

    fn untouched_metadata_intent(
        item_ids: Vec<i64>,
        expected_snapshot_token: String,
    ) -> MetadataSelectionIntent {
        MetadataSelectionIntent {
            item_ids,
            expected_snapshot_token,
            title: ScalarIntent::Untouched,
            notes: NotesIntent::Untouched,
            tags: Vec::new(),
            properties: MetadataPropertyIntents::default(),
        }
    }

    #[test]
    fn metadata_selection_snapshot_aggregates_normalized_rows_and_single_facts() {
        let storage = test_storage_with_migrations();
        insert_test_text_item(&storage, 2, 10_002, "second");
        insert_test_text_item(&storage, 1, 10_001, "first");
        insert_test_text_item(&storage, 3, 10_003, "catalog only");
        {
            let conn = storage.conn.lock().unwrap();
            conn.execute(
                "UPDATE clipboard_items SET title = 'Shared', notes = 'one' WHERE id = 1",
                [],
            )
            .unwrap();
            conn.execute(
                "UPDATE clipboard_items SET title = 'Shared', notes = 'two' WHERE id = 2",
                [],
            )
            .unwrap();
            add_item_tag_relation(&conn, 1, "work", "Work", "scenario", Some(0.7)).unwrap();
            add_item_tag_relation(&conn, 2, "work", "Work", "manual", None).unwrap();
            add_item_tag_relation(&conn, 1, "partial", "Partial", "context", Some(0.4)).unwrap();
            add_item_property(&conn, 1, "client", "Acme", "scenario").unwrap();
            add_item_property(&conn, 2, "client", "Acme", "manual").unwrap();
            add_item_property(&conn, 3, "project", "Launch", "manual").unwrap();
        }

        let snapshot = storage
            .get_metadata_selection_snapshot(MetadataSelectionRequest {
                item_ids: vec![2, 1, 2],
            })
            .unwrap();
        assert_eq!(snapshot.item_ids, vec![1, 2]);
        assert_eq!(snapshot.item_count, 2);
        assert_eq!(snapshot.title.state, ScalarAggregateState::Same);
        assert_eq!(snapshot.title.value.as_deref(), Some("Shared"));
        assert_eq!(snapshot.notes.state, ScalarAggregateState::Mixed);
        assert!(snapshot.single_item.is_none());
        let work = snapshot.tags.iter().find(|tag| tag.key == "work").unwrap();
        assert_eq!(work.presence, MetadataPresence::All);
        assert_eq!(work.present_count, 2);
        assert_eq!(work.sources.len(), 2);
        let partial = snapshot
            .tags
            .iter()
            .find(|tag| tag.key == "partial")
            .unwrap();
        assert_eq!(partial.presence, MetadataPresence::Some);
        assert_eq!(snapshot.properties.client[0].presence, MetadataPresence::All);
        let absent_project = snapshot
            .properties
            .project
            .iter()
            .find(|property| property.key == "launch")
            .unwrap();
        assert_eq!(absent_project.presence, MetadataPresence::None);
        assert_eq!(absent_project.present_count, 0);

        let original_token = snapshot.snapshot_token.clone();
        storage
            .conn
            .lock()
            .unwrap()
            .execute(
                "UPDATE clipboard_item_properties SET value = 'ACME' WHERE item_id = 1 AND property_key = 'client'",
                [],
            )
            .unwrap();
        let relabeled = storage
            .get_metadata_selection_snapshot(MetadataSelectionRequest {
                item_ids: vec![1, 2],
            })
            .unwrap();
        assert_ne!(relabeled.snapshot_token, original_token);

        let single = storage
            .get_metadata_selection_snapshot(MetadataSelectionRequest { item_ids: vec![1] })
            .unwrap()
            .single_item
            .unwrap();
        assert_eq!(single.content_preview, "first");
        assert_eq!(single.content_kind, "text");
        assert_eq!(single.capture_context_events.len(), 0);
    }

    #[test]
    fn metadata_selection_stale_token_and_write_failure_leave_zero_writes() {
        let storage = test_storage_with_migrations();
        insert_test_text_item(&storage, 1, 10_001, "first");
        let snapshot = storage
            .get_metadata_selection_snapshot(MetadataSelectionRequest { item_ids: vec![1] })
            .unwrap();
        storage
            .conn
            .lock()
            .unwrap()
            .execute("UPDATE clipboard_items SET notes = 'external' WHERE id = 1", [])
            .unwrap();
        let mut stale = untouched_metadata_intent(vec![1], snapshot.snapshot_token);
        stale.title = ScalarIntent::Set {
            value: "should roll back".into(),
        };
        stale.tags = vec![SetValueIntent {
            key: "new".into(),
            op: SetValueIntentOp::Add,
        }];
        let error = storage.apply_metadata_selection_intent(stale).unwrap_err();
        assert!(error.contains(METADATA_SNAPSHOT_STALE));
        assert_eq!(storage.get_item(1).unwrap().title, None);
        assert!(storage.get_item_tag_entries(1).unwrap().is_empty());

        let snapshot = storage
            .get_metadata_selection_snapshot(MetadataSelectionRequest { item_ids: vec![1] })
            .unwrap();
        storage
            .conn
            .lock()
            .unwrap()
            .execute_batch(
                "CREATE TRIGGER reject_property BEFORE INSERT ON clipboard_item_properties
                 BEGIN SELECT RAISE(ABORT, 'synthetic property failure'); END;",
            )
            .unwrap();
        let mut failing = untouched_metadata_intent(vec![1], snapshot.snapshot_token);
        failing.title = ScalarIntent::Set {
            value: "also rolls back".into(),
        };
        failing.properties.client = vec![SetValueIntent {
            key: "Acme".into(),
            op: SetValueIntentOp::Add,
        }];
        assert!(storage.apply_metadata_selection_intent(failing).is_err());
        assert_eq!(storage.get_item(1).unwrap().title, None);
        assert!(storage.list_item_property_entries(1).unwrap().is_empty());
    }

    #[test]
    fn metadata_selection_add_preserves_present_provenance_and_fills_absent_items() {
        let storage = test_storage_with_migrations();
        insert_test_text_item(&storage, 1, 10_001, "first");
        insert_test_text_item(&storage, 2, 10_002, "second");
        {
            let conn = storage.conn.lock().unwrap();
            add_item_tag_relation(&conn, 1, "work", "Work", "scenario", Some(0.8)).unwrap();
            suppress_metadata_value(&conn, 2, "tag", "", "Work", "work").unwrap();
        }
        let snapshot = storage
            .get_metadata_selection_snapshot(MetadataSelectionRequest {
                item_ids: vec![1, 2],
            })
            .unwrap();
        let mut intent = untouched_metadata_intent(vec![2, 1], snapshot.snapshot_token);
        intent.tags = vec![SetValueIntent {
            key: "work".into(),
            op: SetValueIntentOp::Add,
        }];
        let result = storage.apply_metadata_selection_intent(intent).unwrap();
        assert_eq!(result.changed_item_count, 1);
        assert_eq!(result.tag_relation_changes, 1);
        let first = storage.get_item_tag_entries(1).unwrap();
        assert_eq!(first[0].source, "scenario");
        assert_eq!(first[0].confidence, Some(0.8));
        let second = storage.get_item_tag_entries(2).unwrap();
        assert_eq!(second[0].source, "manual");
        let conn = storage.conn.lock().unwrap();
        assert!(!metadata_value_is_suppressed(&conn, 2, "tag", "", "work").unwrap());
    }

    #[test]
    fn metadata_selection_remove_all_and_some_suppress_only_existing_relations() {
        let storage = test_storage_with_migrations();
        for id in 1..=3 {
            insert_test_text_item(&storage, id, 10_000 + id, &format!("item {id}"));
        }
        {
            let conn = storage.conn.lock().unwrap();
            for id in 1..=3 {
                add_item_tag_relation(&conn, id, "all", "All", "manual", None).unwrap();
            }
            add_item_tag_relation(&conn, 1, "some", "Some", "scenario", None).unwrap();
            add_item_tag_relation(&conn, 2, "some", "Some", "context", None).unwrap();
        }
        let snapshot = storage
            .get_metadata_selection_snapshot(MetadataSelectionRequest {
                item_ids: vec![1, 2, 3],
            })
            .unwrap();
        let mut intent =
            untouched_metadata_intent(vec![1, 2, 3], snapshot.snapshot_token);
        intent.tags = vec![
            SetValueIntent {
                key: "all".into(),
                op: SetValueIntentOp::Remove,
            },
            SetValueIntent {
                key: "some".into(),
                op: SetValueIntentOp::Remove,
            },
        ];
        let result = storage.apply_metadata_selection_intent(intent).unwrap();
        assert_eq!(result.tag_relation_changes, 5);
        let conn = storage.conn.lock().unwrap();
        for id in 1..=3 {
            assert!(metadata_value_is_suppressed(&conn, id, "tag", "", "all").unwrap());
        }
        assert!(metadata_value_is_suppressed(&conn, 1, "tag", "", "some").unwrap());
        assert!(metadata_value_is_suppressed(&conn, 2, "tag", "", "some").unwrap());
        assert!(!metadata_value_is_suppressed(&conn, 3, "tag", "", "some").unwrap());
    }

    #[test]
    fn create_history_item_request_accepts_structured_tags() {
        let request: CreateHistoryItemRequest = serde_json::from_value(serde_json::json!({
            "text": "synthetic",
            "title": null,
            "notes": null,
            "tags": ["synthetic", "work/project"],
            "properties": {
                "client": ["Orca"],
                "project": [],
                "activity": []
            },
            "mimePrimary": "text/plain"
        }))
        .unwrap();
        assert_eq!(request.tags, vec!["synthetic", "work/project"]);
        assert_eq!(request.properties.client, vec!["Orca"]);
    }

    #[test]
    fn metadata_selection_properties_and_create_dedupe_are_normalized_and_atomic() {
        let storage = test_storage_with_migrations();
        let first = storage
            .create_text_item(CreateHistoryItemRequest {
                text: "property item".into(),
                title: None,
                notes: None,
                tags: Vec::new(),
                properties: ScenarioProperties {
                    client: vec![" Acme ".into()],
                    project: vec![],
                    activity: vec![],
                },
                mime_primary: None,
            })
            .unwrap();
        let second = storage
            .create_text_item(CreateHistoryItemRequest {
                text: " property item ".into(),
                title: None,
                notes: None,
                tags: Vec::new(),
                properties: ScenarioProperties {
                    client: vec!["acme".into()],
                    project: vec!["Launch".into()],
                    activity: vec![],
                },
                mime_primary: None,
            })
            .unwrap();
        assert_eq!(second.id, first.id);
        let entries = storage.list_item_property_entries(first.id).unwrap();
        assert_eq!(entries.len(), 2);

        let snapshot = storage
            .get_metadata_selection_snapshot(MetadataSelectionRequest {
                item_ids: vec![first.id],
            })
            .unwrap();
        let mut intent = untouched_metadata_intent(vec![first.id], snapshot.snapshot_token);
        intent.properties.client = vec![SetValueIntent {
            key: "Acme".into(),
            op: SetValueIntentOp::Remove,
        }];
        intent.properties.activity = vec![SetValueIntent {
            key: "Review".into(),
            op: SetValueIntentOp::Add,
        }];
        let result = storage.apply_metadata_selection_intent(intent).unwrap();
        assert_eq!(result.property_relation_changes, 2);
        let entries = storage.list_item_property_entries(first.id).unwrap();
        assert!(entries.iter().any(|entry| entry.key == "activity" && entry.value == "Review"));
        assert!(!entries.iter().any(|entry| entry.key == "client"));
    }

    #[test]
    fn reliability_text_edit_preserves_drifted_metadata_and_provenance() {
        let storage = test_storage_with_migrations();
        let id = storage.insert_text("before", &hash_text("before")).unwrap();
        {
            let conn = storage.conn.lock().unwrap();
            add_item_tag_relation(
                &conn,
                id,
                "work/project",
                "Work/Project",
                "context",
                Some(0.8),
            )
            .unwrap();
            add_item_property(&conn, id, "client", "Synthetic client", "scenario").unwrap();
            suppress_metadata_value(&conn, id, "tag", "", "Removed", "removed").unwrap();
            conn.execute(
                "UPDATE clipboard_items SET title = 'Title', notes = '#removed stays a note',
                 tags = '#ghost', mime_primary = 'text/markdown', is_marked = 1,
                 marked_at_unix_ms = 7, is_inbox = 1, inbox_at_unix_ms = 8 WHERE id = ?1",
                params![id],
            )
            .unwrap();
        }
        let tags = storage.get_item_tag_entries(id).unwrap();
        let properties = storage.list_item_property_entries(id).unwrap();
        let before = serde_json::to_value(storage.get_item(id).unwrap()).unwrap();
        storage.update_item_text(id, "after".into()).unwrap();
        let mut after = serde_json::to_value(storage.get_item(id).unwrap()).unwrap();
        assert_eq!(after["text"], "after");
        assert_eq!(after["normalized_hash"], hash_text("after"));
        for key in ["text", "preview_text", "text_char_count", "normalized_hash"] {
            after[key] = before[key].clone();
        }
        assert_eq!(after, before);
        assert_eq!(storage.get_item_tag_entries(id).unwrap(), tags);
        assert_eq!(storage.list_item_property_entries(id).unwrap(), properties);
        let conn = storage.conn.lock().unwrap();
        assert!(metadata_value_is_suppressed(&conn, id, "tag", "", "removed").unwrap());
        assert!(!metadata_value_is_suppressed(&conn, id, "tag", "", "work/project").unwrap());
    }

    #[test]
    fn reliability_concurrent_content_and_metadata_edits_keep_both_results() {
        let storage = test_storage_with_migrations();
        let id = storage
            .insert_text("initial", &hash_text("initial"))
            .unwrap();
        let barrier = Arc::new(std::sync::Barrier::new(2));
        let editor = storage.clone();
        let editor_barrier = barrier.clone();
        let thread = std::thread::spawn(move || {
            editor_barrier.wait();
            for index in 0..32 {
                editor
                    .update_item_text(id, format!("content-{index}"))
                    .unwrap();
            }
        });
        barrier.wait();
        for index in 0..32 {
            storage
                .update_item_metadata(UpdateItemMetadataRequest {
                    id,
                    title: Some(format!("title-{index}")),
                    notes: Some(format!("#unassigned notes-{index}")),
                    tags: vec![format!("work/{index}")],
                    properties: ScenarioProperties::default(),
                })
                .unwrap();
        }
        thread.join().unwrap();
        let item = storage.get_item(id).unwrap();
        assert_eq!(item.text, "content-31");
        assert_eq!(item.title.as_deref(), Some("title-31"));
        assert_eq!(item.notes.as_deref(), Some("#unassigned notes-31"));
        assert_eq!(storage.get_item_tags(id).unwrap(), vec!["work/31"]);
    }

    #[test]
    fn reliability_create_dedupe_tags_and_notes_have_distinct_authority() {
        let storage = test_storage_with_migrations();
        let request = |tags: Option<&str>| CreateHistoryItemRequest {
            text: "synthetic manual".into(),
            title: None,
            notes: Some("#unassigned".into()),
            tags: tags
                .map(|value| vec![value.to_string()])
                .unwrap_or_default(),
            properties: ScenarioProperties::default(),
            mime_primary: None,
        };
        let first = storage
            .create_text_item(request(Some("#Work/Project")))
            .unwrap();
        {
            let conn = storage.conn.lock().unwrap();
            conn.execute(
                "UPDATE clipboard_items SET tags = '#ghost' WHERE id = ?1",
                params![first.id],
            )
            .unwrap();
        }
        let second = storage
            .create_text_item(request(Some("#Équipe/One")))
            .unwrap();
        assert_eq!(second.id, first.id);
        let slugs = storage
            .list_tags()
            .unwrap()
            .into_iter()
            .map(|tag| tag.slug)
            .collect::<BTreeSet<_>>();
        assert_eq!(
            slugs,
            BTreeSet::from(["work/project".into(), "Équipe/one".into()])
        );
        for (query, expected) in [
            ("tag:work", vec![first.id]),
            ("tag:Équipe", vec![first.id]),
            ("tag:équipe", vec![]),
            ("tag:ghost", vec![]),
            ("tag:unassigned", vec![]),
            ("-tag:work", vec![]),
            ("Work/Project", vec![first.id]),
        ] {
            let page = storage
                .list_page(HistoryPageRequest {
                    query: query.into(),
                    cursor: None,
                    limit: Some(10),
                })
                .unwrap();
            assert_eq!(ids(&page.items), expected, "{query}");
        }
        storage
            .set_item_tags(SetItemTagsRequest {
                item_id: first.id,
                tags: vec![],
            })
            .unwrap();
        storage.create_text_item(request(None)).unwrap();
        assert!(storage.get_item_tags(first.id).unwrap().is_empty());
        assert_eq!(
            storage.get_item(first.id).unwrap().notes.as_deref(),
            Some("#unassigned")
        );
    }

    #[test]
    fn reliability_tag_write_failure_rolls_back_content_catalog_and_relations() {
        let storage = test_storage_with_migrations();
        let id = storage
            .create_text_item(CreateHistoryItemRequest {
                text: "original".into(),
                title: None,
                notes: None,
                tags: vec!["#Keep".into()],
                properties: ScenarioProperties::default(),
                mime_primary: None,
            })
            .unwrap()
            .id;
        let before = serde_json::to_value(storage.get_item(id).unwrap()).unwrap();
        let entries = storage.get_item_tag_entries(id).unwrap();
        storage
            .conn
            .lock()
            .unwrap()
            .execute_batch(
                "CREATE TRIGGER reject_tag_cache BEFORE UPDATE OF tags ON clipboard_items
             BEGIN SELECT RAISE(ABORT, 'synthetic cache failure'); END;",
            )
            .unwrap();
        assert!(storage
            .set_item_tags(SetItemTagsRequest {
                item_id: id,
                tags: vec!["Ghost".into()]
            })
            .is_err());
        assert!(storage
            .update_item(UpdateHistoryItemRequest {
                id,
                text: "changed".into(),
                title: Some("changed".into()),
                notes: None,
                tags: Some("#Ghost".into()),
                mime_primary: None,
                marked: Some(true),
            })
            .is_err());
        for text in ["original", "new item"] {
            assert!(storage
                .create_text_item(CreateHistoryItemRequest {
                    text: text.into(),
                    title: Some("changed".into()),
                    notes: None,
                    tags: vec!["#Ghost".into()],
                    properties: ScenarioProperties::default(),
                    mime_primary: None,
                })
                .is_err());
        }
        assert_eq!(
            serde_json::to_value(storage.get_item(id).unwrap()).unwrap(),
            before
        );
        assert_eq!(storage.get_item_tag_entries(id).unwrap(), entries);
        assert_eq!(
            storage
                .list_tags()
                .unwrap()
                .into_iter()
                .map(|tag| tag.slug)
                .collect::<Vec<_>>(),
            vec!["keep"]
        );
        let conn = storage.conn.lock().unwrap();
        assert_eq!(
            conn.query_row("SELECT COUNT(*) FROM clipboard_items", [], |row| row
                .get::<_, i64>(0))
                .unwrap(),
            1
        );
        assert!(!metadata_value_is_suppressed(&conn, id, "tag", "", "keep").unwrap());
    }

    #[test]
    fn reliability_keyset_visits_every_mixed_inbox_item_once() {
        let storage = test_storage_with_migrations();
        for id in 1..=7 {
            insert_test_text_item(&storage, id, 100 + id, &format!("item-{id}"));
        }
        storage.conn.lock().unwrap().execute_batch(
            "UPDATE clipboard_items SET last_copied_at_unix_ms = 10;
             UPDATE clipboard_items SET is_inbox = 1, inbox_at_unix_ms = 200 WHERE id IN (3, 4);
             UPDATE clipboard_items SET is_inbox = 1, inbox_at_unix_ms = -1 WHERE id = 5;
             UPDATE clipboard_items SET is_inbox = 1, inbox_at_unix_ms = NULL, last_copied_at_unix_ms = 500 WHERE id = 6;
             UPDATE clipboard_items SET last_copied_at_unix_ms = 1000, inbox_at_unix_ms = 9999 WHERE id = 7;
             UPDATE clipboard_items SET last_copied_at_unix_ms = NULL WHERE id = 2;"
        ).unwrap();
        for limit in [1, 2, 3] {
            let mut cursor = None;
            let mut visited = Vec::new();
            loop {
                let page = storage
                    .list_page(HistoryPageRequest {
                        query: String::new(),
                        cursor,
                        limit: Some(limit),
                    })
                    .unwrap();
                visited.extend(ids(&page.items));
                assert!(visited.len() <= 7, "cursor repeated items");
                cursor = page.next_cursor;
                if cursor.is_none() {
                    break;
                }
            }
            assert_eq!(visited, vec![4, 3, 5, 6, 7, 2, 1]);
        }
    }

    #[test]
    fn reliability_legacy_tags_match_hierarchy_not_substrings_or_notes() {
        let storage = test_storage_with_migrations();
        insert_test_text_item(&storage, 1, 1, "legacy");
        storage.conn.lock().unwrap().execute(
            "UPDATE clipboard_items SET tags = '#Work/Project,#Équipe/One', notes = '#unassigned' WHERE id = 1", [],
        ).unwrap();
        for (query, matches) in [
            ("tag:work", true),
            ("tag:Work/Project", true),
            ("tag:project", false),
            ("tag:wor", false),
            ("tag:Équipe", true),
            ("tag:équipe", false),
            ("tag:unassigned", false),
            ("-tag:work", false),
        ] {
            let page = storage
                .list_page(HistoryPageRequest {
                    query: query.into(),
                    cursor: None,
                    limit: Some(10),
                })
                .unwrap();
            assert_eq!(
                ids(&page.items),
                if matches { vec![1] } else { vec![] },
                "{query}"
            );
        }
    }

    #[test]
    fn reliability_preview_refresh_is_bounded_and_omits_missing_items() {
        let storage = test_storage_with_migrations();
        let text = "é".repeat(HISTORY_PREVIEW_CHAR_LIMIT as usize + 37);
        let id = storage.insert_text(&text, &hash_text(&text)).unwrap();
        let other = storage
            .insert_text("not requested", &hash_text("not requested"))
            .unwrap();
        storage
            .update_item_metadata(UpdateItemMetadataRequest {
                id,
                title: Some("Fresh title".into()),
                notes: Some("Fresh notes".into()),
                tags: vec!["Fresh/Tag".into()],
                properties: ScenarioProperties::default(),
            })
            .unwrap();
        let preview = storage
            .get_items_preview(vec![id, other + 1, id], None)
            .unwrap();
        assert_eq!(ids(&preview), vec![id]);
        assert!(!preview[0].includes_content);
        assert_eq!(
            preview[0].text,
            "é".repeat(HISTORY_PREVIEW_CHAR_LIMIT as usize)
        );
        assert_eq!(preview[0].preview_text, preview[0].text);
        assert_eq!(preview[0].text_char_count, HISTORY_PREVIEW_CHAR_LIMIT + 37);
        assert_eq!(preview[0].title.as_deref(), Some("Fresh title"));
        assert_eq!(preview[0].notes.as_deref(), Some("Fresh notes"));
        assert_eq!(preview[0].tags.as_deref(), Some("#Fresh/Tag"));
        let descriptor = AppliedSearchDescriptor::for_query(
            "Fresh",
            "in:notes Fresh",
            AppliedSearchMode::Structured,
        )
        .unwrap();
        let matched = storage
            .get_items_preview(vec![id], Some(descriptor.clone()))
            .unwrap();
        assert_eq!(matched[0].search_matches[0].field, "notes");
        assert_eq!(matched[0].search_matches[0].matched, "Fresh");
        storage
            .update_item_metadata(UpdateItemMetadataRequest {
                id,
                title: Some("Fresh title".into()),
                notes: Some("Replaced notes".into()),
                tags: vec!["Fresh/Tag".into()],
                properties: ScenarioProperties::default(),
            })
            .unwrap();
        let refreshed = storage
            .get_items_preview(vec![id], Some(descriptor))
            .unwrap();
        assert!(refreshed[0].search_matches.is_empty());
        assert!(storage.get_items_preview(vec![], None).unwrap().is_empty());
        assert_eq!(
            ids(&storage.get_items_preview(vec![id; 100], None).unwrap()),
            vec![id]
        );
        assert!(storage.get_items_preview(vec![id; 101], None).is_err());
    }

    #[test]
    fn reliability_image_failure_cleans_uncommitted_blobs_and_recapture_restores_thumbnail() {
        let mut storage = test_storage_with_migrations();
        storage.app_data_dir.push("reliability-image");
        let image = crate::image_capture::CapturedImage {
            width: 1,
            height: 1,
            png_bytes: b"synthetic original".to_vec(),
            thumbnail_png_bytes: b"synthetic thumbnail".to_vec(),
            normalized_hash: "synthetic-image".into(),
        };
        storage
            .conn
            .lock()
            .unwrap()
            .execute_batch(
                "CREATE TRIGGER reject_capture BEFORE INSERT ON clipboard_item_capture_events
             BEGIN SELECT RAISE(ABORT, 'synthetic event failure'); END;",
            )
            .unwrap();
        assert!(storage.insert_image(&image).is_err());
        let original = storage
            .app_data_dir
            .join(relative_blob_path(IMAGE_BLOB_DIR, &image.normalized_hash));
        let thumbnail = storage.app_data_dir.join(relative_blob_path(
            THUMBNAIL_BLOB_DIR,
            &image.normalized_hash,
        ));
        assert!(!original.exists());
        assert!(!thumbnail.exists());
        storage
            .conn
            .lock()
            .unwrap()
            .execute_batch("DROP TRIGGER reject_capture")
            .unwrap();
        let id = storage.insert_image(&image).unwrap();
        std::fs::remove_file(&thumbnail).unwrap();
        storage
            .conn
            .lock()
            .unwrap()
            .execute(
                "UPDATE clipboard_items SET thumbnail_path = NULL WHERE id = ?1",
                params![id],
            )
            .unwrap();
        assert_eq!(storage.insert_image(&image).unwrap(), id);
        for sequence in 1..=3 {
            assert_eq!(
                storage
                    .insert_image_with_context(
                        &image,
                        Some(CaptureContext {
                            source_app_name: Some("imageapp".into()),
                            clipboard_sequence_number: Some(sequence),
                            ..CaptureContext::default()
                        }),
                        &[]
                    )
                    .unwrap(),
                id
            );
        }
        let events = storage.list_capture_context_events(id, 50).unwrap();
        assert_eq!(
            events
                .iter()
                .map(|event| event.clipboard_sequence_number)
                .collect::<Vec<_>>(),
            vec![Some(3), Some(2), Some(1)]
        );
        write_blob(&original, b"must not replace an existing original").unwrap();
        assert_eq!(std::fs::read(&original).unwrap(), image.png_bytes);
        assert_eq!(
            std::fs::read(&thumbnail).unwrap(),
            image.thumbnail_png_bytes
        );
        assert_eq!(
            storage.get_items_preview(vec![id], None).unwrap()[0]
                .thumbnail_data_url
                .as_deref()
                .unwrap(),
            format!(
                "data:image/png;base64,{}",
                BASE64_STANDARD.encode(&image.thumbnail_png_bytes)
            )
        );
        storage.delete_item(id).unwrap();
        let _ = std::fs::remove_dir_all(&storage.app_data_dir);
    }
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
    fn default_search_scopes_update_normalizes_and_preserves_other_settings() {
        let storage = test_storage_with_migrations();
        let mut initial = AppSettings::default();
        initial.history.retention_count = 777;
        initial.picker.default_search_scopes = vec![SearchDefaultScope::Content];
        initial.picker.default_excluded_search_scopes = vec![SearchPlanTextScopeV1::Title];
        storage
            .update_settings(initial)
            .expect("initial settings should persist");

        let persisted = storage
            .update_default_search_scopes(
                Vec::new(),
                vec![
                    SearchPlanTextScopeV1::Notes,
                    SearchPlanTextScopeV1::Notes,
                    SearchPlanTextScopeV1::Title,
                ],
            )
            .expect("default scope settings should persist");

        assert_eq!(
            persisted.picker.default_search_scopes,
            vec![SearchDefaultScope::All]
        );
        assert_eq!(
            persisted.picker.default_excluded_search_scopes,
            vec![SearchPlanTextScopeV1::Notes, SearchPlanTextScopeV1::Title]
        );
        assert_eq!(persisted.history.retention_count, 777);
        assert_eq!(
            storage
                .get_settings()
                .expect("updated settings should round-trip")
                .history
                .retention_count,
            777
        );
    }

    #[test]
    fn search_trigger_settings_normalize_legacy_manual_to_enter() {
        let storage = test_storage_with_migrations();
        let mut legacy = AppSettings::default();
        legacy.picker.search_trigger_mode = SearchTriggerMode::Manual;
        legacy.picker.defer_structured_search_until_enter = true;
        legacy.history.retention_count = 777;
        let legacy_json = serde_json::to_string(&legacy).expect("legacy settings should encode");
        storage
            .conn
            .lock()
            .expect("test sqlite connection lock should work")
            .execute(
                "INSERT INTO app_settings (key, value_json, updated_at_unix_ms) VALUES (?1, ?2, 0)",
                params![APP_SETTINGS_KEY, legacy_json],
            )
            .expect("legacy settings should persist");

        let loaded = storage.get_settings().expect("legacy settings should load");
        assert_eq!(loaded.picker.search_trigger_mode, SearchTriggerMode::Enter);
        let persisted = storage
            .update_settings(loaded)
            .expect("legacy search settings should save as Enter");

        assert_eq!(
            persisted.picker.search_trigger_mode,
            SearchTriggerMode::Enter
        );
        assert_eq!(persisted.history.retention_count, 777);
        assert!(persisted.picker.defer_structured_search_until_enter);
    }

    #[test]
    fn settings_validation_rejects_invalid_retention_count() {
        let mut settings = AppSettings::default();
        settings.history.retention_count = 99;

        assert!(validate_settings(&settings).is_err());
    }

    #[test]
    fn settings_validation_rejects_invalid_editor_values() {
        let mut settings = AppSettings::default();
        settings.editor.font_size = 10;
        assert!(validate_settings(&settings).is_err());

        settings.editor.font_size = 13;
        settings.editor.tab_size = 3;
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

        assert_eq!(settings.tray, TraySettings::default());
        assert_eq!(settings.scripts, ScriptsSettings::default());
        assert_eq!(settings.auto_update, AutoUpdateSettings::default());
        assert_eq!(
            settings.enrichment,
            crate::enrichment::EnrichmentSettings::default()
        );
        assert_eq!(settings.ai, AiSettings::default());
        assert_eq!(settings.ai.api_key, "");
        assert_eq!(settings.appearance.theme_id, ThemeId::Default);
        assert_eq!(settings.editor, EditorSettings::default());
        assert!(settings.general.capture_enabled);
        assert!(settings.picker.promote_active_on_copy);
        assert_eq!(
            settings.picker.search_trigger_mode,
            SearchTriggerMode::Realtime
        );
        assert!(!settings.picker.defer_structured_search_until_enter);
        assert_eq!(settings.picker.settings_shortcut, "Ctrl+,");
        assert_eq!(settings.picker.preview_shortcut, "Alt+Enter");
        validate_settings(&settings).expect("old settings with script defaults should validate");
    }

    #[test]
    fn settings_normalize_migrates_legacy_tray_vscode_path_into_scripts() {
        let json = r#"{
            "schemaVersion": 1,
            "general": { "globalShortcut": "Ctrl+Shift+," },
            "picker": { "hideOnFocusLost": true, "enterAction": "copy" },
            "history": { "retentionCount": 0 },
            "appearance": { "theme": "system" },
            "tray": { "vscodePath": " C:\\Tools\\VS Code\\Code.exe " },
            "scripts": { "folderPath": " C:\\Scripts " }
        }"#;

        let mut settings: AppSettings =
            serde_json::from_str(json).expect("legacy settings should deserialize");

        normalize_loaded_settings(&mut settings);

        assert_eq!(settings.scripts.folder_path, r"C:\Scripts");
        assert_eq!(settings.scripts.vscode_path, r"C:\Tools\VS Code\Code.exe");
        assert_eq!(settings.tray.vscode_path, "");
    }

    #[test]
    fn settings_validation_accepts_comma_key_local_settings_shortcut() {
        let mut settings = AppSettings::default();
        settings.picker.settings_shortcut = "Ctrl+,".to_string();

        validate_settings(&settings).expect("comma key should not be treated as a sequence");
    }

    #[test]
    fn settings_normalize_trims_ai_api_key() {
        let mut settings = AppSettings::default();
        settings.ai.api_key = "  synthetic-key  ".to_string();

        normalize_loaded_settings(&mut settings);

        assert_eq!(settings.ai.api_key, "synthetic-key");
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
        let first_descriptor = first_page
            .applied_descriptor
            .clone()
            .expect("first page should identify its applied search");
        assert_eq!(first_descriptor.effective_query, "");
        assert_eq!(
            first_page.next_cursor,
            Some(HistoryPageCursor {
                after_sort_unix_ms: 10_004,
                after_id: 4,
                after_is_inbox: false,
                after_inbox_at_unix_ms: None,
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
        assert_eq!(
            second_page
                .applied_descriptor
                .as_ref()
                .expect("second page should identify its applied search")
                .fingerprint,
            first_descriptor.fingerprint
        );
    }

    #[test]
    fn list_page_uses_re_prefix_for_case_insensitive_regular_expressions() {
        let storage = test_storage_with_migrations();
        insert_test_text_item(&storage, 1, 10_001, "Invoice-42");
        insert_test_text_item(&storage, 2, 10_002, "invoice draft");

        let page = storage
            .list_page(HistoryPageRequest {
                query: r"re:^invoice-\d+$".to_string(),
                cursor: None,
                limit: Some(10),
            })
            .expect("regular expression search should load");

        assert_eq!(ids(&page.items), vec![1]);
        assert_eq!(page.filtered_count, Some(1));
    }

    #[test]
    fn list_page_keeps_unprefixed_search_literal() {
        let storage = test_storage_with_migrations();
        insert_test_text_item(&storage, 1, 10_001, "Invoice-42");
        insert_test_text_item(&storage, 2, 10_002, "invoice draft");

        let page = storage
            .list_page(HistoryPageRequest {
                query: "invoice".to_string(),
                cursor: None,
                limit: Some(10),
            })
            .expect("plain search should load");

        assert_eq!(ids(&page.items), vec![2, 1]);
        assert_eq!(page.filtered_count, Some(2));
    }

    #[test]
    fn list_page_rejects_invalid_regular_expressions_without_querying() {
        let storage = test_storage_with_migrations();
        insert_test_text_item(&storage, 1, 10_001, "Invoice-42");

        let error = match storage.list_page(HistoryPageRequest {
            query: "re:(".to_string(),
            cursor: None,
            limit: Some(10),
        }) {
            Ok(_) => panic!("invalid regular expression should fail closed"),
            Err(error) => error,
        };

        assert!(error.starts_with("Invalid regular expression:"));
    }

    #[test]
    fn empty_regular_expression_prefix_returns_missing_value_diagnostic() {
        let storage = test_storage_with_migrations();
        insert_test_text_item(&storage, 1, 10_001, "Invoice-42");

        let page = storage
            .history_search(HistorySearchRequest {
                query: "re:".to_string(),
                display_query: None,
                cursor: None,
                limit: Some(10),
                plan: None,
                mode: HistorySearchMode::Structured,
                include_content: false,
                include_counts: true,
                explain: true,
                ai_context: None,
                applied_descriptor: None,
            })
            .expect("empty regex prefix should return a diagnostic page");

        assert!(page.items.is_empty());
        assert_eq!(page.filtered_count, Some(0));
        assert!(page
            .query_explanation
            .as_ref()
            .expect("explain response")
            .diagnostics
            .iter()
            .any(|diagnostic| diagnostic.code == "missingValue" && diagnostic.severity == "error"));
    }

    #[test]
    fn history_search_explains_and_warns_for_ai_mode_without_planner() {
        let storage = test_storage_with_migrations();
        insert_test_text_item(&storage, 1, 10_001, "sqlite migration note");

        let page = storage
            .history_search(HistorySearchRequest {
                query: "sqlite".to_string(),
                display_query: None,
                cursor: None,
                limit: Some(10),
                plan: None,
                mode: HistorySearchMode::Ai,
                include_content: true,
                include_counts: true,
                explain: true,
                ai_context: None,
                applied_descriptor: None,
            })
            .expect("history search should load");

        assert_eq!(ids(&page.items), vec![1]);
        assert_eq!(page.interpreted_query.as_deref(), Some("sqlite"));
        assert_eq!(
            page.applied_descriptor
                .as_ref()
                .expect("AI page should identify its applied search")
                .mode,
            AppliedSearchMode::Ai
        );
        assert!(page
            .explanation
            .as_deref()
            .unwrap_or_default()
            .contains("Structured local history search"));
        assert!(page.warnings.iter().any(|warning| warning.contains("AI")));
    }

    #[test]
    fn malformed_known_search_filter_returns_diagnostics_without_broadening_results() {
        let storage = test_storage_with_migrations();
        insert_test_text_item(&storage, 1, 10_001, "first clip");

        let page = storage
            .history_search(HistorySearchRequest {
                query: "kind:".to_string(),
                display_query: None,
                cursor: None,
                limit: Some(10),
                plan: None,
                mode: HistorySearchMode::Structured,
                include_content: false,
                include_counts: true,
                explain: true,
                ai_context: None,
                applied_descriptor: None,
            })
            .expect("malformed query should return a diagnostic page");

        assert!(page.items.is_empty());
        assert_eq!(page.filtered_count, Some(0));
        assert!(page
            .query_explanation
            .as_ref()
            .expect("explain response")
            .diagnostics
            .iter()
            .any(|diagnostic| diagnostic.code == "missingValue" && diagnostic.severity == "error"));
    }

    #[test]
    fn applied_search_descriptor_round_trips_and_rejects_tampering() {
        let descriptor = AppliedSearchDescriptor::for_query(
            "AI invoices",
            "tag:work invoice",
            AppliedSearchMode::Ai,
        )
        .expect("descriptor should be created from a validated query");
        let encoded = serde_json::to_string(&descriptor).expect("descriptor should serialize");
        let decoded: AppliedSearchDescriptor =
            serde_json::from_str(&encoded).expect("descriptor should deserialize");
        assert_eq!(decoded, descriptor);
        decoded
            .validate()
            .expect("round-tripped descriptor should validate");

        let mut tampered = decoded;
        tampered.plan = search_plan_from_query("tag:private");
        assert!(tampered.validate().is_err());
    }

    #[test]
    fn applied_search_fingerprint_is_semantic_and_excludes_display_query() {
        let first = AppliedSearchDescriptor::for_query(
            "private clipboard phrase",
            "tag:work",
            AppliedSearchMode::Structured,
        )
        .expect("first descriptor");
        let second = AppliedSearchDescriptor::for_query(
            "different visible wording",
            "tag:work",
            AppliedSearchMode::Structured,
        )
        .expect("second descriptor");
        assert_eq!(first.fingerprint, second.fingerprint);

        let changed = AppliedSearchDescriptor::for_query(
            "different visible wording",
            "tag:personal",
            AppliedSearchMode::Structured,
        )
        .expect("changed descriptor");
        assert_ne!(first.fingerprint, changed.fingerprint);
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
    fn capture_context_is_hidden_but_plain_searchable() {
        let storage = test_storage_with_migrations();
        let text = "https://example.com/path copied from an editor";
        let context = CaptureContext {
            source_kind: "clipboard".to_string(),
            source_app_name: Some("code.exe".to_string()),
            source_app_path: Some(r"C:\Tools\VS Code\Code.exe".to_string()),
            source_process_id: Some(4242),
            source_window_id: Some(9001),
            source_window_title: Some("main.rs - Copicu".to_string()),
            clipboard_platform: Some("windows".to_string()),
            clipboard_sequence_number: Some(123),
            clipboard_format_count: Some(2),
            clipboard_formats: vec![CaptureFormatContext {
                id: 13,
                name: "CF_UNICODETEXT".to_string(),
                kind: "text".to_string(),
                handle_size_bytes: Some(128),
            }],
        };

        let item_id = storage
            .insert_text_with_context(text, &hash_text(text), Some(context), &[])
            .expect("text with context should insert");

        for query in [
            "code.exe",
            "main.rs",
            "example.com",
            "app:code",
            "window:copicu",
            "domain:example.com",
            "source:clipboard",
            "format:unicode",
        ] {
            let page = storage
                .history_search(HistorySearchRequest {
                    query: query.to_string(),
                    display_query: None,
                    cursor: None,
                    limit: Some(10),
                    plan: None,
                    mode: HistorySearchMode::Structured,
                    include_content: true,
                    include_counts: true,
                    explain: false,
                    ai_context: None,
                    applied_descriptor: None,
                })
                .unwrap_or_else(|error| panic!("query {query} should search context: {error}"));
            assert_eq!(
                ids(&page.items),
                vec![item_id],
                "query {query} should match capture context"
            );
        }

        let events = storage
            .list_capture_context_events(item_id, 10)
            .expect("capture context should be readable for metadata inspector");
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].source_app_name.as_deref(), Some("code.exe"));
        assert_eq!(
            events[0].source_window_title.as_deref(),
            Some("main.rs - Copicu")
        );
        assert_eq!(events[0].domain.as_deref(), Some("example.com"));

        let item = storage.get_item(item_id).expect("item should load");
        assert_eq!(item.title, None);
        assert_eq!(item.notes, None);
        assert_eq!(item.tags, None);
    }

    #[test]
    fn capture_retention_removes_old_search_context_but_preserves_metadata() {
        let dir = test_app_data_dir();
        let storage = AppStorage::open(&dir).unwrap();
        // Equal timestamps must still evict the oldest inserted event.
        storage
            .conn
            .lock()
            .unwrap()
            .execute_batch(
                "CREATE TRIGGER tied_capture_time AFTER INSERT ON clipboard_item_capture_events
             BEGIN UPDATE clipboard_item_capture_events SET captured_at_unix_ms = 500
             WHERE id = NEW.id; END;",
            )
            .unwrap();
        let text = "synthetic retention payload";
        let hash = hash_text(text);
        let id = storage
            .insert_text_with_context(
                text,
                &hash,
                Some(CaptureContext {
                    source_kind: "oldsource".into(),
                    source_app_name: Some("oldapp".into()),
                    source_app_path: Some("oldpath".into()),
                    source_window_title: Some("oldwindow".into()),
                    clipboard_formats: vec![CaptureFormatContext {
                        id: 13,
                        name: "oldformat".into(),
                        kind: "text".into(),
                        handle_size_bytes: None,
                    }],
                    ..CaptureContext::default()
                }),
                &["Retained/Tag".into()],
            )
            .unwrap();
        storage
            .update_item_metadata(UpdateItemMetadataRequest {
                id,
                title: Some("Editable title".into()),
                notes: Some("#literal notes".into()),
                tags: vec!["Retained/Tag".into()],
                properties: ScenarioProperties::default(),
            })
            .unwrap();
        {
            let conn = storage.conn.lock().unwrap();
            add_item_property(&conn, id, "client", "Synthetic client", "scenario").unwrap();
            suppress_metadata_value(&conn, id, "tag", "", "Removed", "removed").unwrap();
            conn.execute("UPDATE clipboard_item_capture_events SET domain = 'old.example' WHERE item_id = ?1", params![id]).unwrap();
        }
        let before = serde_json::to_value(storage.get_item(id).unwrap()).unwrap();
        let tags = storage.get_item_tag_entries(id).unwrap();
        let properties = storage.list_item_property_entries(id).unwrap();
        let descriptor = AppliedSearchDescriptor::for_query(
            "old context",
            "ctx:oldapp",
            AppliedSearchMode::Structured,
        )
        .unwrap();
        assert_eq!(storage.read_find_items(&descriptor).unwrap()[0].id, id);
        let epoch = storage.mutation_epoch.load(Ordering::SeqCst);
        for sequence in 1..=3 {
            assert_eq!(
                storage
                    .insert_text_with_context(
                        text,
                        &hash,
                        Some(CaptureContext {
                            source_kind: "newsource".into(),
                            source_app_name: Some("newapp".into()),
                            source_window_title: Some("newwindow".into()),
                            clipboard_sequence_number: Some(sequence),
                            clipboard_formats: vec![CaptureFormatContext {
                                id: 13,
                                name: "newformat".into(),
                                kind: "text".into(),
                                handle_size_bytes: None,
                            }],
                            ..CaptureContext::default()
                        }),
                        &[]
                    )
                    .unwrap(),
                id
            );
        }
        let events = storage.list_capture_context_events(id, 50).unwrap();
        assert_eq!(
            events
                .iter()
                .map(|e| e.clipboard_sequence_number)
                .collect::<Vec<_>>(),
            vec![Some(3), Some(2), Some(1)]
        );
        for query in [
            "oldapp",
            "ctx:oldapp",
            "re:oldapp",
            "ctx:oldpath",
            "app:oldapp",
            "window:oldwindow",
            "domain:old.example",
            "source:oldsource",
            "format:oldformat",
        ] {
            assert!(
                storage
                    .list_page(HistoryPageRequest {
                        query: query.into(),
                        cursor: None,
                        limit: Some(10),
                    })
                    .unwrap()
                    .items
                    .is_empty(),
                "{query}"
            );
        }
        for query in [
            "newapp",
            "ctx:newapp",
            "app:newapp",
            "window:newwindow",
            "source:newsource",
            "format:newformat",
            "-app:oldapp",
            "tag:retained",
        ] {
            assert_eq!(
                ids(&storage
                    .list_page(HistoryPageRequest {
                        query: query.into(),
                        cursor: None,
                        limit: Some(10),
                    })
                    .unwrap()
                    .items),
                vec![id],
                "{query}"
            );
        }
        assert!(storage.read_find_items(&descriptor).unwrap().is_empty());
        assert!(
            storage
                .read_find_items_cancelable(
                    &descriptor,
                    Arc::new(AtomicBool::new(false)),
                    storage.mutation_epoch(),
                    epoch
                )
                .is_err(),
            "a Find snapshot referring to removed context must be invalidated"
        );
        let mut after = serde_json::to_value(storage.get_item(id).unwrap()).unwrap();
        assert_eq!(after["copy_count"], 4);
        for key in ["last_copied_at_unix_ms", "copy_count"] {
            after[key] = before[key].clone();
        }
        assert_eq!(after, before);
        assert_eq!(storage.get_item_tag_entries(id).unwrap(), tags);
        assert_eq!(storage.list_item_property_entries(id).unwrap(), properties);
        assert!(metadata_value_is_suppressed(
            &storage.conn.lock().unwrap(),
            id,
            "tag",
            "",
            "removed"
        )
        .unwrap());
        drop(storage);
        let reopened = AppStorage::open(&dir).unwrap();
        assert!(reopened.read_find_items(&descriptor).unwrap().is_empty());
        assert_eq!(
            reopened.list_capture_context_events(id, 50).unwrap().len(),
            3
        );
        drop(reopened);
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn capture_retention_only_prunes_recaptured_legacy_items_in_stable_order() {
        let storage = test_storage_with_migrations();
        insert_test_text_item(&storage, 1, 1, "recaptured");
        insert_test_text_item(&storage, 2, 1, "untouched");
        {
            let conn = storage.conn.lock().unwrap();
            conn.execute(
                "UPDATE clipboard_items SET normalized_hash = ?1 WHERE id = 1",
                params![hash_text("recaptured")],
            )
            .unwrap();
            for item_id in [1, 2] {
                for (time, app) in [
                    (100, "ancient"),
                    (300, "tieolder"),
                    (200, "middle"),
                    (300, "tienewer"),
                    (50, "lateold"),
                ] {
                    conn.execute(
                        "INSERT INTO clipboard_item_capture_events
                         (item_id, captured_at_unix_ms, source_kind, content_kind, source_app_name, event_json)
                         VALUES (?1, ?2, 'clipboard', 'text', ?3, '{}')",
                        params![item_id, time, app],
                    ).unwrap();
                }
                conn.execute("UPDATE clipboard_items SET context_search_text = 'ghostobsolete' WHERE id = ?1",
                    params![item_id]).unwrap();
            }
        }
        let untouched =
            serde_json::to_value(storage.list_capture_context_events(2, 50).unwrap()).unwrap();
        assert_eq!(
            storage
                .insert_text("recaptured", &hash_text("recaptured"))
                .unwrap(),
            1
        );
        let events = storage.list_capture_context_events(1, 50).unwrap();
        assert_eq!(
            events
                .iter()
                .map(|e| e.source_app_name.as_deref())
                .collect::<Vec<_>>(),
            vec![None, Some("tienewer"), Some("tieolder")]
        );
        // A delayed event is ranked by its timestamp, not merely by insertion ID.
        {
            let mut conn = storage.conn.lock().unwrap();
            let tx = conn.transaction().unwrap();
            record_capture_event(
                &tx, 1, 250, "text", None, None, None, None, None, None, None,
            )
            .unwrap();
            tx.commit().unwrap();
        }
        assert_eq!(
            serde_json::to_value(storage.list_capture_context_events(1, 50).unwrap()).unwrap(),
            serde_json::to_value(events).unwrap()
        );
        assert_eq!(
            serde_json::to_value(storage.list_capture_context_events(2, 50).unwrap()).unwrap(),
            untouched
        );
        assert_eq!(
            ids(&storage
                .list_page(HistoryPageRequest {
                    query: "ctx:ghostobsolete".into(),
                    cursor: None,
                    limit: Some(10),
                })
                .unwrap()
                .items),
            vec![2]
        );
    }

    #[test]
    fn capture_retention_rolls_back_pruning_context_and_dedupe_on_error() {
        let storage = test_storage_with_migrations();
        let text = "rollback retention";
        let hash = hash_text(text);
        let id = storage.insert_text(text, &hash).unwrap();
        for _ in 0..2 {
            storage.insert_text(text, &hash).unwrap();
        }
        let before_item = serde_json::to_value(storage.get_item(id).unwrap()).unwrap();
        let before_events =
            serde_json::to_value(storage.list_capture_context_events(id, 50).unwrap()).unwrap();
        let before_context: String = storage
            .conn
            .lock()
            .expect("sqlite lock")
            .query_row(
                "SELECT context_search_text FROM clipboard_items WHERE id = ?1",
                params![id],
                |row| row.get(0),
            )
            .unwrap();
        let epoch = storage.mutation_epoch.load(Ordering::SeqCst);
        for trigger in [
            "CREATE TRIGGER reject_retention BEFORE DELETE ON clipboard_item_capture_events
             BEGIN SELECT RAISE(ABORT, 'synthetic retention failure'); END;",
            "CREATE TRIGGER reject_retention BEFORE UPDATE OF context_search_text ON clipboard_items
             BEGIN SELECT RAISE(ABORT, 'synthetic retention failure'); END;",
            "CREATE TRIGGER reject_retention AFTER UPDATE OF context_search_text ON clipboard_items
             BEGIN SELECT RAISE(ABORT, 'synthetic retention failure'); END;",
        ] {
            storage.conn.lock().unwrap().execute_batch(trigger).unwrap();
            let error = storage.insert_text_with_context(text, &hash, None, &["RolledBack".into()]).unwrap_err();
            assert!(error.contains("synthetic retention failure"), "{error}");
            assert_eq!(serde_json::to_value(storage.get_item(id).unwrap()).unwrap(), before_item);
            assert_eq!(serde_json::to_value(storage.list_capture_context_events(id, 50).unwrap()).unwrap(), before_events);
            let context: String = storage.conn.lock().expect("sqlite lock").query_row(
                "SELECT context_search_text FROM clipboard_items WHERE id = ?1", params![id],
                |row| row.get(0),
            ).unwrap();
            assert_eq!(context, before_context);
            assert!(storage.get_item_tag_entries(id).unwrap().is_empty());
            assert_eq!(storage.mutation_epoch.load(Ordering::SeqCst), epoch);
            storage.conn.lock().unwrap().execute_batch("DROP TRIGGER reject_retention").unwrap();
        }
    }

    #[test]
    fn capture_retention_applies_to_manual_dedupe_without_losing_tags() {
        let storage = test_storage_with_migrations();
        let text = "manual retention";
        let id = storage
            .insert_text_with_context(
                text,
                &hash_text(text),
                Some(CaptureContext {
                    source_app_name: Some("evictedapp".into()),
                    ..CaptureContext::default()
                }),
                &["Kept".into()],
            )
            .unwrap();
        let tags = storage.get_item_tag_entries(id).unwrap();
        for _ in 0..3 {
            let result = storage
                .create_text_item(CreateHistoryItemRequest {
                    text: text.into(),
                    title: None,
                    notes: None,
                    tags: Vec::new(),
                    properties: ScenarioProperties::default(),
                    mime_primary: None,
                })
                .unwrap();
            assert_eq!(result.id, id);
            assert!(!result.created);
        }
        let events = storage.list_capture_context_events(id, 50).unwrap();
        assert_eq!(events.len(), 3);
        assert!(events.iter().all(|event| event.source_kind == "manual"));
        assert!(storage
            .list_page(HistoryPageRequest {
                query: "ctx:evictedapp".into(),
                cursor: None,
                limit: Some(10),
            })
            .unwrap()
            .items
            .is_empty());
        assert_eq!(storage.get_item_tag_entries(id).unwrap(), tags);
    }

    #[test]
    fn recapture_appends_capture_event_without_duplicate_item() {
        let storage = test_storage_with_migrations();
        let text = "same payload";
        let hash = hash_text(text);

        let first_id = storage
            .insert_text_with_context(
                text,
                &hash,
                Some(CaptureContext {
                    source_kind: "clipboard".to_string(),
                    source_app_name: Some("first.exe".to_string()),
                    ..CaptureContext::default()
                }),
                &["Work".to_string()],
            )
            .expect("first capture should insert");
        let second_id = storage
            .insert_text_with_context(
                text,
                &hash,
                Some(CaptureContext {
                    source_kind: "clipboard".to_string(),
                    source_app_name: Some("second.exe".to_string()),
                    ..CaptureContext::default()
                }),
                &["Review".to_string()],
            )
            .expect("recapture should bump existing item");

        assert_eq!(first_id, second_id);
        assert_eq!(
            storage
                .get_item_tags(first_id)
                .expect("context tags should load"),
            vec!["Review".to_string(), "Work".to_string()]
        );
        let conn = storage.conn.lock().expect("sqlite lock should work");
        let event_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM clipboard_item_capture_events WHERE item_id = ?1",
                params![first_id],
                |row| row.get(0),
            )
            .expect("capture events should be counted");
        assert_eq!(event_count, 2);
        drop(conn);

        let page = storage
            .list_page(HistoryPageRequest {
                query: "app:second".to_string(),
                cursor: None,
                limit: Some(10),
            })
            .expect("second app should be searchable after recapture");
        assert_eq!(ids(&page.items), vec![first_id]);
        assert_eq!(page.total_count, Some(1));
    }

    #[test]
    fn create_text_item_adds_manual_item_without_clipboard_write() {
        let storage = test_storage_with_migrations();

        let result = storage
            .create_text_item(CreateHistoryItemRequest {
                text: "  Manual note  ".to_string(),
                title: None,
                notes: Some("#manual from keyboard".to_string()),
                tags: vec!["#manual".to_string()],
                properties: ScenarioProperties::default(),
                mime_primary: None,
            })
            .expect("manual text item should be created");

        assert!(result.created);
        let item = storage
            .get_item(result.id)
            .expect("created item should load");
        assert_eq!(item.text, "Manual note");
        assert_eq!(item.mime_primary.as_deref(), Some("text/plain"));
        assert_eq!(item.notes.as_deref(), Some("#manual from keyboard"));
        assert_eq!(item.tags.as_deref(), Some("#manual"));
    }

    #[test]
    fn create_text_item_dedupes_and_merges_metadata() {
        let storage = test_storage_with_migrations();

        let first = storage
            .create_text_item(CreateHistoryItemRequest {
                text: "Manual note".to_string(),
                title: None,
                notes: Some("#first".to_string()),
                tags: vec!["#first".to_string()],
                properties: ScenarioProperties::default(),
                mime_primary: None,
            })
            .expect("first manual item should be created");
        let second = storage
            .create_text_item(CreateHistoryItemRequest {
                text: " Manual note ".to_string(),
                title: Some("Manual".to_string()),
                notes: Some("#second".to_string()),
                tags: vec!["#second".to_string(), "#first".to_string()],
                properties: ScenarioProperties::default(),
                mime_primary: None,
            })
            .expect("duplicate manual item should update existing item");

        assert_eq!(second.id, first.id);
        assert!(!second.created);
        let page = storage
            .list_page(HistoryPageRequest {
                query: String::new(),
                cursor: None,
                limit: Some(10),
            })
            .expect("history should load");
        assert_eq!(ids(&page.items), vec![first.id]);
        assert_eq!(page.items[0].title.as_deref(), Some("Manual"));
        assert_eq!(page.items[0].notes.as_deref(), Some("#first\n#second"));
        assert_eq!(page.items[0].tags.as_deref(), Some("#first #second"));
        assert_eq!(page.items[0].copy_count, 2);
    }

    #[test]
    fn mark_copied_promotes_existing_item_to_recent_top() {
        let storage = test_storage_with_migrations();
        insert_test_text_item(&storage, 1, 10_001, "older");
        insert_test_text_item(&storage, 2, 10_002, "newer");

        storage
            .mark_copied(1)
            .expect("old item should be marked copied");

        let page = storage
            .list_page(HistoryPageRequest {
                query: String::new(),
                cursor: None,
                limit: Some(10),
            })
            .expect("history should load");

        assert_eq!(ids(&page.items), vec![1, 2]);
        assert_eq!(page.items[0].copy_count, 2);
        assert!(page.items[0].last_copied_at_unix_ms >= page.items[1].last_copied_at_unix_ms);
    }

    #[test]
    fn history_neighbor_uses_capture_order_and_wraps() {
        let storage = test_storage_with_migrations();
        insert_test_text_item(&storage, 1, 10_001, "oldest");
        insert_test_text_item(&storage, 3, 10_003, "middle");
        insert_test_text_item(&storage, 7, 10_007, "newest");

        let older = storage
            .get_neighbor_item(7, HistoryNeighborDirection::Older, true)
            .expect("older neighbor lookup should work")
            .expect("older neighbor should exist");
        let newer = storage
            .get_neighbor_item(3, HistoryNeighborDirection::Newer, true)
            .expect("newer neighbor lookup should work")
            .expect("newer neighbor should exist");
        let wrapped_older = storage
            .get_neighbor_item(1, HistoryNeighborDirection::Older, true)
            .expect("older wrap lookup should work")
            .expect("older wrap should exist");
        let wrapped_newer = storage
            .get_neighbor_item(7, HistoryNeighborDirection::Newer, true)
            .expect("newer wrap lookup should work")
            .expect("newer wrap should exist");

        assert_eq!(older.id, 3);
        assert_eq!(newer.id, 7);
        assert_eq!(wrapped_older.id, 7);
        assert_eq!(wrapped_newer.id, 1);
        assert!(storage
            .get_neighbor_item(1, HistoryNeighborDirection::Older, false)
            .expect("non-wrapping lookup should work")
            .is_none());
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
                display_query: None,
                cursor: None,
                limit: Some(10),
                plan: None,
                mode: HistorySearchMode::Structured,
                include_content: false,
                include_counts: true,
                explain: false,
                ai_context: None,
                applied_descriptor: None,
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

        let search_page = storage
            .history_search(HistorySearchRequest {
                query: "COPICU_SYNTH_PREVIEW_END".to_string(),
                display_query: None,
                cursor: None,
                limit: Some(10),
                plan: None,
                mode: HistorySearchMode::Structured,
                include_content: false,
                include_counts: true,
                explain: false,
                ai_context: None,
                applied_descriptor: None,
            })
            .expect("search page should load");
        assert!(!search_page.items[0].includes_content);
        assert!(!search_page.items[0]
            .text()
            .contains("COPICU_SYNTH_PREVIEW_END"));
        assert_eq!(search_page.items[0].search_matches.len(), 1);
        assert_eq!(search_page.items[0].search_matches[0].field, "content");
        assert_eq!(
            search_page.items[0].search_matches[0].matched,
            "COPICU_SYNTH_PREVIEW_END"
        );
        assert!(search_page.items[0].search_matches[0]
            .before
            .starts_with('…'));

        let full_page = storage
            .history_search(HistorySearchRequest {
                query: String::new(),
                display_query: None,
                cursor: None,
                limit: Some(10),
                plan: None,
                mode: HistorySearchMode::Structured,
                include_content: true,
                include_counts: true,
                explain: false,
                ai_context: None,
                applied_descriptor: None,
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
                display_query: None,
                cursor: None,
                limit: Some(10),
                plan: None,
                mode: HistorySearchMode::Structured,
                include_content: false,
                include_counts: true,
                explain: false,
                ai_context: None,
                applied_descriptor: None,
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
                display_query: None,
                cursor: None,
                limit: Some(2),
                plan: None,
                mode: HistorySearchMode::Structured,
                include_content: false,
                include_counts: false,
                explain: false,
                ai_context: None,
                applied_descriptor: None,
            })
            .expect("history search without counts should load");

        assert_eq!(ids(&page.items), vec![4, 3]);
        assert_eq!(
            page.next_cursor,
            Some(HistoryPageCursor {
                after_sort_unix_ms: 50_003,
                after_id: 3,
                after_is_inbox: false,
                after_inbox_at_unix_ms: None,
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
            mutation_epoch: Arc::new(AtomicU64::new(0)),
            #[cfg(test)]
            find_scan_gate: Arc::new(Mutex::new(None)),
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
            mutation_epoch: Arc::new(AtomicU64::new(0)),
            #[cfg(test)]
            find_scan_gate: Arc::new(Mutex::new(None)),
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
    fn update_item_metadata_keeps_notes_and_tags_independent_and_atomic() {
        let storage = test_storage_with_migrations();
        insert_test_text_item(&storage, 1, 40_001, "synthetic metadata item");

        storage
            .update_item_metadata(UpdateItemMetadataRequest {
                id: 1,
                title: Some("Reference".to_string()),
                notes: Some("Markdown note with #not-a-tag".to_string()),
                tags: vec!["Work".to_string(), "Very Important".to_string()],
                properties: ScenarioProperties::default(),
            })
            .expect("metadata should update");

        let item = storage.get_item(1).expect("item should load");
        assert_eq!(item.title.as_deref(), Some("Reference"));
        assert_eq!(item.notes.as_deref(), Some("Markdown note with #not-a-tag"));
        assert_eq!(
            storage.get_item_tags(1).expect("tags should load"),
            vec!["Very Important".to_string(), "Work".to_string()]
        );
        assert!(!storage
            .get_item_tags(1)
            .expect("tags should reload")
            .contains(&"not-a-tag".to_string()));
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
                display_query: None,
                cursor: None,
                limit: Some(10),
                plan: None,
                mode: HistorySearchMode::Structured,
                include_content: true,
                include_counts: true,
                explain: false,
                ai_context: None,
                applied_descriptor: None,
            })
            .expect("tag search should load");
        assert_eq!(ids(&page.items), vec![1]);
    }

    #[test]
    fn parent_tag_search_matches_only_its_nested_tags() {
        let storage = test_storage_with_migrations();
        insert_test_text_item(&storage, 1, 40_001, "direct parent tag item");
        insert_test_text_item(&storage, 2, 40_002, "first nested tag item");
        insert_test_text_item(&storage, 3, 40_003, "second nested tag item");
        insert_test_text_item(&storage, 4, 40_004, "similar non-child tag item");
        for (item_id, tag) in [
            (1, "Workspace"),
            (2, "Workspace/Key"),
            (3, "Workspace/Show"),
            (4, "Other/Workspace"),
        ] {
            storage
                .set_item_tags(SetItemTagsRequest {
                    item_id,
                    tags: vec![tag.to_string()],
                })
                .expect("nested item tag should save");
        }

        let search_ids = |query: &str| {
            let page = storage
                .history_search(HistorySearchRequest {
                    query: query.to_string(),
                    display_query: None,
                    cursor: None,
                    limit: Some(10),
                    plan: None,
                    mode: HistorySearchMode::Structured,
                    include_content: true,
                    include_counts: true,
                    explain: false,
                    ai_context: None,
                    applied_descriptor: None,
                })
                .expect("nested tag search should load");
            let mut item_ids = ids(&page.items);
            item_ids.sort_unstable();
            item_ids
        };

        assert_eq!(search_ids("tag:workspace"), vec![1, 2, 3]);
        assert_eq!(search_ids("tag:workspace/key"), vec![2]);

        let tags = storage.list_tags().expect("nested tags should list");
        assert_eq!(
            tags.iter()
                .find(|tag| tag.slug == "workspace")
                .map(|tag| tag.item_count),
            Some(3),
        );
        assert_eq!(
            tags.iter()
                .find(|tag| tag.slug == "workspace/key")
                .map(|tag| tag.item_count),
            Some(1),
        );
    }

    #[test]
    fn apply_item_tags_replace_sets_exact_tags_and_empty_clears_them() {
        let storage = test_storage_with_migrations();
        insert_test_text_item(&storage, 1, 40_001, "first tagged item");
        storage
            .set_item_tags(SetItemTagsRequest {
                item_id: 1,
                tags: vec!["Old".to_string()],
            })
            .expect("initial item tags should save");

        storage
            .apply_item_tags(ApplyItemTagsRequest {
                item_ids: vec![1, 1],
                tags: vec![
                    "#Work".to_string(),
                    "Backend".to_string(),
                    "work".to_string(),
                ],
                remove_tags: Vec::new(),
                mode: ApplyItemTagsMode::Replace,
            })
            .expect("replacement tags should save");
        assert_eq!(
            storage.get_item_tags(1).expect("item tags should load"),
            vec!["Backend".to_string(), "Work".to_string()]
        );

        storage
            .apply_item_tags(ApplyItemTagsRequest {
                item_ids: vec![1],
                tags: Vec::new(),
                remove_tags: Vec::new(),
                mode: ApplyItemTagsMode::Replace,
            })
            .expect("empty replacement should clear tags");
        assert!(storage
            .get_item_tags(1)
            .expect("cleared item tags should load")
            .is_empty());
        assert!(storage
            .get_item(1)
            .expect("item should load")
            .tags
            .is_none());
    }

    #[test]
    fn apply_item_tags_patch_adds_and_removes_without_replacing_other_tags() {
        let storage = test_storage_with_migrations();
        insert_test_text_item(&storage, 1, 40_001, "first tagged item");
        insert_test_text_item(&storage, 2, 40_002, "second tagged item");
        storage
            .set_item_tags(SetItemTagsRequest {
                item_id: 1,
                tags: vec!["First".to_string()],
            })
            .expect("first item tags should save");
        storage
            .set_item_tags(SetItemTagsRequest {
                item_id: 2,
                tags: vec!["Second".to_string()],
            })
            .expect("second item tags should save");

        for _ in 0..2 {
            storage
                .apply_item_tags(ApplyItemTagsRequest {
                    item_ids: vec![2, 1, 2],
                    tags: vec!["Shared".to_string(), "#shared".to_string()],
                    remove_tags: vec!["First".to_string()],
                    mode: ApplyItemTagsMode::Patch,
                })
                .expect("tag patch should save idempotently");
        }

        assert_eq!(
            storage.get_item_tags(1).expect("first tags should load"),
            vec!["Shared".to_string()]
        );
        assert_eq!(
            storage.get_item_tags(2).expect("second tags should load"),
            vec!["Second".to_string(), "Shared".to_string()]
        );
        let shared = storage
            .list_tags()
            .expect("tags should list")
            .into_iter()
            .find(|tag| tag.slug == "shared")
            .expect("shared tag should exist");
        assert_eq!(shared.item_count, 2);
    }

    #[test]
    fn delete_tag_removes_it_globally_without_deleting_items() {
        let storage = test_storage_with_migrations();
        insert_test_text_item(&storage, 1, 40_001, "tagged item");
        storage
            .set_item_tags(SetItemTagsRequest {
                item_id: 1,
                tags: vec!["Shared".to_string(), "Keep".to_string()],
            })
            .expect("item tags should save");
        let shared = storage
            .list_tags()
            .expect("tags should list")
            .into_iter()
            .find(|tag| tag.slug == "shared")
            .expect("shared tag should exist");
        storage
            .create_scenario_from_query(CreateScenarioFromQueryRequest {
                name: "Shared workspace".to_string(),
                query: "tag:shared".to_string(),
                properties: ScenarioProperties::default(),
                tags: vec!["Shared".to_string()],
            })
            .expect("scenario should persist");
        storage
            .create_saved_history_view(CreateSavedHistoryViewRequest {
                title: "Shared capture".to_string(),
                query: "tag:shared".to_string(),
                hotkey: None,
                capture_tags: vec!["Shared".to_string()],
            })
            .expect("saved view should persist");

        storage
            .delete_tag(shared.id)
            .expect("tag should delete globally");

        assert_eq!(
            storage
                .get_item_tags(1)
                .expect("remaining tags should load"),
            vec!["Keep".to_string()]
        );
        assert!(
            storage.get_item(1).is_ok(),
            "tag deletion must preserve the item"
        );
        assert!(storage
            .list_tags()
            .expect("tags should list")
            .iter()
            .all(|tag| tag.slug != "shared"));
        assert!(storage.list_scenarios().expect("scenarios should list")[0]
            .tags
            .is_empty());
        assert!(storage
            .list_saved_history_views()
            .expect("views should list")
            .iter()
            .all(|view| view.capture_tags.iter().all(|tag| tag != "Shared")));
    }

    #[test]
    fn failed_item_delete_preserves_tag_relationships() {
        let storage = test_storage_with_migrations();
        insert_test_text_item(&storage, 1, 40_001, "synthetic delete failure");
        storage
            .set_item_tags(SetItemTagsRequest {
                item_id: 1,
                tags: vec!["Keep".into()],
            })
            .unwrap();
        storage
            .conn
            .lock()
            .unwrap()
            .execute_batch(
                "CREATE TRIGGER fail_item_delete BEFORE DELETE ON clipboard_items
             BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END;",
            )
            .unwrap();
        assert!(storage.delete_item(1).is_err());
        assert_eq!(storage.get_item_tags(1).unwrap(), vec!["Keep"]);
        assert_eq!(storage.get_item(1).unwrap().tags.as_deref(), Some("#Keep"));
    }

    #[test]
    fn stale_enrichment_does_not_apply_tags_after_content_edit() {
        let storage = test_storage_with_migrations();
        insert_test_text_item(&storage, 1, 40_001, "/usr/local/bin/copicu");
        let captured_hash = storage.get_item(1).unwrap().normalized_hash;
        storage
            .update_item_text(1, "plain revised content".into())
            .unwrap();
        let tags = [crate::enrichment::BuiltinEnrichmentMatch {
            detector: crate::enrichment::BuiltinDetector::Path,
            tag: crate::enrichment::BuiltinTag::Path,
            confidence: 1.0,
        }];
        assert!(storage
            .apply_builtin_enrichment(1, &captured_hash, &tags)
            .unwrap()
            .is_empty());
        assert!(storage.get_item_tags(1).unwrap().is_empty());
        assert!(storage.list_tags().unwrap().is_empty());
    }

    #[test]
    fn apply_builtin_enrichment_adds_rule_tag_without_replacing_existing_tags() {
        let storage = test_storage_with_migrations();
        insert_test_text_item(&storage, 1, 40_001, r"C:\dev\chat\copyq-tauri\src\main.tsx");
        storage
            .set_item_tags(SetItemTagsRequest {
                item_id: 1,
                tags: vec!["Work".to_string()],
            })
            .expect("manual tags should save");

        let applied = storage
            .apply_builtin_enrichment(
                1,
                &storage.get_item(1).unwrap().normalized_hash,
                &[crate::enrichment::BuiltinEnrichmentMatch {
                    detector: crate::enrichment::BuiltinDetector::Path,
                    tag: crate::enrichment::BuiltinTag::Path,
                    confidence: 1.0,
                }],
            )
            .expect("builtin enrichment should apply");

        assert_eq!(applied, vec!["path"]);
        let item = storage.get_item(1).expect("item should load");
        assert_eq!(item.tags.as_deref(), Some("#Path #Work"));

        let tags = storage.list_tags().expect("tags should list");
        assert!(tags
            .iter()
            .any(|tag| tag.slug == "path" && tag.item_count == 1));
        assert!(tags
            .iter()
            .any(|tag| tag.slug == "work" && tag.item_count == 1));
    }

    #[test]
    fn apply_builtin_enrichment_is_idempotent_for_existing_rule_tag() {
        let storage = test_storage_with_migrations();
        insert_test_text_item(&storage, 1, 40_001, "/usr/local/bin/copicu");

        let first = storage
            .apply_builtin_enrichment(
                1,
                &storage.get_item(1).unwrap().normalized_hash,
                &[crate::enrichment::BuiltinEnrichmentMatch {
                    detector: crate::enrichment::BuiltinDetector::Path,
                    tag: crate::enrichment::BuiltinTag::Path,
                    confidence: 1.0,
                }],
            )
            .expect("first enrichment should apply");
        let second = storage
            .apply_builtin_enrichment(
                1,
                &storage.get_item(1).unwrap().normalized_hash,
                &[crate::enrichment::BuiltinEnrichmentMatch {
                    detector: crate::enrichment::BuiltinDetector::Path,
                    tag: crate::enrichment::BuiltinTag::Path,
                    confidence: 1.0,
                }],
            )
            .expect("second enrichment should not duplicate");

        assert_eq!(first, vec!["path"]);
        assert!(second.is_empty());
        assert_eq!(
            storage
                .get_item(1)
                .expect("item should load")
                .tags
                .as_deref(),
            Some("#Path")
        );
        assert_eq!(
            storage
                .list_item_rule_tag_slugs(1)
                .expect("rule tags should list"),
            vec!["path".to_string()]
        );
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
    fn parse_history_query_extracts_metadata_scoped_filters() {
        let parsed = parse_history_query(
            r#"meta:invoice title:"Client A" notes:paid ctx:vivaldi -meta:draft"#,
        );

        assert_eq!(parsed.metadata_terms, vec!["invoice"]);
        assert_eq!(parsed.title_terms, vec!["Client A"]);
        assert_eq!(parsed.notes_terms, vec!["paid"]);
        assert_eq!(parsed.context_terms, vec!["vivaldi"]);
        assert_eq!(parsed.excluded_metadata_terms, vec!["draft"]);
        assert!(parsed.text_terms.is_empty());
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
    fn list_page_filters_metadata_scoped_terms() {
        let storage = test_storage_with_migrations();
        insert_test_item(
            &storage,
            TestItem {
                id: 1,
                created_at: 30_001,
                content_kind: "text",
                text: "body has no client keyword",
                mime_primary: Some("text/plain"),
                title: Some("Client invoice"),
                notes: Some("paid by transfer"),
                tags: Some("#Finance"),
            },
        );
        insert_test_item(
            &storage,
            TestItem {
                id: 2,
                created_at: 30_002,
                content_kind: "text",
                text: "client invoice in content only",
                mime_primary: Some("text/plain"),
                title: None,
                notes: None,
                tags: None,
            },
        );
        insert_test_item(
            &storage,
            TestItem {
                id: 3,
                created_at: 30_003,
                content_kind: "text",
                text: "body has no scoped keywords",
                mime_primary: Some("text/plain"),
                title: Some("Draft invoice"),
                notes: Some("needs review"),
                tags: Some("#draft"),
            },
        );
        {
            let conn = storage
                .conn
                .lock()
                .expect("test sqlite connection lock should work");
            conn.execute(
                "UPDATE clipboard_items SET context_search_text = ?1 WHERE id = ?2",
                params!["vivaldi browser client portal", 1_i64],
            )
            .expect("test context should update");
            let capture_context = CaptureContext {
                source_kind: "clipboard".to_string(),
                source_app_name: Some("Notepad".to_string()),
                source_window_title: Some("Invoice - Browser".to_string()),
                ..CaptureContext::default()
            };
            record_capture_event(
                &conn,
                2,
                30_002,
                "text",
                Some("text/plain"),
                None,
                None,
                None,
                None,
                Some(&capture_context),
                None,
            )
            .expect("test context should update");
            conn.execute(
                "UPDATE clipboard_items SET context_search_text = ?1 WHERE id = ?2",
                params!["vivaldi draft portal", 3_i64],
            )
            .expect("test context should update");
        }

        let meta_page = storage
            .list_page(HistoryPageRequest {
                query: "meta:client".to_string(),
                cursor: None,
                limit: Some(10),
            })
            .expect("metadata query should load");
        assert_eq!(ids(&meta_page.items), vec![1]);

        let title_page = storage
            .list_page(HistoryPageRequest {
                query: "title:invoice".to_string(),
                cursor: None,
                limit: Some(10),
            })
            .expect("title query should load");
        assert_eq!(ids(&title_page.items), vec![3, 1]);

        let notes_page = storage
            .list_page(HistoryPageRequest {
                query: "notes:paid".to_string(),
                cursor: None,
                limit: Some(10),
            })
            .expect("notes query should load");
        assert_eq!(ids(&notes_page.items), vec![1]);

        let window_page = storage
            .list_page(HistoryPageRequest {
                query: "window:browser".to_string(),
                cursor: None,
                limit: Some(10),
            })
            .expect("window query should load");
        assert_eq!(ids(&window_page.items), vec![2]);

        let title_does_not_match_window_page = storage
            .list_page(HistoryPageRequest {
                query: "title:browser".to_string(),
                cursor: None,
                limit: Some(10),
            })
            .expect("title query should not use source window title");
        assert!(title_does_not_match_window_page.items.is_empty());

        let context_page = storage
            .list_page(HistoryPageRequest {
                query: "ctx:vivaldi -meta:draft".to_string(),
                cursor: None,
                limit: Some(10),
            })
            .expect("context query should load");
        assert_eq!(ids(&context_page.items), vec![1]);

        let negated_title_page = storage
            .list_page(HistoryPageRequest {
                query: "-title:invoice".to_string(),
                cursor: None,
                limit: Some(10),
            })
            .expect("negated title query should load");
        assert_eq!(ids(&negated_title_page.items), vec![2]);
    }

    #[test]
    fn list_page_applies_excluded_scope_field_union() {
        let storage = test_storage_with_migrations();
        for (id, created_at, text, title, notes) in [
            (
                1,
                30_001,
                "invoice in content",
                Some("invoice title"),
                Some("invoice note"),
            ),
            (
                2,
                30_002,
                "unrelated content",
                Some("invoice title"),
                Some("other note"),
            ),
            (
                3,
                30_003,
                "invoice in content",
                Some("other title"),
                Some("invoice note"),
            ),
            (
                4,
                30_004,
                "unrelated content",
                Some("other title"),
                Some("other note"),
            ),
        ] {
            insert_test_item(
                &storage,
                TestItem {
                    id,
                    created_at,
                    content_kind: "text",
                    text,
                    mime_primary: Some("text/plain"),
                    title,
                    notes,
                    tags: None,
                },
            );
        }
        insert_test_item(
            &storage,
            TestItem {
                id: 5,
                created_at: 30_005,
                content_kind: "text",
                text: "unrelated content",
                mime_primary: Some("application/invoice"),
                title: Some("other title"),
                notes: Some("other note"),
                tags: None,
            },
        );
        insert_test_item(
            &storage,
            TestItem {
                id: 6,
                created_at: 30_006,
                content_kind: "image",
                text: "unrelated content",
                mime_primary: Some("image/png"),
                title: Some("other title"),
                notes: Some("other note"),
                tags: None,
            },
        );
        storage
            .conn
            .lock()
            .expect("test sqlite connection lock should work")
            .execute(
                "UPDATE clipboard_items SET context_search_text = 'invoice context' WHERE id = 4",
                [],
            )
            .expect("test context should update");

        let metadata_without_notes = storage
            .list_page(HistoryPageRequest {
                query: "in:metadata,-notes invoice".to_string(),
                cursor: None,
                limit: Some(10),
            })
            .expect("metadata exclusion query should load");
        assert_eq!(ids(&metadata_without_notes.items), vec![2, 1]);

        let all_without_context = storage
            .list_page(HistoryPageRequest {
                query: "in:-context invoice".to_string(),
                cursor: None,
                limit: Some(10),
            })
            .expect("negative-only context scope query should load");
        assert_eq!(ids(&all_without_context.items), vec![5, 3, 2, 1]);
        let kind_without_context = storage
            .list_page(HistoryPageRequest {
                query: "in:-context image".to_string(),
                cursor: None,
                limit: Some(10),
            })
            .expect("negative-only context should include content kind");
        assert_eq!(ids(&kind_without_context.items), vec![6]);

        let zero_effective_fields = storage
            .list_page(HistoryPageRequest {
                query: "in:notes,-notes invoice".to_string(),
                cursor: None,
                limit: Some(10),
            })
            .expect("zero-field scope query should load");
        assert!(zero_effective_fields.items.is_empty());

        let structured_filter_survives_scope_exclusion = storage
            .list_page(HistoryPageRequest {
                query: "in:notes,-notes title:invoice".to_string(),
                cursor: None,
                limit: Some(10),
            })
            .expect("structured filter should remain independent");
        assert_eq!(
            ids(&structured_filter_survives_scope_exclusion.items),
            vec![2, 1]
        );

        let malformed_scope = storage
            .list_page(HistoryPageRequest {
                query: "in:metadata, invoice".to_string(),
                cursor: None,
                limit: Some(10),
            })
            .expect("malformed scope should fail closed");
        assert!(malformed_scope.items.is_empty());
    }

    #[test]
    fn set_query_marked_uses_scoped_search_plan_filters() {
        let storage = test_storage_with_migrations();
        insert_test_item(
            &storage,
            TestItem {
                id: 1,
                created_at: 30_001,
                content_kind: "text",
                text: "body has no client keyword",
                mime_primary: Some("text/plain"),
                title: Some("Client invoice"),
                notes: None,
                tags: None,
            },
        );
        insert_test_text_item(&storage, 2, 30_002, "client invoice in content only");
        let descriptor = AppliedSearchDescriptor::for_query(
            "title:client",
            "title:client",
            AppliedSearchMode::Structured,
        )
        .expect("title query descriptor should compile");

        storage
            .set_query_marked(SetHistoryQueryMarkedRequest {
                query: "title:client".to_string(),
                marked: true,
                applied_descriptor: Some(descriptor),
            })
            .expect("scoped query should mark matching items");

        let marked_page = storage
            .list_page(HistoryPageRequest {
                query: "is:marked".to_string(),
                cursor: None,
                limit: Some(10),
            })
            .expect("marked query should load");
        assert_eq!(ids(&marked_page.items), vec![1]);
    }

    #[test]
    fn set_query_marked_rejects_malformed_query_even_with_plain_text() {
        let storage = test_storage_with_migrations();
        insert_test_text_item(&storage, 1, 30_001, "first clip");
        insert_test_text_item(&storage, 2, 30_002, "second clip");
        let descriptor = AppliedSearchDescriptor::for_query(
            "kind: clip",
            "kind: clip",
            AppliedSearchMode::Structured,
        )
        .expect("malformed query descriptor should still serialize");

        let error = storage
            .set_query_marked(SetHistoryQueryMarkedRequest {
                query: "kind: clip".to_string(),
                marked: true,
                applied_descriptor: Some(descriptor),
            })
            .expect_err("malformed structured query must not update matching text globally");

        assert!(error.contains("invalid structured syntax"));
        assert_eq!(storage.count_marked().expect("marked count should load"), 0);
    }

    #[test]
    fn set_query_marked_consumes_the_validated_descriptor_plan() {
        let storage = test_storage_with_migrations();
        insert_test_item(
            &storage,
            TestItem {
                id: 1,
                created_at: 30_001,
                content_kind: "text",
                text: "body only",
                mime_primary: Some("text/plain"),
                title: Some("Client invoice"),
                notes: None,
                tags: Some("private"),
            },
        );
        insert_test_item(
            &storage,
            TestItem {
                id: 2,
                created_at: 30_002,
                content_kind: "text",
                text: "client invoice in content",
                mime_primary: Some("text/plain"),
                title: Some("Other"),
                notes: None,
                tags: Some("client"),
            },
        );
        let descriptor = AppliedSearchDescriptor::new(
            "title:client",
            "title:client",
            AppliedSearchMode::Structured,
            search_plan_from_query("tag:client"),
        )
        .expect("descriptor plan should compile");

        storage
            .set_query_marked(SetHistoryQueryMarkedRequest {
                query: "title:client".to_string(),
                marked: true,
                applied_descriptor: Some(descriptor),
            })
            .expect("descriptor plan should drive the scoped update");

        let marked_page = storage
            .list_page(HistoryPageRequest {
                query: "is:marked".to_string(),
                cursor: None,
                limit: Some(10),
            })
            .expect("marked query should load");
        assert_eq!(ids(&marked_page.items), vec![2]);
    }

    #[test]
    fn set_query_marked_requires_an_applied_descriptor() {
        let storage = test_storage_with_migrations();
        insert_test_text_item(&storage, 1, 30_001, "first clip");

        let error = storage
            .set_query_marked(SetHistoryQueryMarkedRequest {
                query: "first".to_string(),
                marked: true,
                applied_descriptor: None,
            })
            .expect_err("query mutations must carry the applied descriptor");

        assert!(error.contains("descriptor is required"));
        assert_eq!(storage.count_marked().expect("marked count should load"), 0);
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
    fn list_page_applies_iso_datetime_offsets_in_manual_queries() {
        let storage = test_storage_with_migrations();
        let june_seventh = days_from_civil(2026, 6, 7).expect("valid date") * MILLIS_PER_DAY;
        let offset_time = june_seventh + 17 * 3_600_000 + 32 * 60_000;
        insert_test_text_item(&storage, 1, offset_time - 1, "before offset");
        insert_test_text_item(&storage, 2, offset_time, "at offset");

        let page = storage
            .list_page(HistoryPageRequest {
                query: "after:2026-06-07T14:32:00-03:00".to_string(),
                cursor: None,
                limit: Some(10),
            })
            .expect("datetime query should load");

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
                display_query: None,
                cursor: None,
                limit: Some(60),
                plan: None,
                mode: HistorySearchMode::Structured,
                include_content: false,
                include_counts: false,
                explain: false,
                ai_context: None,
                applied_descriptor: None,
            })
            .expect("recent benchmark query should load");
        let recent_ms = recent_started.elapsed().as_millis();

        let target_started = Instant::now();
        let target_page = storage
            .history_search(HistorySearchRequest {
                query: "phase7-target-needle".to_string(),
                display_query: None,
                cursor: None,
                limit: Some(60),
                plan: None,
                mode: HistorySearchMode::Structured,
                include_content: false,
                include_counts: false,
                explain: false,
                ai_context: None,
                applied_descriptor: None,
            })
            .expect("target benchmark query should load");
        let target_ms = target_started.elapsed().as_millis();

        let counted_started = Instant::now();
        let counted_page = storage
            .history_search(HistorySearchRequest {
                query: "phase7-target-needle".to_string(),
                display_query: None,
                cursor: None,
                limit: Some(60),
                plan: None,
                mode: HistorySearchMode::Structured,
                include_content: false,
                include_counts: true,
                explain: false,
                ai_context: None,
                applied_descriptor: None,
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
                display_query: None,
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
                applied_descriptor: None,
            })
            .expect("plan search should load");

        assert_eq!(ids(&page.items), vec![1]);
    }

    #[test]
    fn history_search_rejects_cursor_with_custom_sort_until_cursor_is_sort_aware() {
        let storage = test_storage_with_migrations();
        insert_test_text_item(&storage, 1, 30_001, "first clip");
        insert_test_text_item(&storage, 2, 30_002, "second clip");

        let result = storage.history_search(HistorySearchRequest {
            query: String::new(),
            display_query: None,
            cursor: Some(HistoryPageCursor {
                after_sort_unix_ms: 30_001,
                after_id: 1,
                after_is_inbox: false,
                after_inbox_at_unix_ms: None,
            }),
            limit: Some(1),
            plan: Some(SearchPlanV1 {
                schema_version: 1,
                sort: vec![SearchPlanSortV1 {
                    field: SearchPlanSortFieldV1::Created,
                    direction: SearchPlanSortDirectionV1::Asc,
                }],
                ..SearchPlanV1::default()
            }),
            mode: HistorySearchMode::Structured,
            include_content: false,
            include_counts: false,
            explain: false,
            ai_context: None,
            applied_descriptor: None,
        });
        let error = match result {
            Ok(_) => panic!("custom sort cursor must be rejected until it is sort-aware"),
            Err(error) => error,
        };

        assert!(error.contains("custom sort"));
    }

    #[test]
    fn custom_sort_first_page_does_not_return_an_incompatible_cursor() {
        let storage = test_storage_with_migrations();
        insert_test_text_item(&storage, 1, 30_001, "first clip");
        insert_test_text_item(&storage, 2, 30_002, "second clip");

        let page = storage
            .history_search(HistorySearchRequest {
                query: String::new(),
                display_query: None,
                cursor: None,
                limit: Some(1),
                plan: Some(SearchPlanV1 {
                    schema_version: 1,
                    sort: vec![SearchPlanSortV1 {
                        field: SearchPlanSortFieldV1::Created,
                        direction: SearchPlanSortDirectionV1::Asc,
                    }],
                    ..SearchPlanV1::default()
                }),
                mode: HistorySearchMode::Structured,
                include_content: false,
                include_counts: false,
                explain: false,
                ai_context: None,
                applied_descriptor: None,
            })
            .expect("custom sort first page should load");

        assert_eq!(ids(&page.items), vec![1]);
        assert!(page.next_cursor.is_none());
    }

    #[test]
    fn history_search_plan_accepts_scoped_metadata_filters() {
        let storage = test_storage_with_migrations();
        insert_test_item(
            &storage,
            TestItem {
                id: 1,
                created_at: 30_001,
                content_kind: "text",
                text: "body content",
                mime_primary: Some("text/plain"),
                title: Some("Client invoice"),
                notes: Some("paid"),
                tags: Some("finance"),
            },
        );
        insert_test_item(
            &storage,
            TestItem {
                id: 2,
                created_at: 30_002,
                content_kind: "text",
                text: "body content",
                mime_primary: Some("text/plain"),
                title: Some("Draft invoice"),
                notes: Some("client follow-up"),
                tags: Some("draft"),
            },
        );
        {
            let conn = storage
                .conn
                .lock()
                .expect("test sqlite connection lock should work");
            conn.execute(
                "UPDATE clipboard_items SET context_search_text = ?1 WHERE id = ?2",
                params!["vivaldi client portal", 1_i64],
            )
            .expect("test context should update");
            conn.execute(
                "UPDATE clipboard_items SET context_search_text = ?1 WHERE id = ?2",
                params!["vivaldi draft portal", 2_i64],
            )
            .expect("test context should update");
        }

        let page = storage
            .history_search(HistorySearchRequest {
                query: String::new(),
                display_query: None,
                cursor: None,
                limit: None,
                plan: Some(SearchPlanV1 {
                    schema_version: 1,
                    text: None,
                    filters: Some(SearchPlanFiltersV1 {
                        metadata: vec!["client".to_string()],
                        title: vec!["invoice".to_string()],
                        context: vec!["vivaldi".to_string()],
                        not_metadata: vec!["draft".to_string()],
                        ..SearchPlanFiltersV1::default()
                    }),
                    sort: Vec::new(),
                    limit: Some(10),
                }),
                mode: HistorySearchMode::Structured,
                include_content: false,
                include_counts: true,
                explain: false,
                ai_context: None,
                applied_descriptor: None,
            })
            .expect("scoped plan search should load");

        assert_eq!(ids(&page.items), vec![1]);
    }

    #[test]
    fn saved_history_views_validate_query_and_round_trip_hotkey() {
        let storage = test_storage_with_migrations();

        let error = storage
            .create_saved_history_view(CreateSavedHistoryViewRequest {
                title: "Work clips".to_string(),
                query: "tag:work kind:".to_string(),
                hotkey: Some("Ctrl+Alt+W".to_string()),
                capture_tags: vec!["Work".to_string()],
            })
            .expect_err("malformed saved-view query must fail");
        assert!(error.contains("invalid saved history view query"));
        assert!(storage
            .list_saved_history_views()
            .expect("saved views should list")
            .is_empty());

        let saved = storage
            .create_saved_history_view(CreateSavedHistoryViewRequest {
                title: "Work clips".to_string(),
                query: "tag:work kind:text".to_string(),
                hotkey: Some("Ctrl+Alt+W".to_string()),
                capture_tags: vec!["Work".to_string(), "#work".to_string()],
            })
            .expect("valid saved view should persist");
        assert_eq!(saved.title, "Work clips");
        assert_eq!(saved.query, "tag:work kind:text");
        assert_eq!(saved.open_mode, "browse");
        assert_eq!(saved.hotkey.as_deref(), Some("Ctrl+Alt+W"));
        assert_eq!(saved.capture_tags, vec!["Work".to_string()]);

        let updated = storage
            .update_saved_history_view(UpdateSavedHistoryViewRequest {
                id: saved.id,
                title: "Pinned work clips".to_string(),
                query: "tag:work kind:text".to_string(),
                hotkey: None,
                pinned: true,
                sort_order: Some(1),
                capture_tags: vec!["Work".to_string(), "Review".to_string()],
            })
            .expect("valid saved view should update");
        assert!(updated.pinned);
        assert!(updated.hotkey.is_none());
        assert_eq!(updated.title, "Pinned work clips");
        assert_eq!(
            updated.capture_tags,
            vec!["Work".to_string(), "Review".to_string()]
        );

        let saved_views = storage
            .list_saved_history_views()
            .expect("saved views should list");
        assert_eq!(saved_views.len(), 1);
        assert_eq!(saved_views[0].id, saved.id);
        storage
            .delete_saved_history_view(saved.id)
            .expect("saved view should delete");
        assert!(storage
            .list_saved_history_views()
            .expect("saved views should list")
            .is_empty());
    }

    #[test]
    fn scenario_query_migration_preserves_existing_scenarios_and_saved_views() {
        let mut conn = Connection::open_in_memory().expect("in-memory sqlite should open");
        let migrations_before_independent_scenarios =
            Migrations::from_slice(&MIGRATIONS_SLICE[..MIGRATIONS_SLICE.len() - 2]);
        migrations_before_independent_scenarios
            .to_latest(&mut conn)
            .expect("legacy scenario migrations should run");
        conn.execute(
            "INSERT INTO saved_history_views (
                id, title, query, capture_tags, created_at_unix_ms, updated_at_unix_ms
             ) VALUES (41, 'Legacy view', 'tag:legacy kind:text', '[]', 10, 11)",
            [],
        )
        .expect("legacy saved view should insert");
        conn.execute(
            "INSERT INTO scenarios (
                id, name, saved_view_id, revision, client_values_json, project_values_json,
                activity_values_json, tags_json, created_at_unix_ms, updated_at_unix_ms
             ) VALUES (7, 'Legacy scenario', 41, 3, '[\"ACME\"]', '[]', '[]', '[\"Work\"]', 12, 13)",
            [],
        )
        .expect("legacy scenario should insert");

        MIGRATIONS
            .to_latest(&mut conn)
            .expect("independent scenario migration should run");
        let storage = AppStorage {
            conn: Arc::new(Mutex::new(conn)),
            db_path: PathBuf::from("test.sqlite3"),
            app_data_dir: std::env::temp_dir(),
            mutation_epoch: Arc::new(AtomicU64::new(0)),
            #[cfg(test)]
            find_scan_gate: Arc::new(Mutex::new(None)),
        };

        let scenario = storage
            .get_scenario(7)
            .expect("migrated scenario should load");
        assert_eq!(scenario.name, "Legacy scenario");
        assert_eq!(scenario.query, "tag:legacy kind:text");
        assert_eq!(scenario.revision, 3);
        assert_eq!(scenario.properties.client, vec!["ACME"]);
        assert_eq!(scenario.tags, vec!["Work"]);
        let views = storage
            .list_saved_history_views()
            .expect("historical saved view should remain");
        assert_eq!(views.len(), 1);
        assert_eq!(views[0].id, 41);
        assert_eq!(views[0].query, "tag:legacy kind:text");
    }

    #[test]
    fn scenarios_and_saved_views_create_update_and_delete_independently() {
        let storage = test_storage_with_migrations();
        let view = storage
            .create_saved_history_view(CreateSavedHistoryViewRequest {
                title: "ACME clips".to_string(),
                query: "tag:acme".to_string(),
                hotkey: None,
                capture_tags: Vec::new(),
            })
            .expect("saved view should persist");
        let original_views = storage
            .list_saved_history_views()
            .expect("saved views should list");
        let scenario = storage
            .create_scenario_from_query(CreateScenarioFromQueryRequest {
                name: "ACME review".to_string(),
                query: "tag:acme kind:text".to_string(),
                properties: ScenarioProperties {
                    client: vec!["ACME".to_string(), " acme ".to_string()],
                    project: vec!["Portal".to_string()],
                    activity: vec!["Review".to_string()],
                },
                tags: vec!["Work".to_string()],
            })
            .expect("scenario should persist without creating a saved view");
        assert_eq!(scenario.query, "tag:acme kind:text");
        assert_eq!(scenario.properties.client, vec!["ACME"]);
        assert_eq!(
            storage
                .list_saved_history_views()
                .expect("saved views should stay unchanged"),
            original_views
        );

        let updated_scenario = storage
            .update_scenario_from_query(UpdateScenarioFromQueryRequest {
                id: scenario.id,
                name: "ACME QA".to_string(),
                query: "tag:qa kind:text".to_string(),
                properties: ScenarioProperties::default(),
                tags: vec!["QA".to_string()],
            })
            .expect("scenario should update independently");
        assert_eq!(updated_scenario.revision, 2);
        assert_eq!(updated_scenario.query, "tag:qa kind:text");
        assert_eq!(
            storage
                .list_saved_history_views()
                .expect("scenario edit must not change views"),
            original_views
        );

        storage
            .update_saved_history_view(UpdateSavedHistoryViewRequest {
                id: view.id,
                title: "Renamed clips".to_string(),
                query: "tag:renamed".to_string(),
                hotkey: None,
                pinned: false,
                sort_order: None,
                capture_tags: Vec::new(),
            })
            .expect("saved view should update independently");
        assert_eq!(
            storage
                .get_scenario(scenario.id)
                .expect("scenario should remain")
                .query,
            "tag:qa kind:text"
        );
        storage
            .delete_saved_history_view(view.id)
            .expect("saved view should delete independently");
        assert_eq!(
            storage
                .get_scenario(scenario.id)
                .expect("scenario should outlive view")
                .query,
            "tag:qa kind:text"
        );

        storage
            .create_scenario_from_query(CreateScenarioFromQueryRequest {
                name: "Broken".to_string(),
                query: "kind:".to_string(),
                properties: ScenarioProperties::default(),
                tags: Vec::new(),
            })
            .expect_err("invalid scenario query must not persist");
        let unrelated_view = storage
            .create_saved_history_view(CreateSavedHistoryViewRequest {
                title: "Unrelated".to_string(),
                query: "kind:image".to_string(),
                hotkey: None,
                capture_tags: Vec::new(),
            })
            .expect("unrelated saved view should persist");
        storage
            .delete_scenario(scenario.id)
            .expect("scenario should delete independently");
        assert!(storage
            .list_scenarios()
            .expect("scenarios should list")
            .is_empty());
        assert_eq!(
            storage
                .list_saved_history_views()
                .expect("scenario deletion must not change saved views"),
            vec![unrelated_view]
        );
    }

    #[test]
    fn scenario_capture_dedupes_merges_and_records_provenance() {
        let storage = test_storage_with_migrations();
        let session = ActiveScenarioSession {
            session_id: "session-acme-1".to_string(),
            scenario_id: 7,
            scenario_name: "Cliente ACME / Proyecto Web".to_string(),
            scenario_revision: 3,
            query: "tag:acme".to_string(),
            properties: ScenarioProperties {
                client: vec!["ACME".to_string()],
                project: vec!["Web".to_string(), "Portal".to_string()],
                activity: vec!["Development".to_string()],
            },
            tags: vec!["ACME".to_string(), "Client work".to_string()],
            started_at_unix_ms: 10,
        };
        let context = CaptureContext {
            source_kind: "clipboard".to_string(),
            ..CaptureContext::default()
        };
        let hash = hash_text("scenario dedupe");
        let first_id = storage
            .insert_text_with_scenario(
                "scenario dedupe",
                &hash,
                Some(context.clone()),
                &[],
                Some(session.clone()),
            )
            .expect("first scenario capture");
        let second_id = storage
            .insert_text_with_scenario(
                "scenario dedupe",
                &hash,
                Some(context),
                &[],
                Some(session.clone()),
            )
            .expect("scenario recapture");

        assert_eq!(first_id, second_id);
        assert_eq!(storage.list_recent().expect("history").len(), 1);
        assert_eq!(
            storage.list_item_properties(first_id).expect("properties"),
            ScenarioProperties {
                client: vec!["ACME".to_string()],
                project: vec!["Portal".to_string(), "Web".to_string()],
                activity: vec!["Development".to_string()],
            }
        );
        assert_eq!(
            storage.get_item_tags(first_id).expect("tags"),
            vec!["ACME".to_string(), "Client work".to_string()]
        );
        let events = storage
            .list_capture_context_events(first_id, 10)
            .expect("capture events");
        assert_eq!(events.len(), 2);
        assert!(events.iter().all(|event| {
            event.scenario_id == Some(7)
                && event.scenario_session_id.as_deref() == Some("session-acme-1")
                && event.scenario_revision == Some(3)
        }));
    }

    #[test]
    fn manual_metadata_removal_suppresses_scenario_until_manual_restore() {
        let storage = test_storage_with_migrations();
        let session = ActiveScenarioSession {
            session_id: "session-acme-2".to_string(),
            scenario_id: 8,
            scenario_name: "ACME".to_string(),
            scenario_revision: 1,
            query: "tag:acme".to_string(),
            properties: ScenarioProperties {
                client: vec!["ACME".to_string()],
                project: vec!["Web".to_string()],
                activity: Vec::new(),
            },
            tags: vec!["ACME".to_string()],
            started_at_unix_ms: 10,
        };
        let hash = hash_text("suppression item");
        let item_id = storage
            .insert_text_with_scenario("suppression item", &hash, None, &[], Some(session.clone()))
            .expect("scenario capture");

        storage
            .update_item_metadata(UpdateItemMetadataRequest {
                id: item_id,
                title: None,
                notes: None,
                tags: Vec::new(),
                properties: ScenarioProperties {
                    client: Vec::new(),
                    project: vec!["Web".to_string()],
                    activity: Vec::new(),
                },
            })
            .expect("manual removal");
        storage
            .insert_text_with_scenario("suppression item", &hash, None, &[], Some(session.clone()))
            .expect("recapture after suppression");
        assert!(storage.get_item_tags(item_id).expect("tags").is_empty());
        assert!(storage
            .list_item_properties(item_id)
            .expect("properties")
            .client
            .is_empty());

        storage
            .update_item_metadata(UpdateItemMetadataRequest {
                id: item_id,
                title: None,
                notes: None,
                tags: vec!["ACME".to_string()],
                properties: ScenarioProperties {
                    client: vec!["ACME".to_string()],
                    project: vec!["Web".to_string()],
                    activity: Vec::new(),
                },
            })
            .expect("manual restore");
        storage
            .insert_text_with_scenario("suppression item", &hash, None, &[], Some(session))
            .expect("recapture after restore");

        let conn = storage.conn.lock().expect("sqlite lock");
        let property_source: String = conn
            .query_row(
                "SELECT source FROM clipboard_item_properties
                 WHERE item_id = ?1 AND property_key = 'client' AND normalized_value = 'acme'",
                params![item_id],
                |row| row.get(0),
            )
            .expect("client source");
        let tag_source: String = conn
            .query_row(
                "SELECT source FROM clipboard_item_tags
                 WHERE item_id = ?1",
                params![item_id],
                |row| row.get(0),
            )
            .expect("tag source");
        assert_eq!(property_source, "manual");
        assert_eq!(tag_source, "manual");
    }

    #[test]
    fn no_op_metadata_save_preserves_generated_sources_and_confidence() {
        let storage = test_storage_with_migrations();
        let session = ActiveScenarioSession {
            session_id: "session-acme-3".to_string(),
            scenario_id: 9,
            scenario_name: "ACME".to_string(),
            scenario_revision: 1,
            query: "tag:acme".to_string(),
            properties: ScenarioProperties {
                client: vec!["ACME".to_string()],
                project: vec!["Web".to_string()],
                activity: Vec::new(),
            },
            tags: vec!["ACME".to_string()],
            started_at_unix_ms: 10,
        };
        let hash = hash_text("provenance item");
        let item_id = storage
            .insert_text_with_scenario("provenance item", &hash, None, &[], Some(session.clone()))
            .expect("scenario capture");
        storage
            .apply_builtin_enrichment(
                item_id,
                &hash,
                &[crate::enrichment::BuiltinEnrichmentMatch {
                    detector: crate::enrichment::BuiltinDetector::Path,
                    tag: crate::enrichment::BuiltinTag::Path,
                    confidence: 0.75,
                }],
            )
            .expect("rule enrichment should apply");

        let expected_tags = vec![
            MetadataTagEntry {
                value: "ACME".to_string(),
                source: "scenario".to_string(),
                confidence: None,
            },
            MetadataTagEntry {
                value: "Path".to_string(),
                source: "rule".to_string(),
                confidence: Some(0.75),
            },
        ];
        let expected_properties = vec![
            MetadataPropertyEntry {
                key: "client".to_string(),
                value: "ACME".to_string(),
                source: "scenario".to_string(),
            },
            MetadataPropertyEntry {
                key: "project".to_string(),
                value: "Web".to_string(),
                source: "scenario".to_string(),
            },
        ];
        assert_eq!(
            storage.get_item_tag_entries(item_id).expect("tag entries"),
            expected_tags
        );
        assert_eq!(
            storage
                .list_item_property_entries(item_id)
                .expect("property entries"),
            expected_properties
        );

        storage
            .update_item_metadata(UpdateItemMetadataRequest {
                id: item_id,
                title: None,
                notes: Some("edited notes".to_string()),
                tags: vec!["ACME".to_string(), "Path".to_string()],
                properties: ScenarioProperties {
                    client: vec!["ACME".to_string()],
                    project: vec!["Web".to_string()],
                    activity: Vec::new(),
                },
            })
            .expect("no-op metadata save");

        assert_eq!(
            storage.get_item_tag_entries(item_id).expect("tag entries"),
            expected_tags,
            "a no-op save must not promote generated tags to manual"
        );
        assert_eq!(
            storage
                .list_item_property_entries(item_id)
                .expect("property entries"),
            expected_properties,
            "a no-op save must not promote generated properties to manual"
        );
    }

    #[test]
    fn metadata_save_marks_only_newly_added_values_manual() {
        let storage = test_storage_with_migrations();
        let session = ActiveScenarioSession {
            session_id: "session-acme-4".to_string(),
            scenario_id: 10,
            scenario_name: "ACME".to_string(),
            scenario_revision: 1,
            query: "tag:acme".to_string(),
            properties: ScenarioProperties {
                client: vec!["ACME".to_string()],
                project: vec!["Web".to_string()],
                activity: Vec::new(),
            },
            tags: vec!["ACME".to_string()],
            started_at_unix_ms: 10,
        };
        let hash = hash_text("mixed provenance item");
        let item_id = storage
            .insert_text_with_scenario(
                "mixed provenance item",
                &hash,
                None,
                &[],
                Some(session.clone()),
            )
            .expect("scenario capture");

        storage
            .update_item_metadata(UpdateItemMetadataRequest {
                id: item_id,
                title: None,
                notes: None,
                tags: vec!["ACME".to_string(), "Invoice".to_string()],
                properties: ScenarioProperties {
                    client: vec!["ACME".to_string()],
                    project: Vec::new(),
                    activity: vec!["Billing".to_string()],
                },
            })
            .expect("metadata save with additions and removals");

        assert_eq!(
            storage.get_item_tag_entries(item_id).expect("tag entries"),
            vec![
                MetadataTagEntry {
                    value: "ACME".to_string(),
                    source: "scenario".to_string(),
                    confidence: None,
                },
                MetadataTagEntry {
                    value: "Invoice".to_string(),
                    source: "manual".to_string(),
                    confidence: None,
                },
            ]
        );
        assert_eq!(
            storage
                .list_item_property_entries(item_id)
                .expect("property entries"),
            vec![
                MetadataPropertyEntry {
                    key: "activity".to_string(),
                    value: "Billing".to_string(),
                    source: "manual".to_string(),
                },
                MetadataPropertyEntry {
                    key: "client".to_string(),
                    value: "ACME".to_string(),
                    source: "scenario".to_string(),
                },
            ]
        );

        storage
            .insert_text_with_scenario("mixed provenance item", &hash, None, &[], Some(session))
            .expect("recapture after removal");
        assert!(
            storage
                .list_item_property_entries(item_id)
                .expect("property entries")
                .iter()
                .all(|entry| entry.key != "project"),
            "a removed value stays suppressed against scenario recapture"
        );
    }

    #[test]
    fn find_snapshot_reads_without_the_operational_connection_mutex() {
        let app_data_dir =
            std::env::temp_dir().join(format!("copicu-find-snapshot-test-{}", now_unix_ms()));
        let storage = AppStorage::open(&app_data_dir).expect("file-backed storage should open");
        storage
            .insert_text("invoice snapshot", &hash_text("invoice snapshot"))
            .expect("test item should insert");
        let descriptor =
            AppliedSearchDescriptor::for_query("all", "", AppliedSearchMode::Structured)
                .expect("descriptor should compile");

        let operational_lock = storage.conn.lock().expect("operational lock should work");
        let worker_storage = storage.clone();
        let worker_descriptor = descriptor.clone();
        let read_worker =
            std::thread::spawn(move || worker_storage.read_find_items(&worker_descriptor));
        let writer_storage = storage.clone();
        let writer = std::thread::spawn(move || {
            writer_storage.update_item(UpdateHistoryItemRequest {
                id: 1,
                text: "invoice snapshot writer".to_string(),
                title: None,
                notes: None,
                tags: None,
                mime_primary: Some("text/plain".to_string()),
                marked: None,
            })
        });
        let rows = read_worker
            .join()
            .expect("Find read worker should finish while the operational lock is held")
            .expect("Find read worker should read the snapshot");
        drop(operational_lock);
        writer
            .join()
            .expect("writer should finish after the operational lock is released")
            .expect("writer should update the item");

        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].text, "invoice snapshot");
        drop(storage);
        let _ = std::fs::remove_dir_all(app_data_dir);
    }

    #[test]
    fn find_snapshot_reproduces_plan_limit_and_custom_sort_membership() {
        let app_data_dir =
            std::env::temp_dir().join(format!("copicu-find-limit-test-{}", now_unix_ms()));
        let storage = AppStorage::open(&app_data_dir).expect("file-backed storage should open");
        let first = storage
            .insert_text("first invoice", &hash_text("first invoice"))
            .expect("first item should insert");
        let second = storage
            .insert_text("second invoice", &hash_text("second invoice"))
            .expect("second item should insert");
        {
            let conn = storage.conn.lock().expect("sqlite lock should work");
            conn.execute(
                "UPDATE clipboard_items SET created_at_unix_ms = ?1 WHERE id = ?2",
                params![10_i64, first],
            )
            .expect("first timestamp should update");
            conn.execute(
                "UPDATE clipboard_items SET created_at_unix_ms = ?1 WHERE id = ?2",
                params![20_i64, second],
            )
            .expect("second timestamp should update");
        }
        let descriptor = AppliedSearchDescriptor::new(
            "invoice",
            "invoice",
            AppliedSearchMode::Structured,
            SearchPlanV1 {
                schema_version: 1,
                text: Some(SearchPlanTextV1 {
                    all: vec!["invoice".to_string()],
                    ..SearchPlanTextV1::default()
                }),
                sort: vec![SearchPlanSortV1 {
                    field: SearchPlanSortFieldV1::Created,
                    direction: SearchPlanSortDirectionV1::Asc,
                }],
                limit: Some(1),
                ..SearchPlanV1::default()
            },
        )
        .expect("limited descriptor should compile");
        let rows = storage
            .read_find_items(&descriptor)
            .expect("Find snapshot should use the descriptor limit");
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].id, first);
        drop(storage);
        let _ = std::fs::remove_dir_all(app_data_dir);
    }

    #[test]
    fn find_snapshot_none_is_unbounded_while_some_is_exact() {
        let app_data_dir =
            std::env::temp_dir().join(format!("copicu-find-unbounded-test-{}", now_unix_ms()));
        let storage = AppStorage::open(&app_data_dir).expect("file-backed storage should open");
        storage
            .insert_find_benchmark_items(75)
            .expect("benchmark rows should insert");

        let unbounded =
            AppliedSearchDescriptor::for_query("all", "", AppliedSearchMode::Structured)
                .expect("unbounded descriptor should compile");
        let rows = storage
            .read_find_items(&unbounded)
            .expect("unbounded Find snapshot should load");
        assert_eq!(rows.len(), 75);

        let limited = AppliedSearchDescriptor::new(
            "all",
            "",
            AppliedSearchMode::Structured,
            SearchPlanV1 {
                schema_version: 1,
                limit: Some(7),
                ..SearchPlanV1::default()
            },
        )
        .expect("limited descriptor should compile");
        let limited_rows = storage
            .read_find_items(&limited)
            .expect("limited Find snapshot should load");
        assert_eq!(limited_rows.len(), 7);
        drop(storage);
        let _ = std::fs::remove_dir_all(app_data_dir);
    }

    #[test]
    fn find_snapshot_cancellation_is_checked_while_rows_are_read() {
        let app_data_dir =
            std::env::temp_dir().join(format!("copicu-find-cancel-test-{}", now_unix_ms()));
        let storage = AppStorage::open(&app_data_dir).expect("file-backed storage should open");
        storage
            .insert_text("cancel invoice", &hash_text("cancel invoice"))
            .expect("test item should insert");
        let descriptor =
            AppliedSearchDescriptor::for_query("all", "", AppliedSearchMode::Structured)
                .expect("descriptor should compile");
        let cancelled = Arc::new(AtomicBool::new(true));
        let expected_epoch = storage.mutation_epoch.load(Ordering::SeqCst);
        let error = storage
            .read_find_items_cancelable(
                &descriptor,
                cancelled,
                storage.mutation_epoch.clone(),
                expected_epoch,
            )
            .unwrap_err();
        assert_eq!(error, "find start superseded");
        drop(storage);
        let _ = std::fs::remove_dir_all(app_data_dir);
    }

    #[test]
    fn find_snapshot_cancellation_interrupts_before_first_row() {
        let app_data_dir = std::env::temp_dir().join(format!(
            "copicu-find-cancel-before-row-test-{}",
            now_unix_ms()
        ));
        let storage = AppStorage::open(&app_data_dir).expect("file-backed storage should open");
        storage
            .insert_find_benchmark_items(50_000)
            .expect("benchmark rows should insert");
        let descriptor =
            AppliedSearchDescriptor::for_query("all", "", AppliedSearchMode::Structured)
                .expect("descriptor should compile");
        let cancelled = Arc::new(AtomicBool::new(false));
        let expected_epoch = storage.mutation_epoch.load(Ordering::SeqCst);
        let gate = Arc::new(FindScanGate {
            reached: std::sync::Barrier::new(2),
            release: std::sync::Barrier::new(2),
        });
        let test_gate = gate.clone();
        storage.install_find_before_first_row_gate(gate);
        let worker_storage = storage.clone();
        let worker_cancelled = cancelled.clone();
        let worker_epoch = storage.mutation_epoch.clone();
        let worker = std::thread::spawn(move || {
            worker_storage.read_find_items_cancelable(
                &descriptor,
                worker_cancelled,
                worker_epoch,
                expected_epoch,
            )
        });
        test_gate.reached.wait();
        cancelled.store(true, Ordering::SeqCst);
        test_gate.release.wait();
        let error = worker
            .join()
            .expect("Find cancellation worker should join")
            .expect_err("cancelled scan should not publish rows");
        assert_eq!(error, "find start superseded");
        drop(storage);
        let _ = std::fs::remove_dir_all(app_data_dir);
    }

    #[test]
    fn find_snapshot_writer_finishes_while_read_connection_is_scanning() {
        let app_data_dir = std::env::temp_dir().join(format!(
            "copicu-find-writer-concurrent-test-{}",
            now_unix_ms()
        ));
        let storage = AppStorage::open(&app_data_dir).expect("file-backed storage should open");
        storage
            .insert_find_benchmark_items(50_000)
            .expect("benchmark rows should insert");
        let descriptor =
            AppliedSearchDescriptor::for_query("all", "", AppliedSearchMode::Structured)
                .expect("descriptor should compile");
        let cancelled = Arc::new(AtomicBool::new(false));
        let expected_epoch = storage.mutation_epoch.load(Ordering::SeqCst);
        let gate = Arc::new(FindScanGate {
            reached: std::sync::Barrier::new(2),
            release: std::sync::Barrier::new(2),
        });
        let test_gate = gate.clone();
        storage.install_find_before_first_row_gate(gate);
        let worker_storage = storage.clone();
        let worker_cancelled = cancelled.clone();
        let worker_epoch = storage.mutation_epoch.clone();
        let worker = std::thread::spawn(move || {
            worker_storage.read_find_items_cancelable(
                &descriptor,
                worker_cancelled,
                worker_epoch,
                expected_epoch,
            )
        });
        test_gate.reached.wait();

        let writer_storage = storage.clone();
        let writer = std::thread::spawn(move || {
            writer_storage.update_item(UpdateHistoryItemRequest {
                id: 1,
                text: "writer completed during Find scan".to_string(),
                title: None,
                notes: None,
                tags: None,
                mime_primary: Some("text/plain".to_string()),
                marked: None,
            })
        });
        writer
            .join()
            .expect("writer should join while Find holds read transaction")
            .expect("writer should complete operationally");
        test_gate.release.wait();
        let error = worker
            .join()
            .expect("Find writer concurrency worker should join")
            .expect_err("epoch-changing writer should invalidate the scan");
        assert_eq!(error, "find session invalidated");
        drop(storage);
        let _ = std::fs::remove_dir_all(app_data_dir);
    }

    #[test]
    fn find_mutation_epoch_distinguishes_captures_from_operational_metadata_writes() {
        let storage = test_storage_with_migrations();
        let initial_epoch = storage.mutation_epoch.load(Ordering::SeqCst);
        let item_id = storage
            .insert_text("epoch capture", &hash_text("epoch capture"))
            .expect("capture should insert");
        assert_eq!(
            storage.mutation_epoch.load(Ordering::SeqCst),
            initial_epoch,
            "new captures must not invalidate Find"
        );

        storage
            .update_item(UpdateHistoryItemRequest {
                id: item_id,
                text: "epoch edited".to_string(),
                title: None,
                notes: None,
                tags: None,
                mime_primary: Some("text/plain".to_string()),
                marked: None,
            })
            .expect("edit should succeed");
        let edited_epoch = storage.mutation_epoch.load(Ordering::SeqCst);
        assert!(edited_epoch > initial_epoch);

        let recapture = storage
            .create_text_item(CreateHistoryItemRequest {
                text: "epoch edited".to_string(),
                title: Some("recapture".to_string()),
                notes: None,
                tags: Vec::new(),
                properties: ScenarioProperties::default(),
                mime_primary: Some("text/plain".to_string()),
            })
            .expect("deduplicated recapture should succeed");
        assert!(!recapture.created);
        let recapture_epoch = storage.mutation_epoch.load(Ordering::SeqCst);
        assert!(
            recapture_epoch > edited_epoch,
            "metadata-changing deduplicated recaptures must invalidate Find"
        );

        let inert_recapture = storage
            .create_text_item(CreateHistoryItemRequest {
                text: "epoch edited".to_string(),
                title: None,
                notes: None,
                tags: Vec::new(),
                properties: ScenarioProperties::default(),
                mime_primary: Some("text/plain".to_string()),
            })
            .expect("inert deduplicated recapture should succeed");
        assert!(!inert_recapture.created);
        assert_eq!(
            storage.mutation_epoch.load(Ordering::SeqCst),
            recapture_epoch,
            "recaptures without projection changes must preserve Find"
        );

        storage
            .set_item_tags(SetItemTagsRequest {
                item_id,
                tags: vec!["epoch".to_string()],
            })
            .expect("tag edit should succeed");
        assert!(storage.mutation_epoch.load(Ordering::SeqCst) > edited_epoch);
    }

    #[test]
    fn external_text_update_preserves_item_metadata() {
        let storage = test_storage_with_migrations();
        let created = storage
            .create_text_item(CreateHistoryItemRequest {
                text: "before external edit".to_string(),
                title: Some("Pinned note".to_string()),
                notes: Some("Keep these notes".to_string()),
                tags: vec!["#work".to_string()],
                properties: ScenarioProperties::default(),
                mime_primary: Some("text/markdown".to_string()),
            })
            .expect("item should be created");

        storage
            .update_item_text(created.id, "after external edit".to_string())
            .expect("external text update should succeed");

        let item = storage
            .get_item(created.id)
            .expect("updated item should load");
        assert_eq!(item.text, "after external edit");
        assert_eq!(item.title.as_deref(), Some("Pinned note"));
        assert_eq!(item.notes.as_deref(), Some("Keep these notes"));
        assert_eq!(item.tags.as_deref(), Some("#work"));
        assert_eq!(item.mime_primary.as_deref(), Some("text/markdown"));
    }

    #[test]
    fn capture_pruning_advances_find_epoch_when_it_removes_snapshot_items() {
        let storage = test_storage_with_migrations();
        let target_id = storage
            .insert_text("prunable invoice", &hash_text("prunable invoice"))
            .expect("target capture should succeed");
        let initial_epoch = storage.mutation_epoch.load(Ordering::SeqCst);
        let settings = AppSettings {
            history: HistorySettings {
                retention_count: MIN_RETENTION_COUNT,
                ..AppSettings::default().history
            },
            ..AppSettings::default()
        };
        {
            let conn = storage.conn.lock().expect("sqlite lock should work");
            conn.execute(
                "INSERT INTO app_settings (key, value_json, updated_at_unix_ms)
                 VALUES (?1, ?2, 1)
                 ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json",
                params![
                    APP_SETTINGS_KEY,
                    serde_json::to_string(&settings).expect("settings should serialize")
                ],
            )
            .expect("retention settings should persist");
        }

        for index in 0..MIN_RETENTION_COUNT {
            let text = format!("new invoice filler {index}");
            storage
                .insert_text(&text, &hash_text(&text))
                .expect("pruning capture should succeed");
        }
        assert!(storage.mutation_epoch.load(Ordering::SeqCst) > initial_epoch);
        assert!(storage.get_item(target_id).is_err());
        let retained = storage
            .conn
            .lock()
            .expect("sqlite lock should work")
            .query_row("SELECT COUNT(*) FROM clipboard_items", [], |row| {
                row.get::<_, i64>(0)
            })
            .expect("retained item count should load");
        assert_eq!(retained, MIN_RETENTION_COUNT);
    }

    fn test_app_data_dir() -> PathBuf {
        static NEXT_DIR: AtomicU64 = AtomicU64::new(0);
        std::env::temp_dir().join(format!(
            "copicu-storage-test-{}-{}-{}",
            std::process::id(),
            now_unix_ms(),
            NEXT_DIR.fetch_add(1, Ordering::Relaxed),
        ))
    }

    fn test_storage() -> AppStorage {
        let app_data_dir = test_app_data_dir();
        let conn = Connection::open_in_memory().expect("in-memory sqlite should open");
        add_regexp_function(&conn).expect("regexp function should register");

        AppStorage {
            conn: Arc::new(Mutex::new(conn)),
            db_path: app_data_dir.join(DATABASE_FILE_NAME),
            app_data_dir,
            mutation_epoch: Arc::new(AtomicU64::new(0)),
            #[cfg(test)]
            find_scan_gate: Arc::new(Mutex::new(None)),
        }
    }

    fn test_storage_with_migrations() -> AppStorage {
        let app_data_dir = test_app_data_dir();
        let mut conn = Connection::open_in_memory().expect("in-memory sqlite should open");
        MIGRATIONS
            .to_latest(&mut conn)
            .expect("migrations should run");
        add_regexp_function(&conn).expect("regexp function should register");

        AppStorage {
            conn: Arc::new(Mutex::new(conn)),
            db_path: app_data_dir.join(DATABASE_FILE_NAME),
            app_data_dir,
            mutation_epoch: Arc::new(AtomicU64::new(0)),
            #[cfg(test)]
            find_scan_gate: Arc::new(Mutex::new(None)),
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
