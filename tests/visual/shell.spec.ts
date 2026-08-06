import { expect, test, type Page } from "@playwright/test";

declare const Buffer: {
  from(input: string): { toString(encoding: "base64"): string };
};
declare const process: { platform: string };

const svgDataUrl = (width: number, height: number, color: string) =>
  `data:image/svg+xml;base64,${Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="${color}"/><circle cx="${width / 2}" cy="${height / 2}" r="${Math.min(width, height) / 4}" fill="white"/></svg>`,
  ).toString("base64")}`;

const syntheticLongHistory = [
  {
    id: 100,
    content_kind: "text",
    text: [
      "## COPICU_SYNTH_MARKDOWN",
      "",
      "![large](" + svgDataUrl(760, 420, "#245f53") + ")",
      "![small](" + svgDataUrl(180, 120, "#69747a") + ")",
      "![medium](" + svgDataUrl(420, 240, "#374047") + ")",
      "",
      "| Area | Estado |",
      "| --- | --- |",
      "| Preview | Markdown with images |",
    ].join("\n"),
    normalized_hash: "synthetic-markdown-images",
    created_at_unix_ms: 1_800_000_003_000,
    last_used_at_unix_ms: 1_800_000_003_000,
    mime_primary: "text/markdown",
    blob_path: null,
    thumbnail_path: null,
    byte_size: null,
    width: null,
    height: null,
    thumbnail_data_url: null,
    title: null,
    notes: null,
    tags: "markdown",
  },
  {
    id: 101,
    content_kind: "text",
    text:
      "COPICU_SYNTH_LONG_SINGLE_LINE " +
      "alpha beta gamma delta ".repeat(36) +
      "end",
    normalized_hash: "synthetic-long-line",
    created_at_unix_ms: 1_800_000_000_000,
    last_used_at_unix_ms: 1_800_000_000_000,
    mime_primary: "text/plain",
    blob_path: null,
    thumbnail_path: null,
    byte_size: null,
    width: null,
    height: null,
    thumbnail_data_url: null,
    title: null,
    notes: null,
    tags: "synthetic",
  },
  {
    id: 102,
    content_kind: "text",
    text:
      "COPICU_SYNTH_LONG_UNBROKEN_" +
      "0123456789abcdef".repeat(32),
    normalized_hash: "synthetic-unbroken-token",
    created_at_unix_ms: 1_800_000_001_000,
    last_used_at_unix_ms: 1_800_000_001_000,
    mime_primary: "text/plain",
    blob_path: null,
    thumbnail_path: null,
    byte_size: null,
    width: null,
    height: null,
    thumbnail_data_url: null,
    title: null,
    notes: null,
    tags: null,
  },
  {
    id: 103,
    content_kind: "text",
    text: Array.from(
      { length: 28 },
      (_, index) => `COPICU_SYNTH_MULTILINE_${String(index + 1).padStart(2, "0")} value`,
    ).join("\n"),
    normalized_hash: "synthetic-multiline",
    created_at_unix_ms: 1_800_000_002_000,
    last_used_at_unix_ms: 1_800_000_002_000,
    mime_primary: "text/plain",
    blob_path: null,
    thumbnail_path: null,
    byte_size: null,
    width: null,
    height: null,
    thumbnail_data_url: null,
    title: "Multiline sample",
    notes: null,
    tags: null,
  },
];

const compactPreviewText = Array.from(
  { length: 18 },
  (_, index) => `COPICU_COMPACT_LINE_${String(index + 1).padStart(2, "0")} value`,
).join("\n");

const syntheticCompactPreviewHistory = [
  {
    ...syntheticLongHistory[1],
    id: 1201,
    text: "Short text",
    normalized_hash: "compact-short-text",
    title: null,
    notes: null,
    tags: null,
  },
  {
    ...syntheticLongHistory[3],
    id: 1202,
    text: compactPreviewText,
    normalized_hash: "compact-overflow-text",
    title: null,
    notes: null,
    tags: null,
  },
  ...[
    { id: 1203, width: 72, height: 48, color: "#245f53" },
    { id: 1204, width: 120, height: 640, color: "#69747a" },
    { id: 1205, width: 920, height: 96, color: "#374047" },
  ].map(({ id, width, height, color }) => ({
    ...syntheticLongHistory[1],
    id,
    content_kind: "image",
    text: "",
    normalized_hash: `compact-image-${id}`,
    mime_primary: "image/png",
    width,
    height,
    thumbnail_data_url: svgDataUrl(width, height, color),
    title: null,
    notes: null,
    tags: null,
  })),
];

const syntheticPagedHistory = Array.from({ length: 80 }, (_, index) => ({
  id: 5000 - index,
  content_kind: "text",
  text: `COPICU_SYNTH_PAGE_${String(index + 1).padStart(2, "0")} ${"paged item ".repeat(8)}`,
  normalized_hash: `synthetic-page-${index + 1}`,
  created_at_unix_ms: 1_900_000_000_000 - index,
  last_used_at_unix_ms: 1_900_000_000_000 - index,
  mime_primary: "text/plain",
  blob_path: null,
  thumbnail_path: null,
  byte_size: null,
  width: null,
  height: null,
  thumbnail_data_url: null,
  title: null,
  notes: null,
  tags: null,
}));

const syntheticMarkdownScrollHistory = Array.from({ length: 80 }, (_, index) => ({
  ...syntheticPagedHistory[index],
  id: 6000 - index,
  text: `COPICU_SYNTH_SCROLL_${String(index + 1).padStart(2, "0")}\n![missing](copicu://missing-${index}.png)`,
  normalized_hash: `synthetic-scroll-${index + 1}`,
}));

type MockTauriOptions = {
  historySearchDelayMs?: number;
  historySearchFailNext?: boolean;
  historySearchFailMessage?: string;
  historySearchFailOnCursor?: boolean;
  pickerSessionDelayMs?: number;
  pickerSessionSnapshots?: Array<{
    reset: boolean;
    generation: number;
    pendingActivationItemId?: number | null;
  }>;
  searchTriggerMode?: "realtime" | "enter" | "manual";
  deferStructuredSearchUntilEnter?: boolean;
  searchTriggerUpdateDelayMs?: number;
  previewShortcut?: string;
  editorSettings?: Partial<{
    fontFamily: "systemMono" | "cascadiaMono" | "consolas" | "uiSans";
    fontSize: number;
    lineHeight: "compact" | "comfortable" | "relaxed";
    wrapLines: boolean;
    tabSize: 2 | 4 | 8;
    lineNumbers: boolean;
    highlightActiveLine: boolean;
  }>;
};

