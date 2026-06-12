param(
  [string] $AppDataDir,
  [int] $RemoteDebugPort = 9336,
  [int] $StartupTimeoutSeconds = 120,
  [switch] $SkipBuild
)

$ErrorActionPreference = "Stop"
if (Get-Variable -Name PSNativeCommandUseErrorActionPreference -ErrorAction SilentlyContinue) {
  $PSNativeCommandUseErrorActionPreference = $true
}

function Stop-Tree($ProcessId) {
  $children = Get-CimInstance Win32_Process | Where-Object { $_.ParentProcessId -eq $ProcessId }
  foreach ($child in $children) {
    Stop-Tree $child.ProcessId
  }
  Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue
}

function Get-RepoProcessIds($RepoRoot) {
  $escapedRepoRoot = [regex]::Escape($RepoRoot)
  Get-CimInstance Win32_Process |
    Where-Object {
      $_.Name -ieq "copicu.exe" -or
      ($_.CommandLine -match $escapedRepoRoot -and $_.CommandLine -match "tauri dev|@tauri-apps\\cli\\tauri\.js|cargo(\.exe)?.*run.*copicu")
    } |
    Select-Object -ExpandProperty ProcessId -Unique
}

function Get-CopicuMemorySnapshot($Phase, $RunDir) {
  $processes = @(
    Get-CimInstance Win32_Process |
      Where-Object {
        $_.Name -ieq "copicu.exe" -or
        ($_.Name -ieq "msedgewebview2.exe" -and $_.CommandLine -match "dev\.jpsala\.copicu")
      } |
      ForEach-Object { Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue }
  )
  $private = ($processes | Measure-Object PrivateMemorySize64 -Sum).Sum
  $workingSet = ($processes | Measure-Object WorkingSet64 -Sum).Sum
  $row = [pscustomobject]@{
    phase = $Phase
    at = (Get-Date).ToString("o")
    processCount = $processes.Count
    copicuCount = @($processes | Where-Object ProcessName -eq "copicu").Count
    webviewCount = @($processes | Where-Object ProcessName -eq "msedgewebview2").Count
    privateMb = [math]::Round($private / 1MB, 1)
    workingSetMb = [math]::Round($workingSet / 1MB, 1)
  }
  $csv = Join-Path $RunDir "memory-snapshots.csv"
  if (Test-Path -LiteralPath $csv) {
    $row | Export-Csv -LiteralPath $csv -NoTypeInformation -Append
  } else {
    $row | Export-Csv -LiteralPath $csv -NoTypeInformation
  }
  $row
}

function New-SyntheticMetadataScript($ScriptsDir) {
  New-Item -ItemType Directory -Force -Path $ScriptsDir | Out-Null
  $scriptPath = Join-Path $ScriptsDir "perf-metadata-edit-active.ts"
  @'
export default defineAction({
  id: "perf.metadataEditActive",
  title: "Perf metadata edit active",
  description: "Synthetic metadata window lifecycle measurement.",
  triggers: ["devRun"],
  input: { source: "none", selection: "active", kinds: ["text"] },
  capabilities: ["metadata:edit-active", "log:write"],
  logging: { name: "perf-metadata-edit-active.jsonl", redact: true },
  async run() {
    await copicu.log.info("metadata edit active start", { synthetic: true });
    await copicu.metadata.editActive();
    await copicu.log.info("metadata edit active done", { synthetic: true });
  },
});
'@ | Set-Content -LiteralPath $scriptPath -Encoding UTF8
  $scriptPath
}

function Import-DiagLines($LogPath) {
  if (-not (Test-Path -LiteralPath $LogPath)) {
    return @()
  }
  Get-Content -LiteralPath $LogPath |
    ForEach-Object {
      if ($_ -match '^\[diag ([0-9]+)\] ([^:]+):\s?(.*)$') {
        [pscustomobject]@{
          unixMs = [int64] $matches[1]
          event = $matches[2]
          detail = $matches[3]
        }
      }
    } |
    Where-Object {
      $_.event -like "metadata*" -or
      $_.event -like "surface.build*" -or
      $_.event -like "script.action*" -or
      $_.event -like "script.host-call*" -or
      ($_.event -eq "renderer" -and $_.detail -match "metadata|module-load")
    }
}

