import { DatabaseSync } from 'node:sqlite';
import { readFileSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
// Synthetic, in-memory SQL microbenchmark, not a Rust/IPC or cold-disk benchmark.
const schema = readFileSync('src-tauri/src/storage/schema.rs', 'utf8');
const storage = readFileSync('src-tauri/src/storage.rs', 'utf8');
const search = readFileSync('src-tauri/src/storage/search.rs', 'utf8');
const migrations = [...schema.matchAll(/M::up\(\s*r(#+)"([\s\S]*?)"\1\s*,?\s*\)/g)].map(m => m[2]);
if (migrations.length !== (schema.match(/M::up\(/g) ?? []).length) throw Error('migration extraction drift');
const select = search.match(/"(id, content_kind, \{text_expr\}[\s\S]*?last_received_at_unix_ms)"/)[1]
  .replaceAll('{text_expr}', 'SUBSTR(text, 1, 2000)').replaceAll('{HISTORY_PREVIEW_CHAR_LIMIT}', '2000').replaceAll('{includes_content}', '0');
const order = search.match(/return "(\(is_inbox != 0\) DESC[^"]+)"/)[1];
const tagsSql = storage.match(/"(SELECT\s+tags.id,[\s\S]*?tags.label COLLATE NOCASE ASC)"/)[1].replace('{filter_sql}', '');
const output = { node: process.version, migrations: migrations.length, rows: [] };
function measure(db, name, sql, params = [], rounds = 7) {
  const stmt = db.prepare(sql);
  const plan = db.prepare('EXPLAIN QUERY PLAN ' + sql).all(...params).map(row => row.detail);
  const times = [];
  let rows;
  for (let i=0; i<rounds+1; i++) { const start = performance.now(); rows = stmt.all(...params); if (i) times.push(performance.now()-start); }
  times.sort((a,b)=>a-b);
  return { name, medianMs: times[Math.floor(times.length/2)], maxMs: times.at(-1), rows: rows.length, jsonBytes: Buffer.byteLength(JSON.stringify(rows)), plan };
}
for (const count of [10000, 100000]) {
  const db = new DatabaseSync(':memory:');
  for (const migration of migrations) db.exec(migration);
  output.sqlite = db.prepare('select sqlite_version() v').get().v;
  db.exec('BEGIN');
  const insert = db.prepare('INSERT INTO clipboard_items(id,content_kind,text,normalized_hash,created_at_unix_ms,last_used_at_unix_ms,last_copied_at_unix_ms) VALUES (?,\'text\',?,?,?,0,?)');
  for (let i=1; i<=count; i++) { const t=1800000000000+i; insert.run(i, `COPICU_SYNTH_${i} `+'ordinary '.repeat(60), `synthetic-${i}`, t, t); }
  db.exec('COMMIT');
  for (const [name, sql, params] of [
    ['first_page_61',`SELECT ${select} FROM clipboard_items ORDER BY ${order} LIMIT ?`,[61]],
    ['total_count','SELECT COUNT(*) FROM clipboard_items',[]],
    ['root_count','SELECT COUNT(*) FROM clipboard_items WHERE folder_id IS NULL',[]],
    ['filtered_count_content','SELECT COUNT(*) FROM clipboard_items WHERE text LIKE ?', ['%ordinary%']],
    ['filtered_page_content',`SELECT ${select} FROM clipboard_items WHERE text LIKE ? ORDER BY ${order} LIMIT ?`,['%ordinary%',61]],
  ]) output.rows.push({ count, ...measure(db,name,sql,params) });
  const long = 'COPICU_SYNTH_LONG '+ 'x'.repeat(250000);
  db.prepare('UPDATE clipboard_items SET text=? WHERE id>?').run(long,count-61);
  output.rows.push({ count, ...measure(db,'first_page_250k_chars',`SELECT ${select} FROM clipboard_items ORDER BY ${order} LIMIT ?`,[61]) });
  output.rows.push({ count, ...measure(db,'first_page_250k_chars_without_length',`SELECT ${select.replace('LENGTH(text)', '0')} FROM clipboard_items ORDER BY ${order} LIMIT ?`,[61]) });
  const addTag = db.prepare('INSERT INTO tags(id,slug,label,created_at_unix_ms,updated_at_unix_ms) VALUES (?,?,?,0,0)');
  const addLink = db.prepare('INSERT INTO clipboard_item_tags(item_id,tag_id,created_at_unix_ms) VALUES (?,?,0)');
  for (const tagCount of [10,100,500]) {
    db.exec('BEGIN; DELETE FROM clipboard_item_tags; DELETE FROM tags;');
    for (let t=1;t<=tagCount;t++) addTag.run(t,`synthetic-${t}`,`synthetic-${t}`);
    for (let i=1;i<=count;i++) addLink.run(i,1+i%tagCount);
    db.exec('COMMIT');
    const m = { count, tagCount, ...measure(db,'list_tags',tagsSql,[],3) };
    output.rows.push(m); console.log(JSON.stringify(m));
    const candidate = tagsSql.replace(
      /FROM clipboard_item_tags hierarchy_links\s+JOIN tags hierarchy_tags ON hierarchy_tags.id = hierarchy_links.tag_id/,
      'FROM tags hierarchy_tags CROSS JOIN clipboard_item_tags hierarchy_links ON hierarchy_links.tag_id = hierarchy_tags.id');
    if (candidate === tagsSql) throw Error('candidate extraction drift');
    const expected = db.prepare(tagsSql).all();
    const actual = db.prepare(candidate).all();
    if (JSON.stringify(expected) !== JSON.stringify(actual)) throw Error('candidate results differ');
    const improved = { count, tagCount, ...measure(db,'list_tags_candidate_tag_first',candidate,[],3) };
    output.rows.push(improved); console.log(JSON.stringify(improved));
  }
  db.close();
}
writeFileSync('.codex-run/picker-open-audit/sql-results.json', JSON.stringify(output,null,2));
console.log(JSON.stringify(output,null,2));
