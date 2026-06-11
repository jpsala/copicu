---
id: mantine-ui-system
status: active
kind: decision-map
triggers:
  - Mantine
  - MUI
  - UI library
  - component library
  - themes
  - design system
primary_refs:
  - docs/topics/ui-surface-architecture.md
  - docs/topics/ui-rethink.md
  - docs/tracks/010-ui-rethink.md
  - src/mantineTheme.ts
  - src/themeCatalog.ts
  - src/main.tsx
---

# Mantine UI System

Topic para adoptar Mantine como infraestructura de componentes y temas de Copicu.

## Decision

Usar Mantine como libreria UI principal para controles comunes, settings, menus, tabs, switches, inputs, buttons, popovers y futuras superficies de configuracion.

No migrar el feed principal del picker de golpe. El picker/feed tiene comportamiento especializado: virtual list, preview rich, seleccion por id, keyboard-first y acciones host. Ahi conviene usar wrappers propios o Mantine solo en piezas chicas.

## Por Que Mantine

Comparacion inicial:

- MUI: solido y completo, con `ThemeProvider`, `createTheme`, `colorSchemes` y CSS variables; pero trae estetica Material y dependencias extra como Emotion. Riesgo alto de que Copicu parezca una web app de administracion.
- Mantine: componentes amplios, hooks, React 19 compatible, theming por `MantineProvider`, `createTheme`, `defaultColorScheme`, `theme.colors`, `primaryColor` y CSS variables. Encaja mejor para moverse rapido sin imponer tanto estilo.
- Radix Themes: buena base accesible y tokens, pero requiere componer mas UI propia. Mejor como alternativa si Mantine se siente demasiado pesado.

## Implementado

Primer slice 2026-06-06:

- instalado `@mantine/core` y `@mantine/hooks`;
- agregado `src/mantineTheme.ts`;
- `src/main.tsx` importa `@mantine/core/styles.css`;
- root React envuelto en `MantineProvider`;
- `defaultColorScheme="auto"` para respetar sistema;
- `deduplicateInlineStyles` activado para React 19;
- tema inicial usa familia tipografica local, radio compacto y escala teal compatible con tokens actuales.

Segundo slice 2026-06-06:

- Settings renderiza como `SettingsWindowApp` en ventana Tauri label `settings` o `?window=settings` en dev;
- comandos Rust `open_settings_window` y `close_settings_window` crean/enfocan/cierran la ventana standalone;
- la capability default incluye la ventana `settings`;
- Settings usa Mantine para controles interactivos: `Button`, `ActionIcon`, `TextInput`, `Select`, `Switch`, `Menu`, `Tabs` y `Badge`;
- wrappers locales iniciales viven en `src/main.tsx`: `UiButton`, `UiIconButton`, `UiTextInput`, `UiSelect`, `UiSwitch`;
- el picker solo invoca la apertura de Settings; ya no monta overlay interno de settings.

Tercer slice 2026-06-06:

- wrappers locales extraidos a `src/ui/controls.tsx`;
- wrappers disponibles: `UiButton`, `UiIconButton`, `UiTextInput`, `UiTextarea`, `UiNumberInput`, `UiSelect`, `UiSwitch`, `UiCheckbox`, `UiBadge`, `UiKbd`, `UiTooltip` y `UiLoader`;
- defaults compartidos movidos a `src/mantineTheme.ts` para `Input`, `InputWrapper`, `Button`, `ActionIcon`, `TextInput`, `Textarea`, `NumberInput`, `Select`, `Switch`, `Checkbox`, `Menu`, `Badge`, `Tabs`, `Tooltip`, `Kbd` y `Loader`;
- overrides globales `.mantine-*` reducidos: quedan solo foco de input scoped a Settings y layout especifico de `Tabs.Tab` en settings nav;
- `npm run build` y `npm run visual:check` pasaron.

Cuarto slice 2026-06-06:

- ventana principal migro controles simples del top row a wrappers Mantine;
- `UiTextInput` ahora soporta `ref` para preservar foco del search;
- search principal usa `UiTextInput`, status usa `UiBadge`, loader usa `UiLoader`, y botones `Commands`/`Settings` usan `UiButton` con `UiTooltip`;
- mark toggle usa `UiCheckbox` con estado indeterminate y mark dropdown usa Mantine `Menu` con `withinPortal`;
- se removio CSS del spinner custom y del mark menu custom;
- feed virtualizado, previews rich, item menus, command palette y edit/batch edit siguen custom por ahora;
- `npm run build` y `npm run visual:check` pasaron.

