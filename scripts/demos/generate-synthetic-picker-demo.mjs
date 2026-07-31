import { chromium } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..", "..");
const framesDir = path.join(root, ".tmp", "demo-frames", "synthetic-picker");
const videoDir = path.join(root, "docs", "assets", "videos");
const gifDir = path.join(root, "docs", "assets", "gifs");
const screenshotDir = path.join(root, "docs", "assets", "screenshots");
const mp4Path = path.join(videoDir, "copicu-synthetic-picker-demo.mp4");
const gifPath = path.join(gifDir, "copicu-synthetic-picker-demo.gif");
const posterPath = path.join(screenshotDir, "copicu-synthetic-picker-demo-poster.png");
const pickerScreenshotPath = path.join(screenshotDir, "picker-synthetic-history.png");
const editorScreenshotPath = path.join(screenshotDir, "picker-full-editor.png");

const width = 1280;
const height = 720;
const fps = 20;
const durationSeconds = 6;
const totalFrames = fps * durationSeconds;

function loadDemoClips() {
  const sourcePath = path.join(root, "docs", "assets", "source-data", "public-demo-clips.json");
  try {
    return JSON.parse(readFileSync(sourcePath, "utf8"));
  } catch (error) {
    throw new Error(`Could not load synthetic demo clips from ${sourcePath}`, { cause: error });
  }
}

const demoClips = loadDemoClips();

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function summarize(value, limit = 220) {
  const compact = value.replaceAll("\r\n", "\n").trim();
  return compact.length > limit ? `${compact.slice(0, limit)}…` : compact;
}

const clips = demoClips.slice(0, 5).map((clip, index) => ({
  ...clip,
  id: index + 1,
  body: summarize(clip.body),
}));

function frameState(frame) {
  const t = frame / (totalFrames - 1);
  const queryText = "release";
  const queryLength = Math.round(clamp((t - 0.18) / 0.2, 0, 1) * queryText.length);
  return {
    query: queryText.slice(0, queryLength),
    selected: t >= 0.48,
    expanded: t >= 0.6 && t < 0.74,
    editing: t >= 0.74 && t < 0.93,
    saved: t >= 0.93,
    editSuffixLength: Math.round(clamp((t - 0.78) / 0.11, 0, 1) * "\nReady for review.".length),
  };
}

function metadata(clip) {
  const visibleTags = clip.tags.filter((tag) => tag !== "synthetic");
  return visibleTags.length > 0
    ? `<div class="metadata">${visibleTags.map((tag) => `<span>#${escapeHtml(tag)}</span>`).join("")}</div>`
    : "";
}

function textPreview(clip, state, index) {
  const selected = state.selected && index === 0;
  const expanded = selected && state.expanded;
  const editing = selected && state.editing;
  const syntheticLongText = `${clip.body}\n\nOwner: Demo team\nStatus: Draft\nNext: verify installer and screenshots.`;

  if (editing) {
    const suffix = "\nReady for review.".slice(0, state.editSuffixLength);
    return `<div class="inlineEditor">
      <textarea aria-label="Quick edit item">${escapeHtml(syntheticLongText + suffix)}</textarea>
      <div class="inlineFooter"><span><kbd>Ctrl Enter</kbd> save · <kbd>Esc</kbd> cancel</span><span><button>Cancel</button><button class="primary">Save</button></span></div>
    </div>`;
  }

  return `<div class="textPreview ${expanded ? "expanded" : ""}">
    <pre>${escapeHtml(syntheticLongText)}</pre>
    <div class="overflow"><span>${syntheticLongText.length} chars · 9 lines</span><button>${expanded ? "Collapse" : "Expand"}</button></div>
  </div>`;
}

function clipRow(clip, state, index) {
  const selected = state.selected && index === 0;
  const isImage = clip.kind === "image";
  return `<li class="row ${selected ? "selected" : ""}">
    <div class="rail"><span class="check"></span><span class="flag">♧</span></div>
    <article>
      ${metadata(clip)}
      ${isImage
        ? `<div class="imagePreview" title="Open full preview"><div><strong>SYNTHETIC</strong><span>image preview</span></div></div>`
        : index === 0
          ? textPreview(clip, state, index)
          : `<pre class="plain">${escapeHtml(clip.body)}</pre>`}
    </article>
    <div class="rowActions"><button title="Preview">⌕</button><button title="Quick edit">✎</button><button title="Delete">⌫</button><button title="Actions">⋮</button></div>
  </li>`;
}

