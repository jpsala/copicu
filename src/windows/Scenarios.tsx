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
  client: string;
  project: string;
  activity: string;
  tags: string[];
};

const emptyDraft = (): ScenarioDraft => ({
  name: "",
  query: "",
  client: "",
  project: "",
  activity: "",
  tags: [],
});

const splitValues = (value: string) =>
  value.split(/[;,\n]/).map((part) => part.trim()).filter(Boolean);

const joinValues = (values: string[]) => values.join(", ");

function requestFromDraft(draft: ScenarioDraft): CreateScenarioFromQueryRequest {
  return {
    name: draft.name,
    query: draft.query,
    properties: {
      client: splitValues(draft.client),
      project: splitValues(draft.project),
      activity: splitValues(draft.activity),
    },
    tags: draft.tags,
  };
}

function advancedLabels(scenario: Scenario) {
  return [
    ...scenario.properties.client.map((value) => `Client: ${value}`),
    ...scenario.properties.project.map((value) => `Project: ${value}`),
    ...scenario.properties.activity.map((value) => `Activity: ${value}`),
  ];
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
      client: joinValues(scenario.properties.client),
      project: joinValues(scenario.properties.project),
      activity: joinValues(scenario.properties.activity),
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
            All scenarios
          </UiButton>
          <div>
            <strong>{editingId === null ? "Create scenario" : "Edit scenario"}</strong>
            <span>A scenario remembers a picker filter and optional labels for new clips.</span>
          </div>
        </header>

        <div className="scenario-form">
          <UiTextInput
            autoFocus
            label="Name"
            description="The name shown in the picker, for example “Copicu development”."
            aria-label="Scenario name"
            value={draft.name}
            placeholder="Copicu development"
            onChange={(event) => setDraft({ ...draft, name: event.currentTarget.value })}
          />

          <UiTextInput
            label="What should this scenario show?"
            description="Enter the same search you would use in the picker. Leave it empty to show all history."
            aria-label="Scenario query"
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
            <small>While this scenario is active, these tags are added to every new capture.</small>
            <TagInput tags={draft.tags} availableTags={availableTags} ariaLabel="Scenario tags" onChange={(tags) => setDraft({ ...draft, tags })} />
          </label>

          <details className="scenario-advanced">
            <summary>Advanced metadata</summary>
            <p>Use these only if you want structured fields in addition to tags. They do not control which clips appear.</p>
            <div className="scenario-property-grid">
              <UiTextInput label="Client" description="Who the work is for, such as ACME." aria-label="Scenario client values" value={draft.client} placeholder="ACME" onChange={(event) => setDraft({ ...draft, client: event.currentTarget.value })} />
              <UiTextInput label="Project" description="The product or workstream, such as Website." aria-label="Scenario project values" value={draft.project} placeholder="Website" onChange={(event) => setDraft({ ...draft, project: event.currentTarget.value })} />
              <UiTextInput label="Activity" description="The kind of work, such as Review." aria-label="Scenario activity values" value={draft.activity} placeholder="Development" onChange={(event) => setDraft({ ...draft, activity: event.currentTarget.value })} />
            </div>
            <small>Separate multiple values with commas.</small>
          </details>

          <div className="scenario-form-actions">
            <UiButton type="button" variant="filled" loading={busy} disabled={!draft.name.trim()} onClick={() => void save()}>
              {editingId === null ? "Create scenario" : "Save changes"}
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
        <strong>Scenarios are workspaces for the picker</strong>
        <p>Each scenario remembers what the picker should show. It can also tag new clips automatically while active.</p>
      </div>

      <div className={`scenario-session-summary${activeSession ? " is-active" : ""}`} aria-live="polite">
        {activeSession ? <CheckCircle2 size={17} strokeWidth={2.2} aria-hidden="true" /> : <Circle size={17} strokeWidth={2} aria-hidden="true" />}
        <div>
          <span>Current scenario</span>
          <strong>{activeSession?.scenarioName ?? "None active"}</strong>
        </div>
        {activeSession ? <UiButton type="button" size="xs" variant="default" onClick={() => void onStop()}>Stop scenario</UiButton> : null}
      </div>

      <div className="scenario-library-header">
        <div>
          <strong>Your scenarios</strong>
          <span>{scenarios.length === 1 ? "1 scenario" : `${scenarios.length} scenarios`}</span>
        </div>
        <UiButton type="button" variant="default" leftSection={<Plus size={14} />} disabled={loading} onClick={beginCreate}>
          New scenario
        </UiButton>
      </div>

      <div className="scenario-list">
        {scenarios.map((scenario) => {
          const active = activeSession?.scenarioId === scenario.id;
          const advanced = advancedLabels(scenario);
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
                  {advanced.map((label) => <span key={label} className="is-advanced">{label}</span>)}
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
