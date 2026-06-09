---
id: 011-mantine-component-migration
status: active-next-theme-contrast-polish
updated: 2026-06-06
---

# 011 Mantine Component Migration

Trabajo vivo para reducir CSS propio y migrar controles comunes de Copicu a Mantine sin romper el picker rapido, virtualizado y keyboard-first.

## Contexto

Fuentes obligatorias para retomar:

- `docs/topics/ui-surface-architecture.md`
- `docs/topics/mantine-ui-system.md`
- `docs/topics/ui-design-and-impeccable.md`
- `docs/active-work/010-ui-rethink.md`
- `src/main.tsx`
- `src/styles.css`
- `src/mantineTheme.ts`
- `src/themeCatalog.ts`

Estado actual:

- Mantine ya esta instalado y cableado en `main.tsx`.
- Settings standalone ya usa `Button`, `ActionIcon`, `TextInput`, `Select`, `Switch`, `Menu`, `Tabs` y `Badge`.
- Los wrappers actuales viven en `src/ui/controls.tsx`.
- Cortes 1 a 5 implementados: wrappers/tema base, Settings cleanup, picker top row/mark menu, item menus/checks y command palette.
- `lucide-react` esta instalado para iconos de controles y menus.
- Ajuste mark control 2026-06-06: el control global de marcados usa estados tipo checkbox Google (`unchecked`, `checked`, `mixed`) dibujados por CSS, sin icono punteado; el contador junto al control muestra total global de items marcados via `count_marked_history_items`, no cantidad filtrada.
- El picker/feed principal sigue custom por virtualizacion, previews rich, seleccion por id y medicion dinamica.
- Corte 6 aplicado: edit/batch edit y `ui-host` usan wrappers Mantine (`UiPaper`, `UiTextarea`, `UiTextInput`, `UiButton`, `UiAlert`) manteniendo clases/selectores y comportamiento de foco/submit.
- Appearance ahora separa `theme` (`system | light | dark`) de `themeId`; `themeCatalog.ts` define los presets N, aplica tokens Copicu/Mantine y mantiene compatibilidad serde para settings viejos.
- Mantine Notifications queda descartado para posicionamiento multi-monitor: renderiza dentro de una ventana React; Copicu mantiene ventana Tauri `notifications`.
- Theme infra ahora vive en `src/themeCatalog.ts`; permite N presets desde un catalogo central y alimenta CSS variables Copicu + variables primarias Mantine.
- Temas built-in actuales: Default, Graphite, Code, High contrast, Midnight, Blueprint, Moss y Rose.
- Lo pendiente de mayor valor es revisar contraste/polish de presets y decidir si hace falta preview compacta en Settings.
- Ultimos checks: `npm run build`, `npm run visual:check` 52/52 y `cargo check` pasan. `npm run rust:test` compila pero el binario de tests falla al arrancar con `STATUS_ENTRYPOINT_NOT_FOUND` conocido.

## Objetivo

Crear un sistema Mantine-first para controles comunes:

- menos CSS manual para botones, inputs, menus, dialogs, badges, estados y prompts;
- wrappers locales reutilizables con defaults Copicu;
- tema Mantine alineado con tokens propios;
- migracion por superficie, con checks visuales por corte;
- preservar keyboard behavior, virtual scroll, foco, portales y ventanas Tauri.

## No Objetivos

- No migrar el feed virtualizado completo a componentes Mantine.
- No reemplazar TanStack Virtual.
- No convertir el picker en `AppShell`, dashboard o layout de cards.
- No instalar extensiones Mantine nuevas (`@mantine/spotlight`, `@mantine/notifications`, `@mantine/form`) sin decision explicita.
- No cambiar logica durable de clipboard, history, scripts o host API en este trabajo salvo que sea necesario para mantener UI.

## Principios

- Mantine primero para controles comunes, Settings y superficies auxiliares.
- Custom por ahora para feed virtualizado, previews rich, checkerboard de imagenes, seleccion por id y panel rapido del picker.
- Un wrapper local cuando el componente se repite o necesita defaults Copicu.
- Preferir `theme.components`, Styles API y CSS variables sobre overrides globales `.mantine-*`.
- Cada corte debe conservar navegacion por teclado y no resetear scroll manual.
- Usar datos sinteticos en pruebas y screenshots.

## Inventario Exhaustivo

### A. Setup, wrappers y tema

- [x] Crear modulo `src/ui/controls.tsx` o `src/ui/mantineControls.tsx`.
- [x] Mover desde `src/main.tsx`:
  - [x] `UiButton`
  - [x] `UiIconButton`
  - [x] `UiTextInput`
  - [x] `UiSelect`
  - [x] `UiSwitch`
