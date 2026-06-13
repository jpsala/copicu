---
status: active
updated: 2026-06-10
topic: docs/topics/tag-management-hotkeys.md
related:
  - docs/topics/hotkeys.md
  - docs/topics/whichkey.md
  - docs/topics/compound-hotkeys-and-whichkey.md
---

# 012 Hotkeys, WhichKey And Tags

Estado: native-tag-hotkeys-removed-use-scripts.

## Objetivo

Separar y planificar:

1. hotkeys simples existentes;
2. hotkeys compuestos como motor independiente;
3. WhichKey como UI opcional asignable a un hotkey/secuencia;
4. tags como consumidor posterior del sistema de hotkeys.

## Topics

- `docs/topics/hotkeys.md`: motor, parser, registry, rutas y diagnosticos.
- `docs/topics/whichkey.md`: superficie visual WhichKey y comportamiento de reveal.
- `docs/topics/tag-management-hotkeys.md`: uso de hotkeys/secuencias para tags.

## Entendimiento Del Flujo

Hotkey compuesto sin WhichKey visible, runtime estable actual:

```text
Usuario esta en un input externo
  -> pulsa prefijo global
  -> Copicu recuerda foco previo y entra en estado pending
  -> Rust muestra/focaliza Copicu por main thread
  -> el renderer consulta pending con get_compound_hotkey_pending
  -> usuario pulsa siguiente tecla rapido
  -> frontend captura keydown y llama handle_compound_hotkey_step
  -> Copicu ejecuta la ruta
```

WhichKey automatico:

```text
Usuario esta en un input externo
  -> pulsa prefijo global
  -> Copicu recuerda foco previo y entra en estado pending
  -> Rust muestra/focaliza Copicu por main thread
  -> renderer observa pending
  -> usuario pausa mas que revealDelayMs
  -> Copicu muestra WhichKey con las proximas teclas posibles desde el estado pending
```

WhichKey asignado:

```text
Usuario pulsa un hotkey simple o compuesto asignado a WhichKey
  -> Copicu abre WhichKey para un prefijo/contexto
  -> usuario elige la siguiente tecla/comando
```

Tags:

```text
Usuario esta en un input externo
  -> pulsa hotkey simple o secuencia declarada por un script
  -> Copicu recuerda foco previo
  -> muestra picker
  -> aplica la query que paso el script, por ejemplo tag:<tag>
  -> usuario elige item
  -> Enter copia o Shift+Enter pega segun comportamiento actual
```

No pegar automaticamente al disparar el hotkey/secuencia filtrado. El script solo abre contexto de busqueda.

## Decision 2026-06-09: Hotkeys De Tags Via Scripts

JP decidio reemplazar la funcionalidad nativa de hotkey por tag en Settings por scripts.

Direccion nueva:

- Settings > Tags no debe editar, validar, registrar ni mostrar estado de hotkeys.
- Settings > Tags conserva metadata: lista, conteos, create tag, pin/unpin y `Open filtered`.
- Los hotkeys filtrados se expresan como scripts con `triggers: ["globalShortcut", "commandPalette"]`, `shortcut` y capabilities explicitas.
- El patron comun es:

```ts
await copicu.commands.run("picker.open", {
  query: "tag:context",
  rememberPrevious: true,
  focus: "search",
});
```

- La implementacion siguiente debe quitar el registro nativo `ShortcutRoute::TagOpen` desde `tag_configs.hotkey` para que hotkeys viejos guardados en DB no sigan activos.
- Mantener `ShortcutRoute::ScriptRun` y el runtime compuesto estable; no reactivar next-step globals temporales ni emits backend de pending hacia `main`.

Scripts a crear en la proxima implementacion:

- `020-open-tag-filtered.ts`: script principal/template de filtro por tag usando `commands.run("picker.open", ...)`.
- 2-4 wrappers de ejemplo con hotkeys distintos y queries distintas, por ejemplo `tag:context`, `tag:work kind:text`, `is:marked tag:context`, y `#prompt`.

Validacion de la proxima implementacion:

- `npm run build`
- `npm run visual:check`
- `cd src-tauri; $env:CARGO_TARGET_DIR='target-codex-check'; cargo check`
- relanzar app desde este worktree;
- verificar que Settings > Tags no muestra recorder/status de hotkeys;
- verificar que los hotkeys filtrados vienen de scripts descubiertos;
- validar `Ctrl+Alt+Shift+T` con datos sinteticos y logs `script.picker.open.*`.

## Implementado 2026-06-09: Remocion De Hotkeys Nativos De Tags

- Settings > Tags ya no muestra `HotkeyRecorder`, badges/status de hotkey ni conteo de hotkeys.
- Settings > Tags conserva summary, lista/counts, create tag, pin/unpin y `Open filtered`.
- Settings explica que los shortcuts filtrados viven en Actions/scripts.
- `list_tags` ya no expone `hotkey` ni `status`; `tag_configs.hotkey` queda en DB solo como compatibilidad historica.
- El runtime ya no maneja `GlobalTagShortcuts`, `TagHotkeyStatuses`, `register_tag_global_shortcuts` ni `ShortcutRoute::TagOpen`.
- Los global shortcuts filtrados quedan expresados como scripts con `globalShortcut`/`commandPalette` y `copicu.commands.run("picker.open", params)`.
- Ejemplos agregados: `020-open-tag-filtered.ts`, `021-open-work-tag-filtered.ts`, `022-open-context-text-filtered.ts`, `023-open-marked-context-filtered.ts` y `024-open-prompt-filtered.ts`.
- Los ejemplos fueron copiados a `C:\Users\jpsal\Documents\Copicu\Scripts` para discovery/dogfood real.

Validacion de cierre:

- `npm run build`: paso.
- Typecheck TS de wrappers `020`-`024`: paso.
- `npm run visual:check`: paso 66/66.
- `cd src-tauri; $env:CARGO_TARGET_DIR='target-codex-check'; cargo check`: paso.
- App viva desde este worktree: Copicu/Vite relanzados desde `C:\dev\chat\copyq-tauri`; hubo que limpiar `node_modules/.vite` y esperar el optimizer de Vite antes de lanzar Cargo porque un arranque dejo `#root` vacio con Tauri IPC vivo.
- CDP verifico `#root` montado, IPC `record_renderer_diagnostic`, heartbeats, Settings > Tags sin recorder/status y con `Filtered shortcuts`/`Actions scripts`, y query `tag:context` aplicada por `examples.openTagFiltered`.
- Logs confirmaron registro de scripts globales `Ctrl+Alt+Shift+T/W/X/M/P` y diagnosticos `script.picker.open.start/step/done`.
- Hide/X custom completo: `window-control-hide-click -> hide-picker-command-start -> window-control-hide-dispatched -> hide-picker-command-ok`.
- Drag validado con input OS y `GetWindowRect`: `(543,104)-(1363,724)` a `(743,104)-(1563,724)`. Un drag CDP disparo `drag-start-*` pero no movio HWND; para drag real preferir Computer Use/input OS y medir rect.
- Inyecciones sinteticas de `Ctrl+Alt+Shift+T` con `keybd_event`, `SendKeys` y `nircmd sendkeypress` no dispararon el global shortcut. Esto no invalida el registro; para la proxima sesion usar Computer Use o teclado fisico para validar el hook global real.

