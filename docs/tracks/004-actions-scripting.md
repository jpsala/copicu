---
id: actions-scripting
status: active-dogfood
priority: 4
updated: 2026-06-09
---

# Actions And Scripting

Unificar comandos automáticos, comandos de menú, shortcuts, scripting y futuros plugins bajo una sola superficie conceptual: Actions.

Topic fuente: `docs/topics/actions-and-scripting-api.md`.

## Estado Actual 2026-06-06

Primeros slices implementados:

- actions built-in y scripts TS/JS descubiertos desde `scripts.folderPath`;
- cache/diagnostics en SQLite sin persistir source code;
- command palette, item menu y Settings debug/run;
- runner trusted con bridge NDJSON hacia host calls;
- `localShortcut`, `globalShortcut` y `clipboardChange` conectados en primer slice;
- bridge no interactivo para clipboard/history/picker/window/input;
- `ui-host` implementa `copicu.ui.confirm` y `copicu.ui.input`.

Pendiente actual:

- dogfood real de `clipboardChange`, `ui.confirm`/`ui.input` y scripts con escritura sintética para validar anti-loop;
- dogfood real de `ui.alert`/`clipboard.read` con ejemplo `017-alert-clipboard-text-length.ts`;
- toast custom global en `ui-host` en vez de seguir puliendo la ventana `notifications`;
- completar/pulir capabilities restantes solo cuando lo pidan scripts reales.

Actualizacion 2026-06-07:

