---
id: hotkeys
status: active
kind: decision-map
triggers:
  - hotkey
  - hotkeys
  - shortcut
  - global shortcut
  - hotkey compuesto
  - key sequence
  - chord
primary_refs:
  - global-shortcut-and-tray.md
  - whichkey.md
  - tag-management-hotkeys.md
  - ../tracks/012-tags-and-hotkeys.md
  - ../../specs/006-tags-and-hotkeys/spec.md
---

# Hotkeys

Topic para el sistema de hotkeys de Copicu. Incluye hotkeys simples existentes y hotkeys compuestos. WhichKey es un consumidor visual separado; no es requisito para que el motor de hotkeys funcione.

## Conceptos

### Hotkey Simple

Una combinacion registrada como shortcut global o local:

```text
Ctrl+Shift+,
Ctrl+Alt+Shift+4
```

Uso actual:

- abrir picker;
- ejecutar scripts con trigger `globalShortcut`;
- futuros accesos directos a tags/comandos.

### Hotkey Compuesto

Una secuencia de pasos:

```text
Ctrl+Alt+C, J
Ctrl+Alt+C, T, W
```

El primer paso puede ser global. Los pasos siguientes pertenecen al motor de secuencias de Copicu.

### Route

Cada hotkey, simple o compuesto, resuelve a una ruta:

```text
ShortcutRoute
  PickerOpen
  TagOpen(slug)
  ScriptRun(action_id)
  Command(command_id)
  WhichKeyOpen(prefix)
```

WhichKey puede asignarse a un prefijo/hotkey compuesto como una ruta, pero tambien puede aparecer automaticamente al pausar dentro de una secuencia.

## Research 2026-06-08

Fuentes consultadas:

- Tauri Global Shortcut plugin: https://v2.tauri.app/plugin/global-shortcut/
- Tauri JS global shortcut reference: https://v2.tauri.app/reference/javascript/global-shortcut/
- `tauri_plugin_global_shortcut` docs.rs: https://docs.rs/tauri-plugin-global-shortcut/latest/tauri_plugin_global_shortcut/
- `global-hotkey` docs.rs: https://docs.rs/global-hotkey/latest/global_hotkey/hotkey/index.html
- TanStack Hotkeys sequences: https://tanstack.com/hotkeys/latest/docs/framework/react/guides/sequences
- `rdev` docs.rs para global keyboard hooks: https://docs.rs/rdev

Hallazgos:

- `tauri-plugin-global-shortcut`/`global-hotkey` soportan hotkeys globales como modificadores opcionales mas una tecla.
- No soportan una secuencia global multi-paso como `Alt+Space, J`.
- Librerias web como TanStack Hotkeys soportan secuencias, pero solo cuando la app/webview tiene foco.
- Capturar pasos posteriores sin enfocar Copicu requiere hooks globales de teclado (`rdev`, `inputbot`, `WH_KEYBOARD_LL`, libuiohook, etc.), con mas riesgo tecnico, permisos y confianza del usuario.

## Decision

Mantener tres capas:

1. Hotkeys simples: seguir usando `tauri-plugin-global-shortcut` para combinaciones globales directas.
2. Hotkeys compuestos: implementar un motor propio de secuencias.
3. WhichKey: UI opcional que observa el estado del motor y/o se abre por una ruta asignada.

Runtime recomendado actual:

- Registrar globalmente solo el prefijo inicial del hotkey compuesto.
- Al disparar el prefijo, recordar foco previo y entrar en estado pending.
- Mostrar/focalizar Copicu por main thread.
- No emitir eventos backend hacia el WebView durante el prefijo; el renderer consulta `get_compound_hotkey_pending` desde su propio IPC.
- Capturar el siguiente paso desde `document keydown` mientras el WebView esta enfocado.
- Si hay match final, ejecutar ruta y desregistrar temporales.
- Si hay subprefijo valido, mantener pending y seguir capturando desde frontend.
- Resetear por timeout/Escape/blur/refresco de acciones.

No usar hook global crudo en el primer corte.

Se probo registrar next steps temporales como shortcuts globales y tambien emitir `COMPOUND_HOTKEY_PENDING_EVENT` desde Rust al WebView durante el prefijo. Ambos caminos pueden romper el canal renderer->Tauri IPC en Windows/WebView2. Mantenerlos desactivados salvo que exista un harness especifico que demuestre lo contrario.

Esta arquitectura depende de enfocar Copicu para capturar pasos posteriores, pero preserva estabilidad del renderer. WhichKey sigue siendo compatible: observa el estado pending consultado por el renderer y muestra las proximas teclas, pero no es responsable de capturarlas.

## Riesgos

