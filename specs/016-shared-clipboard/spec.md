# Feature Spec: Clipboard compartido configurable

Status: alcance inicial confirmado por JP; draft técnico con gates pendientes. Creado: 2026-09-30. Arquitectura propuesta en [`plan.md`](plan.md); continuidad en [`041-shared-clipboard`](../../docs/tracks/041-shared-clipboard.md).

## Autoridad y alcance de esta preparación

JP confirmó el alcance inicial de Q1–Q3 el 2026-09-30, tras la revisión documental. La confirmación fija comportamiento/formato/ámbito. JP autorizó después sólo L1: lógica interna y unit tests offline sin nuevas dependencias, nube, perfiles, clipboard real ni app. L1 está completado como módulo `cfg(test)` (25 tests); no autoriza el resto del feature, instalación, recursos, login, deploy, publicación ni transmisión real. Evidencia en [research.md](research.md).

Posteriormente N1-A quedó completo y el 2026-10-01 JP delegó orquestar N1-B/C en Windows Sandbox y tomar sus decisiones técnicas. Matrices sintéticas completas: 15 Pure, 11 Clipboard y 6 DPAPI; evidencia y permisos acotados en [dossier N1](n1-native-custody.md). No integración app/watcher/hotkey, perfiles del host, E2EE ni dos PCs; no cambia el alcance funcional ni autoriza otros cortes.

JP pidió después terminar la implementación y probarla mientras está ausente. El [corte local](local-implementation.md) implementa persistencia D1 y C1/T1 opt-in con fixtures nuevos, sin activar sharing en producto. Tras el dossier exacto, «avancemos» aprobó los cinco cargo add de cifrado/transporte: ejecutados, versiones/features explícitos. Cifrado/HPKE/DPAPI/relay pasan un recorrido HTTP/SQLite real en una PC con identidades sintéticas; no acredita enrollment humano, integración nativa ni dos PCs. No hay autorización de deploy, instalación de Copicu ni enrollment real.

**Objetivo confirmado:** copiar en Trabajo, pulsar un atajo configurable para publicar en un clipboard compartido y recibir en Casa, donde una suscripción puede actualizar automáticamente el portapapeles del sistema. El mismo flujo funciona en sentido inverso. Scripts deben poder usar la funcionalidad; no debe quedar como una integración rígida entre dos PCs.

**Alcance inicial confirmado:** Q1 `liveOnly` (sólo llegadas nuevas elegibles actualizan Windows; recuperaciones visibles para copiar manualmente), Q2 texto plano y Q3 servicio privado para los equipos de JP, sin cuentas/login de producto. Proveedor, protocolo de vinculación/cifrado, límites y preset de canal siguen siendo propuestas técnicas, no aprobaciones implícitas.

## Objetivo de producto

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

## Requirements

### Functional Requirements

- **FR-01:** soportar canales con identidad estable, independientes de carpetas, tags y nombres locales.
- **FR-02:** permitir varios dispositivos por canal y suscripciones locales independientes. No fijar en el protocolo exactamente dos PCs.
- **FR-03:** publicar sólo por una acción explícita en el primer corte; ninguna copia local, tag automático, navegación o vinculación publica por defecto.
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

### Key Entities

- **Canal:** destino compartido, participantes autorizados y conservación de publicaciones.
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

## Assumptions y propuestas de alcance

- Copicu debe estar corriendo, la PC despierta y la sesión habilitada para escribir el clipboard. No se agrega un servicio Windows, wake remoto ni instalación laboral automática.
- Primer ámbito confirmado (Q3): servicio privado para los equipos de JP, sin cuentas/login de producto ni interfaz para compartir con otras personas. Grants y vinculación siguen sujetos al gate técnico de seguridad.
- Primer formato confirmado (Q2): texto plano; imágenes y HTML fuera del primer corte. No se serializan rutas de archivos como si fueran archivos compartidos.
- Primer corte no es una biblioteca mutable: editar/borrar un clip local no edita ni borra la publicación en otros equipos.
- Sólo una suscripción por perfil puede escribir automáticamente el clipboard inicialmente, mediante salida built-in o acción asociada con permiso de escritura; las demás pueden recibir/guardar. Evita prioridades ocultas mientras se valida el flujo.
- Escritura remota en vivo reemplaza intencionalmente el clipboard al habilitar esa opción. Si hay otra copia local durante la espera/retry, se omite el efecto pendiente y se conserva la recepción visible.
- No se invoca AI ni enrichment remoto por recibir; un script receptor es una automatización local explícita de confianza, no un sandbox.
- Datos laborales reales sólo se usan después de revisar políticas del trabajo y autorizar específicamente la prueba. Desarrollo y smokes usan contenido sintético.

## Decisiones de alcance confirmadas por JP

Confirmación: 2026-09-30. Estos IDs se conservan como referencia de requisitos, no como preguntas pendientes.

| ID | Tema | Selección confirmada | Fuera del primer corte / pendiente técnico |
| --- | --- | --- | --- |
| **Q1** | Reconexión/reanudación | `liveOnly`: recuperar para ver/copiar manualmente, sin reemplazar Windows automáticamente con contenido viejo. Sólo llegadas nuevas elegibles pueden actualizarlo. | `latestOnResume` no se incluye. Barrier/frescura nativos y de transporte deben verificarse. |
| **Q2** | Formatos | Texto plano, con rechazo explícito de formatos no soportados. | Imágenes/HTML después; captura local existente no acredita transferencia ni escritura remota. |
| **Q3** | Ámbito del servicio | Privado para los equipos de JP, sin construir cuentas/login de producto todavía. | Vinculación, grants, recuperación de claves y proveedor requieren diseño/verificación técnicos. |

Q1–Q3 están resueltas. Esto no aprueba todas las propuestas de arquitectura ni autoriza implementar/desplegar: límites, librerías, protocolo criptográfico/custody, proveedor y snapshot/writer nativos siguen como gates técnicos de `plan.md`. Los permisos de instalación/recursos/pruebas reales se solicitan específicamente cuando corresponda.

## Fuera de este primer corte

Backup cloud, Drive directo, restauración de perfil, sincronización de ediciones/borrados/carpetas, publicación automática por tags/carpetas, metadata editable de destinos en F2, múltiples canales compitiendo por el clipboard, descubrimiento público, colaboración entre personas, web viewer con claves, mobile, formatos arbitrarios, transferencia de archivos, ejecución remota de scripts y control/paste de ventanas externas.

Backup permanece como feature futura relacionada: puede reutilizar vinculación, custody de claves y almacenamiento cifrado, pero necesita snapshots consistentes, retención versionada y restauración verificable propios. Retención del canal y sincronización nunca se presentan como backup.
