use crate::host::PasteShortcut;
use std::{
    sync::{Arc, Mutex},
    thread,
    time::Duration,
};

#[derive(Clone, Default)]
pub struct PreviousWindow {
    hwnd: Arc<Mutex<Option<NativeWindowId>>>,
    own_windows: Arc<Mutex<Vec<NativeWindowId>>>,
}

type NativeWindowId = isize;
const FOREGROUND_TRACK_INTERVAL: Duration = Duration::from_millis(250);

impl PreviousWindow {
    #[cfg(not(test))]
    pub fn register_own_window<R: tauri::Runtime>(
        &self,
        own_window: &tauri::WebviewWindow<R>,
    ) -> Result<(), String> {
        let Some(own_id) = own_window_id(own_window) else {
            return Ok(());
        };
        let mut own_windows = self
            .own_windows
            .lock()
            .map_err(|_| "own windows mutex poisoned".to_string())?;
        if !own_windows.contains(&own_id) {
            own_windows.push(own_id);
        }
        Ok(())
    }

    pub fn spawn_foreground_tracker(&self) {
        let previous_window = self.clone();
        thread::Builder::new()
            .name("copicu-foreground-track".to_string())
            .spawn(move || loop {
                previous_window.remember_current_foreground();
                thread::sleep(FOREGROUND_TRACK_INTERVAL);
            })
            .expect("failed to spawn foreground tracker");
    }

    #[cfg(not(test))]
    pub fn remember_foreground_excluding<R: tauri::Runtime>(
        &self,
        own_window: Option<&tauri::WebviewWindow<R>>,
    ) -> Result<(), String> {
        let own_id = own_window.and_then(own_window_id);
        let Some(foreground_id) = platform::foreground_window_id() else {
            return Ok(());
        };

        if Some(foreground_id) == own_id || self.is_own_window(foreground_id) {
            return Ok(());
        }

        self.set_previous(foreground_id)?;
        eprintln!("previous window remembered");
        Ok(())
    }

    pub fn focus_previous(&self) -> Result<(), String> {
        let hwnd = self.current()?;
        eprintln!("previous window focus requested");
        platform::focus_window(hwnd)
    }

    pub fn send_paste_shortcut(&self, shortcut: &PasteShortcut) -> Result<(), String> {
        let hwnd = self.current()?;
        eprintln!("paste shortcut requested: {shortcut:?}");
        platform::send_paste_shortcut(hwnd, shortcut)
    }

    fn current(&self) -> Result<NativeWindowId, String> {
        self.hwnd
            .lock()
            .map_err(|_| "previous window mutex poisoned".to_string())?
            .ok_or_else(|| "previous window is not recorded".to_string())
    }

    fn remember_current_foreground(&self) {
        let Some(foreground_id) = platform::foreground_window_id() else {
            return;
        };
        if self.is_own_window(foreground_id) {
            return;
        }
        if let Err(error) = self.set_previous(foreground_id) {
            eprintln!("previous window tracker failed: {error}");
        }
    }

    fn set_previous(&self, foreground_id: NativeWindowId) -> Result<(), String> {
        let mut hwnd = self
            .hwnd
            .lock()
            .map_err(|_| "previous window mutex poisoned".to_string())?;
        if *hwnd != Some(foreground_id) {
            *hwnd = Some(foreground_id);
            if let Some(process_id) = platform::window_process_id(foreground_id) {
                eprintln!("previous window updated: pid={process_id}");
            }
        }
        Ok(())
    }

    fn is_own_window(&self, foreground_id: NativeWindowId) -> bool {
        self.own_windows
            .lock()
            .map(|own_windows| own_windows.contains(&foreground_id))
            .unwrap_or(false)
    }
}

#[cfg(target_os = "windows")]
#[cfg(not(test))]
fn own_window_id<R: tauri::Runtime>(window: &tauri::WebviewWindow<R>) -> Option<NativeWindowId> {
    window.hwnd().ok().map(|hwnd| hwnd.0 as NativeWindowId)
}

#[cfg(target_os = "windows")]
#[cfg(not(test))]
pub fn focus_tauri_window<R: tauri::Runtime>(
    window: &tauri::WebviewWindow<R>,
) -> Result<(), String> {
    let Some(window_id) = own_window_id(window) else {
        return Err("window native handle unavailable".to_string());
    };
    platform::focus_window_without_paste_delay(window_id)
}

#[cfg(not(target_os = "windows"))]
#[cfg(not(test))]
pub fn focus_tauri_window<R: tauri::Runtime>(
    window: &tauri::WebviewWindow<R>,
) -> Result<(), String> {
    window
        .set_focus()
        .map_err(|error| format!("window focus failed: {error}"))
}

