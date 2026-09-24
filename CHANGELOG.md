# Changelog

All notable changes to Copicu are documented here.

## [Unreleased]

## [0.4.23] - 2026-09-24

### Added

- Send `ai:` queries or a `Ctrl+I` multiline prompt from the picker to the
  conversational assistant with the current selection and visible context.
- Let the assistant apply deterministic local picker filters, with renderer
  acknowledgement before reporting success and explicit rejection of invalid
  or superseded queries.

### Fixed

- Keep the initial picker feed in a loading state until its first history
  response, and remove the floating frame entrance animation.
- Reveal the selected history row after keyboard navigation without jumping
  the scroll anchor.
- Match legacy provider keys only to their exact HTTPS host and require a new
  conversation before a changed endpoint can receive previous messages.
- Preserve GPT-OSS/OpenRouter/Groq conversation compatibility by supplying
  missing `reasoning_details` without replacing existing reasoning.


## [0.4.22] - 2026-09-18


### Added

- Add an opt-in standalone conversational assistant with picker context,
  persistent chat, real image input, read-only SQL and composable product tools.
  Open it with Ctrl+Shift+J, the tray or picker menus.
- Add default-on YOLO and optional Confirm execution modes; YOLO skips
  per-operation approval without bypassing SQL, export or automatic-script protections.
  Reject stale approvals and preserve completed effects after cancellation.
- Add `history.create` to the script host API, and let the assistant save and
  execute reusable actions through the existing runner.
- Add a compact provider model/reasoning selector with a persistent assistant
  default, direct sending without a transfer checkbox, and acknowledged picker
  focus for composed results.
- Add `assistant:smoke` for headless verification and `dev:background` for hidden
  native surfaces with clipboard capture disabled.
- Add `Add to Inbox` to each regular item's right-click and overflow menus.


### Fixed

- Apply script content and metadata patches atomically, preserving omitted
  fields and supporting explicit title/notes clearing.
- Preserve ordered provider reasoning state across tool calls and complete
  catalog delivery without forced-exit pipe truncation on Windows.
- Use native metadata search semantics and wait for the new history render
  before acknowledging an assistant-requested active row.
- Refresh the picker after generic assistant history changes instead of
  throwing on an empty event payload.
- Preserve assistant prompt focus after Enter or Send, including send failures,
  without discarding the next draft during streaming.
- Route sensitive clipboard consolidation through local scripts, preserving
  complete values instead of masked substitutes and verifying final counts
  without returning the values to the model.
- Handle regex literals and comments when discovering script manifests, and
  expose supported capability names and traversal ordering in the script SDK.
- Validate script-returned verification reports and stop the assistant turn on
  false checks or malformed reports, without rolling back completed effects.
  Require local read-back checks and whole-pipeline synthetic examples instead
  of treating successful execution as proof of correct content or formatting.
  Clarify ambiguous providers and investigate stored data rather than guessing
  preview behavior or requesting sensitive contents in chat.

## [0.4.21] - 2026-09-17

### Added

- Add an optional delayed image hover zoom with plain hover, Ctrl + hover, and
  Alt + hover activation modes.

### Changed

- Add explicit Small, Medium, and Large picker action sizes, and apply the same
  sizing to the image magnifier.
- Clarify the marked and selected clip menus with counted actions that
  distinguish loaded clips, all matching clips, and the current selection.

### Fixed

- Allow deleting every marked clip, including marks outside the current filter,
  and refresh the global marked count after deletion.
- Put mark or unmark all selected clips before the remaining batch actions so
  the checked-clips workflow stays visible.


## [0.4.20] - 2026-09-16

### Added

- Add Appearance controls for image preview size, item action layout and size,
  collapsed text lines, and selected-item details.

### Changed

- Keep picker image, Markdown, text, metadata and action geometry synchronized
  with the virtualizer across desktop, narrow and pointer-coarse layouts.
- Save and propagate every Appearance change immediately while keeping Save and
  Cancel scoped to the remaining Settings sections.

### Fixed

- Match narrow image estimates to the responsive 148 px cap so deeply
  virtualized image and Markdown rows do not leave transient gaps.
- Reserve compact-row height for 44 px actions, preserve the viewport anchor
  while selected-only details move between rows, and assert the rendered High
  Contrast focus outline rather than only its source token.

## [0.4.19] - 2026-09-16

### Added

- Add accessible Appearance settings for color mode, eight built-in themes,
  Standard/Compact density, a synthetic preview, and live propagation to every
  consumer window.

### Changed

- Restore direct icon-based picker header controls, with a full-width search row in narrow windows.
- Expose persistent marks through a direct header flag and global count, prioritizing marked-item actions and preserving full-history targets while filtering.
- Replace the transient selection bar and master checkbox with a counted header menu before the search field, consolidating batch actions without shifting the feed.
- Keep search fields visible below the picker header, with one compact selector, separate filter chips, and an explicit pending state before applying a search.
- Align flag, Delete, and menu in one right-hand action row, revealed on hover, current item, keyboard focus, and open menus; keep persistent marks visible and previews clear of the action gutter.
- Place search-match evidence before clip metadata while preserving original text and large image previews.
- Add a subtle themed one-pixel perimeter to shared custom window frames, separating them from the desktop without shadows.

