# Working Memory

Estado vivo del proyecto. Mantener corto; no usar como transcript.

Ultima actualizacion manual: 2026-06-29.

Archivo largo previo: `docs/reference/working-memory-archive-2026-06-14-pre-pi-os.md`.

## Regla

Este archivo es router operativo. Si un detalle crece, moverlo a topic, track, spec o reference. Para auditorias lentas en Pi, preferir lecturas scoped (`src`, `src-tauri/src`, `docs/topics`) y evitar `map .` salvo orientacion global.

## Lectura Rapida

| Area | Estado | Abrir primero | Siguiente accion |
| --- | --- | --- | --- |
| Actions modularization | active | `docs/tracks/017-actions-modularization.md` | Proxima extraccion mecanica chica sin tocar runner Node. |
| Actions/scripts/hotkeys | active/validated | `docs/tracks/004-actions-scripting.md`, `docs/tracks/012-tags-and-hotkeys.md` | `Ctrl+Alt+Q` abre Quick Actions contextual; filtra Open URL solo si hay URL y trata texto legacy sin MIME como text/plain. Showcase scripts (`028`-`031`, `010`) documentado. |
| Future workflows | parked | `docs/tracks/019-paste-queue.md`, `docs/tracks/020-secure-clips-password.md` | Ideas guardadas para discutir antes de implementar: Paste Queue y secure clips con metadata `@pass`. |
| Search / AI / metadata | active/validated | `docs/topics/filtering-and-query-syntax.md`, `docs/tracks/008-filtering-search-foundation.md`, `docs/topics/picker-interaction.md` | Scoped search `meta:/title:/notes:/ctx:`, ayuda in-app y trigger modes validados en instalada. Proximo: chips/explain UI o whole-word search si JP lo prioriza. |
| Performance/UI windows | active | `docs/tracks/014-performance-memory.md`, `docs/topics/custom-window-system.md`, `docs/tracks/010-ui-rethink.md`, `docs/topics/window-state-and-monitor-policy.md` | UI modularizada; proximo split seguro: `UiHostApp`. Revisar `LastMonitor` si importa restaurar exactamente en ultimo monitor. |
| Open source/release | active | `docs/tracks/018-public-launch-readiness.md`, `docs/tracks/013-open-source-growth.md`, `docs/topics/windows-installer.md` | `v0.3.0` publicado; showcase scripts/docs first slice listo. Proximo: dogfood instalada/update, demo assets sinteticos o feedback real. |
| Picker dogfood / Computer Use | active | `tests/manual/dogfood/README.md`, `docs/topics/picker-interaction.md`, `docs/topics/pi-agentic-os.md` | Mantener oracle C0: app externa -> hotkey -> type sin focus manual escribe en search. |
| OS / sistema agentico | active | `docs/topics/docs-knowledge-system.md`, `docs/topics/pi-agentic-os.md`, `docs/topics/agentic-os-operations.md` | Copicu es downstream AOS; mantener ruta caliente corta. Pendiente: compactar TOPICS/topics grandes cuando molesten. |

## Specs Activas

| Spec | Estado | Abrir |
| --- | --- | --- |
| `004-actions-scripting-api` | active | `specs/004-actions-scripting-api/spec.md` |
| `005-search-plan-engine` | active | `specs/005-search-plan-engine/spec.md` |
| `006-tags-and-hotkeys` | active | `specs/006-tags-and-hotkeys/tasks.md` |
| `008-clipboard-enrichment` | draft | `specs/008-clipboard-enrichment/spec.md` |

## Decisiones Vigentes

