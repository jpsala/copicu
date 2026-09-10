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
  includeCounts?: boolean;
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
  queryExplanation?: {
    version: 1;
    chips: Array<{ label: string; queryWithoutClause: string }>;
    diagnostics: Array<{ severity: "warning" | "error"; code: string; message: string }>;
  } | null;
  warnings: string[];
};
```

Flujo:

```text
React search input
  -> history_search({ query, cursor, limit, mode: "structured" })
  -> `re:` inicial: regex case-insensitive sobre los campos buscables
     cualquier otra query: parse_history_query(query)
  -> SearchPlanV1 validado
  -> SQLite COUNT total + COUNT filtrado
  -> SQLite SELECT paginado con el orden del plan
```

La busqueda conserva keyset pagination. No usa `OFFSET`. El snapshot aplicado es dueno de query y cursor: una busqueda explicita conserva ownership de la primera pagina; refreshes de foco/clipboard, actions y paginas siguientes no pueden consumir ni reemplazarla con un draft pendiente. Los refreshes de background diferidos se repiten cuando termina el request foreground. Un fallo de `load more` invalida ese cursor para evitar retries automaticos infinitos.

El cursor por defecto codifica Inbox, timestamp Inbox nullable, ultima copia e ID.
Un plan con sort custom no devuelve `nextCursor` y rechaza cursores entrantes
hasta tener cursores sort-aware para esos ordenes.

Invariante de keyset: `ORDER BY`, cursor y predicado de continuacion deben
representar la misma tupla, incluidas prioridades como Inbox y el tratamiento
de `NULL`. Validar el recorrido completo de un dataset mixto con paginas chicas:
cada ID debe aparecer una sola vez. Una primera pagina correcta no prueba el
cursor. La tupla completa viaja en el cursor sin releer su fila; cubre datasets
estables, no un snapshot frente a cambios concurrentes del orden.

Durante scroll manual, refresh renueva todos los IDs retenidos mediante
`get_history_items_preview` en lotes de hasta 100, sin reordenar ni reemplazar el
cursor/ancla. Omite IDs borrados, rechaza respuestas stale y descarta contenido
expandido si cambio el hash. Ver [`035-picker-reliability`](../tracks/035-picker-reliability.md).

`All results` siempre opera sobre la query aplicada, no sobre el draft visible. El comando bulk esta autorizado solo para la ventana principal y una query no vacia sin filtros efectivos falla cerrada antes de llegar a un `UPDATE` global.

La UI usa `totalCount`/`filteredCount` para el badge del picker. Tauri puede serializar conteos omitidos como `null`; el frontend solo debe actualizar estado de conteo cuando recibe numeros para no caer a `history.length` y hacer oscilar badge/scroll.

Dogfood 2026-07-09: con keyset/cursor pagination el virtualizer debe usar filas cargadas + una fila loader. El experimento de reservar altura por `totalCount`/`filteredCount` se revirtio: inventar placeholders de items no cargados rompe expectativas con filas variables. Una scrollbar proporcional al total real requiere otro contrato backend/windowing, no solo frontend.

## Ejecucion De Search

El picker soporta `Settings > Picker > Search & filters > Search trigger`:

- `Realtime while typing`: comportamiento por defecto; cada cambio dispara busqueda con debounce corto.
- `When pressing Enter`: tipear deja la query pendiente; Enter aplica la busqueda. Si la query ya esta aplicada, Enter conserva la accion de activar item.

El boton `Search` aplica explicitamente desde ambos modos. El control rapido con icono y tooltip alterna solo entre los dos modos persistentes.

## Hardening De Query 2026-08-06

- El clasificador del draft comparte la semantica del tokenizer Rust: valores estructurados entre comillas se clasifican por su contenido (`"tag:work"` es un filtro completo), mientras un operador sin valor (`"tag:"`) permanece incompleto y no dispara una busqueda parcial.
- La respuesta inicial sin filtro puede llegar despues de que el usuario haya escrito un draft retenido; solo se acepta para publicar el snapshot inicial cuando no hay un resultado aplicado. Las respuestas stale de consultas posteriores se descartan por secuencia/generacion.
- El benchmark de Find usa historial sintetico y mide el escaneo acotado a 50k items bajo escrituras concurrentes; no habilita FTS ni envia contenido a servicios externos.

El prefijo inicial exacto `re:` activa una expresion regular case-insensitive sobre los mismos campos que la busqueda plain. Sin ese prefijo, metacaracteres como `.` o `*` conservan el tratamiento literal previo. El motor es el crate `regex` de Rust: sin lookarounds ni backreferences. El prefijo es exclusivo: no se puede combinar con otros filtros en la misma query. `re:` sin patron se retiene como draft incompleto; un patron invalido falla cerrado, muestra el error y conserva el snapshot aplicado anterior.

## Filter Lock

El icono de candado dentro del search, o `Ctrl+Shift+L`, fija el filtro aplicado actual. Mientras esta activo:

- hide/show y activacion de items no limpian la query;
- el icono usa `aria-pressed` y estado accent visible;
- cambios posteriores de filtro actualizan el valor fijado cuando se aplican;
- el filtro se restaura tambien tras reiniciar el renderer/app mediante storage local;
- desbloquear restaura el reset normal en el siguiente cierre del picker.

No se puede fijar una query vacia ni el composer AI. Cuando existe una query, la `X` dentro del search la limpia inmediatamente; si estaba fijada, tambien libera el lock y elimina su valor persistido para que no reaparezca. `Keep picker open` y `Pin on top` siguen siendo politicas de ventana separadas: filter lock solo conserva la query. Una captura nueva respeta estrictamente el filtro: aparece solo si matchea; no se agrega una excepcion visual ni se altera metadata automaticamente para forzarla dentro del resultado.

`Confirm structured filters with Enter` es un setting independiente. Si esta activo y el modo persistente es `realtime`, un draft con sintaxis estructurada explicita (`#tag`, negacion o prefijos soportados como `tag:`, `kind:`, `has:`, `after:`) usa `enter` como trigger efectivo solo hasta aplicar o limpiar esa query. El setting global no cambia y el status anuncia `Structured query, press Enter`. La deteccion frontend es conservadora y solo decide UX; Rust sigue siendo la autoridad semantica.

