---
name: checkpoint
description: Persist durable value from the current session into the repo docs without ending the session, preparing a handoff, starting a new thread, asking for gol, or compacting context. Use when the user says `checkpoint`, `persistí estado`, or asks to save valuable context before continuing.
---

# Checkpoint

Persistir valor durable sin cortar momentum.

Fuente canonica: `docs/topics/docs-knowledge-system.md`, seccion `Checkpoint De Valor`.

## Flujo

1. Extraer solo valor durable de la sesion actual: decisiones, estado vivo, archivos/cambios relevantes, checks, riesgos y proximo paso.
2. Rutear cada memoria al destino correcto: `AGENTS.md`, `docs/WORKING_MEMORY.md`, topic, track, spec o decision.
3. Mantener los docs livianos: no transcript, no backlog historico, no logs largos.
4. Regenerar `docs/.generated/context-index.md` si cambian topics, tracks, specs, skills, aliases o prompts documentados.
5. Correr `bun run context:audit` si se toco la capa agentica o hay riesgo de drift.
6. Responder con sintesis compacta de lo persistido y seguir disponible en la misma sesion.

## Reglas

- Es un checkpoint, no un cierre.
- La sesion sigue siendo la misma y el objetivo activo no cambia.
- Si no hay valor durable nuevo, decirlo claramente y no tocar docs por tocar.
- Si el usuario lo pide antes de `/compact`, persistir primero y recien despues sugerir o ejecutar la compactacion solicitada.

## No Hacer

- No abrir thread nuevo.
- No crear handoff ni prompt pegable.
- No pedir `gol`.
- No ejecutar `/compact` salvo pedido explicito del usuario.
- No convertir `docs/WORKING_MEMORY.md` ni tracks en transcript.