#[cfg(not(target_os = "windows"))]
#[cfg(not(test))]
fn own_window_id<R: tauri::Runtime>(_window: &tauri::WebviewWindow<R>) -> Option<NativeWindowId> {
    None
}

#[cfg(target_os = "windows")]
mod platform {
    use super::NativeWindowId;
    use crate::host::PasteShortcut;
    use std::{
        mem::size_of,
        path::Path,
        thread,
        time::{Duration, Instant},
    };
    use windows::Win32::{
        Foundation::{CloseHandle, HWND},
        System::Threading::{
            OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_FORMAT,
            PROCESS_QUERY_LIMITED_INFORMATION,
        },
        UI::{
            Input::KeyboardAndMouse::{
                SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYEVENTF_KEYUP,
                VIRTUAL_KEY, VK_CONTROL, VK_INSERT, VK_SHIFT,
            },
            WindowsAndMessaging::{
                BringWindowToTop, GetForegroundWindow, GetWindowThreadProcessId, IsWindow,
                IsWindowVisible, SetForegroundWindow,
            },
        },
    };

    const FOCUS_WAIT_TIMEOUT: Duration = Duration::from_millis(700);
    const FOCUS_POLL_INTERVAL: Duration = Duration::from_millis(25);
    const PASTE_DELAY_AFTER_FOCUS: Duration = Duration::from_millis(700);

    pub fn foreground_window_id() -> Option<NativeWindowId> {
        let hwnd = unsafe { GetForegroundWindow() };
        valid_window(hwnd).then_some(hwnd.0 as NativeWindowId)
    }

    pub fn focus_window(window_id: NativeWindowId) -> Result<(), String> {
        let hwnd = hwnd_from_id(window_id);
        if !valid_window(hwnd) {
            return Err("previous window is no longer valid or visible".to_string());
        }

        if let Some(process_id) = window_process_id(window_id) {
            eprintln!("previous window focus target: pid={process_id}");
        }
        let accepted = unsafe { SetForegroundWindow(hwnd) }.as_bool();
        if !accepted {
            return Err("SetForegroundWindow was denied".to_string());
        }

        wait_until_foreground(hwnd)?;
        thread::sleep(PASTE_DELAY_AFTER_FOCUS);
        Ok(())
    }

    pub fn focus_window_without_paste_delay(window_id: NativeWindowId) -> Result<(), String> {
        let hwnd = hwnd_from_id(window_id);
        if !valid_window(hwnd) {
            return Err("window is no longer valid or visible".to_string());
        }

        let accepted = unsafe { SetForegroundWindow(hwnd) }.as_bool();
        if !accepted {
            return Err("SetForegroundWindow was denied".to_string());
        }

        let _ = unsafe { BringWindowToTop(hwnd) };
        wait_until_foreground(hwnd)
    }

    pub fn window_process_id(window_id: NativeWindowId) -> Option<u32> {
        let mut process_id = 0;
        let thread_id =
            unsafe { GetWindowThreadProcessId(hwnd_from_id(window_id), Some(&mut process_id)) };
        (thread_id != 0 && process_id != 0).then_some(process_id)
    }

