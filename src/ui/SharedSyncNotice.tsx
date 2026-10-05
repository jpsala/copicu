import { useEffect, useState } from "react";
import AlertTriangle from "lucide-react/dist/esm/icons/triangle-alert.mjs";
import Copy from "lucide-react/dist/esm/icons/copy.mjs";
import type { SharedClipboardSnapshot, SharedSyncDiagnostic } from "../shared/sharedClipboard";
import { UiButton } from "./controls";

const messages: Record<string, { title: string; next: string }> = {
  protectedKeys: { title: "Sharing can't open its protected keys", next: "Restart Copicu. If this continues, check this PC's sign-in and copy the diagnostic below." },
  localStorage: { title: "Sharing couldn't access its local storage", next: "Restart Copicu. If this continues, copy the diagnostic below to investigate the storage failure." },
  configuration: { title: "Sharing needs a configuration check", next: "Check this PC's sign-in and connected folders. Copy the diagnostic if the problem continues." },
  serviceUnavailable: { title: "Sharing can't reach the service", next: "Check this PC's internet connection. If other PCs also fail, the sharing service may be unavailable." },
  serviceDenied: { title: "The sharing request wasn't authorized", next: "Check this PC's sign-in and its access to the shared clipboard." },
  publicationRejected: { title: "The service rejected a sharing request", next: "Review the cause below before sending again. Rejected publications are not resent automatically." },
  serviceQuota: { title: "Sharing reached the service limit", next: "Wait before sending more content. Copicu will retry queued items while they're still valid." },
  requestExpired: { title: "The sharing request expired", next: "Copicu will request a new session on its next attempt. Check this PC's clock if the problem continues." },
  invalidResponse: { title: "Sharing received an unexpected response", next: "Check that your PCs use the same current Copicu version. Copy the diagnostic if this continues." },
};

export function sharingDiagnosticText(issue: SharedSyncDiagnostic, snapshot: SharedClipboardSnapshot): string {
  const at = issue.occurredAtUnixMs;
  const date = at == null ? null : new Date(at);
  const channel = snapshot.channels.find(channel => channel.id === issue.channelId);
  const queued = snapshot.outbox.filter(item => ["pending", "queued"].includes(item.state)).length;
  return [
    "Copicu sharing diagnostic",
    `Code: ${issue.code}`,
    `Step: ${issue.stage}`,
    `Cause: ${issue.reason}`,
    `Last failure: ${date && Number.isFinite(date.getTime()) ? date.toISOString() : "Time unavailable"}`,
    ...(channel ? [`Shared clipboard: ${channel.name}`] : []),
    `Sharing paused: ${snapshot.paused || !!(snapshot.sendPaused && snapshot.receivePaused) ? "Yes" : "No"}`,
    `Queued items in recent activity: ${queued}`,
  ].join("\n");
}

/** Uses host-owned diagnostic metadata only; never reads clipboard contents. */
export function SharedSyncNotice({ snapshot, busy = false, onCheckStatus }: {
  snapshot: SharedClipboardSnapshot; busy?: boolean; onCheckStatus?: () => void;
}) {
  const [copyState, setCopyState] = useState<"idle" | "copying" | "copied" | "failed">("idle");
  const issue = snapshot.syncDiagnostic;
  const report = issue ? sharingDiagnosticText(issue, snapshot) : `Copicu sharing diagnostic\nCause: ${snapshot.lastError}`;
  useEffect(() => { setCopyState(previous => previous === "copying" ? previous : "idle"); }, [report]);
  if (!issue && !snapshot.lastError) return null;
  const presentation = issue ? messages[issue.code] : null;
  const paused = snapshot.paused || (snapshot.sendPaused && snapshot.receivePaused);
  const copy = async () => {
    setCopyState("copying");
    try { await navigator.clipboard.writeText(report); setCopyState("copied"); }
    catch { setCopyState("failed"); }
  };
  return <section className="shared-sync-notice" aria-label="Sharing issue">
    <div className="shared-sync-heading" role="alert">
      <AlertTriangle size={18} aria-hidden="true" />
      <div><strong>{presentation?.title ?? "Sharing couldn't complete its last operation"}</strong>
        <p>{issue ? "Sending or receiving may be delayed. Your local history is still available." : snapshot.lastError}</p></div>
    </div>
    <p>{presentation?.next ?? "Review the details below and refresh status to check sharing."}</p>
    {issue && <p className="shared-sync-retry">{paused ? "Sharing is paused. Resume it when you're ready to try again." : "Copicu checks sharing again automatically."}</p>}
    {onCheckStatus && <div className="shared-settings-actions"><UiButton type="button" variant="default" size="compact-sm" disabled={busy} loading={busy} onClick={onCheckStatus}>Check status</UiButton></div>}
    <details className="shared-sync-details">
      <summary>Technical details</summary>
      <textarea readOnly rows={8} aria-label="Sharing diagnostic" value={report} />
      <div className="shared-settings-actions"><UiButton type="button" variant="default" size="compact-sm" leftSection={<Copy size={14} aria-hidden="true" />} loading={copyState === "copying"} disabled={copyState === "copying"} onClick={() => void copy()}>Copy diagnostic</UiButton>
        <span role="status">{copyState === "copied" ? "Diagnostic copied." : copyState === "failed" ? "Couldn't copy. Select the diagnostic above and copy it manually." : ""}</span></div>
    </details>
    {issue && snapshot.lastError && snapshot.lastError !== issue.reason && <p className="shared-sync-other" role="alert">Another reported issue: {snapshot.lastError}</p>}
  </section>;
}
