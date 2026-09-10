import { Combobox, InputBase, useCombobox } from "@mantine/core";
import X from "lucide-react/dist/esm/icons/x.mjs";
import {
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

export type EditableTokenComboboxProps<T> = {
  label: string;
  inputLabel: string;
  tokens: T[];
  getKey: (value: T) => string;
  getLabel: (value: T) => string;
  getCandidates: (query: string) => T[];
  renderToken?: (value: T) => ReactNode;
  renderCandidate?: (value: T) => ReactNode;
  onCommit: (value: T | string) => void;
  onRemove: (value: T) => void;
  allowCreate?: boolean;
  autoFocus?: boolean;
  placeholder?: string;
};

export function EditableTokenCombobox<T>({
  label,
  inputLabel,
  tokens,
  getKey,
  getLabel,
  getCandidates,
  renderToken,
  renderCandidate,
  onCommit,
  onRemove,
  allowCreate = false,
  autoFocus = false,
  placeholder = "Add a value…",
}: EditableTokenComboboxProps<T>) {
  const listboxId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const chipRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const combobox = useCombobox({
    onDropdownClose: () => setActiveIndex(0),
  });
  const candidates = useMemo(() => getCandidates(query), [getCandidates, query]);
  const normalizedQuery = query.trim();
  const canCreate = allowCreate
    && normalizedQuery.length > 0
    && !tokens.some((value) => getLabel(value).localeCompare(normalizedQuery, undefined, { sensitivity: "accent" }) === 0)
    && !candidates.some((value) => getLabel(value).localeCompare(normalizedQuery, undefined, { sensitivity: "accent" }) === 0);
  const optionCount = candidates.length + Number(canCreate);
  const boundedActiveIndex = optionCount === 0 ? -1 : Math.min(activeIndex, optionCount - 1);
  const activeOptionId = boundedActiveIndex < 0 ? undefined : `${listboxId}-option-${boundedActiveIndex}`;

  useEffect(() => {
    if (optionCount > 0 && normalizedQuery) combobox.openDropdown();
    else combobox.closeDropdown();
  }, [combobox, normalizedQuery, optionCount]);

  const commit = (value: T | string) => {
    onCommit(value);
    setQuery("");
    setActiveIndex(0);
    combobox.closeDropdown();
    window.requestAnimationFrame(() => inputRef.current?.focus());
  };

  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape" && combobox.dropdownOpened) {
      event.preventDefault();
      event.stopPropagation();
      combobox.closeDropdown();
      return;
    }
    if ((event.key === "ArrowDown" || event.key === "ArrowUp") && optionCount > 0) {
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((current) => (current + direction + optionCount) % optionCount);
      return;
    }
    if ((event.key === "Enter" || event.key === "Tab") && boundedActiveIndex >= 0) {
      event.preventDefault();
      if (boundedActiveIndex < candidates.length) commit(candidates[boundedActiveIndex]);
      else commit(normalizedQuery);
      return;
    }
    if (event.key === "Enter" && allowCreate && normalizedQuery) {
      event.preventDefault();
      commit(normalizedQuery);
      return;
    }
    if (event.key === "Backspace" && !query && tokens.length > 0) {
      event.preventDefault();
      chipRefs.current[tokens.length - 1]?.focus();
    }
  };

  return (
    <div className="editable-token-field">
      <span className="metadata-field-label">{label}</span>
      <Combobox
        store={combobox}
        withinPortal
        onOptionSubmit={(value) => {
          const index = Number(value);
          if (index < candidates.length) commit(candidates[index]);
          else commit(normalizedQuery);
        }}
      >
        <Combobox.Target>
          <div className="editable-token-control" aria-label={`${label} values`}>
            {tokens.map((token, index) => (
              <button
                key={getKey(token)}
                ref={(node) => { chipRefs.current[index] = node; }}
                type="button"
                className="editable-token-chip"
                aria-label={`Remove ${getLabel(token)}`}
                onClick={() => onRemove(token)}
                onKeyDown={(event) => {
                  if (event.key === "Backspace" || event.key === "Delete") {
                    event.preventDefault();
                    onRemove(token);
                    window.requestAnimationFrame(() => inputRef.current?.focus());
                  } else if (event.key === "ArrowLeft" && index > 0) {
                    event.preventDefault();
                    chipRefs.current[index - 1]?.focus();
                  } else if (event.key === "ArrowRight") {
                    event.preventDefault();
                    if (index < tokens.length - 1) chipRefs.current[index + 1]?.focus();
                    else inputRef.current?.focus();
                  }
                }}
              >
                <span>{renderToken?.(token) ?? getLabel(token)}</span>
                <X size={12} strokeWidth={2.25} aria-hidden="true" />
              </button>
            ))}
            <InputBase
              ref={inputRef}
              className="editable-token-input"
              autoFocus={autoFocus}
              aria-label={inputLabel}
              aria-autocomplete="list"
              aria-controls={listboxId}
              aria-activedescendant={activeOptionId}
              aria-expanded={combobox.dropdownOpened}
              value={query}
              placeholder={tokens.length > 0 ? "Add another…" : placeholder}
              onFocus={() => {
                if (optionCount > 0) combobox.openDropdown();
              }}
              onChange={(event) => {
                setQuery(event.currentTarget.value);
                setActiveIndex(0);
              }}
              onKeyDown={handleInputKeyDown}
            />
          </div>
        </Combobox.Target>
        <Combobox.Dropdown className="editable-token-dropdown">
          <Combobox.Options id={listboxId} aria-label={`${label} suggestions`}>
            {candidates.map((candidate, index) => (
              <Combobox.Option
                id={`${listboxId}-option-${index}`}
                key={getKey(candidate)}
                value={String(index)}
                active={index === boundedActiveIndex}
              >
                {renderCandidate?.(candidate) ?? getLabel(candidate)}
              </Combobox.Option>
            ))}
            {canCreate ? (
              <Combobox.Option
                id={`${listboxId}-option-${candidates.length}`}
                value={String(candidates.length)}
                active={candidates.length === boundedActiveIndex}
              >
                Create “{normalizedQuery}”
              </Combobox.Option>
            ) : null}
          </Combobox.Options>
        </Combobox.Dropdown>
      </Combobox>
    </div>
  );
}
