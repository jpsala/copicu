---
id: filtering-and-query-syntax
status: active
kind: reference
triggers:
  - filtering
  - filtros
  - search
  - busqueda
  - query syntax
  - FTS
  - tags
  - AI search
primary_refs:
  - ../../src-tauri/src/storage.rs
  - search-plan-engine.md
  - picker-interaction.md
  - ai-search-and-actions.md
  - ../tracks/008-filtering-search-foundation.md
---

# Filtering And Query Syntax

Este topic define la busqueda local deterministica de Copicu. Es el contrato que usa el picker hoy y que debe reutilizar el futuro AI query planner.

## Principio

La busqueda poderosa no debe depender primero de AI. Copicu necesita una base local explicable:

- query syntax chica;
- filtros estructurados;
- paginacion por cursor;
- resultados reproducibles;
- contrato estable para UI, actions, plugins y AI.

AI debe traducir lenguaje natural a este contrato o, preferentemente, a `SearchPlanV1` validado por el host. No debe ejecutar SQL crudo ni inventar una semantica paralela. Ver `search-plan-engine.md`.

## Implementacion Actual

Codigo principal: `src-tauri/src/storage.rs`.

Contrato host actual:

```ts
type HistorySearchRequest = {
  query: string;
  cursor: HistoryPageCursor | null;
  limit?: number;
  mode?: "plain" | "structured" | "ai";
  includeContent?: boolean;
  explain?: boolean;
};
```

La pantalla principal ya usa `history_search`. El comando viejo `list_history_page` queda como alias compatible para llamadas existentes, pero no debe ser el nombre conceptual nuevo.

Entrada paginada compatible:

```ts
type HistoryPageRequest = {
  query: string;
  cursor: HistoryPageCursor | null;
  limit: number;
};

type HistoryPageCursor = {
  afterSortUnixMs: number;
  afterId: number;
};

type HistoryPage = {
  items: HistoryItem[];
  nextCursor: HistoryPageCursor | null;
  totalCount: number;
  filteredCount: number;
  interpretedQuery?: string | null;
  explanation?: string | null;
  warnings: string[];
};
```

Flujo:

```text
React search input
  -> history_search({ query, cursor, limit, mode: "structured" })
  -> Rust parse_history_query(query)
  -> history_where_clause(parsed)
  -> SQLite COUNT total + COUNT filtrado
  -> SQLite SELECT paginado por (created_at_unix_ms, id)
```

La busqueda conserva keyset pagination. No usa `OFFSET`.

La UI usa `totalCount`/`filteredCount` para el badge del picker. El virtualizer no usa esos conteos como cantidad de filas; para cursor pagination sigue el pattern TanStack de `loaded + 1 loader row`.

## Sintaxis Actual

Texto plain busca en:

- `text`;
- `title`;
- `notes`;
- `tags`;
- `mime_primary`;
- `content_kind`;
- `context_search_text` oculto, generado desde eventos de captura (app, ventana, ruta de exe, formatos, dominio, source).

Operadores soportados:

| Query | Significado |
| --- | --- |
| `sqlite migration` | ambos terminos deben matchear en campos buscables |
| `"sqlite migration"` | frase exacta como un unico termino |
| `-draft` | excluye resultados que contengan `draft` |
| `tag:ypf` | filtra items con tag/metadata que contenga `ypf` |
| `#ypf` | alias de `tag:ypf` |
| `-tag:private` | excluye tag/metadata `private` |
| `kind:text` | filtra por `content_kind = text` |
| `kind:image` | filtra por `content_kind = image` |
| `mime:image/*` | filtra MIME primario por prefijo |
| `mime:text/plain` | filtra MIME primario exacto por LIKE |
| `app:code` | filtra por app/proceso/ruta de exe capturada |
| `window:github` | filtra por titulo de ventana capturado |
| `domain:openai.com` | filtra por dominio detectado en URLs capturadas |
| `source:clipboard` | filtra por fuente de captura (`clipboard`, `manual`, futuro import/action) |
| `format:html` | filtra por formatos publicados en el clipboard |
| `has:notes` | requiere notes no vacias |
| `has:title` | requiere title no vacio |
| `has:tags` | requiere tags no vacios |
| `has:metadata` | requiere title, notes o tags |
| `has:mime` | requiere MIME primario |
| `has:blob` | requiere blob asociado |
| `has:image` | alias estructural para `kind:image` |
| `-has:notes` | requiere ausencia de notes |
| `is:marked` | requiere items checked/marked |
| `is:checked` | alias de `is:marked` |
| `is:unmarked` | requiere items no checked |
| `is:unchecked` | alias de `is:unmarked` |
| `-is:marked` | equivalente practico de unchecked |
| `after:2026-06-02` | `created_at_unix_ms >=` inicio de ese dia |
| `before:2026-06-02` | `created_at_unix_ms <` inicio de ese dia |
| `on:2026-06-02` | rango de un dia |
| `after:today` | desde inicio de hoy |
| `after:yesterday` | desde inicio de ayer |
| `after:7d` | ultimos 7 dias aproximados |

