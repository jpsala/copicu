---
id: pi-agentic-os
status: active
kind: how-to
triggers:
  - pi os
  - pi agentic os
  - /flow
  - ask_user
  - advisor
  - pi-lens
  - computer use
primary_refs:
  - aos.requirements.json
  - docs/reference/pi-agentic-os-command-surface.md
  - docs/reference/tool-routing.yaml
  - docs/topics/agent-tool-routing.md
  - .pi/extensions/copicu-computer-use.ts
---

# Pi Agentic OS

Copicu consume el runtime Pi global de AOS desde `AOS_HOME`. El repo declara el
contrato mínimo en `aos.requirements.json` y conserva sólo adapters propios.

## Superficie Diaria

`/flow` es la única entrada cotidiana: `Pensar | Planear | Hacer | Cerrar`.
Planear declara en el brief `execution_route: economical | balanced | strong`:
`economical` usa Luna High para docs o mecánica de bajo riesgo, `balanced` usa
Sol Medium por defecto y `strong` usa Sol High para trabajo sensible. `Hacer`
aplica esa ruta en una sesión nueva enlazada antes del handoff documental y
continúa allí sin Agent, runtime state ni auto-send; modelo o auth ausentes
bloquean sin fallback. El foco se valida desde `docs/WORKING_MEMORY.md`; un
downstream no copia `.pi/extensions/aos-flujo.ts`.

Pi carga el package global como `user/package`; Copicu requiere exactamente un
`/flow` con provenance de package, versión compatible `aos.flow-first@1.1.0` y
scope `user`.

## Capacidades Locales

- `.pi/extensions/copicu-computer-use.ts` sólo se usa para pruebas explícitas de
  la app Copicu y no registra lifecycle AOS.
- Los prompts de research/release, taskflows de producto y skills de
  `docs/skills/` permanecen disponibles cuando tienen una diferencia local real.
- Las operaciones de alineación, auditoría y commit/push conservan sus gates;
  no sustituyen `/flow` ni crean aliases para pensar, planear, implementar,
  continuar o cerrar.

## Hacer

El brief es orientación de intención y límites, no checklist exhaustiva. Para un
cambio local reversible se inspecciona sólo lo necesario para preservar WIP, se
elige evidencia mínima y se ejecutan checks no duplicados. Si falta una decisión
necesaria, se vuelve a `/flow → Planear`; no se inventa ni se expande el alcance.

## Seguridad Y UI

`ask_user` sigue siendo obligatorio para instalaciones, commits, push, deploy,
producción, credenciales, datos privados, acciones destructivas o side effects
externos. Computer use, browser, hotkeys, clipboard y apps visibles requieren
el aviso inicial definido en `AGENTS.md`.
