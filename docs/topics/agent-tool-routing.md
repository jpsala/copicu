---
id: agent-tool-routing
status: active
kind: how-to
triggers:
  - tool routing
  - routing decision
  - /flow
  - elegir herramienta
  - advisor
  - ask_user
primary_refs:
  - aos.requirements.json
  - docs/reference/tool-routing.yaml
  - docs/topics/pi-agentic-os.md
---

# Agent Tool Routing

El runtime diario es `/flow`; los adapters locales no deben competir con sus
fases. El trabajo lo gobierna el hilo actual o la sesión enlazada que abre Hacer,
según el contrato global.

## Reglas

- `Pensar` explora y converge; no implementa ni cierra un plan.
- `Planear` registra un brief corto, una `execution_route` revisable y un único foco.
- `Hacer` ejecuta el foco 0/1/N en una sesión nueva enlazada, aplica la ruta (`balanced` por defecto) y bloquea sin fallback si falta modelo o auth; no usa Agent ni auto-send, y el brief guía la intención sin ser checklist exhaustiva.
- `Cerrar` sólo compacta valor durable faltante; no inicia otro batch.
- Para cambios chicos y reversibles: ejecución manual, inspección mínima y checks
  focales. No activar loops autónomos o motores históricos por defecto.
- `advisor` acompaña arquitectura, seguridad, datos, producción o decisiones
  durables; `ask_user` cubre autorizaciones humanas y efectos externos.
- Después de tocar código/configuración, usar diagnóstico/check del repo sólo si
  es evidencia relevante para el cambio.

`balanced` con Sol Medium es la ruta normal, incluso para trabajo multifile,
cross-layer o nativo acotado cuando la decisión ya está tomada y hay checks
razonables. `strong` con Sol High queda sólo para ambigüedad material,
arquitectura abierta, seguridad/auth/privacidad, irreversibilidad, alto impacto
productivo o fallos materiales difíciles de detectar. Prioridad, cantidad de
archivos, stack nativo, contrato/review, planificación compleja o un efecto
externo ya autorizado no bastan. `economical` con Luna requiere pedido explícito
de JP por cuota y checks deterministas. `Ctrl+P` alterna Sol Medium/High y
`Ctrl+L` conserva la selección manual. No hay Terra, clasificador extra ni
routing por turno.

## Gates

Instalar, commit, push, deploy, producción, credenciales, datos privados,
actions destructivas y envíos externos requieren autorización explícita. Browser,
CUA, hotkeys, clipboard y aplicaciones visibles requieren aviso inicial.

## Downstream

Copicu declara requisitos contra `AOS_HOME`; no copia runtime global, registry,
tracks, inventarios, memoria manager-only ni settings privados. Sus prompts de
research/release, taskflows de producto, skills locales y computer use se
preservan cuando tienen propósito propio.
