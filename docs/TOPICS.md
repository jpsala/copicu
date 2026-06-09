# Topics Del Proyecto

Router liviano de conocimiento del proyecto.

## Uso Para Agentes

1. Identificar el tema por el pedido.
2. Abrir solo el topic de entrada.
3. Abrir referencias profundas solo si el topic no alcanza.
4. Si se crea documentacion nueva, indexarla aca.

## Modelo

Cada topic tiene metadata al inicio:

```yaml
---
id: topic-id
status: active | reference | historical | draft | stale | paused | blocked
kind: how-to | reference | explanation | decision-map
triggers:
  - palabras o situaciones que activan el topic
primary_refs:
  - documentos profundos o codigo relevante
---
```

## Topics De Entrada

| Si el usuario pide o menciona | Abrir primero | Para que sirve |
| --- | --- | --- |
| Producto, MVP, CopyQ, alcance, recomendaciones | [Direccion de producto](topics/product-direction.md) | Resume la direccion inicial y donde mirar. |
| Product register, personalidad visual, anti-referencias, principios de diseño | [Product Register](topics/product-register.md) | Brief compacto de audiencia, tono, anti-referencias y principios UI/producto. |
| Open source, GitHub publico, README publico, web del proyecto, contributors, promocion, growth, Show HN | [Open Source And GitHub](topics/open-source-github.md), [Open Source Growth](active-work/013-open-source-growth.md) | Decisiones y checklist para publicar el repo, web inicial, metadata GitHub, archivos OSS, audit previo y plan de promocion. |
| Performance, memoria, consumo, idle, velocidad, historiales grandes, benchmarks | [Performance And Memory](topics/performance-and-memory.md), [Performance Active Work](active-work/014-performance-memory.md) | Prioridad de optimizaciones, dev vs produccion, payload del feed, thumbnails, polling, busqueda, scripts y bundle. |
| Como hace algo CopyQ, baseline tecnico, comportamiento de Enter/paste, copycube | [CopyQ Technical Baseline](topics/copyq-technical-baseline.md) | Fuentes y patterns de CopyQ para consultar antes de reinventar flujos. |
| Ambicion Copicu, plugins, AI, metadata, busqueda potente | [Ambicion de producto](topics/product-ambition.md) | Define que se quiere construir por encima del baseline CopyQ. |
| Filtering, filtros, query syntax, busqueda local potente, FTS | [Filtering And Query Syntax](topics/filtering-and-query-syntax.md) | Contrato deterministico de busqueda local y filtros; base para picker, actions y AI planner. |
| Tags, pantalla de tags, hotkey por tag, abrir picker filtrado por tag | [Tag Management And Hotkeys](topics/tag-management-hotkeys.md) | Modelo y plan para tags como superficie propia y shortcuts globales que abren el picker filtrado. |
| Hotkeys compuestos, secuencias, chords, WhichKey, Alt+Space J | [Compound Hotkeys And WhichKey](topics/compound-hotkeys-and-whichkey.md) | Research y arquitectura para secuencias de hotkeys: prefijo global Tauri + state machine propio + menu WhichKey. |
| SearchPlan, compiler SQL seguro, busqueda potente con AI, filtros avanzados | [Search Plan Engine](topics/search-plan-engine.md) | Arquitectura para pasar de input humano/AI a un plan validado y SQL parametrizado sin SQL crudo generado por modelo. |
| Actions, scripts, plugins, comandos, TypeScript/JavaScript local, debug de scripts | [Actions And Scripting API](topics/actions-and-scripting-api.md) | Modelo durable para acciones scriptables, contexto de ejecucion, storage en archivos, capabilities y debug. |
| Markdown output, salida Markdown, informes, summaries, reportes generados, export Markdown | [Markdown Output Surface](topics/markdown-output-surface.md) | Explica la ventana `ai-output`, como se usa desde scripts/AI, acciones disponibles y diferencia con el historial. |
| UI auxiliar propia, ui-host, notificaciones custom, prompts de scripts, confirm, input | [UI Host Custom Surface](active-work/009-ui-host-custom-surface.md) | Plan para ventana auxiliar controlada por Copicu con placement, formato, elementos y request/response IDs. |
| Guia de usuario, explicacion publica del proyecto, scripts para usuarios, ejemplos de automatizacion | [User Guide](user/README.md), [Scripts Guide](user/scripts.md) | Documentacion de usuario final sobre que es Copicu y como usar scripts. |
| AI, OpenAI/OpenRouter, busqueda en lenguaje natural, filtros inteligentes, comandos AI | [AI Search And Actions](topics/ai-search-and-actions.md) | Define provider inicial, query planner, relacion con actions y privacy gates. |
| Librerias, dependencias, investigacion tecnica, Context7, web research | [Proceso de research tecnico](topics/technical-research-process.md) | Define como investigar antes de elegir librerias. |
| Clipboard, portapapeles, captura, formatos de clipboard | [Clipboard](topics/clipboard.md) | Research, patterns y decisiones sobre clipboard. |
| Picker, buscador, filtro, preview, regex, fuzzy, navegacion por teclado/mouse, tabs de UI | [Picker Interaction](topics/picker-interaction.md) | Modelo de interaccion del picker y research de otros clipboard managers. |
| UI, visual polish, responsive, overflow, impeccable | [UI Design And Impeccable](topics/ui-design-and-impeccable.md) | Workflow visual y regla de uso de `pbakaus/impeccable` cuando valga la pena. |
| Arquitectura UI, superficies, ventanas Tauri, que usar al tocar UI | [UI Surface Architecture](topics/ui-surface-architecture.md) | Contrato operativo para surfaces, Mantine/custom UI, ventanas y checks antes de tocar UI. |
| Ventanas custom, frameless, undecorated, transparent, titlebar custom, drag regions, window chrome | [Custom Window System](topics/custom-window-system.md) | Plan y limites para compartir chrome custom entre ventanas sin repetir problemas conocidos de WebView2/Tauri. |
| Replanteo UI, feo, temas, ventanas dentro de ventanas, superficie visual, componentes | [UI Rethink](topics/ui-rethink.md) | Topic durable para redisenar superficies, temas y componentes de Copicu. |
| Mantine, MUI, libreria UI, componentes, design system, themes | [Mantine UI System](topics/mantine-ui-system.md), [Mantine Component Migration](active-work/011-mantine-component-migration.md) | Decision, reglas y checklist de migracion para adoptar Mantine como base de componentes/temas. |
| Shortcut global, hotkey, tray, background app | [Global Shortcut And Tray](topics/global-shortcut-and-tray.md) | Research y patterns para shortcut/tray/lifecycle. |
| Instalador, NSIS, MSI, updater, release Windows | [Windows Installer](topics/windows-installer.md) | Decision y configuracion recomendada para empaquetar Copicu en Windows. |
| SQLite, rusqlite, storage, persistence, historial | [SQLite Storage](topics/sqlite-storage.md) | Research y patterns de persistencia local. |
| Paste-to-previous-window, foco previo, Win32, SendInput | [Windows Focus And Paste](topics/windows-focus-and-paste.md) | Research y patterns de foco previo e input sintetico. |
| Funciones concretas de CopyQ, paridad, inventario de capacidades | [Inventario CopyQ](reference/copyq-feature-inventory.md) | Lista que hace CopyQ y como usarlo para roadmap/specs. |
| Importar datos/tabs de CopyQ, migracion desde `C:\tools\copyq` | [CopyQ Import](active-work/007-copyq-import.md) | Investigacion local, mapping tabs->tags y plan de importador. |
| Aliases, abreviaturas, glosario, SA, CQ, CC, definiciones | `docs/GLOSSARY.md` | Define nombres cortos y terminos recurrentes del proyecto. |
| Stack, Tauri, Rust, SQLite, plugins, desarrollo | `docs/DEVELOPMENT.md` | Stack objetivo y arquitectura tecnica esperada. |
| Preguntas abiertas, decisiones pendientes | `docs/OPEN_QUESTIONS.md` | Lo que falta definir antes de fijar arquitectura. |
| Feature grande, milestone, spike implementable | `specs/` | Crear una spec antes de implementar cambios durables. |

## Documentos Raiz

| Documento | Rol |
| --- | --- |
| `PROJECT.md` | Proposito, alcance y riesgos. |
| `ASSISTANT_RULES.md` | Reglas de colaboracion, privacidad y tono. |
| `DEVELOPMENT.md` | Stack, arquitectura y verificacion. |
| `DECISIONS.md` | Decisiones tomadas y pendientes. |
| `OPEN_QUESTIONS.md` | Preguntas abiertas. |
| `GLOSSARY.md` | Aliases, nombres cortos y definiciones recurrentes. |
| `WORKING_MEMORY.md` | Estado vivo y siguiente paso probable. |
| `active-work/` | Trabajos vivos retomables. |

## Regla Sobre Archivos Preexistentes

Los archivos que existian antes de instalar el sistema agentico no deben quedar sueltos. Integrarlos en `docs/`, moverlos a una ubicacion indexada, archivarlos con estado claro o preguntar antes de borrarlos.