Invariante 2026-06-29: aunque el modo no sea realtime, el picker debe cargar historial inicial al abrir para mostrar total/resultados. Lo que se desactiva es buscar en cada tecla, no el primer load.

La ayuda in-app vive en el picker como boton `?` y entrada `Search help` del menu. Debe cubrir ejemplos de sintaxis local, filtros por metadata/contexto/fecha, AI `ai:` y shortcuts de busqueda/metadata. Mantenerla sincronizada con esta tabla cuando cambie el contrato.

## Sintaxis Actual

Texto plain busca en:

- `text`;
- `title`;
- `notes`;
- `tags`;
- `mime_primary`;
- `content_kind`;
- `context_search_text` oculto, generado desde eventos de captura (app, ventana, ruta de exe, formatos, dominio, source).

El modificador visible `in:scope1,scope2` limita los terminos plain a uno o mas
grupos de campos. Usa el mismo autocomplete que `tag:` y los demas operadores,
sin boton ni menu separado. El autocomplete muestra todos los estados, no
oculta lo elegido: incluido, heredado por otro scope, excluido, disponible o
parcial. Al escribir un nombre se filtran opciones; `-` permite completar una
exclusion. `metadata` incluye title, notes y tags.

`in:metadata,-notes` busca en titulo y tags; `in:-context` busca en todos los
campos menos contexto. Las exclusiones prevalecen sobre inclusiones. Excluir
un campo lo ignora al buscar, no descarta clips por lo que contenga ese campo.
Sin scopes positivos se parte de todos los campos; un conjunto efectivo vacio
nunca se convierte implicitamente en todos. Sin terminos plain, los scopes
no agregan un filtro de filas.

