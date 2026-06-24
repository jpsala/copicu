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
  - computer use
  - cua-driver
  - background computer use
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

Este topic documenta la adaptacion del sistema agentico de Copicu a Pi. La regla de fondo no cambia: la memoria durable vive en docs versionados; Pi aporta automatizacion, nudges, sesiones, labels y compaction. Copicu es downstream AOS: el adapter Pi se mantiene local y no importa gobierno manager-only de `C:\dev\os`.

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
| `/release-windows [tag|patch|minor|major|rc] [notas]` | prompt template | Ejecutar el release Windows completo usando `npm run release:windows`. Si no se pasa tag, el script calcula el proximo release mirando version actual, tags y GitHub releases. Confirma antes de commit, push y GitHub release/subida de assets. |
| `/until-done <objetivo>` | package command | Loop instalado via `pi-until-done` para objetivos con contrato, presupuesto, pausa/resume y verificacion. Usar para tareas acotadas que deban completarse o bloquearse con evidencia. |
| `/reload` | built-in Pi | Recargar extensiones, prompts y skills despues de instalar paquetes o editar `.pi/`. |

Prompts equivalentes: `/cerrar`, `/continuar`, `/siguiente`, `/sigamos`, `/realinear`, `/research` y `/release-windows`.

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

### RTK / Token Savings

RTK es una optimizacion global de Pi, no dependencia de este repo. Si aparece `[rtk] No hook installed`, es un aviso global de optimizacion, no un problema del proyecto; se puede ignorar o habilitar fuera del repo con `rtk init -g` y verificar con `rtk gain`.

Politica segura local:

- No versionar config global de RTK ni exigirlo como dependencia del repo.
- Mantener lecturas exactas: `readCompaction.enabled=false` y `sourceCodeFilteringEnabled=false`.
- Usar RTK solo para output ruidoso (`git diff/log`, logs, builds/tests largos, busquedas grandes).
- Para evidencia final, anchors de `edit`, lineas exactas o errores raros, pedir output crudo o leer archivos directamente.

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
## Computer Use Local / Background

Usar computer use solo cuando APIs, tests o browser/DOM no alcancen para validar una UI real. No convertirlo en requisito duro del repo: la infraestructura global de JP vive en `C:\dev\infra`; hoy incluye Cua Driver global via Pi MCP `cua-driver` en modo `eager`/persistente (tras `/reload` o reinicio), y puede incluir browser remoto o VM segun la maquina.

Politica local:

- Documentar la superficie permitida antes de automatizar: app fixture, sandbox, browser remoto, VM o ventana especifica.
- Preferir fixtures efimeras y datos de prueba; no operar sobre documentos, cuentas o apps reales sin confirmacion de JP.
- Mantener evidencia externa: archivo resultado, screenshot, log, estado de DB o comando de verificacion. No alcanza con decir que se clickeo.
- Orden recomendado: API/test directo -> Playwright/DOM/browser tool -> Cua/UIA background -> computer-use visual por screenshots/VM. Subir de nivel solo cuando el anterior no cubre el caso.
- Pedir confirmacion con `ask_user` antes de login, pagos, compras, envios, publicaciones, cambios productivos, aceptacion de terminos, instalar drivers, habilitar autostart/RunLevel Highest, exponer VNC/noVNC o abrir tunnels.
- Cerrar procesos/ventanas y limpiar temporales al finalizar. Registrar limitaciones conocidas por control (por ejemplo combos/selects) en el topic o track del trabajo.

Smoke test minimo por repo:

1. Crear fixture/app efimera con inputs, boton y salida verificable.
2. Lanzarla con computer use sin robar foreground cuando aplique.
3. Leer accessibility tree/screenshot antes de actuar.
4. Completar campos y disparar accion final.
5. Verificar salida por comando/archivo/API y documentar gotchas.
6. Cerrar procesos y borrar datos temporales si corresponde.

Patron probado para E2E real de producto:

- Referencia actual: `C:/dev/dictation-tauri/scripts/desktop-dictation-e2e.ps1`, passing report `artifacts/desktop-control/dictation-e2e/20260624-104246/report.json`.
- Separar aprobaciones por flags: side effects desktop, provider/cloud call y clipboard/paste mutation.
- Usar target fixture editable o sandbox real con salida externa verificable; guardar live output fuera del repo si el dev server watch-ea artifacts y copiarlo al final.
- Validar cadena completa, no solo UI: driver health, app launch, target foreground, trigger/hotkey, input controlado, artifact fresco, provider/runtime, delivery, clipboard restoration y cleanup.
- El reporte versionable/ignorado debe guardar rutas, hashes/longitudes/tokens esperados y checks; no guardar raw transcript, secretos ni contenido privado en docs/chat.

