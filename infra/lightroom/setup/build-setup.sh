#!/bin/bash
# One-time setup of the Lightroom VM on kenny (run as root from the folder with these files).
# Makes the Windows password and the SSH key kenny uses to reach the VM, builds the VTKSETUP CD
# (autounattend.xml + first-logon scripts), creates the disk and defines the VM. Starts nothing.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
etc=/etc/lightroom-vm
img=/var/lib/libvirt/images
install -d -m 700 "$etc"
install -d -m 755 "$img/iso"

if [ ! -s "$etc/windows-password" ]; then
  (umask 077; python3 -c 'import secrets, string; a = string.ascii_letters + string.digits; print("".join(secrets.choice(a) for _ in range(20)), end="")' > "$etc/windows-password")
fi
[ -s "$etc/ssh_key" ] || ssh-keygen -q -t ed25519 -N '' -C 'lightroom-vm@kenny' -f "$etc/ssh_key"

build=$(mktemp -d)
trap 'rm -rf "$build"' EXIT
sed "s/@PASSWORD@/$(cat "$etc/windows-password")/g" "$here/autounattend.xml" > "$build/autounattend.xml"
cp "$here/firstlogon.ps1" "$here/idle.ps1" "$here/rdp-to-console.ps1" "$build/"
cp "$etc/ssh_key.pub" "$build/authorized_keys"
xorriso -as mkisofs -quiet -V VTKSETUP -J -joliet-long -r -o "$img/iso/lightroom-setup.iso" "$build"
chmod 600 "$img/iso/lightroom-setup.iso"   # holds the Windows password

[ -e "$img/lightroom.qcow2" ] || qemu-img create -q -f qcow2 -o cluster_size=64k "$img/lightroom.qcow2" 400G

install -m 755 "$here/hook-qemu" /etc/libvirt/hooks/qemu
install -m 755 "$here/hook-network" /etc/libvirt/hooks/network

virsh -q net-update default add ip-dhcp-host "<host mac='52:54:00:4c:52:01' name='lightroom' ip='192.168.122.50'/>" --live --config 2>/dev/null \
  || echo "(DHCP reservation for 192.168.122.50 already there)"
virsh -q define "$here/lightroom.setup.xml"
echo "defined: $(virsh domstate lightroom)"
