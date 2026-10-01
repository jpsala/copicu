# Arquitectura propuesta: clipboard compartido

Status: draft técnico sin sharing runtime. Actualizado: 2026-10-01. N1 nativo sintético: 11 Clipboard y 6 DPAPI pasan en Sandbox. C1/T1 opt-in incorpora XChaCha20Poly1305/Ed25519/HPKE/DPAPI y relay local, con vectores e interop HTTP/SQLite real; D1 se integra explícitamente sobre fixtures. Alcance Q1–Q3 confirmado por JP en [`spec.md`](spec.md): `liveOnly`, texto plano y servicio privado. Cinco dependencias aprobadas con «avancemos» y ejecutadas; proveedor/deploy, enrollment humano/durable, runtime/nativo y dos PCs no se acreditan con ese permiso. Resultados actuales y límites en [implementación local](local-implementation.md).

## 1. Recomendación y fronteras

Construir un dominio pequeño de **publicaciones inmutables + suscripciones locales**, con un servicio de relay cifrado. Primer vertical con alcance confirmado: texto entre los equipos de JP en servicio privado, publicación explícita por Actions/hotkey y recepción configurable con salida built-in al clipboard, `liveOnly`. No crear una réplica de SQLite, un bus universal de automatizaciones ni un framework de proveedores.

- **Canal** es destino lógico remoto. **Carpeta** es ubicación local. **Suscripción** conecta ambos sin equipararlos.
- Publicación contiene un snapshot, no una referencia viva al clip del emisor. Editar un clip no modifica lo publicado.
- Recepción pertenece a la suscripción y puede existir sin un clip local asociado. La deduplicación de clips no deduplica publicaciones.
- Importar a historial y escribir Windows son salidas independientes. La escritura built-in no usa `picker.activate`, foco anterior ni paste.
- Backup futuro usa otro contrato: snapshots/versiones/restore, no la retención ni el replay del canal.

```text
Atajo / menú / script local
  -> snapshot de entrada + autorización
  -> publicación durable cifrada en outbox
  -> worker de transporte
  -> relay: objetos cifrados + orden/idempotencia por canal
  -> recuperación por cursor / aviso en vivo
  -> recepción durable + procedencia
  -> salidas independientes:
       guardar en historial local
       escribir clipboard con guards
       ejecutar acción local asociada, si está habilitada
```

Con sharing apagado no se inicia transporte ni se lee clipboard para este dominio. Cuando se habilita, los workers viven en el host Rust y no dependen de una ventana React visible.

## 2. Lo que permite y lo que limita el repo actual

| Evidencia local | Consecuencia de diseño |
| --- | --- |
| `docs/topics/actions-and-scripting-api.md`, `src-tauri/src/actions/model.rs` | Reusar Actions, shortcuts, discovery y host capabilities. Ampliar contratos explícitos; no usar SQL/Tauri arbitrario como SDK. |
| `src-tauri/src/lib.rs::run_global_script_shortcut` | `selection: active` resuelve un clip reciente del historial, no garantiza el clipboard actual. No sirve como entrada del comando de envío. |
| `src-tauri/src/actions.rs::script_clipboard_read` | La API actual lee texto al momento del host call. Tras arrancar Node puede ser demasiado tarde; no prometer snapshot de atajo con ese wrapper. |
| `src-tauri/src/actions/input.rs`, `actions.rs::run_clipboard_change_actions` | `input.source: clipboard` está ligado al item capturado en ese trigger. No cambiar silenciosamente su semántica para todos los scripts existentes. |
| `src-tauri/src/actions.rs::run_script_action_definition` | Escrituras de scripts se aplican desde operaciones retornadas por Node, incluso antes de evaluar `status: failed` (líneas 511–600). Un `publish()` que devuelve "en cola" necesita host call con commit local, no una operación diferida que mienta sobre persistencia. Fallo del script no prueba ausencia de efectos. |
| `src-tauri/src/actions.rs::run_node_script_runner`, líneas 1830–1870 | El timeout se comprueba alrededor del loop, no durante `handle_script_host_call` síncrono. El nuevo gateway debe acotar su propio trabajo; el timeout de Node no cancela un host call bloqueado. |
| `src-tauri/src/clipboard.rs::PostCaptureProcessor` | Capturas normales disparan enrichment y `clipboardChange`. Importación remota debe tener su ruta/procedencia y no pasar automáticamente por ese pipeline. |
| `src-tauri/src/clipboard.rs::SelfWriteSuppression` | Suppression actual es hash + ventana temporal; no prueba origen remoto ni protege por sí sola contra loops o una recopia externa del mismo texto. |
| `specs/014-folders/spec.md`, `storage.rs::insert_text_with_scenario` | Dedupe global conserva carpeta. Inserción ordinaria usa destino armado y cuenta captura local; importación remota necesita una operación de dominio que no invente esos efectos. |
| `src-tauri/src/storage.rs`, `storage/schema.rs`, `storage/folders.rs` | Reusar AppStorage, transacciones/migrations y validación de carpetas. No una DB local paralela sólo para sharing. |
| `src-tauri/Cargo.toml` | No hay librería declarada de HTTP/WebSocket, AEAD/firma/custody genérica. `sha2` y `base64` no implementan E2EE. Selección/adición requiere el gate de dependencias. |
| `docs/topics/ui-surface-architecture.md` | Configuración durable en Settings; picker conserva acciones rápidas y estado compacto. No nueva shell ni web dashboard obligatorio. |

