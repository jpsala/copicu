use super::ActionDefinition;

pub(super) fn unsupported_script_capabilities(action: &ActionDefinition) -> Vec<String> {
    action
        .capabilities
        .iter()
        .filter(|capability| !supported_script_capability(capability))
        .cloned()
        .collect()
}

fn supported_script_capability(capability: &str) -> bool {
    matches!(
        capability,
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
            | "commands:run"
            | "picker:open"
            | "picker:filter"
            | "picker:activate"
            | "picker:show"
            | "picker:hide"
            | "window:remember-previous"
            | "window:focus-previous"
            | "input:paste"
    )
}

fn required_script_host_capabilities(method: &str) -> Option<&'static [&'static str]> {
    match method {
        "history.search" => Some(&["history:search"]),
        "history.get" => Some(&["history:read-content"]),
        "history.update" => Some(&["history:write-metadata"]),
        "history.remove" => Some(&["history:delete"]),
        "clipboard.read" => Some(&["clipboard:read"]),
        "ui.alert" => Some(&["ui:alert"]),
        "ui.confirm" => Some(&["ui:confirm"]),
        "ui.input" => Some(&["ui:input"]),
        "ai.respondMarkdown" => Some(&["ai:summarize"]),
        "ai.summarizeMarkdown" => Some(&["ai:summarize"]),
        "commands.run" => Some(&["commands:run"]),
        _ => None,
    }
}

pub(super) fn validate_script_host_capabilities(
    action: &ActionDefinition,
    method: &str,
) -> Result<(), String> {
    let required = required_script_host_capabilities(method)
        .ok_or_else(|| format!("unsupported script host method: {method}"))?;
    for capability in required {
        if !script_has_capability(action, capability) {
            return Err(format!("{method} requires {capability} capability"));
        }
    }
    Ok(())
}

pub(super) fn validate_script_command_capabilities(
    action: &ActionDefinition,
    command_id: &str,
) -> Result<(), String> {
    if !script_has_capability(action, "commands:run") {
        return Err("commands.run requires commands:run capability".to_string());
    }
    match command_id {
        "picker.open" => {
            if !script_has_capability(action, "picker:open") {
                return Err("picker.open command requires picker:open capability".to_string());
            }
            Ok(())
        }
        _ => Ok(()),
    }
}

fn script_has_capability(action: &ActionDefinition, capability: &str) -> bool {
    action
        .capabilities
        .iter()
        .any(|candidate| candidate == capability)
}
