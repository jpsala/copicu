import { invoke } from "@tauri-apps/api/core";
import ChevronDown from "lucide-react/dist/esm/icons/chevron-down.mjs";
import ChevronRight from "lucide-react/dist/esm/icons/chevron-right.mjs";
import Ellipsis from "lucide-react/dist/esm/icons/ellipsis.mjs";
import Folder from "lucide-react/dist/esm/icons/folder.mjs";
import FolderOpen from "lucide-react/dist/esm/icons/folder-open.mjs";
import History from "lucide-react/dist/esm/icons/history.mjs";
import Plus from "lucide-react/dist/esm/icons/plus.mjs";
import PanelLeftClose from "lucide-react/dist/esm/icons/panel-left-close.mjs";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import type { FolderSummary, FolderScope, FolderDeletePreview } from "../shared/contracts";
import { ShortcutBadge } from "./ShortcutBadge";
import { UiTooltip } from "./controls";

export const folderScopeQuery = (scope: FolderScope) => scope.kind === "all" ? "" : scope.kind === "root" ? "folder:/" : `folder-id:${scope.folderId}`;
export const folderScopeLabel = (scope: FolderScope, folders: FolderSummary[]) => scope.kind === "all" ? "All history" : scope.kind === "root" ? "/" : folders.find((folder) => folder.id === scope.folderId)?.path ?? "Folder";

