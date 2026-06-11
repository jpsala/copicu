# Plan: Architecture Hardening

## Technical Context

- Stack: Tauri 2, Rust, React/Vite/TypeScript, SQLite via `rusqlite`.
- Persistencia: SQLite para metadata, blobs en filesystem para imagenes/payloads grandes.
- Runtime scripts: TS/JS locales trusted, ejecutados con Node runner y host calls a Rust.
- UI: picker principal y ventanas auxiliares Tauri/WebView.
- Plataforma primaria: Windows.

## Architecture Direction

La direccion vigente es correcta: Rust debe poseer clipboard, storage, shortcuts, focus/paste y script host; frontend debe poseer picker/settings/surfaces. El problema actual es que los limites estan demasiado mezclados en archivos grandes.

Target conceptual:

```text
src-tauri/src/
  app_shell/        windows, tray, lifecycle, command wiring
  clipboard/        watcher, coalescing, self-write suppression
  storage/          schema, migrations, history, tags, settings, blobs, search
  search/           SearchPlan compiler and explain
  actions/          registry, discovery, runtime, host API, capabilities
  shortcuts/        global/compound routing
  window_focus/     previous window, paste policy

src/
  shared/           DTOs, event names, capability labels
  hooks/            history/actions/settings/window state
  surfaces/         picker, settings, ui-host, notifications, ai-output
```

No hace falta llegar a esta estructura en un solo cambio.

## Delegation Strategy

El orquestador mantiene ownership de:

- decisiones de arquitectura;
- secuencia de fases;
- revision de diffs;
- integracion y tests;
- updates del handoff.

Subagentes pueden tomar:

- cambios de un archivo o scope chico;
- auditorias puntuales;
- tests concretos;
- refactors mecanicos con write set disjunto.

Subagentes no deben tomar:

- cambios cruzados en Rust + frontend + scripts a la vez;
- redisenos de storage o script API;
- decisions sobre FTS5/SearchPlan;
- tareas que bloquean el siguiente paso inmediato del orquestador.

## Phase 1: Quick Wins

### 1A. Picker Filter Event

Scope: `src/main.tsx`.

Change:

- Mantener diagnostics gated.
- Mover listener de `PICKER_FILTER_EVENT` fuera de `rendererDebugDiagnosticsEnabled()`.
- No cambiar `refreshHistory` ni estado de seleccion salvo lo ya existente.

Verify:

- `npm run build`
- Test/manual check: evento `copicu://picker/filter` actualiza query con diagnostics apagado.

### 1B. Window Capabilities

Scope:

- `src-tauri/capabilities/default.json`
- `src-tauri/src/window_state.rs` solo si se encuentra inconsistencia adicional.

Change:

- Alinear windows conocidas con capabilities.
- Agregar `whichkey` si la ventana existe en runtime actual.
- No ampliar permisos no relacionados.

Verify:

- `cd src-tauri; $env:CARGO_TARGET_DIR='target-codex-check'; cargo check`

## Phase 2: Script Host Boundary

Scope principal: `src-tauri/src/actions.rs`.

Change:

- Agregar una funcion central que valide capabilities por metodo host.
- Llamarla antes del match que ejecuta efectos.
- Mantener checks especificos de `commands.run` para command-specific caps.
- Cubrir denied/allowed paths con tests.

Mapping inicial recomendado:

| Host method | Required capability |
| --- | --- |
| `history.search` | `history:search` |
| `history.get` with content | `history:read-content` |
| `history.update` | `history:write-metadata` |
| `history.remove` | `history:delete` |
| `clipboard.read` | `clipboard:read` |
| `ui.alert` | `ui:alert` |
| `ui.confirm` | `ui:confirm` |
| `ui.input` | `ui:input` |
| `ai.respondMarkdown` | `ai:summarize` |
| `ai.summarizeMarkdown` | `ai:summarize` |
| `commands.run` | `commands:run` plus command-specific capability |

Open question for orchestrator:

- `history.get` without content may require `history:search` or a new explicit capability. Prefer not adding new capability unless needed.

Verify:

- Rust tests for missing capability.
- Existing script action tests still pass.

## Phase 3: Capability Contract

Preferred incremental approach:

1. Create shared JSON or generated source for supported script capabilities.
2. Update frontend to consume it.
3. Add Rust test or build-time include to compare with Rust support list.
4. Update AI planner to read same list only if the runtime path remains simple.

Do not over-engineer codegen in first pass. A failing test that catches drift is acceptable.

## Phase 4: Runner Timeout

Scope: `src-tauri/src/actions.rs`, maybe one synthetic script fixture.

Change:

- Add constant timeout for Node runner.
- Poll/wait with timeout.
- Kill child on timeout.
- Redact error and keep action run logging safe.

Verify:

- Unit/integration test with synthetic long-running script if existing harness supports it.
- Otherwise manual dev script with no real clipboard data.

## Phase 5: Storage Safety

Scope: `src-tauri/src/storage.rs`.

Change sequence:

1. Add test showing prune cleanup expectation for image blobs.
2. Implement cleanup without changing query contract.
3. If lock contention is touched, first extract thumbnail loading after DB rows are collected.
4. Avoid duplicate image blob writes only after prune cleanup is stable.

Verify:

- `npm run rust:test`
- Focused `cargo test storage`

## Phase 6: Mechanical Modularization

Only after previous behavior changes are green.

Rules:

- One module split per commit/change group.
- No semantic changes mixed with moves.
- Keep public APIs stable.
- Run build/test after each split.

Suggested order:

1. Extract `storage::schema` and migrations.
2. Extract `storage::blobs`.
3. Extract `storage::search`.
4. Extract `actions::capabilities`.
5. Extract `actions::host_api`.
6. Extract frontend shared contracts.

## Phase 7: Search Scalability

Do not start until storage safety is green.

Gate:

- Synthetic 50k history benchmark shows unacceptable latency, or
- UI needs ranking/advanced text search that `LIKE` cannot provide.

When gate triggers:

- Keep AI returning `SearchPlanV1`, never SQL.
- Prefer FTS5 external-content table with explicit sync tests.
- Add migration rollback/repair plan before shipping.

## Global Verification

Baseline:

```powershell
npm run build
npm run rust:test
```

Conditional:

```powershell
npm run visual:check
cd src-tauri; $env:CARGO_TARGET_DIR='target-codex-check'; cargo check
```

If a check fails:

- capture exact command and failure;
- classify as product regression vs infrastructure flake;
- do not continue to next phase until classified.

## Documentation Updates

After each phase:

- update `docs/tracks/016-architecture-hardening.md`;
- update `specs/007-architecture-hardening/tasks.md` checkboxes;
- if durable decision changes, update `docs/DECISIONS.md`;
- if generated index is needed, run `bun scripts/context-index.ts` rather than editing `docs/.generated/context-index.md` by hand.
