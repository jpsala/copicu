import type { AppliedSearchDescriptor } from "./searchSnapshot";

export type FindField = "content" | "imageAlt" | "title" | "tag" | "notes";

export type FindOccurrence = {
  ordinal: number;
  itemId: number;
  field: FindField;
  segment: number;
  startUtf16: number;
  endUtf16: number;
};

export type FindRange = Pick<FindOccurrence, "ordinal" | "segment" | "startUtf16" | "endUtf16">;

export type FindFieldMatches = {
  field: FindField;
  ranges: FindRange[];
  displayText: string;
  segments: FindDisplaySegment[];
};

export type FindDisplaySegment = {
  segment: number;
  startUtf16: number;
  endUtf16: number;
  displayText: string;
};

export type FindItemMatches = {
  itemId: number;
  fields: FindFieldMatches[];
};

export type FindStartRequest = {
  appliedDescriptor: AppliedSearchDescriptor;
  needle: string;
  generation?: number;
  ownerId?: string;
};

export type FindStartResponse = {
  sessionId: string;
  ownerId: string;
  generation: number;
  total: number;
  firstTarget: FindOccurrence | null;
};

export type FindNavigateRequest = {
  sessionId: string;
  ordinal?: number | null;
  currentOrdinal?: number | null;
  direction: "next" | "previous";
};

export type FindNavigateResponse = {
  total: number;
  target: FindOccurrence | null;
};

export type FindMatchesForItemsRequest = {
  sessionId: string;
  itemIds: number[];
};

export type FindMatchesForItemsResponse = {
  items: FindItemMatches[];
};

export type FindCloseRequest = {
  sessionId: string;
  ownerId?: string | null;
};

export type FindCloseResponse = {
  closed: boolean;
};

export type FindCancelOwnerRequest = {
  ownerId: string;
};

export type FindCancelOwnerResponse = {
  cancelled: boolean;
};

export type FindTargetRequest = {
  sessionId: string;
  ordinal: number;
};

export type FindTargetResponse = {
  total: number;
  target: FindOccurrence | null;
  materialized: FindTargetMaterialization | null;
};

export type FindTargetMaterialization = {
  itemId: number;
  field: FindField;
  displayText: string;
  item: FindTargetItem;
};

export type FindTargetItem = {
  id: number;
  contentKind: string;
  text: string;
  title: string | null;
  notes: string | null;
  tags: string | null;
};

export type TagSummary = {
  id: number;
  slug: string;
  label: string;
  color: string | null;
  pinned: boolean;
  sortOrder: number | null;
  itemCount: number;
  autoApplyEnabled: boolean;
};

export type SavedHistoryView = {
  id: number;
  title: string;
  query: string;
  openMode: "browse";
  hotkey: string | null;
  pinned: boolean;
  sortOrder: number | null;
  captureTags: string[];
  createdAtUnixMs: number;
  updatedAtUnixMs: number;
};

export type CreateSavedHistoryViewRequest = {
  title: string;
  query: string;
  hotkey?: string | null;
  captureTags: string[];
};

export type UpdateSavedHistoryViewRequest = {
  id: number;
  title: string;
  query: string;
  hotkey?: string | null;
  pinned: boolean;
  sortOrder?: number | null;
  captureTags: string[];
};

export type ScenarioProperties = {
  client: string[];
  project: string[];
  activity: string[];
};

export type Scenario = {
  id: number;
  name: string;
  query: string;
  revision: number;
  properties: ScenarioProperties;
  tags: string[];
  createdAtUnixMs: number;
  updatedAtUnixMs: number;
};

export type ScenarioDraftRequest = {
  name: string;
  query: string;
  properties: ScenarioProperties;
  tags: string[];
};

export type CreateScenarioRequest = ScenarioDraftRequest;
export type CreateScenarioFromQueryRequest = ScenarioDraftRequest;
export type UpdateScenarioFromQueryRequest = ScenarioDraftRequest & { id: number };
export type UpdateScenarioRequest = UpdateScenarioFromQueryRequest;

export type ActiveScenarioSession = {
  sessionId: string;
  scenarioId: number;
  scenarioName: string;
  scenarioRevision: number;
  query: string;
  properties: ScenarioProperties;
  tags: string[];
  startedAtUnixMs: number;
};

export type CreateTagRequest = {
  label: string;
  color?: string | null;
};

export type UpdateTagConfigRequest = {
  tagId: number;
  label?: string | null;
  color?: string | null;
  pinned?: boolean;
  sortOrder?: number | null;
  hotkey?: string | null;
  autoApplyEnabled?: boolean;
};

export type SetItemTagsRequest = {
  itemId: number;
  tags: string[];
};

export type UpdateItemMetadataRequest = {
  id: number;
  title: string | null;
  notes: string | null;
  tags: string[];
  properties: ScenarioProperties;
};

