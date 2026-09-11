import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { pathToFileURL } from "node:url";
import process from "node:process";
const resolveFromCwd = (spec) => pathToFileURL(join(process.cwd(), "node_modules", ...spec.split("/"), "dist/index.js")).href;

const N = 25;
const COLD_N = 15;
const QUERY_LENGTH = 16_384;
const QUERY_UPDATES = 64;
const MODULE_SPECS = [
  ["state", "@codemirror/state"],
  ["autocomplete", "@codemirror/autocomplete"],
  ["commands", "@codemirror/commands"],
  ["language", "@codemirror/language"],
  ["view", "@codemirror/view"],
];

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

const percentile = (values, p) => {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)];
};

const summary = (values) => ({
  n: values.length,
  medianMs: Number(median(values).toFixed(3)),
  p95Ms: Number(percentile(values, 95).toFixed(3)),
  minMs: Number(Math.min(...values).toFixed(3)),
  maxMs: Number(Math.max(...values).toFixed(3)),
});

const timed = (fn) => {
  const start = performance.now();
  const value = fn();
  return { value, elapsedMs: performance.now() - start };
};

const timedAsync = async (fn) => {
  const start = performance.now();
  const value = await fn();
  return { value, elapsedMs: performance.now() - start };
};

async function loadModules() {
  const entries = await Promise.all(MODULE_SPECS.map(async ([name, spec]) => [name, await import(resolveFromCwd(spec))]));
  return Object.fromEntries(entries);
}

function packageVersion(spec) {
  try {
    const packagePath = join(process.cwd(), "node_modules", ...spec.split("/"), "package.json");
    return JSON.parse(readFileSync(packagePath, "utf8")).version;
  } catch {
    return "unreadable";
  }
}

async function optionalLanguageProbe() {
  const candidates = ["@codemirror/lang-javascript", "@codemirror/lang-json", "@codemirror/lang-markdown"];
  const attempted = [];
  for (const spec of candidates) {
    attempted.push(spec);
    try {
      const module = await import(resolveFromCwd(spec));
      return { available: spec, attempted, exports: Object.keys(module).slice(0, 8) };
    } catch {
      // This is an availability probe only; do not install or resolve through a network.
    }
  }
  return { available: null, attempted, exports: [] };
}

function queryDocument(length) {
  const terms = ["tag:alpha", "title:clipboard", "notes:meeting", "-archived", "OR", "source:manual"];
  let text = "";
  while (text.length < length) text += `${terms[text.length % terms.length]} `;
  return text.slice(0, length);
}

function makeState(modules, doc = "tag:al") {
  const { EditorState } = modules.state;
  const { autocompletion, completeFromList } = modules.autocomplete;
  const { defaultKeymap, history, historyKeymap } = modules.commands;
  const { bracketMatching, indentOnInput, syntaxHighlighting, defaultHighlightStyle } = modules.language;
  const { keymap } = modules.view;
  const completionSource = completeFromList([
    { label: "alpha", type: "keyword" },
    { label: "archived", type: "keyword" },
    { label: "clipboard", type: "keyword" },
    { label: "meeting", type: "keyword" },
  ]);
  const extensions = [
    history(),
    autocompletion({ activateOnTyping: false, override: [completionSource] }),
    keymap.of([...defaultKeymap, ...historyKeymap, ...modules.autocomplete.completionKeymap]),
    bracketMatching(),
    indentOnInput(),
    syntaxHighlighting(defaultHighlightStyle),
  ];
  return EditorState.create({ doc, selection: { anchor: doc.length }, extensions });
}

function stateCreateSample(modules) {
  return timed(() => makeState(modules));
}

function transactionQuerySample(modules) {
  let state = makeState(modules, queryDocument(QUERY_LENGTH));
  const replacements = ["alpha", "clipboard", "meeting", "archived", "manual", "urgent"];
  const start = performance.now();
  for (let index = 0; index < QUERY_UPDATES; index += 1) {
    const from = 200 + ((index * 251) % (QUERY_LENGTH - 500));
    const to = from + Math.min(12, state.doc.length - from);
    state = state.update({ changes: { from, to, insert: replacements[index % replacements.length] } }).state;
  }
  return { elapsedMs: performance.now() - start, finalLength: state.doc.length };
}

