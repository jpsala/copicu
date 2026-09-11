import CodeMirror, {
  Decoration,
  EditorState,
  EditorView,
  drawSelection,
  ExternalChange,
  ViewPlugin,
  type DecorationSet,
  type EditorView as EditorViewType,
  type Range,
  type ReactCodeMirrorRef,
  type ViewUpdate,
} from "@uiw/react-codemirror";
import {
  autocompletion,
  closeCompletion,
  completionStatus,
  pickedCompletion,
  type Completion,
  type CompletionContext,
  type CompletionSource,
} from "@codemirror/autocomplete";
import {
  scenarioCommandSearch,
  searchSuggestions,
  searchTokenAt,
  type SearchSuggestion,
} from "../shared/search";
import { replaceQueryScopes, type SearchScopeSelection } from "../shared/searchScopes";
import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";

export type QueryEditorReadyPhase = "module" | "instance" | "input" | "visible";

export type QueryEditorScenarioOption = {
  id: number;
  label: string;
};

export type QueryEditorHandle = {
  focus: () => void;
  getView: () => EditorViewType | null;
};

type QueryEditorProps = {
  value: string;
  knownTagSlugs: string[];
  scopeSelection: SearchScopeSelection;
  scenarioOptions?: QueryEditorScenarioOption[];
  placeholder?: string;
  hidden?: boolean;
  onChange: (value: string, update: ViewUpdate, isComposing: boolean) => void;
  onKeyDown?: (event: KeyboardEvent, view: EditorViewType) => boolean | void;
  onSubmit: (event: KeyboardEvent, view: EditorViewType) => boolean | void;
  onEscape: (event: KeyboardEvent, view: EditorViewType) => boolean | void;
  onScenarioActivate?: (id: number) => void;
  onCompositionChange?: (isComposing: boolean) => void;
  onReady?: (phase: QueryEditorReadyPhase) => void;
};
type QueryCompletion = Completion & {
  sourceRange: {
    from: number;
    to: number;
  };
};

const operatorMark = Decoration.mark({ class: "cm-copicu-query-operator" });
const negationMark = Decoration.mark({ class: "cm-copicu-query-negation" });
const tagMark = Decoration.mark({ class: "cm-copicu-query-tag" });
const valueMark = Decoration.mark({ class: "cm-copicu-query-value" });
const quoteMark = Decoration.mark({ class: "cm-copicu-query-quote" });
const scopeMark = Decoration.mark({ class: "cm-copicu-query-scope" });

function tokenRanges(query: string) {
  const ranges: Array<{ from: number; to: number }> = [];
  let from = -1;
  let inQuote = false;
  let escaped = false;
  for (let index = 0; index < query.length; index += 1) {
    const char = query[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\" && inQuote) {
      escaped = true;
      continue;
    }
    if (char === '"') {
      if (from === -1) from = index;
      inQuote = !inQuote;
      continue;
    }
    if (!inQuote && /\s/.test(char)) {
      if (from !== -1) {
        ranges.push({ from, to: index });
        from = -1;
      }
      continue;
    }
    if (from === -1) from = index;
  }
  if (from !== -1) ranges.push({ from, to: query.length });
  return ranges;
}

function addMark(ranges: Array<Range<Decoration>>, mark: Decoration, from: number, to: number) {
  if (to > from) ranges.push(mark.range(from, to));
}

function queryDecorations(state: EditorState): DecorationSet {
  const query = state.doc.toString();
  const ranges: Array<Range<Decoration>> = [];
  for (const tokenRange of tokenRanges(query)) {
    const token = query.slice(tokenRange.from, tokenRange.to);
    const negated = token.startsWith("-") && token.length > 1;
    const rawFrom = tokenRange.from + (negated ? 1 : 0);
    if (negated) addMark(ranges, negationMark, tokenRange.from, rawFrom);

    const rawToken = token.slice(negated ? 1 : 0);
    if (rawToken.startsWith("#")) {
      addMark(ranges, tagMark, rawFrom, tokenRange.to);
    } else {
      let inQuotedValue = false;
      let escapedValue = false;
      let separator = -1;
      for (let offset = 0; offset < rawToken.length; offset += 1) {
        const char = rawToken[offset];
        if (escapedValue) {
          escapedValue = false;
          continue;
        }
        if (char === "\\" && inQuotedValue) {
          escapedValue = true;
          continue;
        }
        if (char === '"') {
          addMark(ranges, quoteMark, rawFrom + offset, rawFrom + offset + 1);
          inQuotedValue = !inQuotedValue;
        } else if (char === ":" && separator === -1 && !inQuotedValue) {
          separator = offset;
        } else if (char === "," && separator !== -1 && !inQuotedValue) {
          addMark(ranges, scopeMark, rawFrom + offset, rawFrom + offset + 1);
        }
      }
      if (separator > 0) {
        addMark(ranges, operatorMark, rawFrom, rawFrom + separator + 1);
        addMark(ranges, valueMark, rawFrom + separator + 1, tokenRange.to);
      }
    }
  }
  return Decoration.set(ranges, true);
}