La revisión es del checkout local. No se abrió historial productivo, `.env`, claves ni sesiones personales; no se hizo probe de infraestructura viva.

## 3. Servicio y proveedor

### Candidato preferido, no cerrado: Cloudflare

Infra documenta R2/D1 para Foundry y Workers/Durable Objects para Fixvox. Fuentes centrales:

- `C:/dev/infra/docs/runbooks/cloud-services.md` (2026-09-18).
- `C:/dev/infra/docs/INVENTORY.md` (2026-09-02).
- `C:/dev/infra/AGENTS.md`: autoridad, separación de recursos y gates externos.

Propuesta de wiring:

- Worker como fachada HTTPS autenticada: vinculación, publicación, recuperación y receipts.
- Candidato de texto V1: Durable Object con SQLite por canal, secuencia/membresía/grants/idempotencia/envelope/ciphertext en el mismo almacenamiento transaccional. No usar KV eventualmente consistente como árbitro de orden. El [preflight](research.md) contrasta capacidad y costo documentados, no una cuenta desplegada.
- R2 **propio de Copicu**, privado, sólo si formatos/tamaños futuros justifican objetos externos. No es requisito del vertical de texto ni recurso autorizado; imágenes/backups mantienen políticas separadas.
- Almacenamiento durable de dispositivos/vinculaciones con un coordinador de owner pequeño o D1 **sólo si** la complejidad de cuentas lo justifica. No añadir ambos por reflejo.
- Comunicación push sirve como aviso; cursor HTTP es autoridad para recuperar. WebSocket con hibernación es candidato, no requisito para aprobar la spec; fallback de polling acotado en redes laborales.

En el candidato de store único, admitir ciphertext/envelope inmutables e índice/sequence en una transacción corta; ack sólo tras commit y sin I/O externo dentro de ella. Si un adapter usa objetos externos, publicar primero el objeto completo cifrado **inmutable** y después commit del índice/sequence. Un retry conflictivo nunca puede sobrescribir el objeto referenciado por un commit anterior: usar identidad inmutable del objeto, vinculada a los bytes cifrados y al envelope canónico. Avisar/confirmar sólo tras commit, con referencia íntegra y existente. Cleanup debe coordinarse con finalización/commit: una carga no es eliminable sólo porque aún no aparece en el índice; no borrar objetos referenciados o en finalización. El mecanismo concreto y sus fallos son gate del adapter, no una transacción R2/índice supuesta.

El orden/idempotencia se resuelve por publicación, no por nombre visible o timestamp del emisor. Tras autorización, resolver un ID ya aceptado antes de comprobar ordinal/expiry: mismo ID, envelope inmutable y ciphertext devuelve su commit original; cualquier diferencia falla como conflicto sin mutar ese commit/objeto. Los commits nuevos requieren ordinal y expiración válidos. Contrastar también un almacenamiento transaccional único para texto si satisface límites/costo: R2 no es requisito del dominio ni elección aprobada.

Revalidar antes de elegir: binding/plan de cuenta, límites y costo de objetos, requests, almacenamiento, conexiones/hibernación, alarmas/cleanup y permisos de deploy. El preflight cita límites/pricing públicos y cálculos sintéticos; no se verificaron cuenta, costo real ni recursos disponibles. No reutilizar bases, OAuth clients, secrets, buckets ni namespaces de Fixvox/Foundry.

### Alternativas

