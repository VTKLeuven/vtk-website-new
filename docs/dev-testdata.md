# Testdata op de dev-server

De dev-site (`dev.vtk.be`, host `elise`) draait dezelfde stack als productie maar
met een eigen, lege database. Leeg is hier het probleem: zonder pagina's,
ticketevents of foto's kan je precies de schermen niet uitproberen waarvoor je
naar dev gaat. Dit document beschrijft wat er staat, waar het vandaan komt en
hoe je het opnieuw opbouwt.

Alles hieronder draait **in de webcontainer**. Die draagt de env (databasehost,
tokens, S3) en de app-code; op de host zelf staat geen Node en geen
`node_modules`.

## 1. De redactionele kant: de gewone seed

`packages/db/prisma/seed.ts` vult navigatie, CMS-pagina's, partners, POC's,
kalenderevents, shiften, het Theokot-aanbod, de voertuigen van de uitleendienst
en de prototype-logins. Hij zit in de web-image, samen met de fixtures.

```bash
cd ~/vtk-website-new
docker compose -f infra/docker-compose.yml exec web sh -lc \
  "cd /app && npx tsx packages/db/prisma/seed.ts"
```

De seed is **create-only**: hij overschrijft nooit wat er in de admin gewijzigd
is, en twee keer draaien doet geen kwaad. De prototype-accounts zijn
`<post>@vtk.prototype` met wachtwoord `prototype` (te overschrijven met
`SEED_PROTOTYPE_PASSWORD`). Een superadmin maakt de seed enkel aan wanneer
`SEED_ADMIN_EMAIL` en `SEED_ADMIN_PASSWORD` allebei in de env staan.

## 2. Ticketevents, bestellingen en formulieren

De seed kent geen ticketevents. `scripts/dev-testdata.ts` vult die, samen met
betaalde bestellingen (inclusief echte tickets en één gescand ticket) en een
paar formulieren. Het script staat niet in de image, dus kopieer het er eerst in:

```bash
cd ~/vtk-website-new
docker compose -f infra/docker-compose.yml exec web mkdir -p /app/scripts
docker cp scripts/dev-testdata.ts \
  "$(docker compose -f infra/docker-compose.yml ps -q web)":/app/scripts/dev-testdata.ts
docker compose -f infra/docker-compose.yml exec web sh -lc \
  "cd /app && npx tsx --conditions=react-server scripts/dev-testdata.ts"
```

`--conditions=react-server` is niet optioneel: het script importeert de
ticketcode van de app, en die begint met `import "server-only"`. Zonder die
conditie lost dat package op naar de variant die meteen gooit.

Opruimen: hetzelfde commando met `--reset`. Dat verwijdert enkel wat het script
aanmaakte (alles met het voorvoegsel `dev-`).

Wat je krijgt, en waarom net die gevallen:

| Event | Waarvoor |
| --- | --- |
| `dev-galabal` | Lopende **voorverkoop**: het praesidium kan al bestellen, een gewone bezoeker ziet "de verkoop start op ...". |
| `dev-doopcantus` | Gratis ticket (dus login verplicht), bijna vol, met vragen aan de deelnemers en `cardCheckIn`. Draagt de bestellingen en de gescande tickets. |
| `dev-bedrijvenavond` | Blijft **concept**: hiermee test je de Voorbeeld-knop naast Publiceren. |
| `dev-winterbar` | Verkoop moet nog starten, zonder voorverkoop. |
| `dev-kerstmarkt` | Verkoop gesloten, event nog niet geweest: deelnemerslijst en scanner horen te werken terwijl de shop dicht is. |

De bestellingen gaan door `fulfillPaidOrder` heen, dus de voorraad, de tickets,
de QR-credentials en het ticketontwerp kloppen echt. De bevestigingsmails worden
meteen uit de outbox gehaald: die kopers bestaan niet, en een wachtrij vol
onbestelbare adressen verbergt de mails die je wél test.

## 2b. Het broodjessysteem van Theokot

De seed zet het standaardaanbod klaar, maar geen verkoopdagen en geen
bestellingen, en net daarmee test je de balie, de turflijst en de bans.
`scripts/seed-theokot-broodjes-demo.ts` vult dat aan:

