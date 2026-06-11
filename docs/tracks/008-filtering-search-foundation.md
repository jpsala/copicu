---
id: filtering-search-foundation
status: active
updated: 2026-06-07
---

# Filtering Search Foundation

Trabajo vivo para convertir la busqueda del picker en una base potente, local y reutilizable por AI/actions/plugins.

Topic estable: `docs/topics/filtering-and-query-syntax.md`.

Topic de arquitectura nueva: `docs/topics/search-plan-engine.md`.

## Estado Actual

Primer corte implementado 2026-06-05:

- parser de query syntax en Rust (`src-tauri/src/storage.rs`);
- `list_history_page` ejecuta filtros estructurados y mantiene keyset pagination;
- busqueda plain sigue funcionando;
- soporte para frases, negacion, `tag:`/`#tag`, `kind:`, `mime:`, `has:`, `after:`, `before:`, `on:` y relativos simples;
- soporte implementado para checked/marked con `is:marked`, `is:checked`, `is:unmarked`, `is:unchecked` y negaciones equivalentes;
- placeholder/title del search input muestra ejemplos basicos;
- `list_history_page` devuelve `totalCount` y `filteredCount`;
- badge del picker muestra total real y, con filtro, `filtered / total matches`;
- tests Rust cubren parser, filtros combinados y fechas ISO.

Actualizacion 2026-06-06:

- agregado contrato host `history_search(HistorySearchRequest)` como API conceptual reusable para picker, scripts y futuro AI planner;
- el picker principal ahora llama `history_search`; `list_history_page` queda como wrapper compatible;
- `copicu.history.search()` usa `storage.history_search`, asi no queda como ruta separada de scripting;
- `HistorySearchRequest` acepta `mode: "plain" | "structured" | "ai"`, `includeContent` y `explain`;
- `mode: "ai"` aun no llama modelo: emite warning y usa busqueda estructurada local;
- `HistoryPage` agrega `interpretedQuery`, `explanation` y `warnings`;
- agregada configuracion AI en Settings/backend, deshabilitada por defecto: endpoint OpenRouter compatible, model id y nombre de env var para API key;
- primer AI planner manual implementado: `ai:` en picker -> `history_search({ mode: "ai" })` -> runner Node con Vercel AI SDK + Zod -> query syntax local validada -> ejecucion structured;
- no envia contenido de clips al modelo; fallback a structured local con warning si AI esta apagada/falla;
- el filtro por checked ya existe: la UI escribe `is:marked` o `-is:marked` desde el menu de mark;
- el backend parsea esos terminos en `marked_filters` y genera `is_marked != 0` / `is_marked = 0`;
- aliases soportados: `checked`, `unmarked`, `unchecked`;
- `selected` queda explicitamente fuera: es estado transitorio del picker, distinto de checked/marked persistido;
- las acciones sobre checked cargan todos los items marcados via `list_history_page({ query: "is:marked" })`;
- faltaba documentarlo en el topic estable, no implementarlo.

Checks pasados:

```powershell
npm run build
npm run visual:check
cd src-tauri; $env:CARGO_TARGET_DIR='target-codex-check'; cargo check
```

Nota 2026-06-06: `npm run rust:test` compila pero vuelve a fallar al arrancar el binario con `STATUS_ENTRYPOINT_NOT_FOUND` conocido.

Actualizacion 2026-06-07:

- primer slice de `SearchPlanV1` implementado en `src-tauri/src/storage.rs`;
- `HistorySearchRequest` acepta `plan?: SearchPlanV1` y mantiene `query` compatible;
- la query syntax actual se convierte internamente a `SearchPlanV1` antes de compilar SQL;
- compiler Rust genera `WHERE`, parametros, `ORDER BY` y `LIMIT` desde enums/campos permitidos;
- soportado: `text.all`, `text.any`, `text.phrases`, `text.exclude`, `kind`, `mime`, `has`, `missing`, `marked`, fechas absolute/relative, sort y limit;
- compatibilidad preservada para `tag:`/`#tag`, `-tag`, `-kind` y `-mime` como campos de plan de compatibilidad (`tags`, `notTags`, `notKind`, `notMime`);
- `copicu.history.search()` y `list_history_page` siguen funcionando con query string;
- tests Rust agregados para compiler parametrizado, fecha relativa y ejecucion con plan directo.

