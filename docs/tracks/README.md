# Tracks

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

## Continuidad Durable

Un track conserva trabajo retomable y valor durable:

- actualizar estado y próximo paso sólo si cambiaron;
- promover decisiones durables a `docs/DECISIONS.md`;
- promover conocimiento reusable a `docs/topics/`;
- mantener `docs/WORKING_MEMORY.md` como foco mínimo;
- evitar historial, receipts y duplicación.

La capa local no prescribe cómo OMP planifica, ejecuta, paraleliza o gestiona sesiones.

## Inventario

Este README no mantiene una lista de trabajos ni su estado. Evitar duplicar estado aca porque se desincroniza facil.

Para encontrar trabajos:

- usar `docs/WORKING_MEMORY.md` si se necesita una vista corta de continuidad;
- listar los archivos de esta carpeta si se necesita inventario completo;
- abrir el track relevante y tomar su frontmatter + seccion de estado actual como fuente de verdad.

Si un track necesita aparecer en el router general, indexarlo en `docs/TOPICS.md` solo cuando sea un punto de entrada real para futuras sesiones.
