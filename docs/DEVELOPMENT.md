# Desarrollo Del Proyecto

## Estado

Scaffold inicial creado con Tauri 2, React, Vite y TypeScript. El MVP 0 sigue en fase de native spike: watcher, tray, shortcut `Ctrl+Shift+,`, SQLite inicial, reload post-restart, picker preview-first, copy/hide, API host, self-write suppression y paste-to-previous-window ya estan implementados. Paste default es target-aware en Windows: browsers conocidos usan `Ctrl+V`; otros targets usan `Shift+Insert`. El siguiente corte tecnico es cerrar verificaciones restantes del MVP 0 y decidir si el delay post-focus de 700 ms queda temporal o configurable.

## Stack Objetivo

- Desktop shell: Tauri 2.
- Frontend: TypeScript con React/Vite o Solid.
- Backend nativo: Rust.
- Persistencia: SQLite para metadata e historial normalizado.
- Blobs: directorio local para imagenes y payloads grandes.

## Plugins Tauri A Evaluar

- `@tauri-apps/plugin-clipboard-manager`
- `@tauri-apps/plugin-global-shortcut`
- `@tauri-apps/plugin-sql`
- autostart
- single-instance
- store/window-state

## Alternativas Evaluadas

- Electron podria acelerar un prototipo, pero no es la opcion preferida si el objetivo sigue siendo una app local liviana de largo plazo.
- Electrobun queda descartado para el arranque: este proyecto necesita clipboard, global shortcut, tray, paste e integraciones nativas maduras.

## Arquitectura Esperada

Frontend:

- picker searchable;
- preview y edicion de items;
- settings;
- navegacion por teclado;
- menus de acciones.
- cliente de la API host: no debe ser dueño exclusivo de logica durable de clipboard, paste, ventana o storage.

Rust:

- watcher de clipboard;
- normalizacion y hashing;
- acceso SQLite si el plugin SQL no alcanza;
- API host para acciones reutilizables por UI, shortcuts, tray y plugins;
- paste-to-active/previous-window;
- modulos especificos por OS;
- host de plugins/runtime bridge;
- coordinacion de tareas background.

API host inicial esperada:

- `history.list/search/get/markUsed/delete/pin`.
- `clipboard.writeItem/writeText/readPreview`.
- `picker.show/hide/focus/filter/select/activateItem`.
- `window.rememberPrevious/focusPrevious`.
- `input.sendPasteShortcut`.
- `settings.get/set`.

Las acciones compuestas deben aceptar opciones explicitas. Ejemplo:

```text
activateItem(itemId, {
  copy: true,
  hidePicker: true,
  focusPrevious: false,
  paste: false,
  pasteShortcut: "default"
})
```

En MVP 0, `Enter` usa copy + hide y `Shift+Enter` usa copy + hide + focus previous + paste. Para paste-to-previous-window, seguir el baseline CopyQ: copiar al clipboard primero, ocultar/enfocar ventana previa y luego enviar `Shift+Insert` por defecto, con posibilidad futura de `Ctrl+V` por regla.

Plugins:

- vivir fuera del binario compilado, en un directorio de usuario o workspace documentado;
- tener manifiesto con id, nombre, version, comandos, hotkeys y permisos/capabilities declaradas aunque al inicio sean simples;
- cargar, deshabilitar, editar y eliminar plugins sin recompilar Copicu;
- recargar plugins manualmente y, si conviene, con file watching durante desarrollo;
- usar JavaScript/TypeScript como lenguaje principal de autor de plugins, porque no debe requerir saber Rust o Tauri para extender la app;
- llamar al host Rust/Tauri solo a traves de una API estable para clipboard, storage, busqueda, UI actions, hotkeys y capacidades nativas;
- usar las mismas primitivas que la UI para activar items, escribir clipboard, ocultar picker, enfocar ventana previa y pegar;
- requerir recompilacion solo para cambios del host, APIs nativas nuevas o capabilities que no existan todavia;
- evaluar Python como runner externo opcional para scripts locales o librerias especificas, pero no asumirlo para el primer runtime.

Modelo compartido:

- id de item;
- timestamps de creacion y ultimo uso;
- tipo de contenido: text, html, image, file-list, unknown;
- campo plain text para busqueda;
- payload raw o referencia a blob;
- metadata de origen cuando exista;
- flags favorite/pinned;
- tags o colecciones mas adelante.

## Spikes Tecnicos Prioritarios

1. Clipboard monitor reliability:
   - detectar texto, HTML e imagenes;
   - evitar capturas duplicadas;
   - mantener bajo CPU en idle.
2. Paste-to-previous-window:
   - abrir picker con global shortcut;
   - seleccionar item;
   - restaurar foco anterior;
   - setear clipboard temporalmente;
   - enviar paste command;
   - restaurar clipboard anterior si corresponde.
3. SQLite y blob storage:
   - persistir 10k+ items;
   - buscar rapido;
   - guardar imagenes sin inflar la DB.
4. Tray y comportamiento de ventana:
   - hide instead of quit;
   - launch at login;
   - single instance;
   - posicionamiento rapido del picker.

Estos spikes van antes de invertir fuerte en polish de UI.

## Milestones Iniciales

1. Skeleton:
   - crear app Tauri 2;
   - agregar tray;
   - agregar global shortcut;
   - abrir/cerrar picker;
   - settings window basica.
