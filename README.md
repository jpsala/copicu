# Copicu

**Copicu is a local-first, scriptable clipboard manager for Windows power users.**

It turns clipboard history into working memory: search it, preview it, organize it in folders, keep a marked working set across searches, run local actions, and paste useful fragments back into the app you came from.

Copicu is Windows-first today. It is inspired by advanced clipboard tools like CopyQ, but it is not a CopyQ-compatible clone and does not try to run CopyQ scripts.

## Demo

The v0.5.1 picker, rendered by the actual React UI with synthetic mocked data. These screenshots do not demonstrate native capture or paste.

Resizable folder tree with a scoped preview feed:

![Copicu picker with a resized folder tree and scoped previews](docs/assets/screenshots/picker-folders-v0.5.1.png)

Folder actions anchored below their button:

![Copicu folder actions beside the Projects folder](docs/assets/screenshots/picker-folder-menu-v0.5.1.png)

Persistent marks, with global actions distinguished from loaded results:

![Copicu marked menu showing five global marks and two in loaded results](docs/assets/screenshots/picker-marked-scope-v0.5.1.png)

Earlier generated workflow illustration (not refreshed for v0.5.1), showing search, expansion, inline editing, and save:

![Copicu synthetic picker demo](docs/assets/gifs/copicu-synthetic-picker-demo.gif)

Static poster: [docs/assets/screenshots/copicu-synthetic-picker-demo-poster.png](docs/assets/screenshots/copicu-synthetic-picker-demo-poster.png)  
Video: [docs/assets/videos/copicu-synthetic-picker-demo.mp4](docs/assets/videos/copicu-synthetic-picker-demo.mp4)

All public demo assets use synthetic data; no maintainer clipboard history is included.

## Install The Windows Alpha