function completionEditUndoRedo(modules) {
  const { CompletionContext, completeFromList, insertCompletionText } = modules.autocomplete;
  const { undo, redo, undoDepth, redoDepth } = modules.commands;
  const state = makeState(modules, "tag:al");
  const source = completeFromList([{ label: "alpha", type: "keyword" }]);
  const context = new CompletionContext(state, state.doc.length, true);
  const result = source(context);
  if (!result || !result.options?.length) throw new Error("completion source returned no options");
  const completion = result.options[0];
  const spec = insertCompletionText(state, completion.label, result.from, state.doc.length);
  let current = state.update(spec).state;
  const appliedDoc = current.doc.toString();
  let undoDispatched = false;
  undo({ state: current, dispatch: (transaction) => { current = transaction.state; undoDispatched = true; } });
  const undoneDoc = current.doc.toString();
  let redoDispatched = false;
  redo({ state: current, dispatch: (transaction) => { current = transaction.state; redoDispatched = true; } });
  const redoneDoc = current.doc.toString();
  if (appliedDoc !== "tag:alpha" || undoneDoc !== "tag:al" || redoneDoc !== "tag:alpha") {
    throw new Error(`completion/undo/redo mismatch: ${appliedDoc}/${undoneDoc}/${redoneDoc}`);
  }
  return {
    appliedDoc,
    undoneDoc,
    redoneDoc,
    hasView: context.view !== undefined,
    undoDispatched,
    redoDispatched,
    undoDepth: undoDepth(current),
    redoDepth: redoDepth(current),
  };
}

async function childImport() {
  const result = await timedAsync(loadModules);
  process.stdout.write(JSON.stringify({ importMs: result.elapsedMs }));
}

async function main() {
  if (process.argv.includes("--child-import")) {
    await childImport();
    return;
  }

  const runtime = {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    cwd: process.cwd(),
  };
  const versions = Object.fromEntries(MODULE_SPECS.map(([name, spec]) => [name, { spec, version: packageVersion(spec) }]));
  const languageProbe = await optionalLanguageProbe();

  const coldValues = [];
  for (let index = 0; index < COLD_N; index += 1) {
    const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url), "--child-import"], {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    if (child.status !== 0) throw new Error(`cold child failed (${child.status}): ${child.stderr}`);
    const parsed = JSON.parse(child.stdout);
    coldValues.push(parsed.importMs);
  }

  const firstImport = await timedAsync(loadModules);
  const reusedValues = [];
  for (let index = 0; index < N; index += 1) {
    const reused = await timedAsync(loadModules);
    reusedValues.push(reused.elapsedMs);
  }

  const stateValues = [];
  for (let index = 0; index < N; index += 1) {
    stateValues.push(stateCreateSample(firstImport.value).elapsedMs);
  }

  const queryValues = [];
  let queryCheck;
  for (let index = 0; index < N; index += 1) {
    const sample = transactionQuerySample(firstImport.value);
    queryValues.push(sample.elapsedMs / QUERY_UPDATES);
    queryCheck = sample;
  }

  const completionValues = [];
  let completionCheck;
  for (let index = 0; index < N; index += 1) {
    const sample = timed(() => completionEditUndoRedo(firstImport.value));
    completionValues.push(sample.elapsedMs);
    completionCheck = sample.value;
  }

  const output = {
    study: "CodeMirror 6 preload / state-only spike",
    method: {
      coldFreshProcessN: COLD_N,
      reusedImportN: N,
      stateCreateN: N,
      queryN: N,
      queryUpdatesPerSample: QUERY_UPDATES,
      queryLength: QUERY_LENGTH,
      completionN: N,
      timer: "performance.now() around dynamic import or synchronous API operation",
      coldTimerBoundary: "child starts timer after Node process/module script startup; excludes process startup envelope",
    },
    runtime,
    versions,
    languageProbe,
    imports: {
      firstSameProcessMs: Number(firstImport.elapsedMs.toFixed(3)),
      coldFreshProcess: summary(coldValues),
      reusedSameProcess: summary(reusedValues),
    },
    stateCreate: summary(stateValues),
    longQueryTransactions: {
      perTransactionMs: summary(queryValues),
      finalLength: queryCheck.finalLength,
      updatesPerSample: QUERY_UPDATES,
    },
    completionEditUndoRedo: {
      elapsedMs: summary(completionValues),
      semanticCheck: completionCheck,
      api: ["CompletionContext(state,pos,true)", "completeFromList", "insertCompletionText", "EditorState.update", "undo", "redo"],
    },
    limits: [
      "Node only: no DOM, EditorView construction, focus/paint, keyboard routing, IME, or WebView2/Tauri timing.",
      "Completion probe intentionally passes no EditorView; it exercises the documented source/context and transaction APIs, not the popup/widget.",
      "Cold child import timings exclude process startup; reused timings include repeated cached dynamic-import calls only.",
      "Query workload uses successive replacements in an initially 16,384-character synthetic query; it is not a parser or production query benchmark.",
    ],
  };
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

await main();
