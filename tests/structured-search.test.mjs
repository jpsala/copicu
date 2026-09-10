import assert from "node:assert/strict";
import { test } from "node:test";
import {
  classifyStructuredSearchDraft,
  searchSuggestions,
  shouldHoldStructuredSearchDraft,
} from "../src/shared/search.ts";
import {
  replaceQueryScopes,
  resolveSearchScopeQuery,
  scopeOptions,
  scopeQuery,
  scopeSelectionFromQuery,
  queryHasExplicitSearchScope,
  scopeSummary,
} from "../src/shared/searchScopes.ts";

test("structured draft classifier holds incomplete operators and quotes", () => {
  assert.equal(classifyStructuredSearchDraft("#").kind, "incomplete");
  assert.equal(classifyStructuredSearchDraft('#""').kind, "incomplete");
  assert.equal(classifyStructuredSearchDraft('#""').message, "Choose or type a tag after `#`.");
  assert.equal(classifyStructuredSearchDraft("tag:").kind, "incomplete");
  assert.equal(classifyStructuredSearchDraft('tag:""').kind, "incomplete");
  assert.equal(classifyStructuredSearchDraft('tag:""').message, "Choose or type a tag after `tag:`.");
  assert.equal(classifyStructuredSearchDraft('"invoice').kind, "incomplete");
  assert.equal(classifyStructuredSearchDraft('"invoice').message, "Close the quoted search value before applying.");
  assert.equal(classifyStructuredSearchDraft('title:"invoice').kind, "incomplete");
  assert.equal(classifyStructuredSearchDraft("tag:work").kind, "complete");
});

test("regular expressions require the explicit re prefix", () => {
  const empty = classifyStructuredSearchDraft("re:");
  assert.equal(empty.kind, "incomplete");
  assert.equal(empty.structured, true);
  assert.equal(classifyStructuredSearchDraft("re:^invoice-\\d+$").kind, "complete");
  assert.equal(classifyStructuredSearchDraft("invoice re:paid").kind, "plain");
});

test("closed structured values fail closed while date and free values remain applicable", () => {
  assert.equal(classifyStructuredSearchDraft("kind:").kind, "incomplete");
  assert.equal(classifyStructuredSearchDraft("kind:not-a-kind").kind, "invalid");
  assert.equal(classifyStructuredSearchDraft("kind:text").kind, "complete");
  assert.equal(classifyStructuredSearchDraft("kind:file-list").kind, "complete");
  assert.equal(classifyStructuredSearchDraft("has:note").kind, "complete");
  assert.equal(classifyStructuredSearchDraft("has:tag").kind, "complete");
  assert.equal(classifyStructuredSearchDraft("is:inbox").kind, "complete");
  assert.equal(classifyStructuredSearchDraft("is:not-inbox").kind, "complete");
  assert.equal(classifyStructuredSearchDraft("-is:inbox").kind, "complete");
  assert.equal(classifyStructuredSearchDraft('kind:"text"').kind, "complete");
  assert.equal(classifyStructuredSearchDraft("after:2026-08-06").kind, "complete");
  assert.equal(classifyStructuredSearchDraft("mime:text/plain").kind, "complete");
});

test("structured classifier matches Rust date and negation invalid-value rules", () => {
  const invalid = [
    "after:not-a-date",
    "after:today,yesterday",
    "-after:today",
    "-source:clipboard",
    "-format:html",
    "-fmt:html",
    "on:2026-13-40",
    "on:2026-02-29",
    "after:-1-01-01",
    "after:d",
    "after:0x10d",
    "after:0b10d",
    "after:0o10d",
    "tag:,",
    "mime:,",
    "title:,,",
    "source:,",
    "format:,,",
    "-tag:,",
  ];
  for (const query of invalid) {
    const classification = classifyStructuredSearchDraft(query);
    assert.equal(classification.kind, "invalid", query);
    assert.equal(classification.structured, true, query);
    for (const deferStructuredSearchUntilEnter of [false, true]) {
      assert.equal(
        shouldHoldStructuredSearchDraft(classification, {
          draftChanged: true,
          searchTriggerMode: "realtime",
          deferStructuredSearchUntilEnter,
        }),
        true,
        `${query} defer=${deferStructuredSearchUntilEnter}`,
      );
    }
  }

  for (const query of [
    "after:today",
    "after:-1d",
    "after:2026-08-06T14:32:00-03:00",
    "on:2026-08-06",
    "source:clipboard",
    "format:html",
    "fmt:html",
  ]) {
    assert.equal(classifyStructuredSearchDraft(query).kind, "complete", query);
  }
});

