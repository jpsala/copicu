---
id: virtual-history-list
status: first-slice-implemented
priority: 2
updated: 2026-06-06
---

# Virtual History List

Implementar lista virtual/infinite scroll y búsqueda paginada para soportar miles o cientos de miles de items sin cargar todo en React.

## Estado 2026-06-05

Primer slice implementado:

- agregado `@tanstack/react-virtual`;
- agregado comando Tauri/Rust `list_history_page`;
- agregado `HistoryPageRequest`/`HistoryPage` con cursor por `(created_at_unix_ms, id)`;
- feed reciente y búsqueda plain usan SQLite paginado;
- picker renderiza filas virtuales con overscan y loader row;
- scroll al loader pide la siguiente página;
- refresh automático no reemplaza la lista si el usuario está scrolleado lejos de arriba y detecta clips nuevos;
- previews con imágenes se miden de nuevo al cargar para evitar solapamientos;
- visual checks desktop/narrow cubren overflow, menú contextual, scroll manual e infinite scroll con 80 items sintéticos.
- contador del picker usa `totalCount`/`filteredCount` reales desde SQLite, no la cantidad de items cargados;
- smoke real con WebView2 CDP + rueda de mouse validó scroll continuo sin loader visible ni saltos grandes;
- `loadNextHistoryPage` y refresh periódico usan secuencias separadas para no invalidarse entre sí;
- selección migrada a `selectedItemId` como fuente primaria; `selectedIndex` queda derivado de la página visible, así que move-to-top/dedupe no activan el item incorrecto.

## Decisión

No vamos a cargar todo el historial en memoria frontend.

El picker debe renderizar solo lo visible, más un overscan chico, y pedir páginas al backend con cursores.

## Pattern Elegido

Fuentes oficiales:

- TanStack Virtual infinite scroll example: https://tanstack.com/virtual/v3/docs/framework/react/examples/infinite-scroll
- TanStack Virtual dynamic example: https://tanstack.com/virtual/latest/docs/framework/react/examples/dynamic
- TanStack Query infinite queries: https://tanstack.com/query/latest/docs/framework/react/guides/infinite-queries
- TanStack Virtual API: https://tanstack.com/virtual/latest/docs/api/virtualizer
- SQLite FTS5: https://www.sqlite.org/fts5.html

Pattern:

```text
React picker
  -> virtualizer renders visible rows + overscan
  -> count = loaded items + 1 loader row while hasNextPage
  -> prefetch triggers before loader is visible
  -> query key includes query/filter/sort
  -> Tauri command list/search page
  -> Rust storage uses SQLite cursor pagination
```

Notas de implementacion:

- No usar `totalCount` como `count` del virtualizer para cursor pagination. Eso inventa filas que todavia no existen, muestra loaders/placeholders al scrollear suave y vuelve erratico el thumb del scrollbar.
- Usar `totalCount`/`filteredCount` solo para el badge visible.
- Para filas dinamicas, preferir estimates conservadores, `measureElement`, `getItemKey` estable y `overflow-anchor: none`.
- Menus/popovers dentro de filas virtualizadas deben renderizar fuera del row con portal; un ancestor con `transform` altera el comportamiento de `position: fixed`.

## API Candidata

```ts
type HistoryPageRequest = {
  query: string;
  filters: {
    kinds?: string[];
    tags?: string[];
    sourceApps?: string[];
  };
  sort: "recent" | "manual" | "used" | "relevance";
  cursor: null | {
    afterSortValue: number | string;
    afterId: number;
    rank?: number;
  };
  limit: number;
};

type HistoryPage = {
  items: HistoryItem[];
  nextCursor: HistoryPageRequest["cursor"];
  totalCount: number;
  filteredCount: number;
};
```

## Reglas UX

- Primera página: 40-80 items.
- Overscan visual: 20-30 items.
- Si query cambia, reset scroll a top.
- Mantener selección por `item.id`, no por índice.
- Si llegan clips nuevos mientras el usuario scrollea lejos de arriba, mostrar indicador “new clips” en vez de saltar scroll.
- Previews de imagen deben tener altura estimada y medición posterior.
- Polling de refresh no debe competir con load-more ni reemplazar paginas cargadas mientras el usuario esta scrolleando lejos del top.
- El badge debe decir total real; con filtro, `filtered / total matches`.

## Implementación Recomendada

1. [x] Agregar comando Rust `list_history_page`.
2. [x] Usar keyset pagination por `(sort_key, id)`, no `OFFSET` grande.
3. [x] Integrar TanStack Virtual sin cambiar diseño visual.
4. [x] Agregar loader row.
5. [x] Usar backend paginado también para search plain.
6. [x] Agregar `totalCount`/`filteredCount` para contador real sin cargar todo en frontend.
7. [x] Separar secuencias de refresh y load-more para evitar spinner colgado.
8. [ ] Evaluar FTS5 después de tener paginación estable.
9. [x] Migrar selección a `selectedItemId` antes de move-to-top/drag & drop.

## Riesgos

- Alturas variables de previews.
- Drag & drop con virtualización.
- FTS ranking + cursor por score.
- Evitar que refresh automático resetee scroll.
- Scrollbar/scroll puede volverse erratico si se usa el total remoto como `count` o si el polling pisa paginas cargadas.

## Done Cuando

- [x] Picker no carga todo el historial.
- [x] Scroll infinito funciona con datos sintéticos grandes.
- [x] Search usa backend paginado.
- [x] Visual checks pasan desktop/narrow.
- [x] Smoke real con rueda de mouse en WebView2 no muestra loader prematuro ni saltos grandes.
- [x] Selección por id se mantiene estable cuando cambia el orden visible.
