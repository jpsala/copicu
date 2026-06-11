#[cfg(not(test))]
use super::RunActionRequest;

#[cfg(not(test))]
pub(super) fn open_selected_url(
    storage: &crate::storage::AppStorage,
    request: &RunActionRequest,
) -> Result<String, String> {
    let item_id = require_one_selected(&request.context.selected_item_ids)?;
    let item = storage.get_item(item_id)?;
    if item.content_kind() != "text" {
        return Err("open URL requires a text item".to_string());
    }
    let url = first_url(item.text()).ok_or_else(|| "selected item has no URL".to_string())?;
    open_url(&url)?;
    storage.mark_used(item_id)?;
    Ok("Opened URL".to_string())
}

#[cfg(not(test))]
fn require_one_selected(selected_item_ids: &[i64]) -> Result<i64, String> {
    if selected_item_ids.len() != 1 {
        return Err("action requires exactly one selected item".to_string());
    }
    Ok(selected_item_ids[0])
}

pub(super) fn first_url(text: &str) -> Option<String> {
    text.split_whitespace()
        .map(|part| {
            part.trim_matches(|character: char| {
                matches!(
                    character,
                    '"' | '\'' | '<' | '>' | '(' | ')' | '[' | ']' | '{' | '}' | ',' | ';'
                )
            })
        })
        .find(|part| part.starts_with("https://") || part.starts_with("http://"))
        .map(|part| {
            part.trim_end_matches(|character: char| {
                matches!(
                    character,
                    '.' | '!' | '?' | ')' | ']' | '}' | '>' | ',' | ';'
                )
            })
            .to_string()
        })
}

#[cfg(all(not(test), target_os = "windows"))]
fn open_url(url: &str) -> Result<(), String> {
    use windows::{
        core::HSTRING,
        Win32::{
            Foundation::HWND,
            UI::{Shell::ShellExecuteW, WindowsAndMessaging::SW_SHOWNORMAL},
        },
    };

    let operation = HSTRING::from("open");
    let file = HSTRING::from(url);
    let result = unsafe {
        ShellExecuteW(
            Some(HWND::default()),
            &operation,
            &file,
            None,
            None,
            SW_SHOWNORMAL,
        )
    };
    if result.0 as isize <= 32 {
        Err(format!(
            "failed to open URL, shell code {}",
            result.0 as isize
        ))
    } else {
        Ok(())
    }
}

#[cfg(all(not(test), not(target_os = "windows")))]
fn open_url(url: &str) -> Result<(), String> {
    let opener = if cfg!(target_os = "macos") {
        "open"
    } else {
        "xdg-open"
    };
    std::process::Command::new(opener)
        .arg(url)
        .spawn()
        .map_err(|error| format!("failed to open URL: {error}"))?;
    Ok(())
}
