import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const plannerPath = path.join(repoRoot, "scripts", "ai-query-planner.mjs");

test("ai query planner returns a validated mock plan without network", async () => {
  const mockPlan = {
    intent: "search_history",
    query: 'kind:text on:yesterday "sqlite" has:notes',
    explanation: "Searches text clips from yesterday that mention sqlite and have notes.",
    needsClarification: null,
    warnings: [],
    action: null,
  };

  const result = await runPlanner(
    {
      query: "text clips from yesterday about sqlite with notes",
      currentQuery: "",
      endpoint: "https://api.groq.com/openai/v1",
      model: "openai/gpt-oss-120b",
      apiKey: "synthetic-test-key",
    },
    { COPICU_AI_PLANNER_MOCK_PLAN: JSON.stringify(mockPlan) },
  );

  assert.equal(result.code, 0);
  assert.deepEqual(JSON.parse(result.stdout), mockPlan);
  assert.equal(result.stderr, "");
});

test("ai query planner accepts a mock history action plan", async () => {
  const mockPlan = {
    intent: "history_action",
    query: "",
    explanation: "Runs a temporary AI script for the requested history action.",
    needsClarification: null,
    warnings: [],
    action: {
      type: "run_ai_script",
      prompt: "mark the 8, 9 and 10nth",
    },
  };

  const result = await runPlanner(
    {
      query: "mark the 8, 9 and 10nth",
      currentQuery: "",
      endpoint: "https://api.groq.com/openai/v1",
      model: "openai/gpt-oss-120b",
      apiKey: "synthetic-test-key",
    },
    { COPICU_AI_PLANNER_MOCK_PLAN: JSON.stringify(mockPlan) },
  );

  assert.equal(result.code, 0);
  assert.deepEqual(JSON.parse(result.stdout), mockPlan);
  assert.equal(result.stderr, "");
});

test("ai query planner reports schema errors without stack or input payload", async () => {
  const result = await runPlanner({
    query: "find sqlite",
    currentQuery: "",
    endpoint: "https://api.groq.com/openai/v1",
    model: "openai/gpt-oss-120b",
  });

  assert.equal(result.code, 1);
  assert.match(result.stderr, /^\[AI_PLANNER_ERROR\] schema validation failed:/);
  assert.match(result.stderr, /apiKey:/);
  assert.doesNotMatch(result.stderr, /ZodError/);
  assert.doesNotMatch(result.stderr, /requestSchema/);
  assert.doesNotMatch(result.stderr, /find sqlite/);
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
