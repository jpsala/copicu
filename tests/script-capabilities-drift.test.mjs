import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const sources = [
  {
    name: "Rust actions supported_script_capability",
    path: "src-tauri/src/actions/capabilities.rs",
    extract: extractRustSupportedCapabilities,
  },
  {
    name: "main renderer SUPPORTED_SCRIPT_CAPABILITIES",
    path: "src/main.tsx",
    extract: extractTypescriptSupportedCapabilities,
  },
  {
    name: "secondary windows SUPPORTED_SCRIPT_CAPABILITIES",
    path: "src/windows/secondaryWindows.tsx",
    extract: extractTypescriptSupportedCapabilities,
  },
  {
    name: "AI script planner allowedCapabilities",
    path: "scripts/ai-script-planner.mjs",
    extract: extractPlannerAllowedCapabilities,
  },
];

test("script capability vocabulary stays in sync across Rust, UI, and AI planner", () => {
  const [baseline, ...rest] = sources.map((source) => {
    const absolutePath = path.join(repoRoot, source.path);
    return {
      ...source,
      capabilities: source.extract(fs.readFileSync(absolutePath, "utf8")),
    };
  });

  for (const source of rest) {
    assert.deepEqual(
      source.capabilities,
      baseline.capabilities,
      `${source.name} differs from ${baseline.name}`,
    );
  }
});

function extractRustSupportedCapabilities(source) {
  const block = extractBetween(
    source,
    "fn supported_script_capability(capability: &str) -> bool",
    "fn required_script_host_capabilities",
  );
  return extractCapabilityStrings(block);
}

function extractTypescriptSupportedCapabilities(source) {
  const block = extractBetween(
    source,
    "const SUPPORTED_SCRIPT_CAPABILITIES = new Set([",
    "]);",
  );
  return extractCapabilityStrings(block);
}

function extractPlannerAllowedCapabilities(source) {
  const block = extractBetween(source, "const allowedCapabilities = [", "];");
  return extractCapabilityStrings(block);
}

function extractBetween(source, start, end) {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `missing start marker: ${start}`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `missing end marker: ${end}`);
  return source.slice(startIndex, endIndex);
}

function extractCapabilityStrings(source) {
  return Array.from(source.matchAll(/"([a-z][a-z-]*:[a-z][a-z-]*)"/g), (match) => match[1]);
}
