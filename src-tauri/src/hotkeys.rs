#![allow(dead_code)]

use std::collections::BTreeMap;
use std::fmt;

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub(crate) struct HotkeyStep {
    modifiers: Vec<HotkeyModifier>,
    key: String,
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub(crate) struct HotkeySequence {
    steps: Vec<HotkeyStep>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub(crate) enum HotkeyModifier {
    Ctrl,
    Alt,
    Shift,
    Meta,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum ShortcutRoute {
    PickerOpen,
    ScriptRun { action_id: String },
    Command { command_id: String },
    WhichKeyOpen { prefix: Option<HotkeySequence> },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum HotkeyDiagnosticKind {
    Invalid,
    Duplicate,
    Ambiguous,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct HotkeyDiagnostic {
    pub kind: HotkeyDiagnosticKind,
    pub input: String,
    pub message: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct ShortcutNextStep {
    pub step: HotkeyStep,
    pub id: String,
    pub route: ShortcutRoute,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct ShortcutRegistration {
    pub id: String,
    pub sequence: HotkeySequence,
    pub route: ShortcutRoute,
}

#[derive(Debug, Clone, Default)]
pub(crate) struct ShortcutRegistry {
    root: TrieNode,
    diagnostics: Vec<HotkeyDiagnostic>,
}

#[derive(Debug, Clone, Default)]
struct TrieNode {
    route: Option<RegisteredRoute>,
    children: BTreeMap<HotkeyStep, TrieNode>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct RegisteredRoute {
    id: String,
    route: ShortcutRoute,
}

impl HotkeySequence {
    pub(crate) fn parse(input: &str) -> Result<Self, String> {
        let raw_steps = split_sequence(input);
        if raw_steps.is_empty() {
            return Err("shortcut cannot be empty".to_string());
        }

        let mut steps = Vec::with_capacity(raw_steps.len());
        for raw_step in raw_steps {
            steps.push(HotkeyStep::parse(raw_step)?);
        }
        Ok(Self { steps })
    }

    pub(crate) fn steps(&self) -> &[HotkeyStep] {
        &self.steps
    }

    pub(crate) fn first_step(&self) -> Option<&HotkeyStep> {
        self.steps.first()
    }

    pub(crate) fn is_simple(&self) -> bool {
        self.steps.len() == 1
    }

    pub(crate) fn len(&self) -> usize {
        self.steps.len()
    }

    pub(crate) fn prefixed_with(&self, step: HotkeyStep) -> Self {
        let mut steps = self.steps.clone();
        steps.push(step);
        Self { steps }
    }
}

impl fmt::Display for HotkeySequence {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        let labels = self
            .steps
            .iter()
            .map(ToString::to_string)
            .collect::<Vec<_>>();
        formatter.write_str(&labels.join(", "))
    }
}

impl HotkeyStep {
    pub(crate) fn parse(input: &str) -> Result<Self, String> {
        let trimmed = input.trim();
        if trimmed.is_empty() {
            return Err("shortcut step cannot be empty".to_string());
        }

        let parts = trimmed
            .split('+')
            .map(str::trim)
            .filter(|part| !part.is_empty())
            .collect::<Vec<_>>();
        if parts.is_empty() {
            return Err("shortcut step cannot be empty".to_string());
        }

        let mut modifiers = Vec::new();
        let mut key = None;
        for part in parts {
            if let Some(modifier) = parse_modifier(part) {
                if key.is_some() {
                    return Err(format!("modifier {part} cannot appear after key"));
                }
                if modifiers.contains(&modifier) {
                    return Err(format!("duplicate modifier {part}"));
                }
                modifiers.push(modifier);
            } else if key.is_some() {
                return Err("shortcut step can only contain one key".to_string());
            } else {
                key = Some(normalize_key(part)?);
            }
        }

        let key = key.ok_or_else(|| "shortcut step must contain a key".to_string())?;
        modifiers.sort();
        Ok(Self { modifiers, key })
    }
}

impl fmt::Display for HotkeyStep {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        let mut parts = self
            .modifiers
            .iter()
            .map(ToString::to_string)
            .collect::<Vec<_>>();
        parts.push(self.key.clone());
        formatter.write_str(&parts.join("+"))
    }
}

impl fmt::Display for HotkeyModifier {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(match self {
            HotkeyModifier::Ctrl => "Ctrl",
            HotkeyModifier::Alt => "Alt",
            HotkeyModifier::Shift => "Shift",
            HotkeyModifier::Meta => "Meta",
        })
    }
}

impl ShortcutRegistry {
    pub(crate) fn register(
        &mut self,
        id: impl Into<String>,
        input: &str,
        route: ShortcutRoute,
    ) -> Result<(), HotkeyDiagnostic> {
        let id = id.into();
        let sequence = match HotkeySequence::parse(input) {
            Ok(sequence) => sequence,
            Err(error) => {
                let diagnostic = HotkeyDiagnostic {
                    kind: HotkeyDiagnosticKind::Invalid,
                    input: input.to_string(),
                    message: error,
                };
                self.diagnostics.push(diagnostic.clone());
                return Err(diagnostic);
            }
        };

        self.register_sequence(ShortcutRegistration {
            id,
            sequence,
            route,
        })
    }

    pub(crate) fn register_sequence(
        &mut self,
        registration: ShortcutRegistration,
    ) -> Result<(), HotkeyDiagnostic> {
        let input = registration.sequence.to_string();
        if let Some(conflicting_id) = self.find_conflicting_prefix(&registration.sequence) {
            let diagnostic = HotkeyDiagnostic {
                kind: HotkeyDiagnosticKind::Ambiguous,
                input,
                message: format!("shortcut is ambiguous with {conflicting_id}"),
            };
            self.diagnostics.push(diagnostic.clone());
            return Err(diagnostic);
        }

        let mut node = &mut self.root;
        for step in registration.sequence.steps {
            node = node.children.entry(step).or_default();
        }

        if let Some(existing) = &node.route {
            let diagnostic = HotkeyDiagnostic {
                kind: HotkeyDiagnosticKind::Duplicate,
                input,
                message: format!("shortcut already registered by {}", existing.id),
            };
            self.diagnostics.push(diagnostic.clone());
            return Err(diagnostic);
        }

        if let Some(child_id) = first_route_id_below(node) {
            let diagnostic = HotkeyDiagnostic {
                kind: HotkeyDiagnosticKind::Ambiguous,
                input,
                message: format!("shortcut is ambiguous with {child_id}"),
            };
            self.diagnostics.push(diagnostic.clone());
            return Err(diagnostic);
        }

        node.route = Some(RegisteredRoute {
            id: registration.id,
            route: registration.route,
        });
        Ok(())
    }

    pub(crate) fn resolve(&self, sequence: &HotkeySequence) -> Option<&ShortcutRoute> {
        let mut node = &self.root;
        for step in sequence.steps() {
            node = node.children.get(step)?;
        }
        node.route.as_ref().map(|registered| &registered.route)
    }

    pub(crate) fn next_steps(&self, prefix: &HotkeySequence) -> Option<Vec<&HotkeyStep>> {
        let mut node = &self.root;
        for step in prefix.steps() {
            node = node.children.get(step)?;
        }
        Some(node.children.keys().collect())
    }

    pub(crate) fn next_step_routes(
        &self,
        prefix: &HotkeySequence,
    ) -> Option<Vec<ShortcutNextStep>> {
        let mut node = &self.root;
        for step in prefix.steps() {
            node = node.children.get(step)?;
        }
        Some(
            node.children
                .iter()
                .filter_map(|(step, child)| {
                    let route = first_registered_route_below(child)?;
                    Some(ShortcutNextStep {
                        step: step.clone(),
                        id: route.id.clone(),
                        route: route.route.clone(),
                    })
                })
                .collect(),
        )
    }

    pub(crate) fn diagnostics(&self) -> &[HotkeyDiagnostic] {
        &self.diagnostics
    }

    fn find_conflicting_prefix(&self, sequence: &HotkeySequence) -> Option<String> {
        let mut node = &self.root;
        for step in sequence.steps() {
            if let Some(route) = &node.route {
                return Some(route.id.clone());
            }
            node = match node.children.get(step) {
                Some(next) => next,
                None => return None,
            };
        }
        None
    }
}

fn first_route_id_below(node: &TrieNode) -> Option<String> {
    if let Some(route) = &node.route {
        return Some(route.id.clone());
    }
    node.children.values().find_map(first_route_id_below)
}

fn first_registered_route_below(node: &TrieNode) -> Option<&RegisteredRoute> {
    if let Some(route) = &node.route {
        return Some(route);
    }
    node.children
        .values()
        .find_map(first_registered_route_below)
}

fn split_sequence(input: &str) -> Vec<&str> {
    let mut steps = Vec::new();
    let mut start = 0;
    for (index, character) in input.char_indices() {
        if character != ',' {
            continue;
        }
        let rest = &input[index + character.len_utf8()..];
        if rest.chars().next().is_some_and(char::is_whitespace) {
            steps.push(&input[start..index]);
            start = index + character.len_utf8();
        }
    }
    steps.push(&input[start..]);
    steps
        .into_iter()
        .map(str::trim)
        .filter(|step| !step.is_empty())
        .collect()
}

fn parse_modifier(input: &str) -> Option<HotkeyModifier> {
    match input.to_ascii_lowercase().as_str() {
        "ctrl" | "control" => Some(HotkeyModifier::Ctrl),
        "alt" | "option" => Some(HotkeyModifier::Alt),
        "shift" => Some(HotkeyModifier::Shift),
        "meta" | "cmd" | "command" | "super" | "win" => Some(HotkeyModifier::Meta),
        _ => None,
    }
}

fn normalize_key(input: &str) -> Result<String, String> {
    let key = input.trim();
    if key.is_empty() {
        return Err("shortcut key cannot be empty".to_string());
    }
    if key.chars().count() == 1 {
        let character = key.chars().next().expect("single character exists");
        if character.is_ascii_alphanumeric() {
            return Ok(character.to_ascii_uppercase().to_string());
        }
        return Ok(character.to_string());
    }

    let lower = key.to_ascii_lowercase();
    let normalized = match lower.as_str() {
        "esc" | "escape" => "Escape",
        "enter" | "return" => "Enter",
        "space" => "Space",
        "tab" => "Tab",
        "backspace" => "Backspace",
        "delete" | "del" => "Delete",
        "insert" | "ins" => "Insert",
        "home" => "Home",
        "end" => "End",
        "pagedown" | "page_down" | "page down" => "PageDown",
        "pageup" | "page_up" | "page up" => "PageUp",
        "arrowdown" | "down" => "ArrowDown",
        "arrowleft" | "left" => "ArrowLeft",
        "arrowright" | "right" => "ArrowRight",
        "arrowup" | "up" => "ArrowUp",
        function if is_function_key(function) => return Ok(function.to_ascii_uppercase()),
        _ => return Err(format!("unsupported shortcut key {key}")),
    };
    Ok(normalized.to_string())
}

fn is_function_key(input: &str) -> bool {
    let Some(number) = input.strip_prefix('f') else {
        return false;
    };
    matches!(number.parse::<u8>(), Ok(1..=24))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_and_formats_simple_hotkey_with_comma_key() {
        let sequence = HotkeySequence::parse("shift+ctrl+,").expect("valid shortcut");

        assert!(sequence.is_simple());
        assert_eq!(sequence.to_string(), "Ctrl+Shift+,");
    }

    #[test]
    fn parses_and_formats_compound_hotkey() {
        let sequence = HotkeySequence::parse("ctrl+alt+c, j").expect("valid sequence");

        assert_eq!(sequence.steps().len(), 2);
        assert_eq!(sequence.to_string(), "Ctrl+Alt+C, J");
    }

    #[test]
    fn rejects_invalid_steps() {
        let error = HotkeySequence::parse("Ctrl+Alt").expect_err("missing key");

        assert_eq!(error, "shortcut step must contain a key");
    }

    #[test]
    fn resolves_registered_simple_and_compound_routes() {
        let mut registry = ShortcutRegistry::default();
        registry
            .register("picker", "Ctrl+Shift+,", ShortcutRoute::PickerOpen)
            .expect("register picker");
        registry
            .register(
                "script.join",
                "Ctrl+Alt+C, J",
                ShortcutRoute::ScriptRun {
                    action_id: "join-lines".to_string(),
                },
            )
            .expect("register script");

        assert_eq!(
            registry.resolve(&HotkeySequence::parse("Ctrl+Shift+,").unwrap()),
            Some(&ShortcutRoute::PickerOpen)
        );
        assert_eq!(
            registry.resolve(&HotkeySequence::parse("Ctrl+Alt+C, J").unwrap()),
            Some(&ShortcutRoute::ScriptRun {
                action_id: "join-lines".to_string()
            })
        );
    }

    #[test]
    fn detects_duplicate_simple_hotkeys() {
        let mut registry = ShortcutRegistry::default();
        registry
            .register("picker", "Ctrl+Shift+,", ShortcutRoute::PickerOpen)
            .expect("register picker");

        let diagnostic = registry
            .register(
                "command.other",
                "Shift+Ctrl+,",
                ShortcutRoute::Command {
                    command_id: "other".to_string(),
                },
            )
            .expect_err("duplicate");

        assert_eq!(diagnostic.kind, HotkeyDiagnosticKind::Duplicate);
        assert_eq!(registry.diagnostics().len(), 1);
    }

    #[test]
    fn detects_duplicate_compound_hotkeys() {
        let mut registry = ShortcutRegistry::default();
        registry
            .register(
                "tag.work",
                "Ctrl+Alt+C, W",
                ShortcutRoute::Command {
                    command_id: "open-work".to_string(),
                },
            )
            .expect("register tag");

        let diagnostic = registry
            .register(
                "script.work",
                "Ctrl+Alt+C, W",
                ShortcutRoute::ScriptRun {
                    action_id: "work".to_string(),
                },
            )
            .expect_err("duplicate");

        assert_eq!(diagnostic.kind, HotkeyDiagnosticKind::Duplicate);
    }

    #[test]
    fn detects_compound_prefix_ambiguity_when_shorter_registered_first() {
        let mut registry = ShortcutRegistry::default();
        registry
            .register(
                "tag.top",
                "Ctrl+Alt+C, T",
                ShortcutRoute::Command {
                    command_id: "open-top".to_string(),
                },
            )
            .expect("register short route");

        let diagnostic = registry
            .register(
                "tag.work",
                "Ctrl+Alt+C, T, W",
                ShortcutRoute::Command {
                    command_id: "open-work".to_string(),
                },
            )
            .expect_err("ambiguous");

        assert_eq!(diagnostic.kind, HotkeyDiagnosticKind::Ambiguous);
    }

    #[test]
    fn detects_compound_prefix_ambiguity_when_longer_registered_first() {
        let mut registry = ShortcutRegistry::default();
        registry
            .register(
                "tag.work",
                "Ctrl+Alt+C, T, W",
                ShortcutRoute::Command {
                    command_id: "open-work".to_string(),
                },
            )
            .expect("register long route");

        let diagnostic = registry
            .register(
                "tag.top",
                "Ctrl+Alt+C, T",
                ShortcutRoute::Command {
                    command_id: "open-top".to_string(),
                },
            )
            .expect_err("ambiguous");

        assert_eq!(diagnostic.kind, HotkeyDiagnosticKind::Ambiguous);
    }

    #[test]
    fn exposes_next_steps_for_prefix() {
        let mut registry = ShortcutRegistry::default();
        registry
            .register(
                "tag.work",
                "Ctrl+Alt+C, W",
                ShortcutRoute::Command {
                    command_id: "open-work".to_string(),
                },
            )
            .expect("register work");
        registry
            .register(
                "whichkey.root",
                "Ctrl+Alt+C, ?",
                ShortcutRoute::WhichKeyOpen {
                    prefix: Some(HotkeySequence::parse("Ctrl+Alt+C").unwrap()),
                },
            )
            .expect("register whichkey");

        let prefix = HotkeySequence::parse("Ctrl+Alt+C").unwrap();
        let keys = registry
            .next_steps(&prefix)
            .expect("prefix exists")
            .into_iter()
            .map(ToString::to_string)
            .collect::<Vec<_>>();

        assert_eq!(keys, vec!["?", "W"]);
    }

    #[test]
    fn exposes_next_step_routes_for_prefix() {
        let mut registry = ShortcutRegistry::default();
        registry
            .register(
                "script.toast",
                "Ctrl+Alt+C, T",
                ShortcutRoute::ScriptRun {
                    action_id: "toast".to_string(),
                },
            )
            .expect("register script");

        let prefix = HotkeySequence::parse("Ctrl+Alt+C").unwrap();
        let entries = registry.next_step_routes(&prefix).expect("prefix exists");

        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].step.to_string(), "T");
        assert_eq!(entries[0].id, "script.toast");
        assert_eq!(
            entries[0].route,
            ShortcutRoute::ScriptRun {
                action_id: "toast".to_string()
            }
        );
    }
}
