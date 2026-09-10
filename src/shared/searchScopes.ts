import type { SearchScope } from "./settings";

export type ExcludedSearchScope = Exclude<SearchScope, "all">;
export type SearchScopeSelection = {
  included: SearchScope[];
  excluded: ExcludedSearchScope[];
};

export type ScopeOptionState = "included" | "inherited" | "excluded" | "available" | "partial";
export type ScopeOption = {
  scope: ExcludedSearchScope;
  label: string;
  state: ScopeOptionState;
  detail: string;
  actionLabel: string;
  next: SearchScopeSelection;
};

const SEARCH_SCOPES: readonly ExcludedSearchScope[] = ["content", "metadata", "title", "notes", "tags", "context"];
const METADATA_CHILDREN: readonly ExcludedSearchScope[] = ["title", "notes", "tags"];
const SEARCH_SCOPE_SET = new Set<SearchScope>(["all", ...SEARCH_SCOPES]);
const SCOPE_LABELS: Record<ExcludedSearchScope, string> = {
  content: "Content",
  metadata: "Metadata",
  title: "Title",
  notes: "Notes",
  tags: "Tags",
  context: "Context",
};

function uniqueScopes(scopes: readonly SearchScope[]): SearchScope[] {
  return [...new Set(scopes)];
}

function uniqueExcluded(scopes: readonly ExcludedSearchScope[]): ExcludedSearchScope[] {
  return [...new Set(scopes)];
}

function normalizedSelection(selection: SearchScopeSelection): SearchScopeSelection {
  const included = uniqueScopes(selection.included).filter((scope) => SEARCH_SCOPE_SET.has(scope));
  const excluded = uniqueExcluded(selection.excluded.filter((scope): scope is ExcludedSearchScope => SEARCH_SCOPE_SET.has(scope)));
  if (included.includes("all")) return { included: ["all"], excluded };
  return { included, excluded };
}

/** Parse one `in:` value. Invalid modifiers return null rather than guessing. */
export function parseSearchScopeModifier(value: string): SearchScopeSelection | null {
  if (!value) return null;
  const pieces = value.split(",");
  if (pieces.some((piece) => !piece.trim())) return null;
  const included: SearchScope[] = [];
  const excluded: ExcludedSearchScope[] = [];
  for (const rawPiece of pieces) {
    const piece = rawPiece.trim().toLocaleLowerCase();
    const negated = piece.startsWith("-");
    const name = negated ? piece.slice(1) : piece;
    if (!name || !SEARCH_SCOPE_SET.has(name as SearchScope) || (negated && name === "all")) return null;
    if (negated) excluded.push(name as ExcludedSearchScope);
    else included.push(name as SearchScope);
  }
  if (included.includes("all") && included.length > 1) return null;
  return normalizedSelection({ included, excluded });
}

type ScopeTokenRange = { start: number; end: number; value: string };

function scopeTokenRanges(query: string): ScopeTokenRange[] {
  if (/^re:/iu.test(query.trimStart())) return [];
  const ranges: ScopeTokenRange[] = [];
  let tokenStart = 0;
  let inQuote = false;
  let escaped = false;
  const finish = (end: number) => {
    if (tokenStart >= end) return;
    const token = query.slice(tokenStart, end);
    const match = /^in:(.*)$/iu.exec(token);
    if (match) ranges.push({ start: tokenStart, end, value: match[1] });
  };
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
      inQuote = !inQuote;
      continue;
    }
    if (/\s/u.test(char) && !inQuote) {
      finish(index);
      tokenStart = index + 1;
    }
  }
  if (!inQuote) finish(query.length);
  return ranges;
}

/** The last syntactically valid scope modifier wins, as it does in the query pipeline. */
export function scopeSelectionFromQuery(query: string): SearchScopeSelection {
  let selection: SearchScopeSelection = { included: ["all"], excluded: [] };
  for (const token of scopeTokenRanges(query)) {
    const parsed = parseSearchScopeModifier(token.value);
    if (parsed) selection = parsed;
  }
  return selection;
}

export function scopeQuery(selection: SearchScopeSelection, options: { includeAll?: boolean } = {}): string {
  const normalized = normalizedSelection(selection);
  const included = normalized.included;
  const excluded = normalized.excluded;
  if (included.length === 0 && excluded.length === 0) return "";
  if (included.length === 1 && included[0] === "all" && excluded.length === 0) {
    return options.includeAll ? "in:all" : "";
  }
  const pieces = [...included, ...excluded.map((scope) => `-${scope}`)];
  return `in:${pieces.join(",")}`;
}

/** True when the query contains a syntactic, unquoted `in:` token. */
export function queryHasExplicitSearchScope(query: string): boolean {
  return scopeTokenRanges(query).length > 0;
}

/** Resolve the persisted scope only when the draft has no explicit scope. */
export function resolveSearchScopeQuery(query: string, defaults: SearchScopeSelection): string {
  const trimmed = query.trim();
  if (!trimmed || /^re:/iu.test(trimmed) || queryHasExplicitSearchScope(trimmed)) {
    return trimmed;
  }
  const prefix = scopeQuery(defaults);
  return prefix ? `${prefix} ${trimmed}` : trimmed;
}


