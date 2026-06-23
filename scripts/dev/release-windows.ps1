param(
  [string] $Tag,
  [ValidateSet("", "patch", "minor", "major", "rc")]
  [string] $Bump = "",
  [string] $Title,
  [string] $Notes,
  [string] $NotesFile,
  [string] $CommitMessage,
  [string] $Remote = "origin",
  [string] $Target = "main",
  [switch] $PreRelease,
  [switch] $Latest,
  [switch] $SkipValidation,
  [switch] $SkipBuild,
  [switch] $SkipReadme,
  [switch] $SkipCommit,
  [switch] $SkipPush,
  [switch] $SkipGithubRelease,
  [switch] $SetUpstream,
  [switch] $Yes,
  [switch] $DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-Step($Message) {
  Write-Host "[release:windows] $Message"
}

function Invoke-Checked($Command, [string[]] $Arguments) {
  $display = "$Command $($Arguments -join ' ')"
  Write-Step $display
  if ($DryRun) {
    return
  }

  & $Command @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Command failed with exit code ${LASTEXITCODE}: $display"
  }
}

function Confirm-Step($Message) {
  if ($Yes -or $DryRun) {
    Write-Step "$Message (auto-confirmed)"
    return
  }

  $answer = Read-Host "$Message [y/N]"
  if ($answer -notin @("y", "Y", "yes", "YES")) {
    throw "Cancelled: $Message"
  }
}

function Get-GitOutput([string[]] $Arguments) {
  $output = & git @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "git $($Arguments -join ' ') failed with exit code $LASTEXITCODE"
  }
  return ($output -join "`n").Trim()
}

function Get-Sha256($Path) {
  if (Get-Command Get-FileHash -ErrorAction SilentlyContinue) {
    return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToUpperInvariant()
  }

  $stream = [System.IO.File]::OpenRead($Path)
  try {
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
      $bytes = $sha.ComputeHash($stream)
      return (($bytes | ForEach-Object { $_.ToString("x2") }) -join "").ToUpperInvariant()
    } finally {
      $sha.Dispose()
    }
  } finally {
    $stream.Dispose()
  }
}

function Assert-UpdaterSigningConfigured() {
  if ($DryRun -or $SkipBuild) {
    return
  }

  if ($env:TAURI_SIGNING_PRIVATE_KEY) {
    return
  }

  if ($env:TAURI_SIGNING_PRIVATE_KEY_PATH) {
    $signingKeyPath = (Resolve-Path -LiteralPath $env:TAURI_SIGNING_PRIVATE_KEY_PATH).Path
    $env:TAURI_SIGNING_PRIVATE_KEY = (Get-Content -LiteralPath $signingKeyPath -Raw).Trim()
    return
  }

  throw "Auto-update releases require TAURI_SIGNING_PRIVATE_KEY or TAURI_SIGNING_PRIVATE_KEY_PATH so Tauri can create .sig artifacts. Example: `$env:TAURI_SIGNING_PRIVATE_KEY_PATH='.codex-run\\secrets\\copicu-updater.key'"
}

function New-UpdaterManifest(
  [string] $OutputPath,
  [string] $Version,
  [string] $ReleaseTag,
  [string] $AssetName,
  [string] $Signature,
  [string] $Summary
) {
  $assetUrl = "https://github.com/jpsala/copicu/releases/download/$ReleaseTag/$AssetName"
  $manifest = [ordered]@{
    version = $Version
    notes = $Summary
    pub_date = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    platforms = [ordered]@{
      "windows-x86_64" = [ordered]@{
        signature = $Signature
        url = $assetUrl
      }
    }
  }

  if ($DryRun) {
    Write-Step "latest.json would be written to: $OutputPath"
    return
  }

  $manifest | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $OutputPath
}

function ConvertTo-Semver($Value) {
  if (-not $Value) {
    return $null
  }
  $trimmed = ([string] $Value).Trim()
  $match = [regex]::Match($trimmed, '^v?(\d+)\.(\d+)\.(\d+)(?:[-.]([0-9A-Za-z.-]+))?$')
  if (-not $match.Success) {
    return $null
  }
  $major = [int] $match.Groups[1].Value
  $minor = [int] $match.Groups[2].Value
  $patch = [int] $match.Groups[3].Value
  $pre = if ($match.Groups[4].Success) { $match.Groups[4].Value } else { $null }
  [pscustomobject]@{
    Raw = $trimmed
    Major = $major
    Minor = $minor
    Patch = $patch
    Pre = $pre
    IsPrerelease = [bool] $pre
    Version = "$major.$minor.$patch"
    Tag = "v$major.$minor.$patch" + $(if ($pre) { "-$pre" } else { "" })
    CoreWeight = ($major * 1000000) + ($minor * 1000) + $patch
  }
}

