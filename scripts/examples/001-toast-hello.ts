/// <reference path="./copicu-action.d.ts" />

export default defineAction({
  id: "examples.toastHello",
  title: "Toast hello",
  description: "Smallest useful action: log one run and show one native notification.",
  shortcut: "Ctrl+Alt+C, H",
  triggers: ["commandPalette", "devRun", "globalShortcut"],
  input: {
    source: "none",
    selection: "none",
  },
  capabilities: ["ui:notify", "log:write"],
  async run(ctx) {
    await copicu.log.info("toast hello run", {
      trigger: ctx.trigger,
      selectedCount: ctx.selectedItemIds.length,
    });

    await copicu.ui.notify({
      title: "Script ran",
      body: "Toast hello completed.",
    });
  },
});
