# Working Memory

Estado vivo del proyecto. Mantener corto; no usar como transcript.

Ultima actualizacion manual: 2026-07-10. Archivo largo previo: `docs/reference/working-memory-archive-2026-06-14-pre-pi-os.md`.

## Regla

Router operativo corto. Si un detalle crece, moverlo a topic, track, spec o reference. En Pi, preferir lecturas scoped (`src`, `src-tauri/src`, `docs/topics`) y evitar `map .` salvo orientacion global.

## Lectura Rapida

| Area | Estado | Abrir primero | Siguiente accion |
| --- | --- | --- | --- |
| Actions modularization | active | `docs/tracks/017-actions-modularization.md` | Proxima extraccion mecanica chica sin tocar runner Node. |
| Actions/scripts/hotkeys | active/validated | `docs/tracks/004-actions-scripting.md`, `docs/tracks/012-tags-and-hotkeys.md` | `Ctrl+Alt+Q` Quick Actions contextual; Open URL solo con URL; texto legacy sin MIME = text/plain. Showcase `028`-`031`, `010`. |
| Future workflows | parked | `docs/tracks/019-paste-queue.md`, `docs/tracks/020-secure-clips-password.md` | Discutir antes de implementar: Paste Queue y secure clips con metadata `@pass`. |
| Search / AI / metadata | active/dogfood | `docs/topics/filtering-and-query-syntax.md`, `docs/tracks/008-filtering-search-foundation.md`, `specs/005-search-plan-engine/` | Triggers, chips/explain y diagnostico sintactico listos. Autocomplete local esta en worktree y requiere validacion independiente antes de marcarlo aplicado; luego saved searches o highlighting. |
| Performance/UI windows | active | `docs/tracks/014-performance-memory.md`, `docs/topics/custom-window-system.md`, `docs/tracks/010-ui-rethink.md`, `docs/topics/window-state-and-monitor-policy.md` | UI modularizada; proximo split seguro: `UiHostApp`; revisar `LastMonitor` si importa. |
| Open source/release | active | `docs/tracks/018-public-launch-readiness.md`, `docs/tracks/021-distribution-trust-code-signing.md`, `docs/topics/windows-installer.md` | `v0.3.7`; `<=0.3.6` requiere salto manual por rotacion updater. Proximo: backup de clave y Authenticode/SignPath. |
| Picker dogfood / Computer Use | active | `tests/manual/dogfood/README.md`, `docs/topics/picker-interaction.md`, `docs/topics/pi-agentic-os.md` | Mantener oracle C0: app externa -> hotkey -> type sin focus manual escribe en search. |
| OS / sistema agentico | active | `docs/topics/docs-knowledge-system.md`, `docs/topics/pi-agentic-os.md`, `docs/topics/agentic-os-operations.md` | Copicu es downstream AOS; mantener ruta caliente corta. Pendiente: compactar TOPICS/topics grandes cuando molesten. |

## Specs Activas

`004-actions-scripting-api`, `005-search-plan-engine`, `006-tags-and-hotkeys` y draft `008-clipboard-enrichment`. Abrir el directorio `specs/<id>/` solo si el pedido lo requiere.

## Decisiones Vigentes

Copicu es CopyQ-inspired (no compatible), stack Tauri 2 + React/Vite/TS + Rust + SQLite, UI keyboard-first y rapida. Instalada diaria: `%APPDATA%\dev.jpsala.copicu`; dev aislado: `.codex-run\dev-isolated`; release vigente `v0.3.7` (SHA256 `C3629D6229A04BCFCDA41BDA7F5D969CC8F1E6FF8417A5490906223B447BBAAC`). Scripts/AI usan host APIs/capabilities, no SQL/shell/fs/network crudo. Clipboard enrichment v1 es interna post-capture; `metadata` standalone queda `CachedHidden` + prewarm salvo evidencia. Skills canonicas en `docs/skills/`; `.agents/skills` es compatibilidad. Copicu es downstream AOS: no copiar registry/memoria/tracks/decisiones del kit; memoria durable vive en docs versionados. Para UI, abrir `docs/topics/ui-design-and-impeccable.md`.

## Riesgos / Pendientes Tecnicos

Updater: trust root rotada en `v0.3.7`; `<=0.3.6` requiere instalacion manual. Clave local en `.codex-run/secrets/copicu-updater.*`; falta backup externo. Hang instalada: revisar `%APPDATA%\dev.jpsala.copicu\diagnostics.jsonl` antes de reiniciar. Evitar colisiones instalada/dev en shortcuts/autostart; `Ctrl+Shift+C` metadata no depende de `examples.assignMetadataToActive`. Dogfood/dev: `npm run dev:restart`/built-dev; si target frio falla por `WebView2Loader.dll`, ver `docs/DEVELOPMENT.md`. Enrichment `026` pendiente por `Ctrl+Alt+E`. Picker: `Ctrl+Shift+.` foco, `Shift+Delete` borra seleccion, no usar no-activate default. Pi lento: usar scopes y evitar docs hot grandes/referencias/monolitos salvo necesidad.

## Comandos De Contexto

OS: `bun run context:index`, `bun run context:audit`.
Producto segun riesgo: `npm run build`, cargo/Tauri tests, `node --test tests/ai-query-planner.test.mjs`, `npm run rust:test`, `mise run release-vite-chunk-check`, perf/visual focalizado. Release/instalada: `npm run install:current`, `npm run release:windows`.

## Proximo Paso Probable

1. Retomar `docs/tracks/021-distribution-trust-code-signing.md`: auditar requisitos SignPath y diseñar release CI verificable para firmar instaladores Windows.
2. Dogfood instalada `v0.3.7`: Settings/autostart; el proximo corte debe validar updater desde esta nueva trust root.
3. UX picker/search: validar el autocomplete local pendiente (diff, build, visual focal/full, Rust, CUA: Tab/Escape/Enter/click y narrow) antes de marcarlo aplicado. Luego evaluar saved searches o highlighting. Scrollbar total real requiere contrato backend/windowing.
4. Si hay hang/lentitud: diagnosticar con `diagnostics.jsonl`, memoria/procesos y repro antes de cambiar codigo; si es Pi/contexto, compactar ruta caliente y usar `map/search` scoped.

## Promocion De Memoria

1. Regla critica -> `AGENTS.md`.
2. Estado vivo -> `WORKING_MEMORY.md`.
3. Conocimiento reusable -> `docs/topics/<topic>.md`.
4. Decision durable -> `docs/DECISIONS.md`.
5. Trabajo retomable -> `docs/tracks/`, sin transcript.

- Continuidad Pi 2026-07-04: JP guarda primero con `/aos-guardar-sesion`; luego `/aos-continuar [objetivo]` es el unico comando para abrir sesion nueva con prompt de continuidad desde docs vivos. `--preview` permite revisar antes de enviar.
