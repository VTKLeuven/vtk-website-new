# Immich Disaster Recovery & Restore Runbook

This document describes the step-by-step procedures for restoring the Immich
photo and video collection, user albums, face embeddings, and metadata from
the Google Drive off-site backups (`drive vtk:Archive/immich`) or local mirrors.

---

## 1. Backup Structure on Google Drive

All backups are managed by `scripts/immich-backup.sh` and reside under
`drive vtk:Archive/immich/`:

```text
Archive/immich/
├── upload/                     # Mirrored original photos and videos (~111 GB)
├── library/                    # External library assets (if configured)
├── profile/                    # User profile avatars
├── database/                   # Daily compressed PostgreSQL dumps (.sql.gz)
├── config/                     # docker-compose.yml and immich environment files
└── deleted_or_modified/        # Versioning archive (ransomware & accidental deletion safety net)
    └── YYYY-MM-DD/
        ├── upload/
        └── library/
```

> **Note on Thumbnails and Encoded Videos:**
> The `thumbs/` and `encoded-video/` directories are intentionally excluded from
> backups. They contain purely derived, regenerable caches. Excluding them saves
> tens of gigabytes of transfer quota, millions of API requests, and hours of backup time.
> Immich will regenerate all thumbnails automatically after a restore.

---

## 2. Scenario A: Recover Accidentally Deleted or Overwritten Photos

### Option 1: Instant Local Recovery from ZFS Snapshot on `leen` (Fastest, 0 bandwidth)

Server `leen` automatically takes daily ZFS snapshots at 02:30 and keeps the last 14 days. These snapshots are accessible directly under `/vtk/.zfs/snapshot/`:

1. SSH into `leen`:
   ```bash
   ssh leen
   ```
2. List available snapshots:
   ```bash
   zfs list -t snapshot | grep vtk@daily
   # or browse the directory:
   ls -la /vtk/.zfs/snapshot/
   ```
3. Copy the deleted photo or directory back into the live filesystem:
   ```bash
   cp -a /vtk/.zfs/snapshot/daily-YYYY-MM-DD/immich/upload/<user>/<file> /vtk/immich/upload/<user>/
   ```
4. Set ownership if needed:
   ```bash
   chown -R 1999:1999 /vtk/immich/upload/<user>/
   ```

### Option 2: Recovery from Google Drive Versioning Archive

If the local snapshot on `leen` has expired or `leen` is unreachable:

1. Check the `deleted_or_modified` folder on Google Drive for the date the change occurred:
   ```bash
   rclone lsf "drive vtk:Archive/immich/deleted_or_modified/"
   ```
2. Inspect the files in that day's directory:
   ```bash
   rclone ls "drive vtk:Archive/immich/deleted_or_modified/YYYY-MM-DD/upload"
   ```
3. Copy the file back to the live storage:
   ```bash
   rclone copy "drive vtk:Archive/immich/deleted_or_modified/YYYY-MM-DD/upload/path/to/photo.jpg" /mnt/immich/upload/path/to/
   ```
4. In the Immich web UI, navigate to **Administration > System Jobs** and run **System Integrity Check** (or refresh the affected album/library).

---

## 3. Scenario B: Restore or Roll Back the Database Only

Use this if the PostgreSQL container was corrupted or migrated, but the media on `/mnt/immich` is intact:

1. **Locate the latest database dump:**
   * Locally on `liv` SSD: `/home/it/vtk-website-new/backups/immich/`
   * On the NFS mount: `/mnt/immich/backups/`
   * Or from Google Drive:
     ```bash
     rclone ls "drive vtk:Archive/immich/database/"
     rclone copy "drive vtk:Archive/immich/database/<dump_name>.sql.gz" /tmp/
     ```

2. **Stop the Immich server container to prevent concurrent writes:**
   ```bash
   cd /home/it/vtk-website-new
   docker compose -f infra/docker-compose.yml stop immich-server immich-machine-learning immich-public-proxy
   ```

3. **Restore the dump into PostgreSQL:**
   ```bash
   gunzip -c /path/to/immich-db-backup-*.sql.gz | \
     docker compose -f infra/docker-compose.yml exec -T immich-database psql -U immich -d immich
   ```

