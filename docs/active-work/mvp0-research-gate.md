---
id: mvp0-research-gate
status: implementation-validated
updated: 2026-06-05
---

# MVP 0 Research Gate

Trabajo vivo para cerrar la investigacion tecnica previa al scaffold del MVP 0 y dejar listo el arranque de validacion manual.

Estado: research gate completo. Scaffold inicial creado, watcher inicial implementado, validacion manual basica pasando en app Tauri real visible, probe Win32 metadata-only agregado y feed de eventos en vivo disponible para probar formatos. El feed muestra preview textual volatil y limitada solo en memoria; no persiste payload. Retry/backoff corto para locks de clipboard ya esta implementado. Tray con Show/Hide/Quit y hide-on-close estan implementados. Watcher con ventana oculta/tray validado con texto sintetico. `Ctrl+Shift+,` esta implementado desde Rust y validado con ventana oculta por el flujo real de close/hide. SQLite reload despues de restart real, picker preview-first, copy/hide, API host reusable, self-write suppression, paste-to-previous-window, layout con texto largo y paste manual ampliado ya estan validados. El siguiente corte es decidir reglas/delays por app para paste y cerrar verificaciones restantes del MVP 0.

## Objetivo

Elegir librerias y patterns iniciales para cada necesidad critica del MVP 0 usando Context7 y fuentes primarias web antes de implementar.

## Estado

| Area | Topic | Estado | Proximo paso |
| --- | --- | --- | --- |
| Clipboard | `docs/topics/clipboard.md` | image decision accepted | Proximo corte separado: `docs/active-work/image-capture-spike.md`. |
| Global shortcut + tray | `docs/topics/global-shortcut-and-tray.md` | hidden shortcut validated | Seguir con SQLite; no volver a `Ctrl+Shift+V` sin repetir validacion. |
| SQLite storage | `docs/topics/sqlite-storage.md` | restart reload validated | Seguir con verificaciones de MVP 0. |
| Picker interaction | `docs/topics/picker-interaction.md` | long layout validated | Decidir si `Shift+Enter` queda como default visible. |
| Windows focus + paste | `docs/topics/windows-focus-and-paste.md` | target-aware default validated | Evaluar si delay 700 ms queda temporal o configurable. |

## Decisiones Provisionales

- Clipboard MVP 0: watcher/event-driven capture es requisito.
- Clipboard watcher principal: `clipboard-rs`.
- Clipboard watcher fallback Windows: `windows` crate con `AddClipboardFormatListener` + `WM_CLIPBOARDUPDATE`.
- Clipboard read/write principal: `tauri-plugin-clipboard-manager` desde Rust.
- Clipboard read/write fallback: `arboard`, luego `clipboard-win` si hace falta Windows-only.
- Global shortcut MVP 0: usar `tauri-plugin-global-shortcut` desde Rust.
- Tray MVP 0: usar Tauri 2 `TrayIconBuilder` desde Rust.
- No registrar shortcut/tray desde frontend en MVP 0.
- SQLite MVP 0: usar `rusqlite` con feature `bundled`.
- Migrations MVP 0: usar `rusqlite_migration`.
- No usar `tauri-plugin-sql` en MVP 0.
- Windows focus/paste MVP 0: usar `windows` crate directo para `GetForegroundWindow`, `SetForegroundWindow` y `SendInput`.
- `enigo` queda fallback solo para key injection si `SendInput` directo complica demasiado.
- CopyQ queda como baseline tecnico recurrente para dudas de comportamiento. Ver `docs/topics/copyq-technical-baseline.md`.
- Las acciones de picker/clipboard/paste deben exponerse como API host reusable para UI, shortcuts, tray y futuros plugins; React no debe ser dueño de la logica durable.
- Refactor 2026-06-05: la activacion vive en `src-tauri/src/host.rs`. Primitivas actuales: `write_item`, `mark_used`, `hide_picker`, `activate_item`. El comando Tauri `activate_item` acepta una request explicita en camelCase; `focusPrevious` y `paste` ya estan en el shape pero fallan con mensaje claro hasta implementarse.
- Self-write suppression 2026-06-05: `clipboard::SelfWriteSuppression` guarda un hash normalizado pendiente por una ventana corta; `host::write_item` lo registra antes de `write_text`; el watcher consume el match y emite `self_write_suppressed` sin insertar el payload en SQLite.
- Paste-to-previous-window 2026-06-05: `window_focus::PreviousWindow` trackea la ultima ventana foreground no propia y tambien intenta recordar foreground al mostrar por shortcut/tray. `activate_item` ahora puede hacer copy, markUsed, hidePicker, focusPrevious y paste en orden. `PasteShortcut::Default` es target-aware: browsers conocidos usan `Ctrl+V`; otros targets usan `Shift+Insert`. `ShiftInsert` y `CtrlV` siguen soportados como overrides explicitos.
- Delay post-focus para paste subido a 700 ms tras validacion ampliada. Es conservador para MVP 0 y debe volverse setting/regla por app si se vuelve perceptiblemente lento.

