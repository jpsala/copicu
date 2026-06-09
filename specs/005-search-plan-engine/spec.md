# Search Plan Engine

## Estado

Draft implementable. Define la arquitectura para dar a Copicu busqueda potente sobre SQLite sin permitir SQL crudo generado por AI.

## Objetivo

Reemplazar gradualmente el contrato angosto `AI -> query syntax string -> parser -> SQL` por:

```text
input humano o AI
  -> SearchPlan JSON validado
  -> compiler Rust
  -> SQL parametrizado
  -> SQLite
```

La query syntax manual sigue existiendo, pero pasa a ser solo una de las entradas que producen `SearchPlan`.

## Problema Actual

El planner AI hoy devuelve strings como:

```text
after:7d has:metadata
```

Eso limita al modelo a la sintaxis que enumeramos. Pedidos naturales como "ultimos 3 dias con metadata" fuerzan aproximaciones porque la query syntax actual solo documenta algunos relativos. SQLite puede expresar mucho mas; el cuello de botella es el contrato intermedio.

## Principios

- AI no genera SQL.
- Rust valida todo plan antes de ejecutar.
- SQLite recibe solo SQL parametrizado generado por codigo propio.
- La busqueda debe ser reusable por picker, scripts, filtros guardados y AI.
- Fecha/hora actual, timezone y capabilities soportadas pueden enviarse al modelo; contenido de clips no.
- El plan debe ser explicable para UI y testeable sin provider.

## Contrato Inicial

Primer schema versionado:

```ts
type SearchPlanV1 = {
  schemaVersion: 1;
  text?: {
    all?: string[];
    any?: string[];
    phrases?: string[];
    exclude?: string[];
  };
  filters?: {
    kind?: Array<"text" | "image" | "html" | "file" | "unknown">;
    mime?: string[];
    has?: Array<"text" | "title" | "notes" | "tags" | "metadata" | "mime" | "blob" | "image">;
    missing?: Array<"title" | "notes" | "tags" | "metadata" | "mime" | "blob">;
    marked?: boolean;
    date?: DateFilterV1[];
  };
  sort?: Array<{
    field: "created" | "lastUsed" | "lastCopied";
    direction: "asc" | "desc";
  }>;
  limit?: number;
};

type DateFilterV1 = {
  field: "created" | "lastUsed" | "lastCopied";
  op: "after" | "before" | "on" | "between";
  value?: string;      // ISO date or datetime
  endValue?: string;   // ISO date or datetime for between
  relative?: {
    amount: number;
    unit: "minute" | "hour" | "day" | "week" | "month";
  };
};
```

## Contexto Para AI

El planner puede recibir:

```json
{
  "now": "2026-06-07T14:32:00-03:00",
  "timezone": "America/Buenos_Aires",
  "today": "2026-06-07",
  "searchCapabilities": {
    "dateRelative": true,
    "dateBetween": true,
    "metadataFilters": true,
    "sourceApp": false,
    "fts": false
  }
}
```

No recibe contenido de clips ni muestras de historial en el primer corte.

## Compiler Rust

`SearchPlanV1` compila a:

```rust
struct CompiledHistorySearch {
    where_sql: String,
    params: Vec<Value>,
    order_sql: String,
    limit: i64,
    explanation: SearchExplanation,
    warnings: Vec<String>,
}
```

Reglas:

- columnas permitidas por enum, no strings libres;
- operadores permitidos por enum;
- valores de texto siempre por params;
- limites clamp entre `1` y `100`;
- relative dates se resuelven en Rust con timezone local/configurada;
- filtros desconocidos fallan validacion o devuelven warning, nunca SQL libre.

## Migracion

1. Agregar tipos `SearchPlanV1` y compiler paralelo al parser actual.
2. Implementar `query syntax -> SearchPlanV1` para mantener compatibilidad.
3. Cambiar `history_search(structured)` a compilar plan en vez de `ParsedHistoryQuery` directo.
4. Cambiar `AI -> SearchPlanV1` en `scripts/ai-query-planner.mjs`.
5. Mantener `interpretedQuery` por compatibilidad UI, pero agregar `interpretedPlan`/`explanation` cuando convenga.
6. Extender scripts `copicu.history.search` para aceptar plan ademas de query string.

## Primer Slice Implementable

Soportar en el plan:

- `text.all`, `text.phrases`, `text.exclude`;
- `filters.kind`;
- `filters.has` / `filters.missing`;
- `filters.marked`;
- `filters.date` con `after`, `before`, `on`, `between`, `relative`;
- sort por `created` o `lastCopied`;
- limit.

No incluir todavia:

- SQL libre;
- source app/window;
- FTS ranking;
- embeddings;
- joins de tags normalizados.

## Done

- Tests Rust cubren compiler para fechas relativas, metadata, kind, texto y marked.
- `ai: ultimos 3 dias con metadata` produce plan relativo de 3 dias y no aproxima a 7 dias.
- La UI muestra el plan/explanation de forma legible.
- Fallback en falla AI sigue dejando Copicu usable con busqueda local estructurada.

## Implementation Notes

2026-06-07 first slice:

- `SearchPlanV1` types live in `src-tauri/src/storage.rs`.
- `HistorySearchRequest` accepts optional `plan` while preserving query-string compatibility.
- Manual query syntax is converted to `SearchPlanV1` before SQL compilation.
- The Rust compiler emits only whitelisted SQL fragments plus SQLite parameters.
- Supported first-slice fields: text, kind, MIME, metadata presence/missing, marked, dates, sort, limit.
- Compatibility fields keep current query syntax exact for tags and negated kind/MIME/tag filters.
- Pending: update the Node AI planner to return `SearchPlanV1` instead of query syntax, then expose an explainable plan summary in UI.