export function FolderWorkspace({ folders, reload, scope, onScopeChange, destination, destinationArmed, onDestinationChange, selectedItemIds, draggedItemIdsRef, moveRequest, onMoveRequestDone, onMoved, onError, deleteDefaults, narrow, treeOpen, onTreeOpenChange, treeRef, switcher, onSwitcherChange, rootItemCount }: {
  folders: FolderSummary[];
  reload: () => Promise<void>;
  scope: FolderScope;
  onScopeChange: (scope: FolderScope) => void;
  destination: number | null;
  destinationArmed: boolean;
  onDestinationChange: (id: number | null, armed?: boolean) => Promise<void>;
  selectedItemIds: number[];
  draggedItemIdsRef: RefObject<number[] | null>;
  moveRequest: { itemIds: number[]; trigger: HTMLElement | null } | null;
  onMoveRequestDone: () => void;
  onMoved: () => Promise<void>;
  onError: (error: string) => void;
  deleteDefaults: { clips: boolean; descendants: boolean };
  narrow: boolean;
  treeOpen: boolean;
  onTreeOpenChange: (open: boolean) => void;
  treeRef: RefObject<HTMLDivElement | null>;
  switcher: boolean;
  onSwitcherChange: (open: boolean) => void;
  rootItemCount: number | null;
}) {
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set([0]));
  const [menu, setMenu] = useState<number | null | "all" | undefined>();
  const [menuAnchor, setMenuAnchor] = useState({ x: 0, y: 0 });
  const [dialog, setDialog] = useState<{ action: "create" | "rename" | "reparent" | "delete" | "moveItems"; id: number | null } | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState<number | null>(null);
  const [deleteClips, setDeleteClips] = useState(false);
  const [deleteDescendants, setDeleteDescendants] = useState(false);
  const [preview, setPreview] = useState<FolderDeletePreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [switchQuery, setSwitchQuery] = useState("");
  const [switchIndex, setSwitchIndex] = useState(0);
  const switchInputRef = useRef<HTMLInputElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const sorted = useMemo(() => [...folders].sort((a, b) => a.path.localeCompare(b.path, undefined, { sensitivity: "base" })), [folders]);
  const children = (id: number | null) => sorted.filter((folder) => folder.parentId === id);
  const currentId = scope.kind === "folder" ? scope.folderId : null;
  const destinationName = destination === null ? "/" : folders.find((folder) => folder.id === destination)?.path ?? "/";
  const moveItemIds = moveRequest?.itemIds ?? selectedItemIds;
  const close = () => {
    setMenu(undefined);
    setDialog(null);
    onSwitcherChange(false);
    onMoveRequestDone();
    requestAnimationFrame(() => {
      if (returnFocus.current?.isConnected) returnFocus.current.focus();
      else treeRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus();
    });
  };
  const openDialog = (action: NonNullable<typeof dialog>["action"], id: number | null, target?: HTMLElement) => {
    if (target && !target.closest(".folder-context-menu")) returnFocus.current = target;
    setMenu(undefined);
    setName(action === "rename" ? folders.find((folder) => folder.id === id)?.name ?? "" : "");
    setParentId(action === "reparent" ? folders.find((folder) => folder.id === id)?.parentId ?? null : action === "create" ? id : null);
    setDeleteClips(deleteDefaults.clips);
    setDeleteDescendants(deleteDefaults.descendants);
    setPreview(null);
    setDialog({ action, id });
    if (action === "delete" && id !== null) {
      void invoke<FolderDeletePreview>("folder_delete_preview", { id }).then(setPreview).catch((error) => { onError(String(error)); close(); });
    }
  };
  const dropItems = (itemIds: number[], folderId: number | null) => {
    draggedItemIdsRef.current = null;
    setDropTarget(null);
    void invoke<number>("move_history_items_to_folder", { itemIds, folderId })
      .then(() => onMoved())
      .catch((error) => onError(String(error)));
  };
  useEffect(() => {
    const targetAt = (event: PointerEvent) => {
      const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-folder-drop-id]");
      return target && treeRef.current?.contains(target) ? target : null;
    };
    const hover = (event: PointerEvent) => {
      if (draggedItemIdsRef.current) setDropTarget(targetAt(event)?.dataset.folderDropId ?? null);
    };
    const release = (event: PointerEvent) => {
      const itemIds = draggedItemIdsRef.current;
      const target = targetAt(event);
      if (itemIds && target) {
        const destination = target.dataset.folderDropId;
        if (destination !== undefined) dropItems(itemIds, destination === "root" ? null : Number(destination));
      }
      setDropTarget(null);
    };
    window.addEventListener("pointermove", hover, true);
    window.addEventListener("pointerup", release, true);
    return () => {
      window.removeEventListener("pointermove", hover, true);
      window.removeEventListener("pointerup", release, true);
    };
  });
  useEffect(() => {
    if (moveRequest) openDialog("moveItems", null, moveRequest.trigger ?? undefined);
  }, [moveRequest]);
  useEffect(() => {
    if (dialog) dialogRef.current?.querySelector<HTMLElement>("input, select, button")?.focus();
  }, [dialog]);
  useEffect(() => {
    if (menu !== undefined) menuRef.current?.querySelector<HTMLElement>("button")?.focus();
  }, [menu]);
  useEffect(() => {
    if (menu === undefined) return;
    const dismiss = (event: PointerEvent) => {
      if (!(event.target instanceof Element) || (!menuRef.current?.contains(event.target) && !event.target.closest(".folder-more"))) setMenu(undefined);
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [menu]);
  useEffect(() => {
    if (!switcher) return;
    if (document.activeElement instanceof HTMLElement && !document.activeElement.closest(".folder-dialog")) {
      returnFocus.current = document.activeElement;
    }
    setSwitchQuery("");
    setSwitchIndex(0);
    switchInputRef.current?.focus();
  }, [switcher]);
  const run = async () => {
    if (!dialog || busy) return;
    if ((dialog.action === "create" || dialog.action === "rename") && !name.trim()) return;
    if (dialog.action === "delete" && !preview) return;
    setBusy(true);
    try {
      if (dialog.action === "create") {
        await invoke("create_folder", { parentId: dialog.id, name: name.trim() });
        setExpanded((previous) => new Set(previous).add(dialog.id ?? 0));
      }
      if (dialog.action === "rename") await invoke("rename_folder", { id: dialog.id, name: name.trim() });
      if (dialog.action === "reparent") await invoke("move_folder", { id: dialog.id, parentId });
      if (dialog.action === "delete") {
        await invoke("delete_folder", { id: dialog.id, deleteClips, deleteDescendants });
        const deleted = folders.find((f) => f.id === dialog.id);
        if (scope.kind === "folder" && (scope.folderId === dialog.id || (deleteDescendants && deleted && folders.find((f) => f.id === scope.folderId)?.path.startsWith(`${deleted.path}/`)))) onScopeChange({ kind: "all" });
        if (destination === dialog.id || (deleteDescendants && folders.some((f) => f.id === destination && f.path.startsWith(`${folders.find((x) => x.id === dialog.id)?.path}/`)))) await onDestinationChange(null);
      }
      if (dialog.action === "moveItems") {
        await invoke<number>("move_history_items_to_folder", { itemIds: moveItemIds, folderId: parentId });
        await onMoved();
      }
      await reload();
      close();
    } catch (error) { onError(String(error)); }
    finally { setBusy(false); }
  };
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
  const select = (id: number | null | "all", closeNarrow = true) => {
    onScopeChange(id === "all" ? { kind: "all" } : id === null ? { kind: "root" } : { kind: "folder", folderId: id });
    onSwitcherChange(false);
    if (narrow && closeNarrow) onTreeOpenChange(false);
  };
  const openMenu = (id: number | null | "all", target: HTMLElement, x: number, y: number) => {
    returnFocus.current = target;
    setMenuAnchor({ x, y });
    setMenu(id);
  };
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
        else document.querySelector<HTMLElement>(".history-feed-scroll")?.focus();
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
      document.querySelector<HTMLElement>(".history-feed-scroll")?.focus();
    }
  };
  const destinations = sorted.filter((f) => dialog?.action !== "reparent" || (f.id !== dialog.id && !f.path.startsWith(`${folders.find((x) => x.id === dialog.id)?.path}/`)));
  const switchResults: Array<{ id: number | null | "all"; path: string }> = ([
    { id: "all", path: "All history" },
    { id: null, path: "/" },
    ...sorted,
  ] satisfies Array<{ id: number | null | "all"; path: string }>).filter((folder) => folder.path.toLocaleLowerCase().includes(switchQuery.toLocaleLowerCase()));
  const activeSwitchIndex = Math.min(switchIndex, Math.max(0, switchResults.length - 1));
  useEffect(() => {
    if (switcher) document.getElementById(`folder-switch-option-${activeSwitchIndex}`)?.scrollIntoView({ block: "nearest" });
  }, [activeSwitchIndex, switcher, switchQuery]);
  const trapDialogFocus = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Tab") return;
    const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled)'));
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  };
  return <>
    <aside id="folder-tree" className={`folder-tree${treeOpen ? " is-open" : ""}`} aria-label="Folders" ref={treeRef} onKeyDown={onTreeKey}>
      <div className="folder-tree-heading">
        <span>Folders</span>
        <div className="folder-tree-heading-actions">
          <UiTooltip label="New folder"><button type="button" aria-label="New folder" onClick={(event) => openDialog("create", null, event.currentTarget)}><Plus size={15} aria-hidden="true" /></button></UiTooltip>
          <UiTooltip label={<span className="tooltip-shortcut-label"><span>Hide folders</span><ShortcutBadge shortcut="Ctrl+B" /></span>}>
            <button type="button" className="folder-tree-toggle" aria-label="Hide folders" aria-expanded={treeOpen} aria-controls="folder-tree" onClick={() => { onTreeOpenChange(false); requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(".folder-tree-reopen")?.focus()); }}><PanelLeftClose size={16} aria-hidden="true" /></button>
          </UiTooltip>
        </div>
      </div>
      <div className="folder-tree-list" role="tree" aria-label="History folders">
        {treeRows.map((row) => {
          const selected = row.id === "all" ? scope.kind === "all" : row.id === null ? scope.kind === "root" : scope.kind === "folder" && scope.folderId === row.id;
          const expansionId = typeof row.id === "number" ? row.id : 0;
          const open = expanded.has(expansionId);
          return <div key={String(row.id)} data-folder-drop-id={row.id === "all" ? undefined : row.id === null ? "root" : row.id} className={`folder-tree-entry${dropTarget === (row.id === null ? "root" : String(row.id)) ? " is-drop-target" : ""}`} style={{ paddingInlineStart: `${row.depth * 16 + 4}px` }} onContextMenu={(event) => {
            event.preventDefault();
            const target = event.currentTarget.querySelector<HTMLElement>('[role="treeitem"]');
            if (target) openMenu(row.id, target, event.clientX, event.clientY);
          }}>
            {row.children ? <button type="button" className="folder-expand" aria-label={`${open ? "Collapse" : "Expand"} ${row.label}`} onClick={() => setExpanded((prev) => { const next = new Set(prev); if (next.has(expansionId)) next.delete(expansionId); else next.add(expansionId); return next; })}>{open ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}</button> : <span className="folder-expand" />}
            <button type="button" role="treeitem" aria-level={row.depth + 1} aria-expanded={row.children ? open : undefined} aria-selected={selected} tabIndex={selected ? 0 : -1} data-folder-row={String(row.id)} className="folder-tree-name" title={row.id === "all" ? row.label : row.id === null ? "/" : folders.find((folder) => folder.id === row.id)?.path} onClick={() => select(row.id)}>
              {row.id === "all" ? <History size={15} aria-hidden="true" /> : open ? <FolderOpen size={15} aria-hidden="true" /> : <Folder size={15} aria-hidden="true" />}
              <span className="folder-tree-label">{row.label}</span>{dropTarget === (row.id === null ? "root" : String(row.id)) ? <span className="folder-drop-hint">Move {draggedItemIdsRef.current?.length}</span> : row.count !== null && <span className="folder-tree-count">{row.count}</span>}
            </button>
            {row.id !== "all" && <button type="button" className="folder-more" aria-label={`Actions for ${row.label}`} aria-haspopup="menu" onClick={(event) => { const bounds = event.currentTarget.getBoundingClientRect(); openMenu(row.id, event.currentTarget, bounds.left, bounds.bottom); }}><Ellipsis size={16} aria-hidden="true" /></button>}
          </div>;
        })}
      </div>
      <div className="folder-capture">
        <span>Captures → {destinationName}{destinationArmed ? " (armed)" : " (default)"}</span>
        <button type="button" disabled={scope.kind === "all" || (destinationArmed && destination === currentId)} onClick={() => void onDestinationChange(currentId, true).catch((e) => onError(String(e)))}>Arm {scope.kind === "root" ? "/" : "folder"}</button>
        {destinationArmed && <button type="button" onClick={() => void onDestinationChange(null, false).catch((error) => onError(String(error)))}>Disarm</button>}
      </div>
      {menu !== undefined && <div className="folder-context-menu" role="menu" aria-label={`Actions for ${menu === "all" ? "All history" : menu === null ? "/" : folders.find((folder) => folder.id === menu)?.name ?? "folder"}`} ref={menuRef} style={{ left: Math.max(8, Math.min(menuAnchor.x, window.innerWidth - 206)), top: Math.max(8, Math.min(menuAnchor.y, window.innerHeight - 220)) }} onKeyDown={(event) => {
        if (event.key === "Escape") { event.preventDefault(); close(); }
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
          const index = items.indexOf(document.activeElement as HTMLElement);
          items[(index + (event.key === "ArrowDown" ? 1 : items.length - 1)) % items.length]?.focus();
        }
      }}>
        <button role="menuitem" onClick={(event) => openDialog("create", menu === "all" ? null : menu, event.currentTarget)}>New {menu === "all" ? "root " : "child "}folder</button>
        {typeof menu === "number" && <><button role="menuitem" onClick={(event) => openDialog("rename", menu, event.currentTarget)}>Rename folder</button><button role="menuitem" onClick={(event) => openDialog("reparent", menu, event.currentTarget)}>Move folder</button><button role="menuitem" onClick={(event) => openDialog("delete", menu, event.currentTarget)}>Delete folder…</button></>}
        <button role="menuitem" onClick={close}>Close menu</button>
      </div>}
    </aside>
    {switcher && <div className="folder-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
      <div className="folder-dialog" role="dialog" aria-modal="true" aria-label="Switch folder" onKeyDown={(event) => {
        trapDialogFocus(event);
        if (event.key === "Escape") { event.preventDefault(); close(); }
      }}>
        <input ref={switchInputRef} className="folder-switch-input" aria-label="Find folder" role="combobox" aria-autocomplete="list" aria-controls="folder-switch-results" aria-expanded="true" aria-activedescendant={switchResults.length ? `folder-switch-option-${activeSwitchIndex}` : undefined} value={switchQuery} onChange={(event) => { setSwitchQuery(event.target.value); setSwitchIndex(0); }} onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            if (switchResults.length) setSwitchIndex((index) => (index + (event.key === "ArrowDown" ? 1 : switchResults.length - 1)) % switchResults.length);
          } else if (event.key === "Home" || event.key === "End") {
            event.preventDefault();
            setSwitchIndex(event.key === "Home" ? 0 : switchResults.length - 1);
          } else if (event.key === "Enter" && switchResults.length > 0) {
            event.preventDefault();
            select(switchResults[activeSwitchIndex].id);
            requestAnimationFrame(() => returnFocus.current?.focus());
          }
        }} />
        <div id="folder-switch-results" className="folder-switch-results" role="listbox" aria-label="Folders">{switchResults.map((folder, index) => <button type="button" role="option" aria-selected={index === activeSwitchIndex} id={`folder-switch-option-${index}`} key={String(folder.id)} onMouseEnter={() => setSwitchIndex(index)} onClick={() => {
          select(folder.id);
          requestAnimationFrame(() => returnFocus.current?.focus());
        }}>{folder.path}</button>)}</div>
        <button type="button" onClick={close}>Cancel</button>
      </div>
    </div>}
    {dialog && <div className="folder-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) close(); }}>
      <div className="folder-dialog" role="dialog" aria-modal="true" aria-label={`${dialog.action} folder`} ref={dialogRef} onKeyDown={(event) => {
        trapDialogFocus(event);
        if (event.key === "Escape" && !busy) { event.preventDefault(); close(); }
        if (event.key === "Enter" && ((event.target instanceof HTMLInputElement && event.target.type === "text") || (event.ctrlKey && !(event.target instanceof HTMLButtonElement)))) { event.preventDefault(); void run(); }
      }}>
        <h2>{dialog.action === "moveItems"
          ? `Move ${moveItemIds.length} clip${moveItemIds.length === 1 ? "" : "s"}`
          : `${dialog.action === "delete" ? "Delete" : dialog.action === "reparent" ? "Move" : dialog.action === "create" ? "New" : "Rename"} folder`}</h2>
      {(dialog.action === "create" || dialog.action === "rename") && <label>Name<input aria-label="Folder name" value={name} onChange={(event) => setName(event.target.value)} maxLength={160} /></label>}
      {(dialog.action === "reparent" || dialog.action === "moveItems") && <label>Destination<select value={parentId ?? "root"} onChange={(event) => setParentId(event.target.value === "root" ? null : Number(event.target.value))}><option value="root">/</option>{destinations.map((f) => <option key={f.id} value={f.id}>{f.path}</option>)}</select></label>}
      {dialog.action === "delete" && (preview ? <><p>{preview.directItemCount} direct clips; {preview.descendantFolderCount} descendant folders; {preview.subtreeItemCount} clips in subtree.</p><label><input type="checkbox" checked={deleteClips} onChange={(event) => setDeleteClips(event.target.checked)} /> Delete clips {deleteDescendants ? "in the entire subtree" : "directly in this folder"} ({deleteDescendants ? preview.subtreeItemCount : preview.directItemCount}) instead of moving them to /</label><label><input type="checkbox" checked={deleteDescendants} onChange={(event) => setDeleteDescendants(event.target.checked)} /> Delete {preview.descendantFolderCount} descendant folders instead of reparenting them</label><p>{deleteDescendants ? "The whole subtree is removed." : "Child folders move to this folder’s parent; their clips stay in place."} {deleteClips ? "Selected clips are permanently deleted." : "Affected clips are moved to /."}</p></> : <p>Loading exact counts…</p>)}
      {dialog.action === "moveItems" && parentId === null && <p>Unmarked clips outside Inbox become eligible for automatic retention on the next pruning pass.</p>}
      <div className="folder-dialog-actions"><button type="button" disabled={busy} onClick={close}>Cancel</button><button type="button" disabled={busy || (dialog.action === "delete" && !preview) || ((dialog.action === "create" || dialog.action === "rename") && !name.trim())} onClick={() => void run()}>{busy ? "Working…" : dialog.action === "delete" ? "Delete folder" : dialog.action === "moveItems" ? "Move clips" : dialog.action === "reparent" ? "Move folder" : dialog.action === "rename" ? "Rename folder" : "Create folder"}</button></div></div></div>}
  </>;
}
