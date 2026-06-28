---
name: aos-checkpoint
description: "Legacy alias for `guardar sesion` - persist durable value from the current session into repo docs without opening a new session, handoff, gol, or compaction. Use when the user says `aos-checkpoint` or `persistí estado`."
---

# Checkpoint / Guardar Sesion

Alias legado de `guardar sesion`: persistir valor durable sin cortar momentum.

Fuente canonica: `docs/topics/docs-knowledge-system.md`, seccion `Guardar Sesion`.

## Flujo

1. Extraer solo valor durable de la sesion actual: decisiones, estado vivo, archivos/cambios relevantes, checks, riesgos y proximo paso.
2. Rutear cada memoria al destino correcto: `AGENTS.md`, `docs/WORKING_MEMORY.md`, topic, track, spec o decision.
3. Mantener los docs livianos: no transcript, no backlog historico, no logs largos.
4. Regenerar `docs/.generated/context-index.md` si cambian topics, tracks, specs, skills, aliases o prompts documentados.
5. Correr `bun run context:audit` si se toco la capa agentica o hay riesgo de drift.
6. Responder con sintesis compacta de lo persistido y seguir disponible en la misma sesion.

## Reglas

- Es `guardar sesion`, no una sesion nueva.
- La sesion sigue siendo la misma y el objetivo activo no cambia.
- Si no hay valor durable nuevo, decirlo claramente y no tocar docs por tocar.
- Si el usuario lo pide antes de `/compact`, persistir primero y recien despues sugerir o ejecutar la compactacion solicitada.

## No Hacer

- No abrir thread nuevo.
- No crear handoff ni prompt pegable.
- No pedir `gol`.
- No ejecutar `/compact` salvo pedido explicito del usuario.
- No convertir `docs/WORKING_MEMORY.md` ni tracks en transcript.
