# Public Assets Plan

Public screenshots and gifs for Copicu should live under this directory and use only synthetic clipboard data.

Do not include real clipboard content, private URLs, private logs, `.env` files, local databases, blob payloads, or screenshots of private apps.

## Directory Layout

```text
docs/assets/
  screenshots/
  gifs/
  videos/
  source-data/
```

Suggested filenames:

- `screenshots/picker-synthetic-history.png`
- `screenshots/settings-ai-synthetic.png`
- `screenshots/markdown-output-synthetic.png`
- `gifs/picker-search-copy.gif`
- `gifs/paste-to-previous-window.gif`
- `gifs/tag-filter-workflow.gif`
- `gifs/ai-command-markdown-output.gif`
- `videos/copicu-picker-search-paste-real.mp4`
- `videos/copicu-install-first-run.mp4`
- `source-data/synthetic-clips.md`

## Required Assets

- Picker screenshot with synthetic text, code, URL, Markdown, and image-like items.
- Settings/AI configuration screenshot with no API key and no private endpoint.
- Short gif: open picker, search, copy selected item.
- Short gif: paste selected item into a temporary target app.
- Short gif: tag or filtered picker workflow.
- Short gif: AI command mode producing Markdown output from synthetic checked items.

## Synthetic Clip Ideas

- `npm run build` output excerpt from a fake project.
- Fake local URL: `https://example.test/docs/copicu-alpha`.
- Fake bug note: `Investigate auth retry loop in staging fixture`.
- Fake SQL snippet against `demo_clipboard_items`.
- Fake Markdown meeting note with action items.
- Generated placeholder image with the text `SYNTHETIC SCREENSHOT`.

## Capture Rules

- Use a clean dev profile or isolated app data directory.
- Seed only synthetic items.
- Keep the picker compact and readable.
- Prefer short gifs under 10 seconds.
- Prefer MP4 for longer YouTube/release demos.
- Avoid showing unrelated desktop windows.
- Re-check the frame for hidden private content before publishing.

## Demo Pipelines

Generated/storyboard demos:

- Render scripted frames with Playwright.
- Encode MP4/GIF with FFmpeg.
- Use for README gifs, thumbnails, and concept demos.

Real app recordings:

- Run Copicu with isolated `COPICU_APP_DATA_DIR`.
- Seed history only with synthetic clips.
- Record screen or a fixed region with FFmpeg/OBS.
- Use a temporary target app for paste demos.
- Save MP4 under `docs/assets/videos/` and export GIF only when the clip is short enough for README.

Current Windows capture note:

- `scripts/demos/record-picker-search-paste-demo.ps1` prepares a real picker/search/paste recording with a synthetic backdrop.
- Do not launch Copicu/WebView2 with `--disable-gpu --disable-gpu-compositing` for public demo capture; that produced a white WebView in Computer Use/Windows Graphics Capture on this machine.
- On this machine, FFmpeg `gdigrab` can record the WinForms target but may capture the Tauri/WebView2 surface as blank/black/white.
- Computer Use can verify the real Tauri window with Windows Graphics Capture once Copicu has rendered normally.
- Do not publish failed `gdigrab` outputs. The script deletes real-demo outputs unless validation succeeds.
- Use `-UseExistingApp` when Copicu has already been started manually and visually confirmed to be rendered/usable.
- Next capture attempt should use OBS, Windows Graphics Capture/desktop duplication, or another capturer that can see WebView2 surfaces.

Current generated demo:

- `videos/copicu-synthetic-picker-demo.mp4`
- `gifs/copicu-synthetic-picker-demo.gif`
- `screenshots/copicu-synthetic-picker-demo-poster.png`
