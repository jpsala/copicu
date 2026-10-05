import { invoke } from "@tauri-apps/api/core";
import Plus from "lucide-react/dist/esm/icons/plus.mjs";
import PanelLeftClose from "lucide-react/dist/esm/icons/panel-left-close.mjs";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { createPortal } from "react-dom";
import type { FolderSummary, FolderScope, FolderDeletePreview } from "../shared/contracts";
import { FolderNavigator } from "./FolderNavigator";
import { FolderSelect, type FolderChoice } from "./FolderSelect";
import { rankFolderResults } from "./folderModel";
import { ShortcutBadge } from "./ShortcutBadge";
import { UiTooltip } from "./controls";

export const folderScopeQuery = (scope: FolderScope) => scope.kind === "all" ? "" : scope.kind === "root" ? "folder:/" : `folder-id:${scope.folderId}`;
export const folderScopeLabel = (scope: FolderScope, folders: FolderSummary[]) => scope.kind === "all" ? "All history" : scope.kind === "root" ? "/" : folders.find((folder) => folder.id === scope.folderId)?.path ?? "Folder";

export function FolderWorkspace({ folders, reload, scope, onScopeChange, destination, destinationArmed, onDestinationChange, selectedItemIds, draggedItemIdsRef, moveRequest, onMoveRequestDone, onMoved, onError, onNotice, deleteDefaults, narrow, treeOpen, onTreeOpenChange, treeRef, switcher, onSwitcherChange, rootItemCount, onConnectShared }: {
  folders: FolderSummary[];
  reload: () => Promise<void>;
  scope: FolderScope;
  onScopeChange: (scope: FolderScope) => void;
  destination: number | null;
  destinationArmed: boolean;
  onDestinationChange: (id: number | null, armed?: boolean) => Promise<void>;
  selectedItemIds: number[];
  draggedItemIdsRef: RefObject<number[] | null>;
  moveRequest: { itemIds: number[]; trigger: HTMLElement | null; copy?: boolean } | null;
  onMoveRequestDone: () => void;
  onMoved: () => Promise<void>;
  onError: (error: string) => void;
  onNotice?: (message: string) => void;
  deleteDefaults: { clips: boolean; descendants: boolean };
  narrow: boolean;
  treeOpen: boolean;
  onTreeOpenChange: (open: boolean) => void;
  treeRef: RefObject<HTMLDivElement | null>;
  switcher: boolean;
  onSwitcherChange: (open: boolean) => void;
  rootItemCount: number | null;
  onConnectShared?: (scope: FolderScope) => void;
}) {
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set([0]));
  const [menu, setMenu] = useState<number | null | "all" | undefined>();
  const [menuAnchor, setMenuAnchor] = useState({ x: 0, y: 0 });
  const [dialog, setDialog] = useState<{ action: "create" | "rename" | "reparent" | "delete" | "moveItems"; id: number | null } | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [destinationChoice, setDestinationChoice] = useState<FolderChoice>({ kind: "existing", folderId: null });
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
    setDestinationChoice({ kind: "existing", folderId: action === "reparent" ? folders.find((folder) => folder.id === id)?.parentId ?? null : null });
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
    if (!treeOpen) setMenu(undefined);
  }, [treeOpen]);
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
      if (dialog.action === "reparent" && destinationChoice.kind === "existing") await invoke("move_folder", { id: dialog.id, parentId: destinationChoice.folderId });
      if (dialog.action === "delete") {
        await invoke("delete_folder", { id: dialog.id, deleteClips, deleteDescendants });
        const deleted = folders.find((f) => f.id === dialog.id);
        if (scope.kind === "folder" && (scope.folderId === dialog.id || (deleteDescendants && deleted && folders.find((f) => f.id === scope.folderId)?.path.startsWith(`${deleted.path}/`)))) onScopeChange({ kind: "all" });
        if (destination === dialog.id || (deleteDescendants && folders.some((f) => f.id === destination && f.path.startsWith(`${folders.find((x) => x.id === dialog.id)?.path}/`)))) await onDestinationChange(null);
      }
      if (dialog.action === "moveItems") {
        const args = { itemIds: moveItemIds, folderId: destinationChoice.kind === "existing" ? destinationChoice.folderId : null, folderPath: destinationChoice.kind === "create" ? destinationChoice.path : null };
        if (moveRequest?.copy) {
          const result = await invoke<{created: number; existing: number}>("copy_history_items_to_folder", args);
          onNotice?.(result.created === 0 ? "Already in this folder. Originals and destination metadata were kept." : `${result.created} copied${result.existing ? `; ${result.existing} already in this folder` : ""}. Originals were kept.`);
        } else await invoke<number>("move_history_items_to_folder", args);
        await onMoved();
      }
      await reload();
      close();
    } catch (error) { onError(String(error)); }
    finally { setBusy(false); }
  };
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
  const excludedDestinations = dialog?.action === "reparent" ? sorted.filter((f) => f.id === dialog.id || f.path.startsWith(`${folders.find((x) => x.id === dialog.id)?.path}/`)).map((f) => f.id) : [];
  const switchResults: Array<{ id: number | null | "all"; path: string }> = ([
    { id: "all", path: "All history" },
    ...rankFolderResults(folders, switchQuery),
  ] satisfies Array<{ id: number | null | "all"; path: string }>).filter((folder) => folder.id !== "all" || folder.path.toLocaleLowerCase().includes(switchQuery.toLocaleLowerCase()));
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
    <aside id="folder-tree" className={`folder-tree${treeOpen ? " is-open" : ""}`} aria-label="Folders" ref={treeRef}>
      <div className="folder-tree-heading">
        <span>Folders</span>
        <div className="folder-tree-heading-actions">
          <UiTooltip label="New folder"><button type="button" aria-label="New folder" onClick={(event) => openDialog("create", null, event.currentTarget)}><Plus size={15} aria-hidden="true" /></button></UiTooltip>
          <UiTooltip label={<span className="tooltip-shortcut-label"><span>Hide folders</span><ShortcutBadge shortcut="Ctrl+B" /></span>}>
            <button type="button" className="folder-tree-toggle" aria-label="Hide folders" aria-expanded={treeOpen} aria-controls="folder-tree" onClick={() => { onTreeOpenChange(false); requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(".folder-tree-reopen")?.focus()); }}><PanelLeftClose size={16} aria-hidden="true" /></button>
          </UiTooltip>
        </div>
      </div>
      <FolderNavigator folders={folders} scope={scope} expanded={expanded} setExpanded={setExpanded} rootItemCount={rootItemCount} treeRef={treeRef} dropTarget={dropTarget} draggedItemCount={draggedItemIdsRef.current?.length} select={select} openMenu={openMenu} onExit={() => document.querySelector<HTMLElement>(".history-feed-scroll")?.focus()} />
      <div className="folder-capture">
        <span>Captures → {destinationName}{destinationArmed ? " (armed)" : " (default)"}</span>
        <button type="button" disabled={scope.kind === "all" || (destinationArmed && destination === currentId)} onClick={() => void onDestinationChange(currentId, true).catch((e) => onError(String(e)))}>Arm {scope.kind === "root" ? "/" : "folder"}</button>
        {destinationArmed && <button type="button" onClick={() => void onDestinationChange(null, false).catch((error) => onError(String(error)))}>Disarm</button>}
      </div>
      {menu !== undefined && createPortal(<div className="folder-context-menu" role="menu" aria-label={`Actions for ${menu === "all" ? "All history" : menu === null ? "/" : folders.find((folder) => folder.id === menu)?.name ?? "folder"}`} ref={menuRef} style={{ left: Math.max(8, Math.min(menuAnchor.x, window.innerWidth - 206)), top: Math.max(8, Math.min(menuAnchor.y, window.innerHeight - 220)) }} onKeyDown={(event) => {
        if (event.key === "Escape") { event.preventDefault(); close(); }
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
          const index = items.indexOf(document.activeElement as HTMLElement);
          items[(index + (event.key === "ArrowDown" ? 1 : items.length - 1)) % items.length]?.focus();
        }
      }}>
        <button role="menuitem" onClick={(event) => openDialog("create", menu === "all" ? null : menu, event.currentTarget)}>New {menu === "all" ? "root " : "child "}folder</button>
        {onConnectShared && <button role="menuitem" onClick={() => { const target: FolderScope = menu === "all" ? { kind: "all" } : menu === null ? { kind: "root" } : { kind: "folder", folderId: menu }; setMenu(undefined); onConnectShared(target); }}>Connect shared clipboard…</button>}
        {typeof menu === "number" && <><button role="menuitem" onClick={(event) => openDialog("rename", menu, event.currentTarget)}>Rename folder</button><button role="menuitem" onClick={(event) => openDialog("reparent", menu, event.currentTarget)}>Move folder</button><button role="menuitem" onClick={(event) => openDialog("delete", menu, event.currentTarget)}>Delete folder…</button></>}
        <button role="menuitem" onClick={close}>Close menu</button>
      </div>, document.body)}
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
      <div className="folder-dialog" role="dialog" aria-modal="true" aria-label={`${moveRequest?.copy && dialog.action === "moveItems" ? "copyItems" : dialog.action} folder`} ref={dialogRef} onKeyDown={(event) => {
        trapDialogFocus(event);
        if (event.key === "Escape" && !busy) { event.preventDefault(); close(); }
        if (event.key === "Enter" && ((event.target instanceof HTMLInputElement && event.target.type === "text") || (event.ctrlKey && !(event.target instanceof HTMLButtonElement)))) { event.preventDefault(); void run(); }
      }}>
        <h2>{dialog.action === "moveItems"
          ? `${moveRequest?.copy ? "Copy" : "Move"} ${moveItemIds.length} clip${moveItemIds.length === 1 ? "" : "s"}`
          : `${dialog.action === "delete" ? "Delete" : dialog.action === "reparent" ? "Move" : dialog.action === "create" ? "New" : "Rename"} folder`}</h2>
      {(dialog.action === "create" || dialog.action === "rename") && <label>Name<input aria-label="Folder name" value={name} onChange={(event) => setName(event.target.value)} maxLength={160} /></label>}
      {(dialog.action === "reparent" || dialog.action === "moveItems") && <FolderSelect label="Destination" folders={folders} value={destinationChoice} onChange={setDestinationChoice} excludeIds={excludedDestinations} allowCreate={dialog.action === "moveItems"} disabled={busy} />}
      {dialog.action === "moveItems" && moveRequest?.copy && <p>Keep the originals. Content already in the destination is reused without changing its metadata.</p>}
      {dialog.action === "delete" && (preview ? <><p>{preview.directItemCount} direct clips; {preview.descendantFolderCount} descendant folders; {preview.subtreeItemCount} clips in subtree.</p><label><input type="checkbox" checked={deleteClips} onChange={(event) => setDeleteClips(event.target.checked)} /> Delete clips {deleteDescendants ? "in the entire subtree" : "directly in this folder"} ({deleteDescendants ? preview.subtreeItemCount : preview.directItemCount}) instead of moving them to /</label><label><input type="checkbox" checked={deleteDescendants} onChange={(event) => setDeleteDescendants(event.target.checked)} /> Delete {preview.descendantFolderCount} descendant folders instead of reparenting them</label><p>{deleteDescendants ? "The whole subtree is removed." : "Child folders move to this folder’s parent; their clips stay in place."} {deleteClips ? "Selected clips are permanently deleted." : "Affected clips are moved to /."}</p></> : <p>Loading exact counts…</p>)}
      {dialog.action === "moveItems" && destinationChoice.kind === "existing" && destinationChoice.folderId === null && <p>Unmarked clips outside Inbox become eligible for automatic retention on the next pruning pass.</p>}
      <div className="folder-dialog-actions"><button type="button" disabled={busy} onClick={close}>Cancel</button><button type="button" disabled={busy || (dialog.action === "delete" && !preview) || ((dialog.action === "create" || dialog.action === "rename") && !name.trim())} onClick={() => void run()}>{busy ? "Working…" : dialog.action === "delete" ? "Delete folder" : dialog.action === "moveItems" ? (moveRequest?.copy ? "Copy clips" : "Move clips") : dialog.action === "reparent" ? "Move folder" : dialog.action === "rename" ? "Rename folder" : "Create folder"}</button></div></div></div>}
  </>;
}
