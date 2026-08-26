---
id: paste-queue
status: completed
updated: 2026-08-26
---

# Paste Queue

Primer corte implementado: cola efimera host-owned, acciones contextuales y hotkey global configurable, sin persistencia ni una superficie nueva.

## Idea

Convertir Copicu de selector de clipboard a una **cinta ordenada de pegado**:

1. seleccionar varios clips;
2. crear/reemplazar una cola;
3. usar un hotkey para pegar el siguiente item en una app externa;
4. avanzar/retroceder/limpiar la cola sin volver al picker.

Caso base: llenar formularios con nombre, email, telefono, fecha, etc.

## Decisiones 2026-08-26

- Una sola cola activa, efimera: sobrevive hide/show mientras Copicu corre, se limpia al completarse y no persiste tras reiniciar.
- La seleccion conserva el orden visual actual del picker; la accion invierte ese orden. Una seleccion visible `1, 2, 3` produce la cola `3, 2, 1`, independientemente del orden de clicks.
- Cada pulsacion del hotkey global pega exactamente un item y avanza. No hay rafaga automatica ni paso manual adicional con `Ctrl+V`.
- Preparar una cola reemplaza la activa. Append, colas nombradas, recipes y reordenamiento quedan fuera del primer corte.
- La entrada primaria reutiliza **Quick Actions** del picker (`Ctrl+Alt+Q`, `Enter` o `1`-`9`) y el registry contextual existente. El menu batch puede exponer la misma accion para discoverability; no se crea un segundo selector de acciones.
- La cola y `Paste next` son primitivas host-owned/built-in. Un script global no recibe seleccion del picker y el runner actual no debe asumir foco, estado ni loops de paste.
- `Paste next` usa `Ctrl+Alt+Shift+V` por defecto y sigue siendo configurable en Settings. El default de tres modificadores evita `Ctrl+Shift+V`, ya observado como ocupado en el entorno, y reduce colisiones con shortcuts de editores; cualquier conflicto real de registro se reporta y no invalida los shortcuts que ya estaban activos.
- El feedback minimo fuera del picker usa notificaciones host que no toman foco: cola creada, cola completada/vacia y error. No se notifica cada paste exitoso.

Flujo objetivo:

1. seleccionar varios items en el picker;
2. abrir Quick Actions y ejecutar `Queue selected, bottom to top`;
3. Copicu guarda IDs en orden inverso, oculta el picker y restaura la ventana previa sin pegar;
4. cada `Paste next` reutiliza la ruta host de write -> focus previous -> paste;
5. avanzar solo despues de completar la operacion host; al terminar, limpiar la cola;
6. si el item ya no existe o falla focus/paste, no pegar otro item en la misma pulsacion y mostrar feedback explicito.

## Superficies Posibles

- Quick Actions (`Ctrl+Alt+Q`):
  - `Replace Paste Queue With Selection`;
  - `Append Selection To Paste Queue`;
  - `Paste Next`;
  - `Open Paste Queue`;
  - `Clear Paste Queue`.
- Menu contextual multi-seleccion.
- Hotkeys globales/locales:
  - pegar siguiente;
  - saltar item;
  - volver al anterior;
  - abrir cola.
- Overlay compacto tipo HUD: `2 / 5`, titulo/preview redacted y accion actual.

## Modelo Mental

La cola no deberia duplicar contenido por defecto. Deberia apuntar a `clipboard_items` y guardar orden/estado.

Modelo tentativo:

```text
paste_queues
- id
- name
- active_index
- created_at
- updated_at

paste_queue_items
- id
- queue_id
- position
- clipboard_item_id
- transform nullable
- status pending|pasted|skipped
```

## Slices Posibles

### Slice 1: Cola Basica

- Una sola cola activa.
- Multi-select -> replace queue.
- `Paste next` usa el item actual y avanza indice.
- `Clear queue`.
- Sin recipes, sin teclas especiales, sin UI compleja.

### Slice 2: Queue UI

- Panel/overlay para ver orden.
- Reordenar, remover, resetear indice.
- Mostrar previews cortos y metadata.

### Slice 3: Form Recipes

La cola puede mezclar clips y eventos:

```text
clip: nombre
key: Tab
clip: email
key: Tab
clip: telefono
key: Enter
```

Requiere mas cuidado por seguridad/foco y debe pedirse confirmacion para automatizaciones largas.

## Riesgos / Gotchas

- Pegar en ventana equivocada si el foco cambio.
- Hotkeys globales pueden colisionar.
- Necesita buen feedback visual para no perderse en el indice.
- Si la cola incluye secure clips, el flujo debe pedir unlock justo a tiempo.
- No convertirlo en macro recorder general en primer corte.

## Decisiones Cerradas

- `Paste next` usa el default configurable `Ctrl+Alt+Shift+V`; el registro real sigue siendo la evidencia definitiva de disponibilidad.
- El feedback minimo no enfoca Copicu ni muestra contenido del item.
- La cola acepta todos los tipos que ya soporte `activate_item`; no agrega una ruta de clipboard paralela.

## Estado Implementado

- `src-tauri/src/paste_queue.rs` conserva una sola cola en memoria, invalida intentos stale y consume solo tras exito.
- Los built-ins `builtin.queueSelectedBottomToTop` y `builtin.clearPasteQueue` usan el registry existente; Quick Actions y el menu batch consumen la misma definicion.
- `Settings > General` persiste `pasteNextShortcut`; el inventario de shortcuts muestra registro, soporte y error.
- Verificacion automatizada: 192 tests Rust, `cargo check`, `cargo fmt --check` y build frontend.
- Smoke Windows con datos sinteticos: seleccion visual `THREE, TWO, ONE` pego `ONE, TWO, THREE`; la cuarta pulsacion no repitio; reemplazar pendientes pego la seleccion nueva; borrar el item pendiente no pego y mostro error manteniendolo; reiniciar devolvio `Paste Queue is empty`; Settings rechazo el duplicado `Alt+Meta+C` sin cerrar ni reemplazar el registro vigente.
