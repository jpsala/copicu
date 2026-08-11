# Glosario Y Aliases

Fuente estable para abreviaturas, nombres cortos y definiciones recurrentes del proyecto.

## Aliases

| Alias | Significado | Nota |
| --- | --- | --- |
| SA | Sistema agentico de este proyecto | Documentacion, reglas y memoria que usan los agentes para trabajar en este repo. |
| OS | Sistema agentico de este proyecto | Alias corto de SA; no significa sistema operativo cuando se use en contexto agentico del repo. |
| Frontera AOS/OMP | AOS conserva contexto durable y gates locales; OMP gobierna la ejecución agentic. | La capa local no prescribe defaults runtime. |
| AOS local | Capa agentic durable de Copicu. | Contiene docs, índices, memoria, topics, tracks, specs, skills y gates locales. |
| Manager-only | Piezas del upstream que no viajan a Copicu. | Registry global, decisiones/tracks/memoria del kit, inventarios y docs meta. |
| CQ | CopyQ | Referencia funcional principal; baseline, no objetivo de compatibilidad total. |
| CC | copycu | Alias corto pedido para el producto/proyecto. El resto de docs todavia usa `Copicu`; reconciliar el nombre cuando se formalice la marca. |
| Context Bloat | Contaminacion de contexto: cuando reglas, working memory, topics o tracks crecen hasta volverse lectura obligatoria amplia. |
| Context Index | `docs/.generated/context-index.md`, cache generado de topics, tracks, specs y aliases. |
| Local Skill | Skill local portable versionada dentro del repo. |
| Skills Canonicas | Carpeta `docs/skills/`, fuente de verdad de las skills locales. |
| Skills Compat | Carpeta `.agents/skills`, junction de compatibilidad hacia `docs/skills/`. |
| Realinear OS | Comando para auditar y reparar drift de la capa agentica siguiendo `docs/topics/agentic-os-operations.md`. |

## Regla De Uso

- Si aparece un alias nuevo en conversaciones, specs o docs estables, agregarlo aca.
- Si un alias cambia de significado, actualizar esta tabla y revisar referencias en docs.
- Evitar aliases ambiguos cuando puedan confundirse con nombres de APIs, comandos o tipos de contenido.
