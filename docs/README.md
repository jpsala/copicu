# Documentación de Copicu

Contexto local versionado, recuperable por intención. Leer primero «Distinciones imprescindibles» del [glosario local](topics/glossary.md). No hay lectura obligatoria de memoria global ni dependencia de un consultor para trabajar.

## Recuperación selectiva

1. Elegir entre `tracks/` (trabajo y siguiente paso) y `topics/` (contratos, decisiones y razones reutilizables). Buscar nombres o metadata con `rg -n` en esas carpetas sin abrir todo el catálogo.
2. Abrir sólo el archivo pertinente; en uno largo consultar encabezados y secciones necesarias. Seguir referencias a specs, código o documentos profundos únicamente según el pedido.
3. En un track leer estado, siguiente paso, pendientes y evidencia; ante una decisión durable, actualizar el topic pertinente sin duplicar estado. Un track nuevo usa metadata OS2 (`title`, `status: active|paused|closed`, `summary`, `last_worked`, `next` salvo cerrado, `topics` opcional). Ver [adopción OS2](tracks/os2-adoption.md) para ejemplo y límites.

La consulta manual funciona sin Bun ni un consultor. El CLI local opcional `scripts/knowledge.ts` usa Bun existente sin dependencias nuevas ni otro checkout. Topics usan metadata OS2: `title`, `summary` y `keywords` (lista no vacía); referencias en el cuerpo, seguidas sólo por necesidad. Metadata no acepta propuestas `draft` ni certifica producto.

```sh
bun run knowledge -- search "clipboard"
bun run knowledge -- tracks active
bun run knowledge -- topics
bun run knowledge -- last
bun run knowledge -- check
```

Consultas read-only por metadata, sin cuerpo, índice, scoring o selección automática. Todos aceptan `--json`; errores visibles con código 1 y uso inválido con 2. `last` sólo ordena UTC acreditadas. Sin Bun, usar Markdown/`rg`; no instalar por leer.

Los tracks importados usan metadata OS2 y conservan `id/status/updated` y otros campos originales como procedencia en el cuerpo. JP aprobó `last_worked: null` para trabajo histórico sin UTC acreditada: conserva evidencia y fecha de día, no significa ausencia de trabajo ni autoriza convertirla a medianoche. Estados y siguientes pasos se justifican caso a caso; importar no hace que todos parezcan recién trabajados. Consultar la [convención de tracks](tracks/README.md).

El parser/router AOS y aliases `context`/`context:audit` fueron retirados, no mantienen compatibilidad dual. `bun run docs:check` valida catálogo, glosario/entrada desde AGENTS, rutas relativas simples y canon/YAML de skills, con avisos de tamaño y specs. No exige Working Memory, OMP/Pi o discovery; si `.agents/skills` existe, comprueba su destino sin repararlo. `bun run check` / `check:ci` agregan `docs:test` con fixtures temporales; para sólo consulta de metadata usar `knowledge -- check`, sin fixtures. Razones y límites en [sistema de conocimiento](topics/docs-knowledge-system.md).

Metadata/enlaces/whitespace válidos no certifican vigencia, aceptación humana, discovery del harness ni producto.

## Destinos

- `tracks/`: trabajos retomables e históricos con metadata OS2 y procedencia de importación; [adopción OS2](tracks/os2-adoption.md) recoge comprobaciones locales y pendientes de aceptación/discovery.
- `topics/`: conocimiento de producto, arquitectura, incertidumbres y decisiones con razones, recuperable por metadata y secciones.
- [Decisiones anteriores](DECISIONS.md) y [preguntas anteriores](OPEN_QUESTIONS.md): compatibilidad histórica con rutas temáticas; originales íntegros en `reference/os2-legacy/`, no registros globales activos ni nuevos backlogs.
- `PROJECT.md`, `DEVELOPMENT.md`, specs y documentos raíz: contexto profundo bajo demanda, no lectura inicial.
- `user/README.md` y `user/scripts.md`: guías de producto; `../README.md`: entrada pública.
- `skills/`: skills locales portables; `.agents/skills` es compatibilidad técnica, no núcleo OS2.
- `WORKING_MEMORY.md`: stub para enlaces anteriores; fuentes originales intactas en el [archivo histórico](reference/os2-legacy/README.md), sin autoridad operativa. No mantener estado nuevo allí.
- [Reglas del asistente](ASSISTANT_RULES.md), [guía humana](USER_GUIDE.md), [playbook](OS_PLAYBOOK.md) y [convención de tracks](tracks/README.md): continuidad OS2 local y gates preservados, bajo demanda. No exigen OMP, memoria global ni un audit legacy.
- [Sistema de conocimiento](topics/docs-knowledge-system.md), [realinear](topics/agentic-os-operations.md), [calidad](topics/os-quality.md) y [skills](topics/local-codex-skills.md): procedimientos documentales vigentes, sin gobernar el harness.
- [OMP opcional](topics/omp-agentic-os.md) y [seguridad de tools](topics/agent-tool-routing.md): detalles de runtime separados del núcleo, con gates UI/AX/C0 preservados. Recursos opt-in `.omp/commands/` usan las fuentes actuales, sin foco global ni tools obligatorias; sólo un pedido actual autoriza sus efectos. Leerlos o migrarlos no instala ni ejecuta comandos.

## Seguridad y límites

Rigen `../AGENTS.md` y los contratos locales de producto, datos, clipboard, Tauri, instalación y privacidad. Una autorización histórica relatada en un track no habilita publicar, instalar, enviar ni operar hoy. Separar documentación OS2 del runtime operativo OMP/Pi: ninguno es requisito para recuperar estos archivos. No usar comandos retirados como validación ni ejecutar producto como check documental. El job de docs en CI es separado y no reemplaza el gate estricto de chunks de release.
