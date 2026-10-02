//! Bounded native clipboard operations for Sharing, isolated from the UI process.
//! IPC carries synthetic/private text only over owned anonymous pipes, never logs.
use serde::{Deserialize, Serialize};
use std::sync::{Mutex, OnceLock};

pub(crate) static EFFECT_BARRIER: Mutex<()> = Mutex::new(());
static REMOTE_WRITES: OnceLock<Mutex<Vec<(u32, String, String)>>> = OnceLock::new();
static OWNER_WINDOW: std::sync::atomic::AtomicIsize = std::sync::atomic::AtomicIsize::new(0);
pub(crate) fn set_owner_window(owner: isize) {
    OWNER_WINDOW.store(owner, std::sync::atomic::Ordering::Release);
}

#[derive(Serialize, Deserialize)]
struct NativeRequest {
    expected_sequence: u32,
    text: Option<String>,
    marker: Option<String>,
    deadline_unix_ms: Option<u64>,
    deadline_tick_ms: Option<u64>,
    #[serde(default)]
    probe_marker: bool,
    owner_window: Option<isize>,
}
#[derive(Serialize, Deserialize)]
struct NativeReply {
    outcome: String,
    sequence: u32,
    text: Option<String>,
}

pub(crate) fn sequence() -> Option<u32> {
    #[cfg(windows)]
    {
        Some(unsafe { windows::Win32::System::DataExchange::GetClipboardSequenceNumber() })
    }
    #[cfg(not(windows))]
    {
        None
    }
}

pub(crate) fn snapshot(expected_sequence: u32) -> Result<String, String> {
    let reply = operation(NativeRequest {
        expected_sequence,
        text: None,
        marker: None,
        deadline_unix_ms: None,
        deadline_tick_ms: None,
        probe_marker: false,
        owner_window: None,
    })?;
    if reply.outcome != "applied" {
        return Err(reply.outcome);
    }
    reply.text.ok_or_else(|| "clipboardUnavailable".into())
}

pub(crate) fn write(text: &str, expected_sequence: u32) -> String {
    write_before(text, expected_sequence, None, None)
}

pub(crate) fn write_before(
    text: &str,
    expected_sequence: u32,
    deadline_unix_ms: Option<u64>,
    remaining_ms: Option<u64>,
) -> String {
    let ledger = REMOTE_WRITES.get_or_init(|| Mutex::new(Vec::new()));
    let Ok(mut ledger) = ledger.lock() else {
        return "failed".into();
    };
    use crate::shared_clipboard::crypto::Entropy;
    let mut nonce = [0u8; 16];
    if crate::shared_clipboard::crypto::SystemEntropy
        .fill(&mut nonce)
        .is_err()
    {
        return "failed".into();
    }
    let marker: String = nonce.iter().map(|b| format!("{b:02x}")).collect();
    ledger.push((
        0,
        crate::storage::hash_text(&crate::storage::normalize_text_for_storage(text)),
        marker.clone(),
    ));
    if ledger.len() > 8 {
        ledger.remove(0);
    }
    let reply = operation(NativeRequest {
        expected_sequence,
        text: Some(text.into()),
        marker: Some(marker),
        deadline_unix_ms,
        deadline_tick_ms: remaining_ms.map(|remaining| ticks().saturating_add(remaining)),
        probe_marker: false,
        owner_window: Some(OWNER_WINDOW.load(std::sync::atomic::Ordering::Acquire))
            .filter(|owner| *owner != 0),
    });
    match reply {
        Ok(reply) => {
            if reply.outcome == "applied" {
                if let Some(entry) = ledger.last_mut() {
                    entry.0 = reply.sequence;
                }
            }
            reply.outcome
        }
        Err(_) => "uncertain".into(),
    }
}

