---
title: "Clipboard compartido: arquitectura y spec"
status: active
summary: "N1 sintético, C1/T1 y admisión D1 opt-in comprobados en el corte registrado; runtime, enrollment y dos PCs pendientes."
last_worked: null
next: "Completar pending/rejected/resolve, gaps/outbox D1 y enrollment/runtime según specs/016-shared-clipboard/local-implementation.md y el alcance vigente."
topics:
  - shared-clipboard
---

# Clipboard compartido: arquitectura y spec

## Estado actual

**Alcance confirmado:** Q1 `liveOnly`, Q2 texto plano y Q3 servicio privado. **N1-A/B/C completos para harness sintético:** 15 Pure, 11 Clipboard y 6 Custody pasan en Sandbox autorizado. JP aprobó los cinco cargo add con «avancemos»: C1/T1 y admisión D1 opt-in implementados, **108 pruebas pasan** (51 C1/L1, 34 D1, 23 relay). Interop HPKE/DPAPI/HTTP/Bun/SQLite/descifrado, receipts/historial/report/reopen reales con identidades sintéticas. Sin startup/Actions/UI/watcher shipping ni dos PCs; el producto completo sigue pendiente. Evidencia local y comandos en [local-implementation.md](../../specs/016-shared-clipboard/local-implementation.md).

## Leer para retomar

1. [`spec.md`](../../specs/016-shared-clipboard/spec.md): objetivo confirmado, escenarios, requisitos, scope y Q1–Q3.
2. [`plan.md`](../../specs/016-shared-clipboard/plan.md): arquitectura, contratos tentativos, modelos, seguridad, riesgos y gates.
3. [`research.md`](../../specs/016-shared-clipboard/research.md): preflight/candidatos, evidencia primaria y permiso concreto de L1.
4. Código o topics enlazados sólo según el corte. No releer conversación ni Infra completa.

## Objetivo y límite

Trabajo ↔ Casa: publicación intencional por hotkey/script a un canal; cada suscripción configura recepción, guardado local y escritura en Windows. Canal no equivale a carpeta; publicación/receipt no equivale a clip deduplicado. Backup y biblioteca sincronizada quedan relacionados pero fuera del primer corte.

## Alcance confirmado y gates pendientes

Confirmado por JP el 2026-09-30; fuente de contrato: spec §Decisiones de alcance confirmadas.

- Q1: `liveOnly`; recuperaciones visibles para copia manual, sin reemplazo automático de Windows al reconectar/reiniciar/reanudar.
- Q2: texto plano inicial; imágenes/HTML fuera del corte.
- Q3: servicio privado para los equipos de JP; sin cuentas/login de producto V1.

Q1–Q3 no se reabren por una lectura del draft anterior. Pendientes técnicos: suite/protocolo E2EE/custody/vinculación, dependencias autorizadas, disponibilidad/límites/costo del proveedor y snapshot/writer nativos fiables. El preset de canal, límites y protocolos propuestos no quedan aprobados por confirmar estas tres decisiones. No declarar listo para implementar antes de cerrar los gates y permisos del corte.

## Ronda de revisión autorizada

- Sesión nueva en el mismo checkout `C:/dev/copicu`; no worktrees nuevos, para conservar acceso a specs/docs todavía sin commit. Origen preservado.
- Coordinador: `openai-codex/gpt-6.1-sol xhigh`, heredado del origen. Dos workers: `openai-codex/gpt-6.1-sol medium`, pedido explícito de JP; no fallback ni cambio silencioso.
- Worker A, read-only: arquitectura/seguridad/relay, continuidad/idempotencia, cifrado/vinculación y complejidad del primer vertical. Hallazgos con fuente y contraejemplo, no aprobar la spec por autoridad.
- Worker B, read-only: clipboard nativo/Actions/dedupe y testabilidad. Identificar pruebas existentes reusables, matriz mínima de repros, gaps y qué no demuestra un mock.
- Único editor durable: coordinador (`spec.md`, `plan.md`, este track y router/memoria si cambia estado). Workers devuelven hallazgos por inbox; no editan producto/docs, no lanzan otros agentes ni tests con efectos sobre perfiles reales.
- Deadline: 15 minutos para ronda y contraste; como máximo una reparación documental acotada. No campañas/polling indefinidos ni declarar terminado un worker por silencio.
- Aceptación: revisar ambas entregas contra código y requisitos, contrastar contraejemplos, integrar sólo hallazgos reproducibles, ejecutar checks documentales propios y separar tests del autor, simulaciones de arquitectura y smoke real pendiente.
- Recursos: seleccionar una tab por agente y conservar identidad completa. Tras validar settlement, resolver ownership con `worker-release` según la guía efectiva; respetar `user_takeover/retained` si el host lo devuelve. No cerrar origen ni tabs ajenas, ni hacer cierre masivo.

