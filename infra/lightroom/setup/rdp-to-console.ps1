# VTK Lightroom VM: puts the vtk session back on the console when an RDP window closes.
# Windows locks a session RDP lets go of, and Parsec, which streams the console, would then show
# the lock screen. Started as SYSTEM by the task "VTK RDP back to console" on every disconnect
# (event 24); tscon from SYSTEM needs no password, and the session lands on the console unlocked.
# A session RDP takes over is Active, not Disc, so this never pulls a session away from RDP.
Start-Sleep -Seconds 2
foreach ($line in (query session 2>$null)) {
  if ($line -match '\svtk\s+(\d+)\s+Disc\b') {
    & "$env:windir\System32\tscon.exe" $Matches[1] /dest:console
  }
}
