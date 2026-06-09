---
id: 001-mvp0-native-spike-research
status: draft
updated: 2026-06-05
---

# MVP 0 Native Spike Research

## Current Notes

Context7 CLI was already used as a first pass for Tauri 2 documentation:

```powershell
npx ctx7 library tauri "global shortcut plugin"
npx ctx7 docs /websites/v2_tauri_app "global shortcut register Tauri 2"
npx ctx7 docs /websites/v2_tauri_app "clipboard manager permissions read text write text Tauri 2"
npx ctx7 docs /websites/v2_tauri_app "SQL plugin sqlite setup Tauri 2"
```

Observed notes from active work:

- `clipboard-manager` needs explicit permissions such as `clipboard-manager:allow-read-text` and `clipboard-manager:allow-write-text`.
- SQL plugin with SQLite uses `cargo add tauri-plugin-sql --features sqlite`.
- Context7 is useful as a first pass, but critical behavior should be confirmed with official docs, GitHub issues, or direct implementation tests.

## Research To Do During Implementation

Research should not stay only in this file. Use this file as the spec-local log, and promote each area into the relevant topic:

- `docs/topics/clipboard.md`
- `docs/topics/global-shortcut-and-tray.md`
- `docs/topics/sqlite-storage.md`
- `docs/topics/windows-focus-and-paste.md`

### Tauri 2 Global Shortcut

Confirm:

- plugin setup for Tauri 2;
- permission requirements if any;
- registration timing;
- behavior when the window is hidden;
- how shortcut conflicts are reported.

### Clipboard Access

Confirm:

- whether the official clipboard manager plugin is enough for repeated plain text polling;
- whether direct Rust clipboard access is simpler for background monitoring;
- whether read/write can happen while window is hidden;
- behavior when clipboard is locked by another process.

### SQLite

Confirm:

- whether `rusqlite` is simpler than Tauri SQL for MVP 0 because storage is part of the Rust native core;
- app data directory path for the DB;
- migration strategy for the first schema.

### Windows Focus And Paste

Confirm:

- how to record previous foreground window before showing picker;
- how to restore focus reliably;
- how to synthesize Ctrl+V;
- delays needed between focus restore, clipboard write, and paste input;
- known permission or elevated-window limitations.

## Decisions Needing Evidence

| Decision | Current Default | Evidence Needed |
| --- | --- | --- |
| Clipboard monitor method | Pending after topic research | CPU, reliability, lock behavior. |
| SQLite approach | `rusqlite` candidate | Simplicity versus Tauri SQL plugin. |
| Paste timing | Conservative fixed delays | Manual test across Notepad, browser, editor. |
| Clipboard restore | Optional flag | Whether restore causes race conditions or user confusion. |

## 2026-06-05 Initial Research Pass

Context7:

- `/websites/v2_tauri_app` for clipboard manager, global shortcut, tray, permissions and SQL plugin.
- `/websites/rs_rusqlite_rusqlite` for rusqlite usage.
- `/websites/rs_rusqlite_migration` identified for future migration research.

Web/fuentes primarias:

- Tauri Clipboard plugin: https://v2.tauri.app/plugin/clipboard/
- Tauri Global Shortcut reference: https://tauri.app/reference/javascript/global-shortcut/
- Tauri plugin permissions: https://v2.tauri.app/learn/security/using-plugin-permissions/
- rusqlite docs.rs: https://docs.rs/crate/rusqlite/latest
- Microsoft Learn `SetForegroundWindow`: https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setforegroundwindow

Summary:

- Clipboard and global shortcut plugins require explicit Tauri 2 capabilities.
- Clipboard plugin supports read/write text from JS and Rust, but continuous background monitoring still needs validation.
- Tauri tray can be built in Rust with `TrayIconBuilder`.
- `rusqlite` with `bundled` is attractive for Windows builds.
- Windows foreground restoration has OS-level restrictions, so paste-to-previous-window must be treated as a spike, not assumed reliable.

Clipboard topic update:

- `docs/topics/clipboard.md` now records the initial MVP 0 path.
- Watch/event-driven capture is now required for MVP 0.
- Watcher first option: `clipboard-rs`.
- Watcher Windows fallback: `windows` crate with `AddClipboardFormatListener` and `WM_CLIPBOARDUPDATE`.
- Read/write first option: `tauri-plugin-clipboard-manager` through Rust API.
- Read/write fallback: `arboard`, then Windows-only `clipboard-win`.

Global shortcut + tray topic update:

- `docs/topics/global-shortcut-and-tray.md` now records the initial MVP 0 path.
- Global shortcut: `tauri-plugin-global-shortcut` from Rust.
- Tray: Tauri 2 `TrayIconBuilder` from Rust.
- Avoid frontend registration for MVP 0 unless a concrete need appears.

SQLite topic update:

- `docs/topics/sqlite-storage.md` now records the initial MVP 0 path.
- Storage: `rusqlite` with `bundled`.
- Migrations: `rusqlite_migration`.
- Avoid Tauri SQL plugin for MVP 0 because storage should stay in the Rust core and frontend should use high-level commands.

Windows focus + paste topic update:

- `docs/topics/windows-focus-and-paste.md` now records the initial MVP 0 path.
- Use the `windows` crate directly for Win32 APIs.
- APIs: `GetForegroundWindow`, `SetForegroundWindow`, `SendInput`.
- `enigo` remains a fallback only for key injection.

## Research Log

Add dated notes here as implementation tests uncover actual behavior.
