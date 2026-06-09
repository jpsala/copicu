import { Maximize2, Minimize2, Minus, Pin, PinOff, X } from "lucide-react";
import { type MouseEvent, useCallback, useEffect, useState } from "react";
import { UiIconButton, UiTooltip } from "../controls";
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

type WindowControlsProps = {
  closeLabel?: string;
  controls: WindowControlId[];
  hideLabel?: string;
  onHide?: () => void;
};

export function WindowControls({
  closeLabel = "Close",
  controls,
  hideLabel = "Hide",
  onHide,
}: WindowControlsProps) {
  const [isPinned, setIsPinned] = useState(true);
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    if (controls.includes("pin")) {
      void readWindowPinState(true).then(setIsPinned);
    }
    if (controls.includes("maximize")) {
      void readWindowMaximizedState(false).then(setIsMaximized);
    }
  }, [controls]);

  const preventDrag = useCallback((event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
  }, []);

  const handlePin = useCallback(() => {
    const nextPinned = !isPinned;
    setWindowPinned(nextPinned)
      .then(() => setIsPinned(nextPinned))
      .catch((error) => {
        console.warn("window pin toggle failed", error);
      });
  }, [isPinned]);

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
        <UiTooltip label={isPinned ? "Unpin from top" : "Pin on top"}>
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
