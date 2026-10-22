//! Test-only native storage experiment. No app/window/watcher/network is started.
//! The ignored benchmark creates its own synthetic profile; it accepts no profile path.
//! Spans are thread-local, opt-in, bounded by the operation, and contain no payloads.
use super::*;
use std::{cell::RefCell, fs, sync::mpsc, thread, time::Instant};

#[derive(Default)]
struct Recording {
    stages: BTreeMap<&'static str, f64>,
    lock_acquired: Option<mpsc::SyncSender<Instant>>,
}
thread_local! {
    static RECORDING: RefCell<Option<Recording>> = const { RefCell::new(None) };
}

pub(super) struct Span(Option<(&'static str, Instant)>);
pub(super) fn span(name: &'static str) -> Span {
    RECORDING.with(|slot| {
        let mut slot = slot.borrow_mut();
        let Some(recording) = slot.as_mut() else {
            return Span(None);
        };
        let now = Instant::now();
        if name.ends_with(".mutex_hold") {
            if let Some(sender) = recording.lock_acquired.take() {
                // Capacity one: notification does not wait for the foreground reader.
                let _ = sender.send(now);
            }
        }
        Span(Some((name, now)))
    })
}
impl Drop for Span {
    fn drop(&mut self) {
        if let Some((name, start)) = self.0 {
            let elapsed = start.elapsed().as_secs_f64() * 1000.0;
            RECORDING.with(|slot| {
                if let Some(recording) = slot.borrow_mut().as_mut() {
                    *recording.stages.entry(name).or_default() += elapsed;
                }
            });
        }
    }
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Timing {
    wall_ms: f64,
    stages_ms: BTreeMap<&'static str, f64>,
}
fn record<T>(ready: Option<mpsc::SyncSender<Instant>>, run: impl FnOnce() -> T) -> (T, Timing) {
    struct Reset;
    impl Drop for Reset {
        fn drop(&mut self) {
            RECORDING.with(|slot| {
                slot.borrow_mut().take();
            });
        }
    }
    RECORDING.with(|slot| {
        assert!(slot.borrow().is_none(), "nested performance recording");
        *slot.borrow_mut() = Some(Recording {
            stages: BTreeMap::new(),
            lock_acquired: ready,
        });
    });
    let _reset = Reset;
    let started = Instant::now();
    let result = run();
    let wall_ms = started.elapsed().as_secs_f64() * 1000.0;
    let recording = RECORDING.with(|slot| slot.borrow_mut().take().unwrap());
    (
        result,
        Timing {
            wall_ms,
            stages_ms: recording.stages,
        },
    )
}

struct Fixture {
    storage: Option<AppStorage>,
    path: PathBuf,
}
impl Fixture {
    fn new(count: i64) -> Self {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let path = std::env::temp_dir().join(format!(
            "copicu-native-study-{}-{nonce}",
            std::process::id()
        ));
        fs::create_dir(&path).unwrap();
        let fixture = Self {
            storage: Some(AppStorage::open(&path).unwrap()),
            path,
        };
        {
            let mut conn = fixture.storage().conn.lock().unwrap();
            let tx = conn.transaction().unwrap();
            for id in 1..=100_i64 {
                let tag = match id {
                    1 => "research".into(),
                    2 => "research/child".into(),
                    _ => format!("synthetic-{id}"),
                };
                tx.execute("INSERT INTO tags(id,slug,label,created_at_unix_ms,updated_at_unix_ms) VALUES (?1,?2,?2,0,0)", params![id,tag]).unwrap();
            }
            {
                let mut item = tx.prepare("INSERT INTO clipboard_items(id,content_kind,text,normalized_hash,created_at_unix_ms,last_used_at_unix_ms,last_copied_at_unix_ms) VALUES (?1,'text',?2,?3,?4,?4,?4)").unwrap();
                let mut tag = tx.prepare("INSERT INTO clipboard_item_tags(item_id,tag_id,created_at_unix_ms) VALUES (?1,?2,0)").unwrap();
                for id in 1..=count {
                    let text = synthetic_text(id);
                    item.execute(params![
                        id,
                        text,
                        hash_text(&text),
                        1_700_000_000_000_i64 + id
                    ])
                    .unwrap();
                    tag.execute(params![id, 1 + id % 100]).unwrap();
                }
            }
            tx.commit().unwrap();
        }
        fixture
    }
    fn storage(&self) -> &AppStorage {
        self.storage.as_ref().unwrap()
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        self.storage.take();
        // Only the unique directory created by Fixture::new, after worker/reader handles close.
        if let Err(error) = fs::remove_dir_all(&self.path) {
            eprintln!("synthetic fixture cleanup failed: {error}");
        }
    }
}
fn synthetic_text(id: i64) -> String {
    format!(
        "COPICU_SYNTH_{id} {}{}",
        "ordinary ".repeat(60),
        if id == 1 { " oldestneedle 😀é" } else { "" }
    )
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
fn independent_reader(storage: &AppStorage) -> AppStorage {
    let conn =
        Connection::open_with_flags(storage.db_path(), OpenFlags::SQLITE_OPEN_READ_ONLY).unwrap();
    conn.busy_timeout(Duration::from_millis(5_000)).unwrap();
    add_regexp_function(&conn).unwrap();
    assert!(conn.is_readonly(rusqlite::MAIN_DB).unwrap());
    // Clone only in this test module; no production API or reader routing is introduced.
    let mut reader = storage.clone();
    reader.conn = Arc::new(Mutex::new(conn));
    reader
}
fn search(
    storage: &AppStorage,
    snapshot: bool,
    request: HistorySearchRequest,
) -> Result<HistoryPage, String> {
    if !snapshot {
        return storage.history_search(request);
    }
    // This reader belongs exclusively to this test thread. Never expose this split
    // BEGIN/call/COMMIT sequence as a shared production API. All timed fixtures are text;
    // production must end the read transaction before thumbnail I/O, not after it.
    storage
        .conn
        .lock()
        .unwrap()
        .execute_batch("BEGIN")
        .map_err(|e| e.to_string())?;
    let result = storage.history_search(request);
    storage
        .conn
        .lock()
        .unwrap()
        .execute_batch(if result.is_ok() { "COMMIT" } else { "ROLLBACK" })
        .map_err(|e| e.to_string())?;
    result
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SearchSample {
    timing: Timing,
    encode_ms: f64,
    json_bytes: usize,
    rows: usize,
    total_count: Option<i64>,
    filtered_count: Option<i64>,
}
fn measure_search(storage: &AppStorage, snapshot: bool, query: &str, counts: bool) -> SearchSample {
    let (page, timing) = record(None, || search(storage, snapshot, request(query, counts)));
    let page = page.unwrap();
    let encode = Instant::now();
    let json_bytes = serde_json::to_vec(&page).unwrap().len();
    SearchSample {
        timing,
        encode_ms: encode.elapsed().as_secs_f64() * 1000.0,
        json_bytes,
        rows: page.items.len(),
        total_count: page.total_count,
        filtered_count: page.filtered_count,
    }
}
fn emit(value: serde_json::Value) {
    println!("NATIVE_STUDY {value}");
}
fn env_number(name: &str, default: usize, min: usize, max: usize) -> usize {
    let value = std::env::var(name)
        .map(|v| v.parse::<usize>().expect("numeric study setting"))
        .unwrap_or(default);
    assert!(
        (min..=max).contains(&value),
        "study setting out of range: {name}"
    );
    value
}

#[test]
fn reader_equivalence_and_snapshot_contract() {
    let fixture = Fixture::new(200);
    let writer = fixture.storage();
    let reader = independent_reader(writer);
    for query in [
        "",
        "ordinary",
        "oldestneedle",
        "absentneedle",
        "😀é",
        "#research",
        "re:oldestneedle",
        "in:content ordinary",
        "is:marked",
    ] {
        for counts in [false, true] {
            let expected = writer.history_search(request(query, counts)).unwrap();
            let actual = search(&reader, true, request(query, counts)).unwrap();
            assert_eq!(
                serde_json::to_value(&expected).unwrap(),
                serde_json::to_value(&actual).unwrap(),
                "{query}, counts={counts}"
            );
            if let Some(cursor) = expected.next_cursor {
                let mut next = request(query, false);
                next.cursor = Some(cursor);
                next.applied_descriptor = expected.applied_descriptor;
                let expected_next = writer.history_search(next.clone()).unwrap();
                let actual_next = search(&reader, true, next).unwrap();
                assert_eq!(
                    serde_json::to_value(expected_next).unwrap(),
                    serde_json::to_value(actual_next).unwrap()
                );
            }
        }
    }
    assert!(reader
        .conn
        .lock()
        .unwrap()
        .execute("UPDATE clipboard_items SET notes='synthetic'", [])
        .is_err());
    // A parse/SQL failure must leave the reader reusable, not inside an open transaction.
    let mut invalid = request("ordinary", true);
    invalid.plan = Some(SearchPlanV1 {
        schema_version: 255,
        ..SearchPlanV1::default()
    });
    assert!(search(&reader, true, invalid).is_err());
    assert!(reader.conn.lock().unwrap().is_autocommit());
    reader.conn.lock().unwrap().execute_batch("BEGIN").unwrap();
    let before = reader.history_search(request("", true)).unwrap();
    let text = "synthetic snapshot insertion";
    let new_id = writer.insert_text(text, &hash_text(text)).unwrap();
    let pinned = reader.history_search(request("", true)).unwrap();
    assert_eq!(
        serde_json::to_value(&before).unwrap(),
        serde_json::to_value(pinned).unwrap()
    );
    reader.conn.lock().unwrap().execute_batch("COMMIT").unwrap();
    let fresh = search(&reader, true, request("", true)).unwrap();
    assert_eq!(fresh.total_count, Some(201));
    assert_eq!(fresh.items[0].id, new_id);
    // Spans are disabled by default, and two count calls accumulate under one fixed label.
    let (_, timing) = record(None, || {
        writer.history_search(request("ordinary", true)).unwrap()
    });
    for name in [
        "search.total",
        "search.mutex_wait",
        "search.mutex_hold",
        "search.page",
        "search.counts",
        "search.matches",
        "search.thumbnails",
    ] {
        assert!(timing.stages_ms.contains_key(name), "missing stage: {name}");
    }
    assert!(RECORDING.with(|slot| slot.borrow().is_none()));
}

#[test]
#[ignore = "opt-in synthetic release storage benchmark; no native window/clipboard"]
fn native_readers_and_counts() {
    assert!(!cfg!(debug_assertions), "run this study in --release");
    let count = env_number("COPICU_STUDY_ITEMS", 10_000, 200, 100_000) as i64;
    let rounds = env_number("COPICU_STUDY_ROUNDS", 34, 1, 100);
    let blocks = 3;
    let fixture = Fixture::new(count);
    let shared = fixture.storage();
    let reader = independent_reader(shared);
    emit(
        serde_json::json!({"kind":"configuration","items":count,"tags":100,"roundsPerBlock":rounds,"blocks":blocks,"warmupsPerBlock":2,"sqlite":rusqlite::version(),"debug":cfg!(debug_assertions),"profile":"new synthetic file-backed WAL; no UI, watcher, IPC, worker pool or network","snapshotCaveat":"reader transaction encloses history_search; text-only fixture, no thumbnail I/O","durations":"milliseconds; nested stages overlap, do not add them to total","cpuParallelism":thread::available_parallelism().unwrap().get()}),
    );
    for (case, query, expected) in [
        ("empty", "", count),
        ("common", "ordinary", count),
        ("oldest-only", "oldestneedle", 1),
        ("absent", "absentneedle", 0),
    ] {
        for counts in [false, true] {
            for block in 0..blocks {
                let mut samples: [Vec<SearchSample>; 2] = [Vec::new(), Vec::new()];
                for round in 0..rounds + 2 {
                    let modes = if (round + block) % 2 == 0 {
                        [0, 1]
                    } else {
                        [1, 0]
                    };
                    for mode in modes {
                        let sample = measure_search(
                            if mode == 0 { shared } else { &reader },
                            mode == 1,
                            query,
                            counts,
                        );
                        assert_eq!(sample.rows, expected.min(60) as usize);
                        assert_eq!(sample.total_count, counts.then_some(count));
                        assert_eq!(sample.filtered_count, counts.then_some(expected));
                        if round >= 2 {
                            samples[mode].push(sample);
                        }
                    }
                }
                emit(
                    serde_json::json!({"kind":"serial","case":case,"counts":counts,"block":block,"shared":samples[0],"reader":samples[1]}),
                );
            }
        }
    }
    for workload in ["scan", "capture-unlimited", "capture-retention"] {
        let mut settings = shared.get_settings().unwrap();
        settings.history.retention_count = if workload == "capture-retention" {
            count
        } else {
            0
        };
        shared.update_settings(settings).unwrap();
        for block in 0..blocks {
            let mut samples: [Vec<serde_json::Value>; 2] = [Vec::new(), Vec::new()];
            for round in 0..rounds + 2 {
                let modes = if (round + block) % 2 == 0 {
                    [0, 1]
                } else {
                    [1, 0]
                };
                for mode in modes {
                    let sample = thread::scope(|scope| {
                        let (tx, rx) = mpsc::sync_channel(1);
                        let background = scope.spawn(move || {
                            let (result, timing) = record(Some(tx), || {
                                if workload == "scan" {
                                    shared
                                        .history_search(request("absentneedle", true))
                                        .map(|page| page.items.len() as i64)
                                } else {
                                    let text = synthetic_text(1);
                                    shared.insert_text(&text, &hash_text(&text))
                                }
                            });
                            assert_eq!(result.unwrap(), if workload == "scan" { 0 } else { 1 });
                            timing
                        });
                        let locked = rx
                            .recv_timeout(Duration::from_secs(30))
                            .expect("background reached real mutex");
                        let foreground_start_after_lock_ms =
                            locked.elapsed().as_secs_f64() * 1000.0;
                        let foreground = measure_search(
                            if mode == 0 { shared } else { &reader },
                            mode == 1,
                            "",
                            false,
                        );
                        assert_eq!(foreground.rows, 60);
                        let background = background.join().unwrap();
                        serde_json::json!({"foreground":foreground,"background":background,"foregroundStartAfterLockMs":foreground_start_after_lock_ms})
                    });
                    if round >= 2 {
                        samples[mode].push(sample);
                    }
                }
            }
            // Compare full native DTO/cursor/match results after writes have quiesced.
            assert_eq!(
                serde_json::to_value(shared.history_search(request("", true)).unwrap()).unwrap(),
                serde_json::to_value(search(&reader, true, request("", true)).unwrap()).unwrap()
            );
            let conn = shared.conn.lock().unwrap();
            let checkpoint = conn
                .query_row("PRAGMA wal_checkpoint(PASSIVE)", [], |row| {
                    Ok((
                        row.get::<_, i64>(0)?,
                        row.get::<_, i64>(1)?,
                        row.get::<_, i64>(2)?,
                    ))
                })
                .unwrap();
            drop(conn);
            let wal_bytes = fs::metadata(fixture.path.join("copicu.sqlite3-wal"))
                .map(|m| m.len())
                .unwrap_or(0);
            emit(
                serde_json::json!({"kind":"contention","case":workload,"block":block,"shared":samples[0],"reader":samples[1],"checkpointAfterBlock":checkpoint,"walBytesAfterCheckpoint":wal_bytes}),
            );
        }
    }
    emit(
        serde_json::json!({"kind":"complete","correctness":"assertions passed; candidate is test-only, not routed by the app"}),
    );
}
