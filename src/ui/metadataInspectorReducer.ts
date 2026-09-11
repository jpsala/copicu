import type {
  MetadataNotesIntent,
  MetadataScalarIntent,
  MetadataSelectionIntent,
  MetadataSelectionPayload,
  MetadataSelectionSnapshot,
  MetadataSetValueAggregate,
  MetadataSetValueIntent,
} from "../shared/contracts";


export type MetadataInspectorSaveState = "idle" | "saving" | "stale" | "error" | "saved";

export type MetadataInspectorState = {
  baseSnapshot: MetadataSelectionSnapshot;
  selection: number[];
  focusTarget: MetadataSelectionPayload["focusTarget"];
  title: MetadataScalarIntent;
  notes: MetadataNotesIntent;
  tags: MetadataSetValueIntent[];
  dirty: boolean;
  pendingNoticeHidden: boolean;
  summary: string;
  pendingPayload: MetadataSelectionPayload | null;
  conflictingPayload: MetadataSelectionPayload | null;
  saveState: MetadataInspectorSaveState;
  error: string | null;
  undoStack: MetadataInspectorIntentSnapshot[];
};

type MetadataInspectorIntentSnapshot = Pick<MetadataInspectorState, "title" | "notes" | "tags">;

export type MetadataInspectorAction =
  | { type: "receivePayload"; payload: MetadataSelectionPayload }
  | { type: "replacePayload"; payload: MetadataSelectionPayload }
  | { type: "stageTitle"; intent: MetadataScalarIntent }
  | { type: "stageNotes"; intent: MetadataNotesIntent }
  | { type: "stageSetValue"; field: "tags"; intent: MetadataSetValueIntent }
  | { type: "undoLast" }
  | { type: "saveStarted" }
  | { type: "saveSucceeded"; snapshot: MetadataSelectionSnapshot }
  | { type: "saveFailed"; error: string }
  | { type: "keepEditing" }
  | { type: "clearError" };

const untouchedTitle: MetadataScalarIntent = { op: "untouched" };
const untouchedNotes: MetadataNotesIntent = { op: "untouched" };


function normalizedSetIntents(intents: MetadataSetValueIntent[]) {
  return intents
    .filter((intent) => intent.op !== "untouched")
    .sort((left, right) => left.key.localeCompare(right.key));
}

function intentSnapshot(state: MetadataInspectorState): MetadataInspectorIntentSnapshot {
  return {
    title: state.title,
    notes: state.notes,
    tags: state.tags,
  };
}

function setValueIntent(
  intents: MetadataSetValueIntent[],
  nextIntent: MetadataSetValueIntent,
): MetadataSetValueIntent[] {
  const key = metadataValueKey(nextIntent.key);
  const next = intents.filter((intent) => metadataValueKey(intent.key) !== key);
  if (nextIntent.op !== "untouched") next.push(nextIntent);
  return normalizedSetIntents(next);
}