## Checklist

- [x] Crear topics por area tecnica.
- [x] Clipboard: Context7 + web/fuentes primarias.
- [x] Clipboard: documentar opciones y decision inicial.
- [x] Clipboard: revisar decision para hacer watch requisito MVP.
- [x] Global shortcut + tray: Context7 + web/fuentes primarias.
- [x] Global shortcut + tray: documentar pattern y decision inicial.
- [x] SQLite: Context7 + web/fuentes primarias.
- [x] SQLite: documentar pattern y decision inicial.
- [x] Windows focus + paste: Context7 + web/fuentes primarias.
- [x] Windows focus + paste: documentar pattern y decision inicial.
- [x] Actualizar spec/tasks con research gate completo.
- [x] Crear scaffold Tauri 2 + React/Vite + TypeScript.
- [x] Verificar `npm run build` y `cargo check`.
- [x] Implementar watcher inicial de texto plano con `clipboard-rs`.
- [x] Agregar normalizacion, hashing, duplicate/coalesce basico y tests unitarios.
- [x] Agregar Playwright dev-only para smoke checks visuales locales en desktop y ventana desktop angosta.
- [x] Verificar layout con texto largo sintetico sin overflow horizontal.
- [x] Agregar script manual reutilizable para validar paste targets.

## Estado Al Cierre De Sesion

Research gate completo e implementacion iniciada. Clipboard watch/event-driven capture es requisito basico del MVP 0. Polling no es el camino principal.

Hecho en esta sesion:

- Scaffold Tauri 2 + React/Vite + TypeScript.
- UI shell inicial con animaciones sutiles.
- `clipboard-rs` watcher inicial en Rust.
- Normalizacion, SHA-256 hash, ignore empty, ignore consecutive duplicates y coalesce basico.
- Playwright dev-only para smoke visual desktop y ventana desktop angosta.
- Verificado: `npm run build`, `npm run visual:check`, `cargo check`, `cargo test`.

Validacion manual 2026-06-05:

