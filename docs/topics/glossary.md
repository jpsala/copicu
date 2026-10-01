---
title: Glosario local de Copicu
summary: Vocabulario del producto y referencias a convenciones compartidas de JP, separado de antecedentes AOS y del harness.
keywords:
  - glosario
  - aliases
  - OS2
  - sistema agéntico
  - Copicu
  - CopyQ
---

# Glosario de Copicu

## Distinciones imprescindibles

- Para los referentes transversales de JP (OS2, sistema agéntico, OS histórico y harness), consultar el [glosario canónico de OS2](C:/dev/os2/docs/topics/glossary.md#distinciones-imprescindibles). No redefinirlos desde el vocabulario legacy local. Si la fuente falta, declarar el límite.
- Copicu es el producto clipboard manager; sus Actions, scripting y assistant son capacidades del producto. Sus contratos están en [Actions](actions-and-scripting-api.md) y [assistant](ai-search-and-actions.md). La adopción documental no modifica ese runtime.
- CopyQ es referencia funcional: Copicu es CopyQ-inspired, sin promesa de compatibilidad o paridad completa.

## Aliases locales y referencias

| Término | Uso local |
| --- | --- |
| CQ | CopyQ, baseline funcional. |
| CC / copycu | Alias corto registrado por JP; el repo mantiene Copicu hasta formalizar la marca. |
| Local Skill / Skills canónicas | Procedimientos portables de producto en docs/skills; ver [skills locales](local-codex-skills.md). |
| Skills Compat | Discovery opcional en .agents/skills, sin otra fuente canónica ni requisito para recuperar Markdown. |
| Context Bloat | Crecimiento que fuerza lectura amplia; recuperar por intención y secciones. |
| Context Catalog | Consultor AOS histórico retirado; la consulta vigente es knowledge, sin foco global. |
| Manager-only | Inventarios, registros y estado global del kit anterior que no pertenecen a este producto. |
| Realinear OS | Pedido cuyo referente se resuelve con el glosario compartido y alcance actual; la [guía local](agentic-os-operations.md) sólo cubre Copicu cuando ése es el destino autorizado. |

## Procedencia y mantenimiento

Consolidado desde [docs/GLOSSARY.md histórico](../reference/os2-legacy/GLOSSARY.md), conservado íntegro. Allí SA/OS nombraban el sistema local AOS; son usos históricos, no redefiniciones vigentes de los referentes compartidos. AOS/OMP y sus modelos o permisos relatados son antecedentes; no se importan al harness actual.

Las confusiones de dominio se corrigen aquí con origen y certeza; las convenciones transversales permanecen en OS2. No mantener un segundo glosario ni inventar definiciones de producto por analogía.
