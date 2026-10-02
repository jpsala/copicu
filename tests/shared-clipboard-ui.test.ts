import { describe, expect, test } from "bun:test";
import type { ActionDefinition } from "../src/shared/contracts";
import { createSharedReceiptLoader, sharedChannelHasClipboardWriter, sharedChannelValidation, sharedForwardTargetEligible, sharedPublicationState, sharedReceiptCanCopy, sharedReceiptKey, sharedReceiptStatus, sharedReceptionActionEligible, sharedReceptionRows, type SharedChannelPolicy, type SharedClipboardSnapshot, type SharedReceiptPreview, type SharedReceiptSummary } from "../src/shared/sharedClipboard";

const channel = (overrides: Partial<SharedChannelPolicy> = {}): SharedChannelPolicy => ({
  id: "synthetic-channel", name: "Synthetic channel", canPublish: true, receiveEnabled: false,
  defaultSendChannel: false,
  publishFolderEnabled: false, publishFolderId: null, saveToFolder: false, receiveFolderId: null,
  updateClipboard: false,
  receiveActionEnabled: false, receiveActionWritesClipboard: false, receiveActionId: null, receiveActionForwardChannelIds: [], ...overrides,
});
const receipt = (overrides: Partial<SharedReceiptSummary> = {}): SharedReceiptSummary => ({
  subscriptionId: "synthetic-subscription", publicationId: "synthetic-publication", channelId: "synthetic-channel",
  sequence: "18446744073709551615", delivery: "recovery", acquisition: "ready", historyOutcome: "skipped",
  localItemId: null, originDeviceId: "synthetic-other-device", expiresAtUnixMs: "1800000000000", ...overrides,
});
const action = (overrides: Partial<ActionDefinition> = {}): ActionDefinition => ({
  id: "synthetic-action", title: "Synthetic reception", description: "Synthetic reception",
  triggers: ["sharedReception"], input: { source: "none", selection: "none", kinds: null, mime: null, query: null },
  capabilities: ["shared:receive:synthetic-channel"], builtin: false, source: "script", script: null, diagnostics: [], logging: null,
  ...overrides,
});

