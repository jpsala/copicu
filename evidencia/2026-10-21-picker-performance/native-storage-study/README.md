# Storage nativo: lectores, conteos y contención

Continuación autorizada por JP con «ok», ejecutada el **2026-10-22**. Es un corte de investigación/instrumentación, no adopción de otra arquitectura. Conclusiones: [arquitectura de rendimiento](../../../docs/topics/performance-architecture.md#corte-nativo-lecturas-y-contención). Estado: [track 014](../../../docs/tracks/014-performance-memory.md).

## Qué se ejecutó

Rust 1.89.0 GNU, `cargo test --offline --release --lib --no-run`; harness optimizado, SQLite bundled **3.51.3**, features default. Se invoca `AppStorage::history_search`/`insert_text` real; no se inicia Tauri, WebView, watcher, clipboard ni red. El candidato clona AppStorage **sólo dentro del test**, reemplaza su conexión por read-only independiente, registra los UDF y usa BEGIN/COMMIT alrededor de la llamada. No hay routing nuevo en comandos de producto ni migración nueva.

Instrumentación `cfg(test)` en `storage.rs` y `storage/performance_study.rs`: collector thread-local opt-in, nombres fijos, tiempos/contadores sin payload. Mide total, espera/hold de mutex, count/page/matches/thumbnails, total de captura y retención. Serialización se cronometra aparte. Los spans anidados **no se suman** a total. No mide cola de `spawn_blocking`, IPC, UI ni foco.

- `native-10k.txt`, `native-100k.txt`: stdout completo del harness con registros `NATIVE_STUDY`, todas las muestras y resultado de test. Ambos terminaron con 1 passed/0 failed; stderr separado vacío. Corridas secuenciales 11:23:40→11:24:51→11:37:40 UTC, sin builds/suites simultáneos; no se controló toda la carga del sistema.
- `summary.json`: derivación de esas dos capturas. p50/p95 nearest-rank sobre **102 muestras por variante** (3 bloques × 34), más distribución por bloque. Dos warmups por bloque; modos alternados por ronda/bloque. Los warmups no se guardaron como muestras.
- `measured-harness.rs`: snapshot exacto del módulo al medir esas capturas. El código mantenido vive en `src-tauri/src/storage/performance_study.rs`; este snapshot es evidencia, no otra fuente editable.
- `connection-controls-100k.txt`, `connection-controls-summary.json`: control factorial posterior; nueve muestras por modo/fase, sólo mediana/máximo, no p95 estable. Compara conexión original/read-only/read-write nueva con/sin transacción explícita, antes/después de un commit de settings. Conserva planes/PRAGMAs efectivos. Rotación/reversión del orden de modos; las dos fases son secuenciales.
- `summarize.mjs`: reproduce resúmenes a stdout, sin modificar las capturas. `--controls` selecciona el control factorial.
- `manifest.json`: hashes, versiones de harness, checks y límites. El ejecutable del primer corte de producto conserva su hash; no se operó su proceso.

## Corpus y alcance

Cada corrida crea y elimina sólo su directorio temporal nuevo. 10k/100k textos de ~560 caracteres, 100 tags, una relación por clip, Unicode en el item más viejo, sin imágenes ni carpetas. Queries: vacía, común en todos, único match más viejo y ausente; con/sin conteos. Se verifica cantidad de filas/conteos. No se midió nueva captura distinta en cada ronda: el escritor **recaptura el mismo item existente** con hash válido.

Contención: se notifica después de adquirir el mutex real del trabajo de fondo y entonces se inicia la primera página vacía de 60 items, sin conteos. No hay sleeps artificiales de hold. En las 102 muestras de cada escenario, el inicio foreground precedió al fin del hold de fondo. Es una prueba de interferencia **condicionada a solapamiento**, no una distribución de aperturas de usuario ni la frecuencia del problema en la otra PC.

Trabajos de fondo: búsqueda ausente con conteos; recaptura con retención ilimitada; recaptura con límite igual a N (todos los items Root elegibles, sin agregar uno nuevo). Se conservan tiempos del escritor, igualdad completa de DTO/cursor después de quiescencia y checkpoints PASSIVE al final de cada bloque. El lector rápido no acelera la retención: sólo deja de esperar su mutex. Los archivos WAL mantienen el high-water de la siembra (~10/105 MB), aunque los frames activos queden checkpointed; tamaño físico no prueba backlog ni fuga.

El wrapper experimental mantiene la transacción hasta devolver `history_search`. Aquí no hay thumbnails: **no copiar ese wrapper a producción**, donde el snapshot debe cerrarse antes del I/O de blobs. Tampoco prueba revisión de datos/cache, invalidación de sesiones, cancelación, fairness, recepción compartida, imágenes, deletes concurrentes, crash recovery, CPU/idle o memoria agregada.

## Control de atribución y aislamiento

El primer contraste mezcla dos cambios: conexión independiente y transacción explícita. Además hubo gran diferencia serial en scans. El control factorial **refuta atribuir un acelerón SQL intrínseco a read-only o a BEGIN**: los seis modos usan el mismo plan/PRAGMAs medidos, pero qué conexión es rápida cambia entre fases; BEGIN no elimina el patrón. Causa residual de estado de conexión/pager/caché no aislada. Usar la espera de mutex observada como evidencia de aislamiento, no prometer que cualquier scan será 3× más rápido.

El harness actual fija `settings.scripts.folder_path` dentro del fixture antes de llamar APIs de settings. En las capturas principales v1, esas APIs ejecutaron `create_dir_all` sobre el default de scripts, ya existente (birthtime 2026-06-05, mtime 2026-10-16 según comprobación **sólo de metadata**); no se leyó su contenido ni se modificó la DB instalada. Se conserva v1 sin reetiquetarlo como aislamiento v2. El control y el test de contrato usan v2; la matriz de 102 muestras **no se repitió con v2**. Regla reusable: aislar también los paths indirectos de settings, no sólo la DB.

## Checks y reproducción

Pasan el test nuevo de equivalencia/read-only/snapshot/rollback/UDF/cursor, seis regresiones `storage::tests::history_search*` y recaptura sin duplicados. El test nuevo también pasó tras aislar scripts. Pasaron smoke sintético y los dos tamaños de benchmark, además del control factorial. No se repitió la suite completa ni pruebas de renderer/Win32: no hubo cambio de runtime de producto.

Desde `src-tauri`, sin instalar herramientas:

```powershell
$artifacts = cargo test --offline --release --lib --no-run --message-format=json
if ($LASTEXITCODE -ne 0) { throw 'Build failed' }
$exe = $artifacts | ForEach-Object { $_ | ConvertFrom-Json } |
  Where-Object { $_.reason -eq 'compiler-artifact' -and $_.profile.test -and $_.executable } |
  Select-Object -Last 1 -ExpandProperty executable
if (-not $exe) { throw 'No fresh test executable' }
# Windows GNU de esta PC: manifiesto ya disponible, sin ejecutar toda la suite.
Copy-Item target-codex-test/test-manifest/common-controls-v6.manifest "$exe.manifest"
$env:PATH = "$(Resolve-Path target/release);$env:PATH"
& $exe storage::performance_study::reader_equivalence_and_snapshot_contract --exact --test-threads=1
$env:COPICU_STUDY_ITEMS = '100000' # repetir con 10000
$env:COPICU_STUDY_ROUNDS = '34'
& $exe storage::performance_study::native_readers_and_counts --exact --ignored --nocapture --test-threads=1
# Factorial: usar 9 rondas y el nombre native_connection_controls.
```

Ese comando compila el harness mantenido **v2**. Si faltan DLL/manifiesto, recuperar las instrucciones de [apertura](../../../docs/topics/picker-opening-performance.md#reproducción-y-aceptación); no instalar ni ejecutar un binario viejo silenciosamente. Guardar nuevas corridas en destinos distintos, nunca sobrescribir estos archivos. Restaurar variables del shell al terminar si se reutiliza.

Desde la raíz:

```bash
node evidencia/2026-10-21-picker-performance/native-storage-study/summarize.mjs
node evidencia/2026-10-21-picker-performance/native-storage-study/summarize.mjs --controls
```
