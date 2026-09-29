import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';

const source = resolve('scripts/dev/release-windows.ps1');
const ps = process.env.PWSH ?? 'pwsh';
const quote = value => `'${value.replaceAll("'", "''")}'`;
function run(body) {
  const result = spawnSync(ps, ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand',
    Buffer.from(`$ErrorActionPreference = 'Stop'\n${body}`, 'utf16le').toString('base64')],
  { encoding: 'utf8', timeout: 30000 });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  return result.stdout;
}
function fixture(fn) {
  const root = mkdtempSync(join(tmpdir(), 'copicu-release-test-'));
  try { return fn(root); } finally { rmSync(root, { recursive: true, force: true }); }
}
function put(root, path, contents) {
  const file = join(root, path);
  mkdirSync(resolve(file, '..'), { recursive: true });
  writeFileSync(file, contents);
  return file;
}
function snapshot(root, prefix = '') {
  return readdirSync(join(root, prefix), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))
    .flatMap(entry => {
      const path = join(prefix, entry.name);
      return entry.isDirectory() ? [[path, 'directory'], ...snapshot(root, path)]
        : [[path, readFileSync(join(root, path)).toString('base64')]];
    });
}
const mocks = `
function git {
  $global:LASTEXITCODE = 0
  switch ($args -join ' ') {
    'branch --show-current' { 'main' }
    'tag --list v*' { 'v0.4.9' }
    'rev-parse HEAD' { '${'a'.repeat(40)}' }
    default { throw "Forbidden git operation: $args" }
  }
}
function gh {
  if (($args -join ' ') -ne 'release list --limit 100 --json tagName') { throw "Forbidden gh operation: $args" }
  $global:LASTEXITCODE = 0
  '[]'
}
function git.exe { throw 'git.exe must not run' }
function gh.exe { throw 'gh.exe must not run' }
function npm.cmd { throw 'npm must not run' }
function cargo.exe { throw 'cargo must not run' }
function node { throw 'node must not run' }
function Get-Process { throw 'process inspection must not run' }
function Stop-Process { throw 'process stopping must not run' }
function Start-Sleep { throw 'sleep must not run' }
function New-Item { throw 'New-Item must not run' }
function Set-Content { throw 'Set-Content must not run' }
function Read-Host { throw 'interactive prompt must not run' }
function Get-Content {
  param([string] $LiteralPath, [switch] $Raw, [string] $Encoding)
  if ($LiteralPath -match 'secrets|updater\\.(key|password)') { throw 'Signing key read forbidden' }
  Microsoft.PowerShell.Management\\Get-Content -LiteralPath $LiteralPath -Raw -Encoding utf8
}
`;

for (const custom of [false, true]) {
  test(`DryRun is read-only with ${custom ? 'custom NotesFile and existing assets' : 'inline Notes and absent assets'}`, () => fixture(root => {
    // Execute ONLY -DryRun, from an isolated fixture; never invoke the real release path.
    const script = put(root, 'scripts/dev/release-windows.ps1', readFileSync(source));
    put(root, 'package.json', '{"version":"0.4.9"}');
    put(root, 'src-tauri/tauri.conf.json', '{"version":"0.4.9"}');
    put(root, 'src-tauri/Cargo.toml', 'version = "0.4.9"');
    put(root, 'README.md', 'Current release:\n\n- [v0.4.9](https://example.test)\n- Asset: `old.exe`\n- Windows x64 NSIS installer\n- SHA256: `OLD`\n\nOld summary.\n\nCopicu is used daily\n');
    const notes = put(root, 'input-notes.md', '# Rich notes\n\n- Español\n- Details\nSHA256: <filled after build>');
    put(root, '.codex-run/secrets/copicu-updater.key', 'TEST ONLY NOT A KEY');
    put(root, '.codex-run/secrets/copicu-updater.password', 'TEST ONLY');
    if (custom) {
      put(root, 'src-tauri/target/release/bundle/nsis/Copicu_0.5.0_x64-setup.exe', 'fixture installer');
      put(root, 'src-tauri/target/release/bundle/nsis/Copicu_0.5.0_x64-setup.exe.sig', 'fixture signature');
    }
    const before = snapshot(root);
    const output = run(`${mocks}\n& ${quote(script)} -DryRun -Tag v0.5.0 -Summary 'Short summary.' ${custom ? `-NotesFile ${quote(notes)}` : "-Notes \"Legacy title.`n`nDetails\""}`);
    assert.match(output, /done/);
    assert.match(output, /--target a{40}/);
    assert.match(output, /assembled release notes would be written/);
    assert.deepEqual(snapshot(root), before, 'DryRun must not change or create any fixture file/directory');
  }));
}