- `copicu.history.update(id, patch)` acepta `marked: boolean` como metadata persistida.
- `ai_script_run` ejecuta scripts temporales generados por AI contra el runner existente, sin agregar capabilities nuevas.
- El primer caso validado con planner mock es `mark 3 more randomly`: buscar `is:unmarked`, elegir 3 al azar en JS y marcar con `history.update`.
- Dogfood posterior valido que acciones AI temporales puedan desmarcar todo, marcar primeros N y refrescar la vista con `displayQuery`.
- Cuando `history.update` recibe solo `{ marked }`, Rust usa `set_items_marked` para evitar pasar por edicion de contenido.
- `copicu.ui.markdownOutput(options)` abre la nueva ventana `ai-output` con Markdown renderizado y acciones para copiar Markdown, agregarlo al historial o exportarlo a `Documents/Copicu/Exports`.
- Capability nueva: `ui:markdown-output`. No da acceso directo a filesystem; exportar pasa por comando host controlado.
- Ejemplo agregado: `scripts/examples/018-markdown-output-summary.ts`.
- Para respuestas AI reales desde contenido de clips se reemplazó/expandió el helper hacia `copicu.ai.respondMarkdown({ instruction, items, context })` con capability explícita `ai:summarize`. Esta API usa el provider AI configurado, siempre devuelve Markdown y envía el contenido de los items provistos; usar solo en acciones manuales/consentidas. `summarizeMarkdown` queda como alias compatible.
- Runner temporal hardening 2026-06-07: `input.context`, `selectedItemIds`, `visibleItemIds` y `selectionItems` tienen defaults seguros; APIs que esperan item ID (`history.get/update/remove`, `clipboard.writeItem`, `picker.activate`) aceptan tanto ID directo como objeto `{ id }`.
- API host expandida 2026-06-08: `copicu.picker.open({ query, rememberPrevious, show, focus })` abre Copicu desde scripts como operacion host atomica y puede aplicar filtro sin depender de effects frontend; `copicu.window.rememberPrevious()` expone la captura explicita de ventana previa. Caso dogfood agregado: `scripts/examples/020-open-tag-filtered.ts` replica un tag hotkey con `picker.open({ query: "tag:context", rememberPrevious: true })`.
- Incidente 2026-06-09 triage/fix: JP reporto que la app no quedo responsive despues del corte `picker.open` + script `020`. Clasificacion nueva: no fue proceso muerto ni basta `Responding=True`. En una instancia fresca se reprodujo un target CDP `http://127.0.0.1:1420/` con runtime Tauri pero `#root` vacio/controlCount 0; un reload manual montaba React. Fix dev-only: watchdog de arranque en Rust evalua `#root` tras ~900 ms y recarga solo si sigue vacio. Ademas `copicu.picker.open` ahora usa foco reforzado estilo `show_main_window` (show/unminimize/set_focus/native fallback/delayed fallback) y logs `[diag] script.picker.open.*` redacted. Validacion post-fix: arranque fresco deja `#root` montado sin reload manual; `Ctrl+Alt+Shift+T` ejecuta `examples.openTagFiltered`, abre `tag:context`, `record_renderer_diagnostic` responde, heartbeats continuan, drag mueve por `GetWindowRect`, y X custom completa `window-control-hide-click -> hide-picker-command-start -> window-control-hide-dispatched -> hide-picker-command-ok`.
- Patron parametrizable 2026-06-09: agregado `copicu.commands.run("picker.open", { query, rememberPrevious, show, focus })` como wrapper allowlisted sobre la misma ruta reforzada de `picker.open`. La capability nueva `commands:run` autoriza el namespace y `picker:open` sigue autorizando el efecto concreto. El host no acepta nombres internos arbitrarios; por ahora la allowlist contiene solo `picker.open`. El ejemplo `020-open-tag-filtered.ts` sigue siendo un wrapper chico con `Ctrl+Alt+Shift+T`, pero ya delega a `commands.run` y permite replicar el patron para otros tags cambiando solo params/metadata de wrapper.
- Decision 2026-06-09 para proxima implementacion: sacar la configuracion de hotkeys por tag de Settings y reemplazarla por scripts. Settings > Tags debe quedar para metadata (`create`, `pin`, counts, `Open filtered`) y no para shortcuts. Los hotkeys filtrados deben vivir como scripts `globalShortcut`/`commandPalette` con wrappers chicos que llamen `copicu.commands.run("picker.open", params)`. Esto evita dos sistemas paralelos de automatizacion y permite filtros mas creativos que `tag:<slug>` sin ampliar Settings.
- Implementacion 2026-06-09: se elimino de Settings > Tags el recorder/status/conteo de hotkeys y el backend dejo de registrar `tag_configs.hotkey` como shortcut nativo. `tag_configs.hotkey` queda solo como compatibilidad historica no expuesta por `list_tags`. Se agregaron wrappers `020` a `024` para abrir picker filtrado con `commands.run("picker.open", params)`.
- Cierre dogfood 2026-06-09: los wrappers `020`-`024` estan en repo y en `Documents/Copicu/Scripts`; `npm run build`, typecheck TS de wrappers, `npm run visual:check` 66/66 y `cargo check` pasan. App viva validada con CDP/IPC/heartbeats; Settings > Tags ya no muestra hotkey UI; `examples.openTagFiltered` ejecutado con contexto `globalShortcut` aplico `tag:context` y genero logs `script.picker.open.*`. La inyeccion sintetica de `Ctrl+Alt+Shift+T` no disparo el hook global, asi que la proxima sesion debe usar Computer Use o tecla fisica para el shortcut real.
- Fix dogfood 2026-06-09: al ejecutar `copicu.commands.run("picker.open", ...)` desde `run_action`/renderer, emitir `copicu://picker/filter` durante el invoke podia dejar React vivo pero IPC renderer->Tauri colgado. `script.picker.open` ahora difiere el emit del filtro despues de show/focus. Validacion: `examples.openContextTextFiltered`, `examples.openMarkedContextFiltered` y `examples.openPromptFiltered` completaron por IPC real, aplicaron filtros, escribieron logs redacted, heartbeats continuaron y `record_renderer_diagnostic` respondio.
- Reapertura 2026-06-11: `npm run visual:check` paso 74/74. Dev aislado relanzado con watcher desactivado y scripts `020`-`024` copiados a `.codex-run/dev-isolated/scripts`; SQLite cacheo las 5 acciones con `diagnostic_count=0`, triggers `commandPalette/devRun/globalShortcut` y capabilities `commands:run/picker:open/log:write`. Typecheck focalizado de los wrappers paso con `npx tsc --noEmit --ignoreConfig ...`.
- Validacion JP 2026-06-11: los hotkeys filtrados ya funcionan en uso real. Queda registrado que `Ctrl+Alt+Shift+T/W/X/M/P` pueden abrir los filtros de los wrappers `020`-`024` desde scripts, sin reactivar hotkeys nativos por tag.
- Pendiente para reabrir: repetir `021`-`024` desde command palette con gesto UI real si hace falta cubrir esa superficie; mantener datos sinteticos y no persistir payloads reales en logs/docs.
- `history_search` en modo AI ahora puede recibir `aiContext` desde el picker para que scripts temporales vean IDs chequeados/visibles/current reales. El frontend usa refs para no recrear `refreshHistory` por cambios de selección y evitar regresiones de scroll.
- Clipboard enrichment dogfood 2026-06-12: `EnrichmentResult` expone `autoApplyEnabled` y `manualApplyAllowed`; `runForItem()` solo auto-aplica por default si `enabled && autoApply`, y `{ apply: true }` mantiene la aplicacion manual para `suggestOnly`/inspeccion. Scripts `026`/`027` y `copicu-action.d.ts` fueron sincronizados en repo, `Documents\Copicu\Scripts` y `.codex-run\dev-isolated\scripts`.
- Dogfood real 2026-06-12 sobre watcher aislado: matriz de policy validada con datos sinteticos y DB/logs del perfil `.codex-run\dev-isolated`. `autoApply` persistio `path` como `source=rule` con `confidence=1.0`; `suggestOnly` detecto `url` sin persistir tags; `enabled=false` detecto `json` sin persistir tags. `027-toast-path-clipboard-change.ts` mostro la diferencia correctamente en toast/log para los tres casos.
- Bloqueo 2026-06-12 para `026-inspect-enrichment-active.ts`: el script sigue descubierto con `shortcut: Ctrl+Alt+E`, pero el picker dev no quedo en una superficie usable durante la prueba. `window.show` puede dejar `main` en `visible=false`, y cuando se forzo el `HWND` nativo la captura quedo en un rect `6x6` negro; no hubo `action_runs` de `examples.inspectEnrichmentActive`. Proximo paso: corregir restore/render del picker antes de seguir probando `localShortcut`.
- Fix 2026-06-12 para picker dev: `window_state::restore()` dejo de depender de APIs de monitor del `WebviewWindow` durante startup/show y ahora usa `AppHandle` para cursor/monitores globales. Con eso desaparecio `window main monitors failed: failed to receive message from webview` y `show_main_window` volvio a abrir `main` con bounds normales (`820x620`) en el perfil aislado.
- Fix 2026-06-12 para enrichment host API: `script_enrichment_get_result()` ya no fuerza `manualApplyAllowed=false`. La ruta ahora refleja correctamente que un script manual puede aplicar tags via `enrichment.runForItem(itemId, { apply: true })` aunque `autoApply` este apagado.
- Bloqueo remanente 2026-06-12 para `026`: tras corregir restore/render, la inyeccion sintetica de `Ctrl+Alt+E` usada en esta sesion siguio sin producir `action_runs` de `examples.inspectEnrichmentActive`. El problema restante ya parece del gesto de foco/input local shortcut o del harness, no del registry del script ni del picker `6x6`.
- Fix 2026-06-12 para runtime dev aislado: con `COPICU_DISABLE_CLIPBOARD_WATCHER=1` el renderer principal seguia pidiendo `get_capture_snapshot()` y el backend no tenia `ClipboardCapture` registrado; eso generaba `unhandled-rejection` continuo y hacia ver la app "rota". Los comandos ahora devuelven snapshots/stats vacios cuando el watcher no existe.
- Fix 2026-06-12 para hotkeys compuestos en `main`: `get_compound_hotkey_pending()` estaba guardado solo para `whichkey`, pero `main` tambien lo usa para sincronizar estado/debug. El comando ahora acepta `main` y desaparece el spam backend.
- Diagnostico de entorno 2026-06-12: los errores `HotKey already registered` observados durante restart dev venian de una segunda instancia instalada (`C:\Users\jpsal\AppData\Local\Copicu\copicu.exe`) corriendo en paralelo, no de la logica nueva de registry.
- Tests relevantes para este corte:
  - `npm run ai:planner:test`;
  - `node --test tests/ai-script-planner.test.mjs`;
  - `npm run build`;
  - `npm run visual:check`;
  - `cargo check`.

