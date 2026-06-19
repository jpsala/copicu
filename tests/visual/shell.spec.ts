import { expect, test } from "@playwright/test";

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

async function mockTauriInvoke(
  page: Parameters<typeof test>[0]["page"],
  historyItems = syntheticLongHistory,
  initialCompoundPending: unknown = null,
) {
  await page.addInitScript(({ items, pending }) => {
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
      },
      history: {
        retentionCount: 1000,
      },
      appearance: {
        theme: "system",
        themeId: "default",
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
    window.__TAURI_INTERNALS__ = {
      invoke: async (cmd: string, args?: any) => {
        (window as any).__copicuTestInvocations.push({ cmd, args });
        switch (cmd) {
          case "plugin:event|listen":
            return 1;
          case "plugin:event|unlisten":
            return null;
          case "plugin:event|unregisterListener":
            return null;
          case "record_renderer_diagnostic":
            return null;
          case "get_compound_hotkey_pending":
            return (window as any).__copicuTestCompoundPending;
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
            const sourceItems = (window as any).__copicuTestHistoryItems ?? items;
            const query = args?.query?.toLocaleLowerCase() ?? "";
            const request = args?.request ?? {};
            const aiMode = request.mode === "ai";
            const includeCounts = request.includeCounts !== false;
            const interpretedQuery = aiMode ? "long" : request.query ?? "";
            const requestQuery = (aiMode ? interpretedQuery : request.query?.toLocaleLowerCase()) ?? query;
            const limit = request.limit ?? 60;
            const includeContent = Boolean(request.includeContent);
            const filteredItems = requestQuery
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
                  (item) =>
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
              totalCount: includeCounts ? sourceItems.length : undefined,
              filteredCount: includeCounts ? filteredItems.length : undefined,
              interpretedQuery: request.explain ? interpretedQuery : null,
              explanation: request.explain
                ? aiMode
                  ? "Synthetic AI interpreted long text search."
                  : "Structured local history search."
                : null,
              warnings: aiMode ? ["Synthetic unsupported source filter ignored."] : [],
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
          case "pending_metadata_editor":
            return {
              item: withHistoryPreview(((window as any).__copicuTestHistoryItems ?? items)[3] ?? items[0], true),
            };
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
          case "hide_picker":
          case "hide_whichkey_window":
          case "open_settings_window":
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
          case "get_settings":
            return (window as any).__copicuTestSettings;
          case "update_settings":
            (window as any).__copicuTestSettings = args.settings;
            return args.settings;
          default:
            throw new Error(`Unhandled mocked Tauri command: ${cmd}`);
        }
      },
      transformCallback: () => 0,
      unregisterCallback: () => undefined,
      unregisterListener: () => undefined,
      callbacks: {},
      convertFileSrc: (filePath: string) => filePath,
      metadata: {
        currentWindow: { label: "main" },
        currentWebview: { label: "main" },
      },
    };
  }, { items: historyItems, pending: initialCompoundPending });
}

