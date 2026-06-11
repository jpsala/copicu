pub fn normalize_shortcut_string(shortcut: Option<&str>) -> Option<String> {
    let shortcut = shortcut?;
    if shortcut_contains_sequence_delimiter(shortcut) {
        let sequence = crate::hotkeys::HotkeySequence::parse(shortcut).ok()?;
        if sequence.first_step()?.to_string().contains('+') {
            return Some(sequence.to_string());
        }
        return None;
    }

    normalize_simple_shortcut_string(shortcut)
}

fn normalize_simple_shortcut_string(shortcut: &str) -> Option<String> {
    let parts = shortcut
        .split('+')
        .map(str::trim)
        .filter(|part| !part.is_empty());
    let mut modifiers = std::collections::BTreeSet::<&'static str>::new();
    let mut key: Option<String> = None;

    for part in parts {
        let normalized = part.to_ascii_lowercase().replace(char::is_whitespace, "");
        match normalized.as_str() {
            "ctrl" | "control" | "cmdorctrl" => {
                modifiers.insert("Ctrl");
            }
            "alt" | "option" => {
                modifiers.insert("Alt");
            }
            "shift" => {
                modifiers.insert("Shift");
            }
            "meta" | "cmd" | "command" | "win" | "super" => {
                modifiers.insert("Meta");
            }
            _ => {
                key = normalize_shortcut_key(part);
            }
        }
    }

    let key = key?;
    if modifiers.is_empty() && is_printable_shortcut_key(&key) {
        return None;
    }

    let mut ordered = Vec::new();
    for modifier in ["Ctrl", "Alt", "Shift", "Meta"] {
        if modifiers.contains(modifier) {
            ordered.push(modifier.to_string());
        }
    }
    ordered.push(key);
    Some(ordered.join("+"))
}

fn shortcut_contains_sequence_delimiter(shortcut: &str) -> bool {
    shortcut.char_indices().any(|(index, character)| {
        character == ',' && shortcut[index + 1..].starts_with(char::is_whitespace)
    })
}

fn normalize_shortcut_key(key: &str) -> Option<String> {
    let trimmed = key.trim();
    if trimmed.chars().count() == 1 {
        return Some(if trimmed == " " {
            "Space".to_string()
        } else {
            trimmed.to_ascii_uppercase()
        });
    }

    let compact = trimmed
        .to_ascii_lowercase()
        .replace(char::is_whitespace, "");
    if let Some(number) = compact.strip_prefix('f') {
        if let Ok(number) = number.parse::<u8>() {
            if (1..=12).contains(&number) {
                return Some(format!("F{number}"));
            }
        }
    }

    match compact.as_str() {
        "arrowdown" => Some("ArrowDown".to_string()),
        "arrowleft" => Some("ArrowLeft".to_string()),
        "arrowright" => Some("ArrowRight".to_string()),
        "arrowup" => Some("ArrowUp".to_string()),
        "backspace" => Some("Backspace".to_string()),
        "delete" | "del" => Some("Delete".to_string()),
        "end" => Some("End".to_string()),
        "enter" | "return" => Some("Enter".to_string()),
        "escape" | "esc" => Some("Escape".to_string()),
        "home" => Some("Home".to_string()),
        "insert" | "ins" => Some("Insert".to_string()),
        "pagedown" => Some("PageDown".to_string()),
        "pageup" => Some("PageUp".to_string()),
        "space" | "spacebar" => Some("Space".to_string()),
        "tab" => Some("Tab".to_string()),
        "," | "comma" => Some(",".to_string()),
        "." | "period" => Some(".".to_string()),
        "/" | "slash" => Some("/".to_string()),
        ";" | "semicolon" => Some(";".to_string()),
        "'" | "quote" => Some("'".to_string()),
        "[" | "bracketleft" => Some("[".to_string()),
        "]" | "bracketright" => Some("]".to_string()),
        "\\" | "backslash" => Some("\\".to_string()),
        "-" | "minus" => Some("-".to_string()),
        "=" | "equal" => Some("=".to_string()),
        "`" | "backquote" => Some("`".to_string()),
        _ => None,
    }
}

fn is_printable_shortcut_key(key: &str) -> bool {
    key.chars().count() == 1 || key == "Space"
}
