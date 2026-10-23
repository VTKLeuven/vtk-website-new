# VTK Lightroom VM: first logon after the unattended install. Runs once, from the VTKSETUP CD.
# Leaves C:\ProgramData\vtk\firstlogon.done when it is finished; kenny waits for that file.
$ErrorActionPreference = 'Continue'
$vtk = 'C:\ProgramData\vtk'
New-Item -ItemType Directory -Force $vtk | Out-Null
Start-Transcript -Path "$vtk\firstlogon.log" -Append

$cfg = (Get-Volume -FileSystemLabel VTKSETUP).DriveLetter + ':'
$virtio = (Get-Volume | Where-Object FileSystemLabel -like 'virtio-win*' | Select-Object -First 1).DriveLetter + ':'
Write-Host "setup CD $cfg, virtio CD $virtio"

# 1. virtio drivers (network, balloon, serial) and the QEMU guest agent kenny talks to
Start-Process "$virtio\virtio-win-guest-tools.exe" -ArgumentList '/install', '/passive', '/norestart' -Wait
Write-Host 'virtio guest tools installed'

# 2. Power: never sleep or lock on its own; hibernation on, because kenny hibernates this VM
#    when nobody uses it (to give the GPU back to vLLM)
powercfg /change standby-timeout-ac 0
powercfg /change monitor-timeout-ac 0
powercfg /change hibernate-timeout-ac 0
powercfg /hibernate on
powercfg /h /type full
powercfg /setacvalueindex SCHEME_CURRENT SUB_NONE CONSOLELOCK 0
powercfg /setactive SCHEME_CURRENT
reg add 'HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Power' /v HiberbootEnabled /t REG_DWORD /d 0 /f
reg add 'HKLM\SOFTWARE\Policies\Microsoft\Windows\Personalization' /v NoLockScreen /t REG_DWORD /d 1 /f
reg add 'HKCU\Control Panel\Desktop' /v ScreenSaveActive /t REG_SZ /d 0 /f

# 3. Windows Update may install, but never restarts while someone is logged on
reg add 'HKLM\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate\AU' /v NoAutoRebootWithLoggedOnUsers /t REG_DWORD /d 1 /f

# 4. The idle reporter, in the user's session at every logon
Copy-Item "$cfg\idle.ps1" "$vtk\idle.ps1" -Force
$action = New-ScheduledTaskAction -Execute 'conhost.exe' -Argument "--headless powershell.exe -NoProfile -ExecutionPolicy Bypass -File $vtk\idle.ps1"
$trigger = New-ScheduledTaskTrigger -AtLogOn -User 'vtk'
$principal = New-ScheduledTaskPrincipal -UserId 'vtk' -LogonType Interactive
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName 'VTK idle reporter' -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force
Start-ScheduledTask -TaskName 'VTK idle reporter'

# 5. OpenSSH server, reachable from kenny only (key in administrators_authorized_keys)
for ($i = 0; $i -lt 60 -and -not (Test-Connection 1.1.1.1 -Count 1 -Quiet); $i++) { Start-Sleep 5 }
Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0
Copy-Item "$cfg\authorized_keys" 'C:\ProgramData\ssh\administrators_authorized_keys' -Force
icacls.exe 'C:\ProgramData\ssh\administrators_authorized_keys' /inheritance:r /grant 'Administrators:F' /grant 'SYSTEM:F'
New-ItemProperty -Path 'HKLM:\SOFTWARE\OpenSSH' -Name DefaultShell -Value 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe' -PropertyType String -Force
Set-Service sshd -StartupType Automatic
Start-Service sshd
# Windows calls libvirt's NAT network Public, and the OpenSSH rule only covers Private
Get-NetConnectionProfile | Set-NetConnectionProfile -NetworkCategory Private
Get-NetFirewallRule -Name 'OpenSSH-Server-In-TCP' -ErrorAction SilentlyContinue | Set-NetFirewallRule -Profile Any -Enabled True

# 6. Parsec streams the console, so the console must always show the desktop: logging off logs
#    vtk straight back on, and closing an RDP window puts the session back on the console
reg add 'HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon' /v ForceAutoLogon /t REG_SZ /d 1 /f
Copy-Item "$cfg\rdp-to-console.ps1" "$vtk\rdp-to-console.ps1" -Force
$log = 'Microsoft-Windows-TerminalServices-LocalSessionManager/Operational'
$trigger = New-CimInstance -ClientOnly -CimClass (Get-CimClass -Namespace ROOT\Microsoft\Windows\TaskScheduler -ClassName MSFT_TaskEventTrigger) -Property @{
  Enabled = $true
  Subscription = "<QueryList><Query Id='0' Path='$log'><Select Path='$log'>*[System[EventID=24]]</Select></Query></QueryList>"
}
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File $vtk\rdp-to-console.ps1"
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Minutes 1) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances Queue
Register-ScheduledTask -TaskName 'VTK RDP back to console' -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force

'done' | Out-File "$vtk\firstlogon.done"
Stop-Transcript
# drivers from the guest tools want a restart
shutdown.exe /r /t 15 /c 'VTK setup finished'
