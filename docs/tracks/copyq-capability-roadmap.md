---
id: copyq-capability-roadmap
status: active
updated: 2026-06-05
---

# CopyQ Capability Roadmap

Estudio comparativo de capacidades de CopyQ contra Copicu. El objetivo no es copiar CopyQ ni prometer compatibilidad, sino usarlo como mapa de posibilidades y decidir qué vale la pena absorber, mejorar o descartar.

## Fuentes Consultadas

Fuentes oficiales principales:

- CopyQ docs index: https://copyq.readthedocs.io/en/stable/index.html
- Basic Usage: https://copyq.readthedocs.io/en/stable/basic-usage.html
- Keyboard: https://copyq.readthedocs.io/en/stable/keyboard.html
- Tabs and Items: https://copyq-docs.readthedocs.io/en/latest/tabs-and-items.html
- Images: https://copyq.readthedocs.io/en/stable/images.html
- Tags: https://copyq.readthedocs.io/en/stable/tags.html
- Pin Items: https://copyq.readthedocs.io/en/stable/pin-items.html
- Writing Commands and Adding Functionality: https://copyq-docs.readthedocs.io/en/latest/writing-commands-and-adding-functionality.html
- Command Examples: https://copyq.readthedocs.io/en/stable/command-examples.html
- Scripting API: https://copyq-docs.readthedocs.io/en/latest/scripting-api.html
- Command Line: https://copyq-de.readthedocs.io/de/stable/command-line.html
- Security: https://copyq.readthedocs.io/en/latest/security.html
- Password Protection: https://copyq.readthedocs.io/en/latest/password-protection.html
- Sessions: https://copyq.readthedocs.io/en/stable/sessions.html
- Backup: https://copyq.readthedocs.io/en/stable/backup.html
- Writing Raw Data: https://copyq.readthedocs.io/en/stable/writing-raw-data.html
- Synchronize with Documents: https://copyq.readthedocs.io/en/stable/synchronize.html

## Resumen Ejecutivo

Copicu ya cubre parte del núcleo que hace útil a CopyQ:

- watcher de clipboard;
- historial persistido;
- picker keyboard-first;
- copy selected item;
- paste-to-previous-window;
- tray y global shortcut;
- edición/borrado básico;
- imágenes image-only con PNG/blobs;
- self-write suppression;
- host API inicial.

Lo que CopyQ todavía tiene y Copicu no:

- tabs/colecciones reales;
- pinning/favorites robusto;
- comandos automáticos;
- comandos de menú/global shortcuts configurables;
- scripting/CLI completa;
- preservación rich MIME más amplia;
- HTML/RTF/file-list;
- tags con reglas visuales;
- backup/import/export;
- settings completos;
- seguridad avanzada: ignored windows, secret clipboard detection, encryption;
- screenshots integrados;
- sync con carpetas;
- external editors;
- session/config/data path management;
- acción/debug/log tooling.

La oportunidad de Copicu no es reimplementar eso igual. La oportunidad es hacerlo mejor con:

- Rust host chico y testeable para native flows;
- SQLite + blobs desde el inicio;
- metadata estructurada separada del payload;
- comandos como actions typed, no scripts sueltos de texto;
- plugins personales JS/TS con capabilities explícitas;
- AI como capa transversal: búsqueda vaga, tagging, resumen, OCR/caption, agrupación y acciones inteligentes.

## Estado Comparativo

