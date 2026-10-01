---
title: Sistema documental OS2 de Copicu
summary: Recuperación selectiva, fuentes de conocimiento y trabajo, guardado y handoff manual independientes del harness.
keywords:
  - sistema agentico
  - OS2
  - documentación liviana
  - recuperación selectiva
  - track
  - topic
  - persistencia
  - guardar sesión
  - handoff
  - working memory
  - context bloat
  - aos
  - frontera aos omp
  - context index
  - skills locales
---

# Sistema De Conocimiento

El núcleo local son documentos Markdown versionados. La razón de adoptar OS2 es recuperar lo pertinente y continuar con estado fiel sin una memoria global, catálogo obligatorio ni control plane de OMP/Pi.

## Recuperar Por Intención

1. Buscar nombres o metadata de `docs/tracks/` y `docs/topics/`, con `rg` acotado si hace falta. No cargar todo el catálogo.
2. Abrir el track elegido y sus secciones de objetivo, estado, pendientes y evidencia; seguir sólo las referencias necesarias.
3. Para conocimiento, abrir el topic y la sección pertinente. Una coincidencia, fecha, estado o autorización histórica no prueban vigencia ni conceden permisos.

El [mapa](../README.md) explica destinos y formatos. No usar mtime como último trabajo. Ante ambigüedad relevante, señalarla en lugar de inventar un estado o reconstruir conversación ausente.

## Una Fuente Por Propósito

| Contenido | Destino |
| --- | --- |
| Invariante crítica del repo | `AGENTS.md` |
| Objetivo, estado, próximo paso, pendientes y evidencia | Track pertinente |
| Conocimiento reusable, decisión con razones e incertidumbres del tema | Topic pertinente |
| Feature grande | Spec pertinente |
| Procedimiento repetible con utilidad real | Skill o guía existente |
| Evidencia histórica no operativa | `docs/reference/`, con procedencia y enlace desde su fuente |

No mantener foco en `WORKING_MEMORY.md`, decisiones en un registro global ni preguntas en un backlog global. Sus archivos de compatibilidad remiten a fuentes temáticas o al archivo histórico. No crear índices persistidos ni duplicar el estado en mapas.

La metadata OS2 orienta descubrimiento, no certifica verdad ni producto. Los tracks importados conservan metadata anterior, fecha y estado en el cuerpo y usan `last_worked: null` cuando la UTC histórica no está acreditada, según excepción aprobada por JP. No convertir `updated` de día a una hora inventada ni ocultar trabajo previo; importar no es avance nuevo. El último trabajo ordenable sólo considera fechas UTC conocidas.

## Guardar Y Preparar Un Handoff

- **Guardar sesión:** comparar conversación disponible y fuentes; actualizar sólo el delta durable, comprobarlo y rendir cuentas. Seguir en la misma sesión. Sin delta no escribir por ceremonia.
- **Handoff:** guardar primero y entregar un único kickoff copiable con repo/cwd, objetivo, fuentes mínimas, estado/evidencia, próximos pasos, incertidumbres, WIP y límites. No abrir otra sesión automáticamente ni crear un archivo de handoff durable por defecto.
- **Lanzamiento opcional:** sólo con autorización explícita posterior, revisión y confirmación del destino, mediante un adaptador disponible y autorizado. Si no puede comprobarse recepción o identidad, conservar el kickoff manual y declarar el límite. Preparar no instala, sincroniza, hace push ni cambia el origen.

El destino comprueba entorno y fuentes antes de editar. Una sesión nueva que comprende el trabajo es aceptación semántica distinta de revisar el kickoff desde el origen. Compactar con el harness no equivale a guardar ni asegura preservar decisiones.

## Harness Y Capacidades

OMP, Pi u otros harnesses no son requisitos del núcleo ni fuentes canónicas paralelas. Este documento no define modelo, effort, tools, browser, planificación o fallbacks. Skills locales en [su fuente portable](local-codex-skills.md); gates opcionales de `computer` en [seguridad de tools](agent-tool-routing.md).

