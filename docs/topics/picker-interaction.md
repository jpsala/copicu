---
id: picker-interaction
status: active
kind: decision-map
triggers:
  - picker
  - buscador
  - search
  - filtro
  - regex
  - fuzzy
  - preview
  - keyboard navigation
  - mouse interaction
  - tabs
primary_refs:
  - ../../specs/001-mvp0-native-spike/spec.md
  - ../../specs/001-mvp0-native-spike/tasks.md
  - ../topics/product-direction.md
  - ../topics/windows-focus-and-paste.md
  - ../topics/copyq-technical-baseline.md
---

# Picker Interaction

## Direccion

El picker de Copicu debe ser una herramienta local rapida, keyboard-first y preview-first.

La vista principal no debe tratar cada resultado como un item chico con preview separado por defecto. La direccion preferida es un feed/lista de previews: cada entrada muestra directamente el contenido util, con truncado y densidad controlada.

La estetica de CopyQ no es el objetivo, pero su idea de mostrar contenido directamente y operar rapido por teclado es valiosa.

## Inspiracion Consultada

- CopyQ: escribir filtra/busca; `Up`/`Down`, `PgUp`/`PgDown`, `Home`/`End` navegan; `Esc` cancela busqueda/oculta ventana; `Enter` pone el item en clipboard y opcionalmente pega.
- CleanClip: escritura directa para buscar; flechas para cambiar opcion; `Space` para preview; `Tab` para expandir/siguiente pagina; preview temporal o persistente.
- Ditto: `Enter`/doble click para pegar en ventana previa, con fuerte dependencia de timing/foco.
- Paste/Pasta/Pano/ClipClip: valoran previews visuales, filtros por tipo/app, colecciones, favoritos y acciones contextuales.
- Opiniones de usuarios: velocidad, paste confiable, privacidad, exclusion por app, imagenes, duplicados y evitar categorizacion excesiva importan mas que una UI muy cargada.

Fuentes:

- CopyQ keyboard: https://copyq-de.readthedocs.io/de/stable/keyboard.html
- CopyQ tabs/items: https://copyq-docs.readthedocs.io/en/latest/tabs-and-items.html
- CopyQ images: https://copyq-docs.readthedocs.io/en/latest/images.html
- CleanClip manual: https://cleanclip.cc/gb/docs/manual
- Paste search: https://pasteapp.io/help/search-and-filters
- Pasta: https://getpasta.com/
- ClipClip features: https://www.clipclip.com/features
- ClipboardFusion triggers: https://www.clipboardfusion.com/Features/Triggers/

## Baseline CopyQ Reutilizable

Para dudas finas de comportamiento o fallas de paste/foco, abrir primero `docs/topics/copyq-technical-baseline.md`.

Decision durable: las acciones del picker deben ser primitivas de API host/plugin, no solo handlers de UI. `Enter`, doble click, tray, shortcut global y futuros plugins deben llamar a la misma accion conceptual de activar item.

MVP 0:

```text
activateItem(itemId, { copy: true, hidePicker: true, paste: false })
```

Implementacion actual 2026-06-05:

- Rust: `src-tauri/src/host.rs`.
- Primitivas host: `write_item`, `mark_used`, `hide_picker`, `activate_item`.
- Comando UI: `activate_item({ itemId, copy, markUsed, hidePicker, focusPrevious, paste, pasteShortcut })`.
- `write_item` pasa por self-write suppression para que escrituras iniciadas por Copicu no se recapturen como historial nuevo.
- `focusPrevious` y `paste` ya estan implementados Windows-first con `PreviousWindow`, `SetForegroundWindow` y `SendInput`.
- `Enter` mantiene copy+hide; `Shift+Enter` ejecuta copy+hide+focusPrevious+paste como ruta secundaria de validacion.
- Al ocultar el picker, Copicu debe seguir el baseline CopyQ: limpiar filtro, seleccion transitoria y scroll; en la siguiente apertura/focus, el current/selected vuelve al primer item visible. Esto tambien aplica si el hide vino de `Enter` o doble click sobre un item. `marked` no se toca porque es estado durable propio de Copicu.
- Layout con texto largo sintetico validado 2026-06-05 en smoke visual desktop/narrow con snippets multilinea y token sin espacios.

## Estado UI Actual 2026-06-05

El picker ya no es una pantalla de diagnostico. La pantalla principal es:

