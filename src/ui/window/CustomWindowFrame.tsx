import { type ReactNode, useCallback } from "react";
import { WindowControls } from "./WindowControls";
import { startCurrentWindowDrag } from "./windowChrome";
import {
  DEFAULT_WINDOW_CONTROLS,
  type CustomWindowVariant,
  type WindowControlId,
} from "./windowVariants";

type CustomWindowFrameProps = {
  children: ReactNode;
  closeLabel?: string;
  controls?: WindowControlId[];
  hideLabel?: string;
  onHide?: () => void;
  title: string;
  variant: CustomWindowVariant;
};

export function CustomWindowFrame({
  children,
  closeLabel,
  controls,
  hideLabel,
  onHide,
  title,
  variant,
}: CustomWindowFrameProps) {
  const windowControls = controls ?? DEFAULT_WINDOW_CONTROLS[variant];

  return (
    <div className={`custom-window-frame is-${variant}`} aria-label={title}>
      <div className="window-chrome">
        <WindowDragStrip title={title} />
        <WindowControls
          closeLabel={closeLabel}
          controls={windowControls}
          hideLabel={hideLabel}
          onHide={onHide}
        />
      </div>
      <div className="window-frame-content">{children}</div>
    </div>
  );
}

export function WindowDragStrip({ title }: { title: string }) {
  const startDragging = useCallback(() => {
    startCurrentWindowDrag().catch((error) => {
      console.warn("window drag failed", error);
    });
  }, []);

  return (
    <button
      type="button"
      className="window-drag-strip"
      aria-label={`Move ${title}`}
      onMouseDown={(event) => {
        if (event.button !== 0) {
          return;
        }
        event.preventDefault();
        startDragging();
      }}
    >
      <span aria-hidden="true" />
      <span aria-hidden="true" />
      <span aria-hidden="true" />
    </button>
  );
}
