export type AppliedSearchMode = "structured" | "ai";

/**
 * The Rust search planner owns the plan shape. Keeping it opaque here makes
 * the snapshot serializable without duplicating the compiler contract in the
 * renderer.
 */
export type SearchPlanV1 = Record<string, unknown>;

export type AppliedSearchDescriptor = {
  schemaVersion: 1;
  displayQuery: string;
  effectiveQuery: string;
  mode: AppliedSearchMode;
  plan: SearchPlanV1;
  fingerprint: string;
};

export type AppliedSearchPage<Item, Cursor = unknown> = {
  items: Item[];
  nextCursor: Cursor | null;
  totalCount?: number | null;
  filteredCount?: number | null;
  explanation?: string | null;
  queryExplanation?: unknown | null;
  warnings?: string[];
};

export type AppliedSearchSnapshot<Item, Cursor = unknown> = {
  descriptor: AppliedSearchDescriptor;
  items: Item[];
  nextCursor: Cursor | null;
  totalCount: number | null;
  filteredCount: number | null;
  explanation: string | null;
  queryExplanation: unknown | null;
  warnings: string[];
  generation: number;
};

export type PickerSearchFilterStatus = "idle" | "held" | "applying" | "error";

export type PickerSearchState<Item, Cursor = unknown> = {
  draftQuery: string;
  applied: AppliedSearchSnapshot<Item, Cursor> | null;
  filterStatus: PickerSearchFilterStatus;
  generation: number;
  error: string | null;
};

export type PickerSearchAction<Item, Cursor = unknown> =
  | { type: "draftChanged"; query: string; status: "idle" | "held" | "applying" }
  | { type: "applyStarted"; generation: number; query: string }
  | {
      type: "applySucceeded";
      generation: number;
      descriptor: AppliedSearchDescriptor;
      page: AppliedSearchPage<Item, Cursor>;
    }
  | { type: "applyFailed"; generation: number; error: string }
  | {
      type: "pageAppended";
      generation: number;
      page: AppliedSearchPage<Item, Cursor>;
    }
  | { type: "pageFailed"; generation: number; error: string }
  | { type: "clearError" };

export function createPickerSearchState<Item, Cursor = unknown>(
  draftQuery = "",
): PickerSearchState<Item, Cursor> {
  return {
    draftQuery,
    applied: null,
    filterStatus: "idle",
    generation: 0,
    error: null,
  };
}

function isNewerGeneration(current: number, incoming: number) {
  return incoming >= current;
}

function snapshotFromPage<Item, Cursor>(
  descriptor: AppliedSearchDescriptor,
  page: AppliedSearchPage<Item, Cursor>,
  generation: number,
): AppliedSearchSnapshot<Item, Cursor> {
  return {
    descriptor,
    items: page.items,
    nextCursor: page.nextCursor,
    totalCount: page.totalCount ?? null,
    filteredCount: page.filteredCount ?? null,
    explanation: page.explanation ?? null,
    queryExplanation: page.queryExplanation ?? null,
    warnings: page.warnings ?? [],
    generation,
  };
}

export function pickerSearchReducer<Item, Cursor = unknown>(
  state: PickerSearchState<Item, Cursor>,
  action: PickerSearchAction<Item, Cursor>,
): PickerSearchState<Item, Cursor> {
  switch (action.type) {
    case "draftChanged":
      return {
        ...state,
        draftQuery: action.query,
        filterStatus: action.status,
        error: null,
      };
    case "applyStarted":
      if (!isNewerGeneration(state.generation, action.generation)) {
        return state;
      }
      return {
        ...state,
        draftQuery: action.query,
        generation: action.generation,
        filterStatus: "applying",
        error: null,
      };
    case "applySucceeded":
      if (action.generation !== state.generation) {
        return state;
      }
      return {
        ...state,
        applied: snapshotFromPage(action.descriptor, action.page, action.generation),
        draftQuery: action.descriptor.displayQuery,
        filterStatus: "idle",
        error: null,
      };
    case "applyFailed":
      if (action.generation !== state.generation) {
        return state;
      }
      return {
        ...state,
        filterStatus: "error",
        error: action.error,
      };
    case "pageAppended":
      if (
        !state.applied
        || action.generation !== state.generation
        || action.generation !== state.applied.generation
      ) {
        return state;
      }
      {
        const existingIds = new Set(
          state.applied.items
            .map((item) => (item && typeof item === "object" && "id" in item ? item.id : item)),
        );
        const appended = action.page.items.filter((item) => {
          const id = item && typeof item === "object" && "id" in item ? item.id : item;
          if (existingIds.has(id)) {
            return false;
          }
          existingIds.add(id);
          return true;
        });
        return {
          ...state,
          applied: {
            ...state.applied,
            items: [...state.applied.items, ...appended],
            nextCursor: action.page.nextCursor,
            totalCount: action.page.totalCount ?? state.applied.totalCount,
            filteredCount: action.page.filteredCount ?? state.applied.filteredCount,
            explanation: action.page.explanation ?? state.applied.explanation,
            queryExplanation: action.page.queryExplanation ?? state.applied.queryExplanation,
            warnings: action.page.warnings ?? state.applied.warnings,
          },
          filterStatus: "idle",
          error: null,
        };
      }
    case "pageFailed":
      if (
        !state.applied
        || action.generation !== state.generation
        || action.generation !== state.applied.generation
      ) {
        return state;
      }
      return {
        ...state,
        filterStatus: "error",
        error: action.error,
      };
    case "clearError":
      return state.error === null ? state : { ...state, error: null };
  }
}

export function isAppliedSearchDescriptor(value: unknown): value is AppliedSearchDescriptor {
  if (!value || typeof value !== "object") {
    return false;
  }
  const descriptor = value as Partial<AppliedSearchDescriptor>;
  return descriptor.schemaVersion === 1
    && typeof descriptor.displayQuery === "string"
    && typeof descriptor.effectiveQuery === "string"
    && (descriptor.mode === "structured" || descriptor.mode === "ai")
    && !!descriptor.plan
    && typeof descriptor.plan === "object"
    && typeof descriptor.fingerprint === "string"
    && descriptor.fingerprint.length > 0;
}
