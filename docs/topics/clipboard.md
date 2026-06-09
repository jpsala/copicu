---
id: clipboard
status: active
kind: reference
triggers:
  - clipboard
  - portapapeles
  - clipboard manager
  - capture
  - text capture
  - HTML clipboard
primary_refs:
  - specs/001-mvp0-native-spike/spec.md
  - specs/001-mvp0-native-spike/research.md
---

# Clipboard

Topic para decisiones, discovery y patterns sobre acceso al clipboard.

## Necesidad MVP 0

Capturar texto plano, evitar duplicados consecutivos, persistir historial y escribir texto seleccionado para copy/paste.

## Opciones A Evaluar

| Opcion | Uso posible | Estado |
| --- | --- | --- |
| `tauri-plugin-clipboard-manager` | Read/write texto desde Rust dentro de Tauri. | Usar para write/read puntual; no alcanza solo para monitoring. |
| `@tauri-apps/plugin-clipboard-manager` | Read/write texto desde frontend. | Evitar en MVP 0 salvo necesidad; requiere permisos frontend. |
| `arboard` | Clipboard cross-platform directo desde Rust. | Fallback principal si el plugin no sirve para polling/backend. |
| `clipboard-rs` | Clipboard cross-platform con texto, HTML, RTF, imagenes, files y watcher. | Nuevo candidato principal para watcher MVP 0. |
| Win32 listener con `windows` crate | `AddClipboardFormatListener` + `WM_CLIPBOARDUPDATE`. | Fallback/control Windows-first si `clipboard-rs` no alcanza. |
| `clipboard-win` | Clipboard Windows-only con control explicito y Unicode. | Fallback Windows si abstracciones fallan. |
| Win32 clipboard directo | Mayor control Windows-first. | Ultimo recurso. |

## Fuentes Consultadas

- Context7: `/websites/v2_tauri_app`, consulta `Tauri 2 clipboard manager plugin permissions read text write text setup`.
- Context7: `/websites/rs_arboard`, consulta `read text set text clipboard Rust Windows image example`.
- Context7: `/doumanash/clipboard-win`, consulta `get_clipboard set_clipboard formats unicode text Rust example`.
- Context7: `/websites/rs_clipboard-rs`, consulta `get_text set_text clipboard Rust HTML image formats`.
- Context7: `/websites/rs_clipboard-rs`, consulta `ClipboardWatcher ClipboardHandler start_watch on_clipboard_change Rust Windows`.
- Context7: `/microsoft/windows-rs`, consulta `AddClipboardFormatListener WM_CLIPBOARDUPDATE RemoveClipboardFormatListener Rust windows crate`.
- Tauri Clipboard plugin: https://v2.tauri.app/plugin/clipboard/
- Tauri Clipboard JS reference: https://v2.tauri.app/reference/javascript/clipboard-manager/
- arboard docs.rs: https://docs.rs/arboard/latest/arboard/struct.Clipboard.html
- clipboard-rs docs.rs: https://docs.rs/crate/clipboard-rs/latest
- clipboard-rs `ClipboardWatcher`: https://docs.rs/clipboard-rs/latest/clipboard_rs/trait.ClipboardWatcher.html
- clipboard-win docs.rs: https://docs.rs/crate/clipboard-win/latest
- clipboard-win GitHub: https://github.com/DoumanAsh/clipboard-win
- Microsoft Learn `AddClipboardFormatListener`: https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-addclipboardformatlistener
- Microsoft Learn `WM_CLIPBOARDUPDATE`: https://learn.microsoft.com/en-us/windows/win32/dataxchg/wm-clipboardupdate
- Raymond Chen on modern clipboard listener model: https://devblogs.microsoft.com/oldnewthing/20110919-00/?p=9613

## Hallazgos

- El plugin oficial soporta `readText` y `writeText` en JavaScript.
- Tambien expone API Rust via `tauri_plugin_clipboard_manager::ClipboardExt`.
- Tauri 2 no habilita capacidades de clipboard por defecto.
- Para leer y escribir texto hacen falta permisos explicitos, por ejemplo:
  - `clipboard-manager:allow-read-text`
  - `clipboard-manager:allow-write-text`