### Fixed

- Respect configurable Enter-based shortcuts such as Alt+Enter before normal query submission.
- Avoid a redundant initial search when settings hydrate with unchanged scope defaults, preserving initial error recovery.
- Activate image clips and local Markdown images on double-click like other clips; reserve preview opening for the hover/keyboard magnifier.
- Keep filter lock and clear controls from covering the query text.
- Make marked-item batch actions keyboard-navigable and wait for the complete marked set instead of using a visible-only fallback.
- Preserve explicit checks while moving the current clip with mouse or keyboard; keep query/hide resets and single-item context menus independent from persistent marks.
- Preserve the visual feed anchor across deep virtualized density changes even
  when the original row node unmounts.
- Prevent Settings bootstrap responses from overwriting newer Appearance events.
- Raise High Contrast focus indicators to at least 3:1 non-text contrast.
- Bind Windows releases to Copicu's canonical ignored updater key and password
  instead of accepting an unrelated process-wide signing key.

## [0.4.17] - 2026-09-11

### Added

- Add a resident CodeMirror 6 structured query editor with contextual operator, value, tag, and scope completions.

### Changed

- Keep Tab on native focus traversal, reserve Enter for completion acceptance
  or query application, and expose separate renderer-visible readiness from
  connected/input readiness; preserve final composition text without re-entering
  a composition hold for late `input.compose` transactions after `compositionend`.
- Preserve exact caret ranges and suffixes when accepting completions, and unify
  realtime, Enter, and IME composition search behavior.
- Resolve capture-mode completions from the complete command, including names
  with spaces and the empty search after `> scenario `.
- Keep the query input's standard background without active-line tint, with a
  steady 2 px theme-colored caret, unclipped at the start, and readable placeholder.

## [0.4.14] - 2026-09-10

### Added

- Add a selection-aware metadata inspector shared by single-item, multi-selection, Inbox catalog, script, and manual-create flows.
- Add explicit editable Search scopes with shared autocomplete, included/excluded field feedback, and controls to save or reset the effective default.
- Add structured `client`, `project`, and `activity` properties to manual item creation.

### Changed

- Aggregate normalized tags and properties as `all`, `some`, or `none`, with provenance and exact staged change counts before saving.
- Apply metadata intentions atomically against a frozen selection and snapshot fingerprint; mixed titles and notes now require explicit set, clear, append, or replace operations.
- Keep global tag configuration separate from per-clip membership, and preserve Search query results while changing or saving scope defaults.

### Fixed

- Preserve dirty metadata drafts when conflicting or pending payloads arrive, including at the minimum supported window size.
- Avoid creating metadata suppressions for clips where a removed partial tag or property was already absent.
- Preserve existing source and confidence when adding a tag or property that is already present.

## [0.4.13] - 2026-09-09

### Fixed

- Preserve concurrent metadata and normalized tag relationships when editing content; keep deduplication and tag writes transactional.
- Correct Inbox-aware keyset pagination and refresh retained rows without losing the scroll anchor.
- Move blocking picker work off the UI thread; preserve distinct rapid captures and isolate capture postprocessing.
- Bind paste to a validated external window identity and abort when foreground changes during the delay.
- Block remote clipboard images in feed and full preview, harden dialog/listener lifecycles, and retain keyboard access to feed controls.
- Publish blobs without truncating existing originals, restore missing thumbnails on recapture, and preserve tag relationships when deletion fails.

### Changed

- Future captures and recaptures retain only the clip's three most recent capture events, using timestamp and event ID for stable ordering, without an age limit or distinct-origin quota. Search context is rebuilt transactionally from retained events; content and editable metadata/provenance are preserved. Untouched historical clips are not pruned, but their next recapture applies the limit to their full capture history.

## [0.4.1-rc.2] - 2026-07-28

### Fixed

- Keep the newest clipboard capture first and active when it arrives while the picker is hidden, without replaying the stale pre-close selection.

## [0.4.1-rc.1] - 2026-07-28

### Added

- Add a persistent clipboard-capture toggle in Settings and the tray. Paused capture leaves the watcher alive but skips clipboard reads and history/actions while preserving manual reuse of existing items.
- Add an explicit full-item preview window with configurable `Alt+Enter`, contextual and hover affordances, full-resolution image zoom/pan, safe local Markdown, and complete text rendering.
- Add hover actions for preview, content editing, and deletion without requiring the item to be active.
- Show shortcuts as compact mono keycaps in picker menus, including the configured Settings shortcut; native tray entries use OS accelerators for the picker and Settings and stay synchronized after Settings changes.