## Resultado de la ronda (2026-09-30)

Run `run_b2282948eabc`, creado desde esta coordinadora. Inicio `21:08:24Z`, deadline `21:23:24Z`; settlements A `21:13:28Z`, B `21:13:54Z`; contraste/checks cerrados `21:22:47Z` (dentro de 15 minutos). Exactamente dos workers, sin subdelegación ni otra ronda. Único editor de este corte: coordinador.

- Coordinador: sesión `66119152-7aa4-405e-8091-ee0d21368894`, handle `term_990dcf0f-b924-4ed9-bbdd-777eb48880a2`, Sol6.1 **xhigh**.
- A: Task `task_a136c3d32e37`, Dispatch `ctx_56da5d7dccb2`, sesión `47a5a7e7-2d12-4689-94dc-b74a0c0c016a`, handle `term_cd986955-d366-44e1-a23b-f801096e3c9d`, Sol6.1 **medium**, outcome `succeeded` de revisión.
- B: Task `task_8818c66ba703`, Dispatch `ctx_67e5fe2bfb98`, sesión `82f6f42f-b153-4fd0-a990-b74a0c0c016b`, handle `term_8568706d-398f-4c97-ab92-18f38bb7ab69`, Sol6.1 **medium**, outcome `succeeded` de revisión.
- Provider/model efectivos en los tres: `openai-codex/gpt-6.1-sol`, corroborados por metadata y respuestas reales, no sólo argv. Workers con session-dir únicos fuera del repo, cwd `C:/dev/copicu`, TUI idle `satisfied:true` antes de `worker-start --terminal`. Workspace exacto `83fb5a15-297e-4563-884f-ac5f7a9a8670::C:/dev/copicu`.
- Deliveries `delivery_2e4276e2fb25` y `delivery_db514cb6bc3b` consumidas completas, IDs/outcomes validados antes de ack. `worker-release` aplicado a ambos: **retained / external_terminal / processAction:none / archive:null**. Orca 1.4.217 supervisó Task/Dispatch pero no adoptó ownership cerrable de las tabs custom; quedan externas, asentadas, sin nuevo trabajo autorizado. No afirmar cierre/archivo ni sustituirlo por `terminal close`. `worker-list --terminal-state reclaimable` vacío. Origen `term_e9b0d5f8-1dad-4b5b-8919-f29a0476d5db` y coordinadora preservados; no reenviar al origen.

### Hallazgos contrastados e integración

Son gaps del diseño o riesgos de reutilización, **no bugs de un producto shared existente**. Severidad condicionada a la implementación futura; no aceptación por votación.

| Hallazgo | Evidencia / contraejemplo comprobado por coordinador | Decisión documental |
| --- | --- | --- |
| A1, alta: objeto/cleanup no atómico con índice | Plan §3: upload antes de commit permite overwrite conflictivo por key mutable, o GC antes de finalización, en modelo sintético | Objeto/envelope inmutables, conflicto sin mutación y cleanup coordinado; evaluar store único para texto sin elegir proveedor |
| A2, media: reporte de efecto sin pendiente durable | Plan §4/6: crash después de outcome local y antes de report/ack | Pending/ack en attempt existente; retry metadata-only mismo ID, nunca reejecutar efecto |
| A3, media: key/fetch pendiente vs rechazo | Plan §4/6 + US5.4: P sin clave y Q válida; saltar P pierde recuperación, bloquear página frena Q | Registro durable por entrada, cursor transaccional y retry sin reclasificar como live |
| B1, gate ya reconocido: snapshot del atajo | `lib.rs:6839–6868`, `actions.rs:1402–1407`: active lee historial; read tardío puede obtener C en vez de B | Mantener diseño snapshot host-side/stale y exigir Windows real; no nuevo defecto |
| B2, detalle de integración | `actions.rs:511–600` procesa operaciones antes de status failed; `clipboard.rs:758–805` sólo hash/TTL. Modelo de retorno lento con sequence/generation nueva | Outcomes separados, admisión host-side de operaciones fallidas y matriz writeText/writeItem/pausa; writer/procedencia existentes en plan no equivalen a implementación |
| B3, detalle transaccional | `storage.rs:1687–1740,1866–1934` usa destino armado/bookkeeping y create fusiona metadata; `storage/folders.rs:164–194` delete puede mover a Root | Import dedicado, carpeta/policy en transacción, resultado según orden de commit; preservar semántica de delete local |
| B4, media: timeout del child no acota hostCall | `actions.rs:1830–1870`: gateway síncrono entre chequeos; modelo duración 10 con deadline 5 | HostCall con commit/admisión local acotados y red fuera; agregar aceptación de call bloqueado |