| Área | CopyQ | Copicu hoy | Decisión recomendada |
| --- | --- | --- | --- |
| Clipboard text history | Sí | Sí | Mantener y endurecer dedup/retention. |
| Picker keyboard-first | Sí | Sí | Seguir CopyQ como baseline, pero con UI más moderna. |
| Paste-to-previous-window | Sí | Sí, Windows-first | Endurecer errores, timing y targets elevados. |
| Tray/global shortcut | Sí | Sí | Agregar settings y single-instance. |
| Edit/delete | Sí | Sí básico | Completar con undo/confirmación para operaciones riesgosas. |
| Pin/favorites | Sí | No | Implementar pronto. |
| Tabs/collections | Sí | No | Adaptar como filtros/colecciones, no como UI pesada. |
| Tags/notes | Sí | Parcial: metadata text/tags/notes | Mejorar como metadata estructurada. |
| Images | Sí | Primer corte image-only | Mantener, agregar detalle/full preview si hace falta. |
| HTML/RTF | Sí | No | Próximo rich format con spec. |
| File lists/raw MIME | Sí | No | Diseñar `clipboard_item_formats`; implementar por demanda. |
| Commands/actions | Sí | No como usuario | Implementar actions typed antes que scripting libre. |
| Scripting | Sí | No | Posponer runtime completo; empezar con plugin API propia. |
| CLI | Sí | No | Agregar CLI chica luego: show/search/copy/paste/export. |
| Security ignore/secret | Sí | No | Prioridad alta para dogfood. |
| Encryption | Sí | No | Posterior, pero diseñar para no bloquear. |
| Backup/import/export | Sí | No | Prioridad media-alta antes de uso intenso. |
| Screenshots | Sí | No integrado | Candidato fuerte: screenshot -> item image + OCR/caption opcional. |
| Sync with documents | Sí | No | Reinterpretar como “watched folders / knowledge drops”. |
| AI | No nativo como eje | No todavía | Diferenciador principal de Copicu. |

## Decisiones De Alcance 2026-06-05

Estas decisiones refinan el roadmap CopyQ. No cambian la dirección de producto: CopyQ sigue como baseline funcional, no como contrato de paridad.

### Prioridad Actual Del Usuario

Orden preferido tentativo:

1. Settings bien planteados.
2. Lista virtual/infinite scroll + búsqueda paginada contra SQLite.
3. Move-to-top y drag & drop para posición manual de items.
4. Actions/scripting como superficie única para comandos.
5. Rich MIME research.
6. AI metadata + búsqueda vaga, más adelante.

Postergar por ahora:

- favorites/pinning;
- privacy basics;
- screenshots;
- sync con carpetas.

Investigar/entender antes de decidir:

- retention;
- dedupe completo;
- external editors;
- session/config/data path management.

### Decidido Hacer

#### Settings completos

Vamos a hacer settings completos. No solo constantes en código.

Dirección:

- settings de shortcut, picker, capture, privacy, retention, theme, paste, AI y actions;
- storage en SQLite o archivo config versionado, con API host typed;
- UI searchable, no panel enorme estilo preferencias clásicas.

Idea mejor que CopyQ: settings como comandos/config declarativa. Cada action/plugin puede declarar su propio schema de settings, pero el host mantiene validación, defaults y export.

Primer corte de diseño:

- diseñar settings antes de implementar muchas opciones;
- evitar ventana de preferencias gigante;
- preferir settings buscables, agrupadas y accionables;
- evaluar usar el flujo/skill de diseño que viene funcionando bien para diseñar esta superficie local, aunque no sea web pública.

Secciones candidatas:

- General;
- Picker;
- Clipboard capture;
- Paste behavior;
- History/storage;
- Actions/scripting;
- Privacy;
- Appearance;
- Advanced/debug.

#### Action/debug/log tooling

Vamos a tener tooling de acción/debug/log como parte central de la superficie de comandos/scripting.

Dirección:

- tabla `action_runs`;
- eventos por etapa;
- errores seguros sin payload;
- debug bundle redacted;
- vista “por qué no se capturó/pegó/ejecutó”.

Idea mejor que CopyQ: cada comando/action tiene trazabilidad tipo execution timeline, con permisos, input summary, output summary, target, timing y error class.

### Decidido No Hacer Por Ahora

#### Tabs clásicas

No vamos a implementar tabs CopyQ-style como unidad primaria de organización.

Reemplazo Copicu:

- filtros persistentes;
- tags;
- smart collections;
- queries por tipo/app/fecha/tag/texto/metadata;
- colecciones virtuales sobre un mismo item.

Razón: tabs fuerzan un modelo de carpetas. Copicu puede usar metadata y filtros para que un item aparezca en múltiples contextos sin duplicarlo ni moverlo.

#### Favorites/pinning

Por ahora no interesa como corte inmediato.

Nota: no eliminar del roadmap. Puede volver cuando retention o organización lo necesiten. De momento la prioridad de organización pasa por filtros, tags, move-to-top y drag & drop.