    fn window_process_name(window_id: NativeWindowId) -> Option<String> {
        let process_id = window_process_id(window_id)?;
        let process =
            unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, process_id) }.ok()?;

        let mut buffer = [0u16; 32768];
        let mut length = buffer.len() as u32;
        let result = unsafe {
            QueryFullProcessImageNameW(
                process,
                PROCESS_NAME_FORMAT(0),
                windows::core::PWSTR(buffer.as_mut_ptr()),
                &mut length,
            )
        };
        unsafe {
            let _ = CloseHandle(process);
        }

        if result.is_err() || length == 0 {
            return None;
        }

        let path = String::from_utf16_lossy(&buffer[..length as usize]);
        Path::new(&path)
            .file_name()
            .and_then(|name| name.to_str())
            .map(|name| name.to_ascii_lowercase())
    }

    pub fn send_paste_shortcut(
        window_id: NativeWindowId,
        shortcut: &PasteShortcut,
    ) -> Result<(), String> {
        let resolved = resolve_paste_shortcut(window_id, shortcut);
        eprintln!(
            "paste shortcut resolved: {:?} -> {:?}{}",
            shortcut,
            resolved.shortcut,
            resolved
                .process_name
                .as_ref()
                .map(|name| format!(" process={name}"))
                .unwrap_or_default()
        );

        let shortcut = match resolved.shortcut {
            ResolvedPasteShortcut::ShiftInsert => ShortcutKeys {
                modifier: VK_SHIFT,
                key: VK_INSERT,
            },
            ResolvedPasteShortcut::CtrlV => ShortcutKeys {
                modifier: VK_CONTROL,
                key: VIRTUAL_KEY(b'V' as u16),
            },
        };

        let inputs = [
            key_input(shortcut.modifier, false),
            key_input(shortcut.key, false),
            key_input(shortcut.key, true),
            key_input(shortcut.modifier, true),
        ];

        let sent = unsafe { SendInput(&inputs, size_of::<INPUT>() as i32) };
        if sent != inputs.len() as u32 {
            return Err(format!(
                "SendInput sent {sent} of {} paste events",
                inputs.len()
            ));
        }

        Ok(())
    }

    #[derive(Clone, Copy, Debug, PartialEq, Eq)]
    enum ResolvedPasteShortcut {
        ShiftInsert,
        CtrlV,
    }

    struct ResolvedPasteRequest {
        shortcut: ResolvedPasteShortcut,
        process_name: Option<String>,
    }

    fn resolve_paste_shortcut(
        window_id: NativeWindowId,
        shortcut: &PasteShortcut,
    ) -> ResolvedPasteRequest {
        match shortcut {
            PasteShortcut::ShiftInsert => ResolvedPasteRequest {
                shortcut: ResolvedPasteShortcut::ShiftInsert,
                process_name: window_process_name(window_id),
            },
            PasteShortcut::CtrlV => ResolvedPasteRequest {
                shortcut: ResolvedPasteShortcut::CtrlV,
                process_name: window_process_name(window_id),
            },
            PasteShortcut::Default => {
                let process_name = window_process_name(window_id);
                let shortcut = if process_name
                    .as_deref()
                    .is_some_and(default_uses_ctrl_v_for_process)
                {
                    ResolvedPasteShortcut::CtrlV
                } else {
                    ResolvedPasteShortcut::ShiftInsert
                };

                ResolvedPasteRequest {
                    shortcut,
                    process_name,
                }
            }
        }
    }

    struct ShortcutKeys {
        modifier: VIRTUAL_KEY,
        key: VIRTUAL_KEY,
    }

    fn wait_until_foreground(hwnd: HWND) -> Result<(), String> {
        let deadline = Instant::now() + FOCUS_WAIT_TIMEOUT;
        while Instant::now() < deadline {
            let foreground = unsafe { GetForegroundWindow() };
            if foreground == hwnd {
                return Ok(());
            }
            thread::sleep(FOCUS_POLL_INTERVAL);
        }

        Err("previous window did not become foreground before timeout".to_string())
    }

    fn valid_window(hwnd: HWND) -> bool {
        !hwnd.is_invalid()
            && unsafe { IsWindow(Some(hwnd)) }.as_bool()
            && unsafe { IsWindowVisible(hwnd) }.as_bool()
    }

    fn hwnd_from_id(window_id: NativeWindowId) -> HWND {
        HWND(window_id as *mut core::ffi::c_void)
    }

    fn default_uses_ctrl_v_for_process(process_name: &str) -> bool {
        matches!(
            process_name,
            "chrome.exe"
                | "msedge.exe"
                | "firefox.exe"
                | "brave.exe"
                | "vivaldi.exe"
                | "opera.exe"
                | "opera_gx.exe"
        )
    }

    fn key_input(key: VIRTUAL_KEY, key_up: bool) -> INPUT {
        let flags = if key_up {
            KEYEVENTF_KEYUP
        } else {
            Default::default()
        };

        INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 {
                ki: KEYBDINPUT {
                    wVk: key,
                    wScan: 0,
                    dwFlags: flags,
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        }
    }

    #[cfg(test)]
    mod tests {
        use super::*;

        #[test]
        fn default_uses_ctrl_v_for_browser_processes() {
            assert!(default_uses_ctrl_v_for_process("chrome.exe"));
            assert!(default_uses_ctrl_v_for_process("msedge.exe"));
            assert!(default_uses_ctrl_v_for_process("firefox.exe"));
            assert!(default_uses_ctrl_v_for_process("vivaldi.exe"));
        }

        #[test]
        fn default_does_not_use_ctrl_v_for_plain_editors() {
            assert!(!default_uses_ctrl_v_for_process("notepad.exe"));
            assert!(!default_uses_ctrl_v_for_process("powershell.exe"));
        }
    }
}

#[cfg(not(target_os = "windows"))]
mod platform {
    use super::NativeWindowId;
    use crate::host::PasteShortcut;

    pub fn foreground_window_id() -> Option<NativeWindowId> {
        None
    }

    pub fn focus_window(_window_id: NativeWindowId) -> Result<(), String> {
        Err("focusPrevious is only implemented on Windows".to_string())
    }

    pub fn send_paste_shortcut(
        _window_id: NativeWindowId,
        _shortcut: &PasteShortcut,
    ) -> Result<(), String> {
        Err("sendPasteShortcut is only implemented on Windows".to_string())
    }

    pub fn window_process_id(_window_id: NativeWindowId) -> Option<u32> {
        None
    }
}
