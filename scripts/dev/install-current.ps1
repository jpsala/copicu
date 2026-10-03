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
    if ($LASTEXITCODE -ne 0) {
      throw "Build failed with exit code $LASTEXITCODE"
    }
  }

  if (-not (Test-Path $installer)) {
    throw "Installer not found: $installer"
  }

  $installedPath = [System.IO.Path]::GetFullPath($installedExe)
  foreach ($candidate in @(Get-CimInstance Win32_Process -Filter "Name = 'copicu.exe'")) {
    if (-not $candidate.ExecutablePath -or -not [string]::Equals(
      [System.IO.Path]::GetFullPath($candidate.ExecutablePath), $installedPath,
      [System.StringComparison]::OrdinalIgnoreCase
    )) { continue }
    $installedProcess = Get-Process -Id $candidate.ProcessId -ErrorAction SilentlyContinue
    if (-not $installedProcess -or -not $installedProcess.Path -or -not [string]::Equals(
      [System.IO.Path]::GetFullPath($installedProcess.Path), $installedPath,
      [System.StringComparison]::OrdinalIgnoreCase
    )) { continue }
    Stop-Process -InputObject $installedProcess -Force
    if (-not $installedProcess.WaitForExit(10000)) {
      throw "Installed process did not exit: pid=$($installedProcess.Id)"
    }
  }

  $installArguments = @("/S")
  if (Test-Path -LiteralPath $installedExe) {
    # NSIS can silently keep an existing binary when reinstalling the same version.
    $installArguments += "/UPDATE"
  }
  $install = Start-Process -FilePath $installer -ArgumentList $installArguments -WindowStyle Hidden -Wait -PassThru
  if ($install.ExitCode -ne 0) {
    throw "Installer exited with code $($install.ExitCode)"
  }

  if (-not (Test-Path $installedExe)) {
    throw "Installed executable not found: $installedExe"
  }

  Start-Process -FilePath $installedExe -WindowStyle Hidden
  Start-Sleep -Seconds 2

  Get-Process copicu -ErrorAction SilentlyContinue |
    Select-Object Id, ProcessName, Path
} finally {
  Pop-Location
}
