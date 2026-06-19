# Picker Computer Use focus battery

Objetivo: una bateria especifica del picker usando `copicu_computer_use`, separada en mouse y hotkeys, con foco especial en foco/visibilidad y el modo de mantener ventana activa (icono pin/candadito).

## Alcance v1

Solo picker. No settings, scripts, tags avanzados ni metadata windows todavia.

## Target estable

Usar siempre:

```text
Copicu ahk_class Tauri Window
```

Evitar target solo `Copicu` cuando haya terminales/docs con Copicu en el titulo.

## Precondiciones

1. Copicu real corriendo en sesion interactiva de Windows.
2. Dev hotkey global: `Ctrl+Shift+.`.
3. Pin/keep-active hotkey de esta corrida: `F8`.
4. Si quedan dialogs AHK residuales:

```powershell
Get-Process AutoHotkey64 -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
```

## Suite A - foco / visibilidad base

Ejecutar con tool calls directos:

1. `self_test` target `Copicu`.
   - PASS si `AHK_OK`.
   - `uia_find(Edit)` puede fallar; no bloquea.
2. `open_picker`.
   - PASS si luego `windows` lista `Copicu` / `Tauri Window`.
3. `focus` target `Copicu ahk_class Tauri Window`.
4. `window_info` target `Copicu ahk_class Tauri Window`.
   - PASS si ve titulo `Copicu`, class `Tauri Window`, process `copicu.exe`.
5. `screenshot` target `screen` y target `Copicu ahk_class Tauri Window`.
   - PASS si el target screenshot muestra picker.
   - El screen screenshot se usa para verificar si realmente esta al frente o detras de otra ventana.

### Hallazgo actual de foco

En la corrida 2026-06-14, `window_info` y target screenshot podian ver Copicu, pero el screenshot de pantalla completa mostro que el picker podia quedar detras de Windows Terminal. Por eso la bateria debe distinguir:

- `visible/exists`: aparece en `windows` y se puede capturar con `PrintWindow`.
- `foreground/topmost`: aparece realmente al frente en screenshot de pantalla completa.
- `keyboard-ready`: despues del hotkey, una escritura inmediata llega al search sin hacer click ni llamar a `focus` manual.

Las tres cosas deben validarse por separado. La regresion de 2026-06-18 fue exactamente `visible/exists` sin `keyboard-ready`: el picker se veia, pero el teclado seguia en la app previa por la ruta no-activate.

## Suite B - mouse

### B1. Mouse input en search

1. `open_picker` si no esta visible.
2. `focus` target estable.
3. `send` `^a{Backspace}`.
4. `type` `url-fixture`.
5. `screenshot` target.
   - PASS si search muestra `url-fixture` y `1 / 6 matches`.

### B2. Menu de item por mouse

1. Con `url-fixture` filtrado, `click` en el menu `...` del item.
2. `screenshot` target.
   - PASS si aparece menu con acciones como `Activate`, `Paste`, `Paste plain`, `Open URL`, `Edit`, `Edit metadata`, `Delete`.

### B3. Candadito / mantener activa por mouse

Probar explicitamente estos estados con screenshots de pantalla completa:

1. Estado unpinned/unlocked:
   - Si el icono pin/candadito esta resaltado, alternar con `F8` o click en el icono hasta verlo sin resaltado.
   - `screenshot` target para evidencia.
2. Click fuera de Copicu.
   - `click` en coordenada segura fuera de la ventana.
   - `screenshot` screen.
   - Esperado deseado: si `hide_on_focus_lost=true` y no esta locked/pinned, el picker debe esconderse o perder primer plano segun diseño vigente.
3. Estado pinned/locked:
   - Abrir picker de nuevo.
   - Click en el icono pin/candadito o `F8`.
   - `screenshot` target para verificar icono resaltado.
4. Click fuera de Copicu.
   - `screenshot` screen + `windows`.
   - Esperado: picker sigue visible/mantenido activo.

### Resultado observado 2026-06-14

