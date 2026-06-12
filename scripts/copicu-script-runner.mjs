import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const inputLines = readline.createInterface({
  input: process.stdin,
  crlfDelay: Number.POSITIVE_INFINITY,
});
const lineReader = inputLines[Symbol.asyncIterator]();
const firstLine = await readProtocolLine();
const input = JSON.parse(firstLine);
input.context ??= {};
input.context.selectedItemIds = Array.isArray(input.context.selectedItemIds)
  ? input.context.selectedItemIds
  : [];
input.context.activeItemId ??= input.context.currentItemId ?? null;
input.context.currentItemId ??= input.context.activeItemId ?? null;
input.context.visibleItemIds = Array.isArray(input.context.visibleItemIds)
  ? input.context.visibleItemIds
  : [];
input.selectionItems = Array.isArray(input.selectionItems) ? input.selectionItems : [];
const operations = [];
const selectedIds = input.context.selectedItemIds.map(String);
let actionDefinition = null;
let logCount = 0;
let nextHostCallId = 1;

globalThis.defineAction = (definition) => {
  actionDefinition = definition;
  return definition;
};

globalThis.console = {
  ...console,
  debug: consoleLog("debug"),
  log: consoleLog("info"),
  info: consoleLog("info"),
  warn: consoleLog("warn"),
  error: consoleLog("error"),
};