#### Screenshots integrados

Por ahora no interesa.

Nota: no cerrar la puerta técnicamente. Como Copicu ya maneja imágenes, screenshot puede volver como action/plugin más adelante, no como feature core.

#### Sync con carpetas

Por ahora no interesa.

Nota: folder sync queda postergado. Si vuelve, reinterpretarlo como colección backed-by-files o import/export de knowledge drops, no como tab sincronizada CopyQ-style.

### Investigar

#### Rich MIME preservation

Investigar preservación rich MIME: HTML, RTF, file-list y formatos custom.

Preguntas:

- qué formatos reales aparecen en nuestro uso diario;
- qué debe preservarse para copy-back fiel;
- qué debe quedarse solo como metadata/search preview;
- cuándo guardar inline vs blob;
- cómo evitar inflar DB y UI.

Posible dirección: tabla `clipboard_item_formats` con MIME, hash, byte_size, storage_kind y preview seguro.

#### Tags con reglas visuales

Investigar tags con reglas visuales.

Preguntas:

- tags manuales vs tags automáticos;
- colores/iconos por regla;
- tags protegidos/locked;
- tags AI con confidence;
- query syntax: `tag:foo`, `kind:image`, `app:chrome`.

Dirección probable: tags normalizados en tabla separada, con styles simples y sin contaminar payload.

#### Backup / import / export

Investigar backup/import/export.

Preguntas:

- export completo vs selección/colección;
- payload incluido o metadata-only;
- password/encryption en export;
- SQLite backup API vs zip con manifest;
- restore sin sobrescribir destructivamente.

Dirección probable: `.copicu-export.zip` con manifest JSON, DB snapshot/blobs y opción metadata-only.

#### Seguridad avanzada

Pensarlo antes de comprometer alcance completo.

Incluye:

- secret clipboard markers;
- ignored apps/windows;
- private mode;
- encryption at rest;
- AI/privacy gates;
- plugin permissions.

Dirección mínima segura: secret markers + ignore rules + pause capture antes que encryption completa.

#### External editors

Investigar external editors.

Preguntas:

- editar texto/HTML/imagen en herramienta externa;
- temp files y watcher de save;
- overwrite vs create revision;
- riesgos de filtrar payload a paths temporales.

Dirección probable: action explícita, no comportamiento automático. Revisions antes de overwrite destructivo.

#### Session/config/data path management

Investigar qué significa para Copicu.

CopyQ permite sesiones múltiples y override de config/data paths. Para Copicu puede mapear a:

- dev vs installed profile;
- portable mode;
- test profile;
- work/personal profile;
- ruta de DB/blobs configurable;
- perfil de privacidad/AI distinto por contexto.

No decidir aún si esto es feature de usuario o solo tooling de desarrollo.

#### Retention

Investigar y explicar antes de decidir.

Definición: retention es la política que decide cuánto historial conservar y qué se borra automáticamente. Puede ser por cantidad de items, antigüedad, tamaño total en disco o reglas por tipo.

Preguntas:

- queremos borrar por cantidad, edad, tamaño total o combinación;
- qué pasa con imágenes/blobs grandes;
- cómo evitar borrar algo que el usuario reordenó manualmente;
- si existe una zona protegida futura, cómo interactúa con retention.

### Unificar Comandos, Menú Y Scripting

CopyQ separa commands automáticos, commands de menú, global shortcuts y scripting. En Copicu queremos una sola superficie conceptual: `actions`.

Dirección:

- un modelo `Action` único;
- múltiples triggers:
  - menu item;
  - keyboard shortcut;
  - global shortcut;
  - clipboard rule;
  - command palette;
  - CLI;
  - plugin;
- mismo motor de ejecución;
- mismas capabilities;
- mismo logging;
- misma política de privacidad.

Esto evita tres sistemas paralelos. La diferencia entre “comando automático”, “comando de menú” y “script” pasa a ser solo trigger + input + permissions + output behavior.

### Lista Virtual, Infinite Scroll Y Búsqueda Paginada

CopyQ carga y filtra con un modelo suficiente para su UI, pero Copicu debe diseñar desde el inicio para miles o cientos de miles de items.

