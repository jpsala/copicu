---
status: complete
updated: 2026-07-25
execution_route: balanced
topic: docs/topics/tag-management-hotkeys.md
related:
  - docs/topics/hotkeys.md
  - docs/topics/whichkey.md
  - docs/topics/compound-hotkeys-and-whichkey.md
archive:
  - docs/reference/012-tags-and-hotkeys-archive-2026-06-14.md
---

# 012 Hotkeys, WhichKey And Tags

Estado vigente: Settings Hotkeys V1 implementado; hotkeys nativos por tag removidos; filtros por tag/query se expresan como scripts. Atajos criticos del picker pueden ser nativos aunque haya scripts historicos con el mismo gesto.

Este archivo es estado vivo retomable. El historial completo previo fue archivado en `docs/reference/012-tags-and-hotkeys-archive-2026-06-14.md` para reducir bloat de contexto.

## Objetivo

Separar y mantener estas piezas sin acoplarlas de mas:

1. hotkeys simples app-owned;
2. runtime de hotkeys compuestos;
3. WhichKey como superficie opcional/observadora;
4. tags como metadata y filtros, no como dueño nativo de hotkeys;
5. scripts/actions como fuente de shortcuts filtrados o automatizaciones.

## Fuentes Primarias

- `docs/topics/hotkeys.md`: motor, parser, registry, rutas y diagnosticos.
- `docs/topics/whichkey.md`: superficie visual WhichKey y comportamiento de reveal.
- `docs/topics/tag-management-hotkeys.md`: tags como consumidor de hotkeys/secuencias.
- `docs/tracks/004-actions-scripting.md`: contrato de scripts cuando se toque `commands.run`, capabilities o discovery.
- `specs/006-tags-and-hotkeys/`: spec historica/feature tasks.

## Decisiones Vigentes

- No reintroducir hotkeys nativos por tag en Settings.
- Settings > Tags conserva metadata: lista, conteos, create tag, pin/unpin y `Open filtered`.
- Shortcuts filtrados por tag/query viven como scripts con `triggers`, `shortcut` y capabilities explicitas.
- Patron recomendado para filtros:

```ts
await copicu.commands.run("picker.open", {
  query: "tag:context",
  rememberPrevious: true,
  focus: "search",
});
```

- El hotkey/secuencia que abre un filtro no copia, no pega y no activa items automaticamente.
- Runtime compuesto mantiene invariantes:
  - registrar globalmente solo el primer paso;
  - no registrar next-step globals temporales;
  - no emitir pending desde Rust hacia `main`;
  - renderer consulta pending con polling liviano y captura el siguiente paso con `keydown`.
- Callbacks nativos/global-shortcut deben retornar rapido; cualquier UI/ventana/plugin debe ir por main thread o primitiva segura.
- Scripts con `shortcut` son read-only desde Settings: se editan en el archivo fuente y luego se refresca cache/diagnosticos.
- `Ctrl+Shift+C` queda reservado y registrado globalmente por Copicu: abre el editor completo de metadata para el item activo del picker, con fallback al primer item visible. No depende del script historico `examples.assignMetadataToActive`.
- Patch preview para shortcuts de scripts queda opcional/futuro; no es pendiente inmediato.

## Implementado

### Runtime Hotkeys/Compuestos

- Parser/normalizador y registry/trie comun en `src-tauri/src/hotkeys.rs`.
- Rutas para picker, scripts, comandos y WhichKey.
- Scripts con trigger `globalShortcut` pueden declarar secuencias compuestas.
- Prefijos compuestos se registran globalmente; el segundo paso se captura en frontend.
- Fix B2 estabilizo el estado post-compuesto quitando temporales globales y emits backend de pending.
- `Ctrl+Alt+C, T` con script dogfood dejo la ventana principal responsive, draggable, con heartbeats y X custom funcional en validacion historica.

### Tags

