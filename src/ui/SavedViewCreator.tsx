import { useEffect, useState } from "react";
import Bookmark from "lucide-react/dist/esm/icons/bookmark.mjs";
import X from "lucide-react/dist/esm/icons/x.mjs";
import { UiButton, UiIconButton, UiTextInput, UiTooltip } from "./controls";

export function SavedViewCreator({
  currentQuery,
  busy,
  onClose,
  onCreate,
}: {
  currentQuery: string;
  busy: boolean;
  onClose: () => void;
  onCreate: (title: string) => Promise<void>;
}) {
  const [title, setTitle] = useState("");

  useEffect(() => {
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", closeOnEscape, true);
    return () => window.removeEventListener("keydown", closeOnEscape, true);
  }, [onClose]);

  const submit = async () => {
    try {
      await onCreate(title);
      onClose();
    } catch {
      // The parent reports the storage error and the form stays open for correction.
    }
  };

  return (
    <div
      className="scenario-switcher-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Save current search"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="scenario-switcher-panel saved-view-creator-panel">
        <header className="scenario-switcher-header">
          <div>
            <strong>Save current search</strong>
            <span>Name this filter so you can reopen it from Saved searches.</span>
          </div>
          <UiTooltip label="Close saved search creator">
            <UiIconButton type="button" variant="subtle" aria-label="Close saved search creator" onClick={onClose}>
              <X size={14} strokeWidth={2.3} aria-hidden="true" />
            </UiIconButton>
          </UiTooltip>
        </header>

        <form
          className="scenario-create-form"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div className="scenario-create-query">
            <span>Saved filter</span>
            <code>{currentQuery || "All history"}</code>
          </div>
          <UiTextInput
            autoFocus
            required
            label="Saved search name"
            aria-label="Saved search name"
            value={title}
            placeholder="Recent project images"
            leftSection={<Bookmark size={14} strokeWidth={2.2} aria-hidden="true" />}
            onChange={(event) => setTitle(event.currentTarget.value)}
          />
          <div className="scenario-create-actions">
            <UiButton type="button" variant="default" disabled={busy} onClick={onClose}>Cancel</UiButton>
            <UiButton type="submit" variant="filled" loading={busy} disabled={!title.trim()}>Save search</UiButton>
          </div>
        </form>
      </div>
    </div>
  );
}
