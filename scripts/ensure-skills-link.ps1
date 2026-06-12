$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$canonical = Join-Path $repoRoot "docs\\skills"
$compat = Join-Path $repoRoot ".agents\\skills"

if (-not (Test-Path $canonical)) {
  throw "Missing canonical skills directory: $canonical"
}

if (Test-Path $compat) {
  $item = Get-Item $compat -Force
  $isLink = ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0
  $target = $item.Target

  if ($isLink -and $target) {
    $resolvedTarget = (Resolve-Path $target).Path
    $resolvedCanonical = (Resolve-Path $canonical).Path
    if ($resolvedTarget -eq $resolvedCanonical) {
      Write-Output "OK: .agents/skills -> $resolvedTarget"
      exit 0
    }
  }

  throw ".agents/skills exists but does not point to docs/skills. Repair it manually before continuing."
}

New-Item -ItemType Junction -Path $compat -Target (Resolve-Path $canonical) | Out-Null
Write-Output "CREATED: .agents/skills -> $canonical"
