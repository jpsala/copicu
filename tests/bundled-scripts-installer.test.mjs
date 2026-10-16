import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

// Optional local NSIS integration test. Runs ONLY a fixture that copies scripts
// into a temporary directory, not the Copicu installer. No registry or processes
// belonging to Copicu, user scripts, clipboard, history or network are touched.
const compiler = process.env.COPICU_TEST_MAKENSIS ?? path.join(
  process.env.LOCALAPPDATA ?? '', 'tauri', 'NSIS', 'makensis.exe',
);
const available = process.platform === 'win32' && fs.existsSync(compiler);
const examples = path.resolve('scripts/examples');
const inactiveIds = new Set(['004', '010', '011', '028', '029', '030', '037']);
const scriptFiles = fs.readdirSync(examples).filter((file) => /^\d{3}-.*\.ts$/.test(file)).sort();

test('bundle resources include every shipped script and its types', () => {
  const config = JSON.parse(fs.readFileSync('src-tauri/tauri.conf.json', 'utf8'));
  const packaged = new Set();
  function collect(source, destination) {
    if (fs.statSync(source).isDirectory()) {
      for (const name of fs.readdirSync(source)) collect(path.join(source, name), `${destination}/${name}`);
    } else {
      packaged.add(destination.replaceAll('\\\\', '/').replace(/\/$/, ''));
    }
  }
  for (const [source, destination] of Object.entries(config.bundle.resources)) {
    // This test scopes itself to bundled scripts, not build/runtime resources.
    if (destination.startsWith('bundled-scripts')) collect(path.resolve('src-tauri', source), destination);
  }
  for (const file of [...scriptFiles, 'copicu-action.d.ts']) {
    assert.ok(packaged.has(`bundled-scripts/${file}`), `missing packaged script: ${file}`);
  }
});

function run(executable, args) {
  const result = spawnSync(executable, args, { encoding: 'utf8', timeout: 30000 });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
}

function nsisPath(value) {
  return value.replaceAll('$', '$$').replaceAll('"', '$\\"');
}

test('bundled scripts: fresh install, defaults and upgrades in temporary folders', {
  skip: !available && 'requires Windows and an existing NSIS compiler (no installation performed)',
}, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'copicu-bundled-scripts-'));
  const scripts = path.join(root, 'Scripts');
  const disabled = path.join(scripts, 'disabled');
  const exe = path.join(root, 'fixture.exe');
  try {
    const fixture = path.join(root, 'fixture.nsi');
    fs.writeFileSync(fixture, [
      'Unicode true',
      'Name "Copicu synthetic script copy test"',
      'RequestExecutionLevel user',
      'SilentInstall silent',
      `OutFile "${nsisPath(exe)}"`,
      `!include "${nsisPath(path.resolve('src-tauri/bundled-scripts.nsh'))}"`,
      'Section',
      `!insertmacro CopicuInstallBundledScripts "${nsisPath(scripts)}" "${nsisPath(examples)}"`,
      'SectionEnd',
    ].join('\n'));
    run(compiler, ['/V2', fixture]);
    run(exe, ['/S']);

    // Every real example must actually be installed, not just bundled.
    const active = fs.readdirSync(scripts).filter((file) => /^\d{3}-/.test(file)).sort();
    const inactive = fs.readdirSync(disabled).filter((file) => /^\d{3}-/.test(file)).sort();
    assert.deepEqual([...active, ...inactive].sort(), scriptFiles);
    assert.deepEqual(inactive, scriptFiles.filter((file) => inactiveIds.has(file.slice(0, 3))));
    assert.deepEqual(active, scriptFiles.filter((file) => !inactiveIds.has(file.slice(0, 3))));
    for (const file of scriptFiles) {
      const folder = inactiveIds.has(file.slice(0, 3)) ? disabled : scripts;
      assert.equal(fs.readFileSync(path.join(folder, file), 'utf8'), fs.readFileSync(path.join(examples, file), 'utf8'));
    }
    for (const folder of [scripts, disabled]) {
      assert.equal(fs.readFileSync(path.join(folder, 'copicu-action.d.ts'), 'utf8'), fs.readFileSync(path.join(examples, 'copicu-action.d.ts'), 'utf8'));
    }

    // User state wins over defaults on upgrade in both directions.
    const enabledByUser = inactive[0];
    const disabledByUser = active[0];
    fs.renameSync(path.join(disabled, enabledByUser), path.join(scripts, enabledByUser));
    fs.renameSync(path.join(scripts, disabledByUser), path.join(disabled, disabledByUser));
    fs.writeFileSync(path.join(scripts, enabledByUser), 'synthetic edited active script');
    fs.writeFileSync(path.join(disabled, disabledByUser), 'synthetic edited inactive script');
    fs.writeFileSync(path.join(scripts, 'copicu-action.d.ts'), 'synthetic edited types');
    fs.writeFileSync(path.join(disabled, 'copicu-action.d.ts'), 'synthetic edited inactive types');
    fs.writeFileSync(path.join(scripts, 'my-script.ts'), 'synthetic personal script');
    run(exe, ['/S']);
    assert.equal(fs.existsSync(path.join(disabled, enabledByUser)), false);
    assert.equal(fs.existsSync(path.join(scripts, disabledByUser)), false);
    assert.equal(fs.readFileSync(path.join(scripts, enabledByUser), 'utf8'), 'synthetic edited active script');
    assert.equal(fs.readFileSync(path.join(disabled, disabledByUser), 'utf8'), 'synthetic edited inactive script');
    assert.equal(fs.readFileSync(path.join(scripts, 'my-script.ts'), 'utf8'), 'synthetic personal script');
    assert.equal(fs.readFileSync(path.join(scripts, 'copicu-action.d.ts'), 'utf8'), 'synthetic edited types');
    assert.equal(fs.readFileSync(path.join(disabled, 'copicu-action.d.ts'), 'utf8'), 'synthetic edited inactive types');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
