---
id: 012-codemirror-query-editor
status: complete
created: 2026-09-11
updated: 2026-09-11
---

# CodeMirror 6 Query Editor

## Context

El picker tiene una entrada de búsqueda con autocompletado manual, un tokenizador
parcial basado en el último espacio y una política separada para aceptar una
sugerencia. Esas capas no representan el caret ni la selección real, no cubren
listas y negaciones de forma completa y pueden retener una consulta estructurada
aceptada aunque el mismo texto tipeado se aplicaría en Realtime.

El producto necesita un editor textual potente, local y keyboard-first sin crear
un segundo motor semántico. CodeMirror 6 ya está disponible en el repositorio a
través de `@uiw/react-codemirror`, usado por el editor de contenido; no se
agregan paquetes ni CLIs para este corte.

## Objetivo

Reemplazar el input/popup de búsqueda del picker por una instancia CodeMirror 6
precargada, montada durante el arranque del renderer, estable mientras la ventana
se oculta y reutilizada al reabrir. La consulta completa sigue siendo texto
portable; Rust sigue siendo la autoridad para parsear, aplicar y ejecutar la
búsqueda.

El editor debe permitir descubrir y editar la sintaxis vigente con:

- completion contextual para operadores, alias, valores cerrados, scopes y tags;
- rangos exactos derivados del documento completo y de la selección/caret;
- edición de listas, negaciones, comillas, escapes, Unicode y texto intermedio;
- highlighting discreto y ayuda accesible sin declarar validez que Rust no haya
  concedido;
- undo/redo y selecciones nativas de CodeMirror;
- una política única para texto tipeado, pegado y sugerencias aceptadas;
- foco inicial confiable después del hotkey, sin click manual ni pérdida de la
  primera tecla.

## No objetivos

- Cambiar Rust, SQLite, `history_search` o la gramática vigente para hacer más
  sencilla la completion.
- Crear un parser SQL/consulta alternativo que ejecute o reinterprete filtros.
- Migrar metadata, tags del inspector, contenido de clips o el editor F2 a esta
  superficie.
- Agregar otra WebView, polling para mantenerla caliente, un query builder
  visual o un framework de editor adicional.
- Cambiar el delay nativo del hotkey, el lifecycle de ventanas o la política de
  release/instalación.

## Contrato de la superficie

### Fuentes de verdad

1. `draftQuery`: documento editable actual de CodeMirror.
2. `appliedQuery`: `AppliedSearchDescriptor.displayQuery` y sus resultados,
   actualizado solamente por una aplicación aceptada por la política del picker.
3. Rust: semántica de la consulta y resultado de `history_search`.
4. CodeMirror: documento, selección, transacciones, historial y estado visual.

Una completion es una edición. `typed`, `paste`, `input.complete`, undo y redo
actualizan el mismo `draftQuery`; ninguno crea un estado `committed` ni una
retención especial. El frontend puede mostrar que un draft está incompleto o
pendiente, pero no puede convertirlo en un snapshot aplicado.

### API del editor

La integración debe encapsular CodeMirror en un componente dedicado, con una
instancia `EditorView` estable y props mínimas:

- `value` inicial y sincronización externa explícita para clear/carga de filtro;
- `onChange(value, transactionMeta)` para toda edición del documento;
- `onSubmit()` para la aplicación/activación definida por App;
- `onEscape()` para cerrar completion/ayuda antes de limpiar u ocultar;
- `onFocus()` y `onReady(phase)` para readiness observable;
- catálogo local de tags/scopes/valores, sin red ni datos privados.

El componente no llama `history_search`, no conoce resultados y no decide si
Realtime o Enter aplica la consulta. App conserva esas responsabilidades.

### Completion y rangos

El source recibe el documento completo y `EditorState.selection.main`, no sólo
el último token. Cada opción devuelve `from`, `to`, `label`, `detail` y una
reemplazo compatible con la sintaxis vigente. La sustitución debe conservar
texto fuera del rango, caret y selección coherentes.

