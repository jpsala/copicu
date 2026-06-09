/// <reference path="./copicu-action.d.ts" />

export default defineAction({
  id: "examples.logTextClipboardChange",
  title: "Log text clipboard change",
  description: "Logs metadata for a newly captured text clip.",
  triggers: ["clipboardChange"],
  input: {
    source: "clipboard",
    selection: "none",
    kinds: ["text"],
  },
  capabilities: ["history:read-content", "ui:toast", "log:write"],
  logging: {
    name: "clipboard-change.jsonl",
  },
  async run(ctx) {
    if (!ctx.currentItemId) {
      await copicu.log.warn("clipboardChange had no current item");
      return;
    }

    const item = await copicu.history.get(ctx.currentItemId, { content: true });
    await copicu.log.info("text clipboard item captured", {
      itemId: item.id,
      kind: item.kind,
      textLength: item.text?.length ?? 0,
      selectedCount: ctx.selectedItemIds.length,
    });

    await copicu.ui.toast({
      title: "Clipboard script",
      message: "Text clip captured.",
      tone: "info",
      durationMs: 1800,
    });
  },
});
