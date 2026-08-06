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
  appliedDescriptor?: AppliedSearchDescriptor | null;
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
  /** Generation/token of the latest draft intent. Draft edits advance this. */
  intentGeneration: number;
  /** Generation of the visible applied snapshot. Draft edits do not advance this. */
  generation: number;
  error: string | null;
};

export type PickerSearchApplySource = "foreground" | "background";

export type PickerSearchAction<Item, Cursor = unknown> =
  | {
      type: "draftChanged";
      query: string;
      status: "idle" | "held" | "applying";
      generation?: number;
    }
  | {
      type: "applyStarted";
      generation: number;
      query: string;
      source?: PickerSearchApplySource;
      intentGeneration?: number;
      descriptor?: AppliedSearchDescriptor | null;
    }
  | {
      type: "applySucceeded";
      generation: number;
      descriptor: AppliedSearchDescriptor;
      page: AppliedSearchPage<Item, Cursor>;
      source?: PickerSearchApplySource;
      intentGeneration?: number;
    }
  | {
      type: "applyFailed";
      generation: number;
      error: string;
      source?: PickerSearchApplySource;
      intentGeneration?: number;
    }
  | {
      type: "pageAppended";
      generation: number;
      descriptor: AppliedSearchDescriptor;
      page: AppliedSearchPage<Item, Cursor>;
      source?: PickerSearchApplySource;
    }
  | {
      type: "applyRetained";
      generation: number;
      descriptor: AppliedSearchDescriptor;
      page?: Pick<AppliedSearchPage<Item, Cursor>, "totalCount" | "filteredCount">;
      source?: PickerSearchApplySource;
    }
  | { type: "pageFailed"; generation: number; error: string; source?: PickerSearchApplySource }
  | { type: "clearError" };

export function createPickerSearchState<Item, Cursor = unknown>(
  draftQuery = "",
): PickerSearchState<Item, Cursor> {
  return {
    draftQuery,
    applied: null,
    filterStatus: "idle",
    intentGeneration: 0,
    generation: 0,
    error: null,
  };
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

function intentGenerationForAction(
  action: { generation: number; intentGeneration?: number },
) {
  return action.intentGeneration ?? action.generation;
}

function snapshotGenerationForAction(action: { generation: number }) {
  return action.generation;
}

export function pickerSearchReducer<Item, Cursor = unknown>(
  state: PickerSearchState<Item, Cursor>,
  action: PickerSearchAction<Item, Cursor>,
): PickerSearchState<Item, Cursor> {
  switch (action.type) {
    case "draftChanged":
      {
        const intentGeneration = Math.max(
          state.intentGeneration + 1,
          action.generation ?? state.intentGeneration + 1,
        );
        return {
          ...state,
          draftQuery: action.query,
          filterStatus: action.status,
          intentGeneration,
          error: null,
        };
      }
    case "applyStarted":
      {
        const source = action.source ?? "foreground";
        if (source === "background") {
          const descriptor = action.descriptor;
          if (
            !state.applied
            || snapshotGenerationForAction(action) !== state.generation
            || !isAppliedSearchDescriptor(descriptor)
            || descriptor.fingerprint !== state.applied.descriptor.fingerprint
          ) {
            return state;
          }
          return state;
        }
        const intentGeneration = intentGenerationForAction(action);
        if (intentGeneration < state.intentGeneration) {
          return state;
        }
        return {
          ...state,
          draftQuery: action.query,
          intentGeneration,
          filterStatus: "applying",
          error: null,
        };
      }
    case "applySucceeded":
      {
        const source = action.source ?? "foreground";
        if (!isAppliedSearchDescriptor(action.descriptor)) {
          return state;
        }
        if (source === "background") {
          if (
            !state.applied
            || snapshotGenerationForAction(action) !== state.generation
            || action.descriptor.fingerprint !== state.applied.descriptor.fingerprint
          ) {
            return state;
          }
          const appliedDescriptor = state.applied.descriptor;
          const refreshed = snapshotFromPage(
            appliedDescriptor,
            action.page,
            state.applied.generation,
          );
          const preservePresentation = state.applied.descriptor.mode === "ai";
          return {
            ...state,
            applied: {
              ...refreshed,
              generation: state.applied.generation,
              explanation: preservePresentation
                ? state.applied.explanation
                : refreshed.explanation,
              queryExplanation: preservePresentation
                ? state.applied.queryExplanation
                : refreshed.queryExplanation,
              warnings: preservePresentation ? state.applied.warnings : refreshed.warnings,
            },
            error: null,
          };
        }
        if (intentGenerationForAction(action) !== state.intentGeneration) {
          return state;
        }
        const snapshotGeneration = snapshotGenerationForAction(action);
        if (snapshotGeneration <= state.generation) {
          return state;
        }
        return {
          ...state,
          applied: snapshotFromPage(action.descriptor, action.page, snapshotGeneration),
          draftQuery: action.descriptor.displayQuery,
          generation: snapshotGeneration,
          filterStatus: "idle",
          error: null,
        };
      }
    case "applyFailed":
      {
        const source = action.source ?? "foreground";
        if (source === "background") {
          if (
            !state.applied
            || snapshotGenerationForAction(action) !== state.generation
          ) {
            return state;
          }
          return { ...state, error: action.error };
        }
        if (intentGenerationForAction(action) !== state.intentGeneration) {
          return state;
        }
        return {
          ...state,
          filterStatus: "error",
          error: action.error,
        };
      }
    case "pageAppended":
      if (
        !state.applied
        || action.generation !== state.generation
        || action.generation !== state.applied.generation
        || !isAppliedSearchDescriptor(action.descriptor)
        || action.descriptor.fingerprint !== state.applied.descriptor.fingerprint
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
          error: null,
        };
      }
    case "applyRetained":
      if (
        !state.applied
        || action.generation !== state.generation
        || !isAppliedSearchDescriptor(action.descriptor)
        || action.descriptor.fingerprint !== state.applied.descriptor.fingerprint
      ) {
        return state;
      }
      return {
        ...state,
        applied: {
          ...state.applied,
          generation: action.generation,
          totalCount: action.page?.totalCount ?? state.applied.totalCount,
          filteredCount: action.page?.filteredCount ?? state.applied.filteredCount,
        },
        filterStatus: action.source === "background" ? state.filterStatus : "idle",
        error: null,
      };
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
    && !Array.isArray(descriptor.plan)
    && typeof descriptor.fingerprint === "string"
    && descriptor.fingerprint.length > 0;
}

export function appliedSearchRequestFields(descriptor: AppliedSearchDescriptor) {
  return {
    query: descriptor.effectiveQuery,
    displayQuery: descriptor.displayQuery,
    mode: descriptor.mode,
    plan: descriptor.plan,
    appliedDescriptor: descriptor,
  } as const;
}

export function appliedQueryMutationFields(
  descriptor: AppliedSearchDescriptor,
  marked: boolean,
) {
  return {
    query: descriptor.effectiveQuery,
    marked,
    appliedDescriptor: descriptor,
  } as const;
}