async function mockTauriInvoke(
  page: Page,
  historyItems: any[] = syntheticLongHistory,
  initialCompoundPending: unknown = null,
  options: MockTauriOptions = {},
) {
  await page.addInitScript(({ items, pending, mockOptions }: { items: any[]; pending: unknown; mockOptions: MockTauriOptions }) => {
    const PREVIEW_LIMIT = 2000;
    const withHistoryPreview = (item: any, includeContent: boolean) => {
      const fullText = item.text ?? "";
      const previewText = item.preview_text ?? fullText.slice(0, PREVIEW_LIMIT);
      return {
        ...item,
        text: includeContent ? fullText : previewText,
        preview_text: previewText,
        text_char_count: item.text_char_count ?? Array.from(fullText).length,
        includes_content: includeContent,
        last_copied_at_unix_ms: item.last_copied_at_unix_ms ?? item.created_at_unix_ms,
        copy_count: item.copy_count ?? 1,
      };
    };
    (window as any).__copicuTestInvocations = [];
    (window as any).__copicuTestWindowPinned = false;
    (window as any).__copicuTestHistoryItems = items;
    (window as any).__copicuTestCompoundPending = pending;
    (window as any).__copicuTestMockOptions = mockOptions;
    (window as any).__copicuTestWindowVisible = true;
    (window as any).__copicuTestCaptureTagContext = null;
    (window as any).__copicuTestActiveScenarioSession = null;
    (window as any).__copicuTestPickerSessionSnapshots = (mockOptions.pickerSessionSnapshots ?? []).map(
      (snapshot) => ({
        ...snapshot,
        pendingActivationItemId: snapshot.pendingActivationItemId ?? null,
      }),
    );
    const eventCallbacks = new Map<number, (event: unknown) => unknown>();
    const eventHandlers = new Map<string, number[]>();
    let nextCallbackId = 1;
    (window as any).__copicuTestEmitEvent = async (event: string, payload: unknown) => {
      for (const callbackId of eventHandlers.get(event) ?? []) {
        await eventCallbacks.get(callbackId)?.({ event, id: callbackId, payload });
      }
    };
    (window as any).__TAURI_EVENT_PLUGIN_INTERNALS__ = {
      unregisterListener: () => undefined,
    };
    (window as any).__copicuTestTags = [
      {
        id: 1,
        slug: "work",
        label: "Work",
        color: null,
        pinned: true,
        sortOrder: null,
        itemCount: 4,
        hotkey: null,
        autoApplyEnabled: false,
        status: "ready",
      },
      {
        id: 2,
        slug: "backend",
        label: "Backend",
        color: null,
        pinned: false,
        sortOrder: null,
        itemCount: 2,
        hotkey: "Ctrl+Alt+B",
        autoApplyEnabled: false,
        status: "hotkeyPending",
      },
    ];
    (window as any).__copicuTestSavedHistoryViews = [
      {
        id: 1,
        title: "Work clips",
        query: "tag:work kind:text",
        hotkey: null,
        openMode: "browse",
        pinned: true,
        sortOrder: null,
        captureTags: ["Work"],
        createdAtUnixMs: 1,
        updatedAtUnixMs: 1,
      },
      {
        id: 2,
        title: "Context clips",
        query: "tag:context-smoke",
        hotkey: null,
        openMode: "browse",
        pinned: false,
        sortOrder: null,
        captureTags: [],
        createdAtUnixMs: 2,
        updatedAtUnixMs: 2,
      },
    ];
    (window as any).__copicuTestScenarios = [
      {
        id: 1,
        name: "Cliente ACME / Proyecto Web",
        query: "tag:work kind:text",
        revision: 1,
        properties: { client: ["ACME"], project: ["Web"], activity: ["Development"] },
        tags: ["Work"],
        createdAtUnixMs: 1,
        updatedAtUnixMs: 1,
      },
      {
        id: 2,
        name: "Internal review",
        query: "tag:work kind:text",
        revision: 1,
        properties: { client: ["Internal"], project: [], activity: ["Review"] },
        tags: [],
        createdAtUnixMs: 2,
        updatedAtUnixMs: 2,
      },
    ];
    (window as any).__copicuTestSettings = {
      schemaVersion: 1,
      general: {
        globalShortcut: "Ctrl+Shift+,",
      },
      picker: {
        hideOnFocusLost: true,
        enterAction: "copy",
        promoteActiveOnCopy: true,
        pinToggleShortcut: "F8",
        settingsShortcut: "Ctrl+,",
        searchTriggerMode: mockOptions.searchTriggerMode ?? "realtime",
        deferStructuredSearchUntilEnter: mockOptions.deferStructuredSearchUntilEnter ?? false,
        previewShortcut: mockOptions.previewShortcut ?? "Alt+Enter",
      },
      history: {
        retentionCount: 1000,
      },
      appearance: {
        theme: "system",
        themeId: "default",
      },
      editor: {
        fontFamily: "systemMono",
        fontSize: 13,
        lineHeight: "comfortable",
        wrapLines: true,
        tabSize: 4,
        lineNumbers: true,
        highlightActiveLine: true,
        ...mockOptions.editorSettings,
      },
      scripts: {
        folderPath: "C:\\Users\\JP\\Documents\\Copicu\\Scripts",
      },
      ai: {
        enabled: false,
        endpoint: "https://openrouter.ai/api/v1",
        model: "openai/gpt-4.1-mini",
        apiKey: "",
      },
    };
    (window as any).__TAURI_INTERNALS__ = {
      invoke: async (cmd: string, args?: any) => {
        (window as any).__copicuTestInvocations.push({ cmd, args });
        switch (cmd) {
          case "plugin:event|listen": {
            const handlers = eventHandlers.get(args.event) ?? [];
            handlers.push(args.handler);
            eventHandlers.set(args.event, handlers);
            return args.handler;
          }
          case "plugin:event|unlisten":
            return null;
          case "plugin:event|unregisterListener":
          case "plugin:event|emit_to":
            return null;
          case "record_renderer_diagnostic":
            return null;
          case "get_compound_hotkey_pending":
            return (window as any).__copicuTestCompoundPending;
          case "get_app_about_info":
            return {
              name: "Copicu",
              version: "0.2.6",
              description: "A fast local clipboard manager inspired by CopyQ, built for keyboard-first Windows workflows.",
              target: "test",
            };
          case "get_app_shortcut_status":
            return {
              picker: {
                label: "Ctrl+Shift+,",
                registered: true,
                supported: true,
                error: null,
              },
              pin: {
                label: "F8",
                registered: true,
                supported: true,
                error: null,
              },
            };
          case "clear_compound_hotkey_pending":
            (window as any).__copicuTestCompoundPending = null;
            return null;
          case "handle_compound_hotkey_step": {
            const pending = (window as any).__copicuTestCompoundPending;
            if (!pending) {
              return {
                handled: false,
                pending: false,
                executed: false,
                diagnostic: null,
              };
            }
            if (args.request.shortcut === "T") {
              (window as any).__copicuTestCompoundPending = null;
              return {
                handled: true,
                pending: false,
                executed: true,
                diagnostic: null,
              };
            }
            (window as any).__copicuTestCompoundPending = null;
            return {
              handled: false,
              pending: false,
              executed: false,
              diagnostic: "compound shortcut did not match",
            };
          }
          case "list_builtin_actions":
          case "list_actions": {
            const actions = [
              {
                id: "builtin.pastePlain",
                title: "Paste plain",
                description: "Paste the selected text item as plain text.",
                triggers: ["itemMenu", "commandPalette"],
                input: {
                  source: "pickerSelection",
                  selection: "one",
                  kinds: ["text"],
                  mime: ["text/plain"],
                  query: null,
                },
                capabilities: ["history:read-content", "clipboard:write", "input:paste"],
                builtin: true,
                source: "builtin",
                script: null,
                diagnostics: [],
                logging: null,
              },
              {
                id: "builtin.joinSelected",
                title: "Join selected",
                description: "Join selected text items and copy the result.",
                triggers: ["itemMenu", "commandPalette"],
                input: {
                  source: "pickerSelection",
                  selection: "oneOrMore",
                  kinds: ["text"],
                  mime: ["text/plain"],
                  query: null,
                },
                capabilities: ["history:read-content", "clipboard:write"],
                builtin: true,
                source: "builtin",
                script: null,
                diagnostics: [],
                logging: null,
              },
              {
                id: "builtin.openUrl",
                title: "Open URL",
                description: "Open the first URL found in the selected item.",
                triggers: ["itemMenu", "commandPalette"],
                input: {
                  source: "pickerSelection",
                  selection: "one",
                  kinds: ["text"],
                  mime: null,
                  query: null,
                },
                capabilities: ["history:read-content", "shell:open-url"],
                builtin: true,
                source: "builtin",
                script: null,
                diagnostics: [],
                logging: null,
              },
            ];
            if (cmd === "list_actions") {
              return [
                ...actions,
                ...[
                  "001-toast-hello.ts",
                  "002-copy-current-title.ts",
                  "003-join-selected-with-log-name.ts",
                  "004-url-open-or-filter.ts",
                  "005-triage-clipboard-batch.ts",
                  "006-global-reserved.ts",
                  "007-active-item-metadata.ts",
                ].map((fileName, index) => ({
                  id: `examples.mock${index + 1}`,
                  title: fileName.replace(/^\d+-/, "").replace(/\.ts$/, ""),
                  description: "Discovered test script",
                  shortcut: index === 2 ? "Ctrl+Alt+J" : index === 5 ? "Ctrl+Shift+," : index === 6 ? "Ctrl+Alt+M" : null,
                  triggers:
                    index === 0
                      ? ["commandPalette", "devRun"]
                      : index === 2
                        ? ["itemMenu", "commandPalette", "localShortcut", "devRun"]
                        : index === 5
                          ? ["globalShortcut", "devRun"]
                          : index === 6
                            ? ["itemMenu", "commandPalette", "localShortcut", "devRun"]
                            : ["itemMenu", "commandPalette", "devRun"],
                  input: {
                    source: index === 0 || index === 5 ? "none" : "pickerSelection",
                    selection: index === 0 || index === 5 ? "none" : index === 2 ? "oneOrMore" : index === 6 ? "active" : "one",
                    kinds: index === 0 || index === 5 ? null : ["text"],
                    mime: null,
                    query: null,
                  },
                  capabilities: ["history:read-content", "clipboard:write", "ui:toast", "log:write"],
                  builtin: false,
                  source: "script",
                  script: {
                    path: `C:\\Users\\JP\\Documents\\Copicu\\Scripts\\${fileName}`,
                    fileName,
                    sourceHash: `hash-${index}`,
                  },
                  diagnostics:
                    index === 2
                      ? [
                          {
                            severity: "warning",
                            message: "synthetic warning for registry debug",
                          },
                        ]
                      : index === 5
                        ? [
                            {
                              severity: "error",
                              message: "global shortcut is reserved for opening Copicu",
                            },
                          ]
                      : [],
                  logging: null,
                })),
              ];
            }
            return actions;
          }
          case "edit_script_in_vscode":
            return null;
          case "refresh_script_action_cache":
            return await (window as any).__TAURI_INTERNALS__.invoke("list_actions");
          case "run_action":
            return {
              actionId: args.request.actionId,
              status: "completed",
              message:
                args.request.actionId === "builtin.joinSelected"
                  ? `Joined ${args.request.context.selectedItemIds.length} items`
                  : "Action completed",
              toasts: [],
              effects:
                args.request.actionId === "examples.mock4"
                  ? [{ type: "picker.filter", query: "unbroken" }]
                  : [],
            };
          case "get_capture_tag_context":
            return (window as any).__copicuTestCaptureTagContext;
          case "arm_capture_tag_context": {
            const view = (window as any).__copicuTestSavedHistoryViews.find(
              (candidate: any) => candidate.id === args.viewId,
            );
            if (!view || view.captureTags.length === 0) {
              throw new Error("saved view has no capture tags");
            }
            const context = {
              viewId: view.id,
              viewTitle: view.title,
              query: view.query,
              tags: view.captureTags,
            };
            (window as any).__copicuTestCaptureTagContext = context;
            return context;
          }
          case "stop_capture_tag_context":
            (window as any).__copicuTestCaptureTagContext = null;
            return null;
          case "get_capture_snapshot":
            return {
              stats: {
                captured_count: items.length,
                captured_image_count: 0,
                ignored_duplicate_count: 0,
                ignored_empty_count: 0,
                ignored_image_with_text_count: 0,
                self_write_suppressed_count: 0,
                read_error_count: 0,
                event_count: items.length,
              },
              events: [],
            };
          case "get_clipboard_probe":
            return {
              platform: "test",
              sequence_number: null,
              format_count: 0,
              has_text: false,
              has_html: false,
              has_rtf: false,
              has_image: false,
              has_files: false,
              file_count: null,
              formats: [],
            };
          case "history_search":
          case "list_history_page": {
            const mockOptions = (window as any).__copicuTestMockOptions ?? {};
            const delayMs = mockOptions.historySearchDelayMs ?? 0;
            if (delayMs > 0) {
              await new Promise((resolve) => window.setTimeout(resolve, delayMs));
            }
            if (mockOptions.historySearchFailNext) {
              mockOptions.historySearchFailNext = false;
              throw new Error(mockOptions.historySearchFailMessage ?? "Synthetic history failure");
            }
            const sourceItems = (window as any).__copicuTestHistoryItems ?? items;
            const query = args?.query?.toLocaleLowerCase() ?? "";
            const request = args?.request ?? {};
            if (request.cursor && mockOptions.historySearchFailOnCursor) {
              throw new Error("Synthetic page failure");
            }
            const aiMode = request.mode === "ai";
            const displayQuery = request.displayQuery ?? request.query ?? "";
            const appliedDescriptor = request.appliedDescriptor ?? {
              schemaVersion: 1,
              displayQuery,
              effectiveQuery: request.query ?? "",
              mode: aiMode ? "ai" : "structured",
              plan: request.plan ?? { schemaVersion: 1, filters: {} },
              fingerprint: `synthetic:${aiMode ? "ai" : "structured"}:${displayQuery}:${request.query ?? ""}`,
            };
            const includeCounts = request.includeCounts !== false;
            const interpretedQuery = aiMode ? "long" : request.query ?? "";
            const requestQuery = (aiMode ? interpretedQuery : request.query?.toLocaleLowerCase()) ?? query;
            const queryTokens = (request.query ?? "").trim().split(/\s+/).filter(Boolean);
            const knownChip = (token: string) => /^(?:-?(?:tag|tags|kind|type|is|mime|has|meta|metadata|title|note|notes|ctx|context|app|program|process|window|domain|site|source|format|fmt|after|since|before|until|on):.+|#.+)$/i.test(token);
            const diagnostics = queryTokens.includes("kind:")
              ? [{ severity: "error", code: "missingValue", message: "Add a value after `kind:`." }]
              : [];
            const queryExplanation = request.explain
              ? {
                  version: 1,
                  chips: queryTokens
                    .filter(knownChip)
                    .map((token: string, index: number) => ({
                      label: token,
                      queryWithoutClause: queryTokens.filter((_: string, candidateIndex: number) => candidateIndex !== index).join(" "),
                    })),
                  diagnostics,
                }
              : null;
            const limit = request.limit ?? 60;
            const includeContent = Boolean(request.includeContent);
            const filteredItems = diagnostics.length > 0
              ? []
              : requestQuery
              ? sourceItems.filter((item: any) => {
                  if (requestQuery === "is:marked") {
                    return Boolean(item.is_marked);
                  }
                  if (requestQuery === "-is:marked") {
                    return !item.is_marked;
                  }
                  return [
                    item.text,
                    item.title ?? "",
                    item.notes ?? "",
                    item.tags ?? "",
                  ]
                    .join(" ")
                    .toLocaleLowerCase()
                    .includes(requestQuery);
                })
              : sourceItems;
            const cursor = request.cursor;
            const startIndex = cursor
              ? filteredItems.findIndex(
                  (item: any) =>
                    (item.last_copied_at_unix_ms ?? item.created_at_unix_ms) === cursor.afterSortUnixMs &&
                    item.id === cursor.afterId,
                ) + 1
              : 0;
            const pageItems = filteredItems
              .slice(startIndex, startIndex + limit)
              .map((item: any) => withHistoryPreview(item, includeContent));
            const nextItem = filteredItems[startIndex + limit - 1];
            const hasNextPage = startIndex + limit < filteredItems.length;
            return {
              items: pageItems,
              nextCursor:
                hasNextPage && nextItem
                  ? {
                      afterSortUnixMs: nextItem.last_copied_at_unix_ms ?? nextItem.created_at_unix_ms,
                      afterId: nextItem.id,
                    }
                  : null,
              totalCount: includeCounts ? sourceItems.length : null,
              filteredCount: includeCounts ? filteredItems.length : null,
              interpretedQuery: request.explain ? interpretedQuery : null,
              explanation: request.explain
                ? diagnostics.length > 0
                  ? "Fix the structured search syntax before searching."
                  : aiMode
                    ? "Synthetic AI interpreted long text search."
                    : "Structured local history search."
                : null,
              queryExplanation,
              warnings: aiMode ? ["Synthetic unsupported source filter ignored."] : [],
              appliedDescriptor,
            };
          }
          case "get_history_item": {
            const sourceItems = (window as any).__copicuTestHistoryItems ?? items;
            const item = sourceItems.find((candidate: any) => candidate.id === args.id);
            if (!item) {
              throw new Error(`Synthetic item not found: ${args.id}`);
            }
            return withHistoryPreview(item, true);
          }
          case "list_recent_items":
            return items;
          case "list_tags":
            return (window as any).__copicuTestTags;
          case "get_item_tags": {
            const sourceItems = (window as any).__copicuTestHistoryItems ?? items;
            const item = sourceItems.find((candidate: any) => candidate.id === args.id);
            return (item?.tags ?? "")
              .split(/\s+/)
              .map((tag: string) => tag.replace(/^#/, "").trim())
              .filter(Boolean);
          }
          case "apply_item_tags": {
            const request = args.request;
            const ids = new Set(request.itemIds);
            (window as any).__copicuTestHistoryItems = (
              (window as any).__copicuTestHistoryItems ?? items
            ).map((item: any) => {
              if (!ids.has(item.id)) {
                return item;
              }
              const existing = (item.tags ?? "")
                .split(/\s+/)
                .map((tag: string) => tag.replace(/^#/, "").trim())
                .filter(Boolean);
              const nextTags = request.mode === "patch"
                ? [...new Set([
                    ...existing.filter((tag: string) => !request.removeTags.includes(tag)),
                    ...request.tags,
                  ])]
                : request.tags;
              return { ...item, tags: nextTags.map((tag: string) => `#${tag}`).join(" ") || null };
            });
            return null;
          }
          case "list_saved_history_views":
            return (window as any).__copicuTestSavedHistoryViews;
          case "create_saved_history_view": {
            const request = args.request;
            const now = Date.now();
            const next = {
              id: Math.max(0, ...(window as any).__copicuTestSavedHistoryViews.map((view: any) => view.id)) + 1,
              ...request,
              hotkey: request.hotkey || null,
              openMode: "browse",
              pinned: false,
              sortOrder: null,
              createdAtUnixMs: now,
              updatedAtUnixMs: now,
            };
            (window as any).__copicuTestSavedHistoryViews = [
              ...(window as any).__copicuTestSavedHistoryViews,
              next,
            ];
            return next;
          }
          case "update_saved_history_view": {
            const request = args.request;
            (window as any).__copicuTestSavedHistoryViews = (window as any).__copicuTestSavedHistoryViews.map(
              (view: any) => view.id === request.id
                ? { ...view, ...request, hotkey: request.hotkey || null, updatedAtUnixMs: Date.now() }
                : view,
            );
            return (window as any).__copicuTestSavedHistoryViews.find((view: any) => view.id === request.id);
          }
          case "delete_saved_history_view":
            (window as any).__copicuTestSavedHistoryViews = (window as any).__copicuTestSavedHistoryViews.filter(
              (view: any) => view.id !== args.id,
            );
            return null;
          case "list_scenarios":
            return (window as any).__copicuTestScenarios;
          case "create_scenario_from_query":
          case "create_scenario": {
            const request = args.request;
            const now = Date.now();
            const next = {
              id: Math.max(0, ...(window as any).__copicuTestScenarios.map((scenario: any) => scenario.id)) + 1,
              ...request,
              revision: 1,
              createdAtUnixMs: now,
              updatedAtUnixMs: now,
            };
            (window as any).__copicuTestScenarios = [...(window as any).__copicuTestScenarios, next];
            return next;
          }
          case "update_scenario_from_query":
          case "update_scenario": {
            const request = args.request;
            (window as any).__copicuTestScenarios = (window as any).__copicuTestScenarios.map(
              (scenario: any) => scenario.id === request.id
                ? {
                    ...scenario,
                    ...request,
                    revision: scenario.revision + 1,
                    updatedAtUnixMs: Date.now(),
                  }
                : scenario,
            );
            return (window as any).__copicuTestScenarios.find((scenario: any) => scenario.id === request.id);
          }
          case "delete_scenario":
            (window as any).__copicuTestScenarios = (window as any).__copicuTestScenarios.filter(
              (scenario: any) => scenario.id !== args.id,
            );
            if ((window as any).__copicuTestActiveScenarioSession?.scenarioId === args.id) {
              (window as any).__copicuTestActiveScenarioSession = null;
              await (window as any).__copicuTestEmitEvent("copicu://scenario/session-changed", null);
            }
            return null;
          case "get_active_scenario_session":
            return (window as any).__copicuTestActiveScenarioSession;
          case "activate_scenario": {
            const scenario = (window as any).__copicuTestScenarios.find(
              (candidate: any) => candidate.id === args.id,
            );
            const session = {
              sessionId: `scenario-${scenario.id}-${Date.now()}`,
              scenarioId: scenario.id,
              scenarioName: scenario.name,
              scenarioRevision: scenario.revision,
              query: scenario.query,
              properties: scenario.properties,
              tags: scenario.tags,
              startedAtUnixMs: Date.now(),
            };
            (window as any).__copicuTestActiveScenarioSession = session;
            await (window as any).__copicuTestEmitEvent("copicu://scenario/session-changed", session);
            await (window as any).__copicuTestEmitEvent("copicu://picker/filter", {
              query: scenario.query,
            });
            return session;
          }
          case "stop_active_scenario":
            (window as any).__copicuTestActiveScenarioSession = null;
            await (window as any).__copicuTestEmitEvent("copicu://scenario/session-changed", null);
            return null;
          case "pending_metadata_editor": {
            const item = ((window as any).__copicuTestHistoryItems ?? items)[3] ?? items[0];
            return {
              item: withHistoryPreview(item, true),
              itemTags: (item.tags ?? "")
                .split(/\s+/)
                .map((tag: string) => tag.replace(/^#/, "").trim())
                .filter(Boolean),
              itemProperties: {
                client: ["ACME"],
                project: ["Web"],
                activity: ["Development"],
              },
              captureContextEvents: [
                {
                  id: 1,
                  capturedAtUnixMs: 1782154403281,
                  sourceKind: "clipboard",
                  sourceAppName: "code.exe",
                  sourceAppPath: "C:\\Tools\\VS Code\\Code.exe",
                  sourceProcessId: 4242,
                  sourceWindowId: 9001,
                  sourceWindowTitle: "main.rs - Copicu",
                  contentKind: "text",
                  mimePrimary: "text/plain",
                  clipboardPlatform: "windows",
                  clipboardSequenceNumber: 597,
                  clipboardFormatCount: 4,
                  clipboardFormatsText: "CF_UNICODETEXT text HTML Format registered",
                  byteSize: 82,
                  textCharCount: 64,
                  lineCount: 1,
                  domain: "example.com",
                  scenarioId: 1,
                  scenarioSessionId: "scenario-1-test",
                  scenarioRevision: 1,
                },
              ],
            };
          }
          case "update_item_metadata": {
            const request = args.request;
            (window as any).__copicuTestHistoryItems = (
              (window as any).__copicuTestHistoryItems ?? items
            ).map((item: any) => item.id === request.id
              ? {
                  ...item,
                  title: request.title,
                  notes: request.notes,
                  tags: request.tags.map((tag: string) => `#${tag}`).join(" ") || null,
                }
              : item);
            return null;
          }
          case "create_tag": {
            const label = args.request.label.trim();
            const nextTag = {
              id: Date.now(),
              slug: label.toLocaleLowerCase().replace(/\s+/g, "-"),
              label,
              color: null,
              pinned: false,
              sortOrder: null,
              itemCount: 0,
              hotkey: null,
              autoApplyEnabled: false,
              status: "ready",
            };
            (window as any).__copicuTestTags = [
              ...(window as any).__copicuTestTags,
              nextTag,
            ];
            return nextTag;
          }
          case "delete_tag": {
            (window as any).__copicuTestTags = (window as any).__copicuTestTags.filter(
              (tag: any) => tag.id !== args.id,
            );
            return null;
          }
          case "update_tag_config": {
            const request = args.request;
            (window as any).__copicuTestTags = (window as any).__copicuTestTags.map(
              (tag: any) =>
                tag.id === request.tagId
                  ? {
                      ...tag,
                      pinned: request.pinned ?? tag.pinned,
                      hotkey: request.hotkey ?? tag.hotkey,
                      status: request.hotkey ? "hotkeyPending" : tag.status,
                    }
                  : tag,
            );
            return (window as any).__copicuTestTags.find((tag: any) => tag.id === request.tagId);
          }
          case "search_items": {
            const query = args?.query?.toLocaleLowerCase() ?? "";
            return items.filter((item) => item.text.toLocaleLowerCase().includes(query));
          }
          case "create_history_item": {
            const sourceItems = (window as any).__copicuTestHistoryItems ?? items;
            const request = args.request;
            const normalizedText = request.text.replace(/\r\n/g, "\n").trim();
            if (!normalizedText) {
              throw new Error("new item content cannot be empty");
            }
            const existing = sourceItems.find((item: any) => item.text.trim() === normalizedText);
            if (existing) {
              existing.notes = request.notes ?? existing.notes ?? null;
              existing.tags = [existing.tags, request.tags].filter(Boolean).join(" ") || null;
              existing.last_copied_at_unix_ms = Date.now();
              existing.copy_count = (existing.copy_count ?? 1) + 1;
              (window as any).__copicuTestHistoryItems = [
                existing,
                ...sourceItems.filter((item: any) => item.id !== existing.id),
              ];
              return { id: existing.id, created: false };
            }
            const nextId = Math.max(...sourceItems.map((item: any) => item.id), 0) + 1;
            const nextItem = {
              id: nextId,
              content_kind: "text",
              text: normalizedText,
              normalized_hash: `manual-${nextId}`,
              created_at_unix_ms: Date.now(),
              last_used_at_unix_ms: Date.now(),
              last_copied_at_unix_ms: Date.now(),
              copy_count: 1,
              mime_primary: request.mimePrimary ?? "text/plain",
              blob_path: null,
              thumbnail_path: null,
              byte_size: null,
              width: null,
              height: null,
              thumbnail_data_url: null,
              title: request.title ?? null,
              notes: request.notes ?? null,
              tags: request.tags ?? null,
            };
            (window as any).__copicuTestHistoryItems = [nextItem, ...sourceItems];
            return { id: nextId, created: true };
          }
          case "hide_picker":
          case "hide_whichkey_window":
          case "open_settings_window":
          case "open_scenario_settings":
          case "close_settings_window":
          case "close_metadata_window":
          case "activate_item":
          case "update_history_item":
          case "delete_history_item":
            return null;
          case "count_marked_history_items":
            return ((window as any).__copicuTestHistoryItems ?? items).filter(
              (item: any) => Boolean(item.is_marked),
            ).length;
          case "set_history_items_marked": {
            const request = args.request;
            const ids = new Set(request.ids);
            (window as any).__copicuTestHistoryItems = (
              (window as any).__copicuTestHistoryItems ?? items
            ).map((item: any) =>
              ids.has(item.id)
                ? {
                    ...item,
                    is_marked: request.marked,
                    marked_at_unix_ms: request.marked ? Date.now() : null,
                  }
                : item,
            );
            return null;
          }
          case "set_history_query_marked": {
            const request = args.request;
            const query = request.query.toLocaleLowerCase();
            (window as any).__copicuTestHistoryItems = (
              (window as any).__copicuTestHistoryItems ?? items
            ).map((item: any) => {
              const matches = [item.text, item.title ?? "", item.notes ?? "", item.tags ?? ""]
                .join(" ")
                .toLocaleLowerCase()
                .includes(query);
              return matches
                ? {
                    ...item,
                    is_marked: request.marked,
                    marked_at_unix_ms: request.marked ? Date.now() : null,
                  }
                : item;
            });
            return null;
          }
          case "clear_marked_history_items":
            (window as any).__copicuTestHistoryItems = (
              (window as any).__copicuTestHistoryItems ?? items
            ).map((item: any) => ({
              ...item,
              is_marked: false,
              marked_at_unix_ms: null,
            }));
            return null;
          case "consume_picker_session_snapshot": {
            const delayMs = (window as any).__copicuTestMockOptions?.pickerSessionDelayMs ?? 0;
            if (delayMs > 0) {
              await new Promise((resolve) => window.setTimeout(resolve, delayMs));
            }
            return (window as any).__copicuTestPickerSessionSnapshots.shift() ?? {
              reset: false,
              generation: 0,
              pendingActivationItemId: null,
            };
          }
          case "plugin:window|is_visible":
            return (window as any).__copicuTestWindowVisible;
          case "open_item_preview":
          case "toggle_item_preview":
            return true;
          case "pending_item_preview": {
            const item = items[0];
            return item ? {
              itemId: item.id,
              contentKind: item.content_kind,
              text: item.text,
              mimePrimary: item.mime_primary ?? null,
              thumbnailDataUrl: item.thumbnail_data_url ?? null,
              width: item.width ?? null,
              height: item.height ?? null,
              title: item.title ?? null,
            } : null;
          }
          case "load_item_preview_image": {
            const item = items.find((candidate: any) => candidate.id === args.itemId);
            return item?.full_image_data_url ?? item?.thumbnail_data_url ?? null;
          }
          case "normalize_hotkey_sequence":
            return { normalized: args.input, valid: Boolean(args.input), error: null };
          case "get_settings":
            return (window as any).__copicuTestSettings;
          case "update_settings":
            (window as any).__copicuTestSettings = args.settings;
            return args.settings;
          case "set_picker_search_trigger_mode":
            if ((window as any).__copicuTestMockOptions?.searchTriggerUpdateDelayMs > 0) {
              await new Promise((resolve) => window.setTimeout(
                resolve,
                (window as any).__copicuTestMockOptions.searchTriggerUpdateDelayMs,
              ));
            }
            (window as any).__copicuTestSettings = {
              ...(window as any).__copicuTestSettings,
              picker: {
                ...(window as any).__copicuTestSettings.picker,
                searchTriggerMode: args.mode,
              },
            };
            return (window as any).__copicuTestSettings;
          default:
            throw new Error(`Unhandled mocked Tauri command: ${cmd}`);
        }
      },
      transformCallback: (callback: (event: unknown) => unknown) => {
        const callbackId = nextCallbackId++;
        eventCallbacks.set(callbackId, callback);
        return callbackId;
      },
      unregisterCallback: (callbackId: number) => eventCallbacks.delete(callbackId),
      unregisterListener: () => undefined,
      callbacks: {},
      convertFileSrc: (filePath: string) => filePath,
      metadata: {
        currentWindow: { label: "main" },
        currentWebview: { label: "main" },
      },
    };
  }, { items: historyItems, pending: initialCompoundPending, mockOptions: options });
}

function gotoShell(page: Page, url = "/") {
  return page.goto(url, { waitUntil: "domcontentloaded" });
}

async function openPickerOverflow(page: Page) {
  await page.getByRole("button", { name: "Open picker menu" }).click();
  const menu = page.getByRole("menu", { name: "Picker menu" });
  await expect(menu).toBeVisible();
  return menu;
}

async function waitForDefaultHistoryReady(page: Page) {
  await expect(page.locator("[title='Result count']")).toHaveText("4 total");
  await expect(page.getByRole("button", { name: /COPICU_SYNTH_MARKDOWN/ })).toHaveClass(/is-selected/);
}

async function selectLongSingleLine(page: Page) {
  await waitForDefaultHistoryReady(page);
  const item = page.getByRole("button", { name: /COPICU_SYNTH_LONG_SINGLE_LINE/ });
  await item.click();
  await expect(item).toHaveClass(/is-selected/);
}

async function selectLongSingleLineAndUnbroken(page: Page) {
  await selectLongSingleLine(page);
  const unbroken = page.getByRole("button", { name: /COPICU_SYNTH_LONG_UNBROKEN/ });
  await unbroken.click({ modifiers: ["Control"] });
  await expect(page.getByRole("button", { name: /COPICU_SYNTH_LONG_SINGLE_LINE/ })).toHaveClass(/is-multi-selected/);
  await expect(unbroken).toHaveClass(/is-multi-selected/);
}

test("shell loads without horizontal overflow", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page);

  await expect(page.getByLabel("Search clipboard history")).toBeVisible();
  await expect(page.getByLabel("Clipboard picker")).toBeVisible();
  await expect(page.getByLabel("Move Copicu")).toBeVisible();
  await expect(page.getByLabel("Hide Copicu")).toBeVisible();

  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(hasHorizontalOverflow).toBe(false);
});

test("picker shell keeps semantic feed state and only mounts active context strips", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page);

  await expect(page.locator(".picker-header")).toBeVisible();
  await expect(page.getByRole("list", { name: "Clipboard history results" })).toBeVisible();
  await expect(page.getByRole("status", { name: "Picker status" })).toContainText("Current clip 100.");
  await expect(page.getByRole("status", { name: "Picker status" })).toContainText("No clips selected.");
  await expect(page.locator(".context-strip")).toHaveCount(0);

  await page.locator(".feed-item").first().click();
  await expect(page.getByRole("status", { name: "Picker status" })).toContainText("Current clip 100.");

  const pickerMenu = await openPickerOverflow(page);
  await pickerMenu.getByRole("menuitem", { name: /Work clips/ }).click();
  await expect(page.locator(".context-strip")).toHaveCount(1);
  await expect(page.getByTestId("saved-view-bar")).toContainText("Work clips");
});

test("picker row kebab and grouped menu stay keyboard reachable at 420 px", async ({ page }) => {
  await page.setViewportSize({ width: 420, height: 640 });
  await mockTauriInvoke(page);
  await gotoShell(page);

  const row = page.locator(".history-feed.has-items > li").first();
  const kebab = row.getByRole("button", { name: "Open item actions" });
  await expect(kebab).toHaveCSS("pointer-events", "auto");
  await kebab.click();

  const menu = page.getByRole("menu", { name: "Item actions" });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("group", { name: "Principal" })).toBeVisible();
  await expect(menu.getByRole("group", { name: "Editar" })).toBeVisible();
  await expect(menu.getByRole("group", { name: "Más" })).toBeVisible();
  await expect(menu.getByRole("menuitem").first()).toBeFocused();

  const menuItems = menu.getByRole("menuitem");
  await page.keyboard.press("ArrowDown");
  await expect(menuItems.nth(1)).toBeFocused();
  await page.keyboard.press("End");
  await expect(menuItems.last()).toBeFocused();
  await page.keyboard.press("Home");
  await expect(menuItems.first()).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(menuItems.last()).toBeFocused();

  const fitsViewport = await menu.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return rect.left >= 0 && rect.right <= window.innerWidth && rect.top >= 0 && rect.bottom <= window.innerHeight;
  });
  expect(fitsViewport).toBe(true);

  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(kebab).toBeFocused();
});

test("current navigation stays separate from explicit bulk selection", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page);

  const rows = page.locator(".feed-item");
  const first = rows.nth(0);
  const second = rows.nth(1);
  const firstRow = page.locator(".history-feed.has-items > li").first();
  await first.click();
  await expect(first).toHaveAttribute("aria-current", "true");
  await expect(firstRow.getByLabel("Select item")).not.toBeChecked();
  await expect(page.locator(".selection-action-bar")).toHaveCount(0);
  await expect(page.getByRole("status", { name: "Picker status" })).toContainText("No clips selected.");

  await page.getByLabel("Search clipboard history").press("ArrowDown");
  await expect(second).toHaveAttribute("aria-current", "true");
  await expect(page.locator(".selection-action-bar")).toHaveCount(0);

  const firstCheckbox = firstRow.getByLabel("Select item");
  const checkboxTarget = await firstRow.locator(".item-selection-button").boundingBox();
  expect(checkboxTarget?.width).toBeGreaterThanOrEqual(44);
  expect(checkboxTarget?.height).toBeGreaterThanOrEqual(44);
  await firstCheckbox.click();
  await expect(page.getByLabel("1 selected", { exact: true })).toBeVisible();
  await expect(firstRow.getByLabel("Deselect item")).toBeChecked();
  await expect(page.getByRole("status", { name: "Picker status" })).toContainText("1 clip selected.");

  await page.locator(".selection-action-bar").getByRole("button", { name: "Clear", exact: true }).click();
  await expect(page.locator(".selection-action-bar")).toHaveCount(0);
  await expect(first).toHaveAttribute("aria-current", "true");
  await page.getByLabel("Search clipboard history").press("ArrowDown");
  await expect(second).toHaveAttribute("aria-current", "true");
  await expect(page.locator(".selection-action-bar")).toHaveCount(0);
});

