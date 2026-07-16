# Immich Remote Storage over Tailscale and NFS

This runbook stores Immich media on the 12 TB storage server while keeping the
Immich application, PostgreSQL, Redis/Valkey, machine learning, and the VTK
website on the cloud server.

## Server addresses

| Role | Tailscale IPv4 | Hostname used in this guide |
| --- | --- | --- |
| VTK cloud server | `100.90.8.74` | `vtk-cloud` |
| 12 TB storage server | `100.90.192.112` | `vtk-storage` |

The intended layout is:

```text
Cloud server (100.90.8.74)
├── VTK website and Caddy
├── Immich server, machine learning, and Valkey
├── Immich PostgreSQL on the local cloud SSD
└── /mnt/immich -> NFSv4 over Tailscale

Storage server (100.90.192.112)
└── /srv/storage/immich on the 12 TB filesystem
    ├── library
    ├── upload
    ├── thumbs
    ├── encoded-video
    ├── profile
    └── backups
```

> **Critical:** Never put the Immich PostgreSQL directory on NFS. Immich
> requires its database to use a local filesystem. Only Immich `/data` belongs
> on the remote share.

This guide assumes Ubuntu or Debian on both servers. It also assumes that the
12 TB filesystem is mounted at `/srv/storage` on the storage server. Verify that
assumption before creating anything.

## 1. Verify Tailscale on both servers

If Tailscale is not installed on either server, run this on that server:

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
```

On the cloud server:

```bash
sudo tailscale set --hostname=vtk-cloud
tailscale ip -4
```

The output must include:

```text
100.90.8.74
```

On the storage server:

```bash
sudo tailscale set --hostname=vtk-storage
tailscale ip -4
```

The output must include:

```text
100.90.192.112
```

In the Tailscale admin console, disable key expiry for both server nodes or
provision them as tagged server devices.

From the cloud server, check the path to the storage server:

```bash
tailscale ping 100.90.192.112
tailscale status
```

The connection should eventually report `direct`. Do not use NFS for Immich if
it remains on a `relay` or `DERP` connection; relay throughput is limited and
will make media access unreliable or slow.

## 2. Prepare the 12 TB storage server

Run this section on `vtk-storage` (`100.90.192.112`).

First inspect the available filesystems:

```bash
lsblk -f
df -hT
findmnt
```

Confirm that `/srv/storage` is actually located on the 12 TB filesystem:

```bash
df -hT /srv/storage
findmnt -T /srv/storage
```

Stop here if these commands do not show the 12 TB filesystem. Substitute the
real 12 TB mountpoint everywhere below before continuing.

Check whether numeric UID/GID `1999` are available:

```bash
getent passwd 1999 || true
getent group 1999 || true
```

If both commands return no entry, create a dedicated storage identity:

```bash
sudo groupadd --system --gid 1999 immich-storage
sudo useradd \
  --system \
  --uid 1999 \
  --gid 1999 \
  --home-dir /srv/storage/immich \
  --shell /usr/sbin/nologin \
  immich-storage
```

Create the Immich directory on the 12 TB filesystem:

```bash
sudo install \
  -d \
  -o 1999 \
  -g 1999 \
  -m 0770 \
  /srv/storage/immich
```

Create a marker used to ensure Docker never starts against an unmounted local
directory:

```bash
sudo -u immich-storage \
  touch /srv/storage/immich/.immich-storage-ready
```

Confirm the directory still reports the 12 TB filesystem:

```bash
df -hT /srv/storage/immich
ls -la /srv/storage/immich/.immich-storage-ready
```

## 3. Export the storage using NFSv4

Continue on the storage server:

```bash
sudo apt update
sudo apt install -y nfs-kernel-server
sudo systemctl enable --now nfs-kernel-server
```

Open `/etc/exports`:

```bash
sudoedit /etc/exports
```

Add this exact line:

```exports
/srv/storage/immich 100.90.8.74(rw,sync,no_subtree_check,all_squash,anonuid=1999,anongid=1999)
```

This restricts the export to the cloud server's Tailscale IP and maps all file
operations to the dedicated `immich-storage` identity. Apply it:

```bash
sudo exportfs -rav
sudo exportfs -v
sudo systemctl restart nfs-kernel-server
```

The output must show `/srv/storage/immich` exported to `100.90.8.74`.

If UFW is enabled, allow only NFSv4 from the cloud server over Tailscale:

```bash
sudo ufw allow in on tailscale0 \
  from 100.90.8.74 \
  to any port 2049 \
  proto tcp
