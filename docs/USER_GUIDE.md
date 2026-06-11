# Guia De Usuario Del Sistema Agentico

Este repo usa una capa agentica liviana para que agentes puedan trabajar sin cargar toda la historia del proyecto.

No es una wiki completa ni un backlog historico. Su trabajo es que una sesion nueva pueda leer poco, entender el estado vivo, encontrar la fuente correcta y no repetir errores ya aprendidos.

## Como Se Usa

Podes pedir tareas normales sobre Copicu. El agente deberia leer primero `AGENTS.md`, el indice generado si existe, `WORKING_MEMORY.md` y `TOPICS.md`.

Tambien podes usar comandos conversacionales:

- `realinear os`: audita y repara drift de la capa agentica.
- `cerrar sesion`: persiste lo valioso de la sesion en docs vivos y deja el proyecto retomable.
- `continuar sesion`: hace el mismo cierre de valor y despues abre una sesion nueva con handoff compacto si la herramienta esta disponible; si no, deja un prompt pegable.
- `goal` / `gol`: encierra una tarea concreta en un Goal de Codex hasta completarla o dejar un bloqueo claro.
- `continuar con goal`: guarda el acuerdo durable como checkpoint liviano y despues sigue en la misma sesion con un Goal para ejecutar el proximo paso.
- `continuar sesion con goal`: guarda el acuerdo durable, abre una sesion nueva y arranca el proximo lote bajo Goal en esa nueva sesion.
- `crear spec`: usa `specs/` para una feature grande antes de implementar.

## Modelo Mental

- `AGENTS.md`: reglas minimas que todo agente debe obedecer.
- `docs/.generated/context-index.md`: cache rapido generado; no editar a mano.
- `docs/WORKING_MEMORY.md`: estado vivo y proximo paso probable.
- `docs/TOPICS.md`: router para elegir que abrir.
- `docs/GLOSSARY.md`: aliases y nombres cortos.
- `docs/topics/`: conocimiento reusable.
- `docs/tracks/`: trabajos vivos retomables.
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

`continuar con goal` sigue en esta misma sesion bajo Goal. `continuar sesion con goal` crea una sesion limpia y le pasa el proximo lote como Goal inicial para reducir context bloat.

## Verificacion

```powershell
bun run context:index
bun run context:audit
```

El audit no reemplaza el criterio humano, pero debe detectar drift repetible: docs grandes, topics sin indexar, tracks sin frontmatter, specs rotas e indice stale.

## Fuente De Verdad

Si esta guia se desincroniza, mandan en este orden: `AGENTS.md`, `docs/topics/agentic-os-operations.md`, `docs/WORKING_MEMORY.md`, `docs/DECISIONS.md`, `docs/TOPICS.md` y `docs/GLOSSARY.md`.
