# Decisiones

## Decisiones De Producto/Arquitectura

### 2026-06-29 - Issues publicos solo si son reales o curados

Estado: accepted

Decision: No mantener issues publicos sembrados solo para aparentar actividad o contributor funnel. Los issues de GitHub deben venir de feedback real, bugs reproducibles o tareas curadas con contexto y verificacion concreta. Los issues generados para launch (#1-#8 y #11-#18) se borraron despues de publicar `v0.3.0` porque sonaban artificiales.

Motivo: Un repo publico temprano transmite mas confianza con pocos issues reales que con backlog promocional fabricado.

Proximo paso: si hace falta abrir `good first issue`, escribirlo como tarea real y verificable, preferentemente derivada de dogfood o feedback externo.

### 2026-06-29 - Metadata y search como flujo core del picker

Estado: accepted

Decision: La metadata editable se trata como superficie core del picker: `Ctrl+Shift+C` abre metadata nativa para el item activo o batch metadata para multiseleccion; batch metadata ofrece append, replace y smart merge; `meta:` busca metadata visible editable (`title`, `notes`, `tags`), mientras `ctx:` queda para contexto automatico oculto. Por ahora no se expone provenance user/assistant/enrichment en UX; se puede modelar mas adelante sin complicar el flujo actual.

Motivo: JP necesita editar/buscar metadata rapidamente, incluso en batches. El script historico active-only no cubria multiseleccion y mezclaba una accion core con automation opcional.

Proximo paso: mantener ayuda in-app, topic de search y shortcuts sincronizados; si se agrega provenance, primero definir storage/source por entrada/tag antes de exponer filtros como `meta.by:*`.

### 2026-06-18 - El hotkey del picker debe abrir con foco

Estado: accepted

Decision: El hotkey global del picker debe mostrar y activar/enfocar la ventana por defecto, de modo que el search reciba teclado inmediatamente. La ruta no-activate queda solo como fallback diagnostico con `COPICU_PICKER_NO_ACTIVATE=1`, no como comportamiento normal.

Motivo: Copicu es keyboard-first. El workaround no-activate de 2026-06-10 evitaba un bug visual de Codex/WebView2, pero introducia una regresion peor: el picker podia aparecer visible sin estar keyboard-ready, dejando la escritura en la app previa.

Oracle: antes de aceptar cambios en hotkey/foco/show/hide del picker, enfocar una app externa, disparar el hotkey, tipear un token sin click ni llamada manual a `focus`, y confirmar que el token aparece en el search de Copicu.

Proximo paso: mantener este oracle en `tests/manual/dogfood/PICKER_COMPUTER_USE_FOCUS_BATTERY.md` y no promover rutas no-activate sin una alternativa que conserve input inmediato.

### 2026-06-12 - Ventanas de producto con surface registry

Estado: accepted

Decision: Las superficies ricas y durables fuera del picker (`metadata`, `scripts`, `history-manager` y similares) deben implementarse como ventanas Tauri standalone de producto, con label estable, capability propia, lifecycle Rust-owned, bounds policy y guards backend por `window.label()`. No deben vivir como pseudo-modales dentro de `ui-host`. En React/Vite, el default sera un solo `index.html` con routing por `window.label()` o `?window=<label>`; multiples HTML entrypoints quedan diferidos hasta que una superficie sea suficientemente grande para justificar build/config separado.

Motivo: La documentacion oficial Tauri v2 modela ventanas por label y capabilities por ventana/webview; tambien advierte que los comandos propios registrados quedan disponibles por defecto salvo que se acoten. Un maintainer de Tauri recomienda para React resolver multiwindow con un solo HTML y router salvo apps grandes. El pattern reduce drift, mantiene el picker liviano y evita que `ui-host` se convierta en un window-manager falso.

Proximo paso: crear un surface registry host-owned que declare `label`, `route`, `kind`, `capabilities`, `lifecycle`, `boundsPolicy`, `chromeVariant` y `allowedCommands`, y usarlo como primer corte antes de crear `metadata` o `scripts`.

## Decisiones Agenticas

### 2026-06-18 - Tratar Copicu como downstream de AOS

Estado: accepted

Decision: Copicu mantiene una instalacion AOS local adaptada al proyecto. `C:\dev\os` es upstream manager y no se copia como metasistema: no viajan registry global, working memory/tracks/decisiones del kit, inventarios personales ni docs que declaren a Copicu como canon. Las mejoras upstream solo entran si se reescriben como reglas, scripts, skills, topics o adapters utiles para Copicu.

Motivo: Copicu necesita beneficiarse de AOS sin contaminar su contexto de producto ni cargar gobierno/historia de otros repos.

Proximo paso: al ejecutar `actualizar aos`, seguir `docs/topics/agentic-os-operations.md` y reportar piezas aplicadas/omitidas.

### 2026-06-12 - Canonizar skills locales en `docs/skills`

Estado: accepted

Decision: `docs/skills/` es la fuente canonica de skills locales del repo. `.agents/skills` queda solo como junction de compatibilidad para descubrimiento tecnico de Codex. Los comandos operativos `sigamos`, `cerrar sesion`, `continuar sesion`, `continuar sesion con gol` y `realinear os` se representan como skills locales versionadas dentro de `docs/skills/`.

Motivo: las skills dan discovery barato para slash commands, pero la logica durable debe seguir en topics, scripts y docs canonicos para evitar drift y mantener el sistema agentico visible.

Proximo paso: mantener `docs/skills/`, `scripts/ensure-skills-link.ps1`, `context-index` y `context-audit` alineados cuando se actualice AOS.

### 2026-06-11 - Simplificar continuidad con `gol`

Estado: accepted

Decision: el sistema agentico conserva cuatro comandos de continuidad: `cerrar sesion`, `continuar sesion`, `continuar sesion con gol` y `siguiente`. `continuar sesion con gol` equivale a `continuar sesion`, pero el handoff debe pedir que el thread nuevo arranque con `gol` para el proximo lote acordado. `siguiente` es alias de `continuar sesion con gol`. `continuar con gol` queda solo como alias de `continuar sesion con gol`; se elimina la variante que seguia trabajando con Goal en la misma sesion. `goal` / `gol` como comando suelto deja de ser regla automatica del sistema agentico.

Motivo: habia demasiadas variantes parecidas y la diferencia entre misma sesion, nueva sesion y Goal generaba ambiguedad. La continuidad operativa queda basada en cierre de valor mas thread nuevo cuando aparece `continuar sesion`, `continuar sesion con gol`, `continuar con gol` o `siguiente`.

Proximo paso: mantener AGENTS, topics, glossary, working memory y guia alineados con esta matriz simple.

### 2026-06-11 - Usar Goal para tareas concretas

Estado: superseded by 2026-06-11 - Simplificar continuidad con `gol`

Decision reemplazada: se elimino la regla automatica de `goal` / `gol` como comando suelto del sistema agentico y se elimino la variante `continuar con goal` que seguia en la misma sesion. Ver la decision nueva de continuidad con `gol`.

Motivo: la semantica anterior era ambigua frente a `continuar sesion`, `continuar sesion con gol` y `siguiente`.

Proximo paso: usar la matriz nueva.

### 2026-06-10 - Prevenir contaminacion de contexto

Estado: accepted

Decision: La ruta inicial de Copicu debe permanecer liviana. `AGENTS.md`, `WORKING_MEMORY.md`, `TOPICS.md` y tracks activos no deben convertirse en lectura obligatoria amplia, mini-historiales ni transcripts.

Motivo: `WORKING_MEMORY.md` habia acumulado una bitacora muy extensa y `AGENTS.md` forzaba lectura inicial amplia, contradiciendo el objetivo del sistema agentico: leer poco, elegir el topic correcto y abrir referencias profundas solo bajo demanda.

Proximo paso: mantener el archivo historico en `docs/reference/working-memory-archive-2026-06-10.md`, usar `docs/.generated/context-index.md` como entrada rapida y dejar que el audit avise si vuelve a crecer la ruta caliente.

### 2026-06-10 - Crear comando `realinear os`

Estado: accepted

Decision: `AGENTS.md` mantiene una instruccion corta para `realinear os` y el playbook completo vive en `docs/topics/agentic-os-operations.md`.

Motivo: Permite reparar drift sin cargar un procedimiento largo en la ruta caliente.

Proximo paso: usarlo para mantener la capa agentica alineada con AOS y las convenciones locales de Copicu.

### 2026-06-10 - Mantener guia humana como puerta de entrada

Estado: accepted

Decision: `docs/USER_GUIDE.md` es una guia humana breve, no una fuente de verdad operativa. Si hay conflicto, mandan `AGENTS.md`, topics, working memory, decisions y `GLOSSARY.md`.

Motivo: Una guia ayuda a entender el sistema, pero duplicar playbooks largos la volveria stale.

### 2026-06-11 - `continuar sesion` como handoff transaccional

Estado: accepted

Decision: `cerrar sesion` y `continuar sesion` comparten un cierre de valor obligatorio: extraer lo durable, rutearlo a docs vivos, regenerar indice y verificar drift cuando aplica. `continuar sesion` agrega la creacion de un thread nuevo con handoff compacto si la herramienta esta disponible; si no, devuelve un prompt pegable.

Motivo: La memoria durable del proyecto debe vivir en Markdown versionable del repo, no en cadenas de prompts ni en transcripts de chat. Esto reduce drift, mantiene la ruta caliente liviana y permite que una sesion nueva lea poco y continue trabajo real.

Proximo paso: mantener `docs/ASSISTANT_RULES.md`, `docs/topics/docs-knowledge-system.md` y `docs/USER_GUIDE.md` alineados si cambia el flujo de Codex Desktop para crear threads.

## Decididas Inicialmente

| Decision | Estado | Motivo | Fuente |
| --- | --- | --- | --- |
| Tomar CopyQ como baseline funcional fuerte, sin compatibilidad feature-for-feature | accepted | Evita caer en clon/paridad completa, pero reconoce que CopyQ define muchas capacidades base que Copicu debe absorber o superar. | Discusion inicial + aclaracion 2026-06-04 |
| Usar Tauri 2 como shell desktop | accepted | Mejor fit de largo plazo para una app local liviana. | Discusion inicial integrada |
| Usar Rust para integraciones nativas | accepted | Clipboard, foco, paste y storage sensible necesitan control nativo. | Discusion inicial integrada |
| Usar SQLite para historial persistido | accepted | Adecuado para busqueda local, metadata y estado offline. | Discusion inicial integrada |
| Plugins personales primero, sin sandbox/permisos complejos | accepted | El sistema de plugins es para uso propio al inicio; evitar sobreingenieria de privacidad, marketplace o terceros no confiables. | Aclaracion 2026-06-04 |
| Descartar Electrobun para el arranque | accepted | El proyecto necesita APIs maduras de clipboard, shortcut global, tray, paste e integraciones nativas. | Discusion inicial integrada |
| MVP 0 como spike funcional nativo antes de UI/UX | accepted | El riesgo principal es validar clipboard, tray, shortcut, foco previo, paste y SQLite; la UI puede ser minima hasta probar el flujo. | Conversacion 2026-06-05 |
| React + Vite + TypeScript para el scaffold inicial | accepted | Ya esta implementado y validado con build/visual smoke; no conviene reabrir framework hasta que aparezca una razon concreta. | Scaffold 2026-06-05 |
| Usar Context7 CLI bajo demanda y no MCP persistente | accepted | Aporta docs tecnicas actuales con bajo peso de contexto; evita cargar herramientas permanentes. | Conversacion 2026-06-05 |
| Research gate antes de elegir librerias | accepted | Evita fijar dependencias por memoria o intuicion; cada necesidad tecnica debe validarse con Context7 y fuentes primarias web, y documentarse en `docs/topics/`. | Conversacion 2026-06-05 |
| Clipboard MVP 0 con watcher nativo | accepted | Watch/event-driven capture es basico para un clipboard manager; usar `clipboard-rs` watcher como primera opcion, fallback Windows con `AddClipboardFormatListener`/`WM_CLIPBOARDUPDATE`; read/write desde backend Rust. | Research 2026-06-05 |
| Shortcut y tray MVP 0 por backend Rust | accepted | Evita registrar lifecycle desde React y reduce permissions frontend; usar `tauri-plugin-global-shortcut` y `TrayIconBuilder` desde setup Rust. | Research 2026-06-05 |
| SQLite MVP 0 con `rusqlite` | accepted | El historial es core nativo y sensible; usar `rusqlite` con `bundled` y `rusqlite_migration`, sin exponer SQL arbitrario al frontend via Tauri SQL. | Research 2026-06-05 |
| Windows paste MVP 0 con `windows` crate | accepted | Paste-to-previous-window necesita handles y Win32 directo; usar `GetForegroundWindow`, `SetForegroundWindow` y `SendInput`, con `enigo` solo como fallback de key injection. | Research 2026-06-05 |
| Picker preview-first y keyboard-first | accepted | La vista principal debe mostrar contenido util directamente y operar como quick picker: escribir filtra, flechas/Page/Home/End navegan, Enter activa, Escape limpia/oculta. CopyQ/CleanClip/Paste/Pano aportan buenas referencias, pero Copicu no copiara su estetica ni su modelo exacto. | `docs/topics/picker-interaction.md` + conversacion 2026-06-05 |
| Acciones de picker como API host reusable | accepted | `Enter`, doble click, shortcuts, tray y futuros plugins deben compartir primitivas (`activate_item`, `write_item`, `mark_used`, `hide_picker`) en vez de acoplar clipboard/paste a handlers React. | Refactor 2026-06-05 |
| Paste default target-aware en Windows | accepted | `Shift+Insert` funciona bien para Notepad/editor-like, pero browser input fue mas confiable con `Ctrl+V`. `PasteShortcut::Default` resuelve por proceso: browsers conocidos usan `Ctrl+V`; el resto mantiene `Shift+Insert`. | Validacion manual + implementacion 2026-06-05 |
| Imagenes con modelo MIME-first y PNG normalizado | accepted | CopyQ maneja items como MIME -> bytes y prioriza `image/png`. Para Copicu, el primer corte de imagenes debe guardar PNG normalizado como blob principal, metadata en SQLite, thumbnail separado, limites desde el dia uno y skip de imagen binaria cuando tambien hay texto salvo modo rich explicito. Preservar MIME original solo si aporta fidelidad real. | Research CopyQ 2026-06-05 |
| Picker sin decoracion irrelevante por item | accepted | La lista principal debe priorizar contenido: no mostrar fecha, tipo, chars o lineas por defecto. Metadata (`title`, `tags`, `notes`) aparece como franja separada; detalles tecnicos van a menu/panel, no al feed. | Ajustes UI CopyQ-inspired 2026-06-05 |
| Preview de imagenes con PNG principal | accepted | El preview debe ser util como CopyQ: para items `image`, usar el PNG principal como imagen visible grande. El thumbnail chico no alcanza para inspeccion visual en el picker. | Comparacion con CopyQ + ajuste storage 2026-06-05 |
| Ventana picker always-on-top con hide-on-focus-lost diferido | accepted | El picker debe comportarse como palette flotante. Hide inmediato en `Focused(false)` rompe mover/redimensionar; usar hide diferido/cancelable por foco/move/resize. | Investigacion Tauri/winit + implementacion 2026-06-05 |
| Tema light/dark inicial por sistema | accepted | Hasta tener settings de temas, respetar `prefers-color-scheme` para evitar fondo claro en sistemas dark. | Ajuste UI 2026-06-05 |
| Settings core en SQLite con schema typed | accepted | Evita constantes sueltas y un archivo paralelo prematuro; Rust valida defaults/version y el formato JSON queda exportable. Primer slice usa tabla `app_settings` con `AppSettings` schema v1. | `specs/003-settings-foundation/spec.md` + implementacion 2026-06-05 |
| Query syntax local antes de AI search | accepted | La busqueda poderosa empieza con contrato deterministico ejecutado por el host: texto/frases/negacion, filtros `tag`, `kind`, `mime`, `has` y fechas. AI futura debe traducir lenguaje natural a este contrato/plan validado antes de ejecutar. | Implementacion 2026-06-05 + `docs/topics/filtering-and-query-syntax.md` |
| AI search primero como query planner sobre API host | accepted | El primer uso de AI debe convertir lenguaje natural en planes estructurados de busqueda/filtro, no ejecutar comandos arbitrarios. Provider OpenAI-compatible configurable via Settings y `.env`; la key puede guardarse localmente en Settings o venir por `COPICU_AI_API_KEY`, con OpenRouter/OpenAI/Groq documentados en `.env.example`. No persistir la key en docs/logs/tests; tratar DB/settings como almacenamiento local sensible. La ejecucion de series de comandos queda para Actions Foundation con capabilities explicitas. | Conversacion 2026-06-05 + ajuste Settings 2026-06-18 + `docs/topics/ai-search-and-actions.md` |
| `history_search` como API reusable de busqueda | accepted | La busqueda del picker, scripts y futuro AI planner deben compartir un contrato host unico. `list_history_page` queda como wrapper compatible; `history_search(HistorySearchRequest)` es la API conceptual nueva con `mode`, `includeContent`, `explain`, `interpretedQuery`, `explanation` y `warnings`. | Implementacion 2026-06-06 + `docs/topics/filtering-and-query-syntax.md` |
| AI con OpenRouter configurable y Vercel AI SDK + Zod como primer runtime | accepted | OpenRouter queda como provider inicial, pero endpoint, modelo y API key se configuran en Settings con overrides `.env`/entorno. `ai` + `zod` quedan instalados para el primer planner estructurado; se puede cambiar de libreria si el problema crece. | Conversacion/implementacion 2026-06-06 + ajuste Settings 2026-06-18 + `docs/topics/ai-search-and-actions.md` |
| Scripts como archivos editables y Actions TS/JS | accepted | Para scripting local, el source debe vivir en archivos editables desde VS Code/Git, con default `Documents/Copicu/Scripts` configurable en Settings. SQLite guarda settings, indices, diagnostics y run metadata, no el codigo fuente. CopyQ se usa como baseline de contexto, pero Copicu usa IDs estables y contrato typed. | Conversacion 2026-06-05 + `docs/topics/actions-and-scripting-api.md` |
| Window bounds por monitor | accepted | Las ventanas persistentes no guardan solo coordenadas globales: mantienen bounds por monitor y validan contra `workArea` al restaurar. `main`, `settings` y `ai-output` son resizable/persistentes; superficies fijas opt-out. | `docs/topics/window-state-and-monitor-policy.md` + implementacion 2026-06-09 |
| No instalar GitHub MCP por ahora | accepted | GitHub MCP puede sumar contexto y superficie de herramientas; conviene reservarlo para investigacion repetida sobre repos/issues. | Conversacion 2026-06-05 |
| Usar `pbakaus/impeccable` para UI cuando valga la pena | accepted | De ahora en adelante forma parte del workflow normal de UI para pantallas nuevas, cambios visuales relevantes, responsive, overflow, focus states, motion y polish. Complementa Playwright/manual QA; no bloquea backend-only ni hotfixes si no esta disponible. | Conversacion 2026-06-05 + `docs/topics/ui-design-and-impeccable.md` |
| NSIS como instalador Windows principal | accepted | Es el target Tauri 2 mas simple para releases Windows de Copicu: genera `-setup.exe`, soporta instalacion `currentUser` sin admin y evita la friccion de MSI/WiX salvo deployment corporativo. | Research 2026-06-06 + `docs/topics/windows-installer.md` |
| Instalador Windows de produccion sin consola y con DLL nativa | accepted | En release, `copicu.exe` debe compilar como Windows GUI app y el instalador NSIS debe dejar `WebView2Loader.dll` junto al exe. Los diagnosticos normales quedan fuera de release; herramientas dev/benchmarks no deben empaquetarse. | Incidente installer 2026-06-09 + `docs/topics/windows-installer.md` |
| Publicar Copicu como open source con MIT | accepted | El repo se publico como `jpsala/copicu`, con README publico, licencia MIT, contexto agentico portable y primer release Windows alpha. MIT reduce friccion para usuarios/contribuidores. | Conversacion 2026-06-09 + `docs/topics/open-source-github.md` |
| Usar README/repo como web inicial del proyecto | accepted | Menor friccion para primer corte publico; GitHub Pages queda para cuando haya screenshots/gifs y una release mas madura. | Conversacion 2026-06-09 + `docs/topics/open-source-github.md` |
| Publicar contexto agentico portable en Markdown | accepted | `AGENTS.md`, `docs/`, `docs/topics/`, `docs/tracks/` y `specs/` permiten que un contributor clone el repo y use agentes con contexto. `.agents/` queda ignorado por ser cache/local tooling. | Conversacion 2026-06-09 + README |

## Pendientes

| Decision | Estado | Proximo paso |
| --- | --- | --- |
| Delay post-focus de paste-to-previous-window | pending | El valor actual de 700 ms paso validacion manual en Notepad/browser/editor-like, pero puede sentirse lento. Decidir si queda constante temporal, setting o regla por app. |
| Failure policy de paste-to-previous-window | pending | Definir como reportar fallos al usuario sin loguear payload: foco denegado, target invalido, SendInput parcial o target elevated. |
| Settings de picker y search modes | partially accepted | Primer slice implemento `hideOnFocusLost`, `enterAction`, `theme` y `retentionCount`; quedan densidad de preview, regex/fuzzy y comportamiento fino de Escape. |
| Debounce y retry policy final de clipboard watch | pending | El spike tiene coalesce/retry corto funcionando; decidir si esos valores quedan como defaults o pasan a config despues de mas datos. |
| Paste/write-back de imagenes | pending | En el primer corte de imagenes, decidir si alcanza capturar + previsualizar + copiar como PNG al clipboard, o si tambien debe pegar directo con paste-to-previous-window. |
| FTS5 y ranking de busqueda | deferred | Benchmark sintetico 50k de Architecture Hardening: recent 130 ms, target 69 ms, target con counts 139 ms. Diferir FTS5 hasta tener evidencia de latencia por keypress, ranking requerido o datasets mayores; `SearchPlanV1` sigue como contrato externo. |
| Source filters para busqueda | pending | `app:`/`window:` quedan pendientes hasta capturar source process/window de forma confiable y decidir privacidad de window titles. |
| Instalar GitHub MCP | deferred | Reabrir solo si la investigacion sobre issues/repos de Tauri se vuelve repetida. |
| GitHub Pages / web propia | deferred | El repo/README cumple como web inicial; reabrir cuando existan screenshots/gifs, assets publicos y un release menos alpha. |
