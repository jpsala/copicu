param(
  [int]$ItemCount = 10000
)

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
  $debugTarget = Join-Path (Get-Location) "target\debug"
  $examplesTarget = Join-Path $debugTarget "examples"
  New-Item -ItemType Directory -Force -Path $examplesTarget | Out-Null
  Copy-Item -LiteralPath (Join-Path $debugTarget "WebView2Loader.dll") -Destination (Join-Path $examplesTarget "WebView2Loader.dll") -Force -ErrorAction SilentlyContinue
  $env:PATH = "$debugTarget;$env:PATH"
  cargo run --example bench_history_search -- $ItemCount
  exit $LASTEXITCODE
} finally {
  Pop-Location -ErrorAction SilentlyContinue
  $env:PATH = $oldPath
}
