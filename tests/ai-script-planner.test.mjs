import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const plannerPath = path.join(repoRoot, "scripts", "ai-script-planner.mjs");

test("ai script planner accepts display query for only marked affected items", async () => {
  const script = `export default defineAction({
    id: "ai.temporary.mark-open-only",
    title: "Mark open only",
    triggers: ["devRun"],
    input: { source: "none", selection: "none" },
    capabilities: ["history:search", "history:write-metadata", "ui:toast", "log:write"],
    async run() {
      const items = await copicu.history.search("open", { limit: 3, content: false });
      for (const item of items) await copicu.history.update(item.id, { marked: true });
      await copicu.log.info("marked items", { count: items.length, ids: items.map((item) => item.id) });
      await copicu.ui.toast({ message: "Marked items", tone: "success" });
    }
  });`;
  const mockPlan = {
    id: "ai.temporary.mark-open-only",
    title: "Mark open only",
    summary: "Marks the first open matches and shows only those marked items.",
    displayQuery: "open is:marked",
    capabilities: ["history:search", "history:write-metadata", "ui:toast", "log:write"],
    script,
    warnings: [],
  };

  const result = await runPlanner(
    {
      prompt: "desmarcá todas y marcá las primeras 3 con el texto open, solo mostrá esas",
      endpoint: "https://api.groq.com/openai/v1",
      model: "openai/gpt-oss-120b",
      apiKey: "synthetic-test-key",
    },
    { COPICU_AI_SCRIPT_MOCK_PLAN: JSON.stringify(mockPlan) },
  );

  assert.equal(result.code, 0);
  assert.equal(JSON.parse(result.stdout).displayQuery, "open is:marked");
  assert.equal(result.stderr, "");
});

test("ai script planner accepts free markdown response helper", async () => {
  const script = `export default defineAction({
    id: "ai.temporary.clipboard-summary",
    title: "Clipboard summary",
    triggers: ["devRun"],
    input: { source: "none", selection: "none" },
    capabilities: ["history:search", "history:read-content", "ai:summarize", "ui:markdown-output", "log:write"],
    async run() {
      const items = await copicu.history.search("kind:text", { limit: 3, content: true });
      const markdown = await copicu.ai.respondMarkdown({
        instruction: "Summarize these clips",
        items,
        context: { title: "Summary", selectedItemIds: items.map((item) => item.id) }
      });
      await copicu.ui.markdownOutput({ title: "Summary", markdown, suggestedFileName: "summary" });
      await copicu.log.info("opened markdown output", { count: items.length });
    }
  });`;
  const mockPlan = {
    id: "ai.temporary.clipboard-summary",
    title: "Clipboard summary",
    summary: "Summarizes matching clips into Markdown.",
    displayQuery: null,
    capabilities: ["history:search", "history:read-content", "ai:summarize", "ui:markdown-output", "log:write"],
    script,
    warnings: [],
  };

  const result = await runPlanner(
    {
      prompt: "haceme un resumen markdown de los últimos clips",
      endpoint: "https://api.groq.com/openai/v1",
      model: "openai/gpt-oss-120b",
      apiKey: "synthetic-test-key",
    },
    { COPICU_AI_SCRIPT_MOCK_PLAN: JSON.stringify(mockPlan) },
  );

  assert.equal(result.code, 0);
  assert.deepEqual(JSON.parse(result.stdout).capabilities, [
    "history:search",
    "history:read-content",
    "ai:summarize",
    "ui:markdown-output",
    "log:write",
  ]);
  assert.equal(result.stderr, "");
});

function runPlanner(input, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [plannerPath], {
      cwd: repoRoot,
      env: { ...process.env, ...extraEnv },
      stdio: ["pipe", "pipe", "pipe"],
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
    child.on("close", (code) => {
      resolve({ code, stdout, stderr });
    });
    child.stdin.end(JSON.stringify(input));
  });
}
