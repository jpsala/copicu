---
id: history-ordering-dedupe
status: first-slice-implemented
priority: 3
updated: 2026-06-05
---

# History Ordering And Dedupe

Definir e implementar move-to-top, dedupe y drag & drop de items, compatible con virtualización.

## Decisión

Move-to-top interesa. Drag & drop para cambiar posición de un item también interesa.

Favorites/pinning no es prioridad por ahora.

Primer slice implementado 2026-06-05:

- UI del picker migrada a `selectedItemId` como fuente primaria; `selectedIndex` queda derivado de la página visible.
- El cursor de páginas pasó a `afterSortUnixMs` + `afterId`, preparando orden por clave visible y no por índice.
- SQLite migration agrega `last_copied_at_unix_ms` y `copy_count`.
- SQLite migration posterior consolida duplicados históricos por `normalized_hash` y crea índice único sobre `normalized_hash`.
- El feed reciente ordena por `COALESCE(last_copied_at_unix_ms, created_at_unix_ms) DESC, id DESC`.
- Si llega un `normalized_hash` existente, storage actualiza `last_copied_at_unix_ms`, incrementa `copy_count`, no inserta fila nueva y mueve el item arriba en recent.
- Invariante de storage: debe existir como máximo un row por `normalized_hash`. La migración conserva el keeper más reciente, mantiene `created_at_unix_ms` como primera captura, suma `copy_count`, conserva el máximo de `last_used_at`/`last_copied_at` y rescata metadata no vacía básica (`title`, `notes`, `tags`).
- `created_at_unix_ms` queda como primera captura; `last_used_at_unix_ms` queda reservado para activación desde Copicu.

## Conceptos

- `dedupe`: evitar filas duplicadas para el mismo contenido cuando no aportan valor.
- `move-to-top`: si se copia algo viejo, actualizarlo y subirlo en el orden visible.
- `manual order`: el usuario puede reordenar items con drag & drop.
- `retention`: política de cuánto historial conservar; queda para investigar antes de decidir.

## Preguntas A Resolver

- ¿Drag & drop aplica al feed global o solo a una vista manual?
- ¿Cómo convive orden manual con búsqueda/filtros?
- ¿Qué significa borrar automáticamente si hay orden manual?

## Modelo Candidato

Columnas posibles:

- `created_at_unix_ms`: primera captura.
- `last_copied_at_unix_ms`: última vez capturado desde clipboard externo.
- `last_used_at_unix_ms`: última vez activado desde Copicu.
- `copy_count`: cantidad de recapturas.
- `manual_rank`: posición manual opcional.

Reglas actuales:

- Si llega hash existente:
  - actualizar `last_copied_at`;
  - incrementar `copy_count`;
  - no insertar payload duplicado;
  - mover arriba en vista recent.

Reglas candidatas pendientes:

- Drag & drop actualiza `manual_rank`.
- Usar fractional ranking para insertar entre vecinos sin renumerar todo.

## Virtualización

Drag & drop no puede depender del índice DOM visible. Debe operar por:

- dragged `item_id`;
- target `item_id`;
- posición relativa: before/after;
- rank calculado en backend.

Prerequisito resuelto: el picker usa `selectedItemId` como fuente primaria, manteniendo el índice solo como derivado visible. Esto evita que move-to-top, dedupe y drag & drop activen o editen el item incorrecto cuando cambie el orden o se carguen páginas nuevas.

## Done Cuando

- [x] Recopiar un item viejo no duplica fila innecesaria.
- [x] El item recopiado aparece arriba donde corresponde en recent.
- [x] Duplicados históricos consolidados por migración y protegidos con índice único.
- [x] Tests Rust cubren dedupe/move-to-top básico.
- [x] Tests Rust cubren migración de duplicados históricos.
- [x] Smoke visual cubre selección por id tras reordenamiento de historial.
- Drag & drop cambia posición persistida.
- Visual/manual check cubre drag con lista virtual.
