/// <reference path="./copicu-action.d.ts" />

export default defineAction({
  id: "examples.joinSelectedWithLogName",
  title: "Join selected with custom log",
  description: "Joins selected text items and writes to a custom log file name.",
  triggers: ["itemMenu", "commandPalette", "localShortcut", "devRun"],
  shortcut: "Ctrl+Alt+J",
  input: {
    source: "pickerSelection",
    selection: "oneOrMore",
    kinds: ["text"],
    mime: ["text/plain"],
  },
  capabilities: ["history:read-content", "clipboard:write", "ui:toast", "log:write"],
  logging: {
    name: "join-selected.jsonl",
  },
  async run() {
    const items = await copicu.selection.items({ content: true });
    const textItems = items.filter((item) => item.kind === "text" && item.text?.trim());

    if (textItems.length === 0) {
      await copicu.ui.toast({
        title: "Nothing to join",
        message: "Selected items do not contain text.",
        tone: "warning",
      });
      return;
    }

    const joined = textItems
      .map((item) => item.text?.trim())
      .filter(Boolean)
      .join("\n\n---\n\n");

    await copicu.clipboard.writeText(joined);
    await copicu.log.info("joined selected items", {
      selectedCount: items.length,
      joinedCount: textItems.length,
      outputChars: joined.length,
      itemIds: textItems.map((item) => item.id),
    });
    await copicu.ui.toast({
      title: "Joined selected",
      message: `${textItems.length} items copied as one text block.`,
      tone: "success",
      durationMs: 3200,
    });
  },
});
