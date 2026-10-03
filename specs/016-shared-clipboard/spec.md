# Feature Spec: Clipboard compartido configurable

Status: v0.5.3 publicada y servicio HTTPS activo; envío manual de texto entre PCs confirmado por JP. Revisión de identidad y contenido en curso, 2026-10-02. Creado: 2026-09-30. Arquitectura en [`plan.md`](plan.md); contrato SSE en [`sse-sync-plan.md`](sse-sync-plan.md); estado y próximo paso en [`041-shared-clipboard`](../../docs/tracks/041-shared-clipboard.md).

## Revisión vigente: cuentas y contenido

JP pidió acceso inicial para cualquier usuario autenticado, identidad canónica por
cuenta, PCs equivalentes sin aprobación entre equipos y un servicio interno fijo
`https://sharing.jpsala.dev/`. La custodia de claves necesaria para ese acceso está
pendiente de una decisión explícita; no se degrada E2EE por inferencia. Contrato y
estado en [identity-service-plan.md](identity-service-plan.md).

JP amplió Q2 a imágenes y contenidos de portapapeles, y confirmó dejar archivos
para después. El corte implementa los tipos que Copicu conserva actualmente:
texto e imagen PNG. Contrato, límites y comprobación en [media-plan.md](media-plan.md).
Las referencias a texto plano más abajo describen el corte previo; sus reglas de
efectos, procedencia y permisos se aplican también a imágenes.

## Ampliación acordada: sincronización de catálogo por SSE

JP pidió que crear/modificar un clipboard se refleje en backend y otros clientes,
aceptó SSE y pidió plan/documentación más una nueva sesión de implementación
supervisada. Este pedido autoriza el corte local; no publica ni despliega un servicio.

- Crear, renombrar, eliminar y modificar acceso/invitaciones actualiza los
  catálogos autorizados sin refresh manual ni necesidad de abrir el picker.
- Sólo reciben información los equipos/personas pertinentes. El otro equipo del
  emisor converge; correlación idempotente evita aplicar dos veces la operación.
- Reinicio/desconexión recupera estado mediante cursor y snapshot consistente;
  un gap se detecta. Notificaciones se guardan junto con el cambio confirmado.
- Catálogo no conecta carpetas, importa historial, escribe Windows ni ejecuta
  Actions por sí solo. Pausas de dirección y `liveOnly` conservan su contrato.
- UI abierta actualiza sin perder borradores/foco; revisión concurrente y retiro
  de acceso se muestran explícitamente. Un servicio sin SSE tiene fallback acotado.

