import { useState } from "react";
import ArrowLeft from "lucide-react/dist/esm/icons/arrow-left.mjs";
import CheckCircle2 from "lucide-react/dist/esm/icons/check-circle-2.mjs";
import Circle from "lucide-react/dist/esm/icons/circle.mjs";
import Plus from "lucide-react/dist/esm/icons/plus.mjs";
import type {
  ActiveScenarioSession,
  CreateScenarioFromQueryRequest,
  Scenario,
  TagSummary,
  UpdateScenarioFromQueryRequest,
} from "../shared/contracts";
import { TagInput } from "../ui/TagEditor";
import { UiBadge, UiButton, UiTextInput } from "../ui/controls";

type ScenarioDraft = {
  name: string;
  query: string;
  tags: string[];
};

const emptyDraft = (): ScenarioDraft => ({
  name: "",
  query: "",
  tags: [],
});


function requestFromDraft(draft: ScenarioDraft): CreateScenarioFromQueryRequest {
  return {
    name: draft.name,
    query: draft.query,
    tags: draft.tags,
  };
}


export function Scenarios({
  scenarios,
  availableTags,
  activeSession,
  loading,
  onCreate,
  onUpdate,
  onDelete,
  onActivate,
  onStop,
}: {
  scenarios: Scenario[];
  availableTags: TagSummary[];
  activeSession: ActiveScenarioSession | null;
  loading: boolean;
  onCreate: (request: CreateScenarioFromQueryRequest) => Promise<void>;
  onUpdate: (request: UpdateScenarioFromQueryRequest) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onActivate: (id: number) => Promise<void>;
  onStop: () => Promise<void>;
}) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(emptyDraft);
  const [busy, setBusy] = useState(false);

  const closeEditor = () => {
    setEditing(false);
    setEditingId(null);
    setDraft(emptyDraft());
  };

  const beginCreate = () => {
    setDraft(emptyDraft());
    setEditingId(null);
    setEditing(true);
  };

  const beginEdit = (scenario: Scenario) => {
    setDraft({
      name: scenario.name,
      query: scenario.query,
      tags: scenario.tags,
    });
    setEditingId(scenario.id);
    setEditing(true);
  };

  const save = async () => {
    setBusy(true);
    try {
      const request = requestFromDraft(draft);
      if (editingId === null) await onCreate(request);
      else await onUpdate({ id: editingId, ...request });
      closeEditor();
    } finally {
      setBusy(false);
    }
  };

  if (editing) {
    return (
      <div className="scenario-settings scenario-editor-screen" data-testid="scenario-settings">
        <header className="scenario-editor-header">
          <UiButton type="button" variant="subtle" leftSection={<ArrowLeft size={15} />} onClick={closeEditor}>
            All capture modes
          </UiButton>
          <div>
            <strong>{editingId === null ? "Create capture mode" : "Edit capture mode"}</strong>
            <span>A capture mode remembers a picker filter and optional tags for new clips.</span>
          </div>
        </header>

        <div className="scenario-form">
          <UiTextInput
            autoFocus
            label="Name"
            description="The name shown in the picker, for example “Copicu development”."
            aria-label="Capture mode name"
            value={draft.name}
            placeholder="Copicu development"
            onChange={(event) => setDraft({ ...draft, name: event.currentTarget.value })}
          />

          <UiTextInput
            label="What should this capture mode show?"
            description="Enter the same search you would use in the picker. Leave it empty to show all history."
            aria-label="Capture mode query"
            value={draft.query}
            placeholder="tag:copicu"
            onChange={(event) => setDraft({ ...draft, query: event.currentTarget.value })}
          />
          <div className="scenario-query-example">
            <span>Examples</span>
            <code>tag:copicu</code>
            <code>kind:image after:7d</code>
            <code>project notes</code>
          </div>

          <label className="scenario-tags-field">
            <span>Tags for new clips (optional)</span>
            <small>While this capture mode is active, these tags are added to every new capture.</small>
            <TagInput tags={draft.tags} availableTags={availableTags} ariaLabel="Capture mode tags" onChange={(tags) => setDraft({ ...draft, tags })} />
          </label>


          <div className="scenario-form-actions">
            <UiButton type="button" variant="filled" loading={busy} disabled={!draft.name.trim()} onClick={() => void save()}>
              {editingId === null ? "Create capture mode" : "Save changes"}
            </UiButton>
            <UiButton type="button" variant="default" onClick={closeEditor}>Cancel</UiButton>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="scenario-settings" data-testid="scenario-settings">
      <div className="scenario-explainer">
        <strong>Capture modes are workspaces for the picker</strong>
        <p>Each mode remembers what the picker should show and can tag new clips while active.</p>
      </div>

      <div className={`scenario-session-summary${activeSession ? " is-active" : ""}`} aria-live="polite">
        {activeSession ? <CheckCircle2 size={17} strokeWidth={2.2} aria-hidden="true" /> : <Circle size={17} strokeWidth={2} aria-hidden="true" />}
        <div>
          <span>Current capture mode</span>
          <strong>{activeSession?.scenarioName ?? "None active"}</strong>
        </div>
        {activeSession ? <UiButton type="button" size="xs" variant="default" onClick={() => void onStop()}>Stop capture mode</UiButton> : null}
      </div>

      <div className="scenario-library-header">
        <div>
          <strong>Your capture modes</strong>
          <span>{scenarios.length === 1 ? "1 capture mode" : `${scenarios.length} capture modes`}</span>
        </div>
        <UiButton type="button" variant="default" leftSection={<Plus size={14} />} disabled={loading} onClick={beginCreate}>
          New capture mode
        </UiButton>
      </div>

      <div className="scenario-list">
        {scenarios.map((scenario) => {
          const active = activeSession?.scenarioId === scenario.id;
          return (
            <article key={scenario.id} className={`scenario-row${active ? " is-active" : ""}`}>
              <div className="scenario-row-main">
                <div className="scenario-row-title">
                  <strong>{scenario.name}</strong>
                  {active ? <UiBadge variant="light" color="green">Active</UiBadge> : null}
                </div>
                <div className="scenario-view-summary">
                  <span>Shows</span>
                  <code>{scenario.query || "All history"}</code>
                </div>
                <div className="scenario-context-summary" aria-label={`Automatic labels for ${scenario.name}`}>
                  {scenario.tags.length > 0
                    ? scenario.tags.map((tag) => <span key={tag}>#{tag}</span>)
                    : <small>No automatic tags</small>}
                </div>
              </div>
              <div className="scenario-row-actions">
                <UiButton type="button" size="xs" variant={active ? "light" : "filled"} disabled={active} onClick={() => void onActivate(scenario.id)}>{active ? "Active" : "Activate"}</UiButton>
                <UiButton type="button" size="xs" variant="default" onClick={() => beginEdit(scenario)}>Edit</UiButton>
                <UiButton type="button" size="xs" color="red" variant="subtle" onClick={() => void onDelete(scenario.id)}>Delete</UiButton>
              </div>
            </article>
          );
        })}
        {!loading && scenarios.length === 0 ? (
          <div className="scenario-empty-state">
            <strong>No scenarios yet</strong>
            <span>Create one here or from the picker with Alt+S.</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
