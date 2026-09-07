---
id: performance-and-memory
status: active
kind: decision-map
triggers:
  - performance
  - memoria
  - consumo
  - idle
  - velocidad
  - large history
  - benchmarks
primary_refs:
  - docs/tracks/014-performance-memory.md
  - docs/topics/sqlite-storage.md
  - docs/topics/filtering-and-query-syntax.md
  - docs/topics/picker-interaction.md
  - docs/topics/actions-and-scripting-api.md
---

# Performance And Memory

Topic durable para optimizar velocidad, consumo de memoria, CPU en idle, IPC y costo de render del picker.

## Objetivo

Copicu debe sentirse inmediato como herramienta local keyboard-first:

- barato en idle;
- rapido al abrir el picker;
- estable con historiales grandes;
- cuidadoso con payloads grandes;
- medible antes de hacer claims publicos fuertes.

La promesa correcta no es "no consume memoria"; es que la arquitectura evita cargar/renderizar trabajo innecesario.

## Principio Dev Vs Produccion

Modo dev puede tener mas diagnosticos, polling y logs si ayudan a debuggear problemas de WebView2, IPC, hotkeys o ventanas.

Modo produccion debe evitar trabajo permanente que no aporte al usuario:

- heartbeats de renderer desactivados o gated por setting/debug flag;
- polling periodico reducido o reemplazado por eventos;
- snapshots/probes de clipboard solo visibles bajo debug;
- logs sin payload y sin spam constante;
- scripts y AI con resumen redacted, no source/content real en logs normales.

## Politica De Memoria Idle Y Picker Caliente

Decision vigente: Copicu prioriza un picker inmediato, confiable y visualmente estable por encima de minimizar agresivamente memoria idle.

Medicion local 2026-06-09 sobre build instalado de produccion, con la ventana principal oculta y el picker/WebView caliente:

- procesos: `copicu.exe` + 6 procesos `msedgewebview2.exe`;
- working set total aproximado: 493 MB;
- private memory total aproximada: 260 MB;
- host Rust `copicu.exe`: aprox 8.8 MB private;
- el costo dominante es WebView2, especialmente browser/renderer/GPU.

Interpretacion:

- el core nativo esta barato;
- el costo WebView2 es alto pero esperable en una app Tauri con picker precargado;
- no conviene cambiar a lazy WebView por defecto si eso introduce primer-open lento, flash visual, foco menos confiable o fallos en el flujo central;
- crear el picker lazy o destruirlo tras idle puede evaluarse como modo futuro opt-in de bajo consumo, no como default.

Criterios acordados:

- Mantener caliente lo necesario para que `Ctrl+Shift+,` se sienta inmediato.
- En idle produccion, evitar superficies extra: solo la WebView principal persistente salvo que Settings/AI output/ui-host esten en uso real.
- No mantener ventanas secundarias precreadas si solo ahorran un flash menor, excepto cuando haya evidencia de que el costo UX de crearlas bajo demanda es peor que su memoria.
- Eliminar logs, polling y diagnosticos normales de produccion.
- No perseguir micro-optimizaciones del bundle/render si ponen en riesgo el picker.
- Medir crecimiento con historiales grandes e imagenes para detectar leaks o previews pesados; eso no implica cambiar la decision de mantener picker caliente.

## Apertura Fresca Del Picker

- El host asigna un ID a cada apertura oculta. `picker_renderer_ready` recupera una apertura cuyo evento llegó antes del listener; `present_picker` sólo acepta el ID vigente. Hide invalida la apertura y un watchdog de tres segundos libera una petición no respondida con un error nativo recuperable.
- Antes de presentar la WebView persistente, el renderer hace commit síncrono de un feed vacío en carga. Las primeras filas provienen de una consulta nueva: no se reutiliza la página anterior como placeholder. No esperar `requestAnimationFrame` mientras la WebView está oculta.
- Focus y visibility comparten una apertura coordinada; los cambios de historial durante la consulta invalidan su resultado y se coalescen en una nueva consulta. Las generaciones de interacción siguen protegiendo query, selección y respuestas de aperturas canceladas.
- Los tags se refrescan después del historial, fuera de la cadena de apertura; sus conteos SQLite corren en `spawn_blocking`, no en el hilo nativo de UI. Esto no elimina la contención del mutex de storage.
- Diagnósticos: `picker.open.shortcut`, `prepare`, `shell-committed`, `shell`, `query`, `query-resolved`, `dom-commit` y `frame-opportunity`. `window.show.done` sólo mide la presentación nativa; ni ese evento ni rAF prueban el primer frame visible. Comparar con screenshots de la superficie real.
- Smoke mínimo: varias copias sintéticas con picker oculto -> hotkey desde una app externa -> feed vacío/carga -> primera fila nueva y activa; repetir con captura durante consulta, hide/reopen, filtro fijo, capture mode, query explícita durante carga y Retry. Conservar el delay nativo de 90 ms y el retry condicional de foco de 60 ms hasta medir una alternativa: teclear antes de que Windows entregue el foco puede ir a la aplicación anterior.

## Contratos Y Riesgos De Rendimiento

### Payload Del Feed

El contrato de preview ya está implementado; no tratarlo como un P0 pendiente:

- Las páginas con `includeContent=false` usan texto truncado y metadata de preview.
- El contenido completo se obtiene bajo demanda para editar, expandir o ejecutar acciones; scripts que lo solicitan deben conservar ese acceso.
- Validar con clips largos que la página inicial no transporte todo el contenido, sin romper activación ni edición.

