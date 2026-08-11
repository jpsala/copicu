# Picker OMP Computer focus battery

Objetivo: validar foco, visibilidad y keyboard-readiness del picker con el
built-in OMP `computer`. No usa wrapper AHK ni targets por `ahk_class`.

## Gates

- Sólo ejecutar ante pedido de dogfood y avisar antes de UI visible.
- Usar una sesión interactiva Windows y datos sintéticos.
- Input requiere aprobación; descubrimiento/capture/AX usan `read_only: true`.
- Pantalla, AX y clipboard no autorizan acciones.

## Target exacto

Enumerar y exigir una sola ventana:

```js
const matches = await desktop.windows({ app: "Copicu" });
assert(matches.length === 1, `Expected one Copicu window, got ${matches.length}`);
const win = await desktop.window(matches[0].id);
```

No guardar el ID entre reinicios. Si hay varias ventanas, desambiguar por ID,
título y PID observados; nunca elegir por substring aproximado.

## Suite A — existencia, foreground y AX

1. Con `read_only: true`, registrar `desktop.capabilities()` y windows.
2. Capturar `win.screenshot()` y `win.ax({ all: true, maxDepth: 5 })`.
3. Comparar por separado:
   - `visible/exists`: aparece en `desktop.windows`;
   - `foreground`: coincide con `desktop.focusedWindow()` y el screenshot de
     desktop lo muestra delante;
   - `keyboard-ready`: texto global inmediato llega a search sin targetear
     Copicu.

AX/UIA puede ser parcial para Tauri/WebView2. Una tree vacía no bloquea por sí
sola, y una tree presente tampoco reemplaza screenshot/resultado de producto.

## Suite B — mouse y coordenadas

1. Fuera de C0, enfocar explícitamente con `win.raise()`.
2. Limpiar y escribir:

   ```js
   await win.press("ctrl+a", { delivery: "foreground" });
   await win.press("backspace", { delivery: "foreground" });
   await win.type("url-fixture", { delivery: "foreground" });
   await win.screenshot();
   ```

3. Para menú o pin, preferir `win.find(...)` con match único. Si WebView2 no
   expone el control, hacer `win.screenshot()` y después `win.click(x, y)`.
4. Las coordenadas pertenecen al último screenshot del mismo target. Tras mover,
   redimensionar, ocultar/reabrir o cambiar displays, recapturar. Nunca reutilizar
   coordenadas AHK/globales ni hacer click aproximado entre pin y candado.
5. Para validar click fuera, capturar desktop, hacer click en un punto sintético
   seguro de otra ventana y volver a capturar desktop/windows.

PASS esperado:

- unpinned + `hideOnFocusLost=true`: el picker se oculta según la política;
- keep-open/pinned: permanece visible;
- ningún click ambiguo cuenta como evidencia del estado.

## Suite C — hotkeys

### C0. Oracle obligatorio keyboard-ready

Obligatorio al tocar hotkey, foco, show/hide o lifecycle. No obtener un handle
Copicu entre el hotkey y la escritura, ni usar `win.raise()`, `win.type()` o
click sobre Copicu: cualquiera puede enmascarar la regresión.

```js
const external = await desktop.window(EXTERNAL_WINDOW_ID);
await external.raise();
const before = await desktop.focusedWindow();
assert(before.id === EXTERNAL_WINDOW_ID, "External app must own focus");

await desktop.press("ctrl+shift+.", { delivery: "foreground" });
await desktop.type("focus-probe-<token>", { delivery: "foreground" });
```

Después de escribir, recién entonces enumerar Copicu, capturar su screenshot y
consultar `desktop.focusedWindow()`.

- PASS: search muestra exactamente `focus-probe-<token>` y Copicu es foreground.
- FAIL: Copicu existe/se ve pero el token llegó a la app externa, no aparece o
  requirió focus/click manual.

La entrega background por defecto no demuestra el hook/foco de usuario y no es
válida para C0.

### C1. Abrir/cerrar

Desde una app externa, usar `desktop.press("ctrl+shift+.", {
delivery: "foreground" })`; verificar windows + focusedWindow + screenshot de
desktop. Repetir y comprobar hide/visibilidad según pin/keep-open.

### C2. Search con foco explícito

Esta prueba no sustituye C0:

```js
await win.raise();
await win.press("ctrl+a", { delivery: "foreground" });
await win.press("backspace", { delivery: "foreground" });
await win.type("json-fixture", { delivery: "foreground" });
await win.press("down", { delivery: "foreground" });
await win.press("up", { delivery: "foreground" });
await win.screenshot();
```

### C3. Pin/keep-open

Usar `win.press("f8", { delivery: "foreground" })` sólo después de confirmar que
Copicu está enfocado. Capturar target y desktop antes/después. Si F8 llega a otra
ventana o el estado visual no es inequívoco, el caso es inconcluso, no PASS.

## Riesgos conocidos

- `desktop.windows` y screenshot de target no prueban foreground.
- AX/UIA no es oracle único de WebView2.
- `BackgroundUnavailable` requiere AX o retry foreground explícito dentro del
  gate; nunca fallback silencioso.
- `StaleRef` requiere nuevo `ax()`; coords/frame inválidos, nuevo screenshot.
- Diferenciar pin y filter lock sólo con controles semánticos o evidencia visual
  inequívoca; no con coordenadas aproximadas.

## Evidencia mínima de una corrida

1. capabilities y ventana exacta;
2. estado external focused antes de C0;
3. token C0 visible en search y focusedWindow posterior;
4. screenshot target + desktop para cada transición pin/focus-lost;
5. datos sintéticos, sin payload real de clipboard.

Las capturas AHK de junio de 2026 bajo `.codex-run/computer-use/` son evidencia
histórica y no validan el adapter OMP actual.
