import CodeMirror, {
  EditorState,
  EditorView,
  Prec,
  keymap,
  type Statistics,
} from "@uiw/react-codemirror";
import { useCallback, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import WrapText from "lucide-react/dist/esm/icons/wrap-text.mjs";
import {
  editorFontStack,
  editorLineHeightValue,
  type EditorSettings,
} from "../shared/settings";
import type {
  MetadataSelectionIntent,
  MetadataSelectionPayload,
  TagSummary,
} from "../shared/contracts";
import { UiAlert, UiButton, UiKbd } from "./controls";
import { MetadataInspector } from "./MetadataInspector";

type EditorStyle = CSSProperties & {
  "--editor-font-family": string;
  "--editor-font-size": string;
  "--editor-line-height": string;
};

type ItemContentEditorProps = {
  itemId: number;
  mimePrimary: string;
  value: string;
  error: string | null;
  settings: EditorSettings;
  metadataPayload: MetadataSelectionPayload;
  availableTags: TagSummary[];
  saving?: boolean;
  onChange: (value: string) => void;
  onCancel: () => void;
  onSave: (value: string, metadataIntent: MetadataSelectionIntent) => void;
};

export function ItemContentEditor({
  itemId,
  mimePrimary,
  value,
  error,
  settings,
  metadataPayload,
  availableTags,
  saving = false,
  onChange,
  onCancel,
  onSave,
}: ItemContentEditorProps) {
  const initialValueRef = useRef(value);
  const valueRef = useRef(value);
  const onCancelRef = useRef(onCancel);
  const onSaveRef = useRef(onSave);
  const metadataIntentRef = useRef<MetadataSelectionIntent>({
    itemIds: metadataPayload.snapshot.itemIds,
    expectedSnapshotToken: metadataPayload.snapshot.snapshotToken,
    title: { op: "untouched" },
    notes: { op: "untouched" },
    tags: [],
  });
  valueRef.current = value;
  onCancelRef.current = onCancel;
  onSaveRef.current = onSave;

  const [wrapLines, setWrapLines] = useState(settings.wrapLines);
  const [statistics, setStatistics] = useState<Statistics | null>(null);
  const [metadataDirty, setMetadataDirty] = useState(false);
  const [activePane, setActivePane] = useState<"content" | "metadata">("content");
  const [discardGuard, setDiscardGuard] = useState(false);
  const editorStyle: EditorStyle = {
    "--editor-font-family": editorFontStack(settings.fontFamily),
    "--editor-font-size": `${settings.fontSize}px`,
    "--editor-line-height": String(editorLineHeightValue(settings.lineHeight)),
  };
  const contentDirty = value !== initialValueRef.current;
  const dirty = contentDirty || metadataDirty;
  const line = statistics?.line.number ?? 1;
  const column = statistics
    ? statistics.selectionAsSingle.head - statistics.line.from + 1
    : 1;

  const save = useCallback(() => {
    if (!dirty || saving) return;
    onSaveRef.current(valueRef.current, metadataIntentRef.current);
  }, [dirty, saving]);

  const requestCancel = useCallback(() => {
    if (dirty) setDiscardGuard(true);
    else onCancelRef.current();
  }, [dirty]);

  const extensions = useMemo(() => [
    EditorView.contentAttributes.of({
      "aria-label": "Item content",
      "aria-multiline": "true",
    }),
    EditorState.tabSize.of(settings.tabSize),
    ...(wrapLines ? [EditorView.lineWrapping] : []),
    Prec.high(keymap.of([
      { key: "F2", run: () => { save(); return true; } },
      { key: "Mod-s", run: () => { save(); return true; } },
      { key: "Mod-Enter", run: () => { save(); return true; } },
      { key: "Escape", run: () => { requestCancel(); return true; } },
    ])),
  ], [requestCancel, save, settings.tabSize, wrapLines]);

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.defaultPrevented) return;
    if ((event.ctrlKey || event.metaKey) && (event.key.toLocaleLowerCase() === "s" || event.key === "Enter")) {
      event.preventDefault();
      save();
    } else if (event.key === "Escape") {
      event.preventDefault();
      requestCancel();
    }
  };

  return (
    <section
      className="item-content-editor"
      aria-label="Edit clipboard item"
      style={editorStyle}
      onKeyDown={handleKeyDown}
    >
      <header className="item-content-editor-header">
        <div>
          <strong>Edit clip</strong>
          <span>#{itemId} · {mimePrimary || "text/plain"}</span>
        </div>
        <span className={`item-content-editor-state${dirty ? " is-dirty" : ""}`}>
          {dirty ? "Modified" : "Saved"}
        </span>
      </header>

      <div className="item-editor-tabs" role="tablist" aria-label="Editor sections">
        <button
          type="button"
          role="tab"
          aria-selected={activePane === "content"}
          onClick={() => setActivePane("content")}
        >
          Content{contentDirty ? " ·" : ""}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activePane === "metadata"}
          onClick={() => setActivePane("metadata")}
        >
          Metadata{metadataDirty ? " ·" : ""}
        </button>
      </div>

      <div className={`item-content-editor-workspace is-${activePane}`}>
        <section className="item-content-editor-pane is-content" aria-label="Content editor">
          <div className="item-editor-pane-header">
            <strong>Content</strong>
            <UiButton
              type="button"
              variant="subtle"
              size="compact-xs"
              leftSection={<WrapText size={13} aria-hidden="true" />}
              aria-pressed={wrapLines}
              onClick={() => setWrapLines((current) => !current)}
            >
              Wrap
            </UiButton>
          </div>
          <div className="item-content-editor-canvas">
            <CodeMirror
              value={value}
              height="100%"
              width="100%"
              theme="none"
              autoFocus
              indentWithTab
              basicSetup={{
                lineNumbers: settings.lineNumbers,
                highlightActiveLine: settings.highlightActiveLine,
                highlightActiveLineGutter: settings.lineNumbers && settings.highlightActiveLine,
                highlightSelectionMatches: true,
                bracketMatching: true,
                closeBrackets: true,
                foldGutter: false,
              }}
              extensions={extensions}
              onChange={onChange}
              onStatistics={setStatistics}
            />
          </div>
        </section>

        <aside className="item-content-editor-pane is-metadata" aria-label="Metadata editor">
          <div className="item-editor-pane-header">
            <strong>Metadata</strong>
            <span>Title, notes and tags</span>
          </div>
          <MetadataInspector
            payload={metadataPayload}
            variant="existing-single"
            availableTags={availableTags}
            embedded
            guardDirtyOnCancel={false}
            showFooter={false}
            onIntentChange={(intent) => {
              metadataIntentRef.current = intent;
            }}
            onDirtyChange={setMetadataDirty}
            onCancel={requestCancel}
          />
        </aside>
      </div>

      {error ? <UiAlert className="error-text" color="red" variant="light">{error}</UiAlert> : null}

      <footer className="item-content-editor-footer">
        <div className="item-content-editor-status" aria-label="Editor status">
          <span>Ln {line}, Col {column}</span>
          <span>{statistics?.lineCount ?? 1} lines</span>
          <span>{statistics?.length ?? value.length} chars</span>
          {metadataDirty ? <span>Metadata modified</span> : null}
        </div>
        <div className="item-content-editor-actions">
          <span className="item-content-editor-hints">
            Find <UiKbd>Ctrl F</UiKbd> · Save <UiKbd>Ctrl S</UiKbd>
          </span>
          <UiButton type="button" variant="default" onClick={requestCancel}>Cancel</UiButton>
          <UiButton type="button" variant="filled" loading={saving} disabled={!dirty} onClick={save}>
            Save changes
          </UiButton>
        </div>
      </footer>

      {discardGuard ? (
        <div className="item-editor-dirty-guard" role="alertdialog" aria-label="Discard editor changes">
          <strong>Discard unsaved changes?</strong>
          <span>Content and metadata changes will be lost.</span>
          <div>
            <UiButton type="button" size="compact-sm" variant="default" onClick={() => setDiscardGuard(false)}>
              Keep editing
            </UiButton>
            <UiButton type="button" size="compact-sm" color="red" onClick={onCancelRef.current}>
              Discard changes
            </UiButton>
          </div>
        </div>
      ) : null}
    </section>
  );
}
