# Feature Spec: Selection-aware Metadata Inspector

Status: implemented and verified on 2026-09-10

## Objetivo

Consolidar la edición de metadata de uno o varios clips en una superficie reusable, explícita y keyboard-first. Para edición focalizada de un solo clip, `F2` compone esa misma metadata con el contenido editable en una interfaz única; las operaciones batch y la entrada dedicada `Shift+F2` conservan la utility standalone.

El patrón base se llama **Selection-aware Metadata Inspector**. Es un property inspector adaptativo: recibe una selección congelada, muestra valores escalares y conjuntos con su estado agregado, acumula intenciones de cambio y guarda todo en una única transacción SQLite. En `F2`, el inspector se embebe junto al editor CodeMirror y participa del mismo dirty state y commit.

## Decisión de dirección

### Dirección elegida: inspector reusable con dos hosts

Reusar la ventana Tauri `metadata`, su surface registry, lifecycle `CachedHidden`, prewarm, bounds y pending payload para edición dedicada y batch. Reusar la misma composición React dentro del editor `F2` para un único clip:

- un clip por `F2`: contenido y metadata editables, dirty state compartido y un solo guardado atómico;
- un clip por `Shift+F2` o entrada `Metadata`: edición directa y compacta en la utility standalone, con provenance por valor;
- varios clips: valores agregados `all | some | none`, operaciones staged y resumen exacto antes de guardar;
- futuro history manager: la misma composición React puede vivir como panel, sin cambiar el controlador ni los contratos.

Razones:

1. `F2` representa editar el clip completo; separar content y metadata obliga a recordar dos rutas para una sola entidad.
2. `Shift+F2` conserva una entrada rápida y focalizada para metadata sin duplicar implementación.
3. Conserva la inversión validada en `MetadataInspector`, la ventana `metadata`, `CachedHidden` y prewarm.
4. Mantiene visibles los estados mixtos y evita inferir intención desde un string o un placeholder gris.
5. Permite una escritura atómica por intención, sin N+1 ni guardados parciales entre contenido y metadata.

Tradeoffs:

- El editor `F2` necesita un layout responsive: dos paneles que ocupan toda la superficie cuando hay ancho y navegación por tabs cuando no lo hay. Las properties `client`, `project` y `activity` quedan disponibles, pero plegadas por defecto en esta variante por su baja frecuencia.
- El read model agregado y el control de concurrencia deben vivir en Rust/SQLite, no reconstruirse en React.
- El intent de single-item admite contenido opcional y debe verificar su fingerprint dentro de la misma transacción que metadata.
- La migración visual exige reemplazar la ruta content-only en una sola cutover, no coexistencia permanente.

### Alternativa descartada: mantener overlays especializados en el picker

Ventaja: diff inicial menor. Problemas: contradice la dirección standalone, conserva `TagEditor` y batch metadata como convenciones paralelas, y sigue cargando al picker con estado, fetches y guardados N+1.

### Alternativa descartada: textarea único como lenguaje de metadata

Ventaja: entrada rápida y compacta. Problemas: `all/some/none`, provenance, suppressions y operaciones escalares no se representan sin sintaxis nueva; obliga al usuario a distinguir notas de tokens y hace peligroso el reemplazo batch. `MetadataTextInput` puede seguir existiendo durante la cutover, pero no es el modelo de interacción final.

### Alternativa diferida: inspector universal o JSON/forms/plugins

No construir un framework de schemas, JSON forms, plugins ni properties arbitrarias. Sólo existen tags y las properties acotadas `client`, `project`, `activity`, más `title` y `notes`.

## Evidencia y mapa actual

### Superficies y entradas

