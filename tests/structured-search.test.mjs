import assert from "node:assert/strict";
import { test } from "node:test";
import {
  classifyStructuredSearchDraft,
  searchSuggestions,
  shouldHoldStructuredSearchDraft,
} from "../src/shared/search.ts";

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

test("closed structured values fail closed while date and free values remain applicable", () => {
  assert.equal(classifyStructuredSearchDraft("kind:").kind, "incomplete");
  assert.equal(classifyStructuredSearchDraft("kind:not-a-kind").kind, "invalid");
  assert.equal(classifyStructuredSearchDraft("kind:text").kind, "complete");
  assert.equal(classifyStructuredSearchDraft("kind:file-list").kind, "complete");
  assert.equal(classifyStructuredSearchDraft("has:note").kind, "complete");
  assert.equal(classifyStructuredSearchDraft("has:tag").kind, "complete");
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
  ];
  for (const query of invalid) {
    const classification = classifyStructuredSearchDraft(query);
    assert.equal(classification.kind, "invalid", query);
    assert.equal(classification.structured, true, query);
    assert.equal(
      shouldHoldStructuredSearchDraft(classification, {
        draftChanged: true,
        searchTriggerMode: "realtime",
        deferStructuredSearchUntilEnter: false,
      }),
      true,
      query,
    );
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
