# Diseño de interacción: portapapeles compartidos

Estado: recorrido base implementado y validado localmente; identidad/servicio remotos
y aceptación en dos PCs pendientes. Origen: JP, 2026-10-02.
Confirmado: cada persona tiene su espacio; la carpeta permite elegir/crear y
enviar/recibir; se consulta lo anterior disponible sin importación automática.
JP añadió conexión general y pausas por dirección, con alcance cambiable en Settings.
Decisiones técnicas y límites en [plan.md](plan.md); analogías y alternativas en
[sharing-patterns.md](sharing-patterns.md). Defaults sugeridos son propuestas;
los concretados para el fixture local están en el plan. Evidencia del recorrido
y SSE S1–S6 en [aceptación local](local-acceptance.md).

## Concepto visible

Un portapapeles compartido tiene dueño, participantes, publicaciones e historial
disponible. Puede usarse sin carpeta, desde su vista o por script. La carpeta
conectada muestra cómo envía/recibe en este equipo. Identidades remotas, ubicación
local y portapapeles de Windows permanecen separados detrás de controles simples.

Conservar estilo de producto existente: compacto, discreto, teclado primero,
fuente y tokens de Copicu. Referencias de interacción: selector de carpetas local,
direcciones de Syncthing, acceso de Dropbox, invitaciones de Signal. No se cambia
paleta ni se crea una estética nueva para este feature.

## A. Conectar desde una carpeta

Entrada: menú contextual o … de la carpeta → Conectar portapapeles….
Panel junto al contexto, con dos decisiones principales:

- Portapapeles: selector searchable, grupos Míos y Compartidos conmigo; nombre,
  propietario y permiso visibles. Recursos recientes se pueden priorizar dentro
  de esos grupos sin cambiar la selección.
- Dirección: Enviar / Recibir / Enviar y recibir. Selección inicial propuesta:
  Recibir; opciones sin permiso deshabilitadas con explicación.

El selector contiene Crear portapapeles… como fila de edición con nombre.
Seleccionar o escribir sólo modifica el draft. Confirmación: Conectar o
Crear y conectar. No crear por Enter si la búsqueda no tiene coincidencias.

Resumen de ejemplo antes de confirmar:

> /Trabajo enviará sus nuevos textos a Proyecto y guardará allí los nuevos textos
> recibidos. El contenido anterior de /Trabajo queda local.

Mostrar participantes o Sólo tus equipos, con enlace para inspeccionar acceso.
El historial remoto disponible se consulta aparte. No sumar retención, JSON,
huellas, rutas técnicas ni elección de proveedor al formulario básico.

Si falta vinculación, Resolver acceso guarda el draft, hace la vinculación y vuelve
a la misma carpeta. Estados: Accediendo / Esperando aprobación del equipo /
Pendiente de claves / No se pudo vincular, con reintento concreto.
El enrollment por archivo se conserva sólo como preparación técnica.

Una carpeta tiene un recurso conectado en el primer corte. Varias carpetas pueden
enviar al mismo recurso. Si ya recibe en otra carpeta de este perfil, el panel
muestra esa carpeta y permite trasladar la entrada al confirmar; nunca la pisa
silenciosamente. No heredar conexión a subcarpetas.

Una creación confirmada puede existir remotamente aunque falle conectar localmente:
Creado; falta conectar, con Reintentar y Abrir portapapeles. Cancelar el draft previo
no crea nada. Reintentar una respuesta perdida usa la misma operación.

## B. Usar la carpeta conectada

Mostrar una indicación compacta con nombre del recurso, dirección y estado.
El detalle revela: conectado, pausado, envío en cola, error o acceso cambiado.
Los estados tienen texto accesible, no dependen sólo de color ni icono.

Desde el mismo menú: Ver compartido, Editar conexión, Pausar envío, Pausar recepción,
Desconectar. Renombrar/mover la carpeta conserva conexión por ID.
Borrarla desconecta sus efectos; no elimina el recurso remoto ni lo redirige a Root.

Enviar significa nuevos ingresos locales a la carpeta exacta. El movimiento manual
de clips locales puede enviar según la regla; editar texto/tags no lo hace.
Los contenidos recibidos conservan origen remoto aunque se muevan después.
Enviar contenido existente… es una acción distinta con selección/cantidad explícitas.

## C. Consultar y administrar

Portapapeles compartidos es una superficie del producto accesible desde carpeta,
acción global y selector. Lista recursos propios y autorizados, con búsqueda.
Crear funciona igual que en el selector. No requiere configurar carpeta.

Al abrir un recurso, mostrar publicaciones con autor/equipo, hora y estado.
Se pueden copiar, guardar localmente o enviar un texto nuevo. Historial previo
se carga por páginas según permisos/retención, con gaps/expiración explícitos.
Consultar no importa, cambia Windows ni ejecuta una Action.

Envíos y recepciones se distinguen: En cola, Aceptado por servicio, Guardado en
este equipo y Windows actualizado son resultados diferentes. Entrega se informa
por dispositivo cuando hay confirmación; no mostrar Visto sin implementarlo.

Guardar en carpeta es explícito. Si el mismo texto ya existe en /Otra,
mostrar Ya existe en /Otra con Abrir o Mover a carpeta elegida; no duplicar o mover por defecto.
Buscar por contenido en toda la colección remota no se promete en el primer corte;
búsqueda inicial de catálogo/metadata y preview bajo demanda, con cache acotada.

Administración contextual del recurso: nombre, participantes, permisos, retención
visible, conexiones de este equipo, invitaciones y eliminación por propietario.
Preferencias conserva ajustes generales/diagnóstico y configuración de cuenta.

## D. Compartir con otra persona