| Entrada | Ruta y símbolos actuales | Estado / problema |
| --- | --- | --- |
| `Shift+F2`, item menu `Edit metadata`, shortcut global | `src/main.tsx:4314-4382` `beginEdit` y `openActiveMetadata`; `src/main.tsx:5963-5966`; `src/main.tsx:7643-7653` | Abren `metadata` standalone para un item cuando Tauri está disponible. |
| Script `metadata.editActive` | `src-tauri/src/actions.rs:1338-1349`; `scripts/examples/025-assign-metadata-to-active.ts:42` | Construye otro payload single-item y abre la misma ventana. |
| Inbox `Catalog` | `src/main.tsx:4823-4826` `catalogItem` | Fuerza `beginEdit(..., "metadata", false)`, por lo que vuelve al overlay legacy dentro del picker. |
| Selección `Tags` | `src/main.tsx:4612-4646` `beginTagEdit`; `src/main.tsx:7017-7024`; `src/main.tsx:7761-7776` | Multi no carga agregados: `initialTags` es `[]`; `TagEditor` muestra campos separados Add/Remove sin `all/some/none`. |
| Selección `Metadata` | `src/main.tsx:4648-4667`, `4878-4922`, `7938-8033` | Overlay batch con Append/Replace/Smart merge global. Sólo agrega o reemplaza notes/tags, hace fetch por item y guarda uno por uno. |
| Crear item | `src/main.tsx:4669-4680`, `4839-4876`, `7777-7867` | Parsea properties, pero `CreateHistoryItemRequest` no las transporta ni `create_text_item` las persiste. |
| Settings Tags | `src/windows/secondaryWindows.tsx:1347-1431` y flujo de configuración de tags | Configura entidad global tag: nombre, color, pin, orden, hotkey, auto-apply. No es pertenencia del clip. |
| Scenario editors | `src/ui/ScenarioSwitcher.tsx`, `src/windows/Scenarios.tsx` | Reusan `TagInput` para el patch futuro de captura. No son selección de clips y conservan semántica add-only propia. |

### Ventana metadata actual

- `src/windows/secondaryWindows.tsx:771-962`, `MetadataWindowApp`, ya separa preview read-only, metadata editable, provenance generada y capture facts.
- `loadPayload` en `src/windows/secondaryWindows.tsx:798-846` reemplaza `payload` y `metadataText` ante pending state o evento nuevo. No consulta dirty state.
- `save` en `src/windows/secondaryWindows.tsx:852-882` usa `update_item_metadata`; es atómico para un item, pero no incluye revision/fingerprint y por eso es last-write-wins.
- `src-tauri/src/lib.rs:1736-1793` carga item, tags, properties y capture events con cuatro lecturas separadas y construye `MetadataEditorPayload` single-item.
- `src-tauri/src/lib.rs:4192-4282` conserva el payload host-owned y muestra/emite hacia una ventana `metadata` cacheada.

### Persistencia

- `src-tauri/src/storage/schema.rs:218-251`: `tags` y `clipboard_item_tags` modelan catálogo global y pertenencia normalizada con source/confidence.
- `src-tauri/src/storage/schema.rs:395-419`: `clipboard_item_properties` y `clipboard_item_metadata_suppressions` ya cubren properties acotadas, provenance y suppression.
- `src-tauri/src/storage.rs:3901-3950`: `set_item_tags_from_values` actualiza relaciones y luego sincroniza `clipboard_items.tags`.
- `src-tauri/src/storage.rs:3970-3985`: `clipboard_items.tags` es proyección/cache legacy, no autoridad.
- `src-tauri/src/storage.rs:2374-2416`: `update_item_metadata` guarda title, notes, tags y properties en una transacción de un item.
- `src-tauri/src/storage.rs:3097-3158`: `apply_item_tags` guarda varios items en una transacción global.
- Bug concreto: en patch remove, `src-tauri/src/storage.rs:3138-3145` crea suppression antes de saber si la relación existía. Quitar un tag `some` puede suprimirlo también en clips donde nunca estuvo presente.
- `src-tauri/src/storage.rs:1510-1658`: create/dedupe es transaccional y persiste tags, pero `CreateHistoryItemRequest` en `src-tauri/src/storage.rs:239-245` no incluye properties.

