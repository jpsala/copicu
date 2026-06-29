---
id: paste-queue
status: parked
updated: 2026-06-29
---

# Paste Queue

Track para retomar cuando JP quiera implementar una cola de pegado. Por ahora queda **parked**: la idea interesa, pero requiere diseño y dogfood cuidadoso antes de tocar producto.

## Idea

Convertir Copicu de selector de clipboard a una **cinta ordenada de pegado**:

1. seleccionar varios clips;
2. crear/reemplazar una cola;
3. usar un hotkey para pegar el siguiente item en una app externa;
4. avanzar/retroceder/limpiar la cola sin volver al picker.

Caso base: llenar formularios con nombre, email, telefono, fecha, etc.

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

## Preguntas Abiertas

- ¿La cola debe ser una sola global o varias nombradas?
- ¿Debe persistir entre reinicios?
- ¿Paste next debe copiar+pegar o solo copiar al clipboard?
- ¿Como manejar imagenes/html/fileList?
- ¿Que hotkey real no choca con el entorno de JP?

## Proximo Corte Recomendado

Si se retoma: implementar primero **Slice 1** como built-ins + Quick Actions, sin recipes. Validar con un formulario sintetico antes de pensar en automatizacion avanzada.
