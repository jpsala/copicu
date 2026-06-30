# Working Memory

Estado vivo del proyecto. Mantener corto; no usar como transcript.

Ultima actualizacion manual: 2026-06-30. Archivo largo previo: `docs/reference/working-memory-archive-2026-06-14-pre-pi-os.md`.

## Regla

Router operativo corto. Si un detalle crece, moverlo a topic, track, spec o reference. En Pi, preferir lecturas scoped (`src`, `src-tauri/src`, `docs/topics`) y evitar `map .` salvo orientacion global.

## Lectura Rapida

| Area | Estado | Abrir primero | Siguiente accion |
| --- | --- | --- | --- |
| Actions modularization | active | `docs/tracks/017-actions-modularization.md` | Proxima extraccion mecanica chica sin tocar runner Node. |
| Actions/scripts/hotkeys | active/validated | `docs/tracks/004-actions-scripting.md`, `docs/tracks/012-tags-and-hotkeys.md` | `Ctrl+Alt+Q` Quick Actions contextual; Open URL solo con URL; texto legacy sin MIME = text/plain. Showcase `028`-`031`, `010`. |
| Future workflows | parked | `docs/tracks/019-paste-queue.md`, `docs/tracks/020-secure-clips-password.md` | Discutir antes de implementar: Paste Queue y secure clips con metadata `@pass`. |
| Search / AI / metadata | active/validated | `docs/topics/filtering-and-query-syntax.md`, `docs/tracks/008-filtering-search-foundation.md`, `docs/topics/picker-interaction.md` | Scoped search y ayuda in-app validados. Proximo: chips/explain UI o whole-word search si JP prioriza. |
| Performance/UI windows | active | `docs/tracks/014-performance-memory.md`, `docs/topics/custom-window-system.md`, `docs/tracks/010-ui-rethink.md`, `docs/topics/window-state-and-monitor-policy.md` | UI modularizada; proximo split seguro: `UiHostApp`; revisar `LastMonitor` si importa. |
| Open source/release | active | `docs/tracks/018-public-launch-readiness.md`, `docs/tracks/021-distribution-trust-code-signing.md`, `docs/topics/windows-installer.md` | `v0.3.2` publicado; instalada local relanzada. Proximo urgente: signing/trust track para reducir warnings de instalacion; luego dogfood/update, demo assets o feedback real. |
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
- Release Windows vigente: `v0.3.2` (`ce27b55`); `main`/`origin/main` esta despues del corte con docs post-release; autostart hardening instalado localmente.
- Scripts/AI usan host APIs/capabilities; no SQL/shell/fs/network crudo.
- Clipboard enrichment v1 es interna post-capture; `metadata` standalone queda `CachedHidden` + prewarm salvo evidencia de coste extremo.
- Skills canonicas: `docs/skills/`; `.agents/skills` es compatibilidad.
- Copicu es downstream AOS: no copiar registry global, memoria/tracks/decisiones del kit ni inventarios.
- Memoria durable vive en docs versionados; Pi compaction/memoria automatica no reemplaza docs.
- Para UI relevante abrir `docs/topics/ui-design-and-impeccable.md`.

## Riesgos / Pendientes Tecnicos

- Updater: respaldar fuera del repo `.codex-run/secrets/copicu-updater.key` y `.codex-run/secrets/copicu-updater.password`.
- Hang instalada: si reaparece, revisar `%APPDATA%\dev.jpsala.copicu\diagnostics.jsonl` antes de reiniciar; dump previo en `.codex-run\hang-dumps\copicu-installed-hung-20260623-113818.dmp`.
- Shortcuts/autostart: evitar colisiones instalada/dev; `Launch on Windows startup` lee OS real y bloquea cambios desde dev/override; `Ctrl+Shift+C` metadata no debe depender de `examples.assignMetadataToActive`.
- Dogfood dev: usar `npm run dev:restart` / built-dev si `tauri dev` varia.
- Enrichment: pendiente dogfood `026` por `Ctrl+Alt+E`; policy manual `{ apply: true }`.
- Picker: `Ctrl+Shift+.` abre con foco; `Shift+Delete` borra seleccion; no usar no-activate default.
- Pi lento: causas conocidas son hot docs, `docs/skills/impeccable/`, referencias historicas y monolitos. Usar scopes y evitar docs largas salvo necesidad.

## Comandos De Contexto

OS: `bun run context:index`, `bun run context:audit`.
Producto segun riesgo: `npm run build`, cargo check/test Tauri, `node --test tests/ai-query-planner.test.mjs`, `npm run rust:test`, `mise run release-vite-chunk-check`, `npm run perf:windows -- -AppDataDir .codex-run\perf-memory-20260611\app-data-10k -SkipBuild`, visual focalizado/full. Release/instalada: `npm run install:current`, `npm run release:windows`.

## Proximo Paso Probable

1. Retomar `docs/tracks/021-distribution-trust-code-signing.md`: auditar requisitos SignPath y diseñar release CI verificable para firmar instaladores Windows.
2. Dogfood instalada `v0.3.2`: Settings/autostart/updater desde builds previas.
3. UX picker/search: siguiente corte chico (chips/explain UI, whole-word search o polish de ayuda) sin tocar runner Node.
4. Si hay hang/lentitud: diagnosticar con `diagnostics.jsonl`, memoria/procesos y repro antes de cambiar codigo; si es Pi/contexto, compactar ruta caliente y usar `map/search` scoped.

## Promocion De Memoria

1. Regla critica -> `AGENTS.md`.
2. Estado vivo -> `WORKING_MEMORY.md`.
3. Conocimiento reusable -> `docs/topics/<topic>.md`.
4. Decision durable -> `docs/DECISIONS.md`.
5. Trabajo retomable -> `docs/tracks/`, sin transcript.
