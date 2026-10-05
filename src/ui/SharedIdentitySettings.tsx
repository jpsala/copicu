import { useEffect, useRef, useState } from "react";
import { sharedIdentityApi, sharingIdentityMessage, type DeviceIntent, type SharedDevice, type SharedIdentityApi, type SharedIdentityStatus } from "../shared/sharedIdentity";
import { UiButton, UiCheckbox, UiTextInput } from "./controls";

function DeviceRow({ device, current, revision, busy, onRetire }: { device: SharedDevice; current: boolean; revision: string; busy: boolean; onRetire: (intent: DeviceIntent) => Promise<void> }) {
  const [retiring, setRetiring] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const operation = useRef<DeviceIntent | null>(null);
  const retire = async () => {
    operation.current ??= { kind: "revoke", operationId: crypto.randomUUID().replaceAll("-", ""), deviceId: device.deviceId, fingerprint: device.fingerprint, expectedRevision: revision };
    try { await onRetire(operation.current); operation.current = null; setRetiring(false); }
    catch (error) { if (/changed|refresh/i.test(String(error))) operation.current = null; }
  };
  return <li className="shared-device-row">
    <div><strong>{device.name}{current ? " · This PC" : ""}</strong><span>{({ pending: "Linking", active: "Linked", revoked: "Retired", expired: "Sign-in expired" })[device.state]}</span></div>
    {["pending", "active"].includes(device.state) && <>
      {!retiring ? <UiButton type="button" size="compact-sm" variant="subtle" disabled={busy} onClick={() => setRetiring(true)}>Retire device…</UiButton> : <div className="shared-settings-group">
        <p>Stops future access on {device.name}. Downloaded copies remain. Affected clipboards need key rotation before sending can resume.</p>
        <UiCheckbox label="I want to stop this device's access" checked={confirmed} disabled={busy} onChange={event => setConfirmed(event.currentTarget.checked)} />
        <div className="shared-settings-actions"><UiButton type="button" size="compact-sm" disabled={busy || !confirmed} onClick={() => void retire()}>Retire device</UiButton><UiButton type="button" variant="default" size="compact-sm" disabled={busy} onClick={() => { setRetiring(false); setConfirmed(false); }}>Cancel retirement</UiButton></div>
      </div>}
    </>}
  </li>;
}

export function SharedIdentitySettings({ api = sharedIdentityApi, onChanged, onConnect }: { api?: SharedIdentityApi; onChanged?: (status: SharedIdentityStatus) => void; onConnect?: () => void }) {
  const [status, setStatus] = useState<SharedIdentityStatus | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const mutation = useRef(false), checking = useRef(false), version = useRef(0), mounted = useRef(true);
  const accept = (next: SharedIdentityStatus) => {
    if (!mounted.current) return;
    const { code: _legacyCode, ...safe } = next;
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
  const act = (work: () => Promise<SharedIdentityStatus>) => { void run(work).catch(() => {}); };
  const state = status?.state;
  const initial = ["unconfigured", "cancelled", "expired", "revoked"].includes(state ?? "");
  const waiting = state === "waiting" || (state === "offline" && status?.previousState === "waiting");
  const pending = state === "pending" || (state === "offline" && status?.previousState === "pending");
  if (state === "technical") return <p className="shared-inline-notice">Synthetic service profile. Account sign-in is not configured for this technical enrollment.</p>;
  return <section className="shared-settings-group shared-identity" aria-label="Device sign-in">
    <h3>{state === "active" ? "Account and this PC" : "Link this device"}</h3>
    {!status ? <p role="status">Checking device sign-in…</p> : <p>{sharingIdentityMessage(status)}</p>}
    {initial && <>
      <UiTextInput label="Name of this PC" placeholder="Work PC" value={name} disabled={busy} maxLength={80} autoComplete="off" onChange={event => setName(event.currentTarget.value)} />
      <UiButton type="button" size="compact-sm" loading={busy} disabled={busy || !name.trim()} onClick={() => act(() => api.start(name.trim()))}>Sign in with Google</UiButton>
      <p>Use the same Google account on your PCs. Signing in does not share existing history or turn on Windows clipboard updates.</p>
    </>}
    {(waiting || pending) && <>
      <p>{status?.name}</p>
      <div className="shared-settings-actions">{waiting && <UiButton type="button" variant="default" size="compact-sm" disabled={busy} onClick={() => act(api.reopen)}>Open sign-in again</UiButton>}<UiButton type="button" variant="default" size="compact-sm" disabled={busy} onClick={() => act(api.status)}>Check sign-in</UiButton><UiButton type="button" variant="subtle" size="compact-sm" disabled={busy} onClick={() => act(api.cancel)}>Cancel linking</UiButton></div>
    </>}
    {status && state === "active" && <>
      <p><strong>{status.name}</strong> · This PC</p>
      {onConnect && <UiButton type="button" size="compact-sm" variant="default" onClick={onConnect}>Create or connect a clipboard…</UiButton>}
      <details className="shared-device-review"><summary>Devices ({status.devices.filter(d => d.state === "active").length} linked)</summary>
        <p>Each PC has the same account access. Its folder connections and clipboard updates are configured separately.</p>
        <ul className="shared-device-list" aria-label="Account devices">{status.devices.map(device => <DeviceRow key={device.deviceId + ":" + device.fingerprint} device={device} current={device.deviceId === status.deviceId} revision={status.revision ?? ""} busy={busy} onRetire={async intent => { await run(() => api.device(intent), "Device retired. Review affected clipboard key rotation."); }} />)}</ul>
      </details>
    </>}
    {(initial || status?.keyCustody === "service") && <details className="shared-custody-notice"><summary>How your shared content is protected</summary><p>Copicu Sharing manages your content keys so you can sign in on another PC without a code or device approval. Content is encrypted in transit and storage; the service can decrypt it.</p></details>}
    {state === "active" && status?.keyCustody === "endToEnd" && <p className="shared-inline-notice">The service is being updated for account access. Refresh after the update to link PCs without approvals.</p>}
    {state === "offline" && <UiButton type="button" size="compact-sm" variant="default" disabled={busy} onClick={() => act(api.status)}>Retry service connection</UiButton>}
    {state === "revoked" && <p>Sign in again with this profile's original account. Local copies stay; previous connections and effects are not reactivated.</p>}
    {(error || status?.error) && <p className="shared-error" role="alert">{error ?? status?.error}</p>}
    {state === "offline" && status?.endpoint && <p className="shared-inline-notice">Service: {status.endpoint}</p>}
    {notice && <p className="shared-inline-notice" role="status">{notice}</p>}
  </section>;
}