1. Download the latest Windows installer from [GitHub Releases](https://github.com/jpsala/copicu/releases).
2. Run the `Copicu_*_x64-setup.exe` installer.
3. Open Copicu, copy a few non-sensitive test clips, then use the picker to search, copy, edit, tag, or paste them.

Current release:

- [v0.5.3](https://github.com/jpsala/copicu/releases/tag/v0.5.3)
- Asset: `Copicu_0.5.3_x64-setup.exe`
- Windows x64 NSIS installer
- SHA256: `07C1404083F39219795791F0434A3E1F09F8AE0E3341EBD59722D3449AEA427F`

Browser sign-in, device approval and encrypted recovery for shared clipboards. Sharing requires the private HTTPS service.

Copicu is used daily by its maintainer, but it is still alpha software. Windows may show SmartScreen or Defender warnings for a young/unsigned desktop app that monitors clipboard and keyboard shortcuts. Verify downloads from GitHub Releases and the published SHA256.

Verify a downloaded installer from PowerShell:

```powershell
Get-FileHash .\Copicu_*_x64-setup.exe -Algorithm SHA256
Get-AuthenticodeSignature .\Copicu_*_x64-setup.exe
```

The hash must match the value above. Until Authenticode signing is enabled, `Get-AuthenticodeSignature` is expected to report `NotSigned`; the Tauri updater manifest remains cryptographically signed separately.

## Why Use It?

Power users copy useful fragments all day:

- code snippets and terminal commands;
- URLs, research links, prompts, and partial answers;
- error messages, stack traces, and logs;
- Markdown fragments, chat drafts, and notes;
- screenshots and image-only clipboard items;
- text that needs cleanup, tagging, formatting, or reuse.

Most clipboard managers help you remember those fragments. Copicu is meant to help you **do something with them**.

The long-term direction:

> Search your clipboard like a history, organize it like a workspace, automate it like a tool, and command it like an assistant.

## What It Can Do Today

Copicu is early-stage, but the core is functional:

- capture clipboard history for text;
- capture image-only clipboard items as normalized PNG blobs;
- store history and metadata locally with SQLite;
- store image/blob payloads outside SQLite;
- deduplicate content by hash;
- open a compact searchable picker with a collapsible, resizable folder tree and saved width;
- browse All history, unfiled Root (`/`), or the direct clips in a folder, and search within that scope;
- explicitly arm a folder as the capture destination, move clips by menu or drag, and manage nested folders;
- keep persistent marks across searches and restarts, separate from temporary batch selection;
- navigate primarily with the keyboard;
- search plain text or scoped fields like `meta:`, `title:`, `notes:`, `ctx:`, `tag:`, `kind:`, and `is:marked`;
- save the current search as a named **Saved search**;
- create independent **Capture modes** that remember their query and apply optional tags or structured metadata to new captures while active;
- open saved searches and switch or stop capture modes from **Organize** in the picker menu;
- choose whether search runs in realtime, on Enter, or only from the Search button;
- copy the selected item;
- paste the selected item into the previous Windows app;
- globally cycle and copy older/newer history items with `Ctrl+Shift+Up` / `Ctrl+Shift+Down`;
- edit item content and metadata;
- add titles, tags, notes, and MIME hints;
- edit tags from the picker with built-in `Ctrl+Shift+C`, using keyboard autocomplete and additive batch tagging;
- open tag-filtered picker routes;
- run built-in actions and trusted local TypeScript/JavaScript scripts;
- use a command palette and local/global shortcut routes;
- optionally use AI-assisted search/actions and a standalone conversational assistant when configured by the user;
- show Markdown output windows for generated summaries, reports, drafts, or script results.

### New In v0.5.3

The [v0.5.3 release notes](docs/releases/v0.5.3.md) cover browser sign-in,
device approval and encrypted recovery for shared plain-text clipboards.
In Settings → Sharing, enter your private HTTPS service URL and sign in on each
PC with the same account. Compare the complete device fingerprint and approve
the second PC from the first. The [service guide](scripts/shared-clipboard/README.md)
describes operator setup; local tests do not establish two-PC acceptance.

From a folder or All history, use **Connect shared clipboard** to select or
create a resource and choose sending, receiving or both. Sharing requires
account linking and explicit connections. Sending and receiving pause independently;
opening shared history does not import clips or write the Windows clipboard.
See the [user guide](docs/user/README.md#shared-clipboards-in-v053)
for the sharing workflow.

## Core Flows

### 1. Search, Filter, And Paste

Open the picker, type a few characters, select a previous clip, then copy it or paste it into the app you were using before opening Copicu.

Useful query examples:

- `meta:client` searches visible editable metadata: title, notes, and tags.
- `title:invoice` searches the editable item title.
- `notes:followup -meta:draft` combines scoped and negated filters.
- `ctx:vivaldi` searches hidden capture context such as source app/window/URL metadata.
- `window:pull request` searches captured source window titles. `title:` is reserved for the editable item title.

The picker can filter while typing, wait for Enter, or wait for the Search button. `Ctrl+Enter` runs the current query in any mode. Plain text always uses local deterministic search; prefix a request with `ai:` to send it to the optional assistant, which can apply a deterministic picker filter. `re:` starts a local case-insensitive regex query (not combinable with other query filters); Find searches within the applied results.

Paste-to-previous-window is intentionally Windows-first and depends on native focus behavior, target app timing, and paste shortcuts. Please report target-specific failures with synthetic reproduction data.

### 2. Organize Clipboard Working Memory

Copicu clips can carry structured metadata:

- title;
- tags;
- notes;
- MIME hints;
- generated or edited content.

Visible metadata is user-editable and searchable with `meta:`, `title:`, and `notes:`. Capture context is separate: Copicu may store hidden source information such as app, window, URL/domain, and clipboard format hints so `ctx:`/`window:` searches can find where a clip came from without mixing that provenance into your editable title or notes.

This makes the clipboard useful for recurring snippets, links, prompts, code, screenshots, and temporary project notes instead of being just a flat list.

**Selection and marks:** Ctrl/Shift and row checkboxes build the same temporary selection, cleared when applying another search or hiding the picker. Flags build a persistent marked working set across searches and restarts. Add or remove selected clips from marks in the selection menu; the flag menu shows the global total, marks in loaded results and the scope of global batch actions. Clearing marks does not delete clips. Marked clips are protected from automatic retention, but can still be explicitly deleted.

**Folders:** All history searches everywhere; `/` shows unfiled clips; each folder shows only its direct clips, not its descendants. Changing folders preserves the applied filter but clears temporary selection. `Ctrl+B` toggles the tree and `Ctrl+P` switches by full folder path. You can also search `folder:"Projects/Notes"` or `folder:/` from All history.

Browsing a folder does not route new captures there. Use **Arm folder** explicitly; changing folders disarms it, hiding/reopening preserves it, and restarting returns the destination to Root. Duplicate captures keep their existing location. Move a clip or selected group by its menu or drag to a folder/Root; drops move immediately. All history is not a destination.

Deleting a folder always opens a confirmation with exact counts and independent choices for direct clips and subfolders. Retaining clips moves them to Root; retaining subfolders reparents them without flattening their contents. Foldered, Inbox and marked clips are protected from automatic retention. Moving an otherwise unprotected clip to Root makes it eligible for the next pruning pass. Explicit clip deletion can still delete protected clips and is not an undo workflow.

**Saved searches** (formerly Saved Views) and **Capture modes** (formerly Scenarios) serve different workflows under **picker menu → Organize**:

- A Saved search is a passive named filter. Saving a query does not change future captures.
- A Capture mode is an active work session with its own query and optional tags or structured metadata for new captures until switched or stopped. It does not select a folder destination.
- They remain independent of folders, marks and each other.

### 3. Optional Assistant And Metadata

`F2` opens the unified content and metadata editor; save commits both together. `Shift+F2` opens metadata-only editing, including explicit batch operations for mixed selections. Capture context stays separate and read-only rather than becoming your editable title or notes.

v0.5.2 uses the same searchable folder tree in metadata, the content
editor, new clips and move dialogs. Filtering keeps matching ancestors visible;
inline folder creation is prepared until Save or Move, together with the clip
changes. Cancel leaves no new folders, and a move preserves each clip's tags.

`Ctrl+I` or an `ai:` request opens the standalone assistant with picker context. The assistant is a prototype for conversation, local history/image search, read-only SQL and product operations such as metadata edits, creation, export and trusted scripts. **YOLO is its default mode and skips per-operation approval; switch to Confirm to review exact write/export/execution arguments.** It does not run in idle and has no universal undo. Deterministic search remains local; optional AI requests use your configured provider. Review selected-content disclosure before sending. Richer automation and an Explorer-style history table remain proposed, not implemented.

### 4. Run Local Actions And Scripts

Copicu has a shared concept called an **Action**. Actions can be built in or provided by local TypeScript/JavaScript scripts.

Example workflows:

- clean tracking parameters from URLs;
- format JSON before pasting;
- normalize whitespace;
- join selected clips into Markdown;
- extract URLs from selected clips;
- tag selected clips;
- paste transformed content into the previous app;
- create a Markdown summary from selected items.

The repo already includes runnable showcase examples under [scripts/examples/](scripts/examples/). Copy them to your Copicu scripts folder, refresh diagnostics in Settings, then run them from the item menu, command palette, or local shortcuts while the picker is focused:

- [clean URL tracking parameters](scripts/examples/028-clean-url-tracking-copy.ts) — `Ctrl+Alt+U`;
- [format selected JSON](scripts/examples/029-format-json-copy.ts) — `Ctrl+Alt+F`;
- [normalize whitespace and copy](scripts/examples/010-normalize-whitespace-copy.ts) — `Ctrl+Alt+N`;
- [extract URLs from selected text](scripts/examples/030-extract-urls-copy.ts) — `Ctrl+Alt+L`;
- [join selected clips as Markdown](scripts/examples/031-join-selected-markdown-copy.ts) — `Ctrl+Alt+M`.

The Windows installer seeds only **Extract URLs** (`030`) and **Join Selected as Markdown** (`031`) into the default scripts folder, and only when those files are missing. Existing or customized scripts are never overwritten. The other files remain development examples and API fixtures in the repository.

Press `Ctrl+Alt+Q` in the picker to open **Quick Actions**, a context-aware action picker that shows runnable scripts/actions for the current selection so you do not need to memorize every shortcut.

Scripts are trusted local automation, not a secure sandbox or marketplace. Treat scripts like code you choose to run on your own machine.

Read the scripting guide: [docs/user/scripts.md](docs/user/scripts.md)

## Privacy Model

Clipboard history is sensitive. Copicu is local-first by design:

- clipboard history metadata lives in local SQLite;
- image and blob payloads live in local files;
- scripts are local files;
- examples, screenshots, tests, and issues should use synthetic data;
- real clipboard dumps, local databases, `.env` files, secrets, and private logs should never be committed.

AI features are optional and disabled by default. Sending an assistant turn contacts your configured provider; tools may supply clipboard text, images or search results as part of that conversation. Local deterministic search does not contact a provider. Review disclosure and scope before sending, and use Confirm mode when you need per-operation approval; the assistant defaults to YOLO. Conversation history is stored locally and can contain sensitive content.

Use [.env.example](.env.example) if you want to test OpenAI-compatible providers locally.

## How It Compares

This table is intentionally conservative. Copicu is much younger than the established tools.

| Area | Copicu | CopyQ | Ditto | PasteBar |
| --- | --- | --- | --- | --- |
| Primary focus today | Windows-first local clipboard working memory | Mature cross-platform power-user clipboard manager | Mature Windows clipboard history | Modern organized clipboard manager |
| Maturity | Alpha, active development | Mature | Mature | More mature than Copicu |
| Storage model | Local SQLite metadata + local blob files | Local app storage | Local database | Local app storage |
| Keyboard-first picker | Core product surface | Supported | Supported | Supported |
| Paste to previous Windows app | Core Windows flow, still being hardened | Supported via mature app behavior | Supported | Supported |
| Metadata | Titles, tags, notes, MIME hints | Rich item organization | Simpler history model | Collections/organization |
| Scripting/actions | Trusted local TS/JS actions and host APIs | Powerful CopyQ scripting | Limited/plugin-oriented | App-specific automation/features |
| AI | Optional, disabled by default, explicit selected-content actions | Not the core pitch | Not the core pitch | Depends on app features |
| Compatibility stance | Inspired by CopyQ, not script-compatible | Canonical CopyQ behavior | Ditto ecosystem | PasteBar ecosystem |

If you already love CopyQ or Ditto, you may not need Copicu. Copicu is for people who want a modern Windows-first clipboard tool with structured metadata, local scripts/actions, and a privacy-aware path toward optional AI operations.

## Large Histories

Copicu is designed so the picker does not become a giant React DOM list.

The current architecture uses SQLite for local history/metadata and paginated queries, while `@tanstack/react-virtual` renders only visible rows plus a small overscan buffer.

This is a design direction, not an unlimited-history benchmark claim. Storage size, indexes, blob payloads, thumbnails, retention policy, preview generation, and query shape still matter. Public benchmarks are planned before making stronger performance claims.

## Current Limitations

Known limitations:

- Windows is the primary tested platform right now.
- APIs, settings, script contracts, search syntax, and UI behavior can still change.
- `title:` means editable item title; captured source window title search uses `window:` or broader context filters.
- Metadata provenance/origin is still evolving; not every captured context field is exposed as an editable property.
- Paste-to-previous-window depends on Windows focus behavior, target apps, timing, and paste shortcuts.
- Scripts are trusted local automation, not a secure sandbox or marketplace.
- AI is optional and disabled by default; selected-content AI actions may send selected clipboard content to the configured provider.
- Rich clipboard formats are still evolving. Text and image-only capture exist, but full HTML/RTF/custom-format fidelity is not a compatibility promise.
- Copicu does not run CopyQ scripts or promise full CopyQ parity.
- Windows code signing and package-manager distribution are still being improved.

Good feedback includes Windows version, target app, install method, Copicu version or commit, exact steps, and synthetic reproduction data.

Please do not paste real clipboard payloads into issues. Reduce examples to synthetic data.

## What To Test And Report

The most useful reports are narrow and reproducible:

- clipboard capture from common Windows apps;
- paste-to-previous-window behavior in specific target apps;
- shortcut, tray, hide/show, and focus behavior;
- picker search, keyboard navigation, and preview readability;
- script/action ideas that would save real daily effort;
- optional AI command mode friction, using only synthetic or non-sensitive clips;
- performance symptoms with large synthetic histories.

Open an issue using the templates in this repo and include synthetic reproduction data whenever possible.

## Roadmap

Near-term priorities:

- stronger paste-to-previous-window validation across target apps;
- continued refinement of applied search explanations and scoped-query usability;
- more built-in actions and sample scripts;
- a stable script/action API;
- richer previews for text, code, URLs, HTML, Markdown, and images;
- continued refinement of folders, persistent marks, tags, Saved searches and Capture modes;
- a proposed task-oriented history manager/Explorer table, separate from the implemented picker folder tree;
- further assistant dogfood and approval-driven workflows;
- public benchmark plan for large histories;
- clearer Windows packaging and distribution;
- cross-platform support only where native behavior can be made reliable.

See also: [docs/tracks/018-public-launch-readiness.md](docs/tracks/018-public-launch-readiness.md)

## Development

Requirements:

- Node.js/npm;
- Rust;
- Tauri 2 prerequisites for your platform;
- WebView2 on Windows.

Common commands:

```powershell
npm install
npm run build
npm run visual:check
npm run rust:test
npm run tauri:dev
```

Build the desktop app:

```powershell
npm run tauri:build
```

AI setup for local development:

```powershell
Copy-Item .env.example .env
# then edit .env and set COPICU_AI_API_KEY
```

Local Windows release helper:

```powershell
npm run release:windows
# Optional: npm run release:windows -- -Bump minor -Notes "Windows installer refresh."
```

## Contributing

Contributions are welcome, especially around:

- clipboard capture reliability;
- Windows focus and paste behavior;
- built-in actions and script examples;
- rich MIME, HTML, RTF, and image handling;
- picker UX and accessibility;
- search, filtering, tags, and metadata;
- public screenshots/GIFs with synthetic data;
- packaging, release notes, and distribution;
- tests and documentation.

Please read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. Before starting a large feature, open an issue or discussion.

## Documentation

User-facing docs:

- [docs/user/README.md](docs/user/README.md)
- [docs/user/scripts.md](docs/user/scripts.md)
- [v0.5.0 release notes and upgrade guidance](docs/releases/v0.5.0.md)
- [CHANGELOG.md](CHANGELOG.md)

Project and contributor docs:

- [CONTRIBUTING.md](CONTRIBUTING.md)
- [docs/README.md](docs/README.md)
- [docs/PROJECT.md](docs/PROJECT.md)
- [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)

## Name

The name **Copicu** comes from the CopyQ inspiration without claiming compatibility. It is a separate project with its own product direction: local clipboard intelligence, structured metadata, personal automation, and optional AI-assisted actions.
