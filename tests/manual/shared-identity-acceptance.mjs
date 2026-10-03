// Built Windows host and mounted Settings UI, with fresh synthetic profiles.
// OIDC is a real RSA/PKCE loopback test issuer; no provider account or real data.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { once } from 'node:events';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { openSync, closeSync, createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

const repo = path.resolve(import.meta.dirname, '../..'), source = path.resolve(process.argv[2] ?? ''), exe = path.resolve(process.argv[3] ?? '');
assert.equal(path.dirname(source), path.join(repo, '.codex-run'));
assert(path.basename(source).startsWith('shared-product-'));
assert.equal(await readFile(path.join(source, 'synthetic.marker'), 'utf8'), 'Copicu synthetic shared product fixture v1\n');
assert.equal(path.basename(exe).toLowerCase(), 'copicu.exe');
const sourceDb = new DatabaseSync(path.join(source, 'receiver-profile/copicu.sqlite3'), { readOnly: true });
const settings = JSON.parse(sourceDb.prepare("SELECT value_json FROM app_settings WHERE key='app'").get().value_json);
assert.equal(settings.general.captureEnabled, false); assert.equal(settings.autoUpdate.enabled, false); assert.equal(settings.ai.enabled, false);
const shadows = new Set(sourceDb.prepare('PRAGMA table_list').all().filter(t => t.type === 'shadow').map(t => t.name));
const schema = sourceDb.prepare("SELECT name,type,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY CASE type WHEN 'table' THEN 0 ELSE 1 END,rowid").all().filter(t => !t.name.startsWith('shared_') && !shadows.has(t.name));
const schemaVersion = sourceDb.prepare('PRAGMA user_version').get().user_version; sourceDb.close();
const root = await mkdtemp(path.join(repo, '.codex-run/shared-identity-'));
await writeFile(path.join(root, 'synthetic.marker'), 'Copicu synthetic identity acceptance v3\n');
console.log('Owned synthetic acceptance directory: ' + root);
const childEnv = { ...process.env, COPICU_SHARED_IDENTITY_LOOPBACK: '1' };
const runtimePath = process.env.PATH.split(path.delimiter).filter(p => !/miniconda3/i.test(p));
for (const key of Object.keys(childEnv)) if (key.toLowerCase() === 'path') delete childEnv[key];
childEnv.PATH = [path.dirname(exe), ...runtimePath.filter(p => /mingw64[\\/]bin$/i.test(p)), ...runtimePath].join(path.delimiter);
const processes = [], browsers = [], results = [], peers = [];
const pass = name => { results.push({ name, outcome: 'pass' }); console.log('PASS ' + name); };
const wait = async (fn, label, timeout = 20000) => { const until = Date.now() + timeout; while (Date.now() < until) { if (await fn()) return; await new Promise(r => setTimeout(r, 100)); } throw Error('deadline: ' + label); };
let fixture;
try {
  const relayDiagnostic = openSync(path.join(root, 'relay-startup.log'), 'a');
  fixture = spawn('bun', ['tests/manual/shared-identity-relay.mjs'], { cwd: repo, stdio: ['pipe', 'pipe', relayDiagnostic], windowsHide: true }); closeSync(relayDiagnostic);
  const lines = createInterface({ input: fixture.stdout });
  const ask = async value => { const reply = once(lines, 'line'); fixture.stdin.write(JSON.stringify(value) + '\n'); return JSON.parse((await reply)[0]); };
  const info = await ask({ dbPath: path.join(root, 'relay.sqlite'), environment: 'identity_ui_synthetic' });
  for (const [index, name, port] of [[0, 'Work', 9451], [1, 'Home', 9452], [2, 'Recovered', 9453]]) {
    const profile = path.join(root, name.toLowerCase()); await mkdir(profile);
    const s = structuredClone(settings);
    s.general.captureEnabled = false; s.general.launchOnStartup = false;
    s.general.globalShortcut = `Ctrl+Shift+F${index + 7}`; s.general.inboxShortcut = `Ctrl+Alt+F${index + 7}`; s.general.pasteNextShortcut = `Ctrl+Alt+Shift+F${index + 7}`;
    s.picker.pinToggleShortcut = ''; s.picker.externalEditorShortcut = ''; s.picker.hideOnFocusLost = false;
    s.autoUpdate.enabled = false; s.ai.enabled = false; s.ai.apiKey = ''; s.scripts.folderPath = path.join(profile, 'scripts');
    const db = new DatabaseSync(path.join(profile, 'copicu.sqlite3'));
    for (const entry of schema) db.exec(entry.sql);
    db.exec(`PRAGMA user_version=${schemaVersion}`); db.prepare('INSERT INTO app_settings VALUES(?,?,0)').run('app', JSON.stringify(s)); db.close();
    const diagnostic = openSync(path.join(profile, 'host-startup.log'), 'a');
    const child = spawn(exe, [], { cwd: repo, windowsHide: true, stdio: ['ignore', diagnostic, diagnostic], env: { ...childEnv, COPICU_SHARED_IDENTITY_ENDPOINT: info.url, COPICU_APP_DATA_DIR: profile, COPICU_SCRIPTS_DIR: path.join(profile, 'scripts'), WEBVIEW2_USER_DATA_FOLDER: path.join(profile, 'webview'), WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}` } }); processes.push(child); closeSync(diagnostic);
    await wait(async () => { try { return (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).some(t => t.type === 'page' && /tauri|localhost/.test(t.url)); } catch { return false; } }, 'owned WebView');
    const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`); browsers.push(browser);
    let main, ui;
    await wait(async () => { assert.equal(child.exitCode, null, 'owned app startup failed'); for (const page of browser.contexts()[0]?.pages() ?? []) if (await page.evaluate(() => window.__TAURI_INTERNALS__?.metadata?.currentWindow?.label).catch(() => null) === 'main') main = page; return !!main; }, 'main host');
    const call = (c, a = {}) => main.evaluate(({ c, a }) => window.__TAURI_INTERNALS__.invoke(c, a), { c, a });
    assert.equal((await call('shared_clipboard_status')).configured, false);
    await assert.rejects(call('shared_clipboard_identity', { input: { kind: 'status' } }), /Settings/);
    await call('open_settings_window');
    await wait(async () => { for (const p of browser.contexts()[0]?.pages() ?? []) if (await p.evaluate(() => window.__TAURI_INTERNALS__?.metadata?.currentWindow?.label).catch(() => null) === 'settings') ui = p; return !!ui; }, 'Settings host');
    await ui.getByRole('tab', { name: /^Sharing/ }).click();
    const identity = ui.getByRole('region', { name: 'Device sign-in' });
    await ui.getByText('No device linked', { exact: true }).waitFor();
    const settingsCall = (c, a = {}) => ui.evaluate(({ c, a }) => window.__TAURI_INTERNALS__.invoke(c, a), { c, a });
    const identityCall = input => settingsCall('shared_clipboard_identity', { input });
    assert.equal(await identity.getByLabel('Sharing service URL').count(), 0);
    await identity.getByLabel('Name of this PC').fill(`Synthetic ${name}`);
    await identity.getByRole('button', { name: 'Sign in in browser' }).click();
    await wait(async () => ['active', 'pending'].includes((await identityCall({ kind: 'status' })).state), 'system browser synthetic login');
    peers.push({ name, profile, ui, identity, call, settingsCall, identityCall });
  }
  const [a, b, c] = peers, status = peer => peer.call('shared_clipboard_status');
  assert.equal((await a.identityCall({ kind: 'status' })).state, 'active');
  for (const peer of [b, c]) { assert.equal((await peer.identityCall({ kind: 'status' })).state, 'pending'); assert.equal((await status(peer)).configured, false); }
  assert.deepEqual((await a.call('shared_clipboard_catalog')).resources, []);
  pass('three fresh profiles use mounted UI and system-browser OIDC; first is empty and siblings require approval');
  await a.identity.getByRole('button', { name: 'Create or connect a clipboard…' }).click();
  let dialog = a.ui.getByRole('dialog', { name: 'Connect shared clipboard' });
  await dialog.getByRole('button', { name: 'Create shared clipboard…' }).click();
  await dialog.getByLabel('New clipboard name').fill('Synthetic Windows identity ñ 🙂');
  await dialog.getByLabel('Direction', { exact: true }).click();
  await a.ui.getByRole('option', { name: 'Send and receive', exact: true }).click();
  await dialog.getByRole('button', { name: 'Create and connect', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  const channelId = (await a.call('shared_clipboard_catalog')).resources[0].id;
  const pending = await b.identityCall({ kind: 'status' });
  const owner = await a.identityCall({ kind: 'status' });
  assert.equal(owner.devices.find(d => d.deviceId === pending.deviceId).fingerprint, pending.fingerprint);
  await b.identity.getByText(pending.fingerprint, { exact: true }).waitFor();
  await b.ui.screenshot({ path: path.join(root, 'native-pending.png') });
  const row = a.identity.getByRole('listitem').filter({ hasText: 'Synthetic Home' });
  // Wait for the last enrollment to reach mounted UI. Approval uses that exact
  // displayed account revision, never an API response substituted into React.
  await a.identity.getByRole('listitem').filter({ hasText: 'Synthetic Recovered' }).waitFor();
  await row.getByRole('checkbox', { name: 'I compared this fingerprint on the requesting PC' }).check();
  await row.getByRole('button', { name: 'Approve device', exact: true }).click();
  await wait(async () => { const alert = a.identity.getByRole('alert'); if (await alert.count()) throw Error(await alert.innerText()); return (await a.identityCall({ kind: 'status' })).devices.find(d => d.deviceId === pending.deviceId).state === 'active'; }, 'owner approval commit');
  await wait(async () => (await b.identityCall({ kind: 'status' })).state === 'active', 'device approval import');
  const linked = await status(b); assert.equal(linked.connections.length, 0); assert.equal(linked.receipts.length, 0);
  assert(linked.channels.every(ch => !ch.receiveEnabled && !ch.updateClipboard && !ch.receiveActionEnabled && !ch.publishFolderEnabled));
  assert.equal((await b.call('shared_clipboard_catalog')).resources[0].name, 'Synthetic Windows identity ñ 🙂');
  pass('full fingerprint approval imports real HPKE keys while every local connection and native effect stays off');
  await b.identity.getByRole('button', { name: 'Create or connect a clipboard…' }).click();
  dialog = b.ui.getByRole('dialog', { name: 'Connect shared clipboard' });
  await dialog.getByRole('option', { name: /Synthetic Windows identity/ }).click();
  await dialog.getByLabel('Direction', { exact: true }).click(); await b.ui.getByRole('option', { name: 'Send and receive', exact: true }).click();
  await dialog.getByRole('button', { name: 'Connect clipboard', exact: true }).click(); await dialog.waitFor({ state: 'hidden' });
  for (const [sender, receiver, text] of [[a, b, 'Synthetic Work → Home ñ 🙂'], [b, a, 'Synthetic Home → Work λ']]) {
    const pub = await sender.call('shared_clipboard_publish', { channelId, text });
    await wait(async () => (await status(receiver)).receipts.some(r => r.publicationId === pub.publicationId), 'bidirectional encrypted receipt');
    const receipt = (await status(receiver)).receipts.find(r => r.publicationId === pub.publicationId);
    assert.equal(await receiver.call('shared_clipboard_receipt_text', { subscriptionId: receipt.subscriptionId, publicationId: receipt.publicationId }), text);
    assert.equal((await status(receiver)).receipts.filter(r => r.publicationId === pub.publicationId).length, 1);
  }
  pass('explicit UI connections deliver Unicode text in both directions once, with Windows and Actions disabled');
  await ask({ command: 'offline' }); assert.equal((await b.identityCall({ kind: 'status' })).state, 'offline');
  await ask({ command: 'restart' }); assert.equal((await b.identityCall({ kind: 'status' })).state, 'active');
  assert.equal((await status(b)).connections.length, 1);
  pass('service restart preserves identity, keys and explicit connection');
  await a.identity.getByText('Set up recovery', { exact: true }).click();
  await a.identity.getByRole('button', { name: 'Generate recovery code' }).click();
  const codeElement = a.identity.locator('.shared-recovery-code code'); await codeElement.waitFor();
  const code = (await codeElement.innerText()).replaceAll(' ', ''); assert.equal(code.length, 64);
  await a.identity.getByRole('button', { name: 'I stored the code, hide it' }).click();
  await c.identity.getByRole('button', { name: 'Check approval' }).click();
  await c.identity.getByText('Recover with a saved code', { exact: true }).click();
  await c.identity.getByLabel('Saved recovery code').fill(code);
  await c.identity.getByRole('checkbox', { name: "Retire earlier devices and recover this account's available keys" }).check();
  await c.identity.getByRole('button', { name: 'Recover this device', exact: true }).click();
  await wait(async () => (await c.identityCall({ kind: 'status' })).state === 'active', 'UI recovery');
  const recovered = await status(c); assert.equal(recovered.connections.length, 0); assert.equal(recovered.receipts.length, 0); assert(!recovered.channels[0].canPublish);
  for (const old of [a, b]) { assert.equal((await old.identityCall({ kind: 'status' })).state, 'revoked'); assert((await status(old)).receivePaused); assert((await status(old)).receipts.length >= 1); }
  await c.ui.screenshot({ path: path.join(root, 'native-recovered.png') });
  pass('explicit UI recovery restores content keys, retires older devices, preserves their local copies and requires rotation');
  const executableHash = createHash('sha256'); for await (const chunk of createReadStream(exe)) executableHash.update(chunk);
  await writeFile(path.join(root, 'identity-ui-results.json'), JSON.stringify({ executable: exe, executableSHA256: executableHash.digest('hex'), checkedAt: new Date().toISOString(), cases: results, physicalPcAcceptance: false }, null, 2));
  console.log(JSON.stringify({ passed: results.length, root }));
} finally {
  for (const browser of browsers) await browser.close().catch(() => {});
  for (const child of processes) if (child.exitCode === null) { child.kill(); await once(child, 'exit').catch(() => {}); }
  if (fixture?.exitCode === null) { fixture.stdin.write(JSON.stringify({ command: 'stop' }) + '\n'); await once(fixture, 'exit'); }
}
