import { useEffect, useRef, useState } from "react";
import { sharedIdentityApi, sharingIdentityMessage, type DeviceIntent, type SharedDevice, type SharedIdentityApi, type SharedIdentityStatus } from "../shared/sharedIdentity";
import { UiButton, UiCheckbox, UiTextInput } from "./controls";

function DeviceReview({ device, current, revision, busy, onDevice }: { device: SharedDevice; current: boolean; revision: string; busy: boolean; onDevice: (intent: DeviceIntent) => Promise<void> }) {
  const [compared, setCompared] = useState(false);
  const [retiring, setRetiring] = useState(false);
  const [confirmedRetirement, setConfirmedRetirement] = useState(false);
  const operation = useRef<DeviceIntent | null>(null);
  const run = async (kind: "approve" | "revoke") => {
    if (!operation.current || operation.current.kind !== kind) operation.current = { kind, operationId: crypto.randomUUID().replaceAll("-", ""), deviceId: device.deviceId, fingerprint: device.fingerprint, expectedRevision: revision };
    try { await onDevice(operation.current); operation.current = null; setCompared(false); setRetiring(false); }
    catch (error) { if (/changed|refresh/i.test(String(error))) { operation.current = null; setCompared(false); } }
  };
  return <li className="shared-device-row">
    <div><strong>{device.name}{current ? " · This PC" : ""}</strong><span>{({ pending: "Awaiting approval", active: "Approved", revoked: "Retired", expired: "Request expired" })[device.state]}</span></div>
    {device.state === "pending" && <>
      <label className="shared-fingerprint-label">Device fingerprint<code>{device.fingerprint}</code></label>
      <UiCheckbox label="I compared this fingerprint on the requesting PC" checked={compared} disabled={busy} onChange={event => setCompared(event.currentTarget.checked)} />
      <UiButton type="button" size="compact-sm" disabled={busy || !compared} onClick={() => void run("approve")}>Approve device</UiButton>
      <p>Transfers available content keys. This PC's folders, Windows updates and Actions are configured separately.</p>
    </>}
    {device.state === "active" && !current && <details className="shared-device-review"><summary>Content keys on this device</summary>
      <label className="shared-fingerprint-label">Device fingerprint<code>{device.fingerprint}</code></label>
      <UiCheckbox label="I compared this fingerprint on that PC" checked={compared} disabled={busy} onChange={event => setCompared(event.currentTarget.checked)} />
      <UiButton type="button" size="compact-sm" variant="default" disabled={busy || !compared} onClick={() => void run("approve")}>Send available keys</UiButton>
    </details>}
    {["pending", "active"].includes(device.state) && <>
      {!retiring ? <UiButton type="button" size="compact-sm" variant="subtle" disabled={busy} onClick={() => setRetiring(true)}>{device.state === "pending" ? "Reject request…" : "Retire device…"}</UiButton> : <div className="shared-settings-group">
        <p>Stops future access on {device.name}. Downloaded copies remain. Affected clipboards need key rotation before sending can resume.</p>
        <UiCheckbox label="I want to stop this device's access" checked={confirmedRetirement} disabled={busy} onChange={event => setConfirmedRetirement(event.currentTarget.checked)} />
        <div className="shared-settings-actions"><UiButton type="button" size="compact-sm" disabled={busy || !confirmedRetirement} onClick={() => void run("revoke")}>Retire device</UiButton><UiButton type="button" variant="default" size="compact-sm" disabled={busy} onClick={() => setRetiring(false)}>Cancel retirement</UiButton></div>
      </div>}
    </>}
  </li>;
}

