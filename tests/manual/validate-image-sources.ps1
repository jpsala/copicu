param(
  [int]$TimeoutSeconds = 8
)

$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName Microsoft.VisualBasic
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class CopicuUser32 {
  [DllImport("user32.dll")]
  public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")]
  public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
}
"@

$appDataDir = Join-Path $env:APPDATA "dev.jpsala.copicu"
$dbPath = Join-Path $appDataDir "copicu.sqlite3"
$tempDir = Join-Path ([System.IO.Path]::GetTempPath()) ("copicu-image-sources-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $tempDir -Force | Out-Null
$queryScriptPath = Join-Path $tempDir "latest-image-row.py"
Set-Content -Path $queryScriptPath -Encoding utf8 -Value @"
import json, sqlite3, sys

db = sys.argv[1]
conn = sqlite3.connect(f"file:{db}?mode=ro", uri=True, timeout=1)
conn.row_factory = sqlite3.Row
row = conn.execute("""
SELECT id, width, height, byte_size, text
FROM clipboard_items
WHERE content_kind = 'image'
ORDER BY id DESC
LIMIT 1
""").fetchone()
print(json.dumps(dict(row) if row else None))
"@

function Assert-DbReady {
  if (!(Test-Path -LiteralPath $dbPath)) {
    throw "Copicu DB not found at $dbPath. Start npm run tauri:dev first."
  }
}

function Get-LatestImageRow {
  Assert-DbReady
  $json = python $queryScriptPath $dbPath
  return $json | ConvertFrom-Json
}

function New-SyntheticBitmap {
  param(
    [int]$Width,
    [int]$Height,
    [string]$Label
  )

  $bitmap = [System.Drawing.Bitmap]::new($Width, $Height)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.Clear([System.Drawing.Color]::FromArgb(245, 247, 250))

  $brushA = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(33, 111, 219))
  $brushB = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(232, 138, 36))
  $brushC = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(44, 160, 103))
  $textBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(28, 32, 40))
  $font = [System.Drawing.Font]::new("Segoe UI", 12, [System.Drawing.FontStyle]::Bold)

  $graphics.FillRectangle($brushA, 0, 0, [math]::Floor($Width * 0.45), $Height)
  $graphics.FillRectangle($brushB, [math]::Floor($Width * 0.45), 0, [math]::Floor($Width * 0.35), $Height)
  $graphics.FillEllipse($brushC, [math]::Floor($Width * 0.62), [math]::Floor($Height * 0.18), [math]::Floor($Width * 0.28), [math]::Floor($Height * 0.48))
  $graphics.DrawString($Label, $font, $textBrush, 12, [math]::Max(8, $Height - 32))

  $graphics.Dispose()
  $brushA.Dispose()
  $brushB.Dispose()
  $brushC.Dispose()
  $textBrush.Dispose()
  $font.Dispose()
  return $bitmap
}

function Wait-Until {
  param(
    [string]$Reason,
    [scriptblock]$Condition,
    [int]$Seconds = $TimeoutSeconds
  )

  $deadline = [DateTime]::UtcNow.AddSeconds($Seconds)
  do {
    $value = & $Condition
    if ($value) {
      return $value
    }
    Start-Sleep -Milliseconds 250
  } while ([DateTime]::UtcNow -lt $deadline)

  throw "Timed out waiting for $Reason"
}

function Wait-ForImageCapture {
  param(
    [string]$Source,
    [long]$BeforeId,
    [int]$Width,
    [int]$Height
  )

  $row = Wait-Until -Reason "$Source image capture" -Condition {
    $latest = Get-LatestImageRow
    if ($null -ne $latest -and [long]$latest.id -gt $BeforeId -and [int]$latest.width -eq $Width -and [int]$latest.height -eq $Height) {
      return $latest
    }
    return $null
  }

  Write-Host ("PASS {0}: id={1} {2}x{3} bytes={4}" -f $Source, $row.id, $row.width, $row.height, $row.byte_size)
  return $row
}