Settings agrupa `Default search scopes`, `Search trigger` y `Confirm structured
filters with Enter` en `Picker > Search & filters`. La representacion de
estados coincide con el autocomplete. `Only` limita a un scope y `Reset to all`
restaura todos. El picker hereda estos scopes cuando el draft no declara `in:`;
los muestra como campos incluidos y excluidos en una franja debajo del buscador,
sin ocupar ancho del input, y resuelve una query explicita antes de ejecutar.
Reemplazar todo el texto no elimina el default.
Un `in:` escrito reemplaza el default, no se combina con el; `in:all` permite
buscar deliberadamente en todos los campos. `re:` conserva su semantica
exclusiva. Los planes explicitos, filtros guardados y scripts mantienen su
autoridad y no reciben defaults silenciosos del picker.
La franja distingue `Default`, `Query`, `Saved` o `Regex`, conserva el estado
parcial de grupos y comparte espacio con los chips de otros filtros aplicados.
No repite la query ni una explicacion generica `Interpreted` para busquedas
deterministicas; mantiene diagnosticos, warnings y explicaciones de AI.
Quitar otro filtro no convierte el default heredado en un override escrito.

El input contiene el draft. El snapshot aplicado conserva su propia query,
plan y resultados mientras un draft espera Enter, esta incompleto o falla.
La comparacion usa la query efectiva: el prefijo heredado no genera por si
solo un aviso de draft pendiente. Si difieren, `Showing results for` identifica
la query de los resultados. Input vacio aplicado muestra todo el historial;
Clear elimina el filtro aplicado, sin perder el default de la proxima busqueda.
En el contrato Rust, una query sin scopes sigue buscando todos los campos:
la herencia es responsabilidad visible del picker, no estado oculto de SQL.

Cada resultado puede incluir `search_matches`, evidencia acotada calculada
desde el plan aplicado: campo y fragmento dividido en `before`, `matched` y
`after`. La UI resalta solo `matched`, como texto seguro. Esto permite explicar
coincidencias fuera del preview inicial o en contexto de captura sin enviar
todo el contenido ni todo el contexto al frontend. La evidencia respeta scopes
y exclusiones; filtros solo negativos o estructurales no inventan una palabra
coincidente. Hay como maximo un fragmento por campo y tres campos por item.
Los fragmentos conservan hasta 80 caracteres a cada lado y 160 de coincidencia,
con elipsis para recortes y limites Unicode seguros. El matcher se compila una
vez por pagina y lee las fuentes sin copiar todo el contenido al renderer.
`get_history_items_preview` acepta el `appliedDescriptor` para recalcular
evidencia de filas retenidas, incluso si solo cambio metadata. La expansion de
contenido conserva evidencia solo mientras sigan vigentes hash y snapshot.

Los scopes son:

- `content`: `text`;
- `metadata`: union de `title`, `notes` y `tags`;
- `title`, `notes` o `tags`: solo ese campo editable;
- `context`: `context_search_text`.

Los scopes solo restringen terminos plain, frases y exclusiones plain. Los
operadores estructurados como `tag:`, `kind:` o fechas conservan su semantica
propia. Las properties `client`, `project` y `activity` siguen fuera de texto plain.

