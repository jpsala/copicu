/// <reference path="./copicu-action.d.ts" />

function normalizeWhitespace(text: string) {
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim().replace(/\s+/g, " "))
    .filter(Boolean)
    .join("\n");
}

export default defineAction({
  id: "examples.normalizeWhitespaceCopy",
  title: "Copy normalized whitespace",
  description: "Copies the selected text clip with trimmed lines and collapsed spaces.",
  triggers: ["itemMenu", "commandPalette"],
  input: {
    source: "pickerSelection",
    selection: "one",
    kinds: ["text"],
  },
  capabilities: ["history:read-content", "clipboard:write", "ui:toast", "log:write"],
  logging: {
    name: "normalize-whitespace-copy.jsonl",
  },
  async run(ctx) {
    const itemId = ctx.currentItemId ?? ctx.selectedItemIds[0];
    const item = await copicu.history.get(itemId, { content: true });
    const normalized = normalizeWhitespace(item.text ?? "");

    await copicu.clipboard.writeText(normalized);
    await copicu.log.info("normalized whitespace copied", {
      itemId: item.id,
      inputLength: item.text?.length ?? 0,
      outputLength: normalized.length,
      lineCount: normalized ? normalized.split("\n").length : 0,
    });
    await copicu.ui.toast({
      title: "Copied normalized text",
      message: "Whitespace was normalized and copied.",
      tone: "success",
    });
  },
});