Nota de lectura: las secciones históricas de este archivo conservan planes usados durante el avance; si contradicen este bloque, este bloque manda.

Actualizacion 2026-06-08:

- Smart tagging para tags queda definido como command/action interno, no logica directa del watcher.
- Primer comando objetivo: `builtin.smartTagClipboardItem`.
- Trigger objetivo: `clipboardChange`, con item capturado persistido como input.
- Capabilities futuras: `history:write-tags` y `ai:classify`, ademas de `history:read-content` cuando necesite contenido.
- Debe estar apagado por defecto, configurado desde Settings > Tags > Auto tagging, y correr async despues de persistir el item.
- No reemplazar ni interceptar `Ctrl+C`; un "smart copy" futuro debe ser comando opt-in con otro hotkey/secuencia.

## Decisión

CopyQ separa commands automáticos, commands de menú, global shortcuts y scripting. En Copicu queremos un solo modelo.

Internamente lo llamamos `Action`. Para el usuario puede sentirse como scripting.

## Modelo Mental

Una action tiene:

- trigger:
  - menu item;
  - keyboard shortcut;
  - global shortcut;
  - clipboard rule;
  - command palette;
  - CLI;
  - plugin;
- input:
  - item actual;
  - items seleccionados;
  - clipboard actual;
  - ventana previa;
  - query;
- capabilities:
  - history read/write;
  - clipboard read/write;
  - paste/input;
  - file;
  - network;
  - AI;
- output:
  - actualizar metadata;
  - crear item;
  - transformar item;
  - pegar en ventana previa;
  - mostrar UI;
  - ejecutar script;
- logging/debug:
  - action run;
  - stages;
  - error class;
  - redacted summaries.

## Primeras Actions Útiles

- Paste as plain text.
- Open URL.
- Copy escaped JSON/string.
- Join selected items.
- Normalize whitespace.
- Extract todos.
- Add tags/metadata.
- Summarize clip, cuando AI esté habilitada.
- OCR/caption image, más adelante.

## Relación Con Plugins

Actions son la unidad que luego pueden declarar plugins JS/TS.

No empezar con runtime completo de plugins. Primero:

- schema de action;
- host execution;
- logging seguro;
- actions built-in.

Luego:

- actions scriptables;
- plugin manifest;
- hot reload;
- typed SDK.

## Acuerdos 2026-06-05

- TypeScript/JavaScript es realizable para scripting local.
- El source de scripts vive en archivos editables, no en SQLite.
- Default inicial: `Documents/Copicu/Scripts`, configurable en Settings como `scripts.folderPath`.
- SQLite guarda estado/index/cache: parse/build diagnostics, action registry materializado, enablement, run metadata y logs resumidos.
- No ejecutar scripts automaticamente al guardar por defecto; auto-run solo en modo dev explicito.
- CopyQ sirve como baseline de contexto:
  - automatic: clipboard change;
  - in-menu/local shortcut: selected/current items si viene de ventana principal;
  - tray: clipboard data;
  - global shortcut: sin selected items implicitos;
  - match rules por contenido/window/filtro/MIME.
- Copicu debe hacer ese contexto explicito con `trigger`, `input.source`, `selection` y capabilities.
- Usar IDs estables de items como referencia primaria; indices visibles solo como conveniencia.
- `history.search()` debe reutilizar el parser del main window; `picker.filter()` cambia UI visible.
- Debug es parte central: logs estructurados por run, diagnostics, stack traces, redaccion de payload por defecto, futura integracion VS Code.

## Done Cuando

- Existe spec de actions.
- Hay modelo de `action_runs`.
- Hay 2-3 built-in actions ejecutadas desde menú/picker.
- Logs/debug no exponen payload real.

## Implementado 2026-06-05

- Agregado registry Rust interno de built-in actions con IDs estables:
  - `builtin.pastePlain`;
  - `builtin.joinSelected`;
  - `builtin.openUrl`.
- Definidos tipos Rust/TS para `ActionDefinition`, `Trigger`, `ActionInput`, `ActionContext` y request/result de run.
- Agregados comandos Tauri:
  - `list_builtin_actions`;
  - `run_action`.
- Agregada tabla SQLite `action_runs` para metadata de runs con summary redacted:
  - action id;
  - trigger;
  - status;
  - timestamps/duration;
  - summary por conteos/kinds, sin payload.
- Menú del picker ejecuta built-ins:
  - single item: Paste plain, Open URL;
  - multi selection: Join selected.
- UI inicial de notifications:
  - toast stack arriba a la derecha;
  - newest arriba, oldest baja;
  - `durationMs` configurable y `0` sticky;
  - success/error desde action runner.
- Agregados scripts de ejemplo en `scripts/examples/` para probar el contrato del runner:
  - `001-toast-hello.ts`;
  - `002-copy-current-title.ts`;
  - `003-join-selected-with-log-name.ts`;
  - `004-url-open-or-filter.ts`;
  - `005-triage-clipboard-batch.ts`.
- Copiados tambien al folder real de scripts de esta maquina:
  - `C:\Users\jpsal\Documents\Copicu\Scripts`.
- Agregado harness dev mockeado:
  - `npm run scripts:run-example -- "$env:USERPROFILE\Documents\Copicu\Scripts\001-toast-hello.ts"`;
  - ejecuta con API `copicu` sintetica, no con Copicu real;
  - escribe logs en `C:\Users\jpsal\Documents\Copicu\Scripts\.logs`.
- Convención de logs para scripts:
  - default `Scripts/.logs/<action-id>.jsonl`;
  - override con `logging.name`;
  - `logging.name` debe ser solo nombre de archivo, sin separadores de path;
  - redacción prendida por defecto.
- Primer corte de discovery implementado:
  - `list_actions` devuelve built-ins + scripts descubiertos;
  - discovery lee `scripts.folderPath`;
  - se indexan `.ts`, `.js`, `.mjs`;
  - se ignoran `.d.ts`;
  - se parsea estaticamente `defineAction({...})` sin ejecutar codigo;
  - se extraen `id`, `title`, `description`, `triggers`, `input`, `capabilities`, `logging`;
  - se calcula `sourceHash`;
  - se reportan diagnostics por script;
  - Settings muestra resumen de built-ins/scripts/diagnostics.
- Todavía no se ejecutan scripts TS/JS externos.