- Tomar foco puede interrumpir escritura, IME o estados sensibles en la app previa.
- `Alt+Space` puede chocar con el menu de ventana de Windows; no fijarlo como default sin dogfood.
- Las secuencias ambiguas (`Ctrl+Alt+C, T` y `Ctrl+Alt+C, T, W`) requieren politica clara.
- Registrar muchos prefijos globales puede aumentar conflictos con otras apps.

## Politicas Iniciales

- Hotkeys simples y compuestos comparten normalizador, display formatter y diagnosticos.
- Ambiguedades se rechazan en el primer corte.
- El motor debe poder operar sin WhichKey visible.
- WhichKey puede abrirse automaticamente por `revealDelayMs` o manualmente por ruta.
- No ejecutar paste ni escribir clipboard solo por entrar en secuencia.

## Settings Y Hints UI

Decision de producto 2026-06-12: Copicu necesita una superficie de Settings para ver los hotkeys de la app y, en la medida posible, los hotkeys declarados por scripts. Esta superficie debe empezar como inventario confiable y diagnostico antes de prometer edicion universal.

Reglas para el corte:

- Mostrar en un panel unico los shortcuts app-owned, globales, compuestos, locales relevantes y scripts descubiertos con `shortcut`.
- Editar solo shortcuts cuya fuente de verdad sea segura y persistida por Settings. Para scripts, el shortcut vive en metadata/source del script; editar desde Settings requiere un flujo explicito para modificar archivo u overridear de forma documentada.
- Reusar el normalizador/display formatter existente para evitar strings inconsistentes.
- Exponer conflictos y estado de registro junto al shortcut, no como error oculto posterior.
- Los controles UI con hotkey asignado deben poder mostrar un hint compacto en tooltip o label usando un componente tipo `Kbd`, sin duplicar texto largo en todas partes.
- No usar hotkeys renderer como sustituto de hotkeys nativos/globales cuando el comportamiento depende de foco o ventana. El intento de pin del picker con `Ctrl+G`, `Ctrl+Shift+O` y `F8` fue no confiable en WebView/Computer Use; para toggles de ventana usar ruta nativa/global si se implementa.

Estado implementado 2026-06-12:

- `Settings > Hotkeys` existe como inventario v1.
- Los shortcuts editables desde ahi son `general.globalShortcut` para abrir picker y `picker.pinToggleShortcut` para togglear pin/always-on-top del picker.
- Los shortcuts locales app-owned relevantes se listan como read-only: `Ctrl+K`, `Ctrl+I`, `Enter`/`Shift+Enter`, `F2`/`Shift+F2`.
- Los scripts descubiertos con `shortcut` se listan con triggers, archivo y diagnostics, pero siguen read-only en Settings.
- El toggle de pin ahora va por ruta nativa/global, no por handler React. Default actual: `F8`.
- `Keep picker open` no es el shortcut de pin: es una politica persistida del picker togglada desde la barra del picker; el pin queda como always-on-top. Si se quiere hotkey para `Keep picker open`, debe agregarse como ruta nativa/global o comando host-owned, no como handler renderer.
- El patron visual reusable vive en `ShortcutBadge` y ya se usa para hints compactos en menus/command palette, tooltip del toggle AI y tooltip del boton de pin.

## Implementacion Actual 2026-06-08

- Foundation Rust en `src-tauri/src/hotkeys.rs`: parser/formatter, `HotkeySequence`, `HotkeyStep`, `ShortcutRoute`, registry/trie y diagnosticos.
- Actions acepta `globalShortcut` compuesto en scripts, por ejemplo `Ctrl+Alt+C, H`.
- Runtime primer slice anterior:
  - registra solo prefijos globales;
  - entra en pending al recibir el prefijo;
  - recuerda foco previo y muestra Copicu;
  - captura siguiente tecla desde frontend enfocado;
  - resuelve ruta y ejecuta `ScriptRun`.
