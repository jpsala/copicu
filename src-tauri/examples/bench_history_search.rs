use copicu_lib::storage::{AppStorage, HistorySearchMode, HistorySearchRequest, SearchPlanV1};
use sha2::{Digest, Sha256};
use std::{
    env,
    path::PathBuf,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

fn main() -> Result<(), String> {
    let item_count = env::args()
        .nth(1)
        .and_then(|value| value.parse::<usize>().ok())
        .unwrap_or(10_000);
    let app_data_dir = temp_app_data_dir(item_count)?;
    let storage = AppStorage::open(&app_data_dir)?;

    let seed_started = Instant::now();
    seed_synthetic_history(&storage, item_count)?;
    let seed_duration = seed_started.elapsed();

    let cases = [
        ("initial_with_counts", "", true),
        ("needle_with_counts", "needle", true),
        ("needle_without_counts", "needle", false),
        ("bucket_with_counts", "bucket=1", true),
        ("bucket_without_counts", "bucket=1", false),
    ];

    println!(
        "dataset={} app_data={} seed_ms={}",
        item_count,
        app_data_dir.display(),
        millis(seed_duration)
    );
    for (name, query, include_counts) in cases {
        let started = Instant::now();
        let page = storage.history_search(HistorySearchRequest {
            query: query.to_string(),
            cursor: None,
            limit: Some(60),
            plan: None::<SearchPlanV1>,
            mode: HistorySearchMode::Structured,
            include_content: false,
            include_counts,
            explain: false,
            ai_context: None,
        })?;
        let duration = started.elapsed();
        let json_bytes = serde_json::to_vec(&page)
            .map_err(|error| format!("failed to serialize benchmark page: {error}"))?
            .len();
        println!(
            "case={name} query={query:?} include_counts={include_counts} elapsed_ms={} items={} next={} total={:?} filtered={:?} json_bytes={}",
            millis(duration),
            page.items.len(),
            page.next_cursor.is_some(),
            page.total_count,
            page.filtered_count,
            json_bytes
        );
    }

    let _ = std::fs::remove_dir_all(&app_data_dir);
    Ok(())
}

fn seed_synthetic_history(storage: &AppStorage, item_count: usize) -> Result<(), String> {
    for index in 0..item_count {
        let text = synthetic_text(index);
        let hash = synthetic_hash(&text, index);
        storage.insert_text(&text, &hash)?;
    }
    Ok(())
}

fn synthetic_text(index: usize) -> String {
    let bucket = index % 10;
    let marker = if index % 7 == 0 { "needle" } else { "ordinary" };
    let tag = if index % 13 == 0 { "#perf" } else { "#general" };
    let length_class = match index % 4 {
        0 => "short".to_string(),
        1 => "medium synthetic paragraph with repeated local clipboard benchmark words".to_string(),
        2 => "long ".repeat(120).trim().to_string(),
        _ => "multiline\nsynthetic\nclipboard\nentry".to_string(),
    };
    format!("COPICU_SYNTH_PERF item={index} bucket={bucket} {marker} {tag} {length_class}")
}

fn synthetic_hash(text: &str, index: usize) -> String {
    let mut hasher = Sha256::new();
    hasher.update(text.as_bytes());
    hasher.update(index.to_le_bytes());
    format!("{:x}", hasher.finalize())
}

fn temp_app_data_dir(item_count: usize) -> Result<PathBuf, String> {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| format!("system clock before unix epoch: {error}"))?
        .as_millis();
    Ok(env::temp_dir().join(format!(
        "copicu-history-bench-{}-{item_count}-{millis}",
        std::process::id()
    )))
}

fn millis(duration: Duration) -> u128 {
    duration.as_micros() / 1_000
}
