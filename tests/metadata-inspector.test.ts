import { describe, expect, test } from "bun:test";
import type { MetadataSelectionPayload, MetadataSelectionSnapshot } from "../src/shared/contracts";
import {
  createMetadataInspectorState,
  metadataInspectorReducer,
  metadataSelectionIntent,
} from "../src/ui/metadataInspectorReducer";

function snapshot(token = "snapshot-1", itemIds = [11, 12, 13]): MetadataSelectionSnapshot {
  return {
    itemIds,
    itemCount: itemIds.length,
    snapshotToken: token,
    title: { state: "mixed", value: null, populatedCount: 2 },
    notes: { state: "mixed", value: null, populatedCount: 2 },
    tags: [
      { key: "work", label: "Work", presence: "all", presentCount: 3, totalCount: 3, sources: [{ source: "manual", count: 3, confidenceMin: null, confidenceMax: null }] },
      { key: "review", label: "Review", presence: "some", presentCount: 2, totalCount: 3, sources: [{ source: "scenario", count: 2, confidenceMin: 0.8, confidenceMax: 0.9 }] },
      { key: "later", label: "Later", presence: "none", presentCount: 0, totalCount: 3, sources: [] },
    ],
    properties: { client: [], project: [], activity: [] },
    singleItem: null,
  };
}

function payload(token = "snapshot-1", itemIds = [11, 12, 13]): MetadataSelectionPayload {
  return { snapshot: snapshot(token, itemIds), focusTarget: "overview" };
}

describe("metadata inspector reducer", () => {
  test("stages all/some/none set operations with exact affected counts", () => {
    let state = createMetadataInspectorState(payload());
    state = metadataInspectorReducer(state, { type: "stageSetValue", field: "tags", intent: { key: "work", op: "remove" } });
    state = metadataInspectorReducer(state, { type: "stageSetValue", field: "tags", intent: { key: "review", op: "add" } });
    state = metadataInspectorReducer(state, { type: "stageSetValue", field: "tags", intent: { key: "later", op: "add" } });

    expect(state.dirty).toBe(true);
    expect(state.summary).toBe("Add #Later to 3 clips · Add #Review to 1 clip · Remove #Work from 3 clips");
    expect(metadataSelectionIntent(state)).toMatchObject({
      itemIds: [11, 12, 13],
      expectedSnapshotToken: "snapshot-1",
      tags: [
        { key: "later", op: "add" },
        { key: "review", op: "add" },
        { key: "work", op: "remove" },
      ],
    });
  });

  test("undo restores the prior staged intent without mutating the frozen selection", () => {
    const initial = createMetadataInspectorState(payload());
    const titled = metadataInspectorReducer(initial, { type: "stageTitle", intent: { op: "set", value: "Shared title" } });
    const noted = metadataInspectorReducer(titled, { type: "stageNotes", intent: { op: "appendToEach", value: "Review" } });
    const undone = metadataInspectorReducer(noted, { type: "undoLast" });

    expect(undone.selection).toEqual([11, 12, 13]);
    expect(undone.title).toEqual({ op: "set", value: "Shared title" });
    expect(undone.notes).toEqual({ op: "untouched" });
    expect(undone.summary).toBe("Set title on 3 clips");
  });

  test("keeps a new selection pending while dirty and opens it after a successful save", () => {
    const dirty = metadataInspectorReducer(createMetadataInspectorState(payload()), {
      type: "stageNotes",
      intent: { op: "appendToEach", value: "New note" },
    });
    const queued = metadataInspectorReducer(dirty, { type: "receivePayload", payload: payload("snapshot-2", [22]) });

    expect(queued.selection).toEqual([11, 12, 13]);
    expect(queued.pendingPayload?.snapshot.itemIds).toEqual([22]);

    const opened = metadataInspectorReducer(queued, { type: "saveSucceeded", snapshot: snapshot("saved") });
    expect(opened.selection).toEqual([22]);
    expect(opened.dirty).toBe(false);
  });

  test("detects same-selection snapshot conflicts and supports reload or keep editing", () => {
    const dirty = metadataInspectorReducer(createMetadataInspectorState(payload()), {
      type: "stageTitle",
      intent: { op: "clear" },
    });
    const stale = metadataInspectorReducer(dirty, { type: "receivePayload", payload: payload("snapshot-2") });
    expect(stale.saveState).toBe("stale");
    expect(stale.conflictingPayload?.snapshot.snapshotToken).toBe("snapshot-2");

    const kept = metadataInspectorReducer(stale, { type: "keepEditing" });
    expect(kept.saveState).toBe("idle");
    expect(kept.title).toEqual({ op: "clear" });

    const reloaded = metadataInspectorReducer(stale, { type: "replacePayload", payload: stale.conflictingPayload! });
    expect(reloaded.baseSnapshot.snapshotToken).toBe("snapshot-2");
    expect(reloaded.dirty).toBe(false);
  });

  test("maps stale apply errors to the conflict state", () => {
    const dirty = metadataInspectorReducer(createMetadataInspectorState(payload()), {
      type: "stageTitle",
      intent: { op: "set", value: "Changed" },
    });
    const failed = metadataInspectorReducer(dirty, {
      type: "saveFailed",
      error: "METADATA_SNAPSHOT_STALE: selection changed",
    });
    expect(failed.saveState).toBe("stale");
    expect(failed.error).toBe("Metadata changed since this inspector opened");
  });
});
