/// <reference path="./copicu-action.d.ts" />

export default defineAction({
  id: "examples.openMarkedContextFiltered",
  title: "Open Marked #context",
  description: "Opens the picker filtered to marked clips tagged context.",
  shortcut: "Ctrl+Alt+Shift+M",
  triggers: ["commandPalette", "devRun", "globalShortcut"],
  input: {
    source: "none",
    selection: "none",
  },
  capabilities: ["commands:run", "picker:open", "log:write"],
  logging: {
    name: "open-marked-context-filtered.jsonl",
  },
  async run() {
    const query = "is:marked tag:context";
    await copicu.commands.run("picker.open", {
      query,
      rememberPrevious: true,
      show: true,
      focus: "search",
    });
    await copicu.log.info("opened filtered picker", { query });
  },
});
