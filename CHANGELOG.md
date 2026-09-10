# Changelog

All notable changes to Copicu are documented here.

## [Unreleased]

### Added

- Edit effective search fields from the picker strip, save them explicitly as the default, or reset the current query to its inherited default without changing Settings.

### Changed

- Scope autocomplete adds fields to the active selection; manually completed `in:` modifiers remain exact. The strip shows effective fields uniformly, and scope-only saves preserve unrelated Settings drafts and current results.

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

[0.4.1-rc.2]: https://github.com/jpsala/copicu/releases/tag/v0.4.1-rc.2
[0.4.1-rc.1]: https://github.com/jpsala/copicu/releases/tag/v0.4.1-rc.1
[0.4.0-rc.6]: https://github.com/jpsala/copicu/releases/tag/v0.4.0-rc.6
[0.4.0-rc.5]: https://github.com/jpsala/copicu/releases/tag/v0.4.0-rc.5
[0.4.0-rc.4]: https://github.com/jpsala/copicu/releases/tag/v0.4.0-rc.4
[0.4.0-rc.3]: https://github.com/jpsala/copicu/releases/tag/v0.4.0-rc.3
[0.4.0-rc.2]: https://github.com/jpsala/copicu/releases/tag/v0.4.0-rc.2
[0.4.0-rc.1]: https://github.com/jpsala/copicu/releases/tag/v0.4.0-rc.1
[0.3.9]: https://github.com/jpsala/copicu/releases/tag/v0.3.9
