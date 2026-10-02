# Sincronización de catálogo con SSE

Fecha: 2026-10-02. Estado: catálogo SSE y avisos de publicaciones implementados;
S1–S6 cerrados localmente. Evidencia en
[aceptación SSE local](local-acceptance.md#aceptacion-sse-local-2026-10-02).
Origen: JP pidió que crear/modificar un shared clipboard se refleje en los otros
clientes, aceptó SSE y pidió una sesión de implementación supervisada.

## Objetivo y alcance

Un recurso creado, renombrado, eliminado o con acceso modificado aparece
actualizado en todos los equipos autorizados, incluso con el picker cerrado.
Invitaciones, aceptación, aprobación, salida, revocación y cambios de claves/equipos
también invalidan el catálogo pertinente. Crear un recurso privado sólo lo anuncia
a los equipos de su dueño; las otras personas se enteran según su acceso/invitación.

Confirmado por JP: SSE y continuación en otra sesión con supervisión desde el
origen. Los contratos siguientes son decisiones técnicas del plan, dentro del
alcance delegado, no resultados de pruebas ni un backend público disponible.

Primer corte: catálogo y acceso. Segundo corte: avisos de nuevas publicaciones
que despiertan el sync existente. No reemplazar de entrada la outbox, leases,
receipts, pausa, `liveOnly` ni fences nativos. Identidad humana, infraestructura,
deploy y aceptación en dos PCs conservan sus gates separados.

## Estado implementado y límites locales

El relay guarda eventos por persona junto a la mutación; `/v2/catalog` incluye `control`
con `version`, `environment`, `personId`, `generation` y cursor decimal u64.
`/v2/changes` y `/v2/events` exigen ese scope; SSE identifica cada frame como
`generation:personId:cursor`. Un retiro sólo lleva el ID ya conocido; heartbeat
no avanza cursor. Retención: 1.024 eventos/persona y 24 horas; páginas hasta 64,
cola SSE hasta 64 KiB, un stream/equipo y 64 streams/relay.

El host usa cliente dedicado con vault y TLS existentes, snapshot al iniciar o
reconectar, parser acotado, cancelación y backoff. Guarda catálogo saneado y
watermark sólo después de aplicar packages/grants y revalidar identidad/pausa.
El control water es independiente de delivery/history/native water. Servicio
legado entra en fallback de 55–59 segundos; denied cierra acceso, sin fallback.
La UI recibe sólo `shared-catalog-invalidated` con estado saneado. Estos contratos
están implementados y S3–S5 tienen aceptación de lifecycle y superficies reales.
Denied de catálogo aborta el stream antes de revocar acceso; un resultado tardío
de otra identidad no puede volver a habilitarlo. Settings conserva conexión y
borradores del recurso retirado y deshabilita sus controles/guardado.

S6 agrega `publication_head_changed`: `version`, `type`, `resourceId`, `head` y
`cursor`, con ambos contadores como strings u64. Se guarda junto al envelope y
head de canal en la misma transacción; rollback/retry no emiten otro aviso.
Audiencia: personas con un read grant vigente en algún equipo no revocado y
membresía actual; una invitación pendiente no recibe heads. Replay vuelve a
validar esa audiencia y sustituye un head revocado por retiro mínimo.

El parser deduplica por cursor observado en memoria y coalesce un wake acotado
para el worker V1 existente. Un hint de publicación no hace pull de catálogo,
no persiste control water ni invalida la UI. Ese water sólo avanza con snapshot
aplicado; reconectar puede repetir wakes, que deduplica el delivery vigente.
El sync V1 consulta y valida contenido/acceso/leases/fences actuales. Se conserva
el timeout de 500 ms para outbox/retención/fallback, sin reducir polling ni cambiar
opt-ins, receipts o `liveOnly`.

### Baseline anterior al corte SSE

Los puntos siguientes describen el inicio, no el estado implementado actual:

- `SharedClipboardLibrary.tsx` carga catálogo al montar y tras operaciones propias;
  no escucha cambios remotos. Selector y Settings también necesitan invalidación.
- `product.rs` obtiene `/v2/catalog` y aplica catálogo/grants al perfil; los intents
  de administración ya tienen ID, digest y persistencia antes de red.
- `control.mjs` usa la misma SQLite/transaction del relay. `notify()` despierta
  waiters del `watch` V1, que es long polling por canal; no es SSE de catálogo.
- El worker shipping hace ticks de 500 ms para publicaciones/recepción. Una
  conexión SSE larga no puede ocupar el mutex de transporte de esas operaciones.
- Baseline: instalada ↔ dev, 39 casos de host real y recorridos Computer Use;
  66 Rust sharing / 36 storage shared. Véase [aceptación local](local-acceptance.md).

## Contrato de sincronización

### HTTP confirma; SSE avisa; pull reconcilia

1. El cliente envía la operación HTTP firmada con el `operationId` existente y,
   donde corresponde, revisión esperada. El backend resuelve conflictos y valida
   identidad/acceso actuales; no aplica last-write-wins silencioso.
2. Dentro de **la misma transacción** guarda estado, resultado idempotente y
   eventos durables para las personas afectadas. Un rollback no produce eventos;
   repetir una operación confirmada no añade eventos ni muta otra vez.
3. Tras commit despierta streams. El aviso contiene sólo versión, tipo, IDs
   opacos, revisión/cursor y correlación de operación/equipo; sin nombres, texto,
   fingerprints privados, keys, bearer ni paquetes criptográficos.
4. El host usa pull para reconciliar estado autorizado. Persistir el cursor de
   control sólo después de aplicar el catálogo y sus invalidaciones durables.
   Crash antes de avanzar cursor repite reconciliación idempotente, sin efectos.
5. El host emite invalidación local sanitizada; las ventanas actualizan su estado.

El aviso no concede acceso ni sustituye consulta/validación actuales. Tampoco
es un ACK de aplicación en otro equipo. Distinguir estado confirmado en servidor,
estado observado por cliente y outcomes de efectos Windows/Actions existentes.

### Cursor y snapshot consistente

Mantener una secuencia de control **por persona**, con audiencia definida por el
backend. Cada equipo conserva su propio cursor observado. Separarla de secuencia
de publicaciones por canal, cursor histórico, ordinal y sequence de Windows.
Contadores de 64 bits siguen como strings; no comparar con `Number` de JS.
El cursor se liga a persona/entorno y generación del feed/DB del servicio; un
reset del servicio o cambio de identidad no reutiliza una posición antigua.

Contratos nuevos, nombres a concretar al comenzar sin cambiar su semántica:

| Superficie | Garantía |
| --- | --- |
| `GET /v2/events` | SSE autenticado por equipo; retoma desde cursor/Last-Event-ID validado. Un stream por perfil, con heartbeat y límites. |
| `GET /v2/changes` | Página acotada de avisos autorizados posteriores a cursor, con next/floor/head/generación y gap explícito. |
| Snapshot de catálogo V2 | Catálogo y watermark de control leídos consistentemente en la misma transacción SQLite; campos nuevos aditivos. |

Inicializar/reconectar con snapshot + watermark y suscripción posterior desde
ese watermark. El replay durable cubre cambios ocurridos entre snapshot y
suscripción. Al pasar de replay a live, registrar el listener y drenar pendientes
sin ventana que pierda un commit; deduplicar solapamiento por cursor.

Se puede agrupar una ráfaga de invalidaciones y aplicar un snapshot completo
actual, avanzando a **su** watermark, porque catálogo representa estado, no una
cola de efectos. No avanzar sólo al último ID visto por el parser SSE. Un evento
de control perdido puede recuperarse con snapshot completo; no ejecutar cada
transición administrativa histórica como una acción nueva.

### Audiencia, origen y revocación

- Calcular afectados antes/después de cada mutación dentro de la transacción;
  incluir invitado y dueño cuando aceptación/aprobación cambia lo que deben ver.
- Una persona que pierde acceso recibe únicamente una invalidación de retiro
  del ID que ya conocía, sin metadata nueva ni acceso a contenido. Otras personas
  ajenas no reciben IDs ni señales del recurso. No filtrar sólo por membresía
  posterior, porque se perdería el aviso al revocado.
- Verificar dispositivo/scope al abrir, al hacer replay y antes de emitir cada
  lote; un dispositivo revocado deja de consumir su stream. Invalidar estado
  local/grants y claims según las barreras actuales; no prometer detener bytes
  o efectos que ya se ejecutaron en otro equipo.
- Incluir el origen y correlacionar `operationId`: el ACK o evento actualiza una
  sola vez. Sus otros equipos sí se actualizan. Esta elección técnica evita que
  excluir al emisor deje su estado desactualizado tras una respuesta perdida.
- Los eventos guardados son mínimos. Replay nunca expone metadata del recurso
  a quien perdió acceso, ni convierte un cursor conocido en autorización.

### Desconexión, límites y compatibilidad

Eventos retenidos por tiempo/cantidad con límites finitos y gap explícito. Cursor
expirado o generación distinta exige snapshot; no fingir catch-up completo.
Heartbeat no mueve cursor. Reconnect con backoff exponencial, jitter y tope;
restablecerlo al recibir respuesta válida. Coalescer solicitudes de actualización
y mantener memoria acotada; cliente lento se desconecta y recupera por pull.

Transporte autenticado con credencial del vault en headers desde Rust, nunca en
URLs ni renderer. Reusar el verifier TLS de plataforma/ring del cliente actual.
Sin bearer/keys/contenido en logs; loopback sólo en fixture explícito. SSE tiene
`text/event-stream`, cache desactivada y keepalive; proxy/HTTP remoto se comprobará
cuando exista un destino autorizado, sin asumir compatibilidad productiva.

Con servicio legado sin SSE/cambios, distinguir unsupported de auth/revoked:
fallback de reconciliación a baja frecuencia, estado visible, sin retry rápido
ni desactivar validaciones. Objetivo inicial: hasta 60 s con jitter para fallback;
SSE debe invalidar normalmente al recibir el commit, sin esperar ese intervalo.
Prueba local con deadline generoso (5 s); medir latencia observada sin convertir
ese timeout en una promesa de red remota.

## Host, almacenamiento y UI

Un propietario por perfil para stream/cancelación, vinculado a la identidad y
generación de configuración. HTTP fuera de WORKER/EFFECT_BARRIER. El stream usa
transporte dedicado; no sostiene el mutex singleton mientras espera bytes.
Revalidar identidad/generación antes de guardar un snapshot que llegó tarde.
Leer SSE incrementalmente con límites de frame/buffer; probar UTF-8 y frames
partidos, CRLF, varias líneas data, duplicados y eventos desconocidos.

Reusar AppStorage y sus tablas auxiliares explícitas de sharing: no otra DB ni
tablas en perfiles sin configurar. Cache y cursor conservan separación entre
observado y autoridad remota actual. Importaciones de keys/config existentes se
completan antes de avanzar cursor; no inventar atomicidad SQLite + vault/files.
Reconciliar sin bloquear captura, publicación, consulta histórica ni admisión
local. Cancelación, shutdown y cambio de perfil tienen plazo acotado comprobado.

El listener vive con sharing configurado/activo, aun con todas las ventanas
cerradas. Pausar send/receive sólo pausa esa dirección: catálogo/acceso siguen
actualizándose. `StoredConfig.paused` (apagado global legacy) detiene transporte
y renovación automáticos; consultar manualmente sigue siendo una intención de
red. No añadir un worker oculto cuando sharing está apagado/sin configurar.

Emitir un evento Tauri de invalidación/revisión sin contenido privado. Biblioteca,
selector y Settings escuchan y recargan/coalescen. Conservar selección por ID,
búsqueda, foco y borradores; refrescar después de una operación en vuelo sin
sobrescribir datos que el usuario está editando. Si cambió revisión, pedir revisar
el conflicto al confirmar. Recurso retirado cierra sus acciones y muestra retiro;
no conectar a otro recurso ni mover carpetas automáticamente.

Aparecer en catálogo no habilita conexiones, recepción, Windows ni Actions.
Actualización de control no avanza cursores de entrega/historial ni rejuvenece
leases. Reconectar no importa backfill ni repite efectos Windows/Actions.

## Secuencia de implementación

1. **Contrato/regresiones:** concretar schema/versionado/cursor/snapshot consistente
   y tests de transacción, audiencia, idempotencia y huecos de suscripción.
2. **Servicio sintético:** persistir eventos en misma SQLite; changes paginado,
   SSE con replay/live, heartbeat, revocación, límites y shutdown; mantener V1/V2.
3. **Host:** cliente SSE dedicado, reconciliación/cursor/cache y lifecycle; tests
   con relay HTTP real y perfiles sintéticos, no sólo parser o renderer mocks.
4. **UI:** invalidación local para todas las superficies, preservación de drafts,
   conflicto/retiro/offline visibles; pruebas desktop/angosto y teclado.
5. **Aceptación de catálogo:** dos perfiles reales abiertos y ocultos; cambios
   realizados desde otro cliente se reflejan sin cerrar/reabrir diálogo ni
   refresh manual. Restart, replay, revocación y carreras pasan antes de ampliar.
6. **Avisos de publicaciones:** añadir `publication_head_changed` tras commit y
   despertar/coalescer el sync V1 existente. SSE nunca transporta plaintext ni
   produce por sí solo recepción/efectos. Mantener ticks para outbox/retención y
   fallback hasta medir que reducirlos preserva leases/pausas/latencia/idle.

No exigir nuevas dependencias: Bun, SQLite, Rust/reqwest/Tauri y std actuales son
la primera vía. Instalar/descargar dependencias conserva el gate de AGENTS.

## Matriz de aceptación

- Create/rename/delete en A actualiza B/C autorizados; persona ajena no observa
  recurso; el otro equipo del owner sí. Recurso creado no conecta nada solo.
- Invite/accept/approve/leave/revoke/rotate actualizan destinatarios correctos,
  incluidos retiros; aprobación deja keys listas mediante flujo HPKE vigente.
- Operación reintentada/respuesta perdida no duplica evento ni aplicación local;
  emisor también converge. Rollback no genera aviso; dos rename con revisión
  esperada producen un éxito y conflicto, no pérdida silenciosa.
- Commit entre snapshot/subscribe y replay/live no se pierde; duplicados,
  desorden de hints y ráfagas convergen. Requests normales siguen funcionando
  mientras SSE está conectado.
- Cliente desconectado/reiniciado recupera cambios; gap/reset fuerza snapshot;
  cursor anterior de otra identidad/generación se rechaza o reinicializa seguro.
- Revocación con stream abierto, stale snapshot tardío y cambio de perfil no
  mantienen acceso ni reaplican config antigua. Sin configuración/apagado no
  hay streams, polling adicional ni tablas nuevas.
- Pausas de flujo no congelan catálogo; activar/reanudar transporte no reproduce
  clips anteriores ni modifica Windows/Actions. Cursor control separado.
- Biblioteca/selector/Settings abiertos actualizan; búsqueda, draft, selección
  y foco se conservan; recurso retirado muestra estado correcto; UI estrecha.
- Burst, consumidor lento, heartbeat, cancelación, parsing incremental y límites
  pasan con memoria acotada; backend restart no depende de listeners en memoria.
- En el segundo corte, publicaciones nuevas despiertan sync sin duplicados ni
  eco, y preservan retención, FIFO, leases y fences de los 39 casos existentes.

Repetir suites pertinentes y build normal offline/locked; reiniciar sólo la dev
aislada propia. Prueba nativa con Computer Use y datos sintéticos para el recorrido
entre perfiles; no sustituirla por bridge mock. Instalación nueva/publicación no
se requieren para este corte ni se autorizan por este documento.

## Continuación después del checkpoint

La continuación directa pedida por JP cerró S3–S5 antes de S6. Matriz, repros,
procedencia y procesos/perfiles en
[aceptación SSE](local-acceptance.md#aceptacion-sse-local-2026-10-02).
El checkpoint previo conserva su origen; su supervisión permanece `PAUSED`.
No hay una campaña ni un deadline histórico activo.

El siguiente trabajo local no requiere otra reparación SSE conocida. Servicio,
identidad humana/recovery y aceptación en dos PCs siguen separados; preparar un
destino revisable si JP los pide. Ticks y fences actuales continúan: cualquier
reducción de polling requiere medición y regresiones nuevas.

Retomar en `C:/dev/copicu`, `main`/HEAD `2b1b954`, verificando WIP y archivos
sin seguimiento. Un worktree nuevo no contiene necesariamente la implementación
sin commit. Comprobar ownership, PID/executable/perfil/puerto y opt-ins antes de
restart/build; no matar procesos por nombre ni cerrar relays ajenos. Tras visuales
generar dist normal antes de compilar el shipping. Los fixtures sólo usan datos
sintéticos y preservan sus resultados ignorados; ninguna referencia documental
transfiere permisos de instalar, commit/push, deploy o usar datos reales.

Referencia técnica: [SSE en MDN](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events).
