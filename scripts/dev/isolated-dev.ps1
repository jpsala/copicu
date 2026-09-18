param(
  [switch] $Built,
  [switch] $EnableClipboardWatcher,
  [switch] $Background
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
if ($Background) {
  if ($watcherRequested) {
    throw "Background smoke cannot enable the shared desktop clipboard watcher."
  }
  $env:COPICU_DISABLE_CLIPBOARD_WATCHER = "1"
}
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
  if ($Built -or $Background) {
    Remove-Item Env:\COPICU_TAURI_DEV -ErrorAction SilentlyContinue
    $env:VITE_COPICU_RENDERER_DIAGNOSTICS = "debug"
    $configPath = "src-tauri/tauri.built-dev.conf.json"
    if ($Background) {
      $baseConfig = Get-Content (Join-Path $repoRoot "src-tauri/tauri.conf.json") -Raw | ConvertFrom-Json
      foreach ($window in $baseConfig.app.windows) {
        $window | Add-Member -NotePropertyName visible -NotePropertyValue $false -Force
        $window | Add-Member -NotePropertyName focus -NotePropertyValue $false -Force
      }
      $assistantWindow = $baseConfig.app.windows[0].PSObject.Copy()
      $assistantWindow | Add-Member -NotePropertyName label -NotePropertyValue "assistant" -Force
      $assistantWindow.title = "Copicu Assistant"
      $assistantWindow.url = "index.html?window=assistant"
      $backgroundConfig = Get-Content (Join-Path $repoRoot $configPath) -Raw | ConvertFrom-Json
      $backgroundConfig | Add-Member -NotePropertyName app -NotePropertyValue @{
        windows = @($baseConfig.app.windows) + @($assistantWindow)
      } -Force
      $configPath = Join-Path $profileRoot "tauri.background.conf.json"
      [System.IO.File]::WriteAllText($configPath, ($backgroundConfig | ConvertTo-Json -Depth 10), [System.Text.UTF8Encoding]::new($false))
      $env:WEBVIEW2_USER_DATA_FOLDER = Join-Path $profileRoot "webview-background"
      $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=9336"
      Write-Host "  background: hidden main + assistant; native WebView2 debugging at http://127.0.0.1:9336"
    }
    npx.cmd tauri dev --no-watch --config $configPath
  } else {
    $env:COPICU_TAURI_DEV = "1"
    npx.cmd tauri dev
  }
} finally {
  Pop-Location
}