/// Correlate sequence and normalized content, without hash-only echo suppression.
/// An external recopy has a new sequence and remains an ordinary local capture.
pub(crate) fn is_remote_write(hash: &str) -> bool {
    let Some(ledger) = REMOTE_WRITES.get() else {
        return false;
    };
    let Ok(ledger) = ledger.lock() else {
        return true;
    };
    let Some(current) = sequence() else {
        return false;
    };
    if ledger
        .iter()
        .any(|(written, expected, _)| *written == current && expected == hash)
    {
        return true;
    }
    #[cfg(windows)]
    {
        let owner = OWNER_WINDOW.load(std::sync::atomic::Ordering::Acquire);
        if owner == 0
            || unsafe { windows::Win32::System::DataExchange::GetClipboardOwner() }
                .ok()
                .is_none_or(|current| current.0 as isize != owner)
        {
            return false;
        }
        marker_matches(current, hash, &ledger)
    }
    #[cfg(not(windows))]
    {
        false
    }
}

#[cfg(windows)]
fn marker_matches(current: u32, hash: &str, ledger: &[(u32, String, String)]) -> bool {
    // Even a registered private format can be supplied with hostile delayed
    // rendering. Its data is probed only by the bounded child process.
    if !ledger.iter().any(|(_, expected, _)| expected == hash) {
        return false;
    }
    let reply = operation(NativeRequest {
        expected_sequence: current,
        text: None,
        marker: None,
        deadline_unix_ms: None,
        deadline_tick_ms: None,
        probe_marker: true,
        owner_window: None,
    });
    reply.is_ok_and(|reply| {
        reply.outcome == "applied"
            && reply.sequence == current
            && reply.text.is_some_and(|marker| {
                ledger
                    .iter()
                    .any(|(_, expected, token)| expected == hash && *token == marker)
            })
    }) && sequence() == Some(current)
}

fn ticks() -> u64 {
    #[cfg(windows)]
    {
        #[link(name = "kernel32")]
        unsafe extern "system" {
            fn GetTickCount64() -> u64;
        }
        unsafe { GetTickCount64() }
    }
    #[cfg(not(windows))]
    {
        0
    }
}

fn operation(request: NativeRequest) -> Result<NativeReply, String> {
    #[cfg(windows)]
    use std::os::windows::process::CommandExt;
    use std::{
        io::{Read, Write},
        process::{Command, Stdio},
        time::{Duration, Instant},
    };
    if request.expected_sequence == 0 {
        return Err("clipboardUnavailable".into());
    }
    let mut command = Command::new(std::env::current_exe().map_err(|_| "nativeUnavailable")?);
    command
        .arg("--copicu-shared-native")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    #[cfg(windows)]
    command.creation_flags(0x08000000);
    let mut child = command.spawn().map_err(|_| "nativeUnavailable")?;
    #[cfg(windows)]
    let _job = match OwnedJob::attach(&child) {
        Ok(job) => job,
        Err(_) => {
            let _ = child.kill();
            let _ = child.wait();
            return Err("nativeUnavailable".into());
        }
    };
    // The child drains concurrently; one request is bounded to 1 MiB UTF-8.
    let mut input = child.stdin.take().ok_or("nativeUnavailable")?;
    let encoded = serde_json::to_vec(&request).map_err(|_| "nativeUnavailable")?;
    let writer = std::thread::spawn(move || {
        let result = input.write_all(&encoded);
        drop(input);
        result
    });
    let output = child.stdout.take().ok_or("nativeUnavailable")?;
    let reader = std::thread::spawn(move || {
        let mut bytes = Vec::new();
        let result = output.take(6 * 1024 * 1024 + 1).read_to_end(&mut bytes);
        (result, bytes)
    });
    let deadline = Instant::now() + Duration::from_secs(2);
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break Some(status),
            Ok(None) if Instant::now() < deadline => std::thread::sleep(Duration::from_millis(10)),
            _ => {
                #[cfg(windows)]
                unsafe {
                    let _ = windows::Win32::System::JobObjects::TerminateJobObject(_job.0, 74);
                }
                let _ = child.kill();
                let _ = child.wait();
                break None;
            }
        }
    };
    let write_result = writer.join().map_err(|_| "nativeUnavailable")?;
    let (read_result, bytes) = reader.join().map_err(|_| "nativeUnavailable")?;
    if status.is_none() {
        return Err("clipboardTimeout".into());
    }
    if !status.is_some_and(|s| s.success())
        || write_result.is_err()
        || read_result.is_err()
        || bytes.len() > 6 * 1024 * 1024
    {
        return Err("nativeUnavailable".into());
    }
    serde_json::from_slice(&bytes).map_err(|_| "nativeUnavailable".into())
}