```bash
npm run db:demo:broodjes          # of: make broodjes
npm run db:demo:broodjes -- --reset   # enkel opruimen
```

Het script draait **enkel tegen een lokale database**; het maakt bestellingen,
no-shows en een ban aan op naam van verzonnen studenten, en die horen niet in de
historiek van de echte site.

Wat je krijgt, en waarom net die gevallen:

| Dag | Waarvoor |
| --- | --- |
| gisteren | Volledig afgehandeld (`processedAt` gezet): no-show-historiek en een turflijst van een voorbije dag. |
| vandaag | De afhaal loopt: hier test je de balie, het laattijdig uitdelen en "afhaalronde afsluiten". Draagt ook een grocomeet, dus de turflijst toont de GM-kolom en het drankje. |
| morgen | Bestellen staat open en er is niets opgehaald: de enige dag die je nog kan verwijderen. |
| overmorgen | Vier broodjes kaas besteld terwijl er twee in het aanbod staan: de rode regel in de aanbod-editor, de bevestiging bij het opslaan en het schrappen van een bestelling. |
| over vijf dagen | Bestellen opent pas later: de student ziet "Reserveren opent op ...". |

De vijf demostudenten hebben een r-nummer (`r9000001` tot en met `r9000005`),
want dat is waarmee de afhaalbalie zoekt. Joris (`r9000003`) heeft twee
openstaande bonnetjes uit een afgelopen shift, zodat het bonnetjesvenster
verschijnt, en zijn bestelling van vandaag staat als niet-opgehaald geboekt,
zodat je het laattijdig uitdelen kan proberen. Lies (`r9000004`) is geband.

Twee keer draaien levert geen tweede set op: het script onthoudt in de setting
`theokot.demo.broodjes` wat het aanmaakte en gooit precies dat weg voor het
opnieuw begint. Verkoopdagen die je zelf aanmaakte, blijven staan.

## 3. Immich: albums en foto's

Dev heeft een eigen Immich (`infra-immich-server-1`, poort 2283 op localhost).
Die begint leeg: geen gebruiker, geen API-sleutel, geen albums.

1. **Admin aanmaken** (eenmalig), via `POST /api/auth/admin-sign-up`.
2. **API-sleutel** maken en in `.env` zetten als `GALLERY_IMMICH_API_KEY`.
3. **Web en fakbar opnieuw aanmaken**, anders draaien ze met de oude env:
   `docker compose -f infra/docker-compose.yml up -d --force-recreate web fakbar`.
4. **Foto's uploaden** (`POST /api/assets`) en er albums van maken
   (`POST /api/albums`). Testfoto's haal je met `curl` van
   `https://picsum.photos/seed/<naam>/1600/1067`.
5. De **albumbeschrijving** bepaalt wat de site doet: `[gallery]` zet het album
   publiek, `[tab: ...]` en `[parent: <slug>]` maken er tabbladen van. Zie
   [immich-gallery.md](immich-gallery.md).

De gedeelde links maakt de site zelf aan; die hoef je in Immich niet te zetten.

**`photos.dev.vtk.be` moet wel bestaan.** De foto's op `/media` lopen niet langs
de site maar langs de Immich Public Proxy, en `GALLERY_PUBLIC_PROXY_URL` wijst
naar dat adres. De DNS staat goed (CNAME naar elise), maar zolang de Caddyfile
op elise er geen blok voor heeft, is er geen certificaat en laadt geen enkele
foto:

```caddy
photos.dev.vtk.be {
    reverse_proxy localhost:3014
}
```

Daarna `sudo systemctl reload caddy`; Caddy haalt het certificaat zelf op.

## Waarom dit niet automatisch bij een deploy gebeurt

De web-container draait bij het starten haar migraties, maar de seed enkel
wanneer `RUN_SEED=true`. Dat is bewust: een deploy mag geen seed-inhoud opnieuw
opleggen over wat iemand intussen in de admin aanpaste. Testdata is een
beslissing van een mens, geen gevolg van een push.
