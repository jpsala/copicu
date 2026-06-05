---
id: product-ambition
status: active
kind: decision-map
triggers:
  - Copicu
  - CopyQ baseline
  - AI
  - plugins
  - metadata
  - product ambition
primary_refs:
  - ../PROJECT.md
  - product-direction.md
  - ../reference/copyq-feature-inventory.md
---

# Ambicion De Producto

## Tesis

Copicu toma CopyQ como baseline funcional fuerte, pero no busca ser un clon ni mantener compatibilidad directa con sus comandos o scripting.

La apuesta es construir un clipboard manager local mas rapido, moderno, bonito y poderoso:

- UI/UX mas actual y keyboard-first;
- busqueda mas potente que el filtro simple de CopyQ;
- metadata estructurada por item para buscar, agrupar, razonar y automatizar sin contaminar el contenido copiado;
- plugins personales escritos en JavaScript/TypeScript para extensibilidad propia, sin sobrecomplicar con marketplace, sandbox o permisos finos al inicio;
- Rust para integraciones nativas, performance y piezas del host de plugins cuando haga falta;
- AI integrada como capacidad de producto, no como adorno.

## Funciones Que Seguro Debe Tener

### Clipboard History

- Capturar texto copiado.
- Capturar HTML/rich text cuando sea relevante.
- Capturar imagenes copiadas.
- Guardar screenshots o recortes de pantalla, probablemente delegando la captura a un utilitario o modulo especializado.
- Persistir historial localmente.
- Deduplicar por hash/contenido.
- Reutilizar items copiandolos al clipboard o pegandolos en la ventana anterior.

### Picker Principal

- Hotkey global obligatorio para abrir la ventana principal, como primer caso de un sistema mas amplio de comandos globales.
- Ventana de historial/picker inspirada en CopyQ, pero no limitada por su UX.
- Navegacion por teclado desde el inicio.
- Acciones rapidas sobre un item o multiples items.
- Previews utiles para texto, codigo, URLs, HTML e imagenes.

### Busqueda Potente

- Busqueda full-text rapida.
- Filtros por tipo de contenido, fecha, origen, tags/metadata y favoritos.
- Busqueda sobre metadata sin modificar el payload real.
- Espacio para busqueda semantica/AI mas adelante.
- Ranking mas inteligente que un filtro literal simple.

### Metadata Por Item

Cada item debe poder tener metadata estructurada, separada del contenido:

- tipo principal: text, html, image, file-list, unknown;
- MIME formats disponibles;
- hashes;
- timestamps de creacion, captura y ultimo uso;
- origen si se puede obtener: app, window title, URL/contexto;
- dimensiones y tamano para imagenes;
- OCR/caption/descripcion para imagenes si se habilita AI;
- tags, notas, flags, favoritos/pins;
- estado opcional de privacidad/sensibilidad, postergable mientras el producto sea de uso personal;
- metadata producida por plugins;
- metadata producida por AI.

Principio: la metadata aumenta busqueda y automatizacion sin contaminar el texto o imagen original.

### Hotkeys

- Sistema de hotkeys configurable para comandos globales y comandos dentro de la app.
- Hotkey global para abrir Copicu como caso minimo, no como unico uso global.
- Hotkeys para acciones frecuentes: copiar, pegar, borrar, editar, pin/favorite, abrir acciones.
- Hotkeys globales para acciones frecuentes cuando valga la pena ejecutarlas sin abrir primero el picker.
- Potencialmente hotkeys registradas por plugins personales, con resolucion simple de conflictos.
- Cada plugin o comando de plugin puede declarar un hotkey propio, si aporta suficiente valor.
- Idealmente soportar hotkeys compuestas/chords, por ejemplo `Win+A, J`, para evitar agotar combinaciones simples y permitir namespaces ergonomicos.

### Plugins

El sistema de plugins es parte central del producto, pero al inicio se piensa para uso personal del autor. No debe arrancar como plataforma publica ni como sistema de terceros no confiables.

Debe permitir plugins que:

- trabajen sobre un item;
- trabajen sobre muchos items;
- hagan queries al historial;
- agreguen metadata;
- transformen contenido;
- creen acciones de menu/hotkeys;
- usen AI;
- integren herramientas externas;
- puedan ir desde tareas simples hasta workflows complejos.

Direccion tecnica inicial:

- JavaScript/TypeScript como superficie principal para escribir plugins; no requerir saber Rust para crear automatizaciones personales.
- Rust para host, IPC, clipboard nativo y performance-sensitive paths, idealmente invisible para quien escribe plugins.
- API propia, no compatibilidad con scripts CopyQ.
- Plugins instalables, editables, deshabilitables y eliminables sin recompilar la app, siempre que usen APIs ya expuestas por el host.
- Cargar plugins desde un directorio de usuario, con manifiesto y codigo externo al binario Tauri/Rust.
- Permitir recarga manual o automatica de plugins durante uso/desarrollo, si la complejidad lo permite.
- Recompilar solo cuando cambie el host, la API nativa disponible o una capability Rust nueva.
- Python queda como posibilidad futura para scripts/adapters externos, no como runtime principal inicial, salvo que aparezca una necesidad muy concreta.
- Modelo de confianza local: los plugins iniciales son codigo propio/confiable.
- Evitar por ahora sandbox complejo, permisos granulares, firma, marketplace o aislamiento fuerte.

### AI

AI debe considerarse una capacidad transversal:

- resumir clips largos;
- titular items;
- taggear automaticamente;
- OCR/caption de imagenes;
- busqueda semantica;
- transformar texto;
- extraer datos estructurados;
- agrupar historial por tarea/contexto;
- sugerir acciones o workflows.

Pendiente: decidir que parte corre local y que parte usa APIs externas. La politica fina de privacidad/permisos queda postergada mientras el producto sea personal.

### Tray Y Comportamiento Desktop

- Tray app.
- Hide instead of quit.
- Launch at login opcional.
- Single instance.
- Menu basico desde tray.
- Indicadores discretos de estado: monitoring on/off y errores.

## Herramientas A Evaluar

Estas son candidatas, no decisiones cerradas.

| Area | Candidatos | Por que |
| --- | --- | --- |
| Shell desktop | Tauri 2 | Stack objetivo, app local liviana. |
| UI | React/Vite + MUI o alternativa headless/custom | MUI acelera componentes complejos; evaluar si se puede customizar sin verse generico. |
| Data/query UI | TanStack Query, TanStack Table, TanStack Virtual | Buen fit para listas grandes, queries locales, filtros y tablas/virtualizacion. |
| Routing/state | TanStack Router, Zustand/Jotai u opcion simple | Solo si la app crece; no sobre-arquitecturar el picker. |
| Clipboard/hotkeys | Tauri plugins + Rust propio | Plugins cubren parte, pero likely hacen falta gaps nativos. |
| Search | SQLite FTS5 + ranking propio | Base fuerte para texto/metadata. |
| Semantic search | embeddings locales o API externa | Investigar despues de estabilizar storage. |
| Plugins | runtime JS/TS simple + host Rust | Primero plugins personales; evitar sandbox/permisos complejos hasta que haya necesidad real. |
| Screenshots | utilitario externo o crate/plugin nativo | No reinventar si existe una herramienta confiable. |

## Huecos Importantes A No Olvidar

- Modelo exacto de metadata y schema inicial.
- Retention: cantidad, edad, tamano total y excepciones para pinned.
- Export/import/backup.
- Que pasa con contenido enorme o binario.
- Como preservar formatos ricos sin inflar SQLite.
- Como restaurar clipboard anterior despues de paste temporal.
- Como testear clipboard sin persistir datos reales.
- Diagnosticos: logs seguros, panel de errores, health checks.
- Accesibilidad y ergonomia: todo lo importante debe ser usable por teclado.
- Politica fina de privacidad, sandbox de plugins y manejo avanzado de secretos quedan explicitamente postergados por ahora.

## Reencuadre De Alcance

El MVP no deberia ser pobre. Debe ser chico pero representativo:

- texto;
- imagen/screenshot como riesgo temprano, aunque sea spike separado;
- picker rapido;
- hotkey global;
- metadata inicial;
- storage SQLite + blobs;
- busqueda decente;
- tray;
- paste/copy;
- base minima para plugins runtime-loadable o al menos arquitectura preparada para cargar plugins externos sin recompilar.

Lo que puede esperar no es porque sea poco importante, sino porque puede destruir el calendario:

- runtime completo de plugins con lifecycle avanzado, aislamiento, permisos finos y tooling pulido;
- sandbox/permisos complejos para plugins;
- scripting avanzado;
- AI profunda;
- semantic search;
- compatibilidad multi-OS completa;
- fidelidad exhaustiva de todos los MIME formats.
