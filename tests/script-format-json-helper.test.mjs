import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import ts from "typescript";

async function loadFormatJson() {
  const source = await fs.readFile("scripts/examples/029-format-json-copy.ts", "utf8");
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
  const tempFile = path.join(os.tmpdir(), `copicu-format-json-test-${Date.now()}.mjs`);
  globalThis.defineAction = (definition) => definition;
  globalThis.copicu = {};
  await fs.writeFile(tempFile, moduleSource, "utf8");
  try {
    const module = await import(`${pathToFileURL(tempFile).href}?t=${Date.now()}`);
    return module.formatJson;
  } finally {
    await fs.rm(tempFile, { force: true });
  }
}

test("formatJson pretty-prints compact synthetic JSON", async () => {
  const formatJson = await loadFormatJson();
  const result = formatJson('{"title":"Synthetic release note","checks":["build","visual"],"privacy":{"usesRealClipboardData":false}}');

  assert.deepEqual(result, {
    ok: true,
    formatted: [
      "{",
      '  "title": "Synthetic release note",',
      '  "checks": [',
      '    "build",',
      '    "visual"',
      "  ],",
      '  "privacy": {',
      '    "usesRealClipboardData": false',
      "  }",
      "}",
    ].join("\n"),
  });
});

test("formatJson reports invalid JSON without returning payload content", async () => {
  const formatJson = await loadFormatJson();
  const privateLookingPayload = '{"token":"synthetic-secret-looking-value","broken":';
  const result = formatJson(privateLookingPayload);

  assert.equal(result.ok, false);
  assert.equal(result.errorName, "SyntaxError");
  assert.equal(JSON.stringify(result).includes("synthetic-secret-looking-value"), false);
  assert.equal(JSON.stringify(result).includes("broken"), false);
});
