import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { MultiSelect } from "@mantine/core";
import type { ActionDefinition, FolderSummary } from "../shared/contracts";
import { sharedChannelHasClipboardWriter, sharedChannelValidation, sharedClipboardApi, sharedForwardTargetEligible, sharedPublicationState, sharedReceiptCanCopy, sharedReceiptStatus, sharedReceptionActionEligible, type SharedChannelPolicy, type SharedClipboardApi, type SharedClipboardSnapshot, type SharedEnrollmentPreview } from "../shared/sharedClipboard";
import { FolderSelect } from "./FolderSelect";
import { UiButton, UiCheckbox, UiSelect, UiTextInput } from "./controls";
import "./sharedClipboard.css";
import { sharedProductApi } from "../shared/sharedProduct";
import { SharedClipboardLibrary } from "./SharedClipboardLibrary";
import { SharedClipboardConnect } from "./SharedClipboardConnect";
import { sharedControlMessage, useSharedCatalogInvalidation } from "../shared/useSharedCatalogInvalidation";

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

function ChannelSettings({ policy, channels, folders, actions, busy, unavailable, onSave }: {
  policy: SharedChannelPolicy; channels: SharedChannelPolicy[]; folders: FolderSummary[]; busy: boolean;
  actions: ActionDefinition[];
  unavailable: boolean;
  onSave: (policy: SharedChannelPolicy) => Promise<void>;
}) {
  const [draft, setDraft] = useState(policy);
  const dirty = JSON.stringify(draft) !== JSON.stringify(policy);
  const eligibleActions = actions.filter(action => sharedReceptionActionEligible(action, policy.id));
  const selectedAction = eligibleActions.find(action => action.id === draft.receiveActionId);
  const otherWriter = channels.some(channel => channel.id !== draft.id && sharedChannelHasClipboardWriter(channel));
  const error = sharedChannelValidation(draft, channels, folders.map(folder => folder.id))
    ?? (draft.receiveActionEnabled && !selectedAction ? "The reception action is no longer available or authorized for this channel." : null)
    ?? (draft.receiveActionWritesClipboard && !selectedAction?.capabilities.includes("clipboard:write") ? "The reception action needs explicit clipboard write access." : null)
    ?? (draft.receiveActionEnabled && selectedAction && (draft.receiveActionForwardChannelIds ?? []).some(id => !channels.some(target => target.id === id && sharedForwardTargetEligible(selectedAction, policy.id, target))) ? "A forwarding channel is no longer authorized. Review the allowed channels." : null);
  const change = (value: Partial<SharedChannelPolicy>) => setDraft(previous => ({ ...previous, ...value }));
  // Refreshes never overwrite an edit in progress.
  useEffect(() => { if (!dirty) setDraft(policy); }, [policy]);
  const save = () => { if (!error && dirty && !busy) void onSave(draft); };
  return <section className="shared-channel-settings" aria-label="Channel settings" onKeyDown={event => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); event.stopPropagation(); save(); }
    else if (event.key === "Enter" && event.target instanceof HTMLInputElement) { event.preventDefault(); event.stopPropagation(); }
  }}>
    <div className="shared-settings-group">
      <h3>Publish from a folder</h3>
      {draft.canPublish && <>
        <UiCheckbox label="Use this channel for Send shortcuts" checked={draft.defaultSendChannel ?? false} disabled={busy} onChange={event => change({ defaultSendChannel: event.currentTarget.checked })} />
        <p>Send active clip uses the picker selection. Send Windows clipboard uses the current Windows text.</p>
      </>}
      <UiCheckbox label="Publish new local arrivals" checked={draft.publishFolderEnabled} disabled={busy || !draft.canPublish} onChange={event => change({ publishFolderEnabled: event.currentTarget.checked })} />
      <p>Only this folder. Its existing clips and subfolders are excluded. Received content is never sent back automatically.</p>
      {!draft.canPublish && <p>This device has reception access only.</p>}
      {draft.publishFolderEnabled && <FolderSelect folders={folders} label="Publication folder" allowCreate={false} disabled={busy} value={{ kind: "existing", folderId: draft.publishFolderId }} onChange={choice => { if (choice.kind === "existing") change({ publishFolderId: choice.folderId }); }} />}
    </div>
    <div className="shared-settings-group">
      <h3>Receive from this channel</h3>
      <UiCheckbox label="Receive publications" checked={draft.receiveEnabled} disabled={busy} onChange={event => change({ receiveEnabled: event.currentTarget.checked })} />
      <p>Choose the local effects independently. Turning reception on does not publish local copies.</p>
      <UiCheckbox label="Save received text in Copicu" checked={draft.saveToFolder} disabled={busy} onChange={event => change({ saveToFolder: event.currentTarget.checked })} />
      {draft.saveToFolder && <>
        <FolderSelect folders={folders} label="Reception folder" allowCreate={false} disabled={busy} value={{ kind: "existing", folderId: draft.receiveFolderId }} onChange={choice => { if (choice.kind === "existing") change({ receiveFolderId: choice.folderId }); }} />
        <p>Existing clips keep their folder, tags and other metadata.</p>
      </>}
      <UiCheckbox label="Update Windows clipboard on live arrivals" checked={draft.updateClipboard} disabled={busy || (!draft.updateClipboard && (otherWriter || (draft.receiveActionEnabled && draft.receiveActionWritesClipboard)))} onChange={event => change({ updateClipboard: event.currentTarget.checked })} />
      <p>Copies the original received text. Only one channel and one output can update Windows. Recovered publications remain available for manual copy. Receiving never pastes or opens another app.</p>
      <UiCheckbox label="Run a local action on live arrivals" checked={draft.receiveActionEnabled ?? false} disabled={busy || (!eligibleActions.length && !draft.receiveActionEnabled)} onChange={event => change({ receiveActionEnabled: event.currentTarget.checked, ...(!event.currentTarget.checked ? { receiveActionWritesClipboard: false } : {}) })} />
      {!eligibleActions.length && <p>No authorized reception scripts are available for this channel. Scripts must declare the sharedReception trigger and explicit channel access.</p>}
      {draft.receiveActionEnabled && <>
        <UiSelect label="Reception action" placeholder="Choose an authorized script" value={draft.receiveActionId} disabled={busy} data={eligibleActions.map(action => ({ value: action.id, label: action.title }))} onChange={receiveActionId => change({ receiveActionId, receiveActionForwardChannelIds: [], receiveActionWritesClipboard: false })} />
        <p>The action reads the received publication. It cannot paste or focus another app. Recovered publications do not run actions automatically.</p>
        {selectedAction?.capabilities.includes("clipboard:write") && <>
          <UiCheckbox label="Allow reception action to update Windows clipboard" checked={draft.receiveActionWritesClipboard ?? false} disabled={busy || (!draft.receiveActionWritesClipboard && (draft.updateClipboard || otherWriter))} onChange={event => change({ receiveActionWritesClipboard: event.currentTarget.checked })} />
          <p>The action may transform or generate text and write it once per live reception. Turn off the original-text output before enabling this output.</p>
        </>}
        {otherWriter && <p className="shared-inline-notice">Another channel owns Windows clipboard updates. Turn off its output before choosing one here.</p>}
        {selectedAction && <MultiSelect label="Allow this action to forward to channels" placeholder="No forwarding allowed" value={draft.receiveActionForwardChannelIds ?? []} disabled={busy} comboboxProps={{ withinPortal: true }} data={channels.filter(target => sharedForwardTargetEligible(selectedAction, policy.id, target)).map(target => ({ value: target.id, label: target.name }))} onChange={receiveActionForwardChannelIds => change({ receiveActionForwardChannelIds })} />}
      </>}
      {!draft.receiveEnabled && (draft.saveToFolder || draft.updateClipboard || draft.receiveActionEnabled) && <p className="shared-inline-notice">These effects will run only while reception is enabled.</p>}
    </div>
    {error && <p className="shared-error" role="alert">{error}</p>}
    <div className="shared-settings-actions">
      <UiButton type="button" size="compact-sm" disabled={!dirty || !!error || busy} loading={busy && !unavailable} onClick={save}>Save channel settings</UiButton>
      {dirty && <UiButton type="button" variant="subtle" size="compact-sm" disabled={busy} onClick={() => setDraft(policy)}>Undo changes</UiButton>}
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
      <UiTextInput label="Send Windows clipboard" description="Uses the current text in Windows." placeholder="Not assigned" value={clipboard} disabled={busy} onChange={event => setClipboard(event.currentTarget.value)} />
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
  const [connectOpen, setConnectOpen] = useState(false);
  const [targetActionId, setTargetActionId] = useState<string | null>(null);
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
  return <div className="shared-clipboard-settings" onKeyDown={event => {
    if (event.key === "Enter") {
      event.stopPropagation();
      if (event.target instanceof HTMLInputElement) event.preventDefault();
    }
  }}>
    <div className="shared-settings-status">
      <div><strong>{!snapshot ? "Checking sharing…" : !snapshot.available ? "Sharing unavailable in this build" : !snapshot.configured ? "Sharing is off" : allPaused ? "Sharing paused" : "Sharing enabled"}</strong>
        <p>{snapshot?.configured ? `${snapshot.deviceId ?? "This device"} · ${snapshot.environment ?? "Private service"}` : "Link this device to a private channel to start sharing plain text."}</p></div>
      <div className="shared-settings-actions">
        {snapshot?.configured && <UiButton type="button" variant={allPaused ? "filled" : "default"} size="compact-sm" loading={busy} onClick={() => void run(async () => { accept(await api.setPaused(!allPaused)); })}>{allPaused ? "Resume sharing" : "Pause sharing"}</UiButton>}
        <UiButton type="button" variant="subtle" size="compact-sm" disabled={busy} onClick={() => void run(async () => { accept(await api.status()); })}>Refresh status</UiButton>
      </div>
    </div>
    {error && <p className="shared-error" role="alert">{error}</p>}
    {snapshot?.lastError && <p className="shared-error" role="alert">{snapshot.lastError}</p>}
    {sharedControlMessage(snapshot?.controlSyncState) && <p role="status">{sharedControlMessage(snapshot?.controlSyncState)}</p>}
    {notice && <p className="shared-inline-notice" role="status">{notice}</p>}
    {snapshot?.configured && <div className="shared-settings-group">
      <h3>General connection</h3>
      <UiSelect label="General sending scope" value={snapshot.generalSendScope ?? "unfiled"} disabled={busy} data={[{ value: "unfiled", label: "Only texts without a folder" }, { value: "all", label: "All Copicu" }]} onChange={scope => { if (scope === "all" || scope === "unfiled") void run(async () => { accept(await sharedProductApi.setScope(scope)); setNotice("Sending scope saved. Existing content was not sent."); }); }} />
      <p>All Copicu includes new local texts from every folder. Existing texts and moving clips between folders do not enter the general stream. Sending needs an explicit connection.</p>
      <div className="shared-settings-actions"><UiButton type="button" variant="default" disabled={busy} onClick={() => setConnectOpen(true)}>Connect All history…</UiButton><UiButton type="button" variant="default" disabled={busy} onClick={() => setLibraryOpen(true)}>Manage shared clipboards</UiButton></div>
      {!!snapshot.connections?.length && <ul className="shared-activity-list" aria-label="Shared connections">{snapshot.connections.map(connection => <li key={connection.id}>
        <div><strong>{snapshot.channels.find(channel => channel.id === connection.channelId)?.name ?? "Shared clipboard"}</strong>
          <small>{connection.kind === "general" ? "All history" : connection.folderId === null ? "Root" : folders.find(folder => folder.id === connection.folderId)?.name ?? "Folder unavailable"} · {connection.direction === "both" ? "Send and receive" : connection.direction === "send" ? "Send" : "Receive"}</small>
          {snapshot.unavailableChannelIds?.includes(connection.channelId) && <p role="status">Clipboard unavailable. This connection is kept for review and cannot send or receive.</p>}
        </div>
        <UiButton type="button" variant="subtle" size="compact-sm" disabled={busy} onClick={() => void run(async () => { accept(await sharedProductApi.disconnect(connection.id)); setNotice("Connection disconnected. Local copies remain."); })}>Disconnect</UiButton>
      </li>)}</ul>}
      <h3>Pause on this device</h3>
      <div className="shared-settings-actions"><UiButton type="button" variant="default" disabled={busy} onClick={() => void run(async () => { accept(await sharedProductApi.pause(null, !snapshot.sendPaused, null)); })}>{snapshot.sendPaused ? `Resume sending (${queued} pending)` : "Pause sending"}</UiButton><UiButton type="button" variant="default" disabled={busy} onClick={() => void run(async () => { accept(await sharedProductApi.pause(null, null, !snapshot.receivePaused)); })}>{snapshot.receivePaused ? "Resume reception" : "Pause reception"}</UiButton></div>
      <p>Device pauses take priority over each clipboard's pause. New local copies made while sending is paused are not queued. Resuming reception starts from now; earlier content remains available in shared history.</p>
    </div>}
    {snapshot?.available && !snapshot.configured && <details className="shared-settings-group">
      <summary>Technical preparation for a local synthetic service</summary>
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
        <p>Recovery requires the channel owner and an available channel key. Revoking this device stops future access; previously downloaded text remains local.</p>
        <UiButton type="button" size="compact-sm" disabled={!confirmed || busy} loading={busy} onClick={() => void run(async () => { accept(await api.configure(enrollment.path, enrollment.preview.fingerprint)); setEnrollment(null); setConfirmed(false); setNotice("Device linked. Review each channel before enabling local effects."); })}>Link device</UiButton>
      </div>}
    </details>}
    {snapshot?.configured && <>
      <UiSelect label="Channel" value={channelId} onChange={setChannelId} allowDeselect={false} data={snapshot.channels.map(item => ({ value: item.id, label: `${item.name}${snapshot.unavailableChannelIds?.includes(item.id) ? " · Unavailable" : ""}` }))} />
      {channel && snapshot.unavailableChannelIds?.includes(channel.id) && <p className="shared-inline-notice" role="status">This clipboard was removed or your access was revoked. Local copies and drafts remain; its settings cannot be saved.</p>}
      {snapshot.channels.map(policy => <div key={policy.id} hidden={policy.id !== channel?.id}><ChannelSettings policy={policy} channels={snapshot.channels} folders={folders} actions={actions} busy={busy || !!snapshot.unavailableChannelIds?.includes(policy.id)} unavailable={!!snapshot.unavailableChannelIds?.includes(policy.id)} onSave={nextPolicy => run(async () => { accept(await api.updateChannel(nextPolicy)); setNotice("Channel settings saved. Existing folder contents were not sent."); })} /></div>)}
      <SendShortcutSettings snapshot={snapshot} busy={busy} onSave={(active, clipboard) => run(async () => { accept(await api.setHotkeys(active, clipboard)); setNotice("Send shortcuts saved."); })} />
      <div className="shared-settings-group">
        <h3>Script destination</h3>
        <UiSelect label="Action" value={targetActionId} disabled={busy} data={actions.filter(action => action.source === "script" && action.capabilities.includes("shared:publish") && action.capabilities.includes("shared:read")).map(action => ({ value: action.id, label: action.title }))} onChange={setTargetActionId} placeholder="Choose a sharing script" />
        {targetActionId && <UiSelect label="Shared destination" value={snapshot.actionTargets?.[targetActionId] ?? null} clearable disabled={busy} placeholder="No configured destination" data={snapshot.channels.filter(channel => channel.canPublish && actions.find(action => action.id === targetActionId)?.capabilities.includes(`shared:publish:${channel.id}`)).map(channel => ({ value: channel.id, label: channel.name }))} onChange={id => void run(async () => { accept(await sharedProductApi.setActionTarget(targetActionId,id)); setNotice("Script destination saved. Its existing access scopes still apply."); })} />}
        <p>The script can publish with its configured destination. Only explicitly authorized channels are offered.</p>
      </div>
      <div className="shared-settings-group shared-activity">
        <div className="shared-activity-heading"><h3>Activity</h3><div className="shared-settings-actions"><span>{queued} queued</span>{onViewReceptions && <UiButton type="button" variant="subtle" size="compact-sm" onClick={onViewReceptions}>View receptions</UiButton>}</div></div>
        {(snapshot.sendPaused || snapshot.paused) && <p>Previously queued publications wait while sending is paused. A request already started may still be accepted.</p>}
        {snapshot.outbox.length === 0 && snapshot.receipts.length === 0 && <p>Send text with a sharing Action or add a new local clip to an enabled publication folder. Incoming text will appear here with its origin.</p>}
        {snapshot.outbox.length > 0 && <ul className="shared-activity-list" aria-label="Outgoing publications">{snapshot.outbox.slice(0, 20).map(publication => <li key={publication.publicationId}><div><strong>{snapshot.channels.find(item => item.id === publication.channelId)?.name ?? publication.channelId}</strong><small title={publication.publicationId}>Sent · {publication.publicationId}</small></div><span>{sharedPublicationState(publication)}</span></li>)}</ul>}
        {snapshot.receipts.length > 0 && <ul className="shared-activity-list" aria-label="Received publications">{snapshot.receipts.slice(0, 20).map(receipt => <li key={`${receipt.subscriptionId}:${receipt.publicationId}`}><div><strong>{snapshot.channels.find(item => item.id === receipt.channelId)?.name ?? receipt.channelId}</strong><small>From {receipt.originDeviceId} · {receipt.delivery === "live" ? "Live" : receipt.delivery === "recovery" ? "Recovered" : "Delayed"}</small><small>{sharedReceiptStatus(receipt)}</small></div><UiButton type="button" variant="default" size="compact-xs" disabled={busy || !sharedReceiptCanCopy(receipt)} onClick={() => void run(async () => { await api.copyReceipt(receipt.subscriptionId, receipt.publicationId); setNotice("Received text copied to Windows clipboard."); })}>Copy text</UiButton></li>)}</ul>}
      </div>
    </>}
    {libraryOpen && <SharedClipboardLibrary onClose={() => setLibraryOpen(false)} onConnect={() => { setLibraryOpen(false); setConnectOpen(true); }} />}
    {connectOpen && <SharedClipboardConnect scope={{ kind: "all" }} folders={folders} onClose={() => setConnectOpen(false)} onConnected={() => void api.status().then(accept)} />}
  </div>;
}
