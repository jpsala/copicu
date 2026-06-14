---
id: local-codex-skills
status: reference
kind: decision-map
triggers:
  - skills locales
  - local skills
  - slash commands
  - docs/skills
  - .agents/skills
  - sigamos
  - checkpoint
  - persistir estado
  - cerrar sesion
  - continuar sesion
  - continuar sesion con gol
  - continuar con gol
  - siguiente
  - realinear os
  - evaluar skills
  - pasar a skills
  - promover a skill
  - hacer commits
  - push
  - publicar cambios
  - repo commit push
  - skill o topic
  - metadata minima
  - modelo hibrido
primary_refs:
  - docs/skills/README.md
  - docs/skills/
  - AGENTS.md
  - docs/WORKING_MEMORY.md
  - scripts/ensure-skills-link.ps1
  - scripts/agent-context-audit.ts
---

# Skills Locales De Codex

## Uso

Abrir este topic solo cuando el usuario pregunte por skills locales, slash commands, metadata, discovery, costo de tokens, o cuando haya que crear o revisar una skill.

No abrirlo durante trabajo normal del repo ni durante `cerrar sesion`/`continuar sesion` salvo que el problema involucre skills.

## Regla Canonica

`docs/skills/` es la fuente de verdad de las skills locales del repo.

`.agents/skills` existe solo como compatibilidad tecnica y debe apuntar por junction o symlink a `docs/skills/`.

No duplicar la misma skill en dos carpetas reales.

## Skill, Topic O Regla Activa

| Tipo | Usar cuando | Costo | Ejemplo |
| --- | --- | --- | --- |
| Regla activa | Debe condicionar todo trabajo y no es un comando. | Alto pero necesario. | No revertir cambios de usuario sin pedido explicito. |
| Topic | Es conocimiento recuperable, criterio o explicacion. | Bajo demanda. | Como decidir donde poner memoria durable. |
| Skill | Es una accion invocable, repetible y estable. | Metadata siempre descubierta. | `cerrar sesion`, `realinear os`. |
| Skill hibrida | Se quiere discovery por nombre, pero la logica vive en docs/topics/scripts. | Metadata chica + referencia externa. | `regenerar-contexto`. |

Una instruccion activa puede funcionar como skill si tiene forma de accion. No conviene convertir reglas globales de trabajo o lectura en skills solo para nombrarlas.

## Modelo Hibrido

1. La skill existe para hacer descubrible el comando.
2. El `SKILL.md` se mantiene corto.
3. La logica durable vive en `AGENTS.md`, topic, track, spec o script.
4. La skill apunta a la fuente canonica y no duplica procedimiento largo.
5. Si cambia la logica, se actualiza la fuente canonica y se revisa si la skill sigue apuntando bien.

### Metadata Minima

Una skill con metadata minima es aceptable cuando:

- el nombre del comando ya es claro;
- el comportamiento canonico vive en un topic o script;
- el objetivo principal es que Codex descubra el comando;
- repetir el procedimiento dentro del `SKILL.md` aumentaria drift.

No usar metadata minima cuando el comando es riesgoso, tiene muchos pasos fragiles o requiere validacion precisa. En esos casos el `SKILL.md` debe tener guardrails suficientes o delegar a un script.

## Criterio De Promocion

Antes de crear una skill nueva, responder:

1. El usuario podria invocarlo por nombre?
2. Es una accion repetible, no solo una politica?
3. Tiene triggers claros?
4. Su logica puede vivir en una fuente canonica sin duplicarse?
5. El costo de metadata se justifica por discovery?

Si la respuesta fuerte es "si" en 3 o mas puntos, crear skill. Si no, dejarlo como topic, regla activa o track.

## Auditoria De Candidatos

Cuando JP pida revisar que del sistema agentico se puede pasar a skills:

1. Usar la skill `evaluar-skills`.
2. Leer ruta liviana: indice, working memory y topics.
3. Buscar candidatos en `AGENTS.md`, `docs/TOPICS.md`, `docs/topics/`, `docs/tracks/` y `docs/skills/README.md`.
4. Proponer shortlist con recomendacion: `skill`, `skill hibrida`, `topic`, `regla activa`, `track` o `no promover`.
5. Implementar solo despues de confirmar o si JP pide "hacelo".

## Comandos Cubiertos

| Comando conversacional | Skill | Fuente canonica | Resultado esperado |
| --- | --- | --- | --- |
| `sigamos` | `docs/skills/sigamos/` | `AGENTS.md`, `docs/topics/docs-knowledge-system.md` | Continuar en la misma sesion sin cierre ni handoff. |
| `checkpoint` / `persistir estado` | `docs/skills/checkpoint/` | `docs/topics/docs-knowledge-system.md` | Persistir valor durable sin cerrar, handoff, thread nuevo ni compactar. |
| `cerrar sesion` | `docs/skills/cerrar-sesion/` | `docs/topics/docs-knowledge-system.md` | Persistir valor durable, regenerar indice, correr audit y responder compacto. |
| `continuar sesion` | `docs/skills/continuar-sesion/` | `docs/topics/docs-knowledge-system.md` | Hacer cierre de valor y preparar handoff compacto para sesion nueva. |
| `continuar sesion con gol` | `docs/skills/continuar-sesion-con-gol/` | `docs/topics/docs-knowledge-system.md` | Handoff para sesion nueva que debe arrancar con `gol`. |
| `continuar con gol` | `docs/skills/continuar-sesion-con-gol/` | `docs/topics/docs-knowledge-system.md` | Alias de `continuar sesion con gol`. |
| `siguiente` | `docs/skills/continuar-sesion-con-gol/` | `docs/topics/docs-knowledge-system.md` | Alias corto de continuidad con `gol`, no "seguir aqui". |
| `realinear os` | `docs/skills/realinear-os/` | `docs/topics/agentic-os-operations.md` | Auditar/reparar la capa agentica sin tocar producto salvo pedido explicito. |
| `evaluar skills` / `pasar a skills` | `docs/skills/evaluar-skills/` | Este topic | Auditar candidatos para promoverlos a skills hibridas. |
| `hacer commits` / `push` / `publicar cambios` / `repo commit push` | `docs/skills/repo-commit-push/` | `docs/skills/repo-commit-push/SKILL.md` | Revisar inclusion, validar, commitear y pushear el batch del repo. |

Regla de precedencia: si una skill y su topic divergen, corregir la skill para que vuelva a apuntar al topic; no duplicar procedimiento largo dentro de `SKILL.md`.

## Validacion

```powershell
powershell -ExecutionPolicy Bypass -File scripts/ensure-skills-link.ps1
bun run context:index
bun run context:audit
```

## Mantenimiento

- Editar siempre `docs/skills/<nombre>/`.
- Si se agrega una skill nueva, indexarla desde `docs/skills/README.md`; actualizar este topic solo si cambia el criterio de diseño o mantenimiento.
- Si una skill necesita metadata UI, mantener `agents/openai.yaml` alineado con `SKILL.md`.
- Preferir skills hibridas cortas cuando ya existe una fuente canonica confiable.
