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

## Cierre Y Continuacion De Sesion

Al cerrar o continuar una sesion, usar `tracks` como fuente principal de continuidad cuando hay trabajo vivo:

- actualizar estado, checklist y proximo corte;
- promover decisiones durables a `docs/DECISIONS.md`;
- promover research y patterns a `docs/topics/`;
- actualizar `docs/WORKING_MEMORY.md`;
- evitar historial largo o duplicacion.
- si un track crece como transcript, compactarlo y mover detalle a referencia profunda o archivo historico.

`cerrar sesion` termina con una sintesis compacta despues de persistir valor.

`continuar sesion` hace el mismo cierre de valor y despues abre una sesion nueva con handoff compacto si la herramienta esta disponible. Si no lo esta, devolver un prompt pegable. El handoff debe apuntar a docs actualizados; no debe reemplazarlos ni repetirlos.

`continuar con goal` hace checkpoint de valor y sigue en la misma sesion bajo Goal.

`continuar sesion con goal` hace checkpoint de valor, abre una sesion nueva y pide arrancar el proximo lote bajo Goal en esa sesion limpia.

## Inventario

Este README no mantiene una lista de trabajos ni su estado. Evitar duplicar estado aca porque se desincroniza facil.

Para encontrar trabajos:

- usar `docs/WORKING_MEMORY.md` si se necesita una vista corta de continuidad;
- listar los archivos de esta carpeta si se necesita inventario completo;
- abrir el track relevante y tomar su frontmatter + seccion de estado actual como fuente de verdad.

Si un track necesita aparecer en el router general, indexarlo en `docs/TOPICS.md` solo cuando sea un punto de entrada real para futuras sesiones.
