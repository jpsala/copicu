const STRUCTURED_FILTER_KEYS = new Set([
  "tag", "tags", "kind", "type", "is", "mime", "has", "meta", "metadata", "title", "note", "notes", "ctx", "context", "app", "program", "process", "window", "domain", "site", "source", "format", "fmt", "after", "since", "before", "until", "on",
]);

export type SearchSuggestion = { label: string; replacement: string };

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
  autocompleteActive?: boolean;
  autocompleteCommitted?: boolean;
};

type DraftToken = {
  value: string;
  hasUnclosedQuote: boolean;
};

const OPERATOR_SUGGESTIONS = [
  "tag:", "kind:", "is:", "mime:", "has:", "meta:", "title:", "notes:",
  "ctx:", "app:", "window:", "domain:", "source:", "format:", "after:",
  "before:", "on:",
];

const CLOSED_VALUES: Record<string, string[]> = {
  kind: ["text", "image", "html", "file", "file-list", "unknown"],
  is: ["marked", "checked", "unmarked", "unchecked"],
  has: ["text", "title", "note", "notes", "tag", "tags", "metadata", "meta", "mime", "blob", "file", "image"],
  after: ["today", "yesterday", "7d"],
  before: ["today", "yesterday", "7d"],
  on: ["today", "yesterday", "7d"],
};

const VALUE_KEY_ALIASES: Record<string, string> = {
  type: "kind",
  since: "after",
  until: "before",
};

const DATE_FILTER_KEYS = new Set(["after", "since", "before", "until", "on"]);
const NON_NEGATABLE_FILTER_KEYS = new Set(["source", "format", "fmt"]);
const MIN_I64 = -(1n << 63n);
const MAX_I64 = (1n << 63n) - 1n;
const DECIMAL_I64_PATTERN = /^[+-]?\d+$/;

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

function activeToken(query: string) {
  return query.slice(query.lastIndexOf(" ") + 1);
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
    if (token.hasUnclosedQuote || !normalizedValue) {
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
    if (
      values.length === 0
      || invalidDateFilter
      || invalidNegatedFilter
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
    || options.autocompleteActive === true
    || options.autocompleteCommitted === true
    || (
      options.searchTriggerMode === "realtime"
      && options.deferStructuredSearchUntilEnter
      && classification.kind === "complete"
    );
}

function matchingTags(prefix: string, tags: string[], replacement: (tag: string) => string) {
  const normalizedPrefix = prefix.toLocaleLowerCase();
  return [...new Set(tags)]
    .filter((tag) => {
      const normalizedTag = tag.toLocaleLowerCase();
      return normalizedTag.startsWith(normalizedPrefix) && normalizedTag !== normalizedPrefix;
    })
    .slice(0, 8)
    .map((tag) => ({ label: replacement(tag), replacement: replacement(tag) }));
}

export function searchSuggestions(query: string, tags: string[]): SearchSuggestion[] {
  const token = activeToken(query);
  if (!token) {
    return [];
  }

  const negated = token.startsWith("-") ? "-" : "";
  const rawToken = negated ? token.slice(1) : token;
  if (rawToken.startsWith("#")) {
    return matchingTags(rawToken.slice(1), tags, (tag) => `${negated}#${tag}`);
  }

  const separator = rawToken.indexOf(":");
  if (separator === -1) {
    const prefix = rawToken.toLocaleLowerCase();
    return OPERATOR_SUGGESTIONS
      .filter((operator) => !negated || !NON_NEGATABLE_FILTER_KEYS.has(operator.slice(0, -1)))
      .filter((operator) => !negated || !DATE_FILTER_KEYS.has(operator.slice(0, -1)))
      .filter((operator) => operator.startsWith(prefix))
      .map((operator) => ({ label: `${negated}${operator}`, replacement: `${negated}${operator}` }));
  }

  const key = rawToken.slice(0, separator).toLocaleLowerCase();
  const value = rawToken.slice(separator + 1);
  if (key === "tag" || key === "tags") {
    return matchingTags(value, tags, (tag) => `${negated}tag:${tag}`);
  }

  const canonicalKey = VALUE_KEY_ALIASES[key] ?? key;
  if (negated && (DATE_FILTER_KEYS.has(key) || NON_NEGATABLE_FILTER_KEYS.has(key) || DATE_FILTER_KEYS.has(canonicalKey))) {
    return [];
  }
  const normalizedValue = value.toLocaleLowerCase();
  return (CLOSED_VALUES[canonicalKey] ?? [])
    .filter((item) => item.startsWith(normalizedValue) && item !== normalizedValue)
    .map((item) => ({ label: `${negated}${key}:${item}`, replacement: `${negated}${key}:${item}` }));
}

export function replaceActiveSearchToken(query: string, replacement: string) {
  return `${query.slice(0, query.lastIndexOf(" ") + 1)}${replacement}`;
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
    const identity = normalized.toLocaleLowerCase();
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
