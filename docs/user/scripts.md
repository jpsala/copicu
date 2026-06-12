# Copicu Scripts

Copicu scripts are local TypeScript or JavaScript files that define actions using `defineAction({...})`.

They are meant for personal automation: small commands that run from the item menu, command palette, local picker shortcuts, global shortcuts, clipboard-change rules, and eventually tray actions or CLI calls.

Scripts are inspired by CopyQ commands, but they are not CopyQ-compatible. Copicu scripts use explicit metadata, stable item IDs, declared capabilities, and a typed host API.

## What Scripts Are Useful For

Scripts can help with workflows like:

- tagging the selected clipboard item;
- adding notes or titles;
- normalizing whitespace;
- copying a transformed version of a clip;
- joining selected text clips;
- searching history and copying a summary;
- filtering the picker to text, URLs, tags, or other query syntax;
- activating an item with explicit copy/paste behavior;
- sending a selected item to the previous window;
- creating reusable personal commands that do not belong in the app core.

Current scripts are best for trusted personal automation. They are not a plugin marketplace or a sandboxed third-party extension system yet.

## Where Scripts Live

Default folder:

```text
Documents/Copicu/Scripts
```

Logs are written under:

```text
Documents/Copicu/Scripts/.logs
```

Copicu's script folder can be changed in Settings through `scripts.folderPath`.

Agents and tooling should resolve the destination folder in this order:

1. explicit user path;
2. `COPICU_SCRIPTS_DIR`;
3. Copicu Settings `scripts.folderPath`, if discoverable;
4. `Documents/Copicu/Scripts`.

The app uses persisted Settings once present. `COPICU_SCRIPTS_DIR` only changes the initial default folder for fresh/default settings.

## File Types

Copicu discovers:

- `.ts`
- `.js`
- `.mjs`

Copicu ignores:

- `.d.ts`

Discovery is static: Copicu parses `defineAction({...})` metadata without executing the script. This lets the app show diagnostics and decide which scripts are ready before running any code.

## Basic Script Shape

```ts
/// <reference path="./copicu-action.d.ts" />

export default defineAction({
  id: "examples.myAction",
  title: "My Action",
  description: "Describe what this action does.",
  triggers: ["commandPalette"],
  input: {
    source: "none",
    selection: "none",
  },
  capabilities: ["ui:toast", "log:write"],
  async run(ctx) {
    await copicu.log.info("action started", {
      trigger: ctx.trigger,
      selectedCount: ctx.selectedItemIds.length,
    });

    await copicu.ui.toast({
      title: "Action complete",
      message: "The script ran successfully.",
      tone: "success",
    });
  },
});
```

## Metadata

The object passed to `defineAction({...})` is the action metadata and runtime definition.

It is not YAML. It is a TypeScript/JavaScript object. The shape is manifest-like, but it lives inside the script file.

Required fields:

- `id`
- `title`
- `triggers`
- `input`
- `capabilities`
- `run`

Recommended fields:

- `description`
- `logging`

### `id`

Stable action ID.

Use a dotted namespace:

```ts
id: "examples.tagSelectedAndNote"
id: "jp.normalizeWhitespace"
id: "work.copyTicketSummary"
```

Do not change IDs casually. The ID is used for discovery, run metadata, logs, and future settings.

### `title`

Short human-facing label shown in menus and command palette:

```ts
title: "Tag selected as todo"
```

### `description`

Short searchable explanation:

```ts
description: "Adds #todo to the selected text clip and records a note."
```

### `triggers`

Where the script may run.

Currently useful:

```ts
triggers: ["itemMenu"]
triggers: ["commandPalette"]
triggers: ["itemMenu", "commandPalette"]
triggers: ["itemMenu", "commandPalette", "localShortcut"]
triggers: ["globalShortcut"]
triggers: ["clipboardChange"]
triggers: ["devRun"]
```

Available trigger names:

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

Not every trigger is implemented yet. In the current slice, scripts run through `itemMenu`, `commandPalette`, `localShortcut`, `globalShortcut`, `clipboardChange`, and `devRun`. Tray and CLI are planned surfaces.

Local shortcuts fire while the picker is focused. They use the current picker selection snapshot and only run when the script is ready and its input contract matches.

```ts
shortcut: "Ctrl+Alt+J",
triggers: ["itemMenu", "commandPalette", "localShortcut"],
```