### Autocomplete y listboxes

- Search: `src/shared/search.ts:435-545` contiene matching, ranking y token replacement; `src/main.tsx:5815-6100` conserva draft/applied query, selección activa, navegación, dismissal y aceptación; `src/main.tsx:6409-6450` renderiza `search-autocomplete`.
- `MetadataTextInput`: `src/ui/TagEditor.tsx:190-345` replica detección de token, ranking, navegación y listbox sobre textarea.
- `TagInput`: `src/ui/TagEditor.tsx:347-543` replica ranking, active index, chips, create option y listbox sobre input.
- Command Palette y Action Picker: `src/main.tsx:8204-8504` repiten filtro, active index, listbox y navegación, pero su semántica es ejecutar acciones, no editar tokens.
- `src/ui/controls.tsx` ya concentra wrappers Mantine. `UiSelect` usa portal y `@mantine/core` ya está disponible.

Conclusión: hay mecánica listbox repetida, pero no un único problema de ranking. Search es un contrato protegido y no debe reescribirse como parte de este feature.

## Modelo de dominio

### Categorías

- `title`: escalar opcional.
- `notes`: texto opcional.
- `tags`: set de relaciones normalizadas.
- `properties.client`, `properties.project`, `properties.activity`: sets de valores normalizados.
- `tag config` (`label`, `color`, `pinned`, `sortOrder`, `hotkey`, `autoApplyEnabled`): configuración global separada.
- `capture context`: hechos event-scoped read-only.
- `clipboard_items.tags`: cache legacy derivada.

El contenido (`text`, MIME, blob) sigue fuera del modelo de metadata. La única integración es el host `F2`: compone ambos modelos y envía una intención transaccional que puede incluir un cambio de texto para un solo item.

## Read model agregado

Agregar un comando de alto nivel, nombre propuesto:

```ts
type MetadataSelectionRequest = {
  itemIds: number[];
};

type Presence = "all" | "some" | "none";
type MetadataSource = "manual" | "scenario" | "rule" | "enrichment" | "context";

type SourceCount = {
  source: MetadataSource;
  count: number;
  confidenceMin: number | null;
  confidenceMax: number | null;
};

type ScalarAggregate = {
  state: "same" | "mixed" | "empty";
  value: string | null;
  populatedCount: number;
};

type SetValueAggregate = {
  key: string;
  label: string;
  presence: Presence;
  presentCount: number;
  totalCount: number;
  sources: SourceCount[];
  tagConfig?: {
    tagId: number;
    color: string | null;
    pinned: boolean;
  };
};

type MetadataSelectionSnapshot = {
  itemIds: number[];              // sorted, unique, frozen
  itemCount: number;
  snapshotToken: string;          // opaque fingerprint of editable metadata
  title: ScalarAggregate;
  notes: ScalarAggregate;
  tags: SetValueAggregate[];
  properties: {
    client: SetValueAggregate[];
    project: SetValueAggregate[];
    activity: SetValueAggregate[];
  };
  singleItem: null | {
    contentPreview: string;
    contentKind: string;
    captureContextEvents: CaptureContextEvent[];
  };
};
```

Invariantes:

1. Rust ordena y deduplica IDs; falta de cualquier item falla el read completo.
2. Una sola adquisición de conexión produce snapshot coherente. No hacer `get_item` + `get_item_tag_entries` + `list_item_property_entries` por separado.
3. Tags/properties se agregan desde las tablas normalizadas. Nunca parsear `clipboard_items.tags` para determinar pertenencia.
4. `snapshotToken` se deriva dentro de la misma lectura de IDs y proyección editable. Puede ser un fingerprint determinista, por lo que no exige migración de schema.
5. Capture facts sólo se incluyen en single mode. No agregar ni resumir payload sensible de múltiples clips.
6. Limitar cantidad de IDs según una constante explícita y devolver error útil si se excede.

