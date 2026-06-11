# Working Memory

Estado vivo del proyecto. Mantener corto.

Ultima actualizacion manual: 2026-06-11.

## Regla

Este archivo es router operativo, no historia. La version larga previa quedo archivada en `docs/reference/working-memory-archive-2026-06-10.md`.

## Lectura Rapida

| Area | Estado | Abrir primero | Siguiente accion |
| --- | --- | --- | --- |
| Architecture Hardening | ready-for-orchestration | `docs/tracks/016-architecture-hardening.md` | Usar el prompt de arranque del track si se retoma. |
| Actions modularization | active | `docs/tracks/017-actions-modularization.md` | Seguir con extracciones mecanicas chicas de `actions.rs`; proximo candidato: shortcuts. |
| Performance / memoria | active | `docs/tracks/014-performance-memory.md` | Mantener cache si evita carga/foco feo. AI Output tiene primer-open medido; UI Host sigue inconcluso. |
| Scripts / hotkeys filtrados | active | `docs/tracks/004-actions-scripting.md` | Probar scripts `020`-`024` con `picker.open` sin reactivar next-step globals. |
| Tags / WhichKey | active | `docs/tracks/012-tags-and-hotkeys.md` | Mantener decision vigente: scripts primero; no Settings-owned tag hotkeys sin revalidar. |
| Open Source Growth | active | `docs/tracks/013-open-source-growth.md` | Capturar screenshots/gifs sinteticos y linkear primer asset desde README. |
| Dev restart / ventana negra | active | `docs/tracks/014-performance-memory.md` | Usar readiness por renderer, no `Process.Responding`; visual harness ya usa preview. |
| Instalada vs dev dogfood | active | `docs/topics/windows-installer.md` | Instalada usa DB real; dev aislado usa `.codex-run\dev-isolated`, hotkey `Ctrl+Shift+.` y tray `Copicu Dev`. |
| macOS Port | parked | `docs/tracks/015-macos-port-spike.md` | No cambia roadmap Windows-first; convertir en spec solo si JP lo retoma. |
| UI/custom windows | active | `docs/topics/custom-window-system.md` | Validar foco, hide, shortcut, tray, paste, DPI y monitores antes de otro corte. |
| OS Lite/docs | active | `docs/topics/docs-knowledge-system.md` | Mantener ruta caliente liviana; usar `docs/topics/agentic-os-operations.md` para `realinear os`. |

## Specs Activas

| Spec | Estado | Abrir |
| --- | --- | --- |
| `004-actions-scripting-api` | active | `specs/004-actions-scripting-api/spec.md` |
| `005-search-plan-engine` | active | `specs/005-search-plan-engine/spec.md` |
| `006-tags-and-hotkeys` | active | `specs/006-tags-and-hotkeys/tasks.md` |

## Tracks Principales

| Trabajo | Abrir | Uso |
| --- | --- | --- |
| Actions/Scripting | `docs/tracks/004-actions-scripting.md` | Scripts, AI script mode, host API y dogfood. |
| UI host | `docs/tracks/009-ui-host-custom-surface.md` | Ventana auxiliar para scripts/UI. |
| UI rethink | `docs/tracks/010-ui-rethink.md` | Rediseño visual y superficies. |
| Tags/hotkeys | `docs/tracks/012-tags-and-hotkeys.md` | Tags, hotkeys y WhichKey. |
| Open source growth | `docs/tracks/013-open-source-growth.md` | Assets, community files, launch. |
| Performance/memory | `docs/tracks/014-performance-memory.md` | Idle, payloads, polling y benchmarks. |
| Architecture hardening | `docs/tracks/016-architecture-hardening.md` | Handoff para orquestar quick wins, script host boundary, runner timeout, storage safety y modularizacion. |
| Actions modularization | `docs/tracks/017-actions-modularization.md` | Reducir `actions.rs` con extracciones mecanicas y tests enfocados. |

