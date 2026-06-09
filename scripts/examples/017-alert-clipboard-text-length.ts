/// <reference path="./copicu-action.d.ts" />

export default defineAction({
  id: "examples.alertClipboardTextLength",
  title: "Alert clipboard text length",
  description: "Reads current clipboard text and shows a redacted length alert.",
  triggers: ["commandPalette"],
  input: {
    source: "none",
    selection: "none",
  },
  capabilities: ["clipboard:read", "ui:alert", "log:write"],
  async run() {
    const clipboard = await copicu.clipboard.read();
    const textLength = clipboard.text?.length ?? 0;

    await copicu.log.info("clipboard text length checked", { textLength });
    await copicu.ui.alert({
      title: "Clipboard text",
      message: `Current clipboard text length: ${textLength}`,
    });
  },
});
