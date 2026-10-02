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

async function runScript(source, { historyItem = null, hostResults = {}, hostErrors = {}, input = {} } = {}) {
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
        child.stdin.write(`${JSON.stringify({ kind: "hostResponse", id: message.id, result, error: hostErrors[message.method] })}\n`);
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

test("shared publication uses host-owned channels and queue for transformed and generated text", async () => {
  const run = await runScript(String.raw`
    export default defineAction({ id: "tests.share", title: "Share", async run() {
      const channels = await copicu.sharedClipboard.channels();
      const ids = await copicu.selection.ids();
      for (const id of ids) {
        const item = await copicu.history.get(id, { content: true });
        const queued = await copicu.sharedClipboard.publish({ channelId: channels[0].id, text: item.text.toUpperCase() });
        if (queued.state !== "queued") throw new Error("publication was not admitted");
      }
      await copicu.sharedClipboard.publish({ channelId: channels[0].id, text: "generated synthetic text" });
    }});
  `, {
    historyItem: { id: "42", kind: "text", text: "synthetic selected clip" },
    hostResults: {
      "sharedClipboard.channels": [{ id: "home", name: "Home" }],
      "sharedClipboard.publish": { publicationId: "publication-1", state: "queued" },
    },
  });
  assert.equal(run.code, 0, run.stderr);
  assert.equal(resultOf(run).status, "completed");
  const calls = run.lines.filter(line => line.kind === "hostCall" && line.method === "sharedClipboard.publish");
  assert.deepEqual(calls.map(call => call.payload), [
    { channelId: "home", text: "SYNTHETIC SELECTED CLIP" },
    { channelId: "home", text: "generated synthetic text" },
  ]);
  assert.deepEqual(resultOf(run).operations, []);
});

test("shared SDK rejects invalid explicit channel or nontext without admitting a host operation", async () => {
  for (const options of [{ channelId: "home", text: 42 }, { channelId: "*", text: "synthetic" }]) {
    const run = await runScript(`export default defineAction({ id: "tests.shareInvalid", title: "Share invalid", async run() {
      await copicu.sharedClipboard.publish(${JSON.stringify(options)});
    }});`);
    assert.equal(run.code, 0, run.stderr);
    assert.equal(resultOf(run).status, "failed");
    assert.equal(run.lines.filter(line => line.kind === "hostCall").length, 0);
  }
});

test("shared SDK resolves configured target and observes scoped state without claiming delivery", async () => {
  const run = await runScript(`export default defineAction({ id: "tests.target", title: "Configured target", async run() {
    const target = await copicu.sharedClipboard.target();
    const state = await copicu.sharedClipboard.state();
    await copicu.sharedClipboard.publish({ text: "synthetic-configured-target" });
  }});`, { hostResults: { "sharedClipboard.target": "home", "sharedClipboard.state": { sendPaused:false,receivePaused:false,resources:[],publications:[] }, "sharedClipboard.publish": {publicationId:"configured-publication",state:"queued"} } });
  assert.equal(resultOf(run).status,"completed");
  assert.deepEqual(run.lines.find(line => line.method === "sharedClipboard.publish").payload,{channelId:"home",text:"synthetic-configured-target"});
  const missing = await runScript(`export default defineAction({id:"tests.noTarget",title:"No target",async run(){await copicu.sharedClipboard.publish({text:"synthetic-no-target"});}});`, {hostResults:{"sharedClipboard.target":null}});
  assert.equal(resultOf(missing).status,"failed");
  assert.equal(missing.lines.filter(line=>line.method==="sharedClipboard.publish").length,0);
});

test("shared reception exposes host provenance and reads immutable text through a scoped host call", async () => {
  const provenance = { channelId: "home", publicationId: "publication-9", originDeviceId: "synthetic-remote", generation: 3 };
  const run = await runScript(String.raw`
    export default defineAction({ id: "tests.receive", title: "Receive", async run(ctx) {
      if (ctx.sharedReception.text !== undefined) throw new Error("unguarded text in context");
      const received = await copicu.sharedClipboard.received();
      return { checks: { provenancePreserved: ctx.sharedReception.originDeviceId === "synthetic-remote", immutableTextRead: received.text === "synthetic incoming text" }, counts: { receptions: 1 } };
    }});
  `, { input: { sharedReception: provenance, context: { trigger: "sharedReception", selectedItemIds: [] } },
    hostResults: { "sharedClipboard.received": { text: "synthetic incoming text" } } });
  assert.equal(run.code, 0, run.stderr);
  assert.equal(resultOf(run).status, "completed");
  assert.deepEqual(run.lines.find(line => line.method === "sharedClipboard.received").payload, {});
  assert.deepEqual(resultOf(run).verification.checks, { provenancePreserved: true, immutableTextRead: true });
});

test("shared history keeps the opaque cursor and performs no implicit publication", async () => {
  const run = await runScript(`export default defineAction({ id: "tests.sharedHistory", title: "Read history", async run() {
    const page = await copicu.sharedClipboard.history({ channelId: "home", cursor: "9007199254740993" });
    return { checks: { pageRead: page.entries.length === 1 } };
  }});`, { hostResults: { "sharedClipboard.history": { entries: [{ publicationId: "synthetic-history" }], before: null, head: "9007199254740994", floor: "0" } } });
  assert.equal(resultOf(run).status, "completed");
  assert.deepEqual(run.lines.find(line => line.method === "sharedClipboard.history").payload, { channelId: "home", cursor: "9007199254740993" });
  assert.equal(run.lines.filter(line => line.method === "sharedClipboard.publish").length, 0);
});

test("host admission denial fails publication without claiming delivery or exposing the submitted text", async () => {
  const run = await runScript(String.raw`
    export default defineAction({ id: "tests.deniedShare", title: "Denied share", async run() {
      await copicu.sharedClipboard.publish({ channelId: "home", text: "synthetic-private-input-123" });
    }});
  `, { hostErrors: { "sharedClipboard.publish": "channel is paused" } });
  assert.equal(run.code, 0, run.stderr);
  const result = resultOf(run);
  assert.equal(result.status, "failed");
  assert.deepEqual(result.operations, []);
  assert.ok(!JSON.stringify(result).includes("synthetic-private-input-123"));
});

test("receiver transformed clipboard output stays deferred and redacted for guarded host admission", async () => {
  const run = await runScript(String.raw`
    export default defineAction({ id: "tests.receiverWriter", title: "Receiver writer", async run() {
      const received = await copicu.sharedClipboard.received();
      await copicu.clipboard.writeText(received.text.toUpperCase());
    }});
  `, { input: { context: { trigger: "sharedReception", selectedItemIds: [] },
      sharedReception: { channelId: "home", publicationId: "publication-9", originDeviceId: "synthetic-remote", generation: 3 } },
    hostResults: { "sharedClipboard.received": { text: "synthetic receiver source" } } });
  assert.equal(run.code, 0, run.stderr);
  const result = resultOf(run);
  assert.equal(result.status, "completed");
  assert.deepEqual(result.rawOperations, [{ type: "clipboard.writeText", text: "SYNTHETIC RECEIVER SOURCE" }]);
  assert.deepEqual(result.operations, [{ type: "clipboard.writeText", textLength: 25 }]);
  assert.ok(!JSON.stringify(result.operations).includes("SYNTHETIC RECEIVER SOURCE"));
  assert.equal(run.lines.filter(line => line.kind === "hostCall").length, 1);
});

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
