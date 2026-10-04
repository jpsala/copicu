---
title: "Clipboard compartido: arquitectura y spec"
status: active
summary: "Custodia desplegada y cliente v0.5.6 definitivo firmado/verificado. Publicación latest, updater e instalación pendientes; admisión existente conservada."
last_worked: "2026-10-04T02:53:23Z"
next: "Publicar v0.5.6 y comprobar updater/assets; después actualizar PCs y aceptar la notebook. Admisión pública y prueba física quedan separadas."
topics:
  - shared-clipboard
---

# Clipboard compartido: arquitectura y spec

## Estado actual

**Cierre de custodia (2026-10-03).** JP pidió terminar el flujo sin aprobación
para usarlo en la notebook. Reporta que Casa y Trabajo ya comparten y autentican;
la notebook muestra **Check approval**. Es un reporte humano, sin inspección de
versiones/perfiles ni nueva aceptación física. Un par de equipos ya vinculados
puede seguir funcionando con el flujo legado; ese uso no acredita custodia.
Al iniciar este cierre, latest es `v0.5.5`, source
`e19babfa299298d28ce18248d7a5fabee8f37f65`, y conserva aprobación. El servicio
publica `deviceApproval:true`, `recovery:true` y no anuncia `keyCustody`.
El servicio de custodia ya está desplegado: HTTPS/401, issuer conservado y
backup/restore real aislado comprobados. El cliente `v0.5.6` definitivo está
firmado/verificado y sus cinco casos shipping pasan; faltan publicación y updater.
Evidencia del cierre en
[aceptación de custodia](../../specs/016-shared-clipboard/custody-acceptance.md).

**Texto e imágenes (2026-10-02).** JP amplió Sharing a los tipos capturados por
Copicu y pospuso archivos. PNG cifrado, blobs/miniaturas, captura y envío desde
carpeta/clip activo/Windows, recepción y copia con alpha están implementados.
388 Rust (1 omitido), 48 Bun/480 assertions, 24 visuales y el round-trip nativo
sintético pasan. Frontend normal regenerado. `v0.5.4` fue publicada como normal/latest desde
`1fbbf2215f6cebb87e4ab4ea35c450b4528e7ced`, firma y recursos verificados; cinco casos
del payload exacto pasan con perfiles sintéticos. Updater/downloads remotos coinciden
y el mismo NSIS está instalado con EXE idéntico. Relay amplía límites, conserva
issuer/config y tiene backup consistente; HTTPS/info/401 verificados. Ambas PCs
deben actualizarse antes de enviar imágenes. [Contrato](../../specs/016-shared-clipboard/media-plan.md)
y [aceptación](../../specs/016-shared-clipboard/media-acceptance.md).
JP reportó entrega manual de texto en una dirección entre PCs y entendió el
traslado explícito de recepción desde All history. No acredita automatización,
ambos sentidos ni imágenes físicas.

**Revisión vigente: cuenta canónica y servicio interno (2026-10-02).**
JP definió Sharing para cualquier cuenta Google autenticada, PCs de la misma
cuenta al mismo nivel y sin aprobación/transferencia de claves entre equipos.
El único endpoint de producto es `https://sharing.jpsala.dev/`, interno; aparece
en diagnóstico de errores. La URL fija y el broker de admisión autenticada están
implementados/probados localmente, incluidos en las regresiones del corte de
imágenes; la URL fija está distribuida en v0.5.4. Dev conserva el perfil habitual
de Home, sin clonar identidad.
El servidor confirma Home activo; la captura con etiquetas sintéticas era otro
binario/perfil. JP eligió el 2026-10-03 claves gestionadas por el servicio,
aceptando que el operador puede descifrar. Reemplazo en implementación local:
cuenta canónica, PCs iguales, vault AES-GCM y paquetes HPKE firmados de custodia,
migración de claves existentes y UI sin aprobación/códigos. Pruebas Bun y UI
pasan. JP autorizó descargar las dependencias AES: seis paquetes descargados y
`Cargo.lock` actualizado. Frontend y binario debug con `shared-clipboard`
recompilados; dev arrancó en el perfil aislado habitual y JP confirmó «anduvo»
para ese arranque. La suite de la fuente candidata pasa: 392 Rust, 59 Bun/662
assertions y 32 visuales; incluye host/migración, anuncio de custodia firmado y
paquetes legados conservados. Cinco casos de UI/host Windows pasan con tres
perfiles nuevos; el payload definitivo y cinco casos shipping pasan. Publicación
y comprobación del updater siguen pendientes.
[Contrato nuevo](../../specs/016-shared-clipboard/service-key-custody.md).
[Operación y backup/restore](../../specs/016-shared-clipboard/custody-operations.md).
[Evidencia local y gate restante](../../specs/016-shared-clipboard/custody-acceptance.md).
[Contrato y tareas A1–A5](../../specs/016-shared-clipboard/identity-service-plan.md).

