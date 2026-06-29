import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import ts from "typescript";

async function loadFormatItemsAsMarkdown() {
  const source = await fs.readFile("scripts/examples/031-join-selected-markdown-copy.ts", "utf8");
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
  const tempFile = path.join(os.tmpdir(), `copicu-join-markdown-test-${Date.now()}.mjs`);
  globalThis.defineAction = (definition) => definition;
  globalThis.copicu = {};
  await fs.writeFile(tempFile, moduleSource, "utf8");
  try {
    const module = await import(`${pathToFileURL(tempFile).href}?t=${Date.now()}`);
    return module.formatItemsAsMarkdown;
  } finally {
    await fs.rm(tempFile, { force: true });
  }
}

test("formatItemsAsMarkdown joins text clips with headings and tags", async () => {
  const formatItemsAsMarkdown = await loadFormatItemsAsMarkdown();
  const result = formatItemsAsMarkdown([
    { id: "1", kind: "text", title: "  API note  ", text: "  GET /v1/orders  ", tags: ["#api", "#todo"] },
    { id: "2", kind: "text", title: "Snippet", text: "const ok = true;", tags: [] },
  ]);

  assert.equal(result.itemCount, 2);
  assert.equal(
    result.markdown,
    "# Copicu selection\n\n## API note\n\n_tags: #api #todo_\n\nGET /v1/orders\n\n---\n\n## Snippet\n\nconst ok = true;",
  );
});

test("formatItemsAsMarkdown ignores non-text and empty clips", async () => {
  const formatItemsAsMarkdown = await loadFormatItemsAsMarkdown();
  const result = formatItemsAsMarkdown([
    { id: "1", kind: "image" },
    { id: "2", kind: "text", title: "Empty", text: "   " },
  ]);

  assert.deepEqual(result, { itemCount: 0, markdown: "" });
});
