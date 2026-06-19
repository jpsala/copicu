import { type CSSProperties } from "react";
import { createPortal } from "react-dom";
import type { ToastItem } from "../shared/contracts";

export function ToastStack({
  toasts,
  onDismiss,
}: {
  toasts: ToastItem[];
  onDismiss: (id: number) => void;
}) {
  if (toasts.length === 0) {
    return null;
  }

  return createPortal(
    <ol className="toast-stack" aria-live="polite" aria-label="Notifications">
      {[...toasts].reverse().map((toast) => (
        <li
          key={toast.id}
          className={`toast-item toast-${toast.tone}`}
          style={
            { "--toast-duration": `${toast.durationMs}ms` } as CSSProperties &
              Record<"--toast-duration", string>
          }
        >
          <div>
            {toast.title ? <strong>{toast.title}</strong> : null}
            <p>{toast.message}</p>
          </div>
          <button
            type="button"
            aria-label="Dismiss notification"
            onClick={() => onDismiss(toast.id)}
          >
            ×
          </button>
        </li>
      ))}
    </ol>,
    document.body,
  );
}
