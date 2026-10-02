# Referencia técnica del corte local anterior

Documento de consulta puntual. Extraído del plan previo el 2026-10-02 para
conservar sus invariantes de transporte, persistencia, efectos nativos y cifrado.
No es el plan vigente ni acredita implementación de las APIs tentativas aquí
descritas. La interfaz pública implementada está en
`scripts/examples/copicu-action.d.ts`; evidencia y límites en
[local-implementation.md](local-implementation.md). Persona/espacio, catálogo,
invites, vínculos e historial consultable se rigen por [plan.md](plan.md).

## 4. Modelo local y remoto

Nombres de tablas/tipos tentativos; documentan invariants, no migrations listas para ejecutar.

| Entidad | Identidad y campos principales | Invariant |
| --- | --- | --- |
| `SharedDevice` | ID aleatorio por perfil/instalación, claves públicas verificadas, referencias a secretos, grants/revocación | No hostname ni DB row ID como identidad. Dev y instalada no se vinculan por herencia. |
| `SharedChannel` | ID opaco, etiqueta local/cifrada, membership/key epoch, endpoint de entorno | Renombrar no cambia destino; URL/ID no son autorización. |
| `SharedSubscription` | ID local, channel ID, enabled, generation, history sink/folder ID, clipboard sink, resume policy, action binding | Una por canal/perfil inicialmente. Cambiar/pause/remove incrementa generation e invalida efectos pendientes. |
| `SharedOutbox` | publication ID, channel ID, origin ordinal, ciphertext inmutable, tiempos, expiración, estado/intentos | Commit local antes de `queued`; retry usa mismo ID y ciphertext. |
| `SharedReceipt` | subscription ID + publication ID, server sequence, acquisition state, ciphertext/snapshot nullable, received time, live/recovery, sink outcomes, local item ID nullable | Unique por suscripción/publicación. `pendingFetch / pendingKey / ready / rejected / expired` distingue recuperación pendiente de rechazo definitivo; snapshot independiente del clip mutable. |
| `SharedCursor` | channel/subscription ID, high-water sequence, retention gap | Avanza en transacción con la persistencia de recepciones, no por recibir un aviso. |
| `SharedEffectAttempt` | receipt/sink, attempt ID, generation, estado/motivo y report pending/ack | Historial, clipboard y script tienen resultados separados; no una falsa transacción de tres efectos. Reenvío de report metadata-only no reejecuta el efecto. |

Remote index contiene IDs, sequence, origin ordinal/epoch, recepción/expiración, tamaños y referencia a objeto cifrado. Texto, etiqueta de canal, contenido hash, metadata privada y keys no se guardan en claro en el servicio. Metadata de tráfico/IDs/tamaños sigue siendo visible: E2EE no promete anonimato.

MVP de formatos: UTF-8 `text/plain`, sin archivos/rutas implícitos. Dentro del payload cifrado: versión, tipo, contenido y digest de integridad si corresponde. La huella normalizada local sirve para dedupe local; no se sube en claro para "optimizar".

### Contrato de relay V1 tentativo

Contrato semántico común al relay real y fake; no endpoints productivos existentes:

| Operación | Entrada / salida | Guarda |
| --- | --- | --- |
| `enroll` / `approveDevice` | Invitación única, identidad pública del equipo y aprobación verificable | Scope privado, expiry y uso único; nunca credencial admin embebida en desktop |
| `listChannels` | Canales/grants autorizados, sin contenido/keys en claro | Credencial de dispositivo activa y entorno exacto |
| `publish` | Envelope firmado + objeto cifrado -> publication ID, sequence, acceptedAt y expiresAt | Auth/membership/epoch, byte limits, idempotencia antes de ordinal; commit antes de ack |
| `sync` | Channel + cursor + limit -> página ordenada, head, retention floor y next cursor | Sin saltar páginas; un gap de retención es dato explícito, no entrega fingida |
| `content` | Channel/publication ID -> objeto cifrado íntegro | Auth y grants actuales; no bucket público ni credenciales R2 en desktop |
| `watch` | Channel/head -> aviso de nuevo head + heartbeat | Canal autenticado; perder aviso se recupera por `sync`; no payloads en frames |
| `reportEffect` | Receipt firmado por receptor con publication/sink/outcome | Sólo outcomes propios, idempotente por attempt; no recibos que contengan clipboard |
| `revokeDevice` | Dispositivo + transición de grants/key epoch | Autoridad owner verificada; no un script ni un mero ID como permiso |

