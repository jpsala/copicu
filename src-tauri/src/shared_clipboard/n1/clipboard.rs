use super::model::Outcome;

#[derive(Default)]
pub(super) struct WriteProgress {
    pub(super) mutation_started: bool,
    pub(super) text_set: bool,
    pub(super) marker_set: bool,
    pub(super) correlated: bool,
}
impl WriteProgress {
    pub(super) fn failure(&self) -> Outcome {
        if self.mutation_started {
            Outcome::Uncertain
        } else {
            Outcome::Failed
        }
    }
    pub(super) fn outcome(&self) -> Outcome {
        if self.text_set && self.marker_set && self.correlated {
            Outcome::Applied
        } else {
            self.failure()
        }
    }
}
pub(super) fn correlates(
    expected: u32,
    observed: u32,
    expected_marker: &[u8],
    marker: &[u8],
) -> bool {
    expected != 0
        && observed == expected
        && !expected_marker.is_empty()
        && marker == expected_marker
}

#[cfg(all(windows, not(test)))]
pub(super) mod native {
    use super::*;
    use crate::n1::{
        model::{Delivery, EffectGate, PauseBarrier, Publication, SnapshotFence},
        Mode, Request, Result, MARKER, MAX_BUFFER, OTHER_TEXT, TEXT,
    };
    use std::{
        ffi::c_void,
        io::{self, BufRead, Read, Write},
        mem::size_of,
        os::windows::{io::AsRawHandle, process::CommandExt},
        process::{Child, ChildStdin, Command, Stdio},
        sync::mpsc::{self, Receiver},
        thread::{self, JoinHandle},
        time::{Duration, Instant},
    };
    use windows::{
        core::PCWSTR,
        Win32::{
            Foundation::{
                CloseHandle, GlobalFree, HANDLE, HGLOBAL, HWND, LPARAM, LRESULT, WAIT_OBJECT_0,
                WPARAM,
            },
            System::{
                DataExchange::*,
                JobObjects::*,
                Memory::{GlobalAlloc, GlobalLock, GlobalSize, GlobalUnlock, GMEM_MOVEABLE},
                Threading::WaitForSingleObject,
            },
            UI::WindowsAndMessaging::*,
        },
    };

    const UNICODE: u32 = 13;
    const OPERATION: Duration = Duration::from_secs(1);
    const EXIT: u32 = 2000;

