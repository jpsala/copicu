import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";

function isTauriRuntime() {
  return Boolean((window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);
}

export function recordWindowChromeEvent(event: string, detail?: string) {
  if (!isTauriRuntime()) {
    return Promise.resolve();
  }
  const diagnostic = invoke("record_renderer_diagnostic", {
    event,
    detail: detail ?? null,
  }).catch((error) => {
    console.warn("window chrome diagnostic failed", error);
  });
  return Promise.race([
    diagnostic,
    new Promise<void>((resolve) => window.setTimeout(resolve, 250)),
  ]);
}

export async function readWindowPinState(defaultValue = false): Promise<boolean> {
  if (!isTauriRuntime()) {
    return defaultValue;
  }
  return getCurrentWindow().isAlwaysOnTop().catch(() => defaultValue);
}

export async function readWindowMaximizedState(defaultValue = false): Promise<boolean> {
  if (!isTauriRuntime()) {
    return defaultValue;
  }
  return getCurrentWindow().isMaximized().catch(() => defaultValue);
}

export async function setWindowPinned(pinned: boolean): Promise<void> {
  if (!isTauriRuntime()) {
    return;
  }
  await getCurrentWindow().setAlwaysOnTop(pinned);
}

export async function minimizeCurrentWindow(): Promise<void> {
  if (!isTauriRuntime()) {
    return;
  }
  await getCurrentWindow().minimize();
}

export async function toggleCurrentWindowMaximized(): Promise<boolean> {
  if (!isTauriRuntime()) {
    return false;
  }
  const window = getCurrentWindow();
  await window.toggleMaximize();
  return window.isMaximized();
}

export async function closeCurrentWindow(): Promise<void> {
  if (!isTauriRuntime()) {
    return;
  }
  await getCurrentWindow().close();
}

export async function startCurrentWindowDrag(): Promise<void> {
  if (!isTauriRuntime()) {
    return;
  }
  void recordWindowChromeEvent("drag-start-request");
  try {
    await getCurrentWindow().startDragging();
    void recordWindowChromeEvent("drag-start-returned");
  } catch (error) {
    void recordWindowChromeEvent("drag-start-error", String(error));
    throw error;
  }
}
