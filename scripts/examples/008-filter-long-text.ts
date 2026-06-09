/// <reference path="./copicu-action.d.ts" />

export default defineAction({
  id: "examples.filterLongText",
  title: "Filter long text",
  description: "Applies a picker.filter query without changing history.",
  triggers: ["commandPalette", "itemMenu"],
  input: {
    source: "pickerSelection",
    selection: "optional",
    kinds: ["text"],
  },
  capabilities: ["picker:filter", "ui:toast", "log:write"],
  async run(ctx) {
    const query = ctx.view?.query?.trim() ? `${ctx.view.query.trim()} kind:text` : "kind:text";
    await copicu.picker.filter(query);
    await copicu.log.info("picker filter applied", {
      queryLength: query.length,
      selectedCount: ctx.selectedItemIds.length,
    });
    await copicu.ui.toast({
      title: "Filter applied",
      message: "Picker is now filtered to text clips.",
      tone: "info",
    });
  },
});
