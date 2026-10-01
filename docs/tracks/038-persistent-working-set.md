---
title: Working set de marcados persistentes
status: closed
summary: Marcados separados de selección, protección de retención y pertenencia por query registrados en el corte v0.5.0.
last_worked: null
topics: [picker-interaction, filtering-and-query-syntax, sqlite-storage]
---

# Persistent Marked Working Set

**Importación OS2:** UTC histórica desconocida; `null` conserva supervisión y aceptación anteriores sin contarlas como nuevas. Metadata original:

```yaml
id: persistent-working-set
status: complete
updated: 2026-09-29
```

Cerrado el corte de implementación según resultado y revisión registrados; distribución corresponde a 039. Modelos, Run/Dispatches, recursos, permisos y dogfood del cuerpo son históricos, no autorización para relanzarlos o usar datos reales.

## Result

Implemented and included in the v0.5.0 release cut, continuing JP dogfood. Distribution and later native smoke: [`039-release-0-5-0`](039-release-0-5-0.md). Contract: [`015-persistent-working-set`](../../specs/015-persistent-working-set/spec.md). Checkbox/Ctrl/Shift remain one transient selection, flags form a persistent working set. UI uses selected/marked, explicit counted Add/Remove commands and global-versus-loaded scope before batch actions; legacy query aliases stay valid but are not promoted. Marked clips and blobs are protected from automatic retention without consuming the ordinary-history budget. No new selection mode. This implementation cut did not publish/install; the later release is a separate authorized operation.

Refresh retains all loaded selected IDs still matching the validated applied predicate, including after mark mutations and at the top after loading later pages. Existence alone is insufficient. Durable rules: `docs/topics/picker-interaction.md`, `docs/topics/filtering-and-query-syntax.md`, `docs/topics/sqlite-storage.md`; user explanation in `README.md` and Settings retention copy.

## Supervision

Orca Run `run_fd10bc4b4d15`. Coordinator and all workers: Pi / openai-codex / `gpt-6.1-sol` medium, verified via runtime checkpoints and session responses, no switches.

- UI implementation `ctx_c80280484257`: main/styles/visual tests, exclusive ownership; author build and 30 focused visuals passed.
- Retention implementation `ctx_672f82084878`: storage + two embedded regressions; author canonical Rust 258 passed, 1 ignored.
- Independent read-only review `ctx_c52612f0cdc0`: checked code against spec, identified membership and paginated-selection acceptance gaps; Node tests 17/17.
- Repair `ctx_f982f854f221`: same reviewer's proven terminal under new exclusive ownership; main/storage/visual tests, no search.rs edits. Author build, 30 focused visuals and Rust 259 passed, 1 ignored. Added real SQLite membership regressions and matching mock behavior; loaded/global count uses memoized Set membership.
- All implementation/repair terminals released after settlement; review terminal ownership transferred to repair and then released. No reclaimable workers remain. Pre-existing terminals/workspace and dirty folder/query-editor changes preserved.

## Coordinator Acceptance

- `npm run build`: passed, existing chunk-size warning.
- Final full visual suite: 440 passed; two Chromium navigation failures `ERR_NO_BUFFER_SPACE` passed with `npx playwright test --last-failed --workers=1` (2/2). All 442 cases covered; not a single clean full-suite pass after repair.
- `npm run rust:test`: 259 passed, 1 ignored; `node --test tests/structured-search.test.mjs tests/search-snapshot.test.mjs`: 27 passed; `git diff --check`: passed.
- Logs under `%TEMP%/copicu-working-set-final-{visual,visual-retry,rust,node,build}.log`.
- `npm run dev:restart`: built-dev rebuilt and restarted, PID 43268 at verification, native hidden startup and `Responding=True`; preserved `.codex-run/dev-isolated/app-data`, installed app untouched, remote debugging disabled. Logs: `.codex-run/dev-restart/logs/owner-20260929-173029.{out,err}.log`.
- No new native foreground focus/clipboard/paste smoke. Context router still reports pre-existing invalid Working Memory focus metadata; no unrelated OS repair.

## Next

JP dogfood: accumulate marks across two searches, perform unrelated copy, revisit global marked set, add/remove marks from a paginated selection. Publish/install only on explicit request.
