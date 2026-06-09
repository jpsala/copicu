use serde::Serialize;

#[derive(Clone, Serialize)]
pub struct ClipboardProbe {
    pub platform: &'static str,
    pub sequence_number: Option<u32>,
    pub format_count: u32,
    pub has_text: bool,
    pub has_html: bool,
    pub has_rtf: bool,
    pub has_image: bool,
    pub has_files: bool,
    pub file_count: Option<u32>,
    pub formats: Vec<ClipboardFormatProbe>,
}

#[derive(Clone, Serialize)]
pub struct ClipboardFormatProbe {
    pub id: u32,
    pub name: String,
    pub kind: ClipboardFormatKind,
    pub handle_size_bytes: Option<usize>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ClipboardFormatKind {
    Text,
    Html,
    Rtf,
    Image,
    Files,
    Standard,
    Registered,
    Private,
    Gdi,
    Unknown,
}

#[cfg(target_os = "windows")]
pub fn probe_clipboard() -> Result<ClipboardProbe, String> {
    windows_probe::probe_clipboard()
}

#[cfg(not(target_os = "windows"))]
pub fn probe_clipboard() -> Result<ClipboardProbe, String> {
    Ok(ClipboardProbe {
        platform: "unsupported",
        sequence_number: None,
        format_count: 0,
        has_text: false,
        has_html: false,
        has_rtf: false,
        has_image: false,
        has_files: false,
        file_count: None,
        formats: Vec::new(),
    })
}

#[cfg(target_os = "windows")]
mod windows_probe {
    use super::{ClipboardFormatKind, ClipboardFormatProbe, ClipboardProbe};
    use std::{thread, time::Duration};
    use windows::Win32::{
        Foundation::HGLOBAL,
        System::{
            DataExchange::{
                CloseClipboard, CountClipboardFormats, EnumClipboardFormats, GetClipboardData,
                GetClipboardFormatNameW, GetClipboardSequenceNumber, IsClipboardFormatAvailable,
                OpenClipboard,
            },
            Memory::GlobalSize,
        },
        UI::Shell::{DragQueryFileW, HDROP},
    };

    const CF_TEXT: u32 = 1;
    const CF_BITMAP: u32 = 2;
    const CF_METAFILEPICT: u32 = 3;
    const CF_DIB: u32 = 8;
    const CF_ENHMETAFILE: u32 = 14;
    const CF_HDROP: u32 = 15;
    const CF_DIBV5: u32 = 17;
    const CF_UNICODETEXT: u32 = 13;
    const CF_PRIVATEFIRST: u32 = 0x0200;
    const CF_PRIVATELAST: u32 = 0x02ff;
    const CF_GDIOBJFIRST: u32 = 0x0300;
    const CF_GDIOBJLAST: u32 = 0x03ff;
    const CLIPBOARD_OPEN_RETRY_DELAYS: [Duration; 4] = [
        Duration::from_millis(8),
        Duration::from_millis(16),
        Duration::from_millis(32),
        Duration::from_millis(64),
    ];

    pub fn probe_clipboard() -> Result<ClipboardProbe, String> {
        let _guard = ClipboardOpenGuard::open()?;
        let mut formats = Vec::new();
        let mut previous = 0;

        loop {
            let next = unsafe { EnumClipboardFormats(previous) };
            if next == 0 {
                break;
            }

            formats.push(format_probe(next));
            previous = next;
        }

        let file_count = if has_format(CF_HDROP) {
            clipboard_file_count()
        } else {
            None
        };

        let format_count = formats.len() as u32;

        Ok(ClipboardProbe {
            platform: "windows",
            sequence_number: Some(unsafe { GetClipboardSequenceNumber() }),
            format_count,
            has_text: has_format(CF_UNICODETEXT) || has_format(CF_TEXT),
            has_html: formats
                .iter()
                .any(|format| is_named_format(&format.name, "html format")),
            has_rtf: formats
                .iter()
                .any(|format| is_named_format(&format.name, "rich text format")),
            has_image: has_format(CF_BITMAP)
                || has_format(CF_DIB)
                || has_format(CF_DIBV5)
                || has_format(CF_METAFILEPICT)
                || has_format(CF_ENHMETAFILE)
                || formats
                    .iter()
                    .any(|format| is_named_format(&format.name, "png")),
            has_files: has_format(CF_HDROP),
            file_count,
            formats,
        })
    }

    struct ClipboardOpenGuard;

    impl ClipboardOpenGuard {
        fn open() -> Result<Self, String> {
            retry_clipboard_open()
                .map(|_| Self)
                .map_err(|error| format!("open clipboard failed: {error}"))
        }
    }

    impl Drop for ClipboardOpenGuard {
        fn drop(&mut self) {
            let _ = unsafe { CloseClipboard() };
        }
    }

