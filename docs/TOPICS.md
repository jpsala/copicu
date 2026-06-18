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
| Open source, GitHub publico, README publico, web del proyecto, contributors, promocion, growth, Show HN | [Open Source And GitHub](topics/open-source-github.md), [Open Source Growth](tracks/013-open-source-growth.md) | Decisiones y checklist para publicar el repo, web inicial, metadata GitHub, archivos OSS, audit previo y plan de promocion. |
| Performance, memoria, consumo, idle, velocidad, historiales grandes, benchmarks | [Performance And Memory](topics/performance-and-memory.md), [Performance Tracks](tracks/014-performance-memory.md) | Prioridad de optimizaciones, dev vs produccion, payload del feed, thumbnails, polling, busqueda, scripts y bundle. |
| Como hace algo CopyQ, baseline tecnico, comportamiento de Enter/paste, copycube | [CopyQ Technical Baseline](topics/copyq-technical-baseline.md) | Fuentes y patterns de CopyQ para consultar antes de reinventar flujos. |
| Ambicion Copicu, plugins, AI, metadata, busqueda potente | [Ambicion de producto](topics/product-ambition.md) | Define que se quiere construir por encima del baseline CopyQ. |
| Filtering, filtros, query syntax, busqueda local potente, FTS | [Filtering And Query Syntax](topics/filtering-and-query-syntax.md) | Contrato deterministico de busqueda local y filtros; base para picker, actions y AI planner. |
| Tags, pantalla de tags, hotkey por tag, abrir picker filtrado por tag | [Tag Management And Hotkeys](topics/tag-management-hotkeys.md) | Modelo y plan para tags como superficie propia y shortcuts globales que abren el picker filtrado. |
| Hotkeys compuestos, secuencias, chords, WhichKey, Alt+Space J | [Hotkeys](topics/hotkeys.md), [WhichKey](topics/whichkey.md), [Compound Hotkeys And WhichKey](topics/compound-hotkeys-and-whichkey.md) | Research y arquitectura para secuencias de hotkeys: prefijo global Tauri + state machine propio + menu WhichKey. |
| SearchPlan, compiler SQL seguro, busqueda potente con AI, filtros avanzados | [Search Plan Engine](topics/search-plan-engine.md) | Arquitectura para pasar de input humano/AI a un plan validado y SQL parametrizado sin SQL crudo generado por modelo. |
| Actions, scripts, plugins, comandos, TypeScript/JavaScript local, debug de scripts | [Actions And Scripting API](topics/actions-and-scripting-api.md) | Modelo durable para acciones scriptables, contexto de ejecucion, storage en archivos, capabilities y debug. |
| Markdown output, salida Markdown, informes, summaries, reportes generados, export Markdown | [Markdown Output Surface](topics/markdown-output-surface.md) | Explica la ventana `ai-output`, como se usa desde scripts/AI, acciones disponibles y diferencia con el historial. |
| UI auxiliar propia, ui-host, notificaciones custom, prompts de scripts, confirm, input | [UI Host Custom Surface](tracks/009-ui-host-custom-surface.md) | Plan para ventana auxiliar controlada por Copicu con placement, formato, elementos y request/response IDs. |
| Guia de usuario, explicacion publica del proyecto, scripts para usuarios, ejemplos de automatizacion | [User Guide](user/README.md), [Scripts Guide](user/scripts.md) | Documentacion de usuario final sobre que es Copicu y como usar scripts. |
| Sistema agentico, AOS, documentacion liviana, context index, tracks, cerrar sesion, continuar sesion, gol, continuar con gol, continuar sesion con gol, siguiente, handoff | [Sistema De Conocimiento Agentico](topics/docs-knowledge-system.md), [OS Playbook](OS_PLAYBOOK.md) | Explica la capa agentica local, como mantenerla liviana y como cerrar/continuar sesiones sin perder valor. |
| Pi OS, extensiones Pi, checkpoint-nudge, os-status, os-sync, os-compact, os-continuar, sesiones Pi, compactacion Pi, until-done, gol | [Pi Agentic OS](topics/pi-agentic-os.md), [OS Playbook](OS_PLAYBOOK.md) | Adaptacion del OS local a Pi: comandos, extensiones, nudges, labels, sync, compaction, sesiones nuevas y ejecucion segura con `/gol`. |
| Realinear os, auditar sistema agentico, reparar sistema agentico, drift de contexto | [Operaciones Del Sistema Agentico](topics/agentic-os-operations.md) | Playbook para auditar y reparar la capa agentica sin tocar producto. |
| Skills locales, slash commands, `.agents/skills`, `docs/skills`, metadata, costo de discovery | [Skills Locales De Codex](topics/local-codex-skills.md) | Referencia bajo demanda para decidir que convertir en skill y como mantener discovery barato. |
| AI, OpenAI/OpenRouter, busqueda en lenguaje natural, filtros inteligentes, comandos AI | [AI Search And Actions](topics/ai-search-and-actions.md) | Define provider inicial, query planner, relacion con actions y privacy gates. |
| Librerias, dependencias, investigacion tecnica, Context7, web research | [Proceso de research tecnico](topics/technical-research-process.md) | Define como investigar antes de elegir librerias. |
| Clipboard, portapapeles, captura, formatos de clipboard | [Clipboard](topics/clipboard.md) | Research, patterns y decisiones sobre clipboard. |
| Picker, buscador, filtro, preview, regex, fuzzy, navegacion por teclado/mouse, tabs de UI | [Picker Interaction](topics/picker-interaction.md) | Modelo de interaccion del picker y research de otros clipboard managers. |
| UI, visual polish, responsive, overflow, impeccable | [UI Design And Impeccable](topics/ui-design-and-impeccable.md) | Workflow visual y regla de uso de `pbakaus/impeccable` cuando valga la pena. |
| Arquitectura UI, superficies, ventanas Tauri, que usar al tocar UI | [UI Surface Architecture](topics/ui-surface-architecture.md) | Contrato operativo para surfaces, Mantine/custom UI, ventanas y checks antes de tocar UI. |
| Ventanas standalone, custom, frameless, undecorated, transparent, titlebar custom, drag regions, window chrome, capabilities por ventana, ui-host | [Custom Window System](topics/custom-window-system.md) | Registro canonico de fuentes, patterns y limites para ventanas Tauri en Copicu, incluyendo labels, capabilities, chrome custom y problemas conocidos de WebView2/Tauri. |
| Persistencia de ventanas, resize, posicion/tamano, multiples monitores, monitor desconectado | [Window State And Monitor Policy](topics/window-state-and-monitor-policy.md) | Politica compartida para resize, guardar/restaurar bounds y fallback multi-monitor. |
| Replanteo UI, feo, temas, ventanas dentro de ventanas, superficie visual, componentes | [UI Rethink](topics/ui-rethink.md) | Topic durable para redisenar superficies, temas y componentes de Copicu. |
| Mantine, MUI, libreria UI, componentes, design system, themes | [Mantine UI System](topics/mantine-ui-system.md), [Mantine Component Migration](tracks/011-mantine-component-migration.md) | Decision, reglas y checklist de migracion para adoptar Mantine como base de componentes/temas. |
| Shortcut global, hotkey, tray, background app | [Global Shortcut And Tray](topics/global-shortcut-and-tray.md) | Research y patterns para shortcut/tray/lifecycle. |
| Instalador, NSIS, MSI, updater, release Windows | [Windows Installer](topics/windows-installer.md) | Decision y configuracion recomendada para empaquetar Copicu en Windows. |
| macOS port, Mac port, paste previous window macOS, NSPasteboard, Accessibility | [macOS Portability Research](topics/macos-portability-research-unindexed.md), [macOS Port Spike](tracks/015-macos-port-spike.md) | Research estacionado para futuro port macOS sin cambiar roadmap Windows-first. |
| SQLite, rusqlite, storage, persistence, historial | [SQLite Storage](topics/sqlite-storage.md) | Research y patterns de persistencia local. |
| Paste-to-previous-window, foco previo, Win32, SendInput | [Windows Focus And Paste](topics/windows-focus-and-paste.md) | Research y patterns de foco previo e input sintetico. |
| Funciones concretas de CopyQ, paridad, inventario de capacidades | [Inventario CopyQ](reference/copyq-feature-inventory.md) | Lista que hace CopyQ y como usarlo para roadmap/specs. |
| Importar datos/tabs de CopyQ, migracion desde `C:\tools\copyq` | [CopyQ Import](tracks/007-copyq-import.md) | Investigacion local, mapping tabs->tags y plan de importador. |
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
| `USER_GUIDE.md` | Guia humana breve para usar el sistema agentico. |
| `OS_PLAYBOOK.md` | Playbook practico para usar el OS: comandos, workflows, `/gol`, `/until-done`, checkpoint, continuidad, compaction y dogfood. |
| `WORKING_MEMORY.md` | Estado vivo y siguiente paso probable. |
| `tracks/` | Trabajos vivos retomables. |
| `.generated/context-index.md` | Cache generado de topics, tracks, specs y aliases. |
| `skills/` | Skills locales portables; fuente canonica para slash commands. |

## Regla Sobre Archivos Preexistentes

Los archivos que existian antes de instalar el sistema agentico no deben quedar sueltos. Integrarlos en `docs/`, moverlos a una ubicacion indexada, archivarlos con estado claro o preguntar antes de borrarlos.

## Regla Anti-Bloat

`AGENTS.md`, `WORKING_MEMORY.md`, `TOPICS.md` y tracks activos no deben convertirse en lectura obligatoria amplia ni transcript. Si un archivo acumula historia, compactar la ruta caliente y mover detalle a referencia profunda o archivo historico.
