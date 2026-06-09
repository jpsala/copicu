---
id: actions-and-scripting-api
status: active
kind: decision-map
triggers:
  - actions
  - scripting
  - scripts
  - plugins
  - TypeScript actions
  - JavaScript actions
  - CopyQ commands
  - command context
primary_refs:
  - ../active-work/004-actions-scripting.md
  - ./copyq-technical-baseline.md
  - ./filtering-and-query-syntax.md
---

# Actions And Scripting API

## Direction

Copicu should expose a scriptable Actions API inspired by CopyQ behavior, but not CopyQ-compatible.

Core direction:

- source scripts live as editable files, not in SQLite;
- SQLite stores indexes, parse/build diagnostics, settings, run logs metadata, and enablement state;
- TypeScript/JavaScript is the target authoring language;
- actions are the durable unit for menu commands, local shortcuts, global shortcuts, clipboard triggers, command palette, CLI, and future plugins;
- built-in actions should use the same host API that scripts will use later;
- the first runtime can be a trusted local Node/TypeScript runner; sandboxing is not a first-slice promise.

## Storage Model

Default scripts folder:

```text
Documents/Copicu/Scripts
```

The folder is configurable in Settings under `scripts.folderPath`.

For agents and default initialization, resolve script folders in this order:

1. Explicit user path.
2. `COPICU_SCRIPTS_DIR`.
3. Settings `scripts.folderPath`, if discoverable.
4. `Documents/Copicu/Scripts`.

Copicu uses persisted Settings once present. `COPICU_SCRIPTS_DIR` only changes the initial/default folder path, not a user-saved Settings override.

Planned file layout:

```text
Scripts/
  join-selected.ts
  paste-plain.ts
  plugins/
    jp-text-tools/
      copicu.plugin.json
      package.json
      src/
```

Do not use SQLite as the source of truth for script source code. Files give us VS Code editing, Git, diffs, search, backup, and future debugger integration. SQLite can cache parse/build results keyed by file path and source hash.

## CopyQ Context Baseline

CopyQ command contexts worth preserving conceptually:

- automatic commands run on clipboard changes and receive current clipboard data;
- menu commands run from the main window, context menu, item menu, or tray;
- menu shortcuts are local to CopyQ focus;
- global shortcuts run without app focus and do not automatically receive selected items or clipboard data;
- match rules can filter by content, active window title, external filter command, and MIME/format;
- selected/current item state is captured as a command snapshot when invoked from the GUI.

Copicu should make those contexts explicit instead of relying on implicit row-based behavior.

## Action Manifest Shape

Single-file scripts may start with comment metadata for fast personal scripts, but the durable model is manifest-like and typed:

```ts
export default defineAction({
  id: "join-selected",
  title: "Join Selected",
  shortcut: "Ctrl+Alt+J",
  triggers: ["itemMenu", "commandPalette", "localShortcut"],
  input: {
    source: "pickerSelection",
    selection: "oneOrMore",
    kinds: ["text"]
  },
  capabilities: ["history:read-content", "clipboard:write"],
  async run(ctx) {
    const items = await ctx.selection.items({ content: true });
    await ctx.clipboard.writeText(items.map((item) => item.text ?? "").join("\n\n"));
  }
});
```

Capabilities may start as non-blocking diagnostics for trusted personal scripts. They become important for privacy, UX, and future third-party/plugin use.

## Context Contract

Action triggers:

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
```

Input requirements:

```ts
type SelectionRequirement = "none" | "optional" | "one" | "oneOrMore" | "many";

type ActionInput = {
  source: "pickerSelection" | "clipboard" | "historySearch" | "none";
  selection: SelectionRequirement;
  kinds?: ClipKind[];
  mime?: string[];
  query?: string;
};
```

Runtime context:

```ts
type ActionContext = {
  trigger: Trigger;
  shortcut?: string;
  currentItemId?: string;
  selectedItemIds: string[];
  view?: {
    query: string;
    visibleItemIds: string[];
    currentIndex?: number;
  };
};
```

Unlike CopyQ rows, scripts should use stable item IDs as the primary references. View indexes are convenience only.

## API Shape

First useful namespaces:

```ts
copicu.selection.current()
copicu.selection.items()
copicu.selection.ids()
copicu.selection.set(ids)