function Compare-SemverCore($Left, $Right) {
  if ($null -eq $Left -and $null -eq $Right) { return 0 }
  if ($null -eq $Left) { return -1 }
  if ($null -eq $Right) { return 1 }
  return $Left.CoreWeight.CompareTo($Right.CoreWeight)
}

function Get-MaxSemverCore($Items) {
  $max = $null
  foreach ($item in @($Items)) {
    if ($null -eq $item) { continue }
    if ((Compare-SemverCore $item $max) -gt 0) {
      $max = $item
    }
  }
  return $max
}

function Get-RcNumber($Semver) {
  if ($null -eq $Semver -or -not $Semver.Pre) {
    return $null
  }
  $match = [regex]::Match($Semver.Pre, '^rc[.-]?(\d+)$', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
  if (-not $match.Success) {
    return $null
  }
  return [int] $match.Groups[1].Value
}

function New-CoreTag($Major, $Minor, $Patch) {
  return "v$Major.$Minor.$Patch"
}

function Get-GithubReleaseTags() {
  if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    Write-Step "GitHub CLI not found; auto tag will use local version + git tags only"
    return @()
  }

  $json = & gh release list --limit 100 --json tagName 2>$null
  if ($LASTEXITCODE -ne 0) {
    Write-Step "gh release list failed; auto tag will use local version + git tags only"
    return @()
  }

  try {
    $items = $json | ConvertFrom-Json
    return @($items | ForEach-Object { [string] $_.tagName })
  } catch {
    Write-Step "failed to parse gh release list; auto tag will use local version + git tags only"
    return @()
  }
}

function Resolve-AutoReleaseTag($CurrentVersion, [string] $RequestedBump, [string[]] $GitTags, [string[]] $GithubReleaseTags) {
  $projectSemver = ConvertTo-Semver $CurrentVersion
  if ($null -eq $projectSemver) {
    throw "Could not parse current project version: $CurrentVersion"
  }

  $publishedRaw = @($GitTags) + @($GithubReleaseTags)
  $publishedSemvers = @($publishedRaw | ForEach-Object { ConvertTo-Semver $_ } | Where-Object { $null -ne $_ })
  $publishedStable = @($publishedSemvers | Where-Object { -not $_.IsPrerelease })
  $latestPublishedStable = Get-MaxSemverCore $publishedStable
  if (
    -not $RequestedBump -and
    -not $projectSemver.IsPrerelease -and
    (Compare-SemverCore $projectSemver $latestPublishedStable) -gt 0 -and
    -not ($publishedRaw -contains $projectSemver.Tag)
  ) {
    return $projectSemver.Tag
  }

  $allRaw = @($CurrentVersion) + @($publishedRaw)
  $allSemvers = @($allRaw | ForEach-Object { ConvertTo-Semver $_ } | Where-Object { $null -ne $_ })
  $stable = @($allSemvers | Where-Object { -not $_.IsPrerelease })
  $prereleases = @($allSemvers | Where-Object { $_.IsPrerelease })
  $latestStable = Get-MaxSemverCore $stable
  $latestPrerelease = Get-MaxSemverCore $prereleases
  $hasNewerPrerelease = $latestPrerelease -and ((Compare-SemverCore $latestPrerelease $latestStable) -gt 0)

  $bump = $RequestedBump
  if (-not $bump) {
    if ($hasNewerPrerelease) {
      $promoteTag = New-CoreTag $latestPrerelease.Major $latestPrerelease.Minor $latestPrerelease.Patch
      $latestRcNumber = Get-RcNumber $latestPrerelease
      $nextRcNumber = if ($latestRcNumber) { $latestRcNumber + 1 } else { 1 }
      $nextRcTag = "$promoteTag-rc.$nextRcNumber"
      $defaultPatchTag = New-CoreTag $latestStable.Major $latestStable.Minor ($latestStable.Patch + 1)

      Write-Host "A newer prerelease exists ($($latestPrerelease.Tag)) than the latest stable ($($latestStable.Tag))."
      Write-Host "Choose release type:"
      Write-Host "  1) patch  -> $defaultPatchTag (default stable patch from latest stable)"
      Write-Host "  2) rc     -> $nextRcTag (continue release candidate line)"
      Write-Host "  3) stable -> $promoteTag (promote prerelease core to stable)"
      Write-Host "  4) minor  -> $(New-CoreTag $latestStable.Major ($latestStable.Minor + 1) 0)"
      Write-Host "  5) major  -> $(New-CoreTag ($latestStable.Major + 1) 0 0)"
      $choice = Read-Host "Select [1-5]"
      switch ($choice) {
        "2" { return $nextRcTag }
        "3" { return $promoteTag }
        "4" { $bump = "minor" }
        "5" { $bump = "major" }
        default { $bump = "patch" }
      }
    } else {
      $bump = "patch"
    }
  }

  switch ($bump) {
    "patch" { return New-CoreTag $latestStable.Major $latestStable.Minor ($latestStable.Patch + 1) }
    "minor" { return New-CoreTag $latestStable.Major ($latestStable.Minor + 1) 0 }
    "major" { return New-CoreTag ($latestStable.Major + 1) 0 0 }
    "rc" {
      if ($hasNewerPrerelease) {
        $coreTag = New-CoreTag $latestPrerelease.Major $latestPrerelease.Minor $latestPrerelease.Patch
        $latestRcNumber = Get-RcNumber $latestPrerelease
        $nextRcNumber = if ($latestRcNumber) { $latestRcNumber + 1 } else { 1 }
        return "$coreTag-rc.$nextRcNumber"
      }
      $coreTag = New-CoreTag $latestStable.Major $latestStable.Minor ($latestStable.Patch + 1)
      return "$coreTag-rc.1"
    }
    default { throw "Unsupported bump: $bump" }
  }
}

