/// <reference path="./copicu-action.d.ts" />

export default defineAction({
  id: "examples.inspectEnrichmentActive",
  title: "Inspect enrichment",
  description: "Shows deterministic enrichment results for the active item and can apply missing rule tags.",
  shortcut: "Ctrl+Alt+E",
  triggers: ["itemMenu", "commandPalette", "localShortcut"],
  input: {
    source: "pickerSelection",
    selection: "active",
    kinds: ["text"],
  },
  capabilities: [
    "history:read-content",
    "enrichment:read",
    "enrichment:run",
    "ui:confirm",
    "ui:markdown-output",
    "ui:toast",
    "log:write",
  ],
  logging: {
    name: "inspect-enrichment-active.jsonl",
  },
  async run(ctx) {
    const activeItemId = ctx.activeItemId ?? ctx.currentItemId ?? null;
    if (!activeItemId) {
      await copicu.ui.toast({
        title: "No active item",
        message: "Select a text clip first.",
        tone: "warning",
      });
      return;
    }

    const item = await copicu.history.get(activeItemId, { content: true });
    const current = await copicu.enrichment.getResult(activeItemId);
    const detected = current.tags.length;
    const missing = current.tags.filter((tag) => !tag.applied);

    await copicu.log.info("inspected enrichment result", {
      itemId: activeItemId,
      kind: item.kind,
      textLength: item.text?.length ?? 0,
      enabled: current.enabled,
      applyMode: current.applyMode,
      detectedCount: detected,
      missingCount: missing.length,
      detectors: current.tags.map((tag) => tag.detector),
    });

    let finalResult = current;
    if (missing.length > 0) {
      const missingTags = missing.map((tag) => tag.tag).join(", ");
      const shouldApply = await copicu.ui.confirm({
        title: "Apply enrichment tags?",
        message: "Detected " + String(missing.length) + " unapplied tags: " + missingTags + ".",
        confirmLabel: "Apply",
        cancelLabel: "Inspect only",
      });

      if (shouldApply) {
        finalResult = await copicu.enrichment.runForItem(activeItemId, { apply: true });
        await copicu.log.info("applied enrichment tags from script", {
          itemId: activeItemId,
          appliedTags: finalResult.tags.filter((tag) => tag.applied).map((tag) => tag.tag),
        });
      }
    }

    const markdownLines = [
      "# Enrichment result",
      "",
      "- Item ID: `" + String(finalResult.itemId) + "`",
      "- Kind: `" + finalResult.contentKind + "`",
      "- Enabled: `" + String(finalResult.enabled) + "`",
      "- Apply mode: `" + finalResult.applyMode + "`",
      "- Eligible: `" + String(finalResult.eligible) + "`",
      "- Text length: `" + String(item.text?.length ?? 0) + "`",
      "",
    ];

    if (finalResult.tags.length === 0) {
      markdownLines.push("No detectors matched this item.");
    } else {
      markdownLines.push("| Detector | Tag | Confidence | Applied |");
      markdownLines.push("| --- | --- | --- | --- |");
      for (const tag of finalResult.tags) {
        markdownLines.push(
          "| " +
            tag.detectorLabel +
            " | `" +
            tag.tag +
            "` | " +
            tag.confidence.toFixed(2) +
            " | " +
            (tag.applied ? "yes" : "no") +
            " |",
        );
      }
    }

    await copicu.ui.markdownOutput({
      title: "Enrichment result",
      markdown: markdownLines.join("\n"),
      summary: "Deterministic enrichment result for the active text item.",
      source: "scripts/examples/026-inspect-enrichment-active.ts",
      suggestedFileName: "enrichment-result.md",
    });

    await copicu.ui.toast({
      title: "Enrichment inspected",
      message:
        finalResult.tags.length === 0
          ? "No detectors matched the active item."
          : "Found " + String(finalResult.tags.length) + " detector matches.",
      tone: "info",
    });
  },
});
