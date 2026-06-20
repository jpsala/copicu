import {
  Component,
  StrictMode,
  Suspense,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type SyntheticEvent,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import {
  MantineProvider,
  Menu,
} from "@mantine/core";
import { invoke } from "@tauri-apps/api/core";
import { emitTo, listen, type Event } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useVirtualizer } from "@tanstack/react-virtual";
import CheckCheck from "lucide-react/dist/esm/icons/check-check.mjs";
import CircleSlash from "lucide-react/dist/esm/icons/circle-slash.mjs";
import ClipboardCheck from "lucide-react/dist/esm/icons/clipboard-check.mjs";
import ClipboardPaste from "lucide-react/dist/esm/icons/clipboard-paste.mjs";
import Command from "lucide-react/dist/esm/icons/command.mjs";
import Copy from "lucide-react/dist/esm/icons/copy.mjs";
import FileCode2 from "lucide-react/dist/esm/icons/file-code-2.mjs";
import ListChecks from "lucide-react/dist/esm/icons/list-checks.mjs";
import ListRestart from "lucide-react/dist/esm/icons/list-restart.mjs";
import MoreVertical from "lucide-react/dist/esm/icons/more-vertical.mjs";
import Pencil from "lucide-react/dist/esm/icons/pencil.mjs";
import Plus from "lucide-react/dist/esm/icons/plus.mjs";
import Search from "lucide-react/dist/esm/icons/search.mjs";
import Settings2 from "lucide-react/dist/esm/icons/settings-2.mjs";
import Sparkles from "lucide-react/dist/esm/icons/sparkles.mjs";
import Square from "lucide-react/dist/esm/icons/square.mjs";
import Tags from "lucide-react/dist/esm/icons/tags.mjs";
import Trash2 from "lucide-react/dist/esm/icons/trash-2.mjs";
import X from "lucide-react/dist/esm/icons/x.mjs";
import { copicuMantineTheme } from "./mantineTheme";
import { applyCopicuAppearance } from "./themeCatalog";
import type {
  ActionContext,
  ActionDefinition,
  ActionEffect,
  ActionRunResult,
  ActionTrigger,
  ActivateItemRequest,
  ActivationOptions,
  ClipKind,
  CompoundHotkeyPendingEvent,
  CreateTagRequest,
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
  WhichKeyEntry,
  WhichKeyState,
} from "./shared/contracts";
import { DEFAULT_SETTINGS, normalizeSettings, type AppSettings } from "./shared/settings";
import {
  UiBadge,
  UiButton,
  UiCheckbox,
  UiIconButton,
  UiKbd,
  UiLoader,
  UiAlert,
  UiPaper,
  UiTextarea,
  UiTextInput,
  UiTooltip,
  UiUnstyledButton,
} from "./ui/controls";
import { ShortcutBadge } from "./ui/ShortcutBadge";
import { ToastStack } from "./ui/ToastStack";
import { CustomWindowFrame } from "./ui/window/CustomWindowFrame";
import { recordWindowChromeEvent } from "./ui/window/windowChrome";
import "@mantine/core/styles.css";
import "./styles.css";

type RenderCrashBoundaryProps = {
  children: ReactNode;
};

type RenderCrashBoundaryState = {
  error: Error | null;
};

class RenderCrashBoundary extends Component<
  RenderCrashBoundaryProps,
  RenderCrashBoundaryState
> {
  state: RenderCrashBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): RenderCrashBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("Copicu renderer crashed", error, info.componentStack);
    recordRendererDiagnostic("react-crash", `${error.message}\n${info.componentStack}`);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="renderer-crash">
          <strong>Copicu renderer failed to start.</strong>
          <span>{this.state.error.message}</span>
        </div>
      );
    }

    return this.props.children;
  }
}

type CaptureStats = {
  captured_count: number;
  captured_image_count: number;
  ignored_duplicate_count: number;
  ignored_empty_count: number;
  ignored_image_with_text_count: number;
  self_write_suppressed_count: number;
  read_error_count: number;
  event_count: number;
};

type ClipboardProbe = {
  platform: string;
  sequence_number: number | null;
  format_count: number;
  has_text: boolean;
  has_html: boolean;
  has_rtf: boolean;
  has_image: boolean;
  has_files: boolean;
  file_count: number | null;
  formats: Array<{
    id: number;
    name: string;
    kind: string;
    handle_size_bytes: number | null;
  }>;
};

type CaptureEvent = {
  index: number;
  at_unix_ms: number;
  outcome:
    | "captured_text"
    | "captured_image"
    | "ignored_duplicate_or_coalesced"
    | "ignored_empty"
    | "self_write_suppressed"
    | "read_error";
  has_probe: boolean;
  probe_error: string | null;
  probe: ClipboardProbe | null;
  text_preview: string | null;
  text_char_count: number | null;
};

type CaptureSnapshot = {
  stats: CaptureStats;
  events: CaptureEvent[];
};

type HistoryItem = {
  id: number;
  content_kind: "text" | string;
  text: string;
  preview_text: string;
  text_char_count: number;
  includes_content: boolean;
  normalized_hash: string;
  created_at_unix_ms: number;
  last_used_at_unix_ms: number;
  last_copied_at_unix_ms: number;
  copy_count: number;
  mime_primary: string | null;
  blob_path: string | null;
  thumbnail_path: string | null;
  byte_size: number | null;
  width: number | null;
  height: number | null;
  thumbnail_data_url: string | null;
  title: string | null;
  notes: string | null;
  tags: string | null;
  is_marked: boolean;
  marked_at_unix_ms: number | null;
};

type HistoryPageCursor = {
  afterSortUnixMs: number;
  afterId: number;
};

type HistoryPageRequest = {
  query: string;
  cursor: HistoryPageCursor | null;
  limit: number;
};

type HistorySearchRequest = HistoryPageRequest & {
  mode?: "plain" | "structured" | "ai";
  includeContent?: boolean;
  includeCounts?: boolean;
  explain?: boolean;
  plan?: unknown | null;
  aiContext?: AiScriptContext | null;
};

type HistoryPage = {
  items: HistoryItem[];
  nextCursor: HistoryPageCursor | null;
  totalCount?: number;
  filteredCount?: number;
  interpretedQuery?: string | null;
  explanation?: string | null;
  warnings?: string[];
};

type SearchInterpretation = {
  mode: "ai" | "structured";
  query: string;
  explanation: string | null;
  warnings: string[];
} | null;

type AiScriptContext = {
  currentQuery: string;
  visibleItemIds: number[];
  activeItemId: number | null;
  currentItemId: number | null;
  selectedItemIds: number[];
};

type PickerSessionSnapshot = {
  reset: boolean;
  generation: number;
};

type EditMode = "content" | "metadata";

type EditDraft = {
  id: number;
  mode: EditMode;
  text: string;
  title: string;
  notes: string;
  tags: string;
  mimePrimary: string;
};

type BatchMetadataDraft = {
  ids: number[];
  metadata: string;
};

type MarkdownImage = {
  alt: string;
  src: string;
  raw: string;
};

type MarkdownSegment =
  | { kind: "text"; text: string }
  | { kind: "image"; image: MarkdownImage };

type ItemMenuAnchor = {
  itemId: number;
  x: number;
  y: number;
};

type MarkMenuAnchor = {
  x: number;
  y: number;
};

type CommandPaletteState = {
  query: string;
  activeIndex: number;
};

const outcomeLabel: Record<CaptureEvent["outcome"], string> = {
  captured_text: "Captured",
  captured_image: "Image",
  ignored_duplicate_or_coalesced: "Duplicate",
  ignored_empty: "Empty",
  self_write_suppressed: "Self-write",
  read_error: "No text",
};

const PAGE_STEP = 6;
const HISTORY_PAGE_LIMIT = 60;
const MARKED_ACTION_PAGE_LIMIT = 100;
const HISTORY_PREFETCH_THRESHOLD = 24;
const ITEM_MENU_WIDTH = 154;
const ITEM_MENU_HEIGHT = 270;
const ITEM_MENU_OFFSET = 6;
const DEFAULT_TOAST_DURATION_MS = 3600;
const STICKY_TOAST_DURATION_MS = 0;
const WHICHKEY_REVEAL_DELAY_MS = 300;
const NOTIFICATIONS_WINDOW_LABEL = "notifications";
const UI_HOST_WINDOW_LABEL = "ui-host";
const SETTINGS_WINDOW_LABEL = "settings";
const AI_OUTPUT_WINDOW_LABEL = "ai-output";
const METADATA_WINDOW_LABEL = "metadata";
const WHICHKEY_WINDOW_LABEL = "whichkey";
const NOTIFICATION_TOAST_EVENT = "copicu://toast";
const UI_HOST_REQUEST_EVENT = "copicu://ui-host/request";
const AI_OUTPUT_OPEN_EVENT = "copicu://ai-output/open";
const COMPOUND_HOTKEY_PENDING_EVENT = "copicu://hotkeys/compound-pending";
const SETTINGS_UPDATED_EVENT = "copicu://settings/updated";
const PICKER_FILTER_EVENT = "copicu://picker/filter";
const HISTORY_CHANGED_EVENT = "copicu://history/changed";
const NOTIFICATIONS_WINDOW_WIDTH = 340;
const NOTIFICATION_ROW_HEIGHT = 78;
const NOTIFICATIONS_WINDOW_CHROME = 10;
const NOTIFICATIONS_WINDOW_MAX_HEIGHT = 430;
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

const BUILTIN_ACTIONS = {
  pastePlain: "builtin.pastePlain",
  joinSelected: "builtin.joinSelected",
  openUrl: "builtin.openUrl",
} as const;

const COPY_AND_HIDE_ACTIVATION: ActivationOptions = {
  copy: true,
  markUsed: true,
  hidePicker: true,
  focusPrevious: false,
  paste: false,
  pasteShortcut: "default",
};

const PASTE_AND_HIDE_ACTIVATION: ActivationOptions = {
  copy: true,
  markUsed: true,
  hidePicker: true,
  focusPrevious: true,
  paste: true,
  pasteShortcut: "default",
};

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

function historySearch(request: HistorySearchRequest) {
  return invoke<HistoryPage>("history_search", { request });
}

function getHistoryItem(id: number) {
  return invoke<HistoryItem>("get_history_item", { id });
}