function Set-ProjectVersion([string] $Version) {
  if ($DryRun) {
    Write-Step "project version would be set to $Version in package.json, package-lock.json and src-tauri/tauri.conf.json"
    return
  }

  New-Item -ItemType Directory -Force -Path $runDir | Out-Null
  $env:COPICU_RELEASE_VERSION = $Version
  $versionScriptPath = Join-Path $runDir "set-version.cjs"
  $script = @'
const fs = require("fs");
const version = process.env.COPICU_RELEASE_VERSION;
if (!version) throw new Error("COPICU_RELEASE_VERSION is required");
for (const file of ["package.json", "package-lock.json"]) {
  if (!fs.existsSync(file)) continue;
  const json = JSON.parse(fs.readFileSync(file, "utf8"));
  json.version = version;
  if (json.packages && json.packages[""]) json.packages[""].version = version;
  fs.writeFileSync(file, JSON.stringify(json, null, 2) + "\n");
}
const tauriConfig = "src-tauri/tauri.conf.json";
const config = JSON.parse(fs.readFileSync(tauriConfig, "utf8"));
config.version = version;
fs.writeFileSync(tauriConfig, JSON.stringify(config, null, 2) + "\n");
const cargoToml = "src-tauri/Cargo.toml";
let cargo = fs.readFileSync(cargoToml, "utf8");
cargo = cargo.replace(/^(version\s*=\s*)"[^"]+"/m, `$1"${version}"`);
fs.writeFileSync(cargoToml, cargo);
'@
  Set-Content -LiteralPath $versionScriptPath -Value $script
  & node $versionScriptPath
  if ($LASTEXITCODE -ne 0) {
    throw "failed to update project version to $Version"
  }
}

function Update-ReadmeReleaseBlock(
  [string] $ReadmePath,
  [string] $ReleaseTag,
  [string] $AssetName,
  [string] $Sha256,
  [string] $Summary
) {
  $readme = Get-Content -LiteralPath $ReadmePath -Raw
  $releaseUrl = "https://github.com/jpsala/copicu/releases/tag/$ReleaseTag"
  $nextBlock = @"
Current release:

- [$ReleaseTag]($releaseUrl)
- Asset: ``$AssetName``
- Windows x64 NSIS installer
- SHA256: ``$Sha256``

$Summary

Copicu is used daily
"@

  $pattern = "(?ms)Current release:\r?\n\r?\n- \[.*?\]\(.*?\)\r?\n- Asset: ``.*?``\r?\n- Windows x64 NSIS installer\r?\n- SHA256: ``.*?``\r?\n\r?\n.*?\r?\n\r?\nCopicu is used daily"
  if ($readme -notmatch $pattern) {
    throw "Could not find the Current release block in README.md"
  }

  $updated = [regex]::Replace($readme, $pattern, [System.Text.RegularExpressions.MatchEvaluator] { param($match) $nextBlock }, 1)
  if ($DryRun) {
    Write-Step "README.md would be updated for $ReleaseTag / $AssetName / $Sha256"
    return
  }
  Set-Content -LiteralPath $ReadmePath -Value $updated -NoNewline
}

