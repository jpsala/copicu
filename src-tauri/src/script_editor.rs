use std::env;
#[cfg(not(test))]
use std::{path::Path, process::Command};

#[cfg(not(test))]
use crate::storage;

#[cfg(not(test))]
pub(crate) fn open_scripts_folder_in_vscode<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    storage: &storage::AppStorage,
) -> Result<(), String> {
    open_scripts_path_in_vscode(app, storage, None)
}

#[cfg(not(test))]
pub(crate) fn open_scripts_path_in_vscode<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    storage: &storage::AppStorage,
    target_path: Option<&Path>,
) -> Result<(), String> {
    let settings = storage.get_settings()?;
    let vscode_path = normalize_vscode_launcher_path(&settings.scripts.vscode_path);
    if vscode_path.is_empty() {
        open_scripts_settings(app);
        return Err("VS Code not configured. Set Settings > Actions > VS Code path.".to_string());
    }

    let launcher_path = Path::new(&vscode_path);
    if !launcher_path.exists() {
        open_scripts_settings(app);
        return Err(format!(
            "VS Code launcher not found: {}",
            launcher_path.display()
        ));
    }

    let scripts_folder = Path::new(&settings.scripts.folder_path);
    if !scripts_folder.exists() {
        open_scripts_settings(app);
        return Err(format!(
            "Scripts folder not found: {}",
            scripts_folder.display()
        ));
    }

    let scripts_folder = scripts_folder
        .canonicalize()
        .map_err(|error| format!("Could not resolve scripts folder: {error}"))?;
    let open_target = match target_path {
        Some(path) => {
            let canonical_path = path
                .canonicalize()
                .map_err(|error| format!("Script file not found: {} ({error})", path.display()))?;
            if !canonical_path.starts_with(&scripts_folder) {
                return Err("Script file must be inside the configured scripts folder.".to_string());
            }
            if !canonical_path.is_file() {
                return Err(format!(
                    "Script path is not a file: {}",
                    canonical_path.display()
                ));
            }
            canonical_path
        }
        None => scripts_folder,
    };

    let spawn_result = match launcher_path
        .extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| extension.to_ascii_lowercase())
    {
        Some(extension) if extension == "cmd" || extension == "bat" => Command::new("cmd")
            .arg("/C")
            .arg(&vscode_path)
            .arg(&open_target)
            .spawn(),
        Some(extension) if extension == "ps1" => Command::new("powershell")
            .arg("-NoProfile")
            .arg("-ExecutionPolicy")
            .arg("Bypass")
            .arg("-File")
            .arg(&vscode_path)
            .arg(&open_target)
            .spawn(),
        _ => Command::new(&vscode_path).arg(&open_target).spawn(),
    };

    spawn_result.map_err(|error| {
        open_scripts_settings(app);
        format!(
            "Could not open VS Code. Check Settings > Actions > VS Code path and point it to Code.exe, code.cmd, or a valid launcher script. ({error})"
        )
    })?;
    Ok(())
}

#[cfg(not(test))]
fn open_scripts_settings<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    crate::spawn_open_settings_window(app.clone());
    crate::focus_settings_section(app.clone(), "scripts");
}

fn normalize_vscode_launcher_path(raw_path: &str) -> String {
    let trimmed = raw_path.trim();
    let unquoted = if trimmed.len() >= 2 && trimmed.starts_with('"') && trimmed.ends_with('"') {
        trimmed[1..trimmed.len() - 1].trim()
    } else {
        trimmed
    };
    expand_windows_env_vars(unquoted)
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
    fn normalize_vscode_launcher_path_trims_quotes_and_whitespace() {
        assert_eq!(
            normalize_vscode_launcher_path("  \"C:/Program Files/Code/bin/code.cmd\"  "),
            "C:/Program Files/Code/bin/code.cmd"
        );
    }

    #[test]
    fn expand_windows_env_vars_keeps_unknown_variables() {
        assert_eq!(
            expand_windows_env_vars("%COPICU_UNKNOWN_TEST_VAR%/Code"),
            "%COPICU_UNKNOWN_TEST_VAR%/Code"
        );
    }
}
