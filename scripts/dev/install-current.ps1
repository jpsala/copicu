param(
  [switch] $SkipBuild
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$tauriConfig = Get-Content (Join-Path $repoRoot "src-tauri\tauri.conf.json") -Raw | ConvertFrom-Json
$installer = Join-Path $repoRoot "src-tauri\target\release\bundle\nsis\Copicu_$($tauriConfig.version)_x64-setup.exe"
$installedExe = Join-Path $env:LOCALAPPDATA "Copicu\copicu.exe"

Push-Location $repoRoot
try {
  if (-not $SkipBuild) {
    npm run tauri:build
  }

  if (-not (Test-Path $installer)) {
    throw "Installer not found: $installer"
  }

  $processes = Get-Process copicu -ErrorAction SilentlyContinue
  if ($processes) {
    $processes | Stop-Process -Force
    Start-Sleep -Seconds 1
  }

  $install = Start-Process -FilePath $installer -ArgumentList "/S" -Wait -PassThru
  if ($install.ExitCode -ne 0) {
    throw "Installer exited with code $($install.ExitCode)"
  }

  if (-not (Test-Path $installedExe)) {
    throw "Installed executable not found: $installedExe"
  }

  Start-Process -FilePath $installedExe
  Start-Sleep -Seconds 2

  Get-Process copicu -ErrorAction SilentlyContinue |
    Select-Object Id, ProcessName, Path
} finally {
  Pop-Location
}
