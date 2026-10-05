import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { MultiSelect } from "@mantine/core";
import type { ActionDefinition, FolderScope, FolderSummary } from "../shared/contracts";
import { sharedChannelHasClipboardWriter, sharedChannelValidation, sharedClipboardApi, sharedForwardTargetEligible, sharedPublicationState, sharedReceiptCanCopy, sharedReceiptStatus, sharedReceptionActionEligible, type SharedChannelPolicy, type SharedClipboardApi, type SharedClipboardSnapshot, type SharedEnrollmentPreview } from "../shared/sharedClipboard";
import { UiButton, UiCheckbox, UiSelect, UiTextInput } from "./controls";
import "./sharedClipboard.css";
import { sharedProductApi, type SharedConnection } from "../shared/sharedProduct";
import { SharedClipboardLibrary } from "./SharedClipboardLibrary";
import { SharedClipboardConnect } from "./SharedClipboardConnect";
import { sharedControlMessage, useSharedCatalogInvalidation } from "../shared/useSharedCatalogInvalidation";
import { SharedIdentitySettings } from "./SharedIdentitySettings";
import type { SharedIdentityStatus } from "../shared/sharedIdentity";
import { folderFullPath } from "./folderModel";

export type SharedClipboardSettingsProps = {
  api?: SharedClipboardApi;
  folders?: FolderSummary[];
  actions?: ActionDefinition[];
  chooseEnrollmentFile?: () => Promise<string | null>;
  onViewReceptions?: () => void;
};
const chooseEnrollmentFile = async () => {
  const path = await open({ multiple: false, directory: false, title: "Choose device enrollment", filters: [{ name: "Enrollment bundle", extensions: ["json"] }] });
  return typeof path === "string" ? path : null;
};

type ClipboardBehavior = Pick<SharedChannelPolicy, "defaultSendChannel" | "updateClipboard" | "receiveActionEnabled" | "receiveActionWritesClipboard" | "receiveActionId" | "receiveActionForwardChannelIds">;
const clipboardBehavior = (policy: SharedChannelPolicy): ClipboardBehavior => ({
  defaultSendChannel: policy.defaultSendChannel ?? false,
  updateClipboard: policy.updateClipboard,
  receiveActionEnabled: policy.receiveActionEnabled ?? false,
  receiveActionWritesClipboard: policy.receiveActionWritesClipboard ?? false,
  receiveActionId: policy.receiveActionId ?? null,
  receiveActionForwardChannelIds: policy.receiveActionForwardChannelIds ?? [],
});

