# Skills Locales

`docs/skills/` es la única fuente canónica portable. Skills no amplían permisos ni requieren OMP, Pi o una junction para recuperar conocimiento OS2.

## Regla

- No duplicar una skill en dos carpetas reales; editar `docs/skills/<nombre>/`.
- Promover sólo procedimientos repetibles útiles, no cada topic, intención o capacidad de un harness.
- Conocimiento y decisiones con razones al topic pertinente; estado del trabajo al track. No mantener Working Memory, decisiones globales ni un índice paralelo.
- `.agents/skills` es compatibilidad opcional de discovery. Su presencia/tipo se comprueban antes de operarla; no se crea ni repara al validar docs.

## Validación

Revisar metadata, referencias, procedimiento y gates de lo cambiado. Un validador externo, como el `quick_validate.py` histórico de `agent-infra`, sólo se usa si está disponible y autorizado. Si falta, registrar el límite, no instalar herramientas ni editar otro repo.

`bun run docs:check` valida YAML/tipos/rutas y canon local; `check` añade regresiones con fixtures temporales. El tooling AOS fue retirado. No se habilita discovery ni se valida el comportamiento real de una skill en el harness por esas comprobaciones.

## Compatibilidad Operativa

- `scripts/toggle-skills-link.ps1 status` consulta discovery. Los scripts `ensure-skills-link.ps1` y los modos `on`/reparación pueden modificar junctions, crear backups y fusionar carpetas; no ejecutarlos como lectura, audit documental ni paso automático después de mover el repo.
- Ante reparación autorizada, comprobar repo, destino y WIP; preservar carpetas reales y revisar efectos antes de actuar. No borrar una junction por limpiar la paleta: algunos hosts cachean paths.
- `off`/`toggle` se documentaron como aliases legacy no destructivos; comprobar el script vigente antes de operar, no inferir comportamiento del nombre.
- Generar metadata UI como `agents/openai.yaml` sólo para un host que la requiera y dentro del pedido, no como dependencia del núcleo.

## Portar A Otro Repo

Sólo con alcance explícito para ese destino y una necesidad real. Adaptar o fusionar capacidades pertinentes, no copiar el catálogo entero ni permisos históricos. No copiar `.agents/skills` como carpeta canónica ni ejecutar scripts de reparación por la mera portación.

[Rubrica y capacidades](../topics/local-codex-skills.md), [realinear](../topics/agentic-os-operations.md) y [seguridad local](../../AGENTS.md).