Decisión de dirección:

- no cargar todo el historial en React;
- renderizar solo lo visible y un overscan chico;
- pedir páginas a SQLite por cursor;
- al buscar, consultar DB/FTS paginado, no filtrar solo memoria;
- mantener resultados visibles mientras llegan páginas nuevas;
- preservar selección/scroll aunque cambie el query.

Fuentes/patterns:

- TanStack Virtual infinite scroll example combina React Query infinite loading con un virtualizer y un loader row al final de la lista: https://tanstack.com/virtual/v3/docs/framework/react/examples/infinite-scroll
- TanStack Query infinite queries provee páginas, `fetchNextPage`, `hasNextPage`, `getNextPageParam` y límites de páginas cacheadas para performance/memoria: https://tanstack.com/query/latest/docs/framework/react/guides/infinite-queries
- TanStack Virtual expone `scrollToIndex`, `scrollBy` y medición virtualizada de items visibles/buffer: https://tanstack.com/virtual/latest/docs/api/virtualizer
- SQLite FTS5 es el módulo oficial para full-text search eficiente sobre colecciones grandes de documentos: https://www.sqlite.org/fts5.html

Arquitectura recomendada:

```text
React picker
  -> virtualizer renders visible rows + overscan
  -> query key includes filter/search/sort
  -> useInfiniteQuery-like client state
  -> Tauri command search_history_page(request)
  -> Rust storage query with cursor
  -> SQLite normal query or FTS5 query
```

API host candidata:

```ts
type HistoryPageRequest = {
  query: string;
  filters: {
    kinds?: string[];
    tags?: string[];
    sourceApps?: string[];
  };
  sort: "recent" | "manual" | "used" | "relevance";
  cursor: null | {
    afterSortValue: number | string;
    afterId: number;
    rank?: number;
  };
  limit: number; // 40-100
};

type HistoryPage = {
  items: HistoryItem[];
  nextCursor: HistoryPageRequest["cursor"];
  totalEstimate?: number;
};
```

Query patterns:

- feed normal: keyset pagination por `(sort_key, id)`, no `OFFSET` grande;
- search plain: FTS5 cuando exista, fallback `LIKE` paginado mientras el índice no esté;
- fuzzy/AI later: retornar candidatos paginados por ranking, con cursor de `(score, id)`;
- manual ordering: columna `manual_rank` o tabla de positions para items fijados/reordenados.

UI behavior:

- cargar primera página de 40-80;
- overscan visual de 20-30 items;
- loader row al final dispara `fetchNextPage`;
- debounce corto de query;
- cancelar/ignorar requests viejos por `queryVersion`;
- si el query cambia, reset scroll a top;
- si llegan nuevas capturas y el usuario no está arriba, mostrar “new clips” en vez de saltar scroll;
- mantener selección por `item.id`, no por índice.

Riesgos:

- previews de altura variable complican virtualización;
- imágenes grandes requieren altura estimada y medición después de carga;
- FTS ranking + keyset cursor exige diseño cuidadoso;
- drag & drop con virtualización requiere manejar drop target por item id, no por DOM index.

Primer corte recomendado:

1. Agregar comando `list_history_page` con keyset pagination para feed reciente.
2. Integrar TanStack Virtual sin cambiar diseño visual.
3. Agregar loader row e infinite pages.
4. Después agregar `search_history_page`.
5. Luego evaluar FTS5.

### Move-To-Top Y Drag & Drop

Move-to-top sigue siendo deseable, pero se combina con posición manual.

Dirección:

- item recapturado puede subir arriba por `last_copied_at`;
- drag & drop permite fijar orden manual en una vista;
- no confundir orden global con orden de filtros;
- con virtualización, drag debe operar por `item_id` y rank, no por índice visible.

Implementación posible:

- `manual_rank` nullable;
- si `manual_rank` existe, vista manual ordena por rank;
- move-to-top asigna rank/timestamp según modo activo;
- usar fractional ranking (`rank` entre vecinos) para evitar renumerar toda la lista.

## Brechas Prioritarias

### P0: Para Dejar De Ser MVP/Dogfood

#### Dedup Y Move-To-Top