Desde la siguiente captura/recaptura de cada clip, ese campo se reconstruye
solamente con sus 3 eventos mas recientes (`captured_at_unix_ms DESC, id DESC`).
`plain`, `re:`, `ctx:` y filtros `app:`, `window:`, `domain:`, `source:` y
`format:` dejan de encontrar contexto descartado; sus negaciones usan la misma
autoridad. Un termino aun presente en contenido o metadata editable puede
seguir matcheando plain: esos campos no se borran. Find invalida snapshots al
podar eventos para no mantener membresia por procedencias eliminadas.
Clips historicos no recapturados conservan su contexto sin poda retroactiva.
Contrato de escritura: [clipboard](clipboard.md#pattern-recomendado-para-mvp-0).

Operadores soportados por el motor. El picker resuelve antes el scope
predeterminado cuando no hay un `in:` explicito:

| Query | Significado |
| --- | --- |
| `sqlite migration` | ambos terminos deben matchear en campos buscables |
| `in:content invoice` | busca `invoice` solo en el contenido textual |
| `in:all invoice` | ignora el scope predeterminado del picker y busca en todos los campos |
| `in:metadata,context invoice` | busca `invoice` en title/notes/tags o contexto de captura |
| `in:metadata,-notes invoice` | busca en titulo y tags; ignora notas |
| `in:-context invoice` | busca en todos los campos salvo contexto de captura |
| `"sqlite migration"` | frase exacta como un unico termino |
| `re:^invoice-\d+$` | expresion regular case-insensitive sobre cualquiera de los campos buscables; el prefijo debe iniciar la query |
| `-draft` | excluye resultados que contengan `draft` |
| `meta:cliente` | busca solo en metadata visible/editable del usuario: title, notes y tags |
| `metadata:cliente` | alias de `meta:cliente` |
| `-meta:draft` | excluye items cuya metadata visible matchee `draft` |
| `title:factura` | busca solo en el titulo editable del item |
| `notes:"cliente cloud"` | busca solo en notas/tags editables del item |
| `ctx:vivaldi` | busca solo en contexto oculto de captura (`context_search_text`) |
| `context:vivaldi` | alias de `ctx:vivaldi` |
| `tag:ypf` | filtra el tag normalizado exacto `ypf` y sus descendientes `ypf/...`, no texto libre de notas |
| `#ypf` | alias de `tag:ypf` |
| `-tag:private` | excluye el tag normalizado `private` y sus descendientes |
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

`meta:` y `has:metadata` conservan el alcance documentado de titulo, notas y
tags. Las properties `client`, `project` y `activity` no participan de esos
filtros ni de texto plain. Ampliar ese alcance es una decision de producto
pendiente, no una reparacion implicita: cambia tambien resultados negados y
debe actualizar ayuda, planner y explicacion junto al compiler.

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
- El summary inicial evoluciono a explain versionado con chips y diagnosticos; ver las limitaciones actuales debajo.

## Limitaciones Actuales

- Usa `LIKE`, no SQLite FTS5 todavia.
- Tags estan normalizados; `clipboard_items.tags` sigue como cache de compatibilidad. El fallback legacy de busqueda puede tener semantica substring distinta si el item no tiene relaciones. Autoridad e integridad: [tag-management-hotkeys](tag-management-hotkeys.md#modelo-recomendado).
- `app:`, `window:`, `domain:`, `source:` y `format:` dependen de eventos de captura nuevos; items historicos previos a la migracion solo matchean si se recapturan o se rellenan por migracion futura.
- Fechas se interpretan como bounds de dia UTC; falta semantica local fina.
- `history_search(..., explain: true)` devuelve un explain versionado con chips removibles y diagnosticos tipados; el AST interno completo sigue siendo Rust-only.
- Los chips representan filtros estructurados aplicados; existe autocomplete local de tags/operadores, pero no un query builder visual.
- No hay ranking por relevancia; el orden por defecto prioriza Inbox y luego recencia. El cursor debe cumplir el invariante de keyset anterior.
- La nomenclatura UI mezcla checked y marked. Decision pendiente: consolidar copy visible sin perder que storage/API usan `marked`.

## Relacion Con AI

Invariante dogfood 2026-07-09: una query normal siempre ejecuta busqueda local deterministica, incluso si el composer visual esta en modo AI. El planner AI solo corre con prefijo explicito `ai:`; Enter/lupa sobre texto plain debe devolver `filtered / total matches`, no quedar en `AI planning`.

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

Estado vigente:

- UI manual con prefijo `ai:`;
- runner Node `scripts/ai-query-planner.mjs`;
- salida validada como `AiHistorySearchPlan`;
- ejecucion final sigue siendo SQLite local via query syntax;
- no se envia contenido de clips al modelo;
- el prompt/planner conoce `meta:/metadata:`, `title:`, `notes:/note:` y `ctx:/context:` para que AI traduzca lenguaje natural a los campos soportados sin inventar SQL.

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
