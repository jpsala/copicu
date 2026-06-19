---
id: windows-focus-and-paste
status: active
kind: reference
triggers:
  - paste-to-previous-window
  - foco previo
  - previous window
  - SetForegroundWindow
  - SendInput
  - Ctrl+V
primary_refs:
  - specs/001-mvp0-native-spike/spec.md
  - specs/001-mvp0-native-spike/research.md
---

# Windows Focus And Paste

Topic para recordar/restaurar foco previo y pegar el item seleccionado en Windows.

## Necesidad MVP 0

Abrir picker con shortcut global, seleccionar item, volver a la ventana previa y enviar paste.

## Opciones A Evaluar

| Necesidad | Opcion | Estado |
| --- | --- | --- |
| Recordar ventana previa | Win32 `GetForegroundWindow` antes de mostrar picker | Opcion inicial. |
| Restaurar foco | Win32 `SetForegroundWindow` | Opcion inicial con restricciones. |
| Enviar paste | Win32 `SendInput` para `Ctrl+V` | Opcion inicial con restricciones UIPI. |
| Rust bindings | `windows` crate | Opcion inicial. |
| Keyboard abstraction | `enigo` | Fallback solo para input si `SendInput` directo resulta engorroso. |
| Legacy bindings | `winapi` crate | No usar de entrada; `windows` es preferible. |

## Fuentes Consultadas

- Context7: `/microsoft/windows-rs`, consulta `GetForegroundWindow SetForegroundWindow SendInput INPUT KEYBDINPUT Rust windows crate`.
- Context7: `/websites/microsoft_github_io_windows-docs-rs_doc_windows`, consulta `Win32 UI WindowsAndMessaging GetForegroundWindow SetForegroundWindow SendInput`.
- Context7: `/enigo-rs/enigo`, consulta `simulate keyboard key control v Rust Windows`.
- Microsoft Learn `GetForegroundWindow`: https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getforegroundwindow
- Microsoft Learn `SetForegroundWindow`: https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setforegroundwindow
- Microsoft Learn `SendInput`: https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-sendinput
- Microsoft DevBlogs, Raymond Chen on `SetForegroundWindow` async behavior: https://devblogs.microsoft.com/oldnewthing/20161118-00/?p=94745
- windows-rs GitHub: https://github.com/microsoft/windows-rs
- enigo GitHub: https://github.com/enigo-rs/enigo

## Hallazgos

- `GetForegroundWindow` devuelve el handle de la ventana foreground, pero puede devolver `NULL` en ciertas transiciones de activacion.
- Windows restringe que procesos puedan llevar una ventana al foreground.
- Incluso si se cumplen condiciones, `SetForegroundWindow` puede ser denegado.
- Una app no puede forzar foreground arbitrariamente mientras el usuario trabaja en otra ventana.
- El flujo via hotkey puede ayudar porque la app recibe input del usuario, pero debe validarse empiricamente.
- `SetForegroundWindow` puede tener parte asincronica; no asumir que al volver de la llamada la ventana ya esta lista para recibir paste.
- `SendInput` inyecta eventos en serie, pero esta sujeto a UIPI: una app solo puede inyectar input en apps de igual o menor integrity level.
- `SendInput` no resetea el estado actual del teclado; teclas presionadas por el usuario pueden interferir.
- `enigo` puede enviar `Ctrl+V`, pero no resuelve recordar/restaurar la ventana previa.

## Pattern Recomendado Para MVP 0

- Usar `windows` crate con features Win32 necesarias:
  - `Win32_Foundation`
  - `Win32_UI_WindowsAndMessaging`
  - `Win32_UI_Input_KeyboardAndMouse`
- Capturar handle de ventana previa con `GetForegroundWindow` antes de mostrar picker.
- Mantener un tracker liviano de ultimo foreground no propio mientras la app corre; esto cubre casos donde un comando IPC o tray puede alterar foreground antes de mostrar picker.
- En paste:
  1. escribir texto seleccionado al clipboard;
  2. usar `host::write_item`, que ya activa self-write suppression por hash normalizado;
  3. intentar restaurar foco previo;
  4. esperar/verificar que el foreground sea el esperado, con timeout corto;
  5. enviar `Ctrl+V` con `SendInput`;
  6. registrar fallo metadata-only si algo falla.
- Probar manualmente Notepad, browser input y editor.
- No prometer confiabilidad universal hasta medir.
- Si `SendInput` directo consume demasiado tiempo, evaluar `enigo` como fallback de key injection, manteniendo `windows` para handles/focus.

