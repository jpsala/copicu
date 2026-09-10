import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emitTo, listen, type Event } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type {
  ApplyMetadataSelectionIntentResult,
  MetadataSelectionIntent,
  MetadataSelectionPayload,
  MetadataSelectionSnapshot,
  TagSummary,
} from "../shared/contracts";
import type { AppSettings } from "../shared/settings";
import { applyCopicuAppearance } from "../themeCatalog";
import { UiAlert, UiLoader } from "../ui/controls";
import { MetadataInspector } from "../ui/MetadataInspector";
import { CustomWindowFrame } from "../ui/window/CustomWindowFrame";

const METADATA_OPEN_EVENT = "copicu://metadata/open";
const SETTINGS_UPDATED_EVENT = "copicu://settings/updated";

const METADATA_SELECTION_CANCELLED_EVENT = "copicu://metadata/selection-cancelled";
function pendingMetadataEditor() {
  return invoke<MetadataSelectionPayload | null>("pending_metadata_editor");
}

function applyMetadataSelectionIntent(intent: MetadataSelectionIntent) {
  return invoke<ApplyMetadataSelectionIntentResult>("apply_metadata_selection_intent", { intent });
}

function getMetadataSelectionSnapshot(itemIds: number[]) {
  return invoke<MetadataSelectionSnapshot>("get_metadata_selection_snapshot", { request: { itemIds } });
}

function closeMetadataWindow() {
  return invoke("close_metadata_window");
}

function listTags() {
  return invoke<TagSummary[]>("list_tags");
}

export function MetadataWindowApp() {
  const [payload, setPayload] = useState<MetadataSelectionPayload | null>(null);
  const [availableTags, setAvailableTags] = useState<TagSummary[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [appearance, setAppearance] = useState<AppSettings["appearance"]>({
    theme: "system",
    themeId: "default",
  });
  const [closeRequestSignal, setCloseRequestSignal] = useState(0);
  const dirtyRef = useRef(false);
  const activeSelectionRef = useRef<number[]>([]);

  useEffect(() => {
    document.body.classList.add("metadata-window");
    return () => document.body.classList.remove("metadata-window");
  }, []);

  const closeWindow = useCallback(() => {
    void closeMetadataWindow().catch((error) => setLoadError(String(error)));
  }, []);
  useEffect(() => {
    let active = true;
    void Promise.all([pendingMetadataEditor(), listTags(), invoke<AppSettings>("get_settings")])
      .then(([initialPayload, tags, settings]) => {
        if (!active) return;
        setPayload(initialPayload);
        setAvailableTags(tags);
        setAppearance(settings.appearance);
      })
      .catch((error) => {
        if (active) setLoadError(String(error));
      });
    const unlistenOpen = listen<MetadataSelectionPayload>(
      METADATA_OPEN_EVENT,
      (event: Event<MetadataSelectionPayload>) => {
        if (!active) return;
        setPayload(event.payload);
        void listTags().then((tags) => {
          if (active) setAvailableTags(tags);
        }).catch((error) => {
          if (active) setLoadError(String(error));
        });
      },
    );
    const unlistenSettings = listen<AppSettings>(SETTINGS_UPDATED_EVENT, (event) => {
      if (active) setAppearance(event.payload.appearance);
    });
    const unlistenClose = getCurrentWindow().onCloseRequested((event) => {
      event.preventDefault();
      if (dirtyRef.current) setCloseRequestSignal((current) => current + 1);
      else closeWindow();
    });
    return () => {
      active = false;
      void unlistenSettings.then((unlisten) => unlisten());
      void unlistenOpen.then((unlisten) => unlisten());
      void unlistenClose.then((unlisten) => unlisten());
    };
  }, [closeWindow]);

  useEffect(() => {
    applyCopicuAppearance(document.documentElement, appearance);
    if (appearance.theme !== "system") return undefined;
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const syncSystemTheme = () => applyCopicuAppearance(document.documentElement, appearance);
    mediaQuery.addEventListener("change", syncSystemTheme);
    return () => mediaQuery.removeEventListener("change", syncSystemTheme);
  }, [appearance]);

  const cancel = useCallback(() => {
    if (!payload) {
      closeWindow();
      return;
    }
    const itemIds = activeSelectionRef.current.length > 0
      ? activeSelectionRef.current
      : payload.snapshot.itemIds;
    void emitTo("main", METADATA_SELECTION_CANCELLED_EVENT, { itemIds })
      .then(closeWindow)
      .catch((error) => setLoadError(String(error)));
  }, [closeWindow, payload]);

  return (
    <CustomWindowFrame variant="utility" title="Metadata" controls={["minimize", "maximize", "close"]}>
      <main className="metadata-window-app" aria-label="Metadata inspector">
        {payload ? (
          <MetadataInspector
            payload={payload}
            variant={payload.snapshot.itemCount === 1 ? "existing-single" : "existing-multi"}
            availableTags={availableTags}
            closeRequestSignal={closeRequestSignal}
            onDirtyChange={(dirty) => { dirtyRef.current = dirty; }}
            onIntentChange={(intent) => { activeSelectionRef.current = intent.itemIds; }}
            onSave={applyMetadataSelectionIntent}
            onReload={getMetadataSelectionSnapshot}
            onSaved={closeWindow}
            onCancel={cancel}
          />
        ) : (
          <div className="metadata-window-empty">
            {loadError ? <UiAlert color="red" variant="light">{loadError}</UiAlert> : <><UiLoader size="sm" /><span>Waiting for metadata selection</span></>}
          </div>
        )}
      </main>
    </CustomWindowFrame>
  );
}
