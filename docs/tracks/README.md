# Tracks

Trabajos retomables con objetivo, estado, pendientes y evidencia. El [mapa documental](../README.md) orienta por intención; este README explica el formato, no mantiene un inventario ni un foco global.

## Convención OS2 Para Trabajo Nuevo

Crear `docs/tracks/<nombre-kebab-case>.md` sólo cuando haya trabajo que deba poder retomarse. El nombre del archivo es el ID, sin duplicarlo en metadata:

```markdown
---
title: Investigar un comportamiento de captura
status: active
summary: Acotar el comportamiento observado y dejar una comprobación reproducible.
last_worked: null
next: Definir un repro mínimo con datos sintéticos.
topics: []
---

## Objetivo
Resultado buscado y límites del pedido.

## Estado actual
Hallazgos, incertidumbres y bloqueos necesarios para retomar.

## Pendientes
- [ ] Próxima acción concreta.

## Referencias y evidencia
Fuentes y comprobaciones pertinentes; distinguir evidencia heredada de comprobación propia.
```

- `title`, `status`, `summary` y `last_worked` son obligatorios. `next` es una línea obligatoria salvo en un cerrado; no mantener otra copia textual del siguiente paso en el cuerpo.
- Estados: `active` (trabajo vigente), `paused` (detenido pero retomable), `closed` (terminado o descartado, con resultado o motivo en el cuerpo). Mantener los cerrados en esta carpeta, no archivarlos por ceremonia.
- `topics` es opcional: nombres de archivo de topics pertinentes, sin `.md`. No enlazar el catálogo completo; una referencia no certifica metadata ni vigencia del topic.
- `last_worked: null` significa que todavía no se trabajó o, por excepción de importación aprobada por JP, que el trabajo histórico carece de fecha/hora UTC acreditada. En ese caso conservar fecha/estado legacy y procedencia en el cuerpo; no niega trabajo previo ni se ordena como más antiguo. Al avanzar trabajo real, registrar UTC entre comillas, por ejemplo `"2026-09-30T09:00:00Z"`. Importar, consultar o corregir formato no cambia esa fecha.
- Mantener el cuerpo corto y recuperable: actualizar estado en lugar de acumular crónicas. No guardar transcripts, receipts extensos, logs ni datos reales del clipboard.

## Tracks Heredados

Los tracks importados usan metadata OS2 y conservan su metadata AOS original en el cuerpo, incluida la fecha de día y el estado registrados. `last_worked: null` mantiene la hora UTC desconocida: no convertir `updated` a medianoche ni inferirla desde mtime, commits o nombres de logs/backups.

Normalizar estado y próximo paso según objetivo, resultado y pendientes de cada fuente, no mediante una tabla mecánica. Un cerrado importado refiere al corte completado/reemplazado o a una definición histórica, con razón explícita; no acredita producto actual. `active` tampoco reactiva prioridades, apps o permisos. Los campos anteriores de modelo/receta, como `execution_route`, son procedencia, no defaults nuevos.

El consultor sólo ordena fechas UTC conocidas. Al avanzar trabajo real en el encargo pertinente, registrar UTC y reconciliar estado/próximo paso; no fechar todos los tracks como recientes por importarlos.

El parser/router AOS fue retirado. `bun run knowledge -- tracks active|paused|closed`, `last`, `search` y `check` consultan metadata local sin escrituras ni otro checkout; no se instala nada ni se requiere CLI para leer. `last` excluye `null` del orden, no del conocimiento. La [adopción](os2-adoption.md) recoge aceptación/integración pendientes; check estructural no valida vigencia ni comprensión humana.

## Continuidad Durable

- Objetivo, estado y pendientes quedan en el track; actualizar sólo lo que cambió.
- Promover conocimiento reusable y decisiones con razones al topic pertinente de `docs/topics/`, enlazándolo sin duplicar el plan.
- Las preguntas de ejecución quedan en el track; las incertidumbres del conocimiento, en el topic. `PROJECT.md` y specs son contexto profundo según el tema; `DECISIONS.md` y `OPEN_QUESTIONS.md` son referencias legacy, no nuevos destinos globales.
- No mantener `docs/WORKING_MEMORY.md` como foco: es un stub histórico. No exigir indexar un track en `TOPICS.md`; no crear routers paralelos.
- Separar evidencia registrada, comprobación propia y aceptación humana. Un estado `active`, una fecha o una autorización histórica no conceden permisos actuales.

Esta convención no prescribe cómo un harness planifica, ejecuta, paraleliza o gestiona sesiones, ni exige OMP o Pi.

## Encontrar Y Retomar

Buscar por intención en nombres y metadata de esta carpeta con `rg` acotado; si hace falta, ampliar al contenido sin abrir todo el catálogo. Abrir sólo el track pertinente y tomar su estado, próximo paso, pendientes y evidencia como punto de partida, seguido de los topics/secciones necesarios. No inferir el último trabajo por mtime ni asumir que sólo un track puede estar activo.
