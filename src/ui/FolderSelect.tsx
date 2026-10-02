import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import ChevronDown from "lucide-react/dist/esm/icons/chevron-down.mjs";
import Folder from "lucide-react/dist/esm/icons/folder.mjs";
import Plus from "lucide-react/dist/esm/icons/plus.mjs";
import Search from "lucide-react/dist/esm/icons/search.mjs";
import X from "lucide-react/dist/esm/icons/x.mjs";
import type { FolderSummary } from "../shared/contracts";
import { FolderTree, type FolderTreeRow } from "./FolderTree";
import { folderFullPath, folderTreeEntries, planFolderPath, type FolderChoice } from "./folderModel";
import "./folderSelect.css";

export type { FolderChoice } from "./folderModel";
export type FolderSelectProps = {
  folders: FolderSummary[];
  value: FolderChoice | null;
  onChange: (choice: FolderChoice) => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  excludeIds?: number[];
  allowCreate?: boolean;
};
const rowKey = (folderId: number | null) => String(folderId);
const folderIdFromKey = (key: string) => key === "null" ? null : Number(key);

function MatchingName({ name, query }: { name: string; query: string }) {
  const words = query.trim().toLocaleLowerCase().split(/[\s/]+/).filter(Boolean);
  const lower = name.toLocaleLowerCase();
  const marked = Array.from(name, (_, index) => words.some(word => {
    let start = lower.indexOf(word);
    while (start >= 0) {
      if (index >= start && index < start + word.length) return true;
      start = lower.indexOf(word, start + 1);
    }
    return false;
  }));
  const parts: Array<{ text: string; match: boolean }> = [];
  Array.from(name).forEach((letter, index) => {
    const previous = parts.at(-1);
    if (previous?.match === marked[index]) previous.text += letter;
    else parts.push({ text: letter, match: marked[index] });
  });
  return <>{parts.map((part, index) => part.match ? <mark key={index}>{part.text}</mark> : part.text)}</>;
}

