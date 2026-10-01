---
title: Spike de portabilidad macOS
status: paused
summary: Investigación aparcada de picker, SQLite, clipboard y paste en Mac sin cambiar el roadmap Windows-first.
last_worked: null
next: Si se autoriza retomar Mac, definir spec y primer spike de picker, SQLite y copy-back sin paste automático.
topics: [macos-portability-research-unindexed]
---

# 015 macOS Port Spike

**Importación OS2:** UTC histórica desconocida; `null` conserva el registro previo. Metadata original:

```yaml
status: parked
updated: 2026-06-10
topic: macos-portability-research-unindexed
```

Se mantiene aparcado como `paused`, sin soporte Mac autorizado o verificado hoy. El topic es recuperable por metadata OS2 y secciones; no crear un índice global ni cambiar el roadmap Windows-first.

Estado registrado: pending / parked. Topic de referencia: `docs/topics/macos-portability-research-unindexed.md`.

## Objetivo

Evaluar un port macOS de Copicu sin cambiar todavia el roadmap Windows-first.

## Aprendizaje Actual

- Apps macOS reales como Maccy y Clipy usan polling de `NSPasteboard.changeCount`, tipicamente cada 500 ms.
- El paste automatico macOS suele ser: escribir `NSPasteboard`, verificar Accessibility, postear `Cmd+V` con `CGEvent`.
- Accessibility es condicion central para paste automatico; la firma de codigo afecta si macOS mantiene o vuelve a pedir el permiso.
- CopyQ documenta que paste funciona en macOS, pero sus propios issues muestran fallos por Accessibility.
- Raycast confirma producto: primary action configurable entre paste y copy, paste plain text y disabled apps para privacidad.

## Task Pendiente

- [ ] Si se autoriza retomar Mac, contrastar el topic existente y definir una spec formal antes de implementar, sin crear un índice global.
- [ ] Primer spike recomendado: compilar en macOS con paste automatico deshabilitado y validar picker + SQLite + copy-back texto.
- [ ] Segundo spike: `NSPasteboard.changeCount` + self-write suppression + ignored pasteboard types.
- [ ] Tercer spike: Accessibility + `CGEvent` `Cmd+V` contra apps target sinteticas.

## No Decidido

- No cambia el target primario actual.
- No promete soporte Linux.
- No cambia el contrato actual de `Enter`/`Shift+Enter`.