sudo ufw status
```

Do not open TCP port `2049` on the public network.

### Optional Tailscale grant

If the tailnet uses restrictive grants, merge the following entries into the
existing Tailscale policy. Do not replace unrelated policy rules:

```json
{
  "hosts": {
    "vtk-cloud": "100.90.8.74",
    "vtk-storage": "100.90.192.112"
  },
  "grants": [
    {
      "src": ["vtk-cloud"],
      "dst": ["vtk-storage"],
      "ip": ["tcp:2049"]
    }
  ]
}
```

## 4. Mount the NFS share on the cloud server

Run this section on `vtk-cloud` (`100.90.8.74`):

```bash
sudo apt update
sudo apt install -y nfs-common
sudo mkdir -p /mnt/immich
```

Test a manual NFSv4.2 mount:

```bash
sudo mount \
  -t nfs4 \
  -o vers=4.2,proto=tcp,hard,timeo=600,retrans=2,noatime \
  100.90.192.112:/srv/storage/immich \
  /mnt/immich
```

If the server does not support NFS 4.2, retry with `vers=4.1`.

Verify the mount, marker, capacity, and write access:

```bash
findmnt /mnt/immich
df -hT /mnt/immich
ls -la /mnt/immich/.immich-storage-ready
sudo touch /mnt/immich/.nfs-write-test
sudo rm /mnt/immich/.nfs-write-test
```

`df` should report the capacity of the 12 TB filesystem.

## 5. Make the cloud mount persistent

Still on the cloud server, open `/etc/fstab`:

```bash
sudoedit /etc/fstab
```

Add this single line:

```fstab
100.90.192.112:/srv/storage/immich /mnt/immich nfs4 rw,vers=4.2,proto=tcp,hard,timeo=600,retrans=2,noatime,_netdev,x-systemd.automount,x-systemd.requires=tailscaled.service,x-systemd.after=tailscaled.service 0 0
```

Use `vers=4.1` here if the manual 4.2 mount did not work.

Test the persistent configuration:

```bash
sudo umount /mnt/immich
sudo systemctl daemon-reload
sudo mount /mnt/immich
findmnt /mnt/immich
ls -la /mnt/immich/.immich-storage-ready
```

The `hard` mount option is intentional. If the storage server temporarily
disappears, filesystem operations wait instead of silently losing or partially
writing media.

## 6. Make the Compose media path configurable

Make this change in the repository and commit it. Do not edit only the server
checkout because the deployment workflow resets it to `origin/main`.

In `infra/docker-compose.yml`, find the `immich-server` volume:

```yaml
- ./immich/data/library:/data
```

Replace it with:

```yaml
- ${IMMICH_MEDIA_LOCATION:-./immich/data/library}:/data
```

The complete volume section should be:

```yaml
immich-server:
  volumes:
    - ${IMMICH_MEDIA_LOCATION:-./immich/data/library}:/data
    - /etc/localtime:/etc/localtime:ro
```

Do not modify `immich-database`; its PostgreSQL bind mount must remain on the
cloud server's local disk.

On the cloud server, add this to the repository-root `.env`:

```dotenv
IMMICH_MEDIA_LOCATION=/mnt/immich
```

The root `.env` is ignored by Git and survives deployments.

## 7. Add a mount guard to deployment

In `.github/workflows/deploy.yml`, add the following checks immediately before
the Compose validation/build commands in the remote SSH script:

```bash
timeout 30 test -f /mnt/immich/.immich-storage-ready &&
test "$(findmnt -rn -M /mnt/immich -o FSTYPE)" = "nfs4" &&
```

The end of the SSH deployment script should look like this:

```bash
# Refuse deployment if the 12 TB NFS storage is unavailable.
timeout 30 test -f /mnt/immich/.immich-storage-ready &&
test "$(findmnt -rn -M /mnt/immich -o FSTYPE)" = "nfs4" &&

docker compose -f infra/docker-compose.yml config --quiet &&
docker compose -f infra/docker-compose.yml up -d --build --remove-orphans
```

This is essential: without the marker and filesystem-type checks, Docker could
start Immich against an empty local `/mnt/immich` directory after an NFS mount
failure, splitting media between the two servers.

## 8. Migrate existing Immich media

Run this section on the cloud server after the NFS mount works but before
switching Compose to it.

Enter the repository:

```bash
cd /home/it/vtk-website-new
```

Stop services that access Immich media:

```bash
docker compose -f infra/docker-compose.yml stop \
  immich-public-proxy \
  immich-server \
  immich-machine-learning
```

Keep `immich-database` running. Copy the media:

```bash
sudo rsync \
  -rlt \
  --no-owner \
  --no-group \
  --no-perms \
  --info=progress2 \
  infra/immich/data/library/ \
  /mnt/immich/