export type ApplyItemTagsRequest = {
  itemIds: number[];
  tags: string[];
  removeTags: string[];
  mode: "replace" | "patch";
};

export type ActivateItemRequest = {
  itemId: number;
  copy: boolean;
  markUsed: boolean;
  hidePicker: boolean;
  focusPrevious: boolean;
  paste: boolean;
  pasteShortcut: "default" | "shiftInsert" | "ctrlV";
};

export type ActionTrigger =
  | "itemMenu"
  | "commandPalette"
  | "localShortcut"
  | "globalShortcut"
  | "clipboardChange"
  | "tray"
  | "cli"
  | "devRun";

export type SelectionRequirement = "none" | "optional" | "active" | "one" | "oneOrMore" | "many";
export type ActionInputSource = "pickerSelection" | "clipboard" | "historySearch" | "none";
export type ClipKind = "text" | "html" | "image" | "fileList" | "unknown";

export type ActionInput = {
  source: ActionInputSource;
  selection: SelectionRequirement;
  kinds: ClipKind[] | null;
  mime: string[] | null;
  query: string | null;
};

export type ActionDefinition = {
  id: string;
  title: string;
  description: string;
  shortcut?: string | null;
  triggers: ActionTrigger[];
  input: ActionInput;
  capabilities: string[];
  builtin: boolean;
  source: "builtin" | "script";
  script: {
    path: string;
    fileName: string;
    sourceHash: string;
  } | null;
  diagnostics: Array<{
    severity: "info" | "warning" | "error";
    message: string;
  }>;
  logging: {
    name: string | null;
    redact: boolean;
  } | null;
};

export type ActionContext = {
  trigger: ActionTrigger;
  shortcut: string | null;
  activeItemId: number | null;
  currentItemId: number | null;
  selectedItemIds: number[];
  view: {
    query: string;
    visibleItemIds: number[];
    currentIndex: number | null;
  } | null;
};

export type RunActionRequest = {
  actionId: string;
  context: ActionContext;
};

export type ActionRunResult = {
  actionId: string;
  status: "completed" | "failed";
  message: string;
  toasts?: ToastOptions[];
  effects?: ActionEffect[];
};

export type ActionEffect = {
  type: "picker.filter";
  query: string;
};

export type ToastTone = "info" | "success" | "warning" | "danger";

export type ToastOptions = {
  title?: string;
  message: string;
  tone?: ToastTone;
  durationMs?: number;
};

export type ToastItem = Required<Pick<ToastOptions, "message" | "tone" | "durationMs">> &
  Pick<ToastOptions, "title"> & {
    id: number;
  };

export type CompoundHotkeyPendingEvent = {
  prefixLabel: string;
  nextSteps: string[];
  entries?: WhichKeyEntry[];
  expiresAtUnixMs?: number;
};

export type WhichKeyEntry = {
  key: string;
  label: string;
  group: string;
  routeId: string;
  disabled: boolean;
  diagnostic?: string | null;
};

export type WhichKeyState = {
  prefix: string;
  entries: WhichKeyEntry[];
  expiresAtUnixMs: number;
  visible: boolean;
};

export type UiHostRequest = {
  id: string;
  kind: "alert" | "confirm" | "input";
  title: string;
  body: string;
  confirmLabel?: string | null;
  cancelLabel?: string | null;
  placeholder?: string | null;
  defaultValue?: string | null;
  submitLabel?: string | null;
};

export type MarkdownOutputPayload = {
  title: string;
  markdown: string;
  summary?: string | null;
  source?: string | null;
  suggestedFileName?: string | null;
};

export type ActivationOptions = Omit<ActivateItemRequest, "itemId">;
export type EnterAction = "copy" | "paste";
export type EnrichmentApplyMode = "autoApply" | "suggestOnly";

export type EnrichmentSettings = {
  enabled: boolean;
  applyMode: EnrichmentApplyMode;
  detectors: {
    path: boolean;
    url: boolean;
    json: boolean;
    code: boolean;
    secretRisk: boolean;
  };
};

export type UpdateHistoryItemRequest = {
  id: number;
  text: string;
  title: string | null;
  notes: string | null;
  tags: string | null;
  mimePrimary: string | null;
  marked?: boolean | null;
};

export type CreateHistoryItemRequest = {
  text: string;
  title: string | null;
  notes: string | null;
  tags: string | null;
  mimePrimary: string | null;
};

export type CreateHistoryItemResult = {
  id: number;
  created: boolean;
};

export type SetHistoryItemsMarkedRequest = {
  ids: number[];
  marked: boolean;
};

export type SetHistoryQueryMarkedRequest = {
  query: string;
  marked: boolean;
  appliedDescriptor: AppliedSearchDescriptor;
};
