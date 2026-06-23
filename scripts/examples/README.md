# Copicu Script Examples

These files are contract examples for the trusted TS/JS runner.

Canonical user scripts folder on this machine:

```text
C:\Users\jpsal\Documents\Copicu\Scripts
```

The examples should live there when testing script discovery. The repo copy under `scripts/examples/` is the versionable source/reference copy.

Copicu can execute ready scripts manually from Settings with the `Run` button when the script declares `devRun` or `commandPalette`. The current real bridge supports:

- `copicu.log.*`;
- `console.*` captured as logs;
- `copicu.ui.toast`;
- `copicu.ui.notify`;
- `copicu.ui.confirm/input`;
- `copicu.selection.*`;
- `copicu.clipboard.writeText/writeItem`;
- `copicu.history.search/get/update`;
- `copicu.enrichment.getResult/runForItem`;
- `copicu.picker.open/filter/activate/show/hide`;
- `copicu.commands.run("picker.open", params)`;
- `copicu.window.rememberPrevious/focusPrevious`;
- `copicu.input.paste`.

The dev mock runner is still useful for fast shape checks and for examples that need APIs not implemented by the real bridge yet, such as URL opening:

```powershell
npm run scripts:run-example -- "$env:USERPROFILE\Documents\Copicu\Scripts\001-toast-hello.ts"
npm run scripts:run-example -- "$env:USERPROFILE\Documents\Copicu\Scripts\005-triage-clipboard-batch.ts"
```

The mock runner provides a synthetic `copicu` API, auto-confirms prompts, writes synthetic clipboard output to stdout, and writes logs to the same `.logs` folder the real runner uses. Override the primary mock item with `COPICU_MOCK_ITEM_TEXT` / `COPICU_MOCK_ITEM_TITLE` when validating transform scripts against specific synthetic input.

Recommended test order:

1. `001-toast-hello.ts`: no selection, toast + default log.
2. `002-copy-current-title.ts`: one selected item, reads metadata and writes clipboard.
3. `003-join-selected-with-log-name.ts`: multi selection, custom log file name.
4. `004-url-open-or-filter.ts`: URL detection, confirm, open URL or filter picker.
5. `005-triage-clipboard-batch.ts`: input, confirm, history search/update, multiple logs and toasts.
6. `006-tag-selected-and-note.ts`: item menu script using real `history.get/update`.
7. `007-search-scripted-text.ts`: command palette script using real `history.search`.
8. `008-filter-long-text.ts`: script using real `picker.filter`.
9. `009-activate-current-copy.ts`: item activation through real `picker.activate` with explicit options.
10. `010-normalize-whitespace-copy.ts`: transforms selected text and writes the result to clipboard.
11. `011-copy-markdown-link.ts`: extracts a URL and writes a Markdown link.
12. `012-copy-todo-summary.ts`: searches history and writes a summary to clipboard.
13. `013-paste-current-to-previous.ts`: uses activation options for paste-to-previous-window.
14. `020-open-tag-filtered.ts`: small hotkey wrapper that calls `commands.run("picker.open", { query: "tag:context" })`.
15. `021-open-work-tag-filtered.ts`: same wrapper pattern for `tag:work`.
16. `022-open-context-text-filtered.ts`: filtered shortcut for `tag:context kind:text`.
17. `023-open-marked-context-filtered.ts`: filtered shortcut for `is:marked tag:context`.
18. `024-open-prompt-filtered.ts`: free-form query wrapper for `#prompt`.
19. `026-inspect-enrichment-active.ts`: inspect deterministic enrichment results for the active text item and optionally apply missing rule tags.
20. `027-toast-path-clipboard-change.ts`: `clipboardChange` script that toasts when the captured text item matches deterministic enrichment detectors, making `autoApply` vs `suggestOnly` visible during dogfood.
21. `028-clean-url-tracking-copy.ts`: removes common tracking parameters from the selected URL and copies the cleaned URL.
22. `029-format-json-copy.ts`: parses the selected text clip as JSON and copies a pretty-printed version.

Logging contract:

- `copicu.log.*` writes structured JSONL by default.
- Default log location is `Scripts/.logs/<action-id>.jsonl`.
- A script may override the file name with `logging.name`.
- The runner should reject path separators in `logging.name`.
- Logs are redacted by default. Payload text should not be written unless the action opts out explicitly in a trusted dev mode.
