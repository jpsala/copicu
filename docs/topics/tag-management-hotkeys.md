---
id: tag-management-hotkeys
status: draft
kind: decision-map
triggers:
  - tags
  - tag hotkey
  - tag shortcut
  - pantalla de tags
  - colecciones
primary_refs:
  - filtering-and-query-syntax.md
  - global-shortcut-and-tray.md
  - ui-surface-architecture.md
  - ../../specs/006-tags-and-hotkeys/spec.md
  - ../active-work/012-tags-and-hotkeys.md
---

# Tag Management And Hotkeys

Topic para tags como metadata y para la decision historica sobre shortcuts filtrados. La direccion vigente es que los hotkeys filtrados vivan en scripts, no en Settings > Tags.

## Necesidad

JP quiere abrir Copicu ya filtrado por tags o queries desde hotkeys. La decision actual es no modelar eso como configuracion propia de cada tag en Settings, sino como scripts `globalShortcut` que llaman un comando host parametrizable.

Esto se entiende como:

```text
App externa con foco
  -> hotkey de script
  -> Copicu recuerda ventana previa
  -> abre picker
  -> aplica filtro tag:<tag> u otra query
  -> usuario navega y Enter/Shift+Enter usa comportamiento normal
```

No debe pegar automaticamente al pulsar el hotkey filtrado. El hotkey selecciona el contexto de busqueda; la activacion del item sigue siendo explicita.

## Decision Vigente 2026-06-09

Sacar de Settings toda la funcionalidad de hotkeys por tag.

Settings > Tags queda para:

- listar tags y conteos;
- crear tags;
- pin/unpin;
- abrir manualmente `tag:<slug>` con `Open filtered`;
- futuro rename/merge/delete/chips/autocomplete.

Scripts quedan para:

- declarar hotkeys simples o compuestas;
- abrir el picker con `copicu.commands.run("picker.open", params)`;
- combinar tags con otros filtros (`kind:`, `is:marked`, texto libre, etc.);
- tener wrappers chicos por hotkey sin duplicar implementacion.

No mantener dos fuentes de verdad para shortcuts filtrados. Si existe `tag_configs.hotkey` en la DB por compatibilidad historica, no debe usarse para registrar hotkeys nativos despues del siguiente corte.

## Estado Actual

- Los items todavia mantienen `clipboard_items.tags` como `TEXT` de compatibilidad temporal.
- La busqueda soporta `tag:name` y `#name`; desde el primer slice consulta relaciones normalizadas con fallback al string legacy.
- Los tags existen como entidad normalizada en `tags`, con relaciones `clipboard_item_tags` y config `tag_configs`.
- Settings tiene una seccion `Tags` con resumen, lista/counts, create tag, pin y `Open filtered`.
- La UI de hotkeys por tag con `HotkeyRecorder` fue eliminada. Settings > Tags no edita, valida ni muestra estado de hotkeys.
- `tag_configs.hotkey` queda como compatibilidad historica de DB, pero `list_tags` ya no lo expone y el runtime no lo registra.
- La UI permite editar metadata/tags por item y batch con el campo legacy; falta migrarla a chips/autocomplete usando `set_item_tags`.
- El backend registra global shortcuts para:
  - abrir picker (`general.globalShortcut`);
  - scripts con trigger `globalShortcut`.
- Los wrappers de filtros/hotkeys viven en `scripts/examples/020-open-tag-filtered.ts` a `024-open-prompt-filtered.ts` y deben copiarse a `Documents/Copicu/Scripts` para dogfood.
- Cierre de validacion: los wrappers ya fueron copiados a `Documents/Copicu/Scripts`; Settings > Tags fue verificado sin recorder/status; `examples.openTagFiltered` abre `tag:context` via `commands.run("picker.open", ...)` sin activar ni pegar items. Para validar hotkeys globales fisicos, usar Computer Use/tecla fisica; las inyecciones sinteticas no siempre disparan el hook global de Tauri.

## Implementacion Primer Slice 2026-06-08

Comandos disponibles:

```ts
list_tags(): TagSummary[]
create_tag({ label, color? }): TagSummary
update_tag_config({ tagId, label?, color?, pinned?, sortOrder?, hotkey?, autoApplyEnabled? }): TagSummary
set_item_tags({ itemId, tags }): void
```