Quinto slice 2026-06-06:

- Settings cleanup completo para el corte corto: `Retention count` usa `UiNumberInput`;
- `Tabs` de Settings usa `classNames` local para el label y ya no depende de `.mantine-Tabs-tabLabel`;
- queda un solo override `.mantine-*` scoped a Settings para focus ring de inputs;
- `npm run build` y `npm run visual:check` pasaron.

Sexto slice 2026-06-06:

- command palette sigue con logica local y listbox propio;
- input usa `UiTextInput`, shortcuts usan `UiKbd` y source badges usan `UiBadge`;
- panel usa `UiPaper`, result buttons usan `UiUnstyledButton` y empty state usa `UiAlert`;
- `npm run build` y `npm run visual:check` pasaron.

Septimo slice 2026-06-06:

- agregado `lucide-react` para iconos de controles y menus;
- check principal mantiene Mantine `Checkbox`; check por item migro a `UiCheckbox`;
- mark menu principal usa Mantine `Menu` con iconos;
- item action button usa `UiIconButton` con `MoreVertical`;
- item menu usa portal/fixed positioning propio para respetar filas virtualizadas y click derecho, pero visualmente usa wrappers Mantine (`UiPaper`, `UiUnstyledButton`, `UiKbd`) e iconos;
- visual checks nuevos cubren check principal, check por item y mark menu;
- `npm run build` y `npm run visual:check` pasaron.

Octavo slice 2026-06-06:

- edit content, edit metadata y batch metadata mantienen el overlay custom del picker, pero el panel/control layer usa wrappers Mantine: `UiPaper`, `UiTextarea`, `UiButton` y `UiAlert`;
- `ui-host` mantiene ventana Tauri propia y request/response IDs, pero el prompt usa `UiPaper`, `UiTextInput` y `UiButton`;
- se redujeron reglas CSS manuales de inputs/botones en editor y `ui-host`;
- `UiPaper` soporta `component="form"` para formularios compactos;
- Appearance separa modo (`appearance.theme`: `system | light | dark`) de preset (`appearance.themeId`: `default | graphite | code | highContrast`);
- presets iniciales se aplican con `data-theme-id` y comparten tokens CSS Copicu para picker, prompts y controles Mantine estilados con variables;
- settings viejos sin `themeId` deserializan como `default`;
- visual checks cubren guardado de `theme` y `themeId`;
- `npm run build`, `npm run visual:check` 52/52 y `cargo check` pasaron. `npm run rust:test` compila pero el binario sigue fallando al arrancar con `STATUS_ENTRYPOINT_NOT_FOUND` conocido.

Noveno slice 2026-06-06:

- investigacion oficial Mantine confirmo:
  - `@mantine/notifications` renderiza un componente `Notifications` dentro del arbol React/MantineProvider y `position` solo elige esquina/centro dentro de esa ventana/documento;
  - para ubicar toasts en un monitor especifico, Copicu debe mantener ventana Tauri `notifications` propia y posicionarla desde el host nativo;
  - Mantine soporta `createTheme`, `theme.colors`, `primaryColor`, `colorsTuple`, `virtualColor`, `@mantine/colors-generator` y `cssVariablesResolver`, pero no trae un marketplace oficial de "temas completos" listo para app desktop; lo reusable oficial son paletas/variables/generadores y componentes Mantine UI.
- se agrego `src/themeCatalog.ts` como fuente de verdad para temas Copicu:
  - tipos `ThemeSetting` y `ThemeId`;
  - catalogo `COPICU_THEME_PRESETS`;
  - opciones para Settings;
  - paletas Mantine;
  - aplicador runtime `applyCopicuAppearance`.
