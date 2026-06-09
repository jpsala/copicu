/// <reference path="./copicu-action.d.ts" />

export default defineAction({
  id: "examples.copyCurrentTitle",
  title: "Copy current title",
  description: "Reads one selected item and copies a metadata-first label.",
  triggers: ["itemMenu", "commandPalette", "devRun"],
  input: {
    source: "pickerSelection",
    selection: "one",
    kinds: ["text", "image"],
  },
  capabilities: ["history:read-content", "clipboard:write", "ui:toast", "log:write"],
  async run() {
    const item = await copicu.selection.current({ content: false });
    if (!item) {
      await copicu.ui.toast({
        title: "No selection",
        message: "Select one item first.",
        tone: "warning",
      });
      return;
    }

    const label = item.title?.trim() || item.text?.split(/\r?\n/, 1)[0]?.trim() || `item:${item.id}`;
    await copicu.clipboard.writeText(label);
    await copicu.log.info("copied current title", {
      itemId: item.id,
      kind: item.kind,
      labelLength: label.length,
    });
    await copicu.ui.toast({
      title: "Copied title",
      message: label.length > 80 ? `${label.slice(0, 77)}...` : label,
      tone: "success",
      durationMs: 2800,
    });
  },
});