#[cfg(windows)]
struct OwnedJob(windows::Win32::Foundation::HANDLE);
#[cfg(windows)]
impl OwnedJob {
    fn attach(child: &std::process::Child) -> Result<Self, String> {
        use std::os::windows::io::AsRawHandle;
        use windows::{
            core::PCWSTR,
            Win32::{Foundation::HANDLE, System::JobObjects::*},
        };
        let handle =
            unsafe { CreateJobObjectW(None, PCWSTR::null()) }.map_err(|_| "nativeUnavailable")?;
        let job = Self(handle);
        let mut limits = JOBOBJECT_EXTENDED_LIMIT_INFORMATION::default();
        limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        unsafe {
            SetInformationJobObject(
                handle,
                JobObjectExtendedLimitInformation,
                (&limits as *const JOBOBJECT_EXTENDED_LIMIT_INFORMATION).cast(),
                std::mem::size_of_val(&limits) as u32,
            )
            .map_err(|_| "nativeUnavailable")?;
            AssignProcessToJobObject(handle, HANDLE(child.as_raw_handle()))
                .map_err(|_| "nativeUnavailable")?;
        }
        Ok(job)
    }
}
#[cfg(windows)]
impl Drop for OwnedJob {
    fn drop(&mut self) {
        unsafe {
            let _ = windows::Win32::Foundation::CloseHandle(self.0);
        }
    }
}

/// Called before Tauri/profile/startup initialization by the binary.
pub fn helper_if_requested() -> bool {
    if std::env::args().nth(1).as_deref() != Some("--copicu-shared-native") {
        return false;
    }
    use std::io::{Read, Write};
    let mut bytes = Vec::new();
    let reply = if std::io::stdin()
        .take(6 * 1024 * 1024 + 1)
        .read_to_end(&mut bytes)
        .is_ok()
    {
        match serde_json::from_slice::<NativeRequest>(&bytes) {
            Ok(request) => native_operation(request),
            Err(_) => NativeReply {
                outcome: "failed".into(),
                sequence: 0,
                text: None,
            },
        }
    } else {
        NativeReply {
            outcome: "failed".into(),
            sequence: 0,
            text: None,
        }
    };
    if let Ok(encoded) = serde_json::to_vec(&reply) {
        let _ = std::io::stdout().write_all(&encoded);
    }
    true
}

#[cfg(not(windows))]
fn native_operation(_: NativeRequest) -> NativeReply {
    NativeReply {
        outcome: "failed".into(),
        sequence: 0,
        text: None,
    }
}

