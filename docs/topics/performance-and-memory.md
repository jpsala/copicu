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
  - docs/active-work/014-performance-memory.md
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

## Prioridad De Trabajo

### P0: Reducir Payload Del Feed

Problema observado:

- `HistorySearchRequest.include_content` existe, pero `storage.history_search` lo ignora.
- Las queries de paginas traen `text` completo para todos los items.
- La UI necesita preview para el feed, y contenido completo solo para editar, activar, scripts o vista expandida.

Pattern recomendado:

- Introducir un DTO de pagina distinto de `HistoryItem` si hace falta.
- Para `includeContent=false`, devolver preview truncado y metadata suficiente:
  - `id`, `contentKind`, `previewText`, `textCharCount`, timestamps, flags, MIME/blob/thumbnail metadata, title/notes/tags.
- Mantener `get_item(id)` o una ruta equivalente para contenido completo bajo demanda.
- No romper scripts: `copicu.history.search(..., { content: true })` debe seguir obteniendo contenido cuando lo pide.

Validacion esperada:

- Feed sigue renderizando texto, metadata e imagenes.
- Edit/activate/scripts con content siguen funcionando.
- Items largos no cruzan completos por IPC en la pagina inicial.

### P0: Thumbnails Reales Para Imagenes

Problema observado:

- Para imagenes, `thumbnail_data_url` usa `blob_path` principal en vez de `thumbnail_path`.
- Cada pagina puede leer PNG grande, base64-encodearlo y mandarlo por IPC.

Pattern recomendado:

- Usar `thumbnail_path` para el feed.
- Reservar `blob_path` principal para copy-back, preview detallada o export.
- Considerar servir blobs por protocolo/ruta segura en vez de `data:` si el base64 sigue siendo caro.

Validacion esperada:

- Imagenes capturadas siguen visibles en el picker.
- Copy-back usa el PNG principal.
- La pagina inicial no incluye PNGs grandes como data URL.

### P0: Idle Event-Driven

Problema observado:

- El renderer refresca historial por intervalo.
- El renderer consulta snapshot/probe por intervalo.
- WhichKey tiene polling propio.
- Los diagnosticos renderer mandan heartbeats constantes.

Pattern recomendado:

- Emitir eventos backend cuando cambia historial: capture, edit, delete, mark, tag, import.
- Refrescar al mostrar/focalizar el picker y al recibir evento.
- Mantener polling solo como fallback dev/debug, con intervalos mas largos y cancelado cuando la ventana no esta visible.
- Evitar `emit` hacia `main` desde callbacks global-shortcut sensibles: para ese camino se mantiene la regla vigente de invertir direccion con consulta renderer.

Validacion esperada:

- Con app quieta, no hay IPC constante de historial/probe/diagnosticos en produccion.
- Una copia sintetica aparece sin esperar polling largo cuando el picker esta visible o se abre.

### P1: Busqueda Escalable

Problema observado:

- Texto libre usa `LIKE '%term%'` sobre varios campos.
- Los conteos total/filtrado se calculan en cada busqueda.

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
