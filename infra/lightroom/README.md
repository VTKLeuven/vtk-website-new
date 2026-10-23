# Lightroom PC on kenny

A Windows 11 VM (`lightroom`) on kenny for the communications team: Lightroom over Parsec, on
kenny's GPU 0 (RTX 3090, `0000:81:00.0`). The GPU is lent, not given: while the VM runs, vLLM
(llm.vtk.be) and comfy-worker-0 are stopped; when nobody has used the VM for `IDLE_MINUTES`
(30), Windows hibernates and they come back. Hibernation keeps everything that was open, so the
next start resumes where the last person left off.

People start it from the site, `/admin/lightroom` (permission `lightroom.use`), and connect with
Parsec. Product choices: `docs/design-decisions.md` ("De Lightroom-pc").

These files are what runs on kenny; the table at the bottom says where each one goes.

## How the pieces fit

```text
/admin/lightroom (liv)  --Tailscale-->  lightroom-api (kenny, user lightroom-api)
                                          | sudo, exactly three commands
                                          v
                                        lightroom-vm start|stop|status  <--  lightroom-vm-watch
                                          | libvirt + docker + nvidia-smi        (idle -> hibernate)
                                          v
                                        VM "lightroom" with GPU 0  <--  Parsec  <--  your laptop
```

- **The site** talks to `lightroom-api` over Tailscale with a Bearer token, like the door Pi.
  Configure it under Admin -> IT -> Lightroom PC: address `http://100.114.7.25:8765`, token
  from `sudo cat /etc/lightroom-vm/api-token` on kenny, and the Parsec account of the VM.
