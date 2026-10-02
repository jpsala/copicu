import type { FolderSummary } from "../shared/contracts";

export type FolderChoice = { kind: "existing"; folderId: number | null } | { kind: "create"; path: string };
export type FolderDestination = Pick<FolderSummary, "name" | "path" | "parentId"> & { id: number | null };
export const folderFullPath = (path: string) => path === "/" ? "/" : `/${path.replace(/^\//, "")}`;
// SQLite NOCASE only folds ASCII. Keep non-ASCII names distinct, as storage does.
const storageKey = (value: string) => value.replace(/[A-Z]/g, (letter) => letter.toLowerCase());
const root: FolderDestination = { id: null, name: "/", path: "/", parentId: null };

export function rankFolderResults(folders: FolderSummary[], query: string, excludeIds: number[] = []): FolderDestination[] {
  const excluded = new Set(excludeIds);
  const needle = query.trim().toLocaleLowerCase();
  const words = needle.split(/\s+/).filter(Boolean);
  const candidates: FolderDestination[] = [root, ...folders.filter((folder) => !excluded.has(folder.id))];
  const score = (folder: FolderDestination) => {
    const name = folder.name.toLocaleLowerCase();
    const path = folderFullPath(folder.path).toLocaleLowerCase();
    if (!words.every((word) => path.includes(word))) return Infinity;
    if (name === needle || path === needle) return 0;
    if (name.startsWith(needle)) return 1;
    if (name.includes(needle)) return 2;
    return 3;
  };
  return candidates.filter((folder) => Number.isFinite(score(folder))).sort((a, b) => score(a) - score(b) || folderFullPath(a.path).localeCompare(folderFullPath(b.path)));
}

export type FolderTreeEntry = FolderDestination & { depth: number; hasChildren: boolean; expanded: boolean; matches: boolean };

/** Filter a hierarchy without losing the ancestry that explains each match. */
export function folderTreeEntries(folders: FolderSummary[], query: string, expanded: Set<number>, excludeIds: number[] = []): FolderTreeEntry[] {
  const excluded = new Set(excludeIds);
  const available = folders.filter(folder => !excluded.has(folder.id));
  const lookup = new Map(available.map(folder => [folder.id, folder]));
  const children = new Map<number | null, FolderSummary[]>();
  for (const folder of available) {
    const siblings = children.get(folder.parentId) ?? [];
    siblings.push(folder);
    children.set(folder.parentId, siblings);
  }
  for (const siblings of children.values()) siblings.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true }));
  const needle = query.trim().toLocaleLowerCase();
  const words = needle.split(/\s+/).filter(Boolean);
  const matches = (folder: FolderDestination) => words.every(word => (needle.includes("/") ? folderFullPath(folder.path) : folder.name).toLocaleLowerCase().includes(word));
  const kept = new Set<number | null>();
  if (needle) {
    if (matches(root)) kept.add(null);
    for (const folder of available) {
      if (!matches(folder)) continue;
      let current: FolderSummary | undefined = folder;
      const seen = new Set<number>();
      while (current && !seen.has(current.id)) {
        seen.add(current.id); kept.add(current.id);
        current = current.parentId === null ? undefined : lookup.get(current.parentId);
      }
      kept.add(null);
    }
  }
  const rows: FolderTreeEntry[] = [];
  const visited = new Set<number | null>();
  const collect = (folder: FolderDestination, depth: number) => {
    if (visited.has(folder.id) || (needle && !kept.has(folder.id))) return;
    visited.add(folder.id);
    const descendants = (children.get(folder.id) ?? []).filter(child => !needle || kept.has(child.id));
    const open = expanded.has(folder.id ?? 0);
    rows.push({ ...folder, depth, hasChildren: descendants.length > 0, expanded: open, matches: !needle || matches(folder) });
    if (open) for (const child of descendants) collect(child, depth + 1);
  };
  collect(root, 0);
  return rows;
}

export type FolderPathPlan = {
  path: string;
  existingFolderId: number | null | undefined;
  parentPath: string;
  missingSegments: string[];
  error?: string;
};

/** Resolve a typed absolute path, or a path relative to the currently browsed folder. */
export function planFolderPath(folders: FolderSummary[], input: string, basePath = "/", excludeIds: number[] = []): FolderPathPlan {
  const invalid = (error: string): FolderPathPlan => ({ path: input, existingFolderId: undefined, parentPath: basePath, missingSegments: [], error });
  if (/[\u0000-\u001f\u007f-\u009f]/.test(input)) return invalid("Folder names cannot contain control characters.");
  const trimmed = input.trim();
  if (!trimmed) return invalid("Enter a folder name or path.");
  if (trimmed.includes("//")) return invalid("Each folder in the path needs a name.");
  const absolute = trimmed.startsWith("/") ? trimmed : `${basePath === "/" ? "" : folderFullPath(basePath)}/${trimmed}`;
  const body = absolute.slice(1).replace(/\/$/, "");
  const segments = body ? body.split("/").map((segment) => segment.trim()) : [];
  if (segments.some((segment) => !segment)) return invalid("Each folder in the path needs a name.");
  const path = `/${segments.join("/")}`;
  const excluded = new Set(excludeIds);
  const lookup = new Map(folders.map((folder) => [storageKey(folderFullPath(folder.path)), folder]));
  let parentPath = "/";
  let parentId: number | null = null;
  for (let index = 0; index < segments.length; index++) {
    const folder = lookup.get(storageKey(`/${segments.slice(0, index + 1).join("/")}`));
    if (!folder) return { path: `${parentPath === "/" ? "" : parentPath}/${segments.slice(index).join("/")}`, existingFolderId: undefined, parentPath, missingSegments: segments.slice(index) };
    if (excluded.has(folder.id)) return invalid("Choose a destination outside this folder.");
    parentPath = folderFullPath(folder.path);
    parentId = folder.id;
  }
  return { path: parentPath, existingFolderId: parentId, parentPath, missingSegments: [] };
}