function Copy-ScreenCaptureFixture {
  param([int]$Width, [int]$Height)

  $bitmap = New-SyntheticBitmap -Width $Width -Height $Height -Label "screen"
  $form = [System.Windows.Forms.Form]::new()
  $form.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::None
  $form.StartPosition = [System.Windows.Forms.FormStartPosition]::Manual
  $form.Location = [System.Drawing.Point]::new(80, 80)
  $form.ClientSize = [System.Drawing.Size]::new($Width, $Height)
  $form.TopMost = $true
  $form.BackColor = [System.Drawing.Color]::White

  $picture = [System.Windows.Forms.PictureBox]::new()
  $picture.Dock = [System.Windows.Forms.DockStyle]::Fill
  $picture.Image = $bitmap
  $form.Controls.Add($picture)

  try {
    $form.Show()
    [System.Windows.Forms.Application]::DoEvents()
    Start-Sleep -Milliseconds 500

    $captured = [System.Drawing.Bitmap]::new($Width, $Height)
    $graphics = [System.Drawing.Graphics]::FromImage($captured)
    $graphics.CopyFromScreen($form.Location, [System.Drawing.Point]::Empty, $form.ClientSize)
    $graphics.Dispose()
    [System.Windows.Forms.Clipboard]::SetImage($captured)
    $captured.Dispose()
  } finally {
    $form.Close()
    $bitmap.Dispose()
  }
}

function Copy-FromPaint {
  param([int]$Width, [int]$Height)

  $bitmap = New-SyntheticBitmap -Width $Width -Height $Height -Label "paint"
  $path = Join-Path $tempDir "paint-source.png"
  $bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bitmap.Dispose()

  $process = Start-Process -FilePath "mspaint.exe" -ArgumentList "`"$path`"" -PassThru
  try {
    $process = Wait-Until -Reason "Paint window" -Seconds 10 -Condition {
      $candidate = Get-Process -Id $process.Id -ErrorAction SilentlyContinue
      if ($null -ne $candidate) {
        $candidate.Refresh()
        if ($candidate.MainWindowHandle -ne [IntPtr]::Zero) {
          return $candidate
        }
      }
      $window = Get-Process mspaint -ErrorAction SilentlyContinue |
        Where-Object { $_.MainWindowTitle -like "*paint-source.png*" -and $_.MainWindowHandle -ne [IntPtr]::Zero } |
        Select-Object -First 1
      return $window
    }
    [CopicuUser32]::ShowWindow($process.MainWindowHandle, 5) | Out-Null
    [CopicuUser32]::SetForegroundWindow($process.MainWindowHandle) | Out-Null
    Start-Sleep -Milliseconds 500
    [System.Windows.Forms.SendKeys]::SendWait("^a")
    Start-Sleep -Milliseconds 300
    [System.Windows.Forms.SendKeys]::SendWait("^c")
  } finally {
    Start-Sleep -Milliseconds 500
    if (!$process.HasExited) {
      $process.CloseMainWindow() | Out-Null
      Start-Sleep -Milliseconds 500
    }
    if (!$process.HasExited) {
      $process.Kill()
    }
  }
}

function Copy-FromBrowserClipboardApi {
  param([int]$Width, [int]$Height)

  $bitmap = New-SyntheticBitmap -Width $Width -Height $Height -Label "browser"
  $path = Join-Path $tempDir "browser-source.png"
  $bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bitmap.Dispose()

  $nodeScript = @"
import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const imagePath = process.argv[2];
const bytes = await readFile(imagePath);
const b64 = Buffer.from(bytes).toString('base64');
const browser = await chromium.launch({ headless: false });
const context = await browser.newContext({
  permissions: ['clipboard-write']
});
const page = await context.newPage();
await page.goto('http://127.0.0.1:1420');
await page.evaluate(async (b64) => {
  const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const blob = new Blob([bytes], { type: 'image/png' });
  await navigator.clipboard.write([
    new ClipboardItem({ 'image/png': blob })
  ]);
}, b64);
await browser.close();
"@

  $scriptPath = Join-Path $tempDir "browser-copy.mjs"
  Set-Content -Path $scriptPath -Value $nodeScript -Encoding utf8
  node $scriptPath $path
}

try {
  Assert-DbReady
  $initial = Get-LatestImageRow
  $beforeId = if ($null -eq $initial) { 0 } else { [long]$initial.id }

  Copy-ScreenCaptureFixture -Width 181 -Height 117
  $row = Wait-ForImageCapture -Source "screen-capture-fixture" -BeforeId $beforeId -Width 181 -Height 117
  $beforeId = [long]$row.id

  Copy-FromPaint -Width 223 -Height 141
  $row = Wait-ForImageCapture -Source "paint" -BeforeId $beforeId -Width 223 -Height 141
  $beforeId = [long]$row.id

  Copy-FromBrowserClipboardApi -Width 257 -Height 143
  $row = Wait-ForImageCapture -Source "browser-clipboard-api" -BeforeId $beforeId -Width 257 -Height 143
  $beforeId = [long]$row.id

  Write-Host "SKIP snipping-tool: requires manual region selection over a synthetic fixture."
  Write-Host "PASS image source validation completed."
} finally {
  Remove-Item -LiteralPath $tempDir -Recurse -Force -ErrorAction SilentlyContinue
}
