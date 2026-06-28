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
  - docs/topics/pi-agentic-os.md
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
6. Adapter Pi (`.pi/prompts`, `.pi/extensions`, `docs/topics/pi-agentic-os.md`) alineado con comandos reales `aos-*`.
7. SpecKit y scripts de contexto presentes si aplican al repo.
8. `bun run context:index` y `bun run context:audit` ejecutan sin errores; warnings restantes son conocidos o tienen plan.
9. Respeto local: no borrar memoria dudosa ni reemplazar reglas locales por templates genericos.

## Flujo

1. Leer ruta liviana del repo.
2. Inventariar core docs, topics, tracks, specs, skills, `.agents`, `.pi` y scripts.
3. Corregir drift seguro: links, nombres de comandos, frontmatter, refs rotas, indice, junction de skills y docs obsoletos.
4. Preguntar antes de borrar/mover memoria potencialmente util o cambiar convenciones principales.
5. Regenerar indice y correr audit.
6. Reportar cambios, omitidos, pendientes y checks.

## Criterio De Exito

Una sesion nueva puede leer poco, encontrar el topic correcto, usar comandos reales, continuar un track y confiar en que el audit detecta drift barato recurrente.
