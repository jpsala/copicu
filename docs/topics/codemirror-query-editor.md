---
id: codemirror-query-editor
status: active
kind: reference
triggers:
  - CodeMirror
  - autocomplete
  - editor de consultas
  - query editor
  - precarga
  - picker instantaneo
primary_refs:
  - filtering-and-query-syntax.md
  - performance-and-memory.md
  - picker-interaction.md
  - ../tracks/008-filtering-search-foundation.md
  - ../../scripts/research/codemirror-bundle-study.mjs
  - ../../scripts/research/codemirror-range-study.mjs
  - ../../scripts/research/codemirror-preload-study.mjs
---

# Editor Textual De Consultas Con CodeMirror 6

## Estado Y Decision De Producto

Estudio realizado el 2026-09-11. JP autorizo implementar CodeMirror 6 en una
sesion nueva con Luna Max y supervision del owner de la investigacion. El corte
esta implementado y verificado; este archivo conserva estudio, contrato,
evidencia nativa y limites, sin certificar rendimiento comparativo de release.

La restriccion inicial de conservar input nativo, popup y atajos fue retirada
explicitamente por JP. El filtro debe seguir siendo texto libre; UX, presentacion,
interaccion y arquitectura pueden replantearse por completo. Se busca una base
extensible y poderosa para descubrir, escribir y editar toda la sintaxis admitida.
Una consulta puede tener presentacion compacta o expandida; no se impone una
sola linea visual ni se autoriza cambiar silenciosamente su significado.

Decision: avanzar con CodeMirror precargado, montado y residente en la WebView
principal. No cargarlo ni construirlo al recibir cada hotkey. La recomendacion
previa de Mantine como opcion preferida por continuidad ya no gobierna este trabajo.
Mantine puede seguir en controles circundantes; no debe competir con el popup,
seleccion ni teclado de CodeMirror.

## Invariantes

- La cadena de texto es la fuente de verdad editable y portable: escribir,
  pegar, copiar y modificar una consulta no exige un query builder visual.
- Rust conserva autoridad semantica y de ejecucion. Una representacion tolerante
  del texto incompleto en frontend sirve al editor, no a un segundo motor SQL.
- No modificar Rust/SQLite ni ampliar la gramatica para resolver completion UI.
  Un cambio de contrato backend que resulte indispensable requiere decision
  explicita, no una ampliacion incidental.
- Separar documento/seleccion, asistencia de lenguaje y query aplicada/resultados.
- Aceptar una sugerencia es edicion. El origen del cambio no crea una politica
  de aplicacion distinta de tipear o pegar el mismo texto.
- Preservar las opciones Realtime/Enter y confirmacion estructurada, aunque se
  rediseñen controles o bindings. Una consulta incompleta/invalida conserva el
  snapshot aplicado. Composicion IME no debe activar busqueda o aceptar opciones.
- Mantener busqueda local, foco inicial confiable, accesibilidad y primera tecla
  sin click/foco manual tras hotkey. No enviar queries, clips ni tags a terceros.
- El campo conserva el fondo estandar sin tinte de linea activa. El cursor
  dibujado usa color de texto, 2 px y no parpadea; el contenido deja margen para
  no recortarlo al inicio. `drawSelection` conserva selecciones multiples y
  oculta el caret nativo: `caret-color` solo no controla el cursor visible.
  Placeholder tambien usa tokens del tema.
- No instalar paquetes, CLIs o binarios sin permiso explicito. Paquetes ya
  disponibles pueden estudiarse; disponibilidad transitiva no sustituye declarar
  correctamente dependencias directas al integrar.

## Comparacion De Alternativas

| Base | Ventaja | Costo o limite para esta necesidad |
| --- | --- | --- |
| Input nativo + Mantine Combobox | Edicion nativa y popup del stack existente | Rangos, historial de ediciones programaticas, resaltado/diagnosticos y lenguaje requieren mas infraestructura propia |
| CodeMirror 6 | Documento textual, transacciones, selecciones, rangos mapeados, completion, extensiones y paquetes de lenguaje | Carga inicial, montaje DOM, integracion de foco y soporte propio de la sintaxis Copicu |
| Monaco | Modelos y providers de completion/hover, capacidades tipo IDE | Integracion mas amplia sin necesidad identificada de un IDE; no se midio su costo local |
| Lexical / editor de documentos | Nodos personalizados y texto enriquecido | Modelo de documento menos directo para una query que debe conservarse como texto |

