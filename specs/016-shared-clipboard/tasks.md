# Portapapeles compartidos: plan y ejecución

## Continuación: primer acceso entre PCs (2026-10-02)

Pedido actual de implementación, sin heredar modelo, supervisión ni permisos
históricos. Contrato en [identity-service-plan.md](identity-service-plan.md).

- [x] I1 Recuperar WIP y fijar contrato, propuesta de proveedor/servicio y gates.
- [x] I2 Servicio OIDC/PKCE durable, identidad cerrada, alta/cancelación/retry.
- [x] I3 Host DPAPI y estado durable; navegador y primer acceso sin bundle.
- [x] I4 Aprobar equipos con huella/HPKE, distribuir nuevas claves y retirar.
- [x] I5 Recuperación E2EE explícita y snapshot cifrado con límites visibles.
- [x] I6 UI integrada, errores/offline, conexión inicial y regresiones afectadas.
- [x] I7 Artefactos de servicio/config/proxy/deploy y guía revisables.
- [x] I8 Aceptación local de perfiles nuevos, host/UI reales y evidencia curada.
- [x] R1 Aprobar proveedor/cuentas, destino/costos, DNS/HTTPS y desplegar.
- [ ] R2 Publicar/instalar cliente y aceptar en dos PCs físicas con sintéticos.

JP autorizó deploy/distribución el 2026-10-02. Cliente `v0.5.3` normal/latest
publicado, firmado, payload verificado e instalado con el mismo hash; tres checks
release/instalada pasan. Updater HTTP 200/version y downloads verificados.
R1: confirmaciones puntuales dadas, Google/DNS/HTTPS activos, backup consistente
y restauración aislada con issuer conservado. R2 queda abierto por envío/recepción
física sintética y streaming remoto, separados de las pruebas debug y locales.
JP reportó entrega manual de texto en una dirección entre sus PCs.

## Ampliación: texto e imágenes (2026-10-02)

Contrato en [media-plan.md](media-plan.md); [evidencia](media-acceptance.md).
JP confirmó dejar archivos para después.

- [x] M1 Fijar representación cifrada tipada y límites PNG/transport/IPC.
- [x] M2 Captura, colas, importación de imágenes y provenance sin eco.
- [x] M3 Snapshot/escritor Windows aislado con PNG/DIBV5 y fences existentes.
- [x] M4 Previews, historial, copia/guardado manual y envío del clipboard actual.
- [x] M5 Regresiones locales, PNG malicioso, cuotas y round-trip nativo sintético.
- [x] M6 Desplegar límite del relay y distribuir/instalar el paquete exacto firmado.
- [ ] M7 Actualizar ambas PCs y aceptar entrega física de imágenes.

## Revisión: cuenta canónica y servicio interno (2026-10-02)

Contrato en [identity-service-plan.md](identity-service-plan.md).

- [x] A1 URL única interna, sin campo editable ni requisito de URL en el primer
  acceso; errores de conexión identifican el servicio. Loopback sólo en debug/tests.
- [x] A2 Política explícita de cualquier cuenta autenticada en el broker; conservar
  firma/issuer/audience/nonce/PKCE y separación por subject. Tests locales pasan;
  Google Audience y configuración pública todavía no se cambiaron.
- [x] A3 JP eligió custodia gestionada por el servicio el 2026-10-03, aceptando
  que el operador puede descifrar. Contrato: [service-key-custody.md](service-key-custody.md).
- [x] A4 Vincular PCs al mismo nivel por cuenta, sin aprobación ni transferencia
  entre PCs; migración compatible, acceso/retiro y pruebas de aislamiento.
  Regresiones y cinco casos UI/host Windows con perfiles sintéticos pasan;
  deploy y distribución verificados por separado; no acredita dos PCs físicas.
- [ ] A5 Activar la admisión pública, distribuir el cliente actualizado y completar
  prueba física de envío/recepción sin efectos locales implícitos.

Al iniciar el cierre pedido el 2026-10-03, latest es `v0.5.5` y el servicio
todavía anuncia aprobación/recovery legados. JP reporta autenticación y uso
entre Casa y Trabajo y aprobación pendiente en la notebook; no sustituye A4/A5
ni la aceptación física pendiente. Estado y evidencia del reemplazo en
[custody-acceptance.md](custody-acceptance.md).
El corte para la notebook conserva la admisión OIDC/Google existente; no incluye
abrir Audience/admisión general. A5 permanece separado de su distribución.
Custodia ya está desplegada con issuer conservado y backup/restore aislado
comprobado. El cliente `v0.5.6` definitivo está firmado y verificado, incluidos
cinco casos shipping. Publicación stable/latest, assets y updater verificados desde
`01c0f2e229053d96afc3ab619b3d27080d368eea`; instalación y prueba física pendientes.
Actualizar y abrir primero una PC existente para migrar claves, después las demás.