4. **Restart Immich:**
   ```bash
   docker compose -f infra/docker-compose.yml start immich-server immich-machine-learning immich-public-proxy
   ```

5. **Verify:**
   Open the Immich gallery, confirm albums and photos load, and run **Administration > Maintenance > System Integrity Check**.

---

## 4. Scenario C: Complete Disaster Recovery (Server Rebuild)

Use this procedure if the storage server (`leen`) or the cloud server (`liv`) suffered a catastrophic failure and must be rebuilt from scratch.

### Step 1: Prepare Storage and Mount

Ensure the media directory `/mnt/immich` is mounted and contains the readiness marker:
```bash
sudo mkdir -p /mnt/immich
# Mount the replacement storage (NFS or local disk) at /mnt/immich
sudo touch /mnt/immich/.immich-storage-ready
```

### Step 2: Download Media Files from Google Drive

Copy the original photos, libraries, and database dumps from Google Drive:
```bash
# 1. Download original uploads (~111 GB)
rclone copy "drive vtk:Archive/immich/upload" /mnt/immich/upload \
  --drive-chunk-size=64M --fast-list --stats=1m -P

# 2. Download external library (if used)
rclone copy "drive vtk:Archive/immich/library" /mnt/immich/library \
  --drive-chunk-size=64M --fast-list --stats=1m -P

# 3. Download profile avatars
rclone copy "drive vtk:Archive/immich/profile" /mnt/immich/profile \
  --drive-chunk-size=64M --fast-list --stats=1m -P

# 4. Download database dumps
rclone copy "drive vtk:Archive/immich/database" /mnt/immich/backups \
  --drive-chunk-size=64M --fast-list --stats=1m -P
```

Set appropriate ownership so the Immich container can write new uploads:
```bash
sudo chown -R 1999:1999 /mnt/immich
```

### Step 3: Restore Configuration & Database

1. Verify `infra/docker-compose.yml` and `infra/immich/.env` match the desired credentials.
2. Start the database and cache services:
   ```bash
   docker compose -f infra/docker-compose.yml up -d immich-database immich-redis
   # Wait for healthchecks to turn healthy
   docker compose -f infra/docker-compose.yml ps
   ```
3. Load the latest database dump:
   ```bash
   LATEST_DUMP="$(ls -t /mnt/immich/backups/*.sql.gz | head -n 1)"
   gunzip -c "$LATEST_DUMP" | \
     docker compose -f infra/docker-compose.yml exec -T immich-database psql -U immich -d immich
   ```

### Step 4: Start Immich Services

Start the remaining containers:
```bash
docker compose -f infra/docker-compose.yml up -d \
  immich-server immich-machine-learning immich-public-proxy
```

Verify all containers report `healthy`:
```bash
docker compose -f infra/docker-compose.yml ps
```

### Step 5: Regenerate Caches and Verify Integrity

Log in to the Immich Admin UI (`https://...` or `http://localhost:2283`):
1. Navigate to **Administration > System Jobs**.
2. Trigger the following jobs in order:
   * **Generate Thumbnails:** Regenerates all missing preview images.
   * **Transcode Videos:** Re-encodes videos for web streaming (optional / in background).
   * **Extract Metadata / Facial Recognition:** If any vector caches need re-indexing.
3. Navigate to **Administration > Maintenance** and run **System Integrity Check**.
   * Confirm that "Missing Files" is `0`.
   * Any "Untracked Files" can be inspected or imported.

---

## 5. Automated Verification Checklist

To test that disaster recovery remains possible:
* [ ] At least once every semester, run `scripts/immich-backup.sh --dry-run` to confirm Google Drive connectivity.
* [ ] Confirm that the newest file in `drive vtk:Archive/immich/database/` is less than 48 hours old.
* [ ] Test decompressing and inspecting the schema of a recent dump:
  ```bash
  rclone cat "drive vtk:Archive/immich/database/<latest>.sql.gz" | gzip -d | head -n 50
  ```