- [ ] Crear wrappers faltantes:
  - [x] `UiTextarea`
  - [x] `UiNumberInput`
  - [x] `UiCheckbox`
  - [ ] `UiMenu`
  - [ ] `UiMenuItem`
  - [x] `UiBadge`
  - [x] `UiKbd`
  - [x] `UiAlert`
  - [x] `UiLoader`
  - [x] `UiTooltip`
- [ ] Revisar si conviene wrapper para `Modal`, `Drawer`, `Popover`, `FocusTrap`, `ScrollArea`.
- [x] Agregar wrapper para `UnstyledButton`.
- [x] Actualizar imports de `src/main.tsx` para consumir wrappers.
- [x] Mantener tipos TypeScript sin `any` innecesario.
- [x] Mover defaults compartidos a `src/mantineTheme.ts`:
  - [x] `Input`
  - [x] `Input.Wrapper`
  - [x] `Button`
  - [x] `ActionIcon`
  - [x] `TextInput`
  - [x] `Textarea`
  - [x] `NumberInput`
  - [x] `Select`
  - [x] `Switch`
  - [x] `Checkbox`
  - [x] `Menu`
  - [x] `Badge`
  - [x] `Tabs`
  - [x] `Tooltip`
  - [x] `Kbd` si aplica
- [ ] Crear variantes Copicu si hacen falta:
  - [ ] compact default button
  - [ ] subtle toolbar button
  - [ ] danger menu item
  - [ ] status badge
  - [ ] read-only badge
  - [ ] picker action icon
- [ ] Reducir overrides globales:
  - [x] `.settings-window-app .mantine-InputWrapper-label`
  - [x] `.settings-window-app .mantine-Input-input`
  - [ ] `.settings-window-app .mantine-Input-input:focus`
  - [x] `.settings-status-strip .mantine-Badge-root`
  - [x] `.settings-nav .mantine-Tabs-tabLabel`
  - [x] `.script-actions .mantine-Button-root`
- [x] Evaluar `cssVariablesResolver` para sincronizar tokens Copicu con Mantine.
- [x] Confirmar `defaultColorScheme`, `data-mantine-color-scheme` y settings persistidas en SQLite.

### B. Settings cleanup

- [x] Mantener `SettingsWindowApp` standalone.
- [x] Reemplazar clases custom de controls por wrappers nuevos.
- [x] Reemplazar `ReadOnlyStatus` con `UiBadge` o wrapper equivalente.
- [x] Revisar `settings-status-strip` para depender menos de CSS propio.
- [x] Revisar `settings-nav` para usar props/Styles API de `Tabs` en vez de selectores globales.
- [ ] Revisar `SettingRow` para decidir si queda custom layout o se apoya en `Fieldset`, `Group`, `Stack`, `Box`.
- [x] Migrar `Retention count` de `TextInput type="number"` a `NumberInput`.
- [x] Mantener search settings con `TextInput` y clear action accesible.
- [x] Confirmar responsive narrow 420px.
- [x] Confirmar foco inicial y Escape para cerrar/cancelar.

### C. Picker top row

- [x] Reemplazar input nativo de search por `TextInput` o wrapper compatible.
- [x] Preservar:
  - [x] `ref={searchRef}`
  - [x] `aria-controls`
  - [x] `aria-activedescendant`
  - [x] placeholder actual
  - [x] title/help de query syntax
  - [x] todos los handlers de teclado existentes
  - [x] foco tras abrir picker
- [x] Reemplazar boton `Commands` por `UiButton` o `UiIconButton` con `Tooltip`.
- [x] Reemplazar boton `Settings` por `UiButton` o `UiIconButton` con `Tooltip`.
- [x] Reemplazar `LoadingSpinner` del status por `Loader` o wrapper `UiLoader`.
- [x] Revisar `search-status` como `Badge`, `Text` o custom liviano.
- [x] Validar narrow viewport donde status se oculta.

### D. Mark controls

- [x] Reemplazar `mark-toggle-button` por `Checkbox` o `ActionIcon` + visual de checkbox.
- [x] Soportar estado checked, unchecked y mixed/indeterminate.
- [x] Preservar `role="checkbox"` o semantica accesible equivalente.
- [x] Preservar disabled cuando `history.length === 0`.
- [x] Preservar `onMouseDown preventDefault` para no robar foco del search.
- [x] Reemplazar `mark-menu-button` por `ActionIcon`.
- [x] Reemplazar mark menu custom por `Menu` con `withinPortal`.
- [x] Mantener acciones:
  - [x] All
  - [x] None
  - [x] All results
  - [x] None results
  - [x] Marked
  - [x] Unmarked
  - [x] All history