- `src/mantineTheme.ts` ahora toma `MANTINE_THEME_COLORS` del catalogo.
- se eliminaron bloques CSS duplicados de presets en `src/styles.css`; quedan defaults/fallback light/dark y los presets se aplican como variables inline sobre `document.documentElement`.
- temas built-in actuales: Default, Graphite, Code, High contrast, Midnight, Blueprint, Moss y Rose.
- `appearance.theme` controla scheme (`system | light | dark`) y `appearance.themeId` controla preset N; al estar en `system`, cambios de `prefers-color-scheme` re-aplican tokens.
- visual checks cubren que Settings liste nuevos presets y que guardar Code/Dark aplique `--accent` esperado.
- `npm run build`, `npm run visual:check` 52/52 y `cargo check` pasaron. `npm run rust:test` sigue compilando y fallando al arrancar con `STATUS_ENTRYPOINT_NOT_FOUND` conocido.

## Reglas De Uso

- Para decidir si usar Mantine, empezar por `docs/topics/ui-surface-architecture.md`.
- Mantine primero para Settings y superficies de configuracion.
- Mantine primero para botones, action icons, menus, selects, switches, tabs, segmented controls, tooltips y popovers nuevos.
- Picker/feed principal se migra con cuidado, componente por componente, sin romper virtualizacion ni keyboard behavior.
- No mezclar estilos ad hoc y Mantine sin wrapper si el componente se va a repetir.
- Mantener CSS variables actuales hasta cerrar el modelo de temas Copicu.
- Evitar estetica dashboard generica: densidad compacta, radios chicos, iconos claros, poco texto.

## Siguiente Trabajo

1. Mantener toasts custom por ventana Tauri; no usar `@mantine/notifications` para el flujo multi-monitor.
2. Pulir Appearance:
   - revisar contraste de presets;
   - evaluar `cssVariablesResolver` solo para variables Mantine que no podamos cubrir desde `themeCatalog.ts`;
   - decidir si Settings necesita preview compacta de preset.
3. Evaluar wrappers faltantes (`UiMenu`, `UiMenuItem`, `Modal`, `Popover`, `FocusTrap`, `ScrollArea`) cuando aparezca un segundo consumidor real.

## Audit Mantine 2026-06-06

Objetivo del estudio: reducir CSS propio y usar Mantine para controles comunes sin romper el picker rapido, virtualizado y keyboard-first.

### Hallazgos

- La version local es `@mantine/core` 9.3.0 y coincide con la version vigente en docs oficiales revisadas el 2026-06-06.
- Mantine cubre el tipo de superficie que Copicu necesita para controles comunes: inputs, overlays, navegacion, menus, popovers, badges, command/search primitives, hooks y theming.
- El mayor resto de CSS propio no esta en Settings sino en el picker y superficies auxiliares:
  - search row: input, botones `Commands`/`Settings`, mark toggle y mark menu;
  - item actions: boton vertical, menu por portal y acciones destructivas;
  - command palette: dialog, input, lista, empty state y badges;
  - edit/batch edit: dialog interno, textarea, inputs y botones;
  - ui-host confirm/input: panel, input y botones;
  - toasts: stack custom, item, dismiss button y tonos;
  - settings: quedan overrides globales sobre clases internas Mantine para input, badge, tabs y button.
- El feed principal, previews rich, filas virtualizadas, medicion dinamica, seleccion por id y layout de imagen/markdown siguen siendo custom por necesidad real. No conviene reemplazarlos por `Card`, `List`, `ScrollArea` o `AppShell` de Mantine ahora.

### Oportunidades Recomendadas

1. Tema y wrappers antes que mas reemplazos visuales.
   - Mover defaults compartidos de inputs a `Input`/`Input.Wrapper` en `src/mantineTheme.ts`.
   - Usar `theme.components` y Styles API para `Button`, `ActionIcon`, `Badge`, `Tabs`, `Menu`, `Textarea`, `NumberInput`, `Checkbox` y `Kbd`.
   - Reducir overrides como `.settings-window-app .mantine-Input-input`, `.settings-status-strip .mantine-Badge-root`, `.settings-nav .mantine-Tabs-tabLabel` y `.script-actions .mantine-Button-root`.

2. Migrar controles simples del picker.
   - `Commands` y `Settings`: `UiButton` o `UiIconButton` con `Tooltip`.
   - Mark visible/all menu: `Checkbox` con `indeterminate` para mixed state, `ActionIcon` para dropdown y `Menu` para opciones.
   - Item menu button: `ActionIcon` con `Menu` y `Menu.Item`, preservando `withinPortal`, `onMouseDown preventDefault`, coordenadas o posicionamiento por target.
   - Acciones peligrosas: `Menu.Item color="red"` o wrapper propio, no clase `.danger-action`.