CopyQ puede mover el item seleccionado arriba según settings, y pinned items tienen reglas especiales de posición. Copicu hoy ignora duplicados consecutivos, pero no resuelve bien el caso “copié otra vez algo viejo”.

Implementación sugerida:

- agregar `copy_count`, `last_copied_at_unix_ms`, `last_used_at_unix_ms`;
- al capturar hash existente:
  - si no está pinned, actualizar timestamps y mover al top lógico;
  - si está pinned, actualizar uso sin moverlo de la zona pinned;
  - no insertar fila duplicada salvo setting futuro “keep duplicates”.
- ordenar feed por `pinned desc`, luego `last_copied_at desc` o `created_at desc`.

Mejor que CopyQ:

- mostrar una animación sutil de “reused existing clip”;
- guardar historial de usos sin duplicar payload;
- permitir búsqueda por “usado recientemente” vs “capturado recientemente”.

#### Pin/Favorites

CopyQ pinnea items para que no se muevan ni se borren accidentalmente cuando el historial está lleno. Copicu necesita esto pronto porque el usuario ya lo usa.

Implementación sugerida:

- columnas `pinned_at_unix_ms`, `favorite_rank`, `locked`;
- acción `pin/unpin` en menú y shortcut `Ctrl+P` o `P`;
- pruning nunca borra pinned;
- borrado de pinned requiere unpin o confirmación.

Mejor que CopyQ:

- separar “favorite” de “locked”:
  - favorite: aparece arriba;
  - locked: protegido contra delete/prune;
  - pinned position: posición manual opcional.

#### Privacy Basics

CopyQ permite deshabilitar almacenamiento, ignorar ventanas por título y reconoce marcadores de contenido secreto. En Windows mira formatos como `Clipboard Viewer Ignore`, `ExcludeClipboardContentFromMonitorProcessing`, `CanIncludeInClipboardHistory=0` y `CanUploadToCloudClipboard=0`.

Implementación sugerida:

- extender `clipboard_probe` para detectar secret markers de Windows;
- si secret marker existe, registrar solo evento seguro: `ignored_secret`;
- settings iniciales:
  - pause monitoring;
  - ignored process names;
  - ignored window title regex;
  - allowlist opcional para apps concretas.

Mejor que CopyQ:

- UI clara: “captura pausada / app ignorada / contenido marcado secreto”;
- reglas por proceso además de título;
- modo “private session” con timeout;
- nunca mandar secretos a plugins/AI salvo override explícito.

#### Settings Mínimos

CopyQ tiene configuración amplia para shortcuts, history, items, commands y plugins. Copicu necesita lo mínimo para uso diario.

Implementación sugerida:

- tabla `settings(key text primary key, value_json text)`;
- settings iniciales:
  - shortcut global;
  - `Enter`: copy o paste;
  - focus-lost hide true/false;
  - retention count/age/bytes;
  - ignored apps/window regex;
  - theme/system/light/dark.

Mejor que CopyQ:

- settings como comandos typed y exportables;
- search palette para settings;
- perfiles simples: `normal`, `presentation`, `private`, `debug`.

### P1: Funciones CopyQ Que Conviene Absorber

#### Details / Formats Panel

CopyQ permite ver formatos disponibles de un item y advierte que algo puede parecer imagen pero ser HTML. Copicu ya tiene probe metadata-only y modelo MIME-first para imágenes, pero no expone una vista de formatos.

Implementación sugerida:

- acción `Show details/formats`;
- panel con:
  - content kind;
  - MIME primary;
  - byte size;
  - dimensions;
  - blob paths relativos;
  - created/used/copied timestamps;
  - available formats cuando existan.

Mejor que CopyQ:

- mostrar “qué se preservó” vs “qué se descartó”;
- botón “create issue/debug bundle” sin payload;
- AI explanation opcional: “este clip parece HTML con imagen remota”.

#### Tabs / Collections

CopyQ usa tabs para colecciones y permite mover/copiar items entre tabs; comandos automáticos pueden organizar por tipo o ventana.

Implementación sugerida:

