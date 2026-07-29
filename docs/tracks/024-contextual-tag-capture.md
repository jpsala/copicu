---
id: 024-contextual-tag-capture
status: implementation-validated
updated: 2026-07-29
execution_route: strong
related:
  - docs/topics/tag-management-hotkeys.md
  - specs/009-saved-history-views/spec.md
---

# 024 Contextual Tag Capture

## Objetivo

Convertir tags, vistas guardadas y un contexto de captura explícito en un único flujo para trabajar dentro de un tema sin mezclar las copias nuevas con el resto del historial.

## Comportamiento observable

- Una vista guardada puede declarar tags de captura; abrirla sigue aplicando su query sin modificar metadata hasta que el usuario activa explícitamente `Capturar aquí`.
- Mientras el contexto está activo, el picker lo muestra de forma persistente y cada captura nueva recibe esos tags por la ruta normal de persistencia/dedupe, por lo que aparece inmediatamente si coincide con la vista.
- El usuario puede detener el contexto sin limpiar la vista, y salir o cambiar de vista no deja una captura contextual activa de forma implícita.
- La edición batch de tags permite agregar y quitar tags de la selección sin reemplazar los tags no afectados.

## Límites explícitos

- No agrega colecciones, carpetas, sidebar, orden manual ni una superficie nueva de gestión de historial.
- No infiere tags desde contenido, aplicación de origen o AI, ni convierte queries arbitrarias en metadata.
- Solo hay un contexto de captura activo y sus tags son explícitos; filtrar o fijar una query no lo activa por sí solo.

## Criterios de terminado

1. Una vista con tags de captura puede abrirse, armarse y detenerse con un estado visible y distinto del filter lock.
2. Capturar o recapturar contenido con el contexto armado aplica sus tags atómicamente y actualiza la vista; con el contexto detenido no los aplica.
3. Sobre una selección múltiple se pueden agregar y quitar tags en una sola edición sin alterar los demás tags de cada clip.
4. Reabrir Copicu conserva la definición de la vista, pero no reactiva silenciosamente un contexto de captura terminado o abandonado.

## Checks focales mínimos

- Tests Rust focales de persistencia/dedupe con contexto y patch batch de tags.
- Playwright focal del picker para armar/detener contexto, estado visible y add/remove batch.
- `npm run build`.
- Smoke nativo: copiar desde una app externa con el contexto armado y luego detenido, comprobando aparición y tags en el picker.

## Resultado 2026-07-29

Implementado el flujo completo: las vistas persisten tags de captura, el picker arma y detiene un único contexto transitorio visible, y captura/recaptura aplica tags dentro de la transacción de persistencia y dedupe. La edición batch usa un patch atómico de tags a agregar y quitar sin reemplazar metadata no afectada.

Evidencia: `npm run rust:test` (130 passed, 1 ignored), Playwright focal desktop+narrow (4 passed), `npm run build` y smoke nativo con PowerShell externo (`ARMED` recibió `#context-smoke`; `STOPPED` quedó sin tags). Sin gates externos pendientes.
