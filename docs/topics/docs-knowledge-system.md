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
  - docs/TOPICS.md
  - docs/GLOSSARY.md
  - docs/skills/
  - docs/topics/omp-agentic-os.md
  - docs/topics/agent-tool-routing.md
  - scripts/context-index.ts
  - scripts/agent-context-audit.ts
---

# Sistema De Conocimiento Agentico

Copicu usa una capa AOS local mínima para conocimiento durable. La regla es leer poco, elegir bien el topic y abrir referencias profundas sólo cuando el trabajo lo necesita.

## Ruta Caliente

```text
docs/.generated/context-index.md -> docs/WORKING_MEMORY.md -> docs/TOPICS.md -> topic/track/spec puntual
```

`WORKING_MEMORY.md` es router operativo corto; tracks, topics, decisiones y specs
son las fuentes durables según el tipo de conocimiento. El índice se regenera con
`bun run context:index` y la auditoría con `bun run context:audit`.

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

No convertir ruta caliente, tracks activas o docs en transcript. Integrar,
indexar o archivar documentos preexistentes con destino claro. Para cambios de
la capa agentica, regenerar índice, auditar y revisar `git diff --check`.
