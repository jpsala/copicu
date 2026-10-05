import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import { emitTo } from "@tauri-apps/api/event";
import type { FolderScope, FolderSummary } from "../shared/contracts";
import { sharedClipboardApi, type SharedClipboardSnapshot } from "../shared/sharedClipboard";
import { connectionContext, connectionReceives, resourceResults, sharedProductApi, type SharedCatalog, type SharedConnection, type SharedProductApi } from "../shared/sharedProduct";
import { UiButton, UiCheckbox, UiSelect, UiTextInput } from "./controls";
import { folderScopeLabel } from "./FolderWorkspace";
import { FolderSelect } from "./FolderSelect";
import "./sharedClipboard.css";
import { useSharedCatalogInvalidation } from "../shared/useSharedCatalogInvalidation";

export function SharedClipboardConnect({ scope, folders, existingConnectionId, chooseFolder = false, onClose, onConnected, api = sharedProductApi }: { scope: FolderScope; folders: FolderSummary[]; existingConnectionId?: string; chooseFolder?: boolean; onClose: () => void; onConnected?: () => void; api?: SharedProductApi }) {
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
  const [chosenFolderId, setChosenFolderId] = useState<number | null>(null);
  const operation = useRef<{ id: string; name: string } | null>(null);
  const modal = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const initialFocus = useRef<HTMLElement | null>(null);
  const focusedSearch = useRef(false);
  const editing = existingConnectionId !== undefined;
  const canChooseFolder = chooseFolder && !editing && scope.kind !== "all";
  const localScope: FolderScope = canChooseFolder ? chosenFolderId === null ? { kind: "root" } : { kind: "folder", folderId: chosenFolderId } : scope;
  const kind = scope.kind === "all" ? "general" : "folder";
  const folderId = localScope.kind === "folder" ? localScope.folderId : null;
  const id = existingConnectionId ?? connectionContext(kind, folderId);
  const initialId = existingConnectionId ?? connectionContext(kind, canChooseFolder ? null : scope.kind === "folder" ? scope.folderId : null);
  const context = folderScopeLabel(localScope, folders);
  const folderExists = folderId === null || folders.some(folder => folder.id === folderId);
  const connectionExists = !editing || !!snapshot?.connections?.some(connection => connection.id === existingConnectionId);
  const selected = catalog?.resources.find(resource => resource.id === chosen);
  const results = catalog ? resourceResults(catalog, query) : [];
  const receiver = snapshot?.connections?.find(connection => connection.channelId === chosen && connection.id !== id && connectionReceives(connection));
  const receiverLabel = receiver?.kind === "general" ? "All history (Root)" : receiver?.folderId === null ? "/" : folders.find(folder => folder.id === receiver?.folderId)?.path ?? "another folder";
  const canSend = selected?.permission !== "read";
  const ready = folderExists && connectionExists && !!selected && selected.keyState === "ready" && (direction === "receive" || canSend) && (!receiver || direction === "send" || moveReception);
  const selectResource = (resource: SharedCatalog["resources"][number], nextDirection = direction) => {
    setChosen(resource.id); setMoveReception(false); setError(null);
    setDirection(resource.permission === "read" ? "receive" : nextDirection);
  };
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
    return () => { initialFocus.current?.isConnected && initialFocus.current.focus(); };
  }, []);
  useEffect(() => {
    let active = true;
    void sharedClipboardApi.status().then(async status => {
      if (!active) return;
      setSnapshot(status);
      if ((!status.configured || ["waiting", "pending", "revoked", "expired", "cancelled"].includes(status.identityState ?? ""))) { setNeedsSignIn(true); return; }
      const next = await api.catalog();
      if (!active) return;
      setCatalog(next); setSnapshot(status);
      const current = status.connections?.find(connection => connection.id === initialId);
      if (current) {
        const resource = next.resources.find(resource => resource.id === current.channelId);
        if (resource) selectResource(resource, current.direction);
        else { setChosen(current.channelId); setDirection(current.direction); setError("This clipboard was removed or your access was revoked. Choose a clipboard to continue."); }
      }
    }).catch(failure => { if (active) setError(String(failure)); });
    return () => { active = false; };
  }, [api, initialId]);
  useEffect(() => {
    if (catalog && !needsSignIn && !focusedSearch.current && search.current) {
      search.current.focus(); focusedSearch.current = true;
    }
  }, [catalog, needsSignIn]);
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
    if (busy || needsSignIn || !folderExists || !connectionExists || (!creating && !ready) || (creating && !name.trim())) return;
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
      if (event.key === "Escape" && !busy) {
        // The select handles its own popup first; Escape must not discard this dialog too.
        if (event.target instanceof Element && event.target.closest('[data-mantine-stop-propagation], [aria-haspopup="listbox"][aria-expanded="true"]')) return;
        event.preventDefault(); onClose();
      }
      if (event.key === "Tab") {
        const controls = Array.from(modal.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),[tabindex="0"]') ?? []).filter(el => el.getClientRects().length);
        const first = controls[0], last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }}>
      <header><h2 id="shared-connect-title">{editing ? "Edit connection" : "Connect shared clipboard"}</h2><span>{context}{kind === "general" ? " · General connection" : " · Exact folder"}</span></header>
      {catalog?.mode === "synthetic" && <p className="shared-inline-notice">Local synthetic service. Human account linking is not configured.</p>}
      {error && <p className="shared-error" role="alert">{error}</p>}
      {needsSignIn && <div className="shared-settings-group"><p>Link this PC in Settings → Sharing, then return to connect {context}. Your connection choices stay here. Linking does not send existing content.</p><UiButton type="button" variant="default" onClick={() => void invoke("open_settings_window").then(() => emitTo("settings", "copicu://settings/focus-section", "sharing")).catch(failure => setError(String(failure)))}>Open Sharing settings</UiButton></div>}
      {!catalog && !error && !needsSignIn && <p role="status">Loading available clipboards…</p>}
      {catalog && !needsSignIn && <>
        {canChooseFolder && <FolderSelect label="Local folder" folders={folders} allowCreate={false} zIndex={85} value={{ kind: "existing", folderId }} disabled={busy} onChange={choice => {
          if (choice.kind !== "existing") return;
          setChosenFolderId(choice.folderId); setMoveReception(false); setError(null);
          const current = snapshot?.connections?.find(connection => connection.id === connectionContext("folder", choice.folderId));
          if (current) {
            const resource = catalog.resources.find(resource => resource.id === current.channelId);
            if (resource) selectResource(resource, current.direction);
            else { setChosen(current.channelId); setDirection(current.direction); }
          }
        }} />}
        {!folderExists && <p className="shared-error" role="alert">This local folder is no longer available. {canChooseFolder ? "Choose another folder to continue." : "Close this editor and choose an existing folder."}</p>}
        {!connectionExists && <p className="shared-error" role="alert">This connection was disconnected. Close this editor and create a new connection.</p>}
        {!creating ? <>
          <UiTextInput ref={search} label="Find shared clipboard" placeholder="Name or owner" value={query} disabled={busy} onChange={event => setQuery(event.currentTarget.value)} onKeyDown={event => { if (event.key === "ArrowDown" && results[0]) { event.preventDefault(); selectResource(results[0]); document.getElementById(`shared-resource-${results[0].id}`)?.focus(); } else if (event.key === "Enter") event.preventDefault(); }} />
          <div className="shared-resource-options" role="listbox" aria-label="Available shared clipboards" onKeyDown={event => {
            if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
            event.preventDefault();
            const index = results.findIndex(resource => resource.id === chosen);
            const next = (index + (event.key === "ArrowDown" ? 1 : results.length - 1)) % results.length;
            if (results[next]) { selectResource(results[next]); document.getElementById(`shared-resource-${results[next].id}`)?.focus(); }
          }}>
            {results.map((resource, index) => <button key={resource.id} id={`shared-resource-${resource.id}`} type="button" role="option" aria-selected={resource.id === chosen} tabIndex={resource.id === chosen || (!chosen && index === 0) ? 0 : -1} disabled={busy} onClick={() => selectResource(resource)}><strong>{resource.name}</strong><span>{resource.permission === "owner" ? "Mine" : `Shared by ${resource.ownerName}`} · {resource.permission === "read" ? "Read only" : "Can send and receive"}{resource.keyState !== "ready" ? " · Awaiting keys" : ""}</span></button>)}
            {!results.length && <p>No available clipboard matches. Create one in your space.</p>}
          </div>
          <UiButton type="button" variant="subtle" disabled={busy} onClick={() => { setCreating(true); setName(query); }}>Create shared clipboard…</UiButton>
        </> : <div className="shared-settings-group">
          <UiTextInput label="New clipboard name" autoFocus value={name} disabled={busy || !!createdId || !!operation.current} onChange={event => setName(event.currentTarget.value)} />
          <p>Private to your own devices. Inviting another person is a separate action.</p>
          {!createdId && !operation.current && <UiButton type="button" variant="subtle" disabled={busy} onClick={() => setCreating(false)}>Choose existing clipboard</UiButton>}
        </div>}
        <UiSelect label="Direction" value={direction} disabled={busy} data={[{ value: "send", label: "Send", disabled: !creating && !canSend }, { value: "receive", label: "Receive" }, { value: "both", label: "Send and receive", disabled: !creating && !canSend }]} onChange={value => { if (value) setDirection(value as SharedConnection["direction"]); }} />
        {receiver && direction !== "send" && <div className="shared-settings-group">
          {!moveReception && <p className="shared-inline-notice" role="status" id="shared-connect-reception-notice">{selected?.name} is already connected to {receiverLabel} for reception on this PC. Confirm the move below to connect {context}.</p>}
          <UiCheckbox label={`Move automatic reception from ${receiverLabel} to ${context}`} checked={moveReception} disabled={busy} onChange={event => setMoveReception(event.currentTarget.checked)} />
        </div>}
        <p>{direction !== "receive" ? `Send new local text and images${kind === "general" ? snapshot?.generalSendScope === "all" ? " from all Copicu folders" : " without a folder" : ` entering ${context}, excluding subfolders`}. ` : ""}{direction !== "send" ? `Save received text and images in ${kind === "general" ? "Root" : context}. Same-folder duplicates appear again in recent activity; copies in other folders stay independent.` : ""}</p>
        <p>Connecting does not send or import previous content. Windows clipboard updates and scripts are separate options in Sharing settings.</p>
        {selected && selected.keyState !== "ready" && <p role="status">{selected.keyMessage ?? `${selected.name}'s encryption keys are not available on this PC yet. It can connect once those keys are available.`}</p>}
        {createdId && <p role="status">Created; connection still needs to be completed. Retry keeps the same resource.</p>}
      </>}
      <footer><UiButton type="button" variant="default" disabled={busy} onClick={onClose}>Cancel</UiButton><UiButton type="button" loading={busy} aria-describedby={receiver && direction !== "send" && !moveReception ? "shared-connect-reception-notice" : undefined} disabled={needsSignIn || !catalog || busy || !folderExists || !connectionExists || (creating ? !name.trim() : !ready)} onClick={() => void confirm()}>{createdId ? "Retry connection" : creating ? "Create and connect" : editing ? "Save connection" : "Connect clipboard"}</UiButton></footer>
    </div>
  </div>, document.body);
}