- Storage normalizado: `tags`, `clipboard_item_tags`, `tag_configs`.
- Comandos Tauri expuestos: `list_tags`, `create_tag`, `update_tag_config`, `set_item_tags`.
- Settings > Tags existe como metadata/listado, sin recorder/status de hotkeys.
- Hotkeys nativos de tags (`ShortcutRoute::TagOpen`, registros nativos desde `tag_configs.hotkey`) fueron removidos del runtime vigente.
- Ejemplos de scripts filtrados agregados: `020`-`024` (`tag:context`, work/context/marked/prompt variants).
- Showcase publico de acciones locales con shortcuts locales agregados/documentados: `028` clean URL (`Ctrl+Alt+U`), `029` format JSON (`Ctrl+Alt+F`), `010` normalize whitespace (`Ctrl+Alt+N`), `030` extract URLs (`Ctrl+Alt+L`) y `031` join selected as Markdown (`Ctrl+Alt+M`).

### Command Palette global

Actualizacion 2026-07-12:

- `Ctrl+Shift+Space` abre y enfoca la **Command Palette** en el picker principal. Rust solo registra el hotkey, muestra/enfoca la ventana y emite el evento; el renderer mantiene el catalogo y despacha acciones existentes.
- La palette agrupa navegacion por History (`All history`, `Text`, `Images`, `Marked`), saved views persistidas y tags pinned, ademas de las acciones ejecutables actuales. La busqueda local filtra todas las entradas.
- Elegir navegacion cierra la palette y aplica la query al picker normal editable; las acciones conservan su ejecucion actual.
- El overlay local **Quick Actions** contextual (`Ctrl+Alt+Q` con el picker enfocado) se conserva separado: lista solo acciones/scripts compatibles con la seleccion actual.

### Shortcuts Nativos De Metadata

Actualizacion 2026-07-25:

- `Ctrl+Shift+C` es un global shortcut app-owned y read-only en Settings; abre el editor completo de metadata sin mostrar ni agrandar el picker.
- El item objetivo es el activo del picker; un item recien capturado pendiente tiene prioridad aunque el historial visual aun no haya refrescado. Despues de `Enter` y hide/reset, conserva el ultimo item activado. Solo cae al primer item visible si no existe seleccion, captura ni activacion previa.
- El editor global es una utility chica: muestra el contenido del item como preview read-only y mantiene el foco en un unico textarea auto-grow de metadata; no expone `title` ni contexto de captura.
- Cualquier `#token` en cualquier posicion se extrae como tag y se elimina de `notes` al guardar; al reabrir, tags y notas se serializan otra vez en el mismo texto.
- `title` preexistente se preserva internamente sin mostrarse. Escape de `#` y prefijos `@` / `*` quedan fuera de este corte.
- Autocomplete aparece al escribir `#`, prioriza exact/prefix y acepta teclado; un tag nuevo se crea simplemente guardando su token.
- `Edit tags` y `Add tags to selected/checked` conservan el flujo rapido single/multi desde menu.
- Rust aplica batches y guardados completos en transacciones SQLite.
- El backend rechaza `Ctrl+Shift+C` en scripts globales. `Shift+F2` sigue abriendo el mismo editor completo para el item activo.

### Settings > Hotkeys

- Settings tiene seccion `Hotkeys`.
- Editable app-owned:
  - `general.globalShortcut` / open picker;
  - `picker.settingsShortcut` / open Settings from picker (local, not global, default `Ctrl+,`);
  - `picker.pinToggleShortcut` / toggle pin on top.
- Read-only renderer/app shortcuts visibles: `Ctrl+K`, `Ctrl+I`, `Enter`/`Shift+Enter`, `F2`/`Shift+F2`.
- Scripts descubiertos muestran `shortcut`, triggers, archivo y diagnosticos.
- `ShortcutBadge` reusable muestra combinaciones compactas en Settings, menus y tooltips.
- `get_app_shortcut_status` muestra estado nativo real: `Registered`, `Conflict`, `Unsupported`, `Disabled` o `Checking`.
- Backend reintenta registrar app-owned shortcuts si Settings coincide pero el OS no lo tiene registrado.
- Flujo explicito para scripts:
  - `Edit shortcut` expande informacion;
  - `Open this file` llama `edit_script_in_vscode(path)` validando path dentro de scripts dir;
  - `Refresh diagnostics` recarga registry/cache.

### Picker Session / Focus Related