class QueryHighlightPlugin {
  decorations: DecorationSet;

  constructor(view: EditorViewType) {
    this.decorations = queryDecorations(view.state);
  }

  update(update: ViewUpdate) {
    if (update.docChanged || update.viewportChanged) {
      this.decorations = queryDecorations(update.state);
    }
  }
}

const queryHighlight = ViewPlugin.fromClass(QueryHighlightPlugin, {
  decorations: (value) => value.decorations,
});

function scenarioCompletions(
  query: string,
  options: QueryEditorScenarioOption[],
  onActivate: (id: number) => void,
): Completion[] {
  const commandSearch = scenarioCommandSearch(query);
  if (commandSearch === null) return [];
  const normalized = commandSearch.toLocaleLowerCase();
  return options
    .filter((option) => !normalized || option.label.toLocaleLowerCase().includes(normalized))
    .map((option) => ({
      label: `Activate capture mode: ${option.label}`,
      detail: "Capture mode",
      type: "keyword",
      apply: () => onActivate(option.id),
    }));
}

function completionCursor(context: CompletionContext) {
  const selection = context.state.selection.main;
  return selection.empty ? context.pos : Math.min(selection.anchor, selection.head);
}

function completionContextRange(query: string, context: CompletionContext) {
  const token = searchTokenAt(query, completionCursor(context));
  const selection = context.state.selection.main;
  const selectionFrom = Math.min(selection.anchor, selection.head);
  const selectionTo = Math.max(selection.anchor, selection.head);
  if (
    selectionFrom >= token.from
    && selectionTo <= token.to
  ) {
    return { from: selectionFrom, to: selectionTo };
  }
  return { from: token.from, to: completionCursor(context) };
}

function applySearchCompletion(
  view: EditorViewType,
  suggestion: SearchSuggestion,
  completion: Completion,
  from: number,
  to: number,
) {
  const query = view.state.doc.toString();
  if (suggestion.scopeSelection) {
    const replacement = replaceQueryScopes(query, suggestion.scopeSelection);
    const token = searchTokenAt(query, view.state.selection.main.head);
    const tokenEnd = replacement.indexOf(" ", token.from);
    const nextCursor = tokenEnd >= 0 ? tokenEnd : replacement.length;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: replacement },
      selection: { anchor: nextCursor },
      annotations: pickedCompletion.of(completion),
      userEvent: "input.complete",
      scrollIntoView: true,
    });
    return;
  }

  const replacement = suggestion.replacement;
  view.dispatch({
    changes: { from, to, insert: replacement },
    selection: { anchor: from + replacement.length },
    annotations: pickedCompletion.of(completion),
    userEvent: "input.complete",
    scrollIntoView: true,
  });
}

function searchCompletions(
  context: CompletionContext,
  knownTagSlugs: string[],
  scopeSelection: SearchScopeSelection,
): QueryCompletion[] {
  const query = context.state.doc.toString();
  const fallbackRange = completionContextRange(query, context);
  const suggestions = searchSuggestions(
    query,
    knownTagSlugs,
    scopeSelection,
    completionCursor(context),
    context.state.selection.main,
  );
  return suggestions.map((suggestion: SearchSuggestion) => {
    const sourceRange = suggestion.completionRange ?? fallbackRange;
    const completion: QueryCompletion = {
      label: suggestion.label,
      detail: suggestion.scope?.detail ?? "Query syntax",
      type: suggestion.scope ? "class" : suggestion.replacement.endsWith(":") ? "keyword" : "value",
      sourceRange,
      apply: (view, completion, from, to) => applySearchCompletion(view, suggestion, completion, from, to),
    };
    return completion;
  });
}

