# Immich Media Gallery

For the production setup that stores Immich media on the separate 12 TB server
over Tailscale and NFS, see
[Immich Remote Storage over Tailscale and NFS](immich-remote-storage.md).

The public media page can show albums directly from Immich. The website does
not copy album photos into this repository. It reads album metadata through the
server-side Immich API and renders images through Immich Public Proxy URLs.

## What Is Included

- `/media`: public album overview inside the VTK website layout.
- `/media/[albumSlug]`: responsive photo grid, lightbox and per-photo download.
- Face search per album: visitors can upload a profile photo or take a selfie
  to find likely matches in that album. Available on both galleries, each behind
  its own flag that is off by default; see
  [Face search runs per gallery](#face-search-runs-per-gallery).
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

### Sub-albums (Tabs per evenement)

Voor evenementen met meerdere fotoseries (bijvoorbeeld het Galabal met "Zaal" en "Photobooth") kunnen albums worden gegroepeerd tot één albumpagina met tabs (`/media/galabal-2026?sub=photobooth`).

In Immich kan dit op twee manieren worden ingesteld:

1. **Via `[parent: ...]` (Aanbevolen):**
   - Hoofdalbum: Titel `Galabal 2026`, beschrijving: `[gallery] [tab: Zaal]`
   - Deelalbum: Titel `Galabal 2026 - Photobooth`, beschrijving: `[gallery] [parent: galabal-2026] [tab: Photobooth]`
2. **Via `[group: ...]`:**
   - Album 1: `[gallery] [group: galabal-2026] [tab: Zaal]`
   - Album 2: `[gallery] [group: galabal-2026] [tab: Photobooth]`

Groeperen gebeurt uitsluitend via deze expliciete merkers, niet automatisch op basis van titelpatronen (zoals `Sport van de maand: ...`), zodat losse evenementen in dezelfde reeks aparte albums blijven.

Op `/media` verschijnt slechts één overzichtskaart met het totaal aantal foto's, chronologisch gesorteerd op de vroegste datum van de deelalbums. Gezichtsherkenning zoekt automatisch over alle sub-albums van het evenement.


**In de praktijk hoef je dit niet met de hand in Immich te zetten.** In
`/admin/media` maak je een album aan en hang je er later tabs aan ("Tab
toevoegen" in het album zelf); het beheer schrijft variant 1 hierboven. Wie foto's
beheert, hoort nooit in Immich te moeten: zie "Het mediabeheer" hieronder.

**Let op de tabnaam van het hoofdalbum.** Draagt het hoofdalbum zelf geen
`[tab: ...]`, dan heet zijn tab op de site letterlijk "Algemeen"
(`resolveTabTitle` in `packages/gallery/src/grouping.ts`). Het formulier voor
een nieuwe tab vraagt daarom meteen ook een naam voor de foto's die er al in staan.

## Het mediabeheer

`/admin/media` heeft vier tabbladen (Foto's, Magazines, Aftermovies,
Verwijderverzoeken). Foto's is een lijst van alle albums links en het open album
rechts; zie `docs/design-decisions.md`, "Mediabeheer".

**Het beheer leest Immich rechtstreeks, niet de momentopname.** De momentopname
bevat enkel zichtbare albums, met duimnagels via de publieke gedeelde link, en
loopt tot een kwartier achter. `listAdminAlbums` (in `packages/gallery`) doet één
`GET /albums`, neemt de verborgen albums mee en groepeert met dezelfde
`groupAlbums` als de site. De slugs worden in dezelfde volgorde toegekend als in
de momentopname (eerst de zichtbare, nieuwste bovenaan, dan de verborgen), zodat
`[parent: <slug>]` van een nieuwe tab naar hetzelfde album wijst als op de site.
De foto's van één album komen uit `listImmichAlbumAssets`, de duimnagels allemaal
uit `/api/admin/immich-gallery/assets/<assetId>/thumbnail` (met de API-sleutel,
achter de mediarechten). Een album in het beheer heeft als adres het Immich-id
van zijn hoofdalbum, niet de slug: die verandert mee met de titel, en een
verborgen album heeft er geen.

### Een album van de site halen

`[gallery]` wisselen voor **`[gallery-uit]`** haalt het album van de mediapagina
zonder het uit Immich te gooien. De merker weghalen zou het album onvindbaar
maken in het beheer; met `[gallery-uit]` blijft het in de lijst staan, gedimd, en
zet de schakelaar het terug. Dat gebeurt op **elk deel** van het album: enkel het
hoofdalbum omzetten liet de tabs als losse albums op de site staan. Voor de
fakbargalerij is dat `[fakbar-uit]`. Er is geen botsing met de gewone merker:
`"[gallery-uit]"` bevat `"[gallery]"` niet. Een nieuw album kan meteen verborgen
beginnen ("Eerst nakijken"); het krijgt dan van bij het aanmaken de uit-merker.

### Een foto verbergen

Verbergen haalt de foto uit haar album (`DELETE /albums/{id}/assets`). Ze blijft
in Immich, maar heeft geen publieke URL meer: die hangt aan de gedeelde link van
een *album*. De rij in `GalleryDetachedPhoto` houdt bij waar ze vandaan kwam;
daarmee toont het beheer haar gedimd in haar eigen album en zet "Tonen" haar terug.

### De prullenmand

Verwijderen in het beheer is nooit meteen definitief, en terugzetten gebeurt in
het beheer zelf, niet in Immich.

- **Een foto** gaat naar de prullenmand van Immich (`DELETE /assets`,
  `force: false`) en krijgt een rij in `GalleryTrashedPhoto`. Terugzetten is
  `POST /trash/restore/assets`; Immich legt ze dan zelf terug in haar album.
  Ook "Foto verwijderen" bij een verwijderverzoek schrijft zo'n rij.
- **Een album** gaat niet naar Immich: elk deel krijgt de uit-merker en een rij in
  `GalleryTrashedAlbum` haalt het uit de lijst. Terugzetten zet de merkers terug
  (behalve als het album al verborgen was).
- **Na 30 dagen** ruimt `purgeExpiredGalleryTrash` op, lui bij het openen van
  het beheer (`after()` in de layout van Foto's): een album gaat dan echt weg,
  zijn foto's naar de prullenmand van Immich. Die leegt zich op zijn eigen termijn.
  Staat die korter dan 30 dagen, dan zegt "Terugzetten" dat de foto al weg is.

## Environment

Copy `.env.example` to `.env` and fill in the gallery values:

```dotenv
GALLERY_IMMICH_API_URL="http://localhost:2283/api"
GALLERY_IMMICH_API_KEY="<immich-api-key>"
GALLERY_PUBLIC_PROXY_URL="http://localhost:3014"
GALLERY_ALBUM_MARKER="[gallery]"
GALLERY_CACHE_TTL_SECONDS="900"
```

`GALLERY_CACHE_TTL_SECONDS` is de levensduur van de momentopname per galerij.
Die opbouwen kost op vtk.be ongeveer twee seconden (albumlijst, per album de
assets, per album een gedeelde link), en de bezoeker die de verlopen cache
tegenkomt betaalt dat volledig aan wachttijd. Een kwartier kan omdat uploaden en
een verwijderverzoek de momentopname zelf verversen; de TTL vangt enkel nog
wijzigingen op die rechtstreeks in Immich gebeuren. Werk je een tijd lang in
Immich zelf, zet hem dan tijdelijk lager.

For face search:

```dotenv
GALLERY_DATABASE_HOST="<immich-postgres-host>"
GALLERY_DATABASE_PORT="5432"
GALLERY_DATABASE_NAME="<immich-db-name>"
GALLERY_DATABASE_USER="<immich-db-user>"
GALLERY_DATABASE_PASSWORD="<immich-db-password>"
GALLERY_FACE_SEARCH_ENABLED="true"
GALLERY_FAKBAR_FACE_SEARCH_ENABLED="false"
GALLERY_FACE_SEARCH_DEVICE_ID="vtk-gallery-face-search"
GALLERY_FAKBAR_FACE_SEARCH_DEVICE_ID="vtk-fakbar-face-search"
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
container hostnames `immich-server` and `immich-database`. The repository's
single Compose project configures this network and overrides those hostnames
automatically.

## Local Development

The quickest local path is the setup script:

```bash
scripts/local-gallery-stack.sh
```

By default this starts a production-like local web container on
`http://127.0.0.1:3011/media`, starts PostgreSQL, and starts the Immich services
from the main `infra/docker-compose.yml` project.

The local Immich stack contains:

- `infra/docker-compose.yml`: website services plus Immich, Immich PostgreSQL,
  Valkey, machine learning, and Immich Public Proxy.
- `infra/immich/.env.example`: Immich-only environment template.
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
cp infra/immich/.env.example infra/immich/.env
```

Edit both files with local credentials. Keep the three database credential
forms in `infra/immich/.env` synchronized as its comments explain. Then link
the root env file into the Next apps:

```bash
ln -sf ../../.env apps/web/.env
ln -sf ../../.env apps/logistiek/.env
```

Start the local databases and Immich:

```bash
docker compose -f infra/docker-compose.yml up -d \
  postgres immich-server immich-machine-learning immich-public-proxy
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

On the server, Caddy should proxy the Immich management hostname to
`127.0.0.1:2283` and the public gallery hostname to `127.0.0.1:3014`. Set both
`PUBLIC_BASE_URL` in `infra/immich/.env` and `GALLERY_PUBLIC_PROXY_URL` in the
root `.env` to that public gallery URL.

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

## Face search runs per gallery

The engine lives in `packages/gallery/src/face-search.ts` and both apps use it:
`apps/web/lib/immich-face-search.ts` is a thin facade over it for vtk.be, and
`apps/fakbar/lib/face-search.ts` is the ElixIr one. There is one implementation,
not two copies.

Three things are deliberately **not** shared.

**The on/off flag.** `GALLERY_FACE_SEARCH_ENABLED` covers vtk.be and
`GALLERY_FAKBAR_FACE_SEARCH_ENABLED` covers the fakbar. Both default to off and
both must read exactly `true`; `1`, `yes` and `TRUE` do not count. A face
template is biometric data and therefore an Article 9 special category, and the
2026-07-18 compliance audit requires an approved DPIA, a lawful Article 9
condition, notice to the people indexed in the albums and a working objection
route **per processing activity**. vtk.be and the fakbar are a different
audience and a different set of albums, so enabling one must never quietly open
the other.

**The device id.** `GALLERY_FACE_SEARCH_DEVICE_ID` and
`GALLERY_FAKBAR_FACE_SEARCH_DEVICE_ID` name the temporary selfie in Immich.
Cleaning up stale uploads deletes everything carrying that device id older than
the TTL, so a shared value would let one gallery wipe the other's selfie out
from under a running search. Keep them different.

**The albums.** Every query filters on `album_asset."albumId"`, and the album id
comes from that gallery's own client. A `[fakbar]` album is therefore not
searchable from vtk.be and a `[gallery]` album is not searchable from the fakbar
app, the same boundary the markers draw for browsing. `apps/web/test/faceSearchSeparation.test.ts`
guards the flag and device-id halves of this; the album half follows from the
client that resolves the slug.

What **is** shared: the Immich database connection and the tuning
(`GALLERY_FACE_MATCH_MAX_DISTANCE`, the timeouts, the face-area ratios). It is
one Immich install and one model, so those would only drift if split.

### The fakbar app needs the Immich database credentials too

`GALLERY_DATABASE_NAME`, `_USER` and `_PASSWORD` live in `infra/immich/.env.example`,
not in the root `.env`. The web service loads that file through `env_file`; the
fakbar service must load the same two entries or it only ever learns the host.
The failure is quiet in the wrong way: the flag reads `true`, but
`isDatabaseConfigured` is false, so the panel renders as "not configured" and
the route answers 503 `face_search_db_missing`. Both services are wired for this
in `infra/docker-compose.yml`; keep them in step.

### Before switching either flag on

The audit lists this as a critical finding and the deployment checklist says to
keep it off until the biometric checklist is formally approved. Enabling it is a
controller decision, not a deployment detail:

1. Complete and approve a DPIA for that gallery.
2. Establish a valid Article 9 condition. Consent from the person searching
   covers their own selfie; it does not cover the templates of everyone already
   indexed in the album photos.
3. Inform the people whose faces are indexed and give them a working objection
   and deletion route.
4. Restrict Immich access, and verify deletion from active data *and* backups.
5. Test consent withdrawal, and document the AI Act role and human oversight.

Existing album embeddings need a separate documented decision. Note that Immich
detects faces and stores embeddings on its own schedule, independently of these
flags: turning face search off stops the search feature, not the detection.

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
