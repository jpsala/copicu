---
id: custom-window-system
status: draft
kind: decision-map
triggers:
  - custom windows
  - frameless
  - undecorated
  - transparent window
  - titlebar custom
  - drag region
  - window chrome
  - ventanas custom
primary_refs:
  - docs/topics/ui-surface-architecture.md
  - docs/topics/ui-rethink.md
  - docs/topics/mantine-ui-system.md
  - docs/active-work/010-ui-rethink.md
  - src-tauri/tauri.conf.json
  - src-tauri/src/lib.rs
  - src-tauri/capabilities/default.json
  - src/main.tsx
  - src/styles.css
  - src/themeCatalog.ts
---

# Custom Window System

Plan y research para usar ventanas custom en Copicu sin repetir problemas conocidos de WebView2/Electrobun.

## Contexto

La ventana principal quedo `decorations: false` y `transparent: true` durante el primer corte de UI rethink. La intencion era que el picker rapido se sintiera como superficie flotante compacta, no como una ventana nativa conteniendo otra ventana visual.

Problema actual: quitamos la barra nativa, pero no agregamos un reemplazo completo para mover/cerrar. No hay `data-tauri-drag-region`, `startDragging` ni controles custom de ventana en `main`.

JP ya tuvo problemas en otra app con ventanas custom sobre WebView2/Electrobun:

- `transparent` podia dejar pasar el cursor/clicks hacia la ventana de atras;
- redimensionar fue fragil;
- la solucion final fue volver a ventanas nativas.

La direccion para Copicu no debe ignorar esos aprendizajes.

## Research Resumido

Fuentes consultadas el 2026-06-06:

- Tauri Window Customization: `decorations: false`, custom titlebar, botones propios y `data-tauri-drag-region`/`startDragging`.
  - https://v2.tauri.app/learn/window-customization/
- Tauri Core Permissions: `core:window:allow-start-dragging` y `core:window:allow-start-resize-dragging` son permisos explicitos.
  - https://v2.tauri.app/reference/acl/core-permissions/
- Tauri Window API: `decorations`, `transparent`, `windowEffects`, `startDragging`, `startResizeDragging`, `setDecorations`, `setResizable`.
  - https://v2.tauri.app/reference/javascript/api/namespacewindow/
- Tauri release beta.22: se revirtio `app-region: drag` en Windows porque tenia problemas con click derecho y botones dentro de la titlebar.
  - https://tauri.app/release/tauri/v2.0.0-beta.22/
- GitHub issue `tauri-apps/tauri#11945`: doble click en `data-tauri-drag-region` con `decorations: false` podia desmaximizar sin restaurar size/position correctamente.
  - https://github.com/tauri-apps/tauri/issues/11945
- GitHub issue `tauri-apps/tauri#13070`: click-through de areas transparentes aparece como feature request, no como comportamiento simple garantizado.
  - https://github.com/tauri-apps/tauri/issues/13070
- Tauri discussion `#8387`: titlebar transparente en Windows tiene limitaciones; drag region custom obligatorio y diferencias por OS/version.
  - https://github.com/orgs/tauri-apps/discussions/8387

## Lectura Tecnica

Tauri soporta ventanas custom. No son imposibles ni experimentales en abstracto.

Pero `decorations: false` + `transparent: true` + resize/maximize/snap/paridad nativa completa sigue siendo una zona con bordes filosos, especialmente en Windows/WebView2.

La forma segura no es "hacer todo custom". Es usar custom windows con alcance controlado:

- evitar transparencia real como default;
- evitar reimplementar paridad nativa;
- evitar resize handles CSS salvo que sea estrictamente necesario;
- mantener ventanas largas/task-oriented nativas hasta que haya evidencia de que el frame custom esta maduro.

## Decision Propuesta

Adoptar un sistema compartido de custom window chrome, pero por fases y con variantes.

No usar herencia literal de ventanas. Usar composicion:

- Rust/Tauri define la ventana fisica y sus restricciones;
- React define el frame visual compartido;
- theme catalog define tokens;
- cada superficie elige variante y capacidades.

Ejemplo conceptual:

```tsx
<CustomWindowFrame
  variant="floatingPicker"
  title="Copicu"
  draggable
  controls={["hide", "settings"]}
>
  <Picker />
</CustomWindowFrame>
```

Otra variante:

```tsx
<CustomWindowFrame
  variant="document"
  title="Settings"
  draggable
  controls={["minimize", "close"]}
>
  <Settings />
</CustomWindowFrame>
```

## Que Se Puede Compartir

Compartible en React/CSS/theme:

- titlebar/drag strip;
- botones de ventana (`hide`, `close`, `minimize`, `maximize`, settings);
- iconos, tooltips, estados hover/focus/disabled;
- borde, radio, sombra, fondo, accent;
- padding y layout base;
- variantes visuales por tipo de superficie;
- shortcuts o handlers comunes si no rompen el flujo local.

Compartible en Rust si se crea un registry:

- defaults de size/min size;
- `decorations`, `transparent`, `resizable`, `skipTaskbar`, `alwaysOnTop`, `shadow`;
- creacion/reuse/focus de ventanas por label;
- permisos/capabilities esperadas por tipo de ventana;
- posicionamiento inicial o por monitor.

No compartible automaticamente:

- decisiones nativas por ventana;
- permisos Tauri por label;
- comportamiento de focus/hide propio de cada superficie;
- reglas de paste/focus previous del picker;
- posicionamiento especial de notifications/ui-host.

## Variantes Iniciales

### `floatingPicker`

Uso: `main`.

Regla:

- custom si pasa validacion;
- preferir `decorations: false`;
- preferir `transparent: false` para evitar hit-testing raro;
- `alwaysOnTop: true`;
- `skipTaskbar: true`;
- boton principal: hide, no close real;
- drag strip explicito chico;
- no maximizar;
- no system menu custom;
- no resize handles CSS en primer corte.

### `document`

Uso: `settings`, futuro history manager.

Regla vigente para Settings:

- custom solido con variante React `document`;
- `decorations: false`;
- `transparent: false`;
- `shadow: false` en Windows para evitar el borde blanco observado en undecorated;
- `skipTaskbar: false`;
- close real de la ventana, no hide;
- resize nativo puede quedar limitado por plataforma con ventanas undecorated; no agregar resize handles CSS sin otro corte.

### `utility`

Uso: futuro inspector/editor standalone.

Regla:

- puede ser custom solido;
- drag strip compartido;
- close/minimize segun flujo;
- resize nativo si `decorations: false` lo conserva de forma confiable; si no, mantener nativa.

### `prompt`

Uso: `ui-host`.

Regla:

- custom permitido;
- fixed size;
- no resize;
- always-on-top;
- skip taskbar;
- transparente solo si no genera hit-test raro; preferir fondo solido si hay dudas.

### `toast`

Uso: `notifications`.

Regla:

- custom permitido;
- fixed size/dynamic height controlado desde Tauri;
- no input complejo;
- no resize;
- multi-monitor/position desde Rust.

## Limites Que No Hay Que Cruzar Todavia

- No usar `transparent: true` en `main` como default de dogfood.
- No confiar en areas visualmente transparentes para click-through correcto.
- No reimplementar resize handles en CSS en el primer corte.
- No implementar maximize/snap/paridad nativa para el picker.
- No mezclar drag region con botones o inputs.
- No poner `data-tauri-drag-region` en un contenedor con controles interactivos.
- Settings ya migro a frameless solido; no agregar transparencia ni resize handles hasta validar en uso real.
- No cambiar `ShowWindow`/Win32 directo para mostrar/ocultar main; ya se documento que desincroniza Tauri.

## Ventanas Secundarias WebView2: Aprendizajes 2026-06-08

Incidente origen: primer slice de WhichKey como ventana Tauri secundaria label `whichkey`.

Diferencias contra `main`:

- `main` se crea desde `tauri.conf.json` y suele estar cargada antes de mostrarse.
- Una ventana secundaria creada por `WebviewWindowBuilder` durante un hotkey puede aparecer antes de que WebView2 navegue/pinte.
- Reusar una WebView secundaria stale puede dejar `about:blank` o una superficie sin contenido.
- Precrear una ventana oculta no garantiza composicion correcta: puede arrancar sin contexto/pending y quedar visualmente negra/blanca aunque el renderer exista.

Sintomas observados:

- `list_apps` muestra `Copicu WhichKey` con size/posicion correcta.
- Screenshot de Windows Graphics Capture muestra blanco o negro.
- Logs muestran `renderer: module-load label=whichkey` y heartbeats.
- Logs pueden mostrar `whichkey-sync pending=Ctrl+Alt+C entries=2`, probando que IPC/state funciona.
- CDP `127.0.0.1:9222` puede exponer solo la pagina principal aunque exista un renderer secundario segun logs.

Lecciones practicas:

- No diagnosticar ventanas secundarias solo por screenshot o solo por CDP. Usar ambos mas logs de renderer/backend.
- Posicionar antes de `show()` evita el salto visible, pero no resuelve composicion WebView2.
- Definir fondo/tokens propios para utility windows reduce flash blanco si theme global aun no esta aplicado.
- Evitar `set_size()` extra antes del primer `show()` salvo que se demuestre necesario; preferir `inner_size()` del builder.
- Evitar `always_on_top(true)` en builder si hay problemas de composicion; probar setearlo despues de `show()`.
- Si el contenido depende de estado runtime, instrumentar el renderer con diagnosticos de sync (`pending=... entries=...`) para separar "no hay data" de "no pinta".
- Un refresh global de actions/registry durante `module-load` no debe limpiar estado transitorio de otra superficie; limpiar pending solo por timeout, Escape, close explicito o mismatch real.
- Para utilities pequeñas, probar surface minima antes de envolver con `CustomWindowFrame`; el chrome compartido puede esconder si el problema es layout/tokens o WebView.

Checklist de una ventana secundaria nueva:

1. Crear con label estable y URL clara.
2. Usar `visible(false)` y `focused(false)` en builder.
3. Fijar `inner_size` en builder.
4. Fijar posicion antes de `show()`.
5. `show()`, luego topmost/focus si aplica.
6. Agregar logs `module-load label=<label>` y un heartbeat o ping de renderer.
7. Agregar un diagnostico de data/render especifico de la superficie.
8. Validar con:
   - `list_apps`/titulo;
   - screenshot;
   - logs backend;
   - logs renderer;
   - CDP si expone la page;
   - accion interactiva minima.

Si la ventana queda negra/blanca pero los logs prueban data viva, clasificar como problema de composicion/render de WebView secundaria antes de tocar el runtime de producto.

## Arquitectura Propuesta

Frontend:

- `src/ui/window/CustomWindowFrame.tsx`
- `src/ui/window/windowChrome.ts`
- `src/ui/window/windowVariants.ts`
- `src/ui/window/WindowControls.tsx`
- `src/ui/window/useWindowControls.ts`

Responsabilidades:

- `CustomWindowFrame`: composicion visual;
- `WindowDragStrip`: llama `getCurrentWindow().startDragging()` o usa `data-tauri-drag-region` si alcanza;
- `WindowControls`: botones compartidos, configurables por lista de controles (`pin`, `minimize`, `maximize`, `hide`, `close`);
- `windowChrome.ts`: primitivas comunes de ventana Tauri (`startDragging`, `setAlwaysOnTop`, `minimize`, `toggleMaximize`, `close`);
- `windowVariants.ts`: defaults por variante (`floatingPicker`, `document`, `utility`, `prompt`, `toast`);
- estilos con tokens existentes de `themeCatalog.ts`.

Regla de abstraccion:

- Lo compartido vive en los controles y primitivas: iconos, tooltips, foco, hover, prevent-drag, acciones Tauri simples.
- Lo especifico de producto vive en la superficie o backend que la usa.
- Ejemplo: el control `pin` comun solo alterna `always-on-top`; la regla especial de `main` que suspende `hide-on-focus-lost` mientras esta pinned vive en la politica Rust del picker, no en `WindowControls`.

Backend:

- Crear `src-tauri/src/windows.rs` si el corte crece.
- Centralizar creacion de ventanas que hoy vive dispersa en `lib.rs`.
- Mantener labels estables: `main`, `settings`, `ui-host`, `notifications`.
- Opcional: `WindowKind` Rust para defaults por tipo.

Capabilities:

- Agregar solo si se usa desde frontend:
  - `core:window:allow-start-dragging`;
  - `core:window:allow-start-resize-dragging` solo si implementamos resize handles;
  - permisos de minimize/maximize/close si los botones los llaman desde JS.
- Preferir comandos Rust existentes para flujos semanticos (`hide_picker`, `open_settings_window`, `close_settings_window`) cuando haya logica de app.

## Primer Corte Implementable

Objetivo: hacer usable el picker custom sin abrir la caja de problemas de transparencia/resize.

Pasos:

1. Crear `CustomWindowFrame` y `WindowDragStrip`.
2. Aplicarlo solo al `main` picker.
3. Cambiar `main` a custom solido:
   - evaluar cambiar `transparent` a `false`;
   - mantener `decorations: false`;
   - mantener `resizable: true` solo si Windows conserva resize por borde; si no funciona, decidir native o resize handles en otro corte.
4. Agregar permisos:
   - `core:window:allow-start-dragging`.
5. Agregar boton `hide` en chrome custom.
6. Settings puede adoptar la variante `document` si el usuario decide avanzar explicitamente.
7. Mantener `ui-host` y `notifications` como estan salvo ajustes de tokens.

## Estado Del Primer Corte

Implementado parcialmente el 2026-06-06:

- agregado `src/ui/window/CustomWindowFrame.tsx` con `CustomWindowFrame` y `WindowDragStrip`;
- aplicado solo al `main` picker;
- agregado chrome compacto con pin/always-on-top, minimizar, maximizar/restaurar y cerrar-como-hide;
- el boton de cerrar usa el comando Rust existente `hide_picker`, no cierra el proceso;
- agregado permiso `core:window:allow-start-dragging`;
- agregados permisos de ventana para los controles custom (`set-always-on-top`, `minimize`, `toggle-maximize`);
- `main` cambio a `transparent: false`;
- `main` quedo `decorations: false`;
- `main` quedo `shadow: false`;
- Settings migro despues a chrome custom solido con variante `document`;
- no se agregaron resize handles CSS ni paridad nativa.

Hallazgo/regresion corregida:

- `shadow: true` en una ventana Windows undecorated produce un borde blanco de 1px segun los tipos locales de `@tauri-apps/api/window` y se vio en dogfood real;
- no usar borde/radio/sombra CSS de tarjeta flotante dentro de `main` mientras `transparent: false`, porque la WebView fisica sigue siendo rectangular y solida;
- el picker custom debe ocupar flush toda la ventana solida, o se debe reabrir explicitamente el riesgo de `transparent: true`.

Semantica especial de pin:

- En `main`, pin significa `always-on-top`.
- Mientras pin esta activo, `hide-on-focus-lost` no debe ocultar la ventana aunque el setting global este activo.
- El picker inicia pinned para mantener el comportamiento previo, pero `show_main_window` no debe repinear si el usuario lo desactivo durante la sesion.
- Esta semantica no debe contaminar el componente base: otras ventanas pueden usar `pin` solo como always-on-top sin adoptar la regla de focus-lost.

Validacion automatica realizada:

- `npm run build`: paso;
- `npm run visual:check`: paso 54/54;
- `cargo check` con `CARGO_TARGET_DIR=target-codex-check`: paso.

Segundo corte aplicado el 2026-06-06:

- `settings` usa `decorations: false`, `transparent: false`, `shadow: false`;
- `SettingsWindowApp` se renderiza dentro de `CustomWindowFrame` variante `document`;
- controles de ventana compartidos: minimizar, maximizar/restaurar y cerrar real;
- el layout de Settings se ajusto para scrollear dentro del frame custom sin que el contenido tape la barra de acciones;
- checks pasaron: `npm run build`, `npm run visual:check` 54/54 y `cargo check` con `CARGO_TARGET_DIR=target-codex-check`.

Validacion manual parcial antes de pausar:

- una instancia dev viva cargo el frontend nuevo con `.custom-window-frame` y boton hide;
- mover desde drag strip con mouse Win32 movio la ventana visible de `main`;
- resize por borde en Windows no cambio el tamano con `decorations: false`; por eso `resizable` se bajo a `false` en `tauri.conf.json` para no prometer resize nativo en este corte.

Validacion manual pendiente, a hacer con JP guiando la sesion:

- hide real del boton vs estado Tauri;
- `Escape` hide;
- focus-lost hide diferido;
- shortcut `Ctrl+Shift+,` desde ventana oculta;
- tray show/hide;
- paste-to-previous-window;
- DPI/monitor secundario.

Nota: no seguir ampliando harnesses de paste o pruebas Win32 ad hoc para este corte sin coordinar con JP. La proxima sesion debe probar native windows manualmente con asistencia directa.

## Checklist De Validacion Manual

Usar datos sinteticos. Con `npm run tauri:dev` vivo:

- picker abre con `Ctrl+Shift+,`;
- se puede mover desde drag strip;
- drag no se dispara al usar search, botones, menus ni items;
- `Escape` sigue ocultando;
- boton hide oculta;
- close nativo no aparece en main;
- tray show/hide sigue funcionando;
- focus-lost hide diferido no se dispara durante mover/redimensionar;
- resize por bordes funciona o se documenta explicitamente que no;
- desktop 100% DPI;
- desktop 150% DPI si se puede;
- monitor secundario si se puede;
- siempre-on-top no queda pegado sobre fullscreen de forma inaceptable;
- paste-to-previous-window sigue recordando foco anterior;
- visual checks desktop/narrow pasan.

Checks:

```powershell
npm run build
npm run visual:check
cd src-tauri
$env:CARGO_TARGET_DIR='target-codex-check'; cargo check
```

Si se toca `npm run rust:test`, recordar que puede compilar y fallar al arrancar por `STATUS_ENTRYPOINT_NOT_FOUND` conocido.

## Criterios De Exito

Custom picker es aceptable si:

- mover/cerrar/ocultar funciona de forma obvia;
- no hay click-through accidental;
- no se rompe search ni menus;
- no empeora paste-to-previous-window;
- resize queda funcionando o se decide no soportarlo en el picker;
- Settings conserva comportamiento de task window: aparece en taskbar y cierra real, pero con chrome custom.

Si falla cualquiera de esos puntos, rollback tactico:

- `main` vuelve a `decorations: true`;
- se mantiene el frame visual compartido para ventanas auxiliares futuras;
- no se borra el topic ni el aprendizaje.

## Preguntas Abiertas

- El picker debe ser resizable por el usuario o basta size fija/recordada?
- Queremos boton de minimize en `main`, o solo hide?
- Settings `document` custom debe mantener resize confiable o aceptar el limite de undecorated?
- El editor grande debe ser `utility` custom o `document` nativo?
- Conviene guardar preferencia `windowChromeMode: native | custom` para dogfood A/B?

## Proximo Paso

En la siguiente sesion, implementar solo el primer corte del picker custom:

1. `CustomWindowFrame` compartido.
2. `WindowDragStrip` con permiso `allow-start-dragging`.
3. `main` solido frameless, sin transparencia real si no es imprescindible.
4. Validacion manual de mover/hide/focus/resize.
5. Actualizar este topic con resultados.
