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

## Prioridad De Trabajo

El corte inicial de preview DTO, thumbnails separados, refresh event-driven y
code splitting ya existe. No volver a tratarlo como implementacion pendiente
ni reintroducir texto completo/PNG principal por pagina para ocultar otro bug.

El corte de confiabilidad esta implementado y verificado en
[`035-picker-reliability`](../tracks/035-picker-reliability.md); quedan gates de
retencion/reparacion instalada. SQL/decode/activacion del picker usan workers
bloqueantes reales; el hilo UI no espera eventos de foco. Refresh renueva previews
retenidos por ID sin cargar contenido completo ni perder el ancla.
La medicion/lifecycle permanece en [`014-performance-memory`](../tracks/014-performance-memory.md).

Orden de evaluacion, no autorizacion de una reescritura:

1. Aislar SQL, decode, scripts y esperas nativas del borde interactivo. Convertir
   un comando a `async` no elimina por si solo trabajo bloqueante ni contencion.
2. Comprobar orden/indice/cursor y coste de conteos antes de agregar otro motor
   de texto. FTS por palabras no reemplaza substring `LIKE` con la misma semantica.
3. Medir por separado crecimiento de texto, contexto por recapturas, eventos,
   thumbnails y proyecciones de Find; numero de items no alcanza como escala.
4. Optimizar render/bundle o workers persistentes solo contra un coste medido,
   preservando picker caliente, ancla de scroll y verificacion de foco.

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

Separar tiempos de SQL, `history_search`, serializacion/IPC, aplicacion del
snapshot y hotkey -> primer input visible. Un benchmark Rust debug no mide
latencia release del picker; una consulta que devuelve solo IDs no equivale a
una pagina con DTO/thumbnails. Declarar tamaño de contenido, perfil y cache
fria/caliente; evitar builds/suites concurrentes durante la medicion.

Para investigar intermitencia, distinguir datos obsoletos, resultados omitidos,
capturas descartadas y bloqueo real de input. Suites verdes, heartbeats o
`window.show.done` no reemplazan el oracle nativo de interaccion. Verificar
defaults efectivos del driver usado antes de atribuir fallos a SQLite generico.

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
