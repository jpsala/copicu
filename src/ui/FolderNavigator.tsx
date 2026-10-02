import Ellipsis from "lucide-react/dist/esm/icons/ellipsis.mjs";
import { useMemo, type KeyboardEvent, type RefObject, type Dispatch, type SetStateAction } from "react";
import type { FolderSummary, FolderScope } from "../shared/contracts";
import { FolderTree, type FolderTreeRow } from "./FolderTree";

export type FolderNavigationId = number | null | "all";

export function FolderNavigator({ folders, scope, expanded, setExpanded, rootItemCount, treeRef, dropTarget, draggedItemCount, select, openMenu, onExit }: {
  folders: FolderSummary[];
  scope: FolderScope;
  expanded: Set<number>;
  setExpanded: Dispatch<SetStateAction<Set<number>>>;
  rootItemCount: number | null;
  treeRef: RefObject<HTMLDivElement | null>;
  dropTarget?: string | null;
  draggedItemCount?: number;
  select: (id: FolderNavigationId, closeNarrow?: boolean) => void;
  openMenu: (id: FolderNavigationId, target: HTMLElement, x: number, y: number) => void;
  onExit?: () => void;
}) {
  const sorted = useMemo(() => [...folders].sort((a, b) => a.path.localeCompare(b.path, undefined, { sensitivity: "base" })), [folders]);
  const children = (id: number | null) => sorted.filter((folder) => folder.parentId === id);
  const treeRows: Array<{ id: number | null | "all"; label: string; count: number | null; depth: number; children: boolean }> = [
    { id: "all", label: "All history", count: null, depth: 0, children: false },
    { id: null, label: "/", count: rootItemCount, depth: 0, children: children(null).length > 0 },
  ];
  const collect = (id: number | null, depth: number) => {
    for (const folder of children(id)) {
      const hasChildren = children(folder.id).length > 0;
      treeRows.push({ id: folder.id, label: folder.name, count: folder.directItemCount, depth, children: hasChildren });
      if (expanded.has(folder.id)) collect(folder.id, depth + 1);
    }
  };
  if (expanded.has(0)) collect(null, 1);
  const onTreeKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!(event.target instanceof HTMLElement) || event.target.getAttribute("role") !== "treeitem") return;
    const focused = event.target;
    const index = treeRows.findIndex((row) => String(row.id) === focused.dataset.folderRow);
    if (index < 0) return;
    const row = treeRows[index];
    const focusRow = (target: typeof row) => {
      select(target.id, false);
      treeRef.current?.querySelector<HTMLElement>(`[data-folder-row="${target.id}"]`)?.focus();
    };
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      focusRow(treeRows[Math.max(0, Math.min(treeRows.length - 1, index + (event.key === "ArrowDown" ? 1 : -1)))]);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      const expansionId = row.id === null ? 0 : row.id;
      if (typeof expansionId === "number" && row.children && expanded.has(expansionId)) {
        setExpanded((prev) => { const next = new Set(prev); next.delete(expansionId); return next; });
      } else if (typeof row.id === "number") {
        const parentId = folders.find((folder) => folder.id === row.id)?.parentId ?? null;
        focusRow(treeRows.find((candidate) => candidate.id === parentId) ?? treeRows[1]);
      }
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      const expansionId = row.id === null ? 0 : row.id;
      if (typeof expansionId === "number" && row.children && !expanded.has(expansionId)) {
        setExpanded((prev) => new Set(prev).add(expansionId));
      } else {
        const next = treeRows[index + 1];
        if (row.children && next?.depth > row.depth) focusRow(next);
        else onExit?.();
      }
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      focusRow(event.key === "Home" ? treeRows[0] : treeRows[treeRows.length - 1]);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      select(row.id);
    } else if (event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey)) {
      event.preventDefault();
      const bounds = focused.getBoundingClientRect();
      openMenu(row.id, focused, bounds.left + 24, bounds.bottom);
    } else if (event.key === "Tab" && !event.shiftKey) {
      event.preventDefault();
      onExit?.();
    }
  };
  const navigationId = (id: string): FolderNavigationId => id === "all" ? "all" : id === "null" ? null : Number(id);
  const activeId = scope.kind === "all" ? "all" : scope.kind === "root" ? "null" : String(scope.folderId);
  const counts = new Map(treeRows.map((row) => [String(row.id), row.count]));
  const rows: FolderTreeRow[] = treeRows.map((row) => ({
    id: String(row.id), label: row.label,
    title: row.id === "all" ? row.label : row.id === null ? "/" : folders.find((folder) => folder.id === row.id)?.path,
    depth: row.depth, hasChildren: row.children,
    expanded: row.id !== "all" && expanded.has(row.id === null ? 0 : row.id),
    selected: String(row.id) === activeId,
  }));
  return <FolderTree rows={rows} treeId="history-folder-tree" ariaLabel="History folders" activeId={activeId} onSelect={(id) => select(navigationId(id))} onToggle={(id) => {
    const expansionId = id === "null" ? 0 : Number(id);
    setExpanded((prev) => { const next = new Set(prev); if (next.has(expansionId)) next.delete(expansionId); else next.add(expansionId); return next; });
  }} onKeyDown={onTreeKey} rowProps={(row) => {
    const id = navigationId(row.id);
    return {
      "data-folder-drop-id": id === "all" ? undefined : id === null ? "root" : id,
      className: dropTarget === (id === null ? "root" : row.id) ? "is-drop-target" : undefined,
      onContextMenu: (event) => {
        event.preventDefault();
        const target = event.currentTarget.querySelector<HTMLElement>('[role="treeitem"]');
        if (target) openMenu(id, target, event.clientX, event.clientY);
      },
    };
  }} renderDetail={(row) => {
    const count = counts.get(row.id);
    return dropTarget === (row.id === "null" ? "root" : row.id) ? <span className="folder-drop-hint">Move {draggedItemCount}</span> : count !== null && count !== undefined && <span className="folder-tree-count">{count}</span>;
  }} renderTrailing={(row) => row.id !== "all" && <button type="button" className="folder-more" aria-label={`Actions for ${row.label}`} aria-haspopup="menu" onClick={(event) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    openMenu(navigationId(row.id), event.currentTarget, bounds.left, bounds.bottom);
  }}><Ellipsis size={16} aria-hidden="true" /></button>} />;
}