Supported shortcut syntax is intentionally simple: `Ctrl`, `Alt`, `Shift`, `Meta` plus one final key such as `J`, `Enter`, `Space`, punctuation, or `F1`-`F12`. Local shortcuts use this syntax while the picker is focused; global shortcuts use it at OS level when registered by Copicu.

Global shortcuts use the same simple shortcut syntax, but they run with no implicit picker selection:

```ts
shortcut: "Ctrl+Alt+U",
triggers: ["globalShortcut"],
input: {
  source: "none",
  selection: "none",
},
```

When a global shortcut fires, `ctx.selectedItemIds` is `[]` and `ctx.view` is absent. If the action declares `input.selection: "active"`, Copicu resolves `ctx.activeItemId`/`ctx.currentItemId` from the first recent history item; otherwise they are `null`. Use `history.search()`, `clipboard.writeText()`, `picker.open()`, or other explicit host APIs if the script needs data or UI. `Ctrl+Shift+,` is reserved for opening Copicu, and duplicate script global shortcuts are reported as diagnostics instead of being registered. Script edits are picked up by a lightweight background refresh loop; opening Settings/listing actions also forces a refresh.

Clipboard-change scripts run after Copicu accepts and persists a clipboard capture:

```ts
triggers: ["clipboardChange"],
input: {
  source: "clipboard",
  selection: "none",
  kinds: ["text"],
},
```

When `clipboardChange` fires, `ctx.activeItemId`/`ctx.currentItemId` are the captured history item, `ctx.selectedItemIds` is `[]`, and `ctx.view` is absent. Use `history.get(ctx.activeItemId ?? ctx.currentItemId, { content: true })` when the script needs content. Clipboard writes made through Copicu host APIs use self-write suppression, so they do not recursively create new history items or re-trigger clipboard-change scripts for that same write.

### `input`

The input contract tells Copicu when the action is valid.

```ts
input: {
  source: "pickerSelection",
  selection: "one",
  kinds: ["text"],
}
```

Shape:

```ts
type ActionInput = {
  source: "pickerSelection" | "clipboard" | "historySearch" | "none";
  selection: "none" | "optional" | "active" | "one" | "oneOrMore" | "many";
  kinds?: Array<"text" | "html" | "image" | "fileList" | "unknown">;
  mime?: string[];
  query?: string;
};
```

Selection requirements:

- `none`: action requires no selected items.
- `optional`: action works with or without selection.
- `active`: action requires the active/current picker item, equivalent to CopyQ's current item.
- `one`: action requires exactly one selected item.
- `oneOrMore`: action requires at least one selected item.
- `many`: action requires at least two selected items.

Input sources:

- `pickerSelection`: the action uses current picker selection.
- `historySearch`: the action primarily searches history.
- `clipboard`: the item captured by a `clipboardChange` trigger.
- `none`: no item input required.

For common text scripts, prefer:

```ts
kinds: ["text"]
```

Do not require:

```ts
mime: ["text/plain"]
```

unless MIME-specific behavior is truly needed. Captured text items may have an empty `mime_primary`, so strict MIME filters can hide otherwise valid scripts.

### `capabilities`

Capabilities declare what host powers the script needs.

Current supported capabilities:

```ts
capabilities: [
  "history:read-content",
  "history:search",
  "history:write-metadata",
  "history:promote",
  "metadata:read-tags",
  "metadata:edit-active",
  "history:delete",
  "clipboard:read",
  "clipboard:write",
  "ui:toast",
  "ui:notify",
  "ui:alert",
  "ui:confirm",
  "ui:input",
  "ui:markdown-output",
  "log:write",
  "commands:run",
  "picker:open",
  "picker:filter",
  "picker:activate",
  "picker:show",
  "picker:hide",
  "window:remember-previous",
  "window:focus-previous",
  "input:paste",
]
```

Use only the capabilities the script actually needs.

Examples:

```ts
capabilities: ["ui:toast", "log:write"]
```

```ts
capabilities: ["history:read-content", "history:write-metadata", "ui:toast", "log:write"]
```

```ts
capabilities: ["history:search", "clipboard:write", "ui:toast", "log:write"]
```

Unsupported or future-facing capabilities should make a script not ready until the host supports them.

### `logging`

Optional logging config:

```ts
logging: {
  name: "tag-selected.jsonl",
  redact: true,
}
```

