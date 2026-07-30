import X from "lucide-react/dist/esm/icons/x.mjs";
import {
  forwardRef,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import type { ScenarioProperties, TagSummary } from "../shared/contracts";
import {
  UiButton,
  UiIconButton,
  UiKbd,
  UiPaper,
  UiTextInput,
  UiTextarea,
} from "./controls";

export type TagEditorMode = "replace" | "patch";

type TagEditorProps = {
  itemCount: number;
  mode: TagEditorMode;
  initialTags: string[];
  availableTags: TagSummary[];
  saving: boolean;
  error: string | null;
  onApply: (tags: string[], removeTags: string[]) => void;
  onCancel: () => void;
};

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

type MetadataTextInputProps = {
  value: string;
  availableTags: TagSummary[];
  onChange: (value: string) => void;
};

type MetadataTagDraft = {
  start: number;
  end: number;
  query: string;
};

const METADATA_TOKEN_PATTERN = /(^|\s)(?:#([\p{L}\p{N}_/-]+)|(client|project|activity):(?:"((?:\\.|[^"\\])*)"|([^\s]+)))/giu;
const METADATA_PROPERTY_KEYS = ["client", "project", "activity"] as const;

type MetadataPropertyKey = (typeof METADATA_PROPERTY_KEYS)[number];

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

function uniquePropertyValues(values: string[]) {
  const seen = new Set<string>();
  return values.map((value) => value.trim()).filter((value) => {
    const key = value.toLocaleLowerCase();
    if (!key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function formatPropertyValue(value: string) {
  return /^[\p{L}\p{N}_./-]+$/u.test(value) ? value : JSON.stringify(value);
}

function parseQuotedPropertyValue(value: string) {
  try {
    return JSON.parse(`"${value}"`) as string;
  } catch {
    return value.replace(/\\(["\\])/g, "$1");
  }
}

export function formatMetadataText(
  notes: string | null | undefined,
  tags: string[],
  properties: ScenarioProperties = { client: [], project: [], activity: [] },
) {
  const tagTokens = uniqueTags(tags).map((tag) => `#${tagKey(tag)}`).filter((tag) => tag !== "#");
  const propertyTokens = METADATA_PROPERTY_KEYS.flatMap((key) =>
    uniquePropertyValues(properties[key]).map((value) => `${key}:${formatPropertyValue(value)}`),
  );
  return [[...tagTokens, ...propertyTokens].join(" "), notes?.trim() ?? ""].filter(Boolean).join("\n");
}

export function parseMetadataText(
  value: string,
  availableTags: TagSummary[],
  currentTags: string[] = [],
) {
  const knownTags = new Map<string, string>();
  for (const tag of availableTags) {
    knownTags.set(tagKey(tag.slug), tag.label);
    knownTags.set(tagKey(tag.label), tag.label);
  }
  for (const tag of currentTags) {
    knownTags.set(tagKey(tag), tag);
  }

  const tags: string[] = [];
  const properties: ScenarioProperties = { client: [], project: [], activity: [] };
  const notes = value.replace(
    METADATA_TOKEN_PATTERN,
    (
      match,
      prefix: string,
      tagToken: string | undefined,
      propertyKey: string | undefined,
      quotedValue: string | undefined,
      bareValue: string | undefined,
      offset: number,
      source: string,
    ) => {
      if (tagToken) {
        tags.push(knownTags.get(tagKey(tagToken)) ?? tagToken);
      } else if (propertyKey) {
        const key = propertyKey.toLocaleLowerCase() as MetadataPropertyKey;
        const propertyValue = quotedValue === undefined
          ? (bareValue ?? "")
          : parseQuotedPropertyValue(quotedValue);
        properties[key].push(propertyValue);
      }
      const next = source[offset + match.length] ?? "";
      return /[ \t]/.test(prefix) && /[ \t]/.test(next) ? "" : prefix;
    },
  ).trim();

  for (const key of METADATA_PROPERTY_KEYS) {
    properties[key] = uniquePropertyValues(properties[key]);
  }

  return { notes, tags: uniqueTags(tags), properties };
}

function metadataTagDraftAt(value: string, caret: number): MetadataTagDraft | null {
  const prefix = value.slice(0, caret);
  const match = /(?:^|\s)#([\p{L}\p{N}_/-]*)$/u.exec(prefix);
  if (!match) {
    return null;
  }
  return {
    start: caret - match[1].length - 1,
    end: caret,
    query: match[1],
  };
}

export const MetadataTextInput = forwardRef<HTMLTextAreaElement, MetadataTextInputProps>(
  function MetadataTextInput({ value, availableTags, onChange }, ref) {
    const localRef = useRef<HTMLTextAreaElement | null>(null);
    const suggestionListRef = useRef<HTMLDivElement | null>(null);
    const [caret, setCaret] = useState(0);
    const [activeIndex, setActiveIndex] = useState(0);
    const tagDraft = metadataTagDraftAt(value, caret);
    const suggestions = useMemo(() => {
      if (!tagDraft) {
        return [];
      }
      const query = tagKey(tagDraft.query);
      return availableTags
        .filter((tag) => !query || tagKey(tag.label).includes(query) || tagKey(tag.slug).includes(query))
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
        .slice(0, 6);
    }, [availableTags, tagDraft]);

    useEffect(() => {
      const selected = suggestionListRef.current?.querySelector<HTMLElement>(
        '[role="option"][aria-selected="true"]',
      );
      selected?.scrollIntoView({ block: "nearest" });
    }, [activeIndex, suggestions.length]);

    const setRefs = (node: HTMLTextAreaElement | null) => {
      localRef.current = node;
      if (typeof ref === "function") {
        ref(node);
      } else if (ref) {
        ref.current = node;
      }
    };

    const selectSuggestion = (tag: TagSummary) => {
      if (!tagDraft) {
        return;
      }
      const token = `#${tag.slug}`;
      const suffix = value.slice(tagDraft.end);
      const committedToken = `${token}${/^\s/.test(suffix) ? "" : " "}`;
      const nextValue = `${value.slice(0, tagDraft.start)}${committedToken}${suffix}`;
      const nextCaret = tagDraft.start + committedToken.length;
      onChange(nextValue);
      setCaret(nextCaret);
      setActiveIndex(0);
      window.requestAnimationFrame(() => {
        localRef.current?.focus();
        localRef.current?.setSelectionRange(nextCaret, nextCaret);
      });
    };

    const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        return;
      }
      if (!tagDraft || suggestions.length === 0) {
        return;
      }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const direction = event.key === "ArrowDown" ? 1 : -1;
        setActiveIndex((current) => (current + direction + suggestions.length) % suggestions.length);
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        selectSuggestion(suggestions[Math.min(activeIndex, suggestions.length - 1)]);
      }
    };

    return (
      <div className="metadata-text-editor">
        <UiTextarea
          ref={setRefs}
          autoFocus
          autosize
          minRows={4}
          maxRows={9}
          aria-label="Metadata"
          aria-autocomplete="list"
          aria-controls="metadata-tag-suggestions"
          aria-expanded={suggestions.length > 0}
          value={value}
          placeholder="Write a note; add #tags or client:value anywhere…"
          onChange={(event) => {
            onChange(event.currentTarget.value);
            setCaret(event.currentTarget.selectionStart);
            setActiveIndex(0);
          }}
          onSelect={(event) => setCaret(event.currentTarget.selectionStart)}
          onKeyDown={handleKeyDown}
        />
        {suggestions.length > 0 ? (
          <div
            ref={suggestionListRef}
            id="metadata-tag-suggestions"
            className="tag-editor-suggestions metadata-text-suggestions"
            role="listbox"
            aria-label="Tag suggestions"
          >
            {suggestions.map((tag, index) => (
              <button
                key={tag.id}
                type="button"
                className="tag-editor-suggestion"
                role="option"
                aria-selected={index === Math.min(activeIndex, suggestions.length - 1)}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => selectSuggestion(tag)}
              >
                <span>#{tag.slug}</span>
                <small>{tag.itemCount} {tag.itemCount === 1 ? "clip" : "clips"}</small>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    );
  },
);

function suggestionsFor(
  input: string,
  availableTags: TagSummary[],
  selectedTags: string[],
): TagSuggestion[] {
  const query = tagKey(input);
  if (!query) {
    return [];
  }
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
    matches.push({
      key: `create:${tagKey(cleanedInput)}`,
      label: cleanedInput,
      detail: "Create tag",
      create: true,
    });
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
  const suggestions = useMemo(
    () => suggestionsFor(input, availableTags, tags),
    [availableTags, input, tags],
  );
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
    if (!cleaned) {
      return;
    }
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
  const [removeTags, setRemoveTags] = useState<string[]>([]);
  const isBatch = mode === "patch";
  const updateTags = (nextTags: string[]) => {
    const nextKeys = new Set(nextTags.map(tagKey));
    setTags(nextTags);
    setRemoveTags((current) => current.filter((tag) => !nextKeys.has(tagKey(tag))));
  };
  const updateRemoveTags = (nextTags: string[]) => {
    const nextKeys = new Set(nextTags.map(tagKey));
    setRemoveTags(nextTags);
    setTags((current) => current.filter((tag) => !nextKeys.has(tagKey(tag))));
  };

  return (
    <div className="tag-editor-backdrop" role="dialog" aria-modal="true" aria-label={isBatch ? "Edit tags for selection" : "Edit tags"}>
      <UiPaper
        component="form"
        className="tag-editor-panel"
        onSubmit={(event) => {
          event.preventDefault();
          onApply(tags, removeTags);
        }}
      >
        <header className="tag-editor-header">
          <div>
            <strong>{isBatch ? `Edit tags for ${itemCount} clips` : "Edit tags"}</strong>
            <span>{isBatch ? "Add and remove only the tags you choose." : "Add, create, or remove tags."}</span>
          </div>
          <UiIconButton type="button" variant="subtle" aria-label="Cancel tag editing" onClick={onCancel}>
            <X size={16} strokeWidth={2.3} aria-hidden="true" />
          </UiIconButton>
        </header>

        {isBatch ? (
          <div className="tag-editor-patch-fields">
            <label className="tag-editor-section">
              <strong>Add tags</strong>
              <TagInput
                tags={tags}
                availableTags={availableTags}
                ariaLabel="Tags to add"
                inputAriaLabel="Tag to add"
                idPrefix="tag-add"
                autoFocus
                onChange={updateTags}
                onApply={(nextTags) => onApply(nextTags, removeTags)}
                onCancel={onCancel}
              />
            </label>
            <label className="tag-editor-section">
              <strong>Remove tags</strong>
              <TagInput
                tags={removeTags}
                availableTags={availableTags}
                ariaLabel="Tags to remove"
                inputAriaLabel="Tag to remove"
                idPrefix="tag-remove"
                onChange={updateRemoveTags}
                onApply={(nextRemoveTags) => onApply(tags, nextRemoveTags)}
                onCancel={onCancel}
              />
            </label>
          </div>
        ) : (
          <TagInput
            tags={tags}
            availableTags={availableTags}
            ariaLabel="Selected tags"
            autoFocus
            onChange={setTags}
            onApply={(nextTags) => onApply(nextTags, [])}
            onCancel={onCancel}
          />
        )}

        {error ? <p className="tag-editor-error" role="alert">{error}</p> : null}

        <footer className="tag-editor-footer">
          <span><UiKbd>Enter</UiKbd> add · <UiKbd>Ctrl+Enter</UiKbd> apply</span>
          <div>
            <UiButton type="button" variant="default" onClick={onCancel}>Cancel</UiButton>
            <UiButton
              type="submit"
              variant="filled"
              loading={saving}
              disabled={isBatch && tags.length === 0 && removeTags.length === 0}
            >
              Apply tag changes
            </UiButton>
          </div>
        </footer>
      </UiPaper>
    </div>
  );
}
