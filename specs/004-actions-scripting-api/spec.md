# Actions Scripting API

## Estado

Primer corte implementado y segundo corte en marcha. Settings de carpeta de scripts, registry built-in, action run logging redacted, menu wiring, toast stack inicial, discovery estático de scripts, cache SQLite de registry/diagnostics, UI debug mínima y runner manual TS/JS trusted ya existen. El runner cubre `devRun`/`commandPalette`/`itemMenu`/`localShortcut`/`globalShortcut` con bridge `log`/`toast`/`selection`/`clipboard.writeText` más `history.search/get/update` y `picker.filter/activate`. Scripts ready ya se conectan a item menu, command palette, local shortcuts y un primer slice de global shortcuts.

## Objetivo

Crear una base de Actions scriptables para Copicu:

- comandos built-in y scripts locales usan la misma API host;
- scripts TS/JS viven como archivos editables;
- contexto de ejecucion explicito por trigger/input/seleccion;
- busqueda desde scripts reutiliza la query syntax del picker;
- debug y logs son parte del diseño inicial;
- referencias a items usan IDs estables, no rows visibles.

## No Objetivos Del Primer Corte

- Marketplace o plugins de terceros.
- Sandbox fuerte.
- Runtime completo Node/Deno/QuickJS.
- VS Code extension.
- Auto-run de scripts al guardar.
- Compatibilidad literal con CopyQ scripting.

## Decisiones Base

- Default scripts folder: `Documents/Copicu/Scripts`.
- Setting persistido: `scripts.folderPath`.
- Source code en filesystem; SQLite no guarda codigo fuente.
- SQLite puede guardar parse/build diagnostics, action registry cache, run metadata y logs resumidos.
- CopyQ se usa como baseline de contexto:
  - automatic clipboard change;
  - menu/local shortcut con selected/current si viene de ventana principal;
  - tray con clipboard data;
  - global shortcut sin selected items implicitos;
  - match por contenido/window/filtro/MIME.

## Modelo Conceptual

```ts
type Trigger =
  | "itemMenu"
  | "commandPalette"
  | "localShortcut"
  | "globalShortcut"
  | "clipboardChange"
  | "tray"
  | "cli"
  | "devRun";

type SelectionRequirement = "none" | "optional" | "one" | "oneOrMore" | "many";

type ActionInput = {
  source: "pickerSelection" | "clipboard" | "historySearch" | "none";
  selection: SelectionRequirement;
  kinds?: ClipKind[];
  mime?: string[];
  query?: string;
};
```

## Primer Corte

1. Add `scripts.folderPath` to app settings and Settings UI.
2. Add internal action registry for built-in actions.
3. Add `action_runs` storage/logging with redacted summaries.
4. Add script folder discovery and diagnostics without execution.
5. Add trusted manual TS/JS execution.

## Done Para Primer Corte

- `get_settings` returns a non-empty default `scripts.folderPath`.
- Settings UI can edit and persist the scripts folder.
- Existing settings JSON without `scripts` still loads.
- Topic `docs/topics/actions-and-scripting-api.md` is the source of truth for API shape.
- `list_builtin_actions` exposes built-ins with stable ids.
- `run_action` executes built-ins from explicit `ActionContext`.
- SQLite `action_runs` stores run metadata and redacted summaries, not payload source/content.
- Picker menu can execute `builtin.pastePlain`, `builtin.joinSelected`, and `builtin.openUrl`.
- UI has a top-right toast stack with configurable duration for action feedback.
- `list_actions` returns built-ins plus discovered script actions.
- Discovery reads `scripts.folderPath`, scans `.ts`/`.js`/`.mjs`, ignores `.d.ts`, parses `defineAction({...})` without execution, and reports diagnostics.
- Settings shows built-in/script/diagnostic counts.
- SQLite persists discovered script registry and diagnostics without storing script source.
- Settings lists discovered scripts and diagnostics by file.
- `run_action` can execute ready script actions manually for `devRun`/`commandPalette`.
- Manual script runs can call `copicu.log.*`, `copicu.ui.toast`, `copicu.selection.*` and `copicu.clipboard.writeText`.
- Script run metadata is stored in `action_runs`; script logs are redacted JSONL in `Scripts/.logs`.

## Next Implementation Slice

1. Design a reusable auxiliary `ui-host` window for custom `toast`, `confirm`, and `input` surfaces.
2. Add request/response IDs so interactive `ui.confirm` and `ui.input` can resolve during script execution.
3. Add remaining bridge APIs: `history.remove`, `clipboard.read`, and richer clipboard write formats if still needed.

## Implemented Local Shortcut Slice

- `ActionDefinition` exposes `shortcut`.
- Static script discovery extracts `shortcut` and persists it in the registry cache.
- Command palette and item menu show declared shortcuts.
- Picker-focused keydown can run ready scripts that declare `localShortcut`.
- Execution sends `trigger: "localShortcut"` and the normalized shortcut in `ActionContext`.

## Implemented Global Shortcut Slice

- Ready scripts with trigger `globalShortcut` and a valid `shortcut` are registered through `tauri-plugin-global-shortcut` at startup.
- `Ctrl+Shift+,` remains reserved for opening Copicu.
- Duplicate script global shortcuts, invalid shortcut syntax, and global actions that require selected items are exposed as diagnostics and are not registered.
- Execution sends `trigger: "globalShortcut"` and the normalized shortcut in `ActionContext`.
- Global context is explicitly empty: no current item, no selected item IDs, and no picker view.
- Startup registration, re-registration through `list_actions`, and polling-based refresh after script file edits are supported; event-driven filesystem watcher/debounce is deferred.

## Implemented Clipboard Change Slice

- `clipboardChange` is wired for ready script actions.
- Scripts run after a clipboard capture is accepted and persisted.
- Context does not use picker selection:
  - `currentItemId` is the captured item;
  - `selectedItemIds` is `[]`;
  - `view` is absent.
- Scripts must declare `input.source: "clipboard"` and selection `none` or `optional`.
- `input.kinds` and `input.mime` are matched against the captured item.
- Self-write suppression still runs before persistence, so host/script clipboard writes do not recursively trigger this slice.
- Text and image items can be filtered by kind; first example is text-only.

## Planned Auxiliary UI Slice

- `ui.notify` uses OS-native notifications via the Tauri notification plugin and is available for simple `clipboardChange` background scripts.
- `ui.toast` should remain in-app feedback, not the default for background automation.
- Custom, fully controlled notifications should use a future `ui-host` window rather than more ad hoc polish on the current `notifications` window.
- Custom script prompts require an auxiliary `ui-host` WebView window plus request/response plumbing:
  - pending prompt ID in Rust;
  - event to frontend;
  - user response command/event;
  - script host call resolves with the value.
- Native dialog plugin can cover simple `alert`/`confirm`, but not general text input.