Contextos mínimos:

- operador o alias al inicio de token, con soporte de `#` y `-`;
- valores de `tag:`/`#tag` desde tags locales, incluidos Unicode y jerarquía;
- scopes después de `in:` con inclusiones, exclusiones, `metadata`, `all` y
  scopes efectivos heredados;
- valores cerrados de `kind:`, `mime:`, `has:` e `is:` y sus alias;
- claves de contexto (`app:`, `window:`, `domain:`, `source:`, `format:`) y
  fechas (`after:`, `before:`, `on:`) como ayuda, sin inventar valores del host;
- texto libre y valores entre comillas sin popup intrusivo permanente;
- listas separadas por comas, negación explícita, caret en medio y selección
  forward/backward.

`validFor` sólo puede reutilizar opciones mientras no cambie el contexto
semántico, incluyendo comas, negación, scope externo, comillas o alias. No usar
`filter: false` junto con `validFor`. Si no puede producirse un rango veraz, no
se muestra completion.

El highlighting se limita a roles visuales locales (operador, scope, tag,
negación, comilla/error de cierre) y no reemplaza el parser Rust. Los
diagnósticos host sólo se muestran si traen un rango confiable; no se inventan
rangos a partir de una clasificación frontend.

### Teclado, foco e IME

- El editor recibe foco al abrir y al recuperar foco del picker.
- Sin completion visible, ArrowUp/Down, PageUp/PageDown, Home/End y
  Shift+arrows permanecen como edición de texto; `Ctrl+Alt+ArrowUp/Down` mueve
  la selección del feed.
- Con completion visible, ArrowUp/Down y PageUp/PageDown navegan sus opciones;
  Enter acepta sólo si la composición IME está inactiva. Tab conserva el
  recorrido de foco y nunca acepta completion.
- Enter sin completion ejecuta la política de aplicación/activación de App.
- Escape cierra primero completion/ayuda; sólo una segunda intención limpia o
  oculta según la política existente.
- Pegado, composición IME, selección y undo/redo pasan por `onChange` sin
  activar una búsqueda durante composición.
- El editor expone nombre, multilinea y estado de completion para lectores de
  pantalla; el focus ring sigue el tema existente y funciona en ventana angosta.

## Política de aplicación

La política vigente se conserva y se centraliza en App:

- `realtime`: un draft completo y válido aplica tras el debounce existente;
  un draft incompleto/ inválido conserva `appliedQuery`; con
  `deferStructuredSearchUntilEnter`, una consulta estructurada completa espera
  Enter.
- `enter`: editar o pegar deja el draft pendiente; Enter aplica el draft si es
  distinto de `appliedQuery` y completo/válido. Si ya coincide, Enter conserva
  la activación del item seleccionado.
- `Search`/acción explícita aplica desde ambos modos.
- Una consulta incompleta o inválida nunca reemplaza resultados aplicados.
- Realtime, Enter, pegar y aceptar completion usan el mismo clasificador de
  aplicación; no existe `autocompleteCommittedQueryRef`, `held` especial por
  origen ni una segunda política para sugerencias.
- La consulta aplicada conserva su descriptor, cursor, explicación y conteos;
  refresh de foco/clipboard y paginación nunca consumen un draft pendiente.
- AI, escenarios, saved searches, filter lock y scopes heredados conservan sus
  contratos actuales; cambiar el texto sólo deja el contexto propietario si el
  usuario realmente editó la consulta.

## Precarga y residencia

Durante el arranque del renderer principal:

1. importar/evaluar el módulo del editor y catálogos locales;
2. montar una única `EditorView` en el contenedor estable del picker oculto;
3. emitir readiness separada para `module`, `instance`/`input` y `visible`;
   `input` sólo confirma DOM conectado y editable, mientras `visible` exige
   geometría renderizable, documento visible, foco de la ventana y un frame
   posterior al montaje;
