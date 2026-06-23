# Working Memory

Estado vivo del proyecto. Mantener corto; no usar como transcript.

Ultima actualizacion manual: 2026-06-23.

Archivo largo previo: `docs/reference/working-memory-archive-2026-06-14-pre-pi-os.md`.

## Regla

Este archivo es router operativo. Si un detalle crece, moverlo a topic, track, spec o reference.

## Lectura Rapida

| Area | Estado | Abrir primero | Siguiente accion |
| --- | --- | --- | --- |
| Actions modularization | active | `docs/tracks/017-actions-modularization.md` | Proxima extraccion mecanica chica sin tocar runner Node. |
| Actions/scripts/hotkeys | active/validated | `docs/tracks/004-actions-scripting.md`, `docs/tracks/012-tags-and-hotkeys.md` | Shortcuts de scripts: flujo manual validado; patch preview opcional. |
| Performance/UI windows | active | `docs/tracks/014-performance-memory.md`, `docs/topics/custom-window-system.md`, `docs/tracks/010-ui-rethink.md` | UI modularizada en commits `af392f5`/`7b10504`; `NotificationsApp` ya separado; proximo split seguro: `UiHostApp`. |
| Open source growth | active | `docs/tracks/018-public-launch-readiness.md`, `docs/tracks/013-open-source-growth.md` | Launch readiness pusheado hasta `19a1ba7`; #16/#17/#18 cerrados. Proximo: preparar `v0.3.0` o elegir nuevo issue/docs release. |
| Dev/instalada | active | `docs/topics/windows-installer.md` | `v0.2.8` publicado e instalado localmente; dev/instalada separados; release trae diagnostics persistente para investigar hangs. |
| Picker dogfood / Computer Use | active | `tests/manual/dogfood/README.md`, `tests/manual/dogfood/PICKER_REAL_USER_STRESS_FLOW.md`, `tests/manual/dogfood/PICKER_COMPUTER_USE_FOCUS_BATTERY.md`, `docs/topics/picker-interaction.md` | New item + Pin commiteados en `3826de1`; captura contexto oculto commiteada en `c94cf25`; panel About + Check now commiteado en `031ec5a`. Mantener oracle C0: app externa -> hotkey -> type sin focus manual debe escribir en search. |
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
- Release actual: Windows `v0.2.8` con auto-update firmado via Tauri Updater/GitHub Releases.
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
- GitHub auth en Pi esta OK. `main` y `origin/main` estan sincronizados en `19a1ba7` (`Add URL extraction script example`). Release Windows vigente `v0.2.8` fue cortado desde `3905b6e`.
- Updater: respaldar fuera del repo `.codex-run/secrets/copicu-updater.key` y `.codex-run/secrets/copicu-updater.password`; perderlos impide firmar updates para instalaciones `v0.2.5+`.
- Shortcuts globales: evitar colisiones instalada/dev y preferir ruta nativa para hotkeys criticas.
- Dogfood dev: usar `npm run dev:restart` / built-dev si `tauri dev` varía.
- Hang instalada 2026-06-23: si vuelve a pasar, revisar `%APPDATA%\dev.jpsala.copicu\diagnostics.jsonl`; dump previo guardado en `.codex-run\hang-dumps\copicu-installed-hung-20260623-113818.dmp` (local/no versionado).
- Enrichment: pendiente dogfood `026` por `Ctrl+Alt+E`; policy manual `{ apply: true }`.
- Picker stress: validar foreground real, pin/candadito y wrapper `copicu_computer_use`.
- Hotkey picker foco 2026-06-18: `Ctrl+Shift+.` abre con foco; fallback `COPICU_PICKER_NO_ACTIVATE=1`; oracle: tipear sin `focus` manual entra en search. Incidente 2026-06-20 en rama vieja confirmo que usar no-activate como default muestra el picker sin foco.
- Borrado picker 2026-06-20: `Delete` edita el search input; `Shift+Delete` borra seleccion sin confirmacion; trash icon aparece solo sobre item(s) seleccionados y el menu contextual no muestra Delete.
- Track 012 compactada; historial en `docs/reference/012-tags-and-hotkeys-archive-2026-06-14.md`.

## Comandos De Contexto

```powershell
bun run context:index
bun run context:audit
mise run release-vite-chunk-check
npm run perf:windows -- -AppDataDir .codex-run\perf-memory-20260611\app-data-10k -SkipBuild
npm run install:current
npm run release:windows
```

Comandos conversacionales y Pi locales estan documentados en `docs/topics/docs-knowledge-system.md` y `docs/topics/pi-agentic-os.md`.

## Proximo Paso Probable

Proximo lote recomendado:

1. Si reaparece un hang, comparar ultimo `renderer.heartbeat`, `updater.*`, `clipboard.event.*` y `window.event` en `%APPDATA%\dev.jpsala.copicu\diagnostics.jsonl` antes de reiniciar.
2. Validar ciclo real de updater desde una instalada anterior cuando haya oportunidad; la instalada local ya quedo en `v0.2.8` por `npm run install:current`, no por updater.
3. Si se toca producto, correr `npm run build`, `cargo check --manifest-path src-tauri/Cargo.toml --tests`, `npm run rust:test` y visual focalizado/full segun riesgo.

## Promocion De Memoria

1. Regla critica -> `AGENTS.md`.
2. Estado vivo -> `WORKING_MEMORY.md`.
3. Conocimiento reusable -> `docs/topics/<topic>.md`.
4. Decision durable -> `docs/DECISIONS.md`.
5. Trabajo retomable -> `docs/tracks/`, sin transcript.