- Con Keep picker open off, focus-lost oculta y marca la sesion transitoria para reset.
- Al reabrir tras focus-lost, query/seleccion/anchor transitorios se limpian.
- Con Keep picker open on, `Enter` y `Shift+Enter` preservan picker visible/query segun policy.
- Decision 2026-06-18: el hotkey global del picker abre con foco por defecto para mantener el producto keyboard-first. La ruta no-activate queda solo como fallback diagnostico (`COPICU_PICKER_NO_ACTIVATE=1`) porque mostraba el picker sin que el search recibiera teclado.
- Oracle de regresion: enfocar app externa -> disparar `Ctrl+Shift+.` -> tipear token sin llamar a `focus` -> screenshot debe mostrar el token en el search. La validacion de 2026-06-18 paso con `.codex-run/computer-use/focus-hotkey-after-type-2.png`.

## Brief Historico Superado: Editor De Metadata Con Modos

> Superado el 2026-07-25 por la decision de textbox unico con `#tags` inline. Esta seccion conserva solamente el contexto del corte anterior.

### Objetivo

Compartir la experiencia de tags entre el editor rapido y el editor completo de metadata, manteniendo notas y tags como campos independientes.

### Comportamiento Observable

- `Ctrl+Shift+C` funciona globalmente y abre metadata para el item activo: titulo, tags, notas Markdown libres y contexto de captura read-only.
- `Shift+F2` abre el mismo editor completo desde el picker.
- Escribir `#algo` en notas no modifica tags; guardar y reabrir conserva ambos campos por separado.
- El menu conserva `Edit tags` para el flujo rapido y ofrece `Edit metadata` con `Shift+F2`.

### Limites Explicitos

- No cambiar `F2`, creacion de items, metadata batch ni semantica de multiseleccion.
- No reescribir notas existentes, importar hashtags automaticamente ni ampliar el esquema de metadata.
- No tocar release, updater ni app instalada.

### Criterios De Terminado

1. El editor rapido mantiene su semantica single/multi desde menu.
2. `Ctrl+Shift+C` global y `Shift+F2` abren el editor completo para el item activo.
3. El editor completo reutiliza la experiencia de tags y permite editar notas independientemente.
4. Un guardado persiste titulo, notas y tags normalizados sin estado parcial; al reabrir se recuperan los mismos valores.

### Checks Focales Minimos

- `npm run build`
- `npm run visual:check -- --grep "Ctrl\\+Shift\\+C opens|multi selection tag editor|metadata window"`
- `cargo test --manifest-path src-tauri/Cargo.toml --lib metadata`

### Resultado 2026-07-25

Implementado el editor completo con el mismo control normalizado de tags, notas Markdown independientes, titulo y captura read-only. El guardado dedicado persiste titulo, notas y tags en una unica transaccion. `Ctrl+Shift+C` quedo registrado globalmente para el item activo, `Shift+F2` abre la misma superficie y el menu conserva los flujos rapido/completo.

Validado con build, 8/8 casos visuales focales y 8/8 tests Rust filtrados por `metadata`. En Windows GNU el test focal requiere el mismo manifest Common Controls v6 y limpieza de Miniconda que aplica `tests/manual/run-rust-tests.ps1`; `cargo test` crudo no es evidencia valida en esta maquina.

## Brief De Dogfood: Metadata Completa

### Objetivo

Validar en Windows real el editor completo de metadata y pulir solo defectos observados sin tocar la app instalada.

### Comportamiento Observable

- `Ctrl+Shift+C` global y `Shift+F2` abren el editor completo con foco util.
- Titulo, tags y una nota con `#texto` se guardan y reaparecen independientes al reabrir.
- El menu conserva `Edit tags` y su semantica rapida single/multi.

### Limites Explicitos

- Usar datos sinteticos y app-data dev aislada; no promover ni modificar la instalada.
- No abrir otra feature, ampliar la bateria general ni pulir fuera de evidencia visual/teclado observada.
- No cambiar metadata batch, `F2` ni semantica de seleccion.

### Criterios De Terminado

1. Ambos accesos al editor completo funcionan con foco y teclado en la app real.
2. Guardar y reabrir conserva titulo, notas y tags independientes.
3. El editor rapido de tags sigue funcionando en single y multi.
4. Todo defecto observado queda corregido y revalidado, o registrado como gate concreto si requiere decision externa.

