---
id: 023-item-preview-window
status: implementation-validated
updated: 2026-07-28
execution_route: strong
---

# 023 Item Preview Window

## Objetivo

Agregar una ventana separada de preview, abierta de forma explícita desde el
item activo, para inspeccionar imágenes con zoom y ver Markdown o texto
completo.

## Comportamiento observable

- Settings permite configurar el atajo local de preview, `Alt+Enter` por
  defecto.
- El item activo muestra una lupa junto al trash; el menú contextual agrega
  `Preview`, y el atajo abre o cierra la misma superficie.
- Se abre una única ventana secundaria redimensionable sin robar foco
  inicialmente; pedir preview de otro item actualiza el contenido y pasar a la
  ventana no oculta accidentalmente el picker.
- Las imágenes muestran primero el thumbnail y cargan después el PNG completo
  para zoom, pan y reset; Markdown se renderiza sin contenido remoto y el resto
  del texto se muestra completo.
- Ocultar el picker o pasar a una aplicación externa oculta también el preview.

## Límites explícitos

- No incluye edición externa, edición/versionado de imágenes, pin permanente ni
  historial de previews.
- No abre múltiples previews, no precarga blobs completos antes del trigger y no
  expone paths arbitrarios al frontend.
- No carga contenido remoto desde Markdown ni agrega previews enriquecidos de
  HTML o URLs.

## Criterios de terminado

1. El atajo configurable persiste y abre/cierra el preview del item activo; la
   lupa y el menú contextual abren la misma ventana sin depender de hover.
2. Un item de imagen se ve a resolución completa y permite zoom, pan y reset sin
   usar el thumbnail como fuente final.
3. Items Markdown y texto muestran su contenido completo en la misma superficie
   sin fetch remoto.
4. El flujo picker → preview → aplicación externa respeta foco y cierre, sin
   dejar una ventana huérfana ni ocultar el picker al interactuar con el
   preview.

## Resultado implementado

Ventana `item-preview` registrada y persistente por monitor, payload acotado sin
paths, carga diferida del PNG completo, render Markdown local y texto íntegro.
El picker ofrece menú contextual, lupa del activo y atajo configurable.

## Evidencia

- `npm run build`.
- `cargo check --manifest-path src-tauri/Cargo.toml --tests` con target aislado
  por lock de la instancia dev.
- Playwright focal: 12 casos de preview/Settings en desktop y narrow; 10 pasaron
  en el agregado inicial y los 2 de Settings pasaron tras corregir el selector.
- Dogfood nativo: `Alt+Enter` abrió sin robar foco y el segundo uso cerró la
  ventana (`item-preview.toggle` + `item-preview.hide`).