I1–I8 no acreditan R1/R2. Mantener V1/V2/SSE y los opt-ins de Windows/Actions.
Evidencia y reproducción en [identity-acceptance.md](identity-acceptance.md).

## Continuación: sincronización SSE (2026-10-02)

JP confirmó SSE y pidió nueva sesión supervisada. Fuente de implementación:
[sse-sync-plan.md](sse-sync-plan.md). Evidencia actual en
[aceptación SSE local](local-acceptance.md#aceptacion-sse-local-2026-10-02).

- [x] S1 Fijar schema/cursor por audiencia y snapshot-watermark consistente;
  tests de transacción, idempotencia, replay/live y permisos.
- [x] S2 Persistir eventos de control junto al cambio y exponer changes/SSE en
  relay sintético; heartbeat, revocación, límites, gap/reset y shutdown.
- [x] S3 Host por perfil: transporte dedicado, cache/cursor durable, cancelación,
  backoff/fallback y revalidación de identidad sin bloquear operaciones actuales.
- [x] S4 Invalidación Tauri en biblioteca/selector/Settings; preservar borradores,
  selección/foco y mostrar conflicto/retiro/offline.
- [x] S5 Aceptación real entre perfiles, abiertos/ocultos, con reconnect/restart,
  permisos y Computer Use; documentar evidencia y repetir checks pertinentes.
- [x] S6 Avisos de head de publicaciones despiertan sync V1 sin alterar leases,
  pausa/retención/dedupe ni provocar efectos por replay de control.

S1–S6 cerrados localmente en la continuación del 2026-10-02. S3–S5: 13 casos
de lifecycle por modo (denied en catálogo o SSE), ocho de superficies reales y
retiro nativo en Library/selector/Settings. Snapshot retenido rechaza identidad/
pausa tardías; denied cancela el stream, unsupported mantiene fallback acotado y
restart reconcilia con picker oculto. Settings conserva conexión/borrador/selección
y explicita retiro. S6: avisos de head transaccionales, lectura autorizada, wake
acotado del sync V1; diez casos shipping y regresiones de replay/burst/pausa/sin
eco/backfill. Rust 70 + 37, Bun 31, diez visuales y build/restart normales pasan.

Próximo corte: preparar servicio/destino remoto revisable y aceptación en dos PCs
cuando JP lo pida. No reducir ticks ni ampliar efectos por estos resultados.
Antes de retomar, comprobar checkout/WIP, fuentes, ownership y procesos/perfiles;
la supervisión anterior permanece `PAUSED`. Instalación, commit/push, deploy y
datos reales necesitan autorización actual. Evidencia y límites en la aceptación
SSE enlazada arriba; no sumar repeticiones como casos distintos.

## Revisión vigente (2026-10-02)

Implementación local completada y validada en el build normal. JP autorizó
Sol 6.1 high, supervisión y hasta dos agentes. Contrato en [spec.md](spec.md), arquitectura
en [plan.md](plan.md), UX en [folder-first-design.md](folder-first-design.md) y
evidencia pública en [sharing-patterns.md](sharing-patterns.md).
La evidencia nueva está en [local-implementation.md](local-implementation.md#corte-de-producto-local-2026-10-02).
Instalación local posterior autorizada y matriz instalada ↔ dev con Computer Use:
[local-acceptance.md](local-acceptance.md), 39 casos de host real más recorridos nativos.
Las pruebas locales no acreditan proveedor humano, deploy ni aceptación en dos PCs.

- [x] Confirmar espacio propio por persona y flujo desde carpeta.
- [x] Confirmar consulta de historial disponible sin importación automática.
- [x] Incorporar conexión general y pausa por dirección; JP pidió alcance cambiable en Settings.
- [x] Contrastar Syncthing, Dropbox, Signal, ntfy, Slack y Universal Clipboard.
- [x] Replantear entidades, operaciones, SDK, riesgos y recorrido básico.
- [x] Separar recomendaciones/defaults de decisiones confirmadas y ampliaciones.

## Diseño técnico previo a código

- [ ] Definir proveedor/contrato de identidad, vinculación de equipos y recuperación
  E2EE; login no concede claves por sí solo. No hacer login ni instalar por planificación.
- [x] Cerrar estados y contratos locales de catálogo, intents idempotentes, invitaciones,
  permisos históricos, cambios de audiencia, rotación, salida y eliminación.
- [x] Fijar retención/cuotas del servicio sintético, compatibilidad wire y conservación de manifests,
  claims, idempotencia y rangos de consulta histórica.
- [x] Precisar causalidad de forwarding: un salto firmado, rechazo de loops y ramas explícitas;
  límites asignados por host, privacidad de rutas y compatibilidad de clientes.
- [x] Especificar migración de ChannelPolicy a suscripción + conexiones y
  parámetros de destino de Action sin romper contratos/scopes existentes.
- [x] Precisar alcance general sin carpeta/Todo, dedupe de conexiones coincidentes,
  pausas de equipo/recurso por dirección, cola previa, in-flight y fences de reanudación.

## Implementación autorizada, en orden

Pedido vigente del 2026-10-02: implementación local y pruebas sintéticas.
Cada bloque usa contratos del anterior; cerrar los pendientes técnicos antes de
su implementación. Instalación, commit/push, deploy y datos reales mantienen
autorizaciones específicas.

- [x] Dominio/persistencia sintéticos de personas, recursos y dispositivos; acceso
  por defecto denegado, catálogo/CRUD e intents recuperables.
- [x] Vinculación sintética/invitación/rotación y tests de composición criptográfica.
  Cliente TLS explícito probado con otro provider global; provisioning del build
  normal comprobado desde comandos del host Settings sobre un fixture nuevo.
- [x] Conexiones y cursores separados de entrega/consulta histórica; migración de
  perfiles, dedupe, varios emisores y conflicto visible de destino receptor.
- [x] Conexión general, setting de alcance y pausas persistentes de envío/recepción
  en host/cola/SDK, con prueba de independencia, restart y ausencia de backfill.
- [x] Selector con creación diferida, carpeta conectada, administración, historial,
  envío explícito y permisos/estados reales; teclado y narrow picker.
- [x] Destino configurable de Action, catálogo/estado/historial SDK y forwarding acotado;
  regresiones de APIs y scripts existentes.
- [x] Aceptación integrada local con dos personas sintéticas, tres equipos y carreras
  de creación/acceso/historial/eliminación/loops; conservar evidencia nativa previa,
  sin presentarla como una nueva ejecución.
- [x] Build normal offline/locked y reinicio de dev aislada; walkthrough real desde
  All history y carpeta, envío aceptado, consulta sin efectos, guardado/dedupe y
  pausas independientes. Captura/updater apagados; instalada preservada.
- [ ] Aprobar y ejecutar servicio/deploy ya preparados; probar dos PCs y latencia
  real con alcance de datos explícito (R1/R2).

## Corte local implementado

Pedido del corte anterior: implementación local y pruebas sintéticas en Sol 6.1 high,
con cortes paralelos. Sin instalación, publicación, deploy ni datos reales.

- [x] Runtime: configuración durable opt-in, custodia privada, huella de provisioning
  local confirmada, cola cifrada, reintentos, recepción y reportes sobre C1/D1/T1.
- [x] Carpetas: ingreso local en carpeta exacta para creación/captura nueva y
  movimientos efectivos; activar no hace backfill, editar/tagear no publica,
  subcarpetas requieren regla propia y contenido remoto nunca se reenvía solo.
- [x] Actions/SDK: distinguir ítem activo de clipboard Windows; scopes por canal,
  texto generado/transformado y publicación seleccionada con cola administrada.
- [x] Nativo: snapshot cercado por sequence, writer con procedencia, pausa y
  generación revalidadas; recovery/deferred/self no escribe automáticamente.
- [x] UI: Sharing en Settings, reglas independientes, feed de recepciones,
  copia manual, errores/cola/pausa accesibles y selector de carpetas existente.
- [x] Validación: tests de integración HTTP/SQLite/cifrado y regresiones tags/
  carpetas/Actions, build, reload dev y prueba visual con datos sintéticos.
- [x] Cierre: documentar evidencia local y límites reales de enrollment remoto,
  dos PCs, servicio desplegado y automatización que aún no esté integrada.

Gates remotos separados de la implementación local:

- [ ] Configurar proveedor OAuth/OIDC real y verificar vínculo/recuperación allí;
  aceptación remota de invitaciones. Vínculo/recovery y revocación/rotación tienen
  implementación y evidencia local en I1–I8.
- [ ] Servicio privado desplegado con HTTPS/DNS y alcance/costos aprobados.
- [ ] Aceptación en dos PCs, latencia real, lock/suspend y crash nativo.
