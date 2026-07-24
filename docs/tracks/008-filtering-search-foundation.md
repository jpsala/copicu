---
id: filtering-search-foundation
status: active
updated: 2026-07-10
---

# Filtering Search Foundation

Trabajo vivo para convertir la busqueda del picker en una base potente, local y reutilizable por AI/actions/plugins.

Topic estable: `docs/topics/filtering-and-query-syntax.md`.

Topic de arquitectura nueva: `docs/topics/search-plan-engine.md`.

## Estado Actual

Actualizacion 2026-07-10 autocomplete (pendiente de validacion integrada):

- el worktree agrega sugerencias locales keyboard-first para `#`/`tag:`, operadores conocidos y valores cerrados; Tab/click aceptan, flechas/Escape navegan o cierran y Enter conserva aplicar la busqueda;
- el popup no debe aparecer para texto plain ni modo AI; no cambia Rust/SQLite ni envia contenido fuera del equipo;
- el long task reporto `npm run build` y seis Playwright focalizados verdes, pero falta validacion independiente completa, smoke CUA y revisar el diff antes de promoverlo como aplicado;
- Settings ahora indexa los controles internos de Picker, para que buscar `structured` encuentre `Confirm structured filters with Enter`.

Actualizacion 2026-07-10 chips/explain y diagnostico sintactico:

- `history_search(..., explain: true)` devuelve `queryExplanation` versionado con chips removibles y diagnosticos `{ severity, code, message }`;
- la UI muestra chips solo para la query aplicada, no para un draft pendiente; remover uno reemplaza el input, reinicia cursor y aplica una primera pagina explicita;
- comillas abiertas, valores faltantes y valores invalidos de operadores conocidos no ensanchan la busqueda: devuelven cero resultados con diagnostico; `foo:bar` desconocido sigue como texto plain con warning no bloqueante;
- tests focalizados cubren remocion de chip, diagnostico visible sin activacion stale, Unicode y fail-closed del backend.

Proximo slice recomendado: autocompletado contextual, saved searches o highlighting. No sumar FTS5, embeddings ni query builder pesado sin medicion/decision.

Actualizacion 2026-07-10 search trigger hardening:

- el picker incorpora un control rapido accesible con iconos/tooltip para alternar `realtime` y `enter`; el legacy persistido `manual` se normaliza a `enter`;
- nuevo setting `Confirm structured filters with Enter`: en realtime, tags/condiciones esperan Enter solo para la query pendiente y muestran feedback explicito;
- refreshes de foco/clipboard y `load more` reutilizan la query aplicada, no drafts pendientes; una primera pagina invalida paginas viejas en vuelo;
- cursor + sort custom se rechaza hasta tener cursor sort-aware;
- datetimes ISO ya aplican offsets explicitos en vez de descartarlos;
- bulk mark queda autorizado solo para `main`, opera sobre la query aplicada y falla cerrado si una query no vacia no compila filtros;
- checks: `npm run build`, `npm run rust:test` (114/0, 1 ignored), `cargo check --manifest-path src-tauri/Cargo.toml --tests`, Playwright `tests/visual/shell.spec.ts` 140/0, LSP de produccion 0, `bun run context:audit` y `git diff --check`.

Riesgos retomables no bloqueantes:

- sort custom queda sin `nextCursor` hasta implementar cursor sort-aware;
- Settings completo y quick trigger pueden resolver last-writer-wins solo si ambos se guardan simultaneamente;
- la deteccion UX de sintaxis estructurada en TypeScript debe mantenerse alineada con el tokenizer/parser Rust.

Despues del hardening, el corte de chips/explain y diagnostico sintactico quedo aplicado. Siguiente: autocompletado, saved searches o highlighting; evaluar FTS5 solo con medicion y no sumar embeddings/query builder pesado todavia.

Actualizacion 2026-07-09 dogfood:

- Se corrigio una carrera donde refresh/reset async del picker podia devolver el item activo al primero; `src/main.tsx` usa una generacion de interaccion de seleccion para ignorar resets viejos.
- Se corrigio churn de conteos/scroll: los conteos omitidos por Tauri pueden llegar como `null`; el frontend solo actualiza `historyTotalCount`/`historyFilteredCount` cuando recibe numeros.
- Se removio el polling debug que refrescaba historial cada ~1.4s y movia virtual scroll/conteos sin accion del usuario.
- Se agrego validacion Playwright para reset async, conteo estable, query plain en composer AI y boton Search/lupa; checks recientes: `npx playwright test tests/visual/shell.spec.ts --reporter=line` PASS 114/0, `npm run build`, `git diff --check`.
- Se revirtio el experimento de scrollbar estimada por total conocido. Con cursor pagination queda el patron seguro `loaded rows + 1 loader`; una scrollbar proporcional al total real requiere otro contrato backend/windowing antes de implementarse.
- Validacion visible/CDP reciente: AI composer + `youtube` + Enter -> `39 / 3,334 matches`; Search mode + `github` + click Search -> `33 / 3,334 matches`; scroll al fondo + idle mantuvo count/scroll estable.

Actualizacion 2026-06-29:

- scoped search implementado y documentado: `meta:/metadata:` busca metadata visible (`title`, `notes`, `tags`), `title:` solo titulo editable, `notes:/note:` notas, y `ctx:/context:` contexto oculto de captura; formas negadas como `-meta:` tambien funcionan.
- `title:` dejo de ser alias conceptual de window title capturado; para ventana origen usar `window:`. Esto evita mezclar titulo editable del item con contexto automatico.
- Search trigger configurable en `Settings > Picker`: realtime default o buscar con Enter; el boton `Search` aplica explicitamente desde ambos modos.
- UI de ayuda in-app agregada desde boton `?` y menu del picker, con sintaxis deterministica, filtros de contexto, fechas, AI `ai:` y shortcuts relevantes; luego se separo la ayuda de `Keyboard` para no mezclar metadata shortcuts con AI.
- Planner AI actualizado para entender/promover `meta:/title:/notes:/ctx:` sobre el contrato local.
- Fix dogfood 2026-06-29: en modos `When pressing Enter`/`Only Search button`, el picker debe cargar historial inicial aunque no haga busqueda realtime por cada tecla; se corrigio el efecto para refrescar solo el estado inicial vacio y no cada cambio de query.
- Checks recientes: `npm run build`, `cargo check --manifest-path src-tauri/Cargo.toml --tests`, `cargo test --manifest-path src-tauri/Cargo.toml --lib --no-run`, `node --test tests/ai-query-planner.test.mjs`; instalada actualizada con `npm run install:current`.

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

### Slice Search UX Explain/Chips

Estado: implementado 2026-07-10.

- `history_search(..., explain: true)` entrega chips removibles y diagnosticos tipados;
- chips solo de query aplicada; la remocion reinicia cursor sin disparar una segunda busqueda realtime;
- operadores conocidos malformados fallan cerrados, mientras filtros desconocidos siguen como texto plain con warning;
- pendiente real: autocompletado contextual, saved searches o highlighting, no un query builder pesado.

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
