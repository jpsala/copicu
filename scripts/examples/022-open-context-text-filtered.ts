/// <reference path="./copicu-action.d.ts" />

export default defineAction({
  id: "examples.openContextTextFiltered",
  title: "Open #context Text",
  description: "Opens the picker filtered to text clips tagged context.",
  shortcut: "Ctrl+Alt+Shift+X",
  triggers: ["commandPalette", "devRun", "globalShortcut"],
  input: {
    source: "none",
    selection: "none",
  },
  capabilities: ["commands:run", "picker:open", "log:write"],
  logging: {
    name: "open-context-text-filtered.jsonl",
  },
  async run() {
    const query = "tag:context kind:text";
    await copicu.commands.run("picker.open", {
      query,
      rememberPrevious: true,
      show: true,
      focus: "search",
    });
    await copicu.log.info("opened filtered picker", { query });
  },
});