// Load only explicitly selected top-level functions through PowerShell's parser.
// No top-level release statements are evaluated and no release/build commands run.
function helpers(names) {
  return `
$tokens = $null; $errors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile(${quote(source)}, [ref] $tokens, [ref] $errors)
if ($errors.Count) { throw ($errors | Out-String) }
$names = @(${names.map(quote).join(',')})
foreach ($name in $names) {
  $functions = @($ast.EndBlock.Statements | Where-Object { $_ -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $_.Name -eq $name })
  if ($functions.Count -ne 1) { throw "Missing or duplicate helper: $name" }
  . ([scriptblock]::Create($functions[0].Extent.Text))
}
function Write-Step($Message) {}
`;
}

test('rich NotesFile preserves input, assembles actual hash/target, and writes UTF8 without BOM', () => fixture(root => {
  const inputBody = '# v0.5.0\n\n## Cambios\n- Selección persistente ✓\n- Details\n\nSHA256: <filled after build>';
  const input = put(root, 'input.md', inputBody);
  const output = join(root, 'generated', 'upload.md');
  const installer = put(root, 'fixture.exe', 'installer bytes');
  const hash = createHash('sha256').update('installer bytes').digest('hex').toUpperCase();
  const target = 'b'.repeat(40);
  run(`${helpers(['Get-Sha256', 'New-ReleaseNotesBody', 'Write-ReleaseNotesFile'])}
$DryRun = $false
$hash = Get-Sha256 ${quote(installer)}
$body = New-ReleaseNotesBody -Notes 'ignored inline body' -NotesFile ${quote(input)} -Sha256 $hash -TargetCommit '${target}'
Write-ReleaseNotesFile -OutputPath ${quote(output)} -Body $body
`);
  assert.equal(readFileSync(input, 'utf8'), inputBody);
  const bytes = readFileSync(output);
  assert.notDeepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
  assert.equal(bytes.toString('utf8'), inputBody.replace('<filled after build>', hash) + `\n\nInstaller SHA256: \`${hash}\`\nTarget commit: \`${target}\``);
}));

test('explicit Summary stays separate; legacy Notes first-line fallback and inline rich body remain supported', () => {
  const output = run(`${helpers(['Resolve-ReleaseSummary', 'New-ReleaseNotesBody'])}
$explicit = Resolve-ReleaseSummary -Summary '  Short summary.  ' -Notes "# Heading\n\nDetails" -ReleaseTag v0.5.0 -Sha256 HASH
$legacy = Resolve-ReleaseSummary -Notes "Legacy <filled after build>\n\nDetails" -ReleaseTag v0.5.0 -Sha256 HASH
$default = Resolve-ReleaseSummary -ReleaseTag v0.5.0 -Sha256 HASH
$inline = New-ReleaseNotesBody -Notes "Title\n\nDetails" -Sha256 HASH -TargetCommit TARGET
$rejected = $false
try { Resolve-ReleaseSummary -Summary "Bad\nsummary" } catch { $rejected = $true }
@{explicit=$explicit; legacy=$legacy; default=$default; inline=$inline; rejected=$rejected} | ConvertTo-Json -Compress
`);
  const result = JSON.parse(output.trim());
  assert.equal(result.explicit, 'Short summary.');
  assert.equal(result.legacy, 'Legacy HASH');
  assert.match(result.default, /v0\.5\.0/);
  assert.equal(result.inline, 'Title\n\nDetails\n\nInstaller SHA256: `HASH`\nTarget commit: `TARGET`');
  assert.equal(result.rejected, true);
});