/** Replace every scope token once while preserving all non-scope bytes verbatim. */
export function replaceQueryScopes(query: string, selection: SearchScopeSelection): string {
  if (query.trimStart().startsWith("re:")) return query;
  const replacement = scopeQuery(selection, { includeAll: true });
  const ranges = scopeTokenRanges(query);
  if (ranges.length === 0) {
    if (!replacement) return query;
    return `${replacement}${query && !/^\s/u.test(query) ? " " : ""}${query}`;
  }
  let result = "";
  let cursor = 0;
  ranges.forEach((range, index) => {
    result += query.slice(cursor, range.start);
    if (index === 0 && replacement) result += replacement;
    cursor = range.end;
  });
  return result + query.slice(cursor);
}

function metadataExcluded(excluded: Set<ExcludedSearchScope>): boolean {
  return excluded.has("metadata");
}

function fieldBlocked(scope: ExcludedSearchScope, excluded: Set<ExcludedSearchScope>): "direct" | "metadata" | null {
  if (excluded.has(scope)) return "direct";
  if (METADATA_CHILDREN.includes(scope) && metadataExcluded(excluded)) return "metadata";
  return null;
}

function isIncludedDirect(scope: ExcludedSearchScope, included: Set<SearchScope>): boolean {
  return included.has(scope);
}

function isInherited(scope: ExcludedSearchScope, included: Set<SearchScope>): boolean {
  if (included.has("all") || included.size === 0) return true;
  return included.has("metadata") && METADATA_CHILDREN.includes(scope);
}

function childState(scope: ExcludedSearchScope, included: Set<SearchScope>, excluded: Set<ExcludedSearchScope>): ScopeOptionState {
  if (fieldBlocked(scope, excluded)) return "excluded";
  if (isIncludedDirect(scope, included)) return "included";
  if (isInherited(scope, included)) return "inherited";
  return "available";
}

function nextFor(scope: ExcludedSearchScope, state: ScopeOptionState, selection: SearchScopeSelection): SearchScopeSelection {
  const next = normalizedSelection(selection);
  const included = new Set<SearchScope>(next.included);
  const excluded = new Set<ExcludedSearchScope>(next.excluded);
  if (state === "excluded") {
    const blockedByMetadata = METADATA_CHILDREN.includes(scope) && excluded.has("metadata");
    excluded.delete(scope);
    if (blockedByMetadata) {
      excluded.delete("metadata");
      for (const child of METADATA_CHILDREN) {
        if (child !== scope) excluded.add(child);
      }
    } else if (scope === "metadata") {
      for (const child of METADATA_CHILDREN) excluded.delete(child);
    }
  } else if (included.has(scope)) {
    included.delete(scope);
  } else if (state === "inherited" || (state === "partial" && (included.has("all") || included.size === 0))) {
    excluded.add(scope);
  } else {
    included.add(scope);
  }
  return normalizedSelection({ included: [...included], excluded: [...excluded] });
}

export function scopeOptions(selection: SearchScopeSelection): ScopeOption[] {
  const normalized = normalizedSelection(selection);
  const included = new Set<SearchScope>(normalized.included);
  const excluded = new Set<ExcludedSearchScope>(normalized.excluded);
  const implicitAll = included.has("all") || included.size === 0;
  return SEARCH_SCOPES.map((scope) => {
    let state = childState(scope, included, excluded);
    if (scope === "metadata" && !excluded.has("metadata")) {
      const children = METADATA_CHILDREN.map((child) => childState(child, included, excluded));
      const searched = children.filter((child) => child === "included" || child === "inherited").length;
      if (searched > 0 && searched < children.length) state = "partial";
      else if (searched === 0) state = children.every((child) => child === "excluded") ? "excluded" : "available";
      else state = included.has("metadata") ? "included" : "inherited";
    }
    const detail = state === "included" ? "Explicitly included"
      : state === "inherited" ? (implicitAll ? "From all fields" : "From metadata")
        : state === "excluded" ? (fieldBlocked(scope, excluded) === "metadata" ? "Excluded by metadata" : "Excluded")
          : state === "partial" ? "Some fields included"
            : "Not searched";
    const actionLabel = state === "excluded" ? "Remove exclusion"
      : included.has(scope) ? "Remove"
        : state === "inherited" || (state === "partial" && implicitAll) ? "Exclude" : "Include";
    return { scope, label: SCOPE_LABELS[scope], state, detail, actionLabel, next: nextFor(scope, state, normalized) };
  });
}

export function scopeSummary(selection: SearchScopeSelection): string {
  const normalized = normalizedSelection(selection);
  const included = new Set<SearchScope>(normalized.included);
  const excluded = new Set<ExcludedSearchScope>(normalized.excluded);
  let summary: string;
  if (included.has("all") || included.size === 0) {
    summary = "All searchable fields";
  } else {
    summary = [...included].map((scope) => scope === "all" ? "All searchable fields" : SCOPE_LABELS[scope]).join(", ");
  }
  if (excluded.size > 0) {
    summary += ` except ${[...excluded].map((scope) => SCOPE_LABELS[scope]).join(", ")}`;
  }
  return summary;
}

export { SEARCH_SCOPES };
