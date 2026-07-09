---
id: pi-extension-stack
status: active
kind: reference
triggers:
  - extensiones pi
  - paquetes pi
  - pi packages
  - sincronizar pi
  - web_search
  - web_research
  - codemapper
  - fff
  - taskflow
  - advisor
  - pi-lens
primary_refs:
  - docs/topics/pi-agentic-os.md
  - docs/OS_PLAYBOOK.md
  - C:/dev/os/docs/topics/pi-extension-stack.md
---

# Pi Extension Stack

Referencia local para elegir herramientas Pi en copicu. El inventario global de
paquetes de JP vive en `C:/dev/os/docs/topics/pi-extension-stack.md`; no copiarlo
aca como dependencia local.

## Regla Operativa

1. Elegir la herramienta mas chica que cierre el objetivo.
2. Usar web cuando conocimiento externo/versionado evite adivinar.
3. Antes de instalar/remover paquetes globales, pedir permiso y hacer backup de
   `C:/Users/jpsal/.pi/agent/settings.json`.
4. No tocar prod, cuentas reales, credenciales, envios, deploys ni datos privados
   sin aprobacion explicita.

## Superficie Operativa Local

| Nivel | Tools | Uso |
| --- | --- | --- |
| Core diario | `fffind`, `ffgrep`, CodeMapper (`map/search/outline`), `ask_user`, `advisor`, `lens_diagnostics` | Orientacion, decisiones humanas, segundo juicio y feedback tecnico. |
| Orquestacion | `taskflow`, council, `pi-link` si aplica | Auditorias/reviews paralelas con ownership claro; no para trabajo serial chico. |
| Piloto opt-in | `pi-dynamic-workflows` via `docs/skills/aos-dynamic-workflows-pilot/` si se instala | Comparar fan-out pesado/deep research/adversarial review contra `taskflow`; no dejar triggers genericos activos. |
| Ejecucion larga | planner, dgoal, `/until-done`, long-task | Elegir **uno** desde `/aos-plan-implementar`; no anidar sin decision explicita. |
| Research externo | `web_search`, `fetch_content`, `web_answer`, `web_research`, skill `librarian` | Docs oficiales, releases, APIs, issues e internals OSS; no enviar secretos. |

## Planning Y Ejecucion

Usar `/aos-plan-implementar` para elegir un motor principal: manual, planner,
dgoal, until-done, long-task o taskflow. Para decisiones de arquitectura,
storage, prod o loops largos, `advisor()` es gate.