Envelope incluye protocol version, publication/channel/device IDs, origin ordinal, key epoch, expiración/freshness proof, descripción de ciphertext/nonce y firma. La codificación canónica, algoritmos y pruebas son gate criptográfico, no se inventan al implementar el transporte. No validar membership sólo por un dato firmado con la clave simétrica del canal.

IDs opacos aleatorios se serializan como strings. Sequence/ordinal usan enteros positivos sin pérdida de precisión: decimal string en wire/SDK y tipo validado en cada host, no `number` flotante para comparar un contador de 64 bits. Sequence nativa de Windows es otro espacio y sólo se compara por igualdad dentro de una tentativa acotada.

Errores tipados mínimos: `unauthorized`, `revoked`, `wrongEpoch`, `expired`, `conflictingPublication`, `staleOrdinal`, `overLimit`, `retentionGap`, `unsupportedVersion` y `temporarilyUnavailable`. El adaptador traduce HTTP al dominio; errors no incluyen payloads/keys. Credenciales nunca se ponen en query strings o URLs logueables. Endpoints/grants/canonical schema se fijan antes de generar cliente/servidor.

### Estados

- Outbox: `queued -> uploading -> accepted`; errores retryables conservan `queued` con diagnóstico/backoff. `expired`, `cancelled`, `rejected` son finales visibles. Una cancelación con commit remoto ambiguo se informa como tal, no garantiza retractar lo aceptado.
- Receipt: `stored` y resultados independientes por sink: `pending / applied / skipped / failed / uncertain`. `stored` no significa Windows actualizado.
- Script: `not_configured / pending / started / completed / failed / interrupted`; efectos arbitrarios no se reintentan automáticamente.
- Clipboard: claim durable antes del intento; éxito/fracaso registrados después. Crash entre ambos => `uncertain`, sin reproducción automática al reiniciar. Reintento manual explícito es otra tentativa sobre esa recepción.

## 5. Entrada de publicación y APIs Actions

### Snapshot del atajo

Añadir un input explícito, tentativamente `clipboardSnapshot`, sin redefinir `clipboard` existente. Trigger soportado inicialmente: global shortcut y acciones manuales que pidan snapshot. El host construye el contexto; el caller no inyecta snapshot IDs arbitrarios.

1. Al despachar el atajo, registrar generación/sequence nativa esperada y encolar en un worker acotado. Handler no lee payload, abre ventanas, arranca red/Node ni toma locks largos.
2. El reader abre clipboard con retry acotado, revalida sequence al leer y produce snapshot coherente, o devuelve `staleInput / clipboardBusy / unsupportedKind`.
3. No leer otro contenido después de arrancar Node ni sustituir por item activo. No se puede recuperar una versión pasada del clipboard sólo con su sequence.
4. Token opaco del snapshot ligado al run/perfil, con expiry y tamaño máximo. Payload queda host-side; al runner sólo llega ID/tipo/tamaño hasta pedir contenido con permiso.
5. `publish` consume/copia ese snapshot al outbox. Terminar el run elimina el snapshot efímero, nunca la publicación encolada.

El delayed rendering de Windows puede bloquear una lectura nativa aunque se limite el retry de `OpenClipboard`; no afirmar cancelación dura de `GetClipboardData`. Worker bounded, watchdog/invalidation y feedback evitan bloquear UI y crecimiento de threads; smoke nativo de delayed rendering es gate para afirmar latencia fiable.

