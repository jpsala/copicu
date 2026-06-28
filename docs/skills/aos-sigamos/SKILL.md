---
name: aos-sigamos
description: Continue with the next step in the current session without mandatory session saving, handoff creation, new thread creation, or asking for gol. Use when JP says `aos-sigamos` or wants to keep momentum in the same thread.
---

# Sigamos

Continuar el trabajo activo en esta misma sesion.

## Flujo

1. Mantener el objetivo actual y el contexto de la sesion.
2. No ejecutar guardado de valor obligatorio.
3. No crear handoff, thread nuevo ni prompt pegable.
4. No pedir `gol` salvo instruccion explicita del usuario.
5. Seguir con el siguiente paso concreto usando los docs vivos ya existentes.

## Comportamiento Esperado

- Usar la track, topic o spec activa si ya existe.
- Si el repo ya tiene contexto suficiente en el hilo actual, no reabrir toda la ruta caliente.
- Si durante el trabajo aparece conocimiento durable, promoverlo solo cuando realmente cambie una regla o el estado vivo.

## No Hacer

- No tratar `aos-sigamos` como alias de `nueva sesion`.
- No guardar/aos-cerrar la sesion por cuenta propia salvo que aparezca valor durable claro.
- No crear transcript.
