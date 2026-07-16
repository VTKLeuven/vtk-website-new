# Immich Media Gallery

The public media page can show albums directly from Immich. The website does
not copy album photos into this repository. It reads album metadata through the
server-side Immich API and renders images through Immich Public Proxy URLs.

## What Is Included

- `/media`: public album overview inside the VTK website layout.
- `/media/[albumSlug]`: responsive photo grid, lightbox and per-photo download.
- Face search per album: visitors can upload a profile photo or take a selfie
  to find likely matches in that album.
- NL/EN text through the existing i18n dictionaries.
- Server-side API key handling. The Immich API key is never sent to the browser.

The old `/fotos` routes redirect to `/media`.

## Immich Requirements

1. Create an Immich API key for the website backend.
2. Add `[gallery]` to the Immich album description for every album that should
   be public on the website.
3. Run Immich Public Proxy and set `GALLERY_PUBLIC_PROXY_URL` to its public URL.
4. For face search, Immich must have machine learning and face recognition
   enabled, and the website must be able to read the Immich PostgreSQL database.

Albums without the marker stay hidden.

## Environment

Copy `.env.example` to `.env` and fill in the gallery values:

```dotenv
GALLERY_IMMICH_API_URL="http://localhost:2283/api"
GALLERY_IMMICH_API_KEY="<immich-api-key>"
GALLERY_PUBLIC_PROXY_URL="http://localhost:3001"
GALLERY_ALBUM_MARKER="[gallery]"
GALLERY_CACHE_TTL_SECONDS="60"
```

For face search:

```dotenv
GALLERY_DATABASE_HOST="<immich-postgres-host>"
GALLERY_DATABASE_PORT="5432"
GALLERY_DATABASE_NAME="<immich-db-name>"
GALLERY_DATABASE_USER="<immich-db-user>"
GALLERY_DATABASE_PASSWORD="<immich-db-password>"
GALLERY_FACE_SEARCH_ENABLED="true"
GALLERY_FACE_SEARCH_MAX_UPLOAD_BYTES="8388608"
GALLERY_FACE_SEARCH_TIMEOUT_SECONDS="240"
GALLERY_FACE_SEARCH_MIN_FACE_AREA_RATIO="0.008"
GALLERY_FACE_SEARCH_DOMINANT_FACE_AREA_RATIO="2.2"
GALLERY_FACE_MATCH_MAX_DISTANCE="0.42"
GALLERY_FACE_MATCH_MAX_RESULTS="80"
```

When the website runs in Docker on macOS and Immich runs on the host, use
`http://host.docker.internal:2283/api` for `GALLERY_IMMICH_API_URL`.

When both the website and Immich run in Docker, put the website container on a
network that can reach the Immich API and Immich PostgreSQL container. Then use
container hostnames such as `immich-server` and `immich_postgres`.

## Local Development

The quickest local path is the setup script:

```bash
scripts/local-gallery-stack.sh
```

By default this starts a production-like local web container on
`http://127.0.0.1:3011/media`, starts the website's Postgres and MinIO services,
and starts the local Immich stack in `infra/immich`.

The local Immich stack contains:

- `infra/immich/docker-compose.yml`: Immich, Immich PostgreSQL, Redis, machine
  learning, and Immich Public Proxy.
- `infra/immich/.env.example`: local Immich defaults.
- `infra/immich/seed/manifest.json`: versioned demo album definitions.
- `infra/immich/scripts/`: seed and sample-photo helper scripts.

The local runtime data is intentionally not committed:

- `infra/immich/.env`
- `infra/immich/data`
- `infra/immich/seed/photos`
- `infra/immich/seed/state.json`

Run a dry check without starting services:

```bash
scripts/local-gallery-stack.sh --check
```

Use a specific Immich compose file:

```bash
IMMICH_COMPOSE_FILE=/path/to/immich/docker-compose.yml scripts/local-gallery-stack.sh
```

Use the Next.js development server instead of the web container:

```bash
scripts/local-gallery-stack.sh --dev
```

Manual setup is also possible:

```bash
git clone https://github.com/VTKLeuven/vtk-website-new.git
cd vtk-website-new
npm install
cp .env.example .env
```

Edit `.env` with local credentials. Then link the root env file into the Next
apps:

```bash
ln -sf ../../.env apps/web/.env
ln -sf ../../.env apps/logistiek/.env
```

Start the local website database and object storage:

```bash
docker compose -f infra/docker-compose.yml up -d postgres minio minio-setup
npm run db:generate
npm run db:push
npm run db:seed
```

Start the development server:

```bash
npm run dev
```

Open `http://localhost:3000/media`.

For a production-like local container:

```bash
docker compose -f infra/docker-compose.yml up -d --build web
```

Open `http://127.0.0.1:3011/media`.

## Git Hygiene

The gallery should not commit Immich photos, uploads, API keys or database
dumps. These are intentionally excluded or external:

- `.env*` is ignored, except `.env.example`.
- `infra/data`, `.next`, `dist`, `build`, `node_modules` and coverage output
  are ignored.
- `infra/immich/data`, `infra/immich/seed/photos`, and
  `infra/immich/seed/state.json` are ignored.
- Immich album photos remain in Immich and are served through Immich Public
  Proxy.
- Face-search uploads are temporary Immich assets and are deleted after the
  search job finishes.

Only static website assets that belong to the website, such as
`apps/web/public/VTK.png` and `apps/web/public/default-event.jpg`, are tracked.

## Troubleshooting

If `/media` says the gallery could not load:

- Check `GALLERY_IMMICH_API_URL`.
- Check that `GALLERY_IMMICH_API_KEY` is set and valid.
- Make sure at least one album description contains `[gallery]`.
- Check that the website container can reach the Immich API hostname.

If thumbnails do not load:

- Check `GALLERY_PUBLIC_PROXY_URL`.
- Confirm Immich Public Proxy is running and reachable from the browser.
- Confirm the shared link for the album exists or can be created by the API key.

If face search keeps processing or times out:

- Check Immich job queues for metadata, thumbnails and face recognition.
- Confirm Immich machine learning is running.
- Confirm the website can reach Immich PostgreSQL.
- Increase `GALLERY_FACE_SEARCH_TIMEOUT_SECONDS` for slower machines.

If a one-person photo is flagged as multiple faces:

- The backend filters tiny detections and overlapping duplicate boxes before
  deciding. Tune `GALLERY_FACE_SEARCH_MIN_FACE_AREA_RATIO` upward to ignore
  more small false positives, or lower `GALLERY_FACE_SEARCH_DOMINANT_FACE_AREA_RATIO`
  if the main face should win more aggressively.
