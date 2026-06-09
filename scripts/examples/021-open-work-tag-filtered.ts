/// <reference path="./copicu-action.d.ts" />

export default defineAction({
  id: "examples.openWorkTagFiltered",
  title: "Open #work",
  description: "Opens the picker filtered to the work tag from a script shortcut.",
  shortcut: "Ctrl+Alt+Shift+W",
  triggers: ["commandPalette", "devRun", "globalShortcut"],
  input: {
    source: "none",
    selection: "none",
  },
  capabilities: ["commands:run", "picker:open", "log:write"],
  logging: {
    name: "open-work-tag-filtered.jsonl",
  },
  async run() {
    const query = "tag:work";
    await copicu.commands.run("picker.open", {
      query,
      rememberPrevious: true,
      show: true,
      focus: "search",
    });
    await copicu.log.info("opened filtered picker", { query });
  },
});
