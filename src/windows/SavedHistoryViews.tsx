import { useState } from "react";
import type { SavedHistoryView } from "../shared/contracts";

type ViewDraft = {
  title: string;
  query: string;
  hotkey: string;
  pinned: boolean;
};

const emptyDraft = (): ViewDraft => ({ title: "", query: "", hotkey: "", pinned: false });

export function SavedHistoryViews({
  views,
  loading,
  onCreate,
  onUpdate,
  onDelete,
  onOpen,
}: {
  views: SavedHistoryView[] | null;
  loading: boolean;
  onCreate: (draft: ViewDraft) => Promise<void>;
  onUpdate: (id: number, draft: ViewDraft) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onOpen: (id: number) => Promise<void>;
}) {
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState(emptyDraft);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      if (editingId === null) await onCreate(draft);
      else await onUpdate(editingId, draft);
      setDraft(emptyDraft());
      setCreating(false);
      setEditingId(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="saved-history-views">
      {(views ?? []).map((view) => (
        <div key={view.id} className="settings-tag-row">
          <div className="settings-tag-row-main">
            <strong>{view.title}</strong>
            <small>{view.query || "All history (unfiltered)"}</small>
            {view.hotkey ? <small>Hotkey: {view.hotkey}</small> : null}
          </div>
          <div className="settings-tag-row-actions">
            <button type="button" onClick={() => void onOpen(view.id)}>Open</button>
            <button type="button" onClick={() => {
              setDraft({ title: view.title, query: view.query, hotkey: view.hotkey ?? "", pinned: view.pinned });
              setEditingId(view.id);
              setCreating(true);
            }}>Edit</button>
            <button type="button" onClick={() => void onDelete(view.id)}>Delete</button>
          </div>
        </div>
      ))}
      {!creating ? (
        <button type="button" disabled={loading} onClick={() => setCreating(true)}>New saved view</button>
      ) : (
        <div className="saved-history-view-form">
          <label>Title<input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
          <label>Query<textarea value={draft.query} onChange={(event) => setDraft({ ...draft, query: event.target.value })} /></label>
          <label>Optional global hotkey<input value={draft.hotkey} placeholder="Ctrl+Shift+W" onChange={(event) => setDraft({ ...draft, hotkey: event.target.value })} /></label>
          <label><input type="checkbox" checked={draft.pinned} onChange={(event) => setDraft({ ...draft, pinned: event.target.checked })} /> Pin view</label>
          <div>
            <button type="button" disabled={busy} onClick={() => void save()}>{editingId === null ? "Create view" : "Save view"}</button>
            <button type="button" onClick={() => { setCreating(false); setEditingId(null); setDraft(emptyDraft()); }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