- **VPS/Coolify + servicio dedicado + SQLite/objetos:** viable si simplifica el equipo operativo. Más cuidado con disco, TLS/ingress, backup del relay y concurrencia; no meter payloads de Copicu en datos de Constelaciones.
- **Google Drive:** destino futuro de backup/export cifrado; no primer transporte de baja latencia. Integración Drive no aparece documentada en Infra. Un directorio de snapshots sincronizado por el cliente de Drive evita OAuth propio inicialmente, pero nunca sincronizar `copicu.sqlite3` activa ni WAL/blobs mutables.
- **P2P/LAN/Tailscale:** no requerido para Trabajo ↔ Casa; agrega disponibilidad simultánea, discovery/red corporativa y NAT. No implementar como fallback especulativo.

Mantener un contrato de relay versionado y un adapter concreto + fixture fake para tests. No una interfaz de plugins/clouds desplegable ni múltiples providers antes de probar el vertical.

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

## 8. Límites y UX propuestos

Valores iniciales para discutir/verificar, no defaults existentes ni cuotas cloud comprobadas:

| Control | Propuesta inicial |
| --- | --- |
| Payload texto | <=1 MiB UTF-8 antes de cifrar; validar byte length, no char count |
| Outbox por perfil | <=100 pendientes y <=16 MiB cifrados; rechazar nuevo envío con feedback al llegar al primer límite |
| Publicaciones remotas | TTL 24 h inicialmente; limpieza explícita y floor de cursor, sin declarar backup |
| Receipts locales | 7 días o 500 por suscripción, el primer límite; snapshots/status compactos, clips en carpeta conservan política existente |
| Recovery | Páginas de <=50, sin cargar todo historial ni ejecutar scripts por página |
| Retry/transporte | Backoff con jitter y máximo finito; auth/key/quota permanent errors no tight loop |
| Sink clipboard | Cola coalescida al último elegible; no backlog de efectos ni retries tras crash |
| Acción receptora | Cola acotada, límite de runtime y una ejecución serial por suscripción; saturación visible, receipt conservado |
| Efectos competidores | Una suscripción con escritura automática por perfil V1, sea sink built-in o acción con `clipboard:write`; las demás reciben/guardan sin escribir |

Nunca podar pendientes in-flight o receipts con efecto activo sin transición explícita. Limpiar payloads cifrados completos, índices y attempts de forma consistente; UI distingue contenido expirado de receipt metadata. El servicio conserva identidad/idempotencia de IDs al menos hasta su expiración más ventana de retry; reject expired en vez de aceptar como nueva una publicación cuyo registro ya se limpió.

Settings, sección Sharing: equipos, canales, suscripciones, outputs, carpeta, estado, pause/disconnect/revoke. Picker: acción "Enviar a…", preset script con shortcut elegido sin colisiones y estado breve, sin nueva fila permanente por canal. Feed de recepción es scope local del picker basado en receipt, no carpeta remota obligatoria ni app web nueva. Usar controles Mantine existentes, teclado/lector de pantalla, labels explícitos y feedback metadata-only. Pausar toda escritura remota debe estar accesible aun con picker cerrado vía acción/tray.

No mostrar preview de clipboard en notificaciones por defecto. No mostrar online sin heartbeat/estado reciente ni "aplicado" por aceptación del servidor. Pausa de recepción no equivale a revocar ni a borrar contenido local.

## 9. Verificación y gates de la sesión de implementación

No tests de producto ejecutados en esta preparación; la tabla es aceptación futura.

| Área | Casos necesarios |
| --- | --- |
| Snapshot/Actions | Clipboard B vs picker A; change before read; Node cold start; expired/foreign token; capability/channel denial; malformed/overlimit input; real hotkey conflict |
| Durable domain | Crash antes/después de outbox commit; accepted sin respuesta; replay mismo ID/ciphertext; dos publications del mismo texto; ordering/ordinal/gap/TTL; límites de colas |
| Recepción/local | Guardado transaccional + cursor; corrupt payload no bloquea; immutable receipt vs edited/deleted clip; dedupe carpeta diferente; missing folder; marks/Inbox/capture destination intactos |
| Clipboard nativo | Dos PCs, app externa + hotkey real; ocupado; delayed rendering; remote arrival vs local recopy; sequence antes de write; pause/generation; session lock; burst; crash ambiguous; no paste/focus |
| Automatización | Binding deshabilitado/editado; opt-in explícito; recovery no ejecuta; timeout/fallo/cola llena; hostCall bloqueado; operaciones retornadas con status failed y outcomes separados; no reejecución arbitraria; prevención de forward loops; nuevos scopes en catálogo Assistant |
| Servicio/seguridad | Cross-channel/device denial; wrong environment; pairing expired/replayed; origin spoof; ciphertext tamper; epoch rotation/revoke en vuelo; idempotencia/retención; secrets/payload ausentes de logs |
| UI/performance | Narrow/keyboard/a11y; estados honestos por sink; pausar sin picker; empty/offline/error; sharing disabled sin red/read; captura/search no bloqueadas |

