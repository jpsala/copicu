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
};