## Implementado 2026-06-06

- Agregado cache SQLite materializado para scripts descubiertos:
  - `script_action_registry`;
  - `script_action_diagnostics`.
- `list_actions` ahora descubre scripts, refresca el cache en SQLite y devuelve scripts desde el registry cacheado junto con built-ins.
- El cache guarda metadata/definición serializada, path, hash y diagnostics; no guarda source code de scripts.
- Agregado comando Tauri `list_script_action_diagnostics` para inspección debug del cache de diagnostics.
- Settings ahora muestra lista debug mínima de scripts descubiertos:
  - título;
  - estado ready/diagnostics/error;
  - file name/path en tooltip;
  - triggers;
  - capabilities;
  - source hash corto;
  - diagnostics por archivo.
- Visual check cubre la lista de scripts y un diagnostic sintético sin overflow horizontal.
- Agregado runner real trusted TS/JS para ejecución manual:
  - `scripts/copicu-script-runner.mjs` transpila TS con `typescript`, carga `defineAction({...})` y ejecuta `run(ctx)`;
  - `run_action` ahora resuelve scripts cacheados y permite `devRun`/`commandPalette`;
  - scripts con diagnostics `error` no se ejecutan;
  - Settings muestra botón `Run` para scripts ready con trigger manual.
- Bridge inicial implementado:
  - `copicu.log.debug/info/warn/error`;
  - `console.*` capturado como logs redacted;
  - `copicu.ui.toast`;
  - `copicu.selection.ids/current/items/set`;
  - `copicu.clipboard.writeText`.
- Logs de scripts reales se escriben como JSONL redacted en `Scripts/.logs/<action-id>.jsonl` o `logging.name` validado como nombre de archivo.
- `action_runs` persiste metadata de runs de scripts con input summary redacted; el source de scripts sigue fuera de SQLite.
- Los efectos del runner se aplican al terminar la acción en este corte; todavía no hay IPC streaming durante la ejecución.
- Validación directa con payload sintético:
  - `001-toast-hello.ts` genera log + toast;
  - `002-copy-current-title.ts` genera log + operación `clipboard.writeText` + toast.

## Siguiente Corte

1. Diseñar `ui-host` como ventana auxiliar única para UI custom (`toast`, `confirm`, `input`, prompts de scripts).
2. Implementar prompts interactivos con request/response IDs entre Rust y `ui-host`.
3. Agregar bridge pendiente: `history.remove`, `clipboard.read` y rich clipboard write formats si hacen falta.

## Decisión: UI Auxiliar Para Scripts

Investigación 2026-06-06:

- Tauri dialog plugin cubre `message`/`confirm` nativos y file open/save. No cubre input prompt genérico.
- Tauri notification plugin cubre OS-native notifications (`requestPermission`, `sendNotification`), ideal para eventos de background como `clipboardChange`.
- Webview windows transparentes/always-on-top sirven para UI custom independiente de la ventana principal, pero requieren permissions explícitos y son sensibles a Windows/WebView2, tamaño, foco, DPI y z-order.
- Tauri capabilities explican los errores vistos (`window.hide/show/set_size not allowed`) y deben declararse por ventana/capability.
- Tauri positioner puede ayudar más adelante para ventanas tipo tray/screen-edge.

Arquitectura recomendada:

- `ui.notify`: notificación nativa del sistema. Usar para scripts automáticos/background.
- `ui.toast`: feedback in-app mientras el picker/main UI está visible.
- `ui-host`: una ventana auxiliar deliberada para UI custom reusable:
  - toast custom;
  - confirm rico;
  - input prompt;
  - futuros prompts/menús de scripts.
- Prompts interactivos deben usar request/response IDs entre Rust y `ui-host`; no alcanza con aplicar efectos al final del runner.

No seguir puliendo ad hoc la ventana `notifications` actual. El próximo corte debe diseñar `ui-host` con calma para `toast`, `confirm` e `input`, con request/response IDs.

## Implementado 2026-06-06, UI Notify Nativo

- Instalado y cableado `@tauri-apps/plugin-notification` / `tauri-plugin-notification`.
- `lib.rs` inicializa `tauri_plugin_notification::init()`.
- Capabilities Tauri incluyen `notification:default`.
- Script bridge nuevo:
  - `copicu.ui.notify(options: { title?: string; body: string } | string)`;
  - capability soportada: `ui:notify`;
  - Rust ejecuta la notificación con `app.notification().builder().title(...).body(...).show()`.
- `ui.notify` se aplica durante la ejecución del script y no usa la ventana custom `notifications`.
- El script real `C:\Users\jpsal\Documents\Copicu\Scripts\016-notify-clipboard-preview.ts` ahora usa `copicu.ui.notify` y capability `ui:notify` en vez de `copicu.ui.toast`.
- Tipos `copicu-action.d.ts`, docs de usuario y skill `copicu-scripts` fueron actualizados.

Pendiente `ui-host`:

- `ui.toast`: feedback in-app actual queda; un toast custom global debe migrar a una ventana `ui-host` deliberada, no a más polish de `notifications`.
- `ui.alert`: puede usar dialog nativo simple o `ui-host` si se quiere consistencia visual.

## Implementado 2026-06-06, UI Host Confirm/Input

- Agregado `src-tauri/src/ui_host.rs` con store de pending requests, IDs `ui-*`, timeout de 120s y ventana `ui-host`.
- `lib.rs` crea una WebView auxiliar `ui-host`, hidden, transparent, undecorated, always-on-top, skip-taskbar, resizable false.
- Capabilities Tauri incluyen la ventana `ui-host`.
- Comando Tauri nuevo: `resolve_ui_host_request`.
- Runner TS/JS:
  - `copicu.ui.confirm(options)` usa host call `ui.confirm` y devuelve `boolean`;
  - `copicu.ui.input(options)` usa host call `ui.input` y devuelve `string | null`.
- Rust resuelve esas host calls durante la ejecución del script, emite `copicu://ui-host/request` y espera respuesta del frontend.
- Frontend renderiza `UiHostApp` cuando el label de ventana es `ui-host`; cubre confirm/input, Escape como cancel, foco inicial del input y submit por Enter.
- Capabilities soportadas nuevas:
  - `ui:confirm`;
  - `ui:input`.
