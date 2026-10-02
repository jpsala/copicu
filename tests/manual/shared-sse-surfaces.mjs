// Actual shipping IPC/UI over isolated WebView2 CDP, with optional native review.
// No bridge mocks. Receiver catalog reads are performed by mounted product UI.
import { chromium } from '@playwright/test';
import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { once } from 'node:events';
import path from 'node:path';
const repo = path.resolve(import.meta.dirname, '../..');
const root = path.resolve(process.argv[2] ?? '');
assert.equal(path.dirname(root), path.join(repo, '.codex-run'));
assert(path.basename(root).startsWith('shared-product-'));
assert.equal(await readFile(path.join(root, 'synthetic.marker'), 'utf8'), 'Copicu synthetic shared product fixture v1\n');
const results = [], browsers = [], peers = [];
const label = `Synthetic SSE surfaces ${crypto.randomUUID().slice(0, 6)}`;
const pass = name => { results.push({ name, outcome: 'pass' }); console.log('PASS ' + name); };
async function wait(fn, label) { const deadline = Date.now() + 5000; while (Date.now() < deadline) { if (await fn()) return; await new Promise(r => setTimeout(r, 60)); } throw Error('deadline: ' + label); }
function cached() { const db = new DatabaseSync(path.join(root, 'receiver-profile/copicu.sqlite3'), { readOnly: true }); try { return JSON.parse(db.prepare('SELECT json FROM shared_control_cache').get().json); } finally { db.close(); } }
let channel;
try {
  for (const [kind, port] of [['sender', 9421], ['receiver', 9422]]) {
    const db = new DatabaseSync(path.join(root, `${kind}-profile/copicu.sqlite3`), { readOnly: true });
    const c = JSON.parse(db.prepare('SELECT json FROM shared_product_config').get().json);
    const s = JSON.parse(db.prepare("SELECT value_json FROM app_settings WHERE key='app'").get().value_json); db.close();
    assert(c.environment.startsWith('synthetic')); assert.equal(s.general.captureEnabled, false); assert.equal(s.ai.enabled, false); assert.equal(s.autoUpdate.enabled, false);
    assert(c.channels.every(ch => !ch.policy.updateClipboard && !ch.policy.receiveActionEnabled));
    const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`); browsers.push(browser);
    let main, settings;
    for (const page of browser.contexts()[0].pages()) { const label = await page.evaluate(() => window.__TAURI_INTERNALS__?.metadata?.currentWindow?.label); if (label === 'main') main = page; if (label === 'settings') settings = page; }
    assert(main);
    const call = (c, a = {}) => main.evaluate(({ c, a }) => window.__TAURI_INTERNALS__.invoke(c, a), { c, a });
    if (!settings) { await call('open_settings_window'); await wait(async () => { for (const p of browser.contexts()[0].pages()) if (await p.evaluate(() => window.__TAURI_INTERNALS__?.metadata?.currentWindow?.label).catch(() => null) === 'settings') settings = p; return !!settings; }, 'settings WebView'); }
    const settingsCall = (c, a = {}) => settings.evaluate(({ c, a }) => window.__TAURI_INTERNALS__.invoke(c, a), { c, a });
    await settingsCall('close_settings_window'); await call('hide_picker');
    peers.push({ main, settings, call, settingsCall });
  }
  const [owner, receiver] = peers;
  const op = async input => owner.call('shared_clipboard_operation', { input: { operationId: crypto.randomUUID().replaceAll('-', ''), ...input } });
  const before = await receiver.call('shared_clipboard_status'); assert.equal(before.connections.length, 0); assert.equal(before.receipts.length, 0);
  assert.equal(before.sendPaused, true); assert.equal(before.receivePaused, true);
  const created = await op({ kind: 'create', name: `${label} initial` }); channel = created.resource.id;
  const invited = await op({ kind: 'invite', resourceId: channel, expectedRevision: '1', personId: 'synthetic_person_receiver', permission: 'read', includeHistory: false });
  await wait(() => cached().invitations.some(i => i.id === invited.invitationId), 'hidden invitation');
  await receiver.call('shared_clipboard_operation', { input: { operationId: crypto.randomUUID().replaceAll('-', ''), kind: 'accept', invitationId: invited.invitationId } });
  await op({ kind: 'approve', resourceId: channel, expectedRevision: '2', invitationId: invited.invitationId });
  await wait(() => cached().resources.some(r => r.id === channel && r.keyState === 'ready'), 'hidden approval imports keys');
  assert.equal((await receiver.call('shared_clipboard_status')).connections.length, 0);
  pass('both pickers and Settings hidden converge invitation/approval without connecting or importing');
  const rename = async name => { const catalog = await owner.call('shared_clipboard_catalog'); await op({ kind: 'rename', resourceId: channel, expectedRevision: catalog.resources.find(r => r.id === channel).revision, name }); };
  await rename(`${label} hidden`);
  await wait(() => cached().resources.some(r => r.id === channel && r.name === `${label} hidden`), 'hidden rename');
  pass('hidden receiver cache reconciles remote rename without a renderer catalog fetch');
  await receiver.call('show_picker');
  await receiver.main.getByRole('button', { name: 'Shared clipboards', exact: true }).click();
  const library = receiver.main.getByRole('dialog', { name: 'Shared clipboards', exact: true });
  await library.getByRole('button').filter({ hasText: `${label} hidden` }).click();
  const search = library.getByLabel('Find clipboard', { exact: true }); await search.fill(label);
  await rename(`${label} Library`);
  await library.getByRole('heading', { name: `${label} Library`, exact: true }).waitFor();
  assert.equal(await search.inputValue(), label); assert(await search.evaluate(el => document.activeElement === el));
  pass('Library open with owner hidden preserves search focus and selected ID on rename');
  await library.getByRole('button', { name: 'Close', exact: true }).click();
  await receiver.call('shared_clipboard_connection', { action: 'connect', input: { id: 'general', channelId: channel, kind: 'general', folderId: null, direction: 'receive', moveReception: false } });
  await receiver.main.getByRole('button', { name: 'Connect shared clipboard', exact: true }).click();
  const selector = receiver.main.getByRole('dialog', { name: 'Connect shared clipboard', exact: true });
  const selectorSearch = selector.getByLabel('Find shared clipboard', { exact: true }); await selectorSearch.fill(label);
  await rename(`${label} selector`);
  await selector.getByRole('option').filter({ hasText: `${label} selector` }).waitFor();
  assert.equal(await selector.getByRole('option').filter({ hasText: `${label} selector` }).getAttribute('aria-selected'), 'true');
  assert.equal(await selectorSearch.inputValue(), label); assert(await selectorSearch.evaluate(el => document.activeElement === el));
  pass('selector open with owner hidden preserves search, focus, direction and selected ID');
  await receiver.call('open_settings_window'); await receiver.settings.getByRole('tab', { name: /^Sharing/ }).click();
  const sharing = receiver.settings.locator('.shared-clipboard-settings');
  await sharing.getByLabel('Channel', { exact: true }).click(); await receiver.settings.getByRole('option', { name: `${label} selector`, exact: true }).click();
  const receive = sharing.getByRole('checkbox', { name: 'Receive publications', exact: true }); await receive.uncheck();
  const shortcut = sharing.getByLabel('Send active Copicu clip', { exact: true }); await shortcut.fill('Ctrl+Alt+Y');
  await rename(`${label} Settings`);
  await wait(async () => await sharing.getByLabel('Channel', { exact: true }).inputValue() === `${label} Settings`, 'Settings rename');
  assert.equal(await shortcut.inputValue(), 'Ctrl+Alt+Y'); assert(await shortcut.evaluate(el => document.activeElement === el));
  assert.equal(await receive.isChecked(), false);
  pass('Settings and selector open update remotely while preserving Settings draft and focus');
  await sharing.getByRole('button', { name: 'Manage shared clipboards', exact: true }).click();
  const settingsLibrary = receiver.settings.getByRole('dialog', { name: 'Shared clipboards', exact: true });
  await settingsLibrary.getByRole('button').filter({ hasText: `${label} Settings` }).click();
  if (process.argv[3] === 'native') {
    console.log('READY native review: receiver Library in Settings and selector in main, synthetic drafts retained; send revoke to continue');
    const input = createInterface({ input: process.stdin }); const [line] = await once(input, 'line'); input.close(); assert.equal(line.trim(), 'revoke');
  }
  const catalog = await owner.call('shared_clipboard_catalog');
  await op({ kind: 'revoke', resourceId: channel, expectedRevision: catalog.resources.find(r => r.id === channel).revision, personId: 'synthetic_person_receiver' });
  await settingsLibrary.getByText(/This clipboard was removed or your access was revoked/).waitFor();
  await selector.getByRole('alert').filter({ hasText: 'removed or your access was revoked' }).waitFor();
  assert(await selector.getByRole('button', { name: 'Connect clipboard', exact: true }).isDisabled());
  pass('revocation updates both open dialogs and disables connecting to the removed resource');
  await settingsLibrary.getByRole('button', { name: 'Close', exact: true }).click();
  await sharing.getByText(/This clipboard was removed or your access was revoked/).waitFor();
  assert.equal(await sharing.getByLabel('Channel', { exact: true }).inputValue(), `${label} Settings · Unavailable`);
  assert(await receive.isDisabled()); assert.equal(await receive.isChecked(), false);
  assert(await sharing.getByRole('button', { name: 'Save channel settings', exact: true }).isDisabled());
  assert.equal(await shortcut.inputValue(), 'Ctrl+Alt+Y');
  const status = await receiver.call('shared_clipboard_status');
  assert(status.unavailableChannelIds.includes(channel)); assert.equal(status.connections.length, 1); assert.equal(status.connections[0].channelId, channel);
  assert.equal(status.receipts.length, 0); assert.equal(status.sendPaused, true); assert.equal(status.receivePaused, true);
  assert(status.channels.every(c => !c.updateClipboard && !c.receiveActionEnabled));
  await sharing.getByRole('list', { name: 'Shared connections' }).getByText(/cannot send or receive/).waitFor();
  pass('Settings marks retained connection unavailable, preserves drafts/selection and blocks channel saves');
  if (process.argv[3] === 'native') {
    console.log('READY native withdrawal review: Settings unavailable and main selector disabled; send finish to close without saving');
    const input = createInterface({ input: process.stdin }); const [line] = await once(input, 'line'); input.close(); assert.equal(line.trim(), 'finish');
  }
  await selector.getByRole('button', { name: 'Cancel', exact: true }).click();
  await receiver.call('shared_clipboard_connection', { action: 'disconnect', input: { id: 'general' } });
  await receiver.settingsCall('close_settings_window'); await receiver.call('hide_picker');
  const final = await receiver.call('shared_clipboard_status'); assert.equal(final.connections.length, 0); assert.equal(final.receipts.length, 0);
  pass('explicit synthetic disconnect and cancel leave zero connections/receipts with all native opt-ins off');
  await writeFile(path.join(root, 'sse-surfaces-results.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ passed: results.length, root }));
} finally { for (const browser of browsers) await browser.close(); }
