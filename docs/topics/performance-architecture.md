---
title: Arquitectura de rendimiento, lecturas, revisiones y proyecciones
summary: Estudio de arquitectura y costes; el primer lector del feed está integrado en WIP con evidencia release, mientras retención y demás alternativas siguen separadas.
keywords:
  - arquitectura
  - performance
  - WAL
  - mutex
  - actor
  - snapshots
  - revisiones
  - conteos
  - cache
  - IPC
  - thumbnails
  - FTS
---

# Arquitectura para rendimiento

## Alcance y conclusión

Investigación iniciada el 2026-10-21 sobre `8ab41ce` **más el WIP de la iteración 1**. Tras instrumentación/comparación nativa, JP aprobó integrar el primer [lector del feed](picker-history-reader.md): integrado, probado con datos sintéticos y luego distribuido/instalado en [v0.5.11](../releases/v0.5.11.md) por pedido de JP tras feedback positivo local. No hubo migración de schema. Retención sigue siendo otro corte.

La dirección recomendada es **separar el trabajo interactivo del trabajo auxiliar dentro del mismo proceso**, conservando Tauri/React/Rust/SQLite y el picker caliente. No empezar con microservicios, otro motor, otro framework ni un actor que serialice absolutamente todo. Primero medir espera frente a servicio; después, lecturas WAL acotadas, conteos fuera del camino de primera página y revisiones coherentes. Materializar previews y aislar render son cortes independientes, condicionados al tipo de carga.

Confianza alta en la topología, los costes SQL y la contención sintética de AppStorage reproducidos; media en el orden de candidatos; **sin evidencia para prometer la latencia nativa final o explicar la otra PC**. No sumar tiempos de SQL, AppStorage y renderer simulado. La aceptación humana del primer corte sigue pendiente.

Política: [rendimiento y memoria](performance-and-memory.md). Evidencia previa: [apertura](picker-opening-performance.md). Fuentes nuevas, muestras, SQL y límites: [estudio sintético](../../evidencia/2026-10-21-picker-performance/architecture-study/README.md). Trabajo: [track 014](../tracks/014-performance-memory.md).

## Mapa del sistema y de costes

Mapa de la ruta compartida **antes de integrar el lector**; cambios vigentes en [lector del feed](picker-history-reader.md). `Medido` identifica el mecanismo concreto; código demuestra dependencia, no tiempo en la PC afectada.