Rules:

- logs go to `Scripts/.logs`;
- default log file is `<action-id>.jsonl`;
- `logging.name` must be a file name only, not a path;
- path separators and `..` are rejected;
- redaction is the expected default.

Good log data:

- item IDs;
- counts;
- kinds;
- text lengths;
- query lengths;
- action stage names;
- status/outcomes.

Avoid logging:

- actual clipboard text;
- full URLs if not necessary;
- secrets;
- API keys;
- tokens;
- raw payloads.

## Runtime Context

The `run(ctx)` function receives:

```ts
type ActionContext = {
  trigger: Trigger;
  shortcut?: string;
  activeItemId?: string;
  currentItemId?: string;
  selectedItemIds: string[];
  view?: {
    query: string;
    visibleItemIds: string[];
    currentIndex?: number;
  };
};
```

Use stable IDs. Prefer `activeItemId` for CopyQ-style current/active item scripts; `currentItemId` is kept as a compatibility alias:

```ts
const itemId = ctx.activeItemId ?? ctx.currentItemId ?? ctx.selectedItemIds[0];
```

Avoid relying on visible row indexes for durable logic. `view.currentIndex` is only a UI convenience.

## Host API

Scripts call the host through the global `copicu` object.

### Selection

```ts
await copicu.activeItem.id();
await copicu.activeItem.get({ content: true });
await copicu.activeItem.updateMetadata({ notes: "Reviewed" });
await copicu.activeItem.copy();
await copicu.activeItem.paste();
await copicu.activeItem.promote();

await copicu.selection.ids();
await copicu.selection.current({ content: true });
await copicu.selection.items({ content: true });
await copicu.selection.set(["123", "124"]);
```

`activeItem` is the CopyQ-style current item API. `selection.current()` remains as a compatibility alias.

Use `{ content: true }` only when the script needs text content. This helps keep requests smaller and privacy boundaries clearer.

### History

```ts
await copicu.history.search("kind:text #todo", {
  limit: 20,
  content: false,
});

await copicu.history.get("123", {
  content: true,
});

await copicu.history.update("123", {
  title: "Ticket summary",
  tags: ["#todo", "#work"],
  notes: "Reviewed by script",
  marked: true,
});

await copicu.history.remove("123");
await copicu.history.promote("123");
await copicu.history.move("123", { position: "top" });
```

`history.search()` reuses the picker query syntax. It does not change the visible picker query.

`history.promote(id)` is shorthand for `history.move(id, { position: "top" })`.

`history.update()` can update:

- `text`
- `title`
- `notes`
- `tags`
- `marked`

When a script only changes `marked`, Copicu uses the native mark/unmark path and does not edit the clip content.

`history.remove()` deletes one history item by stable ID and removes its blobs when present. Use it only for explicit cleanup workflows.

### Clipboard

```ts
const currentClipboard = await copicu.clipboard.read();
await copicu.clipboard.writeText("Synthetic output");
await copicu.clipboard.writeItem("123");
```

`clipboard.read()` currently returns text when available:

```ts
{ text?: string }
```

Clipboard writes go through host behavior such as self-write suppression, so scripts do not accidentally recapture their own output as new history.

### Picker

```ts
await copicu.commands.run("picker.open", {
  query: "tag:context",
  rememberPrevious: true,
  focus: "search",
});

await copicu.picker.open({
  query: "tag:context",
  rememberPrevious: true,
  focus: "search",
});
await copicu.picker.filter("kind:text #todo");
await copicu.picker.show();
await copicu.picker.hide();
```

Use `picker.open()` when a script should show Copicu and optionally apply a query, especially from `globalShortcut` where there is no focused picker UI to receive deferred effects. `rememberPrevious: true` preserves the external app as the target for later paste-to-previous-window flows.

Use `commands.run("picker.open", params)` when building small reusable wrappers for hotkeys, saved filters, or script routes. Host commands are allowlisted; the current command set only includes `picker.open`. Declare both `commands:run` and the concrete command capability, such as `picker:open`.

Filtered tag shortcuts are scripts, not Settings > Tags fields. The examples `020-open-tag-filtered.ts` through `024-open-prompt-filtered.ts` show wrappers for `tag:context`, `tag:work`, combined tag/kind filters, marked tag filters, and a free-form `#prompt` query. These scripts open and filter the picker only; they do not activate, copy, or paste an item automatically.

