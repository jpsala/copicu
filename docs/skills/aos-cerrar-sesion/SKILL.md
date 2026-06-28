---
name: aos-cerrar-sesion
description: Legacy alias for `guardar sesion` when JP wants to preserve value and stop. It promotes durable knowledge into repo docs, regenerates index/audit as needed, and returns a final synthesis without transcript.
---

# Cerrar Sesion / Guardar Sesion

Alias legado de `guardar sesion` con sintesis final.

Fuente canonica: `docs/topics/docs-knowledge-system.md`, seccion `Guardar Sesion`.

## Flujo

1. Ejecutar `guardar sesion` segun la fuente canonica.
2. Regenerar `docs/.generated/context-index.md`.
3. Correr `bun scripts/agent-context-audit.ts`.
4. Responder con sintesis compacta.

## Reglas

- La memoria principal queda en archivos versionados del repo.
- El cierre debe dejar claro el estado actual y el siguiente paso.
- Si una validacion falla, reportar el blocker en vez de ocultarlo.

## No Hacer

- No abrir thread nuevo.
- No crear prompt de handoff salvo que el usuario cambie a `nueva sesion`.
- No guardar transcript largo.
