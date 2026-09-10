import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createPickerSearchState,
  pickerSearchReducer,
} from "../src/shared/searchSnapshot.ts";


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
    nextCursor: { afterIsInbox: false, afterInboxAtUnixMs: null, afterSortUnixMs: 100, afterId: 1 },
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

test("the initial snapshot can settle behind a held draft without replacing it", () => {
  const initial = createPickerSearchState("");
  const applying = pickerSearchReducer(initial, {
    type: "applyStarted",
    generation: 0,
    intentGeneration: 0,
    query: "",
  });
  const heldDraft = pickerSearchReducer(applying, {
    type: "draftChanged",
    query: "kind:",
    status: "held",
  });
  const initialSnapshot = pickerSearchReducer(heldDraft, {
    type: "applySucceeded",
    generation: 1,
    intentGeneration: 0,
    descriptor: {
      ...descriptor,
      displayQuery: "",
      effectiveQuery: "",
      mode: "structured",
      fingerprint: "fingerprint-initial",
    },
    page: page([{ id: 10 }, { id: 11 }]),
    allowStaleInitial: true,
  });

  assert.notEqual(initialSnapshot.applied, null);
  assert.deepEqual(initialSnapshot.applied.items, [{ id: 10 }, { id: 11 }]);
  assert.equal(initialSnapshot.draftQuery, "kind:");
  assert.equal(initialSnapshot.filterStatus, "held");
  assert.equal(initialSnapshot.intentGeneration, heldDraft.intentGeneration);
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
    items: [{ id: 1, title: "Updated metadata", tags: "#work/project" }],
    source: "background",
  });

  assert.equal(retained.filterStatus, "held");
  assert.equal(retained.draftQuery, "tag:");
  assert.equal(retained.generation, 1);
  assert.deepEqual(retained.applied.items, [{ id: 1, title: "Updated metadata", tags: "#work/project" }]);
  assert.deepEqual(retained.applied.nextCursor, applied.applied.nextCursor);
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

test("retained foreground refresh advances its generation and rejects stale metadata", () => {
  const started = pickerSearchReducer(createPickerSearchState(), {
    type: "applyStarted", generation: 1, query: descriptor.displayQuery,
  });
  const applied = pickerSearchReducer(started, {
    type: "applySucceeded", generation: 1, descriptor, page: page([{ id: 2 }, { id: 1 }]),
  });
  const refreshing = pickerSearchReducer(applied, {
    type: "applyStarted", generation: 2, query: descriptor.displayQuery,
  });
  const retained = pickerSearchReducer(refreshing, {
    type: "applyRetained", generation: 2, intentGeneration: 2, descriptor,
    items: [{ id: 2, tags: "#updated" }, { id: 1, title: "Fresh" }],
  });
  assert.equal(retained.generation, 2);
  assert.equal(retained.filterStatus, "idle");
  assert.deepEqual(retained.applied.items, [{ id: 2, tags: "#updated" }, { id: 1, title: "Fresh" }]);
  assert.deepEqual(retained.applied.nextCursor, applied.applied.nextCursor);
  assert.equal(pickerSearchReducer(retained, {
    type: "applyRetained", generation: 1, source: "background", descriptor, items: [{ id: 2, tags: "#stale" }],
  }), retained);
});
