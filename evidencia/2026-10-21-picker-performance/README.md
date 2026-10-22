# Picker: baseline y comparaciones

Pedido de JP: conservar los tiempos antes de optimizar y comparar cada corte. Origen: benchmarks locales sintéticos de la investigación de 2026-10-21 sobre `8ab41ce` / 0.5.10. No contienen historial real, queries de usuario, credenciales ni capturas de pantalla.

- `baseline/manifest.json`: fecha de congelado, hashes del código y de los artefactos antes de editar producto. No sobrescribir esta carpeta en iteraciones posteriores.
- `baseline/native-*.jsonl`: salida original completa de AppStorage release / SQLite 3.51.3: todas las muestras cronometradas, mediana, máximo, bytes y última serialización. Una ejecución inicial de calentamiento no se cronometra en la salida.
- `baseline/renderer.txt`: mediciones originales resumidas y último trace de IPC por escenario. Las muestras individuales de esa primera corrida no estaban conservadas; no reconstruirlas de las medianas.
- `baseline/renderer-baseline-repeat.txt` y `baseline/picker-*.json`: repetición **antes de cambios de producto**, ahora con las seis muestras completas por escenario, incluidas llamadas/tiempos. Usar esta repetición como comparación emparejada con el después.
- `baseline/renderer-tail.txt`: probe usado, dependiente de los fixtures/helpers iniciales de `tests/visual/shell.spec.ts` de esa revisión. El switch experimental de overscan no estaba activo en la repetición baseline.
- `baseline/sql.log` se conserva localmente; `baseline/sql.txt` conserva los mismos bytes en extensión versionable. `sql-results.json` / `sql-probe.mjs` incluyen originales y candidatos SQL, distinguibles por nombre; son microbenchmarks Node/SQLite 3.53.0, no tiempos de la app.
- `overscan-experiment/`: experimento anterior que sólo interceptaba el bundle en Chromium para cambiar 24→6; no es la implementación definitiva ni debe mezclarse con el baseline.
- `iteration-01/`: implementación real, sin interceptar bundle; mismo benchmark nativo y probe renderer. `comparison.json` empareja con la baseline repetida. `verification.json` resume checks y hash de build; `native-window-checks.json` es el original del oracle Win32 con procesos/ventanas exclusivamente sintéticos.
- [`architecture-study/`](architecture-study/README.md): investigación posterior sin cambio de producto. SQL sintético de búsquedas comunes/raras/ausentes, proyección de preview/longitud y contrato de snapshots WAL; muestras, hashes y fuentes primarias. Node/SQLite 3.53.0, no AppStorage/IPC ni una iteración 2 publicada.
- [`native-storage-study/`](native-storage-study/README.md): continuación aprobada, ejecutada 2026-10-22. AppStorage release/SQLite bundled, instrumentación sólo de test, 10k/100k y 102 muestras por variante; compara lector independiente, conteos y contención. Control factorial y límites de atribución; no UI/IPC ni arquitectura nueva en producto.
- [`reader-integration/`](reader-integration/README.md): primer lector del feed integrado después de aprobación; spec 019, checks y comparación release del servicio real. Conserva la verificación previa a operar la app. La etapa posterior [`native-smoke/`](reader-integration/native-smoke/README.md) cierra reinicio/smoke con autorización actual: 11 casos Win32 y 5 IPC pasan, build nueva corriendo aislada; sin paste ni instalada.

Método y límites: [apertura del picker](../../docs/topics/picker-opening-performance.md). Renderer: build minificado, backend simulado, 240 clips, 900×620, CPU 1×/4×, handshake de sesión simulado de 20 ms, seis muestras y primera descartada al resumir. No mide Win32 ni presentación del compositor. Backend: perfiles temporales nuevos, una relación tag/clip, cinco muestras calientes, ningún proceso de la app iniciado. Las pruebas se ejecutan sin builds/suites concurrentes.

Cada corte posterior debe ir en otra carpeta con su identificación, configuración, resultados completos y comparación. Estos artefactos no autorizan publicación, instalación ni acceso al perfil real.

## Publicación de fuentes

El release conserva en Git métodos, documentación, muestras JSON/JSONL sintéticas y resúmenes revisados. `.gitignore` mantiene locales los logs de ejecución y capturas operativas con perfiles/PIDs/ventanas; no se borraron ni alteraron sus originales. Los manifests de investigación pueden referir a esas fuentes locales por hash: no asumir que todos sus artefactos están en un clon público. Los resúmenes derivados siguen disponibles y las recetas permiten producir otra corrida sintética en un destino nuevo.
