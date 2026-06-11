use std::path::Path;

use super::{
    ActionDefinition, ActionDiagnostic, ActionInput, ActionInputSource, ActionLogging,
    ActionSource, ClipKind, DiagnosticSeverity, ScriptActionMetadata, SelectionRequirement,
    Trigger,
};

pub(super) fn discover_script_actions(folder_path: &str) -> Result<Vec<ActionDefinition>, String> {
    let folder = Path::new(folder_path);
    if !folder.exists() {
        return Ok(Vec::new());
    }

    let mut entries = std::fs::read_dir(folder)
        .map_err(|error| {
            format!(
                "failed to read scripts folder {}: {error}",
                folder.display()
            )
        })?
        .filter_map(Result::ok)
        .filter(|entry| is_script_file(&entry.path()))
        .collect::<Vec<_>>();
    entries.sort_by_key(|entry| entry.path());

    let mut actions = Vec::with_capacity(entries.len());
    for entry in entries {
        let path = entry.path();
        actions.push(discover_script_action(&path));
    }
    Ok(actions)
}

pub(super) fn discover_script_action(path: &Path) -> ActionDefinition {
    let file_name = path
        .file_name()
        .map(|value| value.to_string_lossy().into_owned())
        .unwrap_or_else(|| "unknown".to_string());
    let fallback_id = fallback_script_id(path);
    let mut diagnostics = Vec::new();

    let source = match std::fs::read_to_string(path) {
        Ok(source) => source,
        Err(error) => {
            return script_action_with_diagnostics(
                fallback_id,
                file_name,
                path,
                "",
                vec![ActionDiagnostic {
                    severity: DiagnosticSeverity::Error,
                    message: format!("failed to read script: {error}"),
                }],
            );
        }
    };

    let action_block = match extract_define_action_block(&source) {
        Some(block) => block,
        None => {
            return script_action_with_diagnostics(
                fallback_id,
                file_name,
                path,
                &source,
                vec![ActionDiagnostic {
                    severity: DiagnosticSeverity::Error,
                    message: "missing defineAction({...}) export".to_string(),
                }],
            );
        }
    };

    let id = extract_string_property(action_block, "id").unwrap_or_else(|| {
        diagnostics.push(ActionDiagnostic {
            severity: DiagnosticSeverity::Error,
            message: "missing action id".to_string(),
        });
        fallback_id
    });
    let title = extract_string_property(action_block, "title").unwrap_or_else(|| {
        diagnostics.push(ActionDiagnostic {
            severity: DiagnosticSeverity::Error,
            message: "missing action title".to_string(),
        });
        file_name.clone()
    });
    let description = extract_string_property(action_block, "description").unwrap_or_default();
    let shortcut = extract_string_property(action_block, "shortcut")
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    let triggers = parse_trigger_array(action_block, "triggers", &mut diagnostics);
    let capabilities =
        extract_string_array_property(action_block, "capabilities").unwrap_or_else(|| {
            diagnostics.push(ActionDiagnostic {
                severity: DiagnosticSeverity::Warning,
                message: "missing capabilities".to_string(),
            });
            Vec::new()
        });
    let input = parse_action_input(action_block, &mut diagnostics);
    let logging = parse_action_logging(action_block, &mut diagnostics);

    ActionDefinition {
        id,
        title,
        description,
        shortcut,
        triggers,
        input,
        capabilities,
        builtin: false,
        source: ActionSource::Script,
        script: Some(ScriptActionMetadata {
            path: path.to_string_lossy().into_owned(),
            file_name,
            source_hash: crate::storage::hash_text(&source),
        }),
        diagnostics,
        logging,
    }
}

fn script_action_with_diagnostics(
    id: String,
    file_name: String,
    path: &Path,
    source: &str,
    diagnostics: Vec<ActionDiagnostic>,
) -> ActionDefinition {
    ActionDefinition {
        id,
        title: file_name.clone(),
        description: String::new(),
        shortcut: None,
        triggers: Vec::new(),
        input: ActionInput {
            source: ActionInputSource::None,
            selection: SelectionRequirement::None,
            kinds: None,
            mime: None,
            query: None,
        },
        capabilities: Vec::new(),
        builtin: false,
        source: ActionSource::Script,
        script: Some(ScriptActionMetadata {
            path: path.to_string_lossy().into_owned(),
            file_name,
            source_hash: crate::storage::hash_text(source),
        }),
        diagnostics,
        logging: None,
    }
}

fn is_script_file(path: &Path) -> bool {
    if path
        .file_name()
        .is_some_and(|name| name.to_string_lossy().ends_with(".d.ts"))
    {
        return false;
    }

    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| matches!(extension, "ts" | "js" | "mjs"))
}

