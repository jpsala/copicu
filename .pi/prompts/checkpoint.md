---
description: Persistir valor durable sin cerrar ni cambiar de sesion
---
Checkpoint.

Usa la fuente canonica `docs/topics/docs-knowledge-system.md` y la skill local `checkpoint`: persiste solo el valor durable de la sesion actual sin cerrar la sesion, sin preparar handoff, sin abrir thread nuevo, sin pedir `gol` y sin compactar salvo pedido explicito.

Extrae decisiones, estado vivo, riesgos, archivos relevantes, checks/comandos utiles y proximo paso. Rutea cada cosa al destino correcto (`AGENTS.md`, `docs/WORKING_MEMORY.md`, topic, track, spec o decision), manteniendo los docs livianos y sin transcript. Regenera `docs/.generated/context-index.md` si cambian topics/tracks/skills/aliases y corre `bun run context:audit` si tocaste la capa agentica o hay riesgo de drift. Responde con sintesis compacta de que quedo persistido y como seguir.
