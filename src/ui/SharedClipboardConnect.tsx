import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import { emitTo } from "@tauri-apps/api/event";
import type { FolderScope, FolderSummary } from "../shared/contracts";
import { sharedClipboardApi, type SharedClipboardSnapshot } from "../shared/sharedClipboard";
import { connectionContext, connectionReceives, resourceResults, sharedProductApi, type SharedCatalog, type SharedConnection, type SharedProductApi } from "../shared/sharedProduct";
import { UiButton, UiCheckbox, UiSelect, UiTextInput } from "./controls";
import { folderScopeLabel } from "./FolderWorkspace";
import "./sharedClipboard.css";
import { useSharedCatalogInvalidation } from "../shared/useSharedCatalogInvalidation";

export function SharedClipboardConnect({ scope, folders, onClose, onConnected, api = sharedProductApi }: { scope: FolderScope; folders: FolderSummary[]; onClose: () => void; onConnected?: () => void; api?: SharedProductApi }) {
  const [catalog, setCatalog] = useState<SharedCatalog | null>(null);
  const [snapshot, setSnapshot] = useState<SharedClipboardSnapshot | null>(null);
  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState<string | null>(null);
  const [direction, setDirection] = useState<SharedConnection["direction"]>("receive");
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [moveReception, setMoveReception] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const operation = useRef<{ id: string; name: string } | null>(null);
  const modal = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const initialFocus = useRef<HTMLElement | null>(null);
  const kind = scope.kind === "all" ? "general" : "folder";
  const folderId = scope.kind === "folder" ? scope.folderId : null;
  const id = connectionContext(kind, folderId);
  const context = folderScopeLabel(scope, folders);
  const selected = catalog?.resources.find(resource => resource.id === chosen);
  const results = catalog ? resourceResults(catalog, query) : [];
  const receiver = snapshot?.connections?.find(connection => connection.channelId === chosen && connection.id !== id && connectionReceives(connection));
  const receiverLabel = receiver?.kind === "general" ? "All history (Root)" : receiver?.folderId === null ? "/" : folders.find(folder => folder.id === receiver?.folderId)?.path ?? "another folder";
  const canSend = selected?.permission !== "read";
  const ready = !!selected && selected.keyState === "ready" && (direction === "receive" || canSend) && (!receiver || direction === "send" || moveReception);
  useSharedCatalogInvalidation(async () => {
    const status = await sharedClipboardApi.status();
    if ((!status.configured || ["waiting", "pending", "revoked", "expired", "cancelled"].includes(status.identityState ?? ""))) { setNeedsSignIn(true); setSnapshot(status); return; }
    const next = await api.catalog();
    setNeedsSignIn(false);
    setCatalog(next); setSnapshot(status);
    if (chosen && !next.resources.some(resource => resource.id === chosen)) setError("This clipboard was removed or your access was revoked. Choose a clipboard to continue.");
  }, busy);
  useEffect(() => {
    initialFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    let active = true;
    void sharedClipboardApi.status().then(async status => {
      if (!active) return;
      setSnapshot(status);
      if ((!status.configured || ["waiting", "pending", "revoked", "expired", "cancelled"].includes(status.identityState ?? ""))) { setNeedsSignIn(true); return; }
      const next = await api.catalog();
      if (!active) return;
      setCatalog(next); setSnapshot(status);
      const current = status.connections?.find(connection => connection.id === id);
      if (current) {
        setChosen(current.channelId); setDirection(current.direction);
        if (!next.resources.some(resource => resource.id === current.channelId)) setError("This clipboard was removed or your access was revoked. Choose a clipboard to continue.");
      }
    }).catch(failure => { if (active) setError(String(failure)); });
    search.current?.focus();
    return () => { active = false; initialFocus.current?.isConnected && initialFocus.current.focus(); };
  }, [api, id]);
  useEffect(() => {
    if (!needsSignIn) return;
    let active = true;
    const timer = window.setInterval(() => {
      void sharedClipboardApi.status().then(async status => {
        if (!active || (!status.configured || ["waiting", "pending", "revoked", "expired", "cancelled"].includes(status.identityState ?? ""))) return;
        const next = await api.catalog();
        if (active) { setSnapshot(status); setCatalog(next); setNeedsSignIn(false); setError(null); }
      }).catch(failure => { if (active) setError(String(failure)); });
    }, 3000);
    return () => { active = false; window.clearInterval(timer); };
  }, [needsSignIn, api]);
  const confirm = async () => {
    if (busy || needsSignIn || (!creating && !ready) || (creating && !name.trim())) return;
    setBusy(true); setError(null);
    try {
      let channelId = chosen;
      if (creating && !createdId) {
        if (!operation.current || operation.current.name !== name.trim()) operation.current = { id: crypto.randomUUID().replaceAll("-", ""), name: name.trim() };
        const result = await api.operation({ operationId: operation.current.id, kind: "create", name: operation.current.name }) as { resource?: { id: string }; id?: string; resourceId?: string };
        channelId = result.resource?.id ?? result.resourceId ?? result.id ?? null;
        if (!channelId) throw new Error("The service did not return the created clipboard. Retry the same operation.");
        setCreatedId(channelId); setChosen(channelId);
      } else if (createdId) channelId = createdId;
      if (!channelId) return;
      await api.connect({ id, channelId, kind, folderId, direction, moveReception });
      onConnected?.(); onClose();
    } catch (failure) { setError(String(failure)); }
    finally { setBusy(false); }
  };
  return createPortal(<div className="shared-connect-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <div ref={modal} className="shared-connect-panel" role="dialog" aria-modal="true" aria-labelledby="shared-connect-title" onKeyDown={event => {
      event.stopPropagation();
      if (event.key === "Escape" && !busy) { event.preventDefault(); onClose(); }
      if (event.key === "Tab") {
        const controls = Array.from(modal.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),[tabindex="0"]') ?? []).filter(el => el.getClientRects().length);
        const first = controls[0], last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }}>
      <header><h2 id="shared-connect-title">Connect shared clipboard</h2><span>{context}{kind === "general" ? " · General connection" : " · Exact folder"}</span></header>
      {catalog?.mode === "synthetic" && <p className="shared-inline-notice">Local synthetic service. Human account linking is not configured.</p>}
      {error && <p className="shared-error" role="alert">{error}</p>}
      {needsSignIn && <div className="shared-settings-group"><p>Link this PC in Settings → Sharing, then return to connect {context}. Your connection choices stay here. Linking does not send existing content.</p><UiButton type="button" variant="default" onClick={() => void invoke("open_settings_window").then(() => emitTo("settings", "copicu://settings/focus-section", "sharing")).catch(failure => setError(String(failure)))}>Open Sharing settings</UiButton></div>}
      {!catalog && !error && !needsSignIn && <p role="status">Loading available clipboards…</p>}
      {catalog && !needsSignIn && <>
        {!creating ? <>
          <UiTextInput ref={search} label="Find shared clipboard" placeholder="Name or owner" value={query} disabled={busy} onChange={event => setQuery(event.currentTarget.value)} onKeyDown={event => { if (event.key === "ArrowDown" && results[0]) { event.preventDefault(); setChosen(results[0].id); document.getElementById(`shared-resource-${results[0].id}`)?.focus(); } else if (event.key === "Enter") event.preventDefault(); }} />
          <div className="shared-resource-options" role="listbox" aria-label="Available shared clipboards" onKeyDown={event => {
            if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
            event.preventDefault();
            const index = results.findIndex(resource => resource.id === chosen);
            const next = (index + (event.key === "ArrowDown" ? 1 : results.length - 1)) % results.length;
            if (results[next]) { setChosen(results[next].id); document.getElementById(`shared-resource-${results[next].id}`)?.focus(); }
          }}>
            {results.map((resource, index) => <button key={resource.id} id={`shared-resource-${resource.id}`} type="button" role="option" aria-selected={resource.id === chosen} tabIndex={resource.id === chosen || (!chosen && index === 0) ? 0 : -1} disabled={busy} onClick={() => { setChosen(resource.id); setMoveReception(false); if (resource.permission === "read") setDirection("receive"); }}><strong>{resource.name}</strong><span>{resource.permission === "owner" ? "Mine" : `Shared by ${resource.ownerName}`} · {resource.permission === "read" ? "Read only" : "Can send and receive"}{resource.keyState !== "ready" ? " · Awaiting keys" : ""}</span></button>)}
            {!results.length && <p>No available clipboard matches. Create one in your space.</p>}
          </div>
          <UiButton type="button" variant="subtle" disabled={busy} onClick={() => { setCreating(true); setName(query); }}>Create shared clipboard…</UiButton>
        </> : <div className="shared-settings-group">
          <UiTextInput label="New clipboard name" autoFocus value={name} disabled={busy || !!createdId || !!operation.current} onChange={event => setName(event.currentTarget.value)} />
          <p>Private to your own devices. Inviting another person is a separate action.</p>
          {!createdId && !operation.current && <UiButton type="button" variant="subtle" disabled={busy} onClick={() => setCreating(false)}>Choose existing clipboard</UiButton>}
        </div>}
        <UiSelect label="Direction" value={direction} disabled={busy} data={[{ value: "send", label: "Send", disabled: !creating && !canSend }, { value: "receive", label: "Receive" }, { value: "both", label: "Send and receive", disabled: !creating && !canSend }]} onChange={value => { if (value) setDirection(value as SharedConnection["direction"]); }} />
        {receiver && direction !== "send" && <UiCheckbox label={`Move automatic reception from ${receiverLabel} to ${context}`} checked={moveReception} disabled={busy} onChange={event => setMoveReception(event.currentTarget.checked)} />}
        <p>{direction !== "receive" ? `${context} sends new local texts${kind === "general" ? snapshot?.generalSendScope === "all" ? " from all Copicu folders" : " without a folder" : " from this exact folder"}. ` : ""}{direction !== "send" ? `New received texts are saved in ${kind === "general" ? "Root" : context}. ` : ""}Existing content stays where it is. Windows updates and Actions remain separate.</p>
        {selected?.keyState === "pending" && <p role="status">This device needs approved content keys before it can connect.</p>}
        {createdId && <p role="status">Created; connection still needs to be completed. Retry keeps the same resource.</p>}
      </>}
      <footer><UiButton type="button" variant="default" disabled={busy} onClick={onClose}>Cancel</UiButton><UiButton type="button" loading={busy} disabled={needsSignIn || !catalog || busy || (creating ? !name.trim() : !ready)} onClick={() => void confirm()}>{createdId ? "Retry connection" : creating ? "Create and connect" : "Connect clipboard"}</UiButton></footer>
    </div>
  </div>, document.body);
}
