import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type Event } from "@tauri-apps/api/event";
import Minus from "lucide-react/dist/esm/icons/minus.mjs";
import Plus from "lucide-react/dist/esm/icons/plus.mjs";
import RotateCcw from "lucide-react/dist/esm/icons/rotate-ccw.mjs";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { UiAlert, UiIconButton, UiTooltip } from "../ui/controls";
import { CustomWindowFrame } from "../ui/window/CustomWindowFrame";

const ITEM_PREVIEW_OPEN_EVENT = "copicu://item-preview/open";
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 8;
const ZOOM_STEP = 0.25;

type ItemPreviewPayload = {
  itemId: number;
  contentKind: string;
  text: string;
  mimePrimary: string | null;
  thumbnailDataUrl: string | null;
  width: number | null;
  height: number | null;
  title: string | null;
};

type PanPoint = { x: number; y: number };

function isTauriRuntime() {
  return Boolean((window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);
}

export function ItemPreviewWindowApp() {
  const [payload, setPayload] = useState<ItemPreviewPayload | null>(null);
  const [fullImageUrl, setFullImageUrl] = useState<string | null>(null);
  const [imageLoading, setImageLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<PanPoint>({ x: 0, y: 0 });
  const dragRef = useRef<{ pointerId: number; origin: PanPoint; start: PanPoint } | null>(null);

  const resetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const applyPayload = useCallback((next: ItemPreviewPayload | null) => {
    if (!next) {
      return;
    }
    setPayload(next);
    setFullImageUrl(null);
    setError(null);
    resetView();
  }, [resetView]);

  useEffect(() => {
    document.body.classList.add("item-preview-window");
    return () => document.body.classList.remove("item-preview-window");
  }, []);

  useEffect(() => {
    if (!isTauriRuntime()) {
      applyPayload({
        itemId: 1,
        contentKind: "text",
        text: "# Full item preview\n\nMarkdown is rendered locally.\n\n- Complete text\n- No remote images\n- One reusable preview window",
        mimePrimary: "text/markdown",
        thumbnailDataUrl: null,
        width: null,
        height: null,
        title: "Synthetic preview",
      });
      return undefined;
    }

    let active = true;
    let unlisten: (() => void) | null = null;
    void invoke<ItemPreviewPayload | null>("pending_item_preview")
      .then((pending) => {
        if (active) applyPayload(pending);
      })
      .catch((loadError) => {
        if (active) setError(String(loadError));
      });
    void listen<ItemPreviewPayload>(ITEM_PREVIEW_OPEN_EVENT, (event: Event<ItemPreviewPayload>) => {
      if (active) applyPayload(event.payload);
    }).then((cleanup) => {
      unlisten = cleanup;
    });

    return () => {
      active = false;
      unlisten?.();
    };
  }, [applyPayload]);

  useEffect(() => {
    if (!payload || payload.contentKind !== "image" || !isTauriRuntime()) {
      return undefined;
    }
    let active = true;
    setImageLoading(true);
    void invoke<string>("load_item_preview_image", { itemId: payload.itemId })
      .then((dataUrl) => {
        if (active) setFullImageUrl(dataUrl);
      })
      .catch((loadError) => {
        if (active) setError(String(loadError));
      })
      .finally(() => {
        if (active) setImageLoading(false);
      });
    return () => {
      active = false;
    };
  }, [payload]);

  const setBoundedZoom = useCallback((next: number) => {
    setZoom(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next)));
  }, []);

  const onImageWheel = useCallback((event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    setZoom((current) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, current + (event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP))));
  }, []);

  const beginPan = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (zoom <= 1 || event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      origin: { x: event.clientX, y: event.clientY },
      start: pan,
    };
  }, [pan, zoom]);

  const movePan = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setPan({
      x: drag.start.x + event.clientX - drag.origin.x,
      y: drag.start.y + event.clientY - drag.origin.y,
    });
  }, []);

  const endPan = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  }, []);

  const isMarkdown = payload?.mimePrimary?.toLocaleLowerCase().includes("markdown") ?? false;
  const imageUrl = fullImageUrl ?? payload?.thumbnailDataUrl ?? null;

  return (
    <CustomWindowFrame title="Copicu Preview" variant="document">
      <main className="item-preview-app">
        <header className="item-preview-toolbar">
          <div>
            <strong>{payload?.title?.trim() || (payload?.contentKind === "image" ? "Image preview" : isMarkdown ? "Markdown preview" : "Text preview")}</strong>
            {payload?.contentKind === "image" && payload.width && payload.height ? (
              <span>{payload.width} × {payload.height}px</span>
            ) : null}
          </div>
          {payload?.contentKind === "image" ? (
            <div className="item-preview-zoom-controls" aria-label="Image zoom controls">
              <UiTooltip label="Zoom out">
                <UiIconButton aria-label="Zoom out" variant="default" onClick={() => setBoundedZoom(zoom - ZOOM_STEP)}>
                  <Minus size={15} />
                </UiIconButton>
              </UiTooltip>
              <span aria-live="polite">{Math.round(zoom * 100)}%</span>
              <UiTooltip label="Reset zoom and pan">
                <UiIconButton aria-label="Reset zoom and pan" variant="default" onClick={resetView}>
                  <RotateCcw size={15} />
                </UiIconButton>
              </UiTooltip>
              <UiTooltip label="Zoom in">
                <UiIconButton aria-label="Zoom in" variant="default" onClick={() => setBoundedZoom(zoom + ZOOM_STEP)}>
                  <Plus size={15} />
                </UiIconButton>
              </UiTooltip>
            </div>
          ) : null}
        </header>
        {error ? <UiAlert className="item-preview-error" color="red" variant="light">{error}</UiAlert> : null}
        <section className="item-preview-content" aria-label="Full item preview">
          {!payload ? (
            <p className="item-preview-empty">Hover an item to preview it.</p>
          ) : payload.contentKind === "image" ? (
            <div
              className={`item-preview-image-stage${zoom > 1 ? " is-pannable" : ""}`}
              onWheel={onImageWheel}
              onPointerDown={beginPan}
              onPointerMove={movePan}
              onPointerUp={endPan}
              onPointerCancel={endPan}
            >
              {imageUrl ? (
                <img
                  src={imageUrl}
                  alt="Full clipboard item"
                  draggable={false}
                  data-resolution={fullImageUrl ? "full" : "thumbnail"}
                  style={{ transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})` }}
                />
              ) : (
                <p>Image unavailable.</p>
              )}
              {imageLoading && !fullImageUrl ? <span className="item-preview-loading">Loading full resolution…</span> : null}
            </div>
          ) : isMarkdown ? (
            <article className="item-preview-markdown">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                skipHtml
                components={{
                  img: ({ alt }) => <span className="item-preview-remote-media">Remote image blocked{alt ? `: ${alt}` : ""}</span>,
                  a: ({ children }) => <span className="item-preview-link-text">{children}</span>,
                }}
              >
                {payload.text}
              </ReactMarkdown>
            </article>
          ) : (
            <pre className="item-preview-text">{payload.text}</pre>
          )}
        </section>
      </main>
    </CustomWindowFrame>
  );
}
