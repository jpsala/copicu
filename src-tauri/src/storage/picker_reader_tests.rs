use super::super::{
    hash_text,
    performance_study::{request, Fixture},
    HistorySearchMode,
};
use super::*;
use rusqlite::{functions::FunctionFlags, params};
use std::{sync::mpsc, time::Instant};

pub(super) struct Gate {
    pub(super) started: mpsc::SyncSender<()>,
    pub(super) release: mpsc::Receiver<()>,
}
struct Running(PickerHistoryReader);
impl Running {
    fn new(fixture: &Fixture) -> Self {
        Self(PickerHistoryReader::new(fixture.storage().clone()).unwrap())
    }
}
impl Drop for Running {
    fn drop(&mut self) {
        self.0.control.stop();
        if let Some(worker) = self.0._worker.take() {
            worker.join().unwrap();
        }
    }
}
fn token(session: u64, generation: u64) -> ReadToken {
    ReadToken {
        session,
        generation,
    }
}
fn receive(mut response: Receiver<Response>) -> Response {
    let started = Instant::now();
    loop {
        if let Ok(result) = response.try_recv() {
            return result;
        }
        assert!(!response.is_closed(), "reader dropped reply without result");
        assert!(
            started.elapsed() < Duration::from_secs(10),
            "reader response timeout"
        );
        thread::sleep(Duration::from_millis(1));
    }
}
fn error(response: Response) -> String {
    match response {
        Err(e) => e,
        Ok(_) => panic!("expected read error"),
    }
}
fn gate(slot: &Mutex<Option<Gate>>) -> (mpsc::Receiver<()>, mpsc::SyncSender<()>) {
    let (started, reached) = mpsc::sync_channel(1);
    let (release, released) = mpsc::sync_channel(1);
    assert!(slot
        .lock()
        .unwrap()
        .replace(Gate {
            started,
            release: released
        })
        .is_none());
    (reached, release)
}
fn wait(reached: mpsc::Receiver<()>) {
    reached.recv_timeout(Duration::from_secs(10)).unwrap();
}
fn page_request(fixture: &Fixture) -> HistorySearchRequest {
    let page = fixture.storage().history_search(request("", true)).unwrap();
    let mut next = request("", false);
    next.cursor = page.next_cursor;
    next.applied_descriptor = page.applied_descriptor;
    assert!(next.cursor.is_some());
    next
}

#[test]
fn equivalent_pages_filters_udfs_and_counts_without_writer_lock() {
    let fixture = Fixture::new(240);
    let running = Running::new(&fixture);
    let session = running.0.begin_session().unwrap();
    let mut generation = 0;
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
        "folder:/",
        "kind:",
    ] {
        for counts in [false, true] {
            let expected = fixture
                .storage()
                .history_search(request(query, counts))
                .unwrap();
            generation += 1;
            // Holding the actual writer mutex must not prevent the service from finishing.
            let writer_guard = fixture.storage().conn.lock().unwrap();
            let actual = receive(
                running
                    .0
                    .submit(token(session, generation), request(query, counts))
                    .unwrap(),
            )
            .unwrap();
            assert_eq!(
                serde_json::to_value(&actual).unwrap(),
                serde_json::to_value(&expected).unwrap()
            );
            drop(writer_guard);
            if let Some(cursor) = expected.next_cursor {
                let mut next = request(query, false);
                next.cursor = Some(cursor);
                next.applied_descriptor = expected.applied_descriptor;
                let expected = fixture.storage().history_search(next.clone()).unwrap();
                generation += 1;
                let actual =
                    receive(running.0.submit(token(session, generation), next).unwrap()).unwrap();
                assert_eq!(
                    serde_json::to_value(actual).unwrap(),
                    serde_json::to_value(expected).unwrap()
                );
            }
        }
    }
}

#[test]
fn one_active_two_pending_coalesces_and_rejects_out_of_order() {
    let fixture = Fixture::new(240);
    let running = Running::new(&fixture);
    let session = running.0.begin_session().unwrap();
    let (reached, release) = gate(&running.0.control.gate);
    let first = running
        .0
        .submit(token(session, 1), request("", true))
        .unwrap();
    wait(reached);
    let replace = running
        .0
        .submit(token(session, 3), request("ordinary", true))
        .unwrap();
    let page = running
        .0
        .submit(token(session, 4), page_request(&fixture))
        .unwrap();
    {
        let queue = running.0.control.queue.lock().unwrap();
        assert!(queue
            .active
            .as_ref()
            .unwrap()
            .cancelled
            .load(Ordering::Acquire));
        assert_eq!(queue.pending.iter().filter(|p| p.is_some()).count(), 2);
    }
    let newest = running
        .0
        .submit(token(session, 5), request("oldestneedle", true))
        .unwrap();
    assert_eq!(error(receive(replace)), SUPERSEDED);
    assert_eq!(error(receive(page)), SUPERSEDED);
    assert_eq!(
        running
            .0
            .submit(token(session, 2), request("", true))
            .err()
            .unwrap(),
        SUPERSEDED
    );
    release.send(()).unwrap();
    assert_eq!(error(receive(first)), SUPERSEDED);
    let result = receive(newest).unwrap();
    assert_eq!(result.filtered_count, Some(1));
    assert_eq!(result.items[0].id, 1);
}

