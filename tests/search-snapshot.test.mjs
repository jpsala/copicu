import assert from "node:assert/strict";
import { test } from "node:test";
import {
  appliedQueryMutationFields,
  appliedSearchRequestFields,
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
  assert.equal(heldDraft.generation, 2);
  assert.equal(staleSuccess, heldDraft);
  assert.equal(staleSuccess.applied, null);
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
    type: "applyStarted",
    generation: 2,
    query: descriptor.displayQuery,
  });
  const retained = pickerSearchReducer(refreshing, {
    type: "applyRetained",
    generation: 2,
    descriptor,
    page: { totalCount: 4, filteredCount: 2 },
  });

  assert.equal(retained.filterStatus, "idle");
  assert.equal(retained.generation, 2);
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
