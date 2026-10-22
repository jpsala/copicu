---
title: Apertura del picker, ruta crítica y mediciones
summary: Baseline y corte de apertura medidos en el WIP 0.5.10 y distribuidos en v0.5.11; tags, coalescing, catálogos y overscan, con medición de otra PC pendiente.
keywords:
  - picker lento
  - apertura
  - render
  - tags
  - overscan
  - latencia
  - benchmark
---

# Apertura del picker

Auditoría del 2026-10-21 sobre `8ab41ce`, versión fuente 0.5.10, por demora de la lista en otra PC. No identifica todavía la causa exacta en esa PC: faltan versión instalada, tamaño/composición del historial y distinguir primera apertura de reaperturas.

**Conclusión:** había costes evitables antes y después de SQL. El primer corte está comparado abajo como WIP 0.5.10; después se distribuyó e instaló junto al lector WAL en [v0.5.11](../releases/v0.5.11.md). La consulta de tags era el mayor riesgo de escala medido; la primera página ya usaba un índice apropiado.

Política general: [rendimiento y memoria](performance-and-memory.md). Trabajo y próximo corte: [track 014](../tracks/014-performance-memory.md). Fuentes congeladas antes de editar producto y resultados completos: [evidencia de rendimiento](../../evidencia/2026-10-21-picker-performance/README.md).

## Iteración 1: implementación y comparación

Pedido actual de JP: guardar tiempos, implementar, reiniciar una build nueva y probar/iterar. Baseline congelado con hashes y muestras antes de modificar producto. Las muestras individuales del renderer de la primera investigación no se conservaron; por eso se repitió **antes del cambio** y se congeló esa corrida completa para la comparación emparejada. No mezclar sus medianas con las primeras tablas históricas.

Cambios vigentes:

- `query_tag_summaries` recorre tags antes de relaciones mediante CROSS JOIN y el índice existente; conserva DISTINCT y predicado LIKE. Regresión Rust contrasta con la consulta anterior sobre tags superpuestos, jerarquía, Unicode, comodines y tags sin clips.
- `list_folders` y `root_item_count` pasan a workers bloqueantes, con los mismos gates por superficie.
- Show/focus/visibility comparten una operación en vuelo por generación. Un hide seguido de nueva apertura puede reemplazar la anterior; un snapshot consumido no pierde la captura pendiente ni pisa otra de generación superior.
- Snapshot y primera página preceden a tags/carpetas/feedback, con oportunidad de commit/paint antes de ese trabajo auxiliar. Se conservan máscara anti-stale, retry, filter lock y guards de selección/query. Feedback consumido conserva su toast si se oculta mientras llega.
- Overscan 6. Catálogos planos y slugs iguales preservan identidad para evitar renders/reconfiguración de completions innecesarios. La paginación sigue basada en cursor; una fila fuera de viewport no tiene que estar montada para demostrar que se cargó la página.
- El toggle nativo del picker ya no duerme 90 ms; conserva el despacho fuera del callback y luego al hilo UI. No se tocaron delays de paste, compound shortcuts ni otras acciones.

Comparación de medianas con APIs nativas de storage release y los mismos datasets:

| Clips/tags | Tags antes | Tags después |
| --- | ---: | ---: |
| 10k / 100 | 102,95 ms | 1,71 ms |
| 10k / 500 | 515,23 ms | 22,33 ms |
| 100k / 100 | 1.055,35 ms | 9,60 ms |
| 100k / 500 | 5.432,06 ms | 28,86 ms |

Renderer CPU 4×, evento show único, baseline repetida frente a implementación sin interceptar bundle:

| Contenido | Reveal antes → después | Última mutación antes → después |
| --- | ---: | ---: |
| Texto corto | 250,1 → 122,6 ms | 382,2 → 229,0 ms |
| Texto largo | 263,2 → 112,2 ms | 406,5 → 201,1 ms |
| Imagen | 265,6 → 98,8 ms | 407,1 → 183,4 ms |

Con las tres señales concurrentes, todas las muestras pasaron de tres consultas por apertura a una (historial y tags). En CPU normal y 4× hay muestras completas y trazas en `iteration-01/picker-*.json`; `comparison.json` incluye todos los casos nativos, no sólo tags. No sumar estas cifras de mecanismos distintos para prometer un tiempo end-to-end.

