---
id: picker-selection-and-marks-ux
status: implementation-validated
updated: 2026-07-29
execution_route: balanced
related:
  - docs/topics/picker-interaction.md
  - docs/tracks/010-ui-rethink.md
  - docs/tracks/012-tags-and-hotkeys.md
---

# 030 Picker Selection And Marks UX

## Objetivo

Separar visualmente la selección transitoria de los marks durables sin perder el ítem activo, las operaciones batch ni la persistencia existente.

## Comportamiento Observable

- El checkbox de cada fila y el checkbox global representan selección transitoria; permiten seleccionar uno, alternar con Ctrl, extender rangos con Shift, seleccionar los ítems visibles y limpiar la selección.
- El ítem activo conserva su resaltado y navegación keyboard-first, independiente de que forme parte o no de una selección múltiple.
- `Marked` usa una bandera u otro affordance persistente distinto del checkbox; su control separado conserva conteo, filtros y acciones actuales sin modificar la selección transitoria.
- Al existir selección aparece una barra contextual compacta con cantidad, Clear y las acciones batch existentes; cerrar/resetear el picker limpia selección pero no marks.

## Límites Explícitos

- Sin migración de SQLite ni cambio del significado durable de `marked`; los marks existentes deben reaparecer con el nuevo affordance.
- Sin conjuntos de marks con nombre, selección de todos los resultados paginados, nuevas acciones batch ni rediseño general del picker.
- Sin fusionar scenarios, saved views, tags o marks.

## Criterios De Terminado

1. Checkbox, selección de fila, ítem activo y mark persistente tienen estados y affordances inequívocos con mouse y teclado.
2. La selección visible puede crearse y limpiarse desde el control global, y sus acciones batch afectan solamente ese conjunto.
3. Los marks sobreviven al lifecycle actual y pueden filtrarse o gestionarse sin alterar la selección transitoria.
4. El layout sigue siendo compacto y usable en picker desktop y angosto.

## Checks Focales Mínimos

- Playwright desktop+narrow para selección global visible, Ctrl/Shift, barra batch, Clear y reset al ocultar/reabrir.
- Prueba focal de mark persistente independiente de la selección, más `npm run build` y diagnósticos de los archivos tocados.

## Resultado

- Checkbox individual y global gestionan selección transitoria; la bandera gestiona `marked` durable con menú y conteo propios.
- La barra contextual expone Tags, Metadata, Actions, Delete y Clear sin mezclar selección con marks.
- Validado con build correcto, diagnósticos sin errores y Playwright desktop+narrow completo: 200 passed.