function ChannelSettings({ policy, channels, folders, actions, busy, unavailable, onSave }: {
  policy: SharedChannelPolicy; channels: SharedChannelPolicy[]; folders: FolderSummary[]; busy: boolean;
  actions: ActionDefinition[];
  unavailable: boolean;
  onSave: (behavior: Partial<ClipboardBehavior>) => Promise<void>;
}) {
  const [draft, setDraft] = useState(() => clipboardBehavior(policy));
  const lastSaved = useRef(clipboardBehavior(policy));
  const dirty = JSON.stringify(draft) !== JSON.stringify(clipboardBehavior(policy));
  const eligibleActions = actions.filter(action => sharedReceptionActionEligible(action, policy.id));
  const selectedAction = eligibleActions.find(action => action.id === draft.receiveActionId);
  const otherWriter = channels.some(channel => channel.id !== policy.id && sharedChannelHasClipboardWriter(channel));
  const error = sharedChannelValidation({ ...policy, ...draft }, channels, folders.map(folder => folder.id))
    ?? (draft.receiveActionEnabled && !selectedAction ? "The reception action is no longer available or authorized for this channel." : null)
    ?? (draft.receiveActionWritesClipboard && !selectedAction?.capabilities.includes("clipboard:write") ? "The reception action needs explicit clipboard write access." : null)
    ?? (draft.receiveActionEnabled && selectedAction && (draft.receiveActionForwardChannelIds ?? []).some(id => !channels.some(target => target.id === id && sharedForwardTargetEligible(selectedAction, policy.id, target))) ? "A forwarding channel is no longer authorized. Review the allowed channels." : null);
  const change = (value: Partial<ClipboardBehavior>) => setDraft(previous => ({ ...previous, ...value }));
  // Rebase only untouched fields; remote connection changes never enter this draft.
  useEffect(() => {
    const next = clipboardBehavior(policy), previous = lastSaved.current;
    setDraft(current => {
      const actionChanged = current.receiveActionId !== previous.receiveActionId;
      const actionDisabled = !current.receiveActionEnabled && previous.receiveActionEnabled;
      return Object.fromEntries(Object.keys(next).map(key => {
        const field = key as keyof ClipboardBehavior;
        const resetWithAction = (actionChanged && (field === "receiveActionForwardChannelIds" || field === "receiveActionWritesClipboard")) || (actionDisabled && field === "receiveActionWritesClipboard");
        return [field, !resetWithAction && JSON.stringify(current[field]) === JSON.stringify(previous[field]) ? next[field] : current[field]];
      })) as ClipboardBehavior;
    });
    lastSaved.current = next;
  }, [policy]);
  const save = () => {
    if (error || !dirty || busy) return;
    const saved = clipboardBehavior(policy);
    const changes = Object.fromEntries(Object.keys(draft).filter(key => JSON.stringify(draft[key as keyof ClipboardBehavior]) !== JSON.stringify(saved[key as keyof ClipboardBehavior])).map(key => [key, draft[key as keyof ClipboardBehavior]])) as Partial<ClipboardBehavior>;
    if (changes.receiveActionId !== undefined) { changes.receiveActionForwardChannelIds = draft.receiveActionForwardChannelIds; changes.receiveActionWritesClipboard = draft.receiveActionWritesClipboard; }
    if (changes.receiveActionEnabled === false) changes.receiveActionWritesClipboard = false;
    void onSave(changes);
  };
  return <section className="shared-channel-settings" aria-label="Clipboard behavior" onKeyDown={event => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); event.stopPropagation(); save(); }
    else if (event.key === "Enter" && event.target instanceof HTMLInputElement) { event.preventDefault(); event.stopPropagation(); }
  }}>
    <div className="shared-settings-group">
      <h3>Windows clipboard</h3>
      <UiCheckbox label="Automatically copy new arrivals to Windows" checked={draft.updateClipboard} disabled={busy || (!draft.updateClipboard && (otherWriter || (draft.receiveActionEnabled && draft.receiveActionWritesClipboard)))} onChange={event => change({ updateClipboard: event.currentTarget.checked })} />
      <p>Makes newly received text and images ready for Ctrl+V. Saving them in a Copicu folder is separate. Nothing is pasted automatically; older content is available for manual copy.</p>
      {otherWriter && <p className="shared-inline-notice">Another shared clipboard updates Windows. Turn off its output before enabling this one.</p>}
      {!policy.receiveEnabled && (draft.updateClipboard || draft.receiveActionEnabled) && <p className="shared-inline-notice">Connect this clipboard for reception to use these options.</p>}
      {policy.canPublish && <>
        <UiCheckbox label="Use this clipboard for Send shortcuts" checked={draft.defaultSendChannel} disabled={busy} onChange={event => change({ defaultSendChannel: event.currentTarget.checked })} />
        <p>The two Send shortcuts below will send to {policy.name}.</p>
      </>}
    </div>
    <details className="shared-settings-disclosure">
      <summary>Run a script when content arrives<span>{draft.receiveActionEnabled ? "Enabled" : "Off"}</span></summary>
      <div className="shared-settings-group">
      <UiCheckbox label="Run a local action on live arrivals" checked={draft.receiveActionEnabled} disabled={busy || (!eligibleActions.length && !draft.receiveActionEnabled)} onChange={event => change({ receiveActionEnabled: event.currentTarget.checked, ...(!event.currentTarget.checked ? { receiveActionWritesClipboard: false } : {}) })} />
      {!eligibleActions.length && <p>No authorized reception scripts are available for this clipboard. Configure a script with reception access in Actions first.</p>}
      {draft.receiveActionEnabled && <>
        <UiSelect label="Reception action" placeholder="Choose an authorized script" value={draft.receiveActionId} disabled={busy} data={eligibleActions.map(action => ({ value: action.id, label: action.title }))} onChange={receiveActionId => change({ receiveActionId, receiveActionForwardChannelIds: [], receiveActionWritesClipboard: false })} />
        <p>The action reads text receptions; images are saved and copied without running this action. It cannot paste or focus another app. Recovered publications do not run actions automatically.</p>
        {selectedAction?.capabilities.includes("clipboard:write") && <>
          <UiCheckbox label="Allow reception action to update Windows clipboard" checked={draft.receiveActionWritesClipboard ?? false} disabled={busy || (!draft.receiveActionWritesClipboard && (draft.updateClipboard || otherWriter))} onChange={event => change({ receiveActionWritesClipboard: event.currentTarget.checked })} />
          <p>The action may transform or generate text and write it once per live reception. Turn off the original-content output before enabling this output.</p>
        </>}
        {otherWriter && <p className="shared-inline-notice">Another channel owns Windows clipboard updates. Turn off its output before choosing one here.</p>}
        {selectedAction && <MultiSelect label="Allow this action to forward to channels" placeholder="No forwarding allowed" value={draft.receiveActionForwardChannelIds ?? []} disabled={busy} comboboxProps={{ withinPortal: true }} data={channels.filter(target => sharedForwardTargetEligible(selectedAction, policy.id, target)).map(target => ({ value: target.id, label: target.name }))} onChange={receiveActionForwardChannelIds => change({ receiveActionForwardChannelIds })} />}
      </>}
      </div>
    </details>
    {error && <p className="shared-error" role="alert">{error}</p>}
    <div className="shared-settings-actions">
      <UiButton type="button" size="compact-sm" disabled={!dirty || !!error || busy} loading={busy && !unavailable} onClick={save}>Save clipboard behavior</UiButton>
      {dirty && <UiButton type="button" variant="subtle" size="compact-sm" disabled={busy} onClick={() => setDraft(clipboardBehavior(policy))}>Undo changes</UiButton>}
      {dirty && <span className="shared-draft-note">Not saved</span>}
    </div>
  </section>;
}