| Ruta | Funcionamiento actual / coste | Evidencia y laguna |
| --- | --- | --- |
| Arranque frío | `lib.rs::run`: abrir DB/WAL/migraciones, settings/tray, configurar ventanas, watcher, scripts y shortcuts; montaje del renderer. Metadata se precalienta a los 350 ms fuera de dev; notifications se crea en startup. | Código. Faltan proceso→shortcut registrado, Search usable, página y memoria estabilizada. El bundle y el debounce de 120 ms no son costes inevitables de cada reapertura caliente. |
| Apertura caliente | Hotkey→despacho UI→geometría/show/foco→evento→`isVisible`→consumir sesión→primera página→paint→catálogos. El corte 1 ya quitó el sleep de 90 ms y coalesció show/focus/visibility. | Renderer mock CPU 4×: reveal ~99–123 ms; AppStorage sin filtro ~0,20–0,24 ms. No hay tramo nativo emparejado hotkey→input/feed ni desglose del logging síncrono. |
| Búsqueda | `history_search` usa `spawn_blocking`, pero toma el mutex compartido. Compila, cuenta, consulta 61 filas, adjunta evidencia de matches y después thumbnails. Primera página pide conteos; paginación ya los omite. | Corte 1: AppStorage release 100k/100 tags, común 65,12 ms con conteos frente a 0,36 sin ellos. El corte nativo posterior confirma scans raros/ausentes caros aun sin counts. Faltan contexto/metadata grandes, imágenes y recepción concurrente. |
| Lecturas/escrituras | `AppStorage.conn = Arc<Mutex<Connection>>`, WAL activo. Feed, tags, carpetas, settings, captura y sharing comparten esa conexión. Workers evitan bloquear el handler, no el mutex ni la cola de trabajo. | Contención de mutex medida en el corte nativo siguiente; falta distribución real de eventos y cola de workers Tauri. WAL no permite paralelismo entre operaciones encerradas en el mismo mutex. |
| Find | Ya abre conexión read-only independiente, transacción corta respecto de la sesión, cancelación e interrupción; luego construye índice de ocurrencias en Rust. | Reusar ese precedente, no presentarlo como nuevo. El escaneo puede leer todos los textos del resultado; el índice depende de ocurrencias, no de filas visibles. Faltan pico de memoria, coste Unicode/Markdown y cancelación con textos/contexto grandes. |
| Captura | Watcher captura/normaliza; texto añade contexto/tags y ejecuta retención en transacción. Imagen escribe PNG y thumbnail **dentro del mutex/transacción**. GC comprueba referencias y borra archivos manteniendo mutex. | Código: posibles colas por disco, retención y contexto. El benchmark de apertura inserta fixtures directamente: **no mide captura**. No asumir pérdida de capturas, ni que todo tiempo sea SQLite. |
| Postcaptura/sync | Ya hay cola acotada postcaptura de 128 (enriquecimiento/actions; puede omitir esos jobs si llena). Sharing tiene transacciones de receipts/cursor/replay y de aplicación al historial; usa el mismo storage. | No convertir esa cola opcional en política de pérdida de escrituras. Falta carga concurrente sintética con recepción, retención, recaptura y acciones. Los fences, grants, secuencias y atomicidad siguen siendo gates de seguridad. |
| IPC / DTO | `includeContent=false` ya existe; el SELECT calcula dos `SUBSTR(text)` y `LENGTH(text)`. `text` y `preview_text` repiten preview; title/notes/tags no tienen ahí un límite de preview equivalente. `attach_search_matches` vuelve a leer texto/contexto completo de las filas con evidencia, bajo mutex. | Página nativa larga ~14,3–14,7 ms; JSON histórico ~103–276 kB sin imágenes. Serialización aislada sub-ms no mide IPC/parsing/copias. DTO reducido no garantiza poco trabajo en SQL ni bytes acotados para toda metadata. |
| Thumbnails | `attach_thumbnail_data_urls` libera mutex antes del I/O, pero lee/base64 secuencialmente todos los thumbnails de la página antes de responder. No envía PNG principal al feed. | El probe renderer usa imágenes repetidas y calientes; no caracteriza disco/decode de imágenes distintas. Separar archivos leídos, bytes codificados, IPC, decode y layout. |
| Estado/render | Virtualizador con overscan 6; las filas se construyen dentro de `App`. TextPreview mide overflow/layout; Markdown se analiza para clasificación/render. Nuevas identidades de items pueden volver a renderizar filas. | Beneficio del overscan ya medido; no repetirlo como arquitectura nueva. Falta perfil por commits, parse, estilo/layout y GC, especialmente mientras se escribe. Separar un archivo por sí solo no reduce renders. |
| Memoria acumulada | Paginación agrega items al array; virtualizar limita DOM, **no todos los DTO retenidos**. Refresh con scroll manual recorre IDs retenidos en lotes de 100 para renovar previews. Contenido expandido puede seguir retenido si conserva hash. | Falta memoria tras scroll profundo, expandir/colapsar, ocultar, editar, borrar y volver. Es distinta de la memoria base WebView. Evictar páginas requiere contrato de selección/rango/Find/ancla, no un `slice` arbitrario. |
| Idle | Diagnósticos/heartbeat del renderer gated; persisten tracker foreground 250 ms, firma de scripts cada 1,5 s y loops de sharing según estado (incluido snapshot cada ~1 s sin configurar, con feature). Logs nativos de diagnóstico siguen síncronos. | Código no demuestra CPU alta. Medición de junio (~260 MB private agregado) no representa el build actual. Faltan CPU, wakeups, I/O y memoria por proceso/superficie a 60 s y tras uso prolongado. |

