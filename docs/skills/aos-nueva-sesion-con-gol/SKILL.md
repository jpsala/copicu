---
name: aos-nueva-sesion-con-gol
description: Save durable value, start a clean new session/thread, and ask it to run `gol` for the next agreed small batch. Use when JP says `nueva sesion con gol`; legacy aliases include `continuar sesion con gol`, `continuar con gol`, and `siguiente`.
---

# Nueva Sesion Con Gol

Guardar sesion, preparar sesion nueva y pedir que arranque con `gol`.

Fuente canonica: `docs/topics/docs-knowledge-system.md`, seccion `Cierre Y Continuacion De Sesion`.

## Flujo

1. Ejecutar el flujo de `nueva sesion` (`guardar sesion` + handoff).
2. Persistir el plan y el proximo lote en docs vivos.
3. Incluir en el handoff la instruccion: arrancar con `gol`.

## Alias

- `continuar sesion con gol`
- `continuar con gol`
- `siguiente`

## Regla

`gol` es el flujo liviano de lote chico, no `/until-done`.
