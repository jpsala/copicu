---
id: ui-surface-architecture
status: active
kind: how-to
triggers:
  - UI architecture
  - surface architecture
  - ventanas
  - picker
  - settings
  - editor
  - Mantine
  - impeccable
primary_refs:
  - docs/topics/window-state-and-monitor-policy.md
  - docs/topics/ui-rethink.md
  - docs/topics/custom-window-system.md
  - docs/topics/mantine-ui-system.md
  - docs/topics/ui-design-and-impeccable.md
  - docs/active-work/010-ui-rethink.md
  - src/main.tsx
  - src/styles.css
  - src/mantineTheme.ts
  - src/themeCatalog.ts
  - src-tauri/src/lib.rs
---

# UI Surface Architecture

Contrato operativo para tocar UI en Copicu.

## Regla Corta

Antes de cambiar UI, abrir:

1. `docs/topics/ui-surface-architecture.md`
2. `docs/topics/ui-rethink.md`
3. `docs/topics/mantine-ui-system.md`
4. `docs/topics/ui-design-and-impeccable.md`
5. `docs/active-work/010-ui-rethink.md`

Si el cambio toca picker o seleccion, abrir tambien `docs/topics/picker-interaction.md`.

Si el cambio toca `decorations`, `transparent`, frameless/custom titlebar, drag regions o window chrome, abrir tambien `docs/topics/custom-window-system.md`.

Si el cambio toca scripts/prompts/toasts, abrir tambien `docs/active-work/009-ui-host-custom-surface.md`.

## Modelo De Superficies

| Superficie | Rol | Regla |
| --- | --- | --- |
| Picker rapido | Buscar, preview, copiar/pegar | Mantener custom, compacto, keyboard-first y virtualizado. No convertirlo en app shell. |
| Settings | Configuracion durable | Ventana Tauri standalone label `settings`, Mantine-first. No overlay dentro del picker. |
| Command mode | Ejecutar acciones rapidas | Puede vivir como modo del picker, pero no como modal pesado ni ventana simulada dentro de otra. |
| Item editor | Editar contenido/metadata | Pendiente de decision: inline limitado o inspector/window standalone. No agrandar el picker por defecto. |
| UI host | Toast, confirm, input de scripts | Ventana auxiliar `ui-host` con request/response IDs. |
| Notifications | Toasts no bloqueantes | Ventana auxiliar liviana; no usar para prompts ricos. |
| History manager futuro | Revision larga, colecciones, bulk | Ventana task-oriented separada del quick picker. |

## Stack UI Vigente

- React + Vite para frontend.
- Tauri windows por label para superficies separadas.
- Mantine para controles comunes y superficies de configuracion.
- CSS custom para picker/feed principal, virtualizacion, previews rich y layout especializado.
- `src/mantineTheme.ts` como tema Mantine base y defaults de componentes.
- `src/themeCatalog.ts` como fuente de verdad de Appearance: `theme` (`system | light | dark`), `themeId`, presets N, paletas Mantine y tokens Copicu.
- `src/styles.css` mantiene defaults/fallback y layout custom; los presets no deben duplicarse como bloques CSS por tema.

## Que Usar

Usar Mantine primero para:

- `Button`
- `ActionIcon`
- `TextInput`
- `Select`
- `Switch`
- `Menu`
- `Tabs`
- badges, popovers, tooltips y controles de Settings/futuras preferencias.

Usar wrappers locales cuando el control se repite o necesita defaults Copicu:

- `UiButton`
- `UiIconButton`
- `UiTextInput`
- `UiTextarea`
- `UiNumberInput`
- `UiSelect`
- `UiSwitch`
- `UiCheckbox`
- `UiBadge`
- `UiKbd`
- `UiAlert`
- `UiPaper`
- `UiTooltip`
- `UiLoader`

Los wrappers viven en `src/ui/controls.tsx`. No crear estilos Mantine ad hoc por superficie si el control va a repetirse.

