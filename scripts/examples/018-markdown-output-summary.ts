/// <reference path="./copicu-action.d.ts" />

export default defineAction({
  id: "examples.markdownOutputSummary",
  title: "Markdown Output Summary",
  description: "Build a Markdown summary from recent text clips and open it in Copicu Output.",
  triggers: ["commandPalette", "devRun"],
  input: {
    source: "none",
    selection: "none",
  },
  capabilities: ["history:search", "history:read-content", "ui:markdown-output", "log:write"],
  logging: {
    name: "markdown-output-summary.jsonl",
    redact: true,
  },
  async run() {
    const items = await copicu.history.search("kind:text", { limit: 5, content: true });
    const sections = items.map((item, index) => {
      const text = (item.text ?? "").trim();
      const preview = text.length > 420 ? `${text.slice(0, 420)}...` : text;
      return [`### Clip ${index + 1}`, "", preview || "_Empty text item._"].join("\n");
    });

    const markdown = [
      "# Clipboard summary",
      "",
      `Generated from ${items.length} recent text clips.`,
      "",
      "## Source clips",
      "",
      sections.join("\n\n"),
    ].join("\n");

    await copicu.ui.markdownOutput({
      title: "Clipboard summary",
      summary: `${items.length} recent text clips`,
      source: "examples.markdownOutputSummary",
      suggestedFileName: "clipboard-summary",
      markdown,
    });

    await copicu.log.info("Opened Markdown output", {
      itemCount: items.length,
      itemIds: items.map((item) => item.id),
      markdownLength: markdown.length,
    });
  },
});
