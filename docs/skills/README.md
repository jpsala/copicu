# Skills Locales

`docs/skills/` es la fuente canonica de skills locales del repo. `.agents/skills` es compatibilidad tecnica: en Pi queda deshabilitado por defecto para bajar ruido; se puede activar bajo demanda con `/aos-skills on` o `scripts/toggle-skills-link.ps1 on`.

## Regla

- No duplicar skills en dos carpetas reales.
- Si se agrega o modifica una skill, editar `docs/skills/<nombre>/`.
- Los comandos AOS nuevos usan prefijo `aos-*`; las carpetas sin prefijo quedan como aliases/compatibilidad local mientras no molesten.
- Si una skill operativa cambia comportamiento durable, actualizar tambien el topic/script canonico correspondiente.

## Contenido Principal

- `aos-sigamos/`: continuar el trabajo activo en la misma sesion.
- `aos-guardar-sesion/` y alias `aos-checkpoint/`: persistir valor durable sin cerrar ni cambiar de sesion.
- `aos-cerrar-sesion/`: cierre de valor sin transcript.
- `aos-nueva-sesion/`, `aos-continuar-sesion/`: cierre de valor mas handoff compacto para sesion nueva.
- `aos-nueva-sesion-con-gol/`, `aos-continuar-sesion-con-gol/`: continuidad que pide arrancar la proxima sesion con `aos-gol`.
- `aos-gol-lite/`: ejecutar un lote chico verificable en la sesion actual, sin `/until-done` automatico.
- `aos-realinear-os/`: auditoria y reparacion de la capa agentica.
- `aos-perfect-os/`: checklist exigente para dejar el OS en condiciones.
- `aos-orquestar/`, `aos-fanout/`: fan-out controlado con subagentes/threads cuando aporta paralelismo real.
- `aos-evaluar-skills/`: auditar que partes del sistema agentico conviene promover a skills hibridas.
- `aos-repo-commit-push/`: checklist para incluir cambios necesarios, commitear y pushear.
- `impeccable/`: skill local para trabajo de UI/frontend.
- `speckit-*/`: skills locales del workflow SpecKit.

## Comandos Operativos

| Usuario dice | Skill principal | Efecto |
| --- | --- | --- |
| `aos-sigamos` / `sigamos` | `aos-sigamos` | Sigue en la misma sesion sin cierre, handoff ni thread nuevo. |
| `aos-guardar-sesion` / `aos-checkpoint` / `checkpoint` | `aos-guardar-sesion` | Promueve valor durable a docs sin cerrar, compactar, handoff ni thread nuevo. |
| `aos-cerrar-sesion` / `cerrar sesion` | `aos-cerrar-sesion` | Promueve valor durable a docs, regenera indice y corre audit cuando aplica. |
| `aos-nueva-sesion` / `aos-continuar-sesion` / `continuar sesion` | `aos-nueva-sesion` | Cierre de valor + handoff compacto para sesion nueva. |
| `aos-nueva-sesion-con-gol` / `aos-siguiente` / `siguiente` | `aos-nueva-sesion-con-gol` | Cierre + handoff + instruccion de arrancar con `aos-gol`. |
| `aos-gol` / `aos-gol-lite` | `aos-gol-lite` | Avanza un lote chico verificable en esta sesion. |
| `aos-realinear-os` / `realinear os` | `aos-realinear-os` | Audita y repara drift de la capa agentica sin tocar producto salvo pedido explicito. |
| `aos-perfect-os` / `perfect os` | `aos-perfect-os` | Revisa calidad agentica por capas y corrige lo seguro. |
| `aos-orquestar` / `aos-fanout` | `aos-orquestar`, `aos-fanout` | Propone/ejecuta paralelismo seguro con ownership claro. |
| `repo commit push` | `aos-repo-commit-push` | Revisa inclusion, valida, commitea y pushea el batch. |

La fuente canonica del comportamiento esta en `docs/topics/docs-knowledge-system.md`, `docs/topics/agentic-os-operations.md`, `docs/topics/os-quality.md` y `docs/topics/pi-agentic-os.md`; las skills son wrappers cortos para discovery.

## Pi

Prompt templates y extension commands viven en `.pi` y usan prefijo `aos-*`:

- `/aos-guardar-sesion`, `/aos-checkpoint`, `/aos-cerrar`, `/aos-continuar-sesion`, `/aos-nueva-sesion`, `/aos-nueva-sesion-con-gol`, `/aos-sigamos`, `/aos-siguiente`, `/aos-gol`.
- `/aos-status`, `/aos-sync`, `/aos-compact`, `/aos-continuar`, `/aos-skills`, `/aos-checkpoint-nudge`.

Usar `/reload` en Pi despues de editar `.pi`, prompts o skills.

## Validacion

```powershell
powershell -ExecutionPolicy Bypass -File scripts/toggle-skills-link.ps1 status
bun run context:index
bun run context:audit
```

## Mantenimiento

- Si una skill nueva usa metadata UI, crear o regenerar `agents/openai.yaml`.
- Si un doc humano apunta a `.agents/skills` como fuente de verdad, corregirlo a `docs/skills/`.
- Si necesitás discovery de skills, activar primero el toggle (`/aos-skills on`) antes de tocar contenido.