- **lightroom-api** listens only on kenny's Tailscale address and may run `lightroom-vm status
  --json`, `start --by-stdin` and `stop --by-stdin` through sudo, nothing else. `--by-stdin` reads
  the name of whoever pressed the button, for the log and the status.
- **lightroom-vm** does the handover. `status --json` returns `state`, `ready` (Windows answers
  the guest agent), `can_start`, `blockers` (sentences) and `blocker_codes` (`job`, `gpu_in_use`,
  `comfy_busy`, `memory`, `gpu_detached`, `maintenance`, `check_failed`; the site words those),
  `started_by`, `parsec_users`, `hibernate_in_minutes`, `idle_limit_minutes`.
- **Parsec** runs as a Windows service with its virtual display (the VM has no monitor).
  People connect with their own Parsec account, which the VM's account (`vtk_it`) has as a friend
  with keyboard, mouse and "Can connect without your approval". A share link would need someone
  at the VM to accept every connection.

## Using it on kenny

    sudo lightroom-vm status        # state, idle time, why a start would be refused
    sudo lightroom-vm start         # stop vLLM + comfy-worker-0, give GPU 0 to the VM, boot it
    sudo lightroom-vm stop          # hibernate Windows, give GPU 0 back, start vLLM again

A start takes about a minute on kenny (stopping containers, detaching the GPU), then about 2.5
minutes before Windows answers (UEFI firmware with the GPU attached; also on a cold boot).
Hibernating takes about 20 seconds.

Maintenance that needs a screen (Parsec or Adobe sign-in, repairs), two ways:

- **RDP**, with the VM running normally: `ssh -N -L 13389:192.168.122.50:3389 kenny`, then
  `localhost:13389` in Windows App, user `vtk`, password `sudo cat /etc/lightroom-vm/windows-password`.
  Closing the RDP window puts the session back on the console (scheduled task "VTK RDP back to
  console", `setup/rdp-to-console.ps1`), so Parsec shows the desktop and not the lock screen.
- **VNC console**, the VM without GPU:

      sudo lightroom-vm console on    # the VM without GPU, a screen on VNC 127.0.0.1:5911
      ssh -L 5911:127.0.0.1:5911 kenny   # on your laptop, then open vnc://localhost:5911
      sudo cat /etc/lightroom-vm/vnc-password
      sudo lightroom-vm console off   # shut down, GPU definition back

  Start the console only after a full shutdown. A Windows hibernated with the GPU cannot resume
  without it: Windows then offers to throw the hibernated session away.

Windows logs `vtk` on automatically, also after a sign-out (`ForceAutoLogon`), because Parsec
streams the console session.

## Adding someone

1. They install Parsec and create a free account.
2. In Parsec signed in as the VM's account (on the VM, or any Parsec app signed in as it), Friends
   -> Add Friend, then click the friend and enable Keyboard, Mouse and "Can connect without your
   approval".
3. Give their post (or them) `lightroom.use` in /admin/roles. The seed gives it to the
   Communicatie post role.

To remove someone: unfriend them in Parsec and take the permission away.

## What it will not do

- Take GPU 0 while any process has it open. CUDA opens every GPU, so a job on `--device 1`
  blocks it too. Unbinding a GPU the nvidia driver still serves hangs in the kernel and takes
  every GPU job down with it.
- Start while a seg or render job runs (`JOB_PIDFILES`): those use both GPUs.
- Start when kenny would have less than `RAM_MARGIN_GB` free after the VM's 16 GB.
- Start a vLLM it did not stop, or start vLLM while a GPU job runs (the job's own rule).

If kenny runs out of memory anyway, the VM dies first (`oom_score_adj` 1000, the seg training
queues use 500).

## For job scripts and containers

`/run/lightroom-vm/active` exists while the VM holds GPU 0. A job that needs both GPUs should
refuse to start while it is there, as it does while another job runs.

While GPU 0 is with the VM, kenny sees one GPU, and it is index 0. Containers that pick a GPU by
index (`DeviceIDs: ["1"]`, comfy-worker-1, whishper) keep running, but would fail to start in
that window; picking the GPU by UUID avoids that.

## Inside Windows

`C:\ProgramData\vtk\idle.ps1` runs at logon and writes `idle.json` (seconds since the last
keyboard or mouse input, and who Parsec says is connected) every 20 s; the watcher reads it
through the QEMU guest agent. The VM counts as busy while it uses more than `BUSY_CPU_PERCENT`
CPU (an export), so it does not hibernate in the middle of one.

Change the VM's hardware only when Windows is fully shut down, never while it is hibernated:
Windows resumes only onto the same hardware.

## Files

| In this folder | On kenny | What |
| --- | --- | --- |
| `lightroom-vm` | `/usr/local/bin/lightroom-vm` | start / stop / status / watch / console |
| `lightroom-api` | `/usr/local/bin/lightroom-api` | the site's API |
| `lightroom-vm-watch.service` | `/etc/systemd/system/` | idle -> hibernate; cleans up after a VM shut down from Windows |
| `lightroom-api.service` | `/etc/systemd/system/` | the API, as user `lightroom-api`, on the Tailscale address |
| `sudoers-lightroom-api` | `/etc/sudoers.d/lightroom-api` (mode 440) | the three commands the API may run |
| `lightroom-vm.conf` | `/etc/lightroom-vm/lightroom-vm.conf` | idle time, memory margin, job pid files |
| `lightroom.xml` | `/etc/lightroom-vm/lightroom.xml` | the VM with the GPU, its normal definition |
| `lightroom.console.xml` | `/etc/lightroom-vm/lightroom.console.xml` | the VM for maintenance: no GPU, VGA on VNC |
| `setup/` | `/etc/lightroom-vm/setup/` | the one-time install: unattended Windows, first-logon script, hooks |
| `setup/hook-network` | `/etc/libvirt/hooks/network` | lets the VM's NAT through Docker's FORWARD DROP |
| `setup/hook-qemu` | `/etc/libvirt/hooks/qemu` | OOM priority of the VM |

Secrets live only on kenny, in `/etc/lightroom-vm/` (root only): `windows-password`,
`vnc-password`, `api-token` (readable by group `lightroom-api`), `ssh_key` (kenny into the VM).

State is `/var/lib/lightroom-vm/state.json`, the log `/var/log/lightroom-vm.log`.

### Updating kenny from this folder

    scp lightroom-vm lightroom-api kenny:/tmp/
    ssh kenny 'sudo install -m 755 /tmp/lightroom-vm /tmp/lightroom-api /usr/local/bin/ &&
               sudo systemctl restart lightroom-vm-watch lightroom-api'

The watcher and the API are stateless; restarting them while the VM runs is safe.
