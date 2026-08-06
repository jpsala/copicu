---
id: os-quality
status: active
kind: how-to
triggers:
  - perfect os
  - proyecto perfecto
  - dejar en condiciones
  - calidad agentica
  - optimizar contexto
  - docs livianos
  - docs indexados
  - comandos os
primary_refs:
  - docs/topics/agentic-os-operations.md
  - docs/topics/docs-knowledge-system.md
  - docs/topics/omp-agentic-os.md
  - docs/topics/local-codex-skills.md
  - scripts/agent-context-audit.ts
  - scripts/context-index.ts
---

# Calidad Agentica / Perfect OS

Usar este topic cuando JP pida dejar el sistema agentico de Copicu en condiciones optimas para agentes.

Alcance por defecto: solo capa agentica local. No tocar producto, runtime, datos, deploy, releases ni arquitectura de app salvo pedido explicito.

## Checklist

1. Ruta caliente (`AGENTS.md`, `docs/.generated/context-index.md`, `docs/WORKING_MEMORY.md`, `docs/TOPICS.md`) corta, vigente y sin transcript.
2. Docs utiles indexados desde topic, router, track, spec, README o indice generado.
3. Topics activos como routers; detalle historico o profundo en `docs/reference/`, specs o tracks archivadas.
4. Tracks con frontmatter/estado claro, next step y refs existentes.
5. Skills en `docs/skills/`; `.agents/skills` como junction/toggle, nunca duplicacion real.
6. Capa OMP sin runtime lifecycle ni wrappers; `.omp/config.yml` sólo habilita capacidades nativas requeridas y preserva gates.
7. SpecKit y scripts de contexto presentes si aplican al repo.
8. `bun run context:index` y `bun run context:audit` ejecutan sin errores; warnings restantes son conocidos o tienen plan.
9. Respeto local: no borrar memoria dudosa ni reemplazar reglas locales por templates genericos.

## Flujo

1. Leer ruta liviana del repo.
2. Inventariar core docs, topics, tracks, specs, skills, `.agents`, `.omp` y scripts.
3. Corregir drift seguro: links, intención/routing, frontmatter, refs rotas, índice, junction de skills y docs obsoletos.
4. Preguntar antes de borrar/mover memoria potencialmente util o cambiar convenciones principales.
5. Regenerar indice y correr audit.
6. Reportar cambios, omitidos, pendientes y checks.

## Criterio De Exito

Una sesión puede leer poco, encontrar el topic correcto, usar intención/tools nativas, continuar un track y confiar en que el audit detecta drift barato recurrente.
