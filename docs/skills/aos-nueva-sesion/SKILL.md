---
name: aos-nueva-sesion
description: Save the current session's durable value and start a clean new session/thread with a compact handoff. Use when JP says `nueva sesion`; this is the preferred clear name over legacy `continuar sesion`.
---

# Nueva Sesion

Cerrar con valor y preparar continuidad limpia en una sesion nueva.

Fuente canonica: `docs/topics/docs-knowledge-system.md`, seccion `Cierre Y Continuacion De Sesion`.

## Flujo

1. Ejecutar `guardar sesion`.
2. Preparar handoff compacto o prompt pegable apuntando a docs actualizados.
3. Abrir sesion/thread nuevo si la herramienta existe.
4. No seguir trabajando en la sesion actual; para eso usar `aos-sigamos`.

## Alias Legado

- `continuar sesion`
