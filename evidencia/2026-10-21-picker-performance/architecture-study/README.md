# Estudio de arquitectura (sin cambio de producto)

Origen: investigación pedida por JP después de la iteración 1, 2026-10-21. Conclusiones y alternativas en [arquitectura de rendimiento](../../../docs/topics/performance-architecture.md); estado en [track 014](../../../docs/tracks/014-performance-memory.md). No sustituye baseline ni `iteration-01/`, y no es una segunda implementación.

## Fuentes

- `sql-probe.mjs`: experimento independiente con Node 24 / `node:sqlite`, sin paquetes nuevos, app, watcher, clipboard o red. Crea DB en memoria y un archivo WAL dentro de un directorio temporal nuevo; elimina sólo ese directorio al cerrar. No acepta rutas de perfiles.
- `sql-results.json`: salida completa, versiones, CPU/OS sin identidad de máquina, hashes del código, SQL/planes y todas las muestras. SQLite de Node **3.53.0**, no bundled **3.51.3** de la app. Esquema extraído de las migraciones locales, no copia de historial.
- `public-sources.json`: extractos derivados de páginas primarias SQLite, con URL, fecha y hash HTML de la respuesta. No son páginas archivadas completas. Se consultaron por GET públicos sin datos privados; ninguna página se ejecutó como código.
- `manifest.json`: hashes de archivos del estudio y fuentes de código pertinentes. Los siete hashes de código de `iteration-01/manifest.json` se revalidaron iguales antes de documentar conclusiones; no se repitieron suites de producto.

## Método y límites

SQL: 10k/100k textos de ~560 caracteres, sin tags/carpetas/contexto poblados; sólo el item más viejo lleva `oldestneedle`. Predicado plain de siete campos, `LIKE ... ESCAPE`, proyección/orden extraídos del fuente; SELECT con límite 61. Dos calentamientos y nueve rondas, alternando orden de casos. Comparar dentro de esta corrida, no emparejar con tiempos AppStorage o renderer. No se ejecutaron builds/suites durante la medición; no se controló toda la carga del sistema.

Casos: término común, único match más viejo y ausente; página sola, conteo solo y total+conteo+página. Omite parser/compilador Rust, attach_search_matches, thumbnails, DTO Rust, IPC y UI. Los resultados/planes muestran que quitar conteos no elimina scans para consultas raras/ausentes; no acredita demora del mismo tamaño en la app.

Proyección: 61 textos recientes de 250.020 caracteres. Tabla temporal de investigación con preview/longitud unida por PK; mismas columnas y comprobación de igualdad. Mantenimiento después de editar se demuestra manualmente, **no se implementa una migración ni maintenance productivo**. Build/lecturas son en memoria; faltan escritura continua, disco y payload de metadata/contexto grandes.

WAL: tres commits intercalados determinísticamente entre escritor y lector read-only en un archivo nuevo. Comprueba visibilidad cambiante sin transacción, snapshot estable con transacción y progreso retenido/liberado de checkpoint. `wal_autocheckpoint=0` sólo en ese fixture para inspección determinista. No es benchmark de mutex, workers, throughput ni latencia concurrente; no propone cambiar checkpoints de producción.

Reproducción desde la raíz, sólo si Node 24 ya está disponible:

```bash
node --check evidencia/2026-10-21-picker-performance/architecture-study/sql-probe.mjs
node evidencia/2026-10-21-picker-performance/architecture-study/sql-probe.mjs
```

La salida va a stdout. Si se conserva una repetición, usar un archivo/carpeta nuevo; no sobrescribir esta corrida. Con nueve muestras no se declara p95. No hubo C0, paste, medición de procesos de app, instalación ni aceptación humana en este estudio.