Proximo dogfood:

1. Probar con Computer Use/tecla fisica `Ctrl+Alt+Shift+T` y confirmar `examples.openTagFiltered` abre `tag:context` sin copiar/pegar.
2. Probar `021`-`024` desde command palette y, si se puede, hotkeys fisicos.
3. Revisar diagnostics de Actions para conflictos reales de shortcuts antes de cambiar combinaciones.
4. Mantener datos sinteticos y no persistir payloads reales en logs/docs.

## Alcance Primer Slice

- Implementar modelo in-memory de hotkeys simples y compuestos.
- Parser/normalizador para `Ctrl+Alt+C` y `Ctrl+Alt+C, J`.
- Registry comun con rutas `PickerOpen`, `ScriptRun`, `Command`, `WhichKeyOpen`.
- Diagnosticos de duplicados, invalidos y ambiguos.
- Tests del parser/registry con datos sinteticos.

## Implementado 2026-06-08

- `src-tauri/src/hotkeys.rs` implementa parser/normalizador, formatter, `ShortcutRoute`, registry/trie in-memory y diagnosticos de invalido/duplicado/ambiguo.
- El normalizador de actions acepta hotkeys compuestos tipo `Ctrl+Alt+C, H` sin romper hotkeys simples como `Ctrl+Shift+,`.
- Scripts con trigger `globalShortcut` pueden declarar secuencias compuestas.
- Rust registra globalmente solo el primer paso del compuesto via `tauri-plugin-global-shortcut`.
- Al disparar el prefijo, Copicu recuerda foco previo, muestra/focaliza la ventana principal y entra en estado pending. Rust no emite pending hacia el WebView; el renderer consulta el estado con polling liviano.
- El frontend captura el siguiente `keydown` a nivel `document` mientras pending y llama `handle_compound_hotkey_step`.
- Si la secuencia completa matchea, Rust ejecuta `ShortcutRoute::ScriptRun` con `trigger: "globalShortcut"` y shortcut completo.
- `scripts/examples/001-toast-hello.ts` y la copia instalada en `Documents/Copicu/Scripts` usan `shortcut: "Ctrl+Alt+C, H"` como dogfood.
- Se agrego toast informativo durante pending, por ejemplo `Hotkey Ctrl+Alt+C` / `Press H`, para evitar que parezca una apertura con filtro invisible.
- Se agrego comando Rust `clear_compound_hotkey_pending` y el frontend ahora limpia el pending backend en timeout, Escape y blur. Tambien se elimino la doble captura del input de busqueda para que el siguiente paso se procese por un solo handler `document`.
- Intento de mitigacion 2026-06-08: se agrego auto-expire backend del pending, comando `get_compound_hotkey_pending`, sync frontend en `focus`/`visibilitychange`, root React persistente para evitar doble `createRoot()` en HMR, y foco nativo Windows parcial (`SetForegroundWindow`/`BringWindowToTop`) para la ventana principal. Esto no resolvio el problema reportado por JP: `Ctrl+Alt+C` sigue dejando la app unresponsive/perceived hang.
- El trabajo fue integrado de vuelta al worktree principal `C:\dev\chat\copyq-tauri`; no seguir usando una instancia paralela de `copyq-tauri-hotkeys`.
- Hotfix operativo 2026-06-08 historico: durante la investigacion se probo `ENABLE_COMPOUND_GLOBAL_SHORTCUTS = false` para cortar el prefijo global. Ese hotfix fue revertido por el cierre B2; el estado vigente vuelve a registrar prefijos globales y mantiene desactivados solo los next steps temporales globales.
- Decision de arquitectura 2026-06-08 final B2: el prefijo sigue siendo global permanente, pero los next steps temporales globales quedan desactivados (`ENABLE_COMPOUND_TEMPORARY_NEXT_STEPS = false`). El prefijo muestra/focaliza Copicu por main thread y el renderer consulta pending por polling liviano; el segundo paso se captura con `document keydown`. WhichKey queda compatible como UI observadora del pending, no como requisito para capturar teclas.
- Implementacion 2026-06-08: `ENABLE_COMPOUND_GLOBAL_SHORTCUTS = true` y `ENABLE_COMPOUND_TEMPORARY_NEXT_STEPS = false`. `CompoundShortcutRuntime` conserva el estado pending y el frontend lo sincroniza con `get_compound_hotkey_pending`. `Ctrl+Alt+C` muestra/focaliza Copicu para capturar `H`/`T` dentro del WebView.
- Fix de hang 2026-06-08 historico: JP probo `Ctrl+Alt+C, H`; el prefijo entro, pero Copicu quedo `Responding=False` antes de loguear `compound temporary shortcut registered`. Causa probable: reentrancia/deadlock por llamar `global_shortcut().register()` dentro del callback del propio global shortcut. Ese camino de temporales globales fue descartado por B2.
- Segundo hang 2026-06-08: despues de ejecutar el script, el toast no era visible. Se intento llamar `setup_notifications_window(&app)` desde el camino del shortcut global antes de emitir toasts; eso volvio a dejar Copicu `Responding=False`. Regla operativa: el callback de global shortcut debe retornar rapido y no debe crear ventanas ni registrar/desregistrar shortcuts sincronicamente. Cualquier trabajo posterior debe ir por estado precreado, thread controlado o evento hacia una ventana ya existente.
- Diagnostico posterior 2026-06-08: precrear la ventana `notifications` en startup tambien se descarto temporalmente para reducir superficies WebView durante dogfood. Con WebView2 CDP (`--remote-debugging-port=9222`) se verifico que la ventana principal real renderiza `App` correctamente, con runtime Tauri presente, search enfocado y sin errores de consola. La captura blanca reportada por JP correspondia a un item de imagen grande dentro del feed, no a un WebView principal vacio. Para feedback de hotkeys compuestos durante dogfood, `001-toast-hello` y `019-compound-hotkey-toast` ahora usan `ui.notify` nativo en lugar de `ui.toast`.
- Incidente shortcut simple 2026-06-08: JP reporto que `Ctrl+Shift+,`/abrir ventana principal mostraba la ventana pero quedaba sin interaccion aparente. Se encontro que el shortcut simple y tray/menu todavia llamaban `show_main_window`/`toggle_main_window` directamente desde callbacks nativos. Ajuste: esos callbacks ahora solo spawnean una tarea corta con delay pequeno; `show_main_window` hace segundo intento de foco si Tauri sigue reportando `focused=false`. Esto mantiene el mismo principio usado para compuestos: los callbacks nativos retornan rapido y no hacen trabajo de ventana inline.
- Revision arquitectura 2026-06-08: el ajuste anterior seguia tocando APIs de ventana Tauri desde un thread propio, lo cual no es confiable. Nueva regla: callback nativo -> opcional thread/timer corto -> `app.run_on_main_thread(...)` -> operaciones de ventana. Se agregaron diagnosticos `[diag]` para `window.show.*`, eventos nativos de ventana, heartbeat/focus/blur/visibility del renderer y drag custom chrome. Esto permite distinguir si falla Rust/main thread, renderer, foco Windows o manejo de drag.
- Revision script effects 2026-06-08: JP confirmo que la ventana principal funciona antes de ejecutar `Ctrl+Alt+C, T`, pero despues del script con `ui.notify` volver a abrir la ventana la deja unresponsive. Esto amplio la hipotesis: no alcanza con corregir callbacks de shortcuts/tray/menu; tambien los efectos de scripts ejecutados desde threads de runner deben despachar cualquier API Tauri de UI/ventana/plugin por `app.run_on_main_thread(...)`. Se movieron `ui.notify`, `ui.markdownOutput`, `picker.show` y `picker.hide` a helpers main-thread-safe en `src-tauri/src/actions.rs`. Pendiente: dogfood manual real de la secuencia completa y review del codebase para encontrar el mismo patron en otros caminos.
- Fix validado 2026-06-08 historico/parcial: el repro `Ctrl+Alt+C, T -> Ctrl+Shift+,` con input sintetico mostro que el renderer seguia vivo por CDP, pero un `invoke(record_renderer_diagnostic)` quedaba colgado. Clasificacion: IPC/main thread Tauri bloqueado, no renderer muerto. Esa mitigacion no fue el cierre final; B2 se cerro quitando tanto temporales globales como emits backend de pending.
- Validacion posterior 2026-06-08: instancia viva `C:\dev\chat\copyq-tauri\src-tauri\target\debug\copicu.exe` PID 50084, Vite `127.0.0.1:1420` PID 36908, WebView2 CDP `127.0.0.1:9222` PID 48408. Flujo sintetico paso: `Ctrl+Shift+,` abre, `Ctrl+Alt+C` registra temporales `H` y `T`, `T` ejecuta `jp.compoundHotkeyToast`, nuevo `Ctrl+Shift+,` abre, `copicu.exe Responding=True`, heartbeats continuan y probe CDP IPC `record_renderer_diagnostic` responde. Falta confirmacion fisica/manual de drag/click por JP.
- Dogfood Desktop Use 2026-06-08: protocolo activo para estabilizar el problema repetido de ventana principal despues de scripts compuestos. Pasos: capturar PID/ruta/puertos/logs/Responding antes de tocar procesos; abrir con `Ctrl+Shift+,`; validar click en search y drag custom chrome; ocultar; ejecutar `Ctrl+Alt+C, T`; reabrir con `Ctrl+Shift+,`; validar click/drag; probar X custom; probar click afuera con `hideOnFocusLost=true`; clasificar con logs antes de parchear. Instrumentacion agregada: `window-control-hide-click`, `window-control-hide-dispatched`, `hide-picker-command-start`, `hide-picker-command-ok/error`, ademas de `window.event`, `window.show.*`, heartbeats y `drag-start-*`. En una pasada previa, click/drag y `Alt+F4` funcionaron despues del compuesto, pero un click por coordenadas en X no oculto; falta repetir con los nuevos logs para saber si fue click errado, handler frontend, IPC `hide_picker`, foco/foreground o backend.
- Resultado Desktop Use 2026-06-08 con instrumentacion: antes del compuesto, X custom funciona completo (`window-control-hide-click` -> `hide-picker-command-start` -> `hide-picker-command-ok`) y el renderer sigue emitiendo heartbeats. Despues de `Ctrl+Alt+C, T`, Rust registra `global script shortcut run: jp.compoundHotkeyToast ... Completed` y `Ctrl+Shift+,` muestra la ventana (`window.show.done`, visible/focused), pero desde ese punto no vuelven a aparecer heartbeats ni `drag-start-*` ni `window-control-hide-*`. El proceso sigue `Responding=True`, WebView2/CDP y Vite siguen vivos, y `Alt+F4` si llega al backend como `window.event: main close requested`. Clasificacion actual: no es un freeze total de proceso ni un fallo de `window.show`; es un estado post-script donde la UI queda pintada/visible pero el renderer deja de despachar diagnosticos/IPC hacia Tauri, por eso X custom y drag custom no son confiables. La prueba por click en X con Desktop Use esta ademas contaminada por el overlay "Codex is using your computer" sobre la esquina superior derecha; no usar coordenadas de esa esquina como evidencia unica. Para drag, medir con `GetWindowRect`: en la pasada post-script el rectangulo quedo `(78,78)-(898,698)` antes y despues de arrastrar, asi que no hubo movimiento real.
- Click afuera 2026-06-08: la ventana esta `always-on-top`/pinned por inicializacion, y `should_hide_on_focus_lost` desactiva hide-on-focus-lost cuando esta pinned. Por eso el click afuera en estado pinned no debe contarse como fallo. Para validar hide-on-focus-lost hay que despinear primero; despues del estado post-compuesto no se pudo hacer de forma confiable via renderer porque los controles custom dejaron de emitir diagnosticos/IPC.
- Fix B2 2026-06-08: el blocker se aislo como ruptura de IPC renderer->Tauri causada por efectos backend hacia el WebView durante el runtime compuesto, no por el body del script. Variantes: `Ctrl+Alt+C,T` no-op rompia; hotkey simple no-op equivalente pasaba; quitar temporales globales pero mantener `app.emit(COMPOUND_HOTKEY_PENDING_EVENT)` seguia rompiendo justo despues del prefijo; quitar tambien ese emit y dejar que el renderer consulte `get_compound_hotkey_pending` por polling liviano estabilizo el flujo. Cambio aplicado: `ENABLE_COMPOUND_TEMPORARY_NEXT_STEPS = false`, prefijo compuesto muestra/focaliza main por main thread, no registra bare next-step globals y no emite pending desde Rust; frontend sincroniza pending cada 250 ms y captura el siguiente paso con `keydown`. Timeout compuesto subio a 3000 ms para cubrir show/focus + polling. Validacion con `jp.compoundHotkeyToast` real (`log + ui.notify`): `global script shortcut run ... Completed`, heartbeats continuan, drag post mueve por `GetWindowRect`, y X custom post-compuesto loguea `window-control-hide-click -> hide-picker-command-start -> window-control-hide-dispatched -> hide-picker-command-ok`.
- Cierre provisorio Codex/transparencia 2026-06-10: JP confirmo que la transparencia aparece solo cuando el hotkey se dispara desde Codex; con Copicu fuera de memoria el hotkey no hace nada, asi que el disparador es nuestro camino de global shortcut interactuando con Codex/WebView. Se probaron: cambio de hotkey a `Ctrl+Alt+Shift+F12`, ruta igual al tray, `window.set_focus` diferido y click sintetico sobre search. Todas las variantes que activan/focalizan Copicu reintroducen la transparencia; el hotkey alternativo ademas choca con AHK (`C:\dev\main\mouse-gestures-conditions.ahk`). Decision para cerrar el corte: dejar `Ctrl+Shift+,` como toggle no-activate. Si Copicu esta oculto o visible detras, se muestra/trae al frente sin activar (`ShowWindow(SW_SHOWNOACTIVATE)` + `SetWindowPos` con `SWP_NOACTIVATE`); si ya esta foreground, se oculta. El tray conserva foco normal. Tradeoff conocido: al abrir con hotkey desde otra app, el teclado sigue en la app previa hasta click manual en Copicu.
- Estado de sesion 2026-06-10: bug visual de transparencia de Codex queda documentado como conocido y no bloqueante. Observacion adicional: si el bug fue provocado por hotkey y luego se usa tray, el primer click en tray puede mostrar/limpiar el mismo estado visual; despues de eso tray vuelve a verse normal. Mantener la implementacion actual usable y no seguir iterando el fix en este corte.

