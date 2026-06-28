---
description: Auditar y reparar drift de la capa agentica local de Copicu
---
AOS realinear OS.

Usa `docs/topics/agentic-os-operations.md` y la skill local `aos-realinear-os`: audita y repara drift de la capa agentica local sin tocar producto, runtime, datos, deploy ni release salvo pedido explicito. Corregi links, comandos, frontmatter, prompts, skills, indice o audit cuando sea seguro; pregunta antes de borrar/mover memoria dudosa o cambiar convenciones principales. Al final corre `bun run context:index` y `bun run context:audit`, y reporta cambios, omitidos, pendientes y checks.
