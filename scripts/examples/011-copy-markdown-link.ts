/// <reference path="./copicu-action.d.ts" />

const urlPattern = /\bhttps?:\/\/[^\s<>"')\]]+/i;

function markdownEscapeLabel(label: string) {
  return label.replace(/\\/g, "\\\\").replace(/\]/g, "\\]");
}

export default defineAction({
  id: "examples.copyMarkdownLink",
  title: "Copy Markdown link",
  description: "Extracts the first URL from the selected text clip and copies a Markdown link.",
  triggers: ["itemMenu"],
  input: {
    source: "pickerSelection",
    selection: "one",
    kinds: ["text"],
  },
  capabilities: ["history:read-content", "clipboard:write", "ui:toast", "log:write"],
  logging: {
    name: "copy-markdown-link.jsonl",
  },
  async run(ctx) {
    const itemId = ctx.currentItemId ?? ctx.selectedItemIds[0];
    const item = await copicu.history.get(itemId, { content: true });
    const url = item.text?.match(urlPattern)?.[0];

    if (!url) {
      await copicu.log.warn("selected item has no url", { itemId: item.id });
      await copicu.ui.toast({
        title: "No URL found",
        message: "Selected clip does not contain a URL.",
        tone: "warning",
      });
      return;
    }

    const label =
      item.title?.trim() ||
      item.text
        ?.replace(url, "")
        .split(/\r?\n/, 1)[0]
        ?.trim() ||
      "Link";
    const markdown = `[${markdownEscapeLabel(label)}](${url})`;

    await copicu.clipboard.writeText(markdown);
    await copicu.log.info("markdown link copied", {
      itemId: item.id,
      urlLength: url.length,
      labelLength: label.length,
    });
    await copicu.ui.toast({
      title: "Markdown copied",
      message: "First URL was copied as a Markdown link.",
      tone: "success",
    });
  },
});
