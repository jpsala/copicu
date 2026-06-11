# Orchestration Guide: Architecture Hardening

## Role Split

Main agent is the orquestador.

Responsibilities:

- choose phase order;
- decide when to delegate;
- keep immediate blocking work local;
- review all subagent diffs;
- run verification;
- update handoff docs.

Subagents are workers or explorers.

They receive:

- one narrow task;
- explicit file ownership;
- explicit do/do-not rules;
- exact verification command;
- instruction to not revert other work.

They do not receive:

- broad architecture goals;
- permission to redesign APIs;
- overlapping write scopes;
- tasks that require interpreting the whole project history.

## Startup Checklist

1. Read `docs/tracks/016-architecture-hardening.md`.
2. Read this file.
3. Read `specs/007-architecture-hardening/tasks.md`.
4. Run `git status --short`.
5. Decide the local critical-path task.
6. Spawn workers only for independent sidecar tasks.

## Delegation Rules

- Delegate only after forming a local plan.
- Prefer one worker per write scope.
- Keep workers away from files already being edited by another worker.
- Tell workers they are not alone in the codebase and must not revert unrelated changes.
- Ask workers to list changed files and checks run.
- Review results before marking tasks done.
- Close completed agents when no longer needed.

## Default Worker Prompt Template

```text
You are a worker in C:\dev\chat\copyq-tauri.

Read AGENTS.md first and follow its project rules. You are not alone in the codebase: there may be unrelated local changes or parallel worker changes. Do not revert changes you did not make.

Task:
<one-sentence task>

Ownership:
- You may edit: <exact files>
- Do not edit: <exact exclusions>

Goal:
<observable goal>

Do:
- <specific action>
- <specific action>

Do not:
- <forbidden change>
- <forbidden change>

Verify:
- <command>

Final response:
- changed files
- checks run and result
- any blocker or risk
```

## Default Explorer Prompt Template

```text
You are an explorer in C:\dev\chat\copyq-tauri.

Read AGENTS.md first. Do not edit files.

Question:
<specific codebase question>

Scope:
- Inspect only: <files/modules>

Return:
- direct answer
- file/line references
- risks or unknowns
```

## Ready Worker: Picker Filter Event

```text
You are a worker in C:\dev\chat\copyq-tauri.

Read AGENTS.md first and follow its project rules. You are not alone in the codebase: there may be unrelated local changes or parallel worker changes. Do not revert changes you did not make.

Task:
Fix the picker filter event listener so picker.open({ query }) can work when renderer diagnostics are disabled.

Ownership:
- You may edit: src/main.tsx
- Do not edit: Rust files, docs, package files

Goal:
The listener for PICKER_FILTER_EVENT is active in normal Tauri runtime even when rendererDebugDiagnosticsEnabled() is false.

Do:
- Keep diagnostic-only listeners and polling behind rendererDebugDiagnosticsEnabled().
- Move only the PICKER_FILTER_EVENT listener outside that diagnostics gate.
- Preserve the existing payload handling and refreshHistory behavior.

Do not:
- Refactor App state.
- Change query syntax.
- Change history search behavior.

Verify:
- npm run build

Final response:
- changed files
- checks run and result
- any blocker or risk
```

## Ready Worker: WhichKey Capability

```text
You are a worker in C:\dev\chat\copyq-tauri.

Read AGENTS.md first and follow its project rules. You are not alone in the codebase: there may be unrelated local changes or parallel worker changes. Do not revert changes you did not make.

Task:
Align Tauri capabilities with the known WhichKey window label.

Ownership:
- You may edit: src-tauri/capabilities/default.json
- You may inspect: src-tauri/src/window_state.rs, src-tauri/tauri.conf.json
- Do not edit: frontend files

Goal:
If whichkey is a live window label, default capabilities include it without adding unrelated permissions.

Do:
- Check window labels in window_state.rs.
- Add only the missing window label to capabilities if needed.

Do not:
- Add new permissions.
- Rename existing windows.
- Change tauri.conf.json unless you find a direct inconsistency and report it first.

Verify:
- cd src-tauri; $env:CARGO_TARGET_DIR='target-codex-check'; cargo check

Final response:
- changed files
- checks run and result
- any blocker or risk
```