### Fixed

- Apply close behavior centrally from each surface lifecycle and reliably hide no-activate Windows surfaces at the native HWND level.
- Keep contextual-menu labels and shortcut badges readable without vertical character wrapping.
- Dismiss exact-match search autocomplete suggestions so applied structured-filter chips remain clickable.

## [0.4.0-rc.6] - 2026-07-27

### Added

- Add an inline clear button to the filter input; clearing also unlocks a persistent filter so it cannot reappear on the next picker opening.

## [0.4.0-rc.5] - 2026-07-27

### Added

- Reserve `Ctrl+D` in the picker as a direct shortcut for deleting the effective item selection, alongside `Shift+Delete`.
- Add a filter lock with an inline lock icon and `Ctrl+Shift+L`; locked queries survive picker hides and app/renderer restarts without changing window pin or keep-open behavior.

## [0.4.0-rc.4] - 2026-07-27

### Fixed

- Preserve each monitor's exact window geometry across mixed-DPI roundtrips by moving hidden windows to the target monitor before applying size, and persist the scale factor with each bounds profile.

## [0.4.0-rc.3] - 2026-07-27

### Added

- Bundle the Extract URLs and Join Selected as Markdown scripts with the Windows installer. They are copied to the default scripts folder only when missing, preserving user-owned versions and files.

### Fixed

- Open persistent auxiliary windows on the active monitor, restore position and size per monitor, and scale default/minimum bounds correctly at 150% and other DPI settings.

## [0.4.0-rc.2] - 2026-07-27

### Fixed

- Make a newly captured clipboard item the active picker item after refresh or on the next picker opening, and prioritize it when `Ctrl+Shift+C` opens metadata before the picker refreshes.
- Show the selected item's content in the metadata utility while keeping keyboard focus in the metadata editor.

## [0.4.0-rc.1] - 2026-07-25

### Release candidate

- Declared the first `0.4.0` release candidate after sustained daily use and successful clean-install, updater, multi-application and external dogfood validation.
- Entered feature freeze for the candidate period; only release-blocking regressions and important bug fixes should land before `0.4.0`.
- Preserved `v0.3.9` as the latest stable release. The RC remains an explicit prerelease and does not replace the stable updater channel.
- The Windows installer remains unsigned by Authenticode; its Tauri updater artifact is signed and its SHA256 is published with the release.

## [0.3.9] - 2026-07-25

### Added

- Added the app-owned global `Ctrl+Shift+C` metadata shortcut, with `Shift+F2` available from the picker.
- Added a compact single-input metadata editor with inline `#tag` parsing and keyboard autocomplete.
- Added atomic persistence for normalized tags and free-form notes while preserving existing titles internally.

### Changed

- Reduced the metadata editor to a focused `480×260` utility window with an auto-growing text input.
- Kept quick tag editing and checked-item batch tagging as separate lightweight picker actions.

### Fixed

- Kept autocomplete inside the native window and scrolled the active suggestion into view during keyboard navigation.
- Made `Enter` and `Tab` commit the highlighted tag and close the autocomplete list.
- Reset autocomplete state whenever the cached metadata window is reopened.
- Made metadata editing target the last item activated with `Enter` after the picker hides and resets.
- Restored reliable initial focus for the metadata input.

[0.4.23]: https://github.com/jpsala/copicu/releases/tag/v0.4.23
[0.4.22]: https://github.com/jpsala/copicu/releases/tag/v0.4.22
[0.4.21]: https://github.com/jpsala/copicu/releases/tag/v0.4.21
[0.4.20]: https://github.com/jpsala/copicu/releases/tag/v0.4.20
[0.4.19]: https://github.com/jpsala/copicu/releases/tag/v0.4.19
[0.4.14]: https://github.com/jpsala/copicu/releases/tag/v0.4.14
[0.4.13]: https://github.com/jpsala/copicu/releases/tag/v0.4.13
[0.4.1-rc.2]: https://github.com/jpsala/copicu/releases/tag/v0.4.1-rc.2
[0.4.1-rc.1]: https://github.com/jpsala/copicu/releases/tag/v0.4.1-rc.1
[0.4.0-rc.6]: https://github.com/jpsala/copicu/releases/tag/v0.4.0-rc.6
[0.4.0-rc.5]: https://github.com/jpsala/copicu/releases/tag/v0.4.0-rc.5
[0.4.0-rc.4]: https://github.com/jpsala/copicu/releases/tag/v0.4.0-rc.4
[0.4.0-rc.3]: https://github.com/jpsala/copicu/releases/tag/v0.4.0-rc.3
[0.4.0-rc.2]: https://github.com/jpsala/copicu/releases/tag/v0.4.0-rc.2
[0.4.0-rc.1]: https://github.com/jpsala/copicu/releases/tag/v0.4.0-rc.1
[0.3.9]: https://github.com/jpsala/copicu/releases/tag/v0.3.9
