use super::{ActionContext, ActionDefinition, ActionInputSource, ClipKind, SelectionRequirement};

pub(super) fn validate_action_input(
    storage: &crate::storage::AppStorage,
    action: &ActionDefinition,
    context: &ActionContext,
) -> Result<(), String> {
    let selected_count = context.selected_item_ids.len();
    let selection_ok = match action.input.selection {
        SelectionRequirement::None => selected_count == 0,
        SelectionRequirement::Optional => true,
        SelectionRequirement::One => selected_count == 1,
        SelectionRequirement::OneOrMore => selected_count >= 1,
        SelectionRequirement::Many => selected_count >= 2,
    };
    if !selection_ok {
        return Err(format!(
            "action input requires {:?} selection",
            action.input.selection
        ));
    }

    let input_item_ids = if action.input.source == ActionInputSource::Clipboard {
        context.current_item_id.into_iter().collect::<Vec<_>>()
    } else {
        context.selected_item_ids.clone()
    };

    if input_item_ids.is_empty() {
        return Ok(());
    }

    if let Some(kinds) = &action.input.kinds {
        for item_id in &input_item_ids {
            let item = storage.get_item(*item_id)?;
            let item_kind = clip_kind_from_content_kind(item.content_kind());
            if !kinds.contains(&item_kind) {
                return Err(format!(
                    "action does not accept {} items",
                    item.content_kind()
                ));
            }
        }
    }

    if let Some(mime_patterns) = &action.input.mime {
        for item_id in &input_item_ids {
            let item = storage.get_item(*item_id)?;
            let value = serde_json::to_value(&item)
                .map_err(|error| format!("failed to encode selected item: {error}"))?;
            let mime = value["mime_primary"].as_str().unwrap_or("");
            if !mime_patterns
                .iter()
                .any(|pattern| mime_matches(pattern, mime))
            {
                return Err(format!("action does not accept MIME {mime}"));
            }
        }
    }

    Ok(())
}

fn clip_kind_from_content_kind(value: &str) -> ClipKind {
    match value {
        "text" => ClipKind::Text,
        "html" => ClipKind::Html,
        "image" => ClipKind::Image,
        "fileList" => ClipKind::FileList,
        _ => ClipKind::Unknown,
    }
}

fn mime_matches(pattern: &str, mime: &str) -> bool {
    if pattern == "*" || pattern == mime {
        return true;
    }
    pattern
        .strip_suffix("/*")
        .is_some_and(|prefix| mime.starts_with(&format!("{prefix}/")))
}