#[test]
fn pagination_never_cancels_active_refresh() {
    let fixture = Fixture::new(240);
    let running = Running::new(&fixture);
    let session = running.0.begin_session().unwrap();
    let (reached, release) = gate(&running.0.control.gate);
    let first = running
        .0
        .submit(token(session, 1), request("", true))
        .unwrap();
    wait(reached);
    let page = running
        .0
        .submit(token(session, 2), page_request(&fixture))
        .unwrap();
    assert!(!running
        .0
        .control
        .queue
        .lock()
        .unwrap()
        .active
        .as_ref()
        .unwrap()
        .cancelled
        .load(Ordering::Acquire));
    release.send(()).unwrap();
    assert_eq!(receive(first).unwrap().items[0].id, 240);
    assert_eq!(receive(page).unwrap().items[0].id, 180);
}

#[test]
fn old_session_cannot_cancel_or_advance_new_session() {
    let fixture = Fixture::new(240);
    let running = Running::new(&fixture);
    let old = running.0.begin_session().unwrap();
    let (reached, release) = gate(&running.0.control.gate);
    let stale = running.0.submit(token(old, 1), request("", true)).unwrap();
    wait(reached);
    let current = running.0.begin_session().unwrap();
    assert!(current > old);
    assert_eq!(
        running
            .0
            .submit(token(old, MAX_SAFE_INTEGER), request("", true))
            .err()
            .unwrap(),
        SUPERSEDED
    );
    let next = running
        .0
        .submit(token(current, 1), request("ordinary", true))
        .unwrap();
    release.send(()).unwrap();
    assert_eq!(error(receive(stale)), SUPERSEDED);
    assert_eq!(receive(next).unwrap().filtered_count, Some(240));
}

#[test]
fn validation_errors_and_sql_failure_do_not_poison_next_job() {
    let fixture = Fixture::new(240);
    let running = Running::new(&fixture);
    let session = running.0.begin_session().unwrap();
    let mut full = request("", false);
    full.include_content = true;
    assert!(running.0.submit(token(session, 1), full).is_err());
    let mut ai = request("", false);
    ai.mode = HistorySearchMode::Ai;
    assert!(running.0.submit(token(session, 1), ai).is_err());
    assert!(running
        .0
        .submit(
            token(session, 1),
            request(&"x".repeat(MAX_REQUEST_BYTES), false)
        )
        .is_err());
    let mut invalid = request("ordinary", true);
    invalid.plan = Some(super::super::SearchPlanV1 {
        schema_version: 255,
        ..Default::default()
    });
    assert!(!error(receive(
        running.0.submit(token(session, 1), invalid).unwrap()
    ))
    .is_empty());
    assert_eq!(
        receive(
            running
                .0
                .submit(token(session, 2), request("", true))
                .unwrap()
        )
        .unwrap()
        .total_count,
        Some(240)
    );
}

#[test]
fn reader_open_failure_is_retryable_and_never_falls_back_to_writer() {
    let fixture = Fixture::new(240);
    let mut storage = fixture.storage().clone();
    storage.db_path = storage.app_data_dir.join("does-not-exist.sqlite");
    let running = Running(PickerHistoryReader::new(storage).unwrap());
    let session = running.0.begin_session().unwrap();
    for generation in 1..=2 {
        let result = receive(
            running
                .0
                .submit(token(session, generation), request("", true))
                .unwrap(),
        );
        assert!(error(result).starts_with("failed to open history reader"));
    }
    assert_eq!(
        fixture
            .storage()
            .history_search(request("", true))
            .unwrap()
            .total_count,
        Some(240)
    );
}

