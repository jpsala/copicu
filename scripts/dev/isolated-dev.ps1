param(
  [switch] $Built,
  [switch] $EnableClipboardWatcher
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$profileRoot = Join-Path $repoRoot ".codex-run\dev-isolated"

$env:COPICU_APP_DATA_DIR = Join-Path $profileRoot "app-data"
$env:COPICU_SCRIPTS_DIR = Join-Path $profileRoot "scripts"
if (-not $env:COPICU_GLOBAL_SHORTCUT) {
  $env:COPICU_GLOBAL_SHORTCUT = "Ctrl+Shift+."
}
$watcherRequested = $EnableClipboardWatcher -or ($env:COPICU_ENABLE_CLIPBOARD_WATCHER -eq "1")
if ($watcherRequested) {
  Remove-Item Env:\COPICU_DISABLE_CLIPBOARD_WATCHER -ErrorAction SilentlyContinue
}
$watcherEnabled = -not [bool] $env:COPICU_DISABLE_CLIPBOARD_WATCHER

New-Item -ItemType Directory -Force -Path $env:COPICU_APP_DATA_DIR, $env:COPICU_SCRIPTS_DIR | Out-Null

Write-Host "Copicu dev isolated profile:"
Write-Host "  app data: $env:COPICU_APP_DATA_DIR"
Write-Host "  scripts : $env:COPICU_SCRIPTS_DIR"
Write-Host "  hotkey  : $env:COPICU_GLOBAL_SHORTCUT"
Write-Host ("  watcher : " + ($(if ($watcherEnabled) { "enabled" } else { "disabled" })))

Push-Location $repoRoot
try {
  if ($Built) {
    Remove-Item Env:\COPICU_TAURI_DEV -ErrorAction SilentlyContinue
    $env:VITE_COPICU_RENDERER_DIAGNOSTICS = "debug"
    npx.cmd tauri dev --no-watch --config src-tauri/tauri.built-dev.conf.json
  } else {
    $env:COPICU_TAURI_DEV = "1"
    npx.cmd tauri dev
  }
} finally {
  Pop-Location
}
