import assert from 'node:assert/strict';
import { EditorState } from '@codemirror/state';
// Spike de localizacion y aplicacion, no parser ni motor de sugerencias final.
function rangeAt(query, anchor, head = anchor) {
  const lo = Math.min(anchor, head), hi = Math.max(anchor, head);
  let start = 0, quoted = false, escaped = false;
  const spans = [];
  for (let i = 0; i <= query.length; i++) {
    const c = query[i];
    if (escaped) { escaped = false; continue; }
    if (c === '\\') { escaped = true; continue; }
    if (c === '"') quoted = !quoted;
    if (i === query.length || (!quoted && /\s/.test(c))) { spans.push([start, i]); start = i + 1; }
  }
  const token = spans.find(([a,b]) => lo >= a && hi <= b);
  if (!token) return null;
  const [a,b] = token, text = query.slice(a,b);
  if (text.includes('"') || text.includes('\\')) return null; // Fail closed outside this spike.
  const match = /^(-?(?:tag:|tags:|#)|in:)/.exec(text);
  if (!match) return null;
  const valueStart = a + match[0].length;
  if (lo < valueStart) return null;
  let from = valueStart, to = b;
  for (let i = valueStart; i < b; i++) if (query[i] === ',') {
    if (i < lo) from = i + 1;
    else { to = i; break; }
  }
  if (hi > to) return null;
  if (match[0] === 'in:' && query[from] === '-') from++;
  if (lo < from) return null;
  return {from,to};
}
const cases = [
  ['scope comma', 'in:content,title,-notes,|', 'context', 'in:content,title,-notes,context'],
  ['scope negation', 'in:content,-no|,tags invoice', 'notes', 'in:content,-notes,tags invoice'],
  ['middle scope', 'in:content,ti|tle,-notes invoice', 'tags', 'in:content,tags,-notes invoice'],
  ['negative tag', '-tag:wo| invoice', 'work', '-tag:work invoice'],
  ['tag comma', 'tag:work,pe| invoice', 'personal', 'tag:work,personal invoice'],
  ['unicode tag', '#Éq| invoice', 'Équipe/東京', '#Équipe/東京 invoice'],
];
for (const [name, marked, insert, expected] of cases) {
  const caret = marked.indexOf('|'), query = marked.replace('|','');
  const range = rangeAt(query,caret); assert.ok(range);
  const native = query.slice(0,range.from)+insert+query.slice(range.to);
  const state = EditorState.create({doc:query,selection:{anchor:caret}});
  const result = state.update({changes:{...range,insert},selection:{anchor:range.from+insert.length}}).state;
  assert.equal(native,expected); assert.equal(result.doc.toString(),expected);
  assert.equal(result.selection.main.head,range.from+insert.length);
  console.log(JSON.stringify({name,range,result:expected}));
}
const selected = 'tag:work,personal invoice';
assert.deepEqual(rangeAt(selected,9,17),{from:9,to:17});
assert.deepEqual(rangeAt(selected,17,9),{from:9,to:17});
assert.equal(rangeAt(selected,4,17),null);
assert.equal(rangeAt('notes:"tag:work"',10),null);
assert.equal(rangeAt('re:tag:wo',9),null);
// Autoridad de aplicacion propuesta: solo texto/clasificacion/settings, no origen de edicion.
function policy(kind, mode, confirm, composing=false) {
  if (composing || kind==='invalid' || kind==='incomplete') return 'held';
  return mode==='enter' || (confirm && kind==='complete') ? 'pending-enter' : 'realtime';
}
for (const [kind,mode,confirm,expected] of [
  ['complete','realtime',false,'realtime'], ['complete','realtime',true,'pending-enter'],
  ['complete','enter',false,'pending-enter'], ['incomplete','realtime',false,'held'],
  ['invalid','realtime',false,'held'], ['plain','realtime',true,'realtime'],
]) { assert.equal(policy(kind,mode,confirm),expected); console.log(JSON.stringify({kind,mode,confirm,result:expected})); }
assert.equal(policy('complete','realtime',false,true),'held');
console.log('PASS: 6 exact edits on native strings and CM state; forward/reverse selection; cross-segment/quoted/regex rejection; proposed application matrix. No DOM, IME or Tauri certification.');
