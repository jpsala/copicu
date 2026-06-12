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
  - cerrar sesion
  - continuar sesion
  - continuar sesion con gol
  - continuar con gol
  - siguiente
  - realinear os
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
| Regla activa | Debe condicionar todo trabajo y no es un comando. | Alto pero necesario. | No commitear secretos, no revertir cambios ajenos. |
| Topic | Es conocimiento recuperable, criterio o explicacion. | Bajo demanda. | Como decidir donde poner memoria durable. |
| Skill | Es una accion invocable, repetible y estable. | Metadata siempre descubierta. | `cerrar sesion`, `realinear os`. |
| Skill hibrida | Se quiere discovery por nombre, pero la logica vive en docs/topics/scripts. | Metadata chica + referencia externa. | `regenerar-contexto`. |

Una instruccion activa puede funcionar como skill si tiene forma de accion. No conviene convertir reglas globales de seguridad o lectura en skills solo para nombrarlas.

## Modelo Hibrido

1. La skill existe para hacer descubrible el comando.
2. El `SKILL.md` se mantiene corto.
3. La logica durable vive en `AGENTS.md`, topic, track, spec o script.
4. La skill apunta a la fuente canonica y no duplica procedimiento largo.
5. Si cambia la logica, se actualiza la fuente canonica y se revisa si la skill sigue apuntando bien.

## Criterio De Promocion

Antes de crear una skill nueva, responder:

1. El usuario podria invocarlo por nombre?
2. Es una accion repetible, no solo una politica?
3. Tiene triggers claros?
4. Su logica puede vivir en una fuente canonica sin duplicarse?
5. El costo de metadata se justifica por discovery?

Si la respuesta fuerte es "si" en 3 o mas puntos, crear skill. Si no, dejarlo como topic, regla activa o track.

## Comandos Cubiertos

- `sigamos`
- `cerrar sesion`
- `continuar sesion`
- `continuar sesion con gol`
- `continuar con gol`
- `siguiente`
- `realinear os`

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