## Consultor Y Comprobación Local

El parser/router AOS se retiró porque requería otra metadata, foco global y autoridad OMP. No hay compatibilidad dual ni comandos `context`, `focus`, `show`, scoring o selección automática. [knowledge.ts](../../scripts/knowledge.ts) adapta sólo el contrato OS2 de metadata: `tracks`, `topics`, `search`, `last`, `check`, `help` y `--json`. Corre desde el cwd de Copicu, sin otro checkout, red, modelos, índices ni escrituras. Con Bun ausente usar Markdown; no instalar para consultar. El CLI no sigue referencias ni lee cuerpo/private data como contexto inicial.

[docs-check.ts](../../scripts/docs-check.ts) conserva checks útiles: formatos, relaciones track→topic, rutas locales sin symlinks/junctions, destinos relativos simples, YAML/tipos/límites de skills y avisos de tamaño/specs. Discovery es opcional: si existe debe apuntar al canon, pero el check nunca lo crea, fusiona o repara. No exige `.omp/config.yml`, Pi, markers AOS o Working Memory. No valida URLs/anclas, procedencia de una fecha o veracidad semántica.

`bun run docs:check` consulta documentación; `check`/`check:ci` agregan `docs:test` con fixtures sintéticos temporales. CI ejecuta estos checks en un job separado sin npm dependencies de producto; el job/gate estricto de chunks permanece independiente. Tests y configuración CI no acreditan una corrida remota ni producto.

Los recursos `.omp/commands/` y skills portables ahora recuperan track/topic, no foco global. Research usa capacidades realmente disponibles, sin tools/modelos obligatorios. Release exige el pedido actual combinado de publicar e instalar y revisión del destino antes de efectos; commit/push tienen autorización propia. Leer un recurso, un `go` de migración o una autorización histórica nunca ejecuta esos efectos.

## Glosario y fuentes compartidas

El [glosario local](glossary.md) concentra vocabulario de producto y enlaza las convenciones de JP, sin duplicarlas. AGENTS pide su entrada breve. docs:check aplica localmente el contrato mecánico de glosario (metadata, sección no vacía y enlace directo), con fixtures; así CI no depende de C:/dev/os2. El checker canónico externo se usa para contraste durante la adopción, no para copiar procedimientos ni como dependencia de CI. No se validan definiciones o comprensión por fixtures.

Formato y convenciones transversales: [OS2](C:/dev/os2/docs/README.md), [guardar y handoff](C:/dev/os2/docs/topics/session-continuity.md). La recuperación manual local sigue disponible si la fuente compartida no está accesible; declarar ese límite. Las fuentes aportadas viven en [evidencia](../../evidencia/README.md), no se indexan ni se leen en bloque.

## Mantenimiento Y Límites

Actualizar fuentes existentes antes de crear otra. No guardar transcript, razonamiento intermedio, logs largos, clipboard real, secretos, bases locales ni rutas privadas innecesarias. Usar datos sintéticos y no copiar permisos de archivos históricos.

Comprobar lo cambiado: metadata aplicable, enlaces, whitespace y coherencia con lo acordado. Distinguir comprobación estructural, revisión semántica, continuidad humana y producto. Los pendientes de transición viven en [adopción OS2](../tracks/os2-adoption.md), no en una segunda memoria global.

## Referencias

- [Entrada](../../AGENTS.md), [mapa](../README.md), [realinear](agentic-os-operations.md) y [convención de tracks](../tracks/README.md).
- Procedencia de la adaptación: `C:/dev/os2/docs/README.md`, `C:/dev/os2/docs/topics/os2-design.md` y `C:/dev/os2/docs/topics/session-continuity.md`, consultados como fuentes de diseño, no dependencias para recuperar estos archivos.