### Contrato público tentativo V1

```ts
// Metadata solamente; no keys ni payloads.
await copicu.shared.listChannels();

// Snapshot capturado por el host para esta invocación.
const queued = await copicu.shared.publish({
  channelId,
  source: { type: "snapshot", snapshotId: ctx.inputSnapshotId },
});
// -> { publicationId, status: "queued" }, después del commit local.

// Texto calculado/transformado por un script de confianza.
await copicu.shared.publish({
  channelId,
  source: { type: "text", text: resultado },
});

await copicu.shared.getPublicationStatus({ publicationId });
// Metadata/outcomes locales y receipts remotos autorizados, no contenido.
```

- `shared:read-channels` para listar sólo canales otorgados a la acción.
- `shared:publish` + grant por canal; snapshot exige además permiso de lectura de la entrada. Texto generado exige publish igualmente.
- `shared:read-status` limitado a canales/publicaciones autorizadas.
- `shared:read-content` para obtener explícitamente contenido de una recepción/snapshot autorizados a ese run. No reutilizar `history.get` de un item mutable como entrada remota.
- Administración de vinculación, secretos, devices y grants no se expone a scripts V1. UI propietario configura suscripción/action binding; API de gestión de suscripciones queda para después si hay necesidad concreta.

El gateway revalida acción, capabilities y grants host-side; no acepta permisos o channel scopes aportados por el runner. `publish` sólo admite preparación validada y commit local acotado: red/upload fuera del host call, espera de locks/admisión con límite y error explícito si no puede confirmar persistencia. Probar un host call lento/bloqueado además del timeout del child; no prometer cancelación dura de I/O ni informar `queued` por un trabajo aún no confirmado. Scripts siguen siendo código local confiable con fs/network/shell: los gates de API no son un sandbox ni un control DLP absoluto.

Actualizar tipos SDK, discovery/input/context, host gateway/capabilities, runner, mocks/catálogos de Actions/Assistant y pruebas por comportamiento. Los métodos anteriores son propuestas, no APIs existentes.

### Acción receptora

Trigger propuesto `sharedClipboardReceived`. Contexto construido por el worker: receipt ID, subscription ID, channel ID, publication ID, origin device ID, sequence, recovery flag y generation; sin texto/keys por defecto.

- Binding explícito por suscripción, con acción descubierta sin errores y permisos/grants revisados. Crear/guardar un script desde Assistant no lo activa implícitamente.
- Ejecutar sólo para recepciones nuevas elegibles. Recovery no ejecuta acciones automáticamente en el primer corte; reprocesar es manual y advertido.
- Marcar `started` antes de arrancar Node, timeout/cola acotados y estado `interrupted` tras crash. No prometer exactamente una vez ni retries seguros de arbitrary effects. El runner actual retorna operaciones incluso al fallar y el host las procesa antes de revisar ese status: definir/probar la admisión de esas operaciones para el trigger receptor, validándolas host-side contra receipt/permisos/guards, sin cambiar acciones manuales. Registrar resultado del script y cada salida por separado; `failed` no significa rollback ni clipboard intacto.
- No disparar `clipboardChange` por el import remoto. Trigger nuevo usa el runner existente, sin un daemon Node ni segundo runtime.
- El contexto de recepción no autoriza paste/focus, ni grants nuevos. Permisos existentes de acciones manuales no se heredan como automatización receptora sin consentimiento.
- Primer corte bloquea publicación desde contexto receptor por defecto; forwarding entre canales necesita después configuración/grant específico y límites de hops. Publicación manual de un clip recibido sí es intencional y genera ID nuevo.
- La salida estándar de Windows usa helper protegido del dominio. Un script receptor que use `clipboard:write` se muestra como una segunda fuente explícita de escritura; V1 no permite coexistir esa escritura y el sink built-in en la misma suscripción. Sus operaciones retornadas de clipboard pasan por el mismo writer con receipt/generation/sequence guardadas al iniciar la recepción, no por la ruta manual sin esos guards. Un resultado lento no sobrescribe una copia posterior. Pausar recepción corta ambas fuentes pendientes; esto no cambia las acciones manuales existentes.

