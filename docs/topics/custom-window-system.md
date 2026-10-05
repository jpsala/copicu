---
title: Ventanas custom de Tauri y WebView2
summary: Reglas de registry, lifecycle Rust-owned, foco, orden visual, capabilities y bounds.
keywords:
  - custom windows
  - multiwindow
  - multiple windows
  - ventanas standalone
  - ventana metadata
  - ui-host
  - frameless
  - undecorated
  - always on top
  - z-order
  - focus
---

# Custom Window System

Fuentes: [superficies](ui-surface-architecture.md), [bounds](window-state-and-monitor-policy.md), [track](../tracks/009-ui-host-custom-surface.md), [archivo anterior](../reference/custom-window-system-archive-2026-06-25.md), [registry](../../src-tauri/src/surface_registry.rs), [window state](../../src-tauri/src/window_state.rs) y [UI de ventanas](../../src/ui/window/).

Router compacto para ventanas custom Tauri/WebView2. La version larga previa quedo archivada en `docs/reference/custom-window-system-archive-2026-06-25.md`.

## Regla Arquitectonica Actual

- El backend Rust es dueño de crear, nombrar, mostrar, ocultar y destruir ventanas.
- El frontend renderiza por `window.label` y rutas internas; no debe inventar superficies sin registry.
- Labels/capabilities deben ser explicitos por superficie.
- Window state se guarda/restaura via politica compartida; no duplicar heuristicas por ventana.
- La `X` emite una intención de cierre común; Rust aplica `SurfaceLifecycle`: `CachedHidden` guarda bounds y oculta, mientras `DestroyOnClose` destruye.
- En Windows, una superficie mostrada con `SW_SHOWNOACTIVATE` debe ocultarse también por la ruta nativa robusta; `Window::hide()` solo puede quedar desincronizado del HWND.
- La prioridad heredada se cambia con `SetWindowPos` sin activar, mostrar ni ocultar. El setter de estilos de Tao puede ocultar una superficie abierta sólo con `SW_SHOWNOACTIVATE` porque conserva una bandera de visibilidad diferente del HWND.
- WebView2 extra cuesta memoria; cachear solo si mejora UX/foco de forma clara.

## Superficies Relevantes

| Label / superficie | Uso | Lifecycle vigente |
| --- | --- | --- |
| `main` / picker | picker principal caliente | persistente/oculto |
| `settings` | configuracion | cache/hide para reapertura rapida |
| `metadata` | editor metadata standalone | prewarm + hide salvo coste extremo |
| `item-preview` | preview explícito del item activo | cache/hide, apertura sin activar |
| `ai-output` | salida markdown/reportes | cache/hide; revisar coste si crece |
| `assistant` | chat, herramientas y aprobaciones | lazy + cache/hide; conversación durable bajo perfil |
| `ui-host` | prompts/inputs de scripts | bajo demanda |
| `notifications` | toasts custom | posicionada por backend |
| `whichkey` | menu de hotkeys | temporal |

## Interacción Entre Ventanas

- Pasar el foco entre superficies interactivas de Copicu conserva el picker y su sesión. La pérdida de foco se evalúa después de 320 ms también al salir de Settings, metadata, Assistant, Output o un prompt; los toasts no mantienen abierta la sesión.
- Con el picker pinned y visible, las ventanas interactivas visibles comparten temporalmente su prioridad visual. La ventana activa queda arriba. Ocultar, minimizar o quitar el pin del picker elimina la prioridad heredada, sin cambiar los defaults propios de prompts/WhichKey.
- Settings y las ventanas de documento permanecen independientes: minimizar u ocultar el picker no las oculta. No asignar un owner nativo permanente para resolver solamente el orden visual.
- Cerrar una tarea activa devuelve foco a la superficie que la abrió sólo si sigue visible y sin minimizar. Abrir desde el tray no debe reaparecer el picker al cerrar. Cerrar una ventana de fondo no roba foco.
- Reinvocar una ventana visible la enfoca sin restaurar bounds ni moverla al monitor del cursor. La restauración por monitor sigue aplicando a ventanas ocultas.
- Preview abre sin activar y conserva su banda TOPMOST; un resultado Output que llega con otra aplicación activa solicita atención sin tomar foco ni restaurar una ventana minimizada.
- Crear una WebView desde un comando síncrono puede bloquear WebView2 en Windows. La primera apertura de Output entra por un comando `async`; las demás aperturas usan el despacho existente fuera del handler IPC.

