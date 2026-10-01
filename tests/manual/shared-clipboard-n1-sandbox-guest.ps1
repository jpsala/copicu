[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('Prepare', 'Clipboard', 'Custody', 'VerifyClipboard', 'VerifyCustody')]
  [string] $Mode,
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[A-Za-z0-9-]{1,48}$')]
  [string] $RunId
)

# Only for the disposable guest; never invoke this script on the host.
$ErrorActionPreference = 'Stop'
$n1GuestRoot = 'C:\dev\copicu'
$n1Input = 'C:\N1Input'
$n1Results = 'C:\N1Results'
$n1Label = 'JP-Windows-Sandbox'
try {
  if ($env:USERNAME -ne 'WDAGUtilityAccount' -or $PSScriptRoot -ne $n1Input) {
    throw 'This runner requires the approved Sandbox guest and read-only input mapping'
  }
  if ($Mode -eq 'Prepare') {
    if (Test-Path -LiteralPath $n1GuestRoot) { throw 'Guest checkout boundary already exists' }
    if (Test-Path -LiteralPath $n1Results) { throw 'Guest results directory already exists' }
    # Fail before native work if the input mapping permits writes.
    $n1UnexpectedWrite = $false
    try {
      $null = New-Item -ItemType File -Path (Join-Path $n1Input 'readonly-probe') -ErrorAction Stop
      $n1UnexpectedWrite = $true
    } catch [System.UnauthorizedAccessException] { }
    if ($n1UnexpectedWrite) { throw 'Input mapping is writable; reject this guest' }
    if (@(Get-NetAdapter -ErrorAction Stop | Where-Object Status -eq 'Up').Count -ne 0) {
      throw 'Guest has an active network adapter'
    }
    $n1Manifest = Get-Content -LiteralPath (Join-Path $n1Input 'manifest.json') -Raw | ConvertFrom-Json
    foreach ($n1File in @('shared-clipboard-n1.exe', 'run-shared-clipboard-n1.ps1')) {
      if ((Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $n1Input $n1File)).Hash -ne $n1Manifest.$n1File) {
        throw 'Guest package hash mismatch'
      }
    }
    $null = New-Item -ItemType Directory -Path "$n1GuestRoot\tests\manual", "$n1GuestRoot\src-tauri\target-codex-n1\debug", $n1Results
    Copy-Item -LiteralPath "$n1Input\shared-clipboard-n1.exe" -Destination "$n1GuestRoot\src-tauri\target-codex-n1\debug\shared-clipboard-n1.exe"
    Copy-Item -LiteralPath "$n1Input\run-shared-clipboard-n1.ps1" -Destination "$n1GuestRoot\tests\manual\run-shared-clipboard-n1.ps1"
    Set-Content -LiteralPath "$n1Results\owner" -Value $RunId -NoNewline
    exit 0
  }
  if ((Get-Content -LiteralPath "$n1Results\owner" -Raw) -ne $RunId) { throw 'Guest run ownership mismatch' }
  $n1Matrix = $Mode -replace '^Verify', ''
  $n1Expected = if ($n1Matrix -eq 'Clipboard') {
    @('clipboard-owner-unicode-snapshot', 'clipboard-marker-and-identical-recopy',
      'clipboard-busy-bounded-and-released', 'clipboard-final-guard-local-recopy',
      'clipboard-pause-before-and-during-write', 'clipboard-before-empty-no-restore',
      'clipboard-after-empty-no-restore', 'clipboard-after-text-no-restore',
      'clipboard-delayed-fence', 'clipboard-delayed-timeout-confirmed-exit-no-replay',
      'clipboard-crash-uncertain-confirmed-exit-no-replay')
  } else {
    @('custody-roundtrip', 'custody-helper-restart', 'custody-wrong-binding',
      'custody-missing-version', 'custody-tamper-truncation', 'custody-same-user-copy-limitation')
  }
  $n1Log = "$n1Results\$n1Matrix.log"
  $n1Marker = "$n1Results\$n1Matrix.verified"
  if (-not $Mode.StartsWith('Verify')) {
    if (Test-Path -LiteralPath $n1Log) { throw 'Matrix already attempted; no automatic replay' }
    $n1Permit = if ($n1Matrix -eq 'Clipboard') { '-AllowClipboardMutation' } else { '-AllowSyntheticSecrets' }
    $n1Process = New-Object System.Diagnostics.Process
    $n1Process.StartInfo.FileName = "$env:WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe"
    $n1Process.StartInfo.Arguments = "-NoProfile -ExecutionPolicy RemoteSigned -File $n1GuestRoot\tests\manual\run-shared-clipboard-n1.ps1 -Mode $n1Matrix -RunId $RunId-$n1Matrix -SessionLabel $n1Label $n1Permit"
    $n1Process.StartInfo.UseShellExecute = $false
    $n1Process.StartInfo.CreateNoWindow = $true
    $n1Process.StartInfo.RedirectStandardOutput = $true
    $n1Process.StartInfo.RedirectStandardError = $true
    $null = $n1Process.Start()
    $n1Output = $n1Process.StandardOutput.ReadToEndAsync()
    $n1Errors = $n1Process.StandardError.ReadToEndAsync()
    if (-not $n1Process.WaitForExit(45000)) {
      # The host must stop its owned Sandbox; do not kill/replay an uncertain executor.
      Set-Content -LiteralPath $n1Log -Value 'OUTER WATCHDOG: settlement unconfirmed'
      exit 75
    }
    $n1Text = $n1Output.GetAwaiter().GetResult()
    $n1ErrorText = $n1Errors.GetAwaiter().GetResult()
    [IO.File]::WriteAllText($n1Log, $n1Text + $n1ErrorText)
    $n1Exit = $n1Process.ExitCode
    $n1Process.Dispose()
    if ($n1Exit -ne 0) { exit 73 }
  }
  $n1Lines = @(Get-Content -LiteralPath $n1Log)
  $n1Passes = @($n1Lines | Where-Object { $_ -like 'PASS *' })
  if (($n1Passes -join '|') -cne (($n1Expected | ForEach-Object { "PASS $_" }) -join '|')) {
    throw 'Matrix PASS names/count/order mismatch'
  }
  if (@($n1Lines | Where-Object { $_ -like "N1 ${n1Matrix}: $($n1Expected.Count) cases passed; helpers exited;*" }).Count -ne 1) {
    throw 'Missing native matrix settlement summary'
  }
  if (@($n1Lines | Where-Object { $_ -eq 'N1 run artifacts removed; previous clipboard was neither read nor restored' }).Count -ne 1) {
    throw 'Wrapper cleanup was not confirmed'
  }
  if (Test-Path -LiteralPath "$n1GuestRoot\.tmp\shared-clipboard-n1\$RunId-$n1Matrix") { throw 'Run artifacts remain' }
  if (@(Get-Process -Name shared-clipboard-n1 -ErrorAction SilentlyContinue).Count -ne 0) { throw 'Native harness processes remain' }
  Set-Content -LiteralPath $n1Marker -Value "$RunId $n1Matrix $($n1Expected.Count) passed; helpers exited; artifacts removed" -NoNewline
  exit 0
} catch {
  # These are public operational errors only; no clipboard or DPAPI data is logged.
  if (Test-Path -LiteralPath $n1Results) {
    Set-Content -LiteralPath "$n1Results\runner-error.txt" -Value $_.Exception.Message
  }
  exit 74
}
