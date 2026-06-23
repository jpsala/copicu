import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import ts from "typescript";

async function loadCleanTrackingUrl() {
  const source = await fs.readFile("scripts/examples/028-clean-url-tracking-copy.ts", "utf8");
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
  const tempFile = path.join(os.tmpdir(), `copicu-clean-url-test-${Date.now()}.mjs`);
  globalThis.defineAction = (definition) => definition;
  globalThis.copicu = {};
  await fs.writeFile(tempFile, moduleSource, "utf8");
  try {
    const module = await import(`${pathToFileURL(tempFile).href}?t=${Date.now()}`);
    return module.cleanTrackingUrl;
  } finally {
    await fs.rm(tempFile, { force: true });
  }
}

test("cleanTrackingUrl removes tracking params and preserves safe params and hash", async () => {
  const cleanTrackingUrl = await loadCleanTrackingUrl();
  const result = cleanTrackingUrl(
    "https://example.test/docs?utm_source=newsletter&utm_medium=demo&fbclid=abc&keep=1#install",
  );

  assert.equal(result.cleaned, "https://example.test/docs?keep=1#install");
  assert.equal(result.removedCount, 3);
});

test("cleanTrackingUrl preserves URLs without tracking params", async () => {
  const cleanTrackingUrl = await loadCleanTrackingUrl();
  const result = cleanTrackingUrl("https://example.test/docs?keep=1#install");

  assert.equal(result.cleaned, "https://example.test/docs?keep=1#install");
  assert.equal(result.removedCount, 0);
});

test("cleanTrackingUrl counts repeated tracking params", async () => {
  const cleanTrackingUrl = await loadCleanTrackingUrl();
  const result = cleanTrackingUrl("https://example.test/?utm_source=a&utm_source=b&gclid=c&keep=1");

  assert.equal(result.cleaned, "https://example.test/?keep=1");
  assert.equal(result.removedCount, 3);
});

test("cleanTrackingUrl returns nulls for text without an http URL", async () => {
  const cleanTrackingUrl = await loadCleanTrackingUrl();
  const result = cleanTrackingUrl("not a url");

  assert.deepEqual(result, { url: null, cleaned: null, removedCount: 0 });
});
