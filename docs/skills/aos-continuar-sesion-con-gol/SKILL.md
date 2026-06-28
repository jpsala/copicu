---
name: aos-continuar-sesion-con-gol
description: "Legacy alias for `nueva sesion con gol` - save durable value, prepare a clean new session, and ask it to run `gol` for the next agreed small batch. Prefer `nueva sesion con gol` in help."
---

# Nueva Sesion Con Gol

Guardar sesion, preparar sesion nueva y pedir que arranque con `gol`.

Fuente canonica: `docs/topics/agentic-os.md`, seccion `Continuar Sesion Con Gol`.

## Flujo

1. Ejecutar el flujo de `nueva sesion` / `continuar sesion` (`guardar sesion` + handoff).
2. Persistir el plan y el proximo lote en docs vivos.
3. Incluir en el handoff o prompt una instruccion explicita: arrancar con `gol`.

## Aliases

- `continuar sesion con gol`
- `continuar con gol`
- `siguiente`

## Regla

Usar esta skill solo cuando conviene cortar contexto y el proximo lote chico ya esta acordado. `gol` no es `/until-done`: es el flujo liviano de lote chico.

## No Hacer

- No seguir trabajando en la misma sesion como si fuera `aos-sigamos`.
- No omitir la instruccion de arrancar con `gol`.
