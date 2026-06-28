---
name: aos-guardar-sesion
description: Persist the valuable durable parts of the current session into the right repo docs without opening a new session or changing the active goal. Use when JP says `guardar sesion`, `documentar sesion`, `aos-checkpoint`, or wants to make sure the session's value is preserved.
---

# Guardar Sesion

Guardar lo valioso de la sesion actual en docs vivos, sin transcript.

Fuente canonica: `docs/topics/docs-knowledge-system.md`, seccion `Guardar Sesion`.

## Flujo

1. Extraer solo valor durable: decisiones, estado vivo, archivos/cambios relevantes, checks, riesgos y proximo paso.
2. Rutear cada memoria al destino correcto: `AGENTS.md`, `docs/WORKING_MEMORY.md`, topic, track, spec o decision.
3. Mantener docs livianos: no transcript, no backlog historico, no logs largos.
4. Regenerar indice si cambian topics, tracks, specs, skills, aliases o prompts documentados.
5. Correr audit si se toco la capa agentica o hay riesgo de drift.
6. Responder con sintesis compacta y seguir disponible en la misma sesion.

## Aliases

- `aos-checkpoint`
- `persistir estado`
- `cerrar sesion` cuando JP solo quiere asegurar que quede documentado y terminar.

## No Hacer

- No abrir thread nuevo.
- No crear handoff; para eso usar `nueva sesion`.
- No pedir `gol`.
- No compactar salvo pedido explicito.