#[test]
fn shutdown_resolves_pending_and_wakes_worker() {
    let fixture = Fixture::new(240);
    let running = Running::new(&fixture);
    let session = running.0.begin_session().unwrap();
    let (reached, release) = gate(&running.0.control.gate);
    let first = running
        .0
        .submit(token(session, 1), request("", true))
        .unwrap();
    wait(reached);
    let pending = running
        .0
        .submit(token(session, 2), request("", true))
        .unwrap();
    running.0.control.stop();
    assert_eq!(error(receive(pending)), CLOSED);
    assert_eq!(running.0.begin_session().unwrap_err(), CLOSED);
    release.send(()).unwrap();
    assert_eq!(error(receive(first)), SUPERSEDED);
}

#[test]
fn read_snapshot_keeps_counts_page_and_matches_consistent_during_commit() {
    let fixture = Fixture::new(240);
    let storage = fixture.storage().clone();
    let mut reader = open_reader(&storage).unwrap();
    assert!(reader.is_readonly(rusqlite::MAIN_DB).unwrap());
    assert!(reader
        .execute("UPDATE clipboard_items SET title='synthetic'", [])
        .is_err());
    let (started, reached) = mpsc::sync_channel(1);
    let (release, released) = mpsc::sync_channel(1);
    let first = AtomicBool::new(true);
    reader
        .create_scalar_function("regexp", 2, FunctionFlags::SQLITE_UTF8, move |ctx| {
            if first.swap(false, Ordering::AcqRel) {
                started.send(()).unwrap();
                released.recv().unwrap();
            }
            Ok(ctx.get::<String>(1)?.contains("ordinary"))
        })
        .unwrap();
    let worker = thread::spawn(move || {
        let page = read_snapshot(&storage, &mut reader, request("re:ordinary", true), &|| {
            false
        })
        .unwrap();
        assert!(reader.is_autocommit());
        (reader, page)
    });
    wait(reached); // total count already read; filtered count paused in its first UDF.
    let text = "ordinary synthetic concurrent insertion";
    let new_id = fixture
        .storage()
        .insert_text(text, &hash_text(text))
        .unwrap();
    release.send(()).unwrap();
    let (mut reader, page) = worker.join().unwrap();
    assert_eq!(page.total_count, Some(240));
    assert_eq!(page.filtered_count, Some(240));
    assert_eq!(page.items[0].id, 240);
    let fresh = read_snapshot(
        fixture.storage(),
        &mut reader,
        request("ordinary", true),
        &|| false,
    )
    .unwrap();
    assert_eq!(fresh.total_count, Some(241));
    assert_eq!(fresh.items[0].id, new_id);
}

#[test]
fn progress_cancellation_rolls_back_and_cannot_interrupt_next_query() {
    let fixture = Fixture::new(240);
    let storage = fixture.storage().clone();
    let mut reader = open_reader(&storage).unwrap();
    let flag = Arc::new(AtomicBool::new(false));
    let progress_flag = flag.clone();
    reader
        .progress_handler(1, Some(move || progress_flag.load(Ordering::Acquire)))
        .unwrap();
    let (started, reached) = mpsc::sync_channel(1);
    let (release, released) = mpsc::sync_channel(1);
    let first = AtomicBool::new(true);
    reader
        .create_scalar_function("regexp", 2, FunctionFlags::SQLITE_UTF8, move |ctx| {
            if first.swap(false, Ordering::AcqRel) {
                started.send(()).unwrap();
                released.recv().unwrap();
            }
            Ok(ctx.get::<String>(1)?.contains("ordinary"))
        })
        .unwrap();
    let query_flag = flag.clone();
    let worker = thread::spawn(move || {
        let result = read_snapshot(&storage, &mut reader, request("re:ordinary", true), &|| {
            query_flag.load(Ordering::Acquire)
        });
        (reader, result)
    });
    wait(reached);
    flag.store(true, Ordering::Release);
    // Cancellation only belongs to the reader, not the writer.
    fixture
        .storage()
        .insert_text(
            "synthetic independent write",
            &hash_text("synthetic independent write"),
        )
        .unwrap();
    release.send(()).unwrap();
    let (mut reader, result) = worker.join().unwrap();
    assert_eq!(error(result), SUPERSEDED);
    assert!(reader.is_autocommit());
    // Leave the old flag true. A stale callback would interrupt this subsequent query.
    assert_eq!(
        read_snapshot(fixture.storage(), &mut reader, request("", true), &|| false)
            .unwrap()
            .total_count,
        Some(241)
    );
}