CodeMirror no deduce `in:`, comas, negacion ni tags. Su CompletionSource debe
producir el contexto, rango y opciones correctos. El ejemplo `matchBefore(/\w*/)`
no constituye un motor de consultas. Que siga haciendo falta codigo de dominio
no invalida el valor de transacciones, tracking de rangos y lifecycle del editor.

Precedentes primarios: Prometheus mantiene una extension CodeMirror para PromQL
con completion, highlighting y linting. Grafana documenta un Code mode con
completion y ayuda para consultas. Son precedentes de arquitectura/experiencia,
no pruebas de performance o compatibilidad con Copicu ni paquetes a instalar.

## Hallazgos De La Implementacion Anterior

Puntos de entrada del estudio: `src/shared/search.ts`, `src/main.tsx`,
`src/ui/EditableTokenCombobox.tsx`, `src/ui/ItemContentEditor.tsx` y
`tests/structured-search.test.mjs`.

- `activeToken` y `replaceActiveSearchToken` usan el ultimo espacio e ignoran
  selection/caret. La limitacion afecta edicion intermedia y listas.
- El popup manual mezcla `activeSearchSuggestion`, `dismissedAutocompleteQuery`
  y estado de busqueda. Dismiss por igualdad de query puede vetar reapertura al
  regresar al mismo texto/cambiar caret, pero NO quedo confirmada como causa
  concreta del repro `in:content,title,-notes,` sin popup.
- `acceptSearchSuggestion` marca `autocompleteCommittedQueryRef` y publica held
  para queries estructuradas. `shouldHoldStructuredSearchDraft` retiene por
  autocomplete activo/committed. Esto explica la politica distinta frente al
  tipeo y requiere corregirse con cualquier libreria.
- `EditableTokenCombobox` ya usa Mantine, pero conserva indice, teclado y ARIA
  manuales. No copiarlo como solucion completa para el editor de query.
- El handler Mantine instalado ejecuta onKeyDown del consumidor antes de su
  propio teclado y no consulta defaultPrevented; Enter acepta opciones.
  CodeMirror tambien acepta con Enter por defecto y no liga Tab a aceptar.
  Los bindings del picker anterior no son un requisito de la nueva UX.
- La integracion actual conserva Enter como aceptacion de completion de CodeMirror;
  no agrega `acceptCompletion` a Tab. Tab sigue disponible para recorrido de foco:
  cualquier rediseño de atajos debe cambiar este contrato y su smoke, no prometer
  una aceptacion que el binding instalado no ejecuta.
- `@uiw/react-codemirror` permite configuracion minima, pero su wrapper instalado
  usa un latch de 200 ms para diferir ciertos cambios externos mientras se
  escribe; esto NO retrasa su onChange normal. `QueryEditor` sincroniza cambios
  realmente externos con `ExternalChange` y una guarda del ultimo valor emitido,
  evitando que Clear o una carga externa resuciten texto stale sin remount.
- Los tests anteriores verdes describian comportamiento existente; no probaban
  que la UX reportada por JP fuera correcta.

## Precarga Y Residencia

### Lo Que El Codigo De Copicu Permite

`src-tauri/tauri.conf.json` crea main con `visible:false`. Su lifecycle es
CachedHidden: hide y cierre conservan la WebView. Show restaura bounds, muestra,
unminimiza y enfoca; no reconstruye main. `src/boot.tsx` ya instrumenta import
inicial de main. `QueryEditor` expone fases `module`, `instance` e `input`; no
existe una señal precisa de primer frame visible.

