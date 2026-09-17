---
id: picker-appearance-adaptation
status: complete
updated: 2026-09-16
---

# Picker Appearance Adaptation

## Objetivo

Adaptar el picker a imágenes, acciones, cantidad de texto, metadata y distintos
tamaños de pantalla sin separar Settings de la geometría real del feed.

Tema canónico: `docs/topics/appearance-and-themes.md`.

## Contrato De Settings

Appearance agrega cinco preferencias con defaults que preservan el comportamiento
de `v0.4.19`:

- `Image preview`: `Small | Medium | Large`; default `Large`. Large mantiene
  180 px, Medium usa aproximadamente 140 px y Small aproximadamente 96 px.
- `Item actions`: `Auto | Inline | Menu only`; default `Auto`. Auto usa acciones
  inline cuando caben y un único menú en ventanas angostas.
- `Action size`: `Auto | Small | Large`; default `Auto`. Auto usa 32 px con mouse
  y 44 px con pointer coarse; Small nunca baja de 32 px y Large usa 44 px.
- `Text preview`: `2 lines | 4 lines | 6 lines`; default `4 lines`. Sólo controla
  la altura colapsada.
- `Item details`: `Always | Selected item only`; default `Always`. Sólo controla
  tags y notes; el título siempre permanece visible.

Frontend y Rust persisten el mismo schema camelCase. Settings previos o inválidos
normalizan a esos defaults, sin aliases ni shims.

## Autosave De Appearance

- Todo cambio de color mode, theme, density o los cinco controles nuevos
  actualiza Settings optimistamente y se persiste de inmediato.
- Las escrituras completas de settings se serializan y versionan. Cada payload
  parte del último estado confirmado, no del draft de otras secciones; una
  respuesta o error viejo no reemplaza una selección más nueva.
- Cada persistencia confirmada emite `settings_updated`. Settings, picker,
  metadata y demás consumidores aplican el cambio sin iniciar otra escritura.
- El autosave espera la hidratación inicial antes de componer su primer payload.
  Un `get_settings` tardío o un broadcast más nuevo no puede pisar el cambio.
- Ante un error de la versión vigente, Appearance vuelve al último valor
  confirmado y presenta un error persistente con una acción concreta.
- Save y Cancel conservan su semántica para las demás secciones. Appearance se
  excluye de ese draft, rollback y payload; la UI lo declara en la sección y el
  footer. Save espera la cola de Appearance para evitar escrituras cruzadas.

El autosave permanece deliberadamente acotado a Appearance. Extenderlo a todo
Settings cambiaría el contrato de edición, validación y cancelación de las demás
secciones y requiere una decisión separada.

## Comportamiento Del Picker

- El tamaño de imagen alcanza clips de imagen, imágenes Markdown, preview
  sintética y estimadores del virtualizador. La ventana de preview completa no
  cambia. El responsive obligatorio puede reducir el límite en ventanas angostas.
- Inline conserva Mark, Delete y More separados. Menu only conserva esas
  operaciones y las secundarias en un único menú, con foco, teclado, estilo
  destructivo y aparición equivalentes.
- Show more aparece sólo ante overflow real y muestra conteo útil. Show less
  vuelve al límite configurado. La expansión tiene altura máxima y scroll interno.
- Cambios en caliente de imagen, texto, acciones o details remiden el feed y
  restauran selección y ancla visual. Flechas no pierden el item activo.
- La preview de Settings usa exclusivamente datos sintéticos estables.

## Límites

No incluye `Show item actions`, expansión ilimitada, presets Text focused,
Balanced o Visual, small-screen manual, sliders, targets menores a 32 px,
fuentes globales, temas custom ni CSS arbitrario.

Auto complementa el responsive obligatorio; nunca puede romper layout,
accesibilidad o touch.

## Aceptación

- Los cinco controles son claros, buscables, keyboard-first y utilizables en
  Settings angosto; cada opción cambia picker y preview en vivo, se persiste sin
  Save y se propaga a todas las ventanas consumidoras.
- Escrituras rápidas son seriales y last-write-wins; bootstrap, broadcasts,
  Save y Cancel no generan loops, clobber ni reversión de Appearance.
- Imágenes normales y Markdown coinciden con sus estimadores sin huecos,
  solapamientos ni saltos al cambiar en caliente.
- Todas las acciones siguen disponibles en Auto, Inline y Menu only. Touch
  conserva 44 px en Auto y ningún modo baja de 32 px.
- 2/4/6 son límites reales. Show more/Show less depende de overflow medido y la
  expansión permanece acotada.
- Always/Selected item only afecta exclusivamente tags y notes. Título,
  selección, navegación y accesibilidad permanecen.
- Desktop, narrow, pointer coarse, foco, High Contrast y reduced motion conservan
  comportamiento correcto.

## Verificación 2026-09-16

- `npm run build`: pasa; conserva el warning conocido del chunk principal mayor
  a 500 kB.
- `npm run visual:check`: `348/348` en desktop y narrow. Cubre Settings
  buscable, keyboard y bootstrap; autosave inmediato; composición desde el
  último estado confirmado; escrituras rápidas seriales y last-write-wins;
  rollback accionable; aislamiento de Save/Cancel; persistencia y broadcasts
  sin loops; defaults legacy/invalid; 96/140/180 px con cap responsive de 148
  px también en estimadores profundos; imagen y Markdown; Auto, Inline, Menu
  only y pointer coarse; targets 32/44 px; separación vertical de filas Compact
  con acciones de 44 px; 2/4/6 líneas; overflow real y expansión acotada;
  details por selección con ancla estable al navegar; contraste del outline
  enfocado real; High Contrast; lista virtual mixta de 1.200 items, ancla y
  ausencia de huecos o solapamientos.
- `cargo check --manifest-path src-tauri/Cargo.toml --target-dir
  .codex-run/appearance-cargo-target`: pasa.
- El test Rust focal de settings legacy compila y no inicia por el
  `STATUS_ENTRYPOINT_NOT_FOUND` conocido del entorno Windows.
- `npm run dev:restart`: instancia actual reiniciada. La superficie nativa
  confirmó el copy de autosave, aplicación optimista y persistencia inmediata:
  Density pasó de Compact a Standard, sobrevivió Cancel y reapertura, y luego
  volvió a Compact sin usar Save. El estado original quedó restaurado.
- La validación con contenido y feeds mixtos usa sólo fixtures sintéticos.

El corte se publicó e instaló como `v0.4.20`.
