const STRUCTURED_FILTER_KEYS = new Set([
  "tag", "tags", "kind", "type", "is", "mime", "has", "meta", "metadata", "title", "note", "notes", "ctx", "context", "app", "program", "process", "window", "domain", "site", "source", "format", "fmt", "after", "since", "before", "until", "on",
]);

export type SearchSuggestion = { label: string; replacement: string };

const OPERATOR_SUGGESTIONS = [
  "tag:", "kind:", "is:", "mime:", "has:", "meta:", "title:", "notes:",
  "ctx:", "app:", "window:", "domain:", "source:", "format:", "after:",
  "before:", "on:",
];

const CLOSED_VALUES: Record<string, string[]> = {
  kind: ["text", "image", "html", "file", "unknown"],
  is: ["marked", "checked", "unmarked", "unchecked"],
  has: ["text", "title", "notes", "tags", "metadata", "mime", "blob", "image"],
  after: ["today", "yesterday", "7d"],
  before: ["today", "yesterday", "7d"],
  on: ["today", "yesterday", "7d"],
};

const VALUE_KEY_ALIASES: Record<string, string> = {
  type: "kind",
  since: "after",
  until: "before",
};

function activeToken(query: string) {
  return query.slice(query.lastIndexOf(" ") + 1);
}

function matchingTags(prefix: string, tags: string[], replacement: (tag: string) => string) {
  const normalizedPrefix = prefix.toLocaleLowerCase();
  return [...new Set(tags)]
    .filter((tag) => tag.toLocaleLowerCase().startsWith(normalizedPrefix))
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
      .filter((operator) => operator.startsWith(prefix))
      .map((operator) => ({ label: `${negated}${operator}`, replacement: `${negated}${operator}` }));
  }

  const key = rawToken.slice(0, separator).toLocaleLowerCase();
  const value = rawToken.slice(separator + 1);
  if (key === "tag" || key === "tags") {
    return matchingTags(value, tags, (tag) => `${negated}tag:${tag}`);
  }

  const canonicalKey = VALUE_KEY_ALIASES[key] ?? key;
  return (CLOSED_VALUES[canonicalKey] ?? [])
    .filter((item) => item.startsWith(value.toLocaleLowerCase()))
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
export function usesStructuredSearchSyntax(query: string) { return tokenizeSearchQuery(query).some((token) => { const negated = token.startsWith("-") && token.length > 1; const rawToken = negated ? token.slice(1) : token; if (negated || rawToken.startsWith("#")) return true; const separator = rawToken.indexOf(":"); return separator > 0 && separator < rawToken.length - 1 && STRUCTURED_FILTER_KEYS.has(rawToken.slice(0, separator).toLocaleLowerCase()); }); }