Verificación: 424 Rust pasan (1 benchmark legacy ignorado), 582 renderer pasan (2 screenshots release opt-in omitidos), seis probes post-cambio y 11 casos Win32 reales, incluido C0 externo → hotkey → escritura global visible. Paste no se ejecutó para no modificar el clipboard. Build Tauri release `--no-bundle` comprobada. Para una app standalone, usar Tauri build o una configuración built-dev sin devUrl; `cargo build --release` solo no garantiza el frontend embebido.

Se dejó una build aislada con 10k clips/100 tags sintéticos, hotkey `Ctrl+Shift+F10`, captura/AI/updater desactivados. No reemplaza la instalada ni usa su historial. La aceptación humana y la comparación en la otra PC siguen pendientes; el oracle Win32 verifica funcionamiento, no p50/p95 de apertura.

## Qué significa listo

Separar: ventana visible, Search recibe teclado, primeras filas frescas visibles, viewport estabilizado y previews visibles decodificadas. No esperar a montar todo el historial: las páginas posteriores deben seguir bajo demanda. Una medición `window.show.done` no acredita lista lista ni teclado nativo.

## Recorrido de la baseline

Describe `8ab41ce`, antes del corte anterior. Referencias de línea aproximadas de esa revisión; los símbolos son el punto de recuperación estable.

| Etapa | Implementación | Coste o dependencia |
| --- | --- | --- |
| Hotkey | `src-tauri/src/lib.rs`, `handle_global_shortcut`, `spawn_toggle_main_window` (~5535, 5825) | Thread nuevo y espera fija `NATIVE_WINDOW_TASK_DELAY=90 ms` antes de despachar al hilo UI. No es tiempo de SQL. |
| Mostrar | `show_main_window_with_focus` (~5045) | Recuerda ventana anterior, restaura geometría en monitor del cursor, show, unminimize, capas, foco y fallback nativo. Emite `picker/shown` al final sólo si estaba oculta. |
| Registro nativo | `diag_log`, `src-tauri/src/diagnostics.rs::log_event` | Varias escrituras síncronas por show: mutex, metadata de archivo, open/append. Posible coste de disco/antivirus, no medido aquí. |
| Sesión del renderer | `src/main.tsx::refreshOnFocus` (~5928) | Espera `isVisible`; lanza tags/carpetas/root; espera snapshot de sesión; espera feedback de carpeta y, si existe, otra lista de carpetas; después pide historial. |
| Eventos | Mismo efecto, listeners de `focus`, `visibilitychange`, `picker/shown` | Tres entradas independientes, sin coalescer una reapertura. Los guards contra resultados viejos no cancelan SQL ya iniciado. |
| Historial | `refreshHistory` (~3411), `lib.rs::history_search` (~1192) | Página de 60, `includeContent=false`, `includeCounts=true`, `explain=true`. Comando usa `spawn_blocking`. |
| SQLite | `storage.rs::history_search` (~2261), `storage/search.rs` | Una conexión compartida bajo mutex; conteos antes de página, SELECT de 61 para detectar siguiente cursor, evidencia de matches si corresponde. |
| Imágenes/IPC | `attach_thumbnail_data_urls` (~4066) | Libera mutex antes de leer thumbnails, pero lee/base64 de todos los thumbnails de la página antes de devolverla. Serializa DTO completo. |
| Aplicación | `refreshHistory`, `markPickerHidden`, `reopenReadyGeneration` | Reset/selección/snapshot y retirada de máscara sólo tras respuesta válida de la sesión. La máscara evita mostrar/activar contenido obsoleto. |
| Render | `useVirtualizer` (~1591), `TextPreview` (~9644), `MarkdownPreview` | Overscan 24 por lado. App vuelve a recorrer las filas al cambiar otros estados. Texto detecta overflow en layout effect + ResizeObserver y solicita remeasure en rAF; Markdown se analiza también para decidir el tipo. |
| Estabilización | `mutateRowLayout` (~4693), `measureImageRow`, efectos de selección | Medidas, scroll y carga de imágenes pueden cambiar layout después del commit. Prefetch usa última fila virtual, umbral 24. |

