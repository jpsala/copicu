# Picker real-user stress flow (Computer Use)

Objetivo: probar el picker como si fuera JP/usuario real: seleccionar texto en otra app, copiarlo, abrir Copicu, verificar foco, filtrar por fragmentos, activar el item y volver a pegar/usar el contenido. La bateria usa `copicu_computer_use` directo.

## Entorno de la corrida

Fecha: 2026-06-14.

- Copicu: `src-tauri/target/release/copicu.exe`.
- App data aislada: `.codex-run/picker-stress/app-data`.
- Clipboard watcher: habilitado (`COPICU_ENABLE_CLIPBOARD_WATCHER=1`).
- Hotkey picker: `Ctrl+Shift+.`.
- Hotkey pin/keep-active: `F8`.
- Source app: ventana AHK `Copicu Stress Source` con control Edit.
- Target estable Copicu: `Copicu ahk_class Tauri Window`.

## Flow ejecutado

### 1. Preparar app fuente y copiar texto como usuario

Texto fuente:

```text
COPICU-STRESS-ALPHA selected text from source window
Second line with URL https://example.test/stress-flow
Third line path C:\stress\flow\source.txt
JSON {"stress":true,"case":"source-copy"}
Unique token: ZETA-7391-FOCUS-FILTER-ACTIVATE
```

Acciones:

1. `focus` en `ahk_class AutoHotkeyGUI`.
2. Seleccion completa visible en el Edit.
3. `send` `^c`.
4. `open_picker` (`Ctrl+Shift+.`).
5. `focus` en Copicu.
6. Buscar `ZETA`.

Resultado: PASS.

Evidencia:

- `.codex-run/computer-use/stress-02-source-focused.png` - fuente con texto seleccionado.
- `.codex-run/computer-use/stress-flow-03-search-zeta.png` - Copicu filtro `ZETA`, `1 / 1 matches`, item capturado.

Hallazgo: `Get-Clipboard` desde PowerShell Session 0 no ve el mismo clipboard interactivo, pero Copicu si capturo el texto via watcher y el picker lo encontro.

### 2. Activar item encontrado y pegar de vuelta

Acciones:

1. Con `ZETA` filtrado, `send` `{Enter}`.
2. Volver a fuente `ahk_class AutoHotkeyGUI`.
3. `send` `^a{Backspace}^v`.
4. Capturar fuente por target screenshot.

Resultado: PASS.

Evidencia:

- `.codex-run/computer-use/stress-flow-04-source-target.png` - el contenido activado/copied desde Copicu fue pegado de vuelta en la fuente.

Nota: El texto pegado volvio en una sola linea en el Edit AHK, pero el contenido coincidio con el item capturado.

### 3. Segundo copy con texto corto + unicode

Texto fuente:

```text
BETA-FOCUS-SECOND selected partial line with accents áéí and emoji test
```

Acciones:

1. Fuente: `^a{Backspace}`.
2. `type` texto BETA.
3. `send` `^a^c`.
4. `open_picker`.
5. Buscar `BETA`.

Resultado: PASS con warning de tool.

Evidencia:

- `.codex-run/computer-use/stress-flow-05-beta-search.png` - Copicu filtro `BETA`, `1 / 2 matches` y muestra el item nuevo.

Warning: una llamada `send ^a^c` devolvio `PermissionError` leyendo el archivo temporal de salida del wrapper, pero la accion se ejecuto y Copicu capturo el texto. Esto es un bug/fragilidad del wrapper `copicu_computer_use`, no necesariamente de Copicu.

### 4. Filtros por fragmentos y combinaciones

Acciones:

1. Buscar `https stress-flow`.
2. Buscar `NO_SUCH_STRESS_999`.

Resultados:

- PASS: `https stress-flow` encontro el item multi-line capturado.
- PASS: query inexistente mostro empty state `No synthetic history matches that search.` con `0 / 2 matches`.

Evidencia:

- `.codex-run/computer-use/stress-flow-06-url-query.png`.
- `.codex-run/computer-use/stress-flow-07-no-match.png`.

### 5. Foco / pin / click fuera

Acciones:

1. Con picker abierto, `send` `{F8}`.
2. Screenshot target: pin resaltado.
3. Click fuera de Copicu en otra ventana.
4. Screenshot pantalla completa.
5. Intentar alternar de nuevo con `{F8}` y repetir click fuera.

Resultados:

- PASS parcial: al pinnear, el picker permanece visible tras click fuera.
- PASS parcial: el click fuera no destruye el estado ni crashea.
- INCONCLUSO: diferenciar con precision estado pinned vs unpinned sigue dificil porque `focus` puede no traer Copicu realmente al foreground, y `F8` puede ir a la fuente si Copicu no toma foco real.

Evidencia:

- `.codex-run/computer-use/stress-flow-08-pinned.png` - pin visualmente resaltado.
- `.codex-run/computer-use/stress-flow-09-pinned-click-outside-screen.png` - full screen tras click fuera: Copicu sigue visible.
- `.codex-run/computer-use/stress-flow-10-after-unpin-attempt.png` - intento de alternar pin.
- `.codex-run/computer-use/stress-flow-11-unpinned-click-outside-screen.png` - full screen posterior; Copicu siguio visible.

## Bugs / riesgos encontrados

1. **Foco real vs target focus:** `focus` puede devolver sin error, y target screenshot funciona, pero en pantalla completa Copicu puede estar detras de Terminal/fuente. Para validar foreground hay que usar screenshot `screen`.
2. **Pin/F8 puede enviarse a ventana equivocada:** una corrida devolvio `Target: Copicu Stress Source` al mandar `{F8}`. Como `F8` es global, Copicu lo proceso igual, pero el reporte del tool confunde.
3. **Wrapper `copicu_computer_use` PermissionError:** una llamada `send` fallo leyendo temp output (`Permission denied`) aunque la accion de teclado se ejecuto.
4. **PowerShell Session 0 clipboard no sirve como oracle:** `Get-Clipboard` no reflejo el clipboard interactivo; validar pegando en una ventana interactiva o via picker.
5. **UIA sigue fuera del oracle:** no usar `uia_find/uia_tree` para WebView.

## Estado general

El flow usuario principal paso:

- seleccionar texto en app externa;
- copiar;
- Copicu captura con watcher activo;
- abrir picker con hotkey;
- toma input de busqueda;
- filtra por fragmentos distintivos;
- activar/copy con Enter;
- pegar resultado en app externa;
- stress de query con match/no-match;
- pin mantiene visible ante click fuera.

Pendiente para formalizar:

1. Crear una version automatizada de esta bateria que no dependa de inspeccion visual manual.
2. Hacer oracle interactivo del clipboard en AHK para evitar PowerShell Session 0.
3. Separar pin vs candadito con coordenadas robustas o accesos/hotkeys dedicados.
4. Agregar stress con 10-20 copias sucesivas y busquedas rapidas.
5. Agregar activar con mouse/doble click y menu contextual en este mismo flow.
