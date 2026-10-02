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
    if let Some(route) = capability.strip_prefix("shared:forward:") {
        return route
            .split_once(':')
            .is_some_and(|(origin, target)| valid_channel_id(origin) && valid_channel_id(target));
    }
    if let Some(channel) = capability
        .strip_prefix("shared:publish:")
        .or_else(|| capability.strip_prefix("shared:receive:"))
        .or_else(|| capability.strip_prefix("shared:history:"))
    {
        return valid_channel_id(channel);
    }
    matches!(
        capability,
        "history:read-content"
            | "shared:read"
            | "shared:publish"
            | "history:search"
            | "history:create"
            | "history:write-metadata"
            | "history:promote"
            | "metadata:read-tags"
            | "metadata:edit-active"
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
            | "enrichment:run"
            | "enrichment:read"
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

fn valid_channel_id(channel: &str) -> bool {
    !channel.is_empty()
        && channel.len() <= 128
        && channel
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
}

fn required_script_host_capabilities(method: &str) -> Option<&'static [&'static str]> {
    match method {
        "history.search" => Some(&["history:search"]),
        "history.get" => Some(&["history:read-content"]),
        "history.create" => Some(&["history:create"]),
        "history.neighbor" => Some(&["history:search"]),
        "history.update" => Some(&["history:write-metadata"]),
        "history.move" => Some(&["history:promote"]),
        "history.promote" => Some(&["history:promote"]),
        "history.remove" => Some(&["history:delete"]),
        "metadata.listTags" => Some(&["metadata:read-tags"]),
        "metadata.editActive" => Some(&["metadata:edit-active"]),
        "clipboard.read" => Some(&["clipboard:read"]),
        "sharedClipboard.channels" => Some(&["shared:read"]),
        "sharedClipboard.target" => Some(&["shared:read"]),
        "sharedClipboard.state" => Some(&["shared:read"]),
        "sharedClipboard.history" => Some(&["shared:read"]),
        "sharedClipboard.publish" => Some(&["shared:publish"]),
        "sharedClipboard.received" => Some(&[]),
        "ui.alert" => Some(&["ui:alert"]),
        "ui.confirm" => Some(&["ui:confirm"]),
        "ui.input" => Some(&["ui:input"]),
        "ai.respondMarkdown" => Some(&["ai:summarize"]),
        "ai.summarizeMarkdown" => Some(&["ai:summarize"]),
        "enrichment.runForItem" => Some(&["enrichment:run"]),
        "enrichment.getResult" => Some(&["enrichment:read"]),
        "commands.run" => Some(&["commands:run"]),
        _ => None,
    }
}

pub(super) fn validate_shared_channel_capability(
    action: &ActionDefinition,
    channel_id: &str,
) -> Result<(), String> {
    let grant = format!("shared:publish:{channel_id}");
    if !supported_script_capability(&grant) || !script_has_capability(action, &grant) {
        return Err(
            "sharedClipboard.publish requires an explicit channel publish capability".to_string(),
        );
    }
    Ok(())
}

pub(super) fn validate_shared_forward_capability(
    action: &ActionDefinition,
    origin: &str,
    target: &str,
) -> Result<(), String> {
    if origin == target {
        return Err("a reception action cannot forward to its own source channel".to_string());
    }
    let grant = format!("shared:forward:{origin}:{target}");
    if !supported_script_capability(&grant) || !script_has_capability(action, &grant) {
        return Err(
            "reception forwarding requires an explicit origin and target channel capability"
                .to_string(),
        );
    }
    validate_shared_channel_capability(action, target)
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
