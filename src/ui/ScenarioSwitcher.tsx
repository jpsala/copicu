import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import Check from "lucide-react/dist/esm/icons/check.mjs";
import Plus from "lucide-react/dist/esm/icons/plus.mjs";
import Radio from "lucide-react/dist/esm/icons/radio.mjs";
import Search from "lucide-react/dist/esm/icons/search.mjs";
import Settings2 from "lucide-react/dist/esm/icons/settings-2.mjs";
import Square from "lucide-react/dist/esm/icons/square.mjs";
import X from "lucide-react/dist/esm/icons/x.mjs";
import type {
  ActiveScenarioSession,
  CreateScenarioFromQueryRequest,
  Scenario,
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

const emptyDraft = (): Draft => ({
  name: "",
  client: "",
  project: "",
  activity: "",
  tags: [],
});

const splitValues = (value: string) =>
  value.split(/[;,\n]/).map((part) => part.trim()).filter(Boolean);

export function ScenarioSwitcher({
  scenarios,
  availableTags,
  activeSession,
  currentQuery,
  loading,
  busy,
  onClose,
  onActivate,
  onStop,
  onCreate,
  onManage,
}: {
  scenarios: Scenario[];
  availableTags: TagSummary[];
  activeSession: ActiveScenarioSession | null;
  currentQuery: string;
  loading: boolean;
  busy: boolean;
  onClose: () => void;
  onActivate: (id: number) => Promise<void>;
  onStop: () => Promise<void>;
  onCreate: (request: CreateScenarioFromQueryRequest, activate: boolean) => Promise<void>;
  onManage: () => void;
}) {
  const [search, setSearch] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState(emptyDraft);
  const searchRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase();
    return [...scenarios]
      .sort((left, right) => {
        if (left.id === activeSession?.scenarioId) return -1;
        if (right.id === activeSession?.scenarioId) return 1;
        return right.updatedAtUnixMs - left.updatedAtUnixMs;
      })
      .filter((scenario) =>
        !normalized || [scenario.name, scenario.savedViewTitle, scenario.query]
          .join(" ")
          .toLocaleLowerCase()
          .includes(normalized),
      );
  }, [activeSession?.scenarioId, scenarios, search]);

  useEffect(() => {
    window.setTimeout(() => searchRef.current?.focus(), 0);
  }, []);

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

  useEffect(() => {
    setActiveIndex((current) => Math.min(current, Math.max(filtered.length - 1, 0)));
  }, [filtered.length]);

  const beginCreate = () => {
    setDraft({ ...emptyDraft(), tags: positiveTagFilters(currentQuery) });
    setCreating(true);
  };

  const submitCreate = async (event: FormEvent, activate: boolean) => {
    event.preventDefault();
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
      setCreating(false);
      setDraft(emptyDraft());
    } catch {
      // The parent reports the storage error and the form stays open for correction.
    }
  };

  const handleListKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => filtered.length ? (current + 1) % filtered.length : 0);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => filtered.length ? (current - 1 + filtered.length) % filtered.length : 0);
    } else if (event.key === "Enter" && filtered[activeIndex]) {
      event.preventDefault();
      void onActivate(filtered[activeIndex].id);
    } else if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  };

  return (
    <div
      className="scenario-switcher-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Scenarios"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="scenario-switcher-panel">
        <header className="scenario-switcher-header">
          <div>
            <strong>Scenarios</strong>
            <span>{activeSession ? `Active: ${activeSession.scenarioName}` : "No active scenario"}</span>
          </div>
          <div className="scenario-switcher-header-actions">
            <kbd>Alt+S</kbd>
            <UiTooltip label="Close scenarios">
              <UiIconButton type="button" variant="subtle" aria-label="Close scenarios" onClick={onClose}>
                <X size={14} strokeWidth={2.3} aria-hidden="true" />
              </UiIconButton>
            </UiTooltip>
          </div>
        </header>

        {!creating ? (
          <>
            <div className="scenario-switcher-search">
              <Search size={15} strokeWidth={2.2} aria-hidden="true" />
              <input
                ref={searchRef}
                aria-label="Search scenarios"
                value={search}
                placeholder="Search scenarios"
                onChange={(event) => {
                  setSearch(event.currentTarget.value);
                  setActiveIndex(0);
                }}
                onKeyDown={handleListKeyDown}
              />
            </div>

            <div className="scenario-switcher-list" role="listbox" aria-label="Available scenarios">
              {loading ? <div className="scenario-switcher-empty">Loading scenarios…</div> : null}
              {!loading && filtered.length === 0 ? (
                <div className="scenario-switcher-empty">No matching scenarios.</div>
              ) : null}
              {filtered.map((scenario, index) => {
                const active = activeSession?.scenarioId === scenario.id;
                return (
                  <button
                    key={scenario.id}
                    type="button"
                    role="option"
                    aria-selected={index === activeIndex}
                    className={`scenario-switcher-option${active ? " is-active" : ""}`}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => void onActivate(scenario.id)}
                  >
                    <span className="scenario-switcher-state" aria-hidden="true">
                      {active ? <Check size={15} strokeWidth={2.4} /> : <Radio size={15} strokeWidth={2} />}
                    </span>
                    <span className="scenario-switcher-option-copy">
                      <strong>{scenario.name}</strong>
                      <small>{scenario.query || "All history"}</small>
                    </span>
                    {active ? <span className="scenario-switcher-active-label">Active</span> : null}
                  </button>
                );
              })}
            </div>

            <footer className="scenario-switcher-actions">
              {activeSession ? (
                <UiButton type="button" variant="default" loading={busy} leftSection={<Square size={13} />} onClick={() => void onStop()}>
                  Stop
                </UiButton>
              ) : null}
              <UiButton type="button" variant="default" leftSection={<Plus size={14} />} onClick={beginCreate}>
                Create from search
              </UiButton>
              <UiButton type="button" variant="subtle" leftSection={<Settings2 size={14} />} onClick={onManage}>
                Manage
              </UiButton>
            </footer>
          </>
        ) : (
          <form className="scenario-create-form" onSubmit={(event) => void submitCreate(event, true)}>
            <div className="scenario-create-query">
              <span>This scenario will show</span>
              <code>{currentQuery || "All history"}</code>
            </div>
            <UiTextInput
              autoFocus
              required
              label="Scenario name"
              aria-label="New scenario name"
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.currentTarget.value })}
            />
            <label className="scenario-create-tags">
              <span>Tags for new clips</span>
              <small>Tags from the search are added automatically so new captures appear in this scenario.</small>
              <TagInput tags={draft.tags} availableTags={availableTags} ariaLabel="New scenario tags" onChange={(tags) => setDraft({ ...draft, tags })} />
            </label>
            <details className="scenario-create-advanced">
              <summary>Advanced metadata</summary>
              <p>Optional structured fields. They do not control which clips appear.</p>
              <div className="scenario-create-properties">
                <UiTextInput label="Client" aria-label="New scenario client" value={draft.client} onChange={(event) => setDraft({ ...draft, client: event.currentTarget.value })} />
                <UiTextInput label="Project" aria-label="New scenario project" value={draft.project} onChange={(event) => setDraft({ ...draft, project: event.currentTarget.value })} />
                <UiTextInput label="Activity" aria-label="New scenario activity" value={draft.activity} onChange={(event) => setDraft({ ...draft, activity: event.currentTarget.value })} />
              </div>
            </details>
            <div className="scenario-create-actions">
              <UiButton type="button" variant="default" disabled={busy} onClick={() => setCreating(false)}>Back</UiButton>
              <UiButton type="button" variant="default" loading={busy} disabled={!draft.name.trim()} onClick={(event) => void submitCreate(event, false)}>Save</UiButton>
              <UiButton type="submit" variant="filled" loading={busy} disabled={!draft.name.trim()}>Save and activate</UiButton>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
