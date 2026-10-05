import { expect, test, type Locator, type Page } from "@playwright/test";
import type { AppSettings, SearchScope } from "../../src/shared/settings";

import { Buffer } from "node:buffer";
import { deflateSync } from "node:zlib";
declare const process: { platform: string; env: Record<string, string | undefined> };

function pngDataUrl(width: number, height: number, color: string) {
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    let crc = 0xffffffff;
    for (const byte of body) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const checksum = Buffer.alloc(4);
    checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([length, body, checksum]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  const rgb = Buffer.from(color.slice(1), "hex");
  const pixels = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) rgb.copy(pixels, y * (1 + width * 3) + 1 + x * 3);
  }
  return `data:image/png;base64,${Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header), chunk("IDAT", deflateSync(pixels)), chunk("IEND", Buffer.alloc(0)),
  ]).toString("base64")}`;
}

const syntheticLongHistory = [
  {
    id: 100,
    content_kind: "text",
    text: [
      "## COPICU_SYNTH_MARKDOWN",
      "",
      "![large](" + pngDataUrl(760, 420, "#245f53") + ")",
      "![small](" + pngDataUrl(180, 120, "#69747a") + ")",
      "![medium](" + pngDataUrl(420, 240, "#374047") + ")",
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
    thumbnail_data_url: pngDataUrl(width, height, color),
    title: null,
    notes: null,
    tags: null,
  })),
];

const syntheticAppearanceMarkdownImage = {
  ...syntheticCompactPreviewHistory[0],
  id: 1300,
  content_kind: "text",
  text: `![Appearance preview](${pngDataUrl(120, 640, "#245f53")})`,
  normalized_hash: "appearance-markdown-image",
  mime_primary: "text/markdown",
  title: "Markdown image",
  tags: "markdown",
};

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

const findFixtureHistory = [
  {
    ...syntheticLongHistory[1],
    id: 7001,
    text: "before NEEDLE after NEEDLE",
    created_at_unix_ms: 1_800_000_000_004,
    last_copied_at_unix_ms: 1_800_000_000_004,
    normalized_hash: "find-fixture-1",
  },
  {
    ...syntheticLongHistory[1],
    id: 7002,
    text: "NEEDLE middle",
    created_at_unix_ms: 1_800_000_000_003,
    last_copied_at_unix_ms: 1_800_000_000_003,
    normalized_hash: "find-fixture-2",
  },
  {
    ...syntheticLongHistory[1],
    id: 7003,
    text: "anchor content",
    title: "NEEDLE title",
    created_at_unix_ms: 1_800_000_000_002,
    last_copied_at_unix_ms: 1_800_000_000_002,
    normalized_hash: "find-fixture-3",
  },
  {
    ...syntheticLongHistory[1],
    id: 7004,
    text: "mixed Invoice before ![receipt alt](copicu://receipt.png) after invoice",
    created_at_unix_ms: 1_800_000_000_001,
    last_copied_at_unix_ms: 1_800_000_000_001,
    normalized_hash: "find-fixture-markdown",
  },
];

const makeFindDisplaySegments = (parts: Array<[number, string]>) => {
  let cursor = 0;
  return parts.map(([segment, displayText]) => {
    const next = {
      segment,
      startUtf16: cursor,
      endUtf16: cursor + displayText.length,
      displayText,
    };
    cursor += displayText.length;
    return next;
  });
};

const findCanonicalMarkdownFixture = {
  ...syntheticLongHistory[1],
  id: 7100,
  text: "**Invoice** [Invoice link](copicu://invoice) <!-- Invoice comment -->\n```md\nInvoice fence\n```\n![Invoice alt](copicu://one.png) and ![Invoice alt](copicu://two.png) tail Invoice",
  normalized_hash: "find-canonical-markdown",
  __findCanonicalFields: {
    content: makeFindDisplaySegments([
      [0, "Invoice"],
      [2, " Invoice link"],
      [3, " "],
      [4, "\n"],
      [5, "Invoice fence\n"],
      [6, "\n"],
      [7, " and "],
      [8, " tail Invoice"],
    ]),
    imageAlt: [
      { segment: 0, startUtf16: 0, endUtf16: 11, displayText: "Invoice alt" },
      { segment: 1, startUtf16: 0, endUtf16: 11, displayText: "Invoice alt" },
    ],
  },
};

const findReferenceMarkdownFixture = {
  ...syntheticLongHistory[1],
  id: 7200,
  text: `![receipt][img] and ![receipt][img]\n   [img]: <https://secret.example/account> "private title"`,
  normalized_hash: "find-reference-markdown",
  __findCanonicalFields: {
    content: makeFindDisplaySegments([
      [0, " and "],
      [1, "\n"],
    ]),
    imageAlt: [
      { segment: 0, startUtf16: 0, endUtf16: 7, displayText: "receipt" },
      { segment: 1, startUtf16: 0, endUtf16: 7, displayText: "receipt" },
    ],
  },
};

const findLargeRebaseHistory = Array.from({ length: 2_000 }, (_, index) => ({
  ...syntheticLongHistory[1],
  id: 8_000 + index,
  text: `NEEDLE large fixture ${index}`,
  created_at_unix_ms: 1_800_000_010_000 - index,
  last_copied_at_unix_ms: 1_800_000_010_000 - index,
  normalized_hash: `find-large-rebase-${index}`,
}));

const makeCanonicalSearchPlan = (overrides: {
  text?: Partial<{ all: string[]; any: string[]; phrases: string[]; exclude: string[]; regex: string | null }> | null;
  filters?: Partial<Record<string, unknown>> | null;
  sort?: Array<{ field: "created" | "lastUsed" | "lastCopied"; direction: "asc" | "desc" }>;
  limit?: number | null;
} = { }) => ({
  schemaVersion: 1,
  text: overrides.text === null
    ? null
    : {
        all: [],
        any: [],
        phrases: [],
        exclude: [],
        regex: null,
        ...overrides.text,
      },
  filters: overrides.filters === null
    ? null
    : {
        kind: [],
        notKind: [],
        mime: [],
        notMime: [],
        tags: [],
        notTags: [],
        has: [],
        missing: [],
        marked: null,
        date: [],
        sourceApp: [],
        notSourceApp: [],
        windowTitle: [],
        notWindowTitle: [],
        domain: [],
        notDomain: [],
        sourceKind: [],
        clipboardFormat: [],
        metadata: [],
        notMetadata: [],
        title: [],
        notTitle: [],
        notes: [],
        notNotes: [],
        context: [],
        notContext: [],
        ...overrides.filters,
      },
  sort: overrides.sort ?? [],
  limit: overrides.limit ?? null,
});

const sha256Hex = async (value: string) => {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
};

const descriptorFingerprint = (mode: "structured" | "ai", plan: unknown) =>
  sha256Hex(JSON.stringify({ mode, plan, schemaVersion: 1 }));

const rustDescriptorFixtureFingerprint = "5b1ce8274d70065fcc9407c1dc3fce4ad078c54fc0bc0fd85686ac5bf8c77dc3";
const previousJsDescriptorFixtureFingerprint = "e1fa8cbd5b370ac2344d5ed9e92f262b238cd69ab7c30a076665ebe8a1877af0";

type MockMetadataItem = {
  id: number;
  text: string;
  content_kind: string;
  mime_primary: string | null;
  title?: string | null;
  notes?: string | null;
  tags?: string | null;
  folderId?: number | null;
};

type MetadataVisualRuntime = Window & {
  __copicuTestHistoryItems?: MockMetadataItem[];
  __copicuTestMetadataSnapshot?: (ids: number[], token?: string) => unknown;
  __copicuTestEmitEvent?: (event: string, payload: unknown) => Promise<void>;
  __copicuTestInvocations?: Array<{
    cmd: string;
    args: {
      id?: number;
      text?: string;
      request?: { itemIds: number[]; focusTarget: string };
      intent?: {
        itemIds: number[];
        content?: { value: string; expectedHash: string };
        title: { op: string; value?: string };
        notes: { op: string; value?: string };
        tags: Array<{ key: string; op: string }>;
      };
    };
  }>;
};

type SettingsRaceRuntime = Window & {
  __copicuTestSettings: AppSettings;
  __copicuTestEmitEvent: (event: string, payload: unknown) => Promise<number>;
  __copicuTestSettingsUpdateMaxActive?: number;
  __copicuTestInvocations: Array<{
    cmd: string;
    args?: {
      event?: string;
      settings?: AppSettings;
    };
  }>;
};

type MockTauriOptions = {
  historySearchDelayMs?: number;
  historySearchDelaySequenceMs?: number[];
  historySearchFailNext?: boolean;
  historySearchFailMessage?: string;
  historySearchFailOnCursor?: boolean;
  historySearchBoundaryShiftOnNextRefresh?: boolean;
  historyPageSizeOverride?: number;
  pickerSessionDelayMs?: number;
  pickerSessionSnapshots?: Array<{
    reset: boolean;
    generation: number;
    pendingActivationItemId?: number | null;
  }>;
  searchTriggerMode?: "realtime" | "enter" | "manual";
  deferStructuredSearchUntilEnter?: boolean;
  defaultSearchScopes?: SearchScope[];
  defaultExcludedSearchScopes?: Exclude<SearchScope, "all">[];
  searchTriggerUpdateDelayMs?: number;
  previewShortcut?: string;
  imageHoverPreview?: AppSettings["appearance"]["imageHoverPreview"];
  settingsLoadDelayMs?: number;
  settingsUpdateDelaySequenceMs?: number[];
  settingsUpdateFailureSequence?: Array<string | null>;
  assistantQuickPromptFailure?: string;
  findStartDelayMs?: number;
  findNavigateDelayMs?: number;
  findTargetDelayMs?: number;
  findMatchesDelayMs?: number;
  findStartInvalidations?: number;
  findNavigateInvalidations?: number;
  findTargetInvalidations?: number;
  findMatchesInvalidations?: number;
  findRemoteItem?: any;
  findAppliedDescriptor?: any;
  editorSettings?: Partial<{
    fontFamily: "systemMono" | "cascadiaMono" | "consolas" | "uiSans";
    fontSize: number;
    lineHeight: "compact" | "comfortable" | "relaxed";
    wrapLines: boolean;
    tabSize: 2 | 4 | 8;
    lineNumbers: boolean;
    highlightActiveLine: boolean;
  }>;
  metadataItemIds?: number[];
  appearance?: Partial<AppSettings["appearance"]>;
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
    (window as any).__copicuTestHistoryResponses = [];
    (window as any).__copicuTestFolders = [
      { id: 7, parentId: null, name: "Projects", path: "Projects", directItemCount: 1, descendantFolderCount: 1, subtreeItemCount: 2 },
      { id: 8, parentId: 7, name: "Notes", path: "Projects/Notes", directItemCount: 1, descendantFolderCount: 0, subtreeItemCount: 1 },
    ];
    (window as any).__copicuTestFolderDestination = { folderId: null, armed: false };
    (window as any).__copicuTestBoundaryShifted = false;
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
    const findSessions = new Map<string, {
      needle: string;
      occurrences: any[];
      matchesByItem: Map<number, any>;
      exactTargets: Map<string, any>;
      segmentTargets: Map<string, any[]>;
    }>();
    let findSessionCounter = 0;
    let findStartToken = 0;
    let findActiveSessionId: string | null = null;
    const syncFindState = () => {
      (window as any).__copicuTestFindSessionIds = Array.from(findSessions.keys());
      (window as any).__copicuTestFindActiveSessionId = findActiveSessionId;
    };
    (window as any).__copicuTestFindSessionIds = [];
    (window as any).__copicuTestFindActiveSessionId = null;
    (window as any).__copicuTestFindTargets = [];
    (window as any).__copicuTestFindResolveCalls = [];
    (window as any).__copicuTestFindMembershipIds = [];
    (window as any).__copicuTestAppliedDescriptor = null;
    const delayFind = async (delayMs: number | undefined) => {
      if ((delayMs ?? 0) > 0) {
        await new Promise((resolve) => window.setTimeout(resolve, delayMs));
      }
    };
    const consumeFindInvalidation = (key: string) => {
      const current = Number((window as any).__copicuTestMockOptions?.[key] ?? 0);
      if (current <= 0) {
        return false;
      }
      (window as any).__copicuTestMockOptions[key] = current - 1;
      return true;
    };
    const findRanges = (displayText: string, needle: string, ordinal: number, segment = 0) => {
      const ranges: any[] = [];
      const haystack = displayText.toLocaleLowerCase();
      const query = needle.toLocaleLowerCase();
      if (!query) {
        return ranges;
      }
      let cursor = 0;
      while (cursor <= haystack.length) {
        const index = haystack.indexOf(query, cursor);
        if (index < 0) {
          break;
        }
        ranges.push({ ordinal, segment, startUtf16: index, endUtf16: index + query.length });
        cursor = index + Math.max(1, query.length);
      }
      return ranges;
    };
    const findAnchorKey = (target: any, includeRange = true) => [
      target?.itemId,
      target?.field,
      target?.segment ?? 0,
      ...(includeRange ? [target?.startUtf16, target?.endUtf16] : []),
    ].join(":");
    const findTextSegments = (displayText: string) => [{
      segment: 0,
      startUtf16: 0,
      endUtf16: displayText.length,
      displayText,
    }];
    const findFieldsForItem = (item: any, needle: string) => {
      const fields: any[] = [];
      const addPlainField = (field: string, displayText: string | null | undefined) => {
        if (!displayText) {
          return;
        }
        const ranges = findRanges(displayText, needle, 0, 0);
        if (ranges.length > 0) {
          fields.push({ field, ranges, displayText, segments: findTextSegments(displayText) });
        }
      };
      const sourceText = String(item.text ?? "");
      const canonicalFields = item.__findCanonicalFields;
      if (canonicalFields) {
        const canonicalContent = canonicalFields.content ?? [];
        const contentText = canonicalContent.map((segment: any) => segment.displayText).join("");
        const contentRanges = findRanges(contentText, needle, 0, 0).flatMap((range: any) => {
          const segment = canonicalContent.find(
            (candidate: any) => range.startUtf16 >= candidate.startUtf16 && range.endUtf16 <= candidate.endUtf16,
          );
          return segment ? [{ ...range, segment: segment.segment }] : [];
        });
        if (contentRanges.length > 0) {
          fields.push({ field: "content", ranges: contentRanges, displayText: contentText, segments: canonicalContent });
        }
        const canonicalImageAlt = canonicalFields.imageAlt ?? [];
        const imageAltRanges = canonicalImageAlt.flatMap((segment: any) => findRanges(
          segment.displayText,
          needle,
          0,
          segment.segment,
        ));
        if (imageAltRanges.length > 0) {
          fields.push({
            field: "imageAlt",
            ranges: imageAltRanges,
            displayText: "",
            segments: canonicalImageAlt,
          });
        }
      } else if (item.content_kind === "text" || item.content_kind === "html" || item.content_kind === "unknown" || !item.content_kind) {
        const imageSegments: any[] = [];
        const contentSegments: any[] = [];
        const imagePattern = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
        let cursor = 0;
        let contentText = "";
        let contentSegment = 0;
        let imageMatch: RegExpExecArray | null;
        while ((imageMatch = imagePattern.exec(sourceText))) {
          const before = sourceText.slice(cursor, imageMatch.index);
          if (before) {
            const startUtf16 = contentText.length;
            contentText += before;
            contentSegments.push({
              segment: contentSegment,
              startUtf16,
              endUtf16: contentText.length,
              displayText: before,
            });
            contentSegment += 1;
          }
          const imageAlt = imageMatch[1] ?? "";
          imageSegments.push({
            segment: imageSegments.length,
            displayText: imageAlt,
            ranges: findRanges(imageAlt, needle, 0, imageSegments.length),
          });
          cursor = imageMatch.index + imageMatch[0].length;
        }
        const after = sourceText.slice(cursor);
        if (after) {
          const startUtf16 = contentText.length;
          contentText += after;
          contentSegments.push({
            segment: contentSegment,
            startUtf16,
            endUtf16: contentText.length,
            displayText: after,
          });
        }
        if (contentText) {
          const ranges = findRanges(contentText, needle, 0, 0).flatMap((range: any) => {
            const segment = contentSegments.find(
              (candidate: any) => range.startUtf16 >= candidate.startUtf16 && range.endUtf16 <= candidate.endUtf16,
            );
            return segment ? [{ ...range, segment: segment.segment }] : [];
          });
          if (ranges.length > 0) {
            fields.push({ field: "content", ranges, displayText: contentText, segments: contentSegments });
          }
        }
        const matchingImageSegments = imageSegments.filter((image) => image.ranges.length > 0);
        if (matchingImageSegments.length > 0) {
          fields.push({
            field: "imageAlt",
            ranges: matchingImageSegments.flatMap((image) => image.ranges),
            displayText: imageSegments.length === 1 ? matchingImageSegments[0].displayText : "",
            segments: imageSegments.map((image) => ({
              segment: image.segment,
              startUtf16: 0,
              endUtf16: image.displayText.length,
              displayText: image.displayText,
            })),
          });
        }
      }
      addPlainField("title", item.title);
      addPlainField("tag", item.tags);
      addPlainField("notes", item.notes);
      return fields;
    };
    const findSourceItems = () => {
      const source = [...((window as any).__copicuTestHistoryItems ?? items)];
      const remote = (window as any).__copicuTestMockOptions?.findRemoteItem;
      if (remote && !source.some((item: any) => item.id === remote.id)) {
        source.push(remote);
      }
      return source;
    };
    const hasOnlyKeys = (value: any, keys: string[]) =>
      value && typeof value === "object" && !Array.isArray(value)
      && Object.keys(value).every((key) => keys.includes(key));
    const valueToComparable = (value: unknown) => String(value ?? "").trim().toLocaleLowerCase();
    const itemSearchText = (item: any) => [
      item.text,
      item.title,
      item.notes,
      item.tags,
      item.mime_primary,
      item.content_kind,
      item.context_search_text,
    ].map((value) => String(value ?? "")).join(" ").toLocaleLowerCase();
    const itemMetadataText = (item: any) => [
      item.title,
      item.notes,
      item.tags,
    ].map((value) => String(value ?? "")).join(" ").toLocaleLowerCase();
    const itemHasValue = (item: any, field: string) => {
      switch (field) {
        case "text":
          return Boolean(String(item.text ?? ""));
        case "title":
          return Boolean(String(item.title ?? "").trim());
        case "notes":
          return Boolean(String(item.notes ?? "").trim());
        case "tags":
          return Boolean(String(item.tags ?? "").trim());
        case "metadata":
          return Boolean(String(item.title ?? "").trim() || String(item.notes ?? "").trim() || String(item.tags ?? "").trim());
        case "mime":
          return Boolean(String(item.mime_primary ?? "").trim());
        case "image":
          return item.content_kind === "image";
        case "blob":
          return Boolean(item.blob_path || item.thumbnail_path || item.thumbnail_data_url);
        default:
          return false;
      }
    };
    const searchPlanFilterKeys = [
      "kind", "notKind", "mime", "notMime", "tags", "notTags", "has", "missing", "marked", "date",
      "sourceApp", "notSourceApp", "windowTitle", "notWindowTitle", "domain", "notDomain", "sourceKind",
      "clipboardFormat", "metadata", "notMetadata", "title", "notTitle", "notes", "notNotes", "context",
      "notContext",
    ];
    const searchPlanFilterArrayKeys = searchPlanFilterKeys.filter((key) => key !== "marked" && key !== "date");
    const unsupportedFindFilterKeys = [
      "date", "sourceApp", "notSourceApp", "windowTitle", "notWindowTitle", "domain", "notDomain",
      "sourceKind", "clipboardFormat", "context", "notContext",
    ];
    const searchPlanDateFields = ["created", "lastUsed", "lastCopied"];
    const searchPlanDateOps = ["after", "before", "on", "between"];
    const searchPlanRelativeUnits = ["minute", "hour", "day", "week", "month"];
    const normalizeStringArray = (value: any, fallback: string[] = []) => {
      const source = value === undefined ? fallback : value;
      return Array.isArray(source) && source.every((entry) => typeof entry === "string")
        ? [...source]
        : null;
    };
    const normalizeDateFilter = (value: any) => {
      if (!hasOnlyKeys(value, ["field", "op", "value", "endValue", "relative"])
        || !searchPlanDateFields.includes(value.field)
        || !searchPlanDateOps.includes(value.op)
        || (value.value !== undefined && value.value !== null && typeof value.value !== "string")
        || (value.endValue !== undefined && value.endValue !== null && typeof value.endValue !== "string")
      ) {
        return null;
      }
      let relative = null;
      if (value.relative !== undefined && value.relative !== null) {
        if (!hasOnlyKeys(value.relative, ["amount", "unit"])
          || !Number.isInteger(value.relative.amount)
          || !searchPlanRelativeUnits.includes(value.relative.unit)
        ) {
          return null;
        }
        relative = { amount: value.relative.amount, unit: value.relative.unit };
      }
      return {
        field: value.field,
        op: value.op,
        value: value.value ?? null,
        endValue: value.endValue ?? null,
        relative,
      };
    };
    const normalizeSearchPlan = (rawPlan: any) => {
      if (!hasOnlyKeys(rawPlan, ["schemaVersion", "text", "filters", "sort", "limit"])
        || rawPlan.schemaVersion !== 1
      ) {
        return null;
      }
      let text = null;
      if (rawPlan.text !== undefined && rawPlan.text !== null) {
        if (!hasOnlyKeys(rawPlan.text, ["all", "any", "phrases", "exclude", "regex"])) {
          return null;
        }
        const all = normalizeStringArray(rawPlan.text.all);
        const any = normalizeStringArray(rawPlan.text.any);
        const phrases = normalizeStringArray(rawPlan.text.phrases);
        const exclude = normalizeStringArray(rawPlan.text.exclude);
        const regex = rawPlan.text.regex;
        if (!all || !any || !phrases || !exclude || (regex !== undefined && regex !== null && typeof regex !== "string")) {
          return null;
        }
        text = { all, any, phrases, exclude, regex: regex ?? null };
      }

      let filters = null;
      if (rawPlan.filters !== undefined && rawPlan.filters !== null) {
        if (!hasOnlyKeys(rawPlan.filters, searchPlanFilterKeys)) {
          return null;
        }
        const normalizedArrays = Object.fromEntries(searchPlanFilterArrayKeys.map((key) => {
          const value = normalizeStringArray(rawPlan.filters[key]);
          return [key, value];
        }));
        if (Object.values(normalizedArrays).some((value) => !value)) {
          return null;
        }
        let marked = null;
        if (rawPlan.filters.marked !== undefined && rawPlan.filters.marked !== null) {
          if (typeof rawPlan.filters.marked !== "boolean") {
            return null;
          }
          marked = rawPlan.filters.marked;
        }
        const dateSource = rawPlan.filters.date === undefined ? [] : rawPlan.filters.date;
        if (!Array.isArray(dateSource)) {
          return null;
        }
        const date = dateSource.map(normalizeDateFilter);
        if (date.some((value) => !value)) {
          return null;
        }
        filters = {
          kind: normalizedArrays.kind,
          notKind: normalizedArrays.notKind,
          mime: normalizedArrays.mime,
          notMime: normalizedArrays.notMime,
          tags: normalizedArrays.tags,
          notTags: normalizedArrays.notTags,
          has: normalizedArrays.has,
          missing: normalizedArrays.missing,
          marked,
          date,
          sourceApp: normalizedArrays.sourceApp,
          notSourceApp: normalizedArrays.notSourceApp,
          windowTitle: normalizedArrays.windowTitle,
          notWindowTitle: normalizedArrays.notWindowTitle,
          domain: normalizedArrays.domain,
          notDomain: normalizedArrays.notDomain,
          sourceKind: normalizedArrays.sourceKind,
          clipboardFormat: normalizedArrays.clipboardFormat,
          metadata: normalizedArrays.metadata,
          notMetadata: normalizedArrays.notMetadata,
          title: normalizedArrays.title,
          notTitle: normalizedArrays.notTitle,
          notes: normalizedArrays.notes,
          notNotes: normalizedArrays.notNotes,
          context: normalizedArrays.context,
          notContext: normalizedArrays.notContext,
        };
      }

      const sortSource = rawPlan.sort === undefined ? [] : rawPlan.sort;
      if (!Array.isArray(sortSource)) {
        return null;
      }
      const sort = sortSource.map((entry: any) => {
        if (!hasOnlyKeys(entry, ["field", "direction"])
          || !["created", "lastUsed", "lastCopied"].includes(entry.field)
          || !["asc", "desc"].includes(entry.direction)
        ) {
          return null;
        }
        return { field: entry.field, direction: entry.direction };
      });
      if (sort.some((entry) => !entry)) {
        return null;
      }
      const limit = rawPlan.limit === undefined || rawPlan.limit === null ? null : rawPlan.limit;
      if (limit !== null && (!Number.isInteger(limit) || limit < 1)) {
        return null;
      }
      return { schemaVersion: 1, text, filters, sort, limit };
    };
    const canonicalDescriptorFingerprint = async (descriptor: any, plan: any) => {
      const basis = JSON.stringify({
        mode: descriptor.mode,
        plan,
        schemaVersion: descriptor.schemaVersion,
      });
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(basis));
      return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
    };
    const canonicalizeDescriptor = async (descriptor: any) => {
      if (!hasOnlyKeys(descriptor, ["schemaVersion", "displayQuery", "effectiveQuery", "mode", "plan", "fingerprint"])
        || descriptor.schemaVersion !== 1
        || typeof descriptor.displayQuery !== "string"
        || typeof descriptor.effectiveQuery !== "string"
        || !["structured", "ai"].includes(descriptor.mode)
        || typeof descriptor.fingerprint !== "string"
      ) {
        return { supported: false, descriptor: null };
      }
      const plan = normalizeSearchPlan(descriptor.plan);
      if (!plan) {
        return { supported: false, descriptor: null };
      }
      const fingerprint = await canonicalDescriptorFingerprint(descriptor, plan);
      if (descriptor.fingerprint !== fingerprint) {
        return { supported: false, descriptor: null };
      }
      return {
        supported: true,
        descriptor: { ...descriptor, plan, fingerprint },
      };
    };
    const descriptorMembership = (descriptor: any, sourceOverride: any[] | null = null) => {
      const plan = normalizeSearchPlan(descriptor?.plan);
      if (
        !descriptor
        || descriptor.schemaVersion !== 1
        || !plan
      ) {
        return { supported: false, items: [] };
      }
      const text = plan.text ?? { all: [], any: [], phrases: [], exclude: [] };
      const filters = plan.filters ?? null;
      if (filters && unsupportedFindFilterKeys.some((key) => {
        const value = filters[key];
        return Array.isArray(value) ? value.length > 0 : value !== null && value !== undefined;
      })) {
        return { supported: false, items: [] };
      }
      const knownKinds = ["text", "image", "html", "file", "unknown"];
      const knownHas = ["text", "title", "notes", "tags", "metadata", "mime", "blob", "image"];
      const knownMissing = ["title", "notes", "tags", "metadata", "mime", "blob"];
      if (
        (filters?.kind ?? []).some((kind: any) => !knownKinds.includes(valueToComparable(kind)))
        || (filters?.notKind ?? []).some((kind: any) => !knownKinds.includes(valueToComparable(kind)))
        || (filters?.has ?? []).some((kind: any) => !knownHas.includes(valueToComparable(kind)))
        || (filters?.missing ?? []).some((kind: any) => !knownMissing.includes(valueToComparable(kind)))
      ) {
        return { supported: false, items: [] };
      }
      const matchesText = (item: any) => {
        const haystack = itemSearchText(item);
        const all = (text.all ?? []).map(valueToComparable);
        const any = (text.any ?? []).map(valueToComparable);
        const phrases = (text.phrases ?? []).map(valueToComparable);
        const exclude = (text.exclude ?? []).map(valueToComparable);
        return all.every((term: string) => haystack.includes(term))
          && (any.length === 0 || any.some((term: string) => haystack.includes(term)))
          && phrases.every((term: string) => haystack.includes(term))
          && exclude.every((term: string) => !haystack.includes(term));
      };
      const matchesField = (item: any, field: string, terms: unknown[], negate = false) => {
        if (terms.length === 0) {
          return true;
        }
        const value = valueToComparable(
          field === "title" ? item.title
            : field === "notes" ? item.notes
              : field === "metadata" ? itemMetadataText(item)
                : item.tags,
        );
        const matches = terms.every((term) => value.includes(valueToComparable(term)));
        return negate
          ? terms.every((term) => !value.includes(valueToComparable(term)))
          : matches;
      };
      const matchesMime = (actual: string, expected: unknown) => {
        const candidate = valueToComparable(expected);
        return candidate.endsWith("/*")
          ? actual.startsWith(candidate.slice(0, -1))
          : actual === candidate;
      };
      const scopeToken = String(descriptor.effectiveQuery).match(/(?:^|\s)(?:folder-id:(\d+)|folder:\/|folder:"([^"]+)")(?=\s|$)/);
      const source = (sourceOverride ?? findSourceItems()).filter((item: any) => {
        const kind = valueToComparable(item.content_kind);
        const mime = valueToComparable(item.mime_primary);
        const marked = Boolean(item.is_marked ?? item.marked);
        const scopedFolderId = scopeToken?.[1] ? Number(scopeToken[1])
          : scopeToken?.[2] ? (window as any).__copicuTestFolders.find((folder: { path: string }) => folder.path === scopeToken[2])?.id
            : null;
        if (scopeToken && item.folderId != scopedFolderId) return false;
        return matchesText(item)
          && (filters?.kind ?? []).every((candidate: any) => kind === valueToComparable(candidate))
          && (filters?.notKind ?? []).every((candidate: any) => kind !== valueToComparable(candidate))
          && (filters?.mime ?? []).every((candidate: any) => matchesMime(mime, candidate))
          && (filters?.notMime ?? []).every((candidate: any) => !matchesMime(mime, candidate))
          && matchesField(item, "tags", filters?.tags ?? [])
          && matchesField(item, "tags", filters?.notTags ?? [], true)
          && matchesField(item, "title", filters?.title ?? [])
          && matchesField(item, "title", filters?.notTitle ?? [], true)
          && matchesField(item, "notes", filters?.notes ?? [])
          && matchesField(item, "notes", filters?.notNotes ?? [], true)
          && matchesField(item, "metadata", filters?.metadata ?? [])
          && matchesField(item, "metadata", filters?.notMetadata ?? [], true)
          && (filters?.marked === null || filters?.marked === undefined || marked === Boolean(filters.marked))
          && (filters?.has ?? []).every((field: any) => itemHasValue(item, valueToComparable(field)))
          && (filters?.missing ?? []).every((field: any) => !itemHasValue(item, valueToComparable(field)));
      });
      const sorted = [...source];
      const sorts = plan.sort.length > 0
        ? plan.sort.slice(0, 3)
        : [{ field: "recent", direction: "desc" }];
      const sortValue = (item: any, field: string) => Number(
        field === "created"
          ? item.created_at_unix_ms ?? 0
          : field === "recent"
            ? Math.max(item.last_copied_at_unix_ms ?? item.created_at_unix_ms ?? 0, item.last_received_at_unix_ms ?? 0)
          : field === "lastUsed"
            ? item.last_used_at_unix_ms ?? 0
            : item.last_copied_at_unix_ms ?? item.created_at_unix_ms ?? 0,
      );
      sorted.sort((left: any, right: any) => {
        for (const sort of sorts) {
          const direction = sort.direction === "asc" ? 1 : -1;
          const difference = (sortValue(left, sort.field) - sortValue(right, sort.field)) * direction;
          if (difference !== 0) {
            return difference;
          }
        }
        return Number(right.id ?? 0) - Number(left.id ?? 0);
      });
      const limit = plan.limit === null
        ? null
        : Math.min(Math.max(plan.limit, 1), 100);
      return { supported: true, items: limit === null ? sorted : sorted.slice(0, limit) };
    };
    (window as any).__copicuTestDescriptorMembership = (descriptor: any, source?: any[]) =>
      descriptorMembership(descriptor, source ?? null);
    const materializeFindItem = (item: any) => ({
      id: item.id,
      contentKind: item.content_kind ?? "text",
      text: item.text ?? "",
      title: item.title ?? null,
      notes: item.notes ?? null,
      tags: item.tags ?? null,
    });
    const eventCallbacks = new Map<number, (event: unknown) => unknown>();
    const eventHandlers = new Map<string, number[]>();
    let nextCallbackId = 1;
    (window as any).__copicuTestEmitEvent = async (event: string, payload: unknown) => {
      let invoked = 0;
      for (const callbackId of [...(eventHandlers.get(event) ?? [])]) {
        const callback = eventCallbacks.get(callbackId);
        if (callback) {
          invoked += 1;
          callback({ event, id: callbackId, payload });
        }
      }
      return invoked;
    };
    (window as any).__TAURI_EVENT_PLUGIN_INTERNALS__ = {
      unregisterListener: (event: string, eventId: number) => {
        eventHandlers.set(
          event,
          (eventHandlers.get(event) ?? []).filter((callbackId) => callbackId !== eventId),
        );
        eventCallbacks.delete(eventId);
      },
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
        name: "Focused writing",
        query: "tag:work kind:text",
        revision: 1,
        tags: ["Work"],
        createdAtUnixMs: 1,
        updatedAtUnixMs: 1,
      },
      {
        id: 2,
        name: "Internal review",
        query: "tag:work kind:text",
        revision: 1,
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
        defaultSearchScopes: mockOptions.defaultSearchScopes ?? ["all"],
        defaultExcludedSearchScopes: mockOptions.defaultExcludedSearchScopes ?? [],
        previewShortcut: mockOptions.previewShortcut ?? "Alt+Enter",
        externalEditorShortcut: "",
      },
      history: {
        retentionCount: 1000,
      },
      appearance: {
        theme: mockOptions.appearance?.theme ?? "system",
        themeId: mockOptions.appearance?.themeId ?? "default",
        density: mockOptions.appearance?.density ?? "standard",
        imagePreview: mockOptions.appearance?.imagePreview ?? "large",
        imageHoverPreview: mockOptions.imageHoverPreview ?? "off",
        itemActions: mockOptions.appearance?.itemActions ?? "auto",
        actionSize: mockOptions.appearance?.actionSize ?? "auto",
        textPreviewLines: mockOptions.appearance?.textPreviewLines ?? 4,
        itemDetails: mockOptions.appearance?.itemDetails ?? "always",
      },
      editor: {
        fontFamily: "systemMono",
        fontSize: 13,
        lineHeight: "comfortable",
        wrapLines: true,
        tabSize: 4,
        lineNumbers: true,
        highlightActiveLine: true,
        externalEditorPath: "",
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
    const resolveFolderIntent = (intent: any): number | null | undefined => {
      if (!intent || intent.op === "untouched") return undefined;
      if (intent.op === "set") return intent.folderId;
      const folders = (window as any).__copicuTestFolders;
      let parentId: number | null = null;
      for (const name of intent.path.replace(/^\//, "").replace(/\/$/, "").split("/")) {
        let folder = folders.find((entry: any) => entry.parentId === parentId && entry.name.toLowerCase() === name.toLowerCase());
        if (!folder) {
          const parent = folders.find((entry: any) => entry.id === parentId);
          folder = { id: Math.max(8, ...folders.map((entry: any) => entry.id)) + 1, parentId, name, path: parent ? `${parent.path}/${name}` : name, directItemCount: 0, descendantFolderCount: 0, subtreeItemCount: 0 };
          folders.push(folder);
        }
        parentId = folder.id;
      }
      return parentId;
    };
    const metadataSnapshot = (itemIds: number[], token = `snapshot-${itemIds.join("-")}`) => {
      const testWindow = window as MetadataVisualRuntime;
      const sourceItems: MockMetadataItem[] = testWindow.__copicuTestHistoryItems ?? items;
      const selected = itemIds.map((id) => sourceItems.find((item) => item.id === id)).filter((item): item is MockMetadataItem => Boolean(item));
      const aggregateScalar = (field: "title" | "notes") => {
        const values = selected.map((item) => String(item[field] ?? "").trim());
        const populatedCount = values.filter(Boolean).length;
        const same = values.every((value: string) => value === values[0]);
        return {
          state: populatedCount === 0 ? "empty" : same ? "same" : "mixed",
          value: same && values[0] ? values[0] : null,
          populatedCount,
        };
      };
      const valuesFor = (item: MockMetadataItem): string[] =>
        String(item.tags ?? "").split(/\s+/).map((value) => value.replace(/^#/, "").trim()).filter(Boolean);
      const aggregateValues = () => {
        const labels = new Map<string, string>();
        for (const item of selected) {
          for (const value of valuesFor(item)) labels.set(value.toLocaleLowerCase(), value);
        }
        return [...labels].map(([key, label]) => {
          const presentCount = selected.filter((item) =>
            valuesFor(item).some((value) => value.toLocaleLowerCase() === key),
          ).length;
          return {
            key,
            label,
            presence: presentCount === selected.length ? "all" : presentCount === 0 ? "none" : "some",
            presentCount,
            totalCount: selected.length,
            sources: [{ source: "manual", count: presentCount, confidenceMin: null, confidenceMax: null }],
          };
        });
      };
      const item = selected[0];
      return {
        itemIds,
        itemCount: selected.length,
        snapshotToken: token,
        title: aggregateScalar("title"),
        notes: aggregateScalar("notes"),
        tags: aggregateValues(),
        folder: {
          state: selected.every((entry) => (entry.folderId ?? null) === (item?.folderId ?? null)) ? "same" : "mixed",
          folderId: item?.folderId ?? null,
          path: item?.folderId == null ? "/" : (window as any).__copicuTestFolders.find((entry: any) => entry.id === item.folderId)?.path ?? "/",
        },
        singleItem: selected.length === 1 ? {
          contentPreview: item.text,
          contentKind: item.content_kind,
          captureContextEvents: [{
            id: 1,
            capturedAtUnixMs: 1782154403281,
            sourceKind: "clipboard",
            sourceAppName: "code.exe",
            sourceAppPath: "C:\\Tools\\VS Code\\Code.exe",
            sourceProcessId: 4242,
            sourceWindowId: 9001,
            sourceWindowTitle: "main.rs - Copicu",
            contentKind: item.content_kind,
            mimePrimary: item.mime_primary,
            clipboardPlatform: "windows",
            clipboardSequenceNumber: 597,
            clipboardFormatCount: 4,
            clipboardFormatsText: "CF_UNICODETEXT text HTML Format registered",
            byteSize: 82,
            textCharCount: item.text.length,
            lineCount: item.text.split(/\r\n|\r|\n/).length,
            domain: "example.com",
            scenarioId: 1,
            scenarioSessionId: "scenario-1-test",
            scenarioRevision: 1,
          }],
        } : null,
      };
    };
    (window as MetadataVisualRuntime).__copicuTestMetadataSnapshot = metadataSnapshot;
    (window as any).__copicuTestAssistantSnapshot = {
      messages: [], running: false, approval: null, error: null, configured: true,
      context: { activeItemId: null, selectedItemIds: [], query: "", visibleItemIds: [] },
      model: "openai/gpt-5.6-luna", endpoint: "https://example.invalid/v1",
      reasoningEffort: "high", defaultModel: null, executionMode: "yolo",
    };
    (window as any).__TAURI_INTERNALS__ = {
      invoke: async (cmd: string, args?: any) => {
        (window as any).__copicuTestInvocations.push({ cmd, args });
        if (cmd === "list_actions" && (window as any).__copicuSharedTestActions) return structuredClone((window as any).__copicuSharedTestActions);
        if (cmd.startsWith("shared_clipboard_") && (window as any).__copicuSharedTestInvoke) {
          return (window as any).__copicuSharedTestInvoke(cmd, args);
        }
        switch (cmd) {
          case "plugin:event|listen": {
            const handlers = eventHandlers.get(args.event) ?? [];
            handlers.push(args.handler);
            eventHandlers.set(args.event, handlers);
            return args.handler;
          }
          case "plugin:event|unlisten":
            eventHandlers.set(
              args.event,
              (eventHandlers.get(args.event) ?? []).filter((callbackId) => callbackId !== args.eventId),
            );
            eventCallbacks.delete(args.eventId);
            return null;
          case "plugin:event|emit":
            return (window as Window & {
              __copicuTestEmitEvent: (event: string, payload: unknown) => Promise<number>;
            }).__copicuTestEmitEvent(args.event, args.payload);
          case "plugin:event|unregisterListener":
          case "plugin:event|emit_to":
            return null;
          case "record_renderer_diagnostic":
            return null;
          case "assistant_snapshot":
            return structuredClone((window as any).__copicuTestAssistantSnapshot);
          case "assistant_list_models":
            return {
              endpoint: "https://example.invalid/v1",
              models: [{ id: "openai/gpt-5.6-luna", name: "OpenAI: GPT-5.6 Luna", reasoningEfforts: ["high"] }],
            };
          case "assistant_send": {
            const runtime = window as any;
            const { promise, resolve, reject } = Promise.withResolvers<void>();
            runtime.__copicuTestResolveAssistantSend = resolve;
            runtime.__copicuTestRejectAssistantSend = reject;
            runtime.__copicuTestAssistantSnapshot.running = true;
            await runtime.__copicuTestEmitEvent("copicu://assistant/updated", structuredClone(runtime.__copicuTestAssistantSnapshot));
            return promise;
          }
          case "assistant_quick_prompt": {
            const runtime = window as unknown as { __copicuTestMockOptions?: MockTauriOptions };
            if (runtime.__copicuTestMockOptions?.assistantQuickPromptFailure) {
              throw new Error(runtime.__copicuTestMockOptions.assistantQuickPromptFailure);
            }
            return null;
          }
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
            {
              const testWindow = window as Window & {
                __copicuTestSettings: {
                  picker: { externalEditorShortcut: string };
                };
              };
              const externalEditorShortcut =
                testWindow.__copicuTestSettings.picker.externalEditorShortcut;
              return {
                picker: {
                  label: "Ctrl+Shift+,",
                  registered: true,
                  supported: true,
                  error: null,
                },
                inbox: {
                  label: "Ctrl+Alt+I",
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
                externalEditor: {
                  label: externalEditorShortcut,
                  registered: Boolean(externalEditorShortcut),
                  supported: true,
                  error: null,
                },
              };
            }

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
              // Public demo fixtures show built-ins, not internal registry-test scripts.
              if ((window as any).__copicuPublicReleaseDemo) return actions;
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
          case "find_start": {
            const request = args?.request ?? {};
            const mockOptions = (window as any).__copicuTestMockOptions ?? {};
            const expectedDescriptor = (window as any).__copicuTestAppliedDescriptor;
            const descriptor = request.appliedDescriptor;
            const canonicalDescriptor = descriptor ? await canonicalizeDescriptor(descriptor) : null;
            if (
              !descriptor
              || !expectedDescriptor
              || !canonicalDescriptor?.supported
              || !canonicalDescriptor.descriptor
              || JSON.stringify(descriptor.plan) !== JSON.stringify(canonicalDescriptor.descriptor.plan)
              || descriptor.schemaVersion !== expectedDescriptor.schemaVersion
              || descriptor.fingerprint !== expectedDescriptor.fingerprint
              || descriptor.effectiveQuery !== expectedDescriptor.effectiveQuery
              || descriptor.mode !== expectedDescriptor.mode
              || JSON.stringify(descriptor.plan) !== JSON.stringify(expectedDescriptor.plan)
            ) {
              throw new Error("Find mock received an appliedDescriptor different from the active snapshot");
            }
            const startToken = ++findStartToken;
            findActiveSessionId = null;
            findSessions.clear();
            syncFindState();
            await delayFind(mockOptions.findStartDelayMs);
            if (startToken !== findStartToken) {
              throw new Error("find start superseded");
            }
            if (consumeFindInvalidation("findStartInvalidations")) {
              throw new Error("sessionInvalidated");
            }
            const needle = String(request.needle ?? "").trim();
            const membership = descriptorMembership(descriptor);
            if (!membership.supported) {
              throw new Error("Find mock cannot evaluate the appliedDescriptor plan");
            }
            (window as any).__copicuTestFindMembershipIds = membership.items.map((item: any) => item.id);
            const occurrences: any[] = [];
            const matchesByItem = new Map<number, any>();
            for (const item of membership.items) {
              const fields = findFieldsForItem(item, needle).map((field: any) => ({
                ...field,
                ranges: field.ranges.map((range: any) => ({ ...range })),
              }));
              const itemMatches = { itemId: item.id, fields };
              matchesByItem.set(item.id, itemMatches);
              for (const field of fields) {
                for (const range of field.ranges) {
                  const ordinal = occurrences.length + 1;
                  range.ordinal = ordinal;
                  occurrences.push({
                    ordinal,
                    itemId: item.id,
                    field: field.field,
                    segment: range.segment ?? 0,
                    startUtf16: range.startUtf16,
                    endUtf16: range.endUtf16,
                  });
                }
              }
            }
            const sessionId = "find-session-" + (++findSessionCounter);
            const exactTargets = new Map<string, any>();
            const segmentTargets = new Map<string, any[]>();
            for (const occurrence of occurrences) {
              exactTargets.set(findAnchorKey(occurrence), occurrence);
              const segmentKey = findAnchorKey(occurrence, false);
              const targets = segmentTargets.get(segmentKey) ?? [];
              targets.push(occurrence);
              segmentTargets.set(segmentKey, targets);
            }
            findSessions.set(sessionId, {
              needle,
              occurrences,
              matchesByItem,
              exactTargets,
              segmentTargets,
            });
            findActiveSessionId = sessionId;
            syncFindState();
            return {
              sessionId,
              ownerId: "main",
              generation: Number(request.generation ?? 0),
              total: occurrences.length,
              firstTarget: occurrences[0] ?? null,
            };
          }
          case "find_navigate": {
            const request = args?.request ?? {};
            const mockOptions = (window as any).__copicuTestMockOptions ?? {};
            await delayFind(mockOptions.findNavigateDelayMs);
            if (consumeFindInvalidation("findNavigateInvalidations")) {
              throw new Error("sessionInvalidated");
            }
            const session = findSessions.get(request.sessionId);
            if (!session) {
              throw new Error("find session not found");
            }
            const total = session.occurrences.length;
            if (total === 0) {
              return { total: 0, target: null };
            }
            const current = Number(request.currentOrdinal ?? request.ordinal ?? 0);
            const targetOrdinal = request.direction === "previous"
              ? (current <= 1 ? total : current - 1)
              : (current >= total ? 1 : current + 1);
            const target = session.occurrences[targetOrdinal - 1] ?? null;
            (window as any).__copicuTestFindTargets.push({
              command: "find_navigate",
              request: { ...request },
              target: target ? { ...target } : null,
            });
            return { total, target };
          }
          case "find_target": {
            const request = args?.request ?? {};
            const mockOptions = (window as any).__copicuTestMockOptions ?? {};
            await delayFind(mockOptions.findTargetDelayMs);
            if (consumeFindInvalidation("findTargetInvalidations")) {
              throw new Error("sessionInvalidated");
            }
            const session = findSessions.get(request.sessionId);
            if (!session) {
              throw new Error("find session not found");
            }
            const target = session.occurrences[Number(request.ordinal) - 1] ?? null;
            (window as any).__copicuTestFindTargets.push({
              command: "find_target",
              request: { ...request },
              target: target ? { ...target } : null,
            });
            const sourceItem = target ? findSourceItems().find((item: any) => item.id === target.itemId) : null;
            return {
              total: session.occurrences.length,
              target,
              materialized: target && sourceItem
                ? {
                    itemId: sourceItem.id,
                    field: target.field,
                    displayText: session.matchesByItem.get(sourceItem.id)?.fields.find(
                      (field: any) => field.field === target.field,
                    )?.displayText ?? sourceItem.text ?? "",
                    item: materializeFindItem(sourceItem),
                  }
              : null,
            };
          }
          case "find_resolve_anchor": {
            const request = args?.request ?? {};
            const session = findSessions.get(request.sessionId);
            if (!session) {
              throw new Error("find session not found");
            }
            const total = session.occurrences.length;
            const preferredTarget = request.preferredTarget ?? null;
            const preferredOrdinal = Number(
              request.preferredOrdinal ?? preferredTarget?.ordinal ?? 1,
            );
            let target = preferredTarget
              ? session.exactTargets.get(findAnchorKey(preferredTarget)) ?? null
              : null;
            if (!target && preferredTarget) {
              const candidates = session.segmentTargets.get(findAnchorKey(preferredTarget, false)) ?? [];
              let low = 0;
              let high = candidates.length;
              while (low < high) {
                const middle = Math.floor((low + high) / 2);
                if (Number(candidates[middle]?.ordinal ?? 0) < preferredOrdinal) {
                  low = middle + 1;
                } else {
                  high = middle;
                }
              }
              const before = candidates[low - 1];
              const after = candidates[low];
              target = before && after
                ? Math.abs(Number(before.ordinal) - preferredOrdinal)
                  <= Math.abs(Number(after.ordinal) - preferredOrdinal)
                  ? before
                  : after
                : before ?? after ?? null;
            }
            if (!target && total > 0) {
              const ordinal = Math.min(Math.max(Math.round(preferredOrdinal), 1), total);
              target = session.occurrences[ordinal - 1] ?? null;
            }
            (window as any).__copicuTestFindResolveCalls.push({
              request: { ...request },
              target: target ? { ...target } : null,
            });
            return { total, target };
          }
          case "find_matches_for_items": {
            const request = args?.request ?? {};
            const mockOptions = (window as any).__copicuTestMockOptions ?? {};
            await delayFind(mockOptions.findMatchesDelayMs);
            if (consumeFindInvalidation("findMatchesInvalidations")) {
              throw new Error("sessionInvalidated");
            }
            const session = findSessions.get(request.sessionId);
            if (!session) {
              throw new Error("find session not found");
            }
            return {
              items: (request.itemIds ?? []).map((itemId: number) => (
                session.matchesByItem.get(itemId) ?? { itemId, fields: [] }
              )),
            };
          }
          case "find_close": {
            const sessionId = args?.request?.sessionId;
            if (sessionId) {
              findSessions.delete(sessionId);
              if (findActiveSessionId === sessionId) {
                findActiveSessionId = null;
              }
              syncFindState();
            }
            return { closed: true };
          }
          case "find_cancel_owner": {
            ++findStartToken;
            findSessions.clear();
            findActiveSessionId = null;
            syncFindState();
            return { cancelled: true };
          }
          case "history_search":
          case "list_history_page": {
            const mockOptions = (window as any).__copicuTestMockOptions ?? {};
            const delayMs = Array.isArray(mockOptions.historySearchDelaySequenceMs)
              && mockOptions.historySearchDelaySequenceMs.length > 0
              ? Number(mockOptions.historySearchDelaySequenceMs.shift() ?? 0)
              : mockOptions.historySearchDelayMs ?? 0;
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
            let descriptorInput = mockOptions.findAppliedDescriptor ?? request.appliedDescriptor;
            if (!descriptorInput) {
              const fallbackPlan = normalizeSearchPlan(request.plan ?? {
                schemaVersion: 1,
                text: null,
                filters: null,
                sort: [],
                limit: null,
              });
              if (!fallbackPlan) {
                throw new Error("history mock cannot evaluate the appliedDescriptor plan");
              }
              descriptorInput = {
                schemaVersion: 1,
                displayQuery,
                effectiveQuery: request.query ?? "",
                mode: aiMode ? "ai" : "structured",
                plan: fallbackPlan,
                fingerprint: "",
              };
              descriptorInput.fingerprint = await canonicalDescriptorFingerprint(descriptorInput, fallbackPlan);
            }
            const canonicalDescriptor = await canonicalizeDescriptor(descriptorInput);
            if (!canonicalDescriptor.supported || !canonicalDescriptor.descriptor) {
              throw new Error("history mock cannot evaluate the appliedDescriptor plan");
            }
            const appliedDescriptor = canonicalDescriptor.descriptor;
            const includeCounts = request.includeCounts !== false;
            const interpretedQuery = aiMode ? "long" : request.query ?? "";
            const scopeToken = (request.query ?? "").match(/(?:^|\s)(folder-id:(\d+)|folder:\/|folder:"([^"]+)")(?=\s|$)/);
            const scopedSourceItems = scopeToken
              ? sourceItems.filter((item: any) => scopeToken[2]
                ? item.folderId === Number(scopeToken[2])
                : scopeToken[3]
                  ? item.folderId === (window as any).__copicuTestFolders.find((f: any) => f.path === scopeToken[3])?.id
                  : item.folderId == null)
              : sourceItems;
            const requestQuery = ((aiMode ? interpretedQuery : request.query?.toLocaleLowerCase()) ?? query)
              .replace(/(?:^|\s)(?:folder-id:\d+|folder:\/|folder:"[^"]+")(?=\s|$)/g, "").trim();
            const descriptorResult = mockOptions.findAppliedDescriptor
              ? descriptorMembership(appliedDescriptor, sourceItems)
              : { supported: true, items: scopedSourceItems };
            if (!descriptorResult.supported) {
              throw new Error("history mock cannot evaluate the appliedDescriptor plan");
            }
            const rawRequestQuery = (request.query ?? "").trim();
            const regexPattern = rawRequestQuery.startsWith("re:") ? rawRequestQuery.slice(3).trim() : null;
            let regex: RegExp | null = null;
            if (regexPattern !== null) {
              try {
                regex = new RegExp(regexPattern, "iu");
              } catch (error) {
                throw new Error(`Invalid regular expression: ${String(error)}`);
              }
            }
            const queryTokens = rawRequestQuery.split(/\s+/).filter(Boolean);
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
            const limit = mockOptions.historyPageSizeOverride ?? request.limit ?? 60;
            const includeContent = Boolean(request.includeContent);
            const filteredItems = diagnostics.length > 0
              ? []
              : mockOptions.findAppliedDescriptor
              ? descriptorResult.items
              : regex
              ? scopedSourceItems.filter((item: Record<string, unknown>) => [
                  item.text,
                  item.title,
                  item.notes,
                  item.tags,
                  item.mime_primary,
                  item.content_kind,
                  item.context_search_text,
                ].some((value) => regex.test(typeof value === "string" ? value : "")))
              : requestQuery
              ? scopedSourceItems.filter((item: any) => {
                  if (requestQuery === "is:marked") {
                    return Boolean(item.is_marked);
                  }
                  if (requestQuery === "-is:marked") {
                    return !item.is_marked;
                  }
                  if (requestQuery === "is:inbox") {
                    return Boolean(item.is_inbox);
                  }
                  if (["is:not-inbox", "is:not_inbox", "-is:inbox"].includes(requestQuery)) {
                    return !item.is_inbox;
                  }
                  const tagSearch = requestQuery.match(/^tag:([^\s,]+)$/);
                  if (tagSearch) {
                    return (item.tags ?? "").toLocaleLowerCase().split(/[\s,]+/)
                      .some((tag: string) => tag.replace(/^#/, "") === tagSearch[1]);
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
              : scopedSourceItems;
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
            const shiftBoundary = Boolean(mockOptions.historySearchBoundaryShiftOnNextRefresh)
              && (cursor === null || cursor === undefined);
            if (shiftBoundary) {
              mockOptions.historySearchBoundaryShiftOnNextRefresh = false;
              (window as any).__copicuTestBoundaryShifted = true;
            }
            const cursorItem = shiftBoundary
              ? filteredItems[startIndex + limit]
              : nextItem;
            const hasNextPage = startIndex + limit < filteredItems.length;
            const response = {
              items: pageItems,
              nextCursor:
                hasNextPage && cursorItem
                  ? {
                      afterIsInbox: Boolean(cursorItem.is_inbox),
                      afterInboxAtUnixMs: cursorItem.inbox_at_unix_ms ?? null,
                      afterSortUnixMs: cursorItem.last_copied_at_unix_ms ?? cursorItem.created_at_unix_ms,
                      afterId: cursorItem.id,
                    }
                  : null,
              totalCount: includeCounts ? scopedSourceItems.length : null,
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
            (window as any).__copicuTestAppliedDescriptor = appliedDescriptor;
            (window as any).__copicuTestHistoryResponses.push({
              cursor: cursor ?? null,
              ids: pageItems.map((item: any) => item.id),
              nextCursor: response.nextCursor,
            });
            return response;
          }
          case "get_history_items_preview": {
            const ids = new Set(args.ids);
            const sourceItems = (window as any).__copicuTestHistoryItems ?? items;
            let requestedItems = sourceItems.filter((item: any) => ids.has(item.id));
            if (args.appliedDescriptor) {
              const descriptor = args.appliedDescriptor;
              // The default search mock emits an empty plan; materialize its simple
              // query here so retained previews enforce membership like real SQLite.
              const query = descriptor.effectiveQuery.replace(/(?:^|\s)(?:folder-id:\d+|folder:\/|folder:"[^"]+")(?=\s|$)/g, "").trim();
              const tag = query.match(/^tag:([^\s,]+)$/);
              const plan = descriptor.plan;
              const previewDescriptor = !plan.text && !plan.filters && query
                ? { ...descriptor, plan: {
                    ...plan,
                    text: !tag && query !== "is:marked" ? { all: [query], any: [], phrases: [], exclude: [] } : null,
                    filters: tag ? { tags: [tag[1]] } : query === "is:marked" ? { marked: true } : null,
                  } }
                : descriptor;
              const membership = descriptorMembership(previewDescriptor, requestedItems);
              if (!membership.supported) throw new Error("preview mock cannot evaluate the appliedDescriptor plan");
              requestedItems = membership.items;
            }
            return requestedItems.map((item: any) => withHistoryPreview(item, false));
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
              tags: scenario.tags,
              startedAtUnixMs: Date.now(),
            };
            await (window as any).__copicuTestEmitEvent("copicu://picker/filter", {
              query: scenario.query,
            });
            (window as any).__copicuTestActiveScenarioSession = session;
            await (window as any).__copicuTestEmitEvent("copicu://scenario/session-changed", session);
            return session;
          }
          case "stop_active_scenario":
            (window as any).__copicuTestActiveScenarioSession = null;
            await (window as any).__copicuTestEmitEvent("copicu://scenario/session-changed", null);
            return null;
          case "pending_metadata_editor": {
            const sourceItems = (window as Window & { __copicuTestHistoryItems?: MockMetadataItem[] }).__copicuTestHistoryItems ?? items;
            const itemIds = mockOptions.metadataItemIds ?? [sourceItems[3]?.id ?? sourceItems[0].id];
            return {
              snapshot: metadataSnapshot(itemIds),
              focusTarget: "overview",
            };
          }
          case "get_metadata_selection_snapshot":
            return metadataSnapshot(args.request.itemIds, `reload-${Date.now()}`);
          case "apply_metadata_selection_intent": {
            const intent = args.intent;
            const chosenFolderId = resolveFolderIntent(intent.folder);
            const runtime = window as MetadataVisualRuntime;
            const sourceItems = runtime.__copicuTestHistoryItems ?? items;
            runtime.__copicuTestHistoryItems = sourceItems.map((item) => {
              if (!intent.itemIds.includes(item.id)) return item;
              return {
                ...item,
                ...(intent.content ? {
                  text: intent.content.value,
                  preview_text: intent.content.value,
                  includes_content: true,
                } : {}),
                ...(intent.title.op === "set" ? { title: intent.title.value } : {}),
                ...(intent.title.op === "clear" ? { title: null } : {}),
                ...(intent.notes.op === "replaceAll" ? { notes: intent.notes.value } : {}),
                ...(intent.notes.op === "clearAll" ? { notes: null } : {}),
                ...(chosenFolderId !== undefined ? { folderId: chosenFolderId } : {}),
              };
            });
            const nextSnapshot = metadataSnapshot(intent.itemIds, `saved-${Date.now()}`);
            const emitEvent = (window as MetadataVisualRuntime).__copicuTestEmitEvent;
            if (!emitEvent) throw new Error("Synthetic metadata event bridge is unavailable");
            await emitEvent("copicu://metadata/selection-saved", { itemIds: intent.itemIds });
            return {
              snapshot: nextSnapshot,
              changedItemCount: intent.itemIds.length,
              contentChanged: Boolean(intent.content),
              titleChangedCount: intent.title.op === "untouched" ? 0 : intent.itemIds.length,
              notesChangedCount: intent.notes.op === "untouched" ? 0 : intent.itemIds.length,
              tagRelationChanges: intent.tags.length,
            };
          }
          case "open_metadata_window":
            return true;
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
            const chosenFolderId = resolveFolderIntent(request.folder);
            const existing = sourceItems.find((item: any) => item.text.trim() === normalizedText);
            if (existing) {
              if (chosenFolderId !== undefined) existing.folderId = chosenFolderId;
              existing.notes = request.notes ?? existing.notes ?? null;
              const requestedTags = request.tags.map((tag: string) => `#${tag}`).join(" ");
              existing.tags = [existing.tags, requestedTags].filter(Boolean).join(" ") || null;
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
              tags: request.tags.map((tag: string) => `#${tag}`).join(" ") || null,
              folderId: chosenFolderId !== undefined ? chosenFolderId : (window as any).__copicuTestFolderDestination.folderId,
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
            return null;
          case "pending_ui_host_request":
            return null;
          case "resolve_ui_host_request": {
            const state = window as Window & { __copicuTestRejectUiHost?: boolean };
            if (state.__copicuTestRejectUiHost) {
              state.__copicuTestRejectUiHost = false;
              throw new Error("Synthetic response failure");
            }
            return null;
          }
          case "update_history_item_text": {
            const sourceItems = (window as any).__copicuTestHistoryItems ?? items;
            (window as any).__copicuTestHistoryItems = sourceItems.map((item: any) =>
              item.id === args.id ? { ...item, text: args.text, preview_text: args.text, includes_content: true } : item);
            return null;
          }
          case "update_history_item": {
            const request = args?.request ?? {};
            const sourceItems = (window as any).__copicuTestHistoryItems ?? items;
            (window as any).__copicuTestHistoryItems = sourceItems.map((item: any) => (
              item.id === request.id
                ? {
                    ...item,
                    ...(request.text === undefined ? {} : { text: request.text }),
                    ...(request.title === undefined ? {} : { title: request.title }),
                    ...(request.notes === undefined ? {} : { notes: request.notes }),
                    ...(request.tags === undefined ? {} : { tags: request.tags }),
                    includes_content: true,
                  }
                : item
            ));
            return null;
          }
          case "set_history_item_inbox": {
            const itemId = args?.itemId;
            const inbox = Boolean(args?.inbox);
            const testWindow = window as Window & {
              __copicuTestHistoryItems?: Array<Record<string, unknown>>;
            };
            const historyItems = testWindow.__copicuTestHistoryItems
              ?? (items as Array<Record<string, unknown>>);
            testWindow.__copicuTestHistoryItems = historyItems.map((item) => item.id === itemId
              ? {
                  ...item,
                  is_inbox: inbox,
                  inbox_at_unix_ms: inbox ? Date.now() : null,
                }
              : item);
            return null;
          }
          case "delete_history_item": {
            const id = args?.id;
            (window as any).__copicuTestHistoryItems = (
              (window as any).__copicuTestHistoryItems ?? items
            ).filter((item: any) => item.id !== id);
            return null;
          }
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
          case "picker_focus_ack":
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
          case "edit_history_item_external":
            return { editorName: "Visual Studio Code" };
          case "list_external_editors":
            return [{
              id: "vscode",
              name: "Visual Studio Code",
              path: "C:\\Users\\JP\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe",
              configured: false,
            }];
          case "set_external_editor_shortcut": {
            const testWindow = window as Window & {
              __copicuTestSettings: {
                picker: { externalEditorShortcut: string };
              };
            };
            testWindow.__copicuTestSettings.picker.externalEditorShortcut = args.shortcut;
            return testWindow.__copicuTestSettings;
          }
          case "get_settings": {
            const settingsWindow = window as Window & {
              __copicuTestSettings: unknown;
              __copicuTestMockOptions?: MockTauriOptions;
            };
            const settingsSnapshot = structuredClone(settingsWindow.__copicuTestSettings);
            const delayMs = settingsWindow.__copicuTestMockOptions?.settingsLoadDelayMs ?? 0;
            if (delayMs > 0) {
              const { promise, resolve } = Promise.withResolvers<void>();
              window.setTimeout(resolve, delayMs);
              await promise;
            }
            return settingsSnapshot;
          }
          case "update_settings": {
            const testWindow = window as Window & {
              __copicuTestSettings: AppSettings;
              __copicuTestMockOptions?: MockTauriOptions;
              __copicuTestSettingsUpdateIndex?: number;
              __copicuTestSettingsUpdateActive?: number;
              __copicuTestSettingsUpdateMaxActive?: number;
            };
            const updateIndex = testWindow.__copicuTestSettingsUpdateIndex ?? 0;
            testWindow.__copicuTestSettingsUpdateIndex = updateIndex + 1;
            testWindow.__copicuTestSettingsUpdateActive =
              (testWindow.__copicuTestSettingsUpdateActive ?? 0) + 1;
            testWindow.__copicuTestSettingsUpdateMaxActive = Math.max(
              testWindow.__copicuTestSettingsUpdateMaxActive ?? 0,
              testWindow.__copicuTestSettingsUpdateActive,
            );
            try {
              const delayMs =
                testWindow.__copicuTestMockOptions?.settingsUpdateDelaySequenceMs?.[updateIndex] ?? 0;
              if (delayMs > 0) {
                const { promise, resolve } = Promise.withResolvers<void>();
                window.setTimeout(resolve, delayMs);
                await promise;
              }
              const failure =
                testWindow.__copicuTestMockOptions?.settingsUpdateFailureSequence?.[updateIndex];
              if (failure) throw new Error(failure);
              testWindow.__copicuTestSettings = structuredClone(args.settings);
              return structuredClone(args.settings);
            } finally {
              testWindow.__copicuTestSettingsUpdateActive -= 1;
            }
          }
          case "set_picker_folder_sidebar_width":
            if ((window as any).__copicuTestSidebarSaveFailure) throw new Error("Synthetic sidebar save failure");
            (window as any).__copicuTestSettings.picker.folderSidebarWidth = args.width;
            return structuredClone((window as any).__copicuTestSettings);
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
          case "consume_capture_folder_feedback":
            return [];
          case "list_folders":
            return structuredClone((window as any).__copicuTestFolders);
          case "root_item_count":
            return (window as any).__copicuTestHistoryItems.filter((item: { folderId: number | null }) => item.folderId === null).length;
          case "get_capture_folder_destination":
            return (window as any).__copicuTestFolderDestination.folderId;
          case "get_capture_folder_destination_state":
            return { ...(window as any).__copicuTestFolderDestination };
          case "set_capture_folder_destination":
            (window as any).__copicuTestFolderDestination = { folderId: args.folderId, armed: args.armed ?? args.folderId !== null };
            return args.folderId;
          case "create_folder": {
            const folders = (window as any).__copicuTestFolders;
            const parent = folders.find((f: any) => f.id === args.parentId);
            const folder = { id: Math.max(8, ...folders.map((f: any) => f.id)) + 1, parentId: args.parentId, name: args.name, path: parent ? `${parent.path}/${args.name}` : args.name, directItemCount: 0, descendantFolderCount: 0, subtreeItemCount: 0 };
            folders.push(folder);
            return folder;
          }
          case "rename_folder": {
            const folders = (window as any).__copicuTestFolders;
            const folder = folders.find((entry: { id: number }) => entry.id === args.id);
            const previousPath = folder.path;
            folder.name = args.name;
            folder.path = folder.parentId === null ? args.name : `${folders.find((entry: { id: number }) => entry.id === folder.parentId).path}/${args.name}`;
            for (const descendant of folders.filter((entry: { path: string }) => entry.path.startsWith(`${previousPath}/`))) {
              descendant.path = folder.path + descendant.path.slice(previousPath.length);
            }
            return folder;
          }
          case "move_folder": {
            const folders = (window as any).__copicuTestFolders;
            const folder = folders.find((entry: { id: number }) => entry.id === args.id);
            const previousPath = folder.path;
            folder.parentId = args.parentId;
            folder.path = args.parentId === null ? folder.name : `${folders.find((entry: { id: number }) => entry.id === args.parentId).path}/${folder.name}`;
            for (const descendant of folders.filter((entry: { path: string }) => entry.path.startsWith(`${previousPath}/`))) {
              descendant.path = folder.path + descendant.path.slice(previousPath.length);
            }
            return folder;
          }
          case "folder_delete_preview": {
            const folder = (window as any).__copicuTestFolders.find((f: any) => f.id === args.id);
            return { directItemCount: folder.directItemCount, subtreeItemCount: folder.subtreeItemCount, descendantFolderCount: folder.descendantFolderCount };
          }
          case "delete_folder": {
            const folders = (window as any).__copicuTestFolders;
            const folder = folders.find((entry: { id: number }) => entry.id === args.id);
            const subtreeIds = folders.filter((entry: { path: string }) =>
              entry.path === folder.path || entry.path.startsWith(`${folder.path}/`)).map((entry: { id: number }) => entry.id);
            const removedIds = args.deleteDescendants ? subtreeIds : [folder.id];
            const preview = { directItemCount: folder.directItemCount, subtreeItemCount: folder.subtreeItemCount, descendantFolderCount: folder.descendantFolderCount };
            (window as any).__copicuTestHistoryItems = (window as any).__copicuTestHistoryItems
              .filter((item: { folderId?: number | null }) => !args.deleteClips || !removedIds.includes(item.folderId))
              .map((item: { folderId?: number | null }) => !args.deleteClips && removedIds.includes(item.folderId)
                ? { ...item, folderId: null } : item);
            (window as any).__copicuTestFolders = folders.filter((entry: { id: number }) => !removedIds.includes(entry.id))
              .map((entry: { parentId: number | null; path: string }) =>
                !args.deleteDescendants && entry.parentId === folder.id
                  ? { ...entry, parentId: folder.parentId, path: entry.path.slice(folder.path.length + 1) }
                  : entry);
            return preview;
          }
          case "move_history_items_to_folder": {
            const folderId = args.folderPath ? resolveFolderIntent({ op: "create", path: args.folderPath }) : args.folderId;
            (window as any).__copicuTestHistoryItems = (window as any).__copicuTestHistoryItems.map((item: any) => args.itemIds.includes(item.id) ? { ...item, folderId } : item);
            return args.itemIds.length;
          }
          case "copy_history_items_to_folder": {
            const folderId = args.folderPath ? resolveFolderIntent({ op: "create", path: args.folderPath }) : args.folderId;
            const items = (window as any).__copicuTestHistoryItems;
            const result = { created: 0, existing: 0, itemIds: [] as number[] };
            for (const sourceId of args.itemIds) {
              const source = items.find((item: any) => item.id === sourceId);
              const existing = items.find((item: any) => item.folderId === folderId && item.normalized_hash === source.normalized_hash);
              if (existing) { result.existing++; result.itemIds.push(existing.id); }
              else {
                const id = Math.max(...items.map((item: any) => item.id)) + 1;
                items.push({ ...structuredClone(source), id, folderId });
                result.created++; result.itemIds.push(id);
              }
            }
            return result;
          }
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

async function broadcastAppearance(
  page: Page,
  appearance: Partial<AppSettings["appearance"]>,
) {
  await page.evaluate(async (appearancePatch) => {
    const runtime = window as Window & {
      __copicuTestSettings: AppSettings;
      __copicuTestEmitEvent: (event: string, payload: unknown) => Promise<number>;
    };
    const nextSettings = {
      ...runtime.__copicuTestSettings,
      appearance: {
        ...runtime.__copicuTestSettings.appearance,
        ...appearancePatch,
      },
    };
    runtime.__copicuTestSettings = nextSettings;
    await runtime.__copicuTestEmitEvent("copicu://settings/updated", nextSettings);
  }, appearance);
}

async function openPickerOverflow(page: Page) {
  await page.getByRole("button", { name: "Open picker menu" }).click();
  const menu = page.getByRole("menu", { name: "Picker menu" });
  await expect(menu).toBeVisible();
  return menu;
}

async function openItemSubmenu(page: Page, name: "Organize" | "More actions") {
  await page.getByRole("menu", { name: "Item actions", exact: true })
    .getByRole("menuitem", { name, exact: true }).click();
  const menu = page.getByRole("menu", { name, exact: true });
  await expect(menu).toBeVisible();
  return menu;
}
async function openMarksMenu(page: Page) {
  await page.getByRole("button", { name: /^Open marked clips menu/ }).click();
  const menu = page.getByRole("menu", { name: "Marked clips", exact: true });
  await expect(menu).toBeVisible();
  return menu;
}
async function openSelectionMenu(page: Page) {
  const trigger = page.locator(".selection-menu-button");
  await expect(trigger).toHaveCount(1);
  await expect(trigger.locator(".selection-menu-count")).toHaveCount(1);
  await expect(trigger).toHaveAccessibleName(/^Open selected clips menu, .+ selected$/);
  await trigger.click();
  const menu = page.getByRole("menu", { name: "Selected clips", exact: true });
  await expect(menu).toBeVisible();
  return menu;
}



async function waitForDefaultHistoryReady(page: Page) {
  await expect(page.locator("[title='Result count']")).toHaveText("4 total");
  await expect(page.getByRole("group", { name: /COPICU_SYNTH_MARKDOWN/ })).toHaveClass(/is-selected/);
}

async function selectLongSingleLine(page: Page) {
  await waitForDefaultHistoryReady(page);
  const item = page.getByRole("group", { name: /COPICU_SYNTH_LONG_SINGLE_LINE/ });
  await item.click();
  await expect(item).toHaveClass(/is-selected/);
}

async function selectLongSingleLineAndUnbroken(page: Page) {
  await selectLongSingleLine(page);
  await page.getByRole("group", { name: /COPICU_SYNTH_LONG_SINGLE_LINE/ }).click({
    modifiers: ["Control"],
  });
  const unbroken = page.getByRole("group", { name: /COPICU_SYNTH_LONG_UNBROKEN/ });
  await unbroken.click({ modifiers: ["Control"] });
  await expect(page.getByRole("group", { name: /COPICU_SYNTH_LONG_SINGLE_LINE/ })).toHaveClass(/is-multi-selected/);
  await expect(unbroken).toHaveClass(/is-multi-selected/);
}

async function openFind(page: Page, needle?: string) {
  await page.keyboard.press("Control+f");
  const findBar = page.getByTestId("find-bar");
  await expect(findBar).toBeVisible();
  const input = page.getByLabel("Find in results");
  await expect(input).toBeFocused();
  if (needle !== undefined) {
    await input.fill(needle);
  }
  return { findBar, input };
}

async function waitForFindReady(page: Page, count: string) {
  await expect(page.locator("#find-status")).toHaveText(count, { timeout: 5000 });
  await expect(page.getByTestId("find-bar")).toHaveAttribute("data-find-status", "ready");
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

test("Find closes pending Start and supersedes stale starts without leaking sessions", async ({ page }) => {
  test.slow();
  await mockTauriInvoke(page, findFixtureHistory, null, { findStartDelayMs: 500 });
  await gotoShell(page);
  await expect(page.locator(".feed-item").first()).toBeVisible();

  const { findBar, input } = await openFind(page);
  await input.fill("NEEDLE");
  await page.waitForFunction(() =>
    (window as any).__copicuTestInvocations.some((call: any) => call.cmd === "find_start"),
  );
  await expect(findBar).toHaveAttribute("data-find-status", "starting");
  await page.keyboard.press("Escape");
  await expect(findBar).toBeHidden();
  await page.waitForFunction(() =>
    (window as any).__copicuTestInvocations.some((call: any) => call.cmd === "find_cancel_owner"),
  );
  await page.waitForTimeout(620);
  expect(await page.evaluate(() => (window as any).__copicuTestFindSessionIds)).toEqual([]);
  await page.evaluate(() => {
    (window as any).__copicuTestInvocations = [];
    (window as any).__copicuTestFindSessionIds = [];
    (window as any).__copicuTestFindActiveSessionId = null;
  });

  const reopened = await openFind(page);
  await reopened.input.fill("NEEDLE");
  await page.waitForFunction(() =>
    (window as any).__copicuTestInvocations.filter((call: any) => call.cmd === "find_start").length >= 1,
  );
  await reopened.input.fill("middle");
  await expect(reopened.findBar).toHaveAttribute("data-find-status", "starting");
  await page.waitForFunction(() =>
    (window as any).__copicuTestInvocations.filter((call: any) => call.cmd === "find_start").length >= 2,
  );
  await page.waitForFunction(() =>
    (window as any).__copicuTestFindSessionIds.length === 1,
    { timeout: 5000 },
  );
  expect(await page.evaluate(() => (window as any).__copicuTestFindSessionIds)).toHaveLength(1);
  await page.keyboard.press("Escape");
  await expect(reopened.findBar).toBeHidden();
  await page.waitForTimeout(260);
  expect(await page.evaluate(() => (window as any).__copicuTestFindSessionIds)).toEqual([]);
});

test("Find supports zero, multiple, wrap navigation, highlights, Escape and focus restoration", async ({ page }) => {
  await mockTauriInvoke(page, findFixtureHistory);
  await gotoShell(page);
  await expect(page.locator(".feed-item").first()).toBeVisible();

  const { findBar, input } = await openFind(page, "NEEDLE");
  await waitForFindReady(page, "1 / 4");
  await expect(page.locator(".find-highlight")).toHaveCount(4);
  await input.press("Enter");
  await expect(page.locator("#find-status")).toHaveText("2 / 4");
  await input.press("Shift+Enter");
  await expect(page.locator("#find-status")).toHaveText("1 / 4");
  await findBar.getByRole("button", { name: "Previous match" }).click();
  await expect(page.locator("#find-status")).toHaveText("4 / 4");
  await findBar.getByRole("button", { name: "Next match" }).click();
  await expect(page.locator("#find-status")).toHaveText("1 / 4");

  await input.fill("NO_SUCH_FIND_TOKEN");
  await expect(page.locator("#find-status")).toHaveText("0 / 0");
  await expect(findBar).toHaveAttribute("data-find-status", "empty");
  await page.keyboard.press("Escape");
  await expect(findBar).toBeHidden();
  await expect(page.getByLabel("Search clipboard history")).toBeFocused();
});

test("Find reveals a remote target without requesting another history page", async ({ page }) => {
  const visibleItems = syntheticPagedHistory;
  const remoteItem = {
    ...syntheticPagedHistory[0],
    id: 7999,
    text: "REMOTE_FIND_NEEDLE",
    normalized_hash: "remote-find-target",
  };
  await mockTauriInvoke(page, visibleItems, null, { findRemoteItem: remoteItem });
  await gotoShell(page);
  await expect(page.locator(".feed-item").first()).toBeVisible();
  await page.waitForFunction(() =>
    (window as any).__copicuTestHistoryResponses.length >= 1,
  );
  const historyResponsesBefore = await page.evaluate(() =>
    (window as any).__copicuTestHistoryResponses.length,
  );

  await openFind(page, "REMOTE_FIND_NEEDLE");
  await waitForFindReady(page, "1 / 1");
  await expect(page.locator("#history-item-7999")).toBeVisible();
  await page.waitForTimeout(260);
  const historyResponses = await page.evaluate(() => (window as any).__copicuTestHistoryResponses);
  expect(historyResponses.length).toBe(historyResponsesBefore);
  await page.keyboard.press("Escape");
});

test("Find recovers once from Target invalidation and exposes Retry after a second failure", async ({ page }) => {
  await mockTauriInvoke(page, findFixtureHistory, null, { findTargetInvalidations: 2 });
  await gotoShell(page);
  await expect(page.locator(".feed-item").first()).toBeVisible();
  const { findBar } = await openFind(page, "NEEDLE");
  await expect(findBar.getByRole("button", { name: "Retry Find" })).toBeVisible({ timeout: 5000 });
  await expect(findBar).toHaveAttribute("data-find-status", "error");
  await findBar.getByRole("button", { name: "Retry Find" }).click();
  await waitForFindReady(page, "1 / 4");
});

test("Find shares invalidation recovery across Navigate and Matches", async ({ page }) => {
  await mockTauriInvoke(page, findFixtureHistory, null, { findNavigateInvalidations: 1 });
  await gotoShell(page);
  await expect(page.locator(".feed-item").first()).toBeVisible();
  const { input } = await openFind(page, "NEEDLE");
  await waitForFindReady(page, "1 / 4");
  await input.press("Enter");
  await waitForFindReady(page, "1 / 4");
  await input.press("Enter");
  await waitForFindReady(page, "2 / 4");
  await page.keyboard.press("Escape");

  await mockTauriInvoke(page, findFixtureHistory, null, { findMatchesInvalidations: 1 });
  await gotoShell(page);
  await expect(page.locator(".feed-item").first()).toBeVisible();
  await openFind(page, "NEEDLE");
  await waitForFindReady(page, "1 / 4");
});

test("Find keeps Markdown mixed text and inline alt highlights mapped to visible segments", async ({ page }) => {
  await mockTauriInvoke(page, [findFixtureHistory[3]]);
  await gotoShell(page);
  await expect(page.locator(".feed-item").first()).toBeVisible();
  const { input } = await openFind(page, "receipt alt");
  await waitForFindReady(page, "1 / 1");
  await expect(page.locator(".markdown-image-alt .find-highlight")).toHaveCount(1);
  await input.fill("invoice");
  await waitForFindReady(page, "1 / 2");
  await expect(page.locator(".markdown-find-content .find-highlight")).toHaveCount(2);
});

test("Find consumes canonical Markdown segments for emphasis, links, comments, fences and repeated alts", async ({ page }) => {
  await mockTauriInvoke(page, [findCanonicalMarkdownFixture]);
  await gotoShell(page);
  await expect(page.locator(".feed-item").first()).toBeVisible();
  const { input } = await openFind(page, "invoice");
  await waitForFindReady(page, "1 / 6");
  await expect(page.locator(".markdown-find-content .find-highlight")).toHaveCount(4);
  await expect(page.locator(".markdown-find-content .find-highlight[aria-current='true']")).toHaveCount(1);
  await expect(page.locator(".markdown-image-alt .find-highlight")).toHaveCount(2);
  for (const segment of ["0", "2", "5", "8"]) {
    await expect(page.locator(`[data-find-field="content"] .find-highlight[data-find-segment="${segment}"]`)).toHaveCount(1);
  }
  for (const segment of ["0", "1"]) {
    await expect(page.locator(`[data-find-field="imageAlt"] .find-highlight[data-find-segment="${segment}"]`)).toHaveCount(1);
  }
  await page.keyboard.press("Escape");
  await expect(input).toBeHidden();
});

test("Find renders repeated reference Markdown alts without exposing definition URLs", async ({ page }) => {
  await mockTauriInvoke(page, [findReferenceMarkdownFixture]);
  await gotoShell(page);
  await expect(page.locator(".feed-item").first()).toBeVisible();
  const { input } = await openFind(page, "receipt");
  await waitForFindReady(page, "1 / 2");
  await expect(page.locator(".markdown-image-frame")).toHaveCount(2);
  await expect(page.locator(".markdown-image-alt .find-highlight")).toHaveCount(2);
  await expect(page.locator(".markdown-image-alt .find-highlight[aria-current='true']")).toHaveCount(1);
  await expect(page.locator(`[data-find-field="imageAlt"] .find-highlight[data-find-segment="0"]`)).toHaveCount(1);
  await expect(page.locator(`[data-find-field="imageAlt"] .find-highlight[data-find-segment="1"]`)).toHaveCount(1);
  await expect(page.locator(".markdown-preview")).not.toContainText("secret.example");
  await expect(page.locator(".markdown-preview")).not.toContainText("[img]:");
  await input.fill("secret.example");
  await expect(page.locator("#find-status")).toHaveText("0 / 0");
  await expect(page.getByTestId("find-bar")).toHaveAttribute("data-find-status", "empty");
});

test("Find uses the applied descriptor membership and limit before numbering matches", async ({ page }) => {
  const remoteItem = {
    ...findFixtureHistory[1],
    id: 7998,
    text: "invoice remote outside limit",
    created_at_unix_ms: 1_800_000_000_000,
    last_copied_at_unix_ms: 1_800_000_000_000,
    normalized_hash: "find-remote-outside-limit",
  };
  const plan = makeCanonicalSearchPlan({
    text: { all: ["invoice"] },
    filters: { kind: ["text"] },
    limit: 1,
  });
  const appliedDescriptor = {
    schemaVersion: 1,
    displayQuery: "invoice",
    effectiveQuery: "invoice",
    mode: "structured",
    plan,
    fingerprint: rustDescriptorFixtureFingerprint,
  };
  expect(await descriptorFingerprint("structured", plan)).toBe(rustDescriptorFixtureFingerprint);
  expect(rustDescriptorFixtureFingerprint).not.toBe(previousJsDescriptorFixtureFingerprint);
  await mockTauriInvoke(page, findFixtureHistory, null, {
    findRemoteItem: remoteItem,
    findAppliedDescriptor: appliedDescriptor,
  });
  await gotoShell(page);
  await expect(page.locator("#history-item-7004")).toBeVisible();
  expect(await page.evaluate(() => (window as any).__copicuTestAppliedDescriptor.fingerprint))
    .toBe(appliedDescriptor.fingerprint);
  expect(appliedDescriptor.fingerprint).toMatch(/^[0-9a-f]{64}$/);
  await expect(page.locator("#history-item-7998")).toHaveCount(0);
  const { input } = await openFind(page, "invoice");
  await waitForFindReady(page, "1 / 2");
  await expect.poll(() => page.evaluate(() => (window as any).__copicuTestFindMembershipIds)).toEqual([7004]);
  await input.press("Enter");
  await expect(page.locator("#find-status")).toHaveText("2 / 2");
  expect(await page.evaluate(() => (window as any).__copicuTestFindTargets.at(-1)?.target?.itemId)).toBe(7004);
});

test("descriptor mock supports wildcard MIME and conjunctive exact negations", async ({ page }) => {
  const descriptorItems = [
    {
      ...findFixtureHistory[1],
      id: 8301,
      text: "invoice image tied low id",
      mime_primary: "image/png",
      created_at_unix_ms: 1_900_000_000_002,
      last_copied_at_unix_ms: 1_900_000_000_002,
    },
    {
      ...findFixtureHistory[1],
      id: 8302,
      text: "invoice excluded svg",
      mime_primary: "image/svg+xml",
      created_at_unix_ms: 1_900_000_000_003,
      last_copied_at_unix_ms: 1_900_000_000_003,
    },
    {
      ...findFixtureHistory[1],
      id: 8303,
      text: "invoice image tied high id",
      mime_primary: "image/jpeg",
      created_at_unix_ms: 1_900_000_000_002,
      last_copied_at_unix_ms: 1_900_000_000_002,
    },
    {
      ...findFixtureHistory[1],
      id: 8304,
      text: "invoice plain text",
      mime_primary: "text/plain",
      created_at_unix_ms: 1_900_000_000_001,
      last_copied_at_unix_ms: 1_900_000_000_001,
    },
  ];
  const plan = makeCanonicalSearchPlan({
    text: { all: ["invoice"] },
    filters: {
      mime: ["image/*"],
      notMime: ["image/svg+xml", "image/gif"],
    },
    limit: 2,
  });
  const appliedDescriptor = {
    schemaVersion: 1,
    displayQuery: "invoice",
    effectiveQuery: "invoice",
    mode: "structured",
    plan,
    fingerprint: await descriptorFingerprint("structured", plan),
  };
  await mockTauriInvoke(page, descriptorItems, null, { findAppliedDescriptor: appliedDescriptor });
  await gotoShell(page);
  await expect(page.locator("#history-item-8301")).toBeVisible();
  await expect(page.locator("#history-item-8303")).toBeVisible();
  await expect(page.locator("#history-item-8302")).toHaveCount(0);
  await expect(page.locator("#history-item-8304")).toHaveCount(0);
  const { input } = await openFind(page, "invoice");
  await waitForFindReady(page, "1 / 2");
  await expect.poll(() => page.evaluate(() => (window as any).__copicuTestFindMembershipIds)).toEqual([8303, 8301]);
  await expect(input).toBeVisible();
});

test("descriptor mock preserves compound sort priority and final ID tie-break", async ({ page }) => {
  const sortItems = [
    {
      ...findFixtureHistory[1],
      id: 10,
      text: "sort fixture ten",
      created_at_unix_ms: 1_910_000_000_002,
      last_used_at_unix_ms: 1_910_000_000_001,
      last_copied_at_unix_ms: 1_910_000_000_009,
    },
    {
      ...findFixtureHistory[1],
      id: 30,
      text: "sort fixture thirty",
      created_at_unix_ms: 1_910_000_000_001,
      last_used_at_unix_ms: 1_910_000_000_004,
      last_copied_at_unix_ms: 1_910_000_000_003,
    },
    {
      ...findFixtureHistory[1],
      id: 20,
      text: "sort fixture twenty",
      created_at_unix_ms: 1_910_000_000_001,
      last_used_at_unix_ms: 1_910_000_000_004,
      last_copied_at_unix_ms: 1_910_000_000_002,
    },
  ];
  const plan = makeCanonicalSearchPlan({
    text: { all: ["sort fixture"] },
    filters: null,
    sort: [
      { field: "created", direction: "asc" },
      { field: "lastUsed", direction: "desc" },
      { field: "lastCopied", direction: "asc" },
      { field: "lastUsed", direction: "asc" },
    ],
  });
  const appliedDescriptor = {
    schemaVersion: 1,
    displayQuery: "sort fixture",
    effectiveQuery: "sort fixture",
    mode: "structured",
    plan,
    fingerprint: await descriptorFingerprint("structured", plan),
  };
  await mockTauriInvoke(page, sortItems, null, { findAppliedDescriptor: appliedDescriptor });
  await gotoShell(page);
  await expect(page.locator("#history-item-20")).toBeVisible();
  const orderedIds = await page.evaluate(() => {
    const descriptor = (window as any).__copicuTestAppliedDescriptor;
    return (window as any).__copicuTestDescriptorMembership(descriptor).items.map((item: any) => item.id);
  });
  expect(orderedIds).toEqual([20, 30, 10]);
});

test("descriptor mock fails closed for unmodeled filter shapes", async ({ page }) => {
  await mockTauriInvoke(page, [findFixtureHistory[1]]);
  await gotoShell(page);
  const results = await page.evaluate(() => {
    const membership = (window as any).__copicuTestDescriptorMembership;
    return {
      unknown: membership({
        schemaVersion: 1,
        plan: {
          schemaVersion: 1,
          filters: { futureOperator: ["invoice"] },
          sort: [],
          limit: null,
        },
      }),
      date: membership({
        schemaVersion: 1,
        plan: {
          schemaVersion: 1,
          filters: {
            date: [{ field: "created", op: "after", value: "2026-01-01T00:00:00Z" }],
          },
          sort: [],
          limit: null,
        },
      }),
    };
  });
  expect(results.unknown.supported).toBe(false);
  expect(results.date.supported).toBe(false);
});

test("Find rebase keeps the nearest anchor through edit and advances on delete", async ({ page }) => {
  await mockTauriInvoke(page, findFixtureHistory, null, {
    appearance: { itemActions: "inline" },
  });
  await gotoShell(page);
  await expect(page.locator(".feed-item").first()).toBeVisible();
  const { input } = await openFind(page, "NEEDLE");
  await waitForFindReady(page, "1 / 4");
  await page.evaluate(() => {
    (window as any).__copicuTestFindTargets = [];
  });
  await input.press("Enter");
  await expect(page.locator("#find-status")).toHaveText("2 / 4");
  await input.press("Enter");
  await expect(page.locator("#find-status")).toHaveText("3 / 4");
  expect(await page.evaluate(() => (window as any).__copicuTestFindTargets.at(-1)?.target)).toMatchObject({
    itemId: 7002,
    field: "content",
    segment: 0,
  });

  const firstRow = page.locator("#history-item-7001");
  await page.evaluate(() => {
    (window as any).__copicuTestFindTargets = [];
  });
  await firstRow.hover();
  await firstRow.getByRole("button", { name: "Open item actions" }).click();
  const firstMenu = page.getByRole("menu", { name: "Item actions" });
  await firstMenu.getByRole("menuitem", { name: "Quick edit", exact: true }).click();
  const firstEditor = firstRow.getByRole("textbox", { name: "Quick edit item 7001" });
  await firstEditor.fill("NEEDLE");
  await firstEditor.press("Control+Enter");
  await expect(firstEditor).toBeHidden();
  await expect(page.locator("#find-status")).toHaveText(/^[1-3] \/ 3$/);
  expect(await page.evaluate(() => (window as any).__copicuTestFindTargets.at(-1)?.target)).toMatchObject({
    itemId: 7002,
    field: "content",
    segment: 0,
  });
  await expect(page.locator("#find-status")).toHaveText("2 / 3");

  const currentRow = page.locator("#history-item-7002");
  await currentRow.hover();
  await currentRow.getByRole("button", { name: "Delete item" }).click();
  await waitForFindReady(page, "2 / 2");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(80);
  expect(await page.evaluate(() => (window as any).__copicuTestFindSessionIds)).toEqual([]);
});

test("Find large rebase resolves its anchor with one bounded IPC", async ({ page }) => {
  test.slow();
  await mockTauriInvoke(page, findLargeRebaseHistory);
  await gotoShell(page);
  await expect(page.locator(".feed-item").first()).toBeVisible();
  const { input } = await openFind(page, "NEEDLE");
  await waitForFindReady(page, "1 / 2000");
  await page.evaluate(() => {
    (window as any).__copicuTestFindResolveCalls = [];
    (window as any).__copicuTestInvocations = [];
  });

  const firstRow = page.locator("#history-item-8000");
  await firstRow.hover();
  await firstRow.getByRole("button", { name: "Open item actions" }).click();
  const firstMenu = page.getByRole("menu", { name: "Item actions" });
  await firstMenu.getByRole("menuitem", { name: "Quick edit", exact: true }).click();
  const firstEditor = firstRow.getByRole("textbox", { name: "Quick edit item 8000" });
  await firstEditor.fill("NEEDLE large fixture 0");
  await firstEditor.press("Control+Enter");
  await expect(firstEditor).toBeHidden();
  await waitForFindReady(page, "1 / 2000");
  const resolveCalls = await page.evaluate(() => (window as any).__copicuTestFindResolveCalls);
  expect(resolveCalls).toHaveLength(1);
  const findTargetCalls = await page.evaluate(() =>
    (window as any).__copicuTestInvocations.filter((call: any) => call.cmd === "find_target"),
  );
  expect(findTargetCalls).toHaveLength(1);
  expect(resolveCalls[0].request.preferredTarget).toMatchObject({
    itemId: 8000,
    field: "content",
    segment: 0,
  });
  await input.press("Escape");
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
  await pickerMenu.getByRole("menuitem", { name: "Organize" }).click();
  await page.getByRole("menuitem", { name: "Saved searches…" }).click();
  await page.getByRole("dialog", { name: "Command palette" }).getByRole("option", { name: /Work clips/ }).click();
  await expect(page.locator(".context-strip")).toHaveCount(1);
  await expect(page.getByTestId("saved-view-bar")).toContainText("Saved search");
  await expect(page.getByTestId("saved-view-bar")).toContainText("Work clips");
});

test("picker row compact menu and submenus stay keyboard reachable at 420 px", async ({ page }) => {
  await page.setViewportSize({ width: 420, height: 640 });
  await mockTauriInvoke(page);
  await gotoShell(page);

  const row = page.locator(".history-feed.has-items > li").first();
  const kebab = row.getByRole("button", { name: "Open item actions" });
  await row.hover();
  await expect(kebab).toHaveCSS("pointer-events", "auto");
  await kebab.click();

  const menu = page.getByRole("menu", { name: "Item actions" });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem").first()).toHaveText("Quick edit");
  await expect(menu.getByRole("menuitem").nth(1)).toContainText("Edit metadata");
  expect(await menu.getByRole("menuitem").count()).toBe(8);
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

  const organize = menu.getByRole("menuitem", { name: "Organize", exact: true });
  await organize.focus();
  await page.keyboard.press("ArrowRight");
  const submenu = page.getByRole("menu", { name: "Organize", exact: true });
  await expect(submenu).toBeVisible();
  await expect(submenu.getByRole("menuitem").first()).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(submenu.getByRole("menuitem").nth(1)).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(submenu).toBeHidden();
  await expect(organize).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(submenu.getByRole("menuitem").first()).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(submenu).toBeHidden();
  await expect(menu).toBeVisible();
  await expect(organize).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(kebab).toBeFocused();
});

test("plain click replaces bulk selection while keyboard navigation keeps it", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page);
  await waitForDefaultHistoryReady(page);

  const rows = page.locator(".feed-item");
  const first = rows.nth(0);
  const second = rows.nth(1);
  const third = rows.nth(2);
  const fourth = rows.nth(3);
  const rowItems = page.locator(".history-feed.has-items > li");
  const firstRow = rowItems.nth(0);
  const thirdRow = rowItems.nth(2);
  const firstCheckbox = firstRow.getByLabel("Select item");
  await firstRow.hover();
  const checkboxTarget = await firstRow.locator(".item-selection-button").boundingBox();
  expect(checkboxTarget?.width).toBeGreaterThanOrEqual(44);
  expect(checkboxTarget?.height).toBeGreaterThanOrEqual(44);

  await first.click();
  await expect(first).toHaveAttribute("aria-current", "true");
  await expect(firstCheckbox).not.toBeChecked();
  await expect(page.getByRole("status", { name: "Picker status" })).toContainText("No clips selected.");

  const search = page.getByLabel("Search clipboard history");
  await search.press("ArrowDown");
  await expect(second).toHaveAttribute("aria-current", "true");
  await expect(search).toBeFocused();
  await search.press("ArrowUp");
  await expect(first).toHaveAttribute("aria-current", "true");
  await search.press("PageDown");
  await expect(fourth).toHaveAttribute("aria-current", "true");
  await search.press("PageUp");
  await expect(first).toHaveAttribute("aria-current", "true");

  await firstCheckbox.click();
  await thirdRow.hover();
  await thirdRow.getByLabel("Select item").click();
  await expect(first).toHaveClass(/is-multi-selected/);
  await expect(third).toHaveClass(/is-multi-selected/);
  await expect(page.locator(".selection-menu-button")).toHaveAccessibleName(
    "Open selected clips menu, 2 selected",
  );
  await expect(page.getByRole("status", { name: "Picker status" })).toContainText("2 clips selected.");

  await search.hover();
  await expect(firstRow.locator(".item-selection-button")).toHaveCSS("opacity", "1");
  await expect(thirdRow.locator(".item-selection-button")).toHaveCSS("opacity", "1");
  await expect(rowItems.nth(1).locator(".item-selection-button")).toHaveCSS("opacity", "0");
  await expect(firstRow.getByLabel("Deselect item")).toBeChecked();
  await expect(thirdRow.getByLabel("Deselect item")).toBeChecked();
  // A checked row remains directly deselectable without hover.
  await firstRow.getByLabel("Deselect item").click();
  await search.hover();
  await expect(firstRow.locator(".item-selection-button")).toHaveCSS("opacity", "0");
  await expect(thirdRow.locator(".item-selection-button")).toHaveCSS("opacity", "1");

  // A plain click on another row replaces the previous bulk selection.
  await fourth.click();
  await expect(fourth).toHaveAttribute("aria-current", "true");
  await expect(first).not.toHaveClass(/is-multi-selected/);
  await expect(third).not.toHaveClass(/is-multi-selected/);
  await expect(page.locator(".selection-menu-button")).toHaveAccessibleName("Open selected clips menu, 0 selected");

  // Ctrl-click highlights a transient group; clicking outside the feed clears it.
  await first.click();
  await third.click({ modifiers: ["Control"] });
  await expect(first).toHaveClass(/is-multi-selected/);
  await expect(third).toHaveClass(/is-multi-selected/);
  await page.locator(".search-filter-strip").hover();
  await expect(firstRow.locator(".item-selection-button")).toHaveCSS("opacity", "1");
  await expect(thirdRow.locator(".item-selection-button")).toHaveCSS("opacity", "1");
  await search.click();
  await expect(first).not.toHaveClass(/is-multi-selected/);
  await expect(third).not.toHaveClass(/is-multi-selected/);
  await expect(page.locator(".selection-menu-button")).toHaveAccessibleName("Open selected clips menu, 0 selected");
  await firstRow.hover();
  await firstCheckbox.click();
  await thirdRow.hover();
  await thirdRow.getByLabel("Select item").click();
  await fourth.focus();
  await expect(fourth).toBeFocused();
  await fourth.press("ArrowUp");
  await expect(third).toHaveAttribute("aria-current", "true");
  await expect(first).toHaveClass(/is-multi-selected/);
  await expect(third).toHaveClass(/is-multi-selected/);


  // Keyboard navigation with the search focused also preserves the group.
  await search.press("ArrowUp");
  await expect(second).toHaveAttribute("aria-current", "true");
  await expect(first).toHaveClass(/is-multi-selected/);
  await expect(third).toHaveClass(/is-multi-selected/);

  const trigger = page.locator(".selection-menu-button");
  await trigger.focus();
  await page.keyboard.press("Enter");
  const menu = page.getByRole("menu", { name: "Selected clips", exact: true });
  await expect(menu).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await expect(menu.getByRole("menuitem").first()).toBeFocused();
  await expect(menu.getByRole("menuitem", { name: "Clear selection", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(trigger).toBeFocused();

  await openSelectionMenu(page);
  await page.getByRole("menu", { name: "Selected clips", exact: true })
    .getByRole("menuitem", { name: "Clear selection", exact: true })
    .click();
  await expect(page.locator(".selection-menu-button")).toHaveAccessibleName(
    "Open selected clips menu, 0 selected",
  );
  await expect(page.getByLabel("Select item")).toHaveCount(4);
  await expect(page.getByRole("status", { name: "Picker status" })).toContainText("No clips selected.");
  await expect(second).toHaveAttribute("aria-current", "true");
});

test("keyboard navigation keeps the current item inside the feed viewport", async ({ page }) => {
  await mockTauriInvoke(page, syntheticPagedHistory);
  await gotoShell(page);
  await expect(page.locator(".feed-item").first()).toBeVisible();

  const search = page.getByLabel("Search clipboard history");
  for (let index = 0; index < 20; index += 1) {
    await search.press("ArrowDown");
  }

  const currentRow = page.locator('li[data-current="true"]');
  await expect(currentRow).toBeAttached();
  const withinFeedViewport = await currentRow.evaluate((row) => {
    const viewport = row.closest(".history-feed-scroll");
    if (!(viewport instanceof HTMLElement)) return false;
    const rowBounds = row.getBoundingClientRect();
    const viewportBounds = viewport.getBoundingClientRect();
    return rowBounds.top >= viewportBounds.top && rowBounds.bottom <= viewportBounds.bottom;
  });
  expect(withinFeedViewport).toBe(true);
});

test("row actions reveal on hover without covering or moving previews", async ({ page }) => {
  const items = ["First text clip", "Second text clip", "Third text clip"].map((text, index) => ({
    ...syntheticLongHistory[1],
    id: 9100 + index,
    text,
    title: null,
    notes: null,
    tags: null,
    is_marked: false,
  }));
  await mockTauriInvoke(page, items, null, {
    appearance: { itemActions: "inline" },
  });
  await gotoShell(page);
  const search = page.getByLabel("Search clipboard history");
  const rows = page.locator(".history-feed.has-items > li");
  const first = rows.nth(0);
  const second = rows.nth(1);
  await expect(first.locator(".feed-item")).toHaveAttribute("aria-current", "true");
  await search.hover();
  const deleteSecond = second.getByRole("button", { name: "Delete item", exact: true });
  const menuSecond = second.getByRole("button", { name: "Open item actions", exact: true });
  await expect(deleteSecond).toHaveCSS("opacity", "0");
  await expect(menuSecond).toHaveCSS("opacity", "0");

  const restingPreview = await second.locator(".text-preview").boundingBox();
  const restingRow = await second.boundingBox();
  await second.hover();
  await expect(deleteSecond).toHaveCSS("opacity", "1");
  await expect(menuSecond).toHaveCSS("opacity", "1");
  await expect(first.locator(".feed-item")).toHaveAttribute("aria-current", "true");
  expect(await second.locator(".text-preview").boundingBox()).toEqual(restingPreview);
  expect(await second.boundingBox()).toEqual(restingRow);
  const deleteTarget = await deleteSecond.boundingBox();
  const checkboxTarget = await second.locator(".item-selection-button").boundingBox();
  const actionBoxes = await second.locator(".item-actions button").evaluateAll((buttons) =>
    buttons.map((button) => {
      const box = button.getBoundingClientRect();
      return { x: box.x, y: box.y, width: box.width, height: box.height };
    }));
  expect(actionBoxes).toHaveLength(3);
  for (const box of actionBoxes) {
    expect(box.width).toBeGreaterThanOrEqual(24);
    expect(box.height).toBeGreaterThanOrEqual(24);
    expect(box.y + box.height / 2).toBeCloseTo(deleteTarget!.y + deleteTarget!.height / 2, 1);
    expect(box.width).toBe(deleteTarget!.width);
    expect(box.height).toBe(deleteTarget!.height);
    expect(box.y + box.height / 2).toBeCloseTo(checkboxTarget!.y + checkboxTarget!.height / 2, 1);
  }
  expect(restingPreview!.x + restingPreview!.width).toBeLessThanOrEqual(Math.min(...actionBoxes.map((box) => box.x)));

  await second.getByRole("button", { name: "Mark item", exact: true }).click();
  await search.hover();
  await expect(second.getByRole("button", { name: "Unmark item", exact: true })).toHaveCSS("opacity", "1");
  expect(await second.locator(".text-preview").boundingBox()).toEqual(restingPreview);
  expect(await second.boundingBox()).toEqual(restingRow);

  await search.press("ArrowDown");
  await expect(search).toBeFocused();
  await expect(second.locator(".feed-item")).toHaveAttribute("aria-current", "true");
  await expect(deleteSecond).toHaveCSS("opacity", "0");
  await expect(menuSecond).toHaveCSS("opacity", "0");
  await expect(first.getByRole("button", { name: "Open item actions" })).toHaveCSS("opacity", "0");

  await menuSecond.focus();
  await expect(menuSecond).toHaveCSS("opacity", "1");
  await menuSecond.press("Enter");
  const itemMenu = page.getByRole("menu", { name: "Item actions" });
  await expect(itemMenu).toBeVisible();
  await page.mouse.move(1, 1);
  await expect(menuSecond).toHaveCSS("opacity", "1");
  await page.keyboard.press("Escape");
  await expect(itemMenu).toBeHidden();
  await expect(menuSecond).toBeFocused();
  await deleteSecond.click();
  await expect(page.getByRole("group", { name: "Second text clip", exact: true })).toHaveCount(0);
  await expect(page.getByRole("group", { name: "First text clip", exact: true })).toBeVisible();
  await expect(page.getByRole("group", { name: "Third text clip", exact: true })).toBeVisible();
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
  await expect(menu.getByRole("menuitem", { name: /Quick Actions/ }).locator("kbd")).toHaveCount(1);

  const hasOverflow = await menu.evaluate((element) => element.scrollWidth > element.clientWidth + 1);
  expect(hasOverflow).toBe(false);
});

test("Organize stays closed on hover and replaces the menu contents on click", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page);

  const menu = await openPickerOverflow(page);
  const organize = menu.getByRole("menuitem", { name: "Organize" });
  await organize.hover();
  await expect(menu.getByRole("menuitem", { name: "Inbox" })).toHaveCount(0);
  await expect(page.getByRole("menu")).toHaveCount(1);

  await organize.click();
  await expect(menu.getByRole("menuitem", { name: "Inbox" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Back to picker actions" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "New item" })).toHaveCount(0);
  await expect(page.getByRole("menu")).toHaveCount(1);
});

test("Inbox organizer entry applies a valid structured filter", async ({ page }) => {
  const inboxItem = {
    ...syntheticLongHistory[0],
    is_inbox: true,
    inbox_at_unix_ms: 1_900_000_000_000,
  };
  const regularItem = {
    ...syntheticLongHistory[1],
    is_inbox: false,
    inbox_at_unix_ms: null,
  };
  await mockTauriInvoke(page, [inboxItem, regularItem]);
  await gotoShell(page);

  const menu = await openPickerOverflow(page);
  await menu.getByRole("menuitem", { name: "Organize" }).click();
  await page.getByRole("menuitem", { name: "Inbox" }).click();

  await expect(page.getByLabel("Search clipboard history")).toHaveText("is:inbox");
  await expect(page.getByText("`is:inbox` is not a supported is filter.")).toHaveCount(0);
  await expect(page.locator(".history-feed > li")).toHaveCount(1);
  await expect(page.locator(".history-feed > li").first().getByRole("button", { name: "Remove from Inbox" })).toBeVisible();
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
  await viewsMenu.getByRole("menuitem", { name: "Organize" }).click();
  await page.getByRole("menuitem", { name: "Save current search" }).click();
  const viewCreator = page.getByRole("dialog", { name: "Save current search" });
  await expect(viewCreator).toBeVisible();
  await viewCreator.getByRole("button", { name: "Close saved search creator" }).click();

  const captureModesMenu = await openPickerOverflow(page);
  await captureModesMenu.getByRole("menuitem", { name: "Organize" }).click();

  await page.getByRole("menuitem", { name: "Create capture mode" }).click();
  await expect(page.getByRole("dialog", { name: "Create capture mode" })).toBeVisible();
});
test("context menu adds a history item to Inbox", async ({ page }) => {
  const regularItem = {
    ...syntheticLongHistory[0],
    is_inbox: false,
    inbox_at_unix_ms: null,
  };
  await mockTauriInvoke(page, [regularItem]);
  await gotoShell(page);

  const row = page.locator(".history-feed > li").first();
  await row.getByRole("group").click({ button: "right" });
  await (await openItemSubmenu(page, "Organize")).getByRole("menuitem", { name: "Add to Inbox" }).click();

  await expect(row.getByRole("button", { name: "Remove from Inbox" })).toBeVisible();
  const inboxTransitions = await page.evaluate(() => {
    const testWindow = window as Window & {
      __copicuTestInvocations?: Array<{ cmd: string; args: { itemId?: number; inbox?: boolean } }>;
    };
    return (testWindow.__copicuTestInvocations ?? [])
      .filter((call) => call.cmd === "set_history_item_inbox")
      .map((call) => call.args);
  });
  expect(inboxTransitions).toEqual([{ itemId: regularItem.id, inbox: true }]);
});

test("Inbox item stays pending on catalog cancel and leaves after catalog save", async ({ page }) => {
  const inboxItem = {
    ...syntheticLongHistory[0],
    is_inbox: true,
    inbox_at_unix_ms: 1_900_000_000_000,
  };
  const regularItem = {
    ...syntheticLongHistory[1],
    is_inbox: false,
    inbox_at_unix_ms: null,
  };
  await mockTauriInvoke(page, [inboxItem, regularItem]);
  await gotoShell(page);

  const firstRow = page.locator(".history-feed > li").first();
  await firstRow.hover();
  await expect(firstRow.getByRole("button", { name: "Remove from Inbox" })).toBeVisible();
  await firstRow.getByRole("button", { name: "Open item actions" }).click();
  await (await openItemSubmenu(page, "Organize")).getByRole("menuitem", { name: "Catalog Inbox item" }).click();
  await expect.poll(async () => page.evaluate(() => {
    const runtime = window as MetadataVisualRuntime;
    return (runtime.__copicuTestInvocations ?? []).filter((call) => call.cmd === "open_metadata_window").length;
  })).toBe(1);
  await page.evaluate(async (itemId) => {
    const runtime = window as MetadataVisualRuntime;
    const emitEvent = runtime.__copicuTestEmitEvent;
    if (!emitEvent) throw new Error("Synthetic metadata event bridge is unavailable");
    await emitEvent("copicu://metadata/selection-cancelled", { itemIds: [itemId] });
  }, inboxItem.id);
  await expect(firstRow.getByRole("button", { name: "Remove from Inbox" })).toBeVisible();

  await firstRow.hover();
  await firstRow.getByRole("button", { name: "Open item actions" }).click();
  await (await openItemSubmenu(page, "Organize")).getByRole("menuitem", { name: "Catalog Inbox item" }).click();
  await page.evaluate(async (itemId) => {
    const runtime = window as MetadataVisualRuntime;
    const emitEvent = runtime.__copicuTestEmitEvent;
    if (!emitEvent) throw new Error("Synthetic metadata event bridge is unavailable");
    await emitEvent("copicu://metadata/selection-saved", { itemIds: [itemId] });
  }, inboxItem.id);

  await expect(firstRow.getByRole("button", { name: "Remove from Inbox" })).toHaveCount(0);
  const inboxTransitions = await page.evaluate(() => {
    const testWindow = window as Window & {
      __copicuTestInvocations?: Array<{ cmd: string; args: { itemId?: number; inbox?: boolean } }>;
    };
    return (testWindow.__copicuTestInvocations ?? [])
      .filter((call) => call.cmd === "set_history_item_inbox")
      .map((call) => call.args);
  });
  expect(inboxTransitions).toEqual([{ itemId: inboxItem.id, inbox: false }]);
});

test("Remove from Inbox preserves the history row", async ({ page }) => {
  const inboxItem = {
    ...syntheticLongHistory[0],
    is_inbox: true,
    inbox_at_unix_ms: 1_900_000_000_000,
  };
  await mockTauriInvoke(page, [inboxItem]);
  await gotoShell(page);

  const row = page.locator(".history-feed > li").first();
  await row.hover();
  await row.getByRole("button", { name: "Open item actions" }).click();
  await (await openItemSubmenu(page, "Organize")).getByRole("menuitem", { name: "Remove from Inbox" }).click();

  await expect(row).toBeVisible();
  await expect(row.getByRole("button", { name: "Remove from Inbox" })).toHaveCount(0);
});

test("Inbox pill removes the state directly without deleting the row", async ({ page }) => {
  const inboxItem = {
    ...syntheticLongHistory[0],
    is_inbox: true,
    inbox_at_unix_ms: 1_900_000_000_000,
  };
  await mockTauriInvoke(page, [inboxItem]);
  await gotoShell(page);

  const row = page.locator(".history-feed > li").first();
  await row.getByRole("button", { name: "Remove from Inbox" }).click();

  await expect(row).toBeVisible();
  await expect(row.getByRole("button", { name: "Remove from Inbox" })).toHaveCount(0);
});

test("new item dialog creates a manual history item", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page);

  await page.getByLabel("Search clipboard history").press("Control+N");
  const dialog = page.getByRole("dialog", { name: "Create new item" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("textbox", { name: "Content" })).toBeFocused();

  const contentInput = dialog.getByRole("textbox", { name: "Content" });
  const notesInput = dialog.getByRole("textbox", { name: "Notes" });
  await contentInput.fill("COPICU_SYNTH_MANUAL_ITEM");
  await notesInput.fill("created from Copicu");
  const tagInput = dialog.getByRole("textbox", { name: "Add tags" });
  await tagInput.fill("manual");
  await tagInput.press("Enter");
  await expect(contentInput).toHaveValue("COPICU_SYNTH_MANUAL_ITEM");
  await dialog.getByRole("button", { name: "Create" }).click();

  await expect(dialog).toBeHidden();
  await expect(page.getByRole("group", { name: /COPICU_SYNTH_MANUAL_ITEM/ })).toBeVisible();
  await expect(page.getByRole("group", { name: /COPICU_SYNTH_MANUAL_ITEM/ })).toHaveClass(/is-selected/);
  const created = page.getByRole("group", { name: /COPICU_SYNTH_MANUAL_ITEM/ });
  await expect(created).toContainText("#manual");
  await expect(created).toContainText("created from Copicu");
  await expect(created.locator(".item-metadata")).not.toContainText("#manual #manual");
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
  await dialog.getByRole("textbox", { name: "Notes" }).fill("duplicate metadata");
  const duplicateTagInput = dialog.getByRole("textbox", { name: "Add tags" });
  await duplicateTagInput.fill("second");
  await duplicateTagInput.press("Enter");
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

test("command palette navigates history, saved searches, and pinned tags", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page);

  await page.getByLabel("Search clipboard history").press("Control+K");
  const palette = page.getByRole("dialog", { name: "Command palette" });
  await expect(palette.getByText("History", { exact: true })).toBeVisible();
  await expect(palette.getByText("Saved searches", { exact: true })).toBeVisible();
  await expect(palette.getByRole("option", { name: /All history/ })).toBeVisible();
  await expect(palette.getByRole("option", { name: /Work clips/ })).toBeVisible();
  await expect(palette.locator("#command-palette-entry-tag\\.1")).toBeVisible();
  await expect(palette.getByRole("option", { name: /Backend/ })).toHaveCount(0);

  await palette.getByRole("option", { name: /Work clips/ }).click();
  await expect(palette).toBeHidden();
  await expect(page.getByLabel("Search clipboard history")).toHaveText("tag:work kind:text");
  await page.waitForFunction(() =>
    (window as any).__copicuTestInvocations.some(
      (call: any) => call.cmd === "history_search" && call.args.request.query === "tag:work kind:text",
    ),
  );
});

test("picker discovers, opens, exits, and accesses saved searches without capture context", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page);

  let viewsMenu = await openPickerOverflow(page);
  await viewsMenu.getByRole("menuitem", { name: "Organize" }).click();
  await page.getByRole("menuitem", { name: "Saved searches…" }).click();
  let palette = page.getByRole("dialog", { name: "Command palette" });
  await expect(palette.getByRole("option", { name: /Work clips/ })).toBeVisible();
  await palette.getByRole("option", { name: /Work clips/ }).click();

  const viewBar = page.getByTestId("saved-view-bar");
  await expect(viewBar).toContainText("Saved search");
  await expect(viewBar).toContainText("Work clips");
  await expect(viewBar).toContainText("tag:work kind:text");
  await expect(viewBar).not.toContainText("#Work");
  await expect(page.getByRole("button", { name: "Capture here" })).toHaveCount(0);
  await expect(page.getByLabel("Search clipboard history")).toHaveText("tag:work kind:text");

  await page.getByLabel("Search clipboard history").fill("tag:context-smoke");
  await expect(viewBar).toHaveCount(0);

  viewsMenu = await openPickerOverflow(page);
  await viewsMenu.getByRole("menuitem", { name: "Organize" }).click();
  await page.getByRole("menuitem", { name: "Saved searches…" }).click();
  palette = page.getByRole("dialog", { name: "Command palette" });
  await palette.getByRole("option", { name: /Work clips/ }).click();
  await page.getByRole("button", { name: "Exit saved search Work clips" }).click();
  await expect(page.getByTestId("saved-view-bar")).toHaveCount(0);
  await expect(page.getByLabel("Search clipboard history")).toHaveText("tag:work kind:text");

  viewsMenu = await openPickerOverflow(page);
  await viewsMenu.getByRole("menuitem", { name: "Organize" }).click();
  await page.getByRole("menuitem", { name: "Saved searches…" }).click();
  palette = page.getByRole("dialog", { name: "Command palette" });
  await expect(palette).toBeVisible();
  await expect(palette.getByText("Saved searches", { exact: true })).toBeVisible();
  await expect(palette.getByRole("option", { name: /Work clips/ })).toBeVisible();
  const captureArms = await page.evaluate(() =>
    (window as any).__copicuTestInvocations.filter((call: any) => call.cmd === "arm_capture_tag_context").length,
  );
  expect(captureArms).toBe(0);
});
test("picker saves the current search as a saved search from the Organize menu", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page);

  const search = page.getByLabel("Search clipboard history");
  await search.fill("kind:image after:7d");
  const menu = await openPickerOverflow(page);
  await menu.getByRole("menuitem", { name: "Organize" }).click();
  await page.getByRole("menuitem", { name: "Save current search" }).click();

  const creator = page.getByRole("dialog", { name: "Save current search" });
  await expect(creator.getByRole("code")).toHaveText("kind:image after:7d");
  await creator.getByLabel("Saved search name").fill("Recent images");
  await creator.getByRole("button", { name: "Save search" }).click();
  await expect(creator).toBeHidden();

  const savedSearchMenu = await openPickerOverflow(page);
  await savedSearchMenu.getByRole("menuitem", { name: "Organize" }).click();
  await page.getByRole("menuitem", { name: "Saved searches…" }).click();
  await expect(page.getByRole("dialog", { name: "Command palette" }).getByRole("option", { name: /Recent images/ })).toBeVisible();
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
test("saved search access and identity fit the narrow picker", async ({ page }) => {
  await page.setViewportSize({ width: 420, height: 640 });
  await mockTauriInvoke(page);
  await gotoShell(page);

  const menu = await openPickerOverflow(page);
  await menu.getByRole("menuitem", { name: "Organize" }).click();
  await page.getByRole("menuitem", { name: "Saved searches…" }).click();
  await page.getByRole("dialog", { name: "Command palette" }).getByRole("option", { name: /Context clips/ }).click();
  const viewBar = page.getByTestId("saved-view-bar");
  await expect(viewBar).toContainText("Context clips");
  await expect(viewBar.getByRole("button", { name: "Exit saved search Context clips" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Capture here" })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(420);

  await viewBar.getByRole("button", { name: "Exit saved search Context clips" }).click();
  await expect(viewBar).toHaveCount(0);
});


test("direct header actions preserve search editing and apply at 420 px", async ({ page }) => {
  await page.setViewportSize({ width: 420, height: 640 });
  await mockTauriInvoke(page, syntheticLongHistory, null, { searchTriggerMode: "enter" });
  await gotoShell(page);
  await waitForDefaultHistoryReady(page);

  const search = page.getByLabel("Search clipboard history");
  await search.fill("unbroken");
  await expect(page.getByRole("group", { name: /COPICU_SYNTH_MARKDOWN/ })).toBeVisible();
  await page.getByRole("button", { name: "Apply search", exact: true }).click();
  await expect(page.locator(".feed-item")).toHaveCount(1);
  await expect(page.getByRole("group", { name: /COPICU_SYNTH_LONG_UNBROKEN/ })).toBeVisible();

  await page.getByRole("button", { name: "Search mode, switch to AI mode", exact: true }).click();
  await expect(page.locator(".search-row.is-ai-mode")).toBeVisible();
  const searchWidth = await page.locator(".search-field").evaluate((element) => element.getBoundingClientRect().width);
  expect(searchWidth).toBeGreaterThan(280);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(420);
  await page.getByRole("button", { name: "AI mode, switch to search mode", exact: true }).click();
  await expect(search).toHaveText("unbroken");

  await page.getByRole("button", { name: "Open search and AI help", exact: true }).click();
  await expect(page.locator(".search-help-panel")).toBeVisible();
});

test("direct search controls keep disjoint geometry and keyboard access across picker widths", async ({ page }) => {
  await mockTauriInvoke(page, syntheticLongHistory, null, { searchTriggerMode: "enter" });
  await gotoShell(page);
  await waitForDefaultHistoryReady(page);

  const search = page.getByLabel("Search clipboard history");
  await expect(page.locator(".search-filter-strip")).toBeVisible();
  await search.fill("in:content work");
  await expect(page.locator(".search-filter-strip")).toBeVisible();
  const apply = page.getByRole("button", { name: "Apply search" });
  await expect(apply).toBeVisible();
  await expect(apply).toBeEnabled();

  const boxes = await page.locator(".search-row").evaluate((row) => {
    const selectors = {
      selection: ".selection-menu-button",
      create: ".new-item-button",
      mode: ".composer-mode-button",
      trigger: ".search-trigger-button",
      help: ".search-help-button",
      search: ".search-field",
      apply: ".composer-run-button",
      status: ".search-status",
      marks: ".mark-menu-button",
      menu: ".picker-menu-button",
    } as const;
    const readRect = (selector: string) => {
      const element = row.querySelector<HTMLElement>(selector);
      if (!element) return null;
      if (getComputedStyle(element).clipPath !== "none") return null;
      const rect = element.getBoundingClientRect();
      return {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      };
    };
    const rowRect = row.getBoundingClientRect();
    const queryRange = document.createRange();
    queryRange.selectNodeContents(row.querySelector(".cm-line")!);
    const queryText = queryRange.getBoundingClientRect();
    return {
      row: { left: rowRect.left, right: rowRect.right },
      queryTextRight: queryText.right,
      filterLock: readRect(".filter-lock-button")!,
      filterClear: readRect(".filter-clear-button")!,
      controls: Object.fromEntries(
        Object.entries(selectors).map(([name, selector]) => [name, readRect(selector)]),
      ),
    };
  });
  expect(boxes.queryTextRight).toBeLessThanOrEqual(boxes.filterLock.left);
  expect(boxes.filterLock.right).toBeLessThanOrEqual(boxes.filterClear.left);
  expect(boxes.filterClear.right).toBeLessThanOrEqual(boxes.controls.search!.right);
  if (page.viewportSize()!.width > 760) {
    expect(boxes.controls.selection!.right).toBeLessThanOrEqual(boxes.controls.search!.left);
  } else {
    expect(boxes.controls.selection!.right).toBeLessThanOrEqual(boxes.controls.create!.left);
  }
  if (page.viewportSize()!.width <= 420) {
    expect(boxes.controls.search!.width).toBeGreaterThan(boxes.row.right - boxes.row.left - 32);
    expect(boxes.controls.search!.bottom).toBeLessThanOrEqual(boxes.controls.create!.top);
  }
  const visibleBoxes = Object.entries(boxes.controls)
    .filter((entry): entry is [string, NonNullable<typeof entry[1]>] => entry[1] !== null && entry[1].width > 1)
    .sort(([, left], [, right]) => left.left - right.left);
  expect(visibleBoxes.map(([name]) => name)).toEqual(expect.arrayContaining([
    "selection", "search", "create", "mode", "trigger", "help", "apply", "marks", "menu",
  ]));
  for (const [, box] of visibleBoxes) {
    expect(box.left).toBeGreaterThanOrEqual(boxes.row.left - 1);
    expect(box.right).toBeLessThanOrEqual(boxes.row.right + 1);
  }
  for (let index = 0; index < visibleBoxes.length; index += 1) {
    for (let nextIndex = index + 1; nextIndex < visibleBoxes.length; nextIndex += 1) {
      const current = visibleBoxes[index][1];
      const next = visibleBoxes[nextIndex][1];
      const intersects = current.left < next.right
        && current.right > next.left
        && current.top < next.bottom
        && current.bottom > next.top;
      expect(intersects, visibleBoxes[index][0] + " overlaps " + visibleBoxes[nextIndex][0]).toBe(false);
    }
  }
  await page.locator(".selection-menu-button").focus();
  await page.keyboard.press("Tab");
  await expect(search).toBeFocused();

  for (const locator of [search, apply, page.getByRole("button", { name: "Open picker menu" })]) {
    await locator.focus();
    await expect(locator).toBeFocused();
  }

  const menuButton = page.getByRole("button", { name: "Open picker menu" });
  await menuButton.focus();
  await page.keyboard.press("Enter");
  await expect(menuButton).toHaveAttribute("aria-expanded", "true");
  const menu = page.getByRole("menu", { name: "Picker menu" });
  await expect(menu.getByRole("menuitem", { name: "Switch to AI mode" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menuButton).toHaveAttribute("aria-expanded", "false");
});

test("delayed initial cannot steal foreground ownership or replay a stale query", async ({ page }) => {
  test.slow();
  await mockTauriInvoke(page, syntheticLongHistory, null, {
    historySearchDelaySequenceMs: [500, 800, 0],
  });
  await gotoShell(page);

  await page.waitForFunction(() =>
    (window as any).__copicuTestInvocations.some(
      (call: any) => call.cmd === "history_search" && call.args.request.query === "",
    ),
  );
  const search = page.getByLabel("Search clipboard history");
  await search.fill("unbroken");
  await page.waitForFunction(() =>
    (window as any).__copicuTestInvocations.some(
      (call: any) => call.cmd === "history_search" && call.args.request.query === "unbroken",
    ),
  );
  await page.waitForFunction(() => (window as any).__copicuTestHistoryResponses.length >= 1);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));

  await expect(page.locator("[title='Result count']")).toHaveText("1 / 4 matches", { timeout: 5000 });
  const requestQueries = await page.evaluate(() =>
    (window as any).__copicuTestInvocations
      .filter((call: any) => call.cmd === "history_search")
      .map((call: any) => call.args.request.query),
  );
  expect(requestQueries.at(-1)).toBe("unbroken");
  await expect(search).toHaveText("unbroken");
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

test("saved search management stays independent from capture modes", async ({ page }) => {
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
  await expect(savedViews.getByLabel("Pin search")).toBeChecked();
  await savedViews.getByLabel("Query").fill("tag:work");
  await savedViews.getByRole("button", { name: "Save search" }).click();

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
    { id: 1, name: "Focused writing", query: "tag:work kind:text" },
    { id: 2, name: "Internal review", query: "tag:work kind:text" },
  ]);
});

test("settings manages capture modes independently, then activates, switches, and stops", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page, "/?window=settings");

  await page.getByRole("tab", { name: /Capture modes/ }).click();
  const scenarios = page.getByTestId("scenario-settings");
  await expect(scenarios).toContainText("Capture modes are workspaces for the picker");
  await expect(scenarios).toContainText("Focused writing");
  const savedViewsBefore = await page.evaluate(() =>
    JSON.stringify((window as any).__copicuTestSavedHistoryViews),
  );

  await scenarios.getByRole("button", { name: "New capture mode" }).click();
  await expect(scenarios.getByText("All capture modes")).toBeVisible();
  await page.getByLabel("Capture mode name").fill("QA review");
  await page.getByLabel("Capture mode query").fill("tag:qa");
  await scenarios.getByRole("button", { name: "Create capture mode" }).click();
  await expect(scenarios).toContainText("QA review");

  const qaRow = scenarios.locator(".scenario-row").filter({ hasText: "QA review" });
  await qaRow.getByRole("button", { name: "Edit" }).click();
  await expect(scenarios.locator(".scenario-list")).toHaveCount(0);
  await page.getByLabel("Capture mode query").fill("tag:qa kind:text");
  await scenarios.getByRole("button", { name: "Save changes" }).click();
  await expect(qaRow).toContainText("tag:qa kind:text");
  expect(await page.evaluate(() => JSON.stringify((window as any).__copicuTestSavedHistoryViews)))
    .toBe(savedViewsBefore);
  await qaRow.getByRole("button", { name: "Delete" }).click();
  await expect(qaRow).toHaveCount(0);
  expect(await page.evaluate(() => JSON.stringify((window as any).__copicuTestSavedHistoryViews)))
    .toBe(savedViewsBefore);

  const writingRow = scenarios.locator(".scenario-row").filter({ hasText: "Focused writing" });
  await writingRow.getByRole("button", { name: "Activate" }).click();
  await expect(scenarios.locator(".scenario-session-summary")).toContainText("Focused writing");

  const internalRow = scenarios.locator(".scenario-row").filter({ hasText: "Internal review" });
  await internalRow.getByRole("button", { name: "Activate" }).click();
  await expect(scenarios.locator(".scenario-session-summary")).toContainText("Internal review");

  await scenarios.getByRole("button", { name: "Stop capture mode" }).click();
  await expect(scenarios.locator(".scenario-session-summary")).toContainText("None active");
});

test("picker capture mode menu supports Alt+S, switching, and Stop at narrow width", async ({ page }) => {
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
  await menu.getByRole("menuitem", { name: "Organize" }).click();
  await expect(page.getByRole("menuitem", { name: /Internal review/ })).toBeVisible();
  await page.getByRole("menuitem", { name: /Internal review/ }).click();
  await expect(menu).toBeHidden();
  await expect(page.getByTestId("scenario-session-bar")).toContainText("Internal review");
  await expect(page.getByTestId("saved-view-bar")).toHaveCount(0);
  await expect(page.getByLabel("Search clipboard history")).toHaveText("tag:work kind:text");

  const switchMenu = await openPickerOverflow(page);
  await switchMenu.getByRole("menuitem", { name: "Organize" }).click();
  await page.getByRole("menuitem", { name: /Focused writing/ }).click();
  await expect(page.getByTestId("scenario-session-bar")).toContainText("Focused writing");

  await openPickerOverflow(page);
  await expect(page.getByRole("menu", { name: "Picker menu" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu", { name: "Picker menu" })).toBeHidden();

  const stopMenu = await openPickerOverflow(page);
  await stopMenu.getByRole("menuitem", { name: "Organize" }).click();
  await page.getByRole("menuitem", { name: "Stop capture mode" }).click();
  await expect(page.getByRole("menu", { name: "Picker menu" })).toBeHidden();

  const manageMenu = await openPickerOverflow(page);
  await manageMenu.getByRole("menuitem", { name: "Organize" }).click();
  await page.getByRole("menuitem", { name: "Manage capture modes" }).click();
  await page.waitForFunction(() =>
    (window as any).__copicuTestInvocations.some((call: any) => call.cmd === "open_scenario_settings"),
  );
});

test("switching to an edited capture mode applies its updated picker view", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page);

  await page.evaluate(async () => {
    await (window as any).__TAURI_INTERNALS__.invoke("update_scenario", {
      request: {
        id: 2,
        name: "Internal review",
        query: "tag:context-smoke",
        tags: [],
      },
    });
  });

  const search = page.getByLabel("Search clipboard history");
  await search.press("Alt+s");
  const menu = page.getByRole("menu", { name: "Picker menu" });
  await menu.getByRole("menuitem", { name: "Organize" }).click();
  await page.getByRole("menuitem", { name: /Focused writing/ }).click();
  await expect(menu).toBeHidden();
  await expect(search).toHaveText("tag:work kind:text");

  await search.press("Alt+s");
  const nextMenu = page.getByRole("menu", { name: "Picker menu" });
  await nextMenu.getByRole("menuitem", { name: "Organize" }).click();
  await page.getByRole("menuitem", { name: /Internal review/ }).click();
  await expect(search).toHaveText("tag:context-smoke");
  await expect(page.getByTestId("scenario-session-bar")).toContainText("Internal review");
});
test("picker creates and activates a capture mode from the current query", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page);

  const search = page.getByLabel("Search clipboard history");
  await search.fill("#111");
  await expect(search).toHaveText("#111");
  await search.press("Alt+s");
  const menu = page.getByRole("menu", { name: "Picker menu" });
  await menu.getByRole("menuitem", { name: "Organize" }).click();
  await page.getByRole("menuitem", { name: "Create capture mode" }).click();
  const creator = page.getByRole("dialog", { name: "Create capture mode" });
  await expect(creator.getByRole("code")).toHaveText("#111");
  await expect(creator.getByRole("button", { name: "Remove tag 111" })).toBeVisible();
  await creator.getByLabel("New capture mode name").fill("Writing session");
  await creator.getByRole("button", { name: "Save and activate" }).click();

  await expect(creator).toBeHidden();
  await expect(page.getByTestId("scenario-session-bar")).toContainText("Writing session");
  await expect(search).toHaveText("#111");
  await page.waitForFunction(() =>
    (window as any).__copicuTestInvocations.some(
      (call: any) => call.cmd === "create_scenario_from_query"
        && call.args.request.query === "#111"
        && call.args.request.tags.length === 1
        && call.args.request.tags[0] === "111",
    ),
  );
});
test("> scenario activates as an action and restores the capture mode query", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page);

  const search = page.getByLabel("Search clipboard history");
  await search.fill("> scenario Internal");
  const actions = page.locator(".cm-tooltip-autocomplete");
  await expect(actions.getByRole("option", { name: "Activate capture mode: Internal review" })).toBeVisible();
  // CodeMirror protects newly opened completions from Enter for 75 ms.
  await page.waitForTimeout(100);
  await search.press("Enter");
  await expect(search).toHaveText("tag:work kind:text");
  await expect(page.getByTestId("scenario-session-bar")).toContainText("Internal review");
  await expect(actions).toHaveCount(0);
});
test("active capture mode remains visible through picker hide and reopen until Stop", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page);

  await page.evaluate(async () => {
    await (window as any).__TAURI_INTERNALS__.invoke("activate_scenario", { id: 1 });
  });
  const sessionBar = page.getByTestId("scenario-session-bar");
  await expect(sessionBar).toContainText("Focused writing");
  await expect(sessionBar).toContainText("#Work");
  await expect(page.getByLabel("Search clipboard history")).toHaveText("tag:work kind:text");

  await page.evaluate(async () => {
    const session = await (window as any).__TAURI_INTERNALS__.invoke("get_active_scenario_session");
    await (window as any).__copicuTestEmitEvent("copicu://scenario/session-changed", session);
  });
  await expect(sessionBar).toContainText("Capture mode active");
  await expect(page.getByLabel("Search clipboard history")).toHaveText("tag:work kind:text");

  await sessionBar.getByRole("button", { name: "Stop" }).click();
  await expect(sessionBar).toHaveCount(0);
  await expect(page.getByLabel("Search clipboard history")).toHaveText("tag:work kind:text");
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

test("selection menu stays transient and independent from persistent marks", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page);

  let menu = await openSelectionMenu(page);
  const selectVisible = menu.getByRole("menuitem", { name: "Select 4 loaded clips", exact: true });
  const clearSelection = menu.getByRole("menuitem", { name: "Clear selection", exact: true });
  await expect(selectVisible).toBeEnabled();
  await expect(clearSelection).toBeDisabled();
  await selectVisible.click();

  const trigger = page.locator(".selection-menu-button");
  await expect(trigger).toHaveAccessibleName("Open selected clips menu, 4 selected");
  await expect(page.getByLabel("Deselect item")).toHaveCount(4);

  menu = await openSelectionMenu(page);
  await expect(menu.getByRole("menuitem", { name: "Join selected", exact: true })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "join-selected-with-log-name" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Edit tags for selected" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Edit metadata for selected", exact: true })).toBeVisible();
  await expect(menu.getByText("Change marks for selection", { exact: true })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Add 4 selected clips to marks", exact: true })).toBeEnabled();
  await expect(menu.getByRole("menuitem", { name: "Remove 0 selected clips from marks", exact: true })).toBeDisabled();
  await expect(menu.getByRole("menuitem", { name: "Delete 4 selected", exact: true })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Select 4 loaded clips", exact: true })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Clear selection", exact: true })).toBeVisible();

  await menu.getByRole("menuitem", { name: "Add 4 selected clips to marks", exact: true }).click();
  await expect(page.getByLabel("Unmark item")).toHaveCount(4);
  await expect(page.locator(".mark-menu-count")).toHaveText("4");
  menu = await openSelectionMenu(page);
  await expect(menu.getByRole("menuitem", { name: "Remove 4 selected clips from marks", exact: true })).toBeEnabled();
  await expect(menu.getByRole("menuitem", { name: "Add 0 selected clips to marks", exact: true })).toBeDisabled();

  await menu.getByRole("menuitem", { name: "Clear selection", exact: true }).click();
  await expect(trigger).toHaveAccessibleName("Open selected clips menu, 0 selected");
  await expect(page.getByLabel("Select item")).toHaveCount(4);
  await expect(page.getByLabel("Unmark item")).toHaveCount(4);

  // Shift and Ctrl retain the established range/toggle selection semantics.
  const rows = page.locator(".feed-item");
  await rows.nth(0).click();
  await rows.nth(2).click({ modifiers: ["Shift"] });
  await expect(trigger).toHaveAccessibleName("Open selected clips menu, 3 selected");
  await rows.nth(1).click({ modifiers: ["Control"] });
  await expect(trigger).toHaveAccessibleName("Open selected clips menu, 2 selected");
  await expect(page.getByLabel("Deselect item")).toHaveCount(2);
});


test("mixed selection has counted explicit add and remove marks without changing selection", async ({ page }) => {
  await mockTauriInvoke(page, syntheticLongHistory.map((item, index) => ({ ...item, is_marked: index < 2 })));
  await gotoShell(page);
  let menu = await openSelectionMenu(page);
  await menu.getByRole("menuitem", { name: "Select 4 loaded clips", exact: true }).click();
  menu = await openSelectionMenu(page);
  await expect(menu.getByRole("menuitem", { name: "Add 2 selected clips to marks", exact: true })).toBeEnabled();
  await menu.getByRole("menuitem", { name: "Remove 2 selected clips from marks", exact: true }).click();
  await expect(page.locator(".mark-menu-count")).toHaveText("0");
  await expect(page.locator(".selection-menu-count")).toHaveText("4");
  menu = await openSelectionMenu(page);
  await menu.getByRole("menuitem", { name: "Add 4 selected clips to marks", exact: true }).click();
  await expect(page.locator(".mark-menu-count")).toHaveText("4");
  await expect(page.locator(".selection-menu-count")).toHaveText("4");
  const mutations = await page.evaluate(() => (window as MetadataVisualRuntime).__copicuTestInvocations
    ?.filter(({ cmd }) => cmd === "set_history_items_marked").map(({ args }) => args.request));
  expect(mutations).toEqual([
    { ids: syntheticLongHistory.slice(0, 2).map(({ id }) => id), marked: false },
    { ids: syntheticLongHistory.map(({ id }) => id), marked: true },
  ]);
});

test("automatic refresh preserves surviving selected IDs and removes deleted ones", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page);
  await page.locator(".feed-item").nth(0).hover();
  await page.getByLabel("Select item", { exact: true }).first().click();
  await page.locator(".feed-item").nth(1).hover();
  await page.getByLabel("Select item", { exact: true }).first().click();
  await expect(page.locator(".selection-menu-count")).toHaveText("2");
  await page.evaluate(async () => {
    const state = window as any;
    state.__copicuTestHistoryItems = state.__copicuTestHistoryItems.filter((item: any) => item.id !== state.__copicuTestHistoryItems[0].id);
    state.__copicuTestHistoryItems[0].title = "SYNTH_REFRESH_SURVIVOR";
    await state.__copicuTestEmitEvent("copicu://history/changed", { itemId: state.__copicuTestHistoryItems[0].id, contentKind: "text" });
  });
  await expect(page.getByText("SYNTH_REFRESH_SURVIVOR", { exact: true })).toBeVisible();
  await expect(page.locator(".selection-menu-count")).toHaveText("1");
  await expect(page.getByLabel("Deselect item", { exact: true })).toHaveCount(1);
});

test("automatic refresh at the top preserves selected clips from later loaded pages", async ({ page }) => {
  await mockTauriInvoke(page, syntheticPagedHistory);
  await gotoShell(page);
  const feed = page.locator(".history-feed-scroll");
  await expect.poll(async () => {
    await feed.evaluate((element) => { element.scrollTop = element.scrollHeight; });
    return page.getByRole("group", { name: /COPICU_SYNTH_PAGE_80/ }).count();
  }).toBe(1);
  let menu = await openSelectionMenu(page);
  await menu.getByRole("menuitem", { name: "Select 80 loaded clips", exact: true }).click();
  await feed.evaluate((element) => { element.scrollTop = 0; });
  await expect(page.locator(".selection-menu-count")).toHaveText("80");
  await page.evaluate(async () => {
    const state = window as any;
    state.__copicuTestHistoryItems.pop();
    state.__copicuTestHistoryItems[0].title = "SYNTH_PAGED_REFRESH";
    await state.__copicuTestEmitEvent("copicu://history/changed", { itemId: state.__copicuTestHistoryItems[0].id, contentKind: "text" });
  });
  await expect(page.getByText("SYNTH_PAGED_REFRESH", { exact: true })).toBeVisible();
  await expect(page.locator(".selection-menu-count")).toHaveText("79");
  expect(await feed.evaluate((element) => element.scrollTop)).toBe(0);
  menu = await openSelectionMenu(page);
  await expect(menu.getByRole("menuitem", { name: "Select 79 loaded clips", exact: true })).toBeVisible();
});

for (const query of ["is:marked", "tag:working"]) {
  test(`retained refresh evicts existing selected clips that leave ${query}`, async ({ page }) => {
    await mockTauriInvoke(page, syntheticPagedHistory.map((item) => ({ ...item, is_marked: true, tags: "#working" })));
    await gotoShell(page);
    await page.getByLabel("Search clipboard history").fill(query);
    await expect(page.locator("[title='Result count']")).toHaveText("80 clips");
    const feed = page.locator(".history-feed-scroll");
    await expect.poll(async () => {
      await feed.evaluate((element) => { element.scrollTop = element.scrollHeight; });
      return page.getByRole("group", { name: /COPICU_SYNTH_PAGE_80/ }).count();
    }).toBe(1);
    const menu = await openSelectionMenu(page);
    await menu.getByRole("menuitem", { name: "Select 80 loaded clips", exact: true }).click();
    const scrollBefore = await feed.evaluate((element) => element.scrollTop);
    const removedId = await page.evaluate(async (filter) => {
      const state = window as any;
      const lost = state.__copicuTestHistoryItems[0];
      if (filter === "is:marked") lost.is_marked = false;
      else lost.tags = "";
      await state.__copicuTestEmitEvent("copicu://history/changed", { itemId: lost.id, contentKind: "text" });
      return lost.id;
    }, query);
    await expect(page.locator(`#history-item-${removedId}`)).toHaveCount(0);
    await expect(page.locator(".selection-menu-count")).toHaveText("79");
    const refreshedMenu = await openSelectionMenu(page);
    await expect(refreshedMenu.getByRole("menuitem", { name: "Select 79 loaded clips", exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    expect(await feed.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    expect(Math.abs((await feed.evaluate((element) => element.scrollTop)) - scrollBefore)).toBeLessThan(250);
    expect(await page.evaluate((id) => (window as any).__copicuTestHistoryItems.some((item: any) => item.id === id), removedId)).toBe(true);
  });
}

test("mark mutation retains all loaded selected clips beyond page one", async ({ page }) => {
  await mockTauriInvoke(page, syntheticPagedHistory);
  await gotoShell(page);
  const feed = page.locator(".history-feed-scroll");
  await expect.poll(async () => {
    await feed.evaluate((element) => { element.scrollTop = element.scrollHeight; });
    return page.getByRole("group", { name: /COPICU_SYNTH_PAGE_80/ }).count();
  }).toBe(1);
  let menu = await openSelectionMenu(page);
  await menu.getByRole("menuitem", { name: "Select 80 loaded clips", exact: true }).click();
  await feed.evaluate((element) => { element.scrollTop = 0; });
  for (const command of ["Add 80 selected clips to marks", "Remove 80 selected clips from marks"]) {
    menu = await openSelectionMenu(page);
    await menu.getByRole("menuitem", { name: command, exact: true }).click();
    await expect(page.locator(".mark-menu-count")).toHaveText(command.startsWith("Add") ? "80" : "0");
    await expect(page.locator(".selection-menu-count")).toHaveText("80");
    await expect.poll(async () => page.evaluate(() => (window as any).__copicuTestInvocations
      .filter((call: any) => call.cmd === "get_history_items_preview").length)).toBeGreaterThan(0);
    menu = await openSelectionMenu(page);
    await expect(menu.getByRole("menuitem", { name: "Select 80 loaded clips", exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    expect(await feed.evaluate((element) => element.scrollTop)).toBe(0);
  }
  await expect(page.locator(".mark-menu-count")).toHaveText("0");
});

test("persistent marks scope stays keyboard accessible without narrow overflow", async ({ page }) => {
  await mockTauriInvoke(page, syntheticLongHistory.map((item) => ({ ...item, is_marked: true })));
  await gotoShell(page);
  await page.getByLabel("Search clipboard history").fill("markdown");
  await expect(page.locator("[title='Result count']")).toHaveText("1 / 4 matches");
  const trigger = page.getByRole("button", { name: /^Open marked clips menu/ });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const menu = page.getByRole("menu", { name: "Marked clips", exact: true });
  await expect(menu.getByRole("note")).toContainText("including 3 outside loaded results");
  await expect(menu.getByText("Marks persist across searches, hide and restart. Removing marks never deletes clips.", { exact: true })).toBeVisible();
  const bounds = await menu.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  expect(await menu.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
});

test("selection menu disables visible selection when history is empty", async ({ page }) => {
  await mockTauriInvoke(page, []);
  await gotoShell(page);

  await expect(page.locator(".history-feed.has-items")).toHaveCount(0);
  const menu = await openSelectionMenu(page);
  await expect(menu.getByRole("menuitem", { name: "Select 0 loaded clips", exact: true })).toBeDisabled();
  await expect(menu.getByRole("menuitem", { name: "Clear selection", exact: true })).toBeDisabled();
});

test("mark menu marks visible and individual items", async ({ page }) => {
  await mockTauriInvoke(page, syntheticLongHistory, null, {
    appearance: { itemActions: "inline" },
  });
  await gotoShell(page);

  const menu = await openMarksMenu(page);
  await menu.getByRole("menuitem", { name: "Mark 4 loaded clips", exact: true }).click();
  await expect(page.getByLabel("Unmark item")).toHaveCount(4);
  await expect(page.locator(".mark-menu-count")).toHaveText("4");

  await page.getByLabel("Unmark item").first().click();
  await expect(page.getByLabel("Unmark item")).toHaveCount(3);
  await expect(page.getByLabel("Mark item", { exact: true })).toHaveCount(1);
  await expect(page.locator(".mark-menu-count")).toHaveText("3");
});

test("marked menu supports keyboard focus and filtering", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page);

  const trigger = page.getByRole("button", { name: /^Open marked clips menu/ });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const menu = page.getByRole("menu", { name: "Marked clips", exact: true });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Mark 4 loaded clips", exact: true })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Unmark 4 loaded clips", exact: true })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Mark all 4 matching clips", exact: true })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Unmark all 4 matching clips", exact: true })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Show marked clips", exact: true })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Show unmarked clips", exact: true })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Show all history", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await openPickerOverflow(page);
  await trigger.click();
  await expect(page.getByRole("menu", { name: "Picker menu" })).not.toBeVisible();
  await expect(menu).toBeVisible();

  await menu.getByRole("menuitem", { name: "Show all history", exact: true }).click();
  await expect(page.locator("[title='Result count']")).toHaveText("4 total");

  await openMarksMenu(page);
  await menu.getByRole("menuitem", { name: "Show marked clips", exact: true }).click();
  await expect(page.getByLabel("Search clipboard history")).toHaveText("is:marked");
  await expect(page.locator("[title='Result count']")).not.toHaveText("Filtering");
});

test("marked header count and batch actions include clips outside the current filter", async ({ page }) => {
  await mockTauriInvoke(page, syntheticLongHistory, null, {
    historySearchDelayMs: 180,
    appearance: { itemActions: "inline" },
  });
  await gotoShell(page);

  const counter = page.getByRole("button", { name: /^Open marked clips menu/ }).locator(".mark-menu-count");
  await expect(counter).toHaveText("0");
  await page.locator(".feed-item").first().hover();
  await page.getByLabel("Mark item").first().click();
  await expect(counter).toHaveText("1");

  await page.getByLabel("Search clipboard history").fill("unbroken");
  await expect(page.locator("[title='Result count']")).toHaveText("1 / 4 matches");
  await expect(counter).toHaveText("1");
  let marksMenu = await openMarksMenu(page);
  await marksMenu.getByRole("menuitem", { name: "Mark 1 loaded clip", exact: true }).click();
  await expect(counter).toHaveText("2");

  await page.getByLabel("Search clipboard history").fill("");
  await expect(page.locator("[title='Result count']")).toHaveText("4 total");
  marksMenu = await openMarksMenu(page);
  await marksMenu.getByRole("menuitem", { name: "Mark 4 loaded clips", exact: true }).click();
  await expect(counter).toHaveText("4");

  await page.getByLabel("Search clipboard history").fill("markdown");
  await expect(page.locator("[title='Result count']")).toHaveText("1 / 4 matches");
  await expect(counter).toHaveText("4");
  marksMenu = await openMarksMenu(page);
  await expect(marksMenu.getByText("Actions for marked clips")).toBeVisible();
  await expect(marksMenu.getByText("4 marked total · 1 in loaded results", { exact: true })).toBeVisible();
  await expect(marksMenu.getByRole("note")).toHaveText("All 4 marked clips, including 3 outside loaded results. Applies to metadata, actions and delete.");
  await expect(page.locator(".selection-menu-count")).toHaveText("0");
  await expect(marksMenu.getByRole("menuitem", { name: "Join marked" })).toBeVisible();
  await expect(marksMenu.getByRole("menuitem", { name: "join-selected-with-log-name" })).toBeVisible();
  const editTags = marksMenu.getByRole("menuitem", { name: "Edit tags for marked" });
  await expect(editTags).toBeEnabled();
  await expect(marksMenu.getByRole("menuitem", { name: "Delete 4 marked clips", exact: true })).toBeVisible();

  await marksMenu.getByRole("menuitem", { name: "Show marked clips", exact: true }).focus();
  await page.keyboard.press("e");
  await expect(editTags).toBeFocused();
  await page.keyboard.press("Enter");
  await expect.poll(async () => new Set(await page.evaluate(() => {
    const calls = (window as MetadataVisualRuntime).__copicuTestInvocations ?? [];
    return calls.filter(({ cmd }) => cmd === "open_metadata_window").at(-1)?.args.request?.itemIds;
  }))).toEqual(new Set(syntheticLongHistory.map(({ id }) => id)));
});

test("marked batch commands wait for every global page before enabling metadata and delete", async ({ page }) => {
  await mockTauriInvoke(page, syntheticPagedHistory.map((item) => ({ ...item, is_marked: true })), null, {
    historyPageSizeOverride: 2,
    historySearchDelayMs: 30,
  });
  await gotoShell(page);
  await expect(page.locator(".mark-menu-count")).toHaveText("80");
  await page.getByLabel("Search clipboard history").fill("COPICU_SYNTH_PAGE_80");
  await expect(page.locator("[title='Result count']")).toHaveText("1 / 80 matches");
  const menu = await openMarksMenu(page);
  await expect(menu.getByRole("note")).toHaveText("Loading all marked clips before enabling actions…");
  await expect(menu.getByRole("menuitem", { name: "Edit metadata for marked", exact: true })).toHaveCount(0);
  await expect(menu.getByRole("menuitem", { name: "Delete 80 marked clips", exact: true })).toHaveCount(0);
  await expect(menu.getByRole("note")).toHaveText("All 80 marked clips, including 79 outside loaded results. Applies to metadata, actions and delete.");
  await expect(menu.getByRole("menuitem", { name: "Delete 80 marked clips", exact: true })).toBeEnabled();
  await menu.getByRole("menuitem", { name: "Edit metadata for marked", exact: true }).click();
  await expect.poll(async () => new Set(await page.evaluate(() => {
    const calls = (window as MetadataVisualRuntime).__copicuTestInvocations ?? [];
    return calls.filter(({ cmd }) => cmd === "open_metadata_window").at(-1)?.args.request?.itemIds;
  }))).toEqual(new Set(syntheticPagedHistory.map(({ id }) => id)));
});

test("marked menu deletes every marked clip, including clips outside the current filter", async ({ page }) => {
  await mockTauriInvoke(page, syntheticLongHistory);
  await gotoShell(page);

  let marksMenu = await openMarksMenu(page);
  await marksMenu.getByRole("menuitem", { name: "Mark 4 loaded clips", exact: true }).click();
  await page.getByLabel("Search clipboard history").fill("markdown");
  await expect(page.locator("[title='Result count']")).toHaveText("1 / 4 matches");

  marksMenu = await openMarksMenu(page);
  await marksMenu.getByRole("menuitem", { name: "Delete 4 marked clips", exact: true }).click();

  await expect.poll(async () => page.evaluate(() =>
    (window as MetadataVisualRuntime).__copicuTestInvocations
      ?.filter(({ cmd }) => cmd === "delete_history_item")
      .map(({ args }) => args.id),
  )).toEqual(syntheticLongHistory.map(({ id }) => id));
  await expect(page.locator(".mark-menu-count")).toHaveText("0");
  await expect(page.locator(".history-feed.has-items")).toHaveCount(0);
});

test("long synthetic history stays contained", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page);

  await expect(
    page.getByRole("group", { name: /COPICU_SYNTH_LONG_UNBROKEN/ }),
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
  await mockTauriInvoke(page, syntheticLongHistory, null, { historySearchDelayMs: 900 });
  await gotoShell(page);

  const skeletonRow = page.locator(".history-skeleton-row").first();
  await expect(page.locator(".history-skeleton-row")).toHaveCount(4, { timeout: 2000 });
  await expect(skeletonRow).toBeVisible();
  const skeleton = await skeletonRow.evaluate((row) => {
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
  await expect(page.locator(".history-skeleton-row")).toHaveCount(0, { timeout: 3000 });
  await expect(page.getByRole("group", { name: /COPICU_SYNTH_LONG_UNBROKEN/ })).toBeVisible();
});

test("compact previews expose only real overflow and keep inline editing stable", async ({ page }) => {
  await mockTauriInvoke(page, syntheticCompactPreviewHistory);
  await gotoShell(page);

  const feedScroll = page.locator(".history-feed-scroll");
  const shortRow = page.locator("#history-item-1201");
  const longRow = page.locator("#history-item-1202");
  await expect(longRow).toBeVisible();
  await expect(shortRow.locator(".text-preview-overflow")).toHaveCount(0);
  expect(await feedScroll.evaluate((feed) => getComputedStyle(feed).scrollbarGutter)).toBe("stable");
  const imageDimensions = await page.locator(".image-preview img").evaluateAll((images) =>
    images.map((image) => ({
      width: image.getAttribute("width"),
      height: image.getAttribute("height"),
    })),
  );
  expect(imageDimensions).toEqual([
    { width: "72", height: "48" },
    { width: "120", height: "640" },
    { width: "920", height: "96" },
  ]);

  const expectedChars = Array.from(compactPreviewText).length;
  const overflow = longRow.locator(".text-preview-overflow");
  await expect(overflow).toHaveAttribute("aria-label", `${expectedChars} characters, 18 lines`);
  expect(await page.evaluate(() =>
    (window as any).__copicuTestInvocations.filter((entry: any) => entry.cmd === "get_history_item").length,
  )).toBe(0);
  await longRow.locator(".feed-item").click();
  const collapsedHeight = await longRow.evaluate((row) => row.getBoundingClientRect().height);
  const scrollBeforeExpand = await feedScroll.evaluate((feed) => feed.scrollTop);
  await overflow.getByRole("button", { name: "Show more" }).click();
  await page.waitForFunction(() =>
    (window as any).__copicuTestInvocations.filter((entry: any) => entry.cmd === "get_history_item").length === 1,
  );
  await expect(longRow.locator(".feed-item")).toHaveAttribute("aria-current", "true");
  await expect(overflow.getByRole("button", { name: "Show less" })).toBeVisible();
  expect(await longRow.evaluate((row) => row.getBoundingClientRect().height)).toBeGreaterThan(collapsedHeight);
  expect(await feedScroll.evaluate((feed) => feed.scrollTop)).toBe(scrollBeforeExpand);
  await overflow.getByRole("button", { name: "Show less" }).click();
  expect(await longRow.evaluate((row) => row.getBoundingClientRect().height)).toBeCloseTo(collapsedHeight, 0);

  await longRow.hover();
  await longRow.getByRole("button", { name: "Open item actions" }).click();
  await page.getByRole("menu", { name: "Item actions" }).getByRole("menuitem", { name: "Quick edit" }).click();
  const inlineEditor = longRow.getByRole("textbox", { name: "Quick edit item 1202" });
  await expect(inlineEditor).toBeFocused();
  await inlineEditor.fill("COPICU_INLINE_SAVED\nsecond line");
  await inlineEditor.press("Control+Enter");
  await expect(inlineEditor).toBeHidden();
  await expect(longRow.locator(".feed-item")).toHaveAttribute("aria-current", "true");
  await expect(longRow).toContainText("COPICU_INLINE_SAVED");
  await longRow.hover();
  await longRow.getByRole("button", { name: "Open item actions" }).click();
  await page.getByRole("menu", { name: "Item actions" }).getByRole("menuitem", { name: "Quick edit" }).click();
  await inlineEditor.fill("COPICU_INLINE_CANCELLED");
  await inlineEditor.press("Escape");
  await expect(inlineEditor).toBeHidden();
  await expect(longRow).toContainText("COPICU_INLINE_SAVED");
  await expect(longRow).not.toContainText("COPICU_INLINE_CANCELLED");

  for (const viewport of [
    { width: 900, height: 620, imageMaxHeight: 201 },
    { width: 420, height: 620, imageMaxHeight: 165 },
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
  await expect(verticalRow.locator(".feed-item")).toHaveAttribute("aria-current", "true");
  await verticalRow.getByRole("button", { name: "Zoom image", exact: true }).click();
  await page.waitForFunction(() =>
    (window as any).__copicuTestInvocations.some(
      (entry: any) => entry.cmd === "open_item_preview" && entry.args.request.itemId === 1204,
    ),
  );
  expect(await verticalRow.evaluate((row) => row.getBoundingClientRect().height)).toBe(heightBeforeSelection);
});

test("image double click activates the clip while the magnifier only opens preview", async ({ page }) => {
  const png = pngDataUrl(160, 90, "#245f53");
  await mockTauriInvoke(page, [
    { ...syntheticCompactPreviewHistory[2], id: 9301, width: 160, height: 90, thumbnail_data_url: png },
    { ...syntheticLongHistory[1], id: 9302, text: `Before ![Inline image](${png}) after`, title: null, notes: null, tags: null },
  ]);
  await gotoShell(page);
  const effects = () => page.evaluate(() => {
    // The test bootstrap owns these in-process invocation records.
    const runtime = window as Window & {
      __copicuTestInvocations: Array<{ cmd: string; args: { request?: { itemId?: number } } }>;
    };
    return runtime.__copicuTestInvocations
      .filter(({ cmd }) => cmd === "activate_item" || cmd === "open_item_preview")
      .map(({ cmd, args }) => ({ cmd, itemId: args.request?.itemId }));
  });
  const expectedEffects: Array<{ cmd: string; itemId: number }> = [];
  for (const id of [9301, 9302]) {
    const row = page.locator(`#history-item-${id}`);
    const image = row.locator("img");
    const zoom = row.getByRole("button", { name: "Zoom image", exact: true });
    await image.click();
    await expect(row.locator(".feed-item")).toHaveAttribute("aria-current", "true");
    expect(await effects()).toEqual(expectedEffects);
    await image.dblclick();
    expectedEffects.push({ cmd: "activate_item", itemId: id });
    await expect.poll(effects).toEqual(expectedEffects);
    // A real activation hides the picker. Reopen it before checking the zoom control.
    await page.waitForFunction(() => document.documentElement.dataset.pickerHistoryStale === "true");
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(row.locator(".feed-item")).toBeVisible();

    await page.getByLabel("Search clipboard history").hover();
    await expect(zoom).toHaveCSS("opacity", "0");
    if (id === 9301) {
      await image.hover();
      await expect(zoom).toHaveCSS("opacity", "1");
      await zoom.click();
    } else {
      await zoom.focus();
      await expect(zoom).toHaveCSS("opacity", "1");
      await zoom.press("Enter");
    }
    expectedEffects.push({ cmd: "open_item_preview", itemId: id });
    await expect.poll(effects).toEqual(expectedEffects);
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

  await expect(page.getByRole("group", { name: /COPICU_SYNTH_FULL_CONTENT_START/ })).toBeVisible();
  await expect(page.getByText("COPICU_SYNTH_FULL_CONTENT_END")).toHaveCount(0);

  const initialSearch = await page.waitForFunction(() => {
    const calls = (window as any).__copicuTestInvocations;
    return calls.find((call: any) => call.cmd === "history_search");
  });
  const initialSearchCall = await initialSearch.jsonValue() as any;
  expect(initialSearchCall.args.request.includeContent).toBe(false);
  await page.keyboard.press("F2");
  const contentEditor = page.getByRole("region", { name: "Edit clipboard item" });
  const contentInput = contentEditor.getByRole("textbox", { name: "Item content" });
  await contentInput.fill(`${fullText} edited`);
  await page.keyboard.press("Control+s");

  const updateCall = await page.waitForFunction(() => {
    const calls = (window as MetadataVisualRuntime).__copicuTestInvocations ?? [];
    return calls.find((call) => call.cmd === "apply_metadata_selection_intent");
  });
  const update = await updateCall.jsonValue() as unknown as { args: { intent: { content: { value: string } } } };
  expect(update.args.intent.content.value).toBe(`${fullText} edited`);
  expect(update.args.intent.content.value).toContain("COPICU_SYNTH_FULL_CONTENT_END");
  const getCalls = await page.evaluate(() =>
    (window as any).__copicuTestInvocations.filter((call: any) => call.cmd === "get_history_item"),
  );
  expect(getCalls).toHaveLength(1);
});

test("F2 unifies content and metadata while Ctrl+F2 and Shift+F2 keep focused routes", async ({ page }) => {
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
  await openItemSubmenu(page, "More actions");
  const externalMenuItem = page.getByRole("menuitem", { name: /Edit externally/ });
  await expect(externalMenuItem).toBeVisible();
  await expect(externalMenuItem.getByLabel("Ctrl+F2")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await expect(metadataMenuItem).toBeHidden();
  const firstItem = page.locator(".feed-item").first();
  await expect(firstItem).toBeFocused();

  await page.keyboard.press("F2");
  const contentEditor = page.getByRole("region", { name: "Edit clipboard item" });
  await expect(contentEditor).toBeVisible();
  await expect(contentEditor.getByRole("button", { name: "Save changes" })).toBeVisible();
  const metadataPane = contentEditor.locator(".item-content-editor-pane.is-metadata");
  await expect(metadataPane).toBeAttached();
  const titleInput = contentEditor.getByLabel("Title");
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
  const footerBox = await contentEditor.locator(".item-content-editor-footer").boundingBox();
  expect(Math.abs(
    ((footerBox?.y ?? 0) + (footerBox?.height ?? 0))
    - ((editorBox?.y ?? 0) + (editorBox?.height ?? 0)),
  )).toBeLessThanOrEqual(1);
  expect(editorBox?.height).toBe(pickerBox?.height);
  await page.keyboard.press("End");
  await page.keyboard.type(" edited");
  if ((page.viewportSize()?.width ?? 900) <= 720) {
    await contentEditor.getByRole("tab", { name: "Metadata" }).click();
  }
  await expect(metadataPane).toBeVisible();
  await expect(titleInput).toBeVisible();
  await titleInput.fill("Unified editor title");
  await expect(contentEditor.getByText("Modified", { exact: true })).toBeVisible();
  await page.keyboard.press("Control+s");
  const unifiedSaveCall = await page.waitForFunction(() => {
    const calls = (window as MetadataVisualRuntime).__copicuTestInvocations ?? [];
    return calls.find((call) =>
      call.cmd === "apply_metadata_selection_intent"
      && call.args.intent?.title?.op === "set"
    ) ?? false;
  });
  const unifiedSave = await unifiedSaveCall.jsonValue() as unknown as {
    args: { intent: { content: { value: string }; title: { op: string; value: string } } };
  };
  expect(unifiedSave.args.intent.content.value).toContain(" edited");
  expect(unifiedSave.args.intent.title).toEqual({ op: "set", value: "Unified editor title" });
  await expect(contentEditor).toBeHidden();

  await search.focus();
  await page.keyboard.press("F2");
  await expect(contentEditor).toBeVisible();
  await expect(contentInput).toContainText(" edited");
  await page.keyboard.press("Escape");
  await expect(contentEditor).toBeHidden();

  await search.focus();
  await page.keyboard.press("Control+F2");
  const externalEditCall = await page.waitForFunction(() => {
    const testWindow = window as Window & {
      __copicuTestInvocations: Array<{ cmd: string; args: { itemId?: number } }>;
    };
    return testWindow.__copicuTestInvocations.find(
      (entry) => entry.cmd === "edit_history_item_external",
    );
  });
  const externalEdit = await externalEditCall.jsonValue() as {
    args: { itemId: number };
  };
  expect(externalEdit.args.itemId).toBe(syntheticLongHistory[0].id);
  await expect(page.getByText(/Opened in Visual Studio Code/)).toBeVisible();
  await page.keyboard.press("Shift+F2");
  const metadataOpenCall = await page.waitForFunction(() => {
    const runtime = window as MetadataVisualRuntime;
    return (runtime.__copicuTestInvocations ?? []).find((entry) => entry.cmd === "open_metadata_window") ?? false;
  });
  // The mock bridge returns the recorded invocation after waitForFunction observes it.
  const metadataOpen = await metadataOpenCall.jsonValue() as unknown as { args: { request: { itemIds: number[]; focusTarget: string } } };
  expect(metadataOpen.args.request).toEqual({
    itemIds: [syntheticLongHistory[0].id],
    focusTarget: "overview",
  });
});

test("Ctrl+Shift+C targets the last item activated with Enter", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page);

  const activatedItem = syntheticLongHistory[1];
  await page.locator(".feed-item").nth(1).click();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Control+Shift+C");
  const metadataOpen = await page.waitForFunction((activatedId) => {
    const runtime = window as MetadataVisualRuntime;
    return (runtime.__copicuTestInvocations ?? []).find((entry) =>
      entry.cmd === "open_metadata_window"
      && entry.args.request?.itemIds.includes(activatedId)
    ) ?? false;
  }, activatedItem.id);
  // The mock bridge returns the recorded invocation after waitForFunction observes it.
  const invocation = await metadataOpen.jsonValue() as unknown as { args: { request: { itemIds: number[]; focusTarget: string } } };
  expect(invocation.args.request).toEqual({ itemIds: [activatedItem.id], focusTarget: "overview" });
});

test("native global activation updates the active item while the picker is hidden", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page);
  await waitForDefaultHistoryReady(page);
  await page.waitForFunction(() =>
    (window as any).__copicuTestInvocations.some(
      (call: any) => call.cmd === "plugin:event|listen"
        && call.args.event === "copicu://picker/active-item",
    ),
  );

  const handlerCount = await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "hidden",
    });
    return (window as any).__copicuTestEmitEvent(
      "copicu://picker/active-item",
      { itemId: 101 },
    );
  });
  expect(handlerCount).toBeGreaterThan(0);

  await expect(page.locator("#history-item-101 .feed-item")).toHaveClass(/is-selected/);
});

test("assistant composer retains keyboard focus and the next draft through sending and errors", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page, "/?window=assistant");
  const prompt = page.getByRole("textbox", { name: "Message assistant" });
  await prompt.fill("First request");
  await prompt.press("Enter");
  await expect(prompt).toBeFocused();

  await page.evaluate(() => (window as any).__copicuTestResolveAssistantSend());
  await expect(prompt).toHaveValue("");
  await page.keyboard.type("Next draft");
  await expect(prompt).toHaveValue("Next draft");
  await expect(page.getByRole("button", { name: "Streaming…" })).toBeDisabled();

  await page.evaluate(async () => {
    const runtime = window as any;
    runtime.__copicuTestAssistantSnapshot.running = false;
    await runtime.__copicuTestEmitEvent("copicu://assistant/updated", structuredClone(runtime.__copicuTestAssistantSnapshot));
  });
  await expect(prompt).toBeFocused();
  await expect(prompt).toHaveValue("Next draft");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(prompt).toBeFocused();
  await page.evaluate(async () => {
    const runtime = window as any;
    runtime.__copicuTestAssistantSnapshot.running = false;
    runtime.__copicuTestRejectAssistantSend(new Error("Synthetic send failed"));
    await runtime.__copicuTestEmitEvent("copicu://assistant/updated", structuredClone(runtime.__copicuTestAssistantSnapshot));
  });
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(prompt).toBeFocused();
  await expect(prompt).toHaveValue("Next draft");
  await page.keyboard.type(" corrected");
  await expect(prompt).toHaveValue("Next draft corrected");
});

test("assistant history invalidation reveals a created item without changing picker focus", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page);
  await waitForDefaultHistoryReady(page);
  const search = page.getByLabel("Search clipboard history");
  await search.focus();
  const createdItem = {
    ...syntheticLongHistory[1],
    id: 9400,
    text: "ASSISTANT_CREATED_CLIP",
    title: "Assistant created clip",
    notes: "Created without clipboard capture",
    normalized_hash: "assistant-created-clip",
  };

  await page.evaluate(async (item) => {
    const runtime = window as any;
    runtime.__copicuTestHistoryItems.unshift(item);
    await runtime.__copicuTestEmitEvent("copicu://history/changed", null);
  }, createdItem);

  const row = page.locator("#history-item-9400");
  await expect(row).toContainText("ASSISTANT_CREATED_CLIP");
  await expect(row).toBeInViewport();
  await expect(row).toHaveAttribute("aria-posinset", "1");
  await expect(search).toBeFocused();
});

test("assistant focus clears a filtered multiselection and activates the new first item", async ({ page }) => {
  const items = Array.from({ length: 4 }, (_, index) => ({
    ...syntheticLongHistory[1],
    id: 9100 + index,
    text: index < 3 ? `COMPOSE_DEMO clip ${index + 1}` : "Unselected control",
    title: null,
    notes: null,
    tags: null,
    normalized_hash: `assistant-focus-source-${index}`,
  }));
  await mockTauriInvoke(page, items);
  await gotoShell(page);
  const search = page.getByLabel("Search clipboard history");
  await search.fill("COMPOSE_DEMO");
  await expect(page.locator(".feed-item")).toHaveCount(3);
  await page.locator(".feed-item").first().click();
  const menu = await openSelectionMenu(page);
  await menu.getByRole("menuitem", { name: "Select 3 loaded clips", exact: true }).click();
  await expect(page.locator(".selection-menu-button")).toHaveAccessibleName("Open selected clips menu, 3 selected");

  await page.evaluate(async (item) => {
    const runtime = window as any;
    runtime.__copicuTestHistoryItems.unshift(item);
    await runtime.__copicuTestEmitEvent("copicu://picker/focus", {
      requestId: "assistant-derived-item",
      itemId: item.id,
    });
  }, {
    ...items[0],
    id: 9200,
    text: items.slice(0, 3).map((item) => item.text).join("\n"),
    normalized_hash: "assistant-derived-item",
  });

  await expect(search.locator(".cm-placeholder")).toBeVisible();
  await expect(page.locator("#history-item-9200")).toHaveAttribute("data-current", "true");
  await expect(page.locator("#history-item-9200")).toBeInViewport();
  await expect(page.locator("#history-item-9200")).toHaveAttribute("aria-posinset", "1");
  await expect(page.locator(".selection-menu-button")).toHaveAccessibleName("Open selected clips menu, 0 selected");
  await expect(page.getByLabel("Deselect item")).toHaveCount(0);
});

test("assistant focus loads an unrendered history page before activating its item", async ({ page }) => {
  const items = Array.from({ length: 80 }, (_, index) => ({
    ...syntheticLongHistory[1],
    id: 9300 + index,
    text: `Distant clip ${index}`,
    title: null,
    normalized_hash: `assistant-distant-${index}`,
    created_at_unix_ms: 1_800_000_000_000 - index,
    last_used_at_unix_ms: 1_800_000_000_000 - index,
  }));
  await mockTauriInvoke(page, items, null, { historyPageSizeOverride: 5 });
  await gotoShell(page);
  await expect(page.locator("#history-item-9300")).toBeVisible();
  await expect(page.locator("#history-item-9379")).toHaveCount(0);
  await page.evaluate(() => (window as any).__copicuTestEmitEvent(
    "copicu://picker/focus",
    { requestId: "assistant-distant-item", itemId: 9379 },
  ));
  await expect(page.locator("#history-item-9379")).toHaveAttribute("data-current", "true");
  await expect(page.locator("#history-item-9379")).toBeInViewport();
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
  await expect(async () => {
    await feed.evaluate((element) => { element.scrollTop = element.scrollHeight; });
    await expect(page.getByRole("group", { name: /COPICU_SYNTH_PAGE_80/ })).toBeInViewport({ timeout: 100 });
  }).toPass({ timeout: 5000 });
});

test("failed pagination stops automatic retries", async ({ page }) => {
  await mockTauriInvoke(page, syntheticPagedHistory, null, { historySearchFailOnCursor: true });
  await gotoShell(page);

  await expect(page.locator("[title='Result count']")).toHaveText("80 total");
  await page.locator(".history-feed-scroll").evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(page.getByRole("alert")).toContainText("Could not update results. Previous results remain visible.");
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
  const callsAfterFailure = await page.evaluate(() =>
    (window as any).__copicuTestInvocations.filter((call: any) => call.cmd === "history_search").length,
  );
  await page.waitForTimeout(350);
  expect(await page.evaluate(() =>
    (window as any).__copicuTestInvocations.filter((call: any) => call.cmd === "history_search").length,
  )).toBe(callsAfterFailure);
});

test("pagination recovery survives a held draft discard", async ({ page }) => {
  await mockTauriInvoke(page, syntheticPagedHistory, null, {
    historySearchFailOnCursor: true,
    searchTriggerMode: "enter",
  });
  await gotoShell(page);

  const search = page.getByLabel("Search clipboard history");
  const feed = page.locator(".history-feed-scroll");
  await expect(page.locator("[title='Result count']")).toHaveText("80 total");
  await feed.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(page.getByRole("alert")).toContainText("Could not update results. Previous results remain visible.");
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();

  await search.fill("held draft");
  await expect(search).toHaveText("held draft");
  await expect(page.getByRole("alert")).toHaveCount(0);
  await search.press("Escape");
  await expect(search.locator(".cm-placeholder")).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("Could not update results. Previous results remain visible.");
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();

  const callsAfterDiscard = await page.evaluate(() =>
    (window as any).__copicuTestInvocations.filter((call: any) => call.cmd === "history_search").length,
  );
  await page.waitForTimeout(350);
  expect(await page.evaluate(() =>
    (window as any).__copicuTestInvocations.filter((call: any) => call.cmd === "history_search").length,
  )).toBe(callsAfterDiscard);

  await page.evaluate(() => {
    (window as any).__copicuTestMockOptions.historySearchFailOnCursor = false;
  });
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByRole("alert")).toHaveCount(0, { timeout: 5000 });
  await expect(page.locator("[title='Result count']")).toHaveText("80 total");
  await feed.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(page.getByRole("group", { name: /COPICU_SYNTH_PAGE_80/ })).toBeAttached();
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("pagination recovery survives a retained focus refresh", async ({ page }) => {
  await mockTauriInvoke(page, syntheticPagedHistory, null, { historySearchFailOnCursor: true });
  await gotoShell(page);

  const feed = page.locator(".history-feed-scroll");
  await expect(page.locator("[title='Result count']")).toHaveText("80 total");
  await feed.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(page.getByRole("alert")).toContainText("Could not update results. Previous results remain visible.");
  const callsAfterPageFailure = await page.evaluate(() =>
    (window as any).__copicuTestInvocations.filter((call: any) => call.cmd === "history_search").length,
  );

  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.waitForFunction((previousCalls) =>
    (window as any).__copicuTestInvocations.filter((call: any) => call.cmd === "history_search").length > previousCalls,
  callsAfterPageFailure);
  await expect(page.getByRole("alert")).toContainText("Could not update results. Previous results remain visible.");
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();

  const callsAfterRetainedRefresh = await page.evaluate(() =>
    (window as any).__copicuTestInvocations.filter((call: any) => call.cmd === "history_search").length,
  );
  await page.waitForTimeout(350);
  expect(await page.evaluate(() =>
    (window as any).__copicuTestInvocations.filter((call: any) => call.cmd === "history_search").length,
  )).toBe(callsAfterRetainedRefresh);
});

test("retained boundary refresh keeps cursor bridge continuity", async ({ page }) => {
  await mockTauriInvoke(page, syntheticPagedHistory, null, { historySearchFailOnCursor: true });
  await gotoShell(page);

  const feed = page.locator(".history-feed-scroll");
  await expect(page.locator("[title='Result count']")).toHaveText("80 total");
  await feed.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(page.getByRole("alert")).toContainText("Could not update results. Previous results remain visible.");

  const cursorA = {
    afterIsInbox: false,
    afterInboxAtUnixMs: null,
    afterSortUnixMs: syntheticPagedHistory[59].created_at_unix_ms,
    afterId: syntheticPagedHistory[59].id,
  };
  const cursorB = {
    afterIsInbox: false,
    afterInboxAtUnixMs: null,
    afterSortUnixMs: syntheticPagedHistory[60].created_at_unix_ms,
    afterId: syntheticPagedHistory[60].id,
  };
  await page.evaluate(() => {
    const options = (window as any).__copicuTestMockOptions;
    options.historySearchFailOnCursor = false;
    options.historySearchBoundaryShiftOnNextRefresh = true;
  });
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.waitForFunction(() => (window as any).__copicuTestBoundaryShifted === true);
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.waitForFunction((expectedCursor) =>
    (window as any).__copicuTestHistoryResponses.some(
      (response: any) => response.cursor && response.cursor.afterId === expectedCursor.afterId,
    ),
  cursorA);

  const continuity = await page.evaluate(() => {
    const responses = (window as any).__copicuTestHistoryResponses as Array<{
      cursor: { afterIsInbox: boolean; afterInboxAtUnixMs: number | null; afterSortUnixMs: number; afterId: number } | null;
      ids: number[];
      nextCursor: { afterIsInbox: boolean; afterInboxAtUnixMs: number | null; afterSortUnixMs: number; afterId: number } | null;
    }>;
    const firstPage = [...responses].reverse().find((response) => response.cursor === null);
    const pagedResponses = responses.filter((response) => response.cursor !== null);
    const paged = pagedResponses.at(-1);
    return {
      firstIds: firstPage?.ids ?? [],
      pageIds: paged?.ids ?? [],
      freshNextCursor: firstPage?.nextCursor ?? null,
      pagedCursors: pagedResponses.map((response) => response.cursor),
    };
  });
  expect(continuity.freshNextCursor).toEqual(cursorB);
  expect(continuity.pagedCursors.at(-1)).toEqual(cursorA);
  const expectedFirstIds = syntheticPagedHistory.slice(0, 60).map((item) => item.id);
  const expectedPageIds = syntheticPagedHistory.slice(60).map((item) => item.id);
  expect(continuity.firstIds).toEqual(expectedFirstIds);
  expect(continuity.pageIds).toEqual(expectedPageIds);
  const allIds = [...continuity.firstIds, ...continuity.pageIds];
  expect(allIds).toEqual(syntheticPagedHistory.map((item) => item.id));
  expect(new Set(allIds).size).toBe(allIds.length);
});

test("initial history failure remains recoverable through Retry", async ({ page }) => {
  await mockTauriInvoke(page, syntheticLongHistory, null, { historySearchFailNext: true });
  await gotoShell(page);

  const alert = page.getByRole("alert");
  await expect(alert).toBeVisible();
  await expect(page.locator(".empty-history")).toBeVisible();

  const attemptsBeforeRetry = await page.evaluate(() =>
    (window as any).__copicuTestInvocations.filter((call: any) => call.cmd === "history_search").length,
  );
  expect(attemptsBeforeRetry).toBe(1);

  await page.getByRole("button", { name: "Retry" }).click();
  await page.waitForFunction((previousAttempts) =>
    (window as any).__copicuTestInvocations.filter((call: any) => call.cmd === "history_search").length > previousAttempts,
  attemptsBeforeRetry);
  await expect(alert).toHaveCount(0, { timeout: 5000 });
  await expect(page.locator("[title='Result count']")).toHaveText("4 total", { timeout: 5000 });
  await expect(page.getByRole("group", { name: /COPICU_SYNTH_MARKDOWN/ })).toBeVisible();
});

test("loaded page count stays stable while idle", async ({ page }) => {
  await mockTauriInvoke(page, syntheticPagedHistory);
  await gotoShell(page);

  const resultCount = page.locator("[title='Result count']");
  await expect(resultCount).toHaveText("80 total");
  const feed = page.locator(".history-feed-scroll");
  await expect(async () => {
    await feed.evaluate((element) => { element.scrollTop = element.scrollHeight; });
    await expect(page.getByRole("group", { name: /COPICU_SYNTH_PAGE_80/ })).toBeInViewport({ timeout: 100 });
  }).toPass({ timeout: 5000 });
  const before = await feed.evaluate((element) => ({ top: element.scrollTop, height: element.scrollHeight }));

  await page.waitForTimeout(1800);

  await expect(resultCount).toHaveText("80 total");
  await expect(page.getByRole("group", { name: /COPICU_SYNTH_PAGE_80/ })).toBeAttached();
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
  await expect(search).toHaveText("unbroken");
  await expect(page.getByRole("group", { name: /COPICU_SYNTH_LONG_UNBROKEN/ })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
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
    await page.keyboard.press("Control+Alt+ArrowDown");
  }

  await page.waitForTimeout(350);

  await expect(page.getByRole("group", { name: /COPICU_SYNTH_PAGE_06/ })).toHaveClass(/is-selected/);
  await expect(page.getByRole("group", { name: /COPICU_SYNTH_PAGE_01/ })).not.toHaveClass(/is-selected/);
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
  await waitForDefaultHistoryReady(page);

  const search = page.getByLabel("Search clipboard history");
  await page.waitForFunction(() =>
    (window as any).__copicuTestInvocations.some(
      (call: any) => call.cmd === "get_compound_hotkey_pending",
    ),
  );
  await search.focus();
  await expect(search).toBeFocused();
  await search.press("Control+Alt+ArrowDown");

  await expect(page.getByRole("group", { name: /COPICU_SYNTH_LONG_SINGLE_LINE/ })).toHaveClass(/is-selected/);
  const calls = await page.evaluate(() => (window as any).__copicuTestInvocations);
  expect(calls.filter((call: any) => call.cmd === "clear_compound_hotkey_pending")).toHaveLength(1);
  expect(calls.filter((call: any) => call.cmd === "handle_compound_hotkey_step")).toHaveLength(0);
});

test("manual scroll keeps moving downward while variable rows are measured", async ({ page }) => {
  await mockTauriInvoke(page, syntheticMarkdownScrollHistory);
  await gotoShell(page);

  const feed = page.locator(".history-feed-scroll");
  await expect(page.getByRole("group", { name: /COPICU_SYNTH_SCROLL_01/ })).toBeVisible();

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

  await page.getByRole("group", { name: /COPICU_SYNTH_LONG_UNBROKEN/ }).click();
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

  await expect(page.getByRole("group", { name: /COPICU_SYNTH_LONG_UNBROKEN/ })).toHaveClass(
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

test("ai prefix starts one assistant turn with picker context", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page);

  await page.getByRole("group", { name: /COPICU_SYNTH_LONG_UNBROKEN/ }).click();
  await page.getByLabel("Search clipboard history").fill("ai: find long text from yesterday");
  await expect(page.locator("[title='Result count']")).toHaveText("Assistant prompt");
  await page.keyboard.press("Enter");

  await page.waitForFunction(() => {
    const runtime = window as unknown as {
      __copicuTestInvocations: Array<{ cmd: string }>;
    };
    return runtime.__copicuTestInvocations.some((call) => call.cmd === "assistant_quick_prompt");
  });
  const request = await page.evaluate(() => {
    const runtime = window as unknown as {
      __copicuTestInvocations: Array<{
        cmd: string;
        args: { text: string; context: { activeItemId: string | null; visibleItemIds: string[] } };
      }>;
    };
    const call = runtime.__copicuTestInvocations
      .filter((entry) => entry.cmd === "assistant_quick_prompt")
      .at(-1);
    if (!call) throw new Error("assistant_quick_prompt was not invoked");
    return call.args;
  });
  expect(request.text).toBe("find long text from yesterday");
  expect(request.context.activeItemId).toBe("102");
  expect(request.context.visibleItemIds).toEqual(["100", "101", "102", "103"]);
  await expect(page.locator("[title='Result count']")).toHaveText("4 total");
});

test("failed assistant quick prompt preserves the draft", async ({ page }) => {
  await mockTauriInvoke(page, syntheticLongHistory, null, {
    assistantQuickPromptFailure: "assistant is already running",
  });
  await gotoShell(page);

  const search = page.getByLabel("Search clipboard history");
  await search.fill("ai: summarize selected clips");
  await page.keyboard.press("Enter");

  await expect(page.getByRole("alert")).toContainText("assistant is already running");
  await expect(search).toHaveText("ai: summarize selected clips");
});

test("assistant picker filter applies after AI composer and rejects invalid queries", async ({ page }) => {
  type FilterTestRuntime = Window & {
    __copicuTestEmitEvent: (event: string, payload: { requestId: string; query: string }) => Promise<number>;
    __copicuTestInvocations: Array<{
      cmd: string;
      args?: { request?: { requestId?: string; error?: string | null } };
    }>;
  };
  await mockTauriInvoke(page, syntheticLongHistory, null, { searchTriggerMode: "enter" });
  await gotoShell(page);
  await waitForDefaultHistoryReady(page);

  await page.getByRole("button", { name: "Search mode, switch to AI mode" }).click();
  await page.getByLabel("Ask Copicu Assistant").fill("find markdown");
  await page.evaluate(async () => {
    const runtime = window as unknown as FilterTestRuntime;
    await runtime.__copicuTestEmitEvent("copicu://picker/filter", {
      requestId: "synthetic-filter-valid",
      query: "COPICU_SYNTH_MARKDOWN",
    });
  });
  await expect(page.getByRole("group", { name: /COPICU_SYNTH_MARKDOWN/ })).toBeVisible();
  await expect(page.getByRole("group", { name: /COPICU_SYNTH_LONG_UNBROKEN/ })).toHaveCount(0);
  await page.waitForFunction(() => (window as unknown as FilterTestRuntime).__copicuTestInvocations.some(
    (call) => call.cmd === "picker_filter_ack"
      && call.args?.request?.requestId === "synthetic-filter-valid"
      && call.args?.request?.error === null,
  ));

  await page.evaluate(async () => {
    const runtime = window as unknown as FilterTestRuntime;
    await runtime.__copicuTestEmitEvent("copicu://picker/filter", {
      requestId: "synthetic-filter-invalid",
      query: "re:(",
    });
  });
  await page.waitForFunction(() => (window as unknown as FilterTestRuntime).__copicuTestInvocations.some(
    (call) => call.cmd === "picker_filter_ack"
      && call.args?.request?.requestId === "synthetic-filter-invalid"
      && typeof call.args?.request?.error === "string",
  ));
  await expect(page.getByRole("group", { name: /COPICU_SYNTH_MARKDOWN/ })).toBeVisible();
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
  await expect(search).toHaveText("tag:work");
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

test("search evidence precedes metadata while preserving the original long preview", async ({ page }) => {
  const text = `${"Original preview remains available.\n".repeat(30)}Deployment needle at the end.`;
  await mockTauriInvoke(page, [{
    ...syntheticLongHistory[1],
    id: 9200,
    text,
    title: "Generic release notes",
    notes: "Review with the team",
    tags: null,
  }]);
  await gotoShell(page);
  const row = page.locator(".feed-item").first();
  await expect(row.locator(".item-title")).toHaveText("Generic release notes");
  await expect(page.getByLabel("Search matches")).toHaveCount(0);
  await page.evaluate(() => {
    // The test bootstrap owns this in-process fixture.
    const runtime = window as Window & {
      __copicuTestHistoryItems: Array<{
        search_matches?: Array<{ field: string; before: string; matched: string; after: string }>;
      }>;
    };
    runtime.__copicuTestHistoryItems[0].search_matches = [{
      field: "content",
      before: "Deployment ",
      matched: "needle",
      after: " at the end.",
    }];
  });
  await page.getByLabel("Search clipboard history").fill("needle");
  const evidence = row.getByLabel("Search matches");
  await expect(evidence.locator("mark")).toHaveText("needle");
  await expect(evidence).toBeInViewport();
  const evidenceBox = await evidence.boundingBox();
  const titleBox = await row.locator(".item-title").boundingBox();
  expect(evidenceBox).not.toBeNull();
  expect(titleBox).not.toBeNull();
  expect(evidenceBox!.y + evidenceBox!.height).toBeLessThanOrEqual(titleBox!.y);
  await expect(row.locator("pre")).toContainText("Original preview remains available.");
  await expect(row.getByRole("button", { name: "Show more", exact: true })).toBeVisible();
  await row.getByRole("button", { name: "Show more", exact: true }).click();
  await expect(row.getByRole("button", { name: "Show less", exact: true })).toBeVisible();
  await expect(row.locator("pre")).toContainText("Deployment needle at the end.");
});

test("query editor completion suggests tags, operators, and closed values", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page);

  const search = page.getByLabel("Search clipboard history");
  const suggestions = page.locator(".cm-tooltip-autocomplete");
  await search.fill("#");
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

test("query editor refreshes tag completion options after focus", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page);

  await page.evaluate(() => {
    (window as any).__copicuTestTags.push(
      {
        id: 3,
        slug: "project/key",
        label: "Project/Key",
        color: null,
        pinned: false,
        sortOrder: null,
        itemCount: 1,
        autoApplyEnabled: false,
      },
      {
        id: 4,
        slug: "project/show",
        label: "Project/Show",
        color: null,
        pinned: false,
        sortOrder: null,
        itemCount: 1,
        autoApplyEnabled: false,
      },
    );
    window.dispatchEvent(new Event("focus"));
  });

  await expect.poll(() => page.evaluate(() =>
    (window as any).__copicuTestInvocations.filter((call: any) => call.cmd === "list_tags").length,
  )).toBeGreaterThan(1);

  const search = page.getByLabel("Search clipboard history");
  const suggestions = page.locator(".cm-tooltip-autocomplete");
  await search.fill("tag:project/");
  await expect(suggestions.getByRole("option", { name: "tag:project/key" })).toBeVisible();
  await expect(suggestions.getByRole("option", { name: "tag:project/show" })).toBeVisible();
});


test("query editor accepts keyboard and click completions and closes Escape", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page);

  const search = page.getByLabel("Search clipboard history");
  const suggestions = page.locator(".cm-tooltip-autocomplete");
  await search.fill("#");
  await expect(suggestions.getByRole("option", { name: "#work" })).toHaveAttribute("aria-selected", "true");
  // CodeMirror ignores navigation for 75 ms after opening a completion menu.
  await page.waitForTimeout(100);
  await search.press("ArrowDown");
  await expect(suggestions.getByRole("option", { name: "#backend" })).toHaveAttribute("aria-selected", "true");

  await search.fill("ki");
  const kindSuggestion = suggestions.getByRole("option", { name: "kind:" });
  await expect(kindSuggestion).toBeVisible();
  await page.waitForTimeout(100);
  await search.press("Enter");
  await expect.poll(() => search.textContent()).toBe("kind:");
  await expect(suggestions).toHaveCount(0);

  await search.fill("#");
  await expect(suggestions).toBeVisible();
  await search.press("Escape");
  await expect.poll(() => search.textContent()).toBe("#");
  await expect(suggestions).toHaveCount(0);

  await search.fill("tag:");
  await page.evaluate(() => {
    (window as any).__copicuTestInvocations = [];
  });
  await suggestions.getByRole("option", { name: "tag:work" }).click();
  await expect.poll(() => search.textContent()).toBe("tag:work");
  await expect(suggestions).toHaveCount(0);
  await expect.poll(() =>
    page.evaluate(() =>
      (window as any).__copicuTestInvocations.filter((call: any) => call.cmd === "history_search").length,
    ),
  ).toBeGreaterThan(0);
});

test("Tab accepts completion and keeps search focus without applying in Enter mode", async ({ page }) => {
  await mockTauriInvoke(page, syntheticLongHistory, null, { searchTriggerMode: "enter" });
  await gotoShell(page);
  await waitForDefaultHistoryReady(page);
  const search = page.getByLabel("Search clipboard history");
  const suggestions = page.locator(".cm-tooltip-autocomplete");
  await search.fill("tag:wo");
  await expect(suggestions.getByRole("option", { name: "tag:work" })).toHaveAttribute("aria-selected", "true");
  await page.waitForTimeout(100);
  await page.evaluate(() => { (window as any).__copicuTestInvocations = []; });
  await search.press("Tab");
  await expect.poll(() => search.textContent()).toBe("tag:work");
  await expect(search).toBeFocused();
  await expect(suggestions).toHaveCount(0);
  await page.waitForTimeout(180);
  expect(await page.evaluate(() => (window as any).__copicuTestInvocations.filter(
    (call: any) => call.cmd === "history_search" || call.cmd === "activate_item",
  ).length)).toBe(0);

  // With no completion, Tab still traverses focus; Shift+Tab never accepts.
  await search.press("Tab");
  await expect(search).not.toBeFocused();
  await search.fill("tag:wo");
  await expect(suggestions).toBeVisible();
  await search.press("Shift+Tab");
  await expect.poll(() => search.textContent()).toBe("tag:wo");
  await expect(search).not.toBeFocused();
  await expect(suggestions).toHaveCount(0);
});

test("Enter accepts completion before applying the same query", async ({ page }) => {
  await mockTauriInvoke(page, syntheticLongHistory, null, { searchTriggerMode: "enter" });
  await gotoShell(page);

  const search = page.getByLabel("Search clipboard history");
  const suggestions = page.locator(".cm-tooltip-autocomplete");
  await search.fill("kind:");
  await expect(suggestions.getByRole("option", { name: "kind:text" })).toBeVisible();
  // Let CodeMirror's 75 ms accidental-acceptance guard expire.
  await page.waitForTimeout(100);
  await page.evaluate(() => {
    (window as any).__copicuTestInvocations = [];
  });

  await search.press("Enter");
  await expect.poll(() => search.textContent()).toBe("kind:text");
  await expect(suggestions).toHaveCount(0);
  await page.waitForTimeout(180);
  expect(await page.evaluate(() =>
    (window as any).__copicuTestInvocations.filter(
      (call: any) => call.cmd === "history_search",
    ).length,
  )).toBe(0);

  await search.press("Enter");
  await expect.poll(() =>
    page.evaluate(() =>
      (window as any).__copicuTestInvocations.filter(
        (call: any) => call.cmd === "history_search" && call.args.request.query === "kind:text",
      ).length,
    ),
  ).toBeGreaterThan(0);
});

test("search composer mode toggles with icon button", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page);

  const queryEditor = page.locator(".query-editor:not(.is-hidden) [contenteditable='true']");
  const toggle = page.getByRole("button", { name: "Search mode, switch to AI mode" });

  await expect(queryEditor).toBeVisible();
  await expect(queryEditor).toHaveAttribute("aria-label", "Search clipboard history");
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect(toggle).toHaveAttribute("data-mode", "search");

  await toggle.click();

  const aiToggle = page.getByRole("button", { name: "AI mode, switch to search mode" });
  const aiEditor = page.locator(".ai-query-editor:not(.is-hidden) textarea");
  await expect(aiToggle).toHaveAttribute("aria-pressed", "true");
  await expect(aiToggle).toHaveAttribute("data-mode", "ai");
  await expect(aiEditor).toHaveAttribute("aria-label", "Ask Copicu Assistant");
  await expect(aiEditor).toBeFocused();

  await aiToggle.click();

  await expect(page.getByRole("button", { name: "Search mode, switch to AI mode" })).toHaveAttribute(
    "data-mode",
    "search",
  );
  await expect(queryEditor).toBeVisible();
});

test("regex search, literal search, and invalid patterns keep the picker coherent", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page);

  const search = page.getByLabel("Search clipboard history");
  const markdownItem = page.getByRole("group", { name: /COPICU_SYNTH_MARKDOWN/ });
  const unbrokenItem = page.getByRole("group", { name: /COPICU_SYNTH_LONG_UNBROKEN/ });

  await search.fill("re:^## COPICU_SYNTH_MARKDOWN");
  await expect(markdownItem).toBeVisible();
  await expect(unbrokenItem).toHaveCount(0);

  await search.fill("COPICU_SYNTH_MARKDOWN");
  await expect(markdownItem).toBeVisible();

  await search.fill("re:(");
  await expect(page.getByRole("alert")).toContainText("Could not update results. Previous results remain visible.");
  await expect(page.getByRole("alert")).toContainText("Invalid regular expression");
  await expect(markdownItem).toBeVisible();
  await expect(search).toHaveText("re:(");
});

test("AI composer sends one assistant prompt instead of running local search", async ({ page }) => {
  await mockTauriInvoke(page, syntheticLongHistory, null, { searchTriggerMode: "enter" });
  await gotoShell(page);

  await page.getByRole("button", { name: "Search mode, switch to AI mode" }).click();
  const prompt = page.getByLabel("Ask Copicu Assistant");
  await prompt.fill("summarize the selected clips");
  await page.getByRole("button", { name: "Send to assistant", exact: true }).click();

  await page.waitForFunction(() => {
    const runtime = window as unknown as {
      __copicuTestInvocations: Array<{ cmd: string }>;
    };
    return runtime.__copicuTestInvocations.some((call) => call.cmd === "assistant_quick_prompt");
  });
  const invocation = await page.evaluate(() => {
    const runtime = window as unknown as {
      __copicuTestInvocations: Array<{
        cmd: string;
        args?: { text?: string; request?: { query?: string } };
      }>;
    };
    const assistantCall = runtime.__copicuTestInvocations
      .filter((call) => call.cmd === "assistant_quick_prompt")
      .at(-1);
    return {
      text: assistantCall?.args?.text,
      searchedPrompt: runtime.__copicuTestInvocations
        .filter((call) => call.cmd === "history_search")
        .some((call) => call.args?.request?.query === "summarize the selected clips"),
    };
  });
  expect(invocation.text).toBe("summarize the selected clips");
  expect(invocation.searchedPrompt).toBe(false);
  await expect(prompt).toHaveValue("");
});

test("search fields remain visible and distinguish pending scope changes from applied results", async ({ page }) => {
  await mockTauriInvoke(page, syntheticLongHistory, null, {
    searchTriggerMode: "enter",
    defaultSearchScopes: ["content", "title"],
  });
  await gotoShell(page);
  await waitForDefaultHistoryReady(page);

  const strip = page.locator(".search-filter-strip");
  const fields = strip.getByRole("button", { name: /^Edit search fields:/ });
  await expect(fields).toHaveText("Content, Title");
  await expect(strip.getByText("Default", { exact: true })).toHaveCount(0);
  await fields.click();
  const picker = page.getByRole("dialog", { name: /^Edit search fields:/ });
  await expect(picker.getByText("Default", { exact: true })).toBeVisible();
  await picker.getByRole("button", { name: "Search only Title", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(picker).not.toBeVisible();

  await expect(fields).toHaveText("Title");
  await expect(strip.getByText("Next search in:", { exact: true })).toBeVisible();
  await expect(strip.getByRole("status")).toHaveText("Not applied");
  await expect(page.locator(".feed-item")).toHaveCount(4);
  await page.getByRole("button", { name: "Apply search", exact: true }).click();
  await expect(strip.getByRole("status")).toHaveCount(0);
  await expect(strip.getByText("Search in:", { exact: true })).toBeVisible();
  await expect(fields).toHaveText("Title");

  await page.getByRole("button", { name: "Clear filter", exact: true }).click();
  await expect(fields).toHaveText("Content, Title");
  await expect(strip.getByRole("status")).toHaveCount(0);
  await expect(page.locator("[title='Result count']")).toHaveText("4 total");
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
  const menu = await openMarksMenu(page);
  await menu.getByRole("menuitem", { name: "Mark all 4 matching clips", exact: true }).click();

  await expect(page.getByText("Apply the current search before changing marks for all matching clips.")).toBeVisible();
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
  await page.keyboard.press("F6");
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
  await expect(async () => {
    await page.locator(".history-feed-scroll").evaluate((element) => { element.scrollTop = element.scrollHeight; });
    await expect(page.getByRole("group", { name: /COPICU_SYNTH_PAGE_80/ })).toBeInViewport({ timeout: 100 });
  }).toPass({ timeout: 5000 });
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
  await expect(page.getByRole("group", { name: /COPICU_SYNTH_PAGE_80/ })).toBeAttached({ timeout: 5000 });
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
  await expect(search).toHaveText("unbroken");
  await expect(page.locator("[title='Result count']")).toHaveText("1 / 4 matches", { timeout: 5000 });
});

test("failed clear preserves focus and retries the empty query", async ({ page }) => {
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
  await expect(search.locator(".cm-placeholder")).toBeVisible();
  await page.waitForFunction(() =>
    (window as any).__copicuTestInvocations.some(
      (call: any) => call.cmd === "history_search" && call.args.request.query === "",
    ),
  );
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));

  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible({ timeout: 5000 });
  await expect(page.locator("[title='Result count']")).toHaveAttribute("data-filter-status", "error");
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
  await expect(search.locator(".cm-placeholder")).toBeVisible();
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

test("focus preserves completion while its plain draft follows realtime search", async ({ page }) => {
  await mockTauriInvoke(page, syntheticLongHistory, null, { historySearchDelayMs: 80 });
  await gotoShell(page);

  await expect(page.locator("[title='Result count']")).toHaveText("4 total", { timeout: 5000 });
  const search = page.getByLabel("Search clipboard history");
  const suggestions = page.locator(".cm-tooltip-autocomplete");
  await search.fill("ki");
  await expect(suggestions).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));

  await expect(page.locator("[title='Result count']")).toHaveText("0 / 4 matches");
  await expect(page.locator(".feed-item")).toHaveCount(0);
  await expect(search).toHaveText("ki");
  await expect(suggestions).toBeVisible();
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
  await expect(search).toHaveText("unbroken");
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
  const item = page.getByRole("group", { name: /COPICU_SYNTH_LONG_SINGLE_LINE/ });
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

  await page.getByRole("group", { name: /COPICU_SYNTH_LONG_SINGLE_LINE/ }).dblclick();

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

  const search = page.getByLabel("Search clipboard history");
  await search.fill("long");
  const pinButton = page.getByRole("button", { name: "Pin window on top" });
  await pinButton.click();
  await expect(page.getByRole("button", { name: "Unpin window from top" })).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("group", { name: /COPICU_SYNTH_LONG_SINGLE_LINE/ }).dblclick();

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
  await expect(search).toHaveText("long");
});

test("filter lock survives picker hides and unlock restores normal reset", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page);

  const search = page.getByLabel("Search clipboard history");
  await search.fill("long");
  await page.keyboard.press("Control+Shift+l");
  await expect(page.getByRole("button", { name: "Unlock persistent filter" })).toHaveAttribute("aria-pressed", "true");

  await page.getByLabel("Hide Copicu").click();
  await expect(search).toHaveText("long");

  await search.focus();
  await page.keyboard.press("Control+Shift+l");
  await expect(page.getByRole("button", { name: "Lock filter across picker closes" })).toHaveAttribute("aria-pressed", "false");
  await page.getByLabel("Hide Copicu").click();
  await expect(search.locator(".cm-placeholder")).toBeVisible();
});

test("filter lock restores the applied query after renderer reload", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page);

  const search = page.getByLabel("Search clipboard history");
  await search.fill("long");
  await page.getByRole("button", { name: "Lock filter across picker closes" }).click();
  await page.reload();

  await expect(page.getByLabel("Search clipboard history")).toHaveText("long");
  await expect(page.getByRole("button", { name: "Unlock persistent filter" })).toHaveAttribute("aria-pressed", "true");
});

test("filter lock rejects an incomplete draft without persisting it", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page);

  const search = page.getByLabel("Search clipboard history");
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

  const search = page.getByLabel("Search clipboard history");
  await search.fill("long");
  await page.getByRole("button", { name: "Lock filter across picker closes" }).click();
  await page.getByRole("button", { name: "Clear filter" }).click();

  await expect(search.locator(".cm-placeholder")).toBeVisible();
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

  const search = page.getByLabel("Search clipboard history");
  await search.fill("long");
  await search.press("Enter");
  await expect(page.locator("[title='Result count']")).toHaveText("2 / 4 matches", { timeout: 5000 });
  await page.evaluate(() => {
    (window as any).__copicuTestInvocations = [];
  });

  await search.press("Escape");
  await expect(search.locator(".cm-placeholder")).toBeVisible();
  await expect(page.locator("[title='Result count']")).toHaveText("Clearing filter");
  await search.press("Escape");
  await page.waitForTimeout(80);
  await expect(search.locator(".cm-placeholder")).toBeVisible();
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

  const item = page.getByRole("group", { name: /COPICU_SYNTH_LONG_SINGLE_LINE/ });
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
  await expect(menu.getByRole("menuitem", { name: "Copy", exact: true })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Paste", exact: true })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Delete item" })).toBeVisible();
  const more = await openItemSubmenu(page, "More actions");
  await expect(more.getByRole("menuitem", { name: "Paste plain" })).toBeVisible();
  await expect(more.getByRole("menuitem", { name: "Open URL" })).toHaveCount(0);
  await expect(more.getByRole("menuitem", { name: "copy-current-title" })).toBeVisible();
  await expect(more.getByRole("menuitem", { name: "join-selected-with-log-name" })).toBeVisible();
  await page.keyboard.press("Escape");
  const organize = await openItemSubmenu(page, "Organize");
  await expect(organize.getByRole("menuitem", { name: "Edit tags" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu.getByRole("menuitem", { name: "Organize", exact: true })).toBeFocused();
  // Closing a flyout can expose its trigger beneath the stationary pointer.
  // It must remain dismissed after the former hover timers would have fired.
  await page.waitForTimeout(250);
  await expect(organize).toBeHidden();

  await menu.getByRole("menuitem", { name: "Paste", exact: true }).click();
  await expect(menu).toBeHidden();
});

test("item context menu ignores secondary clicks inside its portal", async ({ page }) => {
  await mockTauriInvoke(page, [{ ...syntheticLongHistory[1], text: "COPICU_SYNTH_MENU_EVENTS" }]);
  await gotoShell(page);

  const item = page.locator(".feed-item").first();
  await item.click({ button: "right", position: { x: 76, y: 18 } });
  const menu = page.getByRole("menu", { name: "Item actions" });
  await expect(menu).toBeVisible();
  const initialBox = await menu.boundingBox();
  expect(initialBox).not.toBeNull();

  await page.evaluate(() => {
    document.addEventListener("contextmenu", (event) => {
      (window as any).__copicuTestMenuContextEvent = event;
    }, { capture: true, once: true });
  });
  await menu.locator(".mantine-Menu-divider").first().click({ button: "right" });
  expect(await page.evaluate(() => (window as any).__copicuTestMenuContextEvent.defaultPrevented)).toBe(true);
  await expect(menu).toBeVisible();
  const currentBox = await menu.boundingBox();
  expect(currentBox).not.toBeNull();
  expect(currentBox!.x).toBe(initialBox!.x);
  expect(currentBox!.y).toBe(initialBox!.y);

  await menu.locator(".mantine-Menu-divider").first().click();
  await expect(menu).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
});

test("item context menu closes after marking a clip", async ({ page }) => {
  await mockTauriInvoke(page, [{ ...syntheticLongHistory[1], text: "COPICU_SYNTH_MENU_MARK" }]);
  await gotoShell(page);

  const item = page.locator(".feed-item").first();
  await item.click({ button: "right", position: { x: 76, y: 18 } });
  const menu = page.getByRole("menu", { name: "Item actions" });
  await expect(menu).toBeVisible();
  await (await openItemSubmenu(page, "Organize")).getByRole("menuitem", { name: "Mark", exact: true }).click();
  await expect(item).toHaveClass(/is-marked/);
  await expect(menu).toBeHidden();

  const responsesBeforeFocus = await page.evaluate(() => (window as any).__copicuTestHistoryResponses.length);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect.poll(() => page.evaluate(() => (window as any).__copicuTestHistoryResponses.length))
    .toBeGreaterThan(responsesBeforeFocus);
  await expect(item).toHaveClass(/is-marked/);
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
  const item = page.getByRole("group", { name: /https:\/\/example\.test\/copicu/ });
  await item.click({ button: "right" });

  const menu = await openItemSubmenu(page, "More actions");
  await expect(menu.getByRole("menuitem", { name: "Paste plain" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Open URL" })).toBeVisible();
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
  const selected = page.getByRole("group", { name: /COPICU_SYNTH_LONG_UNBROKEN/ });
  await selected.click({ button: "right" });

  const menu = page.getByRole("menu", { name: "Item actions" });
  await expect(menu.getByRole("menuitem").first()).toContainText("Edit metadata · 2 clips");
  await expect(menu.getByRole("menuitem", { name: "Delete 2 selected items", exact: true })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Copy", exact: true })).toHaveCount(0);
  await expect(menu.getByRole("menuitem", { name: "Paste", exact: true })).toHaveCount(0);
  await expect(menu.getByRole("menuitem", { name: "Quick edit", exact: true })).toHaveCount(0);
  const organize = await openItemSubmenu(page, "Organize");
  await expect(organize.getByRole("menuitem", { name: "Edit tags for selected" })).toBeVisible();
  await expect(organize.getByRole("menuitem", { name: "Clear selection", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  const more = await openItemSubmenu(page, "More actions");
  await expect(more.getByRole("menuitem", { name: "Join selected", exact: true })).toBeVisible();
  await expect(more.getByRole("menuitem", { name: "join-selected-with-log-name" })).toBeVisible();
  await expect(more.getByRole("menuitem", { name: "Paste plain", exact: true })).toHaveCount(0);
  await expect(more.getByRole("menuitem", { name: "copy-current-title", exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");

  // A row outside the group must use the safe single-item route and clear the group.
  const unselected = page.getByRole("group", { name: /COPICU_SYNTH_MARKDOWN/ });
  await unselected.click({ button: "right" });
  await expect(menu.getByRole("menuitem", { name: "Copy", exact: true })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Paste", exact: true })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Join selected", exact: true })).toHaveCount(0);
  await expect(menu.getByRole("menuitem", { name: "Edit tags for selected" })).toHaveCount(0);
  await expect(menu.getByRole("menuitem", { name: "Delete 2 selected", exact: true })).toHaveCount(0);
  await expect(page.locator(".selection-menu-button")).toHaveAccessibleName(
    "Open selected clips menu, 0 selected",
  );
});

test("image context menu prioritizes preview and metadata without text editing", async ({ page }) => {
  await mockTauriInvoke(page, [syntheticCompactPreviewHistory[2]]);
  await gotoShell(page);
  await page.locator(".feed-item").first().click({ button: "right" });
  const menu = page.getByRole("menu", { name: "Item actions", exact: true });
  await expect(menu.getByRole("menuitem").first()).toContainText("Preview");
  await expect(menu.getByRole("menuitem").nth(1)).toContainText("Edit metadata");
  await expect(menu.getByRole("menuitem", { name: "Quick edit", exact: true })).toHaveCount(0);
  const more = await openItemSubmenu(page, "More actions");
  await expect(more.getByRole("menuitem", { name: "Open assistant", exact: true })).toBeVisible();
  await expect(more.getByRole("menuitem", { name: "Open full editor", exact: true })).toHaveCount(0);
  await expect(more.getByRole("menuitem", { name: "Edit externally", exact: true })).toHaveCount(0);
});

test("item context menu keeps touch targets and opens submenus by tapping", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, viewport: { width: 420, height: 640 }, hasTouch: true });
  const page = await context.newPage();
  try {
    await mockTauriInvoke(page, [syntheticLongHistory[1]]);
    await gotoShell(page);
    await page.locator(".feed-item").first().tap();
    await page.getByRole("button", { name: "Open item actions" }).tap();
    const menu = page.getByRole("menu", { name: "Item actions", exact: true });
    const heights = await menu.getByRole("menuitem").evaluateAll((items) => items.map((item) => item.getBoundingClientRect().height));
    expect(heights.length).toBe(8);
    expect(heights.every((height) => height >= 44)).toBe(true);
    await menu.getByRole("menuitem", { name: "Organize", exact: true }).tap();
    const organize = page.getByRole("menu", { name: "Organize", exact: true });
    await expect(organize).toBeVisible();
    expect(await organize.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      return bounds.left >= 0 && bounds.right <= window.innerWidth
        && bounds.top >= 0 && bounds.bottom <= window.innerHeight;
    })).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await organize.getByRole("menuitem", { name: "Copy clip to folder…", exact: true }).tap();
    await expect(page.getByRole("dialog", { name: "copyItems folder", exact: true })).toBeVisible();
    await expect(menu).toBeHidden();
  } finally {
    await context.close();
  }
});

test("built-in action uses ids only and shows stacked toast", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page);

  await selectLongSingleLineAndUnbroken(page);
  await page.getByRole("group", { name: /COPICU_SYNTH_LONG_UNBROKEN/ }).click({
    button: "right",
  });
  await openItemSubmenu(page, "More actions");
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

  await page.getByRole("group", { name: /COPICU_SYNTH_LONG_SINGLE_LINE/ }).click();
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
});

test("quick actions opens with F6 and runs contextual script", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page);

  await selectLongSingleLine(page);
  await page.keyboard.press("F6");
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

  const first = page.getByRole("group", { name: /COPICU_SYNTH_LONG_SINGLE_LINE/ });
  const second = page.getByRole("group", { name: /COPICU_SYNTH_LONG_UNBROKEN/ });
  await first.click({ modifiers: ["Control"] });
  await second.click({ modifiers: ["Control"] });
  await expect(first).toHaveClass(/is-multi-selected/);
  await expect(second).toHaveClass(/is-multi-selected/);

  await page.keyboard.press("F6");
  const picker = page.getByRole("dialog", { name: "Quick Actions" });
  await expect(picker).toBeVisible();
  await expect(picker.getByRole("option", { name: /Join selected/ })).toBeVisible();
  await expect(picker.getByRole("option", { name: /Open URL/ })).toHaveCount(0);
});

test("action filter effect settles history instead of leaving Filtering", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page);

  await page.getByRole("group", { name: /COPICU_SYNTH_LONG_SINGLE_LINE/ }).click();
  await page.keyboard.press("Control+K");
  await page.getByRole("option", { name: /url-open-or-filter/ }).click();

  await expect(page.getByLabel("Search clipboard history")).toHaveText("unbroken");
  await expect(page.locator("[title='Result count']")).toHaveText("1 / 4 matches");
  await expect(page.getByRole("group", { name: /COPICU_SYNTH_LONG_UNBROKEN/ })).toBeVisible();
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

for (const hideTrigger of ["Escape", "hide button"] as const) {
  test(`hiding picker via ${hideTrigger} resets selection and preserves marks`, async ({ page }) => {
    await mockTauriInvoke(page, syntheticLongHistory, null, {
      appearance: { itemActions: "inline" },
    });
    await gotoShell(page);

    await page.locator(".history-feed.has-items > li").first().hover();
    await page.getByLabel("Mark item").first().click();
    const rows = page.locator(".history-feed.has-items > li");
    await rows.nth(1).hover();
    await rows.nth(1).getByLabel("Select item").click();
    await rows.nth(2).hover();
    await rows.nth(2).getByLabel("Select item").click();
    await expect(page.locator(".selection-menu-count")).toHaveText("2");

    if (hideTrigger === "Escape") {
      await page.getByLabel("Search clipboard history").focus();
      await page.keyboard.press("Escape");
    } else {
      await page.getByLabel("Hide Copicu").click();
    }
    await expect(page.locator(".selection-menu-count")).toHaveText("0");
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));

    await expect(page.getByLabel("Select item")).toHaveCount(4);
    await expect(page.getByLabel("Unmark item")).toHaveCount(1);
    await expect(page.locator(".feed-item").first()).toHaveAttribute("aria-current", "true");
  });
}

test("reopening after hidden capture never exposes the previous feed while refresh is delayed", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page);
  await waitForDefaultHistoryReady(page);

  const previousRow = page.locator(".history-feed .feed-item").first();
  await expect(previousRow).toBeVisible();
  await page.getByLabel("Hide Copicu").click();

  const newItemText = "COPICU_SYNTH_REOPEN_FRESH";
  await page.evaluate((text) => {
    const runtime = window as Window & {
      __copicuTestWindowVisible: boolean;
      __copicuTestHistoryItems: Array<{ id: number; text: string; preview_text?: string; normalized_hash: string }>;
      __copicuTestPickerSessionSnapshots: Array<{ reset: boolean; generation: number; pendingActivationItemId: number }>;
      __copicuTestMockOptions: MockTauriOptions;
    };
    runtime.__copicuTestWindowVisible = false;
    runtime.__copicuTestHistoryItems.unshift({
      ...runtime.__copicuTestHistoryItems[0],
      id: 9902,
      text,
      preview_text: text,
      normalized_hash: "reopen-fresh-9902",
    });
    runtime.__copicuTestPickerSessionSnapshots.push({
      reset: true,
      generation: 1,
      pendingActivationItemId: 9902,
    });
    runtime.__copicuTestMockOptions.historySearchDelayMs = 1000;
    runtime.__copicuTestWindowVisible = true;
    window.dispatchEvent(new Event("focus"));
  }, newItemText);

  const reopeningFrame = await page.evaluate(() => ({
    previousRowVisible: Array.from(document.querySelectorAll<HTMLElement>(".history-feed .feed-item"))
      .some((row) => getComputedStyle(row).visibility === "visible"),
    loadingVisible: (() => {
      const status = document.querySelector<HTMLElement>(".history-reopen-loading");
      return status !== null && getComputedStyle(status).display !== "none";
    })(),
  }));
  expect(reopeningFrame).toEqual({ previousRowVisible: false, loadingVisible: true });
  await expect(page.locator("#history-item-9902")).toBeVisible();
  await expect(page.locator(".history-feed .feed-item").first()).toContainText(newItemText);
});

test("native show refreshes a hidden picker without a new WebView focus event", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page);
  await waitForDefaultHistoryReady(page);

  await page.evaluate(async () => {
    const runtime = window as Window & {
      __copicuTestWindowVisible: boolean;
      __copicuTestHistoryItems: Array<{ id: number; text: string; preview_text?: string; normalized_hash: string }>;
      __copicuTestPickerSessionSnapshots: Array<{ reset: boolean; generation: number; pendingActivationItemId: number }>;
      __copicuTestEmitEvent: (name: string, payload: null) => Promise<number>;
    };
    runtime.__copicuTestWindowVisible = false;
    await runtime.__copicuTestEmitEvent("copicu://picker/hidden", null);
    runtime.__copicuTestHistoryItems.unshift({
      ...runtime.__copicuTestHistoryItems[0],
      id: 9911,
      text: "COPICU_SYNTH_SHOW_WITHOUT_FOCUS",
      preview_text: "COPICU_SYNTH_SHOW_WITHOUT_FOCUS",
      normalized_hash: "show-without-focus-9911",
    });
    runtime.__copicuTestPickerSessionSnapshots.push({
      reset: true,
      generation: 1,
      pendingActivationItemId: 9911,
    });
    runtime.__copicuTestWindowVisible = true;
    await runtime.__copicuTestEmitEvent("copicu://picker/shown", null);
  });

  await expect(page.locator("#history-item-9911")).toBeVisible();
  await expect(page.getByRole("status", { name: "Updating clipboard history" })).toBeHidden();
});

test("native show and focus together still reveal fresh history", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page);
  await waitForDefaultHistoryReady(page);

  await page.evaluate(async () => {
    const runtime = window as Window & {
      __copicuTestWindowVisible: boolean;
      __copicuTestHistoryItems: Array<{ id: number; text: string; preview_text?: string; normalized_hash: string }>;
      __copicuTestPickerSessionSnapshots: Array<{ reset: boolean; generation: number; pendingActivationItemId: number }>;
      __copicuTestMockOptions: MockTauriOptions;
      __copicuTestEmitEvent: (name: string, payload: null) => Promise<number>;
    };
    runtime.__copicuTestWindowVisible = false;
    await runtime.__copicuTestEmitEvent("copicu://picker/hidden", null);
    runtime.__copicuTestHistoryItems.unshift({
      ...runtime.__copicuTestHistoryItems[0],
      id: 9912,
      text: "COPICU_SYNTH_CONCURRENT_SHOW",
      preview_text: "COPICU_SYNTH_CONCURRENT_SHOW",
      normalized_hash: "concurrent-show-9912",
    });
    runtime.__copicuTestPickerSessionSnapshots.push({
      reset: true,
      generation: 1,
      pendingActivationItemId: 9912,
    });
    runtime.__copicuTestMockOptions.pickerSessionDelayMs = 50;
    runtime.__copicuTestMockOptions.historySearchDelaySequenceMs = [300, 0];
    runtime.__copicuTestWindowVisible = true;
    await runtime.__copicuTestEmitEvent("copicu://picker/shown", null);
    window.dispatchEvent(new Event("focus"));
  });

  await expect(page.locator("#history-item-9912")).toBeVisible();
  await expect(page.getByRole("status", { name: "Updating clipboard history" })).toBeHidden();
});

test("native hide keeps stale clips concealed through a failed refresh and Retry", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page);
  await waitForDefaultHistoryReady(page);

  const hiddenListeners = await page.evaluate(async () => {
    const runtime = window as Window & {
      __copicuTestWindowVisible: boolean;
      __copicuTestHistoryItems: Array<{ id: number; text: string; preview_text?: string; normalized_hash: string }>;
      __copicuTestPickerSessionSnapshots: Array<{ reset: boolean; generation: number; pendingActivationItemId: number }>;
      __copicuTestMockOptions: MockTauriOptions;
      __copicuTestEmitEvent: (name: string, payload: null) => Promise<number>;
    };
    runtime.__copicuTestWindowVisible = false;
    const listeners = await runtime.__copicuTestEmitEvent("copicu://picker/hidden", null);
    runtime.__copicuTestHistoryItems.unshift({
      ...runtime.__copicuTestHistoryItems[0],
      id: 9903,
      text: "COPICU_SYNTH_NATIVE_REOPEN",
      preview_text: "COPICU_SYNTH_NATIVE_REOPEN",
      normalized_hash: "native-reopen-9903",
    });
    runtime.__copicuTestPickerSessionSnapshots.push({
      reset: true,
      generation: 1,
      pendingActivationItemId: 9903,
    });
    runtime.__copicuTestMockOptions.historySearchFailNext = true;
    runtime.__copicuTestWindowVisible = true;
    window.dispatchEvent(new Event("focus"));
    return listeners;
  });
  expect(hiddenListeners).toBeGreaterThan(0);
  await expect(page.getByRole("alert")).toContainText("Synthetic history failure");
  await expect(page.locator(".history-feed .feed-item").first()).toBeHidden();
  await expect(page.getByRole("status", { name: "Could not update clipboard history." })).toBeVisible();

  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.locator(".history-feed .feed-item").first()).toContainText("COPICU_SYNTH_NATIVE_REOPEN");
  await expect(page.locator(".history-feed .feed-item").first()).toBeVisible();
});

test("capture while picker is hidden becomes the active first item on reopen", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page);

  await page.getByRole("group", { name: /COPICU_SYNTH_LONG_UNBROKEN/ }).click();
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

  const capturedItem = page.getByRole("group", { name: newItemText });
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

  await page.getByRole("group", { name: /COPICU_SYNTH_IMAGE_ONLY/ }).click();
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
  await search.press("Home");
  for (let index = 0; index < 7; index += 1) {
    await search.press("ArrowRight");
  }
  for (let index = 0; index < 6; index += 1) {
    await search.press("Shift+ArrowRight");
  }
  await page.keyboard.press("Delete");
  await expect(search).toHaveText("COPICU__GUARD");
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
  await selectLongSingleLineAndUnbroken(page);
  await search.fill("#path");
  await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
  await page.keyboard.type("constelaciones");

  await expect(search).toHaveText("constelaciones");
  await expect(page.locator(".feed-item.is-multi-selected")).toHaveCount(0);
});

test("selection menu deletes selected items when current differs", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page);

  await selectLongSingleLineAndUnbroken(page);
  await page.getByLabel("Search clipboard history").press("ArrowDown");
  await expect(page.getByRole("group", { name: /COPICU_SYNTH_MULTILINE/ })).toHaveAttribute("aria-current", "true");
  const menu = await openSelectionMenu(page);
  await menu.getByRole("menuitem", { name: "Delete 2 selected", exact: true }).click();

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

test("multi selection tag action opens the frozen selection in the standalone inspector", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page);

  await selectLongSingleLineAndUnbroken(page);
  await page.getByLabel("Search clipboard history").press("ArrowDown");
  const menu = await openSelectionMenu(page);
  await menu.getByRole("menuitem", { name: "Edit tags for selected" }).click();


  const call = await page.waitForFunction(() => {
    const runtime = window as MetadataVisualRuntime;
    return (runtime.__copicuTestInvocations ?? []).find((entry) => entry.cmd === "open_metadata_window") ?? false;
  });
  // The mock bridge returns the recorded invocation after waitForFunction observes it.
  const invocation = await call.jsonValue() as unknown as { args: { request: { itemIds: number[]; focusTarget: string } } };
  expect(invocation.args.request).toEqual({
    itemIds: [101, 102],
    focusTarget: "tags",
  });
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
  await page.getByLabel("Search settings").fill("zoom");
  const imageHoverPreview = page.getByRole("radiogroup", { name: "Image hover zoom" });
  await expect(imageHoverPreview.getByRole("radio", { name: "Off" })).toBeChecked();
  await imageHoverPreview.getByText("Ctrl + hover", { exact: true }).click();
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
  await expect(page.getByLabel("App shortcuts")).toContainText("Edit in external editor");
  const externalShortcutInput = page.getByLabel("External editor global shortcut manual value");
  await externalShortcutInput.fill("Ctrl+Alt+E");
  await externalShortcutInput.press("Enter");
  await expect(page.getByLabel("External editor global shortcut", { exact: true })).toContainText("Ctrl");
  const externalShortcutSection = page
    .getByLabel("App shortcuts")
    .locator(".hotkey-inventory-item")
    .filter({ hasText: "Edit in external editor" });
  await expect(externalShortcutSection).toContainText("Registered");
  await page.getByRole("button", { name: "Edit shortcut" }).first().click();
  await expect(page.getByText("Manual source edit")).toBeVisible();
  await expect(page.getByText("Current shortcut")).toBeVisible();
  await page.getByRole("button", { name: "Open this file" }).click();
  await page.getByRole("button", { name: "Refresh diagnostics" }).click();
  await expect(page.getByText("Scripts refreshed")).toBeVisible();
  const invocations = await page.evaluate(() => (window as any).__copicuTestInvocations);
  expect(invocations.some((entry: any) => entry.cmd === "edit_script_in_vscode")).toBe(true);
  expect(invocations.some((entry: any) => entry.cmd === "refresh_script_action_cache")).toBe(true);
  await page.getByLabel("Search settings").fill("appearance");
  const colorMode = page.getByRole("radiogroup", { name: "Color mode" });
  await expect(colorMode).toBeVisible();
  await expect(page.getByLabel("Retention count")).toHaveCount(0);
  await colorMode.getByText("Dark", { exact: true }).click();
  const themePicker = page.getByRole("radiogroup", { name: "Theme" });
  await expect(themePicker.getByRole("radio")).toHaveCount(8);
  for (const themeName of ["Midnight", "Blueprint", "Moss", "Rose", "High Contrast"]) {
    await expect(themePicker.getByRole("radio", { name: themeName })).toBeVisible();
  }
  await themePicker.getByRole("radio", { name: "Code" }).click();
  await page.getByRole("radiogroup", { name: "Density" })
    .getByText("Compact", { exact: true })
    .click();
  await page.getByRole("radiogroup", { name: "Image preview" }).getByText("Medium", { exact: true }).click();
  await page.getByRole("radiogroup", { name: "Item actions" }).getByText("Menu only", { exact: true }).click();
  await page.getByRole("radiogroup", { name: "Action size" }).getByText("Large", { exact: true }).click();
  await page.getByRole("radiogroup", { name: "Text preview lines" }).getByText("6 lines", { exact: true }).click();
  await page.getByRole("radiogroup", { name: "Item details" }).getByText("Selected only", { exact: true }).click();
  await expect(page.getByLabel("Code dark appearance preview")).toBeVisible();

  await page.getByLabel("Search settings").fill("");
  await page.getByRole("tab", { name: /Editor/ }).click();
  const externalEditorPath = page.getByLabel("External editor path");
  await expect(externalEditorPath).toHaveValue("");
  await page.getByRole("button", { name: "Detect" }).click();
  await expect(externalEditorPath).toHaveValue(/Microsoft VS Code[\\/]Code\.exe$/);
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
  await page.waitForFunction(() => document.documentElement.dataset.density === "compact");
  await page.waitForFunction(() => {
    const root = getComputedStyle(document.documentElement);
    return root.getPropertyValue("--accent").trim() === "#95d5a8";
  });
  const savedSettings = await page.evaluate(() => (window as any).__copicuTestSettings);
  expect(savedSettings.appearance.theme).toBe("dark");
  expect(savedSettings.appearance.themeId).toBe("code");
  expect(savedSettings.appearance.imagePreview).toBe("medium");
  expect(savedSettings.appearance.itemActions).toBe("menuOnly");
  expect(savedSettings.appearance.actionSize).toBe("large");
  expect(savedSettings.appearance.textPreviewLines).toBe(6);
  expect(savedSettings.appearance.itemDetails).toBe("selectedOnly");
  expect(savedSettings.appearance.density).toBe("compact");
  expect(savedSettings.editor).toMatchObject({
    fontFamily: "consolas",
    fontSize: 16,
    lineHeight: "relaxed",
    wrapLines: false,
    tabSize: 2,
    lineNumbers: true,
    highlightActiveLine: false,
    externalEditorPath: "C:\\Users\\JP\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe",
  });
  expect(savedSettings.general.captureEnabled).toBe(false);
  expect(savedSettings.picker.previewShortcut).toBe("F3");
  expect(savedSettings.appearance.imageHoverPreview).toBe("ctrlHover");
  expect(savedSettings.picker.externalEditorShortcut).toBe("Ctrl+Alt+E");

  await page.getByLabel("Search settings").fill("ai");
  await expect(page.getByLabel("AI endpoint")).toBeVisible();
  await expect(page.getByLabel("AI model")).toBeVisible();
  await expect(page.getByLabel("AI API key")).toBeVisible();
});

test("Appearance autosaves immediately from confirmed settings and broadcasts", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page, "/?window=settings");

  const captureSwitch = page.getByRole("switch", { name: "Capture clipboard changes" });
  await captureSwitch.click();
  await page.getByRole("tab", { name: /Appearance/ }).click();
  await expect(page.getByText(
    "Changes here save automatically. Sharing has its own save buttons. Save and Cancel apply to other preferences.",
  )).toBeVisible();
  await page.getByRole("radiogroup", { name: "Color mode" })
    .getByText("Dark", { exact: true })
    .click();

  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.waitForFunction(() =>
    (window as SettingsRaceRuntime).__copicuTestInvocations
      .some((entry) => entry.cmd === "update_settings"),
  );
  const result = await page.evaluate(() => {
    const calls = (window as SettingsRaceRuntime).__copicuTestInvocations;
    const update = calls.find((entry) => entry.cmd === "update_settings");
    if (!update?.args?.settings) throw new Error("Appearance update was not recorded");
    return {
      payload: update.args.settings,
      updateCount: calls.filter((entry) => entry.cmd === "update_settings").length,
      broadcastCount: calls.filter(
        (entry) =>
          entry.cmd === "plugin:event|emit"
          && entry.args?.event === "copicu://settings/updated",
      ).length,
    };
  });
  expect(result.payload.appearance.theme).toBe("dark");
  expect(result.payload.general.captureEnabled).toBe(true);
  expect(result.updateCount).toBe(1);
  expect(result.broadcastCount).toBe(1);
});

test("Appearance autosave waits for bootstrap before composing its settings payload", async ({ page }) => {
  await mockTauriInvoke(page, syntheticLongHistory, null, {
    appearance: { theme: "light" },
    editorSettings: { fontSize: 17 },
    settingsLoadDelayMs: 1000,
  });
  await gotoShell(page, "/?window=settings");
  await page.getByRole("tab", { name: /Appearance/ }).click();
  const colorMode = page.getByRole("radiogroup", { name: "Color mode" });
  await colorMode.getByText("Dark", { exact: true }).click();
  await expect(colorMode.getByRole("radio", { name: "Dark" })).toBeChecked();

  await page.waitForFunction(() =>
    (window as SettingsRaceRuntime).__copicuTestInvocations
      .some((entry) => entry.cmd === "update_settings"),
  );
  const update = await page.evaluate(() =>
    (window as SettingsRaceRuntime).__copicuTestInvocations
      .find((entry) => entry.cmd === "update_settings")?.args?.settings,
  );
  expect(update?.appearance.theme).toBe("dark");
  expect(update?.editor.fontSize).toBe(17);
  await expect(colorMode.getByRole("radio", { name: "Dark" })).toBeChecked();
});

test("rapid Appearance writes stay serialized and last-write-wins", async ({ page }) => {
  await mockTauriInvoke(page, syntheticLongHistory, null, {
    appearance: { theme: "system" },
    settingsUpdateDelaySequenceMs: [1000, 0, 0],
    settingsUpdateFailureSequence: [null, "stale Appearance failure", null],
  });
  await gotoShell(page, "/?window=settings");
  await page.getByRole("tab", { name: /Appearance/ }).click();

  const colorMode = page.getByRole("radiogroup", { name: "Color mode" });
  await colorMode.getByText("Light", { exact: true }).click();
  await colorMode.getByText("Dark", { exact: true }).click();
  await colorMode.getByText("System", { exact: true }).click();
  await expect(colorMode.getByRole("radio", { name: "System" })).toBeChecked();

  await page.waitForFunction(() =>
    (window as SettingsRaceRuntime).__copicuTestInvocations.filter(
      (entry) => entry.cmd === "update_settings",
    ).length === 3,
  );
  await expect(colorMode.getByRole("radio", { name: "System" })).toBeChecked();
  await expect.poll(async () =>
    page.evaluate(() => (window as SettingsRaceRuntime).__copicuTestSettings.appearance.theme),
  ).toBe("system");
  await expect(page.getByText(/stale Appearance failure/)).toHaveCount(0);
  expect(await page.evaluate(() =>
    (window as SettingsRaceRuntime).__copicuTestSettingsUpdateMaxActive,
  )).toBe(1);
});

test("current Appearance failure rolls back to confirmed value with actionable error", async ({ page }) => {
  await mockTauriInvoke(page, syntheticLongHistory, null, {
    appearance: { density: "standard" },
    settingsUpdateDelaySequenceMs: [500],
    settingsUpdateFailureSequence: ["synthetic Appearance write failed"],
  });
  await gotoShell(page, "/?window=settings");
  await page.getByRole("tab", { name: /Appearance/ }).click();

  const density = page.getByRole("radiogroup", { name: "Density" });
  await density.getByText("Compact", { exact: true }).click();
  await expect(density.getByRole("radio", { name: "Compact" })).toBeChecked();
  await expect(page.getByText(
    /Appearance couldn't be saved\. Try the change again\./,
  ).first()).toBeVisible();
  await expect(page.getByText(/synthetic Appearance write failed/).first()).toBeVisible();
  await expect(density.getByRole("radio", { name: "Standard" })).toBeChecked();
  await expect(page.locator("html")).toHaveAttribute("data-density", "standard");
  expect(await page.evaluate(() =>
    (window as SettingsRaceRuntime).__copicuTestInvocations.filter(
      (entry) => entry.cmd === "plugin:event|emit"
        && entry.args?.event === "copicu://settings/updated",
    ).length,
  )).toBe(0);
});

test("Save and Cancel preserve autosaved Appearance and isolate other drafts", async ({ page }) => {
  await mockTauriInvoke(page, syntheticLongHistory, null, {
    appearance: { density: "standard" },
    settingsUpdateDelaySequenceMs: [0, 180, 0],
  });
  await gotoShell(page, "/?window=settings");

  const captureSwitch = page.getByRole("switch", { name: "Capture clipboard changes" });
  await captureSwitch.click();
  await page.getByRole("tab", { name: /Appearance/ }).click();
  const density = page.getByRole("radiogroup", { name: "Density" });
  await density.getByText("Compact", { exact: true }).click();
  await expect.poll(async () =>
    page.evaluate(() => (window as SettingsRaceRuntime).__copicuTestSettings.appearance.density),
  ).toBe("compact");
  await page.getByRole("button", { name: "Cancel" }).click();

  await page.getByRole("tab", { name: /General/ }).click();
  await expect(captureSwitch).toBeChecked();
  await captureSwitch.click();
  await page.getByRole("tab", { name: /Appearance/ }).click();
  await expect(density.getByRole("radio", { name: "Compact" })).toBeChecked();
  await density.getByText("Standard", { exact: true }).click();
  await page.getByRole("button", { name: "Save" }).click();

  await page.waitForFunction(() =>
    (window as SettingsRaceRuntime).__copicuTestInvocations.filter(
      (entry) => entry.cmd === "update_settings",
    ).length === 3,
  );
  const updates = await page.evaluate(() =>
    (window as SettingsRaceRuntime).__copicuTestInvocations
      .filter((entry) => entry.cmd === "update_settings")
      .map((entry) => entry.args?.settings),
  );
  await expect.poll(async () =>
    page.evaluate(() => (window as SettingsRaceRuntime).__copicuTestSettings.general.captureEnabled),
  ).toBe(false);
  expect(updates[0]?.general.captureEnabled).toBe(true);
  expect(updates[0]?.appearance.density).toBe("compact");
  expect(updates[1]?.general.captureEnabled).toBe(true);
  expect(updates[1]?.appearance.density).toBe("standard");
  expect(updates[2]?.general.captureEnabled).toBe(false);
  expect(updates[2]?.appearance.density).toBe("standard");
  expect(await page.evaluate(() =>
    (window as SettingsRaceRuntime).__copicuTestSettingsUpdateMaxActive,
  )).toBe(1);
});

test("Appearance controls keep keyboard focus and all themes usable", async ({ page }) => {
  await mockTauriInvoke(page, syntheticLongHistory, null, {
    appearance: { theme: "system", themeId: "default", density: "standard" },
  });
  await gotoShell(page, "/?window=settings");
  await page.getByRole("tab", { name: /Appearance/ }).click();

  const colorMode = page.getByRole("radiogroup", { name: "Color mode" });
  const systemMode = colorMode.getByRole("radio", { name: "System" });
  await systemMode.focus();
  await expect(systemMode).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(colorMode.getByRole("radio", { name: "Light" })).toBeChecked();

  const themePicker = page.getByRole("radiogroup", { name: "Theme" });
  const defaultTheme = themePicker.getByRole("radio", { name: "Default" });
  await defaultTheme.focus();
  await page.keyboard.press("End");
  const roseTheme = themePicker.getByRole("radio", { name: "Rose" });
  await expect(roseTheme).toBeFocused();
  await expect(roseTheme).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("Home");
  await expect(defaultTheme).toBeFocused();
  await expect(defaultTheme).toHaveAttribute("aria-checked", "true");

  const density = page.getByRole("radiogroup", { name: "Density" });
  const standardDensity = density.getByRole("radio", { name: "Standard" });
  await standardDensity.focus();
  await page.keyboard.press("ArrowRight");
  await expect(density.getByRole("radio", { name: "Compact" })).toBeChecked();
  const imagePreview = page.getByRole("radiogroup", { name: "Image preview" });
  await imagePreview.getByRole("radio", { name: "Large" }).focus();
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  await expect(imagePreview.getByRole("radio", { name: "Small" })).toBeChecked();
  const syntheticImage = page.getByLabel("Synthetic image preview");
  await expect.poll(() => syntheticImage.evaluate((element) =>
    element.getBoundingClientRect().height)).toBe(64);
  await imagePreview.getByText("Medium", { exact: true }).click();
  await expect.poll(() => syntheticImage.evaluate((element) =>
    element.getBoundingClientRect().height)).toBe(96);
  await imagePreview.getByText("Large", { exact: true }).click();
  await expect.poll(() => syntheticImage.evaluate((element) =>
    element.getBoundingClientRect().height)).toBe(
    page.viewportSize()!.width <= 760 ? 164 : 200,
  );
  const actionSize = page.getByRole("radiogroup", { name: "Action size" });
  await expect(actionSize.getByRole("radio")).toHaveCount(4);
  const syntheticActions = page.locator(".appearance-preview-actions");
  await expect(syntheticActions).toHaveCSS("opacity", "0");
  await page.locator(".appearance-preview").hover();
  await expect(syntheticActions).toHaveCSS("opacity", "1");
  await actionSize.getByText("Small", { exact: true }).click();
  const syntheticAction = syntheticActions.locator("span").first();
  await expect(syntheticAction).toHaveCSS("width", "24px");
  await expect(syntheticAction).toHaveCSS("border-top-color", "rgba(0, 0, 0, 0)");
  await actionSize.getByText("Medium", { exact: true }).click();
  await expect(syntheticAction).toHaveCSS("width", "32px");

  const textPreview = page.getByRole("radiogroup", { name: "Text preview lines" });
  await textPreview.getByRole("radio", { name: "4 lines" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(textPreview.getByRole("radio", { name: "6 lines" })).toBeChecked();

  const columns = await page.locator(".appearance-theme-grid").evaluate(
    (element) => getComputedStyle(element).gridTemplateColumns.split(" ").length,
  );
  expect(columns).toBe(page.viewportSize()!.width <= 560 ? 1 : 2);
});

test("Settings broadcast beats delayed bootstrap without autosave loops", async ({ page }) => {
  await mockTauriInvoke(page, syntheticLongHistory, null, {
    appearance: { theme: "light", themeId: "default", density: "standard" },
    settingsLoadDelayMs: 200,
  });
  await gotoShell(page, "/?window=settings");
  await page.waitForFunction(() =>
    (window as SettingsRaceRuntime).__copicuTestInvocations
      .some((entry) => entry.cmd === "get_settings"),
  );
  await page.evaluate(async () => {
    const runtime = window as SettingsRaceRuntime;
    const nextSettings: AppSettings = {
      ...runtime.__copicuTestSettings,
      appearance: {
        theme: "dark",
        themeId: "highContrast",
        density: "compact",
        imagePreview: "small",
        itemActions: "menuOnly",
        actionSize: "large",
        textPreviewLines: 6,
        itemDetails: "selectedOnly",
      },
    };
    runtime.__copicuTestSettings = nextSettings;
    const invoked = await runtime.__copicuTestEmitEvent(
      "copicu://settings/updated",
      nextSettings,
    );
    if (invoked < 1) throw new Error("Settings update listener was not registered");
  });
  await expect(page.locator("html")).toHaveAttribute("data-theme-id", "highContrast");
  await expect(page.locator("html")).toHaveAttribute("data-density", "compact");
  await page.waitForTimeout(250);
  await expect(page.locator("html")).toHaveAttribute("data-theme-id", "highContrast");
  await expect(page.locator("html")).toHaveAttribute("data-image-preview", "small");
  await expect(page.locator("html")).toHaveAttribute("data-item-actions", "menuOnly");
  await expect(page.locator("html")).toHaveAttribute("data-action-size", "large");
  await expect(page.locator("html")).toHaveAttribute("data-text-preview-lines", "6");
  await expect(page.locator("html")).toHaveAttribute("data-item-details", "selectedOnly");
  await expect(page.locator("html")).toHaveAttribute("data-density", "compact");

  await page.getByRole("tab", { name: /Appearance/ }).click();
  await expect(page.getByRole("radio", { name: "High Contrast" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await expect(page.getByRole("radiogroup", { name: "Density" })
    .getByRole("radio", { name: "Compact" })).toBeChecked();
  await expect(page.getByRole("radiogroup", { name: "Image preview" })
    .getByRole("radio", { name: "Small" })).toBeChecked();
  await expect(page.getByRole("radiogroup", { name: "Item actions" })
    .getByRole("radio", { name: "Menu only" })).toBeChecked();
  expect(await page.evaluate(() =>
    (window as SettingsRaceRuntime).__copicuTestInvocations.filter(
      (entry) => entry.cmd === "update_settings",
    ).length,
  )).toBe(0);
});


test("invalid and legacy Appearance values normalize to closed defaults", async ({ page }) => {
  await mockTauriInvoke(page, syntheticLongHistory, null, {
    appearance: {
      imagePreview: "oversized",
      itemActions: "floating",
      actionSize: "tiny",
      textPreviewLines: 12,
      itemDetails: "never",
    } as unknown as Partial<AppSettings["appearance"]>,
  });
  await gotoShell(page);

  await expect(page.locator("html")).toHaveAttribute("data-image-preview", "large");
  await expect(page.locator("html")).toHaveAttribute("data-item-actions", "auto");
  await expect(page.locator("html")).toHaveAttribute("data-action-size", "auto");
  await expect(page.locator("html")).toHaveAttribute("data-text-preview-lines", "4");
  await expect(page.locator("html")).toHaveAttribute("data-item-details", "always");
});

test("image, text and detail geometry follows Appearance without false expansion", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 720 });
  const appearanceHistory = [
    syntheticLongHistory[3],
    syntheticCompactPreviewHistory[0],
    syntheticAppearanceMarkdownImage,
    syntheticCompactPreviewHistory[3],
  ];
  await mockTauriInvoke(page, appearanceHistory, null, {
    historyPageSizeOverride: appearanceHistory.length,
    appearance: { imagePreview: "large", textPreviewLines: 4, itemDetails: "always" },
  });
  await gotoShell(page);
  await expect(page.locator("[title='Result count']")).toHaveText("4 total");

  const multiline = page.locator("#history-item-103");
  const shortText = page.locator("#history-item-1201");
  await expect(multiline.getByRole("button", { name: "Show more" })).toBeVisible();
  await expect(shortText.getByRole("button", { name: "Show more" })).toHaveCount(0);

  for (const [lines, expectedMax] of [[2, 36], [4, 70], [6, 104]] as const) {
    await broadcastAppearance(page, { textPreviewLines: lines });
    const height = await multiline.locator("pre").evaluate((element) => element.clientHeight);
    expect(height).toBeLessThanOrEqual(expectedMax);
    expect(height).toBeGreaterThan(expectedMax - 22);
  }
  await multiline.getByRole("button", { name: "Show more" }).click();
  await expect(multiline.getByRole("button", { name: "Show less" })).toBeVisible();
  const expanded = await multiline.locator("pre").evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
  }));
  expect(expanded.clientHeight).toBeLessThan(expanded.scrollHeight);

  for (const [imagePreview, expected] of [["small", 64], ["medium", 96], ["large", 200]] as const) {
    await broadcastAppearance(page, { imagePreview });
    const regularHeight = await page.locator(".image-preview img").evaluate((element) => element.getBoundingClientRect().height);
    const markdownHeight = await page.locator(".markdown-image-frame img").first().evaluate((element) => element.getBoundingClientRect().height);
    expect(regularHeight).toBeLessThanOrEqual(expected);
    expect(markdownHeight).toBeLessThanOrEqual(expected);
    expect(Math.max(regularHeight, markdownHeight)).toBeGreaterThan(expected - 2);
  }
  await page.setViewportSize({ width: 420, height: 720 });
  await broadcastAppearance(page, { imagePreview: "large" });
  const responsiveImageHeight = await page.locator(".image-preview img")
    .evaluate((element) => element.getBoundingClientRect().height);
  const responsiveMarkdownHeight = await page.locator(".markdown-image-frame img").first()
    .evaluate((element) => element.getBoundingClientRect().height);
  expect(Math.max(responsiveImageHeight, responsiveMarkdownHeight)).toBeLessThanOrEqual(164);

  await broadcastAppearance(page, { itemDetails: "selectedOnly" });
  await expect(multiline.locator(".item-title")).toBeVisible();
  await expect(page.locator("#history-item-1300 .item-metadata")).toHaveCount(0);
  await page.locator("#history-item-1300 .feed-item").click();
  await expect(page.locator("#history-item-1300 .item-metadata")).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await expect(page.locator("#history-item-1204 .feed-item")).toHaveAttribute("aria-current", "true");
});

test("selected-only details keep the next row visible in a scrolled mixed feed", async ({ page }) => {
  const selectionHistory = Array.from({ length: 240 }, (_, index) => ({
    ...syntheticLongHistory[index % syntheticLongHistory.length],
    id: 30_000 + index,
    normalized_hash: `selection-anchor-${index}`,
    title: `Selection row ${index}`,
    notes: index % 2 === 0
      ? "First metadata line\nSecond metadata line\nThird metadata line"
      : null,
    tags: index % 2 === 0 ? "anchor, multiline" : null,
  }));
  await mockTauriInvoke(page, selectionHistory, null, {
    appearance: { itemDetails: "selectedOnly" },
    historyPageSizeOverride: selectionHistory.length,
  });
  await gotoShell(page);
  await expect(page.locator("[title='Result count']")).toHaveText("240 total");
  const feed = page.locator(".history-feed-scroll");
  await feed.evaluate((element) => element.scrollTo({ top: 4_000 }));
  await page.waitForTimeout(400);
  const pair = await feed.evaluate((element) => {
    const rows = Array.from(
      element.querySelectorAll<HTMLElement>('li[id^="history-item-"]'),
    ).sort((left, right) => Number(left.dataset.index) - Number(right.dataset.index));
    const pairIndex = rows.findIndex((row, index) =>
      index < rows.length - 1
      && Number(row.dataset.index) % 2 === 0
      && Number(rows[index + 1].dataset.index) === Number(row.dataset.index) + 1);
    const current = rows[pairIndex];
    const next = rows[pairIndex + 1];
    if (!current || !next) throw new Error("Expected consecutive visible selection rows");
    return {
      currentId: Number(current.id.replace("history-item-", "")),
      nextId: Number(next.id.replace("history-item-", "")),
    };
  });
  const currentRow = page.locator(`#history-item-${pair.currentId} .feed-item`);
  await currentRow.evaluate((element) => element.scrollIntoView({ block: "center" }));
  await page.waitForTimeout(100);
  await currentRow.click();
  const nextRow = page.locator(`#history-item-${pair.nextId} .feed-item`);
  await page.keyboard.press("ArrowDown");
  await expect(nextRow).toHaveAttribute("aria-current", "true");
  await expect.poll(async () => nextRow.evaluate((element) => {
    const viewport = document.querySelector(".history-feed-scroll")!.getBoundingClientRect();
    const row = element.closest("li")!.getBoundingClientRect();
    return row.top >= viewport.top + 4 && row.bottom <= viewport.bottom - 4;
  })).toBe(true);
});

test("desktop and narrow item action modes keep the complete menu reachable", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 720 });
  await mockTauriInvoke(page);
  await gotoShell(page);
  await waitForDefaultHistoryReady(page);
  const currentRow = page.locator("#history-item-100");

  await expect(currentRow.getByRole("button", { name: "Mark item" })).toHaveCSS("opacity", "0");
  await expect(currentRow.getByRole("button", { name: "Delete item" })).toHaveCSS("opacity", "0");
  await expect(currentRow.getByRole("button", { name: "Open item actions" })).toHaveCSS("opacity", "0");
  await currentRow.hover();
  await expect(currentRow.getByRole("button", { name: "Mark item" })).toHaveCSS("opacity", "1");
  await expect(currentRow.getByRole("button", { name: "Delete item" })).toHaveCSS("opacity", "1");
  await expect(currentRow.getByRole("button", { name: "Open item actions" })).toHaveCSS("opacity", "1");

  await page.setViewportSize({ width: 420, height: 720 });
  await page.mouse.move(0, 0);
  await expect(currentRow.getByRole("button", { name: "Mark item" })).toBeHidden();
  await expect(currentRow.getByRole("button", { name: "Delete item" })).toBeHidden();
  await expect(currentRow.getByRole("button", { name: "Open item actions" })).toHaveCSS("opacity", "0");
  await currentRow.hover();
  await currentRow.getByRole("button", { name: "Open item actions" }).click();
  const menu = page.getByRole("menu", { name: "Item actions" });
  await expect(menu.getByRole("menuitem", { name: "Delete item" })).toBeVisible();
  await expect((await openItemSubmenu(page, "Organize")).getByRole("menuitem", { name: "Mark", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(currentRow.getByRole("button", { name: "Open item actions" })).toBeFocused();
  await page.getByLabel("Search clipboard history").focus();

  await broadcastAppearance(page, { itemActions: "inline", actionSize: "large" });
  await page.mouse.move(0, 0);
  await expect(currentRow.getByRole("button", { name: "Mark item" })).toHaveCSS("opacity", "0");
  await currentRow.hover();
  await expect(currentRow.getByRole("button", { name: "Mark item" })).toHaveCSS("opacity", "1");
  await expect(currentRow.getByRole("button", { name: "Delete item" })).toHaveCSS("opacity", "1");
  await expect(currentRow.getByRole("button", { name: "Mark item" })).toHaveCSS("width", "44px");

  await broadcastAppearance(page, { itemActions: "inline", actionSize: "medium" });
  await expect(currentRow.getByRole("button", { name: "Mark item" })).toHaveCSS("width", "32px");

  await broadcastAppearance(page, { itemActions: "menuOnly", actionSize: "small" });
  await expect(currentRow.getByRole("button", { name: "Mark item" })).toBeHidden();
  await expect(currentRow.getByRole("button", { name: "Delete item" })).toBeHidden();
  const smallMenuButton = currentRow.getByRole("button", { name: "Open item actions" });
  await expect(smallMenuButton).toHaveCSS("width", "24px");
  await expect(smallMenuButton).toHaveCSS("border-top-color", "rgba(0, 0, 0, 0)");
  await expect(smallMenuButton).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
});

test("image zoom button follows the configured action size", async ({ page }) => {
  await mockTauriInvoke(page, [syntheticCompactPreviewHistory[2]], null, {
    appearance: { actionSize: "large" },
  });
  await gotoShell(page);
  await expect(page.locator("[title='Result count']")).toHaveText("1 total");

  const image = page.locator(".image-preview");
  const zoom = image.getByRole("button", { name: "Zoom image" });
  await image.hover();
  await expect(zoom).toHaveCSS("width", "44px");
  await expect(zoom.locator("svg")).toHaveCSS("width", "20px");

  await broadcastAppearance(page, { actionSize: "small" });
  await expect(zoom).toHaveCSS("width", "24px");
  await expect(zoom.locator("svg")).toHaveCSS("width", "14px");
  await expect(zoom).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
});

test("Auto action size keeps compact coarse-pointer rows separated", async ({ browser }) => {
  const context = await browser.newContext({
    hasTouch: true,
    viewport: { width: 900, height: 720 },
  });
  const page = await context.newPage();
  await mockTauriInvoke(page, syntheticLongHistory, null, {
    appearance: { density: "compact", actionSize: "auto", itemActions: "inline" },
  });
  await gotoShell(page);
  await waitForDefaultHistoryReady(page);

  const firstVisibleRow = page.locator(".history-feed li").first();
  await expect(firstVisibleRow.getByRole("button", { name: "Open item actions" }))
    .toHaveCSS("width", "44px");
  const rowGeometry = await page.locator(".history-feed li").evaluateAll((rows) => {
    const ordered = rows.slice(0, 8)
      .map((row) => row.getBoundingClientRect())
      .sort((left, right) => left.top - right.top);
    return {
      heights: ordered.map((rect) => rect.height),
      separations: ordered.slice(1).map((rect, index) => rect.top - ordered[index].bottom),
    };
  });
  expect(rowGeometry.heights.every((height) => height >= 58)).toBe(true);
  expect(rowGeometry.separations.every((gap) => gap >= -1)).toBe(true);
  await context.close();
});
for (const colorScheme of ["light", "dark"] as const) {
  test(`High Contrast ${colorScheme} focus indicators meet non-text contrast`, async ({ page }) => {
    await mockTauriInvoke(page, syntheticLongHistory, null, {
      appearance: { theme: colorScheme, themeId: "highContrast", density: "standard" },
    });
    await gotoShell(page);
    const pickerMenu = page.locator(".picker-menu-button");
    await pickerMenu.focus();
    await expect(pickerMenu).toBeFocused();
    const pickerContrast = await pickerMenu.evaluate((element) => {
      const resolveColor = (value: string) => {
        const probe = document.createElement("span");
        probe.style.color = value;
        document.body.append(probe);
        const resolved = getComputedStyle(probe).color;
        probe.remove();
        return resolved;
      };
      const luminance = (value: string) => {
        const channels = (resolveColor(value).match(/[\d.]+/g) ?? [])
          .slice(0, 3)
          .map((channel) => Number(channel) / 255)
          .map((channel) => channel <= 0.03928
            ? channel / 12.92
            : ((channel + 0.055) / 1.055) ** 2.4);
        return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
      };
      const root = getComputedStyle(document.documentElement);
      const style = getComputedStyle(element);
      const ring = luminance(style.outlineColor);
      const surface = luminance(root.getPropertyValue("--surface-raised"));
      const ratio = (Math.max(ring, surface) + 0.05) / (Math.min(ring, surface) + 0.05);
      return {
        ratio,
        outlineColor: style.outlineColor,
        outlineStyle: style.outlineStyle,
      };
    });
    expect(pickerContrast.ratio).toBeGreaterThanOrEqual(3);
    expect(pickerContrast.outlineStyle).toBe("solid");
    expect(pickerContrast.outlineColor).not.toBe("rgba(0, 0, 0, 0)");

    await gotoShell(page, "/?window=settings");
    await page.getByRole("tab", { name: /Appearance/ }).click();
    const highContrastTheme = page.getByRole("radio", { name: "High Contrast" });
    await highContrastTheme.focus();
    await expect(highContrastTheme).toBeFocused();
    await highContrastTheme.press("Space");
    const settingsContrast = await highContrastTheme.evaluate((element) => {
      const resolveColor = (value: string) => {
        const probe = document.createElement("span");
        probe.style.color = value;
        document.body.append(probe);
        const resolved = getComputedStyle(probe).color;
        probe.remove();
        return resolved;
      };
      const luminance = (value: string) => {
        const channels = (resolveColor(value).match(/[\d.]+/g) ?? [])
          .slice(0, 3)
          .map((channel) => Number(channel) / 255)
          .map((channel) => channel <= 0.03928
            ? channel / 12.92
            : ((channel + 0.055) / 1.055) ** 2.4);
        return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
      };
      const style = getComputedStyle(element);
      const outline = luminance(style.outlineColor);
      const background = luminance(style.backgroundColor);
      return {
        ratio: (Math.max(outline, background) + 0.05)
          / (Math.min(outline, background) + 0.05),
        outlineStyle: style.outlineStyle,
      };
    });
    expect(settingsContrast.ratio).toBeGreaterThanOrEqual(3);
    expect(settingsContrast.outlineStyle).toBe("solid");
  });
}

test("Appearance geometry remeasures a mixed virtual feed without moving its visual anchor", async ({ page }) => {
  const densityHistory = Array.from({ length: 1200 }, (_, index) => {
    const source = syntheticPagedHistory[index % syntheticPagedHistory.length];
    const identity = {
      id: 20_000 + index,
      normalized_hash: `density-${index}`,
    };
    if (index % 17 === 8) {
      return {
        ...syntheticCompactPreviewHistory[2],
        ...identity,
        normalized_hash: `density-image-${index}`,
      };
    }
    if (index % 23 === 3) {
      return {
        ...syntheticAppearanceMarkdownImage,
        ...identity,
        normalized_hash: `appearance-markdown-${index}`,
      };
    }
    if (index % 11 === 5) {
      return {
        ...syntheticLongHistory[3],
        ...identity,
        normalized_hash: `density-multiline-${index}`,
      };
    }
    return { ...source, ...identity };
  });
  await mockTauriInvoke(page, densityHistory, null, {
    appearance: { theme: "light", themeId: "default", density: "standard" },
    historyPageSizeOverride: densityHistory.length,
  });
  await gotoShell(page);
  await expect(page.locator("[title='Result count']")).toHaveText("1,200 total");

  const feed = page.locator(".history-feed-scroll");
  await feed.evaluate((element) => element.scrollTo({ top: 45_000 }));
  await page.waitForTimeout(500);
  const anchor = await feed.evaluate((element) => {
    const viewport = element.getBoundingClientRect();
    const rows = Array.from(element.querySelectorAll<HTMLElement>('li[id^="history-item-"]'));
    const row = rows.find((candidate) => {
      const rect = candidate.getBoundingClientRect();
      return rect.bottom > viewport.top && rect.top < viewport.bottom;
    });
    if (!row) throw new Error("Expected a visible density anchor");
    return {
      id: Number(row.id.replace("history-item-", "")),
      offset: row.getBoundingClientRect().top - viewport.top,
    };
  });

  const standardVisibleCount = await feed.evaluate((element) => {
    const viewport = element.getBoundingClientRect();
    return Array.from(element.querySelectorAll<HTMLElement>('li[id^="history-item-"]'))
      .filter((row) => {
        const rect = row.getBoundingClientRect();
        return rect.top >= viewport.top && rect.bottom <= viewport.bottom;
      }).length;
  });

  await broadcastAppearance(page, { density: "compact" });
  await expect.poll(async () => feed.evaluate((element, anchorPosition) => {
    const row = element.querySelector<HTMLElement>(`#history-item-${anchorPosition.id}`);
    if (!row) return Number.POSITIVE_INFINITY;
    return Math.abs(
      row.getBoundingClientRect().top
      - element.getBoundingClientRect().top
      - anchorPosition.offset,
    );
  }, anchor)).toBeLessThanOrEqual(2);
  const compactDensityVisibleCount = await feed.evaluate((element) => {
    const viewport = element.getBoundingClientRect();
    return Array.from(element.querySelectorAll<HTMLElement>('li[id^="history-item-"]'))
      .filter((row) => {
        const rect = row.getBoundingClientRect();
        return rect.top >= viewport.top && rect.bottom <= viewport.bottom;
      }).length;
  });
  expect(compactDensityVisibleCount).toBeGreaterThanOrEqual(standardVisibleCount);

  await broadcastAppearance(page, {
    imagePreview: "small",
    actionSize: "large",
    textPreviewLines: 6,
    itemDetails: "selectedOnly",
  });
  await expect.poll(async () => feed.evaluate((element, anchorPosition) => {
    const row = element.querySelector<HTMLElement>(`#history-item-${anchorPosition.id}`);
    if (!row) return Number.POSITIVE_INFINITY;
    return Math.abs(
      row.getBoundingClientRect().top
      - element.getBoundingClientRect().top
      - anchorPosition.offset,
    );
  }, anchor)).toBeLessThanOrEqual(2);

  const compactSnapshot = await feed.evaluate((element, anchorId) => {
    const viewport = element.getBoundingClientRect();
    const anchorRow = element.querySelector<HTMLElement>(`#history-item-${anchorId}`);
    if (!anchorRow) throw new Error("Density anchor was virtualized away");
    const visibleRows = Array.from(
      element.querySelectorAll<HTMLElement>('li[id^="history-item-"]'),
    ).filter((row) => {
      const rect = row.getBoundingClientRect();
      return rect.bottom > viewport.top && rect.top < viewport.bottom;
    });
    const ordered = visibleRows
      .map((row) => row.getBoundingClientRect())
      .sort((left, right) => left.top - right.top);
    return {
      offset: anchorRow.getBoundingClientRect().top - viewport.top,
      separations: ordered.slice(1).map((rect, index) => rect.top - ordered[index].bottom),
    };
  }, anchor.id);
  expect(Math.abs(compactSnapshot.offset - anchor.offset)).toBeLessThanOrEqual(2);
  await expect.poll(async () => feed.evaluate((element) => {
    const viewport = element.getBoundingClientRect();
    const ordered = Array.from(
      element.querySelectorAll<HTMLElement>('li[id^="history-item-"]'),
    ).filter((row) => {
      const rect = row.getBoundingClientRect();
      return rect.bottom > viewport.top && rect.top < viewport.bottom;
    }).map((row) => row.getBoundingClientRect())
      .sort((left, right) => left.top - right.top);
    return ordered.slice(1).every(
      (rect, index) => rect.top - ordered[index].bottom >= -1
        && rect.top - ordered[index].bottom <= 2,
    );
  })).toBe(true);

  await page.setViewportSize({ width: 420, height: 720 });
  await broadcastAppearance(page, { imagePreview: "large" });
  await expect.poll(async () => feed.evaluate((element) => {
    const viewport = element.getBoundingClientRect();
    const ordered = Array.from(
      element.querySelectorAll<HTMLElement>('li[id^="history-item-"]'),
    ).filter((row) => {
      const rect = row.getBoundingClientRect();
      return rect.bottom > viewport.top && rect.top < viewport.bottom;
    }).map((row) => row.getBoundingClientRect())
      .sort((left, right) => left.top - right.top);
    return ordered.slice(1).every(
      (rect, index) => rect.top - ordered[index].bottom >= -1
        && rect.top - ordered[index].bottom <= 2,
    );
  })).toBe(true);

  const imageRowId = await page.locator(".image-preview img").first().evaluate((element) => {
    const row = element.closest("li");
    if (!row?.id) throw new Error("Expected a rendered image row");
    row.scrollIntoView({ block: "start" });
    return row.id;
  });
  const image = page.locator(`#${imageRowId} .image-preview img`);
  await expect(image).toBeVisible();
  const compactImageBox = await image.boundingBox();
  expect(compactImageBox).not.toBeNull();
  await page.evaluate(async () => {
    const runtime = window as Window & {
      __copicuTestSettings: {
        appearance: { theme: string; themeId: string; density: string };
        [key: string]: unknown;
      };
      __copicuTestEmitEvent: (event: string, payload: unknown) => Promise<number>;
    };
    const nextSettings = {
      ...runtime.__copicuTestSettings,
      appearance: {
        ...runtime.__copicuTestSettings.appearance,
        density: "standard",
      },
    };
    runtime.__copicuTestSettings = nextSettings;
    await runtime.__copicuTestEmitEvent("copicu://settings/updated", nextSettings);
  });
  await expect(page.locator("html")).toHaveAttribute("data-density", "standard");
  await expect.poll(async () => {
    const standardImageBox = await image.boundingBox();
    return standardImageBox
      ? { width: standardImageBox.width, height: standardImageBox.height }
      : null;
  }).toEqual({
    width: compactImageBox?.width,
    height: compactImageBox?.height,
  });
});

test("item actions prioritize editing and fit compact labels without clipping", async ({ page }, testInfo) => {
  await mockTauriInvoke(page);
  await gotoShell(page);
  await waitForDefaultHistoryReady(page);

  const secondItem = page.locator(".feed-item").nth(1);
  await expect(page.getByRole("button", { name: "Preview item" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Quick edit item" })).toHaveCount(0);
  const menuButton = page.getByRole("button", { name: "Open item actions" }).nth(1);
  await secondItem.hover();
  await menuButton.click();

  const itemMenu = page.getByRole("menu", { name: "Item actions" });
  await expect(itemMenu).toBeVisible();
  const actionOrder = await itemMenu.locator(".mantine-Menu-itemLabel").allTextContents();
  expect(actionOrder).toEqual([
    "Quick edit", "Edit metadata", "Copy", "Paste", "Preview", "Organize", "More actions", "Delete item",
  ]);
  const rowHeights = await itemMenu.getByRole("menuitem").evaluateAll((items) =>
    items.map((item) => item.getBoundingClientRect().height),
  );
  expect(rowHeights.every((height) => height >= 28 && height <= 30)).toBe(true);
  const menuLayout = await itemMenu.evaluate((menu) => ({
    fitsViewport: menu.getBoundingClientRect().right <= window.innerWidth - 7,
    labelsWrapWithoutClipping: Array.from(menu.querySelectorAll<HTMLElement>(".mantine-Menu-itemLabel"))
      .every((label) => label.scrollHeight <= label.clientHeight + 1),
    shortcutBadgesFit: Array.from(menu.querySelectorAll<HTMLElement>(".shortcut-badge"))
      .every((badge) => badge.scrollWidth <= badge.clientWidth + 1),
  }));
  expect(menuLayout).toEqual({
    fitsViewport: true,
    labelsWrapWithoutClipping: true,
    shortcutBadgesFit: true,
  });
  await page.screenshot({ path: `.codex-run/compact-menu-${testInfo.project.name}.png` });

  await itemMenu.getByRole("menuitem", { name: /Preview/ }).click();
  await page.waitForFunction(() =>
    (window as any).__copicuTestInvocations.some(
      (entry: any) => entry.cmd === "open_item_preview" && entry.args.request.itemId === 101,
    ),
  );

  await secondItem.hover();
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
  await expect(page.locator(".image-hover-preview")).toHaveCount(0);

  await page.keyboard.press("Alt+Enter");
  await page.waitForFunction(() =>
    (window as any).__copicuTestInvocations.some(
      (entry: any) => entry.cmd === "toggle_item_preview" && entry.args.request.itemId === 100,
    ),
  );
  calls = await page.evaluate(() => (window as any).__copicuTestInvocations);
  expect(calls.filter((entry: any) => entry.cmd === "toggle_item_preview")).toHaveLength(1);
});

test("delayed image hover preview cancels transit and loads full resolution", async ({ page }) => {
  const thumbnail = pngDataUrl(120, 80, "#69747a");
  const fullImage = pngDataUrl(1200, 800, "#245f53");
  const imageItem = {
    ...syntheticCompactPreviewHistory[2],
    thumbnail_data_url: thumbnail,
    full_image_data_url: fullImage,
  };
  await mockTauriInvoke(page, [imageItem], null, { imageHoverPreview: "hover" });
  await gotoShell(page);
  await expect(page.locator("[title='Result count']")).toHaveText("1 total");

  const image = page.locator(".image-preview");
  const hoverPreview = page.locator(".image-hover-preview");
  await image.hover();
  await page.waitForTimeout(300);
  await expect(hoverPreview).toHaveCount(0);
  await page.getByLabel("Search clipboard history").hover();
  await page.waitForTimeout(250);
  await expect(hoverPreview).toHaveCount(0);

  await image.hover();
  await expect(hoverPreview).toBeVisible({ timeout: 1500 });
  await expect(hoverPreview).toHaveAttribute("data-resolution", "full");
  await expect(hoverPreview.locator("img")).toHaveAttribute("src", fullImage);
  const bounds = await hoverPreview.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  expect(await page.evaluate(() =>
    (window as MetadataVisualRuntime).__copicuTestInvocations?.filter(
      (entry) => entry.cmd === "load_item_preview_image",
    ).length ?? 0,
  )).toBe(1);

  await page.getByLabel("Search clipboard history").hover();
  await expect(hoverPreview).toHaveCount(0, { timeout: 1000 });
});

test("modifier hover preview waits for Ctrl and closes when released", async ({ page }) => {
  const imageItem = syntheticCompactPreviewHistory[2];
  await mockTauriInvoke(page, [imageItem], null, { imageHoverPreview: "ctrlHover" });
  await gotoShell(page);
  await expect(page.locator("[title='Result count']")).toHaveText("1 total");

  const image = page.locator(".image-preview");
  const hoverPreview = page.locator(".image-hover-preview");
  await image.hover();
  await page.waitForTimeout(550);
  await expect(hoverPreview).toHaveCount(0);
  await page.keyboard.down("Control");
  await expect(hoverPreview).toBeVisible({ timeout: 1500 });
  await page.keyboard.up("Control");
  await expect(hoverPreview).toHaveCount(0);
});

test("Markdown images use the delayed hover preview without a full-image request", async ({ page }) => {
  await mockTauriInvoke(page, [syntheticAppearanceMarkdownImage], null, {
    imageHoverPreview: "hover",
  });
  await gotoShell(page);
  await expect(page.locator("[title='Result count']")).toHaveText("1 total");

  const image = page.locator(".markdown-image-frame");
  await image.hover();
  const hoverPreview = page.locator(".image-hover-preview");
  await expect(hoverPreview).toBeVisible({ timeout: 1500 });
  await expect(hoverPreview).toHaveAttribute("data-resolution", "thumbnail");
  expect(await page.evaluate(() =>
    (window as MetadataVisualRuntime).__copicuTestInvocations?.some(
      (entry) => entry.cmd === "load_item_preview_image",
    ) ?? false,
  )).toBe(false);
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
  const thumbnail = pngDataUrl(120, 80, "#69747a");
  const fullImage = pngDataUrl(1200, 800, "#245f53");
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

test("metadata window exposes structured fields and stays usable at its minimum size", async ({ page }) => {
  await page.setViewportSize({ width: 380, height: 300 });
  await mockTauriInvoke(page);
  await gotoShell(page, "/?window=metadata");

  const title = page.getByRole("textbox", { name: "Title" });
  await expect(title).toBeVisible();
  await expect(title).toBeFocused();
  await expect(page.getByRole("textbox", { name: "Notes" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Add tags" })).toBeVisible();
  await expect(page.getByText("Content preview")).toBeVisible();
  await expect(page.getByText("Capture details")).toBeVisible();

  await title.fill("Focused metadata");
  await expect(page.getByText("Set title on 1 clip")).toBeVisible();
  const tagInput = page.getByRole("textbox", { name: "Add tags" });
  await tagInput.fill("fresh");
  await tagInput.press("Enter");
  await expect(page.getByText(/Add #fresh to 1 clip/)).toBeVisible();
  await page.keyboard.press("Control+Enter");
  const applyCall = await page.waitForFunction(() => {
    const runtime = window as MetadataVisualRuntime;
    return (runtime.__copicuTestInvocations ?? []).find((entry) => entry.cmd === "apply_metadata_selection_intent") ?? false;
  });
  // The mock bridge returns the recorded invocation after waitForFunction observes it.
  const invocation = await applyCall.jsonValue() as unknown as {
    args: { intent: { title: { op: string }; tags: Array<{ key: string; op: string }> } };
  };
  expect(invocation.args.intent.title.op).toBe("set");
  expect(invocation.args.intent.tags).toContainEqual({ key: "fresh", op: "add" });
  await expect(page.locator(".metadata-inspector-footer .mantine-Loader-root")).toHaveCount(0);

  const overflowing = await page.locator(".metadata-window-app").evaluate((element) =>
    Array.from(element.querySelectorAll<HTMLElement>("*"))
      .filter((child) => {
        const overflowX = getComputedStyle(child).overflowX;
        return child.scrollWidth > Math.ceil(child.clientWidth) + 1
          && overflowX !== "hidden"
          && overflowX !== "clip";
      })
      .map((child) => ({
        className: child.className,
        clientWidth: child.clientWidth,
        scrollWidth: child.scrollWidth,
      })),
  );
  expect(overflowing).toEqual([]);
});

test("metadata Escape protects dirty drafts and closes clean drafts", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page, "/?window=metadata");
  const title = page.getByRole("textbox", { name: "Title" });
  const baseTitle = await title.inputValue();

  await title.fill("Synthetic dirty title");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("alertdialog", { name: "Discard metadata changes" })).toBeVisible();
  await page.getByRole("button", { name: "Keep editing" }).click();
  await title.fill(baseTitle);
  await page.keyboard.press("Escape");
  await expect.poll(async () => page.evaluate(() =>
    (window as MetadataVisualRuntime).__copicuTestInvocations
      ?.filter((entry) => entry.cmd === "close_metadata_window").length ?? 0,
  )).toBe(1);
});

test("metadata stays readable in high contrast with reduced motion", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.setViewportSize({ width: 380, height: 300 });
  await mockTauriInvoke(page, syntheticLongHistory, null, {
    appearance: { theme: "dark", themeId: "highContrast" },
  });
  await gotoShell(page, "/?window=metadata");
  await page.waitForFunction(() => document.documentElement.dataset.theme === "dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme-id", "highContrast");

  const evidence = await page.locator(".metadata-inspector").evaluate((element) => {
    const foreground = getComputedStyle(element).color;
    const background = getComputedStyle(element.closest(".metadata-window-app")!).backgroundColor;
    const luminances = [foreground, background].map((value) => {
      const channels = (value.match(/[\d.]+/g) ?? [])
        .slice(0, 3)
        .map((channel) => Number(channel) / 255)
        .map((channel) => channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
      return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
    });
    const contrast = (Math.max(...luminances) + 0.05) / (Math.min(...luminances) + 0.05);
    const style = getComputedStyle(element);
    return {
      contrast,
      animationDurationSeconds: Number.parseFloat(style.animationDuration) || 0,
      transitionDurationSeconds: Number.parseFloat(style.transitionDuration) || 0,
    };
  });
  expect(evidence.contrast).toBeGreaterThanOrEqual(4.5);
  expect(evidence.animationDurationSeconds).toBeLessThanOrEqual(0.001);
  expect(evidence.transitionDurationSeconds).toBeLessThanOrEqual(0.001);
});

test("multi metadata inspector shows aggregate states and protects dirty work from conflicts and pending selections", async ({ page }) => {
  const selection = [
    { ...syntheticLongHistory[0], id: 9701, title: "One", notes: "First", tags: "#all #some" },
    { ...syntheticLongHistory[1], id: 9702, title: "Two", notes: null, tags: "#all #some" },
    { ...syntheticLongHistory[2], id: 9703, title: null, notes: "Third", tags: "#all" },
    { ...syntheticLongHistory[3], id: 9704, title: null, notes: null, tags: null },
  ];
  await mockTauriInvoke(page, selection, null, { metadataItemIds: [9701, 9702, 9703] });
  await gotoShell(page, "/?window=metadata");

  await expect(page.getByText("Editing 3 selected clips")).toBeVisible();
  await expect(page.getByText("2 of 3 have titles")).toBeVisible();
  await expect(page.getByText("2 of 3 have different notes")).toBeVisible();
  const titleInput = page.getByRole("textbox", { name: "Title for all clips" });
  await expect(titleInput).toBeFocused();
  await titleInput.fill("Unified synthetic title");
  await expect(page.getByRole("button", { name: "Save changes" })).toBeDisabled();
  await page.getByRole("button", { name: "Set title on all" }).click();
  await expect(page.getByText("Set title on 3 clips · Tags unchanged")).toBeVisible();
  await page.getByRole("button", { name: "Edit tags…", exact: true }).click();
  const allTag = page.getByRole("checkbox", { name: /#all/ });
  const someTag = page.getByRole("checkbox", { name: /#some/ });
  const noneTag = page.getByRole("checkbox", { name: /#Work none/ });
  await expect(allTag).toHaveAttribute("aria-checked", "true");
  await expect(someTag).toHaveAttribute("aria-checked", "mixed");
  await expect(noneTag).toHaveAttribute("aria-checked", "false");
  await expect(someTag).toContainText("2 of 3");
  const addTags = page.getByRole("textbox", { name: "Add tags" });
  await addTags.fill("backend");
  await expect(page.getByRole("option", { name: /#Backend Available/ })).toBeVisible();

  await page.getByRole("button", { name: "Remove from 2" }).click();
  await expect(page.getByText("Remove #some from 2 clips")).toBeVisible();
  await page.evaluate(async () => {
    const runtime = window as MetadataVisualRuntime;
    const emitEvent = runtime.__copicuTestEmitEvent;
    const buildSnapshot = runtime.__copicuTestMetadataSnapshot;
    if (!emitEvent || !buildSnapshot) throw new Error("Synthetic metadata bridge is unavailable");
    await emitEvent("copicu://metadata/open", {
      snapshot: buildSnapshot([9701, 9702, 9703], "conflict-token"),
      focusTarget: "overview",
    });
  });
  await expect(page.getByText("Metadata changed since this inspector opened", { exact: true })).toBeVisible();
  await expect(titleInput).toHaveValue("Unified synthetic title");
  await page.getByRole("button", { name: "Keep editing" }).click();

  await page.evaluate(async () => {
    const runtime = window as MetadataVisualRuntime;
    const emitEvent = runtime.__copicuTestEmitEvent;
    const buildSnapshot = runtime.__copicuTestMetadataSnapshot;
    if (!emitEvent || !buildSnapshot) throw new Error("Synthetic metadata bridge is unavailable");
    await emitEvent("copicu://metadata/open", {
      snapshot: buildSnapshot([9704], "pending-token"),
      focusTarget: "tags",
    });
  });
  await expect(page.getByText("Another metadata request is waiting", { exact: true })).toBeVisible();
  await expect(titleInput).toHaveValue("Unified synthetic title");
  await expect(page.getByRole("button", { name: "Save and open" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Discard and open" })).toBeVisible();
});

for (const mode of ["full", "inline"] as const) {
test(`${mode} content editing preserves metadata changed while the editor is open`, async ({ page }) => {
  const item = { ...syntheticLongHistory[1], id: 9201, text: "SYNTH_CONTENT_BEFORE", notes: "literal #unassigned", tags: "#work/project", title: "Original title" };
  await mockTauriInvoke(page, [item]);
  await gotoShell(page);
  const row = page.locator("#history-item-9201");
  await row.locator(".feed-item").click();
  if (mode === "full") {
    await page.keyboard.press("F2");
  } else {
    await row.getByRole("button", { name: "Open item actions" }).click();
    await page.getByRole("menu", { name: "Item actions" }).getByRole("menuitem", { name: "Quick edit" }).click();
  }
  const editor = mode === "full"
    ? page.getByRole("textbox", { name: "Item content", exact: true })
    : row.getByRole("textbox", { name: "Quick edit item 9201" });
  await expect(editor).toBeVisible();
  await editor.fill("SYNTH_CONTENT_AFTER");
  await page.evaluate(() => {
    const state = window as Window & { __copicuTestHistoryItems: Array<{ id: number; notes: string; tags: string; title: string }> };
    const item = state.__copicuTestHistoryItems.find((entry) => entry.id === 9201)!;
    item.notes = "Concurrent literal #not-assigned";
    item.tags = "#Équipe/東京";
    item.title = "Concurrent title";
  });
  await editor.press(mode === "full" ? "Control+s" : "Control+Enter");
  await expect(editor).toBeHidden();
  await expect(row).toContainText("SYNTH_CONTENT_AFTER");
  await expect(row).toContainText("Concurrent title");
  await expect(row).toContainText("#Équipe/東京");
  await expect(row).toContainText("Concurrent literal #not-assigned");
});
}

test("retained refresh updates rows beyond the first page without moving the visible anchor", async ({ page }) => {
  await mockTauriInvoke(page, syntheticPagedHistory);
  await gotoShell(page);
  const feed = page.locator(".history-feed-scroll");
  await expect(page.locator("[title='Result count']")).toHaveText("80 total");
  await expect.poll(async () => {
    await feed.evaluate((element) => { element.scrollTop = element.scrollHeight; });
    return page.getByRole("group", { name: /COPICU_SYNTH_PAGE_80/ }).count();
  }).toBe(1);
  await feed.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  const anchor = await feed.evaluate((element) => {
    const top = element.getBoundingClientRect().top;
    const row = [...element.querySelectorAll<HTMLElement>("li[data-index]")]
      .find((candidate) => candidate.getBoundingClientRect().bottom > top)!;
    return { id: Number(row.id.replace("history-item-", "")), offset: row.getBoundingClientRect().top - top };
  });
  await page.evaluate(async (id) => {
    const state = window as Window & {
      __copicuTestHistoryItems: Array<{ id: number; title: string | null; tags: string | null }>;
      __copicuTestEmitEvent: (name: string, payload: unknown) => Promise<unknown>;
    };
    const item = state.__copicuTestHistoryItems.find((entry) => entry.id === id)!;
    item.title = "SYNTH_RETAINED_METADATA";
    item.tags = "#work/deep";
    await state.__copicuTestEmitEvent("copicu://history/changed", { itemId: id, contentKind: "text" });
  }, anchor.id);
  const row = page.locator(`#history-item-${anchor.id}`);
  await expect(row).toContainText("SYNTH_RETAINED_METADATA");
  await expect(row).toContainText("#work/deep");
  await expect.poll(() => row.evaluate((element) =>
    element.getBoundingClientRect().top - element.closest(".history-feed-scroll")!.getBoundingClientRect().top,
  )).toBeCloseTo(anchor.offset, 0);
});

test("rendering clipboard Markdown never requests remote media in feed or full preview", async ({ page }) => {
  const requests: string[] = [];
  await page.route("**/copicu-privacy-probe/**", (route) => route.abort());
  page.on("request", (request) => {
    if (request.url().includes("/copicu-privacy-probe/")) requests.push(request.url());
  });
  await mockTauriInvoke(page, [{
    ...syntheticLongHistory[0],
    text: "# Synthetic privacy\n\n![remote](https://remote.invalid/copicu-privacy-probe/pixel.png)\n![relative](//remote.invalid/copicu-privacy-probe/second.png)\n<img src=\"https://remote.invalid/copicu-privacy-probe/raw.png\">",
  }]);
  await gotoShell(page);
  await expect(page.getByText("Remote image blocked: remote")).toBeVisible();
  await expect(page.locator(".markdown-preview img")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Zoom image", exact: true })).toHaveCount(0);
  await gotoShell(page, "/?window=item-preview");
  await expect(page.getByRole("heading", { name: "Synthetic privacy" })).toBeVisible();
  await expect(page.locator(".item-preview-markdown img")).toHaveCount(0);
  expect(requests).toEqual([]);
});

test("focused feed groups activate with the keyboard without hiding nested controls", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page);
  const first = page.locator(".feed-item").first();
  await first.focus();
  await first.press("ArrowDown");
  const next = page.locator(".feed-item").nth(1);
  await expect(next).toBeFocused();
  await expect(next).toHaveAttribute("aria-current", "true");
  await expect(page.locator(".history-feed > li").nth(1).getByRole("button", { name: "Open item actions" })).toBeAttached();
  await next.press("Enter");
  await expect.poll(() => page.evaluate(() => {
    const state = window as Window & { __copicuTestInvocations: Array<{ cmd: string; args: { request?: { itemId?: number } } }> };
    return state.__copicuTestInvocations.filter((entry) => entry.cmd === "activate_item").map((entry) => entry.args.request?.itemId);
  })).toEqual([syntheticLongHistory[1].id]);
});

test("UiHost retains editable input after a failed response and ignores duplicate delivery", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page, "/?window=ui-host");
  await page.waitForFunction(() => {
    const state = window as Window & { __copicuTestInvocations: Array<{ cmd: string }> };
    return state.__copicuTestInvocations.some((entry) => entry.cmd === "pending_ui_host_request");
  });
  const request = { id: "synthetic-prompt", kind: "input", title: "Synthetic prompt", body: "", defaultValue: "Initial", submitLabel: "Submit", placeholder: null, confirmLabel: null, cancelLabel: "Cancel" };
  await page.evaluate(async (request) => {
    const state = window as Window & { __copicuTestEmitEvent: (name: string, payload: unknown) => Promise<unknown> };
    await state.__copicuTestEmitEvent("copicu://ui-host/request", request);
  }, request);
  const input = page.getByRole("textbox", { name: "Synthetic prompt" });
  await input.fill("Keep edited input");
  await page.evaluate(async (request) => {
    const state = window as Window & {
      __copicuTestEmitEvent: (name: string, payload: unknown) => Promise<unknown>;
      __copicuTestRejectUiHost: boolean;
    };
    await state.__copicuTestEmitEvent("copicu://ui-host/request", request);
    state.__copicuTestRejectUiHost = true;
  }, request);
  await expect(input).toHaveValue("Keep edited input");
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Synthetic response failure");
  await expect(input).toHaveValue("Keep edited input");
  await page.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(input).toBeHidden();
});

async function revealFolderTree(page: Page) {
  if (!(await page.locator(".folder-tree.is-open").count())) {
    await page.getByRole("button", { name: "Show folders" }).click();
  }
}

async function folderOf(page: Page, id: number) {
  return page.evaluate((targetId) => {
    // The mock IPC fixture owns this in-page history array.
    const testWindow = window as Window & { __copicuTestHistoryItems: Array<{ id: number; folderId: number | null }> };
    return testWindow.__copicuTestHistoryItems.find((item) => item.id === targetId)?.folderId;
  }, id);
}

async function dragClipToFolder(source: Locator, target: Locator) {
  const bounds = await source.boundingBox();
  if (!bounds) throw new Error("Drag source is not visible");
  await source.dragTo(target, { sourcePosition: { x: Math.round(bounds.width * .68), y: Math.min(18, bounds.height / 2) } });
}

// Public assets are an explicit opt-in, never a side effect of the ordinary suite.
// Uses the actual React picker with synthetic IPC fixtures, not native clipboard data.
test("capture synthetic release picker screenshots (opt-in)", async ({ page }, testInfo) => {
  test.skip(process.env.COPICU_CAPTURE_RELEASE_SCREENSHOTS !== "1", "Public asset capture is opt-in");
  test.skip(testInfo.project.name !== "chromium-desktop", "One canonical desktop capture");
  await page.setViewportSize({ width: 1040, height: 760 });
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    return url.hostname === "127.0.0.1" || url.protocol === "data:" || url.protocol === "blob:"
      ? route.continue() : route.abort();
  });
  const snippets = [
    { text: "npm run build\n✓ TypeScript checked\n✓ Demo workspace built in 1.2s", title: "Build check", tags: "development", folderId: 7 },
    { text: "SELECT title, notes\nFROM demo_clipboard_items\nWHERE project = 'synthetic-demo';", title: "Local query example", tags: "sql", folderId: 7 },
    { text: "## Release checklist\n- Review folder destinations\n- Check marked clips across searches\n- Keep all demo content synthetic", title: "Release notes", tags: "demo,review", folderId: 7 },
    { text: "https://example.test/docs/keyboard-workflows", title: "Keyboard workflow reference", tags: "reference", folderId: 8 },
    { text: "Meeting notes: confirm the next synthetic demo review on Thursday.", title: "Demo review", tags: "notes", folderId: 8 },
    { text: "Draft: Thanks for the review. The sample changes are ready to check.", title: "Reply draft", tags: "draft", folderId: null },
  ];
  await mockTauriInvoke(page, snippets.map((snippet, index) => ({
    ...syntheticLongHistory[1], ...snippet, id: 9700 + index,
    normalized_hash: `public-release-demo-${index}`, mime_primary: "text/plain",
    notes: null, is_marked: index !== 1, marked_at_unix_ms: index !== 1 ? 1_800_000_003_000 : null,
  })));
  await page.addInitScript(() => {
    (window as any).__copicuPublicReleaseDemo = true;
    (window as any).__copicuTestFolders = [
      { id: 7, parentId: null, name: "Projects", path: "Projects", directItemCount: 3, descendantFolderCount: 1, subtreeItemCount: 5 },
      { id: 8, parentId: 7, name: "Notes", path: "Projects/Notes", directItemCount: 2, descendantFolderCount: 0, subtreeItemCount: 2 },
    ];
  });
  await gotoShell(page);
  await revealFolderTree(page);
  const projects = page.getByRole("treeitem", { name: /Projects/ });
  await projects.click();
  await projects.press("ArrowRight");
  await expect(page.getByRole("treeitem", { name: /Notes/ })).toBeVisible();
  await expect(page.getByRole("group", { name: /Build check/ })).toBeVisible();
  await expect(page.locator(".feed-item")).toHaveCount(3);
  const divider = page.getByRole("separator", { name: "Folder sidebar width" });
  const dividerBounds = (await divider.boundingBox())!;
  await page.mouse.move(dividerBounds.x + 4, dividerBounds.y + 80);
  await page.mouse.down();
  await page.mouse.move(dividerBounds.x + 90, dividerBounds.y + 80);
  await page.mouse.up();
  await expect(divider).toHaveAttribute("aria-valuenow", "300");
  await page.mouse.move(1030, 750);
  await page.screenshot({ path: "docs/assets/screenshots/picker-folders-v0.5.1.png", animations: "disabled" });
  await page.getByRole("button", { name: "Actions for Projects" }).click();
  await page.mouse.move(1030, 750);
  await page.screenshot({ path: "docs/assets/screenshots/picker-folder-menu-v0.5.1.png", animations: "disabled" });
  await page.getByRole("menu", { name: "Actions for Projects" }).press("Escape");
  const menu = await openMarksMenu(page);
  await expect(menu.getByText("5 marked total · 2 in loaded results", { exact: true })).toBeVisible();
  await expect(menu.getByRole("note")).toContainText("including 3 outside loaded results");
  await page.mouse.move(20, 750);
  await page.screenshot({ path: "docs/assets/screenshots/picker-marked-scope-v0.5.1.png", animations: "disabled" });
});

test("folder tree scopes search and preserves CodeMirror caret ownership", async ({ page }) => {
  await mockTauriInvoke(page, [
    { ...syntheticLongHistory[0], id: 501, folderId: null, text: "ROOT_ONLY_TOKEN" },
    { ...syntheticLongHistory[1], id: 502, folderId: 7, text: "PROJECT_ONLY_TOKEN" },
    { ...syntheticLongHistory[2], id: 503, folderId: 8, text: "NOTES_ONLY_TOKEN" },
  ]);
  await gotoShell(page);
  await revealFolderTree(page);
  await page.getByRole("treeitem", { name: /Projects/ }).click();
  await expect(page.getByRole("group", { name: /PROJECT_ONLY_TOKEN/ })).toBeVisible();
  await expect(page.getByRole("group", { name: /ROOT_ONLY_TOKEN/ })).toHaveCount(0);
  await page.waitForFunction(() => (window as any).__copicuTestInvocations.some((call: any) =>
    call.cmd === "history_search" && call.args.request.query === "folder-id:7"));
  const search = page.getByLabel("Search clipboard history");
  await search.fill("alpha beta");
  await search.click();
  await search.press("Home");
  await search.press("ArrowRight");
  await page.keyboard.type("X");
  await expect(search).toContainText("aXlpha beta");
  await page.keyboard.press("Control+p");
  await expect(page.getByRole("dialog", { name: "Switch folder" })).toBeVisible();
  await page.getByLabel("Find folder").fill("Notes");
  await page.getByRole("option", { name: "Projects/Notes" }).click();
  await page.waitForFunction(() => (window as any).__copicuTestInvocations.some((call: any) =>
    call.cmd === "history_search" && call.args.request.query.endsWith("folder-id:8")));
});

test("folder navigation preserves applied tag filters", async ({ page }) => {
  await mockTauriInvoke(page, [
    { ...syntheticLongHistory[1], id: 501, folderId: null, text: "ROOT_TAG_MATCH", tags: "work" },
    { ...syntheticLongHistory[1], id: 502, folderId: 7, text: "PROJECT_TAG_MATCH", tags: "work" },
    { ...syntheticLongHistory[1], id: 503, folderId: 7, text: "PROJECT_OTHER_TAG", tags: "backend" },
  ]);
  await gotoShell(page);
  await expect(page.locator("[title='Result count']")).toHaveText("3 total");
  await revealFolderTree(page);
  const search = page.getByLabel("Search clipboard history");
  await search.fill("tag:wo");
  await expect(page.locator(".cm-tooltip-autocomplete").getByRole("option", { name: "tag:work" })).toBeVisible();
  await page.waitForTimeout(100);
  await search.press("Tab");
  await expect.poll(() => search.textContent()).toBe("tag:work");
  await expect(page.getByRole("group", { name: /PROJECT_OTHER_TAG/ })).toHaveCount(0);
  await page.getByRole("treeitem", { name: /Projects/ }).click();
  await expect.poll(() => search.textContent()).toBe("tag:work");
  await expect(page.getByRole("group", { name: /PROJECT_TAG_MATCH/ })).toBeVisible();
  await expect(page.getByRole("group", { name: /ROOT_TAG_MATCH/ })).toHaveCount(0);
  await expect(page.getByRole("group", { name: /PROJECT_OTHER_TAG/ })).toHaveCount(0);
  await page.waitForFunction(() => (window as any).__copicuTestInvocations.some((call: any) =>
    call.cmd === "history_search" && call.args.request.query === "tag:work folder-id:7"));
});

test("folder navigation keeps an unapplied draft separate from its applied filter", async ({ page }) => {
  await mockTauriInvoke(page, [
    { ...syntheticLongHistory[1], id: 502, folderId: 7, text: "PROJECT_TAG_MATCH", tags: "work" },
    { ...syntheticLongHistory[1], id: 503, folderId: 7, text: "PROJECT_OTHER_TAG", tags: "backend" },
  ], null, { searchTriggerMode: "enter" });
  await gotoShell(page);
  await expect(page.locator("[title='Result count']")).toHaveText("2 total");
  await revealFolderTree(page);
  const search = page.getByLabel("Search clipboard history");
  await search.fill("tag:wo");
  await page.locator(".cm-tooltip-autocomplete").getByRole("option", { name: "tag:work" }).click();
  await search.press("Enter");
  await expect(page.getByRole("group", { name: /PROJECT_OTHER_TAG/ })).toHaveCount(0);
  await search.fill("tag:");
  await page.getByRole("treeitem", { name: /Projects/ }).click();
  await expect.poll(() => search.textContent()).toBe("tag:");
  await expect(page.getByRole("group", { name: /PROJECT_TAG_MATCH/ })).toBeVisible();
  await expect(page.getByRole("group", { name: /PROJECT_OTHER_TAG/ })).toHaveCount(0);
  await page.waitForFunction(() => (window as any).__copicuTestInvocations.some((call: any) =>
    call.cmd === "history_search" && call.args.request.query === "tag:work folder-id:7"));
});

test("Ctrl+P cycles folder results with arrows while input keeps focus", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page);
  await page.getByLabel("Search clipboard history").press("Control+p");
  const input = page.getByLabel("Find folder");
  await input.fill("Projects");
  await input.press("ArrowDown");
  await expect(input).toBeFocused();
  await expect(page.getByRole("option", { name: "Projects/Notes" })).toHaveAttribute("aria-selected", "true");
  await input.press("ArrowUp");
  await expect(page.getByRole("option", { name: "Projects", exact: true })).toHaveAttribute("aria-selected", "true");
  await input.press("ArrowDown");
  await input.press("Enter");
  await expect(page.getByRole("button", { name: "Switch folder, browsing Projects/Notes" })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Switch folder" })).toHaveCount(0);
});

test("focused clip crosses to folder tree and typing returns to scoped search", async ({ page }) => {
  await mockTauriInvoke(page, [
    { ...syntheticLongHistory[0], id: 601, folderId: null, text: "ROW_FOCUS_TOKEN" },
  ]);
  await gotoShell(page);
  await revealFolderTree(page);
  const row = page.locator(".feed-item").first();
  await row.focus();
  await row.press("ArrowLeft");
  await expect(page.getByRole("treeitem", { name: "All history" })).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator(".history-feed-scroll")).toBeFocused();
  await row.focus();
  await page.keyboard.type("ROW");
  await expect(page.getByLabel("Search clipboard history")).toContainText("ROW");
});

test("Explorer-like folder tree selects with arrows, expands branches, and opens context actions", async ({ page }) => {
  await mockTauriInvoke(page, [
    { ...syntheticLongHistory[0], id: 611, folderId: 7, text: "PROJECT_TREE_TOKEN" },
    { ...syntheticLongHistory[1], id: 612, folderId: 8, text: "NOTES_TREE_TOKEN" },
  ]);
  await gotoShell(page);
  await revealFolderTree(page);
  const root = page.locator('[data-folder-row="null"]');
  await root.focus();
  await root.press("ArrowDown");
  const projects = page.getByRole("treeitem", { name: /Projects/ });
  await expect(projects).toBeFocused();
  await expect(projects).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("group", { name: /PROJECT_TREE_TOKEN/ })).toBeVisible();
  await projects.press("ArrowRight");
  await expect(projects).toHaveAttribute("aria-expanded", "true");
  await projects.press("ArrowRight");
  const notes = page.getByRole("treeitem", { name: /Notes/ });
  await expect(notes).toBeFocused();
  await expect(page.getByRole("group", { name: /NOTES_TREE_TOKEN/ })).toBeVisible();
  await notes.press("ArrowLeft");
  await expect(projects).toBeFocused();
  await projects.press("Shift+F10");
  await expect(page.getByRole("menu", { name: "Actions for Projects" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu", { name: "Actions for Projects" })).toHaveCount(0);
});

test("narrow tree collapses without losing scope and destination survives picker reopen", async ({ page }) => {
  await page.setViewportSize({ width: 420, height: 720 });
  await mockTauriInvoke(page);
  await gotoShell(page);
  await page.getByRole("button", { name: "Show folders" }).click();
  await page.getByRole("treeitem", { name: /Projects/ }).click();
  await expect(page.getByRole("treeitem", { name: /Projects/ })).toBeHidden();
  await expect(page.getByRole("button", { name: "Switch folder, browsing Projects" })).toBeVisible();
  await page.getByRole("button", { name: "Show folders" }).click();
  await page.getByRole("button", { name: "Arm folder" }).click();
  await expect(page.locator(".folder-capture-status")).toContainText("Capturing → Projects");
  await page.evaluate(async () => (window as any).__copicuTestEmitEvent("copicu://picker/hidden", null));
  await page.evaluate(async () => (window as any).__copicuTestEmitEvent("copicu://picker/shown", null));
  await expect(page.locator(".folder-capture-status")).toContainText("Capturing → Projects");
  await page.locator('[data-folder-row="null"]').click();
  await expect(page.locator(".folder-capture-status")).toHaveCount(0);
});

test("Ctrl+B collapses and restores the tree without changing the active folder", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page);
  await revealFolderTree(page);
  await page.getByRole("treeitem", { name: /Projects/ }).click();
  const tree = page.getByRole("tree", { name: "History folders" });
  if (!(await page.locator(".folder-tree.is-open").count())) await page.getByRole("button", { name: "Show folders" }).click();
  const search = page.getByLabel("Search clipboard history");
  await search.focus();
  await search.press("Control+b");
  await expect(tree).toBeHidden();
  await expect(page.getByRole("button", { name: "Switch folder, browsing Projects" })).toBeVisible();
  await search.press("Control+b");
  await expect(tree).toBeVisible();
  await expect(tree.getByRole("treeitem", { name: /Projects/ })).toHaveAttribute("aria-selected", "true");
});

test("folder controls share the filter strip without adding a feed header", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page);
  await revealFolderTree(page);
  const scope = page.getByRole("button", { name: "Switch folder, browsing All history" });
  await expect(scope).toBeVisible();
  await expect(page.locator(".folder-active-feed")).toHaveCount(0);
  await expect(page.locator(".search-filter-strip").getByRole("button", { name: "Switch folder, browsing All history" })).toBeVisible();
  await page.getByRole("button", { name: "Hide folders" }).hover();
  await expect(page.getByRole("tooltip").locator(".shortcut-badge[aria-label='Ctrl+B']")).toBeVisible();
  await page.getByRole("button", { name: "Hide folders" }).click();
  await expect(page.getByRole("button", { name: "Show folders" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Show folders" })).toBeFocused();
  await scope.hover();
  await expect(page.getByRole("tooltip").locator(".shortcut-badge[aria-label='Ctrl+P']")).toBeVisible();
  await scope.click();
  await expect(page.getByRole("dialog", { name: "Switch folder" })).toBeVisible();
});

test("dragging one clip to a folder moves only that clip and refreshes its feed", async ({ page }) => {
  await mockTauriInvoke(page, [
    { ...syntheticLongHistory[0], id: 901, folderId: null, text: "DRAG_ONE" },
    { ...syntheticLongHistory[1], id: 902, folderId: null, text: "STAYS_ROOT" },
  ]);
  await gotoShell(page);
  await revealFolderTree(page);
  await expect(page.locator('[data-folder-row="null"]')).toContainText("/");
  await expect(page.locator('[data-folder-row="null"] .folder-tree-count')).toHaveText("2");
  await dragClipToFolder(page.getByRole("group", { name: /DRAG_ONE/ }), page.getByRole("treeitem", { name: /Projects/ }));
  await expect.poll(() => folderOf(page, 901)).toBe(7);
  await expect.poll(() => folderOf(page, 902)).toBeNull();
  await expect(page.locator('[data-folder-row="null"] .folder-tree-count')).toHaveText("1");
  await page.getByRole("treeitem", { name: /Projects/ }).click();
  await expect(page.locator("#clipboard-feed")).toContainText("DRAG_ONE");
  await expect(page.locator("#clipboard-feed")).not.toContainText("STAYS_ROOT");
});

test("internal drag marks valid folder targets with a grabbing cursor", async ({ page }) => {
  await mockTauriInvoke(page, [{ ...syntheticLongHistory[0], id: 951, folderId: null, text: "POINTER_DRAG_TOKEN" }]);
  await gotoShell(page);
  await revealFolderTree(page);
  const source = await page.getByRole("group", { name: /POINTER_DRAG_TOKEN/ }).boundingBox();
  const folder = await page.getByRole("treeitem", { name: /Projects/ }).boundingBox();
  const all = await page.getByRole("treeitem", { name: "All history" }).boundingBox();
  if (!source || !folder || !all) throw new Error("Drag source or tree target is not visible");
  await page.mouse.move(source.x + source.width * .8, source.y + 12);
  await page.mouse.down();
  await page.mouse.move(folder.x + folder.width / 2, folder.y + folder.height / 2, { steps: 8 });
  await expect(page.locator('[data-folder-drop-id="7"]')).toHaveClass(/is-drop-target/);
  await expect(page.locator('[data-folder-drop-id="7"]')).toHaveCSS("cursor", "grabbing");
  await expect(page.locator(".folder-drop-hint")).toHaveText("Move 1");
  const root = await page.locator('[data-folder-row="null"]').boundingBox();
  if (!root) throw new Error("Root drop target is not visible");
  await page.mouse.move(root.x + root.width / 2, root.y + root.height / 2);
  await expect(page.locator('[data-folder-drop-id="root"]')).toHaveClass(/is-drop-target/);
  await expect(page.locator('[data-folder-drop-id="root"]')).toHaveCSS("cursor", "grabbing");
  await expect(page.locator(".folder-drop-hint")).toHaveText("Move 1");
  await page.mouse.move(all.x + all.width / 2, all.y + all.height / 2);
  await expect(page.getByRole("treeitem", { name: "All history" })).toHaveCSS("cursor", "not-allowed");
  await page.mouse.move(folder.x + folder.width / 2, folder.y + folder.height / 2);
  await page.mouse.up();
  await expect.poll(() => folderOf(page, 951)).toBe(7);
  await expect(page.locator("html")).not.toHaveClass(/clip-pointer-dragging/);
});

test("dragging from image and inline Markdown previews moves their clips", async ({ page }) => {
  await page.setViewportSize({ width: 587, height: 833 });
  const png = pngDataUrl(160, 90, "#245f53");
  await mockTauriInvoke(page, [
    { ...syntheticCompactPreviewHistory[2], id: 931, thumbnail_data_url: png, folderId: null },
    { ...syntheticLongHistory[1], id: 932, text: `Before ![Inline image](${png}) after`, title: null, folderId: null },
  ]);
  await gotoShell(page);
  await revealFolderTree(page);
  const target = page.getByRole("treeitem", { name: /Projects/ });
  await page.locator("#history-item-931 .image-preview img").dragTo(target);
  await expect.poll(() => folderOf(page, 931)).toBe(7);
  await page.locator("#history-item-932 .markdown-image-frame img").dragTo(target);
  await expect.poll(() => folderOf(page, 932)).toBe(7);
});

test("dragging selected clips moves the group and Root moves immediately", async ({ page }) => {
  await mockTauriInvoke(page, [
    { ...syntheticLongHistory[0], id: 911, folderId: 7, text: "DRAG_GROUP_ONE" },
    { ...syntheticLongHistory[1], id: 912, folderId: 7, text: "DRAG_GROUP_TWO" },
    { ...syntheticLongHistory[2], id: 913, folderId: 7, text: "DRAG_GROUP_STAYS" },
  ]);
  await gotoShell(page);
  const first = page.getByRole("group", { name: /DRAG_GROUP_ONE/ });
  await first.click();
  await page.getByRole("group", { name: /DRAG_GROUP_TWO/ }).click({ modifiers: ["Control"] });
  await expect(page.locator(".selection-menu-button")).toHaveAccessibleName("Open selected clips menu, 2 selected");
  await revealFolderTree(page);
  await page.getByRole("button", { name: "Expand Projects" }).click();
  await dragClipToFolder(first, page.getByRole("treeitem", { name: /Notes/ }));
  await expect.poll(() => folderOf(page, 911)).toBe(8);
  await expect.poll(() => folderOf(page, 912)).toBe(8);
  await expect.poll(() => folderOf(page, 913)).toBe(7);
  await page.getByRole("treeitem", { name: /Notes/ }).click();
  await expect(page.locator("#clipboard-feed")).toContainText("DRAG_GROUP_ONE");
  await expect(page.locator("#clipboard-feed")).toContainText("DRAG_GROUP_TWO");
  await expect(page.locator("#clipboard-feed")).not.toContainText("DRAG_GROUP_STAYS");
  await revealFolderTree(page);
  await dragClipToFolder(page.getByRole("group", { name: /DRAG_GROUP_ONE/ }), page.locator('[data-folder-row="null"]'));
  await expect(page.getByRole("dialog", { name: "moveItems folder" })).toHaveCount(0);
  await expect.poll(() => folderOf(page, 911)).toBeNull();
  await expect.poll(() => folderOf(page, 912)).toBe(8);
});

for (const [deleteClips, deleteDescendants] of [[false, false], [true, false], [false, true], [true, true]]) {
  test(`folder deletion preview applies independent choices (${deleteClips}, ${deleteDescendants})`, async ({ page }) => {
    await mockTauriInvoke(page, [
      { ...syntheticLongHistory[0], id: 701, folderId: 7, text: "DIRECT_FOLDER_TOKEN" },
      { ...syntheticLongHistory[1], id: 702, folderId: 8, text: "CHILD_FOLDER_TOKEN" },
    ]);
    await gotoShell(page);
    await revealFolderTree(page);
    await page.getByRole("button", { name: "Actions for Projects" }).click();
    await page.getByRole("menuitem", { name: "Delete folder…" }).click();
    const dialog = page.getByRole("dialog", { name: "delete folder" });
    await expect(dialog).toContainText("1 direct clips; 1 descendant folders; 2 clips in subtree.");
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("treeitem", { name: /Projects/ })).toBeVisible();
    await page.getByRole("button", { name: "Actions for Projects" }).click();
    await page.getByRole("menuitem", { name: "Delete folder…" }).click();
    await dialog.getByRole("checkbox", { name: /Delete clips/ }).setChecked(deleteClips);
    await dialog.getByRole("checkbox", { name: /Delete 1 descendant folders/ }).setChecked(deleteDescendants);
    await dialog.getByRole("button", { name: "Delete folder" }).click();
    await expect(page.getByRole("treeitem", { name: /Projects/ })).toHaveCount(0);
    await page.locator('[data-folder-row="null"]').click();
    await expect(page.getByRole("group", { name: /DIRECT_FOLDER_TOKEN/ })).toHaveCount(deleteClips ? 0 : 1);
    await expect(page.getByRole("group", { name: /CHILD_FOLDER_TOKEN/ })).toHaveCount(deleteDescendants && !deleteClips ? 1 : 0);
    if (!(await page.getByRole("tree", { name: "History folders" }).isVisible())) {
      await page.getByRole("button", { name: "Show folders" }).click();
    }
    await expect(page.getByRole("treeitem", { name: /Notes/ })).toHaveCount(deleteDescendants ? 0 : 1);
  });
}

test("slash completion inserts a path at the caret while untouched slash stays literal", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page);
  const search = page.getByLabel("Search clipboard history");
  const suggestions = page.locator(".cm-tooltip-autocomplete");
  await search.fill("alpha /Notes beta");
  await search.press("Home");
  await search.press("End");
  await search.fill("alpha /Not");
  await expect(suggestions.getByRole("option", { name: "Projects/Notes" })).toBeVisible();
  await expect(suggestions.getByRole("option", { name: "Projects/Notes" })).toHaveAttribute("aria-selected", "true");
  await page.waitForTimeout(100);
  await search.press("Enter");
  await expect(search).toContainText('alpha folder:"Projects/Notes"');
  await search.fill("literal/path");
  await expect(suggestions.getByRole("option", { name: "Projects/Notes" })).toHaveCount(0);
  await search.fill("/");
  await search.press("Escape");
  await expect(search).toContainText("/");
});

test("moving one item to Root warns and changes only that item's feed", async ({ page }) => {
  await mockTauriInvoke(page, [
    { ...syntheticLongHistory[0], id: 701, folderId: 7 },
    { ...syntheticLongHistory[1], id: 702, folderId: 7 },
  ]);
  await gotoShell(page);
  await revealFolderTree(page);
  await page.getByRole("treeitem", { name: /Projects/ }).click();
  await page.locator(".feed-item").first().hover();
  await page.getByRole("button", { name: "Open item actions" }).first().click();
  await openItemSubmenu(page, "Organize");
  await page.getByRole("menuitem", { name: "Move clip to folder…" }).click();
  const dialog = page.getByRole("dialog", { name: "moveItems folder" });
  await expect(dialog).toContainText("eligible for automatic retention");
  await dialog.getByRole("button", { name: "Move clips" }).click();
  if (!(await page.getByRole("tree", { name: "History folders" }).isVisible())) {
    await page.getByRole("button", { name: "Show folders" }).click();
  }
  await page.locator('[data-folder-row="null"]').click();
  await expect(page.locator("#clipboard-feed")).toContainText(syntheticLongHistory[0].text.slice(0, 40));
  await expect(page.locator("#clipboard-feed")).not.toContainText(syntheticLongHistory[1].text.slice(0, 40));
});

test("Find uses the applied folder snapshot instead of matching another folder", async ({ page }) => {
  await mockTauriInvoke(page, [
    { ...syntheticLongHistory[0], id: 801, folderId: null, text: "Shared needle root" },
    { ...syntheticLongHistory[1], id: 802, folderId: 7, text: "Shared needle project" },
  ]);
  await gotoShell(page);
  await revealFolderTree(page);
  await page.getByRole("treeitem", { name: /Projects/ }).click();
  await page.getByLabel("Search clipboard history").press("Control+f");
  await page.getByLabel("Find in results").fill("needle");
  await expect(page.locator(".find-count")).toContainText("1");
  await expect(page.getByRole("group", { name: /needle root/ })).toHaveCount(0);
});

test("feed Left enters tree, tree arrows navigate, and typing returns to scoped search", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page);
  const feed = page.locator(".history-feed-scroll");
  await feed.focus();
  await feed.press("ArrowLeft");
  await expect(page.getByRole("treeitem", { name: "All history" })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.locator('[data-folder-row="null"]')).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("treeitem", { name: /Projects/ })).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("treeitem", { name: /Notes/ })).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(feed).toBeFocused();
  await page.keyboard.type("x");
  await expect(page.getByLabel("Search clipboard history")).toBeFocused();
  await expect(page.getByLabel("Search clipboard history")).toContainText("x");
});

test("folder create, rename, and reparent keep full paths current", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page);
  if (!(await page.getByRole("tree", { name: "History folders" }).isVisible())) {
    await page.getByRole("button", { name: "Show folders" }).click();
  }
  await page.getByRole("button", { name: "Actions for Projects" }).click();
  await page.getByRole("menuitem", { name: "New child folder" }).click();
  const create = page.getByRole("dialog", { name: "create folder" });
  await create.getByLabel("Folder name").fill("Stories");
  await create.getByRole("button", { name: "Create folder" }).click();
  if (!(await page.getByRole("tree", { name: "History folders" }).isVisible())) {
    await page.getByRole("button", { name: "Show folders" }).click();
  }
  await expect(page.getByRole("treeitem", { name: /Stories/ })).toBeVisible();
  await page.getByRole("button", { name: "Actions for Stories" }).click();
  await page.getByRole("menuitem", { name: "Rename folder" }).click();
  const rename = page.getByRole("dialog", { name: "rename folder" });
  await rename.getByLabel("Folder name").fill("Archives");
  await rename.getByRole("button", { name: "Rename folder" }).click();
  await expect(page.getByRole("treeitem", { name: /Archives/ })).toBeVisible();
  await page.getByRole("button", { name: "Actions for Archives" }).click();
  await page.getByRole("menuitem", { name: "Move folder" }).click();
  const move = page.getByRole("dialog", { name: "reparent folder" });
  await move.getByRole("button", { name: "Destination /Projects", exact: true }).click();
  const destinations = page.getByRole("dialog", { name: "Choose destination" });
  await destinations.getByRole("combobox", { name: "Search folders" }).fill("/");
  await destinations.locator('.folder-tree-name[title="/"]').click();
  await destinations.getByRole("button", { name: "Choose folder", exact: true }).click();
  await move.getByRole("button", { name: "Move folder" }).click();
  await page.getByLabel("Search clipboard history").fill("/Arch");
  await expect(page.locator(".cm-tooltip-autocomplete").getByRole("option", { name: "Archives Folder path" })).toBeVisible();
});

async function sidebarWrites(page: Page) {
  return page.evaluate(() => (window as any).__copicuTestInvocations.filter((call: any) => call.cmd === "set_picker_folder_sidebar_width"));
}

test("shared folder selector stages nested creation and Escape preserves editor focus", async ({ page }, testInfo) => {
  await mockTauriInvoke(page, [{ ...syntheticLongHistory[0], id: 501, folderId: 7 }], null, { metadataItemIds: [501] });
  await gotoShell(page, "/?window=metadata");
  const trigger = page.getByRole("button", { name: "Folder /Projects", exact: true });
  await trigger.click();
  const panel = page.getByRole("dialog", { name: "Choose folder", exact: true });
  const search = panel.getByRole("combobox", { name: "Search folders" });
  await expect(search).toBeFocused();
  await search.fill("/Projects/References/Research");
  await expect(panel.getByRole("treeitem")).toHaveCount(0);
  await expect(panel.getByRole("button", { name: "Create and choose", exact: true })).toHaveCount(0);
  await search.press("Enter");
  await expect(panel).toBeVisible();
  await expect(trigger).toHaveText("/Projects");
  await page.screenshot({ path: `.codex-run/folder-selector-${testInfo.project.name}.png` });
  const bounds = (await panel.boundingBox())!;
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  await search.press("Escape");
  await expect(trigger).toBeFocused();
  await trigger.click();
  await search.fill("");
  await panel.locator('.folder-tree-name[title="/Projects"]').click();
  await panel.getByRole("button", { name: "New folder", exact: true }).click();
  const name = panel.getByRole("textbox", { name: "Folder name", exact: true });
  await name.fill("References/Research");
  await expect(name).toBeFocused();
  await expect(search).toBeDisabled();
  await page.screenshot({ path: `.codex-run/folder-selector-new-${testInfo.project.name}.png` });
  await panel.getByRole("button", { name: "Create and choose", exact: true }).click();
  await expect(page.getByRole("button", { name: /Folder \/Projects\/References\/Research/ })).toBeFocused();
  expect(await page.evaluate(() => (window as any).__copicuTestFolders.some((folder: any) => folder.name === "Research"))).toBe(false);
  expect(await page.evaluate(() => (window as any).__copicuTestInvocations.some((call: any) => call.cmd === "create_folder_path" || call.cmd === "apply_metadata_selection_intent"))).toBe(false);
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await page.waitForFunction(() => (window as any).__copicuTestHistoryItems[0].folderId !== 7);
  expect(await page.evaluate(() => (window as any).__copicuTestInvocations.find((call: any) => call.cmd === "apply_metadata_selection_intent").args.intent.folder)).toEqual({ op: "create", path: "/Projects/References/Research" });
  expect(await page.evaluate(() => (window as any).__copicuTestFolders.filter((folder: any) => ["References", "Research"].includes(folder.name)).length)).toBe(2);
});

test("shared folder selector browses children and cancels mixed metadata creation without writes", async ({ page }) => {
  await mockTauriInvoke(page, [
    { ...syntheticLongHistory[0], id: 501, folderId: 7 },
    { ...syntheticLongHistory[1], id: 502, folderId: null },
  ], null, { metadataItemIds: [501, 502] });
  await gotoShell(page, "/?window=metadata");
  await page.locator(".folder-select-trigger").click();
  const panel = page.getByRole("dialog", { name: "Choose folder", exact: true });
  await panel.getByRole("button", { name: "Expand Projects", exact: true }).click();
  await expect(panel.getByRole("treeitem", { name: "Notes", exact: true })).toBeVisible();
  await panel.locator('.folder-tree-name[title="/Projects"]').click();
  await expect(panel).toBeVisible();
  await panel.getByRole("button", { name: "New folder", exact: true }).click();
  await panel.getByRole("textbox", { name: "Folder name", exact: true }).fill("Canceled child");
  await panel.getByRole("button", { name: /Create and choose/ }).click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Discard changes", exact: true }).click();
  expect(await page.evaluate(() => (window as any).__copicuTestFolders.some((folder: any) => folder.name === "Canceled child"))).toBe(false);
  expect(await page.evaluate(() => (window as any).__copicuTestInvocations.some((call: any) => call.cmd === "create_folder_path" || call.cmd === "apply_metadata_selection_intent"))).toBe(false);
});

test("shared folder selector persists new clip folder intent and keeps staging atomic", async ({ page }) => {
  await mockTauriInvoke(page);
  await gotoShell(page);
  await page.getByLabel("Search clipboard history").press("Control+n");
  const dialog = page.getByRole("dialog", { name: "Create new item", exact: true });
  await dialog.getByRole("textbox", { name: "Content", exact: true }).fill("SYNTH_FOLDER_NEW_CLIP");
  await dialog.locator(".folder-select-trigger").click();
  const panel = page.getByRole("dialog", { name: "Choose folder", exact: true });
  const search = panel.getByRole("combobox", { name: "Search folders" });
  await search.fill("Projects");
  await panel.locator('.folder-tree-name[title="/Projects"]').click();
  await panel.getByRole("button", { name: "New folder", exact: true }).click();
  await panel.getByRole("textbox", { name: "Folder name", exact: true }).fill("Manual clips");
  await panel.getByRole("textbox", { name: "Folder name", exact: true }).press("Enter");
  expect(await page.evaluate(() => (window as any).__copicuTestFolders.some((folder: any) => folder.name === "Manual clips"))).toBe(false);
  await dialog.getByRole("button", { name: "Create", exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(await page.evaluate(() => (window as any).__copicuTestInvocations.find((call: any) => call.cmd === "create_history_item").args.request.folder)).toEqual({ op: "create", path: "/Projects/Manual clips" });
  expect(await page.evaluate(() => {
    const runtime = window as any;
    return runtime.__copicuTestHistoryItems.find((item: any) => item.text === "SYNTH_FOLDER_NEW_CLIP").folderId === runtime.__copicuTestFolders.find((folder: any) => folder.name === "Manual clips").id;
  })).toBe(true);
});

test("shared folder selector chooses Root by keyboard without saving from its search field", async ({ page }) => {
  await mockTauriInvoke(page, [{ ...syntheticLongHistory[0], id: 501, folderId: 7 }], null, { metadataItemIds: [501] });
  await gotoShell(page, "/?window=metadata");
  await page.locator(".folder-select-trigger").click();
  const search = page.getByRole("combobox", { name: "Search folders" });
  await search.fill("/");
  await search.press("Enter");
  await expect(page.getByRole("button", { name: "Folder /", exact: true })).toBeFocused();
  expect(await page.evaluate(() => (window as any).__copicuTestInvocations.some((call: any) => call.cmd === "apply_metadata_selection_intent"))).toBe(false);
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await page.waitForFunction(() => (window as any).__copicuTestHistoryItems[0].folderId === null);
});

test("shared folder selector tree expands current ancestors and restores expansion after filtering", async ({ page }) => {
  await mockTauriInvoke(page, [{ ...syntheticLongHistory[0], id: 501, folderId: 8 }], null, { metadataItemIds: [501] });
  await gotoShell(page, "/?window=metadata");
  const trigger = page.getByRole("button", { name: "Folder /Projects/Notes", exact: true });
  await trigger.click();
  const panel = page.getByRole("dialog", { name: "Choose folder", exact: true });
  const tree = panel.getByRole("tree", { name: "Folder destinations", exact: true });
  const projects = tree.locator('.folder-tree-name[title="/Projects"]');
  const notes = tree.locator('.folder-tree-name[title="/Projects/Notes"]');
  await expect(projects).toHaveText("Projects");
  await expect(projects).toHaveAttribute("aria-expanded", "true");
  await expect(notes).toHaveText("Notes");
  await expect(notes).toHaveAttribute("aria-selected", "true");
  await expect(panel.getByRole("navigation", { name: "Current folder" })).toHaveCount(0);
  await panel.getByRole("button", { name: "Collapse Projects", exact: true }).click();
  await expect(notes).toHaveCount(0);
  const search = panel.getByRole("combobox", { name: "Search folders" });
  await search.fill("notes");
  await expect(projects).toBeVisible();
  await expect(notes).toBeVisible();
  await expect(notes.locator("mark")).toHaveText("Notes");
  await search.fill("");
  await expect(projects).toHaveAttribute("aria-expanded", "false");
  await expect(notes).toHaveCount(0);
  await search.press("Escape");
  await expect(trigger).toBeFocused();
});

test("shared folder selector search retains ancestors and requires explicit pointer confirmation", async ({ page }, testInfo) => {
  await mockTauriInvoke(page, [{ ...syntheticLongHistory[0], id: 501, folderId: 7 }], null, { metadataItemIds: [501] });
  await gotoShell(page, "/?window=metadata");
  const trigger = page.getByRole("button", { name: "Folder /Projects", exact: true });
  await trigger.click();
  const panel = page.getByRole("dialog", { name: "Choose folder", exact: true });
  const search = panel.getByRole("combobox", { name: "Search folders" });
  await search.fill("notes");
  await expect(panel.getByRole("navigation", { name: "Current folder" })).toHaveCount(0);
  const tree = panel.getByRole("tree", { name: "Folder destinations", exact: true });
  const match = tree.locator('.folder-tree-name[title="/Projects/Notes"]');
  await expect(tree.locator('.folder-tree-name[title="/"]')).toHaveText("/");
  await expect(tree.locator('.folder-tree-name[title="/Projects"]')).toHaveText("Projects");
  await expect(match).toHaveText("Notes");
  await expect(match.locator("mark")).toHaveText("Notes");
  await expect(tree.getByRole("treeitem")).toHaveCount(3);
  await expect(panel.getByRole("button", { name: "Create and choose", exact: true })).toHaveCount(0);
  await page.screenshot({ path: `.codex-run/folder-selector-search-${testInfo.project.name}.png` });
  await match.click();
  await expect(match).toHaveAttribute("aria-selected", "true");
  await expect(panel).toBeVisible();
  await expect(trigger).toHaveText("/Projects");
  await expect(page.getByRole("button", { name: "Save changes", exact: true })).toBeDisabled();
  await panel.getByRole("button", { name: "Choose folder", exact: true }).click();
  await expect(page.getByRole("button", { name: "Folder /Projects/Notes", exact: true })).toBeFocused();
  expect(await page.evaluate(() => (window as any).__copicuTestInvocations.some((call: any) => call.cmd === "apply_metadata_selection_intent" || call.cmd === "create_folder_path"))).toBe(false);
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await page.waitForFunction(() => (window as any).__copicuTestHistoryItems[0].folderId === 8);
  expect(await page.evaluate(() => (window as any).__copicuTestInvocations.find((call: any) => call.cmd === "apply_metadata_selection_intent").args.intent.folder)).toEqual({ op: "set", folderId: 8 });
});

test("shared folder selector inline creation validates duplicates and Escape restores query without writes", async ({ page }) => {
  await mockTauriInvoke(page, [{ ...syntheticLongHistory[0], id: 501, folderId: null }], null, { metadataItemIds: [501] });
  await gotoShell(page, "/?window=metadata");
  const trigger = page.getByRole("button", { name: "Folder /", exact: true });
  await trigger.click();
  const panel = page.getByRole("dialog", { name: "Choose folder", exact: true });
  const search = panel.getByRole("combobox", { name: "Search folders" });
  await panel.getByRole("button", { name: "New folder", exact: true }).click();
  const name = panel.getByRole("textbox", { name: "Folder name", exact: true });
  const create = panel.getByRole("button", { name: "Create and choose", exact: true });
  await expect(name).toBeVisible();
  await expect(name).toBeFocused();
  await expect(name).toHaveValue("");
  await expect(create).toBeDisabled();
  await expect(search).toBeDisabled();
  await name.fill("Projects");
  await expect(create).toHaveCount(0);
  await expect(panel.getByRole("button", { name: "Choose folder", exact: true })).toBeEnabled();
  await expect(panel.getByRole("status")).toContainText(/already exists/i);
  await panel.getByRole("button", { name: "Cancel new folder", exact: true }).click();
  await expect(search).toBeFocused();
  await expect(name).toHaveCount(0);
  await search.fill("notes");
  await panel.locator('.folder-tree-name[title="/Projects/Notes"]').click();
  await panel.getByRole("button", { name: "New folder", exact: true }).click();
  await expect(name).toHaveValue("");
  await expect(search).toHaveValue("");
  await expect(search).toBeDisabled();
  await name.fill("Uncreated child/Nested");
  await expect(create).toBeEnabled();
  const parentAndInput = await name.evaluate((input) => {
    const row = [...document.querySelectorAll('.folder-select-panel .folder-tree-entry')].find((entry) => entry.nextElementSibling?.contains(input));
    return row?.querySelector('.folder-tree-name')?.getAttribute("title");
  });
  expect(parentAndInput).toBe("/Projects/Notes");
  await name.fill("/Absolute path");
  await expect(create).toBeDisabled();
  await expect(panel.getByRole("status")).toContainText(/relative path/i);
  await name.press("Escape");
  await expect(panel).toBeVisible();
  await expect(name).toHaveCount(0);
  await expect(search).toBeFocused();
  await expect(search).toHaveValue("notes");
  await search.press("Escape");
  await expect(trigger).toBeFocused();
  await expect(page.getByRole("button", { name: "Save changes", exact: true })).toBeDisabled();
  expect(await page.evaluate(() => (window as any).__copicuTestInvocations.some((call: any) => call.cmd === "create_folder_path" || call.cmd === "apply_metadata_selection_intent"))).toBe(false);
});

test("shared folder selector confirms existing tree candidates with double click or Enter", async ({ page }) => {
  await mockTauriInvoke(page, [{ ...syntheticLongHistory[0], id: 501, folderId: 7 }], null, { metadataItemIds: [501] });
  await gotoShell(page, "/?window=metadata");
  await page.locator(".folder-select-trigger").click();
  const panel = page.getByRole("dialog", { name: "Choose folder", exact: true });
  const search = panel.getByRole("combobox", { name: "Search folders" });
  await search.fill("notes");
  await panel.locator('.folder-tree-name[title="/Projects/Notes"]').dblclick();
  await expect(page.getByRole("button", { name: "Folder /Projects/Notes", exact: true })).toBeFocused();
  await page.getByRole("button", { name: "Folder /Projects/Notes", exact: true }).click();
  const projects = panel.locator('.folder-tree-name[title="/Projects"]');
  await projects.click();
  await projects.press("Enter");
  await expect(page.getByRole("button", { name: "Folder /Projects", exact: true })).toBeFocused();
  await expect(page.getByRole("button", { name: "Save changes", exact: true })).toBeDisabled();
});

test("shared folder selector new item dialog covers the folder sidebar for pointer interaction", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 620 });
  await mockTauriInvoke(page);
  await gotoShell(page);
  await revealFolderTree(page);
  await expect(page.getByRole("tree", { name: "History folders" })).toBeVisible();
  await page.getByLabel("Search clipboard history").press("Control+n");
  const dialog = page.getByRole("dialog", { name: "Create new item", exact: true });
  await expect(dialog).toBeVisible();
  const pointerHits = await page.locator('.folder-tree.is-open [data-folder-row="7"]').evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    const point = { x: bounds.left + Math.min(24, bounds.width / 2), y: bounds.top + bounds.height / 2 };
    const hit = document.elementFromPoint(point.x, point.y);
    return { coveredByDialog: Boolean(hit?.closest(".edit-backdrop")), sidebarReceivesPointer: Boolean(hit?.closest(".folder-tree")) };
  });
  expect(pointerHits).toEqual({ coveredByDialog: true, sidebarReceivesPointer: false });
  const content = dialog.getByRole("textbox", { name: "Content", exact: true });
  await content.click();
  await expect(content).toBeFocused();
  await dialog.locator(".folder-select-trigger").click();
  await expect(page.getByRole("dialog", { name: "Choose folder", exact: true }).getByRole("combobox", { name: "Search folders" })).toBeFocused();
});

test("shared folder selector moves clips to a new path from the existing destination dialog", async ({ page }) => {
  await mockTauriInvoke(page, [{ ...syntheticLongHistory[0], id: 501, folderId: 7 }]);
  await gotoShell(page);
  await page.locator(".feed-item").first().hover();
  await page.getByRole("button", { name: "Open item actions" }).first().click();
  await openItemSubmenu(page, "Organize");
  await page.getByRole("menuitem", { name: "Move clip to folder…" }).click();
  const move = page.getByRole("dialog", { name: "moveItems folder", exact: true });
  await move.locator(".folder-select-trigger").click();
  const search = page.getByRole("combobox", { name: "Search folders" });
  await expect(search).toBeFocused();
  await search.fill("Projects");
  const panel = page.getByRole("dialog", { name: "Choose destination", exact: true });
  await panel.locator('.folder-tree-name[title="/Projects"]').click();
  await panel.getByRole("button", { name: "New folder", exact: true }).click();
  await panel.getByRole("textbox", { name: "Folder name", exact: true }).fill("Moved clips");
  await panel.getByRole("button", { name: "Create and choose", exact: true }).click();
  await expect(move).toBeVisible();
  expect(await page.evaluate(() => (window as any).__copicuTestFolders.some((folder: any) => folder.name === "Moved clips"))).toBe(false);
  await move.getByRole("button", { name: "Move clips", exact: true }).click();
  await expect(move).toBeHidden();
  expect(await page.evaluate(() => (window as any).__copicuTestInvocations.find((call: any) => call.cmd === "move_history_items_to_folder").args.folderPath)).toBe("/Projects/Moved clips");
});

test("folder copy keeps the original and reports an existing destination without duplicates", async ({ page }, testInfo) => {
  await mockTauriInvoke(page, [{ ...syntheticLongHistory[1], id: 501, text: "Synthetic independent copy", folderId: 7 }]);
  await gotoShell(page);
  const source = page.locator("#history-item-501");
  const openCopy = async () => {
    await source.hover();
    await source.getByRole("button", { name: "Open item actions" }).click();
    await openItemSubmenu(page, "Organize");
    await page.getByRole("menuitem", { name: "Copy clip to folder…", exact: true }).click();
  };
  const dialog = page.getByRole("dialog", { name: "copyItems folder", exact: true });
  await openCopy();
  await expect(dialog.getByRole("heading", { name: "Copy 1 clip" })).toBeVisible();
  await expect(dialog.locator(".folder-select-trigger")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(source.getByRole("button", { name: "Open item actions" })).toBeFocused();
  expect(await page.evaluate(() => (window as any).__copicuTestInvocations.filter((call: any) => call.cmd === "copy_history_items_to_folder"))).toEqual([]);
  await openCopy();
  await dialog.getByRole("button", { name: "Copy clips", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("1 copied. Originals were kept.", { exact: true })).toBeVisible();
  await expect(page.locator(".feed-item")).toHaveCount(2);
  expect(await page.evaluate(() => (window as any).__copicuTestHistoryItems.map((item: any) => ({ id: item.id, folderId: item.folderId })))).toEqual([{ id: 501, folderId: 7 }, { id: 502, folderId: null }]);
  await openCopy();
  await expect(dialog.getByText(/Content already in the destination is reused/)).toBeVisible();
  await page.screenshot({ path: `.codex-run/folder-copy-${testInfo.project.name}.png` });
  await dialog.getByRole("button", { name: "Copy clips", exact: true }).click();
  await expect(page.getByText("Already in this folder. Originals and destination metadata were kept.", { exact: true })).toBeVisible();
  await expect(page.locator(".feed-item")).toHaveCount(2);
});

async function openResizableSidebar(page: Page) {
  await page.setViewportSize({ width: 1000, height: 620 });
  await mockTauriInvoke(page);
  await page.goto("/");
  if (!(await page.locator(".folder-tree.is-open").isVisible())) await page.getByRole("button", { name: "Show folders" }).click();
  const separator = page.getByRole("separator", { name: "Folder sidebar width" });
  await expect(separator).toHaveAttribute("aria-valuenow", "214");
  return separator;
}

test("sidebar resize pointer commits once, preserves focus and selection, cancels cleanly", async ({ page }) => {
  const separator = await openResizableSidebar(page);
  const search = page.getByLabel("Search clipboard history");
  await search.fill("COPICU");
  await page.waitForFunction(() => (window as any).__copicuTestAppliedDescriptor?.displayQuery === "COPICU");
  const selected = page.locator(".feed-item").nth(1);
  await selected.click({ modifiers: ["Control"] });
  await expect(selected).toHaveClass(/is-multi-selected/);
  await search.focus();
  const box = (await separator.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + 100);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 186, box.y + 100, { steps: 8 });
  await expect(separator).toHaveAttribute("aria-valuenow", "400");
  expect(await sidebarWrites(page)).toHaveLength(0);
  await expect(search).toBeFocused();
  await expect(selected).toHaveClass(/is-multi-selected/);
  await page.mouse.up();
  await expect(selected).toHaveClass(/is-multi-selected/);
  await expect.poll(async () => (await sidebarWrites(page)).length).toBe(1);
  await page.getByRole("button", { name: "Hide folders" }).click();
  await page.getByRole("button", { name: "Show folders" }).click();
  await expect(separator).toHaveAttribute("aria-valuenow", "400");
  await expect(search).toContainText("COPICU");
  for (const abort of ["pointercancel", "blur", "collapse"]) {
    const current = (await separator.boundingBox())!;
    await page.mouse.move(current.x + 4, current.y + 100);
    await page.mouse.down();
    await page.mouse.move(current.x + 44, current.y + 100);
    if (abort === "pointercancel") await separator.dispatchEvent("pointercancel");
    else if (abort === "blur") await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    else await page.getByRole("button", { name: "Hide folders" }).evaluate((button: HTMLButtonElement) => button.click());
    await page.mouse.up();
    if (abort === "collapse") await page.getByRole("button", { name: "Show folders" }).click();
    await expect(separator).toHaveAttribute("aria-valuenow", "400");
    expect(await sidebarWrites(page)).toHaveLength(1);
  }
});

test("sidebar resize keyboard limits, responsive clamp and narrow overlay preserve preference", async ({ page }) => {
  const separator = await openResizableSidebar(page);
  await separator.focus();
  await separator.press("Home");
  await expect(separator).toHaveAttribute("aria-valuenow", "140");
  await separator.press("Shift+ArrowRight");
  await expect(separator).toHaveAttribute("aria-valuenow", "180");
  await separator.press("End");
  await expect(separator).toHaveAttribute("aria-valuenow", "600");
  await expect.poll(async () => (await sidebarWrites(page)).length).toBe(3);
  await page.setViewportSize({ width: 600, height: 620 });
  await expect.poll(async () => Number(await separator.getAttribute("aria-valuenow"))).toBeLessThan(280);
  expect(await sidebarWrites(page)).toHaveLength(3);
  expect((await page.locator(".feed-panel").boundingBox())!.width).toBeGreaterThanOrEqual(320);
  await page.setViewportSize({ width: 420, height: 620 });
  await expect(separator).toHaveCount(0);
  await page.getByRole("button", { name: "Show folders" }).click();
  await expect(page.locator(".folder-tree")).toBeVisible();
  expect(await page.locator(".feed-panel").evaluate((node) => getComputedStyle(node).marginLeft)).toBe("0px");
  expect(await page.locator(".folder-tree").evaluate((node) => node.getBoundingClientRect().width)).toBeLessThanOrEqual(250);
  await page.setViewportSize({ width: 1000, height: 620 });
  await expect(separator).toHaveAttribute("aria-valuenow", "600");
  expect(await sidebarWrites(page)).toHaveLength(3);
  // Simulate a new renderer reading the persisted mock backend, not localStorage.
  await page.addInitScript(() => { (window as any).__copicuTestSettings.picker.folderSidebarWidth = 600; });
  await page.reload();
  await expect(separator).toHaveAttribute("aria-valuenow", "600");
  expect(await page.locator(".folder-workspace-body").evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
  await separator.focus();
  await page.keyboard.down("ArrowLeft");
  await page.keyboard.press("Escape");
  await page.keyboard.up("ArrowLeft");
  await expect(separator).toHaveAttribute("aria-valuenow", "600");
  expect(await sidebarWrites(page)).toHaveLength(0);
});

test("folder context menu anchors to pointer, ellipsis and keyboard in viewport coordinates", async ({ page }, testInfo) => {
  const separator = await openResizableSidebar(page);
  await separator.press("Home");
  for (const width of [1000, 600, 420]) {
    await page.setViewportSize({ width, height: 620 });
    if (width === 420) await page.getByRole("button", { name: "Show folders" }).click();
    const folder = page.getByRole("treeitem", { name: /Projects/ });
    const more = page.getByRole("button", { name: "Actions for Projects" });
    const menu = page.getByRole("menu", { name: "Actions for Projects" });
    await more.click();
    let anchor = (await more.boundingBox())!;
    let bounds = (await menu.boundingBox())!;
    expect(Math.abs(bounds.x - Math.max(8, Math.min(anchor.x, width - 206)))).toBeLessThanOrEqual(1);
    expect(Math.abs(bounds.y - (anchor.y + anchor.height))).toBeLessThanOrEqual(1);
    expect(await menu.evaluate((node) => node.parentElement === document.body)).toBe(true);
    await expect(menu.getByRole("menuitem").first()).toBeFocused();
    await menu.press("ArrowDown");
    await expect(menu.getByRole("menuitem", { name: "Connect shared clipboard…" })).toBeFocused();
    await menu.press("ArrowDown");
    await expect(menu.getByRole("menuitem", { name: "Rename folder" })).toBeFocused();
    await menu.press("Escape");
    await expect(more).toBeFocused();
    await folder.click({ button: "right", position: { x: 10, y: 10 } });
    anchor = (await folder.boundingBox())!;
    bounds = (await menu.boundingBox())!;
    expect(Math.abs(bounds.x - (anchor.x + 10))).toBeLessThanOrEqual(1);
    expect(Math.abs(bounds.y - (anchor.y + 10))).toBeLessThanOrEqual(1);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width - 8);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(612);
    if (width === 1000) await page.screenshot({ path: `.codex-run/folder-menu-${testInfo.project.name}.png` });
    await menu.press("Escape");
    await expect(folder).toBeFocused();
    await folder.press("Shift+F10");
    bounds = (await menu.boundingBox())!;
    anchor = (await folder.boundingBox())!;
    expect(Math.abs(bounds.x - (anchor.x + 24))).toBeLessThanOrEqual(1);
    expect(Math.abs(bounds.y - (anchor.y + anchor.height))).toBeLessThanOrEqual(1);
    await page.getByRole("button", { name: "Hide folders" }).click();
    await expect(menu).toHaveCount(0);
    await page.getByRole("button", { name: "Show folders" }).click();
    await more.click();
    await page.getByLabel("Search clipboard history").click();
    await expect(menu).toHaveCount(0);
  }
});

test("sidebar minimum 140 keeps controls and counts usable with compact folder indentation", async ({ page }, testInfo) => {
  const separator = await openResizableSidebar(page);
  await separator.press("Home");
  await expect(separator).toHaveAttribute("aria-valuenow", "140");
  await expect(page.locator(".folder-tree")).toHaveCSS("width", "140px");
  await page.getByRole("button", { name: "Expand Projects" }).click();
  await expect(page.getByRole("treeitem", { name: /Projects/ }).locator("..")).toHaveCSS("padding-inline-start", "14px");
  await expect(page.getByRole("treeitem", { name: /Notes/ }).locator("..")).toHaveCSS("padding-inline-start", "24px");
  // A four-digit direct count and short name stand in for the screenshot, without real history.
  await page.evaluate(() => {
    const row = document.querySelector('[data-folder-row="7"]')!;
    document.querySelector('[data-folder-row="null"] .folder-tree-count')!.textContent = "4916";
    row.querySelector(".folder-tree-label")!.textContent = "test";
  });
  const geometry = await page.locator(".folder-tree").evaluate((tree) => {
    const bounds = tree.getBoundingClientRect();
    const controls = Array.from(tree.querySelectorAll(".folder-tree-heading button, .folder-expand, .folder-more, .folder-tree-count"));
    const label = tree.querySelector('[data-folder-row="7"] .folder-tree-label')!;
    const all = tree.querySelector('[data-folder-row="all"] .folder-tree-label')!;
    return { inside: controls.every((node) => {
      const rect = node.getBoundingClientRect();
      return rect.left >= bounds.left && rect.right <= bounds.right;
    }), shortNameFits: label.scrollWidth <= label.clientWidth, allFits: all.scrollWidth <= all.clientWidth,
      noOverflow: tree.scrollWidth <= tree.clientWidth };
  });
  expect(geometry).toEqual({ inside: true, shortNameFits: true, allFits: true, noOverflow: true });
  await page.screenshot({ path: `.codex-run/sidebar-140-${testInfo.project.name}.png` });
  await page.getByRole("button", { name: "Hide folders" }).click();
  await page.getByRole("button", { name: "Show folders" }).click();
  await expect(separator).toHaveAttribute("aria-valuenow", "140");
});

test("sidebar divider is a single straight panel edge with an invisible hit target", async ({ page }, testInfo) => {
  const separator = await openResizableSidebar(page);
  const geometry = await separator.evaluate((node) => {
    const tree = document.querySelector(".folder-tree")!.getBoundingClientRect();
    const body = document.querySelector(".folder-workspace-body")!.getBoundingClientRect();
    const header = document.querySelector(".picker-header")!.getBoundingClientRect();
    const handle = node.getBoundingClientRect();
    const line = getComputedStyle(node, "::after");
    return { width: line.width, background: line.backgroundColor, hitWidth: handle.width,
      lineLeft: handle.left + parseFloat(line.left), treeRight: tree.right,
      top: handle.top, bodyTop: body.top, headerBottom: header.bottom, height: handle.height, bodyHeight: body.height };
  });
  expect(geometry.width).toBe("1px");
  expect(geometry.background).toBe("rgba(0, 0, 0, 0)");
  expect(geometry.hitWidth).toBe(8);
  expect(geometry.lineLeft).toBeCloseTo(geometry.treeRight - 1);
  expect(geometry.top).toBeCloseTo(geometry.bodyTop);
  expect(geometry.top).toBeCloseTo(geometry.headerBottom);
  expect(geometry.height).toBeCloseTo(geometry.bodyHeight);
  await separator.hover();
  await expect(separator).toHaveCSS("cursor", "col-resize");
  expect(await separator.evaluate((node) => getComputedStyle(node, "::after").width)).toBe("1px");
  await page.screenshot({ path: `.codex-run/sidebar-standard-${testInfo.project.name}.png` });
  await separator.focus();
  await expect(separator).toHaveCSS("outline-style", "none");
  expect(await separator.evaluate((node) => getComputedStyle(node, "::after").width)).toBe("1px");
});

test("sidebar resize pointer bounds, keyboard repeat, failed save and unmount remain safe", async ({ page }, testInfo) => {
  const separator = await openResizableSidebar(page);
  let box = (await separator.boundingBox())!;
  await page.mouse.move(box.x + 4, box.y + 100);
  await page.mouse.down();
  await page.mouse.move(0, box.y + 100);
  await expect(separator).toHaveAttribute("aria-valuenow", "140");
  await page.mouse.up();
  await expect.poll(async () => (await sidebarWrites(page)).length).toBe(1);
  box = (await separator.boundingBox())!;
  await page.mouse.move(box.x + 4, box.y + 100);
  await page.mouse.down();
  await page.mouse.move(999, box.y + 100);
  await expect(separator).toHaveAttribute("aria-valuenow", "600");
  await page.mouse.up();
  await expect.poll(async () => (await sidebarWrites(page)).length).toBe(2);
  await separator.focus();
  await page.keyboard.down("ArrowLeft");
  await page.keyboard.down("ArrowLeft");
  expect(await sidebarWrites(page)).toHaveLength(2);
  await searchFocusAndCommit();
  await expect(separator).toHaveAttribute("aria-valuenow", "580");
  await expect.poll(async () => (await sidebarWrites(page)).length).toBe(3);
  await page.evaluate(() => { (window as any).__copicuTestSidebarSaveFailure = true; });
  await separator.press("Home");
  await expect(page.getByText(/Could not save folder width:/)).toBeVisible();
  await expect(separator).toHaveAttribute("aria-valuenow", "580");
  await page.evaluate(() => { (window as any).__copicuTestSidebarSaveFailure = false; });
  await page.screenshot({ path: `.codex-run/sidebar-${testInfo.project.name}.png` });
  box = (await separator.boundingBox())!;
  await page.mouse.move(box.x + 4, box.y + 100);
  await page.mouse.down();
  await page.mouse.move(box.x - 40, box.y + 100);
  await page.goto("/?window=settings");
  await page.mouse.up();
  await expect(separator).toHaveCount(0);
  expect(await sidebarWrites(page)).toHaveLength(0);
  await page.goto("/");
  await expect(separator).toHaveAttribute("aria-valuenow", "214");
  expect(await page.locator("html").evaluate((node) => node.classList.contains("clip-pointer-dragging"))).toBe(false);

  async function searchFocusAndCommit() {
    await page.getByLabel("Search clipboard history").focus();
    await page.keyboard.up("ArrowLeft");
  }
});

test("multi metadata folder-only save preserves individual tags and makes unchanged tags explicit", async ({ page }, testInfo) => {
  const selection = [
    { ...syntheticLongHistory[0], id: 9811, title: null, notes: null, tags: "#work #review", folderId: null },
    { ...syntheticLongHistory[1], id: 9812, title: null, notes: null, tags: "#personal", folderId: 7 },
    { ...syntheticLongHistory[2], id: 9813, title: null, notes: null, tags: null, folderId: null },
  ];
  await mockTauriInvoke(page, selection, null, { metadataItemIds: [9811, 9812, 9813] });
  await gotoShell(page, "/?window=metadata");
  const tagSection = page.getByRole("region", { name: "Tags", exact: true });
  await expect(tagSection.getByText("Keep each clip’s tags")).toBeVisible();
  await expect(tagSection.getByRole("checkbox")).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Add tags" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Save changes", exact: true })).toBeDisabled();

  await tagSection.getByRole("button", { name: "Edit tags…" }).click();
  await expect(page.getByRole("textbox", { name: "Add tags" })).toBeFocused();
  await expect(tagSection.getByRole("checkbox", { name: /#review/ })).toHaveAttribute("aria-checked", "mixed");
  await expect(page.getByRole("button", { name: "Save changes", exact: true })).toBeDisabled();
  await tagSection.getByRole("button", { name: "Keep tags unchanged", exact: true }).click();
  await expect(tagSection.getByRole("checkbox")).toHaveCount(0);

  await page.getByRole("button", { name: "Folder Mixed folders", exact: true }).click();
  const folderPanel = page.getByRole("dialog", { name: "Choose folder", exact: true });
  await folderPanel.locator('.folder-tree-name[title="/Projects"]').click();
  await folderPanel.getByRole("button", { name: "Choose folder", exact: true }).click();
  await expect(page.locator(".metadata-change-summary")).toHaveText("Move 3 clips to selected folder · Tags unchanged");
  await page.screenshot({ path: `.codex-run/metadata-tags-preserved-${testInfo.project.name}.png` });
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await page.waitForFunction(() => (window as any).__copicuTestInvocations.some((call: any) => call.cmd === "apply_metadata_selection_intent"));
  const result = await page.evaluate(() => ({
    intent: (window as any).__copicuTestInvocations.find((call: any) => call.cmd === "apply_metadata_selection_intent").args.intent,
    items: (window as any).__copicuTestHistoryItems.map((item: any) => ({ id: item.id, tags: item.tags, folderId: item.folderId })),
  }));
  expect(result.intent.tags).toEqual([]);
  expect(result.intent.folder).toEqual({ op: "set", folderId: 7 });
  expect(result.items).toEqual(selection.map(item => ({ id: item.id, tags: item.tags, folderId: 7 })));
  await expect(tagSection.getByText("Keep each clip’s tags")).toBeVisible();
});

async function mockSharedClipboard(page: Page, delayFirstRead = false, receiverWriter = false) {
  await page.addInitScript(({ delayed, withWriter }) => {
    const runtime = window as any;
    runtime.__copicuSharedSnapshot = {
      available: true, configured: true, paused: false, environment: "synthetic-local", deviceId: "synthetic-home", endpoint: "http://127.0.0.1:18799",
      sendActiveShortcut: null, sendClipboardShortcut: null,
      channels: [{ id: "synthetic-channel", name: "Synthetic channel", canPublish: true, defaultSendChannel: false, receiveEnabled: false, publishFolderEnabled: false, publishFolderId: null, saveToFolder: false, receiveFolderId: null, updateClipboard: false, receiveActionEnabled: false, receiveActionWritesClipboard: false, receiveActionId: null, receiveActionForwardChannelIds: [] }],
      outbox: [], receipts: [
        { subscriptionId: "synthetic-sub", publicationId: "synthetic-work-publication", channelId: "synthetic-channel", sequence: "18446744073709551615", delivery: "recovery", acquisition: "ready", historyOutcome: "skipped", localItemId: null, originDeviceId: "synthetic-work", expiresAtUnixMs: "4102444800000" },
        { subscriptionId: "synthetic-sub", publicationId: "synthetic-live-publication", channelId: "synthetic-channel", sequence: "18446744073709551614", delivery: "live", acquisition: "ready", historyOutcome: "applied", localItemId: 100, originDeviceId: "synthetic-other", expiresAtUnixMs: "4102444800000" },
        { subscriptionId: "synthetic-sub", publicationId: "synthetic-expired-publication", channelId: "synthetic-channel", sequence: "18446744073709551613", delivery: "recovery", acquisition: "expired", historyOutcome: "skipped", localItemId: null, originDeviceId: "synthetic-expired-device", expiresAtUnixMs: "1" },
      ],
    };
    if (withWriter) runtime.__copicuSharedTestActions = [{ id: "synthetic-receiver-action", title: "Synthetic uppercase reception", description: "Synthetic transformed output", source: "script", builtin: false, script: { path: "C:/synthetic/reception.ts", fileName: "reception.ts", sourceHash: "synthetic" }, triggers: ["sharedReception"], input: { source: "none", selection: "none", kinds: null, mime: null, query: null }, capabilities: ["shared:receive:synthetic-channel", "clipboard:write"], diagnostics: [], logging: null }];
    runtime.__copicuSharedReads = [];
    runtime.__copicuSharedTestInvoke = async (cmd: string, args: any) => {
      switch (cmd) {
        case "shared_clipboard_status": return structuredClone(runtime.__copicuSharedSnapshot);
        case "shared_clipboard_identity": return {state: "technical", devices: []};
        case "shared_clipboard_update_channel": runtime.__copicuSharedSnapshot.channels = [structuredClone(args.policy)]; return structuredClone(runtime.__copicuSharedSnapshot);
        case "shared_clipboard_set_paused": runtime.__copicuSharedSnapshot.paused = args.paused; return structuredClone(runtime.__copicuSharedSnapshot);
        case "shared_clipboard_set_hotkeys": runtime.__copicuSharedSnapshot.sendActiveShortcut = args.sendActiveShortcut; runtime.__copicuSharedSnapshot.sendClipboardShortcut = args.sendClipboardShortcut; return structuredClone(runtime.__copicuSharedSnapshot);
        case "shared_clipboard_copy_receipt": return null;
        case "shared_clipboard_receipt_preview":
        case "shared_clipboard_receipt_text": {
          runtime.__copicuSharedReads.push({ subscriptionId: args.subscriptionId, publicationId: args.publicationId });
          if (args.publicationId === "synthetic-work-publication") {
            if (delayed) return new Promise<string>(resolve => { runtime.__copicuSharedResolveFirstRead = () => resolve("COPICU_SYNTH_RECOVERY_TEXT"); });
            return "COPICU_SYNTH_RECOVERY_TEXT\nOriginal immutable publication.";
          }
          if (args.publicationId === "synthetic-live-publication") return "COPICU_SYNTH_LIVE_TEXT\nOriginal live publication.";
          throw new Error("Synthetic reception unavailable");
        }
        default: throw new Error(`Unhandled synthetic shared command: ${cmd}`);
      }
    };
  }, { delayed: delayFirstRead, withWriter: receiverWriter });
}

async function mockSharedProduct(page: Page) {
  await mockSharedClipboard(page);
  await page.addInitScript(() => {
    const runtime = window as any;
    const previous = runtime.__copicuSharedTestInvoke;
    runtime.__copicuSharedSnapshot.connections = [];
    runtime.__copicuSharedSnapshot.generalSendScope = "unfiled";
    runtime.__copicuSharedSnapshot.sendPaused = false;
    runtime.__copicuSharedSnapshot.receivePaused = false;
    runtime.__copicuProductCatalog = {person:{id:"person_a",name:"Synthetic Alex"},mode:"synthetic",people:[{id:"person_a",name:"Synthetic Alex"},{id:"person_b",name:"Synthetic Blair"}],resources:[
      {id:"synthetic-channel",name:"Synthetic clipboard",ownerId:"person_a",ownerName:"Synthetic Alex",permission:"owner",revision:"1",keyState:"ready",retentionHours:24,participants:[{id:"person_a",name:"Synthetic Alex",permission:"owner"}],invites:[]},
      {id:"synthetic-reader",name:"Shared research",ownerId:"person_b",ownerName:"Synthetic Blair",permission:"read",revision:"2",keyState:"ready",retentionHours:24},
    ]};
    runtime.__copicuProductOperations = [];
    const results = new Map();
    runtime.__copicuSharedTestInvoke = async (cmd: string,args: any) => {
      if(cmd === "shared_clipboard_catalog") return structuredClone(runtime.__copicuProductCatalog);
      if(cmd === "shared_clipboard_operation") {
        runtime.__copicuProductOperations.push(structuredClone(args.input));
        if(args.input.kind === "rename" && runtime.__copicuProductConflictRename) {runtime.__copicuProductConflictRename=false;throw new Error("Shared resource changed; refresh before retrying");}
        if(results.has(args.input.operationId)) return structuredClone(results.get(args.input.operationId));
        if(args.input.kind === "create") {
          const resource = {id:"created_synthetic",name:args.input.name,ownerId:"person_a",ownerName:"Synthetic Alex",permission:"owner",revision:"1",keyState:"ready",retentionHours:24};
          runtime.__copicuProductCatalog.resources.push(resource);
          const result={resource};results.set(args.input.operationId,result);
          if(runtime.__copicuProductLoseCreate) {runtime.__copicuProductLoseCreate=false;throw new Error("Synthetic response lost. Retry this operation.");}
          return result;
        }
        return {};
      }
      if(cmd === "shared_clipboard_connection") {
        const s=runtime.__copicuSharedSnapshot;
        if(args.action === "connect") {s.connections=s.connections.filter((c:any)=>c.id!==args.input.id);s.connections.push(args.input);}
        if(args.action === "disconnect") s.connections=s.connections.filter((c:any)=>c.id!==args.input.id);
        if(args.action === "scope") s.generalSendScope=args.input.scope;
        if(args.action === "pause") {if(args.input.sendPaused!==null)s.sendPaused=args.input.sendPaused;if(args.input.receivePaused!==null)s.receivePaused=args.input.receivePaused;}
        return structuredClone(s);
      }
      if(cmd === "shared_clipboard_history") return {entries:[{publicationId:"prior_synthetic",channelId:args.channelId,sequence:"7",originDeviceId:"Synthetic peer",expiresAtUnixMs:"4102444800000",text:"COPICU_SYNTH_PRIOR_AUTHORIZED_HISTORY",status:"ready"}],before:null,head:"7",floor:"1"};
      if(cmd === "shared_clipboard_history_action") return args.action === "save" ? {itemId:123,folderId:null,alreadyExists:true} : {outcome:"applied"};
      return previous(cmd,args);
    };
  });
}

async function mockSharedIdentity(page: Page, initial: "unconfigured" | "active" = "unconfigured") {
  await mockSharedProduct(page);
  await page.addInitScript(({ initial }) => {
    const w = window as any, previous = w.__copicuSharedTestInvoke;
    w.__copicuIdentity = { state: initial, keyCustody: "service", endpoint: "https://synthetic.invalid/", name: "Synthetic Work", deviceId: "synthetic-work", personId: "synthetic-person", revision: "2", fingerprint: "a".repeat(64), devices: [
      { deviceId: "synthetic-work", personId: "synthetic-person", name: "Synthetic Work", state: "active", fingerprint: "a".repeat(64) },
      { deviceId: "synthetic-home", personId: "synthetic-person", name: "Synthetic Home", state: "active", fingerprint: "b".repeat(64) },
    ] };
    w.__copicuSharedSnapshot.configured = initial === "active";
    w.__copicuSharedSnapshot.identityState = initial;
    w.__copicuSharedSnapshot.channels = []; w.__copicuSharedSnapshot.receipts = [];
    w.__copicuProductCatalog.mode = "private";
    w.__copicuIdentityCalls = [];
    w.__copicuSharedTestInvoke = async (cmd: string, args: any) => {
      if (cmd !== "shared_clipboard_identity") return previous(cmd, args);
      const input = args.input; w.__copicuIdentityCalls.push(structuredClone(input));
      if (input.kind === "start") { w.__copicuIdentity.state = "waiting"; w.__copicuIdentity.name = input.name; }
      if (input.kind === "cancel") w.__copicuIdentity.state = "cancelled";
      if (input.kind === "revoke") {
        if (w.__copicuLoseRetirement) { w.__copicuLoseRetirement = false; throw Error("Synthetic response lost. Retry this operation."); }
        w.__copicuIdentity.devices.find((d: any) => d.deviceId === input.deviceId).state = "revoked";
      }
      return structuredClone(w.__copicuIdentity);
    };
  }, { initial });
}

test("Sharing sync diagnostic explains protected key failure, copies safe metadata and clears on recovery", async ({ page }, testInfo) => {
  await mockTauriInvoke(page, syntheticLongHistory, null, { appearance: { theme: "dark", themeId: "default" } }); await mockSharedProduct(page);
  await page.addInitScript(() => {
    const w = window as any;
    w.__copicuSharedSnapshot.lastError = "Protected key storage failed (Missing)";
    w.__copicuSharedSnapshot.syncDiagnostic = { code: "protectedKeys", stage: "Open protected sharing keys", reason: w.__copicuSharedSnapshot.lastError, occurredAtUnixMs: Date.parse("2026-10-05T12:00:00Z"), channelId: null };
    // Values excluded from the diagnostic even when present in status.
    w.__copicuSharedSnapshot.endpoint = "https://synthetic.invalid/?token=DO_NOT_COPY";
    w.__copicuSharedSnapshot.deviceId = "DO_NOT_COPY_DEVICE";
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (text: string) => { w.__copicuCopiedDiagnostic = text; } } });
  });
  await gotoShell(page, "/?window=settings"); await page.getByRole("tab", { name: /^Sharing/ }).click();
  const notice = page.getByRole("region", { name: "Sharing issue" });
  await expect(notice.getByText("Sharing can't open its protected keys", { exact: true })).toBeVisible();
  await expect(notice.getByText("Copicu checks sharing again automatically.", { exact: true })).toBeVisible();
  await expect(page.getByText("Sharing needs attention", { exact: true })).toBeVisible();
  await expect(notice.getByLabel("Sharing diagnostic", { exact: true })).toBeHidden();
  await page.screenshot({ path: `.codex-run/sharing-sync-overview-${testInfo.project.name}.png` });
  await notice.locator("summary").focus(); await page.keyboard.press("Enter");
  await expect(notice.getByLabel("Sharing diagnostic", { exact: true })).toHaveValue(/Cause: Protected key storage failed \(Missing\)/);
  await expect(notice.getByLabel("Sharing diagnostic", { exact: true })).toHaveValue(/2026-10-05T12:00:00.000Z/);
  expect(await notice.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
  await notice.getByRole("button", { name: "Copy diagnostic", exact: true }).click();
  await expect(notice.getByRole("status")).toHaveText("Diagnostic copied.");
  const copied = await page.evaluate(() => (window as any).__copicuCopiedDiagnostic);
  expect(copied).toContain("Code: protectedKeys");
  expect(copied).toContain("Step: Open protected sharing keys");
  expect(copied).not.toMatch(/DO_NOT_COPY|COPICU_SYNTH|http/);
  await page.screenshot({ path: `.codex-run/sharing-sync-diagnostic-${testInfo.project.name}.png` });
  await page.evaluate(() => { const w = window as any; w.__copicuSharedSnapshot.lastError = null; w.__copicuSharedSnapshot.syncDiagnostic = null; });
  await notice.getByRole("button", { name: "Check status", exact: true }).click();
  await expect(notice).toHaveCount(0);
  await expect(page.getByText("Device linked", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as any).__copicuProductOperations)).toEqual([]);
  expect(await page.evaluate(() => (window as any).__copicuSharedReads)).toEqual([]);
});

test("Sharing sync diagnostic respects pause, distinguishes rejection and keeps unrelated failures", async ({ page }, testInfo) => {
  await mockTauriInvoke(page); await mockSharedProduct(page);
  await page.addInitScript(() => {
    const snapshot = (window as any).__copicuSharedSnapshot;
    snapshot.paused = true;
    snapshot.lastError = "Reception action queue is full; reception remains available";
    snapshot.syncDiagnostic = { code: "serviceUnavailable", stage: "Receive shared publications", reason: "The sharing service could not be reached", occurredAtUnixMs: null, channelId: "synthetic-channel" };
  });
  await gotoShell(page, "/?window=settings"); await page.getByRole("tab", { name: /^Sharing/ }).click();
  const notice = page.getByRole("region", { name: "Sharing issue" });
  await expect(notice.getByText("Sharing can't reach the service", { exact: true })).toBeVisible();
  await expect(notice.getByText("Sharing is paused. Resume it when you're ready to try again.", { exact: true })).toBeVisible();
  await expect(notice.getByText(/Another reported issue: Reception action queue/)).toBeVisible();
  await notice.locator("summary").click();
  await expect(notice.getByLabel("Sharing diagnostic", { exact: true })).toHaveValue(/Time unavailable/);
  await expect(notice.getByLabel("Sharing diagnostic", { exact: true })).toHaveValue(/Shared clipboard: Synthetic channel/);
  await page.screenshot({ path: `.codex-run/sharing-sync-paused-${testInfo.project.name}.png` });
  await page.evaluate(() => {
    const snapshot = (window as any).__copicuSharedSnapshot;
    snapshot.paused = false;
    snapshot.syncDiagnostic = { code: "publicationRejected", stage: "Send queued publication", reason: "The publication exceeds the sharing service size limit", occurredAtUnixMs: 1, channelId: "synthetic-channel" };
  });
  await notice.getByRole("button", { name: "Check status", exact: true }).click();
  await expect(notice.getByText("The service rejected a sharing request", { exact: true })).toBeVisible();
  await expect(notice.getByText(/Rejected publications are not resent automatically/)).toBeVisible();
  await expect(notice.getByLabel("Sharing diagnostic", { exact: true })).toHaveValue(/size limit/);
  await expect(notice.getByText(/Another reported issue: Reception action queue/)).toBeVisible();
});

test("Sharing sync diagnostic retains legacy error details and offers manual copy after clipboard failure", async ({ page }) => {
  await mockTauriInvoke(page); await mockSharedProduct(page);
  await page.addInitScript(() => {
    (window as any).__copicuSharedSnapshot.lastError = "Sharing worker could not process this tick";
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => { throw Error("Synthetic clipboard blocked"); } } });
  });
  await gotoShell(page, "/?window=settings"); await page.getByRole("tab", { name: /^Sharing/ }).click();
  const notice = page.getByRole("region", { name: "Sharing issue" });
  await expect(notice.getByText("Sharing couldn't complete its last operation", { exact: true })).toBeVisible();
  await notice.locator("summary").click();
  await expect(notice.getByLabel("Sharing diagnostic", { exact: true })).toHaveValue(/Sharing worker could not process this tick/);
  await notice.getByRole("button", { name: "Copy diagnostic", exact: true }).click();
  await expect(notice.getByRole("status")).toContainText("copy it manually");
  await expect(notice.getByRole("button", { name: "Copy diagnostic", exact: true })).toBeEnabled();
  const field = notice.getByLabel("Sharing diagnostic", { exact: true });
  await field.focus(); await page.keyboard.press("Control+A");
  expect(await field.evaluate((node: HTMLTextAreaElement) => node.selectionEnd - node.selectionStart)).toBe((await field.inputValue()).length);
  await expect(field).toHaveAttribute("readonly", "");
});

test("shared identity first access links by Google account without enabling connections or effects", async ({ page }, testInfo) => {
  await mockTauriInvoke(page); await mockSharedIdentity(page); await gotoShell(page, "/?window=settings");
  await page.getByRole("tab", { name: /^Sharing/ }).click();
  const identity = page.getByRole("region", { name: "Device sign-in" });
  await expect(page.getByText("No device linked", { exact: true })).toBeVisible();
  await expect(identity.getByRole("button", { name: "Sign in with Google" })).toBeDisabled();
  await expect(identity.getByLabel("Sharing service URL")).toHaveCount(0);
  await identity.getByLabel("Name of this PC").fill("Synthetic Home");
  await identity.getByRole("button", { name: "Sign in with Google" }).click();
  expect(await page.evaluate(() => (window as any).__copicuIdentityCalls.find((input: any) => input.kind === "start"))).toEqual({ kind: "start", name: "Synthetic Home" });
  await expect(identity.getByText(/Complete sign-in in your system browser/)).toBeVisible();
  expect(await page.evaluate(() => (window as any).__copicuSharedSnapshot.connections)).toEqual([]);
  await page.evaluate(() => { (window as any).__copicuIdentity.state = "active"; });
  await identity.getByRole("button", { name: "Check sign-in" }).click();
  await expect(identity.getByText(/This PC is linked to your account/)).toBeVisible();
  await expect(identity.getByRole("button", { name: /Approve|recovery/i })).toHaveCount(0);
  expect(await identity.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
  expect(await page.evaluate(() => (window as any).__copicuSharedSnapshot.connections)).toEqual([]);
  await page.screenshot({ path: `.codex-run/shared-identity-linked-${testInfo.project.name}.png` });
});

test("shared identity retirement requires explicit consent and retries the same intention", async ({ page }) => {
  await mockTauriInvoke(page); await mockSharedIdentity(page, "active"); await gotoShell(page, "/?window=settings");
  await page.getByRole("tab", { name: /^Sharing/ }).click();
  const identity = page.getByRole("region", { name: "Device sign-in" });
  await identity.getByText("Devices (2 linked)", { exact: true }).click();
  const row = identity.getByRole("listitem").filter({ hasText: "Synthetic Home" });
  await row.getByRole("button", { name: "Retire device…" }).click();
  await expect(row.getByRole("button", { name: "Retire device", exact: true })).toBeDisabled();
  await row.getByRole("checkbox", { name: "I want to stop this device's access" }).check();
  await page.evaluate(() => { (window as any).__copicuLoseRetirement = true; });
  await row.getByRole("button", { name: "Retire device", exact: true }).click();
  await expect(identity.getByRole("alert")).toContainText("response lost");
  await row.getByRole("button", { name: "Retire device", exact: true }).click();
  await expect(identity.getByRole("status")).toContainText("Device retired");
  const operations = await page.evaluate(() => (window as any).__copicuIdentityCalls.filter((input: any) => input.kind === "revoke"));
  expect(operations).toHaveLength(2); expect(operations[0]).toEqual(operations[1]);
  expect(operations[0].fingerprint).toBe("b".repeat(64));
  expect(await page.evaluate(() => (window as any).__copicuSharedSnapshot.connections)).toEqual([]);
});

test("shared identity explains service custody and equal devices without recovery or approval actions", async ({ page }, testInfo) => {
  await mockTauriInvoke(page); await mockSharedIdentity(page, "active"); await gotoShell(page, "/?window=settings");
  await page.getByRole("tab", { name: /^Sharing/ }).click();
  const identity = page.getByRole("region", { name: "Device sign-in" });
  await identity.getByText("How your shared content is protected", { exact: true }).click();
  await expect(identity.getByText(/the service can decrypt it/)).toBeVisible();
  await expect(identity.getByRole("button", { name: /Approve|recovery|Send available keys/i })).toHaveCount(0);
  await identity.getByText("Devices (2 linked)", { exact: true }).click();
  await expect(identity.getByText(/Each PC has the same account access/)).toBeVisible();
  await expect(identity.getByRole("listitem")).toHaveCount(2);
  expect(await identity.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
  await page.screenshot({ path: `.codex-run/shared-identity-custody-${testInfo.project.name}.png` });
  expect(await page.evaluate(() => (window as any).__copicuTestInvocations.filter((call: any) => /copy|clipboard_write/.test(call.cmd)))).toEqual([]);
});

test("shared identity connect retains its draft across linking and blocks retired access", async ({ page }) => {
  await mockTauriInvoke(page); await mockSharedIdentity(page, "active"); await gotoShell(page); await waitForDefaultHistoryReady(page);
  await page.getByRole("button", { name: "Connect shared clipboard", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Connect shared clipboard" });
  await dialog.getByLabel("Find shared clipboard").fill("Synthetic preserved draft");
  await page.evaluate(async () => { const w = window as any; w.__copicuSharedSnapshot.identityState = "revoked"; await w.__copicuTestEmitEvent("shared-catalog-invalidated", { state: "denied" }); });
  await expect(dialog.getByRole("button", { name: "Open Sharing settings" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Connect clipboard", exact: true })).toBeDisabled();
  await expect(dialog.getByLabel("Find shared clipboard")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Open Sharing settings" }).click();
  await page.evaluate(async () => { const w = window as any; w.__copicuSharedSnapshot.identityState = "active"; await w.__copicuTestEmitEvent("shared-catalog-invalidated", { state: "live" }); });
  await expect(dialog.getByLabel("Find shared clipboard")).toHaveValue("Synthetic preserved draft");
  expect(await page.evaluate(() => (window as any).__copicuSharedSnapshot.connections)).toEqual([]);
});

test("shared product remote invalidation preserves draft focus and selection, then shows removal",async({page})=>{
  await mockTauriInvoke(page);await mockSharedProduct(page);await gotoShell(page);await waitForDefaultHistoryReady(page);
  await page.getByRole("button",{name:"Shared clipboards",exact:true}).click();
  const library=page.getByRole("dialog",{name:"Shared clipboards"});
  await library.getByText("Manage access and clipboard",{exact:true}).click();
  const name=library.getByLabel("New name",{exact:true});await name.fill("Synthetic preserved draft");
  await page.evaluate(async()=>{const w=window as any;w.__copicuProductCatalog.resources[0].name="Synthetic renamed remotely";w.__copicuProductCatalog.resources[0].revision="2";await w.__copicuTestEmitEvent("shared-catalog-invalidated",{state:"live"});});
  await expect(library.getByRole("heading",{name:"Synthetic renamed remotely",exact:true})).toBeVisible();
  await expect(name).toHaveValue("Synthetic preserved draft");await expect(name).toBeFocused();
  await expect(library.getByText(/This clipboard changed remotely/)).toBeVisible();
  await page.evaluate(()=>(window as any).__copicuProductConflictRename=true);
  await library.getByRole("button",{name:"Rename clipboard",exact:true}).click();
  await expect(library.getByRole("alert")).toContainText("changed; refresh");
  const operations=await page.evaluate(()=>(window as any).__copicuProductOperations);
  expect(operations[0].expectedRevision).toBe("1");
  await expect(name).toHaveValue("Synthetic preserved draft");
  await library.getByRole("button",{name:"Keep draft after reviewing current name",exact:true}).click();
  await library.getByRole("button",{name:"Rename clipboard",exact:true}).click();
  await expect(name).toHaveValue("");
  const reviewed=await page.evaluate(()=>(window as any).__copicuProductOperations);
  expect(reviewed[1].expectedRevision).toBe("2");expect(reviewed[1].operationId).not.toBe(reviewed[0].operationId);
  await page.evaluate(async()=>{const w=window as any;w.__copicuProductCatalog.resources=w.__copicuProductCatalog.resources.filter((r:any)=>r.id!=="synthetic-channel");await w.__copicuTestEmitEvent("shared-catalog-invalidated",{state:"live"});});
  await expect(library.getByText(/This clipboard was removed or your access was revoked/)).toBeVisible();
  await expect(library.getByRole("button",{name:"View available history",exact:true})).toHaveCount(0);
});

test("shared product Settings removal preserves drafts and retained connection without enabling effects", async ({ page }, testInfo) => {
  await mockTauriInvoke(page); await mockSharedProduct(page); await gotoShell(page, "/?window=settings");
  await page.getByRole("tab", { name: /^Sharing/ }).click();
  const sharing = page.locator(".shared-clipboard-settings");
  await sharing.locator("summary").filter({ hasText: "Clipboard behavior and automation" }).click();
  const receive = sharing.getByRole("checkbox", { name: "Automatically copy new arrivals to Windows", exact: true });
  await receive.check();
  await sharing.locator("summary").filter({ hasText: /^Send shortcuts/ }).click();
  const shortcut = sharing.getByLabel("Send active Copicu clip", { exact: true });
  await shortcut.fill("Ctrl+Alt+Y");
  await page.evaluate(async () => {
    const w = window as any, s = w.__copicuSharedSnapshot;
    s.connections = [{ id: "general", channelId: s.channels[0].id, kind: "general", folderId: null, direction: "both" }];
    s.channels[0].name = "Synthetic retained clipboard";
    s.channels[0].canPublish = false; s.channels[0].receiveEnabled = false;
    s.unavailableChannelIds = [s.channels[0].id];
    await w.__copicuTestEmitEvent("shared-catalog-invalidated", { state: "live" });
  });
  await expect(sharing.getByText(/This clipboard was removed or your access was revoked/)).toBeVisible();
  await expect(sharing.getByRole("list", { name: "Shared connections" })).toContainText("Synthetic retained clipboard");
  await expect(sharing.getByRole("list", { name: "Shared connections" })).toContainText("cannot send or receive");
  await expect(sharing.getByLabel("Shared clipboard", { exact: true })).toHaveValue("Synthetic retained clipboard · Unavailable");
  await expect(receive).toBeDisabled(); await expect(receive).toBeChecked();
  await expect(sharing.getByRole("button", { name: "Save clipboard behavior", exact: true })).toBeDisabled();
  await expect(shortcut).toHaveValue("Ctrl+Alt+Y"); await expect(shortcut).toBeFocused();
  const state = await page.evaluate(() => ({ connections: (window as any).__copicuSharedSnapshot.connections, saved: (window as any).__copicuSharedSavedPolicies, operations: (window as any).__copicuProductOperations }));
  expect(state.connections).toHaveLength(1); expect(state.saved ?? []).toHaveLength(0); expect(state.operations).toHaveLength(0);
  await page.screenshot({ path: `.codex-run/shared-settings-removal-${testInfo.project.name}.png` });
});

test("shared product connect general is keyboard accessible and cancel never creates",async({page},testInfo)=>{
  await mockTauriInvoke(page);await mockSharedProduct(page);await gotoShell(page);await waitForDefaultHistoryReady(page);
  await page.getByRole("button",{name:"Connect shared clipboard",exact:true}).click();
  const dialog=page.getByRole("dialog",{name:"Connect shared clipboard"});
  await expect(dialog.getByText("All history · General connection",{exact:true})).toBeVisible();
  await dialog.getByLabel("Find shared clipboard").fill("Synthetic");
  await dialog.getByLabel("Find shared clipboard").press("ArrowDown");
  await expect(dialog.getByRole("option",{name:/Synthetic clipboard/})).toBeFocused();
  await dialog.getByRole("button",{name:"Connect clipboard",exact:true}).click();
  await expect(dialog).not.toBeVisible();
  const connections=await page.evaluate(()=>(window as any).__copicuSharedSnapshot.connections);
  expect(connections).toEqual([expect.objectContaining({kind:"general",folderId:null,direction:"receive",channelId:"synthetic-channel"})]);
  await page.getByRole("button",{name:"Connect shared clipboard",exact:true}).click();
  await dialog.getByRole("button",{name:"Create shared clipboard…",exact:true}).click();
  await dialog.getByLabel("New clipboard name").fill("Cancelled synthetic draft");
  await dialog.getByRole("button",{name:"Cancel",exact:true}).click();
  expect(await page.evaluate(()=>(window as any).__copicuProductOperations)).toEqual([]);
  await page.getByRole("button",{name:"Shared clipboards",exact:true}).click();
  const library=page.getByRole("dialog",{name:"Shared clipboards"});
  await expect(library.getByText("Synthetic clipboard",{exact:true}).last()).toBeVisible();
  await page.screenshot({path:testInfo.outputPath("shared-product-library.png")});
});

test("shared product lost create retries immutable intent and history has only explicit effects",async({page},testInfo)=>{
  await mockTauriInvoke(page);await mockSharedProduct(page);await gotoShell(page);await waitForDefaultHistoryReady(page);
  await page.evaluate(()=>(window as any).__copicuProductLoseCreate=true);
  await page.getByRole("button",{name:"Connect shared clipboard",exact:true}).click();
  const connect=page.getByRole("dialog",{name:"Connect shared clipboard"});
  await connect.getByRole("button",{name:"Create shared clipboard…",exact:true}).click();
  await connect.getByLabel("New clipboard name").fill("Synthetic retry clipboard");
  await connect.getByRole("button",{name:"Create and connect",exact:true}).click();
  await expect(connect.getByRole("alert")).toContainText("response lost");
  await connect.getByRole("button",{name:"Create and connect",exact:true}).click();
  await expect(connect).not.toBeVisible();
  const operations=await page.evaluate(()=>(window as any).__copicuProductOperations);
  expect(operations).toHaveLength(2);expect(operations[0]).toEqual(operations[1]);
  await page.getByRole("button",{name:"Shared clipboards",exact:true}).click();
  const library=page.getByRole("dialog",{name:"Shared clipboards"});
  await library.getByRole("button",{name:/Synthetic clipboard Mine/}).click();
  await library.getByRole("button",{name:"View available history",exact:true}).click();
  await expect(library.getByText("COPICU_SYNTH_PRIOR_AUTHORIZED_HISTORY",{exact:true})).toBeVisible();
  const effects=await page.evaluate(()=>(window as any).__copicuTestInvocations.filter((call:any)=>["shared_clipboard_history_action","shared_clipboard_copy_receipt","create_history_item"].includes(call.cmd)));
  expect(effects).toEqual([]);
  await library.getByRole("button",{name:"Save in folder",exact:true}).click();
  await expect(library.getByRole("status")).toContainText("Already in this folder. Received again");
  await page.screenshot({path:testInfo.outputPath("shared-product-history.png")});
  await library.getByRole("button",{name:"Close",exact:true}).click();
  await expect(page.getByRole("button",{name:"Shared clipboards",exact:true})).toBeFocused();
});

test("shared product folder selector preserves exact context and chosen direction",async({page},testInfo)=>{
  await mockTauriInvoke(page);await mockSharedProduct(page);await gotoShell(page);await waitForDefaultHistoryReady(page);
  await revealFolderTree(page);
  await page.getByRole("button",{name:"Actions for Projects",exact:true}).click();
  await page.getByRole("menuitem",{name:"Connect shared clipboard…",exact:true}).click();
  const dialog=page.getByRole("dialog",{name:"Connect shared clipboard"});
  await expect(dialog.getByText("Projects · Exact folder",{exact:true})).toBeVisible();
  await dialog.getByRole("option",{name:/Synthetic clipboard/}).click();
  await dialog.getByLabel("Direction",{exact:true}).click();
  await page.getByRole("option",{name:"Send and receive",exact:true}).click();
  await expect(dialog.getByLabel("Direction",{exact:true})).toHaveValue("Send and receive");
  await page.screenshot({path:testInfo.outputPath("shared-product-folder-selector.png")});
  await dialog.getByRole("button",{name:"Connect clipboard",exact:true}).click();
  expect(await page.evaluate(()=>(window as any).__copicuSharedSnapshot.connections)).toEqual([expect.objectContaining({id:"folder_7",kind:"folder",folderId:7,direction:"both"})]);
});

test("shared product folder connection explains disabled confirmation and requires explicit reception move", async ({ page }, testInfo) => {
  await mockTauriInvoke(page); await mockSharedProduct(page); await gotoShell(page); await waitForDefaultHistoryReady(page);
  await page.getByRole("button", { name: "Connect shared clipboard", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Connect shared clipboard" });
  await dialog.getByRole("option", { name: /Synthetic clipboard/ }).click();
  await dialog.getByRole("button", { name: "Connect clipboard", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await revealFolderTree(page);
  await page.getByRole("button", { name: "Actions for Projects", exact: true }).click();
  await page.getByRole("menuitem", { name: "Connect shared clipboard…", exact: true }).click();
  await dialog.getByRole("option", { name: /Synthetic clipboard/ }).click();
  await dialog.getByLabel("Direction", { exact: true }).click();
  await page.getByRole("option", { name: "Send and receive", exact: true }).click();
  const confirm = dialog.getByRole("button", { name: "Connect clipboard", exact: true });
  await expect(confirm).toBeDisabled();
  await expect(dialog.getByRole("status")).toContainText("already connected to All history (Root) for reception on this PC");
  await expect(confirm).toHaveAttribute("aria-describedby", "shared-connect-reception-notice");
  await page.screenshot({path:testInfo.outputPath("shared-product-reception-move.png")});
  expect(await page.evaluate(() => (window as any).__copicuTestInvocations.filter((call:any) => call.cmd === "shared_clipboard_connection" && call.args.action === "connect").length)).toBe(1);
  await dialog.getByRole("checkbox", { name: "Move automatic reception from All history (Root) to Projects" }).check();
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await expect(dialog).not.toBeVisible();
  const calls = await page.evaluate(() => (window as any).__copicuTestInvocations.filter((call:any) => call.cmd === "shared_clipboard_connection" && call.args.action === "connect"));
  expect(calls).toHaveLength(2);
  expect(calls[1].args.input).toEqual({id:"folder_7",channelId:"synthetic-channel",kind:"folder",folderId:7,direction:"both",moveReception:true});
});

test("folder reception feedback survives reopening and a repeated arrival preserves selection", async ({ page }, testInfo) => {
  const now = Date.now();
  await mockTauriInvoke(page, [
    { ...syntheticLongHistory[1], id: 601, text: "Synthetic newer local clip", normalized_hash: "newer-local", folderId: 7, created_at_unix_ms: now, last_copied_at_unix_ms: now },
    { ...syntheticLongHistory[1], id: 602, text: "Synthetic received clip", normalized_hash: "received", folderId: 7, created_at_unix_ms: now - 2000, last_copied_at_unix_ms: now - 2000, last_received_at_unix_ms: now - 1000 },
  ]);
  await mockSharedProduct(page);
  await page.addInitScript(({ now }) => {
    const snapshot = (window as any).__copicuSharedSnapshot;
    snapshot.connections = [{ id: "folder_7", kind: "folder", folderId: 7, channelId: "synthetic-channel", direction: "both" }];
    snapshot.receipts = [{ ...snapshot.receipts[1], localItemId: 602, historyResult: { outcome: "created", folderId: 7, folderName: "Projects", receivedAtUnixMs: now - 1000 } }];
  }, { now });
  await gotoShell(page);
  const enterProjects = async () => {
    await revealFolderTree(page);
    await page.locator('[data-folder-row="7"]').click();
  };
  await enterProjects();
  const activity = page.locator(".shared-folder-activity");
  await expect(activity).toHaveText("Saved in Projects");
  await page.reload();
  if (!(await activity.isVisible())) await enterProjects();
  await expect(activity).toHaveText("Saved in Projects");
  await page.locator("#history-item-601 .feed-item").click();
  await expect(page.locator("#history-item-601 .feed-item")).toHaveClass(/is-selected/);
  const search = page.getByLabel("Search clipboard history");
  await search.focus();
  await page.evaluate(async () => {
    const w = window as any;
    const received = w.__copicuTestHistoryItems.find((item: any) => item.id === 602);
    received.last_received_at_unix_ms = Date.now();
    w.__copicuTestHistoryItems = [received, ...w.__copicuTestHistoryItems.filter((item: any) => item.id !== 602)];
    w.__copicuSharedSnapshot.receipts[0].historyResult = { outcome: "existing", folderId: 7, folderName: "Projects", receivedAtUnixMs: received.last_received_at_unix_ms };
    await w.__copicuTestEmitEvent("copicu://history/changed", { itemId: 602, contentKind: "text" });
    await w.__copicuTestEmitEvent("shared-catalog-invalidated", { state: "connected" });
  });
  await expect(activity).toHaveText("Received again in Projects");
  await expect(page.locator(".feed-item")).toHaveCount(2);
  await expect(page.locator(".feed-item").first()).toContainText("Synthetic received clip");
  await expect(page.locator("#history-item-601 .feed-item")).toHaveClass(/is-selected/);
  await expect(search).toBeFocused();
  await expect(page.locator("#history-item-602 .item-received-status")).toHaveText("Received");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: `.codex-run/folder-reception-${testInfo.project.name}.png` });
  await page.getByRole("button", { name: "Shared clipboard", exact: true }).click();
  await expect(page.getByTestId("shared-clipboard-feed").getByRole("option")).toContainText("Received again in Projects");
});

test("shared clipboard previews immutable recovered text only on selection and copies manually", async ({ page }, testInfo) => {
  await mockTauriInvoke(page);
  await mockSharedClipboard(page);
  await gotoShell(page);
  await waitForDefaultHistoryReady(page);
  await page.getByRole("button", { name: "Shared clipboard", exact: true }).click();
  const feed = page.getByTestId("shared-clipboard-feed");
  await expect(feed.getByRole("option")).toHaveCount(3);
  expect(await page.evaluate(() => (window as any).__copicuSharedReads)).toEqual([]);
  await feed.getByRole("option").filter({ hasText: "From synthetic-work" }).click();
  await expect(feed.getByLabel("Received plain text")).toContainText("COPICU_SYNTH_RECOVERY_TEXT");
  await expect(feed.getByText("This publication is immutable.", { exact: false })).toBeVisible();
  await expect(feed.getByText("Recovered and delayed content stays available", { exact: false })).toBeVisible();
  expect(await page.evaluate(() => (window as any).__copicuSharedReads)).toEqual([{ subscriptionId: "synthetic-sub", publicationId: "synthetic-work-publication" }]);
  await feed.getByRole("button", { name: "Copy text", exact: true }).click();
  await expect(feed.getByRole("status")).toContainText("Received text copied to Windows clipboard.");
  const copies = await page.evaluate(() => (window as any).__copicuTestInvocations.filter((call: any) => call.cmd === "shared_clipboard_copy_receipt"));
  expect(copies).toHaveLength(1);
  expect(copies[0].args).toEqual({ subscriptionId: "synthetic-sub", publicationId: "synthetic-work-publication" });
  await page.screenshot({ path: `.codex-run/shared-reception-${testInfo.project.name}.png` });
  await feed.getByRole("button", { name: "Return to local history", exact: true }).click();
  await expect(feed).toHaveCount(0);
  await expect(page.getByText("COPICU_SYNTH_RECOVERY_TEXT", { exact: false })).toHaveCount(0);
});

test("shared product images preview and require explicit copy save and Windows clipboard send", async ({ page }, testInfo) => {
  await mockTauriInvoke(page); await mockSharedProduct(page);
  await page.addInitScript(({ image }) => {
    const runtime = window as any, previous = runtime.__copicuSharedTestInvoke;
    runtime.__copicuSharedTestInvoke = async (cmd: string, args: any) => {
      if (cmd === "shared_clipboard_history") return { entries: [{ publicationId: "synthetic-image", channelId: args.channelId, sequence: "8", originDeviceId: "Synthetic peer", expiresAtUnixMs: "4102444800000", kind: "image", image, width: 256, height: 192, byteSize: 1234, status: "available" }], before: null, head: "8", floor: "1" };
      if (cmd === "shared_clipboard_publish_current") return { publicationId: "synthetic-current-image", state: "queued" };
      return previous(cmd, args);
    };
  }, { image: pngDataUrl(256,192,"#245f53") });
  await gotoShell(page); await waitForDefaultHistoryReady(page);
  await page.getByRole("button", { name:"Shared clipboards",exact:true }).click();
  const library = page.getByRole("dialog", { name:"Shared clipboards" });
  await library.getByRole("button", { name:/Synthetic clipboard Mine/ }).click();
  await library.getByRole("button", { name:"View available history",exact:true }).click();
  await expect(library.getByRole("img", { name:"Shared clipboard image" })).toBeVisible();
  await expect(library.getByText("256 × 192",{exact:true})).toBeVisible();
  expect(await page.evaluate(() => (window as any).__copicuTestInvocations.filter((c:any) => ["shared_clipboard_history_action","shared_clipboard_publish_current"].includes(c.cmd)))).toEqual([]);
  await library.getByRole("button", {name:"Copy image",exact:true}).click();
  await expect(library.getByRole("status")).toContainText("Shared image copied to Windows.");
  await library.getByRole("button", {name:"Save in folder",exact:true}).click();
  await library.getByRole("button", {name:"Send Windows clipboard",exact:true}).click();
  await expect(library.getByRole("status")).toContainText("Queued publication synthetic-current-image");
  const commands = await page.evaluate(() => (window as any).__copicuTestInvocations.filter((c:any) => ["shared_clipboard_history_action","shared_clipboard_publish_current"].includes(c.cmd)));
  expect(commands.map((c:any) => [c.cmd,c.args.action ?? "send"])).toEqual([["shared_clipboard_history_action","copy"],["shared_clipboard_history_action","save"],["shared_clipboard_publish_current","send"]]);
  await page.screenshot({path:testInfo.outputPath("shared-product-image.png")});
});

test("shared clipboard image reception previews as image and clears it on expiry selection", async ({ page }, testInfo) => {
  await mockTauriInvoke(page); await mockSharedClipboard(page);
  await page.addInitScript(({ image }) => {
    const runtime = window as any, previous = runtime.__copicuSharedTestInvoke;
    runtime.__copicuSharedTestInvoke = async (cmd: string,args:any) => cmd === "shared_clipboard_receipt_preview" && args.publicationId === "synthetic-work-publication" ? {kind:"image",image,width:256,height:192,byteSize:1234} : previous(cmd,args);
  }, {image:pngDataUrl(256,192,"#245f53")});
  await gotoShell(page); await waitForDefaultHistoryReady(page);
  await page.getByRole("button",{name:"Shared clipboard",exact:true}).click();
  const feed = page.getByTestId("shared-clipboard-feed");
  await feed.getByRole("option").filter({hasText:"From synthetic-work"}).click();
  await expect(feed.getByRole("img",{name:"Received clipboard image"})).toBeVisible();
  await expect(feed.getByLabel("Received plain text")).toHaveCount(0);
  await feed.getByRole("button",{name:"Copy image",exact:true}).click();
  await expect(feed.getByRole("status")).toContainText("Received image copied to Windows clipboard.");
  await page.screenshot({path:testInfo.outputPath("shared-received-image.png")});
  await feed.getByRole("option").filter({hasText:"From synthetic-expired-device"}).click();
  await expect(feed.getByRole("img")).toHaveCount(0);
  await expect(feed.getByRole("button",{name:"Copy text",exact:true})).toBeDisabled();
});

test("shared clipboard keyboard selection rejects stale previews and keeps expired metadata", async ({ page }) => {
  await mockTauriInvoke(page);
  await mockSharedClipboard(page, true);
  await gotoShell(page);
  await waitForDefaultHistoryReady(page);
  await page.getByRole("button", { name: "Shared clipboard", exact: true }).click();
  const feed = page.getByTestId("shared-clipboard-feed");
  const recovered = feed.getByRole("option").filter({ hasText: "From synthetic-work" });
  await recovered.click();
  await expect(feed.getByRole("status")).toContainText("Reading received content…");
  await recovered.press("ArrowDown");
  await expect(feed.getByRole("option").filter({ hasText: "From synthetic-other" })).toBeFocused();
  await expect(feed.getByLabel("Received plain text")).toContainText("COPICU_SYNTH_LIVE_TEXT");
  await page.evaluate(() => (window as any).__copicuSharedResolveFirstRead());
  await expect(feed.getByLabel("Received plain text")).toContainText("COPICU_SYNTH_LIVE_TEXT");
  await expect(feed.getByText("COPICU_SYNTH_RECOVERY_TEXT", { exact: false })).toHaveCount(0);
  await feed.getByRole("option").filter({ hasText: "From synthetic-expired-device" }).click();
  await expect(feed.getByRole("button", { name: "Copy text", exact: true })).toBeDisabled();
  await expect(feed.getByText("Content is unavailable or expired.", { exact: false })).toBeVisible();
  expect(await page.evaluate(() => (window as any).__copicuSharedReads)).toHaveLength(2);
  await feed.getByLabel("Filter receptions by channel or device").fill("no such device");
  await expect(feed.getByText("No channels or devices match this filter.")).toBeVisible();
});

test("shared clipboard settings keep folder reception Windows and send shortcuts independent", async ({ page }, testInfo) => {
  await mockTauriInvoke(page);
  await mockSharedProduct(page);
  await gotoShell(page, "/?window=settings");
  await expect(page.getByLabel("Search settings")).toBeVisible();
  await page.getByRole("tab", { name: /^Sharing/ }).click();
  const sharing = page.locator(".shared-clipboard-settings");
  await expect(sharing.getByText("Device linked", { exact: true })).toBeVisible();
  await expect(sharing.locator("form")).toHaveCount(0);
  await sharing.getByRole("button", { name: "Connect a folder…", exact: true }).click();
  const connection = page.getByRole("dialog", { name: "Connect shared clipboard" });
  await expect(connection.getByRole("button", { name: "Local folder /", exact: true })).toBeVisible();
  await connection.getByRole("option", { name: /Synthetic clipboard/ }).click();
  await connection.getByLabel("Direction", { exact: true }).click();
  await page.getByRole("option", { name: "Send and receive", exact: true }).click();
  await connection.getByRole("button", { name: "Connect clipboard", exact: true }).click();
  await expect(connection).toHaveCount(0);
  await expect(sharing.getByRole("list", { name: "Shared connections" })).toContainText("Root");
  const configured = await page.evaluate(() => (window as any).__copicuSharedSnapshot.channels[0]);
  expect(configured.updateClipboard).toBe(false); expect(configured.receiveActionEnabled).toBe(false);
  expect(await page.evaluate(() => (window as any).__copicuSharedSnapshot.connections)).toEqual([expect.objectContaining({ kind: "folder", folderId: null, direction: "both" })]);
  await sharing.locator("summary").filter({ hasText: "Clipboard behavior and automation" }).click();
  await expect(sharing.getByRole("checkbox", { name: "Automatically copy new arrivals to Windows", exact: true })).not.toBeChecked();
  await sharing.locator("summary").filter({ hasText: /^Send shortcuts/ }).click();
  await sharing.getByLabel("Send active Copicu clip", { exact: true }).fill("F8");
  await sharing.getByLabel("Send Windows clipboard", { exact: true }).fill("Ctrl+Alt+Y");
  const generalSaves = await page.evaluate(() => (window as any).__copicuTestInvocations.filter((call: any) => ["update_settings", "close_settings_window"].includes(call.cmd)).length);
  await sharing.getByLabel("Send active Copicu clip", { exact: true }).press("Enter");
  expect(await page.evaluate(() => (window as any).__copicuTestInvocations.filter((call: any) => ["update_settings", "close_settings_window"].includes(call.cmd)).length)).toBe(generalSaves);
  await sharing.getByRole("button", { name: "Save shortcuts", exact: true }).click();
  const shortcuts = await page.evaluate(() => (window as any).__copicuTestInvocations.find((call: any) => call.cmd === "shared_clipboard_set_hotkeys"));
  expect(shortcuts.args).toEqual({ sendActiveShortcut: "F8", sendClipboardShortcut: "Ctrl+Alt+Y" });
  await sharing.getByLabel("Send active Copicu clip", { exact: true }).fill("F9");
  await sharing.getByLabel("Send active Copicu clip", { exact: true }).press("Control+Enter");
  await expect.poll(() => page.evaluate(() => (window as any).__copicuSharedSnapshot.sendActiveShortcut)).toBe("F9");
  expect(await page.evaluate(() => (window as any).__copicuTestInvocations.filter((call: any) => ["update_settings", "close_settings_window"].includes(call.cmd)).length)).toBe(generalSaves);
  await sharing.getByRole("checkbox", { name: "Automatically copy new arrivals to Windows", exact: true }).check();
  await sharing.getByRole("button", { name: "View receptions", exact: true }).click();
  const feed = page.getByTestId("shared-clipboard-feed");
  await expect(feed.getByRole("option")).toHaveCount(3);
  await feed.getByRole("option").filter({ hasText: "From synthetic-work" }).click();
  await expect(feed.getByLabel("Received plain text")).toContainText("COPICU_SYNTH_RECOVERY_TEXT");
  await feed.getByRole("button", { name: "Back to Sharing settings", exact: true }).click();
  await expect(feed).toHaveCount(0);
  await expect(sharing.getByRole("checkbox", { name: "Automatically copy new arrivals to Windows", exact: true })).toBeChecked();
  await expect(sharing.getByText("Not saved", { exact: true })).toBeVisible();
  await sharing.getByRole("button", { name: "Pause sharing", exact: true }).click();
  await expect(sharing.getByText("Sharing paused", { exact: true })).toBeVisible();
  await expect(sharing.getByRole("button", { name: "Resume sharing", exact: true })).toBeVisible();
  await page.screenshot({ path: `.codex-run/shared-settings-${testInfo.project.name}.png` });
});

test("shared clipboard reception action writer requires an explicit mutually exclusive output", async ({ page }) => {
  await mockTauriInvoke(page);
  await mockSharedClipboard(page, false, true);
  await gotoShell(page, "/?window=settings");
  await expect(page.getByLabel("Search settings")).toBeVisible();
  await page.getByRole("tab", { name: /^Sharing/ }).click();
  const sharing = page.locator(".shared-clipboard-settings");
  await sharing.locator("summary").filter({ hasText: "Clipboard behavior and automation" }).click();
  const originalWriter = sharing.getByRole("checkbox", { name: "Automatically copy new arrivals to Windows", exact: true });
  await originalWriter.check();
  await sharing.locator("summary").filter({ hasText: "Run a script when content arrives" }).click();
  await sharing.getByRole("checkbox", { name: "Run a local action on live arrivals", exact: true }).check();
  await sharing.getByLabel("Reception action", { exact: true }).click();
  await page.getByRole("option", { name: "Synthetic uppercase reception", exact: true }).click();
  const actionWriter = sharing.getByRole("checkbox", { name: "Allow reception action to update Windows clipboard", exact: true });
  await expect(actionWriter).not.toBeChecked();
  await expect(actionWriter).toBeDisabled();
  await originalWriter.uncheck();
  await expect(actionWriter).toBeEnabled();
  await actionWriter.check();
  await expect(originalWriter).toBeDisabled();
  await sharing.getByRole("button", { name: "Save clipboard behavior", exact: true }).click();
  const configured = await page.evaluate(() => (window as any).__copicuSharedSnapshot.channels[0]);
  expect(configured.receiveActionEnabled).toBe(true);
  expect(configured.receiveActionId).toBe("synthetic-receiver-action");
  expect(configured.receiveActionWritesClipboard).toBe(true);
  expect(configured.updateClipboard).toBe(false);
  await sharing.getByRole("checkbox", { name: "Run a local action on live arrivals", exact: true }).uncheck();
  await expect(actionWriter).toHaveCount(0);
  await expect(originalWriter).toBeEnabled();
  await sharing.getByRole("button", { name: "Save clipboard behavior", exact: true }).click();
  expect(await page.evaluate(() => (window as any).__copicuSharedSnapshot.channels[0].receiveActionWritesClipboard)).toBe(false);
});

test("picker chrome groups the Settings sliders first on the right and only hides from the last", async ({ page }, testInfo) => {
  await mockTauriInvoke(page); await gotoShell(page); await waitForDefaultHistoryReady(page);
  const chrome = page.locator(".custom-window-frame.is-floatingPicker > .window-chrome");
  const controls = chrome.locator(".window-controls");
  const settings = controls.getByRole("button", { name: "Settings", exact: true });
  await expect(chrome.getByRole("button").first()).toHaveAccessibleName("Move Copicu");
  await expect(controls.getByRole("button").first()).toHaveAccessibleName("Settings");
  await expect(settings.locator("svg")).toHaveClass(/sliders-horizontal/);
  const frame = (await chrome.boundingBox())!;
  expect((await settings.boundingBox())!.x).toBeGreaterThan(frame.x + frame.width / 2);
  await chrome.getByRole("button", { name: "Move Copicu", exact: true }).focus();
  await page.keyboard.press("Tab");
  await expect(settings).toBeFocused();
  await expect(chrome.getByRole("button").last()).toHaveAccessibleName("Hide Copicu");
  await expect(page.getByRole("button", { name: /Quit Copicu/i })).toHaveCount(0);
  await chrome.getByRole("button", { name: "Settings", exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__copicuTestInvocations.some((call: any) => call.cmd === "open_settings_window"))).toBe(true);
  await chrome.getByRole("button", { name: "Hide Copicu", exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__copicuTestInvocations.some((call: any) => call.cmd === "hide_picker"))).toBe(true);
  expect(await page.evaluate(() => (window as any).__copicuTestInvocations.filter((call: any) => /quit_app|start_dragging/.test(call.cmd)))).toEqual([]);
  await page.screenshot({ path: `.codex-run/picker-settings-chrome-${testInfo.project.name}.png` });
});

test("Sharing follows General and makes independent saves clear without losing other preference drafts", async ({ page }, testInfo) => {
  await mockTauriInvoke(page); await mockSharedProduct(page); await gotoShell(page, "/?window=settings");
  await expect(page.getByRole("tab").nth(0)).toHaveText(/General/);
  await expect(page.getByRole("tab").nth(1)).toHaveText(/Sharing/);
  await expect(page.getByRole("tab").nth(2)).toHaveText(/Hotkeys/);
  await page.getByRole("tab", { name: /^Sharing/ }).click();
  await expect(page.getByRole("button", { name: "Close settings", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save", exact: true })).toHaveCount(0);
  await page.getByLabel("Search settings").press("Control+Enter");
  expect(await page.evaluate(() => (window as any).__copicuTestInvocations.filter((call: any) => /update_settings|close_settings_window/.test(call.cmd)))).toEqual([]);
  await page.getByRole("tab", { name: /^General/ }).click();
  await page.getByRole("switch", { name: "Capture clipboard changes", exact: true }).uncheck();
  await page.getByRole("tab", { name: /^Sharing/ }).click();
  await expect(page.getByText(/You have unsaved changes in other categories/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Save other preferences", exact: true })).toBeVisible();
  await page.getByRole("tab", { name: /^General/ }).click();
  await expect(page.getByRole("switch", { name: "Capture clipboard changes", exact: true })).not.toBeChecked();
  await page.getByRole("tab", { name: /^Sharing/ }).click();
  await page.locator(".shared-clipboard-settings summary").filter({ hasText: "Clipboard behavior and automation" }).click();
  await page.getByRole("combobox", { name: "Shared clipboard", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("form", { name: "Settings", exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as any).__copicuTestInvocations.filter((call: any) => call.cmd === "close_settings_window"))).toEqual([]);
  await page.screenshot({ path: `.codex-run/sharing-save-scope-${testInfo.project.name}.png` });
  await page.getByRole("button", { name: "Save other preferences", exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__copicuTestSettings.general.captureEnabled)).toBe(false);
});

test("Sharing edits a legacy folder connection without duplicating it or replaying stale behavior topology", async ({ page }, testInfo) => {
  await mockTauriInvoke(page); await mockSharedProduct(page);
  await page.addInitScript(() => {
    const w = window as any, s = w.__copicuSharedSnapshot;
    s.channels[0].receiveEnabled = true; s.channels[0].saveToFolder = true; s.channels[0].receiveFolderId = 7;
    s.connections = [{ id: "legacy_receive_synthetic-channel", channelId: "synthetic-channel", kind: "folder", folderId: 7, direction: "receive" }];
  });
  await gotoShell(page, "/?window=settings"); await page.getByRole("tab", { name: /^Sharing/ }).click();
  const sharing = page.locator(".shared-clipboard-settings");
  const connections = sharing.getByRole("list", { name: "Shared connections" });
  await expect(connections).toContainText("/Projects");
  await expect(sharing.getByRole("checkbox", { name: "Publish new local arrivals", exact: true })).toHaveCount(0);
  await sharing.locator("summary").filter({ hasText: "Clipboard behavior and automation" }).click();
  const writer = sharing.getByRole("checkbox", { name: "Automatically copy new arrivals to Windows", exact: true });
  await writer.check();
  await connections.getByRole("button", { name: "Edit", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "Edit connection", exact: true });
  await expect(editor.getByRole("option", { name: /Synthetic clipboard/ })).toHaveAttribute("aria-selected", "true");
  await expect(editor.getByLabel("Direction", { exact: true })).toHaveValue("Receive");
  await expect(editor.getByRole("checkbox", { name: /Move automatic reception/ })).toHaveCount(0);
  await editor.getByLabel("Direction", { exact: true }).click();
  await page.getByRole("option", { name: "Send and receive", exact: true }).click();
  await editor.getByRole("button", { name: "Save connection", exact: true }).click();
  await expect(editor).toHaveCount(0);
  await expect(writer).toBeChecked();
  await expect(connections.getByRole("listitem")).toHaveCount(1);
  await expect(connections).toContainText("Send and receive");
  // Model a new receiving destination from another window while the effect draft is open.
  await page.evaluate(async () => {
    const w = window as any, s = w.__copicuSharedSnapshot;
    s.channels[0].publishFolderEnabled = true; s.channels[0].publishFolderId = 7;
    s.channels[0].receiveFolderId = null;
    await w.__copicuTestEmitEvent("shared-catalog-invalidated", { state: "live" });
  });
  // The save-time refresh must also keep effects changed by another window since the last UI refresh.
  await page.evaluate(() => { (window as any).__copicuSharedSnapshot.channels[0].defaultSendChannel = true; });
  await sharing.getByRole("button", { name: "Save clipboard behavior", exact: true }).click();
  await expect(sharing.getByText("Clipboard behavior saved.", { exact: true })).toBeVisible();
  const saved = await page.evaluate(() => ({ snapshot: (window as any).__copicuSharedSnapshot, calls: (window as any).__copicuTestInvocations.filter((call: any) => call.cmd === "shared_clipboard_update_channel") }));
  expect(saved.snapshot.connections).toHaveLength(1);
  expect(saved.snapshot.connections[0].id).toBe("legacy_receive_synthetic-channel");
  expect(saved.calls.at(-1).args.policy).toMatchObject({ updateClipboard: true, defaultSendChannel: true, receiveFolderId: null, publishFolderEnabled: true, publishFolderId: 7 });
  await page.screenshot({ path: `.codex-run/sharing-connection-edit-${testInfo.project.name}.png` });
});

test("Sharing folder chooser connects an exact folder and preserves Root versus All history", async ({ page }, testInfo) => {
  await mockTauriInvoke(page); await mockSharedProduct(page); await gotoShell(page, "/?window=settings");
  await page.getByRole("tab", { name: /^Sharing/ }).click();
  const sharing = page.locator(".shared-clipboard-settings");
  await sharing.getByRole("button", { name: "Connect a folder…", exact: true }).click();
  const connection = page.getByRole("dialog", { name: "Connect shared clipboard" });
  await connection.getByRole("button", { name: "Local folder /", exact: true }).click();
  const folders = page.getByRole("dialog", { name: "Choose local folder", exact: true });
  await folders.locator('.folder-tree-name[title="/Projects"]').click();
  await folders.getByRole("button", { name: "Choose folder", exact: true }).click();
  await expect(connection.getByRole("button", { name: "Local folder /Projects", exact: true })).toBeVisible();
  await connection.getByRole("option", { name: /Shared research/ }).click();
  await connection.getByLabel("Direction", { exact: true }).click();
  await expect(page.getByRole("option", { name: "Send and receive", exact: true })).toHaveAttribute("data-combobox-disabled", "true");
  await page.keyboard.press("Escape");
  await expect(connection).toBeVisible();
  await connection.getByRole("button", { name: "Connect clipboard", exact: true }).click();
  await expect(connection).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).__copicuSharedSnapshot.connections)).toEqual([expect.objectContaining({ kind: "folder", folderId: 7, direction: "receive", channelId: "synthetic-reader" })]);
  await expect(sharing.getByRole("button", { name: "Connect a folder…", exact: true })).toBeFocused();
  expect(await sharing.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
  await page.screenshot({ path: `.codex-run/sharing-connected-folder-${testInfo.project.name}.png` });
});

test("Sharing overview separates this PC, folder connections and recent destinations", async ({ page }, testInfo) => {
  await mockTauriInvoke(page); await mockSharedProduct(page);
  await page.addInitScript(() => {
    const w = window as any, s = w.__copicuSharedSnapshot, previous = w.__copicuSharedTestInvoke;
    s.identityState = "active";
    Object.assign(s.channels[0], { name: "notebook", receiveEnabled: true, saveToFolder: true, receiveFolderId: 7, publishFolderEnabled: true, publishFolderId: 7 });
    s.connections = [{ id: "folder_7", channelId: "synthetic-channel", kind: "folder", folderId: 7, direction: "both" }];
    s.receipts = [{ ...s.receipts[1], originDeviceId: "synthetic-notebook", historyResult: { outcome: "existing", folderId: 7, folderName: "Projects", receivedAtUnixMs: 1791130000000 } }];
    w.__copicuSharedTestInvoke = async (cmd: string, args: any) => cmd === "shared_clipboard_identity"
      ? { state: "active", name: "Synthetic PC", deviceId: "synthetic-pc", keyCustody: "service", devices: [{ deviceId: "synthetic-pc", name: "Synthetic PC", state: "active" }, { deviceId: "synthetic-notebook", name: "Synthetic Notebook", state: "active" }] }
      : previous(cmd, args);
  });
  await gotoShell(page, "/?window=settings"); await page.getByRole("tab", { name: /^Sharing/ }).click();
  const sharing = page.locator(".shared-clipboard-settings");
  await expect(sharing.getByRole("heading", { name: "Account and this PC", exact: true })).toBeVisible();
  await expect(sharing.getByRole("list", { name: "Shared connections" })).toContainText("/Projects");
  await expect(sharing.getByRole("list", { name: "Shared connections" })).toContainText("notebook");
  await expect(sharing.getByRole("list", { name: "Shared connections" })).toContainText("Send and receive");
  await expect(sharing.getByRole("list", { name: "Received publications" })).toContainText("From Synthetic Notebook");
  await expect(sharing.getByRole("list", { name: "Received publications" })).toContainText("Received again in Projects");
  await expect(sharing.locator(".shared-settings-advanced")).not.toHaveAttribute("open");
  expect(await sharing.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
  await page.locator(".settings-list").evaluate(node => { node.scrollTop = 0; });
  await page.screenshot({ path: `.codex-run/sharing-overview-${testInfo.project.name}.png` });
});

test("shared product keyboard resource changes require a fresh reception move confirmation", async ({ page }) => {
  await mockTauriInvoke(page); await mockSharedProduct(page);
  await page.addInitScript(() => {
    (window as any).__copicuSharedSnapshot.connections = [
      { id: "folder_7", channelId: "synthetic-channel", kind: "folder", folderId: 7, direction: "receive" },
      { id: "folder_8", channelId: "synthetic-reader", kind: "folder", folderId: 8, direction: "receive" },
    ];
  });
  await gotoShell(page); await waitForDefaultHistoryReady(page);
  await page.getByRole("button", { name: "Connect shared clipboard", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "Connect shared clipboard", exact: true });
  await editor.getByRole("option", { name: /Synthetic clipboard/ }).click();
  await editor.getByRole("checkbox", { name: /Move automatic reception/ }).check();
  await expect(editor.getByRole("button", { name: "Connect clipboard", exact: true })).toBeEnabled();
  await editor.getByRole("option", { name: /Synthetic clipboard/ }).focus();
  await page.keyboard.press("ArrowDown");
  await expect(editor.getByRole("option", { name: /Shared research/ })).toBeFocused();
  await expect(editor.getByRole("checkbox", { name: /Move automatic reception/ })).not.toBeChecked();
  await expect(editor.getByRole("button", { name: "Connect clipboard", exact: true })).toBeDisabled();
  await expect(editor.getByLabel("Direction", { exact: true })).toHaveValue("Receive");
  expect(await page.evaluate(() => (window as any).__copicuSharedSnapshot.connections)).toHaveLength(2);
});
