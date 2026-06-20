# Working Memory

Estado vivo del proyecto. Mantener corto; no usar como transcript.

Ultima actualizacion manual: 2026-06-20.

Archivo largo previo: `docs/reference/working-memory-archive-2026-06-14-pre-pi-os.md`.

## Regla

Este archivo es router operativo. Si un detalle crece, moverlo a topic, track, spec o reference.

## Lectura Rapida

| Area | Estado | Abrir primero | Siguiente accion |
| --- | --- | --- | --- |
| Actions modularization | active | `docs/tracks/017-actions-modularization.md` | Proxima extraccion mecanica chica sin tocar runner Node. |
| Actions/scripts/hotkeys | active/validated | `docs/tracks/004-actions-scripting.md`, `docs/tracks/012-tags-and-hotkeys.md` | Shortcuts de scripts: flujo manual validado; patch preview opcional. |
| Performance/UI windows | active | `docs/tracks/014-performance-memory.md`, `docs/topics/custom-window-system.md`, `docs/tracks/010-ui-rethink.md` | UI modularizada en commits `af392f5`/`7b10504`; `NotificationsApp` ya separado; proximo split seguro: `UiHostApp`. |
| Open source growth | active | `docs/tracks/013-open-source-growth.md` | `main` local `ahead 5`; reintentar `git push` cuando GitHub auth funcione en Pi. |
| Dev/instalada | active | `docs/topics/windows-installer.md` | `install:current` revalidado; instalada/dev separados. |
| Picker dogfood / Computer Use | active | `tests/manual/dogfood/README.md`, `tests/manual/dogfood/PICKER_REAL_USER_STRESS_FLOW.md`, `tests/manual/dogfood/PICKER_COMPUTER_USE_FOCUS_BATTERY.md`, `docs/topics/picker-interaction.md` | Mantener oracle C0: app externa -> hotkey -> type sin focus manual debe escribir en search. |
| OS / sistema agentico | active | `docs/topics/agentic-os-operations.md`, `docs/topics/docs-knowledge-system.md`, `docs/topics/pi-agentic-os.md` | Copicu es downstream AOS: solo piezas locales aplicables, sin manager-only del upstream. Quedan warnings de TOPICS/topics grandes. |

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
- Preferir velocidad/latencia percibida; aceptar coste razonable de memoria si no es extremo.
- Instalada diaria: `%APPDATA%\dev.jpsala.copicu`; dev aislado: `.codex-run\dev-isolated`.
- Paste-to-previous-window sigue siendo el flujo nativo mas riesgoso.
- Release actual: Windows `v0.2.1`.
- Scripts/AI usan host APIs/capabilities; no SQL/shell/fs/network crudo.
- Clipboard enrichment v1 es logica interna post-capture, no scripting-first.
- `metadata` standalone queda `CachedHidden` + prewarm salvo coste extremo.
- UI relevante: abrir `docs/topics/ui-design-and-impeccable.md`.
- Skills canonicas: `docs/skills/`; `.agents/skills` es compatibilidad.
- Copicu es downstream de AOS: no copiar registry global, decisiones/tracks/memoria del kit ni inventarios; reescribir mejoras como contexto local.
- Comandos operativos: skill/prompt corto + logica durable en topic/script/doc.
- Ruta inicial liviana; no convertir hot context en transcript.
- Pi compaction no es memoria durable; valor durable va a docs versionados.
- Test Copicu en Pi: usar `copicu_computer_use`; UIA sirve poco dentro del WebView; validar foco real con screenshot de pantalla completa ademas de target screenshot. Para hotkey del picker, validar tambien keyboard-ready: tipear token sin llamada manual a `focus`.
- `pi-rtk-optimizer`: recomendado `mode: "rewrite"`; mantener `readCompaction.enabled=false` y `sourceCodeFilteringEnabled=false`.

## Riesgos / Pendientes Tecnicos

- Chunk gate: build actual sin warning; `mise run release-vite-chunk-check` protege regresion.
- Infra local: si `visual:check`/Rust focalizados fallan, contrastar con `cargo check`, build y dogfood.
- Push bloqueado mientras `gh auth status` reporte token invalido; `main` esta `ahead 2` por commits de refactor UI/Rust (`af392f5`, `7b10504`) y quedan cambios OS/.pi no mezclados en working tree.
- Shortcuts globales: evitar colisiones instalada/dev y preferir ruta nativa para hotkeys criticas.
- Dogfood dev: usar `npm run dev:restart` / built-dev si `tauri dev` varía.
- Enrichment: pendiente dogfood `026` por `Ctrl+Alt+E`; policy manual `{ apply: true }`.
- Picker stress: validar foreground real, pin/candadito y wrapper `copicu_computer_use`.
- Hotkey picker foco 2026-06-18: `Ctrl+Shift+.` abre con foco; fallback `COPICU_PICKER_NO_ACTIVATE=1`; oracle: tipear sin `focus` manual entra en search.
- Track 012 compactada; historial en `docs/reference/012-tags-and-hotkeys-archive-2026-06-14.md`.

## Comandos De Contexto

```powershell
bun run context:index
bun run context:audit
mise run release-vite-chunk-check
npm run perf:windows -- -AppDataDir .codex-run\perf-memory-20260611\app-data-10k -SkipBuild
npm run install:current
```

Comandos conversacionales y Pi locales estan documentados en `docs/topics/docs-knowledge-system.md` y `docs/topics/pi-agentic-os.md`.

## Proximo Paso Probable

Proximo lote recomendado:

1. Resolver o cerrar por separado los cambios OS/.pi pendientes (`aos-*`, `scripts/agent-context-audit.ts`, context index) sin mezclarlos con producto.
2. Continuar modularizacion UI con split chico de `UiHostApp` desde `src/windows/secondaryWindows.tsx`; `WhichKeyWindowApp` y `NotificationsApp` ya estan separados.
3. Reintentar `git push` de `main` cuando GitHub auth este arreglado en Pi (`main...origin/main [ahead 2]`).
4. Mantener como secundarios: formalizar bateria picker/Computer Use, actions modularization y patch preview de shortcuts si JP lo pide.

## Promocion De Memoria

1. Regla critica -> `AGENTS.md`.
2. Estado vivo -> `WORKING_MEMORY.md`.
3. Conocimiento reusable -> `docs/topics/<topic>.md`.
4. Decision durable -> `docs/DECISIONS.md`.
5. Trabajo retomable -> `docs/tracks/`, sin transcript.
