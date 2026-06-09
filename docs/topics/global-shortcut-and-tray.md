---
id: global-shortcut-and-tray
status: active
kind: reference
triggers:
  - global shortcut
  - shortcut global
  - hotkey
  - tray
  - system tray
  - background app
primary_refs:
  - specs/001-mvp0-native-spike/spec.md
  - specs/001-mvp0-native-spike/research.md
---

# Global Shortcut And Tray

Topic para shortcut global, tray y lifecycle de ventana/background.

## Necesidad MVP 0

La app debe vivir en background/tray, abrir picker con shortcut global y permitir show/hide/quit desde tray.

## Opciones A Evaluar

| Necesidad | Opcion | Estado |
| --- | --- | --- |
| Global shortcut | `tauri-plugin-global-shortcut` | Candidato principal. |
| Tray | Tauri 2 tray API Rust | Candidato principal. |
| Window lifecycle | Tauri window events + hide/show/focus | Candidato principal. |

## Fuentes Consultadas

- Context7: `/websites/v2_tauri_app`, consulta `Tauri 2 global shortcut plugin register unregister shortcut setup permissions`.
- Context7: `/websites/v2_tauri_app`, consulta `Tauri 2 tray menu system tray setup close hide window`.
- Context7: `/websites/v2_tauri_app`, consulta `Tauri 2 window close event prevent close hide window Rust`.
- Tauri global shortcut reference: https://tauri.app/reference/javascript/global-shortcut/
- Tauri global shortcut plugin: https://v2.tauri.app/plugin/global-shortcut/
- Tauri system tray: https://v2.tauri.app/learn/system-tray/
- Tauri `TrayIconBuilder` docs.rs: https://docs.rs/tauri/latest/tauri/tray/struct.TrayIconBuilder.html
- Tauri plugin permissions: https://v2.tauri.app/learn/security/using-plugin-permissions/

## Hallazgos

- `@tauri-apps/plugin-global-shortcut` registra shortcuts y entrega eventos con estado `Pressed` o `Released`.
- Si otra app ya tomo el shortcut, el handler no se dispara; hay que elegir shortcut razonablemente unico y verificar conflicto.
- Tauri 2 requiere permissions/capabilities explicitas para comandos de plugins.
- El tray se puede crear desde Rust con `TrayIconBuilder`, menu y handlers.
- La API de tray permite mostrar, unminimize y enfocar la ventana desde eventos de icono/menu.
- El plugin de global shortcut tambien tiene API Rust con `tauri_plugin_global_shortcut::GlobalShortcutExt`.
- Si se registra y maneja desde Rust, no hace falta exponer comandos de shortcut al frontend para MVP 0.
- `TrayIconBuilder` esta disponible en desktop con feature `tray-icon`.
- Tauri 2 separa eventos de menu (`on_menu_event`) y eventos del icono (`on_tray_icon_event`).
- `show_menu_on_left_click` reemplaza APIs previas/deprecated para controlar si el menu abre con click izquierdo.
- Validacion parcial Windows 2026-06-05: con Copicu corriendo y ventana oculta, un intento externo de `RegisterHotKey` para `Ctrl+Shift+V` fallo con `ERROR_HOTKEY_ALREADY_REGISTERED` (1409). Este dato solo confirma que la combinacion esta registrada por algun proceso en esa sesion; no reemplaza la prueba de pulsacion fisica ni confirma que el handler de Copicu ejecute `show_main_window`.
- La app loguea `global shortcut registered: <shortcut>` durante setup usando `GlobalShortcutExt::global_shortcut().is_registered(...)`. Ese check verifica el registro segun el plugin, no la entrega del evento.
- Validacion Windows 2026-06-05: se cambio temporalmente a `Ctrl+Shift+,`; el plugin reporto `global shortcut registered: Ctrl+Shift+,`. Con ventana ocultada por el flujo real `WM_CLOSE` -> Tauri `CloseRequested` -> `window.hide()`, una pulsacion fisica disparo `global shortcut pressed` y el HWND principal `Copicu` paso a visible.

## Pattern Recomendado Para MVP 0

- Registrar shortcut desde Rust durante setup con `tauri-plugin-global-shortcut`.
- Manejar solo evento `Pressed` para abrir picker y evitar doble accion en `Released`.
- Usar `Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::Comma)` o string equivalente si la API del scaffold lo vuelve mas simple.
- Empezar con `Ctrl+Shift+,` en Windows como constante validada.
- Agregar permissions de global shortcut solo si se usa API desde frontend; para MVP 0 preferir backend Rust.
- Implementar tray en Rust con menu `Show`, `Hide`, `Quit`.
- En click izquierdo del tray, mostrar/enfocar picker o main window.
- Interceptar close de ventana para hide, no exit.
- Mantener una ruta explicita de quit real desde tray.

## Riesgos

- Conflictos de shortcut pueden fallar silenciosamente desde la perspectiva del usuario.
- `ERROR_HOTKEY_ALREADY_REGISTERED` ayuda a detectar que una combinacion esta ocupada, pero por si solo no identifica con certeza el proceso ni valida el callback de Tauri.
- Focus del picker puede variar si la ventana estaba oculta/minimizada.
- Hay que distinguir hide normal de quit real.
- Si el handler se registra en frontend, hot reload/dev puede duplicar intentos o requerir permisos extra.
- Tray y menu deben crearse una sola vez en setup Rust, no desde React mount.

## Decision Actual

Decision inicial para MVP 0:

- Usar `tauri-plugin-global-shortcut` desde Rust.
- Usar Tauri 2 `TrayIconBuilder` desde Rust.
- No usar API frontend de global shortcut/tray para MVP 0 salvo necesidad concreta.
- Shortcut inicial validado: `Ctrl+Shift+,`, configurable como constante de backend.

## Preguntas Abiertas

- Hace falta detectar y reportar conflicto de shortcut en MVP 0?
- El click izquierdo de tray debe mostrar picker o abrir una ventana de historial normal?