- Visual checks agregados para `ui-host` en ventana compacta y dark mode; se usa override dev `?window=ui-host` solo para Playwright/local browser.

Pendiente `ui-host`:

- `ui.toast` custom global en `ui-host`; hoy `ui.toast` sigue como feedback in-app/ventana `notifications` heredada.
- Dogfood real con scripts `004-url-open-or-filter.ts`, `005-triage-clipboard-batch.ts` y `017-alert-clipboard-text-length.ts` desde app viva.

## Implementado 2026-06-06, Bridge Infra Follow-up

- Agregado soporte real para `copicu.history.remove(id)` con capability `history:delete`.
- Agregado soporte real para `copicu.clipboard.read()` con capability `clipboard:read`; devuelve texto actual como `{ text?: string }` y no cubre HTML/rich formats todavía.
- Agregado `copicu.ui.alert(options)` con capability `ui:alert`, resuelto durante la ejecución mediante la ventana `ui-host` y botón único de acknowledgement.
- Actualizados runner, Rust host calls, UI host/frontend, docs de usuario y skill `copicu-scripts`.
- Agregado ejemplo no destructivo `scripts/examples/017-alert-clipboard-text-length.ts` y copiado a `Documents/Copicu/Scripts`.

Checks:

- `npm run build`: pasó.
- `cargo check` con `CARGO_TARGET_DIR=target-codex-check`: pasó.
- Typecheck TS de `scripts/examples/*.ts`: pasó.
- `npm run scripts:run-example -- scripts\examples\017-alert-clipboard-text-length.ts`: pasó con clipboard sintético vacío.
- `npm run visual:check -- --workers=2`: pasó 56/56.
- `quick_validate.py` para `copicu-scripts`: pasó.
- `npm run rust:test`: compila pero vuelve a fallar al arrancar el binario de tests con `STATUS_ENTRYPOINT_NOT_FOUND`.

Pendiente:

- Dogfood real de `017-alert-clipboard-text-length.ts` en app viva.
- `clipboard.writeFormats` sigue pendiente.

Validación de cierre:

- `npm run build`: pasó.
- `cargo check`: pasó.
- `npm run visual:check -- --workers=2`: pasó 36/36.
- `npm run rust:test`: compila, pero el binario de test sigue fallando al arrancar con `STATUS_ENTRYPOINT_NOT_FOUND`; se reprodujo incluso con PATH reducido sin conda/mingw.

## Plan Usado: Clipboard Change

Estado: implementado en primer slice 2026-06-06.

Objetivo original:

- Conectar el trigger `clipboardChange` ya existente en el contrato.
- Ejecutar solo scripts ready que declaren `clipboardChange`.
- Mantener contexto explícito, sin selección de picker implícita.
- Evitar loops cuando scripts escriben al clipboard.

Plan técnico aplicado:

1. Reutilizar discovery/cache existente para encontrar scripts ready con `Trigger::ClipboardChange`.
2. Ejecutar desde el watcher después de una captura válida y persistida, no antes.
3. Pasar contexto explícito:
   - `trigger: "clipboardChange"`;
   - `shortcut: null`;
   - `currentItemId: <id del item capturado>` si la persistencia ya lo puede devolver;
   - `selectedItemIds: [<id>]` solo si se documenta que `clipboardChange` usa el item capturado como selección explícita; alternativa conservadora: `selectedItemIds: []` y un campo futuro de clipboard/item en contexto.
4. Decisión tomada:
   - usar `currentItemId` para el item capturado;
   - mantener `selectedItemIds: []`;
   - no usar selección visible del picker.
5. Filtrar por contrato antes de ejecutar:
   - diagnostics sin `error`;
   - capabilities soportadas;
   - `input.source` compatible (`clipboard`, `none` o decisión documentada);
   - `input.kinds`/`input.mime` contra el item capturado si hay item persistido.
6. Anti-loop:
   - respetar `SelfWriteSuppression`;
   - no disparar `clipboardChange` para writes iniciados por scripts/host;
   - agregar debounce/coalescing por `normalized_hash` + ventana corta si hace falta.
7. Logging:
   - guardar `action_runs` con summary redacted;
   - no loguear payload real;
   - incluir `trigger: "clipboardChange"`, kind/MIME/counts/id.
8. Primer alcance recomendado:
   - text-first / non-image inicialmente;
   - no implementar tray/CLI;
   - no ejecutar scripts con `clipboard:read` hasta que exista esa API.

Criterios de aceptación:

- Un script con `triggers: ["clipboardChange"]`, `input.source: "clipboard"` y `kinds: ["text"]` se ejecuta cuando se copia texto sintético.
- No se ejecuta para imagen si declara `kinds: ["text"]`.
- Un script que escribe al clipboard no se dispara recursivamente por su propia escritura.
- `action_runs` registra la corrida sin payload.
- Tests Rust cubren filtrado/anti-loop donde aplique.
- Smoke manual usa solo texto sintético.

## Current Work: Local Shortcuts Para Scripts

Estado actual:

- Global hotkey para abrir Copicu existe: `Ctrl+Shift+,`.
- Scripts ejecutables existen para `itemMenu`, `commandPalette` y `devRun`.
- `localShortcut` y `globalShortcut` existen como valores del contrato `Trigger`, pero no están conectados a ejecución real.
- El campo `shortcut` aparece en algunos ejemplos/conceptos, pero hoy no está en `ActionDefinition` Rust/TS ni se persiste en el registry cacheado.

Objetivo del próximo corte:

- Implementar `localShortcut` para scripts ready mientras el picker/Copicu está enfocado.
- No implementar todavía `globalShortcut`.
- Mantener el modelo CopyQ-inspired: local shortcut usa snapshot explícito de la selección/current item del picker.

Plan técnico recomendado:

1. Agregar `shortcut?: string | null` a `ActionDefinition` Rust y TS.
2. Extender discovery estático para extraer `shortcut: "Ctrl+Alt+J"` desde `defineAction`.
3. Persistir `shortcut` en `script_action_registry` si la definición serializada ya no lo cubre o validar que quede dentro del JSON cacheado.
4. Mostrar shortcut en command palette y, opcionalmente, item menu.
5. Implementar parser/normalizador frontend para combinaciones simples:
   - modificadores: `Ctrl`, `Alt`, `Shift`, `Meta`;
   - tecla final: letras, números, puntuación común y algunas teclas nombradas (`Enter`, `Space`, `F1`-`F12` si es simple).
