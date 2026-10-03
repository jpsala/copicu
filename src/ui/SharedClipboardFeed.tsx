import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import ArrowLeft from "lucide-react/dist/esm/icons/arrow-left.mjs";
import Copy from "lucide-react/dist/esm/icons/copy.mjs";
import RefreshCw from "lucide-react/dist/esm/icons/refresh-cw.mjs";
import Settings2 from "lucide-react/dist/esm/icons/settings-2.mjs";
import { createSharedReceiptLoader, sharedClipboardApi, sharedReceiptCanCopy, sharedReceiptKey, sharedReceiptStatus, sharedReceptionRows, type SharedClipboardApi, type SharedClipboardSnapshot, type SharedReceiptPreview, type SharedReceiptSummary } from "../shared/sharedClipboard";
import { UiButton, UiIconButton, UiTextInput } from "./controls";
import "./sharedClipboard.css";

export type SharedClipboardFeedProps = {
  api?: Pick<SharedClipboardApi, "status" | "receiptText" | "copyReceipt"> & Partial<Pick<SharedClipboardApi, "receiptPreview">>;
  onClose?: () => void;
  onOpenSettings?: () => void;
  closeLabel?: string;
};
const idle: SharedReceiptPreview = { receiptKey: null, status: "idle", text: null };
const deliveryLabel = (receipt: SharedReceiptSummary) => receipt.delivery === "live" ? "Live arrival" : receipt.delivery === "recovery" ? "Recovered after reconnect" : "Delayed publication";

