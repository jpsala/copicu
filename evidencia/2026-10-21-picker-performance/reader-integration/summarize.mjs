// Derive summaries without modifying the raw synthetic captures. Run from repo root.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const root = 'evidencia/2026-10-21-picker-performance/reader-integration/';
const prefix = 'INTEGRATED_READER ';
const stats = values => {
  assert.ok(values.length > 0 && values.every(v => Number.isFinite(v) && v >= 0));
  const sorted = [...values].sort((a,b) => a-b);
  return { n:values.length, p50:sorted[Math.ceil(values.length*.5)-1], p95:sorted[Math.ceil(values.length*.95)-1], max:sorted.at(-1) };
};
const output = { method:'Nearest rank; 102 samples per variant, 3 blocks x 34, two warmups per block excluded. Same-item recapture with retention unlimited; foreground starts after writer mutex acquisition. No IPC, UI or hotkey.', datasets:[] };
for(const size of ['10k','100k']) {
  const file = root+`native-${size}.txt`;
  const bytes = readFileSync(file);
  const text = bytes.toString('utf8');
  assert.ok(text.includes('1 passed; 0 failed;'));
  const records = text.split(/\r?\n/).filter(l=>l.includes(prefix)).map(l=>JSON.parse(l.slice(l.indexOf(prefix)+prefix.length)));
  assert.equal(records.length,5);
  assert.equal(records[0].kind,'configuration');
  assert.equal(records.at(-1).kind,'complete');
  const blocks = records.filter(r=>r.kind==='block');
  assert.deepEqual(blocks.map(b=>b.block),[0,1,2]);
  const variants = {};
  for(const mode of ['legacy','integrated']) {
    for(const block of blocks) assert.equal(block[mode].length,34);
    const samples = blocks.flatMap(b=>b[mode]);
    variants[mode] = {
      wallMs:stats(samples.map(s=>s.wallMs)),
      backgroundMs:stats(samples.map(s=>s.background.wallMs)),
      startAfterLockMs:stats(samples.map(s=>s.startAfterLockMs)),
      foregroundStartsBeforeHoldEnds:samples.filter(s=>s.startAfterLockMs<s.background.stagesMs['capture.mutex_hold']).length,
      blocks:blocks.map(b=>({block:b.block,wallMs:stats(b[mode].map(s=>s.wallMs))})),
    };
  }
  output.datasets.push({file,sha256:createHash('sha256').update(bytes).digest('hex'),configuration:records[0],variants});
}
console.log(JSON.stringify(output,null,2));
