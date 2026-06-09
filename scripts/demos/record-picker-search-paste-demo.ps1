param(
  [switch]$UseExistingApp,
  [switch]$SkipSeed,
  [int]$CopicuCdpPort = 9222,
  [int]$CaptureX = 40,
  [int]$CaptureY = 40,
  [int]$CaptureWidth = 1280,
  [int]$CaptureHeight = 720,
  [int]$DurationSeconds = 12
)

$ErrorActionPreference = "Stop"
if (Get-Variable -Name PSNativeCommandUseErrorActionPreference -ErrorAction SilentlyContinue) {
  $PSNativeCommandUseErrorActionPreference = $true
}

Add-Type @"
using System;
using System.Runtime.InteropServices;

public static class DemoWindow {
  [DllImport("user32.dll", SetLastError=true)]
  public static extern bool MoveWindow(IntPtr hWnd, int X, int Y, int nWidth, int nHeight, bool bRepaint);

  [DllImport("user32.dll")]
  public static extern bool SetForegroundWindow(IntPtr hWnd);

  [DllImport("user32.dll")]
  public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

  [DllImport("user32.dll")]
  public static extern bool SetCursorPos(int X, int Y);

  [DllImport("user32.dll")]
  public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo);
}
"@

Add-Type -AssemblyName System.Windows.Forms

$root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$runId = Get-Date -Format "yyyyMMdd-HHmmss"
$demoRoot = Join-Path $root ".codex-run\demo-picker-search-paste-$runId"
$appData = Join-Path $demoRoot "app-data"
$targetDir = Join-Path $root ".codex-run\demo-tauri-target"
$workDir = Join-Path $demoRoot "work"
$logsDir = Join-Path $demoRoot "logs"
$videoDir = Join-Path $root "docs\assets\videos"
$gifDir = Join-Path $root "docs\assets\gifs"
$screenshotDir = Join-Path $root "docs\assets\screenshots"
$mp4Path = Join-Path $videoDir "copicu-picker-search-paste-real.mp4"
$gifPath = Join-Path $gifDir "copicu-picker-search-paste-real.gif"
$posterPath = Join-Path $screenshotDir "copicu-picker-search-paste-real-poster.png"

New-Item -ItemType Directory -Force -Path $appData, $targetDir, $workDir, $logsDir, $videoDir, $gifDir, $screenshotDir | Out-Null

