---
id: agentic-os-operations
status: active
kind: how-to
triggers:
  - realinear os
  - auditar sistema agentico
  - reparar sistema agentico
  - drift de contexto
  - actualizar aos
  - sistema agentico
  - aos
  - init os
  - adopt os
  - update os
  - migrar sistema agentico
  - upstream downstream
  - metasistema
  - manager-only
primary_refs:
  - AGENTS.md
  - docs/GLOSSARY.md
  - docs/WORKING_MEMORY.md
  - docs/TOPICS.md
  - docs/.generated/context-index.md
  - docs/skills/
  - docs/tracks/
  - .pi/extensions/
  - .pi/prompts/
  - scripts/toggle-skills-link.ps1
  - scripts/context-index.ts
  - scripts/agent-context-audit.ts
---

# Operaciones Del Sistema Agentico

Usar este topic cuando JP pida auditar, reparar, actualizar o realinear la capa agentica del repo.

## Principio Upstream / Downstream

Copicu es downstream de AOS. `C:\dev\os` es upstream manager: define vision, playbooks y mejoras portables. A Copicu solo viajan piezas locales aplicables: reglas del proyecto, memoria viva local, topics, tracks, scripts, skills y adapters que se usan aca.

No copiar piezas manager-only de AOS: `docs/OS_PROJECTS.md`, working memory/tracks/decisiones del kit canonico, inventarios globales ni docs que declaren a Copicu como upstream. Si algo del upstream sirve, reescribirlo como contexto local de Copicu.

## Intenciones

| Pedido | Accion |
| --- | --- |
| `realinear os` | Auditar y reparar drift de la capa agentica local. |
| `actualizar aos` / `update` | Comparar contra `C:\dev\os` y traer solo mejoras portables/locales sin pisar contexto ni copiar manager-only. |
| `adopt` / migracion | Fusionar reglas y memoria existentes; no resetear con templates genericos. |
| context bloat | Compactar ruta caliente y mover historia a `docs/reference/` o tracks archivadas. |

## Comando `realinear os`

Objetivo: volver a alinear la capa agentica con el proposito real del proyecto sin tocar producto, datos, deploy ni arquitectura de app salvo pedido explicito.

### Lectura Minima

1. `AGENTS.md`.
2. `docs/.generated/context-index.md` si existe.
3. `docs/WORKING_MEMORY.md`.
4. `docs/TOPICS.md`.
5. Track relevante en `docs/tracks/`.
6. `docs/topics/local-codex-skills.md` si el drift involucra skills o slash commands.
7. Este topic.
8. `scripts/agent-context-audit.ts` y `scripts/context-index.ts` si hay que corregir validacion o generacion.

No abrir docs largos, specs completas, rationale, archivos archivados ni referencias profundas salvo que una inconsistencia concreta lo requiera.

### Revisar

- Ruta caliente: `AGENTS.md`, indice generado, `WORKING_MEMORY.md`, `TOPICS.md` y tracks activos siguen chicos y no son transcript.
- Routing: topics relevantes existen, tienen triggers utiles y estan linkeados desde `docs/TOPICS.md`.
- Continuidad: track activo tiene estado, next step y refs que existen.
- Skills: `docs/skills/` existe; `.agents/skills` es toggle de discovery y debe estar disabled en Pi salvo uso explicito.
- Pi: `.pi/prompts/` y `.pi/extensions/` estan documentados en `docs/topics/pi-agentic-os.md` cuando afectan el OS.
- Decisiones: lo durable esta en `docs/DECISIONS.md` o topic estable, no enterrado en tracks.
- Specs: specs activas estan indexadas, no tienen prefijos duplicados y tienen `spec.md`.
- Drift: docs raiz no contradicen la ruta inicial, los comandos reales ni el estado actual del repo.
- Archivos sueltos: notas, drafts, handoffs o contexto viejo tienen destino claro.
- Audit: `scripts/agent-context-audit.ts` detecta la clase de problema encontrada si puede repetirse.

### Corregir Sin Preguntar

- Compactar texto repetido en ruta caliente.
- Actualizar links, triggers, frontmatter y referencias rotas obvias.
- Mover informacion durable desde tracks a topic, decision o doc estable.
- Marcar o archivar trabajos cerrados cuando el estado sea claro.
- Regenerar `docs/.generated/context-index.md`.
- Ajustar el audit para cubrir drift recurrente y barato de validar.

### Preguntar Antes

- Borrar memoria que podria ser util.
- Mover archivos historicos grandes cuando no este claro su destino.
- Cambiar convenciones principales del sistema.
- Tocar codigo producto, specs de feature, datos, deploy o release.
- Reemplazar diferencias locales respecto del upstream `c:\dev\os` sin revisar/mergear.

### Cierre

1. Actualizar `docs/WORKING_MEMORY.md` si cambio estado vivo.
2. Registrar decision durable en `docs/DECISIONS.md` si cambio una regla.
3. Actualizar el track relevante o archivarlo si corresponde.
4. Ejecutar:

```powershell
bun run context:index
bun run context:audit
```

5. Reportar que se realineo, que se corrigio, que quedo pendiente y si el audit paso.

## Actualizar Desde Upstream

1. Leer primero el sistema local y verificar `git status`.
2. Comparar solo la capa agentica local: `AGENTS.md`, docs de contexto, topics base, scripts, `.pi/`, `.agents`, `.specify` y `docs/skills/` si aplica.
3. Preservar memoria local: `docs/WORKING_MEMORY.md`, `docs/DECISIONS.md`, tracks, specs y topics de producto no se pisan; se fusionan si hace falta.
4. Preservar convenciones locales como `docs/tracks/`, reglas de producto, Windows-first, Tauri, clipboard privacy, dev/instalada y release.
5. Traer mejoras portables de scripts, prompts, extensiones, skills o audit cuando no dependan de contexto manager-only del upstream.
6. Si upstream trae politica `minimal-implementation`/Ponytail, propagarla solo como modo liviano subordinado a AOS: no instalar paquetes ni dependencias locales salvo pedido explicito.
7. Omitir piezas manager-only de AOS: registry global, decisiones/tracks/memoria del kit, inventarios personales y docs meta.
8. Reescribir cualquier mejora del upstream como contexto local de Copicu antes de incorporarla.
9. Documentar divergencias locales en `docs/topics/docs-knowledge-system.md` o un topic agentico local.
10. Preservar `docs/skills/` como fuente canonica; usar `scripts/toggle-skills-link.ps1 status|on|off` para discovery bajo demanda.
11. Regenerar indice y correr audit antes de reportar.

## Criterio De Exito

Una sesion nueva puede leer poco, entender que esta activo, abrir el topic correcto, continuar un track y confiar en que el audit detecta el drift que acaba de corregirse.
