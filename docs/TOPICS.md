# Topics Del Proyecto

Router liviano de conocimiento. Usar `docs/.generated/context-index.md` para orientacion rapida y este archivo cuando haga falta elegir el topic humano correcto.

## Uso Para Agentes

1. Identificar el tema por el pedido.
2. Abrir solo el topic de entrada y, si aplica, su track/spec primaria.
3. Abrir referencias profundas solo si el topic no alcanza.
4. Indexar aca docs nuevos utiles para agentes.

## Topics De Entrada

| Si el usuario pide o menciona | Abrir primero |
| --- | --- |
| Producto, MVP, CopyQ, alcance, roadmap | [product-direction](topics/product-direction.md), [product-ambition](topics/product-ambition.md), [copyq-technical-baseline](topics/copyq-technical-baseline.md) |
| Product register, personalidad visual, anti-referencias | [product-register](topics/product-register.md) |
| Open source, GitHub publico, launch, Show HN | [open-source-github](topics/open-source-github.md), [013-open-source-growth](tracks/013-open-source-growth.md), [018-public-launch-readiness](tracks/018-public-launch-readiness.md) |
| Performance, memoria, idle, benchmarks, Pi lento en repo | [performance-and-memory](topics/performance-and-memory.md), [014-performance-memory](tracks/014-performance-memory.md), [pi-agentic-os](topics/pi-agentic-os.md) |
| Filtering, query syntax, SearchPlan, FTS, busqueda AI | [filtering-and-query-syntax](topics/filtering-and-query-syntax.md), [search-plan-engine](topics/search-plan-engine.md), [ai-search-and-actions](topics/ai-search-and-actions.md) |
| Actions, scripts, plugins, debug de scripts | [actions-and-scripting-api](topics/actions-and-scripting-api.md), [004-actions-scripting](tracks/004-actions-scripting.md), [017-actions-modularization](tracks/017-actions-modularization.md) |
| Markdown output, summaries, reportes | [markdown-output-surface](topics/markdown-output-surface.md) |
| Clipboard, formatos, captura, rich MIME, enrichment | [clipboard](topics/clipboard.md), [sqlite-storage](topics/sqlite-storage.md), `specs/008-clipboard-enrichment/` |
| Picker, previews, keyboard navigation, dogfood | [picker-interaction](topics/picker-interaction.md), `tests/manual/dogfood/README.md` |
| Tags, hotkey por tag, WhichKey, chords | [tag-management-hotkeys](topics/tag-management-hotkeys.md), [hotkeys](topics/hotkeys.md), [whichkey](topics/whichkey.md), [compound-hotkeys-and-whichkey](topics/compound-hotkeys-and-whichkey.md), [012-tags-and-hotkeys](tracks/012-tags-and-hotkeys.md) |
| UI, visual polish, Mantine, temas, surface architecture | [ui-design-and-impeccable](topics/ui-design-and-impeccable.md), [ui-surface-architecture](topics/ui-surface-architecture.md), [ui-rethink](topics/ui-rethink.md), [mantine-ui-system](topics/mantine-ui-system.md), [010-ui-rethink](tracks/010-ui-rethink.md), [011-mantine-component-migration](tracks/011-mantine-component-migration.md) |
| Ventanas Tauri, frameless, ui-host, window state | [custom-window-system](topics/custom-window-system.md), [window-state-and-monitor-policy](topics/window-state-and-monitor-policy.md), [009-ui-host-custom-surface](tracks/009-ui-host-custom-surface.md) |
| Global shortcut, tray, foco previo, paste | [global-shortcut-and-tray](topics/global-shortcut-and-tray.md), [windows-focus-and-paste](topics/windows-focus-and-paste.md) |
| Instalador, release Windows, updater | [windows-installer](topics/windows-installer.md) |
| macOS port | [macos-portability-research-unindexed](topics/macos-portability-research-unindexed.md), [015-macos-port-spike](tracks/015-macos-port-spike.md) |
| CopyQ feature inventory/import | [copyq-feature-inventory](reference/copyq-feature-inventory.md), [007-copyq-import](tracks/007-copyq-import.md) |
| Sistema agentico, AOS, docs, checkpoint, continuar, gol | [docs-knowledge-system](topics/docs-knowledge-system.md), [pi-agentic-os](topics/pi-agentic-os.md), [agentic-os-operations](topics/agentic-os-operations.md), [os-quality](topics/os-quality.md), [local-codex-skills](topics/local-codex-skills.md) |
| Research tecnico, librerias, dependencias | [technical-research-process](topics/technical-research-process.md) |
| Guia de usuario, scripts para usuarios | [user/README.md](user/README.md), [user/scripts.md](user/scripts.md) |
| Aliases, glosario | [GLOSSARY.md](GLOSSARY.md) |
| Stack, arquitectura, desarrollo | [DEVELOPMENT.md](DEVELOPMENT.md) |
| Preguntas abiertas, decisiones | [OPEN_QUESTIONS.md](OPEN_QUESTIONS.md), [DECISIONS.md](DECISIONS.md) |
| Feature grande, milestone, spike | `specs/` |

## Documentos Raiz

| Documento | Rol |
| --- | --- |
| `AGENTS.md` | Reglas criticas y ruta inicial. |
| `docs/.generated/context-index.md` | Cache generado de topics/tracks/specs/skills/aliases. |
| `docs/WORKING_MEMORY.md` | Estado vivo corto y proximo paso probable. |
| `docs/TOPICS.md` | Router humano de temas. |
| `docs/README.md` | Mapa documental si hace falta. |
| `docs/USER_GUIDE.md` | Guia humana breve. |
| `docs/DECISIONS.md` | Decisiones durables. |
| `docs/OPEN_QUESTIONS.md` | Preguntas abiertas. |
| `docs/GLOSSARY.md` | Alias y terminos recurrentes. |
| `docs/skills/` | Skills locales portables; fuente canonica. |
| `.pi/` | Prompts/extensiones Pi locales. |
| `docs/reference/` | Historia/contexto profundo no caliente. |
| `docs/tracks/` | Trabajos vivos retomables. |
| `specs/` | Specs de features grandes. |

## Reglas

- `AGENTS.md`, `WORKING_MEMORY.md`, `TOPICS.md` y tracks activos no deben convertirse en transcript ni lectura obligatoria amplia.
- Archivos preexistentes de contexto no deben quedar sueltos: integrar, indexar, archivar con estado claro o preguntar antes de borrar.
- En Pi, preferir `map/search` scoped (`src`, `src-tauri/src`, `docs/topics`) antes que repo completo; abrir `docs/skills/impeccable/` solo para trabajos UI/impeccable.