    fn format_probe(id: u32) -> ClipboardFormatProbe {
        let name = format_name(id);
        let kind = classify_format(id, &name);
        let handle_size_bytes = clipboard_handle_size(id, &name);

        ClipboardFormatProbe {
            id,
            name,
            kind,
            handle_size_bytes,
        }
    }

    fn has_format(id: u32) -> bool {
        unsafe { IsClipboardFormatAvailable(id).is_ok() }
    }

    fn clipboard_handle_size(id: u32, name: &str) -> Option<usize> {
        if !is_global_memory_format(id, name) {
            return None;
        }

        let handle = unsafe { GetClipboardData(id).ok()? };
        let size = unsafe { GlobalSize(HGLOBAL(handle.0)) };

        (size > 0).then_some(size)
    }

    fn is_global_memory_format(id: u32, name: &str) -> bool {
        let lower_name = name.to_ascii_lowercase();

        matches!(id, CF_TEXT | CF_UNICODETEXT | CF_HDROP)
            || is_named_format(&lower_name, "html format")
            || is_named_format(&lower_name, "rich text format")
            || is_named_format(&lower_name, "png")
            || lower_name.starts_with("image/")
    }

    fn clipboard_file_count() -> Option<u32> {
        let handle = unsafe { GetClipboardData(CF_HDROP).ok()? };
        let count = unsafe { DragQueryFileW(HDROP(handle.0), u32::MAX, None) };

        Some(count)
    }

    fn format_name(id: u32) -> String {
        if let Some(name) = standard_format_name(id) {
            return name.to_string();
        }

        let mut buffer = [0u16; 256];
        let len = unsafe { GetClipboardFormatNameW(id, &mut buffer) };
        if len > 0 {
            String::from_utf16_lossy(&buffer[..len as usize])
        } else {
            format!("format-{id}")
        }
    }

    fn standard_format_name(id: u32) -> Option<&'static str> {
        match id {
            1 => Some("CF_TEXT"),
            2 => Some("CF_BITMAP"),
            3 => Some("CF_METAFILEPICT"),
            4 => Some("CF_SYLK"),
            5 => Some("CF_DIF"),
            6 => Some("CF_TIFF"),
            7 => Some("CF_OEMTEXT"),
            8 => Some("CF_DIB"),
            9 => Some("CF_PALETTE"),
            10 => Some("CF_PENDATA"),
            11 => Some("CF_RIFF"),
            12 => Some("CF_WAVE"),
            13 => Some("CF_UNICODETEXT"),
            14 => Some("CF_ENHMETAFILE"),
            15 => Some("CF_HDROP"),
            16 => Some("CF_LOCALE"),
            17 => Some("CF_DIBV5"),
            _ => None,
        }
    }

    fn classify_format(id: u32, name: &str) -> ClipboardFormatKind {
        let lower_name = name.to_ascii_lowercase();

        if matches!(id, CF_TEXT | CF_UNICODETEXT) {
            ClipboardFormatKind::Text
        } else if is_named_format(&lower_name, "html format") {
            ClipboardFormatKind::Html
        } else if is_named_format(&lower_name, "rich text format") {
            ClipboardFormatKind::Rtf
        } else if matches!(
            id,
            CF_BITMAP | CF_DIB | CF_DIBV5 | CF_METAFILEPICT | CF_ENHMETAFILE
        ) || is_named_format(&lower_name, "png")
        {
            ClipboardFormatKind::Image
        } else if id == CF_HDROP {
            ClipboardFormatKind::Files
        } else if (CF_PRIVATEFIRST..=CF_PRIVATELAST).contains(&id) {
            ClipboardFormatKind::Private
        } else if (CF_GDIOBJFIRST..=CF_GDIOBJLAST).contains(&id) {
            ClipboardFormatKind::Gdi
        } else if standard_format_name(id).is_some() {
            ClipboardFormatKind::Standard
        } else if !name.starts_with("format-") {
            ClipboardFormatKind::Registered
        } else {
            ClipboardFormatKind::Unknown
        }
    }

    fn retry_clipboard_open() -> windows::core::Result<()> {
        for delay in CLIPBOARD_OPEN_RETRY_DELAYS {
            match unsafe { OpenClipboard(None) } {
                Ok(()) => return Ok(()),
                Err(_) => thread::sleep(delay),
            }
        }

        unsafe { OpenClipboard(None) }
    }

    fn is_named_format(name: &str, expected: &str) -> bool {
        name.eq_ignore_ascii_case(expected)
    }

    #[allow(dead_code)]
    fn clipboard_format_count() -> u32 {
        let count = unsafe { CountClipboardFormats() };
        count.max(0) as u32
    }
}
