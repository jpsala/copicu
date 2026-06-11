---
id: docs-knowledge-system
status: active
kind: how-to
triggers:
  - sistema agentico
  - os lite
  - documentacion liviana
  - context index
  - working memory
  - track
  - cerrar sesion
  - continuar sesion
  - goal
  - gol
  - continuar con goal
  - continuar sesion con goal
  - nueva sesion
  - handoff
primary_refs:
  - AGENTS.md
  - docs/README.md
  - docs/WORKING_MEMORY.md
  - docs/TOPICS.md
  - docs/GLOSSARY.md
  - docs/topics/agentic-os-operations.md
  - scripts/context-index.ts
  - scripts/agent-context-audit.ts
---

# Sistema De Conocimiento Agentico

Este repo usa una version local de Agentic Project OS Lite adaptada a Copicu. La regla principal es leer poco, elegir bien el topic y abrir referencias profundas solo cuando el trabajo lo necesite.

## Ruta Caliente

```text
AGENTS.md -> docs/.generated/context-index.md -> docs/WORKING_MEMORY.md -> docs/TOPICS.md -> topic/track/spec puntual
```

`docs/PROJECT.md`, `docs/ASSISTANT_RULES.md`, `docs/DEVELOPMENT.md`, specs completas y referencias historicas son fuentes profundas, no lectura inicial obligatoria.

## Convenciones Locales

- Los trabajos vivos usan `docs/tracks/`, no `docs/tasks/`.
- `docs/WORKING_MEMORY.md` es router operativo corto, no bitacora.
- `docs/TOPICS.md` indexa puntos de entrada reales; no debe duplicar todo el contenido.
- `docs/GLOSSARY.md` guarda aliases recurrentes.
- `docs/.generated/context-index.md` es cache generado por `bun run context:index`.
- `scripts/agent-context-audit.ts` debe avisar sobre drift barato de detectar.

## Cuando Se Descubre Algo

1. Regla critica para todos los agentes: promover a `AGENTS.md`.
2. Estado vivo o proximo paso: actualizar `docs/WORKING_MEMORY.md`.
3. Conocimiento reusable: guardar en `docs/topics/<topic>.md`.
4. Decision durable: registrar en `docs/DECISIONS.md`.
5. Trabajo retomable: actualizar `docs/tracks/`.
6. Contexto historico grande: mover a `docs/reference/`.

## Goal Y Memoria

Goal de Codex es control de ejecucion de la sesion, no memoria durable.

Usarlo para encerrar una tarea concreta hasta terminarla. Si durante el Goal aparece conocimiento durable, promoverlo al destino correcto: decision, topic, working memory, track o spec. No crear docs solo porque existio un Goal.

`continuar con goal` combina checkpoint y ejecucion: primero persiste el acuerdo durable como un cierre de valor liviano; despues inicia un Goal en la misma sesion para ejecutar el proximo paso.

`continuar sesion con goal` combina continuidad limpia y ejecucion enfocada: persiste el acuerdo durable, abre una sesion nueva con handoff compacto y pide que esa sesion cree un Goal para el proximo lote.

## Cierre Y Continuacion De Sesion

`cerrar sesion` y `continuar sesion` comparten un mismo cierre de valor:

1. extraer decisiones, cambios, checks, bloqueos, riesgos y proximo paso;
2. descartar transcript, intentos triviales, razonamiento intermedio y logs largos;
3. rutear cada memoria a su fuente correcta;
4. regenerar `docs/.generated/context-index.md`;
5. correr `bun run context:audit` cuando se toque esta capa agentica o haya riesgo de drift;
6. responder con sintesis compacta.

La diferencia:

- `cerrar sesion`: solo persiste valor y cierra.
- `continuar sesion`: persiste valor y abre una sesion nueva con handoff compacto cuando la herramienta existe; si no existe, devuelve un prompt pegable.
- `continuar con goal`: persiste valor y sigue en la misma sesion bajo un Goal de Codex.
- `continuar sesion con goal`: persiste valor, abre una sesion nueva y arranca el proximo lote bajo Goal en esa nueva sesion.

Regla clave: el handoff no es fuente de verdad. Debe apuntar a los docs actualizados y contener solo lo necesario para arrancar.

Formato recomendado:

```text
Continuar en <repo>. Leer primero <ruta liviana>.
Estado actual:
Fuentes actualizadas:
Decisiones tomadas:
Checks:
Worktree / riesgos:
No hacer:
Objetivo de la nueva sesion:
Primer paso:
```

## Auditoria

Si JP pide `realinear os`, abrir `docs/topics/agentic-os-operations.md` y limitar el cambio a la capa agentica salvo pedido explicito.
