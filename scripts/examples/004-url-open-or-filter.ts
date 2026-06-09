/// <reference path="./copicu-action.d.ts" />

const urlPattern = /\bhttps?:\/\/[^\s<>"')\]]+/i;

export default defineAction({
  id: "examples.urlOpenOrFilter",
  title: "Open URL or filter",
  description: "Opens a selected URL after confirmation, or filters history for URLs.",
  triggers: ["itemMenu", "commandPalette", "devRun"],
  input: {
    source: "pickerSelection",
    selection: "optional",
    kinds: ["text"],
  },
  capabilities: [
    "history:read-content",
    "history:search",
    "picker:filter",
    "shell:open-url",
    "ui:toast",
    "ui:confirm",
    "log:write",
  ],
  async run() {
    const item = await copicu.selection.current({ content: true });
    const url = item?.text?.match(urlPattern)?.[0];

    if (!url) {
      await copicu.picker.filter("http OR https");
      await copicu.log.info("no selected url, applied picker filter", {
        selectedItemId: item?.id ?? null,
      });
      await copicu.ui.toast({
        title: "Filtered URLs",
        message: "No URL was selected, so the picker was filtered for URL-like clips.",
        tone: "info",
      });
      return;
    }

    const confirmed = await copicu.ui.confirm({
      title: "Open URL",
      message: "Open the first URL from the selected item?",
      confirmLabel: "Open URL",
      cancelLabel: "Cancel",
    });

    if (!confirmed) {
      await copicu.log.info("open url cancelled", {
        itemId: item.id,
        urlLength: url.length,
      });
      return;
    }

    await copicu.log.info("open url confirmed", {
      itemId: item.id,
      urlLength: url.length,
    });
    await copicu.clipboard.writeText(url);
    await copicu.ui.toast({
      title: "URL ready",
      message: "URL copied. Runner should open it once shell.open is available.",
      tone: "success",
      durationMs: 3000,
    });
  },
});
