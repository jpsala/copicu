//! Synthetic storage-side opening benchmark. Never opens an existing profile,
//! starts a watcher/window, or measures Win32, IPC, React or cold-disk latency.
//! cargo run --offline --release --example bench_picker_open -- 10000 100
use copicu_lib::storage::{AppStorage, HistorySearchMode, HistorySearchRequest};
use rusqlite::{params, Connection};
use serde::Serialize;
use std::{
    env,
    error::Error,
    fs,
    time::{Instant, SystemTime, UNIX_EPOCH},
};

type BenchResult<T> = Result<T, Box<dyn Error>>;

fn measure<T: Serialize>(name: &str, mut run: impl FnMut() -> BenchResult<T>) -> BenchResult<()> {
    let mut samples = Vec::new();
    let mut bytes = 0;
    let mut encode_ms = 0.0;
    for sample in 0..6 {
        let start = Instant::now();
        let result = run()?;
        let elapsed = start.elapsed().as_secs_f64() * 1000.0;
        let encode = Instant::now();
        bytes = serde_json::to_vec(&result)?.len();
        encode_ms = encode.elapsed().as_secs_f64() * 1000.0;
        if sample > 0 {
            samples.push(elapsed);
        }
    }
    samples.sort_by(f64::total_cmp);
    println!(
        "{}",
        serde_json::json!({
            "case": name, "medianMs": samples[samples.len()/2], "maxMs": samples.last(),
            "samplesMs": samples, "jsonBytes": bytes, "lastSerializeMs": encode_ms
        })
    );
    Ok(())
}

fn request(query: &str, counts: bool) -> HistorySearchRequest {
    HistorySearchRequest {
        query: query.into(),
        display_query: Some(query.into()),
        cursor: None,
        limit: Some(60),
        plan: None,
        mode: HistorySearchMode::Structured,
        include_content: false,
        include_counts: counts,
        explain: true,
        ai_context: None,
        applied_descriptor: None,
    }
}

fn main() -> BenchResult<()> {
    let args: Vec<_> = env::args().collect();
    let count = args
        .get(1)
        .map(|s| s.parse::<usize>())
        .transpose()?
        .unwrap_or(10_000);
    let tag_count = args
        .get(2)
        .map(|s| s.parse::<usize>())
        .transpose()?
        .unwrap_or(100);
    if !(60..=100_000).contains(&count) || !(1..=500).contains(&tag_count) {
        return Err("use 60..100000 items and 1..500 tags".into());
    }
    let nonce = SystemTime::now().duration_since(UNIX_EPOCH)?.as_nanos();
    let dir = env::temp_dir().join(format!(
        "copicu-synthetic-picker-{}-{nonce}",
        std::process::id()
    ));
    fs::create_dir(&dir)?;
    // Cleanup only the unique directory created by this invocation, after handles close.
    let result = run(&dir, count, tag_count);
    let cleanup = fs::remove_dir_all(&dir);
    result?;
    cleanup?;
    Ok(())
}

fn run(dir: &std::path::Path, count: usize, tag_count: usize) -> BenchResult<()> {
    let storage = AppStorage::open(dir)?;
    let mut conn = Connection::open(storage.db_path())?;
    conn.pragma_update(None, "foreign_keys", "ON")?;
    let tx = conn.transaction()?;
    {
        let mut item = tx.prepare("INSERT INTO clipboard_items(id,content_kind,text,normalized_hash,created_at_unix_ms,last_used_at_unix_ms,last_copied_at_unix_ms) VALUES (?1,'text',?2,?3,?4,?4,?4)")?;
        let mut tag = tx.prepare("INSERT INTO tags(id,slug,label,created_at_unix_ms,updated_at_unix_ms) VALUES (?1,?2,?2,0,0)")?;
        let mut link = tx.prepare(
            "INSERT INTO clipboard_item_tags(item_id,tag_id,created_at_unix_ms) VALUES (?1,?2,0)",
        )?;
        for id in 1..=tag_count {
            tag.execute(params![id as i64, format!("synthetic-{id}")])?;
        }
        for id in 1..=count {
            item.execute(params![
                id as i64,
                format!("COPICU_SYNTH_{id} {}", "ordinary ".repeat(60)),
                format!("synthetic-{id}"),
                1_800_000_000_000_i64 + id as i64
            ])?;
            link.execute(params![id as i64, (1 + id % tag_count) as i64])?;
        }
    }
    tx.commit()?;
    println!(
        "{}",
        serde_json::json!({
            "items": count, "tags": tag_count, "linksPerItem": 1,
            "sqlite": rusqlite::version(), "debug": cfg!(debug_assertions),
            "profile": "synthetic file-backed WAL; warm samples; no native UI"
        })
    );
    measure("history_search_empty", || {
        Ok(storage.history_search(request("", true))?)
    })?;
    measure("list_tags", || Ok(storage.list_tags()?))?;
    measure("list_folders", || Ok(storage.list_folders()?))?;
    measure("root_item_count", || Ok(storage.root_item_count()?))?;
    measure("count_marked", || Ok(storage.count_marked()?))?;
    measure("history_search_text_counts", || {
        Ok(storage.history_search(request("ordinary", true))?)
    })?;
    measure("history_search_text_no_counts", || {
        Ok(storage.history_search(request("ordinary", false))?)
    })?;
    conn.execute(
        "UPDATE clipboard_items SET text=?1 WHERE id>?2",
        params![
            format!("COPICU_SYNTH_LONG {}", "x".repeat(250_000)),
            count.saturating_sub(61) as i64
        ],
    )?;
    measure("history_search_long_250k_chars", || {
        Ok(storage.history_search(request("", true))?)
    })?;
    Ok(())
}