El App principal se monta en la ventana oculta. CodeMirror entra por el
`QueryEditor` residente del picker y conserva una sola `EditorView` al cambiar
query, resultados o visibilidad. No precargar `ItemContentEditor` como sustituto
del editor de consultas, porque incluye responsabilidades de edicion de
clips/metadata ajenas al buscador.

La politica de `performance-and-memory.md` prioriza picker caliente sobre ahorro
agresivo de memoria. No crear otra WebView solo para precargar CodeMirror.

### Estrategia Recomendada

1. Arranque del renderer main: iniciar carga del modulo dedicado del editor.
2. Preparar extensiones/catalogos locales y montar una sola EditorView en el
   contenedor estable del picker, mientras la ventana esta oculta.
3. Conservar instancia al ocultar/reabrir; destruir solo al desmontar realmente
   la superficie. No cambiar key por query/resultados/visibilidad.
4. Hotkey: mostrar y enfocar la instancia existente; no importar ni construir.
5. Al mostrarse/cambiar geometria, solicitar requestMeasure si corresponde.
   Montaje oculto no prueba que WebView2 haya resuelto el primer layout/paint.
6. Separar readiness de modulo, instancia/input y primer frame visible. No
   condicionar readiness oculta unicamente a requestAnimationFrame/idle,
   susceptibles de throttling. No agregar polling para mantener el editor caliente.

`modulepreload` obtiene, parsea y compila para posterior ejecucion; `import()`
ademas evalua y reutiliza el modulo en el mismo entorno. Ninguno crea por si
solo EditorState, EditorView, DOM o handlers. Importar en otra WebView no prepara
la instancia del picker. Import dinamico no significa que evaluacion/montaje
se ejecuten fuera del hilo UI.

El primer hotkey DURANTE el arranque, reload/crash, salida real del proceso e
idle prolongado son escenarios distintos de una reapertura caliente. No prometer
costo cero ni ocultar el arranque frio dentro de una medicion warm.

## Evidencia Reproducible

Ejecutar desde la raiz del repo, sin instalar paquetes:

```text
node scripts/research/codemirror-bundle-study.mjs
node scripts/research/codemirror-range-study.mjs
node scripts/research/codemirror-preload-study.mjs
```

Son herramientas manuales de investigacion, no tests de produccion ni parte del
build. Usan datos sinteticos. No controlan navegador, WebView2 ni clipboard.

### Bundle Vite En Memoria

Build de produccion con `write:false`, inyeccion temporal por plugin y suma del
chunk que contiene main.tsx mas sus imports estaticos transitivos. La variante
`baseline` es el checkout actual real, con `src/main.tsx` sin inyeccion de probe;
las otras variantes agregan imports de prueba sobre ese mismo checkout. Gzip
sumado por chunk; no equivale al trafico/decodificacion real del protocolo Tauri.

| Variante | Grafo main raw B | Grafo main gzip B | JS total raw B | JS total gzip B |
| --- | ---: | ---: | ---: | ---: |
| Baseline checkout actual | 1094252 | 333630 | 1516168 | 462242 |
| Exponer Combobox/useCombobox | 1094314 | 333630 | 1516230 | 462243 |
| Exponer CM state/view/keymap/autocomplete | 1094435 | 334189 | 1516362 | 462795 |

Sobre el checkout actual, la variante CM del probe cambia el grafo main en
183 B raw / 559 B gzip frente a baseline; no es el delta total de la UI porque
CodeMirror ya forma parte de la ruta principal. Estos bytes no prueban latencia
de cold-open o primera tecla.

### Rangos Y Seleccion

El spike compara reemplazo de string y transacciones EditorState para coma
final en in:, exclusion dentro de una lista, caret en medio de title, -tag:wo,
segundo tag tras coma y Unicode. Conserva el resto de la query y la posicion
final. Cubre seleccion en ambos sentidos; rechaza selecciones entre segmentos,
formas con comillas/escapes y regex fuera del alcance del spike.

Ese rechazo es un LIMITE DEL EXPERIMENTO, no el contrato final: el editor de
produccion debe preservar/soportar la sintaxis vigente completa. El spike no
implementa todas las reglas de scopes/herencia ni seleccion de candidatos.
La matriz de aplicacion que contiene es el contrato propuesto, no un fix de la UI.

