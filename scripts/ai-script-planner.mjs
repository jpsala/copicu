import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText, Output } from "ai";
import { z } from "zod";

const allowedCapabilities = [
  "history:read-content",
  "history:search",
  "history:write-metadata",
  "history:promote",
  "metadata:read-tags",
  "metadata:edit-active",
  "history:delete",
  "clipboard:read",
  "clipboard:write",
  "ui:toast",
  "ui:notify",
  "ui:alert",
  "ui:confirm",
  "ui:input",
  "ui:markdown-output",
  "ai:summarize",
  "log:write",
  "enrichment:run",
  "enrichment:read",
  "commands:run",
  "picker:open",
  "picker:filter",
  "picker:activate",
  "picker:show",
  "picker:hide",
  "window:remember-previous",
  "window:focus-previous",
  "input:paste",
];

const requestSchema = z.object({
  prompt: z.string().min(1).max(800),
  currentQuery: z.string().max(500).optional().default(""),
  visibleItemIds: z.array(z.number().int()).max(200).optional().default([]),
  activeItemId: z.number().int().nullable().optional().default(null),
  currentItemId: z.number().int().nullable().optional().default(null),
  selectedItemIds: z.array(z.number().int()).max(200).optional().default([]),
  endpoint: z.string().url(),
  model: z.string().min(1),
  apiKey: z.string().min(1),
});

const planSchema = z.object({
  id: z.string().regex(/^ai\.temporary\.[a-zA-Z0-9_.-]+$/).max(80),
  title: z.string().min(1).max(80),
  summary: z.string().min(1).max(500),
  displayQuery: z.string().max(500).nullable(),
  capabilities: z.array(z.enum(allowedCapabilities)).min(1).max(8),
  script: z.string().min(1).max(12000),
  warnings: z.array(z.string().max(240)).max(5),
});