- [x] Confirmar que el menu no queda cortado por overflow del picker.
- [x] Agregar iconos consistentes al mark menu.
- [x] Agregar visual checks para check principal, check por item y mark menu.

### E. Item row actions y menus

- [x] Mantener `feed-item` custom.
- [x] Mantener `item-mark-button` custom o migrarlo a `Checkbox` solo si no rompe posicion/row measurement.
- [x] Reemplazar `item-menu-button` por `ActionIcon`.
- [x] Reemplazar `item-menu` custom por componentes Mantine compatibles.
- [x] Preservar portal por rows virtualizadas.
- [x] Preservar click derecho/context menu.
- [x] Preservar `onMouseDown preventDefault` para no perder foco del search.
- [x] Preservar multi-selection actions:
  - [x] Join selected
  - [x] script actions compatibles
  - [x] Add metadata to N
  - [x] Delete N items
  - [x] Clear selection
- [x] Preservar single-item actions:
  - [x] Activate
  - [x] Paste
  - [x] Paste plain
  - [x] Open URL
  - [x] script actions compatibles
  - [x] Edit
  - [x] Edit metadata
  - [x] Delete
- [x] Usar `Menu.Item color="red"` o wrapper danger para delete.
- [x] Usar `Kbd` para shortcuts de script actions.
- [x] Confirmar que menu se posiciona bien cerca de rows transformadas.
- [x] Confirmar scroll manual no se resetea al abrir/cerrar menu.

Nota 2026-06-06: Mantine `Menu` no preservo bien el anclaje por coordenadas sobre filas virtualizadas. Se mantuvo el portal/fixed positioning propio y se migro la visual/interaccion interna a wrappers Mantine (`UiPaper`, `UiUnstyledButton`, `UiKbd`) con iconos `lucide-react`.

### F. Command palette

- [x] Mantener command palette local en primer corte.
- [x] Reemplazar backdrop/panel con `Modal` compuesto, `Portal` o custom shell con Mantine primitives.
- [x] Reemplazar input por `TextInput`.
- [x] Reemplazar result buttons por `UnstyledButton` con estilos via wrapper/clase local.
- [x] Reemplazar badges con `Badge` y shortcuts con `Kbd`.
- [x] Reemplazar empty state por `Alert`, `Text` o wrapper.
- [x] Preservar:
  - [x] `Ctrl+K`
  - [x] Escape cancel
  - [x] ArrowUp/ArrowDown
  - [x] Enter run action
  - [x] active descendant semantics
  - [x] focus inicial
  - [x] filtering local actual
- [ ] Evaluar `@mantine/spotlight` en documento separado antes de instalar:
  - [ ] bundle impact
  - [ ] control de trigger y actions
  - [ ] keyboard behavior
  - [ ] Tauri window/focus behavior
  - [ ] styling y density

### G. Edit y batch metadata

- [ ] Reemplazar `edit-backdrop`/`edit-panel` por `Modal` o `Drawer` compuesto.
- [ ] Mantener decision pendiente: editor inline limitado vs ventana/inspector standalone.
- [ ] Si se mantiene dentro del picker temporalmente, no agrandar flujo default.
- [x] Reemplazar textareas por `Textarea`.
- [x] Reemplazar botones por `UiButton`.
- [x] Reemplazar errores por `Alert`.
- [x] Preservar:
  - [x] Escape cancela y devuelve foco al search
  - [x] F2 guarda
  - [x] Ctrl+Enter guarda
  - [x] autofocus via `editTextRef`
  - [x] edit content
  - [x] edit metadata
  - [x] batch append metadata
- [x] Confirmar texto largo, multilinea y palabras sin espacios.
- [x] Confirmar responsive narrow.

### H. UI host confirm/input

- [ ] Mantener ventana Tauri `ui-host`.
- [x] Migrar panel a `Paper`/`Box`/`Stack` o wrappers.
- [x] Migrar input a `TextInput`.
- [x] Migrar botones a `UiButton`.
- [ ] Agregar `FocusTrap` si mejora confirm/input sin romper Tauri.
- [x] Preservar:
  - [x] request/response IDs
  - [x] Enter submit
  - [x] Escape cancel
  - [x] timeouts
  - [x] resolve via `resolve_ui_host_request`
  - [x] capabilities `ui:confirm` y `ui:input`
- [x] Validar que la ventana no muestre fondo opaco accidental.

### I. Toasts y notifications