export function SharedIdentitySettings({ api = sharedIdentityApi, onChanged, onConnect }: { api?: SharedIdentityApi; onChanged?: (status: SharedIdentityStatus) => void; onConnect: () => void }) {
  const [status, setStatus] = useState<SharedIdentityStatus | null>(null);
  const [endpoint, setEndpoint] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [recoveryInput, setRecoveryInput] = useState("");
  const [shownCode, setShownCode] = useState<string | null>(null);
  const [recoverConsent, setRecoverConsent] = useState(false);
  const mutation = useRef(false);
  const checking = useRef(false);
  const version = useRef(0);
  const recoverOperation = useRef<string | null>(null);
  const mounted = useRef(true);
  const accept = (next: SharedIdentityStatus) => {
    if (!mounted.current) return;
    const { code, ...safe } = next;
    if (code) setShownCode(code);
    setStatus(safe); onChanged?.(safe);
  };
  useEffect(() => {
    mounted.current = true;
    const refresh = async () => {
      if (mutation.current || checking.current) return;
      checking.current = true;
      const requestVersion = version.current;
      try { const next = await api.status(); if (mounted.current && !mutation.current && requestVersion === version.current) accept(next); }
      catch { if (mounted.current) setError("Could not check device sign-in. Retry to read its status."); }
      finally { checking.current = false; }
    };
    void refresh(); const timer = window.setInterval(() => void refresh(), 5000);
    return () => { mounted.current = false; window.clearInterval(timer); };
  }, [api]);
  const run = async (work: () => Promise<SharedIdentityStatus>, message?: string) => {
    if (mutation.current) return;
    mutation.current = true; version.current += 1; setBusy(true); setError(null); setNotice(null);
    try { const next = await work(); accept(next); if (mounted.current && message) setNotice(message); return next; }
    catch (failure) { if (mounted.current) setError(String(failure)); throw failure; }
    finally { mutation.current = false; if (mounted.current) setBusy(false); }
  };
  const act = (work: () => Promise<SharedIdentityStatus>, message?: string) => { void run(work, message).catch(() => {}); };
  const state = status?.state;
  const initial = ["unconfigured", "cancelled", "expired", "revoked"].includes(state ?? "");
  const waiting = state === "waiting" || (state === "offline" && status?.previousState === "waiting");
  const pending = state === "pending" || (state === "offline" && status?.previousState === "pending");
  if (state === "technical") return <p className="shared-inline-notice">Synthetic service profile. Account sign-in is not configured for this technical enrollment.</p>;
  return <section className="shared-settings-group shared-identity" aria-label="Device sign-in">
    <h3>{state === "active" ? "Your account and devices" : state === "pending" ? "Approve this device" : "Link this device"}</h3>
    {!status ? <p role="status">Checking device sign-in…</p> : <p>{sharingIdentityMessage(status)}</p>}
    {initial && <>
      <UiTextInput label="Sharing service URL" placeholder="https://sharing.example.com" value={endpoint} disabled={busy} autoComplete="off" onChange={event => setEndpoint(event.currentTarget.value)} />
      <p>Both PCs need a reachable private service. If it has not been deployed yet, sign-in will remain unavailable. Get its HTTPS URL from the service administrator.</p>
      <UiTextInput label="Name of this PC" placeholder="Work PC" value={name} disabled={busy} maxLength={80} autoComplete="off" onChange={event => setName(event.currentTarget.value)} />
      <UiButton type="button" size="compact-sm" loading={busy} disabled={busy || !endpoint.trim() || !name.trim()} onClick={() => act(() => api.start(endpoint.trim(), name.trim()))}>Sign in in browser</UiButton>
      <p>Signing in does not share existing history or turn on Windows clipboard updates.</p>
    </>}
    {(waiting || pending) && <>
      <p>{status?.name} · {status?.endpoint}</p>
      {status?.fingerprint && <label className="shared-fingerprint-label">This device's fingerprint<code>{status.fingerprint}</code></label>}
      <div className="shared-settings-actions">{waiting && <UiButton type="button" variant="default" size="compact-sm" disabled={busy} onClick={() => act(api.reopen)}>Open sign-in again</UiButton>}<UiButton type="button" variant="default" size="compact-sm" disabled={busy} onClick={() => act(api.status)}>Check approval</UiButton><UiButton type="button" variant="subtle" size="compact-sm" disabled={busy} onClick={() => act(api.cancel)}>Cancel linking</UiButton></div>
      {pending && status?.recoveryReady && <details className="shared-device-review"><summary>Recover with a saved code</summary>
        <p>Requires the code saved on an approved PC. Recovery retires earlier devices; sending stays stopped on affected clipboards until keys are rotated. Only keys in the latest encrypted snapshot can be recovered.</p>
        <UiTextInput label="Saved recovery code" type="password" value={recoveryInput} disabled={busy} autoComplete="off" spellCheck={false} onChange={event => { setRecoveryInput(event.currentTarget.value); recoverOperation.current = null; }} />
        <UiCheckbox label="Retire earlier devices and recover this account's available keys" checked={recoverConsent} disabled={busy} onChange={event => setRecoverConsent(event.currentTarget.checked)} />
        <UiButton type="button" size="compact-sm" disabled={busy || !recoverConsent || !recoveryInput.trim()} onClick={() => act(async () => { recoverOperation.current ??= crypto.randomUUID().replaceAll("-", ""); const next = await api.recover(recoveryInput, recoverOperation.current); setRecoveryInput(""); return next; }, "Recovery completed. Review key rotation before sending.")}>Recover this device</UiButton>
      </details>}
      {pending && !status?.recoveryReady && <p>Without an approved PC or a previously saved recovery code, content keys cannot be recovered by signing in alone.</p>}
    </>}
    {status && state === "active" && <>
      <p>{status.name} · {status.endpoint}</p>
      <UiButton type="button" size="compact-sm" variant="default" onClick={onConnect}>Create or connect a clipboard…</UiButton>
      <details className="shared-device-review" open={status.devices.some(device => device.state === "pending")}><summary>Devices ({status.devices.filter(d => d.state === "active").length} approved)</summary>
        <ul className="shared-device-list" aria-label="Account devices">{status.devices.map(device => <DeviceReview key={`${device.deviceId}:${device.fingerprint}`} device={device} current={device.deviceId === status.deviceId} revision={status.revision ?? ""} busy={busy} onDevice={async intent => { await run(() => api.device(intent), intent.kind === "approve" ? "Device approved. Review its local connection before sharing." : "Device retired. Review affected clipboard key rotation."); }} />)}</ul>
      </details>
      <details className="shared-device-review"><summary>{status.recoveryReady ? "Recovery code and encrypted snapshot" : "Set up recovery"}</summary>
        <p>Store the recovery code outside Copicu. The service keeps encrypted keys and cannot decrypt them. It is not a backup of your local clipboard history. Keys created on another PC appear after an approved PC with the code updates the snapshot.</p>
        {status.recoveryReady && !status.localRecoveryCode ? <>
          <UiTextInput label="Existing recovery code" type="password" value={recoveryInput} disabled={busy} autoComplete="off" spellCheck={false} onChange={event => setRecoveryInput(event.currentTarget.value)} />
          <UiButton type="button" size="compact-sm" disabled={busy || !recoveryInput.trim()} onClick={() => act(async () => { const next = await api.setupRecovery(recoveryInput); setRecoveryInput(""); return next; }, "Encrypted recovery snapshot updated.")}>Update recovery snapshot</UiButton>
        </> : <UiButton type="button" size="compact-sm" disabled={busy} onClick={() => act(() => api.setupRecovery(), "Store this code outside Copicu before closing it.")}>{status.recoveryReady ? "Show code and update snapshot" : "Generate recovery code"}</UiButton>}
        {shownCode && <div className="shared-recovery-code"><label className="shared-fingerprint-label">Keep this code private<code>{shownCode.match(/.{1,8}/g)?.join(" ")}</code></label><p>Anyone with this code and your account login can recover your content keys. Copicu does not copy it to the clipboard.</p><UiButton type="button" size="compact-sm" variant="default" onClick={() => setShownCode(null)}>I stored the code, hide it</UiButton></div>}
      </details>
    </>}
    {state === "offline" && <UiButton type="button" size="compact-sm" variant="default" disabled={busy} onClick={() => act(api.status)}>Retry service connection</UiButton>}
    {state === "revoked" && <p>Sign in again to request a new device identity in this profile. Approval or recovery is required. Local copies stay; previous connections and effects are not reactivated.</p>}
    {(error || status?.error) && <p className="shared-error" role="alert">{error ?? status?.error}</p>}
    {notice && <p className="shared-inline-notice" role="status">{notice}</p>}
  </section>;
}