No se aceptaron como defectos nuevos la falta actual de librerías E2EE/HTTP, snapshots shared o el writer aún inexistente: son gates ya explícitos. La ronda no aprobó criptografía ni políticas por autoridad de los reviewers; la selección actual de Q1–Q3 proviene de JP, no de esos retornos. La matriz y 14 nombres de pruebas reutilizables están en plan §9; Node con host fake y helpers Rust no acreditan Windows/dos PCs ni exactamente una vez.

## Preflight técnico preparado

Preparación directa autorizada después de confirmar alcance, sin nuevos workers ni implementación. Fuentes/criterios/dossier en `research.md`:

- Candidato texto: Worker + DO SQLite con ciphertext/índice/idempotencia en una transacción; diferir R2/D1 si no hacen falta. Límite público de fila 2 MB y cálculo sintético de payload/header favorecen evaluar esta simplificación, no acreditan proveedor desplegado.
- HTTP: `reqwest 0.13.4`/TLS `rustls 0.23.40` + ring ya transitivos; falta declarar/revisar APIs/features directas con permiso. Evitar incorporar otro provider TLS por defaults.
- Crypto: candidatos RustCrypto/dalek/HPKE con fuentes primarias; HPKE README no declara auditoría pagada y cita revisión de 0.8, no certificación actual. Enrollment, versiones/MSRV/vectores y composición siguen abiertos; no instalar ni afirmar E2EE validado.
- DPAPI de usuario candidata, no isolation/anti-clone absoluto. Writer nuevo necesita HWND owner válido; cero/delayed rendering limitan lo que prueba sequence. Sources Microsoft y código local contrastados.
- Aritmética sintética: dos PCs en polling de 1 s continuo => 172.800 consultas/día; Free público 100.000 requests DO/día. Polling 2 s reduce requests pero puede superar SC-02 con RTT. Recomendar evaluar push/cursor, sin prometer costo/latencia reales.
- Preflight de L1: lógica/unit tests memoria, sin wiring runtime, Windows, perfiles ni deps nuevas; ejecución autorizada/completada en la sección siguiente. N1 nativo/custody, dominio/fake y transporte mantienen permisos/gates separados; comandos de instalación del dossier no ejecutados.
- Checks propios del preflight: audit 0 errores/3 warnings de tamaño ya presentes; router incluye research, diff/whitespace y 21 links locales en 7 archivos pasan; 21 FR/8 SC y Q1–Q3 confirmadas preservadas. Fuentes públicas/aritmética no cuentan como tests de producto, vectores criptográficos ni smoke nativo.

## Corte L1 completado (autorizado por JP)

- Fuentes: [modelo](../../src-tauri/src/shared_clipboard.rs), [tests](../../src-tauri/src/shared_clipboard/tests.rs); `lib.rs` sólo añade inclusión `cfg(test)`. Sin startup/watcher/shortcut/SDK/DB/UI ni dependencias nuevas. App instalada sin cambios; dev detenida y no relanzada por el wiring exclusivamente de tests.
- Invariants: fences por igualdad y cero indisponible; `u64` de canal; `liveOnly`; scope/generation; último sequence; claim único; guard final de recopia/expiry; pausa antes/después de comienzo y outcomes separados. Recuperación de claim sólo tras executor detenido, no por timeout; es modelo en memoria, no journal durable.
- Checks propios: **25 passed / 0 failed / 0 ignored / 261 filtered out** con cargo test offline/locked, filtro `shared_clipboard` y bootstrap Windows GNU del repo (PATH sin Miniconda y manifest common-controls v6, sólo en proceso hijo/target). Cargo check offline/locked y rustfmt focalizado pasan; Cargo.toml/lock intactos. Test exhaustivo de las seis permutaciones pausa/copia/final-check; sin Win32/threads reales ni prueba criptográfica. Audit documental: 0 errores/3 warnings ya presentes; router y 26 links locales/FR/SC/whitespace pasan.
- Trabajo directo sin nuevos workers. Evidencia/repro/límites en `research.md`; no hubo instalación, red de producto, perfiles, clipboard, app/dev, credenciales, release ni commit/push. No presentar estas pruebas de módulo como entrega remota o aceptación US/SC completa.

