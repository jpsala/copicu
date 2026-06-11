use serde_json::json;
use std::time::{SystemTime, UNIX_EPOCH};

use super::ActionContext;

pub(super) fn input_summary_json(
    storage: &crate::storage::AppStorage,
    context: &ActionContext,
) -> String {
    let item_ids = context
        .selected_item_ids
        .iter()
        .copied()
        .chain(context.current_item_id)
        .collect::<Vec<_>>();
    let kinds = item_ids
        .iter()
        .filter_map(|item_id| storage.get_item(*item_id).ok())
        .fold(
            std::collections::BTreeMap::<String, usize>::new(),
            |mut acc, item| {
                *acc.entry(item.content_kind().to_string()).or_default() += 1;
                acc
            },
        );

    json!({
        "selectedCount": context.selected_item_ids.len(),
        "hasCurrentItem": context.current_item_id.is_some(),
        "trigger": context.trigger.as_log_value(),
        "kinds": kinds,
        "view": context.view.as_ref().map(|view| json!({
            "queryLength": view.query.chars().count(),
            "visibleCount": view.visible_item_ids.len(),
            "hasCurrentIndex": view.current_index.is_some()
        }))
    })
    .to_string()
}

pub(super) fn redact_error(error: &str) -> String {
    let mut redacted = error.to_string();
    for url in error
        .split_whitespace()
        .filter(|part| part.starts_with("http://") || part.starts_with("https://"))
    {
        redacted = redacted.replace(url, "[url]");
    }
    redacted
}

pub(super) fn now_unix_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis().min(i64::MAX as u128) as i64)
        .unwrap_or_default()
}
