import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { FOLDER_SIDEBAR_MIN, folderSidebarMaximum, normalizeFolderSidebarWidth } from "../shared/settings";

/** Window clamps affect layout only, never the durable preference. */
export function FolderSidebarLayout({ preferredWidth, open, onCommit, children }: {
  preferredWidth: number;
  open: boolean;
  onCommit: (width: number) => Promise<void>;
  children: ReactNode;
}) {
  const body = useRef<HTMLDivElement>(null);
  const separator = useRef<HTMLDivElement>(null);
  const [space, setSpace] = useState({ width: 0, narrow: window.innerWidth <= 560 });
  const [draft, setDraft] = useState<number | null>(null);
  const draftRef = useRef<number | null>(null);
  const gesture = useRef<{ pointerId: number | null; startX: number; startWidth: number; previous: number | null } | null>(null);
  const revision = useRef(0);
  const alive = useRef(true);
  const maximum = folderSidebarMaximum(space.width);
  const effective = Math.min(maximum, draft ?? normalizeFolderSidebarWidth(preferredWidth));
  const available = open && !space.narrow;

  function change(width: number) {
    revision.current++;
    draftRef.current = width;
    setDraft(width);
  }
  function cancel() {
    const active = gesture.current;
    if (!active) return;
    gesture.current = null;
    change(active.previous ?? normalizeFolderSidebarWidth(preferredWidth));
    draftRef.current = active.previous;
    setDraft(active.previous);
    if (active.pointerId !== null && separator.current?.hasPointerCapture(active.pointerId)) {
      separator.current.releasePointerCapture(active.pointerId);
    }
  }
  function finish() {
    const active = gesture.current;
    if (!active) return;
    gesture.current = null;
    if (active.pointerId !== null && separator.current?.hasPointerCapture(active.pointerId)) {
      separator.current.releasePointerCapture(active.pointerId);
    }
    const value = draftRef.current;
    if (value === null || value === active.startWidth) {
      draftRef.current = active.previous;
      setDraft(active.previous);
      return;
    }
    const version = revision.current;
    void onCommit(value).catch(() => { /* Caller reports persistence errors. */ }).finally(() => {
      if (alive.current && !gesture.current
        && (version === revision.current || draftRef.current === value)) {
        draftRef.current = null;
        setDraft(null);
      }
    });
  }

  useEffect(() => {
    const element = body.current;
    if (!element) return;
    const media = window.matchMedia("(max-width: 560px)");
    const measure = () => setSpace({ width: element.getBoundingClientRect().width, narrow: media.matches });
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    media.addEventListener("change", measure);
    measure();
    return () => { observer.disconnect(); media.removeEventListener("change", measure); };
  }, []);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; gesture.current = null; };
  }, []);
  // Keep the cancellation handler fresh without persistent document listeners.
  useEffect(() => {
    const abort = () => cancel();
    const hidden = () => { if (document.hidden) cancel(); };
    window.addEventListener("blur", abort);
    document.addEventListener("visibilitychange", hidden);
    if (!available) cancel();
    return () => { window.removeEventListener("blur", abort); document.removeEventListener("visibilitychange", hidden); };
  });

  return <div ref={body} className="folder-workspace-body"
    style={{ "--folder-sidebar-width": `${effective}px` } as CSSProperties}>
    {children}
    {available && <div ref={separator} className="folder-sidebar-separator" role="separator" tabIndex={0}
      aria-label="Folder sidebar width" aria-orientation="vertical" aria-controls="folder-tree"
      aria-valuemin={FOLDER_SIDEBAR_MIN} aria-valuemax={maximum} aria-valuenow={effective}
      aria-valuetext={`${effective} pixels`} title="Resize folders: Left/Right, Shift for larger steps, Home/End"
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => {
        if (event.button !== 0 || !event.isPrimary || gesture.current) return;
        event.preventDefault();
        event.stopPropagation();
        gesture.current = { pointerId: event.pointerId, startX: event.clientX, startWidth: effective, previous: draftRef.current };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        const active = gesture.current;
        if (!active || active.pointerId !== event.pointerId) return;
        change(Math.max(FOLDER_SIDEBAR_MIN, Math.min(maximum, Math.round(active.startWidth + event.clientX - active.startX))));
      }}
      onPointerUp={(event) => { if (gesture.current?.pointerId === event.pointerId) finish(); }}
      onPointerCancel={cancel} onLostPointerCapture={cancel}
      onBlur={() => { if (gesture.current?.pointerId === null) finish(); else cancel(); }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && gesture.current) {
          event.preventDefault(); event.stopPropagation(); cancel(); return;
        }
        if (event.altKey || event.ctrlKey || event.metaKey || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault(); event.stopPropagation();
        if (gesture.current?.pointerId != null) return;
        gesture.current ??= { pointerId: null, startX: 0, startWidth: effective, previous: draftRef.current };
        const step = event.shiftKey ? 40 : 10;
        change(event.key === "Home" ? FOLDER_SIDEBAR_MIN : event.key === "End" ? maximum
          : Math.max(FOLDER_SIDEBAR_MIN, Math.min(maximum, effective + (event.key === "ArrowLeft" ? -step : step))));
      }}
      onKeyUp={(event) => {
        if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key) && gesture.current?.pointerId === null) finish();
      }}
    />}
  </div>;
}
