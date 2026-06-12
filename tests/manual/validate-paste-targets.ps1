param(
  [int]$CopicuCdpPort = 9222,
  [int]$ChromeCdpPort = 9335
)

$ErrorActionPreference = "Stop"
if (Get-Variable -Name PSNativeCommandUseErrorActionPreference -ErrorAction SilentlyContinue) {
  $PSNativeCommandUseErrorActionPreference = $true
}

Add-Type @"
using System;
using System.Runtime.InteropServices;

public static class NativeFocus {
  [DllImport("user32.dll")]
  public static extern bool SetForegroundWindow(IntPtr hWnd);

  [DllImport("user32.dll")]
  public static extern IntPtr GetForegroundWindow();

  [DllImport("user32.dll")]
  public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);

  [DllImport("kernel32.dll")]
  public static extern uint GetCurrentThreadId();

  [DllImport("user32.dll")]
  public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);

  [DllImport("user32.dll")]
  public static extern bool BringWindowToTop(IntPtr hWnd);

  [DllImport("user32.dll")]
  public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

  [DllImport("user32.dll")]
  public static extern IntPtr SetFocus(IntPtr hWnd);
}
"@
Add-Type -AssemblyName System.Windows.Forms

$root = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $PSCommandPath))
$workDir = Join-Path $env:TEMP "copicu-paste-validation"
New-Item -ItemType Directory -Force -Path $workDir | Out-Null

$runId = Get-Date -Format "yyyyMMdd_HHmmssfff"
$tokens = [ordered]@{
  notepad = "COPICU_SYNTH_NOTEPAD_PASTE_$runId"
  browser = "COPICU_SYNTH_BROWSER_PASTE_$runId"
  editor  = "COPICU_SYNTH_EDITOR_PASTE_$runId"
}

function Wait-Until {
  param(
    [scriptblock]$Condition,
    [int]$TimeoutSeconds = 20,
    [int]$SleepMilliseconds = 250,
    [string]$Reason = "condition"
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    $value = & $Condition
    if ($value) {
      return $value
    }
    Start-Sleep -Milliseconds $SleepMilliseconds
  }

  throw "Timed out waiting for $Reason"
}

function Assert-CdpReady {
  param([int]$Port)

  Wait-Until -Reason "CDP on port $Port" -Condition {
    try {
      Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:$Port/json/version" -TimeoutSec 1 | Out-Null
      return $true
    } catch {
      return $false
    }
  } | Out-Null
}

function Get-MainWindow {
  param(
    [string]$ProcessName,
    [string]$TitleContains
  )

  Get-Process -Name $ProcessName -ErrorAction SilentlyContinue |
    Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle -like "*$TitleContains*" } |
    Select-Object -First 1
}

function Focus-Window {
  param(
    [string]$ProcessName,
    [string]$TitleContains
  )

  $process = Wait-Until -Reason "$ProcessName window containing $TitleContains" -Condition {
    Get-MainWindow -ProcessName $ProcessName -TitleContains $TitleContains
  }

  $hwnd = $process.MainWindowHandle
  [NativeFocus]::ShowWindow($hwnd, 9) | Out-Null
  $foreground = [NativeFocus]::GetForegroundWindow()
  [uint32]$foregroundPid = 0
  $foregroundThread = [NativeFocus]::GetWindowThreadProcessId($foreground, [ref]$foregroundPid)
  [uint32]$targetPid = 0
  $targetThread = [NativeFocus]::GetWindowThreadProcessId($hwnd, [ref]$targetPid)
  $currentThread = [NativeFocus]::GetCurrentThreadId()

  if ($foregroundThread -ne 0) {
    [NativeFocus]::AttachThreadInput($currentThread, $foregroundThread, $true) | Out-Null
  }
  if ($targetThread -ne 0) {
    [NativeFocus]::AttachThreadInput($currentThread, $targetThread, $true) | Out-Null
  }
  try {
    [NativeFocus]::BringWindowToTop($hwnd) | Out-Null
    [NativeFocus]::SetFocus($hwnd) | Out-Null
    [NativeFocus]::SetForegroundWindow($hwnd) | Out-Null
  } finally {
    if ($targetThread -ne 0) {
      [NativeFocus]::AttachThreadInput($currentThread, $targetThread, $false) | Out-Null
    }
    if ($foregroundThread -ne 0) {
      [NativeFocus]::AttachThreadInput($currentThread, $foregroundThread, $false) | Out-Null
    }
  }

  Wait-Until -Reason "$ProcessName foreground" -TimeoutSeconds 5 -Condition {
    $active = [NativeFocus]::GetForegroundWindow()
    [uint32]$activePid = 0
    [NativeFocus]::GetWindowThreadProcessId($active, [ref]$activePid) | Out-Null
    $activePid -eq $process.Id
  } | Out-Null

  Start-Sleep -Milliseconds 900
  return $process
}

