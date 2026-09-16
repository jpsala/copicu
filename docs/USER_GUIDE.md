# Guía De Usuario Del Sistema Agentico

Copicu conserva una capa AOS local de conocimiento durable sobre OMP. No copia runtime, registry, memoria ni gobierno de otro manager.

## Frontera

AOS mantiene `AGENTS.md`, `WORKING_MEMORY.md`, topics, tracks, specs, skills y gates locales; el contexto se consulta en vivo. OMP gobierna modelos, effort, tools, browser, todos, agentes, planificación, paralelización, idioma, estilo y modos runtime.

`realinear os` audita esta capa contextual. `computer` es el built-in local para dogfood explícito: está fuera del runtime de producto, exige aviso antes de UI visible y mantiene aprobación para input. El oracle C0 parte de una app externa y escribe tras `Ctrl+Shift+.` sin enfocar Copicu manualmente.

## Modelo Mental

- `bun run context -- show`: resumen fresco del catálogo; no existe un índice persistido.
- `docs/WORKING_MEMORY.md`: foco y estado vivo.
- `bun run context -- topics`: router dinámico de conocimiento.
- `docs/topics/`: conocimiento reusable.
- `docs/tracks/`: trabajo retomable.
- `docs/skills/`: skills locales portables.
- `docs/DECISIONS.md`: decisiones durables.
- `specs/`: features grandes.

La memoria principal son los docs versionados. La ruta caliente debe permanecer corta.

## Verificación

```powershell
bun run context -- show
bun run context:audit
npm run skills:status
```

Installs, commit, push, deploy, producción, credenciales, datos privados y efectos externos conservan confirmación explícita.