## WhichKey Window Investigation 2026-06-08

Objetivo de este corte: `Ctrl+Alt+C` no debe abrir `main`; debe abrir una superficie WhichKey dedicada que observa el pending estable. No avanzar tags ni reactivar next-step globals temporales.

Estado implementado/probado:

- `ShortcutRegistry::next_step_routes(prefix)` expone entradas para WhichKey desde el trie existente.
- `get_compound_hotkey_pending` devuelve `entries` y `expiresAtUnixMs`.
- `Ctrl+Alt+C` abre una ventana Tauri secundaria label `whichkey`, no `main`.
- Computer Use verifico que tras el prefijo Windows lista solo `Copicu WhichKey`, no `Copicu`.
- `Ctrl+Alt+C,T` puede ejecutar `jp.compoundHotkeyToast` cuando la ventana recibe `T`; el log esperado es `global script shortcut run: jp.compoundHotkeyToast via Ctrl+Alt+C, T -> Completed`.
- Timeout compuesto subio a 10 s durante este trabajo para cubrir primer load/diagnostico de ventana secundaria.

Hallazgos importantes:

- `main` y WhichKey no son equivalentes. `main` existe desde startup y ya tiene WebView/React cargados cuando se muestra; WhichKey se crea en caliente desde el prefijo.
- Crear/recrear WhichKey en caliente puede causar flicker, mostrar `about:blank`, aparecer primero en posicion default o quedar negra/blanca antes de que WebView2 pinte.
- Precrear WhichKey oculta tampoco fue una solucion limpia: la WebView secundaria puede arrancar antes de pending y quedar en `Waiting for shortcut`, o no componer visualmente aunque el renderer emita heartbeats.
- El refresh de actions/registry durante `module-load` de renderers estaba limpiando `CompoundShortcutRuntime.pending`. Eso hacia que WhichKey entrara en pending y lo perdiera inmediatamente. Fix aplicado: no llamar `compound.clear_pending()` durante refresh; `replace()` no debe cancelar un pending activo por un refresh inocente.
- El renderer de WhichKey puede reportar `whichkey-sync pending=Ctrl+Alt+C entries=2` y aun asi la HWND capturada por Windows verse negra/sin contenido. Clasificacion: estado/IPC sano, problema de composicion/render de ventana secundaria.
- Las capturas de Computer Use pueden mostrar solo HWND/superficie compuesta. Complementar siempre con logs `module-load label=whichkey`, `whichkey-sync`, heartbeats y, si CDP expone la pagina, inspeccion DOM.
- CDP WebView2 en `127.0.0.1:9222` a veces no expone la segunda WebView aunque los logs del renderer label `whichkey` existan. No usar ausencia de page CDP como unica prueba de que no cargo.

