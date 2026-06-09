---
id: ai-search-and-actions
status: draft
kind: decision-map
triggers:
  - AI
  - OpenAI
  - OpenRouter
  - natural language search
  - vague search
  - commands
  - filters
  - actions
primary_refs:
  - ../active-work/006-ai-vague-search.md
  - ../active-work/004-actions-scripting.md
  - search-plan-engine.md
  - filtering-and-query-syntax.md
  - product-ambition.md
---

# AI Search And Actions

AI es una capacidad transversal de Copicu. La primera utilidad concreta no debe ser "AI libre", sino usar lenguaje natural para buscar y filtrar historial mediante la API host existente.

## Direccion

El usuario debe poder pedir cosas como:

- "todos los mensajes con tag X que contienen Y";
- "clips de chrome de ayer sobre sqlite";
- "imagenes con nota de error";
- "los textos largos sin tag que copie esta semana".

La app debe convertir eso en un plan estructurado y ejecutarlo con APIs normales de historial, metadata y busqueda. La AI no deberia tocar SQLite, filesystem, clipboard o input sintetico directamente.

## Provider Actual

- Usar un endpoint OpenAI-compatible configurable. El default de Settings es OpenRouter para que el primer `.env.example` sea facil de entender, pero OpenAI y Groq quedan como bloques listos.
- Settings ya incluye AI deshabilitado por defecto:
  - `ai.enabled`;
  - `ai.endpoint` default `https://openrouter.ai/api/v1`;
  - `ai.model` default `openai/gpt-4.1-mini`.
- La API key local debe vivir en una variable de entorno o `.env` local ignorado bajo el nombre fijo `COPICU_AI_API_KEY`. Settings no guarda secretos ni nombres de variables.
- `COPICU_AI_ENDPOINT` y `COPICU_AI_MODEL` son overrides opcionales desde entorno o `.env`; si no existen, se usan los valores de Settings.
- El host Rust lee primero variables de entorno reales y luego `.env` local del project root como fallback. Como compatibilidad temporal, si falta `COPICU_AI_API_KEY`, intenta claves legacy `GROQ_API_KEY`, `OPENROUTER_API_KEY` y `OPENAI_API_KEY`.
- No guardar el valor de esa key en docs, logs, tests, DB ni settings exportados.
- OpenAI-compatible API sigue siendo la abstraccion del cliente; OpenRouter, OpenAI y Groq quedan representados en `.env.example`.

## Libreria Inicial

Decision tentativa 2026-06-06:

- Usar Vercel AI SDK + Zod para el primer planner TS, por salida estructurada, tool calling y soporte provider-agnostic.
- Dependencias instaladas en el repo: `ai` y `zod`.
- Mantener OpenAI Agents SDK como alternativa si mas adelante necesitamos loops agenticos/tracing/MCP mas completos.
- No empezar con LangChain/Mastra salvo que el problema crezca hacia workflows/agents complejos.

## Primer Slice: AI Query Planner

Entrada:

```text
natural language query + current picker query/context + sintaxis soportada
```

Salida esperada:

```ts
type AiHistorySearchPlan = {
  intent: "search_history";
  query: string;
  explanation: string;
  needsClarification: string | null;
  warnings: string[];
};
```

El host ejecuta el plan usando `history_search`. Si el plan es ambiguo o pide algo no soportado, devuelve una aclaracion o un warning. No agregar fallbacks deterministas ad hoc por frases; ampliar `SearchPlanV1`/compiler.

Nota de implementacion 2026-06-06: para OpenAI/OpenRouter structured outputs strict, todas las propiedades del objeto deben estar en `required`. No volver a modelar `needsClarification` o `warnings` como propiedades opcionales en el schema del runner.

## Base Deterministica

Antes de depender de AI para todo, Copicu tiene una query syntax local. Fuente de verdad: `docs/topics/filtering-and-query-syntax.md`.

- `tag:foo`
- `kind:image`
- `mime:image/*`
- `has:notes`
- `after:yesterday`
- `"frase exacta"`
- `-termino`
- texto plain

AI puede traducir lenguaje natural a esa estructura. Esto mantiene resultados explicables y permite que busqueda sin AI siga siendo poderosa.

Estado 2026-06-05: primer corte implementado en `src-tauri/src/storage.rs`.

