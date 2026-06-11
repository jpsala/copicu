---
id: search-plan-engine
status: draft
kind: decision-map
triggers:
  - SearchPlan
  - search plan
  - SQL compiler
  - busqueda potente
  - AI planner
  - filtros avanzados
primary_refs:
  - ../../specs/005-search-plan-engine/spec.md
  - filtering-and-query-syntax.md
  - ai-search-and-actions.md
  - ../tracks/008-filtering-search-foundation.md
---

# Search Plan Engine

## Decision

Copicu debe tener una capa intermedia `SearchPlan` entre cualquier input de busqueda y SQLite.

```text
query syntax | UI filters | scripts | AI
  -> SearchPlan JSON validado
  -> Rust compiler
  -> SQL parametrizado
  -> SQLite
```

La AI no debe generar SQL. Puede generar un plan estructurado.

## Por Que

SQLite ya puede resolver filtros ricos. La limitacion actual no es SQLite, sino la query syntax chica que fuerza al modelo a aproximar pedidos naturales.

Ejemplo de problema actual:

```text
usuario: ultimos 3 dias con metadata
AI: after:7d has:metadata
warning: after:3d no es compatible
```

El resultado es explicable pero impreciso. Con `SearchPlan`, AI puede decir:

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

Rust calcula timestamps y genera SQL parametrizado.

## Reglas

- No SQL crudo desde AI, scripts o UI.
- No enviar contenido de clips al modelo para planificar busquedas.
- Si se envia contexto temporal al modelo, usar solo `now`, `timezone`, `today` y capabilities.
- Rust valida enums, rangos, limites y fechas antes de compilar.
- El plan debe poder serializarse para debug redacted y tests.

## Relacion Con Query Syntax

La query syntax manual sigue siendo util para power users:

```text
kind:image has:notes after:yesterday
```

Pero internamente debe convertirse a `SearchPlanV1`. Asi la ruta manual, AI y scripts usan el mismo compiler.

## Primer Corte

Implementar `SearchPlanV1` con:

- texto: all/phrases/exclude;
- filtros: kind, mime, has/missing, marked;
- fechas: after/before/on/between con ISO o relativo;
- sort y limit;
- compiler Rust a `WHERE`, params, order y limit.

Despues cambiar AI para devolver `SearchPlanV1` en vez de query string.
