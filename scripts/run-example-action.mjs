import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const scriptsFolder = path.join(os.homedir(), "Documents", "Copicu", "Scripts");
const logsFolder = path.join(scriptsFolder, ".logs");
const actionFile = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(scriptsFolder, "001-toast-hello.ts");

const mockItems = [
  {
    id: "mock-1",
    kind: "text",
    text: "https://example.test/path?source=synthetic",
    title: "Synthetic URL clip",
    notes: "",
    tags: ["#synthetic"],
    mimePrimary: "text/plain",
  },
  {
    id: "mock-2",
    kind: "text",
    text: "Copicu synthetic second clip\nwith two lines",
    title: "Synthetic note",
    notes: "existing note",
    tags: [],
    mimePrimary: "text/plain",
  },
];

let clipboardText = "";
let actionDefinition = null;
const selectedIds = mockItems.map((item) => item.id);

globalThis.defineAction = (definition) => {
  actionDefinition = definition;
  return definition;
};

globalThis.copicu = {
  activeItem: {
    async id() {
      return mockItems[0]?.id ?? null;
    },
    async get({ content = false } = {}) {
      return content ? mockItems[0] ?? null : mockItems[0] ? withoutContent(mockItems[0]) : null;
    },
    async updateMetadata(patch) {
      if (!mockItems[0]) {
        throw new Error("active item is not available");
      }
      Object.assign(mockItems[0], patch);
    },
    async copy() {
      if (!mockItems[0]) {
        throw new Error("active item is not available");
      }
      clipboardText = mockItems[0].text ?? "";
      console.log(`[activeItem.copy] ${mockItems[0].id}`);
    },
    async paste(options = {}) {
      if (!mockItems[0]) {
        throw new Error("active item is not available");
      }
      console.log(`[activeItem.paste] ${mockItems[0].id} ${JSON.stringify(options)}`);
    },
    async promote() {
      if (!mockItems[0]) {
        throw new Error("active item is not available");
      }
      await copicu.history.promote(mockItems[0].id);
    },
  },
  selection: {
    async ids() {
      return selectedIds;
    },
    async current({ content = false } = {}) {
      return content ? mockItems[0] : withoutContent(mockItems[0]);
    },
    async items({ content = false } = {}) {
      return content ? mockItems : mockItems.map(withoutContent);
    },
    async set(ids) {
      selectedIds.splice(0, selectedIds.length, ...ids);
    },
  },
  history: {
    async search(_query, { limit = 25, content = false } = {}) {
      const items = mockItems.slice(0, limit);
      return content ? items : items.map(withoutContent);
    },
    async get(id, { content = false } = {}) {
      const item = mockItems.find((candidate) => candidate.id === id);
      if (!item) {
        throw new Error(`mock item not found: ${id}`);
      }
      return content ? item : withoutContent(item);
    },
    async update(id, patch) {
      const item = mockItems.find((candidate) => candidate.id === id);
      if (!item) {
        throw new Error(`mock item not found: ${id}`);
      }
      Object.assign(item, patch);
    },
    async remove(id) {
      const index = mockItems.findIndex((candidate) => candidate.id === id);
      if (index >= 0) {
        mockItems.splice(index, 1);
      }
    },
    async promote(id) {
      await this.move(id, { position: "top" });
    },
    async move(id, { position = "top" } = {}) {
      if (position !== "top") {
        throw new Error(`unsupported history move position: ${position}`);
      }
      const index = mockItems.findIndex((candidate) => candidate.id === id);
      if (index >= 0) {
        const [item] = mockItems.splice(index, 1);
        mockItems.unshift(item);
      }
      console.log(`[history.move] ${id} ${position}`);
    },
  },
  metadata: {
    async listTags() {
      return [
        {
          id: 1,
          slug: "synthetic",
          label: "Synthetic",
          color: null,
          pinned: true,
          sortOrder: null,
          itemCount: 1,
          autoApplyEnabled: false,
        },
      ];
    },
    async editActive() {
      if (!mockItems[0]) {
        throw new Error("active item is not available");
      }
      console.log(`[metadata.editActive] ${mockItems[0].id}`);
    },
  },
  enrichment: {
    async getResult(id) {
      const item = mockItems.find((candidate) => candidate.id === id);
      if (!item) {
        throw new Error(`mock item not found: ${id}`);
      }
      return mockEnrichmentResult(item, false);
    },
    async runForItem(id, options = {}) {
      const item = mockItems.find((candidate) => candidate.id === id);
      if (!item) {
        throw new Error(`mock item not found: ${id}`);
      }
      const apply = options.apply !== false;
      const result = mockEnrichmentResult(item, apply);
      if (apply) {
        item.tags = Array.from(
          new Set([
            ...(item.tags ?? []),
            ...result.tags.filter((tag) => tag.applied).map((tag) => `#${tag.tag}`),
          ]),
        );
      }
      console.log(`[enrichment.runForItem] ${id} apply=${apply}`);
      return result;
    },
  },
  clipboard: {
    async read() {
      return { text: clipboardText };
    },
    async writeText(text) {
      clipboardText = text;
      console.log(`[clipboard.writeText] ${text.length} chars`);
    },
    async writeItem(id) {
      const item = mockItems.find((candidate) => candidate.id === id);
      clipboardText = item?.text ?? "";
      console.log(`[clipboard.writeItem] ${id}`);
    },
  },
  picker: {
    async open(options = {}) {
      console.log(`[picker.open] ${JSON.stringify(options)}`);
    },
    async filter(query) {
      console.log(`[picker.filter] ${query}`);
    },
    async activate(id, options = {}) {
      console.log(`[picker.activate] ${id} ${JSON.stringify(options)}`);
    },
    async show() {
      console.log("[picker.show]");
    },
    async hide() {
      console.log("[picker.hide]");
    },
  },
  window: {
    async rememberPrevious() {
      console.log("[window.rememberPrevious]");
    },
    async focusPrevious() {
      console.log("[window.focusPrevious]");
    },
  },
  input: {
    async paste(options = {}) {
      console.log(`[input.paste] ${JSON.stringify(options)}`);
    },
  },
  commands: {
    async run(commandId, params = {}) {
      if (commandId !== "picker.open") {
        throw new Error(`unsupported host command: ${commandId}`);
      }
      console.log(`[commands.run] ${commandId} ${JSON.stringify(params)}`);
      await copicu.picker.open(params);
    },
  },
  ui: {
    async toast(options) {
      const toast = typeof options === "string" ? { message: options } : options;
      console.log(`[toast:${toast.tone ?? "info"}] ${toast.title ?? "Toast"}: ${toast.message}`);
    },
    async notify(options) {
      const notification = typeof options === "string" ? { body: options } : options;
      console.log(`[notify] ${notification.title ?? "Copicu"}: ${notification.body}`);
    },
    async alert(options) {
      console.log(`[alert] ${options.title}: ${options.message}`);
    },
    async confirm(options) {
      console.log(`[confirm:auto-yes] ${options.title}: ${options.message}`);
      return true;
    },
    async input(options) {
      const value = options.defaultValue ?? "review";
      console.log(`[input:auto] ${options.title}: ${value}`);
      return value;
    },
    async markdownOutput(options) {
      const output = typeof options === "string" ? { markdown: options } : options;
      console.log(
        `[markdownOutput] ${output.title ?? "Copicu output"} (${String(output.markdown ?? "").length} chars)`,
      );
    },
  },
  log: {
    debug: writeLog("debug"),
    info: writeLog("info"),
    warn: writeLog("warn"),
    error: writeLog("error"),
  },
};

