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
  - docs/tracks/037-picker-appearance-adaptation.md
  - src/themeCatalog.ts
  - src/shared/settings.ts
  - src/styles.css
  - src/main.tsx
---

# Appearance And Themes

## Alcance

Fuente durable para modo de color, presets visuales y geometría configurable del
picker en Settings. La arquitectura de ventanas vive en
`ui-surface-architecture.md`; Mantine y wrappers viven en
`mantine-ui-system.md`; interacción del feed vive en `picker-interaction.md`.

## Modelo Vigente

- `appearance.theme`: `system | light | dark`.
- `appearance.themeId`: preset visual built-in con par light/dark.
- `appearance.density`: `standard | compact`; settings previos normalizan a
  `standard`.
- `appearance.imagePreview`: `small | medium | large`; default `large`.
- `appearance.itemActions`: `auto | inline | menuOnly`; default `auto`.
- `appearance.actionSize`: `auto | small | large`; default `auto`.
- `appearance.textPreviewLines`: `2 | 4 | 6`; default `4`.
- `appearance.itemDetails`: `always | selectedOnly`; default `always`.
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
- `Image preview` comparte alturas de 96, 140 y 180 px entre imágenes normales,
  Markdown, preview sintética y estimadores; ventanas de hasta 560 px limitan el
  máximo a 148 px. La ventana de preview completa queda fuera.
- `Item actions` ofrece Auto, Inline y Menu only. Auto colapsa a un único menú
  hasta 560 px; Inline conserva Mark, Delete y More mientras quepan y aplica el
  límite responsive obligatorio hasta 380 px.
- `Action size` usa 32 px en Small, 44 px en Large y 32/44 px en Auto según
  mouse o pointer coarse.
- `Text preview` limita el estado colapsado a 2, 4 o 6 líneas. Show more/Show
  less depende de overflow medido; expandido conserva máximo y scroll interno.
- `Item details` controla sólo tags y notes; el título siempre permanece.
- La preview no interactiva usa items sintéticos estables y las mismas clases,
  tokens y métricas del picker; nunca lee historial ni clipboard.
- Las métricas compartidas viven en `src/themeCatalog.ts`, se aplican como
  variables CSS y alimentan la estimación TypeScript.
- Todo cambio de geometría remide el virtualizador y restaura el item ancla por
  identidad, índice y offset visual. La navegación también remide al mover
  details entre el item anterior y el nuevo.
- Appearance tiene autosave inmediato y optimista. Cada cambio confirmado emite
  `settings_updated`; picker, metadata y demás consumidores aplican el evento
  sin volver a persistirlo.
- Las escrituras de Appearance son seriales y versionadas, parten del último
  settings confirmado y aplican last-write-wins. Esperan la hidratación inicial;
  respuestas tardías, broadcasts y fallos viejos no pisan una selección nueva.
- El fallo vigente restaura el último Appearance confirmado y muestra un error
  persistente y accionable.
- Save y Cancel siguen siendo transaccionales para las demás secciones y nunca
  escriben ni revierten Appearance. Save espera la cola de autosave antes de
  persistir otros drafts. La UI explicita este límite.
- Picker y metadata registran el listener antes de hidratar y descartan una
  respuesta inicial obsoleta si ya recibieron una actualización.

## Contrato De Density

Density modifica sólo geometría del feed:

| Métrica | Standard | Compact inicial |
| --- | ---: | ---: |
| Altura mínima de fila textual | 62 px | 54 px |
| Padding vertical | 8 px | 4 px |
| Gap interno | 5 px | 3 px |

Compact es un punto de partida para validación visual. La altura es mínima y
dinámica, nunca fija.

Density por sí sola no cambia tipografía, máximo de líneas, metadata visible,
padding horizontal, imágenes, focus ring, selección ni navegación. Esas
dimensiones tienen settings independientes. La fila completa sigue siendo
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

No incluye:

- `Comfortable` u otros niveles de Density;
- `Show item actions` ni expansión ilimitada;
- presets Text focused, Balanced o Visual;
- small-screen mode manual, sliders libres o targets menores a 32 px;
- fuente global, color pickers, CSS arbitrario, temas custom o import/export;
- un control propio de motion.
- autosave de las demás secciones de Settings.

Auto complementa el responsive obligatorio; nunca puede romper layout,
accesibilidad o touch.

## Verificación

- Los defaults preservan `v0.4.19`; settings legacy o inválidos normalizan en
  TypeScript y Rust.
- Imágenes normales, Markdown y estimadores comparten altura, incluido el cap
  responsive de 148 px; los cambios en caliente no generan huecos,
  solapamientos ni saltos.
- Auto, Inline y Menu only conservan operaciones, teclado, foco y destructive
  styling; Auto con pointer coarse usa 44 px y la altura mínima efectiva evita
  que acciones grandes desborden filas Compact.
- 2/4/6 son límites colapsados reales; Show more/Show less sólo aparece ante
  overflow medido y la expansión queda acotada.
- Always/Selected item only afecta exclusivamente tags y notes; título,
  selección, navegación y ancla permanecen incluso con metadata desigual.
- Los ocho presets funcionan en light/dark; High Contrast conserva texto,
  selección y contraste del outline enfocado real.
- Autosave serializa cambios rápidos con last-write-wins, rollback confirmado y
  errores accionables. No mezcla drafts de otras secciones ni crea loops de
  `settings_updated`.
- Persistencia y actualización alcanzan todas las ventanas consumidoras sin
  carreras de bootstrap.

Resultado 2026-09-16 del corte base: `v0.4.19` se publicó e instaló localmente.

Resultado 2026-09-16 de los cortes adaptativos: `npm run build` pasa con el
warning conocido del chunk principal; `npm run visual:check` pasa `348/348` en
desktop y narrow; `cargo check --manifest-path src-tauri/Cargo.toml --target-dir
.codex-run/appearance-cargo-target` pasa. La suite cubre autosave inmediato,
escrituras rápidas seriales, bootstrap, broadcasts sin loops, rollback,
aislamiento de Save/Cancel, estimación responsive profunda, acciones Compact de
44 px, ancla al mover details y outline High Contrast renderizado. El test Rust
focal compila pero no puede iniciar por el `STATUS_ENTRYPOINT_NOT_FOUND`
conocido de Windows. La instancia dev reiniciada confirmó la superficie real;
feeds mixtos largos y pointer coarse usan fixtures sintéticos.
Este corte adaptativo queda sólo en desarrollo: no se publicó ni instaló.
