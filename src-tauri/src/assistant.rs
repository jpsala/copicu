use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    fs,
    io::{BufRead, BufReader, Write},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{mpsc, Arc, Condvar, Mutex},
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::{Emitter, Manager};
const ASSISTANT_WINDOW_LABEL: &str = "assistant";
const MAIN_WINDOW_LABEL: &str = "main";
const UPDATED_EVENT: &str = "copicu://assistant/updated";
const CONVERSATION_FILE: &str = "assistant-conversation.json";
const NODE: &str = "node";
static NEXT_OPERATION: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(1);

#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AssistantContext {
    pub active_item_id: Option<String>,
    pub selected_item_ids: Vec<String>,
    pub query: String,
    pub visible_item_ids: Vec<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AssistantMessage {
    pub id: String,
    pub role: String,
    pub text: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub arguments: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<String>,
    pub created_at: u64,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AssistantApproval {
    pub id: String,
    pub name: String,
    pub arguments: Value,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AssistantModelChoice {
    pub model: String,
    pub reasoning_effort: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AssistantModelOption {
    pub id: String,
    pub name: String,
    pub reasoning_efforts: Vec<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AssistantModelCatalog {
    pub endpoint: String,
    pub models: Vec<AssistantModelOption>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AssistantSnapshot {
    pub messages: Vec<AssistantMessage>,
    pub running: bool,
    pub context: AssistantContext,
    pub approval: Option<AssistantApproval>,
    pub error: Option<String>,
    pub configured: bool,
    pub model: String,
    pub reasoning_effort: Option<String>,
    pub default_model: Option<AssistantModelChoice>,
    pub execution_mode: String,
    pub endpoint: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssistantSendRequest {
    pub text: String,
    #[serde(default)]
    pub picker_quick_prompt: bool,
}
#[derive(Clone)]
struct AssistantTurnConfig {
    model_choice: Option<AssistantModelChoice>,
    execution_mode: String,
    runtime: crate::ai_planner::AiRuntimeSettings,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PersistedConversation {
    messages: Vec<AssistantMessage>,
    provider_messages: Vec<Value>,
    context: AssistantContext,
    configured: bool,
    model: String,
    endpoint: String,
    #[serde(default)]
    conversation_endpoint: Option<String>,
    #[serde(default)]
    model_choice: Option<AssistantModelChoice>,
    #[serde(default)]
    default_model: Option<AssistantModelChoice>,
}

struct AssistantInner {
    messages: Vec<AssistantMessage>,
    provider_messages: Vec<Value>,
    context: AssistantContext,
    running: bool,
    approval: Option<AssistantApproval>,
    approval_decision: Option<bool>,
    error: Option<String>,
    configured: bool,
    model: String,
    endpoint: String,
    conversation_endpoint: Option<String>,
    model_choice: Option<AssistantModelChoice>,
    default_model: Option<AssistantModelChoice>,
    execution_mode: String,
    active_assistant_id: Option<String>,
    recovery_required: bool,
}

#[derive(Clone)]
pub struct AssistantState {
    gate: Arc<(Mutex<AssistantInner>, Condvar)>,
    cancel_requested: Arc<std::sync::atomic::AtomicBool>,
    profile_dir: PathBuf,
}

impl AssistantState {
    pub fn open(profile_dir: &Path) -> Result<Self, String> {
        fs::create_dir_all(profile_dir)
            .map_err(|e| format!("failed to create assistant profile directory: {e}"))?;
        let path = profile_dir.join(CONVERSATION_FILE);
        let mut load_error = None;
        let persisted = if path.exists() {
            match fs::read(&path)
                .map_err(|error| error.to_string())
                .and_then(|bytes| {
                    serde_json::from_slice::<PersistedConversation>(&bytes)
                        .map_err(|error| error.to_string())
                }) {
                Ok(value) => Some(value),
                Err(error) => {
                    load_error = Some(format!("Saved assistant conversation could not be loaded: {error}. Reset to start a new conversation."));
                    None
                }
            }
        } else {
            None
        };
        let mut inner = persisted
            .map(|p| {
                let conversation_endpoint = p
                    .conversation_endpoint
                    .or_else(|| (!p.provider_messages.is_empty()).then_some(p.endpoint.clone()));
                AssistantInner {
                    messages: p.messages,
                    provider_messages: p.provider_messages,
                    context: p.context,
                    running: false,
                    approval: None,
                    approval_decision: None,
                    error: None,
                    configured: p.configured,
                    model: p.model,
                    endpoint: p.endpoint,
                    conversation_endpoint,
                    model_choice: p.model_choice,
                    default_model: p.default_model,
                    execution_mode: "yolo".to_string(),
                    active_assistant_id: None,
                    recovery_required: false,
                }
            })
            .unwrap_or_else(|| AssistantInner {
                messages: Vec::new(),
                provider_messages: Vec::new(),
                context: AssistantContext::default(),
                running: false,
                approval: None,
                approval_decision: None,
                recovery_required: load_error.is_some(),
                error: load_error,
                configured: false,
                model: String::new(),
                endpoint: String::new(),
                model_choice: None,
                conversation_endpoint: None,
                default_model: None,
                execution_mode: "yolo".to_string(),
                active_assistant_id: None,
            });
        let mut interrupted = false;
        for message in &mut inner.messages {
            if message.status.as_deref() == Some("running") {
                interrupted = true;
                message.status = Some("failed".to_string());
                if message.role == "tool" {
                    message.text.push_str(
                        "\nPrevious run was interrupted. Verify the result before retrying; completed effects were not rolled back.",
                    );
                }
            }
        }
        if interrupted {
            inner.error = Some(
                "The previous turn was interrupted. Pending operations were not resumed; completed effects were not rolled back."
                    .to_string(),
            );
        }
        Ok(Self {
            gate: Arc::new((Mutex::new(inner), Condvar::new())),
            cancel_requested: Arc::new(std::sync::atomic::AtomicBool::new(false)),
            profile_dir: profile_dir.to_path_buf(),
        })
    }

    pub fn update_context(&self, context: AssistantContext) -> Result<(), String> {
        let (lock, _) = &*self.gate;
        let mut inner = lock
            .lock()
            .map_err(|_| "assistant state lock poisoned".to_string())?;
        inner.context = context;
        Ok(())
    }

    pub fn snapshot(&self) -> Result<AssistantSnapshot, String> {
        let (lock, _) = &*self.gate;
        let inner = lock
            .lock()
            .map_err(|_| "assistant state lock poisoned".to_string())?;
        Ok(snapshot_locked(&inner))
    }
    fn refresh_runtime_metadata(&self, storage: &crate::storage::AppStorage) {
        let settings = match storage.get_settings() {
            Ok(settings) => settings,
            Err(_) => return,
        };
        let project_root = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
        let runtime = crate::ai_planner::resolve_ai_runtime_settings(&settings.ai, &project_root);
        let (lock, _) = &*self.gate;
        if let Ok(mut inner) = lock.lock() {
            if let Ok(runtime) = runtime {
                inner.configured = settings.ai.enabled && !runtime.api_key.is_empty();
                inner.model = inner
                    .model_choice
                    .as_ref()
                    .or(inner.default_model.as_ref())
                    .map(|choice| choice.model.clone())
                    .unwrap_or(runtime.model);
                inner.endpoint = runtime.endpoint;
            } else {
                inner.configured = false;
                if inner.model_choice.is_none() && inner.default_model.is_none() {
                    inner.model = settings.ai.model;
                }
                inner.endpoint = settings.ai.endpoint.trim_end_matches('/').to_string();
            }
        }
    }

    fn emit(&self, app: &tauri::AppHandle) {
        if let Ok(snapshot) = self.snapshot() {
            if let Some(window) = app.get_webview_window(ASSISTANT_WINDOW_LABEL) {
                let _ = window.emit(UPDATED_EVENT, snapshot);
            }
        }
    }

    fn update<F>(&self, app: &tauri::AppHandle, f: F)
    where
        F: FnOnce(&mut AssistantInner),
    {
        self.update_inner(app, f, true);
    }

    fn update_ephemeral<F>(&self, f: F)
    where
        F: FnOnce(&mut AssistantInner),
    {
        let (lock, _) = &*self.gate;
        if let Ok(mut inner) = lock.lock() {
            f(&mut inner);
        }
    }

    fn update_inner<F>(&self, app: &tauri::AppHandle, f: F, persist: bool)
    where
        F: FnOnce(&mut AssistantInner),
    {
        {
            let (lock, _) = &*self.gate;
            if let Ok(mut inner) = lock.lock() {
                f(&mut inner);
                if persist {
                    if let Err(error) = persist_locked(&self.profile_dir, &inner) {
                        inner.error = Some(format!("Conversation could not be saved: {error}"));
                    }
                }
            }
        }
        self.emit(app);
    }

    pub fn send(
        &self,
        app: tauri::AppHandle,
        storage: crate::storage::AppStorage,
        request: AssistantSendRequest,
    ) -> Result<(), String> {
        let text = request.text.trim().to_string();
        if text.is_empty() {
            return Err("assistant message cannot be empty".to_string());
        }
        let settings = storage
            .get_settings()
            .map_err(|error| format!("failed to read AI settings: {error}"))?;
        if !settings.ai.enabled {
            return Err("AI assistant is disabled in settings.".to_string());
        }
        let project_root = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
        let runtime = crate::ai_planner::resolve_ai_runtime_settings(&settings.ai, &project_root)
            .map_err(|error| redact_error(&error))?;
        let turn_config;
        {
            let (lock, _) = &*self.gate;
            let mut inner = lock
                .lock()
                .map_err(|_| "assistant state lock poisoned".to_string())?;
            if inner.recovery_required {
                return Err(
                    "Reset the unreadable saved conversation before sending a new message."
                        .to_string(),
                );
            }
            if inner.running {
                return Err("assistant is already running".to_string());
            }
            check_conversation_endpoint(inner.conversation_endpoint.as_deref(), &runtime.endpoint)?;
            let first_turn = inner.conversation_endpoint.is_none();
            if first_turn {
                inner.conversation_endpoint = Some(runtime.endpoint.clone());
            }
            let now = now_ms();
            inner.messages.push(AssistantMessage {
                id: format!("user-{now}"),
                role: "user".to_string(),
                text: text.clone(),
                tool_name: None,
                arguments: None,
                status: Some("completed".to_string()),
                created_at: now,
            });
            let provider_text = if request.picker_quick_prompt {
                format!(
                    "{text}\n\n[Copicu request source, not user content]\nThis turn was submitted from the picker quick prompt. Apply a picker filter when that is the requested outcome."
                )
            } else {
                text.clone()
            };
            inner
                .provider_messages
                .push(json!({"role":"user","content":provider_text}));
            inner.running = true;
            inner.error = None;
            inner.approval = None;
            inner.approval_decision = None;
            inner.active_assistant_id = Some(format!("assistant-{now}"));
            self.cancel_requested
                .store(false, std::sync::atomic::Ordering::SeqCst);
            turn_config = AssistantTurnConfig {
                model_choice: inner
                    .model_choice
                    .clone()
                    .or_else(|| inner.default_model.clone()),
                execution_mode: inner.execution_mode.clone(),
                runtime,
            };
            if let Err(error) = persist_locked(&self.profile_dir, &inner) {
                inner.running = false;
                inner.active_assistant_id = None;
                inner.messages.pop();
                inner.provider_messages.pop();
                if first_turn {
                    inner.conversation_endpoint = None;
                }
                return Err(error);
            }
        }
        self.emit(&app);
        let state = self.clone();
        thread::spawn(move || run_turn(state, app, storage, turn_config));
        Ok(())
    }
    pub fn cancel(&self) -> Result<(), String> {
        let (lock, cv) = &*self.gate;
        let inner = lock
            .lock()
            .map_err(|_| "assistant state lock poisoned".to_string())?;
        if inner.running {
            self.cancel_requested
                .store(true, std::sync::atomic::Ordering::SeqCst);
            cv.notify_all();
        }
        Ok(())
    }

    pub fn approve(&self, id: String, approved: bool) -> Result<(), String> {
        let (lock, cv) = &*self.gate;
        let mut inner = lock
            .lock()
            .map_err(|_| "assistant state lock poisoned".to_string())?;
        let Some(pending) = inner.approval.as_ref() else {
            return Err("no assistant approval is pending".to_string());
        };
        if pending.id != id {
            return Err("approval id does not match the pending operation".to_string());
        }
        inner.approval_decision = Some(approved);
        inner.approval = None;
        cv.notify_all();
        Ok(())
    }

    pub fn reset(&self) -> Result<(), String> {
        let (lock, _) = &*self.gate;
        let mut inner = lock
            .lock()
            .map_err(|_| "assistant state lock poisoned".to_string())?;
        if inner.running {
            return Err("cannot reset while assistant is running".to_string());
        }
        inner.messages.clear();
        inner.provider_messages.clear();
        inner.conversation_endpoint = None;
        inner.approval = None;
        inner.error = None;
        inner.active_assistant_id = None;
        inner.model_choice = None;
        if let Some(default_model) = inner.default_model.as_ref() {
            inner.model = default_model.model.clone();
        }
        inner.execution_mode = "yolo".to_string();
        persist_locked(&self.profile_dir, &inner)?;
        inner.recovery_required = false;
        Ok(())
    }
}

fn snapshot_locked(inner: &AssistantInner) -> AssistantSnapshot {
    let choice = inner.model_choice.as_ref().or(inner.default_model.as_ref());
    AssistantSnapshot {
        messages: inner.messages.clone(),
        running: inner.running,
        context: inner.context.clone(),
        approval: inner.approval.clone(),
        error: inner.error.clone(),
        configured: inner.configured,
        model: inner.model.clone(),
        reasoning_effort: choice.and_then(|choice| choice.reasoning_effort.clone()),
        default_model: inner.default_model.clone(),
        execution_mode: inner.execution_mode.clone(),
        endpoint: inner.endpoint.clone(),
    }
}

fn persist_locked(profile_dir: &Path, inner: &AssistantInner) -> Result<(), String> {
    let payload = PersistedConversation {
        messages: inner.messages.clone(),
        provider_messages: inner
            .provider_messages
            .iter()
            .map(sanitize_persisted)
            .collect(),
        context: inner.context.clone(),
        configured: inner.configured,
        model: inner.model.clone(),
        conversation_endpoint: inner.conversation_endpoint.clone(),
        endpoint: inner.endpoint.clone(),
        model_choice: inner.model_choice.clone(),
        default_model: inner.default_model.clone(),
    };
    let bytes = serde_json::to_vec_pretty(&payload)
        .map_err(|e| format!("failed to encode assistant conversation: {e}"))?;
    let path = profile_dir.join(CONVERSATION_FILE);
    let temp = profile_dir.join(format!("{CONVERSATION_FILE}.tmp-{}", now_ms()));
    fs::write(&temp, bytes).map_err(|e| format!("failed to write assistant conversation: {e}"))?;
    fs::rename(&temp, &path).map_err(|e| format!("failed to commit assistant conversation: {e}"))
}

fn sanitize_persisted(value: &Value) -> Value {
    match value {
        Value::Object(map) => {
            let mut out = serde_json::Map::new();
            for (key, value) in map {
                if key == "dataUrl" || key == "apiKey" {
                    continue;
                }
                if key == "url" && value.as_str().is_some_and(|v| v.starts_with("data:")) {
                    out.insert(key.clone(), Value::String("[image omitted]".to_string()));
                } else {
                    out.insert(key.clone(), sanitize_persisted(value));
                }
            }
            Value::Object(out)
        }
        Value::Array(values) => Value::Array(values.iter().map(sanitize_persisted).collect()),
        other => other.clone(),
    }
}

fn check_conversation_endpoint(bound: Option<&str>, current: &str) -> Result<(), String> {
    if bound.is_some_and(|endpoint| endpoint != current) {
        return Err(
            "AI endpoint changed. Reset the assistant conversation before sending previous messages to another provider."
                .to_string(),
        );
    }
    Ok(())
}

fn tool_display(value: &Value) -> String {
    serde_json::to_string(&sanitize_persisted(value)).unwrap_or_else(|_| "{}".to_string())
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

#[derive(Debug, Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
enum RunnerLine {
    Delta {
        text: String,
    },
    ToolCall {
        id: String,
        name: String,
        arguments: Value,
        argument_error: Option<String>,
    },
    Done {
        messages: Vec<Value>,
    },
    Models {
        models: Vec<AssistantModelOption>,
    },
    Error {
        message: String,
    },
}

fn run_turn(
    state: AssistantState,
    app: tauri::AppHandle,
    storage: crate::storage::AppStorage,
    turn_config: AssistantTurnConfig,
) {
    let project_root = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    let runtime = turn_config.runtime;
    let model = turn_config
        .model_choice
        .as_ref()
        .map(|choice| choice.model.clone())
        .unwrap_or_else(|| runtime.model.clone());
    if runtime.endpoint.is_empty() || model.is_empty() {
        return_finish(
            &state,
            &app,
            "AI endpoint and model must be configured.".to_string(),
        );
        return;
    }
    let reasoning_effort = turn_config
        .model_choice
        .as_ref()
        .and_then(|choice| choice.reasoning_effort.clone());
    let tools = crate::assistant_operations::catalog();
    let (messages, context) = {
        let (lock, _) = &*state.gate;
        let mut inner = match lock.lock() {
            Ok(inner) => inner,
            Err(_) => {
                return_finish(&state, &app, "assistant state lock poisoned".to_string());
                return;
            }
        };
        inner.configured = true;
        inner.model = model.clone();
        inner.endpoint = runtime.endpoint.clone();
        (inner.provider_messages.clone(), inner.context.clone())
    };
    state.emit(&app);
    let runner = match find_runner_path("copicu-assistant-runner.mjs") {
        Ok(path) => path,
        Err(error) => {
            return_finish(&state, &app, error);
            return;
        }
    };
    let start = json!({
        "kind":"start", "endpoint":runtime.endpoint, "model":model,
        "reasoningEffort":reasoning_effort, "executionMode":turn_config.execution_mode,
        "apiKey":runtime.api_key, "messages":messages, "context":context, "tools":tools
    });
    let mut command = Command::new(NODE);
    command
        .arg(runner)
        .current_dir(&project_root)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(windows)]
    std::os::windows::process::CommandExt::creation_flags(&mut command, 0x0800_0000);
    let mut child = match command.spawn() {
        Ok(child) => child,
        Err(error) => {
            return_finish(
                &state,
                &app,
                format!("failed to start assistant runner: {error}"),
            );
            return;
        }
    };
    let mut stdin = child.stdin.take().expect("piped stdin");
    let stdout = child.stdout.take().expect("piped stdout");
    let stderr = child.stderr.take().expect("piped stderr");
    let (lines_tx, lines_rx) = mpsc::channel::<String>();
    thread::spawn(move || {
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            let _ = lines_tx.send(line);
        }
    });
    thread::spawn(move || {
        let mut reader = BufReader::new(stderr);
        let mut line = String::new();
        while reader.read_line(&mut line).unwrap_or(0) > 0 {
            line.clear();
        }
    });
    if let Err(error) = writeln!(stdin, "{}", start).and_then(|()| stdin.flush()) {
        let _ = child.kill();
        let _ = child.wait();
        return_finish(
            &state,
            &app,
            format!("failed to initialize assistant runner: {error}"),
        );
        return;
    }
    let mut last_stream_emit = std::time::Instant::now();
    let terminal_error = loop {
        if state
            .cancel_requested
            .load(std::sync::atomic::Ordering::SeqCst)
        {
            let _ = child.kill();
            let _ = child.wait();
            break "Assistant run cancelled.".to_string();
        }
        match lines_rx.recv_timeout(Duration::from_millis(100)) {
            Ok(line) => match serde_json::from_str::<RunnerLine>(&line) {
                Ok(RunnerLine::Delta { text }) => {
                    state.update_ephemeral(|inner| {
                        let id = inner.active_assistant_id.clone().unwrap_or_else(|| {
                            let id = format!("assistant-{}", now_ms());
                            inner.active_assistant_id = Some(id.clone());
                            id
                        });
                        if let Some(message) = inner.messages.iter_mut().find(|m| m.id == id) {
                            message.text.push_str(&text);
                        } else {
                            inner.messages.push(AssistantMessage {
                                id,
                                role: "assistant".to_string(),
                                text,
                                tool_name: None,
                                arguments: None,
                                status: Some("running".to_string()),
                                created_at: now_ms(),
                            });
                        }
                    });
                    if last_stream_emit.elapsed() >= Duration::from_millis(50) {
                        state.emit(&app);
                        last_stream_emit = std::time::Instant::now();
                    }
                }
                Ok(RunnerLine::ToolCall {
                    id,
                    name,
                    arguments,
                    argument_error,
                }) => {
                    if !handle_tool_call(
                        &state,
                        &app,
                        &storage,
                        &context,
                        &mut stdin,
                        &mut child,
                        id,
                        name,
                        arguments,
                        argument_error,
                    ) {
                        break "Assistant run cancelled.".to_string();
                    }
                }
                Ok(RunnerLine::Done { messages }) => {
                    state.update(&app, |inner| {
                        inner.provider_messages = messages;
                        if let Some(id) = inner.active_assistant_id.take() {
                            if let Some(message) = inner.messages.iter_mut().find(|m| m.id == id) {
                                message.status = Some("completed".to_string());
                            }
                        }
                        inner.running = false;
                        inner.approval = None;
                        inner.error = None;
                    });
                    let _ = child.wait();
                    return;
                }
                Ok(RunnerLine::Models { .. }) => {
                    break "assistant runner returned a model catalog during a turn".to_string();
                }
                Ok(RunnerLine::Error { message }) => {
                    let _ = child.kill();
                    let _ = child.wait();
                    break redact_error(&message);
                }
                Err(error) => {
                    let _ = child.kill();
                    let _ = child.wait();
                    break format!("assistant runner protocol error: {error}");
                }
            },
            Err(mpsc::RecvTimeoutError::Timeout) => continue,
            Err(mpsc::RecvTimeoutError::Disconnected) => {
                break "assistant runner exited without a completion message".to_string();
            }
        }
    };
    let _ = child.wait();
    return_finish(&state, &app, terminal_error);
}

fn handle_tool_call(
    state: &AssistantState,
    app: &tauri::AppHandle,
    storage: &crate::storage::AppStorage,
    context: &AssistantContext,
    stdin: &mut impl Write,
    child: &mut Child,
    id: String,
    name: String,
    arguments: Value,
    argument_error: Option<String>,
) -> bool {
    let operation_id = format!(
        "operation-{}-{}",
        now_ms(),
        NEXT_OPERATION.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
    );
    if let Some(error) = argument_error {
        let message = format!("invalid arguments for {name}: {error}");
        let _ = send_tool_result(stdin, &id, None, Some(&message), false);
        state.update(app, |inner| {
            inner.messages.push(tool_message(
                &operation_id,
                &name,
                arguments,
                "failed",
                &message,
            ))
        });
        return true;
    }
    let effect = catalog_effect(&name);
    if effect.is_none() {
        let _ = send_tool_result(stdin, &id, None, Some("unknown assistant tool"), false);
        state.update(app, |inner| {
            inner.messages.push(tool_message(
                &operation_id,
                &name,
                arguments,
                "failed",
                "unknown assistant tool",
            ))
        });
        return true;
    }
    state.update(app, |inner| {
        if let Some(active) = inner.active_assistant_id.take() {
            if let Some(message) = inner
                .messages
                .iter_mut()
                .find(|message| message.id == active)
            {
                message.status = Some("completed".to_string());
            }
        }
        inner.messages.push(tool_message(
            &operation_id,
            &name,
            arguments.clone(),
            "running",
            "",
        ));
    });
    let yolo = state
        .snapshot()
        .map(|snapshot| snapshot.execution_mode == "yolo")
        .unwrap_or(false);
    let requires_approval = !yolo && matches!(effect.as_deref(), Some("write" | "external"));
    let approved = if requires_approval {
        let (lock, cv) = &*state.gate;
        let mut inner = match lock.lock() {
            Ok(inner) => inner,
            Err(_) => return false,
        };
        inner.approval = Some(AssistantApproval {
            id: operation_id.clone(),
            name: name.clone(),
            arguments: arguments.clone(),
        });
        inner.approval_decision = None;
        persist_locked(&state.profile_dir, &inner).ok();
        drop(inner);
        state.emit(app);
        loop {
            if state
                .cancel_requested
                .load(std::sync::atomic::Ordering::SeqCst)
            {
                let _ = child.kill();
                return false;
            }
            let mut inner = match lock.lock() {
                Ok(inner) => inner,
                Err(_) => return false,
            };
            if let Some(decision) = inner.approval_decision.take() {
                break decision;
            }
            let result = cv.wait_timeout(inner, Duration::from_millis(100));
            if result.is_err() {
                return false;
            }
        }
    } else {
        true
    };
    if !approved {
        let _ = send_tool_result(stdin, &id, None, Some("operation denied by user"), false);
        checkpoint_tool(
            state,
            &id,
            &name,
            &arguments,
            Value::String("operation denied by user".to_string()),
        );
        state.update(app, |inner| {
            if let Some(message) = inner.messages.iter_mut().find(|m| m.id == operation_id) {
                message.status = Some("denied".to_string());
                message.text = "operation denied by user".to_string();
            }
        });
        return true;
    }
    let call_arguments = arguments.clone();
    if state
        .cancel_requested
        .load(std::sync::atomic::Ordering::SeqCst)
    {
        let _ = child.kill();
        return false;
    }
    let result = crate::assistant_operations::execute(app, storage, context, &name, arguments);
    match result {
        Ok(value) => {
            let display = tool_display(&value);
            let _ = send_tool_result(stdin, &id, Some(value.clone()), None, false);
            checkpoint_tool(state, &id, &name, &call_arguments, value);
            state.update(app, |inner| {
                if let Some(message) = inner.messages.iter_mut().find(|m| m.id == operation_id) {
                    message.status = Some("completed".to_string());
                    message.text = display;
                }
            });
        }
        Err(error) => {
            let fatal =
                name == "action_run" && error.contains(crate::actions::VERIFICATION_FAILURE_PREFIX);
            let error = redact_error(&error);
            let _ = send_tool_result(stdin, &id, None, Some(&error), fatal);
            checkpoint_tool(
                state,
                &id,
                &name,
                &call_arguments,
                Value::String(error.clone()),
            );
            state.update(app, |inner| {
                if let Some(message) = inner.messages.iter_mut().find(|m| m.id == operation_id) {
                    message.status = Some("failed".to_string());
                    message.text = error.clone();
                }
            });
        }
    }
    true
}
fn checkpoint_tool(state: &AssistantState, id: &str, name: &str, arguments: &Value, result: Value) {
    let (lock, _) = &*state.gate;
    if let Ok(mut inner) = lock.lock() {
        inner.provider_messages.push(json!({
            "role": "assistant",
            "content": Value::Null,
            "tool_calls": [{"id": id, "type": "function", "function": {"name": name, "arguments": serde_json::to_string(arguments).unwrap_or_else(|_| "{}".to_string())}}]
        }));
        inner.provider_messages.push(json!({"role":"tool","tool_call_id":id,"content":sanitize_persisted(&result).to_string()}));
        let _ = persist_locked(&state.profile_dir, &inner);
    }
}

fn tool_message(
    id: &str,
    name: &str,
    arguments: Value,
    status: &str,
    text: &str,
) -> AssistantMessage {
    AssistantMessage {
        id: id.to_string(),
        role: "tool".to_string(),
        text: text.to_string(),
        tool_name: Some(name.to_string()),
        arguments: Some(arguments),
        status: Some(status.to_string()),
        created_at: now_ms(),
    }
}

fn send_tool_result(
    stdin: &mut impl Write,
    id: &str,
    result: Option<Value>,
    error: Option<&str>,
    fatal: bool,
) -> Result<(), String> {
    let mut line = json!({"kind":"toolResult","id":id,"fatal":fatal});
    if let Some(result) = result {
        line["result"] = result;
    }
    if let Some(error) = error {
        line["error"] = Value::String(error.to_string());
    }
    serde_json::to_writer(&mut *stdin, &line).map_err(|e| e.to_string())?;
    stdin.write_all(b"\n").map_err(|e| e.to_string())?;
    stdin.flush().map_err(|e| e.to_string())
}

fn catalog_effect(name: &str) -> Option<String> {
    let catalog = crate::assistant_operations::catalog();
    let entries = catalog
        .as_array()
        .cloned()
        .or_else(|| catalog.get("tools").and_then(Value::as_array).cloned())?;
    entries
        .iter()
        .find(|entry| entry.get("name").and_then(Value::as_str) == Some(name))
        .and_then(|entry| {
            entry
                .get("effect")
                .and_then(Value::as_str)
                .map(ToString::to_string)
        })
}
fn return_finish(state: &AssistantState, app: &tauri::AppHandle, error: String) {
    state.update(app, |inner| {
        inner.running = false;
        inner.approval = None;
        inner.approval_decision = None;
        inner.error = Some(error);
        for message in &mut inner.messages {
            if message.status.as_deref() == Some("running") {
                message.status = Some("failed".to_string());
                if message.role == "tool" && message.text.is_empty() {
                    message.text = "Run ended before this operation completed.".to_string();
                }
            }
        }
        if let Some(id) = inner.active_assistant_id.take() {
            if let Some(message) = inner.messages.iter_mut().find(|m| m.id == id) {
                message.status = Some("failed".to_string());
            }
        }
    });
}

fn redact_error(value: &str) -> String {
    value
        .replace(|c: char| c.is_whitespace(), " ")
        .split_whitespace()
        .map(|part| {
            if part.len() >= 24 || part.to_ascii_lowercase().contains("bearer") {
                "[redacted]"
            } else {
                part
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
        .chars()
        .take(400)
        .collect()
}

fn find_runner_path(name: &str) -> Result<PathBuf, String> {
    let mut roots = Vec::new();
    if let Ok(cwd) = std::env::current_dir() {
        roots.push(cwd);
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            roots.push(parent.to_path_buf());
        }
    }
    for root in roots {
        for ancestor in root.ancestors() {
            let path = ancestor.join("scripts").join(name);
            if path.exists() {
                return Ok(path);
            }
        }
    }
    Err(format!(
        "scripts/{name} not found; package the assistant runner as an application resource"
    ))
}
fn list_models_blocking(
    storage: &crate::storage::AppStorage,
) -> Result<AssistantModelCatalog, String> {
    let settings = storage
        .get_settings()
        .map_err(|error| format!("failed to read AI settings: {error}"))?;
    let project_root = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    let runtime = crate::ai_planner::resolve_ai_runtime_settings(&settings.ai, &project_root)
        .map_err(|error| redact_error(&error))?;
    if !settings.ai.enabled {
        return Err("AI assistant is disabled in settings.".to_string());
    }
    if runtime.endpoint.is_empty() {
        return Err("AI endpoint must be configured.".to_string());
    }
    let runner = find_runner_path("copicu-assistant-runner.mjs")?;
    let start = json!({
        "kind": "listModels",
        "endpoint": runtime.endpoint,
        "apiKey": runtime.api_key,
    });
    let mut command = Command::new(NODE);
    command
        .arg(runner)
        .current_dir(&project_root)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(windows)]
    std::os::windows::process::CommandExt::creation_flags(&mut command, 0x0800_0000);
    let mut child = command
        .spawn()
        .map_err(|error| format!("failed to start assistant runner: {error}"))?;
    let mut stdin = child
        .stdin
        .take()
        .ok_or_else(|| "assistant runner stdin unavailable".to_string())?;
    if let Err(error) = writeln!(stdin, "{start}").and_then(|()| stdin.flush()) {
        let _ = child.kill();
        let _ = child.wait();
        return Err(format!("failed to initialize assistant runner: {error}"));
    }
    // The runner treats a closed input pipe as host cancellation.
    let output = child.wait_with_output();
    drop(stdin);
    let output =
        output.map_err(|error| format!("failed to read assistant model catalog: {error}"))?;
    let mut catalog = None;
    let mut runner_error = None;
    for line in String::from_utf8_lossy(&output.stdout).lines() {
        match serde_json::from_str::<RunnerLine>(line) {
            Ok(RunnerLine::Models { models }) => catalog = Some(models),
            Ok(RunnerLine::Error { message }) => runner_error = Some(message),
            Ok(_) => {}
            Err(error) => {
                runner_error = Some(format!("assistant runner protocol error: {error}"));
            }
        }
    }
    if let Some(models) = catalog {
        return Ok(AssistantModelCatalog {
            endpoint: runtime.endpoint,
            models,
        });
    }
    if let Some(error) = runner_error {
        return Err(redact_error(&error));
    }
    Err(format!(
        "assistant model catalog failed with status {}",
        output.status
    ))
}

fn require_window(
    window: &tauri::WebviewWindow,
    allowed: &[&str],
    command: &str,
) -> Result<(), String> {
    if allowed.iter().any(|label| *label == window.label()) {
        Ok(())
    } else {
        Err(format!("{command} is not available from this window"))
    }
}
#[tauri::command]
pub async fn assistant_list_models(
    window: tauri::WebviewWindow,
    storage: tauri::State<'_, crate::storage::AppStorage>,
) -> Result<AssistantModelCatalog, String> {
    require_window(&window, &[ASSISTANT_WINDOW_LABEL], "assistant_list_models")?;
    let storage = storage.inner().clone();
    tauri::async_runtime::spawn_blocking(move || list_models_blocking(&storage))
        .await
        .map_err(|error| format!("assistant model catalog worker failed: {error}"))?
}

#[tauri::command(rename_all = "camelCase")]
pub fn assistant_set_model(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    state: tauri::State<'_, AssistantState>,
    model: String,
    reasoning_effort: Option<String>,
    make_default: bool,
) -> Result<AssistantSnapshot, String> {
    require_window(&window, &[ASSISTANT_WINDOW_LABEL], "assistant_set_model")?;
    let model = model.trim().to_string();
    if model.is_empty() {
        return Err("assistant model cannot be empty".to_string());
    }
    let reasoning_effort = reasoning_effort
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    let choice = AssistantModelChoice {
        model: model.clone(),
        reasoning_effort,
    };
    let snapshot = {
        let (lock, _) = &*state.gate;
        let mut inner = lock
            .lock()
            .map_err(|_| "assistant state lock poisoned".to_string())?;
        if inner.running {
            return Err("cannot change the assistant model while running".to_string());
        }
        let previous_model = std::mem::replace(&mut inner.model, model);
        let previous_choice = inner.model_choice.replace(choice);
        let previous_default = if make_default {
            let selected = inner.model_choice.clone();
            std::mem::replace(&mut inner.default_model, selected)
        } else {
            None
        };
        if let Err(error) = persist_locked(&state.profile_dir, &inner) {
            inner.model = previous_model;
            inner.model_choice = previous_choice;
            if make_default {
                inner.default_model = previous_default;
            }
            return Err(error);
        }
        snapshot_locked(&inner)
    };
    state.emit(&app);
    Ok(snapshot)
}

#[tauri::command(rename_all = "camelCase")]
pub fn assistant_set_execution_mode(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    state: tauri::State<'_, AssistantState>,
    mode: String,
) -> Result<AssistantSnapshot, String> {
    require_window(
        &window,
        &[ASSISTANT_WINDOW_LABEL],
        "assistant_set_execution_mode",
    )?;
    if mode != "confirm" && mode != "yolo" {
        return Err("assistant execution mode must be confirm or yolo".to_string());
    }
    let snapshot = {
        let (lock, _) = &*state.gate;
        let mut inner = lock
            .lock()
            .map_err(|_| "assistant state lock poisoned".to_string())?;
        if inner.running {
            return Err("cannot change assistant execution mode while running".to_string());
        }
        inner.execution_mode = mode;
        snapshot_locked(&inner)
    };
    state.emit(&app);
    Ok(snapshot)
}

#[tauri::command(rename_all = "camelCase")]
pub async fn assistant_update_context(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    state: tauri::State<'_, AssistantState>,
    context: AssistantContext,
) -> Result<(), String> {
    require_window(&window, &[MAIN_WINDOW_LABEL], "assistant_update_context")?;
    if !window.is_visible().unwrap_or(false) {
        return Ok(());
    }
    state.update_context(context)?;
    state.emit(&app);
    Ok(())
}

#[tauri::command]
pub fn assistant_snapshot(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, AssistantState>,
    storage: tauri::State<'_, crate::storage::AppStorage>,
) -> Result<AssistantSnapshot, String> {
    require_window(&window, &[ASSISTANT_WINDOW_LABEL], "assistant_snapshot")?;
    state.refresh_runtime_metadata(storage.inner());
    state.snapshot()
}

#[tauri::command(rename_all = "camelCase")]
pub async fn assistant_send(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    state: tauri::State<'_, AssistantState>,
    storage: tauri::State<'_, crate::storage::AppStorage>,
    text: String,
) -> Result<(), String> {
    require_window(&window, &[ASSISTANT_WINDOW_LABEL], "assistant_send")?;
    state.send(
        app,
        storage.inner().clone(),
        AssistantSendRequest {
            text,
            picker_quick_prompt: false,
        },
    )
}

#[tauri::command]
pub fn assistant_cancel(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, AssistantState>,
) -> Result<(), String> {
    require_window(&window, &[ASSISTANT_WINDOW_LABEL], "assistant_cancel")?;
    state.cancel()
}

#[tauri::command]
pub fn assistant_approve(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, AssistantState>,
    id: String,
    approved: bool,
) -> Result<(), String> {
    require_window(&window, &[ASSISTANT_WINDOW_LABEL], "assistant_approve")?;
    state.approve(id, approved)
}

#[tauri::command]
pub fn assistant_reset(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, AssistantState>,
) -> Result<(), String> {
    require_window(&window, &[ASSISTANT_WINDOW_LABEL], "assistant_reset")?;
    state.reset()
}

#[cfg(test)]
mod tests {
    use super::check_conversation_endpoint;

    #[test]
    fn changing_provider_rejects_history_transfer_until_reset() {
        let original = "https://api.groq.com/openai/v1";
        let changed = "https://openrouter.ai/api/v1";
        assert!(check_conversation_endpoint(Some(original), changed)
            .unwrap_err()
            .contains("Reset the assistant conversation"));
        assert!(check_conversation_endpoint(Some(original), original).is_ok());
        assert!(check_conversation_endpoint(None, changed).is_ok());
    }
}