- Pending reset parcial implementado: `clear_compound_hotkey_pending` limpia el estado Rust y el frontend lo llama en timeout, Escape y blur. La captura del segundo paso queda centralizada en un handler `document`.
- Intento de mitigacion agregado despues del reporte de hang: backend auto-expira pending sin depender del frontend, comando `get_compound_hotkey_pending`, sync frontend en focus/visibility, root React persistente en dev y foco nativo Windows parcial para la ventana principal.
- Dogfood actual: `examples.toastHello` en `scripts/examples/001-toast-hello.ts` / `Documents/Copicu/Scripts/001-toast-hello.ts` usa `Ctrl+Alt+C, H`.
- UI WhichKey no esta implementada; solo hay toast informativo de pending con los siguientes pasos validos.
- Workaround Windows/Codex 2026-06-10: `Ctrl+Shift+,` usa ruta no-activate para el picker. Primero sincroniza estado Tauri con `window.show()`/`unminimize()` y despues lo trae al frente con `ShowWindow(SW_SHOWNOACTIVATE)` + `SetWindowPos(... SWP_NOACTIVATE ...)`; si ya esta foreground/focused, lo oculta. Tradeoff aceptado por ahora: al abrir desde otra app, escribir puede seguir yendo al input anterior hasta que el usuario haga click en Copicu. El tray conserva la ruta normal con foco.
- Experimento descartado 2026-06-10: usar solo `HWND_TOP` con `SWP_NOACTIVATE` no alcanza para traer Copicu delante de Codex; los logs muestran el hotkey entrando y la ventana visible, pero queda detras. Se vuelve al flip `HWND_TOPMOST` -> `HWND_NOTOPMOST` porque es la variante que efectivamente aparece adelante sin activar.
- Hallazgo del incidente Codex 2026-06-10: desde Codex, cualquier intento probado de foco programatico posterior al hotkey (`window.set_focus`, foco diferido y click sintetico sobre search) vuelve a producir la transparencia parcial de Codex. Cambiar el hotkey a `Ctrl+Alt+Shift+F12` no lo corrigio y ademas choco con automatizaciones AHK existentes. La ruta no-activate fue la unica variante que evito la transparencia durante el dogfood.
- Estado aceptado 2026-06-10: el bug visual de transparencia de Codex queda conocido y no bloqueante por ahora. Observacion util de JP: si el bug aparece por hotkey y la ventana queda oculta, el primer click posterior en tray puede reproducir/limpiar el estado visual; desde el segundo click de tray vuelve a verse normal. No seguir iterando este bug salvo que vuelva a molestar o aparezca una hipotesis nueva.
- Decision vigente: mantener `ENABLE_COMPOUND_TEMPORARY_NEXT_STEPS = false`. El prefijo compuesto sigue siendo global permanente, pero los siguientes pasos se capturan desde el WebView enfocado. El renderer sincroniza pending por polling liviano (`get_compound_hotkey_pending`) para evitar emits backend durante el callback global.
- Implementacion actual: `Ctrl+Alt+C, T` ejecuta `jp.compoundHotkeyToast` con `log + ui.notify`; despues del script siguen heartbeats, drag mueve por `GetWindowRect` y X custom oculta.
- Nota de runtime: no llamar `global_shortcut().register()`/`unregister()` sincronicamente dentro del callback de global shortcut. En Windows/Tauri eso dejo Copicu `Responding=False` despues del prefijo. Registrar/desregistrar temporales desde un thread separado para que el callback retorne rapido.
- Nota de estabilidad: tampoco crear/mostrar ventanas Tauri desde el camino del shortcut global o desde threads de script sin una ruta main-thread-safe. En el dogfood, llamar `setup_notifications_window` desde el shortcut global tambien dejo la app `Responding=False`. Precrear `notifications` en startup se desactivo temporalmente mientras se estabiliza el flujo; para dogfood de compuestos usar `ui.notify` nativo o logs, no la ventana custom de toasts.
- Nota de estabilidad ampliada: la misma regla aplica al shortcut simple del picker y a tray/menu. No llamar `show_main_window` ni `toggle_main_window` inline desde callbacks nativos. Tampoco tocar APIs de ventana Tauri desde threads propios. La ruta estable es: callback nativo retorna rapido; si hace falta, un thread/timer espera poco; luego `app.run_on_main_thread(...)` ejecuta las operaciones de ventana.
- Regla durable de arquitectura: cualquier camino que pueda nacer fuera del main thread de Tauri debe tratar las APIs de UI como peligrosas hasta demostrar lo contrario. Esto incluye callbacks de `global-shortcut`, tray/menu, eventos nativos, threads diferidos, runner de scripts, efectos de scripts, notificaciones, `WebviewWindowBuilder`, `WebviewWindow.show/hide/set_focus`, `emit`/`emit_to` hacia ventanas y plugin APIs con efecto visual. La forma objetivo es: capturar estado minimo, retornar rapido, y despachar el efecto UI con `app.run_on_main_thread(...)`.
- Hallazgo de scripts 2026-06-08: despues de `Ctrl+Alt+C, T`, JP vio que el script mostraba feedback pero luego abrir la ventana principal la dejaba unresponsive. Causa probable: efectos como `ui.notify`, `ui.markdownOutput`, `picker.show` y `picker.hide` salian del runner en background thread. Estos efectos fueron movidos a helpers main-thread-safe en `src-tauri/src/actions.rs`, pero falta dogfood manual y review general para detectar caminos equivalentes.
- Fix de `ui.notify` 2026-06-08: el renderer seguia vivo por CDP, pero IPC Tauri quedaba colgado despues del `ui.notify` nativo en main thread. `ui.notify` de scripts ahora emite un toast local al WebView principal y dispara la notificacion nativa desde un thread separado. Con validacion sintetica, `Ctrl+Alt+C, T -> Ctrl+Shift+,` mantiene `copicu.exe Responding=True`, heartbeats e IPC CDP sanos. Computer Use confirmo drag/click/X y ejecucion del compuesto sin colgar.
- Diagnosticos vigentes: logs `[diag] window.show.*`, `window.event`, `renderer heartbeat/focus/blur/visibility/error` y `drag-start-*` deben quedar habilitados mientras el dogfood de hotkeys/ventana principal siga inestable. Si la app parece colgada, primero verificar si los heartbeats continuan y si el drag genera `drag-start-request`.
- Diagnostico WebView2: si la ventana parece blanca, verificar por CDP antes de clasificarlo como hang. En el incidente 2026-06-08, CDP confirmo que el renderer principal estaba vivo y renderizando; el rectangulo blanco visible era un item de imagen del historial ocupando el preview.
- Leccion B2 2026-06-08: no usar `app.emit`/`emit_to` hacia el WebView principal como parte del camino de entrada/salida de un global shortcut compuesto. En el bug post-compuesto, el renderer seguia vivo por CDP pero `invoke(record_renderer_diagnostic)` quedaba colgado, heartbeats se detenian y custom chrome no recibia eventos. La ruta estable fue invertir la direccion: renderer pregunta estado pending; Rust no empuja eventos al WebView durante el prefijo.
- Dogfood 2026-06-11: el picker hotkey es configurable desde Settings. Para Windows key usar label manual `Win+Alt+C`; backend normaliza a `Alt+Meta+C` y Tauri/global-hotkey lo mapea a `MOD_WIN | MOD_ALT | C`.
- Conflicto 2026-06-11: `Win+Alt+C` fallaba aunque CopyQ estuviera cerrado porque AutoHotkey principal (`C:\dev\main\copy-q.ahk`) tenia `#!c`. Se removio ese binding; queda `#+c` para CopyQ.
- Instalada/dev simultaneas: dev aislado usa `Ctrl+Shift+.` por defecto. Si la produccion usa `Win+Alt+C`, no usar la misma combinacion en dev.
- Fix 2026-06-11: la ruta `toggle_main_window_without_focus` debe ocultar si `window.is_visible()` es true, no solo si esta foreground. Esto restablece el comportamiento de segunda pulsacion = ocultar.