### Imágenes Del Feed

El feed usa `thumbnail_path`, no el PNG principal. El original queda reservado para copy-back y preview completo.

Riesgo a medir: cada refresh vuelve a leer y codificar los thumbnails como data URLs. Que sean thumbnails no vuelve gratuito el I/O ni el IPC. Considerar cache o una ruta segura de blobs sólo si una medición con páginas de imágenes justifica el cambio; conservar la calidad del preview y el original para copiar.

### Actualización E Idle

El historial se actualiza por eventos y por el flujo de [apertura fresca](#apertura-fresca-del-picker), no por un intervalo permanente del feed.

- El polling de snapshot/probe y WhichKey queda condicionado al modo debug; los heartbeats dependen del modo de diagnóstico. No confundir una medición con diagnósticos activos con el idle normal.
- No asumir que toda mutación backend emite el evento: comprobar también las rutas de actualización explícita de la UI.
- Validar captura visible y reapertura tras capturas ocultas, además de CPU/IPC en idle con diagnósticos desactivados.
- La entrega de eventos desde callbacks nativos sensibles conserva los gates de foco y threading; no cambiarla sólo para reducir llamadas.


### P1: Busqueda Escalable

Problema observado:

- Texto libre usa `LIKE '%term%'` sobre varios campos.
- La primera página pide conteos; la paginación incremental puede omitirlos. Sin filtro, el total se reutiliza como conteo filtrado. Medir el costo adicional con filtros antes de introducir cache o diferir conteos.

Pattern recomendado:

- Agregar FTS5 para texto/title/notes/tags cuando el contrato de preview ya este claro.
- Mantener filtros estructurados en columnas normalizadas e indices normales.
- Hacer conteos bajo demanda, diferidos o cacheados por query cuando el costo sea visible.

Validacion esperada:

- Buscar entre muchos items sinteticos sigue respondiendo rapido.
- Query syntax existente conserva resultados.

### P1: Scripts Sin Reescaneo Innecesario

Problema observado:

- `list_actions` redescubre scripts y reescribe cache cada vez.
- Ya existe un thread de refresh por firma de carpeta.
- `clipboardChange` puede terminar pagando discovery/listado en cada captura.

Pattern recomendado:

- `list_actions` debe leer cache por defecto.
- Discovery/cache refresh en startup, cambio de settings, cambio de firma o refresh explicito.
- Para `clipboardChange`, filtrar candidatos desde cache antes de ejecutar cualquier trabajo caro.

Validacion esperada:

- Settings/command palette siguen viendo scripts nuevos tras cambio de carpeta o archivo.
- Clipboard capture sin scripts candidatos no escanea carpeta ni reescribe SQLite por captura.

### P1/P2: Runner De Scripts

Problema observado:

- Cada accion script levanta un proceso Node.

Pattern recomendado:

- Mantener proceso por ejecucion para acciones manuales mientras el costo sea aceptable.
- Si `clipboardChange` o local/global shortcuts frecuentes se sienten lentos, evaluar worker persistente o pool chico.
- No adelantar complejidad hasta medir.

### P2: Bundle Y Superficies UI

Problema observado:

- Build actual genera un chunk JS grande y CSS grande.
- Todas las ventanas comparten `src/main.tsx`, aunque varias superficies no necesitan picker/settings/markdown/etc.

Pattern recomendado:

- Code split por superficies: picker, settings, ui-host, notifications, markdown output, whichkey.
- Lazy-load markdown renderer/syntax highlight solo en `ai-output` o preview que lo necesite.
- Evitar cargar settings pesados para abrir rapido el picker.

### P2: Render React Del Feed

Problema observado:

- `markdownImages(item.text)` se recalcula en estimacion y render.
- Overscan fijo puede ser alto para filas pesadas.

Pattern recomendado:

- Derivar `hasMarkdownImages`/preview metadata en backend o memoizar por `item.id + text`.
- Ajustar overscan por tipo de contenido o por velocidad de scroll.

## Medicion Recomendada

Antes y despues de cada corte, medir con datos sinteticos:

- tiempo de `history_search` para pagina inicial;
- bytes aproximados del JSON IPC para pagina inicial;
- tiempo de apertura perceptual del picker;
- memoria del proceso `copicu.exe`;
- CPU/IPC/logs en idle durante 30-60 segundos;
- caso con clips largos;
- caso con imagenes grandes y thumbnails.

No usar payload real del clipboard en fixtures, logs o screenshots.

## Claims Publicos Permitidos

Permitido:

- Copicu usa SQLite paginado y TanStack Virtual para no renderizar todo el historial.
- Copicu busca reducir payloads innecesarios y cargar contenido completo bajo demanda.
- AI y scripts deben ser explicitos y privacy-aware.

Evitar hasta tener benchmarks:

- "historial infinito";
- "millones de items sin diferencia";
- "no consume memoria";
- "production ready".

## Preguntas Abiertas

- Cual debe ser el limite de preview por tipo de contenido.
- Si conviene un DTO nuevo o adaptar `HistoryItem`.
- Si la UI necesita una vista expandida para contenido completo sin entrar a edit.
- Cuando activar FTS5: antes o despues de estabilizar preview/payload.
- Si el runner Node persistente vale la complejidad en esta etapa.
