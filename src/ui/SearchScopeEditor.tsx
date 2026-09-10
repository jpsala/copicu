import { Popover } from "@mantine/core";
import { Check, CircleDot, CornerDownRight, Minus } from "lucide-react";
import { useEffect } from "react";
import {
  effectiveSearchScopeLeaves,
  sameSearchScopeSelection,
  SEARCH_SCOPE_LABELS,
  scopeOptions,
  scopeQuery,
  scopeSummary,
  type SearchScopeSelection,
} from "../shared/searchScopes";
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
  const normalizedAll = selection.included.length === 0 || selection.included.includes("all");
  const leaves = effectiveSearchScopeLeaves(selection);
  const labels = leaves.map((scope) => SEARCH_SCOPE_LABELS[scope]);
  if (normalizedAll && selection.excluded.length > 0) {
    labels.push("MIME", "Kind");
  }
  return (
    <span className="search-scope-tokens">
      {normalizedAll && selection.excluded.length === 0 ? (
        <span className="search-scope-token" aria-label="Included: all searchable fields">
          <Check size={12} aria-hidden="true" /> All fields
        </span>
      ) : (
        <>
          {labels.length === 0 ? <span className="search-scope-empty">No text fields</span> : null}
          {labels.map((label) => (
            <span key={label} className="search-scope-token" aria-label={`${label}: included`}>
              <Check size={12} aria-hidden="true" /> {label}
            </span>
          ))}
        </>
      )}
    </span>
  );
}
type ScopePickerProps = {
  selection: SearchScopeSelection;
  defaultSelection?: SearchScopeSelection;
  onChange: (selection: SearchScopeSelection) => void;
  onSaveDefault?: () => void;
  onResetDefault?: () => void;
  saveState?: "idle" | "saving" | "error";
  saveError?: string | null;
  disabled?: boolean;
  hasExplicitOverride?: boolean;
  onOpenChange?: (opened: boolean) => void;
};

export function SearchScopePicker({
  selection,
  defaultSelection,
  onChange,
  onSaveDefault,
  onResetDefault,
  saveState = "idle",
  saveError = null,
  disabled = false,
  hasExplicitOverride,
  onOpenChange,
}: ScopePickerProps) {
  useEffect(() => () => onOpenChange?.(false), [onOpenChange]);
  const canSave = Boolean(onSaveDefault && defaultSelection && !sameSearchScopeSelection(selection, defaultSelection));
  return (
    <Popover withinPortal position="bottom-start" shadow="md" trapFocus returnFocus onChange={onOpenChange}>
      <Popover.Target>
        <button type="button" className="search-scope-trigger" aria-label="Edit search fields"
          aria-haspopup="dialog" disabled={disabled}>
          <SearchScopeSummary selection={selection} />
        </button>
      </Popover.Target>
      <Popover.Dropdown className="picker-menu-dropdown search-scope-menu" role="dialog" aria-label="Search fields">
        <div className="scope-editor">
          <div className="scope-editor-summary">
            <div aria-live="polite">
              <p>{scopeSummary(selection)}</p>
              <code>{scopeQuery(selection, { includeAll: true }) || "No in: modifier · all searchable fields"}</code>
            </div>
            <UiButton type="button" variant="subtle" size="xs" onClick={() => onChange({ included: ["all"], excluded: [] })}>
              All fields
            </UiButton>
          </div>
          <div className="scope-editor-options" aria-label="Search fields">
            {scopeOptions(selection).map((option) => (
              <div key={option.scope} className="scope-editor-option-row">
                <button type="button" className="search-autocomplete-option" aria-label={`${option.label}: ${option.detail}. ${option.actionLabel}`}
                  onClick={() => onChange(option.next)}>
                  <SearchScopeOption {...option} />
                </button>
                <UiButton type="button" variant="subtle" size="xs" aria-label={`Search only ${option.label}`}
                  onClick={() => onChange({ included: [option.scope], excluded: [] })}>
                  Only
                </UiButton>
              </div>
            ))}
          </div>
          {onSaveDefault && defaultSelection ? (
            <div className="scope-editor-footer">
              {canSave ? (
                <UiButton type="button" variant="filled" size="xs" disabled={saveState === "saving"} onClick={onSaveDefault}>
                  {saveState === "saving" ? "Saving…" : "Save as default"}
                </UiButton>
              ) : (
                <span className="scope-editor-default">Default</span>
              )}
              {onResetDefault && hasExplicitOverride ? (
                <UiButton type="button" variant="subtle" size="xs" onClick={onResetDefault}>Reset to default</UiButton>
              ) : null}
              {saveError ? <span className="scope-editor-error" role="alert">{saveError}</span> : null}
            </div>
          ) : null}
        </div>
      </Popover.Dropdown>
    </Popover>
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
