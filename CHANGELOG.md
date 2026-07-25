# Changelog

All notable changes to Copicu are documented here.

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

[0.3.9]: https://github.com/jpsala/copicu/releases/tag/v0.3.9
