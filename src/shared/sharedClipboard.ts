import { invoke } from "@tauri-apps/api/core";
import type { ActionDefinition } from "./contracts";
import type { SharedConnection } from "./sharedProduct";

export type SharedChannelPolicy = {
  id: string;
  name: string;
  canPublish: boolean;
  sendPaused?: boolean;
  receivePaused?: boolean;
  defaultSendChannel: boolean;
  receiveEnabled: boolean;
  publishFolderEnabled: boolean;
  publishFolderId: number | null;
  saveToFolder: boolean;
  receiveFolderId: number | null;
  updateClipboard: boolean;
  receiveActionEnabled: boolean;
  receiveActionWritesClipboard: boolean;
  receiveActionId: string | null;
  receiveActionForwardChannelIds: string[];
};
export type SharedPublicationSummary = {
  publicationId: string;
  channelId: string;
  state: string;
  commitAmbiguous: boolean;
};
export type SharedReceiptSummary = {
  subscriptionId: string;
  publicationId: string;
  channelId: string;
  sequence: string;
  delivery: "live" | "recovery" | "deferred";
  acquisition: string;
  historyOutcome: string;
  clipboardOutcome?: string | null;
  actionOutcome?: string | null;
  localItemId: number | null;
  originDeviceId: string;
  expiresAtUnixMs: string;
};
export type SharedClipboardSnapshot = {
  controlSyncState?: string;
  unavailableChannelIds?: string[];
  available: boolean;
  configured: boolean;
  paused: boolean;
  sendPaused?: boolean;
  receivePaused?: boolean;
  generalSendScope?: "all" | "unfiled";
  connections?: SharedConnection[];
  actionTargets?: Record<string, string>;
  environment?: string;
  deviceId?: string;
  endpoint?: string;
  channels: SharedChannelPolicy[];
  outbox: SharedPublicationSummary[];
  receipts: SharedReceiptSummary[];
  lastError?: string;
  sendActiveShortcut?: string | null;
  sendClipboardShortcut?: string | null;
};
export type SharedEnrollmentPreview = {
  fingerprint: string;
  environment: string;
  deviceId: string;
  endpoint: string;
  channels: Array<{ id: string; name: string; canPublish: boolean }>;
  devicePublicKey: string;
};

export const sharedClipboardApi = {
  status: () => invoke<SharedClipboardSnapshot>("shared_clipboard_status"),
  previewEnrollment: (bundlePath: string) => invoke<SharedEnrollmentPreview>("shared_clipboard_preview_enrollment", { bundlePath }),
  configure: (bundlePath: string, confirmedFingerprint: string) => invoke<SharedClipboardSnapshot>("shared_clipboard_configure", { bundlePath, confirmedFingerprint }),
  updateChannel: (policy: SharedChannelPolicy) => invoke<SharedClipboardSnapshot>("shared_clipboard_update_channel", { policy }),
  setPaused: (paused: boolean) => invoke<SharedClipboardSnapshot>("shared_clipboard_set_paused", { paused }),
  copyReceipt: (subscriptionId: string, publicationId: string) => invoke<void>("shared_clipboard_copy_receipt", { subscriptionId, publicationId }),
  receiptText: (subscriptionId: string, publicationId: string) => invoke<string>("shared_clipboard_receipt_text", { subscriptionId, publicationId }),
  setHotkeys: (sendActiveShortcut: string | null, sendClipboardShortcut: string | null) => invoke<SharedClipboardSnapshot>("shared_clipboard_set_hotkeys", { sendActiveShortcut, sendClipboardShortcut }),
};
export type SharedClipboardApi = typeof sharedClipboardApi;

/** Folder scope is deliberately exact; null is Root, never an implicit off switch. */
export function sharedChannelValidation(policy: SharedChannelPolicy, channels: SharedChannelPolicy[], folderIds: number[]): string | null {
  if (policy.publishFolderEnabled && !policy.canPublish) return "This device cannot publish to this channel.";
  if (policy.defaultSendChannel && !policy.canPublish) return "This device cannot send to this channel.";
  if (policy.defaultSendChannel && channels.some(channel => channel.id !== policy.id && channel.defaultSendChannel)) return "Turn off Send shortcuts in the other default channel first.";
  if (policy.publishFolderEnabled && policy.publishFolderId !== null && !folderIds.includes(policy.publishFolderId)) return "Choose an existing publication folder.";
  if (policy.saveToFolder && policy.receiveFolderId !== null && !folderIds.includes(policy.receiveFolderId)) return "Choose an existing reception folder.";
  if (policy.receiveActionWritesClipboard && !policy.receiveActionEnabled) return "Enable the reception action before allowing its clipboard output.";
  if (policy.updateClipboard && policy.receiveActionWritesClipboard) return "Choose one Windows clipboard output: original text or reception action.";
  if (sharedChannelHasClipboardWriter(policy) && channels.some(channel => channel.id !== policy.id && sharedChannelHasClipboardWriter(channel))) return "Turn off Windows clipboard updates in the other channel first.";
  if (policy.receiveActionEnabled && !policy.receiveActionId) return "Choose an authorized local reception action.";
  return null;
}

export function sharedChannelHasClipboardWriter(policy: SharedChannelPolicy): boolean {
  return policy.updateClipboard || (policy.receiveActionEnabled && policy.receiveActionWritesClipboard);
}