Notas:

- `hotkey` se acepta solo como compatibilidad historica en `UpdateTagConfigRequest`; no se devuelve en `TagSummary`, no se muestra en Settings y no se registra globalmente.
- `autoApplyEnabled` existe como extension point, pero Settings muestra smart tagging Off/disabled.
- `set_item_tags` sincroniza `clipboard_items.tags` para compatibilidad con UI/scripts existentes.
- No se loguea payload de items; tests usan tags/textos sinteticos.
- Computer Use valido regrabar la misma tecla sin `UNIQUE constraint failed` y guardar una compuesta real (`Ctrl+Shift+I, A`) en Settings Tags.

## Research UX 2026-06-08

Fuentes revisadas:

- Bear usa `#` como trigger de autocomplete dentro de notas y tambien un boton `#`; muestra tags existentes, permite filtrar escribiendo mas letras y seleccionar con flechas/Return. Sus docs enfatizan que esto evita typos de tags.
- Bear permite multi-word tags envolviendolos en `#tag con espacios#`, nested tags y renombrar/borrar desde sidebar.
- Obsidian reconoce tags con `#`, soporta nested tags con `/`, muestra tags anidados en su Tags view y `tag:inbox` matchea tambien subtags como `#inbox/to-read`.
- En Obsidian hay plugins populares para autocompletar tags en YAML/frontmatter porque el trigger `#` no encaja bien en campos de metadata donde el valor guardado no debe llevar `#`.
- Notion modela tags como propiedad `Multi-select`: elegir una o mas opciones de una lista, con colores y creacion de opciones desde el control.
- Raindrop.io usa un campo `Tags` separado, tags separados por coma, permite espacios/cualquier idioma, AI suggestions opcionales, filtro clickeable por tag y operaciones globales de rename/merge/delete.
- Feedback de usuarios en Bear/Raindrop/Obsidian muestra que autocomplete incompleto, sin search o que prioriza mal sugerencias se vuelve frustrante, sobre todo con muchos tags o nested tags.

Conclusion para Copicu:

- No parsear `#` del contenido capturado como tags por defecto. En Copicu tags son metadata explicita.
- En campos de metadata, `#` debe ser un trigger ergonomico, no parte obligatoria del valor persistido.
- El control principal para tags debe ser tokenized/multi-select con autocomplete y creacion inline.
- Soportar teclado completo: `#` o focus del campo abre sugerencias; letras filtran; `Enter` selecciona/crea; `Tab` completa; `Backspace` borra chip vacio; `Esc` cierra.
- Sugerir primero exact/prefix matches, despues recent/frequent, y dejar "Create tag" visualmente separado.
- Mantener una pantalla de tags para management global: conteos, hotkeys, rename, merge, delete, conflicts.
- Evitar nested tags en el primer corte salvo permitir `/` en slug. Si se soportan, `tag:work` deberia matchear `work/client` igual que Obsidian, pero eso requiere decision explicita.

## Modelo Recomendado

Decision 2026-06-08: los tags pasan a ser modelo normalizado. El string actual `clipboard_items.tags` queda como compatibilidad temporal, no como fuente durable final.

Modelo objetivo:

```text
tags(id, slug, label, color, pinned, sort_order, created_at_unix_ms, updated_at_unix_ms)
clipboard_item_tags(item_id, tag_id, created_at_unix_ms, source, confidence)
tag_configs(id, tag_id, hotkey, auto_apply_enabled, created_at_unix_ms, updated_at_unix_ms)
```

Reglas:

- `slug` es estable y se usa para query syntax (`tag:work`).
- `label` es editable/display.
- `source` arranca con `manual`, `ai` y `rule`.
- `confidence` queda disponible para smart tagging.
- No inferir tags desde texto capturado con `#`; solo metadata explicita o acciones de enrichment.

El primer corte debe migrar tags existentes desde `clipboard_items.tags` hacia `tags` + `clipboard_item_tags`, y mantener fallback hasta que UI/API/search dejen de depender del string viejo.

Agregar una entidad de configuracion por tag sin romper el campo actual:

```text
tag_configs
  id INTEGER PRIMARY KEY
  slug TEXT NOT NULL UNIQUE
  label TEXT NOT NULL
  color TEXT NULL
  hotkey TEXT NULL UNIQUE
  pinned INTEGER NOT NULL DEFAULT 0
  sort_order INTEGER NULL
  created_at_unix_ms INTEGER NOT NULL
  updated_at_unix_ms INTEGER NOT NULL
```

El primer corte puede derivar tags existentes escaneando `clipboard_items.tags`, y guardar configuracion solo para tags que tengan overrides. Mas adelante, si hace falta integridad fuerte, se puede normalizar a `tags` + `item_tags`.

## Pantalla De Tags

Decision 2026-06-08: el primer corte vive como seccion `Tags` dentro de Settings. No crear ventana nueva todavia.

Debe ser una ventana task-oriented o seccion clara de Settings, no un overlay dentro del picker. Primera opcion recomendada: ventana standalone `tags` o seccion Settings si se quiere reducir superficie inicial.

Contenido util para la primera pantalla:

- lista searchable de tags;
- cantidad de items por tag;
- hotkey por tag con recorder/campo validado;
- indicador de conflictos: picker shortcut, scripts globales, otros tags, shortcut invalido o no registrable;
- color o swatch opcional para reconocimiento visual;
- pin/favorite para tags frecuentes;
- acciones rapidas:
  - abrir picker filtrado por tag;
  - limpiar hotkey;
  - renombrar tag;
  - merge tags;
  - borrar tag de todos los items, con confirmacion;
  - copiar query `tag:<tag>`.

Para el primer slice, priorizar lista, conteo, hotkey y "Open filtered".

Subseccion `Auto tagging` en Settings:

- Off por defecto.
- Modo `suggest-only` vs `auto-apply`.
- Trigger `on clipboard capture`.
- Scope por kind: texto primero; URL/codigo si se puede detectar; imagen queda futuro.
- Modelo/agente usando settings AI existentes.
- Prompt editable o perfil predefinido.
- Tags permitidos o permiso explicito para crear tags nuevos.
- Guardrails: ignored apps, contenido grande, posible secreto/password/token, contenido privado.

Auto-tagging debe correr async despues de persistir el item. Nunca debe bloquear el copy ni modificar el clipboard.

## Autocomplete De Metadata

Decision 2026-06-08: el editor de metadata debe migrar a tags como chips/autocomplete.

Comportamiento:

- al enfocar el campo tags, mostrar sugerencias si hay texto o si el usuario pulsa `#`;
- `#` es trigger de UI, no parte obligatoria del valor persistido;
- typing filtra por exact/prefix/recent/frequent/contains;
- `Enter` selecciona sugerencia o crea tag si no existe;
- `Tab` completa;
- `Backspace` borra chip cuando el input esta vacio;
- `Esc` cierra sugerencias;
- "Create tag" debe estar separado visualmente de tags existentes para evitar typos.

No extraer tags automaticamente del contenido del clipboard por tener `#`.

## Backend

Comandos candidatos:

```ts
list_tags(): TagSummary[]
create_tag(request): TagSummary
update_tag_config(request): TagSummary
set_item_tags(request): void
suggest_tags(request): TagSuggestion[]
open_picker_for_tag(tagSlug: string): void
```

`open_picker_for_tag` debe:

1. recordar ventana previa excluyendo Copicu;
2. mostrar/focus del picker;
3. emitir evento frontend para aplicar query `tag:<slug>`;
4. no copiar ni pegar.

El evento puede ser equivalente conceptual a:

```ts
{ type: "picker.filter", query: "tag:work" }
```

pero debe funcionar desde Rust/global shortcut, no solo como efecto de script ya ejecutado.

## Global Shortcuts Via Scripts

Los hotkeys filtrados deben declararse como scripts. Esto reutiliza el registry de scripts existente y evita mantener una segunda UI/tabla de conflictos en Settings > Tags.

Prioridad efectiva:

1. picker open shortcut reservado;
2. script global shortcuts;
3. unmapped shortcut.

Conflictos a reportar siguen viviendo en diagnostics de scripts:

- script vs script;
- script vs picker shortcut reservado;
- shortcut invalido;
- shortcut ya ocupado por otra app si el plugin falla al registrar.