## Detalle del corte pendiente

[Implementación local](../../specs/016-shared-clipboard/local-implementation.md): completar pending/rejected/resolve y wrappers de gaps/outbox/retención D1, journal/ack ambiguo y guards reales; integrar enrollment durable y runtime/Actions/SDK/UI/watcher. Admisión autenticada/import-report y C1/T1 locales comprobados, sin servicio remoto. Cuenta/costo, deploy/DNS/enrollment real, dos PCs y datos laborales conservan permisos/gates específicos.

Continuidad del handoff: nueva coordinación en este checkout, sin agentes ni reutilización de Dispatches. Origen y recursos `retained/external_terminal` anteriores conservan ownership; no se operaron ni se consideran cerrados. Modelo/effort solicitado heredado: `openai-codex/gpt-6.1-sol xhigh`; configuración efectiva de esta sesión no verificable con metadata/herramientas expuestas, sin sustitución ni cambio solicitado al harness. No usar metadata de la ronda anterior como prueba de esta sesión ni inspeccionar historial privado/credenciales para suplirla.

### Resultado N1-A (autorizado por JP)

- Archivos/features y repro en el dossier: binario `required-features` opt-in, dispatch sin efecto por defecto, wrapper focalizado GNU y módulos clipboard/custody. Sin cambios a `lib.rs`, modelo/tests L1, Cargo.lock, AGENTS/evidencia, frontend, DB/SDK ni startup. No nuevas crates ni `cargo add`; sólo las tres features Windows delimitadas. Buffers propios con borrado volátil, binding protegido y límites explícitos, no aislamiento/anti-clone ni composición E2EE aprobada.
- Check y Build offline/locked pasan con Rust 1.89.0 Windows GNU en `target-codex-n1`, PATH/RUSTFLAGS sólo del proceso hijo y recurso common-controls v6. Pure enumera primero: **15 passed / 0 failed / 0 ignored / 25 filtered out**. Los 25 L1 se compilan por inclusión interna pero no se ejecutan por ese filtro. Native backend excluido con `cfg(not(test))`; tests de permisos/rutas, cero/fences/recopia/pausa, outcomes/correlación y binding/tamper usan fixtures públicos en memoria.
- Checks focalizados: rustfmt y parser PowerShell; audit **0 errores/3 warnings de tamaño preexistentes**; router correcto, 30 links locales/whitespace en 13 archivos y 21 FR/8 SC/Q1–Q3 comprobados. Metadata Cargo confirma `required-features`, las tres features exactas y ningún default nuevo; target ignorado y raíz de datos del harness inexistente. Nueve archivos protegidos intactos por hashes contra inicio de N1-A. Resultados de compilación/tests propios, **no smoke HWND/clipboard/DPAPI**, watcher shipping, journal durable, E2EE ni entrega remota.
- Sin app/dev/restart (no wiring runtime shipping), clipboard, HWND/Job helpers, DPAPI/random secretos, directorios de datos del harness, perfiles reales, red de producto, instalación, release, commit/push o terminales del origen. B/C compilados pero no ejecutados; no transformar sus 11/6 casos preparados en pruebas pasadas.

### Resultado N1-B/C en Windows Sandbox (2026-10-01)