`list_tags` sí usa worker, pero toma el mismo mutex de `AppStorage` que historial. Lanzarlo sin `await` no elimina contención. `list_folders` y `root_item_count` siguen siendo comandos síncronos y toman ese mutex: pueden esperar detrás del trabajo pesado desde el borde interactivo. Es un riesgo de bloqueo adicional, no una nueva causa única demostrada de hangs.

El picker permanece caliente. Bundle/imports y el debounce inicial de 120 ms son relevantes para arranque/montaje, no equivalen al coste de cada hotkey. Settings, AI Output y otras ventanas ya tienen lazy loading; no proponerlo otra vez como fix de reapertura. El bundle visual de esta auditoría tiene aproximadamente 346 kB de entry, 400 kB de CodeMirror, 290 kB de Mantine y 354 kB de CSS sin comprimir; esos tamaños no demuestran por sí solos un cuello caliente.

## Mediciones de la baseline nativa de storage

Benchmark reusable: [`bench_picker_open.rs`](../../src-tauri/examples/bench_picker_open.rs). Compilado desde esta revisión en release, Rust GNU 1.89.0, SQLite bundled 3.51.3. Crea exclusivamente un perfil temporal nuevo, inserta datos sintéticos, usa APIs reales de `AppStorage` y elimina sólo su directorio al salir. No inicia app, watcher, red ni hotkey.

Mediana de cinco ejecuciones después de una de calentamiento, sin builds/suites concurrentes. Cada clip tiene un tag normalizado; tags planos, texto de unos 560 caracteres; sin carpetas ni thumbnails. Esto **no mide IPC, esperas concurrentes de mutex, WebView2, disco frío ni la PC reportada**.

| Clips | Tags | Primera página sin filtro | `list_tags` |
| ---: | ---: | ---: | ---: |
| 10.000 | 100 | 0,21 ms | 103 ms |
| 10.000 | 500 | 0,20 ms | 515 ms |
| 100.000 | 100 | 0,22 ms | 1.055 ms |
| 100.000 | 500 | 0,21 ms | 5.432 ms |

Otros costes observados:

- Buscar `ordinary`, presente en todos los textos: 6,84 ms con conteos frente a 0,39 ms sin ellos en 10k; 64,73 ms frente a 0,40 ms en 100k/100 tags. Una búsqueda con pocos matches tiene otro coste; no extrapolar estas cifras a cualquier filtro.
- `root_item_count`: ~0,19 ms / 1,81 ms para 10k/100k. Marcados: ~0,20 / 2,01 ms. `list_folders` con cero carpetas no caracteriza árboles grandes.
- Sustituir los 61 clips más recientes por texto de unos 250.000 caracteres sube la página a ~14,5–15 ms. Aunque el DTO trunca a 2.000 caracteres, el SELECT evalúa `LENGTH(text)` y dos `SUBSTR`.
- JSON de página real: ~103 kB para texto corto; ~276 kB para previews largos. La serialización aislada observada fue submilisegundo, pero no se midió transporte/parsing de IPC.

### Por qué tags escala mal

`storage.rs::query_tag_summaries` (~4764) ejecuta un conteo correlacionado por cada tag. En el plan observado recorre todos los vínculos clip-tag para cada tag, con lookup del tag del vínculo. No hace falta que el picker esté filtrado por tags para pagar este coste.

Un microbenchmark adicional, con las 19 migraciones locales y SQL extraído del código, usó Node 24.16.0 / SQLite 3.53.0 en memoria. Forzar el recorrido de tags descendientes antes de vínculos mediante `CROSS JOIN` aprovechó `idx_clipboard_item_tags_tag_id`, ya existente:

```sql
FROM tags hierarchy_tags
CROSS JOIN clipboard_item_tags hierarchy_links
  ON hierarchy_links.tag_id = hierarchy_tags.id
WHERE hierarchy_tags.slug = tags.slug
   OR hierarchy_tags.slug LIKE tags.slug || '/%'
```