- Copicu es CopyQ-inspired, no CopyQ-compatible.
- Stack vigente: Tauri 2, React/Vite/TypeScript, Rust, SQLite, Mantine donde aporta.
- Priorizar velocidad/latencia percibida; aceptar coste razonable de memoria si evita romper el picker caliente.
- Instalada diaria: `%APPDATA%\dev.jpsala.copicu`; dev aislado: `.codex-run\dev-isolated`.
- Release Windows vigente: `v0.3.0`; release/tag apunta a `ef4192a`, `main`/`origin/main` a `7b9dda4` tras docs post-release.
- Scripts/AI usan host APIs/capabilities; no SQL/shell/fs/network crudo.
- Clipboard enrichment v1 es logica interna post-capture, no scripting-first.
- `metadata` standalone queda `CachedHidden` + prewarm salvo evidencia de coste extremo.
- Skills canonicas: `docs/skills/`; `.agents/skills` es compatibilidad.
- Copicu es downstream AOS: no copiar registry global, decisiones/tracks/memoria del kit ni inventarios.
- Memoria durable vive en docs versionados; Pi compaction/memoria automatica no reemplaza docs.
- Para UI relevante abrir `docs/topics/ui-design-and-impeccable.md`.

## Riesgos / Pendientes Tecnicos

- Updater: respaldar fuera del repo `.codex-run/secrets/copicu-updater.key` y `.codex-run/secrets/copicu-updater.password`.
- Hang instalada: si reaparece, revisar `%APPDATA%\dev.jpsala.copicu\diagnostics.jsonl` antes de reiniciar; dump previo en `.codex-run\hang-dumps\copicu-installed-hung-20260623-113818.dmp`.
- Shortcuts globales: evitar colisiones instalada/dev y preferir ruta nativa para hotkeys criticas; `Ctrl+Shift+C` metadata no debe volver a depender del script `examples.assignMetadataToActive`.
- Dogfood dev: usar `npm run dev:restart` / built-dev si `tauri dev` varía.
- Enrichment: pendiente dogfood `026` por `Ctrl+Alt+E`; policy manual `{ apply: true }`.
- Picker: `Ctrl+Shift+.` abre con foco; `Shift+Delete` borra seleccion; no usar no-activate como default.
- Pi lento en este repo: causas conocidas son hot docs largas, `docs/skills/impeccable/`, referencias historicas y monolitos (`src/main.tsx`, `src-tauri/src/lib.rs`, `storage.rs`). Usar herramientas scoped y no abrir docs largas salvo necesidad.

## Comandos De Contexto

```powershell
bun run context:index
bun run context:audit
mise run release-vite-chunk-check
npm run perf:windows -- -AppDataDir .codex-run\perf-memory-20260611\app-data-10k -SkipBuild
npm run install:current
npm run release:windows
```

Checks de producto de referencia: `npm run build`, `cargo check --manifest-path src-tauri/Cargo.toml --tests`, `cargo test --manifest-path src-tauri/Cargo.toml --lib --no-run`, `node --test tests/ai-query-planner.test.mjs` cuando cambia AI search, `npm run rust:test` si el entorno lo permite, visual focalizado/full segun riesgo.

## Proximo Paso Probable

1. Dogfood instalada/update de `v0.3.0`; si JP quiere, ejecutar `npm run install:current` o validar updater desde instalada.
2. Si JP sigue con UX del picker/search: discutir o implementar el siguiente corte chico (chips/explain UI, whole-word search o polish visual de ayuda) sin tocar el runner Node.
3. Si reaparece un hang/lentitud real de la app: diagnosticar con `diagnostics.jsonl`, memoria/procesos y repro antes de cambiar codigo.
4. Si el problema es Pi/contexto: compactar ruta caliente, usar `map/search` scoped y evitar `docs/skills/impeccable/` salvo UI/impeccable.
5. Si se toca producto: correr build/checks focalizados y relanzar app dev/instalada segun corresponda.

## Promocion De Memoria

1. Regla critica -> `AGENTS.md`.
2. Estado vivo -> `WORKING_MEMORY.md`.
3. Conocimiento reusable -> `docs/topics/<topic>.md`.
4. Decision durable -> `docs/DECISIONS.md`.
5. Trabajo retomable -> `docs/tracks/`, sin transcript.