Cambios/mitigaciones utiles ya probadas:

- Posicionar WhichKey antes de `show()` para evitar que aparezca y luego se mueva.
- Usar fondo/tokens CSS propios en `body.whichkey-window` para evitar flash blanco si las variables de tema global todavia no estan listas.
- Destruir ventanas WhichKey stale antes de crear una nueva evita reusar una WebView vieja `about:blank`.
- Filtrar keydowns con `Ctrl`/`Alt`/`Meta` y armar la captura unos ms despues de ver pending reduce riesgo de procesar el propio prefijo como segundo paso.
- No depender del `CustomWindowFrame` de `main` para esta utility hasta resolver composicion; una superficie minima propia ayuda a aislar si el problema es chrome/layout o WebView.

Estado pendiente real:

- La ventana `Copicu WhichKey` queda estable en 440x260 y posicion fija, y el renderer reporta `pending=Ctrl+Alt+C entries=2`.
- Pero visualmente puede quedar como rectangulo oscuro sin contenido. Esto no esta cerrado.
- Proxima investigacion debe centrarse en composicion WebView2/Tauri de ventanas secundarias, no en tags ni en el runtime de captura.

Protocolo recomendado para seguir:

1. Arrancar con `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222`.
2. Ocultar `main` por `Alt+F4`/hide normal.
3. Disparar `Ctrl+Alt+C` desde una ventana neutral.
4. Confirmar con `list_apps` que solo aparece `Copicu WhichKey`.
5. Revisar logs:
   - `compound shortcut prefix pressed`;
   - `renderer: module-load label=whichkey`;
   - `renderer: whichkey-sync pending=Ctrl+Alt+C entries=2`;
   - ausencia de `compound shortcut pending cleared/expired` prematuro.
6. Capturar screenshot y medir posicion/tamano.
7. Solo despues probar `T` y confirmar `jp.compoundHotkeyToast`.

No avanzar:

- No reactivar `ENABLE_COMPOUND_TEMPORARY_NEXT_STEPS`.
- No volver a emitir pending desde Rust hacia WebView principal.
- No tocar tags hasta cerrar la superficie WhichKey o decidir abandonarla por overlay en `main`.

## Verificacion 2026-06-08