Soporta texto plain, frases con comillas, negacion con `-`, `tag:`/`#tag`, `kind:`, `mime:`, `has:`, `after:`, `before:`, `on:` y relativos simples como `7d`. Sigue usando `LIKE` paginado, no FTS5. `app:` queda bloqueado hasta capturar source process/window.

Estado 2026-06-06: agregado `history_search(HistorySearchRequest)` como contrato reusable. `mode: "ai"` ya tiene primer planner manual desde el comando Tauri: usa Settings AI, OpenRouter/OpenAI-compatible endpoint, Vercel AI SDK + Zod en `scripts/ai-query-planner.mjs`, valida `AiHistorySearchPlan` y ejecuta la query resultante con la busqueda estructurada local. El picker lo activa con prefijo `ai:`. Si AI esta apagada o falla, vuelve a structured local con warning.

Direccion 2026-06-07: el siguiente contrato no debe ser `AI -> query string`; debe ser `AI -> SearchPlanV1`. Ver `search-plan-engine.md` y `specs/005-search-plan-engine/spec.md`.

Hardening 2026-06-06: el runner Node tiene timeout de 30s desde Rust y la UI muestra una linea discreta con query interpretada, explicacion y warnings. Tests visuales mock cubren que `ai:` muestre interpretacion y que Enter siga activando el item seleccionado despues de ejecutar la busqueda AI.

Hardening adicional 2026-06-06: errores del runner quedan normalizados como una linea `[AI_PLANNER_ERROR] ...` redacted. Rust clasifica esos errores antes de agregarlos a `HistoryPage.warnings`, asi la UI no muestra stacks, `ZodError`, code frames ni payload/input. Para tests sin red, el runner acepta `COPICU_AI_PLANNER_MOCK_PLAN` y `npm run ai:planner:test` valida happy path + fallo de schema redacted.

Privacidad del primer corte: no se manda contenido de clips al modelo. El request remoto contiene solo la intencion escrita por el usuario, una query contextual vacia por ahora y la lista de sintaxis soportada.

## Fase Posterior: AI Commands

Cuando Actions Foundation exista, AI puede planear y ejecutar series de comandos sobre la API host:

- buscar items;
- seleccionar candidatos;
- agregar tags o metadata;
- resumir clips;
- transformar texto;
- pegar o copiar con confirmacion;
- ejecutar actions declaradas por plugins.

Regla: la AI usa capabilities declaradas. No recibe acceso crudo a SQL, filesystem, shell, clipboard o input nativo salvo una action/capability explicita y auditable.

## Decision 2026-06-07: AI Script Mode

JP quiere probar una capacidad mas poderosa que tools aisladas: un agente tipo chat que pueda generar scripts temporales y ejecutarlos contra la API host de Copicu.

Direccion elegida:

- avanzar hacia `AI Script Mode v1` como experimento;
- el modelo puede generar JS/TS temporal para resolver pedidos sobre el historial;
- los scripts generados corren contra `copicu.*` host API, no contra SQLite crudo;
- no agregar nuevas tools/capabilities sin confirmacion explicita de JP;
- primer set permitido debe reutilizar lo que ya existe: `history.search`, `history.get/update/remove/mark` si esta expuesto, `clipboard.*`, `ui.*`, `actions.run` cuando aplique;
- sin imports externos, `fs`, `child_process`, network ni shell en el primer corte;
- contenido real del clipboard puede estar disponible en este modo si JP lo acepta para el experimento, pero debe quedar claro en UI/logs cuando se lee contenido;
- operaciones destructivas o masivas deben mostrar preview/confirmacion liviana;
- mantener logs redacted por defecto y resumen de acciones ejecutadas;
- si mas adelante JP acepta mas riesgo, agregar capabilities separadas como `files.write`, `files.pickFolder`, `network.fetch`, `system.shell` o SQLite crudo.

Motivo:

- evita volver a fallbacks deterministas por frase;
- da poder composable sin disenar una tool nueva para cada pedido;
- aprovecha la base existente de Actions/Scripting;
- mantiene invariantes de storage/blobs/settings al pasar por API host en vez de SQL directo.

Primer corte recomendado:

1. Crear comando/runner `ai_script_run` que llama al modelo con contexto de API y devuelve un script temporal.
2. Mostrar/registrar el script generado, capabilities solicitadas y un resumen antes de ejecutar.
3. Ejecutar el script con el runner JS existente o un runner dedicado usando solo APIs permitidas.
4. Devolver resultado al composer/chat: items afectados, warnings y salida textual.
5. Validar con casos sinteticos:
   - "mark 3 more randomly";
   - "find unmarked text clips and add tag review";
   - "join first 5 matching snippets and copy them".

