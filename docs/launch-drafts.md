# Launch Drafts

Drafts only. Do not publish yet.

## Show HN

Title:

```text
Show HN: Copicu, a local-first clipboard workbench built with Tauri and Rust
```

Body:

```text
Hi HN, I am building Copicu, a Windows-first local clipboard workbench for people who reuse snippets, links, prompts, code, screenshots, and notes all day.

It is inspired by CopyQ, but it is not a CopyQ-compatible clone. I am using CopyQ as a product baseline and rebuilding the workflow around Tauri 2, Rust, TypeScript, SQLite, a compact keyboard-first picker, structured metadata, local scripts, and optional AI commands.

The current alpha can capture text and image-only clipboard items, persist history locally, search from a picker, copy or paste into the previous Windows app, edit items and metadata, run local TypeScript/JavaScript actions, and produce Markdown output from selected items through optional AI.

The large-history design is intentionally boring: SQLite pagination plus TanStack Virtual, so the picker does not render the entire clipboard history in React. I am not claiming infinite history or benchmarked million-item performance yet.

AI is disabled by default. Scripts are trusted local automation. Clipboard data is sensitive, so tests, examples, and screenshots use synthetic content.

I am looking for feedback on Windows clipboard edge cases, paste-to-previous-window reliability, script workflows, and whether the picker model feels useful.

Repo: https://github.com/jpsala/copicu
Alpha release: https://github.com/jpsala/copicu/releases/tag/v0.1.0-alpha.1
```

## Reddit: r/rust Or r/tauri

```text
I am building Copicu, a Windows-first clipboard manager/workbench with Tauri 2, Rust, TypeScript, React, SQLite, global shortcuts, tray behavior, paste-to-previous-window, virtualized history, local scripts, and optional AI commands.

It is early alpha and CopyQ-inspired, not CopyQ-compatible. The goal is not to clone CopyQ internals or run CopyQ scripts, but to rebuild the power-user clipboard workflow around a small native core and explicit host APIs.

The performance story is SQLite pagination plus TanStack Virtual: the picker does not render thousands of rows in React at once. I am avoiding stronger claims until I have public benchmarks.

I would especially value feedback on native Windows edge cases: clipboard formats, focus restoration, paste targets, tray behavior, and packaging.

Repo: https://github.com/jpsala/copicu
Release: https://github.com/jpsala/copicu/releases/tag/v0.1.0-alpha.1
```

## Reddit: CopyQ / Productivity Audience

```text
I am building Copicu, a local-first clipboard workbench inspired by CopyQ.

Important caveat: it is not CopyQ-compatible. It does not run CopyQ scripts and does not aim for full parity. CopyQ is the product reference; Copicu is a separate Tauri/Rust/TypeScript app focused on a compact keyboard-first picker, SQLite-backed history, structured metadata, trusted local scripts, and optional privacy-aware AI commands.

Current Windows alpha features include searchable history, text and image-only capture, copy/paste-to-previous-window, item editing, tags, local actions/scripts, and Markdown output from selected items.

I am looking for real feedback on clipboard manager workflows: what should be fast, what breaks paste behavior, what scripts are actually useful, and where alpha limitations are painful.

Repo: https://github.com/jpsala/copicu
Release: https://github.com/jpsala/copicu/releases/tag/v0.1.0-alpha.1
```

## Technical Post Outline: Paste-To-Previous-Window

Working title:

```text
Building paste-to-previous-window in a Tauri clipboard manager
```

Outline:

1. Why clipboard managers need more than copy: selecting from history should optionally paste into the app you came from.
2. Constraints on Windows: foreground window tracking, focus timing, shortcuts, browsers vs traditional editors.
3. Copicu's current model: remember previous non-Copicu window, write selected item, hide picker, focus previous, send paste shortcut.
4. Target-aware shortcut rule: browsers use `Ctrl+V`; other targets default to `Shift+Insert`.
5. Reliability caveats: synthetic key injection does not equal physical global shortcut validation; targets differ.
6. Testing approach: Notepad, browser textarea, editor-like WinForms target, synthetic payloads only.
7. Open questions: timing, accessibility, elevated windows, alternate paste commands, cross-platform behavior.

## Technical Post Outline: Clipboard History As Working Memory

Working title:

```text
Clipboard history as working memory, not just a list
```

Outline:

1. Clipboard history is sensitive and useful because it captures real work fragments.
2. Copicu's framing: search, organize, automate, command.
3. Local-first storage: SQLite metadata, blob files for large payloads, retention policies.
4. Large histories: SQLite pagination plus TanStack Virtual, not rendering the full history in React.
5. Actions/scripts: local trusted workflows over selected items.
6. Optional AI: disabled by default, explicit selected-content operations, Markdown output review.
7. Why CopyQ-inspired, not CopyQ-compatible.