describe("shared clipboard controls", () => {
  test("Root publication is explicit and independently enabled", () => {
    expect(sharedChannelValidation(channel({ publishFolderEnabled: true }), [], [])).toBeNull();
    expect(sharedChannelValidation(channel({ publishFolderEnabled: false, publishFolderId: 987 }), [], [])).toBeNull();
    expect(sharedChannelValidation(channel({ publishFolderEnabled: true, publishFolderId: 987 }), [], [])).toBe("Choose an existing publication folder.");
  });
  test("reception effects remain configurable while reception is off", () => {
    expect(sharedChannelValidation(channel({ receiveEnabled: false, saveToFolder: true, updateClipboard: true }), [], [])).toBeNull();
    expect(sharedChannelValidation(channel({ receiveEnabled: true, saveToFolder: true, receiveFolderId: 5 }), [], [5])).toBeNull();
  });
  test("a channel grant cannot be expanded by folder controls", () => {
    expect(sharedChannelValidation(channel({ canPublish: false, publishFolderEnabled: true }), [], [])).toBe("This device cannot publish to this channel.");
  });
  test("only one channel writes the Windows clipboard", () => {
    const enabled = channel({ updateClipboard: true });
    expect(sharedChannelValidation(enabled, [enabled], [])).toBeNull();
    expect(sharedChannelValidation(enabled, [channel({ id: "other-channel", updateClipboard: true })], [])).toBe("Turn off Windows clipboard updates in the other channel first.");
  });
  test("original text and transformed Action output reserve the same single writer", () => {
    const actionWriter = channel({ receiveActionEnabled: true, receiveActionId: "synthetic-action", receiveActionWritesClipboard: true });
    expect(sharedChannelHasClipboardWriter(actionWriter)).toBe(true);
    expect(sharedChannelValidation(actionWriter, [actionWriter], [])).toBeNull();
    expect(sharedChannelValidation({ ...actionWriter, updateClipboard: true }, [], [])).toBe("Choose one Windows clipboard output: original text or reception action.");
    expect(sharedChannelValidation(actionWriter, [channel({ id: "other", updateClipboard: true })], [])).toBe("Turn off Windows clipboard updates in the other channel first.");
    expect(sharedChannelValidation(channel({ updateClipboard: true }), [{ ...actionWriter, id: "other" }], [])).toBe("Turn off Windows clipboard updates in the other channel first.");
    expect(sharedChannelValidation(actionWriter, [{ ...actionWriter, id: "other" }], [])).toBe("Turn off Windows clipboard updates in the other channel first.");
    expect(sharedChannelHasClipboardWriter({ ...actionWriter, receiveActionEnabled: false })).toBe(false);
    expect(sharedChannelValidation({ ...actionWriter, receiveActionEnabled: false }, [], [])).toBe("Enable the reception action before allowing its clipboard output.");
  });
  test("the Send shortcut default is singular and requires publication access", () => {
    const chosen = channel({ defaultSendChannel: true });
    expect(sharedChannelValidation(chosen, [chosen], [])).toBeNull();
    expect(sharedChannelValidation(chosen, [channel({ id: "other", defaultSendChannel: true })], [])).toBe("Turn off Send shortcuts in the other default channel first.");
    expect(sharedChannelValidation(channel({ defaultSendChannel: true, canPublish: false }), [], [])).toBe("This device cannot send to this channel.");
  });
  test("deleted destinations are never silently rerouted to Root", () => {
    expect(sharedChannelValidation(channel({ saveToFolder: true, receiveFolderId: 55 }), [], [5])).toBe("Choose an existing reception folder.");
  });
  test("recovered receipts are manually copyable; missing keys and expiry are not", () => {
    expect(sharedReceiptCanCopy(receipt(), 1799999999999)).toBe(true);
    expect(sharedReceiptCanCopy(receipt(), 1800000000000)).toBe(false);
    expect(sharedReceiptCanCopy(receipt({ acquisition: "pendingKey" }), 1799999999999)).toBe(false);
    expect(sharedReceiptCanCopy(receipt({ expiresAtUnixMs: "invalid" }), 1799999999999)).toBe(false);
  });
  test("an ambiguous commit is never displayed as delivered", () => {
    expect(sharedPublicationState({ publicationId: "synthetic", channelId: "synthetic", state: "committed", commitAmbiguous: true })).toBe("Awaiting confirmation");
    expect(sharedPublicationState({ publicationId: "synthetic", channelId: "synthetic", state: "pending", commitAmbiguous: false })).toBe("Queued");
    expect(sharedPublicationState({ publicationId: "synthetic", channelId: "synthetic", state: "committed", commitAmbiguous: false })).toBe("Accepted by service");
  });
  test("receipt activity distinguishes individual local effects and expiry", () => {
    expect(sharedReceiptStatus(receipt({ historyOutcome: "applied", clipboardOutcome: "failed", actionOutcome: "uncertain" }), 1799999999999)).toBe("Ready · Saved in Copicu · Clipboard update failed · Local action unconfirmed");
    expect(sharedReceiptStatus(receipt(), 1800000000000)).toBe("Expired");
    expect(sharedReceiptStatus(receipt({ acquisition: "pendingKey" }), 1799999999999)).toBe("Awaiting key");
  });
  test("reception action chooser requires the exact channel and guarded inputs", () => {
    expect(sharedReceptionActionEligible(action(), "synthetic-channel")).toBe(true);
    expect(sharedReceptionActionEligible(action(), "other-channel")).toBe(false);
    expect(sharedReceptionActionEligible(action({ capabilities: ["shared:receive:synthetic-channel", "clipboard:write"] }), "synthetic-channel")).toBe(true);
    expect(sharedReceptionActionEligible(action({ capabilities: ["shared:receive:synthetic-channel", "clipboard:write", "input:paste"] }), "synthetic-channel")).toBe(false);
    expect(sharedReceptionActionEligible(action({ capabilities: ["shared:receive:synthetic-channel", "picker:activate"] }), "synthetic-channel")).toBe(false);
    expect(sharedReceptionActionEligible(action({ diagnostics: [{ severity: "error", message: "Synthetic missing grant" }] }), "synthetic-channel")).toBe(false);
    expect(sharedReceptionActionEligible(action({ input: { source: "clipboard", selection: "none", kinds: null, mime: null, query: null } }), "synthetic-channel")).toBe(false);
    expect(sharedChannelValidation(channel({ receiveActionEnabled: true }), [], [])).toBe("Choose an authorized local reception action.");
  });
  test("forwarding requires explicit origin-target and publication grants", () => {
    const granted = action({ capabilities: ["shared:publish", "shared:publish:target", "shared:forward:synthetic-channel:target"] });
    expect(sharedForwardTargetEligible(granted, "synthetic-channel", channel({ id: "target" }))).toBe(true);
    expect(sharedForwardTargetEligible(granted, "other-origin", channel({ id: "target" }))).toBe(false);
    expect(sharedForwardTargetEligible(granted, "synthetic-channel", channel({ id: "target", canPublish: false }))).toBe(false);
    expect(sharedForwardTargetEligible(action({ capabilities: ["shared:publish", "shared:publish:target"] }), "synthetic-channel", channel({ id: "target" }))).toBe(false);
  });
});

