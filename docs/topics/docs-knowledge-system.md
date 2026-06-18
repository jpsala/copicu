---
id: docs-knowledge-system
status: active
kind: how-to
triggers:
  - sistema agentico
  - aos
  - documentacion liviana
  - context index
  - working memory
  - track
  - checkpoint
  - persistir estado
  - persistí estado
  - persistir lo valioso
  - cerrar sesion
  - continuar sesion
  - siguiente
  - gol
  - continuar con gol
  - continuar sesion con gol
  - nueva sesion con gol
  - nueva sesion
  - handoff
  - skills locales
  - slash commands
  - docs/skills
  - .agents/skills
  - pi os
  - os-status
  - os-compact
  - os-continuar
  - context bloat
  - contaminacion de contexto
primary_refs:
  - AGENTS.md
  - docs/README.md
  - docs/WORKING_MEMORY.md
  - docs/TOPICS.md
  - docs/GLOSSARY.md
  - docs/skills/
  - docs/topics/agentic-os-operations.md
  - docs/topics/pi-agentic-os.md
  - .pi/extensions/
  - .pi/prompts/
  - scripts/context-index.ts
  - scripts/agent-context-audit.ts
---

# Sistema De Conocimiento Agentico

Este repo usa una version local de Agentic OS (AOS) adaptada a Copicu. La regla principal es leer poco, elegir bien el topic y abrir referencias profundas solo cuando el trabajo lo necesite.

## Ruta Caliente

```text
AGENTS.md -> docs/.generated/context-index.md -> docs/WORKING_MEMORY.md -> docs/TOPICS.md -> topic/track/spec puntual
```

`docs/PROJECT.md`, `docs/ASSISTANT_RULES.md`, `docs/DEVELOPMENT.md`, specs completas y referencias historicas son fuentes profundas, no lectura inicial obligatoria.

## Convenciones Locales

- Los trabajos vivos usan `docs/tracks/`, no `docs/tasks/`.
- `docs/WORKING_MEMORY.md` es router operativo corto, no bitacora.
- `docs/TOPICS.md` indexa puntos de entrada reales; no debe duplicar todo el contenido.
- `docs/GLOSSARY.md` guarda aliases recurrentes.
- `docs/.generated/context-index.md` es cache generado por `bun run context:index`.
- `docs/skills/` es la fuente canonica de skills locales portables; `.agents/skills` es solo compatibilidad tecnica.
- `.pi/` es adapter opcional para Pi: comandos, prompts y nudges; no reemplaza la memoria versionada.
- `scripts/agent-context-audit.ts` debe avisar sobre drift barato de detectar.

## Donde Poner Cada Cosa

| Contenido | Destino |
| --- | --- |
| Regla critica para todos los agentes | `AGENTS.md` |
| Estado vivo corto | `docs/WORKING_MEMORY.md` |
| Indice generado de contexto | `docs/.generated/context-index.md` |
| Decision durable | `docs/DECISIONS.md` |
| Pregunta pendiente | `docs/OPEN_QUESTIONS.md` |
| Conocimiento reusable por tema | `docs/topics/<topic>.md` |
| Trabajo vivo retomable | `docs/tracks/<track>.md` |
| Skill local portable | `docs/skills/<skill>/` |
| Feature grande | `specs/<feature>/` |
| Contexto historico grande | `docs/reference/` o track archivada |

## Cuando Se Descubre Algo

1. Regla critica para todos los agentes: promover a `AGENTS.md`.
2. Estado vivo o proximo paso: actualizar `docs/WORKING_MEMORY.md`.
3. Conocimiento reusable: guardar en `docs/topics/<topic>.md`.
4. Decision durable: registrar en `docs/DECISIONS.md`.
5. Trabajo retomable: actualizar `docs/tracks/`.
6. Contexto historico grande: mover a `docs/reference/`.

## Gol Y Memoria

`gol` no es memoria durable del sistema agentico. En estos flujos solo aparece como instruccion para que una sesion nueva arranque el proximo lote con control de ejecucion.

La memoria automatica de Pi, como `pi-observational-memory`, es ayuda de continuidad entre compacciones y sesiones largas. No es fuente de verdad del proyecto. Si una observacion automatica contradice `AGENTS.md`, `docs/WORKING_MEMORY.md`, topics, tracks, specs o decisiones versionadas, prevalece la documentacion del repo. Cuando una observacion resulte durable, promoverla al destino correcto en esta capa agentica.

Si durante ese lote aparece conocimiento durable, promoverlo al destino correcto: decision, topic, working memory, track o spec.

