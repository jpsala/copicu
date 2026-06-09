/// <reference path="./copicu-action.d.ts" />

export default defineAction({
  id: "examples.openPromptFiltered",
  title: "Open #prompt",
  description: "Opens the picker filtered by a free-form query shortcut.",
  shortcut: "Ctrl+Alt+Shift+P",
  triggers: ["commandPalette", "devRun", "globalShortcut"],
  input: {
    source: "none",
    selection: "none",
  },
  capabilities: ["commands:run", "picker:open", "log:write"],
  logging: {
    name: "open-prompt-filtered.jsonl",
  },
  async run() {
    const query = "#prompt";
    await copicu.commands.run("picker.open", {
      query,
      rememberPrevious: true,
      show: true,
      focus: "search",
    });
    await copicu.log.info("opened filtered picker", { query });
  },
});