Valores separados por coma funcionan en algunos filtros, por ejemplo `tag:ypf,sqlite`.

## Checked / Marked Items

El estado checked vive en SQLite como `clipboard_items.is_marked` y `marked_at_unix_ms`. En codigo y storage el nombre durable es `marked`; en UI puede aparecer como checked porque el control se usa para seleccionar un batch persistente de items.

La query syntax soporta `is:`:

- `is:marked` e `is:checked` agregan `is_marked != 0`;
- `is:unmarked` e `is:unchecked` agregan `is_marked = 0`;
- `-is:marked` y `-is:checked` tambien filtran unchecked;
- `-is:unmarked` y `-is:unchecked` filtran checked.

`selected` no es alias de `marked`: selected es estado transitorio del picker, no metadata persistida del item. Por ahora no hay filtro `is:selected`; si hiciera falta para actions/UI, debe resolverse desde el snapshot de seleccion del frontend/host y no como query SQLite global.

El menu de mark del picker usa esta misma sintaxis: `Marked` escribe `is:marked`, `Unmarked` escribe `-is:marked`, y `All history` remueve terminos `is:*` conocidos. Las acciones batch sobre checked cargan todos los marcados con `list_history_page({ query: "is:marked" })`, no solo los visibles.

Las operaciones `All results` / `None results` llaman `set_history_query_marked` con la query actual. El backend vuelve a parsear la misma query y actualiza todos los resultados que matchean, no solo la pagina cargada.

## Search API Foundation 2026-06-06

- Agregado comando Tauri `history_search`.
- Agregado `HistorySearchRequest` con `mode`, `includeContent` y `explain`.
- `list_history_page` sigue existiendo como wrapper compatible, pero el picker ya llama `history_search`.
- `copicu.history.search()` en scripts usa el mismo contrato host (`storage.history_search`) en vez de una ruta conceptual separada.
- `mode: "ai"` en el comando Tauri llama al primer AI planner manual; `AppStorage::history_search` sigue deterministico y si se usa directo con `mode: "ai"` mantiene fallback/warning.
- `explain: true` devuelve un summary inicial simple. El parse tree serializable/chips sigue pendiente.

## Limitaciones Actuales

- Usa `LIKE`, no SQLite FTS5 todavia.
- Tags siguen como string en `clipboard_items.tags`; no hay tablas `tags`/`item_tags`.
- `app:`, `window:`, `domain:`, `source:` y `format:` dependen de eventos de captura nuevos; items historicos previos a la migracion solo matchean si se recapturan o se rellenan por migracion futura.
- Fechas se interpretan como bounds de dia UTC; falta semantica local fina.
- No hay parser publico/serializable completo de `ParsedHistoryQuery`; vive interno en Rust. `history_search(..., explain: true)` solo devuelve summary inicial.
- No hay UI de chips/facets para editar la query visualmente.
- No hay ranking por relevancia; el orden sigue siendo reciente: `created_at_unix_ms DESC, id DESC`.
- La nomenclatura UI mezcla checked y marked. Decision pendiente: consolidar copy visible sin perder que storage/API usan `marked`.

## Relacion Con AI

AI search debe ser capa superior:

```text
"todos los clips de ypf sobre sqlite desde ayer"
  -> AI query planner
  -> { queryText: "sqlite", filters: { tags: ["ypf"], dateRange: { relative: "yesterday" } } }
  -> query syntax o plan validado
  -> ejecucion local
```

Primer objetivo AI:

- explicar como formular una busqueda;
- traducir lenguaje natural a filtros soportados;
- pedir aclaracion si el pedido usa un campo inexistente;
- mostrar "interpretado como ..." antes o despues de ejecutar.

Estado primer planner 2026-06-06:

- UI manual con prefijo `ai:`;
- runner Node `scripts/ai-query-planner.mjs`;
- salida validada como `AiHistorySearchPlan`;
- ejecucion final sigue siendo SQLite local via query syntax;
- no se envia contenido de clips al modelo.

No objetivo inicial:

- semantic search real;
- embeddings;
- mutar metadata;
- ejecutar comandos arbitrarios.

## Evolucion Recomendada

1. Introducir `SearchPlanV1` y compiler Rust a SQL parametrizado.
2. Convertir query syntax manual a `SearchPlanV1`.
3. Cambiar AI para devolver `SearchPlanV1` en vez de query string.
4. Exponer explain/plan serializable para debug/UI.
5. Agregar chips/facets en el picker sin romper typing directo.
6. Migrar a FTS5 para texto/title/notes/tags.
7. Capturar source app/window y habilitar `app:`/`window:`.
8. Normalizar tags.
9. Agregar saved filters/smart collections.
10. Evaluar semantic/embedding search despues de metadata y privacy gates.

## Reglas De Seguridad

- No loguear payload real de clips al debuggear queries.
- No mandar contenido a AI por defecto.
- No permitir que AI genere SQL directo.
- Cualquier action futura que modifique items debe pasar por capabilities y action logs redacted.
