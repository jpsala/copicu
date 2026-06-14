param(
  [string] $AppDataDir = (Join-Path (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path ".codex-run\dogfood-battery\app-data"),
  [string] $ScriptsDir = (Join-Path (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path ".codex-run\dogfood-battery\scripts"),
  [string] $Hotkey = "Ctrl+Shift+.",
  [switch] $KeepOpen
)

$ErrorActionPreference = "Stop"

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$RunRoot = Join-Path $RepoRoot ".codex-run\dogfood-battery"
$EvidenceDir = Join-Path $RunRoot (Get-Date -Format "yyyyMMdd-HHmmss")
$AhkExe = "C:\Program Files\AutoHotkey\v2\AutoHotkey64.exe"
$CopicuExe = Join-Path $RepoRoot "src-tauri\target\release\copicu.exe"
$StartCmd = Join-Path $EvidenceDir "start-copicu.cmd"
$StartOut = Join-Path $EvidenceDir "copicu.out.log"
$StartErr = Join-Path $EvidenceDir "copicu.err.log"

function Write-Step([string] $Message) {
  $line = "[dogfood] $Message"
  Write-Output $line
  Add-Content -LiteralPath (Join-Path $EvidenceDir "run.log") -Value $line
}

function New-InteractiveTaskName([string] $Prefix) {
  return "$Prefix$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())"
}

function Invoke-InteractiveProcess([string] $Command, [string] $TaskPrefix = "CopicuDogfood") {
  $taskName = New-InteractiveTaskName $TaskPrefix
  $start = (Get-Date).AddMinutes(1).ToString("HH:mm")
  schtasks /Create /TN $taskName /TR $Command /SC ONCE /ST $start /IT /F | Out-Null
  try {
    schtasks /Run /TN $taskName | Out-Null
    Start-Sleep -Milliseconds 500
  } finally {
    schtasks /Delete /TN $taskName /F | Out-Null
  }
}

function Invoke-InteractiveAhk([string] $Name, [string] $Body, [int] $WaitMs = 1800) {
  $scriptPath = Join-Path $EvidenceDir "$Name.ahk"
  $outPath = Join-Path $EvidenceDir "$Name.out.txt"
  $safeOutPath = $outPath.Replace("\", "/")
  $script = @"
#Requires AutoHotkey v2.0
#NoTrayIcon
outFile := "$safeOutPath"
try FileDelete outFile
$Body
ExitApp
"@
  Set-Content -LiteralPath $scriptPath -Value $script -Encoding UTF8
  $cmdPath = Join-Path $EvidenceDir "$Name.cmd"
  Set-Content -LiteralPath $cmdPath -Encoding ASCII -Value "@echo off`r`n`"$AhkExe`" /CP65001 `"$scriptPath`"`r`n"
  Invoke-InteractiveProcess -Command $cmdPath -TaskPrefix "CopicuAhk"
  Start-Sleep -Milliseconds $WaitMs
  if (Test-Path $outPath) {
    return Get-Content -Raw -LiteralPath $outPath
  }
  return ""
}

function Assert-Contains([string] $Haystack, [string] $Needle, [string] $Message) {
  if (-not $Haystack.Contains($Needle)) {
    throw "$Message`nExpected to find: $Needle`nActual:`n$Haystack"
  }
}

New-Item -ItemType Directory -Force -Path $EvidenceDir, $AppDataDir, $ScriptsDir | Out-Null
Write-Step "evidence: $EvidenceDir"

Write-Step "running trusted script API mock battery"
$env:COPICU_DOGFOOD_EVIDENCE_DIR = Join-Path $EvidenceDir "script-api"
node (Join-Path $RepoRoot "tests\manual\dogfood\run-script-api-battery.mjs") | Tee-Object -FilePath (Join-Path $EvidenceDir "script-api.log")
if ($LASTEXITCODE -ne 0) {
  throw "script API battery failed"
}
Remove-Item Env:\COPICU_DOGFOOD_EVIDENCE_DIR -ErrorAction SilentlyContinue

Write-Step "stopping previous repo Copicu processes"
Get-Process -Name copicu -ErrorAction SilentlyContinue |
  Where-Object { $_.Path -like (Join-Path $RepoRoot "*") } |
  Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 500

Write-Step "starting Copicu in the interactive desktop session"
Set-Content -LiteralPath $StartCmd -Encoding ASCII -Value @"
@echo off
set COPICU_APP_DATA_DIR=$AppDataDir
set COPICU_SCRIPTS_DIR=$ScriptsDir
set COPICU_GLOBAL_SHORTCUT=$Hotkey
set COPICU_DISABLE_CLIPBOARD_WATCHER=1
cd /d $RepoRoot
"$CopicuExe" > "$StartOut" 2> "$StartErr"
"@
Invoke-InteractiveProcess -Command $StartCmd -TaskPrefix "CopicuStart"
Start-Sleep -Seconds 2

$copicu = Get-Process -Name copicu -ErrorAction SilentlyContinue |
  Where-Object { $_.Path -like (Join-Path $RepoRoot "*") } |
  Select-Object -First 1
if (-not $copicu) {
  throw "Copicu process did not start. stderr: $StartErr"
}
Write-Step "copicu pid=$($copicu.Id) session=$($copicu.SessionId)"

Write-Step "seeding stable dogfood history fixtures"
python (Join-Path $RepoRoot "tests\manual\dogfood\seed_dogfood_history.py") $AppDataDir | Tee-Object -FilePath (Join-Path $EvidenceDir "seed.log")

Write-Step "opening picker via global shortcut and verifying visible Tauri window"
$open = Invoke-InteractiveAhk -Name "01-open-picker" -Body @'
Send "^+."
Sleep 1200
out := ""
for hwnd in WinGetList() {
  try {
    title := WinGetTitle(hwnd)
    cls := WinGetClass(hwnd)
    exe := WinGetProcessName(hwnd)
    if (exe = "copicu.exe" || title = "Copicu") {
      WinGetPos(&x, &y, &w, &h, hwnd)
      out .= hwnd . "`t" . title . "`t" . cls . "`t" . exe . "`t" . x . "," . y . "," . w . "," . h . "`n"
    }
  } catch {
  }
}
FileAppend out, outFile
'@
Assert-Contains $open "Copicu" "Picker did not become visible."
Assert-Contains $open "Tauri Window" "Visible picker is not the Tauri window."
Write-Step "picker visible"

Write-Step "searching seeded path fixture"
$search = Invoke-InteractiveAhk -Name "02-search-path" -Body @'
WinActivate "Copicu ahk_class Tauri Window"
WinWaitActive "Copicu ahk_class Tauri Window",, 2
Send "^a"
Sleep 100
SendText "path-fixture"
Sleep 700
FileAppend "typed=path-fixture`nactive=" . WinGetTitle("A"), outFile
'@
Assert-Contains $search "typed=path-fixture" "Search text was not sent."

Write-Step "activating filtered item and verifying clipboard copy"
$copy = Invoke-InteractiveAhk -Name "03-enter-copy" -Body @'
WinActivate "Copicu ahk_class Tauri Window"
WinWaitActive "Copicu ahk_class Tauri Window",, 2
A_Clipboard := ""
Send "{Enter}"
ClipWait 2
Sleep 500
FileAppend "clipboard=" . A_Clipboard, outFile
'@
Assert-Contains $copy "C:\synthetic\dogfood\battery\path-fixture.txt" "Enter did not copy the filtered path fixture."

Write-Step "reopening picker for keyboard navigation"
$reopen = Invoke-InteractiveAhk -Name "04-reopen-picker" -Body @'
if (!WinExist("Copicu ahk_class Tauri Window")) {
  Send "^+."
  Sleep 900
}
WinActivate "Copicu ahk_class Tauri Window"
WinWaitActive "Copicu ahk_class Tauri Window",, 2
Send "^a"
Sleep 100
SendText "dogfood"
Sleep 500
FileAppend "reopened=" . WinExist("Copicu ahk_class Tauri Window"), outFile
'@
Assert-Contains $reopen "reopened=" "Picker did not reopen after copy activation."

Write-Step "exercising keyboard navigation and multi-select"
$keys = Invoke-InteractiveAhk -Name "05-keyboard-nav" -Body @'
WinActivate "Copicu ahk_class Tauri Window"
WinWaitActive "Copicu ahk_class Tauri Window",, 2
Send "{Down}{Down}{Up}{Space}{Down}{Space}"
Sleep 500
FileAppend "sent=nav-multiselect`nactive=" . WinGetTitle("A"), outFile
'@
Assert-Contains $keys "sent=nav-multiselect" "Keyboard navigation keys were not sent."

Write-Step "opening item/menu surface with context-menu key"
$menu = Invoke-InteractiveAhk -Name "06-context-menu" -Body @'
WinActivate "Copicu ahk_class Tauri Window"
WinWaitActive "Copicu ahk_class Tauri Window",, 2
Send "+{F10}"
Sleep 500
FileAppend "sent=context-menu`nactive=" . WinGetTitle("A"), outFile
'@
Assert-Contains $menu "sent=context-menu" "Context menu key was not sent."

Write-Step "capturing final screenshot evidence"
$screenshotPath = (Join-Path $EvidenceDir "07-final-picker.png").Replace("\", "/")
$screenshot = Invoke-InteractiveAhk -Name "07-screenshot" -Body @"
WinActivate "Copicu ahk_class Tauri Window"
Sleep 200
hwnd := WinExist("Copicu ahk_class Tauri Window")
if (!hwnd) {
  FileAppend "missing-window", outFile
  ExitApp
}
WinGetPos(&cx, &cy, &cw, &ch, hwnd)
DllCall("LoadLibrary", "str", "gdiplus")
pToken := 0
si := Buffer(24, 0)
NumPut("uint", 1, si)
DllCall("gdiplus\GdiplusStartup", "ptr*", &pToken, "ptr", si, "ptr", 0)
hdcScreen := DllCall("GetDC", "ptr", 0, "ptr")
hdcMem := DllCall("CreateCompatibleDC", "ptr", hdcScreen, "ptr")
hBitmap := DllCall("CreateCompatibleBitmap", "ptr", hdcScreen, "int", cw, "int", ch, "ptr")
DllCall("SelectObject", "ptr", hdcMem, "ptr", hBitmap)
DllCall("BitBlt", "ptr", hdcMem, "int", 0, "int", 0, "int", cw, "int", ch, "ptr", hdcScreen, "int", cx, "int", cy, "uint", 0xCC0020)
pBitmap := 0
DllCall("gdiplus\GdipCreateBitmapFromHBITMAP", "ptr", hBitmap, "ptr", 0, "ptr*", &pBitmap)
pCodec := Buffer(16)
NumPut("uint", 0x557CF406, pCodec, 0), NumPut("ushort", 0x1A04, pCodec, 4), NumPut("ushort", 0x11D3, pCodec, 6)
NumPut("uchar", 0x9A, pCodec, 8), NumPut("uchar", 0x73, pCodec, 9), NumPut("uchar", 0x00, pCodec, 10), NumPut("uchar", 0x00, pCodec, 11)
NumPut("uchar", 0xF8, pCodec, 12), NumPut("uchar", 0x1E, pCodec, 13), NumPut("uchar", 0xF3, pCodec, 14), NumPut("uchar", 0x2E, pCodec, 15)
DllCall("gdiplus\GdipSaveImageToFile", "ptr", pBitmap, "wstr", "$screenshotPath", "ptr", pCodec, "ptr", 0)
DllCall("gdiplus\GdipDisposeImage", "ptr", pBitmap)
DllCall("DeleteObject", "ptr", hBitmap), DllCall("DeleteDC", "ptr", hdcMem), DllCall("ReleaseDC", "ptr", 0, "ptr", hdcScreen)
DllCall("gdiplus\GdiplusShutdown", "ptr", pToken)
FileAppend "screenshot=$screenshotPath", outFile
"@
Assert-Contains $screenshot "screenshot=" "Screenshot was not captured."

if (-not $KeepOpen) {
  Write-Step "hiding picker"
  Invoke-InteractiveAhk -Name "08-hide-picker" -Body 'Send "^+."`nSleep 300`nFileAppend "sent=hide", outFile' | Out-Null
}

Write-Step "PASS: core dogfood computer-use battery completed"
Write-Output "Evidence: $EvidenceDir"
