import {
  Component,
  Fragment,
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
  useLayoutEffect,
  useMemo,
  useReducer,
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
import ArrowLeft from "lucide-react/dist/esm/icons/arrow-left.mjs";
import Bookmark from "lucide-react/dist/esm/icons/bookmark.mjs";
import Check from "lucide-react/dist/esm/icons/check.mjs";
import CheckCheck from "lucide-react/dist/esm/icons/check-check.mjs";
import CircleHelp from "lucide-react/dist/esm/icons/circle-help.mjs";
import CircleSlash from "lucide-react/dist/esm/icons/circle-slash.mjs";
import ClipboardCheck from "lucide-react/dist/esm/icons/clipboard-check.mjs";
import ClipboardPaste from "lucide-react/dist/esm/icons/clipboard-paste.mjs";
import Command from "lucide-react/dist/esm/icons/command.mjs";
import Copy from "lucide-react/dist/esm/icons/copy.mjs";
import CornerDownLeft from "lucide-react/dist/esm/icons/corner-down-left.mjs";
import FileCode2 from "lucide-react/dist/esm/icons/file-code-2.mjs";
import Flag from "lucide-react/dist/esm/icons/flag.mjs";
import ListChecks from "lucide-react/dist/esm/icons/list-checks.mjs";
import ListRestart from "lucide-react/dist/esm/icons/list-restart.mjs";
import LockKeyhole from "lucide-react/dist/esm/icons/lock-keyhole.mjs";
import LockKeyholeOpen from "lucide-react/dist/esm/icons/lock-keyhole-open.mjs";
import MoreVertical from "lucide-react/dist/esm/icons/more-vertical.mjs";
import Pencil from "lucide-react/dist/esm/icons/pencil.mjs";
import Plus from "lucide-react/dist/esm/icons/plus.mjs";
import Radio from "lucide-react/dist/esm/icons/radio.mjs";
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
  ActiveScenarioSession,
  ApplyItemTagsRequest,
  ClipKind,
  CompoundHotkeyPendingEvent,
  CreateHistoryItemRequest,
  CreateHistoryItemResult,
  CreateSavedHistoryViewRequest,
  CreateScenarioFromQueryRequest,
  CreateTagRequest,
  EnterAction,
  FindCloseRequest,
  FindCloseResponse,
  FindCancelOwnerResponse,
  FindFieldMatches,
  FindItemMatches,
  FindMatchesForItemsRequest,
  FindMatchesForItemsResponse,
  FindNavigateRequest,
  FindNavigateResponse,
  FindOccurrence,
  FindResolveAnchorRequest,
  FindResolveAnchorResponse,
  FindStartRequest,
  FindStartResponse,
  FindTargetRequest,
  FindTargetResponse,
  MarkdownOutputPayload,
  RunActionRequest,
  SavedHistoryView,
  Scenario,
  SetHistoryItemsMarkedRequest,
  SetHistoryQueryMarkedRequest,
  TagSummary,
  ToastItem,
  ToastOptions,
  UiHostRequest,
  UpdateHistoryItemRequest,
  UpdateTagConfigRequest,
  WhichKeyEntry,
  WhichKeyState,
} from "./shared/contracts";
import { setupAutomaticUpdates, type AutoUpdateStatus } from "./autoUpdate";
import {
  classifyStructuredSearchDraft,
  replaceActiveSearchToken,
  searchSuggestions,
  shouldHoldStructuredSearchDraft,
} from "./shared/search";
import {
  appliedQueryMutationFields,
  appliedSearchRequestFields,
  createPickerSearchState,
  isAppliedSearchDescriptor,
  pickerSearchReducer,
  type AppliedSearchDescriptor,
  type AppliedSearchPage,
} from "./shared/searchSnapshot";
import {
  DEFAULT_SETTINGS,
  normalizeSettings,
  type AppSettings,
  type SearchTriggerMode,
} from "./shared/settings";
import {
  UiBadge,
  UiButton,
  UiCheckbox,
  UiIconButton,
  UiKbd,
  UiLoader,
  UiAlert,
  UiPaper,
  UiSelect,
  UiTextarea,
  UiTextInput,
  UiTooltip,
  UiUnstyledButton,
} from "./ui/controls";
import { ShortcutBadge } from "./ui/ShortcutBadge";
import { ToastStack } from "./ui/ToastStack";
import { ScenarioCreator } from "./ui/ScenarioSwitcher";
import { SavedViewCreator } from "./ui/SavedViewCreator";
import { TagEditor, type TagEditorMode } from "./ui/TagEditor";
import {
  PickerContextStrip,
  PickerFeed,
  PickerHeader,
  PickerSelectionBar,
  PickerStatusAnnouncer,
} from "./ui/PickerShell";
import { FindBar, type FindBarStatus } from "./ui/FindBar";
import { FindHighlightedText, findFieldMatches } from "./ui/FindHighlight";
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
  is_inbox: boolean;
  inbox_at_unix_ms: number | null;
};

type HistoryPageCursor = {
  afterSortUnixMs: number;
  afterId: number;
};
type HistoryPaginationBlock = {
  descriptorFingerprint: string;
  cursor: HistoryPageCursor;
  error: string;
};

const sameHistoryPageCursor = (left: HistoryPageCursor | null, right: HistoryPageCursor | null) =>
  left !== null
  && right !== null
  && left.afterSortUnixMs === right.afterSortUnixMs
  && left.afterId === right.afterId;

type HistoryPageRequest = {
  query: string;
  cursor: HistoryPageCursor | null;
  limit: number;
};

type HistorySearchRequest = HistoryPageRequest & {
  displayQuery?: string | null;
  mode?: "plain" | "structured" | "ai";
  includeContent?: boolean;
  includeCounts?: boolean;
  explain?: boolean;
  plan?: unknown | null;
  aiContext?: AiScriptContext | null;
  appliedDescriptor?: AppliedSearchDescriptor | null;
};

type SearchQueryChip = {
  label: string;
  queryWithoutClause: string;
};

type SearchQueryDiagnostic = {
  severity: "warning" | "error";
  code: string;
  message: string;
};

type SearchQueryExplanation = {
  version: number;
  chips: SearchQueryChip[];
  diagnostics: SearchQueryDiagnostic[];
};

type HistoryPage = {
  items: HistoryItem[];
  nextCursor: HistoryPageCursor | null;
  totalCount?: number;
  filteredCount?: number;
  interpretedQuery?: string | null;
  explanation?: string | null;
  queryExplanation?: SearchQueryExplanation | null;
  warnings?: string[];
  appliedDescriptor?: AppliedSearchDescriptor | null;
};

type SearchInterpretation = {
  mode: "ai" | "structured";
  query: string;
  explanation: string | null;
  chips: SearchQueryChip[];
  diagnostics: SearchQueryDiagnostic[];
  warnings: string[];
} | null;

type SearchReplayToken = {
  query: string;
  intentGeneration: number;
  appliedGeneration: number;
  reason: "foreground" | "draft";
};

type SearchFailureReplay = {
  source: "foreground" | "background";
  query: string;
  intentGeneration: number;
  descriptor: AppliedSearchDescriptor | null;
};

type PendingFilterLock = {
  query: string;
  intentGeneration: number;
};

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
  pendingActivationItemId: number | null;
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

type InlineEditDraft = Omit<EditDraft, "mode">;

type CreateItemDraft = {
  text: string;
  metadata: string;
};

type BatchMetadataMode = "append" | "replace" | "merge";

type BatchMetadataDraft = {
  ids: number[];
  metadata: string;
  mode: BatchMetadataMode;
  commonMetadata: string | null;
  hasMixedMetadata: boolean;
};

type TagEditorDraft = {
  itemIds: number[];
  mode: TagEditorMode;
  initialTags: string[];
};

type OpenedSavedView = {
  id: number;
  title: string;
  query: string;
};

type PickerFilterEvent = {
  query: string;
  view?: Omit<OpenedSavedView, "query">;
};

type MarkdownImage = {
  alt: string;
  src: string;
  raw: string;
};

type MarkdownSegment =
  | { kind: "text"; text: string; canonicalSegment?: number }
  | { kind: "image"; image: MarkdownImage; canonicalSegment?: number };

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

type ActionPickerState = {
  query: string;
  activeIndex: number;
};

type ActionPickerEntry = {
  action: ActionDefinition;
  trigger: ActionTrigger;
  contextLabel: string;
};

type CommandPaletteEntry =
  | {
      id: string;
      kind: "navigation";
      group: "History" | "Saved searches" | "Tags";
      title: string;
      description: string;
      query: string;
      savedView: SavedHistoryView | null;
    }
  | {
      id: string;
      kind: "action";
      group: "Actions";
      action: ActionDefinition;
    };

type FindUiState = {
  active: boolean;
  needle: string;
  sessionId: string | null;
  filterFingerprint: string | null;
  generation: number;
  status: FindBarStatus;
  total: number;
  currentOrdinal: number | null;
  currentTarget: FindOccurrence | null;
  error: string | null;
  recoveryAttempted: boolean;
};

type FindStartRunner = (
  needle: string,
  generation: number,
  recoveryAttempted?: boolean,
  preferredOrdinal?: number | null,
  preferredTarget?: FindOccurrence | null,
) => Promise<void>;

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
const ITEM_MENU_WIDTH = 260;
const ITEM_MENU_HEIGHT = 302;
const ITEM_MENU_OFFSET = 6;
const DEFAULT_TOAST_DURATION_MS = 3600;
const STICKY_TOAST_DURATION_MS = 0;
const WHICHKEY_REVEAL_DELAY_MS = 300;
const NOTIFICATIONS_WINDOW_LABEL = "notifications";
const UI_HOST_WINDOW_LABEL = "ui-host";
const SETTINGS_WINDOW_LABEL = "settings";
const AI_OUTPUT_WINDOW_LABEL = "ai-output";
const METADATA_WINDOW_LABEL = "metadata";
const ITEM_PREVIEW_WINDOW_LABEL = "item-preview";
const WHICHKEY_WINDOW_LABEL = "whichkey";
const NOTIFICATION_TOAST_EVENT = "copicu://toast";
const UI_HOST_REQUEST_EVENT = "copicu://ui-host/request";
const AI_OUTPUT_OPEN_EVENT = "copicu://ai-output/open";
const COMPOUND_HOTKEY_PENDING_EVENT = "copicu://hotkeys/compound-pending";
const COMMAND_PALETTE_OPEN_EVENT = "copicu://command-palette/open";
const SETTINGS_UPDATED_EVENT = "copicu://settings/updated";
const PICKER_FILTER_EVENT = "copicu://picker/filter";
const PICKER_ACTIVE_ITEM_EVENT = "copicu://picker/active-item";
const METADATA_EDIT_ACTIVE_EVENT = "copicu://metadata/edit-active";
const EXTERNAL_EDITOR_EDIT_ACTIVE_EVENT = "copicu://external-editor/edit-active";
const HISTORY_CHANGED_EVENT = "copicu://history/changed";
const SCENARIO_SESSION_CHANGED_EVENT = "copicu://scenario/session-changed";
const NOTIFICATIONS_WINDOW_WIDTH = 340;
const NOTIFICATION_ROW_HEIGHT = 78;
const NOTIFICATIONS_WINDOW_CHROME = 10;
const NOTIFICATIONS_WINDOW_MAX_HEIGHT = 430;
const FEED_ITEM_MIN_HEIGHT = 62;
const FEED_ITEM_VERTICAL_CHROME = 18;
const FEED_ITEM_GRID_ROW_GAP = 5;
const FEED_ITEM_TITLE_ESTIMATE = 21;
const FEED_ITEM_METADATA_VERTICAL_CHROME = 13;
const FEED_ITEM_METADATA_LINE_HEIGHT = 15;
const FEED_ITEM_PREVIEW_LINE_HEIGHT = 17;
const TEXT_PREVIEW_ESTIMATED_MAX_LINES = 4;
const TEXT_PREVIEW_ESTIMATED_CHARS_PER_LINE = 72;
const METADATA_ESTIMATED_CHARS_PER_LINE = 52;
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
  newItem: "builtin.newItem",
  pastePlain: "builtin.pastePlain",
  joinSelected: "builtin.joinSelected",
  queueSelectedBottomToTop: "builtin.queueSelectedBottomToTop",
  openUrl: "builtin.openUrl",
} as const;

const NEW_ITEM_ACTION: ActionDefinition = {
  id: BUILTIN_ACTIONS.newItem,
  title: "New item",
  description: "Create a clipboard history item without touching the clipboard.",
  shortcut: "Ctrl+N",
  triggers: ["commandPalette"],
  input: {
    source: "none",
    selection: "optional",
    kinds: null,
    mime: null,
    query: null,
  },
  capabilities: ["history:write"],
  builtin: true,
  source: "builtin",
  script: null,
  diagnostics: [],
  logging: null,
};

const NULL_ACTION: ActionDefinition = {
  ...NEW_ITEM_ACTION,
  id: "builtin.none",
  title: "",
  triggers: [],
  capabilities: [],
};

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

function findStart(request: FindStartRequest) {
  return invoke<FindStartResponse>("find_start", { request });
}

function findNavigate(request: FindNavigateRequest) {
  return invoke<FindNavigateResponse>("find_navigate", { request });
}

function findMatchesForItems(request: FindMatchesForItemsRequest) {
  return invoke<FindMatchesForItemsResponse>("find_matches_for_items", { request });
}

function findTarget(request: FindTargetRequest) {
  return invoke<FindTargetResponse>("find_target", { request });
}

function findResolveAnchor(request: FindResolveAnchorRequest) {
  return invoke<FindResolveAnchorResponse>("find_resolve_anchor", { request });
}

function findClose(request: FindCloseRequest) {
  return invoke<FindCloseResponse>("find_close", { request });
}

function findCancelOwner() {
  return invoke<FindCancelOwnerResponse>("find_cancel_owner");
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
  void forceAi;
  return {
    query: trimmed,
    mode: "structured",
  };
}

function nextSearchTriggerMode(mode: SearchTriggerMode): SearchTriggerMode {
  return mode === "realtime" ? "enter" : "realtime";
}

function searchTriggerModeName(mode: SearchTriggerMode) {
  return mode === "realtime" ? "Realtime" : "Enter";
}

function setPickerSearchTriggerMode(mode: SearchTriggerMode) {
  return invoke<AppSettings>("set_picker_search_trigger_mode", { mode });
}

function setHistoryItemsMarked(request: SetHistoryItemsMarkedRequest) {
  return invoke("set_history_items_marked", { request });
}

function setHistoryItemInbox(itemId: number, inbox: boolean) {
  return invoke("set_history_item_inbox", { itemId, inbox });
}

function setHistoryQueryMarked(request: SetHistoryQueryMarkedRequest) {
  return invoke("set_history_query_marked", { request });
}

function createHistoryItem(request: CreateHistoryItemRequest) {
  return invoke<CreateHistoryItemResult>("create_history_item", { request });
}

function autoUpdateStatusToast(status: AutoUpdateStatus): ToastOptions | null {
  if (status.phase === "available") {
    return {
      title: "Copicu update found",
      message: `Version ${status.version} is available. Downloading automatically…`,
      tone: "info",
    };
  }
  if (status.phase === "installing") {
    return {
      title: "Installing Copicu update",
      message: `Version ${status.version} downloaded. Copicu will restart when ready.`,
      tone: "success",
    };
  }
  if (status.phase === "relaunching") {
    return {
      title: "Restarting Copicu",
      message: `Launching version ${status.version}.`,
      tone: "success",
    };
  }
  return null;
}

function listActions() {
  return invoke<ActionDefinition[]>("list_actions");
}

function listTags() {
  return invoke<TagSummary[]>("list_tags");
}

function listSavedHistoryViews() {
  return invoke<SavedHistoryView[]>("list_saved_history_views");
}

function createSavedHistoryView(request: CreateSavedHistoryViewRequest) {
  return invoke<SavedHistoryView>("create_saved_history_view", { request });
}

function createTag(request: CreateTagRequest) {
  return invoke<TagSummary>("create_tag", { request });
}

function updateTagConfig(request: UpdateTagConfigRequest) {
  return invoke<TagSummary>("update_tag_config", { request });
}

function getItemTags(id: number) {
  return invoke<string[]>("get_item_tags", { id });
}

function applyItemTags(request: ApplyItemTagsRequest) {
  return invoke<void>("apply_item_tags", { request });
}

function stopCaptureTagContext() {
  return invoke<void>("stop_capture_tag_context");
}

function listScenarios() {
  return invoke<Scenario[]>("list_scenarios");
}

function createScenarioFromQuery(request: CreateScenarioFromQueryRequest) {
  return invoke<Scenario>("create_scenario_from_query", { request });
}

function getActiveScenarioSession() {
  return invoke<ActiveScenarioSession | null>("get_active_scenario_session");
}

function activateScenario(id: number) {
  return invoke<ActiveScenarioSession>("activate_scenario", { id });
}

