# Integración del lector interactivo

Corte aprobado por JP después de los experimentos de arquitectura. Implementación y límites: [lector del feed](../../../docs/topics/picker-history-reader.md). Contrato: [spec 019](../../../specs/019-picker-history-reader/spec.md). No reemplaza las capturas previas ni constituye instalación/aceptación.

## Medición release de la implementación

`native-10k.txt` y `native-100k.txt` contienen stdout completo de `storage::picker_reader::tests::integrated_reader_contention_benchmark`, ejecutado 2026-10-22 13:09:10–13:09:35 UTC. SQLite bundled 3.51.3, Rust release; tres bloques de 34 muestras por variante, dos warmups por bloque excluidos. Orden A/B alternado por ronda/bloque, sin builds/suites paralelos. Stderr separado vacío; ambas corridas pasan.

Se compara `AppStorage::history_search` legado con el **servicio integrado real** (`PickerHistoryReader::search`, canal, worker persistente, lector read-only y transacción). Primera página de 60 items sin conteos. Fondo: recaptura del mismo item con hash válido y retención ilimitada; el foreground empieza después de adquirir el mutex real de captura, sin sleep artificial. 10k/100k textos sintéticos, 100 tags, una relación por clip. DB y scripts/settings bajo el fixture temporal.

No hay Tauri IPC, ventana, hotkey, watcher, clipboard ni red. La sesión se registra antes del cronómetro; no es coste de arranque/registro ni percentil de aperturas reales. La carga es un solapamiento controlado, no su frecuencia observada en otra PC. El servicio no acelera la recaptura. No se extrapola a imágenes, retención limitada, recepción, memoria o CPU idle.

`summary.json` deriva p50/p95 nearest-rank, máximos, bloques, tiempo de fondo y solapamiento de las 102 muestras por variante. Reproducir sin sobrescribir capturas:

```bash
node evidencia/2026-10-21-picker-performance/reader-integration/summarize.mjs
```

Benchmark, desde el repo, con el harness release recién compilado y su manifiesto/DLL Windows GNU disponibles:

```powershell
cd src-tauri
cargo test --offline --release --lib --no-run
# Usar el ejecutable informado por este build, no un glob de binarios viejos.
$env:COPICU_STUDY_ITEMS = '100000' # repetir con 10000
& <test-executable> storage::picker_reader::tests::integrated_reader_contention_benchmark --exact --ignored --nocapture --test-threads=1
```

Los paths de DLL/manifiesto se recuperan en [el estudio nativo anterior](../native-storage-study/README.md#checks-y-reproducción). La prueba sólo crea perfiles nuevos, sin argumento para abrir uno existente. Si se guarda otra corrida, usar otro destino.

## Checks, build y límites

- Rust: `rust-tests.txt` conserva la suite completa final. Incluye diez tests nuevos de equivalencia/cursor/UDF, writer-lock independiente, cola/sesión, rollback/cancelación, snapshot durante commit y release antes de thumbnails. Benchmarks ignorados por defecto, ejecutados por separado.
- `client-tests.txt`: cuatro tests del cliente TS, registro compartido, generaciones, remount, rechazo/retry de registro y separación AI.
- `visual-tests.txt`: suite renderer con tres regresiones nuevas (dos viewports) y comprobación de que marcados conserva ruta anterior. Primera corrida: 587 pasan, 2 screenshots opt-in omitidos y un timeout de Inbox al no cargar un módulo JS por `net::ERR_NO_BUFFER_SPACE`. `browser-resource-error.json` conserva la evidencia acotada; **no fue un error de selector ni se parcheó el producto**.
- `visual-inbox-repeat.txt`: ese mismo caso, sin cambios de código, pasa 3/3 con un worker. Distinguir cobertura completa entre corridas de una corrida completa sin fallos de infraestructura.
- `tauri-build.txt`: build Tauri release `--no-bundle`, offline, en `src-tauri/target-reader-integration/release/copicu.exe`. Se usó target separado para no reemplazar el binario de la instancia dev anterior aún viva. No se instaló ni publicó.
- `verification.json` y `manifest.json`: checks, hashes, comandos y gate pendiente. Fuentes y binarios son del WIP, no un release 0.5.10 publicado.

No se ejecutó el smoke Win32 ni se reinició la app: se solicitó permiso específico para operar sólo la instancia sintética y UI visible, sin respuesta. Eso no concede permiso. No se tocó el proceso instalado ni se ejecutó paste/clipboard real. La siguiente sesión debe revalidar identidad antes de cualquier operación autorizada; no usar PID narrado como prueba suficiente.