function Invoke-CopicuPickerHotkey {
  [System.Windows.Forms.SendKeys]::SendWait("^+.")
  Start-Sleep -Milliseconds 600
}

function Get-CopicuRendererState {
  $env:COPICU_CDP_PORT = [string]$CopicuCdpPort

  Push-Location $root
  try {
    $json = @'
const { chromium } = require("playwright");

(async () => {
  const port = process.env.COPICU_CDP_PORT;
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const context = browser.contexts()[0];
  const pages = context.pages();
  const page = pages[0];
  const state = {
    pageCount: pages.length,
    url: page?.url() ?? null,
    title: null,
    readyState: null,
    hasDev: false,
    searchInput: false,
    rootChildren: null,
    active: null,
  };

  if (page) {
    state.title = await page.title().catch(() => null);
    Object.assign(state, await page.evaluate(() => ({
      readyState: document.readyState,
      hasDev: !!window.__copicuDev,
      searchInput: !!document.querySelector('input[aria-label="Search clipboard history"]'),
      rootChildren: document.getElementById("root")?.childElementCount ?? null,
      active:
        document.activeElement?.getAttribute?.("aria-label") ??
        document.activeElement?.getAttribute?.("placeholder") ??
        document.activeElement?.tagName ??
        null,
    })));
  }

  console.log(JSON.stringify(state));
  await browser.close();
})();
'@ | node -

    return $json | ConvertFrom-Json
  } finally {
    Pop-Location
    Remove-Item Env:\COPICU_CDP_PORT -ErrorAction SilentlyContinue
  }
}

function Wait-CopicuRendererReady {
  param([int]$TimeoutSeconds = 60)

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  $lastState = $null
  $attempt = 0

  while ((Get-Date) -lt $deadline) {
    $attempt += 1
    if ($attempt -eq 1 -or $attempt % 5 -eq 0) {
      Invoke-CopicuPickerHotkey
    }

    try {
      $lastState = Get-CopicuRendererState
      if ($lastState.hasDev -and $lastState.searchInput) {
        return $lastState
      }
    } catch {
      $lastState = [pscustomobject]@{
        error = $_.Exception.Message
      }
    }

    Start-Sleep -Milliseconds 1000
  }

  $details = if ($lastState) {
    $lastState | ConvertTo-Json -Compress
  } else {
    "null"
  }
  throw "Timed out waiting for Copicu renderer readiness. Last state: $details"
}

function Invoke-CopicuPaste {
  param(
    [string]$Query,
    [ValidateSet("default", "ctrlV")]
    [string]$PasteShortcut = "default"
  )

  $env:COPICU_CDP_PORT = [string]$CopicuCdpPort
  $env:COPICU_QUERY = $Query
  $env:COPICU_PASTE_SHORTCUT = $PasteShortcut

  Push-Location $root
  try {
    @'
const { chromium } = require("playwright");

(async () => {
  const port = process.env.COPICU_CDP_PORT;
  const query = process.env.COPICU_QUERY;
  const pasteShortcut = process.env.COPICU_PASTE_SHORTCUT;
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const page = browser.contexts()[0].pages()[0];
  await page.waitForFunction(() => !!window.__copicuDev, { timeout: 15000 });

  if (pasteShortcut === "ctrlV") {
    const itemId = await page.evaluate(async (needle) => {
      const api = window.__copicuDev;
      const items = await api.invoke("search_items", { query: needle });
      if (items.length === 0) {
        throw new Error(`No history item found for ${needle}`);
      }
      return items[0].id;
    }, query);
    await page.evaluate(() => window.__copicuDev.invoke("show_picker"));
    await page.waitForTimeout(200);
    await page.evaluate((id) => window.__copicuDev.invoke("activate_item", {
      request: {
        itemId: id,
        copy: true,
        markUsed: true,
        hidePicker: true,
        focusPrevious: true,
        paste: true,
        pasteShortcut: "ctrlV",
      },
    }), itemId);
    await page.waitForTimeout(1200);
    await browser.close();
    return;
  }

  await page.locator('input[aria-label="Search clipboard history"]').waitFor({ state: "visible", timeout: 15000 });
  await page.locator('input[aria-label="Search clipboard history"]').fill(query);
  await page.waitForFunction(
    (needle) => {
      const buttons = Array.from(document.querySelectorAll(".feed-item"));
      return buttons.some((button) => button.textContent.includes(needle));
    },
    query,
    { timeout: 5000 },
  );
  await browser.close();
})();
'@ | node -

    $wshell = New-Object -ComObject WScript.Shell
    $wshell.AppActivate("Copicu") | Out-Null
    Start-Sleep -Milliseconds 250
    [System.Windows.Forms.SendKeys]::SendWait("+{ENTER}")
    Start-Sleep -Milliseconds 900
  } finally {
    Pop-Location
    Remove-Item Env:\COPICU_QUERY -ErrorAction SilentlyContinue
    Remove-Item Env:\COPICU_CDP_PORT -ErrorAction SilentlyContinue
    Remove-Item Env:\COPICU_PASTE_SHORTCUT -ErrorAction SilentlyContinue
  }
}

