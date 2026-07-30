---
id: saved-history-views-ux-followup
status: implementation-validated
updated: 2026-07-29
execution_route: balanced
related:
  - specs/009-saved-history-views/spec.md
  - docs/tracks/024-contextual-tag-capture.md
  - docs/tracks/028-active-scenarios-metadata.md
  - docs/tracks/029-picker-scenario-switcher.md
  - docs/topics/picker-interaction.md
---

# 031 Saved History Views UX Follow-up

## Objetivo

Separar el modelo visible para que una Saved View sea un filtro nombrado reconocible y un Scenario sea el único contexto público de captura y metadata.

## Comportamiento Observable

- El picker ofrece un acceso visible y keyboard-first a Saved Views, con apertura y acceso a su administración sin depender de descubrirlas dentro de Settings.
- Abrir una Saved View aplica su query y muestra siempre su nombre y una salida explícita, aunque no tenga capture tags; editar la query abandona esa identidad y deja una búsqueda manual.
- Abrir una Saved View nunca arma captura ni aplica metadata. La edición de Saved Views deja de presentar capture tags.
- Los controles y el indicador de sesión de Scenario son la única UX de captura contextual; conservan el ciclo de activación, cambio y detención ya validado.

## Límites Explícitos

- Sin fusionar Saved Views y Scenarios, agregar sidebar o tab principal, ni rediseñar Settings, Scenarios o el lenguaje de búsqueda.
- Sin migrar ni borrar datos persistidos en este corte; los capture tags históricos de una Saved View pueden permanecer almacenados, pero no habilitan captura desde la view.
- Sin cambiar la persistencia de sesiones: una Saved View persiste como definición y un Scenario activo no se restaura silenciosamente al reiniciar.

## Criterios De Terminado

1. Una Saved View puede descubrirse y abrirse desde el picker, y su identidad permanece visible hasta salir o modificar la query.
2. Una búsqueda manual no adquiere identidad de view y ninguna Saved View ofrece o activa captura contextual, incluso si conserva capture tags históricos.
3. Activar, cambiar y detener Scenarios sigue siendo la única ruta visible para aplicar tags o metadata a nuevas capturas.
4. La gestión de Saved Views conserva título, query, hotkey y pinned sin exponer capture tags.

## Checks Focales Mínimos

- Playwright focal desktop y narrow para descubrir/abrir/cerrar una view, mostrar identidad sin capture tags y abandonarla al editar la query.
- Actualizar el test visual de capture context para comprobar que una Saved View con capture tags históricos no muestra ni arma `Capture here`, y mantener el flujo validado de Scenario.
- `npm run build`.

## Resultado

Implementado: el picker expone Saved Views en un menú visible, conserva nombre/query con salida explícita y abre su gestión directamente. Editar la query abandona la identidad. La UI y edición de Saved Views ya no muestran ni arman capture tags históricos; Scenarios conserva en exclusiva el contexto visible de captura y metadata.

Evidencia: Playwright focal desktop/narrow `10 passed`, `npm run build` y `cargo check` con target aislado.