Implementación: [coordinación](../../src-tauri/src/window_interaction.rs), [host](../../src-tauri/src/lib.rs) y [rutas nativas](../../src-tauri/src/window_focus.rs). Smoke reproducible con perfil sintético: `node tests/manual/validate-window-interaction.mjs --exe <binario-nuevo>`; verifica foco/visibilidad y z-order nativos, no sólo estado React.

Aceptación Windows 2026-10-03: 11 casos nativos pasaron con captura, startup, updater y AI deshabilitados, sin leer ni escribir el clipboard real. Incluyen entrada global desde un HWND externo, Settings transitorio/pinned, bounds de reapertura, retorno de foco, minimizar/restaurar, metadata, Assistant, preview y Output en segundo plano. El binario aislado se compiló con dependencias cacheadas y sin `shared-clipboard`; este smoke no certifica el build completo, paste nativo ni todos los monitores. `--paste` es opcional y exige clipboard inicialmente vacío.

## Variantes De Ventana

- `floatingPicker`: picker discreto, keyboard-first, no taskbar.
- `document`: superficies mas grandes como settings/output.
- `utility`: herramientas auxiliares con foco controlado.
- `prompt`: confirm/input breve.
- `toast`: no interactiva o interaccion minima.

Mantener variantes como politica, no como CSS suelto por componente.

El `CustomWindowFrame` compartido delimita la ventana con un borde interior de 1 px usando `--line-strong`; separa la superficie del fondo sin sumar sombras ni cambiar los bounds nativos.

En el picker, el engranaje izquierdo abre Settings fuera del área de arrastre. La X
derecha oculta el picker; `Quit Copicu` se ofrece sólo en el tray. Abrir Settings y
ocultar conservan los mismos comandos nativos y la política de foco vigente.

## Guardrails Tauri/WebView2

- Evitar `transparent`/shadow/custom chrome si introduce parpadeo o foco inestable.
- No mezclar drag regions con controles interactivos.
- Para focus/paste/native flows, validar con app real, no solo Playwright.
- No crear WebViews secundarias en idle salvo decision explicita.
- Cerrar/destruir vs hide/cache se decide por medicion UX/memoria, no por intuicion.

## Window State / Monitores

Abrir primero `docs/topics/window-state-and-monitor-policy.md` si se toca:

- persistencia de bounds;
- monitor desconectado;
- resize/min size;
- restore target;
- posicion de toasts/whichkey.

## UI Host

`ui-host` es la superficie auxiliar para scripts:

- request/response ID;
- confirm/input/select/control simple;
- placement controlado;
- sin exponer DOM interno a scripts.

Track: `docs/tracks/009-ui-host-custom-surface.md`.

## Estado Implementado / Aprendizajes

- Hay registry de surfaces en Rust.
- `SettingsWindowApp`, `MetadataWindowApp`, `WhichKeyWindowApp`, `NotificationsApp`, `AiOutputWindowApp` y `AssistantWindowApp` están separados del picker principal.
- Ventanas secundarias pueden agregar un proceso WebView2 y decenas de MB.
- Settings cacheada reduce reapertura pero mantiene memoria.
- AI Output tuvo hallazgos previos de reopen/lifecycle; revisar track de performance antes de cambiar.

## Validacion Recomendada

- `npm run build` para bundle/frontend.
- `cargo check --manifest-path src-tauri/Cargo.toml --tests` si se toca Rust.
- Visual focalizado/full segun superficie.
- Dogfood manual para foco, hotkeys, paste-to-previous-window, drag/resize y multi-monitor.
- Medicion de memoria si cambia hide/cache/destroy/prewarm.

## Proximo Paso

Si el pedido es arquitectura UI general, abrir `docs/topics/ui-surface-architecture.md`. Si es ventana concreta, abrir este topic + archivo Rust/TS correspondiente. Si hace falta rationale historico, consultar el archive largo.