function SendShortcutSettings({ snapshot, busy, onSave }: { snapshot: SharedClipboardSnapshot; busy: boolean; onSave: (active: string | null, clipboard: string | null) => Promise<void> }) {
  const [active, setActive] = useState(snapshot.sendActiveShortcut ?? "");
  const [clipboard, setClipboard] = useState(snapshot.sendClipboardShortcut ?? "");
  const dirty = active.trim() !== (snapshot.sendActiveShortcut ?? "") || clipboard.trim() !== (snapshot.sendClipboardShortcut ?? "");
  useEffect(() => { if (!dirty) { setActive(snapshot.sendActiveShortcut ?? ""); setClipboard(snapshot.sendClipboardShortcut ?? ""); } }, [snapshot.sendActiveShortcut, snapshot.sendClipboardShortcut]);
  const save = () => { if (dirty && !busy) void onSave(active.trim() || null, clipboard.trim() || null); };
  return <section className="shared-settings-group" aria-label="Send shortcuts" onKeyDown={event => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); event.stopPropagation(); save(); }
    else if (event.key === "Enter" && event.target instanceof HTMLInputElement) { event.preventDefault(); event.stopPropagation(); }
  }}>
    <h3>Send shortcuts</h3>
    <div className="shared-shortcut-fields">
      <UiTextInput label="Send active Copicu clip" description="Uses the active clip in the picker." placeholder="Not assigned" value={active} disabled={busy} onChange={event => setActive(event.currentTarget.value)} />
      <UiTextInput label="Send Windows clipboard" description="Uses the current text or image in Windows." placeholder="Not assigned" value={clipboard} disabled={busy} onChange={event => setClipboard(event.currentTarget.value)} />
    </div>
    <p>Enter a shortcut such as Ctrl+Alt+S, or leave it blank to disable it. Both use the channel chosen for Send shortcuts.</p>
    <div className="shared-settings-actions"><UiButton type="button" size="compact-sm" disabled={!dirty || busy} loading={busy} onClick={save}>Save shortcuts</UiButton>{dirty && <UiButton type="button" variant="subtle" size="compact-sm" disabled={busy} onClick={() => { setActive(snapshot.sendActiveShortcut ?? ""); setClipboard(snapshot.sendClipboardShortcut ?? ""); }}>Undo shortcuts</UiButton>}</div>
  </section>;
}

