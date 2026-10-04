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
  keyCustody?: "service" | "endToEnd";
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
    case "pending": return "The service is updating account access. Check sign-in again when it returns.";
    case "offline": return "The sharing service is unreachable. Your local clipboard remains available. Retry when the connection returns.";
    case "expired": return "Sign-in expired. Start sign-in again to link this PC.";
    case "revoked": return "This device was retired or its access expired. Sharing is stopped; downloaded copies remain local.";
    case "technical": return "This profile uses technical enrollment. It does not have an account sign-in.";
    case "active": return "This PC is linked to your account. Connect a clipboard to choose what it sends and receives.";
    default: return "Sign in with Google to share clipboards across your PCs.";
  }
}
