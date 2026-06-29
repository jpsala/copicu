import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText, Output } from "ai";
import { z } from "zod";

const requestSchema = z.object({
  query: z.string().min(1).max(500),
  currentQuery: z.string().max(500).optional().default(""),
  endpoint: z.string().url(),
  model: z.string().min(1),
  apiKey: z.string().min(1),
});

const planSchema = z.object({
  intent: z.enum(["search_history", "history_action"]),
  query: z.string().max(500),
  explanation: z.string().max(500),
  needsClarification: z.string().max(300).nullable(),
  warnings: z.array(z.string().max(240)).max(5),
  action: z
    .object({
      type: z.literal("run_ai_script"),
      prompt: z.string().min(1).max(800),
    })
    .nullable(),
});

try {
  const input = JSON.parse(await readStdin());
  const request = requestSchema.parse(input);

  if (process.env.COPICU_AI_PLANNER_MOCK_PLAN) {
    const mockPlan = planSchema.parse(JSON.parse(process.env.COPICU_AI_PLANNER_MOCK_PLAN));
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
      "You are Copicu's local clipboard history query planner.",
      "Convert the user's natural language request into either a search plan or a generic AI script action request.",
      "Do not ask for, mention, infer, or require actual clipboard clip contents.",
      "Never generate SQL, shell commands, file paths, or raw clipboard actions.",
      "Supported filters: meta:term, metadata:term, title:term, notes:term, ctx:term, context:term, tag:name, #name, kind:text, kind:image, mime:image/*, has:notes, has:title, has:tags, has:metadata, has:mime, has:blob, has:image, is:marked, is:unmarked, after:today, after:yesterday, after:7d, before:YYYY-MM-DD, on:YYYY-MM-DD, quoted phrases, and -exclusions.",
      "For action requests that change history, clipboard, picker state, metadata, marked state, paste, or UI, return intent history_action and action { type: 'run_ai_script', prompt: original user request }.",
      "Do not invent action-specific tools such as mark_positions, mark_random, tag_batch, or copy_joined.",
      "For requests like 'mark 3 with text openrouter', return history_action and preserve the exact user request in action.prompt.",
      "For requests like 'mark the 8, 9 and 10th', return history_action and preserve the exact user request in action.prompt.",
      "If the user asks for unsupported source app/window filters, keep useful text/date/tag/kind filters and add a warning.",
      "If the request is too ambiguous to search or act, set needsClarification and use a conservative query/action null.",
    ].join("\n"),
    prompt: JSON.stringify({
      naturalLanguageQuery: request.query,
      currentPickerQuery: request.currentQuery,
      outputContract: {
        intent: "search_history or history_action",
        query: "Copicu deterministic query syntax to display/run for search; empty string allowed for all recent history action",
        explanation: "short user-facing explanation",
        needsClarification: "question string or null",
        warnings: "array of unsupported or ambiguity notes, empty if none",
        action: "null for search, or run_ai_script action object for action requests",
      },
    }),
  });

  process.stdout.write(JSON.stringify(output));
} catch (error) {
  process.stderr.write(`[AI_PLANNER_ERROR] ${formatPlannerError(error)}\n`);
  process.exit(1);
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