test("every negated token keeps structured semantics, including unknown operators", () => {
  for (const query of ["-foo:bar", "-http://", "-plain"]) {
    const classification = classifyStructuredSearchDraft(query);
    assert.equal(classification.structured, true, query);
    assert.equal(classification.kind, "complete", query);
    assert.equal(
      shouldHoldStructuredSearchDraft(classification, {
        draftChanged: true,
        searchTriggerMode: "realtime",
        deferStructuredSearchUntilEnter: true,
      }),
      true,
      query,
    );
  }
});

test("negated autocomplete excludes non-negatable operators and values", () => {
  assert.equal(searchSuggestions("-", []).some((suggestion) => suggestion.replacement === "-after:"), false);
  assert.equal(searchSuggestions("-", []).some((suggestion) => suggestion.replacement === "-source:"), false);
  assert.deepEqual(searchSuggestions("-after:", []), []);
  assert.deepEqual(searchSuggestions("-since:to", []), []);
  assert.deepEqual(searchSuggestions("-source:", []), []);
  assert.deepEqual(searchSuggestions("-format:", []), []);
  assert.deepEqual(searchSuggestions("-fmt:", []), []);
  assert.ok(searchSuggestions("-tag:", ["work"]).some((suggestion) => suggestion.replacement === "-tag:work"));
});

test("tag and operator autocomplete exposes keyboard-completable replacements", () => {
  assert.deepEqual(searchSuggestions("#wo", ["work", "world"]), [
    { label: "#work", replacement: "#work" },
    { label: "#world", replacement: "#world" },
  ]);
  assert.deepEqual(searchSuggestions("tag:wo", ["work", "world"]), [
    { label: "tag:work", replacement: "tag:work" },
    { label: "tag:world", replacement: "tag:world" },
  ]);
  assert.ok(searchSuggestions("ki", []).some((suggestion) => suggestion.replacement === "kind:"));
});

test("structured hold keeps incomplete drafts permanent and defers only complete drafts", () => {
  const incomplete = classifyStructuredSearchDraft("tag:");
  const complete = classifyStructuredSearchDraft("tag:work");
  const operatorPrefix = classifyStructuredSearchDraft("ki");
  const base = {
    draftChanged: true,
    searchTriggerMode: "realtime",
    autocompleteActive: false,
    autocompleteCommitted: false,
  };

  assert.equal(
    shouldHoldStructuredSearchDraft(incomplete, { ...base, deferStructuredSearchUntilEnter: false }),
    true,
  );
  assert.equal(
    shouldHoldStructuredSearchDraft(complete, { ...base, deferStructuredSearchUntilEnter: false }),
    false,
  );
  assert.equal(
    shouldHoldStructuredSearchDraft(complete, { ...base, deferStructuredSearchUntilEnter: true }),
    true,
  );
  assert.equal(
    shouldHoldStructuredSearchDraft(complete, {
      ...base,
      deferStructuredSearchUntilEnter: false,
      autocompleteActive: true,
    }),
    true,
  );
  assert.equal(
    shouldHoldStructuredSearchDraft(operatorPrefix, {
      ...base,
      deferStructuredSearchUntilEnter: false,
      autocompleteActive: true,
    }),
    true,
  );
});

test("quoted structured values keep parity with the Rust tokenizer", () => {
  const focalCases = [
    { query: '"tag:work"', kind: "complete", structured: true },
    { query: 'kind:"text","image"', kind: "complete", structured: true },
    { query: 'ki"nd":text', kind: "complete", structured: true },
    { query: '-"kind":text', kind: "complete", structured: true },
    { query: 'title:"a\\"b"', kind: "complete", structured: true },
    { query: 'title:"a\\\\b"', kind: "complete", structured: true },
    { query: '"plain phrase"', kind: "plain", structured: false },
    { query: '"tag:"', kind: "incomplete", structured: true, operator: "tag" },
  ];

  for (const expected of focalCases) {
    const actual = classifyStructuredSearchDraft(expected.query);
    assert.equal(actual.kind, expected.kind, expected.query);
    assert.equal(actual.structured, expected.structured, expected.query);
    if (expected.operator) {
      assert.equal(actual.operator, expected.operator, expected.query);
    }
  }
});