- `npm run tauri:dev` arranca la app real y el watcher `clipboard-rs`.
- Copias sinteticas desde Notepad, Chrome y VS Code generaron capturas de texto.
- Duplicado consecutivo sintetico fue ignorado.
- Clipboard con solo whitespace sintetico fue ignorado como vacio.
- No hubo `clipboard read skipped` durante estas pruebas.
- Logs y UI de stats no registran payload ni hash de clipboard.
- Probe Win32 metadata-only agregado: enumera formatos, ids, nombres, flags, tamanos de handles y cantidad de archivos sin leer payload ni rutas.
- UI actual muestra un feed de eventos recientes con outcome y formatos detectados. Para evitar crash Win32, el probe no calcula tamano de handles GDI/bitmap/metafile; solo usa tamaños en formatos global-memory conservadores.
- UI actual tambien muestra preview textual volatil en memoria, limitado a 700 caracteres por evento. No se loguea ni persiste contenido.
- Pruebas manuales con imagen/screenshot detectaron `CF_BITMAP`, `CF_DIB`, `CF_DIBV5`, `System.Drawing.Bitmap` y `Ole Private Data`; no hay texto para preview.
- Prueba con archivo desde Explorer detecto `CF_HDROP` con `file_count=1` y formatos shell/OLE; no se leyeron rutas.
- Prueba con tabla web/Chromium detecto `HTML Format`, `CF_UNICODETEXT`, `CF_TEXT`, `CF_OEMTEXT` y formatos internos Chromium.
- Ajustado: `OpenClipboard` y `get_text` tienen retry/backoff corto para locks transitorios antes de registrar error.
- Implementado tray minimo con menu `Show`, `Hide`, `Quit`; click izquierdo muestra ventana; X de ventana hace hide, no quit.
- Validacion manual 2026-06-05: con `npm run tauri:dev`, sin ventana visible, `Set-Clipboard` con texto sintetico genero `clipboard text captured` en logs. Tambien aparecieron dos `get_text` `Element not found` en eventos intermedios; no bloquearon capturas posteriores y no se logueo payload.
- Implementado `Ctrl+Shift+V` con `tauri-plugin-global-shortcut` desde Rust. La prueba sintetica con Win32 `SendInput` no disparo el handler, asi que falta validacion real antes de marcar el flujo de show/focus como cerrado.
- Validacion parcial 2026-06-05: con `npm run tauri:dev` y ventana `Copicu` oculta, una prueba Win32 `RegisterHotKey` externa para `Ctrl+Shift+V` devolvio `ERROR_HOTKEY_ALREADY_REGISTERED` (1409). Esto indica que la combinacion esta tomada mientras Copicu corre, pero no prueba que el handler de Copicu reciba la pulsacion. Falta presionar `Ctrl+Shift+V` con teclado fisico y confirmar `global shortcut pressed` en logs + ventana visible.
- Agregado log de observabilidad en setup: `global shortcut registered: Ctrl+Shift+V` si `tauri-plugin-global-shortcut` reporta el shortcut como registrado por Copicu. Verificado con `cargo check` y `npm run tauri:dev`: el log aparece despues de recompilar. La ventana se oculto correctamente despues de esto, pero no se observo `global shortcut pressed` durante un monitoreo de 30s; falta confirmar si hubo pulsacion fisica dentro de esa ventana.
- Se cambio el shortcut activo a `Ctrl+Shift+,` para probar una combinacion alternativa. Validacion manual 2026-06-05: el plugin reporto `global shortcut registered: Ctrl+Shift+,`; con ventana ocultada por `WM_CLOSE` y el handler Tauri `CloseRequested`/`window.hide()`, una pulsacion fisica genero `global shortcut pressed` y la ventana principal `Copicu` quedo visible. El intento de ocultar con Win32 `ShowWindow(SW_HIDE)` no se considera valido para el gate porque puede desincronizarse con el estado de ventana de Tauri.
- SQLite inicial implementado 2026-06-05: DB en `app_data_dir` (`copicu.sqlite3`), migration v1 con `rusqlite_migration`, connection `Arc<Mutex<Connection>>`, comandos `list_recent_items` y `search_items`, insercion desde watcher solo para `CapturedText`, prune a 1000 items. Validado con texto sintetico: DB `user_version=1`, `item_count=1`, `synthetic_match_count=1`; no se imprimio payload.
- Reload despues de restart real validado 2026-06-05: se cerro la instancia anterior de `tauri:dev`, se arranco una instancia fresca, abrio la misma DB `copicu.sqlite3`, la DB mantenia filas persistidas y una nueva copia sintetica incremento el conteo sin imprimir payload.
- Picker minimo conectado 2026-06-05: UI principal ahora carga `list_recent_items`, busca con `search_items`, muestra lista y preview, enfoca search al abrir/enfocar ventana y soporta navegacion por teclado Arrow/Home/End. Paste/copy seleccionado queda pendiente.
- Direccion de picker guardada 2026-06-05: pasar a feed preview-first; escribir filtra; `Up/Down/PgUp/PgDown/Home/End` navegan; `Enter` activa; `Escape` limpia filtro y luego oculta; click selecciona y doble click activa. Regex/fuzzy quedan como modos configurables posteriores. Ver `docs/topics/picker-interaction.md`.
- Picker preview-first implementado 2026-06-05: se reemplazo lista + preview lateral por feed de previews; el input queda enfocado al abrir/focus y despues de click; filtro plain substring via `search_items`; `Up/Down/PgUp/PgDown/Home/End` navegan; `Escape` limpia filtro o invoca hide; `Enter` invoca copy selected + hide; click selecciona y doble click activa. Backend agregado: `activate_history_item` obtiene item por id, escribe texto al clipboard con `tauri-plugin-clipboard-manager`, marca `last_used_at_unix_ms` y oculta la `WebviewWindow`; `hide_picker` oculta la ventana invocadora.
- Validacion manual 2026-06-05: CopyQ real estaba abierto y reaccionaba al clipboard sintetico; se cerraron procesos `copyq.exe` antes de validar. Con texto sintetico, doble click sobre un item filtrado copio el item historico seleccionado al clipboard y oculto Copicu. Los intentos de validar `Enter` con `SendInput` no son concluyentes porque WebView2 no recibio flechas/Enter sinteticas de forma confiable, aunque el handler esta implementado.
- Teclado WebView2 validado 2026-06-05: arrancar con `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222`, conectar Playwright por CDP y usar `locator.fill/press`. Se valido `Enter` real del WebView: el guard contra stale results evita activar resultados viejos, filtro asentado copia item seleccionado al clipboard y oculta ventana nativa. No usar `ShowWindow` para restaurar/ocultar en pruebas porque desincroniza estado Tauri.
- Baseline CopyQ estudiado 2026-06-05: `Enter` activa item => copia payload al clipboard => opcionalmente mueve item, oculta ventana, enfoca ventana previa y pega con `Shift+Insert` por defecto (`Ctrl+V` por regex de ventana). El pattern Copicu debe ser API host `activateItem(options)`, no handler UI aislado. Ver `docs/topics/copyq-technical-baseline.md`.
- Refactor API host 2026-06-05: `activate_history_item` fue reemplazado por `activate_item` con request `{ itemId, copy, markUsed, hidePicker, focusPrevious, paste, pasteShortcut }`; React usa un wrapper `activateHostItem` para Enter/doble click con copy+hide. Se agregaron comandos primitivos `write_history_item` y `mark_history_item_used` ademas de `hide_picker`. Prueba Rust cubre deserializacion camelCase del request.
- Self-write suppression validado 2026-06-05: se arranco `npm run tauri:dev` con `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222`; `Set-Clipboard` con snippet sintetico genero `clipboard text captured`; activar ese item por WebView2 CDP dejo el texto en clipboard y produjo `clipboard text ignored: self_write`. La instancia dev fue cerrada despues de la validacion.
- Paste-to-previous-window validado 2026-06-05: se uso `Shift+Enter` como ruta secundaria de picker para `{ copy: true, hidePicker: true, focusPrevious: true, paste: true }`. Validacion con WinForms/TextBox visible: target foreground recordado por tracker, `activate_item` oculto Copicu, enfoco target, envio `Shift+Insert` y el TextBox recibio el token sintetico. La primera validacion con Chromium controlado por Playwright fallo porque Playwright no garantizo foreground OS real; el tracker registro Explorer/otro proceso en vez del target.
- Layout texto largo validado 2026-06-05: smoke visual mockea IPC Tauri y lista snippets sinteticos largo/multilinea/token sin espacios. Desktop 900x620 y narrow 420x620 pasan sin overflow horizontal ni solapamiento.
- Paste manual ampliado 2026-06-05: `tests/manual/validate-paste-targets.ps1` valida Notepad, Chrome real con textarea local y editor-like WinForms TextBox. Notepad/editor usan default `Shift+Insert`; Chrome primero paso usando `pasteShortcut: "ctrlV"` por API host y el harness ahora usa `default` para validar la regla target-aware. El harness original de Chrome por CDP dio falsos negativos aunque el texto era visible, asi que la verificacion final usa foco OS + seleccionar/copiar contenido visible con tokens sinteticos.
- Paste default target-aware 2026-06-05: se agrego resolucion por proceso en `window_focus.rs`. Browsers conocidos usan `Ctrl+V`; otros targets mantienen `Shift+Insert`. Se agregaron tests unitarios para browsers y editores plain. `tests/manual/validate-paste-targets.ps1` ahora usa `default` para browser y paso en Notepad/browser/editor-like. El harness tambien espera por clipboard al verificar Notepad/browser para evitar falsos negativos por demora despues de `Ctrl+C`.
- Imagenes 2026-06-05: decision aceptada para proximo corte. Modelo MIME-first, PNG normalizado como blob principal, metadata SQLite, thumbnail separado, limites desde el inicio, preservar MIME original solo si aporta fidelidad real y saltar imagen binaria cuando tambien hay texto salvo modo rich explicito. Ver `docs/active-work/image-capture-spike.md`.
- Picker polish CopyQ-inspired 2026-06-05: ventana sin header/diagnosticos; search como cabecera; items muestran solo contenido; metadata `title`/`tags`/`notes` en franja separada; menu vertical `...` dentro del item con activate, paste, edit, edit metadata y delete; delete borra fila y blobs asociados.
- Preview content 2026-06-05: items `image` usan PNG principal para preview grande; Markdown con imagenes conserva el orden del origen, renderizando texto e imagenes en secuencia; no reordenar imagenes arriba. Smoke visual cubre Markdown sintetico con imagenes data URL.
- Window/theme 2026-06-05: picker always-on-top via `set_always_on_top(true)` en setup/show; light/dark por `prefers-color-scheme`; hide-on-focus-lost diferido/cancelable por `Focused(true)`, `Moved` y `Resized` para no romper mover/redimensionar.
- Scroll/feed 2026-06-05: refresh automatico del historial ya no resetea scroll manual; `scrollIntoView` depende solo de `selectedIndex`. Smoke visual `manual scroll is not reset by history refresh`.
- Regla dev 2026-06-05: mantener `npm run tauri:dev` vivo hasta tener binario instalable; verificar Vite 1420, `cargo run` y `target/debug/copicu.exe`. No matar procesos dev salvo pedido explicito.
- Cierre de sesion 2026-06-05: checks verificados durante el corte: `npm run build`, `npm run visual:check`, `cd src-tauri; cargo check`, `cd src-tauri; cargo test`; manual paste targets paso en Notepad/browser/editor-like. La DB local contiene datos sinteticos de prueba; no commitear DB ni payloads.

