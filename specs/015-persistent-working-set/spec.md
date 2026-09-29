# Persistent marked working set

Status: implemented, included in the v0.5.0 release cut; continuing JP dogfood. Requested by JP on 2026-09-29 following a selection UX review.

## Contract

- Current clip, transient multi-selection and persistent marks remain distinct. Checkbox, Ctrl-click and Shift-click build the same transient selection; marking uses the flag. No new selection mode, collection subsystem or dependency.
- Automatic history refresh retains transient selected IDs that still exist in the applied results and preserves navigation/scroll. Explicit search changes and picker hide reset transient selection, never persistent marks.
- UI names are selected and marked. `is:checked`/`is:unchecked` remain compatible query aliases but are not promoted as UI terminology. Marks form a working set, not favorites, Inbox, folders or pinning.
- Separate counted commands add selected clips to marks and remove selected clips from marks, including mixed selection. Clearing marks never deletes clips.
- Global marked count and menu explain persistence across search, hide and restart. Show the global total and marked clips in the loaded results; do not claim loaded count covers all matches or the viewport. Never load the entire filtered history just to show a count.
- Batch actions from the marked menu act on all marked clips. Explicitly show total and the count outside the loaded results before metadata/edit/delete or other batch operations. Retain existing loading/error safety and keyboard access.
- Marked clips are exempt from automatic retention alongside Inbox/folder clips and do not consume the normal-history count budget. Payload/blob cleanup uses exactly the same retention rule. Removing marks re-enables ordinary retention on the next pruning pass, unless another protection applies. Explicit deletion remains allowed.

## Acceptance

- Visual tests: Ctrl/Shift/checkbox equivalence, mixed add/remove, selection reset independent from marks, accumulating marks across searches, global versus loaded scope, global actions including unloaded clips, keyboard/narrow layout and no overflow, automatic refresh preserving surviving selected IDs.
- Rust regressions: old marked text/image clips and blobs survive retention; normal history limit still applies; unmarked items can be pruned; Inbox/folder behavior and explicit delete remain unchanged.
- Coordinator runs build, visual suite and relevant Rust checks, reviews author diffs, obtains independent review and reloads/restarts dev without touching installed app or private clipboard content.

## Tasks

- [x] UI implementation and visual regressions (exclusive worker: `src/main.tsx`, `src/styles.css`, `tests/visual/shell.spec.ts`).
- [x] Retention implementation and Rust regressions (exclusive worker: `src-tauri/src/storage.rs`).
- [x] Independent review of delivered changes, repairs assigned after ownership handover.
- [x] Coordinator: durable topics/index, acceptance checks and dev restart.

Final acceptance: build passed; visual suite 440 passed with two Chromium `ERR_NO_BUFFER_SPACE` navigation failures, both passed in single-worker retry; Rust 259 passed, 1 ignored; Node search/snapshot 27 passed. Built-dev restarted on preserved isolated profile and reported native hidden startup/responding. No new foreground focus/clipboard smoke or installation/publication. Operational evidence: [`038-persistent-working-set`](../../docs/tracks/038-persistent-working-set.md).

## Non-goals

Feature implementation did not include release/install, commit/push, remote services, dependency installation, named multiple working sets, UI redesign or unrelated agentic metadata repair. Subsequent authorized publication is tracked separately in `docs/tracks/039-release-0.5.0.md`; local installation remains excluded.
