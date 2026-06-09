import { chromium } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..", "..");
const framesDir = path.join(root, ".tmp", "demo-frames", "synthetic-picker");
const videoDir = path.join(root, "docs", "assets", "videos");
const gifDir = path.join(root, "docs", "assets", "gifs");
const mp4Path = path.join(videoDir, "copicu-synthetic-picker-demo.mp4");
const gifPath = path.join(gifDir, "copicu-synthetic-picker-demo.gif");
const posterPath = path.join(root, "docs", "assets", "screenshots", "copicu-synthetic-picker-demo-poster.png");

const width = 1280;
const height = 720;
const fps = 20;
const durationSeconds = 6;
const totalFrames = fps * durationSeconds;

const clips = [
  {
    title: "Auth retry loop note",
    meta: "text · tag:alpha · 3 min ago",
    body: "Investigate synthetic auth retry loop in the fixture app. Expected: one retry. Actual: retry counter keeps increasing after timeout.",
  },
  {
    title: "Build command",
    meta: "code · tag:dev · 8 min ago",
    body: "npm run build && npm run visual:check",
  },
  {
    title: "Docs URL",
    meta: "url · tag:research · 14 min ago",
    body: "https://example.test/docs/copicu-alpha",
  },
  {
    title: "SQL snippet",
    meta: "sql · tag:demo · 22 min ago",
    body: "select id, title, kind from demo_clipboard_items where tags like '%alpha%' order by last_used_at desc limit 20;",
  },
];

