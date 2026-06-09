/// <reference path="./copicu-action.d.ts" />

export default defineAction({
  id: "examples.pasteCurrentToPrevious",
  title: "Paste current to previous",
  description: "Copies the selected item, hides Copicu, focuses the previous window, and pastes.",
  triggers: ["itemMenu"],
  input: {
    source: "pickerSelection",
    selection: "one",
  },
  capabilities: ["picker:activate", "ui:toast", "log:write"],
  logging: {
    name: "paste-current-to-previous.jsonl",
  },
  async run(ctx) {
    const itemId = ctx.currentItemId ?? ctx.selectedItemIds[0];

    await copicu.picker.activate(itemId, {
      copy: true,
      markUsed: true,
      hidePicker: true,
      focusPrevious: true,
      paste: true,
      pasteShortcut: "default",
    });
    await copicu.log.info("paste-to-previous requested", {
      itemId,
      pasteShortcut: "default",
    });
    await copicu.ui.toast({
      title: "Paste requested",
      message: "Selected item was sent to the previous window.",
      tone: "success",
    });
  },
});