Patron recomendado:

```ts
export default defineAction({
  id: "jp.openContextTag",
  title: "Open #context",
  shortcut: "Ctrl+Alt+Shift+T",
  triggers: ["globalShortcut", "commandPalette"],
  input: { source: "none", selection: "none" },
  capabilities: ["commands:run", "picker:open", "log:write"],
  async run() {
    await copicu.commands.run("picker.open", {
      query: "tag:context",
      rememberPrevious: true,
      focus: "search",
    });
  },
});
```

Decision 2026-06-08: no reemplazar `Ctrl+C` con un global shortcut interceptado por Copicu. Eso puede romper copy normal de Windows y de apps. El flujo default queda:

```text
usuario copia normal
  -> watcher captura
  -> Copicu persiste
  -> enrichment/tagger corre async si esta habilitado
```

Si se quiere un "copy inteligente", debe ser un comando separado con hotkey no destructivo, por ejemplo `Ctrl+Shift+C` o una secuencia compuesta. Ese comando puede iniciar copy, esperar captura y luego correr tagging/enrichment, pero no es el primer corte.

## Smart Tagging / Enrichment

Decision 2026-06-08: smart tagging debe modelarse como un comando/action interno, no como logica ad hoc del watcher.

Concepto:

```text
Command/Action
  id: builtin.smartTagClipboardItem
  trigger: clipboardChange
  input: capturedItem
  capabilities: history:read-content, history:write-tags, ai:classify
  enabled: false by default
```

Pipeline recomendado:

```text
clipboard captured
  -> persist item
  -> enqueue enrichment jobs
  -> smart tagger runs async
  -> applies tags through normalized tag API
  -> UI refresh/notify quietly
```

Reglas:

- Off por defecto.
- No bloquear captura/copy esperando al modelo.
- `suggest-only` antes de `auto-apply` si hay dudas.
- No mandar imagenes, archivos grandes ni contenido de apps ignoradas en el primer corte.
- No correr sobre contenido que parezca secreto/password/token.
- Logs redacted: ids, kind, length, tags aplicados/sugeridos, confidence; no payload.
- Tags permitidos configurables; opcion separada para crear tags nuevos.
- El modelo/agente debe ser configurable desde Settings usando la configuracion AI existente.

## Query Semantics

Usar `tag:<slug>` para abrir. Si hay espacios o caracteres especiales en el label visible, el slug debe ser estable y simple. Regla inicial:

- guardar `slug` normalizado sin `#`;
- mostrar label humano;
- al filtrar, usar `tag:<slug>`;
- al editar metadata, seguir aceptando `#slug`.

Pregunta abierta: si un item tiene `#Very Important` en notas, el primer corte no debe intentar soportarlo como tag canonical hasta normalizar tags.

## Privacidad

- No loguear contenido de clips.
- Los diagnosticos de tags deben usar slug, conteos y IDs de configuracion, no payload.
- La pantalla puede mostrar conteos y nombres de tags porque son metadata explicita del usuario.

## Evolucion

1. Primer slice: `tags` + `clipboard_item_tags` + `tag_configs` + Settings Tags con list/count/config.
2. Migrar metadata editor a chips/autocomplete y `set_item_tags`.
3. Hotkey/secuencia por tag abre picker filtrado.
4. Renombrar/merge/delete tags con operaciones batch seguras.
5. Smart tagger interno como action/command `clipboardChange`, default off.
6. Copy inteligente opcional con hotkey no destructivo.
7. Saved filters/smart collections como concepto separado de tags manuales.

## Preguntas Abiertas

- Pantalla standalone `tags` vs seccion de Settings en el primer corte.
- Sintaxis final de tags con espacios o caracteres no ASCII.
- Si el tag hotkey debe abrir siempre picker o alternar hide cuando ya esta filtrado por ese tag.
- Si debe existir una accion secundaria tipo hotkey + Enter/Paste automatico para "ultimo item de ese tag".
- Si smart tagging debe empezar en `suggest-only` obligado o permitir `auto-apply` desde el primer corte experimental.
- Si se permite crear tags nuevos desde AI o solo elegir entre allowlist configurada.
