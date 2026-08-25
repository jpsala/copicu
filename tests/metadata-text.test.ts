import { describe, expect, test } from "bun:test";
import { formatMetadataText, parseMetadataText } from "../src/ui/TagEditor";

const availableTags = [
  { id: 1, label: "Work", slug: "work", color: null, pinned: false, sortOrder: null, itemCount: 2, autoApplyEnabled: false },
];

describe("metadata title directive", () => {
  test("round-trips an optional title with the remaining metadata", () => {
    const text = formatMetadataText(
      "Release checklist",
      "Review before publishing",
      ["Work"],
      { client: ["ACME"], project: [], activity: [] },
    );

    expect(text).toBe([
      "@title: Release checklist",
      "#work client:ACME",
      "Review before publishing",
    ].join("\n"));
    expect(parseMetadataText(text, availableTags)).toEqual({
      title: "Release checklist",
      notes: "Review before publishing",
      tags: ["Work"],
      properties: { client: ["ACME"], project: [], activity: [] },
    });
  });

  test("does not treat an inline mention as a title", () => {
    expect(parseMetadataText("Send this to @title: reviewers", availableTags)).toMatchObject({
      title: null,
      notes: "Send this to @title: reviewers",
    });
  });

  test("omits the directive when no title exists", () => {
    expect(formatMetadataText(null, "Plain note", [], undefined)).toBe("Plain note");
    expect(parseMetadataText("Plain note", availableTags)).toMatchObject({
      title: null,
      notes: "Plain note",
    });
  });
});