function Seed-CopicuHistory {
  foreach ($token in $tokens.Values) {
    Set-Clipboard -Value "$token`r`nSynthetic validation line."
    Start-Sleep -Milliseconds 700
  }

  $env:COPICU_CDP_PORT = [string]$CopicuCdpPort
  $env:COPICU_QUERIES = ($tokens.Values -join "|")

  Push-Location $root
  try {
    @'
const { chromium } = require("playwright");

(async () => {
  const port = process.env.COPICU_CDP_PORT;
  const queries = process.env.COPICU_QUERIES.split("|");
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const page = browser.contexts()[0].pages()[0];
  await page.waitForFunction(() => !!window.__copicuDev, { timeout: 15000 });

  const results = await page.evaluate(async (needles) => {
    const api = window.__copicuDev;
    const found = [];
    for (const needle of needles) {
      const items = await api.invoke("search_items", { query: needle });
      found.push(items.length);
    }
    return found;
  }, queries);

  await browser.close();
  if (!results.every((count) => count > 0)) {
    throw new Error(`Missing seeded history items: ${JSON.stringify(results)}`);
  }
})();
'@ | node -
  } finally {
    Pop-Location
    Remove-Item Env:\COPICU_QUERIES -ErrorAction SilentlyContinue
    Remove-Item Env:\COPICU_CDP_PORT -ErrorAction SilentlyContinue
  }
}

