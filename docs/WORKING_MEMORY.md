# Working Memory

Estado vivo del proyecto. Mantener corto; no usar como transcript.

Ultima actualizacion manual: 2026-07-30. Archivo largo previo: `docs/reference/working-memory-archive-2026-06-14-pre-pi-os.md`.

## Regla

Router operativo corto. Si un detalle crece, moverlo a topic, track, spec o reference. En Pi, preferir lecturas scoped (`src`, `src-tauri/src`, `docs/topics`) y evitar `map .` salvo orientacion global.

## Foco Único De Ejecución

- **Estado:** `complete`.
- **Referencia:** `docs/tracks/032-saved-views-scenarios-independent-model.md`.
- **Siguiente acción:** ninguna requerida; `v0.4.2` está publicada, instalada localmente y verificada.

## Lectura Rapida

| Area | Estado | Abrir primero | Siguiente accion |
| --- | --- | --- | --- |
| Actions modularization | active | `docs/tracks/017-actions-modularization.md` | Proxima extraccion mecanica chica sin tocar runner Node. |
| Actions/scripts/hotkeys | complete | `docs/tracks/012-tags-and-hotkeys.md`, `docs/topics/tag-management-hotkeys.md`, `docs/tracks/004-actions-scripting.md` | Installer distribuye solo `030` Extract URLs y `031` Join Markdown, sin sobrescribir; ejemplos restantes quedan como fixtures del repo. |
| Future workflows | parked | `docs/tracks/019-paste-queue.md`, `docs/tracks/020-secure-clips-password.md` | Discutir antes de implementar: Paste Queue y secure clips con metadata `@pass`. |
| Search / AI / metadata | active/dogfood | `docs/topics/filtering-and-query-syntax.md`, `docs/tracks/008-filtering-search-foundation.md`, `specs/005-search-plan-engine/` | Triggers, chips/explain, diagnostico y autocomplete local de tags/operadores aplicados; luego saved searches o highlighting. |
| Performance/UI windows | active | `docs/tracks/014-performance-memory.md`, `docs/topics/custom-window-system.md`, `docs/tracks/010-ui-rethink.md`, `docs/topics/window-state-and-monitor-policy.md` | UI modularizada; proximo split seguro: `UiHostApp`; revisar `LastMonitor` si importa. |
| Open source/release | active | `docs/tracks/018-public-launch-readiness.md`, `docs/tracks/021-distribution-trust-code-signing.md`, `docs/topics/windows-installer.md` | `v0.4.2` estable publicado con instalador, firma de updater y `latest.json`; instalada local promovida y respondiendo. |
| Picker dogfood / Computer Use | active | `tests/manual/dogfood/README.md`, `docs/topics/picker-interaction.md`, `docs/topics/pi-agentic-os.md` | Mantener oracle C0: app externa -> hotkey -> type sin focus manual escribe en search. |
| OS / sistema agentico | active | `docs/topics/docs-knowledge-system.md`, `docs/topics/pi-agentic-os.md`, `docs/topics/agentic-os-operations.md` | Copicu es downstream AOS; mantener ruta caliente corta. Pendiente: compactar TOPICS/topics grandes cuando molesten. |

## Specs Activas

`004-actions-scripting-api`, `005-search-plan-engine`, `006-tags-and-hotkeys` y draft `008-clipboard-enrichment`. Abrir el directorio `specs/<id>/` solo si el pedido lo requiere.

## Decisiones Vigentes

Copicu es CopyQ-inspired (no compatible), stack Tauri 2 + React/Vite/TS + Rust + SQLite, UI keyboard-first y rapida. `Clipboard capture` puede pausarse desde Settings o tray sin detener el watcher ni bloquear copy/paste manual de items existentes. Instalada diaria: `%APPDATA%\dev.jpsala.copicu`; dev aislado: `.codex-run\dev-isolated`; release estable `v0.4.2`; sin candidate posterior activo. Scripts/AI usan host APIs/capabilities, no SQL/shell/fs/network crudo. Clipboard enrichment v1 es interna post-capture; `metadata` standalone queda `CachedHidden` + prewarm salvo evidencia. Skills canonicas en `docs/skills/`; `.agents/skills` es compatibilidad. Copicu es downstream AOS: no copiar registry/memoria/tracks/decisiones del kit; memoria durable vive en docs versionados. Para UI, abrir `docs/topics/ui-design-and-impeccable.md`.

## Riesgos / Pendientes Tecnicos

Updater: trust root rotada en `v0.3.7`; `<=0.3.6` requiere instalacion manual. Clave local en `.codex-run/secrets/copicu-updater.*`; falta backup externo. Hang instalada: revisar `%APPDATA%\dev.jpsala.copicu\diagnostics.jsonl` antes de reiniciar. Evitar colisiones instalada/dev en shortcuts/autostart; `Ctrl+Shift+C` es el editor global app-owned de metadata del item activo y queda reservado contra scripts. Dogfood/dev: `npm run dev:restart`/built-dev; si target frio falla por `WebView2Loader.dll`, ver `docs/DEVELOPMENT.md`. Enrichment `026` pendiente por `Ctrl+Alt+E`. Picker dev sincronizado: `Ctrl+Alt+C`; `Shift+Delete` borra seleccion, no usar no-activate default. Pi lento: usar scopes y evitar docs hot grandes/referencias/monolitos salvo necesidad.

## Comandos De Contexto

OS: `bun run context:index`, `bun run context:audit`.
Producto segun riesgo: `npm run build`, cargo/Tauri tests, `node --test tests/ai-query-planner.test.mjs`, `npm run rust:test`, `mise run release-vite-chunk-check`, perf/visual focalizado. Release/instalada: `npm run install:current`, `npm run release:windows`.

## Promocion De Memoria

1. Regla critica -> `AGENTS.md`.
2. Estado vivo -> `WORKING_MEMORY.md`.
3. Conocimiento reusable -> `docs/topics/<topic>.md`.
4. Decision durable -> `docs/DECISIONS.md`.
5. Trabajo retomable -> `docs/tracks/`, sin transcript.