Proximo corte:

1. Validar manualmente picker real: always-on-top, dark theme, mover/redimensionar y click afuera con hide diferido.
2. Seguir polish CopyQ-inspired: fidelidad Markdown/HTML, detail/formats por menu, dedup/move-to-top por hash, pin/favorites.
3. Mantener `npm run tauri:dev` corriendo; no matar procesos dev salvo pedido.

No volver a `Ctrl+Shift+V` sin repetir la validacion con app oculta.

## Prompt Compacto Para Retomar

Continuar en `C:\dev\chat\copyq-tauri`. Leer `AGENTS.md`, `docs/WORKING_MEMORY.md`, `docs/active-work/mvp0-research-gate.md`, `docs/active-work/image-capture-spike.md`, `docs/topics/picker-interaction.md`, `docs/topics/copyq-technical-baseline.md`, `docs/topics/clipboard.md`, `docs/DECISIONS.md` y `specs/001-mvp0-native-spike/tasks.md`. No crear carpetas de sesiones ni handoffs historicos; usar `active-work` y topics. Estado: app Tauri tiene watcher `clipboard-rs`, probe Win32 metadata-only, tray `Show/Hide/Quit`, hide-on-close, shortcut `Ctrl+Shift+,`, SQLite `copicu.sqlite3`, host API reusable, self-write suppression, paste-to-previous-window y paste target-aware validados. Picker actual: preview-first, search como unica cabecera, sin fecha/tipo/chars/lines, metadata `title`/`tags`/`notes` en franja separada, menu vertical `...` dentro del item con activate/paste/edit/edit metadata/delete, imagenes grandes usando PNG principal y Markdown con imagenes preservando orden de origen. Ventana actual: always-on-top, light/dark por sistema, hide-on-focus-lost diferido/cancelable para no cerrarse al mover/redimensionar, refresh automatico sin resetear scroll manual. Decision imagenes: modelo MIME-first, PNG normalizado como blob principal, metadata SQLite, thumbnail separado, limites desde el inicio, preservar MIME original solo si aporta fidelidad real y saltar imagen binaria cuando tambien hay texto salvo modo rich explicito. Checks pasados durante el corte: `npm run build`, `npm run visual:check`, `cargo check`, `cargo test`; manual paste targets paso. Regla actual: mantener `npm run tauri:dev` vivo hasta tener binario instalable. Proximo paso: validar manualmente picker real always-on-top/dark/mover/redimensionar/click afuera, seguir polish Markdown/HTML y dedup/move-to-top con datos sinteticos.

