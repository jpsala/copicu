---
id: window-state-and-monitor-policy
status: active
kind: decision-map
triggers:
  - window state
  - remember window position
  - multi monitor
  - monitor disconnected
  - resize windows
  - persist bounds
  - posicion ventana
  - tamano ventana
  - multiples monitores
primary_refs:
  - docs/topics/custom-window-system.md
  - docs/topics/ui-surface-architecture.md
  - src-tauri/src/window_state.rs
  - src-tauri/src/lib.rs
  - src/ui/window/CustomWindowFrame.tsx
  - src/ui/window/windowChrome.ts
  - src/ui/window/windowVariants.ts
  - src-tauri/tauri.conf.json
  - src-tauri/capabilities/default.json
---

# Window State And Monitor Policy

Contrato para resize y persistencia de posicion/tamano de ventanas en Copicu.

## Decision

Las ventanas tienen comportamiento parametrizable desde un registry compartido en Rust:

- `resizable`: si la ventana se puede redimensionar.
- `persist_bounds`: si guarda/restaura posicion y tamano.
- `persist_by_monitor`: si mantiene bounds separados por monitor.
- `default_width/default_height` y `min_width/min_height`.

Estado actual:

| Label | Resize | Persist bounds | Por monitor | Nota |
| --- | --- | --- | --- | --- |
| `main` | si | si | si | Picker rapido; al abrir usa el monitor del cursor. |
| `settings` | si | si | si | Ventana document; usa ultimo monitor disponible. |
| `ai-output` | si | si | si | Ventana document para Markdown/output. |
| `ui-host` | no | no | no | Prompt compacto; tamano calculado por request. |
| `notifications` | no | no | no | Posicionada por codigo junto al monitor de `main`; tamano fijo. |
| `whichkey` | no | no | no | Utility temporal; tamano fijo hasta reactivar/validar. |

## Research

Fuentes consultadas el 2026-06-09:

- Microsoft documenta una preferencia de Windows para "Remember window locations based on monitor connection" y minimizacion al desconectar monitor. Esto confirma que el modelo esperado por usuarios multi-monitor no es solo coordenadas globales, sino posiciones asociadas a configuracion/monitor.
  - https://support.microsoft.com/en-us/windows/how-to-use-multiple-monitors-in-windows-329c6962-5a4d-b481-7baa-bec9671f728a
- Tauri `window-state` guarda/restaura posiciones y tamanos, pero opera como plugin general. Copicu necesita control por ventana y por monitor, por eso se implementa una capa propia chica.
  - https://v2.tauri.app/plugin/window-state/
- Tauri expone APIs de monitores: monitor actual, monitor por punto, monitores disponibles, cursor, `workArea`, posicion, tamano y escala.
  - https://v2.tauri.app/reference/javascript/api/namespacewindow/
- Electron RFC de persistencia de estado valida el patron de comprobar display/work area y ajustar bounds si al restaurar quedan fuera o no entran en pantalla.
  - https://github.com/electron/rfcs/blob/main/text/0016-save-restore-window-state.md

## Formato Persistido

El estado vive en `window-state.json` dentro del app data dir. No usa SQLite para no mezclar configuracion de ventanas con historial de clipboard.

Formato conceptual:

```json
{
  "schemaVersion": 1,
  "windows": {
    "main": {
      "lastMonitorKey": "monitor@0,0:1920x1080",
      "lastBounds": { "x": 100, "y": 100, "width": 820, "height": 620 },
      "boundsByMonitor": {
        "monitor@0,0:1920x1080": { "x": 100, "y": 100, "width": 820, "height": 620 }
      }
    }
  }
}
```

`monitorKey` se deriva de nombre si existe, posicion y resolucion. No se guarda contenido de clipboard.

## Restauracion

Al mostrar una ventana persistente:

1. Resolver la politica de esa ventana desde `WindowStateRegistry`.
2. Elegir monitor objetivo:
   - `main`: monitor bajo el cursor al momento de abrir.
   - `settings`/`ai-output`: monitor actual o primario disponible.
3. Si hay bounds guardados para ese monitor, usarlos.
4. Si no hay bounds para ese monitor pero existe ultimo monitor conectado guardado, usar esos bounds ajustados.
5. Si no hay estado, centrar con defaults en el monitor objetivo.
6. Validar contra `workArea`:
   - clamp de tamano a minimo y area disponible;
   - si la ventana queda casi fuera de pantalla, centrar;
   - si solo sobresale, empujarla dentro del area visible.

Regla importante: `boundsByMonitor` conserva posiciones por monitor. Si un monitor externo no esta conectado, la ventana puede abrir en el monitor disponible sin borrar la posicion previa del externo.

## Resize En Frameless

`decorations: false` no garantizo resize por borde en Windows/WebView2. Por eso:

- Tauri `resizable` queda prendido para ventanas que aceptan resize.
- El frame React compartido agrega resize handles invisibles por borde/esquina.
- Los handles llaman `getCurrentWindow().startResizeDragging(direction)`.
- La capability requerida es `core:window:allow-start-resize-dragging`.

Esto mantiene el chrome custom y evita volver a ventanas nativas solo para resize.

## Donde Cambiar Comportamiento

Para cambiar politica nativa por ventana:

- Editar `WINDOW_BEHAVIORS` en `src-tauri/src/window_state.rs`.

Para cambiar resize handles del frame visual:

- Editar `DEFAULT_WINDOW_RESIZABLE` en `src/ui/window/windowVariants.ts`.
- O pasar `resizable={false}` a `CustomWindowFrame` para una superficie puntual.

Para agregar una ventana nueva:

1. Darle label estable.
2. Agregar behavior en `WINDOW_BEHAVIORS`.
3. Si usa chrome custom, elegir variante o override de `CustomWindowFrame`.
4. Agregar label a capabilities si necesita permisos frontend.
5. Restaurar antes de `show()`.
6. Guardar bounds desde eventos `Moved`, `Resized`, `Focused(false)` o `CloseRequested`.

## Checks

Minimo para este area:

```powershell
npm run build
cd src-tauri
$env:CARGO_TARGET_DIR='target-codex-check'; cargo check
```

Para cierre visual amplio, correr tambien:

```powershell
npm run visual:check
```
