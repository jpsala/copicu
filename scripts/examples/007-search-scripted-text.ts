/// <reference path="./copicu-action.d.ts" />

export default defineAction({
  id: "examples.searchScriptedText",
  title: "Search scripted text",
  description: "Runs a real history.search query and copies a redacted count summary.",
  triggers: ["commandPalette"],
  input: {
    source: "historySearch",
    selection: "none",
    kinds: ["text"],
    query: "kind:text #scripted",
  },
  capabilities: ["history:search", "clipboard:write", "ui:toast", "log:write"],
  logging: {
    name: "search-scripted-text.jsonl",
  },
  async run() {
    const matches = await copicu.history.search("kind:text #scripted", {
      limit: 20,
      content: false,
    });
    const byKind = matches.reduce<Record<string, number>>((counts, item) => {
      counts[item.kind] = (counts[item.kind] ?? 0) + 1;
      return counts;
    }, {});

    await copicu.clipboard.writeText(
      `Copicu scripted search found ${matches.length} item(s).`,
    );
    await copicu.log.info("history search complete", {
      query: "kind:text #scripted",
      count: matches.length,
      byKind,
      itemIds: matches.map((item) => item.id),
    });
    await copicu.ui.toast({
      title: "Search complete",
      message: `${matches.length} scripted text clip(s) found.`,
      tone: matches.length > 0 ? "success" : "info",
    });
  },
});
