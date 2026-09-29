# Public Demo Assets

All public assets must use synthetic data. Never include real clipboard payloads, native profiles, private apps/URLs, credentials, logs, `.env` files or databases.

## Current v0.5.0 Picker Screenshots

- `screenshots/picker-folders-v0.5.0.png`: rendered React picker with an expanded folder tree and the direct clips in Projects.
- `screenshots/picker-marked-scope-v0.5.0.png`: same picker with the persistent-mark menu, showing five marks globally, two in loaded results and three outside them.

These are actual app frontend renders using the existing Playwright `mockTauriInvoke` fixture, not hand-drawn mockups or storyboards. All snippets, folders, metadata and IPC responses are synthetic. They demonstrate UI state only, not native clipboard capture, focus, persistence or paste. No native profile is opened; external network requests are blocked during capture. The implemented surface is a picker folder tree, not the proposed Explorer table.

### Reproduce (Explicit Opt-In)

From the repository root, with installed project dependencies and Playwright Chromium already available:

```powershell
$env:COPICU_VISUAL_PORT='1542'
$env:COPICU_CAPTURE_RELEASE_SCREENSHOTS='1'
npx playwright test tests/visual/shell.spec.ts --project chromium-desktop --workers=1 --grep 'capture synthetic release picker screenshots'
Remove-Item Env:COPICU_CAPTURE_RELEASE_SCREENSHOTS
Remove-Item Env:COPICU_VISUAL_PORT
```

The normal Playwright config builds the frontend with the visual-test flag and serves it locally. Coordinate with any other worker building `dist`: do not serve a changing build during capture. The test writes only these two named assets when the opt-in environment variable is exactly `1`; the ordinary suite skips it and does not modify `docs/assets`. Narrow-window projects skip capture to avoid overwriting the canonical desktop assets. Review both images before publication.

## Earlier Workflow Assets (Not Refreshed For v0.5.0)

- `screenshots/picker-synthetic-history.png`
- `screenshots/picker-full-editor.png`
- `screenshots/copicu-synthetic-picker-demo-poster.png`
- `gifs/copicu-synthetic-picker-demo.gif`
- `videos/copicu-synthetic-picker-demo.mp4`

The earlier generated GIF/video and poster illustrate an earlier search/edit workflow. They are not evidence of the current folder/marked UI or a refreshed native app recording. Keep generated/storyboard illustrations labelled as such; never present them as current app captures.

## Source Data And Other Pipelines

`source-data/synthetic-clips.md` and `source-data/public-demo-clips.json` contain reusable fake clips. Prefer `example.test` URLs and local/data-URL imagery; do not request remote media for screenshots.

A native capture, if separately authorized, must use isolated app data, synthetic clips and a temporary external paste target. Keep the picker compact, avoid unrelated desktop windows, and inspect every frame. Prefer GIFs under ten seconds and MP4 for longer flows.

`scripts/demos/record-picker-search-paste-demo.ps1` prepares a native recording. On this Windows machine FFmpeg `gdigrab` can capture the WinForms target but may leave Tauri/WebView2 blank. Do not publish failed captures or launch WebView2 with `--disable-gpu --disable-gpu-compositing` as a workaround. Use a capturer that can see WebView2, such as Windows Graphics Capture or OBS, and verify rendering first. Native capture is separate from the mocked React screenshot test.
