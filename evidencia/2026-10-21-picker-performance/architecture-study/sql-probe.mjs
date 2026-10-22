// Research only. Run from repo root with Node 24's built-in SQLite.
// Uses memory databases and one newly-created temporary WAL database, never app data.
// Raw SQL timings omit Rust DTO/match evidence, mutex waits, IPC and UI.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir, cpus, release } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import assert from 'node:assert/strict';

const sourcePaths = [
  'src-tauri/src/storage/schema.rs', 'src-tauri/src/storage/search.rs',
  'src-tauri/src/storage.rs', 'src-tauri/src/lib.rs', 'src/main.tsx',
  'evidencia/2026-10-21-picker-performance/architecture-study/sql-probe.mjs',
];
const sources = sourcePaths.map(path => ({ path, sha256: createHash('sha256').update(readFileSync(path)).digest('hex') }));
const schema = readFileSync(sourcePaths[0], 'utf8');
const search = readFileSync(sourcePaths[1], 'utf8');
const migrations = [...schema.matchAll(/M::up\(\s*r(#+)"([\s\S]*?)"\1\s*,?\s*\)/g)].map(m => m[2]);
assert.equal(migrations.length, (schema.match(/M::up\(/g) ?? []).length, 'migration extraction drift');
assert.ok(migrations.length > 0);
let select = search.match(/"(id, content_kind, \{text_expr\}[\s\S]*?last_received_at_unix_ms)"/)[1]
  .replace('{text_expr}', 'SUBSTR(text, 1, 2000) AS text')
  .replace('SUBSTR(text, 1, {HISTORY_PREVIEW_CHAR_LIMIT})', 'SUBSTR(text, 1, 2000) AS preview_text')
  .replace('LENGTH(text)', 'LENGTH(text) AS text_char_count')
  .replace('{includes_content}', '0 AS includes_content');
assert.ok(!select.includes('{'));
const order = search.match(/return "(\(is_inbox != 0\) DESC[^"]+)"/)[1];
const fields = [...search.match(/const ALL_TEXT_FIELDS: &[\s\S]*?= &\[([\s\S]*?)\];/)[1].matchAll(/"([^"]+)"/g)].map(m => m[1]);
assert.equal(fields.length, 7, 'plain search field extraction drift');
const predicate = '(' + fields.map(field => `${field} LIKE ? ESCAPE '\\'`).join(' OR ') + ')';
const sqlPage = `SELECT ${select} FROM clipboard_items WHERE ${predicate} ORDER BY ${order} LIMIT 61`;
const sqlCount = `SELECT COUNT(*) AS n FROM clipboard_items WHERE ${predicate}`;
const sqlUnfiltered = `SELECT ${select} FROM clipboard_items ORDER BY ${order} LIMIT 61`;
const output = {
  capturedAt: new Date().toISOString(), node: process.version, platform: process.platform,
  osRelease: release(), cpu: cpus()[0]?.model, sources, migrations: migrations.length,
  method: 'Two warmups + nine measured rounds, alternating case order. In-memory warm SQL. No p95 claim, no native app or clipboard. SQL fields/order extracted from working tree. No attach_search_matches or thumbnails.',
  sql: { select, order, predicate, sqlPage, sqlCount, sqlUnfiltered }, search: [], projection: [],
};

function measureCases(cases, rounds = 9) {
  const samples = cases.map(() => []);
  const results = [];
  for (let round = -2; round < rounds; round++) {
    const indices = cases.map((_, i) => i);
    if (round % 2) indices.reverse();
    for (const i of indices) {
      const t = performance.now();
      const value = cases[i].run();
      const elapsed = performance.now() - t;
      if (round >= 0) samples[i].push(elapsed);
      results[i] = value;
    }
  }
  return cases.map(({name}, i) => {
    const ordered = [...samples[i]].sort((a,b) => a-b);
    return { name, samplesMs: samples[i], medianMs: ordered[Math.floor(ordered.length/2)], maxMs: ordered.at(-1), result: results[i] };
  });
}

for (const count of [10_000, 100_000]) {
  const db = new DatabaseSync(':memory:');
  try {
    for (const migration of migrations) db.exec(migration);
    db.exec('PRAGMA foreign_keys=ON; BEGIN');
    output.sqlite = db.prepare('SELECT sqlite_version() AS v').get().v;
    const insert = db.prepare("INSERT INTO clipboard_items(id,content_kind,text,normalized_hash,created_at_unix_ms,last_used_at_unix_ms,last_copied_at_unix_ms) VALUES (?,'text',?,?,?,0,?)");
    for (let id = 1; id <= count; id++) {
      const text = `COPICU_SYNTH_${id} ${'ordinary '.repeat(60)}${id === 1 ? ' oldestneedle' : ''}`;
      const t = 1_800_000_000_000 + id;
      insert.run(id, text, `synthetic-${id}`, t, t);
    }
    db.exec('COMMIT');
    const page = db.prepare(sqlPage), total = db.prepare('SELECT COUNT(*) AS n FROM clipboard_items'), filtered = db.prepare(sqlCount);
    for (const [kind, term, expected] of [['common','ordinary',count], ['oldest-only','oldestneedle',1], ['absent','absentneedle',0]]) {
      const params = fields.map(() => `%${term}%`);
      assert.equal(filtered.get(...params).n, expected);
      const cases = measureCases([
        { name: 'page-only', run: () => page.all(...params).length },
        { name: 'count-only', run: () => filtered.get(...params).n },
        { name: 'total+count+page', run: () => { total.get(); filtered.get(...params); return page.all(...params).length; } },
      ]);
      assert.equal(cases[0].result, Math.min(61, expected));
      assert.equal(cases[0].result, cases[2].result);
      output.search.push({count,kind,expected,cases,plan: db.prepare('EXPLAIN QUERY PLAN '+sqlPage).all(...params).map(r=>r.detail)});
    }
    // 61 newest long texts; Unicode included. Candidate remains synthetic SQL only.
    const long = 'COPICU_SYNTH_LONG ' + 'x'.repeat(250_000) + '😀é';
    db.prepare('UPDATE clipboard_items SET text=? WHERE id>?').run(long, count-61);
    const buildStart = performance.now();
    db.exec('CREATE TABLE research_preview(id INTEGER PRIMARY KEY, preview TEXT NOT NULL, chars INTEGER NOT NULL); INSERT INTO research_preview SELECT id,SUBSTR(text,1,2000),LENGTH(text) FROM clipboard_items');
    const buildMs = performance.now()-buildStart;
    const candidateSql = `SELECT ${select.replaceAll('SUBSTR(text, 1, 2000)', 'p.preview').replaceAll('LENGTH(text)', 'p.chars')} FROM clipboard_items JOIN research_preview p USING(id) ORDER BY ${order} LIMIT 61`;
    const original = db.prepare(sqlUnfiltered), candidate = db.prepare(candidateSql);
    assert.deepEqual(candidate.all(), original.all(), 'candidate must return identical preview columns');
    const cases = measureCases([
      {name:'current-preview',run:()=>original.all().length},
      {name:'materialized-preview-join',run:()=>candidate.all().length},
    ]);
    // Demonstrate maintenance obligation, not a product correctness test.
    db.prepare('UPDATE clipboard_items SET text=? WHERE id=?').run('changed synthetic 😀',count);
    assert.notDeepEqual(candidate.all(), original.all());
    db.prepare('UPDATE research_preview SET preview=(SELECT SUBSTR(text,1,2000) FROM clipboard_items WHERE id=?),chars=(SELECT LENGTH(text) FROM clipboard_items WHERE id=?) WHERE id=?').run(count,count,count);
    assert.deepEqual(candidate.all(),original.all());
    output.projection.push({count,longRows:61,longCharacters:Array.from(long).length,buildMs,candidateSql,cases,equivalence:true,staleWithoutMaintenance:true,equivalentAfterMaintenance:true,plan:db.prepare('EXPLAIN QUERY PLAN '+candidateSql).all().map(r=>r.detail)});
  } finally { db.close(); }
}

// Deterministic interleaving on separate WAL connections, not a contention timing model.
const dir = mkdtempSync(join(tmpdir(),'copicu-architecture-synthetic-'));
let writer, reader;
try {
  const path = join(dir,'research.sqlite');
  writer = new DatabaseSync(path);
  writer.exec('PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0; CREATE TABLE items(id INTEGER PRIMARY KEY); INSERT INTO items VALUES(1)');
  reader = new DatabaseSync(path,{readOnly:true});
  const count = () => reader.prepare('SELECT COUNT(*) AS n FROM items').get().n;
  const firstCount = count();
  writer.exec('INSERT INTO items VALUES(2)');
  const secondCount = count();
  assert.equal(firstCount,1); assert.equal(secondCount,2);
  reader.exec('BEGIN');
  const snapshotCount = count(); // BEGIN alone does not acquire a snapshot until a read.
  writer.exec('BEGIN IMMEDIATE; INSERT INTO items VALUES(3); COMMIT');
  const pinnedCount = count();
  const pinnedCheckpoint = writer.prepare('PRAGMA wal_checkpoint(PASSIVE)').get();
  assert.equal(snapshotCount,2); assert.equal(pinnedCount,2);
  assert.ok(pinnedCheckpoint.log > pinnedCheckpoint.checkpointed, 'reader pins checkpoint progress');
  const walBytesWhilePinned = statSync(path+'-wal').size;
  reader.exec('COMMIT');
  const nextCount = count();
  const releasedCheckpoint = writer.prepare('PRAGMA wal_checkpoint(PASSIVE)').get();
  assert.equal(nextCount,3);
  assert.equal(releasedCheckpoint.log,releasedCheckpoint.checkpointed);
  output.wal = {method:'Three commits, deterministic connection interleaving. No worker queue/mutex simulation, no latency prediction.',withoutTransaction:[firstCount,secondCount],withTransaction:[snapshotCount,pinnedCount],afterTransaction:nextCount,writerCommittedWhileReaderActive:true,pinnedCheckpoint,releasedCheckpoint,walBytesWhilePinned};
} finally {
  reader?.close(); writer?.close();
  rmSync(dir,{recursive:true,force:true}); // Only the new directory created above.
}
console.log(JSON.stringify(output,null,2));
