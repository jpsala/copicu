import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { loadConfigFromFile } from "vite";

const { config } = await loadConfigFromFile(
  { command: "build", mode: "production" },
  fileURLToPath(new URL("../vite.config.ts", import.meta.url)),
);
const chunk = config.build.rolldownOptions.output.manualChunks;

test("CodeMirror, its wrappers and parser/runtime helpers share one vendor chunk", () => {
  for (const name of [
    "@codemirror/state", "@codemirror/view", "@codemirror/autocomplete",
    "@codemirror/language", "@codemirror/commands", "@codemirror/search",
    "@codemirror/lint", "@codemirror/theme-one-dark",
    "@lezer/common", "@lezer/lr", "@lezer/highlight",
    "@uiw/react-codemirror", "@uiw/codemirror-extensions-basic-setup",
    "codemirror", "@marijn/find-cluster-break", "crelt", "style-mod", "w3c-keyname",
  ]) {
    const id = `C:/dev/copicu/node_modules/${name}/dist/index.js`;
    assert.equal(chunk(id), "vendor-codemirror", name);
    assert.equal(chunk(id.replaceAll("/", "\\")), "vendor-codemirror", name);
  }
});

test("editor split preserves app boundaries, existing vendors and default warning limit", () => {
  assert.equal(chunk("C:/dev/copicu/src/ui/QueryEditor.tsx"), null);
  assert.equal(chunk("C:/dev/copicu/node_modules/codemirror-unrelated/index.js"), null);
  for (const [name, expected] of [
    ["react", "vendor-react"], ["react-dom", "vendor-react"],
    ["@mantine/core", "vendor-mantine"], ["@tauri-apps/api", "vendor-tauri"],
    ["@tanstack/react-virtual", "vendor-virtual"],
    ["react-markdown", "vendor-markdown"], ["highlight.js", "vendor-highlight"],
  ]) {
    assert.equal(chunk(`C:/dev/copicu/node_modules/${name}/index.js`), expected);
  }
  assert.equal(config.build.chunkSizeWarningLimit, undefined);
});
