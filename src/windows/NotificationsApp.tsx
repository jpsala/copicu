import { useCallback, useEffect, useRef, useState } from "react";
import { LogicalSize } from "@tauri-apps/api/dpi";
import { listen, type Event } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { ToastItem } from "../shared/contracts";
import { ToastStack } from "../ui/ToastStack";

const DEFAULT_TOAST_DURATION_MS = 3600;
const NOTIFICATION_TOAST_EVENT = "copicu://toast";
const NOTIFICATIONS_WINDOW_WIDTH = 340;
const NOTIFICATION_ROW_HEIGHT = 78;
const NOTIFICATIONS_WINDOW_CHROME = 10;
const NOTIFICATIONS_WINDOW_MAX_HEIGHT = 430;

function isTauriRuntime() {
  return Boolean((window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);
}

export function NotificationsApp() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextToastIdRef = useRef(1);

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  useEffect(() => {
    document.body.classList.add("notifications-window");
    return () => {
      document.body.classList.remove("notifications-window");
    };
  }, []);

  useEffect(() => {
    if (!isTauriRuntime()) {
      return;
    }

    const windowHandle = getCurrentWindow();
    if (toasts.length > 0) {
      const nextHeight = Math.min(
        NOTIFICATIONS_WINDOW_MAX_HEIGHT,
        NOTIFICATIONS_WINDOW_CHROME + toasts.length * NOTIFICATION_ROW_HEIGHT,
      );
      void windowHandle.setSize(new LogicalSize(NOTIFICATIONS_WINDOW_WIDTH, nextHeight));
      void windowHandle.show();
    } else {
      void windowHandle.hide();
    }
  }, [toasts.length]);

  useEffect(() => {
    if (!isTauriRuntime()) {
      return undefined;
    }

    let active = true;
    let unlisten: (() => void) | null = null;

    void listen<ToastItem>(NOTIFICATION_TOAST_EVENT, (event: Event<ToastItem>) => {
      if (!active) {
        return;
      }

      const toast = {
        ...event.payload,
        id: event.payload.id || nextToastIdRef.current++,
        tone: event.payload.tone ?? "info",
        durationMs: event.payload.durationMs ?? DEFAULT_TOAST_DURATION_MS,
      };

      setToasts((current) => [...current, toast]);
      if (toast.durationMs > 0) {
        window.setTimeout(() => dismissToast(toast.id), toast.durationMs);
      }
    }).then((value) => {
      unlisten = value;
    });

    return () => {
      active = false;
      unlisten?.();
    };
  }, [dismissToast]);

  return <ToastStack toasts={toasts} onDismiss={dismissToast} />;
}
