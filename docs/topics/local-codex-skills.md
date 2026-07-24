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
  - evaluar skills
  - promover a skill
primary_refs:
  - docs/skills/README.md
  - docs/skills/
  - AGENTS.md
  - scripts/ensure-skills-link.ps1
  - scripts/toggle-skills-link.ps1
  - scripts/agent-context-audit.ts
---

# Skills Locales De Codex

`docs/skills/` es la fuente canónica; `.agents/skills` es sólo el junction de
compatibilidad para discovery. No duplicar una skill en dos carpetas reales.

## Qué Es Skill

Una skill debe ser una acción local repetible, estable y con triggers claros. El
procedimiento durable puede vivir en un topic o script; el `SKILL.md` mantiene
metadata y guardrails suficientes. Reglas globales de seguridad, conocimiento de
producto y estado vivo pertenecen a `AGENTS.md`, topics o tracks.

`/flow` no se implementa como skill local: es la única entrada cotidiana y vive
en el package global AOS. No crear skills que compitan para pensar, planear,
implementar, continuar o cerrar.

## Capacidades Preservadas

- `evaluar-skills/`: audita candidatos para promoción.
- `realinear-os/`: audita y repara la capa agentica.
- `repo-commit-push/`: commit/push sólo por pedido explícito.
- `speckit-*/`: workflow de specs grandes.
- `impeccable/`: UI/frontend.

Prompts de research/release, taskflows de producto y
`.pi/extensions/copicu-computer-use.ts` son adapters Pi locales, no skills del
lifecycle.

## Validación

```powershell
powershell -ExecutionPolicy Bypass -File scripts/toggle-skills-link.ps1 status
powershell -ExecutionPolicy Bypass -File scripts/ensure-skills-link.ps1
bun run context:index
bun run context:audit
bun run routing:check
```

Al agregar o modificar una skill, editar `docs/skills/<nombre>/`, actualizar
`docs/skills/README.md` si cambia el inventario y regenerar el índice. No borrar
el junction para limpiar la paleta: algunos hosts cachean paths.