function gotoShell(page: Parameters<typeof test>[0]["page"], url = "/") {
  return page.goto(url, { waitUntil: "domcontentloaded" });
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

test("mark menu marks visible and individual items", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page);

  await page.getByLabel("Mark options").click();
  await page.getByRole("menu", { name: "Mark options" }).getByRole("menuitem", { name: "All visible" }).click();
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
  await expect(menu.getByRole("menuitem", { name: "All visible" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "None visible" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "All results" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "None results" })).toBeVisible();
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

test("mark menu shows global marked count and checkbox states", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page);

  const markButton = page.getByRole("button", { name: "Mark options" });
  await expect(markButton.locator(".mark-state-icon")).toHaveAttribute("data-state", "unchecked");
  await expect(markButton.locator(".mark-menu-count")).toHaveCount(0);

  await page.getByLabel("Mark item").first().click();
  await expect(page.locator(".mark-menu-button")).toBeVisible();
  await expect(page.locator(".mark-menu-button .mark-state-icon")).toHaveAttribute("data-state", "mixed");
  await expect(page.locator(".mark-menu-count")).toHaveText("1");

  await page.getByLabel("Search clipboard history").fill("markdown");
  await expect(page.locator("[title='Result count']")).toHaveText("1 / 4 matches");
  await expect(page.getByRole("button", { name: "Mark options, 1 filtered" })).toBeVisible();

  await page.locator(".mark-menu-button").click();
  await page.getByRole("menu", { name: "Mark options" }).getByRole("menuitem", { name: "All visible" }).click();
  await expect(page.getByRole("button", { name: "Mark options, 1 filtered" })).toBeVisible();
  await expect(page.locator(".mark-menu-button .mark-state-icon")).toHaveAttribute("data-state", "checked");

  await page.getByLabel("Search clipboard history").fill("");
  await expect(page.locator("[title='Result count']")).toHaveText("4 total");
  await page.locator(".mark-menu-button").click();
  await page.getByRole("menu", { name: "Mark options" }).getByRole("menuitem", { name: "All visible" }).click();
  await expect(page.locator(".mark-menu-count")).toHaveText("4");
  await expect(page.locator(".mark-menu-button .mark-state-icon")).toHaveAttribute("data-state", "checked");

  await page.locator(".mark-menu-button").click();
  const menu = page.getByRole("menu", { name: "Mark options" });
  await expect(menu.getByText("Checked items")).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Join checked" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "join-selected-with-log-name" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Add metadata to checked" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Delete 4 checked" })).toBeVisible();
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

  await page.getByRole("button", { name: /COPICU_SYNTH_FULL_CONTENT_START/ }).click({
    button: "right",
  });
  await page.getByRole("menuitem", { name: "Edit metadata" }).click();
  await expect(page.getByRole("dialog", { name: "Edit item metadata" })).toBeVisible();
  await page.getByRole("textbox", { name: "Metadata" }).fill("#perf metadata note");
  await page.getByRole("button", { name: "Save" }).click();

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

test("F2 edits content only and Shift+F2 edits metadata", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page);

  const search = page.getByLabel("Search clipboard history");
  await expect(search).toBeVisible();
  await search.click();

  await page.keyboard.press("F2");
  const contentDialog = page.getByRole("dialog", { name: "Edit clipboard item" });
  await expect(contentDialog).toBeVisible();
  await expect(contentDialog.getByRole("textbox", { name: "Content" })).toBeVisible();
  await expect(contentDialog.getByRole("textbox", { name: "Metadata" })).toHaveCount(0);

  await page.keyboard.press("Escape");
  await expect(contentDialog).toBeHidden();

  await page.keyboard.press("Shift+F2");
  const metadataDialog = page.getByRole("dialog", { name: "Edit item metadata" });
  await expect(metadataDialog).toBeVisible();
  await expect(metadataDialog.getByRole("textbox", { name: "Metadata" })).toBeVisible();
  await expect(metadataDialog.getByRole("textbox", { name: "Content" })).toHaveCount(0);
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

  await page.waitForTimeout(1700);

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
  expect(count("record_renderer_diagnostic")).toBe(0);
  expect(count("get_capture_snapshot")).toBe(0);
  expect(count("get_clipboard_probe")).toBe(0);
  expect(count("history_search")).toBe(1);
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

test("search composer mode toggles with icon button", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page);

  const search = page.getByLabel("Search clipboard history");
  const toggle = page.getByRole("button", { name: "Search mode, switch to AI mode" });

  await expect(search).toHaveAttribute("placeholder", 'Search, "phrase", tag:work, kind:image');
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
  await expect(search).toHaveAttribute("placeholder", 'Search, "phrase", tag:work, kind:image');
  await expect(search).toHaveJSProperty("tagName", "INPUT");
});

test("single click selects item without activating it", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page);

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

  await item.click({ button: "right", position: { x: 40, y: 18 } });

  const menu = page.getByRole("menu", { name: "Item actions" });
  await expect(menu).toBeVisible();
  const menuBox = await menu.boundingBox();
  expect(menuBox).not.toBeNull();
  const expected = await page.evaluate(
    ({ x, y }) => ({
      x: Math.min(Math.max(x + 6, 8), Math.max(8, window.innerWidth - 154 - 8)),
      y: Math.min(Math.max(y + 6, 8), Math.max(8, window.innerHeight - 270 - 8)),
    }),
    pointer,
  );
  expect(Math.abs(menuBox!.x - expected.x)).toBeLessThanOrEqual(48);
  expect(Math.abs(menuBox!.y - expected.y)).toBeLessThanOrEqual(16);
  await expect(menu.getByRole("menuitem", { name: "Activate" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Paste", exact: true })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Paste plain" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Open URL" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "copy-current-title" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "join-selected-with-log-name" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Edit", exact: true })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Edit metadata" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Delete" })).toBeVisible();

  await menu.getByRole("menuitem", { name: "Paste", exact: true }).click();
  await expect(menu).toBeHidden();
});

test("dots menu uses pointer position too", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page);

  const menuButton = page.locator(".item-menu-button").first();
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
      x: Math.min(Math.max(x + 6, 8), Math.max(8, window.innerWidth - 154 - 8)),
      y: Math.min(Math.max(y + 6, 8), Math.max(8, window.innerHeight - 270 - 8)),
    }),
    pointer,
  );
  expect(Math.abs(menuBox!.x - expected.x)).toBeLessThanOrEqual(48);
  expect(Math.abs(menuBox!.y - expected.y)).toBeLessThanOrEqual(16);
});