- search arriba como unica cabecera;
- feed preview-first;
- cada item muestra solo contenido por defecto;
- no mostrar fecha/hora, tipo, cantidad de caracteres ni cantidad de lineas en items normales;
- si hay metadata (`title`, `tags`, `notes`), mostrarla como franja visual separada arriba del contenido;
- acciones por item en boton vertical `...`/kebab dentro del item, sin reservar espacio grande;
- acciones actuales: activate, paste, edit, edit metadata, delete;
- texto normal se muestra como preview monospace;
- Markdown con imagenes se renderiza preservando el orden del origen: bloques de texto y lineas `![...](...)` aparecen en la misma secuencia;
- imagenes Markdown se muestran en el punto donde aparecen, no reordenadas arriba;
- items `image` usan el PNG principal como preview visible grande; el thumbnail chico queda solo como artefacto auxiliar, no como preview principal del picker.

CopyQ observado como referencia:

- CopyQ deja el contenido del item muy cerca del origen visual;
- para imagenes, limita el tamaño visible del item pero muestra una imagen grande util y no un thumbnail diminuto;
- metadata visible en CopyQ aparece como contenido separado/anotacion, no mezclada con contadores de UI.

Implicacion para Copicu: evitar decorar cada item con informacion irrelevante. Si el usuario quiere detalles tecnicos/formats, deben ir en accion de menu o panel de detalles, no ocupar la lista principal.

Futuro paste-to-previous-window:

```text
activateItem(itemId, {
  copy: true,
  hidePicker: true,
  focusPrevious: true,
  paste: true,
  pasteShortcut: "default"
})
```

Capabilities futuras para plugins:

- `history:read` para listar/buscar/leer metadata de items.
- `history:write` para marcar uso, borrar, pinnear o editar.
- `clipboard:write` para `writeItem`/`writeText`; debe pasar por self-write suppression.
- `picker:control` para show/hide/select/activate.
- `window:focus` para recordar/restaurar ventana previa.
- `input:paste` para enviar `Shift+Insert`/`Ctrl+V`; debe ser una capability separada por riesgo.

## Modelo De Interaccion Preferido

Abrir picker:

- `Ctrl+Shift+,` muestra la ventana.
- El input de filtro queda enfocado siempre al abrir y al recuperar foco.

Filtrar:

- Escribir filtra resultados inmediatamente.
- La accion se conceptualiza como filtro sobre el historial paginado, no como busqueda separada en memoria.
- Scope actual: texto normalizado, titulo, tags, notas, MIME/tipo y fechas.
- Scope futuro: source app/window, dominio de URL, OCR de imagenes y metadata AI.

Query syntax actual 2026-06-05:

- texto plain busca en `text`, `title`, `notes`, `tags`, `mime_primary` y `content_kind`;
- `"frase exacta"` busca la frase como un termino;
- `-termino` excluye resultados que contengan el termino;
- `tag:foo` o `#foo` filtra por tags;
- `kind:text` / `kind:image` filtra por tipo principal;
- `mime:image/*` o `mime:text/plain` filtra por MIME primario;
- `has:notes`, `has:title`, `has:tags`, `has:metadata`, `has:mime`, `has:blob`, `has:image`;
- `-has:notes` y filtros negados equivalentes;
- `after:YYYY-MM-DD`, `before:YYYY-MM-DD`, `on:YYYY-MM-DD`;
- `after:today`, `after:yesterday` y relativos simples como `after:7d`.

Limitaciones actuales:

- no hay FTS5 todavia, se usa `LIKE` paginado contra SQLite;
- no hay `app:` hasta capturar source process/window;
- tags siguen como string de metadata, no tabla normalizada;
- fechas se interpretan como bounds de dia UTC hasta implementar contexto local mas fino.

Modos de filtro:

- Default MVP: substring case-insensitive.
- Futuro cercano: regex.
- Futuro cercano: fuzzy.
- El modo debe poder cambiarse desde un control discreto, como tres puntitos o menu de search.
- Regex invalida no debe crashear: mostrar error chico y no activar resultados incorrectos.

Navegacion por teclado:

