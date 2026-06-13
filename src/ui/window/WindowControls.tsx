import Maximize2 from "lucide-react/dist/esm/icons/maximize-2.mjs";
import Minimize2 from "lucide-react/dist/esm/icons/minimize-2.mjs";
import Minus from "lucide-react/dist/esm/icons/minus.mjs";
import LockKeyhole from "lucide-react/dist/esm/icons/lock-keyhole.mjs";
import UnlockKeyhole from "lucide-react/dist/esm/icons/unlock-keyhole.mjs";
import Pin from "lucide-react/dist/esm/icons/pin.mjs";
import PinOff from "lucide-react/dist/esm/icons/pin-off.mjs";
import X from "lucide-react/dist/esm/icons/x.mjs";
import { type MouseEvent, useCallback, useEffect, useState } from "react";
import { listen, type Event } from "@tauri-apps/api/event";
import { UiIconButton, UiTooltip } from "../controls";
import { ShortcutBadge } from "../ShortcutBadge";
import {
  closeCurrentWindow,
  minimizeCurrentWindow,
  recordWindowChromeEvent,
  readWindowMaximizedState,
  readWindowPinState,
  setWindowPinned,
  toggleCurrentWindowMaximized,
} from "./windowChrome";
import type { WindowControlId } from "./windowVariants";

const PICKER_PIN_STATE_EVENT = "copicu://picker/pin-state";

type WindowControlsProps = {
  closeLabel?: string;
  controls: WindowControlId[];
  hideLabel?: string;
  keepOpen?: boolean;
  onHide?: () => void;
  onKeepOpenChange?: (keepOpen: boolean) => void;
  onPinChange?: (pinned: boolean) => void;
  pinShortcutLabel?: string;
};

export function WindowControls({
  closeLabel = "Close",
  controls,
  hideLabel = "Hide",
  keepOpen = false,
  onHide,
  onKeepOpenChange,
  onPinChange,
  pinShortcutLabel,
}: WindowControlsProps) {
  const [isPinned, setIsPinned] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const hasPinControl = controls.includes("pin");
  const hasMaximizeControl = controls.includes("maximize");

  useEffect(() => {
    if (hasPinControl) {
      void readWindowPinState(false).then((pinned) => {
        setIsPinned(pinned);
        onPinChange?.(pinned);
      });
    }
    if (hasMaximizeControl) {
      void readWindowMaximizedState(false).then(setIsMaximized);
    }
  }, [hasMaximizeControl, hasPinControl, onPinChange]);

  useEffect(() => {
    if (!hasPinControl) {
      return undefined;
    }

    let active = true;
    let unlisten: (() => void) | null = null;
    void listen<boolean>(PICKER_PIN_STATE_EVENT, (event: Event<boolean>) => {
      if (!active) {
        return;
      }
      setIsPinned(event.payload);
      onPinChange?.(event.payload);
    }).then((cleanup) => {
      unlisten = cleanup;
    });

    return () => {
      active = false;
      unlisten?.();
    };
  }, [hasPinControl, onPinChange]);

  const preventDrag = useCallback((event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
  }, []);

  const handlePin = useCallback(() => {
    const nextPinned = !isPinned;
    setIsPinned(nextPinned);
    onPinChange?.(nextPinned);
    setWindowPinned(nextPinned)
      .catch((error) => {
        setIsPinned(isPinned);
        onPinChange?.(isPinned);
        console.warn("window pin toggle failed", error);
      });
  }, [isPinned, onPinChange]);

  const handleKeepOpen = useCallback(() => {
    onKeepOpenChange?.(!keepOpen);
  }, [keepOpen, onKeepOpenChange]);

  const handleMinimize = useCallback(() => {
    minimizeCurrentWindow().catch((error) => {
      console.warn("window minimize failed", error);
    });
  }, []);

  const handleMaximize = useCallback(() => {
    toggleCurrentWindowMaximized()
      .then(setIsMaximized)
      .catch((error) => {
        console.warn("window maximize toggle failed", error);
      });
  }, []);

  const handleClose = useCallback(() => {
    void recordWindowChromeEvent("window-control-close-click");
    closeCurrentWindow().catch((error) => {
      void recordWindowChromeEvent("window-control-close-error", String(error));
      console.warn("window close failed", error);
    });
  }, []);

  const handleHide = useCallback(() => {
    void recordWindowChromeEvent("window-control-hide-click");
    try {
      onHide?.();
      void recordWindowChromeEvent("window-control-hide-dispatched");
    } catch (error) {
      void recordWindowChromeEvent("window-control-hide-error", String(error));
      throw error;
    }
  }, [onHide]);

  if (controls.length === 0) {
    return null;
  }

  return (
    <div className="window-controls" aria-label="Window controls">
      {controls.includes("pin") ? (
        <UiTooltip
          label={(
            <span className="tooltip-shortcut-label">
              <span>{isPinned ? "Unpin from top" : "Pin on top"}</span>
              <ShortcutBadge shortcut={pinShortcutLabel} />
            </span>
          )}
        >
          <UiIconButton
            type="button"
            className="window-control-button"
            aria-label={isPinned ? "Unpin window from top" : "Pin window on top"}
            aria-pressed={isPinned}
            onMouseDown={preventDrag}
            onClick={handlePin}
          >
            {isPinned ? <PinOff size={14} /> : <Pin size={14} />}
          </UiIconButton>
        </UiTooltip>
      ) : null}
      {controls.includes("keep-open") ? (
        <UiTooltip label={keepOpen ? "Keep open is on" : "Keep open is off"}>
          <UiIconButton
            type="button"
            className="window-control-button is-keep-open"
            aria-label={keepOpen ? "Keep picker open is on" : "Keep picker open is off"}
            aria-pressed={keepOpen}
            onMouseDown={preventDrag}
            onClick={handleKeepOpen}
          >
            {keepOpen ? <LockKeyhole size={14} /> : <UnlockKeyhole size={14} />}
          </UiIconButton>
        </UiTooltip>
      ) : null}
      {controls.includes("minimize") ? (
        <UiTooltip label="Minimize">
          <UiIconButton
            type="button"
            className="window-control-button"
            aria-label="Minimize window"
            onMouseDown={preventDrag}
            onClick={handleMinimize}
          >
            <Minus size={15} strokeWidth={2.4} />
          </UiIconButton>
        </UiTooltip>
      ) : null}
      {controls.includes("maximize") ? (
        <UiTooltip label={isMaximized ? "Restore" : "Maximize"}>
          <UiIconButton
            type="button"
            className="window-control-button"
            aria-label={isMaximized ? "Restore window" : "Maximize window"}
            onMouseDown={preventDrag}
            onClick={handleMaximize}
          >
            {isMaximized ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </UiIconButton>
        </UiTooltip>
      ) : null}
      {controls.includes("hide") ? (
        <UiTooltip label={hideLabel}>
          <UiIconButton
            type="button"
            className="window-control-button is-close"
            aria-label={hideLabel}
            onMouseDown={preventDrag}
            onClick={handleHide}
          >
            <X size={15} strokeWidth={2.4} />
          </UiIconButton>
        </UiTooltip>
      ) : null}
      {controls.includes("close") ? (
        <UiTooltip label={closeLabel}>
          <UiIconButton
            type="button"
            className="window-control-button is-close"
            aria-label={closeLabel}
            onMouseDown={preventDrag}
            onClick={handleClose}
          >
            <X size={15} strokeWidth={2.4} />
          </UiIconButton>
        </UiTooltip>
      ) : null}
    </div>
  );
}