test("multi selection context menu only shows shared actions", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page);

  await page.getByRole("button", { name: /COPICU_SYNTH_LONG_SINGLE_LINE/ }).click();
  await page.getByRole("button", { name: /COPICU_SYNTH_LONG_UNBROKEN/ }).click({
    modifiers: ["Control"],
  });
  await page.getByRole("button", { name: /COPICU_SYNTH_LONG_UNBROKEN/ }).click({
    button: "right",
  });

  const menu = page.getByRole("menu", { name: "Item actions" });
  await expect(menu.getByRole("menuitem", { name: "Join selected" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "join-selected-with-log-name" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Add metadata to selected" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Delete 2 selected" })).toBeVisible();
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

  await page.getByRole("button", { name: /COPICU_SYNTH_LONG_SINGLE_LINE/ }).click();
  await page.getByRole("button", { name: /COPICU_SYNTH_LONG_UNBROKEN/ }).click({
    modifiers: ["Control"],
  });
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

  await page.getByRole("button", { name: /COPICU_SYNTH_LONG_SINGLE_LINE/ }).click();
  await expect(page.getByLabel("Search clipboard history")).toBeFocused();
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

test("hiding picker resets transient selection to first item on next focus", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page);

  await page.getByRole("button", { name: /COPICU_SYNTH_LONG_UNBROKEN/ }).click();
  await expect(page.getByLabel("Search clipboard history")).toBeFocused();
  await page.keyboard.press("Escape");

  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.waitForFunction(() => {
    const calls = (window as any).__copicuTestInvocations;
    return calls.filter((call: any) => call.cmd === "history_search").length >= 2;
  });

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

test("active item action uses current item even with multi selection", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page);

  await page.getByRole("button", { name: /COPICU_SYNTH_LONG_SINGLE_LINE/ }).click();
  await page.getByRole("button", { name: /COPICU_SYNTH_LONG_UNBROKEN/ }).click({
    modifiers: ["Control"],
  });
  await expect(page.getByLabel("Search clipboard history")).toBeFocused();
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

  await page.getByRole("button", { name: /COPICU_SYNTH_LONG_SINGLE_LINE/ }).click();
  await page.getByRole("button", { name: /COPICU_SYNTH_LONG_UNBROKEN/ }).click({
    modifiers: ["Control"],
  });
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

test("multi selection menu deletes selected items", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page);

  await page.getByRole("button", { name: /COPICU_SYNTH_LONG_SINGLE_LINE/ }).click();
  await page.getByRole("button", { name: /COPICU_SYNTH_LONG_UNBROKEN/ }).click({
    modifiers: ["Control"],
  });
  await page.getByRole("button", { name: /COPICU_SYNTH_LONG_UNBROKEN/ }).click({
    button: "right",
  });
  await page.getByRole("menuitem", { name: "Delete 2 selected" }).click();

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

test("batch metadata uses textarea and extracts hash tags", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page);

  await page.getByRole("button", { name: /COPICU_SYNTH_LONG_SINGLE_LINE/ }).click();
  await page.getByRole("button", { name: /COPICU_SYNTH_LONG_UNBROKEN/ }).click({
    modifiers: ["Control"],
  });
  await page.getByRole("button", { name: /COPICU_SYNTH_LONG_UNBROKEN/ }).click({
    button: "right",
  });
  await page.getByRole("menuitem", { name: "Add metadata to selected" }).click();

  const metadata = page.getByLabel("Metadata for 2 items");
  await expect(metadata).toBeVisible();
  await metadata.fill("#work\nMarkdown note");
  await page.getByRole("button", { name: "Add metadata" }).click();

  await page.waitForFunction(() => {
    const calls = (window as any).__copicuTestInvocations;
    return calls.filter((call: any) => call.cmd === "update_history_item").length >= 2;
  });
  const requests = await page.evaluate(() =>
    (window as any).__copicuTestInvocations
      .filter((call: any) => call.cmd === "update_history_item")
      .map((call: any) => call.args.request),
  );
  expect(requests.map((request: any) => request.id)).toEqual([101, 102]);
  expect(requests.every((request: any) => request.notes.includes("#work"))).toBe(true);
  expect(requests.every((request: any) => request.tags === "#work")).toBe(true);
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

  await page.getByLabel("Search settings").fill("ai");
  await expect(page.getByLabel("AI endpoint")).toBeVisible();
  await expect(page.getByLabel("AI model")).toBeVisible();
  await expect(page.getByLabel("AI API key")).toBeVisible();
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

test("metadata window focuses title input on open", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page, "/?window=metadata");

  const title = page.getByRole("textbox", { name: "Title" });
  await expect(title).toBeVisible();
  await expect(title).toBeFocused();
  await expect(page.getByRole("textbox", { name: "Notes and tags" })).toBeVisible();
});