En esa prueba de SQL completo, original → candidato: 103 → 1,65 ms (10k/100); 522 → 23,7 ms (10k/500); 1.152 → 9,71 ms (100k/100); 6.101 → 34,9 ms (100k/500). Resultados iguales en los fixtures planos. En la auditoría inicial era un candidato pendiente de validar en SQLite bundled, tags padre/hijo, clips con varios tags, DISTINCT, case-fold/Unicode y semántica de LIKE. La iteración 1 añadió esa regresión y la medición nativa; no confundir los números de este microbenchmark con la tabla nativa ni con una mejora end-to-end publicada.

El plan de la primera página sin filtro usa `idx_clipboard_items_recent_activity`, sin ordenar toda la tabla. No agregar otro índice de recencia ni FTS como primer remedio.

## Mediciones de la baseline del renderer

Chromium headless, build minificado visual con diagnósticos/polling debug apagados, viewport 900×620 y backend simulado del suite existente. 240 items; seis reaperturas por combinación, primera descartada. CPU normal y throttling CDP 4×; no representa exactamente un modelo de PC.

Se emitió hide, se esperó 120 ms, se preparó reset de sesión con espera **simulada de 20 ms**, y se emitió show. Se midió retirada de máscara al siguiente rAF y última mutación del feed antes de 120 ms quietos con imágenes completas. No equivale a presentación por compositor ni a entrada nativa. Las imágenes eran thumbnails sintéticos repetidos y calientes, no un benchmark de decode/disco de imágenes diferentes.

| Contenido | Filas montadas / visibles | Reveal CPU normal | Reveal CPU 4× | Última mutación CPU 4× |
| --- | ---: | ---: | ---: | ---: |
| Texto corto | 32 / 8 | 42 ms | 288 ms | 435 ms |
| Texto largo | 29 / 5 | 44 ms | 296 ms | 456 ms |
| Imagen | 27 / 3 | 43 ms | 338 ms | 515 ms |

Experimento aislado: interceptar el JS **sólo en el browser del probe**, reemplazando `overscan:24` por `overscan:6`; no modificar el fuente ni el dist. Misma prueba:

| Contenido | Filas montadas / visibles | Reveal CPU 4× | Última mutación CPU 4× |
| --- | ---: | ---: | ---: |
| Texto corto | 14 / 8 | 201 ms | 315 ms |
| Texto largo | 11 / 5 | 195 ms | 314 ms |
| Imagen | 9 / 3 | 172 ms | 270 ms |

El experimento redujo trabajo sin perder funcionalidad en ese caso. La iteración 1 adoptó 6 después de las regresiones de navegación, Find remoto, selección y paginado; scroll/hardware reales siguen sujetos a prueba humana. Hay trabajo fuera de las filas: tags/folders nuevos causan renders de App y reconfiguración de completions de QueryEditor aun si los valores no cambiaron. Memorizar/evitar updates iguales puede ayudar; medirlo por separado.

### Duplicación reproducida

Emitiendo `picker/shown` + `focus` + `visibilitychange` en una reapertura, todas las muestras observadas hicieron **3 `history_search`, 3 `list_tags`, 3 `list_folders` y 3 `root_item_count`**, frente a una con show solo. La prueba acredita multiplicación bajo esas señales, no que Windows las emita siempre juntas. El mock no reproduce la contención de SQLite, por lo que no debe usarse para descartar el impacto de triplicar tags.

## Plan de mejora y límites

Los puntos 1–4 se abordaron en el primer corte con los límites descritos arriba. No se agregó cache persistente de tags ni se cambiaron los logs síncronos; la lista de abajo conserva criterios para ampliar sólo frente a medición y feedback. Los puntos 5–6 siguen siendo candidatos, no trabajo implementado.

