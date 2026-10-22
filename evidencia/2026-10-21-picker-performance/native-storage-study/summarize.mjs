// Read-only with respect to raw captures. Produces derived JSON on stdout.
// From repo root: node evidencia/2026-10-21-picker-performance/native-storage-study/summarize.mjs
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const root = 'evidencia/2026-10-21-picker-performance/native-storage-study/';
function stats(values) {
  assert.ok(values.length > 0 && values.every(v => Number.isFinite(v) && v >= 0));
  const sorted = [...values].sort((a,b) => a-b);
  const quantile = q => sorted[Math.max(0, Math.ceil(q*sorted.length)-1)];
  return { n:values.length, min:sorted[0], p50:quantile(.5), p95:quantile(.95), max:sorted.at(-1) };
}
function summarize(samples, kind) {
  const foreground = samples.map(s => kind === 'serial' ? s : s.foreground);
  const result = { wallMs: stats(foreground.map(s => s.timing.wallMs)), encodeMs:stats(foreground.map(s => s.encodeMs)), jsonBytes:stats(foreground.map(s => s.jsonBytes)), stagesMs:{} };
  for(const stage of new Set(foreground.flatMap(s => Object.keys(s.timing.stagesMs)))) {
    result.stagesMs[stage] = stats(foreground.map(s => s.timing.stagesMs[stage] ?? 0));
  }
  if(kind === 'contention') {
    result.backgroundWallMs = stats(samples.map(s => s.background.wallMs));
    result.backgroundStagesMs = {};
    for(const stage of new Set(samples.flatMap(s => Object.keys(s.background.stagesMs)))) {
      result.backgroundStagesMs[stage] = stats(samples.map(s => s.background.stagesMs[stage] ?? 0));
    }
    result.foregroundStartAfterLockMs = stats(samples.map(s => s.foregroundStartAfterLockMs));
    result.foregroundStartsBeforeBackgroundHoldEnds = samples.filter(s => s.foregroundStartAfterLockMs < (s.background.stagesMs['search.mutex_hold'] ?? s.background.stagesMs['capture.mutex_hold'])).length;
  }
  return result;
}
const controlsOnly = process.argv.includes('--controls');
const output = { method: controlsOnly
  ? 'Factorial controls: nine warm samples per mode/phase; median and maximum only, no p95 claim.'
  : 'Nearest-rank p50/p95 from all 102 samples per variant (3 blocks x 34), with per-block wall statistics. Durations in ms; nested stages overlap.', datasets:[] };
for(const size of (controlsOnly ? [] : ['10k','100k'])) {
  const path = root+`native-${size}.txt`;
  const bytes = readFileSync(path);
  const text = bytes.toString('utf8');
  assert.ok(text.includes('1 passed; 0 failed;'));
  const records = text.split(/\r?\n/).filter(l=>l.includes('NATIVE_STUDY ')).map(l=>JSON.parse(l.slice(l.indexOf('NATIVE_STUDY ')+13)));
  assert.equal(records.length,35);
  assert.equal(records[0].kind,'configuration');
  assert.equal(records.at(-1).kind,'complete');
  const configuration = records[0];
  assert.equal(configuration.blocks,3);
  assert.equal(configuration.roundsPerBlock,34);
  assert.equal(configuration.debug,false);
  const groups = new Map();
  for(const r of records.slice(1,-1)) {
    const key = `${r.kind}:${r.case}:${r.counts ?? 'n/a'}`;
    const group = groups.get(key) ?? [];
    group.push(r); groups.set(key,group);
    for(const mode of ['shared','reader']) assert.equal(r[mode].length,34);
  }
  const cases = [...groups.values()].map(blocks => {
    assert.equal(blocks.length,3);
    assert.deepEqual(blocks.map(b=>b.block).sort(),[0,1,2]);
    const first = blocks[0];
    const row = {kind:first.kind,case:first.case,counts:first.counts ?? null};
    for(const mode of ['shared','reader']) {
      row[mode] = summarize(blocks.flatMap(b=>b[mode]),first.kind);
      row[mode].blockWallMs = blocks.map(b=>({block:b.block,...stats(b[mode].map(s=>(first.kind === 'serial' ? s : s.foreground).timing.wallMs))}));
    }
    if(first.kind === 'contention') row.checkpoints = blocks.map(b=>({block:b.block,result:b.checkpointAfterBlock,walBytes:b.walBytesAfterCheckpoint}));
    return row;
  });
  output.datasets.push({path,sha256:createHash('sha256').update(bytes).digest('hex'),configuration,cases});
}
if(controlsOnly) {
  const path = root+'connection-controls-100k.txt';
  const bytes = readFileSync(path);
  const text = bytes.toString('utf8');
  assert.ok(text.includes('1 passed; 0 failed;'));
  const records = text.split(/\r?\n/).filter(l=>l.includes('NATIVE_STUDY ')).map(l=>JSON.parse(l.slice(l.indexOf('NATIVE_STUDY ')+13)));
  assert.equal(records.at(-1).kind,'control-complete');
  const cases = records.filter(r=>r.kind==='control-samples').map(r=>{
    const values = r.samples.map(s=>s.timing.wallMs).sort((a,b)=>a-b);
    assert.equal(values.length,9);
    return {phase:r.phase,mode:r.mode,medianMs:values[4],maxMs:values.at(-1)};
  });
  assert.equal(cases.length,12);
  output.controls = {path,sha256:createHash('sha256').update(bytes).digest('hex'),configuration:records[0],plans:records.filter(r=>r.kind==='control-plan'),cases};
}
console.log(JSON.stringify(output,null,2));
