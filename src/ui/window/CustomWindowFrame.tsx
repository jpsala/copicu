import { type ReactNode, useCallback } from "react";
import { WindowControls } from "./WindowControls";
import {
  startCurrentWindowDrag,
  startCurrentWindowResize,
  type WindowResizeDirection,
} from "./windowChrome";
import {
  DEFAULT_WINDOW_CONTROLS,
  DEFAULT_WINDOW_RESIZABLE,
  type CustomWindowVariant,
  type WindowControlId,
} from "./windowVariants";

type CustomWindowFrameProps = {
  children: ReactNode;
  closeLabel?: string;
  controls?: WindowControlId[];
  hideLabel?: string;
  onHide?: () => void;
  resizable?: boolean;
  title: string;
  variant: CustomWindowVariant;
};

export function CustomWindowFrame({
  children,
  closeLabel,
  controls,
  hideLabel,
  onHide,
  resizable,
  title,
  variant,
}: CustomWindowFrameProps) {
  const windowControls = controls ?? DEFAULT_WINDOW_CONTROLS[variant];
  const canResize = resizable ?? DEFAULT_WINDOW_RESIZABLE[variant];

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
      {canResize ? <WindowResizeHandles /> : null}
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

const RESIZE_HANDLES: Array<{ direction: WindowResizeDirection; className: string }> = [
  { direction: "North", className: "is-north" },
  { direction: "South", className: "is-south" },
  { direction: "East", className: "is-east" },
  { direction: "West", className: "is-west" },
  { direction: "NorthEast", className: "is-north-east" },
  { direction: "NorthWest", className: "is-north-west" },
  { direction: "SouthEast", className: "is-south-east" },
  { direction: "SouthWest", className: "is-south-west" },
];

function WindowResizeHandles() {
  const startResize = useCallback((direction: WindowResizeDirection) => {
    startCurrentWindowResize(direction).catch((error) => {
      console.warn("window resize failed", error);
    });
  }, []);

  return (
    <div className="window-resize-handles" aria-hidden="true">
      {RESIZE_HANDLES.map((handle) => (
        <div
          key={handle.direction}
          className={`window-resize-handle ${handle.className}`}
          onMouseDown={(event) => {
            if (event.button !== 0) {
              return;
            }
            event.preventDefault();
            event.stopPropagation();
            startResize(handle.direction);
          }}
        />
      ))}
    </div>
  );
}