### Imports Y Operaciones De Estado

Node v24.16.0, win32 x64. Versiones efectivas: state 6.7.1, autocomplete 6.20.3,
commands 6.10.4, language 6.12.4, view 6.43.7.

| Operacion | N | Mediana ms | p95 ms |
| --- | ---: | ---: | ---: |
| Imports en procesos nuevos | 15 | 53.802 | 67.139 |
| Imports repetidos en el mismo proceso | 25 | 0.109 | 0.329 |
| Crear estado con extensiones | 25 | 0.055 | 0.517 |
| Transacciones sinteticas, promedio por operacion | 25 lotes de 64 | 0.010 | 0.039 |
| Crear estado + completion edit + undo/redo | 25 | 0.109 | 0.425 |

Consulta inicial de 16384 caracteres, reemplazos sucesivos sinteticos. El
benchmark de estado incluye history, autocompletion, keymaps y extensiones de
language, pero NO un parser de Copicu ni EditorView/DOM. Verifica realmente
`tag:al -> tag:alpha -> undo tag:al -> redo tag:alpha` con APIs de estado.

El timer de proceso nuevo excluye startup Node; no se purgo cache de disco.
N=15 da un p95 muestral equivalente al maximo. No interpretar estas medidas
como popup, parseo Copicu, keystroke, WebView2, memoria ni CPU idle.

### Verificacion Nativa Y Limites

La aceptacion supervisada uso `npm run build` y `npm run dev:built`, con assets
compilados, backend Rust debug y el perfil aislado existente. Ambos procesos
dev estuvieron supervisados por `hub`; la app instalada no se toco. Este modo
evita mezclar transformaciones/HMR de Vite con respuesta del editor.

Oracle C0: Run de Windows enfocado -> `Alt+Win+C` foreground -> espera explicita
de 150 ms -> tipeo global, sin obtener ni enfocar Copicu antes de escribir.
Capturas programadas desde 300 ms, recortadas al campo para no conservar clips:

| Caso | Inicio del tipeo desde hotkey | Primera captura con tecla visible |
|---|---:|---:|
| Primer show de proceso nuevo, despues de registrar el shortcut | 165.0 ms | 329.3 ms |
| Reapertura warm de la misma instancia | 169.8 ms | 344.4 ms |
| Reapertura despues de mas de 15 s oculto | 164.6 ms | 330.1 ms |

Son tres observaciones y cotas superiores por screenshot, NO latencia exacta,
percentiles ni tiempo desde lanzar el proceso. Incluyen la espera explicita;
no se vacio cache del sistema. La tecla ya era visible mientras el badge aun
decia `Filtering`, separando respuesta del editor de resultados SQL/IPC.
Tambien se observo completo el token largo `C0BuiltColdFinal` sin foco manual.
Una captura temprana sin texto no prueba perdida: hay que observar su desenlace.

Las muestras previas con Vite de 144/184 ms warm y 155/197 ms post-idle eran
ventana visible/screenshot. La confirmacion AX y foto a 2327/2360 ms eran tiempos
de observacion, no primera pintura. Ni `window.show.done`, rAF ni AX aislado
sustituyen pixeles observados; no comparar cold Vite con una release.

El popup corregido se verifico en Tauri compilado con opciones seleccionadas,
no seleccionadas y detalles legibles. Enter acepta sin activar un clip; Tab
cierra sin aceptar y recorre foco, saltando el textarea AI oculto. Pegar,
undo/redo y Escape se probaron en la superficie real.

Los comandos `> scenario` y `> escenario` se resuelven desde el documento
completo antes del guard de token vacio. App y editor reutilizan
`scenarioCommandSearch`: nombres con espacios, alias y espacio final pasaron
tres casos del source real. El popup nativo se verifico sin activar un modo.
Cambiar a AI y volver conserva texto y foco; no se envio una consulta al proveedor.
Los locators Playwright se migraron y pasaron `node --check`; esa suite no se
ejecuto. La evidencia visual y de teclado de este corte es Tauri nativo.