- En `C:\dev\chat\copyq-tauri`: `npm run build` paso.
- En `C:\dev\chat\copyq-tauri\src-tauri`: `CARGO_TARGET_DIR=target-codex-check cargo check` paso con warnings existentes de tags no usados.
- Instancia viva final: `C:\dev\chat\copyq-tauri\src-tauri\target\debug\copicu.exe`, Vite `127.0.0.1:1420`, DB real de AppData.
- Logs confirmaron registro de `Ctrl+Alt+C -> examples.toastHello` y `Ctrl+Alt+Shift+4 -> jp.pasteFirstFourCopyable`.
- Dogfood con input sintetico por `keybd_event`: `Ctrl+Alt+C` disparo `compound shortcut prefix pressed` y `main window show ok`, pero el segundo paso `H` no ejecuto `examples.toastHello`; logs mostraron `compound shortcut pending auto-expired`. En una captura, justo antes de enviar `H`, foreground era `copicu`, lo que apunta a foco/captura interna de WebView o event loop/frontend, no a falta de foreground OS.
- Hotfix verificado despues: instancia viva `C:\dev\chat\copyq-tauri\src-tauri\target\debug\copicu.exe`, Vite `127.0.0.1:1420`, `copicu.exe Responding=True`; logs muestran compuesto temporalmente deshabilitado y `Ctrl+Alt+Shift+4` registrado. Reenviar `Ctrl+Alt+C` por `keybd_event` dejo el conteo de `compound shortcut prefix pressed` sin cambios.
- Nuevo runtime compila y relanza en dev: logs muestran `compound script shortcut prefix registered: Ctrl+Alt+C -> examples.toastHello`. `cargo check` pasa. Prueba sintetica no concluyente: `keybd_event` no disparo `Ctrl+Alt+C` ni `Ctrl+Shift+,`, asi que falta prueba fisica/manual.
- Despues del fix de reentrancia, `cargo check` pasa y `tauri dev` relanzo `C:\dev\chat\copyq-tauri\src-tauri\target\debug\copicu.exe` con `Responding=True`. Falta repetir prueba fisica/manual de `Ctrl+Alt+C, H`.
- Despues del segundo fix, `copicu.exe` quedo `Responding=True`. Logs confirmaron `Ctrl+Alt+C` con next steps `H` y `T` registrados; `Ctrl+Alt+C, H` ejecuto `examples.toastHello` y emitio toast. Queda pendiente validar visualmente el toast tras precrear `notifications` en startup.
- Verificacion adicional: instancia relanzada con remote debugging WebView2. `copicu.exe` desde `C:\dev\chat\copyq-tauri\src-tauri\target\debug\copicu.exe`, Vite `127.0.0.1:1420`, WebView2 CDP `127.0.0.1:9222`, `Responding=True`. CDP mostro un unico renderer `http://127.0.0.1:1420/`, `window.__TAURI_INTERNALS__` presente, root montado, search activo y screenshot con picker renderizado. No se observaron errores de consola en el renderer real.
- Verificacion shortcut simple: `cargo check` y `npm run build` pasan. Instancia viva relanzada con `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222`; prueba sintetica de `Ctrl+Shift+,` registro `global shortcut pressed` y `main window show ok`, manteniendo `copicu.exe Responding=True`. La prueba sintetica no garantiza foreground real de Windows; falta dogfood fisico/manual de drag/click despues de abrir.
- Verificacion despues de `run_on_main_thread`: `cargo check` y `npm run build` pasan. Instancia viva relanzada con CDP. Prueba sintetica de `Ctrl+Shift+,` registro `window.show.start`, `show ok`, `unminimize ok`, `set_focus requested`, `window.show.done elapsed_ms=30 visible=true focused=true`, `renderer window-focus`, `window.event Focused(true)` y heartbeats posteriores. `copicu.exe Responding=True`.
- Verificacion 2026-06-08 posterior al fix de `ui.notify`: `npm run build` pasa. En `src-tauri`, `$env:CARGO_TARGET_DIR='target-codex-check'; cargo check` pasa con warnings existentes de tags no usados. Validacion sintetica de `Ctrl+Alt+C, T -> Ctrl+Shift+,` pasa con heartbeats e IPC CDP sanos.

## Incidentes Aprendidos 2026-06-08

- Dos worktrees intentando correr Copicu compiten por puerto, WebView, shortcuts y DB. Para dogfood normal, usar una sola instancia desde `C:\dev\chat\copyq-tauri`.
- Antes de reiniciar, buscar procesos viejos de Copicu/Vite/Tauri y validar que `copicu.exe` salga del worktree actual.
- Si un branch temporal esta atrasado respecto de la DB real y falla con `migration number too high`, no tocar la DB real; usar `COPICU_APP_DATA_DIR` aislado solo para ese experimento.
- Incidente principal B2: cerrado con validacion real de `Ctrl+Alt+C, T` + `jp.compoundHotkeyToast`; la ventana principal queda draggable/clickable y mantiene heartbeats.
- Hipotesis principales para la proxima sesion:
  - algun camino sigue tocando APIs Tauri de UI/ventana/plugin desde callback nativo o thread propio;
  - queda un riesgo no tocado: scripts que llaman `picker.activate` con `hidePicker` pueden llegar a `host::activate_item`/`host::hide_picker` desde background; cambiarlo requiere preservar el orden hide -> focus previous -> paste;
  - el renderer/WebView puede seguir vivo pero no recibir IPC si el main thread nativo queda bloqueado por plugin UI;
  - `global_shortcut().register()`/`unregister()` desde callbacks o cerca de callbacks puede reentrar el plugin;
  - alternativa conservadora: desactivar temporalmente el compuesto `Ctrl+Alt+C` o volver los scripts dogfood a hotkeys simples hasta estabilizar dogfood.

## Handoff Cerrado: Stabilize Post-Compound Main Window

Objetivo resuelto: el estado post `Ctrl+Alt+C, T` donde la ventana principal volvia a mostrarse pero quedaba rota para controles custom/renderer IPC quedo estabilizado.

Estado real al cierre:

- `npm run build` pasa.
- `cd src-tauri; $env:CARGO_TARGET_DIR='target-codex-check'; cargo check` pasa con warnings existentes de tags no usados.
- `Ctrl+Alt+C, T` ejecuta `jp.compoundHotkeyToast`.
- Despues del compuesto hay heartbeats del renderer.
- Drag post-compuesto mueve con `GetWindowRect`.
- X custom post-compuesto loguea `window-control-hide-click -> hide-picker-command-start -> window-control-hide-dispatched -> hide-picker-command-ok`.
- `copicu.exe` queda `Responding=True`; Vite `127.0.0.1:1420` y WebView2/CDP `127.0.0.1:9222` siguen vivos.

Clasificacion final:

```text
No es proceso muerto.
No es fallo de window.show.
No es suficiente decir "la UI se ve".
El estado roto era: ventana visible + proceso responsive + evento nativo Alt+F4 vivo,
pero renderer heartbeat/diagnostics/IPC y controles custom dejaban de avanzar.
CDP probó que React seguia vivo; `invoke(record_renderer_diagnostic)` quedaba colgado.
La causa practica fue emitir/pushear estado desde Rust al WebView en el camino del global shortcut compuesto.
```

Fix aplicado:

1. Diagnosticos de chrome con timeout corto y drag fire-and-forget.
2. `ENABLE_COMPOUND_TEMPORARY_NEXT_STEPS = false`.
3. No `app.emit(COMPOUND_HOTKEY_PENDING_EVENT)` desde Rust durante el prefijo.
4. Renderer consulta pending cada 250 ms y captura el segundo paso.
5. Timeout compuesto 3000 ms.

## Alcance WhichKey Despues Del Motor

- Estado visible derivado del registry para un prefijo.
- Reveal automatico despues de `revealDelayMs`.
- Ruta explicita `WhichKeyOpen(prefix)`.
- UI compacta con grupos y teclas.
- Dismiss por Escape, timeout y blur.

## Alcance Tags Despues De Hotkeys

