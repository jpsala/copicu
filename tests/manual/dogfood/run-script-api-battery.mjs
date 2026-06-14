import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const runner = path.join(repoRoot, "scripts", "run-example-action.mjs");
const scripts = [
  "scripts/examples/001-toast-hello.ts",
  "scripts/examples/002-copy-current-title.ts",
  "scripts/examples/003-join-selected-with-log-name.ts",
  "scripts/examples/005-triage-clipboard-batch.ts",
  "scripts/examples/006-tag-selected-and-note.ts",
  "scripts/examples/007-search-scripted-text.ts",
  "scripts/examples/008-filter-long-text.ts",
  "scripts/examples/009-activate-current-copy.ts",
  "scripts/examples/010-normalize-whitespace-copy.ts",
  "scripts/examples/011-copy-markdown-link.ts",
  "scripts/examples/012-copy-todo-summary.ts",
  "scripts/examples/013-paste-current-to-previous.ts",
  "scripts/examples/020-open-tag-filtered.ts",
  "scripts/examples/021-open-work-tag-filtered.ts",
  "scripts/examples/022-open-context-text-filtered.ts",
  "scripts/examples/023-open-marked-context-filtered.ts",
  "scripts/examples/024-open-prompt-filtered.ts",
  "scripts/examples/026-inspect-enrichment-active.ts",
  "tests/manual/dogfood/999-api-surface-smoke.ts",
];

const evidenceDir = process.env.COPICU_DOGFOOD_EVIDENCE_DIR
  ? path.resolve(process.env.COPICU_DOGFOOD_EVIDENCE_DIR)
  : path.join(repoRoot, ".codex-run", "dogfood-api", new Date().toISOString().replace(/[:.]/g, "-"));
await fs.mkdir(evidenceDir, { recursive: true });

const summary = [];
for (const relativeScript of scripts) {
  const absoluteScript = path.join(repoRoot, relativeScript);
  const result = await runNode([runner, absoluteScript]);
  const safeName = relativeScript.replace(/[\\/:]/g, "__");
  await fs.writeFile(path.join(evidenceDir, `${safeName}.stdout.log`), result.stdout, "utf8");
  await fs.writeFile(path.join(evidenceDir, `${safeName}.stderr.log`), result.stderr, "utf8");
  assert.equal(result.code, 0, `${relativeScript} failed\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  assert.match(result.stdout, /\[done\]/, `${relativeScript} did not finish through the mock runner`);
  summary.push({ script: relativeScript, ok: true });
  console.log(`[api-battery] ok ${relativeScript}`);
}

await fs.writeFile(path.join(evidenceDir, "summary.json"), JSON.stringify(summary, null, 2), "utf8");
console.log(`[api-battery] PASS ${summary.length} scripts`);
console.log(`Evidence: ${evidenceDir}`);

function runNode(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: repoRoot,
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}