## Write model por intención

Agregar un único comando de alto nivel, nombre propuesto `apply_metadata_selection_intent`:

```ts
type ScalarIntent =
  | { op: "untouched" }
  | { op: "set"; value: string }
  | { op: "clear" };

type NotesIntent =
  | { op: "untouched" }
  | { op: "replaceAll"; value: string }
  | { op: "appendToEach"; value: string }
  | { op: "clearAll" };

type SetValueIntent = {
  key: string;
  op: "untouched" | "add" | "remove";
};

type MetadataSelectionIntent = {
  itemIds: number[];
  expectedSnapshotToken: string;
  content?: {
    value: string;
    expectedHash: string;
  };
  title: ScalarIntent;
  notes: NotesIntent;
  tags: SetValueIntent[];
  properties: {
    client: SetValueIntent[];
    project: SetValueIntent[];
    activity: SetValueIntent[];
  };
};
```

Semántica:

- `untouched`: cero writes para el campo/valor. Preserva source, confidence y suppressions.
- `add`: asegura el valor en todos los clips. Clips que ya lo tienen quedan intactos; sólo los ausentes reciben relación `manual` y limpian su suppression correspondiente.
- `remove`: elimina sólo relaciones que existen al comenzar la transacción. Crea suppression sólo para esos clips. Clips donde el valor estaba ausente quedan sin suppression.
- `title set/clear`: aplica el mismo valor a todos sólo tras intención explícita. No existe append ni merge.
- `notes replaceAll/clearAll`: operación destructiva explícita.
- `notes appendToEach`: agrega el bloque a cada nota conservando orden y usando una regla única de separación. No existe `smart merge`, porque deduplicar líneas cambia significado y orden.
- Properties usan la misma semántica set que tags. La key sigue cerrada a `client | project | activity`.
- La respuesta devuelve conteos reales y un nuevo snapshot, no un booleano ambiguo.

`content` sólo es válido para una selección de un item. Su ausencia mantiene la semántica metadata-only. Si está presente, `expectedHash` protege el contenido contra cambios concurrentes y el texto se actualiza dentro de la misma transacción que title, notes, tags y properties.

Toda validación, conflicto y escritura ocurre dentro de una única transacción SQLite:

1. validar IDs exactos y límite;
2. recomputar el fingerprint de metadata;
3. comparar con `expectedSnapshotToken`;
4. si existe `content`, validar cardinalidad single y comparar `expectedHash`;
5. aplicar contenido y operaciones de metadata;
6. sincronizar la cache legacy de tags sólo para items afectados;
7. commit;
8. emitir `HISTORY_CHANGED_EVENT` después del commit.

Un token viejo devuelve conflicto tipado y no escribe nada. La UI ofrece `Reload changes`; no hace merge silencioso.

## Suppressions y provenance

Decisión cerrada:

- Quitar un valor presente crea suppression en ese item, sin importar si su source era manual o generado. Esto evita que scenario/enrichment lo reintroduzcan sin intervención.
- Quitar un valor `some` no toca items donde estaba ausente y no fabrica suppressions para ellos.
- Reagregar un valor ausente es manual y limpia su suppression sólo en esos items.
- Un `add` sobre un valor ya presente no promueve su source ni borra confidence.
- Un save sin cambios normalizados no altera provenance.
- Multi muestra distribución resumida, por ejemplo `7 manual · 3 scenario`, no una falsa source única.
- Single muestra badge de source y confidence donde exista, manteniendo los requisitos de `specs/008-clipboard-enrichment/spec.md`.

## Composición UI

### Shell

Ventana `metadata`, variante `utility`, tamaño compacto pero redimensionable. Composición vertical:

1. Header: `Metadata` + `1 clip` o `12 clips`, indicador `Modified` y selección congelada.
2. Single only: preview de contenido read-only colapsable.
3. Title.
4. Notes.
5. Tags.
6. Properties: Client, Project, Activity.
7. Single only: provenance detallada y `Capture details` colapsable.
8. Sticky footer: change summary, Cancel, `Save changes`.

