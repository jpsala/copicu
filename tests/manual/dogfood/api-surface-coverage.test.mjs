import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const rustCapabilities = path.join(repoRoot, "src-tauri", "src", "actions", "capabilities.rs");
const smokeScript = path.join(repoRoot, "tests", "manual", "dogfood", "999-api-surface-smoke.ts");
const examplesReadme = path.join(repoRoot, "scripts", "examples", "README.md");

test("dogfood API smoke declares every supported script capability", () => {
  const supported = extractRustSupportedCapabilities(fs.readFileSync(rustCapabilities, "utf8"));
  const declared = extractStringArrayAfter(
    fs.readFileSync(smokeScript, "utf8"),
    "capabilities: [",
    "],",
  );
  assert.deepEqual(declared, supported, "999-api-surface-smoke.ts must stay in lockstep with supported capabilities");
});

test("dogfood API smoke calls representative host methods for every capability family", () => {
  const source = fs.readFileSync(smokeScript, "utf8");
  const expectedCalls = [
    "copicu.history.search",
    "copicu.history.get",
    "copicu.history.update",
    "copicu.history.promote",
    "copicu.history.move",
    "copicu.history.remove",
    "copicu.metadata.listTags",
    "copicu.metadata.editActive",
    "copicu.clipboard.read",
    "copicu.clipboard.writeText",
    "copicu.clipboard.writeItem",
    "copicu.ui.toast",
    "copicu.ui.notify",
    "copicu.ui.alert",
    "copicu.ui.confirm",
    "copicu.ui.input",
    "copicu.ui.markdownOutput",
    "copicu.ai.respondMarkdown",
    "copicu.enrichment.getResult",
    "copicu.enrichment.runForItem",
    "copicu.commands.run",
    "copicu.picker.open",
    "copicu.picker.filter",
    "copicu.picker.activate",
    "copicu.picker.show",
    "copicu.picker.hide",
    "copicu.window.rememberPrevious",
    "copicu.window.focusPrevious",
    "copicu.input.paste",
    "copicu.log.info",
  ];
  for (const call of expectedCalls) {
    assert.match(source, new RegExp(escapeRegExp(call) + "\\s*\\("), `missing smoke call: ${call}`);
  }
});

test("script examples README lists every script included in the API battery", () => {
  const battery = fs.readFileSync(path.join(repoRoot, "tests", "manual", "dogfood", "run-script-api-battery.mjs"), "utf8");
  const readme = fs.readFileSync(examplesReadme, "utf8");
  const includedExamples = Array.from(
    battery.matchAll(/"scripts\/examples\/(\d{3}-[^"]+\.ts)"/g),
    (match) => match[1],
  );
  assert.ok(includedExamples.length > 10, "battery should include the main examples");
  for (const fileName of includedExamples) {
    assert.match(readme, new RegExp(escapeRegExp(fileName.replace(/\.ts$/, ""))), `README omits ${fileName}`);
  }
});

function extractRustSupportedCapabilities(source) {
  const block = extractBetween(
    source,
    "fn supported_script_capability(capability: &str) -> bool",
    "fn required_script_host_capabilities",
  );
  return Array.from(block.matchAll(/"([a-z][a-z-]*:[a-z][a-z-]*)"/g), (match) => match[1]);
}

function extractStringArrayAfter(source, start, end) {
  const block = extractBetween(source, start, end);
  return Array.from(block.matchAll(/"([a-z][a-z-]*:[a-z][a-z-]*)"/g), (match) => match[1]);
}

function extractBetween(source, start, end) {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `missing start marker: ${start}`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `missing end marker: ${end}`);
  return source.slice(startIndex, endIndex);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