export function sharedReceptionActionEligible(action: ActionDefinition, channelId: string): boolean {
  return action.source === "script" && action.triggers.includes("sharedReception")
    && action.input.source === "none" && action.input.selection === "none"
    && action.capabilities.includes(`shared:receive:${channelId}`)
    && !action.diagnostics.some(diagnostic => diagnostic.severity === "error")
    && !action.capabilities.some(capability => ["input:paste", "picker:activate"].includes(capability));
}

export function sharedForwardTargetEligible(action: ActionDefinition, originChannelId: string, target: SharedChannelPolicy): boolean {
  return target.canPublish && target.id !== originChannelId
    && action.capabilities.includes("shared:publish")
    && action.capabilities.includes(`shared:publish:${target.id}`)
    && action.capabilities.includes(`shared:forward:${originChannelId}:${target.id}`);
}

export function sharedReceiptCanCopy(receipt: SharedReceiptSummary, now = Date.now()): boolean {
  const expiry = Number(receipt.expiresAtUnixMs);
  return receipt.acquisition === "ready" && Number.isFinite(expiry) && expiry > now;
}

export function sharedPublicationState(publication: SharedPublicationSummary): string {
  if (publication.commitAmbiguous) return "Awaiting confirmation";
  return ({ pending: "Queued", queued: "Queued", committed: "Accepted by service", delivered: "Delivered", expired: "Expired", rejected: "Rejected", cancelled: "Cancelled" } as Record<string, string>)[publication.state] ?? publication.state;
}

export function sharedReceiptStatus(receipt: SharedReceiptSummary, now = Date.now()): string {
  if (Number(receipt.expiresAtUnixMs) <= now || receipt.acquisition === "expired") return "Expired";
  const acquisition = ({ ready: "Ready", pendingKey: "Awaiting key", pendingFetch: "Awaiting download", rejected: "Rejected" } as Record<string, string>)[receipt.acquisition] ?? receipt.acquisition;
  if (receipt.acquisition !== "ready") return acquisition;
  const states = [acquisition];
  if (receipt.historyOutcome === "applied") states.push("Saved in Copicu");
  if (receipt.historyOutcome === "failed") states.push("Could not save");
  if (receipt.clipboardOutcome === "applied") states.push("Windows clipboard updated");
  if (receipt.clipboardOutcome === "claimed") states.push("Clipboard update pending");
  if (receipt.clipboardOutcome === "failed") states.push("Clipboard update failed");
  if (receipt.clipboardOutcome === "uncertain") states.push("Clipboard update unconfirmed");
  if (receipt.actionOutcome === "applied") states.push("Local action ran");
  if (receipt.actionOutcome === "claimed") states.push("Local action pending");
  if (receipt.actionOutcome === "failed") states.push("Local action failed");
  if (receipt.actionOutcome === "uncertain") states.push("Local action unconfirmed");
  return states.join(" · ");
}

export const sharedReceiptKey = (receipt: SharedReceiptSummary) => JSON.stringify([receipt.subscriptionId, receipt.publicationId]);

/** Metadata search never downloads or indexes received payloads. Sequences stay lossless. */
export function sharedReceptionRows(snapshot: SharedClipboardSnapshot, query: string): SharedReceiptSummary[] {
  const names = new Map(snapshot.channels.map(channel => [channel.id, channel.name]));
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return snapshot.receipts.filter(receipt => {
    const metadata = `${names.get(receipt.channelId) ?? receipt.channelId} ${receipt.originDeviceId}`.toLocaleLowerCase();
    return words.every(word => metadata.includes(word));
  }).sort((left, right) => {
    const channelOrder = (names.get(left.channelId) ?? left.channelId).localeCompare(names.get(right.channelId) ?? right.channelId);
    if (channelOrder) return channelOrder;
    const a = BigInt(left.sequence); const b = BigInt(right.sequence);
    return a === b ? 0 : a > b ? -1 : 1;
  });
}

export type SharedReceiptPreview = {
  receiptKey: string | null;
  status: "idle" | "loading" | "ready" | "unavailable" | "error";
  text: string | null;
};
/** A single visible payload; switching, closing or expiring invalidates pending reads. */
export function createSharedReceiptLoader(readText: (subscriptionId: string, publicationId: string) => Promise<string>, show: (preview: SharedReceiptPreview) => void, now: () => number = Date.now) {
  let generation = 0;
  return {
    clear: () => { generation += 1; show({ receiptKey: null, status: "idle", text: null }); },
    unavailable: (receipt: SharedReceiptSummary) => { generation += 1; show({ receiptKey: sharedReceiptKey(receipt), status: "unavailable", text: null }); },
    async load(receipt: SharedReceiptSummary) {
      const requested = ++generation;
      const receiptKey = sharedReceiptKey(receipt);
      show({ receiptKey, status: "loading", text: null });
      if (!sharedReceiptCanCopy(receipt, now())) { show({ receiptKey, status: "unavailable", text: null }); return; }
      try {
        const text = await readText(receipt.subscriptionId, receipt.publicationId);
        if (generation !== requested) return;
        show(sharedReceiptCanCopy(receipt, now()) ? { receiptKey, status: "ready", text } : { receiptKey, status: "unavailable", text: null });
      } catch { if (generation === requested) show({ receiptKey, status: "error", text: null }); }
    },
  };
}