describe("shared clipboard reception preview", () => {
  test("metadata filtering never requires payloads and orders full u64 sequences", () => {
    const snapshot: SharedClipboardSnapshot = { available: true, configured: true, paused: false, channels: [channel()], outbox: [], receipts: [receipt({ sequence: "18446744073709551614", publicationId: "older" }), receipt({ sequence: "18446744073709551615", publicationId: "newer" })] };
    expect(sharedReceptionRows(snapshot, "synthetic channel").map(item => item.publicationId)).toEqual(["newer", "older"]);
    expect(sharedReceptionRows(snapshot, "other-device")).toHaveLength(2);
    expect(sharedReceptionRows(snapshot, "payload content")).toEqual([]);
    expect(snapshot.receipts[0].publicationId).toBe("older");
  });
  test("publication IDs in different subscriptions do not share selection", () => {
    expect(sharedReceiptKey(receipt())).not.toBe(sharedReceiptKey(receipt({ subscriptionId: "other-subscription" })));
  });
  test("payloads are fetched only after explicit selection and cleared when closing", async () => {
    const states: SharedReceiptPreview[] = []; let reads = 0;
    const loader = createSharedReceiptLoader(async () => { reads += 1; return "COPICU_SYNTH_RECEIVED_TEXT"; }, state => states.push(state), () => 1799999999999);
    expect(reads).toBe(0);
    await loader.load(receipt());
    expect(reads).toBe(1);
    expect(states.at(-1)?.text).toBe("COPICU_SYNTH_RECEIVED_TEXT");
    loader.clear();
    expect(states.at(-1)).toEqual({ receiptKey: null, status: "idle", text: null });
  });
  test("changing selection rejects a previous delayed payload", async () => {
    const states: SharedReceiptPreview[] = []; let resolveFirst: (value: string) => void = () => {};
    const loader = createSharedReceiptLoader(async (_sid, publicationId) => publicationId === "first" ? new Promise<string>(resolve => { resolveFirst = resolve; }) : "COPICU_SYNTH_SECOND", state => states.push(state), () => 1799999999999);
    const first = loader.load(receipt({ publicationId: "first" }));
    await loader.load(receipt({ publicationId: "second" }));
    resolveFirst("COPICU_SYNTH_FIRST"); await first;
    expect(states.at(-1)?.text).toBe("COPICU_SYNTH_SECOND");
    expect(states.some(state => state.text === "COPICU_SYNTH_FIRST")).toBe(false);
  });
  test("expired or pending-key selections never request plaintext", async () => {
    let reads = 0; const states: SharedReceiptPreview[] = [];
    const loader = createSharedReceiptLoader(async () => { reads += 1; return "COPICU_SYNTH_UNAVAILABLE"; }, state => states.push(state), () => 1800000000000);
    await loader.load(receipt()); await loader.load(receipt({ acquisition: "pendingKey", expiresAtUnixMs: "1800000000001" }));
    expect(reads).toBe(0); expect(states.at(-1)?.status).toBe("unavailable");
  });
  test("expiry during a slow read removes payload but preserves selected metadata", async () => {
    let currentTime = 1799999999999; let resolveRead: (value: string) => void = () => {}; const states: SharedReceiptPreview[] = [];
    const loader = createSharedReceiptLoader(async () => new Promise<string>(resolve => { resolveRead = resolve; }), state => states.push(state), () => currentTime);
    const pending = loader.load(receipt()); currentTime = 1800000000000;
    resolveRead("COPICU_SYNTH_EXPIRED_DURING_READ"); await pending;
    expect(states.at(-1)).toEqual({ receiptKey: sharedReceiptKey(receipt()), status: "unavailable", text: null });
  });
  test("closing while reading discards the response without exposing payload", async () => {
    let resolveRead: (value: string) => void = () => {}; const states: SharedReceiptPreview[] = [];
    const loader = createSharedReceiptLoader(async () => new Promise<string>(resolve => { resolveRead = resolve; }), state => states.push(state), () => 1799999999999);
    const pending = loader.load(receipt()); loader.clear(); resolveRead("COPICU_SYNTH_LATE_PAYLOAD"); await pending;
    expect(states.at(-1)).toEqual({ receiptKey: null, status: "idle", text: null });
    expect(states.some(state => state.text === "COPICU_SYNTH_LATE_PAYLOAD")).toBe(false);
  });
});