function pickerHtml(frame, { editor = false } = {}) {
  const state = frameState(frame);
  const queryComplete = state.query === "release";
  const visibleClips = queryComplete ? [clips[2]] : clips;
  const displayState = queryComplete ? state : { ...state, selected: false, expanded: false, editing: false };
  const rows = visibleClips.map((clip, index) => clipRow(clip, displayState, index)).join("");
  const editorText = `${clips[2].body}\n\nOwner: Demo team\nStatus: Draft\nNext: verify installer and screenshots.`;

  return `<!doctype html><html><head><meta charset="utf-8"><style>
    * { box-sizing: border-box; }
    body { margin: 0; width: ${width}px; height: ${height}px; overflow: hidden; background: #0c1115; color: #e8edf2; font-family: Inter, "Segoe UI", Arial, sans-serif; }
    button, textarea { font: inherit; }
    .stage { position: relative; width: 100%; height: 100%; background: radial-gradient(circle at 72% 10%, #19242b 0, #0c1115 42%); }
    .watermark { position: absolute; left: 28px; top: 22px; color: #8fa1ad; font-size: 12px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; }
    .app { position: absolute; left: 120px; top: 58px; width: 940px; height: 638px; overflow: hidden; border: 1px solid #31404a; background: #11181d; box-shadow: 0 16px 54px rgb(0 0 0 / 42%); }
    .chrome { height: 34px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #29363f; padding-left: 12px; background: #151d23; }
    .chrome strong { font-size: 12px; }
    .windowControls { display: flex; height: 100%; }
    .windowControls span { display: grid; min-width: 34px; place-items: center; border-left: 1px solid #26323a; color: #9fb0bb; font-size: 11px; }
    .toolbar { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 8px; align-items: center; padding: 8px; border-bottom: 1px solid #25313a; }
    .toolbarGroup { display: flex; align-items: center; gap: 5px; }
    .iconButton, .toolbarButton { height: 34px; border: 1px solid #34434d; border-radius: 4px; background: #172027; color: #bac7cf; }
    .iconButton { width: 34px; }
    .toolbarButton { padding: 0 9px; font-size: 12px; font-weight: 700; }
    .search { height: 38px; border: 1px solid #43545f; border-radius: 4px; background: #0d1317; padding: 8px 11px; color: #f4f7f9; font-size: 14px; }
    .search .placeholder { color: #758692; }
    .count { color: #8fa1ad; font-size: 11px; }
    .feed { position: relative; height: calc(100% - 82px); margin: 0; padding: 5px; overflow: hidden; list-style: none; }
    .row { position: relative; display: grid; grid-template-columns: 52px minmax(0, 1fr); min-height: 76px; margin-bottom: 4px; border: 1px solid transparent; border-radius: 5px; background: #131b21; }
    .row.selected { border-color: #4ea58c; background: #172824; box-shadow: inset 3px 0 #54c7a3; }
    .rail { display: flex; gap: 8px; align-items: flex-start; padding: 12px 6px 0 10px; color: #79909d; }
    .check { width: 16px; height: 16px; border: 1px solid #536773; border-radius: 3px; background: #0e1519; }
    .flag { font-size: 17px; line-height: 16px; }
    article { min-width: 0; padding: 8px 12px 8px 0; }
    .metadata { display: flex; gap: 6px; margin-bottom: 5px; }
    .metadata span { border: 1px solid #32594e; border-radius: 3px; background: #173029; padding: 2px 6px; color: #a9d7c8; font-size: 10px; font-weight: 700; }
    pre { margin: 0; color: #d2dbe1; font-family: "Cascadia Mono", Consolas, monospace; font-size: 12px; line-height: 1.42; overflow-wrap: anywhere; white-space: pre-wrap; }
    .plain { max-height: 46px; overflow: hidden; }
    .textPreview { display: grid; gap: 5px; }
    .textPreview pre { max-height: 52px; overflow: hidden; }
    .textPreview.expanded pre { max-height: 158px; overflow: auto; }
    .overflow { display: flex; align-items: center; justify-content: space-between; color: #83959f; font-size: 10px; font-weight: 700; }
    .overflow button { border: 0; border-radius: 3px; background: transparent; padding: 2px 5px; color: #69d5b4; font-size: 10px; font-weight: 800; }
    .imagePreview { display: flex; width: 174px; height: 88px; align-items: center; justify-content: center; border: 1px solid #3d4a52; border-radius: 4px; background: linear-gradient(135deg, #1f5f54, #17323b); }
    .imagePreview div { display: grid; justify-items: center; color: #e5fbf4; }
    .imagePreview strong { font-size: 13px; letter-spacing: .08em; }
    .imagePreview span { font-size: 10px; opacity: .72; }
    .rowActions { position: absolute; top: 7px; right: 7px; display: flex; gap: 3px; opacity: 0; }
    .row.selected .rowActions { opacity: 1; }
    .rowActions button { width: 24px; height: 26px; border: 1px solid #3e515c; border-radius: 4px; background: #162229; color: #81ceb6; }
    .inlineEditor { display: grid; gap: 5px; }
    .inlineEditor textarea { width: 100%; height: 120px; resize: none; border: 1px solid #58bd9f; border-radius: 4px; background: #0d1519; padding: 8px; color: #e6edf1; font-family: "Cascadia Mono", Consolas, monospace; font-size: 12px; line-height: 1.4; outline: 2px solid rgb(88 189 159 / 18%); }
    .inlineFooter { display: flex; align-items: center; justify-content: space-between; color: #83959f; font-size: 10px; }
    kbd { border: 1px solid #41525c; border-radius: 3px; background: #172127; padding: 1px 4px; color: #c7d2d9; }
    .inlineFooter button { margin-left: 4px; border: 1px solid #3e4d56; border-radius: 4px; background: #182127; padding: 4px 9px; color: #cad4da; font-size: 10px; }
    .inlineFooter button.primary { border-color: #56b99b; background: #2b826b; color: white; }
    .toast { position: absolute; right: 28px; top: 30px; border: 1px solid #386a5c; border-radius: 5px; background: #152923; padding: 10px 13px; color: #d9f6ed; font-size: 12px; box-shadow: 0 10px 26px rgb(0 0 0 / 32%); }
    .fullEditor { display: grid; height: calc(100% - 34px); grid-template-rows: auto minmax(0, 1fr) auto; }
    .editorHeader, .editorFooter { display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; background: #151e24; }
    .editorHeader { border-bottom: 1px solid #2b3942; }
    .editorHeader div { display: grid; gap: 2px; }
    .editorHeader strong { font-size: 13px; }
    .editorHeader span, .editorFooter { color: #8fa1ad; font-size: 10px; }
    .editorCanvas { display: grid; grid-template-columns: 42px minmax(0, 1fr); overflow: hidden; background: #0d1418; }
    .lineNumbers { padding: 11px 8px; border-right: 1px solid #27343c; color: #566873; font: 11px/1.52 Consolas, monospace; text-align: right; white-space: pre; }
    .editorCode { padding: 11px 12px; color: #d9e2e7; font: 12px/1.4 Consolas, monospace; white-space: pre-wrap; }
    .editorFooter div { display: flex; align-items: center; gap: 10px; }
    .editorFooter button { border: 1px solid #476059; border-radius: 4px; background: #2b826b; padding: 5px 12px; color: white; font-size: 10px; }
  </style></head><body><main class="stage">
    <div class="watermark">Synthetic demo · no real clipboard data</div>
    <section class="app">
      <header class="chrome"><strong>Copicu</strong><div class="windowControls"><span>Pin</span><span>Keep</span><span>—</span><span>□</span><span>×</span></div></header>
      ${editor ? `<section class="fullEditor"><header class="editorHeader"><div><strong>Edit item</strong><span>#3 · text/markdown</span></div><span>Modified</span></header><div class="editorCanvas"><div class="lineNumbers">1\n2\n3\n4\n5\n6\n7\n8\n9</div><div class="editorCode">${escapeHtml(editorText)}</div></div><footer class="editorFooter"><div><span>Ln 9, Col 1</span><span>9 lines</span><span>${editorText.length} chars</span><button style="background:#182127">Wrap</button></div><div><span>Find <kbd>Ctrl F</kbd> · Save <kbd>Ctrl S</kbd></span><button>Save</button></div></footer></section>` : `<div class="toolbar"><div class="toolbarGroup"><button class="iconButton">☐</button><button class="iconButton">♧</button><button class="toolbarButton">Scenario</button><button class="toolbarButton">Views</button></div><div class="search"><span class="placeholder">Search</span>${state.query ? ` ${escapeHtml(state.query)}` : ""}<b>│</b></div><div class="toolbarGroup"><span class="count">${queryComplete ? "1 / 5" : "5 total"}</span><button class="toolbarButton">Commands</button><button class="iconButton">⚙</button></div></div><ol class="feed">${rows}</ol>`}
    </section>
    ${state.saved && !editor ? `<div class="toast">Item updated · selection preserved</div>` : ""}
  </main></body></html>`;
}

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8", stdio: "pipe" });
  if (result.status !== 0) {
    throw new Error(`${command} failed\n${result.stderr || result.stdout}`);
  }
}

async function main() {
  rmSync(framesDir, { recursive: true, force: true });
  mkdirSync(framesDir, { recursive: true });
  mkdirSync(videoDir, { recursive: true });
  mkdirSync(gifDir, { recursive: true });
  mkdirSync(screenshotDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });

  for (let frame = 0; frame < totalFrames; frame += 1) {
    await page.setContent(pickerHtml(frame), { waitUntil: "load" });
    await page.screenshot({ path: path.join(framesDir, `frame-${String(frame).padStart(4, "0")}.png`), animations: "disabled" });
  }

  await page.screenshot({ path: posterPath, animations: "disabled" });
  await page.setContent(pickerHtml(0), { waitUntil: "load" });
  await page.screenshot({ path: pickerScreenshotPath, animations: "disabled" });
  await page.setContent(pickerHtml(0, { editor: true }), { waitUntil: "load" });
  await page.screenshot({ path: editorScreenshotPath, animations: "disabled" });
  await browser.close();

  run("ffmpeg", ["-y", "-framerate", String(fps), "-i", path.join(framesDir, "frame-%04d.png"), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", mp4Path]);
  run("ffmpeg", ["-y", "-i", mp4Path, "-vf", "fps=12,scale=960:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse", gifPath]);

  writeFileSync(path.join(videoDir, "README.md"), "# Videos\n\nGenerated public demo videos using synthetic data only.\n");
  console.log(`MP4: ${mp4Path}`);
  console.log(`GIF: ${gifPath}`);
  console.log(`Poster: ${posterPath}`);
  console.log(`Picker screenshot: ${pickerScreenshotPath}`);
  console.log(`Editor screenshot: ${editorScreenshotPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