function Wait-Until {
  param(
    [scriptblock]$Condition,
    [int]$TimeoutSeconds = 40,
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

function Assert-Port-Free {
  param([int]$Port)
  $listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  if ($listener) {
    throw "Port $Port is already listening. Stop the existing process before recording."
  }
}

function Wait-Cdp {
  param([int]$Port)
  Wait-Until -Reason "CDP port $Port" -TimeoutSeconds 480 -Condition {
    try {
      Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:$Port/json/version" -TimeoutSec 1 | Out-Null
      return $true
    } catch {
      return $false
    }
  } | Out-Null
}

function Get-WindowByTitle {
  param([string]$TitleContains)
  Get-Process -ErrorAction SilentlyContinue |
    Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle -like "*$TitleContains*" } |
    Select-Object -First 1
}

function Focus-And-MoveWindow {
  param(
    [string]$TitleContains,
    [int]$X,
    [int]$Y,
    [int]$Width,
    [int]$Height
  )

  $process = Wait-Until -Reason "window containing $TitleContains" -TimeoutSeconds 30 -Condition {
    Get-WindowByTitle -TitleContains $TitleContains
  }
  $hwnd = $process.MainWindowHandle
  [DemoWindow]::ShowWindow($hwnd, 9) | Out-Null
  [DemoWindow]::MoveWindow($hwnd, $X, $Y, $Width, $Height, $true) | Out-Null
  Start-Sleep -Milliseconds 200
  [DemoWindow]::SetForegroundWindow($hwnd) | Out-Null
  Start-Sleep -Milliseconds 350
  return $process
}

function Focus-And-MoveProcessWindow {
  param(
    [string]$ProcessName,
    [int]$X,
    [int]$Y,
    [int]$Width,
    [int]$Height
  )

  $process = Wait-Until -Reason "$ProcessName main window" -TimeoutSeconds 60 -Condition {
    Get-Process -Name $ProcessName -ErrorAction SilentlyContinue |
      Where-Object { $_.MainWindowHandle -ne 0 } |
      Select-Object -First 1
  }
  $hwnd = $process.MainWindowHandle
  [DemoWindow]::ShowWindow($hwnd, 9) | Out-Null
  [DemoWindow]::MoveWindow($hwnd, $X, $Y, $Width, $Height, $true) | Out-Null
  Start-Sleep -Milliseconds 200
  [DemoWindow]::SetForegroundWindow($hwnd) | Out-Null
  Start-Sleep -Milliseconds 450
  return $process
}

function Click-At {
  param([int]$X, [int]$Y)
  [DemoWindow]::SetCursorPos($X, $Y) | Out-Null
  Start-Sleep -Milliseconds 80
  [DemoWindow]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 50
  [DemoWindow]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 120
}

function Start-DemoTarget {
  $targetScript = Join-Path $workDir "demo-target.ps1"
  $targetOutput = Join-Path $workDir "demo-target-output.txt"
  Set-Content -LiteralPath $targetOutput -Value "" -NoNewline
  Set-Content -LiteralPath $targetScript -Value @"
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

`$form = New-Object System.Windows.Forms.Form
`$form.Text = "Copicu Demo Target - Synthetic"
`$form.StartPosition = "Manual"
`$form.BackColor = [System.Drawing.Color]::FromArgb(244, 240, 232)
`$form.Width = 520
`$form.Height = 560

`$label = New-Object System.Windows.Forms.Label
`$label.Text = "Paste target"
`$label.Left = 24
`$label.Top = 22
`$label.Width = 440
`$label.Height = 34
`$label.Font = New-Object System.Drawing.Font("Segoe UI", 18, [System.Drawing.FontStyle]::Bold)
`$label.ForeColor = [System.Drawing.Color]::FromArgb(32, 37, 43)

`$sub = New-Object System.Windows.Forms.Label
`$sub.Text = "Temporary window for a synthetic Copicu demo"
`$sub.Left = 24
`$sub.Top = 62
`$sub.Width = 440
`$sub.Height = 24
`$sub.Font = New-Object System.Drawing.Font("Segoe UI", 9)
`$sub.ForeColor = [System.Drawing.Color]::FromArgb(92, 103, 112)

`$textBox = New-Object System.Windows.Forms.TextBox
`$textBox.Multiline = `$true
`$textBox.AcceptsReturn = `$true
`$textBox.AcceptsTab = `$true
`$textBox.ScrollBars = "Vertical"
`$textBox.Left = 24
`$textBox.Top = 104
`$textBox.Width = 456
`$textBox.Height = 380
`$textBox.Font = New-Object System.Drawing.Font("Consolas", 12)
`$textBox.BackColor = [System.Drawing.Color]::FromArgb(255, 253, 248)
`$textBox.ForeColor = [System.Drawing.Color]::FromArgb(24, 30, 36)
`$textBox.Text = "Click in Copicu, search auth bug, copy the selected synthetic clip, then paste here."
`$textBox.SelectAll()
`$textBox.Add_TextChanged({
  Set-Content -LiteralPath "$targetOutput" -Value `$textBox.Text -NoNewline
})

`$badge = New-Object System.Windows.Forms.Label
`$badge.Text = "SYNTHETIC DATA ONLY"
`$badge.Left = 24
`$badge.Top = 500
`$badge.Width = 240
`$badge.Height = 22
`$badge.Font = New-Object System.Drawing.Font("Segoe UI", 8, [System.Drawing.FontStyle]::Bold)
`$badge.ForeColor = [System.Drawing.Color]::FromArgb(70, 91, 104)

`$form.Controls.Add(`$label)
`$form.Controls.Add(`$sub)
`$form.Controls.Add(`$textBox)
`$form.Controls.Add(`$badge)
`$form.Add_Shown({ `$textBox.Focus(); `$textBox.SelectAll() })
[void]`$form.ShowDialog()
"@

  $process = Start-Process powershell.exe -ArgumentList @(
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-STA",
    "-File",
    $targetScript
  ) -PassThru
  return @{ Process = $process; Output = $targetOutput }
}

function Start-DemoBackdrop {
  $backdropScript = Join-Path $workDir "demo-backdrop.ps1"
  Set-Content -LiteralPath $backdropScript -Value @"
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

`$form = New-Object System.Windows.Forms.Form
`$form.Text = "Copicu Demo Backdrop - Synthetic"
`$form.StartPosition = "Manual"
`$form.Left = $CaptureX
`$form.Top = $CaptureY
`$form.Width = $CaptureWidth
`$form.Height = $CaptureHeight
`$form.FormBorderStyle = "None"
`$form.BackColor = [System.Drawing.Color]::FromArgb(16, 20, 24)
`$form.ShowInTaskbar = `$false

`$label = New-Object System.Windows.Forms.Label
`$label.Text = "Copicu demo - synthetic clipboard data only"
`$label.Left = 24
`$label.Top = 20
`$label.Width = 600
`$label.Height = 28
`$label.Font = New-Object System.Drawing.Font("Segoe UI", 10, [System.Drawing.FontStyle]::Bold)
`$label.ForeColor = [System.Drawing.Color]::FromArgb(144, 161, 174)
`$form.Controls.Add(`$label)

[void]`$form.ShowDialog()
"@

  return Start-Process powershell.exe -ArgumentList @(
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-STA",
    "-File",
    $backdropScript
  ) -PassThru
}

function Start-CopicuDev {
  $stdout = Join-Path $logsDir "tauri-dev.out.log"
  $stderr = Join-Path $logsDir "tauri-dev.err.log"
  $command = @"
`$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS='--remote-debugging-port=$CopicuCdpPort --disable-gpu --disable-gpu-compositing'
`$env:COPICU_APP_DATA_DIR='$appData'
`$env:CARGO_TARGET_DIR='$targetDir'
Set-Location '$root'
npm run tauri:dev
"@
  return Start-Process powershell.exe -WindowStyle Hidden -ArgumentList @(
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    $command
  ) -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru
}

function Invoke-CopicuAutomation {
  param([string]$Needle)

  Focus-And-MoveProcessWindow -ProcessName "copicu" -X ($CaptureX + 560) -Y ($CaptureY + 78) -Width 760 -Height 560 | Out-Null
  Click-At -X ($CaptureX + 590) -Y ($CaptureY + 158)
  [System.Windows.Forms.SendKeys]::SendWait("^a")
  Start-Sleep -Milliseconds 250
  [System.Windows.Forms.SendKeys]::SendWait("auth bug")
  Start-Sleep -Milliseconds 1100
  [System.Windows.Forms.SendKeys]::SendWait("{ENTER}")
  Start-Sleep -Milliseconds 800
}

function Seed-SyntheticHistory {
  $clips = @(
    "Synthetic docs URL`r`nhttps://example.test/docs/copicu-alpha",
    "npm run build && npm run visual:check",
    "Auth retry loop note`r`nInvestigate synthetic auth bug in the fixture app. Expected: one retry. Actual: retry counter keeps increasing after timeout.",
    "SQL demo`r`nselect id, title, kind from demo_clipboard_items where tags like '%alpha%' order by last_used_at desc limit 20;"
  )
  foreach ($clip in $clips) {
    Set-Clipboard -Value $clip
    Start-Sleep -Milliseconds 850
  }
}

function Start-Recording {
  $args = @(
    "-y",
    "-f", "gdigrab",
    "-framerate", "30",
    "-offset_x", [string]$CaptureX,
    "-offset_y", [string]$CaptureY,
    "-video_size", "$($CaptureWidth)x$($CaptureHeight)",
    "-draw_mouse", "1",
    "-i", "desktop",
    "-t", [string]$DurationSeconds,
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "21",
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
    $mp4Path
  )
  return Start-Process ffmpeg -WindowStyle Hidden -ArgumentList $args -PassThru
}

function Export-GifAndPoster {
  ffmpeg -y -i $mp4Path -vf "fps=12,scale=960:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse" $gifPath | Out-Null
  ffmpeg -y -ss 5 -i $mp4Path -frames:v 1 $posterPath | Out-Null
}

$launchedApp = $false
if (-not $UseExistingApp) {
  Assert-Port-Free -Port 1420
}

$tauriProc = $null
$target = $null
$backdropProc = $null
$success = $false
try {
  if ($UseExistingApp) {
    Wait-Until -Reason "existing Copicu process" -TimeoutSeconds 60 -Condition {
      Get-Process -Name copicu -ErrorAction SilentlyContinue
    } | Out-Null
  } else {
    $tauriProc = Start-CopicuDev
    $launchedApp = $true
  }
  Wait-Until -Reason "Copicu process" -TimeoutSeconds 480 -Condition {
    Get-Process -Name copicu -ErrorAction SilentlyContinue
  } | Out-Null
  Start-Sleep -Seconds 10

  if (-not $SkipSeed) {
    Seed-SyntheticHistory
  }
  Focus-And-MoveProcessWindow -ProcessName "copicu" -X ($CaptureX + 560) -Y ($CaptureY + 78) -Width 760 -Height 560 | Out-Null
  $backdropProc = Start-DemoBackdrop
  Start-Sleep -Milliseconds 500
  $target = Start-DemoTarget
  Focus-And-MoveWindow -TitleContains "Copicu Demo Target" -X ($CaptureX + 38) -Y ($CaptureY + 78) -Width 520 -Height 560 | Out-Null

  $recording = Start-Recording
  Start-Sleep -Seconds 2

  Invoke-CopicuAutomation -Needle "Auth retry loop note"
  Focus-And-MoveWindow -TitleContains "Copicu Demo Target" -X ($CaptureX + 38) -Y ($CaptureY + 78) -Width 520 -Height 560 | Out-Null
  [System.Windows.Forms.SendKeys]::SendWait("^v")

  Wait-Until -Reason "target pasted synthetic content" -TimeoutSeconds 8 -Condition {
    $content = Get-Content -Raw -LiteralPath $target.Output -ErrorAction SilentlyContinue
    $content -and $content.Contains("Investigate synthetic auth bug")
  } | Out-Null

  Wait-Process -Id $recording.Id -Timeout ($DurationSeconds + 10)
  Export-GifAndPoster
  Set-Clipboard -Value "COPICU_SYNTHETIC_DEMO_DONE"

  Write-Host "MP4: $mp4Path"
  Write-Host "GIF: $gifPath"
  Write-Host "Poster: $posterPath"
  Write-Host "Run data: $demoRoot"
  $success = $true
} finally {
  if (-not $success) {
    Remove-Item -LiteralPath $mp4Path, $gifPath, $posterPath -Force -ErrorAction SilentlyContinue
  }
  if ($target -and $target.Process) {
    Stop-Process -Id $target.Process.Id -Force -ErrorAction SilentlyContinue
  }
  if ($backdropProc) {
    Stop-Process -Id $backdropProc.Id -Force -ErrorAction SilentlyContinue
  }
  if ($launchedApp) {
    Get-CimInstance Win32_Process |
      Where-Object {
        $_.ProcessId -ne $PID -and (
          $_.CommandLine -like "*$demoRoot*" -or
          $_.CommandLine -like "*$appData*" -or
          $_.CommandLine -like "*$targetDir*"
        )
      } |
      ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    foreach ($port in @(1420, $CopicuCdpPort)) {
      Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
        ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
    }
  }
  if ($tauriProc -and $launchedApp) {
    Stop-Process -Id $tauriProc.Id -Force -ErrorAction SilentlyContinue
  }
}
