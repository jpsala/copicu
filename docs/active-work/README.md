# Active Work

Trabajos vivos retomables. Usar cuando una conversacion o investigacion todavia no merece una decision estable, pero debe poder retomarse.

## Convencion

Crear archivos Markdown con frontmatter minimo:

```yaml
---
id: nombre-corto
status: active
updated: YYYY-MM-DD
---
```

Cuando un trabajo descubra algo durable, promoverlo a `docs/PROJECT.md`, `docs/DECISIONS.md`, `docs/OPEN_QUESTIONS.md` o `docs/topics/`.

## Cierre De Sesion

Al cerrar una sesion, usar `active-work` como fuente principal de continuidad:

- actualizar estado, checklist y proximo corte;
- promover decisiones durables a `docs/DECISIONS.md`;
- promover research y patterns a `docs/topics/`;
- actualizar `docs/WORKING_MEMORY.md`;
- evitar historial largo o duplicacion.

Si el usuario quiere seguir en una sesion nueva, responder con una sintesis compacta opcional para pegar como prompt.

## Inventario

Este README no mantiene una lista de trabajos ni su estado. Evitar duplicar estado aca porque se desincroniza facil.

Para encontrar trabajos:

- usar `docs/WORKING_MEMORY.md` si se necesita una vista corta de continuidad;
- listar los archivos de esta carpeta si se necesita inventario completo;
- abrir el active work relevante y tomar su frontmatter + seccion de estado actual como fuente de verdad.

Si un active work necesita aparecer en el router general, indexarlo en `docs/TOPICS.md` solo cuando sea un punto de entrada real para futuras sesiones.
