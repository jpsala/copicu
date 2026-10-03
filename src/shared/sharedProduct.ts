import { invoke } from "@tauri-apps/api/core";
import type { SharedClipboardSnapshot } from "./sharedClipboard";

export type SharedConnection = { id: string; channelId: string; kind: "general" | "folder"; folderId: number | null; direction: "send" | "receive" | "both" };
export type SharedResource = { id: string; name: string; ownerId: string; ownerName: string; permission: "owner" | "write" | "read"; revision: string; keyState: "ready" | "pending"; retentionHours: number; participants?: Array<{ id: string; name: string; permission: string; revoked?: number }>; invites?: Array<{ id: string; personId: string; permission: string; includeHistory: number; state: string }> };
export type SharedCatalog = { person: { id: string; name: string }; mode: "synthetic" | "service" | "private"; resources: SharedResource[]; deviceReviews?: SharedDeviceReview[]; people?: Array<{ id: string; name: string }>; invitations?: Array<{ id: string; resourceId: string; ownerName: string; permission: string; includeHistory: number; state: string }>; operations?: Array<{ operationId: string; resourceId: string | null; kind: string; status: string }>; pendingOperations?: Array<{ operationId: string; kind: string; resourceId: string; status: string; recoverable: boolean }> };
export type SharedHistoryEntry = { publicationId: string; channelId: string; sequence: string; originDeviceId: string; expiresAtUnixMs: string; text?: string; kind?: "text" | "image"; image?: string; width?: number; height?: number; byteSize?: number; status: string };
export type SharedHistoryPage = { entries: SharedHistoryEntry[]; before: string | null; head: string; floor: string };
export type SharedOperation = { operationId: string; kind: string; resourceId?: string; expectedRevision?: string; name?: string; personId?: string; permission?: string; includeHistory?: boolean; invitationId?: string };
export type SharedDeviceReview = { personId: string; deviceId: string; fingerprint: string; state: "ready" | "pending" | "revoked" };
export const sharedProductApi = {
  catalog: () => invoke<SharedCatalog>("shared_clipboard_catalog"),
  operation: (input: SharedOperation) => invoke<unknown>("shared_clipboard_operation", { input }),
  connect: (input: SharedConnection & { moveReception: boolean }) => invoke<SharedClipboardSnapshot>("shared_clipboard_connection", { action: "connect", input }),
  disconnect: (id: string) => invoke<SharedClipboardSnapshot>("shared_clipboard_connection", { action: "disconnect", input: { id } }),
  setScope: (scope: "all" | "unfiled") => invoke<SharedClipboardSnapshot>("shared_clipboard_connection", { action: "scope", input: { scope } }),
  pause: (channelId: string | null, sendPaused: boolean | null, receivePaused: boolean | null) => invoke<SharedClipboardSnapshot>("shared_clipboard_connection", { action: "pause", input: { channelId, sendPaused, receivePaused } }),
  history: (channelId: string, before: string | null = null) => invoke<SharedHistoryPage>("shared_clipboard_history", { channelId, before }),
  publish: (channelId: string, text: string) => invoke<{ publicationId: string; state: string }>("shared_clipboard_publish", { channelId, text }),
  publishCurrent: (channelId: string) => invoke<{ publicationId: string; state: string }>("shared_clipboard_publish_current", { channelId }),
  copyHistory: (channelId: string, publicationId: string) => invoke<{ outcome: string }>("shared_clipboard_history_action", { channelId, publicationId, action: "copy", folderId: null }),
  saveHistory: (channelId: string, publicationId: string, folderId: number | null) => invoke<{ itemId: number; folderId: number | null; alreadyExists: boolean }>("shared_clipboard_history_action", { channelId, publicationId, action: "save", folderId }),
  setActionTarget: (actionId: string, channelId: string | null) => invoke<SharedClipboardSnapshot>("shared_clipboard_action_target", { actionId, channelId }),
};
export type SharedProductApi = typeof sharedProductApi;

export function connectionContext(kind: SharedConnection["kind"], folderId: number | null): string { return kind === "general" ? "general" : `folder_${folderId ?? "root"}`; }
export function resourceResults(catalog: SharedCatalog, query: string): SharedResource[] {
  const words = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return catalog.resources.filter(resource => words.every(word => `${resource.name} ${resource.ownerName}`.toLocaleLowerCase().includes(word)))
    .sort((a, b) => Number(b.permission === "owner") - Number(a.permission === "owner") || a.name.localeCompare(b.name));
}
export const connectionReceives = (connection: SharedConnection) => connection.direction !== "send";
export const connectionSends = (connection: SharedConnection) => connection.direction !== "receive";