`continuar sesion con gol` hace `continuar sesion` y ademas pide que el thread nuevo arranque con `gol` para el proximo lote acordado.

`continuar con gol` es alias de `continuar sesion con gol`; no existe una variante que siga en la misma sesion.

`siguiente` es alias de `continuar sesion con gol`.

`sigamos` continua el trabajo activo en la misma sesion. No hace cierre de valor ni prepara handoff.

## Checkpoint De Valor

`checkpoint` / `persistí estado` persiste valor durable sin cortar la sesion actual.

Usarlo cuando el contexto empieza a crecer, antes de una compactacion manual, despues de decidir algo importante o antes de una tarea grande. A diferencia de `cerrar sesion`, no prepara handoff, no abre thread nuevo, no pide `gol` y no ejecuta `/compact` salvo pedido explicito.

Flujo:

1. extraer solo decisiones, estado vivo, archivos/cambios relevantes, checks, riesgos y proximo paso;
2. descartar transcript, intentos triviales, razonamiento intermedio y logs largos;
3. rutear cada memoria a `AGENTS.md`, `docs/WORKING_MEMORY.md`, topic, track, spec o decision segun corresponda;
4. regenerar `docs/.generated/context-index.md` si cambian topics, tracks, specs, skills, aliases o prompts documentados;
5. correr `bun run context:audit` si se toco la capa agentica o hay riesgo de drift;
6. responder con sintesis compacta y seguir en la misma sesion.

Si no hay valor durable nuevo, no tocar docs por tocar: decir que no habia checkpoint necesario y seguir.

Hay una extension Pi local en `.pi/extensions/checkpoint-nudge.ts` que no ejecuta checkpoints automaticamente: solo avisa por uso de contexto en 70%, 85% y 92%, mantiene status de footer, etiqueta checkpoints en `/tree` y ofrece `/checkpoint-nudge prefill|mute|unmute|test`.

Para comandos Pi adicionales (`/os-status`, `/os-compact`, `/os-continuar`) abrir `docs/topics/pi-agentic-os.md`.

## Cierre Y Continuacion De Sesion

`cerrar sesion`, `continuar sesion`, `continuar sesion con gol`, `continuar con gol` y `siguiente` comparten un mismo cierre de valor:

1. extraer decisiones, cambios, checks, bloqueos, riesgos y proximo paso;
2. descartar transcript, intentos triviales, razonamiento intermedio y logs largos;
3. rutear cada memoria a su fuente correcta;
4. regenerar `docs/.generated/context-index.md`;
5. correr `bun run context:audit` cuando se toque esta capa agentica o haya riesgo de drift;
6. responder con sintesis compacta.

La diferencia:

- `cerrar sesion`: solo persiste valor y cierra.
- `continuar sesion`: persiste valor y abre una sesion visible nueva con handoff compacto cuando la herramienta de la plataforma existe; si no existe, devuelve un prompt pegable.
- `continuar sesion con gol`: persiste valor, abre una sesion visible nueva y pide arrancar con `gol` para el proximo lote acordado.
- `continuar con gol`: alias de `continuar sesion con gol`.
- `siguiente`: alias de `continuar sesion con gol`.

Regla clave: el handoff no es fuente de verdad. Debe apuntar a los docs actualizados y contener solo lo necesario para arrancar.

Formato recomendado:

```text
Continuar en <repo>. Leer primero <ruta liviana>.
Estado actual:
Fuentes actualizadas:
Decisiones tomadas:
Checks:
Worktree / riesgos:
No hacer:
Objetivo de la nueva sesion:
Primer paso:
```

## Mantenimiento

- No duplicar specs enteras en working memory.
- No guardar transcripts largos.
- No convertir `AGENTS.md`, `WORKING_MEMORY.md`, `TOPICS.md` ni tracks activas en lectura obligatoria amplia.
- Si un documento crece porque acumula historia, separar: estado vivo corto, decision durable, topic reusable, track retomable o archivo historico.
- La ruta caliente debe seguir siendo pequena: indice generado, working memory corta, router y solo el topic/track necesario.
- Si una track descubre algo durable, promoverlo a docs raiz, topic, decision o spec.
- Si aparece un documento suelto, integrarlo, indexarlo, archivarlo con estado claro o preguntar antes de borrarlo.

## Auditoria

Si JP pide `realinear os`, abrir `docs/topics/agentic-os-operations.md` y limitar el cambio a la capa agentica salvo pedido explicito.
