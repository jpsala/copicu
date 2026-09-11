import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type Dispatch, type KeyboardEvent } from "react";
import Check from "lucide-react/dist/esm/icons/check.mjs";
import Minus from "lucide-react/dist/esm/icons/minus.mjs";
import RotateCcw from "lucide-react/dist/esm/icons/rotate-ccw.mjs";
import type {
  ApplyMetadataSelectionIntentResult,
  MetadataNotesIntent,
  MetadataPropertyKey,
  MetadataSelectionIntent,
  MetadataSelectionPayload,
  MetadataSelectionSnapshot,
  MetadataSetValueAggregate,
  MetadataSetValueIntent,
  TagSummary,
} from "../shared/contracts";
import { UiAlert, UiBadge, UiButton, UiSelect, UiTextInput, UiTextarea } from "./controls";
import { EditableTokenCombobox } from "./EditableTokenCombobox";
import {
  createMetadataInspectorState,
  metadataInspectorReducer,
  metadataSelectionIntent,
  metadataValueKey,
  type MetadataInspectorState,
} from "./metadataInspectorReducer";

const PROPERTY_KEYS: MetadataPropertyKey[] = ["client", "project", "activity"];
const PROPERTY_LABELS: Record<MetadataPropertyKey, string> = {
  client: "Client",
  project: "Project",
  activity: "Activity",
};

export type MetadataInspectorProps = {
  payload: MetadataSelectionPayload;
  variant: "existing-single" | "existing-multi" | "create";
  availableTags?: TagSummary[];
  closeRequestSignal?: number;
  showFooter?: boolean;
  embedded?: boolean;
  guardDirtyOnCancel?: boolean;
  onSave?: (intent: MetadataSelectionIntent) => Promise<ApplyMetadataSelectionIntentResult>;
  onSaved?: (snapshot: MetadataSelectionSnapshot) => void;
  onReload?: (itemIds: number[]) => Promise<MetadataSelectionSnapshot>;
  onCancel?: () => void;
  onIntentChange?: (intent: MetadataSelectionIntent, state: MetadataInspectorState) => void;
  onDirtyChange?: (dirty: boolean) => void;
};

export function createEmptyMetadataSnapshot(): MetadataSelectionSnapshot {
  return {
    itemIds: [],
    itemCount: 1,
    snapshotToken: "create",
    title: { state: "empty", value: null, populatedCount: 0 },
    notes: { state: "empty", value: null, populatedCount: 0 },
    tags: [],
    properties: { client: [], project: [], activity: [] },
    singleItem: null,
  };
}

function tagCandidates(snapshot: MetadataSelectionSnapshot, availableTags: TagSummary[]) {
  const entries = new Map(snapshot.tags.map((entry) => [metadataValueKey(entry.key), entry]));
  for (const tag of availableTags) {
    const key = metadataValueKey(tag.slug);
    if (!entries.has(key)) {
      entries.set(key, {
        key: tag.slug,
        label: tag.label,
        presence: "none",
        presentCount: 0,
        totalCount: snapshot.itemCount,
        sources: [],
        tagConfig: { tagId: tag.id, color: tag.color, pinned: tag.pinned },
      });
    }
  }
  return [...entries.values()];
}

function rankCandidates(values: MetadataSetValueAggregate[], query: string) {
  const normalized = metadataValueKey(query);
  if (!normalized) return [];
  return values
    .filter((value) => metadataValueKey(value.label).includes(normalized) || metadataValueKey(value.key).includes(normalized))
    .sort((left, right) => {
      const leftKey = metadataValueKey(left.label);
      const rightKey = metadataValueKey(right.label);
      const leftRank = leftKey === normalized ? 0 : leftKey.startsWith(normalized) ? 1 : 2;
      const rightRank = rightKey === normalized ? 0 : rightKey.startsWith(normalized) ? 1 : 2;
      return leftRank - rightRank
        || Number(right.tagConfig?.pinned ?? false) - Number(left.tagConfig?.pinned ?? false)
        || right.presentCount - left.presentCount
        || left.label.localeCompare(right.label);
    })
    .slice(0, 8);
}

function sourceDistribution(value: MetadataSetValueAggregate) {
  if (value.sources.length === 0) return "Available";
  return value.sources.map((source) => `${source.count} ${source.source}`).join(" · ");
}