### Checks Focales Minimos

- Smoke interactivo en dev aislado con Computer Use/AHK y fixtures sinteticos.
- Si hay cambios de producto: `npm run build`.
- Si hay cambios de producto: `npm run visual:check -- --grep "Ctrl\\+Shift\\+C opens|multi selection tag editor|metadata window"`.

### Resultado 2026-07-25

Dogfood completado sobre un perfil temporal aislado con seis fixtures sinteticos. `Shift+F2` y `Ctrl+Shift+C` abrieron la ventana nativa; titulo, `#dogfood-meta` y una nota con `#note` persistieron como campos independientes al guardar y reabrir. El menu single conservo `Edit tags` / `Edit metadata`, y el menu de tres items checked conservo `Add tags to checked` sin reemplazar tags existentes.

El smoke detecto que la ventana recibia foco nativo pero dejaba `document.activeElement` en `BODY`. El titulo ahora usa autofocus al montar y un refocus en el siguiente frame al cambiar de payload; la revalidacion AHK + CDP dejo el input `Optional title` activo en ambos accesos. Pasaron `npm run build` y los 8/8 visuales focales.

### Resultado Del Rediseño Inline 2026-07-25

La ventana `metadata` quedó con un solo textarea auto-grow enfocado, autocomplete contextual al escribir `#`, `Ctrl+Enter` para guardar y acciones compactas. El parser mantiene la arquitectura SQLite vigente: envía texto sin tokens a `notes`, tags normalizados a `tags` y preserva `title` sin exponerlo. Desde el corte de scenarios, `client`, `project` y `activity` siguen el mismo convenio mediante tokens inline repetibles, con comillas para valores con espacios, en vez de inputs permanentes debajo del textarea.

## Validaciones De Referencia

Ultimos checks relevantes:

- Corte built-in tags 2026-07-25: `npm run build` y `cargo check --manifest-path src-tauri/Cargo.toml --lib` pasan.
- `npm run visual:check`: 160/160; incluye `Ctrl+Shift+C` single y batch en desktop/narrow.
- LSP/lens sin errores y `bun run context:audit` pasa.
- Dogfood visual/teclado 2026-07-25 en dev aislado: single creo, aplico, reabrio y limpio un tag; multi agrego un tag a dos clips y conservo los tags distintos preexistentes; `Escape` cancelo y `Ctrl+Enter` aplico. El bridge AHK-MCP estaba ausente, por lo que se uso AHK local para foco/teclas y CDP WebView2 para inspeccion visual.
- Pulido observado: el titulo single ahora dice `Edit tags` y la ayuda muestra `Ctrl+Enter` de forma consistente.
- Dogfood Settings script shortcut edit en perfil dev aislado:
  - script temporal `dogfood.shortcutEdit` registro `Ctrl+Alt+Shift+9`;
  - cambiar a `Ctrl+Alt+Shift+T` produjo conflicto;
  - cambiar a `Ctrl+Alt+Shift+8` limpio diagnosticos;
  - script temporal eliminado.
- Visual tests cubren expansion `Edit shortcut`, `Open this file`, `Refresh diagnostics`, toast `Scripts refreshed` e invocaciones backend.

## Riesgos / Gotchas

- Dev e instalada pueden coexistir y chocar en hotkeys globales.
- Inyecciones sinteticas de teclas no siempre disparan hooks globales; validar hotkeys criticos con Computer Use/teclado fisico cuando importe.
- No validar foco del picker solo con `windows`, `window_info`, target screenshot o una llamada manual a `focus`; esos checks pueden ocultar la regresion donde el picker se ve pero no recibe teclado.
- WhichKey como ventana secundaria tuvo historicamente problemas de composicion WebView2; no tocarlo salvo objetivo explicito.
- No usar ausencia de page CDP como unica prueba de que una ventana secundaria no cargo; complementar con logs renderer/IPC.
- Clicks por coordenadas sobre esquina superior derecha pueden contaminarse por overlays de herramientas; preferir logs y `GetWindowRect`.
- `npm run rust:test` puede fallar por infraestructura local `STATUS_ENTRYPOINT_NOT_FOUND`; contrastar con `cargo check`.
- No persistir payloads reales del clipboard en logs/docs.
