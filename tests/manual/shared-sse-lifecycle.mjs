// Fault injection against the shipping host, using new synthetic profiles only.
// The loopback proxy holds immutable catalog responses and rejects event opens.
// Fault controls are in this process, never exposed as product HTTP routes.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { createInterface } from 'node:readline';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { once } from 'node:events';
import path from 'node:path';

const repo = path.resolve(import.meta.dirname, '../..');
const source = path.resolve(process.argv[2] ?? '');
const exe = path.resolve(process.argv[3] ?? '');
const runtimePath = process.env.PATH.split(path.delimiter).filter(p => !/miniconda3/i.test(p));
const childEnv = { ...process.env };
for (const key of Object.keys(childEnv)) if (key.toLowerCase() === 'path') delete childEnv[key];
childEnv.PATH = [path.dirname(exe), ...runtimePath.filter(p => /mingw64[\\/]bin$/i.test(p)), ...runtimePath].join(path.delimiter);
assert.equal(path.dirname(source), path.join(repo, '.codex-run'));
assert(path.basename(source).startsWith('shared-product-'));
assert.equal(await readFile(path.join(source, 'synthetic.marker'), 'utf8'), 'Copicu synthetic shared product fixture v1\n');
assert.equal(path.basename(exe).toLowerCase(), 'copicu.exe');
const sourceDb = new DatabaseSync(path.join(source, 'receiver-profile/copicu.sqlite3'), { readOnly: true });
const settings = JSON.parse(sourceDb.prepare("SELECT value_json FROM app_settings WHERE key='app'").get().value_json);
// Copy only the already migrated base schema, never private history/config data.
const shadows = new Set(sourceDb.prepare('PRAGMA table_list').all().filter(t => t.type === 'shadow').map(t => t.name));
const schema = sourceDb.prepare("SELECT name,type,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY CASE type WHEN 'table' THEN 0 ELSE 1 END,rowid").all().filter(t => !t.name.startsWith('shared_') && !shadows.has(t.name));
const schemaVersion = sourceDb.prepare('PRAGMA user_version').get().user_version;
sourceDb.close();
const processes = [], browsers = [], proxies = [], results = [];
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function wait(fn, label, timeout = 5000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { if (await fn()) return; await pause(50); }
  throw Error(`deadline: ${label}`);
}
function pass(name) { results.push({ name, outcome: 'pass' }); console.log('PASS ' + name); }
function dbRead(profile, fn) {
  const db = new DatabaseSync(path.join(profile, 'copicu.sqlite3'), { readOnly: true });
  try { return fn(db); } finally { db.close(); }
}
const config = profile => dbRead(profile, db => JSON.parse(db.prepare('SELECT json FROM shared_product_config WHERE id=1').get().json));
function changeConfig(profile, change) {
  const db = new DatabaseSync(path.join(profile, 'copicu.sqlite3'));
  try {
    db.exec('BEGIN IMMEDIATE');
    const c = JSON.parse(db.prepare('SELECT json FROM shared_product_config WHERE id=1').get().json);
    change(c); db.prepare('UPDATE shared_product_config SET json=? WHERE id=1').run(JSON.stringify(c)); db.exec('COMMIT');
  } finally { db.close(); }
}
const cache = profile => dbRead(profile, db => db.prepare('SELECT identity,json FROM shared_control_cache ORDER BY identity').all());
const grants = profile => dbRead(profile, db => db.prepare('SELECT environment,channel,origin,hex(revision) revision,authorized FROM shared_grants ORDER BY environment,channel,origin').all());
async function proxy(endpoint) {
  const p = { hold: false, held: [], eventStatus: 200, catalogStatus: 200, stripControl: false, calls: [], active: 0, closed: 0, hints: [], streams: new Set() };
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, endpoint);
    p.calls.push({ path: url.pathname, at: Date.now() });
    if (url.pathname === '/v2/events' && p.eventStatus !== 200) { response.writeHead(p.eventStatus); response.end(); return; }
    if (url.pathname === '/v2/catalog' && p.catalogStatus !== 200) { response.writeHead(p.catalogStatus); response.end(); return; }
    const abort = new AbortController();
    response.on('close', () => abort.abort());
    try {
      const parts = []; for await (const part of request) parts.push(part);
      const remote = await fetch(url, { method: request.method, headers: request.headers, body: parts.length ? Buffer.concat(parts) : undefined, signal: abort.signal });
      const headers = Object.fromEntries(remote.headers); delete headers['transfer-encoding']; delete headers['content-length'];
      if (url.pathname === '/v2/events') {
        p.active++; p.streams.add(response);
        response.on('close', () => { p.active--; p.closed++; p.streams.delete(response); });
        response.writeHead(remote.status, headers); response.flushHeaders();
        const decoder = new TextDecoder(); let buffer = '';
        for await (const part of remote.body) {
          buffer += decoder.decode(part, { stream: true });
          let boundary;
          while ((boundary = buffer.indexOf('\n\n')) >= 0) {
            const frame = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 2);
            const data = frame.split('\n').find(line => line.startsWith('data: '));
            if (data) { const hint = JSON.parse(data.slice(6)); if (hint.type === 'publication_head_changed') { assert(p.hints.length < 100); p.hints.push(hint); } }
          }
          assert(buffer.length < 16384);
          if (!response.write(part)) await once(response, 'drain');
        }
        response.end();
      } else {
        let body = Buffer.from(await remote.arrayBuffer());
        if (url.pathname === '/v2/catalog' && p.stripControl && remote.ok) { const value = JSON.parse(body); delete value.control; body = Buffer.from(JSON.stringify(value)); }
        const send = () => { if (!response.destroyed) { response.writeHead(remote.status, headers); response.end(body); } };
        if (url.pathname === '/v2/catalog' && p.hold) { p.hold = false; p.held.push(send); } else send();
      }
    } catch { if (!response.destroyed) { response.writeHead(503); response.end(); } }
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  p.url = `http://127.0.0.1:${server.address().port}`; p.server = server;
  p.release = () => { for (const send of p.held.splice(0)) send(); };
  proxies.push(p); return p;
}
async function publications(sender, receiver, relayRoot, p) {
  const channelId = 'synthetic_channel';
  const status = () => receiver.call('shared_clipboard_status');
  const publish = text => sender.call('shared_clipboard_publish', { channelId, text });
  const accepted = async ids => wait(async () => {
    const rows = (await sender.call('shared_clipboard_status')).outbox;
    return ids.every(id => rows.some(r => r.publicationId === id && r.state === 'accepted'));
  }, 'publication ACKs');
  const control = cache(receiver.profile);
  const first = await publish('synthetic-no-connection'); await accepted([first.publicationId]);
  await wait(() => p.hints.length === 1, 'publication hint without connection');
  assert.equal((await status()).receipts.length, 0); assert.equal((await status()).connections.length, 0);
  assert.equal(dbRead(receiver.profile, db => db.prepare('SELECT count(*) count FROM clipboard_items').get().count), 0);
  assert.deepEqual(cache(receiver.profile), control);
  assert.deepEqual(Object.keys(p.hints[0]).sort(), ['version', 'type', 'resourceId', 'head', 'cursor'].sort());
  pass('publication hints contain only IDs/counters and do not connect, import or advance catalog water');
  await receiver.call('shared_clipboard_connection', { action: 'connect', input: { id: 'synthetic_receive', channelId, kind: 'general', folderId: null, direction: 'receive', moveReception: false } });
  const connectedPolicies = config(receiver.profile).channels.map(c => c.policy);
  await receiver.call('shared_clipboard_connection', { action: 'pause', input: { channelId: null, sendPaused: true, receivePaused: true } });
  const syncs = p.calls.filter(c => c.path.endsWith('/sync')).length;
  const paused = await publish('synthetic-receive-paused'); await accepted([paused.publicationId]);
  await wait(() => p.hints.length === 2, 'hint while receiving paused'); await pause(650);
  assert.equal((await status()).receipts.length, 0); assert.equal(p.calls.filter(c => c.path.endsWith('/sync')).length, syncs);
  assert.deepEqual(config(receiver.profile).channels.map(c => c.policy), connectedPolicies);
  pass('receive pause keeps SSE active while suppressing delivery and native effects');
  await receiver.call('shared_clipboard_connection', { action: 'pause', input: { channelId: null, sendPaused: true, receivePaused: false } });
  await pause(650); assert.equal((await status()).receipts.length, 0);
  pass('explicit receive resume skips the paused range without backfill');
  const ids = [];
  for (let i = 0; i < 20; i++) ids.push((await publish(`synthetic-SSE-burst-${i}`)).publicationId);
  await accepted(ids);
  await wait(async () => (await status()).receipts.length === 20 && p.hints.length === 22, 'twenty-publication burst');
  let state = await status(); assert.equal(new Set(state.receipts.map(r => r.publicationId)).size, 20); assert.equal(state.outbox.length, 0);
  assert.deepEqual(cache(receiver.profile), control);
  pass('twenty shipping publications deliver once with no echo or per-publication catalog pull');
  const relayDb = new DatabaseSync(path.join(relayRoot, 'relay.sqlite'), { readOnly: true });
  try {
    const rows = relayDb.prepare('SELECT id,envelope,lease_proof FROM relay_publications').all().filter(r => ids.includes(r.id));
    assert.equal(rows.length, 20); assert(rows.every(r => JSON.parse(r.envelope).freshness.kind === 'live' && r.lease_proof));
  } finally { relayDb.close(); }
  pass('burst keeps signed live leases and delivery receipts through the unchanged V1 path');
  p.eventStatus = 503; for (const response of [...p.streams]) response.destroy();
  await wait(async () => (await status()).controlSyncState === 'offline', 'SSE offline');
  const offline = await publish('synthetic-SSE-offline-tick'); await accepted([offline.publicationId]);
  await wait(async () => (await status()).receipts.length === 21, 'tick fallback delivery');
  pass('existing ticks deliver while the SSE transport is disconnected');
  p.eventStatus = 200;
  await wait(async () => (await status()).controlSyncState === 'live' && p.active === 1, 'SSE reconnect', 10000);
  await pause(650); assert.equal((await status()).receipts.length, 21); assert.equal((await status()).outbox.length, 0);
  pass('snapshot/reconnect keeps existing receipts and causes no duplicate or echo');
  await sender.call('shared_clipboard_connection', { action: 'pause', input: { channelId: null, sendPaused: true, receivePaused: null } });
  await assert.rejects(() => publish('synthetic-send-paused'), /sending is paused/);
  await sender.call('shared_clipboard_connection', { action: 'pause', input: { channelId: null, sendPaused: false, receivePaused: null } });
  const resumed = await publish('synthetic-send-resumed'); await accepted([resumed.publicationId]);
  await wait(async () => (await status()).receipts.length === 22, 'sending resumed');
  pass('send pause remains independent and explicit resume delivers the next publication once');
  await receiver.call('shared_clipboard_connection', { action: 'disconnect', input: { id: 'synthetic_receive' } });
  state = await status(); assert.equal(state.connections.length, 0); assert.equal(state.receipts.length, 22); assert.equal(state.outbox.length, 0);
  assert(config(receiver.profile).channels.every(c => !c.policy.updateClipboard && !c.policy.receiveActionEnabled && !c.policy.saveToFolder));
  await wait(() => dbRead(receiver.profile, db => db.prepare('SELECT count(*) count FROM clipboard_items').get().count) === 22, 'explicit connection local copies');
  pass('explicit connection keeps exactly its 22 local copies with native opt-ins off and no backfill or implicit connection');
}
let fixture, root;
try {
  fixture = spawn('bun', ['tests/manual/shared-product-fixture.mjs'], { cwd: repo, stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true });
  const lines = createInterface({ input: fixture.stdout });
  const info = JSON.parse((await once(lines, 'line'))[0]); root = info.root;
  assert.equal(path.dirname(root), path.join(repo, '.codex-run'));
  const receiverProxy = await proxy(info.endpoint), changedProxy = await proxy(info.endpoint);
  const peers = [];
  for (const [index, kind, port] of [[0, 'sender', 9431], [1, 'receiver', 9432]]) {
    const profile = path.join(root, `${kind}-profile`); await mkdir(profile);
    const bundlePath = path.join(root, `${kind}-enrollment.json`);
    const s = structuredClone(settings);
    s.general.captureEnabled = false; s.general.launchOnStartup = false;
    s.general.globalShortcut = `Ctrl+Shift+F${index + 3}`;
    s.general.inboxShortcut = `Ctrl+Alt+F${index + 3}`;
    s.general.pasteNextShortcut = `Ctrl+Alt+F${index + 11}`;
    s.picker.pinToggleShortcut = ''; s.picker.externalEditorShortcut = ''; s.picker.hideOnFocusLost = false;
    s.autoUpdate.enabled = false; s.ai.enabled = false; s.ai.apiKey = '';
    const db = new DatabaseSync(path.join(profile, 'copicu.sqlite3'));
    for (const entry of schema) db.exec(entry.sql);
    db.exec(`PRAGMA user_version=${schemaVersion}`);
    s.scripts.folderPath = path.join(root, 'synthetic-scripts');
    db.prepare('INSERT INTO app_settings VALUES(?,?,0)').run('app', JSON.stringify(s)); db.close();
    if (index === 1) { const bundle = JSON.parse(await readFile(bundlePath)); bundle.endpoint = receiverProxy.url; await writeFile(bundlePath, JSON.stringify(bundle)); }
    const launchEnv = { ...childEnv, COPICU_APP_DATA_DIR: profile, COPICU_SCRIPTS_DIR: path.join(profile, 'scripts'), WEBVIEW2_USER_DATA_FOLDER: path.join(profile, 'webview'), WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}` };
    const child = spawn(exe, [], { cwd: repo, windowsHide: true, stdio: 'ignore', env: launchEnv });
    processes.push(child);
    await wait(async () => { try { const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); return targets.some(t => t.type === 'page' && /tauri|localhost/.test(t.url)); } catch { return false; } }, 'owned CDP target ready', 15000);
    const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`); browsers.push(browser);
    let main; await wait(async () => { for (const page of browser.contexts()[0]?.pages() ?? []) if (await page.evaluate(() => window.__TAURI_INTERNALS__?.metadata?.currentWindow?.label).catch(() => null) === 'main') main = page; return !!main; }, 'owned main WebView', 15000);
    const call = (c, a = {}) => main.evaluate(({ c, a }) => window.__TAURI_INTERNALS__.invoke(c, a), { c, a });
    assert.equal((await call('shared_clipboard_status')).configured, false);
    assert.equal(dbRead(profile, db => db.prepare("SELECT count(*) count FROM sqlite_master WHERE type='table' AND name LIKE 'shared_%'").get().count), 0);
    await call('open_settings_window'); let settingsPage;
    await wait(async () => { for (const page of browser.contexts()[0].pages()) if (await page.evaluate(() => window.__TAURI_INTERNALS__?.metadata?.currentWindow?.label).catch(() => null) === 'settings') settingsPage = page; return !!settingsPage; }, 'owned Settings WebView');
    const settingsCall = (c, a = {}) => settingsPage.evaluate(({ c, a }) => window.__TAURI_INTERNALS__.invoke(c, a), { c, a });
    const preview = await settingsCall('shared_clipboard_preview_enrollment', { bundlePath });
    await settingsCall('shared_clipboard_configure', { bundlePath, confirmedFingerprint: preview.fingerprint });
    await settingsCall('close_settings_window');
    peers.push({ profile, call, child, launchEnv, port });
  }
  const [sender, receiver] = peers;
  pass('unconfigured shipping profiles create no sharing tables or transport');
  const status = () => receiver.call('shared_clipboard_status');
  await wait(async () => (await status()).controlSyncState === 'live' && receiverProxy.active === 1, 'shipping SSE live');
  if (process.argv[4] === 'publications') {
    await publications(sender, receiver, root, receiverProxy);
  } else {
  await receiver.call('shared_clipboard_connection', { action: 'pause', input: { channelId: null, sendPaused: true, receivePaused: true } });
  const rename = async name => {
    const cat = await sender.call('shared_clipboard_catalog'); const resource = cat.resources.find(r => r.id === 'synthetic_channel');
    await sender.call('shared_clipboard_operation', { input: { kind: 'rename', operationId: crypto.randomUUID().replaceAll('-', ''), resourceId: resource.id, expectedRevision: resource.revision, name } });
  };
  const before = cache(receiver.profile), beforeGrants = grants(receiver.profile);
  receiverProxy.hold = true; await rename('Synthetic SSE late pause');
  await wait(() => receiverProxy.held.length === 1, 'snapshot held before pause');
  // Legacy global transport pause has no shipping UI intent; mutate only this
  // test-owned SQLite row. Direction pause above remains a real shipping IPC.
  changeConfig(receiver.profile, c => { c.paused = true; });
  const pausedConfig = config(receiver.profile); receiverProxy.release();
  await wait(async () => (await status()).controlSyncState === 'off' && receiverProxy.active === 0, 'global pause cancels stream');
  assert.deepEqual(config(receiver.profile), pausedConfig); assert.deepEqual(cache(receiver.profile), before); assert.deepEqual(grants(receiver.profile), beforeGrants);
  pass('late snapshot after global pause leaves config, grants and control cursor unchanged');
  const count = receiverProxy.calls.length; await pause(1400); assert.equal(receiverProxy.calls.length, count);
  pass('global pause cancels SSE and stops automatic HTTP');
  changeConfig(receiver.profile, c => { c.paused = false; });
  await wait(async () => (await status()).controlSyncState === 'live' && receiverProxy.active === 1, 'resume live');
  const identityCache = cache(receiver.profile), identityGrants = grants(receiver.profile);
  receiverProxy.hold = true; await rename('Synthetic SSE late identity');
  await wait(() => receiverProxy.held.length === 1, 'snapshot held before identity change');
  changedProxy.hold = true;
  changeConfig(receiver.profile, c => { c.endpoint = changedProxy.url; }); receiverProxy.release();
  await wait(() => changedProxy.held.length === 1 && receiverProxy.active === 0, 'new identity snapshot held');
  assert.equal(config(receiver.profile).endpoint, changedProxy.url); assert.deepEqual(cache(receiver.profile), identityCache); assert.deepEqual(grants(receiver.profile), identityGrants);
  pass('late snapshot after endpoint identity change cannot restore old config, grants or cursor');
  changedProxy.release();
  await wait(async () => (await status()).controlSyncState === 'live' && changedProxy.active === 1, 'changed identity live');
  assert.equal(cache(receiver.profile).length, identityCache.length + 1);
  pass('new identity reconciles into a separate durable cache');
  changeConfig(receiver.profile, c => { c.paused = true; });
  const cancelAt = Date.now(); await wait(() => changedProxy.active === 0, 'active stream cancelled', 2000);
  pass(`shipping pause cancels an idle SSE stream in ${Date.now() - cancelAt}ms`);
  await wait(async () => (await status()).controlSyncState === 'off', 'pause applied');
  changedProxy.eventStatus = 404;
  changeConfig(receiver.profile, c => { c.paused = false; });
  await wait(async () => (await status()).controlSyncState === 'unsupported', 'legacy event fallback');
  const fallbackCatalogCount = changedProxy.calls.filter(c => c.path === '/v2/catalog').length;
  await rename('Synthetic SSE fallback eventual');
  await pause(1800); assert.equal(changedProxy.calls.filter(c => c.path === '/v2/catalog').length, fallbackCatalogCount);
  pass('unsupported enters periodic fallback without rapid polling');
  const started = Date.now();
  await wait(() => cache(receiver.profile).some(c => JSON.parse(c.json).resources.some(r => r.name === 'Synthetic SSE fallback eventual')), 'fallback reconciles under 60 seconds', 62000);
  assert(Date.now() - started >= 45000); assert.equal(changedProxy.calls.filter(c => c.path === '/v2/catalog').length, fallbackCatalogCount + 1);
  pass('unsupported reconciles once at the bounded 55–59 second fallback interval');
  changeConfig(receiver.profile, c => { c.paused = true; }); await wait(async () => (await status()).controlSyncState === 'off', 'fallback paused');
  changedProxy.eventStatus = 200; changedProxy.stripControl = true;
  const legacyCount = changedProxy.calls.filter(c => c.path === '/v2/events').length;
  changeConfig(receiver.profile, c => { c.paused = false; });
  await wait(async () => (await status()).controlSyncState === 'unsupported', 'legacy snapshot without control');
  assert.equal(changedProxy.calls.filter(c => c.path === '/v2/events').length, legacyCount);
  pass('catalog without control watermark enters fallback without opening an SSE stream');
  changeConfig(receiver.profile, c => { c.paused = true; }); await wait(async () => (await status()).controlSyncState === 'off', 'legacy paused');
  changedProxy.stripControl = false;
  changeConfig(receiver.profile, c => { c.paused = false; });
  await wait(async () => (await status()).controlSyncState === 'live' && changedProxy.active === 1, 'live before shutdown');
  const shutdown = once(receiver.child, 'exit'), shutdownAt = Date.now();
  await receiver.call('quit_app').catch(() => {}); await shutdown;
  await wait(() => changedProxy.active === 0, 'shutdown closes active stream', 2000);
  assert(Date.now() - shutdownAt < 2000); pass('shipping quit settles owned process and active transport within two seconds');
  await browsers[1].close(); await rename('Synthetic SSE missed on shutdown');
  receiver.child = spawn(exe, [], { cwd: repo, windowsHide: true, stdio: 'ignore', env: receiver.launchEnv }); processes.push(receiver.child);
  await wait(async () => { try { return (await (await fetch(`http://127.0.0.1:${receiver.port}/json/list`)).json()).some(t => t.type === 'page' && /tauri|localhost/.test(t.url)); } catch { return false; } }, 'restart owned target', 15000);
  const restarted = await chromium.connectOverCDP(`http://127.0.0.1:${receiver.port}`); browsers.push(restarted);
  let restartedMain;
  await wait(async () => { for (const page of restarted.contexts()[0]?.pages() ?? []) if (await page.evaluate(() => window.__TAURI_INTERNALS__?.metadata?.currentWindow?.label).catch(() => null) === 'main') restartedMain = page; return !!restartedMain; }, 'restarted main');
  receiver.call = (c, a = {}) => restartedMain.evaluate(({ c, a }) => window.__TAURI_INTERNALS__.invoke(c, a), { c, a });
  await wait(() => cache(receiver.profile).some(c => JSON.parse(c.json).resources.some(r => r.name === 'Synthetic SSE missed on shutdown')), 'restart background reconciles');
  pass('restart catches a missed commit while picker is hidden without renderer catalog fetch');
  if (process.argv[4] === 'catalog-denied') {
    await wait(async () => (await status()).controlSyncState === 'live' && changedProxy.active === 1, 'live before catalog denied');
    changedProxy.catalogStatus = 401; await rename('Synthetic SSE catalog denied');
  } else {
    changeConfig(receiver.profile, c => { c.paused = true; }); await wait(async () => (await status()).controlSyncState === 'off', 'pause before events denied');
    changedProxy.eventStatus = 403; changeConfig(receiver.profile, c => { c.paused = false; });
  }
  await wait(async () => (await status()).controlSyncState === 'denied', 'auth denied');
  await wait(() => changedProxy.active === 0, 'denied closes existing stream', 2000);
  assert(config(receiver.profile).channels.every(c => !c.policy.canPublish && !c.policy.receiveEnabled && c.grants.length === 0));
  assert(cache(receiver.profile).some(c => JSON.parse(c.json).resources.length === 0));
  const deniedCalls = changedProxy.calls.length; await pause(2300); assert.equal(changedProxy.calls.length, deniedCalls);
  pass(`${process.argv[4] === 'catalog-denied' ? 'catalog' : 'events'} denied revokes local grants, closes stream and has no fallback or rapid retry`);
  const final = await status(); assert.equal(final.connections.length, 0); assert.equal(final.receipts.length, 0); assert.equal(final.sendPaused, true); assert.equal(final.receivePaused, true);
  assert(config(receiver.profile).channels.every(c => !c.policy.updateClipboard && !c.policy.receiveActionEnabled));
  pass('fault lifecycle preserves flow pauses and creates no connections, receipts or native opt-ins');
  }
  await writeFile(path.join(root, process.argv[4] === 'publications' ? 'sse-publication-results.json' : 'sse-lifecycle-results.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ passed: results.length, root }));
} finally {
  for (const p of proxies) p.release();
  for (const browser of browsers) await browser.close();
  for (const child of processes) { if (child.exitCode === null) { child.kill(); await once(child, 'exit').catch(() => {}); } }
  for (const p of proxies) { p.server.closeAllConnections(); await new Promise(resolve => p.server.close(resolve)); }
  if (fixture?.exitCode === null) { fixture.stdin.write('stop\n'); await once(fixture, 'exit'); }
}
