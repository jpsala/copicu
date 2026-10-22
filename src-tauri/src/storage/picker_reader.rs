//! Bounded, main-picker-only read service. The writer and non-feed APIs stay separate.
use super::{add_regexp_function, AppStorage, HistoryPage, HistorySearchRequest};
use rusqlite::{Connection, OpenFlags};
use serde::{Deserialize, Serialize};
use std::{
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Condvar, Mutex,
    },
    thread::{self, JoinHandle},
    time::Duration,
};
use tauri::async_runtime::{channel, Receiver, Sender};

pub const SUPERSEDED: &str = "HISTORY_SEARCH_SUPERSEDED";
const CLOSED: &str = "History reader is closed";
const MAX_REQUEST_BYTES: usize = 1024 * 1024;
const MAX_SAFE_INTEGER: u64 = 9_007_199_254_740_991;
type Response = Result<HistoryPage, String>;

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ReadToken {
    pub session: u64,
    pub generation: u64,
}
struct Job {
    token: ReadToken,
    request: HistorySearchRequest,
    reply: Sender<Response>,
    cancelled: Arc<AtomicBool>,
}
struct Active {
    token: ReadToken,
    lane: usize,
    cancelled: Arc<AtomicBool>,
}
#[derive(Default)]
struct Queue {
    session: u64,
    latest: [u64; 2], // refresh, pagination
    pending: [Option<Job>; 2],
    active: Option<Active>,
    closed: bool,
}
#[derive(Default)]
struct Control {
    queue: Mutex<Queue>,
    wake: Condvar,
    #[cfg(test)]
    gate: Mutex<Option<tests::Gate>>,
    #[cfg(test)]
    after_snapshot_gate: Mutex<Option<tests::Gate>>,
}
impl Control {
    fn stop(&self) {
        let mut queue = self.queue.lock().unwrap_or_else(|e| e.into_inner());
        queue.closed = true;
        if let Some(active) = &queue.active {
            active.cancelled.store(true, Ordering::Release);
        }
        for job in queue.pending.iter_mut().filter_map(Option::take) {
            let _ = job.reply.try_send(Err(CLOSED.into()));
        }
        self.wake.notify_all();
    }
}

pub struct PickerHistoryReader {
    control: Arc<Control>,
    _worker: Option<JoinHandle<()>>,
}
impl PickerHistoryReader {
    pub fn new(storage: AppStorage) -> Result<Self, String> {
        let control = Arc::new(Control::default());
        let worker_control = control.clone();
        let worker = thread::Builder::new()
            .name("copicu-picker-reader".into())
            .spawn(move || worker(storage, worker_control))
            .map_err(|e| format!("failed to start history reader: {e}"))?;
        Ok(Self {
            control,
            _worker: Some(worker),
        })
    }

    pub fn begin_session(&self) -> Result<u64, String> {
        let mut queue = self.control.queue.lock().map_err(|_| CLOSED.to_string())?;
        if queue.closed {
            return Err(CLOSED.into());
        }
        queue.session = queue
            .session
            .checked_add(1)
            .filter(|id| *id <= MAX_SAFE_INTEGER)
            .ok_or("History reader session exhausted")?;
        queue.latest = [0, 0];
        if let Some(active) = &queue.active {
            active.cancelled.store(true, Ordering::Release);
        }
        for job in queue.pending.iter_mut().filter_map(Option::take) {
            let _ = job.reply.try_send(Err(SUPERSEDED.into()));
        }
        Ok(queue.session)
    }

    pub async fn search(&self, token: ReadToken, request: HistorySearchRequest) -> Response {
        self.submit(token, request)?
            .recv()
            .await
            .unwrap_or_else(|| Err(CLOSED.into()))
    }

    fn submit(
        &self,
        token: ReadToken,
        request: HistorySearchRequest,
    ) -> Result<Receiver<Response>, String> {
        if request.include_content {
            return Err("Picker reads cannot include full content".into());
        }
        if request.mode == super::HistorySearchMode::Ai && request.applied_descriptor.is_none() {
            return Err("AI planning must use the non-reader history route".into());
        }
        if serde_json::to_vec(&request)
            .map_err(|_| "Invalid picker read request")?
            .len()
            > MAX_REQUEST_BYTES
        {
            return Err("Picker read request exceeds 1 MiB".into());
        }
        let lane = usize::from(request.cursor.is_some());
        let mut queue = self.control.queue.lock().map_err(|_| CLOSED.to_string())?;
        if queue.closed {
            return Err(CLOSED.into());
        }
        if token.session == 0
            || token.session != queue.session
            || token.generation == 0
            || token.generation > MAX_SAFE_INTEGER
            || token.generation <= queue.latest[lane]
            || (lane == 1 && token.generation <= queue.latest[0])
        {
            return Err(SUPERSEDED.into());
        }
        queue.latest[lane] = token.generation;
        if let Some(active) = &queue.active {
            if active.token.session != token.session
                || (active.token.generation < token.generation
                    && (lane == 0 || active.lane == lane))
            {
                active.cancelled.store(true, Ordering::Release);
            }
        }
        if lane == 0
            && queue.pending[1]
                .as_ref()
                .is_some_and(|j| j.token.generation < token.generation)
        {
            if let Some(old) = queue.pending[1].take() {
                let _ = old.reply.try_send(Err(SUPERSEDED.into()));
            }
        }
        let (reply, receiver) = channel(1);
        let job = Job {
            token,
            request,
            reply,
            cancelled: Arc::new(AtomicBool::new(false)),
        };
        if let Some(old) = queue.pending[lane].replace(job) {
            let _ = old.reply.try_send(Err(SUPERSEDED.into()));
        }
        self.control.wake.notify_one();
        Ok(receiver)
    }
}
impl Drop for PickerHistoryReader {
    fn drop(&mut self) {
        // Do not block the UI destructor on an individual filesystem/UDF operation.
        // The awakened worker exits cooperatively and owns/closes its connection.
        self.control.stop();
    }
}
struct StopOnExit(Arc<Control>);
impl Drop for StopOnExit {
    fn drop(&mut self) {
        self.0.stop();
    }
}

