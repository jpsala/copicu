# Documentacion Del Proyecto

Este directorio guarda el contexto estable y recuperable para trabajar el proyecto con agentes sin cargar informacion innecesaria.

## Regla De Lectura Liviana

Leer en capas:

```text
docs/.generated/context-index.md -> WORKING_MEMORY -> TOPICS -> topic/track/spec especifico -> referencia profunda -> codigo puntual
```

No abrir documentos largos si el topic de entrada alcanza para decidir.

## Lectura Principal

Para entender el estado actual sin inflar contexto:

1. `docs/.generated/context-index.md`: indice rapido generado, si existe.
2. `WORKING_MEMORY.md`: estado vivo, riesgos y siguiente paso probable.
3. `TOPICS.md`: router para elegir topic o track.
4. Topic, track o spec especifico.
5. Documentos raiz y referencias profundas solo bajo demanda.

`PROJECT.md`, `ASSISTANT_RULES.md`, `DEVELOPMENT.md`, specs completas y referencias largas son fuentes estables, no lectura obligatoria inicial.

## Documentacion De Usuario

- `../README.md`: entrada publica del proyecto.
- `user/README.md`: guia clara de que es Copicu, que hace y como se usa.
- `user/scripts.md`: guia exhaustiva de scripts, metadata, API host, capabilities y ejemplos.
- `USER_GUIDE.md`: guia breve para humanos sobre como usar la capa agentica.
- `OS_PLAYBOOK.md`: playbook humano para elegir entre checkpoint, continuidad, compaction, `/gol`, `/until-done`, dogfood y auditoria.

## Contexto Inicial

La discusion inicial sobre stack, producto, arquitectura, spikes, milestones y riesgos ya fue integrada en estos documentos. No debe quedar un archivo raiz paralelo como fuente de verdad.

Si aparece un documento preexistente nuevo, integrarlo en `docs/`, indexarlo en `TOPICS.md` o preguntar antes de eliminarlo.

## Organizacion

- `PROJECT.md`: identidad del proyecto.
- `ASSISTANT_RULES.md`: reglas para agentes.
- `DEVELOPMENT.md`: stack, persistencia y comandos.
- `DECISIONS.md`: decisiones y estado.
- `OPEN_QUESTIONS.md`: preguntas pendientes.
- `GLOSSARY.md`: aliases y definiciones recurrentes.
- `USER_GUIDE.md`: guia humana breve del sistema agentico.
- `OS_PLAYBOOK.md`: guia practica para usar comandos, flujos y automatizaciones del OS en Pi.
- `TOPICS.md` y `topics/`: conocimiento recuperable.
- `WORKING_MEMORY.md`: memoria operativa actual.
- `tracks/`: trabajos vivos retomables.
- `skills/`: skills locales portables; fuente canonica.
- `.agents/skills`: compatibilidad tecnica por junction hacia `docs/skills/`.
- `.generated/context-index.md`: cache generado; no editar a mano.

## Skills Locales

- `docs/skills/` es la fuente canonica de skills locales portables.
- `.agents/skills` es una junction de compatibilidad para descubrimiento de Codex.
- Si la junction falta o apunta mal, recrearla con `powershell -ExecutionPolicy Bypass -File scripts/ensure-skills-link.ps1`.

## Audit De Contexto

```powershell
powershell -ExecutionPolicy Bypass -File scripts/ensure-skills-link.ps1
bun run context:index
bun run context:audit
```
