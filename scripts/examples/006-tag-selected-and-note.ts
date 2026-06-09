/// <reference path="./copicu-action.d.ts" />

function uniqueTags(tags: string[], nextTag: string) {
  return Array.from(new Set([...tags, nextTag]));
}

export default defineAction({
  id: "examples.tagSelectedAndNote",
  title: "Tag selected as scripted",
  description: "Reads the current item with history.get and updates title, notes, and tags.",
  triggers: ["itemMenu"],
  input: {
    source: "pickerSelection",
    selection: "one",
    kinds: ["text"],
  },
  capabilities: ["history:read-content", "history:write-metadata", "ui:toast", "log:write"],
  logging: {
    name: "tag-selected-and-note.jsonl",
  },
  async run(ctx) {
    const itemId = ctx.currentItemId ?? ctx.selectedItemIds[0];
    if (!itemId) {
      await copicu.ui.toast({
        title: "No item",
        message: "Select one text item first.",
        tone: "warning",
      });
      return;
    }

    const item = await copicu.history.get(itemId, { content: true });
    const nextTags = uniqueTags(item.tags ?? [], "#scripted");
    const noteLines = [
      item.notes?.trim(),
      `scripted:${new Date().toISOString().slice(0, 10)}`,
    ].filter(Boolean);

    await copicu.history.update(item.id, {
      title: item.title || "Scripted text clip",
      notes: noteLines.join("\n"),
      tags: nextTags,
    });
    await copicu.log.info("updated selected item metadata", {
      itemId: item.id,
      tagCount: nextTags.length,
      textLength: item.text?.length ?? 0,
    });
    await copicu.ui.toast({
      title: "Metadata updated",
      message: "Selected clip was tagged as #scripted.",
      tone: "success",
    });
  },
});
