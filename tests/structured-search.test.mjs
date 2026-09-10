import assert from "node:assert/strict";
import { test } from "node:test";
import {
  classifyStructuredSearchDraft,
  searchSuggestions,
  shouldHoldStructuredSearchDraft,
} from "../src/shared/search.ts";
import {
  effectiveSearchScopeLeaves,
  queryHasExplicitSearchScope,
  queryHasValidSearchScope,
  replaceQueryScopes,
  resolveSearchScopeQuery,
  sameSearchScopeSelection,
  scopeOptions,
  scopeQuery,
  scopeSelectionFromQuery,
  setSearchScopeEnabled,
} from "../src/shared/searchScopes.ts";
test("structured draft classifier holds incomplete operators and quotes", () => {
  assert.equal(classifyStructuredSearchDraft("#").kind, "incomplete");
  assert.equal(classifyStructuredSearchDraft('#""').kind, "incomplete");
  assert.equal(classifyStructuredSearchDraft("tag:").kind, "incomplete");
  assert.equal(classifyStructuredSearchDraft('tag:""').kind, "incomplete");
  assert.equal(classifyStructuredSearchDraft('"invoice').kind, "incomplete");
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
  assert.deepEqual(metadata.find((option) => option.scope === "metadata")?.next, {
    included: ["metadata"],
    excluded: ["metadata"],
  });
  assert.equal(scopeOptions(metadata[0].next).find((option) => option.scope === "content")?.state, "included");
  assert.equal(scopeOptions({ included: [], excluded: ["context"] }).find((option) => option.scope === "notes")?.state, "inherited");
  assert.equal(scopeOptions({ included: ["metadata"], excluded: ["notes"] }).find((option) => option.scope === "metadata")?.state, "partial");

  assert.ok(searchSuggestions("in:me", [], { included: ["content"], excluded: [] }).some((suggestion) =>
    suggestion.queryReplacement === "in:content,metadata"));
  const excludingNotes = searchSuggestions("in:-no", []).find((suggestion) => suggestion.label === "Notes");
  assert.deepEqual(effectiveSearchScopeLeaves(scopeSelectionFromQuery(excludingNotes.queryReplacement)),
    ["content", "title", "tags", "context"]);
  assert.deepEqual(searchSuggestions("in:metadata", []), []);
  assert.ok(searchSuggestions("in:all,", []).every((suggestion) =>
    sameSearchScopeSelection(scopeSelectionFromQuery(suggestion.queryReplacement), { included: ["all"], excluded: [] })));

  const activeDefault = { included: ["content", "title"], excluded: [] };
  assert.ok(searchSuggestions("in:", [], activeDefault).some((suggestion) =>
    suggestion.label === "Notes" && suggestion.queryReplacement === "in:content,title,notes"));
  assert.ok(searchSuggestions("in:", [], activeDefault).some((suggestion) =>
    suggestion.label === "Content" && suggestion.queryReplacement === "in:content,title"));
  assert.ok(searchSuggestions("in:metadata,no", []).some((suggestion) =>
    sameSearchScopeSelection(scopeSelectionFromQuery(suggestion.queryReplacement), { included: ["metadata"], excluded: [] })));
  assert.deepEqual(scopeSelectionFromQuery("in:notes"), { included: ["notes"], excluded: [] });

  assert.deepEqual(scopeSelectionFromQuery("in:title old in:metadata,-notes"), {
    included: ["metadata"],
    excluded: ["notes"],
  });
  assert.equal(scopeQuery({ included: ["all"], excluded: ["notes"] }), "in:all,-notes");
  const query = '  in:title   "a  b" re:^x\\s+in:notes  ';
  assert.equal(replaceQueryScopes(query, { included: ["metadata"], excluded: ["tags"] }), '  in:metadata,-tags   "a  b" re:^x\\s+in:notes  ');
  assert.equal(replaceQueryScopes("re:^x\\s+in:title", { included: ["metadata"], excluded: [] }), "re:^x\\s+in:title");
});

test("scope edits preserve other fields, inherited exclusions, and an empty effective set", () => {
  const blocked = { included: ["content", "metadata"], excluded: ["metadata"] };
  const titleEnabled = setSearchScopeEnabled(blocked, "title", true);
  assert.deepEqual(effectiveSearchScopeLeaves(titleEnabled), ["content", "title"]);
  const allMetadata = setSearchScopeEnabled(titleEnabled, "metadata", true);
  assert.deepEqual(effectiveSearchScopeLeaves(allMetadata), ["content", "title", "notes", "tags"]);
  const empty = setSearchScopeEnabled({ included: ["content"], excluded: [] }, "content", false);
  assert.deepEqual(effectiveSearchScopeLeaves(empty), []);
  assert.equal(sameSearchScopeSelection(empty, { included: ["all"], excluded: [] }), false);
  assert.deepEqual(effectiveSearchScopeLeaves(setSearchScopeEnabled(empty, "notes", true)), ["notes"]);
  const restored = setSearchScopeEnabled({ included: ["all"], excluded: ["metadata"] }, "metadata", true);
  assert.equal(sameSearchScopeSelection(restored, { included: ["all"], excluded: [] }), true);
  const added = searchSuggestions('is:inbox "a  b" in:no', [], blocked).find((suggestion) => suggestion.label === "Notes");
  assert.deepEqual(effectiveSearchScopeLeaves(scopeSelectionFromQuery(added.queryReplacement)), ["content", "notes"]);
  assert.equal(replaceQueryScopes(added.queryReplacement, { included: [], excluded: [] }), 'is:inbox "a  b" ');
});

test("default scopes resolve at execution without capturing quoted or regex text", () => {
  const contentDefault = { included: ["content"], excluded: [] };
  assert.equal(resolveSearchScopeQuery("openai", contentDefault), "in:content openai");
  assert.equal(resolveSearchScopeQuery("in:all openai", contentDefault), "in:all openai");
  assert.equal(resolveSearchScopeQuery('"in:all" openai', contentDefault), 'in:content "in:all" openai');
  assert.equal(resolveSearchScopeQuery("re:openai", contentDefault), "re:openai");

  assert.equal(queryHasValidSearchScope("in:"), false);
  assert.equal(queryHasValidSearchScope("in:content openai"), true);
  assert.deepEqual(effectiveSearchScopeLeaves({ included: ["metadata"], excluded: ["title"] }), ["notes", "tags"]);
  assert.equal(sameSearchScopeSelection(
    { included: ["metadata"], excluded: [] },
    { included: ["title", "notes", "tags"], excluded: [] },
  ), true);
  assert.equal(sameSearchScopeSelection(
    { included: ["all"], excluded: ["context"] },
    { included: ["content", "title", "notes", "tags"], excluded: [] },
  ), false);
  assert.equal(queryHasExplicitSearchScope("in:content openai"), true);
  assert.equal(queryHasExplicitSearchScope('"in:content" openai'), false);
  assert.equal(scopeQuery({ included: ["all"], excluded: [] }, { includeAll: true }), "in:all");
  assert.ok(searchSuggestions("in:a", []).some((suggestion) => suggestion.queryReplacement === "in:all"));
});
