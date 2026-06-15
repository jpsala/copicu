use serde::{Deserialize, Serialize};

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
    pub(crate) fn as_log_value(&self) -> &'static str {
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
    Active,
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
