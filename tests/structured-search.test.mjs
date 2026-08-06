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