- `Up`/`Down`: mover seleccion un item.
- `PgUp`/`PgDown`: saltar una pagina visual.
- `Home`/`End`: ir al primer/ultimo item visible.
- `Enter`: activar item seleccionado.
- `Shift+Enter`: pegar item seleccionado en ventana previa en MVP 0 Windows.
- `Escape`: limpiar filtro si hay texto; si no hay filtro, ocultar/cerrar ventana segun setting.
- `Space`: candidato para expandir/contraer preview cuando haya truncado.
- `Delete`: dentro del search input solo edita el texto del filtro; no borra items aunque haya seleccion de historial.
- `Shift+Delete`: borra sin confirmacion el item seleccionado o la seleccion multiple visible; es el atajo explicito para no pelear con el input de busqueda.
- `P`: candidato para pin/unpin.
- `Ctrl+N`: abre dialog para crear un item manual sin copiar nada al portapapeles.

Crear item manual:

- entrada first-class del picker, no hack de clipboard;
- superficies actuales: atajo `Ctrl+N`, boton `+`, menu del picker y command palette;
- dialog con `Content` obligatorio y `Metadata` opcional; `Ctrl+Enter` crea;
- crear no escribe ni modifica el portapapeles;
- dedupe por hash del texto normalizado: si ya existe, se promueve arriba y se mergean metadata/tags;
- gotcha 2026-06-22: el autofocus del dialog debe correr solo al abrir; si depende del draft completo, escribir en `Metadata` re-enfoca `Content` en cada tecla.
- validacion 2026-06-22: `Ctrl+N` + escribir `Content` + `Tab` + escribir `Metadata` mantuvo foco en metadata; `Create` agrego item arriba y el clipboard sentinel no cambio. El submit quedo robustecido con `onClick` directo y updates funcionales del draft. Dedupe/promocion queda cubierto por tests Rust y Playwright; la validacion manual via Computer Use puede ser ruidosa si una automatizacion deja un dialog stale.

Activacion:

- MVP inmediato: `Enter` copia el item seleccionado al clipboard y oculta la ventana.
- Despues: setting para que `Enter` pegue en la ventana previa.
- Click selecciona.
- Doble click activa.

Mouse y acciones contextuales:

- Right click o tres puntitos por item abre acciones.
- El menu contextual no muestra `Delete`; borrar es una accion destructive directa via `Shift+Delete` o trash icon.
- Las acciones hover por item aparecen al pasar por la fila; el trash icon borra sin confirmacion el item bajo hover o, si hay multiseleccion activa, los items seleccionados.
- Acciones esperadas restantes: Copy, Paste, Paste as plain text, Pin/unpin, Open full preview/editor, Show details/formats, Move to tab.
- Click fuera/focus lost debe respetar setting de ventana.

## Comportamiento De Ventana

Estado actual 2026-06-22:

