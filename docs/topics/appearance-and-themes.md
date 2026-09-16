---
id: appearance-and-themes
status: active
kind: decision-map
triggers:
  - appearance
  - density
  - theme settings
  - temas
  - dark mode
  - light mode
primary_refs:
  - docs/topics/ui-surface-architecture.md
  - docs/topics/ui-design-and-impeccable.md
  - docs/topics/mantine-ui-system.md
  - docs/topics/picker-interaction.md
  - docs/tracks/036-appearance-settings.md
  - src/themeCatalog.ts
  - src/shared/settings.ts
  - src/styles.css
  - src/main.tsx
---

# Appearance And Themes

## Alcance

Fuente durable para modo de color, presets visuales, densidad del picker y su
presentación en Settings. La arquitectura de ventanas vive en
`ui-surface-architecture.md`; Mantine y wrappers viven en
`mantine-ui-system.md`; interacción del feed vive en `picker-interaction.md`.

## Modelo Vigente

- `appearance.theme`: `system | light | dark`.
- `appearance.themeId`: preset visual built-in con par light/dark.
- `appearance.density`: `standard | compact`; settings previos normalizan a
  `standard`.
- `src/themeCatalog.ts` es la fuente de tokens Copicu, paletas Mantine y presets.
- Presets actuales: Default, Graphite, Code, High Contrast, Midnight, Blueprint,
  Moss y Rose.
- Settings y el picker consumen la misma Appearance; los presets no se duplican
  como bloques CSS por tema.
- Settings es Mantine-first. El feed virtualizado permanece custom.

La interfaz debe seguir siendo una utilidad local compacta, discreta y
keyboard-first. Los temas son una feature de producto para legibilidad e
identidad, no una superficie decorativa ni compatibilidad visual con CopyQ.

## Implementación Vigente

- `Color mode` usa un control segmentado `System | Light | Dark`.
- `Theme` presenta los ocho presets built-in como radios visuales con nombre,
  muestra cromática, marca/borde y navegación por flechas, `Home` y `End`.
- `Density` ofrece `Standard | Compact`. Standard conserva el layout previo.
- La preview no interactiva usa dos items sintéticos estables y las mismas
  clases, tokens y métricas del picker; nunca lee historial ni clipboard.
- Las métricas viven en `src/themeCatalog.ts`: se aplican como variables CSS y
  alimentan la estimación TypeScript.
- Al cambiar Density, el virtualizador remide y restaura el item ancla por índice
  y offset visual. Imágenes y Markdown conservan estimadores propios.
- Settings emite `settings_updated` globalmente. Picker y metadata registran el
  listener antes de hidratar y descartan una respuesta inicial obsoleta si ya
  recibieron una actualización.

## Contrato De Density

Density modifica sólo geometría del feed:

| Métrica | Standard | Compact inicial |
| --- | ---: | ---: |
| Altura mínima de fila textual | 62 px | 54 px |
| Padding vertical | 8 px | 4 px |
| Gap interno | 5 px | 3 px |

Compact es un punto de partida para validación visual. La altura es mínima y
dinámica, nunca fija.

Density no cambia tipografía, máximo de líneas, metadata visible, padding
horizontal, imágenes, focus ring, selección ni navegación. Las imágenes
conservan su geometría y estimadores propios. La fila completa sigue siendo
seleccionable y las acciones conservan targets de al menos 32 x 32 px.

CSS y TypeScript deben consumir una definición compartida de métricas. Al
cambiar Density, invalidar/remedir la lista virtualizada y conservar el item
seleccionado y su ancla visual.

## Preview Y Accesibilidad

- Usar contenido ficticio estable; nunca historial o clipboard real.
- Compartir tokens, tipografía y geometría con el render del picker. Reusar la
  presentación real sólo si puede separarse sin una refactorización grande.
- No montar búsqueda, virtualización ni comportamiento del picker en Settings.
- Selector y preview deben funcionar en Settings desktop y angosto.
- La selección debe distinguirse por marca/borde además de color.
- Mantener foco visible, contraste legible y `prefers-reduced-motion`.

## Límites

No agregar antes del dogfood de este corte:

- `Comfortable` u otros niveles de Density;
- longitud configurable de texto, tamaño de imágenes o niveles de metadata;
- fuente global, sliders de padding/radio/altura o toggles por campo;
- color pickers, CSS arbitrario, temas custom o import/export;
- un control propio de motion.

Una necesidad observada puede justificar otro corte. No reservar esos controles
como roadmap automático.

## Verificación

- Standard permanece equivalente al comportamiento actual.
- Compact aumenta los items cortos visibles sin ocultar información.
- Alternar Density en feeds mixtos no genera huecos, solapamientos ni saltos de
  selección.
- Los ocho presets funcionan en light/dark; High Contrast conserva texto,
  selección y foco distinguibles.
- Persistencia y actualización alcanzan todas las ventanas consumidoras.
- Pasan `npm run build` y `npm run visual:check`; ejecutar checks Rust focales si
  cambia el schema o la persistencia host.

Resultado 2026-09-16: `npm run build` y `npm run visual:check` pasan
(`328/328`); la regresión cubre bootstrap concurrente de Settings, foco High
Contrast >= 3:1 y restauración por identidad/índice de un ancla desmontada en un
feed mixto de 1.200 items. `cargo check` pasa. El test Rust focal de settings
legacy compila pero no puede iniciar por el `STATUS_ENTRYPOINT_NOT_FOUND`
conocido de Windows.
La instancia dev reiniciada confirmó Settings/picker reales, layout angosto,
High Contrast y propagación Standard/Compact. El corte permanece sólo en
desarrollo: no se instaló ni publicó.
