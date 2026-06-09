---
id: 001-mvp0-native-spike-plan
status: draft
updated: 2026-06-05
---

# MVP 0 Native Spike Plan

## Phase 1: Scaffold

Create the Tauri 2 app with React, Vite, TypeScript, and Rust. Keep the initial frontend small: one picker window or main window that can show search, list, and preview.

Initial dependencies to evaluate during scaffold:

- `tauri` and Tauri 2 base app.
- `tauri-plugin-global-shortcut`.
- `tauri-plugin-clipboard-manager` only if it helps with basic read/write; otherwise use Rust clipboard crate directly.
- `rusqlite` for local persistence.
- A Windows-focused crate or small platform module for focus restoration and paste input.

## Phase 2: App Shell

Implement the shell behaviors first:

- single running app instance if simple to add;
- tray with show, hide, quit;
- hide window instead of quitting on close;
- global shortcut `Ctrl+Shift+,`;
- picker show/hide command from Rust to frontend.

Verification:

- App can run in background.
- Shortcut opens picker while another app has focus.
- Tray quit exits the process.

## Phase 3: Text Capture

Implement plain text capture in Rust:

- poll clipboard on an interval;
- normalize text for hashing;
- hash normalized text;
- ignore empty text;
- ignore consecutive duplicate hash;
- ignore writes performed by Copicu during a suppression window;
- store accepted items in SQLite.

Verification:

- Copy synthetic text from multiple apps.
- Consecutive duplicates are ignored.
- Non-consecutive repeated text behavior is documented.
- Idle CPU is acceptable for a spike.

## Phase 4: Persistence And Search API

Implement a minimal SQLite schema and Tauri commands:

- initialize database on startup;
- insert clipboard item;
- list recent items;
- search by plain text;
- mark last used timestamp when item is reused.

Verification:

- Restart app and load history.
- Search returns expected synthetic entries.
- 1000 inserted synthetic rows remain responsive enough for MVP 0.

## Phase 5: Picker UI

Build a functional keyboard-first picker:

- search input focused on open;
- result list;
- selected row state;
- text preview;
- keyboard navigation with up/down;
- enter to paste selected item;
- copy command for selected item.

Verification:

- User can complete the success flow without mouse.
- Long text does not break layout.
- Empty search and no-results states are handled.

## Phase 6: Paste To Previous Window

Implement Windows-first paste flow:

- record previous focused window before showing picker;
- on paste, write selected text to clipboard;
- set suppression window;
- restore previous window focus;
- wait a short delay;
- send Ctrl+V;
- optionally restore previous clipboard content behind a constant.

Verification:

- Paste works into Notepad, browser text field, and VS Code or another editor.
- App-written clipboard content is not recaptured as a new item.
- Failure modes are logged without recording clipboard content.

## Phase 7: Manual QA And Notes

Run the full success criteria and capture findings in `research.md` or a short implementation note. Keep examples synthetic and avoid storing real clipboard content in logs, docs, fixtures, or screenshots.

## Implementation Principles

- Prefer clear working behavior over abstraction.
- Keep data model compatible with future rich content by naming content kind and normalized text explicitly.
- Do not add plugins, AI, settings, or retention polish during MVP 0.
- Keep logs metadata-only; never log clipboard payloads.