test("search scopes validate, expose truthful states, and replace one modifier", () => {
  assert.equal(classifyStructuredSearchDraft("in:metadata,content invoice").kind, "complete");
  assert.equal(classifyStructuredSearchDraft("in:properties invoice").kind, "invalid");
  assert.equal(classifyStructuredSearchDraft("in:all,content invoice").kind, "invalid");
  assert.equal(classifyStructuredSearchDraft("in:metadata,").kind, "incomplete");
  assert.equal(classifyStructuredSearchDraft("in:content,,context").kind, "invalid");
  assert.equal(classifyStructuredSearchDraft("in:-all").kind, "invalid");
  assert.equal(classifyStructuredSearchDraft("in:-context invoice").kind, "complete");
  assert.equal(classifyStructuredSearchDraft("-in:content invoice").kind, "invalid");

  const metadata = scopeOptions({ included: ["metadata"], excluded: [] });
  assert.equal(metadata.find((option) => option.scope === "metadata")?.state, "included");
  assert.equal(metadata.find((option) => option.scope === "notes")?.state, "inherited");
  assert.equal(metadata.find((option) => option.scope === "notes")?.next.excluded[0], "notes");
  const excluded = scopeOptions({ included: ["all"], excluded: ["metadata"] });
  assert.equal(excluded.find((option) => option.scope === "title")?.state, "excluded");
  assert.deepEqual(excluded.find((option) => option.scope === "title")?.next.excluded, ["notes", "tags"]);
  assert.equal(scopeOptions(metadata[0].next).find((option) => option.scope === "content")?.state, "included");
  assert.deepEqual(metadata.find((option) => option.scope === "metadata")?.next.included, []);
  assert.equal(scopeOptions({ included: [], excluded: ["context"] }).find((option) => option.scope === "notes")?.state, "inherited");
  assert.equal(scopeOptions({ included: ["metadata"], excluded: ["notes"] }).find((option) => option.scope === "metadata")?.state, "partial");

  assert.ok(searchSuggestions("in:me", []).some((suggestion) =>
    suggestion.replacement === "in:metadata" && suggestion.queryReplacement === "in:metadata"));
  assert.ok(searchSuggestions("in:-no", []).some((suggestion) =>
    suggestion.replacement === "in:-notes" && suggestion.scope?.actionLabel === "Exclude Notes"));
  assert.deepEqual(searchSuggestions("in:metadata", []), []);
  assert.ok(searchSuggestions("in:all,", []).some((suggestion) =>
    suggestion.queryReplacement === "in:all,-notes"));
  assert.ok(searchSuggestions("in:metadata,no", []).some((suggestion) =>
    suggestion.queryReplacement === "in:metadata,-notes" && suggestion.scope?.actionLabel === "Exclude"));
  assert.ok(searchSuggestions("in:metadata,", []).some((suggestion) =>
    suggestion.scope?.state === "inherited" && suggestion.queryReplacement === "in:metadata,-notes"));

  assert.deepEqual(scopeSelectionFromQuery("in:title old in:metadata,-notes"), {
    included: ["metadata"],
    excluded: ["notes"],
  });
  assert.equal(scopeQuery({ included: ["all"], excluded: ["notes"] }), "in:all,-notes");
  assert.equal(scopeSummary({ included: ["all"], excluded: ["notes"] }), "All searchable fields except Notes");
  const query = '  in:title   "a  b" re:^x\\s+in:notes  ';
  assert.equal(replaceQueryScopes(query, { included: ["metadata"], excluded: ["tags"] }), '  in:metadata,-tags   "a  b" re:^x\\s+in:notes  ');
  assert.equal(replaceQueryScopes("re:^x\\s+in:title", { included: ["metadata"], excluded: [] }), "re:^x\\s+in:title");
});

test("default scopes resolve at execution without capturing quoted or regex text", () => {
  const contentDefault = { included: ["content"], excluded: [] };
  assert.equal(resolveSearchScopeQuery("openai", contentDefault), "in:content openai");
  assert.equal(resolveSearchScopeQuery("in:all openai", contentDefault), "in:all openai");
  assert.equal(resolveSearchScopeQuery('"in:all" openai', contentDefault), 'in:content "in:all" openai');
  assert.equal(resolveSearchScopeQuery("re:openai", contentDefault), "re:openai");
  assert.equal(queryHasExplicitSearchScope("in:content openai"), true);
  assert.equal(queryHasExplicitSearchScope('"in:content" openai'), false);
  assert.equal(scopeQuery({ included: ["all"], excluded: [] }, { includeAll: true }), "in:all");
  assert.ok(searchSuggestions("in:a", []).some((suggestion) => suggestion.queryReplacement === "in:all"));
});
