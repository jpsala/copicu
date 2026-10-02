---
title: Controles compartidos de carpetas
summary: Selección, navegación y creación por ruta con cambios de metadata preparados hasta guardar.
keywords: [folders, carpetas, metadata, selector, rutas, keyboard]
---

# Controles compartidos de carpetas

`FolderSelect` es un control de destino reusable: muestra ruta actual o selección mixta y abre un árbol compacto de carpetas. Vive en metadata, editor de contenido, creación manual de clips y diálogos de destino. El diálogo de reparenting sólo permite destinos existentes y excluye la carpeta movida y sus descendientes. `/` es destino; All history sólo sirve para navegación.

Las filas conservan nombres, iconos, flechas y sangría tanto al explorar como al buscar. La búsqueda conserva las coincidencias con todos sus ancestros y abre las ramas necesarias; al limpiar el filtro se restaura la expansión anterior. Buscar nombres filtra por nombre; una consulta con slash permite buscar rutas. Abrir el selector revela el destino actual. Un clic marca un candidato; «Choose folder», Enter o doble clic confirman el destino. Las flechas sólo expanden/contraen. No se cambian filas por rutas planas ni se agrega una segunda navegación con breadcrumbs.

Elegir o escribir no produce escrituras. «New folder» inserta una fila editable debajo del candidato seleccionado y revela su rama. El nombre o ruta anidada es relativo a ese padre; no admite slash inicial para que la ubicación visual sea inequívoca. Durante esa edición la búsqueda queda deshabilitada; Escape o cancelar restaura el filtro anterior. «Create and choose» prepara la ruta absoluta; la creación ocurre al guardar metadata, crear el clip o ejecutar el movimiento. Una ruta existente ofrece «Choose folder» sin duplicarla. Buscar sin resultados y presionar Enter no crea nada. SQLite resuelve los ancestros existentes y crea sólo los faltantes dentro de la misma transacción que los cambios del clip. Cancelar/Undo y fallos no dejan carpetas nuevas. Una selección vacía o eliminada tampoco crea un destino huérfano.

Rutas existentes se identifican con la semántica ASCII de SQLite NOCASE; búsquedas pueden ignorar caso más ampliamente. Nombres mantienen la validación vigente: se recortan espacios y se rechazan segmentos vacíos, slash dentro de un nombre y caracteres de control. No interpretar nombres `.`/`..` como navegación del filesystem: son carpetas virtuales del producto. El modelo y contrato de guardado mantienen rutas absolutas; la fila de creación recibe nombres/rutas relativas al padre seleccionado. No crear duplicados cuando una ruta ya existe.

El buscador conserva foco, Up/Down activan filas, Enter elige la opción activa y Escape cierra con retorno al campo. En el árbol, Left/Right contraen/expanden o recorren padre/hijo; Home/End saltan a los extremos. Tab conserva el orden de foco; salir del panel vuelve al formulario. Panel en portal, medido en viewport y limitado a 440 px o al ancho disponible; no montarlo dentro de contenedores recortados. El diálogo de nuevo clip debe cubrir el sidebar tanto visualmente como para los clics.

`FolderTree` renderiza las mismas filas para `FolderSelect` y `FolderNavigator`: iconos, expansión, selección, detalles y filas insertadas. `FolderNavigator` conserva la interacción por teclado del picker, sin comandos de almacenamiento: el padre aporta selección, expansión, menú, drop y salida al feed. `FolderWorkspace` conserva la coordinación del picker; `Ctrl+P` sigue usando ranking plano y el desplegable usa filtrado jerárquico. El destino de captura sigue separado del alcance de navegación.

Metadata agrega un agregado de carpeta same/mixed y un intent untouched/set/create, integrado en dirty state, Undo, resumen y guardado. El snapshot token incluye la carpeta de cada clip y su ruta: mover, renombrar o cambiar un ancestro invalida el guardado anterior. Nuevos clips preservan la deduplicación; elegir explícitamente una carpeta también mueve el clip existente, mientras untouched conserva la ubicación previa. Cambios de carpetas emiten el evento de historial para renovar opciones en otras ventanas.

En metadata multiselección, Tags muestra «Keep each clip’s tags» por defecto. «Edit tags…» revela las operaciones masivas; abrir los controles no genera intents. La entrada explícita de editar tags los abre directamente. Sólo adiciones/eliminaciones pedidas entran al resumen; si hay otros cambios y ningún intent de tags, el resumen aclara «Tags unchanged». Mover clips con tags diferentes envía `tags: []`, conservando cada relación individual.

Contrato: [spec del componente](../../specs/017-shared-folder-controls/spec.md). Verificaciones sintéticas: `tests/folder-model.test.ts`, `tests/metadata-inspector.test.ts`, casos `shared folder selector` de `tests/visual/shell.spec.ts` y tests de carpetas/metadata en `src-tauri/src/storage.rs`. La app instalada y un perfil de historial real no son fixtures de prueba.
