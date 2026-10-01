---
name: realinear-os
description: Audit and repair drift in the repo's agentic and documentation layer without touching product code unless the user explicitly asks for it. Use when the user says `realinear os`, `auditar sistema agentico`, or `reparar sistema agentico`.
---

# Realinear OS

Auditar y reparar la capa agentica del repo.

Fuente canónica: [operaciones documentales](../../topics/agentic-os-operations.md). Es una intención conversacional, no prueba de un comando slash instalado.

## Flujo

1. Comprobar pedido actual, repo/cwd y WIP; abrir sólo la fuente y secciones pertinentes.
2. Mantener el alcance documental. Un pedido de estudiar o leer no autoriza escrituras, tests con efectos ni reparaciones de entorno.
3. Curar drift comprobado dentro del alcance de edición autorizado, preservando conocimiento, cambios ajenos y gates locales.
4. Revisar diff, metadata aplicable, referencias y coherencia semántica. No regenerar índices, mantener Working Memory ni usar audit AOS como validador OS2. No ejecutar UI o reparar junctions como check documental.
5. Dejar estado y pendientes en el track pertinente, decisiones y razones en su topic; informar comprobaciones y límites sin declarar continuidad humana ni producto por un check estructural.

## No Hacer

- No tocar producto, arquitectura de runtime, datos ni deploy salvo pedido explicito.
- No borrar memoria potencialmente util sin integrarla o preguntar.