Use `picker.filter()` when the picker is already open and the desired effect is only changing what the user sees.

To activate an item using Copicu's normal copy/mark/hide/focus/paste behavior:

```ts
await copicu.picker.activate("123", {
  copy: true,
  markUsed: true,
  hidePicker: false,
  focusPrevious: false,
  paste: false,
  pasteShortcut: "default",
});
```

Paste to previous window:

```ts
await copicu.picker.activate("123", {
  copy: true,
  markUsed: true,
  hidePicker: true,
  focusPrevious: true,
  paste: true,
  pasteShortcut: "default",
});
```

### Previous Window And Input

```ts
await copicu.window.rememberPrevious();
await copicu.window.focusPrevious();
await copicu.input.paste({ shortcut: "default" });
```

Paste shortcuts:

- `default`: target-aware; browsers use `Ctrl+V`, plain editors generally use `Shift+Insert`.
- `shiftInsert`
- `ctrlV`

### UI

```ts
await copicu.ui.toast({
  title: "Done",
  message: "Action finished.",
  tone: "success",
  durationMs: 3000,
});
```

`ui.toast` is intended for in-app feedback while Copicu UI is visible.

Toast tones:

- `info`
- `success`
- `warning`
- `danger`

For background automation such as `clipboardChange`, prefer native OS notifications:

```ts
await copicu.ui.notify({
  title: "Copicu",
  body: "Background action finished.",
});
```

Interactive prompts use Copicu's `ui-host` window and resolve while the script is running:

```ts
const confirmed = await copicu.ui.confirm({
  title: "Apply metadata",
  message: "Update selected items?",
  confirmLabel: "Apply",
});

const tag = await copicu.ui.input({
  title: "Tag selected items",
  message: "Use a short tag.",
  placeholder: "#todo",
});

await copicu.ui.alert({
  title: "Done",
  message: "The script finished.",
});
```

`ui.confirm` returns `boolean`. `ui.input` returns `string | null`. `ui.alert` waits until the user acknowledges the prompt.

Generated Markdown reports should use the output window:

```ts
await copicu.ui.markdownOutput({
  title: "Clipboard summary",
  summary: "Generated from 5 recent text clips",
  source: "my.summaryScript",
  suggestedFileName: "clipboard-summary",
  markdown: "# Clipboard summary\n\n- First finding\n- Second finding",
});
```

The output window renders Markdown and lets the user copy Markdown, add it as a history item, or export a `.md` file under `Documents/Copicu/Exports`. This does not give scripts raw filesystem access.

### Logs

```ts
await copicu.log.info("metadata updated", {
  itemId,
  tagCount: nextTags.length,
});
```

Console methods are captured too:

```ts
console.log("debug detail", { selectedCount: ctx.selectedItemIds.length });
```

Prefer `copicu.log.*` for structured script diagnostics.

## Examples

### 1. Item Menu: Tag Selected Clip

```ts
/// <reference path="./copicu-action.d.ts" />

function uniqueTags(tags: string[], nextTag: string) {
  return Array.from(new Set([...tags, nextTag]));
}

export default defineAction({
  id: "examples.tagSelectedTodo",
  title: "Tag selected as todo",
  description: "Adds #todo to the selected text clip.",
  triggers: ["itemMenu"],
  input: {
    source: "pickerSelection",
    selection: "one",
    kinds: ["text"],
  },
  capabilities: ["history:read-content", "history:write-metadata", "ui:toast", "log:write"],
  logging: {
    name: "tag-selected-todo.jsonl",
  },
  async run(ctx) {
    const itemId = ctx.activeItemId ?? ctx.currentItemId ?? ctx.selectedItemIds[0];
    const item = await copicu.history.get(itemId, { content: true });
    const tags = uniqueTags(item.tags ?? [], "#todo");

    await copicu.history.update(item.id, {
      title: item.title || "Todo clip",
      tags,
      notes: [item.notes?.trim(), "Tagged by Copicu script"].filter(Boolean).join("\n"),
    });

    await copicu.log.info("tagged selected item", {
      itemId: item.id,
      tagCount: tags.length,
      textLength: item.text?.length ?? 0,
    });

    await copicu.ui.toast({
      title: "Tagged",
      message: "Selected clip was tagged as #todo.",
      tone: "success",
    });
  },
});
```

