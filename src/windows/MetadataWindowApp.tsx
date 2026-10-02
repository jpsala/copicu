import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emitTo, listen, type Event } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type {
  ApplyMetadataSelectionIntentResult,
  FolderSummary,
  MetadataSelectionIntent,
  MetadataSelectionPayload,
  MetadataSelectionSnapshot,
  TagSummary,
} from "../shared/contracts";
import { DEFAULT_SETTINGS, type AppSettings } from "../shared/settings";
import { applyCopicuAppearance } from "../themeCatalog";
import { UiAlert, UiLoader } from "../ui/controls";
import { MetadataInspector } from "../ui/MetadataInspector";
import { CustomWindowFrame } from "../ui/window/CustomWindowFrame";

const METADATA_OPEN_EVENT = "copicu://metadata/open";
const SETTINGS_UPDATED_EVENT = "copicu://settings/updated";
const HISTORY_CHANGED_EVENT = "copicu://history/changed";

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

function listFolders() {
  return invoke<FolderSummary[]>("list_folders");
}

export function MetadataWindowApp() {
  const [payload, setPayload] = useState<MetadataSelectionPayload | null>(null);
  const [availableTags, setAvailableTags] = useState<TagSummary[]>([]);
  const [availableFolders, setAvailableFolders] = useState<FolderSummary[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [appearance, setAppearance] = useState<AppSettings["appearance"]>(DEFAULT_SETTINGS.appearance);
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
    let settingsRevision = 0;
    let organizerRevision = 0;
    const refreshOrganizers = () => {
      const revision = ++organizerRevision;
      return Promise.all([listTags(), listFolders()]).then(([tags, folders]) => {
        if (!active || revision !== organizerRevision) return;
        setAvailableTags(tags);
        setAvailableFolders(folders);
        setLoadError(null);
      }).catch((error) => {
        if (active && revision === organizerRevision) setLoadError(String(error));
      });
    };
    const unlistenSettings = listen<AppSettings>(SETTINGS_UPDATED_EVENT, (event) => {
      if (!active) return;
      settingsRevision += 1;
      setAppearance(event.payload.appearance);
    });
    void unlistenSettings
      .then(() => {
        const revisionAtRequest = settingsRevision;
        return Promise.all([
          pendingMetadataEditor(),
          refreshOrganizers(),
          invoke<AppSettings>("get_settings"),
        ]).then(([initialPayload, , settings]) => ({
          initialPayload,
          settings,
          revisionAtRequest,
        }));
      })
      .then(({ initialPayload, settings, revisionAtRequest }) => {
        if (!active) return;
        setPayload(initialPayload);
        if (settingsRevision === revisionAtRequest) {
          setAppearance(settings.appearance);
        }
      })
      .catch((error) => {
        if (active) setLoadError(String(error));
      });
    const unlistenOpen = listen<MetadataSelectionPayload>(
      METADATA_OPEN_EVENT,
      (event: Event<MetadataSelectionPayload>) => {
        if (!active) return;
        setPayload(event.payload);
        void refreshOrganizers();
      },
    );
    const unlistenHistory = listen(HISTORY_CHANGED_EVENT, () => {
      if (active) void refreshOrganizers();
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
      void unlistenHistory.then((unlisten) => unlisten());
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
        {payload && loadError ? <UiAlert color="red" variant="light">{loadError}</UiAlert> : null}
        {payload ? (
          <MetadataInspector
            payload={payload}
            variant={payload.snapshot.itemCount === 1 ? "existing-single" : "existing-multi"}
            availableTags={availableTags}
            availableFolders={availableFolders}
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
