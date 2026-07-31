import CodeMirror, {
  EditorState,
  EditorView,
  Prec,
  keymap,
  type Statistics,
} from "@uiw/react-codemirror";
import { useMemo, useRef, useState, type CSSProperties } from "react";
import WrapText from "lucide-react/dist/esm/icons/wrap-text.mjs";
import {
  editorFontStack,
  editorLineHeightValue,
  type EditorSettings,
} from "../shared/settings";
import { UiAlert, UiButton, UiKbd } from "./controls";

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
  onChange: (value: string) => void;
  onCancel: () => void;
  onSave: (value: string) => void;
};

export function ItemContentEditor({
  itemId,
  mimePrimary,
  value,
  error,
  settings,
  onChange,
  onCancel,
  onSave,
}: ItemContentEditorProps) {
  const initialValueRef = useRef(value);
  const valueRef = useRef(value);
  const onCancelRef = useRef(onCancel);
  const onSaveRef = useRef(onSave);
  valueRef.current = value;
  onCancelRef.current = onCancel;
  onSaveRef.current = onSave;
  const [wrapLines, setWrapLines] = useState(settings.wrapLines);
  const [statistics, setStatistics] = useState<Statistics | null>(null);
  const editorStyle: EditorStyle = {
    "--editor-font-family": editorFontStack(settings.fontFamily),
    "--editor-font-size": `${settings.fontSize}px`,
    "--editor-line-height": String(editorLineHeightValue(settings.lineHeight)),
  };
  const dirty = value !== initialValueRef.current;
  const line = statistics?.line.number ?? 1;
  const column = statistics
    ? statistics.selectionAsSingle.head - statistics.line.from + 1
    : 1;

  const extensions = useMemo(() => [
    EditorView.contentAttributes.of({
      "aria-label": "Item content",
      "aria-multiline": "true",
    }),
    EditorState.tabSize.of(settings.tabSize),
    ...(wrapLines ? [EditorView.lineWrapping] : []),
    Prec.high(keymap.of([
      { key: "F2", run: () => { onSaveRef.current(valueRef.current); return true; } },
      { key: "Mod-s", run: () => { onSaveRef.current(valueRef.current); return true; } },
      { key: "Mod-Enter", run: () => { onSaveRef.current(valueRef.current); return true; } },
      { key: "Escape", run: () => { onCancelRef.current(); return true; } },
    ])),
  ], [settings.tabSize, wrapLines]);

  return (
    <section
      className="item-content-editor"
      aria-label="Edit clipboard item"
      style={editorStyle}
    >
      <header className="item-content-editor-header">
        <div>
          <strong>Edit item</strong>
          <span>#{itemId} · {mimePrimary || "text/plain"}</span>
        </div>
        <span className={`item-content-editor-state${dirty ? " is-dirty" : ""}`}>
          {dirty ? "Modified" : "Saved"}
        </span>
      </header>

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

      {error ? <UiAlert className="error-text" color="red" variant="light">{error}</UiAlert> : null}

      <footer className="item-content-editor-footer">
        <div className="item-content-editor-status" aria-label="Editor status">
          <span>Ln {line}, Col {column}</span>
          <span>{statistics?.lineCount ?? 1} lines</span>
          <span>{statistics?.length ?? value.length} chars</span>
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
        <div className="item-content-editor-actions">
          <span className="item-content-editor-hints">
            Find <UiKbd>Ctrl F</UiKbd> · Save <UiKbd>Ctrl S</UiKbd>
          </span>
          <UiButton type="button" variant="default" onClick={onCancel}>Cancel</UiButton>
          <UiButton type="button" variant="filled" onClick={() => onSave(value)}>Save</UiButton>
        </div>
      </footer>
    </section>
  );
}