copicu.history.search(query, options)
copicu.history.get(id)
copicu.history.getByViewIndex(index)
copicu.history.next(ref?)
copicu.history.previous(ref?)
copicu.history.update(id, patch) // text/title/notes/tags/marked
copicu.history.remove(id)
copicu.history.move(ids, target)

copicu.clipboard.read()
copicu.clipboard.writeText(text)
copicu.clipboard.writeItem(id)
copicu.clipboard.writeFormats(formats)

copicu.picker.open({ query?, rememberPrevious?, show?, focus? })
copicu.picker.filter(query)
copicu.picker.activate(id, options)
copicu.picker.show()
copicu.picker.hide()

copicu.commands.run("picker.open", { query?, rememberPrevious?, show?, focus? })

copicu.window.rememberPrevious()
copicu.window.focusPrevious()
copicu.input.paste({ shortcut: "default" })

copicu.log.info(message, data)
copicu.ui.toast(message)
copicu.ui.popup(title, message)
```

`history.search()` must share the same parser as the main picker query syntax. `picker.open()` is the preferred script API for showing Copicu with an optional query from global/background triggers because it can remember the previous app before focusing the picker. `picker.filter()` changes visible UI state when the picker is already open; `history.search()` does not.

### Parameterized Actions Direction

Implemented first slice 2026-06-09: `scripts/examples/020-open-tag-filtered.ts` is now a small wrapper around an allowlisted host command:

Current model:

```ts
await copicu.commands.run("picker.open", {
  query: "tag:context",
  rememberPrevious: true,
});
```

The goal is to avoid one full script implementation per tag. A tag hotkey, saved filter, AI-generated action, or user script can bind a shortcut to the same generic command with different serializable parameters.

Design constraints:

- keep capabilities explicit: `commands:run` authorizes the command namespace and `picker:open` authorizes the concrete picker effect;
- do not allow arbitrary internal command names; the host allowlist currently contains only `picker.open`;
- keep parameter payloads serializable and redacted in `action_runs`;
- preserve previous-window behavior for later `Shift+Enter` paste;
- do not expand to `actions.run` or arbitrary internal commands until there is a concrete script need.

Responsiveness incident 2026-06-09: after adding `picker.open`, JP reported the app was not responsive. Triage showed two important lessons. First, process `Responding=True` is not enough: a fresh dev WebView can expose Tauri runtime while `#root` is empty and no controls are mounted. A dev-only startup watchdog now reloads the main WebView only when `#root` is still empty after startup. Second, `picker.open` from scripts must use the same main-thread-safe, focus-hardened pattern as native picker open paths; it now logs redacted `script.picker.open.*` diagnostics and uses native/delayed focus fallback. Acceptance for future changes in this area must include CDP DOM/root check, `record_renderer_diagnostic` IPC, heartbeats, real drag by `GetWindowRect`, and custom Hide/X logs.

## UI Feedback Direction

Actions need host UI primitives, not raw browser globals:

- `copicu.ui.toast(options)` for non-blocking notifications;
- `copicu.ui.notify(options)` for OS-native/background notifications;
- `copicu.ui.alert(options)` for blocking acknowledgement;
- `copicu.ui.confirm(options)` for yes/no decisions;
- `copicu.ui.input(options)` for a small text prompt;
- `copicu.ui.markdownOutput(options)` for generated Markdown reports and summaries;
- `copicu.log.*` for structured run logs.

Toast behavior decided 2026-06-05:

- render top-right;
- stack multiple notifications;
- newest stays at the top and older notifications move down;
- support duration in milliseconds;
- `durationMs: 0` means sticky until dismissed.