## Implementacion Actual

- `src-tauri/src/window_focus.rs`: `PreviousWindow` guarda la ultima ventana foreground no propia.
- `show_picker` desde comando usa el tracker; shortcut/tray tambien intentan recordar foreground al mostrar.
- `activate_item` soporta `{ copy, markUsed, hidePicker, focusPrevious, paste, pasteShortcut }`.
- `PasteShortcut::Default` resuelve por proceso: browsers conocidos (`chrome.exe`, `msedge.exe`, `firefox.exe`, `brave.exe`, `vivaldi.exe`, `opera.exe`, `opera_gx.exe`) y Tabby (`tabby.exe`) usan `Ctrl+V`; el resto usa `Shift+Insert`.
- `PasteShortcut::ShiftInsert` y `PasteShortcut::CtrlV` siguen disponibles como overrides explicitos.
- `Shift+Enter` en el picker ejecuta copy + hide + focus previous + paste. `Enter` mantiene copy + hide.
- Delay post-focus antes de enviar paste: 700 ms en MVP 0, elegido de forma conservadora tras pruebas manuales. Convertir a setting/regla por app cuando se trabaje polish de paste.
- `Shift+Insert` sintetico marca `Insert` como extended key para parecerse mas al teclado fisico en apps terminal/Electron.

## Validacion 2026-06-05

- Validado con target WinForms/TextBox visible y texto sintetico: el TextBox recibio el token por `Shift+Insert`.
- Self-write suppression tambien se disparo durante paste: el texto escrito por Copicu no se inserto de nuevo en SQLite.
- Fallo observado: Chromium controlado por Playwright no garantizo foreground OS real; el tracker registro Explorer/otro proceso y el paste no llego al `textarea`. Para validar paste real, usar una ventana nativa/visible o una sesion de browser realmente foreground, no solo `page.bringToFront()`.
- Validacion ampliada 2026-06-05 con `tests/manual/validate-paste-targets.ps1`:
  - Notepad real: pass con ruta picker `Shift+Enter` / default `Shift+Insert`.
  - Chrome real con HTML local y `textarea`: pass usando API host con `pasteShortcut: "ctrlV"` antes de la regla target-aware; despues pass con `pasteShortcut: "default"` cuando default empezo a resolver browser => `Ctrl+V`.
  - Editor-like WinForms TextBox: pass con ruta picker `Shift+Enter` / default `Shift+Insert`.
- El harness de browser por CDP dio falsos negativos para leer el valor aunque el texto era visible; la verificacion final usa foco OS y seleccion/copia del contenido visible con tokens sinteticos.
- Ajuste de harness: Notepad/browser ahora esperan por clipboard con polling corto despues de `Ctrl+C`; Windows puede tardar en actualizar el clipboard visible aunque el paste haya funcionado.

## Riesgos

- Apps elevadas pueden bloquear focus/input desde app no elevada.
- Timing de focus y paste puede variar.
- Restaurar clipboard anterior puede introducir races.
- Logs no deben incluir texto del clipboard.
- Apps con input especial, juegos, terminales o apps remotas pueden ignorar input sintetico.
- Si `GetForegroundWindow` captura el picker o una ventana invalida, paste puede ir a destino incorrecto; hay que filtrar handles propios.
- Browser/input web puede necesitar `Ctrl+V`; CopyQ tambien permite reglas por ventana.

## Decision Actual

Decision inicial para MVP 0:

- Usar `windows` crate directo para `GetForegroundWindow`, `SetForegroundWindow` y `SendInput`.
- Reusar la self-write suppression ya validada en `host::write_item`; no reimplementar supresion separada para paste.
- Tratar paste-to-previous-window como spike con failure reporting metadata-only.
- Mantener `enigo` como fallback para key injection, no como dependencia inicial.
- Mantener default target-aware para MVP 0: browsers conocidos usan `Ctrl+V`; otros targets usan `Shift+Insert`.

## Preguntas Abiertas

- Que delays son necesarios para distintas apps si 700 ms se siente lento?
- Restaurar clipboard anterior mejora privacidad o empeora confiabilidad?
- Hace falta una ventana picker no-activating o alcanza recordar foco antes de mostrarla?
- La lista hardcodeada de browsers alcanza para MVP 0; luego conviene moverla a settings/reglas por proceso o ventana.