6. En React, capturar `keydown` cuando el picker está activo.
7. Resolver acciones candidatas:
   - ready;
   - source script o built-in si más adelante aplica;
   - declara trigger `localShortcut`;
   - `shortcut` normalizado coincide;
   - capabilities soportadas;
   - input/selection/kind/MIME compatible con selección actual.
8. Ejecutar con `run_action` usando contexto:
   - `trigger: "localShortcut"`;
   - `shortcut: <normalizado>`;
   - `currentItemId`, `selectedItemIds`, `view` iguales al snapshot actual del picker.
9. Prevenir default solo cuando hubo match ejecutable.
10. Si hay conflicto de shortcuts:
    - primera versión puede elegir el primer match ordenado por lista;
    - mejor: mostrar toast/log warning y no ejecutar hasta resolver conflicto.

No hacer todavía:

- registrar shortcuts globales con `tauri-plugin-global-shortcut`;
- shortcuts con secuencias tipo Vim/CopyQ avanzadas;
- expresiones complejas por ventana activa;
- ejecución automática por clipboard change.

Criterios de aceptación:

- Un script con:

```ts
shortcut: "Ctrl+Alt+J",
triggers: ["itemMenu", "commandPalette", "localShortcut"],
```

se descubre con `shortcut` visible.
- Con picker enfocado y selección compatible, `Ctrl+Alt+J` ejecuta el script con `trigger: "localShortcut"`.
- Si la selección no cumple `input`, no ejecuta y no rompe navegación.
- Command palette sigue funcionando con `Ctrl+K`.
- Tests visuales cubren:
  - shortcut visible en command palette;
  - keydown dispara `run_action` con `trigger: "localShortcut"` y `shortcut`;
  - shortcut no dispara cuando input/selection no matchea.

Después:

- Implementar `globalShortcut` en Rust con registro/unregistro dinámico y contexto explícito sin selección implícita salvo decisión posterior.

## Implementado 2026-06-06, Segundo Corte

- Scripts ready con trigger `itemMenu` ahora aparecen en el menú de item cuando pasan filtros de:
  - diagnostics sin `error`;
  - `input.selection`;
  - `input.kinds`;
  - `input.mime`;
  - capabilities soportadas por el host actual.
- Agregada command palette real:
  - botón `Commands`;
  - `Ctrl+K`;
  - búsqueda por título/descripción/id/source/capabilities;
  - navegación con flechas;
  - `Enter` ejecuta built-ins o scripts ready con trigger `commandPalette`.
- La ejecución de actions en UI usa un camino común para built-ins y scripts, manteniendo contexto por IDs y sin payload en el request.
- El runner TS/JS cambió a protocolo NDJSON interno Rust↔Node para llamadas host durante ejecución.
- Bridge ampliado:
  - `copicu.history.search(query, { limit, content })`;
  - `copicu.history.get(id, { content })`;
  - `copicu.history.update(id, patch)`;
  - `copicu.picker.filter(query)`;
  - `copicu.picker.activate(id, options)`.
- `picker.filter` se devuelve como efecto al frontend y actualiza la query visible al terminar la action.
- `picker.activate` se aplica desde Rust con la misma primitiva host de activación/copy/paste.
- Tests visuales cubren scripts en item menu, command palette desktop/narrow, y requests sin payload.

## Cierre De Sesion 2026-06-05

Estado actual:

- Settings ya persiste/valida `scripts.folderPath`.
- Scripts de ejemplo estan en repo y en `C:\Users\jpsal\Documents\Copicu\Scripts`.
- Harness dev mockeado existe para probar ejemplos, pero no es el runner real de Copicu.
- Built-ins ejecutan desde menú y loguean `action_runs`.
- `list_actions` ya mezcla built-ins + scripts descubiertos.
- Discovery estatico ya extrae metadata/diagnostics sin ejecutar TS/JS.
- Settings muestra resumen de actions descubiertas.

Checks finales:

- `npm run build`: paso.
- `npm run visual:check`: paso, 26/26.
- `npm run rust:test`: paso, 31/31.

Nota:

- En una corrida previa `visual:check` tuvo un timeout intermitente en narrow para right-click menu; el test aislado paso y la corrida completa posterior tambien paso.

## Cierre De Sesion 2026-06-06, Primer Corte

Estado actual:

- `scripts.folderPath` existe y apunta por default a `Documents/Copicu/Scripts`.
- Los ejemplos TS viven en `scripts/examples/` y también fueron copiados al folder real de scripts de esta máquina.
- Built-ins ejecutables desde menú:
  - `builtin.pastePlain`;
  - `builtin.joinSelected`;
  - `builtin.openUrl`.
- `action_runs` persiste runs con summaries redacted por conteos/kinds, sin payload.
- Toast stack existe y se usa para feedback de built-ins.
- Discovery estático lee `.ts`/`.js`/`.mjs`, ignora `.d.ts`, parsea `defineAction({...})` sin ejecutar y extrae metadata/input/capabilities/logging/sourceHash/diagnostics.
- `list_actions` mezcla built-ins + scripts, refresca `script_action_registry`/`script_action_diagnostics` en SQLite y devuelve scripts desde el cache.
- Settings muestra resumen y lista debug mínima de scripts descubiertos con diagnostics por archivo.
- Ejecución real manual de scripts TS/JS externos existe para `devRun`/`commandPalette`, con bridge inicial `log`/`toast`/`selection`/`clipboard.writeText`.
- Scripts todavía no están conectados a item menu, command palette real, local hotkeys ni global hotkeys.

Checks finales:

- `npm run build`: pasó.
- `npm run visual:check`: pasó, 26/26.
- `npm run rust:test`: pasó, 32/32.

Próximo corte:

1. Conectar scripts ready a item menu con filtros por input/selection/kind.
2. Agregar command palette real para built-ins + scripts.
3. Ampliar bridge hacia `history.search/get/update` y `picker.filter/activate`.
4. Después conectar local hotkeys y global hotkeys.

## Cierre De Sesion 2026-06-06, Segundo Corte

Estado actual:

- Scripts ready ya están conectados a item menu si declaran `itemMenu` y pasan:
  - diagnostics sin `error`;
  - `input.selection`;
  - `input.kinds`;
  - `input.mime`;
  - capabilities soportadas por el host actual.
- Command palette real disponible desde botón `Commands` y `Ctrl+K`.
- Built-ins y scripts comparten el mismo camino de ejecución desde UI.
- Requests de ejecución mantienen contexto por IDs y no incluyen payload.
- Runner TS/JS usa protocolo NDJSON interno Rust↔Node para host calls durante ejecución.
- Bridge actual:
  - `copicu.log.*` y `console.*`;
  - `copicu.ui.toast`;
  - `copicu.selection.ids/current/items/set`;
  - `copicu.clipboard.writeText`;
  - `copicu.history.search/get/update`;
  - `copicu.picker.filter/activate`.
- `picker.filter` vuelve como efecto al frontend y cambia la query visible al terminar la action.
- `picker.activate` usa la primitiva host Rust de activación/copy/paste.
- Tests visuales cubren scripts en item menu y command palette en desktop/narrow.

Checks finales:

- `npm run build`: pasó.
- `npm run visual:check`: pasó, 28/28.
- `npm run rust:test`: pasó, 32/32.
- Smoke directo del runner NDJSON con `001-toast-hello.ts`: pasó.

Próximo corte:

1. Jugar con scripts reales desde `Documents/Copicu/Scripts`, especialmente:
   - script `itemMenu` que use `history.get/update`;
   - script de command palette que use `history.search`;
   - script que use `picker.filter`;
   - script que use `picker.activate` con opciones explícitas.
2. Agregar `clipboard.writeItem`, `picker.show/hide`, `window.focusPrevious`, `input.paste`.
3. Recién después conectar local hotkeys y global hotkeys.

## Implementado 2026-06-06, Dogfood Scripts Reales

- Agregados ejemplos versionados y copiados al folder real `Documents/Copicu/Scripts`:
  - `006-tag-selected-and-note.ts`: `itemMenu` con `history.get/update`;
  - `007-search-scripted-text.ts`: `commandPalette` con `history.search`;
  - `008-filter-long-text.ts`: `picker.filter`;
  - `009-activate-current-copy.ts`: `picker.activate` con opciones explícitas.
- Ajustado `copicu-action.d.ts` para que `picker.activate` exponga `markUsed`, `focusPrevious` y `pasteShortcut`.
- Typecheck de ejemplos pasó con:
  - `npx tsc --ignoreConfig --noEmit --target ES2022 --module ESNext --moduleResolution Bundler --strict <scripts/examples/*.ts>`.
- Smoke mock del runner pasó para los cuatro scripts nuevos.
- Smoke real con `tauri:dev` vivo + WebView2 CDP + `run_action` pasó para los cuatro scripts:
  - se sembró un clip sintético;
  - `examples.tagSelectedAndNote` actualizó title/tags/notes;
  - `examples.searchScriptedText` ejecutó `history.search`;
  - `examples.filterLongText` devolvió efecto `picker.filter`;
  - `examples.activateCurrentCopy` activó/copy/markUsed con opciones explícitas.
- Hallazgo de dogfood: los clips de texto capturados pueden tener `mime_primary` vacío; para scripts comunes de texto, `kinds: ["text"]` es más robusto que `mime: ["text/plain"]`.
- Bridge no interactivo ampliado:
  - `copicu.clipboard.writeItem`;
  - `copicu.picker.show`;
  - `copicu.picker.hide`;
  - `copicu.window.focusPrevious`;
  - `copicu.input.paste`.
- Capabilities soportadas por UI actualizadas:
  - `picker:show`;
  - `picker:hide`;
  - `window:focus-previous`;
  - `input:paste`.
- Pendiente de ese corte: prompts interactivos, resuelto después para `ui.confirm`/`ui.input` y luego `ui.alert` con `ui-host`.

## Implementado 2026-06-06, Local Shortcuts

- Agregado `shortcut` a `ActionDefinition` Rust/TS y al cache serializado de scripts.
- Discovery estático extrae `shortcut: "Ctrl+Alt+J"` desde `defineAction({...})`.
- `run_action` permite scripts con trigger `localShortcut`; `globalShortcut` sigue sin implementarse.
- El frontend normaliza shortcuts simples con modificadores `Ctrl`, `Alt`, `Shift`, `Meta` y una tecla final.
- Con el search input del picker enfocado, `keydown` resuelve scripts ready que:
  - declaran `localShortcut`;
  - tienen shortcut normalizado coincidente;
  - pasan diagnostics/capabilities/input/selection/kind/MIME.
- La ejecución usa `run_action` con `trigger: "localShortcut"` y `context.shortcut` normalizado, manteniendo IDs de selección/current/view sin payload.
- Command palette y item menu muestran shortcuts declarados como badge compacto.
- Tests visuales agregados:
  - shortcut visible en command palette;
  - `Ctrl+Alt+J` ejecuta script ready con contexto `localShortcut`;
  - no ejecuta cuando el item seleccionado no cumple `input.kinds`.
- Skill `copicu-scripts` actualizada y validada con `quick_validate.py`.

## Implementado 2026-06-06, Global Shortcuts

- Primer slice conservador de `globalShortcut` para scripts:
  - reutiliza `shortcut?: string | null` de `ActionDefinition`;
  - registra solo scripts `source: "script"` ready, con trigger `globalShortcut`, shortcut normalizable y sin diagnostics `error`;
  - `Ctrl+Shift+,` sigue reservado para abrir Copicu y no se registra para scripts;
  - duplicados entre scripts se marcan como diagnostics `error` y no se registran;
  - acciones globales deben aceptar contexto sin selección (`selection: "none"` u `"optional"`).
- Al disparar un global shortcut, Copicu ejecuta `run_action` con:
  - `trigger: "globalShortcut"`;
  - `shortcut` normalizado;
  - `selectedItemIds: []`;
  - `currentItemId: null`;
  - `view: null`.
- Registro inicial:
  - al startup se llama `list_actions`, se refresca cache/diagnostics y se registran shortcuts globales válidos;
  - `list_actions` también refresca diagnostics/cache visibles en Settings y re-registra shortcuts globales de scripts;
  - watcher liviano por polling detecta cambios en `.ts`/`.js`/`.mjs` del folder de scripts y refresca registry/global shortcuts sin reiniciar la app.
