import X from "lucide-react/dist/esm/icons/x.mjs";
import {
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import type { TagSummary } from "../shared/contracts";
import {
  UiButton,
  UiIconButton,
  UiKbd,
  UiPaper,
  UiTextInput,
} from "./controls";

export type TagEditorMode = "replace" | "add";

type TagEditorProps = {
  itemCount: number;
  mode: TagEditorMode;
  initialTags: string[];
  availableTags: TagSummary[];
  saving: boolean;
  error: string | null;
  onApply: (tags: string[]) => void;
  onCancel: () => void;
};

type TagSuggestion = {
  key: string;
  label: string;
  detail: string;
  create: boolean;
};

function tagKey(value: string) {
  return cleanTagInput(value)
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}_/\s-]/gu, "")
    .replace(/\s+/g, "-")
    .split("-")
    .filter(Boolean)
    .join("-");
}

function cleanTagInput(value: string) {
  return value.trim().replace(/^#+/, "").trim();
}

function uniqueTags(tags: string[]) {
  const seen = new Set<string>();
  return tags.filter((tag) => {
    const key = tagKey(tag);
    if (!key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function suggestionsFor(
  input: string,
  availableTags: TagSummary[],
  selectedTags: string[],
): TagSuggestion[] {
  const query = tagKey(input);
  const selected = new Set(selectedTags.map(tagKey));
  const matches = availableTags
    .filter((tag) => !selected.has(tagKey(tag.slug)))
    .filter((tag) => {
      if (!query) {
        return true;
      }
      return tagKey(tag.label).includes(query) || tagKey(tag.slug).includes(query);
    })
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
    matches.push({
      key: `create:${tagKey(cleanedInput)}`,
      label: cleanedInput,
      detail: "Create tag",
      create: true,
    });
  }
  return matches;
}

export function TagEditor({
  itemCount,
  mode,
  initialTags,
  availableTags,
  saving,
  error,
  onApply,
  onCancel,
}: TagEditorProps) {
  const [tags, setTags] = useState(() => uniqueTags(initialTags));
  const [input, setInput] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestions = useMemo(
    () => suggestionsFor(input, availableTags, tags),
    [availableTags, input, tags],
  );
  const activeSuggestion = suggestions[Math.min(activeIndex, Math.max(suggestions.length - 1, 0))];
  const isBatch = mode === "add";

  const canonicalTag = (value: string) => {
    const cleaned = cleanTagInput(value);
    return availableTags.find(
      (tag) => tagKey(tag.label) === tagKey(cleaned) || tagKey(tag.slug) === tagKey(cleaned),
    )?.label ?? cleaned;
  };

  const addTag = (value: string) => {
    const cleaned = canonicalTag(value);
    if (!cleaned) {
      return;
    }
    setTags((current) => uniqueTags([...current, cleaned]));
    setInput("");
    setActiveIndex(0);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  };

  const apply = () => {
    const cleanedInput = canonicalTag(input);
    onApply(uniqueTags(cleanedInput ? [...tags, cleanedInput] : tags));
  };

  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      apply();
      return;
    }
    switch (event.key) {
      case "ArrowDown":
        if (suggestions.length > 0) {
          event.preventDefault();
          setActiveIndex((current) => (current + 1) % suggestions.length);
        }
        break;
      case "ArrowUp":
        if (suggestions.length > 0) {
          event.preventDefault();
          setActiveIndex((current) => (current - 1 + suggestions.length) % suggestions.length);
        }
        break;
      case "Enter":
        event.preventDefault();
        if (activeSuggestion) {
          addTag(activeSuggestion.label);
        } else {
          addTag(input);
        }
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
          setTags((current) => current.slice(0, -1));
        }
        break;
      case "Escape":
        event.preventDefault();
        onCancel();
        break;
    }
  };

  return (
    <div className="tag-editor-backdrop" role="dialog" aria-modal="true" aria-label={isBatch ? "Add tags" : "Edit tags"}>
      <UiPaper
        component="form"
        className="tag-editor-panel"
        onSubmit={(event) => {
          event.preventDefault();
          apply();
        }}
      >
        <header className="tag-editor-header">
          <div>
            <strong>{isBatch ? `Add tags to ${itemCount} clips` : "Tags"}</strong>
            <span>{isBatch ? "Existing tags will be kept." : "Add, create, or remove tags."}</span>
          </div>
          <UiIconButton type="button" variant="subtle" aria-label="Cancel tag editing" onClick={onCancel}>
            <X size={16} strokeWidth={2.3} aria-hidden="true" />
          </UiIconButton>
        </header>

        <div className="tag-editor-combobox">
          <div className="tag-editor-chips" aria-label={isBatch ? "Tags to add" : "Selected tags"}>
            {tags.map((tag) => (
              <button
                key={tagKey(tag)}
                type="button"
                className="tag-editor-chip"
                aria-label={`Remove tag ${tag}`}
                onClick={() => setTags((current) => current.filter((candidate) => tagKey(candidate) !== tagKey(tag)))}
              >
                <span>#{tag}</span>
                <X size={12} strokeWidth={2.4} aria-hidden="true" />
              </button>
            ))}
            <UiTextInput
              ref={inputRef}
              autoFocus
              className="tag-editor-input"
              aria-label="Tag"
              aria-autocomplete="list"
              aria-controls="tag-editor-suggestions"
              aria-expanded={suggestions.length > 0}
              aria-activedescendant={activeSuggestion ? `tag-editor-suggestion-${activeSuggestion.key}` : undefined}
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
            <div id="tag-editor-suggestions" className="tag-editor-suggestions" role="listbox" aria-label="Tag suggestions">
              {suggestions.map((suggestion, index) => (
                <button
                  key={suggestion.key}
                  id={`tag-editor-suggestion-${suggestion.key}`}
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

        {error ? <p className="tag-editor-error" role="alert">{error}</p> : null}

        <footer className="tag-editor-footer">
          <span><UiKbd>Enter</UiKbd> add · <UiKbd>Ctrl Enter</UiKbd> apply</span>
          <div>
            <UiButton type="button" variant="default" onClick={onCancel}>Cancel</UiButton>
            <UiButton
              type="submit"
              variant="filled"
              loading={saving}
              disabled={isBatch && tags.length === 0 && !cleanTagInput(input)}
            >
              {isBatch ? "Add tags" : "Apply tags"}
            </UiButton>
          </div>
        </footer>
      </UiPaper>
    </div>
  );
}
