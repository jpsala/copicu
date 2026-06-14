---
id: pi-agentic-os
status: active
kind: how-to
triggers:
  - pi os
  - pi agentic os
  - checkpoint-nudge
  - os-status
  - os-compact
  - os-continuar
  - compactacion pi
  - sesiones pi
  - extensiones pi
primary_refs:
  - .pi/extensions/checkpoint-nudge.ts
  - .pi/extensions/os-tools.ts
  - .pi/prompts/checkpoint.md
  - docs/topics/docs-knowledge-system.md
  - docs/topics/agentic-os-operations.md
  - docs/skills/checkpoint/SKILL.md
---

# Pi Agentic OS

Este topic documenta la adaptacion del sistema agentico de Copicu a Pi. La regla de fondo no cambia: la memoria durable vive en docs versionados; Pi aporta automatizacion, nudges, sesiones, labels y compaction.

## Comandos Pi Locales

| Comando | Tipo | Uso |
| --- | --- | --- |
| `/checkpoint` | prompt template | Persistir valor durable sin cerrar sesion ni compactar. |
| `/checkpoint-nudge` | extension command | Ver/controlar avisos por uso de contexto. Subcomandos: `prefill`, `mute`, `unmute`, `test`. |
| `/os-status [audit]` | extension command | Insertar estado operativo: sesion, modelo, contexto, git y opcional `bun run context:audit`. |
| `/os-compact [foco]` | extension command | Ejecutar compactacion manual con instrucciones OS-aware. Usar despues de checkpoint si habia valor durable. |
| `/os-continuar [objetivo]` | extension command | Crear nueva sesion Pi con handoff desde docs vivos. Pide confirmar checkpoint previo. |
| `/reload` | built-in Pi | Recargar extensiones, prompts y skills. |

## Extensiones

### `.pi/extensions/checkpoint-nudge.ts`

- Avisa cuando el contexto cruza 70%, 85% y 92%.
- Mantiene status en footer mientras el contexto esta alto.
- No ejecuta checkpoint ni compaction automaticamente.
- Detecta input de checkpoint y etiqueta el leaf final en `/tree` como `checkpoint YYYY-MM-DD HH:mm`.

### `.pi/extensions/os-tools.ts`

- `/os-status`: snapshot operativo no semantico. Puede correr audit bajo demanda.
- `/os-compact`: wrapper seguro para `ctx.compact()` con instrucciones de preservacion OS.
- `/os-continuar`: usa `ctx.newSession()` y `SessionManager.appendCustomMessageEntry()` para crear una sesion nueva con handoff basado en docs vivos, no en transcript.
- Hook `session_before_compact`: avisa que existe la ruta manual `/checkpoint` -> `/os-compact`.

## Politica De Automatizacion

Hacer automatico:

- nudges por contexto;
- labels/checkpoints de navegacion;
- status operativo;
- handoff estructural desde docs;
- compaction manual con instrucciones predecibles.

No hacer automatico por defecto:

- editar docs sin gesto humano;
- ejecutar `/checkpoint` solo por tokens;
- compactar agresivamente antes de persistir valor durable;
- crear sesiones nuevas sin confirmacion.

## Flujo Recomendado

A 70% de contexto:

1. seguir si no hay valor durable nuevo;
2. si hubo decisiones, usar `/checkpoint`;
3. si el contexto molesta despues del checkpoint, usar `/os-compact`.

Antes de cambiar de frente:

1. `/checkpoint` si hubo valor nuevo;
2. `/os-continuar <objetivo>` para abrir sesion nueva con handoff desde docs;
3. enviar `sigamos` en la sesion nueva cuando quieras arrancar.

Para diagnostico:

```text
/os-status audit
```

## Bloat

El primer ajuste Pi redujo `docs/WORKING_MEMORY.md` y archivo la version larga en `docs/reference/working-memory-archive-2026-06-14-pre-pi-os.md`.

Pendiente: compactar tracks grandes, especialmente `docs/tracks/012-tags-and-hotkeys.md`, moviendo historia a `docs/reference/` sin perder estado retomable.
