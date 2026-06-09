type Trigger =
  | "itemMenu"
  | "commandPalette"
  | "localShortcut"
  | "globalShortcut"
  | "clipboardChange"
  | "tray"
  | "cli"
  | "devRun";

type ClipKind = "text" | "html" | "image" | "fileList" | "unknown";
type SelectionRequirement = "none" | "optional" | "one" | "oneOrMore" | "many";

type ActionInput = {
  source: "pickerSelection" | "clipboard" | "historySearch" | "none";
  selection: SelectionRequirement;
  kinds?: ClipKind[];
  mime?: string[];
  query?: string;
};

type ActionDefinition = {
  id: string;
  title: string;
  description?: string;
  shortcut?: string;
  triggers: Trigger[];
  input: ActionInput;
  capabilities: string[];
  logging?: {
    /**
     * Defaults to "<action-id>.jsonl" inside Scripts/.logs/.
     * The runner should reject path separators here.
     */
    name?: string;
    /**
     * Defaults to true. Redaction removes payload text, URLs, secrets-looking values,
     * and oversized data from structured logs.
     */
    redact?: boolean;
  };
  run(ctx: ActionContext): Promise<void> | void;
};

type ActionContext = {
  trigger: Trigger;
  shortcut?: string;
  currentItemId?: string;
  selectedItemIds: string[];
  view?: {
    query: string;
    visibleItemIds: string[];
    currentIndex?: number;
  };
};

type HistoryItem = {
  id: string;
  kind: ClipKind;
  text?: string;
  title?: string;
  notes?: string;
  tags?: string[];
  marked?: boolean;
  mimePrimary?: string;
};

type ToastOptions = {
  title?: string;
  message: string;
  tone?: "info" | "success" | "warning" | "danger";
  durationMs?: number;
};

type NotifyOptions = {
  title?: string;
  body: string;
};

type AlertOptions = {
  title: string;
  message: string;
  confirmLabel?: string;
};

type ConfirmOptions = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
};

type InputOptions = {
  title: string;
  message?: string;
  placeholder?: string;
  defaultValue?: string;
  submitLabel?: string;
  cancelLabel?: string;
};

type MarkdownOutputOptions = {
  title: string;
  markdown: string;
  summary?: string;
  source?: string;
  suggestedFileName?: string;
};

type AiMarkdownResponseItem = Pick<HistoryItem, "id" | "kind" | "title" | "text" | "notes" | "tags">;

type AiMarkdownResponseContext = {
  title?: string;
  source?: string;
  currentQuery?: string;
  currentItemId?: string;
  selectedItemIds?: string[];
  visibleItemIds?: string[];
};

type AiRespondMarkdownOptions = {
  instruction: string;
  items: AiMarkdownResponseItem[];
  context?: AiMarkdownResponseContext;
};

type AiSummarizeMarkdownOptions = {
  instruction: string;
  title?: string;
  items: AiMarkdownResponseItem[];
};

type HostCommandId = "picker.open";

type HostCommandParams = {
  "picker.open": {
    query?: string;
    rememberPrevious?: boolean;
    show?: boolean;
    focus?: "search" | "none";
  };
};

declare function defineAction(definition: ActionDefinition): ActionDefinition;

declare const copicu: {
  selection: {
    ids(): Promise<string[]>;
    current(options?: { content?: boolean }): Promise<HistoryItem | null>;
    items(options?: { content?: boolean }): Promise<HistoryItem[]>;
    set(ids: string[]): Promise<void>;
  };
  history: {
    search(query: string, options?: { limit?: number; content?: boolean }): Promise<HistoryItem[]>;
    get(id: string, options?: { content?: boolean }): Promise<HistoryItem>;
    update(id: string, patch: Partial<Pick<HistoryItem, "title" | "notes" | "tags" | "text">>): Promise<void>;
    remove(id: string): Promise<void>;
  };
  clipboard: {
    read(): Promise<{ text?: string }>;
    writeText(text: string): Promise<void>;
    writeItem(id: string): Promise<void>;
  };
  ai: {
    respondMarkdown(options: AiRespondMarkdownOptions): Promise<string>;
    /** @deprecated Use respondMarkdown({ instruction, items, context }) instead. */
    summarizeMarkdown(options: AiSummarizeMarkdownOptions): Promise<string>;
  };
  picker: {
    open(options?: {
      query?: string;
      rememberPrevious?: boolean;
      show?: boolean;
      focus?: "search" | "none";
    }): Promise<void>;
    filter(query: string): Promise<void>;
    activate(
      id: string,
      options?: {
        copy?: boolean;
        markUsed?: boolean;
        hidePicker?: boolean;
        focusPrevious?: boolean;
        paste?: boolean;
        pasteShortcut?: "default" | "shiftInsert" | "ctrlV";
      },
    ): Promise<void>;
    show(): Promise<void>;
    hide(): Promise<void>;
  };
  window: {
    rememberPrevious(): Promise<void>;
    focusPrevious(): Promise<void>;
  };
  input: {
    paste(options?: { shortcut?: "default" | "shiftInsert" | "ctrlV" }): Promise<void>;
  };
  commands: {
    run<TCommand extends HostCommandId>(
      commandId: TCommand,
      params?: HostCommandParams[TCommand],
    ): Promise<void>;
  };
  ui: {
    toast(options: ToastOptions | string): Promise<void>;
    notify(options: NotifyOptions | string): Promise<void>;
    alert(options: AlertOptions | string): Promise<void>;
    confirm(options: ConfirmOptions): Promise<boolean>;
    input(options: InputOptions): Promise<string | null>;
    markdownOutput(options: MarkdownOutputOptions | string): Promise<void>;
  };
  log: {
    debug(message: string, data?: unknown): Promise<void>;
    info(message: string, data?: unknown): Promise<void>;
    warn(message: string, data?: unknown): Promise<void>;
    error(message: string, data?: unknown): Promise<void>;
  };
};