- Crear modelo persistente liviano de configuracion de tags. Implementado como `tags`, `clipboard_item_tags` y `tag_configs`.
- Derivar listado de tags desde metadata existente. Implementado por migracion legacy y `list_tags`.
- Pantalla para ver tags, conteos y hotkey/secuencia.
- Registrar rutas de tags en el registry comun.
- Al completar hotkey/secuencia, abrir picker con filtro `tag:<slug>`.
- Mostrar diagnosticos de conflictos.

## Tags Backend Slice 2026-06-08

Estado:

- Storage ya tenia migracion normalizada `tags` + `clipboard_item_tags` + `tag_configs`.
- Storage ya tenia `list_tags`, `create_tag`, `update_tag_config` y `set_item_tags`.
- Este corte expuso comandos Tauri `list_tags`, `create_tag`, `update_tag_config` y `set_item_tags`.
- El frontend ahora tiene tipos/wrappers IPC para esos comandos.
- `update_history_item` ya sincroniza `clipboard_items.tags` hacia relaciones normalizadas, asi que el editor legacy sigue funcionando sin cambio visual.
- Se corrigio `open_settings_window_on_main_thread` con `#[cfg(not(test))]` porque rompia la compilacion de tests al usar imports/constantes runtime-only.
- Settings ahora tiene seccion `Tags` con resumen, lista searchable, create tag, pin/unpin, campo simple de hotkey persistido y accion "Open filtered" que abre el picker con `tag:<slug>` mediante evento frontend hacia `main`.
- Los hotkeys de tags siguen sin registrarse globalmente; el campo solo persiste configuracion pendiente hasta tener diagnosticos/routing visibles.
- Corte posterior de UI 2026-06-08: el campo simple de hotkey fue reemplazado por un `HotkeyRecorder` reusable.
- `HotkeyRecorder` guarda strings canonicos usando el parser Rust via comando `normalize_hotkey_sequence`.
- Soporta hotkeys simples como `Ctrl+Shift+U` y compuestas como `Ctrl+Shift+I, A`.
- Flujo de compuestas: `Record` -> primer paso -> `,` -> siguiente paso -> `Enter`.
- `Escape` cancela y restaura el valor anterior; `Clear` persiste `null`.
- Al empezar a regrabar una tag que ya tenia hotkey, la UI libera temporalmente el valor guardando `null`; si se cancela, lo restaura. Esto evita el choque del indice unico al reasignar la misma tecla.
- `update_tag_config` ahora actualiza primero por `tag_id` y solo inserta si no existe fila, para no chocar contra `idx_tag_configs_hotkey` al regrabar el mismo hotkey de la misma tag.
- Settings Tags fue compactado: cada item muestra label una sola vez, contador, pin, `Open filtered`, recorder y estado `Pending`; no repite `#slug` ni el texto largo "Saved as config...".
- Importante: `Ctrl+Shift+Y`/otros hotkeys de tags no hacen nada todavia fuera de Settings. Siguen siendo configuracion pendiente; no se registran globalmente.

Verificacion:

- `npm run build` pasa.
- En `src-tauri`: `$env:CARGO_TARGET_DIR='target-codex-check'; cargo check` pasa.
- `npm run visual:check` pasa 66/66 despues del recorder y compactacion de Tags.
- Computer Use valido regrabar la misma hotkey en la misma tag sin `UNIQUE constraint failed`.
- Computer Use valido una compuesta real en Settings Tags: `Ctrl+Shift+I, A`.
- `npm run rust:test` compila los tests, pero el ejecutable cae antes de correr con `STATUS_ENTRYPOINT_NOT_FOUND`; tambien ocurre con `cargo test tag --lib` tras limpiar entradas `conda`/`miniconda` del `PATH`. No se pudo ejecutar la suite Rust en esta sesion.

## Tag Hotkey Routing Slice 2026-06-08

Estado: cerrado y validado con datos sinteticos.

Implementado:

- Tags con `hotkey` entran al registry comun junto con picker y scripts.
- `ShortcutRoute::TagOpen { slug }` abre/focaliza el picker con filtro `tag:<slug>`.
- La ruta de tag no copia, no pega y no activa items automaticamente.
- Hotkeys simples de tags se registran globalmente.
- Hotkeys compuestas de tags registran solo el primer paso global y reutilizan el runtime estable actual.
- Sigue vigente `ENABLE_COMPOUND_TEMPORARY_NEXT_STEPS = false`.
- No se emite pending desde Rust hacia el WebView principal en el camino de global shortcut/compound pending.
- El renderer consulta `get_compound_hotkey_pending` y captura el segundo paso con `document keydown`.
- Settings Tags muestra diagnosticos visibles por tag y no registra hotkeys conflictivos.
- Conflictos cubiertos: tag vs tag, tag vs picker shortcut, tag vs scripts globales y secuencias ambiguas/prefix.
- `Open filtered` de Settings Tags usa el mismo comando backend `open_picker_for_tag`.
- Se corrigio `Shift+Enter` desde el picker para que vuelva a usar la accion de paste-to-previous-window cuando corresponde.

Validacion Computer Use con payload sintetico:

- Item sintetico: `SYNTHETIC_TAG_HOTKEY_PASTE_1780961414487`.
- Tag `1`: hotkey simple `Ctrl+Shift+Y`.
- Tag `context`: hotkey compuesta `Ctrl+Shift+I, A`.
- `Ctrl+Shift+Y` desde Notepad abrio picker con query `tag:1`.
- `Ctrl+Shift+I, A` desde Notepad abrio picker con query `tag:context`.
- En ambos casos, el hotkey de tag solo abrio el picker filtrado; no pego ni activo automaticamente.
- `Shift+Enter` despues de abrir por hotkey pego el item sintetico en Notepad, preservando el foco previo.
- Logs confirmaron `compound tag shortcut prefix registered`, `global tag shortcut registered`, `compound tag shortcut run` y ausencia de registro de temporales globales.
- Settings Tags mostro `Registered` para tags validas y `Conflict` para un hotkey tomado.

Verificacion:

- `npm run build` pasa.
- `npm run visual:check` pasa 66/66.
- En `src-tauri`: `$env:CARGO_TARGET_DIR='target-codex-check'; cargo check` pasa sin warnings nuevos.
- Instancia dev relanzada desde `C:\dev\chat\copyq-tauri`; `copicu.exe` sale del worktree actual, Vite escucha `127.0.0.1:1420` y `copicu.exe Responding=True`.

Decision para la proxima conversacion:

- Pausar este corte de hotkeys/tags.
- Explorar si parte de esta capacidad conviene reexpresarla como scripts o como una API scriptable de tags/hotkeys.
- No tocar WhichKey salvo que el experimento de scripts lo requiera para diagnostico.

## Ideas Para La Pantalla De Tags

- Search de tags.
- Columnas: tag, item count, hotkey/secuencia, status, acciones.
- Acciones por tag:
  - open filtered;
  - set/clear hotkey/secuencia;
  - pin;
  - copy query;
  - rename/merge/delete en cortes posteriores.

## Decisiones Iniciales