Current implementation wires toast feedback for built-in action runs and for script `copicu.ui.toast(...)` calls. Background trigger toasts can be emitted to the auxiliary notifications window, but the current custom toast window is visually and operationally fragile on Windows/WebView2.

### Native Vs Auxiliary UI Decision

Research checked official Tauri 2 docs:

- Dialog plugin: native `confirm()` and `message()` exist for yes/no and alert-style dialogs. It also handles file open/save dialogs. It does not provide a general text input prompt.
- Notification plugin: OS-native desktop notifications exist through permission checks, `requestPermission()` and `sendNotification()`. This is the right primitive for background events such as clipboard-change notifications.
- WebviewWindow API: independent windows can be created, transparent, undecorated, always-on-top, shown/hidden and resized. This is the right primitive for custom UI such as input prompts, rich confirm surfaces, command palettes and HUDs.
- Capabilities: every independent window needs explicit permissions for window/event APIs. Missing permissions produce runtime errors such as `window.show not allowed`, `window.hide not allowed`, or `window.set_size not allowed`.
- Positioner plugin: useful later for placing tray-relative or screen-edge auxiliary windows.

Decision implemented for native notifications and first `ui-host` prompts:

- `ui.notify` is backed by `@tauri-apps/plugin-notification` / `tauri-plugin-notification` for OS-native notifications, especially `clipboardChange` scripts.
- Keep `ui.toast` for in-app feedback while the picker/main UI is visible.
- Replace ad hoc `notifications` window work with a deliberate `ui-host` auxiliary window when custom UI is needed.
- `ui.confirm` and `ui.input` are implemented through request/response IDs:
  - script run creates a pending UI request;
  - `ui-host` renders the prompt;
  - frontend returns an answer through `resolve_ui_host_request`;
  - Rust resolves the script host call.
- `ui.markdownOutput` opens the `ai-output` window and renders Markdown with actions to copy Markdown, add it as a history item, or export a `.md` file under `Documents/Copicu/Exports`.
- Capability: `ui:markdown-output`.
- This is the preferred path for AI summaries, reports, translations and compilations. Scripts/AI still do not receive raw filesystem access.
- `copicu.ai.respondMarkdown({ instruction, items, context })` is the open AI helper for item-based summaries, reports, translations, comparisons, extractions, drafts, and free-form answers. It always returns Markdown and uses capability `ai:summarize`; `summarizeMarkdown` remains as a compatibility alias.
- Use native dialog plugin only for simple blocking `alert`/`confirm` where OS styling is acceptable.

Current `ui.notify` script shape:

```ts
await copicu.ui.notify({
  title: "Copicu",
  body: "Background action finished.",
});
```

Current `ui.confirm`/`ui.input` script shape:

```ts
const confirmed = await copicu.ui.confirm({
  title: "Apply metadata",
  message: "Update selected items?",
  confirmLabel: "Apply",
});

const value = await copicu.ui.input({
  title: "Tag selected items",
  message: "Use a short tag.",
  placeholder: "#todo",
});
```

Next slice recommendation:

1. Dogfood `ui.confirm`/`ui.input` with real scripts in app.
2. Keep `ui.toast` as in-app feedback until `ui-host` replaces custom global toasts deliberately.
3. Decide whether `ui.alert` should use native dialog or `ui-host`.

## Debug Direction

Debug is part of the core design, not polish:

- file watcher detects changed scripts and manifests with debounce;
- parser/build result is cached with source hash;
- failed parse/build disables that action and exposes diagnostics;
- `console.*` and `copicu.log.*` are captured per run;
- logs are structured JSONL and redacted by default;
- script logs default to the scripts folder: `Scripts/.logs/<action-id>.jsonl`;
- scripts may override the log file name with `logging.name`;
- `logging.name` is a file name only, not a path; the runner should reject path separators;
- action run records include trigger, duration, status, error class, stack, and redacted input summary;
- no automatic execution on save by default; dev-only `runOnSave` can come later.