/** A destination tree. Selection and creation are committed only to the caller's draft. */
export function FolderSelect({ folders, value, onChange, label = "Folder", placeholder = "Choose folder", disabled = false, excludeIds = [], allowCreate = true }: FolderSelectProps) {
  const id = useId();
  const treeId = `${id}-tree`;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(new Set<number>([0]));
  const [filteredExpanded, setFilteredExpanded] = useState(new Set<number>([0]));
  const [activeId, setActiveId] = useState<number | null>(null);
  const [creation, setCreation] = useState<{ parentId: number | null; previousQuery: string } | null>(null);
  const [newName, setNewName] = useState("");
  const [position, setPosition] = useState<CSSProperties>({ visibility: "hidden" });
  const searching = query.trim().length > 0;
  const entries = useMemo(() => folderTreeEntries(folders, query, searching ? filteredExpanded : expanded, excludeIds), [folders, query, searching, filteredExpanded, expanded, excludeIds]);
  const active = entries.find(entry => entry.id === activeId);
  const creationParent = folders.find(folder => folder.id === creation?.parentId);
  const creationPath = creationParent ? folderFullPath(creationParent.path) : "/";
  const plan = planFolderPath(folders, newName, creationPath, excludeIds);
  const nameError = newName.trim().startsWith("/") ? "Enter a name or relative path." : plan.error;
  const canCreate = newName.trim().length > 0 && !nameError;
  const exists = canCreate && plan.existingFolderId !== undefined;
  const displayPath = value?.kind === "create" ? folderFullPath(value.path) : value?.kind === "existing" ? (value.folderId === null ? "/" : folderFullPath(folders.find(folder => folder.id === value.folderId)?.path ?? "Unknown folder")) : placeholder;
  const reveal = (folderId: number | null, base = new Set<number>([0])) => {
    const next = new Set(base).add(0);
    let current = folders.find(folder => folder.id === folderId);
    const seen = new Set<number>();
    while (current && !seen.has(current.id)) {
      seen.add(current.id); next.add(current.id);
      current = folders.find(folder => folder.id === current?.parentId);
    }
    return next;
  };
  const close = (restoreFocus = true) => {
    setOpen(false);
    if (restoreFocus) requestAnimationFrame(() => triggerRef.current?.focus());
  };
  const choose = (choice: FolderChoice) => { onChange(choice); close(); };
  const confirm = () => {
    if (creation) {
      if (canCreate) choose(plan.existingFolderId !== undefined ? { kind: "existing", folderId: plan.existingFolderId } : { kind: "create", path: plan.path });
    } else if (active) choose({ kind: "existing", folderId: active.id });
  };
  const cancelCreation = () => {
    if (!creation) return;
    setQuery(creation.previousQuery); setCreation(null);
    requestAnimationFrame(() => searchRef.current?.focus());
  };
  const startCreation = () => {
    const parentId = active?.id ?? null;
    setCreation({ parentId, previousQuery: query });
    setNewName(!active && !query.includes("/") ? query.trim() : "");
    setExpanded(reveal(parentId, expanded)); setActiveId(parentId); setQuery("");
  };
  const changeQuery = (nextQuery: string) => {
    setQuery(nextQuery);
    const allExpanded = new Set([0, ...folders.map(folder => folder.id)]);
    setFilteredExpanded(allExpanded);
    const candidates = folderTreeEntries(folders, nextQuery, nextQuery.trim() ? allExpanded : expanded, excludeIds);
    if (nextQuery.trim()) setActiveId(candidates.find(entry => entry.matches)?.id ?? null);
    else if (!candidates.some(entry => entry.id === activeId)) setActiveId(null);
  };
  const toggle = (key: string) => {
    if (creation) return;
    const folderId = folderIdFromKey(key);
    const setter = searching ? setFilteredExpanded : setExpanded;
    setter(previous => {
      const next = new Set(previous);
      if (next.has(folderId ?? 0)) next.delete(folderId ?? 0); else next.add(folderId ?? 0);
      return next;
    });
    setActiveId(folderId);
  };
  const focusRow = (folderId: number | null) => {
    setActiveId(folderId);
    requestAnimationFrame(() => document.getElementById(`${treeId}-${rowKey(folderId)}`)?.focus());
  };
  const onTreeKey = (event: KeyboardEvent<HTMLElement>) => {
    if (creation) return;
    const fromSearch = event.target === searchRef.current;
    const move = (folderId: number | null) => fromSearch ? setActiveId(folderId) : focusRow(folderId);
    const index = entries.findIndex(entry => entry.id === activeId);
    if (event.key === "Enter") { event.preventDefault(); confirm(); }
    else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const next = entries[Math.max(0, Math.min(entries.length - 1, index + (event.key === "ArrowDown" ? 1 : -1)))];
      if (next) move(next.id);
    } else if ((!fromSearch || !query) && (event.key === "ArrowLeft" || event.key === "ArrowRight") && active) {
      event.preventDefault();
      if (event.key === "ArrowRight") {
        if (active.hasChildren && !active.expanded) toggle(rowKey(active.id));
        else if (entries[index + 1]?.depth > active.depth) move(entries[index + 1].id);
      } else if (active.hasChildren && active.expanded) toggle(rowKey(active.id));
      else if (active.id !== null) move(active.parentId);
    } else if (!fromSearch && (event.key === "Home" || event.key === "End")) {
      event.preventDefault();
      const next = event.key === "Home" ? entries[0] : entries.at(-1);
      if (next) move(next.id);
    } else if (!fromSearch && event.key === " ") event.preventDefault();
  };
  useLayoutEffect(() => {
    if (!open) return;
    const reposition = () => {
      const bounds = triggerRef.current?.getBoundingClientRect();
      if (!bounds) return;
      const width = Math.min(Math.max(bounds.width, 340), 440, window.innerWidth - 16);
      const below = window.innerHeight - bounds.bottom - 12;
      const above = bounds.top - 12;
      const placeBelow = below >= 280 || below >= above;
      setPosition({ width, left: Math.max(8, Math.min(bounds.left, window.innerWidth - width - 8)), ...(placeBelow ? { top: bounds.bottom + 4 } : { bottom: window.innerHeight - bounds.top + 4 }), maxHeight: Math.max(120, placeBelow ? below : above) });
    };
    reposition();
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => { window.removeEventListener("resize", reposition); window.removeEventListener("scroll", reposition, true); };
  }, [open]);
  useLayoutEffect(() => {
    if (open && position.visibility !== "hidden") {
      if (creation) { nameRef.current?.focus(); nameRef.current?.scrollIntoView({ block: "nearest" }); }
      else searchRef.current?.focus();
    }
  }, [open, !!creation, position.visibility]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!panelRef.current?.contains(event.target as Node) && !triggerRef.current?.contains(event.target as Node)) close(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);
  useEffect(() => {
    if (open && !creation) document.getElementById(`${treeId}-${rowKey(activeId)}`)?.scrollIntoView?.({ block: "nearest" });
  }, [open, creation, activeId, treeId, query]);
  const rows: FolderTreeRow[] = entries.map(entry => ({
    id: rowKey(entry.id), label: <MatchingName name={entry.name} query={query} />, labelText: entry.name, title: folderFullPath(entry.path),
    depth: entry.depth, hasChildren: entry.hasChildren || creation?.parentId === entry.id, expanded: entry.expanded,
    selected: entry.id === activeId, current: value?.kind === "existing" && value.folderId === entry.id,
    muted: searching && !entry.matches, ...(creation ? { tabIndex: -1 } : {}),
  }));
  return <div className="folder-select">
    <span className="folder-select-label" id={`${id}-label`}>{label}</span>
    <button ref={triggerRef} type="button" className="folder-select-trigger" disabled={disabled} aria-labelledby={`${id}-label ${id}-value`} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? `${id}-panel` : undefined} onClick={() => {
      if (open) { close(); return; }
      const draftPlan = value?.kind === "create" ? planFolderPath(folders, value.path) : null;
      const initialId = value?.kind === "existing" ? value.folderId : folders.find(folder => folderFullPath(folder.path) === draftPlan?.parentPath)?.id ?? null;
      const safeId = initialId !== null && excludeIds.includes(initialId) ? null : initialId;
      setExpanded(reveal(safeId)); setActiveId(safeId); setQuery("");
      setCreation(draftPlan ? { parentId: safeId, previousQuery: "" } : null);
      setNewName(draftPlan?.missingSegments.join("/") ?? "");
      setPosition({ visibility: "hidden" }); setOpen(true);
    }}><Folder size={15} aria-hidden="true" /><span id={`${id}-value`} title={displayPath}>{displayPath}</span>{value?.kind === "create" && <small>New</small>}<ChevronDown size={15} aria-hidden="true" /></button>
    {open && createPortal(<div id={`${id}-panel`} ref={panelRef} className="folder-select-panel" role="dialog" aria-label={`Choose ${label.toLocaleLowerCase()}`} style={position} onKeyDown={event => {
      event.stopPropagation();
      if (event.key === "Escape") { event.preventDefault(); if (creation) cancelCreation(); else close(); }
      if (event.key === "Tab") {
        const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('input:not(:disabled), button:not(:disabled):not([tabindex="-1"])'));
        const atBoundary = event.shiftKey ? document.activeElement === controls[0] : document.activeElement === controls.at(-1);
        if (atBoundary) {
          const sourceControls = Array.from(document.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]')).filter(control => !panelRef.current?.contains(control) && control.tabIndex >= 0 && control.getClientRects().length > 0);
          const triggerIndex = sourceControls.indexOf(triggerRef.current!);
          const destination = event.shiftKey ? triggerRef.current : sourceControls[triggerIndex + 1] ?? triggerRef.current;
          event.preventDefault(); close(false); destination?.focus();
        }
      }
    }} onBlur={event => {
      if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node) && event.relatedTarget !== triggerRef.current) close(false);
    }}>
      <div className="folder-select-search"><Search size={15} aria-hidden="true" /><input ref={searchRef} disabled={!!creation} spellCheck={false} autoComplete="off" value={query} aria-label="Search folders" placeholder="Search folders" role="combobox" aria-expanded="true" aria-autocomplete="list" aria-haspopup="tree" aria-controls={treeId} aria-activedescendant={active ? `${treeId}-${rowKey(active.id)}` : undefined} onChange={event => changeQuery(event.target.value)} onKeyDown={onTreeKey} />{query && <button type="button" aria-label="Clear folder search" onClick={() => { changeQuery(""); searchRef.current?.focus(); }}><X size={14} aria-hidden="true" /></button>}</div>
      <FolderTree treeId={treeId} ariaLabel="Folder destinations" rows={rows} activeId={rowKey(activeId)} onSelect={key => { if (creation) setCreation(null); setActiveId(folderIdFromKey(key)); }} onToggle={toggle} onConfirm={key => { if (!creation) choose({ kind: "existing", folderId: folderIdFromKey(key) }); }} onKeyDown={onTreeKey} renderAfterRow={row => creation && row.id === rowKey(creation.parentId) ? <div className="folder-select-inline" style={{ paddingInlineStart: (row.depth + 1) * 10 + 26 }}>
        <div className="folder-select-inline-entry"><Folder size={15} aria-hidden="true" /><input ref={nameRef} aria-label="Folder name" aria-describedby={`${id}-creation-status`} aria-invalid={!!newName.trim() && !!nameError} spellCheck={false} autoComplete="off" placeholder="New folder" value={newName} onChange={event => setNewName(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); event.stopPropagation(); confirm(); } }} /><button type="button" aria-label="Cancel new folder" title="Cancel new folder" onClick={cancelCreation}><X size={14} aria-hidden="true" /></button></div>
        <p id={`${id}-creation-status`} role="status" className={newName.trim() && nameError ? "folder-select-error" : "folder-select-help"}>{newName.trim() && nameError ? nameError : exists ? "This folder already exists." : "Created when you save."}</p>
      </div> : null} />
      {!entries.length && <p className="folder-select-empty">No matching folders.</p>}
      <div className="folder-select-footer">{allowCreate && !creation && <button type="button" title={`New folder in ${active ? folderFullPath(active.path) : "/"}`} onClick={startCreation}><Plus size={14} aria-hidden="true" />New folder</button>}{creation && <span className="folder-select-key-hint">Esc to cancel</span>}<button type="button" className="folder-select-confirm" disabled={creation ? !canCreate : !active} onClick={confirm}>{creation && !exists ? "Create and choose" : "Choose folder"}</button></div>
    </div>, document.body)}
  </div>;
}