- JP delegó orquestar la alternativa Sandbox y tomar las decisiones técnicas sin supervisión. Este encargo autoriza creación/cierre de los Sandbox propios, traslado del paquete mínimo y matrices B/C sintéticas; no instalación, configuración global, app/perfiles del host, cloud ni commit/push. Skill aplicada: OS2 `supervised-work`; dos scouts read-only del harness y CLI, sin subdelegación, modelo/effort heredados sin overrides ni metadata independiente para acreditar sus IDs. Único editor/ejecutor: coordinador. Una reparación nativa concreta, contrastada por el scout y probada en guest nuevo.
- Windows Pro build 26200, Sandbox habilitado, CLI `wsb 0.8.107.0`. Config explícita: red/clipboard redirection/vGPU/audio/video/impresoras desactivados; input de cuatro archivos mapeado read-only, hash del exe/wrapper validado en guest, sin adapter Up y rechazo de escritura comprobados. El runner reproduce el boundary de compilación `C:/dev/copicu` únicamente dentro del guest. Política `RemoteSigned` sólo en procesos guest, no global. Reports reciben exclusivamente PASS/resumen/estado públicos filtrados; directorio nuevo dedicado con permiso de escritura, sin blobs ni plaintext DPAPI. No lectura/backup/restauración del clipboard inicial ni del host.
- CLI calibrada con exit 0 y 73: el proceso `wsb` sale 0 en ambos; interpretar el campo JSON `ExitCode`. Usar `ExistingLogin` tras `connect`, nunca System para clipboard. [Runner guest](../../tests/manual/shared-clipboard-n1-sandbox-guest.ps1) limita cada matriz a 45 s y no repite un intento; ante watchdog no declara settlement y el coordinador debe cerrar su Sandbox.
- Custody: run `n1-sandbox-20261001T033401`, Sandbox `4fad8016-5e44-4e97-9b92-b89d1c72e04e`, **6 casos nativos pasan**. Clipboard reparado: run `n1-sandbox-20261001T033401-r1`, Sandbox `7ee2e8f6-6060-47e1-8f20-8182a45b6e38`, **11 casos nativos pasan**. Coordinador comprobó nombres/count/orden exactos, resumen de salida de helpers, marker de verificación, ausencia de procesos del harness y limpieza de directorios del run mediante invocación adicional Verify. Ambos guests cerrados por ID propio; `wsb list --raw` termina vacío. Reportes sintéticos locales ignorados bajo `.tmp/shared-clipboard-n1-sandbox/`; resultados/límites durables aquí y en dossier, sin dumps.
- Invariant reutilizable: establecer correlación **después de CloseClipboard**, reabrir bajo guard y validar owner propio, marker y sequence no cero estable; revalidar al cerrar. Fallo/reapertura/interferencia conserva `Uncertain`, sin replay ni cálculo `sequence + 1`. El harness exige ambos formatos para Applied. Owner/marker públicos no autentican una app hostil del mismo usuario. No cambio al writer shipping.
- Build offline/locked y **15 Pure pasan**, rustfmt focalizado/parser PowerShell/checks documentales comprobados. Cargo.toml/lock, lib.rs y L1 preservados por hashes; sin deps, dev/restart ni app porque este corte sólo afecta el harness opt-in. N1 acredita estas matrices sintéticas Windows/DPAPI; no watcher shipping, hotkey/paste, lock/suspend, journal durable, E2EE/anti-clone ni dos PCs/latencia remota.

### Corte anterior D1-A/B y wire (antes de la aprobación C1)

JP autorizó código/pruebas locales y decisiones técnicas para avanzar ausente; permiso específico de nuevas dependencias solicitado y aún pendiente. Dos workers existentes sin subdelegación: implementación D1-A/B (`storage/shared.rs` + inclusión cfg(test)), revisión C1 read-only; coordinador único editor de wire/docs e integrador. Modelo/effort heredados sin overrides; sin metadata adicional para acreditar IDs. Entregas delimitadas y una reparación con repro por entrega, sin nuevos agentes/destinos.

