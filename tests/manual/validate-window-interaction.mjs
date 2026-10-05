// Windows-only, built-host smoke. Running this file opens its two owned
// processes and visible synthetic UI. --prepare-only creates only a TEMP fixture.
// No installed profile, real clipboard payload, or foreign process is touched.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { openSync, closeSync, createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const value = name => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; };
if (args.includes('--help')) {
  console.log('node tests/manual/validate-window-interaction.mjs --exe C:/path/copicu.exe [--prepare-only] [--paste]\n--paste requires an initially empty clipboard, reads no payload, and clears synthetic output only if the clipboard sequence is unchanged.');
  process.exit(0);
}
assert.equal(process.platform, 'win32', 'This harness needs a Windows interactive desktop.');
assert(value('--exe'), 'Pass the newly built copicu.exe with --exe.');
const repo = path.resolve(import.meta.dirname, '../..');
const exe = path.resolve(value('--exe'));
assert.equal(path.basename(exe).toLowerCase(), 'copicu.exe');
await access(exe);
const root = await mkdtemp(path.join(os.tmpdir(), 'copicu-window-interaction-'));
const profile = path.join(root, 'profile');
await mkdir(profile);
await writeFile(path.join(root, 'synthetic.marker'), 'Copicu synthetic window interaction fixture v1\n');
const token = 'COPICU_SYNTH_WINDOW_' + Date.now();
// Reuse the actual checked-in SQL migrations, without reading a live database.
const schemaSource = await readFile(path.join(repo, 'src-tauri/src/storage/schema.rs'), 'utf8');
const migrations = [...schemaSource.matchAll(/M::up\(\s*r(#+)"([\s\S]*?)"\1\s*,?\s*\)/g)].map(m => m[2]);
assert.equal(migrations.length, [...schemaSource.matchAll(/M::up\(/g)].length, 'Unrecognized SQL migration; refuse partial fixture.');
assert(migrations.length > 0);
const settings = {
  schemaVersion: 1,
  general: { captureEnabled: false, launchOnStartup: false, globalShortcut: 'Ctrl+Shift+F10', inboxShortcut: 'Ctrl+Alt+F10', pasteNextShortcut: 'Ctrl+Alt+Shift+F10' },
  picker: { hideOnFocusLost: true, enterAction: 'copy', pinToggleShortcut: '', externalEditorShortcut: '', settingsShortcut: 'Ctrl+,', previewShortcut: 'Alt+Enter', searchTriggerMode: 'realtime' },
  autoUpdate: { enabled: false },
  history: { retentionCount: 0 },
  appearance: { theme: 'system', themeId: 'default' },
  ai: { enabled: false, apiKey: '', endpoint: 'http://127.0.0.1:1', model: 'synthetic-disabled' },
  scripts: { folderPath: path.join(profile, 'scripts') },
};
const db = new DatabaseSync(path.join(profile, 'copicu.sqlite3'));
try {
  for (const sql of migrations) db.exec(sql);
  db.exec(`PRAGMA user_version=${migrations.length}`);
  db.prepare('INSERT INTO app_settings(key,value_json,updated_at_unix_ms) VALUES(?,?,0)').run('app', JSON.stringify(settings));
} finally { db.close(); }
console.log('Synthetic fixture: ' + root);
if (args.includes('--prepare-only')) {
  console.log('Prepared complete schema and disabled capture/startup/updater/AI; no UI or app launched.');
  process.exit(0);
}
const env = { ...process.env };
for (const key of Object.keys(env)) if (/^COPICU_/i.test(key) || /^WEBVIEW2_/i.test(key)) delete env[key];
const runtimePath = (env.PATH ?? env.Path ?? '').split(path.delimiter).filter(p => !/miniconda3/i.test(p));
for (const key of Object.keys(env)) if (key.toLowerCase() === 'path') delete env[key];
env.PATH = [path.dirname(exe), ...runtimePath.filter(p => /mingw64[\\/]bin$/i.test(p)), ...runtimePath].join(path.delimiter);
// No inherited COPICU_SHARED* endpoints/identity/auth settings are passed.
assert(!Object.keys(env).some(key => /^COPICU_SHARED/i.test(key)));
const port = await new Promise((resolve, reject) => {
  const server = createServer(); server.once('error', reject);
  server.listen(0, '127.0.0.1', () => { const n = server.address().port; server.close(error => error ? reject(error) : resolve(n)); });
});
const results = [], snapshots = [];
let host, helper, browser, failure, hostStartupError, requestId = 0;
const pending = new Map();
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const deadline = (promise, label, timeout = 30000) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(Error('Deadline: ' + label)), timeout);
  promise.then(resolve, reject).finally(() => clearTimeout(timer));
});
const wait = async (fn, label, timeout = 20000) => {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { const found = await fn(); if (found) return found; await delay(100); }
  throw Error('Deadline: ' + label);
};
const pass = name => { results.push({ name, outcome: 'pass' }); console.log('PASS ' + name); };
const native = (command, extra = {}) => new Promise((resolve, reject) => {
  const id = ++requestId;
  const timer = setTimeout(() => { pending.delete(id); reject(Error('Native helper deadline: ' + command)); }, 10000);
  pending.set(id, { resolve, reject, timer }); helper.stdin.write(JSON.stringify({ id, command, ...extra }) + '\n');
});
const inspect = () => native('inspect', { appPid: host.pid });
const surface = (snapshot, title) => snapshot.Windows.find(w => w.Pid === host.pid && w.Title === title);
const mainWindow = s => surface(s, 'Copicu');
const settingsWindow = s => surface(s, 'Copicu Settings');
const previewWindow = s => surface(s, 'Copicu Preview');
const metadataWindow = s => surface(s, 'Copicu Metadata');
const assistantWindow = s => surface(s, 'Copicu Assistant');
const outputWindow = s => surface(s, 'Copicu Output');
const record = async phase => { const s = await inspect(); snapshots.push({ phase, ...s }); return s; };
const nativeWait = (predicate, label) => wait(async () => { const s = await inspect(); return predicate(s) ? s : false; }, label);
const findPage = label => wait(async () => {
  for (const p of browser.contexts()[0]?.pages() ?? []) {
    if (await p.evaluate(() => window.__TAURI_INTERNALS__?.metadata?.currentWindow?.label).catch(() => null) === label) return p;
  }
  return false;
}, 'WebView page ' + label);
const invoke = (p, command, input = {}) => deadline(p.evaluate(({ command, input }) => window.__TAURI_INTERNALS__.invoke(command, input), { command, input }), command);
const above = (a, b) => a && b && a.ZIndex < b.ZIndex;
const cleanupProcess = async child => {
  if (!child || child.exitCode !== null) return;
  child.kill(); // Only this exact ChildProcess PID, never a process-name/tree kill.
  await Promise.race([new Promise(resolve => child.once('exit', resolve)), delay(5000)]);
};
try {
  console.log('Opening an owned synthetic TextBox and isolated Copicu; global input will use Ctrl+Shift+F10.');
  const ready = new Promise((resolve, reject) => {
    helper = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-STA', '-File', path.join(import.meta.dirname, 'window-interaction-native.ps1')], { cwd: repo, windowsHide: true, env, stdio: ['pipe', 'pipe', 'pipe'] });
    let diagnostic = '';
    helper.stderr.on('data', chunk => { diagnostic += chunk.toString(); });
    const lines = createInterface({ input: helper.stdout });
    lines.on('line', line => {
      try {
        const reply = JSON.parse(line);
        if (reply.ready) { resolve(reply); return; }
        const p = pending.get(reply.id); if (!p) return;
        pending.delete(reply.id); clearTimeout(p.timer);
        if (reply.ok) p.resolve(reply.value); else p.reject(Error(reply.error));
      } catch { reject(Error('Unexpected native helper protocol output.')); }
    });
    helper.once('error', reject);
    helper.once('exit', code => { if (code !== 0) reject(Error('Native helper exited: ' + code + ' ' + diagnostic)); });
    setTimeout(() => reject(Error('Native helper startup deadline.')), 20000).unref();
  });
  const external = await ready;
  const log = openSync(path.join(root, 'owned-host-startup.log'), 'a');
  host = spawn(exe, [], { cwd: repo, windowsHide: true, stdio: ['ignore', log, log], env: { ...env, COPICU_APP_DATA_DIR: profile, COPICU_SCRIPTS_DIR: path.join(profile, 'scripts'), WEBVIEW2_USER_DATA_FOLDER: path.join(profile, 'webview'), WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port} --remote-debugging-address=127.0.0.1` } });
  host.once('error', error => { hostStartupError = error; });
  closeSync(log);
  await wait(async () => {
    if (hostStartupError) throw hostStartupError;
    assert.equal(host.exitCode, null, 'Owned Copicu exited before smoke.');
    try { return (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).some(t => t.type === 'page'); } catch { return false; }
  }, 'owned CDP target', 60000);
  await nativeWait(s => mainWindow(s), 'owned main HWND');
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  await delay(1200); // Let startup WebView focus and initial-hide callbacks settle.
  await native('focusExternal');
  await nativeWait(s => s.Foreground === external.hwnd && s.ForegroundPid === external.pid, 'synthetic external foreground');
  await native('hotkey');
  const c0 = await nativeWait(s => mainWindow(s)?.Visible && s.Foreground === mainWindow(s).Hwnd && s.ForegroundPid === host.pid, 'hotkey picker native foreground');
  await delay(600); // Allow the first WebView mount to focus search without targeting it.
  await native('typeGlobal', { appPid: host.pid, expectedHwnd: mainWindow(c0).Hwnd, text: token });
  // No CDP evaluate, locator focus, or Tauri invoke occurred before global input.
  const main = await findPage('main');
  const search = main.locator('[aria-label="Search clipboard history"]');
  const query = () => search.evaluate(el => 'value' in el ? el.value : el.textContent).then(text => text?.trim() ?? '');
  await wait(async () => await query().catch(() => '') === token, 'C0 visible synthetic query');
  assert(await search.isVisible());
  await main.screenshot({ path: path.join(root, 'c0-synthetic-query.png') });
  await record('C0-global-input');
  pass('C0: external HWND -> native hotkey -> global token reaches visible search');
  const actualSettings = await invoke(main, 'get_settings');
  assert.equal(actualSettings.general.captureEnabled, false);
  assert.equal(actualSettings.general.launchOnStartup, false);
  assert.equal(actualSettings.autoUpdate.enabled, false);
  assert.equal(actualSettings.ai.enabled, false);
  await invoke(main, 'set_main_window_pin_state', { pinned: false });
  await invoke(main, 'open_settings_window');
  const settingsPage = await findPage('settings');
  await nativeWait(s => mainWindow(s)?.Visible && settingsWindow(s)?.Visible && s.Foreground === settingsWindow(s).Hwnd, 'Settings opens over transient picker');
  await delay(450); // Exceed the native hide-on-blur timer while Settings owns focus.
  assert(mainWindow(await inspect()).Visible, 'Internal focus must keep the transient picker visible.');
  assert.equal(await query(), token);
  await record('transient-settings-open');
  await invoke(settingsPage, 'close_settings_window');
  await nativeWait(s => mainWindow(s)?.Visible && !settingsWindow(s)?.Visible && s.Foreground === mainWindow(s).Hwnd, 'Settings close returns opener');
  assert.equal(await query(), token);
  pass('transient picker survives Settings open/close with native focus and query intact');
  await invoke(main, 'set_main_window_pin_state', { pinned: true });
  await invoke(main, 'open_settings_window');
  await nativeWait(s => mainWindow(s)?.Topmost && settingsWindow(s)?.Visible && settingsWindow(s)?.Topmost && above(settingsWindow(s), mainWindow(s)), 'Settings above pinned picker');
  const settingsNative = settingsWindow(await inspect());
  const movedBounds = [...settingsNative.Bounds]; movedBounds[0] += 23; movedBounds[1] += 17;
  await native('moveOwned', { hwnd: settingsNative.Hwnd, bounds: movedBounds });
  await delay(400);
  const bounds = settingsWindow(await record('pinned-settings')).Bounds;
  assert.deepEqual(bounds, movedBounds, 'Owned Settings moved before cached reopen.');
  await invoke(main, 'open_settings_window');
  await delay(400);
  assert.deepEqual(settingsWindow(await inspect()).Bounds, bounds);
  pass('Settings native topmost/z-order above pinned picker; cached open preserves bounds');
  await invoke(main, 'set_main_window_pin_state', { pinned: false });
  await nativeWait(s => !mainWindow(s)?.Topmost && !settingsWindow(s)?.Topmost, 'unpin removes inherited Settings topmost');
  await native('focusExternal');
  await nativeWait(s => !mainWindow(s)?.Visible && settingsWindow(s)?.Visible && !settingsWindow(s)?.Topmost && s.Foreground === external.hwnd, 'blur from Settings hides transient picker only');
  await record('settings-to-external-blur');
  pass('Settings -> external blur hides transient picker; Settings stays independent and demoted');
  await invoke(settingsPage, 'close_settings_window');
  await delay(400);
  assert.equal(mainWindow(await inspect()).Visible, false);
  assert.equal((await inspect()).Foreground, external.hwnd, 'Closing background Settings must keep external foreground.');
  await invoke(main, 'open_settings_window');
  await nativeWait(s => !mainWindow(s)?.Visible && settingsWindow(s)?.Visible && s.Foreground === settingsWindow(s).Hwnd, 'open Settings from hidden main');
  const hiddenOpenBounds = settingsWindow(await inspect()).Bounds;
  await invoke(main, 'open_settings_window');
  await delay(400);
  assert.deepEqual(settingsWindow(await inspect()).Bounds, hiddenOpenBounds);
  assert.equal(mainWindow(await inspect()).Visible, false);
  pass('Settings opened/reopened from hidden main preserves bounds without showing picker');
  await invoke(main, 'set_main_window_pin_state', { pinned: true });
  assert.equal(settingsWindow(await inspect()).Topmost, false, 'Hidden pinned main must not elevate Settings.');
  await native('focusExternal');
  await nativeWait(s => s.Foreground === external.hwnd, 'external foreground before second hotkey');
  await native('hotkey');
  await nativeWait(s => mainWindow(s)?.Visible && mainWindow(s)?.Topmost && settingsWindow(s)?.Visible && settingsWindow(s)?.Topmost && above(mainWindow(s), settingsWindow(s)) && s.Foreground === mainWindow(s).Hwnd, 'hotkey brings picker above visible Settings');
  await record('hotkey-with-settings-visible');
  pass('native hotkey brings the focused pinned picker above visible Settings');
  await native('minimizeOwned', { hwnd: mainWindow(await inspect()).Hwnd });
  await nativeWait(s => mainWindow(s)?.Minimized && settingsWindow(s)?.Visible && !settingsWindow(s)?.Topmost, 'minimized picker demotes independent Settings');
  await native('focusExternal');
  await nativeWait(s => s.Foreground === external.hwnd, 'external foreground before minimized picker hotkey');
  await native('hotkey');
  await nativeWait(s => !mainWindow(s)?.Minimized && mainWindow(s)?.Topmost && settingsWindow(s)?.Topmost && s.Foreground === mainWindow(s)?.Hwnd, 'hotkey restores minimized picker');
  await record('minimized-picker-restored');
  pass('minimize demotes independent Settings; native hotkey restores picker and inherited layer');
  await invoke(settingsPage, 'close_settings_window');
  await invoke(main, 'show_picker');
  await nativeWait(s => s.Foreground === mainWindow(s)?.Hwnd, 'picker foreground before preview');
  const item = await invoke(main, 'create_history_item', { request: { text: token, title: 'Synthetic native window fixture', tags: [] } });
  await invoke(main, 'open_metadata_window', { request: { itemIds: [item.id], focusTarget: 'overview' } });
  const metadataPage = await findPage('metadata');
  await nativeWait(s => metadataWindow(s)?.Visible && metadataWindow(s)?.Topmost && above(metadataWindow(s), mainWindow(s)) && s.Foreground === metadataWindow(s).Hwnd, 'metadata above pinned picker');
  await invoke(metadataPage, 'close_metadata_window');
  await nativeWait(s => !metadataWindow(s)?.Visible && s.Foreground === mainWindow(s)?.Hwnd, 'metadata returns picker focus');
  await invoke(main, 'open_assistant_window');
  await findPage('assistant');
  await nativeWait(s => assistantWindow(s)?.Visible && assistantWindow(s)?.Topmost && above(assistantWindow(s), mainWindow(s)) && s.Foreground === assistantWindow(s).Hwnd, 'assistant above pinned picker');
  await native('closeOwned', { hwnd: assistantWindow(await inspect()).Hwnd });
  await nativeWait(s => !assistantWindow(s)?.Visible && s.Foreground === mainWindow(s)?.Hwnd, 'native assistant close returns picker focus');
  await record('document-windows-above-pinned');
  pass('metadata and Assistant open above pinned picker; close returns native focus');
  await invoke(main, 'open_item_preview', { request: { itemId: item.id } });
  await nativeWait(s => previewWindow(s)?.Visible && previewWindow(s)?.Topmost && above(previewWindow(s), mainWindow(s)) && s.Foreground === mainWindow(s)?.Hwnd, 'preview does not steal focus above pinned main');
  await record('preview-above-pinned');
  pass('preview native HWND stays above pinned picker without stealing foreground');
  await invoke(main, 'set_main_window_pin_state', { pinned: false });
  await nativeWait(s => !mainWindow(s)?.Topmost && previewWindow(s)?.Visible && !previewWindow(s)?.Topmost, 'unpin demotes preview while keeping it visible');
  await invoke(main, 'set_main_window_pin_state', { pinned: true });
  await invoke(main, 'hide_picker');
  await nativeWait(s => !mainWindow(s)?.Visible && !previewWindow(s)?.Topmost && !settingsWindow(s)?.Topmost, 'hide main removes inherited topmost');
  await record('hidden-picker-demotes-auxiliary');
  pass('unpin and picker hide remove inherited native topmost from auxiliary windows');
  await invoke(main, 'show_picker');
  await nativeWait(s => mainWindow(s)?.Visible && mainWindow(s)?.Topmost && s.Foreground === mainWindow(s)?.Hwnd, 'pinned picker before background output');
  await native('focusExternal');
  await nativeWait(s => s.Foreground === external.hwnd, 'external foreground before asynchronous output');
  const outputPayload = { title: 'Synthetic output', markdown: token, summary: null, source: null, suggestedFileName: null };
  await invoke(main, 'open_markdown_output', { payload: outputPayload });
  await findPage('ai-output');
  await nativeWait(s => outputWindow(s)?.Visible && outputWindow(s)?.Topmost && above(outputWindow(s), mainWindow(s)) && s.Foreground === external.hwnd, 'background output preserves external foreground above pinned picker');
  await invoke(main, 'hide_picker');
  await nativeWait(s => !mainWindow(s)?.Visible && outputWindow(s)?.Visible && !outputWindow(s)?.Topmost && s.Foreground === external.hwnd, 'picker hide demotes independent Output');
  await native('minimizeOwned', { hwnd: outputWindow(await inspect()).Hwnd });
  await nativeWait(s => outputWindow(s)?.Minimized, 'minimized output');
  await invoke(main, 'open_markdown_output', { payload: { ...outputPayload, markdown: token + '_SECOND' } });
  await delay(450);
  assert(outputWindow(await inspect()).Minimized, 'Background result must not restore a minimized Output.');
  assert.equal((await inspect()).Foreground, external.hwnd);
  await native('closeOwned', { hwnd: outputWindow(await inspect()).Hwnd });
  await nativeWait(s => !outputWindow(s)?.Visible && s.Foreground === external.hwnd, 'background output close preserves external foreground');
  await record('background-output');
  pass('background Output preserves external focus and respects minimized state');
  if (args.includes('--paste')) {
    await native('armPaste');
    await native('clearExternal');
    await native('focusExternal');
    await nativeWait(s => s.Foreground === external.hwnd, 'paste target native foreground');
    await native('hotkey');
    await nativeWait(s => s.Foreground === mainWindow(s)?.Hwnd, 'paste picker native foreground');
    await invoke(main, 'activate_item', { request: { itemId: item.id, copy: true, markUsed: true, hidePicker: true, focusPrevious: true, paste: true, pasteShortcut: 'default' } });
    await native('markPaste');
    await wait(async () => (await native('externalText')).text === token, 'exact synthetic paste TextBox');
    assert.equal((await inspect()).Foreground, external.hwnd);
    await record('paste-external-target');
    pass('paste restores the previous synthetic HWND and sends exact token to TextBox');
  } else {
    results.push({ name: 'paste-to-previous-window', outcome: 'skipped', reason: 'Use --paste with an initially empty clipboard; default run never changes clipboard.' });
  }
} catch (error) { failure = error; results.push({ name: 'smoke failure', outcome: 'fail', error: error.message }); }
finally {
  if (host && helper?.exitCode === null) await record('final-before-cleanup').catch(() => {});
  if (browser) await deadline(browser.close(), 'browser cleanup', 5000).catch(() => {});
  // Stop the app before emptying an armed, originally empty clipboard.
  await cleanupProcess(host);
  if (helper?.exitCode === null) await native('stop').catch(error => { failure ??= error; });
  await cleanupProcess(helper);
  for (const p of pending.values()) { clearTimeout(p.timer); p.reject(Error('Native helper closed.')); }
  const hash = createHash('sha256'); for await (const chunk of createReadStream(exe)) hash.update(chunk);
  await writeFile(path.join(root, 'results.json'), JSON.stringify({ executable: exe, executableSHA256: hash.digest('hex'), checkedAt: new Date().toISOString(), ownedHostPid: host?.pid, ownedFixturePid: helper?.pid, cdpPort: port, profile, cases: results, nativeSnapshots: snapshots, limitations: ['One synthetic WinForms target; no universal Windows foreground or UIPI guarantee.', 'No titles or payloads from foreign windows/clipboard were read.'] }, null, 2));
}
console.log('Native evidence: ' + path.join(root, 'results.json'));
if (failure) throw failure;
console.log('Passed native cases: ' + results.filter(r => r.outcome === 'pass').length);