Diseño, matriz, fases y ownership en [sse-sync-plan.md](sse-sync-plan.md).
La [aceptación SSE local](local-acceptance.md#aceptacion-sse-local-2026-10-02)
registra S1–S6, sus pruebas y recorridos nativos, y distingue la evidencia propia
del checkpoint anterior. El cierre local no acredita identidad humana, un servicio
remoto desplegado ni aceptación en dos PCs.

## Autoridad y evidencia

Continuación autorizada el 2026-10-02: completar primer acceso, identidad,
vinculación y servicio usable entre las PCs de JP. Contrato de este corte en
[identity-service-plan.md](identity-service-plan.md). FR-31: un perfil nuevo
inicia sesión por navegador, crea su espacio privado y vincula otra PC mediante
aprobación con huella o recuperación E2EE explícita, sin bundles en el recorrido
habitual ni efectos/importación al vincular. Proveedor y destino son propuestas;
despliegue y aceptación física permanecen separados de implementación local.

JP confirmó Q1–Q3 el 2026-09-30 y amplió el producto con carpetas/Actions y espacios
personales el 2026-10-01/02. El corte local implementa runtime, UI, SDK, cifrado,
custodia y relay sobre personas/equipos sintéticos. La instalación local posterior
y sus recorridos nativos constan en [aceptación local](local-acceptance.md);
son anteriores al cierre SSE y no acreditan el empaquetado de esa continuación.

El [preflight](research.md), el [dossier N1](n1-native-custody.md) y la
[implementación local](local-implementation.md) conservan la procedencia, comandos
de dependencias aprobados y límites de cada corte. Ninguna autorización narrada
allí es permiso actual de instalación, publicación, commit/push, deploy,
enrollment humano o uso de datos reales. El estado operativo se mantiene en el track.

**Objetivo confirmado:** copiar en Trabajo, pulsar un atajo configurable para publicar en un clipboard compartido y recibir en Casa, donde una suscripción puede actualizar automáticamente el portapapeles del sistema. El mismo flujo funciona en sentido inverso. Scripts deben poder usar la funcionalidad; no debe quedar como una integración rígida entre dos PCs.

**Alcance vigente:** Q1 `liveOnly` (sólo llegadas nuevas elegibles actualizan Windows; recuperaciones visibles para copiar manualmente) y Q2 texto e imágenes según media-plan. JP sustituyó Q3 el 2026-10-02: cada persona tiene su espacio propio y puede crear/elegir portapapeles compartidos desde las carpetas. Catálogo, invitaciones, grants históricos y rotación están probados localmente con identidades sintéticas. Recovery E2EE y el nuevo modelo de vinculación conservan definición y aceptación propias.

## Objetivo de producto

### Revisión acordada: carpetas y espacios personales (2026-10-02)

El recorrido principal empieza en la carpeta: seleccionar o crear un portapapeles
compartido, elegir enviar/recibir/ambas y gestionar ese vínculo allí. Incorporar
una superficie de administración de recursos propios y accesibles. Cada persona
tiene su espacio propio; los recursos y publicaciones cifradas viven en el
servidor. Desconectar una carpeta, retirar acceso y eliminar un recurso remoto
son operaciones distintas. El detalle y los criterios de aceptación están en
[folder-first-design.md](folder-first-design.md). Este recorrido está implementado
y validado localmente. El provisioning por archivo prepara el fixture sintético;
no satisface identidad ni vinculación humanas a un servicio remoto.

JP pidió después replantear el plan desde varios ángulos, con analogías de
colaboración y extensibilidad por scripts, antes de comenzar código. Confirmó
que conectar permite consultar lo anterior disponible sin importarlo
automáticamente a la carpeta. El plan revisado distingue acceso de persona,
conexión de carpeta, vista histórica y automatización del equipo. Defaults,
proveedor de identidad y retención remotos, y ampliaciones creativas quedan como
propuestas explícitas. Los contratos concretos del fixture implementado están en el plan.

JP amplió después la propuesta con conexión desde All Clipboard, aun sin carpeta,
y pausas independientes de envío/recepción. Pidió que el alcance del envío general
se pueda cambiar en Settings: Todo Copicu o Sólo textos sin carpeta. Scope general,
colas y reanudación están implementados y probados localmente según plan y UX.

### Ampliación acordada: carpetas y Actions (2026-10-01)

Origen: conversación de diseño con JP y pedido explícito de implementar en una sesión nueva con Sol 6.1 high. Esta ampliación sustituyó la exclusión inicial de publicación automática por carpeta; su integración local está documentada en la implementación y aceptación enlazadas.

- Una carpeta puede publicar nuevos ingresos locales en un canal, guardar lo recibido de un canal, o habilitar ambas funciones de manera independiente. Canal y carpeta mantienen identidades separadas; los nombres y rutas locales pueden diferir entre equipos.
- Conectar una carpeta no publica su contenido previo. Un eventual envío de existentes requiere acción explícita. Preservar procedencia: recibir/importar o escribir el clipboard desde una recepción nunca dispara republicación automática ni bucles.
- Publicar desde Actions/scripts no requiere pasar por una carpeta. Incluir una acción configurable para enviar el ítem activo a un canal mediante hotkey, distinguiéndola explícitamente de enviar el clipboard actual de Windows. Scripts pueden seleccionar canales autorizados, transformar/generar texto y enviar varios ítems con el mismo servicio de publicación; no administran credenciales ni conexiones por su cuenta.
- La suscripción configura por separado recepción, guardado en carpeta y actualización opcional del clipboard de Windows. Conservar `liveOnly`, un único escritor automático inicial, permisos por canal y controles de pausa/revocación.
- Se comparten publicaciones inmutables de texto plano; no se sincronizan ediciones, borrados, tags ni estructura de carpetas. Mantener deduplicación y metadata locales, incluido el caso de contenido ya existente en otra carpeta.
- Integrar una UI usable con los controles de carpetas compartidos existentes; probar el recorrido con datos sintéticos y Computer Use cuando haya capacidad real. No presentar mock/UI ni pruebas locales como validación entre dos PCs.

Contratos de implementación en el plan: envío general de ingresos locales nuevos al perfil, carpeta exacta sin descendientes, scope general configurable y colapso del solapamiento antes de admitir. El envío general excluye movimientos de clips existentes; una carpeta exacta con envío habilitado sí publica movimientos locales efectivos de entrada. Mover al mismo destino, editar contenido/metadata o recapturar un duplicado sin ingreso nuevo no publica; conectar o cambiar alcance tampoco hace backfill. Origen remoto queda excluido aun si se mueve a una carpeta emisora. Duplicados, cola y errores mantienen estado visible. No retransmitir recepciones entre canales por inferencia.

Compartir intencionalmente contenido entre equipos sin compartir indiscriminadamente el historial local. Una publicación puede llegar a varios equipos, y cada suscripción decide qué hacer con ella. Publicar, suscribirse, guardar en Copicu y escribir en el portapapeles del sistema son decisiones independientes.

"Clipboard principal" se distingue siempre entre **historial Root de Copicu** y **portapapeles de Windows**. Actualizar este último no significa pegar en una aplicación, abrir el picker ni cambiar el foco.

## User Scenarios & Testing

### US1. Enviar el clipboard actual por atajo (P1)

Trabajo y Casa están vinculadas a un canal privado. El usuario copia en una aplicación externa y pulsa el atajo sin abrir Copicu. La publicación corresponde al clipboard de esa invocación, no al clip activo del picker. Casa, conectada y con recepción automática habilitada, recibe el contenido y lo puede pegar manualmente. El flujo inverso usa las mismas primitivas.

Acceptance scenarios:

1. Con clip A seleccionado en Copicu y texto B recién copiado en otra aplicación, el atajo publica B; Casa copia B sin abrir ventanas ni inyectar teclas.
2. Si el clipboard cambia entre la invocación y su lectura, la operación informa entrada obsoleta en lugar de publicar silenciosamente el contenido posterior.
3. Enviar deliberadamente el mismo texto dos veces produce dos publicaciones distintas; un retry de la misma publicación no produce una tercera.
4. Un script local elige un canal autorizado o transforma texto antes de publicarlo. No mantiene por su cuenta una conexión permanente ni maneja credenciales del servicio.

### US2. Elegir el comportamiento de una suscripción (P1)

En Casa el usuario se suscribe a un canal y activa "Actualizar portapapeles de Windows". En otro equipo puede recibir ese mismo canal sólo para verlo dentro de Copicu. Una suscripción puede además guardar clips en Root o una carpeta local.

Acceptance scenarios:

1. Una suscripción sin escritura automática conserva la recepción visible en Copicu y no cambia el clipboard del sistema.
2. Encender recepción automática no habilita publicación de futuras copias locales. Pausarla invalida escrituras automáticas pendientes.
3. Guardar en una carpeta no exige que exista una carpeta equivalente en Trabajo. Renombrar o mover la carpeta local no cambia el canal.
4. Si el contenido ya existe localmente en otra carpeta, la recepción sigue visible en la suscripción sin duplicar el clip ni moverlo o sobrescribir su metadata silenciosamente.
5. Borrar la carpeta destino deja esa salida señalada como inválida; no redirige contenido silenciosamente a Root.

### US3. Usar Actions como extensión local (P1)

El usuario puede publicar mediante Actions y asociar a una suscripción una acción local de recepción. La escritura estándar al clipboard y el guardado local tienen opciones built-in; escribir un script no es obligatorio para el caso básico.

Acceptance scenarios:

1. El atajo usa el registro de shortcuts y sus diagnósticos de conflicto existentes.
2. Una acción receptora sólo corre si fue asociada y habilitada explícitamente para esa suscripción. Recibir texto que parece código nunca lo ejecuta.
3. La acción recibe identidad y procedencia de la recepción; acceder al contenido y publicar requieren permisos explícitos del host para esa acción y canal.
4. Un fallo o timeout de la acción no pierde la recepción, no bloquea otros clips ni reejecuta automáticamente efectos arbitrarios. El estado de la acción y el de sus salidas se informan por separado: fallar no demuestra ausencia de efectos ni rollback de operaciones ya admitidas.
5. El toggle de escritura automática gobierna la salida built-in. Un script que también escribe al clipboard constituye otra automatización explícita, con su permiso y control propios, no una vía invisible para eludir la pausa de la suscripción.

### US4. Sobrevivir a desconexión y reinicio (P1)

El envío explícito se conserva como pendiente si no hay conexión. El receptor recupera publicaciones aún disponibles al reconectar, distingue recuperación de llegada en vivo y no reproduce una ráfaga de escrituras viejas sobre Windows.

Acceptance scenarios:

1. "En cola", "aceptado por el servicio" y "aplicado en Casa" son estados distintos; no se muestra entrega remota antes de su confirmación.
2. Un reinicio conserva envíos pendientes y recepciones guardadas. No convierte un efecto de clipboard ambiguo en un nuevo efecto automático.
3. La recuperación usa `liveOnly` (Q1): conserva recepciones visibles dentro de retención, sin escribir Windows automáticamente al reconectar/reiniciar/reanudar. Copiar una recuperación requiere acción manual; nunca recorre el backlog con escrituras.
4. Expiración o límite de cola se muestra como tal; no se borra ni descarta silenciosamente un envío explícito para hacer lugar a otro.
5. Una publicación demorada del emisor no se convierte en "actual" sólo porque el servicio acaba de aceptarla.

### US5. Vincular, pausar y revocar equipos (P1)

El usuario controla qué equipos pueden publicar y recibir. El servicio almacena contenido cifrado; agregar una PC exige una vinculación explícita que no expone el historial preexistente ni secretos del equipo.

Acceptance scenarios:

1. Vincular Casa no sube todo el historial de Trabajo ni hace backfill automático al activar una nueva suscripción.
2. Un equipo ajeno no puede enumerar, publicar ni leer el canal. El nombre visible del canal no funciona como credencial.
3. Un equipo revocado no obtiene nuevas publicaciones; la UI aclara que revocar no borra contenido ya descargado.
4. Sin claves disponibles la recepción queda pendiente visible, no se muestra como contenido vacío ni se aplica al clipboard. Reintentar obtención/descifrado no pierde la publicación ni la convierte en una llegada nueva; otras recepciones listas pueden progresar.
5. Con Copicu cerrado o el equipo suspendido no se promete recepción/aplicación inmediata; se muestra el último estado conocido, no presencia falsa.

### US6. Crear o elegir desde una carpeta (P1)

El usuario abre Conectar portapapeles… en una carpeta, selecciona un recurso
autorizado o prepara uno nuevo y elige dirección. El recurso también es usable
desde su vista y por scripts. Recorridos propuestos en folder-first-design.md.

Acceptance scenarios:

1. Cancelar una selección o nombre antes de confirmar no crea recurso remoto ni vínculo local.
2. Crear y conectar usa una identidad de operación estable; una respuesta perdida no crea dos recursos. Si creación remota ocurrió y falló conectar localmente, el estado permite completar esa conexión.
3. Conectar no publica contenido previo ni importa publicaciones históricas. Muestra la carpeta exacta, dirección y audiencia antes de confirmar.
4. La vista muestra historial autorizado/disponible sin cambiar Windows ni ejecutar Actions. Guardar o copiar una publicación es una intención explícita independiente.
5. Renombrar o mover la carpeta conserva el vínculo por ID; borrarla no elimina el recurso remoto ni cambia el destino a Root.

### US7. Compartir entre espacios personales (P1)

Una persona administra sus recursos y dispositivos. Puede conceder a otra
persona acceso a un recurso, con aceptación explícita y vinculación protegida.
El contrato local de equipos, claves e invitaciones está implementado y probado
con personas sintéticas; proveedor de autenticación humana y recovery remotos
requieren su propio diseño y aceptación.

Acceptance scenarios:

1. Otra persona no enumera ni administra recursos privados ajenos por conocer su nombre, ID o URL.
2. Aceptar acceso no conecta una carpeta, activa envío ni configura efectos de Windows/Actions.
3. El historial visible respeta el alcance concedido y la retención. No obtener claves se muestra como estado pendiente; autenticarse no acredita descifrado.
4. Desconectar carpeta, salir y eliminar como propietario conservan sus alcances separados. No se promete borrar copias ya descargadas.
5. Una revocación bloquea nuevas admisiones autorizadas en servidor; el host invalida efectos al observar la revisión y aplica leases/guards a carreras en curso. No promete interrupción instantánea de efectos remotos ya iniciados.

### US8. Compartir en general y pausar por dirección (P1)

Desde la vista general, el usuario conecta un recurso sin seleccionar carpeta.
Settings controla el alcance de envío y los controles separan pausa de envío
y recepción. All history/All Clipboard es vista del perfil; Root es destino local.

Acceptance scenarios:

1. El selector general permite crear/elegir y enviar/recibir/ambas. Settings cambia entre Todo Copicu y Sólo textos sin carpeta; conectar o ampliar alcance no publica datos anteriores.
2. Pausar envío mantiene recepción activa; pausar recepción permite seguir enviando. Pausas de equipo dominan las de recurso y el host también las aplica a SDK/hotkeys.
3. Copias/ingresos locales durante pausa de envío permanecen locales sin backfill al reanudar; los pendientes previamente admitidos conservan estado/expiración y su cantidad se muestra al reanudar. Un request ya iniciado no se presenta como retirado del servidor.
4. Pausar recepción invalida efectos pendientes. Reanudar no importa automáticamente el intervalo pausado ni lo convierte en live; el historial autorizado sigue consultable por decisión manual.
5. Conexiones general y de carpeta con igual canal generan una sola publicación por ingreso. Recepción general sin carpeta usa Root, preserva dedupe y no consume el destino de captura armado.
6. Cambiar vista/filtro, cerrar picker o reiniciar no altera configuración/pausas. Pausar este equipo no pausa equipos de otras personas.

## Requirements

### Functional Requirements

- **FR-01:** soportar canales con identidad estable, independientes de carpetas, tags y nombres locales.
- **FR-02:** permitir varios dispositivos por canal y suscripciones locales independientes. No fijar en el protocolo exactamente dos PCs.
- **FR-03:** publicar mediante acción explícita o una regla de publicación de carpeta habilitada explícitamente según la ampliación del 2026-10-01; ninguna copia local, tag automático, navegación o vinculación publica por defecto. Habilitar una regla no publica retrospectivamente el contenido existente.
- **FR-04:** permitir publicar la entrada del atajo o texto producido por un script, sin necesitar seleccionar un clip del picker.
- **FR-05:** capturar una entrada coherente o rechazarla como obsoleta/no disponible. No sustituirla por "último clip del historial".
- **FR-06:** hacer visible recepción, origen y estado de cada publicación, separados del clip local que eventualmente la representa.
- **FR-07:** ofrecer en cada suscripción controles independientes para recepción, guardado local, escritura automática y acción local asociada. Defaults de efectos automáticos apagados.
- **FR-08:** no activar, abrir ni enfocar aplicaciones ni ejecutar paste por recibir contenido.
- **FR-09:** mantener el orden dentro de un canal y no aplicar efectos de una publicación antigua por encima de una publicación más nueva ya procesada.
- **FR-10:** ignorar el eco del dispositivo emisor para escritura automática. Identificar retries por publicación, no sólo por igualdad del contenido.
- **FR-11:** conservar procedencia remota y evitar que una escritura receptora sea tratada como captura externa local, postprocesamiento ordinario o nueva publicación automática.
- **FR-12:** conservar en almacenamiento durable el envío aceptado localmente antes de informar "en cola"; respetar límites y expiraciones visibles.
- **FR-13:** aplicar `liveOnly` (Q1) a reconexión, reinicio, pausa/reanudación y backlog: recuperación sin escritura automática, copia manual disponible; no prometer ejecución exactamente una vez de efectos externos.
- **FR-14:** conservar deduplicación y ubicación locales existentes. Una recepción no sobrescribe title, notes, tags, marcas, Inbox ni destino de captura armado.
- **FR-15:** usar como entrada de acciones receptoras la publicación inmutable, no el contenido editable de un clip local leído más tarde.
- **FR-16:** pausar inmediatamente la recepción automática de una suscripción, invalidar trabajo pendiente y no tratar su reactivación como llegada nueva.
- **FR-17:** limitar colas, tamaño de payload, recuperación y ejecución de scripts; un fallo no bloquea captura, búsqueda, UI o recepción de otros eventos.
- **FR-18:** cifrar contenido antes de salir del dispositivo. No exportar por defecto metadata local, contexto de captura, títulos de ventana, rutas, tokens ni scripts.
- **FR-19:** autorizar canales y dispositivos, permitir revocación y explicar recuperación de claves y sus límites antes de depender del canal.
- **FR-20:** aislar perfiles dev/instalada y entornos del servicio. Restaurar un backup futuro no clona identidad ni reactiva automáticamente efectos de otra PC.
- **FR-21:** comunicar fallos de lectura, formato no soportado, autorización, claves, cuota, carpeta inválida y efecto interrumpido sin imprimir payloads o secretos.
- **FR-22:** ofrecer desde cada carpeta un selector de portapapeles autorizados con búsqueda y creación integrada; configurar enviar, recibir o ambas sin abandonar el contexto de la carpeta.
- **FR-23:** separar persona, espacio propio y dispositivos. Aislar catálogo y administración entre personas; nombres e IDs no conceden acceso.
- **FR-24:** permitir crear, renombrar y administrar recursos remotos desde producto. Una nueva creación no sube historial ni activa publicación retrospectiva.
- **FR-25:** distinguir desconexión local, salida de un participante y eliminación remota por propietario; comunicar alcance y conservar las copias locales salvo otra acción explícita.
- **FR-26:** mostrar conservación y límites del servidor sin prometer retención ilimitada. Compartir acceso con otra persona exige aceptación y transferencia protegida de claves.
- **FR-27:** permitir consultar historial disponible dentro del acceso concedido, con paginación, estados sin clave/expirado y gaps explícitos; no importarlo por conectar una carpeta ni convertir consulta histórica en llegada nueva o efecto automático.
- **FR-28:** preservar contratos y scopes existentes de Actions/SDK; la interfaz de usuario y scripts usan el mismo host para autorización, cifrado, cola y resultados. Parámetro de destino, consulta de estado y causalidad de puentes se especifican como extensiones antes de implementarse.
- **FR-29:** ofrecer conexión general desde All Clipboard/All history, con alcance de envío configurable en Settings (Todo Copicu / Sólo textos sin carpeta), sin depender de la vista abierta ni publicar contenido previo; resolver solapamientos por canal y destino receptor explícito.
- **FR-30:** ofrecer pausas persistentes e independientes de envío/recepción por recurso en este perfil y para todo el equipo; aplicarlas en host a UI, cola y SDK, preservar pendientes previos y no acumular ingresos nuevos ni reproducir efectos del intervalo pausado al reanudar. Informar alcance, pendientes y operaciones ya iniciadas honestamente.

### Key Entities

- **Persona / espacio:** titular de recursos propios y acceso a recursos compartidos; posee varios dispositivos vinculados.
- **Canal:** portapapeles compartido con identidad remota estable, propietario, participantes autorizados y conservación de publicaciones.
- **Vínculo de carpeta:** conexión local entre carpeta y canal, con dirección de envío/recepción y estado propios.
- **Conexión general:** vínculo del perfil con un canal, alcance de envío configurable y recepción con destino local explícito; no es otra carpeta.
- **Pausa de flujo:** estado local persistente por dirección/recurso o equipo, separado de permisos remotos y de configuración del vínculo.
- **Dispositivo:** instancia vinculada, permisos y estado de revocación; no equivale al nombre de máquina.
- **Publicación:** snapshot inmutable enviado intencionalmente, con identidad propia, procedencia, orden y expiración.
- **Suscripción:** política de recepción de un canal en un perfil local.
- **Recepción:** registro durable de una publicación recibida y resultado de sus salidas locales.
- **Clip local:** representación opcional dentro del historial, con organización y deduplicación existentes.
- **Vinculación:** consentimiento y transferencia protegida del acceso, distinta de recuperar todo el historial.

## Edge Cases

- Clipboard ocupado, vacío, cambiante o con formato no soportado; script lento después del atajo.
- Dos equipos publican casi a la vez; dos canales llegan al mismo clipboard; la PC receptora copia localmente mientras una escritura remota está pendiente.
- Recepciones duplicadas, fuera de orden, corruptas, expiradas o posteriores a un cursor perdido por retención.
- Crash antes/después de guardar la recepción o de escribir Windows; servidor acepta pero el emisor pierde la respuesta.
- Suscripción pausada, eliminada o modificada mientras se ejecuta una acción; carpeta destino borrada.
- Clip local deduplicado en otra carpeta, editado después o eliminado por retención; recepción aún visible.
- Equipo clonado, restauración de backup, reloj incorrecto, pérdida de todas las claves o revocación durante un envío.
- Red corporativa sin WebSocket, sesión Windows bloqueada, suspend/reanudar o Copicu cerrado.
- Respuesta perdida al crear recurso; creación remota confirmada y vínculo local fallido.
- Audiencia ampliada mientras carpeta/script publica automáticamente; persona nueva con historial limitado y equipo nuevo de persona existente.
- Consulta histórica concurrente con llegada nueva, poda, revocación o eliminación; varios emisores locales y conflicto de destino único de recepción.
- Puentes A → B → A y ramas legítimas; recuperar login sin claves; eliminar propietario con recursos y participaciones.
- Solapamiento de conexión general y carpeta; cambio de alcance mientras entran clips; cola previa/request en vuelo al pausar; pausas de equipo y recurso superpuestas.
- Automatizaciones ordinarias `clipboardChange` y servicios de sincronización de Windows/RDP pueden observar escrituras; su interacción debe verificarse, no darse por segura por hash.

## Success Criteria

Metas propuestas para aceptación del primer corte, no métricas ya observadas:

- **SC-01:** 30 envíos sintéticos en cada sentido llegan al equipo esperado sin seleccionar clips ni abrir el picker; cero publicación equivocada, bucle o paste involuntario.
- **SC-02:** con ambas PCs despiertas/conectadas y red de prueba con RTT <=200 ms, al menos el 95% de los 60 envíos pequeños se puede pegar manualmente en el otro equipo dentro de 2 s del atajo. Medir también fallos y cold start, sin excluirlos silenciosamente.
- **SC-03:** con escritura automática apagada, 20 recepciones no modifican el clipboard de Windows. Con la suscripción pausada, cero efectos automáticos posteriores de trabajo pendiente.
- **SC-04:** tras desconexión y reinicio, toda publicación aceptada localmente termina como entregada, pendiente, expirada o error visible; ninguna queda falsamente confirmada ni se duplica por retry.
- **SC-05:** los escenarios de reconexión, crash, dedupe/carpetas y revocación tienen resultados deterministas conforme a la política aprobada.
- **SC-06:** un usuario configura canal y suscripción sin escribir código; un script local puede elegir canal y publicar usando el mismo mecanismo.
- **SC-07:** diagnósticos y contenido almacenado por el servicio no incluyen clipboard en claro, contexto privado, claves ni código del usuario.
- **SC-08:** con sharing desactivado no hay conexión, publicación ni nueva lectura de clipboard para sharing; el flujo local existente mantiene sus gates de foco, captura y rendimiento.
- **SC-09:** walkthrough de creación/selección desde carpeta y aceptación desde otra persona, sin código/JSON/credenciales técnicas en el recorrido habitual; todos los estados corresponden a operaciones reales.
- **SC-10:** consultar historial disponible genera cero importaciones, escrituras de Windows o ejecuciones de Action implícitas y no interfiere con el procesamiento de nuevas llegadas.
- **SC-11:** cambiar alcance general no causa backfill ni duplicación de publicaciones en coincidencias con reglas de carpeta; recepción general conserva el destino y metadata locales.
- **SC-12:** pausa de una dirección no impide la otra, salvo sus permisos/configuración propios; reiniciar no levanta pausas y reanudar no admite ingresos omitidos ni efectos del intervalo pausado como nuevos.

## Assumptions y propuestas de alcance

- Copicu debe estar corriendo, la PC despierta y la sesión habilitada para escribir el clipboard. No se agrega un servicio Windows, wake remoto ni instalación laboral automática.
- Ámbito vigente (Q3, revisado 2026-10-02): cada persona tiene su espacio propio y puede administrar portapapeles compartidos desde producto. Invitaciones y transferencia protegida de acceso están validadas localmente; autenticación humana y recovery E2EE remotos siguen pendientes.
- Primer formato confirmado (Q2): texto plano; imágenes y HTML fuera del primer corte. No se serializan rutas de archivos como si fueran archivos compartidos.
- Primer corte no es una biblioteca mutable: editar/borrar un clip local no edita ni borra la publicación en otros equipos.
- Sólo una suscripción por perfil puede escribir automáticamente el clipboard inicialmente, mediante salida built-in o acción asociada con permiso de escritura; las demás pueden recibir/guardar. Evita prioridades ocultas mientras se valida el flujo.
- Escritura remota en vivo reemplaza intencionalmente el clipboard al habilitar esa opción. Si hay otra copia local durante la espera/retry, se omite el efecto pendiente y se conserva la recepción visible.
- No se invoca AI ni enrichment remoto por recibir; un script receptor es una automatización local explícita de confianza, no un sandbox.
- Datos laborales reales sólo se usan después de revisar políticas del trabajo y autorizar específicamente la prueba. Desarrollo y smokes usan contenido sintético.

## Decisiones de alcance confirmadas por JP

Confirmación inicial: 2026-09-30; revisión de Q3: 2026-10-02. Estos IDs se conservan como referencia de requisitos.

| ID | Tema | Selección confirmada | Fuera del primer corte / pendiente técnico |
| --- | --- | --- | --- |
| **Q1** | Reconexión/reanudación | `liveOnly`: recuperar para ver/copiar manualmente, sin reemplazar Windows automáticamente con contenido viejo. Sólo llegadas nuevas elegibles pueden actualizarlo. | `latestOnResume` no se incluye. Barrier/frescura nativos y de transporte deben verificarse. |
| **Q2** | Formatos | Texto plano, con rechazo explícito de formatos no soportados. | Imágenes/HTML después; captura local existente no acredita transferencia ni escritura remota. |
| **Q3** | Ámbito del servicio | Sustituida por JP el 2026-10-02: cada persona tiene su espacio propio; creación/selección desde carpetas y gestión de portapapeles compartidos. Catálogo, invitaciones y rotación locales probados con personas/equipos sintéticos. | Autenticación humana, recovery E2EE, proveedor, retención remota y aceptación en dos PCs pendientes. |

Q1 y Q2 se conservan; Q3 refleja el pedido actualizado. Esto no aprueba todas las propuestas de arquitectura ni autoriza desplegar: límites, librerías, autenticación/vinculación, protocolo criptográfico/custody y proveedor siguen como gates técnicos. Los permisos de instalación/recursos/pruebas reales se solicitan específicamente cuando corresponda.

## Fuera de este primer corte

Backup cloud, Drive directo, restauración de perfil, sincronización de ediciones/borrados/carpetas, publicación automática por tags, múltiples canales compitiendo por el clipboard, descubrimiento público, web viewer con claves, mobile, formatos arbitrarios, transferencia de archivos, ejecución remota de scripts y control/paste de ventanas externas. La publicación por carpeta entra en la ampliación del 2026-10-01; los espacios personales y la administración de recursos compartidos entran en la revisión del 2026-10-02.

Backup permanece como feature futura relacionada: puede reutilizar vinculación, custody de claves y almacenamiento cifrado, pero necesita snapshots consistentes, retención versionada y restauración verificable propios. Retención del canal y sincronización nunca se presentan como backup.
