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
  - seguir
  - os-sync
  - gol
  - until-done
  - compactacion pi
  - sesiones pi
  - extensiones pi
  - prompts pi
  - rtk
  - pi-rtk-optimizer
primary_refs:
  - .pi/extensions/checkpoint-nudge.ts
  - .pi/extensions/os-tools.ts
  - .pi/extensions/copicu-computer-use.ts
  - .pi/prompts/
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
| `/seguir [objetivo]` | extension command | Alias corto de `/os-continuar` para crear una nueva sesion con continuidad OS. |
| `/os-sync` | extension command | Sincronizar el OS despues de cambios en docs, topics, tracks, skills, prompts o extensiones: asegura junction de skills, regenera context index y corre audit. |
| `/gol [objetivo]` | extension command | Preparar un `/until-done` acotado para ejecutar una tarea Copicu completa con constraints del OS. Requiere revisar y enviar el comando prellenado. |
| `/until-done <objetivo>` | package command | Loop instalado via `pi-until-done` para objetivos con contrato, presupuesto, pausa/resume y verificacion. Usar para tareas acotadas que deban completarse o bloquearse con evidencia. |
| `/reload` | built-in Pi | Recargar extensiones, prompts y skills despues de instalar paquetes o editar `.pi/`. |

Prompts equivalentes: `/cerrar`, `/continuar`, `/siguiente`, `/sigamos`, `/realinear` y `/research`.

## Extensiones

### `.pi/extensions/checkpoint-nudge.ts`

- Avisa cuando el contexto cruza 70%, 85% y 92%.
- Mantiene status en footer mientras el contexto esta alto.
- No ejecuta checkpoint ni compaction automaticamente.
- Detecta input de checkpoint y etiqueta el leaf final en `/tree` como `checkpoint YYYY-MM-DD HH:mm`.

### `.pi/extensions/os-tools.ts`

- `/os-status`: snapshot operativo no semantico. Puede correr audit bajo demanda.
- `/os-sync`: comando de higiene despues de tocar la capa OS; corre `scripts/ensure-skills-link.ps1` si existe, `bun run context:index` y `bun run context:audit`, y deja salida visible en la sesion.
- `/gol [objetivo]`: prepara en el editor un `/until-done` con constraints Copicu/OS. No arranca solo; JP revisa y envia.
- `/os-compact`: wrapper seguro para `ctx.compact()` con instrucciones de preservacion OS.
- `/os-continuar` y `/seguir`: usan `ctx.newSession()` y `SessionManager.appendCustomMessageEntry()` para crear una sesion nueva con handoff basado en docs vivos, no en transcript.
- Hook `session_before_compact`: avisa que existe la ruta manual `/checkpoint` -> `/os-compact`.

### `pi-until-done`

- Instalado globalmente con `pi install npm:pi-until-done` (`~/.pi/agent/npm/node_modules/pi-until-done`).
- Comando principal: `/until-done <objetivo>`; wrapper local: `/gol [objetivo]`.
- Usarlo para objetivos acotados que deben terminar en uno de dos estados: completado con verificacion/evidencia, o bloqueado con razon exacta.
- Mantener presupuestos modestos y evitar objetivos amplios tipo "hacer roadmap"; partir tracks/specs grandes en metas concretas.
- Para riesgos nativos (clipboard, global shortcuts, foco previo, paste, instalador, acciones destructivas), el loop debe bloquear y pedir confirmacion/dogfood de JP en vez de inventar exito.

### `.pi/extensions/copicu-computer-use.ts`

- Tool Pi `copicu_computer_use` para dogfood manual de la app Windows/Tauri desde el agente.
- Implementa una capa compacta sobre AHK-MCP local en `.codex-run/tools/ahk-mcp` y AutoHotkey v2 (`C:/Program Files/AutoHotkey/v2/AutoHotkey64.exe`).
- Acciones utiles: `windows`, `open_picker`, `focus`, `send`, `type`, `click`, `screenshot`, `read`, `uia_tree`, `uia_find`, `self_test`, `debug_last`.
- `self_test` valida AHK y ventanas; `debug_last` lee `.codex-run/computer-use/last-call.json` con params, script Python generado, stdout/stderr y exit code.
- Las llamadas se serializan con una queue interna para evitar carreras entre AHK/ventanas cuando el agente dispara tools en paralelo.
- Para Copicu/Tauri, UIA ve la ventana pero expone poco del WebView (`Edit` no aparece); ruta confiable actual: foco/hotkeys/teclado + screenshots. `window_info` puede timeoutear con Tauri, no usarlo por defecto.
- Hay config global opcional de MCP en `~/.pi/agent/mcp.json` con `pi-mcp-extension` + `ahk-mcp` lazy, pero el wrapper versionado es la interfaz recomendada para este repo.

### `pi-rtk-optimizer` y `rtk`

- `pi-rtk-optimizer` es una extension global de Pi, no una dependencia de Copicu.
- Usa el binario correcto `rtk-ai/rtk` (`rtk gain` debe funcionar). Evitar `npm rtk`, que es otro proyecto.
- Instalacion local vigente: `C:\Users\jpsal\.local\bin\rtk.exe`.
- Config actual recomendada: `mode: "rewrite"` para aplicar reescrituras automaticamente y evitar avisos repetidos, manteniendo lecturas exactas.
- Mantener `readCompaction.enabled: false` y `sourceCodeFilteringEnabled: false` para no romper anchors de `edit`, auditorias del OS ni evidencia exacta en archivos.
- Politica de uso: aceptar/usar `rtk` para orientacion ruidosa (`git diff/status/log`, logs, busquedas grandes, tests/builds largos) cuando el objetivo sea ahorrar contexto y entender rapido.
- No activar compaction/filtro lossy de `read` cuando haga falta evidencia exacta o anchors de edicion: verificaciones finales, comandos cuyo output se va a citar, lecturas puntuales, diffs pequenos, errores raros o debugging donde el detalle completo importa.
- Si Pi avisa que `rtk` no esta disponible despues de instalarlo, usar `/reload` o reiniciar Pi.

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
2. `/seguir <objetivo>` o `/os-continuar <objetivo>` para abrir sesion nueva con handoff desde docs;
3. enviar `sigamos` en la sesion nueva cuando quieras arrancar.

Para ejecutar un objetivo completo y seguro:

1. elegir una tarea acotada desde topic/track/spec;
2. usar `/gol <objetivo>`;
3. revisar el `/until-done` prellenado y enviarlo;
4. pausar o bloquear si aparece riesgo nativo, falta de evidencia o decision de producto.

Para diagnostico:

```text
/os-status audit
```

Despues de cambiar el OS:

```text
/os-sync
```

Usar `/reload` despues si se editaron o instalaron extensiones, prompts, skills o paquetes Pi.

## Portabilidad

El adapter Pi es opcional. Copicu puede trabajar solo con docs versionados, scripts de contexto y skills locales; `.pi/` agrega comodidad cuando se usa Pi.

## Bloat

El primer ajuste Pi redujo `docs/WORKING_MEMORY.md` y archivo la version larga en `docs/reference/working-memory-archive-2026-06-14-pre-pi-os.md`.

Pendiente: compactar tracks grandes, especialmente `docs/tracks/012-tags-and-hotkeys.md`, moviendo historia a `docs/reference/` sin perder estado retomable.
