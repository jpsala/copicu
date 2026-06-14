/// <reference path="../../../scripts/examples/copicu-action.d.ts" />

export default defineAction({
  id: "dogfood.apiSurfaceSmoke",
  title: "DOGFOOD API surface smoke",
  description: "Exercises the supported trusted script host APIs with safe synthetic data.",
  triggers: ["commandPalette", "devRun"],
  input: {
    source: "historySearch",
    selection: "multiple",
    kinds: ["text"],
    query: "dogfood OR synthetic OR kind:text",
  },
  capabilities: [
    "history:read-content",
    "history:search",
    "history:write-metadata",
    "history:promote",
    "metadata:read-tags",
    "metadata:edit-active",
    "history:delete",
    "clipboard:read",
    "clipboard:write",
    "ui:toast",
    "ui:notify",
    "ui:alert",
    "ui:confirm",
    "ui:input",
    "ui:markdown-output",
    "ai:summarize",
    "log:write",
    "enrichment:run",
    "enrichment:read",
    "commands:run",
    "picker:open",
    "picker:filter",
    "picker:activate",
    "picker:show",
    "picker:hide",
    "window:remember-previous",
    "window:focus-previous",
    "input:paste",
  ],
  logging: {
    name: "dogfood-api-surface-smoke.jsonl",
  },
  async run(ctx) {
    await copicu.log.info("api smoke started", {
      trigger: ctx.trigger,
      activeItemId: ctx.activeItemId,
      selectedCount: ctx.selectedItemIds.length,
    });

    const searchResults = await copicu.history.search("dogfood OR synthetic OR kind:text", {
      limit: 5,
      content: true,
    });
    const active = searchResults[0] ?? (ctx.activeItemId ? await copicu.history.get(ctx.activeItemId, { content: true }) : null);
    if (!active) {
      await copicu.ui.toast({ title: "API smoke", message: "No active item to test", tone: "warning" });
      return;
    }

    const full = await copicu.history.get(active.id, { content: true });
    await copicu.history.update(active.id, {
      notes: [full.notes, "dogfood api smoke touched"].filter(Boolean).join("\n"),
      tags: Array.from(new Set([...(full.tags ?? []), "#dogfood-api"])),
    });
    await copicu.history.promote(active.id);
    await copicu.history.move(active.id, { position: "top" });

    const tags = await copicu.metadata.listTags();
    await copicu.metadata.editActive();

    const clipboardBefore = await copicu.clipboard.read();
    await copicu.clipboard.writeText(`DOGFOOD API clipboard from item ${active.id}`);
    await copicu.clipboard.writeItem(active.id);

    const enrichmentBefore = await copicu.enrichment.getResult(active.id);
    const enrichmentAfter = await copicu.enrichment.runForItem(active.id, { apply: false });

    await copicu.picker.show();
    await copicu.picker.filter("dogfood-api");
    await copicu.picker.activate(active.id, { copy: true, paste: false, hide: false });
    await copicu.picker.open({ query: "tag:dogfood-api", mode: "filter" });
    await copicu.commands.run("picker.open", { query: "dogfood-api" });

    await copicu.window.rememberPrevious();
    await copicu.window.focusPrevious();
    await copicu.input.paste({ shortcut: "default" });

    await copicu.ui.notify({ title: "API smoke", body: "notify ok" });
    await copicu.ui.alert({ title: "API smoke", message: "alert ok" });
    const confirmed = await copicu.ui.confirm({ title: "API smoke", message: "confirm ok?" });
    const inputValue = await copicu.ui.input({ title: "API smoke", message: "input ok", defaultValue: "dogfood-input" });

    const aiMarkdown = await copicu.ai.respondMarkdown({
      instruction: "Return a one-line synthetic dogfood summary.",
      items: searchResults,
      context: { title: "API smoke", selectedItemIds: ctx.selectedItemIds },
    });
    await copicu.ui.markdownOutput({
      title: "DOGFOOD API smoke report",
      markdown: [
        "# DOGFOOD API smoke report",
        "",
        `- Active item: ${active.id}`,
        `- Search results: ${searchResults.length}`,
        `- Tags visible: ${tags.length}`,
        `- Confirmed: ${String(confirmed)}`,
        `- Input: ${String(inputValue)}`,
        `- Clipboard before: ${clipboardBefore.text ? "present" : "empty"}`,
        `- Enrichment before: ${enrichmentBefore.tags.length}`,
        `- Enrichment after: ${enrichmentAfter.tags.length}`,
        "",
        aiMarkdown,
      ].join("\n"),
      suggestedFileName: "dogfood-api-smoke.md",
    });

    if (searchResults[1]) {
      // Exercise delete with a non-active secondary mock item. The real dogfood battery
      // runs against disposable app-data, so this is safe there too.
      await copicu.history.remove(searchResults[1].id);
    }

    await copicu.log.info("api smoke completed", {
      itemId: active.id,
      resultCount: searchResults.length,
      tagCount: tags.length,
      confirmed,
      inputValue,
    });
    await copicu.ui.toast({ title: "API smoke", message: "All API calls completed", tone: "success" });
    await copicu.picker.hide();
  },
});
