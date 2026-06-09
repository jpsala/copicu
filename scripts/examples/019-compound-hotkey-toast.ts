/// <reference path="./copicu-action.d.ts" />

export default defineAction({
  id: "jp.compoundHotkeyToast",
  title: "Compound hotkey toast",
  description: "Dogfood script for compound global hotkeys with native notification feedback.",
  shortcut: "Ctrl+Alt+C, T",
  triggers: ["commandPalette", "devRun", "globalShortcut"],
  input: {
    source: "none",
    selection: "none",
  },
  capabilities: ["ui:notify", "log:write"],
  logging: {
    name: "compound-hotkey-toast.jsonl",
  },
  async run(ctx) {
    const ranAt = new Date().toLocaleTimeString();

    await copicu.log.info("compound hotkey toast run", {
      trigger: ctx.trigger,
      shortcut: ctx.shortcut,
      selectedCount: ctx.selectedItemIds.length,
    });

    await copicu.ui.notify({
      title: "Compound hotkey",
      body: `Ran ${ctx.shortcut ?? "shortcut"} at ${ranAt}`,
    });
  },
});
