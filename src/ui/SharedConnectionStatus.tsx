import { useEffect, useState } from "react";
import type { FolderScope } from "../shared/contracts";
import { sharedClipboardApi, sharedReceiptSaveLabel, type SharedClipboardSnapshot } from "../shared/sharedClipboard";
import { connectionContext } from "../shared/sharedProduct";
import { useSharedCatalogInvalidation } from "../shared/useSharedCatalogInvalidation";

export function SharedConnectionStatus({ scope, revision, onConnect, onManage }: { scope: FolderScope; revision: number; onConnect: () => void; onManage: () => void }) {
  const [snapshot, setSnapshot] = useState<SharedClipboardSnapshot | null>(null);
  const id = connectionContext(scope.kind === "all" ? "general" : "folder", scope.kind === "folder" ? scope.folderId : null);
  useSharedCatalogInvalidation(async () => { setSnapshot(await sharedClipboardApi.status()); });
  useEffect(() => {
    let active = true;
    const refresh = () => void sharedClipboardApi.status().then(status => { if (active) setSnapshot(status); }).catch(() => {});
    refresh(); const timer = window.setInterval(refresh,5000);
    return () => { active=false; window.clearInterval(timer); };
  }, [id,revision]);
  const connection=snapshot?.connections?.find(current=>current.id===id);
  const channel=snapshot?.channels.find(current=>current.id===connection?.channelId);
  const paused = channel && ((connection?.direction !== "receive" && (snapshot?.sendPaused || channel.sendPaused)) || (connection?.direction !== "send" && (snapshot?.receivePaused || channel.receivePaused)));
  const unavailable = connection && snapshot?.unavailableChannelIds?.includes(connection.channelId);
  const latest = connection?.direction !== "send" ? snapshot?.receipts.find(receipt => receipt.channelId === connection?.channelId && receipt.originDeviceId !== snapshot.deviceId && (receipt.historyResult ? receipt.historyResult.folderId === (scope.kind === "folder" ? scope.folderId : null) : receipt.historyOutcome === "failed")) : undefined;
  const activity = latest && sharedReceiptSaveLabel(latest);
  return <span className="shared-context-controls">
    <button type="button" className="folder-scope-chip" aria-label="Connect shared clipboard" title={unavailable ? "Clipboard unavailable; review this connection" : connection ? "Edit shared clipboard connection" : "Connect shared clipboard to this context"} onClick={onConnect}>{channel ? `${channel.name} · ${connection?.direction}${unavailable ? " · unavailable" : paused ? " · paused" : ""}` : "Connect…"}</button>
    <button type="button" className="folder-scope-chip" aria-label="Shared clipboards" title="Browse and manage shared clipboards" onClick={onManage}>Shared</button>
    {activity && <span className="shared-folder-activity" role="status" title={latest?.historyResult ? `${activity} · ${new Date(latest.historyResult.receivedAtUnixMs).toLocaleString()}` : activity}>{activity}</span>}
  </span>;
}