#[test]
fn thumbnails_are_read_after_snapshot_release_and_deleted_files_are_missing() {
    let fixture = Fixture::new(240);
    let storage = fixture.storage();
    let thumbnail = "blobs/thumbnails/synthetic.png";
    let path = storage.app_data_dir.join(thumbnail);
    super::super::write_blob(&path, b"synthetic thumbnail bytes").unwrap();
    storage
        .conn
        .lock()
        .unwrap()
        .execute(
            "UPDATE clipboard_items SET content_kind='image',thumbnail_path=?1 WHERE id=240",
            params![thumbnail],
        )
        .unwrap();
    let running = Running::new(&fixture);
    let session = running.0.begin_session().unwrap();
    let first = receive(
        running
            .0
            .submit(token(session, 1), request("", true))
            .unwrap(),
    )
    .unwrap();
    assert!(first.items[0].thumbnail_data_url.is_some());
    let (reached, release) = gate(&running.0.control.after_snapshot_gate);
    let pending = running
        .0
        .submit(token(session, 2), request("", true))
        .unwrap();
    wait(reached);
    storage.delete_item(240).unwrap();
    assert!(!path.exists());
    let (frames, checkpointed) = storage
        .conn
        .lock()
        .unwrap()
        .query_row("PRAGMA wal_checkpoint(PASSIVE)", [], |row| {
            Ok((row.get::<_, i64>(1)?, row.get::<_, i64>(2)?))
        })
        .unwrap();
    assert_eq!(
        frames, checkpointed,
        "thumbnail I/O must not pin a read transaction"
    );
    release.send(()).unwrap();
    let page = receive(pending).unwrap();
    assert_eq!(page.items[0].id, 240); // metadata belongs to the pre-delete snapshot
    assert!(page.items[0].thumbnail_data_url.is_none());
    assert!(storage.get_item(240).is_err()); // actions cannot use the deleted ID
}

#[test]
#[ignore = "opt-in release comparison of the integrated service during real recapture"]
fn integrated_reader_contention_benchmark() {
    use super::super::performance_study::{record, synthetic_text};
    assert!(!cfg!(debug_assertions));
    let count = std::env::var("COPICU_STUDY_ITEMS")
        .unwrap_or_else(|_| "10000".into())
        .parse::<i64>()
        .unwrap();
    assert!((240..=100_000).contains(&count));
    let fixture = Fixture::new(count);
    let running = Running::new(&fixture);
    let session = running.0.begin_session().unwrap();
    let mut generation = 0;
    println!(
        "INTEGRATED_READER {}",
        serde_json::json!({"kind":"configuration","items":count,"tags":100,"sqlite":rusqlite::version(),"blocks":3,"roundsPerBlock":34,"warmupsPerBlock":2,"workload":"same-item recapture, retention unlimited; real mutex acquisition notification","scope":"AppStorage legacy vs integrated worker/queue/read transaction; no IPC, UI or hotkey"})
    );
    for block in 0..3 {
        let mut samples: [Vec<serde_json::Value>; 2] = [Vec::new(), Vec::new()];
        for round in 0..36 {
            let modes = if (block + round) % 2 == 0 {
                [0, 1]
            } else {
                [1, 0]
            };
            for mode in modes {
                generation += 1;
                let sample = thread::scope(|scope| {
                    let storage = fixture.storage();
                    let (started, reached) = mpsc::sync_channel(1);
                    let background = scope.spawn(move || {
                        let (id, timing) = record(Some(started), || {
                            let text = synthetic_text(1);
                            storage.insert_text(&text, &hash_text(&text))
                        });
                        assert_eq!(id.unwrap(), 1);
                        timing
                    });
                    let locked = reached.recv_timeout(Duration::from_secs(10)).unwrap();
                    let start_after_lock_ms = locked.elapsed().as_secs_f64() * 1000.0;
                    let start = Instant::now();
                    let page = if mode == 0 {
                        storage.history_search(request("", false)).unwrap()
                    } else {
                        tauri::async_runtime::block_on(
                            running
                                .0
                                .search(token(session, generation), request("", false)),
                        )
                        .unwrap()
                    };
                    let elapsed_ms = start.elapsed().as_secs_f64() * 1000.0;
                    assert_eq!(page.items.len(), 60);
                    assert!(page.total_count.is_none());
                    let background = background.join().unwrap();
                    serde_json::json!({"wallMs":elapsed_ms,"startAfterLockMs":start_after_lock_ms,"background":background})
                });
                if round >= 2 {
                    samples[mode].push(sample);
                }
            }
        }
        println!(
            "INTEGRATED_READER {}",
            serde_json::json!({"kind":"block","block":block,"legacy":samples[0],"integrated":samples[1]})
        );
    }
    println!(
        "INTEGRATED_READER {}",
        serde_json::json!({"kind":"complete"})
    );
}
