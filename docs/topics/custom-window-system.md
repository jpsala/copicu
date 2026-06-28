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
primary_refs:
  - docs/topics/ui-surface-architecture.md
  - docs/topics/window-state-and-monitor-policy.md
  - docs/tracks/009-ui-host-custom-surface.md
  - docs/tracks/010-ui-rethink.md
  - docs/reference/custom-window-system-archive-2026-06-25.md
  - src-tauri/src/surface_registry.rs
  - src-tauri/src/window_state.rs
  - src/ui/window/
---

# Custom Window System

Router compacto para ventanas custom Tauri/WebView2. La version larga previa quedo archivada en `docs/reference/custom-window-system-archive-2026-06-25.md`.

## Regla Arquitectonica Actual

- El backend Rust es dueño de crear, nombrar, mostrar, ocultar y destruir ventanas.
- El frontend renderiza por `window.label` y rutas internas; no debe inventar superficies sin registry.
- Labels/capabilities deben ser explicitos por superficie.
- Window state se guarda/restaura via politica compartida; no duplicar heuristicas por ventana.
- WebView2 extra cuesta memoria; cachear solo si mejora UX/foco de forma clara.

## Superficies Relevantes

| Label / superficie | Uso | Lifecycle vigente |
| --- | --- | --- |
| `main` / picker | picker principal caliente | persistente/oculto |
| `settings` | configuracion | cache/hide para reapertura rapida |
| `metadata` | editor metadata standalone | prewarm + hide salvo coste extremo |
| `ai-output` | salida markdown/reportes | bajo demanda; revisar reopen/lifecycle si falla |
| `ui-host` | prompts/inputs de scripts | bajo demanda |
| `notifications` | toasts custom | posicionada por backend |
| `whichkey` | menu de hotkeys | temporal |

## Variantes De Ventana

- `floatingPicker`: picker discreto, keyboard-first, no taskbar.
- `document`: superficies mas grandes como settings/output.
- `utility`: herramientas auxiliares con foco controlado.
- `prompt`: confirm/input breve.
- `toast`: no interactiva o interaccion minima.

Mantener variantes como politica, no como CSS suelto por componente.

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
- `SettingsWindowApp`, `MetadataWindowApp`, `WhichKeyWindowApp`, `NotificationsApp`, `AiOutputWindowApp` estan separados del picker principal.
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
