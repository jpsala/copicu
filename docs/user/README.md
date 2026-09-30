# Copicu User Guide

Copicu is a local clipboard manager for people who copy, search, reuse, transform, and paste text, code, links, snippets, and images throughout the day.

It is inspired by CopyQ, but it is not a CopyQ clone. CopyQ is the baseline: it proves that clipboard history, commands, menus, paste workflows, and scripting are useful. Copicu takes that idea and rebuilds it around a smaller native core, typed local actions, better search, structured metadata, and a path toward AI-assisted workflows.

## Product Direction

Copicu is designed as a desktop tool, not a web app or a marketing surface.

The main screen should be useful immediately:

- open the picker;
- type to search;
- navigate by keyboard;
- preview content;
- copy or paste the selected item;
- run actions from item menus or the command palette.

The long-term direction is a personal clipboard workbench:

- fast local history;
- rich previews for text, code, URLs, HTML, and images;
- tags, notes, titles, and other structured metadata;
- actions that can transform or route clipboard items;
- scriptable personal automations;
- optional AI-assisted search and a conversational assistant prototype, with further automation still under development.

## Current Core Features

Copicu currently supports:

- text clipboard capture;
- image-only clipboard capture with PNG blobs and previews;
- SQLite-backed history metadata;
- blob storage for large/image payloads;
- hash-based deduplication;
- move-to-top semantics when old content is copied again;
- searchable, virtualized preview-first history picker;
- hierarchical folders with direct-clip feeds, scoped search and an explicit capture destination;
- persistent marks independent of temporary selection;
- Saved searches and Capture modes;
- local deterministic field queries and optional AI-assisted search;
- keyboard navigation;
- copy selected item;
- paste selected item into the previous window on Windows;
- editing item content and metadata;
- deleting items;
- settings for core behavior;
- built-in actions;
- local trusted TypeScript/JavaScript scripts;
- a Markdown output window for generated summaries, reports, translations, and compiled notes.

## Search, Select And Reuse

Open the picker with your configured shortcut. Type a local query, use arrows to choose a clip, then `Enter` to copy and hide or `Shift+Enter` to paste into the previous Windows app (subject to your activation settings). Search can run in realtime, on Enter or by button; `Ctrl+Enter` applies the query in any mode.

Examples: `title:invoice`, `notes:followup`, `tag:work`, `ctx:browser`, `window:review`, `kind:image`, `is:marked`. `title:` searches your editable title; `window:` searches captured source window context. Search and Find operate on the applied folder/filter snapshot, not an unrelated global list.

Ctrl-click, Shift-click and row checkboxes create the same temporary selection. A plain click clears the group; keyboard navigation moves the active clip without removing checks. Applying another search or hiding the transient picker clears selection. Automatic refresh preserves selected clips that still match.

Flags create persistent marks that survive searches, hide/show and restarts. The selection menu has separate **Add** and **Remove** operations for mixed selections. The flag menu shows the global marked total, marks in loaded results and how many are outside those results. Global marked actions can affect clips outside the current filter; **loaded results** means fetched pages, not all matches or just the viewport. Removing marks never deletes clips. Marked clips are protected from automatic retention, not explicit deletion.

## Folders And Capture Destination