function interpolate(from, to, t) {
  return from + (to - from) * t;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function frameState(frame) {
  const t = frame / (totalFrames - 1);
  const query = "auth bug";
  const typedLength = Math.round(clamp((t - 0.18) / 0.22, 0, 1) * query.length);
  const selected = t > 0.58 ? 0 : -1;
  const copied = t > 0.74;
  const outputVisible = t > 0.82;
  const cursorX = interpolate(1035, 595, clamp((t - 0.48) / 0.18, 0, 1));
  const cursorY = interpolate(512, 278, clamp((t - 0.48) / 0.18, 0, 1));
  return {
    t,
    query: query.slice(0, typedLength),
    selected,
    copied,
    outputVisible,
    cursorX,
    cursorY,
  };
}

function renderHtml(frame) {
  const state = frameState(frame);
  const filtered = state.query.length > 0 ? [clips[0], clips[2], clips[3]] : clips;
  const list = filtered
    .map((clip, index) => {
      const active = state.selected === index;
      return `
        <section class="item ${active ? "active" : ""}">
          <div class="itemTop">
            <strong>${escapeHtml(clip.title)}</strong>
            <span>${escapeHtml(clip.meta)}</span>
          </div>
          <p>${escapeHtml(clip.body)}</p>
        </section>`;
    })
    .join("");

  const copiedToast = state.copied
    ? `<div class="toast">Copied synthetic clip</div>`
    : "";

  const markdownOutput = state.outputVisible
    ? `<aside class="output">
        <div class="outputHeader">Markdown output</div>
        <h2>Alpha feedback summary</h2>
        <p>Generated from checked synthetic clips.</p>
        <ul>
          <li>Picker search stays keyboard-first.</li>
          <li>Paste target behavior needs Windows coverage.</li>
          <li>Scripts use explicit capabilities.</li>
        </ul>
      </aside>`
    : "";

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      width: ${width}px;
      height: ${height}px;
      overflow: hidden;
      background: #101418;
      color: #e8edf2;
      font-family: Inter, "Segoe UI", Arial, sans-serif;
    }
    .stage {
      position: relative;
      width: 100%;
      height: 100%;
      background:
        linear-gradient(180deg, rgba(255,255,255,0.035), transparent 34%),
        #101418;
    }
    .watermark {
      position: absolute;
      left: 32px;
      top: 24px;
      color: #8f9aa5;
      font-size: 13px;
      letter-spacing: .04em;
      text-transform: uppercase;
    }
    .app {
      position: absolute;
      left: 110px;
      top: 72px;
      width: 760px;
      height: 562px;
      border: 1px solid #29323b;
      background: #161b20;
      box-shadow: 0 18px 60px rgba(0,0,0,.38);
      border-radius: 8px;
      overflow: hidden;
    }
    .chrome {
      height: 44px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 16px;
      border-bottom: 1px solid #29323b;
      background: #151a1f;
    }
    .brand { font-weight: 700; font-size: 15px; }
    .hint { color: #93a1ae; font-size: 13px; }
    .search {
      margin: 16px;
      height: 46px;
      border-radius: 6px;
      border: 1px solid #3b4651;
      background: #0f1317;
      display: flex;
      align-items: center;
      padding: 0 14px;
      font-size: 18px;
      color: #f4f7fa;
    }
    .search span { color: #6d7a86; margin-right: 10px; }
    .feed { padding: 0 16px 16px; }
    .item {
      border: 1px solid #2b343d;
      background: #1c2228;
      border-radius: 7px;
      padding: 13px 14px;
      margin-bottom: 10px;
      min-height: 88px;
      transition: border-color .15s, background .15s, transform .15s;
    }
    .item.active {
      border-color: #62c4a3;
      background: #202b2b;
      transform: translateX(4px);
    }
    .itemTop {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 14px;
      margin-bottom: 8px;
    }
    .itemTop strong { font-size: 15px; }
    .itemTop span { color: #9aa8b5; font-size: 12px; white-space: nowrap; }
    p { margin: 0; color: #c9d3dc; font-size: 14px; line-height: 1.35; }
    .toast {
      position: absolute;
      right: 32px;
      top: 32px;
      border: 1px solid #315f51;
      background: #14231f;
      color: #dff7ee;
      padding: 12px 14px;
      border-radius: 7px;
      box-shadow: 0 16px 40px rgba(0,0,0,.28);
      font-size: 14px;
    }
    .output {
      position: absolute;
      right: 110px;
      top: 132px;
      width: 320px;
      min-height: 360px;
      border: 1px solid #313b45;
      background: #f4f0e8;
      color: #1f252b;
      border-radius: 8px;
      box-shadow: 0 22px 62px rgba(0,0,0,.35);
      padding: 22px;
    }
    .outputHeader {
      color: #65717c;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: .06em;
      margin-bottom: 18px;
    }
    .output h2 {
      margin: 0 0 12px;
      font-size: 23px;
      line-height: 1.1;
    }
    .output p, .output li {
      color: #313940;
      font-size: 15px;
      line-height: 1.45;
    }
    .output ul { padding-left: 20px; }
    .cursor {
      position: absolute;
      left: ${state.cursorX}px;
      top: ${state.cursorY}px;
      width: 18px;
      height: 24px;
      filter: drop-shadow(0 3px 4px rgba(0,0,0,.35));
    }
    .cursor svg { width: 100%; height: 100%; }
  </style>
</head>
<body>
  <main class="stage">
    <div class="watermark">Synthetic demo · no real clipboard data</div>
    <section class="app">
      <div class="chrome">
        <div class="brand">Copicu</div>
        <div class="hint">Ctrl+Shift+,</div>
      </div>
      <div class="search"><span>Search</span>${escapeHtml(state.query)}<b style="opacity:${frame % 18 < 9 ? 1 : 0}">|</b></div>
      <div class="feed">${list}</div>
    </section>
    ${markdownOutput}
    ${copiedToast}
    <div class="cursor">
      <svg viewBox="0 0 24 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M2 2L21 18L12.5 19.5L8.5 29L2 2Z" fill="#f6fbff" stroke="#101418" stroke-width="2"/>
      </svg>
    </div>
  </main>
</body>
</html>`;
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    stdio: "pipe",
  });
  if (result.status !== 0) {
    throw new Error(`${command} failed\n${result.stderr || result.stdout}`);
  }
}

async function main() {
  rmSync(framesDir, { recursive: true, force: true });
  mkdirSync(framesDir, { recursive: true });
  mkdirSync(videoDir, { recursive: true });
  mkdirSync(gifDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });

  for (let frame = 0; frame < totalFrames; frame += 1) {
    await page.setContent(renderHtml(frame), { waitUntil: "load" });
    await page.screenshot({
      path: path.join(framesDir, `frame-${String(frame).padStart(4, "0")}.png`),
      animations: "disabled",
    });
  }

  await page.screenshot({ path: posterPath, animations: "disabled" });
  await browser.close();

  run("ffmpeg", [
    "-y",
    "-framerate",
    String(fps),
    "-i",
    path.join(framesDir, "frame-%04d.png"),
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    mp4Path,
  ]);

  run("ffmpeg", [
    "-y",
    "-i",
    mp4Path,
    "-vf",
    "fps=12,scale=960:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse",
    gifPath,
  ]);

  writeFileSync(
    path.join(root, "docs", "assets", "videos", "README.md"),
    "# Videos\n\nGenerated public demo videos using synthetic data only.\n",
  );

  console.log(`MP4: ${mp4Path}`);
  console.log(`GIF: ${gifPath}`);
  console.log(`Poster: ${posterPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

