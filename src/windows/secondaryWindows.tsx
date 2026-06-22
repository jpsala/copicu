import {
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Menu, Tabs } from "@mantine/core";
import { invoke } from "@tauri-apps/api/core";
import { emitTo, listen, type Event } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import Keyboard from "lucide-react/dist/esm/icons/keyboard.mjs";
import Pin from "lucide-react/dist/esm/icons/pin.mjs";
import PinOff from "lucide-react/dist/esm/icons/pin-off.mjs";
import Plus from "lucide-react/dist/esm/icons/plus.mjs";
import Search from "lucide-react/dist/esm/icons/search.mjs";
import Tags from "lucide-react/dist/esm/icons/tags.mjs";
import Terminal from "lucide-react/dist/esm/icons/terminal.mjs";
import X from "lucide-react/dist/esm/icons/x.mjs";
import {
  applyCopicuAppearance,
  THEME_PRESET_OPTIONS,
  THEME_PRESET_SEARCH_TEXT,
  type ThemeId,
  type ThemeSetting,
} from "../themeCatalog";
import type {
  ActionContext,
  ActionDefinition,
  ActionRunResult,
  ActionTrigger,
  ActivateItemRequest,
  ClipKind,
  CreateTagRequest,
  EnrichmentApplyMode,
  EnterAction,
  MarkdownOutputPayload,
  RunActionRequest,
  SetHistoryItemsMarkedRequest,
  SetHistoryQueryMarkedRequest,
  SetItemTagsRequest,
  TagSummary,
  ToastItem,
  ToastOptions,
  UiHostRequest,
  UpdateHistoryItemRequest,
  UpdateTagConfigRequest,
} from "../shared/contracts";
import { DEFAULT_SETTINGS, normalizeSettings, type AppSettings } from "../shared/settings";
import {
  UiAlert,
  UiBadge,
  UiButton,
  UiIconButton,
  UiKbd,
  UiLoader,
  UiNumberInput,
  UiPaper,
  UiSelect,
  UiSwitch,
  UiTextInput,
  UiTextarea,
  UiTooltip,
} from "../ui/controls";
import { ShortcutBadge } from "../ui/ShortcutBadge";
import { CustomWindowFrame } from "../ui/window/CustomWindowFrame";
import { ToastStack } from "../ui/ToastStack";


type HistoryItem = {
  id: number;
  content_kind: "text" | string;
  text: string;
  preview_text: string;
  text_char_count: number;
  mime_primary: string | null;
  thumbnail_data_url: string | null;
  created_at_unix_ms: number;
  last_used_at_unix_ms: number | null;
  use_count: number;
  content_hash: string;
  title: string | null;
  tags: string | null;
  notes: string | null;
  is_marked: boolean;
};

type HotkeyNormalizationResult = {
  normalized: string | null;
  valid: boolean;
  error: string | null;
};

type NativeShortcutStatus = {
  label: string;
  registered: boolean;
  supported: boolean;
  error: string | null;
};

type AppShortcutStatus = {
  picker: NativeShortcutStatus;
  pin: NativeShortcutStatus;
};

type MetadataEditorPayload = {
  item: HistoryItem;
};

const DEFAULT_TOAST_DURATION_MS = 3600;
const STICKY_TOAST_DURATION_MS = 0;
const UI_HOST_WINDOW_LABEL = "ui-host";
const SETTINGS_WINDOW_LABEL = "settings";
const AI_OUTPUT_WINDOW_LABEL = "ai-output";
const UI_HOST_REQUEST_EVENT = "copicu://ui-host/request";
const AI_OUTPUT_OPEN_EVENT = "copicu://ai-output/open";
const METADATA_OPEN_EVENT = "copicu://metadata/open";
const SETTINGS_UPDATED_EVENT = "copicu://settings/updated";
const SETTINGS_FOCUS_SECTION_EVENT = "copicu://settings/focus-section";
const PICKER_FILTER_EVENT = "copicu://picker/filter";
const HISTORY_CHANGED_EVENT = "copicu://history/changed";
const SUPPORTED_SCRIPT_CAPABILITIES = new Set([
  "history:read-content",
  "history:search",
  "history:write-metadata",
  "history:promote",
  "metadata:read-tags",
  "metadata:edit-active",
  "history:delete",
  "clipboard:read",
  "clipboard:write",
  "ui:toast",
  "ui:notify",
  "ui:alert",
  "ui:confirm",
  "ui:input",
  "ui:markdown-output",
  "ai:summarize",
  "log:write",
  "enrichment:run",
  "enrichment:read",
  "commands:run",
  "picker:open",
  "picker:filter",
  "picker:activate",
  "picker:show",
  "picker:hide",
  "window:remember-previous",
  "window:focus-previous",
  "input:paste",
]);

function normalizeRetentionCount(value: number | string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }
  if (value === 0) {
    return 0;
  }
  return Math.min(100000, Math.max(100, Math.round(value)));
}

function activateHostItem(request: ActivateItemRequest) {
  return invoke("activate_item", { request });
}

function applyAppearance(appearance: AppSettings["appearance"]) {
  applyCopicuAppearance(document.documentElement, appearance);
}

function nullableTrim(value: string) {
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function metadataTags(value: string | null) {
  const tags = new Set(
    Array.from(value?.matchAll(/(^|\s)#([\p{L}\p{N}_-]+)/gu) ?? [], (match) => `#${match[2]}`),
  );
  return tags.size === 0 ? null : Array.from(tags).join(" ");
}

function setHistoryItemsMarked(request: SetHistoryItemsMarkedRequest) {
  return invoke("set_history_items_marked", { request });
}

function setHistoryQueryMarked(request: SetHistoryQueryMarkedRequest) {
  return invoke("set_history_query_marked", { request });
}

function listActions() {
  return invoke<ActionDefinition[]>("list_actions");
}

function getAppShortcutStatus() {
  return invoke<AppShortcutStatus>("get_app_shortcut_status");
}

function editScriptsInVscode() {
  return invoke("edit_scripts_in_vscode");
}

function editScriptInVscode(path: string) {
  return invoke("edit_script_in_vscode", { path });
}

function refreshScriptActionCache() {
  return invoke<ActionDefinition[]>("refresh_script_action_cache");
}

function listTags() {
  return invoke<TagSummary[]>("list_tags");
}

function createTag(request: CreateTagRequest) {
  return invoke<TagSummary>("create_tag", { request });
}

function updateTagConfig(request: UpdateTagConfigRequest) {
  return invoke<TagSummary>("update_tag_config", { request });
}

function setItemTags(request: SetItemTagsRequest) {
  return invoke<void>("set_item_tags", { request });
}

function pendingMetadataEditor() {
  return invoke<MetadataEditorPayload | null>("pending_metadata_editor");
}

function updateHistoryItem(request: UpdateHistoryItemRequest) {
  return invoke<void>("update_history_item", { request });
}

function closeMetadataWindow() {
  return invoke("close_metadata_window");
}

function countMarkedHistoryItems() {
  return invoke<number>("count_marked_history_items");
}

function runHostAction(request: RunActionRequest) {
  return invoke<ActionRunResult>("run_action", { request });
}

function normalizeHotkeySequence(input: string) {
  return invoke<HotkeyNormalizationResult>("normalize_hotkey_sequence", { input });
}

function openSettingsWindow() {
  return invoke("open_settings_window");
}

function showPicker() {
  return invoke("show_picker");
}

function openPickerForTag(slug: string) {
  return invoke("open_picker_for_tag", { slug });
}

function closeSettingsWindow() {
  return invoke("close_settings_window");
}

type RendererDiagnosticMode = "off" | "errors" | "debug";
type RendererDiagnosticLevel = "error" | "debug";

function rendererDiagnosticMode(): RendererDiagnosticMode {
  const rawOverride =
    new URLSearchParams(window.location.search).get("copicuDiagnostics") ??
    window.localStorage?.getItem("copicuDiagnostics") ??
    import.meta.env.VITE_COPICU_RENDERER_DIAGNOSTICS;
  const override = rawOverride?.trim().toLocaleLowerCase();
  if (override === "debug" || override === "true" || override === "1") {
    return "debug";
  }
  if (override === "errors" || override === "error") {
    return "errors";
  }
  if (override === "off" || override === "false" || override === "0") {
    return "off";
  }
  return import.meta.env.DEV ? "debug" : "errors";
}

function rendererDebugDiagnosticsEnabled() {
  return rendererDiagnosticMode() === "debug";
}

function recordRendererDiagnostic(
  event: string,
  detail?: string,
  level: RendererDiagnosticLevel = "debug",
) {
  if (!isTauriRuntime()) {
    return Promise.resolve();
  }
  const mode = rendererDiagnosticMode();
  if (mode === "off" || (mode === "errors" && level !== "error")) {
    return Promise.resolve();
  }
  return invoke("record_renderer_diagnostic", {
    event,
    detail: detail ?? null,
  }).catch((error) => {
    console.warn("renderer diagnostic failed", error);
  });
}

function resolveUiHostRequest(id: string, value: unknown) {
  return invoke("resolve_ui_host_request", {
    request: {
      id,
      value,
    },
  });
}

function pendingUiHostRequest() {
  return invoke<UiHostRequest | null>("pending_ui_host_request");
}

function openMarkdownOutput(payload: MarkdownOutputPayload) {
  return invoke("open_markdown_output", { payload });
}

function copyMarkdownOutput(markdown: string) {
  return invoke("copy_markdown_output", { markdown });
}

function addMarkdownOutputToHistory(markdown: string) {
  return invoke<number>("add_markdown_output_to_history", { markdown });
}

function exportMarkdownOutput(payload: MarkdownOutputPayload) {
  return invoke<string>("export_markdown_output", { payload });
}

function isTauriRuntime() {
  return Boolean((window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);
}

function currentWindowLabel() {
  const devWindowLabel = new URLSearchParams(window.location.search).get("window");
  if (
    (import.meta.env.DEV || import.meta.env.VITE_COPICU_VISUAL_TEST === "1") &&
    devWindowLabel
  ) {
    return devWindowLabel;
  }

  if (!isTauriRuntime()) {
    return "main";
  }

  try {
    return getCurrentWindow().label;
  } catch {
    return "main";
  }
}

const IS_UI_HOST_WINDOW = currentWindowLabel() === UI_HOST_WINDOW_LABEL;
const IS_SETTINGS_WINDOW = currentWindowLabel() === SETTINGS_WINDOW_LABEL;
const IS_AI_OUTPUT_WINDOW = currentWindowLabel() === AI_OUTPUT_WINDOW_LABEL;

if (isTauriRuntime()) {
  recordRendererDiagnostic("module-load", `label=${currentWindowLabel()}`);
  window.addEventListener("error", (event) => {
    recordRendererDiagnostic(
      "window-error",
      `${event.message} ${event.filename}:${event.lineno}:${event.colno}`,
      "error",
    );
  });
  window.addEventListener("unhandledrejection", (event) => {
    recordRendererDiagnostic("unhandled-rejection", String(event.reason), "error");
  });
  if (rendererDebugDiagnosticsEnabled()) {
    window.addEventListener("focus", () => {
      recordRendererDiagnostic("window-focus", `label=${currentWindowLabel()}`);
    });
    window.addEventListener("blur", () => {
      recordRendererDiagnostic("window-blur", `label=${currentWindowLabel()}`);
    });
    document.addEventListener("visibilitychange", () => {
      recordRendererDiagnostic(
        "visibility",
        `label=${currentWindowLabel()} state=${document.visibilityState}`,
      );
    });
    window.setInterval(() => {
      const active = document.activeElement;
      recordRendererDiagnostic(
        "heartbeat",
        `label=${currentWindowLabel()} visibility=${document.visibilityState} active=${active?.tagName ?? "none"}:${active?.getAttribute("aria-label") ?? active?.getAttribute("placeholder") ?? ""}`,
      );
    }, 2000);
  }
}

export function MetadataWindowApp() {
  const [payload, setPayload] = useState<MetadataEditorPayload | null>(null);
  const [notes, setNotes] = useState("");
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.body.classList.add("metadata-window");
    recordRendererDiagnostic("metadata.mount", `label=${currentWindowLabel()}`);
    return () => {
      document.body.classList.remove("metadata-window");
    };
  }, []);

  const loadPayload = useCallback((nextPayload: MetadataEditorPayload | null) => {
    const itemId = nextPayload?.item.id ?? null;
    recordRendererDiagnostic("metadata.loadPayload", `item_id=${itemId ?? "none"}`);
    setPayload(nextPayload);
    setTitle(nextPayload?.item.title ?? "");
    setNotes(nextPayload?.item.notes ?? "");
    setError(null);
    [0, 80, 220, 500].forEach((delayMs) => {
      window.setTimeout(() => {
        titleRef.current?.focus();
        recordRendererDiagnostic(
          "metadata.title-focused",
          `item_id=${itemId ?? "none"} delay_ms=${delayMs} active=${document.activeElement === titleRef.current}`,
        );
      }, delayMs);
    });
  }, []);

  useEffect(() => {
    let active = true;
    recordRendererDiagnostic("metadata.pending.request", `label=${currentWindowLabel()}`);
    void pendingMetadataEditor()
      .then((nextPayload) => {
        recordRendererDiagnostic(
          "metadata.pending.response",
          `has_payload=${Boolean(nextPayload)} item_id=${nextPayload?.item.id ?? "none"}`,
        );
        if (active) {
          loadPayload(nextPayload);
        }
      })
      .catch((loadError) => {
        if (active) {
          setError(String(loadError));
        }
      });
    const unlistenPromise = listen<MetadataEditorPayload>(
      METADATA_OPEN_EVENT,
      (event: Event<MetadataEditorPayload>) => {
        recordRendererDiagnostic("metadata.event.open", `item_id=${event.payload.item.id}`);
        loadPayload(event.payload);
      },
    );
    return () => {
      active = false;
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, [loadPayload]);

  const closeWindow = useCallback(() => {
    void closeMetadataWindow().catch((closeError) => setError(String(closeError)));
  }, []);

  const save = useCallback(async () => {
    if (!payload || saving) {
      return;
    }
    setSaving(true);
    setError(null);
    const request: UpdateHistoryItemRequest = {
      id: payload.item.id,
      text: payload.item.text,
      title: nullableTrim(title),
      notes: nullableTrim(notes),
      tags: metadataTags(notes),
      mimePrimary: payload.item.mime_primary,
    };
    try {
      await updateHistoryItem(request);
      await emitTo("main", HISTORY_CHANGED_EVENT, {
        itemId: payload.item.id,
        contentKind: payload.item.content_kind,
      });
      await closeMetadataWindow();
    } catch (saveError) {
      setError(String(saveError));
    } finally {
      setSaving(false);
    }
  }, [notes, payload, saving, title]);

  const handleEditorKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLFormElement>) => {
      if (event.defaultPrevented) {
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        closeWindow();
      }
      if (event.key === "F2" || ((event.ctrlKey || event.metaKey) && event.key === "Enter")) {
        event.preventDefault();
        void save();
      }
    },
    [closeWindow, save],
  );

  return (
    <CustomWindowFrame
      variant="utility"
      title="Metadata"
      controls={["minimize", "maximize", "close"]}
    >
      <main className="metadata-window-app" aria-label="Metadata editor">
        <header className="metadata-window-header">
          <div className="metadata-window-title">
            <Tags size={18} strokeWidth={2.2} aria-hidden="true" />
            <div>
              <strong>Edit metadata</strong>
              <span>{payload ? `Item #${payload.item.id}` : "Waiting for item"}</span>
            </div>
          </div>
          {payload?.item.content_kind ? (
            <UiBadge className="settings-summary-badge" variant="light">
              {payload.item.content_kind}
            </UiBadge>
          ) : null}
        </header>

        {payload ? (
          <form
            className="metadata-window-form"
            onKeyDown={handleEditorKeyDown}
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              void save();
            }}
          >
            <label>
              <span>Title</span>
              <UiTextInput
                ref={titleRef}
                value={title}
                placeholder="Optional title"
                onChange={(event) => setTitle(event.currentTarget.value)}
              />
            </label>
            <label>
              <span>Notes and tags</span>
              <UiTextarea
                className="notes-input"
                value={notes}
                placeholder="#work&#10;Markdown notes about this clip"
                onChange={(event) => setNotes(event.currentTarget.value)}
                autosize={false}
              />
            </label>
            <section className="metadata-window-preview" aria-label="Metadata preview">
              <span>Tags</span>
              <strong>{metadataTags(notes) ?? "No tags"}</strong>
            </section>
            {error ? <UiAlert className="error-text" color="red" variant="light">{error}</UiAlert> : null}
            <div className="metadata-window-buttons">
              <UiButton type="button" variant="default" onClick={closeWindow}>
                Cancel
              </UiButton>
              <UiButton type="submit" variant="filled" loading={saving}>
                Save metadata
              </UiButton>
            </div>
          </form>
        ) : (
          <div className="metadata-window-empty">
            <UiLoader size="sm" />
            <span>Waiting for metadata payload</span>
          </div>
        )}
      </main>
    </CustomWindowFrame>
  );
}

