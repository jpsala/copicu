param(
  [switch] $IsolatedAppData,
  [switch] $DefaultAppData,
  [switch] $RemoteDebug,
  [switch] $ViteDev,
  [switch] $EnableClipboardWatcher,
  [int] $RemoteDebugPort = 9222,
  [int] $TimeoutSeconds = 180
)

$ErrorActionPreference = "Stop"

function Write-Step($Message, $StartedAt) {
  $elapsed = if ($StartedAt) {
    "{0:n1}s" -f ((Get-Date) - $StartedAt).TotalSeconds
  } else {
    "0.0s"
  }
  $line = "[dev-restart +$elapsed] $Message"
  Write-Output $line
  if ($script:RestartLog) {
    Add-Content -LiteralPath $script:RestartLog -Value $line
  }
}

function Stop-Tree($ProcessId) {
  $children = Get-CimInstance Win32_Process | Where-Object { $_.ParentProcessId -eq $ProcessId }
  foreach ($child in $children) {
    Stop-Tree $child.ProcessId
  }
  Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue
}

function Get-AncestorProcessIds($ProcessId) {
  $ids = @{}
  $current = Get-CimInstance Win32_Process -Filter "ProcessId=$ProcessId" -ErrorAction SilentlyContinue
  while ($current) {
    $ids[[int]$current.ProcessId] = $true
    $parentId = [int]$current.ParentProcessId
    if ($parentId -le 0 -or $ids.ContainsKey($parentId)) {
      break
    }
    $current = Get-CimInstance Win32_Process -Filter "ProcessId=$parentId" -ErrorAction SilentlyContinue
  }
  return $ids
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$escapedRepoRoot = [regex]::Escape($repoRoot)
$runDir = Join-Path $repoRoot ".codex-run\dev-restart"
$logsDir = Join-Path $runDir "logs"
New-Item -ItemType Directory -Force -Path $logsDir | Out-Null

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$script:RestartLog = Join-Path $logsDir "restart-$stamp.log"
$ownerStdoutLog = Join-Path $logsDir "owner-$stamp.out.log"
$ownerStderrLog = Join-Path $logsDir "owner-$stamp.err.log"
$viteOptimizeStdoutLog = Join-Path $logsDir "vite-optimize-$stamp.out.log"
$viteOptimizeStderrLog = Join-Path $logsDir "vite-optimize-$stamp.err.log"
$startedAt = Get-Date
$seen = @{}
$protectedProcessIds = Get-AncestorProcessIds $PID

Write-Step "stopping repo-owned Copicu/Tauri/Vite processes" $startedAt
$processes = Get-CimInstance Win32_Process |
  Where-Object {
    ($_.ExecutablePath -like (Join-Path $repoRoot "src-tauri\target*") -and $_.Name -ieq "copicu.exe") -or
    ($_.CommandLine -match $escapedRepoRoot -and $_.CommandLine -match "tauri dev|@tauri-apps\\cli\\tauri\.js|vite\\bin\\vite\.js|vite(\.cmd)? --host 127\.0\.0\.1|cargo(\.exe)?.*run.*copicu")
  } |
  Sort-Object ProcessId -Unique

foreach ($process in $processes) {
  if ($protectedProcessIds.ContainsKey([int]$process.ProcessId)) {
    continue
  }
  Write-Step "stopping $($process.Name) pid=$($process.ProcessId)" $startedAt
  Stop-Tree $process.ProcessId
}

$portOwners = Get-NetTCPConnection -LocalPort 1420 -ErrorAction SilentlyContinue |
  Select-Object -ExpandProperty OwningProcess -Unique
foreach ($owner in $portOwners) {
  $process = Get-CimInstance Win32_Process -Filter "ProcessId=$owner" -ErrorAction SilentlyContinue
  if ($process -and $process.CommandLine -match $escapedRepoRoot -and -not $protectedProcessIds.ContainsKey([int]$owner)) {
    Write-Step "freeing port 1420 from pid=$owner" $startedAt
    Stop-Tree $owner
  }
}

Start-Sleep -Milliseconds 700

if (-not $DefaultAppData) {
  $isolatedRoot = Join-Path $repoRoot ".codex-run\dev-isolated"
  $isolatedData = Join-Path $isolatedRoot "app-data"
  $isolatedScripts = Join-Path $isolatedRoot "scripts"
  New-Item -ItemType Directory -Force -Path $isolatedData | Out-Null
  New-Item -ItemType Directory -Force -Path $isolatedScripts | Out-Null
  $env:COPICU_APP_DATA_DIR = $isolatedData
  $env:COPICU_SCRIPTS_DIR = $isolatedScripts
  if (-not $env:COPICU_GLOBAL_SHORTCUT) {
    $env:COPICU_GLOBAL_SHORTCUT = "Ctrl+Shift+."
  }
  if (-not $EnableClipboardWatcher -and -not $env:COPICU_DISABLE_CLIPBOARD_WATCHER) {
    $env:COPICU_DISABLE_CLIPBOARD_WATCHER = "1"
  }
  if ($EnableClipboardWatcher) {
    Remove-Item Env:\COPICU_DISABLE_CLIPBOARD_WATCHER -ErrorAction SilentlyContinue
    $env:COPICU_ENABLE_CLIPBOARD_WATCHER = "1"
  } else {
    Remove-Item Env:\COPICU_ENABLE_CLIPBOARD_WATCHER -ErrorAction SilentlyContinue
  }
  Write-Step "using dev app data: $isolatedData" $startedAt
  Write-Step "using dev scripts dir: $isolatedScripts" $startedAt
  Write-Step "using dev default hotkey: $env:COPICU_GLOBAL_SHORTCUT" $startedAt
  Write-Step ("dev clipboard watcher " + ($(if ($EnableClipboardWatcher) { "enabled" } else { "disabled" }))) $startedAt
} else {
  Remove-Item Env:\COPICU_APP_DATA_DIR -ErrorAction SilentlyContinue
  Remove-Item Env:\COPICU_SCRIPTS_DIR -ErrorAction SilentlyContinue
  Remove-Item Env:\COPICU_GLOBAL_SHORTCUT -ErrorAction SilentlyContinue
  Remove-Item Env:\COPICU_DISABLE_CLIPBOARD_WATCHER -ErrorAction SilentlyContinue
  Remove-Item Env:\COPICU_ENABLE_CLIPBOARD_WATCHER -ErrorAction SilentlyContinue
  Write-Step "using default app data" $startedAt
}

if ($RemoteDebug) {
  $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=$RemoteDebugPort"
  Write-Step "WebView2 remote debugging enabled on port $RemoteDebugPort" $startedAt
} else {
  Remove-Item Env:\WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS -ErrorAction SilentlyContinue
  Write-Step "WebView2 remote debugging disabled" $startedAt
}

if ($ViteDev) {
  Remove-Item Env:\COPICU_VITE_RESTART_MODE -ErrorAction SilentlyContinue
  Write-Step "preoptimizing Vite dependencies" $startedAt
  $viteOptimize = Start-Process `
    -FilePath "npx.cmd" `
    -ArgumentList @("vite", "optimize", "--force") `
    -WorkingDirectory $repoRoot `
    -RedirectStandardOutput $viteOptimizeStdoutLog `
    -RedirectStandardError $viteOptimizeStderrLog `
    -WindowStyle Hidden `
    -PassThru
  $viteOptimize.WaitForExit()
  if ($viteOptimize.ExitCode -ne 0) {
    Write-Step "Vite dependency preoptimize exited with code $($viteOptimize.ExitCode); continuing; stdout: $viteOptimizeStdoutLog; stderr: $viteOptimizeStderrLog" $startedAt
  } else {
    Write-Step "Vite dependency preoptimize completed" $startedAt
  }
  $ownerArguments = @("run", "tauri:dev")
  Write-Step "starting tauri dev owner process" $startedAt
} else {
  Remove-Item Env:\COPICU_VITE_RESTART_MODE -ErrorAction SilentlyContinue
  $env:VITE_COPICU_RENDERER_DIAGNOSTICS = "debug"
  $ownerArguments = @("run", "dev:built:fresh")
  Write-Step "starting built-dev owner process" $startedAt
}

$owner = Start-Process `
  -FilePath "npm.cmd" `
  -ArgumentList $ownerArguments `
  -WorkingDirectory $repoRoot `
  -RedirectStandardOutput $ownerStdoutLog `
  -RedirectStandardError $ownerStderrLog `
  -WindowStyle Hidden `
  -PassThru

$deadline = $startedAt.AddSeconds($TimeoutSeconds)
while ((Get-Date) -lt $deadline) {
  $ownerLog = ""
  if (Test-Path $ownerStdoutLog) {
    $ownerLog += Get-Content -Raw $ownerStdoutLog -ErrorAction SilentlyContinue
  }
  if (Test-Path $ownerStderrLog) {
    $ownerLog += "`n" + (Get-Content -Raw $ownerStderrLog -ErrorAction SilentlyContinue)
  }

  foreach ($event in @(
      @{ key = "vite_ready"; pattern = "ready in"; message = "Vite reported ready" },
      @{ key = "frontend_built"; pattern = "built in"; message = "frontend build completed" },
      @{ key = "rust_finished"; pattern = "Finished `dev` profile"; message = "Cargo finished build/check" },
      @{ key = "shortcut_registered"; pattern = "global shortcut registered"; message = "native startup reached shortcuts" },
      @{ key = "main_startup_hidden"; pattern = "main window startup state: visible=false"; message = "main window started hidden" },
      @{ key = "renderer_module"; pattern = "renderer: module-load"; message = "React renderer module loaded" },
      @{ key = "renderer_ready"; pattern = "active=INPUT:Search clipboard history"; message = "picker input focused; UI responsive" },
      @{ key = "renderer_import_failed"; pattern = "app module import failed"; message = "renderer module import failed" }
    )) {
    if (-not $seen.ContainsKey($event.key) -and $ownerLog.Contains($event.pattern)) {
      $seen[$event.key] = $true
      Write-Step $event.message $startedAt
    }
  }

  if ($seen.ContainsKey("main_startup_hidden") -or $seen.ContainsKey("renderer_ready") -or $seen.ContainsKey("renderer_import_failed")) {
    break
  }

  if ($owner.HasExited) {
    Write-Step "owner process exited early with code $($owner.ExitCode)" $startedAt
    break
  }

  Start-Sleep -Milliseconds 500
}

$vitePid = Get-NetTCPConnection -LocalPort 1420 -ErrorAction SilentlyContinue |
  Where-Object { $_.State -eq "Listen" } |
  Select-Object -First 1 -ExpandProperty OwningProcess
$copicu = Get-Process -Name copicu -ErrorAction SilentlyContinue |
  Where-Object { $_.Path -like (Join-Path $repoRoot "*") } |
  Select-Object -First 1

Write-Step "owner pid: $($owner.Id)" $startedAt
Write-Step "vite pid: $vitePid" $startedAt
if ($copicu) {
  Write-Step "copicu pid: $($copicu.Id), responding=$($copicu.Responding), path=$($copicu.Path)" $startedAt
} else {
  Write-Step "copicu process not found" $startedAt
}
Write-Step "owner stdout log: $ownerStdoutLog" $startedAt
Write-Step "owner stderr log: $ownerStderrLog" $startedAt

if ($seen.ContainsKey("renderer_import_failed")) {
  exit 1
}

if (-not $seen.ContainsKey("main_startup_hidden") -and -not $seen.ContainsKey("renderer_ready")) {
  Write-Step "timed out before hidden startup or renderer readiness was confirmed" $startedAt
  exit 1
}
