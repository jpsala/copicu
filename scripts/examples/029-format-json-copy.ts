/// <reference path="./copicu-action.d.ts" />

export type JsonFormatResult =
  | { ok: true; formatted: string }
  | { ok: false; errorName: string };

export function formatJson(text: string): JsonFormatResult {
  try {
    const parsed = JSON.parse(text);
    return { ok: true, formatted: JSON.stringify(parsed, null, 2) };
  } catch (error) {
    return {
      ok: false,
      errorName: error instanceof Error ? error.name : "UnknownError",
    };
  }
}

export default defineAction({
  id: "examples.formatJsonCopy",
  title: "Format JSON and copy",
  description: "Parses the selected text clip as JSON and copies a pretty-printed version.",
  triggers: ["itemMenu", "commandPalette"],
  input: {
    source: "pickerSelection",
    selection: "one",
    kinds: ["text"],
  },
  capabilities: ["history:read-content", "clipboard:write", "ui:toast", "log:write"],
  logging: {
    name: "format-json-copy.jsonl",
  },
  async run(ctx) {
    const itemId = ctx.currentItemId ?? ctx.activeItemId ?? ctx.selectedItemIds[0];
    if (!itemId) {
      await copicu.ui.toast({
        title: "No item selected",
        message: "Select one text clip containing JSON first.",
        tone: "warning",
      });
      return;
    }

    const item = await copicu.history.get(itemId, { content: true });
    const input = item.text ?? "";

    const result = formatJson(input);
    if (!result.ok) {
      await copicu.log.warn("json formatting failed", {
        itemId: item.id,
        inputLength: input.length,
        errorName: result.errorName,
      });
      await copicu.ui.toast({
        title: "JSON format failed",
        message: "The selected clip is not valid JSON.",
        tone: "warning",
      });
      return;
    }

    await copicu.clipboard.writeText(result.formatted);
    await copicu.log.info("formatted json copied", {
      itemId: item.id,
      inputLength: input.length,
      outputLength: result.formatted.length,
    });
    await copicu.ui.toast({
      title: "Copied formatted JSON",
      message: "Pretty-printed JSON was copied to the clipboard.",
      tone: "success",
    });
  },
});
