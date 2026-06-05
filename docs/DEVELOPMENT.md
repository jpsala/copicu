# Desarrollo Del Proyecto

## Estado

Proyecto en etapa inicial. Todavia no hay scaffold de aplicacion ni package manager definido en archivos.

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

Rust:

- watcher de clipboard;
- normalizacion y hashing;
- acceso SQLite si el plugin SQL no alcanza;
- paste-to-active/previous-window;
- modulos especificos por OS;
- host de plugins/runtime bridge;
- coordinacion de tareas background.

Plugins:

- vivir fuera del binario compilado, en un directorio de usuario o workspace documentado;
- tener manifiesto con id, nombre, version, comandos, hotkeys y permisos/capabilities declaradas aunque al inicio sean simples;
- cargar, deshabilitar, editar y eliminar plugins sin recompilar Copicu;
- recargar plugins manualmente y, si conviene, con file watching durante desarrollo;
- usar JavaScript/TypeScript como lenguaje principal de autor de plugins, porque no debe requerir saber Rust o Tauri para extender la app;
- llamar al host Rust/Tauri solo a traves de una API estable para clipboard, storage, busqueda, UI actions, hotkeys y capacidades nativas;
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

No hay comandos definidos todavia. Cuando se cree el scaffold, actualizar esta seccion con:

- instalar dependencias;
- ejecutar dev server/app;
- test;
- lint;
- build;
- comandos Tauri.

## Verificacion

Antes de cerrar cambios:

1. Ejecutar checks disponibles.
2. Verificar manualmente flujo afectado.
3. Para UI, probar desktop y ventana angosta si aplica.
4. Para clipboard, evitar datos reales y usar fixtures sinteticos.
5. Actualizar docs si cambia una decision durable.