function stopActiveScenario() {
  return invoke<void>("stop_active_scenario");
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

function openScenarioSettings() {
  window.localStorage.setItem("copicu:settings-focus-section", "scenarios");
  return invoke<void>("open_scenario_settings");
}

function openSavedViewsSettings() {
  window.localStorage.setItem("copicu:settings-focus-section", "history");
  return invoke<void>("open_saved_views_settings");
}

function openTagsSettings() {
  window.localStorage.setItem("copicu:settings-focus-section", "tags");
  return openSettingsWindow();
}

function openMetadataWindow(itemId: number) {
  return invoke<boolean>("open_metadata_window", { request: { itemId } });
}

function openItemPreview(itemId: number) {
  return invoke<boolean>("open_item_preview", { request: { itemId } });
}

function toggleItemPreview(itemId: number) {
  return invoke<boolean>("toggle_item_preview", { request: { itemId } });
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
const RENDERER_HEARTBEAT_INTERVAL_MS = 30_000;

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
  return recordPersistentRendererDiagnostic(event, detail);
}

function recordPersistentRendererDiagnostic(event: string, detail?: string) {
  if (!isTauriRuntime()) {
    return Promise.resolve();
  }
  return invoke("record_renderer_diagnostic", {
    event,
    detail: detail ?? null,
  }).catch((error) => {
    console.warn("renderer diagnostic failed", error);
  });
}

function setupRendererHeartbeat() {
  if (!isTauriRuntime() || rendererDiagnosticMode() === "off") {
    return;
  }
  const state = window as Window & { __copicuRendererHeartbeatStarted?: boolean };
  if (state.__copicuRendererHeartbeatStarted) {
    return;
  }
  state.__copicuRendererHeartbeatStarted = true;
  const startedAt = Date.now();
  const emitHeartbeat = () => {
    const activeElement = document.activeElement;
    const activeTag = activeElement instanceof HTMLElement ? activeElement.tagName : "none";
    void recordPersistentRendererDiagnostic(
      "renderer.heartbeat",
      `label=${currentWindowLabel()} visibility=${document.visibilityState} focused=${document.hasFocus()} active=${activeTag} uptime_ms=${Date.now() - startedAt}`,
    );
  };
  window.setTimeout(emitHeartbeat, 5_000);
  window.setInterval(emitHeartbeat, RENDERER_HEARTBEAT_INTERVAL_MS);
}

setupRendererHeartbeat();

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
const IS_ITEM_PREVIEW_WINDOW = currentWindowLabel() === ITEM_PREVIEW_WINDOW_LABEL;
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
const LazyItemPreviewWindowApp = lazy(() =>
  import("./windows/ItemPreviewWindowApp").then((module) => ({ default: module.ItemPreviewWindowApp })),
);
const LazyItemContentEditor = lazy(() =>
  import("./ui/ItemContentEditor").then((module) => ({ default: module.ItemContentEditor })),
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

const FILTER_LOCK_STORAGE_KEY = "copicu.filter-lock.v1";
const FILTER_LOCK_SHORTCUT = "Ctrl+Shift+L";

function readLockedFilterQuery(): string | null {
  try {
    const value = window.localStorage?.getItem(FILTER_LOCK_STORAGE_KEY)?.trim() ?? "";
    if (!value) {
      return null;
    }
    const classification = classifyStructuredSearchDraft(value);
    return classification.kind === "plain" || classification.kind === "complete" ? value : null;
  } catch {
    return null;
  }
}

function isScenarioCommand(query: string) {
  return /^>\s*(?:escenario|scenario|capture\s+mode)(?:\s+.*)?$/i.test(query.trim());
}

function scenarioCommandSearch(query: string) {
  const match = query.trim().match(/^>\s*(?:escenario|scenario)(?:\s+(.*))?$/i);
  return match ? (match[1] ?? "").trim() : null;
}

function writeLockedFilterQuery(query: string | null) {
  try {
    if (query) {
      window.localStorage?.setItem(FILTER_LOCK_STORAGE_KEY, query);
    } else {
      window.localStorage?.removeItem(FILTER_LOCK_STORAGE_KEY);
    }
  } catch {
    // A locked filter still survives picker hides when storage is unavailable.
  }
}

function App() {
  const initialLockedFilterQueryRef = useRef(readLockedFilterQuery());
  const initialFilterQuery = initialLockedFilterQueryRef.current ?? "";
  const [filterLocked, setFilterLocked] = useState(initialLockedFilterQueryRef.current !== null);
  const [stats, setStats] = useState<CaptureStats | null>(null);
  const [probe, setProbe] = useState<ClipboardProbe | null>(null);
  const [events, setEvents] = useState<CaptureEvent[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyInputQuery, setHistoryInputQuery] = useState(initialFilterQuery);
  const [historyQuery, setHistoryQuery] = useState(initialFilterQuery);
  const [searchInterpretation, setSearchInterpretation] = useState<SearchInterpretation>(null);
  const [aiComposerMode, setAiComposerMode] = useState(false);
  const [historyPending, setHistoryPending] = useState(false);
  const [clearSearchPending, setClearSearchPending] = useState(false);
  const [foregroundSearchInFlight, setForegroundSearchInFlight] = useState(false);
  const [aiPlanning, setAiPlanning] = useState(false);
  const [historyLoadingMore, setHistoryLoadingMore] = useState(false);
  const [historyLoadingDelayed, setHistoryLoadingDelayed] = useState(false);
  const [historyNextCursor, setHistoryNextCursor] = useState<HistoryPageCursor | null>(null);
  const [historyPaginationBlocked, setHistoryPaginationBlocked] = useState<HistoryPaginationBlock | null>(null);
  const [historyTotalCount, setHistoryTotalCount] = useState<number | null>(null);
  const [historyFilteredCount, setHistoryFilteredCount] = useState<number | null>(null);
  // Search snapshot/generation transitions live here; legacy item state remains
  // a rendering bridge until the picker shell extraction moves it over.
  const [searchState, dispatchSearch] = useReducer(
    pickerSearchReducer<HistoryItem, HistoryPageCursor>,
    createPickerSearchState<HistoryItem, HistoryPageCursor>(initialFilterQuery),
  );
  const [markedTotalCount, setMarkedTotalCount] = useState<number | null>(null);
  const [newClipsAvailable, setNewClipsAvailable] = useState(false);
  const [query, setQuery] = useState(initialFilterQuery);
  const [knownTagSlugs, setKnownTagSlugs] = useState<string[]>([]);
  const [paletteTags, setPaletteTags] = useState<TagSummary[]>([]);
  const [savedHistoryViews, setSavedHistoryViews] = useState<SavedHistoryView[]>([]);
  const [openedSavedView, setOpenedSavedView] = useState<OpenedSavedView | null>(null);
  const [savedViewCreatorOpen, setSavedViewCreatorOpen] = useState(false);
  const [savedViewCreatorBusy, setSavedViewCreatorBusy] = useState(false);
  const [activeScenarioSession, setActiveScenarioSession] = useState<ActiveScenarioSession | null>(null);
  const [activeScenarioBusy, setActiveScenarioBusy] = useState(false);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [pickerMenuOpen, setPickerMenuOpen] = useState(false);
  const [pickerMenuView, setPickerMenuView] = useState<"actions" | "organize">("actions");
  const [scenarioSwitcherOpen, setScenarioSwitcherOpen] = useState(false);
  const [scenarioSwitcherLoading, setScenarioSwitcherLoading] = useState(false);
  const [scenariosLoaded, setScenariosLoaded] = useState(false);
  const [activeSearchSuggestion, setActiveSearchSuggestion] = useState(0);
  const [dismissedAutocompleteQuery, setDismissedAutocompleteQuery] = useState<string | null>(null);
  const [pickerPinned, setPickerPinned] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
  const [probeError, setProbeError] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);
  const [inlineEditDraft, setInlineEditDraft] = useState<InlineEditDraft | null>(null);
  const [inlineEditSaving, setInlineEditSaving] = useState(false);
  const [expandedItemIds, setExpandedItemIds] = useState<Set<number>>(() => new Set());
  const [createItemDraft, setCreateItemDraft] = useState<CreateItemDraft | null>(null);
  const [batchMetadataDraft, setBatchMetadataDraft] = useState<BatchMetadataDraft | null>(null);
  const [tagEditorDraft, setTagEditorDraft] = useState<TagEditorDraft | null>(null);
  const [tagEditorSaving, setTagEditorSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [openMarkMenu, setOpenMarkMenu] = useState<MarkMenuAnchor | null>(null);
  const [markedActionItems, setMarkedActionItems] = useState<HistoryItem[] | null>(null);
  const [markedActionItemsLoading, setMarkedActionItemsLoading] = useState(false);
  const [openItemMenu, setOpenItemMenu] = useState<ItemMenuAnchor | null>(null);
  const [commandPalette, setCommandPalette] = useState<CommandPaletteState | null>(null);
  const [actionPicker, setActionPicker] = useState<ActionPickerState | null>(null);
  const [searchHelpOpen, setSearchHelpOpen] = useState(false);
  const [findState, setFindState] = useState<FindUiState | null>(null);
  const [findMatches, setFindMatches] = useState<Map<number, FindItemMatches>>(() => new Map());
  const [findRevealItemId, setFindRevealItemId] = useState<number | null>(null);
  const [findTargetItem, setFindTargetItem] = useState<HistoryItem | null>(null);
  const [searchTriggerUpdating, setSearchTriggerUpdating] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [actionDefinitions, setActionDefinitions] = useState<ActionDefinition[]>([]);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [whichKeyState, setWhichKeyState] = useState<WhichKeyState | null>(null);
  const searchRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const findInputRef = useRef<HTMLInputElement>(null);
  const catalogItemIdRef = useRef<number | null>(null);
  const editTextRef = useRef<HTMLTextAreaElement>(null);
  const inlineEditTextRef = useRef<HTMLTextAreaElement>(null);
  const itemMenuRef = useRef<HTMLDivElement>(null);
  const itemMenuReturnFocusRef = useRef<HTMLElement | null>(null);
  const historyScrollRef = useRef<HTMLDivElement>(null);
  const historyRef = useRef<HistoryItem[]>([]);
  const historyRequestSeqRef = useRef(0);
  const historyLoadMoreSeqRef = useRef(0);
  const historyPaginationBlockedRef = useRef<HistoryPaginationBlock | null>(null);
  const searchIntentGenerationRef = useRef(0);
  const appliedSnapshotGenerationRef = useRef(0);
  const appliedDescriptorRef = useRef<AppliedSearchDescriptor | null>(null);
  const queryRef = useRef(query);
  const queryInteractionSeqRef = useRef(0);
  const historyInputQueryRef = useRef(historyInputQuery);
  const pickerSearchSettingsRef = useRef(settings.picker);
  const searchDebounceTimerRef = useRef<number | null>(null);
  const skipNextRealtimeSearchRef = useRef<SearchReplayToken | null>(null);
  const autocompleteCommittedQueryRef = useRef<string | null>(null);
  const foregroundSearchInFlightRef = useRef(false);
  const foregroundSearchOwnerSeqRef = useRef<number | null>(null);
  const [deferredAppliedRefresh, setDeferredAppliedRefresh] = useState<SearchReplayToken | null>(null);
  const deferredAppliedRefreshRef = useRef<SearchReplayToken | null>(null);
  const lastSearchFailureRef = useRef<SearchFailureReplay | null>(null);
  const pendingFilterLockRef = useRef<PendingFilterLock | null>(null);
  const clearSearchPendingRef = useRef(false);
  const selectedIdsRef = useRef<Set<number>>(new Set());
  const selectedItemIdRef = useRef<number | null>(selectedItemId);
  const lastActivatedItemIdRef = useRef<number | null>(null);
  const pendingHistoryActivationItemIdRef = useRef<number | null>(null);
  const metadataShortcutHandledAtRef = useRef(0);
  const selectionAnchorItemIdRef = useRef<number | null>(null);
  const selectionInteractionSeqRef = useRef(0);
  const nextToastIdRef = useRef(1);
  const compoundHotkeyPendingRef = useRef(false);
  const compoundHotkeyArmedAtRef = useRef(0);
  const whichKeyRevealTimerRef = useRef<number | null>(null);
  const pickerWasHiddenRef = useRef(false);
  const filterLockedRef = useRef(filterLocked);
  const activeScenarioSessionRef = useRef<ActiveScenarioSession | null>(activeScenarioSession);
  const fullContentFetchIdsRef = useRef<Set<number>>(new Set());
  const findStateRef = useRef<FindUiState | null>(findState);
  const findGenerationRef = useRef(0);
  const findRequestSeqRef = useRef(0);
  const findNavigationSeqRef = useRef(0);
  const findDebounceTimerRef = useRef<number | null>(null);
  const findMatchesRequestSeqRef = useRef(0);
  const findTargetItemRef = useRef<HistoryItem | null>(null);
  const findStartPendingRef = useRef(0);
  const findStartRef = useRef<FindStartRunner | null>(null);

  const updateClearSearchPending = useCallback((pending: boolean) => {
    clearSearchPendingRef.current = pending;
    setClearSearchPending(pending);
  }, []);

  const updateDeferredAppliedRefresh = useCallback((token: SearchReplayToken | null) => {
    deferredAppliedRefreshRef.current = token;
    setDeferredAppliedRefresh(token);
  }, []);

  const supersedeSearchIntent = useCallback(
    (draftQuery: string, status: "idle" | "held" | "applying") => {
      const intentGeneration = ++searchIntentGenerationRef.current;
      foregroundSearchOwnerSeqRef.current = null;
      foregroundSearchInFlightRef.current = false;
      setForegroundSearchInFlight(false);
      setAiPlanning(false);
      setHistoryError(null);
      lastSearchFailureRef.current = null;
      pendingFilterLockRef.current = null;
      dispatchSearch({
        type: "draftChanged",
        query: draftQuery,
        status,
        generation: intentGeneration,
      });
    },
    [],
  );

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
  const hasExplicitSelection = selectedItems.length > 0;
  const visibleMarkedItems = useMemo(
    () => history.filter((item) => item.is_marked),
    [history],
  );
  const selectedVisibleCount = useMemo(
    () => history.reduce((count, item) => count + (selectedIds.has(item.id) ? 1 : 0), 0),
    [history, selectedIds],
  );
  const allVisibleSelected = history.length > 0 && selectedVisibleCount === history.length;
  const someVisibleSelected = selectedVisibleCount > 0 && !allVisibleSelected;
  const historyPaginationBlockMatchesCurrent = historyPaginationBlocked !== null
    && historyNextCursor !== null
    && historyPaginationBlocked.descriptorFingerprint === appliedDescriptorRef.current?.fingerprint
    && sameHistoryPageCursor(historyPaginationBlocked.cursor, historyNextCursor);
  const hasNextHistoryPage = historyNextCursor !== null && !historyPaginationBlockMatchesCurrent;
  const searchTriggerMode = settings.picker.searchTriggerMode;
  const scenarioCommandQuery = aiComposerMode ? null : scenarioCommandSearch(query);
  const scenarioCommandOptions = useMemo(() => {
    if (scenarioCommandQuery === null) {
      return [];
    }
    const normalized = scenarioCommandQuery.toLocaleLowerCase();
    return [...scenarios]
      .sort((left, right) => right.updatedAtUnixMs - left.updatedAtUnixMs)
      .filter((scenario) => !normalized || scenario.name.toLocaleLowerCase().includes(normalized));
  }, [scenarioCommandQuery, scenarios]);
  const autocompleteSuggestions = useMemo(
    () => (aiComposerMode || scenarioCommandQuery !== null ? [] : searchSuggestions(query, knownTagSlugs)),
    [aiComposerMode, knownTagSlugs, query, scenarioCommandQuery],
  );
  const autocompleteOpen = autocompleteSuggestions.length > 0 && dismissedAutocompleteQuery !== query;
  const scenarioCommandOpen = scenarioCommandOptions.length > 0 && dismissedAutocompleteQuery !== query;
  const searchSuggestionsOpen = autocompleteOpen || scenarioCommandOpen;
  const activeSearchSuggestionCount = scenarioCommandOpen
    ? scenarioCommandOptions.length
    : autocompleteSuggestions.length;
  const activeSearchSuggestionIndex = activeSearchSuggestionCount > 0
    ? Math.min(Math.max(activeSearchSuggestion, 0), activeSearchSuggestionCount - 1)
    : 0;
  const structuredSearchDraft = useMemo(
    () => classifyStructuredSearchDraft(query),
    [query],
  );
  const hasSearchDraft = query.trim() !== historyInputQuery;
  const structuredSearchHold = shouldHoldStructuredSearchDraft(structuredSearchDraft, {
    draftChanged: hasSearchDraft,
    searchTriggerMode,
    deferStructuredSearchUntilEnter: settings.picker.deferStructuredSearchUntilEnter,
    autocompleteActive: autocompleteOpen && !scenarioCommandOpen,
    autocompleteCommitted: autocompleteCommittedQueryRef.current === query,
  });
  const effectiveSearchTriggerMode: SearchTriggerMode = structuredSearchHold ? "enter" : searchTriggerMode;
  const nextTriggerMode = nextSearchTriggerMode(searchTriggerMode);
  const searchTriggerAriaLabel = `Search trigger: ${searchTriggerModeName(searchTriggerMode)}, switch to ${searchTriggerModeName(nextTriggerMode)}`;
  const displayedHistory = useMemo(() => {
    if (!findTargetItem || history.some((item) => item.id === findTargetItem.id)) {
      return history;
    }
    return [...history, findTargetItem];
  }, [findTargetItem, history]);
  const remoteFindItemId = displayedHistory !== history ? findTargetItem?.id ?? null : null;
  const virtualRowCount = hasNextHistoryPage ? displayedHistory.length + 1 : displayedHistory.length;
  const rowVirtualizer = useVirtualizer({
    count: virtualRowCount,
    getScrollElement: () => historyScrollRef.current,
    measureElement: (element) => element.getBoundingClientRect().height,
    estimateSize: (index) => {
      const item = displayedHistory[index];
      if (!item) {
        return 38;
      }
      const markdownImageCount = markdownImages(item.text).length;
      if (markdownImageCount > 0) {
        return Math.min(900, 100 + markdownImageCount * 180);
      }
      if (item.content_kind === "image") {
        return 190;
      }
      return estimateTextRowSize(item);
    },
    getItemKey: (index) => displayedHistory[index]?.id ?? `loader-${index}`,
    ...({ shouldAdjustScrollPositionOnItemSizeChange: () => false } as Record<string, unknown>),
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
    if (searchState.applied) {
      appliedDescriptorRef.current = searchState.applied.descriptor;
      appliedSnapshotGenerationRef.current = searchState.applied.generation;
    }
  }, [searchState.applied]);

  useEffect(() => {
    queryRef.current = query;
    queryInteractionSeqRef.current += 1;
    setActiveSearchSuggestion(0);
  }, [query]);

  useEffect(() => {
    const suggestionCount = scenarioCommandOpen ? scenarioCommandOptions.length : autocompleteSuggestions.length;
    setActiveSearchSuggestion((current) => Math.min(current, Math.max(suggestionCount - 1, 0)));
  }, [autocompleteSuggestions.length, scenarioCommandOpen, scenarioCommandOptions.length]);

  useEffect(() => {
    historyInputQueryRef.current = historyInputQuery;
  }, [historyInputQuery]);

  useEffect(() => {
    activeScenarioSessionRef.current = activeScenarioSession;
  }, [activeScenarioSession]);

  useEffect(() => {
    filterLockedRef.current = filterLocked;
    if (filterLocked) {
      writeLockedFilterQuery(historyInputQuery.trim() || null);
    } else {
      writeLockedFilterQuery(null);
    }
  }, [filterLocked, historyInputQuery]);

  useEffect(() => {
    pickerSearchSettingsRef.current = settings.picker;
  }, [settings.picker]);

  useEffect(() => {
    selectedIdsRef.current = selectedIds;
  }, [selectedIds]);

  useEffect(() => {
    selectedItemIdRef.current = selectedItemId;
  }, [selectedItemId]);

  const focusSearch = useCallback(() => {
    window.setTimeout(() => searchRef.current?.focus(), 0);
  }, []);

  useEffect(() => {
    findStateRef.current = findState;
  }, [findState]);

  const clearFindDebounce = useCallback(() => {
    if (findDebounceTimerRef.current !== null) {
      window.clearTimeout(findDebounceTimerRef.current);
      findDebounceTimerRef.current = null;
    }
  }, []);

  const clearFindPresentation = useCallback(() => {
    setFindMatches(new Map());
    setFindRevealItemId(null);
    findTargetItemRef.current = null;
    setFindTargetItem(null);
  }, []);

  const closeFind = useCallback(
    async ({ restoreFocus = true }: { restoreFocus?: boolean } = {}) => {
      clearFindDebounce();
      findGenerationRef.current += 1;
      findRequestSeqRef.current += 1;
      findNavigationSeqRef.current += 1;
      findMatchesRequestSeqRef.current += 1;
      const previous = findStateRef.current;
      findStateRef.current = null;
      setFindState(null);
      clearFindPresentation();
      const closeRequest = previous?.sessionId
        ? findClose({ sessionId: previous.sessionId }).catch(() => undefined)
        : Promise.resolve();
      const cancelPendingRequest = findStartPendingRef.current > 0
        ? findCancelOwner().catch(() => undefined)
        : Promise.resolve();
      if (restoreFocus) {
        focusSearch();
      }
      await Promise.all([closeRequest, cancelPendingRequest]);
    },
    [clearFindDebounce, clearFindPresentation, focusSearch],
  );

  useEffect(() => () => {
    void closeFind({ restoreFocus: false });
  }, [closeFind]);

  const materializedFindItem = useCallback(
    (materialized: NonNullable<FindTargetResponse["materialized"]>) => {
      const item = materialized.item;
      const text = item.text ?? "";
      return {
        id: item.id,
        content_kind: item.contentKind,
        text,
        preview_text: text.slice(0, 2400),
        text_char_count: Array.from(text).length,
        includes_content: true,
        normalized_hash: "",
        created_at_unix_ms: 0,
        last_used_at_unix_ms: 0,
        last_copied_at_unix_ms: 0,
        copy_count: 0,
        mime_primary: null,
        blob_path: null,
        thumbnail_path: null,
        byte_size: null,
        width: null,
        height: null,
        thumbnail_data_url: null,
        title: item.title,
        notes: item.notes,
        tags: item.tags,
        is_marked: false,
        marked_at_unix_ms: null,
        is_inbox: false,
        inbox_at_unix_ms: null,
      } satisfies HistoryItem;
    },
    [],
  );

  const recoverFindSession = useCallback((error: unknown, sessionId: string, generation: number) => {
    const message = String(error);
    if (!/session not found|sessionInvalidated|find session/i.test(message)) {
      return false;
    }
    const current = findStateRef.current;
    if (
      !current
      || !current.active
      || current.sessionId !== sessionId
      || current.generation !== generation
    ) {
      return true;
    }
    void findClose({ sessionId }).catch(() => undefined);
    if (current.recoveryAttempted || !current.needle.trim()) {
      const nextState: FindUiState = {
        ...current,
        status: "error",
        error: "Find session expired. Retry Find to rescan these results.",
      };
      findStateRef.current = nextState;
      setFindState(nextState);
      return true;
    }
    const nextState: FindUiState = {
      ...current,
      sessionId: null,
      status: "starting",
      error: null,
      recoveryAttempted: true,
    };
    findStateRef.current = nextState;
    setFindState(nextState);
    clearFindPresentation();
    const startRunner = findStartRef.current;
    if (startRunner) {
      void startRunner(current.needle, generation, true, current.currentOrdinal, current.currentTarget);
    }
    return true;
  }, [clearFindPresentation]);

  const revealFindTarget = useCallback(
    async (
      target: FindOccurrence | null,
      sessionId: string,
      generation: number,
      recoveryAttempted = false,
      navigationSeq?: number,
    ) => {
      if (!target) {
        setFindRevealItemId(null);
        findTargetItemRef.current = null;
        setFindTargetItem(null);
        return;
      }
      if (
        findStateRef.current?.sessionId !== sessionId
        || findStateRef.current.generation !== generation
        || (navigationSeq !== undefined && navigationSeq !== findNavigationSeqRef.current)
      ) {
        return;
      }

      if (findTargetItemRef.current && findTargetItemRef.current.id !== target.itemId) {
        findTargetItemRef.current = null;
        setFindTargetItem(null);
      }

      setFindState((current) => current && current.sessionId === sessionId && current.generation === generation
        ? {
            ...current,
            currentOrdinal: target.ordinal,
            currentTarget: target,
            error: null,
          }
        : current);
      setFindRevealItemId(target.itemId);

      try {
        const response = await findTarget({ sessionId, ordinal: target.ordinal });
        if (
          findStateRef.current?.sessionId !== sessionId
          || findStateRef.current.generation !== generation
          || (navigationSeq !== undefined && navigationSeq !== findNavigationSeqRef.current)
        ) {
          return;
        }
        if (typeof response.total === "number") {
          setFindState((current) => current && current.sessionId === sessionId
            ? { ...current, total: response.total }
            : current);
        }
        if (!response.target) {
          setFindState((current) => current && current.sessionId === sessionId
            ? {
                ...current,
                status: "empty",
                total: 0,
                currentOrdinal: null,
                currentTarget: null,
                error: null,
              }
            : current);
          clearFindPresentation();
          return;
        }
        setFindState((current) => current && current.sessionId === sessionId
          ? {
              ...current,
              currentOrdinal: response.target?.ordinal ?? target.ordinal,
              currentTarget: response.target,
              status: response.total > 0 ? "ready" : "empty",
              error: null,
            }
          : current);

        if (response.materialized) {
          const materialized = materializedFindItem(response.materialized);
          const existing = historyRef.current.find((item) => item.id === materialized.id);
          if (!existing || !existing.includes_content) {
            if (existing) {
              const nextItem = {
                ...existing,
                ...materialized,
                normalized_hash: existing.normalized_hash,
                created_at_unix_ms: existing.created_at_unix_ms,
                last_used_at_unix_ms: existing.last_used_at_unix_ms,
                last_copied_at_unix_ms: existing.last_copied_at_unix_ms,
                copy_count: existing.copy_count,
                is_marked: existing.is_marked,
                marked_at_unix_ms: existing.marked_at_unix_ms,
                is_inbox: existing.is_inbox,
                inbox_at_unix_ms: existing.inbox_at_unix_ms,
              } satisfies HistoryItem;
              historyRef.current = historyRef.current.map((item) => item.id === materialized.id ? nextItem : item);
              setHistory(historyRef.current);
            } else {
              findTargetItemRef.current = materialized;
              setFindTargetItem(materialized);
            }
          } else {
            findTargetItemRef.current = null;
            setFindTargetItem(null);
          }
        } else {
          const existing = historyRef.current.find((item) => item.id === target.itemId);
          if (existing && !existing.includes_content) {
            const fullItem = await getHistoryItem(existing.id);
            historyRef.current = historyRef.current.map((item) => item.id === fullItem.id ? fullItem : item);
            setHistory(historyRef.current);
          }
        }

        window.requestAnimationFrame(() => {
          if (
            findStateRef.current?.sessionId !== sessionId
            || findStateRef.current.generation !== generation
            || (navigationSeq !== undefined && navigationSeq !== findNavigationSeqRef.current)
          ) {
            return;
          }
          const targetIndex = historyRef.current.findIndex((item) => item.id === target.itemId);
          const remoteTargetIndex = findTargetItemRef.current?.id === target.itemId
            ? historyRef.current.length
            : -1;
          const revealIndex = targetIndex >= 0 ? targetIndex : remoteTargetIndex;
          if (revealIndex >= 0) {
            rowVirtualizer.scrollToIndex(revealIndex, { align: "center" });
            window.requestAnimationFrame(() => {
              if (navigationSeq !== undefined && navigationSeq !== findNavigationSeqRef.current) {
                return;
              }
              const row = document.getElementById(`history-item-${target.itemId}`);
              row?.scrollIntoView({ block: "center", behavior: "auto" });
            });
          }
        });
      } catch (error) {
        if (
          findStateRef.current?.sessionId !== sessionId
          || findStateRef.current.generation !== generation
          || (navigationSeq !== undefined && navigationSeq !== findNavigationSeqRef.current)
        ) {
          return;
        }
        if (recoverFindSession(error, sessionId, generation)) {
          return;
        }
        const message = String(error);
        setFindState((current) => current && current.sessionId === sessionId
          ? {
              ...current,
              status: "error",
              recoveryAttempted: recoveryAttempted || /session not found|sessionInvalidated|find session/i.test(message),
              error: "Could not load this match. Try again.",
            }
          : current);
      }
    },
    [clearFindPresentation, materializedFindItem, recoverFindSession, rowVirtualizer],
  );

  const startFind = useCallback(
    async (
      needle: string,
      generation = findGenerationRef.current,
      recoveryAttempted = false,
      preferredOrdinal: number | null = null,
      preferredTarget: FindOccurrence | null = null,
    ) => {
      const trimmedNeedle = needle.trim();
      const descriptor = appliedDescriptorRef.current;
      if (!isAppliedSearchDescriptor(descriptor)) {
        setFindState((current) => current
          ? { ...current, status: "error", error: "Apply a filter before using Find." }
          : current);
        clearFindPresentation();
        return;
      }
      const requestSeq = ++findRequestSeqRef.current;
      const previous = findStateRef.current;
      if (previous?.sessionId) {
        void findClose({ sessionId: previous.sessionId }).catch(() => undefined);
      }
      if (!trimmedNeedle) {
        setFindState((current) => current
          ? {
              ...current,
              sessionId: null,
              generation,
              status: "idle",
              total: 0,
              currentOrdinal: null,
              currentTarget: null,
              error: null,
              recoveryAttempted: false,
            }
          : current);
        clearFindPresentation();
        return;
      }

      setFindState((current) => current
        ? {
            ...current,
            sessionId: null,
            filterFingerprint: descriptor.fingerprint,
            generation,
            status: "starting",
            total: 0,
            currentOrdinal: null,
            currentTarget: null,
            error: null,
            recoveryAttempted,
          }
        : current);
      clearFindPresentation();

      let startedSessionId: string | null = null;
      findStartPendingRef.current += 1;
      try {
        const response = await findStart({
          appliedDescriptor: descriptor,
          needle: trimmedNeedle,
          generation,
        });
        startedSessionId = response.sessionId;
        if (
          requestSeq !== findRequestSeqRef.current
          || findStateRef.current?.generation !== generation
          || !findStateRef.current?.active
        ) {
          void findClose({ sessionId: response.sessionId }).catch(() => undefined);
          return;
        }
        let target = response.firstTarget;
        const startedState = findStateRef.current
          ? {
              ...findStateRef.current,
              sessionId: response.sessionId,
              filterFingerprint: descriptor.fingerprint,
              generation,
              status: (response.total > 0 ? "ready" : "empty") as FindBarStatus,
              total: response.total,
              currentOrdinal: target?.ordinal ?? null,
              currentTarget: target,
              error: null,
              recoveryAttempted,
            }
          : null;
        if (startedState) {
          findStateRef.current = startedState;
          setFindState(startedState);
        }
        if (target && response.total > 0 && (preferredOrdinal !== null || preferredTarget)) {
          const resolved = await findResolveAnchor({
            sessionId: response.sessionId,
            preferredOrdinal,
            preferredTarget,
          });
          target = resolved.target ?? target;
          if (
            requestSeq !== findRequestSeqRef.current
            || findStateRef.current?.generation !== generation
            || !findStateRef.current?.active
          ) {
            void findClose({ sessionId: response.sessionId }).catch(() => undefined);
            return;
          }
        }
        const nextState = findStateRef.current
          ? {
              ...findStateRef.current,
              sessionId: response.sessionId,
              filterFingerprint: descriptor.fingerprint,
              generation,
              status: (response.total > 0 ? "ready" : "empty") as FindBarStatus,
              total: response.total,
              currentOrdinal: target?.ordinal ?? null,
              currentTarget: target,
              error: null,
              recoveryAttempted,
            }
          : null;
        if (nextState) {
          findStateRef.current = nextState;
          setFindState(nextState);
        }
        if (target) {
          await revealFindTarget(target, response.sessionId, generation, recoveryAttempted);
        }
      } catch (error) {
        if (
          requestSeq !== findRequestSeqRef.current
          || findStateRef.current?.generation !== generation
        ) {
          if (startedSessionId) {
            void findClose({ sessionId: startedSessionId }).catch(() => undefined);
          }
          return;
        }
        if (startedSessionId && recoverFindSession(error, startedSessionId, generation)) {
          return;
        }
        if (startedSessionId) {
          void findClose({ sessionId: startedSessionId }).catch(() => undefined);
        }
        setFindState((current) => current
          ? {
              ...current,
              sessionId: null,
              status: "error",
              error: "Find could not scan these results. Try again.",
              recoveryAttempted,
            }
          : current);
      } finally {
        findStartPendingRef.current = Math.max(0, findStartPendingRef.current - 1);
      }
    },
    [clearFindPresentation, recoverFindSession, revealFindTarget],
  );
  findStartRef.current = startFind;

  const scheduleFind = useCallback(
    (
      needle: string,
      generation: number,
      preferredOrdinal: number | null = null,
      preferredTarget: FindOccurrence | null = null,
    ) => {
      clearFindDebounce();
      findDebounceTimerRef.current = window.setTimeout(() => {
        findDebounceTimerRef.current = null;
        void startFind(needle, generation, false, preferredOrdinal, preferredTarget);
      }, 120);
    },
    [clearFindDebounce, startFind],
  );

  const rebaseFind = useCallback(() => {
    const current = findStateRef.current;
    if (!current?.active || !current.needle.trim()) {
      return;
    }
    if (current.sessionId) {
      void findClose({ sessionId: current.sessionId }).catch(() => undefined);
    }
    findGenerationRef.current += 1;
    const generation = findGenerationRef.current;
    const nextState: FindUiState = {
      ...current,
      generation,
      sessionId: null,
      status: "starting",
      total: 0,
      currentOrdinal: null,
      currentTarget: null,
      error: null,
      recoveryAttempted: false,
    };
    findStateRef.current = nextState;
    setFindState(nextState);
    clearFindPresentation();
    scheduleFind(current.needle, generation, current.currentOrdinal, current.currentTarget);
  }, [clearFindPresentation, scheduleFind]);

  const retryFind = useCallback(() => {
    const current = findStateRef.current;
    if (!current?.active || !current.needle.trim()) {
      return;
    }
    findGenerationRef.current += 1;
    findNavigationSeqRef.current += 1;
    const generation = findGenerationRef.current;
    const nextState: FindUiState = {
      ...current,
      generation,
      sessionId: null,
      status: "starting",
      total: 0,
      currentOrdinal: null,
      currentTarget: null,
      error: null,
      recoveryAttempted: false,
    };
    findStateRef.current = nextState;
    setFindState(nextState);
    clearFindPresentation();
    scheduleFind(current.needle, generation);
  }, [clearFindPresentation, scheduleFind]);

  const openFind = useCallback(() => {
    const descriptor = appliedDescriptorRef.current;
    if (!isAppliedSearchDescriptor(descriptor)) {
      return;
    }
    const existing = findStateRef.current;
    if (existing?.active) {
      window.setTimeout(() => findInputRef.current?.focus(), 0);
      return;
    }
    findGenerationRef.current += 1;
    const nextState: FindUiState = {
      active: true,
      needle: "",
      sessionId: null,
      filterFingerprint: descriptor.fingerprint,
      generation: findGenerationRef.current,
      status: "idle",
      total: 0,
      currentOrdinal: null,
      currentTarget: null,
      error: null,
      recoveryAttempted: false,
    };
    findStateRef.current = nextState;
    setFindState(nextState);
    clearFindPresentation();
    window.setTimeout(() => findInputRef.current?.focus(), 0);
  }, [clearFindPresentation]);

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape" && findStateRef.current?.active) {
        event.preventDefault();
        event.stopPropagation();
        void closeFind();
        return;
      }
      if (
        !(event.ctrlKey || event.metaKey)
        || event.altKey
        || event.shiftKey
        || event.key.toLocaleLowerCase() !== "f"
        || editDraft
        || inlineEditDraft
        || createItemDraft
        || batchMetadataDraft
        || tagEditorDraft
        || commandPalette
        || actionPicker
        || searchHelpOpen
      ) {
        return;
      }
      const descriptor = appliedDescriptorRef.current;
      if (!isAppliedSearchDescriptor(descriptor)) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      openFind();
    };
    document.addEventListener("keydown", onKeyDown, { capture: true });
    return () => document.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [
    actionPicker,
    batchMetadataDraft,
    closeFind,
    commandPalette,
    createItemDraft,
    editDraft,
    inlineEditDraft,
    openFind,
    searchHelpOpen,
    tagEditorDraft,
  ]);

  const navigateFind = useCallback(
    async (direction: "next" | "previous") => {
      const current = findStateRef.current;
      if (!current?.active || !current.sessionId || current.total <= 0) {
        return;
      }
      const sessionId = current.sessionId;
      const generation = current.generation;
      const navigationSeq = ++findNavigationSeqRef.current;
      try {
        const response = await findNavigate({
          sessionId,
          currentOrdinal: current.currentOrdinal,
          ordinal: current.currentOrdinal,
          direction,
        });
        if (
          findStateRef.current?.sessionId !== sessionId
          || findStateRef.current.generation !== generation
          || navigationSeq !== findNavigationSeqRef.current
        ) {
          return;
        }
        if (response.target) {
          setFindState((state) => state && state.sessionId === sessionId
            ? {
                ...state,
                total: response.total,
                currentOrdinal: response.target?.ordinal ?? null,
                currentTarget: response.target,
                status: response.total > 0 ? "ready" : "empty",
                error: null,
              }
            : state);
          await revealFindTarget(response.target, sessionId, generation, current.recoveryAttempted, navigationSeq);
        } else {
          setFindState((state) => state && state.sessionId === sessionId
            ? { ...state, total: response.total, currentOrdinal: null, currentTarget: null, status: "empty" }
            : state);
          clearFindPresentation();
        }
      } catch (error) {
        if (
          findStateRef.current?.sessionId !== sessionId
          || findStateRef.current.generation !== generation
          || navigationSeq !== findNavigationSeqRef.current
        ) {
          return;
        }
        if (recoverFindSession(error, sessionId, generation)) {
          return;
        }
        setFindState((state) => state && state.sessionId === sessionId
          ? { ...state, status: "error", error: "Find navigation failed. Try again." }
          : state);
      }
    },
    [clearFindPresentation, recoverFindSession, revealFindTarget],
  );

  const handleFindInputChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const needle = event.currentTarget.value;
    findGenerationRef.current += 1;
    findNavigationSeqRef.current += 1;
    const generation = findGenerationRef.current;
    const current = findStateRef.current;
    if (!current) {
      return;
    }
    const nextState: FindUiState = {
      ...current,
      needle,
      generation,
      status: needle.trim() ? "starting" : "idle",
      total: 0,
      currentOrdinal: null,
      currentTarget: null,
      error: null,
      recoveryAttempted: false,
    };
    findStateRef.current = nextState;
    setFindState(nextState);
    if (!needle.trim()) {
      clearFindDebounce();
      void startFind("", generation);
      return;
    }
    scheduleFind(needle, generation);
  }, [clearFindDebounce, scheduleFind, startFind]);

  const handleFindInputKeyDown = useCallback((event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void navigateFind(event.shiftKey ? "previous" : "next");
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      void closeFind();
    }
  }, [closeFind, navigateFind]);

  useEffect(() => {
    const sessionId = findState?.sessionId;
    if (!findState?.active || !sessionId || history.length === 0) {
      setFindMatches(new Map());
      return undefined;
    }
    const requestSeq = ++findMatchesRequestSeqRef.current;
    let active = true;
    const itemIds = Array.from(new Set([
      ...history.map((item) => item.id),
      ...(findTargetItem ? [findTargetItem.id] : []),
    ]));
    void findMatchesForItems({ sessionId, itemIds })
      .then((response) => {
        if (
          !active
          || requestSeq !== findMatchesRequestSeqRef.current
          || findStateRef.current?.sessionId !== sessionId
        ) {
          return;
        }
        const next = new Map<number, FindItemMatches>();
        for (const item of response.items) {
          next.set(item.itemId, item);
        }
        setFindMatches(next);
      })
      .catch((error) => {
        if (!active || findStateRef.current?.sessionId !== sessionId) {
          return;
        }
        if (recoverFindSession(error, sessionId, findStateRef.current?.generation ?? 0)) {
          return;
        }
        setFindState((currentState) => currentState && currentState.sessionId === sessionId
          ? { ...currentState, status: "error", error: "Find highlights are unavailable. Retry Find." }
          : currentState);
      });
    return () => {
      active = false;
    };
  }, [findState?.sessionId, findState?.active, findTargetItem?.id, history, recoverFindSession]);

  useEffect(() => {
    const appliedFingerprint = searchState.applied?.descriptor.fingerprint ?? null;
    if (
      findStateRef.current?.active
      && findStateRef.current.filterFingerprint
      && findStateRef.current.filterFingerprint !== appliedFingerprint
    ) {
      void closeFind({ restoreFocus: false });
    }
  }, [closeFind, searchState.applied?.descriptor.fingerprint]);

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

  const stopCurrentScenario = useCallback(async () => {
    const previous = activeScenarioSessionRef.current;
    if (!previous || activeScenarioBusy) {
      return;
    }
    activeScenarioSessionRef.current = null;
    setActiveScenarioSession(null);
    setActiveScenarioBusy(true);
    try {
      await stopActiveScenario();
    } catch (error) {
      activeScenarioSessionRef.current = previous;
      setActiveScenarioSession(previous);
      pushToast({
        title: "Capture mode still active",
        message: String(error),
        tone: "danger",
      });
    } finally {
      setActiveScenarioBusy(false);
    }
  }, [activeScenarioBusy, pushToast]);

  const leaveOpenedSavedView = useCallback(() => {
    setOpenedSavedView(null);
  }, []);

  const closeTransientEditors = useCallback(() => {
    setEditDraft(null);
    catalogItemIdRef.current = null;
    setInlineEditDraft(null);
    setInlineEditSaving(false);
    setExpandedItemIds(new Set());
    setCreateItemDraft(null);
    setBatchMetadataDraft(null);
    setTagEditorDraft(null);
    setTagEditorSaving(false);
    setOpenItemMenu(null);
    setActionPicker(null);
    setPickerMenuOpen(false);
    setPickerMenuView("actions");
    setSavedViewCreatorOpen(false);
    setEditError(null);
  }, []);

  const resetPickerSession = useCallback(() => {
    void closeFind({ restoreFocus: false });
    closeTransientEditors();
    setCommandPalette(null);
    setActionPicker(null);
    setScenarioSwitcherOpen(false);
    setSearchHelpOpen(false);
    setOpenMarkMenu(null);
    setActionError(null);
    setAiComposerMode(false);
    setSearchInterpretation(null);
    setNewClipsAvailable(false);
    autocompleteCommittedQueryRef.current = null;
    if (!filterLockedRef.current && !activeScenarioSessionRef.current) {
      queryRef.current = "";
      historyInputQueryRef.current = "";
      setQuery("");
      setHistoryInputQuery("");
      setHistoryQuery("");
      if (searchRef.current) {
        searchRef.current.value = "";
      }
    }
    selectionInteractionSeqRef.current += 1;
    const emptySelection = new Set<number>();
    selectedItemIdRef.current = null;
    selectedIdsRef.current = emptySelection;
    setSelectedItemId(null);
    setSelectedIds(emptySelection);
    selectionAnchorItemIdRef.current = null;
    historyScrollRef.current?.scrollTo({ top: 0 });
  }, [closeFind, closeTransientEditors]);

  const openSettingsPanel = useCallback(() => {
    setSettingsError(null);
    setCommandPalette(null);
    setActionPicker(null);
    void openSettingsWindow().catch((error) => setSettingsError(String(error)));
  }, []);

  const createSavedViewFromPicker = useCallback(async (title: string) => {
    if (savedViewCreatorBusy) return;
    setSavedViewCreatorBusy(true);
    try {
      const created = await createSavedHistoryView({
        title,
        query: scenarioCommandQuery !== null ? historyInputQuery : query.trim(),
        hotkey: null,
        captureTags: [],
      });
      setSavedHistoryViews((current) => [
        created,
        ...current.filter((view) => view.id !== created.id),
      ]);
      setSavedViewCreatorOpen(false);
      pushToast({ title: "Saved search created", message: created.title, tone: "success" });
    } catch (error) {
      pushToast({ title: "Could not save current search", message: String(error), tone: "danger" });
      throw error;
    } finally {
      setSavedViewCreatorBusy(false);
    }
  }, [historyInputQuery, pushToast, query, savedViewCreatorBusy, scenarioCommandQuery]);

  const reloadScenarios = useCallback(async () => {
    setScenarioSwitcherLoading(true);
    try {
      const [nextScenarios, tags] = await Promise.all([listScenarios(), listTags()]);
      setScenarios(nextScenarios);
      setPaletteTags(tags);
      setKnownTagSlugs(tags.map((tag) => tag.slug));
      setScenariosLoaded(true);
    } catch (error) {
      pushToast({ title: "Could not load capture modes", message: String(error), tone: "danger" });
    } finally {
      setScenarioSwitcherLoading(false);
    }
  }, [pushToast]);

  const openScenarioMenu = useCallback(() => {
    closeTransientEditors();
    setCommandPalette(null);
    setActionPicker(null);
    setPickerMenuOpen(true);
    void reloadScenarios();
  }, [closeTransientEditors, reloadScenarios]);

  const activateScenarioFromPicker = useCallback(async (id: number) => {
    if (activeScenarioBusy) return;
    setActiveScenarioBusy(true);
    try {
      const session = await activateScenario(id);
      activeScenarioSessionRef.current = session;
      setActiveScenarioSession(session);
      setPickerMenuOpen(false);
      setScenarioSwitcherOpen(false);
      setDismissedAutocompleteQuery(session.query);
    } catch (error) {
      pushToast({ title: "Could not activate capture mode", message: String(error), tone: "danger" });
    } finally {
      setActiveScenarioBusy(false);
    }
  }, [activeScenarioBusy, pushToast]);

  const createScenarioFromPicker = useCallback(async (
    request: CreateScenarioFromQueryRequest,
    activate: boolean,
  ) => {
    if (activeScenarioBusy) return;
    setActiveScenarioBusy(true);
    try {
      const created = await createScenarioFromQuery(request);
      setScenarios((current) => [created, ...current.filter((scenario) => scenario.id !== created.id)]);
      if (activate) {
        const session = await activateScenario(created.id);
        activeScenarioSessionRef.current = session;
        setActiveScenarioSession(session);
        setPickerMenuOpen(false);
        setScenarioSwitcherOpen(false);
      } else {
        pushToast({ title: "Capture mode saved", message: created.name, tone: "success" });
      }
    } catch (error) {
      pushToast({ title: "Could not create capture mode", message: String(error), tone: "danger" });
      throw error;
    } finally {
      setActiveScenarioBusy(false);
    }
  }, [activeScenarioBusy, pushToast]);

  useEffect(() => {
    if (scenarioCommandQuery !== null && !scenariosLoaded && !scenarioSwitcherLoading) {
      void reloadScenarios();
    }
  }, [reloadScenarios, scenarioCommandQuery, scenarioSwitcherLoading, scenariosLoaded]);

  const openCommandPalette = useCallback(() => {
    closeTransientEditors();
    setCommandPalette({ query: "", activeIndex: 0 });
    setActionPicker(null);
    void Promise.all([listTags(), listSavedHistoryViews()])
      .then(([tags, views]) => {
        setPaletteTags(tags);
        setKnownTagSlugs(tags.map((tag) => tag.slug));
        setSavedHistoryViews(views);
      })
      .catch(() => undefined);
  }, [closeTransientEditors]);

  const openActionPicker = useCallback(() => {
    closeTransientEditors();
    setCommandPalette(null);
    setActionPicker({ query: "", activeIndex: 0 });
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

  const quitCopicu = useCallback(() => {
    void recordWindowChromeEvent("quit-app-command-start");
    void invoke("quit_app").catch((error) => {
      void recordWindowChromeEvent("quit-app-command-error", String(error));
      console.warn("quit app failed", error);
    });
  }, []);

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

  const cycleSearchTriggerMode = useCallback(() => {
    if (searchTriggerUpdating) {
      return;
    }
    const previousMode = settings.picker.searchTriggerMode;
    const mode = nextSearchTriggerMode(previousMode);
    setSearchTriggerUpdating(true);
    setSettings((current) => ({
      ...current,
      picker: {
        ...current.picker,
        searchTriggerMode: mode,
      },
    }));
    void setPickerSearchTriggerMode(mode)
      .then((nextSettings) => {
        const persistedMode = normalizeSettings(nextSettings).picker.searchTriggerMode;
        setSettings((current) => ({
          ...current,
          picker: {
            ...current.picker,
            searchTriggerMode: persistedMode,
          },
        }));
      })
      .catch((error) => {
        setSettings((current) => ({
          ...current,
          picker: {
            ...current.picker,
            searchTriggerMode: previousMode,
          },
        }));
        setSettingsError(String(error));
      })
      .finally(() => setSearchTriggerUpdating(false));
  }, [searchTriggerUpdating, settings]);

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

    let active = true;
    let unlisten: (() => void) | null = null;
    void listen(COMMAND_PALETTE_OPEN_EVENT, () => {
      if (active) {
        openCommandPalette();
      }
    }).then((nextUnlisten) => {
      unlisten = nextUnlisten;
    });

    return () => {
      active = false;
      unlisten?.();
    };
  }, [openCommandPalette]);

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (
        event.altKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.shiftKey &&
        event.key.toLocaleLowerCase() === "s" &&
        !scenarioSwitcherOpen &&
        !commandPalette &&
        !actionPicker &&
        !editDraft &&
        !createItemDraft &&
        !batchMetadataDraft &&
        !tagEditorDraft &&
        !searchHelpOpen
      ) {
        event.preventDefault();
        event.stopPropagation();
        if (pickerMenuOpen) setPickerMenuOpen(false);
        else openScenarioMenu();
        return;
      }
      if (
        isQuickActionsShortcut(event) &&
        !commandPalette &&
        !actionPicker &&
        !editDraft &&
        !createItemDraft &&
        !batchMetadataDraft &&
        !tagEditorDraft &&
        !searchHelpOpen
      ) {
        event.preventDefault();
        event.stopPropagation();
        openActionPicker();
      }
    };

    document.addEventListener("keydown", onKeyDown, { capture: true });
    return () => {
      document.removeEventListener("keydown", onKeyDown, { capture: true });
    };
  }, [
    actionPicker,
    batchMetadataDraft,
    commandPalette,
    createItemDraft,
    editDraft,
    tagEditorDraft,
    openActionPicker,
    openScenarioMenu,
    pickerMenuOpen,
    scenarioSwitcherOpen,
    searchHelpOpen,
  ]);

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
      if (["ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End"].includes(event.key)) {
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
  const commandPaletteEntries = useMemo((): CommandPaletteEntry[] => {
    const navigation: CommandPaletteEntry[] = [
      { id: "history.all", kind: "navigation", group: "History", title: "All history", description: "Browse every clipboard item.", query: "", savedView: null },
      { id: "history.text", kind: "navigation", group: "History", title: "Text", description: "Browse text clips.", query: "kind:text", savedView: null },
      { id: "history.images", kind: "navigation", group: "History", title: "Images", description: "Browse image clips.", query: "kind:image", savedView: null },
      { id: "history.marked", kind: "navigation", group: "History", title: "Marked", description: "Browse marked clips.", query: "is:marked", savedView: null },
      ...savedHistoryViews.map((view): CommandPaletteEntry => ({
        id: `saved-view.${view.id}`,
        kind: "navigation",
        group: "Saved searches",
        title: view.title,
        description: view.query || "All history",
        query: view.query,
        savedView: view,
      })),
      ...paletteTags
        .filter((tag) => tag.pinned)
        .map((tag): CommandPaletteEntry => ({
          id: `tag.${tag.id}`,
          kind: "navigation",
          group: "Tags",
          title: tag.label,
          description: `Filter history by #${tag.slug}.`,
          query: `tag:${tag.slug}`,
          savedView: null,
        })),
    ];
    const actions = [
      NEW_ITEM_ACTION,
      ...actionDefinitions.filter((action) =>
        actionRunnableForTrigger(action, "commandPalette", itemsForActionContext(action, effectiveSelection, selectedItem)),
      ),
    ].map((action): CommandPaletteEntry => ({
      id: `action.${action.id}`,
      kind: "action",
      group: "Actions",
      action,
    }));
    return [...navigation, ...actions];
  }, [actionDefinitions, effectiveSelection, paletteTags, savedHistoryViews, selectedItem]);
  const actionPickerEntries = useMemo(
    () => actionDefinitions.flatMap((action): ActionPickerEntry[] => {
      if (isSupersededMetadataEditAction(action)) {
        return [];
      }
      const trigger = actionPickerTriggerForAction(action, effectiveSelection, selectedItem);
      return trigger ? [{ action, trigger, contextLabel: actionPickerContextLabel(trigger) }] : [];
    }),
    [actionDefinitions, effectiveSelection, selectedItem],
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
        query: appliedDescriptorRef.current?.effectiveQuery ?? historyQuery,
        visibleItemIds: history.map((item) => item.id),
        currentIndex: selectedIndex >= 0 ? selectedIndex : null,
      },
    }),
    [history, historyQuery, selectedIndex, selectedItem],
  );

  const applyActionEffects = useCallback(
    async (effects: ActionEffect[] | undefined) => {
      let nextFilterQuery: string | null = null;

      for (const effect of effects ?? []) {
        if (effect.type === "picker.filter") {
          leaveOpenedSavedView();
          queryRef.current = effect.query;
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
    [leaveOpenedSavedView],
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
      source = "foreground",
      descriptorOverride = null,
    }: {
      resetScroll?: boolean;
      respectManualScroll?: boolean;
      showPending?: boolean;
      queryOverride?: string | null;
      allowAi?: boolean;
      source?: "foreground" | "background";
      descriptorOverride?: AppliedSearchDescriptor | null;
    } = {}) => {
      const trimmed = (queryOverride ?? query).trim();
      if (
        source === "foreground"
        && !aiComposerMode
        && (() => {
          const classification = classifyStructuredSearchDraft(trimmed);
          return classification.kind === "incomplete" || classification.kind === "invalid";
        })()
      ) {
        return;
      }
      const originalSearchInput = historySearchInput(trimmed, aiComposerMode);
      let searchInput = originalSearchInput;
      const appliedDescriptorForRequest = descriptorOverride
        ?? (source === "background" ? appliedDescriptorRef.current : null);
      const foreground = source === "foreground";
      const intentGeneration = searchIntentGenerationRef.current;
      const rememberFailure = () => {
        lastSearchFailureRef.current = {
          source,
          query: source === "background"
            ? appliedDescriptorForRequest?.displayQuery?.trim() ?? trimmed
            : trimmed,
          intentGeneration,
          descriptor: isAppliedSearchDescriptor(appliedDescriptorForRequest)
            ? appliedDescriptorForRequest
            : null,
        };
      };
      const settleForegroundFailure = () => {
        if (!foreground) {
          return;
        }
        updateDeferredAppliedRefresh(null);
        if (clearSearchPendingRef.current) {
          updateClearSearchPending(false);
        }
      };
      if (source === "background" && foregroundSearchInFlightRef.current) {
        updateDeferredAppliedRefresh({
          query: queryRef.current.trim(),
          intentGeneration,
          appliedGeneration: appliedSnapshotGenerationRef.current,
          reason: "foreground",
        });
        return;
      }
      if (source === "background" && !isAppliedSearchDescriptor(appliedDescriptorForRequest)) {
        return;
      }
      if (
        source === "background"
        && lastSearchFailureRef.current?.source === "foreground"
        && lastSearchFailureRef.current.intentGeneration === intentGeneration
      ) {
        return;
      }
      if (!allowAi && searchInput.mode === "ai") {
        if (historyInputQuery === trimmed && historyQuery.trim()) {
          searchInput = { query: historyQuery, mode: "structured" };
        } else {
          return;
        }
      }
      lastSearchFailureRef.current = null;
      const requestSeq = ++historyRequestSeqRef.current;
      if (foreground) {
        foregroundSearchOwnerSeqRef.current = requestSeq;
        foregroundSearchInFlightRef.current = true;
        setForegroundSearchInFlight(true);
      }
      historyLoadMoreSeqRef.current += 1;
      setHistoryLoadingMore(false);
      const selectionInteractionSeq = selectionInteractionSeqRef.current;
      const planningAi = allowAi && searchInput.mode === "ai";
      const descriptorRequest = appliedDescriptorForRequest
        ? appliedSearchRequestFields(appliedDescriptorForRequest)
        : null;
      if (showPending && foreground) {
        setHistoryPending(true);
      }
      if (planningAi) {
        setAiPlanning(true);
      }
      dispatchSearch({
        type: "applyStarted",
        generation: foreground ? intentGeneration : appliedSnapshotGenerationRef.current,
        query: appliedDescriptorForRequest?.displayQuery ?? trimmed,
        source,
        intentGeneration,
        descriptor: appliedDescriptorForRequest,
      });

      let page: HistoryPage;
      try {
        page = await historySearch({
          query: descriptorRequest?.query ?? searchInput.query,
          displayQuery: descriptorRequest?.displayQuery ?? trimmed,
          cursor: null,
          limit: HISTORY_PAGE_LIMIT,
          mode: descriptorRequest?.mode ?? searchInput.mode,
          includeContent: false,
          includeCounts: true,
          explain: true,
          plan: descriptorRequest?.plan ?? null,
          appliedDescriptor: descriptorRequest?.appliedDescriptor ?? null,
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
        const requestIsCurrent = requestSeq === historyRequestSeqRef.current
          && (!foreground || intentGeneration === searchIntentGenerationRef.current);
        if (requestIsCurrent) {
          rememberFailure();
          settleForegroundFailure();
          if (foreground) {
            setHistoryPending(false);
            setAiPlanning(false);
          }
          if (foreground) {
            if (foregroundSearchOwnerSeqRef.current === requestSeq) {
              foregroundSearchOwnerSeqRef.current = null;
              foregroundSearchInFlightRef.current = false;
              setForegroundSearchInFlight(false);
            }
          }
          setHistoryError(String(error));
          dispatchSearch({
            type: "applyFailed",
            generation: foreground ? intentGeneration : appliedSnapshotGenerationRef.current,
            intentGeneration,
            source,
            error: String(error),
          });
          if (foreground) {
            setSearchInterpretation(
              trimmed
                ? {
                    mode: searchInput.mode === "ai" ? "ai" : "structured",
                    query: searchInput.query,
                    explanation: searchInput.mode === "ai"
                      ? "AI search failed before Copicu could run local structured search."
                      : null,
                    chips: [],
                    diagnostics: [],
                    warnings: [String(error)],
                  }
                : null,
            );
          }
        }
        return;
      }

      const allowStaleInitial = foreground
        && appliedDescriptorRef.current === null
        && appliedSnapshotGenerationRef.current === 0
        && intentGeneration !== searchIntentGenerationRef.current
        && trimmed === ""
        && page.appliedDescriptor?.displayQuery?.trim() === "";
      if (
        requestSeq !== historyRequestSeqRef.current
        || (foreground && intentGeneration !== searchIntentGenerationRef.current && !allowStaleInitial)
      ) {
        return;
      }
      if (foreground) {
        if (foregroundSearchOwnerSeqRef.current === requestSeq) {
          foregroundSearchOwnerSeqRef.current = null;
          foregroundSearchInFlightRef.current = false;
          setForegroundSearchInFlight(false);
        }
      }

      const appliedDescriptor = isAppliedSearchDescriptor(page.appliedDescriptor)
        ? page.appliedDescriptor
        : null;
      if (
        !appliedDescriptor
        || (
          descriptorRequest
          && appliedDescriptor.fingerprint !== descriptorRequest.appliedDescriptor.fingerprint
        )
      ) {
        const descriptorError = !appliedDescriptor
          ? "Search response did not include a valid applied descriptor."
          : "Search response changed the applied descriptor.";
        if (foreground) {
          setHistoryPending(false);
          setAiPlanning(false);
        }
        settleForegroundFailure();
        rememberFailure();
        setHistoryError(descriptorError);
        dispatchSearch({
          type: "applyFailed",
          generation: foreground ? intentGeneration : appliedSnapshotGenerationRef.current,
          intentGeneration,
          source,
          error: descriptorError,
        });
        return;
      }
      const snapshotGeneration = foreground
        ? appliedSnapshotGenerationRef.current + 1
        : appliedSnapshotGenerationRef.current;
      if (
        !foreground
        && (
          !searchState.applied
          || searchState.applied.generation !== snapshotGeneration
        )
      ) {
        const snapshotError = "Background refresh lost the visible applied snapshot.";
        rememberFailure();
        setHistoryError(snapshotError);
        dispatchSearch({
          type: "applyFailed",
          generation: snapshotGeneration,
          intentGeneration,
          source,
          error: snapshotError,
        });
        return;
      }
      const committedDescriptor = foreground
        ? appliedDescriptor
        : searchState.applied?.descriptor ?? appliedDescriptor;

      const scrollTop = historyScrollRef.current?.scrollTop ?? 0;
      const incomingFirstId = page.items[0]?.id ?? null;
      const currentFirstId = historyRef.current[0]?.id ?? null;
      const canRetainAppliedSnapshot =
        appliedDescriptorRef.current?.fingerprint === committedDescriptor.fingerprint;
      if (respectManualScroll && scrollTop > 24 && canRetainAppliedSnapshot) {
        const retainedPaginationBlock = historyPaginationBlockedRef.current;
        const retainedPaginationBlockMatches = retainedPaginationBlock !== null
          && page.nextCursor !== null
          && retainedPaginationBlock.descriptorFingerprint === committedDescriptor.fingerprint
          && sameHistoryPageCursor(retainedPaginationBlock.cursor, page.nextCursor);
        if (
          currentFirstId !== null &&
          incomingFirstId !== null &&
          incomingFirstId !== currentFirstId
        ) {
          setNewClipsAvailable(true);
        }
        if (typeof page.totalCount === "number") {
          setHistoryTotalCount(page.totalCount);
        }
        if (typeof page.filteredCount === "number") {
          setHistoryFilteredCount(page.filteredCount);
        }
        void refreshMarkedCount().catch(() => undefined);
        // A retained refresh describes fresh metadata for the same visible rows.
        // Keep the legacy cursor bridged to those rows; the fresh cursor is only
        // used above to decide whether an existing pagination block still matches.
        if (foreground) {
          setHistoryPending(false);
          setAiPlanning(false);
        }
        if (retainedPaginationBlock && !retainedPaginationBlockMatches) {
          historyPaginationBlockedRef.current = null;
          setHistoryPaginationBlocked(null);
        }
        setHistoryError(retainedPaginationBlockMatches ? retainedPaginationBlock.error : null);
        dispatchSearch({
          type: "applyRetained",
          generation: snapshotGeneration,
          descriptor: committedDescriptor,
          page,
          source,
        });
        return;
      }

      historyRef.current = page.items;
      setHistory(page.items);
      setHistoryNextCursor(page.nextCursor);
      historyPaginationBlockedRef.current = null;
      setHistoryPaginationBlocked(null);
      if (typeof page.totalCount === "number") {
        setHistoryTotalCount(page.totalCount);
      }
      if (typeof page.filteredCount === "number") {
        setHistoryFilteredCount(page.filteredCount);
      }
      if (foreground) {
        const reusingAppliedDescriptor = appliedDescriptorForRequest !== null;
        const preservingAppliedAi = reusingAppliedDescriptor && appliedDescriptor.mode === "ai";
        const previousInterpretation = searchInterpretation;
        const visibleDisplayQuery = appliedDescriptor.displayQuery.trim() || trimmed;
        const visibleMode = appliedDescriptor.mode === "ai" || originalSearchInput.mode === "ai"
          ? "ai"
          : "structured";
        const visibleInterpretationQuery = preservingAppliedAi
          ? previousInterpretation?.query
            ?? searchState.applied?.descriptor.effectiveQuery
            ?? page.interpretedQuery
            ?? appliedDescriptor.effectiveQuery
          : originalSearchInput.mode === "ai"
            ? page.interpretedQuery ?? searchInput.query
            : searchInput.query;
        const visibleExplanation = preservingAppliedAi
          ? previousInterpretation?.explanation
            ?? searchState.applied?.explanation
            ?? page.explanation
            ?? null
          : page.explanation ?? null;
        const visibleQueryExplanation = preservingAppliedAi && previousInterpretation
          ? {
              version: 1,
              chips: previousInterpretation.chips,
              diagnostics: previousInterpretation.diagnostics,
            }
          : page.queryExplanation;
        const visibleWarnings = preservingAppliedAi
          ? previousInterpretation?.warnings
            ?? searchState.applied?.warnings
            ?? page.warnings
            ?? []
          : page.warnings ?? [];
        historyInputQueryRef.current = visibleDisplayQuery;
        setHistoryInputQuery(visibleDisplayQuery);
        setHistoryQuery(visibleInterpretationQuery);
        const showInterpretation = Boolean(visibleDisplayQuery) && (
          visibleMode === "ai" ||
          (visibleQueryExplanation?.chips.length ?? 0) > 0 ||
          (visibleQueryExplanation?.diagnostics.length ?? 0) > 0 ||
          visibleWarnings.length > 0
        );
        setSearchInterpretation(
          showInterpretation
            ? {
                mode: visibleMode,
                query: visibleInterpretationQuery,
                explanation: visibleExplanation,
                chips: visibleQueryExplanation?.chips ?? [],
                diagnostics: visibleQueryExplanation?.diagnostics ?? [],
                warnings: visibleWarnings,
              }
            : null,
        );
        setHistoryPending(false);
        setAiPlanning(false);
        setNewClipsAvailable(false);
      }
      setHistoryError(null);
      lastSearchFailureRef.current = null;
      appliedDescriptorRef.current = committedDescriptor;
      if (foreground) {
        appliedSnapshotGenerationRef.current = snapshotGeneration;
        if (clearSearchPendingRef.current && trimmed === "") {
          updateClearSearchPending(false);
        }
        const pendingFilterLock = pendingFilterLockRef.current;
        if (
          pendingFilterLock
          && pendingFilterLock.query === trimmed
          && pendingFilterLock.intentGeneration === intentGeneration
          && committedDescriptor.displayQuery.trim() === trimmed
        ) {
          pendingFilterLockRef.current = null;
          filterLockedRef.current = true;
          setFilterLocked(true);
          writeLockedFilterQuery(committedDescriptor.displayQuery.trim());
        }
      }
      dispatchSearch({
        type: "applySucceeded",
        generation: snapshotGeneration,
        descriptor: committedDescriptor,
        page: page as AppliedSearchPage<HistoryItem, HistoryPageCursor>,
        source,
        intentGeneration,
        allowStaleInitial,
      });
      const canResetSelection = resetScroll && selectionInteractionSeq === selectionInteractionSeqRef.current;
      setSelectedIds((current) => {
        if (canResetSelection) {
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
        if (!canResetSelection && currentItemId !== null && page.items.some((item) => item.id === currentItemId)) {
          return currentItemId;
        }
        const nextItemId = page.items[0].id;
        selectionAnchorItemIdRef.current = nextItemId;
        return nextItemId;
      });

      if (canResetSelection) {
        historyScrollRef.current?.scrollTo({ top: 0 });
      }
      void refreshMarkedCount().catch(() => undefined);
    },
    [
      aiComposerMode,
      historyInputQuery,
      historyQuery,
      query,
      refreshMarkedCount,
      searchInterpretation,
      searchState.applied,
      updateDeferredAppliedRefresh,
      updateClearSearchPending,
    ],
  );

  const openPaletteNavigation = useCallback((entry: Extract<CommandPaletteEntry, { kind: "navigation" }>) => {
    const nextQuery = entry.query;
    setCommandPalette(null);
    setAiComposerMode(false);
    setOpenedSavedView(entry.savedView ? {
      id: entry.savedView.id,
      title: entry.savedView.title,
      query: entry.savedView.query,
    } : null);
    queryRef.current = nextQuery;
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
  }, [focusSearch, refreshHistory]);

  const refreshAppliedHistory = useCallback(
    async (options: {
      resetScroll?: boolean;
      respectManualScroll?: boolean;
      showPending?: boolean;
    } = {}) => {
      const draft = queryRef.current.trim();
      const applied = historyInputQueryRef.current;
      const pickerSearch = pickerSearchSettingsRef.current;
      const appliedDescriptor = appliedDescriptorRef.current;
      const structuredHold = shouldHoldStructuredSearchDraft(
        classifyStructuredSearchDraft(draft),
        {
          draftChanged: draft !== applied,
          searchTriggerMode: pickerSearch.searchTriggerMode,
          deferStructuredSearchUntilEnter: pickerSearch.deferStructuredSearchUntilEnter,
          autocompleteActive: autocompleteOpen && !scenarioCommandOpen,
          autocompleteCommitted: autocompleteCommittedQueryRef.current?.trim() === draft,
        },
      );
      if (foregroundSearchInFlightRef.current) {
        await refreshHistory({
          ...options,
          queryOverride: appliedDescriptor?.effectiveQuery ?? applied,
          allowAi: false,
          source: "background",
          descriptorOverride: appliedDescriptor,
        });
        return;
      }
      if (
        !isAppliedSearchDescriptor(appliedDescriptor)
        && appliedSnapshotGenerationRef.current === 0
        && !lastSearchFailureRef.current
      ) {
        updateDeferredAppliedRefresh({
          query: draft,
          intentGeneration: searchIntentGenerationRef.current,
          appliedGeneration: appliedSnapshotGenerationRef.current,
          reason: "foreground",
        });
        return;
      }
      if (
        pickerSearch.searchTriggerMode === "realtime" &&
        draft !== applied &&
        !structuredHold
      ) {
        updateDeferredAppliedRefresh({
          query: draft,
          intentGeneration: searchIntentGenerationRef.current,
          appliedGeneration: appliedSnapshotGenerationRef.current,
          reason: "draft",
        });
        return;
      }
      updateDeferredAppliedRefresh(null);
      await refreshHistory({
        ...options,
        queryOverride: appliedDescriptor?.effectiveQuery ?? applied,
        allowAi: false,
        source: "background",
        descriptorOverride: appliedDescriptor,
      });
    },
    [autocompleteOpen, refreshHistory, scenarioCommandOpen, updateDeferredAppliedRefresh],
  );
  const pickerEventHandlersRef = useRef({
    focusSearch,
    refreshHistory,
    refreshAppliedHistory,
    resetPickerSession,
  });

  useEffect(() => {
    pickerEventHandlersRef.current = {
      focusSearch,
      refreshHistory,
      refreshAppliedHistory,
      resetPickerSession,
    };
  }, [focusSearch, refreshAppliedHistory, refreshHistory, resetPickerSession]);


  useEffect(() => {
    const deferredRefresh = deferredAppliedRefresh;
    if (!deferredRefresh || deferredAppliedRefreshRef.current !== deferredRefresh) {
      return;
    }
    if (foregroundSearchInFlight || historyPending) {
      return;
    }
    if (
      deferredRefresh.intentGeneration !== searchIntentGenerationRef.current
      || deferredRefresh.query !== queryRef.current.trim()
      || (
        deferredRefresh.appliedGeneration !== appliedSnapshotGenerationRef.current
        && deferredRefresh.reason !== "foreground"
      )
    ) {
      updateDeferredAppliedRefresh(null);
      return;
    }
    const appliedDescriptor = appliedDescriptorRef.current;
    if (!isAppliedSearchDescriptor(appliedDescriptor)) {
      return;
    }
    if (deferredRefresh.reason === "draft") {
      updateDeferredAppliedRefresh(null);
      return;
    }
    updateDeferredAppliedRefresh(null);
    void refreshHistory({
      showPending: false,
      allowAi: false,
      source: "background",
      queryOverride: appliedDescriptor?.effectiveQuery ?? historyInputQueryRef.current,
      descriptorOverride: appliedDescriptor,
    });
  }, [deferredAppliedRefresh, foregroundSearchInFlight, historyPending, refreshHistory, updateDeferredAppliedRefresh]);

  useEffect(() => {
    if (!isTauriRuntime()) {
      return undefined;
    }

    let active = true;
    let unlisten: (() => void) | null = null;
    let unlistenScenario: (() => void) | null = null;

    void stopCaptureTagContext().catch(() => undefined);
    void getActiveScenarioSession()
      .then((scenarioSession) => {
        if (!active || !scenarioSession) {
          return;
        }
        activeScenarioSessionRef.current = scenarioSession;
        setActiveScenarioSession(scenarioSession);
        const nextQuery = scenarioSession.query;
        queryRef.current = nextQuery;
        setQuery(nextQuery);
        void pickerEventHandlersRef.current.refreshHistory({
          resetScroll: true,
          queryOverride: nextQuery,
          allowAi: false,
        });
      })
      .catch(() => undefined);

    void listen<PickerFilterEvent>(PICKER_FILTER_EVENT, (event) => {
      if (!active) {
        return;
      }
      const nextQuery = event.payload.query.trim();
      const nextView = event.payload.view;
      setOpenedSavedView(nextView ? {
        id: nextView.id,
        title: nextView.title,
        query: nextQuery,
      } : null);
      setAiComposerMode(false);
      queryRef.current = nextQuery;
      setQuery(nextQuery);
      setSearchInterpretation(null);
      setSelectedIds(new Set());
      setSelectedItemId(null);
      selectionAnchorItemIdRef.current = null;
      void pickerEventHandlersRef.current.refreshHistory({
        resetScroll: true,
        queryOverride: nextQuery,
        allowAi: false,
      }).then(() => pickerEventHandlersRef.current.focusSearch());
    }).then((nextUnlisten) => {
      unlisten = nextUnlisten;
    });

    void listen<ActiveScenarioSession | null>(SCENARIO_SESSION_CHANGED_EVENT, (event) => {
      if (!active) {
        return;
      }
      activeScenarioSessionRef.current = event.payload;
      setActiveScenarioSession(event.payload);
    }).then((nextUnlisten) => {
      unlistenScenario = nextUnlisten;
    });

    return () => {
      active = false;
      unlisten?.();
      unlistenScenario?.();
    };
  }, []);

  const loadNextHistoryPage = useCallback(async () => {
    const paginationBlock = historyPaginationBlockedRef.current;
    if (
      !historyNextCursor
      || historyLoadingMore
      || (
        paginationBlock !== null
        && paginationBlock.descriptorFingerprint === appliedDescriptorRef.current?.fingerprint
        && sameHistoryPageCursor(paginationBlock.cursor, historyNextCursor)
      )
    ) {
      return;
    }

    const appliedDescriptor = appliedDescriptorRef.current;
    if (!isAppliedSearchDescriptor(appliedDescriptor)) {
      setHistoryError("Cannot paginate without a valid applied search descriptor.");
      return;
    }
    const appliedSnapshot = searchState.applied;
    if (
      !appliedSnapshot
      || appliedSnapshot.generation !== appliedSnapshotGenerationRef.current
      || searchState.generation !== appliedSnapshot.generation
      || appliedSnapshot.descriptor.fingerprint !== appliedDescriptor.fingerprint
    ) {
      setHistoryError("Cannot paginate while the applied search snapshot is settling.");
      return;
    }
    const descriptorRequest = appliedSearchRequestFields(appliedDescriptor);
    const appliedQuery = appliedDescriptor.effectiveQuery;
    const appliedFingerprint = appliedDescriptor.fingerprint;
    const cursor = historyNextCursor;
    const firstPageGeneration = appliedSnapshot.generation;
    const loadSeq = ++historyLoadMoreSeqRef.current;
    setHistoryLoadingMore(true);

    try {
      const page = await historySearch({
        query: descriptorRequest.query,
        displayQuery: descriptorRequest.displayQuery,
        cursor,
        limit: HISTORY_PAGE_LIMIT,
        mode: descriptorRequest.mode,
        includeContent: false,
        includeCounts: false,
        plan: descriptorRequest.plan,
        appliedDescriptor: descriptorRequest.appliedDescriptor,
      });

      if (
        loadSeq !== historyLoadMoreSeqRef.current ||
        firstPageGeneration !== searchState.applied?.generation ||
        appliedFingerprint !== (appliedDescriptorRef.current?.fingerprint ?? null)
      ) {
        return;
      }

      const pageDescriptor = isAppliedSearchDescriptor(page.appliedDescriptor)
        ? page.appliedDescriptor
        : null;
      if (!pageDescriptor || pageDescriptor.fingerprint !== appliedFingerprint) {
        throw new Error("Pagination response did not include the current applied descriptor.");
      }

      dispatchSearch({
        type: "pageAppended",
        generation: firstPageGeneration,
        descriptor: appliedDescriptor,
        page: page as AppliedSearchPage<HistoryItem, HistoryPageCursor>,
      });

      setHistory((current) => {
        const existingIds = new Set(current.map((item) => item.id));
        return [
          ...current,
          ...page.items.filter((item) => !existingIds.has(item.id)),
        ];
      });
      setHistoryNextCursor(page.nextCursor);
      if (typeof page.totalCount === "number") {
        setHistoryTotalCount(page.totalCount);
      }
      if (typeof page.filteredCount === "number") {
        setHistoryFilteredCount(page.filteredCount);
      }
      setHistoryQuery(appliedQuery);
      setHistoryError(null);
    } catch (error) {
      if (loadSeq === historyLoadMoreSeqRef.current) {
        const paginationBlock = {
          descriptorFingerprint: appliedFingerprint,
          cursor,
          error: String(error),
        } satisfies HistoryPaginationBlock;
        historyPaginationBlockedRef.current = paginationBlock;
        setHistoryPaginationBlocked(paginationBlock);
        setHistoryError(String(error));
        dispatchSearch({
          type: "pageFailed",
          generation: firstPageGeneration,
          error: String(error),
        });
      }
    } finally {
      if (loadSeq === historyLoadMoreSeqRef.current) {
        setHistoryLoadingMore(false);
        setHistoryPending(false);
      }
    }
  }, [historyLoadingMore, historyNextCursor, historyQuery, searchState]);

  const historyMatchesQuery = historyInputQuery === query.trim() && !historyPending;
  const aiDraftActive = historySearchInput(query.trim(), aiComposerMode).mode === "ai" && !historyMatchesQuery;
  const visibleSearchInterpretation = historyMatchesQuery ? searchInterpretation : null;
  const hasActivePickerContext = Boolean(activeScenarioSession || openedSavedView);

  const setSingleSelection = useCallback((index: number) => {
    selectionInteractionSeqRef.current += 1;
    const item = history[index];
    if (!item) {
      const emptySelection = new Set<number>();
      selectedIdsRef.current = emptySelection;
      selectedItemIdRef.current = null;
      setSelectedIds(emptySelection);
      setSelectedItemId(null);
      selectionAnchorItemIdRef.current = null;
      return;
    }

    // Current navigation is intentionally separate from explicit bulk
    // selection. A plain click/Arrow/Home/End changes the active row without
    // checking it or opening the batch action bar.
    const emptySelection = new Set<number>();
    selectedIdsRef.current = emptySelection;
    selectedItemIdRef.current = item.id;
    setSelectedItemId(item.id);
    setSelectedIds(emptySelection);
    selectionAnchorItemIdRef.current = item.id;
  }, [history]);

  const setRangeSelection = useCallback((toIndex: number) => {
    selectionInteractionSeqRef.current += 1;
    if (history.length === 0) {
      const emptySelection = new Set<number>();
      selectedIdsRef.current = emptySelection;
      selectedItemIdRef.current = null;
      setSelectedIds(emptySelection);
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
    const nextSelection = new Set(history.slice(start, end + 1).map((item) => item.id));
    selectedItemIdRef.current = history[nextIndex].id;
    selectedIdsRef.current = nextSelection;
    setSelectedItemId(history[nextIndex].id);
    setSelectedIds(nextSelection);
  }, [history, selectedIndex]);

  const setVisibleSelection = useCallback((selected: boolean) => {
    selectionInteractionSeqRef.current += 1;
    const nextSelection = selected ? new Set(history.map((item) => item.id)) : new Set<number>();
    selectedIdsRef.current = nextSelection;
    setSelectedIds(nextSelection);
    if (selected && selectedItemIdRef.current === null && history[0]) {
      selectedItemIdRef.current = history[0].id;
      setSelectedItemId(history[0].id);
      selectionAnchorItemIdRef.current = history[0].id;
    }
    focusSearch();
  }, [focusSearch, history]);

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
        lastActivatedItemIdRef.current = item.id;
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
        setActionPicker(null);
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
          if (
            resultToasts.length === 0
            && action.id !== BUILTIN_ACTIONS.queueSelectedBottomToTop
          ) {
            pushToast({
              title: action.title,
              message: result.message,
              tone: "success",
              durationMs: DEFAULT_TOAST_DURATION_MS,
            });
          }
        }
        if (effectQuery !== null) {
          await refreshHistory({ showPending: false, queryOverride: effectQuery });
        } else {
          await refreshAppliedHistory({ showPending: false });
        }
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
    [
      actionContext,
      applyActionEffects,
      focusSearch,
      pushToast,
      refreshAppliedHistory,
      refreshHistory,
    ],
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

  const mutateRowLayout = useCallback((itemId: number, mutate: () => void) => {
    const scrollElement = historyScrollRef.current;
    const scrollTop = scrollElement?.scrollTop ?? 0;
    mutate();
    window.requestAnimationFrame(() => {
      const row = document.getElementById(`history-item-${itemId}`);
      if (row instanceof HTMLElement) {
        rowVirtualizer.measureElement(row);
      }
      if (scrollElement) {
        scrollElement.scrollTop = scrollTop;
      }
    });
  }, [rowVirtualizer]);

  const toggleTextPreview = useCallback(async (item: HistoryItem) => {
    const itemId = item.id;
    const expanding = !expandedItemIds.has(itemId);
    if (expanding && !item.includes_content) {
      if (fullContentFetchIdsRef.current.has(itemId)) {
        return;
      }
      fullContentFetchIdsRef.current.add(itemId);
      try {
        await ensureFullHistoryItem(item);
      } catch (error) {
        setActionError(String(error));
        return;
      } finally {
        fullContentFetchIdsRef.current.delete(itemId);
      }
    }

    mutateRowLayout(itemId, () => {
      setExpandedItemIds((current) => {
        const next = new Set(current);
        if (next.has(itemId)) {
          next.delete(itemId);
        } else {
          next.add(itemId);
        }
        return next;
      });
    });
  }, [ensureFullHistoryItem, expandedItemIds, mutateRowLayout]);

  const cancelInlineEdit = useCallback(() => {
    if (!inlineEditDraft) {
      return;
    }
    const itemId = inlineEditDraft.id;
    mutateRowLayout(itemId, () => {
      setInlineEditDraft(null);
      setEditError(null);
    });
    focusSearch();
  }, [focusSearch, inlineEditDraft, mutateRowLayout]);

  const beginInlineEdit = useCallback(async (item: HistoryItem) => {
    try {
      setEditError(null);
      setOpenItemMenu(null);
      const fullItem = await ensureFullHistoryItem(item);
      selectionInteractionSeqRef.current += 1;
      selectedItemIdRef.current = item.id;
      setSelectedItemId(item.id);
      selectedIdsRef.current = new Set();
      setSelectedIds(new Set());
      selectionAnchorItemIdRef.current = item.id;
      mutateRowLayout(item.id, () => {
        setExpandedItemIds((current) => {
          const next = new Set(current);
          next.delete(item.id);
          return next;
        });
        setInlineEditDraft({
          id: fullItem.id,
          text: fullItem.text,
          title: fullItem.title ?? "",
          notes: fullItem.notes ?? "",
          tags: fullItem.tags ?? "",
          mimePrimary: fullItem.mime_primary ?? "",
        });
      });
      window.setTimeout(() => inlineEditTextRef.current?.focus(), 0);
    } catch (error) {
      setEditError(String(error));
      focusSearch();
    }
  }, [ensureFullHistoryItem, focusSearch, mutateRowLayout]);

  const saveInlineEdit = useCallback(async () => {
    if (!inlineEditDraft || inlineEditSaving) {
      return;
    }
    const draft = inlineEditDraft;
    const request: UpdateHistoryItemRequest = {
      id: draft.id,
      text: draft.text,
      title: nullableTrim(draft.title),
      notes: nullableTrim(draft.notes),
      tags: metadataTags(draft.notes),
      mimePrimary: nullableTrim(draft.mimePrimary),
    };

    try {
      setInlineEditSaving(true);
      setEditError(null);
      await invoke("update_history_item", { request });
      mutateRowLayout(draft.id, () => setInlineEditDraft(null));
      await refreshAppliedHistory();
      rebaseFind();
      selectedItemIdRef.current = draft.id;
      setSelectedItemId(draft.id);
      focusSearch();
    } catch (error) {
      setEditError(String(error));
      window.setTimeout(() => inlineEditTextRef.current?.focus(), 0);
    } finally {
      setInlineEditSaving(false);
    }
  }, [focusSearch, inlineEditDraft, inlineEditSaving, mutateRowLayout, rebaseFind, refreshAppliedHistory]);

  const beginEdit = useCallback(
    async (item: HistoryItem, mode: EditMode, standalone = true) => {
      try {
        setEditError(null);
        setInlineEditDraft(null);
        setOpenItemMenu(null);
        if (mode === "metadata" && standalone && isTauriRuntime()) {
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

  const openActiveMetadata = useCallback(() => {
    const now = Date.now();
    if (now - metadataShortcutHandledAtRef.current < 250) {
      return;
    }
    metadataShortcutHandledAtRef.current = now;
    const pendingItemId = pendingHistoryActivationItemIdRef.current;
    const activeItemId = pendingItemId
      ?? selectedItemIdRef.current
      ?? lastActivatedItemIdRef.current
      ?? historyRef.current[0]?.id
      ?? null;
    if (activeItemId === null) {
      return;
    }
    if (pendingItemId !== null) {
      pendingHistoryActivationItemIdRef.current = null;
      lastActivatedItemIdRef.current = pendingItemId;
    }
    const activeItem = historyRef.current.find((item) => item.id === activeItemId);
    if (activeItem) {
      void beginEdit(activeItem, "metadata");
      return;
    }
    void openMetadataWindow(activeItemId).catch((error) => {
      setEditError(String(error));
      focusSearch();
    });
  }, [beginEdit, focusSearch]);

  const openExternalEditor = useCallback(async (itemId: number | null) => {
    if (itemId === null) {
      pushToast({
        title: "External editor",
        message: "Clipboard history is empty.",
        tone: "warning",
      });
      return;
    }
    try {
      setActionError(null);
      const launch = await invoke<{ editorName: string }>("edit_history_item_external", { itemId });
      pushToast({
        title: "External editor",
        message: `Opened in ${launch.editorName}. Save and close the file to import changes.`,
        tone: "info",
      });
    } catch (error) {
      setActionError(String(error));
      pushToast({
        title: "External editor",
        message: String(error),
        tone: "warning",
      });
    }
  }, [pushToast]);

  const openActiveExternalEditor = useCallback(() => {
    const itemId = pendingHistoryActivationItemIdRef.current
      ?? selectedItemIdRef.current
      ?? lastActivatedItemIdRef.current
      ?? historyRef.current[0]?.id
      ?? null;
    void openExternalEditor(itemId);
  }, [openExternalEditor]);

  useEffect(() => {
    if (!isTauriRuntime()) {
      return undefined;
    }
    let unlisten: (() => void) | null = null;
    void listen(METADATA_EDIT_ACTIVE_EVENT, openActiveMetadata).then((nextUnlisten) => {
      unlisten = nextUnlisten;
    });
    return () => unlisten?.();
  }, [openActiveMetadata]);

  useEffect(() => {
    if (!isTauriRuntime()) {
      return undefined;
    }
    let unlisten: (() => void) | null = null;
    void listen(EXTERNAL_EDITOR_EDIT_ACTIVE_EVENT, () => {
      void openActiveExternalEditor();
    }).then((nextUnlisten) => {
      unlisten = nextUnlisten;
    });
    return () => unlisten?.();
  }, [openActiveExternalEditor]);

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
        await refreshAppliedHistory();
        rebaseFind();
        focusSearch();
      } catch (error) {
        setActionError(String(error));
        focusSearch();
      }
    },
    [focusSearch, rebaseFind, refreshAppliedHistory],
  );

  const refreshAfterMarkedChange = useCallback(async () => {
    await refreshAppliedHistory({ showPending: false });
    await refreshMarkedCount();
    focusSearch();
  }, [focusSearch, refreshAppliedHistory, refreshMarkedCount]);

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
        if (!historyMatchesQuery) {
          setActionError("Apply the current search before changing all results.");
          focusSearch();
          return;
        }
        const markQuery = (appliedDescriptorRef.current?.effectiveQuery ?? historyQuery).trim();
        if (aiComposerMode && !markQuery) {
          setActionError("Mark all results needs an applied structured filter outside AI mode.");
          focusSearch();
          return;
        }
        const appliedDescriptor = appliedDescriptorRef.current;
        if (!isAppliedSearchDescriptor(appliedDescriptor)) {
          setActionError("Mark all results needs a valid applied search descriptor.");
          focusSearch();
          return;
        }
        await setHistoryQueryMarked(appliedQueryMutationFields(appliedDescriptor, marked));
        await refreshAfterMarkedChange();
      } catch (error) {
        setActionError(String(error));
        focusSearch();
      }
    },
    [aiComposerMode, focusSearch, historyMatchesQuery, historyQuery, refreshAfterMarkedChange],
  );

  const showMarkMenu = useCallback((event: React.MouseEvent) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setOpenItemMenu(null);
    setOpenMarkMenu((current) =>
      current ? null : { x: Math.round(rect.left), y: Math.round(rect.bottom + 4) },
    );
  }, []);

  const showMarkedFilter = useCallback((mode: "all" | "marked" | "unmarked") => {
    leaveOpenedSavedView();
    setOpenMarkMenu(null);
    setSelectedItemId(null);
    setSelectedIds(new Set());
    selectionAnchorItemIdRef.current = null;
    const baseQuery = aiComposerMode ? "" : removeMarkedQueryTerms(query);
    const nextQuery =
      mode === "all"
        ? baseQuery
        : appendMarkedQueryTerm(baseQuery, mode === "marked" ? "is:marked" : "-is:marked");
    queryRef.current = nextQuery;
    setQuery(nextQuery);
    void refreshHistory({ resetScroll: true, queryOverride: nextQuery, allowAi: false }).catch((error) => {
      setHistoryPending(false);
      setHistoryError(String(error));
    });
    focusSearch();
  }, [aiComposerMode, focusSearch, leaveOpenedSavedView, query, refreshHistory]);

  const selectForContextMenu = useCallback((item: HistoryItem, index: number) => {
    if (selectedIdsRef.current.has(item.id)) {
      selectionInteractionSeqRef.current += 1;
      selectedItemIdRef.current = item.id;
      setSelectedItemId(item.id);
      return;
    }

    setSingleSelection(index);
  }, [setSingleSelection]);

  const showItemMenu = useCallback((item: HistoryItem, index: number, event: React.MouseEvent) => {
    selectForContextMenu(item, index);
    itemMenuReturnFocusRef.current = event.currentTarget as HTMLElement;
    setActionError(null);
    setOpenItemMenu(itemMenuAnchorFromEvent(item.id, event));
  }, [selectForContextMenu]);

  const toggleItemMenu = useCallback((item: HistoryItem, index: number, event: React.MouseEvent) => {
    selectForContextMenu(item, index);
    itemMenuReturnFocusRef.current = event.currentTarget as HTMLElement;
    setActionError(null);
    const nextAnchor = itemMenuAnchorFromEvent(item.id, event);
    setOpenItemMenu((current) => (current?.itemId === item.id ? null : nextAnchor));
  }, [selectForContextMenu]);

  const beginTagEdit = useCallback(async (items: HistoryItem[]) => {
    if (items.length === 0) {
      pushToast({
        title: "No clip selected",
        message: "Select a clip before editing tags.",
        tone: "warning",
      });
      return;
    }

    closeTransientEditors();
    setCommandPalette(null);
    setOpenMarkMenu(null);
    setEditError(null);
    try {
      const [availableTags, initialTags] = await Promise.all([
        listTags(),
        items.length === 1 ? getItemTags(items[0].id) : Promise.resolve([]),
      ]);
      setPaletteTags(availableTags);
      setKnownTagSlugs(availableTags.map((tag) => tag.slug));
      setTagEditorDraft({
        itemIds: items.map((item) => item.id),
        mode: items.length === 1 ? "replace" : "patch",
        initialTags,
      });
    } catch (error) {
      pushToast({
        title: "Tags unavailable",
        message: String(error),
        tone: "danger",
      });
      focusSearch();
    }
  }, [closeTransientEditors, focusSearch, pushToast]);

  const beginBatchMetadataEdit = useCallback((items: HistoryItem[]) => {
    if (items.length === 0) {
      return;
    }

    const metadataValues = items.map((item) => item.notes?.trim() ?? "");
    const uniqueMetadataValues = new Set(metadataValues);

    setEditError(null);
    setOpenItemMenu(null);
    setOpenMarkMenu(null);
    setBatchMetadataDraft({
      ids: items.map((item) => item.id),
      metadata: "",
      mode: "append",
      commonMetadata: uniqueMetadataValues.size === 1 ? metadataValues[0] : null,
      hasMixedMetadata: uniqueMetadataValues.size > 1,
    });
    window.setTimeout(() => editTextRef.current?.focus(), 0);
  }, []);

  const beginCreateItem = useCallback(() => {
    setEditError(null);
    setActionError(null);
    setOpenItemMenu(null);
    setOpenMarkMenu(null);
    setCommandPalette(null);
    setEditDraft(null);
    catalogItemIdRef.current = null;
    setBatchMetadataDraft(null);
    setCreateItemDraft({ text: "", metadata: "" });
    window.setTimeout(() => editTextRef.current?.focus(), 0);
  }, []);

  const renderBatchItemActions = useCallback(
    ({
      items,
      noun,
      onClear,
    }: {
      items: HistoryItem[];
      noun: "selected" | "marked";
      onClear?: () => void;
    }) => {
      const hasItems = items.length > 0;
      const contextualActions = hasItems
        ? itemMenuRegistryActions(actionDefinitions, items, items.length === 1 ? items[0] : selectedItem)
        : [];

      return (
        <>
          {actionById.has(BUILTIN_ACTIONS.joinSelected) ? (
            <UiUnstyledButton
              type="button"
              role="menuitem"
              tabIndex={-1}
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
          <UiUnstyledButton
            type="button"
            role="menuitem"
            tabIndex={-1}
            className="item-menu-action"
            disabled={!hasItems}
            onClick={() => {
              if (hasItems) {
                void beginTagEdit(items);
              }
            }}
          >
            <Tags size={14} strokeWidth={2.2} aria-hidden="true" />
            <span>Edit tags for {noun}</span>
            <ShortcutBadge shortcut={TAG_EDIT_SHORTCUT} />
          </UiUnstyledButton>
          {contextualActions.map((action) => (
            <UiUnstyledButton
              key={action.id}
              type="button"
              role="menuitem"
              tabIndex={-1}
              className="item-menu-action"
              onClick={() => void runActionDefinition(action, items, "itemMenu")}
            >
              {action.source === "script"
                ? <FileCode2 size={14} strokeWidth={2.2} aria-hidden="true" />
                : <Command size={14} strokeWidth={2.2} aria-hidden="true" />}
              <span>{action.title}</span>
              <ShortcutBadge shortcut={normalizeShortcutString(action.shortcut)} />
            </UiUnstyledButton>
          ))}
          {onClear ? (
            <UiUnstyledButton
              type="button"
              role="menuitem"
              tabIndex={-1}
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
      beginTagEdit,
      runActionDefinition,
      runBuiltinAction,
      selectedItem,
    ],
  );

  const beginSelectedItemEdit = useCallback(
    (mode: EditMode) => {
      if (mode === "metadata" && hasMultiSelection) {
        beginBatchMetadataEdit(effectiveSelection);
        return;
      }
      if (!selectedItem || hasMultiSelection) {
        return;
      }
      void beginEdit(selectedItem, mode);
    },
    [beginBatchMetadataEdit, beginEdit, effectiveSelection, hasMultiSelection, selectedItem],
  );

  const saveEdit = useCallback(async (textOverride?: string) => {
    if (!editDraft) {
      return;
    }

    const request: UpdateHistoryItemRequest = {
      id: editDraft.id,
      text: textOverride ?? editDraft.text,
      title: nullableTrim(editDraft.title),
      notes: nullableTrim(editDraft.notes),
      tags: metadataTags(editDraft.notes),
      mimePrimary: nullableTrim(editDraft.mimePrimary),
    };

    try {
      setEditError(null);
      await invoke("update_history_item", { request });
      if (catalogItemIdRef.current === editDraft.id) {
        await setHistoryItemInbox(editDraft.id, false);
        catalogItemIdRef.current = null;
      }
      setEditDraft(null);
      await refreshAppliedHistory();
      rebaseFind();
      focusSearch();
    } catch (error) {
      setEditError(String(error));
      window.setTimeout(() => editTextRef.current?.focus(), 0);
    }
  }, [editDraft, focusSearch, rebaseFind, refreshAppliedHistory]);

  const catalogItem = useCallback((item: HistoryItem) => {
    catalogItemIdRef.current = item.id;
    void beginEdit(item, "metadata", false);
  }, [beginEdit]);

  const removeFromInbox = useCallback(async (item: HistoryItem) => {
    try {
      setOpenItemMenu(null);
      await setHistoryItemInbox(item.id, false);
      await refreshAppliedHistory();
      focusSearch();
    } catch (error) {
      setActionError(String(error));
    }
  }, [focusSearch, refreshAppliedHistory]);

  const saveCreateItem = useCallback(async () => {
    if (!createItemDraft || !createItemDraft.text.trim()) {
      return;
    }

    const request: CreateHistoryItemRequest = {
      text: createItemDraft.text,
      title: null,
      notes: nullableTrim(createItemDraft.metadata),
      tags: metadataTags(createItemDraft.metadata),
      mimePrimary: "text/plain",
    };

    try {
      setEditError(null);
      const result = await createHistoryItem(request);
      setCreateItemDraft(null);
      setAiComposerMode(false);
      setSearchInterpretation(null);
      leaveOpenedSavedView();
      queryRef.current = "";
      setQuery("");
      setSelectedIds(new Set());
      await refreshHistory({ resetScroll: true, queryOverride: "", allowAi: false });
      setSelectedItemId(result.id);
      selectionAnchorItemIdRef.current = result.id;
      pushToast({
        title: result.created ? "Item created" : "Item already existed",
        message: result.created ? "Added to clipboard history." : "Moved existing item to the top and merged metadata.",
        tone: result.created ? "success" : "info",
      });
      focusSearch();
    } catch (error) {
      setEditError(String(error));
      window.setTimeout(() => editTextRef.current?.focus(), 0);
    }
  }, [createItemDraft, focusSearch, leaveOpenedSavedView, pushToast, refreshHistory]);

  const saveBatchMetadata = useCallback(async () => {
    if (!batchMetadataDraft) {
      return;
    }

    const selectedItemsById = new Map(history.map((item) => [item.id, item]));
    const itemsToUpdate = batchMetadataDraft.ids
      .map((id) => selectedItemsById.get(id))
      .filter((item): item is HistoryItem => Boolean(item));
    const nextMetadata = batchMetadataDraft.metadata.trim();

    if (itemsToUpdate.length === 0 || nextMetadata.length === 0) {
      setBatchMetadataDraft(null);
      focusSearch();
      return;
    }

    try {
      setEditError(null);
      const fullItemsToUpdate = await Promise.all(itemsToUpdate.map(ensureFullHistoryItem));
      for (const item of fullItemsToUpdate) {
        const nextNotes = applyBatchMetadata(item.notes, nextMetadata, batchMetadataDraft.mode);
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
      await refreshAppliedHistory();
      rebaseFind();
      focusSearch();
    } catch (error) {
      setEditError(String(error));
      window.setTimeout(() => editTextRef.current?.focus(), 0);
    }
  }, [batchMetadataDraft, ensureFullHistoryItem, focusSearch, history, rebaseFind, refreshAppliedHistory]);

  const saveTagEditor = useCallback(async (tags: string[], removeTags: string[]) => {
    if (!tagEditorDraft || tagEditorSaving) {
      return;
    }

    setTagEditorSaving(true);
    setEditError(null);
    try {
      await applyItemTags({
        itemIds: tagEditorDraft.itemIds,
        tags,
        removeTags,
        mode: tagEditorDraft.mode,
      });
      const itemCount = tagEditorDraft.itemIds.length;
      setTagEditorDraft(null);
      const [availableTags] = await Promise.all([
        listTags(),
        refreshAppliedHistory(),
      ]);
      rebaseFind();
      setPaletteTags(availableTags);
      setKnownTagSlugs(availableTags.map((tag) => tag.slug));
      if (itemCount > 1) {
        pushToast({
          title: "Tags updated",
          message: `Applied tag changes to ${itemCount} clips.`,
          tone: "success",
        });
      }
      focusSearch();
    } catch (error) {
      setEditError(String(error));
    } finally {
      setTagEditorSaving(false);
    }
  }, [focusSearch, pushToast, rebaseFind, refreshAppliedHistory, tagEditorDraft, tagEditorSaving]);

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

    listTags()
      .then((tags) => {
        if (active) {
          setKnownTagSlugs(tags.map((tag) => tag.slug));
          setPaletteTags(tags);
        }
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    listSavedHistoryViews()
      .then((views) => {
        if (active) {
          setSavedHistoryViews(views);
        }
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, []);

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
    return setupAutomaticUpdates(settings.autoUpdate, {
      onStatus: (status) => {
        const toast = autoUpdateStatusToast(status);
        if (toast) {
          pushToast(toast);
        }
      },
      onError: (message) => {
        console.warn("automatic update check failed", message);
      },
    });
  }, [pushToast, settings.autoUpdate]);

  useEffect(() => {
    if (!createItemDraft) {
      return;
    }

    window.setTimeout(() => editTextRef.current?.focus(), 0);
  }, [createItemDraft !== null]);

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
    const skipNextRealtimeSearch = skipNextRealtimeSearchRef.current;
    const trimmedQuery = query.trim();
    if (skipNextRealtimeSearch) {
      skipNextRealtimeSearchRef.current = null;
      if (
        skipNextRealtimeSearch.query === trimmedQuery
        && skipNextRealtimeSearch.intentGeneration === searchIntentGenerationRef.current
      ) {
        return () => {
          active = false;
        };
      }
    }
    const foregroundFailure = lastSearchFailureRef.current;
    if (
      foregroundFailure?.source === "foreground"
      && foregroundFailure.query === trimmedQuery
      && foregroundFailure.intentGeneration === searchIntentGenerationRef.current
    ) {
      if (searchDebounceTimerRef.current !== null) {
        window.clearTimeout(searchDebounceTimerRef.current);
        searchDebounceTimerRef.current = null;
      }
      return () => {
        active = false;
      };
    }
    const queryChanged = trimmedQuery !== historyInputQuery;
    const searchInput = historySearchInput(trimmedQuery, aiComposerMode);
    const paginationRecoveryError = historyPaginationBlockMatchesCurrent
      ? historyPaginationBlocked?.error ?? null
      : null;
    if (isScenarioCommand(trimmedQuery) || searchInput.mode === "ai" || effectiveSearchTriggerMode !== "realtime") {
      if (searchDebounceTimerRef.current !== null) {
        window.clearTimeout(searchDebounceTimerRef.current);
        searchDebounceTimerRef.current = null;
      }
      setHistoryPending(false);
      setHistoryError(queryChanged ? null : paginationRecoveryError);
      if (historyTotalCount === null && historyInputQuery === "" && trimmedQuery === "") {
        refreshHistory({ resetScroll: false, showPending: false, allowAi: false }).catch((error) => {
          if (active) {
            setHistoryError(String(error));
          }
        });
      } else if (
        !aiComposerMode
        && searchInput.mode === "structured"
        && historyTotalCount === null
        && historyInputQuery === ""
        && trimmedQuery !== ""
        && historyRef.current.length === 0
        && appliedSnapshotGenerationRef.current === 0
      ) {
        // A held draft can be typed before the first unfiltered snapshot settles.
        // Prime that snapshot explicitly so the held draft never leaves an empty feed.
        refreshHistory({
          resetScroll: false,
          showPending: false,
          allowAi: false,
          queryOverride: "",
        }).catch((error) => {
          if (active) {
            setHistoryError(String(error));
          }
        });
      }
      return () => {
        active = false;
      };
    }
    if (!queryChanged && historyTotalCount !== null) {
      if (searchDebounceTimerRef.current !== null) {
        window.clearTimeout(searchDebounceTimerRef.current);
        searchDebounceTimerRef.current = null;
      }
      setHistoryPending(false);
      setHistoryError(paginationRecoveryError);
      return () => {
        active = false;
      };
    }
    setHistoryPending(true);
    if (searchDebounceTimerRef.current !== null) {
      window.clearTimeout(searchDebounceTimerRef.current);
    }
    const timeoutId = window.setTimeout(() => {
      searchDebounceTimerRef.current = null;
      refreshHistory({ resetScroll: queryChanged }).catch((error) => {
        if (active) {
          setHistoryPending(false);
          setHistoryError(String(error));
        }
      });
    }, 120);
    searchDebounceTimerRef.current = timeoutId;

    return () => {
      active = false;
      window.clearTimeout(timeoutId);
      if (searchDebounceTimerRef.current === timeoutId) {
        searchDebounceTimerRef.current = null;
      }
    };
  }, [
    aiComposerMode,
    effectiveSearchTriggerMode,
    historyInputQuery,
    historyPaginationBlockMatchesCurrent,
    historyPaginationBlocked,
    historyTotalCount,
    query,
    refreshHistory,
  ]);

  useEffect(() => {
    if (!isTauriRuntime()) {
      return undefined;
    }

    let active = true;
    let unlisten: (() => void) | null = null;
    void listen<{ itemId: number }>(PICKER_ACTIVE_ITEM_EVENT, (event) => {
      if (!active) {
        return;
      }

      const itemId = event.payload.itemId;
      const emptySelection = new Set<number>();
      selectedIdsRef.current = emptySelection;
      selectedItemIdRef.current = itemId;
      selectionAnchorItemIdRef.current = itemId;
      lastActivatedItemIdRef.current = itemId;
      const activationSelectionSeq = ++selectionInteractionSeqRef.current;
      const applyActivationSelection = () => {
        const targetIndex = historyRef.current.findIndex((item) => item.id === itemId);
        if (targetIndex < 0) {
          pendingHistoryActivationItemIdRef.current = itemId;
          return false;
        }
        pendingHistoryActivationItemIdRef.current = null;
        setSelectedIds(emptySelection);
        setSelectedItemId(itemId);
        if (targetIndex === 0) {
          historyScrollRef.current?.scrollTo({ top: 0 });
        }
        return true;
      };
      applyActivationSelection();
      void pickerEventHandlersRef.current.refreshAppliedHistory({
        respectManualScroll: false,
        showPending: false,
      }).then(() => {
        if (!active || activationSelectionSeq !== selectionInteractionSeqRef.current) {
          return;
        }
        applyActivationSelection();
      }).catch((error) => {
        if (active) {
          setHistoryPending(false);
          setHistoryError(String(error));
        }
      });
    }).then((nextUnlisten) => {
      if (active) {
        unlisten = nextUnlisten;
      } else {
        void nextUnlisten();
      }
    });

    return () => {
      active = false;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    if (!isTauriRuntime()) {
      return undefined;
    }

    let active = true;
    let unlisten: (() => void) | null = null;
    const activatePendingHistoryItem = () => {
      const itemId = pendingHistoryActivationItemIdRef.current;
      if (itemId === null) {
        return;
      }
      const targetIndex = historyRef.current.findIndex((item) => item.id === itemId);
      if (targetIndex < 0) {
        return;
      }
      pendingHistoryActivationItemIdRef.current = null;
      const emptySelection = new Set<number>();
      selectedIdsRef.current = emptySelection;
      selectedItemIdRef.current = itemId;
      selectionAnchorItemIdRef.current = itemId;
      setSelectedIds(emptySelection);
      setSelectedItemId(itemId);
      if (targetIndex === 0) {
        historyScrollRef.current?.scrollTo({ top: 0 });
      }
    };
    void listen<{ itemId: number; contentKind: "text" | "image"; activate?: boolean }>(
      HISTORY_CHANGED_EVENT,
      (event) => {
        if (!active) {
          return;
        }
        if (event.payload.activate) {
          pendingHistoryActivationItemIdRef.current = event.payload.itemId;
        }
        void getCurrentWindow().isVisible().then((visible) => {
          if (!active) {
            return;
          }
          if (!visible) {
            pickerWasHiddenRef.current = true;
            return;
          }
          return pickerEventHandlersRef.current.refreshAppliedHistory({
            respectManualScroll: true,
            showPending: false,
          }).then(activatePendingHistoryItem);
        }).catch((error) => {
          if (active) {
            setHistoryPending(false);
            setHistoryError(String(error));
          }
        });
      },
    ).then((nextUnlisten) => {
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

      const focusSelectionSeq = selectionInteractionSeqRef.current;
      const focusQueryInteractionSeq = queryInteractionSeqRef.current;
      const focusRequestSeq = historyRequestSeqRef.current;
      void (async () => {
        let resetFromHost = false;
        try {
          if (!(await getCurrentWindow().isVisible())) {
            pickerWasHiddenRef.current = true;
            return;
          }
          const session = await consumePickerSessionSnapshot();
          resetFromHost = session.reset;
          if (session.pendingActivationItemId !== null) {
            pendingHistoryActivationItemIdRef.current = session.pendingActivationItemId;
          }
        } catch (error) {
          console.warn("consume picker session failed", error);
        }
        if (!active) {
          return;
        }
        if (resetFromHost) {
          pickerWasHiddenRef.current = true;
        }
        const pendingHiddenReset = pickerWasHiddenRef.current;
        const resetAfterHidden =
          pendingHiddenReset &&
          focusSelectionSeq === selectionInteractionSeqRef.current &&
          focusQueryInteractionSeq === queryInteractionSeqRef.current &&
          focusRequestSeq === historyRequestSeqRef.current;
        pickerWasHiddenRef.current = false;
        if (resetAfterHidden) {
          pickerEventHandlersRef.current.resetPickerSession();
        }
        const refresh = resetAfterHidden
          ? pickerEventHandlersRef.current.refreshHistory({
              resetScroll: true,
              showPending: false,
              queryOverride: filterLockedRef.current ? historyInputQueryRef.current : "",
              allowAi: false,
            })
          : pickerEventHandlersRef.current.refreshAppliedHistory({
              respectManualScroll: true,
              showPending: false,
            });
        void refresh.then(activatePendingHistoryItem).catch((error) => {
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
  }, []);

  useEffect(() => {
    const [lastVirtualRow] = [...virtualRows].reverse();
    if (!lastVirtualRow) {
      return;
    }
    if (remoteFindItemId !== null && lastVirtualRow.index >= history.length) {
      return;
    }
    const lastLoadedIndex = Math.min(lastVirtualRow.index, history.length - 1);
    if (
      history.length > 0
      && lastLoadedIndex >= history.length - HISTORY_PREFETCH_THRESHOLD &&
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
    remoteFindItemId,
    virtualRows,
  ]);

  const isFilteringHistory = effectiveSearchTriggerMode === "realtime" && !historyMatchesQuery && !aiDraftActive;
  const feedLoading = isFilteringHistory || historyPending || historyLoadingMore || aiPlanning;

  useEffect(() => {
    if (!feedLoading) {
      setHistoryLoadingDelayed(false);
      return undefined;
    }

    const timer = window.setTimeout(() => setHistoryLoadingDelayed(true), 180);
    return () => window.clearTimeout(timer);
  }, [feedLoading]);

  useLayoutEffect(() => {
    if (!openItemMenu) {
      return;
    }
    const firstMenuItem = itemMenuRef.current?.querySelector<HTMLElement>('[role="menuitem"]:not(:disabled)');
    firstMenuItem?.focus();
  }, [openItemMenu]);

  const selectionAnnouncement = [
    selectedItem ? `Current clip ${selectedItem.id}.` : history.length > 0 ? "No current clip." : "No clips available.",
    selectedItems.length > 0
      ? `${selectedItems.length} ${selectedItems.length === 1 ? "clip" : "clips"} selected.`
      : "No clips selected.",
  ].join(" ");
  const historyAriaSetSize = historyFilteredCount !== null
    ? historyFilteredCount
    : historyNextCursor === null
      ? history.length
      : null;
  const hasPreviousHistorySnapshot = history.length > 0 || Boolean(searchState.applied);
  const historyErrorCopy = hasPreviousHistorySnapshot
    ? "Could not update results. Previous results remain visible."
    : "Could not load clipboard history yet. Try again.";
  const structuredSearchFeedback = !historyMatchesQuery
    && structuredSearchDraft.structured
    && (structuredSearchDraft.kind === "incomplete" || structuredSearchDraft.kind === "invalid")
    ? structuredSearchDraft.message
    : null;
  const hasSearchContext = Boolean(structuredSearchFeedback || visibleSearchInterpretation);
  const searchStatus = useMemo(() => {
    if (historyError) {
      return "Could not update results";
    }
    if (clearSearchPending) {
      return "Clearing filter";
    }
    if (aiPlanning) {
      return "AI planning";
    }
    if (scenarioCommandQuery !== null) {
      return scenarioCommandOptions.length > 0 ? "Choose capture mode" : "No matching capture mode";
    }
    if (aiDraftActive) {
      return "AI draft";
    }
    if (!historyMatchesQuery) {
      if (structuredSearchFeedback) {
        return "Complete the structured filter";
      }
      if (structuredSearchHold) {
        return "Structured query held";
      }
      if (effectiveSearchTriggerMode === "enter") {
        return "Press Enter";
      }
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
    clearSearchPending,
    historyError,
    historyFilteredCount,
    historyMatchesQuery,
    historyTotalCount,
    newClipsAvailable,
    query,
    scenarioCommandOptions.length,
    scenarioCommandQuery,
    effectiveSearchTriggerMode,
    structuredSearchHold,
    structuredSearchFeedback,
  ]);
  const retryFailedSearch = useCallback(() => {
    const failure = lastSearchFailureRef.current;
    if (failure?.source === "background") {
      return refreshAppliedHistory({ resetScroll: true, showPending: false });
    }
    if (failure?.source === "foreground") {
      if (queryRef.current.trim() !== failure.query) {
        queryRef.current = failure.query;
        setQuery(failure.query);
        supersedeSearchIntent(failure.query, "applying");
      }
      const intentGeneration = searchIntentGenerationRef.current;
      skipNextRealtimeSearchRef.current = {
        query: failure.query,
        intentGeneration,
        appliedGeneration: appliedSnapshotGenerationRef.current,
        reason: "foreground",
      };
      autocompleteCommittedQueryRef.current = null;
      return refreshHistory({
        resetScroll: true,
        allowAi: true,
        queryOverride: failure.query,
      });
    }
    if (searchState.filterStatus === "held") {
      return refreshAppliedHistory({ resetScroll: true, showPending: false });
    }
    return refreshHistory({ resetScroll: true, allowAi: true });
  }, [refreshAppliedHistory, refreshHistory, searchState.filterStatus, supersedeSearchIntent]);
  const currentDraftCanApply = aiComposerMode
    || structuredSearchDraft.kind === "plain"
    || structuredSearchDraft.kind === "complete";
  const showApplyAction = scenarioCommandQuery === null
    && currentDraftCanApply
    && (
      aiComposerMode
      || (
        hasSearchDraft
        && (
          searchTriggerMode === "enter"
          || (searchTriggerMode === "realtime" && structuredSearchHold)
        )
      )
    );
  const markMenuCountLabel = markedTotalCount !== null && markedTotalCount > 0
    ? formatCount(markedTotalCount)
    : null;
  const markMenuCountAria = "marked";
  const checkedActionItems = markedActionItems ?? visibleMarkedItems;
  const checkedActionCount = markedTotalCount ?? checkedActionItems.length;
  const runSearchNow = useCallback(() => {
    if (!aiComposerMode && (structuredSearchDraft.kind === "incomplete" || structuredSearchDraft.kind === "invalid")) {
      const error = structuredSearchDraft.message ?? "Complete the structured filter before applying.";
      setHistoryPending(false);
      dispatchSearch({
        type: "applyFailed",
        generation: searchIntentGenerationRef.current,
        intentGeneration: searchIntentGenerationRef.current,
        error,
      });
      return;
    }
    if (
      searchTriggerMode === "realtime"
      && historySearchInput(query.trim(), aiComposerMode).mode === "structured"
    ) {
      skipNextRealtimeSearchRef.current = {
        query: query.trim(),
        intentGeneration: searchIntentGenerationRef.current,
        appliedGeneration: appliedSnapshotGenerationRef.current,
        reason: "foreground",
      };
    }
    void closeFind({ restoreFocus: false });
    autocompleteCommittedQueryRef.current = null;
    if (searchDebounceTimerRef.current !== null) {
      window.clearTimeout(searchDebounceTimerRef.current);
      searchDebounceTimerRef.current = null;
    }
    void refreshHistory({ resetScroll: true, allowAi: true });
  }, [aiComposerMode, closeFind, query, refreshHistory, searchTriggerMode, structuredSearchDraft]);
  const toggleFilterLock = useCallback(() => {
    const nextLocked = !filterLockedRef.current;
    if (nextLocked) {
      const filterQuery = query.trim();
      if (!filterQuery || aiComposerMode) {
        return;
      }
      if (structuredSearchDraft.kind === "incomplete" || structuredSearchDraft.kind === "invalid") {
        return;
      }
      if (filterQuery !== historyInputQuery.trim()) {
        pendingFilterLockRef.current = {
          query: filterQuery,
          intentGeneration: searchIntentGenerationRef.current,
        };
        runSearchNow();
      } else {
        const appliedSnapshot = searchState.applied;
        if (
          !appliedSnapshot
          || !isAppliedSearchDescriptor(appliedSnapshot.descriptor)
          || appliedSnapshot.descriptor.displayQuery.trim() !== filterQuery
        ) {
          return;
        }
        filterLockedRef.current = true;
        writeLockedFilterQuery(filterQuery);
        setFilterLocked(true);
      }
    } else {
      filterLockedRef.current = false;
      writeLockedFilterQuery(null);
      setFilterLocked(false);
    }
    window.setTimeout(() => searchRef.current?.focus(), 0);
  }, [aiComposerMode, historyInputQuery, query, runSearchNow, searchState.applied, structuredSearchDraft]);
  const clearSearchFilter = useCallback(() => {
    leaveOpenedSavedView();
    if (searchDebounceTimerRef.current !== null) {
      window.clearTimeout(searchDebounceTimerRef.current);
      searchDebounceTimerRef.current = null;
    }
    filterLockedRef.current = false;
    writeLockedFilterQuery(null);
    setFilterLocked(false);
    autocompleteCommittedQueryRef.current = null;
    queryRef.current = "";
    setQuery("");
    supersedeSearchIntent("", "applying");
    skipNextRealtimeSearchRef.current = {
      query: "",
      intentGeneration: searchIntentGenerationRef.current,
      appliedGeneration: appliedSnapshotGenerationRef.current,
      reason: "foreground",
    };
    updateClearSearchPending(true);
    setDismissedAutocompleteQuery(null);
    setSearchInterpretation(null);
    setActionError(null);
    setSelectedItemId(null);
    setSelectedIds(new Set());
    selectionAnchorItemIdRef.current = null;
    void refreshHistory({ resetScroll: true, queryOverride: "", allowAi: false });
    window.setTimeout(() => searchRef.current?.focus(), 0);
  }, [leaveOpenedSavedView, refreshHistory, supersedeSearchIntent, updateClearSearchPending]);
  const removeSearchChip = useCallback((chip: SearchQueryChip) => {
    leaveOpenedSavedView();
    autocompleteCommittedQueryRef.current = null;
    queryRef.current = chip.queryWithoutClause;
    setQuery(chip.queryWithoutClause);
    supersedeSearchIntent(chip.queryWithoutClause, "applying");
    skipNextRealtimeSearchRef.current = {
      query: chip.queryWithoutClause.trim(),
      intentGeneration: searchIntentGenerationRef.current,
      appliedGeneration: appliedSnapshotGenerationRef.current,
      reason: "foreground",
    };
    setSearchInterpretation(null);
    setSelectedItemId(null);
    setSelectedIds(new Set());
    selectionAnchorItemIdRef.current = null;
    void refreshHistory({
      resetScroll: true,
      queryOverride: chip.queryWithoutClause,
      allowAi: false,
    });
  }, [leaveOpenedSavedView, refreshHistory, supersedeSearchIntent]);
  const discardSearchDraft = useCallback(() => {
    const appliedQuery = historyInputQueryRef.current;
    const paginationRecoveryError = historyPaginationBlockMatchesCurrent
      ? historyPaginationBlocked?.error ?? null
      : null;
    autocompleteCommittedQueryRef.current = null;
    queryRef.current = appliedQuery;
    setQuery(appliedQuery);
    setDismissedAutocompleteQuery(appliedQuery);
    setHistoryPending(false);
    setHistoryError(null);
    supersedeSearchIntent(appliedQuery, "idle");
    if (paginationRecoveryError) {
      setHistoryError(paginationRecoveryError);
    }
    window.setTimeout(() => searchRef.current?.focus(), 0);
  }, [historyPaginationBlockMatchesCurrent, historyPaginationBlocked, supersedeSearchIntent]);
  const acceptSearchSuggestion = useCallback((index = activeSearchSuggestionIndex) => {
    if (scenarioCommandOpen) {
      const scenario = scenarioCommandOptions[index];
      if (scenario) void activateScenarioFromPicker(scenario.id);
      return;
    }
    const suggestion = autocompleteSuggestions[index];
    if (!suggestion) {
      return;
    }
    const nextQuery = replaceActiveSearchToken(query, suggestion.replacement);
    if (openedSavedView && nextQuery.trim() !== openedSavedView.query.trim()) {
      leaveOpenedSavedView();
    }
    const nextStructuredDraft = classifyStructuredSearchDraft(nextQuery);
    const nextStructuredHold = nextStructuredDraft.structured;
    autocompleteCommittedQueryRef.current = nextQuery;
    queryRef.current = nextQuery;
    setDismissedAutocompleteQuery(nextQuery);
    setQuery(nextQuery);
    setHistoryPending(false);
    supersedeSearchIntent(
      nextQuery,
      nextStructuredHold ? "held" : searchTriggerMode === "realtime" ? "applying" : "idle",
    );
    setAiPlanning(false);
    setActionError(null);
    setSearchInterpretation(null);
    setSelectedItemId(null);
    setSelectedIds(new Set());
    selectionAnchorItemIdRef.current = null;
  }, [
    activeSearchSuggestionIndex,
    autocompleteSuggestions,
    leaveOpenedSavedView,
    openedSavedView,
    query,
    scenarioCommandOpen,
    scenarioCommandOptions,
    searchTriggerMode,
    activateScenarioFromPicker,
    supersedeSearchIntent,
  ]);
  const searchControlBaseProps = {
    className: "search-input",
    variant: "unstyled" as const,
    role: !aiComposerMode && searchSuggestionsOpen ? "combobox" as const : "textbox" as const,
    "aria-label": "Search clipboard history",
    "aria-autocomplete": aiComposerMode ? "none" as const : "list" as const,
    "aria-haspopup": !aiComposerMode && searchSuggestionsOpen ? "listbox" as const : undefined,
    "aria-controls": !aiComposerMode && searchSuggestionsOpen ? "search-autocomplete" : undefined,
    "aria-expanded": !aiComposerMode && searchSuggestionsOpen ? true : undefined,
    "aria-activedescendant": !aiComposerMode && searchSuggestionsOpen
      ? `search-suggestion-${activeSearchSuggestionIndex}`
      : undefined,
    value: query,
    placeholder: aiComposerMode ? "Ask Copicu AI" : 'Search clips — re:pattern, meta:work, #tag, ai:find invoices',
    title:
      'Search help: use plain text, re:regular expression, "phrases", -exclude, meta:/title:/notes:/ctx:, tag:/#tag, kind:, mime:, has:, is:, after:/before:/on:, or ai: natural language.',
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const nextQuery = event.currentTarget.value;
      if (clearSearchPendingRef.current) {
        updateClearSearchPending(false);
      }
      if (openedSavedView && nextQuery.trim() !== openedSavedView.query.trim()) {
        leaveOpenedSavedView();
      }
      autocompleteCommittedQueryRef.current = null;
      const nextStructuredDraft = classifyStructuredSearchDraft(nextQuery);
      const nextAutocompleteActive = !aiComposerMode
        && !isScenarioCommand(nextQuery)
        && searchSuggestions(nextQuery, knownTagSlugs).length > 0;
      const nextStructuredHold = shouldHoldStructuredSearchDraft(nextStructuredDraft, {
        draftChanged: nextQuery.trim() !== historyInputQuery,
        searchTriggerMode,
        deferStructuredSearchUntilEnter: settings.picker.deferStructuredSearchUntilEnter,
        autocompleteActive: nextAutocompleteActive,
      });
      queryRef.current = nextQuery;
      setQuery(nextQuery);
      setHistoryPending(!isScenarioCommand(nextQuery) && searchTriggerMode === "realtime" && !nextStructuredHold);
      supersedeSearchIntent(
        nextQuery,
        nextStructuredHold ? "held" : searchTriggerMode === "realtime" ? "applying" : "idle",
      );
      setAiPlanning(false);
      setActionError(null);
      setSearchInterpretation(null);
      setSelectedItemId(null);
      setSelectedIds(new Set());
      selectionAnchorItemIdRef.current = null;
    },
    onKeyDown: (event: ReactKeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (isQuickActionsShortcut(event)) {
        event.preventDefault();
        openActionPicker();
        return;
      }
      if (event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && event.key.toLocaleLowerCase() === "s") {
        event.preventDefault();
        openScenarioMenu();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === "k") {
        event.preventDefault();
        openCommandPalette();
        return;
      }
      if (
        event.ctrlKey
        && event.shiftKey
        && !event.altKey
        && !event.metaKey
        && event.key.toLocaleLowerCase() === "l"
      ) {
        event.preventDefault();
        toggleFilterLock();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === "n") {
        event.preventDefault();
        beginCreateItem();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === "i") {
        event.preventDefault();
        setAiComposerMode((current) => !current);
        setSearchInterpretation(null);
        window.setTimeout(() => searchRef.current?.focus(), 0);
        return;
      }
      const shortcut = shortcutFromKeyboardEvent(event);
      const settingsShortcut = normalizeShortcutString(settings.picker.settingsShortcut);
      if (settingsShortcut && shortcut === settingsShortcut) {
        event.preventDefault();
        void openSettingsWindow();
        return;
      }
      const previewShortcut = normalizeShortcutString(settings.picker.previewShortcut);
      if (previewShortcut && shortcut === previewShortcut) {
        event.preventDefault();
        if (selectedItem) {
          void toggleItemPreview(selectedItem.id).catch((previewError) => {
            setActionError(String(previewError));
          });
        }
        return;
      }
      if (shortcut === TAG_EDIT_SHORTCUT) {
        event.preventDefault();
        openActiveMetadata();
        return;
      }
      if (
        event.ctrlKey
        && !event.shiftKey
        && !event.metaKey
        && !event.altKey
        && event.key.toLocaleLowerCase() === "d"
      ) {
        event.preventDefault();
        void deleteItems(effectiveSelection);
        return;
      }
      if (event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey && event.key === "Delete") {
        event.preventDefault();
        void deleteItems(effectiveSelection);
        return;
      }
      if (runLocalShortcutAction(event)) {
        return;
      }

      switch (event.key) {
        case "Tab":
          if (searchSuggestionsOpen && !event.shiftKey) {
            event.preventDefault();
            acceptSearchSuggestion();
          }
          break;
        case "ArrowDown":
          event.preventDefault();
          if (searchSuggestionsOpen) {
            const count = scenarioCommandOpen ? scenarioCommandOptions.length : autocompleteSuggestions.length;
            setActiveSearchSuggestion((current) => (current + 1) % count);
          } else {
            moveSelection(1, event.shiftKey);
          }
          break;
        case "ArrowUp":
          event.preventDefault();
          if (searchSuggestionsOpen) {
            const count = scenarioCommandOpen ? scenarioCommandOptions.length : autocompleteSuggestions.length;
            setActiveSearchSuggestion((current) => (current - 1 + count) % count);
          } else {
            moveSelection(-1, event.shiftKey);
          }
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
          if (findState?.active) {
            void closeFind();
            break;
          }
          if (searchSuggestionsOpen) {
            setDismissedAutocompleteQuery(query);
            break;
          }
          setActionError(null);
          if (openMarkMenu !== null) {
            setOpenMarkMenu(null);
          }
          if (openItemMenu !== null) {
            setOpenItemMenu(null);
          }
          if (hasSearchDraft && !clearSearchPending) {
            discardSearchDraft();
            break;
          }
          if (historyInputQuery.trim() && !clearSearchPending) {
            clearSearchFilter();
            break;
          }
          hidePickerWindow();
          break;
        case "F2":
          event.preventDefault();
          if (event.ctrlKey || event.metaKey) {
            if (!hasMultiSelection) {
              void openActiveExternalEditor();
            }
          } else {
            beginSelectedItemEdit(event.shiftKey ? "metadata" : "content");
          }
          break;
        case "Enter":
          event.preventDefault();
          setDismissedAutocompleteQuery(query);
          if (scenarioCommandQuery !== null) {
            if (scenarioCommandOpen) acceptSearchSuggestion();
          } else if ((event.ctrlKey || event.metaKey) || (aiDraftActive && !event.shiftKey)) {
            autocompleteCommittedQueryRef.current = null;
            runSearchNow();
          } else if (!historyMatchesQuery) {
            if (effectiveSearchTriggerMode === "enter" || effectiveSearchTriggerMode === "realtime") {
              autocompleteCommittedQueryRef.current = null;
              runSearchNow();
            }
          } else if (!hasMultiSelection) {
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
        controls={["pin", "keep-open", "minimize", "maximize", "hide", "quit"]}
        hideLabel="Hide Copicu"
        quitLabel="Quit Copicu"
        keepOpen={!settings.picker.hideOnFocusLost}
        pinShortcutLabel={settings.picker.pinToggleShortcut}
        title="Copicu"
        variant="floatingPicker"
        onHide={hidePickerWindow}
        onKeepOpenChange={setPickerKeepOpenMode}
        onQuit={quitCopicu}
        onPinChange={setPickerPinned}
      >
      <section
        className="picker-panel"
        aria-label="Copicu"
        onKeyDown={(event) => {
          if (event.defaultPrevented || event.key !== "F2") {
            return;
          }
          event.preventDefault();
          if (event.ctrlKey || event.metaKey) {
            if (!hasMultiSelection) {
              void openActiveExternalEditor();
            }
          } else {
            beginSelectedItemEdit(event.shiftKey ? "metadata" : "content");
          }
        }}
      >
        {editDraft?.mode === "content" ? (
          <Suspense fallback={(
            <div className="item-content-editor-loading" role="status">
              <UiLoader size="sm" />
              <span>Loading editor</span>
            </div>
          )}>
            <LazyItemContentEditor
              itemId={editDraft.id}
              mimePrimary={editDraft.mimePrimary}
              value={editDraft.text}
              error={editError}
              settings={settings.editor}
              onChange={(text) => setEditDraft((draft) => draft ? { ...draft, text } : draft)}
              onCancel={() => {
                catalogItemIdRef.current = null;
                setEditDraft(null);
                setEditError(null);
                focusSearch();
              }}
              onSave={(text) => void saveEdit(text)}
            />
          </Suspense>
        ) : (
        <>
        <PickerHeader>
        <div className={`search-row${aiComposerMode ? " is-ai-mode" : ""}`}>
          <div className="selection-controls">
            <UiTooltip label={allVisibleSelected ? "Clear visible selection" : "Select all visible"}>
              <UiCheckbox
                className="selection-master-checkbox"
                checked={allVisibleSelected}
                indeterminate={someVisibleSelected}
                disabled={history.length === 0}
                aria-label={allVisibleSelected ? "Clear visible selection" : "Select all visible"}
                onMouseDown={(event) => event.stopPropagation()}
                onChange={(event) => setVisibleSelection(event.currentTarget.checked)}
              />
            </UiTooltip>
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
                    disabled={history.length === 0 && !query.trim()}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={showMarkMenu}
                  >
                    <Flag size={14} strokeWidth={2.1} aria-hidden="true" />
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
                    Mark visible
                  </Menu.Item>
                  <Menu.Item
                    leftSection={<Square size={14} strokeWidth={2.2} />}
                    onClick={() => void setItemsMarked(history, false)}
                  >
                    Unmark visible
                  </Menu.Item>
                  <Menu.Item
                    leftSection={<ListChecks size={14} strokeWidth={2.2} />}
                    onClick={() => void setCurrentQueryMarked(true)}
                  >
                    Mark all results
                  </Menu.Item>
                  <Menu.Item
                    leftSection={<CircleSlash size={14} strokeWidth={2.2} />}
                    onClick={() => void setCurrentQueryMarked(false)}
                  >
                    Unmark all results
                  </Menu.Item>
                  <Menu.Divider />
                  <Menu.Item
                    leftSection={<Flag size={14} strokeWidth={2.2} />}
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
                        Marked items
                        {markedActionItemsLoading ? (
                          <span>Loading</span>
                        ) : (
                          <span>{formatCount(checkedActionCount)}</span>
                        )}
                      </div>
                      {renderBatchItemActions({
                        items: checkedActionItems,
                        noun: "marked",
                      })}
                    </>
                  ) : null}
                </Menu.Dropdown>
              </Menu>
            </div>
          </div>
          <div className={`search-field${!aiComposerMode && query ? " has-clear-button" : ""}`}>
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
            {!aiComposerMode ? (
              <UiTooltip
                label={(
                  <span className="tooltip-shortcut-label">
                    <span>{filterLocked ? "Unlock persistent filter" : "Keep filter after closing"}</span>
                    <ShortcutBadge shortcut={FILTER_LOCK_SHORTCUT} />
                  </span>
                )}
              >
                <UiIconButton
                  type="button"
                  className="filter-lock-button"
                  variant="subtle"
                  aria-label={filterLocked ? "Unlock persistent filter" : "Lock filter across picker closes"}
                  aria-pressed={filterLocked}
                  disabled={!filterLocked && !query.trim()}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={toggleFilterLock}
                >
                  {filterLocked ? (
                    <LockKeyhole size={14} strokeWidth={2.2} aria-hidden="true" />
                  ) : (
                    <LockKeyholeOpen size={14} strokeWidth={2.2} aria-hidden="true" />
                  )}
                </UiIconButton>
              </UiTooltip>
            ) : null}
            {!aiComposerMode && query ? (
              <UiTooltip label="Clear filter">
                <UiIconButton
                  type="button"
                  className="filter-clear-button"
                  variant="subtle"
                  aria-label="Clear filter"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={clearSearchFilter}
                >
                  <X size={14} strokeWidth={2.3} aria-hidden="true" />
                </UiIconButton>
              </UiTooltip>
            ) : null}
            {searchSuggestionsOpen ? (
              <div id="search-autocomplete" className="search-autocomplete" role="listbox" aria-label={scenarioCommandOpen ? "Capture mode actions" : "Search suggestions"}>
                {scenarioCommandOpen
                  ? scenarioCommandOptions.map((scenario, index) => (
                    <button
                      key={scenario.id}
                      id={`search-suggestion-${index}`}
                      type="button"
                      className="search-autocomplete-option"
                      role="option"
                      aria-selected={index === activeSearchSuggestionIndex}
                      onMouseDown={(event) => event.preventDefault()}
                      onMouseEnter={() => setActiveSearchSuggestion(index)}
                      onClick={() => void activateScenarioFromPicker(scenario.id)}
                    >
                      Activate capture mode: {scenario.name}
                    </button>
                  ))
                  : autocompleteSuggestions.map((suggestion, index) => (
                    <button
                      key={`${suggestion.label}:${index}`}
                      id={`search-suggestion-${index}`}
                      type="button"
                      className="search-autocomplete-option"
                      role="option"
                      aria-selected={index === activeSearchSuggestionIndex}
                      onMouseDown={(event) => event.preventDefault()}
                      onMouseEnter={() => setActiveSearchSuggestion(index)}
                      onClick={() => acceptSearchSuggestion(index)}
                    >
                      {suggestion.label}
                    </button>
                  ))}
              </div>
            ) : null}
          </div>
          <UiTooltip
            label={(
              <span className="tooltip-shortcut-label">
                <span>New item</span>
                <ShortcutBadge shortcut="Ctrl+N" />
              </span>
            )}
          >
            <UiIconButton
              type="button"
              className="new-item-button"
              variant="default"
              aria-label="New item"
              onMouseDown={(event) => event.preventDefault()}
              onClick={beginCreateItem}
            >
              <Plus size={15} strokeWidth={2.3} aria-hidden="true" />
            </UiIconButton>
          </UiTooltip>
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
                if (!aiComposerMode) {
                  leaveOpenedSavedView();
                }
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
          <UiTooltip
            label={structuredSearchHold
              ? "Realtime is paused for this structured query. Press Enter to search."
              : `${searchTriggerModeName(searchTriggerMode)} search. Click for ${searchTriggerModeName(nextTriggerMode)}.`}
          >
            <UiIconButton
              type="button"
              className="search-trigger-button"
              variant="default"
              aria-label={searchTriggerAriaLabel}
              data-mode={searchTriggerMode}
              disabled={searchTriggerUpdating}
              data-structured-hold={structuredSearchHold ? "true" : undefined}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                cycleSearchTriggerMode();
                window.setTimeout(() => searchRef.current?.focus(), 0);
              }}
            >
              {searchTriggerMode === "realtime" ? (
                <Radio size={15} strokeWidth={2.3} aria-hidden="true" />
              ) : (
                <CornerDownLeft size={15} strokeWidth={2.3} aria-hidden="true" />
              )}
            </UiIconButton>
          </UiTooltip>
          <UiTooltip label="Search and AI help">
            <UiIconButton
              type="button"
              className="search-help-button"
              variant="default"
              aria-label="Open search and AI help"
              aria-expanded={searchHelpOpen}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => setSearchHelpOpen(true)}
            >
              <CircleHelp size={15} strokeWidth={2.3} aria-hidden="true" />
            </UiIconButton>
          </UiTooltip>
          {showApplyAction ? (
            <UiButton
              type="button"
              className="composer-run-button"
              variant="filled"
              aria-label={aiComposerMode ? "Search" : "Apply search"}
              disabled={scenarioCommandQuery !== null || historyPending || aiPlanning || (historyMatchesQuery && !aiDraftActive)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={runSearchNow}
            >
              {aiComposerMode ? "Search" : "Apply"}
            </UiButton>
          ) : null}
          <UiBadge
            className={`search-status${isFilteringHistory || aiPlanning ? " is-loading" : ""}`}
            variant="default"
            title="Result count"
            aria-live="polite"
            data-filter-status={historyError ? "error" : historyMatchesQuery ? "applied" : searchState.filterStatus}
            leftSection={isFilteringHistory || aiPlanning ? <LoadingSpinner /> : null}
          >
            <span className="status-text">{searchStatus}</span>
          </UiBadge>
          <Menu
            withinPortal
            position="bottom-end"
            width={280}
            opened={pickerMenuOpen}
            onChange={(opened) => {
              setPickerMenuOpen(opened);
              if (!opened) {
                setPickerMenuView("actions");
              }
              if (opened && !scenariosLoaded && !scenarioSwitcherLoading) {
                void reloadScenarios();
              }
            }}
          >
            <Menu.Target>
              <UiIconButton
                type="button"
                className="picker-menu-button"
                variant="default"
                aria-label="Open picker menu"
                aria-expanded={pickerMenuOpen}
                onMouseDown={(event) => event.preventDefault()}
              >
                <MoreVertical size={16} strokeWidth={2.4} aria-hidden="true" />
              </UiIconButton>
            </Menu.Target>
            <Menu.Dropdown className="picker-menu-dropdown" aria-label="Picker menu">
              {pickerMenuView === "actions" ? (
                <>
              <Menu.Label>Picker actions</Menu.Label>
              <Menu.Item
                leftSection={<Plus size={14} strokeWidth={2.2} />}
                rightSection={<ShortcutBadge shortcut="Ctrl+N" className="menu-shortcut-badge" />}
                onClick={() => {
                  setPickerMenuOpen(false);
                  beginCreateItem();
                }}
              >
                New item
              </Menu.Item>
              <Menu.Item
                leftSection={<Command size={14} strokeWidth={2.2} />}
                rightSection={<ShortcutBadge shortcut="F6" className="menu-shortcut-badge" />}
                onClick={() => {
                  setPickerMenuOpen(false);
                  openActionPicker();
                }}
              >
                Quick Actions
              </Menu.Item>
              <Menu.Item
                leftSection={<Command size={14} strokeWidth={2.2} />}
                rightSection={<ShortcutBadge shortcut="Ctrl+K" className="menu-shortcut-badge" />}
                onClick={() => {
                  setPickerMenuOpen(false);
                  openCommandPalette();
                }}
              >
                Commands
              </Menu.Item>
              <Menu.Item
                leftSection={<Sparkles size={14} strokeWidth={2.2} />}
                rightSection={<ShortcutBadge shortcut="Ctrl+I" className="menu-shortcut-badge" />}
                onClick={() => {
                  setPickerMenuOpen(false);
                  if (!aiComposerMode) {
                    leaveOpenedSavedView();
                  }
                  setAiComposerMode((current) => !current);
                  setSearchInterpretation(null);
                  window.setTimeout(() => searchRef.current?.focus(), 0);
                }}
              >
                {aiComposerMode ? "Switch to Search mode" : "Switch to AI mode"}
              </Menu.Item>
              <Menu.Item
                leftSection={searchTriggerMode === "realtime" ? <Radio size={14} strokeWidth={2.2} /> : <CornerDownLeft size={14} strokeWidth={2.2} />}
                disabled={searchTriggerUpdating}
                onClick={() => {
                  setPickerMenuOpen(false);
                  cycleSearchTriggerMode();
                  window.setTimeout(() => searchRef.current?.focus(), 0);
                }}
              >
                {searchTriggerAriaLabel}
              </Menu.Item>
              <Menu.Divider />
                  <Menu.Item
                    closeMenuOnClick={false}
                    leftSection={<Bookmark size={14} strokeWidth={2.2} />}
                    onClick={() => setPickerMenuView("organize")}
                  >
                    Organize
                  </Menu.Item>
                  <Menu.Divider />
                  <Menu.Item
                    leftSection={<CircleHelp size={14} strokeWidth={2.2} />}
                    onClick={() => {
                      setPickerMenuOpen(false);
                      setSearchHelpOpen(true);
                    }}
                  >
                    Search help
                  </Menu.Item>
                  <Menu.Item
                    leftSection={<Settings2 size={14} strokeWidth={2.2} />}
                    rightSection={<ShortcutBadge shortcut={settings.picker.settingsShortcut} className="menu-shortcut-badge" />}
                    onClick={() => {
                      setPickerMenuOpen(false);
                      openSettingsPanel();
                    }}
                  >
                    Settings
                  </Menu.Item>
                </>
              ) : (
                <>
                  <Menu.Label>Organize</Menu.Label>
                  <Menu.Item
                    closeMenuOnClick={false}
                    leftSection={<ArrowLeft size={14} strokeWidth={2.2} />}
                    onClick={() => setPickerMenuView("actions")}
                  >
                    Back to picker actions
                  </Menu.Item>
                  <Menu.Divider />
                  <Menu.Item
                    leftSection={<Bookmark size={14} strokeWidth={2.2} />}
                    onClick={() => {
                      setPickerMenuOpen(false);
                      openPaletteNavigation({
                        id: "history.inbox",
                        kind: "navigation",
                        group: "History",
                        title: "Inbox",
                        description: "Browse clips waiting to be cataloged.",
                        query: "is:inbox",
                        savedView: null,
                      });
                    }}
                  >
                    Inbox
                  </Menu.Item>
                  <Menu.Item
                    leftSection={<Search size={14} strokeWidth={2.2} />}
                    onClick={() => {
                      setPickerMenuOpen(false);
                      openCommandPalette();
                      setCommandPalette({ query: "saved searches", activeIndex: 0 });
                    }}
                  >
                    Saved searches…
                  </Menu.Item>
                  <Menu.Item
                    leftSection={<Plus size={14} strokeWidth={2.2} />}
                    onClick={() => {
                      setPickerMenuOpen(false);
                      setSavedViewCreatorOpen(true);
                    }}
                  >
                    Save current search
                  </Menu.Item>
                  <Menu.Divider />
                  <Menu.Label>
                    {activeScenarioSession
                      ? `Capture mode: ${activeScenarioSession.scenarioName}`
                      : "Capture modes"}
                  </Menu.Label>
                  {scenarioSwitcherLoading ? <Menu.Item disabled>Loading capture modes…</Menu.Item> : null}
                  {!scenarioSwitcherLoading && scenarios.length === 0 ? <Menu.Item disabled>No capture modes yet</Menu.Item> : null}
                  {!scenarioSwitcherLoading ? scenarios.map((scenario) => {
                    const active = activeScenarioSession?.scenarioId === scenario.id;
                    return (
                      <Menu.Item
                        key={scenario.id}
                        leftSection={active ? <Check size={14} strokeWidth={2.4} /> : <Radio size={14} strokeWidth={2.1} />}
                        className={active ? "is-active" : undefined}
                        disabled={active || activeScenarioBusy}
                        onClick={() => void activateScenarioFromPicker(scenario.id)}
                      >
                        <span className="scenario-menu-item">
                          <strong>{scenario.name}</strong>
                          <small>{scenario.query || "All history"}</small>
                        </span>
                      </Menu.Item>
                    );
                  }) : null}
                  {activeScenarioSession ? (
                    <Menu.Item
                      leftSection={<Square size={14} strokeWidth={2.2} />}
                      disabled={activeScenarioBusy}
                      onClick={() => {
                        setPickerMenuOpen(false);
                        void stopCurrentScenario();
                      }}
                    >
                      Stop capture mode
                    </Menu.Item>
                  ) : null}
                  <Menu.Item
                    leftSection={<Plus size={14} strokeWidth={2.2} />}
                    onClick={() => {
                      setPickerMenuOpen(false);
                      setScenarioSwitcherOpen(true);
                    }}
                  >
                    Create capture mode
                  </Menu.Item>
                  <Menu.Item
                    leftSection={<Settings2 size={14} strokeWidth={2.2} />}
                    onClick={() => {
                      setPickerMenuOpen(false);
                      void openScenarioSettings().catch((error) => {
                        pushToast({ title: "Could not open capture mode settings", message: String(error), tone: "danger" });
                      });
                    }}
                  >
                    Manage capture modes
                  </Menu.Item>
                  <Menu.Divider />
                  <Menu.Item
                    leftSection={<Tags size={14} strokeWidth={2.2} />}
                    onClick={() => {
                      setPickerMenuOpen(false);
                      void openTagsSettings().catch((error) => {
                        pushToast({ title: "Could not open tag settings", message: String(error), tone: "danger" });
                      });
                    }}
                  >
                    Tags
                  </Menu.Item>
                </>
              )}
            </Menu.Dropdown>
          </Menu>
        </div>

        {findState?.active ? (
          <FindBar
            needle={findState.needle}
            total={findState.total}
            currentOrdinal={findState.currentOrdinal}
            status={findState.status}
            error={findState.error}
            inputRef={findInputRef}
            onChange={handleFindInputChange}
            onKeyDown={handleFindInputKeyDown}
            onPrevious={() => void navigateFind("previous")}
            onNext={() => void navigateFind("next")}
            onRetry={retryFind}
            onClose={() => void closeFind()}
          />
        ) : null}

        {hasActivePickerContext || hasSearchContext ? (
          <PickerContextStrip>
        {activeScenarioSession ? (
          <div
            className="scenario-session-bar"
            aria-live="polite"
            data-testid="scenario-session-bar"
          >
            <Radio size={14} strokeWidth={2.3} aria-hidden="true" />
            <div className="scenario-session-copy">
              <strong>Capture mode active</strong>
              <span>{activeScenarioSession.scenarioName}</span>
              <span className="scenario-session-metadata">
                {[
                  ...activeScenarioSession.properties.client.map((value) => `client:${value}`),
                  ...activeScenarioSession.properties.project.map((value) => `project:${value}`),
                  ...activeScenarioSession.properties.activity.map((value) => `activity:${value}`),
                  ...activeScenarioSession.tags.map((tag) => `#${tag}`),
                ].join(" · ")}
              </span>
            </div>
            <UiButton
              type="button"
              variant="default"
              loading={activeScenarioBusy}
              onClick={() => void stopCurrentScenario()}
            >
              Stop
            </UiButton>
          </div>
        ) : null}

        {openedSavedView ? (
          <div
            className="saved-view-bar"
            aria-live="polite"
            data-testid="saved-view-bar"
          >
            <Bookmark size={14} strokeWidth={2.3} aria-hidden="true" />
            <div className="saved-view-copy">
              <strong>Saved search</strong>
              <span>{openedSavedView.title}</span>
              <span className="saved-view-query">{openedSavedView.query || "All history"}</span>
            </div>
            <UiButton
              type="button"
              variant="default"
              aria-label={`Exit saved search ${openedSavedView.title}`}
              onClick={() => {
                leaveOpenedSavedView();
                window.setTimeout(() => searchRef.current?.focus(), 0);
              }}
            >
              Exit view
            </UiButton>
          </div>
        ) : null}

        {structuredSearchFeedback && !historyError ? (
          <div
            className="search-draft-feedback"
            role="status"
            aria-live="polite"
            data-testid="structured-search-feedback"
          >
            <strong>{structuredSearchFeedback}</strong>
            <span>The applied results stay visible until the filter is valid.</span>
          </div>
        ) : null}

        {visibleSearchInterpretation ? (
          <div className="search-interpretation" aria-live="polite">
            <span className="search-interpretation-label">
              {visibleSearchInterpretation.mode === "ai" ? "AI interpreted" : "Interpreted"}
            </span>
            <span className="search-interpretation-query">{visibleSearchInterpretation.query}</span>
            {visibleSearchInterpretation.chips.map((chip) => (
              <button
                key={`${chip.label}:${chip.queryWithoutClause}`}
                type="button"
                className="search-interpretation-chip"
                aria-label={`Remove filter ${chip.label}`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => removeSearchChip(chip)}
              >
                <span>{chip.label}</span>
                <X size={12} strokeWidth={2.5} aria-hidden="true" />
              </button>
            ))}
            {visibleSearchInterpretation.explanation ? (
              <span className="search-interpretation-detail">{visibleSearchInterpretation.explanation}</span>
            ) : null}
            {visibleSearchInterpretation.diagnostics.map((diagnostic) => (
              <span
                key={`${diagnostic.code}:${diagnostic.message}`}
                className={`search-interpretation-diagnostic is-${diagnostic.severity}`}
              >
                {diagnostic.message}
              </span>
            ))}
            {visibleSearchInterpretation.warnings.map((warning) => (
              <span key={warning} className="search-interpretation-warning">
                {warning}
              </span>
            ))}
          </div>
        ) : null}
          </PickerContextStrip>
        ) : null}

        {savedViewCreatorOpen ? (
          <SavedViewCreator
            currentQuery={scenarioCommandQuery !== null ? historyInputQuery : query.trim()}
            busy={savedViewCreatorBusy}
            onClose={() => {
              setSavedViewCreatorOpen(false);
              focusSearch();
            }}
            onCreate={createSavedViewFromPicker}
          />
        ) : null}

        {scenarioSwitcherOpen ? (
          <ScenarioCreator
            availableTags={paletteTags}
            currentQuery={scenarioCommandQuery !== null ? historyInputQuery : query.trim()}
            busy={activeScenarioBusy}
            onClose={() => {
              setScenarioSwitcherOpen(false);
              focusSearch();
            }}
            onCreate={createScenarioFromPicker}
          />
        ) : null}

        {searchHelpOpen ? (
          <SearchHelpDialog onClose={() => {
            setSearchHelpOpen(false);
            focusSearch();
          }} />
        ) : null}

        {selectedItems.length > 0 ? (
          <PickerSelectionBar ariaLabel={`${selectedItems.length} selected`}>
            <strong>{selectedItems.length} selected</strong>
            <div className="selection-action-buttons">
              <UiButton type="button" size="xs" variant="subtle" onClick={() => void beginTagEdit(selectedItems)}>
                <Tags size={13} strokeWidth={2.2} aria-hidden="true" />
                <span>Tags</span>
              </UiButton>
              <UiButton type="button" size="xs" variant="subtle" onClick={() => beginBatchMetadataEdit(selectedItems)}>
                <Pencil size={13} strokeWidth={2.2} aria-hidden="true" />
                <span>Metadata</span>
              </UiButton>
              <UiButton type="button" size="xs" variant="subtle" onClick={openActionPicker}>
                <Command size={13} strokeWidth={2.2} aria-hidden="true" />
                <span>Actions</span>
              </UiButton>
              <UiButton type="button" size="xs" color="red" variant="subtle" onClick={() => void deleteItems(selectedItems)}>
                <Trash2 size={13} strokeWidth={2.2} aria-hidden="true" />
                <span>Delete</span>
              </UiButton>
              <UiButton
                type="button"
                size="xs"
                variant="subtle"
                onClick={() => {
                  const emptySelection = new Set<number>();
                  selectedIdsRef.current = emptySelection;
                  setSelectedIds(emptySelection);
                  selectionAnchorItemIdRef.current = selectedItemIdRef.current;
                  focusSearch();
                }}
              >
                <X size={13} strokeWidth={2.2} aria-hidden="true" />
                <span>Clear</span>
              </UiButton>
            </div>
          </PickerSelectionBar>
        ) : null}

        {historyError ? (
          <UiAlert className="error-text" color="red" variant="light" role="alert" aria-live="assertive">
            <span>{historyErrorCopy} {historyError}</span>
            <UiButton
              type="button"
              size="compact-xs"
              variant="subtle"
              onClick={() => void retryFailedSearch()}
            >
              Retry
            </UiButton>
          </UiAlert>
        ) : null}
        {actionError ? <UiAlert className="error-text" color="red" variant="light" role="alert" aria-live="assertive">{actionError}</UiAlert> : null}

        <PickerStatusAnnouncer>
          {selectionAnnouncement}
          {findState?.active && findState.total > 0 && findState.currentOrdinal !== null
            ? ` Find ${findState.currentOrdinal} of ${findState.total}${findState.currentTarget ? ` in ${findState.currentTarget.field}.` : "."}`
            : findState?.active && findState.status === "empty"
              ? " Find has no matches in these results."
              : ""}
        </PickerStatusAnnouncer>
        </PickerHeader>

        <PickerFeed>
          <div ref={historyScrollRef} className="history-feed-scroll">
            <ol
              id="clipboard-feed"
              className={`history-feed${displayedHistory.length > 0 ? " has-items" : ""}`}
              aria-label="Clipboard history results"
              style={displayedHistory.length > 0 ? { height: `${rowVirtualizer.getTotalSize()}px` } : undefined}
            >
            {displayedHistory.length === 0 ? (
              <li className="empty-history">
                {historyError ? (
                  <span className="empty-loading" role="status" aria-live="polite">
                    <span>{historyErrorCopy} {historyError}</span>
                  </span>
                ) : feedLoading ? (
                  historyLoadingDelayed ? (
                    <span className="empty-loading history-skeleton-state" role="status" aria-live="polite">
                      <span className="history-skeleton" aria-hidden="true">
                        {Array.from({ length: 4 }, (_, skeletonIndex) => (
                          <span className="history-skeleton-row" key={skeletonIndex}>
                            <span className="history-skeleton-selection" />
                            <span className="history-skeleton-mark" />
                            <span className="history-skeleton-copy">
                              <span className="history-skeleton-line is-meta" />
                              <span className="history-skeleton-line" />
                              <span className="history-skeleton-line is-short" />
                            </span>
                            <span className="history-skeleton-menu" />
                          </span>
                        ))}
                      </span>
                      <span>{searchStatus}</span>
                    </span>
                  ) : (
                    <span className="empty-loading" role="status" aria-live="polite">
                      <span>{searchStatus}</span>
                    </span>
                  )
                ) : !historyMatchesQuery
                  ? "Finish the current filter to update results."
                  : query.trim()
                    ? "No clips match this search. Edit Search or clear the filter."
                    : "No clips yet. Copy something to populate Copicu."}
              </li>
            ) : (
              virtualRows.map((virtualRow) => {
                const item = displayedHistory[virtualRow.index];
                const index = virtualRow.index;
                if (!item) {
                  return (
                    <li
                      key={`history-loader-${virtualRow.index}`}
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

                const itemIsSelected = item.id === selectedItemId;
                const itemIsMultiSelected = selectedIds.has(item.id);
                const itemFindMatches = findState?.active ? findMatches.get(item.id) : undefined;
                const itemIsFindTarget = findState?.active && findRevealItemId === item.id;
                const itemIsRemoteFindTarget = remoteFindItemId === item.id;
                const itemDeleteTargets = itemIsMultiSelected && selectedIds.size > 0
                  ? effectiveSelection
                  : [item];
                const imageWidth = typeof item.width === "number"
                  && Number.isInteger(item.width)
                  && item.width > 0
                  && typeof item.height === "number"
                  && Number.isInteger(item.height)
                  && item.height > 0
                  ? item.width
                  : undefined;
                const imageHeight = typeof item.height === "number"
                  && Number.isInteger(item.height)
                  && item.height > 0
                  && typeof item.width === "number"
                  && Number.isInteger(item.width)
                  && item.width > 0
                  ? item.height
                  : undefined;

                return (
                  <li
                  key={item.id}
                  id={`history-item-${item.id}`}
                  data-index={virtualRow.index}
                  aria-posinset={itemIsRemoteFindTarget ? undefined : index + 1}
                  aria-setsize={itemIsRemoteFindTarget ? undefined : (historyAriaSetSize ?? undefined)}
                  ref={rowVirtualizer.measureElement}
                  style={{
                    transform: `translateY(${Math.ceil(virtualRow.start) + (virtualRow.index > 0 ? 1 : 0)}px)`,
                  }}
                >
                  <UiCheckbox
                    className="item-selection-button"
                    checked={itemIsMultiSelected}
                    aria-label={itemIsMultiSelected ? "Deselect item" : "Select item"}
                    onMouseDown={(event) => event.stopPropagation()}
                    onClick={(event) => event.stopPropagation()}
                    onChange={(event) => {
                      event.stopPropagation();
                      selectionInteractionSeqRef.current += 1;
                      const nextSelection = new Set(selectedIdsRef.current);
                      if (event.currentTarget.checked) {
                        nextSelection.add(item.id);
                      } else {
                        nextSelection.delete(item.id);
                      }
                      selectedIdsRef.current = nextSelection;
                      setSelectedIds(nextSelection);
                      selectedItemIdRef.current = item.id;
                      setSelectedItemId(item.id);
                      selectionAnchorItemIdRef.current = item.id;
                      focusSearch();
                    }}
                  />
                  <UiIconButton
                    type="button"
                    className={`item-mark-button${item.is_marked ? " is-marked" : ""}`}
                    aria-label={item.is_marked ? "Unmark item" : "Mark item"}
                    variant="subtle"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                    }}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      void toggleItemMarked(item).then(focusSearch);
                    }}
                  >
                    <Flag
                      size={14}
                      strokeWidth={2.1}
                      fill={item.is_marked ? "currentColor" : "none"}
                      aria-hidden="true"
                    />
                  </UiIconButton>
                  {item.is_inbox ? (
                    <UiUnstyledButton
                      type="button"
                      className="item-inbox-indicator"
                      aria-label="Remove from Inbox"
                      onMouseDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                      }}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        void removeFromInbox(item);
                      }}
                    >
                      <span>Inbox</span>
                      <X size={11} strokeWidth={2.5} aria-hidden="true" />
                    </UiUnstyledButton>
                  ) : null}
                  <div
                    className={`feed-item${itemIsSelected ? " is-selected" : ""}${
                      itemIsMultiSelected ? " is-multi-selected" : ""
                    }${
                      item.content_kind === "image" ? " is-image" : ""
                    }${item.is_inbox ? " is-inbox" : ""}${itemIsFindTarget ? " has-find-target" : ""}`}
                    role="button"
                    tabIndex={-1}
                    aria-current={itemIsSelected ? "true" : undefined}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={(event) => {
                      const imageWasClicked = event.target instanceof Element
                        && Boolean(event.target.closest(".image-preview, .markdown-image-frame"));
                      if (event.shiftKey) {
                        setRangeSelection(index);
                      } else if (event.ctrlKey || event.metaKey) {
                        selectionInteractionSeqRef.current += 1;
                        const previousActiveItemId = selectedItemIdRef.current;
                        const nextSelectedIds = new Set(selectedIdsRef.current);
                        if (
                          nextSelectedIds.size === 0
                          && previousActiveItemId !== null
                        ) {
                          nextSelectedIds.add(previousActiveItemId);
                        }
                        if (nextSelectedIds.has(item.id)) {
                          nextSelectedIds.delete(item.id);
                        } else {
                          nextSelectedIds.add(item.id);
                        }
                        selectedItemIdRef.current = item.id;
                        setSelectedItemId(item.id);
                        selectedIdsRef.current = nextSelectedIds;
                        setSelectedIds(nextSelectedIds);
                        selectionAnchorItemIdRef.current = item.id;
                      } else {
                        setSingleSelection(index);
                      }
                      setActionError(null);
                      setOpenItemMenu(null);
                      setOpenMarkMenu(null);
                      focusSearch();
                      if (imageWasClicked) {
                        void openItemPreview(item.id).catch((previewError) => {
                          setActionError(String(previewError));
                        });
                      }
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
                      {item.title ? (
                        <FindHighlightedText
                          matches={findFieldMatches(itemFindMatches?.fields, "title")}
                          currentOrdinal={findState?.currentOrdinal ?? null}
                          className="item-title"
                          fallback={<span className="item-title">{item.title}</span>}
                        />
                      ) : null}
                      {item.tags || metadataNotesPreview(item.notes, item.tags) ? (
                        <span className="item-metadata">
                          {item.tags ? (
                            <FindHighlightedText
                              matches={findFieldMatches(itemFindMatches?.fields, "tag")}
                              currentOrdinal={findState?.currentOrdinal ?? null}
                              fallback={<span>{item.tags}</span>}
                            />
                          ) : null}
                          {metadataNotesPreview(item.notes, item.tags) ? (
                            <FindHighlightedText
                              matches={findFieldMatches(itemFindMatches?.fields, "notes")}
                              currentOrdinal={findState?.currentOrdinal ?? null}
                              fallback={<span>{metadataNotesPreview(item.notes, item.tags)}</span>}
                            />
                          ) : null}
                        </span>
                      ) : null}
                    </span>
                    {inlineEditDraft?.id === item.id ? (
                      <div
                        className="inline-item-editor"
                        onMouseDown={(event) => event.stopPropagation()}
                        onClick={(event) => event.stopPropagation()}
                      >
                        <textarea
                          ref={inlineEditTextRef}
                          aria-label={`Quick edit item ${item.id}`}
                          value={inlineEditDraft.text}
                          disabled={inlineEditSaving}
                          onChange={(event) => {
                            const text = event.currentTarget.value;
                            setInlineEditDraft((draft) => draft ? { ...draft, text } : draft);
                          }}
                          onKeyDown={(event) => {
                            event.stopPropagation();
                            if (event.key === "F2") {
                              event.preventDefault();
                              if (event.ctrlKey || event.metaKey) {
                                void openExternalEditor(item.id);
                              } else {
                                void beginEdit(item, "content");
                              }
                            } else if (event.key === "Escape") {
                              event.preventDefault();
                              cancelInlineEdit();
                            } else if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                              event.preventDefault();
                              void saveInlineEdit();
                            }
                          }}
                        />
                        {editError ? <span className="inline-item-editor-error">{editError}</span> : null}
                        <div className="inline-item-editor-footer">
                          <span><UiKbd>Ctrl Enter</UiKbd> save · <UiKbd>Esc</UiKbd> cancel</span>
                          <div>
                            <UiButton type="button" size="compact-xs" variant="subtle" disabled={inlineEditSaving} onClick={cancelInlineEdit}>
                              Cancel
                            </UiButton>
                            <UiButton type="button" size="compact-xs" variant="filled" loading={inlineEditSaving} onClick={() => void saveInlineEdit()}>
                              Save
                            </UiButton>
                          </div>
                        </div>
                      </div>
                    ) : item.content_kind === "image" && item.thumbnail_data_url ? (
                      <span className="image-preview" title="Open full preview">
                        <img
                          src={item.thumbnail_data_url}
                          alt=""
                          width={imageWidth}
                          height={imageHeight}
                          onLoad={measureImageRow}
                        />
                      </span>
                    ) : markdownImages(item.text).length > 0 ? (
                      <MarkdownPreview
                        text={item.text}
                        contentMatches={findFieldMatches(itemFindMatches?.fields, "content")}
                        imageAltMatches={findFieldMatches(itemFindMatches?.fields, "imageAlt")}
                        currentOrdinal={findState?.currentOrdinal ?? null}
                        onImageLoad={measureImageRow}
                      />
                    ) : (
                      <TextPreview
                        item={item}
                        expanded={expandedItemIds.has(item.id) || Boolean(itemIsFindTarget)}
                        findMatches={findFieldMatches(itemFindMatches?.fields, "content")}
                        currentOrdinal={findState?.currentOrdinal ?? null}
                        onToggle={() => void toggleTextPreview(item)}
                        onLayoutChange={() => mutateRowLayout(item.id, () => undefined)}
                      />
                    )}
                  </div>
                  <UiIconButton
                    type="button"
                    className="item-delete-button"
                    aria-label={itemDeleteTargets.length > 1 ? `Delete ${itemDeleteTargets.length} selected items` : "Delete item"}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                    }}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      void deleteItems(itemDeleteTargets);
                    }}
                  >
                    <Trash2 size={14} strokeWidth={2.3} aria-hidden="true" />
                  </UiIconButton>
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
                    <MoreVertical size={15} strokeWidth={2.4} aria-hidden="true" />
                  </UiIconButton>
                  {openItemMenu?.itemId === item.id ? createPortal(
                    <div
                      className="item-menu"
                      role="menu"
                      aria-label="Item actions"
                      ref={itemMenuRef}
                      style={{ left: openItemMenu.x, top: openItemMenu.y }}
                      onKeyDown={(event) => {
                        const menuItems = Array.from(
                          itemMenuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)') ?? [],
                        );
                        if (event.key === "Escape") {
                          event.preventDefault();
                          const returnTarget = itemMenuReturnFocusRef.current;
                          setOpenItemMenu(null);
                          window.setTimeout(() => {
                            if (returnTarget?.isConnected) {
                              returnTarget.focus();
                            } else {
                              searchRef.current?.focus();
                            }
                          }, 0);
                          return;
                        }
                        if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key) || menuItems.length === 0) {
                          return;
                        }
                        event.preventDefault();
                        const currentIndex = menuItems.indexOf(document.activeElement as HTMLElement);
                        const nextIndex = event.key === "Home"
                          ? 0
                          : event.key === "End"
                            ? menuItems.length - 1
                            : event.key === "ArrowDown"
                              ? (currentIndex + 1 + menuItems.length) % menuItems.length
                              : (currentIndex - 1 + menuItems.length) % menuItems.length;
                        menuItems[nextIndex]?.focus();
                      }}
                    >
                      {hasExplicitSelection ? (
                        <div className="item-menu-group" role="group" aria-label="Principal">
                          <span className="item-menu-group-label">Principal</span>
                          {renderBatchItemActions({
                            items: effectiveSelection,
                            noun: "selected",
                            onClear: () => {
                              setOpenItemMenu(null);
                              setSingleSelection(index);
                              focusSearch();
                            },
                          })}
                        </div>
                      ) : (
                        <>
                          <div className="item-menu-group" role="group" aria-label="Principal">
                            <span className="item-menu-group-label">Principal</span>
                          <UiUnstyledButton
                            type="button"
                            role="menuitem"
                            tabIndex={-1}
                            className="item-menu-action"
                            onClick={() => void activateItem(item, COPY_AND_HIDE_ACTIVATION)}
                          >
                            <ClipboardCheck size={14} strokeWidth={2.2} aria-hidden="true" />
                            <span>Activate</span>
                          </UiUnstyledButton>
                          <UiUnstyledButton
                            type="button"
                            role="menuitem"
                            tabIndex={-1}
                            className="item-menu-action"
                            onClick={() => void activateItem(item, PASTE_AND_HIDE_ACTIVATION)}
                          >
                            <ClipboardPaste size={14} strokeWidth={2.2} aria-hidden="true" />
                            <span>Paste</span>
                          </UiUnstyledButton>
                          {actionRunnableForTrigger(
                            actionById.get(BUILTIN_ACTIONS.pastePlain) ?? NULL_ACTION,
                            "itemMenu",
                            [item],
                          ) ? (
                            <UiUnstyledButton
                              type="button"
                              role="menuitem"
                              tabIndex={-1}
                              className="item-menu-action"
                              onClick={() => void runBuiltinAction(BUILTIN_ACTIONS.pastePlain, [item])}
                            >
                              <Command size={14} strokeWidth={2.2} aria-hidden="true" />
                              <span>Paste plain</span>
                            </UiUnstyledButton>
                          ) : null}
                          {actionRunnableForTrigger(
                            actionById.get(BUILTIN_ACTIONS.openUrl) ?? NULL_ACTION,
                            "itemMenu",
                            [item],
                          ) ? (
                            <UiUnstyledButton
                              type="button"
                              role="menuitem"
                              tabIndex={-1}
                              className="item-menu-action"
                              onClick={() => void runBuiltinAction(BUILTIN_ACTIONS.openUrl, [item])}
                            >
                              <Command size={14} strokeWidth={2.2} aria-hidden="true" />
                              <span>Open URL</span>
                            </UiUnstyledButton>
                          ) : null}
                          </div>
                          <div className="item-menu-group" role="group" aria-label="Editar">
                            <span className="item-menu-group-label">Editar</span>
                          {item.content_kind === "text" ? (
                            <>
                              <UiUnstyledButton
                                type="button"
                                role="menuitem"
                                tabIndex={-1}
                                className="item-menu-action"
                                onClick={() => void beginInlineEdit(item)}
                              >
                                <Pencil size={14} strokeWidth={2.2} aria-hidden="true" />
                                <span>Quick edit</span>
                              </UiUnstyledButton>
                              <UiUnstyledButton
                                type="button"
                                role="menuitem"
                                tabIndex={-1}
                                className="item-menu-action"
                                onClick={() => void beginEdit(item, "content")}
                              >
                                <FileCode2 size={14} strokeWidth={2.2} aria-hidden="true" />
                                <span>Open full editor</span>
                                <ShortcutBadge shortcut="F2" />
                              </UiUnstyledButton>
                              <UiUnstyledButton
                                type="button"
                                role="menuitem"
                                tabIndex={-1}
                                className="item-menu-action"
                                onClick={() => void openExternalEditor(item.id)}
                              >
                                <FileCode2 size={14} strokeWidth={2.2} aria-hidden="true" />
                                <span>Edit externally</span>
                                <ShortcutBadge shortcut="Ctrl+F2" />
                              </UiUnstyledButton>
                            </>
                          ) : null}
                          {item.is_inbox ? (
                            <>
                              <UiUnstyledButton
                                type="button"
                                role="menuitem"
                                tabIndex={-1}
                                className="item-menu-action"
                                onClick={() => catalogItem(item)}
                              >
                                <Bookmark size={14} strokeWidth={2.2} aria-hidden="true" />
                                <span>Catalog Inbox item</span>
                              </UiUnstyledButton>
                              <UiUnstyledButton
                                type="button"
                                role="menuitem"
                                tabIndex={-1}
                                className="item-menu-action"
                                onClick={() => void removeFromInbox(item)}
                              >
                                <X size={14} strokeWidth={2.2} aria-hidden="true" />
                                <span>Remove from Inbox</span>
                              </UiUnstyledButton>
                            </>
                          ) : null}
                          <UiUnstyledButton
                            type="button"
                            role="menuitem"
                            tabIndex={-1}
                            className="item-menu-action"
                            onClick={() => void beginTagEdit([item])}
                          >
                            <Tags size={14} strokeWidth={2.2} aria-hidden="true" />
                            <span>Edit tags</span>
                            <ShortcutBadge shortcut={TAG_EDIT_SHORTCUT} />
                          </UiUnstyledButton>
                          <UiUnstyledButton
                            type="button"
                            role="menuitem"
                            tabIndex={-1}
                            className="item-menu-action"
                            onClick={() => void beginEdit(item, "metadata")}
                          >
                            <Pencil size={14} strokeWidth={2.2} aria-hidden="true" />
                            <span>Edit metadata</span>
                            <ShortcutBadge shortcut="Shift+F2" />
                          </UiUnstyledButton>
                          </div>
                          <div className="item-menu-group" role="group" aria-label="Más">
                            <span className="item-menu-group-label">Más</span>
                          {itemMenuRegistryActions(actionDefinitions, [item], item).map((action) => (
                            <UiUnstyledButton
                              key={action.id}
                              type="button"
                              role="menuitem"
                              tabIndex={-1}
                              className="item-menu-action"
                              onClick={() => void runActionDefinition(action, [item], "itemMenu")}
                            >
                              {action.source === "script"
                                ? <FileCode2 size={14} strokeWidth={2.2} aria-hidden="true" />
                                : <Command size={14} strokeWidth={2.2} aria-hidden="true" />}
                              <span>{action.title}</span>
                              <ShortcutBadge shortcut={normalizeShortcutString(action.shortcut)} />
                            </UiUnstyledButton>
                          ))}
                          <UiUnstyledButton
                            type="button"
                            role="menuitem"
                            tabIndex={-1}
                            className="item-menu-action"
                            onClick={() => {
                              setOpenItemMenu(null);
                              void openItemPreview(item.id).catch((previewError) => {
                                setActionError(String(previewError));
                              });
                            }}
                          >
                            <Search size={14} strokeWidth={2.2} aria-hidden="true" />
                            <span>Preview</span>
                            <ShortcutBadge shortcut={settings.picker.previewShortcut} />
                          </UiUnstyledButton>
                          </div>
                        </>
                      )}
                    </div>,
                    document.body,
                  ) : null}
                  </li>
                );
              })
            )}
            </ol>
          </div>
        </PickerFeed>
        {commandPalette ? (
          <CommandPalette
            query={commandPalette.query}
            activeIndex={commandPalette.activeIndex}
            entries={commandPaletteEntries}
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
            onRun={(entry) => {
              if (entry.kind === "navigation") {
                openPaletteNavigation(entry);
                return;
              }
              if (entry.action.id === BUILTIN_ACTIONS.newItem) {
                beginCreateItem();
                return;
              }
              void runActionDefinition(entry.action, effectiveSelection, "commandPalette");
            }}
          />
        ) : null}
        {actionPicker ? (
          <ActionPicker
            query={actionPicker.query}
            activeIndex={actionPicker.activeIndex}
            entries={actionPickerEntries}
            onQueryChange={(nextQuery) =>
              setActionPicker((current) =>
                current ? { query: nextQuery, activeIndex: 0 } : current,
              )
            }
            onActiveIndexChange={(activeIndex) =>
              setActionPicker((current) =>
                current ? { ...current, activeIndex } : current,
              )
            }
            onCancel={() => {
              setActionPicker(null);
              focusSearch();
            }}
            onRun={(entry) => {
              const shortcut = entry.trigger === "localShortcut"
                ? normalizeShortcutString(entry.action.shortcut ?? "")
                : null;
              void runActionDefinition(entry.action, effectiveSelection, entry.trigger, shortcut);
            }}
          />
        ) : null}
        {tagEditorDraft ? (
          <TagEditor
            itemCount={tagEditorDraft.itemIds.length}
            mode={tagEditorDraft.mode}
            initialTags={tagEditorDraft.initialTags}
            availableTags={paletteTags}
            saving={tagEditorSaving}
            error={editError}
            onApply={(tags, removeTags) => void saveTagEditor(tags, removeTags)}
            onCancel={() => {
              setTagEditorDraft(null);
              setEditError(null);
              focusSearch();
            }}
          />
        ) : null}
        {createItemDraft ? (
          <div
            className="edit-backdrop"
            role="dialog"
            aria-modal="true"
            aria-label="Create new item"
          >
            <UiPaper
              component="form"
              className="edit-panel"
              onSubmit={(event) => {
                event.preventDefault();
                void saveCreateItem();
              }}
              onKeyDown={(event) => {
                if (event.defaultPrevented) {
                  return;
                }
                if (isSubmitShortcut(event)) {
                  event.preventDefault();
                  void saveCreateItem();
                }
              }}
            >
              <label>
                <span>Content</span>
                <UiTextarea
                  ref={editTextRef}
                  value={createItemDraft.text}
                  placeholder="Text, snippet, prompt, URL, command…"
                  onChange={(event) => {
                    const nextText = event.currentTarget.value;
                    setCreateItemDraft((draft) => draft ? { ...draft, text: nextText } : draft);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      event.preventDefault();
                      setCreateItemDraft(null);
                      focusSearch();
                    }
                    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                      event.preventDefault();
                      void saveCreateItem();
                    }
                  }}
                  autosize={false}
                />
              </label>
              <label>
                <span>Metadata</span>
                <UiTextarea
                  className="notes-input"
                  value={createItemDraft.metadata}
                  placeholder="#work&#10;Optional Markdown notes"
                  onChange={(event) => {
                    const nextMetadata = event.currentTarget.value;
                    setCreateItemDraft((draft) => draft ? { ...draft, metadata: nextMetadata } : draft);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      event.preventDefault();
                      setCreateItemDraft(null);
                      focusSearch();
                    }
                    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                      event.preventDefault();
                      void saveCreateItem();
                    }
                  }}
                  autosize={false}
                />
              </label>
              {editError ? <UiAlert className="error-text" color="red" variant="light">{editError}</UiAlert> : null}
              <div className="edit-buttons">
                <UiButton type="button" variant="default" onClick={() => {
                  setCreateItemDraft(null);
                  focusSearch();
                }}>
                  Cancel
                </UiButton>
                <UiButton
                  type="button"
                  variant="filled"
                  disabled={!createItemDraft.text.trim()}
                  onClick={() => void saveCreateItem()}
                >
                  Create
                </UiButton>
              </div>
            </UiPaper>
          </div>
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
              onKeyDown={(event) => {
                if (event.defaultPrevented) {
                  return;
                }
                if (isSubmitShortcut(event)) {
                  event.preventDefault();
                  void saveEdit();
                }
              }}
            >
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
                        catalogItemIdRef.current = null;
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
                  catalogItemIdRef.current = null;
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
              onKeyDown={(event) => {
                if (event.defaultPrevented) {
                  return;
                }
                if (isSubmitShortcut(event)) {
                  event.preventDefault();
                  void saveBatchMetadata();
                }
              }}
            >
              <div className="batch-metadata-editor">
                <span>Metadata for {batchMetadataDraft.ids.length} items</span>
                <UiSelect
                  className="batch-metadata-mode"
                  label="How to apply"
                  value={batchMetadataDraft.mode}
                  data={[
                    { value: "append", label: "Append: keep existing and add this text" },
                    { value: "replace", label: "Replace: overwrite metadata on every item" },
                    { value: "merge", label: "Smart merge: add only new lines/tags" },
                  ]}
                  onChange={(value) => {
                    if (value === "append" || value === "replace" || value === "merge") {
                      setBatchMetadataDraft({ ...batchMetadataDraft, mode: value });
                    }
                  }}
                />
                <div className="batch-metadata-existing" aria-live="polite">
                  <strong>Existing metadata</strong>
                  {batchMetadataDraft.hasMixedMetadata ? (
                    <span>Mixed values across selected items.</span>
                  ) : batchMetadataDraft.commonMetadata ? (
                    <pre>{batchMetadataDraft.commonMetadata}</pre>
                  ) : (
                    <span>Empty on all selected items.</span>
                  )}
                </div>
                <UiTextarea
                  ref={editTextRef}
                  className="notes-input"
                  aria-label={`Metadata for ${batchMetadataDraft.ids.length} items`}
                  value={batchMetadataDraft.metadata}
                  placeholder="#work&#10;Markdown notes to apply"
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
              </div>
              {editError ? <UiAlert className="error-text" color="red" variant="light">{editError}</UiAlert> : null}
              <div className="edit-buttons">
                <UiButton type="button" variant="default" onClick={() => {
                  setBatchMetadataDraft(null);
                  focusSearch();
                }}>
                  Cancel
                </UiButton>
                <UiButton type="submit" variant="filled">
                  {batchMetadataDraft.mode === "append"
                    ? "Append metadata"
                    : batchMetadataDraft.mode === "replace"
                      ? "Replace metadata"
                      : "Merge metadata"}
                </UiButton>
              </div>
            </UiPaper>
          </div>
        ) : null}
        </>
        )}
      </section>
      </CustomWindowFrame>
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </main>
  );
}

