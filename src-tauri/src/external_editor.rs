use serde::Serialize;
use std::{
    env,
    path::{Path, PathBuf},
    process::{Command, ExitStatus},
};

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ExternalEditorCandidate {
    pub id: String,
    pub name: String,
    pub path: String,
    pub configured: bool,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct ResolvedExternalEditor {
    pub name: String,
    pub path: PathBuf,
}

pub(crate) fn detect_external_editors(configured_path: &str) -> Vec<ExternalEditorCandidate> {
    let configured = normalize_launcher_path(configured_path);
    let mut candidates = Vec::new();

    if !configured.is_empty() {
        let path = PathBuf::from(&configured);
        if path.is_file() {
            push_candidate(
                &mut candidates,
                "configured",
                "Configured editor",
                path,
                true,
            );
        }
    }

    for (id, name, relative_paths, commands) in editor_profiles() {
        for path in standard_install_paths(&relative_paths) {
            if path.is_file() {
                push_candidate(&mut candidates, id, name, path, false);
            }
        }
        for command in commands {
            if let Some(path) = resolve_on_path(command) {
                push_candidate(&mut candidates, id, name, path, false);
            }
        }
    }

    candidates
}

pub(crate) fn resolve_external_editor(
    configured_path: &str,
) -> Result<ResolvedExternalEditor, String> {
    let candidates = detect_external_editors(configured_path);
    let candidate = candidates.into_iter().next().ok_or_else(|| {
        "No supported external editor was found. Install VS Code, Cursor, VSCodium, or Windsurf, or choose an editor executable in Settings > Editor."
            .to_string()
    })?;
    Ok(ResolvedExternalEditor {
        name: candidate.name,
        path: PathBuf::from(candidate.path),
    })
}

pub(crate) fn launch_and_wait(
    editor: &ResolvedExternalEditor,
    target: &Path,
) -> Result<ExitStatus, String> {
    let mut command = launcher_command(&editor.path)?;
    if supports_wait_argument(&editor.path) {
        command.arg("--wait");
    }
    command.arg(target);
    command
        .status()
        .map_err(|error| format!("Could not open {}: {error}", editor.name))
}

pub(crate) fn normalize_launcher_path(raw_path: &str) -> String {
    let trimmed = raw_path.trim();
    let unquoted = if trimmed.len() >= 2 && trimmed.starts_with('"') && trimmed.ends_with('"') {
        trimmed[1..trimmed.len() - 1].trim()
    } else {
        trimmed
    };
    expand_windows_env_vars(unquoted)
}

fn editor_profiles() -> Vec<(
    &'static str,
    &'static str,
    Vec<&'static str>,
    Vec<&'static str>,
)> {
    vec![
        (
            "vscode",
            "Visual Studio Code",
            vec![
                r"Programs\Microsoft VS Code\Code.exe",
                r"Microsoft VS Code\Code.exe",
            ],
            vec!["code.cmd", "code.exe"],
        ),
        (
            "vscode-insiders",
            "Visual Studio Code Insiders",
            vec![
                r"Programs\Microsoft VS Code Insiders\Code - Insiders.exe",
                r"Microsoft VS Code Insiders\Code - Insiders.exe",
            ],
            vec!["code-insiders.cmd", "code-insiders.exe"],
        ),
        (
            "cursor",
            "Cursor",
            vec![r"Programs\cursor\Cursor.exe", r"Cursor\Cursor.exe"],
            vec!["cursor.cmd", "cursor.exe"],
        ),
        (
            "vscodium",
            "VSCodium",
            vec![r"Programs\VSCodium\VSCodium.exe", r"VSCodium\VSCodium.exe"],
            vec!["codium.cmd", "codium.exe"],
        ),
        (
            "windsurf",
            "Windsurf",
            vec![r"Programs\Windsurf\Windsurf.exe", r"Windsurf\Windsurf.exe"],
            vec!["windsurf.cmd", "windsurf.exe"],
        ),
    ]
}

fn standard_install_paths(relative_paths: &[&str]) -> Vec<PathBuf> {
    let mut paths = Vec::new();
    for root in ["LOCALAPPDATA", "ProgramFiles", "ProgramFiles(x86)"] {
        let Some(root) = env::var_os(root).filter(|value| !value.is_empty()) else {
            continue;
        };
        for relative in relative_paths {
            paths.push(PathBuf::from(&root).join(relative));
        }
    }
    paths
}

fn resolve_on_path(command: &str) -> Option<PathBuf> {
    let path = env::var_os("PATH")?;
    env::split_paths(&path)
        .map(|folder| folder.join(command))
        .find(|candidate| candidate.is_file())
}

fn push_candidate(
    candidates: &mut Vec<ExternalEditorCandidate>,
    id: &str,
    name: &str,
    path: PathBuf,
    configured: bool,
) {
    if candidates
        .iter()
        .any(|candidate| paths_equal(Path::new(&candidate.path), &path))
    {
        return;
    }
    candidates.push(ExternalEditorCandidate {
        id: id.to_string(),
        name: name.to_string(),
        path: path.to_string_lossy().into_owned(),
        configured,
    });
}

fn paths_equal(left: &Path, right: &Path) -> bool {
    left.to_string_lossy()
        .eq_ignore_ascii_case(&right.to_string_lossy())
}

fn supports_wait_argument(path: &Path) -> bool {
    let file_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    ["code", "cursor", "codium", "windsurf"]
        .iter()
        .any(|marker| file_name.contains(marker))
}

fn launcher_command(path: &Path) -> Result<Command, String> {
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    match extension.as_str() {
        "cmd" | "bat" => {
            let mut command = Command::new("cmd");
            command.arg("/C").arg(path);
            Ok(command)
        }
        "ps1" => {
            let mut command = Command::new("powershell");
            command
                .arg("-NoProfile")
                .arg("-ExecutionPolicy")
                .arg("Bypass")
                .arg("-File")
                .arg(path);
            Ok(command)
        }
        _ => Ok(Command::new(path)),
    }
}

fn expand_windows_env_vars(input: &str) -> String {
    let mut expanded = String::with_capacity(input.len());
    let mut rest = input;
    while let Some(start) = rest.find('%') {
        expanded.push_str(&rest[..start]);
        let after_start = &rest[start + 1..];
        let Some(end) = after_start.find('%') else {
            expanded.push('%');
            expanded.push_str(after_start);
            return expanded;
        };
        let variable_name = &after_start[..end];
        if variable_name.is_empty() {
            expanded.push_str("%%");
        } else if let Ok(value) = env::var(variable_name) {
            expanded.push_str(&value);
        } else {
            expanded.push('%');
            expanded.push_str(variable_name);
            expanded.push('%');
        }
        rest = &after_start[end + 1..];
    }
    expanded.push_str(rest);
    expanded
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_launcher_path_trims_quotes_and_whitespace() {
        assert_eq!(
            normalize_launcher_path("  \"C:/Program Files/Microsoft VS Code/Code.exe\"  "),
            "C:/Program Files/Microsoft VS Code/Code.exe"
        );
    }

    #[test]
    fn code_family_launchers_support_wait() {
        assert!(supports_wait_argument(Path::new("Code.exe")));
        assert!(supports_wait_argument(Path::new("cursor.cmd")));
        assert!(supports_wait_argument(Path::new("VSCodium.exe")));
        assert!(supports_wait_argument(Path::new("Windsurf.exe")));
        assert!(!supports_wait_argument(Path::new("notepad.exe")));
    }

    #[test]
    fn duplicate_paths_are_case_insensitive() {
        let mut candidates = Vec::new();
        push_candidate(
            &mut candidates,
            "vscode",
            "Visual Studio Code",
            PathBuf::from(r"C:\Tools\Code.exe"),
            false,
        );
        push_candidate(
            &mut candidates,
            "vscode",
            "Visual Studio Code",
            PathBuf::from(r"c:\tools\CODE.EXE"),
            false,
        );
        assert_eq!(candidates.len(), 1);
    }

    #[cfg(windows)]
    #[test]
    fn launcher_waits_for_a_custom_script_and_returns_edited_content() {
        let session_id = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("clock should be after Unix epoch")
            .as_nanos();
        let folder = env::temp_dir().join(format!("copicu-external-editor-test-{session_id}"));
        std::fs::create_dir_all(&folder).expect("test folder should be created");
        let launcher = folder.join("edit.ps1");
        let target = folder.join("item.txt");
        std::fs::write(
            &launcher,
            "Set-Content -LiteralPath $args[0] -NoNewline -Value 'after'",
        )
        .expect("launcher should be written");
        std::fs::write(&target, "before").expect("target should be written");

        let status = launch_and_wait(
            &ResolvedExternalEditor {
                name: "Test editor".to_string(),
                path: launcher,
            },
            &target,
        )
        .expect("launcher should run");

        assert!(status.success());
        assert_eq!(
            std::fs::read_to_string(&target).expect("edited target should load"),
            "after"
        );
        std::fs::remove_dir_all(folder).expect("test folder should be removed");
    }
}
