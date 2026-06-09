param(
  [int] $RequestTimeoutSeconds = 30,
  [int] $ServerTimeoutSeconds = 120,
  [switch] $IsolatePerProbe
)

$ErrorActionPreference = "Stop"

function Stop-Tree($ProcessId) {
  $children = Get-CimInstance Win32_Process | Where-Object { $_.ParentProcessId -eq $ProcessId }
  foreach ($child in $children) {
    Stop-Tree $child.ProcessId
  }
  Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$escapedRepoRoot = [regex]::Escape($repoRoot)

Get-CimInstance Win32_Process |
  Where-Object { $_.CommandLine -match $escapedRepoRoot -and $_.CommandLine -match "vite\\bin\\vite\.js|vite(\.cmd)? --host 127\.0\.0\.1" } |
  ForEach-Object {
    if ($_.ProcessId -ne $PID) {
      Stop-Tree $_.ProcessId
    }
  }

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$runDir = Join-Path $repoRoot ".codex-run\vite-probes\$stamp"
New-Item -ItemType Directory -Force -Path $runDir | Out-Null
$stdoutLog = Join-Path $runDir "vite.out.log"
$stderrLog = Join-Path $runDir "vite.err.log"
$summaryPath = Join-Path $runDir "summary.tsv"

function Start-ProbeVite($StdoutLog, $StderrLog) {
  $env:COPICU_VITE_RESTART_MODE = "1"
  $env:COPICU_VITE_PROBE_MODE = "1"
  Start-Process `
    -FilePath "npm.cmd" `
    -ArgumentList @("run", "dev") `
    -WorkingDirectory $repoRoot `
    -RedirectStandardOutput $StdoutLog `
    -RedirectStandardError $StderrLog `
    -WindowStyle Hidden `
    -PassThru
}

function Wait-ProbeVite($TimeoutSeconds, $StdoutLog) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    $listener = Get-NetTCPConnection -LocalPort 1420 -State Listen -ErrorAction SilentlyContinue
    $stdout = if (Test-Path $StdoutLog) {
      Get-Content -Raw $StdoutLog -ErrorAction SilentlyContinue
    } else {
      ""
    }
    if ($listener -and $stdout.Contains("ready in")) {
      Start-Sleep -Milliseconds 500
      return
    }
    Start-Sleep -Milliseconds 500
  }
  throw "Vite did not start listening within $TimeoutSeconds seconds"
}

$probes = @(
  "00-empty.ts",
  "01-react.tsx",
  "02-tauri-api.ts",
  "03-virtualizer.ts",
  "04-lucide.tsx",
  "05-mantine-core.tsx",
  "06-markdown.tsx",
  "07-local-theme.ts",
  "08-local-controls.tsx",
  "09-main.ts"
)

"probe`tstatus`tseconds" | Set-Content -LiteralPath $summaryPath -Encoding utf8

if ($IsolatePerProbe) {
  foreach ($probe in $probes) {
    $probeBase = [IO.Path]::GetFileNameWithoutExtension($probe)
    $probeStdout = Join-Path $runDir "$probeBase.out.log"
    $probeStderr = Join-Path $runDir "$probeBase.err.log"
    $vite = Start-ProbeVite $probeStdout $probeStderr
    try {
      Wait-ProbeVite $ServerTimeoutSeconds $probeStdout
      $url = "http://127.0.0.1:1420/src/dev-probes/$probe"
      $startedAt = Get-Date
      $result = & curl.exe --max-time $RequestTimeoutSeconds -s -o NUL -w "%{http_code}" $url 2>$null
      $seconds = "{0:n3}" -f ((Get-Date) - $startedAt).TotalSeconds
      $line = "$probe`t$result`t$seconds"
      Add-Content -LiteralPath $summaryPath -Value $line -Encoding utf8
      Write-Output $line
    } finally {
      Stop-Tree $vite.Id
      Start-Sleep -Milliseconds 300
    }
  }
} else {
  $vite = Start-ProbeVite $stdoutLog $stderrLog
  try {
    Wait-ProbeVite $ServerTimeoutSeconds $stdoutLog
    foreach ($probe in $probes) {
    $url = "http://127.0.0.1:1420/src/dev-probes/$probe"
    $startedAt = Get-Date
    $result = & curl.exe --max-time $RequestTimeoutSeconds -s -o NUL -w "%{http_code}" $url 2>$null
    $seconds = "{0:n3}" -f ((Get-Date) - $startedAt).TotalSeconds
    $line = "$probe`t$result`t$seconds"
    Add-Content -LiteralPath $summaryPath -Value $line -Encoding utf8
    Write-Output $line
    }
  } finally {
    Stop-Tree $vite.Id
  }
}

Remove-Item Env:\COPICU_VITE_RESTART_MODE -ErrorAction SilentlyContinue
Remove-Item Env:\COPICU_VITE_PROBE_MODE -ErrorAction SilentlyContinue

"runDir=$runDir"
Get-Content -Raw $summaryPath