### Matriz mínima de evidencia (propuesta, no ejecutada)

| Repro / requisito | Resultado esperado | Evidencia necesaria |
| --- | --- | --- |
| Picker A, clipboard B, cambio C antes de read — US1 / FR-05 | B coherente o stale; nunca A/C sustituidos | Guards deterministas + hotkey/reader Windows y cold Node reales |
| Dos envíos iguales + retry — FR-06/10/12 | Dos publicaciones/receipts, un clip; retry conserva ID/bytes | Dominio/SQLite/relay fake, nuevos tests pendientes |
| Upload conflictivo; GC entre upload/commit — FR-09/12 | Commit anterior intacto; ningún ack con objeto ausente | Adapter con fault injection/cleanup; fake no acredita atomicidad del proveedor |
| Outcome guardado, crash antes de report/ack — US4 / SC-04 | Reenvío del mismo report; cero repetición del efecto | Persistencia/reinicio/relay fake, luego integración real |
| P sin clave/fetch y Q válida — US5.4 / FR-17/21 | P durable pendiente, Q progresa; retry no se vuelve live | Dominio/SQLite con fallos y límites; sin descifrado fingido |
| Dedupe X/import Y; delete concurrente; clip editado — FR-14/15 | Sin merge/move ni destino armado consumido; receipt inmutable; delete según orden de commit | Transacciones SQLite + runner; tests shared nuevos |
| Script lento/writeText/writeItem/fallo, recopia o pausa ack — FR-09/16 | Sin writes tardíos; outcomes honestos, no rollback supuesto | Scheduler/host gateway + executor Windows real |
| Remoto T y recopia externa T; busy/delayed render/lock/crash — FR-11/13 | Procedencia correcta; uncertain/partial visibles; no replay automático | Watcher/owner externo/Windows y proceso reales, no mocks |
| Trabajo ↔ Casa y toggles off — SC-01–03/08 | 30 por sentido; >=95% de 60 en <=2 s bajo SC-02; 20 sin write al apagarlo; off sin reads/red | Dos PCs y apps externas con datos sintéticos; no autorizado/ejecutado aquí |

Pruebas existentes inspeccionadas y reutilizables, **no ejecutadas en la ronda**:

- `src-tauri/src/clipboard.rs`: `retry_clipboard_operation_retries_until_success`, `self_write_suppression_consumes_matching_hash_once`, `suppression_tracks_multiple_writes_without_consuming_external_content`, `external_copy_after_different_self_write_is_not_a_consecutive_duplicate`. Son lógica local; `clipboardChange` real incluso está excluido por `cfg(test)` en líneas 666–676.
- `src-tauri/src/storage/folders_tests.rs`: `capture_dedupes_globally_and_scoped_pages_and_find_follow_folder_identity`, `manual_creation_uses_destination_and_dedupe_preserves_prior_folder`, `four_deletion_modes_have_exact_counts_and_preserve_subtree_shape`, `retention_protects_folder_then_prunes_root_after_move`. Fixtures SQLite, no cobertura shared ya existente.
- `src-tauri/src/actions.rs`: `script_host_gateway_denies_clipboard_read_without_read_capability`, `creating_history_requires_its_own_capability`, `global_shortcut_diagnostics_reject_reserved_and_duplicates`, `script_runner_wait_timeout_kills_synthetic_child`. Helpers/child, no prueba de timeout del host call ni de nuevos grants.
- `tests/script-runner.test.mjs`: `preserves real newlines, literal backslashes, and regex whitespace through TypeScript host round trip`, `reports a read-back mismatch as a false verification and failed script`. Node real con host fake, no gateway Rust ni Windows.

Mocks no acreditan OpenClipboard/GetClipboardData, delayed rendering, correlación watcher, barrera nativa de pausa, hotkey/foco, lock de sesión ni interferencia Windows/RDP. Una PC Windows valida carreras nativas; dos PCs son gate para entrega/aplicación y latencia remotas. Los modelos efímeros de la revisión sólo contrastan contraejemplos arquitectónicos.