- no empezar con tabs visuales pesadas;
- crear `collections` y `collection_items`;
- vistas iniciales:
  - Clipboard;
  - Pinned;
  - Links;
  - Code;
  - Images;
  - Recent from App;
  - Smart collections.

Mejor que CopyQ:

- colecciones como filtros persistentes sobre metadata;
- un item puede estar en múltiples colecciones;
- smart collections con queries SQL/FTS/AI;
- AI puede sugerir colecciones: “YPF”, “prompts”, “bugs”, “URLs de research”.

#### Tags Y Notes

CopyQ tags son visibles como íconos/textos con reglas de estilo y se guardan como formato especial. Copicu ya tiene `title`, `tags`, `notes`, pero todavía es texto plano básico.

Implementación sugerida:

- normalizar tags en tabla separada:
  - `tags(id, name, color, icon, created_at)`;
  - `item_tags(item_id, tag_id, source)`;
- mantener notes Markdown;
- tags automáticos por reglas:
  - URL;
  - code;
  - email;
  - image;
  - app source.

Mejor que CopyQ:

- tags manuales y tags sugeridos separados;
- AI tags con confidence;
- no mezclar metadata con payload;
- búsqueda `tag:work`, `app:chrome`, `kind:image`.

#### Commands / Actions

CopyQ commands pueden ser automáticos, de menú o global shortcuts; pueden matchear por contenido, ventana, filtro externo o formato, y pueden transformar items o guardar output en tabs.

Implementación sugerida:

- no arrancar con scripting libre;
- crear sistema de `actions` typed:
  - `manual_item_action`;
  - `manual_selection_action`;
  - `clipboard_rule`;
  - `global_hotkey_action`;
  - `scheduled_or_maintenance_action`;
- cada action declara:
  - trigger;
  - input selector;
  - capabilities;
  - output behavior;
  - privacy policy.

Mejor que CopyQ:

- actions con schema versionado;
- permisos/capabilities simples desde el inicio;
- dry-run y logs seguros;
- UI de “what will this action read/write?”;
- integración natural con AI.

Primeras actions útiles:

- paste as plain text;
- open URL;
- copy escaped JSON/string;
- join selected items;
- title-case/lower/upper;
- summarize clip;
- extract todos;
- tag selected items;
- OCR/caption image;
- “vaguear”: buscar por intención, no texto literal.

#### Automatic Rules

CopyQ automatic commands se disparan en clipboard change, en orden, y pueden detener procesamiento con ignore/remove. Esto es potente pero riesgoso.

Implementación sugerida:

- regla typed `clipboard_rules`;
- evaluar reglas en Rust/TS host, no scripts arbitrarios al inicio;
- conditions:
  - app/process/window;
  - MIME/kind;
  - regex;
  - size;
  - secret marker;
  - AI classifier opcional.
- actions:
  - ignore;
  - tag;
  - move to collection;
  - normalize;
  - summarize later;
  - alert.

Mejor que CopyQ:

- regla auditada antes de tocar payload;
- privacy guard antes que cualquier plugin/AI;
- queue async para AI, sin bloquear watcher;
- historial de decisiones: `captured`, `ignored_secret`, `ignored_rule`, `tagged_rule`.

#### CLI Chica

CopyQ CLI puede manipular tabs, items, clipboard y config. Copicu no necesita copiar todo, pero una CLI pequeña sería muy útil para automatización propia.

Implementación sugerida:

- `copicu show`
- `copicu hide`
- `copicu search <query>`
- `copicu copy <id>`
- `copicu paste <id>`
- `copicu add --text`
- `copicu pause/resume`
- `copicu export`
- `copicu health`

Mejor que CopyQ:

- JSON output first;
- sin problemas de stdout en Windows;
- no exponer payload por defecto: `--include-content` explícito;
- compatible con scripts AHK/PowerShell personales.

#### Backup / Import / Export

CopyQ documenta backup manual copiando config/data dirs y export/import desde GUI/CLI. Copicu necesita algo más seguro por usar SQLite + blobs.

Implementación sugerida:

- export `.copicu-export.zip`:
  - SQLite snapshot;
  - blobs referenciados;
  - manifest JSON;
  - optional password later.
- import creates new collection first, no overwrite destructive by default;
- backup command stops watcher briefly or uses SQLite backup API.