export function SettingsWindowApp() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [draft, setDraft] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [actionDefinitions, setActionDefinitions] = useState<ActionDefinition[]>([]);
  const [shortcutStatus, setShortcutStatus] = useState<AppShortcutStatus | null>(null);
  const [tags, setTags] = useState<TagSummary[]>([]);
  const [tagsLoading, setTagsLoading] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextToastIdRef = useRef(1);

  const actionSummary = useMemo(() => {
    const builtinCount = actionDefinitions.filter((action) => action.source === "builtin").length;
    const scriptCount = actionDefinitions.filter((action) => action.source === "script").length;
    const diagnosticCount = actionDefinitions.reduce(
      (count, action) => count + action.diagnostics.length,
      0,
    );
    return { builtinCount, scriptCount, diagnosticCount };
  }, [actionDefinitions]);
  const scriptActions = useMemo(
    () => actionDefinitions.filter((action) => action.source === "script"),
    [actionDefinitions],
  );
  const tagSummary = useMemo(() => {
    const pinnedCount = tags.filter((tag) => tag.pinned).length;
    const itemCount = tags.reduce((count, tag) => count + tag.itemCount, 0);
    return { pinnedCount, itemCount };
  }, [tags]);

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const pushToast = useCallback(
    ({
      title,
      message,
      tone = "info",
      durationMs = DEFAULT_TOAST_DURATION_MS,
    }: ToastOptions) => {
      const id = nextToastIdRef.current++;
      const toast = {
        id,
        title,
        message,
        tone,
        durationMs,
      };

      setToasts((current) => [...current, toast]);
      if (durationMs > 0) {
        window.setTimeout(() => dismissToast(id), durationMs);
      }
    },
    [dismissToast],
  );

  const closeWindow = useCallback(() => {
    if (isTauriRuntime()) {
      void closeSettingsWindow();
      return;
    }
    setDraft(settings);
  }, [settings]);

  const saveSettings = useCallback(async () => {
    try {
      setError(null);
      const nextSettings = normalizeSettings(await invoke<AppSettings>("update_settings", {
        settings: draft,
      }));
      setSettings(nextSettings);
      setDraft(nextSettings);
      setShortcutStatus(await getAppShortcutStatus());
      if (isTauriRuntime()) {
        await emitTo("main", SETTINGS_UPDATED_EVENT, nextSettings);
        await closeSettingsWindow();
      }
    } catch (saveError) {
      setError(String(saveError));
    }
  }, [draft]);

  const runStandaloneScriptAction = useCallback(
    async (action: ActionDefinition) => {
      const trigger: ActionTrigger = action.triggers.includes("devRun")
        ? "devRun"
        : "commandPalette";
      if (!actionRunnableForTrigger(action, trigger, [])) {
        setError(`${action.title} cannot run without picker selection.`);
        return;
      }

      try {
        setError(null);
        const result = await runHostAction({
          actionId: action.id,
          context: {
            trigger,
            shortcut: null,
            activeItemId: null,
            currentItemId: null,
            selectedItemIds: [],
            view: null,
          },
        });

        const resultToasts = result.toasts ?? [];
        if (resultToasts.length > 0) {
          resultToasts.forEach((toast) => pushToast(toast));
        }
        if (result.status === "failed") {
          throw new Error(result.message);
        }
        if (resultToasts.length === 0) {
          pushToast({
            title: action.title,
            message: result.message,
            tone: "success",
          });
        }
      } catch (runError) {
        const message = String(runError);
        setError(message);
        pushToast({
          title: `${action.title} failed`,
          message,
          tone: "danger",
          durationMs: STICKY_TOAST_DURATION_MS,
        });
      }
    },
    [pushToast],
  );

  const refreshTags = useCallback(async () => {
    setTagsLoading(true);
    try {
      const nextTags = await listTags();
      setTags(nextTags);
      setError(null);
    } catch (loadError) {
      setError(String(loadError));
    } finally {
      setTagsLoading(false);
    }
  }, []);

  const createSettingsTag = useCallback(
    async (label: string) => {
      const trimmed = label.trim();
      if (!trimmed) {
        return;
      }

      try {
        setError(null);
        const created = await createTag({ label: trimmed });
        await refreshTags();
        pushToast({
          title: "Tag created",
          message: created.label,
          tone: "success",
        });
      } catch (createError) {
        const message = String(createError);
        setError(message);
        pushToast({
          title: "Create tag failed",
          message,
          tone: "danger",
          durationMs: STICKY_TOAST_DURATION_MS,
        });
        throw createError;
      }
    },
    [pushToast, refreshTags],
  );

  const updateSettingsTag = useCallback(
    async (tagId: number, request: Omit<UpdateTagConfigRequest, "tagId">) => {
      try {
        setError(null);
        const updated = await updateTagConfig({ tagId, ...request });
        await refreshTags();
        return updated;
      } catch (updateError) {
        const message = String(updateError);
        setError(message);
        pushToast({
          title: "Update tag failed",
          message,
          tone: "danger",
          durationMs: STICKY_TOAST_DURATION_MS,
        });
        throw updateError;
      }
    },
    [pushToast, refreshTags],
  );

  const openTagFiltered = useCallback(
    async (tag: TagSummary) => {
      const filterQuery = `tag:${tag.slug}`;
      try {
        setError(null);
        if (isTauriRuntime()) {
          await openPickerForTag(tag.slug);
        }
        pushToast({
          title: "Picker filtered",
          message: filterQuery,
        });
      } catch (openError) {
        const message = String(openError);
        setError(message);
        pushToast({
          title: "Open filtered failed",
          message,
          tone: "danger",
          durationMs: STICKY_TOAST_DURATION_MS,
        });
      }
    },
    [pushToast],
  );

  const openScriptsInEditor = useCallback(async () => {
    try {
      setError(null);
      await editScriptsInVscode();
    } catch (openError) {
      setError(String(openError));
    }
  }, []);

  const openScriptInEditor = useCallback(async (action: ActionDefinition) => {
    if (!action.script?.path) {
      setError("Script source path is unavailable.");
      return;
    }

    try {
      setError(null);
      await editScriptInVscode(action.script.path);
    } catch (openError) {
      setError(String(openError));
    }
  }, []);

  const refreshScriptActions = useCallback(async () => {
    try {
      setError(null);
      const actions = await refreshScriptActionCache();
      setActionDefinitions(actions);
      setShortcutStatus(await getAppShortcutStatus());
      pushToast({
        title: "Scripts refreshed",
        message: "Shortcut diagnostics are up to date.",
        tone: "success",
      });
    } catch (refreshError) {
      const message = String(refreshError);
      setError(message);
      pushToast({
        title: "Refresh scripts failed",
        message,
        tone: "danger",
        durationMs: STICKY_TOAST_DURATION_MS,
      });
    }
  }, [pushToast]);

  const browseVscodePath = useCallback(async () => {
    try {
      setError(null);
      const selected = await openDialog({
        directory: false,
        multiple: false,
        title: "Choose VS Code launcher",
        filters: [
          {
            name: "Launchers",
            extensions: ["exe", "cmd", "bat", "ps1"],
          },
        ],
      });
      if (typeof selected !== "string" || selected.length === 0) {
        return;
      }
      setDraft((current) => ({
        ...current,
        scripts: {
          ...current.scripts,
          vscodePath: selected,
        },
      }));
    } catch (browseError) {
      setError(String(browseError));
    }
  }, []);

  useEffect(() => {
    document.body.classList.add("settings-window");
    return () => {
      document.body.classList.remove("settings-window");
    };
  }, []);

  useEffect(() => {
    let active = true;

    invoke<AppSettings>("get_settings")
      .then((nextSettings) => {
        if (active) {
          const normalizedSettings = normalizeSettings(nextSettings);
          setSettings(normalizedSettings);
          setDraft(normalizedSettings);
        }
      })
      .catch((loadError) => {
        if (active) {
          setError(String(loadError));
        }
      });

    listActions()
      .then((actions) => {
        if (active) {
          setActionDefinitions(actions);
        }
      })
      .catch((loadError) => {
        if (active) {
          setError(String(loadError));
        }
      });

    getAppShortcutStatus()
      .then((status) => {
        if (active) {
          setShortcutStatus(status);
        }
      })
      .catch((loadError) => {
        if (active) {
          setError(String(loadError));
        }
      });

    listTags()
      .then((nextTags) => {
        if (active) {
          setTags(nextTags);
        }
      })
      .catch((loadError) => {
        if (active) {
          setError(String(loadError));
        }
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    applyAppearance(settings.appearance);
    if (settings.appearance.theme !== "system") {
      return undefined;
    }

    const mediaQuery = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!mediaQuery) {
      return undefined;
    }

    const syncSystemTheme = () => applyAppearance(settings.appearance);
    mediaQuery.addEventListener("change", syncSystemTheme);
    return () => mediaQuery.removeEventListener("change", syncSystemTheme);
  }, [settings.appearance]);

  return (
    <CustomWindowFrame title="Copicu Settings" variant="document">
      <main className="settings-window-app">
        <SettingsPanel
          draft={draft}
          query={query}
          error={error}
          actionSummary={actionSummary}
          scriptActions={scriptActions}
          tags={tags}
          tagsLoading={tagsLoading}
          tagSummary={tagSummary}
          shortcutStatus={shortcutStatus}
          onDraftChange={setDraft}
          onQueryChange={setQuery}
          onRunScript={runStandaloneScriptAction}
          onCreateTag={createSettingsTag}
          onUpdateTag={updateSettingsTag}
          onOpenTagFiltered={openTagFiltered}
          onEditScripts={() => void openScriptsInEditor()}
          onEditScript={(action) => void openScriptInEditor(action)}
          onRefreshScripts={() => void refreshScriptActions()}
          onBrowseVscodePath={() => void browseVscodePath()}
          onCancel={closeWindow}
          onSave={() => void saveSettings()}
        />
        <ToastStack toasts={toasts} onDismiss={dismissToast} />
      </main>
    </CustomWindowFrame>
  );
}


