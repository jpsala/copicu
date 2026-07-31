---
id: picker-compact-previews-inline-edit
status: complete
updated: 2026-07-31
execution_route: balanced
related:
  - docs/topics/picker-interaction.md
  - docs/topics/ui-surface-architecture.md
  - docs/tracks/010-ui-rethink.md
  - docs/tracks/023-item-preview-window.md
---

# 033 Picker Compact Previews And Inline Edit

## Objetivo

Hacer el feed del picker más compacto y explícito ante contenido truncado, con expansión y edición rápida inline sin reemplazar el editor completo existente.

## Comportamiento Observable

- Las imágenes ocupan una preview compacta ajustada a su contenido; un click o la acción existente abre la preview completa sin agrandar automáticamente la fila seleccionada.
- Los textos que realmente desbordan su preview muestran un indicador discreto con cantidad total de caracteres y líneas, más una acción para expandir o contraer el contenido dentro de una altura acotada.
- La acción de edición rápida cambia un único item de texto entre lectura y un editor inline liviano; `Ctrl+Enter` guarda y `Escape` cancela, mientras `F2` conserva el editor CodeMirror full-surface.
- Expandir, contraer, editar o guardar mantiene selección y scroll estables dentro del feed virtualizado.

## Límites Explícitos

- Sin cambiar persistencia, contratos Rust/Tauri, captura, búsqueda, activación, metadata ni formatos rich; la edición inline cubre texto plano usando las capacidades de guardado existentes.
- Sin montar CodeMirror por fila, rediseñar el picker completo, agregar settings de densidad ni mostrar contadores en items que no estén truncados.
- Sin deploy, release, instalación ni uso de datos reales; todo el batch es local, reversible y no requiere autorización externa.

## Criterios De Terminado

1. Imágenes pequeñas, verticales y panorámicas quedan visualmente acotadas y pueden abrirse en la preview completa existente.
2. Solo el texto con overflow real muestra conteos y expansión; expandir y contraer no rompe selección, navegación ni scroll.
3. Un item de texto puede editarse inline, guardar o cancelar con los atajos acordados, y `F2` sigue abriendo el editor completo.
4. El picker conserva un layout compacto y usable en ancho desktop y narrow.

## Resultado

Implementado el 2026-07-31:

- previews de imagen y Markdown acotadas al contenido; click en imagen abre la preview completa existente sin cambiar la altura por selección;
- overflow real medido en DOM, conteos exactos de caracteres/líneas y expansión acotada con remedición de la fila sin mover el scroll;
- edición rápida de un único texto con textarea inline, `Ctrl+Enter` para guardar y `Escape` para cancelar; `F2` conserva el editor CodeMirror full-surface;
- selección y scroll preservados al expandir, contraer, editar y guardar.

## Evidencia

- Playwright focal desktop y narrow: 6 tests pasaron.
- Diagnósticos TypeScript de los archivos tocados: sin errores.
- `npm run build`: pasó.
