# Copicu

**Copicu is a local-first clipboard workbench for search, reuse, automation, and AI-assisted workflows.**

Copicu started as a CopyQ-inspired clipboard manager, but the goal is not to clone CopyQ feature by feature. CopyQ proves that clipboard history, commands, shortcuts, menus, paste workflows, and scripting are useful. Copicu takes that idea and rebuilds it around a smaller native core, a modern keyboard-first UI, structured metadata, local scripts, and a path toward privacy-aware AI commands.

The clipboard is usually treated as a passive list of things you copied. Copicu treats it as working memory: searchable, previewable, editable, taggable, scriptable, and reusable.

## Why Copicu Exists

Power users copy useful fragments all day:

- code snippets;
- URLs and research links;
- prompts and partial answers;
- error messages and stack traces;
- terminal commands;
- Markdown fragments;
- chat and email drafts;
- screenshots;
- temporary notes;
- text that needs to be cleaned, summarized, tagged, transformed, or pasted somewhere else.

Most clipboard managers help you remember those fragments. Copicu is meant to help you **do something with them**.

The long-term direction is simple:

> Search your clipboard like a history, organize it like a workspace, automate it like a tool, and command it like an assistant.

## Inspired By CopyQ, Not A CopyQ Clone

Copicu is strongly inspired by [CopyQ](https://hluk.github.io/CopyQ/). CopyQ is one of the best references for what an advanced clipboard manager can become: history, commands, shortcuts, scripting, menus, tabs, and deep customization.

Copicu is not trying to be CopyQ-compatible. It does not aim to run CopyQ scripts, match CopyQ internals, or promise full feature parity.

Instead, Copicu uses CopyQ as a baseline and explores a different product shape:

- a small native core in Rust;
- a Tauri 2 desktop shell;
- TypeScript/React UI;
- SQLite-backed structured metadata;
- local blob storage for large payloads and images;
- a compact keyboard-first picker;
- explicit host APIs for copy, paste, window focus, search, metadata, and actions;
- trusted local TypeScript/JavaScript scripts;
- AI-assisted search, summaries, and command planning as an action layer.

## What It Can Do Today

Copicu is early-stage, but the core is already functional.

Current capabilities include:

- clipboard history capture for text;
- image-only clipboard capture with normalized PNG blobs;
- SQLite persistence for history and metadata;
- blob storage outside SQLite for image and large payload data;
- hash-based deduplication;
- searchable picker;
- keyboard navigation;
- copy selected item;
- paste selected item into the previous window on Windows;
- target-aware paste shortcuts on Windows;
- item editing;
- item metadata: title, tags, notes, MIME hints;
- tag management and tag-filtered picker routes;
- built-in actions;
- trusted local TypeScript/JavaScript scripts;
- command palette;
- local and global shortcut routes;
- AI-assisted search mode;
- temporary AI-generated script actions;
- Markdown output windows for AI/script-generated summaries, drafts, reports, and compilations.

## The Picker Is The Product

Copicu is designed as a desktop utility, not a web app wrapped in a marketing shell.

The main surface is the picker:

- open it with a shortcut;
- type to search;
- navigate with the keyboard;
- preview content;
- copy or paste the selected item;
- edit content or metadata;
- run actions from item menus or the command palette.

The UI should feel fast, discreet, precise, and useful immediately. Motion and polish are used to clarify state and focus, not to decorate the app.

## Scripts And Actions

Copicu has a shared concept called an **Action**.

An action can be built into the app or defined by a local script. Actions can run from the picker, item menus, command palette, local shortcuts, global shortcuts, clipboard-change triggers, and future surfaces.

Scripts are local TypeScript or JavaScript files. By default, Copicu looks for them in:

```text
Documents/Copicu/Scripts
```

Scripts use `defineAction({...})` metadata to describe:

- id;
- name;
- description;
- triggers;
- input requirements;
- local/global shortcuts;
- capabilities;
- logging behavior.

This makes scripts discoverable before they run. Copicu can show diagnostics, decide when a script is valid, and route it through the same host APIs used by the native UI.

Example script ideas:

- tag the selected clipboard item;
- normalize whitespace and copy the result;
- join selected snippets;
- extract URLs from selected clips;
- filter the picker to a useful query;
- paste a transformed item into the previous app;
- open copied URLs;
- create a Markdown summary from checked items;
- react to clipboard changes;
- build small personal workflows around your clipboard history.

Scripts are currently trusted local automation, not a sandboxed marketplace model. Treat them like code you choose to run on your own machine.

Read the scripting guide: [docs/user/scripts.md](docs/user/scripts.md)

## AI Command Mode

Copicu is not limited to traditional search.

Instead of only typing a keyword like `docker`, `invoice`, or `meeting`, the goal is to let you write intent:

```text
show me the clips about the auth bug
summarize the checked items
tag these as work
find the command I copied yesterday
clean this text and copy the result
turn these snippets into Markdown
extract the URLs from the selected clips
show only long text clips
take the checked items and make a short report
find things that look like error logs
prepare this for pasting into Slack
mark three more items related to this one
```

The idea is not "AI chat bolted onto a clipboard manager." The idea is a local clipboard workspace where natural-language commands can become concrete operations.

A command can become:

- a structured local search;
- a filtered picker view;
- a set of selected or marked items;
- metadata updates;
- tags or notes;
- a text transformation;
- a Markdown output;
- a copied result;
- a temporary script executed through the same action runner as normal scripts.

For example:

```text
take the checked clips and make a concise project summary
```

can become:

1. read only the checked item IDs;
2. fetch the required item content;
3. ask the configured AI provider for Markdown;
4. show the result in a review window;
5. let the user copy it, export it, or add it back to history.

AI in Copicu is meant to use explicit host capabilities. It should not get raw access to SQLite, the filesystem, the shell, native input, or the whole clipboard history by default.

## AI Provider Configuration

AI is disabled by default.

When enabled, Copicu uses an OpenAI-compatible endpoint. Secrets are read from environment variables or a local `.env` file, using fixed names:

```text
COPICU_AI_ENDPOINT=https://openrouter.ai/api/v1
COPICU_AI_MODEL=openai/gpt-4.1-mini
COPICU_AI_API_KEY=your_key_here
```

Use [.env.example](.env.example) as the template. It includes example blocks for OpenRouter, OpenAI, and Groq.

`COPICU_AI_API_KEY` is the fixed secret key name. `COPICU_AI_ENDPOINT` and `COPICU_AI_MODEL` can override Settings when present. Do not commit `.env`.

## Privacy Model

Clipboard history is sensitive.

Copicu is local-first by design:

- history metadata is stored locally in SQLite;
- image and blob payloads are stored locally as files;
- scripts are local files;
- script source code is not stored in SQLite;
- script logs should record IDs, kinds, counts, lengths, and outcomes, not clipboard payloads;
- tests and examples use synthetic data;
- real clipboard dumps, local databases, `.env` files, secrets, and private logs should never be committed.

AI features are designed as explicit actions. Some AI operations, such as simple AI search planning, can work without sending clipboard content. Other operations, such as summarizing selected items, necessarily send selected content to the configured provider and should remain intentional, capability-based, and reviewable.

## Roadmap

The direction is a fast, private, keyboard-first clipboard workbench with:

- richer previews for text, code, URLs, HTML, Markdown, and images;
- robust paste-to-previous-window behavior;
- stronger tags, saved filters, and smart collections;
- more built-in actions;
- a stable script/action API;
- AI-assisted search, tagging, extraction, cleanup, and summaries;
- privacy gates for AI and scripts;
- better packaging and releases;
- cross-platform support where native behavior can be made reliable.

## Status

Copicu is active early-stage software.

It is usable for experimentation and dogfooding, but APIs and behavior are still evolving. The current priority is to keep the native core reliable while growing the product around search, metadata, scripts, and AI-assisted actions.

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

AI setup for local development:

```powershell
Copy-Item .env.example .env
# then edit .env and set COPICU_AI_API_KEY
```

Build the desktop app:

```powershell
npm run tauri:build
```

## Working With Coding Agents

Copicu is intentionally documented for agent-assisted development.

The repository includes an [AGENTS.md](AGENTS.md) file and a layered documentation system under [docs/](docs/). This means a contributor can clone the repo, open it with a coding agent, and give the agent enough project context without replaying the whole history of the project.

Recommended agent bootstrap:

```text
Read AGENTS.md first.
Then read docs/README.md, docs/WORKING_MEMORY.md, docs/PROJECT.md,
docs/ASSISTANT_RULES.md and docs/DEVELOPMENT.md.
For specific work, use docs/TOPICS.md as the router and open only the relevant topic.
```

The goal is to make agents useful without turning every session into archaeology. Durable decisions live in stable docs, live work lives in `docs/active-work/`, feature plans live in `specs/`, and topic-specific context lives in `docs/topics/`.

This helps with:

- preserving product direction across sessions;
- avoiding accidental CopyQ parity creep;
- keeping privacy rules visible;
- giving agents the native-risk map for clipboard, focus, shortcuts, tray, paste, and storage;
- making larger changes start from specs instead of ad hoc edits;
- letting external contributors understand why the app is shaped this way.

There is no separate `CLOG.md` in the current repo. The equivalent "current log" is [docs/WORKING_MEMORY.md](docs/WORKING_MEMORY.md), supported by [docs/active-work/](docs/active-work/) and [docs/TOPICS.md](docs/TOPICS.md).

Local tool caches such as `.agents/` are intentionally not committed. The portable project context is the Markdown documentation that ships with the repo.

## Documentation

User-facing docs:

- [docs/user/README.md](docs/user/README.md)
- [docs/user/scripts.md](docs/user/scripts.md)

Internal project docs:

- [docs/README.md](docs/README.md)
- [docs/PROJECT.md](docs/PROJECT.md)
- [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)
- [docs/TOPICS.md](docs/TOPICS.md)

## Contributing

Contributions are welcome, especially around:

- clipboard capture reliability;
- Windows focus and paste behavior;
- rich MIME, HTML, RTF, and image handling;
- picker UX and accessibility;
- search and filtering;
- tag workflows;
- built-in actions;
- scripting API design;
- AI-assisted workflows;
- privacy and safety boundaries;
- packaging and releases;
- docs, tests, and examples.

Before starting a large feature, open an issue or discussion. Copicu is CopyQ-inspired, but not aiming for full CopyQ parity by default.

## Name

The name **Copicu** comes from the CopyQ inspiration without claiming compatibility. It is a separate project with its own product direction: local clipboard intelligence, structured metadata, personal automation, and AI-assisted workflows.