1. **Quitar tags del camino crítico y corregir su consulta.** El catálogo para autocompletar no necesita recalcular todos los conteos antes de mostrar filas. Reusar datos si no cambió su revisión; invalidación por eventos, sin volver obsoleta la semántica de tags. Mover SQL síncrono de carpetas/root a workers, sin afirmar que eso por sí solo elimina contención.
2. **Una operación de reapertura por sesión/generación.** Coalescer show/focus/visibility en vuelo, no un debounce arbitrario que agregue espera. Priorizar snapshot + primera página; feedback/toasts y catálogos después. Conservar cambios de query, capturas recientes, filter lock y errores/retry.
3. **Reducir overscan y renders innecesarios.** Probar 6 como candidato; estabilizar props/catálogos y medir extracción/memo de filas sólo si sigue aportando. No reescribir todo App ni cambiar librería por intuición.
4. **Revisar los 90 ms nativos y logs síncronos.** Medir alternativa sin sleep o con espera mínima justificada. Exige oracle real app externa → hotkey → escritura global visible; no trasladar mecánicamente el cambio a paste ni a todas las acciones nativas.
5. **Desacoplar conteos de páginas y reducir payloads cuando los anteriores estén resueltos.** Conteos exactos diferidos con generación/filtro correcto; no sustituirlos por datos falsos. Considerar char count persistido, DTO sin texto duplicado, metadata acotada y thumbnails cacheados/bajo demanda. Son cambios de contrato/invalidation, no arreglos de una línea.
6. **Fast path de reapertura sin cambios, sólo si se prueba necesario.** Reutilizar snapshot caliente únicamente si host confirma revisión y contexto iguales. No quitar sin más la máscara anti-stale: una captura oculta, borrado o cambio de permisos debe invalidar antes del primer frame.

No recomendado como primer corte: destruir WebView en idle, quitar previews, eliminar controles accesibles, ocultar síntomas con una animación, cambiar SQLite, o activar FTS con semántica distinta de substring.

## Reproducción y aceptación

Desde `src-tauri`, `cargo run --offline --release --example bench_picker_open -- 10000 100`; repetir con `10000 500`, `100000 100`, `100000 500`. No ejecutar suites/builds al mismo tiempo que las muestras. El ejemplo no acepta una ruta de usuario y no toca la instalada.

En Windows GNU, el ejecutable de ejemplo necesita Common Controls v6 y acceso al WebView2Loader local, como el harness Rust. En esta PC se enlazó usando el recurso generado por `tests/manual/run-rust-tests.ps1`:

```powershell
# Desde src-tauri, sólo si ese recurso ya existe. No ejecuta la batería Rust.
$res = (Resolve-Path target-codex-test/test-manifest/common-controls-v6.res).Path
cargo rustc --offline --release --example bench_picker_open -- -C "link-arg=$res"
Copy-Item target/release/WebView2Loader.dll target/release/examples/WebView2Loader.dll
./target/release/examples/bench_picker_open.exe 10000 100
```

Si falta el recurso, recuperar el procedimiento `Add-WindowsGnuTestManifest` de ese script; no instalar herramientas ni usar un binario viejo para aparentar la medición actual.

El probe de renderer reutilizó el prefijo de fixtures/helpers anterior al primer test de `tests/visual/shell.spec.ts`. Receta mínima: datos de 240 clips, `mockTauriInvoke`, diagnósticos off, CPU 1×/4×, medir hide/show con snapshot delayed y repetir las tres señales; instrumentar nombres/tiempos de invoke sin payloads. Los seis casos baseline y los seis con overscan experimental terminaron correctamente en la investigación inicial; la regresión visual completa y el oracle nativo se ejecutaron después, en la iteración 1.

Las mediciones disponibles y una repetición completa de renderer quedaron preservadas en [evidencia](../../evidencia/2026-10-21-picker-performance/README.md), separando baseline, experimento anterior e iteración 1. `.codex-run/picker-open-audit/` conserva los probes/logs auxiliares y `interactive-session.json` para identificar la instancia aislada; no sustituye la evidencia durable. No sobrescribir la baseline al repetir.

Para aceptar un fix, agregar métricas opt-in con ID de apertura y duraciones: hotkey/dispatch/show, recepción del evento, inicio/fin de snapshot, espera de mutex/SQL/counts/thumbnails, respuesta IPC, commit y viewport estable. Nunca query, texto, nombres de tags/carpetas, rutas ni imágenes reales. Reportar p50/p95 con al menos 30 aperturas, frío/caliente separados, misma build y perfil sintético. Validar además foco, paste, hide/show rápido, cambios durante apertura, filter lock, selección/scroll, errores/retry y privacidad de previews. La cifra de hotkey a contenido usable en la otra PC sigue pendiente.