- `Pin` es el control explicito de always-on-top. El shortcut nativo `Alt+P` y el boton de la barra deben cambiar el estado real `TOPMOST` de Windows y sincronizar la UI via evento `copicu://picker/pin-state`.
- Fix 2026-06-22: el boton de Pin no debe depender solo de `getCurrentWindow().setAlwaysOnTop()` desde WebView, porque puede cambiar la UI sin cambiar el flag real. Debe usar comandos host-owned (`get_main_window_pin_state` / `set_main_window_pin_state`) y verificar/devuelve el estado real despues de setear. Oracle manual: antes `topmost=False`; click pin => `topmost=True`; click otra vez => `topmost=False`.
- la UI respeta `prefers-color-scheme` con tema inicial light/dark;
- hide-on-focus-lost no debe ocultar inmediatamente en `Focused(false)`;
- politica actual: `Focused(false)` agenda ocultar tras 320 ms; `Focused(true)`, `Moved` o `Resized` cancelan la accion pendiente para no romper mover/redimensionar;
- al ocultar, el estado transitorio del picker se resetea como CopyQ: query vacia, seleccion vacia, anchor vacio y scroll arriba; al refrescar/reabrir se selecciona el primer item visible;
- Decision 2026-06-12: el lifecycle de sesion transitoria del picker es host-owned. `PickerSessionController` marca una sesion hidden/resettable cuando `host::hide_picker()` oculta o cuando el hide nativo por focus-lost ejecuta `window.hide()`. El renderer no debe adivinar ese lifecycle solo por `focus`/`visibilitychange`; consume `consume_picker_session_snapshot()` y, si hay reset pendiente, limpia query/seleccion y refresca historial con `queryOverride: ""`.
- el scroll manual del feed no se debe resetear por refresh automatico del historial. `scrollIntoView` corre solo cuando cambia `selectedIndex`, no cuando cambia `history`.
- Decision ajustada 2026-06-12: `Keep picker open` es la politica persistida para sesion persistente del picker. Cuando esta activa, perder foco no oculta, activar un item no oculta y no resetea query/sesion. El boton de barra del picker toggla esa politica persistida via comando host-owned `set_picker_keep_open` desde `main`; no llama `update_settings` porque ese comando esta guardado para `settings`. En modo transitorio el picker sigue fuera de taskbar/Alt-Tab; con `Keep picker open` activo el host aplica `skip_taskbar=false` para que se comporte como ventana recuperable. `Pin` queda como control generico de ventana para always-on-top; en picker tambien evita ocultado por foco como consecuencia de estar pinned, pero no es la unica forma de mantener abierto. Los intentos de hotkey renderer (`Ctrl+G`, `Ctrl+Shift+O`, `F8`) no fueron confiables en WebView/Computer Use; si se quiere hotkey, implementarlo nativo/global, no como handler React. Computer Use valido el 2026-06-12 que el boton cambia `Keep picker open is on/off`, persiste en backend, deshabilita focus-lost hide y permite activar un item sin ocultar.
- Decision 2026-06-18: abrir el picker por hotkey global debe dejar el search listo para recibir teclado. Se removio el default no-activate porque hacia que el picker pudiera verse delante pero el input siguiera en la app previa. La ruta no-activate queda solo para diagnostico (`COPICU_PICKER_NO_ACTIVATE=1`).
- Validacion stress 2026-06-14 con `copicu_computer_use`: flow usuario real paso con watcher activo en app-data aislada: seleccionar/copiar texto externo en una ventana AHK, abrir picker con `Ctrl+Shift+.`, filtrar por token (`ZETA`, `BETA`, `https stress-flow`), activar con `Enter` y pegar de vuelta en la app fuente. El empty state `0 / 2 matches` tambien se valido. Riesgos detectados: `Get-Clipboard` desde Pi/Session 0 no sirve como oracle del clipboard interactivo; `focus`/target screenshot no prueban foreground real, por lo que los checks de foco deben incluir screenshot de pantalla completa; `F8`/pin puede reportar target de ventana equivocada aunque el hotkey global llegue a Copicu; el wrapper `copicu_computer_use` tuvo un `PermissionError` leyendo temp output pese a que la accion se ejecuto.
- Validacion 2026-06-18: regresion de foco del hotkey cubierta con Computer Use: enfocar ventana externa, `open_picker`, tipear token sin `focus` manual, y confirmar por screenshot que el token entro en el search (`.codex-run/computer-use/focus-hotkey-after-type-2.png`). Este oracle debe repetirse si se toca hotkey, foco, show/hide o lifecycle del picker.

Settings a prever:

- `On activate item`:
  - copy to clipboard and hide;
  - paste to previous window and hide;
  - copy and keep open.
- `On Escape`:
  - clear filter first, then hide;
  - hide immediately.
- `On focus lost`:
  - hide to tray;
  - keep visible.
- `Search mode default`:
  - plain;
  - regex;
  - fuzzy.
- `Preview density`:
  - compact;
  - comfortable;
  - large previews.

En MVP 0, aunque no haya settings UI completa, el codigo debe evitar acoplar estos comportamientos de forma que sean dificiles de configurar despues.

## Tabs Y Colecciones

Tabs gustan como idea, pero no deben bloquear el flujo principal.

Direccion:

- Primero feed principal `Clipboard`.
- Despues `Pinned`.
- Luego smart tabs/filtros como `Links`, `Code`, `Images`, `Files`.
- Tabs persistentes/manuales vienen despues de estabilizar metadata y acciones.

No copiar CopyQ feature-for-feature. Adaptar tabs como filtros/colecciones utiles para Copicu.

## MVP 0 Implementable En Proxima Sesion

1. Cambiar UI principal de lista + preview lateral a feed preview-first.
2. Mantener search input enfocado y filtrado plain.
3. Agregar `Escape` con clear-filter-then-hide.
4. Agregar `Enter` para copy selected item + hide.
5. Agregar `PgUp`/`PgDown`/`Home`/`End`.
6. Agregar click selecciona y doble click activa.
7. Dejar tres puntitos/menu contextual como placeholder visual si no retrasa copy/paste.

Regex/fuzzy deben quedar documentados, pero pueden esperar hasta que copy selected item y paste-to-previous-window esten validados.