No usar cards anidadas. Separar secciones con spacing, labels y divisores discretos. Mantener tokens de tema, foco visible y densidad actual.

### Single mode

- Title: text input normal.
- Notes: textarea normal, sin tokens embebidos.
- Tags y properties: editable token combobox. Los chips muestran color/config existente y provenance.
- Quitar chip staged marca `remove`; Undo local restaura `untouched`.
- Agregar valor nuevo staged marca `add`.
- Preview/capture context siguen read-only.

### Multi mode

- No mostrar preview de contenidos ni capture events.
- Cada valor set muestra un checkbox/row con etiqueta, conteo y estado:
  - `all`: checked, `aria-checked="true"`;
  - `some`: indeterminate, `aria-checked="mixed"`, texto visible `N of M`;
  - `none`: unchecked, `aria-checked="false"`.
- La UI no usa gris como único indicador de mixed.
- La primera activación sobre `some` elige `add` y comunica `Add to missing (M-N)`; una acción secundaria explícita elige `remove from N`. No alternar ambiguamente `mixed -> none` sin texto.
- Los valores tocados muestran estado staged `Will add` o `Will remove` y `Undo`.
- Title mixed empieza `untouched`. Acciones explícitas: `Set title on all` o `Clear titles`.
- Notes mixed empieza `untouched`. Selector de intención: `Keep each note`, `Append to each`, `Replace all`, `Clear all`. No cargar un placeholder mixed como valor editable.

### Change summary

Visible en footer antes de guardar y anunciado con `aria-live="polite"` sólo cuando cambia:

- `Add #work to 3 clips`
- `Remove #client from 7 clips`
- `Append notes to 12 clips`
- `Set title on 12 clips`

El botón `Save changes` queda disabled sin operaciones. Operaciones destructivas muestran alcance exacto, pero no requieren un modal adicional si el resumen es inequívoco y el guardado es reversible sólo por edición posterior.

### Teclado

- Al abrir: foco en Tags si la entrada fue `Tags`; en Title para single `Metadata`; en el primer control con mixed state para multi `Metadata`.
- `Tab` / `Shift+Tab`: orden DOM entre secciones y footer.
- Token combobox: escribir filtra; `ArrowDown/ArrowUp` navega; `Enter` agrega/acepta; `Tab` acepta sólo si hay opción activa; `Escape` primero cierra suggestions y luego cancela la ventana si no hay popup; `Backspace` con input vacío enfoca el último chip, no lo elimina sin una segunda tecla.
- `Space` alterna row/checkbox enfocado y anuncia operación.
- `Ctrl+Z`: revierte la última intención staged del inspector cuando el foco no está en un input con undo nativo.
- `Ctrl+Enter`: guarda.
- `Escape` con draft dirty abre elección in-window `Keep editing` / `Discard changes`; con draft limpio cierra.
- No secuestrar Delete dentro de inputs.

### Mouse

- Click en row o checkbox ejecuta la misma intención.
- Click en `N of M` puede mostrar detalle agregado no sensible, no una lista de contenidos.
- Click en chip remove sólo stages la operación.
- Hover complementa, nunca sustituye labels, foco o estado.

## Dirty payload, concurrencia y selección

### Selección congelada

Al abrir, el picker envía `itemIds` de `effectiveSelection` ordenados y deduplicados. La ventana fija esos IDs hasta guardar/cancelar. Cambios posteriores de selección en el picker no retargetean el inspector.

El header muestra `Editing 12 selected clips` y puede ofrecer `Reload current selection` como nueva apertura explícita, nunca automática.

### Payload entrante