```

Verify with a checksum dry run:

```bash
sudo rsync \
  -rltcn \
  --no-owner \
  --no-group \
  --no-perms \
  infra/immich/data/library/ \
  /mnt/immich/
```

No output means all source files match. The remote marker is an extra
destination file and is intentionally retained.

Do not delete `infra/immich/data/library` yet; keep it for rollback.

## 9. Commit and deploy

Commit the Compose and deployment-guard changes from the development checkout:

```bash
git add infra/docker-compose.yml .github/workflows/deploy.yml
git commit -m "Store Immich media on remote NFS storage"
git push origin main
```

The GitHub deployment should now verify the NFS mount before rebuilding.

For a manual deployment on the cloud server:

```bash
cd /home/it/vtk-website-new
docker compose -f infra/docker-compose.yml config --quiet
docker compose -f infra/docker-compose.yml \
  up -d --build --remove-orphans
```

## 10. Verify the completed setup

On the cloud server:

```bash
docker compose -f infra/docker-compose.yml ps
docker compose -f infra/docker-compose.yml logs --tail=100 immich-server
```

Confirm the container sees the remote capacity:

```bash
docker compose -f infra/docker-compose.yml exec immich-server \
  df -h /data
```

Confirm it can write:

```bash
docker compose -f infra/docker-compose.yml exec immich-server \
  sh -c 'touch /data/.container-write-test && rm /data/.container-write-test'
```

Upload one test photograph in Immich. On the storage server, confirm new files
appear:

```bash
find /srv/storage/immich -type f | tail -20
```

Also verify:

- Immich thumbnails render.
- Original downloads work.
- The VTK public media page loads albums.
- Face recognition and face search complete.
- The mount returns after rebooting each server separately.

## 11. Storage-server maintenance

Before shutting down or maintaining the storage server, stop the Immich media
services on the cloud server:

```bash
cd /home/it/vtk-website-new
docker compose -f infra/docker-compose.yml stop \
  immich-public-proxy \
  immich-server \
  immich-machine-learning
```

After the storage server returns:

```bash
tailscale ping 100.90.192.112
sudo mount /mnt/immich
ls -la /mnt/immich/.immich-storage-ready
findmnt /mnt/immich
docker compose -f infra/docker-compose.yml up -d
```

Never force-unmount `/mnt/immich` while Immich is running.

## 12. Rollback

If the NFS setup is unreliable, stop Immich before rollback:

```bash
docker compose -f infra/docker-compose.yml stop \
  immich-public-proxy \
  immich-server \
  immich-machine-learning
```

If new media was uploaded after cutover, copy it back before switching paths:

```bash
sudo rsync \
  -rlt \
  --no-owner \
  --no-group \
  --no-perms \
  --info=progress2 \
  /mnt/immich/ \
  infra/immich/data/library/
```

Remove or comment this line from the cloud server's root `.env`:

```dotenv
IMMICH_MEDIA_LOCATION=/mnt/immich
```

Then recreate Immich using the Compose default:

```bash
docker compose -f infra/docker-compose.yml up -d --force-recreate \
  immich-server immich-machine-learning immich-public-proxy
```

## 13. Backups and monitoring

A complete recovery requires both:

- A backup or snapshot of `/srv/storage/immich` on the 12 TB server.
- A PostgreSQL backup from `immich-database` on the cloud server.

The media directory alone is not a complete Immich backup, and RAID is not an
independent backup. Monitor at minimum:

```bash
# Cloud server
df -hT /mnt/immich
findmnt /mnt/immich
tailscale ping 100.90.192.112

# Storage server
df -hT /srv/storage/immich
sudo exportfs -v
```

Keep the original cloud media directory until uploads, browsing, downloads,
face processing, reboots, and backups have all been tested successfully.

## Official references

- [Immich Docker Compose installation](https://docs.immich.app/install/docker-compose/)
- [Immich system and database-storage requirements](https://docs.immich.app/install/requirements/)
- [Immich custom file locations](https://docs.immich.app/guides/custom-locations/)
- [Ubuntu NFS server documentation](https://ubuntu.com/server/docs/how-to/networking/install-nfs/)
- [Ubuntu NFS exports manual](https://manpages.ubuntu.com/manpages/jammy/man5/exports.5.html)
- [Tailscale Linux installation](https://tailscale.com/docs/install/linux)
- [Tailscale connection types](https://tailscale.com/docs/reference/connection-types)
- [Tailscale grants](https://tailscale.com/docs/features/access-control/grants)