test("picker menu renders compact shortcut keycaps including configured Settings hotkey", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page);

  await page.getByRole("button", { name: "Open picker menu" }).click();
  const menu = page.getByRole("menu", { name: "Picker menu" });
  const settingsItem = menu.getByRole("menuitem", { name: /Settings/ });
  await expect(settingsItem).toContainText("Ctrl");
  await expect(settingsItem).toContainText(",");
  await expect(settingsItem.locator("kbd")).toHaveCount(2);
  await expect(menu.getByRole("menuitem", { name: /Quick Actions/ }).locator("kbd")).toHaveCount(3);

  const hasOverflow = await menu.evaluate((element) => element.scrollWidth > element.clientWidth + 1);
  expect(hasOverflow).toBe(false);
});

test("picker overlays mount from an inactive shell without a context strip", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page);
  await expect(page.locator(".context-strip")).toHaveCount(0);

  const menu = await openPickerOverflow(page);
  await menu.getByRole("menuitem", { name: "Search help" }).click();
  const help = page.getByRole("dialog", { name: "Search and AI help" });
  await expect(help).toBeVisible();
  await help.getByRole("button", { name: "Close search help" }).click();

  const viewsMenu = await openPickerOverflow(page);
  await viewsMenu.getByRole("menuitem", { name: "Save current search as view" }).click();
  const viewCreator = page.getByRole("dialog", { name: "Save current search as view" });
  await expect(viewCreator).toBeVisible();
  await viewCreator.getByRole("button", { name: "Close saved view creator" }).click();

  const scenariosMenu = await openPickerOverflow(page);
  await scenariosMenu.getByRole("menuitem", { name: "Create from current search" }).click();
  await expect(page.getByRole("dialog", { name: "Create scenario" })).toBeVisible();
});

test("new item dialog creates a manual history item", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page);

  await page.getByLabel("Search clipboard history").press("Control+N");
  const dialog = page.getByRole("dialog", { name: "Create new item" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("textbox", { name: "Content" })).toBeFocused();

  const contentInput = dialog.getByRole("textbox", { name: "Content" });
  const metadataInput = dialog.getByRole("textbox", { name: "Metadata" });
  await contentInput.fill("COPICU_SYNTH_MANUAL_ITEM");
  await metadataInput.focus();
  await page.keyboard.type("#manual created from Copicu");
  await expect(metadataInput).toBeFocused();
  await expect(contentInput).toHaveValue("COPICU_SYNTH_MANUAL_ITEM");
  await dialog.getByRole("button", { name: "Create" }).click();

  await expect(dialog).toBeHidden();
  await expect(page.getByRole("button", { name: /COPICU_SYNTH_MANUAL_ITEM/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /COPICU_SYNTH_MANUAL_ITEM/ })).toHaveClass(/is-selected/);
  const createCall = await page.evaluate(() =>
    (window as any).__copicuTestInvocations.find((call: any) => call.cmd === "create_history_item"),
  );
  expect(createCall.args.request).toMatchObject({
    text: "COPICU_SYNTH_MANUAL_ITEM",
    notes: "#manual created from Copicu",
    tags: "#manual",
    mimePrimary: "text/plain",
  });
});

test("new item duplicate promotes the existing history item", async ({ page }) => {
  const existing = {
    ...syntheticLongHistory[1],
    id: 9001,
    text: "COPICU_SYNTH_DUPLICATE_MANUAL_ITEM",
    normalized_hash: "synthetic-duplicate-manual-item",
    notes: "#first",
    tags: "#first",
    last_copied_at_unix_ms: 1_700_000_000_000,
  };
  const newer = {
    ...syntheticLongHistory[2],
    id: 9002,
    text: "COPICU_SYNTH_NEWER_ITEM",
    normalized_hash: "synthetic-newer-item",
    last_copied_at_unix_ms: 1_800_000_000_000,
  };
  await mockTauriInvoke(page, [newer, existing]);
  await gotoShell(page);

  await page.getByLabel("Search clipboard history").press("Control+N");
  const dialog = page.getByRole("dialog", { name: "Create new item" });
  await dialog.getByRole("textbox", { name: "Content" }).fill("COPICU_SYNTH_DUPLICATE_MANUAL_ITEM");
  await dialog.getByRole("textbox", { name: "Metadata" }).fill("#second duplicate metadata");
  await dialog.getByRole("button", { name: "Create" }).click();

  await expect(dialog).toBeHidden();
  const historyState = await page.evaluate(() => (window as any).__copicuTestHistoryItems);
  expect(historyState[0]).toMatchObject({
    id: 9001,
    text: "COPICU_SYNTH_DUPLICATE_MANUAL_ITEM",
    copy_count: 2,
  });
  expect(historyState[0].tags).toContain("#first");
  expect(historyState[0].tags).toContain("#second");
});

test("command palette exposes new item action", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page);

  await page.getByLabel("Search clipboard history").press("Control+K");
  const palette = page.getByRole("dialog", { name: "Command palette" });
  await expect(palette).toBeVisible();
  await expect(palette.getByRole("option", { name: /New item/ })).toBeVisible();
  await page.getByLabel("Search commands").fill("new");
  await page.keyboard.press("Enter");

  await expect(page.getByRole("dialog", { name: "Create new item" })).toBeVisible();
});

test("command palette navigates history, saved views, and pinned tags", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page);

  await page.getByLabel("Search clipboard history").press("Control+K");
  const palette = page.getByRole("dialog", { name: "Command palette" });
  await expect(palette.getByText("History", { exact: true })).toBeVisible();
  await expect(palette.getByRole("option", { name: /All history/ })).toBeVisible();
  await expect(palette.getByRole("option", { name: /Work clips/ })).toBeVisible();
  await expect(palette.locator("#command-palette-entry-tag\\.1")).toBeVisible();
  await expect(palette.getByRole("option", { name: /Backend/ })).toHaveCount(0);

  await palette.getByRole("option", { name: /Work clips/ }).click();
  await expect(palette).toBeHidden();
  await expect(page.getByLabel("Search clipboard history")).toHaveValue("tag:work kind:text");
  await page.waitForFunction(() =>
    (window as any).__copicuTestInvocations.some(
      (call: any) => call.cmd === "history_search" && call.args.request.query === "tag:work kind:text",
    ),
  );
});

test("picker discovers, opens, exits, and manages saved views without capture context", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page);

  let viewsMenu = await openPickerOverflow(page);
  await expect(viewsMenu.getByRole("menuitem", { name: /Work clips/ })).toBeVisible();
  await expect(viewsMenu.getByRole("menuitem", { name: "Manage saved views" })).toBeVisible();
  await viewsMenu.getByRole("menuitem", { name: /Work clips/ }).click();

  const viewBar = page.getByTestId("saved-view-bar");
  await expect(viewBar).toContainText("Saved view");
  await expect(viewBar).toContainText("Work clips");
  await expect(viewBar).toContainText("tag:work kind:text");
  await expect(viewBar).not.toContainText("#Work");
  await expect(page.getByRole("button", { name: "Capture here" })).toHaveCount(0);
  await expect(page.getByLabel("Search clipboard history")).toHaveValue("tag:work kind:text");

  await page.getByLabel("Search clipboard history").fill("tag:context-smoke");
  await expect(viewBar).toHaveCount(0);

  viewsMenu = await openPickerOverflow(page);
  await viewsMenu.getByRole("menuitem", { name: /Work clips/ }).click();
  await page.getByRole("button", { name: "Exit saved view Work clips" }).click();
  await expect(page.getByTestId("saved-view-bar")).toHaveCount(0);
  await expect(page.getByLabel("Search clipboard history")).toHaveValue("tag:work kind:text");

  viewsMenu = await openPickerOverflow(page);
  await viewsMenu.getByRole("menuitem", { name: "Manage saved views" }).click();
  await page.waitForFunction(() =>
    (window as any).__copicuTestInvocations.some((call: any) => call.cmd === "open_saved_views_settings"),
  );
  const captureArms = await page.evaluate(() =>
    (window as any).__copicuTestInvocations.filter((call: any) => call.cmd === "arm_capture_tag_context").length,
  );
  expect(captureArms).toBe(0);
});

test("picker saves the current search as a view from the Views menu", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page);

  const search = page.getByLabel("Search clipboard history");
  await search.fill("kind:image after:7d");
  const menu = await openPickerOverflow(page);
  await menu.getByRole("menuitem", { name: "Save current search as view" }).click();

  const creator = page.getByRole("dialog", { name: "Save current search as view" });
  await expect(creator.getByRole("code")).toHaveText("kind:image after:7d");
  await creator.getByLabel("Saved view name").fill("Recent images");
  await creator.getByRole("button", { name: "Save view" }).click();
  await expect(creator).toBeHidden();

  await openPickerOverflow(page);
  await expect(menu.getByRole("menuitem", { name: /Recent images/ })).toBeVisible();
  await page.waitForFunction(() =>
    (window as any).__copicuTestInvocations.some(
      (call: any) => call.cmd === "create_saved_history_view"
        && call.args.request.title === "Recent images"
        && call.args.request.query === "kind:image after:7d"
        && call.args.request.hotkey === null
        && call.args.request.captureTags.length === 0,
    ),
  );
});

test("saved view access and identity fit the narrow picker", async ({ page }) => {
  await page.setViewportSize({ width: 420, height: 640 });
  await mockTauriInvoke(page);
  await gotoShell(page);

  const menu = await openPickerOverflow(page);
  await menu.getByRole("menuitem", { name: /Context clips/ }).click();
  const viewBar = page.getByTestId("saved-view-bar");
  await expect(viewBar).toContainText("Context clips");
  await expect(viewBar.getByRole("button", { name: "Exit saved view Context clips" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Capture here" })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(420);

  await viewBar.getByRole("button", { name: "Exit saved view Context clips" }).click();
  await expect(viewBar).toHaveCount(0);
});

test("Apply stays inside the single compact primary band at 420 px", async ({ page }) => {
  await page.setViewportSize({ width: 420, height: 640 });
  await mockTauriInvoke(page, syntheticLongHistory, null, { searchTriggerMode: "enter" });
  await gotoShell(page);

  const search = page.getByLabel("Search clipboard history");
  await search.fill("tag:work");
  const apply = page.getByRole("button", { name: "Apply search" });
  await expect(apply).toBeVisible();
  const layout = await page.locator(".search-row").evaluate((row) => {
    const bandTolerance = 20;
    const centers = [...row.children]
      .filter((element) => {
        const style = getComputedStyle(element);
        return style.display !== "none" && style.position !== "absolute";
      })
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return rect.top + rect.height / 2;
      })
      .sort((left, right) => left - right);
    const bands: number[] = [];
    for (const center of centers) {
      const previous = bands.at(-1);
      if (previous === undefined || Math.abs(center - previous) > bandTolerance) {
        bands.push(center);
      } else {
        bands[bands.length - 1] = (previous + center) / 2;
      }
    }
    const applyRect = row.querySelector<HTMLButtonElement>(".composer-run-button")?.getBoundingClientRect();
    return {
      bands,
      applyCenter: applyRect ? applyRect.top + applyRect.height / 2 : null,
    };
  });
  expect(layout.bands).toHaveLength(1);
  expect(layout.applyCenter).not.toBeNull();
  expect(layout.bands.some((center) => Math.abs(center - layout.applyCenter!) <= 20)).toBe(true);
});

test("AI composer keeps Search primary in one compact band at 420 px", async ({ page }) => {
  await page.setViewportSize({ width: 420, height: 640 });
  await mockTauriInvoke(page, syntheticLongHistory);
  await gotoShell(page);

  const pickerMenu = await openPickerOverflow(page);
  await pickerMenu.getByRole("menuitem", { name: "Switch to AI mode" }).click();
  const row = page.locator(".search-row.is-ai-mode");
  await expect(row).toBeVisible();
  const layout = await row.evaluate((element) => {
    const style = getComputedStyle(element);
    const search = element.querySelector<HTMLElement>(".search-field")?.getBoundingClientRect();
    return {
      columns: style.gridTemplateColumns.trim().split(/\s+/),
      rows: style.gridTemplateRows.trim().split(/\s+/),
      searchTop: search?.top ?? null,
      searchWidth: search?.width ?? null,
      scrollWidth: document.documentElement.scrollWidth,
    };
  });
  expect(layout.columns).toHaveLength(4);
  expect(layout.rows).toHaveLength(1);
  expect(layout.searchTop).not.toBeNull();
  expect(layout.searchWidth).not.toBeNull();
  expect(layout.searchWidth!).toBeGreaterThan(180);
  expect(layout.scrollWidth).toBeLessThanOrEqual(420);
});

test("settings removes the summary chip strip and confirms global tag deletion", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page, "/?window=settings");

  await expect(page.locator(".settings-status-strip")).toHaveCount(0);
  await page.getByRole("tab", { name: /Tags/ }).click();
  await expect(page.locator(".tag-settings-count")).toHaveText("2 tags");
  await expect(page.locator(".tag-settings-list")).toHaveCSS("overflow-y", "visible");
  const workRow = page.locator(".tag-settings-item").filter({ hasText: "Work" });
  await workRow.getByRole("button", { name: "Remove Work" }).click();
  await expect(workRow).toContainText("Remove from 4 items?");
  await workRow.getByRole("button", { name: "Remove tag" }).click();
  await expect(workRow).toHaveCount(0);
  await expect(page.locator(".tag-settings-count")).toHaveText("1 tag");
  await page.waitForFunction(() =>
    (window as any).__copicuTestInvocations.some(
      (call: any) => call.cmd === "delete_tag" && call.args.id === 1,
    ),
  );
});

test("saved view management stays independent from scenarios", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page, "/?window=settings");

  await page.getByRole("tab", { name: /History/ }).click();
  const savedViews = page.locator(".saved-history-views");
  await expect(savedViews).toContainText("Work clips");
  await expect(savedViews).not.toContainText("Capture:");
  await expect(savedViews.getByLabel("Capture tags")).toHaveCount(0);

  const workRow = savedViews.locator(".settings-tag-row").filter({ hasText: "Work clips" });
  await workRow.getByRole("button", { name: "Edit" }).click();
  await expect(savedViews.getByLabel("Title")).toHaveValue("Work clips");
  await expect(savedViews.getByLabel("Query")).toHaveValue("tag:work kind:text");
  await expect(savedViews.getByLabel("Optional global hotkey")).toHaveValue("");
  await expect(savedViews.getByLabel("Pin view")).toBeChecked();
  await savedViews.getByLabel("Query").fill("tag:work");
  await savedViews.getByRole("button", { name: "Save view" }).click();

  await page.waitForFunction(() =>
    (window as any).__copicuTestInvocations.some(
      (call: any) => call.cmd === "update_saved_history_view"
        && call.args.request.query === "tag:work"
        && call.args.request.captureTags.length === 1
        && call.args.request.captureTags[0] === "Work",
    ),
  );

  const contextRow = savedViews.locator(".settings-tag-row").filter({ hasText: "Context clips" });
  await contextRow.getByRole("button", { name: "Delete" }).click();
  await expect(contextRow).toHaveCount(0);
  const scenarioSnapshot = await page.evaluate(() =>
    (window as any).__copicuTestScenarios.map((scenario: any) => ({
      id: scenario.id,
      name: scenario.name,
      query: scenario.query,
    })),
  );
  expect(scenarioSnapshot).toEqual([
    { id: 1, name: "Cliente ACME / Proyecto Web", query: "tag:work kind:text" },
    { id: 2, name: "Internal review", query: "tag:work kind:text" },
  ]);
});

test("settings manages scenarios independently, then activates, switches, and stops", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page, "/?window=settings");

  await page.getByRole("tab", { name: /Scenarios/ }).click();
  const scenarios = page.getByTestId("scenario-settings");
  await expect(scenarios).toContainText("Scenarios are workspaces for the picker");
  await expect(scenarios).toContainText("Cliente ACME / Proyecto Web");
  const savedViewsBefore = await page.evaluate(() =>
    JSON.stringify((window as any).__copicuTestSavedHistoryViews),
  );

  await scenarios.getByRole("button", { name: "New scenario" }).click();
  await expect(scenarios.getByText("All scenarios")).toBeVisible();
  await page.getByLabel("Scenario name").fill("Cliente ACME / QA");
  await page.getByLabel("Scenario query").fill("tag:qa");
  await scenarios.getByText("Advanced metadata").click();
  await page.getByLabel("Scenario client values").fill("ACME");
  await page.getByLabel("Scenario project values").fill("Web");
  await page.getByLabel("Scenario activity values").fill("QA, Review");
  await scenarios.getByRole("button", { name: "Create scenario" }).click();
  await expect(scenarios).toContainText("Cliente ACME / QA");

  const qaRow = scenarios.locator(".scenario-row").filter({ hasText: "Cliente ACME / QA" });
  await qaRow.getByRole("button", { name: "Edit" }).click();
  await expect(scenarios.locator(".scenario-list")).toHaveCount(0);
  await page.getByLabel("Scenario query").fill("tag:qa kind:text");
  await scenarios.getByRole("button", { name: "Save changes" }).click();
  await expect(qaRow).toContainText("tag:qa kind:text");
  expect(await page.evaluate(() => JSON.stringify((window as any).__copicuTestSavedHistoryViews)))
    .toBe(savedViewsBefore);
  await qaRow.getByRole("button", { name: "Delete" }).click();
  await expect(qaRow).toHaveCount(0);
  expect(await page.evaluate(() => JSON.stringify((window as any).__copicuTestSavedHistoryViews)))
    .toBe(savedViewsBefore);

  const acmeRow = scenarios.locator(".scenario-row").filter({ hasText: "Cliente ACME / Proyecto Web" });
  await acmeRow.getByRole("button", { name: "Activate" }).click();
  await expect(scenarios.locator(".scenario-session-summary")).toContainText("Cliente ACME / Proyecto Web");

  const internalRow = scenarios.locator(".scenario-row").filter({ hasText: "Internal review" });
  await internalRow.getByRole("button", { name: "Activate" }).click();
  await expect(scenarios.locator(".scenario-session-summary")).toContainText("Internal review");

  await scenarios.getByRole("button", { name: "Stop scenario" }).click();
  await expect(scenarios.locator(".scenario-session-summary")).toContainText("None");
});

test("picker scenario menu mirrors Views and supports Alt+S, switching, and Stop at narrow width", async ({ page }) => {
  await page.setViewportSize({ width: 420, height: 640 });
  await mockTauriInvoke(page);
  await gotoShell(page);

  await page.getByLabel("Search clipboard history").press("Alt+s");
  const menu = page.getByRole("menu", { name: "Picker menu" });
  await expect(menu).toBeVisible();
  await page.keyboard.press("Alt+s");
  await expect(menu).toBeHidden();
  await page.keyboard.press("Alt+s");
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: /Internal review/ })).toBeVisible();
  await menu.getByRole("menuitem", { name: /Internal review/ }).click();
  await expect(menu).toBeHidden();
  await expect(page.getByLabel(/Active scenario: Internal review/)).toBeVisible();
  await expect(page.getByTestId("saved-view-bar")).toHaveCount(0);
  await expect(page.getByLabel("Search clipboard history")).toHaveValue("tag:work kind:text");
  const layout = await page.evaluate(() => {
    const interpretation = document.querySelector(".search-interpretation")?.getBoundingClientRect();
    const feed = document.querySelector(".feed-panel")?.getBoundingClientRect();
    const firstItem = document.querySelector(".history-feed > li")?.getBoundingClientRect();
    return {
      interpretationHeight: interpretation?.height ?? 0,
      feedGap: interpretation && feed ? feed.top - interpretation.bottom : Number.POSITIVE_INFINITY,
      firstItemOffset: feed && firstItem ? firstItem.top - feed.top : Number.POSITIVE_INFINITY,
    };
  });
  expect(layout.interpretationHeight).toBeLessThan(140);
  expect(layout.feedGap).toBeLessThanOrEqual(2);
  expect(layout.firstItemOffset).toBeLessThan(16);

  await openPickerOverflow(page);
  await page.getByRole("menu", { name: "Picker menu" }).getByRole("menuitem", { name: /Cliente ACME/ }).click();
  await expect(page.getByLabel(/Active scenario: Cliente ACME/)).toBeVisible();

  await openPickerOverflow(page);
  await expect(page.getByRole("menu", { name: "Picker menu" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu", { name: "Picker menu" })).toBeHidden();

  await openPickerOverflow(page);
  await page.getByRole("menu", { name: "Picker menu" }).getByRole("menuitem", { name: "Stop scenario" }).click();
  await expect(page.getByRole("menu", { name: "Picker menu" })).toBeHidden();

  const manageMenu = await openPickerOverflow(page);
  await manageMenu.getByRole("menuitem", { name: "Manage scenarios" }).click();
  await page.waitForFunction(() =>
    (window as any).__copicuTestInvocations.some((call: any) => call.cmd === "open_scenario_settings"),
  );
});

test("switching to an edited scenario applies its updated picker view", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page);

  await page.evaluate(async () => {
    await (window as any).__TAURI_INTERNALS__.invoke("update_scenario", {
      request: {
        id: 2,
        name: "Internal review",
        query: "tag:context-smoke",
        properties: { client: ["Internal"], project: [], activity: ["Review"] },
        tags: [],
      },
    });
  });

  const search = page.getByLabel("Search clipboard history");
  await search.press("Alt+s");
  const menu = page.getByRole("menu", { name: "Picker menu" });
  await menu.getByRole("menuitem", { name: /Cliente ACME/ }).click();
  await expect(search).toHaveValue("tag:work kind:text");

  await search.press("Alt+s");
  await menu.getByRole("menuitem", { name: /Internal review/ }).click();
  await expect(search).toHaveValue("tag:context-smoke");
  await expect(page.getByLabel(/Active scenario: Internal review/)).toBeVisible();
});

test("picker creates and activates a scenario from the current query", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page);

  const search = page.getByLabel("Search clipboard history");
  await search.fill("#111");
  await expect(search).toHaveValue("#111");
  await search.press("Alt+s");
  const menu = page.getByRole("menu", { name: "Picker menu" });
  await menu.getByRole("menuitem", { name: "Create from current search" }).click();
  const creator = page.getByRole("dialog", { name: "Create scenario" });
  await expect(creator.getByRole("code")).toHaveText("#111");
  await expect(creator.getByRole("button", { name: "Remove tag 111" })).toBeVisible();
  await expect(creator.getByText("Advanced metadata")).toBeVisible();
  await creator.getByLabel("New scenario name").fill("Writing session");
  await creator.getByRole("button", { name: "Save and activate" }).click();

  await expect(creator).toBeHidden();
  await expect(page.getByLabel(/Active scenario: Writing session/)).toBeVisible();
  await expect(search).toHaveValue("#111");
  await page.waitForFunction(() =>
    (window as any).__copicuTestInvocations.some(
      (call: any) => call.cmd === "create_scenario_from_query"
        && call.args.request.query === "#111"
        && call.args.request.tags.length === 1
        && call.args.request.tags[0] === "111",
    ),
  );
});