Mantener custom por ahora:

- feed principal del picker;
- filas virtualizadas;
- previews de texto/codigo/Markdown/imagenes;
- seleccion por id;
- menus de item si el cambio puede romper portal + virtualizacion.

## Ventanas Tauri

Reglas:

- Cada superficie standalone debe tener label estable.
- Crear/mostrar/cerrar ventanas desde comandos Rust cuando la accion sea propia de la app.
- Agregar el label a `src-tauri/capabilities/default.json` si la ventana necesita permisos frontend.
- En frontend, rutear por `getCurrentWindow().label`; en dev se permite `?window=<label>` para visual checks.
- No usar overlays internos para representar ventanas durables.

Labels actuales:

- `main`: picker rapido.
- `settings`: Settings standalone.
- `ui-host`: prompts de scripts.
- `notifications`: toast stack auxiliar.

Para ventanas custom, seguir `docs/topics/custom-window-system.md`: custom chrome compartido por composicion, `main` y `settings` ya usan superficies solidas frameless, y se evita `transparent: true` como default de dogfood.
Para resize y persistencia de posicion/tamano, seguir `docs/topics/window-state-and-monitor-policy.md`: la politica nativa vive en `src-tauri/src/window_state.rs`, y los handles visuales de resize viven en `CustomWindowFrame`.

Contrato vigente de chrome custom:

- Base frontend compartida: `CustomWindowFrame`, `WindowDragStrip`, `WindowControls`, `windowChrome.ts` y `windowVariants.ts`.
- `pin` comun significa solo `always-on-top`; efectos laterales por superficie quedan afuera del componente base.
- En `main`, pinned suspende `hide-on-focus-lost` desde Rust. No copiar esa regla a otras ventanas salvo decision explicita.
- `settings` usa variante `document`: close real, skip taskbar falso, sin pin ni hide especial.
- `main`, `settings` y `ai-output` guardan bounds por monitor; `ui-host`, `notifications` y `whichkey` son opt-out por ahora.
- Las ventanas pueden adoptar la base visual sin cambiar aun su ventana fisica a frameless; la migracion real requiere ajustar Tauri config/capabilities por label.

Nota vigente: `@mantine/notifications` no reemplaza la ventana `notifications` cuando hace falta elegir monitor/posicion por Tauri; Mantine posiciona dentro del documento de la WebView.

## Checks Obligatorios

Para cambio UI normal:

```powershell
npm run build
npm run visual:check
```

Si se agregan comandos Rust o ventanas Tauri:

```powershell
cd src-tauri
$env:CARGO_TARGET_DIR='target-codex-check'; cargo check
```

Si `npm run rust:test` falla con `STATUS_ENTRYPOINT_NOT_FOUND`, anotarlo como el problema de loader ya conocido; no confundirlo con fallo de compilacion si `cargo check` paso.

Si la ventana principal queda vacia en dev tras instalar/cambiar deps:

- revisar CDP/console si esta disponible;
- causa conocida: Vite puede responder `504 Outdated Optimize Dep` para `node_modules/.vite/deps`;
- recargar la WebView o reiniciar `npm run tauri:dev`;
- si se repite, limpiar cache de Vite o reiniciar Vite antes de buscar bugs de React.

## Documentacion A Actualizar

Cuando se toca UI:

- `docs/active-work/010-ui-rethink.md` para estado vivo del corte.
- `docs/topics/ui-rethink.md` si cambia el modelo de superficies, temas o direccion visual.
- `docs/topics/mantine-ui-system.md` si cambia uso de Mantine/wrappers/theme.
- `docs/topics/ui-design-and-impeccable.md` si cambia el workflow de QA/polish.
- `docs/WORKING_MEMORY.md` solo para una linea corta de estado operativo.

No duplicar historia larga. Guardar decisiones y proximo paso concreto.