    pub(in crate::n1) fn reply(message: &str) {
        println!("{message}");
        let _ = io::stdout().flush();
    }
    struct Job(HANDLE);
    impl Job {
        fn new() -> Result<Self> {
            let handle = unsafe { CreateJobObjectW(None, PCWSTR::null()) }
                .map_err(|_| "cannot create owned Job Object")?;
            let job = Self(handle);
            let mut limits = JOBOBJECT_EXTENDED_LIMIT_INFORMATION::default();
            limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            unsafe {
                SetInformationJobObject(
                    handle,
                    JobObjectExtendedLimitInformation,
                    (&limits as *const JOBOBJECT_EXTENDED_LIMIT_INFORMATION).cast(),
                    size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
                )
            }
            .map_err(|_| "cannot contain synthetic helpers")?;
            Ok(job)
        }
        fn terminate(&self) {
            unsafe {
                let _ = TerminateJobObject(self.0, 74);
            }
        }
    }
    impl Drop for Job {
        fn drop(&mut self) {
            unsafe {
                let _ = CloseHandle(self.0);
            }
        }
    }
    struct Helper {
        child: Child,
        input: Option<ChildStdin>,
        output: Receiver<String>,
        reader: Option<JoinHandle<()>>,
    }
    pub(in crate::n1) struct Supervisor {
        job: Job,
        helpers: Vec<Helper>,
        request: Request,
        start: Instant,
        settled: bool,
    }
    impl Supervisor {
        pub(in crate::n1) fn new(request: &Request, start: Instant) -> Result<Self> {
            Ok(Self {
                job: Job::new()?,
                helpers: Vec::new(),
                request: request.clone(),
                start,
                settled: false,
            })
        }
        pub(in crate::n1) fn spawn(&mut self, role: &str) -> Result<usize> {
            if self.start.elapsed() >= Duration::from_secs(30) {
                return Err("matrix deadline reached".into());
            }
            // At most two live helpers per case; exited handles stay owned until finish.
            let mut live = 0;
            for helper in &mut self.helpers {
                if helper
                    .child
                    .try_wait()
                    .map_err(|_| "cannot establish helper state")?
                    .is_none()
                {
                    live += 1;
                }
            }
            if live >= 2 {
                return Err("bounded helper limit reached".into());
            }
            let mode = match self.request.mode {
                Mode::Clipboard => "clipboard",
                Mode::Custody => "custody",
            };
            let permit = match self.request.mode {
                Mode::Clipboard => "--allow-clipboard-mutation",
                Mode::Custody => "--allow-synthetic-secrets",
            };
            let mut child =
                Command::new(std::env::current_exe().map_err(|_| "cannot locate harness")?)
                    .args([
                        "--mode",
                        mode,
                        permit,
                        "--run-id",
                        &self.request.run_id,
                        "--session-label",
                        &self.request.session,
                        "--run-dir",
                    ])
                    .arg(&self.request.run_dir)
                    .args(["--helper", role])
                    .creation_flags(0x08000000)
                    .stdin(Stdio::piped())
                    .stdout(Stdio::piped())
                    .stderr(Stdio::null())
                    .spawn()
                    .map_err(|_| "helper spawn failed")?;
            // Until assignment the child waits on stdin and does no native operation.
            if unsafe { AssignProcessToJobObject(self.job.0, HANDLE(child.as_raw_handle())) }
                .is_err()
            {
                let _ = child.kill();
                let _ = child.wait();
                return Err("helper Job assignment failed; no start admitted".into());
            }
            let input = child.stdin.take().ok_or("helper stdin missing")?;
            let output = child.stdout.take().ok_or("helper stdout missing")?;
            let (sender, receiver) = mpsc::channel();
            let reader = thread::spawn(move || {
                // Public event protocol only, with a bounded line size.
                let mut stream = io::BufReader::new(output);
                loop {
                    let mut line = Vec::new();
                    let read = (&mut stream).take(1025).read_until(b'\n', &mut line);
                    if !matches!(read, Ok(n) if n > 0) || line.len() > 1024 {
                        break;
                    }
                    if sender
                        .send(String::from_utf8_lossy(&line).trim().to_owned())
                        .is_err()
                    {
                        break;
                    }
                }
            });
            let index = self.helpers.len();
            self.helpers.push(Helper {
                child,
                input: Some(input),
                output: receiver,
                reader: Some(reader),
            });
            self.send(index, "start")?;
            Ok(index)
        }
        pub(in crate::n1) fn send(&mut self, index: usize, line: &str) -> Result<()> {
            let input = self
                .helpers
                .get_mut(index)
                .and_then(|h| h.input.as_mut())
                .ok_or("helper not writable")?;
            writeln!(input, "{line}")
                .and_then(|_| input.flush())
                .map_err(|_| "helper IPC write failed".into())
        }
        pub(in crate::n1) fn receive(&self, index: usize) -> Result<String> {
            let remaining = Duration::from_secs(30).saturating_sub(self.start.elapsed());
            if remaining.is_zero() {
                return Err("matrix deadline reached".into());
            }
            self.helpers[index]
                .output
                .recv_timeout(OPERATION.min(remaining))
                .map_err(|_| "helper timed out or lost response; outcome uncertain".into())
        }
        pub(in crate::n1) fn expect(&self, index: usize, expected: &str) -> Result<()> {
            if self.receive(index)? == expected {
                Ok(())
            } else {
                Err("unexpected synthetic helper outcome".into())
            }
        }
        fn signal_exit(&mut self, index: usize) -> Result<()> {
            let helper = &mut self.helpers[index];
            if unsafe { WaitForSingleObject(HANDLE(helper.child.as_raw_handle()), EXIT) }
                != WAIT_OBJECT_0
            {
                return Err("executor exit UNCONFIRMED; stop and preserve run artifacts".into());
            }
            helper
                .child
                .wait()
                .map_err(|_| "cannot reap owned helper")?;
            helper.input.take();
            if let Some(reader) = helper.reader.take() {
                reader.join().map_err(|_| "helper reader did not settle")?;
            }
            Ok(())
        }
        pub(in crate::n1) fn stop(&mut self, index: usize) -> Result<()> {
            self.send(index, "quit")?;
            self.signal_exit(index)
        }
        fn terminate_confirmed(&mut self) -> Result<()> {
            self.job.terminate();
            for index in 0..self.helpers.len() {
                self.signal_exit(index)?;
            }
            self.settled = true;
            Ok(())
        }
        pub(in crate::n1) fn finish(&mut self) -> Result<()> {
            for index in 0..self.helpers.len() {
                if self.helpers[index]
                    .child
                    .try_wait()
                    .map_err(|_| "helper status unavailable")?
                    .is_none()
                {
                    self.send(index, "quit")?;
                }
                self.signal_exit(index)?;
            }
            self.settled = true;
            Ok(())
        }
    }
    impl Drop for Supervisor {
        fn drop(&mut self) {
            if !self.settled {
                self.job.terminate();
                for index in 0..self.helpers.len() {
                    let _ = self.signal_exit(index);
                }
            }
        }
    }