fn fallback_script_id(path: &Path) -> String {
    let stem = path
        .file_stem()
        .map(|value| value.to_string_lossy())
        .unwrap_or_else(|| "script".into());
    let normalized = stem
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() {
                character
            } else {
                '.'
            }
        })
        .collect::<String>()
        .split('.')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join(".");

    format!(
        "script.{}",
        if normalized.is_empty() {
            "unnamed"
        } else {
            &normalized
        }
    )
}

fn extract_define_action_block(source: &str) -> Option<&str> {
    let define_index = source.find("defineAction")?;
    let after_define = &source[define_index..];
    let open_paren = after_define.find('(')? + define_index;
    let after_paren = &source[open_paren..];
    let open_brace = after_paren.find('{')? + open_paren;
    let close_brace = find_matching(source, open_brace, '{', '}')?;
    Some(&source[open_brace + 1..close_brace])
}

fn parse_action_input(block: &str, diagnostics: &mut Vec<ActionDiagnostic>) -> ActionInput {
    let input_block = extract_object_property(block, "input");
    let Some(input_block) = input_block else {
        diagnostics.push(ActionDiagnostic {
            severity: DiagnosticSeverity::Error,
            message: "missing input contract".to_string(),
        });
        return ActionInput {
            source: ActionInputSource::None,
            selection: SelectionRequirement::None,
            kinds: None,
            mime: None,
            query: None,
        };
    };

    let source = extract_string_property(input_block, "source")
        .and_then(|value| parse_input_source(&value))
        .unwrap_or_else(|| {
            diagnostics.push(ActionDiagnostic {
                severity: DiagnosticSeverity::Error,
                message: "missing or invalid input.source".to_string(),
            });
            ActionInputSource::None
        });
    let selection = extract_string_property(input_block, "selection")
        .and_then(|value| parse_selection_requirement(&value))
        .unwrap_or_else(|| {
            diagnostics.push(ActionDiagnostic {
                severity: DiagnosticSeverity::Error,
                message: "missing or invalid input.selection".to_string(),
            });
            SelectionRequirement::None
        });
    let kinds = extract_string_array_property(input_block, "kinds").map(|values| {
        values
            .into_iter()
            .filter_map(|value| parse_clip_kind(&value))
            .collect()
    });
    let mime = extract_string_array_property(input_block, "mime");
    let query = extract_string_property(input_block, "query");

    ActionInput {
        source,
        selection,
        kinds,
        mime,
        query,
    }
}

fn parse_action_logging(
    block: &str,
    diagnostics: &mut Vec<ActionDiagnostic>,
) -> Option<ActionLogging> {
    let logging_block = extract_object_property(block, "logging")?;
    let name = extract_string_property(logging_block, "name");
    if let Some(name) = name.as_deref() {
        if name.contains('/') || name.contains('\\') || name.contains("..") {
            diagnostics.push(ActionDiagnostic {
                severity: DiagnosticSeverity::Error,
                message: "logging.name must be a file name, not a path".to_string(),
            });
        }
    }
    let redact = extract_bool_property(logging_block, "redact").unwrap_or(true);

    Some(ActionLogging { name, redact })
}

fn parse_trigger_array(
    block: &str,
    property: &str,
    diagnostics: &mut Vec<ActionDiagnostic>,
) -> Vec<Trigger> {
    let values = extract_string_array_property(block, property).unwrap_or_else(|| {
        diagnostics.push(ActionDiagnostic {
            severity: DiagnosticSeverity::Error,
            message: "missing triggers".to_string(),
        });
        Vec::new()
    });
    values
        .into_iter()
        .filter_map(|value| {
            let trigger = parse_trigger(&value);
            if trigger.is_none() {
                diagnostics.push(ActionDiagnostic {
                    severity: DiagnosticSeverity::Warning,
                    message: format!("unknown trigger: {value}"),
                });
            }
            trigger
        })
        .collect()
}

fn extract_string_property(block: &str, property: &str) -> Option<String> {
    let index = find_property_index(block, property)?;
    let after_property = &block[index..];
    let colon = after_property.find(':')?;
    let after_colon = after_property[colon + 1..].trim_start();
    read_quoted_string(after_colon).map(|(value, _)| value)
}

fn extract_bool_property(block: &str, property: &str) -> Option<bool> {
    let index = find_property_index(block, property)?;
    let after_property = &block[index..];
    let colon = after_property.find(':')?;
    let after_colon = after_property[colon + 1..].trim_start();
    if after_colon.starts_with("true") {
        Some(true)
    } else if after_colon.starts_with("false") {
        Some(false)
    } else {
        None
    }
}

