import { tagKey } from "../shared/search";
import X from "lucide-react/dist/esm/icons/x.mjs";
import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { TagSummary } from "../shared/contracts";
import { UiTextInput } from "./controls";

type TagInputProps = {
  tags: string[];
  availableTags: TagSummary[];
  ariaLabel?: string;
  inputAriaLabel?: string;
  idPrefix?: string;
  autoFocus?: boolean;
  onChange: (tags: string[]) => void;
  onApply?: (tags: string[]) => void;
  onCancel?: () => void;
};

type TagSuggestion = {
  key: string;
  label: string;
  detail: string;
  create: boolean;
};

function cleanTagInput(value: string) {
  return value.replace(/^\p{White_Space}+|\p{White_Space}+$/gu, "").replace(/^#+/, "").replace(/^\p{White_Space}+|\p{White_Space}+$/gu, "");
}

function uniqueTags(tags: string[]) {
  const seen = new Set<string>();
  return tags.filter((tag) => {
    const key = tagKey(tag);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function suggestionsFor(input: string, availableTags: TagSummary[], selectedTags: string[]): TagSuggestion[] {
  const query = tagKey(input);
  if (!query) return [];
  const selected = new Set(selectedTags.map(tagKey));
  const matches = availableTags
    .filter((tag) => !selected.has(tagKey(tag.slug)))
    .filter((tag) => tagKey(tag.label).includes(query) || tagKey(tag.slug).includes(query))
    .sort((left, right) => {
      const leftKey = tagKey(left.label);
      const rightKey = tagKey(right.label);
      const leftRank = leftKey === query ? 0 : leftKey.startsWith(query) ? 1 : 2;
      const rightRank = rightKey === query ? 0 : rightKey.startsWith(query) ? 1 : 2;
      return leftRank - rightRank
        || Number(right.pinned) - Number(left.pinned)
        || right.itemCount - left.itemCount
        || left.label.localeCompare(right.label);
    })
    .slice(0, 8)
    .map((tag) => ({
      key: `tag:${tag.id}`,
      label: tag.label,
      detail: `${tag.itemCount} ${tag.itemCount === 1 ? "clip" : "clips"}`,
      create: false,
    }));
  const cleanedInput = cleanTagInput(input);
  const exactExists = availableTags.some(
    (tag) => tagKey(tag.label) === tagKey(cleanedInput) || tagKey(tag.slug) === tagKey(cleanedInput),
  ) || selected.has(tagKey(cleanedInput));
  if (cleanedInput && !exactExists) {
    matches.push({ key: `create:${tagKey(cleanedInput)}`, label: cleanedInput, detail: "Create tag", create: true });
  }
  return matches;
}

export function TagInput({
  tags,
  availableTags,
  ariaLabel = "Selected tags",
  inputAriaLabel = "Tag",
  idPrefix = "tag-editor",
  autoFocus = false,
  onChange,
  onApply,
  onCancel,
}: TagInputProps) {
  const [input, setInput] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestions = useMemo(() => suggestionsFor(input, availableTags, tags), [availableTags, input, tags]);
  const activeSuggestion = suggestions[Math.min(activeIndex, Math.max(suggestions.length - 1, 0))];
  const suggestionListId = `${idPrefix}-suggestions`;
  const suggestionId = (key: string) => `${idPrefix}-suggestion-${key}`;

  const canonicalTag = (value: string) => {
    const cleaned = cleanTagInput(value);
    return availableTags.find(
      (tag) => tagKey(tag.label) === tagKey(cleaned) || tagKey(tag.slug) === tagKey(cleaned),
    )?.label ?? cleaned;
  };

  const addTag = (value: string) => {
    const cleaned = canonicalTag(value);
    if (!cleaned) return;
    onChange(uniqueTags([...tags, cleaned]));
    setInput("");
    setActiveIndex(0);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  };

  const apply = () => {
    const cleanedInput = canonicalTag(input);
    const nextTags = uniqueTags(cleanedInput ? [...tags, cleanedInput] : tags);
    if (cleanedInput) {
      onChange(nextTags);
      setInput("");
    }
    onApply?.(nextTags);
  };

  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter" && onApply) {
      event.preventDefault();
      apply();
      return;
    }
    switch (event.key) {
      case "ArrowDown":
      case "ArrowUp":
        if (suggestions.length > 0) {
          event.preventDefault();
          const direction = event.key === "ArrowDown" ? 1 : -1;
          setActiveIndex((current) => (current + direction + suggestions.length) % suggestions.length);
        }
        break;
      case "Enter":
        event.preventDefault();
        addTag(activeSuggestion?.label ?? input);
        break;
      case "Tab":
        if (activeSuggestion) {
          event.preventDefault();
          addTag(activeSuggestion.label);
        }
        break;
      case "Backspace":
        if (!input && tags.length > 0) {
          event.preventDefault();
          onChange(tags.slice(0, -1));
        }
        break;
      case "Escape":
        if (onCancel) {
          event.preventDefault();
          onCancel();
        }
        break;
    }
  };

  return (
    <div className="tag-editor-combobox">
      <div className="tag-editor-chips" aria-label={ariaLabel}>
        {tags.map((tag) => (
          <button
            key={tagKey(tag)}
            type="button"
            className="tag-editor-chip"
            aria-label={`Remove tag ${tag}`}
            onClick={() => onChange(tags.filter((candidate) => tagKey(candidate) !== tagKey(tag)))}
          >
            <span>#{tag}</span>
            <X size={12} strokeWidth={2.4} aria-hidden="true" />
          </button>
        ))}
        <UiTextInput
          ref={inputRef}
          autoFocus={autoFocus}
          className="tag-editor-input"
          aria-label={inputAriaLabel}
          aria-autocomplete="list"
          aria-controls={suggestionListId}
          aria-expanded={suggestions.length > 0}
          aria-activedescendant={activeSuggestion ? suggestionId(activeSuggestion.key) : undefined}
          value={input}
          placeholder={tags.length > 0 ? "Add another…" : "Type a tag…"}
          onChange={(event) => {
            setInput(event.currentTarget.value.replace(/^#+/, ""));
            setActiveIndex(0);
          }}
          onKeyDown={handleInputKeyDown}
        />
      </div>
      {suggestions.length > 0 ? (
        <div id={suggestionListId} className="tag-editor-suggestions" role="listbox" aria-label="Tag suggestions">
          {suggestions.map((suggestion, index) => (
            <button
              key={suggestion.key}
              id={suggestionId(suggestion.key)}
              type="button"
              className={`tag-editor-suggestion${suggestion.create ? " is-create" : ""}`}
              role="option"
              aria-selected={index === Math.min(activeIndex, suggestions.length - 1)}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => addTag(suggestion.label)}
            >
              <span>{suggestion.create ? `Create “${suggestion.label}”` : `#${suggestion.label}`}</span>
              <small>{suggestion.detail}</small>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
