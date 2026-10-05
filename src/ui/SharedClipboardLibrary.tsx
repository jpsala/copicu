import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { sharedClipboardApi, type SharedClipboardSnapshot } from "../shared/sharedClipboard";
import { resourceResults, sharedProductApi, type SharedCatalog, type SharedHistoryPage, type SharedOperation, type SharedProductApi } from "../shared/sharedProduct";
import { UiButton, UiCheckbox, UiSelect, UiTextInput, UiTextarea } from "./controls";
import { FolderSelect } from "./FolderSelect";
import type { FolderSummary } from "../shared/contracts";
import { invoke } from "@tauri-apps/api/core";
import "./sharedClipboard.css";
import { sharedControlMessage, useSharedCatalogInvalidation } from "../shared/useSharedCatalogInvalidation";

export function SharedClipboardLibrary({ onClose, onConnect, api = sharedProductApi }: { onClose: () => void; onConnect: () => void; api?: SharedProductApi }) {
  const [catalog, setCatalog] = useState<SharedCatalog | null>(null);
  const [snapshot, setSnapshot] = useState<SharedClipboardSnapshot | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState<SharedHistoryPage | null>(null);
  const [text, setText] = useState("");
  const [name, setName] = useState("");
  const [create, setCreate] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [folders, setFolders] = useState<FolderSummary[]>([]);
  const [saveFolder, setSaveFolder] = useState<number | null>(null);
  const [invitePerson, setInvitePerson] = useState<string | null>(null);
  const [invitePermission, setInvitePermission] = useState("read");
  const [includeHistory, setIncludeHistory] = useState(false);
  const [approveAccess, setApproveAccess] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const intent = useRef<SharedOperation | null>(null);
  const generation = useRef(0);
  const panel = useRef<HTMLDivElement>(null);
  const focus = useRef<HTMLElement | null>(null);
  const draftRevision = useRef<string | null>(null);
  const mounted = useRef(true);
  const refresh = async () => {
    const [next, status] = await Promise.all([api.catalog(), sharedClipboardApi.status()]);
    if (!mounted.current) return;
    setCatalog(next); setSnapshot(status);
    setSelected(previous => previous ?? next.resources[0]?.id ?? null);
  };
  const controlState = useSharedCatalogInvalidation(refresh, busy);
  useEffect(() => {
    mounted.current = true;
    focus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    let active = true;
    void Promise.all([api.catalog(), sharedClipboardApi.status()]).then(([next, status]) => { if (active) { setCatalog(next); setSnapshot(status); setSelected(next.resources[0]?.id ?? null); } }).catch(failure => { if (active) setError(String(failure)); });
    panel.current?.querySelector<HTMLInputElement>("input")?.focus();
    void invoke<FolderSummary[]>("list_folders").then(next => { if (active) setFolders(next); }).catch(() => {});
    return () => { active = false; mounted.current = false; generation.current++; if (focus.current?.isConnected) focus.current.focus(); };
  }, [api]);
  useEffect(() => {
    generation.current++; draftRevision.current = null; setPage(null); setConfirmed(false); setText(""); setName(""); setNotice(null);
  }, [selected]);
  const resource = catalog?.resources.find(candidate => candidate.id === selected);
  const policy = snapshot?.channels.find(channel => channel.id === selected);
  const connections = snapshot?.connections?.filter(connection => connection.channelId === selected) ?? [];
  const pausedSend = snapshot?.sendPaused || policy?.sendPaused;
  const pausedReceive = snapshot?.receivePaused || policy?.receivePaused;
  const run = async (work: () => Promise<void>) => {
    if (busy) return;
    setBusy(true); setError(null); setNotice(null);
    try { await work(); }
    catch (failure) { setError(String(failure)); if (String(failure).includes("changed; refresh")) { intent.current = null; await refresh().catch(() => {}); } }
    finally { setBusy(false); }
  };
  const mutate = async (kind: string) => {
    const desired: Omit<SharedOperation, "operationId"> = create ? { kind: "create", name: name.trim() } : { kind, resourceId: resource!.id, expectedRevision: kind === "rename" ? draftRevision.current ?? resource!.revision : resource!.revision, ...(kind === "rename" ? { name: name.trim() } : {}) };
    // An ambiguous result keeps the same immutable intent until resolved.
    if (!intent.current) intent.current = { operationId: crypto.randomUUID().replaceAll("-", ""), ...desired };
    await api.operation(intent.current);
    intent.current = null; draftRevision.current = null; setCreate(false); setName(""); setConfirmed(false);
    await refresh(); setNotice(kind === "delete" ? "Shared clipboard deleted. Local copies remain." : kind === "leave" ? "You left this clipboard. Local copies remain." : "Clipboard saved.");
  };
  const accessOperation = async (input: Omit<SharedOperation, "operationId">) => {
    if (intent.current) throw new Error("Resolve the pending operation before changing access.");
    intent.current = { operationId: crypto.randomUUID().replaceAll("-", ""), ...input };
    await api.operation(intent.current); intent.current = null; setApproveAccess(false);
    await refresh(); setNotice("Access operation confirmed by the service.");
  };
  const history = async (before: string | null = null) => {
    if (!resource) return;
    const request = generation.current;
    const next = await api.history(resource.id, before);
    if (request === generation.current) setPage(previous => before && previous ? { ...next, entries: [...previous.entries, ...next.entries] } : next);
  };
  return createPortal(<div className="shared-connect-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <div ref={panel} className="shared-library-panel" role="dialog" aria-modal="true" aria-labelledby="shared-library-title" onKeyDown={event => {
      event.stopPropagation();
      if (event.key === "Escape" && !busy) { event.preventDefault(); onClose(); }
      if (event.key === "Tab") {
        const items = Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),[tabindex="0"]') ?? []).filter(el => el.getClientRects().length);
        if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items.at(-1)?.focus(); }
        else if (!event.shiftKey && document.activeElement === items.at(-1)) { event.preventDefault(); items[0]?.focus(); }
      }
    }}>
      <header className="shared-library-heading"><h2 id="shared-library-title">Shared clipboards</h2><UiButton type="button" variant="subtle" disabled={busy} onClick={onClose}>Close</UiButton></header>
      {error && <p className="shared-error" role="alert">{error}</p>}
      {notice && <p role="status" className="shared-inline-notice">{notice}</p>}
      {intent.current && !busy && <div className="shared-settings-actions"><p>The {intent.current.kind} operation needs a confirmed result.</p><UiButton type="button" onClick={() => void run(async () => { await api.operation(intent.current!); intent.current = null; await refresh(); setNotice("Pending operation confirmed."); })}>Retry pending operation</UiButton></div>}
      {catalog?.mode === "synthetic" && <p className="shared-inline-notice">Synthetic local account: {catalog.person.name}. External account linking remains pending.</p>}
      {catalog?.pendingOperations?.map(operation => <div key={operation.operationId} className="shared-settings-actions"><p>Saved {operation.kind} operation awaiting confirmation.</p><UiButton type="button" disabled={busy || !operation.recoverable} onClick={() => void run(async () => { await api.operation({operationId:operation.operationId,kind:"recover"}); await refresh(); setNotice("Saved operation recovered."); })}>Recover saved operation</UiButton></div>)}
      <div className="shared-library-workspace"><nav aria-label="Shared clipboards">
        <UiTextInput label="Find clipboard" placeholder="Name or owner" value={query} onChange={event => setQuery(event.currentTarget.value)} />
        {catalog ? resourceResults(catalog, query).map(item => <button type="button" key={item.id} className="shared-feed-row" aria-current={selected === item.id ? "true" : undefined} disabled={busy || !!intent.current} onClick={() => { setSelected(item.id); setCreate(false); }}><strong>{item.name}</strong><small>{item.permission === "owner" ? "Mine" : `Shared by ${item.ownerName}`} · {item.permission}</small></button>) : <p>{error ? "Link an authorized account to load its clipboards." : "Loading clipboards…"}</p>}
        {catalog && !catalog.resources.length && <p>Your space has no shared clipboards yet.</p>}
        {catalog?.invitations?.map(invitation => <div className="shared-settings-group" key={invitation.id}><p>Invitation from {invitation.ownerName}: {invitation.permission}, {invitation.includeHistory ? "available history included" : "future publications only"}.</p>{invitation.state === "open" ? <UiButton type="button" variant="default" disabled={busy || !!intent.current} onClick={() => void run(() => accessOperation({ kind: "accept", invitationId: invitation.id }))}>Accept invitation</UiButton> : <p role="status">Accepted; waiting for the owner's approval and encrypted keys.</p>}</div>)}
        <UiButton type="button" variant="subtle" disabled={busy || !catalog || !!intent.current} onClick={() => { setCreate(true); setName(""); }}>Create clipboard…</UiButton>
        <UiButton type="button" variant="subtle" disabled={busy} onClick={onConnect}>Connect to All history…</UiButton>
      </nav><section className="shared-library-detail" aria-label="Clipboard detail">
        {create ? <div className="shared-settings-group"><h3>Create in your space</h3><UiTextInput label="Clipboard name" value={name} disabled={busy || !!intent.current} onChange={event => setName(event.currentTarget.value)} /><p>Private to your own devices. Creating does not connect a folder or enable effects.</p><div className="shared-settings-actions"><UiButton type="button" disabled={busy || !name.trim()} onClick={() => void run(() => mutate("create"))}>{intent.current ? "Retry creation" : "Create clipboard"}</UiButton><UiButton type="button" variant="default" disabled={busy || !!intent.current} onClick={() => setCreate(false)}>Cancel</UiButton></div></div> : resource ? <>
          <h3>{resource.name}</h3><p>Owner: {resource.ownerName} · {resource.permission} · Retention: {resource.retentionHours} hours</p>
          {resource.keyState !== "ready" ? <p role="status">{resource.keyMessage ?? "Awaiting content keys on this device."}</p> : <>
            <div className="shared-settings-actions"><UiButton type="button" variant="default" disabled={busy} onClick={() => void run(() => history())}>View available history</UiButton></div>
            <p>Reading history does not save local clips, update Windows or run Actions.</p>
            {page && <><FolderSelect label="Save history to" folders={folders} allowCreate={false} value={{ kind: "existing", folderId: saveFolder }} onChange={choice => { if (choice.kind === "existing") setSaveFolder(choice.folderId); }} /><ol className="shared-history-list" aria-label="Available history">{page.entries.map(entry => <li key={entry.publicationId}><small>{entry.originDeviceId} · #{entry.sequence} · {entry.status}</small>{entry.text === undefined && !entry.image ? <p>Content unavailable. Update Copicu if this publication uses a newer format.</p> : <>{entry.image ? <figure className="shared-image-preview"><img src={entry.image} alt="Shared clipboard image" /><figcaption>{entry.width} × {entry.height}</figcaption></figure> : <pre tabIndex={0}>{entry.text}</pre>}<div className="shared-settings-actions"><UiButton type="button" size="compact-xs" variant="default" disabled={busy} onClick={() => void run(async () => { await api.copyHistory(resource.id, entry.publicationId); setNotice(`Shared ${entry.image ? "image" : "text"} copied to Windows.`); })}>{entry.image ? "Copy image" : "Copy text"}</UiButton><UiButton type="button" size="compact-xs" variant="default" disabled={busy} onClick={() => void run(async () => { const result = await api.saveHistory(resource.id,entry.publicationId,saveFolder); setNotice(result.alreadyExists ? "Already in this folder. Received again; existing metadata was kept." : "Publication saved in the chosen folder."); })}>Save in folder</UiButton></div></>}</li>)}</ol>{page.before && <UiButton type="button" variant="default" disabled={busy} onClick={() => void run(() => history(page.before))}>Load next publications</UiButton>}{!page.entries.length && <p>No retained publications in your authorized range.</p>}</>}
            {resource.permission !== "read" && <div className="shared-settings-group"><UiButton type="button" variant="default" disabled={busy || !!pausedSend} onClick={() => void run(async () => { const result = await api.publishCurrent(resource.id); setNotice(`Queued publication ${result.publicationId}. Remote acceptance is pending.`); await refresh(); })}>Send Windows clipboard</UiButton><p>Send the current text or image from this PC.</p><UiTextarea label="Send new text" value={text} disabled={busy || !!pausedSend} onChange={event => setText(event.currentTarget.value)} /><UiButton type="button" disabled={busy || !text || !!pausedSend} onClick={() => void run(async () => { const result = await api.publish(resource.id, text); setText(""); setNotice(`Queued publication ${result.publicationId}. Remote acceptance is pending.`); await refresh(); })}>Send text</UiButton></div>}
          </>}
          {policy && <div className="shared-settings-group"><h3>Flow on this device</h3><div className="shared-settings-actions"><UiButton type="button" variant="default" disabled={busy || !!snapshot?.sendPaused} onClick={() => void run(async () => { setSnapshot(await api.pause(resource.id, !policy.sendPaused, null)); })}>{policy.sendPaused ? "Resume send" : "Pause send"}</UiButton><UiButton type="button" variant="default" disabled={busy || !!snapshot?.receivePaused} onClick={() => void run(async () => { setSnapshot(await api.pause(resource.id, null, !policy.receivePaused)); })}>{policy.receivePaused ? "Resume reception" : "Pause reception"}</UiButton></div><p>{pausedSend ? "Sending paused. " : "Sending available. "}{pausedReceive ? "Reception paused. " : "Reception available. "}{snapshot?.sendPaused || snapshot?.receivePaused ? "A device pause takes priority." : "Resuming reception starts from now."}</p></div>}
          {connections.length > 0 && <div className="shared-settings-group"><h3>Connections on this device</h3>{connections.map(connection => <div className="shared-connection-row" key={connection.id}><span>{connection.kind === "general" ? "All history" : connection.folderId === null ? "Root" : `Folder #${connection.folderId}`} · {connection.direction}</span><UiButton type="button" variant="subtle" disabled={busy} onClick={() => void run(async () => { setSnapshot(await api.disconnect(connection.id)); })}>Disconnect</UiButton></div>)}</div>}
          <details className="shared-admin"><summary>Manage access and clipboard</summary>
            {resource.participants?.map(person => <div className="shared-connection-row" key={person.id}><span>{person.name} · {person.revoked ? "revoked" : person.permission}</span>{resource.permission === "owner" && person.id !== resource.ownerId && !person.revoked && <UiButton type="button" variant="subtle" disabled={busy || !approveAccess || !!intent.current} onClick={() => void run(() => accessOperation({kind:"revoke",resourceId:resource.id,expectedRevision:resource.revision,personId:person.id}))}>Revoke access</UiButton>}</div>)}
            {resource.permission === "owner" && <div className="shared-settings-group">
              <UiSelect label="Invite person" value={invitePerson} disabled={busy || !!intent.current} data={(catalog?.people ?? []).filter(person => person.id !== resource.ownerId).map(person => ({value:person.id,label:person.name}))} onChange={setInvitePerson} placeholder="Choose an authenticated person" />
              <UiSelect label="Invitation permission" value={invitePermission} disabled={busy} data={[{value:"read",label:"Read only"},{value:"write",label:"Send and read"}]} onChange={value => {if(value)setInvitePermission(value);}} />
              <UiCheckbox label="Include available retained history" checked={includeHistory} disabled={busy} onChange={event => setIncludeHistory(event.currentTarget.checked)} />
              <UiButton type="button" variant="default" disabled={busy || !invitePerson || !!intent.current} onClick={() => void run(() => accessOperation({kind:"invite",resourceId:resource.id,expectedRevision:resource.revision,personId:invitePerson!,permission:invitePermission,includeHistory}))}>Create invitation</UiButton>
              <details className="shared-device-review"><summary>Review linked devices</summary>{catalog?.deviceReviews?.filter(device => device.personId === invitePerson || resource.participants?.some(person=>person.id===device.personId) || resource.invites?.some(invite=>invite.personId===device.personId)).map(device=><div key={device.deviceId}><span>{catalog.people?.find(person=>person.id===device.personId)?.name ?? device.personId} · {device.deviceId} · {device.state}</span><code>{device.fingerprint}</code></div>)}</details>
              <UiCheckbox label="I reviewed the person, linked devices and effect on automatic senders" checked={approveAccess} disabled={busy} onChange={event => setApproveAccess(event.currentTarget.checked)} />
              {resource.invites?.filter(invite => invite.state === "accepted").map(invite => <div key={invite.id} className="shared-connection-row"><span>{catalog?.people?.find(person => person.id === invite.personId)?.name ?? invite.personId} · {invite.permission} · {invite.includeHistory ? "Available history" : "Future only"}</span><UiButton type="button" variant="default" disabled={busy || !approveAccess || !!intent.current} onClick={() => void run(() => accessOperation({kind:"approve",resourceId:resource.id,expectedRevision:resource.revision,invitationId:invite.id}))}>Approve encrypted access</UiButton></div>)}
              {resource.keyState === "pending" && <UiButton type="button" variant="default" disabled={busy || !approveAccess || !!intent.current} onClick={() => void run(() => accessOperation({kind:"rotate",resourceId:resource.id,expectedRevision:resource.revision}))}>Rotate keys for remaining participants</UiButton>}
            </div>}
            <p>Access changes use encrypted key packages. Adding a person pauses automatic senders for review; linking another PC to the same account preserves the audience.</p>
            {resource.permission === "owner" && <div className="shared-settings-group"><UiTextInput label="New name" value={name} disabled={busy || !!intent.current} onChange={event => { if (!draftRevision.current) draftRevision.current = resource.revision; setName(event.currentTarget.value); }} />{draftRevision.current && draftRevision.current !== resource.revision && <><p role="status">This clipboard changed remotely. Your draft is preserved; review the current name before saving.</p><UiButton type="button" variant="default" disabled={busy || !!intent.current} onClick={() => { draftRevision.current = resource.revision; setError(null); setNotice("Current name reviewed. Your draft is ready to save."); }}>Keep draft after reviewing current name</UiButton></>}<UiButton type="button" variant="default" disabled={busy || !name.trim()} onClick={() => void run(() => mutate("rename"))}>Rename clipboard</UiButton></div>}
            <UiCheckbox label={resource.permission === "owner" ? `Delete ${resource.name}, its remote content and participants' access. Local copies remain.` : `Leave ${resource.name} on all your devices. Local copies remain.`} checked={confirmed} disabled={busy} onChange={event => setConfirmed(event.currentTarget.checked)} />
            <UiButton type="button" color="red" disabled={busy || !confirmed || !!intent.current} onClick={() => void run(() => mutate(resource.permission === "owner" ? "delete" : "leave"))}>{resource.permission === "owner" ? "Delete shared clipboard" : "Leave clipboard"}</UiButton>
          </details>
        </> : <p role="status">{selected ? "This clipboard was removed or your access was revoked. Local copies remain." : "Select or create a clipboard to inspect it."}</p>}
      </section></div>
      {sharedControlMessage(controlState ?? snapshot?.controlSyncState) && <p role="status">{sharedControlMessage(controlState ?? snapshot?.controlSyncState)}</p>}
    </div>
  </div>, document.body);
}
