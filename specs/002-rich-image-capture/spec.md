---
id: 002-rich-image-capture
status: validated
updated: 2026-06-05
source: docs/active-work/image-capture-spike.md
---

# Rich Image Capture

## Purpose

Add the first useful image path to Copicu without widening the product into full CopyQ parity.

The feature should capture image-only clipboard content, store a normalized PNG blob, show a safe thumbnail in the picker, and copy the selected image back to the clipboard.

## Direction

Use a MIME-first model, but keep the first implementation PNG-first:

- `content_kind='image'` in the existing history table;
- normalized `image/png` as the primary blob;
- thumbnail PNG as a separate small blob;
- SQLite metadata for MIME, blob paths, byte size, width and height;
- skip binary image capture when text is available in the same clipboard event;
- preserve room for a future `clipboard_item_formats` table with original MIME bytes.

This follows the relevant CopyQ behavior:

- items are MIME maps;
- image display prefers `image/png`, then common image MIME types;
- binary images are skipped when text is available;
- image clone is capped at 4096x4096;
- list thumbnails are limited, while full preview can be separate later.

## Scope

### Included

- Windows-first image capture.
- `clipboard-rs` image read/write for the first payload path.
- SHA-256 hash of normalized PNG bytes for dedupe and self-write suppression.
- Blob store under app data.
- Thumbnail generation at capture time, max 320x240.
- Picker thumbnail rendering.
- Copy selected image item to the clipboard.
- Synthetic-only validation.

### Excluded

- Exact preservation of every source MIME format.
- Animated GIF/WebP fidelity.
- SVG editing or special SVG rendering.
- File-list capture.
- HTML image extraction.
- OCR or AI metadata.
- Full-size preview dock.
- User-facing settings for image limits.

## Limits

Initial hard limits:

- max dimension: 4096px on either axis;
- max normalized PNG size: 25 MiB;
- image+text event: capture text, skip binary image.

These can become settings after validation.

## Success Criteria

1. Copy a synthetic generated image to the clipboard.
2. Copicu records one `image` item with dimensions, byte size, PNG blob and thumbnail blob.
3. Picker shows the image thumbnail without horizontal overflow.
4. Activating the item writes an image back to the clipboard.
5. Self-write suppression prevents recapturing the image activation.
6. Copying rich content with both text and image records text only.

## Implementation State

First cut is implemented:

- `clipboard-rs` reads image-only clipboard payloads.
- normalized PNG bytes are hashed and stored under app data blob paths;
- SQLite stores image MIME, blob path, thumbnail path, dimensions and byte size;
- picker rows render thumbnail data URLs from the backend;
- image activation writes the stored PNG back to the clipboard;
- image self-writes use the same normalized hash suppression path as text.

Validation follow-up:

- common image sources passed with synthetic/non-sensitive content: screenshot, Paint, browser image write from local HTML, and Snipping Tool;
- do not add Win32 `CF_DIB`/`CF_DIBV5` fallback until a future source validation shows a concrete gap.

## Validation Notes

2026-06-05:

- Synthetic 96x64 bitmap copied via Windows clipboard was captured as one `image` item.
- SQLite row stored `image/png`, width, height, byte size, PNG blob path and thumbnail path.
- Activating the image item wrote a 96x64 image back to the clipboard.
- Watcher suppressed the activation self-write.
- Synthetic clipboard data containing both text and image created a text item and no second image item.
- `npm run build`, `npm run visual:check`, `cargo check`, and `npm run rust:test` passed.
- The previous raw `cargo test` startup failure (`STATUS_ENTRYPOINT_NOT_FOUND`) was isolated to API-set DLLs from `C:\Users\jpsal\miniconda3` shadowing system DLL resolution. `tests/manual/run-rust-tests.ps1` removes `miniconda3` entries from `PATH` for the test process.
- `npm run image:sources` passed on screenshot, Paint, browser and Snipping Tool with synthetic images. No Win32 image fallback is needed yet.