- `arboard` soporta `get_text`, `set_text`, HTML e imagenes. En Windows documenta que el clipboard es un objeto global que conviene operar desde un solo thread; operaciones paralelas pueden fallar.
- `clipboard-rs` soporta texto, HTML, RTF, imagenes, files, custom formats y watcher de cambios. Docs.rs muestra version 0.3.4 y cobertura baja comparada con `arboard`.
- `clipboard-rs` expone `ClipboardWatcher`, `ClipboardHandler`, `ClipboardWatcherContext` y `start_watch`; `start_watch` es bloqueante y debe correr en thread separado.
- Microsoft documenta `AddClipboardFormatListener`: una ventana registrada recibe `WM_CLIPBOARDUPDATE` cuando cambia el contenido del clipboard.
- `clipboard-win` es Windows-only, muy directo para Unicode text, con API simplificada y control manual de apertura. Documenta que el clipboard Windows es global y debe cerrarse al terminar operaciones.

## Pattern Recomendado Para MVP 0

Watch es requisito basico para MVP 0. No alcanza con polling como camino principal, porque Copicu debe reaccionar a cualquier app que escriba al clipboard y validar el mecanismo nativo real.

Camino principal:

1. Usar `clipboard-rs` watcher en thread separado para recibir eventos de cambio.
2. En cada evento, leer texto plano y enviarlo al core de historial.
3. Mantener suppression window para escrituras propias.
4. Debounce/coalesce corto porque algunas apps escriben multiples formatos en secuencia.
5. Registrar errores metadata-only.

Fallback Windows-first:

1. Implementar listener propio con `windows` crate.
2. Registrar una ventana/handle con `AddClipboardFormatListener`.
3. Procesar `WM_CLIPBOARDUPDATE`.
4. Leer texto con `tauri-plugin-clipboard-manager`, `arboard` o Win32 directo segun lo que resulte mas confiable.

Read/write puntual:

- Usar `tauri-plugin-clipboard-manager` desde Rust para escribir el item seleccionado.
- Mantener `arboard` como fallback simple de read/write.
- Mantener `clipboard-win` como fallback Windows-only si hace falta control fino.

## Riesgos

- Clipboard es sensible: no loguear payloads.
- Watchers pueden disparar varias veces por una sola accion de copy si la app publica varios formatos.
- Read/write desde frontend requiere capabilities; si el backend Rust maneja clipboard, mantener permisos frontend minimos.
- Rich formats quedan fuera de MVP 0.
- Clipboard Windows es global y puede estar ocupado por otra app; implementar retry/backoff y tratar errores transitorios como esperables.
- El listener puede causar conflictos si abre el clipboard demasiado agresivamente; leer con retry/debounce, no en loops apretados.

## Decision Actual

Decision revisada para MVP 0:

- Watcher principal: `clipboard-rs`.
- Fallback watcher Windows: `windows` crate + `AddClipboardFormatListener` + `WM_CLIPBOARDUPDATE`.
- Read/write principal: `tauri-plugin-clipboard-manager` desde Rust.
- Fallback read/write: `arboard`.
- Fallback Windows-only read/write: `clipboard-win`.
- No usar clipboard desde frontend en MVP 0 salvo necesidad concreta.

Esta decision debe validarse temprano en scaffold antes de invertir en picker UI.

## Implementacion Actual

- Captura persistente: texto plano e imagen-only como PNG normalizado.
- Watcher: `clipboard-rs` en thread separado.
- Probe Win32: detecta metadata de formatos, incluyendo `CF_BITMAP`, `CF_DIB`, `CF_DIBV5`, HTML, RTF y file-list sin leer payload ni rutas.
- UI diagnostics: muestra si el clipboard actual tiene imagen (`has_image`) y cantidad/tipos de formatos.
- Persistencia: SQLite guarda `content_kind='text'` o `content_kind='image'`, texto/label seguro, hash, timestamps y metadata opcional de imagen. Imagenes usan blob store bajo app data para PNG principal y thumbnail.
- Write-back: el host escribe texto con `tauri-plugin-clipboard-manager` e imagenes con `clipboard-rs`.

## Estado De Imagenes

Se capturan imagenes image-only como items de historial. Si el clipboard contiene texto e imagen binaria, Copicu captura texto y salta la imagen binaria, siguiendo el criterio de CopyQ.

Decision validada para el primer corte:

1. usar modelo MIME-first;
2. guardar PNG normalizado como blob principal;
3. preservar MIME original solo si aporta fidelidad real;
4. guardar metadata en SQLite: dimensiones, bytes, MIME principal, hash y paths de blobs/thumbnails;
5. generar thumbnail separado para picker;
6. aplicar limites de tamano/dimensiones desde el primer commit;
7. saltar imagenes binarias si tambien hay texto, salvo modo rich explicito.

Validacion 2026-06-05:

- `clipboard-rs` capturo fuentes comunes con imagenes sinteticas: screenshot, Paint, browser y Snipping Tool.
- No agregar fallback Win32 `CF_DIB`/`CF_DIBV5` hasta encontrar una fuente concreta que falle.
- `cargo test` crudo puede fallar en esta maquina por DLLs API-set de Miniconda en `PATH`; usar `npm run rust:test`.

## Research CopyQ Sobre Imagenes

Fuentes revisadas 2026-06-05:

- CopyQ docs: `https://copyq-docs.readthedocs.io/en/latest/images.html`
- CopyQ scripting API: `https://copyq.readthedocs.io/en/stable/scripting-api.html`
- CopyQ source: `src/common/common.cpp`, `plugins/itemimage/itemimage.cpp`, `src/tests/itemimagetests.cpp`

Hallazgos:

- CopyQ modela cada item como un mapa de MIME type a bytes (`QVariantMap`). La scripting API expone esto como `ByteArray`; ahi vive texto, HTML, imagenes y demas formatos.
- El flujo de captura clona formatos desde `QMimeData`. Para imagenes, CopyQ prioriza `image/png`; si tambien hay `image/webp` o `image/gif`, puede conservarlos, pero evita formatos binarios redundantes.
- Si el clipboard tiene texto, CopyQ evita clonar imagenes binarias grandes. El comentario en el codigo menciona casos como spreadsheets que publican imagenes y podrian bloquear la app origen al generar datos pesados.
- Si solo hay imagen interna de Qt, CopyQ intenta convertirla a un formato MIME soportado con `QImageWriter`.
- Hay limite de seguridad para clonar imagenes: no acepta imagenes mayores a 4096x4096 en ese path.
- Al recrear clipboard desde item, CopyQ vuelve a crear `QMimeData`, setea `imageData` desde `image/png`, `image/bmp` o `application/x-qt-image`, y tambien preserva los bytes MIME.
- CopyQ marca clipboard propio con `application/x-copyq-owner` para no recapturarlo.
- El plugin `Item Image` es responsable de display/editor:
  - preferencia de lectura para preview: `image/png`, `image/bmp`, `image/jpeg`, `image/gif`;
  - fallback a otros `image/*`;
  - SVG separado (`image/svg+xml`);
  - GIF/animados con `QMovie`;
  - limites configurables de preview, default 320x240;
  - preview completo en dock/dialogo aunque la lista tenga thumbnails limitados.
- Tests de CopyQ confirman que PNG queda como `image/png`, y BMP/GIF/WebP terminan legibles como `image/png` en el item.

Lectura para Copicu:

- Empezar con una representacion MIME-first, no con una columna `image` especial.
- Guardar imagen normalizada como PNG para busqueda/preview/paste basico, y conservar MIME original solo si aporta fidelidad real.
- Poner limites desde el dia uno: dimensiones, bytes y skip cuando tambien hay texto salvo que el usuario active captura rica.
- Separar captura/persistencia de rendering: `content_kind=image`, blob PNG, metadata en SQLite, thumbnail cache aparte.
- Para Windows-first, una ruta practica es leer `CF_DIB`/`CF_DIBV5` o `clipboard-rs`/`arboard` image, convertir a PNG, guardar blob y exponer `image/png` al escribir de vuelta.

## Decision Actual Para Imagenes

Accepted 2026-06-05:

- Modelo: MIME-first.
- Payload principal: PNG normalizado en blob store.
- Metadata: SQLite con dimensiones, bytes, hash, MIME principal y referencias a blob/thumbnail.
- Thumbnail: archivo/cache separado, generado en captura o en primer render segun costo real; el contrato debe permitir ambas rutas.
- Original MIME: preservar solo si aporta fidelidad real y no duplica mucho.
- Privacy/performance: no capturar imagen binaria cuando tambien hay texto, salvo modo rich explicito.
- Ruta Windows inicial: `clipboard-rs` image primero; fallback Win32 directo leyendo `CF_DIB`/`CF_DIBV5` solo si las validaciones manuales encuentran fuentes no cubiertas.

## Preguntas Abiertas

- Cuanto debounce hace falta para apps que publican multiples formatos?
- Como manejar errores transitorios cuando el clipboard esta ocupado en rich formats?
- Restaurar clipboard anterior despues de paste debe usar la misma API o una ruta Windows-specific?
- Que ruta concreta conviene para imagenes en Windows: `clipboard-rs`, `arboard` o Win32 directo?
- Como evitar persistir imagenes sensibles por accidente antes de tener settings de privacy/ignored apps?
