param()

$ErrorActionPreference = "Stop"
if (Get-Variable -Name PSNativeCommandUseErrorActionPreference -ErrorAction SilentlyContinue) {
  $PSNativeCommandUseErrorActionPreference = $true
}

$root = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $PSCommandPath))
$oldPath = $env:PATH
$oldRustflags = $env:RUSTFLAGS
$oldCargoTargetDir = $env:CARGO_TARGET_DIR

function Add-WindowsGnuTestManifest {
  param(
    [Parameter(Mandatory = $true)]
    [string] $TargetDir
  )

  $isWindowsRuntime = [System.Runtime.InteropServices.RuntimeInformation]::IsOSPlatform(
    [System.Runtime.InteropServices.OSPlatform]::Windows
  )
  if (-not $isWindowsRuntime) {
    return
  }

  $target = rustc -vV | Select-String -Pattern "^host: x86_64-pc-windows-gnu$"
  if (-not $target) {
    return
  }

  $windres = Get-Command windres -ErrorAction SilentlyContinue
  if (-not $windres) {
    throw "windres is required to embed the Windows common-controls v6 test manifest"
  }

  $manifestDir = Join-Path $TargetDir "test-manifest"
  New-Item -ItemType Directory -Force -Path $manifestDir | Out-Null

  $manifestPath = Join-Path $manifestDir "common-controls-v6.manifest"
  $resourcePath = Join-Path $manifestDir "common-controls-v6.rc"
  $compiledResourcePath = Join-Path $manifestDir "common-controls-v6.res"

  @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<assembly xmlns="urn:schemas-microsoft-com:asm.v1" manifestVersion="1.0">
  <dependency>
    <dependentAssembly>
      <assemblyIdentity type="win32" name="Microsoft.Windows.Common-Controls" version="6.0.0.0" processorArchitecture="*" publicKeyToken="6595b64144ccf1df" language="*"/>
    </dependentAssembly>
  </dependency>
</assembly>
'@ | Set-Content -LiteralPath $manifestPath -Encoding UTF8

  $manifestForResource = $manifestPath.Replace("\", "/")
  "1 24 `"$manifestForResource`"" | Set-Content -LiteralPath $resourcePath -Encoding ASCII
  & $windres.Source -i $resourcePath -O coff -o $compiledResourcePath
  $compiledResourcePath = (Resolve-Path $compiledResourcePath).Path

  $manifestFlag = "-C link-arg=$compiledResourcePath"
  if ([string]::IsNullOrWhiteSpace($env:RUSTFLAGS)) {
    $env:RUSTFLAGS = $manifestFlag
  } elseif ($env:RUSTFLAGS -notlike "*$compiledResourcePath*") {
    $env:RUSTFLAGS = "$env:RUSTFLAGS $manifestFlag"
  }
}

try {
  $env:PATH = (($oldPath -split ';') |
    Where-Object { $_ -and ($_ -notlike '*\miniconda3*') }) -join ';'

  Push-Location (Join-Path $root "src-tauri")
  if ([string]::IsNullOrWhiteSpace($env:CARGO_TARGET_DIR)) {
    $env:CARGO_TARGET_DIR = "target-codex-test"
  }
  Add-WindowsGnuTestManifest -TargetDir $env:CARGO_TARGET_DIR
  cargo test
  exit $LASTEXITCODE
} finally {
  Pop-Location -ErrorAction SilentlyContinue
  $env:PATH = $oldPath
  $env:RUSTFLAGS = $oldRustflags
  $env:CARGO_TARGET_DIR = $oldCargoTargetDir
}
