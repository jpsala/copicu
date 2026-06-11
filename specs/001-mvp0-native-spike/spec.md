---
id: 001-mvp0-native-spike
status: draft
updated: 2026-06-05
source: docs/tracks/mvp0-definition.md
---

# MVP 0 Native Spike

## Purpose

Build the smallest useful Tauri prototype that validates whether Copicu can reliably capture, persist, search, and reuse plain text clipboard history as a local desktop app.

MVP 0 is a native behavior spike, not a polished product release. It should prove the risky flows before the project invests in richer UI, formats, plugins, or AI features.

## Product Question

Can Copicu capture, persist, search, and reuse text from the clipboard reliably in a local Tauri app?

## Scope

### Included

- Windows-first implementation.
- Tauri 2 desktop shell.
- React + Vite + TypeScript frontend.
- Rust-owned native core for clipboard polling, SQLite access, hashing, and paste flow.
- Plain text clipboard capture only.
- Consecutive duplicate suppression by normalized text hash.
- SQLite persistence for normalized history metadata and searchable text.
- Minimal picker with search input and preview-first result feed.
- Keyboard navigation in picker.
- Global shortcut to show picker.
- Tray menu with show, hide, and quit.
- Copy selected item to clipboard.
- Paste selected item into previous focused window.
- Temporary suppression window to avoid recapturing app-written clipboard content.
- Manual verification with synthetic clipboard text only.

### Excluded

- HTML, RTF, images, file lists, or custom clipboard formats.
- Full visual polish.
- Full settings UI.
- Plugins or scripting.
- AI features.
- Import/export.
- Remote sync.
- Advanced retention policy.
- Password manager or sensitive-app detection.
- CopyQ compatibility or API parity.

## Research Gate

Before implementation chooses dependencies for each native need, complete a short research pass with Context7 and web/fuentes primarias, then document it in `docs/topics/`.

Current topic entry points:

- `docs/topics/clipboard.md`
- `docs/topics/global-shortcut-and-tray.md`
- `docs/topics/sqlite-storage.md`
- `docs/topics/windows-focus-and-paste.md`
- `docs/topics/picker-interaction.md`

The defaults below are working hypotheses, not final library decisions.

## Working Defaults For MVP 0

| Question | Decision |
| --- | --- |
| Platform | Windows-first. Cross-platform support is deferred. |
| Frontend | React + Vite + TypeScript. |
| SQLite | Use Rust `rusqlite` with `bundled` and `rusqlite_migration`. |
| Clipboard monitor | Use event-driven watcher. First try `clipboard-rs`; fallback Windows listener via `AddClipboardFormatListener`/`WM_CLIPBOARDUPDATE`. |
| Shortcut library | Use `tauri-plugin-global-shortcut` from Rust. |
| Tray | Use Tauri 2 `TrayIconBuilder` from Rust. |
| Windows focus/paste | Use `windows` crate for `GetForegroundWindow`, `SetForegroundWindow`, and `SendInput`. |
| Shortcut value | Start with `Ctrl+Shift+,` as a constant after `Ctrl+Shift+V` proved unreliable in local validation. |
| Restore previous clipboard after paste | Treat as optional experiment behind a simple config constant. Do not block MVP success on it. |
| History limit | Keep latest 1000 items for the spike. |

## Picker Interaction Direction

Detailed interaction notes live in `docs/topics/picker-interaction.md`.

For MVP 0, the picker should move toward a preview-first feed: visible results show useful content directly, not only item titles with a separate preview pane.

Keyboard defaults:

- typing filters visible items;
- `Up`/`Down`, `PgUp`/`PgDown`, `Home`/`End` move selection;
- `Enter` activates selected item;
- `Escape` clears filter first, then hides the window;
- search input is focused whenever the picker opens.

Activation default for the next implementation step: copy selected item to clipboard and hide window. Paste-to-previous-window remains a separate validation step.

Future settings should cover activation behavior, focus-lost hiding, Escape behavior, preview density, and search mode. Search modes to support later: plain substring, regex, and fuzzy. MVP 0 can keep plain substring only.

## Core Flow

1. User starts Copicu.
2. App stays alive in tray/background.
3. Clipboard monitor records new plain text items.
4. Consecutive identical normalized text is ignored.
5. User presses the global shortcut.
6. App records the currently focused window before showing picker where possible.
7. Picker opens with search focused.
8. User filters visible items and selects an item with keyboard or mouse.
9. User copies the item or triggers paste.
10. For paste, app writes selected text to clipboard, restores previous focus, sends paste input, and suppresses self-capture for a short window.

## Success Criteria

MVP 0 succeeds when this manual test passes on Windows with synthetic data:

1. Launch the app and leave it running in tray.
2. Copy 20 synthetic text snippets from at least three apps.
3. Confirm history persists items without consecutive duplicates.
4. Open picker with `Ctrl+Shift+,`.
5. Search for a copied snippet.
6. Move selection with keyboard.
7. Copy selected item back to clipboard.
8. Paste selected item into the previous app window.
9. Restart app and confirm persisted history reloads.

## Non-Goals

- It does not need to look final.
- It does not need to preserve rich clipboard formats.
- It does not need to solve every focus edge case.
- It does not need production retention or privacy settings.

## Risks

| Risk | Validation |
| --- | --- |
| Clipboard polling creates loops or idle CPU cost | Measure idle behavior and verify suppression after app writes clipboard. |
| Global shortcut conflicts with another app | Keep shortcut configurable in code and document conflict. |
| Tray/background behavior is unreliable | Verify close hides app and tray quit exits. |
| SQLite shape becomes wrong for future rich formats | Keep schema small but separate content kind, normalized text, hash, and timestamps. |
| Previous focus tracking fails | Validate Windows behavior before adding UI polish. |
| Paste injection is timing-sensitive | Use conservative delay constants and document observed failure modes. |

## Handoff To Implementation

Implementation should start from `research.md`, the linked topics, then `plan.md` and `tasks.md`. Any durable decision should update the relevant topic and `docs/DECISIONS.md`.
