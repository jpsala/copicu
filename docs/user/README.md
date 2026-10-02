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
- a shared folder tree selector for metadata, content editing and clip destinations;
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
- shared text clipboards in v0.5.2, with explicit connections and optional Windows/Action effects;
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

`F2` opens content plus folder, title, notes and tags in one editor; `Ctrl+S` or `Ctrl+Enter` saves them atomically. `Shift+F2` opens metadata-only editing. Batch metadata editing stages explicit changes for mixed selections rather than guessing from placeholders. Capture context is separate, read-only provenance.

The **Folder** field opens a compact tree in metadata, the content editor and new-clip forms. Search by name or path; matching folders keep their ancestors visible. Click a row to select a candidate, then **Choose folder**, `Enter` or double-click to use it in the draft. Disclosure arrows expand or collapse the tree. **/** is a destination; **All history** is a browsing scope, not a destination. `Escape` closes the selector and returns focus to its field.

To prepare a new destination, select its parent and choose **New folder**. Enter a name or a relative nested path such as `Notes/Triage`, then **Create and choose**. The new folders are created only when you save the clip or confirm its move; canceling or undoing the draft creates nothing. An existing path offers **Choose folder** instead of creating a duplicate. The **Move folder** dialog accepts existing destinations and excludes the folder being moved and its descendants.

For mixed selections, leave the Folder field unchanged to retain each clip's location, or choose one destination for all selected clips. **Keep each clip’s tags** is the default; **Edit tags…** exposes explicit additions/removals. Moving clips does not replace their individual tags. **Undo folder change** removes a staged move or creation before saving.

Open **picker menu → Organize** for **Saved searches**, **Capture modes**, Inbox and Tags. A Saved search (formerly Saved View) is a passive query. A Capture mode (formerly Scenario) owns its query and can add configured metadata to new captures until stopped. Neither is a folder, and capture modes do not choose the destination folder.

## Shared Clipboards In v0.5.2

v0.5.2 includes shared plain-text clipboards validated with a local synthetic service and prepared profiles. It does not provide human account linking or a deployed service, and it has not been accepted between two separate PCs. A normal unconfigured profile shows **Sharing is off** in **Settings → Sharing**. **Technical preparation for a local synthetic service** is for controlled local testing.

On a device already linked to that local service:

1. Open a folder's menu and choose **Connect shared clipboard…**, or use **Connect…** beside the browsing scope. Choose **All history** first for a general connection.
2. Search **Find shared clipboard** by name or owner, or select **Create shared clipboard…**. A new clipboard starts private to its owner's devices. **Read only** permits reception; **Awaiting keys** means this device cannot connect yet.
3. Choose **Send**, **Receive** or **Send and receive** under **Direction**, then **Connect clipboard** or **Create and connect**. The initial choice is **Receive**. Receiving saves new texts to the chosen local folder; a general reception saves to Root. Review the displayed destination before confirming.

Without a Send connection, new local copies are not published automatically. Creating a clipboard, opening its catalog or browsing history does not create a connection or enable Windows updates or Actions. A folder connection sends local text that enters that exact folder while sending is enabled, including newly captured/created clips and existing local clips actually moved into it. Its descendants are excluded, and connecting does not send clips already there. Moving a clip to its current folder, editing content/metadata alone or recapturing a duplicate without a new arrival does not publish. Received content remains excluded even when moved into a sending folder.

A general connection uses **Settings → Sharing → General sending scope**: **Only texts without a folder** by default, or **All Copicu**. Changing scope does not send existing content, and moving an existing clip does not add it to the general stream. An independent Send connection on the destination folder can still publish that move. If a general and folder connection match the same clipboard, they do not publish a new arrival twice. Explicit **Send text** or a sharing Action can publish without a folder connection.

Use **Shared** beside the browsing scope, or **Manage shared clipboards** in Settings, to inspect resources. **View available history** reads only retained publications within your authorized range. It does not save clips, update Windows or run Actions. **Copy text** writes a chosen publication to Windows; **Save history to** and **Save in folder** save it locally. Existing local copies keep their folder and metadata. **Include available retained history** is a separate invitation choice; accepting an invitation still requires the owner's **Approve encrypted access** before the device has the needed keys.

Windows updates and reception Actions are off until explicitly enabled in **Settings → Sharing**. **Update Windows clipboard on live arrivals** copies the original text. **Run a local action on live arrivals** chooses an authorized local script; **Allow reception action to update Windows clipboard** is a further opt-in for transformed output. Only one automatic Windows output can be active, so original-text and Action outputs cannot both write. Use **Save channel settings** to apply these changes. Receiving never pastes or focuses another app; recovered or delayed text remains available for manual copy and does not automatically write Windows or run an Action.

**Pause sending** and **Pause reception** operate independently on this device; each clipboard also has its own flow controls. A device pause takes priority. New copies during a sending pause are not queued; previously queued publications remain visible with their original expiry. Resuming reception starts from now, without replaying the paused interval into local clips or automatic effects. Shared text that you receive, save or copy is not automatically sent back.

The Windows tray also offers **Pause shared sending on this device**, **Pause shared reception on this device** and **Resume both directions on this device**. Direction pauses keep the shared catalog updating; **Pause shared clipboard** pauses the entire sharing transport, including catalog updates. **Resume both directions on this device** restores transport and clears the device's direction pauses while retaining individual clipboard pauses.

**Send active Copicu clip** uses the picker’s active clip; **Send Windows clipboard** uses the current Windows text. Their shortcuts are initially **Not assigned** and use the clipboard selected for **Use this channel for Send shortcuts**. A queued publication confirms local admission, not receipt on another device. **Disconnect** removes the local connection while retaining local copies. Access removal leaves an unavailable connection visible for review; it cannot send or receive and does not silently choose another clipboard.

For the implementation contract and local scope, see [Shared Clipboard](../topics/shared-clipboard.md). Images, tags, folder structure and subsequent local edits are not shared by this plain-text feature.

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