globalThis.copicu = {
  activeItem: {
    async id() {
      return input.context.activeItemId?.toString() ?? null;
    },
    async get({ content = false } = {}) {
      const activeId = input.context.activeItemId?.toString();
      const item =
        input.selectionItems.find((candidate) => candidate.id === activeId) ??
        input.selectionItems[0] ??
        null;
      return item ? withContentOption(item, content) : null;
    },
    async updateMetadata(patch) {
      const activeId = input.context.activeItemId?.toString();
      if (!activeId) {
        throw new Error("active item is not available");
      }
      await hostCall("history.update", {
        id: activeId,
        patch: normalizeHistoryPatch(patch),
      });
    },
    async copy() {
      const activeId = input.context.activeItemId?.toString();
      if (!activeId) {
        throw new Error("active item is not available");
      }
      operations.push({ type: "clipboard.writeItem", itemId: activeId });
    },
    async paste(options = {}) {
      const activeId = input.context.activeItemId?.toString();
      if (!activeId) {
        throw new Error("active item is not available");
      }
      operations.push({
        type: "picker.activate",
        itemId: activeId,
        options: normalizeActivationOptions({
          copy: true,
          markUsed: true,
          hidePicker: true,
          focusPrevious: true,
          paste: true,
          ...options,
        }),
      });
    },
    async promote() {
      const activeId = input.context.activeItemId?.toString();
      if (!activeId) {
        throw new Error("active item is not available");
      }
      await copicu.history.promote(activeId);
    },
  },
  selection: {
    async ids() {
      return selectedIds;
    },
    async current({ content = false } = {}) {
      const currentId = input.context.activeItemId?.toString() ?? input.context.currentItemId?.toString();
      const item =
        input.selectionItems.find((candidate) => candidate.id === currentId) ??
        input.selectionItems[0] ??
        null;
      return item ? withContentOption(item, content) : null;
    },
    async items({ content = false } = {}) {
      return input.selectionItems.map((item) => withContentOption(item, content));
    },
    async set(ids) {
      selectedIds.splice(0, selectedIds.length, ...ids.map(String));
    },
  },
  history: {
    async search(query, { limit = 25, content = false } = {}) {
      return hostCall("history.search", {
        query: String(query ?? ""),
        limit: normalizeLimit(limit),
        content: Boolean(content),
      });
    },
    async get(id, { content = false } = {}) {
      return hostCall("history.get", {
        id: normalizeItemId(id),
        content: Boolean(content),
      });
    },
    async update(id, patch) {
      await hostCall("history.update", {
        id: normalizeItemId(id),
        patch: normalizeHistoryPatch(patch),
      });
    },
    async remove(id) {
      await hostCall("history.remove", {
        id: normalizeItemId(id),
      });
    },
    async promote(id) {
      await this.move(id, { position: "top" });
    },
    async move(id, { position = "top" } = {}) {
      await hostCall("history.move", {
        id: normalizeItemId(id),
        position: normalizeMovePosition(position),
      });
    },
  },
  metadata: {
    async listTags() {
      return hostCall("metadata.listTags", {});
    },
    async editActive() {
      const activeId = input.context.activeItemId?.toString();
      if (!activeId) {
        throw new Error("active item is not available");
      }
      await hostCall("metadata.editActive", { id: activeId });
    },
  },
  clipboard: {
    async read() {
      return hostCall("clipboard.read", {});
    },
    async writeText(text) {
      operations.push({ type: "clipboard.writeText", text: String(text) });
    },
    async writeItem(id) {
      operations.push({ type: "clipboard.writeItem", itemId: normalizeItemId(id) });
    },
  },
  ai: {
    async respondMarkdown({ instruction, items = [], context = undefined, title = undefined } = {}) {
      const result = await hostCall("ai.respondMarkdown", {
        instruction: String(instruction ?? ""),
        context: normalizeAiResponseContext(context ?? title),
        items: Array.isArray(items) ? items.map(normalizeSummaryItem) : [],
      });
      return String(result?.markdown ?? "");
    },
    async summarizeMarkdown({ instruction, title = undefined, items = [] } = {}) {
      return globalThis.copicu.ai.respondMarkdown({
        instruction,
        items,
        context: title ? { title } : undefined,
      });
    },
  },
  enrichment: {
    async runForItem(id, options = {}) {
      return hostCall("enrichment.runForItem", {
        itemId: normalizeItemId(id),
        options: {
          apply: "apply" in options ? Boolean(options.apply) : undefined,
        },
      });
    },
    async getResult(id) {
      return hostCall("enrichment.getResult", {
        itemId: normalizeItemId(id),
      });
    },
  },
  picker: {
    async open(options = {}) {
      operations.push({
        type: "picker.open",
        options: normalizePickerOpenOptions(options),
      });
    },
    async filter(query) {
      operations.push({ type: "picker.filter", query: String(query ?? "") });
    },
    async activate(id, options = {}) {
      operations.push({
        type: "picker.activate",
        itemId: normalizeItemId(id),
        options: normalizeActivationOptions(options),
      });
    },
    async show() {
      operations.push({ type: "picker.show" });
    },
    async hide() {
      operations.push({ type: "picker.hide" });
    },
  },
  window: {
    async rememberPrevious() {
      operations.push({ type: "window.rememberPrevious" });
    },
    async focusPrevious() {
      operations.push({ type: "window.focusPrevious" });
    },
  },
  input: {
    async paste(options = {}) {
      operations.push({
        type: "input.paste",
        shortcut: normalizePasteShortcut(options.shortcut),
      });
    },
  },
  commands: {
    async run(commandId, params = {}) {
      return hostCall("commands.run", {
        commandId: normalizeHostCommandId(commandId),
        params: normalizeHostCommandParams(commandId, params),
      });
    },
  },
  ui: {
    async toast(options) {
      const toast = typeof options === "string" ? { message: options } : { ...options };
      operations.push({
        type: "ui.toast",
        toast: {
          title: typeof toast.title === "string" ? toast.title : undefined,
          message: String(toast.message ?? ""),
          tone: normalizeTone(toast.tone),
          durationMs: Number.isFinite(toast.durationMs) ? Math.max(0, toast.durationMs) : undefined,
        },
      });
    },
    async notify(options) {
      const notification = typeof options === "string" ? { body: options } : { ...options };
      operations.push({
        type: "ui.notify",
        notification: {
          title: typeof notification.title === "string" ? notification.title : undefined,
          body: String(notification.body ?? notification.message ?? ""),
        },
      });
    },
    async alert(options) {
      const prompt = typeof options === "string" ? { body: options } : { ...options };
      await hostCall("ui.alert", {
        title: typeof prompt.title === "string" ? prompt.title : undefined,
        body: String(prompt.body ?? prompt.message ?? ""),
        confirmLabel:
          typeof prompt.confirmLabel === "string" ? prompt.confirmLabel : undefined,
      });
    },
    async confirm(options) {
      const prompt = typeof options === "string" ? { body: options } : { ...options };
      return Boolean(
        await hostCall("ui.confirm", {
          title: typeof prompt.title === "string" ? prompt.title : undefined,
          body: String(prompt.body ?? prompt.message ?? ""),
          confirmLabel:
            typeof prompt.confirmLabel === "string" ? prompt.confirmLabel : undefined,
          cancelLabel: typeof prompt.cancelLabel === "string" ? prompt.cancelLabel : undefined,
        }),
      );
    },
    async input(options) {
      const prompt = typeof options === "string" ? { body: options } : { ...options };
      const value = await hostCall("ui.input", {
        title: typeof prompt.title === "string" ? prompt.title : undefined,
        body: String(prompt.body ?? prompt.message ?? ""),
        placeholder:
          typeof prompt.placeholder === "string" ? prompt.placeholder : undefined,
        defaultValue:
          typeof prompt.defaultValue === "string" ? prompt.defaultValue : undefined,
        submitLabel:
          typeof prompt.submitLabel === "string" ? prompt.submitLabel : undefined,
        cancelLabel: typeof prompt.cancelLabel === "string" ? prompt.cancelLabel : undefined,
      });
      return typeof value === "string" ? value : null;
    },
    async markdownOutput(options) {
      const output = typeof options === "string" ? { markdown: options } : { ...options };
      operations.push({
        type: "ui.markdownOutput",
        output: {
          title: String(output.title ?? "Copicu output"),
          markdown: String(output.markdown ?? output.content ?? ""),
          summary: typeof output.summary === "string" ? output.summary : undefined,
          source: typeof output.source === "string" ? output.source : undefined,
          suggestedFileName:
            typeof output.suggestedFileName === "string" ? output.suggestedFileName : undefined,
        },
      });
    },
  },
  log: {
    debug: writeLog("debug"),
    info: writeLog("info"),
    warn: writeLog("warn"),
    error: writeLog("error"),
  },
};

