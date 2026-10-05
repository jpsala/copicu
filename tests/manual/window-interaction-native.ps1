param([switch] $ValidateOnly)

# JSON-lines helper for validate-window-interaction.mjs. It owns one synthetic
# TextBox; it never reads another process's window title or clipboard payload.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading.Tasks;
namespace Copicu.WindowInteractionNative {
  public sealed class WindowInfo {
    public string Hwnd; public uint Pid; public string Title;
    public bool Visible; public bool Topmost; public bool Minimized;
    public int ZIndex; public int[] Bounds;
  }
  public sealed class Snapshot {
    public string Foreground; public uint ForegroundPid; public WindowInfo[] Windows;
  }
  public static class Native {
    public static Task<string> ReadNext() { return Task.Factory.StartNew(() => Console.ReadLine()); }
    [StructLayout(LayoutKind.Sequential)] struct Rect { public int Left, Top, Right, Bottom; }
    [StructLayout(LayoutKind.Sequential)] struct MouseInput {
      public int X, Y; public uint Data, Flags, Time; public UIntPtr Extra;
    }
    [StructLayout(LayoutKind.Sequential)] struct KeyboardInput {
      public ushort Vk, Scan; public uint Flags, Time; public UIntPtr Extra;
    }
    [StructLayout(LayoutKind.Explicit)] struct InputUnion {
      [FieldOffset(0)] public MouseInput Mouse;
      [FieldOffset(0)] public KeyboardInput Keyboard;
    }
    [StructLayout(LayoutKind.Sequential)] struct Input { public uint Type; public InputUnion Data; }
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint p);
    [DllImport("user32.dll")] static extern IntPtr GetTopWindow(IntPtr h);
    [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr h, uint cmd);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
    [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
    [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out Rect r);
    [DllImport("user32.dll", SetLastError=true)] static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int w, int height, uint flags);
    [DllImport("user32.dll", EntryPoint="GetWindowLongW")] static extern int GetWindowLong(IntPtr h, int i);
    [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
    [DllImport("user32.dll")] static extern bool BringWindowToTop(IntPtr h);
    [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h, int cmd);
    [DllImport("user32.dll")] static extern bool PostMessage(IntPtr h, uint message, IntPtr w, IntPtr l);
    [DllImport("user32.dll")] static extern IntPtr SetFocus(IntPtr h);
    [DllImport("user32.dll")] static extern bool AttachThreadInput(uint a, uint b, bool attach);
    [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
    [DllImport("user32.dll", SetLastError=true)] static extern uint SendInput(uint n, Input[] input, int size);
    [DllImport("user32.dll")] public static extern int CountClipboardFormats();
    [DllImport("user32.dll")] public static extern uint GetClipboardSequenceNumber();
    [DllImport("user32.dll")] static extern bool OpenClipboard(IntPtr h);
    [DllImport("user32.dll")] static extern bool EmptyClipboard();
    [DllImport("user32.dll")] static extern bool CloseClipboard();
    public static uint Pid(IntPtr h) { uint p; GetWindowThreadProcessId(h, out p); return p; }
    public static Snapshot Inspect(uint appPid, uint fixturePid) {
      var rows = new List<WindowInfo>(); var foreground = GetForegroundWindow();
      var seen = new HashSet<IntPtr>(); int z = 0;
      for (IntPtr h = GetTopWindow(IntPtr.Zero); h != IntPtr.Zero && seen.Add(h); h = GetWindow(h, 2), z++) {
        uint p = Pid(h); if (p != appPid && p != fixturePid) continue;
        var title = new StringBuilder(512); GetWindowText(h, title, title.Capacity);
        Rect r; GetWindowRect(h, out r);
        rows.Add(new WindowInfo { Hwnd=h.ToInt64().ToString(), Pid=p, Title=title.ToString(),
          Visible=IsWindowVisible(h), Topmost=(GetWindowLong(h,-20)&8)!=0, Minimized=IsIconic(h),
          ZIndex=z, Bounds=new int[] {r.Left,r.Top,r.Right-r.Left,r.Bottom-r.Top} });
      }
      return new Snapshot { Foreground=foreground.ToInt64().ToString(), ForegroundPid=Pid(foreground), Windows=rows.ToArray() };
    }
    public static void Focus(IntPtr h) {
      uint ignored; uint current=GetCurrentThreadId();
      uint target=GetWindowThreadProcessId(h,out ignored), fg=GetWindowThreadProcessId(GetForegroundWindow(),out ignored);
      bool a=fg!=0 && fg!=current && AttachThreadInput(current,fg,true);
      bool b=target!=0 && target!=current && target!=fg && AttachThreadInput(current,target,true);
      try { ShowWindow(h,9); BringWindowToTop(h); SetFocus(h); SetForegroundWindow(h); }
      finally { if(b) AttachThreadInput(current,target,false); if(a) AttachThreadInput(current,fg,false); }
    }
    public static void MoveOwned(IntPtr h, uint appPid, int x, int y, int width, int height) {
      if(Pid(h)!=appPid || appPid==0) throw new Exception("Move refused for a foreign HWND.");
      if(!SetWindowPos(h,IntPtr.Zero,x,y,width,height,0x0014)) throw new Exception("Owned window move failed.");
    }
    public static void MinimizeOwned(IntPtr h, uint appPid) {
      if(Pid(h)!=appPid || appPid==0) throw new Exception("Minimize refused for a foreign HWND.");
      ShowWindow(h,6);
    }
    public static void CloseOwned(IntPtr h, uint appPid) {
      if(Pid(h)!=appPid || appPid==0) throw new Exception("Close refused for a foreign HWND.");
      if(!PostMessage(h,0x0010,IntPtr.Zero,IntPtr.Zero)) throw new Exception("Owned window close failed.");
    }
    static Input Key(ushort vk, ushort scan, uint flags) {
      return new Input { Type=1, Data=new InputUnion { Keyboard=new KeyboardInput { Vk=vk, Scan=scan, Flags=flags } } };
    }
    static void Send(Input[] input) {
      if(SendInput((uint)input.Length,input,Marshal.SizeOf(typeof(Input)))!=input.Length)
        throw new Exception("SendInput failed: "+Marshal.GetLastWin32Error());
    }
    public static void Hotkey() {
      Send(new Input[] {Key(0x11,0,0),Key(0x10,0,0),Key(0x79,0,0),Key(0x79,0,2),Key(0x10,0,2),Key(0x11,0,2)});
    }
    public static void Text(string text) {
      var input=new List<Input>(); foreach(char ch in text) { input.Add(Key(0,ch,4)); input.Add(Key(0,ch,6)); } Send(input.ToArray());
    }
    public static void ClearSyntheticClipboard() {
      if(!OpenClipboard(IntPtr.Zero)) throw new Exception("clipboard busy during synthetic cleanup");
      try { if(!EmptyClipboard()) throw new Exception("synthetic clipboard cleanup failed"); } finally { CloseClipboard(); }
    }
  }
}
'@
if ($ValidateOnly) { Write-Output 'Native helper compiles; no window or app launched.'; return }

function Write-Protocol($Value) {
  [Console]::Out.WriteLine(($Value | ConvertTo-Json -Depth 12 -Compress))
  [Console]::Out.Flush()
}
$script:appProcessId = 0
$script:pasteArmed = $false
$script:pasteSequence = $null
$form = New-Object System.Windows.Forms.Form
$form.Text = 'Copicu Synthetic Window Interaction Target'
$form.Width = 660
$form.Height = 400
$form.StartPosition = 'CenterScreen'
$textBox = New-Object System.Windows.Forms.TextBox
$textBox.Multiline = $true
$textBox.AcceptsReturn = $true
$textBox.AcceptsTab = $true
$textBox.Dock = 'Fill'
$form.Controls.Add($textBox)
$form.Add_Shown({
  $textBox.Focus() | Out-Null
  Write-Protocol @{ ready = $true; pid = $PID; hwnd = $form.Handle.ToInt64().ToString() }
})
$script:pendingRead = [Copicu.WindowInteractionNative.Native]::ReadNext()
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 30
$timer.Add_Tick({
  if (-not $script:pendingRead.IsCompleted) { return }
  $line = $script:pendingRead.GetAwaiter().GetResult()
  if ($null -eq $line) { $form.Close(); return }
  $script:pendingRead = [Copicu.WindowInteractionNative.Native]::ReadNext()
  try {
    $request = $line | ConvertFrom-Json
    switch ($request.command) {
      'inspect' {
        $script:appProcessId = [uint32]$request.appPid
        $value = [Copicu.WindowInteractionNative.Native]::Inspect($script:appProcessId, $PID)
      }
      'focusExternal' {
        [Copicu.WindowInteractionNative.Native]::Focus($form.Handle)
        $textBox.Focus() | Out-Null
        $value = @{ hwnd = $form.Handle.ToInt64().ToString() }
      }
      'hotkey' {
        if ([Copicu.WindowInteractionNative.Native]::GetForegroundWindow() -ne $form.Handle) {
          throw 'Hotkey requires the owned synthetic external window foreground.'
        }
        [Copicu.WindowInteractionNative.Native]::Hotkey()
        $value = @{ sent = $true }
      }
      'typeGlobal' {
        $foreground = [Copicu.WindowInteractionNative.Native]::GetForegroundWindow()
        if ($foreground.ToInt64().ToString() -ne [string]$request.expectedHwnd -or
            [Copicu.WindowInteractionNative.Native]::Pid($foreground) -ne [uint32]$request.appPid) {
          throw 'Global input refused: foreground changed from the owned picker.'
        }
        if ([string]$request.text -notmatch '^COPICU_SYNTH_[A-Za-z0-9_]+$') { throw 'Only synthetic tokens are accepted.' }
        [Copicu.WindowInteractionNative.Native]::Text([string]$request.text)
        $value = @{ sent = $true }
      }
      'externalText' { $value = @{ text = $textBox.Text } }
      'clearExternal' { $textBox.Clear(); $value = @{ cleared = $true } }
      'moveOwned' {
        [Copicu.WindowInteractionNative.Native]::MoveOwned([IntPtr][long]$request.hwnd, $script:appProcessId,
          [int]$request.bounds[0], [int]$request.bounds[1], [int]$request.bounds[2], [int]$request.bounds[3])
        $value = @{ moved = $true }
      }
      'minimizeOwned' {
        [Copicu.WindowInteractionNative.Native]::MinimizeOwned([IntPtr][long]$request.hwnd, $script:appProcessId)
        $value = @{ minimized = $true }
      }
      'closeOwned' {
        [Copicu.WindowInteractionNative.Native]::CloseOwned([IntPtr][long]$request.hwnd, $script:appProcessId)
        $value = @{ closed = $true }
      }
      'armPaste' {
        if ([Copicu.WindowInteractionNative.Native]::CountClipboardFormats() -ne 0) {
          throw 'Optional paste requires an initially empty clipboard; no payload was read or changed.'
        }
        $script:pasteArmed = $true
        $value = @{ armed = $true }
      }
      'markPaste' {
        if (-not $script:pasteArmed) { throw 'Paste was not armed on an empty clipboard.' }
        $script:pasteSequence = [Copicu.WindowInteractionNative.Native]::GetClipboardSequenceNumber()
        $value = @{ sequence = $script:pasteSequence }
      }
      'stop' {
        $cleared = $false
        if ($null -ne $script:pasteSequence -and
            [Copicu.WindowInteractionNative.Native]::GetClipboardSequenceNumber() -eq $script:pasteSequence) {
          [Copicu.WindowInteractionNative.Native]::ClearSyntheticClipboard()
          $cleared = $true
        }
        $value = @{ stopped = $true; syntheticClipboardCleared = $cleared }
      }
      default { throw 'Unknown native helper command.' }
    }
    Write-Protocol @{ id = $request.id; ok = $true; value = $value }
    if ($request.command -eq 'stop') { $form.Close() }
  } catch { Write-Protocol @{ id = $request.id; ok = $false; error = $_.Exception.Message } }
})
$timer.Start()
try { [System.Windows.Forms.Application]::Run($form) }
finally { $timer.Stop(); $timer.Dispose(); $form.Dispose() }