fn open_reader(storage: &AppStorage) -> Result<Connection, String> {
    let conn = Connection::open_with_flags(storage.db_path(), OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(|e| format!("failed to open history reader: {e}"))?;
    conn.busy_timeout(Duration::from_millis(250))
        .map_err(|e| e.to_string())?;
    conn.pragma_update(None, "foreign_keys", "ON")
        .map_err(|e| e.to_string())?;
    add_regexp_function(&conn)?;
    Ok(conn)
}

// No thumbnails here. Even on cancellation/error, finish the transaction before returning.
fn read_snapshot(
    storage: &AppStorage,
    conn: &mut Connection,
    request: HistorySearchRequest,
    cancelled: &impl Fn() -> bool,
) -> Response {
    if cancelled() {
        return Err(SUPERSEDED.into());
    }
    let tx = conn
        .transaction()
        .map_err(|e| format!("history reader snapshot failed: {e}"))?;
    let result = storage.history_search_on_connection(&tx, request);
    // A cancelled progress handler must not interrupt rollback/commit or the next job.
    tx.progress_handler(0, None::<fn() -> bool>)
        .map_err(|e| e.to_string())?;
    if cancelled() || result.is_err() {
        tx.rollback()
            .map_err(|e| format!("history reader rollback failed: {e}"))?;
        return if cancelled() {
            Err(SUPERSEDED.into())
        } else {
            result
        };
    }
    tx.commit()
        .map_err(|e| format!("history reader commit failed: {e}"))?;
    result
}

fn worker(storage: AppStorage, control: Arc<Control>) {
    let _stop_on_exit = StopOnExit(control.clone());
    let mut connection: Option<Connection> = None;
    loop {
        let job = {
            let mut queue = control.queue.lock().unwrap_or_else(|e| e.into_inner());
            while !queue.closed && queue.pending.iter().all(Option::is_none) {
                queue = control.wake.wait(queue).unwrap_or_else(|e| e.into_inner());
            }
            if queue.closed {
                return;
            }
            let lane = if queue.pending[0].is_some() { 0 } else { 1 };
            let job = queue.pending[lane].take().expect("pending job");
            queue.active = Some(Active {
                token: job.token,
                lane,
                cancelled: job.cancelled.clone(),
            });
            job
        };
        #[cfg(test)]
        {
            let gate = control.gate.lock().unwrap().take();
            if let Some(gate) = gate {
                let _ = gate.started.send(());
                let _ = gate.release.recv();
            }
        }
        let Job {
            token,
            request,
            reply,
            cancelled,
        } = job;
        let is_cancelled = || cancelled.load(Ordering::Acquire) || reply.is_closed();
        let result = (|| {
            if is_cancelled() {
                return Err(SUPERSEDED.into());
            }
            if connection.is_none() {
                connection = Some(open_reader(&storage)?);
            }
            let conn = connection.as_mut().expect("reader initialized");
            let flag = cancelled.clone();
            let response_owner = reply.clone();
            conn.progress_handler(
                1000,
                Some(move || flag.load(Ordering::Acquire) || response_owner.is_closed()),
            )
            .map_err(|e| e.to_string())?;
            let page = read_snapshot(&storage, conn, request, &is_cancelled);
            let cleanup = conn.progress_handler(0, None::<fn() -> bool>);
            if cleanup.is_err() || !conn.is_autocommit() {
                // Never reuse a connection with a failed cleanup or retained snapshot.
                connection = None;
                return Err("History reader cleanup failed; retry the request".into());
            }
            let mut page = page?;
            #[cfg(test)]
            {
                let gate = control.after_snapshot_gate.lock().unwrap().take();
                if let Some(gate) = gate {
                    let _ = gate.started.send(());
                    let _ = gate.release.recv();
                }
            }
            // The read transaction and its SQLite progress callback are gone.
            for item in &mut page.items {
                if is_cancelled() {
                    return Err(SUPERSEDED.into());
                }
                item.thumbnail_data_url = storage.thumbnail_data_url(item);
            }
            Ok(page)
        })();
        let mut queue = control.queue.lock().unwrap_or_else(|e| e.into_inner());
        let result = if is_cancelled() || queue.session != token.session {
            Err(SUPERSEDED.into())
        } else {
            result
        };
        queue.active = None;
        let _ = reply.try_send(result);
    }
}

#[cfg(test)]
#[path = "picker_reader_tests.rs"]
mod tests;
