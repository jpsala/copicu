import { build } from 'vite';
import { gzipSync } from 'node:zlib';
const baseline = 'current checkout (src/main.tsx without probe injection)';
const variants = {
  baseline: '',
  mantine: 'import { Combobox, useCombobox } from "@mantine/core"; globalThis.__completionProbe = { Combobox, useCombobox };',
  codemirror: 'import { EditorState } from "@codemirror/state"; import { EditorView, keymap } from "@codemirror/view"; import { autocompletion, acceptCompletion, closeCompletion, startCompletion } from "@codemirror/autocomplete"; globalThis.__completionProbe = { EditorState, EditorView, keymap, autocompletion, acceptCompletion, closeCompletion, startCompletion };',
};
for (const [name, inject] of Object.entries(variants)) {
  const result = await build({ logLevel: 'error', build: { write: false }, plugins: [{ name: 'disposable-completion-probe', enforce: 'pre', transform(code, id) { if (id.replaceAll('\\', '/').endsWith('/src/main.tsx')) return inject + '\n' + code; } }] });
  const output = result.output;
  const chunks = new Map(output.filter(x => x.type === 'chunk').map(x => [x.fileName, x]));
  const main = [...chunks.values()].find(x => Object.keys(x.modules).some(id => id.replaceAll('\\', '/').endsWith('/src/main.tsx')));
  const seen = new Set();
  function visit(file) { if (seen.has(file) || !chunks.has(file)) return; seen.add(file); for (const dep of chunks.get(file).imports) visit(dep); }
  visit(main.fileName);
  const critical = [...seen].map(x => chunks.get(x));
  const bytes = list => ({ raw: list.reduce((n,x) => n + Buffer.byteLength(x.code),0), gzip: list.reduce((n,x) => n + gzipSync(x.code).length,0) });
  console.log(JSON.stringify({ baseline, variant: name, main: main.fileName, critical: bytes(critical), total: bytes([...chunks.values()]), cmCriticalModules: critical.flatMap(x => Object.keys(x.modules)).filter(x => x.includes('/@codemirror/')).length }));
}