test("> escenario activates as an action and restores the scenario view query", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page);

  const search = page.getByLabel("Search clipboard history");
  await search.fill("> escenario Internal");
  const actions = page.getByRole("listbox", { name: "Scenario actions" });
  await expect(actions.getByRole("option", { name: "Activate scenario: Internal review" })).toBeVisible();
  await search.press("Enter");
  await expect(search).toHaveValue("tag:work kind:text");
  await expect(page.getByLabel(/Active scenario: Internal review/)).toBeVisible();
  await expect(actions).toHaveCount(0);
});

test("active scenario remains visible through picker hide and reopen until Stop", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page);

  await page.evaluate(async () => {
    await (window as any).__TAURI_INTERNALS__.invoke("activate_scenario", { id: 1 });
  });
  const sessionBar = page.getByTestId("scenario-session-bar");
  await expect(sessionBar).toContainText("Cliente ACME / Proyecto Web");
  await expect(sessionBar).toContainText("client:ACME");
  await expect(page.getByLabel("Search clipboard history")).toHaveValue("tag:work kind:text");

  await page.getByRole("button", { name: "Hide" }).click();
  await page.evaluate(async () => {
    const session = await (window as any).__TAURI_INTERNALS__.invoke("get_active_scenario_session");
    await (window as any).__copicuTestEmitEvent("copicu://scenario/session-changed", session);
  });
  await expect(sessionBar).toContainText("Scenario active");
  await expect(page.getByLabel("Search clipboard history")).toHaveValue("tag:work kind:text");

  await sessionBar.getByRole("button", { name: "Stop" }).click();
  await expect(sessionBar).toHaveCount(0);
  await expect(page.getByLabel("Search clipboard history")).toHaveValue("tag:work kind:text");
});

test("WhichKey overlay reveals pending compound shortcuts", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page, "/?window=whichkey");

  await page.evaluate(() => {
    (window as any).__copicuTestCompoundPending = {
      prefixLabel: "Ctrl+Alt+C",
      nextSteps: ["H", "T"],
      entries: [
        {
          key: "H",
          label: "toast hello",
          group: "Scripts",
          routeId: "examples.toastHello",
          disabled: false,
          diagnostic: null,
        },
        {
          key: "T",
          label: "compound hotkey toast",
          group: "Scripts",
          routeId: "jp.compoundHotkeyToast",
          disabled: false,
          diagnostic: null,
        },
      ],
      expiresAtUnixMs: Date.now() + 3000,
    };
  });

  const overlay = page.getByLabel("WhichKey shortcuts");
  await expect(overlay).toBeVisible();
  await expect(overlay).toContainText("Ctrl+Alt+C");
  await expect(overlay).toContainText("compound hotkey toast");

  const horizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(horizontalOverflow).toBe(false);
});

test("WhichKey steps work with diagnostics off and no polling", async ({ page }) => {
  await mockTauriInvoke(
    page,
    syntheticLongHistory,
    {
      prefixLabel: "Ctrl+Alt+C",
      nextSteps: ["T"],
      entries: [
        {
          key: "T",
          label: "compound hotkey toast",
          group: "Scripts",
          routeId: "jp.compoundHotkeyToast",
          disabled: false,
          diagnostic: null,
        },
      ],
      expiresAtUnixMs: Date.now() + 3000,
    },
  );
  await gotoShell(page, "/?window=whichkey&copicuDiagnostics=0");

  await expect(page.getByLabel("WhichKey shortcuts")).toBeVisible();
  await expect(page.getByText("compound hotkey toast")).toBeVisible();
  await page.waitForTimeout(300);
  await page.keyboard.press("T");

  await page.waitForFunction(() => {
    const calls = (window as any).__copicuTestInvocations;
    return calls.some((call: any) => call.cmd === "handle_compound_hotkey_step");
  });
  const calls = await page.evaluate(() => (window as any).__copicuTestInvocations);
  const count = (cmd: string) => calls.filter((call: any) => call.cmd === cmd).length;
  expect(count("get_compound_hotkey_pending")).toBeLessThanOrEqual(2);
  expect(count("handle_compound_hotkey_step")).toBe(1);
});

test("WhichKey overlay fits narrow picker window", async ({ page }) => {
  await page.setViewportSize({ width: 380, height: 620 });
  await mockTauriInvoke(page);
  await gotoShell(page, "/?window=whichkey");

  await page.evaluate(() => {
    (window as any).__copicuTestCompoundPending = {
      prefixLabel: "Ctrl+Alt+C",
      nextSteps: ["T", "?"],
      entries: [
        {
          key: "T",
          label: "very long synthetic compound hotkey action label",
          group: "Scripts",
          routeId: "jp.syntheticLongWhichKeyAction",
          disabled: false,
          diagnostic: null,
        },
        {
          key: "?",
          label: "show shortcuts",
          group: "WhichKey",
          routeId: "whichkey.root",
          disabled: false,
          diagnostic: null,
        },
      ],
      expiresAtUnixMs: Date.now() + 3000,
    };
  });

  const overlay = page.getByLabel("WhichKey shortcuts");
  await expect(overlay).toBeVisible();

  const horizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(horizontalOverflow).toBe(false);
});

test("custom picker hide button hides instead of closing", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page);

  await page.getByLabel("Hide Copicu").click();
  await page.waitForFunction(() =>
    (window as any).__copicuTestInvocations.some(
      (call: any) => call.cmd === "hide_picker",
    ),
  );

  const hideCalls = await page.evaluate(() =>
    (window as any).__copicuTestInvocations.filter(
      (call: any) => call.cmd === "hide_picker",
    ).length,
  );
  expect(hideCalls).toBe(1);
});

test("selection controls stay transient and independent from persistent marks", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page);

  const master = page.getByLabel("Select all visible");
  await expect(master).toBeVisible();
  await master.click();
  const batchBar = page.getByLabel("4 selected", { exact: true });
  await expect(batchBar).toBeVisible();
  await expect(batchBar.getByRole("button", { name: "Tags", exact: true })).toBeVisible();
  await expect(batchBar.getByRole("button", { name: "Metadata", exact: true })).toBeVisible();
  await expect(batchBar.getByRole("button", { name: "Actions", exact: true })).toBeVisible();
  await expect(batchBar.getByRole("button", { name: "Delete", exact: true })).toBeVisible();
  await expect(batchBar.getByRole("button", { name: "Clear", exact: true })).toBeVisible();
  await expect(page.getByLabel("Deselect item")).toHaveCount(4);

  await page.getByLabel("Mark item").first().click();
  await expect(page.getByLabel("4 selected", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Unmark item")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Mark options, 1 marked" })).toBeVisible();

  await page.locator(".selection-action-bar").getByRole("button", { name: "Clear", exact: true }).click();
  await expect(page.locator(".selection-action-bar")).toHaveCount(0);
  await expect(page.getByLabel("Select item")).toHaveCount(4);
  await expect(page.getByLabel("Unmark item")).toHaveCount(1);

  const rows = page.locator(".feed-item");
  await rows.nth(0).click();
  await rows.nth(2).click({ modifiers: ["Shift"] });
  await expect(page.getByLabel("3 selected", { exact: true })).toBeVisible();
  await rows.nth(1).click({ modifiers: ["Control"] });
  await expect(page.getByLabel("2 selected", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Deselect item")).toHaveCount(2);
});

test("mark menu marks visible and individual items", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page);

  await page.getByLabel("Mark options").click();
  await page.getByRole("menu", { name: "Mark options" }).getByRole("menuitem", { name: "Mark visible", exact: true }).click();
  await page.waitForFunction(() => {
    const calls = (window as any).__copicuTestInvocations;
    return calls.some((call: any) => call.cmd === "set_history_items_marked");
  });
  const markAllRequest = await page.evaluate(() =>
    (window as any).__copicuTestInvocations
      .filter((call: any) => call.cmd === "set_history_items_marked")
      .at(-1)
      .args.request,
  );
  expect(markAllRequest.marked).toBe(true);
  expect(markAllRequest.ids.length).toBeGreaterThan(1);
  await expect(page.getByLabel("Unmark item").first()).toBeVisible();

  await page.getByLabel("Unmark item").first().click();
  await page.waitForFunction(() => {
    const calls = (window as any).__copicuTestInvocations;
    return calls.filter((call: any) => call.cmd === "set_history_items_marked").length >= 2;
  });
  const itemRequest = await page.evaluate(() =>
    (window as any).__copicuTestInvocations
      .filter((call: any) => call.cmd === "set_history_items_marked")
      .at(-1)
      .args.request,
  );
  expect(itemRequest.marked).toBe(false);
  expect(itemRequest.ids).toHaveLength(1);
});

test("mark menu uses Mantine menu actions", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page);

  await page.getByLabel("Mark options").click();
  const menu = page.getByRole("menu", { name: "Mark options" });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Mark visible", exact: true })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Unmark visible", exact: true })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Mark all results", exact: true })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Unmark all results", exact: true })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Marked", exact: true })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Unmarked", exact: true })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "All history" })).toBeVisible();
  await expect(menu.locator("svg")).toHaveCount(7);

  await menu.getByRole("menuitem", { name: "All history" }).click();
  await expect(page.locator("[title='Result count']")).toHaveText("4 total");

  await page.getByLabel("Mark options").click();
  await menu.getByRole("menuitem", { name: "Marked", exact: true }).click();
  await expect(page.getByLabel("Search clipboard history")).toHaveValue("is:marked");
  await expect(page.locator("[title='Result count']")).not.toHaveText("Filtering");
});

test("mark menu shows a durable flag count independent from the current filter", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page);

  await expect(page.getByRole("button", { name: "Mark options" }).locator(".mark-menu-count")).toHaveCount(0);
  await page.getByLabel("Mark item").first().click();
  await expect(page.getByRole("button", { name: "Mark options, 1 marked" })).toBeVisible();
  await expect(page.locator(".mark-menu-count")).toHaveText("1");

  await page.getByLabel("Search clipboard history").fill("markdown");
  await expect(page.locator("[title='Result count']")).toHaveText("1 / 4 matches");
  await expect(page.getByRole("button", { name: "Mark options, 1 marked" })).toBeVisible();

  await page.locator(".mark-menu-button").click();
  await page.getByRole("menu", { name: "Mark options" }).getByRole("menuitem", { name: "Mark visible", exact: true }).click();
  await expect(page.getByRole("button", { name: "Mark options, 1 marked" })).toBeVisible();

  await page.getByLabel("Search clipboard history").fill("");
  await expect(page.locator("[title='Result count']")).toHaveText("4 total");
  await page.locator(".mark-menu-button").click();
  await page.getByRole("menu", { name: "Mark options" }).getByRole("menuitem", { name: "Mark visible", exact: true }).click();
  await expect(page.locator(".mark-menu-count")).toHaveText("4");

  await page.locator(".mark-menu-button").click();
  const menu = page.getByRole("menu", { name: "Mark options" });
  await expect(menu.getByText("Marked items")).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Join marked" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "join-selected-with-log-name" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Edit tags for marked" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Delete 4 marked" })).toHaveCount(0);
});

test("long synthetic history stays contained", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page);

  await expect(
    page.getByRole("button", { name: /COPICU_SYNTH_LONG_UNBROKEN/ }),
  ).toBeVisible();

  for (const viewport of [
    { width: 900, height: 620 },
    { width: 420, height: 620 },
  ]) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(250);

    const layout = await page.evaluate(() => {
      const documentOverflow = document.documentElement.scrollWidth > window.innerWidth;
      const overflowing = Array.from(
        document.querySelectorAll<HTMLElement>(
          ".picker-panel, .search-row, .history-feed, .feed-item, .feed-item pre",
        ),
      )
        .filter((element) => element.scrollWidth > Math.ceil(element.clientWidth) + 1)
        .map((element) => element.className || element.tagName);

      const feedItems = Array.from(document.querySelectorAll<HTMLElement>(".feed-item"));
      const overlappedItems = feedItems.some((item, index) => {
        const next = feedItems[index + 1];
        if (!next) {
          return false;
        }
        return item.getBoundingClientRect().bottom - next.getBoundingClientRect().top > 2;
      });
      const largeGaps = feedItems
        .slice(0, -1)
        .map((item, index) => {
          const next = feedItems[index + 1];
          return next.getBoundingClientRect().top - item.getBoundingClientRect().bottom;
        })
        .filter((gap) => gap > 12)
        .map((gap) => Math.round(gap));

      return { documentOverflow, overflowing, overlappedItems, largeGaps };
    });

    expect(layout.documentOverflow).toBe(false);
    expect(layout.overflowing).toEqual([]);
    expect(layout.overlappedItems).toBe(false);
    expect(layout.largeGaps).toEqual([]);
  }
});

test("delayed history loading uses row-shaped skeleton geometry", async ({ page }) => {
  await mockTauriInvoke(page, syntheticLongHistory, null, { historySearchDelayMs: 360 });
  await gotoShell(page);

  await expect(page.locator(".history-skeleton-row")).toHaveCount(4, { timeout: 1200 });
  const skeleton = await page.locator(".history-skeleton-row").first().evaluate((row) => {
    const rect = row.getBoundingClientRect();
    const children = Array.from(row.children).map((child) => {
      const childRect = (child as HTMLElement).getBoundingClientRect();
      return { width: childRect.width, height: childRect.height };
    });
    return { height: rect.height, children };
  });
  expect(skeleton.height).toBeGreaterThanOrEqual(62);
  expect(skeleton.children).toHaveLength(4);
  expect(skeleton.children[0].width).toBeGreaterThanOrEqual(20);
  expect(skeleton.children[3].width).toBeGreaterThanOrEqual(20);
  await expect(page.locator(".history-skeleton-row")).toHaveCount(0, { timeout: 2000 });
  await expect(page.getByRole("button", { name: /COPICU_SYNTH_LONG_UNBROKEN/ })).toBeVisible();
});

test("compact previews expose only real overflow and keep inline editing stable", async ({ page }) => {
  await mockTauriInvoke(page, syntheticCompactPreviewHistory);
  await gotoShell(page);

  const feedScroll = page.locator(".history-feed-scroll");
  const shortRow = page.locator("#history-item-1201");
  const longRow = page.locator("#history-item-1202");
  await expect(shortRow.locator(".text-preview-overflow")).toHaveCount(0);

  const expectedChars = Array.from(compactPreviewText).length;
  const overflow = longRow.locator(".text-preview-overflow");
  await expect(overflow).toHaveAttribute("aria-label", `${expectedChars} characters, 18 lines`);
  expect(await page.evaluate(() =>
    (window as any).__copicuTestInvocations.filter((entry: any) => entry.cmd === "get_history_item").length,
  )).toBe(0);
  await longRow.locator(".feed-item").click();
  const collapsedHeight = await longRow.evaluate((row) => row.getBoundingClientRect().height);
  const scrollBeforeExpand = await feedScroll.evaluate((feed) => feed.scrollTop);
  await overflow.getByRole("button", { name: "Expand" }).click();
  await page.waitForFunction(() =>
    (window as any).__copicuTestInvocations.filter((entry: any) => entry.cmd === "get_history_item").length === 1,
  );
  await expect(longRow.locator(".feed-item")).toHaveAttribute("aria-current", "true");
  await expect(overflow.getByRole("button", { name: "Collapse" })).toBeVisible();
  expect(await longRow.evaluate((row) => row.getBoundingClientRect().height)).toBeGreaterThan(collapsedHeight);
  expect(await feedScroll.evaluate((feed) => feed.scrollTop)).toBe(scrollBeforeExpand);
  await overflow.getByRole("button", { name: "Collapse" }).click();
  expect(await longRow.evaluate((row) => row.getBoundingClientRect().height)).toBeCloseTo(collapsedHeight, 0);

  await longRow.hover();
  await longRow.getByRole("button", { name: "Quick edit item" }).click();
  const inlineEditor = longRow.getByRole("textbox", { name: "Quick edit item 1202" });
  await expect(inlineEditor).toBeFocused();
  await inlineEditor.fill("COPICU_INLINE_SAVED\nsecond line");
  await inlineEditor.press("Control+Enter");
  await expect(inlineEditor).toBeHidden();
  await expect(longRow.locator(".feed-item")).toHaveAttribute("aria-current", "true");
  await page.waitForFunction(() =>
    (window as any).__copicuTestInvocations.some(
      (entry: any) => entry.cmd === "update_history_item" && entry.args.request.text === "COPICU_INLINE_SAVED\nsecond line",
    ),
  );

  const updatesAfterSave = await page.evaluate(() =>
    (window as any).__copicuTestInvocations.filter((entry: any) => entry.cmd === "update_history_item").length,
  );
  await longRow.hover();
  await longRow.getByRole("button", { name: "Quick edit item" }).click();
  await inlineEditor.fill("COPICU_INLINE_CANCELLED");
  await inlineEditor.press("Escape");
  await expect(inlineEditor).toBeHidden();
  expect(await page.evaluate(() =>
    (window as any).__copicuTestInvocations.filter((entry: any) => entry.cmd === "update_history_item").length,
  )).toBe(updatesAfterSave);

  for (const viewport of [
    { width: 900, height: 620, imageMaxHeight: 181 },
    { width: 420, height: 620, imageMaxHeight: 149 },
  ]) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(100);
    const imageBoxes = await page.locator(".image-preview").evaluateAll((previews) => previews.map((preview) => {
      const box = preview.getBoundingClientRect();
      return { width: box.width, height: box.height };
    }));
    expect(imageBoxes).toHaveLength(3);
    expect(imageBoxes[0].width).toBeLessThanOrEqual(74);
    expect(imageBoxes[0].height).toBeLessThanOrEqual(50);
    expect(imageBoxes.every((box) => box.height <= viewport.imageMaxHeight)).toBe(true);
    expect(imageBoxes.every((box) => box.width <= viewport.width)).toBe(true);
  }

  const verticalRow = page.locator("#history-item-1204");
  const heightBeforeSelection = await verticalRow.evaluate((row) => row.getBoundingClientRect().height);
  await verticalRow.locator(".image-preview").click();
  await page.waitForFunction(() =>
    (window as any).__copicuTestInvocations.some(
      (entry: any) => entry.cmd === "open_item_preview" && entry.args.request.itemId === 1204,
    ),
  );
  expect(await verticalRow.evaluate((row) => row.getBoundingClientRect().height)).toBe(heightBeforeSelection);
});

test("history feed uses preview DTO and edit fetches full content on demand", async ({ page }) => {
  const fullText = `COPICU_SYNTH_FULL_CONTENT_START ${"full-content-token ".repeat(180)}COPICU_SYNTH_FULL_CONTENT_END`;
  const previewText = fullText.slice(0, 120);
  await mockTauriInvoke(page, [
    {
      ...syntheticLongHistory[1],
      id: 9100,
      text: fullText,
      preview_text: previewText,
      text_char_count: Array.from(fullText).length,
      includes_content: false,
      normalized_hash: "synthetic-preview-dto",
      title: "Preview DTO item",
      notes: null,
      tags: null,
    },
  ]);
  await gotoShell(page);

  await expect(page.getByRole("button", { name: /COPICU_SYNTH_FULL_CONTENT_START/ })).toBeVisible();
  await expect(page.getByText("COPICU_SYNTH_FULL_CONTENT_END")).toHaveCount(0);

  const initialSearch = await page.waitForFunction(() => {
    const calls = (window as any).__copicuTestInvocations;
    return calls.find((call: any) => call.cmd === "history_search");
  });
  const initialSearchCall = await initialSearch.jsonValue() as any;
  expect(initialSearchCall.args.request.includeContent).toBe(false);

  await page.getByRole("button", { name: /COPICU_SYNTH_FULL_CONTENT_START/ }).click();
  await page.getByLabel("Search clipboard history").click();
  await page.keyboard.press("Shift+F2");
  const metadataDialog = page.getByRole("dialog", { name: "Edit item metadata" });
  await expect(metadataDialog).toBeVisible();
  await metadataDialog.getByRole("textbox", { name: "Metadata" }).fill("#perf metadata note");
  await metadataDialog.getByRole("button", { name: "Save", exact: true }).click();

  const updateCall = await page.waitForFunction(() => {
    const calls = (window as any).__copicuTestInvocations;
    return calls.find((call: any) => call.cmd === "update_history_item");
  });
  const update = await updateCall.jsonValue() as any;
  expect(update.args.request.text).toBe(fullText);
  expect(update.args.request.text).toContain("COPICU_SYNTH_FULL_CONTENT_END");
  const getCalls = await page.evaluate(() =>
    (window as any).__copicuTestInvocations.filter((call: any) => call.cmd === "get_history_item"),
  );
  expect(getCalls).toHaveLength(1);
});