export function UiHostApp() {
  const [request, setRequest] = useState<UiHostRequest | null>(null);
  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    document.body.classList.add("ui-host-window");
    return () => {
      document.body.classList.remove("ui-host-window");
    };
  }, []);

  useEffect(() => {
    if (!isTauriRuntime()) {
      const previewKind = new URLSearchParams(window.location.search).get("prompt");
      setRequest({
        id: "preview",
        kind: previewKind === "alert" ? "alert" : "input",
        title: previewKind === "alert" ? "Clipboard text" : "Tag selected items",
        body: previewKind === "alert" ? "Current clipboard text length: 42" : "Choose a short tag for this batch.",
        placeholder: previewKind === "alert" ? null : "#tag",
        defaultValue: "",
        submitLabel: previewKind === "alert" ? null : "Apply tag",
        confirmLabel: previewKind === "alert" ? "OK" : null,
        cancelLabel: previewKind === "alert" ? null : "Cancel",
      });
      return undefined;
    }

    let active = true;
    let unlisten: (() => void) | null = null;
    void listen<UiHostRequest>(UI_HOST_REQUEST_EVENT, (event: Event<UiHostRequest>) => {
      if (!active) {
        return;
      }
      setRequest(event.payload);
      setInputValue(event.payload.defaultValue ?? "");
    }).then((value) => {
      unlisten = value;
      void pendingUiHostRequest()
        .then((pendingRequest) => {
          if (!active || !pendingRequest) {
            return;
          }
          setRequest(pendingRequest);
          setInputValue(pendingRequest.defaultValue ?? "");
        })
        .catch((error) => {
          void recordRendererDiagnostic("ui-host-pending-request-failed", String(error), "error");
        });
    });

    return () => {
      active = false;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    if (request?.kind === "input") {
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [request]);

  const resolve = useCallback(
    async (value: unknown) => {
      if (!request) {
        return;
      }
      const requestId = request.id;
      setRequest(null);
      if (isTauriRuntime()) {
        try {
          await resolveUiHostRequest(requestId, value);
        } catch {
          // The Rust side owns diagnostics. The prompt should still close locally.
        }
      }
    },
    [request],
  );

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        void resolve(request?.kind === "confirm" ? false : null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [request, resolve]);

  if (!request) {
    return null;
  }

  const submitLabel =
    request.kind === "confirm"
      ? request.confirmLabel || "Confirm"
      : request.kind === "alert"
        ? request.confirmLabel || "OK"
        : request.submitLabel || "Submit";
  const cancelLabel = request.cancelLabel || "Cancel";

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void resolve(request.kind === "confirm" ? true : request.kind === "alert" ? null : inputValue);
  };

  return (
    <main className="ui-host-shell">
      <UiPaper component="form" className={`ui-host-panel is-${request.kind}`} onSubmit={submit}>
        <div className="ui-host-copy">
          <strong>{request.title}</strong>
          {request.body ? <p>{request.body}</p> : null}
        </div>
        {request.kind === "input" ? (
          <UiTextarea
            ref={inputRef}
            aria-label={request.title}
            autosize={false}
            minRows={2}
            value={inputValue}
            placeholder={request.placeholder ?? ""}
            onChange={(event) => setInputValue(event.currentTarget.value)}
          />
        ) : null}
        <div className="ui-host-buttons">
          {request.kind !== "alert" ? (
            <UiButton type="button" variant="default" onClick={() => void resolve(request.kind === "confirm" ? false : null)}>
              {cancelLabel}
            </UiButton>
          ) : null}
          <UiButton type="submit" variant="filled">{submitLabel}</UiButton>
        </div>
      </UiPaper>
    </main>
  );
}


type SettingsPanelProps = {
  draft: AppSettings;
  query: string;
  error: string | null;
  actionSummary: {
    builtinCount: number;
    scriptCount: number;
    diagnosticCount: number;
  };
  scriptActions: ActionDefinition[];
  tags: TagSummary[];
  tagsLoading: boolean;
  tagSummary: {
    pinnedCount: number;
    itemCount: number;
  };
  shortcutStatus: AppShortcutStatus | null;
  onDraftChange: (settings: AppSettings) => void;
  onQueryChange: (query: string) => void;
  onRunScript: (action: ActionDefinition) => void;
  onCreateTag: (label: string) => Promise<void>;
  onUpdateTag: (
    tagId: number,
    request: Omit<UpdateTagConfigRequest, "tagId">,
  ) => Promise<TagSummary>;
  onOpenTagFiltered: (tag: TagSummary) => void;
  onEditScripts: () => void;
  onEditScript: (action: ActionDefinition) => void;
  onRefreshScripts: () => void;
  onBrowseVscodePath: () => void;
  onCancel: () => void;
  onSave: () => void;
};

type SettingSection =
  | "general"
  | "hotkeys"
  | "picker"
  | "history"
  | "appearance"
  | "enrichment"
  | "tags"
  | "scripts"
  | "ai";

type SettingSectionDefinition = {
  id: SettingSection;
  label: string;
  description: string;
};

function SettingsPanel({
  draft,
  query,
  error,
  actionSummary,
  scriptActions,
  tags,
  tagsLoading,
  tagSummary,
  shortcutStatus,
  onDraftChange,
  onQueryChange,
  onRunScript,
  onCreateTag,
  onUpdateTag,
  onOpenTagFiltered,
  onEditScripts,
  onEditScript,
  onRefreshScripts,
  onBrowseVscodePath,
  onCancel,
  onSave,
}: SettingsPanelProps) {
  const [activeSection, setActiveSection] = useState<SettingSection>("general");
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visible = (section: SettingSection, label: string, description: string) =>
    normalizedQuery.length === 0 ||
    `${section} ${label} ${description}`.toLocaleLowerCase().includes(normalizedQuery);
  const scriptSearchText = scriptActions
    .map((action) =>
      [
        action.id,
        action.title,
        action.description,
        action.script?.fileName ?? "",
        action.script?.path ?? "",
        action.diagnostics.map((diagnostic) => diagnostic.message).join(" "),
      ].join(" "),
    )
    .join(" ");
  const scriptHotkeySearchText = scriptActions
    .map((action) =>
      [
        action.title,
        action.id,
        action.shortcut ?? "",
        action.triggers.join(" "),
        action.diagnostics.map((diagnostic) => diagnostic.message).join(" "),
      ].join(" "),
    )
    .join(" ");
  const generalSearchText = [
    "launch on windows startup",
    "start copicu when windows starts",
    "automatic updates",
    "auto update",
    "check hourly download install signed github release",
  ].join(" ");
  const hotkeySearchText = [
    draft.general.globalShortcut,
    draft.picker.pinToggleShortcut,
    draft.picker.settingsShortcut,
    "F8",
    "pin",
    "stay open",
    "keep picker open",
    "hide on focus lost",
    "open settings",
    "settings shortcut",
    "Ctrl+K",
    "Ctrl+I",
    "Enter",
    "Shift+Enter",
    "F2",
    "Shift+F2",
    scriptHotkeySearchText,
  ].join(" ");
  const tagSearchText = tags
    .map((tag) =>
      [
        tag.label,
        tag.slug,
        tag.itemCount,
        tag.pinned ? "pinned" : "",
      ].join(" "),
    )
    .join(" ");
  const settingSections: SettingSectionDefinition[] = [
    {
      id: "general",
      label: "General",
      description: "Core entry points",
    },
    {
      id: "hotkeys",
      label: "Hotkeys",
      description: "Global, local and script shortcuts",
    },
    {
      id: "picker",
      label: "Picker",
      description: "Keyboard and window behavior",
    },
    {
      id: "history",
      label: "History",
      description: "Storage and retention",
    },
    {
      id: "appearance",
      label: "Appearance",
      description: "Theme and preset",
    },
    {
      id: "enrichment",
      label: "Enrichment",
      description: "Clipboard detectors and apply policy",
    },
    {
      id: "tags",
      label: "Tags",
      description: "Labels, pinning and filtered script links",
    },
    {
      id: "scripts",
      label: "Actions",
      description: "Scripts and command palette",
    },
    {
      id: "ai",
      label: "AI",
      description: "Provider endpoint and model for AI-assisted search",
    },
  ];
  const sectionMatches = (section: SettingSectionDefinition) =>
    normalizedQuery.length === 0 ||
    `${section.id} ${section.label} ${section.description}`.toLocaleLowerCase().includes(normalizedQuery) ||
    (section.id === "general" && generalSearchText.toLocaleLowerCase().includes(normalizedQuery)) ||
    (section.id === "hotkeys" && hotkeySearchText.toLocaleLowerCase().includes(normalizedQuery)) ||
    (section.id === "scripts" && scriptSearchText.toLocaleLowerCase().includes(normalizedQuery)) ||
    (section.id === "tags" && tagSearchText.toLocaleLowerCase().includes(normalizedQuery));
  const displayedSections =
    normalizedQuery.length === 0
      ? settingSections.filter((section) => section.id === activeSection)
      : settingSections.filter(sectionMatches);

  useEffect(() => {
    if (!isTauriRuntime()) {
      return undefined;
    }

    let unlistenFocus: (() => void) | undefined;
    void listen<SettingSection>(SETTINGS_FOCUS_SECTION_EVENT, (event: Event<SettingSection>) => {
      setActiveSection(event.payload);
      if (query.length > 0) {
        onQueryChange("");
      }
    }).then((cleanup) => {
      unlistenFocus = cleanup;
    });

    return () => {
      unlistenFocus?.();
    };
  }, [onQueryChange, query.length]);

  return (
    <form
      className="settings-panel"
      aria-label="Settings"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onCancel();
        }
      }}
      onSubmit={(event) => {
        event.preventDefault();
        onSave();
      }}
    >
        <div className="settings-header">
          <div>
            <span>Settings</span>
            <strong>Copicu preferences</strong>
          </div>
          <UiTextInput
            aria-label="Search settings"
            label="Search"
            value={query}
            placeholder="Filter settings"
            rightSection={
              query.length > 0 ? (
                <UiIconButton
                  aria-label="Clear settings search"
                  type="button"
                  variant="subtle"
                  size="xs"
                  onClick={() => onQueryChange("")}
                >
                  x
                </UiIconButton>
              ) : null
            }
            onChange={(event) => onQueryChange(event.currentTarget.value)}
            autoFocus
          />
        </div>

        <div className="settings-status-strip" aria-label="Current settings summary">
          <UiBadge className="settings-summary-badge" variant="light">{draft.general.globalShortcut}</UiBadge>
          <UiBadge className="settings-summary-badge" variant="light">{draft.picker.enterAction === "copy" ? "Enter copies" : "Enter pastes"}</UiBadge>
          <UiBadge className="settings-summary-badge" variant="light">{draft.history.retentionCount === 0 ? "Unlimited history" : `${draft.history.retentionCount} items`}</UiBadge>
          <UiBadge className="settings-summary-badge" variant="light">{draft.enrichment.enabled ? "Enrichment on" : "Enrichment off"}</UiBadge>
          <UiBadge className="settings-summary-badge" variant="light">{draft.autoUpdate.enabled ? "Auto-update on" : "Auto-update off"}</UiBadge>
          <UiBadge className="settings-summary-badge" variant="light">{tags.length} tags</UiBadge>
          <UiBadge className="settings-summary-badge" variant="light">{actionSummary.scriptCount} scripts</UiBadge>
        </div>

        <Tabs
          className="settings-layout"
          classNames={{ tabLabel: "settings-nav-tab-label" }}
          orientation="vertical"
          value={activeSection}
          onChange={(value) => {
            if (!value) {
              return;
            }
            setActiveSection(value as SettingSection);
            if (query.length > 0) {
              onQueryChange("");
            }
          }}
        >
          <Tabs.List className="settings-nav" aria-label="Settings sections">
            {settingSections.map((section) => (
              <Tabs.Tab
                key={section.id}
                value={section.id}
                disabled={normalizedQuery.length > 0 && !sectionMatches(section)}
              >
                <span>{section.label}</span>
                <small>{section.description}</small>
              </Tabs.Tab>
            ))}
          </Tabs.List>

          <div className="settings-list">
            {displayedSections.some((section) => section.id === "general") ? (
              <SettingsSection title="General" description="Core app behavior and entry points.">
                {visible("general", "Launch on Windows startup", "Start Copicu when Windows starts") ? (
                  <SettingRow label="Launch on Windows startup" description="Registers Copicu with the OS autostart manager.">
                    <UiSwitch
                      label="Launch on Windows startup"
                      checked={draft.general.launchOnStartup}
                      onChange={(checked) =>
                        onDraftChange({
                          ...draft,
                          general: {
                            ...draft.general,
                            launchOnStartup: checked,
                          },
                        })
                      }
                    />
                  </SettingRow>
                ) : null}
                {visible("general", "Automatic updates", "Check hourly download install signed GitHub release") ? (
                  <SettingRow label="Automatic updates" description="Checks every hour, downloads signed releases, installs them, and relaunches Copicu. Enabled by default.">
                    <UiSwitch
                      label="Automatic updates"
                      checked={draft.autoUpdate.enabled}
                      onChange={(checked) =>
                        onDraftChange({
                          ...draft,
                          autoUpdate: {
                            ...draft.autoUpdate,
                            enabled: checked,
                          },
                        })
                      }
                    />
                  </SettingRow>
                ) : null}
              </SettingsSection>
            ) : null}

            {displayedSections.some((section) => section.id === "hotkeys") ? (
              <SettingsSection title="Hotkeys" description="Inventory first, editing only where the source of truth is safe.">
                {visible("hotkeys", "Shortcut summary", "Global local script editable inventory") ? (
                  <SettingRow label="Shortcut summary" description="Current hotkey surface across the app and discovered scripts.">
                    <div className="action-summary" aria-label="Hotkey summary">
                      <UiBadge className="settings-summary-badge" variant="light">3 editable app shortcuts</UiBadge>
                      <UiBadge className="settings-summary-badge" variant="light">6 picker shortcuts</UiBadge>
                      <UiBadge className="settings-summary-badge" variant="light">
                        {scriptActions.filter((action) => Boolean(normalizeShortcutString(action.shortcut ?? ""))).length} script shortcuts
                      </UiBadge>
                    </div>
                  </SettingRow>
                ) : null}
                {visible("hotkeys", "App shortcuts", `picker command palette ai toggle enter shift enter f2 ${draft.general.globalShortcut}`) ? (
                  <SettingRow
                    label="App shortcuts"
                    description="Editable only for shortcuts persisted in Settings. Renderer-local shortcuts stay read-only here."
                    wide
                  >
                    <AppShortcutInventory
                      pickerShortcut={draft.general.globalShortcut}
                      pinShortcut={draft.picker.pinToggleShortcut}
                      settingsShortcut={draft.picker.settingsShortcut}
                      shortcutStatus={shortcutStatus}
                      onPickerShortcutChange={(globalShortcut) =>
                        onDraftChange({
                          ...draft,
                          general: {
                            ...draft.general,
                            globalShortcut,
                          },
                        })
                      }
                      onPinShortcutChange={(pinToggleShortcut) =>
                        onDraftChange({
                          ...draft,
                          picker: {
                            ...draft.picker,
                            pinToggleShortcut,
                          },
                        })
                      }
                      onSettingsShortcutChange={(settingsShortcut) =>
                        onDraftChange({
                          ...draft,
                          picker: {
                            ...draft.picker,
                            settingsShortcut,
                          },
                        })
                      }
                    />
                  </SettingRow>
                ) : null}
                {visible("hotkeys", "Script shortcuts", `script shortcuts diagnostics local global ${scriptHotkeySearchText}`) ? (
                  <SettingRow
                    label="Script shortcuts"
                    description="Read-only in v1. Script shortcuts live in action source/metadata, so editing remains explicit through the scripts folder."
                    wide
                  >
                    <ScriptShortcutList
                      actions={scriptActions}
                      onEditScripts={onEditScripts}
                      onEditScript={onEditScript}
                      onRefreshScripts={onRefreshScripts}
                    />
                  </SettingRow>
                ) : null}
              </SettingsSection>
            ) : null}

            {displayedSections.some((section) => section.id === "picker") ? (
              <SettingsSection title="Picker" description="Selection, activation and window behavior.">
                {visible("picker", "Enter action", "Copy or paste selected item") ? (
                  <SettingRow label="Enter action" description="Shift+Enter always uses the alternate action.">
                    <UiSelect
                      aria-label="Enter action"
                      value={draft.picker.enterAction}
                      data={[
                        { value: "copy", label: "Copy" },
                        { value: "paste", label: "Paste" },
                      ]}
                      allowDeselect={false}
                      onChange={(value) =>
                        onDraftChange({
                          ...draft,
                          picker: {
                            ...draft.picker,
                            enterAction: (value ?? "copy") as EnterAction,
                          },
                        })
                      }
                    />
                  </SettingRow>
                ) : null}
                {visible("picker", "Promote active item", "Move copied or activated item to top") ? (
                  <SettingRow label="Promote active item" description="Moves a copied or activated history item to the top, matching CopyQ's default.">
                    <UiSwitch
                      label="Promote active item"
                      checked={draft.picker.promoteActiveOnCopy}
                      onChange={(checked) =>
                        onDraftChange({
                          ...draft,
                          picker: {
                            ...draft.picker,
                            promoteActiveOnCopy: checked,
                          },
                        })
                      }
                    />
                  </SettingRow>
                ) : null}
                {visible("picker", "Keep picker open", "Stay open after focus changes and item activation") ? (
                  <SettingRow label="Keep picker open" description="Keeps the picker visible, returnable as a normal window, and unchanged after activating an item.">
                    <UiSwitch
                      label="Keep picker open"
                      checked={!draft.picker.hideOnFocusLost}
                      onChange={(checked) =>
                        onDraftChange({
                          ...draft,
                          picker: {
                            ...draft.picker,
                            hideOnFocusLost: !checked,
                          },
                        })
                      }
                    />
                  </SettingRow>
                ) : null}
              </SettingsSection>
            ) : null}

            {displayedSections.some((section) => section.id === "history") ? (
              <SettingsSection title="History" description="Retention, dedupe and blob storage.">
                {visible("history", "Retention count", "Maximum number of history items") ? (
                  <SettingRow label="Retention count" description="Maximum items kept before pruning. Use 0 for unlimited.">
                    <UiNumberInput
                      aria-label="Retention count"
                      min={0}
                      max={100000}
                      step={100}
                      value={draft.history.retentionCount}
                      onChange={(value) =>
                        onDraftChange({
                          ...draft,
                          history: {
                            ...draft.history,
                            retentionCount: normalizeRetentionCount(value),
                          },
                        })
                      }
                    />
                  </SettingRow>
                ) : null}
              </SettingsSection>
            ) : null}

            {displayedSections.some((section) => section.id === "appearance") ? (
              <SettingsSection title="Appearance" description="Visual behavior for the picker and settings.">
                {visible("appearance", "Theme", "System light dark mode") ? (
                  <SettingRow label="Theme" description="Use the OS theme or force a specific appearance.">
                    <UiSelect
                      aria-label="Theme"
                      value={draft.appearance.theme}
                      data={[
                        { value: "system", label: "System" },
                        { value: "light", label: "Light" },
                        { value: "dark", label: "Dark" },
                      ]}
                      allowDeselect={false}
                      onChange={(value) =>
                        onDraftChange({
                          ...draft,
                          appearance: {
                            ...draft.appearance,
                            theme: (value ?? "system") as ThemeSetting,
                          },
                        })
                      }
                    />
                  </SettingRow>
                ) : null}
                {visible("appearance", "Preset", THEME_PRESET_SEARCH_TEXT) ? (
                  <SettingRow label="Preset" description="Visual token preset shared by picker, prompts and Mantine controls.">
                    <UiSelect
                      aria-label="Theme preset"
                      value={draft.appearance.themeId}
                      data={THEME_PRESET_OPTIONS}
                      allowDeselect={false}
                      onChange={(value) =>
                        onDraftChange({
                          ...draft,
                          appearance: {
                            ...draft.appearance,
                            themeId: (value ?? "default") as ThemeId,
                          },
                        })
                      }
                    />
                  </SettingRow>
                ) : null}
              </SettingsSection>
            ) : null}

            {displayedSections.some((section) => section.id === "enrichment") ? (
              <SettingsSection title="Enrichment" description="Local post-capture detectors and minimal apply policy.">
                {visible("enrichment", "Enable enrichment", "Run internal detectors after clipboard persistence and before clipboardChange scripts") ? (
                  <SettingRow label="Enable enrichment" description="Disables only the automatic post-capture enrichment pipeline. Manual script calls can still inspect items.">
                    <UiSwitch
                      label="Enable enrichment"
                      checked={draft.enrichment.enabled}
                      onChange={(checked) =>
                        onDraftChange({
                          ...draft,
                          enrichment: {
                            ...draft.enrichment,
                            enabled: checked,
                          },
                        })
                      }
                    />
                  </SettingRow>
                ) : null}
                {visible("enrichment", "Apply mode", "auto apply suggest only placeholder") ? (
                  <SettingRow label="Apply mode" description="`Suggest only` is a placeholder policy for manual/API inspection without automatic tag application.">
                    <UiSelect
                      aria-label="Enrichment apply mode"
                      value={draft.enrichment.applyMode}
                      data={[
                        { value: "autoApply", label: "Auto apply" },
                        { value: "suggestOnly", label: "Suggest only" },
                      ]}
                      allowDeselect={false}
                      onChange={(value) =>
                        onDraftChange({
                          ...draft,
                          enrichment: {
                            ...draft.enrichment,
                            applyMode: (value ?? "autoApply") as EnrichmentApplyMode,
                          },
                        })
                      }
                    />
                  </SettingRow>
                ) : null}
                {visible("enrichment", "Detectors", "path url json code secret risk") ? (
                  <SettingRow label="Detectors" description="Built-in universal detectors. They stay local and deterministic; no AI or payload logging.">
                    <div style={{ display: "grid", gap: 10 }}>
                      <UiSwitch
                        label="Path"
                        checked={draft.enrichment.detectors.path}
                        onChange={(checked) =>
                          onDraftChange({
                            ...draft,
                            enrichment: {
                              ...draft.enrichment,
                              detectors: {
                                ...draft.enrichment.detectors,
                                path: checked,
                              },
                            },
                          })
                        }
                      />
                      <UiSwitch
                        label="URL"
                        checked={draft.enrichment.detectors.url}
                        onChange={(checked) =>
                          onDraftChange({
                            ...draft,
                            enrichment: {
                              ...draft.enrichment,
                              detectors: {
                                ...draft.enrichment.detectors,
                                url: checked,
                              },
                            },
                          })
                        }
                      />
                      <UiSwitch
                        label="JSON"
                        checked={draft.enrichment.detectors.json}
                        onChange={(checked) =>
                          onDraftChange({
                            ...draft,
                            enrichment: {
                              ...draft.enrichment,
                              detectors: {
                                ...draft.enrichment.detectors,
                                json: checked,
                              },
                            },
                          })
                        }
                      />
                      <UiSwitch
                        label="Code"
                        checked={draft.enrichment.detectors.code}
                        onChange={(checked) =>
                          onDraftChange({
                            ...draft,
                            enrichment: {
                              ...draft.enrichment,
                              detectors: {
                                ...draft.enrichment.detectors,
                                code: checked,
                              },
                            },
                          })
                        }
                      />
                      <UiSwitch
                        label="Secret risk"
                        checked={draft.enrichment.detectors.secretRisk}
                        onChange={(checked) =>
                          onDraftChange({
                            ...draft,
                            enrichment: {
                              ...draft.enrichment,
                              detectors: {
                                ...draft.enrichment.detectors,
                                secretRisk: checked,
                              },
                            },
                          })
                        }
                      />
                    </div>
                  </SettingRow>
                ) : null}
              </SettingsSection>
            ) : null}

            {displayedSections.some((section) => section.id === "tags") ? (
              <SettingsSection title="Tags" description="Manage tag metadata. Filtered shortcuts live in Actions scripts.">
                {visible("tags", "Tag summary", "Counts pinned tags scripts actions") ? (
                  <SettingRow label="Tag summary" description="Current normalized tags derived from metadata and tag configs.">
                    <div className="action-summary" aria-label="Tag summary">
                      <UiBadge className="settings-summary-badge" variant="light">{tags.length} tags</UiBadge>
                      <UiBadge className="settings-summary-badge" variant="light">{tagSummary.itemCount} items</UiBadge>
                      <UiBadge className="settings-summary-badge" variant="light">{tagSummary.pinnedCount} pinned</UiBadge>
                    </div>
                  </SettingRow>
                ) : null}
                {visible("tags", "Tag list", `Search create pin open filtered actions scripts ${tagSearchText}`) ? (
                  <SettingRow label="Tag list" description="Create tags, pin frequent tags and open the picker with a tag filter." wide>
                    <TagSettingsList
                      tags={tags}
                      loading={tagsLoading}
                      onCreateTag={onCreateTag}
                      onUpdateTag={onUpdateTag}
                      onOpenFiltered={onOpenTagFiltered}
                    />
                  </SettingRow>
                ) : null}
              </SettingsSection>
            ) : null}

            {displayedSections.some((section) => section.id === "scripts") ? (
              <SettingsSection title="Actions" description="Built-ins, local scripts, shortcuts and diagnostics.">
                {visible("scripts", "Scripts folder", "Folder for local TypeScript JavaScript actions") ? (
                  <SettingRow label="Scripts folder" description="Local folder for editable TypeScript and JavaScript actions.">
                    <UiTextInput
                      aria-label="Scripts folder"
                      value={draft.scripts.folderPath}
                      onChange={(event) =>
                        onDraftChange({
                          ...draft,
                          scripts: {
                            ...draft.scripts,
                            folderPath: event.currentTarget.value,
                          },
                        })
                      }
                    />
                  </SettingRow>
                ) : null}
                {visible("scripts", "VS Code path", "Executable path used to edit scripts and other local action assets") ? (
                  <SettingRow
                    label="VS Code path"
                    description="Path to `Code.exe`, `code.cmd`, or a local launcher script used to edit scripts and other local action files."
                  >
                    <div style={{ display: "grid", gap: 8, gridTemplateColumns: "minmax(0, 1fr) auto" }}>
                      <UiTextInput
                        aria-label="VS Code path"
                        value={draft.scripts.vscodePath}
                        placeholder="C:\\Users\\<you>\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe"
                        onChange={(event) =>
                          onDraftChange({
                            ...draft,
                            scripts: {
                              ...draft.scripts,
                              vscodePath: event.currentTarget.value,
                            },
                          })
                        }
                      />
                      <UiButton type="button" variant="default" onClick={onBrowseVscodePath}>
                        Browse...
                      </UiButton>
                    </div>
                  </SettingRow>
                ) : null}
                {visible("scripts", "Open scripts in VS Code", "Open the configured scripts folder in VS Code from settings or tray menu") ? (
                  <SettingRow
                    label="Open scripts in VS Code"
                    description="Opens the configured scripts folder in VS Code. If the editor path is wrong, Copicu returns here so you can fix it."
                  >
                    <UiButton type="button" variant="default" onClick={onEditScripts}>
                      Open scripts in VS Code
                    </UiButton>
                  </SettingRow>
                ) : null}
                {visible("scripts", "Discovered actions", "Built-in and local script registry diagnostics") ? (
                  <SettingRow label="Discovered actions" description="Current registry from built-ins and discovered local scripts.">
                    <div className="action-summary" aria-label="Discovered actions summary">
                      <UiBadge className="settings-summary-badge" variant="light">{actionSummary.builtinCount} built-in</UiBadge>
                      <UiBadge className="settings-summary-badge" variant="light">{actionSummary.scriptCount} scripts</UiBadge>
                      <UiBadge className="settings-summary-badge" variant="light">{actionSummary.diagnosticCount} diagnostics</UiBadge>
                    </div>
                  </SettingRow>
                ) : null}
                {visible(
                  "scripts",
                  "Script registry",
                  `Discovered script files diagnostics source hash triggers capabilities ${scriptSearchText}`,
                ) ? (
                  <SettingRow label="Script registry" description="Debug view for discovered local actions and parse diagnostics." wide>
                    <ScriptRegistryList actions={scriptActions} onRunScript={onRunScript} />
                  </SettingRow>
                ) : null}
              </SettingsSection>
            ) : null}

            {displayedSections.some((section) => section.id === "ai") ? (
              <SettingsSection title="AI" description="Provider settings for future AI-assisted history search and script tools.">
                {visible("ai", "Enable AI", "Allow Copicu to call configured AI provider") ? (
                  <SettingRow label="Enable AI" description="AI calls stay disabled until explicitly enabled.">
                    <UiSwitch
                      label="Enable AI"
                      checked={draft.ai.enabled}
                      onChange={(checked) =>
                        onDraftChange({
                          ...draft,
                          ai: {
                            ...draft.ai,
                            enabled: checked,
                          },
                        })
                      }
                    />
                  </SettingRow>
                ) : null}
                {visible("ai", "API key", "Credentials COPICU_AI_API_KEY settings .env OpenRouter OpenAI") ? (
                  <SettingRow
                    label="API key"
                    description="Stored locally in Copicu settings. COPICU_AI_API_KEY from the process environment or .env still overrides this field when present."
                  >
                    <UiTextInput
                      aria-label="AI API key"
                      type="password"
                      value={draft.ai.apiKey}
                      placeholder="sk-..."
                      autoComplete="off"
                      onChange={(event) =>
                        onDraftChange({
                          ...draft,
                          ai: {
                            ...draft.ai,
                            apiKey: event.currentTarget.value,
                          },
                        })
                      }
                    />
                  </SettingRow>
                ) : null}
                {visible("ai", "Endpoint", "OpenAI-compatible API endpoint base URL") ? (
                  <SettingRow label="Endpoint" description=".env COPICU_AI_ENDPOINT overrides this field when present.">
                    <UiTextInput
                      aria-label="AI endpoint"
                      value={draft.ai.endpoint}
                      onChange={(event) =>
                        onDraftChange({
                          ...draft,
                          ai: {
                            ...draft.ai,
                            endpoint: event.currentTarget.value,
                          },
                        })
                      }
                    />
                  </SettingRow>
                ) : null}
                {visible("ai", "Model", "AI model id") ? (
                  <SettingRow label="Model" description=".env COPICU_AI_MODEL overrides this field when present.">
                    <UiTextInput
                      aria-label="AI model"
                      value={draft.ai.model}
                      onChange={(event) =>
                        onDraftChange({
                          ...draft,
                          ai: {
                            ...draft.ai,
                            model: event.currentTarget.value,
                          },
                        })
                      }
                    />
                  </SettingRow>
                ) : null}
              </SettingsSection>
            ) : null}

            {displayedSections.length === 0 ? (
              <p className="settings-empty">No settings match this filter.</p>
            ) : null}
          </div>
        </Tabs>

        {error ? <UiAlert className="error-text" color="red" variant="light">{error}</UiAlert> : null}
        <div className="settings-buttons">
          <UiButton type="button" variant="default" onClick={onCancel}>
            Cancel
          </UiButton>
          <UiButton type="submit" variant="filled">Save</UiButton>
        </div>
    </form>
  );
}

function SettingsSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="settings-section">
      <header>
        <strong>{title}</strong>
        <p>{description}</p>
      </header>
      <div className="settings-section-rows">{children}</div>
    </section>
  );
}

type HotkeyFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  allowSequences?: boolean;
  helpText?: string;
};

function HotkeyField({ label, value, onChange, allowSequences = true, helpText }: HotkeyFieldProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [draftSteps, setDraftSteps] = useState<string[]>([]);
  const [manualValue, setManualValue] = useState(value);
  const [validation, setValidation] = useState<HotkeyNormalizationResult>({
    normalized: value,
    valid: true,
    error: null,
  });

  useEffect(() => {
    setManualValue(value);
  }, [value]);

  useEffect(() => {
    let cancelled = false;
    const trimmed = value.trim();

    if (!trimmed) {
      setValidation({
        normalized: null,
        valid: false,
        error: "Shortcut is required.",
      });
      return;
    }

    void normalizeHotkeySequence(trimmed)
      .then((result) => {
        if (cancelled) {
          return;
        }
        if (!allowSequences && shortcutContainsSequenceDelimiter(result.normalized ?? trimmed)) {
          setValidation({
            normalized: result.normalized,
            valid: false,
            error: "Use one shortcut for the picker.",
          });
          return;
        }
        setValidation(result);
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        setValidation({
          normalized: null,
          valid: false,
          error: error instanceof Error ? error.message : String(error),
        });
      });

    return () => {
      cancelled = true;
    };
  }, [allowSequences, value]);

  const normalizedSteps = useMemo(
    () =>
      (validation.normalized ?? value)
        .split(/,\s+/)
        .map((step) => step.trim())
        .filter(Boolean),
    [validation.normalized, value],
  );

  const commitShortcut = useCallback(
    (steps: string[]) => {
      const next = steps.join(", ");
      const normalized = normalizeShortcutString(next) ?? next;
      onChange(normalized);
      setDraftSteps([]);
      setIsRecording(false);
    },
    [onChange],
  );

  const normalizeAndCommitManualValue = useCallback(() => {
    const trimmed = manualValue.trim();
    if (!trimmed) {
      onChange("");
      return;
    }

    void normalizeHotkeySequence(trimmed)
      .then((result) => {
        if (!result.valid || !result.normalized) {
          setValidation(result);
          return;
        }
        if (!allowSequences && shortcutContainsSequenceDelimiter(result.normalized)) {
          setValidation({
            normalized: result.normalized,
            valid: false,
            error: "Use one shortcut for the picker.",
          });
          return;
        }
        onChange(result.normalized);
        setManualValue(result.normalized);
      })
      .catch((error: unknown) => {
        setValidation({
          normalized: null,
          valid: false,
          error: error instanceof Error ? error.message : String(error),
        });
      });
  }, [allowSequences, manualValue, onChange]);

  const handleRecordKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLButtonElement>) => {
      if (!isRecording) {
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        setIsRecording(false);
        setDraftSteps([]);
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        if (draftSteps.length > 0) {
          commitShortcut(draftSteps);
        } else {
          setIsRecording(false);
        }
        return;
      }

      if (event.key === "Backspace") {
        event.preventDefault();
        setDraftSteps((steps) => steps.slice(0, -1));
        return;
      }

      const shortcut = allowSequences
        ? compoundShortcutFromKeyboardEvent(event)
        : shortcutFromKeyboardEvent(event);
      if (!shortcut || event.repeat) {
        return;
      }

      event.preventDefault();
      const nextSteps = allowSequences ? [...draftSteps, shortcut] : [shortcut];
      setDraftSteps(nextSteps);
      if (!allowSequences) {
        commitShortcut(nextSteps);
      }
    },
    [allowSequences, commitShortcut, draftSteps, isRecording],
  );

  const displaySteps = isRecording && draftSteps.length > 0 ? draftSteps : normalizedSteps;
  const hasError = !validation.valid;

  return (
    <div className="hotkey-field">
      <div
        className={[
          "hotkey-field-display",
          isRecording ? "is-recording" : "",
          hasError ? "has-error" : "",
        ].filter(Boolean).join(" ")}
        aria-label={label}
      >
        {displaySteps.length > 0 ? (
          displaySteps.map((step, index) => (
            <span className="hotkey-step" key={`${step}-${index}`}>
              {step.split("+").map((part) => (
                <UiKbd key={part}>{displayShortcutPart(part)}</UiKbd>
              ))}
            </span>
          ))
        ) : (
          <span className="hotkey-placeholder">Press a shortcut</span>
        )}
      </div>
      <div className="hotkey-field-actions">
        <UiButton
          type="button"
          variant={isRecording ? "filled" : "default"}
          size="xs"
          leftSection={<Keyboard size={14} aria-hidden="true" />}
          onClick={() => {
            setDraftSteps([]);
            setIsRecording((recording) => !recording);
          }}
          onKeyDown={handleRecordKeyDown}
        >
          {isRecording ? (allowSequences ? "Press keys" : "Listening") : "Record"}
        </UiButton>
        {allowSequences && isRecording && draftSteps.length > 0 ? (
          <UiButton type="button" variant="default" size="xs" onClick={() => commitShortcut(draftSteps)}>
            Done
          </UiButton>
        ) : null}
      </div>
      <UiTextInput
        aria-label={`${label} manual value`}
        value={manualValue}
        size="xs"
        placeholder={allowSequences ? "Ctrl+Alt+C, J" : "Win+Alt+C"}
        onChange={(event) => setManualValue(event.currentTarget.value)}
        onBlur={normalizeAndCommitManualValue}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            normalizeAndCommitManualValue();
          }
        }}
      />
      <div className={hasError ? "hotkey-field-status has-error" : "hotkey-field-status"}>
        {hasError
          ? validation.error
          : helpText ?? (allowSequences
            ? "Supports sequences like Ctrl+Alt+C, J."
            : "Single global shortcut. Script actions can use sequences.")}
      </div>
    </div>
  );
}