## Fuentes Clipboard Consultadas

- Context7 `/websites/v2_tauri_app`: Tauri clipboard plugin.
- Context7 `/websites/rs_arboard`: `arboard`.
- Context7 `/doumanash/clipboard-win`: `clipboard-win`.
- Context7 `/websites/rs_clipboard-rs`: `clipboard-rs`.
- Tauri Clipboard plugin: https://v2.tauri.app/plugin/clipboard/
- Tauri Clipboard JS reference: https://v2.tauri.app/reference/javascript/clipboard-manager/
- arboard docs.rs: https://docs.rs/arboard/latest/arboard/struct.Clipboard.html
- clipboard-rs docs.rs: https://docs.rs/crate/clipboard-rs/latest
- clipboard-win docs.rs: https://docs.rs/crate/clipboard-win/latest

## Fuentes Global Shortcut + Tray Consultadas

- Context7 `/websites/v2_tauri_app`: global shortcut plugin Rust setup.
- Context7 `/websites/v2_tauri_app`: tray icon/menu Rust setup.
- Context7 `/websites/v2_tauri_app`: close-requested/hide window behavior.
- Tauri global shortcut plugin: https://v2.tauri.app/plugin/global-shortcut/
- Tauri global shortcut JS reference: https://tauri.app/reference/javascript/global-shortcut/
- Tauri system tray: https://v2.tauri.app/learn/system-tray/
- Tauri `TrayIconBuilder` docs.rs: https://docs.rs/tauri/latest/tauri/tray/struct.TrayIconBuilder.html

