/// <reference path="./copicu-action.d.ts" />

export default defineAction({
  id: "examples.activatePreviousGlobal",
  title: "Activate previous item",
  description: "Activates the previous clipboard item and shows which item became active.",
  shortcut: "Ctrl+Alt+ArrowUp",
  triggers: ["globalShortcut"],
  input: {
    source: "historySearch",
    selection: "active",
  },
  capabilities: [
    "history:search",
    "history:read-content",
    "picker:activate",
    "ui:toast",
    "log:write",
  ],
  logging: {
    name: "activate-previous-global.jsonl",
  },
  async run(ctx: ActionContext) {
    const activeItemId = ctx.activeItemId ?? null;
    if (!activeItemId) {
      await copicu.ui.toast({
        title: "← Previous item",
        message: "Clipboard history is empty.",
        tone: "warning",
      });
      return;
    }

    const neighborOptions = {
      direction: "older" as const,
      wrap: true,
      content: true,
    };
    const target = await copicu.history.neighbor(activeItemId, neighborOptions);
    if (!target || target.id === activeItemId) {
      await copicu.ui.toast({
        title: "← Previous item",
        message: "There is no other item to activate.",
        tone: "warning",
      });
      return;
    }

    await copicu.picker.activate(target.id, {
      copy: true,
      markUsed: true,
      hidePicker: false,
      focusPrevious: false,
      paste: false,
    });
    await copicu.ui.toast({
      title: "← Previous item",
      message: itemPreview(target),
      tone: "info",
      durationMs: 3600,
    });
    await copicu.log.info("activated previous clipboard item");
  },
});

function itemPreview(item: HistoryItem) {
  const value = item.title?.trim() || item.text?.replace(/\s+/g, " ").trim() || `[${item.kind}]`;
  return value.length > 96 ? `${value.slice(0, 95)}…` : value;
}