**Primer acceso I1–I8 distribuido en v0.5.3 (2026-10-02).**
Servicio OIDC/PKCE y cuenta privada; alta durable en navegador del sistema,
comparación/aprobación de equipos por huella y HPKE; nuevas claves para equipos
aprobados, retiro/revinculación y recovery E2EE con snapshot cifrado. UI normal
en Settings/selector, sin bundle como recorrido habitual. Conserva `liveOnly`,
outbox, leases, receipts, SSE y opt-ins separados. 382 Rust (1 benchmark omitido),
50 Bun, 26 visuales y cinco casos de UI/host Windows con tres perfiles nuevos
pasan. [Evidencia y límites](../../specs/016-shared-clipboard/identity-acceptance.md).

JP autorizó deploy/distribución para la otra PC y confirmó los tres gates de
Google/OAuth, DNS e imagen Bun. Google OIDC y HTTPS están activos en el VPS
existente con Traefik, `sharing.jpsala.dev` y Bun/SQLite, sin nueva suscripción.
Seis módulos en `/opt/copicu-sharing` coinciden con la fuente distribuida.
Health/info y certificado verificados; V1/V2 sin auth entregan 401. Backup
consistente y restauración aislada conservan issuer. La instancia activa mantiene
la lista inicial de JP. El corte de custodia elimina aprobación/recovery del
servicio y conserva la admisión OIDC/Google existente; no abre Audience general.
[Evidencia remota](../../specs/016-shared-clipboard/identity-acceptance.md#servicio-remoto-activo).

Cliente [v0.5.3](https://github.com/jpsala/copicu/releases/tag/v0.5.3)
publicado como normal/latest desde `780241184555d61549755e99d9637fecd5e2736a`; updater HTTP 200/version
`0.5.3` y tres assets coinciden por digest. CI de esa fuente SUCCESS. Payload
x64 GUI/firma verificados; el mismo NSIS está
instalado localmente con EXE idéntico y tres checks nativos que preservan TLS,
Settings y opt-ins. Otros procesos dev/sintéticos se conservaron. Los cinco
casos de identidad conservan alcance debug; falta tráfico físico sintético entre
dos PCs físicas. [Recibos del corte](../../specs/016-shared-clipboard/identity-acceptance.md#paquete-windows-v053).

**Producto local y SSE S1–S6 validados (2026-10-02).** Runtime, host Windows,
UI y SDK están conectados. Catálogo V2 por persona sintética, CRUD/intents
recuperables, invitaciones/HPKE, permisos históricos, revocación/rotación,
conexión desde carpeta o All history, scope general, pausas por dirección y
consulta histórica tienen evidencia local. Q1 `liveOnly` y Q3 espacios propios
por persona siguen vigentes; Q2 se amplió a texto e imágenes por pedido de JP.

El corte incluye destino por Action, estado local de cola/pausas e historial con
grants explícitos; recepción/forwarding limitados y escritor Windows cercado.
Los [controles de carpetas](../topics/shared-folder-controls.md) aportan árbol
reusable, creación por ruta al guardar y carpeta same/mixed en metadata/editor,
con tags individuales conservados. Helper nativos de fixtures quedan en examples
opt-in, fuera del NSIS. Un perfil sin configurar mantiene sharing apagado.

SSE mantiene catálogo/acceso aun con el picker oculto. HTTP confirma, eventos
durables avisan y pull reconcilia. Snapshot tardío de otra identidad/pausa se
rechaza; denied cierra el stream y revoca acceso sin fallback; unsupported
reconcilia a baja frecuencia. Library, selector y Settings actualizan sin perder
draft/selección/foco. Retiro conserva la conexión y copias locales y bloquea
controles del recurso. Los hints de publicaciones sólo despiertan sync V1:
no avanzan control water ni habilitan conexiones, imports, Windows o Actions.
Ticks, leases, receipts, opt-ins y fences se conservan.

**Distribuido en v0.5.2:** NSIS core `0.5.2` generado offline con frontend normal,
firma verificada y recursos/exe x64 comprobados. Su payload exacto pasa diez casos
de publicaciones y trece de lifecycle con perfiles nuevos; regresión amplia
379 Rust y 494 visuales aprobados. [Evidencia exacta](../../specs/016-shared-clipboard/local-acceptance.md#candidata-firmada-v052-rc1-2026-10-02).
JP autorizó publicar la RC con commit/push y actualizar la instalación local.
El mismo NSIS se instaló: exe `0.5.2`, hash idéntico al payload, diez casos IPC
de publicaciones y comprobación nativa breve del diálogo nuevo clip/árbol pasan.
[Evidencia instalada](../../specs/016-shared-clipboard/local-acceptance.md#smoke-instalado-v052-rc1-2026-10-02).
Los diez casos repiten la matriz del payload; no son casos nuevos adicionales.
[RC publicada](https://github.com/jpsala/copicu/releases/tag/v0.5.2-rc.1) a
`2026-10-02T20:16:29Z`, desde el tag/source inmutable
`b8d7d83bdc671f3ef0351b86cc2d3599f95d3481`; digests de los tres assets coinciden.
[Agentic Validation 37059318392](https://github.com/jpsala/copicu/actions/runs/37059318392)
SUCCESS para esa fuente, incluidos documentación y chunks.
JP pidió después que las otras PCs recibieran el update: se publicó
[v0.5.2 normal/latest](https://github.com/jpsala/copicu/releases/tag/v0.5.2) a
`2026-10-02T20:22:36Z`, desde el mismo commit, sin recompilar ni cambiar EXE/firma.
Sólo el manifest apunta al tag normal. El endpoint real `releases/latest` entrega
`0.5.2` y sus tres assets descargados coinciden; no acredita instalación en otra PC.
[Recibo de promoción y updater](../../specs/016-shared-clipboard/local-acceptance.md#release-normal-v052-2026-10-02).

## Continuación: Sharing entre PCs

JP informó que instaló `0.5.2` en otra PC y Settings muestra **Sharing is off** y
**Technical preparation for a local synthetic service**. Es un reporte de JP,
sin inspección remota del perfil. El código muestra ese estado cuando no hay
configuración; el flujo actual importa un bundle técnico para el servicio de
pruebas. La distribución del cliente no completa la vinculación humana.

Pedido actual de JP: abrir una nueva sesión y terminar lo que falta para compartir
entre sus PCs. Completar el servicio accesible por los equipos, vinculación y
recuperación, y una UI normal de primer acceso; validar envío/recepción con datos
sintéticos. Reusar runtime/SSE y preservar `liveOnly`, leases, receipts y opt-ins.
El pedido posterior «Dale, haz lo que haga falta, así yo lo puedo usar en la otra
PC» autoriza deploy, commit/push, distribución y actualización local actuales.
No transfiere permisos a otra sesión: los gates puntuales ya resueltos y su alcance
se conservan arriba.
I1–I8 tienen [contrato](../../specs/016-shared-clipboard/identity-service-plan.md),
[tareas](../../specs/016-shared-clipboard/tasks.md#continuacion-primer-acceso-entre-pcs-2026-10-02)
y aceptación local. R1 cerrado por deploy real; R2 sigue abierto por tráfico físico.

## Evidencia y recuperación mínima

| Corte | Evidencia comprobada | Fuente |
| --- | --- | --- |
| Primer acceso I1–I8 | OIDC sintético con crypto real; DPAPI/HPKE, vínculo/recovery, UI y restart; implementación de servicio sin deploy. | [Aceptación de identidad](../../specs/016-shared-clipboard/identity-acceptance.md) |
| Producto local | HTTP/SQLite/DPAPI/cifrado real; catálogo/acceso, carpetas, Actions, pausas e historial. | [Implementación local](../../specs/016-shared-clipboard/local-implementation.md#corte-de-producto-local-2026-10-02) |
| Instalada ↔ dev, anterior a SSE | 39 casos de host real y recorridos nativos de publicación, clipboard/Notepad y hotkeys; build release local y NSIS instalados. | [Aceptación instalada ↔ dev](../../specs/016-shared-clipboard/local-acceptance.md#resultado-y-niveles-de-evidencia) |
| SSE S1–S6 | 70 Rust sharing + 37 storage shared; 31 Bun/240 assertions; diez visuales; 13 lifecycle por modo, ocho superficies y diez publicaciones shipping; retiro nativo en Library/selector/Settings. | [Aceptación SSE](../../specs/016-shared-clipboard/local-acceptance.md#aceptacion-sse-local-2026-10-02) |

Los modos de denied repiten la misma matriz; no son 26 casos distintos.
Suites de cortes anteriores y repeticiones no se suman como aceptación nueva.
La evidencia propia de SSE no se presenta como una revisión independiente ni
aceptación remota. Los resultados actuales y comandos permanecen en sus dossiers.

Para retomar: estado de este track → [primer acceso/servicio](../../specs/016-shared-clipboard/identity-service-plan.md)
→ aceptación del caso y R1/R2. Para mantenimiento de SSE, consultar su
[contrato](../../specs/016-shared-clipboard/sse-sync-plan.md).
Abrir [spec](../../specs/016-shared-clipboard/spec.md) y
[plan](../../specs/016-shared-clipboard/plan.md) sólo para ampliar el contrato.
Conocimiento reusable: [Shared Clipboard](../topics/shared-clipboard.md),
[Actions](../topics/actions-and-scripting-api.md) y
[Windows Installer](../topics/windows-installer.md). Controles de carpetas:
[track 042](042-shared-folder-controls.md).

## Próximo paso y límites

1. Publicar el NSIS `v0.5.6` final verificado y comprobar latest, updater y assets
   contra los hashes/firma del artefacto. Cinco casos UI/host Windows,
   host/migración y regresiones pasan. El servicio ya está desplegado y su backup
   de custodia se restauró con el entrypoint real en aislamiento. Evidencia en
   [aceptación de custodia](../../specs/016-shared-clipboard/custody-acceptance.md).
2. Actualizar las PCs y completar R2/M7 con envío/recepción sintéticos en dos
   PCs físicas y streaming remoto; no inferir sus versiones de un tag público.
   Audience/admisión general queda fuera del corte de la notebook y conserva
   su gate separado. `v0.5.5` era latest al iniciar el cierre. En `v0.5.4` se
   cerraron firma, payload, relay, publicación/updater y actualización local. Evidencia en
   [aceptación de imágenes](../../specs/016-shared-clipboard/media-acceptance.md).
   Distribución `v0.5.3` normal/latest y actualización local cerradas: tag/source,
   assets/hash, firma, CI y tres checks nativos en
   [aceptación de identidad](../../specs/016-shared-clipboard/identity-acceptance.md#publicacion-normal-v053).
   Las versiones anteriores conservan sus tags y evidencia; no sumar sus casos.
3. No reducir polling/ticks sin medir idle/latencia y repetir regresiones de
   outbox, retención, leases, pausa y efectos. Lock/suspend/crash nativos siguen
   teniendo aceptación propia.

La implementación de custodia incluye `scripts/shared-clipboard/custody.mjs`,
`scripts/shared-clipboard/deploy/backup.mjs` y
`src-tauri/src/shared_clipboard/product_custody.rs`, además del contrato,
operación y aceptación enlazados arriba. El candidato excluye el WIP de
GPUI/CopyQ y `src-tauri/src/storage/search.rs`, conservado en el checkout primario.

Al retomar, verificar checkout/HEAD/WIP y archivos sin seguimiento contra la
fuente distribuida del tag; no atribuirle cambios posteriores. Revalidar executable,
PID/perfil/puerto/marker y opt-ins antes de operar instancias; los valores guardados
en la aceptación son referencias históricas. Conservar el perfil habitual;
no leer su historial como fixture ni cerrar procesos por nombre.

Tras visuales, generar frontend normal antes de compilar shipping: el harness
visual produce un dist con bridge de test. Usar sólo perfiles y datos sintéticos.
La supervisión del checkpoint anterior permanece `PAUSED`; no hay campaña ni
deadline histórico activo. Recursos anteriores `retained/external_terminal`
conservan ownership y no se consideran cerrados por este corte. Autorizaciones
anteriores no habilitan instalar, publicar, commit/push, deploy, dependencias,
recursos cloud, enrollment humano ni datos reales en una sesión nueva.

## Objetivo y decisiones de producto

Trabajo ↔ Casa: publicación intencional por hotkey/script; cada suscripción
configura recepción, guardado local y escritura opcional en Windows. Una conexión
explícita también puede publicar ingresos locales nuevos del scope general y
entradas efectivas por movimiento a una carpeta exacta emisora. Sin backfill al
conectar/reanudar y sin republicar origen remoto.
Canal, carpeta, publicación/receipt y clip deduplicado conservan identidades distintas.

Origen de las decisiones: Q1 `liveOnly` y Q2 texto plano confirmadas por JP el
2026-09-30; ampliación de carpetas/Actions el 2026-10-01; Q3 sustituida el
2026-10-02 por espacio propio por persona y selección/creación desde carpeta.
La conexión general y el scope cambiable en Settings fueron pedidos posteriores
del mismo día. Contrato en spec/plan; analogías en
[sharing-patterns.md](../../specs/016-shared-clipboard/sharing-patterns.md).
La ampliación posterior de JP conserva texto e imágenes, posponiendo archivos.
Backup, biblioteca mutable sincronizada y formatos arbitrarios quedan fuera del corte.

## Resultado N1-B/C en Windows Sandbox (2026-10-01)

N1-A/B/C: 15 Pure, 11 Clipboard y seis Custody pasan para matrices sintéticas del
harness; ambos guests propios se cerraron. Permisos acotados, aislamiento y repro
están en el [dossier N1](../../specs/016-shared-clipboard/n1-native-custody.md#ejecucion-sandbox-comprobada-2026-10-01).
La regla reusable es correlacionar el writer después de `CloseClipboard`, bajo
exclusión nueva con owner/marker/sequence estable; un fallo mantiene `Uncertain`
sin replay. No autentica apps hostiles del mismo usuario ni acredita por sí solo
writer shipping, E2EE, journal durable o dos PCs.

## Procedencia documental

Importado del principal el 2026-10-01; estado vigente compactado el 2026-10-02
contra specs y dossiers locales, conservando sus decisiones, evidencia y límites.
El [preflight](../../specs/016-shared-clipboard/research.md), N1 y la implementación
local conservan el origen de L1/D1/C1/T1. IDs de agentes, terminales y secuencias
de conversación no son autoridad de producto ni permisos transferibles.
