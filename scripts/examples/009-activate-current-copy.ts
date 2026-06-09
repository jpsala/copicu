/// <reference path="./copicu-action.d.ts" />

export default defineAction({
  id: "examples.activateCurrentCopy",
  title: "Activate current with options",
  description: "Activates the current item with explicit copy/mark/hide/paste options.",
  triggers: ["itemMenu", "commandPalette"],
  input: {
    source: "pickerSelection",
    selection: "one",
  },
  capabilities: ["picker:activate", "ui:toast", "log:write"],
  logging: {
    name: "activate-current-copy.jsonl",
  },
  async run(ctx) {
    const itemId = ctx.currentItemId ?? ctx.selectedItemIds[0];
    if (!itemId) {
      await copicu.ui.toast({
        title: "No item",
        message: "Select one item first.",
        tone: "warning",
      });
      return;
    }

    await copicu.picker.activate(itemId, {
      copy: true,
      markUsed: true,
      hidePicker: false,
      focusPrevious: false,
      paste: false,
      pasteShortcut: "default",
    });
    await copicu.log.info("activated current item with explicit options", {
      itemId,
      options: {
        copy: true,
        markUsed: true,
        hidePicker: false,
        focusPrevious: false,
        paste: false,
        pasteShortcut: "default",
      },
    });
    await copicu.ui.toast({
      title: "Item activated",
      message: "Current item was copied and marked used.",
      tone: "success",
    });
  },
});
