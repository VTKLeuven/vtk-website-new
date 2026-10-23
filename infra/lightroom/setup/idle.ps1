# VTK Lightroom VM: tells the host how long nobody has touched this desktop.
# Runs in the logged-on user's session (scheduled task at logon), because only there does
# GetLastInputInfo see the input Parsec injects. Every 20 s it writes C:\ProgramData\vtk\idle.json,
# which kenny reads through the QEMU guest agent; `seq` lets the host notice a reporter that died.
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class VtkIdle {
  [StructLayout(LayoutKind.Sequential)]
  struct LASTINPUTINFO { public uint cbSize; public uint dwTime; }
  [DllImport("user32.dll")]
  static extern bool GetLastInputInfo(ref LASTINPUTINFO info);
  public static uint IdleMs() {
    var info = new LASTINPUTINFO();
    info.cbSize = (uint)Marshal.SizeOf(info);
    GetLastInputInfo(ref info);
    return unchecked((uint)Environment.TickCount - info.dwTime);
  }
}
'@

$dir = 'C:\ProgramData\vtk'
$out = Join-Path $dir 'idle.json'
$parsecLog = 'C:\ProgramData\Parsec\log.txt'
New-Item -ItemType Directory -Force $dir | Out-Null
$seq = 0

while ($true) {
  $seq++
  # Who Parsec says is connected, from the tail of its log (best effort, informational only)
  $connected = @{}
  if (Test-Path $parsecLog) {
    Get-Content $parsecLog -Tail 400 -ErrorAction SilentlyContinue | ForEach-Object {
      if ($_ -match '(\S+#\d+) (connected|disconnected)\.') {
        if ($Matches[2] -eq 'connected') { $connected[$Matches[1]] = $true } else { $connected.Remove($Matches[1]) }
      }
    }
  }
  $state = [ordered]@{
    seq = $seq
    idle_seconds = [math]::Floor([VtkIdle]::IdleMs() / 1000)
    parsec_users = @($connected.Keys)
  }
  $tmp = "$out.tmp"
  [IO.File]::WriteAllText($tmp, ($state | ConvertTo-Json -Compress))
  Move-Item -Force $tmp $out
  Start-Sleep -Seconds 20
}