await fs.mkdir(logsFolder, { recursive: true });
const source = await fs.readFile(actionFile, "utf8");
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
const tempFile = path.join(
  os.tmpdir(),
  `copicu-action-${Date.now()}-${path.basename(actionFile).replace(/[^a-z0-9_.-]/gi, "_")}.mjs`,
);
await fs.writeFile(tempFile, moduleSource, "utf8");

try {
  const module = await import(pathToFileURL(tempFile).href);
  const action = module.default ?? actionDefinition;
  if (!action || typeof action.run !== "function") {
    throw new Error("script did not export defineAction({...})");
  }

  actionDefinition = action;
  validateLogName(logFileName(action));
  console.log(`[run] ${action.id} from ${actionFile}`);
  await action.run({
    trigger: "devRun",
    activeItemId: mockItems[0]?.id,
    currentItemId: mockItems[0]?.id,
    selectedItemIds: selectedIds,
    view: {
      query: "",
      visibleItemIds: mockItems.map((item) => item.id),
      currentIndex: 0,
    },
  });
  console.log(`[done] ${action.id}`);
  if (clipboardText) {
    console.log(`[clipboard] ${clipboardText.slice(0, 120).replace(/\s+/g, " ")}`);
  }
} finally {
  await fs.rm(tempFile, { force: true });
}

function withoutContent(item) {
  const { text: _text, ...rest } = item;
  return rest;
}

function writeLog(level) {
  return async (message, data = undefined) => {
    if (!actionDefinition) {
      console.log(`[log:${level}] ${message}`);
      return;
    }

    const fileName = logFileName(actionDefinition);
    validateLogName(fileName);
    const line = JSON.stringify({
      at: new Date().toISOString(),
      level,
      actionId: actionDefinition.id,
      message,
      data: redact(data),
    });
    await fs.appendFile(path.join(logsFolder, fileName), `${line}\n`, "utf8");
    console.log(`[log:${level}] ${message}`);
  };
}

function logFileName(action) {
  return action.logging?.name ?? `${action.id}.jsonl`;
}

function validateLogName(fileName) {
  if (
    !fileName ||
    fileName.includes("/") ||
    fileName.includes("\\") ||
    fileName.includes("..")
  ) {
    throw new Error(`invalid logging.name: ${fileName}`);
  }
}

function redact(value) {
  if (typeof value === "string") {
    return redactString(value);
  }
  if (Array.isArray(value)) {
    return value.map(redact);
  }
  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      /text|content|payload|secret|token|key|url/i.test(key) ? "[redacted]" : redact(entry),
    ]),
  );
}

function redactString(value) {
  return value
    .replace(/\bhttps?:\/\/\S+/gi, "[url]")
    .replace(/[A-Za-z0-9_=-]{32,}/g, "[long-token]");
}

function mockEnrichmentResult(item, apply) {
  const tags = [];
  if (typeof item.text === "string" && /^https?:\/\//i.test(item.text.trim())) {
    tags.push({
      detector: "url",
      detectorLabel: "URL",
      tag: "url",
      confidence: 1,
      applied: apply,
    });
  }
  return {
    itemId: Number.parseInt(String(item.id).replace(/\D+/g, ""), 10) || 1,
    contentKind: item.kind,
    enabled: true,
    applyMode: "autoApply",
    eligible: item.kind === "text",
    tags,
  };
}
