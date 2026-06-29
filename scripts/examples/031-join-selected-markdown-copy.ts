/// <reference path="./copicu-action.d.ts" />

function safeMarkdownHeading(text: string) {
  return text.trim().replace(/[\r\n]+/g, " ").replace(/^#+\s*/, "").trim() || "Untitled clip";
}

function formatTags(tags: string[] | undefined) {
  const cleaned = (tags ?? []).map((tag) => tag.trim()).filter(Boolean);
  return cleaned.length > 0 ? `\n\n_tags: ${cleaned.join(" ")}_` : "";
}

export function formatItemsAsMarkdown(items: HistoryItem[]) {
  const textItems = items.filter((item) => item.kind === "text" && item.text?.trim());

  const sections = textItems.map((item, index) => {
    const title = safeMarkdownHeading(item.title ?? `Clip ${index + 1}`);
    const text = item.text?.trim() ?? "";
    const tags = formatTags(item.tags);
    return `## ${title}${tags}\n\n${text}`;
  });

  return {
    itemCount: textItems.length,
    markdown: sections.length > 0 ? `# Copicu selection\n\n${sections.join("\n\n---\n\n")}` : "",
  };
}

export default defineAction({
  id: "examples.joinSelectedMarkdownCopy",
  title: "Join selected as Markdown",
  description: "Copies selected text clips as a Markdown document with headings and tags.",
  triggers: ["itemMenu", "commandPalette", "localShortcut"],
  shortcut: "Ctrl+Alt+M",
  input: {
    source: "pickerSelection",
    selection: "oneOrMore",
    kinds: ["text"],
    mime: ["text/plain"],
  },
  capabilities: ["history:read-content", "clipboard:write", "ui:toast", "log:write"],
  logging: {
    name: "join-selected-markdown.jsonl",
  },
  async run() {
    const items = await copicu.selection.items({ content: true });
    const result = formatItemsAsMarkdown(items);

    if (!result.markdown) {
      await copicu.ui.toast({
        title: "Nothing to join",
        message: "Selected items do not contain text.",
        tone: "warning",
      });
      return;
    }

    await copicu.clipboard.writeText(result.markdown);
    await copicu.log.info("joined selected items as markdown", {
      selectedCount: items.length,
      joinedCount: result.itemCount,
      outputChars: result.markdown.length,
      itemIds: items.filter((item) => item.kind === "text" && item.text?.trim()).map((item) => item.id),
    });
    await copicu.ui.toast({
      title: "Copied Markdown",
      message: `${result.itemCount} item(s) copied as a Markdown document.`,
      tone: "success",
      durationMs: 3200,
    });
  },
});
