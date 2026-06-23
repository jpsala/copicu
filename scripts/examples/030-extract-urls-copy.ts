/// <reference path="./copicu-action.d.ts" />

const urlPattern = /https?:\/\/[^\s<>'")\]]+/gi;
const trailingPunctuationPattern = /[.,;:!?]+$/;

export function extractUrls(text: string) {
  const matches = text.match(urlPattern) ?? [];
  const urls = matches
    .map((url) => url.replace(trailingPunctuationPattern, ""))
    .filter((url) => {
      try {
        new URL(url);
        return true;
      } catch {
        return false;
      }
    });

  return Array.from(new Set(urls));
}

export default defineAction({
  id: "examples.extractUrlsCopy",
  title: "Extract URLs and copy",
  description: "Extracts http(s) URLs from the selected text clip and copies one URL per line.",
  triggers: ["itemMenu", "commandPalette"],
  input: {
    source: "pickerSelection",
    selection: "one",
    kinds: ["text"],
  },
  capabilities: ["history:read-content", "clipboard:write", "ui:toast", "log:write"],
  logging: {
    name: "extract-urls-copy.jsonl",
  },
  async run(ctx) {
    const itemId = ctx.currentItemId ?? ctx.activeItemId ?? ctx.selectedItemIds[0];
    if (!itemId) {
      await copicu.ui.toast({
        title: "No item selected",
        message: "Select a text clip containing one or more URLs first.",
        tone: "warning",
      });
      return;
    }

    const item = await copicu.history.get(itemId, { content: true });
    const input = item.text ?? "";
    const urls = extractUrls(input);

    if (urls.length === 0) {
      await copicu.log.warn("no urls found", {
        itemId: item.id,
        inputLength: input.length,
        urlCount: 0,
        outputLength: 0,
      });
      await copicu.ui.toast({
        title: "No URLs found",
        message: "The selected clip does not contain an http(s) URL.",
        tone: "warning",
      });
      return;
    }

    const output = urls.join("\n");
    await copicu.clipboard.writeText(output);
    await copicu.log.info("extracted urls copied", {
      itemId: item.id,
      inputLength: input.length,
      urlCount: urls.length,
      outputLength: output.length,
    });
    await copicu.ui.toast({
      title: urls.length === 1 ? "Copied 1 URL" : `Copied ${urls.length} URLs`,
      message: "Extracted URLs were copied one per line.",
      tone: "success",
    });
  },
});