Mejor que CopyQ:

- export redacted metadata-only;
- export selected collection;
- export AI-ready dataset without payload;
- health check before/after export.

### P2: Rich Content Y Power Features

#### HTML / RTF

CopyQ can store text plus HTML/rich text and write multiple MIME formats. Copicu currently stores plain text and images.

Implementación sugerida:

- agregar tabla `clipboard_item_formats`:
  - `item_id`;
  - `mime`;
  - `storage_kind`: inline/blob;
  - `text_preview`;
  - `byte_size`;
  - `hash`;
  - `is_primary`;
  - `preservation_policy`.
- para HTML:
  - guardar raw HTML;
  - derivar plain text para búsqueda;
  - sanitizar preview;
  - copy-back con `text/html` + `text/plain`.

Mejor que CopyQ:

- preview HTML seguro en sandbox;
- “copy as plain text” visible;
- AI summarize/extract links from HTML;
- remote image warnings.

#### File Lists

CopyQ puede guardar formatos como `text/uri-list` y formatos especiales de file managers mediante comandos. En Windows habrá formatos propios para file drops.

Implementación sugerida:

- detectar file-list sin leer contenido por defecto;
- guardar rutas solo si setting lo permite;
- metadata:
  - count;
  - extensions;
  - total known size opcional;
  - source app.

Mejor que CopyQ:

- privacy prompt para guardar rutas;
- action “copy file list as Markdown”;
- action “open containing folder”;
- AI grouping de archivos por proyecto.

#### Screenshots

CopyQ tiene screenshot/screenshotSelect y comandos para guardar imágenes. Copicu ya tiene imágenes, así que screenshot es una extensión natural.

Implementación sugerida:

- `capture_screenshot(full|region|window)` en Rust o helper externo;
- guardar como image item con metadata source=`screenshot`;
- shortcut configurable;
- optional annotation later.

Mejor que CopyQ:

- OCR automático opcional;
- caption AI opcional;
- link screenshot con active window/app/task;
- “copy screenshot and ask AI” action.

#### External Editors

CopyQ permite editar items en editor externo, incluyendo imágenes. Copicu puede hacerlo mejor con explicit handoff.

Implementación sugerida:

- action `open in external editor`;
- crear temp file desde blob/text;
- watch save;
- importar cambios como nueva revision or overwrite with confirmation.

Mejor que CopyQ:

- revisions;
- diff preview for text;
- external editor profiles per content kind.

#### Sync With Documents

CopyQ puede sincronizar tabs con carpetas: archivos `.txt`, `.html`, imágenes aparecen como items. Copicu puede reinterpretarlo como “folder-backed collections”.

Implementación sugerida:

- collection source `folder`;
- one-way import first;
- file watcher later;
- formats by extension;
- never delete files without explicit command.

Mejor que CopyQ:

- use as knowledge/project drop folder;
- AI index folder-backed clips;
- sync selected notes/prompts as Markdown files.

## P3: Más Allá De CopyQ

### Búsqueda Vaga / “Vaguear”

CopyQ search is mostly typed filtering and scripting. Copicu can make search semantic.

Implementación sugerida:

- local FTS5 first;
- query parser:
  - plain text;
  - `kind:image`;
  - `tag:foo`;
  - `app:chrome`;
  - `after:today`;
- semantic layer later:
  - embeddings for text;
  - OCR/caption embeddings for images;
  - hybrid ranking.

Experiencia:

- usuario escribe: “el snippet de sqlite que copié ayer”;
- Copicu searches text, metadata, app, time, tags and semantic vectors;
- returns likely items with reason labels.

### AI Metadata Pipeline

AI should not mutate payload by default. It should produce metadata.

Pipeline:

1. capture item;
2. classify cheap locally/rules;
3. enqueue optional AI jobs;
4. write metadata:
   - title;
   - summary;
   - tags;
   - entities;
   - language;
   - code language;
   - URL domain;
   - image caption/OCR;
5. expose metadata in search/actions.

Privacy:

- no AI for ignored/secret/private items;
- per-kind/per-app AI settings;
- manual “AI this item” before automatic external API.

### Smart Actions

