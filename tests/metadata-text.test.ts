import { describe, expect, test } from "bun:test";
import { formatMetadataText, parseMetadataText } from "../src/ui/TagEditor";
import { positiveTagFilters, searchSuggestions, tagKey } from "../src/shared/search";
import { localPreviewImageSource } from "../src/shared/previewMedia";

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

test("literal note metadata cannot resurrect removed tags or properties", () => {
  const notes = "Review #removed/path\nclient:Literal @title: inline\n@title: literal line\nKeep \\#escaped and C:\\temp";
  const formatted = formatMetadataText("Real title", notes, ["Work"], { client: ["Assigned"], project: [], activity: [] });
  expect(parseMetadataText(formatted, availableTags)).toEqual({
    title: "Real title",
    notes,
    tags: ["Work"],
    properties: { client: ["Assigned"], project: [], activity: [] },
  });
  const removed = formatMetadataText(null, "#work", []);
  expect(parseMetadataText(removed, availableTags)).toMatchObject({ notes: "#work", tags: [] });
});

test("tag identity preserves Unicode case and hierarchical paths in every editor", () => {
  const tags = ["Work/Project", "Équipe/東京", "équipe/東京", "का/東京"];
  const parsed = parseMetadataText(formatMetadataText(null, null, tags), []);
  expect(parsed.tags).toEqual(["work/project", "Équipe/東京", "équipe/東京", "का/東京"]);
  expect(positiveTagFilters("#Work/Project #work/project #Équipe/東京 #équipe/東京")).toEqual([
    "Work/Project", "Équipe/東京", "équipe/東京",
  ]);
  expect(searchSuggestions("#É", ["Équipe/東京", "équipe/東京"]).map((entry) => entry.replacement)).toEqual(["#Équipe/東京"]);
  expect(tagKey("\u0085#Work\u0085Project\u0085")).toBe("work-project");
  expect(tagKey("Work\uFEFFProject")).toBe("workproject");
});

test("preview sources reject network, relative and active image formats", () => {
  for (const source of ["https://remote.invalid/pixel.png", "//remote.invalid/pixel.png", "/pixel.png", "file:///clip.png", "blob:https://remote.invalid/id", "data:image/svg+xml;base64,PHN2Zz4="]) {
    expect(localPreviewImageSource(source)).toBeUndefined();
  }
  expect(localPreviewImageSource("data:image/png;base64,iVBORw0KGgo=")).toBe("data:image/png;base64,iVBORw0KGgo=");
});
