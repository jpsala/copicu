---
status: parked
updated: 2026-06-10
topic: docs/topics/macos-portability-research-unindexed.md
---

# 015 macOS Port Spike

Estado: pending / parked.

Topic estacionado: `docs/topics/macos-portability-research-unindexed.md`.

Esta indexado en `docs/TOPICS.md` como referencia profunda para que no quede archivo suelto, pero no cambia el roadmap Windows-first.

## Objetivo

Evaluar un port macOS de Copicu sin cambiar todavia el roadmap Windows-first.

## Aprendizaje Actual

- Apps macOS reales como Maccy y Clipy usan polling de `NSPasteboard.changeCount`, tipicamente cada 500 ms.
- El paste automatico macOS suele ser: escribir `NSPasteboard`, verificar Accessibility, postear `Cmd+V` con `CGEvent`.
- Accessibility es condicion central para paste automatico; la firma de codigo afecta si macOS mantiene o vuelve a pedir el permiso.
- CopyQ documenta que paste funciona en macOS, pero sus propios issues muestran fallos por Accessibility.
- Raycast confirma producto: primary action configurable entre paste y copy, paste plain text y disabled apps para privacidad.

## Task Pendiente

- [ ] Si se retoma Mac, convertir `docs/topics/macos-portability-research-unindexed.md` en topic indexado o spec formal antes de implementar.
- [ ] Primer spike recomendado: compilar en macOS con paste automatico deshabilitado y validar picker + SQLite + copy-back texto.
- [ ] Segundo spike: `NSPasteboard.changeCount` + self-write suppression + ignored pasteboard types.
- [ ] Tercer spike: Accessibility + `CGEvent` `Cmd+V` contra apps target sinteticas.

## No Decidido

- No cambia el target primario actual.
- No promete soporte Linux.
- No cambia el contrato actual de `Enter`/`Shift+Enter`.
