---
status: active
updated: 2026-06-14
topic: docs/topics/tag-management-hotkeys.md
related:
  - docs/topics/hotkeys.md
  - docs/topics/whichkey.md
  - docs/topics/compound-hotkeys-and-whichkey.md
archive:
  - docs/reference/012-tags-and-hotkeys-archive-2026-06-14.md
---

# 012 Hotkeys, WhichKey And Tags

Estado vigente: Settings Hotkeys V1 implementado; hotkeys nativos por tag removidos; filtros por tag/query se expresan como scripts.

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

## Validaciones De Referencia

Ultimos checks historicos relevantes:

- `npm run build`: pasa.
- `npm run visual:check`: paso 84/84 en cortes de Settings Hotkeys.
- `cd src-tauri; $env:CARGO_TARGET_DIR='target-codex-check'; cargo check`: pasa en cortes documentados.
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

## Proximo Corte Recomendado

1. Si se retoma Hotkeys/Tags: dogfoodear Settings > Hotkeys con scripts reales y diagnosticos de conflictos, sin reintroducir hotkeys nativos por tag.
2. Si JP pide edicion mas comoda de scripts: disenar patch preview explicito para cambiar `shortcut` en archivo, con diff/confirmacion, rollback y refresh de diagnosticos.
3. Si se toca WhichKey: tratarlo como investigacion de composicion de ventana secundaria, no como cambio al runtime compuesto.
4. Si se toca codigo: correr `npm run build`, `npm run visual:check` y `cd src-tauri; $env:CARGO_TARGET_DIR='target-codex-check'; cargo check`; luego relanzar/recargar app dev segun corresponda.
