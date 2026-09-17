import { invoke } from "@tauri-apps/api/core";
import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import type { ImageHoverPreviewSetting } from "../themeCatalog";
import { localPreviewImageSource } from "../shared/previewMedia";

export const IMAGE_HOVER_PREVIEW_DELAY_MS = 500;
const IMAGE_HOVER_PREVIEW_CLOSE_GRACE_MS = 120;
const IMAGE_HOVER_PREVIEW_GAP = 12;
const IMAGE_HOVER_PREVIEW_MAX_WIDTH = 480;
const IMAGE_HOVER_PREVIEW_MAX_HEIGHT = 360;
const IMAGE_HOVER_PREVIEW_VIEWPORT_MARGIN = 12;

type ImageHoverRequest = {
  source: string;
  alt: string;
  itemId?: number;
};

type Candidate = ImageHoverRequest & {
  target: HTMLElement;
};

type ActivePreview = ImageHoverRequest & {
  displaySource: string;
  fullResolution: boolean;
  loading: boolean;
  left: number;
  top: number;
  width: number;
};

function triggerMatches(
  trigger: ImageHoverPreviewSetting,
  modifiers: { ctrlKey: boolean; altKey: boolean },
) {
  if (trigger === "hover") return true;
  if (trigger === "ctrlHover") return modifiers.ctrlKey;
  if (trigger === "altHover") return modifiers.altKey;
  return false;
}

function previewPosition(target: HTMLElement) {
  const rect = target.getBoundingClientRect();
  const width = Math.min(
    IMAGE_HOVER_PREVIEW_MAX_WIDTH,
    window.innerWidth - IMAGE_HOVER_PREVIEW_VIEWPORT_MARGIN * 2,
  );
  const estimatedHeight = Math.min(
    IMAGE_HOVER_PREVIEW_MAX_HEIGHT,
    window.innerHeight - IMAGE_HOVER_PREVIEW_VIEWPORT_MARGIN * 2,
  );
  let left = rect.right + IMAGE_HOVER_PREVIEW_GAP;
  if (left + width > window.innerWidth - IMAGE_HOVER_PREVIEW_VIEWPORT_MARGIN) {
    left = rect.left - width - IMAGE_HOVER_PREVIEW_GAP;
  }
  left = Math.max(
    IMAGE_HOVER_PREVIEW_VIEWPORT_MARGIN,
    Math.min(left, window.innerWidth - width - IMAGE_HOVER_PREVIEW_VIEWPORT_MARGIN),
  );
  const top = Math.max(
    IMAGE_HOVER_PREVIEW_VIEWPORT_MARGIN,
    Math.min(
      rect.top,
      window.innerHeight - estimatedHeight - IMAGE_HOVER_PREVIEW_VIEWPORT_MARGIN,
    ),
  );
  return { left, top, width };
}

export function useImageHoverPreview(trigger: ImageHoverPreviewSetting) {
  const [active, setActive] = useState<ActivePreview | null>(null);
  const candidateRef = useRef<Candidate | null>(null);
  const openTimerRef = useRef<number | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const requestSequenceRef = useRef(0);

  const cancelOpen = useCallback(() => {
    if (openTimerRef.current !== null) {
      window.clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
  }, []);

  const cancelClose = useCallback(() => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const close = useCallback(() => {
    cancelOpen();
    cancelClose();
    requestSequenceRef.current += 1;
    setActive(null);
  }, [cancelClose, cancelOpen]);

  const scheduleClose = useCallback(() => {
    cancelClose();
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      requestSequenceRef.current += 1;
      setActive(null);
    }, IMAGE_HOVER_PREVIEW_CLOSE_GRACE_MS);
  }, [cancelClose]);

  const openCandidate = useCallback((candidate: Candidate) => {
    if (!candidate.target.isConnected || candidateRef.current !== candidate) return;
    const position = previewPosition(candidate.target);
    const requestSequence = ++requestSequenceRef.current;
    setActive({
      ...candidate,
      ...position,
      displaySource: candidate.source,
      fullResolution: false,
      loading: candidate.itemId !== undefined,
    });
    if (candidate.itemId === undefined) return;
    void invoke<string>("load_item_preview_image", { itemId: candidate.itemId })
      .then((source) => {
        if (requestSequenceRef.current !== requestSequence || !source) return;
        setActive((current) => current ? {
          ...current,
          displaySource: localPreviewImageSource(source) ?? source,
          fullResolution: true,
          loading: false,
        } : current);
      })
      .catch(() => {
        if (requestSequenceRef.current !== requestSequence) return;
        setActive((current) => current ? { ...current, loading: false } : current);
      });
  }, []);

  const arm = useCallback((candidate: Candidate) => {
    cancelOpen();
    openTimerRef.current = window.setTimeout(() => {
      openTimerRef.current = null;
      openCandidate(candidate);
    }, IMAGE_HOVER_PREVIEW_DELAY_MS);
  }, [cancelOpen, openCandidate]);

  const onImagePointerEnter = useCallback((
    event: ReactPointerEvent<HTMLElement>,
    request: ImageHoverRequest,
  ) => {
    cancelClose();
    const candidate = { ...request, target: event.currentTarget };
    candidateRef.current = candidate;
    if (triggerMatches(trigger, event)) arm(candidate);
  }, [arm, cancelClose, trigger]);

  const onImagePointerLeave = useCallback(() => {
    candidateRef.current = null;
    cancelOpen();
    scheduleClose();
  }, [cancelOpen, scheduleClose]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        candidateRef.current = null;
        close();
        return;
      }
      if (event.repeat) return;
      const activatesModifier =
        (trigger === "ctrlHover" && event.key === "Control")
        || (trigger === "altHover" && event.key === "Alt");
      const candidate = candidateRef.current;
      if (candidate && activatesModifier) arm(candidate);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (
        (trigger === "ctrlHover" && event.key === "Control")
        || (trigger === "altHover" && event.key === "Alt")
      ) {
        cancelOpen();
        requestSequenceRef.current += 1;
        setActive(null);
      }
    };
    const closeForViewportChange = () => {
      candidateRef.current = null;
      close();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", closeForViewportChange);
    window.addEventListener("resize", closeForViewportChange);
    window.addEventListener("scroll", closeForViewportChange, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", closeForViewportChange);
      window.removeEventListener("resize", closeForViewportChange);
      window.removeEventListener("scroll", closeForViewportChange, true);
    };
  }, [arm, cancelOpen, close, trigger]);

  useEffect(() => {
    candidateRef.current = null;
    close();
  }, [close, trigger]);

  useEffect(() => () => {
    cancelOpen();
    cancelClose();
  }, [cancelClose, cancelOpen]);

  const preview = active
    ? createPortal(
      <div
        className="image-hover-preview"
        aria-hidden="true"
        data-resolution={active.fullResolution ? "full" : "thumbnail"}
        style={{ left: active.left, top: active.top, width: active.width }}
        onPointerEnter={cancelClose}
        onPointerLeave={scheduleClose}
      >
        <img src={active.displaySource} alt="" />
        {active.loading ? <span>Loading full image…</span> : null}
      </div>,
      document.body,
    )
    : null;

  return {
    onImagePointerEnter,
    onImagePointerLeave,
    preview,
  };
}