/** Host owns enrollment secrets, durable queues, transport and clipboard effects. */
export function SharedClipboardSettings({ api = sharedClipboardApi, folders: suppliedFolders, actions: suppliedActions, chooseEnrollmentFile: pickFile = chooseEnrollmentFile, onViewReceptions }: SharedClipboardSettingsProps) {
  const [snapshot, setSnapshot] = useState<SharedClipboardSnapshot | null>(null);
  const [folders, setFolders] = useState<FolderSummary[]>(suppliedFolders ?? []);
  const [actions, setActions] = useState<ActionDefinition[]>(suppliedActions ?? []);
  const [channelId, setChannelId] = useState<string | null>(null);
  const [enrollment, setEnrollment] = useState<{ path: string; preview: SharedEnrollmentPreview } | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const mutationInProgress = useRef(false);
  const mutationVersion = useRef(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [connectionEditor, setConnectionEditor] = useState<{ scope: FolderScope; existingConnectionId?: string; chooseFolder?: boolean } | null>(null);
  const [targetActionId, setTargetActionId] = useState<string | null>(null);
  const [identityState, setIdentityState] = useState<SharedIdentityStatus["state"] | null>(null);
  const [deviceNames, setDeviceNames] = useState<Record<string, string>>({});
  const accept = (next: SharedClipboardSnapshot) => {
    setSnapshot(next);
    setChannelId(previous => next.channels.some(channel => channel.id === previous) ? previous : next.channels[0]?.id ?? null);
  };
  useSharedCatalogInvalidation(async () => { accept(await api.status()); }, busy);
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      if (mutationInProgress.current) return;
      const requestedVersion = mutationVersion.current;
      try {
        const [next, nextFolders, nextActions] = await Promise.all([api.status(), suppliedFolders ? Promise.resolve(suppliedFolders) : invoke<FolderSummary[]>("list_folders"), suppliedActions ? Promise.resolve(suppliedActions) : invoke<ActionDefinition[]>("list_actions")]);
        if (active && !mutationInProgress.current && requestedVersion === mutationVersion.current) { accept(next); setFolders(nextFolders); setActions(nextActions); }
      } catch { if (active) setError("Could not read sharing status. Retry to check the connection."); }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 5000);
    return () => { active = false; window.clearInterval(timer); };
  }, [api, suppliedFolders, suppliedActions]);
  const run = async (work: () => Promise<void>) => {
    if (mutationInProgress.current) return;
    mutationInProgress.current = true;
    mutationVersion.current += 1;
    setBusy(true); setError(null); setNotice(null);
    try { await work(); }
    catch (failure) { setError(String(failure)); }
    finally { mutationInProgress.current = false; setBusy(false); }
  };
  const channel = snapshot?.channels.find(candidate => candidate.id === channelId);
  const queued = snapshot?.outbox.filter(publication => ["pending", "queued"].includes(publication.state)).length ?? 0;
  const allPaused = snapshot?.paused || (snapshot?.sendPaused && snapshot?.receivePaused);
  const linkPending = ["waiting", "pending", "revoked", "expired", "cancelled"].includes(snapshot?.identityState ?? identityState ?? "");
  const connectFolder = () => setConnectionEditor({ scope: { kind: "root" }, chooseFolder: true });
  const localName = (connection: SharedConnection) => connection.kind === "general" ? "All history" : connection.folderId === null ? "Root" : folders.some(folder => folder.id === connection.folderId) ? folderFullPath(folders.find(folder => folder.id === connection.folderId)!.path) : "Folder unavailable";
  const editConnection = (connection: SharedConnection) => setConnectionEditor({ existingConnectionId: connection.id, scope: connection.kind === "general" ? { kind: "all" } : connection.folderId === null ? { kind: "root" } : { kind: "folder", folderId: connection.folderId } });
  const windowsWriter = snapshot?.channels.find(sharedChannelHasClipboardWriter);
  const scriptCount = snapshot?.channels.filter(item => item.receiveActionEnabled).length ?? 0;
  return <div className="shared-clipboard-settings" onKeyDown={event => {
    if (event.key === "Enter") {
      event.stopPropagation();
      if (event.target instanceof HTMLInputElement) event.preventDefault();
    }
  }}>
    <div className="shared-settings-status">
      <div><strong>{!snapshot ? "Checking sharing…" : !snapshot.available ? "Sharing unavailable in this build" : !snapshot.configured ? "No device linked" : identityState === "revoked" ? "Device access retired" : allPaused ? "Sharing paused" : "Device linked"}</strong>
        <p>{snapshot?.configured ? "Share text and images between your PCs through connected folders." : "Sign in with the same Google account to share text and images between your PCs."}</p></div>
      <div className="shared-settings-actions">
        {snapshot?.configured && <UiButton type="button" variant={allPaused ? "filled" : "default"} size="compact-sm" loading={busy} disabled={linkPending} onClick={() => void run(async () => { accept(await api.setPaused(!allPaused)); })}>{allPaused ? "Resume sharing" : "Pause sharing"}</UiButton>}
        <UiButton type="button" variant="subtle" size="compact-sm" disabled={busy} onClick={() => void run(async () => { accept(await api.status()); })}>Refresh status</UiButton>
      </div>
    </div>
    {error && <p className="shared-error" role="alert">{error}</p>}
    {snapshot?.lastError && <p className="shared-error" role="alert">{snapshot.lastError}</p>}
    {sharedControlMessage(snapshot?.controlSyncState) && <p role="status">{sharedControlMessage(snapshot?.controlSyncState)}</p>}
    {notice && <p className="shared-inline-notice" role="status">{notice}</p>}
    {snapshot?.available && <SharedIdentitySettings onChanged={next => { setIdentityState(next.state); setDeviceNames(Object.fromEntries(next.devices.map(device => [device.deviceId, device.name]))); if (next.state === "active" || next.state === "revoked") void api.status().then(accept); }} />}
    {snapshot?.configured && !linkPending && <div className="shared-settings-group">
      <h3>Connected folders</h3>
      <p>Each connection links a folder on this PC to a shared clipboard. Connect a folder on your other PC to the same clipboard.</p>
      {!!snapshot.connections?.length ? <ul className="shared-activity-list shared-connections-list" aria-label="Shared connections">{snapshot.connections.map(connection => <li key={connection.id}>
        <div><div className="shared-connection-route"><strong>{localName(connection)}</strong><span aria-hidden="true">{connection.direction === "both" ? "↔" : connection.direction === "send" ? "→" : "←"}</span><strong>{snapshot.channels.find(channel => channel.id === connection.channelId)?.name ?? "Shared clipboard"}</strong></div>
          <small>{connection.direction === "both" ? "Send and receive" : connection.direction === "send" ? "Send only" : "Receive only"}{connection.kind === "general" ? ` · ${[connection.direction !== "receive" ? `Sends ${snapshot.generalSendScope === "all" ? "from all folders" : "from Root"}` : null, connection.direction !== "send" ? "Receives in Root" : null].filter(Boolean).join("; ")}` : " · This folder only"}</small>
          {snapshot.unavailableChannelIds?.includes(connection.channelId) && <p role="status">Clipboard unavailable. This connection is kept for review and cannot send or receive.</p>}
          {connection.kind === "folder" && connection.folderId !== null && !folders.some(folder => folder.id === connection.folderId) && <p role="status">The local folder is unavailable. Disconnect this connection and choose an existing folder.</p>}
          {(snapshot.paused || snapshot.sendPaused || snapshot.receivePaused) && <small>{snapshot.paused || (snapshot.sendPaused && snapshot.receivePaused) ? "Paused on this PC" : snapshot.sendPaused ? "Sending paused on this PC" : "Receiving paused on this PC"}</small>}
        </div>
        <div className="shared-settings-actions"><UiButton type="button" variant="default" size="compact-sm" disabled={busy || (connection.kind === "folder" && connection.folderId !== null && !folders.some(folder => folder.id === connection.folderId))} onClick={() => editConnection(connection)}>Edit</UiButton><UiButton type="button" variant="subtle" size="compact-sm" disabled={busy} onClick={() => void run(async () => { accept(await sharedProductApi.disconnect(connection.id)); setNotice("Connection disconnected. Local copies remain."); })}>Disconnect</UiButton></div>
      </li>)}</ul> : <p className="shared-empty-connections">No folders connected yet. Choose a local folder and a shared clipboard to start.</p>}
      <div className="shared-settings-actions"><UiButton type="button" variant="default" size="compact-sm" disabled={busy} onClick={connectFolder}>Connect a folder…</UiButton><UiButton type="button" variant="subtle" size="compact-sm" disabled={busy} onClick={() => setLibraryOpen(true)}>Manage shared clipboards</UiButton></div>
      <p>Received items are saved in the connected folder. What Ctrl+V pastes changes only if you enable automatic Windows clipboard updates below.</p>
    </div>}
    {snapshot?.available && !snapshot.configured && <details className="shared-settings-group">
      <summary>Advanced: synthetic test enrollment</summary>
      <h3>Link this device</h3>
      <p>Human account linking needs a configured identity provider. This local preparation is for controlled fixtures.</p>
      <p>Choose the enrollment file prepared for this device. Copicu keeps credentials in protected local storage; channel names do not grant access.</p>
      <UiButton type="button" variant="default" size="compact-sm" disabled={busy} onClick={() => void run(async () => {
        const path = await pickFile();
        if (path) { setEnrollment(null); setConfirmed(false); const preview = await api.previewEnrollment(path); setEnrollment({ path, preview }); }
      })}>Choose enrollment file</UiButton>
      {enrollment && <div className="shared-enrollment-review">
        <dl><div><dt>Device</dt><dd>{enrollment.preview.deviceId}</dd></div><div><dt>Service</dt><dd>{enrollment.preview.endpoint}</dd></div><div><dt>Environment</dt><dd>{enrollment.preview.environment}</dd></div><div><dt>Channels</dt><dd>{enrollment.preview.channels.map(item => `${item.name} (${item.canPublish ? "send and receive" : "receive"})`).join(", ")}</dd></div></dl>
        <label className="shared-fingerprint-label">Enrollment fingerprint<code>{enrollment.preview.fingerprint}</code></label>
        <UiCheckbox label="I verified this fingerprint with the channel owner" checked={confirmed} disabled={busy} onChange={event => setConfirmed(event.currentTarget.checked)} />
        <p>Recovery requires the channel owner and an available channel key. Revoking this device stops future access; previously downloaded content remains local.</p>
        <UiButton type="button" size="compact-sm" disabled={!confirmed || busy} loading={busy} onClick={() => void run(async () => { accept(await api.configure(enrollment.path, enrollment.preview.fingerprint)); setEnrollment(null); setConfirmed(false); setNotice("Device linked. Review each channel before enabling local effects."); })}>Link device</UiButton>
      </div>}
    </details>}
    {snapshot?.configured && !linkPending && <>
      <section className="shared-settings-group shared-activity" aria-label="Recent sharing activity">
        <div className="shared-activity-heading"><h3>Recent activity</h3><div className="shared-settings-actions">{queued > 0 && <span>{queued} queued</span>}{onViewReceptions && <UiButton type="button" variant="subtle" size="compact-sm" onClick={onViewReceptions}>View receptions</UiButton>}</div></div>
        {(snapshot.sendPaused || snapshot.paused) && <p>Queued items wait while sending is paused. A transfer already started may still finish.</p>}
        {snapshot.outbox.length === 0 && snapshot.receipts.length === 0 && <p>No transfers yet. Add text or an image to a connected folder to send it. Received items and their destination will appear here.</p>}
        {snapshot.outbox.length > 0 && <ul className="shared-activity-list" aria-label="Outgoing publications">{snapshot.outbox.slice(0, 3).map(publication => <li key={publication.publicationId}><div><strong>{snapshot.channels.find(item => item.id === publication.channelId)?.name ?? "Shared clipboard"}</strong><small>Sent from this PC</small></div><span>{sharedPublicationState(publication)}</span></li>)}</ul>}
        {snapshot.receipts.length > 0 && <ul className="shared-activity-list" aria-label="Received publications">{snapshot.receipts.slice(0, 3).map(receipt => <li key={`${receipt.subscriptionId}:${receipt.publicationId}`}><div><strong>{snapshot.channels.find(item => item.id === receipt.channelId)?.name ?? "Shared clipboard"}</strong><small>From {deviceNames[receipt.originDeviceId] ?? receipt.originDeviceId} · {receipt.delivery === "live" ? "Just received" : receipt.delivery === "recovery" ? "From history" : "Delayed"}</small><small>{sharedReceiptStatus(receipt)}</small></div><UiButton type="button" variant="default" size="compact-xs" disabled={busy || !sharedReceiptCanCopy(receipt)} onClick={() => void run(async () => { await api.copyReceipt(receipt.subscriptionId, receipt.publicationId); setNotice("Received content copied to Windows clipboard."); })}>Copy content</UiButton></li>)}</ul>}
      </section>
      <details className="shared-settings-disclosure shared-settings-advanced">
        <summary>Clipboard behavior and automation<span>{windowsWriter ? `Windows updates configured for ${windowsWriter.name}` : "Automatic Windows updates off"}{scriptCount > 0 ? ` · ${scriptCount} ${scriptCount === 1 ? "script" : "scripts"} configured` : ""}</span></summary>
        <div className="shared-settings-group">
      <p>Optional settings for this PC. Folder connections work without these options.</p>
      <UiSelect label="Shared clipboard" value={channelId} onChange={setChannelId} allowDeselect={false} data={snapshot.channels.map(item => ({ value: item.id, label: `${item.name}${snapshot.unavailableChannelIds?.includes(item.id) ? " · Unavailable" : ""}` }))} />
      {channel && snapshot.unavailableChannelIds?.includes(channel.id) && <p className="shared-inline-notice" role="status">This clipboard was removed or your access was revoked. Local copies and drafts remain; its settings cannot be saved.</p>}
      {snapshot.channels.map(policy => <div key={policy.id} hidden={policy.id !== channel?.id}><ChannelSettings policy={policy} channels={snapshot.channels} folders={folders} actions={actions} busy={busy || !!snapshot.unavailableChannelIds?.includes(policy.id)} unavailable={!!snapshot.unavailableChannelIds?.includes(policy.id)} onSave={behavior => run(async () => {
        const current = await api.status();
        const latestPolicy = current.channels.find(item => item.id === policy.id);
        if (!latestPolicy || current.unavailableChannelIds?.includes(policy.id)) { accept(current); throw new Error("This shared clipboard is unavailable. Your draft has been kept."); }
        // Only behavior fields are editable here. Preserve the latest connection topology.
        accept(await api.updateChannel({ ...latestPolicy, ...behavior }));
        setNotice("Clipboard behavior saved.");
      })} /></div>)}
      <details className="shared-settings-disclosure"><summary>Send shortcuts<span>{snapshot.sendActiveShortcut || snapshot.sendClipboardShortcut ? "Assigned" : "Not assigned"}</span></summary><div>
      <SendShortcutSettings snapshot={snapshot} busy={busy} onSave={(active, clipboard) => run(async () => { accept(await api.setHotkeys(active, clipboard)); setNotice("Send shortcuts saved."); })} />
      </div></details>
      <details className="shared-settings-disclosure"><summary>Sharing scripts<span>Choose where a script sends content</span></summary><div>
      <div className="shared-settings-group">
        <h3>Script destination</h3>
        <UiSelect label="Action" value={targetActionId} disabled={busy} data={actions.filter(action => action.source === "script" && action.capabilities.includes("shared:publish") && action.capabilities.includes("shared:read")).map(action => ({ value: action.id, label: action.title }))} onChange={setTargetActionId} placeholder="Choose a sharing script" />
        {targetActionId && <UiSelect label="Shared destination" value={snapshot.actionTargets?.[targetActionId] ?? null} clearable disabled={busy} placeholder="No configured destination" data={snapshot.channels.filter(channel => channel.canPublish && actions.find(action => action.id === targetActionId)?.capabilities.includes(`shared:publish:${channel.id}`)).map(channel => ({ value: channel.id, label: channel.name }))} onChange={id => void run(async () => { accept(await sharedProductApi.setActionTarget(targetActionId,id)); setNotice("Script destination saved. Its existing access scopes still apply."); })} />}
        <p>Choose an authorized shared clipboard for a script that sends content.</p>
      </div>
      </div></details>
      <details className="shared-settings-disclosure"><summary>All history connection<span>Send new captures across folders</span></summary><div className="shared-settings-group">
        <UiSelect label="General sending scope" value={snapshot.generalSendScope ?? "unfiled"} disabled={busy} data={[{ value: "unfiled", label: "Only clips without a folder" }, { value: "all", label: "All Copicu" }]} onChange={scope => { if (scope === "all" || scope === "unfiled") void run(async () => { accept(await sharedProductApi.setScope(scope)); setNotice("Sending scope saved. Existing content was not sent."); }); }} />
        <p>Applies only to the All history connection. Sends new captures from Root or all folders; moving existing items does not send them through this connection. Incoming content is saved in Root.</p>
        <UiButton type="button" variant="default" size="compact-sm" disabled={busy} onClick={() => setConnectionEditor({ scope: { kind: "all" } })}>Connect All history…</UiButton>
      </div></details>
      <details className="shared-settings-disclosure"><summary>Pause sending or receiving<span>Controls for this PC</span></summary><div className="shared-settings-group">
        <div className="shared-settings-actions"><UiButton type="button" variant="default" size="compact-sm" disabled={busy} onClick={() => void run(async () => { accept(await sharedProductApi.pause(null, !snapshot.sendPaused, null)); })}>{snapshot.sendPaused ? `Resume sending (${queued} pending)` : "Pause sending"}</UiButton><UiButton type="button" variant="default" size="compact-sm" disabled={busy} onClick={() => void run(async () => { accept(await sharedProductApi.pause(null, null, !snapshot.receivePaused)); })}>{snapshot.receivePaused ? "Resume reception" : "Pause reception"}</UiButton></div>
        <p>New items added while sending is paused are not queued. Resuming reception starts from now; older content remains available in shared history.</p>
      </div></details>
        </div>
      </details>
    </>}
    {libraryOpen && <SharedClipboardLibrary onClose={() => setLibraryOpen(false)} onConnect={() => { setLibraryOpen(false); connectFolder(); }} />}
    {connectionEditor && <SharedClipboardConnect {...connectionEditor} folders={folders} onClose={() => setConnectionEditor(null)} onConnected={() => { void api.status().then(accept); setNotice("Connection saved. Previous content was not imported."); }} />}
  </div>;
}
