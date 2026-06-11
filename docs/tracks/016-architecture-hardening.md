---
id: architecture-hardening
status: complete
updated: 2026-06-10
spec: ../../specs/007-architecture-hardening/spec.md
plan: ../../specs/007-architecture-hardening/plan.md
tasks: ../../specs/007-architecture-hardening/tasks.md
orchestration: ../../specs/007-architecture-hardening/orchestration.md
---

# Architecture Hardening

## Estado

Architecture Hardening completado. El objetivo fue no redisenar el producto, sino convertir hallazgos concretos de arquitectura en una secuencia segura de cambios chicos, verificables y delegables.

Este trabajo debe retomarse desde:

1. `docs/tracks/016-architecture-hardening.md`
2. `specs/007-architecture-hardening/orchestration.md`
3. `specs/007-architecture-hardening/tasks.md`
4. codigo puntual de cada tarea

No abrir specs largas ni documentos historicos salvo que una tarea lo pida.

## Prompt De Arranque Para La Proxima Sesion

```text
Arranquemos Architecture Hardening.

Abrir primero:
- docs/tracks/016-architecture-hardening.md
- specs/007-architecture-hardening/orchestration.md
- specs/007-architecture-hardening/tasks.md

Actua como orquestador: dividi tareas chicas, usa subagentes solo para scopes disjuntos y revisa e integra todo vos. No delegues decisiones de arquitectura grandes. Despues de cada fase, corre los checks definidos y actualiza el estado del handoff.
```

## Principios

- Mantener el stack vigente: Tauri 2, React/Vite/TypeScript, Rust y SQLite.
- No persistir contenido real del clipboard en docs, logs, tests o fixtures.
- No hacer refactors grandes sin un test o check que demuestre comportamiento equivalente.
- No tocar archivos no relacionados ni revertir cambios locales existentes.
- Subagentes solo reciben scopes chicos, con ownership de archivos y acceptance criteria.
- El orquestador revisa todo diff antes de considerar una tarea cerrada.

## Hallazgos Que Motivan Este Trabajo

- Cerrado en Fase 1: `src/main.tsx` registraba `PICKER_FILTER_EVENT` solo cuando diagnostics estaba habilitado; `picker.open({ query })` podia no filtrar en produccion.
- Cerrado en Fase 1: `src-tauri/src/window_state.rs` conocia la ventana `whichkey`, pero `src-tauri/capabilities/default.json` no la listaba.
- Cerrado en Fase 3 con drift test: las script capabilities estaban duplicadas en Rust, frontend principal, ventanas secundarias y planner AI.
- Cerrado en Fase 2: el dispatcher de script host no aplicaba una tabla central `host method -> required capability`.
- Cerrado en Fase 4: el runner Node esperaba el proceso sin timeout/cancelacion clara.
- Cerrado en Fase 5: el prune de historial borraba filas image sin limpiar blob/thumbnail asociados.
- Cerrado en Fase 5: `query_items` cargaba thumbnails/base64 mientras el caller seguia sosteniendo el lock DB.
- Cerrado en Fase 5: `insert_image` escribia blobs antes de verificar duplicado.
- Reducido en Fase 6: `storage.rs` separo migraciones, blobs y search/SearchPlan en modulos privados.
- Reducido en Fase 6: `actions.rs` separo capabilities y dispatch de host API en modulos privados.
- Decidido en Fase 7: FTS5 queda diferido; el benchmark sintetico 50k no justifica introducirlo todavia.

## Fases

### Fase 1: Quick Wins

Objetivo: cerrar bugs de bajo riesgo antes de modularizar.

- Fix del listener `PICKER_FILTER_EVENT`.
- Alinear capabilities/window labels para `whichkey`.
- Verificar con `npm run build` y, si aplica, checks Rust livianos.

### Fase 2: Script Host Boundary

Objetivo: que las capabilities sean el limite real.

- Centralizar vocabulario de capabilities.
- Agregar gateway `host method -> required capabilities`.
- Agregar tests para denial path y allowed path.
- No cambiar protocolo JS salvo que sea necesario.

### Fase 3: Capability Contract Drift

Objetivo: evitar que Rust, frontend principal, ventanas secundarias y planner AI diverjan silenciosamente.

- Agregar fuente compartida o drift test.
- Corregir drift existente si aparece.
- Verificar con build y check/test relevante.

### Fase 4: Runner Resilience

Objetivo: que un script colgado no bloquee indefinidamente una accion.

- Agregar timeout configurable/constante para Node runner.
- Matar child process en timeout.
- Registrar resultado redacted.
- Testear timeout sin depender de contenido real.

### Fase 5: Storage Safety

Objetivo: reducir leaks de blobs y lock contention sin cambiar la UX.

- Cleanup de blobs al podar historial.
- No leer thumbnails mientras se sostiene el lock principal si se puede evitar.
- Evitar escrituras de blobs para imagen duplicada cuando sea viable.
- Mantener WAL y contrato de DTO vigente.

### Fase 6: Mechanical Modularization

Objetivo: bajar el riesgo de archivos gigantes sin cambiar comportamiento.