Future VS Code support:

- generate `copicu.d.ts`;
- generate `tsconfig.json` in scripts folder;
- provide a launch config for attach debugging when a Node runner exists;
- optional VS Code extension can list actions, run selected action, and show logs/diagnostics.

## First Slice

Implementation should proceed in small layers:

1. Add `scripts.folderPath` to typed app settings, defaulting to `Documents/Copicu/Scripts`.
2. Build an internal action registry for built-in actions.
3. Add action run logging with redaction.
4. Add file discovery and parse diagnostics without executing scripts.
5. Add trusted local TS/JS runner for manually triggered scripts.
6. Add auto reload and dev/debug conveniences.

Implemented 2026-06-05:

- `scripts.folderPath` setting and Settings UI.
- Rust built-in action registry.
- Rust/TS action contract types.
- Built-ins: `builtin.pastePlain`, `builtin.joinSelected`, `builtin.openUrl`.
- SQLite `action_runs` with redacted input summaries.
- Picker menu wiring for the built-ins.
- Initial toast stack for action feedback.
- Script examples under `scripts/examples/`, from simple toast/log to batch triage.
- Static script discovery:
  - `list_actions` merges built-ins and scripts;
  - reads `scripts.folderPath`;
  - scans `.ts`, `.js`, `.mjs`;
  - ignores `.d.ts`;
  - parses `defineAction({...})` without executing code;
  - extracts action metadata, logging config, source hash, and diagnostics;
  - Settings shows registry counts.

Implemented 2026-06-06:

- SQLite cache for discovered scripts:
  - `script_action_registry`;
  - `script_action_diagnostics`.
- `list_actions` refreshes that cache from `scripts.folderPath` and returns cached script definitions after built-ins.
- The cache stores registry metadata, source hash, serialized definition, and diagnostics only; script source remains filesystem-only.
- Debug inspection command: `list_script_action_diagnostics`.
- Settings includes a compact script registry debug list with per-file diagnostics.
- Trusted manual TS/JS runner:
  - Node runner at `scripts/copicu-script-runner.mjs`;
  - invoked from Rust `run_action` for script actions with `devRun` or `commandPalette`;
  - scripts with error diagnostics are blocked;
  - Settings exposes a debug `Run` control for ready manual scripts.
- Initial bridge:
  - `copicu.log.*` and `console.*` write redacted JSONL logs to `Scripts/.logs`;
  - `copicu.ui.toast` returns toasts to the app;
  - `copicu.selection.ids/current/items/set` uses a snapshot of selected item IDs/content;
  - `copicu.clipboard.writeText` is applied by Rust with self-write suppression.
- Existing `action_runs` logging now covers script runs with redacted input summaries.

Not implemented yet:

- Local hotkeys, global hotkeys, tray, or clipboard triggers.
- Bridge APIs beyond the current slice: `history.remove`, `clipboard.read/writeItem`, `picker.show/hide`, `window.*`, `input.*`, `ui.alert/confirm/input`.
- Streaming IPC for script effects during execution; current effects are applied after the script run completes.

Implemented later on 2026-06-06:

- Ready script actions are connected to item menus when their trigger/input/kind/MIME/capability contract matches the current selection.
- Command palette exists for built-ins and ready scripts with `Ctrl+K` and a `Commands` button.
- Script runner uses an internal NDJSON protocol for host calls during execution.
- Bridge now includes `history.search/get/update` and `picker.filter/activate`.

Implemented dogfood slice on 2026-06-06:

- Real scripts were added under `scripts/examples/` and copied to `Documents/Copicu/Scripts` for:
  - `history.get/update` from item menu;
  - `history.search` from command palette;
  - `picker.filter`;
  - `picker.activate` with explicit activation options.
