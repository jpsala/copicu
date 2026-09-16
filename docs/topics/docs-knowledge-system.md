---
id: docs-knowledge-system
status: active
kind: how-to
triggers:
  - sistema agentico
  - aos
  - frontera aos omp
  - documentacion liviana
  - context index
  - working memory
  - track
  - persistencia
  - skills locales
  - context bloat
primary_refs:
  - AGENTS.md
  - docs/README.md
  - docs/WORKING_MEMORY.md
  - docs/GLOSSARY.md
  - docs/skills/
  - docs/topics/omp-agentic-os.md
  - docs/topics/agent-tool-routing.md
  - scripts/context.ts
  - scripts/lib/context-catalog.ts
  - scripts/lib/context-router.ts
  - scripts/agent-context-audit.ts
---

# Sistema De Conocimiento Agentico

Copicu usa una capa AOS local mínima para conocimiento durable. La regla es leer poco, elegir bien el topic y abrir referencias profundas sólo cuando el trabajo lo necesita.

## Ruta Caliente

```text
bun run context -- show -> docs/WORKING_MEMORY.md -> context -- topics -> topic/track/spec puntual
```

`WORKING_MEMORY.md` es router operativo corto; tracks, topics, decisiones y specs
son las fuentes durables según el tipo de conocimiento. El catálogo se consulta
en vivo con `bun run context -- show|topics|query`, sin escritura ni cache.

## Continuidad Durable

La continuidad vive en `WORKING_MEMORY.md`, topics, tracks, decisiones y specs. La conversación transitoria no reemplaza los docs, y la capa local no prescribe cómo OMP planifica, ejecuta, coordina agentes o gestiona sesiones.

El foco válido de `WORKING_MEMORY.md` declara exactamente un estado. `ready`
usa pares `Plan`/`Próximo batch`; `needs_planning`, `blocked`, `complete` y
`waiting_gate` usan `Siguiente acción` y, cuando corresponde, `Referencia`.

## Destinos

| Contenido | Destino |
| --- | --- |
| Regla crítica para todos | `AGENTS.md` |
| Estado vivo y próximo paso | `docs/WORKING_MEMORY.md` |
| Decisión durable | `docs/DECISIONS.md` |
| Conocimiento reusable | `docs/topics/<topic>.md` |
| Trabajo retomable | `docs/tracks/<track>.md` |
| Skill local portable | `docs/skills/<skill>/` |
| Contexto histórico grande | `docs/reference/` |

## Capacidades Locales

El built-in `computer`, el comando opt-in `.omp/commands/research.md` y las skills locales cubren la superficie project-local real. `computer` queda habilitado sólo por config agentic y no entra al producto. No se copian runtime, inventarios ni settings manager-only.

## Mantenimiento

No convertir ruta caliente, tracks activas o docs en transcript. Integrar o
archivar documentos preexistentes con destino claro. Para cambios de la capa
agentica, consultar el catálogo dinámico y auditar con `bun run context:audit`.