- Draft limpio: reemplazar payload y enfocar según `focusTarget`.
- Draft dirty, mismos IDs, snapshot distinto: conservar draft y mostrar conflicto `Metadata changed since this inspector opened`; acciones `Reload changes` y `Keep editing` hasta intentar save, que igualmente valida token.
- Draft dirty, IDs distintos: guardar el payload como pending y mostrar `Another metadata request is waiting` con `Save and open`, `Discard and open`, `Keep editing`.
- Nunca llamar `loadPayload` directamente sobre estado dirty.
- Cerrar una ventana `CachedHidden` respeta el mismo guard de dirty; ocultarla no puede borrar el draft.

## Límite de reuso

### Rust / SQLite

Reusar y concentrar:

- normalización de tags/properties;
- lectura agregada coherente;
- fingerprint/snapshot token;
- intent applier transaccional;
- provenance/suppression;
- sync de cache legacy;
- emisión post-commit.

No exponer SQL ni relaciones crudas al frontend.

### Contratos TypeScript

Mover `MetadataSelectionSnapshot`, intents y resultados a `src/shared/contracts.ts`. No duplicarlos dentro de `secondaryWindows.tsx`.

### Reducer/controlador headless

Un reducer puro `metadataInspectorReducer` posee:

- snapshot base;
- selección congelada;
- intents staged;
- dirty;
- pending payload;
- save/conflict/error;
- change summary derivable.

No conoce Tauri, Mantine, SQL ni ranking. Un controller fino traduce comandos/eventos Tauri.

### Combobox/token

Crear una primitiva tipada y acotada, nombre propuesto `EditableTokenCombobox<T>`:

- shell de input, popup/listbox, active descendant, navegación, portal, focus return y chips;
- basada en Mantine `Combobox` o sus primitives ya instaladas, encapsulada en `src/ui/` y estilada con tokens Copicu;
- recibe `getKey`, `renderToken`, `getCandidates`, `onCommit`, `allowCreate`.

Los adapters de dominio poseen ranking y reemplazo:

- tags: exact > prefix > contains, pinned, itemCount, label;
- property values: exact > prefix > contains, frecuencia, label;
- search: queda intacto en `src/shared/search.ts` y `src/main.tsx`;
- Command Palette/Action Picker: quedan intactos hasta que un segundo consumidor real justifique extraer sólo la mecánica.

Al migrar metadata, `TagInput` y `MetadataTextInput` dejan de ser convenciones activas allí. `ScenarioSwitcher` puede seguir con `TagInput` temporalmente; si adopta la primitiva nueva debe conservar su semántica add-only y eliminar entonces el componente viejo, no crear un adapter paralelo indefinido.

### MetadataInspector

`MetadataInspector` compone controles y reducer. No contiene fetch, window lifecycle ni SQL. Variantes permitidas:

- `existing-single`;
- `existing-multi`;
- `create` con snapshot vacío y sin capture facts.

No crear un renderer universal de fields ni schema-driven forms.

## Entradas finales

- `F2`: abre dentro del picker el editor unificado del clip activo, con CodeMirror y `MetadataInspector`, un dirty state combinado y un único `Save changes`.
- `Ctrl+F2`: conserva la apertura del editor externo de contenido.
- `Shift+F2`, `Metadata`, shortcut global y `metadata.editActive`: abren la utility `metadata` con `focusTarget: "overview"`.
- `Tags` en selection bar/item menu: abre `metadata` con los IDs congelados y `focusTarget: "tags"`.
- `Catalog Inbox item`: abre la misma superficie y conserva el efecto actual de quitar Inbox sólo después de save exitoso.
- `Create`: mantiene Content como campo separado y embebe `MetadataInspector` en modo create. El request final incluye title, notes, tags y properties estructuradas.
- Futuro `history-manager`: monta `MetadataInspector` como panel para su selección estable, usando los mismos comandos.
- Tag manager futuro/Settings: edita nombre, color, pin, orden, hotkey y auto-apply globales. El inspector sólo muestra ese color/config y ofrece navegación `Manage tag`, no los modifica inline.

## Ruta de migración limpia

### Corte A: backend y contratos

