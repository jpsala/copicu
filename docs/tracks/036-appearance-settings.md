---
id: appearance-settings
status: complete
updated: 2026-09-16
---

# Appearance Settings

## Objetivo

Convertir Appearance en una preferencia visible y útil para el uso diario del
picker sin abrir una colección de controles visuales independientes.

Tema canónico: `docs/topics/appearance-and-themes.md`.

## Corte Acordado

- `Color mode`: control segmentado `System | Light | Dark` sobre el setting
  existente `appearance.theme`.
- `Theme`: selector visual compacto para los ocho presets built-in existentes,
  alimentado por `src/themeCatalog.ts` y navegable por teclado.
- `Density`: `Standard | Compact`; `Standard` conserva exactamente el layout
  actual y es el default para settings previos.
- Preview no interactiva de dos items sintéticos, uno normal y uno seleccionado,
  sin leer historial ni clipboard. Debe reflejar modo, tema y densidad con los
  mismos tokens y métricas del picker.

El mayor impacto esperado es Density: se configura pocas veces, pero cambia cada
uso del picker. El selector visual corrige el bajo descubrimiento de temas ya
implementados; no justifica todavía temas custom.

## Contrato De Density

Density cambia sólo geometría del feed:

| Métrica | Standard | Compact inicial |
| --- | ---: | ---: |
| Altura mínima de fila textual | 62 px | 54 px |
| Padding vertical | 8 px | 4 px |
| Gap interno | 5 px | 3 px |

Los valores Compact son punto de partida para validación visual, no una promesa
inamovible. La altura es mínima y dinámica, nunca fija.

Density no cambia tipografía, máximo de líneas, metadata visible, padding
horizontal, imágenes, focus ring, selección ni navegación. Las imágenes conservan
su geometría y estimadores propios; sólo puede reducirse el espacio exterior
compartido. La fila completa sigue siendo seleccionable y las acciones conservan
un target mínimo de 32 x 32 px.

CSS y TypeScript deben consumir una definición compartida de las métricas. Al
cambiar Density, invalidar/remedir la lista virtualizada y mantener visible el
item seleccionado y su ancla visual, no sólo el offset numérico de scroll.

## Preview Y Selector

- Usar contenido ficticio estable, por ejemplo texto/código y una URL con
  metadata; no enseñar todos los tipos de clip.
- Reusar primitivas presentacionales reales si pueden separarse sin una
  refactorización grande. Una maqueta que comparta colores pero no geometría no
  es suficiente.
- No montar búsqueda, virtualización ni interacción del picker dentro de
  Settings.
- El selector de temas muestra nombre, muestra cromática y selección mediante
  borde/check, no sólo color. Debe soportar flechas, `Enter` y foco visible, con
  layout desktop y angosto.

## Fuera De Alcance

- `Comfortable` hasta que una necesidad concreta justifique un tercer nivel.
- Longitud configurable de preview, tamaño de imágenes y niveles de metadata.
- Fuente global, sliders de padding/radio/altura y toggles por campo.
- Color pickers, CSS arbitrario, temas custom e import/export de temas.
- Control propio de motion; seguir respetando `prefers-reduced-motion`.

## Implementación

1. El schema compartido/frontend/Rust persiste `Density` y normaliza settings
   previos a `Standard`.
2. `src/themeCatalog.ts` define las métricas compartidas; CSS consume las
   variables aplicadas por el catálogo y TypeScript usa el mismo contrato para
   estimar el feed.
3. El picker remide filas al cambiar Density y restaura la selección/ancla por
   índice y offset visual, incluyendo feeds mixtos con imágenes.
4. Settings usa controles Mantine-first para Color mode y Density, más un
   selector visual accesible de los ocho presets.
5. La preview usa dos clips sintéticos estables con primitivas y geometría del
   feed; no lee historial ni clipboard.
6. `settings_updated` se emite globalmente. Los consumidores registran el
   listener antes de hidratar settings y evitan que una lectura inicial tardía
   sobrescriba una actualización más nueva.

## Aceptación

- Standard es visual y geométricamente equivalente al comportamiento actual.
- Compact aumenta la cantidad de items cortos visibles sin ocultar información.
- Alternar Density en una lista larga mixta no produce huecos, solapamientos ni
  saltos de selección.
- Los ocho temas funcionan en light/dark; High Contrast mantiene selección,
  texto secundario y foco distinguibles.
- Selector y preview funcionan con teclado, foco visible y Settings angosto.
- La preview nunca usa contenido real del clipboard.
- Pasan `npm run build` y `npm run visual:check`; ejecutar checks Rust focales si
  cambia el schema o la persistencia host.

## Verificación 2026-09-16

- `npm run build`: pasa; conserva el warning conocido de chunk principal mayor
  a 500 kB.
- `npm run visual:check`: 328/328. Incluye Settings desktop/angosto, teclado,
  persistencia sin carreras de bootstrap, foco High Contrast con contraste
  no-texto de al menos 3:1 y Density en un feed virtual mixto de 1.200 items con
  restauración del ancla aunque su nodo se desmonte, además de geometría estable
  de imágenes.
- `cargo check` con target aislado: pasa.
- El test Rust focal de compatibilidad legacy compila, pero el binario no inicia
  por el `STATUS_ENTRYPOINT_NOT_FOUND` conocido del entorno Windows.
- `npm run dev:restart`: instancia dev reiniciada. Verificación nativa confirmó
  Settings angosto, los ocho temas, Standard/Compact, preview y propagación en
  vivo de High Contrast/Compact al picker; se restauró Dark/Moss/Standard.

El corte queda completo en desarrollo. No fue publicado, instalado ni promovido.