## Incidente Cerrado 2026-06-08

`Ctrl+Alt+C, T` quedo estable tras desactivar next-step globals temporales y emits backend de pending. La confirmacion con `jp.compoundHotkeyToast` real paso: script completado, heartbeats continuos, drag post-compuesto medido con `GetWindowRect`, X custom post-compuesto completa.

Evidencia capturada:

- instancia viva desde `C:\dev\chat\copyq-tauri\src-tauri\target\debug\copicu.exe`;
- Vite escuchando en `127.0.0.1:1420`;
- `copicu.exe` aparecia `Responding=True` en PowerShell;
- logs finales: `compound shortcut prefix pressed`, `window.show.done`, `global script shortcut run: jp.compoundHotkeyToast via Ctrl+Alt+C, T -> Completed`;
- heartbeats continuaron despues del script;
- drag post-compuesto movio por `GetWindowRect`;
- X custom post-compuesto emitio `window-control-hide-click -> hide-picker-command-start -> window-control-hide-dispatched -> hide-picker-command-ok`.

Riesgos residuales:

- algun callback nativo o thread propio sigue tocando APIs Tauri de UI/ventana/plugin fuera del main thread;
- scripts que llaman `picker.activate` con `hidePicker` pueden llegar a `host::activate_item`/`host::hide_picker` desde background; corregirlo requiere preservar orden hide -> focus previous -> paste;
- foco OS y foco interno WebView pueden divergir.

Pendientes despues del cierre:

1. Auditar todo el codebase por APIs Tauri de UI/ventana/plugin ejecutadas desde callbacks nativos o threads propios.
2. Agregar harness de transiciones pending.
3. Mantener desactivados los next steps globales temporales salvo investigacion dedicada.

## Proximo Corte

Completar runtime estable:

- no reactivar next steps temporales globales;
- confirmar dogfood fisico de `Ctrl+Alt+C, H` desde la unica instancia principal de `C:\dev\chat\copyq-tauri`;
- completar review de callbacks/threads/scripts para detectar el mismo patron de main-thread-safety fuera del modulo de hotkeys;
- tests/harness de pending state;
- diagnosticos unificados para conflictos entre picker, scripts simples y compuestos;
- despues derivar `WhichKeyState`.