1. Agregar `MetadataSelectionSnapshot` y `MetadataSelectionIntent` Rust/TS.
2. Implementar read agregado con una sola conexión y fingerprint sin migración.
3. Implementar intent applier con una sola transacción global.
4. Corregir suppression parcial: sólo suprimir tras confirmar relación presente.
5. Extender create para properties estructuradas dentro de su transacción actual.

### Corte B: inspector standalone

1. Extraer `MetadataWindowApp` a su propio archivo/chunk si el corte lo justifica por tamaño, sin cambiar label/lifecycle.
2. Agregar reducer/controller y `EditableTokenCombobox`.
3. Reemplazar textarea-token por campos Title, Notes, Tags y Properties.
4. Implementar single/multi, dirty guard, pending payload y conflict UI.
5. Conservar provenance y capture details single-item.

### Corte C: cutover de entradas

1. `Tags`, `Metadata`, selection bar, marked actions, item menu, `Shift+F2`, global shortcut, script e Inbox Catalog pasan a `open_metadata_window({ itemIds, focusTarget })`.
2. Eliminar `BatchMetadataDraft`, `TagEditorDraft`, `saveBatchMetadata`, `saveTagEditor`, overlay batch y fallback metadata de `EditDraft` en `src/main.tsx`.
3. Eliminar `TagEditor` como editor de pertenencia. Conservar o migrar `TagInput` sólo donde siga siendo consumidor real de scenario create/edit.
4. Retirar comandos `apply_item_tags`, `set_item_tags`, `update_item_metadata` y `update_history_item` de la UI sólo cuando no queden callsites reales; el intent command los sustituye para metadata. No dejar aliases ni shims permanentes.
5. Actualizar mocks visuales y tests según el contrato nuevo, no re-pinnear strings legacy.

### Corte D: create

1. Reusar los fields del inspector dentro de Create, manteniendo Content separado.
2. Cambiar `CreateHistoryItemRequest` a tags/properties estructurados.
3. Eliminar parseo de properties que hoy se descarta.

No modificar Find/search, feed virtualizado ni tag global manager en estos cortes.

## Riesgos y mitigaciones

| Riesgo | Mitigación |
| --- | --- |
| Pérdida de draft por evento nuevo | Reducer dirty-aware y pending payload explícito. |
| Last-write-wins | `expectedSnapshotToken` verificado dentro de transacción. |
| Guardado parcial batch | Un único intent command y una única transacción. |
| N+1 | Read agregado y write set-based/transactional en Rust. |
| Suppression sobre item sin relación | Remove consulta relación presente antes de suppress/delete. |
| Provenance promovida por no-op | `untouched` y add sobre presente no escriben. |
| Mixed representado sólo por color | Texto `N of M`, checkbox indeterminate y `aria-checked="mixed"`. |
| Abstracción excesiva | Combobox mecánico acotado, adapters de dominio y reducer específico. |
| Regresión de search | No tocar ranking, token replacement ni handlers de search en este feature. |
| Confusión tag config vs membership | Config global fuera del inspector; sólo lectura visual del color/config. |

## Criterios de aceptación

