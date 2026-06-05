# Topics Del Proyecto

Router liviano de conocimiento del proyecto.

## Uso Para Agentes

1. Identificar el tema por el pedido.
2. Abrir solo el topic de entrada.
3. Abrir referencias profundas solo si el topic no alcanza.
4. Si se crea documentacion nueva, indexarla aca.

## Modelo

Cada topic tiene metadata al inicio:

```yaml
---
id: topic-id
status: active | reference | historical | draft | stale | paused | blocked
kind: how-to | reference | explanation | decision-map
triggers:
  - palabras o situaciones que activan el topic
primary_refs:
  - documentos profundos o codigo relevante
---
```

## Topics De Entrada

| Si el usuario pide o menciona | Abrir primero | Para que sirve |
| --- | --- | --- |
| Producto, MVP, CopyQ, alcance, recomendaciones | [Direccion de producto](topics/product-direction.md) | Resume la direccion inicial y donde mirar. |
| Ambicion Copicu, plugins, AI, metadata, busqueda potente | [Ambicion de producto](topics/product-ambition.md) | Define que se quiere construir por encima del baseline CopyQ. |
| VS Code, vscode, settings, keybindings, extensiones, snippets, tasks, launch config | [Ayuda con VS Code](topics/vscode-assistance.md) | Guia para ayudar a configurar VS Code sin pisar preferencias ni mezclar settings globales con workspace. |
| Funciones concretas de CopyQ, paridad, inventario de capacidades | [Inventario CopyQ](reference/copyq-feature-inventory.md) | Lista que hace CopyQ y como usarlo para roadmap/specs. |
| Aliases, abreviaturas, glosario, SA, CQ, CC, definiciones | `docs/GLOSSARY.md` | Define nombres cortos y terminos recurrentes del proyecto. |
| Stack, Tauri, Rust, SQLite, plugins, desarrollo | `docs/DEVELOPMENT.md` | Stack objetivo y arquitectura tecnica esperada. |
| Preguntas abiertas, decisiones pendientes | `docs/OPEN_QUESTIONS.md` | Lo que falta definir antes de fijar arquitectura. |
| Feature grande, milestone, spike implementable | `specs/` | Crear una spec antes de implementar cambios durables. |

## Documentos Raiz

| Documento | Rol |
| --- | --- |
| `PROJECT.md` | Proposito, alcance y riesgos. |
| `ASSISTANT_RULES.md` | Reglas de colaboracion, privacidad y tono. |
| `DEVELOPMENT.md` | Stack, arquitectura y verificacion. |
| `DECISIONS.md` | Decisiones tomadas y pendientes. |
| `OPEN_QUESTIONS.md` | Preguntas abiertas. |
| `GLOSSARY.md` | Aliases, nombres cortos y definiciones recurrentes. |
| `WORKING_MEMORY.md` | Estado vivo y siguiente paso probable. |
| `active-work/` | Trabajos vivos retomables. |

## Regla Sobre Archivos Preexistentes

Los archivos que existian antes de instalar el sistema agentico no deben quedar sueltos. Integrarlos en `docs/`, moverlos a una ubicacion indexada, archivarlos con estado claro o preguntar antes de borrarlos.