Resultado independiente final del coordinador: **57 passed / 0 failed**: 31 `shared_clipboard` (25 L1 y 6 wire; 287 filtered out) y 26 `storage::shared` (292 filtered out), filtros enumerados no vacíos, offline/locked con recurso GNU y flags exactos. Autor D1-B: sus 26 tests pasan; coordinador contrastó reparaciones y ejecutó ambos filtros. Tests reales SQLite en archivos de fixtures/reopen, no sólo mocks. Rustfmt de fuentes propias y links/whitespace/audit comprobados; detalles y regla de RUSTFLAGS en [dossier local](../../specs/016-shared-clipboard/local-implementation.md#resultado-local-comprobado-y-pendientes).

Precondiciones durables: página con generación original, recovery sólo tras executor detenido (booleano de fixture no demuestra Win32), u64 SQLite sin cast signed/float, outbox byte-inmutable/FIFO/estados finales, gap explícito incluso con canal vacío. Último ready elegible y high-water por sink; retry manual es nueva intención host-issued, sin reabrir automatismos. Import revalida TTL, no consume capture bookkeeping, failed/missingFolder durable sin reroute y receipt desacoplado de clip editable/borrable. Poda elimina ambos blobs, expira pendientes y conserva identidad/claims/reportes pendientes. Wire prueba framing/precisión/límites, **no cifra ni autentica**. SQL y módulos nuevos siguen cfg(test); no migrations/startup, app/dev ni perfiles reales. Función completa sin terminar: adapter autenticado, compacción/outbox-retención/ack ambiguo/import-report linkage/guards reales y C1/T1/UI shipping pendientes.

### Corte C1/T1 y admisión D1 comprobado (2026-10-01)

«Avancemos» resuelve el permiso concreto de los cinco cargo add del dossier. Feature opcional y 27 paquetes nuevos, versiones anteriores conservadas. Workers existentes con ownership separado, sin nuevos agentes/worktrees/subdelegación ni overrides: crypto/enrollment/custody y adapter D1; relay y cuotas. Coordinador contrasta fuentes, integra HTTP/SQLite/DPAPI/import/report/reopen y comprueba **108 casos distintos** (51 C1/L1 + 34 D1 + 23 relay), más 15 Pure N1 y regresiones default 31/26 sin contarlas nuevamente. Cargo check offline/locked all-targets default/ambos features, rustfmt focalizado, 51 links y audit 0 errores/3 warnings previos pasan. Detalles reutilizables, límites y repro en [dossier local](../../specs/016-shared-clipboard/local-implementation.md#c1t1-local-comprobado).

RuntimeStore sólo admite VerifiedText y revalida firma con grant actual, generación/cursor/TTL/replay en transacción; import-attempt-report atómicos, reports de metadata idempotentes después de reopen. Sus labels de delivery no prueban lease/elapsed ni conceden permiso nativo/Actions. Pendientes de integración explícitos en el dossier; sharing no se inicia en startup, sin app/dev, perfiles existentes ni clipboard del host. Fixtures/child propios cerrados y limpiados; no deploy, instalación de producto, enrollment humano, commit/push ni recursos remotos.

## Evidencia documental

- Revisión del código local de Actions, snapshots, escritura diferida, capture pipeline, dedupe/carpetas y dependencias declaradas; fuentes precisas en el plan.
- Infra consultada sólo mediante inventario/runbook local; disponibilidad, pricing y servicios vivos no verificados.
- Workers declararon lecturas/revisión de código y tests existentes, sin cambios ni ejecución de tests/simulaciones/app. Coordinador contrastó fuentes, nombres de tests y comandos de sus sesiones dedicadas; herramientas read-only y lifecycle, sin edit/write.
- Checks propios: modelos sintéticos efímeros de A1–A3/B1–B4 y contraste estático del código, **no tests del producto**. Matriz de aceptación futura en spec/plan; Windows real y dos PCs siguen pendientes.
- `bun run context:audit`: 0 errores; warnings actuales de tamaño AGENTS/filtering/picker. El warning AGENTS corresponde al WIP concurrente fuera de este corte, preservado junto a `evidencia/`; no atribuirlo a workers ni al baseline de dos warnings informado en preparación.
- Router `show/focus`, spec 016 y queries `clipboard compartido` / `backup cloud` resuelven; `git diff --check`, whitespace, links locales, 21 FR/8 SC/5 US y Q1–Q3 verificados. Diff de revisión documental preservado sin revertir WIP. Los límites sin builds/tests de esa ronda/preflight no incluyen el L1 posterior: sus checks reales de módulo están separados arriba. No app/dev/restart ni smoke remoto.

## Procedencia de importación OS2

Importado desde el principal el 2026-10-01 conservando su cuerpo y evidencia. last_worked es null porque no se acredita una hora UTC para su último avance de producto; esta adaptación de formato no es avance de producto. Rondas, modelos, ownership y autorizaciones narradas pertenecen a sus cortes; no son instrucciones ni permisos para la sesión que lo recupere.

```yaml
id: shared-clipboard
status: active
updated: 2026-10-01
```
