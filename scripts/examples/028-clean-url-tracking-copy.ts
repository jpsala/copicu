/// <reference path="./copicu-action.d.ts" />

const trackingParams = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "utm_id",
  "utm_name",
  "utm_reader",
  "utm_place",
  "utm_userid",
  "fbclid",
  "gclid",
  "dclid",
  "gbraid",
  "wbraid",
  "mc_cid",
  "mc_eid",
  "igshid",
  "ref",
]);

export function cleanTrackingUrl(input: string) {
  const trimmed = input.trim();
  const match = trimmed.match(/https?:\/\/[^\s<>'")\]]+/i);
  if (!match) {
    return { url: null, cleaned: null, removedCount: 0 };
  }

  const original = match[0];
  let url: URL;
  try {
    url = new URL(original);
  } catch {
    return { url: original, cleaned: null, removedCount: 0 };
  }

  let removedCount = 0;
  for (const key of Array.from(url.searchParams.keys())) {
    if (trackingParams.has(key.toLowerCase())) {
      removedCount += url.searchParams.getAll(key).length;
      url.searchParams.delete(key);
    }
  }

  return {
    url: original,
    cleaned: url.toString(),
    removedCount,
  };
}

export default defineAction({
  id: "examples.cleanUrlTrackingCopy",
  title: "Clean URL tracking params",
  description: "Removes common tracking parameters from the selected URL and copies the cleaned URL.",
  triggers: ["itemMenu", "commandPalette"],
  input: {
    source: "pickerSelection",
    selection: "one",
    kinds: ["text"],
  },
  capabilities: ["history:read-content", "clipboard:write", "ui:toast", "log:write"],
  logging: {
    name: "clean-url-tracking-copy.jsonl",
  },
  async run(ctx) {
    const itemId = ctx.currentItemId ?? ctx.activeItemId ?? ctx.selectedItemIds[0];
    if (!itemId) {
      await copicu.ui.toast({
        title: "No item selected",
        message: "Select a text clip containing a URL first.",
        tone: "warning",
      });
      return;
    }

    const item = await copicu.history.get(itemId, { content: true });
    const result = cleanTrackingUrl(item.text ?? "");

    if (!result.cleaned || !result.url) {
      await copicu.log.warn("no valid url found for cleanup", {
        itemId: item.id,
        inputLength: item.text?.length ?? 0,
      });
      await copicu.ui.toast({
        title: "No URL found",
        message: "Select a text clip containing an http(s) URL.",
        tone: "warning",
      });
      return;
    }

    await copicu.clipboard.writeText(result.cleaned);
    await copicu.log.info("cleaned url copied", {
      itemId: item.id,
      inputLength: item.text?.length ?? 0,
      outputLength: result.cleaned.length,
      removedParamCount: result.removedCount,
      changed: result.cleaned !== result.url,
    });
    await copicu.ui.toast({
      title: result.removedCount > 0 ? "Copied cleaned URL" : "Copied URL",
      message:
        result.removedCount > 0
          ? `Removed ${result.removedCount} tracking parameter(s).`
          : "No tracking parameters were found.",
      tone: "success",
    });
  },
});
