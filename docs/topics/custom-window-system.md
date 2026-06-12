---
id: custom-window-system
status: draft
kind: decision-map
triggers:
  - custom windows
  - multiwindow
  - multiple windows
  - ventanas standalone
  - ventana metadata
  - ui-host
  - frameless
  - undecorated
  - transparent window
  - titlebar custom
  - drag region
  - window chrome
  - window capabilities
  - capabilities por ventana
  - ventanas custom
primary_refs:
  - docs/topics/window-state-and-monitor-policy.md
  - docs/topics/ui-surface-architecture.md
  - docs/topics/ui-rethink.md
  - docs/topics/mantine-ui-system.md
  - docs/tracks/010-ui-rethink.md
  - src-tauri/tauri.conf.json
  - src-tauri/src/lib.rs
  - src-tauri/capabilities/default.json
  - src/main.tsx
  - src/styles.css
  - src/themeCatalog.ts
  - https://v2.tauri.app/learn/security/capabilities-for-windows-and-platforms/
  - https://v2.tauri.app/learn/window-customization/
  - https://v2.tauri.app/reference/javascript/api/namespacewindow/
  - https://docs.rs/tauri/latest/tauri/webview/struct.WebviewWindowBuilder.html
---

# Custom Window System

Registro canonico de research, decisiones y patrones para ventanas Tauri en Copicu.

Usar este topic antes de tocar:

- nuevas ventanas standalone;
- labels/routing/capabilities por ventana;
- `decorations`, `transparent`, `shadow`, `always_on_top`, `skipTaskbar`;
- `CustomWindowFrame`, titlebars, drag regions y controles de ventana;
- `ui-host`, prompts, toasts, settings, metadata, scripts y superficies fuera del picker.

## Fuente Y Autoridad

Clasificacion usada en este topic:

| Nivel | Significado | Uso |
| --- | --- | --- |
| Canonica | Documentacion oficial Tauri/docs.rs o Electron docs cuando se compara pattern de desktop webview. | Puede guiar decisiones base. |
| Mantenedor | Comentario de maintainer en GitHub Discussions/issues. | Fuerte senal practica, pero verificar version/contexto. |
| Issue | Bug report o reproduccion en GitHub. | Evidencia de riesgo o limite, no contrato API. |
| Local | Experiencia dogfood o comportamiento observado en Copicu. | Valido para este repo; no generalizar sin fuente externa. |

Regla de precedencia:

1. Para ventanas Tauri, las guias oficiales actuales de `v2.tauri.app` y docs.rs de la version Tauri usada por el proyecto ganan ante contradicciones.
2. En particular, `Capabilities for Different Windows and Platforms` y `Window Customization` son canonicas para labels/capabilities/chrome custom. Si un issue, blog, video, StackOverflow o recuerdo local contradice esas guias, usar las guias oficiales y anotar el conflicto.
3. Antes de fijar una decision durable, verificar que la fuente sea de Tauri v2 actual. Al 2026-06-12, la pagina oficial de releases lista `tauri v2.11.2`, que coincide con `src-tauri/Cargo.toml`.
4. Issues de GitHub sirven para riesgos y workarounds, pero no reemplazan la documentacion oficial salvo que un maintainer indique explicitamente el cambio y la doc este desactualizada.

### Fuentes Canonicas Activas

| Fuente | Autoridad | Aprendizaje |
| --- | --- | --- |
| Tauri Capabilities for Different Windows and Platforms: https://v2.tauri.app/learn/security/capabilities-for-windows-and-platforms/ | Canonica | Tauri espera labels de ventana y capabilities por ventana/plataforma. Los permisos se aplican con `windows: ["label"]` y pueden separarse por categoria. |
| Tauri Capabilities Overview: https://v2.tauri.app/security/capabilities/ | Canonica | Capabilities son boundaries de permisos por ventana/webview; si una ventana participa en mas de una capability, sus permisos se fusionan. Los comandos propios registrados en `invoke_handler` quedan permitidos por defecto salvo que se acoten con manifest/guards. |
| Tauri Capability Reference: https://v2.tauri.app/reference/acl/capability/ | Canonica | Una capability agrupa permisos para aislar acceso IPC; usar labels exactos o globs para reducir impacto de vulnerabilidades frontend. |
| Tauri Window Customization: https://v2.tauri.app/learn/window-customization/ | Canonica | `decorations: false` + custom titlebar es pattern soportado, pero requiere permisos `core:window:*`; `data-tauri-drag-region` aplica solo al elemento marcado. |
| Tauri Window API: https://v2.tauri.app/reference/javascript/api/namespacewindow/ | Canonica | Las ventanas se identifican por label; `close()` emite close-request y `destroy()` fuerza cierre; `hide()` no destruye la ventana. |
| Tauri `WebviewWindowBuilder`: https://docs.rs/tauri/latest/tauri/webview/struct.WebviewWindowBuilder.html | Canonica | Crear ventanas desde comandos/event handlers en Windows puede deadlockear; usar comandos async o threads separados. Labels deben ser unicos. |
| Tauri Window State Plugin: https://v2.tauri.app/plugin/window-state/ | Canonica | Existe plugin oficial para guardar/restaurar estado de ventanas; Copicu mantiene capa propia por necesitar politica por superficie/monitor, pero debe seguir el principio de crear oculto y restaurar antes de mostrar. |
| Electron BrowserWindow: https://electronjs.org/docs/latest/api/browser-window | Canonica comparativa | Electron resuelve prompts/child tools con ventanas hijas/modal reales (`parent`, `modal`) y `ready-to-show`, no con un host transparente que dibuja una pseudo-ventana. |
| Electron Custom Window Styles: https://electronjs.org/docs/latest/tutorial/custom-window-styles | Canonica comparativa | Las ventanas transparentes tienen limites por plataforma; no usarlas como base de formularios/herramientas salvo necesidad real. |