#[cfg(windows)]
fn native_operation(request: NativeRequest) -> NativeReply {
    use windows::{
        core::w,
        Win32::{
            Foundation::{GlobalFree, HGLOBAL},
            System::{DataExchange::*, Memory::*},
            UI::WindowsAndMessaging::*,
        },
    };
    let mut reply = NativeReply {
        outcome: "failed".into(),
        sequence: 0,
        text: None,
    };
    if request.expected_sequence == 0 || sequence() != Some(request.expected_sequence) {
        reply.outcome = "clipboardStale".into();
        return reply;
    }
    // A locked/non-interactive desktop cannot acquire the input desktop.
    if !unlocked() {
        reply.outcome = "sessionLocked".into();
        return reply;
    }
    let window = unsafe {
        CreateWindowExW(
            WINDOW_EX_STYLE(0),
            w!("STATIC"),
            w!("Copicu shared clipboard"),
            WINDOW_STYLE(0),
            0,
            0,
            0,
            0,
            Some(HWND_MESSAGE),
            None,
            None,
            None,
        )
    };
    let Ok(window) = window else {
        return reply;
    };
    struct Window(windows::Win32::Foundation::HWND);
    impl Drop for Window {
        fn drop(&mut self) {
            unsafe {
                let _ = DestroyWindow(self.0);
            }
        }
    }
    let _window = Window(window);
    let owner = request
        .owner_window
        .map(|value| windows::Win32::Foundation::HWND(value as *mut std::ffi::c_void))
        .unwrap_or(window);
    let opened = (0..5).any(|_| {
        if unsafe { OpenClipboard(Some(owner)) }.is_ok() {
            true
        } else {
            std::thread::sleep(std::time::Duration::from_millis(20));
            false
        }
    });
    if !opened {
        reply.outcome = "clipboardBusy".into();
        return reply;
    }
    struct Open;
    impl Drop for Open {
        fn drop(&mut self) {
            unsafe {
                let _ = CloseClipboard();
            }
        }
    }
    let guard = Open;
    if sequence() != Some(request.expected_sequence) {
        reply.outcome = "clipboardStale".into();
        return reply;
    }
    if request.probe_marker {
        let format = unsafe { RegisterClipboardFormatW(w!("Copicu.Shared.Provenance.v1")) };
        if format == 0 || unsafe { IsClipboardFormatAvailable(format) }.is_err() {
            return reply;
        }
        let Ok(handle) = (unsafe { GetClipboardData(format) }) else {
            return reply;
        };
        let memory = HGLOBAL(handle.0);
        if unsafe { GlobalSize(memory) } != 32 {
            return reply;
        }
        let ptr = unsafe { GlobalLock(memory) };
        if ptr.is_null() {
            return reply;
        }
        let marker =
            String::from_utf8(unsafe { std::slice::from_raw_parts(ptr.cast::<u8>(), 32) }.to_vec())
                .ok();
        unsafe {
            let _ = GlobalUnlock(memory);
        }
        drop(guard);
        if sequence() == Some(request.expected_sequence) {
            reply.outcome = "applied".into();
            reply.sequence = request.expected_sequence;
            reply.text = marker;
        }
        return reply;
    }
    if let Some(text) = request.text {
        if text.is_empty() || text.len() > 1024 * 1024 || text.contains('\0') {
            return reply;
        }
        let units: Vec<u16> = text.encode_utf16().chain(Some(0)).collect();
        let Ok(memory) = (unsafe { GlobalAlloc(GMEM_MOVEABLE, units.len() * 2) }) else {
            return reply;
        };
        let ptr = unsafe { GlobalLock(memory) };
        if ptr.is_null() {
            unsafe {
                let _ = GlobalFree(Some(memory));
            }
            return reply;
        }
        unsafe {
            std::ptr::copy_nonoverlapping(units.as_ptr(), ptr.cast::<u16>(), units.len());
            let _ = GlobalUnlock(memory);
        }
        let Some(marker) = request
            .marker
            .filter(|value| value.len() == 32 && value.bytes().all(|b| b.is_ascii_hexdigit()))
        else {
            unsafe {
                let _ = GlobalFree(Some(memory));
            }
            return reply;
        };
        let format = unsafe { RegisterClipboardFormatW(w!("Copicu.Shared.Provenance.v1")) };
        if format == 0 {
            unsafe {
                let _ = GlobalFree(Some(memory));
            }
            return reply;
        }
        let Ok(marker_memory) = (unsafe { GlobalAlloc(GMEM_MOVEABLE, 32) }) else {
            unsafe {
                let _ = GlobalFree(Some(memory));
            }
            return reply;
        };
        let marker_ptr = unsafe { GlobalLock(marker_memory) };
        if marker_ptr.is_null() {
            unsafe {
                let _ = GlobalFree(Some(marker_memory));
                let _ = GlobalFree(Some(memory));
            }
            return reply;
        }
        unsafe {
            std::ptr::copy_nonoverlapping(marker.as_ptr(), marker_ptr.cast::<u8>(), 32);
            let _ = GlobalUnlock(marker_memory);
        }
        let expired = request.deadline_unix_ms.is_some_and(|deadline| {
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map_or(true, |now| now.as_millis() >= u128::from(deadline))
        });
        if expired
            || request
                .deadline_tick_ms
                .is_some_and(|deadline| ticks() >= deadline)
            || !unlocked()
            || sequence() != Some(request.expected_sequence)
        {
            unsafe {
                let _ = GlobalFree(Some(memory));
                let _ = GlobalFree(Some(marker_memory));
            }
            reply.outcome = "clipboardStale".into();
            return reply;
        }
        if unsafe { EmptyClipboard() }.is_err() {
            unsafe {
                let _ = GlobalFree(Some(memory));
                let _ = GlobalFree(Some(marker_memory));
            }
            return reply;
        }
        reply.outcome = "uncertain".into();
        if unsafe {
            SetClipboardData(
                format,
                Some(windows::Win32::Foundation::HANDLE(marker_memory.0)),
            )
        }
        .is_err()
        {
            unsafe {
                let _ = GlobalFree(Some(memory));
                let _ = GlobalFree(Some(marker_memory));
            }
            return reply;
        }
        if unsafe { SetClipboardData(13, Some(windows::Win32::Foundation::HANDLE(memory.0))) }
            .is_err()
        {
            unsafe {
                let _ = GlobalFree(Some(memory));
            }
            return reply;
        }
        drop(guard);
        reply.sequence = sequence().unwrap_or(0);
        if reply.sequence != 0 && unsafe { GetClipboardOwner() }.ok() == Some(owner) {
            reply.outcome = "applied".into();
        }
    } else {
        if unsafe { IsClipboardFormatAvailable(13) }.is_err() {
            reply.outcome = "unsupportedFormat".into();
            return reply;
        }
        let Ok(handle) = (unsafe { GetClipboardData(13) }) else {
            return reply;
        };
        let memory = HGLOBAL(handle.0);
        let size = unsafe { GlobalSize(memory) };
        if size < 2 || size % 2 != 0 || size > 2 * 1024 * 1024 + 2 {
            reply.outcome = "payloadLimit".into();
            return reply;
        }
        let ptr = unsafe { GlobalLock(memory) };
        if ptr.is_null() {
            return reply;
        }
        let units = unsafe { std::slice::from_raw_parts(ptr.cast::<u16>(), size / 2) };
        let text = units
            .iter()
            .position(|u| *u == 0)
            .and_then(|end| String::from_utf16(&units[..end]).ok());
        unsafe {
            let _ = GlobalUnlock(memory);
        }
        drop(guard);
        if sequence() != Some(request.expected_sequence) {
            reply.outcome = "clipboardStale".into();
            return reply;
        }
        if let Some(text) = text {
            if text.is_empty() || text.len() > 1024 * 1024 {
                reply.outcome = "payloadLimit".into();
                return reply;
            }
            reply.outcome = "applied".into();
            reply.sequence = request.expected_sequence;
            reply.text = Some(text);
        }
    }
    reply
}

#[cfg(windows)]
fn unlocked() -> bool {
    // These stable user32 APIs avoid changing the dependency graph.
    #[link(name = "user32")]
    unsafe extern "system" {
        fn OpenInputDesktop(flags: u32, inherit: i32, access: u32) -> isize;
        fn GetUserObjectInformationW(
            handle: isize,
            index: i32,
            buffer: *mut std::ffi::c_void,
            len: u32,
            needed: *mut u32,
        ) -> i32;
        fn CloseDesktop(desktop: isize) -> i32;
    }
    unsafe {
        let desktop = OpenInputDesktop(0, 0, 1);
        if desktop == 0 {
            return false;
        }
        let mut name = [0u16; 64];
        let mut needed = 0;
        let ok =
            GetUserObjectInformationW(desktop, 2, name.as_mut_ptr().cast(), 128, &mut needed) != 0;
        let _ = CloseDesktop(desktop);
        ok && String::from_utf16_lossy(&name[..name.iter().position(|u| *u == 0).unwrap_or(64)])
            .eq_ignore_ascii_case("default")
    }
}