## 6. Recepción, orden y efectos nativos

### Flujo durable

1. Aviso remoto indica disponibilidad; el cliente pide una página desde cursor por HTTPS autenticado.
2. Validar entorno, channel/device grant, envelope/version, tamaño y origen; verificar firma y descifrar/autenticar antes de exponer contenido. Persistir receipts + cursor en una transacción, incluyendo estado por publicación: fetch transitorio o clave ausente son pendientes recuperables, no contenido vacío ni rechazo por corrupción. Sólo avanzar sobre entradas con registro durable ready/pendiente/rechazado; limitar pendientes y no avanzar por encima de una entrada que no se pudo conservar. Una entrada pendiente no impide procesar otras ya conservadas y listas. Retry de obtención/descifrado conserva identidad y clasificación/eligibilidad original, no crea una llegada live ni rejuvenece frescura; efectos siguen sujetos a Q1, generation y guards. Rechazo definitivo, expiración y pending se muestran separados; contenido inválido nunca se expone.
3. Tomar snapshot de la política/generation de la suscripción. Encolar sinks fuera de locks SQLite/UI/watcher.
4. History sink importa con operación de dominio; clipboard sink y acción sólo para eventos elegibles según procedencia, frescura y policy.
5. Guardar outcome y reporte metadata-only pendiente en receipt/attempt existente antes de enviarlo al servicio; reintentar ese reporte con el mismo attempt ID hasta ack o final visible, incluso tras crash/respuesta perdida, sin volver a ejecutar el efecto. No podar el reporte pendiente silenciosamente. Vincularlo criptográficamente al receptor/publicación/sink/outcome; `uncertain` no se convierte en `applied` ni una confirmación de servicio se inventa como receipt del equipo. El receipt acredita lo declarado por ese host, no demuestra qué pegó una persona. No marcar offline devices como aplicados ni exigir que todos estén online para aceptar un envío.

El eco de una publicación propia avanza cursor/estado de envío, pero no ejecuta history sink, clipboard sink ni acción receptora. No confundir reinicio del mismo dispositivo con una PC diferente.

Orden dentro del canal: server sequence, nunca reloj de PCs. Un upload antiguo puede obtener sequence nueva: considerar también origin ordinal y antigüedad; no asumir "commit reciente" = "copia recién hecha". Servicio conserva último ordinal aceptado por device/channel para rechazar publicaciones inferiores que llegan desordenadas. La outbox envía en FIFO por canal y origina ordinal antes del primer intento.

El cliente procesa efectos built-in en orden y sólo intenta el último elegible de una ráfaga. Ya procesado/skipped/failed un sequence, no permitir que un resultado lento anterior lo sobrescriba. Server sequence coordina orden, no integra la firma original del emisor asignada antes del commit. El relay sigue siendo autoridad de disponibilidad/orden; verificar identidades/rollback/gaps no prueba ausencia de censura o reordenamiento de un servidor malicioso.

### Live versus recovery

`live` exige suscripción habilitada en esa generation y publicación posterior al high-water de su bootstrap/reanudación, no expiración y upload fresco. Establecer el high-water en handshake de stream/recuperación evita clasificar un backlog como live por la conexión que lo transportó. Recuperaciones paginadas y publicaciones anteriores al barrier son siempre recovery.

Q1 confirmada: **`liveOnly`**. Backlog recuperado se conserva dentro de retención para verlo/copiarlo manualmente; reconectar, reiniciar o reanudar no escribe Windows automáticamente ni ejecuta acciones receptoras por recovery. `latestOnResume` queda fuera de V1. Nueva suscripción comienza en el head del canal; cargar historia antigua sólo por acción explícita.

