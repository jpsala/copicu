import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { emitTo } from "@tauri-apps/api/event";

const MAIN_WINDOW_LABEL = "main";
const PICKER_PIN_STATE_EVENT = "copicu://picker/pin-state";

export type WindowResizeDirection =
  | "East"
  | "North"
  | "NorthEast"
  | "NorthWest"
  | "South"
  | "SouthEast"
  | "SouthWest"
  | "West";

function isTauriRuntime() {
  return Boolean((window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);
}

function testWindowPinState(): boolean | null {
  const testWindow = window as Window & { __copicuTestWindowPinned?: boolean };
  return typeof testWindow.__copicuTestWindowPinned === "boolean" ? testWindow.__copicuTestWindowPinned : null;
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
  const testPinned = testWindowPinState();
  if (testPinned !== null) {
    return testPinned;
  }
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
  const testWindow = window as Window & { __copicuTestWindowPinned?: boolean };
  if (typeof testWindow.__copicuTestWindowPinned === "boolean") {
    testWindow.__copicuTestWindowPinned = pinned;
    return;
  }
  if (!isTauriRuntime()) {
    return;
  }
  await getCurrentWindow().setAlwaysOnTop(pinned);
  await emitTo(MAIN_WINDOW_LABEL, PICKER_PIN_STATE_EVENT, pinned).catch(() => undefined);
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

export async function startCurrentWindowResize(direction: WindowResizeDirection): Promise<void> {
  if (!isTauriRuntime()) {
    return;
  }
  void recordWindowChromeEvent("resize-start-request", direction);
  try {
    await getCurrentWindow().startResizeDragging(direction);
    void recordWindowChromeEvent("resize-start-returned", direction);
  } catch (error) {
    void recordWindowChromeEvent("resize-start-error", `${direction}: ${String(error)}`);
    throw error;
  }
}
