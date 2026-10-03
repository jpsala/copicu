import { invoke } from "@tauri-apps/api/core";

export type SharedDevice = { deviceId: string; personId: string; name: string; state: "pending" | "active" | "revoked" | "expired"; fingerprint: string };
export type SharedIdentityStatus = {
  state: "unconfigured" | "technical" | "waiting" | "pending" | "active" | "offline" | "expired" | "cancelled" | "revoked";
  previousState?: SharedIdentityStatus["state"];
  endpoint?: string;
  name?: string;
  deviceId?: string;
  personId?: string;
  revision?: string;
  fingerprint?: string;
  devices: SharedDevice[];
  recoveryReady?: boolean;
  localRecoveryCode?: boolean;
  error?: string;
  code?: string;
};
export type DeviceIntent = { kind: "approve" | "revoke"; operationId: string; deviceId: string; fingerprint: string; expectedRevision: string };
const command = (input: unknown) => invoke<SharedIdentityStatus>("shared_clipboard_identity", { input });
export const sharedIdentityApi = {
  status: () => command({ kind: "status" }),
  start: (name: string) => command({ kind: "start", name }),
  cancel: () => command({ kind: "cancel" }),
  reopen: () => command({ kind: "reopen" }),
  device: (intent: DeviceIntent) => command(intent),
  setupRecovery: (code?: string) => command({ kind: "setupRecovery", code: code?.trim() || null }),
  recover: (code: string, operationId: string) => command({ kind: "recover", code, operationId }),
};
export type SharedIdentityApi = typeof sharedIdentityApi;
export function sharingIdentityMessage(status: SharedIdentityStatus): string {
  switch (status.state) {
    case "waiting": return "Complete sign-in in your system browser, then return here.";
    case "pending": return "On an approved PC, open Settings → Sharing → Devices. Compare this fingerprint on both PCs before approving.";
    case "offline": return "The sharing service is unreachable. Your local clipboard remains available. Retry when the connection returns.";
    case "expired": return "Sign-in or approval expired. Start sign-in again to request access.";
    case "revoked": return "This device was retired or its access expired. Sharing is stopped; downloaded copies remain local.";
    case "technical": return "This profile uses technical enrollment. It does not have an account sign-in.";
    case "active": return "This device is approved. Connect a clipboard to choose what it sends and receives.";
    default: return "Use the same account and service on your PCs. The first PC creates your private space; another PC needs its approval.";
  }
}
