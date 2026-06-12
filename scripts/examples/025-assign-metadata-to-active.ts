/// <reference path="./copicu-action.d.ts" />

export default defineAction({
  id: "examples.assignMetadataToActive",
  title: "Assign metadata",
  description: "Opens the rich metadata editor for the active picker item.",
  shortcut: "Ctrl+Shift+C",
  triggers: ["itemMenu", "commandPalette", "localShortcut", "globalShortcut", "devRun"],
  input: {
    source: "pickerSelection",
    selection: "active",
  },
  capabilities: [
    "metadata:edit-active",
    "ui:toast",
    "log:write",
  ],
  logging: {
    name: "assign-metadata-to-active.jsonl",
  },
  async run(ctx) {
    await copicu.log.info("assign metadata action started", {
      trigger: ctx.trigger,
      shortcut: ctx.shortcut,
      activeItemId: ctx.activeItemId ?? ctx.currentItemId ?? null,
      selectedCount: ctx.selectedItemIds.length,
    });

    const activeItemId = ctx.activeItemId ?? ctx.currentItemId ?? null;
    if (!activeItemId) {
      await copicu.log.warn("assign metadata cancelled: no active item", {
        trigger: ctx.trigger,
        selectedCount: ctx.selectedItemIds.length,
      });
      await copicu.ui.toast({
        title: "No active item",
        message: "Select a clip first.",
        tone: "warning",
      });
      return;
    }

    await copicu.metadata.editActive();

    await copicu.log.info("opened metadata editor for active item", {
      activeItemId,
    });
    await copicu.ui.toast({
      title: "Metadata editor",
      message: "Opened metadata editor for the active item.",
      tone: "info",
    });
  },
});