Muestra oculta estabilizada del modo compilado: nueve procesos Copicu/WebView2,
sin Vite/build, durante 5.1914 s. Suma de working sets: 737.7 MiB; private bytes:
439.6 MiB. CPU acumulada: 0.53125 s, equivalente a 10.23 % de un core o 0.64 %
de la maquina de 16 procesadores logicos. La suma de working sets cuenta
paginas compartidas varias veces; no es RAM fisica unica. Es el costo de toda
la app, no el incremental de CodeMirror; falta baseline comparable del input
anterior para atribuir diferencias o certificar rendimiento de release.

Grafo JS estatico final desde `dist/index.html`, incluyendo imports estaticos
recursivos y excluyendo chunks lazy: 1095165 bytes raw / 336748 gzip. Frente a
la muestra pre-editor guardada: +399377 raw / +130416 gzip para el corte completo,
no para la biblioteca aislada. Se conserva la precarga en el camino critico.

Windows solo expuso `en-US: 0409:00020409`, sin IME configurado para smoke real.
La prueba con una transaccion CodeMirror real `input.compose` verifico que su
anotacion historica no reactiva composicion tras `compositionend`; el texto
final se conserva y los flags vigentes siguen reteniendo busqueda. Esto no
certifica un IME del sistema. No agregar uno sin autorizacion.

El harness legacy `measure-window-lifecycle` usa CDP/Playwright: no ejecutarlo
contra la politica actual. Tauri nativo se verifica con `computer`; paginas
web interactivas con `axi_browser`. No conservar contenido privado en pruebas.

## Diseño De La Integracion

Tres capas, sin frameworks extra por defecto:

1. Editor: documento, seleccion, transacciones, undo/redo, DOM, foco y popup CM.
2. Soporte del lenguaje Copicu: contexto tolerante de edicion, operadores,
   valores, rangos, completion, highlighting y ayuda contextual.
3. Aplicacion: politica Realtime/Enter, query aplicada y resultados autoritativos.

Contrato orientativo del motor: query completa + anchor/head + catalogos/scopes
-> CompletionResult.from/to autoritativos + opciones. El source devuelve el rango
que CM debe aplicar; `Completion.apply` consume ese mismo `from/to`, incluso si
la seleccion cubre una clausula completa. Un cambio de scopes conserva una
seleccion semantica y recomputa la query actual al aceptar, sin capturar un
preview textual que destruya texto ajeno.

Friccion reproducible de descubribilidad: con `content,title` heredados,
completar `in:ti` con `Title` genera `in:content,title`, mientras escribir
`in:title` limita a Title. El detalle `Explicitly included` describe el estado,
no la consulta resultante. Es el contrato aditivo vigente, no una regresion.
Antes de cambiar su semantica, evaluar mostrar la query resultante en la
sugerencia; reemplazar literalmente perderia la preservacion de heredados.

CodeMirror expone from/to, validFor, update/map, snippets, info/detail,
activateOnCompletion y Compartments. Usar solo lo necesario:

- Completion de operadores y valores con descripcion breve y progresion operador
  -> valor; texto libre no debe generar un popup intrusivo permanente.
- Listas, negaciones, aliases, tags jerarquicos/Unicode, scopes efectivos,
  comillas/escapes y edicion intermedia respetan sintaxis vigente.
- Resaltado discreto y ayuda del elemento bajo el cursor, con acceso por teclado.
- Undo/redo y seleccion nativos de CM; aceptacion como transaccion coherente.
- Presentacion compacta que permita leer/editar consultas largas sin alterar
  silenciosamente whitespace significativo. Expansion visual no amplía gramatica.
- Diagnosticos del host se muestran sin inventar rangos si el contrato no los
  entrega. Frontend no puede afirmar una validez semantica que Rust no concedio.

validFor solo reutiliza opciones mientras el contexto sigue vigente: comas,
negacion, clausulas externas, tags o defaults pueden invalidarlo. No combinar
filter:false con validFor (contrato instalado lo prohibe). No reutilizar la
query inicial capturada en closures de apply tras ediciones posteriores.