function displayShortcutPart(part: string) {
  return part === "Meta" ? "Win" : part;
}

function SettingRow({
  label,
  description,
  children,
  disabled = false,
  locked = false,
  wide = false,
}: {
  label: string;
  description: string;
  children: ReactNode;
  disabled?: boolean;
  locked?: boolean;
  wide?: boolean;
}) {
  return (
    <section className={`setting-row ${disabled ? "is-disabled" : ""} ${wide ? "is-wide" : ""}`}>
      <div>
        {locked || disabled ? <span>{disabled ? "Planned" : "Current"}</span> : null}
        <strong>{label}</strong>
        <p>{description}</p>
      </div>
      <div className="setting-control">{children}</div>
    </section>
  );
}

function ReadOnlyStatus({
  value,
  tone = "neutral",
}: {
  value: string;
  tone?: "neutral" | "success" | "warning";
}) {
  return (
    <UiBadge className={`readonly-status is-${tone}`} variant={tone === "neutral" ? "default" : "light"}>
      {value}
    </UiBadge>
  );
}

function AppShortcutInventory({
  pickerShortcut,
  pinShortcut,
  settingsShortcut,
  shortcutStatus,
  onPickerShortcutChange,
  onPinShortcutChange,
  onSettingsShortcutChange,
}: {
  pickerShortcut: string;
  pinShortcut: string;
  settingsShortcut: string;
  shortcutStatus: AppShortcutStatus | null;
  onPickerShortcutChange: (value: string) => void;
  onPinShortcutChange: (value: string) => void;
  onSettingsShortcutChange: (value: string) => void;
}) {
  return (
    <div className="hotkey-inventory-list" aria-label="App shortcuts">
      <section className="hotkey-inventory-item">
        <div className="hotkey-inventory-copy">
          <div className="hotkey-inventory-header">
            <strong>Open picker</strong>
            <div className="hotkey-meta">
              <ShortcutRegistrationStatusBadge status={shortcutStatus?.picker ?? null} />
              <ReadOnlyStatus value="Editable" />
            </div>
          </div>
          <p>{shortcutStatusDescription(shortcutStatus?.picker ?? null, "Global shortcut registered by the Tauri native shortcut backend.")}</p>
        </div>
        <HotkeyField
          label="Open picker shortcut"
          value={pickerShortcut}
          allowSequences={false}
          onChange={onPickerShortcutChange}
        />
      </section>

      <section className="hotkey-inventory-item">
        <div className="hotkey-inventory-copy">
          <div className="hotkey-inventory-header">
            <strong>Open settings</strong>
            <div className="hotkey-meta">
              <ReadOnlyStatus value="Picker local" tone="success" />
              <ReadOnlyStatus value="Editable" />
            </div>
          </div>
          <p>Opens Settings from inside the picker only. This shortcut is not registered globally.</p>
        </div>
        <HotkeyField
          label="Open settings shortcut"
          value={settingsShortcut}
          allowSequences={false}
          helpText="Single picker-local shortcut. Not registered globally."
          onChange={onSettingsShortcutChange}
        />
      </section>

      <section className="hotkey-inventory-item">
        <div className="hotkey-inventory-copy">
          <div className="hotkey-inventory-header">
            <strong>Toggle pin on top</strong>
            <div className="hotkey-meta">
              <ShortcutRegistrationStatusBadge status={shortcutStatus?.pin ?? null} />
              <ReadOnlyStatus value="Editable" />
            </div>
          </div>
          <p>{shortcutStatusDescription(shortcutStatus?.pin ?? null, "Toggles always-on-top for the picker. Use the picker title-bar keep-open control for a persistent picker without z-order pinning.")}</p>
        </div>
        <HotkeyField
          label="Toggle pin shortcut"
          value={pinShortcut}
          allowSequences={false}
          onChange={onPinShortcutChange}
        />
      </section>

      {[
        {
          id: "picker.commandPalette",
          title: "Command palette",
          description: "Opens the command palette from the picker search input.",
          shortcut: "Ctrl+K",
        },
        {
          id: "picker.toggleAiMode",
          title: "Toggle AI mode",
          description: "Switches the search box between normal search and AI mode.",
          shortcut: "Ctrl+I",
        },
        {
          id: "picker.activateSelection",
          title: "Activate selection",
          description: "Enter copies or pastes depending on picker settings. Shift+Enter uses the alternate action.",
          shortcut: "Enter, Shift+Enter",
        },
        {
          id: "picker.editSelection",
          title: "Edit active item",
          description: "F2 edits content. Shift+F2 opens metadata edit for the current item.",
          shortcut: "F2, Shift+F2",
        },
      ].map((entry) => (
        <section key={entry.id} className="hotkey-inventory-item">
          <div className="hotkey-inventory-copy">
            <div className="hotkey-inventory-header">
              <strong>{entry.title}</strong>
              <ShortcutBadge shortcut={entry.shortcut} />
            </div>
            <p>{entry.description}</p>
          </div>
          <div className="hotkey-meta">
            <ReadOnlyStatus value="Picker local" tone="success" />
            <ReadOnlyStatus value="Read-only" />
            <ReadOnlyStatus value="Renderer source" />
          </div>
        </section>
      ))}
    </div>
  );
}

