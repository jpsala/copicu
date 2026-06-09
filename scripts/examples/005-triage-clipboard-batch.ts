/// <reference path="./copicu-action.d.ts" />

function normalizeTag(input: string) {
  return input
    .trim()
    .replace(/^#/, "")
    .replace(/[^\p{L}\p{N}_-]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function uniqueTags(tags: string[] | undefined, nextTag: string) {
  return Array.from(new Set([...(tags ?? []), `#${nextTag}`]));
}

export default defineAction({
  id: "examples.triageClipboardBatch",
  title: "Triage clipboard batch",
  description: "Searches clips, asks for a tag, updates metadata, copies a summary, and logs every stage.",
  triggers: ["commandPalette", "devRun"],
  input: {
    source: "historySearch",
    selection: "none",
    kinds: ["text"],
    query: "has:notes OR kind:text",
  },
  capabilities: [
    "history:search",
    "history:read-content",
    "history:write-metadata",
    "clipboard:write",
    "ui:input",
    "ui:confirm",
    "ui:toast",
    "log:write",
  ],
  logging: {
    name: "triage-batch.jsonl",
  },
  async run() {
    const rawTag = await copicu.ui.input({
      title: "Batch tag",
      message: "Tag matching text clips before copying a summary.",
      placeholder: "review",
      defaultValue: "review",
    });
    const tag = normalizeTag(rawTag ?? "");
    if (!tag) {
      await copicu.ui.toast({
        title: "No tag",
        message: "Batch triage cancelled.",
        tone: "warning",
      });
      return;
    }

    await copicu.log.info("triage search start", {
      tag,
      query: "kind:text",
      limit: 25,
    });
    const matches = await copicu.history.search("kind:text", {
      limit: 25,
      content: true,
    });
    const candidates = matches.filter((item) => item.text?.trim()).slice(0, 10);

    if (candidates.length === 0) {
      await copicu.log.warn("triage no candidates", { tag });
      await copicu.ui.toast({
        title: "No candidates",
        message: "No text clips matched.",
        tone: "warning",
      });
      return;
    }

    const confirmed = await copicu.ui.confirm({
      title: "Apply batch tag",
      message: `Tag ${candidates.length} text clips as #${tag}?`,
      confirmLabel: "Apply tag",
      cancelLabel: "Cancel",
    });

    if (!confirmed) {
      await copicu.log.info("triage cancelled before update", {
        candidateCount: candidates.length,
        tag,
      });
      return;
    }

    for (const item of candidates) {
      await copicu.history.update(item.id, {
        tags: uniqueTags(item.tags, tag),
        notes: [item.notes?.trim(), `#${tag}`].filter(Boolean).join("\n"),
      });
    }

    const summary = candidates
      .map((item, index) => {
        const firstLine = item.text?.split(/\r?\n/, 1)[0]?.trim() || `item:${item.id}`;
        return `${index + 1}. ${firstLine}`;
      })
      .join("\n");

    await copicu.clipboard.writeText(summary);
    await copicu.log.info("triage complete", {
      updatedCount: candidates.length,
      summaryChars: summary.length,
      tag,
      itemIds: candidates.map((item) => item.id),
    });
    await copicu.ui.toast({
      title: "Batch triage complete",
      message: `${candidates.length} clips tagged and summary copied.`,
      tone: "success",
      durationMs: 4200,
    });
  },
});
