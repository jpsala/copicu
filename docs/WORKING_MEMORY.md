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

`004-actions-scripting-api`, `005-search-plan-engine`, `006-tags-and-hotkeys` y draft `008-clipboard-enrichment`. Abrir el directorio `specs/<id>/` solo si el pedido lo requiere.

## Decisiones Vigentes

Copicu es CopyQ-inspired (no compatible), stack Tauri 2 + React/Vite/TS + Rust + SQLite, UI keyboard-first y rapida. Instalada diaria: `%APPDATA%\dev.jpsala.copicu`; dev aislado: `.codex-run\dev-isolated`; release vigente `v0.3.2` (`ce27b55`). Scripts/AI usan host APIs/capabilities, no SQL/shell/fs/network crudo. Clipboard enrichment v1 es interna post-capture; `metadata` standalone queda `CachedHidden` + prewarm salvo evidencia. Skills canonicas en `docs/skills/`; `.agents/skills` es compatibilidad. Copicu es downstream AOS: no copiar registry/memoria/tracks/decisiones del kit; memoria durable vive en docs versionados. Para UI, abrir `docs/topics/ui-design-and-impeccable.md`.

## Riesgos / Pendientes Tecnicos

Updater: secretos fuera del repo en `.codex-run/secrets/copicu-updater.*`. Hang instalada: revisar `%APPDATA%\dev.jpsala.copicu\diagnostics.jsonl` antes de reiniciar. Evitar colisiones instalada/dev en shortcuts/autostart; `Ctrl+Shift+C` metadata no depende de `examples.assignMetadataToActive`. Dogfood/dev: `npm run dev:restart` o built-dev; enrichment `026` pendiente por `Ctrl+Alt+E`. Picker: `Ctrl+Shift+.` foco, `Shift+Delete` borra seleccion, no usar no-activate default. Pi lento: usar scopes y evitar docs hot grandes/referencias/monolitos salvo necesidad.

## Comandos De Contexto

OS: `bun run context:index`, `bun run context:audit`.
Producto segun riesgo: `npm run build`, cargo/Tauri tests, `node --test tests/ai-query-planner.test.mjs`, `npm run rust:test`, `mise run release-vite-chunk-check`, perf/visual focalizado. Release/instalada: `npm run install:current`, `npm run release:windows`.

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
- Continuidad Pi 2026-07-04: JP guarda primero con `/aos-guardar-sesion`; luego `/aos-continuar [objetivo]` es el unico comando para abrir sesion nueva con prompt de continuidad desde docs vivos. `--preview` permite revisar antes de enviar.
