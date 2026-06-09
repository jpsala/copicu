import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText } from "ai";
import { z } from "zod";

const itemSchema = z.object({
  id: z.string().min(1).max(80),
  kind: z.string().max(40).nullable().optional(),
  title: z.string().max(240).nullable().optional(),
  text: z.string().max(12000).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  tags: z.array(z.string().max(80)).max(40).optional().default([]),
  mimePrimary: z.string().max(120).nullable().optional(),
});

const requestSchema = z.object({
  instruction: z.string().min(1).max(1000),
  context: z
    .object({
      title: z.string().max(120).optional(),
      source: z.string().max(120).optional(),
      currentQuery: z.string().max(500).optional(),
      currentItemId: z.string().max(80).optional(),
      selectedItemIds: z.array(z.string().max(80)).max(200).optional().default([]),
      visibleItemIds: z.array(z.string().max(80)).max(200).optional().default([]),
    })
    .optional()
    .default({}),
  items: z.array(itemSchema).min(1).max(200),
  endpoint: z.string().url(),
  model: z.string().min(1),
  apiKey: z.string().min(1),
});

try {
  const input = JSON.parse(await readStdin());
  const request = requestSchema.parse(input);
  const provider = createOpenAICompatible({
    name: "openai-compatible",
    baseURL: request.endpoint.replace(/\/+$/, ""),
    apiKey: request.apiKey,
  });

  const compactItems = request.items.map((item) => ({
    id: item.id,
    kind: item.kind ?? "unknown",
    title: item.title ?? null,
    tags: item.tags ?? [],
    notes: item.notes ?? null,
    text: truncate(item.text ?? "", 8000),
  }));

  const { text } = await generateText({
    model: provider(request.model),
    system: [
      "You are a free-form assistant for a local clipboard manager.",
      "Every response must be valid Markdown. Return only Markdown.",
      "Use only the provided items. Do not invent facts.",
      "Preserve important code identifiers, URLs, commands, filenames, and decisions.",
      "Follow the user's instruction exactly: summarize, compare, rewrite, extract, translate, draft, classify, or answer as requested.",
      "When content is repetitive, group it. When content is mixed, organize by theme.",
      "Do not include private raw text verbatim unless it is a short identifier needed for clarity.",
      "Prefer a clear heading, compact bullets, and short sections unless the instruction asks for another Markdown shape.",
    ].join("\n"),
    prompt: JSON.stringify({
      instruction: request.instruction,
      context: {
        title: request.context.title ?? "Copicu Markdown response",
        source: request.context.source ?? "copicu.ai.respondMarkdown",
        currentQuery: request.context.currentQuery ?? "",
        currentItemId: request.context.currentItemId ?? null,
        selectedItemIds: request.context.selectedItemIds ?? [],
        visibleItemIds: request.context.visibleItemIds ?? [],
      },
      itemCount: compactItems.length,
      items: compactItems,
    }),
  });

  process.stdout.write(JSON.stringify(text.trim()));
} catch (error) {
  process.stderr.write(`[AI_MARKDOWN_SUMMARY_ERROR] ${formatError(error)}\n`);
  process.exit(1);
}

function truncate(value, maxLength) {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength)}\n[truncated]`;
}

async function readStdin() {
  let data = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) {
    data += chunk;
  }
  return data;
}

function formatError(error) {
  if (error instanceof SyntaxError) {
    return "invalid JSON input";
  }
  if (error instanceof z.ZodError) {
    return `schema validation failed: ${formatZodIssues(error.issues)}`;
  }
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/sk-[a-zA-Z0-9_-]+/g, "[redacted]")
    .replace(/gsk_[a-zA-Z0-9_-]+/g, "[redacted]")
    .replace(/[A-Za-z0-9_-]{32,}/g, "[redacted]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
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
