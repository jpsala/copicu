---
title: Skills locales portables de Copicu
summary: Canon en docs/skills, criterios de promoción y compatibilidad opcional de discovery sin gobernar el harness.
keywords:
  - skills locales
  - local skills
  - slash commands
  - docs/skills
  - .agents/skills
  - evaluar skills
  - promover a skill
---

# Skills Locales Portables

`docs/skills/` es la fuente canónica de las skills propias de Copicu. `.agents/skills` es compatibilidad opcional de discovery para los hosts que la usen; su existencia y tipo se comprueban antes de operarla. No duplicar una skill en dos carpetas reales ni exigir un junction para leer documentación OS2.

## Qué Es Skill

Una skill justifica su mantenimiento por una acción repetible, estable y útil. El `SKILL.md` conserva metadata, límites y procedimiento corto; detalle durable en un topic o script cuando aporte valor. Reglas críticas al `AGENTS.md`, conocimiento a topics y estado del trabajo a tracks.

No crear skills ceremoniales por cada topic o capacidad del harness, ni asumir que un slash command está instalado porque una guía lo menciona. Una skill no amplía permisos, impone modelos ni gobierna sesión, planning, browser o runtime.

## Capacidades Preservadas

- `evaluar-skills/`: revisar candidatos antes de promoverlos.
- `realinear-os/`: auditar y curar documentación dentro del pedido actual.
- `repo-commit-push/`: commit/push sólo por pedido explícito y actual.
- `speckit-*/`: specs grandes cuando el encargo lo requiera.
- `impeccable/`: trabajo UI pertinente, sin instalar por defecto.

El binding OMP `computer` y `.omp/commands/research.md` son recursos opt-in del harness, no skills ni dependencias OS2. `npm run release:install` mantiene autorización para publicación e instalación; nombrarlo no habilita ejecutarlo. Los taskflows Pi históricos no definen el runtime actual.

## Validación Y Discovery

Editar la skill en su canon y revisar metadata, rutas, procedimiento y gates. `docs:check` conserva validación local de YAML, campos, límites y rutas; `check` añade fixtures. No regenerar índices ni usar comandos AOS retirados. Un validador externo sólo se usa si existe y está autorizado; si falta, declarar el límite, no instalarlo ni tocar otro repo para cumplirlo.

Los scripts existentes `scripts/toggle-skills-link.ps1` y `scripts/ensure-skills-link.ps1` se conservan como compatibilidad legacy. `status` consulta discovery; `on`/`ensure` pueden modificar junctions, fusionar carpetas o crear backups. No ejecutarlos automáticamente al leer, validar docs o portar el repo. Ante reparación autorizada, comprobar destino, WIP y efectos antes de actuar; algunos hosts cachean paths y borrar un junction no es una limpieza segura de paleta.

## Entrada compartida OS2

Los procedimientos transversales no se copian al repo. La entrada compartida usa os2-guardar, os2-handoff, os2-orquestar y os2-modo. En el corte de integración inicial no aparecían; el chat de revisión Git del 2026-10-01 sí recibe las cuatro en su catálogo. Esto acredita exposición en ese chat, sin probar su ejecución, instalación en otros hosts ni aceptación humana. El coordinador conserva la reconciliación externa; no crear aliases Pi simulados ni tocar perfiles/junctions para suplirlas.

Mientras tanto, se puede trabajar manualmente con la [entrada compartida](C:/dev/os2/docs/topics/repository-network.md#entrada-compartida) y [continuidad](C:/dev/os2/docs/topics/session-continuity.md), sin instalar nada.

## Referencias

[Guía de skills](../skills/README.md), [realinear](agentic-os-operations.md), [seguridad de tools](agent-tool-routing.md) y [adopción OS2](../tracks/os2-adoption.md). La migración sólo curó documentación; no comprobó integración real de discovery.
