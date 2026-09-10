import { Check, CircleDot, CornerDownRight, Minus } from "lucide-react";
import { scopeOptions, scopeQuery, scopeSummary, type SearchScopeSelection } from "../shared/searchScopes";
import { UiButton } from "./controls";

type ScopeState = "included" | "inherited" | "excluded" | "available" | "partial";

export function SearchScopeOption({ label, state, detail, actionLabel }: {
  label: string;
  state: ScopeState;
  detail: string;
  actionLabel: string;
}) {
  const Icon = state === "included" ? Check
    : state === "inherited" ? CornerDownRight
      : state === "excluded" ? Minus
        : state === "partial" ? CircleDot : null;
  return (
    <span className={`scope-option-content is-${state}`}>
      <span className="scope-state-icon" aria-hidden="true">
        {Icon ? <Icon size={14} strokeWidth={2} /> : null}
      </span>
      <span className="scope-option-copy">
        <span className="scope-option-label">{label}</span>
        <span className="scope-option-detail">{detail}</span>
      </span>
      <span className="scope-option-action">{actionLabel}</span>
    </span>
  );
}

export function SearchScopeEditor({ selection, onChange }: {
  selection: SearchScopeSelection;
  onChange: (selection: SearchScopeSelection) => void;
}) {
  return (
    <div className="scope-editor">
      <div className="scope-editor-summary">
        <div aria-live="polite">
          <p>{scopeSummary(selection)}</p>
          <code>{scopeQuery(selection) || "No in: modifier · all searchable fields"}</code>
        </div>
        <UiButton type="button" variant="subtle" size="xs"
          onClick={() => onChange({ included: ["all"], excluded: [] })}>
          Reset to all
        </UiButton>
      </div>
      <div className="scope-editor-options" aria-label="Default search fields">
        {scopeOptions(selection).map((option) => (
          <div key={option.scope} className="scope-editor-option-row">
            <button type="button" className="search-autocomplete-option"
              aria-label={`${option.label}: ${option.detail}. ${option.actionLabel}`}
              onClick={() => onChange(option.next)}>
              <SearchScopeOption {...option} />
            </button>
            <UiButton type="button" variant="subtle" size="xs"
              aria-label={`Search only ${option.label}`}
              onClick={() => onChange({ included: [option.scope], excluded: [] })}>
              Only
            </UiButton>
          </div>
        ))}
      </div>
      <p>Included fields are combined; exclusions take precedence. Empty search still shows all history.</p>
    </div>
  );
}
