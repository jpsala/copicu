# Guía De Usuario Del Sistema Agentico

Copicu conserva una capa AOS local de conocimiento durable sobre OMP. No copia runtime, registry, memoria ni gobierno de otro manager.

## Frontera

AOS mantiene `AGENTS.md`, el índice, `WORKING_MEMORY.md`, topics, tracks, specs, skills y gates locales. OMP gobierna modelos, effort, tools, browser, todos, agentes, planificación, paralelización, idioma, estilo y modos runtime.

`realinear os` audita esta capa contextual. `computer` es el built-in local para dogfood explícito: está fuera del runtime de producto, exige aviso antes de UI visible y mantiene aprobación para input. El oracle C0 parte de una app externa y escribe tras `Ctrl+Shift+.` sin enfocar Copicu manualmente.

## Modelo Mental

- `AGENTS.md`: reglas críticas y frontera.
- `docs/.generated/context-index.md`: índice generado.
- `docs/WORKING_MEMORY.md`: foco y estado vivo.
- `docs/TOPICS.md`: router humano.
- `docs/topics/`: conocimiento reusable.
- `docs/tracks/`: trabajo retomable.
- `docs/skills/`: skills locales portables.
- `docs/DECISIONS.md`: decisiones durables.
- `specs/`: features grandes.

La memoria principal son los docs versionados. La ruta caliente debe permanecer corta.

## Verificación

```powershell
bun run context:index
bun run context:audit
npm run skills:status
```

Installs, commit, push, deploy, producción, credenciales, datos privados y efectos externos conservan confirmación explícita.