- **All history** includes every location. **/** is Root, containing unfiled clips. A folder feed contains only its direct clips, not its descendants. Tree counts describe direct clips independently of the current search.
- `Ctrl+B` toggles the tree; `Ctrl+P` switches by full path. Tree arrows navigate and expand/collapse; `Shift+F10` opens folder actions. Right-click opens actions at the pointer; the dots open them below the button.
- Drag the thin sidebar/feed divider to resize folders. Its width is saved across reopen/restart. With the divider focused, Left/Right adjust 10 px, Shift adjusts 40 px, Home/End reach the limits and Escape cancels an unfinished adjustment. The minimum is 140 px, the maximum is 600 px while reserving 320 px for the feed; the default remains 214 px. Smaller windows temporarily clamp the layout without erasing your preferred width. Narrow windows keep the overlay tree.
- Changing folders keeps your applied filter and any pending query draft, but clears temporary selection. From All history, `folder:"Projects/Notes"` filters an exact path and `folder:/` filters Root. Explicit folder clauses intersect the browsing scope.
- Browsing is not capture routing. Click **Arm folder** to send new captures and manual items to that destination. Changing folders disarms it; hide/show retains it in the running session; restarting returns to Root. Recapturing a duplicate retains its existing folder.
- Move a clip or selection through its menu, or drag to a folder/Root. Dragging a selected row moves the group; dragging another row moves only that clip. Drops move immediately with no confirmation; All history cannot receive drops.
- Create, rename and reparent folders from the tree. Folder deletion always asks separately whether to delete or retain direct clips and descendant folders, with exact counts. Retained direct clips move to Root; retained child folders move to the deleted folder's parent, keeping their contents. If deleting descendants while retaining clips, all subtree clips move to Root. Cancel changes nothing.

Foldered, Inbox and marked clips are protected from automatic retention. Moving an otherwise unprotected clip to Root makes it eligible at the next pruning pass; the menu move dialog warns, but drag/drop is immediate. Individual clip deletion, including `Ctrl+D` or `Shift+Delete`, is explicit and can delete protected clips without confirmation. Do not treat it as reversible.

The folder tree is implemented in the picker. An Explorer-style history table/long-session history manager is only proposed.

## Edit Metadata And Save Workflows

`F2` opens content plus title, notes and tags in one editor; `Ctrl+S` or `Ctrl+Enter` saves them atomically. `Shift+F2` opens metadata-only editing. Batch metadata editing stages explicit changes for mixed selections rather than guessing from placeholders. Capture context is separate, read-only provenance.

Open **picker menu → Organize** for **Saved searches**, **Capture modes**, Inbox and Tags. A Saved search (formerly Saved View) is a passive query. A Capture mode (formerly Scenario) owns its query and can add configured metadata to new captures until stopped. Neither is a folder, and capture modes do not choose the destination folder.

## Optional Assistant

With AI configured, `Ctrl+I` or an `ai:` request opens the standalone conversational assistant with picker context. It is a prototype supporting conversation, history/image reads, read-only SQL and product operations for metadata, creation, export and trusted actions/scripts. **YOLO is the default and skips per-operation approval. Choose Confirm to review exact write/export/execution arguments.** It sends no requests in idle and provides no universal undo. Plain search stays local and deterministic; `re:` starts local case-insensitive regex search, separately from other filters. Further assistant refinement, plugins and an external RPC/CLI are future work.

AI is disabled by default. Sending a turn contacts your provider; tool results may include clipboard text and images. Conversation history persists locally and can contain sensitive content. Review what is being sent and keep sensitive clips out of these requests.

## Privacy Model

Copicu is local-first.

Clipboard history is sensitive. The project follows these rules:

- do not commit local databases, clipboard dumps, `.env` files, or secrets;
- do not put real clipboard payloads in docs, examples, tests, or logs;
- use synthetic text when testing;
- script logs should record counts, IDs, kinds, lengths, and outcomes, not payload text.

Scripts are trusted local files. They are not a sandboxed marketplace model yet. Treat scripts like personal automation code you choose to run on your machine.

## Where Data Lives

The implementation stores:

- normalized history and metadata in SQLite;
- image/blob payloads in app data as files;
- scripts as editable files on disk;
- script diagnostics and action run metadata in SQLite;
- script logs as JSONL files under the scripts folder.

Script source code is not stored in SQLite. This is intentional: scripts should be easy to edit in VS Code, search, diff, back up, and eventually version.

## Actions And Scripts

Copicu uses the term **Action** for anything that can be run from the picker, command palette, shortcuts, future clipboard rules, or future plugins.

Some actions are built into the app. Others are local scripts.

Scripts let users create personal commands like:

- tag the selected clip;
- copy a transformed version of a clip;
- search history and copy a summary;
- filter the picker to a useful query;
- activate an item with explicit copy/paste behavior;
- build small workflows around clipboard history.

Scripts and AI can also open a dedicated Markdown output window for longer generated content. This is useful for reports, summaries, translations, or composed notes that should be reviewed before copying, exporting, pasting, or adding back to history. See [Markdown Output Surface](../topics/markdown-output-surface.md).

For the detailed scripting guide, read [scripts.md](scripts.md).

## AI Provider Configuration

AI is disabled by default. When enabled, Copicu uses an OpenAI-compatible endpoint. You can enter the API key in Settings, or provide credentials from environment variables / the project `.env` file.

Use `.env.example` as the template:

```text
COPICU_AI_ENDPOINT=https://openrouter.ai/api/v1
COPICU_AI_MODEL=openai/gpt-4.1-mini
COPICU_AI_API_KEY=your_key_here
```

OpenRouter, OpenAI and Groq examples are included in that file. `COPICU_AI_API_KEY` is the fixed secret key name and overrides the key saved in Settings when present. `COPICU_AI_ENDPOINT` and `COPICU_AI_MODEL` override Settings when present; otherwise Settings provides endpoint/model. Do not commit `.env`.

## Scripts Folder

By default, Copicu looks for scripts in:

```text
Documents/Copicu/Scripts
```

The setting can be changed in the app under `scripts.folderPath`.

Resolution order for agents or tooling that creates scripts:

1. explicit path from the user;
2. `COPICU_SCRIPTS_DIR`;
3. Copicu Settings `scripts.folderPath`, if discoverable;
4. default `Documents/Copicu/Scripts`.

For a fresh settings file, `COPICU_SCRIPTS_DIR` can override the initial default. Once a user has saved a scripts folder in Settings, that setting is the app's source of truth.

## Built-In Actions

Current built-ins include:

- **Paste plain**: paste selected text as plain text.
- **Join selected**: join selected text items and copy the result.
- **Open URL**: open the first URL found in the selected item.

Built-ins and scripts share the same conceptual action model: explicit trigger, explicit input, declared capabilities, redacted run metadata.

## Development Commands

From the repository root:

```powershell
npm install
npm run build
npm run visual:check
npm run rust:test
npm run tauri:dev
```

`npm run rust:test` is preferred over raw `cargo test` on this machine because it strips Miniconda entries from `PATH` to avoid DLL loader issues.

## Status

Copicu is an active early-stage project. The native core is already functional, but the API and script model are still evolving.

The scripts guide should be updated whenever the Actions/Scripting API changes.