## Decisiones Vigentes

- Copicu es CopyQ-inspired, no CopyQ-compatible.
- Stack vigente: Tauri 2, React/Vite/TypeScript, Rust, SQLite, Mantine donde aporta.
- No persistir ni publicar contenido real del clipboard en docs, tests o logs.
- Paste-to-previous-window sigue siendo el flujo nativo mas riesgoso.
- Open source Windows alpha esta publicado; mantener audit de secretos antes de releases.
- Scripts/AI deben usar host APIs/capabilities, no SQL/shell/fs/network crudo.
- Para UI relevante, usar `docs/topics/ui-design-and-impeccable.md`.
- La ruta inicial debe seguir liviana; no convertir `AGENTS.md`, `WORKING_MEMORY.md`, `TOPICS.md` ni tracks activos en transcript.
- Instalada es la herramienta diaria: `%APPDATA%\dev.jpsala.copicu\copicu.sqlite3`. Dev no debe tocar esa DB por defecto.
- Comando conversacional `actualizar instalada`/`promover dev a instalada`: ejecutar `npm run install:current`.
- Dev aislado: `npm run tauri:dev`, `npm run dev:built`, `npm run dev:restart`; app data `.codex-run\dev-isolated\app-data`, scripts `.codex-run\dev-isolated\scripts`, hotkey default `Ctrl+Shift+.`, tray badge `D`.

## Riesgos

- Hay cambios locales no revisados en Rust/docs; no revertirlos.
- No confiar en `Process.Responding` como readiness de WebView.
- `visual:check` puede fallar por infraestructura Vite/WebView, no necesariamente por assertions.
- En shortcuts globales, evitar next-step globals temporales y emits backend hacia `main` sin harness.
- `.env`, logs, DBs, blobs, dumps de clipboard, build outputs y `.agents/` no se publican.
- Lifecycle 2026-06-11: Settings cacheada acelera reapertura y cuesta una WebView extra; AI Output primer-open medido por ruta script, reapertura pendiente; UI Host sin medicion valida. No cambiar `hide()` a `destroy()` sin prueba visual/foco.
- Dev con `COPICU_DISABLE_CLIPBOARD_WATCHER=1` evita doble captura junto a instalada, pero deja pendiente limpiar comandos/diagnosticos de capture state para no loguear errores de stats.
- `Win+Alt+C` estaba tomado por `C:\dev\main\copy-q.ahk` (`#!c`). Se removio ese binding AHK y queda libre para Copicu instalada si Settings lo registra.

## Comandos De Contexto

```powershell
bun run context:index
bun run context:audit
npm run perf:windows -- -AppDataDir .codex-run\perf-memory-20260611\app-data-10k -SkipBuild
npm run install:current
```

Comando conversacional: `realinear os` audita y repara drift de la capa agentica siguiendo `docs/topics/agentic-os-operations.md`.

Continuidad: `cerrar sesion` cierra valor; `continuar sesion` abre handoff; `goal`/`gol` ejecuta una tarea; `continuar con goal` sigue aca bajo Goal; `continuar sesion con goal` abre sesion nueva con Goal inicial.

## Proximo Paso Probable

Si JP no especifica otro tema, abrir `docs/tracks/004-actions-scripting.md`, `docs/topics/actions-and-scripting-api.md`, `docs/tracks/012-tags-and-hotkeys.md`, `docs/topics/hotkeys.md` y `docs/topics/tag-management-hotkeys.md` para seguir probando scripts filtrados `020`-`024`.

## Promocion De Memoria

1. Regla critica -> `AGENTS.md`.
2. Estado vivo -> `WORKING_MEMORY.md`.
3. Conocimiento reusable -> `docs/topics/<topic>.md`.
4. Decision durable -> `docs/DECISIONS.md`.
5. Trabajo retomable -> `docs/tracks/`, sin transcript.