function historySearchInput(
  rawQuery: string,
  forceAi = false,
): Pick<HistorySearchRequest, "query" | "mode"> {
  const trimmed = rawQuery.trim();
  if (trimmed.toLocaleLowerCase().startsWith("ai:")) {
    const aiQuery = trimmed.slice(3).trim();
    if (!aiQuery) {
      return {
        query: "",
        mode: "structured",
      };
    }
    return {
      query: aiQuery,
      mode: "ai",
    };
  }
  if (forceAi && trimmed) {
    return {
      query: trimmed,
      mode: "ai",
    };
  }
  return {
    query: trimmed,
    mode: "structured",
  };
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

function countMarkedHistoryItems() {
  return invoke<number>("count_marked_history_items");
}

function runHostAction(request: RunActionRequest) {
  return invoke<ActionRunResult>("run_action", { request });
}

function handleCompoundHotkeyStep(shortcut: string) {
  return invoke<{
    handled: boolean;
    pending: boolean;
    executed: boolean;
    diagnostic: string | null;
  }>("handle_compound_hotkey_step", { request: { shortcut } });
}

function clearCompoundHotkeyPending() {
  return invoke("clear_compound_hotkey_pending");
}

function hideWhichKeyWindow() {
  return invoke("hide_whichkey_window");
}

function consumePickerSessionSnapshot() {
  return invoke<PickerSessionSnapshot>("consume_picker_session_snapshot");
}

function getCompoundHotkeyPending() {
  return invoke<CompoundHotkeyPendingEvent | null>("get_compound_hotkey_pending");
}

function openSettingsWindow() {
  return invoke("open_settings_window");
}

function openMetadataWindow(itemId: number) {
  return invoke<boolean>("open_metadata_window", { request: { itemId } });
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

function positionNotificationsWindow() {
  return invoke("position_notifications_window");
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

const IS_NOTIFICATIONS_WINDOW = currentWindowLabel() === NOTIFICATIONS_WINDOW_LABEL;
const IS_UI_HOST_WINDOW = currentWindowLabel() === UI_HOST_WINDOW_LABEL;
const IS_SETTINGS_WINDOW = currentWindowLabel() === SETTINGS_WINDOW_LABEL;
const IS_AI_OUTPUT_WINDOW = currentWindowLabel() === AI_OUTPUT_WINDOW_LABEL;
const IS_METADATA_WINDOW = currentWindowLabel() === METADATA_WINDOW_LABEL;
const IS_WHICHKEY_WINDOW = currentWindowLabel() === WHICHKEY_WINDOW_LABEL;

const LazyUiHostApp = lazy(() =>
  import("./windows/secondaryWindows").then((module) => ({ default: module.UiHostApp })),
);
const LazyNotificationsApp = lazy(() =>
  import("./windows/NotificationsApp").then((module) => ({ default: module.NotificationsApp })),
);
const LazySettingsWindowApp = lazy(() =>
  import("./windows/secondaryWindows").then((module) => ({ default: module.SettingsWindowApp })),
);
const LazyWhichKeyWindowApp = lazy(() =>
  import("./windows/WhichKeyWindowApp").then((module) => ({ default: module.WhichKeyWindowApp })),
);
const LazyAiOutputWindowApp = lazy(() =>
  import("./windows/AiOutputWindowApp").then((module) => ({ default: module.AiOutputWindowApp })),
);
const LazyMetadataWindowApp = lazy(() =>
  import("./windows/secondaryWindows").then((module) => ({ default: module.MetadataWindowApp })),
);

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

function itemMenuAnchorFromEvent(itemId: number, event: React.MouseEvent): ItemMenuAnchor {
  const maxX = Math.max(8, window.innerWidth - ITEM_MENU_WIDTH - 8);
  const maxY = Math.max(8, window.innerHeight - ITEM_MENU_HEIGHT - 8);

  return {
    itemId,
    x: clamp(event.clientX + ITEM_MENU_OFFSET, 8, maxX),
    y: clamp(event.clientY + ITEM_MENU_OFFSET, 8, maxY),
  };
}

if (import.meta.env.DEV) {
  Object.assign(window, {
    __copicuDev: {
      invoke,
    },
  });
}

function App() {
  const [stats, setStats] = useState<CaptureStats | null>(null);
  const [probe, setProbe] = useState<ClipboardProbe | null>(null);
  const [events, setEvents] = useState<CaptureEvent[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyInputQuery, setHistoryInputQuery] = useState("");
  const [historyQuery, setHistoryQuery] = useState("");
  const [searchInterpretation, setSearchInterpretation] = useState<SearchInterpretation>(null);
  const [aiComposerMode, setAiComposerMode] = useState(false);
  const [historyPending, setHistoryPending] = useState(false);
  const [aiPlanning, setAiPlanning] = useState(false);
  const [historyLoadingMore, setHistoryLoadingMore] = useState(false);
  const [historyNextCursor, setHistoryNextCursor] = useState<HistoryPageCursor | null>(null);
  const [historyTotalCount, setHistoryTotalCount] = useState<number | null>(null);
  const [historyFilteredCount, setHistoryFilteredCount] = useState<number | null>(null);
  const [markedTotalCount, setMarkedTotalCount] = useState<number | null>(null);
  const [newClipsAvailable, setNewClipsAvailable] = useState(false);
  const [query, setQuery] = useState("");
  const [pickerPinned, setPickerPinned] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
  const [probeError, setProbeError] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);
  const [batchMetadataDraft, setBatchMetadataDraft] = useState<BatchMetadataDraft | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [openMarkMenu, setOpenMarkMenu] = useState<MarkMenuAnchor | null>(null);
  const [markedActionItems, setMarkedActionItems] = useState<HistoryItem[] | null>(null);
  const [markedActionItemsLoading, setMarkedActionItemsLoading] = useState(false);
  const [openItemMenu, setOpenItemMenu] = useState<ItemMenuAnchor | null>(null);
  const [commandPalette, setCommandPalette] = useState<CommandPaletteState | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [actionDefinitions, setActionDefinitions] = useState<ActionDefinition[]>([]);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [whichKeyState, setWhichKeyState] = useState<WhichKeyState | null>(null);
  const searchRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const editTextRef = useRef<HTMLTextAreaElement>(null);
  const historyScrollRef = useRef<HTMLDivElement>(null);
  const historyRef = useRef<HistoryItem[]>([]);
  const historyRequestSeqRef = useRef(0);
  const historyLoadMoreSeqRef = useRef(0);
  const queryRef = useRef(query);
  const selectedIdsRef = useRef<Set<number>>(new Set());
  const selectedItemIdRef = useRef<number | null>(selectedItemId);
  const selectionAnchorItemIdRef = useRef<number | null>(null);
  const nextToastIdRef = useRef(1);
  const compoundHotkeyPendingRef = useRef(false);
  const compoundHotkeyArmedAtRef = useRef(0);
  const whichKeyRevealTimerRef = useRef<number | null>(null);
  const pickerWasHiddenRef = useRef(false);

  const selectedIndex = useMemo(
    () => history.findIndex((item) => item.id === selectedItemId),
    [history, selectedItemId],
  );
  const selectedItem = selectedIndex >= 0 ? history[selectedIndex] : null;
  const selectedItems = useMemo(
    () => history.filter((item) => selectedIds.has(item.id)),
    [history, selectedIds],
  );
  const effectiveSelection = selectedItems.length > 0 ? selectedItems : selectedItem ? [selectedItem] : [];
  const hasMultiSelection = effectiveSelection.length > 1;
  const markedVisibleCount = useMemo(
    () => history.reduce((count, item) => count + (item.is_marked ? 1 : 0), 0),
    [history],
  );
  const visibleMarkedItems = useMemo(
    () => history.filter((item) => item.is_marked),
    [history],
  );
  const markControlState = history.length === 0
    ? "empty"
    : markedVisibleCount === history.length
      ? "checked"
      : markedVisibleCount > 0
        ? "mixed"
        : "unchecked";
  const hasNextHistoryPage = historyNextCursor !== null;
  const virtualRowCount = hasNextHistoryPage ? history.length + 1 : history.length;
  const rowVirtualizer = useVirtualizer({
    count: virtualRowCount,
    getScrollElement: () => historyScrollRef.current,
    measureElement: (element) => element.getBoundingClientRect().height,
    estimateSize: (index) => {
      const item = history[index];
      if (!item) {
        return 38;
      }
      const markdownImageCount = markdownImages(item.text).length;
      if (markdownImageCount > 0) {
        return Math.min(2800, 220 + markdownImageCount * 700);
      }
      if (item.content_kind === "image") {
        return 450;
      }
      return hasMetadata(item) ? 132 : 108;
    },
    getItemKey: (index) => history[index]?.id ?? `loader-${index}`,
    overscan: 24,
  });
  const virtualRows = rowVirtualizer.getVirtualItems();

  const measureImageRow = useCallback(
    (event: SyntheticEvent<HTMLImageElement>) => {
      const row = event.currentTarget.closest("[data-index]");
      if (row instanceof HTMLElement) {
        rowVirtualizer.measureElement(row);
      }
    },
    [rowVirtualizer],
  );

  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  useEffect(() => {
    queryRef.current = query;
  }, [query]);

  useEffect(() => {
    selectedIdsRef.current = selectedIds;
  }, [selectedIds]);

  useEffect(() => {
    selectedItemIdRef.current = selectedItemId;
  }, [selectedItemId]);

  const focusSearch = useCallback(() => {
    window.setTimeout(() => searchRef.current?.focus(), 0);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const pushLocalToast = useCallback(
    (toast: ToastItem) => {
      setToasts((current) => [...current, toast]);

      if (toast.durationMs > 0) {
        window.setTimeout(() => dismissToast(toast.id), toast.durationMs);
      }
    },
    [dismissToast],
  );

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

      if (!IS_NOTIFICATIONS_WINDOW && isTauriRuntime() && currentWindowLabel() === "main") {
        void positionNotificationsWindow()
          .then(() => emitTo(NOTIFICATIONS_WINDOW_LABEL, NOTIFICATION_TOAST_EVENT, toast))
          .catch(() => pushLocalToast(toast));
      } else {
        pushLocalToast(toast);
      }

      return id;
    },
    [pushLocalToast],
  );

  const closeTransientEditors = useCallback(() => {
    setEditDraft(null);
    setBatchMetadataDraft(null);
    setOpenItemMenu(null);
    setEditError(null);
  }, []);

  const resetPickerSession = useCallback(() => {
    closeTransientEditors();
    setCommandPalette(null);
    setOpenMarkMenu(null);
    setActionError(null);
    setAiComposerMode(false);
    setSearchInterpretation(null);
    setNewClipsAvailable(false);
    queryRef.current = "";
    setQuery("");
    setHistoryInputQuery("");
    setHistoryQuery("");
    setSelectedItemId(null);
    setSelectedIds(new Set());
    selectionAnchorItemIdRef.current = null;
    if (searchRef.current) {
      searchRef.current.value = "";
    }
    historyScrollRef.current?.scrollTo({ top: 0 });
  }, [closeTransientEditors]);

  const openSettingsPanel = useCallback(() => {
    setSettingsError(null);
    setCommandPalette(null);
    void openSettingsWindow().catch((error) => setSettingsError(String(error)));
  }, []);

  const openCommandPalette = useCallback(() => {
    closeTransientEditors();
    setCommandPalette({ query: "", activeIndex: 0 });
  }, [closeTransientEditors]);

  const hidePickerWindow = useCallback(() => {
    pickerWasHiddenRef.current = true;
    resetPickerSession();
    void recordWindowChromeEvent("hide-picker-command-start");
    void invoke("hide_picker")
      .then(() => recordWindowChromeEvent("hide-picker-command-ok"))
      .catch((error) => {
        void recordWindowChromeEvent("hide-picker-command-error", String(error));
        console.warn("hide picker failed", error);
      });
  }, [resetPickerSession]);

  const setPickerKeepOpenMode = useCallback((keepOpen: boolean) => {
    const previousSettings = settings;
    const optimisticSettings: AppSettings = {
      ...settings,
      picker: {
        ...settings.picker,
        hideOnFocusLost: !keepOpen,
      },
    };
    setSettings(optimisticSettings);
    void invoke<AppSettings>("set_picker_keep_open", { keepOpen })
      .then((nextSettings) => setSettings(normalizeSettings(nextSettings)))
      .catch((error) => {
        setSettings(previousSettings);
        console.warn("picker keep-open setting update failed", error);
      });
  }, [settings]);

  const clearWhichKeyRevealTimer = useCallback(() => {
    if (whichKeyRevealTimerRef.current !== null) {
      window.clearTimeout(whichKeyRevealTimerRef.current);
      whichKeyRevealTimerRef.current = null;
    }
  }, []);

  const dismissWhichKey = useCallback(() => {
    clearWhichKeyRevealTimer();
    setWhichKeyState(null);
  }, [clearWhichKeyRevealTimer]);

  const syncWhichKeyPending = useCallback(
    (pending: CompoundHotkeyPendingEvent | null) => {
      compoundHotkeyPendingRef.current = Boolean(pending);
      if (pending && compoundHotkeyArmedAtRef.current === 0) {
        compoundHotkeyArmedAtRef.current = Date.now() + 250;
      }
      if (!pending) {
        compoundHotkeyArmedAtRef.current = 0;
      }
      if (!pending) {
        dismissWhichKey();
        return;
      }

      const expiresAtUnixMs = pending.expiresAtUnixMs ?? Date.now() + 3000;
      const entries =
        pending.entries && pending.entries.length > 0
          ? pending.entries
          : pending.nextSteps.map((step) => ({
              key: step,
              label: `Press ${step}`,
              group: "Shortcuts",
              routeId: step,
              disabled: false,
              diagnostic: null,
            }));

      setWhichKeyState((current) => {
        const samePending = current?.prefix === pending.prefixLabel;
        if (samePending && (current.visible || whichKeyRevealTimerRef.current !== null)) {
          return {
            prefix: pending.prefixLabel,
            entries,
            expiresAtUnixMs,
            visible: current.visible,
          };
        }

        clearWhichKeyRevealTimer();
        whichKeyRevealTimerRef.current = window.setTimeout(() => {
          whichKeyRevealTimerRef.current = null;
          setWhichKeyState((nextCurrent) =>
            nextCurrent && nextCurrent.prefix === pending.prefixLabel
              ? { ...nextCurrent, visible: true }
              : nextCurrent,
          );
        }, WHICHKEY_REVEAL_DELAY_MS);

        return {
          prefix: pending.prefixLabel,
          entries,
          expiresAtUnixMs,
          visible: false,
        };
      });
    },
    [clearWhichKeyRevealTimer, dismissWhichKey],
  );

  useEffect(() => () => clearWhichKeyRevealTimer(), [clearWhichKeyRevealTimer]);

  useEffect(() => {
    if (!isTauriRuntime()) {
      return undefined;
    }

    let active = true;
    let unlisten: (() => void) | null = null;
    const syncPending = () => {
      void getCompoundHotkeyPending()
        .then((pending) => {
          if (active) {
            syncWhichKeyPending(pending);
          }
        })
        .catch((error) => {
          if (active) {
            recordRendererDiagnostic("compound-pending-sync-error", String(error));
          }
        });
    };

    syncPending();
    const interval = rendererDebugDiagnosticsEnabled()
      ? window.setInterval(syncPending, 250)
      : null;
    void listen<CompoundHotkeyPendingEvent>(COMPOUND_HOTKEY_PENDING_EVENT, (event) => {
      if (active) {
        syncWhichKeyPending(event.payload);
      }
    }).then((nextUnlisten) => {
      unlisten = nextUnlisten;
    });
    window.addEventListener("focus", syncPending);
    document.addEventListener("visibilitychange", syncPending);

    return () => {
      active = false;
      if (interval !== null) {
        window.clearInterval(interval);
      }
      unlisten?.();
      window.removeEventListener("focus", syncPending);
      document.removeEventListener("visibilitychange", syncPending);
    };
  }, [syncWhichKeyPending]);

  useEffect(() => {
    if (!isTauriRuntime()) {
      return undefined;
    }

    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (!compoundHotkeyPendingRef.current) {
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        compoundHotkeyPendingRef.current = false;
        compoundHotkeyArmedAtRef.current = 0;
        dismissWhichKey();
        void clearCompoundHotkeyPending();
        return;
      }
      if (event.ctrlKey || event.altKey || event.metaKey || Date.now() < compoundHotkeyArmedAtRef.current) {
        return;
      }

      const shortcut = compoundShortcutFromKeyboardEvent(event);
      if (!shortcut) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      void handleCompoundHotkeyStep(shortcut)
        .then((response) => {
          if (response.pending) {
            return getCompoundHotkeyPending().then(syncWhichKeyPending);
          }
          syncWhichKeyPending(null);
          if (response.diagnostic) {
            pushToast({
              title: "Hotkey",
              message: response.diagnostic,
              tone: "warning",
            });
          }
          return undefined;
        })
        .catch((error) => {
          syncWhichKeyPending(null);
          pushToast({
            title: "Hotkey failed",
            message: String(error),
            tone: "danger",
            durationMs: STICKY_TOAST_DURATION_MS,
          });
        });
    };

    document.addEventListener("keydown", onKeyDown, { capture: true });
    return () => {
      document.removeEventListener("keydown", onKeyDown, { capture: true });
    };
  }, [dismissWhichKey, pushToast, syncWhichKeyPending]);

  const actionById = useMemo(
    () => new Map(actionDefinitions.map((action) => [action.id, action])),
    [actionDefinitions],
  );
  const commandPaletteActions = useMemo(
    () =>
      actionDefinitions.filter((action) =>
        actionRunnableForTrigger(action, "commandPalette", itemsForActionContext(action, effectiveSelection, selectedItem)),
      ),
    [actionDefinitions, effectiveSelection],
  );

  const actionContext = useCallback(
    (
      items: HistoryItem[],
      trigger: ActionTrigger = "itemMenu",
      shortcut: string | null = null,
      selectedContextItems: HistoryItem[] = items,
    ): ActionContext => ({
      trigger,
      shortcut,
      activeItemId: items[0]?.id ?? selectedItem?.id ?? null,
      currentItemId: items[0]?.id ?? selectedItem?.id ?? null,
      selectedItemIds: selectedContextItems.map((item) => item.id),
      view: {
        query,
        visibleItemIds: history.map((item) => item.id),
        currentIndex: selectedIndex >= 0 ? selectedIndex : null,
      },
    }),
    [history, query, selectedIndex, selectedItem],
  );

  const applyActionEffects = useCallback(
    async (effects: ActionEffect[] | undefined) => {
      let nextFilterQuery: string | null = null;

      for (const effect of effects ?? []) {
        if (effect.type === "picker.filter") {
          setQuery(effect.query);
          setSelectedIds(new Set());
          setSelectedItemId(null);
          selectionAnchorItemIdRef.current = null;
          setHistoryPending(true);
          nextFilterQuery = effect.query;
        }
      }

      return nextFilterQuery;
    },
    [],
  );

  const refreshMarkedCount = useCallback(async () => {
    const count = await countMarkedHistoryItems();
    setMarkedTotalCount(countOrNull(count));
  }, []);

  const loadMarkedItems = useCallback(async () => {
    const items: HistoryItem[] = [];
    let cursor: HistoryPageCursor | null = null;

    do {
      const page = await historySearch({
        query: "is:marked",
        cursor,
        limit: MARKED_ACTION_PAGE_LIMIT,
        includeContent: false,
      });
      items.push(...page.items);
      cursor = page.nextCursor;
    } while (cursor !== null);

    return items;
  }, []);

  useEffect(() => {
    if (openMarkMenu === null || (markedTotalCount === 0 && visibleMarkedItems.length === 0)) {
      setMarkedActionItems(null);
      setMarkedActionItemsLoading(false);
      return;
    }

    let active = true;
    setMarkedActionItemsLoading(true);
    void loadMarkedItems()
      .then((items) => {
        if (active) {
          setMarkedActionItems(items);
          setMarkedActionItemsLoading(false);
        }
      })
      .catch((error) => {
        if (active) {
          setActionError(String(error));
          setMarkedActionItems(null);
          setMarkedActionItemsLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [loadMarkedItems, markedTotalCount, openMarkMenu, visibleMarkedItems.length]);

  const refreshHistory = useCallback(
    async ({
      resetScroll = false,
      respectManualScroll = false,
      showPending = true,
      queryOverride = null,
      allowAi = true,
    }: {
      resetScroll?: boolean;
      respectManualScroll?: boolean;
      showPending?: boolean;
      queryOverride?: string | null;
      allowAi?: boolean;
    } = {}) => {
      const trimmed = (queryOverride ?? query).trim();
      const originalSearchInput = historySearchInput(trimmed, aiComposerMode);
      let searchInput = originalSearchInput;
      if (!allowAi && searchInput.mode === "ai") {
        if (historyInputQuery === trimmed && historyQuery.trim()) {
          searchInput = { query: historyQuery, mode: "structured" };
        } else {
          return;
        }
      }
      const requestSeq = ++historyRequestSeqRef.current;
      const planningAi = allowAi && searchInput.mode === "ai";
      if (showPending) {
        setHistoryPending(true);
      }
      if (planningAi) {
        setAiPlanning(true);
      }

      let page: HistoryPage;
      try {
        page = await historySearch({
          query: searchInput.query,
          cursor: null,
          limit: HISTORY_PAGE_LIMIT,
          mode: searchInput.mode,
          includeContent: false,
          explain: searchInput.mode === "ai",
          aiContext: searchInput.mode === "ai"
            ? {
                currentQuery: historyQuery,
                visibleItemIds: historyRef.current.map((item) => item.id),
                activeItemId: selectedItemIdRef.current,
                currentItemId: selectedItemIdRef.current,
                selectedItemIds: Array.from(selectedIdsRef.current),
              }
            : null,
        });
      } catch (error) {
        if (requestSeq === historyRequestSeqRef.current) {
          setHistoryPending(false);
          if (planningAi) {
            setAiPlanning(false);
          }
          setHistoryError(String(error));
          setSearchInterpretation(
            trimmed
              ? {
                  mode: searchInput.mode === "ai" ? "ai" : "structured",
                  query: searchInput.query,
                  explanation: searchInput.mode === "ai"
                    ? "AI search failed before Copicu could run local structured search."
                    : null,
                  warnings: [String(error)],
                }
              : null,
          );
        }
        return;
      }

      if (requestSeq !== historyRequestSeqRef.current) {
        return;
      }

      const scrollTop = historyScrollRef.current?.scrollTop ?? 0;
      const incomingFirstId = page.items[0]?.id ?? null;
      const currentFirstId = historyRef.current[0]?.id ?? null;
      if (respectManualScroll && scrollTop > 24) {
        if (
          currentFirstId !== null &&
          incomingFirstId !== null &&
          incomingFirstId !== currentFirstId
        ) {
          setNewClipsAvailable(true);
        }
        setHistoryTotalCount(countOrNull(page.totalCount));
        setHistoryFilteredCount(countOrNull(page.filteredCount));
        void refreshMarkedCount().catch(() => undefined);
        setHistoryPending(false);
        if (planningAi) {
          setAiPlanning(false);
        }
        setHistoryError(null);
        return;
      }

      setHistory(page.items);
      setHistoryNextCursor(page.nextCursor);
      setHistoryTotalCount(countOrNull(page.totalCount));
      setHistoryFilteredCount(countOrNull(page.filteredCount));
      setHistoryInputQuery(trimmed);
      setHistoryQuery(
        originalSearchInput.mode === "ai" ? (page.interpretedQuery ?? searchInput.query) : searchInput.query,
      );
      setSearchInterpretation(
        trimmed && (page.interpretedQuery || page.explanation || (page.warnings?.length ?? 0) > 0)
          ? {
              mode: searchInput.mode === "ai" ? "ai" : "structured",
              query: page.interpretedQuery ?? searchInput.query,
              explanation: page.explanation ?? null,
              warnings: page.warnings ?? [],
            }
          : null,
      );
      setHistoryPending(false);
      if (planningAi) {
        setAiPlanning(false);
      }
      setNewClipsAvailable(false);
      setHistoryError(null);
      setSelectedIds((current) => {
        if (resetScroll) {
          return current.size === 0 ? current : new Set();
        }
        const availableIds = new Set(page.items.map((item) => item.id));
        const nextSelectedIds = new Set(
          Array.from(current).filter((itemId) => availableIds.has(itemId)),
        );
        return nextSelectedIds.size === current.size ? current : nextSelectedIds;
      });
      setSelectedItemId((currentItemId) => {
        if (page.items.length === 0) {
          selectionAnchorItemIdRef.current = null;
          return null;
        }
        if (!resetScroll && currentItemId !== null && page.items.some((item) => item.id === currentItemId)) {
          return currentItemId;
        }
        const nextItemId = page.items[0].id;
        selectionAnchorItemIdRef.current = nextItemId;
        return nextItemId;
      });

      if (resetScroll) {
        historyScrollRef.current?.scrollTo({ top: 0 });
      }
      void refreshMarkedCount().catch(() => undefined);
    },
    [aiComposerMode, historyInputQuery, historyQuery, query, refreshMarkedCount],
  );

  useEffect(() => {
    if (!isTauriRuntime()) {
      return undefined;
    }

    let active = true;
    let unlisten: (() => void) | null = null;

    void listen<{ query: string }>(PICKER_FILTER_EVENT, (event) => {
      if (!active) {
        return;
      }
      const nextQuery = event.payload.query.trim();
      setAiComposerMode(false);
      setQuery(nextQuery);
      setSearchInterpretation(null);
      setSelectedIds(new Set());
      setSelectedItemId(null);
      selectionAnchorItemIdRef.current = null;
      void refreshHistory({
        resetScroll: true,
        queryOverride: nextQuery,
        allowAi: false,
      }).then(focusSearch);
    }).then((nextUnlisten) => {
      unlisten = nextUnlisten;
    });

    return () => {
      active = false;
      unlisten?.();
    };
  }, [focusSearch, refreshHistory]);

  const loadNextHistoryPage = useCallback(async () => {
    if (!historyNextCursor || historyLoadingMore) {
      return;
    }

    const trimmed = query.trim();
    const searchInput = historySearchInput(trimmed, aiComposerMode);
    const cursor = historyNextCursor;
    const loadSeq = ++historyLoadMoreSeqRef.current;
    setHistoryLoadingMore(true);

    try {
      const page = await historySearch({
        query: searchInput.mode === "ai" ? historyQuery : searchInput.query,
        cursor,
        limit: HISTORY_PAGE_LIMIT,
        mode: "structured",
        includeContent: false,
        includeCounts: false,
      });

      if (loadSeq !== historyLoadMoreSeqRef.current || trimmed !== queryRef.current.trim()) {
        return;
      }

      setHistory((current) => {
        const existingIds = new Set(current.map((item) => item.id));
        return [
          ...current,
          ...page.items.filter((item) => !existingIds.has(item.id)),
        ];
      });
      setHistoryNextCursor(page.nextCursor);
      if (page.totalCount !== undefined) {
        setHistoryTotalCount(countOrNull(page.totalCount));
      }
      if (page.filteredCount !== undefined) {
        setHistoryFilteredCount(countOrNull(page.filteredCount));
      }
      setHistoryQuery(searchInput.mode === "ai" ? historyQuery : trimmed);
      setHistoryError(null);
    } catch (error) {
      if (loadSeq === historyLoadMoreSeqRef.current) {
        setHistoryError(String(error));
      }
    } finally {
      if (loadSeq === historyLoadMoreSeqRef.current) {
        setHistoryLoadingMore(false);
        setHistoryPending(false);
      }
    }
  }, [aiComposerMode, historyLoadingMore, historyNextCursor, historyQuery, query]);

  const historyMatchesQuery = historyInputQuery === query.trim() && !historyPending;
  const aiDraftActive = historySearchInput(query.trim(), aiComposerMode).mode === "ai" && !historyMatchesQuery;
  const visibleSearchInterpretation =
    query.trim().length > 0 && searchInterpretation ? searchInterpretation : null;

  const setSingleSelection = useCallback((index: number) => {
    const item = history[index];
    if (!item) {
      setSelectedIds(new Set());
      setSelectedItemId(null);
      selectionAnchorItemIdRef.current = null;
      return;
    }

    setSelectedItemId(item.id);
    setSelectedIds(new Set([item.id]));
    selectionAnchorItemIdRef.current = item.id;
  }, [history]);

  const setRangeSelection = useCallback((toIndex: number) => {
    if (history.length === 0) {
      setSelectedIds(new Set());
      setSelectedItemId(null);
      selectionAnchorItemIdRef.current = null;
      return;
    }

    const nextIndex = clamp(toIndex, 0, history.length - 1);
    const anchorIndex = selectionAnchorItemIdRef.current === null
      ? selectedIndex
      : history.findIndex((item) => item.id === selectionAnchorItemIdRef.current);
    const fromIndex = anchorIndex >= 0 ? anchorIndex : nextIndex;
    const start = Math.min(fromIndex, nextIndex);
    const end = Math.max(fromIndex, nextIndex);
    setSelectedItemId(history[nextIndex].id);
    setSelectedIds(new Set(history.slice(start, end + 1).map((item) => item.id)));
  }, [history, selectedIndex]);

  const moveSelection = useCallback(
    (delta: number, extend: boolean) => {
      if (history.length === 0) {
        setSelectedItemId(null);
        setSelectedIds(new Set());
        return;
      }

      const currentIndex = selectedIndex >= 0 ? selectedIndex : delta < 0 ? history.length : -1;
      const nextIndex = clamp(currentIndex + delta, 0, history.length - 1);
      if (extend) {
        if (selectionAnchorItemIdRef.current === null && selectedItem) {
          selectionAnchorItemIdRef.current = selectedItem.id;
        }
        setRangeSelection(nextIndex);
      } else {
        setSingleSelection(nextIndex);
      }
      rowVirtualizer.scrollToIndex(nextIndex, { align: "auto" });
    },
    [history.length, rowVirtualizer, selectedIndex, selectedItem, setRangeSelection, setSingleSelection],
  );

  const activateItem = useCallback(
    async (
      item: HistoryItem | null,
      activation: ActivationOptions = COPY_AND_HIDE_ACTIVATION,
    ) => {
      if (!item) {
        return;
      }

      try {
        setActionError(null);
        setOpenItemMenu(null);
        const effectiveActivation = pickerPinned || !settings.picker.hideOnFocusLost
          ? {
              ...activation,
              hidePicker: false,
            }
          : activation;
        await activateHostItem({
          itemId: item.id,
          ...effectiveActivation,
        });
        if (effectiveActivation.hidePicker) {
          pickerWasHiddenRef.current = true;
          resetPickerSession();
        }
      } catch (error) {
        setActionError(String(error));
        focusSearch();
      }
    },
    [focusSearch, pickerPinned, resetPickerSession, settings.picker.hideOnFocusLost],
  );

  const runActionDefinition = useCallback(
    async (
      action: ActionDefinition,
      items: HistoryItem[],
      trigger: ActionTrigger,
      shortcut: string | null = null,
    ) => {
      const contextItems = itemsForActionContext(action, items, items.length === 1 ? items[0] : selectedItem);
      const selectedContextItems =
        action.input.selection === "active" && action.input.source !== "none" ? items : contextItems;
      if (!actionRunnableForTrigger(action, trigger, contextItems)) {
        return;
      }

      try {
        setActionError(null);
        setOpenItemMenu(null);
        setOpenMarkMenu(null);
        setCommandPalette(null);
        const result = await runHostAction({
          actionId: action.id,
          context: actionContext(contextItems, trigger, shortcut, selectedContextItems),
        });

        const resultToasts = result.toasts ?? [];
        if (resultToasts.length > 0) {
          resultToasts.forEach((toast) => pushToast(toast));
        }
        const effectQuery = await applyActionEffects(result.effects);
        if (result.status === "failed") {
          throw new Error(result.message);
        } else {
          if (resultToasts.length === 0) {
            pushToast({
              title: action.title,
              message: result.message,
              tone: "success",
              durationMs: DEFAULT_TOAST_DURATION_MS,
            });
          }
        }
        await refreshHistory({ showPending: false, queryOverride: effectQuery });
        focusSearch();
      } catch (error) {
        const message = String(error);
        setActionError(message);
        pushToast({
          title: `${action.title} failed`,
          message,
          tone: "danger",
          durationMs: STICKY_TOAST_DURATION_MS,
        });
        focusSearch();
      }
    },
    [actionContext, applyActionEffects, focusSearch, pushToast, refreshHistory],
  );

  const runLocalShortcutAction = useCallback(
    (keyboardEvent: ReactKeyboardEvent<HTMLElement>) => {
      const shortcut = shortcutFromKeyboardEvent(keyboardEvent);
      if (!shortcut) {
        return false;
      }

      const action = actionDefinitions.find((candidate) => {
        if (candidate.source !== "script") {
          return false;
        }
        const candidateShortcut = normalizeShortcutString(candidate.shortcut ?? "");
        if (candidateShortcut !== shortcut) {
          return false;
        }
        return actionRunnableForTrigger(
          candidate,
          "localShortcut",
          itemsForActionContext(candidate, effectiveSelection, selectedItem),
        );
      });
      if (!action) {
        return false;
      }

      keyboardEvent.preventDefault();
      void runActionDefinition(action, effectiveSelection, "localShortcut", shortcut);
      return true;
    },
    [actionDefinitions, effectiveSelection, runActionDefinition],
  );

  const runBuiltinAction = useCallback(
    async (actionId: string, items: HistoryItem[]) => {
      const definition = actionById.get(actionId);
      if (!definition) {
        return;
      }
      await runActionDefinition(definition, items, "itemMenu");
    },
    [actionById, runActionDefinition],
  );

  const ensureFullHistoryItem = useCallback(async (item: HistoryItem) => {
    if (item.includes_content) {
      return item;
    }
    const fullItem = await getHistoryItem(item.id);
    setHistory((current) =>
      current.map((currentItem) => (currentItem.id === fullItem.id ? fullItem : currentItem)),
    );
    return fullItem;
  }, []);

  const beginEdit = useCallback(
    async (item: HistoryItem, mode: EditMode) => {
      try {
        setEditError(null);
        setOpenItemMenu(null);
        if (mode === "metadata" && isTauriRuntime()) {
          try {
            const openedStandalone = await openMetadataWindow(item.id);
            if (openedStandalone) {
              focusSearch();
              return;
            }
          } catch (openError) {
            if (import.meta.env.VITE_COPICU_VISUAL_TEST !== "1") {
              throw openError;
            }
          }
        }
        const fullItem = await ensureFullHistoryItem(item);
        setEditDraft({
          id: fullItem.id,
          mode,
          text: fullItem.text,
          title: fullItem.title ?? "",
          notes: fullItem.notes ?? "",
          tags: fullItem.tags ?? "",
          mimePrimary: fullItem.mime_primary ?? "",
        });
        window.setTimeout(() => editTextRef.current?.focus(), 0);
      } catch (error) {
        setEditError(String(error));
        focusSearch();
      }
    },
    [ensureFullHistoryItem, focusSearch],
  );

  const deleteItem = useCallback(
    async (item: HistoryItem) => {
      try {
        setActionError(null);
        setOpenItemMenu(null);
        setOpenMarkMenu(null);
        await invoke("delete_history_item", { id: item.id });
        setSelectedIds((current) => {
          const nextSelectedIds = new Set(current);
          nextSelectedIds.delete(item.id);
          return nextSelectedIds;
        });
        await refreshHistory();
        focusSearch();
      } catch (error) {
        setActionError(String(error));
        focusSearch();
      }
    },
    [focusSearch, refreshHistory],
  );

  const deleteItems = useCallback(
    async (items: HistoryItem[]) => {
      if (items.length === 0) {
        return;
      }

      try {
        setActionError(null);
        setOpenItemMenu(null);
        setOpenMarkMenu(null);
        for (const item of items) {
          await invoke("delete_history_item", { id: item.id });
        }
        setSelectedIds(new Set());
        await refreshHistory();
        focusSearch();
      } catch (error) {
        setActionError(String(error));
        focusSearch();
      }
    },
    [focusSearch, refreshHistory],
  );

  const refreshAfterMarkedChange = useCallback(async () => {
    await refreshHistory({ respectManualScroll: true, showPending: false });
    await refreshMarkedCount();
    focusSearch();
  }, [focusSearch, refreshHistory, refreshMarkedCount]);

  const setItemsMarked = useCallback(
    async (items: HistoryItem[], marked: boolean) => {
      if (items.length === 0) {
        return;
      }

      try {
        setActionError(null);
        setOpenMarkMenu(null);
        const ids = items.map((item) => item.id);
        const idSet = new Set(ids);
        await setHistoryItemsMarked({ ids, marked });
        setHistory((current) =>
          current.map((item) =>
            idSet.has(item.id)
              ? {
                  ...item,
                  is_marked: marked,
                  marked_at_unix_ms: marked ? Date.now() : null,
                }
              : item,
          ),
        );
        await refreshAfterMarkedChange();
      } catch (error) {
        setActionError(String(error));
        focusSearch();
      }
    },
    [focusSearch, refreshAfterMarkedChange],
  );

  const toggleItemMarked = useCallback(
    async (item: HistoryItem) => {
      await setItemsMarked([item], !item.is_marked);
    },
    [setItemsMarked],
  );

  const setCurrentQueryMarked = useCallback(
    async (marked: boolean) => {
      try {
        setActionError(null);
        setOpenMarkMenu(null);
        const trimmed = query.trim();
        const markQuery =
          aiComposerMode && historyInputQuery === trimmed && historyQuery.trim()
            ? historyQuery.trim()
            : trimmed;
        if (aiComposerMode && markQuery === trimmed) {
          setActionError("Mark all results needs a structured filter outside AI mode.");
          focusSearch();
          return;
        }
        await setHistoryQueryMarked({ query: markQuery, marked });
        await refreshAfterMarkedChange();
      } catch (error) {
        setActionError(String(error));
        focusSearch();
      }
    },
    [aiComposerMode, focusSearch, historyInputQuery, historyQuery, query, refreshAfterMarkedChange],
  );

  const showMarkMenu = useCallback((event: React.MouseEvent) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setOpenItemMenu(null);
    setOpenMarkMenu((current) =>
      current ? null : { x: Math.round(rect.left), y: Math.round(rect.bottom + 4) },
    );
  }, []);

  const showMarkedFilter = useCallback((mode: "all" | "marked" | "unmarked") => {
    setOpenMarkMenu(null);
    setSelectedItemId(null);
    setSelectedIds(new Set());
    selectionAnchorItemIdRef.current = null;
    const baseQuery = aiComposerMode ? "" : removeMarkedQueryTerms(query);
    const nextQuery =
      mode === "all"
        ? baseQuery
        : appendMarkedQueryTerm(baseQuery, mode === "marked" ? "is:marked" : "-is:marked");
    setQuery(nextQuery);
    void refreshHistory({ resetScroll: true, queryOverride: nextQuery, allowAi: false }).catch((error) => {
      setHistoryPending(false);
      setHistoryError(String(error));
    });
    focusSearch();
  }, [aiComposerMode, focusSearch, query, refreshHistory]);

  const selectForContextMenu = useCallback((item: HistoryItem, index: number) => {
    if (selectedIds.has(item.id)) {
      setSelectedItemId(item.id);
      return;
    }

    setSingleSelection(index);
  }, [selectedIds, setSingleSelection]);

  const showItemMenu = useCallback((item: HistoryItem, index: number, event: React.MouseEvent) => {
    selectForContextMenu(item, index);
    setActionError(null);
    setOpenItemMenu(itemMenuAnchorFromEvent(item.id, event));
  }, [selectForContextMenu]);

  const toggleItemMenu = useCallback((item: HistoryItem, index: number, event: React.MouseEvent) => {
    selectForContextMenu(item, index);
    setActionError(null);
    const nextAnchor = itemMenuAnchorFromEvent(item.id, event);
    setOpenItemMenu((current) => (current?.itemId === item.id ? null : nextAnchor));
  }, [selectForContextMenu]);

  const beginBatchMetadataEdit = useCallback((items: HistoryItem[]) => {
    if (items.length === 0) {
      return;
    }

    setEditError(null);
    setOpenItemMenu(null);
    setOpenMarkMenu(null);
    setBatchMetadataDraft({
      ids: items.map((item) => item.id),
      metadata: "",
    });
    window.setTimeout(() => editTextRef.current?.focus(), 0);
  }, []);

  const renderBatchItemActions = useCallback(
    ({
      items,
      noun,
      count,
      onClear,
    }: {
      items: HistoryItem[];
      noun: "selected" | "checked";
      count: number;
      onClear?: () => void;
    }) => {
      const hasItems = items.length > 0;
      const countLabel = formatCount(count);
      const scriptActions = hasItems
        ? itemMenuScriptActions(actionDefinitions, items, items.length === 1 ? items[0] : selectedItem)
        : [];

      return (
        <>
          {actionById.has(BUILTIN_ACTIONS.joinSelected) ? (
            <UiUnstyledButton
              type="button"
              role="menuitem"
              className="item-menu-action"
              disabled={!hasItems}
              onClick={() => {
                if (hasItems) {
                  void runBuiltinAction(BUILTIN_ACTIONS.joinSelected, items);
                }
              }}
            >
              <Command size={14} strokeWidth={2.2} aria-hidden="true" />
              <span>Join {noun}</span>
            </UiUnstyledButton>
          ) : null}
          {scriptActions.map((action) => (
            <UiUnstyledButton
              key={action.id}
              type="button"
              role="menuitem"
              className="item-menu-action"
              onClick={() => void runActionDefinition(action, items, "itemMenu")}
            >
              <FileCode2 size={14} strokeWidth={2.2} aria-hidden="true" />
              <span>{action.title}</span>
              <ShortcutBadge shortcut={normalizeShortcutString(action.shortcut)} />
            </UiUnstyledButton>
          ))}
          <UiUnstyledButton
            type="button"
            role="menuitem"
            className="item-menu-action"
            disabled={!hasItems}
            onClick={() => {
              if (hasItems) {
                beginBatchMetadataEdit(items);
              }
            }}
          >
            <Plus size={14} strokeWidth={2.2} aria-hidden="true" />
            <span>Add metadata to {noun}</span>
          </UiUnstyledButton>
          <UiUnstyledButton
            type="button"
            role="menuitem"
            className="item-menu-action is-danger"
            disabled={!hasItems}
            onClick={() => {
              if (hasItems) {
                void deleteItems(items);
              }
            }}
          >
            <Trash2 size={14} strokeWidth={2.2} aria-hidden="true" />
            <span>Delete {countLabel} {noun}</span>
          </UiUnstyledButton>
          {onClear ? (
            <UiUnstyledButton
              type="button"
              role="menuitem"
              className="item-menu-action"
              onClick={onClear}
            >
              <X size={14} strokeWidth={2.2} aria-hidden="true" />
              <span>Clear selection</span>
            </UiUnstyledButton>
          ) : null}
        </>
      );
    },
    [
      actionById,
      actionDefinitions,
      beginBatchMetadataEdit,
      deleteItems,
      runActionDefinition,
      runBuiltinAction,
      selectedItem,
    ],
  );

  const beginSelectedItemEdit = useCallback(
    (mode: EditMode) => {
      if (!selectedItem || hasMultiSelection) {
        return;
      }
      void beginEdit(selectedItem, mode);
    },
    [beginEdit, hasMultiSelection, selectedItem],
  );

  const saveEdit = useCallback(async () => {
    if (!editDraft) {
      return;
    }

    const request: UpdateHistoryItemRequest = {
      id: editDraft.id,
      text: editDraft.text,
      title: nullableTrim(editDraft.title),
      notes: nullableTrim(editDraft.notes),
      tags: metadataTags(editDraft.notes),
      mimePrimary: nullableTrim(editDraft.mimePrimary),
    };

    try {
      setEditError(null);
      await invoke("update_history_item", { request });
      setEditDraft(null);
      await refreshHistory();
      focusSearch();
    } catch (error) {
      setEditError(String(error));
      window.setTimeout(() => editTextRef.current?.focus(), 0);
    }
  }, [editDraft, focusSearch, refreshHistory]);

  const saveBatchMetadata = useCallback(async () => {
    if (!batchMetadataDraft) {
      return;
    }

    const selectedItemsById = new Map(history.map((item) => [item.id, item]));
    const itemsToUpdate = batchMetadataDraft.ids
      .map((id) => selectedItemsById.get(id))
      .filter((item): item is HistoryItem => Boolean(item));
    const metadataToAdd = batchMetadataDraft.metadata.trim();

    if (itemsToUpdate.length === 0 || metadataToAdd.length === 0) {
      setBatchMetadataDraft(null);
      focusSearch();
      return;
    }

    try {
      setEditError(null);
      const fullItemsToUpdate = await Promise.all(itemsToUpdate.map(ensureFullHistoryItem));
      for (const item of fullItemsToUpdate) {
        const nextNotes = appendMetadata(item.notes, metadataToAdd);
        const request: UpdateHistoryItemRequest = {
          id: item.id,
          text: item.text,
          title: item.title,
          notes: nextNotes,
          tags: metadataTags(nextNotes),
          mimePrimary: item.mime_primary,
        };
        await invoke("update_history_item", { request });
      }
      setBatchMetadataDraft(null);
      await refreshHistory();
      focusSearch();
    } catch (error) {
      setEditError(String(error));
      window.setTimeout(() => editTextRef.current?.focus(), 0);
    }
  }, [batchMetadataDraft, ensureFullHistoryItem, focusSearch, history, refreshHistory]);

  useEffect(() => {
    let active = true;

    listActions()
      .then((actions) => {
        if (active) {
          setActionDefinitions(actions);
        }
      })
      .catch((error) => {
        if (active) {
          pushToast({
            title: "Actions unavailable",
            message: String(error),
            tone: "danger",
            durationMs: STICKY_TOAST_DURATION_MS,
          });
        }
      });

    return () => {
      active = false;
    };
  }, [pushToast]);

  useEffect(() => {
    let active = true;

    invoke<AppSettings>("get_settings")
      .then((nextSettings) => {
        if (active) {
          setSettings(normalizeSettings(nextSettings));
        }
      })
      .catch((error) => {
        if (active) {
          setSettingsError(String(error));
        }
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!isTauriRuntime()) {
      return undefined;
    }

    let active = true;
    let unlisten: (() => void) | null = null;

    void listen<AppSettings>(SETTINGS_UPDATED_EVENT, (event: Event<AppSettings>) => {
      if (active) {
        setSettings(normalizeSettings(event.payload));
        setSettingsError(null);
      }
    }).then((nextUnlisten) => {
      unlisten = nextUnlisten;
    });

    return () => {
      active = false;
      unlisten?.();
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

  useEffect(() => {
    focusSearch();
    window.addEventListener("focus", focusSearch);
    return () => window.removeEventListener("focus", focusSearch);
  }, [focusSearch]);

  useEffect(() => {
    const closeEditorsWhenWindowHides = () => {
      if (document.visibilityState === "hidden") {
        closeTransientEditors();
      }
    };

    document.addEventListener("visibilitychange", closeEditorsWhenWindowHides);
    return () => document.removeEventListener("visibilitychange", closeEditorsWhenWindowHides);
  }, [closeTransientEditors]);

  useEffect(() => {
    if (!editDraft) {
      return;
    }

    window.setTimeout(() => editTextRef.current?.focus(), 0);
  }, [editDraft?.id]);

  useEffect(() => {
    if (!isTauriRuntime() || !rendererDebugDiagnosticsEnabled()) {
      return undefined;
    }

    let active = true;

    const refreshSnapshot = async () => {
      const nextSnapshot = await invoke<CaptureSnapshot>("get_capture_snapshot");
      const nextProbe = await invoke<ClipboardProbe>("get_clipboard_probe");
      if (active) {
        setStats(nextSnapshot.stats);
        setEvents(nextSnapshot.events);
        setProbe(nextProbe);
        setProbeError(null);
      }
    };

    refreshSnapshot().catch((error) => {
      if (active) {
        setProbeError(String(error));
      }
    });
    const intervalId = window.setInterval(refreshSnapshot, 900);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    let active = true;
    const searchInput = historySearchInput(query.trim(), aiComposerMode);
    if (searchInput.mode === "ai") {
      setHistoryPending(false);
      setHistoryError(null);
      return () => {
        active = false;
      };
    }
    setHistoryPending(true);
    const timeoutId = window.setTimeout(() => {
      refreshHistory({ resetScroll: true }).catch((error) => {
        if (active) {
          setHistoryPending(false);
          setHistoryError(String(error));
        }
      });
    }, 120);

    const intervalId = rendererDebugDiagnosticsEnabled()
      ? window.setInterval(() => {
          refreshHistory({ respectManualScroll: true, showPending: false, allowAi: false }).catch((error) => {
            if (active) {
              setHistoryPending(false);
              setHistoryError(String(error));
            }
          });
        }, 1400)
      : null;

    return () => {
      active = false;
      window.clearTimeout(timeoutId);
      if (intervalId !== null) {
        window.clearInterval(intervalId);
      }
    };
  }, [refreshHistory]);

  useEffect(() => {
    if (!isTauriRuntime()) {
      return undefined;
    }

    let active = true;
    let unlisten: (() => void) | null = null;
    void listen<{ itemId: number; contentKind: "text" | "image" }>(HISTORY_CHANGED_EVENT, () => {
      if (!active) {
        return;
      }
      if (document.visibilityState === "hidden") {
        pickerWasHiddenRef.current = true;
        return;
      }
      void refreshHistory({ respectManualScroll: true, showPending: false, allowAi: false }).catch((error) => {
        if (active) {
          setHistoryPending(false);
          setHistoryError(String(error));
        }
      });
    }).then((nextUnlisten) => {
      unlisten = nextUnlisten;
    });

    const refreshOnFocus = () => {
      if (!active) {
        return;
      }
      if (document.visibilityState === "hidden") {
        pickerWasHiddenRef.current = true;
        return;
      }

      void (async () => {
        let resetFromHost = false;
        try {
          const session = await consumePickerSessionSnapshot();
          resetFromHost = session.reset;
        } catch (error) {
          console.warn("consume picker session failed", error);
        }
        if (!active) {
          return;
        }
        if (resetFromHost) {
          pickerWasHiddenRef.current = true;
        }
        const resetAfterHidden = pickerWasHiddenRef.current;
        pickerWasHiddenRef.current = false;
        if (resetAfterHidden) {
          resetPickerSession();
        }
        void refreshHistory({
          resetScroll: resetAfterHidden,
          respectManualScroll: !resetAfterHidden,
          showPending: false,
          queryOverride: resetAfterHidden ? "" : null,
          allowAi: false,
        }).catch((error) => {
          if (active) {
            setHistoryPending(false);
            setHistoryError(String(error));
          }
        });
      })();
    };
    window.addEventListener("focus", refreshOnFocus);
    document.addEventListener("visibilitychange", refreshOnFocus);

    return () => {
      active = false;
      unlisten?.();
      window.removeEventListener("focus", refreshOnFocus);
      document.removeEventListener("visibilitychange", refreshOnFocus);
    };
  }, [refreshHistory, resetPickerSession]);

  useEffect(() => {
    const [lastVirtualRow] = [...virtualRows].reverse();
    if (!lastVirtualRow) {
      return;
    }
    if (
      lastVirtualRow.index >= history.length - HISTORY_PREFETCH_THRESHOLD &&
      hasNextHistoryPage &&
      !historyLoadingMore
    ) {
      void loadNextHistoryPage();
    }
  }, [
    hasNextHistoryPage,
    history.length,
    historyLoadingMore,
    loadNextHistoryPage,
    virtualRows,
  ]);

  const isFilteringHistory = !historyMatchesQuery && !aiDraftActive;
  const searchStatus = useMemo(() => {
    if (historyError) {
      return "Storage unavailable";
    }
    if (aiPlanning) {
      return "AI planning";
    }
    if (aiDraftActive) {
      return "AI draft";
    }
    if (!historyMatchesQuery) {
      return "Filtering";
    }
    if (newClipsAvailable) {
      return "New clips";
    }
    const totalCount = historyTotalCount ?? history.length;
    const filteredCount = historyFilteredCount ?? history.length;
    if (query.trim()) {
      return `${formatCount(filteredCount)} / ${formatCount(totalCount)} matches`;
    }
    return `${formatCount(totalCount)} total`;
  }, [
    history.length,
    aiDraftActive,
    aiPlanning,
    historyError,
    historyFilteredCount,
    historyMatchesQuery,
    historyTotalCount,
    newClipsAvailable,
    query,
  ]);
  const markMenuCountLabel = query.trim()
    ? formatCount(historyFilteredCount ?? history.length)
    : markedTotalCount !== null && markedTotalCount > 0
      ? formatCount(markedTotalCount)
      : null;
  const markMenuCountAria = query.trim() ? "filtered" : "checked";
  const checkedActionItems = markedActionItems ?? visibleMarkedItems;
  const checkedActionCount = markedTotalCount ?? checkedActionItems.length;
  const searchControlBaseProps = {
    className: "search-input",
    variant: "unstyled" as const,
    "aria-label": "Search clipboard history",
    "aria-controls": "clipboard-feed",
    "aria-activedescendant": selectedItem ? `history-item-${selectedItem.id}` : undefined,
    value: query,
    placeholder: aiComposerMode ? "Ask Copicu AI" : 'Search, "phrase", tag:work, kind:image',
    title:
      'Search supports "phrases", -exclude, tag:name, kind:text/image, mime:image/*, has:notes/title/tags, after:YYYY-MM-DD, before:YYYY-MM-DD.',
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setQuery(event.currentTarget.value);
      setHistoryPending(true);
      setAiPlanning(false);
      setActionError(null);
      setSearchInterpretation(null);
      setSelectedItemId(null);
      setSelectedIds(new Set());
      selectionAnchorItemIdRef.current = null;
    },
    onKeyDown: (event: ReactKeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === "k") {
        event.preventDefault();
        openCommandPalette();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === "i") {
        event.preventDefault();
        setAiComposerMode((current) => !current);
        setSearchInterpretation(null);
        window.setTimeout(() => searchRef.current?.focus(), 0);
        return;
      }
      const settingsShortcut = normalizeShortcutString(settings.picker.settingsShortcut);
      if (settingsShortcut && shortcutFromKeyboardEvent(event) === settingsShortcut) {
        event.preventDefault();
        void openSettingsWindow();
        return;
      }
      if (runLocalShortcutAction(event)) {
        return;
      }

      switch (event.key) {
        case "ArrowDown":
          event.preventDefault();
          moveSelection(1, event.shiftKey);
          break;
        case "ArrowUp":
          event.preventDefault();
          moveSelection(-1, event.shiftKey);
          break;
        case "PageDown":
          event.preventDefault();
          moveSelection(PAGE_STEP, event.shiftKey);
          break;
        case "PageUp":
          event.preventDefault();
          moveSelection(-PAGE_STEP, event.shiftKey);
          break;
        case "Home":
          event.preventDefault();
          if (event.shiftKey) {
            setRangeSelection(0);
          } else {
            setSingleSelection(0);
          }
          rowVirtualizer.scrollToIndex(0, { align: "auto" });
          break;
        case "End":
          event.preventDefault();
          {
            const lastIndex = history.length === 0 ? 0 : history.length - 1;
            if (event.shiftKey) {
              setRangeSelection(lastIndex);
            } else {
              setSingleSelection(lastIndex);
            }
            rowVirtualizer.scrollToIndex(lastIndex, { align: "auto" });
          }
          break;
        case "Escape":
          event.preventDefault();
          setActionError(null);
          if (openMarkMenu !== null) {
            setOpenMarkMenu(null);
          }
          if (openItemMenu !== null) {
            setOpenItemMenu(null);
          }
          hidePickerWindow();
          break;
        case "F2":
          event.preventDefault();
          beginSelectedItemEdit(event.shiftKey ? "metadata" : "content");
          break;
        case "Enter":
          event.preventDefault();
          if ((aiDraftActive && !event.shiftKey) || event.ctrlKey || event.metaKey) {
            void refreshHistory({ resetScroll: true, allowAi: true });
          } else if (historyMatchesQuery && !hasMultiSelection) {
            void activateItem(
              selectedItem,
              activationForEnter(settings.picker.enterAction, event.shiftKey),
            );
          }
          break;
      }
    },
  };
  const searchTextInputProps = searchControlBaseProps as typeof searchControlBaseProps & {
    onChange: (event: ChangeEvent<HTMLInputElement>) => void;
    onKeyDown: (event: ReactKeyboardEvent<HTMLInputElement>) => void;
  };
  const searchTextareaProps = searchControlBaseProps as typeof searchControlBaseProps & {
    onChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
    onKeyDown: (event: ReactKeyboardEvent<HTMLTextAreaElement>) => void;
  };

  return (
    <main className="app-shell">
      <CustomWindowFrame
        controls={["pin", "keep-open", "minimize", "maximize", "hide"]}
        hideLabel="Hide Copicu"
        keepOpen={!settings.picker.hideOnFocusLost}
        pinShortcutLabel={settings.picker.pinToggleShortcut}
        title="Copicu"
        variant="floatingPicker"
        onHide={hidePickerWindow}
        onKeepOpenChange={setPickerKeepOpenMode}
        onPinChange={setPickerPinned}
      >
      <section className="picker-panel" aria-label="Copicu">
        <div className={`search-row${aiComposerMode ? " is-ai-mode" : ""}`}>
          <div className="mark-control">
            <Menu
              withinPortal
              position="bottom-start"
              opened={openMarkMenu !== null}
              onChange={(opened) => setOpenMarkMenu(opened ? { x: 0, y: 0 } : null)}
            >
              <Menu.Target>
                <UiIconButton
                  type="button"
                  className={`mark-menu-button${markMenuCountLabel ? " has-count" : ""}`}
                  aria-label={
                    markMenuCountLabel
                      ? `Mark options, ${markMenuCountLabel} ${markMenuCountAria}`
                      : "Mark options"
                  }
                  aria-expanded={openMarkMenu !== null}
                  data-mark-state={markControlState}
                  disabled={history.length === 0 && !query.trim()}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={showMarkMenu}
                >
                  <span
                    className="mark-state-icon"
                    data-state={markControlState}
                    aria-hidden="true"
                  />
                  {markMenuCountLabel ? (
                    <span className="mark-menu-count" aria-hidden="true">
                      {markMenuCountLabel}
                    </span>
                  ) : null}
                </UiIconButton>
              </Menu.Target>
              <Menu.Dropdown aria-label="Mark options">
                <Menu.Item
                  leftSection={<CheckCheck size={14} strokeWidth={2.2} />}
                  onClick={() => void setItemsMarked(history, true)}
                >
                  All visible
                </Menu.Item>
                <Menu.Item
                  leftSection={<Square size={14} strokeWidth={2.2} />}
                  onClick={() => void setItemsMarked(history, false)}
                >
                  None visible
                </Menu.Item>
                <Menu.Item
                  leftSection={<ListChecks size={14} strokeWidth={2.2} />}
                  onClick={() => void setCurrentQueryMarked(true)}
                >
                  All results
                </Menu.Item>
                <Menu.Item
                  leftSection={<CircleSlash size={14} strokeWidth={2.2} />}
                  onClick={() => void setCurrentQueryMarked(false)}
                >
                  None results
                </Menu.Item>
                <Menu.Divider />
                <Menu.Item
                  leftSection={<CheckCheck size={14} strokeWidth={2.2} />}
                  onClick={() => showMarkedFilter("marked")}
                >
                  Marked
                </Menu.Item>
                <Menu.Item
                  leftSection={<Square size={14} strokeWidth={2.2} />}
                  onClick={() => showMarkedFilter("unmarked")}
                >
                  Unmarked
                </Menu.Item>
                <Menu.Item
                  leftSection={<ListRestart size={14} strokeWidth={2.2} />}
                  onClick={() => showMarkedFilter("all")}
                >
                  All history
                </Menu.Item>
                {checkedActionCount > 0 ? (
                  <>
                    <Menu.Divider />
                    <div className="mark-menu-section-label">
                      Checked items
                      {markedActionItemsLoading ? (
                        <span>Loading</span>
                      ) : (
                        <span>{formatCount(checkedActionCount)}</span>
                      )}
                    </div>
                    {renderBatchItemActions({
                      items: checkedActionItems,
                      noun: "checked",
                      count: checkedActionCount,
                    })}
                  </>
                ) : null}
              </Menu.Dropdown>
            </Menu>
          </div>
          {aiComposerMode ? (
            <UiTextarea
              {...searchTextareaProps}
              ref={(node) => {
                searchRef.current = node;
              }}
              minRows={3}
              maxRows={6}
              autosize
            />
          ) : (
            <UiTextInput
              {...searchTextInputProps}
              ref={(node) => {
                searchRef.current = node;
              }}
            />
          )}
          <UiTooltip
            label={(
              <span className="tooltip-shortcut-label">
                <span>{aiComposerMode ? "AI mode, switch to search" : "Search mode, switch to AI"}</span>
                <ShortcutBadge shortcut="Ctrl+I" />
              </span>
            )}
          >
            <UiIconButton
              type="button"
              className="composer-mode-button"
              variant="default"
              aria-label={aiComposerMode ? "AI mode, switch to search mode" : "Search mode, switch to AI mode"}
              aria-pressed={aiComposerMode}
              data-mode={aiComposerMode ? "ai" : "search"}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                setAiComposerMode((current) => !current);
                setSearchInterpretation(null);
                window.setTimeout(() => searchRef.current?.focus(), 0);
              }}
            >
              {aiComposerMode ? (
                <Sparkles size={15} strokeWidth={2.3} aria-hidden="true" />
              ) : (
                <Search size={15} strokeWidth={2.3} aria-hidden="true" />
              )}
            </UiIconButton>
          </UiTooltip>
          <UiButton
            type="button"
            className="composer-run-button"
            variant="filled"
            disabled={!query.trim() || historyPending || aiPlanning}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => void refreshHistory({ resetScroll: true, allowAi: true })}
          >
            Run
          </UiButton>
          <UiBadge
            className={`search-status${isFilteringHistory || aiPlanning ? " is-loading" : ""}`}
            variant="default"
            title="Result count"
            aria-live="polite"
            leftSection={isFilteringHistory || aiPlanning ? <LoadingSpinner /> : null}
          >
            <span className="status-text">{searchStatus}</span>
          </UiBadge>
          <Menu withinPortal position="bottom-end" width={188}>
            <Menu.Target>
              <UiIconButton
                type="button"
                className="picker-menu-button"
                variant="default"
                aria-label="Open picker menu"
                onMouseDown={(event) => event.preventDefault()}
              >
                <MoreVertical size={16} strokeWidth={2.4} aria-hidden="true" />
              </UiIconButton>
            </Menu.Target>
            <Menu.Dropdown aria-label="Picker menu">
              <Menu.Item
                leftSection={<Command size={14} strokeWidth={2.2} />}
                rightSection={<UiKbd>Ctrl K</UiKbd>}
                onClick={openCommandPalette}
              >
                Commands
              </Menu.Item>
              <Menu.Item
                leftSection={<Settings2 size={14} strokeWidth={2.2} />}
                onClick={openSettingsPanel}
              >
                Settings
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </div>

        {visibleSearchInterpretation ? (
          <div className="search-interpretation" aria-live="polite">
            <span className="search-interpretation-label">
              {visibleSearchInterpretation.mode === "ai" ? "AI interpreted" : "Interpreted"}
            </span>
            <span className="search-interpretation-query">{visibleSearchInterpretation.query}</span>
            {visibleSearchInterpretation.explanation ? (
              <span className="search-interpretation-detail">{visibleSearchInterpretation.explanation}</span>
            ) : null}
            {visibleSearchInterpretation.warnings.map((warning) => (
              <span key={warning} className="search-interpretation-warning">
                {warning}
              </span>
            ))}
          </div>
        ) : null}

        {historyError ? <UiAlert className="error-text" color="red" variant="light">{historyError}</UiAlert> : null}
        {actionError ? <UiAlert className="error-text" color="red" variant="light">{actionError}</UiAlert> : null}

        <section className="feed-panel" aria-label="Clipboard picker">
          <div ref={historyScrollRef} className="history-feed-scroll">
            <ol
              id="clipboard-feed"
              className={`history-feed${history.length > 0 ? " has-items" : ""}`}
              aria-label="Clipboard history results"
              style={history.length > 0 ? { height: `${rowVirtualizer.getTotalSize()}px` } : undefined}
            >
            {history.length === 0 ? (
              <li className="empty-history">
                {isFilteringHistory ? (
                  <span className="empty-loading">
                    <span>{searchStatus}</span>
                  </span>
                ) : query.trim()
                  ? "No synthetic history matches that search."
                  : "Copy synthetic text to populate the picker."}
              </li>
            ) : (
              virtualRows.map((virtualRow) => {
                const item = history[virtualRow.index];
                const index = virtualRow.index;
                if (!item) {
                  return (
                    <li
                      key="history-loader"
                      className="history-loader-row"
                      style={{
                        transform: `translateY(${Math.ceil(virtualRow.start) + 1}px)`,
                      }}
                    >
                      {historyLoadingMore ? (
                        <span className="history-loader-content">
                          <LoadingSpinner />
                          <span>Loading more</span>
                        </span>
                      ) : null}
                    </li>
                  );
                }

                return (
                  <li
                  key={item.id}
                  id={`history-item-${item.id}`}
                  data-index={virtualRow.index}
                  ref={rowVirtualizer.measureElement}
                  style={{
                    transform: `translateY(${Math.ceil(virtualRow.start) + (virtualRow.index > 0 ? 1 : 0)}px)`,
                  }}
                >
                  <UiCheckbox
                    className={`item-mark-button${item.is_marked ? " is-marked" : ""}`}
                    checked={item.is_marked}
                    aria-label={item.is_marked ? "Unmark item" : "Mark item"}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                    }}
                    onClick={(event) => {
                      event.stopPropagation();
                    }}
                    onChange={(event) => {
                      event.stopPropagation();
                      void toggleItemMarked(item).then(focusSearch);
                    }}
                  />
                  <button
                    className={`feed-item${item.id === selectedItemId ? " is-selected" : ""}${
                      selectedIds.has(item.id) ? " is-multi-selected" : ""
                    }${
                      item.content_kind === "image" ? " is-image" : ""
                    }${
                      item.is_marked ? " is-marked" : ""
                    }`}
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={(event) => {
                      if (event.shiftKey) {
                        setRangeSelection(index);
                      } else if (event.ctrlKey || event.metaKey) {
                        setSelectedItemId(item.id);
                        setSelectedIds((current) => {
                          const nextSelectedIds = new Set(current);
                          if (nextSelectedIds.has(item.id)) {
                            nextSelectedIds.delete(item.id);
                          } else {
                            nextSelectedIds.add(item.id);
                          }
                          return nextSelectedIds;
                        });
                        selectionAnchorItemIdRef.current = item.id;
                      } else {
                        setSingleSelection(index);
                      }
                      setActionError(null);
                      setOpenItemMenu(null);
                      setOpenMarkMenu(null);
                      focusSearch();
                    }}
                    onDoubleClick={() => {
                      void activateItem(item);
                    }}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      showItemMenu(item, index, event);
                    }}
                  >
                    <span className="item-main">
                      {hasMetadata(item) ? (
                        <span className="item-metadata">
                          {item.tags ? <span>{item.tags}</span> : null}
                          {metadataNotesPreview(item.notes, item.tags) ? (
                            <span>{metadataNotesPreview(item.notes, item.tags)}</span>
                          ) : null}
                        </span>
                      ) : null}
                    </span>
                    {item.content_kind === "image" && item.thumbnail_data_url ? (
                      <span className="image-preview">
                        <img
                          src={item.thumbnail_data_url}
                          alt=""
                          onLoad={measureImageRow}
                        />
                      </span>
                    ) : markdownImages(item.text).length > 0 ? (
                      <MarkdownPreview
                        text={item.text}
                        onImageLoad={measureImageRow}
                      />
                    ) : (
                      <pre>{item.text}</pre>
                    )}
                  </button>
                  <UiIconButton
                    type="button"
                    className="item-menu-button"
                    aria-label="Open item actions"
                    aria-expanded={openItemMenu?.itemId === item.id}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                    }}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      toggleItemMenu(item, index, event);
                    }}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      showItemMenu(item, index, event);
                    }}
                  >
                    <MoreVertical size={15} strokeWidth={2.4} />
                  </UiIconButton>
                  {openItemMenu?.itemId === item.id ? createPortal(
                    <UiPaper
                      className="item-menu"
                      role="menu"
                      aria-label="Item actions"
                      style={{ left: openItemMenu.x, top: openItemMenu.y }}
                    >
                      {hasMultiSelection ? (
                        renderBatchItemActions({
                          items: effectiveSelection,
                          noun: "selected",
                          count: effectiveSelection.length,
                          onClear: () => {
                            setOpenItemMenu(null);
                            setSingleSelection(index);
                            focusSearch();
                          },
                        })
                      ) : (
                        <>
                          <UiUnstyledButton
                            type="button"
                            role="menuitem"
                            className="item-menu-action"
                            onClick={() => void activateItem(item, COPY_AND_HIDE_ACTIVATION)}
                          >
                            <ClipboardCheck size={14} strokeWidth={2.2} aria-hidden="true" />
                            <span>Activate</span>
                          </UiUnstyledButton>
                          <UiUnstyledButton
                            type="button"
                            role="menuitem"
                            className="item-menu-action"
                            onClick={() => void activateItem(item, PASTE_AND_HIDE_ACTIVATION)}
                          >
                            <ClipboardPaste size={14} strokeWidth={2.2} aria-hidden="true" />
                            <span>Paste</span>
                          </UiUnstyledButton>
                          {actionById.has(BUILTIN_ACTIONS.pastePlain) ? (
                            <UiUnstyledButton
                              type="button"
                              role="menuitem"
                              className="item-menu-action"
                              onClick={() => void runBuiltinAction(BUILTIN_ACTIONS.pastePlain, [item])}
                            >
                              <Command size={14} strokeWidth={2.2} aria-hidden="true" />
                              <span>Paste plain</span>
                            </UiUnstyledButton>
                          ) : null}
                          {actionById.has(BUILTIN_ACTIONS.openUrl) ? (
                            <UiUnstyledButton
                              type="button"
                              role="menuitem"
                              className="item-menu-action"
                              onClick={() => void runBuiltinAction(BUILTIN_ACTIONS.openUrl, [item])}
                            >
                              <Command size={14} strokeWidth={2.2} aria-hidden="true" />
                              <span>Open URL</span>
                            </UiUnstyledButton>
                          ) : null}
                          {itemMenuScriptActions(actionDefinitions, [item], item).map((action) => (
                            <UiUnstyledButton
                              key={action.id}
                              type="button"
                              role="menuitem"
                              className="item-menu-action"
                              onClick={() => void runActionDefinition(action, [item], "itemMenu")}
                            >
                              <FileCode2 size={14} strokeWidth={2.2} aria-hidden="true" />
                              <span>{action.title}</span>
                              <ShortcutBadge shortcut={normalizeShortcutString(action.shortcut)} />
                            </UiUnstyledButton>
                          ))}
                          <UiUnstyledButton
                            type="button"
                            role="menuitem"
                            className="item-menu-action"
                            onClick={() => void beginEdit(item, "content")}
                          >
                            <Pencil size={14} strokeWidth={2.2} aria-hidden="true" />
                            <span>Edit</span>
                          </UiUnstyledButton>
                          <UiUnstyledButton
                            type="button"
                            role="menuitem"
                            className="item-menu-action"
                            onClick={() => void beginEdit(item, "metadata")}
                          >
                            <Tags size={14} strokeWidth={2.2} aria-hidden="true" />
                            <span>Edit metadata</span>
                          </UiUnstyledButton>
                          <UiUnstyledButton
                            type="button"
                            role="menuitem"
                            className="item-menu-action is-danger"
                            onClick={() => void deleteItem(item)}
                          >
                            <Trash2 size={14} strokeWidth={2.2} aria-hidden="true" />
                            <span>Delete</span>
                          </UiUnstyledButton>
                        </>
                      )}
                    </UiPaper>,
                    document.body,
                  ) : null}
                  </li>
                );
              })
            )}
            </ol>
          </div>
        </section>
        {commandPalette ? (
          <CommandPalette
            query={commandPalette.query}
            activeIndex={commandPalette.activeIndex}
            actions={commandPaletteActions}
            onQueryChange={(nextQuery) =>
              setCommandPalette((current) =>
                current ? { query: nextQuery, activeIndex: 0 } : current,
              )
            }
            onActiveIndexChange={(activeIndex) =>
              setCommandPalette((current) =>
                current ? { ...current, activeIndex } : current,
              )
            }
            onCancel={() => {
              setCommandPalette(null);
              focusSearch();
            }}
            onRun={(action) => void runActionDefinition(action, effectiveSelection, "commandPalette")}
          />
        ) : null}
        {editDraft ? (
          <div
            className="edit-backdrop"
            role="dialog"
            aria-modal="true"
            aria-label={editDraft.mode === "metadata" ? "Edit item metadata" : "Edit clipboard item"}
          >
            <UiPaper
              component="form"
              className="edit-panel"
              onSubmit={(event) => {
                event.preventDefault();
                void saveEdit();
              }}
            >
              {editDraft.mode === "content" ? (
                <label>
                  <span>Content</span>
                  <UiTextarea
                    ref={editTextRef}
                    value={editDraft.text}
                    onChange={(event) =>
                      setEditDraft({ ...editDraft, text: event.currentTarget.value })
                    }
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        event.preventDefault();
                        setEditDraft(null);
                        focusSearch();
                      }
                      if (event.key === "F2") {
                        event.preventDefault();
                        void saveEdit();
                      }
                      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                        event.preventDefault();
                        void saveEdit();
                      }
                    }}
                    autosize={false}
                  />
                </label>
              ) : null}
              {editDraft.mode === "metadata" ? (
                <label>
                  <span>Metadata</span>
                  <UiTextarea
                    ref={editTextRef}
                    className="notes-input"
                    value={editDraft.notes}
                    placeholder="#work&#10;Markdown notes about this clip"
                    onChange={(event) =>
                      setEditDraft({ ...editDraft, notes: event.currentTarget.value })
                    }
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        event.preventDefault();
                        setEditDraft(null);
                        focusSearch();
                      }
                      if (event.key === "F2") {
                        event.preventDefault();
                        void saveEdit();
                      }
                      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                        event.preventDefault();
                        void saveEdit();
                      }
                    }}
                    autosize={false}
                  />
                </label>
              ) : null}
              {editError ? <UiAlert className="error-text" color="red" variant="light">{editError}</UiAlert> : null}
              <div className="edit-buttons">
                <UiButton type="button" variant="default" onClick={() => {
                  setEditDraft(null);
                  focusSearch();
                }}>
                  Cancel
                </UiButton>
                <UiButton type="submit" variant="filled">Save</UiButton>
              </div>
            </UiPaper>
          </div>
        ) : null}
        {batchMetadataDraft ? (
          <div
            className="edit-backdrop"
            role="dialog"
            aria-modal="true"
            aria-label="Add tags to selected items"
          >
            <UiPaper
              component="form"
              className="edit-panel"
              onSubmit={(event) => {
                event.preventDefault();
                void saveBatchMetadata();
              }}
            >
              <label>
                <span>Metadata for {batchMetadataDraft.ids.length} items</span>
                <UiTextarea
                  ref={editTextRef}
                  className="notes-input"
                  value={batchMetadataDraft.metadata}
                  placeholder="#work&#10;Markdown notes to append"
                  onChange={(event) =>
                    setBatchMetadataDraft({
                      ...batchMetadataDraft,
                      metadata: event.currentTarget.value,
                    })
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      event.preventDefault();
                      setBatchMetadataDraft(null);
                      focusSearch();
                    }
                    if (event.key === "F2") {
                      event.preventDefault();
                      void saveBatchMetadata();
                    }
                  }}
                  autosize={false}
                />
              </label>
              {editError ? <UiAlert className="error-text" color="red" variant="light">{editError}</UiAlert> : null}
              <div className="edit-buttons">
                <UiButton type="button" variant="default" onClick={() => {
                  setBatchMetadataDraft(null);
                  focusSearch();
                }}>
                  Cancel
                </UiButton>
                <UiButton type="submit" variant="filled">Add metadata</UiButton>
              </div>
            </UiPaper>
          </div>
        ) : null}
      </section>
      </CustomWindowFrame>
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </main>
  );
}