- [x] Decidir si toasts quedan custom por ventana Tauri o si se suma `@mantine/notifications`.
- [ ] Si quedan custom:
  - [ ] migrar dismiss button a `ActionIcon` o `CloseButton`;
  - [ ] migrar tones a tokens/theme;
  - [ ] revisar `ToastStack` como componente reusable;
  - [ ] mantener posicion por ventana.
- [ ] Si se evalua `@mantine/notifications`:
  - [x] documentar dependencia nueva;
  - [x] revisar compatibilidad con ventana `notifications`;
  - [ ] revisar API para show/update/hide desde runner;
  - [ ] revisar estilos/density;
  - [ ] validar que no capture payload real en logs.

Decision 2026-06-06: no usar `@mantine/notifications` para toasts principales mientras haga falta controlar monitor/posicion por Tauri. Mantine `position` aplica dentro del documento React, no fuera de la ventana.

### J. Empty, error, loading y status states

- [ ] Reemplazar `error-text` donde corresponda por `Alert`.
- [ ] Reemplazar spinners custom por `Loader` salvo casos donde el size custom sea esencial.
- [ ] Reemplazar empty states simples por wrappers Mantine (`Alert`, `Text`, `Paper`/`Box`) sin sumar copy explicativa excesiva.
- [ ] Reemplazar status pills manuales por `Badge`.
- [ ] Revisar `kbd` global y migrar a `Kbd` o wrapper `UiKbd`.
- [ ] Mantener copy compacto, orientado a usuarios expertos.

### K. CSS cleanup

- [ ] Borrar CSS muerto tras cada migracion.
- [ ] Mantener CSS propio solo para:
  - [ ] picker frame/panel;
  - [ ] virtual list;
  - [ ] feed item layout;
  - [ ] preview text/code;
  - [ ] markdown image sequence;
  - [ ] image checkerboard;
  - [ ] row selected/multi-selected states;
  - [ ] window-specific transparent backgrounds;
  - [ ] responsive structure cuando Mantine no alcance.
- [ ] Revisar que no queden estilos globales genericos que afecten Mantine accidentalmente.
- [ ] Revisar contrastes despues de cambios de theme.
- [ ] Revisar reduced motion.
- [ ] Revisar `z-index` para Menu, Modal, Toast, Tooltip.

### L. Appearance y temas

- [x] Separar conceptualmente:
  - [x] `mode`: `system | light | dark`
  - [x] `themeId`: preset visual
- [x] Definir presets built-in iniciales:
  - [x] Default
  - [x] High Contrast
  - [x] Graphite
  - [x] Code
  - [x] Midnight
  - [x] Blueprint
  - [x] Moss
  - [x] Rose
- [x] Mapear presets a:
  - [x] CSS variables Copicu
  - [x] Mantine `theme.colors`
  - [x] Mantine `primaryColor`
  - [x] `data-theme` existente si se mantiene
  - [x] `data-mantine-color-scheme`
- [x] Decidir storage schema para `themeId`.
- [x] Actualizar Settings Appearance.
- [ ] Crear preview compacta de tema si suma valor.
- [ ] No agregar import/export theme hasta cerrar presets.

### M. Iconos

- [x] Decidir dependencia de iconos antes de migrar demasiados botones.
- [x] Opcion recomendada por reglas UI: `lucide-react`.
- [x] Si se instala:
  - [x] actualizar `package.json`;
  - [x] usar iconos en `ActionIcon`;
  - [x] reemplazar texto `...`, `v` y glyphs sueltos en mark/item menus.
  - [x] agregar tooltips en iconos no obvios donde aplica.
  - [x] correr build/visual checks.
- [ ] Si no se instala:
  - [ ] mantener labels de texto o glyphs actuales;
  - [ ] no dibujar SVG custom salvo necesidad real.

### N. Validacion

- [x] `npm run build`
- [x] `npm run visual:check`
- [ ] Si se tocan ventanas/comandos Rust:
  - [ ] `cd src-tauri`
  - [ ] `$env:CARGO_TARGET_DIR='target-codex-check'; cargo check`
- [ ] Si aplica:
  - [ ] `npm run rust:test`
  - [ ] registrar si falla por `STATUS_ENTRYPOINT_NOT_FOUND` conocido
- [ ] Visual checks minimos:
  - [x] picker desktop 900x620
  - [x] picker narrow 420x620
  - [x] settings standalone
  - [x] command palette
  - [x] edit dialog/batch edit
  - [x] ui-host confirm/input
  - [x] item menu sobre lista virtualizada
  - [x] mark menu
  - [x] dark mode
  - [x] light mode