    struct Open;
    impl Open {
        fn acquire(owner: HWND) -> Result<Self> {
            Self::acquire_with(owner, || {})
        }
        fn acquire_with(owner: HWND, busy: impl FnOnce()) -> Result<Self> {
            if unsafe { OpenClipboard(Some(owner)) }.is_ok() {
                return Ok(Self);
            }
            busy();
            for ms in [8, 16, 32, 64] {
                thread::sleep(Duration::from_millis(ms));
                if unsafe { OpenClipboard(Some(owner)) }.is_ok() {
                    return Ok(Self);
                }
            }
            Err("busy".into())
        }
    }
    impl Drop for Open {
        fn drop(&mut self) {
            unsafe {
                let _ = CloseClipboard();
            }
        }
    }
    struct Memory(HGLOBAL);
    impl Memory {
        fn new(bytes: &[u8]) -> Result<Self> {
            if bytes.is_empty() || bytes.len() > MAX_BUFFER {
                return Err("invalid native buffer size".into());
            }
            let global = unsafe { GlobalAlloc(GMEM_MOVEABLE, bytes.len()) }
                .map_err(|_| "allocation failed")?;
            let memory = Self(global);
            let pointer = unsafe { GlobalLock(global) };
            if pointer.is_null() {
                return Err("global buffer lock failed".into());
            }
            unsafe {
                std::ptr::copy_nonoverlapping(bytes.as_ptr(), pointer.cast(), bytes.len());
                let _ = GlobalUnlock(global);
            }
            Ok(memory)
        }
        fn text(text: &str) -> Result<Self> {
            let bytes: Vec<_> = text
                .encode_utf16()
                .chain([0])
                .flat_map(u16::to_le_bytes)
                .collect();
            Self::new(&bytes)
        }
        fn transfer(mut self, format: u32) -> Result<()> {
            unsafe { SetClipboardData(format, Some(HANDLE(self.0 .0))) }
                .map_err(|_| "set format failed")?;
            self.0 = HGLOBAL::default();
            Ok(())
        }
    }
    impl Drop for Memory {
        fn drop(&mut self) {
            if !self.0.is_invalid() {
                unsafe {
                    let _ = GlobalFree(Some(self.0));
                }
            }
        }
    }
    fn bytes(format: u32) -> Result<Vec<u8>> {
        let handle = unsafe { GetClipboardData(format) }.map_err(|_| "format unavailable")?;
        let global = HGLOBAL(handle.0);
        let size = unsafe { GlobalSize(global) };
        if size == 0 || size > MAX_BUFFER {
            return Err("invalid format size".into());
        }
        let pointer = unsafe { GlobalLock(global) };
        if pointer.is_null() {
            return Err("read lock failed".into());
        }
        let bytes = unsafe { std::slice::from_raw_parts(pointer.cast::<u8>(), size) }.to_vec();
        unsafe {
            let _ = GlobalUnlock(global);
        }
        Ok(bytes)
    }
    fn sequence() -> u32 {
        unsafe { GetClipboardSequenceNumber() }
    }
    fn owner_is(owner: HWND) -> bool {
        unsafe { GetClipboardOwner() }.ok() == Some(owner)
    }

