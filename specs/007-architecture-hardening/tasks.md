# Tasks: Architecture Hardening

Status: complete

## Phase 0: Startup

- [X] T001 Read `docs/tracks/016-architecture-hardening.md`, `specs/007-architecture-hardening/orchestration.md`, and this file.
- [X] T002 Run `git status --short` and note unrelated dirty files before editing.
- [X] T003 Confirm whether subagent tools are available; if not, execute tasks locally in the same order.

## Phase 1: Quick Wins

- [X] T004 [P] [US1] Move `PICKER_FILTER_EVENT` listener out of the diagnostics gate in `src/main.tsx` while leaving diagnostic-only listeners gated.
- [X] T005 [P] [US1] Align known window labels with Tauri capabilities in `src-tauri/capabilities/default.json`; include `whichkey` if it is a live window label.
- [X] T006 [US1] Run `npm run build` after T004/T005 and record the result in `docs/tracks/016-architecture-hardening.md`.
- [X] T007 [US1] Run `cd src-tauri; $env:CARGO_TARGET_DIR='target-codex-check'; cargo check` if T005 touched Rust/Tauri config.

## Phase 2: Script Host Boundary

- [X] T008 [US2] Add a central script host capability validation helper in `src-tauri/src/actions.rs`.
- [X] T009 [US2] Apply the validation helper before executing `history.search`, `history.get`, `history.update`, `history.remove`, `clipboard.read`, `ui.alert`, `ui.confirm`, `ui.input`, `ai.respondMarkdown`, `ai.summarizeMarkdown`, and `commands.run` in `src-tauri/src/actions.rs`.
- [X] T010 [US2] Preserve existing command-specific checks for `commands.run('picker.open')` in `src-tauri/src/actions.rs`.
- [X] T011 [US2] Add Rust tests for at least `history.remove` denied, `clipboard.read` denied, and `commands.run('picker.open')` denied by missing command-specific capability.
- [X] T012 [US2] Run focused Rust tests for `actions` and then `npm run rust:test`.

## Phase 3: Capability Contract Drift

- [X] T013 [US4] Add a shared script capability contract source or drift test so Rust, frontend, secondary windows, and AI planner cannot silently diverge.
- [X] T014 [US4] Update `src/main.tsx` and `src/windows/secondaryWindows.tsx` to consume the shared capability list or covered generated output.
- [X] T015 [US4] Update `scripts/ai-script-planner.mjs` to consume the shared capability list if the runtime remains simple; otherwise add a documented drift check.
- [X] T016 [US4] Run `npm run build` and the relevant Rust test/check.

## Phase 4: Runner Timeout

- [X] T017 [US2] Add a timeout constant and timeout handling to the Node script runner path in `src-tauri/src/actions.rs`.
- [X] T018 [US2] Ensure timeout kills the child process and returns a redacted error.
- [X] T019 [US2] Add or run a synthetic timeout validation with no real clipboard payload.
- [X] T020 [US2] Run focused action runner tests and `npm run rust:test`.

## Phase 5: Storage Safety

- [X] T021 [US3] Add a failing storage test for image blob/thumbnail cleanup when history prune deletes image rows in `src-tauri/src/storage.rs`.
- [X] T022 [US3] Implement blob/thumbnail cleanup for pruned rows in `src-tauri/src/storage.rs`.
- [X] T023 [US3] Refactor thumbnail data URL loading so filesystem reads are not performed while the main SQLite lock is held, if this can be done without changing DTO behavior.
- [X] T024 [US3] Avoid writing duplicate image blobs before duplicate hash detection, if this can be done safely after T022.
- [X] T025 [US3] Run focused storage tests and `npm run rust:test`.

## Phase 6: Mechanical Modularization

- [X] T026 [US4] Extract storage schema/migrations from `src-tauri/src/storage.rs` without behavior changes.
- [X] T027 [US4] Extract storage blob helpers from `src-tauri/src/storage.rs` without behavior changes.
- [X] T028 [US4] Extract storage search/SearchPlan compiler from `src-tauri/src/storage.rs` without behavior changes.
- [X] T029 [US4] Extract action capabilities from `src-tauri/src/actions.rs` without behavior changes.
- [X] T030 [US4] Extract action host API dispatch from `src-tauri/src/actions.rs` without behavior changes.
- [X] T031 [US4] Run `npm run rust:test` after every two extraction tasks, or after each extraction if tests become flaky.

## Phase 7: Search Scalability Decision

- [X] T032 [US3] Run or create a synthetic 50k history benchmark before deciding on FTS5.
- [X] T033 [US3] Document whether FTS5 is needed now, deferred, or blocked in `docs/tracks/016-architecture-hardening.md`.
- [X] T034 [US3] If FTS5 is deferred, ensure `SearchPlanV1` remains the planned contract and no SQL generation by AI is introduced.

## Phase 8: Closeout

- [X] T035 Update `docs/tracks/016-architecture-hardening.md` with final state, checks, known follow-ups.
- [X] T036 Update durable docs only if decisions changed: `docs/DECISIONS.md`, `docs/topics/*`, or `docs/WORKING_MEMORY.md`.
- [X] T037 Run `bun scripts/context-index.ts` if docs index should include the new track/spec.
- [X] T038 Final verification: `npm run build` and `npm run rust:test`.

## MVP Slice

For the first session, stop after T007 unless the tree is clean and checks are green. Do not start Phase 2 until quick wins are integrated.