Binding nuevo debe tener un unico dueño y precedencia explicita para completion,
snippets, edicion y acciones del picker. Con completion activa, Enter acepta la
opcion y no llega a App; sin completion, Enter ejecuta la politica de App. Tab
conserva el recorrido de foco y nunca acepta completion. Un mismo keypress no
debe aceptar sugerencia Y activar un clip/aplicar efectos extra.
Escape cierra la capa activa antes de descartar/esconder. Composicion IME gana
sobre bindings de completion y aplicacion; una transaccion `input.compose`
posterior a `compositionend` no prueba composicion vigente. No asumir que
basicSetup protege handlers externos personalizados.

La configuracion recomendada es explicita, sin cargar por reflejo un IDE:
historia, keymaps pertinentes, completion, presentacion accesible y soporte de
lenguaje. Sin gutters, plegado, autoindentacion, themes o language packs ajenos
si no aportan a la query. No hace falta React Aria/Ariakit/Downshift/LSP para ello.

## Aceptacion De La Implementacion

- Crear/actualizar spec local antes de un cambio grande; decisiones de UX y
  teclado claras. Retirar estados/handlers manuales obsoletos, sin dos sistemas.
- Query completa accepted/typed/pasted: mismo criterio de aplicacion; realtime
  sin confirmacion aplica, Enter/confirmacion espera, incompleta/invalida retiene.
- Repros: in:content,title,-notes,; in:metadata,-notes; in:-context; nuevo in:
  con scopes heredados; listas tag:work,personal; -tag:work; aliases; texto con
  comillas/escapes; caret intermedio; seleccion forward/backward; Unicode.
- Preservar regex inicial exclusivo, texto plain, historial aplicado y filtros
  guardados/scenarios/AI que compartan la superficie, sin reinterpretarlos.
- Probar inicio en frio, hotkey durante inicio, reaperturas y despues de idle;
  comprobar que warm show no importa/reconstruye editor. Medir primera tecla
  visible, no solo window.show.done, y separar SQL/IPC del editor.
- Oracle C0 nativo: app externa -> hotkey foreground -> type global sin apuntar
  ni enfocar Copicu -> token sintetico visible. AX solo no certifica WebView2.
- Validar IME real cuando haya IME disponible; eventos sinteticos no lo certifican.
  Si requiere intervencion humana, solicitarla por la tool canonica.
- Probar teclado, click, pegar, undo/redo, selecciones, Escape, Tab/Enter y foco
  al reabrir. Cero teclas perdidas, cero click/foco manual requerido.
- Smoke de teclado: Enter acepta una completion activa; Tab no la acepta por
  defecto en este binding y conserva el recorrido de foco. No duplicar Enter como
  aceptacion y aplicacion de clip en el mismo keypress.
- Medir bundle final, latencia nativa comparada, memoria/CPU idle y estabilidad
  de instancia; no inventar umbrales satisfechos ni inferir Tauri desde Node.
- Tests focalizados que defiendan comportamiento; build/checks finales una vez
  integrado. Reiniciar/recargar dev, preservar instalada y no publicar release
  ni instalar sin gate correspondiente. Supervision acepta evidencias, no solo
  reporte de compilacion verde.

## Fuentes Primarias

- https://codemirror.net/docs/guide/
- https://codemirror.net/examples/autocompletion/
- https://codemirror.net/examples/config/
- https://codemirror.net/examples/lang-package/
- https://codemirror.net/examples/lint/
- https://discuss.codemirror.net/t/editor-not-displaying-new-text/7842
- https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/rel/modulepreload
- https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/import
- https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/performance
- https://mantine.dev/core/combobox/
- https://github.com/uiwjs/react-codemirror
- https://github.com/microsoft/monaco-editor
- https://lexical.dev/docs/intro
- https://raw.githubusercontent.com/prometheus/prometheus/main/web/ui/module/codemirror-promql/README.md
- https://grafana.com/docs/grafana/latest/datasources/prometheus/query-editor/
