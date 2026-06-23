# Launch Drafts

Drafts only. Do not publish yet.

Current launch angle:

> Copicu is a local-first, scriptable clipboard manager for Windows power users.

Do not lead with AI. AI is optional and disabled by default. Lead with Windows clipboard/focus behavior, search, metadata, local scripts/actions, and privacy.

Current release link for drafts: https://github.com/jpsala/copicu/releases/tag/v0.2.8

## Show HN

Title:

```text
Show HN: Copicu, a local-first scriptable clipboard manager for Windows
```

Body draft, keep under 350 words:

```text
Hi HN, I am building Copicu, a Windows-first local clipboard manager for people who reuse snippets, links, prompts, code, screenshots, notes, logs, and terminal commands all day.

The idea is clipboard history as working memory: search it quickly, preview it, organize it with tags/notes/titles, run local actions over selected items, then copy or paste useful fragments back into the app you came from.

Copicu is built with Tauri 2, Rust, TypeScript/React, and SQLite. It has a compact keyboard-first picker, local text/image history, paste-to-previous-window on Windows, local metadata, and trusted TypeScript/JavaScript actions.

The current alpha is used daily by me, but it is still early. APIs and script contracts can change, rich clipboard formats are still evolving, and Windows focus/paste behavior depends on the target app. I am especially looking for feedback on clipboard edge cases, paste targets, shortcut/tray behavior, and script workflows that would save real daily effort.

Clipboard data is sensitive, so Copicu is local-first. AI features are optional and disabled by default; selected-content actions only send content when explicitly configured and invoked. Tests, screenshots, and issues should use synthetic content.

Repo: https://github.com/jpsala/copicu
Release: https://github.com/jpsala/copicu/releases/tag/v0.2.8
```

First comment notes to prepare:

- Why not just CopyQ/Ditto? Mature tools are great; Copicu explores a Windows-first TS/Rust local-actions model, not compatibility.
- Is it signed? Young/unsigned alpha may trigger SmartScreen; release includes SHA256; code signing/distribution are being evaluated.
- Is clipboard content uploaded? No by default; AI off by default; selected-content actions require explicit configuration/invocation.
- Why Windows-first? Paste-to-previous-window/focus/shortcuts are native-risk areas; harden one platform before pretending cross-platform parity.

## Reddit: r/tauri / r/rust

```text
I am building Copicu, a Windows-first local clipboard manager with Tauri 2, Rust, TypeScript/React, and SQLite.

The product angle is clipboard history as working memory: searchable picker, local text/image history, tags/notes/titles, paste-to-previous-window, and trusted local TypeScript/JavaScript actions over selected clips.

I am not trying to clone CopyQ or run CopyQ scripts. CopyQ/Ditto are mature references; Copicu is an experiment in a smaller Tauri/Rust native core with explicit host APIs for clipboard, picker, metadata, paste, and scripts.

I would especially value technical feedback on Windows clipboard/focus edge cases, Tauri packaging, shortcut/tray behavior, and the action API shape.

Repo: https://github.com/jpsala/copicu
Release: https://github.com/jpsala/copicu/releases/tag/v0.2.8
```

## Reddit: Windows / Productivity Audience

```text
I am building Copicu, an open-source local clipboard manager for Windows power users.

It is for the kind of workflow where you copy code snippets, URLs, commands, prompts, logs, screenshots, and temporary notes all day, then need to find, tag, transform, and paste them again quickly.

Current alpha features include local text/image history, searchable keyboard-first picker, paste-to-previous-window, item editing, tags/notes/titles, and trusted local TypeScript/JavaScript actions. AI is optional and disabled by default.

It is early and Windows-first. I am looking for real feedback on clipboard capture, paste behavior in different apps, shortcut/tray behavior, and what actions/scripts would actually save time.

Repo: https://github.com/jpsala/copicu
Release: https://github.com/jpsala/copicu/releases/tag/v0.2.8
```

## Technical Post Outline: Paste-To-Previous-Window

Working title:

```text
Building paste-to-previous-window in a Tauri clipboard manager
```

Outline:

1. Why clipboard managers need more than copy: selecting from history should optionally paste into the app you came from.
2. Constraints on Windows: foreground window tracking, focus timing, shortcuts, browsers vs traditional editors, elevated windows.
3. Copicu's current model: remember previous non-Copicu window, write selected item, hide picker, focus previous, send paste shortcut.
4. Target-aware shortcut rules and why browsers/editors differ.
5. Reliability caveats: synthetic key injection does not equal physical global shortcut validation; targets differ.
6. Testing approach: Notepad, browser textarea, VS Code/editor, terminal, synthetic payloads only.
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
5. Metadata: titles, tags, notes, MIME hints.
6. Actions/scripts: local trusted workflows over selected items.
7. Optional AI: disabled by default, explicit selected-content operations, Markdown output review.
8. Why CopyQ-inspired, not CopyQ-compatible.

## Code-Level Good First Issues

JP approved creating these public GitHub issues on 2026-06-23.

Created and closed after implementation in `6ed2525`:

- #11 Add sample action to clean URL tracking parameters.
- #12 Add sample action to format selected JSON.
- #13 Add tests for URL tracking cleanup helper.
- #14 Improve scripts/actions empty-state onboarding.
- #15 Add synthetic fixture set for public demos.

Replacement good-first issues created for the contributor funnel:

- #16 Add sample action to extract URLs from selected text.
- #17 Add tests for JSON formatting sample action.
- #18 Add README-ready synthetic picker screenshot.

### Add a sample action that removes URL tracking parameters

GitHub: https://github.com/jpsala/copicu/issues/11

Labels: `good first issue`, `scripts`, `privacy`

Scope:

- Add `scripts/examples/028-clean-url-tracking-copy.ts`.
- Read the active/selected text item.
- Remove common tracking params such as `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`, `fbclid`, `gclid`.
- Copy the cleaned URL to clipboard.
- Log only item ID, input length, output length, and removed parameter count.
- Add the script to `scripts/examples/README.md`.

### Add a sample action that formats JSON

GitHub: https://github.com/jpsala/copicu/issues/12

Labels: `good first issue`, `scripts`

Scope:

- Add `scripts/examples/029-format-json-copy.ts`.
- Read one selected text item.
- Try `JSON.parse`; on success copy pretty JSON with 2-space indentation.
- On failure show a warning toast without logging payload content.
- Add docs entry to `scripts/examples/README.md`.

### Add tests for tracking-param cleanup helper

GitHub: https://github.com/jpsala/copicu/issues/13

Labels: `good first issue`, `privacy`

Scope:

- Extract a pure helper for URL cleanup if needed.
- Add unit tests using synthetic URLs only.
- Include cases for no query string, repeated params, hash fragments, and non-tracking params.

### Improve empty-state copy for scripts

GitHub: https://github.com/jpsala/copicu/issues/14

Labels: `good first issue`, `docs`, `scripts`

Scope:

- Find the scripts/actions empty state in Settings or command palette.
- Add short copy explaining where scripts live and link to `docs/user/scripts.md`.
- Keep wording concise and avoid showing local private paths in screenshots/tests.

### Add a synthetic fixture set for public demos

GitHub: https://github.com/jpsala/copicu/issues/15

Labels: `good first issue`, `assets`, `privacy`

Scope:

- Add a small JSON/Markdown fixture file under `docs/assets/source-data/`.
- Include fake stack traces, fake URLs, fake commands, fake Markdown notes, and fake code snippets.
- No real secrets, usernames, tokens, customer names, or private paths.