test("F2 edits content and Shift+F2 opens the metadata window from shortcut or menu", async ({ page }) => {
  await mockTauriInvoke(page, syntheticLongHistory, null, {
    editorSettings: {
      fontFamily: "consolas",
      fontSize: 16,
      lineHeight: "relaxed",
      wrapLines: false,
      tabSize: 2,
      lineNumbers: false,
      highlightActiveLine: false,
    },
  });
  await gotoShell(page);

  const search = page.getByLabel("Search clipboard history");
  await expect(search).toBeVisible();
  await page.locator(".feed-item").first().click({ button: "right" });
  const metadataMenuItem = page.getByRole("menuitem", { name: /Edit metadata/ });
  await expect(metadataMenuItem).toBeVisible();
  await expect(metadataMenuItem.getByLabel("Shift+F2")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(metadataMenuItem).toBeHidden();
  const firstItem = page.locator(".feed-item").first();
  await firstItem.click();
  await firstItem.focus();
  await expect(firstItem).toBeFocused();

  await page.keyboard.press("F2");
  const contentEditor = page.getByRole("region", { name: "Edit clipboard item" });
  await expect(contentEditor).toBeVisible();
  const contentInput = contentEditor.getByRole("textbox", { name: "Item content" });
  await expect(contentInput).toBeFocused();
  await expect(contentInput).toHaveCSS("font-size", "16px");
  await expect(contentInput).toHaveCSS("font-family", /Consolas/);
  await expect(contentEditor.getByRole("button", { name: "Wrap" })).toHaveAttribute("aria-pressed", "false");
  await expect(contentEditor.locator(".cm-lineNumbers")).toHaveCount(0);
  await expect(page.locator(".history-feed-scroll")).toHaveCount(0);
  const editorBox = await contentEditor.boundingBox();
  const pickerBox = await page.locator(".picker-panel").boundingBox();
  expect(editorBox?.width).toBe(pickerBox?.width);
  expect(editorBox?.height).toBe(pickerBox?.height);
  await page.keyboard.press("End");
  await page.keyboard.type(" edited");
  await expect(contentEditor.getByText("Modified")).toBeVisible();
  await page.keyboard.press("Control+s");
  await expect(contentEditor).toBeHidden();
  const contentUpdate = await page.waitForFunction(() =>
    (window as any).__copicuTestInvocations.find(
      (entry: any) => entry.cmd === "update_history_item" && entry.args.request.text.includes(" edited"),
    ),
  );
  expect((await contentUpdate.jsonValue() as any).args.request.id).toBe(syntheticLongHistory[0].id);

  await search.focus();
  await page.keyboard.press("F2");
  await expect(contentEditor).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(contentEditor).toBeHidden();

  await page.keyboard.press("Shift+F2");
  const metadataDialog = page.getByRole("dialog", { name: "Edit item metadata" });
  await expect(metadataDialog).toBeVisible();
  await expect(metadataDialog.getByRole("textbox", { name: "Metadata" })).toBeVisible();
  await expect(metadataDialog.getByRole("textbox", { name: "Content" })).toHaveCount(0);
});

test("Ctrl+Shift+C targets the last item activated with Enter", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page);

  const activatedItem = syntheticLongHistory[1];
  await page.locator(".feed-item").nth(1).click();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Control+Shift+C");

  const dialog = page.getByRole("dialog", { name: "Edit item metadata" });
  await expect(dialog).toBeVisible();
  const metadata = dialog.getByRole("textbox", { name: "Metadata" });
  await expect(metadata).toBeFocused();
  await expect(dialog.getByRole("textbox", { name: "Content" })).toHaveCount(0);
  await metadata.fill("last activated #verified");
  await dialog.getByRole("button", { name: "Save" }).click();

  const update = await page.waitForFunction(() =>
    (window as any).__copicuTestInvocations.find((entry: any) => entry.cmd === "update_history_item"),
  );
  expect((await update.jsonValue() as any).args.request.id).toBe(activatedItem.id);
});

test("native global activation updates the active item while the picker is hidden", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page);

  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "hidden",
    });
    return (window as any).__copicuTestEmitEvent(
      "copicu://picker/active-item",
      { itemId: 101 },
    );
  });

  await expect(page.locator("#history-item-101 .feed-item")).toHaveClass(/is-selected/);
});

test("manual scroll is not reset by history refresh", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page);

  await expect(page.getByText("COPICU_SYNTH_MULTILINE_01")).toBeVisible();
  await page.waitForFunction(() => {
    const calls = (window as any).__copicuTestInvocations;
    return calls.some((call: any) => call.cmd === "history_search");
  });
  const feed = page.locator(".history-feed-scroll");
  await feed.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  const before = await feed.evaluate((element) => element.scrollTop);

  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.waitForTimeout(150);

  const after = await feed.evaluate((element) => element.scrollTop);
  expect(after).toBeGreaterThanOrEqual(before - 2);
});

test("diagnostics off disables idle diagnostics polling", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page, "/?copicuDiagnostics=0");

  await expect(page.getByLabel("Search clipboard history")).toBeVisible();
  await page.waitForTimeout(2300);

  const calls = await page.evaluate(() => (window as any).__copicuTestInvocations);
  const count = (cmd: string) => calls.filter((call: any) => call.cmd === cmd).length;
  const diagnosticEvents = calls
    .filter((call: any) => call.cmd === "record_renderer_diagnostic")
    .map((call: any) => call.args?.event);
  expect(diagnosticEvents).not.toContain("heartbeat");
  expect(diagnosticEvents).not.toContain("renderer.heartbeat");
  expect(count("get_capture_snapshot")).toBe(0);
  expect(count("get_clipboard_probe")).toBe(0);
  expect(count("history_search")).toBeGreaterThanOrEqual(1);
  expect(count("get_compound_hotkey_pending")).toBeLessThanOrEqual(2);
});

test("scrolling to the loader fetches the next history page", async ({ page }) => {
  await mockTauriInvoke(page, syntheticPagedHistory);
  await gotoShell(page);

  const resultCount = page.locator("[title='Result count']");
  await expect(resultCount).toHaveText("80 total");
  const feed = page.locator(".history-feed-scroll");
  await feed.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });

  await page.waitForFunction(() => {
    const calls = (window as any).__copicuTestInvocations;
    return calls.filter((call: any) => call.cmd === "history_search").length >= 2;
  });

  await expect(resultCount).toHaveText("80 total");
  await expect(page.getByRole("button", { name: /COPICU_SYNTH_PAGE_80/ })).toBeAttached();
});

test("failed pagination stops automatic retries", async ({ page }) => {
  await mockTauriInvoke(page, syntheticPagedHistory, null, { historySearchFailOnCursor: true });
  await gotoShell(page);

  await expect(page.locator("[title='Result count']")).toHaveText("80 total");
  await page.locator(".history-feed-scroll").evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(page.getByText("Error: Synthetic page failure")).toBeVisible();
  const callsAfterFailure = await page.evaluate(() =>
    (window as any).__copicuTestInvocations.filter((call: any) => call.cmd === "history_search").length,
  );
  await page.waitForTimeout(350);
  expect(await page.evaluate(() =>
    (window as any).__copicuTestInvocations.filter((call: any) => call.cmd === "history_search").length,
  )).toBe(callsAfterFailure);
});

test("loaded page count stays stable while idle", async ({ page }) => {
  await mockTauriInvoke(page, syntheticPagedHistory);
  await gotoShell(page);

  const resultCount = page.locator("[title='Result count']");
  await expect(resultCount).toHaveText("80 total");
  const feed = page.locator(".history-feed-scroll");
  await feed.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await page.waitForFunction(() =>
    Array.from(document.querySelectorAll(".feed-item")).some((item) =>
      item.textContent?.includes("COPICU_SYNTH_PAGE_80"),
    ),
  );
  const before = await feed.evaluate((element) => ({ top: element.scrollTop, height: element.scrollHeight }));

  await page.waitForTimeout(1800);

  await expect(resultCount).toHaveText("80 total");
  await expect(page.getByRole("button", { name: /COPICU_SYNTH_PAGE_80/ })).toBeAttached();
  const after = await feed.evaluate((element) => ({ top: element.scrollTop, height: element.scrollHeight }));
  expect(after).toEqual(before);
});

test("explicit search survives a delayed picker reset snapshot", async ({ page }) => {
  await mockTauriInvoke(page, syntheticLongHistory, null, {
    historySearchDelayMs: 120,
    pickerSessionDelayMs: 250,
    pickerSessionSnapshots: [{ reset: true, generation: 1 }],
    searchTriggerMode: "enter",
  });
  await gotoShell(page);

  const search = page.getByLabel("Search clipboard history");
  await expect(page.locator("[title='Result count']")).toHaveText("4 total", { timeout: 5000 });
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.waitForTimeout(20);
  await search.fill("unbroken");
  await page.keyboard.press("Enter");

  await expect(page.locator("[title='Result count']")).toHaveText("1 / 4 matches", { timeout: 5000 });
  await page.waitForTimeout(180);
  await expect(search).toHaveValue("unbroken");
  await expect(page.getByRole("button", { name: /COPICU_SYNTH_LONG_UNBROKEN/ })).toBeVisible();
});

test("keyboard selection survives delayed picker reset refresh", async ({ page }) => {
  await mockTauriInvoke(page, syntheticPagedHistory, null, {
    historySearchDelayMs: 250,
    pickerSessionDelayMs: 250,
    pickerSessionSnapshots: [{ reset: true, generation: 1 }],
  });
  await gotoShell(page);

  const search = page.getByLabel("Search clipboard history");
  await expect(page.locator("[title='Result count']")).toHaveText("80 total", { timeout: 5000 });
  await search.focus();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.waitForTimeout(20);
  for (let index = 0; index < 5; index += 1) {
    await page.keyboard.press("ArrowDown");
  }

  await page.waitForTimeout(350);

  await expect(page.getByRole("button", { name: /COPICU_SYNTH_PAGE_06/ })).toHaveClass(/is-selected/);
  await expect(page.getByRole("button", { name: /COPICU_SYNTH_PAGE_01/ })).not.toHaveClass(/is-selected/);
});

test("picker navigation clears a pending compound shortcut without consuming ArrowDown", async ({ page }) => {
  await mockTauriInvoke(page, syntheticLongHistory, {
    prefixLabel: "Ctrl+Alt+C",
    nextSteps: ["T"],
    entries: [
      {
        key: "T",
        label: "compound hotkey toast",
        group: "Scripts",
        routeId: "jp.compoundHotkeyToast",
        disabled: false,
        diagnostic: null,
      },
    ],
    expiresAtUnixMs: Date.now() + 3000,
  });
  await gotoShell(page);

  const search = page.getByLabel("Search clipboard history");
  await search.focus();
  await page.waitForFunction(() =>
    (window as any).__copicuTestInvocations.some(
      (call: any) => call.cmd === "get_compound_hotkey_pending",
    ),
  );
  await page.keyboard.press("ArrowDown");

  await expect(page.getByRole("button", { name: /COPICU_SYNTH_LONG_SINGLE_LINE/ })).toHaveClass(/is-selected/);
  const calls = await page.evaluate(() => (window as any).__copicuTestInvocations);
  expect(calls.filter((call: any) => call.cmd === "clear_compound_hotkey_pending")).toHaveLength(1);
  expect(calls.filter((call: any) => call.cmd === "handle_compound_hotkey_step")).toHaveLength(0);
});

test("manual scroll keeps moving downward while variable rows are measured", async ({ page }) => {
  await mockTauriInvoke(page, syntheticMarkdownScrollHistory);
  await gotoShell(page);

  const feed = page.locator(".history-feed-scroll");
  await expect(page.getByRole("button", { name: /COPICU_SYNTH_SCROLL_01/ })).toBeVisible();

  let previous = await feed.evaluate((element) => element.scrollTop);
  for (let index = 0; index < 8; index += 1) {
    await feed.evaluate((element) => {
      element.scrollTop += 360;
    });
    await page.waitForTimeout(50);
    const current = await feed.evaluate((element) => element.scrollTop);
    expect(current).toBeGreaterThanOrEqual(previous);
    previous = current;
  }
});

test("selected item survives history reorder by id", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page);

  await page.getByRole("button", { name: /COPICU_SYNTH_LONG_UNBROKEN/ }).click();
  await page.locator(".history-feed-scroll").evaluate((element) => {
    element.scrollTop = 0;
  });
  await page.evaluate(() => {
    const items = (window as any).__copicuTestHistoryItems;
    (window as any).__copicuTestHistoryItems = [items[2], items[0], items[1], items[3]];
    window.dispatchEvent(new Event("focus"));
  });

  await page.waitForFunction(() =>
    document.querySelector(".feed-item")?.textContent?.includes("COPICU_SYNTH_LONG_UNBROKEN"),
  );

  await expect(page.getByRole("button", { name: /COPICU_SYNTH_LONG_UNBROKEN/ })).toHaveClass(
    /is-selected/,
  );
  await page.keyboard.press("Enter");

  await page.waitForFunction(() => {
    const calls = (window as any).__copicuTestInvocations;
    return calls.some((call: any) => call.cmd === "activate_item");
  });
  const activatedItemId = await page.evaluate(() =>
    (window as any).__copicuTestInvocations
      .filter((call: any) => call.cmd === "activate_item")
      .at(-1)
      .args.request.itemId,
  );
  expect(activatedItemId).toBe(102);
});

test("ai search shows interpretation and keeps activation enabled", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page);

  await page.getByLabel("Search clipboard history").fill("ai: long text from yesterday");
  await expect(page.locator("[title='Result count']")).toHaveText("AI draft");
  await expect(page.getByText("AI interpreted", { exact: true })).toHaveCount(0);

  await page.keyboard.press("Enter");
  await expect(page.getByText("AI interpreted", { exact: true })).toBeVisible();
  await expect(page.locator(".search-interpretation-query")).toHaveText("long");
  await expect(page.getByText("Synthetic unsupported source filter ignored.")).toBeVisible();
  await expect(page.getByRole("button", { name: /COPICU_SYNTH_LONG_SINGLE_LINE/ })).toBeVisible();

  await page.keyboard.press("Enter");
  await page.waitForFunction(() =>
    (window as any).__copicuTestInvocations.some((call: any) => call.cmd === "activate_item"),
  );
  const activatedItemId = await page.evaluate(() =>
    (window as any).__copicuTestInvocations
      .filter((call: any) => call.cmd === "activate_item")
      .at(-1)
      .args.request.itemId,
  );
  expect(activatedItemId).toBe(101);
});

test("applied structured chips remove only their clause", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page);

  const search = page.getByLabel("Search clipboard history");
  await search.fill("tag:work kind:text");
  const kindChip = page.getByRole("button", { name: "Remove filter kind:text" });
  await expect(kindChip).toBeVisible();
  await page.evaluate(() => {
    (window as any).__copicuTestInvocations = [];
  });

  await kindChip.click();
  await expect(search).toHaveValue("tag:work");
  await page.waitForFunction(() =>
    (window as any).__copicuTestInvocations
      .filter((call: any) => call.cmd === "history_search")
      .some((call: any) => call.args.request.query === "tag:work"),
  );
  await expect(page.getByRole("button", { name: "Remove filter tag:work" })).toBeVisible();
  expect(await page.evaluate(() =>
    (window as any).__copicuTestInvocations.filter((call: any) => call.cmd === "history_search").length,
  )).toBe(1);
});

test("malformed structured filters show a diagnostic without activating stale results", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page);

  const search = page.getByLabel("Search clipboard history");
  await page.evaluate(() => {
    (window as any).__copicuTestInvocations = [];
  });
  await search.fill("kind:");
  await expect(page.getByText("Choose or type a value after `kind:`.")).toBeVisible();
  await expect(page.locator("[title='Result count']")).toHaveText("Complete the structured filter");
  await expect(page.locator(".feed-item")).toHaveCount(4);

  await page.keyboard.press("Enter");
  await page.waitForTimeout(180);
  expect(await page.evaluate(() =>
    (window as any).__copicuTestInvocations.filter(
      (call: any) => call.cmd === "history_search" && call.args.request.query === "kind:",
    ).length,
  )).toBe(0);
});

test("plain applied search stays quiet when it has no filters or warnings", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page);

  await page.getByLabel("Search clipboard history").fill("unbroken");
  await expect(page.locator("[title='Result count']")).toHaveText("1 / 4 matches");
  await expect(page.getByText("Interpreted", { exact: true })).toHaveCount(0);
});

test("search autocomplete suggests tags, operators, and closed values", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page);

  const search = page.getByLabel("Search clipboard history");
  await search.fill("#");
  const suggestions = page.getByRole("listbox", { name: "Search suggestions" });
  await expect(suggestions.getByRole("option", { name: "#work" })).toBeVisible();
  await expect(suggestions.getByRole("option", { name: "#backend" })).toBeVisible();

  await search.fill("ki");
  await expect(suggestions.getByRole("option", { name: "kind:" })).toBeVisible();

  await search.fill("kind:");
  await expect(suggestions.getByRole("option", { name: "kind:text" })).toBeVisible();
  await expect(suggestions.getByRole("option", { name: "kind:image" })).toBeVisible();

  await search.fill("-");
  await expect(suggestions.getByRole("option", { name: "-kind:" })).toBeVisible();
  await expect(suggestions.getByRole("option", { name: "-after:" })).toHaveCount(0);
  await expect(suggestions.getByRole("option", { name: "-source:" })).toHaveCount(0);
  await search.fill("-after:");
  await expect(suggestions).toHaveCount(0);
});

test("search autocomplete accepts keyboard and click selections and dismisses Escape", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page);

  const search = page.getByLabel("Search clipboard history");
  const suggestions = page.getByRole("listbox", { name: "Search suggestions" });
  await search.fill("#");
  await expect(suggestions.getByRole("option", { name: "#work" })).toHaveAttribute("aria-selected", "true");
  await search.press("ArrowDown");
  await expect(suggestions.getByRole("option", { name: "#backend" })).toHaveAttribute("aria-selected", "true");
  await search.fill("ki");
  const kindSuggestion = suggestions.getByRole("option", { name: "kind:" });
  await expect(kindSuggestion).toBeVisible();
  await expect(kindSuggestion).toHaveAttribute("aria-selected", "true");
  await expect(search).toHaveAttribute("aria-activedescendant", "search-suggestion-0");
  await search.fill("#");
  await search.press("Shift+Tab");
  await expect(search).toHaveValue("#");
  await expect(suggestions).toBeVisible();
  await search.focus();
  await search.press("Tab");
  await expect(search).toHaveValue("#work");
  await expect(search).toBeFocused();
  await expect(suggestions).toHaveCount(0);

  await search.fill("tag:");
  await page.evaluate(() => {
    (window as any).__copicuTestInvocations = [];
  });
  await suggestions.getByRole("option", { name: "tag:work" }).click();
  await expect(search).toHaveValue("tag:work");
  await expect(suggestions).toHaveCount(0);
  await page.waitForTimeout(180);
  expect(await page.evaluate(() =>
    (window as any).__copicuTestInvocations.filter((call: any) => call.cmd === "history_search").length,
  )).toBe(0);

  await search.fill("#");
  await expect(suggestions).toBeVisible();
  await search.press("Escape");
  await expect(search).toHaveValue("#");
  await expect(suggestions).toHaveCount(0);
});

test("Enter executes the current autocomplete query without accepting it", async ({ page }) => {
  await mockTauriInvoke(page, syntheticLongHistory, null, { searchTriggerMode: "enter" });
  await gotoShell(page);

  const search = page.getByLabel("Search clipboard history");
  await search.fill("kind:");
  await expect(page.getByRole("option", { name: "kind:text" })).toBeVisible();
  await page.evaluate(() => {
    (window as any).__copicuTestInvocations = [];
  });

  await search.press("Enter");
  await expect(search).toHaveValue("kind:");
  await expect(page.getByRole("listbox", { name: "Search suggestions" })).toHaveCount(0);
  await page.waitForTimeout(180);
  expect(await page.evaluate(() =>
    (window as any).__copicuTestInvocations.filter(
      (call: any) => call.cmd === "history_search" && call.args.request.query === "kind:",
    ).length,
  )).toBe(0);
});

test("search composer mode toggles with icon button", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page);

  const search = page.getByLabel("Search clipboard history");
  const toggle = page.getByRole("button", { name: "Search mode, switch to AI mode" });

  await expect(search).toHaveAttribute("placeholder", "Search clips — meta:work, #tag, ai:find invoices");
  await expect(search).toHaveJSProperty("tagName", "INPUT");
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect(toggle).toHaveAttribute("data-mode", "search");

  await toggle.click();

  const aiToggle = page.getByRole("button", { name: "AI mode, switch to search mode" });
  await expect(aiToggle).toHaveAttribute("aria-pressed", "true");
  await expect(aiToggle).toHaveAttribute("data-mode", "ai");
  await expect(search).toHaveAttribute("placeholder", "Ask Copicu AI");
  await expect(search).toHaveJSProperty("tagName", "TEXTAREA");
  await expect(search).toBeFocused();

  await aiToggle.click();

  await expect(page.getByRole("button", { name: "Search mode, switch to AI mode" })).toHaveAttribute(
    "data-mode",
    "search",
  );
  await expect(search).toHaveAttribute("placeholder", "Search clips — meta:work, #tag, ai:find invoices");
  await expect(search).toHaveJSProperty("tagName", "INPUT");
});

test("plain query in AI composer still runs local search", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page);

  await page.getByRole("button", { name: "Search mode, switch to AI mode" }).click();
  const search = page.getByLabel("Search clipboard history");
  await search.fill("unbroken");
  await page.keyboard.press("Enter");

  await expect(page.locator("[title='Result count']")).toHaveText("1 / 4 matches");
  await expect(page.getByRole("button", { name: /COPICU_SYNTH_LONG_UNBROKEN/ })).toBeVisible();
  await expect(page.locator("[title='Result count']")).not.toHaveText(/AI/);
});

test("plain query in AI composer search button still runs local search", async ({ page }) => {
  await mockTauriInvoke(page, syntheticLongHistory, null, { searchTriggerMode: "enter" });
  await gotoShell(page);

  await page.getByRole("button", { name: "Search mode, switch to AI mode" }).click();
  const search = page.getByLabel("Search clipboard history");
  await search.fill("unbroken");
  await page.getByRole("button", { name: "Search", exact: true }).click();

  await expect(page.locator("[title='Result count']")).toHaveText("1 / 4 matches");
  await expect(page.getByRole("button", { name: /COPICU_SYNTH_LONG_UNBROKEN/ })).toBeVisible();
  await expect(page.locator("[title='Result count']")).not.toHaveText(/AI/);
});

test("enter mode keeps its draft unapplied during focus refresh", async ({ page }) => {
  await mockTauriInvoke(page, syntheticLongHistory, null, { searchTriggerMode: "enter" });
  await gotoShell(page);

  const search = page.getByLabel("Search clipboard history");
  await expect(page.locator("[title='Result count']")).toHaveText("4 total");
  await search.fill("unbroken");
  await expect(page.locator("[title='Result count']")).toHaveText("Press Enter");

  await page.evaluate(() => {
    (window as any).__copicuTestInvocations = [];
    window.dispatchEvent(new Event("focus"));
  });
  await page.waitForFunction(() =>
    (window as any).__copicuTestInvocations.some((call: any) => call.cmd === "history_search"),
  );

  const refreshedQuery = await page.evaluate(() =>
    (window as any).__copicuTestInvocations
      .filter((call: any) => call.cmd === "history_search")
      .at(-1).args.request.query,
  );
  expect(refreshedQuery).toBe("");
  await expect(page.locator("[title='Result count']")).toHaveText("Press Enter");
});