- Hotkeys compuestos y WhichKey son piezas distintas.
- El motor de hotkeys compuestos debe funcionar sin WhichKey visible.
- WhichKey puede abrirse automaticamente por pausa o por una ruta asignada.
- Hotkeys simples existentes siguen existiendo.
- Tags siguen siendo metadata local; no enviar nada a AI.
- El hotkey/secuencia del tag abre contexto filtrado, no activa ningun item automaticamente.
- Reutilizar query syntax existente: `tag:<slug>`.
- No acoplar la accion a React: Rust debe poder abrir picker filtrado desde global shortcut.
- Unificar diagnosticos con el registry de shortcuts existente.
- No usar hooks globales crudos en el primer corte.

## Implementacion Probable

1. Hotkeys:
   - `hotkeys.rs` o modulo equivalente;
   - parser/formatter;
   - `ShortcutRoute`;
   - registry/trie;
   - tests unitarios.
2. Compound runtime:
   - registrar prefijos globales;
   - estado pending;
   - timeout/Escape/blur;
   - mostrar/focalizar Copicu por main thread;
   - renderer consulta pending y captura el siguiente paso por `keydown`;
   - no registrar next steps como globals temporales sin investigacion dedicada.
3. WhichKey:
   - estado derivado del registry;
   - evento/command para mostrar;
   - UI compacta.
4. Tags:
   - tabla `tag_configs`;
   - comando `list_tags`;
   - comando `update_tag_config`;
   - rutas `TagOpen`.
5. Checks:
   - `npm run build`;
   - `npm run visual:check`;
   - `cargo check` con `CARGO_TARGET_DIR=target-codex-check`;
   - dogfood manual con datos sinteticos.

## Riesgos

- Conflictos entre hotkeys de picker, scripts, tags y WhichKey.
- Tomar foco puede interrumpir escritura, IME o estados sensibles en la app previa.
- `Alt+Space` puede chocar con el menu de ventana en Windows.
- El plugin puede fallar al registrar combinaciones tomadas por otras apps.
- Ambiguedades de secuencia necesitan politica clara.
- Al abrir filtrado hay que preservar el foco previo correcto para que `Shift+Enter` pegue en la app original.

## Proximo Corte

Dogfood de scripts filtrados, no mas implementacion de hotkeys nativos por tag.

1. Probar `020`-`024` desde `Documents/Copicu/Scripts`.
2. Validar `Ctrl+Alt+Shift+T` con Computer Use o teclado fisico, porque las inyecciones sinteticas no dispararon el hook global.
3. Validar los wrappers desde command palette y revisar diagnostics de Actions por conflictos reales.
4. Mantener como invariantes: no pegar automaticamente al abrir por tag/query, no registrar next-step globals temporales, no emitir pending desde Rust hacia main, y no persistir payloads reales del clipboard.

Actualizacion 2026-06-09:

- Se agrego experimento `copicu.picker.open({ query, rememberPrevious, show, focus })` y script `020-open-tag-filtered.ts` para replicar una ruta de tag desde scripting.
- JP reporto que la app quedo no responsive despues del corte; tratarlo como incidente abierto antes de construir encima.
- El script `020` hardcodea `tag:context`; el siguiente diseno debe buscar una accion/comando parametrizable para que varios hotkeys/rutas pasen `{ tag | query }` a una implementacion comun, en vez de duplicar un script por tag.
- Cierre de decision posterior: usar `copicu.commands.run("picker.open", params)` con allowlist y capabilities explicitas. Sacar hotkeys de tags de Settings y moverlos a scripts.

## Proximo Corte Propuesto: Settings Hotkeys

JP pidio una superficie unica en Settings para entender y ajustar los hotkeys propios de Copicu.

Alcance recomendado v1:

- Seccion `Settings > Hotkeys` con inventario consolidado de shortcuts de app: picker global, comandos globales, secuencias compuestas, shortcuts locales relevantes y rutas de scripts.
- Incluir scripts descubiertos con `shortcut`, `triggers`, action id, nombre visible, archivo de origen y diagnostico de conflicto/registro.
- Separar claramente `editable ahora` de `solo lectura/abrir origen`. Los hotkeys app-owned pueden editarse si ya tienen settings persistidos; los hotkeys de scripts viven en metadata/source del script, asi que editarlos desde Settings puede requerir un flujo dedicado que modifique archivo, regenere registry y maneje errores.
- No reintroducir hotkeys nativos por tag. Los filtros por tag/query siguen expresados como scripts.
- Agregar un patron visual reusable para mostrar shortcuts en UI: componente compacto tipo `Kbd`/glyph, usable en labels y tooltips sin convertir cada boton en texto largo.
- En hover de controles con hotkey asignado, mostrar el shortcut canonico y la accion que dispara. Si el control ya tiene label suficiente, preferir hint visual discreto; si no, tooltip explicito.

Preguntas de diseno para el corte:

- Fuente de verdad: que shortcuts vienen de Settings, cuales del registry de scripts y cuales son hardcodeados locales del renderer.
- Politica de edicion: si un script declara `shortcut` en archivo, decidir entre editar archivo automaticamente, abrir el script, o duplicar override en settings.
- Diagnosticos: conflictos entre app shortcuts, scripts globales, compuestos y shortcuts locales deben verse antes de guardar cambios.
- Testing: cubrir visualmente el panel y al menos un control con tooltip/hint de hotkey; no depender solo de screenshots.

## Implementado 2026-06-12: Settings Hotkeys V1

- Settings tiene seccion nueva `Hotkeys`.
- V1 separa inventario/diagnostico de edicion real:
  - editable: `general.globalShortcut` del picker y `picker.pinToggleShortcut` para togglear pin/always-on-top;
  - read-only app-owned: `Ctrl+K`, `Ctrl+I`, `Enter`/`Shift+Enter`, `F2`/`Shift+F2`;
  - read-only scripts: acciones descubiertas con `shortcut`, triggers, archivo y diagnostics.
- No se prometio edicion universal de scripts; la fuente de verdad sigue siendo el archivo/metadata del script.
- El toggle de pin del picker ahora tiene ruta nativa/global propia y default `F8`. Cuando queda pinned, deja de ocultarse por focus-lost; al despinnear vuelve a aplicar esa policy.
- Se agrego `ShortcutBadge` reusable para mostrar shortcuts compactos por pasos/teclas. El picker lo usa en menus de acciones y command palette; el toggle AI muestra tooltip con `Ctrl+I`; el boton de pin muestra el shortcut configurado.

Checks de cierre:

- `npm run build`: paso.
- `cargo check`: paso.
- `npm run visual:check`: paso 84/84.
- `npm run dev:restart`: relanzo la app dev del worktree para dejar la UI visible actualizada.

Siguiente corte sugerido:

1. Dogfoodear si el panel alcanza para detectar conflictos reales de scripts/globales.
2. Decidir si vale agregar status nativo del picker shortcut, no solo el valor guardado.
3. Diseñar un flujo explicito para editar shortcuts de scripts sin tocar archivos de forma opaca.