Invitar… elige permiso y si incluye historial disponible. El link admite solicitar
acceso, tiene expiración, puede desactivarse y no contiene claves de contenido.

El receptor ve recurso, propietario, permiso y alcance histórico; acepta y queda
pendiente de aprobación/claves si corresponde. Puede abrir la vista directamente
o elegir una carpeta para recibir. Nunca se configura una salida de envío por aceptar.

El propietario verifica la persona/dispositivo antes de conceder claves. Mostrar
estados Invitación creada / Esperando aceptación / Esperando aprobación /
Pendiente de claves / Acceso activo. Un login recuperado no se muestra como
contenido recuperado si faltan claves.

Al agregar otra persona, mostrar el efecto sobre los emisores automáticos y pedir
revisión del nuevo alcance en los equipos afectados. La pausa por cambio de audiencia
se explica con el participante agregado y acción Revisar acceso. Una PC adicional
de una persona ya aprobada no se trata como nueva audiencia.

## E. Envío rápido y scripts

Enviar a… desde selección usa el mismo selector sin crear vínculo de carpeta.
Enviar selección y Enviar clipboard de Windows son acciones distinguibles.
Un destino frecuente puede tener atajo: una acción → un destino visible.

Propuesta: la configuración de una Action ofrece un parámetro de destino con este
selector. El script recibe el ID resuelto por el host, con permisos y estado.
Este parámetro aún no existe; conservar mientras tanto SDK/scopes implementados.
Actions de recepción aparecen en Automatización de este equipo, indicando fuente,
destinos autorizados y efectos. No ejecutar texto recibido como script.

## F. Automatización y pausa

En el detalle, Automatización de este equipo revela dos opciones apagadas:

- Actualizar Windows con llegadas nuevas elegibles.
- Ejecutar una Action local seleccionada en este equipo.

Escritura built-in y Action escritora se excluyen; sólo un escritor automático por
perfil. Encenderlas no reproduce historial ni recuperaciones como efectos nuevos.
Desde tray: Pausar envío en este equipo, Pausar recepción en este equipo y Pausar todo.
El detalle de cada recurso ofrece las mismas dos direcciones para ese recurso
en este equipo. Las pausas de equipo dominan; mostrar Envío pausado en este equipo
cuando reanudar sólo el recurso no basta. El recurso afecta todas sus conexiones
locales y SDK, no las conexiones de otras personas/equipos.

## G. Compartir desde All Clipboard

La vista general All history ofrece Conectar portapapeles… aunque no haya una
carpeta seleccionada. Reusa selector/creación y Enviar / Recibir / Ambas. Mostrar
que es una conexión general del equipo y el alcance vigente, con Cambiar en Settings.

Settings → Sharing → Alcance del envío general permite Todo Copicu o Sólo textos
sin carpeta. Valor inicial propuesto: sólo sin carpeta; el envío comienza únicamente
cuando se habilita explícitamente. El ajuste no elimina conexiones propias de carpetas.
Ampliarlo muestra audiencia y alcance antes de guardar; no envía historial anterior.

Lo recibido sin carpeta se guarda en Root y se ve en All history; el clipboard
de Windows se controla aparte. Si ya hay destino receptor para ese canal, mostrarlo
y ofrecer trasladarlo; nunca sobrescribirlo por abrir la vista general.

Compartir sigue configurado al navegar a una carpeta, filtrar resultados o cerrar
el picker. Indicar conexiones efectivas: una carpeta puede enviar por su regla y
por la conexión general. Si coinciden en destino se genera una sola publicación.

Estado compacto propuesto: Envío activo / pausado y Recepción activa / pausada,
con botones independientes y scope explícito. Al pausar envío, copias nuevas siguen
locales y no se acumulan para envío posterior. Los pendientes previos se conservan;
el botón Reanudar envío (N pendientes) comunica qué continuará. Solicitudes ya
iniciadas conservan su estado real y no se presentan como retiradas del servidor.

Pausar recepción detiene llegadas/aplicación automáticas; consultar/copiar manualmente
sigue disponible. Al reanudar se continúa desde ahora: lo de la pausa permanece
consultable dentro de retención sin importación, Windows ni Action automáticos.
Los ajustes y pausas se conservan al reiniciar y el host los aplica también a scripts.

## H. Ciclo de vida

Desconectar carpeta, Salir de un recurso ajeno y Eliminar como propietario tienen
labels y alcance propios. Confirmación de eliminación: recurso, participantes,
contenido remoto y aclaración de que las copias locales permanecen.
Propietario no ve Salir como forma de abandonar un recurso sin resolver su propiedad.

Retención propuesta: siete días, visible en el recurso, fuera de configuración de
conexión. Se comunica expiración y posibilidad de guardar localmente. Portapapeles
temporal, vaciar/publicación individual, archivado y buzón sin lectura son ampliaciones;
no introducir botones sin operaciones de servidor reales.

## Accesibilidad y comprobación

Reusar tokens, estados de foco, densidad y panel en portal del selector actual.
Teclado: buscar, flechas, Enter confirmar, Escape cancelar/volver y foco devuelto
al disparador. Sin árbol de recursos inventado, controles recortados ni acciones
destructivas de una tecla. Verificar lector de pantalla, narrow picker y zoom.

Walkthrough básico: persona nueva crea desde carpeta sin código/JSON, conecta
dirección, envía texto sintético; otra acepta y puede consultar o guardar. Probar
carga, vacío, búsqueda sin resultado, nombre duplicado de propietario distinto,
offline, fallo sin perder draft, respuesta ambigua, permiso cambiado, carpeta borrada,
recurso eliminado y claves ausentes. El éxito exige estado real del servicio.