- WebView2 CDP smoke with the live dev app validated those four scripts against a synthetic clipboard item.
- Text scripts should prefer `input.kinds: ["text"]` over strict `mime: ["text/plain"]` unless the script truly needs MIME-specific behavior; captured text items may have empty `mime_primary`.
- Bridge now also includes non-interactive operations:
  - `clipboard.writeItem`;
  - `picker.open`;
  - `picker.show/hide`;
  - `window.rememberPrevious`;
  - `window.focusPrevious`;
  - `input.paste`.
- Still not implemented: `clipboard.writeFormats`.

Implemented bridge infra slice on 2026-06-06:

- `history.remove(id)` deletes a history item by stable ID and removes blobs through the existing storage delete path.
- `clipboard.read()` returns current clipboard text as `{ text?: string }`; rich/html reads remain future work.
- `ui.alert(options)` uses the `ui-host` auxiliary window, resolves during script execution, and shows a single acknowledgement button.
- Supported capabilities now include `history:delete`, `clipboard:read`, and `ui:alert`.
- Added example `017-alert-clipboard-text-length.ts` to exercise `clipboard.read` + `ui.alert` without logging payload.

Implemented AI Script Mode v1 foundation on 2026-06-07:

- Added `ai_script_run` Tauri command.
- The command asks the configured AI provider for a temporary TypeScript action, returns the generated script, capabilities, warnings and summary, then executes it through the existing Copicu script runner.
- Temporary AI scripts use trigger `devRun`, input `none`, declared capabilities, and the same `copicu.*` host API as normal scripts.
- The planner and Rust host reject imports, `require`, process/network/browser storage/eval style constructs, and keep the first cut away from raw SQLite, shell, filesystem, network and external packages.
- `copicu.history.update(id, { marked: true | false })` is supported through existing `history:write-metadata`, so requests like "mark 3 more randomly" can be implemented as `history.search("is:unmarked")` plus `history.update`, without a dedicated random-mark tool.

Implemented local shortcut slice on 2026-06-06:

- `ActionDefinition` includes `shortcut`.
- Static discovery reads `shortcut` from `defineAction({...})` and persists it through the script registry cache.
- Ready scripts with trigger `localShortcut` can run while the picker search input is focused.
- Frontend shortcut matching normalizes simple combinations such as `Ctrl+Alt+J`.
- Local shortcut execution uses the current picker selection snapshot and sends `context.trigger: "localShortcut"` plus normalized `context.shortcut`.
- Matching still respects diagnostics, supported capabilities, selection, kind, and MIME filters.
- Command palette and item menu show the shortcut badge when present.

Implemented global shortcut slice on 2026-06-06:

- Ready script actions can declare `globalShortcut` plus `shortcut`.
- Startup discovery refreshes the script registry cache and registers valid global script shortcuts with `tauri-plugin-global-shortcut`.
- The `list_actions` command refreshes the script registry cache and re-registers valid global script shortcuts, so opening Settings/refreshing actions can pick up script shortcut edits without a full app restart.
- A lightweight background refresh loop watches script folder metadata by polling `.ts`/`.js`/`.mjs` files and refreshes registry/global shortcuts after edits.
- The picker opener `Ctrl+Shift+,` remains reserved and is never claimed by scripts.
- Duplicate global shortcuts between scripts are diagnostics errors; conservative behavior is to register none of the colliding scripts.
- Invalid shortcuts and global actions that require selected items are diagnostics errors.
- Runtime context is deliberately no-selection:
  - `trigger: "globalShortcut"`;
  - normalized `shortcut`;
  - `selectedItemIds: []`;
  - `currentItemId: null`;
  - no `view`.
- Event-driven filesystem watching is not implemented yet; current automatic reload is polling-based.

## Local And Global Shortcuts

Current state:

- The app has a global shortcut to open Copicu (`Ctrl+Shift+,`).
- Script triggers `localShortcut` and `globalShortcut` exist in the type contract.
- Script execution currently supports `itemMenu`, `commandPalette`, `localShortcut`, `globalShortcut`, and `devRun`.
- Script action definitions expose a durable `shortcut` field in Rust/TS registry output.

