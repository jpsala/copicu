# Guia De Usuario Del Sistema Agentico

Este repo usa una capa agentica liviana para que agentes puedan trabajar sin cargar toda la historia del proyecto.

No es una wiki completa ni un backlog historico. Su trabajo es que una sesion nueva pueda leer poco, entender el estado vivo, encontrar la fuente correcta y no repetir errores ya aprendidos.

## Como Se Usa

Podes pedir tareas normales sobre Copicu. El agente deberia leer primero `AGENTS.md`, el indice generado si existe, `WORKING_MEMORY.md` y `TOPICS.md`.

Tambien podes usar comandos conversacionales:

- `realinear os`: audita y repara drift de la capa agentica.
- `sigamos`: continua el trabajo activo en la misma sesion, sin cierre ni handoff.
- `cerrar sesion`: persiste lo valioso de la sesion en docs vivos y deja el proyecto retomable.
- `continuar sesion`: hace el mismo cierre de valor y despues abre una sesion nueva con handoff compacto si la herramienta esta disponible; si no, deja un prompt pegable.
- `continuar sesion con gol`: hace `continuar sesion` y ademas pide que el thread nuevo arranque con `gol` para el proximo lote acordado.
- `continuar con gol`: alias de `continuar sesion con gol`; no sigue en la misma sesion.
- `siguiente`: alias corto de `continuar sesion con gol`.
- `crear spec`: usa `specs/` para una feature grande antes de implementar.

## Modelo Mental

- `AGENTS.md`: reglas minimas que todo agente debe obedecer.
- `docs/.generated/context-index.md`: cache rapido generado; no editar a mano.
- `docs/WORKING_MEMORY.md`: estado vivo y proximo paso probable.
- `docs/TOPICS.md`: router para elegir que abrir.
- `docs/GLOSSARY.md`: aliases y nombres cortos.
- `docs/topics/`: conocimiento reusable.
- `docs/tracks/`: trabajos vivos retomables.
- `docs/skills/`: skills locales portables.
- `docs/DECISIONS.md`: decisiones durables.
- `specs/`: especificaciones de features grandes.
- `scripts/agent-context-audit.ts`: auditor automatico de la capa agentica.

## Que Mantener Liviano

La ruta caliente es:

```text
AGENTS.md -> context-index -> WORKING_MEMORY -> TOPICS -> topic/track/spec puntual
```

Si algo se vuelve largo, moverlo a un topic profundo, decision, `docs/tracks/` o referencia historica.

## Cerrar Y Continuar

`cerrar sesion` y `continuar sesion` no son comandos para guardar un transcript. Ambos sirven para no perder valor:

- decisiones;
- estado vivo;
- checks;
- bloqueos reproducibles;
- riesgos del worktree;
- proximo paso concreto.

La memoria principal queda en los docs del repo. El prompt de continuacion es solo un arranque barato para la proxima sesion.

`cerrar sesion` termina despues de actualizar docs y responder con sintesis. `continuar sesion` ademas crea un nuevo thread cuando Codex Desktop expone la herramienta correspondiente.

`continuar sesion con gol` crea una sesion limpia y pide arrancar con `gol` para el proximo lote. `continuar con gol` y `siguiente` significan lo mismo; no hay variante para seguir en la misma sesion.

## Verificacion

```powershell
powershell -ExecutionPolicy Bypass -File scripts/ensure-skills-link.ps1
bun run context:index
bun run context:audit
```

El audit no reemplaza el criterio humano, pero debe detectar drift repetible: docs grandes, topics sin indexar, tracks sin frontmatter, specs rotas e indice stale.

## Fuente De Verdad

Si esta guia se desincroniza, mandan en este orden: `AGENTS.md`, `docs/topics/agentic-os-operations.md`, `docs/WORKING_MEMORY.md`, `docs/DECISIONS.md`, `docs/TOPICS.md` y `docs/GLOSSARY.md`.
