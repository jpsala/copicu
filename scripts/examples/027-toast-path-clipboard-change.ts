/// <reference path="./copicu-action.d.ts" />

export default defineAction({
  id: "examples.toastPathClipboardChange",
  title: "Toast enrichment clipboard change",
  description: "Shows a toast when a newly captured text item matches deterministic enrichment detectors.",
  triggers: ["clipboardChange"],
  input: {
    source: "clipboard",
    selection: "none",
    kinds: ["text"],
  },
  capabilities: [
    "history:read-content",
    "enrichment:read",
    "ui:toast",
    "log:write",
  ],
  logging: {
    name: "path-clipboard-change.jsonl",
  },
  async run(ctx) {
    if (!ctx.currentItemId) {
      await copicu.log.warn("path clipboardChange had no current item");
      return;
    }

    const item = await copicu.history.get(ctx.currentItemId, { content: true });
    const result = await copicu.enrichment.getResult(ctx.currentItemId);
    if (result.tags.length === 0) {
      return;
    }

    const detectorLabels = result.tags.map((tag) => tag.detectorLabel);
    const appliedLabels = result.tags.filter((tag) => tag.applied).map((tag) => tag.detectorLabel);
    const suggestedLabels = result.tags.filter((tag) => !tag.applied).map((tag) => tag.detectorLabel);

    await copicu.log.info("path clipboard item captured", {
      itemId: item.id,
      kind: item.kind,
      textLength: item.text?.length ?? 0,
      applyMode: result.applyMode,
      autoApplyEnabled: result.autoApplyEnabled,
      manualApplyAllowed: result.manualApplyAllowed,
      detectors: result.tags.map((tag) => tag.detector),
      appliedDetectors: appliedLabels,
      suggestedDetectors: suggestedLabels,
    });

    const title = appliedLabels.length > 0 ? "Enrichment applied" : "Enrichment suggested";
    let message = "Matched detectors: " + detectorLabels.join(", ") + ".";
    if (!result.autoApplyEnabled && suggestedLabels.length > 0) {
      message += " Auto apply is off, so tags stayed as suggestions.";
    } else if (appliedLabels.length > 0) {
      message += " Tags were applied automatically.";
    }

    await copicu.ui.toast({
      title,
      message,
      tone: appliedLabels.length > 0 ? "success" : "info",
      durationMs: 2200,
    });
  },
});
