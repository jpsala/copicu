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

export function SearchScopeSummary({ selection }: { selection: SearchScopeSelection }) {
  const options = scopeOptions(selection);
  const allFields = selection.included.length === 0 || selection.included.includes("all");
  const included = allFields ? [] : options.filter((option) =>
    selection.included.includes(option.scope) && option.state !== "excluded");
  return (
    <span className="search-scope-tokens">
      {allFields ? (
        <span className="search-scope-token" aria-label="Included: all fields">
          <Check size={12} aria-hidden="true" /> All fields
        </span>
      ) : included.length === 0 ? (
        <span className="search-scope-empty">No text fields</span>
      ) : included.map((option) => (
        <span key={option.scope} className="search-scope-token"
          aria-label={`${option.label}: ${option.state === "partial" ? "partly included" : "included"}`}>
          {option.state === "partial"
            ? <CircleDot size={12} aria-hidden="true" />
            : <Check size={12} aria-hidden="true" />}
          {option.label}
        </span>
      ))}
      {options.filter((option) => selection.excluded.includes(option.scope)).map((option) => (
        <span key={`excluded:${option.scope}`} className="search-scope-token is-excluded"
          aria-label={`Excluded: ${option.label}`}>
          <Minus size={12} aria-hidden="true" /> {option.label}
        </span>
      ))}
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
      <p>These fields are applied when a search runs without an explicit in: modifier. Clear shows all history, and the default remains available for the next typed search.</p>
    </div>
  );
}