2. Clipboard capture:
   - capturar texto;
   - guardar en SQLite;
   - renderizar history list;
   - deduplicar contenido consecutivo identico.
3. Picker workflow:
   - search;
   - keyboard navigation;
   - copiar item seleccionado al clipboard;
   - pegar item seleccionado en app previa, empezando por Windows si no se define otra plataforma.
4. Rich content:
   - captura y paste de HTML;
   - captura, thumbnails y paste de imagenes;
   - limites de tamano y retention policy.
5. Power features:
   - favorites;
   - collections/tabs;
   - item editing;
   - acciones basicas: open URL, paste as plain text, copy escaped string.

## Comandos

Desde la raiz del repo:

```powershell
npm install
npm run dev
npm run dev:restart
npm run dev:built:fresh
npm run build
npm run visual:check
npm run rust:test
npm run image:sources
npm run tauri:dev
npm run tauri:build
```

## Runtime Dev Vivo

Regla operativa: mientras no exista un binario instalable estable, los cambios deben reflejarse en la instancia viva de Copicu.

`npm run dev:restart` usa built-dev por defecto para evitar la inestabilidad de Vite dev server en WebView2. Esta es una decision operativa: el modo diario prioriza confiabilidad nativa sobre HMR. Para dogfood real de Copicu usar built-dev; para diagnosticar Vite dev explicitamente, usar:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/restart-dev.ps1 -ViteDev
```

Antes de arrancar o reiniciar:

```powershell
Get-NetTCPConnection -LocalPort 1420 -ErrorAction SilentlyContinue
Get-CimInstance Win32_Process |
  Where-Object { $_.CommandLine -match 'copyq-tauri|copicu|tauri dev|vite --host 127.0.0.1 --port 1420' } |
  Select-Object ProcessId,Name,ExecutablePath,CommandLine
```

Cerrar solo procesos viejos de Copicu/Vite/Tauri que correspondan al producto y esten ocupando el puerto, registrando shortcuts o corriendo desde otro worktree. Despues de relanzar, validar:

- Vite escucha `127.0.0.1:1420`.
- `copicu.exe` corre desde el worktree actual.
- Los logs muestran `global shortcut registered`, `main window startup state: visible=false` y los shortcuts/rutas esperadas.
- La app responde (`Get-Process -Name copicu | Select Id,Responding,Path`).

Si el branch esta atrasado respecto de la DB real y aparece `migration number too high`, no downgradear ni borrar la DB real de AppData. Para dogfood de branch/worktree, usar datos aislados:

```powershell
$env:CARGO_TARGET_DIR = "$PWD\src-tauri\target-hotkeys-dev"
$env:COPICU_APP_DATA_DIR = "$PWD\.codex-run\app-data"
npm run tauri:dev
```

Guardar logs de reinicio bajo `.codex-run/` cuando se lance en background, y revisar `stderr` antes de decir que la app quedo actualizada.

Checks actuales:

```powershell
npm run build
npm run visual:check
npm run rust:test
cd src-tauri
cargo check
```

En esta maquina, `cargo test` crudo puede fallar con `STATUS_ENTRYPOINT_NOT_FOUND` si el loader toma DLLs API-set desde Miniconda. Usar `npm run rust:test`, que ejecuta `cargo test` con entradas `miniconda3` removidas de `PATH` para ese proceso.

Todavia no hay comando de lint dedicado.

Validacion manual de paste-to-previous-window en Windows, con `npm run tauri:dev` ya corriendo y `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222`:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tests/manual/validate-paste-targets.ps1
```

El script usa solo tokens sinteticos y targets temporales: Notepad, Chrome/Edge con HTML local y un editor-like WinForms TextBox. Browser usa `pasteShortcut: "default"` para validar la regla target-aware.

Validacion manual de fuentes de imagen en Windows, con `npm run tauri:dev` ya corriendo y `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222`:

```powershell
npm run image:sources
```

El script usa imagenes sinteticas y fuentes comunes: screenshot, Paint, browser y Snipping Tool.

## Investigacion De Documentacion

Usar Context7 CLI bajo demanda para consultar documentacion tecnica actual sin cargar un MCP persistente:

```powershell
npx ctx7 library tauri "global shortcut plugin"
npx ctx7 docs /websites/v2_tauri_app "global shortcut register Tauri 2"
```

Validar con documentacion oficial, GitHub o issues cuando el resultado defina arquitectura, permisos, bugs por plataforma o cambios recientes.

Antes de incorporar librerias o fijar una arquitectura para una necesidad tecnica, documentar la investigacion en topics:

- `docs/topics/technical-research-process.md`
- `docs/topics/clipboard.md`
- `docs/topics/global-shortcut-and-tray.md`
- `docs/topics/sqlite-storage.md`
- `docs/topics/windows-focus-and-paste.md`

Cada topic debe cubrir discovery, opciones evaluadas, fuentes, pattern recomendado, decision actual y preguntas abiertas.

## Verificacion

Antes de cerrar cambios:

1. Ejecutar checks disponibles.
2. Verificar manualmente flujo afectado.
3. Para UI, probar desktop y ventana angosta si aplica.
4. Para UI relevante, usar `pbakaus/impeccable` si esta disponible y no bloquea el corte.
5. Para clipboard, evitar datos reales y usar fixtures sinteticos.
6. Actualizar docs si cambia una decision durable.
