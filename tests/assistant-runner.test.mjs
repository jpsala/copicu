import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

const runner = fileURLToPath(new URL("../scripts/copicu-assistant-runner.mjs", import.meta.url));
const event = (payload) => `data: ${JSON.stringify(payload)}\n\n`;
const delta = (content) => event({ choices: [{ delta: { content } }] });
const finish = (reason = "stop") => event({ choices: [{ delta: {}, finish_reason: reason }] });
const call = (id, name, args, index = 0) => ({ index, id, type: "function", function: { name, arguments: args } });
const tools = [{ name: "history_get", description: "Read an item", parameters: { type: "object", properties: { itemId: { type: "string" } } }, effect: "read" }];

async function scenario(responses, options = {}) {
  const requests = [];
  const server = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    requests.push(JSON.parse(body));
    res.writeHead(200, { "content-type": "text/event-stream" });
    const chunks = typeof responses === "function" ? responses(requests.at(-1), requests.length - 1) : responses[requests.length - 1];
    for (const chunk of chunks ?? []) {
      res.write(chunk);
      await new Promise((resolve) => setTimeout(resolve, 1));
    }
    res.end();
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const child = spawn(process.execPath, [runner], { stdio: ["pipe", "pipe", "pipe"] });
  const exited = once(child, "exit");
  const lines = [];
  let stderr = "";
  child.stderr.setEncoding("utf8").on("data", (text) => { stderr += text; });
  const output = createInterface({ input: child.stdout });
  const timer = setTimeout(() => child.kill(), 15000);
  try {
    child.stdin.write(`${JSON.stringify({
      kind: "start", endpoint: `http://127.0.0.1:${server.address().port}/v1`, model: "fixture", apiKey: "test-key",
      messages: options.messages ?? [{ role: "user", content: "Describe these items" }],
      context: { activeItemId: "1", selectedItemIds: ["1", "2"], query: "", visibleItemIds: ["1", "2"] }, tools,
      ...(options.start ?? {}),
    })}\n`);
    for await (const line of output) {
      const message = JSON.parse(line);
      lines.push(message);
      if (message.kind === "toolCall" && options.disconnectOnToolCall) {
        child.stdin.end();
        continue;
      }
      if (message.kind === "toolCall") {
        const response = options.toolResponse?.(message)
          ?? { result: options.toolResult?.(message) ?? { itemId: "1", text: "synthetic" } };
        child.stdin.write(`${JSON.stringify({ kind: "toolResult", id: message.id, ...response })}\n`);
      }
    }
    const [code, signal] = await exited;
    assert.equal(signal, null, `runner was killed or timed out: ${stderr}`);
    assert.ok(code === 0 || code === 1, `runner crashed with ${code}: ${stderr}`);
    return { lines, requests, code };
  } finally {
    clearTimeout(timer);
    child.kill();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}

test("halts on failed verification before queued tools or another provider request", async () => {
  const result = await scenario([
    [event({ choices: [{ delta: { tool_calls: [
      call("verify", "action_run", '{"actionId":"local.format"}', 0),
      call("fallback", "history_get", '{"itemId":"1"}', 1),
    ] }, finish_reason: "tool_calls" }] })],
    [delta("Unexpected recovery"), finish()],
  ], {
    toolResponse: () => ({ error: "Local read-back verification failed", fatal: true }),
  });
  assert.equal(result.code, 1);
  assert.equal(result.requests.length, 1);
  assert.deepEqual(result.lines.filter(line => line.kind === "toolCall").map(line => line.id), ["verify"]);
  assert.ok(result.lines.some(line => line.kind === "error"));
  assert.ok(!result.lines.some(line => line.kind === "done"));
});

async function catalogScenario(status, payload) {
  const server = createServer(async (req, res) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(payload));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const child = spawn(process.execPath, [runner], { stdio: ["pipe", "pipe", "pipe"] });
  const exited = once(child, "exit");
  const lines = [];
  let stderr = "";
  child.stderr.setEncoding("utf8").on("data", (text) => { stderr += text; });
  const output = createInterface({ input: child.stdout });
  const timer = setTimeout(() => child.kill(), 15000);
  try {
    child.stdin.write(`${JSON.stringify({
      kind: "listModels", endpoint: `http://127.0.0.1:${server.address().port}/v1`, apiKey: "test-key",
    })}\n`);
    for await (const line of output) lines.push(JSON.parse(line));
    const [code, signal] = await exited;
    assert.equal(signal, null);
    assert.ok(code === 0 || code === 1, `runner crashed with ${code}: ${stderr}`);
    return { lines, code };
  } finally {
    clearTimeout(timer);
    child.kill();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}

test("reconstructs streamed Unicode and JSON split between SSE chunks", async () => {
  const payload = Buffer.from(delta("OCR: café"));
  const split = payload.indexOf(Buffer.from("é")) + 1;
  const result = await scenario([[payload.subarray(0, split), payload.subarray(split), finish(), "data: [DONE]\n\n"]]);
  assert.equal(result.code, 0);
  assert.equal(result.lines.filter((line) => line.kind === "delta").map((line) => line.text).join(""), "OCR: café");
  assert.equal(result.lines.at(-1).messages.at(-1).content, "OCR: café");
});

test("sends the selected reasoning effort in the provider request", async () => {
  const result = await scenario([[delta("Luna response"), finish()]], {
    start: { model: "openai/gpt-5.6-luna", reasoningEffort: "high" },
  });
  assert.equal(result.requests[0].model, "openai/gpt-5.6-luna");
  assert.equal(result.requests[0].reasoning_effort, "high");
});

test("surfaces provider model catalog errors without fabricated options", async () => {
  const result = await catalogScenario(503, { error: { message: "catalog unavailable" } });
  assert.equal(result.code, 1);
  assert.equal(result.lines.at(-1).kind, "error");
  assert.match(result.lines.at(-1).message, /HTTP 503/);
  assert.ok(!result.lines.some((line) => line.kind === "models"));
});

test("delivers the complete model catalog beyond a pipe buffer and excludes unsupported models", async () => {
  const advertised = Array.from({ length: 1800 }, (_, index) => ({
    id: `fixture-${index}`,
    name: `Model ${index} ${"x".repeat(96)}`,
    supported_parameters: ["tools"],
    reasoning: { supported_efforts: ["high", "low"] },
  }));
  const result = await catalogScenario(200, {
    data: [...advertised, { id: "not-a-tool-model", supported_parameters: [] }],
  });
  assert.equal(result.code, 0);
  const available = result.lines.find((line) => line.kind === "models").models;
  assert.deepEqual(new Set(available.map((model) => model.id)), new Set(advertised.map((model) => model.id)));
  assert.deepEqual(available.find((model) => model.id === "fixture-1799").reasoningEfforts, ["high", "low"]);
});

test("rejects an oversized model catalog without returning partial options", async () => {
  const result = await catalogScenario(200, { data: [{ id: "oversized", name: "x".repeat(2 * 1024 * 1024) }] });
  assert.equal(result.code, 1);
  assert.match(result.lines.at(-1).message, /response budget/);
  assert.ok(!result.lines.some((line) => line.kind === "models"));
});

test("continues tool use with ordered opaque reasoning state without displaying it", async () => {
  const blocks = [
    { type: "reasoning.encrypted", data: "opaque-first", id: "reason-1", index: 0 },
    { type: "reasoning.encrypted", data: "opaque-second", id: "reason-2", index: 1 },
  ];
  const result = await scenario((request, turn) => {
    if (turn === 0) return [
      ...blocks.map((block) => event({ choices: [{ delta: { reasoning_details: [block] } }] })),
      event({ choices: [{ delta: { tool_calls: [call("read-1", "history_get", '{"itemId":"1"}')] } }] }),
      finish("tool_calls"),
    ];
    const state = request.messages.findLast((message) => message.role === "assistant")?.reasoning_details;
    return state?.[0]?.data === "opaque-first" && state?.[1]?.data === "opaque-second"
      ? [delta("Continuation accepted"), finish()]
      : [event({ error: { message: "required reasoning continuation is missing or reordered" } })];
  });
  assert.equal(result.code, 0);
  assert.equal(result.lines.filter((line) => line.kind === "delta").map((line) => line.text).join(""), "Continuation accepted");
});

test("adds empty reasoning details to persisted GPT-OSS assistant messages", async () => {
  const messages = [
    { role: "user", content: "Earlier request" },
    { role: "assistant", content: "Earlier answer" },
    { role: "user", content: "Continue" },
  ];
  const result = await scenario((request) => {
    const priorAssistant = request.messages.find((message) => message.content === "Earlier answer");
    return Object.hasOwn(priorAssistant, "reasoning_details")
      && Array.isArray(priorAssistant.reasoning_details)
      ? [delta("Continuation accepted"), finish()]
      : [event({ error: { message: "reasoning_details is required" } })];
  }, {
    messages,
    start: { model: "openai/gpt-oss-120b" },
  });

  assert.equal(result.code, 0);
  assert.equal(result.lines.filter((line) => line.kind === "delta").map((line) => line.text).join(""), "Continuation accepted");
});

test("keeps all parallel tool replies before actual image input and omits image bytes from saved history", async () => {
  const image = "data:image/png;base64,iVBORw0KGgo=";
  const result = await scenario([
    [event({ choices: [{ delta: { tool_calls: [call("image-1", "image_read", '{"itemId":"1"}'), call("text-2", "history_get", '{"itemId":"2"}', 1)] } }] }), finish("tool_calls")],
    [delta("Total: 42.50"), finish()],
  ], { toolResult: ({ name }) => name === "image_read" ? { itemId: "1", mimeType: "image/png", dataUrl: image } : { itemId: "2", text: "notes" } });
  const history = result.requests[1].messages;
  const assistantIndex = history.findIndex((message) => message.tool_calls);
  assert.deepEqual(history.slice(assistantIndex + 1, assistantIndex + 3).map((message) => message.tool_call_id), ["image-1", "text-2"]);
  assert.equal(history[assistantIndex + 3].role, "user");
  assert.equal(history[assistantIndex + 3].content[1].image_url.url, image);
  assert.ok(!JSON.stringify(result.lines.at(-1).messages).includes("base64"), "persisted provider history must not retain image bytes");
});

test("preserves earlier turn references while adding the new selection to the latest request", async () => {
  const result = await scenario([[delta("done"), finish()]], {
    messages: [{ role: "user", content: "Earlier selection: item 99" }, { role: "assistant", content: "Item 99 recorded" }, { role: "user", content: "Now use current selection" }],
  });
  const history = result.requests[0].messages;
  assert.equal(history[1].content, "Earlier selection: item 99");
  assert.match(history.at(-1).content, /"selectedItemIds":\["1","2"\]/);
});

test("reports malformed tool arguments rather than treating them as an empty valid request", async () => {
  const result = await scenario([
    [event({ choices: [{ delta: { tool_calls: [call("bad", "history_get", '{"itemId":')] } }] }), finish("tool_calls")],
    [delta("Could not read"), finish()],
  ]);
  assert.match(result.lines.find((line) => line.kind === "toolCall").argumentError, /valid JSON/);
});

for (const [name, ending, message] of [
  ["truncated stream", "", /finish reason/],
  ["output limit", finish("length"), /length/],
  ["provider safety stop", finish("content_filter"), /content_filter/],
  ["provider error frame", event({ error: { message: "service unavailable" } }), /service unavailable/],
]) {
  test(`does not report completion for ${name}`, async () => {
    const result = await scenario([[delta("partial"), ending]]);
    assert.equal(result.code, 1);
    assert.equal(result.lines.at(-1).kind, "error");
    assert.match(result.lines.at(-1).message, message);
    assert.ok(!result.lines.some((line) => line.kind === "done"));
  });
}

test("redacts the actual configured credential even when it has no provider prefix", async () => {
  const result = await scenario([[event({ error: { message: "authentication rejected for key test-key" } })]]);
  assert.equal(result.lines.at(-1).kind, "error");
  assert.ok(!JSON.stringify(result.lines).includes("test-key"));
  assert.match(result.lines.at(-1).message, /authentication rejected/);
});

test("exits when the host disconnects while a tool result is pending", async () => {
  const result = await scenario([
    [event({ choices: [{ delta: { tool_calls: [call("pending", "history_get", '{"itemId":"1"}')] } }] }), finish("tool_calls")],
  ], { disconnectOnToolCall: true });
  assert.equal(result.code, 0);
  assert.ok(result.lines.some((line) => line.kind === "toolCall"));
  assert.ok(!result.lines.some((line) => line.kind === "done"));
});
