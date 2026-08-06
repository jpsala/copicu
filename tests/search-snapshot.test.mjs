import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  appliedQueryMutationFields,
  appliedSearchRequestFields,
  createPickerSearchState,
  pickerSearchReducer,
} from "../src/shared/searchSnapshot.ts";

const mainSource = readFileSync(
  fileURLToPath(new URL("../src/main.tsx", import.meta.url)),
  "utf8",
);

const descriptor = {
  schemaVersion: 1,
  displayQuery: "ai:find client invoices",
  effectiveQuery: "tag:client title:invoice",
  mode: "ai",
  plan: {
    schemaVersion: 1,
    filters: { tags: ["client"], title: ["invoice"] },
  },
  fingerprint: "fingerprint-ai",
};

const otherDescriptor = {
  ...descriptor,
  displayQuery: "tag:private",
  effectiveQuery: "tag:private",
  mode: "structured",
  fingerprint: "fingerprint-other",
};

function page(items = [{ id: 1 }], overrides = {}) {
  return {
    items,
    nextCursor: { afterId: 1 },
    totalCount: 3,
    filteredCount: 1,
    ...overrides,
  };
}

test("draft changes supersede an in-flight first page, including held drafts", () => {
  const initial = createPickerSearchState("");
  const applying = pickerSearchReducer(initial, {
    type: "applyStarted",
    generation: 1,
    query: "a",
  });
  const heldDraft = pickerSearchReducer(applying, {
    type: "draftChanged",
    query: "ab",
    status: "held",
  });
  const staleSuccess = pickerSearchReducer(heldDraft, {
    type: "applySucceeded",
    generation: 1,
    descriptor,
    page: page(),
  });

  assert.equal(heldDraft.draftQuery, "ab");
  assert.equal(heldDraft.filterStatus, "held");
  assert.equal(heldDraft.intentGeneration, 2);
  assert.equal(heldDraft.generation, 0);
  assert.equal(staleSuccess, heldDraft);
  assert.equal(staleSuccess.applied, null);
});

test("an applied page remains pageable while a newer draft is held", () => {
  const applied = pickerSearchReducer(
    pickerSearchReducer(createPickerSearchState(""), {
      type: "applyStarted",
      generation: 1,
      query: descriptor.displayQuery,
    }),
    {
      type: "applySucceeded",
      generation: 1,
      descriptor,
      page: page(),
    },
  );
  const heldDraft = pickerSearchReducer(applied, {
    type: "draftChanged",
    query: "tag:",
    status: "held",
  });
  const appended = pickerSearchReducer(heldDraft, {
    type: "pageAppended",
    generation: 1,
    descriptor,
    page: page([{ id: 2 }], { nextCursor: null }),
  });

  assert.equal(heldDraft.intentGeneration, 2);
  assert.equal(heldDraft.generation, 1);
  assert.deepEqual(appended.applied.items, [{ id: 1 }, { id: 2 }]);
  assert.equal(appended.draftQuery, "tag:");
  assert.equal(appended.filterStatus, "held");
});

test("background refresh of the applied snapshot preserves a held draft", () => {
  const applied = pickerSearchReducer(
    pickerSearchReducer(createPickerSearchState(""), {
      type: "applyStarted",
      generation: 1,
      query: descriptor.displayQuery,
    }),
    {
      type: "applySucceeded",
      generation: 1,
      descriptor,
      page: page([], {
        explanation: "AI explanation",
        queryExplanation: { version: 1, chips: [{ label: "client" }], diagnostics: [] },
        warnings: ["AI warning"],
      }),
    },
  );
  const heldDraft = pickerSearchReducer(applied, {
    type: "draftChanged",
    query: "kind:",
    status: "held",
  });
  const refreshStarted = pickerSearchReducer(heldDraft, {
    type: "applyStarted",
    generation: 1,
    source: "background",
    intentGeneration: 2,
    descriptor,
    query: descriptor.displayQuery,
  });
  const refreshedDescriptor = {
    ...descriptor,
    displayQuery: descriptor.effectiveQuery,
  };
  const refreshed = pickerSearchReducer(refreshStarted, {
    type: "applySucceeded",
    generation: 1,
    source: "background",
    intentGeneration: 2,
    descriptor: refreshedDescriptor,
    page: page([{ id: 3 }], {
      totalCount: 5,
      filteredCount: 2,
      explanation: "replacement explanation",
      queryExplanation: { version: 1, chips: [], diagnostics: [] },
      warnings: ["replacement warning"],
    }),
  });

  assert.equal(refreshStarted, heldDraft);
  assert.equal(refreshed.draftQuery, "kind:");
  assert.equal(refreshed.filterStatus, "held");
  assert.equal(refreshed.intentGeneration, 2);
  assert.equal(refreshed.generation, 1);
  assert.deepEqual(refreshed.applied.items, [{ id: 3 }]);
  assert.equal(refreshed.applied.totalCount, 5);
  assert.equal(refreshed.applied.descriptor.displayQuery, descriptor.displayQuery);
  assert.equal(refreshed.applied.descriptor.mode, "ai");
  assert.equal(refreshed.applied.explanation, "AI explanation");
  assert.deepEqual(refreshed.applied.queryExplanation, {
    version: 1,
    chips: [{ label: "client" }],
    diagnostics: [],
  });
  assert.deepEqual(refreshed.applied.warnings, ["AI warning"]);
});

