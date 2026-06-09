---
id: settings-design
status: first-slice-implemented
priority: 1
updated: 2026-06-06
---

# Settings Design

Diseñar la superficie de settings antes de seguir agregando opciones sueltas.

## Decisión

Vamos a tener settings completos. No queremos una ventana de preferencias gigante ni constantes hardcodeadas dispersas.

Los settings deben ser:

- buscables;
- versionados;
- validados por el host;
- exportables;
- extensibles para actions/plugins;
- simples de usar en una app local keyboard-first.

## Preguntas A Resolver

- Dónde vive la configuración: SQLite, archivo JSON/TOML, o híbrido.
- Cómo se migran settings entre versiones.
- Cómo se definen defaults.
- Cómo una action/plugin declara settings propios.
- Cómo se muestran settings avanzados sin ensuciar la UI principal.
- Cómo separar dev profile, installed profile y potencial portable mode.

## Secciones Candidatas

- General.
- Picker.
- Clipboard capture.
- Paste behavior.
- History/storage.
- Actions/scripting.
- Privacy.
- Appearance.
- Advanced/debug.

## Primer Corte Implementable

- Storage mínimo de settings.
- Comandos host `get_settings`, `update_settings`.
- UI inicial searchable o panel simple.
- Settings iniciales:
  - global shortcut;
  - hide-on-focus-lost;
  - acción de `Enter`: copy o paste;
  - retention count;
  - theme: system/light/dark.

## Notas De Diseño

Evaluar usar el flujo/skill de diseño que viene dando buen resultado, aunque la app sea local y no un sitio público. El objetivo es diseñar una superficie útil, no una landing ni una pantalla promocional.

## Done Cuando

- Existe spec o plan claro de settings. Hecho: `specs/003-settings-foundation/spec.md`.
- Está decidida la persistencia. Hecho: SQLite `app_settings`, una fila JSON typed versionada para settings core.
- Hay primer slice implementable sin bloquear virtual list/history. Hecho: `get_settings`, `update_settings`, UI searchable standalone, theme/mode, theme preset, Enter action, hide-on-focus-lost y retention count.

## Implementado 2026-06-05

- Settings typed `AppSettings` schema v1 en Rust.
- Defaults validados por host:
  - shortcut global;
  - hide-on-focus-lost;
  - accion de `Enter`;
  - retention count;
  - theme.
- Persistencia en SQLite `app_settings`.
- UI de settings searchable inicial.
- Wiring inicial:
  - `theme` aplica con `data-theme`;
  - `Enter` usa copy o paste segun setting;
  - `Shift+Enter` usa la alternativa;
  - blur-hide se consulta en backend;
- pruning usa `retentionCount`.

## Actualizado 2026-06-06

- Settings salio del picker y ahora vive en ventana Tauri standalone label `settings`, abierta por `open_settings_window`.
- Appearance separa `theme` (`system`/`light`/`dark`) de `themeId`.
- `themeCatalog.ts` define presets built-in y alimenta tokens CSS/Mantine.
- La UI usa wrappers Mantine locales para controles comunes.
- Guardar Settings emite evento de actualización para refrescar comportamiento/tema en la ventana principal.

## Siguiente Corte

- Hot reload de global shortcut.
- Export/import JSON de settings.
- Settings de paste delay/failure policy.
- Profiles dev/installed/portable.