test("bulk mark refuses an unapplied Enter draft", async ({ page }) => {
  await mockTauriInvoke(page, syntheticLongHistory, null, { searchTriggerMode: "enter" });
  await gotoShell(page);

  await expect(page.locator("[title='Result count']")).toHaveText("4 total");
  await page.getByLabel("Search clipboard history").fill("unbroken");
  await page.getByLabel("Mark options").click();
  await page.getByRole("menu", { name: "Mark options" }).getByRole("menuitem", { name: "Mark all results", exact: true }).click();

  await expect(page.getByText("Apply the current search before changing all results.")).toBeVisible();
  expect(await page.evaluate(() =>
    (window as any).__copicuTestInvocations.filter((call: any) => call.cmd === "set_history_query_marked").length,
  )).toBe(0);
});

test("action mutation refresh keeps an Enter draft unapplied", async ({ page }) => {
  await mockTauriInvoke(page, syntheticLongHistory, null, { searchTriggerMode: "enter" });
  await gotoShell(page);

  await expect(page.locator("[title='Result count']")).toHaveText("4 total");
  await page.getByLabel("Search clipboard history").fill("unbroken");
  await page.evaluate(() => {
    (window as any).__copicuTestInvocations = [];
  });
  await page.keyboard.press("Control+Alt+Q");
  await page.getByLabel("Search quick actions").fill("toast-hello");
  await page.keyboard.press("Enter");
  await page.waitForFunction(() =>
    (window as any).__copicuTestInvocations.some((call: any) => call.cmd === "history_search"),
  );

  const refreshedQuery = await page.evaluate(() =>
    (window as any).__copicuTestInvocations
      .filter((call: any) => call.cmd === "history_search")
      .at(-1).args.request.query,
  );
  expect(refreshedQuery).toBe("");
  await expect(page.locator("[title='Result count']")).toHaveText("Press Enter");
});

test("focus refresh cannot supersede an explicit Enter search", async ({ page }) => {
  await mockTauriInvoke(page, syntheticLongHistory, null, {
    historySearchDelayMs: 250,
    searchTriggerMode: "enter",
  });
  await gotoShell(page);

  const search = page.getByLabel("Search clipboard history");
  await expect(page.locator("[title='Result count']")).toHaveText("4 total", { timeout: 5000 });
  await page.evaluate(() => {
    (window as any).__copicuTestInvocations = [];
  });
  await search.fill("unbroken");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(140);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));

  await expect(page.locator("[title='Result count']")).toHaveText("1 / 4 matches", { timeout: 5000 });
  const requestQueries = await page.evaluate(() =>
    (window as any).__copicuTestInvocations
      .filter((call: any) => call.cmd === "history_search")
      .map((call: any) => call.args.request.query),
  );
  expect(requestQueries.length).toBeGreaterThanOrEqual(1);
  expect(requestQueries).not.toContain("");
});

test("pagination keeps using the applied query while an Enter draft is pending", async ({ page }) => {
  await mockTauriInvoke(page, syntheticPagedHistory, null, { searchTriggerMode: "enter" });
  await gotoShell(page);

  await expect(page.locator("[title='Result count']")).toHaveText("80 total");
  await page.getByLabel("Search clipboard history").fill("draft-with-no-matches");
  await page.locator(".history-feed-scroll").evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await page.waitForFunction(() =>
    (window as any).__copicuTestInvocations.filter((call: any) => call.cmd === "history_search").length >= 2,
  );

  const pagedQuery = await page.evaluate(() =>
    (window as any).__copicuTestInvocations
      .filter((call: any) => call.cmd === "history_search")
      .at(-1).args.request.query,
  );
  expect(pagedQuery).toBe("");
  await expect(page.getByRole("button", { name: /COPICU_SYNTH_PAGE_80/ })).toBeAttached();
});

test("overlapping first-page refresh does not leave pagination stuck", async ({ page }) => {
  await mockTauriInvoke(page, syntheticPagedHistory, null, {
    historySearchDelayMs: 180,
    searchTriggerMode: "enter",
  });
  await gotoShell(page);

  const search = page.getByLabel("Search clipboard history");
  const feed = page.locator(".history-feed-scroll");
  await expect(page.locator("[title='Result count']")).toHaveText("80 total", { timeout: 5000 });
  await feed.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await page.waitForFunction(() =>
    (window as any).__copicuTestInvocations.filter((call: any) => call.cmd === "history_search").length >= 2,
  );

  await search.fill("COPICU_SYNTH_PAGE_01");
  await page.keyboard.press("Enter");
  await expect(page.locator("[title='Result count']")).toHaveText("1 / 80 matches", { timeout: 5000 });
  await search.fill("");
  await page.keyboard.press("Enter");
  await expect(page.locator("[title='Result count']")).toHaveText("80 total", { timeout: 5000 });

  const callsBeforeFinalPage = await page.evaluate(() =>
    (window as any).__copicuTestInvocations.filter((call: any) => call.cmd === "history_search").length,
  );
  await feed.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await page.waitForFunction((before) =>
    (window as any).__copicuTestInvocations.filter((call: any) => call.cmd === "history_search").length > before,
  callsBeforeFinalPage);
  await expect(page.getByRole("button", { name: /COPICU_SYNTH_PAGE_80/ })).toBeAttached({ timeout: 5000 });
});

test("background refresh deferred during realtime search is replayed", async ({ page }) => {
  await mockTauriInvoke(page, syntheticLongHistory, null, { historySearchDelayMs: 250 });
  await gotoShell(page);

  await expect(page.locator("[title='Result count']")).toHaveText("4 total", { timeout: 5000 });
  await page.evaluate(() => {
    (window as any).__copicuTestInvocations = [];
  });
  await page.getByLabel("Search clipboard history").fill("unbroken");
  await page.waitForFunction(() =>
    (window as any).__copicuTestInvocations.some(
      (call: any) => call.cmd === "history_search" && call.args.request.query === "unbroken",
    ),
  );
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));

  await page.waitForFunction(() =>
    (window as any).__copicuTestInvocations.filter(
      (call: any) => call.cmd === "history_search" && call.args.request.query === "unbroken",
    ).length === 2,
  );
  expect(await page.evaluate(() =>
    (window as any).__copicuTestInvocations.filter(
      (call: any) => call.cmd === "history_search" && call.args.request.query === "unbroken",
    ).length,
  )).toBe(2);
  await expect(page.locator("[title='Result count']")).toHaveText("1 / 4 matches", { timeout: 5000 });
});

test("focus refresh during first load waits for an applied descriptor", async ({ page }) => {
  await mockTauriInvoke(page, syntheticLongHistory, null, { historySearchDelayMs: 250 });
  await gotoShell(page);

  await page.waitForFunction(() =>
    (window as any).__copicuTestInvocations.some(
      (call: any) => call.cmd === "history_search" && call.args.request.query === "",
    ),
  );
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.waitForFunction(() =>
    (window as any).__copicuTestInvocations.filter(
      (call: any) => call.cmd === "history_search" && call.args.request.query === "",
    ).length === 2,
  );
  await expect(page.locator("[title='Result count']")).toHaveText("4 total", { timeout: 5000 });
});

test("foreground search failure survives a focus refresh and retries the exact draft", async ({ page }) => {
  await mockTauriInvoke(page, syntheticLongHistory, null, { historySearchDelayMs: 250 });
  await gotoShell(page);

  await expect(page.locator("[title='Result count']")).toHaveText("4 total", { timeout: 5000 });
  const search = page.getByLabel("Search clipboard history");
  await page.evaluate(() => {
    (window as any).__copicuTestInvocations = [];
    (window as any).__copicuTestMockOptions.historySearchFailNext = true;
  });
  await search.fill("unbroken");
  await page.waitForFunction(() =>
    (window as any).__copicuTestInvocations.some(
      (call: any) => call.cmd === "history_search" && call.args.request.query === "unbroken",
    ),
  );
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));

  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible({ timeout: 5000 });
  await expect(page.locator("[title='Result count']")).toHaveText("Could not update results");
  await expect(page.getByRole("alert")).toContainText("Previous results remain visible.");
  await expect(search).toBeFocused();
  await page.waitForTimeout(180);
  expect(await page.evaluate(() =>
    (window as any).__copicuTestInvocations.filter(
      (call: any) => call.cmd === "history_search" && call.args.request.query === "unbroken",
    ).length,
  )).toBe(1);

  await page.evaluate(() => {
    (window as any).__copicuTestInvocations = [];
  });
  await page.getByRole("button", { name: "Retry" }).click();
  await page.waitForFunction(() =>
    (window as any).__copicuTestInvocations.some(
      (call: any) => call.cmd === "history_search" && call.args.request.query === "unbroken",
    ),
  );
  expect(await page.evaluate(() =>
    (window as any).__copicuTestInvocations.filter((call: any) => call.cmd === "history_search").map(
      (call: any) => call.args.request.query,
    ),
  )).toEqual(["unbroken"]);
  await expect(search).toHaveValue("unbroken");
  await expect(page.locator("[title='Result count']")).toHaveText("1 / 4 matches", { timeout: 5000 });
});

test("failed foreground clear exits Clearing pending across focus and retries the exact clear", async ({ page }) => {
  await mockTauriInvoke(page, syntheticLongHistory, null, {
    historySearchDelayMs: 250,
    searchTriggerMode: "enter",
  });
  await gotoShell(page);

  await expect(page.locator("[title='Result count']")).toHaveText("4 total", { timeout: 5000 });
  const search = page.getByLabel("Search clipboard history");
  await search.fill("long");
  await search.press("Enter");
  await expect(page.locator("[title='Result count']")).toHaveText("2 / 4 matches", { timeout: 5000 });

  await page.evaluate(() => {
    (window as any).__copicuTestInvocations = [];
    (window as any).__copicuTestMockOptions.historySearchFailNext = true;
  });
  await page.getByRole("button", { name: "Clear filter" }).click();
  await expect(search).toHaveValue("");
  await expect(page.locator("[title='Result count']")).toHaveText("Clearing filter");
  await page.waitForFunction(() =>
    (window as any).__copicuTestInvocations.some(
      (call: any) => call.cmd === "history_search" && call.args.request.query === "",
    ),
  );
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));

  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible({ timeout: 5000 });
  await expect(page.locator("[title='Result count']")).toHaveText("Could not update results");
  await expect(search).toBeFocused();
  await page.waitForTimeout(180);
  expect(await page.evaluate(() =>
    (window as any).__copicuTestInvocations.filter(
      (call: any) => call.cmd === "history_search" && call.args.request.query === "",
    ).length,
  )).toBe(1);

  await page.evaluate(() => {
    (window as any).__copicuTestInvocations = [];
  });
  await page.getByRole("button", { name: "Retry" }).click();
  await page.waitForFunction(() =>
    (window as any).__copicuTestInvocations.some(
      (call: any) => call.cmd === "history_search" && call.args.request.query === "",
    ),
  );
  expect(await page.evaluate(() =>
    (window as any).__copicuTestInvocations.filter((call: any) => call.cmd === "history_search").map(
      (call: any) => call.args.request.query,
    ),
  )).toEqual([""]);
  await expect(search).toHaveValue("");
  await expect(page.locator("[title='Result count']")).toHaveText("4 total", { timeout: 5000 });
});

test("foreground Retry recovers a pending Filter Lock after a focus failure", async ({ page }) => {
  await mockTauriInvoke(page, syntheticLongHistory, null, {
    historySearchDelayMs: 250,
    searchTriggerMode: "enter",
  });
  await gotoShell(page);

  await expect(page.locator("[title='Result count']")).toHaveText("4 total", { timeout: 5000 });
  const search = page.getByLabel("Search clipboard history");
  const lock = page.getByRole("button", { name: "Lock filter across picker closes" });
  await page.evaluate(() => {
    (window as any).__copicuTestInvocations = [];
    (window as any).__copicuTestMockOptions.historySearchFailNext = true;
  });
  await search.fill("unbroken");
  await expect(lock).toBeEnabled();
  await lock.click();
  await expect(lock).toHaveAttribute("aria-pressed", "false");
  await page.waitForFunction(() =>
    (window as any).__copicuTestInvocations.some(
      (call: any) => call.cmd === "history_search" && call.args.request.query === "unbroken",
    ),
  );
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));

  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible({ timeout: 5000 });
  await expect(lock).toHaveAttribute("aria-pressed", "false");
  await expect(search).toBeFocused();
  await page.evaluate(() => {
    (window as any).__copicuTestInvocations = [];
  });
  await page.getByRole("button", { name: "Retry" }).click();
  await page.waitForFunction(() =>
    (window as any).__copicuTestInvocations.some(
      (call: any) => call.cmd === "history_search" && call.args.request.query === "unbroken",
    ),
  );
  expect(await page.evaluate(() =>
    (window as any).__copicuTestInvocations.filter((call: any) => call.cmd === "history_search").map(
      (call: any) => call.args.request.query,
    ),
  )).toEqual(["unbroken"]);
  await expect(page.getByRole("button", { name: "Unlock persistent filter" })).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => page.evaluate(() => localStorage.getItem("copicu.filter-lock.v1"))).toBe("unbroken");
});

test("focus refreshes the applied snapshot while autocomplete keeps a draft held", async ({ page }) => {
  await mockTauriInvoke(page, syntheticLongHistory, null, { historySearchDelayMs: 80 });
  await gotoShell(page);

  await expect(page.locator("[title='Result count']")).toHaveText("4 total", { timeout: 5000 });
  const search = page.getByLabel("Search clipboard history");
  await page.evaluate(() => {
    (window as any).__copicuTestInvocations = [];
  });
  await search.fill("ki");
  await expect(page.getByRole("listbox", { name: "Search suggestions" })).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));

  await page.waitForFunction(() =>
    (window as any).__copicuTestInvocations.some(
      (call: any) => call.cmd === "history_search" && call.args.request.query === "",
    ),
  );
  expect(await page.evaluate(() =>
    (window as any).__copicuTestInvocations.filter(
      (call: any) => call.cmd === "history_search" && call.args.request.query === "",
    ).length,
  )).toBe(1);
  await expect(search).toHaveValue("ki");
  await expect(page.getByRole("listbox", { name: "Search suggestions" })).toBeVisible();
});

test("Retry replays a failed background refresh without applying the Enter draft", async ({ page }) => {
  await mockTauriInvoke(page, syntheticLongHistory, null, { searchTriggerMode: "enter" });
  await gotoShell(page);

  await expect(page.locator("[title='Result count']")).toHaveText("4 total", { timeout: 5000 });
  const search = page.getByLabel("Search clipboard history");
  await search.fill("unbroken");
  await page.evaluate(() => {
    (window as any).__copicuTestInvocations = [];
    (window as any).__copicuTestMockOptions.historySearchFailNext = true;
  });
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();

  await page.evaluate(() => {
    (window as any).__copicuTestInvocations = [];
  });
  await page.getByRole("button", { name: "Retry" }).click();
  await page.waitForFunction(() =>
    (window as any).__copicuTestInvocations.some(
      (call: any) => call.cmd === "history_search" && call.args.request.query === "",
    ),
  );
  expect(await page.evaluate(() =>
    (window as any).__copicuTestInvocations.filter((call: any) => call.cmd === "history_search").map(
      (call: any) => call.args.request.query,
    ),
  )).toEqual([""]);
  await expect(search).toHaveValue("unbroken");
});

test("search trigger control cycles and persists Realtime and Enter only", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page);

  const realtime = page.getByRole("button", { name: "Search trigger: Realtime, switch to Enter" });
  await expect(realtime).toHaveAttribute("data-mode", "realtime");
  await realtime.click();

  const enter = page.getByRole("button", { name: "Search trigger: Enter, switch to Realtime" });
  await expect(enter).toHaveAttribute("data-mode", "enter");
  await enter.click();
  await expect(page.getByRole("button", { name: "Search trigger: Realtime, switch to Enter" })).toBeVisible();

  const modes = await page.evaluate(() =>
    (window as any).__copicuTestInvocations
      .filter((call: any) => call.cmd === "set_picker_search_trigger_mode")
      .map((call: any) => call.args.mode),
  );
  expect(modes).toEqual(["enter", "realtime"]);
});

test("legacy Button only setting normalizes to Enter", async ({ page }) => {
  await mockTauriInvoke(page, syntheticLongHistory, null, { searchTriggerMode: "manual" });
  await gotoShell(page);

  await expect(page.getByRole("button", { name: "Search trigger: Enter, switch to Realtime" })).toBeVisible();
});

test("search trigger control locks while persistence is in flight", async ({ page }) => {
  await mockTauriInvoke(page, syntheticLongHistory, null, { searchTriggerUpdateDelayMs: 180 });
  await gotoShell(page);

  await page.getByRole("button", { name: "Search trigger: Realtime, switch to Enter" }).click();
  const pending = page.getByRole("button", { name: "Search trigger: Enter, switch to Realtime" });
  await expect(pending).toBeDisabled();
  await expect(pending).toBeEnabled({ timeout: 1000 });
});

test("Enter coalesces the pending realtime debounce", async ({ page }) => {
  await mockTauriInvoke(page, syntheticLongHistory, null, { historySearchDelayMs: 250 });
  await gotoShell(page);

  await expect(page.locator("[title='Result count']")).toHaveText("4 total");
  await page.evaluate(() => {
    (window as any).__copicuTestInvocations = [];
  });
  await page.getByLabel("Search clipboard history").fill("tag:work");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(420);

  const matchingSearches = await page.evaluate(() =>
    (window as any).__copicuTestInvocations.filter(
      (call: any) => call.cmd === "history_search" && call.args.request.query === "tag:work",
    ).length,
  );
  expect(matchingSearches).toBe(1);
});

test("Enter followed by a quick edit still schedules the new realtime draft", async ({ page }) => {
  await mockTauriInvoke(page, syntheticLongHistory, null, { historySearchDelayMs: 250 });
  await gotoShell(page);

  await expect(page.locator("[title='Result count']")).toHaveText("4 total");
  const search = page.getByLabel("Search clipboard history");
  await page.evaluate(() => {
    (window as any).__copicuTestInvocations = [];
  });
  await search.fill("tag:work");
  await search.press("Enter");
  await search.fill("tag:backend");

  await page.waitForFunction(() =>
    (window as any).__copicuTestInvocations.some(
      (call: any) => call.cmd === "history_search" && call.args.request.query === "tag:backend",
    ),
  );
  expect(await page.evaluate(() =>
    (window as any).__copicuTestInvocations.filter(
      (call: any) => call.cmd === "history_search" && call.args.request.query === "tag:backend",
    ).length,
  )).toBe(1);
});

test("structured realtime query waits for Enter when configured", async ({ page }) => {
  await mockTauriInvoke(page, syntheticLongHistory, null, {
    searchTriggerMode: "realtime",
    deferStructuredSearchUntilEnter: true,
  });
  await gotoShell(page);

  const search = page.getByLabel("Search clipboard history");
  await expect(page.locator("[title='Result count']")).toHaveText("4 total");
  await page.evaluate(() => {
    (window as any).__copicuTestInvocations = [];
  });
  await search.fill("tag:work");
  await expect(page.locator("[title='Result count']")).toHaveText("Structured query held");
  await page.waitForTimeout(180);
  expect(await page.evaluate(() =>
    (window as any).__copicuTestInvocations.filter((call: any) => call.cmd === "history_search").length,
  )).toBe(0);

  await page.keyboard.press("Enter");
  await page.waitForFunction(() =>
    (window as any).__copicuTestInvocations.some(
      (call: any) => call.cmd === "history_search" && call.args.request.query === "tag:work",
    ),
  );
  await expect(page.locator("[title='Result count']")).toHaveText("0 / 4 matches");

  await search.fill('"tag:work"');
  await expect(page.locator("[title='Result count']")).toHaveText("Structured query held");
});

test("single click selects item without activating it", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page);

  await waitForDefaultHistoryReady(page);
  const item = page.getByRole("button", { name: /COPICU_SYNTH_LONG_SINGLE_LINE/ });
  await item.click();

  await expect(item).toHaveClass(/is-selected/);
  await page.waitForTimeout(220);
  const activationCount = await page.evaluate(() =>
    (window as any).__copicuTestInvocations.filter((call: any) => call.cmd === "activate_item").length,
  );
  expect(activationCount).toBe(0);
});

test("double click activates selected item", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page);

  await page.getByRole("button", { name: /COPICU_SYNTH_LONG_SINGLE_LINE/ }).dblclick();

  await page.waitForFunction(() =>
    (window as any).__copicuTestInvocations.some((call: any) => call.cmd === "activate_item"),
  );
  const activatedItemId = await page.evaluate(() =>
    (window as any).__copicuTestInvocations
      .filter((call: any) => call.cmd === "activate_item")
      .at(-1)
      .args.request.itemId,
  );
  expect(activatedItemId).toBe(101);
});

test("pinned picker keeps filter when activating item", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page);

  const search = page.getByRole("textbox", { name: "Search clipboard history" });
  await search.fill("long");
  const pinButton = page.getByRole("button", { name: "Pin window on top" });
  await pinButton.click();
  await expect(page.getByRole("button", { name: "Unpin window from top" })).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: /COPICU_SYNTH_LONG_SINGLE_LINE/ }).dblclick();

  await page.waitForFunction(() =>
    (window as any).__copicuTestInvocations.some((call: any) => call.cmd === "activate_item"),
  );
  const activationRequest = await page.evaluate(() =>
    (window as any).__copicuTestInvocations
      .filter((call: any) => call.cmd === "activate_item")
      .at(-1)
      .args.request,
  );
  expect(activationRequest.itemId).toBe(101);
  expect(activationRequest.hidePicker).toBe(false);
  await expect(search).toHaveValue("long");
});