4. al hotkey, mostrar, medir si cambió la geometría y enfocar la instancia;
5. al ocultar, conservar la instancia, documento e historial; destruir sólo al
   desmontar la superficie real.

El hotkey caliente no importa módulos, crea `EditorState`, crea `EditorView` ni
registra handlers. No prometer costo cero para el primer arranque, reload,
crash/salida del proceso o throttling prolongado; medirlos por separado. La
señal `visible` es una observación del renderer; la primera tecla visible en
Tauri sigue requiriendo screenshot/AX y no se sustituye por `onReady`.

## Migración y limpieza

- Retirar `searchSuggestions`, popup/listbox manual, índice/dismiss del
  autocomplete y `autocompleteCommittedQueryRef` del picker una vez que el
  editor sea el único dueño de completion.
- Conservar helpers de clasificación/scopes sólo si siguen siendo la misma
  lógica de política o pruebas; eliminar `activeToken`/reemplazo por último
  espacio si quedan sin consumidores.
- No duplicar la superficie ni dejar un input oculto que capture teclado en
  paralelo al editor.
- Mantener el `SearchScopePicker` y controles Mantine circundantes cuando no
  compitan por foco o completion.

## Verificación obligatoria

La implementación se acepta sólo con evidencia reproducible, separando
mediciones cálidas de arranque frío:

1. pruebas focalizadas de completion/rangos/selección, clasificación de draft,
   política Realtime/Enter y regresiones de la matriz:
   `in:content,title,-notes,`, `in:metadata,-notes`, `in:-context`, `in:` con
   scopes heredados, listas de tags, negaciones, aliases, comillas/escapes,
   caret intermedio y Unicode;
2. build TypeScript/Vite y checks focalizados del editor, sin suites globales
   durante la edición;
3. Tauri real con `computer`: inicio frío, primer hotkey durante arranque,
   reapertura caliente, después de idle, click, pegar, undo/redo, Escape,
   Tab/Enter y foco sin click;
4. Oracle C0: app externa enfocada -> hotkey foreground -> type global sin
   apuntar/enfocar Copicu antes de escribir -> confirmar token sintético y
   ventana enfocada; AX solo no certifica WebView2;
5. IME real si hay disponibilidad; eventos sintéticos se reportan como
   insuficientes;
6. bundle final, primera tecla visible, memoria/CPU idle, instancia residente y
   ausencia de import/build al hotkey caliente. No usar `window.show.done` como
   sustituto de primera tecla.

## Resultado De La Verificacion

Corte implementado y verificado el 2026-09-11: build, 16 pruebas focalizadas,
source real de completion con seleccion/sufijos y undo/redo, regresion de late
flush y smoke Tauri con frontend compilado. Primer show, warm y post-idle
conservaron escritura global sin foco manual. Protocolo, bundle, CPU/memoria y
cotas por screenshot viven en el topic `codemirror-query-editor`.

IME real no disponible en este Windows. La aceptacion funcional no certifica
un benchmark comparativo del input anterior ni rendimiento de una release.
Publicado e instalado como `v0.4.17`; version del ejecutable, apertura por
shortcut y escritura con cursor visible comprobadas en la instalada.

## Riesgos y límites

- WebView2 puede throttlear una ventana oculta; readiness oculta y primer frame
  visible deben permanecer diferenciadas.
- La completion local puede quedar desalineada con el tokenizer Rust. Por eso
  sólo ayuda y nunca aplica semántica propia; cualquier cambio backend exige una
  decisión explícita.
- La instancia residente aumenta memoria/CPU idle. Medir antes de declarar el
  tradeoff aceptable.
- Si una prueba nativa requiere acción humana (IME, foco de una app externa),
  usar la intervención canónica de Orca y reportar exactamente qué no se pudo
  observar.
