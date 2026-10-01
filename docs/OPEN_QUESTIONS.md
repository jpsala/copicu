# Preguntas Anteriores: Referencia Histórica

Este archivo es compatibilidad, no backlog global activo. El [original íntegro](reference/os2-legacy/OPEN_QUESTIONS.md) conserva las preguntas del arranque byte a byte. Algunas pueden estar resueltas por contratos posteriores: no activarlas, cerrarlas ni convertirlas en requisitos sólo por leer el archivo histórico.

Incertidumbres de conocimiento y decisiones van al topic pertinente; preguntas de ejecución y bloqueos al track del trabajo. Actualizar la fuente existente, no duplicar preguntas globales.

## Consultar Por Tema

- Plataforma y alcance: [dirección](topics/product-direction.md), [ambición](topics/product-ambition.md) y el track del trabajo pertinente.
- SQLite/blobs, retención y schema: [storage](topics/sqlite-storage.md) y [clipboard](topics/clipboard.md).
- Imágenes, rich content, screenshots y write-back: [clipboard](topics/clipboard.md), [foco/paste](topics/windows-focus-and-paste.md) y [track de captura](tracks/image-capture-spike.md).
- Importación CopyQ: [track de importación](tracks/007-copyq-import.md); API de plugins y runners: [Actions/Scripting](topics/actions-and-scripting-api.md).
- Search, fechas, facets, source filters y ranking/FTS5: [query syntax](topics/filtering-and-query-syntax.md), [motor de search](topics/search-plan-engine.md) y [rendimiento](topics/performance-and-memory.md).
- AI, endpoints/modelos del producto y privacidad externa: [AI search/actions](topics/ai-search-and-actions.md), [Actions/Scripting](topics/actions-and-scripting-api.md) y [gates locales](../AGENTS.md). Modelos del producto no son defaults del harness.
- UI, componentes y virtualización: [Mantine](topics/mantine-ui-system.md), [superficies](topics/ui-surface-architecture.md) y [track de lista virtual](tracks/002-virtual-history-list.md).
- Clips sensibles, sandbox y permisos tentativos: [Actions/Scripting](topics/actions-and-scripting-api.md) y [track de clips seguros](tracks/020-secure-clips-password.md). Mantener sus límites y gates; esta curaduría no autoriza implementarlos.

Estas rutas permiten encontrar los contratos y preguntas locales sin mantener otro router de estado. La copia histórica preserva lo aún no reconciliado; ningún check documental demuestra que una pregunta de producto quedó resuelta.
