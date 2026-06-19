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
- eventually, AI-assisted search and command planning.

## Current Core Features

Copicu currently supports:

- text clipboard capture;
- image-only clipboard capture with PNG blobs and previews;
- SQLite-backed history metadata;
- blob storage for large/image payloads;
- hash-based deduplication;
- move-to-top semantics when old content is copied again;
- searchable history picker;
- keyboard navigation;
- copy selected item;
- paste selected item into the previous window on Windows;
- editing item content and metadata;
- deleting items;
- settings for core behavior;
- built-in actions;
- local trusted TypeScript/JavaScript scripts;
- a Markdown output window for generated summaries, reports, translations, and compiled notes.

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