- Separar `storage.rs` en modulos internos.
- Separar `actions.rs` en discovery/runtime/host API/capabilities.
- Separar `main.tsx` en shared contracts, hooks y componentes solo si los tests/build quedan verdes.

### Fase 7: Search Scalability

Objetivo: preparar FTS5/SearchPlan completo, no implementarlo por impulso.

- Terminar `SearchPlanV1` como contrato comun.
- Definir gate medible para FTS5: 50k+ items sinteticos, latencia por keypress o ranking real.
- Mantener AI sin SQL crudo.

## Verification Matrix

Checks base:

```powershell
npm run build
npm run rust:test
```

Checks condicionales:

- UI visible o surfaces: `npm run visual:check`
- Rust-only low risk: `cd src-tauri; $env:CARGO_TARGET_DIR='target-codex-check'; cargo check`
- Search/storage cambios: agregar o correr tests Rust especificos de `storage`
- Script host cambios: tests Rust de `actions` y al menos un script sintetico si existe harness

## Estado De Ejecucion

- [X] Fase 1 quick wins ejecutada.
- [X] Fase 2 script host boundary ejecutada.
- [X] Fase 3 capability contract drift ejecutada.
- [X] Fase 4 runner resilience ejecutada.
- [X] Fase 5 storage safety ejecutada.
- [X] Fase 6 modularization ejecutada.
- [X] Fase 7 search scalability planificada o explicitamente diferida.
- [X] Fase 8 closeout ejecutada.

## Registro De Checks

2026-06-10 Fase 1:

- `npm run build` paso.
- `cd src-tauri; $env:CARGO_TARGET_DIR='target-codex-check'; cargo check` paso.
- `npm run rust:test` fallo inicialmente antes de ejecutar assertions por lock de `src-tauri/target/release/WebView2Loader.dll` (`os error 32`).
- Reintento inicial con `$env:CARGO_TARGET_DIR='target-codex-check'; npm run rust:test` compilo, pero el binario de tests salio con `STATUS_ENTRYPOINT_NOT_FOUND`; resuelto durante Fase 2 con manifest Common Controls v6 para tests Windows/GNU.
- Subagente usado solo para el scope disjunto de `src-tauri/capabilities/default.json`; el orquestador reviso el diff e integro el cambio generado en `src-tauri/gen/schemas/capabilities.json`.

2026-06-10 Fase 2:

- Implementado gateway central `host method -> required capability` en `src-tauri/src/actions.rs`.
- El dispatch de host calls valida capabilities antes de ejecutar efectos para `history.search`, `history.get`, `history.update`, `history.remove`, `clipboard.read`, `ui.alert`, `ui.confirm`, `ui.input`, `ai.respondMarkdown`, `ai.summarizeMarkdown` y `commands.run`.
- Se preservo el check especifico de `commands.run("picker.open") -> picker:open`.
- Agregados tests unitarios puros para denial de `history.remove`, `clipboard.read` y `picker.open`, mas allowed paths basicos.
- `cargo fmt` paso.
- `cd src-tauri; $env:CARGO_TARGET_DIR='target-codex-check'; cargo check` paso.
- `npm run build` paso.
- Diagnostico del harness: el binario de tests Windows/GNU importaba `TaskDialogIndirect` desde `comctl32.dll` sin manifest Common Controls v6; eso producia `STATUS_ENTRYPOINT_NOT_FOUND` antes de ejecutar tests.
- `tests/manual/run-rust-tests.ps1` ahora usa `target-codex-test` por defecto para evitar locks de `cargo run`, genera un manifest Common Controls v6 con `windres` en Windows/GNU y lo pasa por `RUSTFLAGS`.
- `npm run rust:test` paso: 70 tests verdes, incluyendo los tests nuevos de `actions`.
- Subagente usado solo como explorador sin ediciones; el orquestador implemento e integro `src-tauri/src/actions.rs`.

2026-06-10 Fase 3:

- Agregado drift test `tests/script-capabilities-drift.test.mjs` para comparar el vocabulario de script capabilities entre `src-tauri/src/actions.rs`, `src/main.tsx`, `src/windows/secondaryWindows.tsx` y `scripts/ai-script-planner.mjs`.
- Agregado script `npm run capabilities:drift:test`.
- Corregido drift real: `ai:summarize` existia en Rust/planner pero faltaba en `SUPPORTED_SCRIPT_CAPABILITIES` de `src/main.tsx` y `src/windows/secondaryWindows.tsx`.
- Se eligio drift test como corte minimo; una fuente compartida JSON/TS/Rust queda diferida para modularizacion si aporta.
- `npm run capabilities:drift:test` paso.
- `npm run ai:planner:test` paso.
- `npm run build` paso.
- `cd src-tauri; $env:CARGO_TARGET_DIR='target-codex-check'; cargo check` paso.
- Subagente usado solo como explorador sin ediciones.

2026-06-10 Fase 4:

- Agregado timeout Rust-only `SCRIPT_RUNNER_TIMEOUT` al path de `run_node_script_runner` en `src-tauri/src/actions.rs`.
- El runner ya no bloquea indefinidamente en `stdout.lines()`; stdout se lee en un thread y el loop principal usa deadline/`recv_timeout`.
- En timeout se mata y espera el child process, se cierran pipes y se devuelve error fijo `script runner timed out after ...ms` sin stderr, script source, payload ni contenido de clipboard.
- La espera posterior a recibir `result` tambien usa deadline antes de hacer join del stdout reader, evitando deadlock si Node emite resultado pero no sale.
- Agregado test sintetico `script_runner_wait_timeout_kills_synthetic_child`, sin clipboard ni scripts reales.
- No se cambio el API shape de scripts ni el protocolo JS.
- `cargo fmt` paso.
- `cd src-tauri; $env:CARGO_TARGET_DIR='target-codex-check'; cargo check` paso.
- `cd src-tauri; cargo test actions` paso con 14 tests.
- `npm run build` paso.
- `npm run rust:test` paso: 71 tests verdes.
- Subagente usado solo como explorador sin ediciones.

2026-06-10 Fase 5:

- Agregado test sintetico `prune_history_removes_image_blob_and_thumbnail_files` en `src-tauri/src/storage.rs`.
- `prune_history_from_conn` ahora devuelve rutas de blob/thumbnail pruned; el cleanup valida que la ruta ya no este referenciada antes de borrar el archivo.
- La carga de `thumbnail_data_url` queda fuera del wrapper SQL y se adjunta despues de soltar el lock en `list_recent`, `history_search`, `get_item` y `search`.
- `insert_image` verifica duplicados antes de escribir blobs; si no hay duplicado, mantiene el flujo de escritura e insert vigentes.
- No se cambiaron campos de `HistoryItem`, semantica de search ni contrato DTO.
- `cargo fmt` paso.
- `cd src-tauri; $env:CARGO_TARGET_DIR='target-codex-check'; cargo test storage` paso: 30 tests verdes.
- `npm run rust:test` paso: 72 tests verdes.
- `npm run build` paso.
- No se usaron subagentes; el scope fue local y concentrado en `src-tauri/src/storage.rs`.

2026-06-10 Fase 6:

- Extraidas migraciones/schema a `src-tauri/src/storage/schema.rs`, manteniendo `crate::storage` como API publica.
- Extraidos helpers de blobs a `src-tauri/src/storage/blobs.rs`.
- Extraidos `SearchPlanV1`, parser/compilador de busqueda y helpers de paginacion/fechas a `src-tauri/src/storage/search.rs`, con reexports desde `storage.rs`.
- Extraidas capabilities de scripts a `src-tauri/src/actions/capabilities.rs`.
- Extraido dispatch de host API a `src-tauri/src/actions/host_api.rs`; los handlers y protocolo quedan sin cambios.
- Actualizado `tests/script-capabilities-drift.test.mjs` para leer el vocabulario Rust desde el nuevo modulo de capabilities.
- `cargo fmt` paso.
- `cd src-tauri; $env:CARGO_TARGET_DIR='target-codex-check'; cargo test storage` paso: 30 tests verdes.
- `cd src-tauri; $env:CARGO_TARGET_DIR='target-codex-check'; cargo test actions` paso: 14 tests verdes.
- `npm run rust:test` paso: 72 tests verdes.
- `npm run capabilities:drift:test` paso.
- `npm run build` paso.
- No se usaron subagentes; las extracciones fueron mecanicas y revisadas localmente.

2026-06-10 Fase 7:

- Agregado benchmark ignorado `synthetic_50k_history_search_benchmark` en `src-tauri/src/storage.rs`.
- Dataset: 50k items sinteticos, 500 matches de `phase7-target-needle`, sin contenido real de clipboard.
- Resultado en esta maquina: `insert_ms=448`, `recent_ms=130`, `target_ms=69`, `counted_target_ms=139`.
- Decision: FTS5 diferido. El search estructurado actual es suficiente para el corte 50k sintetico; reconsiderar FTS5 solo con evidencia de latencia por keypress, ranking requerido o datasets mayores.
- `SearchPlanV1` sigue siendo el contrato comun para busqueda planificada.
- Verificado que el planner AI mantiene la prohibicion de SQL y usa `copicu.history.search(...)`, no SQL crudo.
- `cd src-tauri; $env:CARGO_TARGET_DIR='target-codex-check'; cargo test synthetic_50k_history_search_benchmark -- --ignored --nocapture` paso.
- `cd src-tauri; $env:CARGO_TARGET_DIR='target-codex-check'; cargo test storage` paso: 30 tests verdes, 1 ignored.

2026-06-10 Fase 8:

- Actualizado `docs/DECISIONS.md`: FTS5 y ranking de busqueda pasa de `pending` a `deferred` con el resultado del benchmark 50k.
- `npm run build` paso.
- `npm run rust:test` paso: 72 tests verdes, 1 ignored (`synthetic_50k_history_search_benchmark`).
- `npm run capabilities:drift:test` paso.
- `npm run context:index` paso.

## Proximo Corte

Architecture Hardening queda cerrado. El proximo trabajo debe arrancar desde una nueva spec o un track puntual, no desde este handoff.