try {
  const source = await fs.readFile(input.actionFile, "utf8");
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
    `copicu-action-${Date.now()}-${path.basename(input.actionFile).replace(/[^a-z0-9_.-]/gi, "_")}.mjs`,
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

    await action.run({
      ...input.context,
      activeItemId: input.context.activeItemId?.toString(),
      currentItemId: input.context.currentItemId?.toString(),
      selectedItemIds: selectedIds,
      view: input.context.view
        ? {
            ...input.context.view,
            visibleItemIds: input.context.view.visibleItemIds.map(String),
          }
        : undefined,
    });
  } finally {
    await fs.rm(tempFile, { force: true });
  }

  await writeResult({
    status: "completed",
    message: `${actionDefinition?.title ?? actionDefinition?.id ?? "Script"} completed`,
    operations: operations.map(redactOperationForOutput),
    rawOperations: operations,
    logCount,
  });
} catch (error) {
  await writeResult({
    status: "failed",
    message: redactString(error instanceof Error ? error.message : String(error)),
    operations: operations.map(redactOperationForOutput),
    rawOperations: operations,
    logCount,
    errorClass: error instanceof Error ? error.name : "Error",
  });
}

async function readProtocolLine() {
  const next = await lineReader.next();
  if (next.done || typeof next.value !== "string") {
    throw new Error("script runner protocol closed");
  }
  return next.value;
}

async function writeResult(result) {
  process.stdout.write(`${JSON.stringify({ kind: "result", result })}\n`);
}

async function hostCall(method, payload) {
  const id = nextHostCallId++;
  process.stdout.write(`${JSON.stringify({ kind: "hostCall", id, method, payload })}\n`);
  const response = JSON.parse(await readProtocolLine());
  if (response.kind !== "hostResponse" || response.id !== id) {
    throw new Error(`invalid host response for ${method}`);
  }
  if (response.error) {
    throw new Error(response.error);
  }
  return response.result;
}

function withContentOption(item, content) {
  if (content) {
    return item;
  }
  const { text: _text, ...rest } = item;
  return rest;
}

function writeLog(level) {
  return async (message, data = undefined) => {
    const fileName = logFileName(actionDefinition ?? input.action);
    validateLogName(fileName);
    await fs.mkdir(input.logsFolder, { recursive: true });
    const line = JSON.stringify({
      at: new Date().toISOString(),
      level,
      actionId: input.action.id,
      message: redactString(String(message)),
      data: redact(data),
    });
    await fs.appendFile(path.join(input.logsFolder, fileName), `${line}\n`, "utf8");
    logCount += 1;
  };
}

function consoleLog(level) {
  return (...args) => {
    void writeLog(level)(`console.${level}`, { args });
  };
}