try {
  const input = JSON.parse(await readStdin());
  const request = requestSchema.parse(input);

  if (process.env.COPICU_AI_SCRIPT_MOCK_PLAN) {
    const mockPlan = planSchema.parse(JSON.parse(process.env.COPICU_AI_SCRIPT_MOCK_PLAN));
    validateScriptSource(mockPlan.script);
    process.stdout.write(JSON.stringify(mockPlan));
    process.exit(0);
  }

  const provider = createOpenAICompatible({
    name: "openai-compatible",
    baseURL: request.endpoint.replace(/\/+$/, ""),
    apiKey: request.apiKey,
    supportsStructuredOutputs: true,
  });

  const { output } = await generateText({
    model: provider(request.model),
    output: Output.object({ schema: planSchema }),
    system: [
      "You generate temporary Copicu action scripts.",
      "Return one complete TypeScript file that exports default defineAction({...}).",
      "The script must only use the Copicu host API named copicu.* and ordinary JavaScript language features.",
      "Do not import modules. Do not use require, fs, child_process, process, fetch, XMLHttpRequest, WebSocket, eval, Function, dynamic import, shell commands, SQL, filesystem paths, or network.",
      "Do not create a special tool for the request. Compose existing APIs.",
      "Allowed APIs: copicu.activeItem.id/get/updateMetadata/copy/paste/promote, copicu.selection.ids/items, copicu.history.search(query,{limit,content}), copicu.history.get(id,{content}), copicu.history.update(id,patch), copicu.history.promote(id), copicu.history.move(id,{position:'top'}), copicu.history.remove(id), copicu.metadata.listTags/editActive, copicu.clipboard.read(), copicu.clipboard.writeText(text), copicu.clipboard.writeItem(id), copicu.enrichment.getResult(id), copicu.enrichment.runForItem(id,{apply}), copicu.ai.respondMarkdown({ instruction, items, context }), copicu.commands.run('picker.open',{query,rememberPrevious,show,focus}), copicu.picker.open({query,rememberPrevious,show,focus}), copicu.picker.filter(query), copicu.picker.activate(id,options), copicu.picker.show(), copicu.picker.hide(), copicu.window.rememberPrevious(), copicu.window.focusPrevious(), copicu.input.paste({shortcut}), copicu.ui.toast/notify/alert/confirm/input/markdownOutput, copicu.log.info/warn/error/debug.",
      "For summaries, reports, translations, cleaned compilations, comparisons, drafts, extraction, or any free-form answer from clipboard items, first gather the target items, then call copicu.ai.respondMarkdown({ instruction, items, context }), then call copicu.ui.markdownOutput({ title, markdown, summary, source, suggestedFileName }). Do not fake responses by concatenating raw content. Do not write files directly.",
      "The output of copicu.ai.respondMarkdown is always Markdown. Use it as the single free-agent helper for item-based AI responses. Do not invent deterministic tools by intent unless the user explicitly asks for a new host API.",
      "For CopyQ-style current/active item requests, use ctx.activeItemId or copicu.activeItem.*. currentItemId is a compatibility alias.",
      "For requests about checked/selected items, use ctx.selectedItemIds or copicu.selection.ids(); fetch those exact items with copicu.history.get(id,{content:true}). Do not translate checked/selected to is:marked unless selectedItemIds is empty and the user explicitly says marked.",
      "When iterating history.search results, remember each result is an item object. Pass item.id to history.get/update/remove, clipboard.writeItem, and picker.activate. Do not pass the whole item object where an ID is expected.",
      "For marking items, use copicu.history.search plus copicu.history.update(id,{ marked: true }) or marked false. Do not invent markRandom or mark_positions.",
      "For 'mark 3 more randomly', search unmarked items with query 'is:unmarked', pick 3 using Math.random, update each with marked true, log IDs/counts only, and toast a count.",
      "For requests that mention text, use the text as the displayQuery without is:unmarked after marking. Example: 'mark 3 with text openrouter' has displayQuery 'openrouter'.",
      "If the user asks to show only the items just marked or affected, include is:marked in displayQuery after marking. Example: 'unmark all and mark the first 3 with text open, only show those' has displayQuery 'open is:marked'.",
      "If the user asks to show only marked items after unmarking all and marking a new set, displayQuery may be 'is:marked' when there is no text filter.",
      "For requests that affect all history or the first items in global current order, set displayQuery null so the app shows all history after the action.",
      "If the script searches unmarked items before marking, do not use that unmarked-only query as displayQuery after the action, because the updated items would disappear.",
      "Use synthetic-safe logs: log IDs, counts, kinds and lengths, never clip text.",
      "Declare triggers ['devRun'], input { source: 'none', selection: 'none' }, and only the capabilities actually used.",
      "Use stable item IDs from API results. Do not use visible row indexes unless the user explicitly asks for visible positions.",
    ].join("\n"),
    prompt: JSON.stringify({
      userRequest: request.prompt,
      currentPickerQuery: request.currentQuery,
      visibleItemIds: request.visibleItemIds,
      activeItemId: request.activeItemId ?? request.currentItemId,
      currentItemId: request.currentItemId,
      selectedItemIds: request.selectedItemIds,
      outputContract: {
        id: "ai.temporary.<short-name>",
        title: "short title",
        summary: "what the script will do",
        displayQuery: "structured local query to show after the action, or null",
        capabilities: allowedCapabilities,
        script: "complete TypeScript source",
        warnings: "short caveats",
      },
    }),
  });

  validateScriptSource(output.script);
  process.stdout.write(JSON.stringify(output));
} catch (error) {
  process.stderr.write(`[AI_SCRIPT_PLANNER_ERROR] ${formatPlannerError(error)}\n`);
  process.exit(1);
}

function validateScriptSource(source) {
  const forbidden = [
    /\bimport\s*(?:\(|[\s{*])/,
    /\brequire\s*\(/,
    /\bfs\b/,
    /\bchild_process\b/,
    /\bprocess\b/,
    /\bfetch\s*\(/,
    /\bXMLHttpRequest\b/,
    /\bWebSocket\b/,
    /\beval\s*\(/,
    /\bFunction\s*\(/,
    /\bindexedDB\b/,
    /\blocalStorage\b/,
    /\bsessionStorage\b/,
  ];
  const match = forbidden.find((pattern) => pattern.test(source));
  if (match) {
    throw new Error(`script uses forbidden construct: ${match}`);
  }
  if (!source.includes("defineAction")) {
    throw new Error("script must export defineAction({...})");
  }
}

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
  });
}

function formatPlannerError(error) {
  if (error instanceof SyntaxError) {
    return "invalid JSON input";
  }
  if (error instanceof z.ZodError) {
    return `schema validation failed: ${formatZodIssues(error.issues)}`;
  }
  const message = error instanceof Error ? error.message : String(error);
  return redactMessage(message).slice(0, 300) || "unknown planner error";
}

function formatZodIssues(issues) {
  return issues
    .slice(0, 4)
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "root";
      return `${path}: ${issue.message}`;
    })
    .join("; ");
}

function redactMessage(value) {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/[A-Za-z0-9_-]{32,}/g, "[redacted]")
    .replace(/\s+/g, " ")
    .trim();
}