fn extract_string_array_property(block: &str, property: &str) -> Option<Vec<String>> {
    let index = find_property_index(block, property)?;
    let after_property = &block[index..];
    let open = after_property.find('[')? + index;
    let close = find_matching(block, open, '[', ']')?;
    Some(read_quoted_strings(&block[open + 1..close]))
}

fn extract_object_property<'a>(block: &'a str, property: &str) -> Option<&'a str> {
    let index = find_property_index(block, property)?;
    let after_property = &block[index..];
    let open = after_property.find('{')? + index;
    let close = find_matching(block, open, '{', '}')?;
    Some(&block[open + 1..close])
}

fn find_property_index(block: &str, property: &str) -> Option<usize> {
    for (index, _) in block.match_indices(property) {
        let before = block[..index].chars().next_back();
        let after = block[index + property.len()..].chars().next();
        let valid_before = before.is_none_or(|character| !is_identifier_char(character));
        let valid_after = after.is_some_and(|character| {
            !is_identifier_char(character) || matches!(character, ':' | '?' | '"')
        });
        if valid_before && valid_after {
            let rest = block[index + property.len()..].trim_start();
            if rest.starts_with(':') {
                return Some(index);
            }
        }
    }
    None
}

fn find_matching(source: &str, open_index: usize, open: char, close: char) -> Option<usize> {
    let mut depth = 0usize;
    let mut in_string: Option<char> = None;
    let mut escaped = false;

    for (offset, character) in source[open_index..].char_indices() {
        let index = open_index + offset;
        if let Some(quote) = in_string {
            if escaped {
                escaped = false;
                continue;
            }
            if character == '\\' {
                escaped = true;
                continue;
            }
            if character == quote {
                in_string = None;
            }
            continue;
        }

        if matches!(character, '"' | '\'' | '`') {
            in_string = Some(character);
            continue;
        }
        if character == open {
            depth += 1;
        } else if character == close {
            depth = depth.checked_sub(1)?;
            if depth == 0 {
                return Some(index);
            }
        }
    }
    None
}

fn read_quoted_strings(source: &str) -> Vec<String> {
    let mut values = Vec::new();
    let mut rest = source;
    while let Some(index) = rest.find(|character| matches!(character, '"' | '\'')) {
        if let Some((value, consumed)) = read_quoted_string(&rest[index..]) {
            values.push(value);
            rest = &rest[index + consumed..];
        } else {
            break;
        }
    }
    values
}

fn read_quoted_string(source: &str) -> Option<(String, usize)> {
    let mut chars = source.char_indices();
    let (_, quote) = chars.next()?;
    if !matches!(quote, '"' | '\'') {
        return None;
    }
    let mut value = String::new();
    let mut escaped = false;
    for (index, character) in chars {
        if escaped {
            value.push(character);
            escaped = false;
            continue;
        }
        if character == '\\' {
            escaped = true;
            continue;
        }
        if character == quote {
            return Some((value, index + character.len_utf8()));
        }
        value.push(character);
    }
    None
}

fn is_identifier_char(character: char) -> bool {
    character == '_' || character == '$' || character.is_ascii_alphanumeric()
}

fn parse_trigger(value: &str) -> Option<Trigger> {
    match value {
        "itemMenu" => Some(Trigger::ItemMenu),
        "commandPalette" => Some(Trigger::CommandPalette),
        "localShortcut" => Some(Trigger::LocalShortcut),
        "globalShortcut" => Some(Trigger::GlobalShortcut),
        "clipboardChange" => Some(Trigger::ClipboardChange),
        "tray" => Some(Trigger::Tray),
        "cli" => Some(Trigger::Cli),
        "devRun" => Some(Trigger::DevRun),
        _ => None,
    }
}

fn parse_input_source(value: &str) -> Option<ActionInputSource> {
    match value {
        "pickerSelection" => Some(ActionInputSource::PickerSelection),
        "clipboard" => Some(ActionInputSource::Clipboard),
        "historySearch" => Some(ActionInputSource::HistorySearch),
        "none" => Some(ActionInputSource::None),
        _ => None,
    }
}

fn parse_selection_requirement(value: &str) -> Option<SelectionRequirement> {
    match value {
        "none" => Some(SelectionRequirement::None),
        "optional" => Some(SelectionRequirement::Optional),
        "one" => Some(SelectionRequirement::One),
        "oneOrMore" => Some(SelectionRequirement::OneOrMore),
        "many" => Some(SelectionRequirement::Many),
        _ => None,
    }
}

fn parse_clip_kind(value: &str) -> Option<ClipKind> {
    match value {
        "text" => Some(ClipKind::Text),
        "html" => Some(ClipKind::Html),
        "image" => Some(ClipKind::Image),
        "fileList" => Some(ClipKind::FileList),
        "unknown" => Some(ClipKind::Unknown),
        _ => None,
    }
}