Local shortcuts:

- local shortcuts fire only while the picker is focused;
- they use the current picker selection snapshot;
- they call `run_action` with `trigger: "localShortcut"` and the normalized shortcut string;
- they reuse existing readiness checks: diagnostics, supported capabilities, input selection, kinds, and MIME.

Global shortcuts:

- global shortcuts fire at OS level through `tauri-plugin-global-shortcut`;
- first slice registers at startup, re-registers on `list_actions`, and refreshes after script file edits via polling;
- they use no implicit selection and no picker view snapshot;
- scripts should use explicit host APIs (`history.search`, `picker.show`, `clipboard.writeText`, etc.) when they need data or UI;
- event-driven filesystem watcher/debounce remains optional future hardening.

## Clipboard Change Trigger

Current state:

- `clipboardChange` is wired for scripts in a first slice.
- Clipboard capture, persistence, dedupe/move-to-top, and self-write suppression are reused by the trigger.
- The watcher runs clipboard-change actions only after a capture is accepted and persisted.

Current contract:

- scripts must declare trigger `clipboardChange`;
- scripts must use `input.source: "clipboard"`;
- selection must be `none` or `optional`;
- `input.kinds` and `input.mime` are matched against the captured item;
- context uses `currentItemId` for the captured item;
- `selectedItemIds` is always `[]`;
- no picker `view` is provided;
- clipboard writes through host/script APIs respect self-write suppression and do not recursively persist or trigger scripts for that write.

Example:

```ts
export default defineAction({
  id: "examples.logTextClipboardChange",
  title: "Log text clipboard change",
  triggers: ["clipboardChange"],
  input: { source: "clipboard", selection: "none", kinds: ["text"] },
  capabilities: ["history:read-content", "ui:toast", "log:write"],
  async run(ctx) {
    const item = await copicu.history.get(ctx.currentItemId, { content: true });
    await copicu.log.info("captured text item", {
      itemId: item.id,
      textLength: item.text?.length ?? 0,
    });
  },
});
```

Next hardening:

- Dogfood with text scripts that update metadata or write synthetic clipboard output.
- Add tests around trigger candidate filtering when those helpers are testable without a Tauri app.
- Decide whether to add a dedicated `clipboardItemId` alias later for clarity.

Risks:

- Recursive clipboard writes if a future path bypasses host self-write suppression.
- Duplicate events for one user copy.
- Scripts running on private clipboard content unexpectedly.
- Ambiguous context if scripts assume `currentItemId` means visible picker selection; docs now call out that clipboard-change selection is empty.

Acceptance target:

- Copying synthetic text runs a ready text `clipboardChange` script.
- Image copies do not run a text-only script.
- A script clipboard write does not retrigger itself through host APIs.
- No payload is written to docs/tests/log summaries.

## Internal Commands And Smart Tagging

Decision 2026-06-08:

- Smart tagging should be represented as an internal action/command, not as ad hoc watcher logic.
- The first target command is `builtin.smartTagClipboardItem`.
- It uses trigger `clipboardChange`, input `capturedItem`, and explicit capabilities such as `history:read-content`, `history:write-tags`, and `ai:classify`.
- It is disabled by default and configured from Settings > Tags > Auto tagging.
- It runs asynchronously after capture/persistence and must not block normal copy/capture.
- It applies tags through the normalized tags API (`tags` + `clipboard_item_tags`), not through raw `clipboard_items.tags` string patching.
- Logs must stay redacted: item ids, kind, length, suggested/applied tag slugs, confidence; never payload.
- It should support allowlisted tags and suggest-only mode before broad auto-apply.
- Do not register/intercept `Ctrl+C` as a global Copicu shortcut. If an enhanced copy command is needed, it should use a separate opt-in hotkey/sequence and compose normal capture + enrichment.