- Feedback:
  - invalid/reserved/duplicate/selection-incompatible global shortcuts aparecen como diagnostics en Settings;
  - fallos de registro OS se loguean por stderr con action id y shortcut;
  - runs globales loguean resultado y toasts devueltos por scripts.
- Tests agregados:
  - Rust: normalización de shortcuts y diagnostics reserved/duplicate/empty-selection;
  - visual: diagnostic de shortcut global reservado visible en Settings.
- Skill `copicu-scripts` actualizada para documentar `globalShortcut` como disponible con contexto vacío.

## Implementado 2026-06-06, Clipboard Change

- Primer slice de `clipboardChange` para scripts:
  - el watcher dispara acciones después de aceptar y persistir el item capturado;
  - solo corre scripts `source: "script"` ready con trigger `clipboardChange`;
  - requiere `input.source: "clipboard"` y selección `none` u `optional`;
  - respeta `input.kinds`/`input.mime` contra el item capturado;
  - contexto explícito: `trigger: "clipboardChange"`, `currentItemId: <captured id>`, `selectedItemIds: []`, sin `view`;
  - self-write suppression sigue cortando writes iniciados por host/scripts antes de persistencia, por lo que no hay recaptura ni rerun para esa escritura.
- `insert_text`/`insert_image` ahora devuelven el id del item insertado o del item existente movido al top.
- `action_runs` registra runs `clipboardChange` con summary redacted que incluye trigger, current item presente y kinds, sin payload.
- Agregado ejemplo `scripts/examples/015-log-text-clipboard-change.ts` y copiado a `Documents/Copicu/Scripts`.
- Actualizada documentación de usuario y skill `copicu-scripts` para marcar `clipboardChange` como disponible.

## Skill Reutilizable 2026-06-06

- Creada skill global `copicu-scripts` para que cualquier proyecto/agente pueda pedir scripts de Copicu en lenguaje natural.
- Ubicaciones disponibles:
  - `C:\Users\jpsal\.codex\skills\copicu-scripts`;
  - `C:\dev\agent-infra\rules\skills\copicu-scripts`.
- La skill incluye:
  - ayuda cuando se invoca sin parámetros;
  - workflow para crear/editar scripts en `Documents/Copicu/Scripts`;
  - referencia de contrato `defineAction`;
  - referencia de API/capabilities actuales;
  - ejemplos de patrones;
  - template TS base.
- Validación de skill pasó con `quick_validate.py`.
- Mantenerla en sync cuando cambien triggers, capabilities o bridge host.

## Regla De Mantenimiento De Skill

- Cuando cambie Actions/Scripting API, revisar y actualizar `copicu-scripts` si existe.
- Cambios que obligan revisión:
  - triggers disponibles;
  - metadata `defineAction`;
  - `ActionInput` / `ActionContext`;
  - capabilities soportadas;
  - bridge `copicu.*`;
  - carpeta/default de scripts;
  - comandos de validación;
  - ejemplos oficiales.
- Checklist de cierre para cambios de Actions/Scripting:
  - actualizar docs del repo;
  - actualizar `scripts/examples` si aplica;
  - actualizar `copicu-scripts`;
  - correr `quick_validate.py`;
  - anotar el cambio en este documento.
- Resolución de carpeta para agentes:
  - path explícito del usuario;
  - `COPICU_SCRIPTS_DIR`;
  - Settings `scripts.folderPath` si se puede descubrir;
  - default `Documents/Copicu/Scripts`.

## Documentación De Usuario 2026-06-06

- Agregado `README.md` raíz como entrada pública del proyecto.
- Agregada carpeta `docs/user/`:
  - `docs/user/README.md`: qué es Copicu, de dónde viene, qué hace, estado actual y privacidad;
  - `docs/user/scripts.md`: guía exhaustiva de scripts, metadata `defineAction`, triggers, input, capabilities, API host, ejemplos y validación.
- `docs/README.md` y `docs/TOPICS.md` indexan esta documentación para que no quede suelta.

## Cierre De Sesion 2026-06-06, Global Shortcuts Y Auto Refresh

Estado actual:

- `globalShortcut` para scripts está implementado en Rust.
- `Ctrl+Shift+,` sigue reservado para abrir Copicu.
- Scripts globales se registran si:
  - son `source: "script"`;
  - declaran `globalShortcut`;
  - tienen `shortcut` normalizable;
  - no tienen diagnostics `error`;
  - no chocan con otro script;
  - no requieren selección.
- Contexto global explícito:
  - `trigger: "globalShortcut"`;
  - `shortcut` normalizado;
  - `selectedItemIds: []`;
  - `currentItemId: null`;
  - sin `view`.
- `list_actions` refresca registry/cache/diagnostics y re-registra shortcuts globales.
- Hay refresh automático por polling cada ~1.5s sobre `.ts`/`.js`/`.mjs` del folder de scripts; detecta cambios por path/tamaño/mtime y re-registra global shortcuts sin reiniciar.
- Event-driven watcher sigue siendo opcional futuro; polling actual es suficiente para dogfood.

Script dogfood creado en carpeta real:

- `C:\Users\jpsal\Documents\Copicu\Scripts\014-paste-first-four-copyable.ts`
- id: `jp.pasteFirstFourCopyable`
- hotkey: `Ctrl+Alt+Shift+4`
- comportamiento:
  - busca `-kind:image`;
  - toma hasta 4 items no-imagen con texto;
  - une cada clip con fin de línea;
  - escribe al clipboard;
  - enfoca ventana previa;
  - hace paste con shortcut `default`.
- Validación:
  - typecheck TS pasó;
  - `npm run scripts:run-example -- "$env:USERPROFILE\Documents\Copicu\Scripts\014-paste-first-four-copyable.ts"` pasó con datos sintéticos.

Checks finales del repo:

- `npm run build`: pasó.
- `npm run visual:check`: pasó, 32/32.
- `npm run rust:test`: pasó, 35/35.
- `quick_validate.py` para `copicu-scripts`: pasó.

Próxima sesión:

- Dogfoodear `clipboardChange` con texto sintético en app viva, validar que scripts text-only no corran para imagen, y validar anti-loop con un script que escriba salida sintética por host API.