## Ready Worker: Script Host Capability Gateway

```text
You are a worker in C:\dev\chat\copyq-tauri.

Read AGENTS.md first and follow its project rules. You are not alone in the codebase: there may be unrelated local changes or parallel worker changes. Do not revert changes you did not make.

Task:
Add central capability validation for script host calls.

Ownership:
- You may edit: src-tauri/src/actions.rs
- Do not edit: scripts/copicu-script-runner.mjs, frontend files, storage.rs

Goal:
Every script host method validates required capabilities before executing effects.

Do:
- Add a helper that checks required capabilities for host methods.
- Call it before executing host method effects.
- Preserve existing commands.run and picker.open specific checks.
- Add tests for at least history.remove denied, clipboard.read denied, and picker.open denied by missing picker:open.

Do not:
- Rename capabilities.
- Change the JS runner protocol.
- Add new host APIs.

Verify:
- cd src-tauri; $env:CARGO_TARGET_DIR='target-codex-check'; cargo test actions

Final response:
- changed files
- checks run and result
- any blocker or risk
```

## Ready Worker: Node Runner Timeout

```text
You are a worker in C:\dev\chat\copyq-tauri.

Read AGENTS.md first and follow its project rules. You are not alone in the codebase: there may be unrelated local changes or parallel worker changes. Do not revert changes you did not make.

Task:
Add timeout handling to the Node script runner path.

Ownership:
- You may edit: src-tauri/src/actions.rs
- You may add a synthetic test fixture only if the existing test style supports it.
- Do not edit: user script folders or real clipboard data.

Goal:
A hung Node script runner is killed after a bounded timeout and returns a redacted error.

Do:
- Add a named timeout constant.
- Kill the child process on timeout.
- Ensure stderr/stdout handling does not deadlock.
- Add or document a synthetic validation.

Do not:
- Change script API shape.
- Change action discovery.
- Log script source or clipboard payload.

Verify:
- cd src-tauri; $env:CARGO_TARGET_DIR='target-codex-check'; cargo test actions

Final response:
- changed files
- checks run and result
- any blocker or risk
```

## Ready Worker: Storage Blob Cleanup

```text
You are a worker in C:\dev\chat\copyq-tauri.

Read AGENTS.md first and follow its project rules. You are not alone in the codebase: there may be unrelated local changes or parallel worker changes. Do not revert changes you did not make.

Task:
Ensure history prune cleans up image blobs and thumbnails.

Ownership:
- You may edit: src-tauri/src/storage.rs
- Do not edit: frontend files or action runner files

Goal:
When prune removes image rows, owned blob_path and thumbnail_path files are removed or explicitly handled by a GC path.

Do:
- Add a failing test with synthetic image/blob paths first.
- Implement cleanup in the prune path.
- Preserve delete_item behavior.

Do not:
- Change HistoryItem DTO fields.
- Change search semantics.
- Use real clipboard data.

Verify:
- cd src-tauri; $env:CARGO_TARGET_DIR='target-codex-check'; cargo test storage

Final response:
- changed files
- checks run and result
- any blocker or risk
```

## Orchestrator Review Checklist

For each worker result:

- Did it touch only owned files?
- Did it avoid unrelated rewrites?
- Are tests/checks actually relevant?
- Is there any privacy risk?
- Does the diff keep existing user changes?
- Is the next task still valid after this change?

## Closeout Checklist

Before final response to JP:

- update `docs/tracks/016-architecture-hardening.md`;
- update checkboxes in `specs/007-architecture-hardening/tasks.md`;
- run required checks or clearly report why not;
- summarize changed files and remaining risk;
- tell JP the exact prompt to use if another session should continue.
