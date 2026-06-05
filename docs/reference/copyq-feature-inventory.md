---
id: copyq-feature-inventory
status: reference
kind: reference
updated: 2026-06-04
sources:
  - https://github.com/hluk/CopyQ
  - https://copyq.readthedocs.io/en/latest/
  - https://copyq.readthedocs.io/en/latest/basic-usage.html
  - https://copyq.readthedocs.io/en/latest/tabs-and-items.html
  - https://copyq.readthedocs.io/en/latest/keyboard.html
  - https://copyq.readthedocs.io/en/latest/images.html
  - https://copyq.readthedocs.io/en/latest/security.html
  - https://copyq.readthedocs.io/en/latest/password-protection.html
  - https://copyq.readthedocs.io/en/stable/command-line.html
  - https://copyq-docs.readthedocs.io/en/latest/writing-commands-and-adding-functionality.html
  - https://copyq-docs.readthedocs.io/en/latest/scripting-api.html
---

# CopyQ Feature Inventory

Referencia para entender que hace CopyQ y decidir que absorber, adaptar, posponer o evitar.

No implica compatibilidad feature-for-feature. Sirve como mapa de producto.

## Resumen Ejecutivo

CopyQ no es solo historial de clipboard. Es una herramienta power-user con:

- historial persistente de clipboard;
- busqueda y picker keyboard-first;
- tabs/colecciones;
- edicion y organizacion de items;
- soporte de formatos ricos: texto, HTML, imagenes y formatos custom;
- tags/notas/pinning;
- tray y shortcuts globales;
- paste hacia la app anterior;
- comandos configurables;
- scripting tipo JavaScript/Qt Script;
- CLI para manipular tabs, items, clipboard y config;
- reglas para ignorar secretos/password managers;
- opciones de seguridad y cifrado;
- theming y customizacion profunda.

## Funciones Base

| Area | CopyQ hace | Relevancia para este proyecto |
| --- | --- | --- |
| Clipboard monitor | Monitorea cambios del clipboard y guarda contenido automaticamente. | Core MVP. |
| Historial | Muestra una lista de items persistidos, restaurados al reiniciar. | Core MVP. |
| Reutilizacion | Copia items al clipboard o los pega directamente en otra aplicacion. | Core MVP, paste directo es riesgo alto. |
| Busqueda | Filtra items tipeando texto; Enter selecciona/copia el primer resultado. | Core MVP. |
| Tray | Ventana y menu accesibles desde tray; menu permite elegir items rapido. | MVP temprano. |
| Keyboard-first | Navegacion por lista/tabs, edicion, borrado, busqueda y acciones por shortcuts. | Direccion de UX principal. |

## Items E Historial

- Crear item nuevo manualmente.
- Editar item de texto.
- Borrar items.
- Copiar items al clipboard.
- Pegar item seleccionado en ventana previa, opcionalmente con Enter.
- Reordenar items por teclado o drag and drop.
- Ordenar items.
- Mover/copiar items entre tabs.
- Restaurar items entre sesiones.
- Mostrar contenido/formats disponibles en un item.
- Guardar contenido clipboard normalizado para busqueda y contenido raw/MIME para fidelity.

## Tabs, Colecciones Y Organizacion

- Un tab inicial de clipboard.
- Crear/remover/reordenar tabs.
- Navegar tabs por teclado.
- Tab tree para agrupar tabs por nombres con `/`.
- Acceso rapido por letras en nombres con `&`.
- Organizar automaticamente items en tabs segun comandos/reglas.
- Usos CopyQ documentados: tabs para codigo, URLs, imagenes, notas o colecciones.

## Formatos De Contenido

| Formato | CopyQ soporta | Implicacion |
| --- | --- | --- |
| Plain text | Si. | MVP. |
| HTML | Si. | Rich content fase 2. |
| Imagenes | Si, con plugin en Windows; previews y editor externo. | Fase 2/3, requiere blobs/thumbnails. |
| SVG | Si, via formatos de imagen/plugin. | Posponer salvo necesidad real. |
| File paths / file lists | Reutilizacion documentada via FAQ/commands. | Posponer, pero disenar MIME flexible. |
| Custom MIME formats | Si. | No copiar completo al inicio; guardar raw formats estrategicos. |

## Imagenes

- Mostrar items de imagen.
- Configurar limite visual de ancho/alto.
- Preview dock o dialogo de contenido para ver imagen completa.
- Editar imagen con editor externo configurado.
- Capturar screenshots y guardarlos como items.
- Guardar imagen a archivo via CLI o comando.

## Tags, Notas Y Pinning

- Tags como iconos o textos cortos sobre items.
- Reglas de estilo/matching para tags.
- Notas asociadas a items.
- Pinning de items para preservarlos o separarlos del historial comun.

Para este proyecto: favorites/pinned antes que sistema de tags completo.

## Commands, Acciones Y Automatizacion

CopyQ permite agregar funcionalidad de tres maneras:

- comandos en menu/context menu para items seleccionados;
- comandos automaticos cuando cambia el clipboard;
- shortcuts globales que disparan comandos.

Los comandos pueden:

- ejecutar una linea de comando;
- usar interpretes como bash, PowerShell o Python;
- ejecutar scripts CopyQ;
- recibir input por formato MIME;
- matchear por regex de contenido;
- matchear por titulo de ventana activa;
- validar con filtros;
- copiar salida a un tab;
- transformar/remover items;
- dividir salida en varios items;
- mostrarse en menu o tray;
- exportarse/importarse para compartir.

## Scripting Y CLI

CopyQ expone una CLI y una API scriptable. La app principal debe estar corriendo para ejecutar comandos.

Capacidades relevantes:

- `show`, `hide`, `toggle`, `menu`;
- `disable`, `enable`, `monitoring`;
- leer clipboard por MIME;
- listar formatos disponibles;
- setear clipboard con uno o mas MIME types;
- enviar copy/paste al sistema;
- listar/cambiar tabs;
- `add`, `insert`, `remove`, `edit`, `read`, `write`, `change`;
- seleccionar item y moverlo al top segun config;
- popups/notificaciones;
- acceder a selected items;
- callbacks para clipboard changes, unchanged, hidden y secret data;
- diagnosticos de estado/data/plugins/logs/procesos.

Esto es muy poderoso pero caro. Si se absorbe, conviene empezar con una CLI propia chica y comandos predefinidos, no con un runtime scriptable completo.

## Seguridad Y Privacidad

- Por defecto puede guardar texto e imagenes automaticamente.
- Permite deshabilitar almacenamiento automatico.
- Permite ignorar contenido copiado desde ventanas cuyo titulo matchee reglas.
- Reconoce clipboard marcado como secreto y lo ignora por defecto.
- Indicadores de secreto por plataforma:
  - Linux: `x-kde-passwordManagerHint=secret`.
  - macOS: `application/x-nspasteboard-concealed-type`.
  - Windows: `Clipboard Viewer Ignore`, `ExcludeClipboardContentFromMonitorProcessing`, `CanIncludeInClipboardHistory=0`, `CanUploadToCloudClipboard=0`.
- No envia datos por red segun su documentacion.
- Datos de tabs se guardan sin cifrar salvo que se active encryption.
- Cifrado built-in desde CopyQ 14 para todos los tabs cargados.
- Puede usar key store externo de plataforma: Windows Credential Store, macOS Keychain, GNOME Keyring o KWallet.
- Export puede quedar sin cifrar salvo password opcional.

Para este proyecto: esto debe entrar temprano como criterio de diseno, aunque el cifrado pueda ser posterior.

## Theming Y UX Avanzada

- Apariencia customizable.
- Style sheets.
- Editor simple tipo Vim con shortcuts.
- Shortcuts configurables.
- Menu bar ocultable.
- Ventana principal, tray menu, preview docks/dialogs y action dialogs.

Para este proyecto: no copiar la superficie completa. Priorizar picker discreto, rapido y legible.

## Compatibilidad Y Riesgos Observados

- Paste depende mucho de la app destino y del window manager.
- En Windows puede haber problemas para imprimir output de CLI en terminal.
- En macOS pueden aparecer restricciones de permisos para paste.
- En GNOME/Wayland algunas funciones pueden fallar o requerir caminos especiales.
- Rich clipboard fidelity requiere manejar muchos MIME formats y plugins.

## Lectura Para Roadmap

### Absorber temprano

- historial persistente;
- busqueda rapida;
- picker por shortcut global;
- tray;
- keyboard navigation;
- copy selected item;
- paste selected item to previous window;
- edit/delete;
- favorites/pinned;
- retention limits;
- ignored windows/apps;
- secret clipboard detection, especialmente Windows.

### Absorber despues

- HTML e imagenes con thumbnails;
- tabs/collections;
- tags/notas;
- comandos predefinidos;
- acciones como paste plain text, open URL, copy escaped string;
- backup/export/import;
- config de shortcuts.

### Evaluar con cuidado

- CLI completa;
- scripting runtime;
- comandos automaticos arbitrarios;
- custom MIME exhaustive fidelity;
- screenshot capture;
- external editors;
- built-in encryption;
- plugin system.

### Evitar como objetivo inicial

- compatibilidad con scripts CopyQ;
- paridad total de comandos CopyQ;
- plugin marketplace;
- replicar todos los dialogs y configuraciones;
- prometer comportamiento identico cross-platform.

## Decision Recomendada

Mantener la decision "CopyQ como baseline funcional fuerte, sin compatibilidad feature-for-feature", y usar CopyQ asi:

- CopyQ deja de ser una referencia vaga.
- CopyQ pasa a ser un inventario de capacidades.
- Cada spec nueva debe declarar que funciones CopyQ absorbe, adapta, pospone o excluye.