Fuentes recuperables: `src-tauri/src/storage.rs::{open,history_search,read_find_items_cancelable,insert_text_with_scenario,insert_image_with_scenario,attach_search_matches,remove_blob_paths,prune_history_from_conn}`, `storage/search.rs::{history_item_select_columns,push_field_like_clause}`, `storage/folders.rs::summaries`, `storage/shared.rs`, `clipboard.rs::{queue_post_capture,PostCaptureProcessor}`, `find.rs::FindSessionStore`, `lib.rs::{run,spawn_script_action_refresh,diag_log}`, `shared_host.rs::start`, `diagnostics.rs::log_event`, `window_focus.rs::spawn_foreground_tracker`, `src/main.tsx::{refreshHistory,loadNextHistoryPage,refreshOnFocus,TextPreview,MarkdownPreview}`.

**Lifecycle real:** la política general de limitar superficies idle no significa que hoy sólo exista `main`. [Ventanas custom](custom-window-system.md#superficies-relevantes) prescribe metadata prewarm y varias superficies cache/hide. Medir ese conjunto y preservar las razones de foco/UX; este estudio no autoriza destruirlas ni importar la cifra de junio como baseline actual.

## Experimentos ejecutados y qué cambian

`architecture-study/sql-probe.mjs`: Node 24.16.0 / SQLite 3.53.0, esquema extraído de las 19 migraciones locales; campos/predicado y orden del código actual, 10k/100k textos sintéticos, en memoria. Dos calentamientos y nueve muestras por caso con orden alternado. Muestras completas y hashes en `sql-results.json`. **No es AppStorage, SQLite bundled 3.51.3, disco frío, IPC ni prueba de la app.** No incluye matcher Rust de evidencias ni thumbnails; no calcular un p95 fiable con nueve muestras.

| 100k textos | Página sin conteos | Sólo conteo filtrado | Total + filtrado + página |
| --- | ---: | ---: | ---: |
| Común, match en todos | 0,31 ms | 26,88 ms | 27,68 ms |
| Único match, item más viejo | 122,64 ms | 115,27 ms | 238,33 ms |
| Sin matches | 122,15 ms | 114,50 ms | 237,21 ms |

El índice de recencia evita ordenar, pero no evita recorrer hasta encontrar matches. **Diferir conteos ayuda, no garantiza búsquedas instantáneas.** Distinguir distribución de resultados de cantidad total de clips. En 10k, raros/ausentes dieron ~12 ms de página frente a ~0,24 ms del común. Estas cifras no reemplazan las nativas anteriores.

Para los 61 textos recientes de 250.020 caracteres, una tabla sintética con preview y cantidad de caracteres, unida por PK, conserva las columnas devueltas y reduce la lectura de ~10,21 a ~0,81–0,86 ms. La construcción completa costó ~23 ms/10k y ~144 ms/100k **en memoria**, sin mantenimiento incremental implementado. El probe comprueba igualdad, demuestra que un edit deja la proyección vieja y restablece igualdad al actualizarla. Es evidencia para un prototipo nativo, no una migración lista ni garantía para búsquedas con matches fuera del preview.

Intercalación determinista sobre WAL temporal: sin transacción, lecturas observan 1→2 filas tras commit; dentro de snapshot materializado por SELECT, el escritor confirma y el lector conserva 2 hasta cerrar, cuando ve 3. Checkpoint pasa de 4/5 a 5/5 frames al liberar lector. Acredita snapshot/vida corta, **no ahorro del mutex Rust**.

## Corte nativo: lecturas y contención

[Fuentes y método](../../evidencia/2026-10-21-picker-performance/native-storage-study/README.md): AppStorage release/SQLite 3.51.3, perfiles WAL temporales, 3 × 34 muestras por variante. Spans opt-in **sólo `cfg(test)`**, sin routing nuevo, UI/clipboard/red. No mide cola Tauri, IPC ni hotkey→input/feed.

Primera página vacía, sin conteos, iniciada después de que el fondo adquiere el mutex; p95 en ms. Son latencias **condicionadas al solapamiento forzado**, no p95 de aperturas reales:

| Trabajo de fondo | 10k: compartida → lector independiente | 100k: compartida → lector independiente |
| --- | ---: | ---: |
| Scan ausente con conteos | 29,73 → 0,62 | 357,73 → 1,54 |
| Recaptura, retención ilimitada | 8,57 → 0,46 | 75,05 → 0,70 |
| Recaptura, límite de retención = N | 109,70 → 0,53 | 1.211,50 → 0,64 |

Mutex explica casi todo el coste foreground compartido. El lector **no acelera al escritor**: retención cuesta ~1.065–1.069 ms de mediana en 100k. Es recaptura del mismo item, no ráfaga de inserciones; el default ilimitado es otro caso. Aislamiento y reducción de retención son mejoras distintas.

En serie, búsqueda común 100k con/sin conteos: ~63,37 / 0,37 ms en conexión original. Página ausente sin conteos: ~571,70 ms en esa corrida; diferir counts sigue sin resolver scans raros. Los planes usan recencia, no un índice de texto.

**Control de atribución:** original/read-only/read-write nueva, con/sin BEGIN, dieron el mismo plan/PRAGMAs; cuál conexión fue rápida cambió entre fases (~188–190 frente a ~624–637 ms), sin mejora por BEGIN. Causa residual de estado/caché/pager no aislada. No prometer aceleración SQL intrínseca por read-only: sólo la eliminación de espera de mutex está atribuida.

Pasan DTO/cursor/UDF, read-only, snapshot y rollback. Faltan revisiones, cancelación, fairness/UI, imágenes/recepción, CPU/memoria y deletes concurrentes. El wrapper text-only cierra la transacción al retornar; producto debe cerrarla **antes de I/O de thumbnails**. El README distingue capturas v1 del harness v2 con paths de settings aislados.

**Prioridad:** prototipo acotado del lector y otro corte sobre retención, no actor universal. Antes de adoptar: ownership/revisión/errores/cancelación, tiempo nativo del picker, carga del escritor y memoria. Requiere acordar integración; no autoriza instalación.

## Matriz de alternativas

`↓` es efecto esperado bajo su condición, no mejora garantizada. CPU indica trabajo total/contención; memoria incluye cachés adicionales.

| Alternativa | Latencia objetivo | Memoria / CPU | Complejidad y corrección | Refutación / decisión propuesta |
| --- | --- | --- | --- | --- |
| Mantener conexión única, acortar trabajo | ↓ si dominan conteos, I/O o retención; no aísla una lectura larga | Poco extra; puede reducir CPU | Baja/media; conserva contratos actuales | Si espera de mutex es baja, preferir esto antes de concurrencia nueva. Baseline de control obligatoria. |
| 1 lector WAL interactivo independiente; auxiliar sólo si hace falta | ↓ cola detrás de capturas/sync; SQL individual no necesariamente mejora | Cache de páginas/statement por conexión; concurrencia puede subir CPU/I/O | Media: mismos UDF/semántica, snapshot, cierre/cancelación y migraciones fuera de lectores | Descartar ampliación si p95 no mejora o empeora captura/CPU. **Candidato preferido para aislar contención medida**, no pool genérico grande. |
| Actor único para todas las operaciones | Hace explícita cola/backpressure; sigue head-of-line blocking | Pocos recursos, mensajes/DTO adicionales | Media/alta migración de APIs; prioridad no interrumpe una query ya ejecutándose | No usarlo como supuesto acelerador universal. Una consulta lenta antes de la hotkey seguiría bloqueando. |
| Escritor único/actor + lectores, colas por clase | ↓ cola y controla ráfagas; escrituras SQLite siguen siendo una por vez | Colas deben acotarse por bytes; posible CPU menor al coalescer reads | Alta: orden, fairness, shutdown, errores y transacciones entre módulos | Sólo si el mutex/escritor actual más lectores no basta; no trasladar toda la app para introducir una cola. |
| Primera página sin conteos + conteo diferido | Gran reducción para búsquedas comunes | Igual trabajo total si se termina todo; ↓ CPU sólo al cancelar/coalescer | Media: estado unknown/pending, generación/revisión y acciones sobre todo el resultado | Si página domina (raro/ausente), no basta. Nunca presentar tamaño de página o conteo viejo como exacto. |
| Snapshot de página/catálogos con revisión | ↓ IPC/SQL/render en reapertura sin cambios | Caché pequeña y acotada; ↓ CPU si hit rate alto | Alta si no existe revisión completa; no confundir epoch Find/generación UI con commit | No adoptar si invalidación frecuente destruye hit rate o cualquier mutación permite un falso hit. |
| Conteos incrementales | ↓ recuentos repetidos de Root/carpetas/marcados | Más writes/almacenamiento; ↓ scans | Media para particiones simples; alta para tags jerárquicos con DISTINCT o filtros arbitrarios | Empezar sólo si medidos. No sumar conteos de hijos tags: un clip puede pertenecer a varios. No precomputar todo Search. |
| Proyección materializada preview/longitud | ↓ página de textos enormes, menor I/O | Más DB/write amplification; coste de backfill | Media/alta: actualizar captura, edición, copia, import/sync y rollback de forma atómica | Si payload/contención domina o corpus es corto, no priorizar. El resultado SQL favorable no prueba ahorro nativo ni de evidencias de búsqueda. |
| DTO/bootstrap compacto | ↓ viajes seriales y bytes, especialmente imágenes/metadata | ↓ copias; posible pico si se agrupa todo | Media: sesión consumible, permisos, parcialidad y errores | No crear un bootstrap gigante que vuelva a esperar catálogos. Medir round-trip primero; ya existe preview DTO y catálogos diferidos. |
| Thumbnail bajo demanda + caché por bytes | ↓ página cuando domina disco/base64; viewport útil antes | Caché suma memoria; menos I/O, pero más requests/decodes si fragmentado | Media/alta: identidad/hash, acceso local seguro, borrado/retención, placeholder estable | No ampliar si imágenes son pocas/calientes. No cambiar CSP a URLs arbitrarias; conservar `localPreviewImageSource` o diseñar protocolo validado distinto. |
| Separar estado interactivo/feed/filas | ↓ commits/layout cuando App rerenderiza por otros controles | Pequeño extra de memo/caché; ↓ CPU según dependencias | Media: props estables, selección, Find, scroll, efectos de layout | Si layout/decode nativo domina y React es marginal, extracción no sirve. No otra store global por defecto. |
| FTS5 trigram como filtro de candidatos | ↓ búsqueda rara/ausente si reduce scans conservando semántica | Índice, backfill y coste por escritura; ↓ CPU de búsqueda | Alta: Unicode, literales, scopes/contexto, deletes/updates, fallback exacto | La búsqueda rara nativa justifica un experimento, no adopción. FTS por palabras no equivale a substring; no hacer reemplazo directo. |
| WebView lazy / cambiar React o SQLite / proceso extra | Coste alto y latencia fría/foco potencialmente peores | Puede bajar idle o duplicar buffers/IPC; sin estimación local | Muy alta; amplia superficie funcional | **No recomendado con esta evidencia.** Reconsiderar sólo tras atribuir un límite irreducible de plataforma. |

## Contratos que necesita la arquitectura propuesta

### Lecturas, cola y escritor

Empezar con el escritor actual y **un lector de servicio interactivo**, no con un actor universal ni una conexión por cada evento. Un segundo lector auxiliar sólo si un experimento demuestra valor. Permitir una solicitud pendiente más reciente por dueño/generación para búsquedas sustituibles; limitar concurrencia y bytes. Escrituras/capturas/receipts no son descartables por el mismo criterio: necesitan backpressure y fallo visible, no `latest wins`.

- Inicializar lectores después de abrir/migrar storage; no reutilizar `AppStorage::open` porque abre/migra como escritor. Configurar funciones (`regexp`, `legacy_tag_matches`), semántica/PRAGMAs pertinentes y timeout explícito. Reusar el patrón Find, no copiarlo sin revisar sus inicializadores.
- Actualmente rusqlite 0.39 instala busy timeout de 5.000 ms al abrir; Find lo cambia a 250 ms. Ninguno limita espera del mutex Rust. No atribuir esperas a un supuesto timeout cero ni reducir timeout para ocultar contención.
- Una página con varios SELECT que debe ser coherente necesita transacción de lectura. Cerrar antes de I/O de thumbnails, serialización o vida de sesión. No mantener una transacción abierta mientras el usuario navega.
- Si se separan conteos de página, no fingir que transacciones distintas son el mismo snapshot: usar revisión compatible o estado de conteo pendiente/desactualizado. Evitar reintentos infinitos bajo captura continua.
- Cancelar queries obsoletas en la conexión lectora asignada, mediante el mecanismo apropiado de rusqlite. `interrupt` tiene ámbito de conexión; una cancelación tardía no debe matar la nueva solicitud ni una escritura. Ownership/job token y fin efectivo antes de reutilizar la conexión. Mantener guards frontend incluso con cancelación backend.
- Prioridad funciona entre trabajos, no vuelve preemptiva una operación larga. Partir auxiliares en unidades válidas, cancelar scans sustituibles y dar fairness al fondo. No dividir arbitrariamente transacciones de replay/receipts, retención o metadata atómica.
- Sacar blob staging/I/O del lock sólo con protocolo de publicación/cleanup que preserve dedupe, archivos compartidos y rollback. Un `drop(conn)` aislado alrededor de un delete puede introducir carreras con nuevos referentes.

### Revisión de datos no es generación de interfaz

Hay al menos tres identidades distintas: sesión/reapertura, intención/descriptor aplicado y estado confirmado del storage. `mutation_epoch` pertenece a Find: `item_projection_signature` **excluye recencia e historial de captura deliberadamente**. En `insert_text_with_scenario` el incremento depende de cambio de proyección/poda, no de cada inserción. No usar ese epoch como certificado de que una primera página o catálogo está intacto; tampoco el fingerprint de query prueba versión de datos.

Si se acuerda cachear snapshots, primero definir revisión completa de cambios observables. Una opción a prototipar es revisión de datos transaccional, leída junto a la página, con namespace de instancia/perfil; inicialmente invalidación conservadora. Revisiones separadas de catálogos/conteos sólo si se demuestra que compensa su mantenimiento. Enumerar **todas** las mutaciones: inserción/recaptura/recepción, edit/enrichment, tags, marcas, Inbox, mover/copiar/borrar carpeta, retención y restauración de blobs. Una revisión DB no versiona por sí sola archivos externos.

Un cache key debe incluir descriptor efectivo, alcance/orden/cursor/límite, política de preview y revisión pertinente. Sesión y selección deben validarse al aplicar, aun en cache hit. Eventos notifican/invalidadan; no son un ledger completo ni una garantía de entrega. Reconciliar al abrir y después de fallo. Cache inválida permanece bajo la máscara anti-stale; no mostrar ni activar una fila vieja para mejorar el cronómetro.

`consume_picker_session_snapshot` consume estado: agruparlo con una lectura en un bootstrap requeriría conservar activación pendiente, generations y recuperación ante respuesta perdida. Evitar una segunda máquina de estado paralela a la que ya protege el picker.

### Conteos, payloads, render y memoria

- Diferir conteos exige desacoplar `historyTotalCount === null` de “feed inicial no cargado”, hoy usado por el efecto de búsqueda. Vincular conteos al descriptor/revisión y no arrastrar los del filtro anterior. Corregir status, `aria-setsize` y confirmaciones/acciones all-result para unknown/pending; nunca usar 60 filas como total exacto. No es cambiar sólo `includeCounts`.
- Separar conteo directo por carpeta de agregado por subárbol; reparent y borrado tienen su coste. Tags jerárquicos requieren deduplicar por item y respetar LIKE/Unicode vigente. Preferir invalidación/cache de catálogos al mantenimiento incremental complejo si el hit rate basta.
- Proyectar longitud/preview no sustituye búsqueda en contenido completo ni evidencia de matches fuera del preview. Comparar columna almacenada frente a tabla lateral compacta; conservar Unicode y límites. Backfill, versionado/rebuild y aumento de tiempo de escritura deben entrar en la spec si se elige.
- DTO de lista y datos expandidos deben tener presupuestos separados. No cargar toda la DB en JS ni cachear texto completo por duplicado para compensar viajes IPC. Mantener el API de acciones/full-content y privacidad por superficie.
- Cachés: acotar por **bytes y cantidad**, no sólo items; llave por identidad/contenido/versión, invalidación por edit/delete/retención y política de liberación. Medir bytes codificados más RGBA decodificado y copias JS/Rust. Cachear a ambos lados sin atribuir ownership puede duplicar la memoria.
- Separar primero `Search`/estado de intención de feed/row con props estables; conservar reducer/guards existentes. Perfil antes/después de commits y layouts. React transition/deferred value puede ordenar trabajo, no cancelar SQL ni autorizar un resultado viejo. No tocar foco/paste ni accesibilidad por el rendimiento.

### FTS: no es un switch de compatibilidad

Las fuentes primarias confirman que FTS5 trigram puede acelerar substring, pero la optimización LIKE **no se usa con `ESCAPE`**. El compilador actual emite `LIKE ? ESCAPE '\'` sobre varios campos/COALESCE. Añadir una tabla FTS no acelera esas expresiones por sí solo. No quitar ESCAPE ni normalizar acentos/case de otro modo para facilitar el índice: cambiaría literales y resultados.

Un candidato futuro debe producir un **superset sin falsos negativos**, verificar con el predicado actual, unir OR/scopes correctamente y caer al scan exacto para queries cortas, regex, negaciones o casos no probados. Recheck elimina falsos positivos, no recupera falsos negativos. Medir tamaño/build/mantenimiento de índice y coste de ordenar candidatos por recencia. La evidencia rara/ausente justifica experimentar, no activar FTS ahora.

## Cortes y experimentos propuestos

El tramo de storage de 1–2 se midió en harness y JP aprobó la [integración del lector](picker-history-reader.md), ya implementada y con smoke de app verificado. No extender ese acuerdo a todas las alternativas: los demás cortes se mantienen separados. Gates numéricos se acuerdan con JP; no convertir ruido en objetivo cumplido.

1. **Observabilidad atribuible, sin cambiar arquitectura.** Acordar un corte con spans de tiempo/IDs sintéticos: entrada comando, espera worker, espera mutex, lock hold, count/page/matches, thumbnails, encode/IPC, commit renderer/layout y hotkey/input/feed nativos. Sin query/content en logs; buffer acotado para no introducir I/O síncrono en la ruta medida. Baseline nativa aislada con la composición relevante. Refuta la prioridad de storage si el coste está en foco, WebView o renderer.
2. **Experimento de aislamiento de lectura.** Comparar actual vs lector WAL con exactamente mismos resultados y datos. Casos: sin carga, captura de texto con contexto/retención, imágenes, recepción sintética, Find concurrente, query larga seguida de query corta. Medir espera/servicio por clase, p50/p95/máximo, commit de captura, errores/cancelaciones, profundidad de cola, CPU, memoria y tamaño/checkpoint WAL. Empezar sin actor nuevo. Refutar si beneficio está dentro de variación o perjudica escritura/idle.
3. **Conteos progresivos + coalescing por revisión.** Variantes pareadas con/sin counts y defer/cancel, queries común/rara/cero, clear, filter lock y cambio de carpeta; misma última generación y exactitud eventual. Verificar no-loop de inicialización, ARIA, selección y operaciones all-result. Refutar si la página sigue dominando o cada keypress sólo mueve el scan al fondo sin bajar interferencia.
4. **Proyecciones y previews, según corpus.** Repetir candidato SQL en AppStorage bundled, con 2k/250k/1M caracteres, Unicode, title/notes/contexto, recaptura/edit/recepción y fallo a mitad de transacción. Medir bytes DB/backfill, lectura, coste por write y coherencia. Para imágenes, comparar inline vs dos fases con 60 thumbnails únicos, I/O caliente/no precalentado, viewport y scroll; no usar sólo imágenes repetidas. Refutar si penalidad write/memoria supera ahorro visible.
5. **Snapshot cache y render.** Sólo tras contrato de revisión. Abrir sin cambios, con captura oculta, reordenar recaptura, editar/borrar seleccionado, cambiar filtro/alcance, respuestas invertidas, eventos coalescidos/perdidos y cierre durante consume. Medir hit rate, filas que rerenderizan, heap, bytes retenidos y GC. Una fila incorrecta/activable o revisión mezclada rechaza el candidato aunque sea más rápido.
6. **Idle y memoria de sesión.** Matriz captura/sharing/diagnóstico, superficies realmente usadas y ocultas; 60 s estable más prueba prolongada de abrir/scroll/expandir/Find/ocultar. Comparar CPU acumulada, wakeups, I/O, private bytes/working set por host y WebView. Cambios a timers/logs/lifecycle sólo si se atribuye coste y no se pierde recuperación/foco. Mantener picker caliente.

Para comparaciones: mismos hashes/configuración/dataset/semilla, builds release, sin builds/suites paralelos; alternar A/B y repetir al menos tres bloques. Para p95 nativo apuntar a ≥100 operaciones por escenario y conservar muestras completas, fallos y outliers; no sustituirlos por el promedio ni por CDP 4×. Separar arranque de proceso, reapertura caliente, caches de aplicación/OS y escenarios sin calentamiento; no purgar caches del sistema ni tocar procesos ajenos. Reportar 10k/100k, distribución de textos/metadatos/contextos/tags/carpetas, bytes de imágenes y tasa de mutación, no sólo cantidad de filas.

## Fuentes y estado de decisión

- [SQLite WAL](https://www.sqlite.org/wal.html): concurrencia de lectores/escritor único, checkpoints y lectores prolongados.
- [SQLite isolation](https://www.sqlite.org/isolation.html): snapshots entre conexiones y transacciones.
- [SQLite interrupt](https://www.sqlite.org/c3ref/interrupt.html): alcance y vida de una interrupción.
- [FTS5, trigram](https://www.sqlite.org/fts5.html#the_trigram_tokenizer): posibilidades y restricciones de LIKE/ESCAPE/queries cortas.
- Extractos consultados, fecha y hashes de páginas: `architecture-study/public-sources.json`; GET públicos sin código/datos privados enviados. Rusqlite: fuente local instalada 0.39.0, `src/{busy,inner_connection}.rs`, para timeout efectivo.

**Vigente:** corte 1 más [lector del feed](picker-history-reader.md), distribuidos e instalados como v0.5.11 con permiso actual de JP. **Comprobado:** storage, smoke y paquete; no tiempos hotkey→input/feed. **Pendiente:** otra PC, memoria/idle y retención. El feedback humano local fue positivo. Ningún recibo concede permisos para nuevas instalaciones, publicaciones o procesos.