function Stop-CopicuProcessesForRelease() {
  $processes = @(Get-Process copicu -ErrorAction SilentlyContinue)
  if (-not $processes) {
    return
  }
  foreach ($process in $processes) {
    Write-Step "stopping copicu.exe pid=$($process.Id) before release build"
    Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
  }
  Start-Sleep -Seconds 1
}

function Assert-NoForbiddenStagedFiles() {
  $staged = @(git diff --cached --name-only)
  if ($LASTEXITCODE -ne 0) {
    throw "failed to inspect staged files"
  }

  $forbidden = $staged | Where-Object {
    $_ -match '(^|/)(\.env($|\.)|.*\.(sqlite|sqlite3|db|db-wal|db-shm)$)' -or
    $_ -match '(^|/)(blobs|clipboard-dumps|\.codex-run)/' -or
    $_ -match '(^|/)src-tauri/target/' -or
    $_ -match '(^|/)target/'
  }

  if ($forbidden) {
    throw "Refusing to commit forbidden local/secret/build files:`n$($forbidden -join "`n")"
  }
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$tauriConfigPath = Join-Path $repoRoot "src-tauri\tauri.conf.json"
$packageJsonPath = Join-Path $repoRoot "package.json"
$readmePath = Join-Path $repoRoot "README.md"
$runDir = Join-Path $repoRoot ".codex-run\release"

Push-Location $repoRoot
try {
  $currentBranch = Get-GitOutput @("branch", "--show-current")
  if ($Target -and $currentBranch -ne $Target) {
    throw "Current branch is '$currentBranch', expected '$Target'. Pass -Target $currentBranch if this is intentional."
  }

  $tauriConfig = Get-Content -LiteralPath $tauriConfigPath -Raw | ConvertFrom-Json
  $packageJson = Get-Content -LiteralPath $packageJsonPath -Raw | ConvertFrom-Json
  $tauriVersion = [string] $tauriConfig.version
  $packageVersion = [string] $packageJson.version
  if ($tauriVersion -ne $packageVersion) {
    throw "Version mismatch: package.json=$packageVersion, src-tauri/tauri.conf.json=$tauriVersion"
  }

  $gitTags = @((Get-GitOutput @("tag", "--list", "v*")).Split("`n") | ForEach-Object { $_.Trim() } | Where-Object { $_ })
  $githubReleaseTags = Get-GithubReleaseTags

  if (-not $Tag) {
    $Tag = Resolve-AutoReleaseTag -CurrentVersion $tauriVersion -RequestedBump $Bump -GitTags $gitTags -GithubReleaseTags $githubReleaseTags
  }

  if ($Tag -notmatch '^v\d+\.\d+\.\d+([-.][0-9A-Za-z.-]+)?$') {
    throw "Tag must look like vX.Y.Z or vX.Y.Z-rc.N. Received: $Tag"
  }

  if ($gitTags -contains $Tag) {
    throw "Git tag already exists: $Tag"
  }
  if ($githubReleaseTags -contains $Tag) {
    throw "GitHub release already exists: $Tag"
  }

  $tagSemver = ConvertTo-Semver $Tag
  if ($null -eq $tagSemver) {
    throw "Could not parse release tag: $Tag"
  }
  $version = $tagSemver.Version

  if (-not $Title) {
    $Title = "Copicu $Tag"
  }
  if (-not $CommitMessage) {
    $CommitMessage = "chore: release $Tag"
  }
  if (-not $Notes -and -not $NotesFile) {
    $Notes = "Windows installer for $Tag.`n`nSHA256: <filled after build>."
  }
  if (-not $PreRelease -and $tagSemver.IsPrerelease) {
    $PreRelease = $true
  }

  Write-Step "repo: $repoRoot"
  Write-Step "tag: $Tag"
  Write-Step "branch: $currentBranch"
  Write-Step "current version: $tauriVersion"
  Write-Step "release version: $version"
  Write-Step "release mode: $(if ($PreRelease) { 'prerelease' } else { 'stable' })"

  Set-ProjectVersion $version

  $installer = Join-Path $repoRoot "src-tauri\target\release\bundle\nsis\Copicu_$($version)_x64-setup.exe"
  $assetName = Split-Path $installer -Leaf

  if (-not $SkipValidation -or -not $SkipBuild) {
    Stop-CopicuProcessesForRelease
  }

  if (-not $SkipValidation) {
    Invoke-Checked "npm.cmd" @("run", "build")
    Invoke-Checked "cargo.exe" @("check", "--manifest-path", "src-tauri/Cargo.toml", "--tests")
  }

  if (-not $SkipBuild) {
    Assert-UpdaterSigningConfigured
    Invoke-Checked "npm.cmd" @("run", "tauri:build", "--", "--config", "src-tauri/tauri.updater-artifacts.conf.json")
  }

  if (Test-Path -LiteralPath $installer) {
    $hash = Get-Sha256 $installer
  } elseif ($DryRun) {
    $hash = "DRYRUN-SHA256"
    Write-Step "installer would be produced at: $installer"
  } else {
    throw "Installer not found: $installer"
  }

  Write-Step "installer: $installer"
  Write-Step "sha256: $hash"

  $signaturePath = "$installer.sig"
  $latestJsonPath = Join-Path (Split-Path $installer -Parent) "latest.json"

  $releaseSummary = "``$Tag`` updates the Windows installer and current release notes for this cut."
  if ($Notes) {
    $releaseSummary = (($Notes -replace '<filled after build>', $hash) -split "`r?`n" | Select-Object -First 1)
    if (-not $releaseSummary.Trim()) {
      $releaseSummary = "``$Tag`` updates the Windows installer and current release notes for this cut."
    }
  }

  if (Test-Path -LiteralPath $signaturePath) {
    $signature = (Get-Content -LiteralPath $signaturePath -Raw).Trim()
  } elseif ($DryRun -or $SkipBuild) {
    $signature = "DRYRUN-SIGNATURE"
    Write-Step "updater signature would be read from: $signaturePath"
  } else {
    throw "Updater signature not found: $signaturePath"
  }

  New-UpdaterManifest -OutputPath $latestJsonPath -Version $version -ReleaseTag $Tag -AssetName $assetName -Signature $signature -Summary $releaseSummary
  Write-Step "updater manifest: $latestJsonPath"

  if (-not $SkipReadme) {
    Update-ReadmeReleaseBlock -ReadmePath $readmePath -ReleaseTag $Tag -AssetName $assetName -Sha256 $hash -Summary $releaseSummary
  }

  if (-not $SkipCommit) {
    Confirm-Step "Stage all current repo changes and create commit '$CommitMessage'?"
    Invoke-Checked "git.exe" @("add", "-A")
    if (-not $DryRun) {
      Assert-NoForbiddenStagedFiles
      git diff --cached --stat
      if ($LASTEXITCODE -ne 0) {
        throw "failed to render staged diff stat"
      }
      git diff --cached --quiet
      $hasStagedDiff = $LASTEXITCODE -ne 0
      if ($hasStagedDiff) {
        Invoke-Checked "git.exe" @("commit", "-m", $CommitMessage)
      } else {
        Write-Step "no staged changes; skipping commit"
      }
    }
  }

  $head = Get-GitOutput @("rev-parse", "HEAD")
  $branch = Get-GitOutput @("branch", "--show-current")

  if (-not $SkipPush) {
    Confirm-Step "Push branch '$branch' to '$Remote'?"
    if ($SetUpstream) {
      Invoke-Checked "git.exe" @("push", "-u", $Remote, $branch)
    } else {
      Invoke-Checked "git.exe" @("push")
    }
  }

  if (-not $SkipGithubRelease) {
    if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
      throw "GitHub CLI not found. Install gh or pass -SkipGithubRelease."
    }
    Invoke-Checked "gh.exe" @("auth", "status")

    if (-not $NotesFile) {
      New-Item -ItemType Directory -Force -Path $runDir | Out-Null
      $NotesFile = Join-Path $runDir "$($Tag)-notes.md"
      $notesBody = ($Notes -replace '<filled after build>', $hash)
      $notesBody = $notesBody + "`n`nInstaller SHA256: ``$hash```nTarget commit: ``$head``"
      if (-not $DryRun) {
        Set-Content -LiteralPath $NotesFile -Value $notesBody
      }
    }

    $releaseArgs = @("release", "create", $Tag, $installer, $latestJsonPath, "--target", $head, "--title", $Title, "--notes-file", $NotesFile)
    if ($PreRelease) {
      $releaseArgs += "--prerelease"
    }
    if ($Latest) {
      $releaseArgs += "--latest"
    }

    Confirm-Step "Create GitHub release '$Tag' and upload asset '$assetName'?"
    Invoke-Checked "gh.exe" $releaseArgs
  }

  Write-Step "done"
  Write-Host "Tag: $Tag"
  Write-Host "Commit: $head"
  Write-Host "Installer: $installer"
  Write-Host "SHA256: $hash"
} finally {
  Pop-Location
}