function sameSelection(left: number[], right: number[]) {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

function withDerivedState(state: MetadataInspectorState): MetadataInspectorState {
  const dirty = state.title.op !== "untouched"
    || state.notes.op !== "untouched"
    || state.tags.length > 0;
  return { ...state, dirty, summary: metadataChangeSummary(state) };
}

export function createMetadataInspectorState(payload: MetadataSelectionPayload): MetadataInspectorState {
  return {
    baseSnapshot: payload.snapshot,
    selection: [...payload.snapshot.itemIds],
    focusTarget: payload.focusTarget,
    title: untouchedTitle,
    notes: untouchedNotes,
    tags: [],
    dirty: false,
    summary: "No changes",
    pendingPayload: null,
    conflictingPayload: null,
    saveState: "idle",
    error: null,
    undoStack: [],
    pendingNoticeHidden: false,
  };
}

function stage(
  state: MetadataInspectorState,
  update: Partial<MetadataInspectorIntentSnapshot>,
): MetadataInspectorState {
  return withDerivedState({
    ...state,
    ...update,
    saveState: "idle",
    error: null,
    undoStack: [...state.undoStack, intentSnapshot(state)],
  });
}

export function metadataInspectorReducer(
  state: MetadataInspectorState,
  action: MetadataInspectorAction,
): MetadataInspectorState {
  switch (action.type) {
    case "replacePayload":
      return createMetadataInspectorState(action.payload);
    case "receivePayload": {
      if (!state.dirty) return createMetadataInspectorState(action.payload);
      if (sameSelection(state.selection, action.payload.snapshot.itemIds)) {
        if (state.baseSnapshot.snapshotToken === action.payload.snapshot.snapshotToken) return state;
        return {
          ...state,
          conflictingPayload: action.payload,
          saveState: "stale",
          error: "Metadata changed since this inspector opened",
        };
      }
      return {
        ...state,
        pendingNoticeHidden: false,
        pendingPayload: action.payload,
        error: "Another metadata request is waiting",
      };
    }
    case "stageTitle":
      return stage(state, { title: action.intent });
    case "stageNotes":
      return stage(state, { notes: action.intent });
    case "stageSetValue":
      return stage(state, { tags: setValueIntent(state.tags, action.intent) });
    case "undoLast": {
      const previous = state.undoStack.at(-1);
      if (!previous) return state;
      return withDerivedState({
        ...state,
        ...previous,
        undoStack: state.undoStack.slice(0, -1),
        saveState: "idle",
        error: null,
      });
    }
    case "saveStarted":
      return { ...state, saveState: "saving", error: null };
    case "saveSucceeded": {
      const pendingPayload = state.pendingPayload;
      return pendingPayload
        ? createMetadataInspectorState(pendingPayload)
        : { ...createMetadataInspectorState({ snapshot: action.snapshot, focusTarget: state.focusTarget }), saveState: "saved" };
    }
    case "saveFailed": {
      const stale = action.error.includes("METADATA_SNAPSHOT_STALE");
      return {
        ...state,
        saveState: stale ? "stale" : "error",
        error: stale ? "Metadata changed since this inspector opened" : action.error,
      };
    }
    case "keepEditing":
      return {
        ...state,
        conflictingPayload: null,
        error: null,
        pendingNoticeHidden: true,
        saveState: state.saveState === "stale" ? "idle" : state.saveState,
      };
    case "clearError":
      return { ...state, error: null, saveState: state.saveState === "error" ? "idle" : state.saveState };
  }
}

export function metadataSelectionIntent(state: MetadataInspectorState): MetadataSelectionIntent {
  return {
    itemIds: [...state.selection],
    expectedSnapshotToken: state.baseSnapshot.snapshotToken,
    title: state.title,
    notes: state.notes,
    tags: state.tags,
  };
}

export function metadataValueKey(value: string) {
  return value.trim().toLocaleLowerCase();
}

function aggregateFor(
  snapshot: MetadataSelectionSnapshot,
  key: string,
): MetadataSetValueAggregate | undefined {
  const normalized = metadataValueKey(key);
  return snapshot.tags.find((entry) => metadataValueKey(entry.key) === normalized);
}

function clipCount(count: number) {
  return `${count} ${count === 1 ? "clip" : "clips"}`;
}

function setSummary(
  snapshot: MetadataSelectionSnapshot,
  intent: MetadataSetValueIntent,
) {
  const aggregate = aggregateFor(snapshot, intent.key);
  const label = aggregate?.label ?? intent.key;
  const value = `#${label.replace(/^#/, "")}`;
  const count = intent.op === "add"
    ? snapshot.itemCount - (aggregate?.presentCount ?? 0)
    : aggregate?.presentCount ?? 0;
  return `${intent.op === "add" ? "Add" : "Remove"} ${value} ${intent.op === "add" ? "to" : "from"} ${clipCount(count)}`;
}

export function metadataChangeSummary(state: Pick<
  MetadataInspectorState,
  "baseSnapshot" | "title" | "notes" | "tags"
>): string {
  const changes: string[] = [];
  const { baseSnapshot: snapshot } = state;
  if (state.title.op === "set") changes.push(`Set title on ${clipCount(snapshot.itemCount)}`);
  if (state.title.op === "clear") changes.push(`Clear titles on ${clipCount(snapshot.title.populatedCount)}`);
  if (state.notes.op === "appendToEach") changes.push(`Append notes to ${clipCount(snapshot.itemCount)}`);
  if (state.notes.op === "replaceAll") changes.push(`Replace notes on ${clipCount(snapshot.itemCount)}`);
  if (state.notes.op === "clearAll") changes.push(`Clear notes on ${clipCount(snapshot.notes.populatedCount)}`);
  for (const intent of state.tags) changes.push(setSummary(snapshot, intent));
  return changes.length > 0 ? changes.join(" · ") : "No changes";
}