function logFileName(action) {
  return action?.logging?.name ?? `${input.action.id}.jsonl`;
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

function normalizeTone(tone) {
  return ["info", "success", "warning", "danger"].includes(tone) ? tone : "info";
}

function normalizeLimit(limit) {
  const value = Number(limit);
  if (!Number.isFinite(value)) {
    return 25;
  }
  return Math.max(1, Math.min(100, Math.trunc(value)));
}

function normalizeItemId(value) {
  if (value && typeof value === "object" && "id" in value) {
    return String(value.id);
  }
  return String(value);
}

function normalizeHistoryPatch(patch) {
  if (!patch || typeof patch !== "object") {
    return {};
  }
  const normalized = {};
  for (const key of ["text", "title", "notes"]) {
    if (key in patch) {
      normalized[key] = patch[key] == null ? null : String(patch[key]);
    }
  }
  if ("tags" in patch) {
    normalized.tags = Array.isArray(patch.tags)
      ? patch.tags.map(String)
      : patch.tags == null
        ? null
        : String(patch.tags);
  }
  if ("marked" in patch) {
    normalized.marked = Boolean(patch.marked);
  }
  return normalized;
}

function normalizeSummaryItem(item) {
  if (!item || typeof item !== "object") {
    return {
      id: String(item ?? ""),
      kind: undefined,
      title: undefined,
      text: undefined,
      notes: undefined,
      tags: [],
    };
  }
  const value = item;
  const id = value.id ?? value.itemId ?? value.item_id ?? value.historyId ?? value.history_id;
  const kind = value.kind ?? value.contentKind ?? value.content_kind;
  const mimePrimary = value.mimePrimary ?? value.mime_primary;
  return {
    id: String(id ?? ""),
    kind: typeof kind === "string" ? kind : undefined,
    title: typeof value.title === "string" ? value.title : undefined,
    text: typeof value.text === "string" ? value.text : undefined,
    notes: typeof value.notes === "string" ? value.notes : undefined,
    tags: Array.isArray(value.tags)
      ? value.tags.map(String)
      : typeof value.tags === "string"
        ? value.tags.split(/[\s,]+/).filter(Boolean)
        : [],
    mimePrimary: typeof mimePrimary === "string" ? mimePrimary : undefined,
  };
}

function normalizeAiResponseContext(context) {
  if (typeof context === "string") {
    return { title: context };
  }
  if (!context || typeof context !== "object") {
    return {};
  }
  const normalized = {};
  for (const key of ["title", "source", "currentQuery", "activeItemId", "currentItemId"]) {
    if (typeof context[key] === "string") {
      normalized[key] = context[key];
    }
  }
  for (const key of ["selectedItemIds", "visibleItemIds"]) {
    if (Array.isArray(context[key])) {
      normalized[key] = context[key].map(String).slice(0, 200);
    }
  }
  return normalized;
}

function normalizeActivationOptions(options) {
  return {
    copy: options.copy !== false,
    markUsed: options.markUsed !== false,
    hidePicker: options.hidePicker === true,
    focusPrevious: options.focusPrevious === true,
    paste: options.paste === true,
    pasteShortcut: normalizePasteShortcut(options.pasteShortcut),
  };
}

function normalizeMovePosition(position) {
  if (position !== "top") {
    throw new Error(`unsupported history move position: ${position}`);
  }
  return "top";
}

function normalizePickerOpenOptions(options) {
  const value = options && typeof options === "object" ? options : {};
  const focus = ["search", "none"].includes(value.focus) ? value.focus : "search";
  return {
    query: "query" in value && value.query != null ? String(value.query) : undefined,
    rememberPrevious: value.rememberPrevious === true,
    show: value.show !== false,
    focus,
  };
}

function normalizeHostCommandId(commandId) {
  const normalized = String(commandId ?? "");
  if (normalized !== "picker.open") {
    throw new Error(`unsupported host command: ${normalized}`);
  }
  return normalized;
}

function normalizeHostCommandParams(commandId, params) {
  switch (commandId) {
    case "picker.open":
      return normalizePickerOpenOptions(params);
    default:
      throw new Error(`unsupported host command: ${commandId}`);
  }
}

function normalizePasteShortcut(shortcut) {
  return ["default", "shiftInsert", "ctrlV"].includes(shortcut) ? shortcut : "default";
}

function redactOperationForOutput(operation) {
  if (operation.type === "clipboard.writeText") {
    return { type: operation.type, textLength: operation.text.length };
  }
  if (operation.type === "clipboard.writeItem") {
    return { type: operation.type, itemId: operation.itemId };
  }
  if (operation.type === "picker.filter") {
    return { type: operation.type, queryLength: operation.query.length };
  }
  if (operation.type === "ui.markdownOutput") {
    return {
      type: operation.type,
      title: operation.output.title,
      markdownLength: operation.output.markdown.length,
    };
  }
  return redact(operation);
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
