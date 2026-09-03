import { useEffect, useState } from "react";
import X from "lucide-react/dist/esm/icons/x.mjs";
import type {
  CreateScenarioFromQueryRequest,
  TagSummary,
} from "../shared/contracts";
import { positiveTagFilters } from "../shared/search";
import { TagInput } from "./TagEditor";
import { UiButton, UiIconButton, UiTextInput, UiTooltip } from "./controls";

type Draft = {
  name: string;
  client: string;
  project: string;
  activity: string;
  tags: string[];
};

const splitValues = (value: string) =>
  value.split(/[;,\n]/).map((part) => part.trim()).filter(Boolean);

export function ScenarioCreator({
  availableTags,
  currentQuery,
  busy,
  onClose,
  onCreate,
}: {
  availableTags: TagSummary[];
  currentQuery: string;
  busy: boolean;
  onClose: () => void;
  onCreate: (request: CreateScenarioFromQueryRequest, activate: boolean) => Promise<void>;
}) {
  const [draft, setDraft] = useState<Draft>(() => ({
    name: "",
    client: "",
    project: "",
    activity: "",
    tags: positiveTagFilters(currentQuery),
  }));

  useEffect(() => {
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", closeOnEscape, true);
    return () => window.removeEventListener("keydown", closeOnEscape, true);
  }, [onClose]);

  const submitCreate = async (activate: boolean) => {
    try {
      await onCreate({
        name: draft.name,
        query: currentQuery,
        properties: {
          client: splitValues(draft.client),
          project: splitValues(draft.project),
          activity: splitValues(draft.activity),
        },
        tags: draft.tags,
      }, activate);
      onClose();
    } catch {
      // The parent reports the storage error and the form stays open for correction.
    }
  };

  return (
    <div
      className="scenario-switcher-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Create capture mode"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="scenario-switcher-panel">
        <header className="scenario-switcher-header">
          <div>
            <strong>Create capture mode</strong>
            <span>Save this search and apply optional metadata to new captures while active.</span>
          </div>
          <UiTooltip label="Close capture mode creator">
            <UiIconButton type="button" variant="subtle" aria-label="Close capture mode creator" onClick={onClose}>
              <X size={14} strokeWidth={2.3} aria-hidden="true" />
            </UiIconButton>
          </UiTooltip>
        </header>

        <form
          className="scenario-create-form"
          onSubmit={(event) => {
            event.preventDefault();
            void submitCreate(true);
          }}
        >
          <div className="scenario-create-query">
            <span>This capture mode will show</span>
            <code>{currentQuery || "All history"}</code>
          </div>
          <UiTextInput
            autoFocus
            required
            label="Capture mode name"
            aria-label="New capture mode name"
            value={draft.name}
            onChange={(event) => setDraft({ ...draft, name: event.currentTarget.value })}
          />
          <label className="scenario-create-tags">
            <span>Tags for new clips</span>
            <small>Tags from the search are added automatically so new captures appear in this mode.</small>
            <TagInput tags={draft.tags} availableTags={availableTags} ariaLabel="New capture mode tags" onChange={(tags) => setDraft({ ...draft, tags })} />
          </label>
          <details className="scenario-create-advanced">
            <summary>Advanced metadata</summary>
            <p>Optional structured fields. They do not control which clips appear.</p>
            <div className="scenario-create-properties">
              <UiTextInput label="Client" aria-label="New capture mode client" value={draft.client} onChange={(event) => setDraft({ ...draft, client: event.currentTarget.value })} />
              <UiTextInput label="Project" aria-label="New capture mode project" value={draft.project} onChange={(event) => setDraft({ ...draft, project: event.currentTarget.value })} />
              <UiTextInput label="Activity" aria-label="New capture mode activity" value={draft.activity} onChange={(event) => setDraft({ ...draft, activity: event.currentTarget.value })} />
            </div>
          </details>
          <div className="scenario-create-actions">
            <UiButton type="button" variant="default" disabled={busy} onClick={onClose}>Cancel</UiButton>
            <UiButton type="button" variant="default" loading={busy} disabled={!draft.name.trim()} onClick={() => void submitCreate(false)}>Save capture mode</UiButton>
            <UiButton type="submit" variant="filled" loading={busy} disabled={!draft.name.trim()}>Save and activate</UiButton>
          </div>
        </form>
      </div>
    </div>
  );
}
