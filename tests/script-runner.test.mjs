import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createInterface } from "node:readline";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const runner = fileURLToPath(new URL("../scripts/copicu-script-runner.mjs", import.meta.url));

async function runScript(source, { historyItem = null, hostResults = {}, input = {} } = {}) {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), "copicu-script-runner-test-"));
  const actionFile = path.join(folder, "action.ts");
  const logsFolder = path.join(folder, "logs");
  await fs.writeFile(actionFile, source, "utf8");

  const child = spawn(process.execPath, [runner], { stdio: ["pipe", "pipe", "pipe"] });
  const exited = once(child, "exit");
  const lines = [];
  let stderr = "";
  child.stderr.setEncoding("utf8").on("data", (text) => {
    stderr += text;
  });
  const output = createInterface({ input: child.stdout });
  const timer = setTimeout(() => child.kill(), 10_000);

  try {
    child.stdin.write(`${JSON.stringify({
      actionFile,
      logsFolder,
      action: { id: "tests.runner", title: "Runner test" },
      context: {
        trigger: "devRun",
        activeItemId: "42",
        currentItemId: "42",
        selectedItemIds: ["42"],
        visibleItemIds: ["42"],
        view: { query: "", visibleItemIds: ["42"] },
      },
      selectionItems: [],
      ...input,
    })}\n`);

    for await (const line of output) {
      const message = JSON.parse(line);
      lines.push(message);
      if (message.kind === "hostCall") {
        let result = null;
        if (message.method === "history.get") {
          result = typeof historyItem === "function" ? historyItem(message) : historyItem;
        } else if (Object.hasOwn(hostResults, message.method)) {
          const configured = hostResults[message.method];
          result = typeof configured === "function" ? configured(message) : configured;
        }
        child.stdin.write(`${JSON.stringify({ kind: "hostResponse", id: message.id, result })}\n`);
      } else if (message.kind === "result") {
        child.stdin.end();
      }
    }

    const [code, signal] = await exited;
    return { lines, code, signal, stderr };
  } finally {
    clearTimeout(timer);
    child.kill();
    await fs.rm(folder, { recursive: true, force: true });
  }
}

function resultOf(run) {
  return run.lines.find((line) => line.kind === "result")?.result;
}

test("preserves real newlines, literal backslashes, and regex whitespace through TypeScript host round trip", async () => {
  const item = { id: "42", kind: "text", text: "alpha\nbeta\\ngamma" };
  const run = await runScript(String.raw`
    export default defineAction({
      id: "tests.escapeRoundTrip",
      title: "Escape round trip",
      async run(ctx) {
        const before = await copicu.history.get(ctx.activeItemId, { content: true });
        const parts = before.text.split(/\s+/);
        await copicu.history.update(ctx.activeItemId, { text: parts.join("\n\n") });
        const after = await copicu.history.get(ctx.activeItemId, { content: true });
        const lineFeeds = [...after.text].filter(c => c.charCodeAt(0) === 10).length;
        return {
          checks: {
            storedMatchesExpected: after.text === "alpha\n\nbeta\\ngamma",
            realBlankLine: lineFeeds === 2,
            literalBackslashPreserved: after.text.includes("\\n"),
          },
          counts: { lineFeeds, values: parts.length },
          itemIds: [ctx.activeItemId],
        };
      },
    });
  `, {
    historyItem: item,
    hostResults: {
      "history.update": message => { item.text = message.payload.patch.text; },
    },
  });

  const result = resultOf(run);
  assert.equal(run.code, 0, run.stderr);
  assert.equal(result.status, "completed");
  assert.deepEqual(result.verification, {
    checks: { storedMatchesExpected: true, realBlankLine: true, literalBackslashPreserved: true },
    counts: { lineFeeds: 2, values: 2 },
    itemIds: ["42"],
  });
  assert.equal(item.text, "alpha\n\nbeta\\ngamma");
});

test("reports a read-back mismatch as a false verification and failed script", async () => {
  let written = null;
  const run = await runScript(String.raw`
    export default defineAction({
      id: "tests.readBack",
      title: "Read back",
      async run() {
        const expected = "new\nvalue";
        await copicu.history.update("42", { text: expected });
        const observed = await copicu.history.get("42", { content: true });
        return {
          checks: { storedMatchesExpected: observed.text === expected },
          counts: { writes: 1 },
          itemIds: ["42"],
        };
      },
    });
  `, {
    historyItem: { id: "42", text: "new\\nvalue" },
    hostResults: { "history.update": message => { written = message.payload.patch.text; } },
  });

  const result = resultOf(run);
  assert.equal(run.code, 0, run.stderr);
  assert.equal(result.status, "failed");
  assert.equal(result.verification.checks.storedMatchesExpected, false);
  assert.equal(written, "new\nvalue");
});

test("rejects invalid reports without echoing submitted string values", async () => {
  const secret = "submitted-verification-secret-9f4a";
  const run = await runScript(String.raw`
    export default defineAction({
      id: "tests.invalidString",
      title: "Invalid string",
      run() {
        return { checks: { confirmed: true }, secret: "submitted-verification-secret-9f4a" };
      },
    });
  `);

  const result = resultOf(run);
  assert.equal(run.code, 0, run.stderr);
  assert.equal(result.status, "failed");
  assert.equal(result.verification, null);
  assert.ok(!JSON.stringify(result).includes(secret));
});

test("rejects invalid numeric report values instead of reporting completion", async () => {
  const run = await runScript(String.raw`
    export default defineAction({
      id: "tests.invalidNumber",
      title: "Invalid number",
      run() {
        return { checks: { confirmed: true }, counts: { processed: Number.POSITIVE_INFINITY } };
      },
    });
  `);

  const result = resultOf(run);
  assert.equal(run.code, 0, run.stderr);
  assert.equal(result.status, "failed");
  assert.equal(result.verification, null);
});


test("keeps void scripts unverified", async () => {
  const run = await runScript(String.raw`
    export default defineAction({
      id: "tests.void",
      title: "Void script",
      run() {},
    });
  `);

  const result = resultOf(run);
  assert.equal(run.code, 0, run.stderr);
  assert.equal(result.status, "completed");
  assert.equal(result.verification, null);
});
