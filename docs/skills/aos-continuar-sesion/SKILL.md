---
name: aos-continuar-sesion
description: "Legacy alias for `nueva sesion` - save durable value and prepare a compact handoff for a clean new session. Prefer `nueva sesion` in help."
---

# Nueva Sesion / Continuar Sesion

Guardar sesion y preparar continuidad limpia para una sesion nueva. `nueva sesion` es el nombre preferido; `continuar sesion` queda como alias legado.

Fuente canonica: `docs/topics/docs-knowledge-system.md`, seccion `Cierre Y Continuacion De Sesion`.

## Flujo

1. Ejecutar `guardar sesion`.
2. Preparar continuidad con handoff compacto o prompt pegable.
3. Apuntar el handoff a docs actualizados.
4. No seguir en la sesion actual: para eso usar `aos-sigamos`.

## No Hacer

- No usar el handoff como fuente de verdad.
- No copiar transcript.
- No pedir `gol` por defecto; eso corresponde a otra skill.