CopyQ has commands; Copicu can have typed smart actions.

Examples:

- summarize selected clips;
- turn copied table into Markdown/CSV;
- extract JSON fields;
- explain code snippet;
- rewrite selected text in JP voice;
- create todo from copied Slack/email;
- compare two copied snippets;
- OCR screenshot and paste text;
- translate but preserve formatting;
- generate filename/title from image or text.

Architecture:

- `actions` table;
- `action_runs` table;
- host API:
  - `history.read`;
  - `clipboard.write`;
  - `window.focusPrevious`;
  - `input.paste`;
  - `ai.run`;
  - `metadata.write`;
- UI:
  - command palette;
  - item action menu;
  - global hotkeys.

### Context-Aware Clipboard

CopyQ can organize by window title with commands. Copicu can do richer source metadata.

Ideas:

- capture source process/window title;
- infer project/context;
- show “clips from current app/project”;
- auto-collections by app/domain/workspace;
- “paste most recent clip from this project”;
- “show clips copied while browser tab title matched X”.

### Personal Plugin System

CopyQ scripting is powerful but broad. Copicu can use a modern plugin model:

- JS/TS plugins loaded from user directory;
- manifest:
  - id/name/version;
  - actions;
  - hotkeys;
  - capabilities;
  - settings schema;
- plugin APIs typed and limited;
- no marketplace/sandbox initially because plugins are personal/trusted.

Better than CopyQ:

- TypeScript types;
- hot reload for personal development;
- clear host boundaries;
- testable plugin actions;
- no direct raw native access unless host exposes it.

## Roadmap Recomendado

### Slice 1: Salir De Dogfood MVP

- dedup/move-to-top;
- pin/favorites/locked;
- privacy basics: pause + ignored apps + secret markers;
- settings mínimos;
- paste failure policy.

### Slice 2: CopyQ Useful Parity

- details/formats panel;
- tags normalized;
- smart collections;
- CLI chica;
- backup/export/import;
- tray menu with recent/pinned items.

### Slice 3: Rich Formats

- `clipboard_item_formats`;
- HTML capture/preview/copy-back;
- RTF if needed;
- file-list capture;
- screenshot command.

### Slice 4: Actions Foundation

- typed manual actions;
- automatic rules;
- global hotkey actions;
- action run logs;
- “paste as plain text”, “join selected”, “open URL”, “copy escaped”.

### Slice 5: AI Layer

- AI metadata jobs;
- vague/semantic search;
- OCR/caption for images/screenshots;
- summarize/extract/transform actions;
- privacy gates for AI.

### Slice 6: Plugin Runtime

- JS/TS plugin directory;
- manifest and capabilities;
- typed SDK;
- reload plugin;
- plugin settings;
- first personal plugins.

## Qué No Conviene Copiar Literalmente

- CopyQ’s full scripting API surface.
- Qt-style command configuration UI.
- Per-feature plugin dependency model for basic things like images/tags/pinning.
- Exact tab semantics as the only organization model.
- Full MIME fidelity before we know which formats matter.
- Encryption before backup/settings/privacy basics, unless dogfood reveals urgent need.

## Próximas Specs Recomendadas

1. `specs/003-history-hardening/`
   - dedup/move-to-top;
   - pin/favorites/locked;
   - retention/blob cleanup.

2. `specs/004-privacy-and-settings/`
   - pause monitoring;
   - ignored apps/windows;
   - secret markers;
   - settings storage/UI.

3. `specs/005-item-details-and-collections/`
   - details/formats panel;
   - normalized tags;
   - smart collections.

4. `specs/006-actions-foundation/`
   - typed actions;
   - action runs;
   - manual/menu/global triggers.

5. `specs/007-ai-metadata-and-vague-search/`
   - AI metadata;
   - semantic/vague search;
   - privacy gates.

## Decisión Recomendada

Keep CopyQ as baseline, but define Copicu as:

> A local clipboard intelligence layer: CopyQ-class clipboard reliability, plus structured metadata, typed actions, personal plugins, and privacy-aware AI.

Immediate next move: do not start with scripting or AI. Start with history hardening because it improves daily use and creates the storage semantics that actions, collections and AI will need.