/** Remote publications are immutable and separate from the editable local history. */
export function SharedClipboardFeed({ api = sharedClipboardApi, onClose, onOpenSettings, closeLabel = "Return to local history" }: SharedClipboardFeedProps) {
  const [snapshot, setSnapshot] = useState<SharedClipboardSnapshot | null>(null);
  const [query, setQuery] = useState("");
  const [preview, setPreview] = useState<SharedReceiptPreview>(idle);
  const [now, setNow] = useState(Date.now);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [copying, setCopying] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef(true);
  const copyingRef = useRef(false);
  const id = useId();
  const loader = useMemo(() => createSharedReceiptLoader(api.receiptPreview ?? api.receiptText, next => { if (activeRef.current) setPreview(next); }), [api]);
  const receipts = useMemo(() => snapshot ? sharedReceptionRows(snapshot, query) : [], [snapshot, query]);
  const hasVisibleSelection = receipts.some(receipt => sharedReceiptKey(receipt) === preview.receiptKey);
  const selected = snapshot?.receipts.find(receipt => sharedReceiptKey(receipt) === preview.receiptKey);
  const channelName = (receipt: SharedReceiptSummary) => snapshot?.channels.find(channel => channel.id === receipt.channelId)?.name ?? receipt.channelId;
  const refresh = async () => {
    try {
      const next = await api.status();
      if (activeRef.current) { setSnapshot(next); setError(null); setNow(Date.now()); }
    } catch { if (activeRef.current) setError("Could not read receptions. Refresh to try again."); }
  };
  useEffect(() => {
    activeRef.current = true;
    setPreview(idle);
    void refresh();
    const refreshTimer = window.setInterval(() => void refresh(), 5000);
    const expiryTimer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => { activeRef.current = false; window.clearInterval(refreshTimer); window.clearInterval(expiryTimer); loader.clear(); };
  }, [api, loader]);
  useEffect(() => {
    if (preview.receiptKey && snapshot && !selected) loader.clear();
    else if (selected && !sharedReceiptCanCopy(selected, now) && preview.status !== "unavailable") loader.unavailable(selected);
  }, [snapshot, selected, now, preview.receiptKey, preview.status, loader]);
  const select = (receipt: SharedReceiptSummary) => { setNotice(null); void loader.load(receipt); };
  const copy = async () => {
    if (!selected || !sharedReceiptCanCopy(selected) || copyingRef.current) return;
    copyingRef.current = true; setCopying(true); setNotice(null);
    try {
      await api.copyReceipt(selected.subscriptionId, selected.publicationId);
      if (activeRef.current) { setNotice(`Received ${preview.image ? "image" : "text"} copied to Windows clipboard.`); void refresh(); }
    } catch { if (activeRef.current) setNotice("Could not copy this reception. Refresh its status and try again."); }
    finally { copyingRef.current = false; if (activeRef.current) setCopying(false); }
  };
  const onListKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!receipts.length || !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const current = receipts.findIndex(receipt => sharedReceiptKey(receipt) === preview.receiptKey);
    const index = event.key === "Home" ? 0 : event.key === "End" ? receipts.length - 1 : Math.max(0, Math.min(receipts.length - 1, current + (event.key === "ArrowDown" ? 1 : -1)));
    select(receipts[index]);
    listRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]')[index]?.focus();
  };
  const empty = !snapshot ? "Checking receptions…" : !snapshot.available ? "Sharing is unavailable in this build." : !snapshot.configured ? "Link this device in Sharing settings to receive content from a shared clipboard." : query.trim() ? "No channels or devices match this filter." : "No receptions yet. Enable reception for a channel in Sharing settings.";
  return <section className="shared-clipboard-feed" aria-label="Shared clipboard receptions" data-testid="shared-clipboard-feed" onKeyDown={event => {
    if (event.key === "Escape" && onClose) { event.preventDefault(); event.stopPropagation(); loader.clear(); onClose(); }
    if (event.key === "Enter") { event.stopPropagation(); if (event.target instanceof HTMLInputElement) event.preventDefault(); }
  }}>
    <header className="shared-feed-header">
      <div className="shared-feed-heading">{onClose && <UiIconButton type="button" variant="subtle" aria-label={closeLabel} onClick={() => { loader.clear(); onClose(); }}><ArrowLeft size={17} aria-hidden="true" /></UiIconButton>}<div><h2>Shared clipboard</h2><span>{snapshot?.paused ? "Sharing paused" : "Received publications"}</span></div></div>
      <div className="shared-settings-actions"><UiIconButton type="button" variant="subtle" aria-label="Refresh receptions" onClick={() => void refresh()}><RefreshCw size={16} aria-hidden="true" /></UiIconButton>{onOpenSettings && <UiIconButton type="button" variant="subtle" aria-label="Open Sharing settings" onClick={onOpenSettings}><Settings2 size={16} aria-hidden="true" /></UiIconButton>}</div>
    </header>
    {error && <p className="shared-feed-error" role="alert">{error}</p>}
    {snapshot?.lastError && <p className="shared-feed-error" role="alert">{snapshot.lastError}</p>}
    <div className="shared-feed-workspace">
      <div className="shared-feed-browser">
        <UiTextInput type="search" aria-label="Filter receptions by channel or device" placeholder="Filter by channel or device" value={query} onChange={event => setQuery(event.currentTarget.value)} />
        <div className="shared-feed-list" role="listbox" aria-label="Received publications" ref={listRef} onKeyDown={onListKeyDown}>
          {receipts.map((receipt, index) => {
            const key = sharedReceiptKey(receipt); const chosen = key === preview.receiptKey;
            return <button key={key} type="button" role="option" aria-selected={chosen} tabIndex={chosen || (!hasVisibleSelection && index === 0) ? 0 : -1} className="shared-feed-row" onClick={() => select(receipt)}>
              <strong>{channelName(receipt)}</strong><span>From {receipt.originDeviceId}</span><small>{deliveryLabel(receipt)} · {sharedReceiptStatus(receipt, now)}</small>
            </button>;
          })}
        </div>
        {!receipts.length && <p className="shared-feed-empty">{empty}</p>}
      </div>
      <div className="shared-feed-preview" aria-label="Reception preview" aria-busy={preview.status === "loading"}>
        {selected ? <>
          <header><div><h3>{channelName(selected)}</h3><p>From {selected.originDeviceId}</p></div><UiButton type="button" variant="default" size="compact-sm" leftSection={<Copy size={14} aria-hidden="true" />} disabled={!sharedReceiptCanCopy(selected, now) || copying} loading={copying} onClick={() => void copy()}>{preview.image ? "Copy image" : "Copy text"}</UiButton></header>
          <div className="shared-feed-provenance"><span>{deliveryLabel(selected)}</span><span>{sharedReceiptStatus(selected, now)}</span></div>
          {selected.delivery !== "live" && <p className="shared-feed-description">Recovered and delayed content stays available for manual copy. It does not overwrite Windows clipboard automatically.</p>}
          <p className="shared-feed-description">This publication is immutable. Local edits do not change its received content.</p>
          {preview.status === "loading" && <p className="shared-feed-loading" role="status">Reading received content…</p>}
          {preview.status === "ready" && (preview.image ? <figure className="shared-image-preview"><img src={preview.image} alt="Received clipboard image" /><figcaption>{preview.width} × {preview.height}</figcaption></figure> : <pre className="shared-feed-text" tabIndex={0} aria-label="Received plain text">{preview.text}</pre>)}
          {preview.status === "unavailable" && <p className="shared-feed-empty">Content is unavailable or expired. Its publication metadata remains visible.</p>}
          {preview.status === "error" && <div className="shared-feed-read-error"><p role="alert">Could not read this reception.</p><UiButton type="button" size="compact-sm" variant="default" onClick={() => select(selected)}>Retry preview</UiButton></div>}
          <details className="shared-feed-details"><summary>Publication details</summary><dl><div><dt>Publication</dt><dd>{selected.publicationId}</dd></div><div><dt>Sequence</dt><dd>{selected.sequence}</dd></div><div><dt>Expires</dt><dd>{Number.isFinite(Number(selected.expiresAtUnixMs)) ? new Date(Number(selected.expiresAtUnixMs)).toLocaleString() : "Unavailable"}</dd></div>{selected.localItemId !== null && <div><dt>Local clip</dt><dd>{selected.localItemId}</dd></div>}</dl></details>
        </> : <div className="shared-feed-empty shared-feed-preview-empty"><h3>Choose a reception</h3><p>Preview its content, check where it came from, then copy it manually.</p></div>}
        {notice && <p className="shared-feed-notice" role="status" id={`${id}-notice`}>{notice}</p>}
      </div>
    </div>
  </section>;
}