Actualizacion 2026-06-07:

- `mark_positions` fue retirado del planner AI anterior.
- El prefijo `ai:` sigue usando el planner de busqueda para clasificar search vs action, pero las acciones pasan a AI Script Mode generico (`run_ai_script`) y ejecutan scripts temporales contra `copicu.*`.
- Esto evita sumar tools puntuales como `mark_random` y evita fallos por posiciones calculadas por el modelo.

Estado tras dogfood 2026-06-07:

- AI Script Mode v1 amplio de forma importante el poder actual:
  - puede marcar/desmarcar por busqueda;
  - puede operar sobre "primeros N";
  - puede combinar operaciones globales (`desmarcar todas`) con filtros (`texto open`);
  - puede controlar que se muestra despues con `displayQuery`.
- `AiScriptPlan` actual:

```ts
type AiScriptPlan = {
  id: string;
  title: string;
  summary: string;
  displayQuery: string | null;
  capabilities: string[];
  script: string;
  warnings: string[];
};
```

- Semantica de `displayQuery`:
  - `null`: mostrar historial completo tras la accion;
  - `"open"`: mostrar matches del texto/filtro relevante;
  - `"open is:marked"`: mostrar solo items marcados dentro del filtro, util para "solo mostra esas";
  - nunca usar una query intermedia como `"open is:unmarked"` despues de marcar, porque ocultaria los items actualizados.
- La accion generada debe usar APIs existentes del host. Ejemplo para marcado:

```ts
const items = await copicu.history.search("open is:unmarked", { limit: 3, content: false });
for (const item of items) {
  await copicu.history.update(item.id, { marked: true });
}
```

- Correcciones importantes:
  - el planner viejo ya no decide posiciones ni ejecuta `mark_positions`;
  - `history.update({ marked })` funciona como metadata sin tocar contenido;
  - refresh post-accion usa `displayQuery`, no la frase natural del usuario.
- Riesgo actual: el modelo puede elegir mal `displayQuery` o interpretar "primeras N" como orden global cuando el usuario esperaba orden visible. Proximo hardening: preview/confirmacion y tests de prompts.

Actualizacion 2026-06-07, summary AI:

- `history_search` acepta `aiContext` para pasar al planner de script el contexto real del picker: query actual, item actual, IDs visibles e IDs chequeados/seleccionados.
- Se agregó capability explícita `ai:summarize` y API abierta `copicu.ai.respondMarkdown({ instruction, items, context })` para que scripts temporales pidan respuestas libres sobre items usando el provider AI configurado, con salida Markdown obligatoria.
- `copicu.ai.respondMarkdown` es distinta de `copicu.ui.markdownOutput`: la primera llama al provider y devuelve Markdown; la segunda solo muestra Markdown en la ventana `ai-output`. `summarizeMarkdown` queda como alias compatible.
- Para pedidos sobre "chequeados/seleccionados", el planner debe usar `ctx.selectedItemIds` o `copicu.selection.ids()` y luego `history.get(id,{content:true})`; no debe traducir eso a `is:marked` salvo que no haya selección y el usuario diga explícitamente "marcados".
- El runner fue endurecido para contexto parcial y para aceptar objeto `{ id }` donde una API esperaba ID, pero el planner sigue instruido a pasar `item.id`.

## Privacidad

- AI externa queda deshabilitada por defecto hasta tener setting claro.
- Ignored/private/secret items nunca se envian a AI salvo override explicito.
- Primer uso recomendado: comando manual "AI search" o "AI this item", no jobs automaticos.
- Logs de AI deben guardar metadata redacted: modelo/provider, tokens/costo si aplica, estado, error class y resumen sin payload real.

## Preguntas Abiertas

- Como migrar `AiHistorySearchPlan.query` a `SearchPlanV1` sin romper UI/scripts.
- Si se guardan prompts/responses redacted para debug o solo action run metadata.
- Si el planner debe quedarse como runner Node dedicado o migrar a un worker/runner compartido con Actions.
- Como mostrar "por que encontro esto" sin exponer demasiado contenido.
- Que permisos necesita una futura AI command chain antes de ejecutar cambios destructivos.
