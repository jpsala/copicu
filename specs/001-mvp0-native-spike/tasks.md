---
id: 001-mvp0-native-spike-tasks
status: implementation-validated
updated: 2026-06-05
---

# MVP 0 Native Spike Tasks

## Scaffold

- [x] Complete technical research gate for clipboard, shortcut/tray, SQLite, and Windows paste.
- [x] Update relevant `docs/topics/` files with chosen libraries and patterns.
- [x] Record durable library decisions in `docs/DECISIONS.md`.
- [x] Create Tauri 2 + React + Vite + TypeScript app.
- [x] Add Rust dependencies needed for app shell and storage.
- [x] Add frontend package scripts for dev and build.
- [x] Document commands in `docs/DEVELOPMENT.md`.

## App Shell

- [x] Add tray menu with show, hide, and quit.
- [x] Make window hide instead of quit on close.
- [x] Register `Ctrl+Shift+,` global shortcut.
- [x] Show main window from global shortcut.
- [x] Keep app usable when main window is hidden.

## Clipboard Capture

- [x] Implement plain text clipboard watcher.
- [x] Validate `clipboard-rs` watcher in visible Tauri app with synthetic text from Notepad, Chrome, and VS Code.
- [x] Add Windows metadata-only clipboard format probe.
- [x] Add live metadata-only clipboard event feed for manual MIME/image/file testing.
- [x] Add volatile text preview in the manual feed without logging or persistence.
- [x] Add retry/backoff for transient clipboard locks.
- [x] Validate `clipboard-rs` watcher while app is hidden/tray.
- [x] Add Windows watcher fallback plan with `AddClipboardFormatListener` if needed.
- [x] Normalize text before hashing.
- [x] Hash normalized text.
- [x] Ignore empty clipboard text.
- [x] Ignore consecutive duplicate hashes.
- [x] Add self-write suppression window.
- [x] Add debounce/coalesce for multi-format copy bursts.
- [x] Ensure logs never include clipboard payload text.

## SQLite Persistence

- [x] Create app data database path.
- [x] Initialize SQLite schema.
- [x] Insert captured text item.
- [x] List recent items.
- [x] Search items by text.
- [x] Enforce 1000 item spike limit.
- [x] Reload history after app restart.

## Picker UI

- [x] Build search input, result list, and preview.
- [x] Focus search input when picker opens.
- [x] Add keyboard navigation.
- [x] Convert picker to preview-first result feed.
- [x] Add extended navigation: PageUp, PageDown, Home, End.
- [x] Add Escape behavior: clear filter first, then hide window.
- [x] Add Enter behavior: copy selected item to clipboard and hide window.
- [x] Add mouse behavior: click selects and double-click activates.
- [x] Keep search mode plain substring for MVP, with regex/fuzzy documented for later.
- [x] Add enter-to-paste selected item.
- [x] Add copy selected item action.
- [x] Handle empty history and no-results states.
- [x] Verify long synthetic text does not break layout.
- [x] Add Playwright visual smoke check for current shell desktop and narrow desktop window.

## Host API And Plugins Prep

- [x] Refactor picker activation into host API primitives instead of UI-only handlers.
- [x] Define MVP command shape for `activateItem` with explicit copy/hide/focus/paste options.
- [ ] Keep React, tray, shortcut handlers, and future plugins as clients of the same host API.
- [x] Add capability/permission notes for future plugin calls to clipboard, picker, history, window focus, and input paste.
- [x] Keep CopyQ baseline handy for activation/paste behavior before implementing paste-to-previous-window.

## Paste To Previous Window

- [x] Record previous focused window before showing picker.
- [x] Write selected item to clipboard before paste.
- [x] Restore previous window focus.
- [x] Send paste shortcut after a short delay, defaulting to target-aware paste: browsers use Ctrl+V, other apps use Shift+Insert.
- [x] Suppress capture of app-written clipboard content.
- [ ] Test optional previous clipboard restore behind a constant.
- [x] Document observed failure modes.

## Verification

- [ ] Copy 20 synthetic snippets from at least three apps.
- [x] Confirm consecutive duplicates are ignored.
- [x] Search and select snippets from picker.
- [x] Copy selected item to clipboard.
- [x] Paste selected item into previous app.
- [x] Restart app and confirm history persists.
- [x] Record manual test results in `research.md` or implementation notes.

## Documentation

- [x] Update `docs/WORKING_MEMORY.md` after implementation starts.
- [x] Update `docs/DECISIONS.md` for durable decisions.
- [x] Update `docs/DEVELOPMENT.md` with real commands after scaffold exists.