### 2. Command Palette: Search And Copy Count

```ts
/// <reference path="./copicu-action.d.ts" />

export default defineAction({
  id: "examples.countTodoClips",
  title: "Count todo clips",
  description: "Searches #todo text clips and copies a count summary.",
  triggers: ["commandPalette"],
  input: {
    source: "historySearch",
    selection: "none",
    kinds: ["text"],
    query: "kind:text #todo",
  },
  capabilities: ["history:search", "clipboard:write", "ui:toast", "log:write"],
  async run() {
    const matches = await copicu.history.search("kind:text #todo", {
      limit: 50,
      content: false,
    });

    await copicu.clipboard.writeText(`Copicu found ${matches.length} todo clip(s).`);
    await copicu.log.info("todo search complete", {
      count: matches.length,
      itemIds: matches.map((item) => item.id),
    });

    await copicu.ui.toast({
      title: "Search complete",
      message: `${matches.length} todo clip(s) found.`,
      tone: "info",
    });
  },
});
```

### 3. Command Palette: Filter Picker

```ts
/// <reference path="./copicu-action.d.ts" />

export default defineAction({
  id: "examples.filterText",
  title: "Filter text clips",
  description: "Filters the picker to text clips.",
  triggers: ["commandPalette"],
  input: {
    source: "none",
    selection: "none",
  },
  capabilities: ["picker:filter", "ui:toast", "log:write"],
  async run() {
    await copicu.picker.filter("kind:text");
    await copicu.log.info("picker filter applied", { queryLength: "kind:text".length });
    await copicu.ui.toast("Filtered to text clips.");
  },
});
```

### 4. Item Menu: Copy Without Hiding

```ts
/// <reference path="./copicu-action.d.ts" />

export default defineAction({
  id: "examples.copyCurrentNoHide",
  title: "Copy current without hiding",
  description: "Copies and marks the selected item without hiding the picker.",
  triggers: ["itemMenu"],
  input: {
    source: "pickerSelection",
    selection: "one",
  },
  capabilities: ["picker:activate", "ui:toast", "log:write"],
  async run(ctx) {
    const itemId = ctx.activeItemId ?? ctx.currentItemId ?? ctx.selectedItemIds[0];

    await copicu.picker.activate(itemId, {
      copy: true,
      markUsed: true,
      hidePicker: false,
      focusPrevious: false,
      paste: false,
      pasteShortcut: "default",
    });

    await copicu.log.info("copied item without hiding picker", { itemId });
    await copicu.ui.toast({
      message: "Item copied.",
      tone: "success",
    });
  },
});
```

## Validation

Typecheck one script:

```powershell
npx tsc --ignoreConfig --noEmit --target ES2022 --module ESNext --moduleResolution Bundler --strict "$env:USERPROFILE\Documents\Copicu\Scripts\my-script.ts"
```

Typecheck repo examples:

```powershell
$files = Get-ChildItem scripts/examples -Filter *.ts | ForEach-Object { $_.FullName }
npx tsc --ignoreConfig --noEmit --target ES2022 --module ESNext --moduleResolution Bundler --strict @files
```

Run a synthetic mock example from the repo:

```powershell
npm run scripts:run-example -- "$env:USERPROFILE\Documents\Copicu\Scripts\001-toast-hello.ts"
```

The mock runner is useful for smoke testing script shape and logs. It is not the same as the real Copicu host.

When changing Copicu's scripting engine, also run:

```powershell
npm run build
npm run visual:check
npm run rust:test
```

## What Is Not Ready Yet

These are planned or future-facing:

- tray/CLI triggers;
- rich multi-format clipboard writes;
- sandboxed third-party plugins;
- plugin marketplace.

## Asking An Agent To Create A Script

Good prompts:

```text
Create a Copicu item-menu script that tags the selected text clip as #todo.
```

```text
Create a Copicu command-palette script that searches recent text clips tagged #work and copies a count summary.
```

```text
Create a script that filters the picker to text clips containing URLs.
```

```text
Create a script that copies the selected item, keeps the picker open, and logs the item ID.
```

Best prompts include:

- where the script should run: item menu or command palette;
- what input it needs: no selection, one item, or many items;
- what it should change: clipboard, metadata, visible filter, paste target;
- what feedback it should show: toast, log, or both.

If the request is ambiguous, the agent should choose a conservative default and avoid destructive behavior.