[Research/preflight](research.md) registra L1 autorizado/completado: lógica interna `cfg(test)` y 25 unit tests en memoria con dependencias existentes, sin wiring runtime, clipboard, perfiles, instalación o red. El modelo Rust se compila/ejecuta en tests; no acredita writer Windows, journal durable, scheduler real ni E2EE. N1 nativo/custody y transporte tienen gates/permisos distintos.

[Dossier N1](n1-native-custody.md): harness standalone opt-in sin wiring de app; N1-A completo con Check/Build offline/locked y 15 tests Pure. B (11 Clipboard) y C (6 DPAPI) autorizados y ejecutados en Windows Sandbox aislado, con helpers/artefactos y ambos guests cerrados. Correlación del writer del harness comprobada después del cierre, bajo nueva exclusión y owner/marker/sequence estable. No cierra el gate del watcher shipping, E2EE ni dos PCs.

El [corte local autorizado](local-implementation.md) implementa D1/C1/T1 candidatos sobre fixtures, con cinco dependencias opcionales aprobadas y sin startup. Conserva checks/repro y los límites reales. Orden de integración restante:

1. Usar Q1–Q3 ya confirmadas; precisar presupuestos/límites y gates técnicos, scope de datos y restricciones laborales. Solicitar permisos concretos antes de código/spikes con efectos, instalación o recursos.
2. Spike acotado de snapshot/writer con perfil sintético y suite de cifrado/custody. Seleccionar dependencias y solicitar autorización exacta antes de instalarlas.
3. Probar dominio/Actions/relay fake y UI mínima end-to-end; preservar APIs existentes. Aislar dev/instalada, sin credenciales reales.
4. Preparar servicio aislado con tests locales y plan de recursos/costo/rollback. Deploy, DNS, enrollment real y pruebas de dos equipos requieren sus permisos explícitos; no extrapolar esta sesión a ellos.
5. Gate real de dos PCs: matriz US1–US5 + SC1–SC8 con tokens sintéticos y receipt por dispositivo. Un mock de runner/WebView no demuestra clipboard remoto real.

Puntos de integración probables: nuevo módulo pequeño `shared_clipboard` y storage de dominio; Actions/context/gateway/SDK; helpers de clipboard/procedencia; lifecycle backend; Settings/picker. No incrementar `lib.rs`/`storage.rs` con todo el feature monolítico ni modularizar unrelated code como requisito oculto.

## 10. Checklist de revisión de este diseño

- [x] Caso Trabajo ↔ Casa explícito y no depende de picker ni de copiar todo historial.
- [x] Distinción canal/suscripción/carpeta/publicación/receipt y backup.
- [x] Compatibilidad con Actions y límites reales de snapshots/operaciones diferidas documentados.
- [x] Dedupe local no mueve clips ni pierde visibilidad de recepción.
- [x] Orden, deferred/recovery, cambio local, pausa/generation y crash ambiguo tienen resultado propuesto.
- [x] Exactly-once de efectos, disponibilidad con app cerrada y seguridad de Node no se prometen.
- [x] Recursos/keys de otros productos no se reutilizan; no hay dependencia/proveedor escogido silenciosamente.
- [x] Desarrollo, pruebas, permisos externos y continuidad separados de implementación.
- [x] Q1–Q3 confirmadas por JP: `liveOnly`, texto plano, servicio privado.
- [x] Preflight con fuentes primarias/candidatos/dossier; L1 autorizado y modelo Rust `cfg(test)` con 25 unit tests pasa offline. Sin instalación ni runtime shared.
- [ ] Composición criptográfica/enrollment/versiones, custody, cuenta/costo y vectores validados; dependencias autorizadas. Fuentes públicas no sustituyen esos gates.
- [x] Primitives N1 sintéticas: 11 Clipboard y 6 DPAPI en Sandbox, delayed/timeout y fin de helpers; no integración shipping.
- [ ] Política nativa integrada con watcher/hotkey y límites de latencia shipping verificados, lock/suspend/dos PCs.

**Readiness:** alcance confirmado, L1/N1 comprobados y candidatos D1/C1/T1 en pruebas locales; arquitectura técnica draft, no lista para activar sharing ni ejecutar cloud. Dependencias autorizadas; cerrar enrollment/custody de producto y adapters runtime/servicio/nativo. No reabrir Q1–Q3 sin pedido de JP.
