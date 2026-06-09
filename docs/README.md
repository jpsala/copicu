# Documentacion Del Proyecto

Este directorio guarda el contexto estable y recuperable para trabajar el proyecto con agentes sin cargar informacion innecesaria.

## Regla De Lectura Liviana

Leer en capas:

```text
README -> WORKING_MEMORY -> TOPICS -> topic especifico -> referencia profunda -> codigo puntual
```

No abrir documentos largos si el topic de entrada alcanza para decidir.

## Lectura Principal

1. `PROJECT.md`: proposito, alcance y direccion.
2. `ASSISTANT_RULES.md`: reglas de colaboracion y seguridad.
3. `DEVELOPMENT.md`: stack, persistencia, comandos y verificacion.
4. `DECISIONS.md`: decisiones tomadas o pendientes.
5. `OPEN_QUESTIONS.md`: preguntas abiertas.
6. `WORKING_MEMORY.md`: estado vivo y siguiente accion probable.
7. `TOPICS.md`: router de temas.
8. `GLOSSARY.md`: aliases, nombres cortos y definiciones recurrentes.

## Documentacion De Usuario

- `../README.md`: entrada publica del proyecto.
- `user/README.md`: guia clara de que es Copicu, que hace y como se usa.
- `user/scripts.md`: guia exhaustiva de scripts, metadata, API host, capabilities y ejemplos.

## Contexto Inicial

La discusion inicial sobre stack, producto, arquitectura, spikes, milestones y riesgos ya fue integrada en estos documentos. No debe quedar un archivo raiz paralelo como fuente de verdad.

Si aparece un documento preexistente nuevo, integrarlo en `docs/`, indexarlo en `TOPICS.md` o preguntar antes de eliminarlo.

## Organizacion

- `PROJECT.md`: identidad del proyecto.
- `ASSISTANT_RULES.md`: reglas para agentes.
- `DEVELOPMENT.md`: stack, persistencia y comandos.
- `DECISIONS.md`: decisiones y estado.
- `OPEN_QUESTIONS.md`: preguntas pendientes.
- `GLOSSARY.md`: aliases y definiciones recurrentes.
- `TOPICS.md` y `topics/`: conocimiento recuperable.
- `WORKING_MEMORY.md`: memoria operativa actual.
- `active-work/`: trabajos vivos retomables.
