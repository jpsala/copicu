# Guía Del Sistema Documental De Copicu

Guía humana para continuar trabajo con agentes mediante OS2. No es la guía de uso del clipboard manager: para el producto, ver [docs de usuario](user/README.md).

## Frontera

Copicu conserva autoridad sobre producto, dominio, datos, seguridad y efectos externos. OS2 organiza conocimiento y trabajo retomable; no instala ni requiere OMP, Pi u otro runtime, ni gobierna modelos, effort, tools, browser, planificación o agentes.

La capacidad de una herramienta no otorga permiso. Instalaciones, commit, push, publicación, deploy, producción, credenciales, datos privados, acciones destructivas y envíos externos requieren autorización explícita y actual de JP. Una autorización histórica en docs o tracks no vale para un pedido nuevo. Rigen [AGENTS.md](../AGENTS.md) y [las reglas del asistente](ASSISTANT_RULES.md).

## Retomar Y Conservar Conocimiento

1. Buscar el trabajo por intención en nombres o metadata de `docs/tracks/`; para una consulta de conocimiento, buscar en `docs/topics/`. Usar búsquedas acotadas, no abrir todo el catálogo. El [mapa](README.md) ayuda si no está claro el destino.
2. Abrir sólo el track o topic pertinente y las secciones necesarias. En el track, retomar desde objetivo, estado, próximo paso, pendientes y evidencia; no desde una memoria global ni la fecha de modificación del archivo.
3. Durante el trabajo, actualizar el track si cambia el estado y el topic cuando aparece una regla o decisión reusable con sus razones. No duplicar conversación, logs ni un resumen global de foco.
4. Al cerrar el corte, dejar el siguiente paso y la evidencia útil en su fuente. Distinguir comprobación propia de resultados heredados; no declarar producto ni continuidad humana validados por checks documentales.

## Destinos

- `docs/tracks/`: objetivo, estado, pendientes y evidencia de trabajos retomables. [Convención](tracks/README.md).
- `docs/topics/`: conocimiento reusable, decisiones con razones e incertidumbres del tema.
- `AGENTS.md`: reglas críticas y entrada liviana, no un paquete de contexto amplio.
- `specs/`: features grandes; consultar según el pedido.
- `docs/skills/`: procedimientos portables. Discovery del harness es compatibilidad opcional, no otro núcleo ni autorización adicional.
- `docs/WORKING_MEMORY.md`: stub histórico; el original está archivado, no se mantiene foco nuevo allí.
- `docs/DECISIONS.md` y `docs/OPEN_QUESTIONS.md`: compatibilidad histórica con rutas temáticas y originales íntegros archivados, no destinos globales nuevos. Preguntas de ejecución al track; incertidumbres de conocimiento al topic.

## Herramientas Heredadas Y Dogfood

La lectura manual de Markdown funciona sin Bun. El consultor local opcional `bun run knowledge -- search "intención"` devuelve candidatos por metadata; `tracks`, `topics`, `last` y `check` también aceptan `--json`. No incorpora cuerpo al resultado ni selecciona una ruta por scoring, genera índices o depende de otro checkout. Sin Bun no instalar para consultar.

AOS/context fue retirado. `bun run docs:check` mantiene comprobaciones documentales; `check`/`check:ci` agregan tests de tooling con fixtures temporales, sin UI, producto o reparación de discovery. `npm run skills:status` sigue como consulta opcional de compatibilidad, no criterio obligatorio OS2.

`realinear os` es una intención conversacional documentada en [operaciones](topics/agentic-os-operations.md), no prueba de un comando slash instalado ni requisito para retomar. No importa defaults ni autoriza instalar, reparar junctions o corregir fuera del pedido.

El binding OMP `computer` es opcional y externo al runtime del producto. Si se usa para dogfood autorizado, mantener aviso previo a UI visible, inspección `read_only`, aprobación para input, datos sintéticos y el oracle C0 de foco real. Procedimiento y límites en el [playbook](OS_PLAYBOOK.md#computer-para-dogfood); esta migración no inicia la app ni valida ese binding.

## Comprobación Y Transición

Comprobar metadata aplicable y enlaces de lo cambiado; `git diff --check` sólo revisa whitespace. No ejecutar UI, instalar, publicar ni correr audits legacy como verificación documental automática. Registrar alcance y límites en el track del trabajo.

La [adopción OS2](tracks/os2-adoption.md) registra la integración local y conserva pendiente la aceptación humana desde sesión nueva. Tooling AOS fue reemplazado por la única ruta local de metadata y checks independientes del harness. Los tracks importados ya usan metadata OS2, con `null` y procedencia para la UTC histórica desconocida. Leer o probar un documento no completa la adopción ni acredita aceptación humana.