function WhichKeyOverlay({ state }: { state: WhichKeyState | null }) {
  if (!state?.visible || state.entries.length === 0) {
    return null;
  }

  return (
    <div className="whichkey-overlay" role="dialog" aria-label="WhichKey shortcuts">
      <WhichKeyPanel state={state} />
    </div>
  );
}

function WhichKeyPanel({ state }: { state: WhichKeyState }) {
  const groups = new Map<string, WhichKeyEntry[]>();
  for (const entry of state.entries) {
    const group = entry.group || "Shortcuts";
    groups.set(group, [...(groups.get(group) ?? []), entry]);
  }

  return (
    <>
      <div className="whichkey-header">
        <span>{state.prefix}</span>
        <strong>Next key</strong>
      </div>
      <div className="whichkey-groups">
        {Array.from(groups, ([group, entries]) => (
          <section key={group} className="whichkey-group">
            <h2>{group}</h2>
            <div className="whichkey-entry-list">
              {entries.map((entry) => (
                <div
                  key={`${entry.routeId}-${entry.key}`}
                  className={`whichkey-entry${entry.disabled ? " is-disabled" : ""}`}
                >
                  <UiKbd>{entry.key}</UiKbd>
                  <span>{entry.label}</span>
                  {entry.diagnostic ? <em>{entry.diagnostic}</em> : null}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}

function LoadingSpinner() {
  return <UiLoader aria-hidden="true" />;
}

function CommandPalette({
  query,
  activeIndex,
  actions,
  onQueryChange,
  onActiveIndexChange,
  onCancel,
  onRun,
}: {
  query: string;
  activeIndex: number;
  actions: ActionDefinition[];
  onQueryChange: (query: string) => void;
  onActiveIndexChange: (index: number) => void;
  onCancel: () => void;
  onRun: (action: ActionDefinition) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filteredActions = actions.filter((action) =>
    actionSearchText(action).includes(normalizedQuery),
  );
  const safeActiveIndex = filteredActions.length === 0
    ? -1
    : clamp(activeIndex, 0, filteredActions.length - 1);

  useEffect(() => {
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }, []);

  useEffect(() => {
    if (safeActiveIndex !== activeIndex) {
      onActiveIndexChange(Math.max(0, safeActiveIndex));
    }
  }, [activeIndex, onActiveIndexChange, safeActiveIndex]);

  const runActiveAction = () => {
    const action = filteredActions[safeActiveIndex];
    if (action) {
      onRun(action);
    }
  };

  return (
    <div
      className="command-palette-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onCancel();
        }
      }}
    >
      <UiPaper className="command-palette-panel">
        <UiTextInput
          ref={inputRef}
          className="command-palette-input"
          aria-label="Search commands"
          role="combobox"
          aria-controls="command-palette-results"
          aria-expanded="true"
          aria-activedescendant={
            safeActiveIndex >= 0 ? `command-palette-action-${filteredActions[safeActiveIndex].id}` : undefined
          }
          value={query}
          placeholder="Run action"
          onChange={(event) => onQueryChange(event.currentTarget.value)}
          onKeyDown={(event) => {
            switch (event.key) {
              case "Escape":
                event.preventDefault();
                onCancel();
                break;
              case "ArrowDown":
                event.preventDefault();
                if (filteredActions.length > 0) {
                  onActiveIndexChange((safeActiveIndex + 1) % filteredActions.length);
                }
                break;
              case "ArrowUp":
                event.preventDefault();
                if (filteredActions.length > 0) {
                  onActiveIndexChange(
                    (safeActiveIndex - 1 + filteredActions.length) % filteredActions.length,
                  );
                }
                break;
              case "Enter":
                event.preventDefault();
                runActiveAction();
                break;
            }
          }}
        />
        <ol id="command-palette-results" className="command-palette-results" role="listbox">
          {filteredActions.length === 0 ? (
            <li>
              <UiAlert className="command-empty" variant="light">
                No ready actions match.
              </UiAlert>
            </li>
          ) : (
            filteredActions.map((action, index) => (
              <li
                key={action.id}
                id={`command-palette-action-${action.id}`}
                role="option"
                aria-selected={index === safeActiveIndex}
              >
                <UiUnstyledButton
                  component="button"
                  type="button"
                  className={index === safeActiveIndex ? "is-active" : ""}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => onRun(action)}
                >
                  <span>
                    <strong>{action.title}</strong>
                    {action.description ? <small>{action.description}</small> : null}
                  </span>
                  <span className="action-badges">
                    <ShortcutBadge shortcut={normalizeShortcutString(action.shortcut)} />
                    <UiBadge className="action-source-badge" variant="default">
                      {action.source === "script" ? "Script" : "Built-in"}
                    </UiBadge>
                  </span>
                </UiUnstyledButton>
              </li>
            ))
          )}
        </ol>
      </UiPaper>
    </div>
  );
}

function activationForEnter(enterAction: EnterAction, shiftKey: boolean): ActivationOptions {
  if (enterAction === "paste") {
    return shiftKey ? COPY_AND_HIDE_ACTIVATION : PASTE_AND_HIDE_ACTIVATION;
  }

  return shiftKey ? PASTE_AND_HIDE_ACTIVATION : COPY_AND_HIDE_ACTIVATION;
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

function itemMenuScriptActions(
  actions: ActionDefinition[],
  items: HistoryItem[],
  activeItem: HistoryItem | null,
) {
  return actions.filter(
    (action) =>
      action.source === "script" &&
      actionRunnableForTrigger(action, "itemMenu", itemsForActionContext(action, items, activeItem)),
  );
}

function itemsForActionContext(
  action: ActionDefinition,
  items: HistoryItem[],
  activeItem: HistoryItem | null,
) {
  if (action.input.selection === "none" || action.input.source === "none") {
    return [];
  }
  if (action.input.selection === "active") {
    return activeItem ? [activeItem] : items.slice(0, 1);
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

function formatCount(value: number) {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 0,
  }).format(value);
}

function countOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function shortHash(value: string | null | undefined) {
  if (!value) {
    return "no hash";
  }
  return value.length <= 12 ? value : value.slice(0, 12);
}

function tagSearchText(tag: TagSummary) {
  return [
    tag.label,
    tag.slug,
    tag.itemCount,
    tag.pinned ? "pinned" : "",
  ].join(" ").toLocaleLowerCase();
}

function removeMarkedQueryTerms(query: string) {
  return query
    .split(/\s+/)
    .filter((term) => {
      const normalized = term.trim().toLocaleLowerCase();
      return ![
        "is:marked",
        "is:checked",
        "is:unmarked",
        "is:unchecked",
        "-is:marked",
        "-is:checked",
        "-is:unmarked",
        "-is:unchecked",
      ].includes(normalized);
    })
    .join(" ")
    .trim();
}

function appendMarkedQueryTerm(query: string, term: "is:marked" | "-is:marked") {
  const trimmed = query.trim();
  return trimmed.length === 0 ? term : `${trimmed} ${term}`;
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

function appendMetadata(existing: string | null, metadataToAdd: string) {
  const trimmedExisting = existing?.trim() ?? "";
  const trimmedMetadata = metadataToAdd.trim();
  if (!trimmedExisting) {
    return trimmedMetadata;
  }
  if (!trimmedMetadata) {
    return trimmedExisting;
  }
  return `${trimmedExisting}\n${trimmedMetadata}`;
}

function metadataNotesPreview(notes: string | null, tags: string | null) {
  const tagSet = new Set(
    Array.from(tags?.matchAll(/#[\p{L}\p{N}_-]+/gu) ?? [], (match) => match[0]),
  );
  if (tagSet.size === 0) {
    return notes?.trim() ?? "";
  }

  return (notes ?? "")
    .replace(/(^|\s)#[\p{L}\p{N}_-]+/gu, (match, prefix: string) => {
      const tag = match.trim();
      return tagSet.has(tag) ? prefix : match;
    })
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function hasMetadata(item: HistoryItem) {
  return Boolean(item.tags?.trim() || item.notes?.trim());
}

function markdownImages(text: string): MarkdownImage[] {
  const matches = text.matchAll(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g);
  return Array.from(matches, (match) => ({
    alt: match[1] ?? "",
    src: normalizeMarkdownImageSrc(match[2] ?? ""),
    raw: match[0],
  })).filter((image) => image.src.length > 0);
}

function normalizeMarkdownImageSrc(src: string) {
  const trimmed = src.trim();
  if (/^[a-z]+:/i.test(trimmed) || trimmed.startsWith("/")) {
    return trimmed;
  }
  if (/^[a-z]:[\\/]/i.test(trimmed)) {
    return `file:///${trimmed.replaceAll("\\", "/")}`;
  }
  return trimmed;
}

function MarkdownPreview({
  text,
  onImageLoad,
}: {
  text: string;
  onImageLoad?: (event: SyntheticEvent<HTMLImageElement>) => void;
}) {
  const segments = markdownSegments(text);

  return (
    <span className="markdown-preview">
      {segments.map((segment, index) =>
        segment.kind === "image" ? (
          <span className="markdown-image-frame" key={`${segment.image.src}-${index}`}>
            <img
              src={segment.image.src}
              alt={segment.image.alt}
              onLoad={onImageLoad}
            />
          </span>
        ) : (
          <span className="markdown-text-preview" key={`text-${index}`}>
            {segment.text}
          </span>
        ),
      )}
    </span>
  );
}

function markdownSegments(text: string): MarkdownSegment[] {
  const imageLinePattern = /^\s*!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)\s*$/;
  const segments: MarkdownSegment[] = [];
  let textBuffer: string[] = [];

  const flushText = () => {
    if (textBuffer.length === 0) {
      return;
    }

    segments.push({
      kind: "text",
      text: textBuffer.join("\n"),
    });
    textBuffer = [];
  };

  for (const line of text.split("\n")) {
    const imageMatch = line.match(imageLinePattern);
    if (!imageMatch) {
      textBuffer.push(line);
      continue;
    }

    flushText();
    segments.push({
      kind: "image",
      image: {
        alt: imageMatch[1] ?? "",
        src: normalizeMarkdownImageSrc(imageMatch[2] ?? ""),
        raw: imageMatch[0],
      },
    });
  }

  flushText();
  return segments;
}

const rootElement = document.getElementById("root")!;
const root = ((window as Window & { __copicuRoot?: Root }).__copicuRoot ??=
  createRoot(rootElement));

root.render(
  <StrictMode>
    <MantineProvider
      theme={copicuMantineTheme}
      defaultColorScheme="auto"
      deduplicateInlineStyles
    >
      <RenderCrashBoundary>
        {IS_UI_HOST_WINDOW || IS_NOTIFICATIONS_WINDOW || IS_SETTINGS_WINDOW || IS_AI_OUTPUT_WINDOW || IS_METADATA_WINDOW || IS_WHICHKEY_WINDOW ? (
          <Suspense fallback={<LoadingSpinner />}>
            {IS_UI_HOST_WINDOW ? (
              <LazyUiHostApp />
            ) : IS_NOTIFICATIONS_WINDOW ? (
              <LazyNotificationsApp />
            ) : IS_SETTINGS_WINDOW ? (
              <LazySettingsWindowApp />
            ) : IS_AI_OUTPUT_WINDOW ? (
              <LazyAiOutputWindowApp />
            ) : IS_METADATA_WINDOW ? (
              <LazyMetadataWindowApp />
            ) : (
              <LazyWhichKeyWindowApp />
            )}
          </Suspense>
        ) : (
          <App />
        )}
      </RenderCrashBoundary>
    </MantineProvider>
  </StrictMode>,
);