Actualizacion AI actions 2026-06-07:

- el planner AI ya no queda limitado a `search_history`: acepta `history_action`;
- primer tool habilitado: `mark_positions`, que ejecuta una busqueda local y marca/desmarca posiciones 1-based del resultado;
- ejemplo esperado: `ai: mark the 8, 9 and 10nth` -> `history_action` con `positions: [8, 9, 10]`;
- Rust valida intent/action, cantidad de posiciones, rango y query antes de ejecutar;
- no hay SQL, shell, filesystem ni clipboard crudo desde AI;
- decision posterior de JP: no seguir agregando tools puntuales sin preguntar; el proximo experimento preferido es `AI Script Mode v1`, donde el modelo genera scripts temporales contra `copicu.*` host API.

Decision AI Script Mode 2026-06-07:

- objetivo: probar un modo poderoso tipo chat que pueda operar sobre el clipboard sin hardcodear frases;
- el modelo genera JS/TS temporal y Copicu lo ejecuta contra APIs host permitidas;
- no usar SQLite crudo, shell, `fs`, network ni imports externos en el primer corte;
- no agregar capabilities nuevas sin confirmacion explicita;
- usar APIs existentes de Actions/Scripting siempre que alcance;
- mostrar/registrar script, capabilities y resumen antes/despues de ejecutar;
- casos objetivo: `mark 3 more randomly`, agregar tags a candidatos, juntar snippets y copiarlos.

Implementado AI Script Mode v1 foundation 2026-06-07:

- agregado `scripts/ai-script-planner.mjs`, separado del planner de busqueda anterior;
- agregado comando Tauri `ai_script_run`;
- el comando genera un script temporal `defineAction({...})`, devuelve script/capabilities/summary/warnings y lo ejecuta via el runner existente;
- el runner temporal usa APIs host ya existentes y action logging normal;
- validaciones bloquean imports, `require`, `process`, `fetch`/network, browser storage, `eval`/`Function` y construcciones equivalentes del primer corte;
- `history.update` ahora acepta `marked` como metadata, usando la capability existente `history:write-metadata`;
- prueba mock sin red valido el caso principal con script generado para `mark 3 more randomly`: `history.search("is:unmarked")`, seleccion aleatoria en JS y `history.update(id, { marked: true })`.

Fix 2026-06-07:

- se retiro el plan especifico `mark_positions` del planner AI de busqueda;
- `ai:` ahora usa el planner viejo solo para clasificar `search_history` vs `history_action`;
- si la intencion es `history_action`, delega a AI Script Mode generico con `run_ai_script`, evitando errores de posiciones fuera de rango y tools puntuales hardcodeadas.

Cierre AI Script Mode dogfood 2026-06-07:

- `ai:` quedo como entrada practica para acciones AI temporales:
  - `scripts/ai-query-planner.mjs` clasifica `search_history` vs `history_action`;
  - para `history_action`, devuelve `run_ai_script`;
  - `scripts/ai-script-planner.mjs` genera TS temporal con `defineAction({...})`;
  - Rust ejecuta el script con el runner existente y APIs `copicu.*`.
- Se mantuvo la decision de no sumar capabilities nuevas:
  - sin SQLite crudo;
  - sin shell;
  - sin filesystem;
  - sin network;
  - sin imports externos;
  - sin tools puntuales como `mark_random` o `mark_positions`.
- Bridge usado para marcar:
  - `copicu.history.search(query, { limit, content })`;
  - `copicu.history.update(id, { marked: true | false })`;
  - `copicu.log.*`;
  - `copicu.ui.toast`.
