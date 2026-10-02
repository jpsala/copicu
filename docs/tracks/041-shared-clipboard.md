---
title: "Clipboard compartido: arquitectura y spec"
status: active
summary: "NSIS v0.5.2-rc.1 firmado e instalado, payload coincidente y smoke local comprobados; publicación y CI pendientes."
last_worked: "2026-10-02T20:05:50Z"
next: "Completar publicación RC autorizada y verificar GitHub/CI. Servicio remoto, identidad humana y dos PCs conservan gates separados."
topics:
  - shared-clipboard
---

# Clipboard compartido: arquitectura y spec

## Estado actual

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

**Candidata v0.5.2-rc.1:** NSIS core `0.5.2` generado offline con frontend normal,
firma verificada y recursos/exe x64 comprobados. Su payload exacto pasa diez casos
de publicaciones y trece de lifecycle con perfiles nuevos; regresión amplia
379 Rust y 494 visuales aprobados. [Evidencia exacta](../../specs/016-shared-clipboard/local-acceptance.md#candidata-firmada-v052-rc1-2026-10-02).
JP autorizó publicar la RC con commit/push y actualizar la instalación local.
El mismo NSIS se instaló: exe `0.5.2`, hash idéntico al payload, diez casos IPC
de publicaciones y comprobación nativa breve del diálogo nuevo clip/árbol pasan.
[Evidencia instalada](../../specs/016-shared-clipboard/local-acceptance.md#smoke-instalado-v052-rc1-2026-10-02).
Los diez casos repiten la matriz del payload; no son casos nuevos adicionales.
Publicación GitHub y CI del cierre todavía no están acreditadas.

## Evidencia y recuperación mínima

| Corte | Evidencia comprobada | Fuente |
| --- | --- | --- |
| Producto local | HTTP/SQLite/DPAPI/cifrado real; catálogo/acceso, carpetas, Actions, pausas e historial. | [Implementación local](../../specs/016-shared-clipboard/local-implementation.md#corte-de-producto-local-2026-10-02) |
| Instalada ↔ dev, anterior a SSE | 39 casos de host real y recorridos nativos de publicación, clipboard/Notepad y hotkeys; build release local y NSIS instalados. | [Aceptación instalada ↔ dev](../../specs/016-shared-clipboard/local-acceptance.md#resultado-y-niveles-de-evidencia) |
| SSE S1–S6 | 70 Rust sharing + 37 storage shared; 31 Bun/240 assertions; diez visuales; 13 lifecycle por modo, ocho superficies y diez publicaciones shipping; retiro nativo en Library/selector/Settings. | [Aceptación SSE](../../specs/016-shared-clipboard/local-acceptance.md#aceptacion-sse-local-2026-10-02) |

Los modos de denied repiten la misma matriz; no son 26 casos distintos.
Suites de cortes anteriores y repeticiones no se suman como aceptación nueva.
La evidencia propia de SSE no se presenta como una revisión independiente ni
aceptación remota. Los resultados actuales y comandos permanecen en sus dossiers.

Para retomar: estado de este track → [contrato SSE](../../specs/016-shared-clipboard/sse-sync-plan.md)
→ [tareas S1–S6 cerradas](../../specs/016-shared-clipboard/tasks.md#continuacion-sincronizacion-sse-2026-10-02)
→ aceptación del caso. Abrir [spec](../../specs/016-shared-clipboard/spec.md) y
[plan](../../specs/016-shared-clipboard/plan.md) sólo para ampliar el contrato.
Conocimiento reusable: [Shared Clipboard](../topics/shared-clipboard.md),
[Actions](../topics/actions-and-scripting-api.md) y
[Windows Installer](../topics/windows-installer.md). Controles de carpetas:
[track 042](042-shared-folder-controls.md).

## Próximo paso y límites

1. Integrar y distribuir el NSIS revisado conforme al pedido vigente, comprobar
   commit/tag/assets/hash/CI y conservar stable/latest v0.5.1 al publicar RC.
   La actualización local está comprobada por hash/payload y smoke sintético;
   no sustituye los checks remotos de distribución.
2. Servicio remoto revisable, HTTPS/proxy, proveedor humano, vinculación/recovery
   E2EE y aceptación en dos PCs siguen abiertos. El provisioning sintético y dos
   procesos en una PC no los acreditan.
3. No reducir polling/ticks sin medir idle/latencia y repetir regresiones de
   outbox, retención, leases, pausa y efectos. Lock/suspend/crash nativos siguen
   teniendo aceptación propia.

Al retomar, verificar checkout/HEAD/WIP y archivos sin seguimiento: un worktree
nuevo puede omitir esta implementación sin commit. Revalidar executable,
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
