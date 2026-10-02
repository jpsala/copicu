import { expect, test } from "bun:test";
import type { FolderSummary } from "../src/shared/contracts";
import { folderFullPath, folderTreeEntries, planFolderPath, rankFolderResults } from "../src/ui/folderModel";

const folder = (id: number, parentId: number | null, name: string, path: string): FolderSummary => ({ id, parentId, name, path, directItemCount: 0, descendantFolderCount: 0, subtreeItemCount: 0 });
const folders = [folder(1, null, "Work", "Work"), folder(2, 1, "Copicu", "Work/Copicu"), folder(3, 2, "References", "Work/Copicu/References"), folder(4, null, "Archive", "Archive"), folder(5, 4, "Copicu", "Archive/Copicu"), folder(6, null, "École", "École")];

test("search ranks matching names before path matches and disambiguates full paths", () => {
  const result = rankFolderResults(folders, "copicu");
  expect(result.map((item) => item.id)).toEqual([5, 2, 3]);
  expect(folderFullPath(result[1].path)).toBe("/Work/Copicu");
  expect(rankFolderResults(folders, "work references").map((item) => item.id)).toEqual([3]);
  expect(rankFolderResults(folders, "missing")).toEqual([]);
});

test("root is selectable but no all-history destination exists", () => {
  expect(rankFolderResults(folders, "")[0].id).toBe(null);
  expect(rankFolderResults(folders, "all history")).toEqual([]);
  expect(planFolderPath(folders, "/")).toMatchObject({ path: "/", existingFolderId: null, missingSegments: [] });
});

test("nested creation reuses existing parents and previews only missing folders", () => {
  expect(planFolderPath(folders, "/work/copicu/ Research / Images ")).toEqual({ path: "/Work/Copicu/Research/Images", existingFolderId: undefined, parentPath: "/Work/Copicu", missingSegments: ["Research", "Images"] });
  expect(planFolderPath(folders, "Notes", "/Work/Copicu")).toMatchObject({ path: "/Work/Copicu/Notes", parentPath: "/Work/Copicu", missingSegments: ["Notes"] });
  expect(planFolderPath(folders, "/Archive", "/Work").existingFolderId).toBe(4);
  expect(planFolderPath(folders, "/WORK/COPICU/")).toMatchObject({ path: "/Work/Copicu", existingFolderId: 2, missingSegments: [] });
});

test("path validation rejects empty segments and control characters before staging", () => {
  for (const path of ["", " ", "//", "/Work//Notes", "/Work/ /Notes", "/Work/a\nb", "/Work/a\u0085b"]) expect(planFolderPath(folders, path).error).toBeTruthy();
  expect(planFolderPath(folders, "/Work/./..").missingSegments).toEqual([".", ".."]);
  expect(planFolderPath(folders, "/Work/a\\b").missingSegments).toEqual(["a\\b"]);
});

test("exact destination resolution follows SQLite ASCII case folding", () => {
  expect(planFolderPath(folders, "/WORK").existingFolderId).toBe(1);
  expect(planFolderPath(folders, "/école").existingFolderId).toBeUndefined();
  expect(planFolderPath(folders, "/ÉCOLE").existingFolderId).toBe(6);
});

test("excluded destinations cannot be selected or used as creation ancestors", () => {
  expect(rankFolderResults(folders, "copicu", [2, 3]).map((item) => item.id)).toEqual([5]);
  expect(planFolderPath(folders, "/Work/Copicu/New", "/", [2, 3]).error).toBeTruthy();
  expect(planFolderPath(folders, "/Archive/New", "/", [2, 3]).missingSegments).toEqual(["New"]);
});

test("path planning stays pure when creation is canceled or input is edited", () => {
  const before = JSON.stringify(folders);
  planFolderPath(folders, "/New/Nested");
  planFolderPath(folders, "/Work");
  expect(JSON.stringify(folders)).toBe(before);
});

test("tree filtering retains the full ancestry of a matching child and hides unrelated branches", () => {
  const filtered = folderTreeEntries(folders, "references", new Set([0, 1, 2]));
  expect(filtered.map((entry) => entry.id)).toEqual([null, 1, 2, 3]);
  expect(filtered.map((entry) => entry.depth)).toEqual([0, 1, 2, 3]);
  expect(filtered.map((entry) => entry.matches)).toEqual([false, false, false, true]);
  expect(filtered[0].hasChildren).toBe(true);
  expect(filtered[3].hasChildren).toBe(false);
  expect(folderTreeEntries(folders, "unmatched synthetic name", new Set([0, 1, 2]))).toEqual([]);
  const pathFiltered = folderTreeEntries(folders, "/Work/Copicu/References", new Set([0, 1, 2]));
  expect(pathFiltered.map((entry) => entry.id)).toEqual([null, 1, 2, 3]);
});

test("clearing the tree filter can restore the original collapsed expansion without mutating it", () => {
  const expanded = new Set([0, 4]);
  const before = folderTreeEntries(folders, "", expanded);
  expect(before.map((entry) => entry.id)).toEqual([null, 4, 5, 6, 1]);
  expect(before.find((entry) => entry.id === 1)).toMatchObject({ hasChildren: true, expanded: false });
  const filteredExpansion = new Set([...expanded, 1, 2]);
  expect(folderTreeEntries(folders, "references", filteredExpansion).map((entry) => entry.id)).toEqual([null, 1, 2, 3]);
  expect([...expanded]).toEqual([0, 4]);
  expect(folderTreeEntries(folders, "", expanded)).toEqual(before);
  expect(folderTreeEntries(folders, "", new Set()).map((entry) => entry.id)).toEqual([null]);
});

test("an excluded tree ancestor hides its subtree even if a descendant matches the filter", () => {
  const expanded = new Set([0, 1, 2, 4]);
  const remaining = folderTreeEntries(folders, "", expanded, [1]);
  expect(remaining.map((entry) => entry.id)).toEqual([null, 4, 5, 6]);
  expect(folderTreeEntries(folders, "references", expanded, [1])).toMatchObject([{ id: null, hasChildren: false, matches: false }]);
  expect(folderTreeEntries(folders, "copicu", expanded, [2]).map((entry) => entry.id)).toEqual([null, 4, 5]);
  expect(folderTreeEntries(folders, "", expanded, [1, 4, 6])).toMatchObject([{ id: null, hasChildren: false }]);
});

test("tree order follows natural sibling names while preserving root and hierarchy", () => {
  const numbered = [folder(10, 1, "Folder 10", "Work/Folder 10"), folder(11, 1, "folder 2", "Work/folder 2"), folder(12, 1, "Folder 1", "Work/Folder 1")];
  const rows = folderTreeEntries([...numbered, ...folders], "", new Set([0, 1]));
  expect(rows[0]).toMatchObject({ id: null, name: "/", path: "/", depth: 0 });
  expect(rows.filter((entry) => entry.parentId === 1).map((entry) => entry.name)).toEqual(["Copicu", "Folder 1", "folder 2", "Folder 10"]);
  expect(rows.map((entry) => entry.id)).toEqual([null, 4, 6, 1, 2, 12, 11, 10]);
  expect(rows.filter((entry) => entry.parentId === 1).every((entry) => entry.depth === 2)).toBe(true);
});
