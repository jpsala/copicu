/// <reference path="./copicu-action.d.ts" />

function firstLine(text: string | undefined) {
  return text?.split(/\r?\n/, 1)[0]?.trim() || "";
}

export default defineAction({
  id: "examples.copyTodoSummary",
  title: "Copy todo summary",
  description: "Searches todo-like text clips and copies a short summary.",
  triggers: ["commandPalette"],
  input: {
    source: "historySearch",
    selection: "none",
    kinds: ["text"],
    query: "todo",
  },
  capabilities: ["history:search", "history:read-content", "clipboard:write", "ui:toast", "log:write"],
  logging: {
    name: "copy-todo-summary.jsonl",
  },
  async run() {
    const matches = await copicu.history.search("todo", {
      limit: 10,
      content: true,
    });
    const lines = matches
      .map((item, index) => `${index + 1}. ${firstLine(item.text) || item.title || `item:${item.id}`}`)
      .filter(Boolean);

    if (lines.length === 0) {
      await copicu.log.info("todo summary found no matches", { query: "todo" });
      await copicu.ui.toast({
        title: "No todos found",
        message: "No clips matched the todo query.",
        tone: "info",
      });
      return;
    }

    const summary = lines.join("\n");
    await copicu.clipboard.writeText(summary);
    await copicu.log.info("todo summary copied", {
      matchCount: matches.length,
      summaryLength: summary.length,
      itemIds: matches.map((item) => item.id),
    });
    await copicu.ui.toast({
      title: "Todo summary copied",
      message: `${matches.length} todo-like clip(s) summarized.`,
      tone: "success",
    });
  },
});
