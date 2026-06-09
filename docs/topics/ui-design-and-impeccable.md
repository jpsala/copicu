---
id: ui-design-and-impeccable
status: active
kind: how-to
triggers:
  - UI
  - visual polish
  - picker
  - settings
  - responsive
  - impeccable
primary_refs:
  - docs/topics/ui-surface-architecture.md
  - docs/topics/ui-rethink.md
  - docs/topics/mantine-ui-system.md
  - docs/topics/picker-interaction.md
  - docs/active-work/001-settings-design.md
---

# UI Design And Impeccable

## Decision

Usar `pbakaus/impeccable` de ahora en adelante para trabajo de UI cuando valga la pena: pantallas nuevas, cambios visuales relevantes, flows interactivos, responsive, overflow, focus states, density, motion y polish final.

No queda como herramienta diferida. Queda como parte del workflow normal de UI junto con Playwright visual checks.

Antes de tocar UI, abrir `docs/topics/ui-surface-architecture.md`. Ese topic define que superficie se esta tocando, si corresponde Mantine o UI custom, que ventanas Tauri existen y que checks correr.

## Workflow UI Obligatorio

1. Identificar superficie: picker, settings, command mode, item editor, `ui-host`, notifications o futuro history manager.
2. Abrir el topic correspondiente:
   - arquitectura general: `docs/topics/ui-surface-architecture.md`;
   - replanteo visual/superficies/temas: `docs/topics/ui-rethink.md`;
   - controles Mantine/tema: `docs/topics/mantine-ui-system.md`;
   - interaccion del picker: `docs/topics/picker-interaction.md`;
   - prompts/toasts/scripts: `docs/active-work/009-ui-host-custom-surface.md`.
3. Decidir si el cambio es Mantine-first o custom:
   - Settings y superficies de configuracion: Mantine-first.
   - Picker/feed/virtual list/previews: custom por defecto.
4. Implementar manteniendo superficies separadas: no crear ventanas simuladas dentro del picker.
5. Validar con `npm run build` y `npm run visual:check`.
6. Si se tocaron ventanas/comandos Rust, correr `cargo check` con target separado si hay procesos dev vivos.
7. Actualizar docs vivos solo con decisiones y estado retomable.

## Cuando Usarlo

- Nueva superficie UI: settings, actions, details/formats, collections, privacy, debug/logs.
- Cambios visuales importantes en picker o feed.
- Virtual list/infinite scroll si cambia layout, medicion, skeletons, loader row o estados vacios.
- Drag & drop si afecta feedback visual, targets, hover, keyboard fallback o estados de seleccion.
- Antes de cerrar una feature UI grande.
- Cuando una pantalla se sienta generica, cargada, inestable, con overflow o poco keyboard-first.

## Cuando No Bloquearse

- Cambios backend-only.
- Specs/docs sin UI.
- Fixes triviales de copy, typo o wiring invisible.
- Hotfixes donde la prioridad sea recuperar funcionalidad.
- Si `impeccable` no esta disponible localmente, dejarlo anotado y seguir con Playwright/manual visual QA.

## Rol En El Workflow

`impeccable` complementa, no reemplaza:

- `npm run visual:check`;
- checks desktop/narrow;
- validacion manual de flows nativos cuando aplique;
- criterio de producto Copicu: herramienta local rapida, discreta y keyboard-first.

La herramienta debe ayudar a detectar problemas visuales y de UX, no empujar la app hacia una landing, UI promocional, decoracion pesada o patrones genericos.

## Criterios Locales

La UI de Copicu debe seguir siendo:

- densa pero legible;
- rapida;
- keyboard-first;
- preview-first;
- sin landing page;
- sin texto explicativo innecesario;
- respetuosa de datos privados del clipboard;
- consistente con CopyQ como baseline funcional, no visual.

## Siguiente Uso Esperado

Aplicarlo en el proximo corte UI relevante:

1. Appearance con `mode + themeId` y presets built-in.
2. Decision de item editor standalone/inline.
3. Auditoria visual de picker, Settings standalone, command palette, editor y `ui-host`.
