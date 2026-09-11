import assert from "node:assert/strict";
import { test } from "node:test";
import {
  classifyStructuredSearchDraft,
  replaceActiveSearchToken,
  searchSuggestions,
  searchTokenAt,
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
    { label: "#work", replacement: "#work", completionRange: { from: 0, to: 3 } },
    { label: "#world", replacement: "#world", completionRange: { from: 0, to: 3 } },
  ]);
  assert.deepEqual(searchSuggestions("tag:wo", ["work", "world"]), [
    { label: "tag:work", replacement: "tag:work", completionRange: { from: 0, to: 6 } },
    { label: "tag:world", replacement: "tag:world", completionRange: { from: 0, to: 6 } },
  ]);
  assert.ok(searchSuggestions("ki", []).some((suggestion) => suggestion.replacement === "kind:"));
});

test("caret-local completion replaces only the active token", () => {
  const query = "tag:wo x";
  const cursor = 6;
  assert.deepEqual(searchTokenAt(query, cursor), {
    from: 0,
    to: 6,
    value: "tag:wo",
    prefix: "tag:wo",
    suffix: "",
  });
  assert.ok(searchSuggestions(query, ["work"], undefined, cursor).some((suggestion) => suggestion.replacement === "tag:work"));
  assert.equal(replaceActiveSearchToken(query, "tag:work", cursor), "tag:work x");
});

test("tag-list completion targets the segment after the committed comma", () => {
  const query = "tag:work,pe";
  const suggestion = searchSuggestions(query, ["personal", "work"], undefined, query.length)
    .find((candidate) => candidate.label === "tag:personal");
  assert.deepEqual(suggestion, {
    label: "tag:personal",
    replacement: "personal",
    completionRange: { from: 9, to: 11 },
  });
  const middleQuery = "tag:work,personality tail";
  const middleSuggestion = searchSuggestions(middleQuery, ["personal"], undefined, 11)
    .find((candidate) => candidate.label === "tag:personal");
  assert.deepEqual(middleSuggestion?.completionRange, { from: 9, to: 20 });
  assert.equal(replaceActiveSearchToken("kind:tezzz tail", "kind:text", 7), "kind:text tail");
  const laterQuery = "tag:work,pe,other";
  const laterSuggestion = searchSuggestions(laterQuery, ["personal"], undefined, 11)
    .find((candidate) => candidate.label === "tag:personal");
  assert.deepEqual(laterSuggestion?.completionRange, { from: 9, to: 11 });
});

test("closed value completion targets only the active comma segment", () => {
  const firstSegment = searchSuggestions("kind:tezzz,image tail", [], undefined, 7)
    .find((candidate) => candidate.label === "kind:text");
  assert.deepEqual(firstSegment, {
    label: "kind:text",
    replacement: "kind:text",
    completionRange: { from: 0, to: 10 },
  });
  const laterSegment = searchSuggestions("kind:text,im", [], undefined, 12)
    .find((candidate) => candidate.label === "kind:image");
  assert.deepEqual(laterSegment, {
    label: "kind:image",
    replacement: "image",
    completionRange: { from: 10, to: 12 },
  });

});
test("completion context respects regex mode, quotes, and selection direction", () => {
  assert.deepEqual(searchSuggestions("re:foo tag:wo", ["work", "world"], undefined, 13), []);

  const forward = searchSuggestions(
    "tag:work tail",
    ["work", "world"],
    undefined,
    8,
    { anchor: 4, head: 8 },
  );
  const reverse = searchSuggestions(
    "tag:work tail",
    ["work", "world"],
    undefined,
    4,
    { anchor: 8, head: 4 },
  );
  assert.deepEqual(reverse, forward);
  assert.deepEqual(forward.map(({ label, replacement }) => ({ label, replacement })), [
    { label: "tag:work", replacement: "tag:work" },
    { label: "tag:world", replacement: "tag:world" },
  ]);

  assert.deepEqual(
    searchSuggestions(
      "tag:work tail",
      ["work", "world"],
      undefined,
      8,
      { anchor: 4, head: 10 },
    ),
    [],
  );

  assert.deepEqual(
    searchSuggestions('kind:"tezzz","image" tail', [], undefined, 8).find(
      (candidate) => candidate.label === 'kind:"text"',
    ),
    {
      label: 'kind:"text"',
      replacement: 'kind:"text"',
      completionRange: { from: 0, to: 12 },
    },
  );
});

test("structured hold keeps incomplete drafts permanent and defers only complete drafts", () => {
  const incomplete = classifyStructuredSearchDraft("tag:");
  const complete = classifyStructuredSearchDraft("tag:work");
  const operatorPrefix = classifyStructuredSearchDraft("ki");
  const base = {
    draftChanged: true,
    searchTriggerMode: "realtime",
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
    shouldHoldStructuredSearchDraft(operatorPrefix, {
      ...base,
      deferStructuredSearchUntilEnter: false,
    }),
    false,
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
  assert.equal(classifyStructuredSearchDraft("in:unknown invoice").kind, "invalid");
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
    sameSearchScopeSelection(suggestion.scopeSelection, { included: ["content", "metadata"], excluded: [] })));
  const scopedCompletion = searchSuggestions("in:co invoice", [], { included: ["all"], excluded: [] }, 5)
    .find((suggestion) => suggestion.label === "Content");
  assert.deepEqual(scopedCompletion?.completionRange, { from: 0, to: 5 });
  assert.deepEqual(scopedCompletion?.scopeSelection, { included: ["all"], excluded: [] });
  assert.equal(replaceQueryScopes("in:co invoice", scopedCompletion.scopeSelection), "in:all invoice");
  const excludingNotes = searchSuggestions("in:-no", []).find((suggestion) => suggestion.label === "Notes");
  assert.deepEqual(effectiveSearchScopeLeaves(excludingNotes.scopeSelection),
    ["content", "title", "tags", "context"]);
  assert.deepEqual(searchSuggestions("in:metadata", []), []);
  assert.ok(searchSuggestions("in:all,", []).every((suggestion) =>
    sameSearchScopeSelection(suggestion.scopeSelection, { included: ["all"], excluded: [] })));

  const activeDefault = { included: ["content", "title"], excluded: [] };
  assert.ok(searchSuggestions("in:", [], activeDefault).some((suggestion) =>
    suggestion.label === "Notes" && sameSearchScopeSelection(
      suggestion.scopeSelection,
      { included: ["content", "title", "notes"], excluded: [] },
    )));
  assert.ok(searchSuggestions("in:", [], activeDefault).some((suggestion) =>
    suggestion.label === "Content" && sameSearchScopeSelection(
      suggestion.scopeSelection,
      { included: ["content", "title"], excluded: [] },
    )));
  assert.ok(searchSuggestions("in:metadata,no", []).some((suggestion) =>
    sameSearchScopeSelection(suggestion.scopeSelection, { included: ["metadata"], excluded: [] })));
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
  assert.deepEqual(effectiveSearchScopeLeaves(added.scopeSelection), ["content", "notes"]);
  assert.equal(replaceQueryScopes('is:inbox "a  b" in:no', { included: [], excluded: [] }), 'is:inbox "a  b" ');
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
  assert.ok(searchSuggestions("in:a", []).some((suggestion) =>
    sameSearchScopeSelection(suggestion.scopeSelection, { included: ["all"], excluded: [] })));
});