function ShortcutRegistrationStatusBadge({ status }: { status: NativeShortcutStatus | null }) {
  if (!status) {
    return <ReadOnlyStatus value="Checking" />;
  }
  if (!status.supported) {
    return <ReadOnlyStatus value="Unsupported" tone="warning" />;
  }
  if (status.registered) {
    return <ReadOnlyStatus value="Registered" tone="success" />;
  }
  if (status.error) {
    return <ReadOnlyStatus value="Conflict" tone="warning" />;
  }
  return <ReadOnlyStatus value="Disabled" />;
}

function shortcutStatusDescription(status: NativeShortcutStatus | null, fallback: string) {
  if (!status) {
    return fallback;
  }
  if (status.error) {
    return status.error;
  }
  if (!status.registered && status.supported) {
    return "Shortcut is disabled or waiting for a saved value.";
  }
  return fallback;
}

function ScriptShortcutList({
  actions,
  onEditScripts,
  onEditScript,
  onRefreshScripts,
}: {
  actions: ActionDefinition[];
  onEditScripts: () => void;
  onEditScript: (action: ActionDefinition) => void;
  onRefreshScripts: () => void;
}) {
  const [editingActionId, setEditingActionId] = useState<string | null>(null);
  const shortcutActions = actions.filter((action) => Boolean(normalizeShortcutString(action.shortcut ?? "")));

  if (shortcutActions.length === 0) {
    return (
      <div className="hotkey-script-list">
        <p className="script-empty" aria-label="Script shortcuts empty">
          No discovered scripts declare shortcuts.
        </p>
        <UiButton type="button" variant="default" onClick={onEditScripts}>
          Open scripts in VS Code
        </UiButton>
      </div>
    );
  }

  return (
    <div className="hotkey-script-list" aria-label="Script shortcuts">
      <div className="hotkey-meta">
        <ReadOnlyStatus value="Read-only in Settings" />
        <UiButton type="button" variant="default" size="xs" onClick={onEditScripts}>
          Open scripts in VS Code
        </UiButton>
        <UiButton type="button" variant="default" size="xs" onClick={onRefreshScripts}>
          Refresh scripts
        </UiButton>
      </div>
      {shortcutActions.map((action) => {
        const normalizedShortcut = normalizeShortcutString(action.shortcut ?? "");
        const hasErrors = action.diagnostics.some((diagnostic) => diagnostic.severity === "error");
        const hasWarnings = action.diagnostics.some((diagnostic) => diagnostic.severity === "warning");
        const shortcutTriggers = action.triggers.filter((trigger) =>
          trigger === "globalShortcut" || trigger === "localShortcut",
        );
        const isEditing = editingActionId === action.id;
        return (
          <section key={action.id} className="hotkey-script-item">
            <div className="hotkey-script-copy">
              <div className="hotkey-script-header">
                <strong>{action.title}</strong>
                <ShortcutBadge shortcut={normalizedShortcut} />
              </div>
              <p>{action.description || action.id}</p>
              <div className="hotkey-meta">
                <ReadOnlyStatus
                  value={
                    hasErrors ? "Conflict" : hasWarnings ? "Needs review" : "Ready"
                  }
                  tone={hasErrors ? "neutral" : "success"}
                />
                <ReadOnlyStatus
                  value={
                    shortcutTriggers.length > 0
                      ? shortcutTriggers.join(" + ")
                      : "No shortcut trigger"
                  }
                />
                <ReadOnlyStatus value={action.script?.fileName ?? action.id} />
              </div>
              {action.script?.path ? <div className="hotkey-script-path">{action.script.path}</div> : null}
              {action.diagnostics.length > 0 ? (
                <ul className="hotkey-script-diagnostics">
                  {action.diagnostics.map((diagnostic, index) => (
                    <li key={`${action.id}-${diagnostic.severity}-${index}`}>
                      <strong>{diagnostic.severity}</strong> {diagnostic.message}
                    </li>
                  ))}
                </ul>
              ) : null}
              <div className="hotkey-script-actions">
                <UiButton
                  type="button"
                  variant={isEditing ? "filled" : "default"}
                  size="xs"
                  onClick={() => setEditingActionId(isEditing ? null : action.id)}
                >
                  {isEditing ? "Hide edit flow" : "Edit shortcut"}
                </UiButton>
                <UiButton
                  type="button"
                  variant="default"
                  size="xs"
                  disabled={!action.script?.path}
                  onClick={() => onEditScript(action)}
                >
                  Open source
                </UiButton>
              </div>
              {isEditing ? (
                <div className="hotkey-script-edit-flow">
                  <strong>Manual source edit</strong>
                  <ol>
                    <li>Open the script source and change the `shortcut` value.</li>
                    <li>Save the file in your editor. Settings will not patch it silently.</li>
                    <li>Refresh scripts here and review Conflict or Ready before using it.</li>
                  </ol>
                  <div className="hotkey-script-edit-preview">
                    <span>Current shortcut</span>
                    <ShortcutBadge shortcut={normalizedShortcut} />
                  </div>
                  <div className="hotkey-script-actions">
                    <UiButton
                      type="button"
                      variant="default"
                      size="xs"
                      disabled={!action.script?.path}
                      onClick={() => onEditScript(action)}
                    >
                      Open this file
                    </UiButton>
                    <UiButton type="button" variant="default" size="xs" onClick={onRefreshScripts}>
                      Refresh diagnostics
                    </UiButton>
                  </div>
                </div>
              ) : null}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function TagSettingsList({
  tags,
  loading,
  onCreateTag,
  onUpdateTag,
  onOpenFiltered,
}: {
  tags: TagSummary[];
  loading: boolean;
  onCreateTag: (label: string) => Promise<void>;
  onUpdateTag: (
    tagId: number,
    request: Omit<UpdateTagConfigRequest, "tagId">,
  ) => Promise<TagSummary>;
  onOpenFiltered: (tag: TagSummary) => void;
}) {
  const [tagQuery, setTagQuery] = useState("");
  const [newTagLabel, setNewTagLabel] = useState("");
  const normalizedQuery = tagQuery.trim().toLocaleLowerCase();

  const filteredTags = tags.filter((tag) =>
    normalizedQuery.length === 0 ||
    tagSearchText(tag).includes(normalizedQuery),
  );
  const sortedTags = [...filteredTags].sort((left, right) => {
    if (left.pinned !== right.pinned) {
      return left.pinned ? -1 : 1;
    }
    return left.label.localeCompare(right.label, undefined, { sensitivity: "base" });
  });

  const createCurrentTag = async () => {
    const label = newTagLabel.trim();
    if (!label) {
      return;
    }
    await onCreateTag(label);
    setNewTagLabel("");
    setTagQuery("");
  };

  return (
    <div className="tag-settings-panel">
      <div className="tag-settings-toolbar">
        <UiTextInput
          aria-label="Search tags"
          leftSection={<Search size={14} strokeWidth={2.2} aria-hidden="true" />}
          value={tagQuery}
          placeholder="Search tags"
          onChange={(event) => setTagQuery(event.currentTarget.value)}
        />
        <div className="tag-create-form">
          <UiTextInput
            aria-label="New tag label"
            value={newTagLabel}
            placeholder="New tag"
            onChange={(event) => setNewTagLabel(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void createCurrentTag();
              }
            }}
          />
          <UiTooltip label="Create tag">
            <UiIconButton
              aria-label="Create tag"
              type="button"
              variant="filled"
              disabled={!newTagLabel.trim()}
              onClick={() => void createCurrentTag()}
            >
              <Plus size={15} strokeWidth={2.3} aria-hidden="true" />
            </UiIconButton>
          </UiTooltip>
        </div>
      </div>

      {loading ? (
        <div className="tag-settings-loading">
          <UiLoader size="xs" />
          <span>Loading tags</span>
        </div>
      ) : sortedTags.length === 0 ? (
        <p className="script-empty" aria-label="Tags empty">
          {tags.length === 0 ? "No tags yet." : "No tags match this search."}
        </p>
      ) : (
        <div className="tag-settings-list" aria-label="Tags">
          {sortedTags.map((tag) => (
            <section key={tag.id} className="tag-settings-item">
              <div className="tag-identity">
                <strong title={`#${tag.slug}`}>{tag.label}</strong>
              </div>
              <UiBadge className="tag-chip" variant="light">
                {tag.itemCount} items
              </UiBadge>
              <div className="tag-actions">
                <UiTooltip label={tag.pinned ? "Unpin tag" : "Pin tag"}>
                  <UiIconButton
                    aria-label={tag.pinned ? `Unpin ${tag.label}` : `Pin ${tag.label}`}
                    type="button"
                    variant={tag.pinned ? "light" : "subtle"}
                    onClick={() => void onUpdateTag(tag.id, { pinned: !tag.pinned })}
                  >
                    {tag.pinned ? (
                      <PinOff size={14} strokeWidth={2.2} aria-hidden="true" />
                    ) : (
                      <Pin size={14} strokeWidth={2.2} aria-hidden="true" />
                    )}
                  </UiIconButton>
                </UiTooltip>
                <UiButton
                  type="button"
                  size="xs"
                  variant="default"
                  onClick={() => onOpenFiltered(tag)}
                >
                  Open filtered
                </UiButton>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function ScriptRegistryList({
  actions,
  onRunScript,
}: {
  actions: ActionDefinition[];
  onRunScript: (action: ActionDefinition) => void;
}) {
  if (actions.length === 0) {
    return (
      <p className="script-empty" aria-label="Script registry empty">
        No scripts discovered.
      </p>
    );
  }

  return (
    <div className="script-registry-list" aria-label="Script registry">
      {actions.map((action) => {
        const diagnosticCount = action.diagnostics.length;
        const hasErrors = action.diagnostics.some((diagnostic) => diagnostic.severity === "error");
        const statusLabel = hasErrors
          ? "error"
          : diagnosticCount > 0
            ? `${diagnosticCount} diagnostics`
            : "ready";
        const canRun =
          !hasErrors &&
          unsupportedCapabilities(action).length === 0 &&
          ((action.triggers.includes("devRun") &&
            actionRunnableForTrigger(action, "devRun", [])) ||
            (action.triggers.includes("commandPalette") &&
              actionRunnableForTrigger(action, "commandPalette", [])));

        return (
          <details
            key={`${action.script?.path ?? action.id}-${action.id}`}
            className={`script-registry-item ${hasErrors ? "has-errors" : ""}`}
            open={diagnosticCount > 0}
          >
            <summary>
              <span className="script-title">{action.title}</span>
              <ShortcutBadge shortcut={normalizeShortcutString(action.shortcut)} />
              <span className={`script-status ${hasErrors ? "is-error" : ""}`}>
                {statusLabel}
              </span>
            </summary>
            <div className="script-details">
              <span title={action.script?.path ?? action.id}>
                {action.script?.fileName ?? action.id}
              </span>
              <span>{action.triggers.length > 0 ? action.triggers.join(", ") : "no triggers"}</span>
              <span>
                {action.capabilities.length > 0
                  ? action.capabilities.join(", ")
                  : "no capabilities"}
              </span>
              <span>{shortHash(action.script?.sourceHash)}</span>
            </div>
            <div className="script-actions">
              <Menu withinPortal position="bottom-end">
                <Menu.Target>
                  <UiButton type="button" variant="default" size="xs" style={{ minWidth: 70 }}>
                    Actions
                  </UiButton>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Item
                    disabled={!canRun}
                    leftSection={<Terminal size={14} strokeWidth={2.2} />}
                    onClick={() => onRunScript(action)}
                  >
                    Run
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>
            </div>
            {action.diagnostics.length > 0 ? (
              <ul className="script-diagnostics">
                {action.diagnostics.map((diagnostic, index) => (
                  <li
                    key={`${diagnostic.severity}-${index}-${diagnostic.message}`}
                    className={`diagnostic-${diagnostic.severity}`}
                  >
                    <strong>{diagnostic.severity}</strong>
                    <span>{diagnostic.message}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </details>
        );
      })}
    </div>
  );
}


function shortHash(value: string | null | undefined) {
  if (!value) {
    return "no hash";
  }
  return value.length <= 10 ? value : value.slice(0, 10);
}

function tagSearchText(tag: TagSummary) {
  return [
    tag.label,
    tag.slug,
    tag.autoApplyEnabled ? "auto apply" : "",
    tag.pinned ? "pinned" : "",
  ].join(" ").toLocaleLowerCase();
}

function actionRunnableForTrigger(
  action: ActionDefinition,
  trigger: ActionTrigger,
  items: HistoryItem[],
) {
  return (
    action.triggers.includes(trigger) &&
    !actionHasErrorDiagnostics(action) &&
    unsupportedCapabilities(action).length === 0 &&
    actionMatchesSelection(action, items) &&
    actionMatchesKinds(action, items) &&
    actionMatchesMime(action, items)
  );
}

function itemMenuScriptActions(actions: ActionDefinition[], items: HistoryItem[]) {
  return actions.filter(
    (action) =>
      action.source === "script" &&
      actionRunnableForTrigger(action, "itemMenu", itemsForActionContext(action, items)),
  );
}

function itemsForActionContext(action: ActionDefinition, items: HistoryItem[]) {
  if (action.input.selection === "none" || action.input.source === "none") {
    return [];
  }
  if (action.input.selection === "active") {
    return items.slice(0, 1);
  }
  return items;
}

function actionHasErrorDiagnostics(action: ActionDefinition) {
  return action.diagnostics.some((diagnostic) => diagnostic.severity === "error");
}

function unsupportedCapabilities(action: ActionDefinition) {
  if (action.source !== "script") {
    return [];
  }
  return action.capabilities.filter((capability) => !SUPPORTED_SCRIPT_CAPABILITIES.has(capability));
}

function actionMatchesSelection(action: ActionDefinition, items: HistoryItem[]) {
  switch (action.input.selection) {
    case "none":
      return items.length === 0;
    case "optional":
      return true;
    case "active":
      return items.length === 1;
    case "one":
      return items.length === 1;
    case "oneOrMore":
      return items.length >= 1;
    case "many":
      return items.length >= 2;
  }
}

function actionMatchesKinds(action: ActionDefinition, items: HistoryItem[]) {
  if (!action.input.kinds || items.length === 0) {
    return true;
  }
  return items.every((item) => action.input.kinds?.includes(clipKindForItem(item)));
}

function actionMatchesMime(action: ActionDefinition, items: HistoryItem[]) {
  if (!action.input.mime || items.length === 0) {
    return true;
  }
  return items.every((item) =>
    action.input.mime?.some((pattern) => mimePatternMatches(pattern, item.mime_primary ?? "")),
  );
}

function clipKindForItem(item: HistoryItem): ClipKind {
  switch (item.content_kind) {
    case "text":
      return "text";
    case "html":
      return "html";
    case "image":
      return "image";
    case "fileList":
      return "fileList";
    default:
      return "unknown";
  }
}

function mimePatternMatches(pattern: string, mime: string) {
  if (pattern === "*" || pattern === mime) {
    return true;
  }
  if (pattern.endsWith("/*")) {
    return mime.startsWith(`${pattern.slice(0, -2)}/`);
  }
  return false;
}

function actionSearchText(action: ActionDefinition) {
  return [
    action.title,
    action.description,
    action.id,
    action.shortcut ?? "",
    action.source,
    action.capabilities.join(" "),
    action.script?.fileName ?? "",
  ]
    .join(" ")
    .toLocaleLowerCase();
}

type ShortcutKeyboardEvent = Pick<
  globalThis.KeyboardEvent | ReactKeyboardEvent,
  "code" | "key" | "ctrlKey" | "altKey" | "shiftKey" | "metaKey" | "repeat"
>;

function shortcutFromKeyboardEvent(event: ShortcutKeyboardEvent) {
  const key = shortcutKeyFromKeyboardEvent(event);
  if (!key) {
    return null;
  }
  const hasModifier = event.ctrlKey || event.altKey || event.shiftKey || event.metaKey;
  if (!hasModifier && isPrintableShortcutKey(key)) {
    return null;
  }
  const parts = [];
  if (event.ctrlKey) {
    parts.push("Ctrl");
  }
  if (event.altKey) {
    parts.push("Alt");
  }
  if (event.shiftKey) {
    parts.push("Shift");
  }
  if (event.metaKey) {
    parts.push("Meta");
  }
  parts.push(key);
  return parts.join("+");
}

function compoundShortcutFromKeyboardEvent(event: ShortcutKeyboardEvent) {
  const key = shortcutKeyFromKeyboardEvent(event);
  if (!key) {
    return null;
  }
  const parts = [];
  if (event.ctrlKey) {
    parts.push("Ctrl");
  }
  if (event.altKey) {
    parts.push("Alt");
  }
  if (event.shiftKey) {
    parts.push("Shift");
  }
  if (event.metaKey) {
    parts.push("Meta");
  }
  parts.push(key);
  return parts.join("+");
}

function shortcutKeyFromKeyboardEvent(event: ShortcutKeyboardEvent) {
  const keyFromCode = normalizeShortcutCode(event.code);
  if (keyFromCode) {
    return keyFromCode;
  }
  return normalizeShortcutKey(event.key);
}

function normalizeShortcutString(shortcut: string | null | undefined) {
  if (shortcutContainsSequenceDelimiter(shortcut ?? "")) {
    const steps = (shortcut ?? "")
      .split(/,\s+/)
      .map((step) => normalizeShortcutStepString(step, true))
      .filter((step): step is string => Boolean(step));
    return steps.length > 0 ? steps.join(", ") : null;
  }

  return normalizeShortcutStepString(shortcut ?? "", false);
}

function shortcutHasModifier(shortcut: string) {
  return shortcut.split("+").slice(0, -1).some((part) =>
    ["Ctrl", "Alt", "Shift", "Meta"].includes(part.trim()),
  );
}

function normalizeShortcutStepString(shortcut: string, allowPrintableWithoutModifier: boolean) {
  const rawParts = shortcut
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean);
  if (rawParts.length === 0) {
    return null;
  }

  const modifiers = new Set<string>();
  let key: string | null = null;
  for (const part of rawParts) {
    const normalizedPart = part.toLocaleLowerCase();
    if (["ctrl", "control", "cmdorctrl"].includes(normalizedPart)) {
      modifiers.add("Ctrl");
    } else if (["alt", "option"].includes(normalizedPart)) {
      modifiers.add("Alt");
    } else if (normalizedPart === "shift") {
      modifiers.add("Shift");
    } else if (["meta", "cmd", "command", "win", "super"].includes(normalizedPart)) {
      modifiers.add("Meta");
    } else {
      key = normalizeShortcutKey(part);
    }
  }

  if (!key) {
    return null;
  }
  const ordered = ["Ctrl", "Alt", "Shift", "Meta"].filter((modifier) => modifiers.has(modifier));
  if (!allowPrintableWithoutModifier && ordered.length === 0 && isPrintableShortcutKey(key)) {
    return null;
  }
  return [...ordered, key].join("+");
}

function normalizeShortcutCode(code: string | undefined) {
  if (!code) {
    return null;
  }
  if (/^Key[A-Z]$/.test(code)) {
    return code.slice(3);
  }
  if (/^Digit[0-9]$/.test(code)) {
    return code.slice(5);
  }
  if (/^Numpad[0-9]$/.test(code)) {
    return code.slice(6);
  }
  const namedCodes: Record<string, string> = {
    Backquote: "`",
    Backslash: "\\",
    BracketLeft: "[",
    BracketRight: "]",
    Comma: ",",
    Equal: "=",
    IntlBackslash: "\\",
    Minus: "-",
    Period: ".",
    Quote: "'",
    Semicolon: ";",
    Slash: "/",
    NumpadAdd: "+",
    NumpadDecimal: ".",
    NumpadDivide: "/",
    NumpadMultiply: "*",
    NumpadSubtract: "-",
  };
  return namedCodes[code] ?? null;
}

function shortcutContainsSequenceDelimiter(shortcut: string) {
  return /,\s+/.test(shortcut);
}

function normalizeShortcutKey(key: string) {
  if (key.length === 1) {
    return key === " " ? "Space" : key.toLocaleUpperCase();
  }
  const compact = key.replace(/\s+/g, "").toLocaleLowerCase();
  const namedKeys: Record<string, string> = {
    arrowdown: "ArrowDown",
    arrowleft: "ArrowLeft",
    arrowright: "ArrowRight",
    arrowup: "ArrowUp",
    backspace: "Backspace",
    delete: "Delete",
    del: "Delete",
    end: "End",
    enter: "Enter",
    escape: "Escape",
    esc: "Escape",
    home: "Home",
    insert: "Insert",
    ins: "Insert",
    pagedown: "PageDown",
    pageup: "PageUp",
    return: "Enter",
    space: "Space",
    spacebar: "Space",
    tab: "Tab",
  };
  if (/^f([1-9]|1[0-2])$/.test(compact)) {
    return compact.toLocaleUpperCase();
  }
  return namedKeys[compact] ?? null;
}

function isPrintableShortcutKey(key: string) {
  return key.length === 1 || key === "Space";
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