1. Toda edición de metadata de items existentes reutiliza `MetadataInspector`; `F2` lo embebe para single y las entradas dedicadas usan la surface `metadata`.
2. `F2` muestra content y metadata en una única interfaz responsive y guarda ambos con una sola acción.
3. `Ctrl+F2` conserva el editor externo y `Shift+F2` conserva la utility metadata-only.
4. La selección queda congelada y visible; cambios del picker no retargetean el draft.
5. Tags/properties muestran `all/some/none` con conteos y estado accesible.
6. Cada valor set soporta `untouched/add/remove`; unchanged preserva provenance y confidence.
7. Remove parcial no crea suppressions en items donde el valor estaba ausente.
8. Notes mixed requiere una operación explícita; no existe Smart merge.
9. Title mixed requiere set/clear explícito; default `untouched`.
10. El footer muestra alcance exacto antes de guardar y Save se deshabilita sin cambios.
11. Un payload entrante nunca reemplaza silenciosamente un draft dirty.
12. Un save con snapshot de metadata o hash de content stale falla sin writes y ofrece reload.
13. Batch read no hace N+1 y batch write usa una única transacción global.
14. Content y metadata staged por `F2` se guardan all-or-nothing en esa misma transacción.
15. Create persiste properties estructuradas además de title, notes y tags.
16. `clipboard_item_tags` y `clipboard_item_properties` siguen siendo autoridad; cache legacy sólo se deriva.
17. Tag color/nombre/pin permanecen configuración global separada.
18. Search conserva ranking, navegación, replacement y sensación observables.
19. La cutover elimina la ruta F2 content-only sin aliases o shims permanentes.

## Verificación requerida

Backend:

- tests Rust focales de read agregado, fingerprint conflict, transacción all-or-nothing, provenance no-op, add sobre presente, add sobre ausente, remove all, remove some sin suppression en absent, properties y create/dedupe con properties;
- `cargo check --tests`;
- suite canónica `npm run rust:test`.

Frontend:

- reducer tests sólo para transiciones/invariantes que puedan romperse;
- visual checks desktop y narrow de single, multi `all | some | none`, mixed notes/title, summary, conflict y dirty pending payload;
- `npm run build` y `npm run visual:check`;
- validación real de la ventana Tauri para foco inicial, `Ctrl+Enter`, Escape dirty/clean, prewarm/reopen, bounds y apertura desde Tags/Metadata/Inbox/script.

Search equivalence:

- no se requiere reescritura ni test nuevo si sus archivos no cambian;
- si se extrae mecánica compartida en un corte posterior, comparar explícitamente ranking, ArrowUp/Down, Tab, Enter, Escape, token replacement y draft/applied query.

## Estado de esta spec

Implementada end to end el 2026-09-10. La cutover unificó single, multi y create sobre `MetadataInspector`; Rust agrega desde relaciones normalizadas y aplica una intención en una transacción; la utility `metadata` conserva `CachedHidden`, prewarm y bounds.

Evidencia del corte:

- `npm run build`: pasa;
- reducer/text tests: 7 pasan, 30 assertions;
- visual focalizado de metadata, rutas F2/Shift+F2, Inbox, preservación concurrente, Escape, High contrast y reduced motion: 16/16 desktop+narrow;
- `npm run rust:test`: 237 tests pasan;
- `cargo check --tests`: pasa;
- `npm run visual:check`: 303/312 pasan; ocho fallas repetidas son baselines ajenos a metadata (initial-query ownership, capture-mode menu, initial-history error copy y placeholder Search), duplicadas desktop/narrow. La novena fue una corrida narrow transitoria de preview DTO que sí pasa en el corte focalizado. Search no se modificó para reanclar tests de wording.

Extensión `F2` unificada verificada el 2026-09-10:

- visual focalizado desktop+narrow: 4/4 para carga full-content, panel metadata, commit combinado y rutas `Ctrl+F2`/`Shift+F2`;
- `npm run build` y `cargo check --tests`: pasan;
- `npm run rust:test`: 238 tests pasan, incluidos commit content+metadata y rollback por conflicto/falla.

El smoke Tauri aislado encontró y corrigió una incompatibilidad real `tags: string[]`/`Option<String>` en create. El contrato final usa `Vec<String>`, persiste tags/properties dentro de la misma transacción y conserva el string legacy sólo como proyección derivada.

Smoke post-release instalado: `Copicu 0.4.14` quedó activo desde `%LOCALAPPDATA%\Copicu\copicu.exe`; el picker real abrió con el shortcut configurado y `Shift+F2` abrió la utility `Copicu Metadata` sobre el clip activo. `Escape` cerró el inspector limpio sin persistir cambios y el proceso permaneció activo en tray.