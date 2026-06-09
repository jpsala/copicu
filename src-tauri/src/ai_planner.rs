use serde::{Deserialize, Serialize};
use std::{
    io::Write,
    path::PathBuf,
    process::{Command, Stdio},
    thread,
    time::{Duration, Instant},
};

const AI_QUERY_PLANNER_SCRIPT: &str = "ai-query-planner.mjs";
const AI_SCRIPT_PLANNER_SCRIPT: &str = "ai-script-planner.mjs";
const AI_MARKDOWN_SUMMARY_SCRIPT: &str = "ai-markdown-summary.mjs";
const COPICU_AI_API_KEY_ENV: &str = "COPICU_AI_API_KEY";
const COPICU_AI_ENDPOINT_ENV: &str = "COPICU_AI_ENDPOINT";
const COPICU_AI_MODEL_ENV: &str = "COPICU_AI_MODEL";
const LEGACY_AI_KEY_ENV_VARS: &[&str] = &["GROQ_API_KEY", "OPENROUTER_API_KEY", "OPENAI_API_KEY"];
const AI_QUERY_PLANNER_TIMEOUT: Duration = Duration::from_secs(8);
const AI_SCRIPT_PLANNER_TIMEOUT: Duration = Duration::from_secs(12);
const AI_MARKDOWN_SUMMARY_TIMEOUT: Duration = Duration::from_secs(20);

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AiPlannerRunnerRequest {
    query: String,
    current_query: String,
    endpoint: String,
    model: String,
    api_key: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AiScriptPlannerRunnerRequest {
    prompt: String,
    current_query: String,
    visible_item_ids: Vec<i64>,
    current_item_id: Option<i64>,
    selected_item_ids: Vec<i64>,
    endpoint: String,
    model: String,
    api_key: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiMarkdownResponseRequest {
    pub instruction: String,
    #[serde(default)]
    pub context: AiMarkdownResponseContext,
    #[serde(default)]
    pub items: Vec<AiMarkdownResponseItem>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiMarkdownResponseContext {
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub source: Option<String>,
    #[serde(default)]
    pub current_query: Option<String>,
    #[serde(default)]
    pub current_item_id: Option<String>,
    #[serde(default)]
    pub selected_item_ids: Vec<String>,
    #[serde(default)]
    pub visible_item_ids: Vec<String>,
}

impl Default for AiMarkdownResponseContext {
    fn default() -> Self {
        Self {
            title: None,
            source: None,
            current_query: None,
            current_item_id: None,
            selected_item_ids: Vec::new(),
            visible_item_ids: Vec::new(),
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiMarkdownResponseItem {
    pub id: String,
    #[serde(default)]
    pub kind: Option<String>,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub text: Option<String>,
    #[serde(default)]
    pub notes: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AiMarkdownSummaryRunnerRequest {
    instruction: String,
    context: AiMarkdownResponseContext,
    items: Vec<AiMarkdownResponseItem>,
    endpoint: String,
    model: String,
    api_key: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiScriptPlan {
    pub id: String,
    pub title: String,
    pub summary: String,
    pub display_query: Option<String>,
    pub capabilities: Vec<String>,
    pub script: String,
    #[serde(default)]
    pub warnings: Vec<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiScriptContext {
    pub current_query: String,
    #[serde(default)]
    pub visible_item_ids: Vec<i64>,
    pub current_item_id: Option<i64>,
    #[serde(default)]
    pub selected_item_ids: Vec<i64>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiHistorySearchPlan {
    pub intent: AiSearchIntent,
    pub query: String,
    pub explanation: String,
    pub needs_clarification: Option<String>,
    #[serde(default)]
    pub warnings: Vec<String>,
    pub action: Option<AiHistoryActionPlan>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AiSearchIntent {
    SearchHistory,
    HistoryAction,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum AiHistoryActionPlan {
    RunAiScript { prompt: String },
}

pub fn plan_history_search(
    settings: &crate::storage::AiSettings,
    query: &str,
    current_query: &str,
) -> Result<AiHistorySearchPlan, String> {
    if !settings.enabled {
        return Err("AI search is disabled in Settings".to_string());
    }

    let runner_path = find_ai_query_planner_path()?;
    let project_root = runner_path
        .parent()
        .and_then(std::path::Path::parent)
        .ok_or_else(|| format!("invalid AI planner path: {}", runner_path.display()))?;
    let runtime = resolve_ai_runtime_settings(settings, project_root)?;
    if runtime.endpoint.is_empty() || runtime.model.is_empty() {
        return Err("AI settings are incomplete".to_string());
    }
    let api_key = runtime.api_key;
    if api_key.trim().is_empty() {
        return Err(format!("AI API key is empty: {COPICU_AI_API_KEY_ENV}"));
    }
    let request = AiPlannerRunnerRequest {
        query: query.trim().to_string(),
        current_query: current_query.trim().to_string(),
        endpoint: runtime.endpoint,
        model: runtime.model,
        api_key,
    };
    let payload = serde_json::to_vec(&request)
        .map_err(|error| format!("failed to encode AI planner request: {error}"))?;

    let mut child = Command::new("node")
        .arg(&runner_path)
        .current_dir(project_root)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("failed to start AI query planner: {error}"))?;

    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(&payload)
            .map_err(|error| format!("failed to write AI planner request: {error}"))?;
    }

    let started_at = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(_status)) => break,
            Ok(None) => {
                if started_at.elapsed() >= AI_QUERY_PLANNER_TIMEOUT {
                    let _ = child.kill();
                    let _ = child.wait();
                    return Err(format!(
                        "AI query planner timed out after {} seconds",
                        AI_QUERY_PLANNER_TIMEOUT.as_secs()
                    ));
                }
                thread::sleep(Duration::from_millis(50));
            }
            Err(error) => return Err(format!("failed to wait for AI query planner: {error}")),
        }
    }

    let output = child
        .wait_with_output()
        .map_err(|error| format!("failed to collect AI query planner output: {error}"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(classify_planner_failure(stderr.trim()));
    }

    let plan: AiHistorySearchPlan = serde_json::from_slice(&output.stdout)
        .map_err(|error| format!("failed to decode AI planner response: {error}"))?;
    validate_plan(&plan)?;
    Ok(plan)
}

pub fn plan_ai_script(
    settings: &crate::storage::AiSettings,
    prompt: &str,
    context: AiScriptContext,
) -> Result<AiScriptPlan, String> {
    if !settings.enabled {
        return Err("AI is disabled in Settings".to_string());
    }

    let runner_path = find_script_in_scripts_folder(AI_SCRIPT_PLANNER_SCRIPT)?;
    let project_root = runner_path
        .parent()
        .and_then(std::path::Path::parent)
        .ok_or_else(|| format!("invalid AI script planner path: {}", runner_path.display()))?;
    let runtime = resolve_ai_runtime_settings(settings, project_root)?;
    if runtime.endpoint.is_empty() || runtime.model.is_empty() {
        return Err("AI settings are incomplete".to_string());
    }
    let api_key = runtime.api_key;
    if api_key.trim().is_empty() {
        return Err(format!("AI API key is empty: {COPICU_AI_API_KEY_ENV}"));
    }

    let request = AiScriptPlannerRunnerRequest {
        prompt: prompt.trim().to_string(),
        current_query: context.current_query,
        visible_item_ids: context.visible_item_ids,
        current_item_id: context.current_item_id,
        selected_item_ids: context.selected_item_ids,
        endpoint: runtime.endpoint,
        model: runtime.model,
        api_key,
    };
    let output = run_ai_node_planner(
        &runner_path,
        project_root,
        &request,
        AI_SCRIPT_PLANNER_TIMEOUT,
    )
    .map_err(classify_script_planner_failure)?;
    let plan: AiScriptPlan = serde_json::from_slice(&output)
        .map_err(|error| format!("failed to decode AI script planner response: {error}"))?;
    validate_ai_script_plan(&plan)?;
    Ok(plan)
}

pub fn respond_markdown(
    settings: &crate::storage::AiSettings,
    request: AiMarkdownResponseRequest,
) -> Result<String, String> {
    if !settings.enabled {
        return Err("AI is disabled in Settings".to_string());
    }
    if request.instruction.trim().is_empty() {
        return Err("AI Markdown instruction is empty".to_string());
    }
    if request.items.is_empty() || request.items.len() > 200 {
        return Err("AI Markdown response requires between 1 and 200 items".to_string());
    }

    let runner_path = find_script_in_scripts_folder(AI_MARKDOWN_SUMMARY_SCRIPT)?;
    let project_root = runner_path
        .parent()
        .and_then(std::path::Path::parent)
        .ok_or_else(|| {
            format!(
                "invalid AI markdown summary path: {}",
                runner_path.display()
            )
        })?;
    let runtime = resolve_ai_runtime_settings(settings, project_root)?;
    if runtime.endpoint.is_empty() || runtime.model.is_empty() {
        return Err("AI settings are incomplete".to_string());
    }
    let api_key = runtime.api_key;
    if api_key.trim().is_empty() {
        return Err(format!("AI API key is empty: {COPICU_AI_API_KEY_ENV}"));
    }

    let runner_request = AiMarkdownSummaryRunnerRequest {
        instruction: request.instruction,
        context: request.context,
        items: request.items,
        endpoint: runtime.endpoint,
        model: runtime.model,
        api_key,
    };
    let output = run_ai_node_planner(
        &runner_path,
        project_root,
        &runner_request,
        AI_MARKDOWN_SUMMARY_TIMEOUT,
    )
    .map_err(classify_script_planner_failure)?;
    let markdown: String = serde_json::from_slice(&output)
        .map_err(|error| format!("failed to decode AI markdown summary response: {error}"))?;
    Ok(markdown)
}

fn validate_plan(plan: &AiHistorySearchPlan) -> Result<(), String> {
    match plan.intent {
        AiSearchIntent::SearchHistory => {
            if plan.action.is_some() {
                return Err("AI planner returned an action for a search intent".to_string());
            }
            if plan.query.trim().is_empty() && plan.needs_clarification.is_none() {
                return Err("AI planner returned an empty query".to_string());
            }
        }
        AiSearchIntent::HistoryAction => {
            let Some(action) = &plan.action else {
                return Err("AI planner returned action intent without action".to_string());
            };
            validate_action_plan(action)?;
        }
    }
    if plan.query.len() > 500 {
        return Err("AI planner returned a query that is too long".to_string());
    }
    Ok(())
}

fn validate_action_plan(action: &AiHistoryActionPlan) -> Result<(), String> {
    match action {
        AiHistoryActionPlan::RunAiScript { prompt } => {
            if prompt.trim().is_empty() || prompt.len() > 800 {
                return Err("AI planner returned an invalid script prompt".to_string());
            }
            Ok(())
        }
    }
}

fn validate_ai_script_plan(plan: &AiScriptPlan) -> Result<(), String> {
    if !plan.id.starts_with("ai.temporary.") {
        return Err("AI script planner returned an invalid temporary action id".to_string());
    }
    if plan.capabilities.is_empty() || plan.capabilities.len() > 8 {
        return Err("AI script planner returned an invalid capability list".to_string());
    }
    for capability in &plan.capabilities {
        if !matches!(
            capability.as_str(),
            "history:read-content"
                | "history:search"
                | "history:write-metadata"
                | "history:delete"
                | "clipboard:read"
                | "clipboard:write"
                | "ui:toast"
                | "ui:notify"
                | "ui:alert"
                | "ui:confirm"
                | "ui:input"
                | "ui:markdown-output"
                | "ai:summarize"
                | "log:write"
                | "picker:filter"
                | "picker:activate"
                | "picker:show"
                | "picker:hide"
                | "window:focus-previous"
                | "input:paste"
        ) {
            return Err(format!(
                "AI script requested unsupported capability: {capability}"
            ));
        }
    }
    validate_ai_script_source(&plan.script)
}

fn validate_ai_script_source(source: &str) -> Result<(), String> {
    let lower = source.to_ascii_lowercase();
    let forbidden = [
        "import ",
        "import(",
        "require(",
        "child_process",
        "process.",
        "process[",
        "fetch(",
        "xmlhttprequest",
        "websocket",
        "eval(",
        "function(",
        "indexeddb",
        "localstorage",
        "sessionstorage",
    ];
    if let Some(pattern) = forbidden.iter().find(|pattern| lower.contains(**pattern)) {
        return Err(format!("AI script uses forbidden construct: {pattern}"));
    }
    if !source.contains("defineAction") {
        return Err("AI script must export defineAction({...})".to_string());
    }
    Ok(())
}

fn find_ai_query_planner_path() -> Result<PathBuf, String> {
    find_script_in_scripts_folder(AI_QUERY_PLANNER_SCRIPT)
}

fn find_script_in_scripts_folder(script_name: &str) -> Result<PathBuf, String> {
    let mut roots = Vec::new();
    if let Ok(current_dir) = std::env::current_dir() {
        roots.push(current_dir);
    }
    if let Ok(current_exe) = std::env::current_exe() {
        if let Some(parent) = current_exe.parent() {
            roots.push(parent.to_path_buf());
        }
    }

    for root in roots {
        for ancestor in root.ancestors() {
            let candidate = ancestor.join("scripts").join(script_name);
            if candidate.exists() {
                return Ok(candidate);
            }
            if let Some(parent) = ancestor.parent() {
                let sibling_candidate = parent.join("scripts").join(script_name);
                if sibling_candidate.exists() {
                    return Ok(sibling_candidate);
                }
            }
        }
    }

    Err(format!("scripts/{script_name} not found"))
}

fn run_ai_node_planner<T: Serialize>(
    runner_path: &std::path::Path,
    project_root: &std::path::Path,
    request: &T,
    timeout: Duration,
) -> Result<Vec<u8>, String> {
    let payload = serde_json::to_vec(request)
        .map_err(|error| format!("failed to encode AI planner request: {error}"))?;

    let mut child = Command::new("node")
        .arg(runner_path)
        .current_dir(project_root)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("failed to start AI planner: {error}"))?;

    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(&payload)
            .map_err(|error| format!("failed to write AI planner request: {error}"))?;
    }

    let started_at = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(_status)) => break,
            Ok(None) => {
                if started_at.elapsed() >= timeout {
                    let _ = child.kill();
                    let _ = child.wait();
                    return Err(format!(
                        "AI planner timed out after {} seconds",
                        timeout.as_secs()
                    ));
                }
                thread::sleep(Duration::from_millis(50));
            }
            Err(error) => return Err(format!("failed to wait for AI planner: {error}")),
        }
    }

    let output = child
        .wait_with_output()
        .map_err(|error| format!("failed to collect AI planner output: {error}"))?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }
    Ok(output.stdout)
}

fn redact_planner_error(value: &str) -> String {
    let redacted = value
        .split_whitespace()
        .map(|part| {
            if part.len() >= 32 || part.to_ascii_lowercase().contains("authorization") {
                "[redacted]"
            } else {
                part
            }
        })
        .collect::<Vec<_>>()
        .join(" ");
    redacted.chars().take(300).collect()
}

fn classify_planner_failure(stderr: &str) -> String {
    let redacted = redact_planner_error(stderr);
    if let Some(message) = redacted.strip_prefix("[AI_PLANNER_ERROR] ") {
        if message.contains("schema validation failed") {
            if message.contains("query:") {
                return "AI search needs text after ai:; using structured local history search."
                    .to_string();
            }
            if message.contains("endpoint:") || message.contains("model:") {
                return "AI settings are invalid; using structured local history search."
                    .to_string();
            }
            if message.contains("apiKey:") {
                return "AI API key is missing or empty; using structured local history search."
                    .to_string();
            }
            return "AI query planner request validation failed; using structured local history search."
                .to_string();
        }
        return format!("AI query planner failed: {message}");
    }
    if redacted.contains("[AI_PLANNER_ERROR]") {
        return "AI query planner failed before contacting the provider; using structured local history search."
            .to_string();
    }
    "AI query planner failed; using structured local history search.".to_string()
}

fn classify_script_planner_failure(stderr: String) -> String {
    let redacted = redact_planner_error(&stderr);
    if let Some(message) = redacted.strip_prefix("[AI_SCRIPT_PLANNER_ERROR] ") {
        if message.contains("schema validation failed") {
            if message.contains("apiKey:") {
                return "AI API key is missing or empty.".to_string();
            }
            if message.contains("endpoint:") || message.contains("model:") {
                return "AI settings are invalid.".to_string();
            }
            return "AI script planner request validation failed.".to_string();
        }
        return format!("AI script planner failed: {message}");
    }
    if redacted.contains("[AI_SCRIPT_PLANNER_ERROR]") {
        return "AI script planner failed before contacting the provider.".to_string();
    }
    if redacted.is_empty() {
        return "AI script planner failed.".to_string();
    }
    format!("AI script planner failed: {redacted}")
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct AiRuntimeSettings {
    endpoint: String,
    model: String,
    api_key: String,
}

fn resolve_ai_runtime_settings(
    settings: &crate::storage::AiSettings,
    project_root: &std::path::Path,
) -> Result<AiRuntimeSettings, String> {
    let endpoint = read_env_var_or_project_dotenv(COPICU_AI_ENDPOINT_ENV, project_root)
        .ok()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| settings.endpoint.trim().trim_end_matches('/').to_string());
    let model = read_env_var_or_project_dotenv(COPICU_AI_MODEL_ENV, project_root)
        .ok()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| settings.model.trim().to_string());
    let api_key = read_env_var_or_project_dotenv(COPICU_AI_API_KEY_ENV, project_root)
        .or_else(|_| read_legacy_ai_key(project_root))?;

    Ok(AiRuntimeSettings {
        endpoint,
        model,
        api_key,
    })
}

fn read_legacy_ai_key(project_root: &std::path::Path) -> Result<String, String> {
    for env_var in LEGACY_AI_KEY_ENV_VARS {
        if let Ok(value) = read_env_var_or_project_dotenv(env_var, project_root) {
            return Ok(value);
        }
    }
    Err(format!("AI API key is not set: {COPICU_AI_API_KEY_ENV}"))
}

fn read_env_var_or_project_dotenv(
    env_var: &str,
    project_root: &std::path::Path,
) -> Result<String, String> {
    match std::env::var(env_var) {
        Ok(value) => return Ok(value),
        Err(std::env::VarError::NotPresent) => {}
        Err(std::env::VarError::NotUnicode(_)) => {
            return Err(format!(
                "AI API key environment variable is not valid unicode: {env_var}"
            ));
        }
    }

    let dotenv_path = project_root.join(".env");
    let dotenv = std::fs::read_to_string(&dotenv_path)
        .map_err(|_| format!("AI environment variable is not set: {env_var}"))?;
    if let Some(value) = read_dotenv_value(&dotenv, env_var) {
        return Ok(value);
    }

    Err(format!("AI environment variable is not set: {env_var}"))
}

fn read_dotenv_value(dotenv: &str, env_var: &str) -> Option<String> {
    for line in dotenv.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        let Some((key, value)) = trimmed.split_once('=') else {
            continue;
        };
        if key.trim() == env_var {
            return Some(unquote_dotenv_value(value.trim()));
        }
    }
    None
}

