param(
  [ValidateSet("", "patch", "minor", "major", "rc")]
  [string] $Bump = "",
  [string] $Title,
  [string] $Notes,
  [switch] $PreRelease
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$releaseScript = Join-Path $PSScriptRoot "release-windows.ps1"
$installScript = Join-Path $PSScriptRoot "install-current.ps1"
$installedExe = Join-Path $env:LOCALAPPDATA "Copicu\copicu.exe"

Push-Location $repoRoot
try {
  $releaseParams = @{
    Yes = $true
    Latest = $true
  }
  if ($Bump) {
    $releaseParams.Bump = $Bump
  }
  if ($Title) {
    $releaseParams.Title = $Title
  }
  if ($Notes) {
    $releaseParams.Notes = $Notes
  }
  if ($PreRelease) {
    $releaseParams.PreRelease = $true
  }

  & $releaseScript @releaseParams
  if ($LASTEXITCODE -ne 0) {
    throw "Release failed with exit code $LASTEXITCODE"
  }

  & $installScript -SkipBuild
  if ($LASTEXITCODE -ne 0) {
    throw "Local installation failed with exit code $LASTEXITCODE"
  }

  $project = Get-Content (Join-Path $repoRoot "package.json") -Raw | ConvertFrom-Json
  $tag = "v$($project.version)"
  $releaseUrl = (& gh release view $tag --json url --jq ".url").Trim()
  if ($LASTEXITCODE -ne 0 -or -not $releaseUrl) {
    throw "Could not resolve the GitHub release URL for $tag"
  }

  if (-not (Test-Path -LiteralPath $installedExe)) {
    throw "Installed executable not found: $installedExe"
  }
  $installedVersion = (Get-Item -LiteralPath $installedExe).VersionInfo.ProductVersion
  $installedProcess = Get-Process copicu -ErrorAction SilentlyContinue |
    Where-Object { $_.Path -eq $installedExe } |
    Select-Object -First 1
  if (-not $installedProcess) {
    throw "Installed Copicu process is not running from $installedExe"
  }

  Write-Host "Release: $releaseUrl"
  Write-Host "Installed version: $installedVersion"
  Write-Host "Installed executable: $installedExe"
  Write-Host "Installed process: $($installedProcess.Id)"
} finally {
  Pop-Location
}