const QUERY_EXTENSION_OPTIONS = {
  lineNumbers: false,
  highlightActiveLineGutter: false,
  foldGutter: false,
  dropCursor: true,
  allowMultipleSelections: true,
  indentOnInput: false,
  bracketMatching: true,
  closeBrackets: true,
  autocompletion: false,
  rectangularSelection: false,
  crosshairCursor: false,
  highlightActiveLine: false,
  highlightSelectionMatches: false,
  closeBracketsKeymap: true,
  searchKeymap: false,
  foldKeymap: false,
  completionKeymap: false,
  lintKeymap: false,
  history: true,
  drawSelection: false,
  defaultKeymap: true,
  historyKeymap: true,
  syntaxHighlighting: false,
};

function queryCompletionSource(
  context: CompletionContext,
  knownTagSlugs: string[],
  scopeSelection: SearchScopeSelection,
  scenarioOptions: QueryEditorScenarioOption[],
  onScenarioActivate: (id: number) => void,
) {
  if (context.state.readOnly) return null;
  const query = context.state.doc.toString();
  const range = completionContextRange(query, context);
  const scenarios = scenarioCompletions(query, scenarioOptions, onScenarioActivate);
  if (scenarios.length > 0) {
    return { ...range, options: scenarios, filter: false };
  }
  const token = searchTokenAt(query, completionCursor(context)).prefix;
  if (!context.explicit && token.length === 0) return null;
  const options = searchCompletions(context, knownTagSlugs, scopeSelection);
  if (options.length === 0) return null;
  const sourceRange = options[0]?.sourceRange ?? range;
  return {
    ...sourceRange,
    options,
    filter: false,
  };
}
function isVisibleEditorFrame(view: EditorViewType) {
  const bounds = view.dom.getBoundingClientRect();
  return view.dom.isConnected
    && view.contentDOM.isConnected
    && view.inView
    && bounds.width > 0
    && bounds.height > 0
    && document.visibilityState === "visible"
    && document.hasFocus();
}
function isQueryEditorComposing(update: Pick<ViewUpdate, "view">) {
  return update.view.composing || update.view.compositionStarted;
}