    struct WindowState {
        marker_format: u32,
        marker: Vec<u8>,
        own_sequence: u32,
        observed: u32,
        own: bool,
        delayed_ms: Option<u64>,
    }
    unsafe extern "system" fn procedure(
        hwnd: HWND,
        message: u32,
        wparam: WPARAM,
        lparam: LPARAM,
    ) -> LRESULT {
        if message == WM_NCCREATE {
            let create = &*(lparam.0 as *const CREATESTRUCTW);
            SetWindowLongPtrW(hwnd, GWLP_USERDATA, create.lpCreateParams as isize);
        }
        let pointer = GetWindowLongPtrW(hwnd, GWLP_USERDATA) as *mut WindowState;
        if !pointer.is_null() {
            let state = &mut *pointer;
            if message == WM_CLIPBOARDUPDATE {
                state.observed = sequence();
                state.own = false;
                if state.observed == state.own_sequence && owner_is(hwnd) {
                    if let Ok(_open) = Open::acquire(hwnd) {
                        if sequence() == state.own_sequence && owner_is(hwnd) {
                            if let Ok(marker) = bytes(state.marker_format) {
                                // GlobalSize can include padding; compare bounded marker prefix.
                                state.own = correlates(
                                    state.own_sequence,
                                    sequence(),
                                    &state.marker,
                                    marker.get(..state.marker.len()).unwrap_or(&[]),
                                );
                            }
                        }
                    }
                }
                return LRESULT(0);
            }
            if message == WM_RENDERFORMAT && wparam.0 as u32 == UNICODE {
                if let Some(ms) = state.delayed_ms.take() {
                    thread::sleep(Duration::from_millis(ms));
                    if let Ok(memory) = Memory::text(TEXT) {
                        let _ = memory.transfer(UNICODE);
                    }
                }
                return LRESULT(0);
            }
            if message == WM_RENDERALLFORMATS && owner_is(hwnd) {
                if let Ok(_open) = Open::acquire(hwnd) {
                    if owner_is(hwnd) && state.delayed_ms.take().is_some() {
                        if let Ok(memory) = Memory::text(TEXT) {
                            let _ = memory.transfer(UNICODE);
                        }
                    }
                }
                return LRESULT(0);
            }
        }
        DefWindowProcW(hwnd, message, wparam, lparam)
    }
    struct Window {
        hwnd: HWND,
        class: Vec<u16>,
        state: Box<WindowState>,
    }
    impl Window {
        fn new(run_id: &str) -> Result<Self> {
            let class: Vec<_> = format!("Copicu.N1.{}", std::process::id())
                .encode_utf16()
                .chain([0])
                .collect();
            let marker_name: Vec<_> = "Copicu.N1.marker.v1".encode_utf16().chain([0]).collect();
            let marker_format = unsafe { RegisterClipboardFormatW(PCWSTR(marker_name.as_ptr())) };
            if marker_format == 0 {
                return Err("marker registration failed".into());
            }
            let mut state = Box::new(WindowState {
                marker_format,
                marker: [MARKER, run_id.as_bytes(), &std::process::id().to_le_bytes()].concat(),
                own_sequence: 0,
                observed: 0,
                own: false,
                delayed_ms: None,
            });
            let definition = WNDCLASSW {
                lpfnWndProc: Some(procedure),
                lpszClassName: PCWSTR(class.as_ptr()),
                ..Default::default()
            };
            if unsafe { RegisterClassW(&definition) } == 0 {
                return Err("owner class registration failed".into());
            }
            let created = unsafe {
                CreateWindowExW(
                    WINDOW_EX_STYLE::default(),
                    PCWSTR(class.as_ptr()),
                    PCWSTR::null(),
                    WINDOW_STYLE::default(),
                    0,
                    0,
                    0,
                    0,
                    None,
                    None,
                    None,
                    Some((&mut *state as *mut WindowState).cast::<c_void>()),
                )
            };
            let hwnd = match created {
                Ok(hwnd) => hwnd,
                Err(_) => {
                    unsafe {
                        let _ = UnregisterClassW(PCWSTR(class.as_ptr()), None);
                    }
                    return Err("hidden owner creation failed".into());
                }
            };
            let window = Self { hwnd, class, state };
            unsafe { AddClipboardFormatListener(hwnd) }.map_err(|_| "native observer failed")?;
            Ok(window)
        }
        fn pump(&self) {
            let mut message = MSG::default();
            unsafe {
                while PeekMessageW(&mut message, None, 0, 0, PM_REMOVE).as_bool() {
                    let _ = TranslateMessage(&message);
                    DispatchMessageW(&message);
                }
            }
        }
        fn seed(&mut self, alternative: bool, delayed: Option<u64>) -> Result<u32> {
            let text = Memory::text(if alternative { OTHER_TEXT } else { TEXT })?;
            let open = Open::acquire(self.hwnd)?;
            unsafe { EmptyClipboard() }.map_err(|_| "seed failed")?;
            if !owner_is(self.hwnd) {
                return Err("seed owner invalid".into());
            }
            if let Some(ms) = delayed {
                self.state.delayed_ms = Some(ms);
                // Successful delayed registration returns NULL in Win32; the windows
                // wrapper consequently reports Err. Confirm availability instead.
                unsafe {
                    let _ = SetClipboardData(UNICODE, None);
                }
                if unsafe { IsClipboardFormatAvailable(UNICODE) }.is_err() {
                    return Err("delayed format not registered".into());
                }
            } else {
                text.transfer(UNICODE)?;
            }
            drop(open);
            let current = sequence();
            if current == 0 || !owner_is(self.hwnd) {
                return Err("seed correlation unavailable".into());
            }
            Ok(current)
        }
        fn write(
            &mut self,
            gate: &mut EffectGate,
            publication: u64,
            expected: u32,
            fault: &str,
            delay_ms: u64,
        ) -> Result<(Outcome, u32)> {
            let text = Memory::text(TEXT)?;
            let marker = Memory::new(&self.state.marker)?;
            let effect = gate
                .prepare(
                    Publication {
                        sequence: publication,
                        delivery: Delivery::Live,
                        self_origin: false,
                        expired: false,
                    },
                    SnapshotFence::new(expected).map_err(|_| "unavailable")?,
                )
                .map_err(|_| "denied")?;
            let attempt = gate.claim(effect).map_err(|_| "claim denied")?;
            let open = match Open::acquire_with(self.hwnd, || reply("open-busy")) {
                Ok(open) => open,
                Err(_) => {
                    // No native mutation started; finish the model's begun attempt as failed.
                    gate.begin_write(attempt, expected, false)
                        .map_err(|_| "denied")?;
                    gate.finish(attempt, Outcome::Failed)
                        .map_err(|_| "model finish failed")?;
                    return Ok((Outcome::Failed, 0));
                }
            };
            // One serial actor owns this final check through mutation and outcome.
            if gate.begin_write(attempt, sequence(), false).is_err() {
                return Err("local-change-or-paused".into());
            }
            reply("guard-passed");
            if delay_ms != 0 {
                thread::sleep(Duration::from_millis(delay_ms));
            }
            let mut progress = WriteProgress::default();
            let operation = (|| -> Result<()> {
                if fault == "before-empty" {
                    return Err("injected pre-mutation failure".into());
                }
                // Failure of EmptyClipboard itself is conservative: mutation was attempted.
                progress.mutation_started = true;
                unsafe { EmptyClipboard() }.map_err(|_| "empty failed")?;
                if !owner_is(self.hwnd) || fault == "after-empty" {
                    return Err("partial empty".into());
                }
                text.transfer(UNICODE)?;
                progress.text_set = true;
                if fault == "exit-after-text" {
                    std::process::exit(74);
                }
                if fault == "after-text" {
                    return Err("partial text".into());
                }
                marker.transfer(self.state.marker_format)?;
                progress.marker_set = true;
                // Closing a write can finalize native formats/sequence. Establish
                // attribution under a new guard rather than guessing an increment
                // or accepting a sequence sampled before CloseClipboard.
                drop(open);
                let correlation_guard = Open::acquire(self.hwnd)?;
                let current = sequence();
                if current == 0 || !owner_is(self.hwnd) {
                    return Err("uncorrelated write".into());
                }
                let observed_marker = bytes(self.state.marker_format)?;
                if !correlates(
                    current,
                    sequence(),
                    &self.state.marker,
                    observed_marker
                        .get(..self.state.marker.len())
                        .unwrap_or(&[]),
                ) || !owner_is(self.hwnd)
                {
                    return Err("uncorrelated marker".into());
                }
                // The sole writer owns this HWND; foreign writes lose owner
                // equality even if they copy our public marker. No pump before this.
                self.state.own_sequence = current;
                drop(correlation_guard);
                progress.correlated = sequence() == current && owner_is(self.hwnd);
                Ok(())
            })();
            let outcome = if operation.is_ok() {
                progress.outcome()
            } else {
                progress.failure()
            };
            gate.finish(attempt, outcome)
                .map_err(|_| "model finish failed")?;
            Ok((outcome, self.state.own_sequence))
        }
        fn snapshot(&self, expected: u32, owner: HWND, alternative: bool) -> &'static str {
            let fence = match SnapshotFence::new(expected) {
                Ok(fence) => fence,
                Err(_) => return "unavailable",
            };
            let _open = match Open::acquire(self.hwnd) {
                Ok(open) => open,
                Err(_) => return "busy",
            };
            let before = sequence();
            if !owner_is(owner) {
                return "wrong-owner";
            }
            if fence.validate_read(before, before).is_err() {
                return "stale";
            }
            let bytes = match bytes(UNICODE) {
                Ok(bytes) => bytes,
                Err(_) => return "unavailable",
            };
            if fence.validate_read(before, sequence()).is_err() || !owner_is(owner) {
                return "stale";
            }
            if bytes.len() % 2 != 0 {
                return "invalid";
            }
            let units: Vec<_> = bytes
                .chunks_exact(2)
                .map(|b| u16::from_le_bytes([b[0], b[1]]))
                .collect();
            let Some(end) = units.iter().position(|u| *u == 0) else {
                return "invalid";
            };
            match String::from_utf16(&units[..end]) {
                Ok(text) if text == if alternative { OTHER_TEXT } else { TEXT } => "coherent",
                _ => "mismatch",
            }
        }
    }
    impl Drop for Window {
        fn drop(&mut self) {
            unsafe {
                let _ = RemoveClipboardFormatListener(self.hwnd);
                let _ = DestroyWindow(self.hwnd);
                let _ = UnregisterClassW(PCWSTR(self.class.as_ptr()), None);
            }
        }
    }

    fn parse_number<T: std::str::FromStr>(value: &str) -> Result<T> {
        value
            .parse()
            .map_err(|_| "invalid public numeric fixture".into())
    }
    pub(in crate::n1) fn helper(role: &str, run_id: &str) -> Result<()> {
        let mut window = Window::new(run_id)?;
        let foreground = unsafe { GetForegroundWindow() };
        let (sender, commands) = mpsc::channel();
        thread::spawn(move || {
            for line in io::stdin().lock().lines() {
                match line {
                    Ok(line) if line.len() <= 1024 => {
                        if sender.send(line).is_err() {
                            break;
                        }
                    }
                    _ => break,
                }
            }
        });
        reply("ready");
        let mut hold = None;
        let mut gate = EffectGate::new(1, 0, true);
        let mut publication = 0;
        loop {
            window.pump();
            match commands.try_recv() {
                Ok(line) => {
                    let parts: Vec<_> = line.split_whitespace().collect();
                    match parts.as_slice() {
                        ["quit"] => {
                            drop(hold);
                            return Ok(());
                        }
                        ["seed"] | ["copy"] | ["other"] if role == "producer" => {
                            let current = window.seed(parts[0] == "other", None)?;
                            reply(&format!("seed {current} {}", window.hwnd.0 as usize));
                        }
                        ["delay", ms] if role == "producer" => {
                            let ms: u64 = parse_number(ms)?;
                            if ms > 2000 {
                                return Err("delay exceeds fixture budget".into());
                            }
                            let current = window.seed(false, Some(ms))?;
                            reply(&format!("seed {current} {}", window.hwnd.0 as usize));
                        }
                        ["hold"] if role == "producer" && hold.is_none() => {
                            hold = Some(Open::acquire(window.hwnd)?);
                            reply("held");
                        }
                        ["release"] if role == "producer" => {
                            drop(hold.take());
                            reply("released");
                        }
                        ["read", expected, owner, kind]
                            if role == "reader" || role == "producer" =>
                        {
                            let expected = parse_number(expected)?;
                            let owner: usize = parse_number(owner)?;
                            reply(window.snapshot(
                                expected,
                                HWND(owner as *mut c_void),
                                *kind == "other",
                            ));
                        }
                        ["write", expected, fault, delay] if role == "writer" => {
                            if !matches!(
                                *fault,
                                "none"
                                    | "before-empty"
                                    | "after-empty"
                                    | "after-text"
                                    | "exit-after-text"
                            ) {
                                return Err("unknown fault fixture".into());
                            }
                            let delay: u64 = parse_number(delay)?;
                            if delay > 500 {
                                return Err("write delay too large".into());
                            }
                            publication += 1;
                            match window.write(
                                &mut gate,
                                publication,
                                parse_number(expected)?,
                                fault,
                                delay,
                            ) {
                                Ok((outcome, seq)) => reply(&format!("outcome {outcome:?} {seq}")),
                                Err(_) => reply("denied"),
                            }
                        }
                        ["pause"] if role == "writer" => {
                            reply(if gate.pause().barrier == PauseBarrier::Acknowledged {
                                "paused"
                            } else {
                                "pause-pending"
                            });
                        }
                        ["resume"] if role == "writer" => {
                            gate.resume(publication).map_err(|_| "resume denied")?;
                            reply("resumed-no-write");
                        }
                        ["observe", expected] if role == "writer" => {
                            let expected: u32 = parse_number(expected)?;
                            let start = Instant::now();
                            while window.state.observed != expected
                                && start.elapsed() < Duration::from_millis(200)
                            {
                                window.pump();
                                thread::sleep(Duration::from_millis(2));
                            }
                            reply(if window.state.observed != expected {
                                "observer-unavailable"
                            } else if window.state.own {
                                "observer-own"
                            } else {
                                "observer-external"
                            });
                        }
                        ["foreground"] => {
                            reply(if unsafe { GetForegroundWindow() } == foreground {
                                "foreground-stable"
                            } else {
                                "foreground-changed"
                            })
                        }
                        _ => return Err("invalid clipboard helper command".into()),
                    }
                }
                Err(mpsc::TryRecvError::Empty) => thread::sleep(Duration::from_millis(2)),
                Err(mpsc::TryRecvError::Disconnected) => {
                    drop(hold);
                    return Ok(());
                }
            }
        }
    }

    fn seed(run: &mut Supervisor, producer: usize, command: &str) -> Result<(u32, usize)> {
        run.send(producer, command)?;
        let response = run.receive(producer)?;
        let parts: Vec<_> = response.split_whitespace().collect();
        match parts.as_slice() {
            ["seed", seq, owner] => Ok((parse_number(seq)?, parse_number(owner)?)),
            _ => Err("seed handshake failed".into()),
        }
    }
    fn start_pair(
        request: &Request,
        role: &str,
        start: Instant,
    ) -> Result<(Supervisor, usize, usize)> {
        let mut run = Supervisor::new(request, start)?;
        let producer = run.spawn("producer")?;
        run.expect(producer, "ready")?;
        let executor = run.spawn(role)?;
        run.expect(executor, "ready")?;
        Ok((run, producer, executor))
    }
    fn written(run: &Supervisor, writer: usize, outcome: Outcome) -> Result<u32> {
        run.expect(writer, "guard-passed")?;
        outcome_response(run, writer, outcome)
    }
    fn outcome_response(run: &Supervisor, writer: usize, outcome: Outcome) -> Result<u32> {
        let response = run.receive(writer)?;
        let parts: Vec<_> = response.split_whitespace().collect();
        match parts.as_slice() {
            ["outcome", observed, seq] if *observed == format!("{outcome:?}") => parse_number(seq),
            _ => Err(format!(
                "write outcome mismatch: expected {outcome:?}; received {response}"
            )),
        }
    }
    pub(in crate::n1) fn matrix(request: &Request) -> Result<()> {
        let start = Instant::now();
        // Native acceptance remains opt-in. No reading/saving of the initial clipboard.
        {
            let (mut run, producer, reader) = start_pair(request, "reader", start)?;
            let (seq, owner) = seed(&mut run, producer, "seed")?;
            run.send(reader, &format!("read {seq} {owner} normal"))?;
            run.expect(reader, "coherent")?;
            run.send(reader, "foreground")?;
            run.expect(reader, "foreground-stable")?;
            run.finish()?;
            println!("PASS clipboard-owner-unicode-snapshot");
        }
        {
            let (mut run, producer, writer) = start_pair(request, "writer", start)?;
            let (seq, _) = seed(&mut run, producer, "seed")?;
            run.send(writer, &format!("write {seq} none 0"))?;
            let own = written(&run, writer, Outcome::Applied)?;
            run.send(writer, &format!("observe {own}"))?;
            run.expect(writer, "observer-own")?;
            let (external, _) = seed(&mut run, producer, "copy")?;
            if external == own {
                return Err("recopy did not establish a new sequence".into());
            }
            run.send(writer, &format!("observe {external}"))?;
            run.expect(writer, "observer-external")?;
            run.send(writer, "foreground")?;
            run.expect(writer, "foreground-stable")?;
            run.finish()?;
            println!("PASS clipboard-marker-and-identical-recopy");
        }
        {
            let (mut run, producer, writer) = start_pair(request, "writer", start)?;
            let (seq, _) = seed(&mut run, producer, "seed")?;
            run.send(producer, "hold")?;
            run.expect(producer, "held")?;
            run.send(writer, &format!("write {seq} none 0"))?;
            run.expect(writer, "open-busy")?;
            outcome_response(&run, writer, Outcome::Failed)?;
            // Second attempt: release only after the initial failed open checkpoint.
            run.send(writer, &format!("write {seq} none 0"))?;
            run.expect(writer, "open-busy")?;
            run.send(producer, "release")?;
            run.expect(producer, "released")?;
            written(&run, writer, Outcome::Applied)?;
            run.finish()?;
            println!("PASS clipboard-busy-bounded-and-released");
        }
        {
            let (mut run, producer, writer) = start_pair(request, "writer", start)?;
            let (seq, _) = seed(&mut run, producer, "seed")?;
            let (external, owner) = seed(&mut run, producer, "other")?;
            run.send(writer, &format!("write {seq} none 0"))?;
            run.expect(writer, "denied")?;
            run.send(producer, &format!("read {external} {owner} other"))?;
            run.expect(producer, "coherent")?;
            run.finish()?;
            println!("PASS clipboard-final-guard-local-recopy");
        }
        {
            let (mut run, producer, writer) = start_pair(request, "writer", start)?;
            let (seq, _) = seed(&mut run, producer, "seed")?;
            run.send(writer, "pause")?;
            run.expect(writer, "paused")?;
            run.send(writer, &format!("write {seq} none 0"))?;
            run.expect(writer, "denied")?;
            run.send(writer, "resume")?;
            run.expect(writer, "resumed-no-write")?;
            run.send(writer, &format!("write {seq} none 250"))?;
            run.expect(writer, "guard-passed")?;
            run.send(writer, "pause")?;
            outcome_response(&run, writer, Outcome::Applied)?;
            run.expect(writer, "paused")?;
            run.send(writer, &format!("write {seq} none 0"))?;
            run.expect(writer, "denied")?;
            run.finish()?;
            println!("PASS clipboard-pause-before-and-during-write");
        }
        for (fault, outcome) in [
            ("before-empty", Outcome::Failed),
            ("after-empty", Outcome::Uncertain),
            ("after-text", Outcome::Uncertain),
        ] {
            let (mut run, producer, writer) = start_pair(request, "writer", start)?;
            let (seq, _) = seed(&mut run, producer, "seed")?;
            run.send(writer, &format!("write {seq} {fault} 0"))?;
            written(&run, writer, outcome)?;
            let (external, owner) = seed(&mut run, producer, "other")?;
            run.send(producer, &format!("read {external} {owner} other"))?;
            run.expect(producer, "coherent")?;
            run.finish()?;
            println!("PASS clipboard-{fault}-no-restore");
        }
        {
            let (mut run, producer, reader) = start_pair(request, "reader", start)?;
            let (seq, owner) = seed(&mut run, producer, "delay 10")?;
            run.send(reader, &format!("read {seq} {owner} normal"))?;
            let result = run.receive(reader)?;
            if !matches!(result.as_str(), "coherent" | "stale") {
                return Err("unexpected delayed rendering result".into());
            }
            run.finish()?;
            println!("PASS clipboard-delayed-fence");
        }
        {
            let (mut run, producer, reader) = start_pair(request, "reader", start)?;
            let (seq, owner) = seed(&mut run, producer, "delay 1500")?;
            run.send(reader, &format!("read {seq} {owner} normal"))?;
            if run.receive(reader).is_ok() {
                return Err("blocked reader returned before watchdog".into());
            }
            // Timeout is not settlement. Terminate this run's Job and check each handle.
            run.terminate_confirmed()?;
            println!("PASS clipboard-delayed-timeout-confirmed-exit-no-replay");
        }
        {
            let (mut run, producer, writer) = start_pair(request, "writer", start)?;
            let (seq, _) = seed(&mut run, producer, "seed")?;
            run.send(writer, &format!("write {seq} exit-after-text 0"))?;
            run.expect(writer, "guard-passed")?;
            if run.receive(writer).is_ok() {
                return Err("crash fixture unexpectedly returned outcome".into());
            }
            run.signal_exit(writer)?;
            let (external, owner) = seed(&mut run, producer, "other")?;
            run.send(producer, &format!("read {external} {owner} other"))?;
            run.expect(producer, "coherent")?;
            run.finish()?;
            println!("PASS clipboard-crash-uncertain-confirmed-exit-no-replay");
        }
        if start.elapsed() >= Duration::from_secs(30) {
            return Err("clipboard matrix exceeded budget".into());
        }
        println!(
            "N1 Clipboard: 11 cases passed; helpers exited; no product watcher/hotkey/two-PC proof"
        );
        Ok(())
    }
}
