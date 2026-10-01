# Contributing To Copicu

Thanks for helping improve Copicu.

Copicu is a local-first clipboard workbench built with Tauri 2, Rust, TypeScript, React, and SQLite. It is CopyQ-inspired, not CopyQ-compatible: CopyQ is a strong product reference, but compatibility with CopyQ scripts, internals, or full feature parity is not a project goal by default.

## Current Status

Copicu is an early Windows alpha. APIs, scripts, settings, packaging, and behavior can still change. The best contributions right now are focused, testable improvements to reliability, onboarding, documentation, packaging, picker UX, Windows clipboard/focus behavior, and local automation.

## Privacy Rules

Clipboard content is sensitive. Do not include real clipboard payloads in issues, tests, examples, logs, screenshots, commits, or pull requests.

Use synthetic data such as fake commands, fake URLs, fake notes, fake snippets, and generated images.

Never commit:

- `.env` files or API keys;
- local SQLite databases;
- clipboard dumps;
- blob directories;
- private logs;
- screenshots containing real clipboard content;
- local tool caches such as `.agents/`.

If a bug requires clipboard data to explain, reduce it to a minimal synthetic reproduction.

## Good First Contributions

Useful starter areas:

- documentation fixes;
- Windows installer and release notes polish;
- synthetic screenshot/gif assets;
- issue reproduction scripts using synthetic data;
- picker accessibility checks;
- small built-in actions;
- script examples under `scripts/examples/`;
- tests around query parsing, metadata updates, and script diagnostics.

## Development Setup

Requirements:

- Node.js/npm;
- Rust;
- Tauri 2 prerequisites;
- WebView2 on Windows.

From the repository root:

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

AI features are optional and disabled by default. Use `.env.example` as the template if you want to test them locally. Do not commit `.env`.

## Before Opening A Pull Request

Run the checks that match your change:

```powershell
npm run build
npm run visual:check
npm run rust:test
```

For Rust-only changes, also run:

```powershell
cd src-tauri
cargo check
```

For UI changes, include a short note about the viewports or flows you checked. Use synthetic clipboard items only.

For clipboard, paste, shortcut, tray, or focus changes, describe the Windows apps used for manual validation and avoid pasting real content.

## Large Changes

Before starting a large feature, open an issue or discussion first. Features that affect product direction, native behavior, storage, scripts/actions, AI, privacy, or compatibility expectations should be planned before implementation.

For work with coding agents, start from `AGENTS.md`, then select only the relevant track/topic and sections. Knowledge and decisions with their reasons live in `docs/topics/`; work state and next steps in `docs/tracks/`; larger feature plans in `specs/`. No active global Working Memory or obligatory catalog is required.

## Agentic Tooling In This Repo

Copicu keeps portable project knowledge and local skills under `docs/skills/`. OMP/Pi and host-specific discovery are optional, not requirements of the OS2 documentation core or permission to run UI, publish, install, or modify a contributor's environment. Do not infer installed prompts/extensions from historical references.

The AOS context parser/router was retired. Optional `bun run knowledge -- search "intent"` queries OS2 metadata read-only without another checkout or harness. `bun run check` / `check:ci` validate documentation and run isolated tooling fixtures, not product/UI tests; discovery stays optional and is never repaired by a check. CI has a separate documentation job and preserves the strict release chunk gate. See `docs/README.md` and `docs/tracks/os2-adoption.md` for the manual path, limits and acceptance. Local caches and private agent state remain ignored by `.gitignore`.