- `history.update({ marked })` usa el camino nativo de marcado cuando el patch solo cambia `marked`, para no depender de edicion de texto ni fallar con items sin texto plano.
- `AiScriptPlan` incluye `displayQuery` para separar:
  - query de trabajo del script, por ejemplo `open is:unmarked`;
  - query a mostrar despues de la accion, por ejemplo `open`, `open is:marked` o query vacia para historial completo.
- Bugs corregidos durante dogfood:
  - refresh post-accion usaba la frase natural y vaciaba la lista;
  - acciones globales con `displayQuery: null` volvian a buscar la frase natural en vez de mostrar todo;
  - "solo mostrá esas" mostraba todos los matches del texto en vez de `is:marked`;
  - el panel `AI interpreted` era demasiado bajo y cortaba resumen/warnings.
- Casos reales probados desde UI:
  - `marcá 3 con el texto openrouter`;
  - `desmarcá todas y marcá las primeras 3`;
  - `desmarcá todas y marcá las primeras 3 con el texto open, solo mostrá esas`.
- Debug DB local sin imprimir payload confirmo flags de marcado por IDs y conteos para `openrouter`.
- Tests agregados/actualizados:
  - `npm run ai:planner:test`;
  - `node --test tests/ai-script-planner.test.mjs`;
  - `npm run build`;
  - `cargo check`.

Checks pasados para este corte:

```powershell
npm run build
cd src-tauri; $env:CARGO_TARGET_DIR='target-codex-check'; cargo check
```

Nota 2026-06-07: `npm run rust:test` compila pero falla al arrancar el binario con `STATUS_ENTRYPOINT_NOT_FOUND`, mismo bloqueo conocido.

## Decision De Producto

La busqueda poderosa arranca deterministica. AI debe ser un traductor/ayudante arriba de este contrato, no el motor primario.

Razon:

- resultados reproducibles;
- menor costo;
- funciona offline;
- facilita debug;
- el futuro AI planner puede emitir un plan validado en vez de tocar SQL o ejecutar comandos.

## Proximo Corte Recomendado

### Slice AI Script Mode Hardening

Objetivo: convertir el experimento en una herramienta confiable para dogfood diario.

Implementar:

- preview/confirmacion para acciones masivas o destructivas antes de ejecutar scripts generados;
- UI/debug visible para script generado, capabilities, `displayQuery`, resumen y resultado, sin payload real;
- tests de planner para patrones de display:
  - mostrar todo (`displayQuery: null`);
  - mostrar filtro de texto (`open`);
  - mostrar solo afectados marcados (`open is:marked`);
  - no usar queries intermedias como `is:unmarked` para refresh;
- clasificacion mas clara entre busqueda pura y accion;
- mejor manejo de "primeras N" segun orden actual visible vs orden global;
- registrar metadata redacted de AI runs: provider/model/status/duracion/error class, no source/payload completo salvo modo debug explicito.

No hacer aun:

- SQL generado por AI;
- filesystem/shell/network;
- nuevas capabilities sin confirmacion de JP;
- enviar contenido real del clipboard al modelo por defecto.

### Slice A: SearchPlanV1 Compiler

Objetivo: ampliar el contrato de busqueda sin permitir SQL crudo generado por AI.

Estado: primer slice implementado 2026-06-07.

Implementado:

- tipos Rust/TS para `SearchPlanV1`;
- compiler Rust `SearchPlanV1 -> WHERE + params + ORDER + LIMIT`;
- fecha relativa generica (`3d`, `12h`, `2w`) resuelta en Rust;
- conversor inicial `query syntax -> SearchPlanV1`;
- tests de fechas relativas, `has:metadata`, `kind`, texto, marked y sort;
- mantener `history_search` compatible con query string mientras se migra AI.

Ejemplo objetivo:

```json
{
  "schemaVersion": 1,
  "filters": {
    "has": ["metadata"],
    "date": [
      {
        "field": "created",
        "op": "after",
        "relative": { "amount": 3, "unit": "day" }
      }
    ]
  }
}
```

### Slice B: AI Planner Devuelve SearchPlan