test("filter lock survives picker hides and unlock restores normal reset", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page);

  const search = page.getByRole("textbox", { name: "Search clipboard history" });
  await search.fill("long");
  await page.keyboard.press("Control+Shift+l");
  await expect(page.getByRole("button", { name: "Unlock persistent filter" })).toHaveAttribute("aria-pressed", "true");

  await page.getByLabel("Hide Copicu").click();
  await expect(search).toHaveValue("long");

  await search.focus();
  await page.keyboard.press("Control+Shift+l");
  await expect(page.getByRole("button", { name: "Lock filter across picker closes" })).toHaveAttribute("aria-pressed", "false");
  await page.getByLabel("Hide Copicu").click();
  await expect(search).toHaveValue("");
});

test("filter lock restores the applied query after renderer reload", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page);

  const search = page.getByRole("textbox", { name: "Search clipboard history" });
  await search.fill("long");
  await page.getByRole("button", { name: "Lock filter across picker closes" }).click();
  await page.reload();

  await expect(page.getByRole("textbox", { name: "Search clipboard history" })).toHaveValue("long");
  await expect(page.getByRole("button", { name: "Unlock persistent filter" })).toHaveAttribute("aria-pressed", "true");
});

test("filter lock rejects an incomplete draft without persisting it", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page);

  const search = page.getByRole("textbox", { name: "Search clipboard history" });
  await search.fill("tag:");
  const lock = page.getByRole("button", { name: "Lock filter across picker closes" });
  await expect(lock).toHaveAttribute("aria-pressed", "false");
  await lock.click();
  await expect(lock).toHaveAttribute("aria-pressed", "false");
  await expect.poll(() => page.evaluate(() => localStorage.getItem("copicu.filter-lock.v1"))).toBeNull();
  expect(await page.evaluate(() =>
    (window as any).__copicuTestInvocations.some(
      (call: any) => call.cmd === "history_search" && call.args.request.query === "tag:",
    ),
  )).toBe(false);
});

test("clear filter button clears and unlocks a persistent filter", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page);

  const search = page.getByRole("textbox", { name: "Search clipboard history" });
  await search.fill("long");
  await page.getByRole("button", { name: "Lock filter across picker closes" }).click();
  await page.getByRole("button", { name: "Clear filter" }).click();

  await expect(search).toHaveValue("");
  await expect(page.getByRole("button", { name: "Clear filter" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Lock filter across picker closes" })).toBeDisabled();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("copicu.filter-lock.v1"))).toBeNull();
});

test("Escape during a delayed clear does not restore the applied filter", async ({ page }) => {
  await mockTauriInvoke(page, syntheticLongHistory, null, {
    historySearchDelayMs: 260,
    searchTriggerMode: "enter",
  });
  await gotoShell(page);

  const search = page.getByRole("textbox", { name: "Search clipboard history" });
  await search.fill("long");
  await search.press("Enter");
  await expect(page.locator("[title='Result count']")).toHaveText("2 / 4 matches", { timeout: 5000 });
  await page.evaluate(() => {
    (window as any).__copicuTestInvocations = [];
  });

  await search.press("Escape");
  await expect(search).toHaveValue("");
  await expect(page.locator("[title='Result count']")).toHaveText("Clearing filter");
  await search.press("Escape");
  await page.waitForTimeout(80);
  await expect(search).toHaveValue("");
  expect(await page.evaluate(() =>
    (window as any).__copicuTestInvocations.filter(
      (call: any) => call.cmd === "history_search" && call.args.request.query === "long",
    ).length,
  )).toBe(0);
  await expect(page.locator("[title='Result count']")).toHaveText("4 total", { timeout: 5000 });
});

test("right click on item opens item actions menu", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page);

  const item = page.getByRole("button", { name: /COPICU_SYNTH_LONG_SINGLE_LINE/ });
  await item.scrollIntoViewIfNeeded();
  const box = await item.boundingBox();
  expect(box).not.toBeNull();
  const pointer = {
    x: Math.round(box!.x + 40),
    y: Math.round(box!.y + 18),
  };

  await item.click({ button: "right", position: { x: 76, y: 18 } });

  const menu = page.getByRole("menu", { name: "Item actions" });
  await expect(menu).toBeVisible();
  const menuBox = await menu.boundingBox();
  expect(menuBox).not.toBeNull();
  const expected = await page.evaluate(
    ({ x, y }) => ({
      x: Math.min(Math.max(x + 6, 8), Math.max(8, window.innerWidth - 260 - 8)),
      y: Math.min(Math.max(y + 6, 8), Math.max(8, window.innerHeight - 302 - 8)),
    }),
    pointer,
  );
  expect(Math.abs(menuBox!.x - expected.x)).toBeLessThanOrEqual(48);
  expect(Math.abs(menuBox!.y - expected.y)).toBeLessThanOrEqual(16);
  await expect(menu.getByRole("menuitem", { name: "Activate" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Paste", exact: true })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Paste plain" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Open URL" })).toHaveCount(0);
  await expect(menu.getByRole("menuitem", { name: "copy-current-title" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "join-selected-with-log-name" })).toBeVisible();
  await expect(menu.getByRole("group", { name: "Principal" })).toBeVisible();
  await expect(menu.getByRole("group", { name: "Editar" })).toBeVisible();
  await expect(menu.getByRole("group", { name: "Más" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Edit tags" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Delete" })).toHaveCount(0);

  await menu.getByRole("menuitem", { name: "Paste", exact: true }).click();
  await expect(menu).toBeHidden();
});

test("URL action appears only when selected text contains an URL", async ({ page }) => {
  await mockTauriInvoke(page, [
    {
      ...syntheticLongHistory[1],
      id: 201,
      text: "Open https://example.test/copicu from a legacy text clip",
      mime_primary: null,
    },
  ]);
  await gotoShell(page);

  await expect(page.locator("[title='Result count']")).toHaveText("1 total");
  const item = page.getByRole("button", { name: /https:\/\/example\.test\/copicu/ });
  await item.click({ button: "right" });

  const menu = page.getByRole("menu", { name: "Item actions" });
  await expect(menu.getByRole("menuitem", { name: "Paste plain" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Open URL" })).toBeVisible();
});

test("item hover actions appear only while hovering row", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page);

  const firstRow = page.locator(".history-feed.has-items > li").first();
  const menuButton = firstRow.locator(".item-menu-button");
  const previewButton = firstRow.locator(".item-preview-button");
  const editButton = firstRow.locator(".item-edit-button");
  const deleteButton = firstRow.locator(".item-delete-button");
  const hoverActions = [menuButton, previewButton, editButton, deleteButton];

  await page.mouse.move(1, 1);
  await expect(menuButton).toHaveCSS("opacity", /0\.7/);
  for (const action of [previewButton, editButton, deleteButton]) await expect(action).toHaveCSS("opacity", "0");

  await firstRow.hover();
  for (const action of hoverActions) await expect(action).toHaveCSS("opacity", "1");

  await page.mouse.move(1, 1);
  await expect(menuButton).toHaveCSS("opacity", /0\.7/);
  for (const action of [previewButton, editButton, deleteButton]) await expect(action).toHaveCSS("opacity", "0");
});

test("dots menu uses pointer position too", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page);
  await waitForDefaultHistoryReady(page);

  const firstRow = page.locator(".history-feed.has-items > li").first();
  const menuButton = firstRow.locator(".item-menu-button");
  await firstRow.hover();
  const box = await menuButton.boundingBox();
  expect(box).not.toBeNull();
  const pointer = {
    x: Math.round(box!.x + box!.width / 2),
    y: Math.round(box!.y + box!.height / 2),
  };

  await page.mouse.click(pointer.x, pointer.y);

  const menu = page.getByRole("menu", { name: "Item actions" });
  await expect(menu).toBeVisible();
  const menuBox = await menu.boundingBox();
  expect(menuBox).not.toBeNull();
  const expected = await page.evaluate(
    ({ x, y }) => ({
      x: Math.min(Math.max(x + 6, 8), Math.max(8, window.innerWidth - 260 - 8)),
      y: Math.min(Math.max(y + 6, 8), Math.max(8, window.innerHeight - 302 - 8)),
    }),
    pointer,
  );
  expect(Math.abs(menuBox!.x - expected.x)).toBeLessThanOrEqual(48);
  expect(Math.abs(menuBox!.y - expected.y)).toBeLessThanOrEqual(16);
});

test("multi selection context menu only shows shared actions", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page);

  await selectLongSingleLineAndUnbroken(page);
  await page.getByRole("button", { name: /COPICU_SYNTH_LONG_UNBROKEN/ }).click({
    button: "right",
  });

  const menu = page.getByRole("menu", { name: "Item actions" });
  await expect(menu.getByRole("menuitem", { name: "Join selected" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "join-selected-with-log-name" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Edit tags for selected" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Delete 2 selected" })).toHaveCount(0);
  await expect(menu.getByRole("menuitem", { name: "Clear selection" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Activate" })).toHaveCount(0);
  await expect(menu.getByRole("menuitem", { name: "Paste" })).toHaveCount(0);
  await expect(menu.getByRole("menuitem", { name: "Paste plain" })).toHaveCount(0);
  await expect(menu.getByRole("menuitem", { name: "copy-current-title" })).toHaveCount(0);
  await expect(menu.getByRole("menuitem", { name: "Edit", exact: true })).toHaveCount(0);
});

test("built-in action uses ids only and shows stacked toast", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page);

  await selectLongSingleLineAndUnbroken(page);
  await page.getByRole("button", { name: /COPICU_SYNTH_LONG_UNBROKEN/ }).click({
    button: "right",
  });
  await page.getByRole("menuitem", { name: "Join selected" }).click();

  await expect(page.getByLabel("Notifications")).toBeVisible();
  await expect(page.getByText("Joined 2 items")).toBeVisible();

  const request = await page.evaluate(() =>
    (window as any).__copicuTestInvocations
      .filter((call: any) => call.cmd === "run_action")
      .at(-1)
      .args.request,
  );
  expect(request.actionId).toBe("builtin.joinSelected");
  expect(request.context.selectedItemIds).toEqual([101, 102]);
  expect(JSON.stringify(request)).not.toContain("COPICU_SYNTH");
});

test("command palette runs ready built-in and script actions", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page);

  await page.getByRole("button", { name: /COPICU_SYNTH_LONG_SINGLE_LINE/ }).click();
  await page.keyboard.press("Control+K");
  const palette = page.getByRole("dialog", { name: "Command palette" });
  await expect(palette).toBeVisible();
  await expect(page.getByLabel("Search commands")).toBeFocused();
  await expect(palette.getByRole("option", { name: /Paste plain/ })).toBeVisible();
  await expect(palette.getByRole("option", { name: /toast-hello/ })).toBeVisible();
  await expect(palette.getByRole("option", { name: /Ctrl\+Alt\+J/ })).toBeVisible();

  await page.getByLabel("Search commands").fill("toast");
  await page.keyboard.press("Enter");

  await page.waitForFunction(() => {
    const calls = (window as any).__copicuTestInvocations;
    return calls.some((call: any) => call.cmd === "run_action" && call.args.request.actionId === "examples.mock1");
  });
  const request = await page.evaluate(() =>
    (window as any).__copicuTestInvocations
      .filter((call: any) => call.cmd === "run_action")
      .at(-1)
      .args.request,
  );
  expect(request.context.trigger).toBe("commandPalette");
  expect(request.context.selectedItemIds).toEqual([]);
  await expect(palette).toBeHidden();
});

test("quick actions opens with Ctrl+Alt+Q and runs contextual script", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page);

  await selectLongSingleLine(page);
  await page.keyboard.press("Control+Alt+Q");
  const picker = page.getByRole("dialog", { name: "Quick Actions" });
  await expect(picker).toBeVisible();
  await expect(page.getByLabel("Search quick actions")).toBeFocused();
  await expect(picker.getByRole("option", { name: /Join selected/ })).toBeVisible();
  await expect(picker.getByRole("option", { name: /join-selected-with-log-name/ })).toBeVisible();
  await expect(picker.getByRole("option", { name: /global-reserved/ })).toHaveCount(0);

  await page.getByLabel("Search quick actions").fill("join-selected-with-log");
  await page.keyboard.press("Enter");

  await page.waitForFunction(() => {
    const calls = (window as any).__copicuTestInvocations;
    return calls.some((call: any) => call.cmd === "run_action" && call.args.request.actionId === "examples.mock3");
  });
  const request = await page.evaluate(() =>
    (window as any).__copicuTestInvocations
      .filter((call: any) => call.cmd === "run_action")
      .at(-1)
      .args.request,
  );
  expect(request.actionId).toBe("examples.mock3");
  expect(request.context.trigger).toBe("localShortcut");
  expect(request.context.shortcut).toBe("Ctrl+Alt+J");
  expect(request.context.selectedItemIds).toEqual([101]);
  await expect(picker).toBeHidden();
});

test("quick actions handles multi-selected legacy text clips without MIME", async ({ page }) => {
  await mockTauriInvoke(page, [
    { ...syntheticLongHistory[1], id: 301, mime_primary: null },
    { ...syntheticLongHistory[2], id: 302, mime_primary: null },
  ]);
  await gotoShell(page);

  await expect(page.locator("[title='Result count']")).toHaveText("2 total");
  const first = page.getByRole("button", { name: /COPICU_SYNTH_LONG_SINGLE_LINE/ });
  const second = page.getByRole("button", { name: /COPICU_SYNTH_LONG_UNBROKEN/ });
  await first.click();
  await second.click({ modifiers: ["Control"] });
  await expect(first).toHaveClass(/is-multi-selected/);
  await expect(second).toHaveClass(/is-multi-selected/);

  await page.keyboard.press("Control+Alt+Q");
  const picker = page.getByRole("dialog", { name: "Quick Actions" });
  await expect(picker).toBeVisible();
  await expect(picker.getByRole("option", { name: /Join selected/ })).toBeVisible();
  await expect(picker.getByRole("option", { name: /Open URL/ })).toHaveCount(0);
});

test("action filter effect settles history instead of leaving Filtering", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page);

  await page.getByRole("button", { name: /COPICU_SYNTH_LONG_SINGLE_LINE/ }).click();
  await page.keyboard.press("Control+K");
  await page.getByRole("option", { name: /url-open-or-filter/ }).click();

  await expect(page.getByLabel("Search clipboard history")).toHaveValue("unbroken");
  await expect(page.locator("[title='Result count']")).toHaveText("1 / 4 matches");
  await expect(page.getByRole("button", { name: /COPICU_SYNTH_LONG_UNBROKEN/ })).toBeVisible();
});

test("local shortcut runs matching ready script with shortcut context", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page);

  await selectLongSingleLine(page);
  await page.keyboard.press("Control+Alt+J");

  await page.waitForFunction(() => {
    const calls = (window as any).__copicuTestInvocations;
    return calls.some((call: any) => call.cmd === "run_action" && call.args.request.actionId === "examples.mock3");
  });
  const request = await page.evaluate(() =>
    (window as any).__copicuTestInvocations
      .filter((call: any) => call.cmd === "run_action")
      .at(-1)
      .args.request,
  );
  expect(request.actionId).toBe("examples.mock3");
  expect(request.context.trigger).toBe("localShortcut");
  expect(request.context.shortcut).toBe("Ctrl+Alt+J");
  expect(request.context.selectedItemIds).toEqual([101]);
  expect(JSON.stringify(request)).not.toContain("COPICU_SYNTH");
});

test("hiding picker resets transient selection but preserves durable marks", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page);

  await page.getByLabel("Mark item").first().click();
  await page.getByRole("button", { name: /COPICU_SYNTH_LONG_UNBROKEN/ }).click();
  await expect(page.getByLabel("Search clipboard history")).toBeFocused();
  await page.keyboard.press("Escape");

  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.waitForFunction(() => {
    const calls = (window as any).__copicuTestInvocations;
    return calls.filter((call: any) => call.cmd === "history_search").length >= 2;
  });
  await expect(page.locator(".selection-action-bar")).toHaveCount(0);
  await expect(page.getByLabel("Select item")).toHaveCount(4);
  await expect(page.getByLabel("Unmark item")).toHaveCount(1);

  await page.keyboard.press("Control+Alt+J");
  await page.waitForFunction(() => {
    const calls = (window as any).__copicuTestInvocations;
    return calls.some((call: any) => call.cmd === "run_action" && call.args.request.actionId === "examples.mock3");
  });

  const request = await page.evaluate(() =>
    (window as any).__copicuTestInvocations
      .filter((call: any) => call.cmd === "run_action")
      .at(-1)
      .args.request,
  );
  expect(request.context.trigger).toBe("localShortcut");
  expect(request.context.selectedItemIds).toEqual([100]);
});

test("capture while picker is hidden becomes the active first item on reopen", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page);

  await page.getByRole("button", { name: /COPICU_SYNTH_LONG_UNBROKEN/ }).click();
  await page.getByLabel("Hide Copicu").click();

  const newItemId = 9901;
  const newItemText = "COPICU_SYNTH_CAPTURED_WHILE_HIDDEN";
  await page.evaluate(({ newItemId, newItemText }) => {
    (window as any).__copicuTestWindowVisible = false;
    const sourceItems = (window as any).__copicuTestHistoryItems;
    (window as any).__copicuTestHistoryItems = [{
      ...sourceItems[0],
      id: newItemId,
      text: newItemText,
      preview_text: newItemText,
      normalized_hash: `hidden-${newItemId}`,
      created_at_unix_ms: Date.now(),
      last_used_at_unix_ms: Date.now(),
      last_copied_at_unix_ms: Date.now(),
    }, ...sourceItems];
    (window as any).__copicuTestPickerSessionSnapshots.push({
      reset: true,
      generation: 1,
      pendingActivationItemId: newItemId,
    });
  }, { newItemId, newItemText });
  await page.evaluate(async ({ newItemId }) => {
    await (window as any).__copicuTestEmitEvent("copicu://history/changed", {
      itemId: newItemId,
      contentKind: "text",
      activate: true,
    });
    (window as any).__copicuTestWindowVisible = true;
    window.dispatchEvent(new Event("focus"));
  }, { newItemId });

  const capturedItem = page.getByRole("button", { name: newItemText });
  await expect(capturedItem).toBeVisible();
  await expect(capturedItem).toHaveAttribute("aria-current", "true");
  await expect(page.locator(".history-feed.has-items > li").first()).toContainText(newItemText);
});

test("active item action uses current item even with multi selection", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page);

  await selectLongSingleLineAndUnbroken(page);
  await page.keyboard.press("Control+Alt+M");

  await page.waitForFunction(() => {
    const calls = (window as any).__copicuTestInvocations;
    return calls.some((call: any) => call.cmd === "run_action" && call.args.request.actionId === "examples.mock7");
  });
  const request = await page.evaluate(() =>
    (window as any).__copicuTestInvocations
      .filter((call: any) => call.cmd === "run_action")
      .at(-1)
      .args.request,
  );
  expect(request.context.activeItemId).toBe(102);
  expect(request.context.currentItemId).toBe(102);
  expect(request.context.selectedItemIds).toEqual([101, 102]);
});

test("local shortcut does not run when selected input kind is incompatible", async ({ page }) => {
  await mockTauriInvoke(page, [
    {
      ...syntheticLongHistory[0],
      id: 900,
      content_kind: "image",
      text: "COPICU_SYNTH_IMAGE_ONLY",
      mime_primary: "image/png",
      normalized_hash: "synthetic-image-only",
      thumbnail_data_url: null,
    },
  ]);
  await gotoShell(page);

  await page.getByRole("button", { name: /COPICU_SYNTH_IMAGE_ONLY/ }).click();
  await expect(page.getByLabel("Search clipboard history")).toBeFocused();
  await page.keyboard.press("Control+Alt+J");
  await page.waitForTimeout(150);

  const localShortcutRuns = await page.evaluate(() =>
    (window as any).__copicuTestInvocations.filter(
      (call: any) =>
        call.cmd === "run_action" &&
        call.args.request.actionId === "examples.mock3" &&
        call.args.request.context.trigger === "localShortcut",
    ),
  );
  expect(localShortcutRuns).toHaveLength(0);
});

test("delete key in search input does not delete selected items", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page);

  await selectLongSingleLineAndUnbroken(page);
  const search = page.getByLabel("Search clipboard history");
  await expect(search).toBeFocused();
  await page.keyboard.press("Delete");
  await page.waitForTimeout(150);

  const deletedIds = await page.evaluate(() =>
    (window as any).__copicuTestInvocations
      .filter((call: any) => call.cmd === "delete_history_item")
      .map((call: any) => call.args.id),
  );
  expect(deletedIds).toEqual([]);
});

test("delete key in search input preserves native text editing", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page);

  const search = page.getByLabel("Search clipboard history");
  await search.fill("COPICU_DELETE_GUARD");
  await search.evaluate((element) => {
    const input = element as HTMLInputElement;
    input.setSelectionRange(7, 13);
  });
  await page.keyboard.press("Delete");
  await expect(search).toHaveValue("COPICU__GUARD");
  await page.waitForTimeout(150);

  const deletedIdsAfterTextEdit = await page.evaluate(() =>
    (window as any).__copicuTestInvocations
      .filter((call: any) => call.cmd === "delete_history_item")
      .map((call: any) => call.args.id),
  );
  expect(deletedIdsAfterTextEdit).toEqual([]);
});

test("ctrl+a in search input replaces query text", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page);

  const search = page.getByLabel("Search clipboard history");
  await search.fill("#path");
  await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
  await page.keyboard.type("constelaciones");

  await expect(search).toHaveValue("constelaciones");
  await expect(page.locator(".feed-item.is-multi-selected")).toHaveCount(0);
});

test("selection action bar deletes selected items", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page);

  await selectLongSingleLineAndUnbroken(page);
  await page.locator(".selection-action-bar").getByRole("button", { name: "Delete", exact: true }).click();

  await page.waitForFunction(() => {
    const calls = (window as any).__copicuTestInvocations;
    return calls.filter((call: any) => call.cmd === "delete_history_item").length >= 2;
  });
  const deletedIds = await page.evaluate(() =>
    (window as any).__copicuTestInvocations
      .filter((call: any) => call.cmd === "delete_history_item")
      .map((call: any) => call.args.id),
  );
  expect(deletedIds).toEqual([101, 102]);
});

