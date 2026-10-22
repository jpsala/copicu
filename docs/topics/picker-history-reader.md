---
title: Lector WAL del feed, snapshots y cola acotada
summary: Lector del feed integrado con cola y snapshots; build aislada reiniciada, 11 checks Win32 y 5 IPC pasan, con aceptación humana y retención pendientes.
keywords:
  - picker reader
  - WAL
  - mutex
  - snapshot
  - cancelación
  - lectura interactiva
  - HISTORY_SEARCH_SUPERSEDED
---

# Lector interactivo del feed

Implementado en el WIP bajo el pedido de JP de continuar con el corte recomendado. [Spec](../../specs/019-picker-history-reader/spec.md), [estudio arquitectónico](performance-architecture.md), [evidencia de integración](../../evidencia/2026-10-21-picker-performance/reader-integration/README.md), [track](../tracks/014-performance-memory.md). No instalado/publicado ni aceptado por JP. La optimización de retención es otro corte y **no está implementada aquí**.

## Ruta y consistencia

`src/shared/pickerHistoryReader.ts` registra una sesión host una vez por cliente renderer; `src/main.tsx` usa el cliente sólo para refresh y paginación. `history_search` conserva la API anterior sin metadata. Con `pickerRead`, `lib.rs` exige superficie `main` y despacha a `storage::picker_reader::PickerHistoryReader`.

Un worker nativo, una conexión read-only, idle por Condvar sin polling. Se abre en el worker después de migrar el escritor; UDF/foreign keys configurados y busy timeout 250 ms. No se ejecutan migraciones ni escrituras desde ese lector, ni se vuelve silenciosamente al escritor ante fallo.

`AppStorage::history_search_on_connection` es el constructor SQL/DTO común. El lector usa una transacción para conteos, página y matches; retira el progress handler y hace commit/rollback **antes de thumbnails y serialización**. Un thumbnail borrado después del snapshot queda ausente; no se reemplaza con otro payload. Las acciones siguen resolviendo IDs en host.

La coherencia es por página/operación, no un historial congelado durante toda la sesión. No hay cache nuevo ni conteo diferido. `mutation_epoch` de Find no certifica frescura y no se reutiliza: descriptor/generaciones del renderer siguen validando intención/reapertura, mientras la transacción garantiza consistencia SQL. Capturas posteriores se reconcilian por los eventos y refresh existentes.

## Límites de cola y cancelación

- Rust asigna sesión monotónica; el cliente asigna generación antes de esperar registro/IPC. Sesión vieja o generación obsoleta no cancela una nueva.
- Un activo y hasta dos pendientes: último refresh y última página. Refresh reemplaza refresh e invalida páginas anteriores; página no cancela refresh. No son colas de captura/escritura.
- Request del feed: sin contenido completo, máximo 1 MiB serializado; exceso falla explícitamente. Se conserva el límite de filas del storage.
- Cancelación cooperativa con flag por job y progress handler cada 1.000 instrucciones SQLite, más checks entre etapas/thumbnails. Se remueve antes de cerrar la transacción y de reutilizar conexión; no se interrumpe el escritor ni el job siguiente. Una UDF o lectura de archivo individual no es preemptiva.
- `HISTORY_SEARCH_SUPERSEDED` es control de supersesión, no error SQL/retry. El renderer mantiene guards propios; no se confía sólo en cancelar backend.
- Error de registro permite registrar de nuevo en Retry; fallo de abrir conexión permite reintentar el próximo job. Limpieza fallida descarta esa conexión. Cerrar el servicio resuelve pendientes, cancela activo y despierta al worker; no bloquea el destructor UI en I/O individual. El worker termina cooperativamente y cierra su conexión.

## Qué sigue en la ruta anterior

Lista de marcados para acciones, scripts, AI sin descriptor que requiere planificación, catálogos y `get_history_items_preview` de filas retenidas no optan al servicio. No se prometió eliminar toda espera de cualquier refresh: la renovación de filas retenidas después de scroll aún puede usar el escritor. Find conserva su lector/contratos propios.

No cambiaron filtros, cursor, conteos visibles, máscara anti-stale, selección, contrato de sesión consumible ni foco/paste. Tampoco se adoptó un actor escritor, pool genérico, FTS, cache o proyección materializada.

## Resultado comprobado y gates abiertos

Comparación release de la **implementación integrada**, no del wrapper experimental anterior: SQLite bundled 3.51.3, 102 muestras por variante/tamaño, bajo recaptura real del mismo item con retención ilimitada. Primera página sin conteos, p95:

| Dataset | Ruta compartida | Servicio integrado |
| --- | ---: | ---: |
| 10k / 100 tags | 8,43 ms | 0,56 ms |
| 100k / 100 tags | 84,96 ms | 0,78 ms |

Son tiempos de storage+cola/worker propios condicionados a solapamiento con mutex escritor, **no IPC ni hotkey→input/feed**. El escritor sigue haciendo el mismo trabajo; los datos no prueban mejora de memoria/idle ni la frecuencia de esa interferencia en la otra PC. Muestras, checks y reproducción en la evidencia.

Pasan tests Rust de equivalencia/UDF/cursor, read-only, snapshot durante escritura, cancelación/rollback, cola, sesión vieja, errores y release antes de thumbnails; unit tests del cliente y regresiones renderer. Un caso renderer tuvo fallo de cargar JS `ERR_NO_BUFFER_SPACE` en la corrida paralela y pasó 3/3 aislado, sin parchear producto para ocultarlo.

Con permiso explícito de JP se detuvo sólo la instancia sintética anterior, revalidada por exe/CreationDate, y se reinició la build `src-tauri/target-reader-integration/release/copicu.exe`. [Smoke nativo](../../evidencia/2026-10-21-picker-performance/reader-integration/native-smoke/README.md): **11 casos Win32 y 5 verificaciones IPC pasan**, incluido C0 y los gates del lector por superficie/generación. Se dejó corriendo con 10k textos/100 tags sintéticos, `Ctrl+Shift+F10`, captura/AI/updater apagados; identidad operativa en el track, no asumir vigencia del PID. Instalada intacta, sin paste ni clipboard real. Gate técnico de reinicio/smoke cerrado; **aceptación humana, hotkey→input/feed y retención siguen pendientes**.
