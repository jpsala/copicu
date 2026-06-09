# Feature Spec: Hotkeys, WhichKey, Tags

Status: draft

## User Need

As a Copicu user, I want simple hotkeys, compound hotkeys and an optional WhichKey-style helper, so I can trigger picker, tags, scripts and commands from the keyboard without needing every command to be a single global shortcut.

## Primary Flow

1. User assigns `Ctrl+Alt+C, W` to tag `work`.
2. User focuses an input in another application.
3. User presses `Ctrl+Alt+C`.
4. Copicu remembers the previous foreground window and enters a pending compound-hotkey state.
5. If user presses `W` quickly, Copicu opens the main picker filtered by `tag:work`.
6. If user pauses after the prefix, WhichKey may appear and show available next keys.
7. User continues with normal picker workflow:
   - type more text to narrow results;
   - `Enter` copies selected item;
   - `Shift+Enter` copies, focuses previous window and pastes.

## Requirements

- Existing simple hotkeys continue to work.
- Compound hotkeys are modeled independently from WhichKey.
- A compound hotkey can execute without WhichKey becoming visible.
- WhichKey can be assigned to a simple or compound hotkey route.
- WhichKey can also appear automatically after a reveal delay during a pending compound hotkey.
- Hotkeys route to picker, tags, scripts, commands or WhichKey.
- The first global step of a compound hotkey is registered by Rust through `tauri-plugin-global-shortcut`.
- Follow-up keys are captured by Copicu after the global prefix activates Copicu.
- The first implementation must not use permanent global keyboard hooks.
- Tags screen lists known tags derived from existing item metadata.
- Each tag row shows at least label, item count, assigned hotkey/sequence and diagnostic status.
- User can assign, edit and clear a tag hotkey/sequence.
- Completing a tag hotkey/sequence opens/focuses the picker and applies a tag filter.
- Tag hotkey flow must remember previous foreground window so paste-to-previous-window keeps working.
- Conflicts must be diagnosed for:
  - picker global shortcut;
  - another tag shortcut;
  - script global shortcut;
  - WhichKey route conflict;
  - duplicate compound sequence;
  - ambiguous compound sequence;
  - invalid shortcut syntax;
  - registration failure.
- Clipboard payload content must not be logged or included in tests/docs.

## Non-Goals

- Automatic paste on tag hotkey press.
- Capturing all global keystrokes through a low-level hook.
- Full normalized tag migration before the first slice.
- Sync, cloud tags or shared tags.
- Semantic tags or AI-generated tags.
- Full CopyQ tab parity.

## Data Model

Initial durable table for tags:

```sql
CREATE TABLE tag_configs (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  color TEXT,
  hotkey TEXT,
  pinned INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER,
  created_at_unix_ms INTEGER NOT NULL,
  updated_at_unix_ms INTEGER NOT NULL
);
```

Known tags are the union of:

- tags parsed from `clipboard_items.tags`;
- tags present in `tag_configs`.

The first slice can keep item tags as string metadata. Rename/merge can come later or use careful string patching only after tests exist.

## API Sketch

```ts
type ShortcutRoute =
  | { type: "pickerOpen" }
  | { type: "tagOpen"; slug: string }
  | { type: "scriptRun"; actionId: string }
  | { type: "command"; commandId: string }
  | { type: "whichKeyOpen"; prefix: string | null };

type TagSummary = {
  slug: string;
  label: string;
  color: string | null;
  hotkey: string | null;
  pinned: boolean;
  itemCount: number;
  diagnostics: Array<{ severity: "info" | "warning" | "error"; message: string }>;
};

list_tags(): TagSummary[];
update_tag_config(request: UpdateTagConfigRequest): TagSummary;
open_picker_for_tag(slug: string): void;
```

The picker should support an app event similar to:

```ts
{ query: "tag:work", source: "tagHotkey" }
```

## UI

WhichKey:

- compact keyboard-first helper;
- shows possible next keys for the current prefix/context;
- can open automatically by pause or explicitly by route;
- dismisses on Escape, timeout or blur.

Tags UI:

- standalone `tags` window if scope stays clean;
- otherwise a Settings section for first implementation.

Controls:

- search input for tags;
- compact list/table;
- hotkey recorder or validated text input;
- icon actions for open filtered and clear hotkey;
- conflict/status badge.

## Acceptance Criteria

- Parser normalizes simple hotkeys and compound hotkeys.
- Registry detects duplicates and ambiguous sequences.
- A compound hotkey route can execute without WhichKey rendering.
- WhichKey route can be assigned and can render entries for a prefix.
- Automatic WhichKey reveal is controlled by a delay and does not execute clipboard/paste actions.
- With synthetic history items tagged `#work`, `list_tags` returns `work` with correct count.
- Assigning a valid hotkey persists across restart.
- Duplicate tag hotkeys show an error and only one route is registered.
- A hotkey matching the picker shortcut is rejected or shown as error.
- Completing a registered tag hotkey opens Copicu filtered by `tag:<slug>`.
- After opening via tag hotkey, `Shift+Enter` still pastes into the previous external input.
- Build and visual checks pass.

## Open Questions

- What default global prefix should be used for compound hotkeys?
- Should WhichKey be a dedicated window or a command palette mode?
- Should the first tags screen be a standalone `tags` window or a Settings tab?
- Should tags have colors in the first slice or only after normalized tag chips exist?
- Should tag hotkey press toggle/hide if the picker is already open on that tag?
- Should slug normalization support spaces or only `[\p{L}\p{N}_-]+` initially?