### Fuentes De Mantenedores / GitHub

| Fuente | Autoridad | Aprendizaje |
| --- | --- | --- |
| Tauri Discussion #11643: https://github.com/orgs/tauri-apps/discussions/11643 | Mantenedor | Para React, un maintainer prefiere multiwindow con un solo `index.html` y routing por ventana salvo apps muy grandes. Los contextos siguen separados por WebView. |
| Tauri Discussion #6569: https://github.com/orgs/tauri-apps/discussions/6569 | Mantenedor | Tauri tiene APIs owner/parent en Rust, pero no un `ShowDialog` bloqueante consistente en todas las plataformas. |
| Tauri Discussion #9423: https://github.com/orgs/tauri-apps/discussions/9423 | Comunidad | Pregunta recurrente: config/settings como ventana separada con entrypoint propio o routing compartido. No hay una unica receta oficial. |
| Tauri Discussion #9303: https://github.com/orgs/tauri-apps/discussions/9303 | Comunidad | Riesgo practico: emitir a una ventana nueva antes de que el listener frontend este listo puede perder el primer mensaje. Usar pending state, handshake o evento diferido. |

### Issues Relevantes

| Fuente | Autoridad | Aprendizaje |
| --- | --- | --- |
| Tauri #4881: https://github.com/tauri-apps/tauri/issues/4881 | Issue | `transparent: true` en Windows puede dejar fondo blanco hasta resize; marcado como upstream. |
| Tauri #8308: https://github.com/tauri-apps/tauri/issues/8308 | Issue | Diferencias de comportamiento de ventanas transparentes entre Tauri v1/v2 en Windows. |
| Tauri #14859: https://github.com/tauri-apps/tauri/issues/14859 | Issue | `decorations: false` + `shadow: false` + `transparent: true` puede mostrar titlebar/borde en Windows. |
| Tauri #9286: https://github.com/tauri-apps/tauri/issues/9286 | Issue | Ventanas hijas creadas cuando `main` arranca hidden tuvieron problemas de show/hide; cuidar lifecycle de secondary windows. |

## Regla Arquitectonica Actual

Las funcionalidades durables fuera del picker deben ser ventanas de producto de primera clase, no pseudo-modales dentro de un host transparente.

Decision vigente 2026-06-12:

- Las superficies ricas (`metadata`, `scripts`, `history-manager`, inspectors/editors grandes) se crean como ventanas Tauri standalone con label/capability/lifecycle propios.
- El frontend default sigue siendo un solo `index.html` React/Vite con routing por `getCurrentWindow().label` o `?window=<label>` para dev/visual tests. Multiples HTML entrypoints quedan diferidos hasta que una superficie sea suficientemente grande para justificar build/config separado.
- Rust es duenio de lifecycle, show/focus/hide/destroy, bounds, monitor policy, pending payloads y autorizacion backend.
- Las capabilities de Tauri reducen permisos frontend/plugin, pero no reemplazan guards en comandos propios. Todo comando sensible debe validar `window.label()` o quedar acotado por manifest de comandos.
- `ui-host` queda solo para request/response chico: alert, confirm, input simple y prompts temporales. No debe alojar metadata/scripts ni herramientas ricas.

Pattern preferido para Copicu:

1. Label estable por superficie (`settings`, futuro `metadata`, `scripts`, `history-manager`).
2. Window creation/reuse en Rust siguiendo el pattern de `settings`.
3. Frontend route por window label o query `?window=<label>` para visual checks.
4. `CustomWindowFrame` como contenido raiz si la ventana usa chrome propio.
5. Fondo opaco en Windows salvo necesidad probada de transparencia.
6. Capability por ventana y por categoria, no un `default.json` cada vez mas amplio.
7. Comandos Tauri sensibles validan tambien `window.label()` cuando corresponda, porque las capabilities controlan permisos frontend/plugin pero el backend propio sigue siendo responsable de sus comandos.
8. Registry declarativo para evitar defaults dispersos en `lib.rs`, frontend y capabilities.

Contra-pattern observado:

- `ui-host` como ventana transparente generica que renderiza un panel/modal interno para flujos ricos.
- Resultado local: sensacion de "ventana dentro de ventana" y posibilidad de dejar un host vacio visible si el contenido se limpia antes de ocultar/destruir la ventana.
- Mantener `ui-host` solo para prompts chicos/temporales o migrarlo gradualmente a ventanas dedicadas.

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

### Surface Registry Host-Owned

Antes de crear `metadata` o `scripts`, introducir un registry chico de superficies. Objetivo: que label, route, lifecycle, chrome, bounds y permisos no queden duplicados entre Rust, React, capabilities y docs.

Contrato conceptual:

```text
Surface {
  label: "metadata" | "scripts" | ...
  route: "index.html?window=metadata"
  kind: "picker" | "document" | "utility" | "prompt" | "toast"
  chromeVariant: "floatingPicker" | "document" | "utility" | "prompt" | "toast"
  lifecycle: "cached" | "destroy-on-close" | "request-response"
  boundsPolicy: "cursor-monitor" | "last-monitor" | "fixed-position" | "none"
  capability: "surface-metadata"
  allowedCommands: ["get_history_item", "update_history_item", ...]
  readiness: "pending-state" | "event-after-ready" | "static"
}
```

Reglas del registry:

- Rust es la fuente de verdad para crear/reusar/cerrar ventanas y para aplicar defaults nativos.
- React solo decide que app renderizar segun label/route; no debe inventar ventanas durables por su cuenta.
- Cada superficie nueva agrega:
  - label estable;
  - entry en registry Rust;
  - branch de routing frontend;
  - capability propia o de categoria;
  - guards backend por `window.label()` en comandos sensibles;
  - politica de readiness/pending payload si recibe data al abrir;
  - policy explicita de bounds/monitor;
  - visual check con `?window=<label>`.
- Si una superficie crece lo suficiente para necesitar bundle separado, recien entonces evaluar HTML entrypoint propio y configurar Vite/Tauri para incluirlo en `dist`.

Matriz inicial recomendada:

| Surface | Kind | Route | Lifecycle | Bounds | Capability | Nota |
| --- | --- | --- | --- | --- | --- | --- |
| `main` | picker | `index.html` | cached/hidden | cursor-monitor | `surface-main` | Quick picker; no app shell pesada. |
| `settings` | document | `index.html?window=settings` | cached o destroy-on-close, decidir | last-monitor | `surface-settings` | Hoy cachea con `hide()` aunque docs digan close real; normalizar. |
| `ai-output` | document | `index.html?window=ai-output` | cached | last-monitor | `surface-ai-output` | Usa pending payload para no perder primer emit. |
| `metadata` | utility o document | `index.html?window=metadata` | cached si se reabre mucho | last-monitor | `surface-metadata` | Primer candidato para sacar editor rico del picker. |
| `scripts` | document | `index.html?window=scripts` | cached | last-monitor | `surface-scripts` | Workbench de scripts/diagnostics; no `ui-host`. |
| `ui-host` | prompt | `index.html?window=ui-host` | request-response | none/fixed | `surface-ui-host` | Solo alert/confirm/input chico; evitar transparencia si causa bugs. |
| `notifications` | toast | `index.html?window=notifications` | cached/hidden | fixed-position | `surface-notifications` | Toast stack posicionado por Rust. |
| `whichkey` | utility | `index.html?window=whichkey` | destroy-on-close | none/fixed | `surface-whichkey` | Temporal; mantener opt-out de bounds por ahora. |

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
- El registry puede vivir al principio en `src-tauri/src/windows.rs` o extender `window_state.rs`; si crece, separar `surface_registry.rs`.

Capabilities:

- No seguir ampliando un unico `default.json` para todas las ventanas.
- Crear capabilities por superficie o categoria:
  - `surface-main.json`;
  - `surface-settings.json`;
  - `surface-ai-output.json`;
  - `surface-ui-host.json`;
  - `surface-notifications.json`;
  - `surface-whichkey.json`;
  - futuras `surface-metadata.json` y `surface-scripts.json`.
