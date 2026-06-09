# GitHub Growth Setup

Operational checklist and fallback commands for initial labels and issues.

## Labels

The default GitHub labels cover `bug`, `documentation`, `enhancement`, `good first issue`, and `help wanted`.

Additional labels for Copicu:

```powershell
gh label create docs --repo jpsala/copicu --color 0075ca --description "Documentation, examples, or onboarding"
gh label create scripts --repo jpsala/copicu --color 5319e7 --description "Local scripts, actions, and automation"
gh label create windows --repo jpsala/copicu --color 1d76db --description "Windows-specific behavior"
gh label create clipboard --repo jpsala/copicu --color fbca04 --description "Clipboard capture, formats, and history"
gh label create privacy --repo jpsala/copicu --color b60205 --description "Privacy, local data, AI boundaries, and sensitive payload handling"
gh label create copyq-inspired --repo jpsala/copicu --color c5def5 --description "Inspired by CopyQ, but not CopyQ-compatible"
gh label create alpha --repo jpsala/copicu --color fef2c0 --description "Current alpha limitation or hardening task"
gh label create assets --repo jpsala/copicu --color 0e8a16 --description "Screenshots, gifs, and public demo assets"
```

## Initial Issues

Use synthetic data only in every issue and reproduction.

Suggested first issues:

1. Create public picker screenshot with synthetic history.
2. Create gif for picker search and copy flow.
3. Create gif for paste-to-previous-window with synthetic text.
4. Document known alpha limitations in release notes.
5. Add a script example that tags selected synthetic clips.
6. Improve Windows paste target reporting in bug reports.
7. Add a public benchmark plan for large histories.
8. Add contributor docs for synthetic clipboard fixtures.

## Fallback Commands

If issues need to be recreated manually:

```powershell
gh issue create --repo jpsala/copicu --title "Create public picker screenshot with synthetic history" --label "assets,docs,good first issue" --body "Create a public screenshot of the picker using only synthetic clipboard items. Do not include real clipboard content, private URLs, logs, .env files, local databases, or blob payloads. Suggested output: docs/assets/screenshots/picker-synthetic-history.png."

gh issue create --repo jpsala/copicu --title "Create gif for picker search and copy flow" --label "assets,docs,good first issue" --body "Record a short gif showing: open picker, search synthetic history, select an item, copy it. Use only synthetic data and keep the gif under 10 seconds. Suggested output: docs/assets/gifs/picker-search-copy.gif."

gh issue create --repo jpsala/copicu --title "Create gif for paste-to-previous-window with synthetic text" --label "assets,windows,clipboard,help wanted" --body "Record or document a short demo of selecting a synthetic item in Copicu and pasting it into a temporary Windows target app. Use synthetic text only. Note target app, Copicu version, and any timing issues."

gh issue create --repo jpsala/copicu --title "Document known alpha limitations in release notes" --label "docs,alpha,good first issue" --body "Improve alpha release notes and README links so new users understand current limitations: Windows-first testing, evolving APIs, local trusted scripts, optional AI, and CopyQ-inspired not CopyQ-compatible positioning."

gh issue create --repo jpsala/copicu --title "Add script example that tags selected synthetic clips" --label "scripts,good first issue" --body "Add or improve a script example that tags selected synthetic clipboard items using explicit capabilities. Include comments explaining the workflow. Do not use real clipboard content."

gh issue create --repo jpsala/copicu --title "Improve Windows paste target reporting in bug reports" --label "windows,clipboard,docs" --body "Improve issue guidance or docs so paste-to-previous-window reports include target app, app type, expected paste shortcut, Copicu version, Windows version, and synthetic reproduction steps."

gh issue create --repo jpsala/copicu --title "Add public benchmark plan for large histories" --label "clipboard,docs,alpha" --body "Draft a benchmark plan for large synthetic histories. The public claim should stay honest: SQLite pagination plus TanStack Virtual means the picker does not render the whole history in React. Do not claim infinite history or million-item performance until measured."

gh issue create --repo jpsala/copicu --title "Add contributor docs for synthetic clipboard fixtures" --label "docs,privacy,good first issue" --body "Document how contributors should create synthetic clipboard fixtures for bugs, visual tests, and demos. Include examples for text, Markdown, SQL, URLs, and generated images. Explicitly forbid real clipboard payloads."
```

