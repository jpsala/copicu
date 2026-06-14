# Working Memory

Estado vivo del proyecto. Mantener corto; no usar como transcript.

Ultima actualizacion manual: 2026-06-14.

Archivo largo previo: `docs/reference/working-memory-archive-2026-06-14-pre-pi-os.md`.

## Regla

Este archivo es router operativo. Si un detalle crece, moverlo a topic, track, spec o reference.

## Lectura Rapida

| Area | Estado | Abrir primero | Siguiente accion |
| --- | --- | --- | --- |
| Actions modularization | active | `docs/tracks/017-actions-modularization.md` | Revisar otra extraccion mecanica chica sin tocar runner Node. |
| Actions/scripts/hotkeys | active/validated | `docs/tracks/004-actions-scripting.md`, `docs/tracks/012-tags-and-hotkeys.md`, `specs/008-clipboard-enrichment/spec.md` | Flujo manual de edicion de shortcuts de scripts validado; patch preview queda opcional/futuro si JP lo pide. |
| Performance/UI windows | active | `docs/topics/custom-window-system.md`, `docs/topics/ui-surface-architecture.md`, `docs/tracks/010-ui-rethink.md` | Mantener dogfood de prewarm `metadata` si la velocidad percibida compensa el coste idle. |
| Open source growth | active | `docs/tracks/013-open-source-growth.md` | `v0.2.1` publicado y PR `#10` mergeado a `main`; elegir proximo frente de crecimiento o release hardening. |
| Dev/instalada | active | `docs/topics/windows-installer.md`, `docs/tracks/014-performance-memory.md` | `install:current` revalidado; decidir si recuperar code split o atacar warning de chunk grande. |
| OS / sistema agentico | active | `docs/topics/docs-knowledge-system.md`, `docs/topics/pi-agentic-os.md` | Pi tiene `copicu_computer_use` y `pi-until-done`; usar `/checkpoint`, `/os-status`, `/os-compact`, `/os-continuar`, `/gol`; seguir reduciendo bloat de tracks grandes. |
| Skills locales | reference | `docs/topics/local-codex-skills.md` | Abrir solo para crear/revisar skills locales o discutir costo de discovery. |

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
- Preferencia JP: favorecer velocidad/latencia percibida agresivamente por defecto; aceptar coste extra razonable de memoria/procesos si no es extremo.
- Instalada es herramienta diaria: `%APPDATA%\dev.jpsala.copicu\copicu.sqlite3`; dev debe usar `.codex-run\dev-isolated` por defecto.
- Paste-to-previous-window sigue siendo el flujo nativo mas riesgoso.
- Open source Windows `v0.2.1` queda como release actual.
- Scripts/AI deben usar host APIs/capabilities, no SQL/shell/fs/network crudo.
- Clipboard enrichment v1 es logica interna post-capture, no scripting-first.
- `metadata` standalone queda `CachedHidden` + prewarm por velocidad percibida, salvo coste extremo en dogfood.
- Para UI relevante, usar `docs/topics/ui-design-and-impeccable.md`.
- `docs/skills/` es la fuente canonica de skills locales; `.agents/skills` es junction de compatibilidad.
- Skills operativas locales incluyen continuidad/checkpoint, `realinear-os`, `evaluar-skills` y `repo-commit-push`.
- Para comandos operativos, preferir modelo hibrido: skill/prompt corto para discovery y logica durable en topic/script/doc canonico.
- Ruta inicial liviana; no convertir `AGENTS.md`, `WORKING_MEMORY.md`, `TOPICS.md` ni tracks activos en transcript.
- Pi compaction ayuda pero no es memoria durable; valor durable va a docs versionados.
- Para testear Copicu desde Pi, usar `copicu_computer_use`: AHK-MCP local via `.codex-run`, teclado/screenshots como ruta confiable; UIA sirve poco dentro del WebView Tauri y `window_info` puede timeoutear.
- `pi-rtk-optimizer` global queda recomendado en `mode: "rewrite"` para ahorrar contexto sin avisos; mantener `readCompaction.enabled: false` y `sourceCodeFilteringEnabled: false` para preservar lecturas exactas y anchors de edicion.

## Riesgos / Pendientes Tecnicos

- Warning Vite por chunk grande ya no se reproduce en build actual; `mise run release-vite-chunk-check` lo protege sin tocar la ruta segura `src/main.tsx` directa.
- `visual:check` y tests Rust focalizados pueden fallar por infraestructura local; contrastar con `cargo check`, build y dogfood.
- Shortcuts globales: evitar colisiones instalada/dev y preferir ruta nativa para hotkeys criticas.
- `tauri dev` puede tardar o quedar blanco por Vite; para dogfood normal usar `npm run dev:restart` / built-dev.
- Enrichment: pendiente dogfood `026` por `Ctrl+Alt+E`; policy manual `{ apply: true }` sigue vigente.
- Tracks grandes, especialmente `docs/tracks/012-tags-and-hotkeys.md`, siguen pendientes de compactacion a referencia.

## Comandos De Contexto

```powershell
bun run context:index
bun run context:audit
mise run release-vite-chunk-check
npm run perf:windows -- -AppDataDir .codex-run\perf-memory-20260611\app-data-10k -SkipBuild
npm run install:current
```

Comandos conversacionales: `realinear os`, `sigamos`, `checkpoint`/`persistí estado`, `cerrar sesion`, `continuar sesion`, `continuar sesion con gol`/`continuar con gol`/`siguiente`, `evaluar skills`, `repo commit push`.

Comandos Pi locales: `/checkpoint`, `/checkpoint-nudge [prefill|mute|unmute|test]`, `/os-status [audit]`, `/os-sync`, `/os-compact [foco]`, `/os-continuar [objetivo]`/`/seguir [objetivo]`, `/gol [objetivo]` -> prepara `/until-done`, `/until-done <objetivo>` via `pi-until-done`, `/reload`. Tool local: `copicu_computer_use` (`self_test`, `open_picker`, `focus`, `send`, `type`, `click`, `screenshot`, `debug_last`).

## Proximo Paso Probable

Proximo lote recomendado:

1. Revisar y committear el gate `mise run release-vite-chunk-check` junto con docs relacionados si JP quiere cerrar el corte release-hardening.
2. Seguir en modo normal por defecto; reservar `/gol`/`until-done` para tareas largas o autonomas donde el costo de contrato/bootstrap se justifique.
3. Mantener como secundarios: actions modularization, bloat de tracks grandes y patch preview de shortcuts.

## Promocion De Memoria

1. Regla critica -> `AGENTS.md`.
2. Estado vivo -> `WORKING_MEMORY.md`.
3. Conocimiento reusable -> `docs/topics/<topic>.md`.
4. Decision durable -> `docs/DECISIONS.md`.
5. Trabajo retomable -> `docs/tracks/`, sin transcript.
