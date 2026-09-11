import type { SearchScope } from "./settings";
import {
  parseSearchScopeModifier,
  scopeQuery,
  scopeOptions,
  scopeSummary,
  setSearchScopeEnabled,
  sameSearchScopeSelection,
  type SearchScopeSelection,
} from "./searchScopes.ts";

export function scenarioCommandSearch(query: string) {
  const match = query.trim().match(/^>\s*(?:escenario|scenario)(?:\s+(.*))?$/i);
  return match ? (match[1] ?? "").trim() : null;
}

// Matches storage::normalize_tag_label without migrating Unicode identities.
export function tagKey(value: string): string {
  return value.replace(/^\p{White_Space}+|\p{White_Space}+$/gu, "").replace(/^#+/, "").replace(/^\p{White_Space}+|\p{White_Space}+$/gu, "")
    .replace(/[A-Z]/g, (letter) => letter.toLowerCase())
    .replace(/[^\p{Alphabetic}\p{N}_/\p{White_Space}-]/gu, "")
    .replace(/\p{White_Space}+/gu, "-")
    .split("-").filter(Boolean).join("-");
}

const STRUCTURED_FILTER_KEYS = new Set([
  "tag", "tags", "kind", "type", "is", "mime", "has", "in", "meta", "metadata", "title", "note", "notes", "ctx", "context", "app", "program", "process", "window", "domain", "site", "source", "format", "fmt", "after", "since", "before", "until", "on",
]);

export type SearchSuggestion = {
  label: string;
  replacement: string;
  scope?: {
    state: "included" | "inherited" | "excluded" | "available" | "partial";
    detail: string;
    actionLabel: string;
    summary: string;
  };
  scopeSelection?: SearchScopeSelection;
  completionRange?: {
    from: number;
    to: number;
  };
};

export type StructuredSearchDraftKind = "plain" | "complete" | "incomplete" | "invalid";

export type StructuredSearchDraftClassification = {
  kind: StructuredSearchDraftKind;
  token: string | null;
  operator: string | null;
  message: string | null;
  /** True when the draft contains a supported structured token. */
  structured: boolean;
};

export type StructuredSearchTriggerMode = "realtime" | "enter";

export type StructuredSearchHoldOptions = {
  draftChanged: boolean;
  searchTriggerMode: StructuredSearchTriggerMode;
  deferStructuredSearchUntilEnter: boolean;
};

type DraftToken = {
  value: string;
  hasUnclosedQuote: boolean;
};

export type SearchTokenRange = {
  from: number;
  to: number;
  value: string;
  prefix: string;
  suffix: string;
};
export type SearchSelection = {
  anchor: number;
  head: number;
};

export function searchTokenAt(query: string, cursor = query.length): SearchTokenRange {
  const position = Math.min(Math.max(cursor, 0), query.length);
  const ranges: Array<{ from: number; to: number }> = [];
  let start = -1;
  let inQuote = false;
  let escaped = false;

  for (let index = 0; index < query.length; index += 1) {
    const char = query[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\" && inQuote) {
      escaped = true;
      continue;
    }
    if (char === '"') {
      if (start === -1) start = index;
      inQuote = !inQuote;
      continue;
    }
    if (!inQuote && /\s/.test(char)) {
      if (start !== -1) {
        ranges.push({ from: start, to: index });
        start = -1;
      }
      continue;
    }
    if (start === -1) start = index;
  }
  if (start !== -1) ranges.push({ from: start, to: query.length });

  const range = ranges.find(({ from, to }) => position >= from && position <= to);
  if (!range) {
    return { from: position, to: position, value: "", prefix: "", suffix: "" };
  }
  return {
    from: range.from,
    to: range.to,
    value: query.slice(range.from, range.to),
    prefix: query.slice(range.from, position),
    suffix: query.slice(position, range.to),
  };
}


const OPERATOR_SUGGESTIONS = [
  "in:", "tag:", "kind:", "is:", "mime:", "has:", "meta:", "title:", "notes:",
  "ctx:", "app:", "window:", "domain:", "source:", "format:", "after:",
  "before:", "on:",
];

const CLOSED_VALUES: Record<string, string[]> = {
  kind: ["text", "image", "html", "file", "file-list", "unknown"],
  is: ["marked", "checked", "unmarked", "unchecked", "inbox", "not-inbox", "not_inbox"],
  has: ["text", "title", "note", "notes", "tag", "tags", "metadata", "meta", "mime", "blob", "file", "image"],
  after: ["today", "yesterday", "7d"],
  before: ["today", "yesterday", "7d"],
  on: ["today", "yesterday", "7d"],
};
const MIN_I64 = -(1n << 63n);
const MAX_I64 = (1n << 63n) - 1n;
const DECIMAL_I64_PATTERN = /^[+-]?\d+$/;

const VALUE_KEY_ALIASES: Record<string, string> = {
  type: "kind",
  since: "after",
  until: "before",
};

const DATE_FILTER_KEYS = new Set(["after", "since", "before", "until", "on"]);
const NON_NEGATABLE_FILTER_KEYS = new Set(["in", "source", "format", "fmt"]);
function isI64Integer(value: string) {
  if (!DECIMAL_I64_PATTERN.test(value)) {
    return false;
  }
  try {
    const parsed = BigInt(value);
    return parsed >= MIN_I64 && parsed <= MAX_I64;
  } catch {
    return false;
  }
}

function safeInteger(value: string) {
  if (!isI64Integer(value)) {
    return null;
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function isLeapYear(year: number) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function isValidYmd(year: number, month: number, day: number) {
  if (!Number.isSafeInteger(year) || month < 1 || month > 12) {
    return false;
  }
  const monthLengths = [
    31,
    isLeapYear(year) ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];
  return day >= 1 && day <= monthLengths[month - 1];
}

function isValidDateFilterValue(value: string) {
  const normalized = value.replace(/^"|"$/g, "").trim();
  const relative = normalized.toLocaleLowerCase();
  if (relative === "today" || relative === "yesterday") {
    return true;
  }
  if (relative.endsWith("d") && isI64Integer(relative.slice(0, -1))) {
    return true;
  }

  const dateMatch = /^(?<year>\d+)-(?<month>\d+)-(?<day>\d+)$/.exec(normalized);
  if (dateMatch?.groups) {
    const year = safeInteger(dateMatch.groups.year);
    const month = safeInteger(dateMatch.groups.month);
    const day = safeInteger(dateMatch.groups.day);
    return year !== null && month !== null && day !== null && isValidYmd(year, month, day);
  }

  const dateTimeMatch = /^(?<year>\d+)-(?<month>\d+)-(?<day>\d+)T(?<hour>\d+)(?::(?<minute>\d+))?(?::(?<second>\d+)(?:\.(?<fraction>\d+))?)?(?:(?<zone>Z|z)|(?<offsetSign>[+-])(?<offsetHour>\d+):(?<offsetMinute>\d+))?$/.exec(normalized);
  if (!dateTimeMatch?.groups) {
    return false;
  }
  const year = safeInteger(dateTimeMatch.groups.year);
  const month = safeInteger(dateTimeMatch.groups.month);
  const day = safeInteger(dateTimeMatch.groups.day);
  const hour = safeInteger(dateTimeMatch.groups.hour);
  const minute = safeInteger(dateTimeMatch.groups.minute ?? "0");
  const second = safeInteger(dateTimeMatch.groups.second ?? "0");
  const offsetHour = dateTimeMatch.groups.offsetHour
    ? safeInteger(dateTimeMatch.groups.offsetHour)
    : 0;
  const offsetMinute = dateTimeMatch.groups.offsetMinute
    ? safeInteger(dateTimeMatch.groups.offsetMinute)
    : 0;
  return year !== null
    && month !== null
    && day !== null
    && hour !== null
    && minute !== null
    && second !== null
    && offsetHour !== null
    && offsetMinute !== null
    && isValidYmd(year, month, day)
    && hour >= 0
    && hour <= 23
    && minute >= 0
    && minute <= 59
    && second >= 0
    && second <= 59
    && offsetHour >= 0
    && offsetHour <= 23
    && offsetMinute >= 0
    && offsetMinute <= 59;
}


function normalizeTokenValue(value: string) {
  // Keep this in lockstep with storage::search::tokenize_query: quotes group
  // and disappear, while backslashes escape only inside quoted values.
  let normalized = "";
  let inQuote = false;
  let escaped = false;
  for (const char of value) {
    if (escaped) {
      normalized += char;
      escaped = false;
      continue;
    }
    if (char === "\\" && inQuote) {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inQuote = !inQuote;
      continue;
    }
    normalized += char;
  }
  return normalized;
}

function draftTokens(query: string): DraftToken[] {
  const tokens: DraftToken[] = [];
  let start = -1;
  let inQuote = false;
  let escaped = false;

  for (let index = 0; index < query.length; index += 1) {
    const char = query[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\" && inQuote) {
      escaped = true;
      continue;
    }
    if (char === '"') {
      if (start === -1) {
        start = index;
      }
      inQuote = !inQuote;
      continue;
    }
    if (/\s/.test(char) && !inQuote) {
      if (start !== -1) {
        tokens.push({ value: query.slice(start, index), hasUnclosedQuote: false });
        start = -1;
      }
      continue;
    }
    if (start === -1) {
      start = index;
    }
  }

  if (start !== -1) {
    tokens.push({ value: query.slice(start), hasUnclosedQuote: inQuote });
  }

  return tokens;
}

function structuredDraftMessage(
  kind: Exclude<StructuredSearchDraftKind, "plain" | "complete">,
  token: string,
  operator: string | null,
  hasUnclosedQuote = false,
) {
  if (kind === "incomplete" && hasUnclosedQuote) {
    return "Close the quoted search value before applying.";
  }
  if (kind === "incomplete") {
    if (operator === "#" || operator === "tag" || operator === "tags") {
      return `Choose or type a tag after \`${operator === "#" ? "#" : `${operator}:`}\`.`;
    }
    return `Choose or type a value after \`${operator ?? "the operator"}:\`.`;
  }
  return `\`${token}\` is not a supported ${operator ?? "structured"} filter.`;
}

/**
 * Classify the current draft without becoming the semantic authority for
 * search. Rust still validates every request; this helper only decides if the
 * renderer should hold the applied snapshot and which feedback to show.
 */
export function classifyStructuredSearchDraft(
  query: string,
): StructuredSearchDraftClassification {
  const trimmed = query.trim();
  if (trimmed.startsWith("re:")) {
    const pattern = trimmed.slice(3).trim();
    return pattern
      ? { kind: "complete", token: null, operator: "re", message: null, structured: true }
      : {
          kind: "incomplete",
          token: "re:",
          operator: "re",
          message: "Add a regular expression after `re:`.",
          structured: true,
        };
  }

  const tokens = draftTokens(query);
  if (tokens.length === 0) {
    return { kind: "plain", token: null, operator: null, message: null, structured: false };
  }

  let structured = false;
  let incompleteToken: string | null = null;
  let incompleteOperator: string | null = null;
  let incompleteHasUnclosedQuote = false;
  let invalidToken: string | null = null;
  let invalidOperator: string | null = null;

  for (const token of tokens) {
    const normalizedToken = normalizeTokenValue(token.value);
    const negated = normalizedToken.startsWith("-") && normalizedToken.length > 1;
    const rawToken = negated ? normalizedToken.slice(1) : normalizedToken;
    if (negated) {
      structured = true;
    }
    if (rawToken.startsWith("#")) {
      structured = true;
      const value = rawToken.slice(1).trim();
      const normalizedValue = value.trim();
      if (token.hasUnclosedQuote || !normalizedValue) {
        incompleteToken ??= token.value;
        incompleteOperator ??= "#";
        incompleteHasUnclosedQuote ||= token.hasUnclosedQuote;
      }
      continue;
    }

    const separator = rawToken.indexOf(":");
    if (separator <= 0) {
      if (token.hasUnclosedQuote) {
        structured = true;
        incompleteToken ??= token.value;
        incompleteHasUnclosedQuote ||= token.hasUnclosedQuote;
      }
      continue;
    }

    const operator = rawToken.slice(0, separator).toLocaleLowerCase();
    if (!STRUCTURED_FILTER_KEYS.has(operator)) {
      if (token.hasUnclosedQuote) {
        structured = true;
        incompleteToken ??= token.value;
        incompleteHasUnclosedQuote ||= token.hasUnclosedQuote;
      }
      continue;
    }
    structured = true;
    const value = rawToken.slice(separator + 1).trim();
    const normalizedValue = value.trim();
    if (token.hasUnclosedQuote || !normalizedValue || (operator === "in" && normalizedValue.endsWith(","))) {
      incompleteToken ??= token.value;
      incompleteOperator ??= operator;
      incompleteHasUnclosedQuote ||= token.hasUnclosedQuote;
      continue;
    }

    const canonicalKey = VALUE_KEY_ALIASES[operator] ?? operator;
    const values = normalizedValue.split(",").map((part) => part.trim()).filter(Boolean);
    const closedValues = ["kind", "is", "has"].includes(canonicalKey)
      ? CLOSED_VALUES[canonicalKey]
      : undefined;
    const invalidDateFilter = DATE_FILTER_KEYS.has(operator)
      && (
        negated
        || values.length !== 1
        || !isValidDateFilterValue(values[0])
      );
    const invalidNegatedFilter = negated && NON_NEGATABLE_FILTER_KEYS.has(operator);
    const invalidSearchScope = canonicalKey === "in"
      && (negated || parseSearchScopeModifier(normalizedValue) === null);
    if (
      values.length === 0
      || invalidDateFilter
      || invalidNegatedFilter
      || invalidSearchScope
      || (closedValues && (!values.length || values.some((part) => !closedValues.includes(part.toLocaleLowerCase()))))
    ) {
      invalidToken ??= token.value;
      invalidOperator ??= operator;
    }
  }

  if (incompleteToken) {
    return {
      kind: "incomplete",
      token: incompleteToken,
      operator: incompleteOperator,
      message: structuredDraftMessage(
        "incomplete",
        incompleteToken,
        incompleteOperator,
        incompleteHasUnclosedQuote,
      ),
      structured,
    };
  }
  if (invalidToken) {
    return {
      kind: "invalid",
      token: invalidToken,
      operator: invalidOperator,
      message: structuredDraftMessage("invalid", invalidToken, invalidOperator),
      structured,
    };
  }
  if (!structured) {
    return { kind: "plain", token: null, operator: null, message: null, structured: false };
  }

  return { kind: "complete", token: null, operator: null, message: null, structured: true };
}

export function shouldHoldStructuredSearchDraft(
  classification: StructuredSearchDraftClassification,
  options: StructuredSearchHoldOptions,
) {
  if (!options.draftChanged) {
    return false;
  }
  return classification.kind === "incomplete"
    || classification.kind === "invalid"
    || (
      options.searchTriggerMode === "realtime"
      && options.deferStructuredSearchUntilEnter
      && classification.kind === "complete"
    );
}

function matchingTags(prefix: string, tags: string[], replacement: (tag: string) => string) {
  const normalizedPrefix = tagKey(prefix);
  return [...new Set(tags)]
    .filter((tag) => {
      const normalizedTag = tagKey(tag);
      return normalizedTag.startsWith(normalizedPrefix) && normalizedTag !== normalizedPrefix;
    })
    .slice(0, 8)
    .map((tag) => ({ label: replacement(tag), replacement: replacement(tag) }));
}

function searchValueSegmentAt(query: string, valueFrom: number, valueTo: number, cursor: number) {
  let segmentFrom = valueFrom;
  let segmentTo = valueTo;
  let inQuote = false;
  let escaped = false;
  const position = Math.min(Math.max(cursor, valueFrom), valueTo);
  for (let index = valueFrom; index < valueTo; index += 1) {
    const char = query[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\" && inQuote) {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inQuote = !inQuote;
      continue;
    }
    if (char !== "," || inQuote) {
      continue;
    }
    if (index < position) {
      segmentFrom = index + 1;
    } else {
      segmentTo = index;
      break;
    }
  }
  return { from: segmentFrom, to: segmentTo };
}
function searchValueCompletionAt(
  query: string,
  range: { from: number; to: number },
  cursor: number,
) {
  const position = Math.min(Math.max(cursor, range.from), range.to);
  let quoteStart = -1;
  let inQuote = false;
  let escaped = false;
  for (let index = range.from; index < position; index += 1) {
    const char = query[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\" && inQuote) {
      escaped = true;
      continue;
    }
    if (char === '"') {
      if (!inQuote && quoteStart === -1) quoteStart = index;
      inQuote = !inQuote;
    }
  }
  return {
    prefix: normalizeTokenValue(query.slice(range.from, position)),
    quoted: inQuote && quoteStart >= range.from && query.slice(range.from, quoteStart).trim() === "",
  };
}

function formatSearchCompletionValue(value: string, quoted: boolean) {
  return quoted ? `"${value.replace(/["\\]/g, "\\$&")}"` : value;
}

function scopeAutocompleteSuggestions(
  query: string,
  value: string,
  activeScope: SearchScopeSelection,
  cursor: number,
): SearchSuggestion[] {
  const tokenRange = searchTokenAt(query, cursor);
  const completionRange = { from: tokenRange.from, to: tokenRange.to };
  const rawParts = value.split(",");
  const rawSuffix = rawParts.pop() ?? "";
  const negative = rawSuffix.startsWith("-");
  const suffix = (negative ? rawSuffix.slice(1) : rawSuffix).toLocaleLowerCase();
  const committedText = rawParts.join(",");
  const committed = committedText
    ? parseSearchScopeModifier(committedText)
    : activeScope;
  if (!committed) return [];
  if (parseSearchScopeModifier(value)) return [];
  const visibleSelection = committed;
  const suggestions: SearchSuggestion[] = [];
  if (!negative && "all".startsWith(suffix)) {
    const allSelection: SearchScopeSelection = { included: ["all"], excluded: [] };
    suggestions.push({
      label: "All fields",
      replacement: "in:all",
      scope: {
        state: committed.included.includes("all") ? "included" : "available",
        detail: "All searchable fields",
        actionLabel: "Search all fields",
        summary: scopeSummary(visibleSelection),
      },
      scopeSelection: allSelection,
      completionRange,
    });
  }
  suggestions.push(
    ...scopeOptions(visibleSelection)
      .filter((option) => option.scope.startsWith(suffix))
      .map<SearchSuggestion>((option) => {
        const nextSelection = setSearchScopeEnabled(committed, option.scope, !negative);
        const replacement = scopeQuery(nextSelection, { includeAll: true });
        const actionLabel = negative ? `Exclude ${option.label}`
          : sameSearchScopeSelection(nextSelection, committed) ? "Included" : "Add";
        return {
          label: option.label,
          replacement,
          scope: {
            state: option.state,
            detail: option.detail,
            actionLabel,
            summary: scopeSummary(visibleSelection),
          },
          scopeSelection: nextSelection,
          completionRange,
        };
      }),
  );
  return suggestions;
}

export function searchSuggestions(
  query: string,
  tags: string[],
  activeScope: SearchScopeSelection = { included: ["all"], excluded: [] },
  cursor = query.length,
  selection?: SearchSelection,
): SearchSuggestion[] {
  if (query.trimStart().startsWith("re:")) return [];

  const hasSelection = selection !== undefined && selection.anchor !== selection.head;
  const selectionFrom = hasSelection
    ? Math.max(0, Math.min(query.length, Math.min(selection.anchor, selection.head)))
    : cursor;
  const selectionTo = hasSelection
    ? Math.max(0, Math.min(query.length, Math.max(selection.anchor, selection.head)))
    : cursor;
  const completionCursor = hasSelection ? selectionFrom : cursor;
  const tokenRange = searchTokenAt(query, completionCursor);
  if (
    hasSelection
    && (selectionFrom < tokenRange.from || selectionTo > tokenRange.to)
  ) {
    return [];
  }
  const token = tokenRange.prefix;
  if (!token) return [];

  const negated = token.startsWith("-") ? "-" : "";
  const rawToken = negated ? token.slice(1) : token;
  if (rawToken.startsWith("#")) {
    return matchingTags(rawToken.slice(1), tags, (tag) => `${negated}#${tag}`)
      .map((suggestion) => ({
        ...suggestion,
        completionRange: { from: tokenRange.from, to: tokenRange.to },
      }));
  }

  const separator = rawToken.indexOf(":");
  if (separator === -1) {
    const prefix = rawToken.toLocaleLowerCase();
    return OPERATOR_SUGGESTIONS
      .filter((operator) => !negated || !NON_NEGATABLE_FILTER_KEYS.has(operator.slice(0, -1)))
      .filter((operator) => !negated || !DATE_FILTER_KEYS.has(operator.slice(0, -1)))
      .filter((operator) => operator.startsWith(prefix))
      .map((operator) => ({
        label: `${negated}${operator}`,
        replacement: `${negated}${operator}`,
        completionRange: { from: tokenRange.from, to: tokenRange.to },
      }));
  }

  const key = rawToken.slice(0, separator).toLocaleLowerCase();
  const valueStart = tokenRange.from + (negated ? 1 : 0) + separator + 1;
  const activeValueRange = searchValueSegmentAt(query, valueStart, tokenRange.to, completionCursor);
  const activeValueFrom = activeValueRange.from;
  const activeValueTo = activeValueRange.to;
  const value = query.slice(valueStart, completionCursor);
  const activeValue = searchValueCompletionAt(query, activeValueRange, completionCursor);
  if (key === "tag" || key === "tags") {
    const tagSuggestions = matchingTags(activeValue.prefix, tags, (tag) => tag);
    if (activeValueFrom > valueStart) {
      return tagSuggestions.map((suggestion) => {
        const replacement = formatSearchCompletionValue(suggestion.replacement, activeValue.quoted);
        return {
          label: `${negated}${key}:${replacement}`,
          replacement,
          completionRange: { from: activeValueFrom, to: activeValueTo },
        };
      });
    }
    return tagSuggestions.map((suggestion) => {
      const replacement = formatSearchCompletionValue(suggestion.replacement, activeValue.quoted);
      const fullReplacement = `${negated}${key}:${replacement}`;
      return {
        label: fullReplacement,
        replacement: fullReplacement,
        completionRange: { from: tokenRange.from, to: activeValueTo },
      };
    });
  }
  if (key === "in" && !negated) {
    return scopeAutocompleteSuggestions(query, value, activeScope, completionCursor);
  }

  const canonicalKey = VALUE_KEY_ALIASES[key] ?? key;
  if (negated && (DATE_FILTER_KEYS.has(key) || NON_NEGATABLE_FILTER_KEYS.has(key) || DATE_FILTER_KEYS.has(canonicalKey))) {
    return [];
  }
  const closedValues = CLOSED_VALUES[canonicalKey] ?? [];
  const normalizedValue = activeValue.prefix.toLocaleLowerCase();
  return closedValues
    .filter((item) => item.startsWith(normalizedValue) && item !== normalizedValue)
    .map((item) => {
      const renderedValue = formatSearchCompletionValue(item, activeValue.quoted);
      const fullReplacement = `${negated}${key}:${renderedValue}`;
      return activeValueFrom > valueStart
        ? {
            label: fullReplacement,
            replacement: renderedValue,
            completionRange: { from: activeValueFrom, to: activeValueTo },
          }
        : {
            label: fullReplacement,
            replacement: fullReplacement,
            completionRange: { from: tokenRange.from, to: activeValueTo },
          };
    });
}
export function replaceActiveSearchToken(query: string, replacement: string, cursor = query.length) {
  const range = searchTokenAt(query, cursor);
  return `${query.slice(0, range.from)}${replacement}${query.slice(range.to)}`;
}

function tokenizeSearchQuery(query: string) {
  const tokens: string[] = []; let current = ""; let inQuote = false; let escaped = false;
  for (const char of query) { if (escaped) { current += char; escaped = false; } else if (char === "\\" && inQuote) escaped = true; else if (char === '"') inQuote = !inQuote; else if (/\s/.test(char) && !inQuote) { if (current) { tokens.push(current); current = ""; } } else current += char; }
  if (current) tokens.push(current); return tokens;
}

export function positiveTagFilters(query: string) {
  const tags: string[] = [];
  const seen = new Set<string>();
  for (const token of tokenizeSearchQuery(query)) {
    if (token.startsWith("-")) continue;
    const separator = token.indexOf(":");
    const key = separator > 0 ? token.slice(0, separator).toLocaleLowerCase() : "";
    const value = token.startsWith("#")
      ? token.slice(1)
      : key === "tag" || key === "tags"
        ? token.slice(separator + 1)
        : "";
    const normalized = value.trim().replace(/^#/, "");
    const identity = tagKey(normalized);
    if (normalized && !seen.has(identity)) {
      seen.add(identity);
      tags.push(normalized);
    }
  }
  return tags;
}

export function usesStructuredSearchSyntax(query: string) {
  return classifyStructuredSearchDraft(query).structured;
}
