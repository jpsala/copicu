import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import ts from "typescript";

async function loadExtractUrls() {
  const source = await fs.readFile("scripts/examples/030-extract-urls-copy.ts", "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ES2022,
    },
  });
  const moduleSource = [
    "const defineAction = globalThis.defineAction;",
    "const copicu = globalThis.copicu;",
    output.outputText,
  ].join("\n");
  const tempFile = path.join(os.tmpdir(), `copicu-extract-urls-test-${Date.now()}.mjs`);
  globalThis.defineAction = (definition) => definition;
  globalThis.copicu = {};
  await fs.writeFile(tempFile, moduleSource, "utf8");
  try {
    const module = await import(`${pathToFileURL(tempFile).href}?t=${Date.now()}`);
    return module.extractUrls;
  } finally {
    await fs.rm(tempFile, { force: true });
  }
}

test("extractUrls returns unique http(s) URLs in first-seen order", async () => {
  const extractUrls = await loadExtractUrls();
  const result = extractUrls([
    "Read https://example.test/docs/copicu-alpha?utm_source=demo.",
    "Mirror: http://docs.example.test/windows/clipboard-focus#paste-targets",
    "Duplicate: https://example.test/docs/copicu-alpha?utm_source=demo",
  ].join("\n"));

  assert.deepEqual(result, [
    "https://example.test/docs/copicu-alpha?utm_source=demo",
    "http://docs.example.test/windows/clipboard-focus#paste-targets",
  ]);
});

test("extractUrls ignores non-http text", async () => {
  const extractUrls = await loadExtractUrls();
  assert.deepEqual(extractUrls("Email demo@example.test and ftp://example.test/file are not copied."), []);
});
