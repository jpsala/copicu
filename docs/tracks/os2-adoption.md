---
title: Adopción documental OS2 de Copicu
status: active
summary: Adaptación documental y tooling integrados selectivamente en main; validación local y dependencia compartida de skills separadas de aceptación en sesión nueva.
last_worked: "2026-10-01T13:42:23Z"
next: Reconciliar con el coordinador discovery compartido OS2 y registrar aceptación semántica cuando JP autorice una sesión nueva.
topics:
  - docs-knowledge-system
  - glossary
  - agentic-os-operations
  - os-quality
  - omp-agentic-os
  - local-codex-skills
---

## Objetivo y alcance vigente

Completar adopción OS2 local en C:/dev/copicu, con autorización de JP transmitida en el encargo a este chat Codex el 2026-10-01: integrar selectivamente documentación/tooling de la preparación, conservar WIP, contratos Tauri/clipboard y gates de instalación/publicación. Sin commit/push, instalación, producto, datos reales, nuevas sesiones, subdelegación ni escrituras en OS2/perfiles. El permiso actual sustituye el pendiente de integración de la preparación; no hereda sus modelos o autorizaciones históricas.

## Estado actual

- Principal main, HEAD bb3c20f17aac22d15a7a92c6d3e4f262cbe751c7; al iniciar tenía 23 entradas de status. Preparación en C:/Users/jpsal/orca/workspaces/copicu/os2-firstpass-20260930-copicu con mismo HEAD. Se preserva allí, sin modificar sus archivos ni procesos.
- Integración por archivo del delta documental/tooling cuyo destino seguía igual al baseline común, con comprobación inmediatamente antes de escribir. AGENTS, Working Memory, glosario y shared clipboard se reconciliaron por separado con el estado actual. No merge de ramas ni copia de snapshots sobre WIP.
- AGENTS y consumidores usan recuperación por intención, tracks/topics y harness disponible; sin foco global, Working Memory activa ni OMP/Pi obligatorio. Contratos de producto, datos privados, instalación/publicación y gates opcionales computer/AX/C0 conservados. Ninguna prueba documental inicia Tauri.
- Consultor local knowledge, validador docs:check, fixtures y job CI documental sustituyen context/audit AOS. CI conserva el job de chunks y firma; no corrida remota acreditada. Glosario canónico local y entrada desde AGENTS conectados al check portable, sin dependencia del checkout OS2 en CI.
- 45 tracks históricos preparados y el track 041 reciente usan null cuando falta hora UTC acreditada; procedencia/metadata legacy conservadas. Importar formato no se registra como avance de producto. Rename 039-release-0.5.0 a 039-release-0-5-0 conserva versión y evidencia; referencias reparadas en specs 014/015, sin cambiar contratos.
- Working Memory del baseline y principal actual, decisiones/preguntas y glosario legacy conservados con origen en [archivo histórico](../reference/os2-legacy/README.md). No nuevo registro global de decisiones ni pérdida de evidencia para hacer pasar checks.

## Recuperación demostrada y conocimiento preservado

El trabajo pertinente más reciente del principal es [clipboard compartido](041-shared-clipboard.md), con contrato y evidencia en [topic](../topics/shared-clipboard.md) y spec 016. La fuente registra Q1 liveOnly, Q2 texto plano, Q3 servicio privado; N1 sintético, C1/T1 y admisión D1 opt-in con 108 pruebas registradas. Shipping, enrollment/runtime/Actions/UI/watcher y dos PCs siguen pendientes. Esa evidencia de producto fue recuperada de las fuentes, no reejecutada ni validada nativamente en este corte. Próximo trabajo: pending/rejected/resolve, gaps/outbox D1 y enrollment/runtime según el alcance vigente.

La distinción reusable es que recibir/publicar en canal no equivale a copiar/pegar ni enfocar Windows, y backup no hereda replay/retención del canal. Ya estaba en el topic y se preservó sin duplicar diseño. Los cuerpos del topic y track actuales se conservan; autorizaciones/rondas narradas no habilitan ejecución al recuperarlos. La Working Memory del principal queda preservada byte a byte como fuente del delta.

## Comprobación de este corte

Primer check detectó serialización incorrecta del frontmatter de los dos documentos recientes; reparación acotada a YAML multilineal y delimitador, sin relajar validadores. Resultados propios finales:

