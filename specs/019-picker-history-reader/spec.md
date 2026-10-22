# Lector interactivo del picker

## Estado y autorización

JP aprobó continuar con el corte recomendado después del estudio nativo de storage. Este corte integra **un lector del feed**, no un actor de todas las operaciones. Retención queda para otro corte. No incluye instalación, publicación ni uso de perfiles privados para pruebas.

Implementado y distribuido/instalado localmente en [v0.5.11](../../docs/releases/v0.5.11.md), solicitado por JP tras feedback positivo en la build sintética. Se completaron tests, comparación release, 11 casos Win32 y 5 comprobaciones IPC; el paquete final y el binario instalado tienen además sus propios smokes sintéticos. Sin paste ni clipboard real en checks. Latencia nativa y otras PCs siguen pendientes. Estado recuperable: [lector](../../docs/topics/picker-history-reader.md).

Evidencia: [arquitectura](../../docs/topics/performance-architecture.md#corte-nativo-lecturas-y-contención), [muestras nativas](../../evidencia/2026-10-21-picker-performance/native-storage-study/README.md). Trabajo: [track 014](../../docs/tracks/014-performance-memory.md).

## Objetivo y alcance

La primera página y paginación del feed no deben esperar el mutex de captura/retención/sharing. Preservar resultado, conteos, filtros, cursores, matches, selección, máscara anti-stale y errores/retry. El lector es un servicio Rust con una conexión read-only WAL y un worker bloqueante propio, dormido cuando no tiene trabajo.

Fuera de alcance: diferir conteos, FTS, caches/snapshots persistentes, revisión global de datos, cambiar DTO de lista, retención, actor escritor, thumbnails bajo demanda, focus/paste, ventanas o stack. Búsquedas de scripts, acciones, lista de marcados y planificación AI conservan su ruta actual; no se cancelan por escribir en Search.

## Contrato de lectura

- Reusar el compilador y el constructor de página existentes, extraídos a un helper que recibe conexión; no copiar SQL ni cambiar semántica de LIKE/Unicode/regex/tags/folder/Inbox/marks.
- Abrir el lector sólo después de migrar la DB escritora. No ejecutar migraciones en el lector. Configurar UDF, foreign keys y busy timeout explícitos; no agregar dependencias.
- Una transacción de lectura abarca conteos, selección de filas y evidencia de matches. Commit/rollback y release del snapshot **antes** de leer thumbnails o serializar. No retener transacciones mientras navega el usuario.
- Una página es coherente al snapshot de esa operación, no un snapshot congelado de toda la sesión. Capturas posteriores siguen notificándose y reconciliándose por las reglas vigentes.
- Este corte no reutiliza páginas ni cachea resultados. Por eso no necesita fingir una revisión universal: `mutation_epoch` de Find no se usa para certificar frescura. Descriptor y generaciones frontend siguen validando intención, paginación y reapertura.
- Fallos de apertura, busy, SQL o rollback fallan explícitamente; no volver silenciosamente a la conexión escritora. El retry puede reabrir un lector fallido sin crear un pool.
- Archivos eliminados entre snapshot y lectura de thumbnail conservan el fallback existente, nunca contenido de otro ID/hash. Las acciones siguen resolviendo payload por ID en el host.

## Ownership, cola y cancelación

- El uso del lector se solicita mediante metadata opcional de `history_search`, validada para la superficie `main`. Sin metadata se conserva la API anterior.
- Una sesión de lector se registra una vez por montaje del renderer. ID monotónico emitido por Rust: una solicitud de una sesión vieja no cancela una sesión nueva ni recupera prioridad. No confiar en PID, reloj o UUID del clipboard.
- El frontend asigna generación monotónica antes de esperar el registro/IPC. El host rechaza generaciones obsoletas de cada clase, aunque el transporte entregue fuera de orden.
- Un único job activo; como máximo un pendiente de refresh y uno de página. Refresh nuevo reemplaza refresh anterior e invalida páginas anteriores; una página nueva no cancela un refresh en curso. Cola de lecturas, nunca de escrituras/capturas.
- Las requests del feed omiten contenido completo y tienen un límite explícito de 1 MiB serializado; exceso falla visible, no se trunca. Máximo de filas sigue siendo el del storage actual.
- Cancelación cooperativa por token de job y progress handler de SQLite; no usar `sqlite3_interrupt` sobre la conexión escritora ni una señal tardía sobre otro job. Comprobar cancelación también antes/después de SQL y entre thumbnails. UDF/I/O individual no es preemptivo.
- Reemplazo devuelve un error estable de supersesión, no un error SQL ni resultados parciales. El renderer lo trata como cancelación, manteniendo sus guards actuales y sin convertirlo en fallo recuperable de la búsqueda nueva.
- Al cerrar el servicio, cancelar activo, resolver pendientes y despertar al worker; sin polling en idle. La conexión muere con el worker. Tests esperan su salida antes de eliminar fixtures.

## Integración y compatibilidad

- Sólo los dos callers del feed (refresh y paginación) optan al lector. `loadMarkedItems`, el planner AI sin descriptor, catálogos y `get_history_items_preview` para filas retenidas quedan fuera; no prometer eliminación de toda espera en cualquier refresh.
- No tocar el handshake consumible `consume_picker_session_snapshot`, filtro fijado, guards de selección o generación, ni el orden primera página/paint/catálogos del corte 1.
- El registro del lector añade un IPC de inicialización, no uno por apertura; queda invalidado al remontar renderer. No cambiar los conteos visibles ni su dependencia actual de inicialización.
- Errores reales siguen mostrando retry; una cancelación obsoleta no pisa estado de la solicitud vigente. Pruebas de promesas invertidas, refresh/página concurrentes, hide/show y remount son obligatorias.

## Verificación antes de cerrar

1. Rust: igualdad completa con la ruta actual para queries/filtros/cursores/UDF, read-only y snapshot bajo escritura concurrente; rollback/retry y fin de transacción antes de thumbnails.
2. Scheduler: un activo/dos pendientes como máximo, sustitución y orden fuera de orden, página no cancela refresh, nueva sesión invalida vieja, cancelación no afecta al siguiente job ni al escritor, shutdown sin sleepers huérfanos.
3. Fixtures sólo temporales, también paths indirectos de settings/scripts. Imágenes sintéticas y borrado concurrente sin contenido real.
4. Renderer: callbacks del feed optan al lector; marcados/AI no planificado no lo hacen. La suite conserva navegación, filtro, selección, paginación y máscara; errores reales/cancelaciones se distinguen.
5. Comparación release de la integración bajo writer-lock retenido y carga sintética; registrar muestras/método, no llamar al resultado hotkey→paint. Medir por separado memoria/CPU/ventana cuando exista ese corte.
6. Build de producto y recarga/reinicio de instancia dev aislada según identidad y permisos actuales; instalada intacta. No interpretar suites como aceptación humana ni medir otra PC por inferencia.

## Rollback

Retirar la metadata opt-in del feed vuelve a la ruta original; cerrar el servicio elimina su conexión. Sin migración ni formato persistente nuevo. No revertir el WIP de tags/coalescing/overscan ni cambios ajenos.
