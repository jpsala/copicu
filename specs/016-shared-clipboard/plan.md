# Plan de producto y arquitectura: portapapeles compartidos

Estado: producto local y SSE S1–S6 validados; servicio remoto y aceptación en
dos PCs pendientes. Fecha: 2026-10-02.
Origen: pedido de JP de replantear el plan, explorar analogías de colaboración
y mantener uso transparente, sencillo y extensible por scripts.
Confirmado: espacio propio por persona; seleccionar/crear desde carpetas;
enviar/recibir/ambas; consultar historial disponible sin importarlo automáticamente.
Ampliación: conexión general desde All Clipboard y pausas independientes de envío
y recepción. JP pidió que el alcance general se pueda cambiar en Settings.
Q1 `liveOnly` y Q2 texto plano siguen vigentes.

Ampliación confirmada por JP: avisos SSE para que creación/modificación/acceso
se reflejen en los otros clientes autorizados. Contrato y orden de continuación
en [sse-sync-plan.md](sse-sync-plan.md): HTTP confirma, SSE avisa y pull
reconcilia con cursor durable; primero catálogo, luego avisos de publicaciones.
La evidencia comprobada y los gates abiertos están en
[aceptación SSE local](local-acceptance.md#aceptacion-sse-local-2026-10-02).
S1–S6 cerrados localmente: identidad/pausa tardías, denied/unsupported, retiro en
Settings y superficies abiertas/ocultas tienen evidencia shipping. Los hints
transaccionales de publicaciones despiertan el sync V1 existente sin avanzar
control water ni habilitar efectos. Ticks, leases, receipts, `liveOnly` y opt-ins
se conservan; reducir polling requiere medición y regresiones nuevas.

El [diseño de interacción](folder-first-design.md) describe recorridos y estados;
[sharing-patterns.md](sharing-patterns.md) documenta analogías y alternativas.
[local-implementation.md](local-implementation.md) acredita el corte existente.
[protocol-notes.md](protocol-notes.md) conserva los detalles técnicos anteriores
para consulta puntual; no se lee como contrato actual del SDK.

## Contratos del corte local (2026-10-02)

- Identidad: el fixture provisiona personas y equipos autenticados aislados;
  el bearer identifica un equipo, nunca una persona elegida por el renderer.
  OAuth/OIDC humano y recuperación externa permanecen gates de proveedor.
- Control plane V2 separado del stream V1: intents con ID persistido, revisión
  esperada y digest inmutable. Reintento devuelve el mismo resultado; conflicto
  de payload/revisión no crea otro recurso. Catálogo sólo autorizado, lifecycle
  checked también por publish/sync/lease/report. Claves nunca en claro en relay.
- Epochs anteriores sólo se leen dentro del rango concedido. Incorporar persona
  sin historial exige epoch nuevo; revocación bloquea grants antes de rotar.
  Una rotación pendiente bloquea publicar y no reinterpreta outbox ambiguo.
- Retención inicial local conserva 24 horas y cuotas existentes verificadas;
  siete días sigue propuesta pendiente de validación, no default silencioso.
- Conexiones persistidas por ID: `general` o carpeta exacta (Root = null),
  dirección `send`, `receive`, `both`. Un receptor por canal/perfil; trasladarlo
  exige intención explícita. Migración conserva policies previas sin backfill.
- Scope general `unfiled`/`all`: sólo ingresos nuevos, no movimientos. Coincidencia
  con carpeta al mismo canal se colapsa antes de admitir; remoto queda excluido.
- Pausas persistidas global/canal, envío y recepción independientes. Pausa de
  envío frena admisión y nuevos dispatches; in-flight conserva resultado real.
  Reanudar recepción fija head nuevo antes de admitir; consulta manual separada
  no mueve cursor de entrega ni ejecuta efectos. Generaciones invalidan trabajo.
- Forwarding conserva scopes y allowlists actuales. Puentes múltiples requieren
  causalidad autenticada versionada; no añadir ruta renderer ni debilitar V1.
  Hasta cerrar ese wire, rechazar forwarding automático de origen ya reenviado.

Estos contratos describen el fixture local implementado. Estado operativo,
evidencia y próximo paso en el [track](../../docs/tracks/041-shared-clipboard.md);
no heredar permisos ni ownership de los cortes anteriores.

## 1. Recomendación y motivos

Un portapapeles compartido es un recurso privado con publicaciones de texto,
historial disponible y participantes. Se puede consultar y usar por Actions
sin carpeta. Una conexión local decide cómo una carpeta envía y recibe de él.
Cada equipo decide sus efectos de Windows y automatizaciones.

El uso habitual requiere elegir recurso y dirección, con una descripción del
resultado. La capacidad adicional aparece en administración, envío explícito y
Actions, sin sumar campos al recorrido básico. Se mantienen identidades estables;
renombrar carpetas o recursos no rompe los destinos.

Decisiones propuestas, distintas de los requisitos ya confirmados:

- Vista compartida del historial, sin duplicarlo por defecto en el historial local.
- Un recurso por carpeta inicialmente; varias carpetas pueden enviar al mismo
  recurso. Un único destino automático de recepción por recurso y perfil.
- Recepción como selección inicial del control; enviar exige elección explícita.
- Invitaciones privadas con aceptación y aprobación del propietario.
- Historial previo para una persona nueva sólo cuando el propietario lo concede;
  los equipos nuevos de la misma persona conservan su acceso ya concedido.
- Conservar publicaciones siete días como valor inicial a validar, con límites
  visibles y cambios aplicables a futuras publicaciones. La configuración local
  actual expira publicaciones a las 24 horas; ampliar exige cambiar validaciones.
- Identidad de persona mediante autenticación estándar; vinculación de claves de
  equipo mediante dispositivo ya aprobado o recuperación explícita. Un login
  recuperado por sí solo no recupera automáticamente claves E2EE.

## 2. Modelo y fronteras

| Entidad | Responsabilidad |
| --- | --- |
| Persona y espacio propio | Poseer recursos y gestionar sus dispositivos. Un espacio por persona inicialmente; sin organizaciones ni jerarquías de equipos. |
| Dispositivo | Identidad criptográfica y credencial propias; revocable sin eliminar a la persona. |
| Portapapeles / canal | Recurso remoto con propietario, participantes, permisos, retención y revisión de acceso. |
| Participación | Autorización de persona: leer, publicar, administrar; rango histórico concedido. |
| Suscripción local | Una por canal/perfil: cursor durable, feed, pausa y estado de recepción. |
| Conexión de carpeta | ID propio, carpeta exacta, canal, dirección y revisión aceptada de audiencia; varias salidas de envío, una entrada automática por canal/perfil. |
| Conexión general | ID propio y canal, dirección, alcance de envío configurable en Settings; recepción sin carpeta usa Root explícito. Sigue activa independientemente de la vista abierta. |
| Estado de flujo | Pausa de envío y pausa de recepción separadas, por canal en este perfil y para todo el equipo; persistentes y aplicadas por el host. |
| Publicación | Texto inmutable, autor/dispositivo, secuencia, expiración y procedencia. |
| Recepción y efectos | Registro durable; importar a carpeta, escribir Windows y ejecutar Action tienen resultados independientes. |
| Intento de administración | ID idempotente y estado durable de creación, invitación o eliminación; permite resolver respuestas perdidas. |

Enviar/recibir es una decisión local dentro de permisos remotos. Elegir Enviar
no convierte a una persona en participante sin permiso de lectura. Inicialmente
se ofrecen propietario, lector y colaborador; un buzón con publicación sin
lectura requiere otro análisis de claves y queda como ampliación.

No se sincronizan rutas, tags, títulos locales, ediciones ni borrados de clips.
Una carpeta conectada sigue siendo local. All history no es carpeta destino;
Root sólo puede conectarse explícitamente y muestra el alcance de captura.

### Conexión general y Settings

All Clipboard es la entrada de compartir en la vista general, hoy All history;
es un contexto del perfil, no otra carpeta ni el clipboard de Windows. Permite
elegir/crear recurso y dirección sin seleccionar una carpeta. Los controles
exponen un único recurso general inicialmente, además de las conexiones de carpetas.

Settings → Sharing → Alcance del envío general tiene dos opciones:

- Todo Copicu: ingresos locales nuevos de cualquier carpeta, incluido Root.
- Sólo textos sin carpeta: ingresos locales nuevos en Root.

JP confirmó que sea configurable; valor inicial propuesto: sólo sin carpeta,
con envío general deshabilitado hasta elegir recurso/dirección. La pantalla de
conexión refleja el ajuste y enlaza a él; ampliar alcance muestra las carpetas y
audiencia incluidas. El ajuste afecta la conexión general, no elimina reglas
propias de otras carpetas. Ni conectar ni cambiar alcance publica contenido previo.

El envío general responde a ingresos locales elegibles, conserva exclusión de
origen remoto y dedupe actual; no es una nueva regla de cada evento de Windows.
Mover un clip ya existente entre carpetas no crea un ingreso al perfil general.
Las reglas exactas de carpeta sí conservan sus movimientos de entrada actuales.
Si conexión general y carpeta apuntan al mismo canal, el host publica una sola
vez para ese ingreso. Destinos distintos son fan-out explícito, visible al configurar.
Navegar, filtrar All history o cerrar el picker no cambia el alcance ni suspende
una conexión; esa tarea la realizan los controles de pausa.

Recibir en general mantiene feed y, con recepción/guardado habilitados, guarda
lo nuevo sin carpeta en Root, sin usar el destino de captura armado. Si ese canal
ya recibe en otra carpeta, mostrar el destino y permitir trasladarlo explícitamente;
mantener un solo destino automático por canal/perfil. Actualizar Windows sigue
siendo una opción aparte, apagada por defecto.

### Pausas por dirección

Dos niveles simples: el recurso en este equipo y todo el equipo. La pausa del
recurso se aplica a todas sus conexiones locales y llamadas SDK; evita que una
regla general eluda la pausa que se abrió desde una carpeta. La pausa de equipo
domina todas las de recurso. Cada nivel tiene Envío y Recepción independientes;
editar la dirección del vínculo sigue siendo una operación distinta de pausarla.

Pausar envío bloquea nuevas admisiones de publicaciones manuales, automáticas y
SDK para ese alcance y detiene nuevos despachos de la cola. Lo copiado/creado
durante la pausa permanece local y no se acumula para compartir al reanudar.
Los envíos ya admitidos se conservan como retenidos: Reanudar envío muestra cuántos
pendientes volverán a despacharse, con su antigüedad/expiración. Si todavía hay una
pausa de equipo, reanudar un recurso no la anula. Intentos ya iniciados pueden
terminar aceptados o ambiguos; no prometer retirar lo que el servidor ya recibió.

Pausar recepción detiene descarga/seguimiento automáticos e invalida importaciones,
Windows y Actions pendientes para el canal. Publicar puede seguir habilitado;
control/acks de envíos ya admitidos no son recepción automática de contenido.
La consulta/copia manual de historial sigue disponible como intención explícita.
Al reanudar se establece un head/fence nuevo: no importar automáticamente lo del
intervalo pausado ni ejecutar sus efectos. Ese contenido puede consultarse dentro
de retención. Distinguir esta pausa deliberada de recuperación tras fallo de red,
que conserva el contrato de la suscripción previa y nunca genera efectos live.

Persistir sendPaused/receivePaused y generaciones/fences independientes. El host
comprueba pausa antes de admitir/despachar/publicar y antes de cada efecto receptor;
scripts y hotkeys no la eluden. No guardar sólo un toggle React ni suspender por
ocultar ventana. El botón de tray Pausar todo activa ambas direcciones; reanudar
todo no borra pausas individuales. La pausa afecta este equipo, no a otros participantes.

## 3. Tres momentos diferentes

| Momento | Comportamiento |
| --- | --- |
| Consultar historial autorizado | Leer páginas disponibles en la vista compartida; copiar o guardar por decisión explícita. Sin importar, ejecutar Actions ni escribir Windows automáticamente. |
| Llegada nueva elegible | Registrar recepción; guardar en carpeta si el vínculo lo pide; aplicar sólo efectos automáticos configurados y válidos. |
| Recuperación o entrega demorada | Registrar y mostrar con su procedencia; puede guardarse según la recepción ya configurada. No se convierte en llegada live ni dispara Windows o Action automáticamente. |

Consultar páginas antiguas tiene un cursor distinto del cursor de entrega. Leer
historial no adelanta ni reinicia el procesamiento de nuevas llegadas. Al conectar
una carpeta, la entrada automática comienza desde un head acordado con el servicio;
la vista histórica puede retroceder dentro de permisos y retención.

Verificación de una página histórica valida firma, ciphertext, claves/epoch y
autorización histórica, sin admitir otro efecto ni alterar el high-water de replay.
No reutilizar un guard de replay de llegada nueva como filtro que oculta historial
legítimo. Mantener manifests de acceso históricos verificables, cache acotada y
estados Sin clave/Expirado; leer metadata no acredita descifrado disponible.

La antigüedad para escritura automática se determina por los guards de frescura
existentes, no por la duración del archivo remoto. Poder leer durante siete días
no da siete días para escribir Windows automáticamente. Copiar manualmente una
publicación válida crea una intención nueva; jamás renueva su elegibilidad live.

## 4. Experiencia de producto

La carpeta ofrece Conectar portapapeles…; el selector permite buscar, elegir o
preparar creación. El draft se confirma con Conectar o Crear y conectar. Cancelar
antes de confirmar no crea recursos. La descripción muestra carpeta, destino,
dirección, participantes y ausencia de envío del contenido anterior.

Desde cualquier clip: Enviar a… con el mismo selector, sin conectar carpeta.
Se distingue enviar selección de enviar el portapapeles de Windows. Para repetir
un envío frecuente puede asociarse un atajo o Action con destino estable.

Portapapeles compartidos permite consultar y administrar recursos propios y
recibidos, ver conexiones de este equipo, retención, permisos y participantes.
Abrir uno muestra publicaciones autorizadas y su procedencia. Los recursos
personales empiezan accesibles sólo para sus equipos; invitar es una acción separada.

La carpeta muestra una indicación compacta: recurso, dirección y estado accesible.
No se construye un árbol remoto paralelo ni una pantalla SaaS. Reusar componentes,
tokens y patrones de FolderSelect/FolderNavigator; búsqueda de recursos es plana,
con propietario para distinguir nombres iguales.

Windows y Actions aparecen en Automatización de este equipo, con efectos apagados
por defecto. La administración global muestra dónde opera una automatización; no
se copia su configuración a otro equipo al iniciar sesión.

## 5. Identidad, acceso e invitaciones

El corte entre PCs se concreta en [identity-service-plan.md](identity-service-plan.md):
broker OIDC/PKCE, alta con secretos generados en host, aprobación HPKE de equipos,
retiro y recuperación E2EE. Reusar Bun/SQLite detrás de HTTPS es la propuesta
revisable de servicio; Google OIDC es el proveedor propuesto, aún sin aprobar.

Separar autenticación de persona, credencial de dispositivo y claves de contenido.
Propuesta: usar autenticación estándar en navegador del sistema, con OAuth/OIDC y
PKCE S256 cuando se seleccione proveedor. RFC 8252/7636 son referencias en
[sharing-patterns.md](sharing-patterns.md). No implementar contraseñas propias
ni escoger proveedor por disponibilidad accidental de credenciales existentes.

Tras autenticarse, el host crea la identidad del equipo y la protege localmente.
Vincular otra PC requiere aprobación de un equipo existente o recuperación de
claves con consentimiento. Mostrar nombre de equipo, estado y retiro de acceso.
Copicu vuelve al draft de conexión original después del primer acceso.

Invitar: elegir permiso, alcance histórico y generar link de solicitud con uso
acotado, expiración y revocación. Abrirlo muestra propietario/recurso/permisos,
autentica a la persona y pide aceptar. La aceptación no instala una carpeta ni
activa automatizaciones. El propietario verifica/aprueba la identidad receptora;
la distribución protegida de claves es una fase explícita, con estado pendiente.

Un link no contiene claves maestras ni tokens de dispositivo ni es acceso público
al contenido. Copiarlo desde Copicu utiliza una escritura protegida que no ingresa
al historial ni a reglas de publicación de carpetas. Verificar también su manejo
en logs, navegación y diagnósticos. Los links se tratan como material sensible.

Personas nuevas reciben historial anterior sólo si fue concedido. Si se concede
sólo lo futuro, crear epoch nuevo y no envolver claves previas para esa persona.
Si se comparte historial disponible, distribuir únicamente epochs necesarios y
autorizados. La composición exacta de estas operaciones y su recuperación se
especifica y prueba antes del código de vinculación; HPKE unitario no la acredita.

Al ampliar audiencia, los emisores automáticos quedan pendientes de revisar ese
nuevo alcance; el propietario puede aceptar el impacto propio en el mismo diálogo.
Agregar un equipo ya aprobado de la misma persona no amplía audiencia. Reducir
permisos invalida efectos y grants aunque el equipo no haya visto la UI todavía.

## 6. Persistencia, catálogo y servicio

Primero ampliar el servicio sintético existente con un modelo transaccional de
personas, espacios, dispositivos, recursos, participaciones, invitaciones e
intentos idempotentes. Mantener separado el transporte de publicaciones existente.
Reusar SQLite local/AppStorage y su migración explícita; no crear otra DB desktop.

Familias de operaciones y garantías del contrato. La implementación local V1/V2
y su evidencia están en [local-implementation.md](local-implementation.md);
esta tabla no define endpoints de un proveedor remoto desplegado:

| Operación | Garantía necesaria |
| --- | --- |
| Catalogar y consultar recurso | Sólo recursos autorizados; respuesta con revisión y capabilities; caché distingue estado observado de autorización actual. |
| Crear/renombrar recurso | Propietario autenticado, IDs opacos, idempotencia y metadata del recurso cifrada/firmada donde corresponda. |
| Solicitar/aceptar/aprobar invitación | Uso/expiración/acceso comprobados; identidad y permisos ligados al consentimiento; estado recuperable. |
| Agregar/revocar dispositivo o persona | Grants y revisiones monótonos, key epochs coordinados, operaciones concurrentes resueltas explícitamente. |
| Publicar/sync/watch/report | Contratos actuales de commit, orden, lease, firma, replay y efectos preservados. |
| Consultar historial | Páginas autorizadas desde un rango permitido, floor de retención y snapshot de head; sin efectos locales implícitos. |
| Salir/eliminar | Owner y participante diferenciados; transición durable que bloquea nuevo uso antes de purgar. |

Cada creación tiene operation ID persistido antes de red. Ante respuesta perdida
se consulta ese intento; nunca se crea otro recurso como fallback. Create and connect
no es una transacción distribuida: si servidor creó y falló el guardado local,
mostrar Creado; falta conectar y permitir reintentar o abrir el recurso creado.
No eliminarlo silenciosamente ni presentarlo como operación que nunca ocurrió.

Publicaciones se aceptan sólo tras commit durable y validación de dispositivo,
persona, participación, epoch, firma, límites y estado del recurso. No confiar en
folderId ni membresía remitida por React. Contadores de 64 bits siguen como strings.
Push sólo anuncia head; cursor/sync y consulta idempotente resuelven pérdidas.

Servidor conserva ciphertext y metadata operativa mínima. E2EE no oculta IDs,
tamaños, tráfico ni relaciones de acceso al servicio; no copiar esa promesa de Signal.
Nombres/metadata del recurso requieren un diseño de cifrado/firmas consistente
con el catálogo y preview de invitación. El servidor no posee claves de texto.

Contratos y tests implementados primero con SQLite sintético. Para producción,
Cloudflare sigue como candidato del preflight; un único store transaccional para
el control inicial reduce coordinación distribuida. La asignación a DO/D1 se
decide con atomicidad de invitaciones/participación y límites reales verificados.
Sin R2 para el primer formato ni credenciales de otros productos como bootstrap.

## 7. Conexiones, dedupe y automatización

Separar ChannelPolicy actual en autorización remota, suscripción y conexiones.
Una migración conserva reglas existentes por IDs; no vincula automáticamente
instalada/dev ni cambia destinos. Suscripción mantiene feed independiente de carpeta.

Varias carpetas emisoras pueden apuntar al mismo recurso; cada ingreso local
produce como máximo una publicación por canal para esa operación. Crear/capturar
clip nuevo y movimiento efectivo conservan reglas exactas actuales: sin backfill,
descendientes, edición/tags ni eco de importaciones. Enviar existentes es selección
manual o Action explícita, con resumen de cantidad y destinatarios.

El único destino de recepción por canal/perfil evita dos importaciones que pelean
con la deduplicación global. Elegir otro muestra dónde está conectado y permite
trasladar esa entrada, conservando otras salidas de envío. El modelo admite futuro
fan-out, pero no lo promete sin resolver clip único y metadata por carpeta.

Feed siempre conserva la publicación visible aun cuando el clip ya existe en otra
carpeta. Importar automáticamente no mueve ni modifica ese clip. Guardar manualmente
muestra esa coincidencia y permite abrirlo o moverlo con consentimiento explícito.

Conservar worker fuera de locks de UI/admisión, cola acotada, escrituras nativas
cercadas por sequence, lease y generación, barrera de pausa y procedencia durable.
Sólo un escritor Windows por perfil; built-in y Action escritora se excluyen.
Una Action de recepción corre en el equipo indicado, no una sola vez por persona.
Pausas independientes accesibles desde tray invalidan las operaciones de su dirección;
Pausar todo detiene envío y recepción de este equipo. No reinicia pausas por recurso.

## 8. SDK y capacidad adicional

Conservar el SDK real: `copicu.sharedClipboard.channels()`, `publish({channelId,text})`
y `received()`, y sus scopes del host. No reemplazarlo por el viejo borrador
`copicu.shared.*` ni romper scripts para limpiar nombres.

Capacidades locales implementadas:

- Destino por Action persistido en host; `target()` lo revalida y `publish({ text })`
  lo resuelve sin editar IDs en el script. Exige los grants de publicación explícitos.
- `state()` consulta pausas/recursos y outbox locales dentro de los scopes del
  script; no consulta remoto ni acredita recepción de otros equipos.
- `history({ channelId, cursor })` consulta una página autorizada, más antigua
  primero, con `shared:read` y `shared:history:<channelId>`. No conecta, importa
  ni ejecuta efectos; transporte ocupado rechaza inmediatamente.
- `sharedReception` y `received()` conservan origen inmutable y permisos actuales.
  Forwarding requiere destino autorizado y grant origin/target; el host firma un
  solo salto y rechaza volver a reenviar una publicación reenviada. Ramas explícitas
  son posibles; routing de varios saltos y administración remota siguen fuera del SDK.

Ejemplo con el destino configurado y los grants explícitos de la Action:

```ts
const { text } = await copicu.sharedClipboard.received();
await copicu.sharedClipboard.publish({ text: transformar(text) });
```

El host cifra, guarda, reintenta y informa; el script no recibe bearer ni claves.
Enviar no confirma recepción. Consultar estado se resuelve por metadata local y
worker, sin convertir un host call en espera ilimitada de red.

Ampliación causal propuesta, fuera del límite actual de un salto: root y parent opacos, ruta de recursos visitados y
presupuesto de saltos en metadata autenticada, con exposición mínima entre espacios.
Rechazar un target ya visitado sin colapsar ramas legítimas ni envíos múltiples de
una Action. Decidir codificación/privacidad y compatibilidad antes de firmar campos
nuevos; clientes antiguos no reciben payload V2 como si fuera texto plano V1.

Los puentes automáticos necesitan trazabilidad causal y límite de saltos además
de la procedencia actual. Diseñar versión wire si se agregan campos firmados; el
host asigna causa/parent y presupuesto, el script no los reinicia para eludirlo.
En A → B → A, el host detiene la repetición con resultado visible. Validar también
ramas legítimas, múltiples publicaciones por Action y retries; dedupe de contenido
no equivale a dedupe causal. No vender forwarding ilimitado con el SDK actual.

## 9. Conservación y ciclo de vida

Propuesta de retención inicial: siete días por publicación desde su origen,
dentro del máximo del servicio; una cola offline no renueva edad ni frescura.
Cuotas por recurso y espacio propietario, independientes de la cantidad de lectores.
Tomar límites de fixtures como presupuestos de prueba, no capacidad de producción.

Al llegar al límite se rechazan nuevas admisiones con estado visible, sin evictar
envíos ya aceptados para hacer lugar. La cola local conserva resultado y expiración.
Aplicar retención a ciphertext, caches, intents, reportes e índices con preservación
de claims activos y evidencia/idempotencia necesaria. Mostrar gaps y contenido
expirado; historial local importado usa su propia retención.

| Acción | Alcance |
| --- | --- |
| Desconectar carpeta | Sólo ese vínculo y sus efectos pendientes; recurso y clips permanecen. |
| Pausar envío / recepción | Detiene la dirección elegida en el alcance indicado; no revoca acceso ni borra copias. |
| Salir | Retira a la persona y sus dispositivos de un recurso ajeno; el propietario no abandona su recurso sin resolver propiedad. |
| Eliminar recurso | Sólo propietario; marca deleting/deleted, bloquea publicación/lectura/nuevas invitaciones, purga contenido y retira accesos. Nunca recrear mismo ID. |
| Eliminar espacio/persona | Inventario y confirmación explícitos: recursos propios, dispositivos y participaciones; sin borrar recursos de terceros. |

Eliminar es idempotente y recuperable tras reinicio; estado de purga observable.
No prometer secure-delete de SQLite, desaparición instantánea de backups ni borrado
de copias previamente descargadas. Revocar persona o equipo requiere rotar claves
para contenido futuro y tratar pendientes de epochs anteriores como pendientes de
revisión; no reencriptar con ID nuevo un envío ambiguo y crear un duplicado.

La revocación del servidor no retira bytes ya descargados ni detiene por sí sola
un efecto local iniciado. Al observar una nueva revisión el host invalida generación
y claims pendientes; las leases acotan lo que todavía no observó. Especificar esa
ventana y sus carreras, sin prometer interrupción remota instantánea. Con sharing
apagado no hay transporte ni auto-renovación de sesiones de sharing; consultar el
catálogo manualmente es una nueva intención de red, no un worker oculto.

## 10. Alternativas y ampliaciones valoradas

La tabla de [sharing-patterns.md](sharing-patterns.md) fundamenta las decisiones.

| Idea | Valor / momento |
| --- | --- |
| Recurso consultable, sin carpeta | Prioridad del nuevo corte; reduce obligatoriedad de configuración. |
| Enviar a… y destino configurable de Action | Prioridad; aprovecha el mismo mecanismo desde teclado/scripts. |
| Portapapeles temporal para una sesión | Siguiente ampliación: caducidad del recurso/invitación distinta de retención y lease. |
| Varias salidas y transformaciones | Emisores múltiples en el modelo; puentes sólo después de resolver causalidad y permisos. |
| Buzón de entrega sin lectura | Valioso para recopilar entradas; diferir hasta que cifrado separe publicar de descifrar. |
| Imágenes/archivos, integraciones externas | Después de texto, límites de blobs y autenticación propia. Sin tokens genéricos ni buckets públicos en scripts. |
| Colección editable, edición/borrado sincronizados | Otro contrato; no añadirlo al stream inmutable por analogía con carpetas. |

## 11. Orden de trabajo y aceptación

La secuencia de producto siguiente conserva el diseño y los gates remotos; su
base local ya está implementada y la evidencia vive en `local-implementation.md`
y `local-acceptance.md`. Las [tareas SSE S1–S6](tasks.md#continuacion-sincronizacion-sse-2026-10-02)
están cerradas localmente. La preparación de la candidata y los gates remotos se
retoman desde el track, sin reiniciar el preflight ni presentar esta secuencia
de diseño como tareas aún vacías.

1. Cerrar contratos de identidad/claves, transiciones de acceso, rango histórico,
   retención y causalidad; dejar casos de carrera escritos antes de producto.
2. Dominio de control + persistencia sintética + catálogo/CRUD + idempotencia.
   Probar aislamiento de dos personas con varias PCs y acceso de dispositivos.
3. Vinculación/invitaciones/rotación y recuperación con pruebas de composición.
   Diagnosticar enrollment actual conservando el error original y contexto seguro.
4. Migrar conexiones y separar cursores/feed; validar historial y dedupe.
5. Selector, administración, envío explícito y estados reales; walkthrough con
   keyboard y narrow picker, sin mocks presentados como recorrido remoto validado.
6. Destino configurable/estado SDK y puentes limitados, preservando scripts actuales.
7. Aceptación nativa y en dos PCs; después preparar despliegue revisable.

Matriz mínima: crear/conectar con respuesta perdida; cancelar sin crear; aislamiento;
persona lectora no publica; cambiar audiencia pausa emisores; historial consultado
no dispara efectos; race head/primer evento no pierde ni duplica; carpeta destino
cambiada; recursos eliminados con outbox/lectura/script en curso; revocación con
rotación; retries tras crash; puente cíclico; dispositivo que inicia sesión sin
claves; Windows bloqueado/copia local durante espera y pausa global.
Ampliar la matriz con general Root/Todo, cambio de alcance sin backfill, solapamiento
general/carpeta, pausa por dirección con SDK y cola previa, persistencia tras reinicio,
respuestas en vuelo, fences de reanudación y pausa de equipo dominante.

No declarar listo por suites del corte anterior. Medir uso básico con una persona
que, desde carpeta, crea o elige recurso y configura dirección sin JSON, secretos,
código ni búsqueda en Settings; otra acepta invitación y consulta/recibe texto.
Verificar invariantes de US1–US8, FR01–FR30 y SC01–SC12.

JP pidió el 2026-10-02 iniciar la implementación del plan revisado en una nueva
sesión con GPT-6.1 SOL, medium o high a criterio del coordinador, agentes opcionales
y supervisión. Se elige `gpt-6.1-sol high`, mismo checkout/host; implementación
local y pruebas sintéticas autorizadas. Cerrar cada contrato pendiente antes de
su corte. Instalar dependencias, commit/push, deploy, recursos cloud y pruebas
con datos reales conservan autorización explícita específica.
