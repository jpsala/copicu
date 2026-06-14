# Skills Locales

`docs/skills/` es la fuente canonica de las skills locales del repo.

## Regla

- No duplicar skills en dos carpetas reales.
- `.agents/skills` existe solo como compatibilidad tecnica y debe apuntar por junction a `docs/skills/`.
- Si se agrega o modifica una skill, editar `docs/skills/<nombre>/`.
- Si una skill es operativa del sistema, documentarla tambien en topics/working memory/decisions cuando cambie el comportamiento durable.

## Contenido Actual

- `impeccable/`: skill local para trabajo de UI/frontend.
- `speckit-*/`: skills locales del workflow SpecKit.
- `sigamos/`: continuar el trabajo activo en la misma sesion.
- `cerrar-sesion/`: cierre de valor sin transcript.
- `continuar-sesion/`: cierre de valor mas handoff compacto para sesion nueva.
- `continuar-sesion-con-gol/`: variante de continuidad que pide arrancar la proxima sesion con `gol`.
- `realinear-os/`: auditoria y reparacion de la capa agentica.

## Comandos Operativos

| Usuario dice | Skill | Efecto | No confundir con |
| --- | --- | --- | --- |
| `sigamos` | `sigamos` | Sigue en la misma sesion sin cierre, handoff ni thread nuevo. | `continuar sesion`, que corta contexto. |
| `cerrar sesion` | `cerrar-sesion` | Promueve valor durable a docs, regenera indice y corre audit. No crea transcript. | `continuar sesion`, que ademas prepara handoff. |
| `continuar sesion` | `continuar-sesion` | Hace cierre de valor y prepara handoff compacto para sesion nueva. | `continuar sesion con gol`, que pide arrancar la nueva sesion con `gol`. |
| `continuar sesion con gol` | `continuar-sesion-con-gol` | Cierre + handoff + instruccion explicita de arrancar con `gol`. | `sigamos`; no existe variante de `gol` para seguir en la misma sesion. |
| `continuar con gol` | `continuar-sesion-con-gol` | Alias de `continuar sesion con gol`. | `sigamos`. |
| `siguiente` | `continuar-sesion-con-gol` | Alias corto para cortar contexto y seguir el proximo lote con `gol`. | "hacer el siguiente paso" en la misma sesion. |
| `realinear os` | `realinear-os` | Audita y repara drift de la capa agentica sin tocar producto salvo pedido explicito. | Refactors de producto o arquitectura runtime. |

La fuente canonica del comportamiento esta en `docs/topics/docs-knowledge-system.md` y `docs/topics/agentic-os-operations.md`; las skills son wrappers cortos para discovery.

## Aliases Pi

Este repo tambien incluye prompt templates Pi en `.pi/prompts/` para invocacion comoda desde el editor:

| Prompt Pi | Expande a |
| --- | --- |
| `/sigamos` | `sigamos` |
| `/cerrar` | `cerrar sesion` |
| `/continuar` | `continuar sesion` |
| `/siguiente` | `continuar sesion con gol` |
| `/realinear` | `realinear os` |
| `/research <tema>` | research tecnico con `code_search`, `web_search`/`fetch_content` y `librarian` segun corresponda |

Estos prompts son conveniencia Pi, no reemplazan las skills portables ni los topics canonicos.

## Validacion

```powershell
powershell -ExecutionPolicy Bypass -File scripts/ensure-skills-link.ps1
python C:\dev\agent-infra\rules\skills\.system\skill-creator\scripts\quick_validate.py docs/skills/<nombre>
bun run context:index
bun run context:audit
```

## Mantenimiento

- Si una skill nueva usa metadata UI, crear o regenerar `agents/openai.yaml`.
- Si un doc humano apunta a `.agents/skills` como fuente de verdad, corregirlo a `docs/skills/`.
- Si Codex deja de descubrir skills, reparar primero la junction antes de tocar contenido.

## Aplicar En Otros Repos

- Copiar o fusionar `docs/skills/` como parte de OS Lite cuando el repo destino necesite slash commands locales.
- No copiar `.agents/skills` como carpeta real; recrearla en destino con `scripts/ensure-skills-link.ps1`.
- Mantener las skills hibridas: metadata y cuerpo corto en la skill, procedimiento durable en topics, scripts o docs canonicos del repo destino.