function SearchHelpDialog({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="search-help-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Search and AI help"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <UiPaper
        className="search-help-panel"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onClose();
          }
        }}
      >
        <header className="search-help-header">
          <div>
            <span>Search help</span>
            <strong>Find clips, metadata, context and AI results</strong>
          </div>
          <UiIconButton type="button" variant="subtle" aria-label="Close search help" onClick={onClose}>
            <X size={16} strokeWidth={2.4} aria-hidden="true" />
          </UiIconButton>
        </header>

        <div className="search-help-grid">
          <section>
            <h3>Text search</h3>
            <dl>
              <div><dt><code>sqlite migration</code></dt><dd>All terms must match.</dd></div>
              <div><dt><code>"exact phrase"</code></dt><dd>Keep words together.</dd></div>
              <div><dt><code>-draft</code></dt><dd>Exclude matching clips.</dd></div>
              <div><dt><code>re:^invoice-\d+$</code></dt><dd>Match a case-insensitive regular expression across searchable fields.</dd></div>
            </dl>
          </section>

          <section>
            <h3>Metadata</h3>
            <dl>
              <div><dt><code>meta:client</code></dt><dd>Visible metadata: title, notes and tags.</dd></div>
              <div><dt><code>title:invoice</code></dt><dd>Only editable title.</dd></div>
              <div><dt><code>notes:"paid"</code></dt><dd>Only editable notes.</dd></div>
              <div><dt><code>tag:work</code> / <code>#work</code></dt><dd>Tags.</dd></div>
            </dl>
          </section>

          <section>
            <h3>Clipboard facts</h3>
            <dl>
              <div><dt><code>kind:image</code></dt><dd>Text/image/html/file kind.</dd></div>
              <div><dt><code>mime:image/*</code></dt><dd>Primary MIME type.</dd></div>
              <div><dt><code>has:notes</code></dt><dd>Also: title, tags, metadata, mime, blob, image.</dd></div>
              <div><dt><code>is:marked</code></dt><dd>Also: checked, unmarked, unchecked, inbox, not-inbox.</dd></div>
            </dl>
          </section>

          <section>
            <h3>Capture context</h3>
            <dl>
              <div><dt><code>ctx:vivaldi</code></dt><dd>Any hidden capture context.</dd></div>
              <div><dt><code>app:code</code></dt><dd>Source app or executable path.</dd></div>
              <div><dt><code>window:github</code></dt><dd>Captured window title.</dd></div>
              <div><dt><code>domain:openai.com</code></dt><dd>Detected URL domain.</dd></div>
              <div><dt><code>format:html</code></dt><dd>Clipboard format.</dd></div>
            </dl>
          </section>

          <section>
            <h3>Dates</h3>
            <dl>
              <div><dt><code>after:today</code></dt><dd>Since start of today.</dd></div>
              <div><dt><code>after:7d</code></dt><dd>Recent relative range.</dd></div>
              <div><dt><code>before:2026-06-29</code></dt><dd>Before a day.</dd></div>
              <div><dt><code>on:2026-06-29</code></dt><dd>Only that day.</dd></div>
            </dl>
          </section>

          <section>
            <h3>AI search</h3>
            <dl>
              <div><dt><code>ai:find invoices from last week</code></dt><dd>Ask AI to translate intent into local search/actions.</dd></div>
              <div><dt><code>Ctrl+I</code></dt><dd>Toggle AI composer mode.</dd></div>
            </dl>
          </section>

          <section>
            <h3>Keyboard</h3>
            <dl>
              <div><dt><code>Search</code> / <code>Ctrl+Enter</code></dt><dd>Run the current query.</dd></div>
              <div><dt><code>Ctrl+Shift+C</code></dt><dd>Edit tags for the active clip or add tags to a selection.</dd></div>
              <div><dt><code>F2</code> / <code>Ctrl+F2</code> / <code>Shift+F2</code></dt><dd>Edit content, use the external editor, or edit metadata.</dd></div>
              <div><dt><code>Settings → Picker</code></dt><dd>Choose realtime, Enter, or button-triggered search.</dd></div>
            </dl>
          </section>
        </div>
      </UiPaper>
    </div>
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
  entries,
  onQueryChange,
  onActiveIndexChange,
  onCancel,
  onRun,
}: {
  query: string;
  activeIndex: number;
  entries: CommandPaletteEntry[];
  onQueryChange: (query: string) => void;
  onActiveIndexChange: (index: number) => void;
  onCancel: () => void;
  onRun: (entry: CommandPaletteEntry) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filteredEntries = entries.filter((entry) => {
    const searchText = entry.kind === "action"
      ? actionSearchText(entry.action)
      : [entry.title, entry.description, entry.group, entry.query].join(" ").toLocaleLowerCase();
    return searchText.includes(normalizedQuery);
  });
  const safeActiveIndex = filteredEntries.length === 0
    ? -1
    : clamp(activeIndex, 0, filteredEntries.length - 1);

  useEffect(() => {
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }, []);

  useEffect(() => {
    if (safeActiveIndex !== activeIndex) {
      onActiveIndexChange(Math.max(0, safeActiveIndex));
    }
  }, [activeIndex, onActiveIndexChange, safeActiveIndex]);

  const runActiveEntry = () => {
    const entry = filteredEntries[safeActiveIndex];
    if (entry) {
      onRun(entry);
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
            safeActiveIndex >= 0 ? `command-palette-entry-${filteredEntries[safeActiveIndex].id}` : undefined
          }
          value={query}
          placeholder="Search history, views, tags, and actions"
          onChange={(event) => onQueryChange(event.currentTarget.value)}
          onKeyDown={(event) => {
            switch (event.key) {
              case "Escape":
                event.preventDefault();
                onCancel();
                break;
              case "ArrowDown":
                event.preventDefault();
                if (filteredEntries.length > 0) {
                  onActiveIndexChange((safeActiveIndex + 1) % filteredEntries.length);
                }
                break;
              case "ArrowUp":
                event.preventDefault();
                if (filteredEntries.length > 0) {
                  onActiveIndexChange(
                    (safeActiveIndex - 1 + filteredEntries.length) % filteredEntries.length,
                  );
                }
                break;
              case "Enter":
                event.preventDefault();
                runActiveEntry();
                break;
            }
          }}
        />
        <ol id="command-palette-results" className="command-palette-results" role="listbox">
          {filteredEntries.length === 0 ? (
            <li>
              <UiAlert className="command-empty" variant="light">
                No history, view, tag, or action matches.
              </UiAlert>
            </li>
          ) : (
            filteredEntries.map((entry, index) => (
              <Fragment key={entry.id}>
                {(index === 0 || filteredEntries[index - 1].group !== entry.group) ? (
                  <li className="command-palette-group" role="presentation">{entry.group}</li>
                ) : null}
                <li
                  id={`command-palette-entry-${entry.id}`}
                  role="option"
                  aria-selected={index === safeActiveIndex}
                >
                  <UiUnstyledButton
                    component="button"
                    type="button"
                    className={index === safeActiveIndex ? "is-active" : ""}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => onRun(entry)}
                  >
                    <span>
                      <strong>{entry.kind === "action" ? entry.action.title : entry.title}</strong>
                      <small>{entry.kind === "action" ? entry.action.description : entry.description}</small>
                    </span>
                    {entry.kind === "action" ? (
                      <span className="action-badges">
                        <ShortcutBadge shortcut={normalizeShortcutString(entry.action.shortcut)} />
                        <UiBadge className="action-source-badge" variant="default">
                          {entry.action.source === "script" ? "Script" : "Built-in"}
                        </UiBadge>
                      </span>
                    ) : (
                      <UiBadge className="action-source-badge" variant="default">Browse</UiBadge>
                    )}
                  </UiUnstyledButton>
                </li>
              </Fragment>
            ))
          )}
        </ol>
      </UiPaper>
    </div>
  );
}

function ActionPicker({
  query,
  activeIndex,
  entries,
  onQueryChange,
  onActiveIndexChange,
  onCancel,
  onRun,
}: {
  query: string;
  activeIndex: number;
  entries: ActionPickerEntry[];
  onQueryChange: (query: string) => void;
  onActiveIndexChange: (index: number) => void;
  onCancel: () => void;
  onRun: (entry: ActionPickerEntry) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filteredEntries = entries.filter((entry) =>
    `${actionSearchText(entry.action)} ${entry.contextLabel}`.includes(normalizedQuery),
  );
  const safeActiveIndex = filteredEntries.length === 0
    ? -1
    : clamp(activeIndex, 0, filteredEntries.length - 1);

  useEffect(() => {
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }, []);

  useEffect(() => {
    if (safeActiveIndex !== activeIndex) {
      onActiveIndexChange(Math.max(0, safeActiveIndex));
    }
  }, [activeIndex, onActiveIndexChange, safeActiveIndex]);

  const runEntry = (entry: ActionPickerEntry | undefined) => {
    if (entry) {
      onRun(entry);
    }
  };

  return (
    <div
      className="command-palette-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Quick Actions"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onCancel();
        }
      }}
    >
      <UiPaper className="command-palette-panel action-picker-panel">
        <div className="action-picker-header">
          <strong>Quick Actions</strong>
          <span>Context-aware scripts and actions · F6</span>
        </div>
        <UiTextInput
          ref={inputRef}
          className="command-palette-input"
          aria-label="Search quick actions"
          role="combobox"
          aria-controls="action-picker-results"
          aria-expanded="true"
          aria-activedescendant={
            safeActiveIndex >= 0 ? `action-picker-action-${filteredEntries[safeActiveIndex].action.id}` : undefined
          }
          value={query}
          placeholder="Press 1-9 to run, or search actions"
          onChange={(event) => onQueryChange(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (!event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey && /^[1-9]$/.test(event.key)) {
              const quickIndex = Number(event.key) - 1;
              if (quickIndex < filteredEntries.length) {
                event.preventDefault();
                runEntry(filteredEntries[quickIndex]);
                return;
              }
            }

            switch (event.key) {
              case "Escape":
                event.preventDefault();
                onCancel();
                break;
              case "ArrowDown":
                event.preventDefault();
                if (filteredEntries.length > 0) {
                  onActiveIndexChange((safeActiveIndex + 1) % filteredEntries.length);
                }
                break;
              case "ArrowUp":
                event.preventDefault();
                if (filteredEntries.length > 0) {
                  onActiveIndexChange(
                    (safeActiveIndex - 1 + filteredEntries.length) % filteredEntries.length,
                  );
                }
                break;
              case "Enter":
                event.preventDefault();
                runEntry(filteredEntries[safeActiveIndex]);
                break;
            }
          }}
        />
        <ol id="action-picker-results" className="command-palette-results" role="listbox">
          {filteredEntries.length === 0 ? (
            <li>
              <UiAlert className="command-empty" variant="light">
                No ready actions match this context.
              </UiAlert>
            </li>
          ) : (
            filteredEntries.map((entry, index) => (
              <li
                key={`${entry.action.id}-${entry.trigger}`}
                id={`action-picker-action-${entry.action.id}`}
                role="option"
                aria-selected={index === safeActiveIndex}
              >
                <UiUnstyledButton
                  component="button"
                  type="button"
                  className={index === safeActiveIndex ? "is-active" : ""}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => onRun(entry)}
                >
                  <span>
                    <strong>{entry.action.title}</strong>
                    {entry.action.description ? <small>{entry.action.description}</small> : null}
                  </span>
                  <span className="action-badges">
                    {index < 9 ? <UiKbd>{index + 1}</UiKbd> : null}
                    <ShortcutBadge shortcut={normalizeShortcutString(entry.action.shortcut)} />
                    <UiBadge className="action-source-badge" variant="default">
                      {entry.contextLabel}
                    </UiBadge>
                    <UiBadge className="action-source-badge" variant="default">
                      {entry.action.source === "script" ? "Script" : "Built-in"}
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

function isSubmitShortcut(event: ReactKeyboardEvent<HTMLElement>) {
  return (event.ctrlKey || event.metaKey) && event.key === "Enter";
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
    actionMatchesMime(action, items) &&
    actionMatchesContent(action, items)
  );
}

function actionPickerTriggerForAction(
  action: ActionDefinition,
  items: HistoryItem[],
  activeItem: HistoryItem | null,
): ActionTrigger | null {
  const triggers: ActionTrigger[] = ["localShortcut", "itemMenu", "commandPalette"];

  for (const trigger of triggers) {
    const contextItems = itemsForActionContext(action, items, activeItem);
    if (actionRunnableForTrigger(action, trigger, contextItems)) {
      return trigger;
    }
  }

  return null;
}

function actionPickerContextLabel(trigger: ActionTrigger) {
  switch (trigger) {
    case "localShortcut":
      return "Local";
    case "itemMenu":
      return "Selection";
    case "commandPalette":
      return "Command";
    default:
      return trigger;
  }
}

function itemMenuRegistryActions(
  actions: ActionDefinition[],
  items: HistoryItem[],
  activeItem: HistoryItem | null,
) {
  return actions.filter((action) => {
    if (isSupersededMetadataEditAction(action)) {
      return false;
    }
    if (action.source === "builtin") {
      if (items.length <= 1 || action.id === BUILTIN_ACTIONS.joinSelected) {
        return false;
      }
    } else if (action.source !== "script") {
      return false;
    }
    if (items.length > 1 && action.input.selection === "active") {
      return false;
    }
    return actionRunnableForTrigger(action, "itemMenu", itemsForActionContext(action, items, activeItem));
  });
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

function isSupersededMetadataEditAction(action: ActionDefinition) {
  return action.id === "examples.assignMetadataToActive";
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
    action.input.mime?.some((pattern) => mimePatternMatches(pattern, effectiveMimeForItem(item))),
  );
}

function actionMatchesContent(action: ActionDefinition, items: HistoryItem[]) {
  if (action.id === "builtin.openUrl") {
    return items.length === 1 && itemContainsHttpUrl(items[0]);
  }
  return true;
}

function effectiveMimeForItem(item: HistoryItem) {
  if (item.mime_primary) {
    return item.mime_primary;
  }
  if (item.content_kind === "text") {
    return "text/plain";
  }
  return "";
}

function itemContainsHttpUrl(item: HistoryItem | undefined) {
  return typeof item?.text === "string" && /\bhttps?:\/\/\S+/i.test(item.text);
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

const TAG_EDIT_SHORTCUT = "Ctrl+Shift+C";

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

type QuickActionsKeyboardEvent = Pick<
  globalThis.KeyboardEvent | ReactKeyboardEvent,
  "code" | "key" | "ctrlKey" | "altKey" | "shiftKey" | "metaKey"
>;

function isQuickActionsShortcut(event: QuickActionsKeyboardEvent) {
  const f6Key = event.code === "F6" || event.key === "F6";
  return f6Key && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;
}

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

function applyBatchMetadata(existing: string | null, metadata: string, mode: BatchMetadataMode) {
  switch (mode) {
    case "append":
      return appendMetadata(existing, metadata);
    case "replace":
      return metadata.trim();
    case "merge":
      return mergeMetadata(existing, metadata);
  }
}

function mergeMetadata(existing: string | null, metadataToMerge: string) {
  const existingLines = metadataLines(existing);
  const lineKeys = new Set(existingLines.map(metadataLineKey));
  const tagKeys = new Set(
    Array.from((existing ?? "").matchAll(/#[\p{L}\p{N}_-]+/gu), (match) => match[0].toLocaleLowerCase()),
  );
  const mergedLines = [...existingLines];

  for (const line of metadataLines(metadataToMerge)) {
    const tags = Array.from(line.matchAll(/#[\p{L}\p{N}_-]+/gu), (match) => match[0]);
    const isTagOnlyLine = tags.length > 0 && line.replace(/#[\p{L}\p{N}_-]+/gu, "").trim().length === 0;

    if (isTagOnlyLine) {
      const missingTags = tags.filter((tag) => !tagKeys.has(tag.toLocaleLowerCase()));
      if (missingTags.length > 0) {
        missingTags.forEach((tag) => tagKeys.add(tag.toLocaleLowerCase()));
        mergedLines.push(missingTags.join(" "));
      }
      continue;
    }

    const key = metadataLineKey(line);
    if (!lineKeys.has(key)) {
      lineKeys.add(key);
      tags.forEach((tag) => tagKeys.add(tag.toLocaleLowerCase()));
      mergedLines.push(line);
    }
  }

  return mergedLines.join("\n").trim();
}

function metadataLines(value: string | null) {
  return (value ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function metadataLineKey(value: string) {
  return value.replace(/\s+/g, " ").trim().toLocaleLowerCase();
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

function estimateTextRowSize(item: HistoryItem) {
  const visiblePreview = item.text.trim();
  const previewLines = visiblePreview
    ? Math.min(
        TEXT_PREVIEW_ESTIMATED_MAX_LINES,
        Math.max(
          visiblePreview.split(/\r\n|\r|\n/).length,
          Math.ceil(visiblePreview.length / TEXT_PREVIEW_ESTIMATED_CHARS_PER_LINE),
        ),
      )
    : 0;
  const metadataParts = [
    item.tags?.trim() ?? "",
    metadataNotesPreview(item.notes, item.tags),
  ].filter(Boolean);
  const metadataLength = metadataParts.reduce((total, part) => total + part.length, 0);
  const metadataExplicitLines = metadataParts.reduce(
    (maximum, part) => Math.max(maximum, part.split(/\r\n|\r|\n/).length),
    0,
  );
  const metadataLines = metadataLength
    ? Math.max(
        metadataExplicitLines,
        Math.ceil(metadataLength / METADATA_ESTIMATED_CHARS_PER_LINE),
      )
    : 0;
  const estimatedHeight =
    FEED_ITEM_VERTICAL_CHROME
    + (item.title ? FEED_ITEM_TITLE_ESTIMATE : 0)
    + (
      metadataLines > 0
        ? FEED_ITEM_METADATA_VERTICAL_CHROME + metadataLines * FEED_ITEM_METADATA_LINE_HEIGHT
        : 0
    )
    + (
      previewLines > 0
        ? FEED_ITEM_GRID_ROW_GAP + previewLines * FEED_ITEM_PREVIEW_LINE_HEIGHT
        : 0
    );
  return Math.max(FEED_ITEM_MIN_HEIGHT, estimatedHeight);
}

function markdownImages(text: string): MarkdownImage[] {
  return markdownSegments(text)
    .filter((segment): segment is Extract<MarkdownSegment, { kind: "image" }> => segment.kind === "image")
    .map((segment) => segment.image)
    .filter((image) => image.src.length > 0);
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

function TextPreview({
  item,
  expanded,
  findMatches,
  currentOrdinal,
  onToggle,
  onLayoutChange,
}: {
  item: HistoryItem;
  expanded: boolean;
  findMatches?: FindFieldMatches | null;
  currentOrdinal?: number | null;
  onToggle: () => void;
  onLayoutChange: () => void;
}) {
  const previewRef = useRef<HTMLPreElement>(null);
  const [overflowing, setOverflowing] = useState(false);

  useLayoutEffect(() => {
    const preview = previewRef.current;
    if (!preview || expanded) {
      return undefined;
    }
    const measure = () => {
      setOverflowing(preview.scrollHeight > Math.ceil(preview.clientHeight) + 1);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(preview);
    return () => observer.disconnect();
  }, [expanded, item.text]);

  useLayoutEffect(() => {
    onLayoutChange();
  }, [expanded, item.text, overflowing]);

  const previewCharCount = Array.from(item.text).length;
  const previewContainsFullText = item.includes_content || previewCharCount >= item.text_char_count;
  const lineCount = item.text.split(/\r\n|\r|\n/).length;
  const overflowLabel = previewContainsFullText
    ? `${item.text_char_count} characters, ${lineCount} lines`
    : `${item.text_char_count} characters`;
  const overflowText = previewContainsFullText
    ? `${item.text_char_count.toLocaleString()} chars · ${lineCount.toLocaleString()} lines`
    : `${item.text_char_count.toLocaleString()} chars`;
  const previewFindMatches = findMatches && !item.includes_content && !expanded
    ? {
        ...findMatches,
        displayText: item.text,
        segments: [{
          segment: 0,
          startUtf16: 0,
          endUtf16: item.text.length,
          displayText: item.text,
        }],
        ranges: findMatches.ranges
          .filter((range) => range.startUtf16 < item.text.length)
          .map((range) => ({
            ...range,
            startUtf16: Math.min(range.startUtf16, item.text.length),
            endUtf16: Math.min(range.endUtf16, item.text.length),
          })),
      }
    : findMatches;

  return (
    <span className={`text-preview${expanded ? " is-expanded" : ""}`}>
      <pre ref={previewRef}>
        {previewFindMatches
          ? <FindHighlightedText matches={previewFindMatches} currentOrdinal={currentOrdinal ?? null} fallback={item.text} />
          : item.text}
      </pre>
      {overflowing ? (
        <span className="text-preview-overflow" aria-label={overflowLabel}>
          <span>{overflowText}</span>
          <button
            type="button"
            className="text-preview-toggle"
            aria-expanded={expanded}
            onMouseDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            onClick={(event) => {
              event.stopPropagation();
              onToggle();
            }}
          >
            {expanded ? "Collapse" : "Expand"}
          </button>
        </span>
      ) : null}
    </span>
  );
}

function MarkdownPreview({
  text,
  contentMatches,
  imageAltMatches,
  currentOrdinal,
  onImageLoad,
}: {
  text: string;
  contentMatches?: FindFieldMatches | null;
  imageAltMatches?: FindFieldMatches | null;
  currentOrdinal?: number | null;
  onImageLoad?: (event: SyntheticEvent<HTMLImageElement>) => void;
}) {
  const segments = markdownSegments(
    text,
    contentMatches?.segments ?? [],
    imageAltMatches?.segments ?? [],
  );

  return (
    <span className="markdown-preview">
      {segments.map((segment, index) => {
        if (segment.kind === "image") {
          const imageSegment = segment.canonicalSegment ?? null;
          const altMatches = imageAltMatches
            && imageSegment !== null
            ? {
                ...imageAltMatches,
                ranges: imageAltMatches.ranges.filter((range) => range.segment === imageSegment),
                segments: imageAltMatches.segments.filter((candidate) => candidate.segment === imageSegment),
                displayText: imageAltMatches.segments.find((candidate) => candidate.segment === imageSegment)?.displayText
                  ?? segment.image.alt,
              }
            : null;
          return (
            <span
              className={`markdown-image-frame${altMatches?.ranges.length ? " has-find-alt" : ""}`}
              key={`${segment.image.src}-${index}`}
            >
              <img
                src={segment.image.src}
                alt={segment.image.alt}
                onLoad={onImageLoad}
              />
              {altMatches?.ranges.length ? (
                <span className="markdown-image-alt" aria-label={`Image alt: ${segment.image.alt}`}>
                  <FindHighlightedText
                    matches={altMatches}
                    currentOrdinal={currentOrdinal ?? null}
                    fallback={segment.image.alt}
                  />
                </span>
              ) : null}
            </span>
          );
        }
        const contentSegment = segment.canonicalSegment ?? null;
        const contentSegmentMatches = contentMatches
          && contentSegment !== null
          ? {
              ...contentMatches,
              ranges: contentMatches.ranges.filter((range) => range.segment === contentSegment),
              segments: contentMatches.segments.filter((candidate) => candidate.segment === contentSegment),
              displayText: contentMatches.segments.find((candidate) => candidate.segment === contentSegment)?.displayText
                ?? segment.text,
            }
          : null;
        return (
          <span className="markdown-text-preview" key={`text-${index}`}>
            {contentSegmentMatches
              ? <FindHighlightedText
                  matches={contentSegmentMatches}
                  currentOrdinal={currentOrdinal ?? null}
                  className="markdown-find-content"
                  fallback={segment.text}
                />
              : segment.text}
          </span>
        );
      })}
    </span>
  );
}

function markdownSegments(
  text: string,
  canonicalSegments: FindFieldMatches["segments"] = [],
  canonicalImageSegments: FindFieldMatches["segments"] = [],
): MarkdownSegment[] {
  const rawSegments: MarkdownSegment[] = [];
  const definitions = markdownReferenceDefinitionsForUi(text);
  let cursor = 0;
  let textStart = 0;
  while (cursor < text.length) {
    const definition = markdownReferenceDefinitionAt(text, cursor);
    if (definition) {
      if (cursor > textStart) {
        rawSegments.push({ kind: "text", text: text.slice(textStart, cursor) });
      }
      cursor = definition.end;
      textStart = cursor;
      continue;
    }

    const image = markdownImageAt(text, cursor, definitions);
    if (image) {
      if (cursor > textStart) {
        rawSegments.push({ kind: "text", text: text.slice(textStart, cursor) });
      }
      rawSegments.push({ kind: "image", image: image.image });
      cursor = image.end;
      textStart = cursor;
      continue;
    }

    const codePoint = text.codePointAt(cursor);
    if (codePoint === undefined) {
      break;
    }
    cursor += String.fromCodePoint(codePoint).length;
  }
  if (textStart < text.length) {
    rawSegments.push({ kind: "text", text: text.slice(textStart) });
  }
  if (canonicalSegments.length === 0 && canonicalImageSegments.length === 0) {
    return rawSegments;
  }

  const mappedSegments: MarkdownSegment[] = [];
  let canonicalIndex = 0;
  let canonicalImageIndex = 0;
  for (const segment of rawSegments) {
    if (segment.kind === "image") {
      mappedSegments.push({
        ...segment,
        canonicalSegment: canonicalImageSegments[canonicalImageIndex]?.segment,
      });
      canonicalImageIndex += 1;
      continue;
    }
    const assigned: MarkdownSegment[] = [];
    const projectedText = projectMarkdownDisplayText(segment.text);
    let searchCursor = 0;
    while (canonicalIndex < canonicalSegments.length) {
      const canonical = canonicalSegments[canonicalIndex];
      if (!canonical.displayText) {
        canonicalIndex += 1;
        continue;
      }
      const matchIndex = projectedText.indexOf(canonical.displayText, searchCursor);
      if (matchIndex < 0) {
        break;
      }
      assigned.push({
        kind: "text",
        text: canonical.displayText,
        canonicalSegment: canonical.segment,
      });
      canonicalIndex += 1;
      searchCursor = matchIndex + canonical.displayText.length;
    }
    if (assigned.length > 0) {
      mappedSegments.push(...assigned);
    } else {
      mappedSegments.push(segment);
    }
  }
  return mappedSegments;
}

type MarkdownReferenceDefinition = {
  label: string;
  src: string;
  end: number;
};

type MarkdownImageProjection = {
  image: MarkdownImage;
  end: number;
};

function markdownReferenceDefinitionsForUi(source: string) {
  const definitions = new Map<string, string>();
  let cursor = 0;
  while (cursor < source.length) {
    const definition = markdownReferenceDefinitionAt(source, cursor);
    if (definition) {
      definitions.set(markdownReferenceLabelKey(definition.label), definition.src);
      cursor = definition.end;
      continue;
    }
    const newline = source.indexOf("\n", cursor);
    cursor = newline < 0 ? source.length : newline + 1;
  }
  return definitions;
}

function markdownReferenceDefinitionAt(source: string, cursor: number): MarkdownReferenceDefinition | null {
  if (cursor > 0 && source[cursor - 1] !== "\n") {
    return null;
  }
  let labelStart = cursor;
  let indentation = 0;
  while (labelStart < source.length && indentation < 4 && (source[labelStart] === " " || source[labelStart] === "\t")) {
    labelStart += 1;
    indentation += 1;
  }
  if (indentation > 3 || source[labelStart] !== "[") {
    return null;
  }
  const labelEnd = markdownClosingBracket(source, labelStart + 1);
  if (labelEnd === null) {
    return null;
  }
  let colon = labelEnd + 1;
  while (colon < source.length && /\s/.test(source[colon] ?? "")) {
    colon += 1;
  }
  if (source[colon] !== ":") {
    return null;
  }
  const newline = source.indexOf("\n", colon + 1);
  const lineEnd = newline < 0 ? source.length : newline;
  const rawDestination = source.slice(colon + 1, lineEnd).trim();
  return {
    label: source.slice(labelStart + 1, labelEnd),
    src: markdownReferenceDestination(rawDestination),
    end: newline < 0 ? source.length : newline + 1,
  };
}

function markdownReferenceDestination(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  if (trimmed.startsWith("<")) {
    const close = trimmed.indexOf(">");
    return normalizeMarkdownImageSrc(close < 0 ? trimmed : trimmed.slice(1, close));
  }
  return normalizeMarkdownImageSrc(trimmed.split(/\s+/, 1)[0] ?? "");
}

function markdownReferenceLabelKey(value: string) {
  return value.replace(/\s+/g, " ").trim().toLocaleLowerCase();
}

function markdownImageAt(
  source: string,
  cursor: number,
  definitions: Map<string, string>,
): MarkdownImageProjection | null {
  if (!source.startsWith("![", cursor)) {
    return null;
  }
  const labelStart = cursor + 2;
  const labelEnd = markdownClosingBracket(source, labelStart);
  if (labelEnd === null) {
    return null;
  }
  const alt = source.slice(labelStart, labelEnd);
  const afterLabel = labelEnd + 1;
  let end = afterLabel;
  let src = "";
  if (source[afterLabel] === "(") {
    const destinationEnd = markdownDestinationEnd(source, afterLabel + 1);
    if (destinationEnd === null) {
      return null;
    }
    src = markdownReferenceDestination(source.slice(afterLabel + 1, destinationEnd));
    end = destinationEnd + 1;
  } else if (source[afterLabel] === "[") {
    const referenceEnd = markdownClosingBracket(source, afterLabel + 1);
    if (referenceEnd === null) {
      return null;
    }
    const reference = source.slice(afterLabel + 1, referenceEnd);
    src = definitions.get(markdownReferenceLabelKey(reference || alt)) ?? "";
    end = referenceEnd + 1;
  } else {
    src = definitions.get(markdownReferenceLabelKey(alt)) ?? "";
    end = labelEnd + 1;
  }
  if (!src) {
    return null;
  }
  return {
    image: {
      alt,
      src,
      raw: source.slice(cursor, end),
    },
    end,
  };
}

function projectMarkdownDisplayText(source: string): string {
  let visible = "";
  let cursor = 0;
  let lineStart = true;

  while (cursor < source.length) {
    if (source.startsWith("<!--", cursor)) {
      const end = source.indexOf("-->", cursor + 4);
      if (end < 0) {
        break;
      }
      cursor = end + 3;
      lineStart = false;
      continue;
    }

    if (source.startsWith("```", cursor)) {
      const closeOffset = source.indexOf("```", cursor + 3);
      if (closeOffset < 0) {
        break;
      }
      const afterOpen = cursor + 3;
      const newline = source.indexOf("\n", afterOpen);
      const bodyStart = newline >= 0 && newline < closeOffset ? newline + 1 : afterOpen;
      visible += source.slice(bodyStart, closeOffset);
      cursor = closeOffset + 3;
      lineStart = false;
      continue;
    }

    if (source.startsWith("![", cursor)) {
      const imageEnd = markdownConstructEnd(source, cursor + 2);
      if (imageEnd !== null) {
        cursor = imageEnd;
        lineStart = false;
        continue;
      }
    }

    if (source[cursor] === "[") {
      const link = markdownLinkProjection(source, cursor);
      if (link) {
        visible += projectMarkdownDisplayText(source.slice(link.labelStart, link.labelEnd));
        cursor = link.end;
        lineStart = false;
        continue;
      }
    }

    const codePoint = source.codePointAt(cursor);
    if (codePoint === undefined) {
      break;
    }
    const character = String.fromCodePoint(codePoint);
    const next = cursor + character.length;

    if (character === "<" && /^[a-zA-Z/!?]/.test(source[next] ?? "")) {
      const tagEnd = source.indexOf(">", next);
      if (tagEnd < 0) {
        break;
      }
      cursor = tagEnd + 1;
      lineStart = false;
      continue;
    }
    if (character === "\\" && next < source.length) {
      const escapedCodePoint = source.codePointAt(next);
      if (escapedCodePoint !== undefined) {
        const escaped = String.fromCodePoint(escapedCodePoint);
        visible += escaped;
        cursor = next + escaped.length;
        lineStart = false;
        continue;
      }
    }
    if (character === "*" || character === "~" || character === "`") {
      cursor = next;
      lineStart = false;
      continue;
    }
    if (lineStart && (character === "#" || character === ">" || character === "-" || character === "+")) {
      cursor = next;
      while (cursor < source.length && /[ \t]/.test(source[cursor] ?? "")) {
        cursor += 1;
      }
      lineStart = false;
      continue;
    }
    if (character === "\r" && source[next] === "\n") {
      cursor = next;
      continue;
    }
    visible += character;
    cursor = next;
    lineStart = character === "\n";
  }

  return visible;
}

function markdownConstructEnd(source: string, labelStart: number): number | null {
  const labelEnd = markdownClosingBracket(source, labelStart);
  if (labelEnd === null) {
    return null;
  }
  const afterLabel = labelEnd + 1;
  if (source[afterLabel] === "(") {
    const destinationEnd = markdownDestinationEnd(source, afterLabel + 1);
    return destinationEnd === null ? null : destinationEnd + 1;
  }
  return null;
}

function markdownLinkProjection(source: string, cursor: number) {
  const labelStart = cursor + 1;
  const labelEnd = markdownClosingBracket(source, labelStart);
  if (labelEnd === null) {
    return null;
  }
  const afterLabel = labelEnd + 1;
  if (source[afterLabel] !== "(") {
    return null;
  }
  const destinationEnd = markdownDestinationEnd(source, afterLabel + 1);
  if (destinationEnd === null) {
    return null;
  }
  return { labelStart, labelEnd, end: destinationEnd + 1 };
}

function markdownClosingBracket(source: string, start: number): number | null {
  let depth = 0;
  let cursor = start;
  while (cursor < source.length) {
    const codePoint = source.codePointAt(cursor);
    if (codePoint === undefined) {
      return null;
    }
    const character = String.fromCodePoint(codePoint);
    const next = cursor + character.length;
    if (character === "\\" && next < source.length) {
      const escapedCodePoint = source.codePointAt(next);
      cursor = escapedCodePoint === undefined
        ? next
        : next + String.fromCodePoint(escapedCodePoint).length;
      continue;
    }
    if (character === "[") {
      depth += 1;
    } else if (character === "]") {
      if (depth === 0) {
        return cursor;
      }
      depth -= 1;
    }
    cursor = next;
  }
  return null;
}

function markdownDestinationEnd(source: string, start: number): number | null {
  let depth = 0;
  let cursor = start;
  while (cursor < source.length) {
    const codePoint = source.codePointAt(cursor);
    if (codePoint === undefined) {
      return null;
    }
    const character = String.fromCodePoint(codePoint);
    const next = cursor + character.length;
    if (character === "\\" && next < source.length) {
      const escapedCodePoint = source.codePointAt(next);
      cursor = escapedCodePoint === undefined
        ? next
        : next + String.fromCodePoint(escapedCodePoint).length;
      continue;
    }
    if (character === "(") {
      depth += 1;
    } else if (character === ")") {
      if (depth === 0) {
        return cursor;
      }
      depth -= 1;
    }
    cursor = next;
  }
  return null;
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
        {IS_UI_HOST_WINDOW || IS_NOTIFICATIONS_WINDOW || IS_SETTINGS_WINDOW || IS_AI_OUTPUT_WINDOW || IS_METADATA_WINDOW || IS_ITEM_PREVIEW_WINDOW || IS_WHICHKEY_WINDOW ? (
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
            ) : IS_ITEM_PREVIEW_WINDOW ? (
              <LazyItemPreviewWindowApp />
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