## Fuentes SQLite Consultadas

- Context7 `/websites/rs_rusqlite_rusqlite`: `rusqlite`.
- Context7 `/websites/rs_rusqlite_migration`: `rusqlite_migration`.
- Context7 `/tauri-apps/tauri-plugin-sql`: Tauri SQL plugin.
- rusqlite docs.rs: https://docs.rs/crate/rusqlite/latest
- rusqlite features docs.rs: https://docs.rs/crate/rusqlite/latest/features
- rusqlite_migration docs.rs: https://docs.rs/rusqlite_migration
- Tauri SQL plugin: https://v2.tauri.app/plugin/sql/

## Fuentes Windows Focus + Paste Consultadas

- Context7 `/microsoft/windows-rs`: `windows` crate.
- Context7 `/websites/microsoft_github_io_windows-docs-rs_doc_windows`: Win32 bindings docs.
- Context7 `/enigo-rs/enigo`: keyboard simulation.
- Microsoft Learn `GetForegroundWindow`: https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getforegroundwindow
- Microsoft Learn `SetForegroundWindow`: https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setforegroundwindow
- Microsoft Learn `SendInput`: https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-sendinput
- Raymond Chen on async `SetForegroundWindow`: https://devblogs.microsoft.com/oldnewthing/20161118-00/?p=94745

## Fuentes Clipboard Watch Consultadas

- Context7 `/websites/rs_clipboard-rs`: watcher API.
- Context7 `/microsoft/windows-rs`: Win32 clipboard listener APIs.
- Microsoft Learn `AddClipboardFormatListener`: https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-addclipboardformatlistener
- Microsoft Learn `WM_CLIPBOARDUPDATE`: https://learn.microsoft.com/en-us/windows/win32/dataxchg/wm-clipboardupdate
- Raymond Chen on listener model: https://devblogs.microsoft.com/oldnewthing/20110919-00/?p=9613
