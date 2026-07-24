# Skills Locales

`docs/skills/` es la fuente canonica de las skills locales del repo.

## Regla

- No duplicar skills en dos carpetas reales.
- `.agents/skills` existe solo como compatibilidad tecnica y debe apuntar por junction a `docs/skills/` cuando el host debe descubrir skills.
- Si se agrega o modifica una skill, editar `docs/skills/<nombre>/`.
- Si una skill es operativa del sistema, documentarla tambien en topics/working memory/decisions cuando cambie el comportamiento durable.

## Contenido Actual

- `impeccable/`: skill local para trabajo de UI/frontend.
- `speckit-*/`: skills locales del workflow SpecKit.
- `evaluar-skills/`, `realinear-os/`, `repo-commit-push/`, SpecKit e `impeccable/`: capacidades locales preservadas; no son aliases del lifecycle diario.
- Los workflows AOS portables y la superficie diaria `/flow` viven en el package global de `C:/dev/os`; Copicu sólo declara requisitos.
- `.pi/extensions/copicu-computer-use.ts`, prompts de research/release y taskflows de producto siguen siendo adapters locales con propósito propio.

Las herramientas Pi de pensamiento/implementacion (`taskflow`, `pi-code-planner`, `pi-task`, `advisor`, Ponytail, `dgoal`, `context-viewer`, `pi-lens`) se documentan en `docs/topics/pi-extension-stack.md`, no como skills locales separadas.

## Validacion

```powershell
powershell -ExecutionPolicy Bypass -File scripts/toggle-skills-link.ps1 status
powershell -ExecutionPolicy Bypass -File scripts/ensure-skills-link.ps1
python C:\dev\agent-infra\rules\skills\.system\skill-creator\scripts\quick_validate.py docs/skills/<nombre>
bun run context:index
bun run context:audit
```

## Mantenimiento

- Si una skill nueva usa metadata UI, crear o regenerar `agents/openai.yaml`.
- Si un doc humano apunta a `.agents/skills` como fuente de verdad, corregirlo a `docs/skills/`.
- Si Codex deja de descubrir skills, reparar primero la junction antes de tocar contenido: `bun run skills:on`.
- Si Pi muestra demasiadas skills en `/`, no borrar el junction: Pi/Codex pueden cachear paths; `off`/`toggle` son aliases legacy no destructivos.
- Tras mover o portar el repo a otro disco, correr `scripts/ensure-skills-link.ps1`: si encuentra una carpeta real en `.agents/skills`, la mueve a backup, fusiona items faltantes hacia `docs/skills/` y recrea el junction sin perder contenido.

## Aplicar En Otros Repos

- Copiar o fusionar `docs/skills/` como parte de AOS cuando el repo destino necesite slash commands locales.
- No copiar `.agents/skills` como carpeta real; recrearla en destino con `scripts/ensure-skills-link.ps1`. Si el port ya trajo una carpeta real, el script la preserva como `.agents/skills.backup-*` y copia skills faltantes al canon.
- Mantener las skills hibridas: metadata y cuerpo corto en la skill, procedimiento durable en topics, scripts o docs canonicos del repo destino.