## Implementado 2026-06-12: Reset Tras Focus-Lost

Computer Use hizo un dogfood completo del picker usando principalmente teclado contra la instancia dev aislada (`Ctrl+Shift+.`). Validado:

- `Ctrl+Shift+.` abre el picker desde Notepad.
- `Ctrl+A` en search reemplaza la query nativamente; ya no dispara multi-select.
- Navegacion con `Down`, `PageDown` y `Home` responde.
- Con `Keep picker open` activo, `Enter` no oculta ni resetea query.
- Con `Keep picker open` activo, `Shift+Enter` pego un item sintetico en Notepad y dejo el picker visible con la query intacta.
- Con `Keep picker open` apagado, focus-lost oculta el picker como ventana transitoria y, al reabrir, resetea la sesion.

Inconsistencia corregida:

```text
1. Dejar Keep picker open off.
2. Abrir picker con Ctrl+Shift+. desde Notepad.
3. Escribir una query unica sin resultados, por ejemplo NO_MATCH_FOCUS_RESET_<timestamp>.
4. Enfocar Notepad y esperar que el picker se oculte por focus-lost.
5. Reabrir con Ctrl+Shift+.
```

Esperado:

- al ocultarse por focus-lost, la sesion transitoria se resetea igual que en `Enter`, doble click o hide explicito;
- al reabrir, query vacia, seleccion/anchor transitorios limpios y primer item visible seleccionado.

Implementacion:

- `PickerSessionController` en Rust es la fuente de verdad de sesion transitoria hidden/resettable.
- `host::hide_picker()` marca la sesion cuando oculta exitosamente; esto cubre hide explicito, toggle, activaciones y scripts que pasan por la primitiva host.
- `PickerFocusPolicy::schedule_hide()` tambien marca la sesion cuando ejecuta el `window.hide()` nativo por focus-lost.
- `main` consume `consume_picker_session_snapshot()` al recuperar foco/visibilidad y, si `reset=true`, ejecuta `resetPickerSession()` y `refreshHistory({ queryOverride: "" })`.
- `resetPickerSession()` limpia tambien `historyInputQuery`, `historyQuery`, `queryRef` y el valor DOM del search para evitar estados derivados viejos.

Validacion:

- `npm run build`: paso, con warning conocido de chunk grande.
- `cd src-tauri; $env:CARGO_TARGET_DIR='target-codex-check'; cargo check`: paso.
- `npm run visual:check`: paso 84/84.
- Dogfood real Computer Use contra Notepad: `Ctrl+Shift+.` abre dev, query sintetica `NO_MATCH_FOCUS_RESET_<timestamp>` produce no-results, focus-lost oculta, `Ctrl+Shift+.` reabre con input real vacio. UI Automation puede conservar una linea vieja en cache; la prueba de escritura posterior confirmo `oldPlusProbe=false` y `probeOnly=true`.

## Prompt Proxima Sesion

```text
Seguimos en C:\dev\chat\copyq-tauri.

Objetivo unico: dogfoodear los scripts `020`-`024` que abren el picker filtrado desde Actions/globalShortcut/commandPalette. No pegar automaticamente ni activar items. No tocar WhichKey salvo que sea estrictamente necesario para diagnosticos.

Leer primero:
- AGENTS.md
- docs/WORKING_MEMORY.md
- docs/tracks/004-actions-scripting.md
- docs/topics/actions-and-scripting-api.md
- docs/tracks/012-tags-and-hotkeys.md
- docs/topics/hotkeys.md
- docs/topics/tag-management-hotkeys.md
- docs/topics/ui-surface-architecture.md
- src-tauri/src/lib.rs
- src-tauri/src/hotkeys.rs
- src-tauri/src/storage.rs
- src/main.tsx
- scripts/examples/copicu-action.d.ts
- scripts/copicu-script-runner.mjs

Estado vigente:
- B2 post-compound main window renderer/IPC esta cerrado.
- Runtime actual: `ENABLE_COMPOUND_GLOBAL_SHORTCUTS = true`, `ENABLE_COMPOUND_TEMPORARY_NEXT_STEPS = false`.
- No registrar next-step globals temporales.
- No emitir `COMPOUND_HOTKEY_PENDING_EVENT` ni otros eventos backend hacia el WebView principal desde el camino de global shortcut/compound pending.
- El prefijo compuesto muestra/focaliza Copicu por main thread.
- El renderer consulta `get_compound_hotkey_pending` cada 250 ms y captura el segundo paso con `document keydown`.
- `Ctrl+Alt+C,T` con `jp.compoundHotkeyToast` real fue validado en el runtime B2: script completo, heartbeats continuan, drag post mueve por `GetWindowRect`, X custom post completa.
- Tags backend/API existe: `list_tags`, `create_tag`, `update_tag_config`, `set_item_tags`.
- Settings > Tags ya no tiene recorder/status/conteo de hotkeys; conserva lista/counts/create/pin/Open filtered y copy de Actions scripts.
- Native tag hotkeys ya fueron implementados y validados historicamente, pero ahora estan retirados. La decision vigente es scripts, no Settings-owned tag hotkeys.
- `copicu.commands.run("picker.open", { query, rememberPrevious, show, focus })` existe como patron parametrizable allowlisted. Requiere capabilities `commands:run` y `picker:open`.
- `020-open-tag-filtered.ts` a `024-open-prompt-filtered.ts` existen en `scripts/examples/` y fueron copiados a `Documents/Copicu/Scripts`.
- Checks de cierre pasaron: `npm run build`, typecheck TS de wrappers, `npm run visual:check` 66/66 y `cargo check`.
- CDP/IPC verifico root montado, Settings > Tags sin recorder/status, logs `script.picker.open.*`, heartbeats, Hide/X custom y drag por `GetWindowRect`.
- Inyecciones sinteticas de `Ctrl+Alt+Shift+T` no dispararon el global shortcut; para validar el hook real usar Computer Use o teclado fisico.

Plan:
1. Relanzar app viva desde este worktree si no sigue corriendo; si Vite queda con `#root` vacio, limpiar/esperar optimizer antes de lanzar Cargo.
2. Probar `Ctrl+Alt+Shift+T` con Computer Use/tecla fisica y confirmar que `examples.openTagFiltered` abre `tag:context` sin copiar/pegar.
3. Probar `021`-`024` desde command palette y, si se puede, sus hotkeys fisicos.
4. Revisar Settings > Actions diagnostics para conflictos de shortcuts reales.
5. Verificar root montado por CDP, IPC `record_renderer_diagnostic`, heartbeats, drag por `GetWindowRect`, Hide/X custom y logs `script.picker.open.*`.
6. No persistir payloads reales del clipboard; usar tags/datos sinteticos.

No persistir payloads reales del clipboard. No usar screenshots como unica evidencia de drag; medir con Win32 `GetWindowRect`.

Si se toca codigo, repetir:
- npm run build
- npm run visual:check
- cd src-tauri; $env:CARGO_TARGET_DIR='target-codex-check'; cargo check
```
