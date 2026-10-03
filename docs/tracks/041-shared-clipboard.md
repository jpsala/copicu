---
title: "Clipboard compartido: arquitectura y spec"
status: active
summary: "Cliente de primer acceso 0.5.3 firmado e instalado; VPS/Google preparados, activación puntual pendiente y aceptación física por hacer."
last_worked: "2026-10-03T00:20:00Z"
next: "Resolver confirmación puntual de Google/OAuth, DNS e imagen Bun; activar HTTPS preparado y probar dos PCs físicas con sintéticos."
topics:
  - shared-clipboard
---

# Clipboard compartido: arquitectura y spec

## Estado actual

**Primer acceso I1–I8 implementado y validado localmente (2026-10-02).**
Servicio OIDC/PKCE y cuenta privada; alta durable en navegador del sistema,
comparación/aprobación de equipos por huella y HPKE; nuevas claves para equipos
aprobados, retiro/revinculación y recovery E2EE con snapshot cifrado. UI normal
en Settings/selector, sin bundle como recorrido habitual. Conserva `liveOnly`,
outbox, leases, receipts, SSE y opt-ins separados. 382 Rust (1 benchmark omitido),
50 Bun, 26 visuales y cinco casos de UI/host Windows con tres perfiles nuevos
pasan. [Evidencia y límites](../../specs/016-shared-clipboard/identity-acceptance.md).

JP autorizó deploy/distribución para la otra PC el 2026-10-02. Se prepararon
Google OIDC y el VPS existente con Traefik, `sharing.jpsala.dev` y Bun/SQLite,
sin nueva suscripción. Se creó el proyecto Google y quedaron listos los
formularios de política de datos y DNS; el cliente OAuth/secret aún no existe.
Seis módulos/config Docker en `/opt/copicu-sharing` coinciden por hash y Compose
valida; no hay servicio iniciado ni DNS nuevo. Confirmación puntual pendiente
para términos/credenciales, registro A y pull de Bun oficial fijado por digest.
[Guía y artefactos](../../scripts/shared-clipboard/README.md).

Cliente `0.5.3` normal firmado y payload x64 GUI verificados; el mismo NSIS está
instalado localmente con EXE idéntico y tres checks nativos que preservan TLS,
Settings y opt-ins. Otros procesos dev/sintéticos se conservaron. Los cinco
casos de identidad siguen acreditados como debug; faltan Google/HTTPS real y
dos PCs físicas. [Recibos del corte](../../specs/016-shared-clipboard/identity-acceptance.md#paquete-windows-v053).

**Producto local y SSE S1–S6 validados (2026-10-02).** Runtime, host Windows,
UI y SDK están conectados. Catálogo V2 por persona sintética, CRUD/intents
recuperables, invitaciones/HPKE, permisos históricos, revocación/rotación,
conexión desde carpeta o All history, scope general, pausas por dirección y
consulta histórica tienen evidencia local. Q1 `liveOnly`, Q2 texto plano y Q3
espacios propios por persona siguen vigentes.

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
No transfiere permisos a otra sesión: las confirmaciones puntuales requeridas
por términos/credenciales/DNS e instalación de runtime se conservan arriba.
I1–I8 tienen [contrato](../../specs/016-shared-clipboard/identity-service-plan.md),
[tareas](../../specs/016-shared-clipboard/tasks.md#continuacion-primer-acceso-entre-pcs-2026-10-02)
y aceptación local. R1/R2 permanecen pendientes con gates externos explícitos.

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

1. Distribución v0.5.2 normal/latest y actualización local cerradas: tag/source, assets/hash,
   firma, CI y smoke acreditados en
   [aceptación local](../../specs/016-shared-clipboard/local-acceptance.md#release-normal-v052-2026-10-02).
   La RC conserva su tag y evidencia; sólo el release normal entra al endpoint latest.
2. Resolver la confirmación puntual pendiente, activar Google/OAuth y DNS,
   ejecutar el pull fijado y desplegar el servicio ya preparado. Verificar HTTPS,
   callback/admisión, SSE, restart y backup/rollback; completar R1 y la aceptación
   física de R2. El cliente `0.5.3` ya está firmado e instalado localmente;
   los fixtures no acreditan proveedor real ni dos PCs. En una sesión posterior,
   comprobar autorización actual antes de ejecutar esos efectos.
3. No reducir polling/ticks sin medir idle/latencia y repetir regresiones de
   outbox, retención, leases, pausa y efectos. Lock/suspend/crash nativos siguen
   teniendo aceptación propia.

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
