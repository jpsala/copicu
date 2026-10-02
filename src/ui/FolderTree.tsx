import ChevronDown from "lucide-react/dist/esm/icons/chevron-down.mjs";
import ChevronRight from "lucide-react/dist/esm/icons/chevron-right.mjs";
import Folder from "lucide-react/dist/esm/icons/folder.mjs";
import FolderOpen from "lucide-react/dist/esm/icons/folder-open.mjs";
import History from "lucide-react/dist/esm/icons/history.mjs";
import Check from "lucide-react/dist/esm/icons/check.mjs";
import { Fragment, type HTMLAttributes, type KeyboardEventHandler, type ReactNode } from "react";

export type FolderTreeRow = {
  id: string;
  label: ReactNode;
  labelText?: string;
  title?: string;
  depth: number;
  hasChildren: boolean;
  expanded: boolean;
  selected: boolean;
  current?: boolean;
  muted?: boolean;
  tabIndex?: number;
};

export type FolderTreeProps = {
  rows: FolderTreeRow[];
  treeId: string;
  ariaLabel: string;
  className?: string;
  activeId: string;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
  onConfirm?: (id: string) => void;
  onKeyDown?: KeyboardEventHandler<HTMLDivElement>;
  renderAfterRow?: (row: FolderTreeRow) => ReactNode;
  renderTrailing?: (row: FolderTreeRow) => ReactNode;
  renderDetail?: (row: FolderTreeRow) => ReactNode;
  rowProps?: (row: FolderTreeRow) => HTMLAttributes<HTMLDivElement>;
};

/** Shared tree presentation; consumers own filtering, expansion and navigation. */
export function FolderTree({ rows, treeId, ariaLabel, className, activeId, onSelect, onToggle, onConfirm, onKeyDown, renderAfterRow, renderTrailing, renderDetail, rowProps }: FolderTreeProps) {
  return <div id={treeId} className={`folder-tree-list${className ? ` ${className}` : ""}`} role="tree" aria-label={ariaLabel} onKeyDown={onKeyDown}>
    {rows.map((row) => {
      const props = rowProps?.(row) ?? {};
      const disclosureLabel = row.labelText ?? (typeof row.label === "string" ? row.label : row.title ?? "folder");
      return <Fragment key={row.id}>
        <div {...props} className={`folder-tree-entry${row.muted ? " is-muted" : ""}${props.className ? ` ${props.className}` : ""}`} style={{ paddingInlineStart: `${row.depth * 10 + 4}px`, ...props.style }}>
          {row.hasChildren ? <button type="button" className="folder-expand" tabIndex={-1} aria-label={`${row.expanded ? "Collapse" : "Expand"} ${disclosureLabel}`} onClick={() => onToggle(row.id)}>{row.expanded ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}</button> : <span className="folder-expand" aria-hidden="true" />}
          <button type="button" id={`${treeId}-${row.id}`} role="treeitem" aria-level={row.depth + 1} aria-expanded={row.hasChildren ? row.expanded : undefined} aria-selected={row.selected} tabIndex={row.tabIndex ?? (row.id === activeId ? 0 : -1)} data-folder-row={row.id} className="folder-tree-name" title={row.title} onClick={() => onSelect(row.id)} onDoubleClick={onConfirm ? () => onConfirm(row.id) : undefined}>
            {row.id === "all" ? <History size={15} aria-hidden="true" /> : row.expanded ? <FolderOpen size={15} aria-hidden="true" /> : <Folder size={15} aria-hidden="true" />}
            <span className="folder-tree-label">{row.label}</span>
            {row.current && <Check size={14} className="folder-tree-current" aria-label="Current folder" />}
            {renderDetail?.(row)}
          </button>
          {renderTrailing?.(row)}
        </div>
        {renderAfterRow?.(row)}
      </Fragment>;
    })}
  </div>;
}
