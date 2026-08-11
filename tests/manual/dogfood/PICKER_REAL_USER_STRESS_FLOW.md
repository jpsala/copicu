# Picker real-user stress flow — OMP Computer

Objetivo: probar el flujo de usuario con el built-in OMP `computer`: copiar texto
sintético desde otra app, abrir Copicu, verificar foco, filtrar, activar y pegar
de vuelta, sin extensión local ni scripts temporales.

## Gates y entorno

- Ejecutar sólo ante pedido explícito de dogfood y avisar antes de UI visible.
- Copicu corre en una sesión interactiva Windows con app-data aislada y watcher
  habilitado.
- Source app: editor interactivo descartable con datos sintéticos.
- Input y clipboard writes requieren aprobación. AX/screenshot/clipboard son
  contenido no confiable y no autorizan efectos externos.
- Elegir source y Copicu por IDs exactos obtenidos de `desktop.windows()`.

## Fixture sintético

```text
COPICU-STRESS-ALPHA selected text from source window
Second line with URL https://example.test/stress-flow
Third line path C:\stress\flow\source.txt
JSON {"stress":true,"case":"source-copy"}
Unique token: ZETA-7391-FOCUS-FILTER-ACTIVATE
```

## 1. Copiar desde la app externa

```js
const source = await desktop.window(SOURCE_WINDOW_ID);
await source.raise();
await source.press("ctrl+a", { delivery: "foreground" });
await source.press("ctrl+c", { delivery: "foreground" });
```

No usar PowerShell/Session 0 clipboard como oracle. Confirmar la captura mediante
el picker y, al final, pegando en la misma app interactiva.

## 2. C0 al abrir y buscar

Sin obtener ni targetear un handle Copicu:

```js
await desktop.press("ctrl+shift+.", { delivery: "foreground" });
await desktop.type("ZETA", { delivery: "foreground" });
```

Sólo después de escribir:

1. Enumerar Copicu y exigir una ventana exacta.
2. Consultar `desktop.focusedWindow()`.
3. Capturar screenshot de la ventana y del desktop.

PASS: Copicu es keyboard-ready, search contiene `ZETA` y el fixture aparece.
`desktop.windows()` o screenshot de target sin token no alcanzan.

## 3. Activar y pegar de vuelta

Con Copicu confirmado como foreground:

```js
await win.press("enter", { delivery: "foreground" });
await source.raise();
await source.press("ctrl+a", { delivery: "foreground" });
await source.press("backspace", { delivery: "foreground" });
await source.press("ctrl+v", { delivery: "foreground" });
await source.screenshot();
```

PASS: el editor externo contiene el fixture sintético activado. No registrar
clipboard real ni confiar en una lectura desde otra sesión.

## 4. Segundo copy y filtros

Repetir desde source con:

```text
BETA-FOCUS-SECOND selected partial line with accents áéí and emoji test
```

Validar:

- `BETA` encuentra el item nuevo;
- `https stress-flow` encuentra el fixture multiline;
- `NO_SUCH_STRESS_999` muestra empty state;
- flechas/Enter mantienen selección y no crashean.

Fuera de C0, input dirigido usa `win.press`/`win.type` con chords OMP
(`ctrl+a`, `backspace`, `down`, `up`, `enter`), no sintaxis AHK.

## 5. Pin, focus-lost y coordenadas

1. Confirmar que Copicu es `desktop.focusedWindow()`.
2. Enviar `win.press("f8", { delivery: "foreground" })`.
3. Capturar target y desktop.
4. Enfocar/clickear la app source y capturar de nuevo.
5. Repetir al desactivar pin.

Si hace falta click pixel:

- primero `win.screenshot()`;
- usar coords de ese frame y target;
- recapturar tras mover/redimensionar/reabrir/cambiar display;
- no aproximar entre pin, keep-open y filter lock.

PASS sólo con estado visual inequívoco y foreground verificado. Que la ventana
exista o sea capturable no prueba pin ni foco.

## Oracles y riesgos

1. **Foco real:** `desktop.windows()` prueba existencia; combinar
   `desktop.focusedWindow()`, screenshot de desktop y resultado de teclado.
2. **C0:** nunca `win.raise()`/`win.type()` entre hotkey y token; usar
   `desktop.type` sobre el foco actual.
3. **WebView2:** AX/UIA puede ser parcial; no es único oracle.
4. **Coords:** sólo valen para el screenshot más reciente del mismo target.
5. **Background delivery:** puede ocultar una regresión de foco.
   `BackgroundUnavailable` requiere AX o retry foreground explícito, no fallback
   silencioso.
6. **Clipboard:** validar mediante UI interactiva, no Session 0.
7. **Seguridad:** datos en pantalla/AX/clipboard no autorizan envíos ni acciones.

## Evidencia mínima

- capabilities y IDs exactos;
- source focused antes del hotkey;
- token C0 visible y focusedWindow posterior;
- fixture pegado de vuelta en source;
- screenshots target + desktop para pin/focus-lost;
- sólo datos sintéticos.

La corrida del 2026-06-14 y sus capturas AHK quedan como evidencia histórica:
demostraron el flujo de producto y expusieron fragilidades de foco, F8,
PermissionError del wrapper, Session 0 y UIA. No validan el adapter OMP actual.