Objetivo: que AI use todo el poder validado de SQLite sin generar SQL.

Implementar:

- actualizar `scripts/ai-query-planner.mjs` para devolver `SearchPlanV1`;
- pasar `now`, `timezone`, `today` y capabilities al planner;
- validar plan con Zod y Rust;
- UI muestra resumen legible del plan;
- `ai: ultimos 3 dias con metadata` debe usar relativo 3 dias, no aproximar a 7 dias.

### Slice C: Explain Parsed Query Completo

Objetivo: que el usuario entienda que hizo Copicu con su busqueda.

Implementar:

- parse/plan result serializable en `history_search(..., explain: true)`;
- UI discreta tipo chips o linea "Interpreted as";
- errores/warnings para filtros desconocidos en vez de tratarlos siempre como texto.

### Slice D: FTS5

Objetivo: mejorar performance y ranking de texto sin cambiar la sintaxis.

Implementar:

- migration con tabla FTS5 para `text`, `title`, `notes`, `tags`;
- triggers o refresh controlado al insert/update/delete;
- fallback a `LIKE` si FTS no esta disponible o para filtros no-text;
- ranking por relevancia solo cuando hay text terms.

### Slice E: AI Planner Sobre History Search

Objetivo: traducir lenguaje natural a `HistorySearchRequest` validado.

Implementado primer corte:

- dependencia TS para AI provider-agnostic, probablemente Vercel AI SDK + Zod en primer corte;
- provider OpenRouter default usando Settings (`ai.endpoint`, `ai.model`) y credenciales fijas `.env`/entorno (`COPICU_AI_API_KEY`, overrides opcionales `COPICU_AI_ENDPOINT`, `COPICU_AI_MODEL`);
- no mandar contenido de clips en el primer corte: solo instruccion, query actual y sintaxis soportada;
- salida estructurada: `{ query, explanation, needsClarification, warnings }`;

Pendiente:

- preview "Interpretado como ..." antes de ejecutar si hay ambiguedad;
- tests con provider mock o runner injectable sin tocar red.

Completado 2026-06-06:

- `interpretedQuery`/`explanation`/`warnings` se muestran de forma discreta bajo el search input;
- test visual mock cubre `ai:` con interpretacion/warning y verifica que Enter siga activando tras la query AI;
- dogfood real con OpenRouter local valido IPC Tauri sin enviar contenido de clips.
- runner del AI planner testeable sin red con `COPICU_AI_PLANNER_MOCK_PLAN` y `npm run ai:planner:test`;
- errores de schema/provider del planner se redacted/clasifican antes de llegar a la UI, evitando stacks `ZodError` y code frames en warnings.

### Slice F: Source Filters

Objetivo: habilitar `app:` y luego AI queries como "de chrome ayer".

Implementar:

- capturar source process/window title en clipboard watcher si es confiable;
- columnas o tabla metadata para source;
- filtros `app:` y `window:`;
- privacy consideration para window titles.

## Pendientes

- Definir si unknown filters deben ser texto plain o warning.
- Decidir chips/facets visuales vs solo tooltip/help.
- Definir semantica local de fechas: UTC actual vs timezone local.
- Decidir si la UI debe decir siempre checked, siempre marked, o mantener checked como copy de UI y marked como API/storage.
- Normalizar tags en tablas dedicadas.
- Agregar saved filters/smart collections.
- Integrar AI planner con el mismo contrato.

## No Hacer Todavia

- No sumar embeddings antes de FTS5 + metadata.
- No mandar payload a OpenRouter para buscar.
- No permitir SQL generado por AI.
- No construir una UI pesada de filtros que bloquee el picker keyboard-first.

## Reentry Prompt

```text
Seguir con SearchPlan Engine. Abrir docs/topics/search-plan-engine.md, specs/005-search-plan-engine/spec.md y docs/tracks/008-filtering-search-foundation.md. Proximo corte recomendado: SearchPlanV1 + compiler Rust a SQL parametrizado, manteniendo compatibilidad con query syntax.
```