test("foreground response for intent 1 remains rejected after intent 2", () => {
  const firstStarted = pickerSearchReducer(createPickerSearchState(""), {
    type: "applyStarted",
    generation: 1,
    intentGeneration: 1,
    query: "old",
  });
  const intentTwo = pickerSearchReducer(firstStarted, {
    type: "draftChanged",
    generation: 2,
    query: "new",
    status: "applying",
  });
  const staleResponse = pickerSearchReducer(intentTwo, {
    type: "applySucceeded",
    generation: 1,
    intentGeneration: 1,
    source: "foreground",
    descriptor,
    page: page([{ id: 99 }]),
  });

  assert.equal(staleResponse, intentTwo);
  assert.equal(staleResponse.draftQuery, "new");
  assert.equal(staleResponse.applied, null);
  assert.equal(staleResponse.filterStatus, "applying");
});

test("a first page without a valid descriptor cannot partially commit", () => {
  const initial = createPickerSearchState("a");
  const applying = pickerSearchReducer(initial, {
    type: "applyStarted",
    generation: 1,
    query: "a",
  });
  const invalid = pickerSearchReducer(applying, {
    type: "applySucceeded",
    generation: 1,
    descriptor: {},
    page: page([{ id: 99 }]),
  });

  assert.equal(invalid, applying);
  assert.equal(invalid.applied, null);
  assert.equal(invalid.filterStatus, "applying");
});

test("descriptor failure preserves the complete previously applied snapshot", () => {
  const initial = createPickerSearchState("");
  const applied = pickerSearchReducer(
    pickerSearchReducer(initial, {
      type: "applyStarted",
      generation: 1,
      query: descriptor.displayQuery,
    }),
    {
      type: "applySucceeded",
      generation: 1,
      descriptor,
      page: page(),
    },
  );
  const refreshing = pickerSearchReducer(applied, {
    type: "applyStarted",
    generation: 2,
    query: "tag:private",
  });
  const failed = pickerSearchReducer(refreshing, {
    type: "applyFailed",
    generation: 2,
    error: "missing descriptor",
  });

  assert.equal(failed.filterStatus, "error");
  assert.deepEqual(failed.applied, applied.applied);
});

test("manual-scroll refresh settles the generation while retaining the snapshot", () => {
  const initial = createPickerSearchState("");
  const applied = pickerSearchReducer(
    pickerSearchReducer(initial, {
      type: "applyStarted",
      generation: 1,
      query: descriptor.displayQuery,
    }),
    {
      type: "applySucceeded",
      generation: 1,
      descriptor,
      page: page(),
    },
  );
  const refreshing = pickerSearchReducer(applied, {
    type: "draftChanged",
    query: "tag:",
    status: "held",
  });
  const refreshStarted = pickerSearchReducer(refreshing, {
    type: "applyStarted",
    generation: 1,
    source: "background",
    descriptor,
    query: descriptor.displayQuery,
  });
  const retained = pickerSearchReducer(refreshStarted, {
    type: "applyRetained",
    generation: 1,
    descriptor,
    page: { nextCursor: { afterId: 2 }, totalCount: 4, filteredCount: 2 },
    source: "background",
  });

  assert.equal(retained.filterStatus, "held");
  assert.equal(retained.draftQuery, "tag:");
  assert.equal(retained.generation, 1);
  assert.deepEqual(retained.applied.items, [{ id: 1 }]);
  assert.deepEqual(retained.applied.nextCursor, { afterId: 1 });
  assert.equal(retained.applied.totalCount, 4);
  assert.equal(retained.applied.filteredCount, 2);
});

test("pagination rejects a response from another applied descriptor", () => {
  const initial = createPickerSearchState("");
  const applied = pickerSearchReducer(
    pickerSearchReducer(initial, {
      type: "applyStarted",
      generation: 1,
      query: descriptor.displayQuery,
    }),
    {
      type: "applySucceeded",
      generation: 1,
      descriptor,
      page: page(),
    },
  );
  const rejected = pickerSearchReducer(applied, {
    type: "pageAppended",
    generation: 1,
    descriptor: otherDescriptor,
    page: page([{ id: 2 }]),
  });

  assert.equal(rejected, applied);
});

test("AI refresh and mark-all wiring keep display identity and canonical plan", () => {
  assert.deepEqual(appliedSearchRequestFields(descriptor), {
    query: "tag:client title:invoice",
    displayQuery: "ai:find client invoices",
    mode: "ai",
    plan: descriptor.plan,
    appliedDescriptor: descriptor,
  });
  assert.deepEqual(appliedQueryMutationFields(descriptor, true), {
    query: "tag:client title:invoice",
    marked: true,
    appliedDescriptor: descriptor,
  });
});

test("real pagination/background callers use applied identity, not draft intent", () => {
  assert.match(mainSource, /const appliedSnapshotGenerationRef = useRef\(0\)/);
  assert.match(mainSource, /const firstPageGeneration = appliedSnapshot\.generation/);
  assert.match(mainSource, /firstPageGeneration !== searchState\.applied\?\.generation/);
  assert.doesNotMatch(
    mainSource,
    /searchState\.generation !== historyRequestSeqRef\.current/,
  );
  assert.match(mainSource, /type: "applyStarted",[\s\S]{0,180}source,[\s\S]{0,180}descriptor: appliedDescriptorForRequest/);
  assert.match(mainSource, /if \(foreground\) \{[\s\S]*?setHistoryInputQuery\(visibleDisplayQuery\)/);
  assert.match(mainSource, /if \(showPending && foreground\) \{\s*setHistoryPending\(true\)/);
});