- Agregar permisos solo si se usan desde frontend:
  - `core:window:allow-start-dragging`;
  - `core:window:allow-start-resize-dragging` solo si implementamos resize handles;
  - permisos de minimize/maximize/close si los botones los llaman desde JS.
- Preferir comandos Rust existentes para flujos semanticos (`hide_picker`, `open_settings_window`, `close_settings_window`) cuando haya logica de app.
- Para comandos propios sensibles, agregar guard:
  - Settings-only: `update_settings`, tag configs, edit scripts path.
  - Main/metadata-only: `update_history_item`, `delete_history_item`, `set_item_tags`, `activate_item`.
  - AI-output-only: `copy_markdown_output`, `add_markdown_output_to_history`, `export_markdown_output` si quedan exclusivos de esa ventana.
  - WhichKey-only: hotkey pending/clear/step.
  - Ui-host-only: `resolve_ui_host_request`, `pending_ui_host_request`.

Readiness/payload:

- No emitir data critica inmediatamente despues de crear una WebView nueva sin handshake o pending state.
- Usar uno de estos patterns:
  1. Estado pending en Rust + comando `pending_<surface>()` al montar.
  2. Evento `surface-ready` desde frontend antes de emitir payload.
  3. Delay corto solo como workaround temporal, documentado y con diagnostics.
- `ai-output` ya usa el pattern pending payload. `ui-host` usa request activo + `pending_ui_host_request`.

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
- El picker no inicia pinned: por defecto debe ocultarse cuando pierde foco. `show_main_window` no debe repinear la ventana implicitamente.
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

Tercer corte aplicado el 2026-06-09:

- agregado `src-tauri/src/window_state.rs` como registry compartido para comportamiento nativo de ventanas;
- `main`, `settings` y `ai-output` quedan `resizable: true`, guardan/restauran posicion y tamano, y mantienen bounds separados por monitor;
- `ui-host`, `notifications` y `whichkey` quedan opt-out: no resize y no persistencia de bounds porque son superficies fijas/posicionadas;
- `main` restaura contra el monitor del cursor al abrir, para que el picker use la ultima geometria de cada monitor;
- `settings` y `ai-output` restauran contra monitor actual/primario disponible;
- si el monitor guardado ya no existe, los bounds se ajustan al `workArea` de un monitor disponible, sin borrar el registro de otros monitores;
- `tauri.conf.json` vuelve a `resizable: true` para `main`;
- `settings` se crea con `.resizable(true)`;
- `CustomWindowFrame` agrega handles compartidos de resize por borde/esquina usando `startResizeDragging(direction)`;
- agregado permiso `core:window:allow-start-resize-dragging`.

La politica completa quedo documentada en `docs/topics/window-state-and-monitor-policy.md`.

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
- `settings` debe ser `cached` con `hide()` o close real con `destroy()`?
- El primer surface nuevo debe ser `metadata` o `scripts`?
- Guardaremos command allowlist via guards manuales por label o via `AppManifest::commands` cuando sea viable?

## Proximo Paso

Primer corte de surface registry aplicado el 2026-06-12 antes de crear nuevas ventanas ricas.

Estado:

1. Registry Rust creado en `src-tauri/src/surface_registry.rs` para `main`, `settings`, `ai-output`, `ui-host`, `notifications` y `whichkey`.
2. `window_state.rs` consume el registry para bounds/resizable/default size.
3. Builders Rust de ventanas actuales consumen el registry para route/chrome nativo/tamano/lifecycle base.
4. `settings` queda normalizada como `cached/hidden`; no cambiar a `destroy-on-close` sin prueba visual/foco.
5. `src-tauri/capabilities/default.json` fue reemplazado por capabilities por superficie.
6. Comandos sensibles tienen guards backend por `window.label()`.
7. Primer surface nuevo aplicado: `metadata` usa registry, capability `surface-metadata`, pending payload Rust y ventana standalone para editar metadata de un item.

Siguiente orden recomendado:

1. Dogfood nativo de `metadata`: abrir desde item menu, `Shift+F2` y script `Assign metadata`, guardar metadata sintetica, validar cierre/foco/bounds.
2. Decidir si migrar batch metadata a ventana standalone o si empezar `scripts`.
3. Para la proxima surface, agregarla al registry con label/capability/lifecycle/bounds/readiness explicitos.
4. Crear branch de routing frontend y capability JSON propia.
5. Agregar guards backend desde el primer commit.
6. Revalidar: `npm run build`, `npm run visual:check`, `cargo check`.