- `F8` alterno el estado visual del pin: screenshot `picker-focus-unpinned.png` mostro pin sin resaltar.
- Con pin resaltado, click fuera no oculto el picker.
- Click aproximado en la zona del candadito/pin oculto el picker en una corrida; hay que ajustar coordenadas y separar pin vs lock porque estan muy cerca.
- El foco puede ser ambiguo: Copicu existe y `PrintWindow` lo captura, pero en full-screen puede estar detras de otra ventana.

## Suite C - hotkeys

### C0. Hotkey deja el picker keyboard-ready

Esta prueba es obligatoria si se toca hotkey/foco/show/hide. No llamar `focus` entre abrir y tipear, porque eso enmascara la regresion.

1. Enfocar una app externa real, por ejemplo Windows Terminal/WezTerm/Vivaldi: `focus` target externo.
2. `open_picker`.
3. Inmediatamente `type` `focus-probe-<token>`.
4. `screenshot` target `Copicu ahk_class Tauri Window`.
   - PASS: el search muestra `focus-probe-<token>`.
   - FAIL: el picker existe o se ve, pero el texto fue a la app externa o no aparece en el search.
5. `screenshot` target `screen` si hay duda de foreground/topmost.

Evidencia de validacion 2026-06-18: `.codex-run/computer-use/focus-hotkey-after-type-2.png` mostro el token en el search tras abrir con `Ctrl+Shift+.` desde una terminal externa.

### C1. Abrir/cerrar por hotkey global

1. `open_picker`.
2. `windows`.
   - PASS: aparece `Copicu`.
3. `open_picker` de nuevo.
4. `windows` + `screenshot screen`.
   - PASS: se oculta o deja de estar al frente segun estado pinned.

### C2. Search por teclado con foco explicito

1. Abrir picker.
2. `focus` target estable.
3. `send` `^a{Backspace}`.
4. `type` `json-fixture`.
5. `send` `{Down}{Up}`.
6. `screenshot` target.
   - PASS: `json-fixture`, `1 / 6 matches`, seleccion estable.
   - Nota: esta prueba valida input dentro del picker una vez enfocado, pero no prueba que el hotkey deje el picker keyboard-ready. Para eso usar C0.

### C3. Pin/keep-active por hotkey

1. Abrir picker.
2. `send` `{F8}`.
3. `screenshot` target.
   - PASS: icono pin/candadito cambia visualmente.
4. Click fuera.
5. `screenshot screen`.
   - PASS: si quedo pinned/locked, picker sigue visible.
6. `send` `{F8}` otra vez.
7. Click fuera.
   - PASS esperado: si quedo unpinned/unlocked, picker no debe mantenerse activo.

## Suite D - limitaciones conocidas del tool

- `uia_find` y `uia_tree` fallan contra WebView/Tauri en esta configuracion. No bloquear la bateria por UIA.
- Algunas acciones `send/type/click` pueden devolver salida vacia aunque el efecto haya ocurrido; validar con screenshot.
- `window_info` del tool actualmente usa ventana activa para algunos datos; acompañar siempre con screenshot.
- Para validar foco real, usar screenshot de `screen`, no solo target screenshot.

## Evidencia de esta corrida

- `.codex-run/computer-use/picker-focus-target.png` - picker capturado por target con pin resaltado.
- `.codex-run/computer-use/picker-focus-unpinned.png` - picker capturado por target con pin sin resaltar tras `F8`.
- `.codex-run/computer-use/picker-focus-after-unpinned-outside-screen.png` - full screen tras click fuera en estado unpinned.
- `.codex-run/computer-use/picker-focus-after-lock-click-screen.png` - full screen tras click en zona pin/candadito.

## Pendiente inmediato

1. Mantener C0 como oracle de regresion del hotkey keyboard-ready: cualquier refactor de foco que pase screenshots target pero falle C0 no esta listo.
2. Ajustar coordenadas exactas del icono pin vs candadito con screenshots full-screen y target.
3. Definir expected formal de producto:
   - unpinned + focus lost: esconder o solo perder foco?
   - pinned/locked + focus lost: mantener visible y/o mantener foreground?
4. Convertir esta bateria manual en comando asistido si el tool permite invocarse programaticamente desde Pi.
