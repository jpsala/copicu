---
id: 002-rich-image-capture-tasks
status: validated
updated: 2026-06-05
---

# Rich Image Capture Tasks

## Research And Model

- [x] Re-check CopyQ image behavior against docs/source.
- [x] Confirm Rust clipboard/image APIs for the first cut.
- [x] Create feature spec before payload implementation.

## Storage

- [x] Add optional image metadata columns.
- [x] Add app-data blob directories for PNG and thumbnails.
- [x] Store relative blob paths in SQLite.
- [ ] Add future `clipboard_item_formats` table when preserving original MIME bytes.

## Capture

- [x] Detect image-only clipboard events from existing probe.
- [x] Read image payload with `clipboard-rs`.
- [x] Normalize to PNG and hash bytes.
- [x] Generate thumbnail PNG.
- [x] Skip binary image when text is present.
- [ ] Add Win32 `CF_DIB`/`CF_DIBV5` fallback if `clipboard-rs` misses common sources.

## Picker And Activation

- [x] Render image previews in the picker from stored PNG blobs.
- [x] Copy selected image item back to clipboard as an image.
- [ ] Add separate full-size preview/detail surface if needed after picker workflow hardens.

## Verification

- [x] `npm run build`
- [x] `npm run visual:check`
- [x] `cd src-tauri; cargo check`
- [x] `npm run rust:test`
- [x] Manual synthetic image capture and copy-back.
- [x] Manual image+text skip behavior.
- [x] Validate image capture with screenshot source.
- [x] Validate image capture with Paint source.
- [x] Validate image capture with browser copy-image source.
- [x] Validate image capture with Snipping Tool source.

## Current Next Cut

- [ ] Keep `npm run image:sources` as regression harness for future image changes.
- [ ] Add Win32 `CF_DIB`/`CF_DIBV5` fallback only if a future source validation exposes a concrete gap.