function currentIntent(intents: MetadataSetValueIntent[], key: string) {
  const normalized = metadataValueKey(key);
  return intents.find((intent) => metadataValueKey(intent.key) === normalized)?.op ?? "untouched";
}

function effectiveSingleValues(
  base: MetadataSetValueAggregate[],
  intents: MetadataSetValueIntent[],
  totalCount: number,
) {
  const values = new Map(base.map((entry) => [metadataValueKey(entry.key), entry]));
  for (const intent of intents) {
    const key = metadataValueKey(intent.key);
    if (intent.op === "remove") values.delete(key);
    if (intent.op === "add" && !values.has(key)) {
      values.set(key, {
        key: intent.key,
        label: intent.key,
        presence: "all",
        presentCount: totalCount,
        totalCount,
        sources: [{ source: "manual", count: totalCount, confidenceMin: null, confidenceMax: null }],
      });
    }
  }
  return [...values.values()];
}

function SetValueRows({
  label,
  field,
  values,
  intents,
  dispatch,
}: {
  label: string;
  field: "tags" | MetadataPropertyKey;
  values: MetadataSetValueAggregate[];
  intents: MetadataSetValueIntent[];
  dispatch: Dispatch<Parameters<typeof metadataInspectorReducer>[1]>;
}) {
  if (values.length === 0) return null;
  return (
    <div className="metadata-value-rows" aria-label={`${label} aggregate values`}>
      {values.map((value) => {
        const intent = currentIntent(intents, value.key);
        const checked = intent === "add" ? true : intent === "remove" ? false : value.presence === "all" ? true : value.presence === "some" ? "mixed" : false;
        const toggleIntent = intent !== "untouched"
          ? { key: value.key, op: "untouched" as const }
          : { key: value.key, op: value.presence === "all" ? "remove" as const : "add" as const };
        return (
          <div key={value.key} className={`metadata-value-row${intent !== "untouched" ? " is-staged" : ""}`}>
            <button
              type="button"
              className="metadata-value-toggle"
              role="checkbox"
              aria-checked={checked}
              onClick={() => dispatch({ type: "stageSetValue", field, intent: toggleIntent })}
            >
              <span className="metadata-check-indicator" aria-hidden="true">
                {checked === "mixed" ? <Minus size={12} /> : checked ? <Check size={12} /> : null}
              </span>
              <span className="metadata-value-copy">
                <strong>{field === "tags" ? `#${value.label.replace(/^#/, "")}` : value.label}</strong>
                <small>
                  {value.presence === "some" ? `${value.presentCount} of ${value.totalCount}` : value.presence}
                  {` · ${sourceDistribution(value)}`}
                </small>
              </span>
            </button>
            {intent !== "untouched" ? (
              <div className="metadata-staged-action">
                <UiBadge size="xs" variant="light">{intent === "add" ? "Will add" : "Will remove"}</UiBadge>
                <UiButton
                  type="button"
                  size="compact-xs"
                  variant="subtle"
                  leftSection={<RotateCcw size={12} aria-hidden="true" />}
                  onClick={() => dispatch({ type: "stageSetValue", field, intent: { key: value.key, op: "untouched" } })}
                >
                  Undo
                </UiButton>
              </div>
            ) : value.presence === "some" ? (
              <UiButton
                type="button"
                size="compact-xs"
                variant="subtle"
                onClick={() => dispatch({ type: "stageSetValue", field, intent: { key: value.key, op: "remove" } })}
              >
                Remove from {value.presentCount}
              </UiButton>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function MetadataSetSection({
  label,
  field,
  values,
  candidates,
  intents,
  multi,
  autoFocus,
  allowCreate,
  dispatch,
}: {
  label: string;
  field: "tags" | MetadataPropertyKey;
  values: MetadataSetValueAggregate[];
  candidates: MetadataSetValueAggregate[];
  intents: MetadataSetValueIntent[];
  multi: boolean;
  autoFocus?: boolean;
  allowCreate: boolean;
  dispatch: Dispatch<Parameters<typeof metadataInspectorReducer>[1]>;
}) {
  const tokens = multi ? [] : effectiveSingleValues(values, intents, Math.max(values[0]?.totalCount ?? 1, 1));
  const availableCandidates = useMemo(() => {
    const selected = new Set(tokens.map((token) => metadataValueKey(token.key)));
    return candidates.filter((candidate) => !selected.has(metadataValueKey(candidate.key)) && currentIntent(intents, candidate.key) !== "add");
  }, [candidates, intents, tokens]);
  const getCandidates = useCallback((query: string) => rankCandidates(availableCandidates, query), [availableCandidates]);

  return (
    <section className="metadata-section" aria-label={label}>
      <EditableTokenCombobox
        label={label}
        inputLabel={`Add ${label.toLocaleLowerCase()}`}
        tokens={tokens}
        getKey={(value) => value.key}
        getLabel={(value) => value.label}
        getCandidates={getCandidates}
        allowCreate={allowCreate}
        autoFocus={autoFocus}
        renderToken={(value) => (
          <>
            {field === "tags" ? `#${value.label.replace(/^#/, "")}` : value.label}
            {value.sources[0] && value.sources[0].source !== "manual" ? <small>{value.sources[0].source}</small> : null}
          </>
        )}
        renderCandidate={(value) => (
          <span className="metadata-combobox-option">
            <strong>{field === "tags" ? `#${value.label.replace(/^#/, "")}` : value.label}</strong>
            <small>{value.presence === "none" ? "Available" : `${value.presentCount} of ${value.totalCount}`}</small>
          </span>
        )}
        onCommit={(value) => dispatch({
          type: "stageSetValue",
          field,
          intent: { key: typeof value === "string" ? value.trim() : value.key, op: "add" },
        })}
        onRemove={(value) => dispatch({
          type: "stageSetValue",
          field,
          intent: { key: value.key, op: currentIntent(intents, value.key) === "add" ? "untouched" : "remove" },
        })}
      />
      {multi ? <SetValueRows label={label} field={field} values={candidates} intents={intents} dispatch={dispatch} /> : (
        <SetValueRows
          label={label}
          field={field}
          values={values.filter((value) => currentIntent(intents, value.key) === "remove")}
          intents={intents}
          dispatch={dispatch}
        />
      )}
    </section>
  );
}

export function MetadataInspector({
  payload,
  variant,
  availableTags = [],
  closeRequestSignal = 0,
  showFooter = true,
  embedded = false,
  guardDirtyOnCancel = true,
  onSave,
  onSaved,
  onReload,
  onCancel,
  onIntentChange,
  onDirtyChange,
}: MetadataInspectorProps) {
  const [state, dispatch] = useReducer(metadataInspectorReducer, payload, createMetadataInspectorState);
  const latestStateRef = useRef(state);
  latestStateRef.current = state;
  const [discardGuard, setDiscardGuard] = useState(false);
  const [multiTitleDraft, setMultiTitleDraft] = useState(payload.snapshot.title.value ?? "");
  const inspectorRef = useRef<HTMLDivElement>(null);
  const titleActionRef = useRef<HTMLInputElement>(null);
  const handledCloseRequestRef = useRef(0);
  const isCreate = variant === "create";
  const snapshot = state.baseSnapshot;
  const effectiveVariant = isCreate
    ? "create"
    : snapshot.itemCount === 1 ? "existing-single" : "existing-multi";
  const multi = effectiveVariant === "existing-multi";
  const intent = useMemo(() => metadataSelectionIntent(state), [state]);
  const allTagCandidates = useMemo(() => tagCandidates(snapshot, availableTags), [availableTags, snapshot]);

  useEffect(() => dispatch({ type: "receivePayload", payload }), [payload]);
  useEffect(() => onIntentChange?.(intent, state), [intent, onIntentChange, state]);
  useEffect(() => onDirtyChange?.(state.dirty), [onDirtyChange, state.dirty]);

  useEffect(() => {
    if (!state.dirty) setMultiTitleDraft(state.baseSnapshot.title.value ?? "");
  }, [state.baseSnapshot.snapshotToken, state.baseSnapshot.title.value, state.dirty]);

  useEffect(() => {
    if (isCreate || !multi || payload.focusTarget !== "overview") return;
    const frame = window.requestAnimationFrame(() => {
      const firstMixedControl = snapshot.title.state === "mixed"
        ? titleActionRef.current
        : snapshot.notes.state === "mixed"
          ? inspectorRef.current?.querySelector<HTMLElement>('[aria-label="Notes operation"]')
          : inspectorRef.current?.querySelector<HTMLElement>('[aria-checked="mixed"]');
      (firstMixedControl ?? titleActionRef.current)?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [isCreate, multi, payload.focusTarget, snapshot.notes.state, snapshot.snapshotToken, snapshot.title.state]);

  const save = useCallback(async () => {
    if (!onSave || !state.dirty || state.saveState === "saving") return;
    dispatch({ type: "saveStarted" });
    try {
      const result = await onSave(metadataSelectionIntent(state));
      const pendingPayload = latestStateRef.current.pendingPayload;
      dispatch({ type: "saveSucceeded", snapshot: result.snapshot });
      if (!pendingPayload) onSaved?.(result.snapshot);
    } catch (error) {
      dispatch({ type: "saveFailed", error: String(error) });
    }
  }, [onSave, onSaved, state]);

  const reload = useCallback(async () => {
    if (state.conflictingPayload) {
      dispatch({ type: "replacePayload", payload: state.conflictingPayload });
      return;
    }
    if (!onReload) return;
    try {
      const nextSnapshot = await onReload(state.selection);
      dispatch({ type: "replacePayload", payload: { snapshot: nextSnapshot, focusTarget: state.focusTarget } });
    } catch (error) {
      dispatch({ type: "saveFailed", error: String(error) });
    }
  }, [onReload, state.conflictingPayload, state.focusTarget, state.selection]);

  const requestClose = useCallback(() => {
    if (guardDirtyOnCancel && state.dirty) setDiscardGuard(true);
    else onCancel?.();
  }, [guardDirtyOnCancel, onCancel, state.dirty]);

  useEffect(() => {
    if (closeRequestSignal <= handledCloseRequestRef.current) return;
    handledCloseRequestRef.current = closeRequestSignal;
    requestClose();
  }, [closeRequestSignal, requestClose]);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter" && onSave) {
      event.preventDefault();
      void save();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === "z") {
      const element = event.target as HTMLElement;
      if (!element.matches("input, textarea, select, [contenteditable=true]")) {
        event.preventDefault();
        dispatch({ type: "undoLast" });
      }
      return;
    }
    if (event.key === "Escape" && !event.defaultPrevented) {
      event.preventDefault();
      requestClose();
    }
  };

  const titleValue = multi
    ? multiTitleDraft
    : state.title.op === "set" ? state.title.value : state.title.op === "clear" ? "" : snapshot.title.value ?? "";
  const notesValue = state.notes.op === "appendToEach" || state.notes.op === "replaceAll"
    ? state.notes.value
    : state.notes.op === "clearAll" ? "" : snapshot.notes.value ?? "";
  const notesMode = state.notes.op === "appendToEach" || state.notes.op === "replaceAll" || state.notes.op === "clearAll"
    ? state.notes.op
    : "untouched";
  const propertyFields = PROPERTY_KEYS.map((key) => (
    <MetadataSetSection
      key={key}
      label={PROPERTY_LABELS[key]}
      field={key}
      values={snapshot.properties[key]}
      candidates={snapshot.properties[key]}
      intents={state.properties[key]}
      multi={multi}
      allowCreate
      dispatch={dispatch}
    />
  ));

  return (
    <div
      ref={inspectorRef}
      className={`metadata-inspector is-${effectiveVariant}${embedded ? " is-embedded" : ""}`}
      onKeyDown={handleKeyDown}
    >
      {!isCreate && !embedded ? (
        <header className="metadata-inspector-header">
          <div>
            <strong>Metadata</strong>
            <span>{snapshot.itemCount === 1 ? "Editing 1 clip" : `Editing ${snapshot.itemCount} selected clips`}</span>
          </div>
          {state.dirty ? <UiBadge size="xs" variant="light">Modified</UiBadge> : null}
        </header>
      ) : null}

      {(state.pendingPayload && !state.pendingNoticeHidden) || state.saveState === "stale" || state.conflictingPayload ? (
        <div className="metadata-inspector-alerts">
          {state.pendingPayload && !state.pendingNoticeHidden ? (
            <UiAlert color="yellow" variant="light" title="Another metadata request is waiting">
              <div className="metadata-alert-actions">
                <UiButton size="compact-xs" onClick={() => void save()} disabled={!state.dirty}>Save and open</UiButton>
                <UiButton size="compact-xs" variant="default" onClick={() => dispatch({ type: "replacePayload", payload: state.pendingPayload! })}>Discard and open</UiButton>
                <UiButton size="compact-xs" variant="subtle" onClick={() => dispatch({ type: "keepEditing" })}>Keep editing</UiButton>
              </div>
            </UiAlert>
          ) : null}
          {state.saveState === "stale" || state.conflictingPayload ? (
            <UiAlert color="yellow" variant="light" title="Metadata changed since this inspector opened">
              <div className="metadata-alert-actions">
                <UiButton size="compact-xs" onClick={() => void reload()}>Reload changes</UiButton>
                <UiButton size="compact-xs" variant="subtle" onClick={() => dispatch({ type: "keepEditing" })}>Keep editing</UiButton>
              </div>
            </UiAlert>
          ) : null}
        </div>
      ) : null}

      <div className="metadata-inspector-body">
        {!isCreate && !embedded && snapshot.singleItem ? (
          <details className="metadata-content-preview">
            <summary>Content preview <span>{snapshot.singleItem.contentKind}</span></summary>
            <pre>{snapshot.singleItem.contentPreview || "Empty clip"}</pre>
          </details>
        ) : null}

        <section className="metadata-section metadata-scalar-section">
          <label className="metadata-field-label" htmlFor="metadata-title">Title</label>
          {multi ? (
            <>
              <div className="metadata-aggregate-status">
                <span>{snapshot.title.state === "mixed" ? `${snapshot.title.populatedCount} of ${snapshot.itemCount} have titles` : snapshot.title.value || "Empty on all clips"}</span>
              </div>
              <UiTextInput
                ref={titleActionRef}
                id="metadata-title"
                aria-label="Title for all clips"
                value={titleValue}
                placeholder={snapshot.title.state === "mixed" ? "Mixed titles" : "Title"}
                onChange={(event) => setMultiTitleDraft(event.currentTarget.value)}
              />
              <div className="metadata-inline-actions">
                <UiButton type="button" size="compact-xs" variant="default" disabled={!titleValue.trim()} onClick={() => dispatch({ type: "stageTitle", intent: { op: "set", value: titleValue } })}>Set title on all</UiButton>
                <UiButton type="button" size="compact-xs" variant="subtle" onClick={() => { setMultiTitleDraft(""); dispatch({ type: "stageTitle", intent: { op: "clear" } }); }}>Clear titles</UiButton>
                {state.title.op !== "untouched" ? <UiButton type="button" size="compact-xs" variant="subtle" onClick={() => { setMultiTitleDraft(snapshot.title.value ?? ""); dispatch({ type: "stageTitle", intent: { op: "untouched" } }); }}>Undo</UiButton> : null}
              </div>
            </>
          ) : (
            <UiTextInput
              id="metadata-title"
              aria-label="Title"
              autoFocus={!isCreate && !embedded && payload.focusTarget === "overview"}
              value={titleValue}
              placeholder="Optional title"
              onChange={(event) => {
                const value = event.currentTarget.value;
                const base = snapshot.title.value ?? "";
                dispatch({ type: "stageTitle", intent: value === base ? { op: "untouched" } : value ? { op: "set", value } : { op: "clear" } });
              }}
            />
          )}
        </section>

        <section className="metadata-section metadata-scalar-section">
          <label className="metadata-field-label" htmlFor="metadata-notes">Notes</label>
          {multi ? (
            <UiSelect
              aria-label="Notes operation"
              value={notesMode}
              data={[
                { value: "untouched", label: "Keep each note" },
                { value: "appendToEach", label: "Append to each" },
                { value: "replaceAll", label: "Replace all" },
                { value: "clearAll", label: "Clear all" },
              ]}
              onChange={(value) => {
                const next = value as "untouched" | "appendToEach" | "replaceAll" | "clearAll";
                const nextIntent: MetadataNotesIntent = next === "untouched"
                  ? { op: "untouched" }
                  : next === "clearAll"
                    ? { op: "clearAll" }
                    : { op: next, value: notesValue };
                dispatch({ type: "stageNotes", intent: nextIntent });
              }}
            />
          ) : null}
          {(!multi || notesMode === "appendToEach" || notesMode === "replaceAll") ? (
            <UiTextarea
              id="metadata-notes"
              aria-label="Notes"
              autosize
              minRows={3}
              maxRows={8}
              value={notesValue}
              placeholder={multi ? "Text to apply to every selected clip" : "Optional notes"}
              onChange={(event) => {
                const value = event.currentTarget.value;
                if (multi) {
                  dispatch({ type: "stageNotes", intent: { op: notesMode as "appendToEach" | "replaceAll", value } });
                } else {
                  const base = snapshot.notes.value ?? "";
                  dispatch({ type: "stageNotes", intent: value === base ? { op: "untouched" } : value ? { op: "replaceAll", value } : { op: "clearAll" } });
                }
              }}
            />
          ) : (
            <div className="metadata-aggregate-status">
              {notesMode === "clearAll" ? `Will clear ${snapshot.notes.populatedCount} notes` : snapshot.notes.state === "mixed" ? `${snapshot.notes.populatedCount} of ${snapshot.itemCount} have different notes` : snapshot.notes.value || "Empty on all clips"}
            </div>
          )}
        </section>

        <MetadataSetSection
          label="Tags"
          field="tags"
          values={snapshot.tags}
          candidates={allTagCandidates}
          intents={state.tags}
          autoFocus={!isCreate && !embedded && payload.focusTarget === "tags"}
          multi={multi}
          allowCreate
          dispatch={dispatch}
        />

        {embedded ? (
          <details className="metadata-properties-details">
            <summary>
              Properties
              <span>Client · Project · Activity</span>
            </summary>
            <div className="metadata-properties" aria-label="Properties">
              {propertyFields}
            </div>
          </details>
        ) : (
          <div className="metadata-properties" aria-label="Properties">
            {propertyFields}
          </div>
        )}

        {!isCreate && !embedded && snapshot.singleItem ? <MetadataFacts snapshot={snapshot} /> : null}
        {state.saveState === "error" && state.error ? <UiAlert color="red" variant="light">{state.error}</UiAlert> : null}
      </div>

      {showFooter ? (
        <footer className="metadata-inspector-footer">
          <span className="metadata-change-summary" aria-live="polite">{state.summary}</span>
          <div>
            <UiButton type="button" variant="default" onClick={requestClose}>Cancel</UiButton>
            <UiButton type="button" variant="filled" loading={state.saveState === "saving"} disabled={!state.dirty} onClick={() => void save()}>Save changes</UiButton>
          </div>
        </footer>
      ) : null}

      {discardGuard ? (
        <div className="metadata-dirty-guard" role="alertdialog" aria-label="Discard metadata changes">
          <strong>Discard unsaved metadata changes?</strong>
          <div>
            <UiButton type="button" size="compact-sm" variant="default" onClick={() => setDiscardGuard(false)}>Keep editing</UiButton>
            <UiButton type="button" size="compact-sm" color="red" onClick={onCancel}>Discard changes</UiButton>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MetadataFacts({ snapshot }: { snapshot: MetadataSelectionSnapshot }) {
  const events = snapshot.singleItem?.captureContextEvents ?? [];
  const values = [
    ...snapshot.tags.map((value) => ({ label: `#${value.label}`, sources: value.sources })),
    ...PROPERTY_KEYS.flatMap((key) => snapshot.properties[key].map((value) => ({ label: `${key}:${value.label}`, sources: value.sources }))),
  ].filter((value) => value.sources.some((source) => source.source !== "manual"));
  return (
    <div className="metadata-facts">
      {values.length > 0 ? (
        <section aria-labelledby="metadata-provenance-title">
          <strong id="metadata-provenance-title">Provenance</strong>
          <ul>{values.map((value) => <li key={value.label}><code>{value.label}</code><span>{value.sources.map((source) => `${source.source}${source.confidenceMin === null ? "" : ` ${Math.round(source.confidenceMin * 100)}%`}`).join(" · ")}</span></li>)}</ul>
        </section>
      ) : null}
      {events.length > 0 ? (
        <details className="metadata-capture-details">
          <summary>Capture details <span>{events.length} {events.length === 1 ? "event" : "events"}</span></summary>
          <dl>
            <div><dt>Source</dt><dd>{events[0].sourceAppName ?? events[0].sourceKind}</dd></div>
            <div><dt>Window</dt><dd>{events[0].sourceWindowTitle ?? "Unknown"}</dd></div>
            <div><dt>Captured</dt><dd>{new Date(events[0].capturedAtUnixMs).toLocaleString()}</dd></div>
            <div><dt>MIME</dt><dd>{events[0].mimePrimary ?? "Unknown"}</dd></div>
          </dl>
        </details>
      ) : null}
    </div>
  );
}