- bun run check: 0 errores documentales, 2 avisos de tamaño (AGENTS y picker-interaction), 15 tests y 93 aserciones, 0 fallos. Incluye CLI aislado sin node_modules/harness y fixtures de glosario, YAML, UTC, rutas y discovery opcional. check:ci ejecuta exactamente ese check; no corrida de GitHub acreditada.
- Consultor canónico OS2 ejecutado desde Copicu: 86 documentos válidos (39 topics, 47 tracks). Nueve consultas JSON locales coinciden con el consultor canónico: check, clipboard compartido, CodeMirror, RPC, sidebar, Paste Queue, last, tracks active y topics.
- Checker canónico de glosario sobre C:/dev/copicu: código 0; enlace directo y entrada no vacía. El check local implementa ese contrato para CI sin checkout vecino, con regresión de enlaces falsos en ejemplos/comentarios. No prueba comprensión semántica.
- git diff --check: código 0. Hashes de 175 archivos protegidos sin diferencias: código/config y trabajo de producto, spec 016, scripts/tests relacionados, configuración OMP y firma. Versión, dependencias y comandos de producto de package.json preservados. HEAD y rama sin cambios.
- Working Memory actual y glosario original archivados byte a byte; cuerpos de shared clipboard topic/track preservados (sólo rótulo del detalle pendiente ajustado además de metadata/procedencia). Los checks no accedieron a clipboard, historial, blobs, SQLite real ni secretos.

Validación mecánica y revisión documental propia; no nueva auditoría exhaustiva de contratos contra producto ni aceptación humana. La conservación del WIP no significa que sus pruebas de producto se hayan reejecutado.

## Pendientes y límites

- [ ] Coordinador: reconciliar entrada compartida os2-guardar, os2-handoff, os2-orquestar y os2-modo. No aparecían en el chat de integración; las cuatro sí están expuestas en el catálogo del chat de revisión Git del 2026-10-01. No se crearon copias locales ni se modificaron perfiles; exposición no prueba ejecución, instalación en otros hosts ni aceptación humana.
- [ ] Aceptación semántica explícita de JP en sesión realmente nueva: recuperar intención/estado/próximo paso, distinguir OS2 del producto, Windows y OS histórico, e identificar límites de autorización. Este chat recuperó fuentes sin conversación anterior, pero recibió diagnóstico/kickoff; no se presenta como prueba ciega ni aceptación humana.
- [ ] CI remota no ejecutada. El corte inicial no autorizaba commits; el cierre Git posterior sí los autoriza y se registra abajo. Aceptación de producto y datos reales permanecen fuera de este trabajo documental.

No abrir sesiones de prueba ni operar producto para cerrar estos puntos. La continuidad manual usa [el contrato compartido](C:/dev/os2/docs/topics/session-continuity.md); las fuentes locales bastan para recuperar el trabajo si falta el consultor.

## Cierre Git local autorizado (2026-10-01)

El encargo de coordinación posterior autoriza revisar WIP y crear commits locales por conjunto, sin push, instalación, deploy, perfiles ni worktrees ajenos. Se conserva `active`: el mapa externo que relataba una pausa era histórico; no se cambia estado ni se asume aceptación nueva. El corte documental integrado se separa del candidato de producto shared clipboard, preservando su procedencia y los originales históricos. No se reejecutó una migración.

Checks propios de revisión: `bun run check` (15 tests, 93 aserciones, 0 errores y 2 avisos de tamaño) y whitespace pasan. Las cuatro skills compartidas están expuestas en este chat; no se ejecutaron ni se instalaron. Los checks de producto locales se informan por separado en el recibo Git; no acreditan dos PCs, runtime ni aceptación humana. CI remota y aceptación semántica explícita siguen pendientes. Los tres deltas de finales de línea en `storage/folders.rs`, `storage/folders_tests.rs` y `storage/search.rs` se preservan fuera del batch.

Los hashes, manifests exactos y exclusiones del corte quedan en `.tmp/sync-review-20261001/`, ignorado y removible; no es memoria canónica. Los commits son publicables sólo después de la revisión y autorización de coordinación.

## Referencias y procedencia

- Preparación original read-only: ruta anterior, docs/tracks/os2-adoption.md. Registraba 83 documentos y 14 tests locales; esos resultados son antecedentes, no los del principal actual.
- Fuentes compartidas leídas: C:/dev/os2/docs/topics/glossary.md, repository-network.md, os2-design.md (fundamentos, fronteras y adopción), session-continuity.md y docs/README.md; antecedente C:/dev/os2/docs/tracks/migrate-copicu-os2.md. OS2 pertenece a otro chat y no fue editado.
- Recibo temporal removible: C:/Users/jpsal/AppData/Local/Temp/copicu-os2-integration-20261001, con status inicial, plan de integración, hashes de 175 archivos protegidos y originales de los documentos WIP reconciliados. No es memoria canónica ni garantía de conservación; las fuentes históricas durables están en el repo.