3. Migrar edicion y prompts a Mantine.
   - Edit/batch edit: `Modal` o `Drawer` compuesto, `Textarea`, `TextInput`, `Button`, `Group`, `Stack`.
   - UI host confirm/input: `Paper`/`Box`, `TextInput`, `Button`, `Group`, `FocusTrap` si el flujo lo necesita. Puede mantener ventana Tauri propia.
   - Empty/error states: `Alert`, `Text`, `Badge`, `Skeleton`/`Loader` donde corresponda.

4. Command palette.
   - Primera opcion: mantener la logica local y reemplazar shell visual con `Modal`, `TextInput`, `ScrollArea`, `UnstyledButton`, `Badge` y `Kbd`.
   - Segunda opcion, si se acepta una dependencia nueva: evaluar `@mantine/spotlight` para command palette real. No instalar hasta revisar bundle, control de acciones, shortcuts y encaje con Tauri.

5. Toasts/notifications.
   - `@mantine/notifications` sirve para toasts dentro de una ventana React, pero no para elegir monitor fuera de esa ventana.
   - Para Copicu, mantener `notifications` window custom si la posicion/ventana auxiliar sigue siendo especifica de Tauri.

6. Appearance y temas.
   - `mode + themeId` ya existe y el catalogo permite N presets.
   - Se usa `data-theme`, `data-theme-id`, `data-mantine-color-scheme` y variables runtime desde `themeCatalog.ts`.
   - Considerar `cssVariablesResolver` solo para exponer variables adicionales que deban ser generadas por MantineProvider.

### No Migrar Todavia

- `history-feed-scroll` y `history-feed`: TanStack virtualizer necesita control directo de height, transform, keys y measurement.
- `feed-item` como contenedor completo: la fila mezcla preview rich, seleccion, multi-seleccion, marca, menu flotante y eventos de teclado/mouse muy especificos.
- `MarkdownPreview`, `image-preview`, checkerboard y medicion de imagenes.
- Posicionamiento de ventanas Tauri, frame transparente y picker panel.

### Orden De Implementacion Propuesto

1. `src/ui/controls.tsx` o similar: extraer `UiButton`, `UiIconButton`, `UiTextInput`, `UiSelect`, `UiSwitch`, sumar `UiTextarea`, `UiCheckbox`, `UiMenuItem`, `UiKbd`.
2. `src/mantineTheme.ts`: mover defaults compartidos y variantes Copicu. Borrar overrides globales Mantine de Settings cuando ya no hagan falta.
3. Migrar top row del picker y menus de item/mark a Mantine con visual checks desktop/narrow.
4. Migrar edit/batch edit y ui-host a Mantine.
5. Separar `theme` de `themeId` y crear presets built-in. Aplicado 2026-06-06.
6. Extraer infraestructura N-theme a `src/themeCatalog.ts`. Aplicado 2026-06-06.
7. Decidir si command palette sigue local con componentes Mantine o pasa a `@mantine/spotlight`.
8. Mantener toast custom por ventana Tauri; no sumar `@mantine/notifications` mientras haga falta posicionamiento multi-monitor.

## Fuentes

- Mantine setup con Vite: `MantineProvider` + import de `@mantine/core/styles.css`.
- Mantine theming: `createTheme`, `theme.colors`, `primaryColor`, CSS variables.
- Mantine color schemes: `defaultColorScheme` acepta `light`, `dark` o `auto`.
- Mantine notifications: `Notifications` es componente regular dentro de `MantineProvider`; `position` controla top/bottom/left/right/center dentro del documento.
- Mantine colors generator: existe herramienta/paquete para generar 10 shades, pero la recomendacion oficial advierte revisar contraste y pre-generar cuando sea posible.
- Docs oficiales consultadas 2026-06-06:
  - https://mantine.dev/
  - https://mantine.dev/theming/color-schemes/
  - https://mantine.dev/styles/css-variables/
  - https://mantine.dev/styles/styles-api/
  - https://mantine.dev/theming/colors/
  - https://mantine.dev/colors-generator/
  - https://mantine.dev/x/notifications/
  - https://mantine.dev/changelog/9-3-0/