test("shift delete deletes selected items", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page);

  await selectLongSingleLineAndUnbroken(page);
  await page.keyboard.press("Shift+Delete");

  await page.waitForFunction(() => {
    const calls = (window as any).__copicuTestInvocations;
    return calls.filter((call: any) => call.cmd === "delete_history_item").length >= 2;
  });
  const deletedIds = await page.evaluate(() =>
    (window as any).__copicuTestInvocations
      .filter((call: any) => call.cmd === "delete_history_item")
      .map((call: any) => call.args.id),
  );
  expect(deletedIds).toEqual([101, 102]);
});

test("ctrl+d deletes selected items", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page);

  await selectLongSingleLineAndUnbroken(page);
  await page.keyboard.press("Control+d");

  await page.waitForFunction(() => {
    const calls = (window as any).__copicuTestInvocations;
    return calls.filter((call: any) => call.cmd === "delete_history_item").length >= 2;
  });
  const deletedIds = await page.evaluate(() =>
    (window as any).__copicuTestInvocations
      .filter((call: any) => call.cmd === "delete_history_item")
      .map((call: any) => call.args.id),
  );
  expect(deletedIds).toEqual([101, 102]);
});

test("multi selection tag editor patches added and removed tags without replacement", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page);

  await selectLongSingleLineAndUnbroken(page);
  await page.locator(".selection-action-bar").getByRole("button", { name: "Tags", exact: true }).click();

  const dialog = page.getByRole("dialog", { name: "Edit tags for selection" });
  await expect(dialog.getByText("Edit tags for 2 clips")).toBeVisible();
  await expect(dialog.getByText("Add and remove only the tags you choose.")).toBeVisible();
  const addInput = dialog.getByRole("textbox", { name: "Tag to add" });
  await addInput.fill("batch-tag");
  await addInput.press("Enter");
  const removeInput = dialog.getByRole("textbox", { name: "Tag to remove" });
  await removeInput.fill("work");
  await removeInput.press("Enter");
  await dialog.getByRole("button", { name: "Apply tag changes" }).click();

  const call = await page.waitForFunction(() =>
    (window as any).__copicuTestInvocations.find((entry: any) => entry.cmd === "apply_item_tags"),
  );
  const request = (await call.jsonValue() as any).args.request;
  expect(request.itemIds).toEqual([101, 102]);
  expect(request.mode).toBe("patch");
  expect(request.tags).toEqual(["batch-tag"]);
  expect(request.removeTags).toEqual(["Work"]);
});

test("dark color scheme uses dark surfaces", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await mockTauriInvoke(page);
  await gotoShell(page);
  await expect(page.getByLabel("Search clipboard history")).toBeVisible();

  const colors = await page.evaluate(() => {
    const body = getComputedStyle(document.body).backgroundColor;
    const shell = getComputedStyle(document.querySelector<HTMLElement>(".app-shell")!).backgroundColor;
    const panel = getComputedStyle(document.querySelector<HTMLElement>(".picker-panel")!).backgroundColor;
    return { body, shell, panel };
  });

  expect(colors.shell).not.toBe("rgb(238, 240, 239)");
  expect(colors.panel).not.toBe("rgb(251, 251, 250)");
});

test("picker local settings shortcut opens settings", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page);

  await page.getByLabel("Search clipboard history").focus();
  await page.keyboard.press("Control+Comma");

  await page.waitForFunction(() =>
    (window as any).__copicuTestInvocations.some(
      (call: any) => call.cmd === "open_settings_window",
    ),
  );
});

test("settings panel is searchable and saves theme", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page);

  await page.getByRole("button", { name: "Open picker menu" }).click();
  await page.getByRole("menuitem", { name: "Settings" }).click();
  await page.waitForFunction(() =>
    (window as any).__copicuTestInvocations.some(
      (call: any) => call.cmd === "open_settings_window",
    ),
  );

  await gotoShell(page, "/?window=settings");
  await expect(page.getByLabel("Search settings")).toBeVisible();
  await page.getByLabel("Search settings").fill("structured");
  await expect(page.getByRole("switch", { name: "Confirm structured filters with Enter" })).toBeVisible();
  await page.getByLabel("Search settings").fill("item preview");
  const previewShortcutInput = page.getByLabel("Preview shortcut manual value");
  await expect(previewShortcutInput).toHaveValue("Alt+Enter");
  await previewShortcutInput.fill("F3");
  await previewShortcutInput.press("Enter");
  await expect(page.getByLabel("Preview shortcut", { exact: true })).toContainText("F3");
  await page.getByLabel("Search settings").fill("clipboard capture");
  const captureSwitch = page.getByRole("switch", { name: "Capture clipboard changes" });
  await expect(captureSwitch).toBeChecked();
  await captureSwitch.click();
  await expect(captureSwitch).not.toBeChecked();
  await page.getByLabel("Search settings").fill("automatic updates");
  await expect(page.getByRole("switch", { name: "Automatic updates" })).toBeChecked();
  await page.getByLabel("Search settings").fill("scripts");
  await expect(page.getByLabel("Discovered actions summary")).toContainText("3 built-in");
  await expect(page.getByLabel("Discovered actions summary")).toContainText("7 scripts");
  await expect(page.getByLabel("Discovered actions summary")).toContainText("2 diagnostics");
  await expect(page.getByLabel("Script registry")).toContainText("003-join-selected-with-log-name.ts");
  await expect(page.getByLabel("Script registry")).toContainText("synthetic warning for registry debug");
  await expect(page.getByLabel("Script registry")).toContainText("global shortcut is reserved");
  const registryOverflow = await page.getByLabel("Script registry").evaluate((element) =>
    Array.from(element.querySelectorAll<HTMLElement>("*")).some(
      (child) => child.scrollWidth > Math.ceil(child.clientWidth) + 1,
    ),
  );
  expect(registryOverflow).toBe(false);
  await page.getByLabel("Search settings").fill("hotkeys");
  await expect(page.getByLabel("App shortcuts")).toContainText("Open picker");
  await expect(page.getByLabel("App shortcuts")).toContainText("Registered");
  await expect(page.getByLabel("App shortcuts")).toContainText("Open settings");
  await expect(page.getByLabel("App shortcuts")).toContainText("Toggle pin on top");
  await page.getByRole("button", { name: "Edit shortcut" }).first().click();
  await expect(page.getByText("Manual source edit")).toBeVisible();
  await expect(page.getByText("Current shortcut")).toBeVisible();
  await page.getByRole("button", { name: "Open this file" }).click();
  await page.getByRole("button", { name: "Refresh diagnostics" }).click();
  await expect(page.getByText("Scripts refreshed")).toBeVisible();
  const invocations = await page.evaluate(() => (window as any).__copicuTestInvocations);
  expect(invocations.some((entry: any) => entry.cmd === "edit_script_in_vscode")).toBe(true);
  expect(invocations.some((entry: any) => entry.cmd === "refresh_script_action_cache")).toBe(true);
  await page.getByLabel("Search settings").fill("theme");
  const themeSelect = page.getByRole("combobox", { name: "Theme" });
  await expect(themeSelect).toBeVisible();
  await expect(page.getByLabel("Retention count")).toHaveCount(0);
  await themeSelect.click();
  await page.getByRole("option", { name: "Dark" }).click();
  await page.getByRole("tab", { name: /Appearance/ }).click();
  const presetSelect = page.getByRole("combobox", { name: "Theme preset" });
  await expect(presetSelect).toBeVisible();
  await presetSelect.click();
  await expect(page.getByRole("option", { name: "Midnight" })).toBeVisible();
  await expect(page.getByRole("option", { name: "Blueprint" })).toBeVisible();
  await expect(page.getByRole("option", { name: "Moss" })).toBeVisible();
  await expect(page.getByRole("option", { name: "Rose" })).toBeVisible();
  await page.getByRole("option", { name: "Code" }).click();

  await page.getByRole("tab", { name: /Editor/ }).click();
  const editorFont = page.getByRole("combobox", { name: "Editor font" });
  await editorFont.click();
  await page.getByRole("option", { name: "Consolas", exact: true }).click();
  await page.getByLabel("Editor font size").fill("16");
  const lineSpacing = page.getByRole("combobox", { name: "Editor line spacing" });
  await lineSpacing.click();
  await page.getByRole("option", { name: "Relaxed" }).click();
  await page.getByRole("switch", { name: "Wrap long lines" }).click();
  const tabSize = page.getByRole("combobox", { name: "Editor tab size" });
  await tabSize.click();
  await page.getByRole("option", { name: "2 spaces" }).click();
  await page.getByRole("switch", { name: "Highlight active line" }).click();
  await expect(page.getByLabel("Editor appearance preview").locator("code").first()).toHaveCSS("font-size", "16px");
  await page.getByRole("button", { name: "Save" }).click();

  await page.waitForFunction(() => document.documentElement.dataset.theme === "dark");
  await page.waitForFunction(() => document.documentElement.dataset.themeId === "code");
  await page.waitForFunction(() => {
    const root = getComputedStyle(document.documentElement);
    return root.getPropertyValue("--accent").trim() === "#95d5a8";
  });
  const savedSettings = await page.evaluate(() => (window as any).__copicuTestSettings);
  expect(savedSettings.appearance.theme).toBe("dark");
  expect(savedSettings.appearance.themeId).toBe("code");
  expect(savedSettings.editor).toMatchObject({
    fontFamily: "consolas",
    fontSize: 16,
    lineHeight: "relaxed",
    wrapLines: false,
    tabSize: 2,
    lineNumbers: true,
    highlightActiveLine: false,
  });
  expect(savedSettings.general.captureEnabled).toBe(false);
  expect(savedSettings.picker.previewShortcut).toBe("F3");

  await page.getByLabel("Search settings").fill("ai");
  await expect(page.getByLabel("AI endpoint")).toBeVisible();
  await expect(page.getByLabel("AI model")).toBeVisible();
  await expect(page.getByLabel("AI API key")).toBeVisible();
});

test("item actions stay behind the stable kebab and expose complete grouped labels", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page);
  await waitForDefaultHistoryReady(page);

  const secondItem = page.locator(".feed-item").nth(1);
  await expect(page.getByRole("button", { name: "Preview item" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Quick edit item" })).toHaveCount(0);
  const menuButton = page.getByRole("button", { name: "Open item actions" }).nth(1);
  const hitTarget = await menuButton.boundingBox();
  expect(hitTarget?.width).toBeGreaterThanOrEqual(44);
  expect(hitTarget?.height).toBeGreaterThanOrEqual(44);
  await secondItem.hover();
  await menuButton.click();

  const itemMenu = page.getByRole("menu", { name: "Item actions" });
  await expect(itemMenu).toBeVisible();
  await expect(itemMenu.getByRole("group", { name: "Principal" })).toBeVisible();
  await expect(itemMenu.getByRole("group", { name: "Editar" })).toBeVisible();
  await expect(itemMenu.getByRole("group", { name: "Más" })).toBeVisible();
  const groupOrder = await itemMenu.locator(":scope > .item-menu-group").evaluateAll((groups) =>
    groups.map((group) => group.getAttribute("aria-label")),
  );
  expect(groupOrder).toEqual(["Principal", "Editar", "Más"]);
  const menuLayout = await itemMenu.evaluate((menu) => ({
    fitsViewport: menu.getBoundingClientRect().right <= window.innerWidth - 7,
    labelsWrapWithoutClipping: Array.from(menu.querySelectorAll<HTMLElement>(".item-menu-action > span:not(.shortcut-badge)"))
      .every((label) => label.scrollHeight <= label.clientHeight + 1),
    shortcutBadgesFit: Array.from(menu.querySelectorAll<HTMLElement>(".shortcut-badge"))
      .every((badge) => badge.scrollWidth <= badge.clientWidth + 1),
  }));
  expect(menuLayout).toEqual({
    fitsViewport: true,
    labelsWrapWithoutClipping: true,
    shortcutBadgesFit: true,
  });

  await itemMenu.getByRole("menuitem", { name: /Preview/ }).click();
  await page.waitForFunction(() =>
    (window as any).__copicuTestInvocations.some(
      (entry: any) => entry.cmd === "open_item_preview" && entry.args.request.itemId === 101,
    ),
  );

  await menuButton.click();
  await page.getByRole("menu", { name: "Item actions" }).getByRole("menuitem", { name: "Quick edit" }).click();
  await expect(page.getByRole("textbox", { name: "Quick edit item 101" })).toBeVisible();
  await page.keyboard.press("Escape");
});

test("item preview does not open on hover and configurable hotkey toggles it", async ({ page }) => {
  await mockTauriInvoke(page, syntheticLongHistory, null, { previewShortcut: "Alt+Enter" });
  await gotoShell(page);
  await waitForDefaultHistoryReady(page);

  await page.locator(".feed-item").first().hover();
  await page.waitForTimeout(550);
  let calls = await page.evaluate(() => (window as any).__copicuTestInvocations);
  expect(calls.some((entry: any) => entry.cmd === "open_item_preview" || entry.cmd === "toggle_item_preview")).toBe(false);

  await page.keyboard.press("Alt+Enter");
  await page.waitForFunction(() =>
    (window as any).__copicuTestInvocations.some(
      (entry: any) => entry.cmd === "toggle_item_preview" && entry.args.request.itemId === 100,
    ),
  );
  calls = await page.evaluate(() => (window as any).__copicuTestInvocations);
  expect(calls.filter((entry: any) => entry.cmd === "toggle_item_preview")).toHaveLength(1);
});

test("item preview renders complete Markdown without loading remote media", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page, "/?window=item-preview");

  await expect(page.getByRole("heading", { name: "COPICU_SYNTH_MARKDOWN" })).toBeVisible();
  await expect(page.getByText("Remote image blocked: large")).toBeVisible();
  await expect(page.getByText("Preview", { exact: true })).toBeVisible();
  await expect(page.locator(".item-preview-markdown img")).toHaveCount(0);
});

test("item preview swaps thumbnail for the full image and exposes zoom reset", async ({ page }) => {
  const thumbnail = svgDataUrl(120, 80, "#69747a");
  const fullImage = svgDataUrl(1200, 800, "#245f53");
  await mockTauriInvoke(page, [{
    id: 901,
    content_kind: "image",
    text: "",
    mime_primary: "image/png",
    thumbnail_data_url: thumbnail,
    full_image_data_url: fullImage,
    width: 1200,
    height: 800,
    title: "Synthetic full image",
  }]);
  await gotoShell(page, "/?window=item-preview");

  const image = page.getByRole("img", { name: "Full clipboard item" });
  await expect(image).toHaveAttribute("data-resolution", "full");
  await expect(image).toHaveAttribute("src", fullImage);
  await page.getByRole("button", { name: "Zoom in" }).click();
  await expect(image).toHaveCSS("transform", /matrix\(1\.25/);
  await page.getByRole("button", { name: "Reset zoom and pan" }).click();
  await expect(page.getByText("100%", { exact: true })).toBeVisible();
});

test("item preview shows complete plain text", async ({ page }) => {
  const fullText = `${"complete line\n".repeat(220)}COPICU_TEXT_END`;
  await mockTauriInvoke(page, [{
    id: 902,
    content_kind: "text",
    text: fullText,
    mime_primary: "text/plain",
    thumbnail_data_url: null,
    width: null,
    height: null,
    title: null,
  }]);
  await gotoShell(page, "/?window=item-preview");

  await expect(page.locator(".item-preview-text")).toContainText("COPICU_TEXT_END");
});

test("settings about section shows version and updater status", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page, "/?window=settings");

  await page.getByLabel("Search settings").fill("about");
  await expect(page.getByLabel("About Copicu")).toContainText("Version 0.2.6");
  await expect(page.getByLabel("Update status")).toContainText("No update check has run");
  await expect(page.getByRole("button", { name: "Check now" })).toBeVisible();
});

test("ui-host input prompt fits compact window", async ({ page }) => {
  await page.setViewportSize({ width: 380, height: 230 });
  await gotoShell(page, "/?window=ui-host");

  await expect(page.getByText("Tag selected items")).toBeVisible();
  await expect(page.getByLabel("Tag selected items")).toBeFocused();
  await page.getByLabel("Tag selected items").fill("#synthetic-tag");

  const overflow = await page.locator(".ui-host-panel").evaluate((element) =>
    Array.from(element.querySelectorAll<HTMLElement>("*")).some(
      (child) => child.scrollWidth > Math.ceil(child.clientWidth) + 1,
    ),
  );
  expect(overflow).toBe(false);
});

test("ui-host alert prompt uses a single acknowledgement action", async ({ page }) => {
  await page.setViewportSize({ width: 380, height: 170 });
  await gotoShell(page, "/?window=ui-host&prompt=alert");

  await expect(page.getByText("Clipboard text", { exact: true })).toBeVisible();
  await expect(page.getByText("Current clipboard text length: 42")).toBeVisible();
  await expect(page.getByRole("button", { name: "OK" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Cancel" })).toHaveCount(0);

  const overflow = await page.locator(".ui-host-panel").evaluate((element) =>
    Array.from(element.querySelectorAll<HTMLElement>("*")).some(
      (child) => child.scrollWidth > Math.ceil(child.clientWidth) + 1,
    ),
  );
  expect(overflow).toBe(false);
});

test("ui-host prompt remains readable in dark mode", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.setViewportSize({ width: 340, height: 230 });
  await gotoShell(page, "/?window=ui-host");

  await expect(page.getByText("Tag selected items")).toBeVisible();
  const colors = await page.evaluate(() => {
    const panel = document.querySelector<HTMLElement>(".ui-host-panel")!;
    const title = document.querySelector<HTMLElement>(".ui-host-copy strong")!;
    return {
      panel: getComputedStyle(panel).backgroundColor,
      title: getComputedStyle(title).color,
    };
  });

  expect(colors.panel).not.toBe("rgb(255, 255, 255)");
  expect(colors.title).not.toBe("rgb(22, 26, 29)");
});

test("ai-output renders markdown and actions without overflow", async ({ page }) => {
  await page.setViewportSize({ width: 760, height: 560 });
  await gotoShell(page, "/?window=ai-output");

  await expect(page.locator(".ai-output-title").getByText("Research summary", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Research summary" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add item" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Export" })).toBeVisible();
  await expect(page.locator(".ai-output-document code")).toContainText("markdownOutput");

  const overflow = await page.locator(".ai-output-app").evaluate((element) =>
    Array.from(element.querySelectorAll<HTMLElement>("*")).some(
      (child) => child.scrollWidth > Math.ceil(child.clientWidth) + 1,
    ),
  );
  expect(overflow).toBe(false);
});

test("metadata window keeps tags and properties inline at its minimum size", async ({ page }) => {
  await page.setViewportSize({ width: 380, height: 300 });
  await mockTauriInvoke(page);
  await gotoShell(page, "/?window=metadata");

  const editor = page.getByRole("textbox", { name: "Metadata" });
  await expect(editor).toBeVisible();
  await expect(editor).toBeFocused();
  const itemContent = page.getByLabel("Item content");
  await expect(itemContent).toBeVisible();
  await expect(itemContent).toContainText(syntheticLongHistory[3].text);
  await expect(page.getByRole("textbox", { name: "Title" })).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Notes" })).toHaveCount(0);
  await expect(page.getByLabel("Client properties")).toHaveCount(0);
  await expect(page.getByLabel("Project properties")).toHaveCount(0);
  await expect(editor).toHaveValue(/client:ACME project:Web activity:Development/);
  await expect(page.getByLabel("Capture context")).toHaveCount(0);
  await expect(page.locator(".metadata-text-suggestions")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Cancel" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save" })).toBeVisible();

  await editor.fill('client:"ACME North" client:Globex project:Web activity:"Code review" Markdown note #wo');
  const suggestionList = page.locator(".metadata-text-suggestions");
  await expect(suggestionList).toBeVisible();
  const [suggestionBox, appBox] = await Promise.all([
    suggestionList.boundingBox(),
    page.locator(".metadata-window-app").boundingBox(),
  ]);
  expect(suggestionBox).not.toBeNull();
  expect(appBox).not.toBeNull();
  expect(suggestionBox!.y + suggestionBox!.height).toBeLessThanOrEqual(appBox!.y + appBox!.height);
  await editor.press("Tab");
  await expect(suggestionList).toHaveCount(0);
  await expect(editor).toHaveValue('client:"ACME North" client:Globex project:Web activity:"Code review" Markdown note #work ');

  await editor.pressSequentially("anywhere #ba");
  await expect(suggestionList).toBeVisible();
  await editor.press("Enter");
  await expect(suggestionList).toHaveCount(0);
  await expect(editor).toHaveValue('client:"ACME North" client:Globex project:Web activity:"Code review" Markdown note #work anywhere #backend ');

  await editor.press("Tab");
  await expect(page.getByRole("button", { name: "Cancel" })).toBeFocused();
  await editor.focus();
  await editor.pressSequentially("#wo");
  await expect(suggestionList).toBeVisible();
  await editor.press("Escape");
  await expect(suggestionList).toHaveCount(0);
  await expect(editor).toBeFocused();
  await editor.press("Backspace");
  await editor.press("Backspace");
  await editor.press("Backspace");
  await editor.pressSequentially("#fresh");
  await editor.press("Control+Enter");

  const update = await page.waitForFunction(() =>
    (window as any).__copicuTestInvocations.find((entry: any) => entry.cmd === "update_item_metadata"),
  );
  const request = (await update.jsonValue() as any).args.request;
  expect(request.title).toBe("Multiline sample");
  expect(request.notes).toBe("Markdown note anywhere");
  expect(request.tags).toContain("Work");
  expect(request.tags).toContain("Backend");
  expect(request.tags).toContain("fresh");
  expect(request.properties.client).toEqual(["ACME North", "Globex"]);
  expect(request.properties.project).toEqual(["Web"]);
  expect(request.properties.activity).toEqual(["Code review"]);
  await expect(page.locator(".metadata-window-buttons .mantine-Loader-root")).toHaveCount(0);

  const overflowing = await page.locator(".metadata-window-app").evaluate((element) =>
    Array.from(element.querySelectorAll<HTMLElement>("*"))
      .filter((child) => child.scrollWidth > Math.ceil(child.clientWidth) + 1)
      .map((child) => ({
        className: child.className,
        clientWidth: child.clientWidth,
        scrollWidth: child.scrollWidth,
      })),
  );
  expect(overflowing).toEqual([]);
});