function Invoke-CdpMetadataStep($Port, $Step, $RunDir, [long] $ItemId = 0, [string] $Marker = "") {
  $nodeScript = @'
const { chromium } = require("@playwright/test");

const port = Number(process.argv[2]);
const step = process.argv[3];
const itemId = Number(process.argv[4] || 0);
const marker = process.argv[5] || "";

function now() {
  return Date.now();
}

async function delay(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function findPage(context, predicate, timeoutMs = 10000) {
  const deadline = now() + timeoutMs;
  while (now() < deadline) {
    for (const page of context.pages()) {
      const ok = await predicate(page).catch(() => false);
      if (ok) return page;
    }
    await delay(100);
  }
  return null;
}

async function isMainPage(page) {
  return page.evaluate(() =>
    Boolean(window.__TAURI_INTERNALS__) &&
    !document.body.classList.contains("settings-window") &&
    !document.body.classList.contains("ai-output-window") &&
    !document.body.classList.contains("ui-host-window") &&
    !document.body.classList.contains("metadata-window") &&
    !document.body.classList.contains("whichkey-window")
  );
}

async function isMetadataPage(page) {
  return page.evaluate(() =>
    document.body.classList.contains("metadata-window") ||
    Boolean(document.querySelector(".metadata-window-app"))
  );
}

function writeSyntheticClipboard(value) {
  const { execFileSync } = require("child_process");
  execFileSync("cmd.exe", ["/c", "clip"], { input: value, stdio: ["pipe", "ignore", "ignore"] });
}

async function waitForSyntheticItem(mainPage, markerValue, timeoutMs = 30000) {
  const deadline = now() + timeoutMs;
  while (now() < deadline) {
    const items = await mainPage.evaluate(() => window.__TAURI_INTERNALS__.invoke("list_recent_items"));
    const item = items.find((entry) => String(entry.text || "").includes(markerValue));
    if (item) return item;
    await delay(250);
  }
  throw new Error(`synthetic item not captured: ${markerValue}`);
}

async function waitMetadataReady(page, id, timeoutMs = 30000) {
  await page.waitForSelector(".metadata-window-app", { timeout: timeoutMs });
  await page.waitForFunction(
    (expectedId) => {
      return document.body.innerText.includes(`Item #${expectedId}`);
    },
    id,
    { timeout: timeoutMs },
  );
}

async function waitMetadataFocus(page, timeoutMs = 1500) {
  const deadline = now() + timeoutMs;
  while (now() < deadline) {
    const state = await metadataFocusState(page);
    if (state.titleFocused) return state;
    await delay(50);
  }
  return metadataFocusState(page);
}

async function metadataFocusState(page) {
  return page.evaluate(() => {
    const active = document.activeElement;
    return {
      activeTag: active?.tagName ?? null,
      activeText: active?.textContent?.slice(0, 80) ?? "",
      titleFocused: active instanceof HTMLInputElement &&
        active.closest(".metadata-window-form") !== null,
    };
  });
}

async function run() {
  let browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  let context = browser.contexts()[0];
  const mainPage = await findPage(context, isMainPage, 30000);
  if (!mainPage) throw new Error("main page not found");

  const startedAt = now();
  let result = {};

  if (step === "seed-item") {
    const value = `${marker} ${Date.now()}`;
    writeSyntheticClipboard(value);
    const item = await waitForSyntheticItem(mainPage, marker);
    result = {
      step,
      elapsedMs: now() - startedAt,
      itemId: item.id,
      marker,
      preview: String(item.preview_text || item.text || "").slice(0, 120),
      pageCount: context.pages().length,
    };
  } else if (step === "refresh-actions") {
    const actions = await mainPage.evaluate(() => window.__TAURI_INTERNALS__.invoke("refresh_script_action_cache"));
    result = {
      step,
      elapsedMs: now() - startedAt,
      scriptPresent: actions.some((action) => action.id === "perf.metadataEditActive"),
      scriptCount: actions.length,
      pageCount: context.pages().length,
    };
  } else if (step === "open-direct") {
    await mainPage.evaluate((id) => {
      window.__TAURI_INTERNALS__.invoke("open_metadata_window", {
        request: { itemId: id },
      }).catch((error) => console.error(error));
      return true;
    }, itemId);
    const dispatchDoneAt = now();
    await browser.close();
    await delay(50);
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    context = browser.contexts()[0];
    const metadataPage = await findPage(context, isMetadataPage, 30000);
    if (!metadataPage) throw new Error("metadata page not found after direct open");
    await waitMetadataReady(metadataPage, itemId);
    const visibleAt = now();
    const focus = await waitMetadataFocus(metadataPage);
    result = {
      step,
      itemId,
      dispatchMs: dispatchDoneAt - startedAt,
      visibleElapsedMs: visibleAt - startedAt,
      elapsedMs: now() - startedAt,
      readyAfterDispatchMs: now() - dispatchDoneAt,
      pageCount: context.pages().length,
      focus,
      textSample: await metadataPage.evaluate(() => document.body.innerText.slice(0, 120)),
    };
  } else if (step === "open-script") {
    await mainPage.evaluate((id) => {
      window.__TAURI_INTERNALS__.invoke("run_action", {
        request: {
          actionId: "perf.metadataEditActive",
          context: {
            trigger: "devRun",
            shortcut: null,
            currentItemId: id,
            selectedItemIds: [],
            view: null,
          },
        },
      }).catch((error) => console.error(error));
      return true;
    }, itemId);
    const dispatchDoneAt = now();
    await browser.close();
    await delay(50);
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    context = browser.contexts()[0];
    const metadataPage = await findPage(context, isMetadataPage, 30000);
    if (!metadataPage) throw new Error("metadata page not found after script open");
    await waitMetadataReady(metadataPage, itemId);
    const visibleAt = now();
    const focus = await waitMetadataFocus(metadataPage);
    result = {
      step,
      itemId,
      dispatchMs: dispatchDoneAt - startedAt,
      visibleElapsedMs: visibleAt - startedAt,
      elapsedMs: now() - startedAt,
      readyAfterDispatchMs: now() - dispatchDoneAt,
      pageCount: context.pages().length,
      focus,
    };
  } else if (step === "close-metadata") {
    const metadataPage = await findPage(context, isMetadataPage, 5000);
    if (!metadataPage) throw new Error("metadata page not found before close");
    await metadataPage.evaluate(() => window.__TAURI_INTERNALS__.invoke("close_metadata_window"));
    await delay(500);
    result = {
      step,
      elapsedMs: now() - startedAt,
      pageCount: context.pages().length,
      metadataPageStillInCdp: Boolean(await findPage(context, isMetadataPage, 500)),
    };
  } else {
    throw new Error(`unknown step: ${step}`);
  }

  await browser.close();
  console.log(JSON.stringify(result));
}

run().catch((error) => {
  console.error(error.stack || String(error));
  process.exit(1);
});
'@

  $output = $nodeScript | node - $Port $Step $ItemId $Marker 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw "CDP metadata step failed: $Step`n$($output -join "`n")"
  }
  $jsonLine = $output | Select-Object -Last 1
  Add-Content -LiteralPath (Join-Path $RunDir "metadata-events.jsonl") -Value $jsonLine
  $jsonLine | ConvertFrom-Json
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$runDir = Join-Path $repoRoot ".codex-run\metadata-window\$stamp"
New-Item -ItemType Directory -Force -Path $runDir | Out-Null

if (-not $AppDataDir) {
  $AppDataDir = Join-Path $runDir "app-data"
}
New-Item -ItemType Directory -Force -Path $AppDataDir | Out-Null
$AppDataDir = (Resolve-Path -LiteralPath $AppDataDir).Path
$scriptsDir = Join-Path $runDir "synthetic-scripts"
$scriptPath = New-SyntheticMetadataScript $scriptsDir

foreach ($processId in @(Get-RepoProcessIds $repoRoot)) {
  if ($processId -ne $PID) {
    Stop-Tree $processId
  }
}
Start-Sleep -Milliseconds 700

if (-not $SkipBuild) {
  Push-Location $repoRoot
  npm run build
  Pop-Location
}

$env:COPICU_APP_DATA_DIR = $AppDataDir
$env:COPICU_SCRIPTS_DIR = $scriptsDir
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=$RemoteDebugPort"
$env:VITE_COPICU_RENDERER_DIAGNOSTICS = "debug"

$stdoutLog = Join-Path $runDir "tauri.out.log"
$stderrLog = Join-Path $runDir "tauri.err.log"
$owner = Start-Process `
  -FilePath "npx.cmd" `
  -ArgumentList @("tauri", "dev", "--no-watch", "--config", "src-tauri/tauri.built-dev.conf.json") `
  -WorkingDirectory $repoRoot `
  -RedirectStandardOutput $stdoutLog `
  -RedirectStandardError $stderrLog `
  -WindowStyle Hidden `
  -PassThru

try {
  $deadline = (Get-Date).AddSeconds($StartupTimeoutSeconds)
  do {
    try {
      $targets = Invoke-RestMethod -Uri "http://127.0.0.1:$RemoteDebugPort/json" -TimeoutSec 2
      if ($targets.Count -gt 0) {
        break
      }
    } catch {
      Start-Sleep -Milliseconds 500
    }
  } while ((Get-Date) -lt $deadline)

  if (-not $targets -or $targets.Count -eq 0) {
    throw "WebView2 CDP target did not appear on port $RemoteDebugPort"
  }

  $events = @()
  $memory = @()
  $marker = "COPICU_SYNTH_METADATA_PERF_$stamp"

  $events += Invoke-CdpMetadataStep $RemoteDebugPort "refresh-actions" $runDir
  $seed = Invoke-CdpMetadataStep $RemoteDebugPort "seed-item" $runDir 0 $marker
  $events += $seed
  $itemId = [long] $seed.itemId
  $memory += Get-CopicuMemorySnapshot "idle-after-seed" $runDir

  $events += Invoke-CdpMetadataStep $RemoteDebugPort "open-direct" $runDir $itemId
  Start-Sleep -Milliseconds 800
  $memory += Get-CopicuMemorySnapshot "metadata-direct-cold-open" $runDir
  $events += Invoke-CdpMetadataStep $RemoteDebugPort "close-metadata" $runDir $itemId
  Start-Sleep -Milliseconds 800
  $memory += Get-CopicuMemorySnapshot "metadata-hidden-after-direct" $runDir
  $events += Invoke-CdpMetadataStep $RemoteDebugPort "open-direct" $runDir $itemId
  Start-Sleep -Milliseconds 800
  $memory += Get-CopicuMemorySnapshot "metadata-direct-warm-open" $runDir
  $events += Invoke-CdpMetadataStep $RemoteDebugPort "close-metadata" $runDir $itemId
  Start-Sleep -Milliseconds 800

  $events += Invoke-CdpMetadataStep $RemoteDebugPort "open-script" $runDir $itemId
  Start-Sleep -Milliseconds 800
  $memory += Get-CopicuMemorySnapshot "metadata-script-warm-open" $runDir
  $events += Invoke-CdpMetadataStep $RemoteDebugPort "close-metadata" $runDir $itemId

  $diag = @(Import-DiagLines $stderrLog)
  [pscustomobject]@{
    runDir = $runDir
    appDataDir = $AppDataDir
    scriptsDir = $scriptsDir
    scriptPath = $scriptPath
    ownerPid = $owner.Id
    itemId = $itemId
    events = $events
    memory = $memory
    diagnostics = $diag
  } | ConvertTo-Json -Depth 8 | Tee-Object -FilePath (Join-Path $runDir "summary.json")
} finally {
  foreach ($processId in @(Get-RepoProcessIds $repoRoot)) {
    if ($processId -ne $PID) {
      Stop-Tree $processId
    }
  }
  Remove-Item Env:\COPICU_APP_DATA_DIR -ErrorAction SilentlyContinue
  Remove-Item Env:\COPICU_SCRIPTS_DIR -ErrorAction SilentlyContinue
  Remove-Item Env:\WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS -ErrorAction SilentlyContinue
  Remove-Item Env:\VITE_COPICU_RENDERER_DIAGNOSTICS -ErrorAction SilentlyContinue
}
