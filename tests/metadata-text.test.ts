import { expect, test } from "bun:test";
import { positiveTagFilters, searchSuggestions, tagKey } from "../src/shared/search";
import { localPreviewImageSource } from "../src/shared/previewMedia";


test("tag identity preserves Unicode case and hierarchical paths in search", () => {
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
