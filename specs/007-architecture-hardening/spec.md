# Architecture Hardening

## Estado

Ready for orchestration. Esta spec existe para que una sesion nueva pueda ejecutar mejoras de arquitectura sin depender de memoria conversacional.

## Objetivo

Reducir deuda arquitectonica que ya empezo a afectar seguridad, mantenibilidad y delegabilidad del proyecto, manteniendo el comportamiento actual del clipboard manager.

## No Objetivos

- No reescribir la app.
- No cambiar el stack.
- No introducir marketplace o sandbox fuerte para scripts.
- No implementar FTS5 hasta que haya un gate de performance medido.
- No cambiar la UX principal salvo fixes directamente vinculados al hardening.

## Alcance

Incluye:

- boundaries de script host y capabilities;
- estabilidad de script runner;
- storage/blob safety;
- contratos compartidos entre Rust, frontend y scripts;
- refactors mecanicos para reducir archivos gigantes;
- bugs de arquitectura pequenos detectados durante la revision.

Excluye:

- nuevo diseno visual;
- nuevas features de CopyQ parity;
- migraciones grandes de UI;
- soporte macOS.

## Requisitos Funcionales

- AH-FR-001: `picker.open({ query })` y el evento `copicu://picker/filter` deben funcionar con diagnostics apagado.
- AH-FR-002: las capabilities de Tauri deben listar todas las ventanas/superficies usadas por el runtime vigente.
- AH-FR-003: cada metodo del script host debe declarar y validar sus capabilities requeridas antes de ejecutar efectos.
- AH-FR-004: un script Node colgado debe terminar por timeout y devolver un error redacted sin bloquear indefinidamente la app.
- AH-FR-005: al podar historial, los blobs y thumbnails asociados a filas eliminadas deben limpiarse o quedar reportados para GC.
- AH-FR-006: el vocabulario de script capabilities debe tener una fuente de verdad o un mecanismo de verificacion que impida drift.
- AH-FR-007: los refactors mecanicos no deben cambiar el contrato publico de comandos Tauri, DTOs o eventos.
- AH-FR-008: las pruebas y fixtures deben usar contenido sintetico, nunca clipboard real.
- AH-FR-009: cada fase debe poder verificarse con comandos concretos antes de pasar a la siguiente.

## Requisitos No Funcionales

- AH-NFR-001: mantener bajo consumo idle.
- AH-NFR-002: no aumentar superficies WebView activas sin justificacion.
- AH-NFR-003: preferir cambios pequenos revisables sobre refactors amplios.
- AH-NFR-004: mantener compatibilidad Windows-first.
- AH-NFR-005: no introducir dependencias nuevas salvo justificacion escrita.

## Historias De Usuario

### US1: Operador Retoma El Proyecto

Como operador del proyecto, quiero un plan ejecutable por fases para que una sesion nueva pueda continuar sin releer toda la historia.

Acceptance:

- La sesion nueva puede abrir un unico tracks y encontrar spec, plan, tasks y prompts.
- El primer paso recomendado es claro.

### US2: Usuario Ejecuta Scripts Con Limites Claros

Como usuario que usa scripts locales trusted, quiero que las capabilities declaradas sean respetadas por el host para evitar efectos accidentales.

Acceptance:

- Un script sin capability requerida falla antes del efecto.
- El error no incluye contenido sensible.
- Un script con capability correcta sigue funcionando.

### US3: Usuario Mantiene Historial Grande

Como usuario con historial grande, quiero que podar o buscar historial no degrade por leaks de blobs o lock contention evitable.

Acceptance:

- Prune no deja blobs obvios sin owner.
- Query de imagenes sigue devolviendo thumbnails.
- Tests cubren al menos un caso de cleanup sintetico.

### US4: Mantenedor Reduce Riesgo De Refactors

Como mantenedor, quiero archivos mas chicos y contratos compartidos para que cambios futuros sean revisables y delegables.

Acceptance:

- La separacion de modulos mantiene tests/build verdes.
- No se mezclan cambios mecanicos con cambios de comportamiento.

## Success Criteria

- SC-001: Fase 1 cierra con `npm run build` verde.
- SC-002: Script host tiene tests de allowed/denied para al menos tres metodos representativos.
- SC-003: Runner Node tiene timeout testeado o validado con script sintetico.
- SC-004: Storage tiene test de blob cleanup o GC para prune.
- SC-005: Ninguna fase requiere leer mas de tres documentos para retomarse.
- SC-006: El handoff queda actualizado despues de cada fase.

## Supuestos

- Los scripts locales siguen siendo trusted automation, no plugins de terceros.
- SQLite sigue siendo el storage principal.
- Windows sigue siendo la plataforma primaria.
- Las herramientas de subagentes pueden no estar disponibles en todas las sesiones; el plan debe funcionar igualmente.

## Riesgos

- Refactor de `storage.rs` puede mezclar comportamiento y mover bugs.
- Cambios de capabilities pueden romper scripts existentes si el mapping queda demasiado estricto.
- Timeout del runner puede matar scripts largos legitimos si el limite queda muy bajo.
- UI checks pueden fallar por infraestructura Vite/WebView; interpretar logs antes de revertir.
