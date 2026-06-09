param()

$ErrorActionPreference = "Stop"
if (Get-Variable -Name PSNativeCommandUseErrorActionPreference -ErrorAction SilentlyContinue) {
  $PSNativeCommandUseErrorActionPreference = $true
}

$root = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $PSCommandPath))
$oldPath = $env:PATH

try {
  $env:PATH = (($oldPath -split ';') |
    Where-Object { $_ -and ($_ -notlike '*\miniconda3*') }) -join ';'

  Push-Location (Join-Path $root "src-tauri")
  cargo test
  exit $LASTEXITCODE
} finally {
  Pop-Location -ErrorAction SilentlyContinue
  $env:PATH = $oldPath
}