fn unquote_dotenv_value(value: &str) -> String {
    if value.len() >= 2
        && ((value.starts_with('"') && value.ends_with('"'))
            || (value.starts_with('\'') && value.ends_with('\'')))
    {
        return value[1..value.len() - 1].to_string();
    }
    value.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn planner_failure_hides_zod_stack_and_code_frames() {
        let stderr = r#"[AI_PLANNER_ERROR] schema validation failed: apiKey: Too small: expected string to have >=1 characters
    const request = requestSchema.parse(input);
                    ^
ZodError: [{ "path": ["apiKey"], "message": "Too small" }]"#;

        let message = classify_planner_failure(stderr);

        assert_eq!(
            message,
            "AI API key is missing or empty; using structured local history search."
        );
        assert!(!message.contains("ZodError"));
        assert!(!message.contains("requestSchema"));
        assert!(!message.contains("expected string"));
    }

    #[test]
    fn planner_error_redacts_long_tokens_and_truncates() {
        let token = "synthetic-secret-token-abcdefghijklmnopqrstuvwxyz0123456789";
        let message = redact_planner_error(&format!(
            "Authorization Bearer {token} failed with long payload {token}"
        ));

        assert!(!message.contains(token));
        assert!(message.contains("[redacted]"));
        assert!(message.len() <= 300);
    }

    #[test]
    fn dotenv_contract_reads_fixed_copicu_ai_keys() {
        let dotenv = r#"
COPICU_AI_ENDPOINT=https://openrouter.ai/api/v1
COPICU_AI_MODEL=openai/gpt-4.1-mini
COPICU_AI_API_KEY="synthetic-copicu-key"
"#;

        assert_eq!(
            read_dotenv_value(dotenv, COPICU_AI_ENDPOINT_ENV).as_deref(),
            Some("https://openrouter.ai/api/v1")
        );
        assert_eq!(
            read_dotenv_value(dotenv, COPICU_AI_MODEL_ENV).as_deref(),
            Some("openai/gpt-4.1-mini")
        );
        assert_eq!(
            read_dotenv_value(dotenv, COPICU_AI_API_KEY_ENV).as_deref(),
            Some("synthetic-copicu-key")
        );
    }

    #[test]
    fn dotenv_parser_keeps_provider_examples_commented() {
        let dotenv = r#"
# LEGACY_OPENAI_KEY=synthetic-old-style
COPICU_AI_API_KEY=synthetic-active
"#;

        assert_eq!(
            read_dotenv_value(dotenv, COPICU_AI_API_KEY_ENV).as_deref(),
            Some("synthetic-active")
        );
        assert_eq!(read_dotenv_value(dotenv, "LEGACY_OPENAI_KEY"), None);
    }

    #[test]
    fn validates_history_action_plan() {
        let plan = AiHistorySearchPlan {
            intent: AiSearchIntent::HistoryAction,
            query: String::new(),
            explanation: "Marks positions".to_string(),
            needs_clarification: None,
            warnings: Vec::new(),
            action: Some(AiHistoryActionPlan::RunAiScript {
                prompt: "mark the 8, 9 and 10th".to_string(),
            }),
        };

        validate_plan(&plan).expect("valid action plan should pass");
    }

    #[test]
    fn rejects_action_intent_without_action() {
        let plan = AiHistorySearchPlan {
            intent: AiSearchIntent::HistoryAction,
            query: String::new(),
            explanation: "Missing action".to_string(),
            needs_clarification: None,
            warnings: Vec::new(),
            action: None,
        };

        assert!(validate_plan(&plan).is_err());
    }

    #[test]
    fn ai_script_plan_allows_free_markdown_response_helper() {
        let plan = AiScriptPlan {
            id: "ai.temporary.summary".to_string(),
            title: "Summary".to_string(),
            summary: "Summarizes selected clipboard items.".to_string(),
            display_query: None,
            capabilities: vec![
                "history:read-content".to_string(),
                "ai:summarize".to_string(),
                "ui:markdown-output".to_string(),
                "log:write".to_string(),
            ],
            script: r##"export default defineAction({
              id: "ai.temporary.summary",
              title: "Summary",
              triggers: ["devRun"],
              input: { source: "none", selection: "none" },
              capabilities: ["history:read-content", "ai:summarize", "ui:markdown-output", "log:write"],
              async run() {
                const markdown = await copicu.ai.respondMarkdown({
                  instruction: "Summarize selected items",
                  items: [{ id: "1", kind: "text", text: "synthetic clip" }],
                  context: { title: "Summary", selectedItemIds: ["1"] }
                });
                await copicu.ui.markdownOutput({ title: "Summary", markdown });
                await copicu.log.info("summary opened", { count: 1 });
              }
            });"##
            .to_string(),
            warnings: Vec::new(),
        };

        validate_ai_script_plan(&plan).expect("markdown output capability should be allowed");
    }
}