test('process stop boundary allows only positively identified repo build executables (all process calls mocked)', () => fixture(root => {
  const output = run(`${helpers(['Stop-CopicuProcessesForRelease'])}
$repoRoot = ${quote(root)}
$DryRun = $false
$global:stopped = @()
function Get-Process {
  @(
    [pscustomobject]@{ Id=1; Path=(Join-Path $repoRoot 'src-tauri/target/release/copicu.exe') },
    [pscustomobject]@{ Id=2; Path=(Join-Path $repoRoot 'target/debug/copicu.exe') },
    [pscustomobject]@{ Id=3; Path=(Join-Path $repoRoot 'installed/Copicu/copicu.exe') },
    [pscustomobject]@{ Id=4; Path=$null },
    [pscustomobject]@{ Id=5; Path=(Join-Path $repoRoot 'src-tauri/target-other/copicu.exe') },
    [pscustomobject]@{ Id=6; Path=(Join-Path $repoRoot 'src-tauri/target/../installed/copicu.exe') },
    [pscustomobject]@{ Id=7; Path=(Join-Path $repoRoot 'target/debug/other.exe') }
  )
}
function Stop-Process { param($Id, [switch] $Force, $ErrorAction); $global:stopped += $Id }
function Start-Sleep { param($Seconds) }
Stop-CopicuProcessesForRelease
ConvertTo-Json -InputObject $global:stopped -Compress
`);
  assert.deepEqual(JSON.parse(output.trim()), [1, 2]);
}));

test('real SkipBuild requires a nonempty signature; only DryRun can use a placeholder', () => fixture(root => {
  const signature = put(root, 'installer.exe.sig', 'signed fixture');
  const empty = put(root, 'empty.sig', '');
  const missing = join(root, 'missing.sig');
  const output = run(`${helpers(['Get-UpdaterSignature'])}
$DryRun = $false
$SkipBuild = $true
$real = Get-UpdaterSignature ${quote(signature)}
$missingRejected = $false; $emptyRejected = $false
try { Get-UpdaterSignature ${quote(missing)} } catch { $missingRejected = $true }
try { Get-UpdaterSignature ${quote(empty)} } catch { $emptyRejected = $true }
$DryRun = $true
$planning = Get-UpdaterSignature ${quote(missing)}
@{real=$real; missingRejected=$missingRejected; emptyRejected=$emptyRejected; planning=$planning} | ConvertTo-Json -Compress
`);
  const result = JSON.parse(output.trim());
  assert.equal(result.real, 'signed fixture');
  assert.equal(result.missingRejected, true);
  assert.equal(result.emptyRejected, true);
  assert.equal(result.planning, 'DRYRUN-SIGNATURE');
  assert.match(readFileSync(source, 'utf8'), /\$signature = Get-UpdaterSignature -SignaturePath \$signaturePath/);
}));

test('release uses the same head and summary variables for uploads, updater and README; wrapper forwards new params', () => {
  const script = readFileSync(source, 'utf8');
  assert.match(script, /\$head = Get-GitOutput @\("rev-parse", "HEAD"\)/);
  assert.match(script, /New-ReleaseNotesBody[^\r\n]+-TargetCommit \$head/);
  assert.match(script, /\$releaseArgs = @\([^\r\n]+"--target", \$head[^\r\n]+"--notes-file", \$uploadNotesFile/);
  assert.match(script, /New-UpdaterManifest[^\r\n]+-Summary \$releaseSummary/);
  assert.match(script, /Update-ReadmeReleaseBlock[^\r\n]+-Summary \$releaseSummary/);
  const wrapper = readFileSync(resolve('scripts/dev/release-install.ps1'), 'utf8');
  for (const name of ['NotesFile', 'Summary']) {
    assert.ok(wrapper.includes(`[string] $${name}`));
    assert.ok(wrapper.includes(`$releaseParams.${name} = $${name}`));
  }
});
