/// <reference path="./copicu-action.d.ts" />

export default defineAction({
  id: "examples.openTagFiltered",
  title: "Open #context",
  description: "Opens the picker filtered to a tag from a script shortcut.",
  shortcut: "Ctrl+Alt+Shift+T",
  triggers: ["commandPalette", "devRun", "globalShortcut"],
  input: {
    source: "none",
    selection: "none",
  },
  capabilities: ["commands:run", "picker:open", "log:write"],
  logging: {
    name: "open-tag-filtered.jsonl",
  },
  async run() {
    const query = "tag:context";
    await copicu.commands.run("picker.open", {
      query,
      rememberPrevious: true,
      show: true,
      focus: "search",
    });
    await copicu.log.info("opened filtered picker", { query });
  },
});