export const QueryEditor = forwardRef<QueryEditorHandle, QueryEditorProps>(function QueryEditor({
  value,
  knownTagSlugs,
  scopeSelection,
  scenarioOptions = [],
  placeholder = "Search · in: scopes, tag: tags, re: pattern",
  hidden = false,
  onChange,
  onKeyDown,
  onSubmit,
  onEscape,
  onScenarioActivate,
  onCompositionChange,
  onReady,
}, ref) {
  const editorRef = useRef<ReactCodeMirrorRef | null>(null);
  const lastEditorValueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  const onKeyDownRef = useRef(onKeyDown);
  const onSubmitRef = useRef(onSubmit);
  const onEscapeRef = useRef(onEscape);
  const onScenarioActivateRef = useRef(onScenarioActivate);
  const onCompositionChangeRef = useRef(onCompositionChange);
  const onReadyRef = useRef(onReady);
  onChangeRef.current = onChange;
  onKeyDownRef.current = onKeyDown;
  onSubmitRef.current = onSubmit;
  onEscapeRef.current = onEscape;
  onScenarioActivateRef.current = onScenarioActivate;
  onCompositionChangeRef.current = onCompositionChange;
  onReadyRef.current = onReady;
  const [readyPhase, setReadyPhase] = useState<QueryEditorReadyPhase>("module");
  const readyPhaseRef = useRef<QueryEditorReadyPhase | null>(null);
  const markReady = (phase: QueryEditorReadyPhase) => {
    const order: Record<QueryEditorReadyPhase, number> = { module: 0, instance: 1, input: 2, visible: 3 };
    const current = readyPhaseRef.current;
    if (current !== null && order[phase] <= order[current]) return;
    readyPhaseRef.current = phase;
    setReadyPhase(phase);
    onReadyRef.current?.(phase);
  };


  useImperativeHandle(ref, () => ({
    focus: () => {
      const view = editorRef.current?.view;
      if (!view) return;
      view.requestMeasure();
      view.focus();
    },
    getView: () => editorRef.current?.view ?? null,
  }), []);

  useEffect(() => {
    markReady("module");
  }, []);
  useLayoutEffect(() => {
    const view = editorRef.current?.view;
    if (!view) return;
    const currentValue = view.state.doc.toString();
    if (currentValue === value || lastEditorValueRef.current === value) return;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: value },
      annotations: ExternalChange.of(true),
    });
    lastEditorValueRef.current = value;
  }, [value]);
  useEffect(() => {
    const view = editorRef.current?.view;
    if (!view || hidden) return;

    let frame = 0;
    let timeout = 0;
    const scheduleVisibleFrame = () => {
      if (frame) window.cancelAnimationFrame(frame);
      if (timeout) window.clearTimeout(timeout);
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        timeout = window.setTimeout(() => {
          timeout = 0;
          if (isVisibleEditorFrame(view)) markReady("visible");
        }, 0);
      });
    };

    scheduleVisibleFrame();
    document.addEventListener("visibilitychange", scheduleVisibleFrame);
    window.addEventListener("focus", scheduleVisibleFrame);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      if (timeout) window.clearTimeout(timeout);
      document.removeEventListener("visibilitychange", scheduleVisibleFrame);
      window.removeEventListener("focus", scheduleVisibleFrame);
    };
  }, [hidden]);



  const completionSource = useMemo<CompletionSource>(() => (context: CompletionContext) =>
    queryCompletionSource(
      context,
      knownTagSlugs,
      scopeSelection,
      scenarioOptions,
      (id) => {
        onScenarioActivateRef.current?.(id);
      },
    ), [knownTagSlugs, scenarioOptions, scopeSelection]);

  const extensions = useMemo(() => [
    EditorView.contentAttributes.of({
      "aria-label": "Search clipboard history",
      "aria-multiline": "true",
      "aria-autocomplete": "list",
      role: "combobox",
    }),
    queryHighlight,
    drawSelection({ cursorBlinkRate: 0 }),
    autocompletion({
      activateOnTyping: true,
      closeOnBlur: true,
      override: [completionSource],
    }),
    EditorView.domEventHandlers({
      compositionstart: () => {
        onCompositionChangeRef.current?.(true);
        return false;
      },
      compositionend: () => {
        onCompositionChangeRef.current?.(false);
        return false;
      },
      keydown: (event, view) => {
        const keyboardEvent = event as KeyboardEvent;
        if (keyboardEvent.isComposing || keyboardEvent.keyCode === 229) return false;
        if (keyboardEvent.key === "Tab" && completionStatus(view.state) === "active") {
          closeCompletion(view);
          return false;
        }
        if (completionStatus(view.state) === "active") return false;
        if (keyboardEvent.key === "Enter") {
          const handled = onSubmitRef.current(keyboardEvent, view);
          if (handled) {
            keyboardEvent.preventDefault();
            return true;
          }
          return false;
        }
        if (keyboardEvent.key === "Escape") {
          const handled = onEscapeRef.current(keyboardEvent, view);
          if (handled) {
            keyboardEvent.preventDefault();
            return true;
          }
          return false;
        }
        const handled = onKeyDownRef.current?.(keyboardEvent, view);
        if (handled) {
          keyboardEvent.preventDefault();
          return true;
        }
        return false;
      },
    }),
  ], [completionSource]);

  const handleChange = (nextValue: string, update: ViewUpdate) => {
    const isComposing = isQueryEditorComposing(update);
    lastEditorValueRef.current = nextValue;
    onCompositionChangeRef.current?.(isComposing);
    onChangeRef.current(nextValue, update, isComposing);
  };

  const handleCreateEditor = (view: EditorViewType) => {
    markReady("instance");
    const markInputReady = () => {
      if (!view.dom.isConnected || !view.contentDOM.isConnected) return false;
      markReady("input");
      return true;
    };
    if (!markInputReady()) {
      window.requestAnimationFrame(markInputReady);
    }
  };

  return (
    <div
      className={`query-editor${hidden ? " is-hidden" : ""}`}
      data-query-editor-phase={readyPhase}
      data-query-editor-ready={readyPhase === "input" || readyPhase === "visible" ? "true" : "false"}
      data-query-editor-visible={readyPhase === "visible" ? "true" : "false"}
      aria-busy={readyPhase !== "input" && readyPhase !== "visible"}
    >
      <CodeMirror
        ref={editorRef}
        value={value}
        height="auto"
        width="100%"
        theme="none"
        basicSetup={QUERY_EXTENSION_OPTIONS}
        indentWithTab={false}
        placeholder={placeholder}
        extensions={extensions}
        onChange={handleChange}
        onCreateEditor={handleCreateEditor}
      />
    </div>
  );
});