Clock skew impide usar sólo `createdAt` enviado por el cliente como control de seguridad. Envío demorado lleva clasificación `deferred`, irreversible para auto-write V1; al reiniciar, lo pendiente es deferred. Frescura live se mide con lease del servicio + elapsed monotónico durante la sesión y se firma dentro del envelope. El host usa un lease vigente ya obtenido por el transporte activo; sin lease al preparar la publicación, ésta se firma como deferred, sin esperar la red para aceptar la cola local. Servicio y receptor verifican la prueba/expiración, no una afirmación libre del caller. Definir el protocolo exacto del lease/TTL en el gate técnico; timestamp local no basta.

### Clipboard writer

Un executor bounded serializa escrituras del dominio. Antes de cada intento:

- sesión Windows habilitada/desbloqueada y perfil vigente;
- misma suscripción/generation habilitada y sink permitido;
- sequence aún elegible, no self-origin, no expirado/deferred/recovery según Q1;
- clipboard nativo no cambió desde que se programó el efecto. Si otra app copió durante la espera, registrar `skippedLocalChange`, no reprogramar a una nueva sequence;
- revalidar esas condiciones justo antes de modificar clipboard, con lectura/check y write nativos bajo guard coherente. No comparar antes de una espera y escribir luego sin recheck.

Habilitar esta salida acepta reemplazos en vivo. El guard de cambio local protege una copia hecha **durante** la espera; no convierte sharing en una política "nunca reemplazar cualquier clipboard local". Al desbloquear/reanudar no aplicar el backlog al clipboard automáticamente (`liveOnly` confirmado).

La confirmación de pausa es una barrera del executor: invalida generations pendientes y reconoce cualquier mutación nativa ya iniciada antes de responder "pausado". No espera a que termine un script ni mantiene SQLite bloqueada durante I/O. Después del ack de pausa no empieza otra escritura automática de esa suscripción; una escritura ya consumada no se revierte.

**At-most-once automático de tentativa, no exactly-once del efecto:** claim durable y guard final; crash ambiguo no reintenta automáticamente. Busy puede tener retries acotados dentro de esa tentativa sin cambiar generation/expected sequence. Fallo final deja la recepción disponible para copiar manualmente. Preparar/validar buffers antes de mutar Windows; un fallo después de vaciar o escribir algún formato es `uncertain/partialWrite`, no prueba de clipboard intacto. Los formatos de Windows no constituyen una transacción revertible: no restaurar un clipboard anterior por encima de una copia externa posterior.

Procedencia: registro de publicación/receipt + correlación de escritura propia por sequence nativa y marker de sesión host-generated. Reusar/ampliar helpers de clipboard, no añadir sólo otra ventana temporal de hash. Escritura de texto+marker en una operación nativa coherente y publicación de su correlación antes de que el watcher la procese. Una recopia externa posterior del mismo texto con otra sequence no se descarta por el mero hash. Marker no es credencial/autorización ni una garantía contra otras apps del mismo usuario.

Verificar coexistencia con host writes actuales, delayed rendering, ráfagas, clipboard ocupado y Windows/RDP clipboard sync. Si la correlación fiable requiere refactor más grande que el vertical, detener y ajustar plan, no quitar el guard ni cambiar capturas locales en silencio.

### History sink y carpeta

Operación propuesta `import_shared_text(snapshot, subscription, receipt)` bajo AppStorage:

- Ni `insert_text_with_scenario` ni `history.create` son wrappers neutros de import: ambos usan destino armado y bookkeeping de captura; create además puede fusionar metadata (`storage.rs`, líneas 1687–1740 y 1866–1934). Reusar helpers transaccionales, no esas operaciones completas.
- Validar existencia de carpeta y snapshot de policy/generation en la misma transacción que admite el import. Si delete gana la carrera, sink inválido sin reroute; si import commit ocurre primero, un delete posterior conserva su semántica local existente. No cambiar `delete_folder` para simular una carpeta remota.
- Identidad por hash local para dedupe; sólo clips nuevos reciben `folder_id` configurado. Duplicados conservan su ubicación y metadata.
- No consumir destino de captura armado, contar copia externa local, inventar foreground de Casa como origen de Trabajo ni aplicar escenario/tags de captura ordinaria.
- Registrar procedencia remota en el receipt durable, no sólo en los tres eventos de captura retenidos de un clip.
- Mostrar feed de recepciones por suscripción independiente del scope de carpeta. Así un duplicado ubicado en otra carpeta sigue visible y tiene vínculo al clip si existe.
- Root usa retención ordinaria; carpeta conserva la protección existente. Advertir conservación al elegir carpeta, no inventar retention por sharing para todos los clips.
- Si el clip es eliminado/editado más tarde, el receipt retiene su snapshot según su TTL. `local_item_id` nullable no impide copiar la publicación original ni debe impedir borrado explícito del clip.
- Carpeta faltante invalida ese sink sin reroute. Otros sinks tienen su resultado independiente y la recepción queda recuperable.

## 7. Identidad, cifrado y recuperación

Requisito: contenido cifrado antes de upload; TLS no sustituye E2EE. No diseño criptográfico casero ni "encriptación" con hash/base64.

- Credencial de transporte por dispositivo, scoped a grants; distinta de claves de contenido y de cualquier token operativo/admin de Infra.
- Claves privadas bajo custody Windows por usuario/perfil, referencias opacas en SQLite. No `.env` del producto, command line, SDK/Node, logs ni payloads React.
- Canal usa key epoch; payload AEAD autentica channel/publication/origin/ordinal/version/epoch y límites relevantes. Origin device debe ser verificable con identidad/firma del dispositivo, no sólo una string recibida del relay o posesión de la clave compartida.
- Inicialización crea owner/primer dispositivo. Enrolamiento privado mediante invitación single-use de alcance mínimo; segunda PC requiere aprobación de la primera y verificación humana por código/QR/out-of-band. El relay no puede insertar silenciosamente una clave de dispositivo autorizado.
- Keys de canal se transfieren en envelopes protegidos al dispositivo aprobado mediante una implementación/protocolo auditado. El código corto de pairing no es la clave de cifrado ni un bearer permanente.
- Revocación cancela auth/grants, invalida sesiones, rota key epoch para contenido nuevo y permite a clientes rechazar dispositivos revocados. Lo ya descargado no se borra; publicaciones en vuelo del epoch anterior se descartan/revalidan, no se reencryptan hacia dispositivos revocados.
- Recuperación propuesta V1: transferir desde un equipo aprobado que conserva keys. Si se pierden todos, se pierde acceso al contenido anterior; declarar esa limitación y permitir canal nuevo. Recovery key exportable/passphrase exige otro flujo revisado antes de prometerlo, especialmente para backup futuro.
- Q3 confirma servicio privado sin cuentas/login de producto V1. Una cuenta futura autenticaría a una persona, no descifraría ni recuperaría mágicamente el contenido. No compartir tokens/client secrets de Fixvox o gcloud.
- Service/transport credentials quedan fuera del backup normal futuro. Restaurar perfil crea identidad nueva y exige revalidar vínculos/effects; no reutiliza device ordinal ni credenciales clonadas.

**Gate técnico previo al servicio real:** C1 selecciona versiones/features/licencias/MSRV y prueba vectores AEAD/Ed25519/HPKE; custodia current-user y relay local implementados opt-in. Falta cerrar enrollment humano/durable, certificados/grants de producto, rotación, custody de credenciales y adapters nativos/runtime. No considerar la composición auditada ni usar la fecha para eludir esos requisitos.

Amenazas cubiertas: usuario/red ajenos, dispositivos no otorgados/revocados, payload manipulado/replayed, fugas de keys/payload a logs y enrollment no consentido. No protección absoluta contra malware, administrador local, scripts confiables maliciosos, equipos autorizados que redistribuyen contenido ni DLP del empleador. No presentar E2EE como permiso para sacar datos laborales.