function Test-NotepadPaste {
  $file = Join-Path $workDir "notepad-target.txt"
  Set-Content -LiteralPath $file -Value "" -NoNewline
  $notepad = Start-Process notepad.exe -ArgumentList "`"$file`"" -PassThru
  try {
    Focus-Window -ProcessName "notepad" -TitleContains "notepad-target" | Out-Null
    Invoke-CopicuPickerHotkey
    Invoke-CopicuPaste -Query $tokens.notepad
    Start-Sleep -Milliseconds 500
    Focus-Window -ProcessName "notepad" -TitleContains "notepad-target" | Out-Null
    [System.Windows.Forms.SendKeys]::SendWait("^a")
    Start-Sleep -Milliseconds 150
    [System.Windows.Forms.SendKeys]::SendWait("^c")
    Wait-Until -Reason "notepad target clipboard verification" -TimeoutSeconds 6 -Condition {
      $content = Get-Clipboard -Raw -ErrorAction SilentlyContinue
      $content -and $content.Contains($tokens.notepad)
    } | Out-Null
    return "notepad=pass"
  } finally {
    Stop-Process -Id $notepad.Id -ErrorAction SilentlyContinue
  }
}

function Test-BrowserPaste {
  $chrome = "${env:ProgramFiles}\Google\Chrome\Application\chrome.exe"
  if (-not (Test-Path $chrome)) {
    $chrome = "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
  }
  if (-not (Test-Path $chrome)) {
    throw "Chrome/Edge executable not found"
  }

  $html = Join-Path $workDir "browser-target.html"
  $profile = Join-Path $workDir "chrome-profile"
  New-Item -ItemType Directory -Force -Path $profile | Out-Null
  Set-Content -LiteralPath $html -Value @"
<!doctype html>
<html>
  <head><title>Copicu Browser Target</title></head>
  <body>
    <textarea id="target" autofocus style="width:80vw;height:50vh"></textarea>
    <script>
      target.focus();
      window.addEventListener("focus", () => target.focus());
      document.addEventListener("visibilitychange", () => target.focus());
    </script>
  </body>
</html>
"@

  $args = @(
    "--new-window",
    "--user-data-dir=$profile",
    "--remote-debugging-port=$ChromeCdpPort",
    (New-Object System.Uri($html)).AbsoluteUri
  )
  Start-Process -FilePath $chrome -ArgumentList $args | Out-Null

  try {
    Assert-CdpReady -Port $ChromeCdpPort
    $env:CHROME_CDP_PORT = [string]$ChromeCdpPort
    Push-Location $root
    try {
      @'
const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${process.env.CHROME_CDP_PORT}`);
  const context = browser.contexts()[0];
  let page = context.pages().find((candidate) => candidate.url().includes("browser-target.html"));
  const deadline = Date.now() + 5000;
  while (!page && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    page = context.pages().find((candidate) => candidate.url().includes("browser-target.html"));
  }
  if (!page) {
    throw new Error("browser-target.html page not found");
  }
  await page.locator("#target").focus();
  await browser.close();
})();
'@ | node -
    } finally {
      Pop-Location
      Remove-Item Env:\CHROME_CDP_PORT -ErrorAction SilentlyContinue
    }

    Focus-Window -ProcessName (Split-Path -Leaf $chrome).Replace(".exe", "") -TitleContains "Copicu Browser Target" | Out-Null
    Invoke-CopicuPickerHotkey
    Invoke-CopicuPaste -Query $tokens.browser

    Focus-Window -ProcessName (Split-Path -Leaf $chrome).Replace(".exe", "") -TitleContains "Copicu Browser Target" | Out-Null
    [System.Windows.Forms.SendKeys]::SendWait("^a")
    Start-Sleep -Milliseconds 150
    [System.Windows.Forms.SendKeys]::SendWait("^c")
    Wait-Until -Reason "browser target clipboard verification" -TimeoutSeconds 6 -Condition {
      $content = Get-Clipboard -Raw -ErrorAction SilentlyContinue
      $content -and $content.Contains($tokens.browser)
    } | Out-Null

    return "browser=pass"
  } finally {
    Get-CimInstance Win32_Process |
      Where-Object { $_.Name -in @("chrome.exe", "msedge.exe") -and $_.CommandLine -like "*$profile*" } |
      ForEach-Object { Stop-Process -Id $_.ProcessId -ErrorAction SilentlyContinue }
  }
}

function Test-EditorPaste {
  $contentFile = Join-Path $workDir "editor-target-content.txt"
  $scriptFile = Join-Path $workDir "editor-target.ps1"
  Set-Content -LiteralPath $contentFile -Value "" -NoNewline
  Set-Content -LiteralPath $scriptFile -Value @"
Add-Type -AssemblyName System.Windows.Forms
`$form = New-Object System.Windows.Forms.Form
`$form.Text = "Copicu Editor Target"
`$form.Width = 800
`$form.Height = 520
`$textBox = New-Object System.Windows.Forms.TextBox
`$textBox.Multiline = `$true
`$textBox.AcceptsReturn = `$true
`$textBox.AcceptsTab = `$true
`$textBox.ScrollBars = "Both"
`$textBox.Dock = "Fill"
`$textBox.Font = New-Object System.Drawing.Font("Consolas", 11)
`$textBox.Add_TextChanged({
  Set-Content -LiteralPath "$contentFile" -Value `$textBox.Text -NoNewline
})
`$form.Controls.Add(`$textBox)
`$form.Add_Shown({ `$textBox.Focus() })
[void]`$form.ShowDialog()
"@

  $editor = Start-Process powershell.exe -ArgumentList @(
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-STA",
    "-File",
    $scriptFile
  ) -PassThru

  try {
    Focus-Window -ProcessName "powershell" -TitleContains "Copicu Editor Target" | Out-Null
    Invoke-CopicuPickerHotkey
    Invoke-CopicuPaste -Query $tokens.editor

    Wait-Until -Reason "editor target pasted content" -TimeoutSeconds 10 -Condition {
      $content = Get-Content -Raw -LiteralPath $contentFile -ErrorAction SilentlyContinue
      $content -and $content.Contains($tokens.editor)
    } | Out-Null

    return "editor=pass"
  } finally {
    Stop-Process -Id $editor.Id -ErrorAction SilentlyContinue
  }
}

Assert-CdpReady -Port $CopicuCdpPort
Wait-CopicuRendererReady | Out-Null
Seed-CopicuHistory

$results = @()
$results += Test-NotepadPaste
$results += Test-BrowserPaste
$results += Test-EditorPaste
$results -join [Environment]::NewLine
