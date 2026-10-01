[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('Check', 'Build', 'Pure', 'Clipboard', 'Custody')]
  [string] $Mode,
  [string] $RunId,
  [string] $SessionLabel,
  [switch] $AllowClipboardMutation,
  [switch] $AllowSyntheticSecrets
)

$ErrorActionPreference = 'Stop'
$n1Root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$n1Target = Join-Path $n1Root 'src-tauri/target-codex-n1'
$n1RunBase = Join-Path $n1Root '.tmp/shared-clipboard-n1'
$n1RunPath = $null
$n1OldPath = $env:PATH
$n1OldRustflags = $env:RUSTFLAGS
$n1OldTarget = $env:CARGO_TARGET_DIR

function Assert-N1Path {
  param([string] $Path, [string] $Boundary)
  $n1Full = [IO.Path]::GetFullPath($Path)
  $n1BoundaryFull = [IO.Path]::GetFullPath($Boundary).TrimEnd('\', '/')
  if (-not $n1Full.StartsWith($n1BoundaryFull + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'N1 path outside its designated root'
  }
  $n1Ancestor = $n1Full
  while ($n1Ancestor) {
    if (Test-Path -LiteralPath $n1Ancestor) {
      $n1Item = Get-Item -LiteralPath $n1Ancestor -Force
      if ($n1Item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Reparse point in N1 path' }
    }
    if ($n1Ancestor.TrimEnd('\', '/') -eq $n1BoundaryFull) { break }
    $n1Ancestor = Split-Path -Parent $n1Ancestor
  }
  return $n1Full
}

function Invoke-N1Cargo {
  param([string[]] $CargoArgs)
  & cargo @CargoArgs
  if ($LASTEXITCODE -ne 0) { throw 'N1 Cargo operation failed; no downloads or lock updates authorized' }
}

function Add-N1GnuManifest {
  if (-not (rustc -vV | Select-String '^host: x86_64-pc-windows-gnu$')) { return }
  $n1Windres = Get-Command windres -ErrorAction SilentlyContinue
  if (-not $n1Windres) { throw 'Existing windres is required; no installation authorized' }
  $n1ManifestDir = Join-Path $n1Target 'test-manifest'
  $null = Assert-N1Path $n1ManifestDir $n1Root
  $null = New-Item -ItemType Directory -Path $n1ManifestDir -Force
  $n1Manifest = Join-Path $n1ManifestDir 'common-controls-v6.manifest'
  $n1Resource = Join-Path $n1ManifestDir 'common-controls-v6.rc'
  $n1Compiled = Join-Path $n1ManifestDir 'common-controls-v6.res'
  @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<assembly xmlns="urn:schemas-microsoft-com:asm.v1" manifestVersion="1.0">
  <dependency><dependentAssembly>
    <assemblyIdentity type="win32" name="Microsoft.Windows.Common-Controls" version="6.0.0.0" processorArchitecture="*" publicKeyToken="6595b64144ccf1df" language="*"/>
  </dependentAssembly></dependency>
</assembly>
'@ | Set-Content -LiteralPath $n1Manifest -Encoding UTF8
  $n1ManifestResource = $n1Manifest.Replace('\', '/')
  '1 24 "{0}"' -f $n1ManifestResource | Set-Content -LiteralPath $n1Resource -Encoding ASCII
  & $n1Windres.Source -i $n1Resource -O coff -o $n1Compiled
  if ($LASTEXITCODE -ne 0) { throw 'N1 manifest compilation failed' }
  # Match the repository bootstrap: Cargo preserves quotes inside link-arg.
  if ($n1Compiled -match '\s') { throw 'N1 GNU resource path must not contain spaces' }
  $n1ManifestFlag = '-C link-arg={0}' -f $n1Compiled
  $env:RUSTFLAGS = if ([string]::IsNullOrWhiteSpace($n1OldRustflags)) { $n1ManifestFlag } else { "$n1OldRustflags $n1ManifestFlag" }
}

# Permission checks precede target writes, Cargo, ACL, filesystem fixtures or native work.
$n1Native = $Mode -in @('Clipboard', 'Custody')
if ($Mode -eq 'Clipboard') {
  if (-not $AllowClipboardMutation -or $AllowSyntheticSecrets) { throw 'Clipboard requires only its specific permission' }
} elseif ($Mode -eq 'Custody') {
  if (-not $AllowSyntheticSecrets -or $AllowClipboardMutation) { throw 'Custody requires only its specific permission' }
} elseif ($AllowClipboardMutation -or $AllowSyntheticSecrets -or $RunId -or $SessionLabel) {
  throw 'Check/Build/Pure reject native permissions and session arguments'
}
if ($n1Native -and ($RunId -notmatch '^[A-Za-z0-9-]{1,64}$' -or $SessionLabel -notmatch '^[A-Za-z0-9-]{1,64}$')) {
  throw 'Native modes require an explicit run ID and an approved disposable Windows session label'
}

try {
  $null = Assert-N1Path $n1Target $n1Root
  $n1ManifestPath = Join-Path $n1Root 'src-tauri/Cargo.toml'
  $n1Common = @('--manifest-path', $n1ManifestPath, '--offline', '--locked', '--bin', 'shared-clipboard-n1', '--features', 'shared-clipboard-n1')
  if (-not $n1Native) {
    $env:PATH = (($n1OldPath -split ';') | Where-Object { $_ -and $_ -notlike '*\miniconda3*' }) -join ';'
    $env:CARGO_TARGET_DIR = $n1Target
    Add-N1GnuManifest
    switch ($Mode) {
      'Check' { Invoke-N1Cargo (@('check') + $n1Common) }
      'Build' { Invoke-N1Cargo (@('build') + $n1Common) }
      'Pure' {
        $n1Listing = @(& cargo test @n1Common n1_pure -- --list)
        if ($LASTEXITCODE -ne 0) { throw 'Pure test listing failed' }
        $n1Selected = @($n1Listing | Where-Object { $_.ToString() -match '::n1_pure::.*: test$' })
        if ($n1Selected.Count -eq 0) { throw 'Pure filter selected zero tests' }
        $n1Selected | ForEach-Object { Write-Output $_.ToString() }
        Write-Output "N1 Pure selected $($n1Selected.Count) tests; no native execution"
        Invoke-N1Cargo (@('test') + $n1Common + @('n1_pure', '--', '--test-threads=1'))
      }
    }
  } else {
    $n1Executable = Join-Path $n1Target 'debug/shared-clipboard-n1.exe'
    if (-not (Test-Path -LiteralPath $n1Executable -PathType Leaf)) { throw 'Build N1-A first; native modes never build or download' }
    $null = Assert-N1Path $n1Executable $n1Root
    $n1RunPath = Assert-N1Path (Join-Path $n1RunBase $RunId) $n1RunBase
    # Create exclusively, without touching an existing profile/run.
    if (Test-Path -LiteralPath $n1RunPath) { throw 'Run directory already exists; use a new ID' }
    $null = Assert-N1Path $n1RunBase $n1Root
    $null = New-Item -ItemType Directory -Path $n1RunBase -Force
    $null = New-Item -ItemType Directory -Path $n1RunPath
    if ($Mode -eq 'Custody') {
      $n1Acl = New-Object Security.AccessControl.DirectorySecurity
      $n1Acl.SetAccessRuleProtection($true, $false)
      $n1Identity = [Security.Principal.WindowsIdentity]::GetCurrent().User
      foreach ($n1Sid in @($n1Identity, [Security.Principal.SecurityIdentifier]::new('S-1-5-18'), [Security.Principal.SecurityIdentifier]::new('S-1-5-32-544'))) {
        $n1Rule = [Security.AccessControl.FileSystemAccessRule]::new($n1Sid, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
        $n1Acl.AddAccessRule($n1Rule)
      }
      Set-Acl -LiteralPath $n1RunPath -AclObject $n1Acl
      $n1ActualAcl = Get-Acl -LiteralPath $n1RunPath
      if (-not $n1ActualAcl.AreAccessRulesProtected) { throw 'Custody directory ACL was not protected' }
    }
    $n1Owner = "$RunId`n$Mode`n$SessionLabel"
    [IO.File]::WriteAllText((Join-Path $n1RunPath '.n1-owned'), $n1Owner, [Text.UTF8Encoding]::new($false))
    $n1Permission = if ($Mode -eq 'Clipboard') { '--allow-clipboard-mutation' } else { '--allow-synthetic-secrets' }
    & $n1Executable --mode ($Mode.ToLowerInvariant()) $n1Permission --run-id $RunId --session-label $SessionLabel --run-dir $n1RunPath
    if ($LASTEXITCODE -ne 0) { throw 'N1 native run failed; preserve its directory, do not infer settled helpers' }
    # Exit success is emitted only after native supervisor checks every process handle.
    $n1VerifiedRemoval = Assert-N1Path $n1RunPath $n1RunBase
    if ([IO.File]::ReadAllText((Join-Path $n1VerifiedRemoval '.n1-owned')) -ne $n1Owner) { throw 'Run ownership changed; do not remove' }
    # Check descendants too before recursive deletion; never follow reparse points.
    $n1Pending = [Collections.Generic.Queue[string]]::new()
    $n1Pending.Enqueue($n1VerifiedRemoval)
    while ($n1Pending.Count -gt 0) {
      foreach ($n1Child in Get-ChildItem -LiteralPath $n1Pending.Dequeue() -Force) {
        if ($n1Child.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Reparse descendant; preserve run' }
        if ($n1Child.PSIsContainer) { $n1Pending.Enqueue($n1Child.FullName) }
      }
    }
    Remove-Item -LiteralPath $n1VerifiedRemoval -Recurse -Force
    Write-Output 'N1 run artifacts removed; previous clipboard was neither read nor restored'
  }
} finally {
  $env:PATH = $n1OldPath
  $env:RUSTFLAGS = $n1OldRustflags
  $env:CARGO_TARGET_DIR = $n1OldTarget
}
