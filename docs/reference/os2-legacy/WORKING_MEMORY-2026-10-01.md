# Working Memory

Router operativo corto. Actualizado: 2026-10-01. Historia anterior: `docs/reference/working-memory-archive-2026-06-14-pre-pi-os.md`. Si un detalle crece, promover a topic/track/spec; no usar como transcript.

## Foco Único De Ejecución

- **Estado:** `draft`.
- **Referencia:** `docs/tracks/041-shared-clipboard.md`.
- **Plan:** `specs/016-shared-clipboard/plan.md`.
- **Resultado:** N1 Sandbox: 15 Pure + 11 Clipboard + 6 DPAPI. Corte local: 51 C1/L1 + 34 D1 + 23 relay = 108 pruebas, interop HPKE/DPAPI/HTTP/SQLite/historial/report real sintético. Shipping incompleto.
- **Gate:** cinco cargo add aprobados («avancemos») y opcionales, sin startup. Enrollment/runtime/Actions/UI/watcher/dos PCs pendientes; sin deploy ni perfiles reales.
- **Siguiente acción:** pending/gaps/outbox D1, enrollment y adapters runtime/nativos: `specs/016-shared-clipboard/local-implementation.md`. Sandbox cerrados; instalada intacta/dev detenida. Tabs: track 041.

## Lectura Rápida

| Área | Estado | Abrir primero | Siguiente acción |
| --- | --- | --- | --- |
| Clipboard compartido / backup futuro | N1 sintético; C1/T1 y D1 autenticado opt-in, 108 pruebas | `docs/topics/shared-clipboard.md`, `specs/016-shared-clipboard/local-implementation.md` | Enrollment/runtime/Actions/UI/watcher/dos PCs pendientes; deps aprobadas. |
| Sidebar redimensionable | complete/distributed | `docs/tracks/040-resizable-folder-sidebar.md` | v0.5.1 publicada/instalada y smoke sintético pasa; preferencia 140–600 px, sangría 10 px/nivel, default 214, feed mínimo 320. |
| Release / GitHub | complete/distributed | `docs/tracks/040-resizable-folder-sidebar.md`, `docs/topics/windows-installer.md` | v0.5.1 stable/latest publicada, assets y SHA256/firma verificados; instalación local 0.5.1. Versión pública en `README.md`. |
| Selección / marcados | complete/distributed | `docs/tracks/038-persistent-working-set.md`, `specs/015-persistent-working-set/spec.md` | Dogfood de v0.5.0; controles temporales y marcas durables, retención y scope global separados. |
| Carpetas / picker | complete/distributed, accepted JP | `specs/014-folders/spec.md`, `docs/topics/picker-interaction.md` | Dogfood de v0.5.0; preservar búsqueda aplicada y draft al navegar carpetas. |
| Appearance / batch menus | complete/distributed | `docs/topics/appearance-and-themes.md`, `docs/topics/picker-interaction.md` | Dogfood sin atribuirle hang intermitente. |
| Confiabilidad / metadata | complete | `docs/tracks/035-picker-reliability.md` | Históricos se limitan sólo al recapturarse. |
| Actions modularization | active | `docs/tracks/017-actions-modularization.md` | Próxima extracción mecánica chica, sin tocar runner Node. |
| RPC / CLI | planned | `docs/tracks/034-local-rpc-cli.md`, `docs/topics/actions-and-scripting-api.md` | PowerShell/AutoHotkey via Named Pipe, sin SQL/Tauri/Host passthrough. |
| Scripts / hotkeys | complete | `docs/tracks/012-tags-and-hotkeys.md`, `docs/topics/tag-management-hotkeys.md` | Installer distribuye sólo 030/031, sin sobrescribir; otros ejemplos son fixtures. |
| Paste Queue / secure clips | parked | `docs/tracks/019-paste-queue.md`, `docs/tracks/020-secure-clips-password.md` | Discutir antes de implementar. |
| Assistant | integrado, dogfood | `specs/013-conversational-assistant/spec.md`, `docs/topics/ai-search-and-actions.md` | Contexto/búsqueda preservados; endpoints/keys aislados. No inferir foco/clipboard de mocks. |
| Search / AI / metadata | complete/dogfood | `specs/011-selection-aware-metadata-inspector/spec.md`, `docs/topics/filtering-and-query-syntax.md`, `docs/topics/codemirror-query-editor.md` | F2 unifica content/metadata; standalone conserva single/multi. |
| Performance / ventanas | active | `docs/tracks/014-performance-memory.md`, `docs/topics/ui-surface-architecture.md`, `docs/topics/window-state-and-monitor-policy.md` | Próximo split seguro: UiHostApp; revisar LastMonitor si importa. |
| Dogfood / UI nativa | active | `tests/manual/dogfood/README.md`, `docs/topics/picker-interaction.md` | C0: app externa -> hotkey foreground -> type global sin focus manual -> token visible; AX no basta para WebView2. |
| OS / agentic | active | `docs/topics/agentic-os-operations.md`, `docs/topics/omp-agentic-os.md` | AOS conserva memoria/gates; OMP gobierna runtime. |

## Decisiones Vigentes

CopyQ-inspired, no compatible; Tauri 2 + React/Vite/TS + Rust/SQLite. F2 guarda content/metadata atómicamente; Shift+F2 abre utility. Title/notes escalares, tags único conjunto editable con provenance/suppression. AI escribe por APIs; SQL readonly; Node no es sandbox. Contratos en topics, razones en `docs/DECISIONS.md`.

## Riesgos Operativos

- Updater trust root rotada en v0.3.7; <=0.3.6 requiere instalación manual. Clave local bajo `.codex-run/secrets/`; falta backup externo. Nunca publicar secretos.
- Hang instalada: revisar diagnostics antes de reiniciar. Evitar colisiones instalada/dev en shortcut/autostart; Ctrl+Shift+C reservado para metadata app-owned. Enrichment 026 pendiente por Ctrl+Alt+E.
- Dev usa `npm run dev:restart`/built-dev y conserva `.codex-run/dev-isolated/app-data`: puede contener historial real, no asumir sintético. Verificar shortcut en log, no inferir del override. Shift+Delete borra selección.
- Target frío: WebView2Loader.dll y política de ventanas en `docs/DEVELOPMENT.md`/topics. Publicación no autoriza instalación; `release:install` e `install:current` requieren pedido explícito.

## Checks Y Memoria

Contexto: `bun run context -- show`, `bun run context:audit`. Producto: build, visual, Rust, search/snapshot y checks focalizados. Release: `mise run release-vite-chunk-check`. Detalles/evidencia del último corte en tracks 038/039.

Promover regla crítica a AGENTS; estado vivo aquí; contrato a topic; decisión a DECISIONS; trabajo retomable a track. No guardar transcripts, intentos fallidos ni inventarios duplicados.