- [ ] Manual behavior checks:
  - [ ] open picker shortcut
  - [ ] search typing
  - [ ] ArrowUp/ArrowDown/Home/End/PageUp/PageDown
  - [ ] Enter activation
  - [ ] Shift+Enter paste
  - [ ] Escape clear/hide
  - [ ] Ctrl+K command palette
  - [ ] right click item menu
  - [ ] multi-select item actions
  - [ ] edit save/cancel
  - [ ] settings save/cancel
  - [ ] no horizontal overflow
  - [ ] no scroll reset on refresh

## Cortes Recomendados

### Corte 1: wrappers y tema base

Aplicado 2026-06-06.

- [x] Crear modulo de wrappers.
- [x] Mover wrappers actuales.
- [x] Agregar wrappers faltantes minimos.
- [x] Mover defaults compartidos a `mantineTheme.ts`.
- [x] Reducir overrides Mantine de Settings donde sea seguro.
- [x] Checks: `npm run build`, `npm run visual:check`.

### Corte 2: Settings cleanup

Aplicado 2026-06-06.

- [x] Usar wrappers nuevos en Settings.
- [x] Cambiar `Retention count` a `NumberInput`.
- [x] Reemplazar readonly/status badges con wrapper.
- [x] Ajustar tabs/input/badge via theme o props.
- [x] Checks visuales Settings desktop/narrow.

### Corte 3: picker top row y mark menu

Aplicado 2026-06-06, antes del cleanup completo de Settings.

- [x] Migrar search input, command/settings buttons, loader/status si conviene.
- [x] Migrar mark control y mark menu.
- [x] Verificar teclado, foco y viewport narrow.

### Corte 4: item menus

Aplicado 2026-06-06.

- [x] Migrar item action button y menu a Mantine.
- [x] Mantener feed row custom.
- [x] Verificar portal, virtual scroll, context menu, multi-selection y danger actions.
- [x] Agregar iconos a acciones de item menu.

### Corte 5: command palette

Aplicado 2026-06-06.

- [x] Mantener logica local.
- [x] Migrar shell visual a Mantine primitives.
- [x] Migrar input, badges y shortcuts a wrappers Mantine.
- [x] Migrar result buttons y empty state.
- [ ] Evaluar `@mantine/spotlight` solo despues.

### Corte 6: edit, batch edit, ui-host y theme presets

Aplicado 2026-06-06.

- Migrar dialogs/prompts a Mantine primitives.
- Confirmar si editor grande queda inline temporal o pasa a ventana/inspector standalone.
- Separar Appearance `theme` de `themeId`.
- Agregar presets built-in iniciales: Default, Graphite, Code, High contrast.
- Checks: `npm run build`, `npm run visual:check`, `cargo check`.

### Corte 7: toasts y notification decision

Aplicado 2026-06-06 para la decision arquitectonica.

- Mantener custom con wrappers.
- No usar `@mantine/notifications` para toasts principales porque no resuelve monitor/ventana.
- Proximo corte posible: migrar `ToastStack` internamente a wrappers/tokens sin cambiar ventana Tauri.

### Corte 8: theme polish

- Infraestructura N-theme aplicada 2026-06-06.
- Presets built-in actuales: Default, Graphite, Code, High contrast, Midnight, Blueprint, Moss y Rose.
- Revisar si conviene `cssVariablesResolver` para variables Mantine adicionales; por ahora `themeCatalog.ts` aplica tokens y primarias.
- Agregar preview compacta de tema si realmente ayuda en Settings.
- Revisar contraste de presets con capturas desktop/narrow.

## Riesgos

- Mantine `Menu` dentro de rows virtualizadas puede romper posicionamiento si no queda en portal o si depende de un target transformado.
- `TextInput` del search puede cambiar foco, DOM o keyboard behavior.
- `Modal` puede atrapar foco de forma distinta al flujo actual del picker.
- Overrides globales `.mantine-*` pueden crear efectos colaterales entre ventanas.
- Cambiar theme/color scheme puede desincronizar `data-theme` y `data-mantine-color-scheme`.
- Instalar extensiones Mantine puede agrandar bundle o introducir APIs que no encajan con Tauri windows.

## Proximo Paso Inmediato

Task retomable:

1. Hacer theme polish: revisar contraste de los 8 presets, especialmente Moss/Rose en dark y High contrast en light.
2. Decidir si Settings necesita preview compacta de preset o si el select alcanza para dogfood.
3. Migrar `ToastStack` a wrappers/tokens manteniendo ventana Tauri `notifications`.
4. No migrar feed virtualizado, previews rich, medicion de filas, seleccion por id ni frame del picker.
5. Cerrar con `npm run build`, `npm run visual:check` y `cargo check` si se tocan settings Rust.
