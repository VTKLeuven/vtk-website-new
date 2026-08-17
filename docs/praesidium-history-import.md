# Praesidium-historiek-import

Hoe de historische praesidia (2006-2007 t.e.m. 2025-2026) in de database van de
nieuwe site terechtkomen. De import maakt per persoon een **inactieve**
`User`-rij met een dummy-e-mail en schrijft per (post, werkingsjaar) een
`GroupMembership` met rol + titel. Posten die op de nieuwe site niet bestaan,
worden aangemaakt als inactieve `Group`-rijen (`type=PRAESIDIUM`), zodat hun
historiek rendert op `/praesidium`.

2026-2027 is bewust NIET geïmporteerd: dat is het huidige werkingsjaar en wordt
met echte accounts beheerd via de admin.

## Data

| Bestand | Rol |
|---|---|
| `scripts/praesidium-history.json` | Importdata (accounts + lidmaatschappen) |
| `scripts/scrape-praesidium.py` | Haalt de 20 jaar van vtk.be op → `scripts/praesidium-history-raw.json` |
| `scripts/merge-praesidium-history.py` | Merged de scrape in de importdata (additief, idempotent) |
| `scripts/import-praesidium-history.ts` | Schrijft de JSON naar de DB (idempotent) |
| `scripts/validate-praesidium-json.ts` | Valideert de JSON tegen het zod-schema van de import |

### JSON-formaat

```jsonc
{
  "posts": [{ "name": "Lustrum", "active": false }],
  "people": [
    {
      "id": "litus-4437",            // bestaand lid: litus-id
      "name": "Arthur Ackermans",
      "firstName": "Arthur",
      "lastName": "Ackermans",
      "photo": "https://vtk.be/_common/profile/<hash>",
      "memberships": [
        { "post": "Communicatie", "year": 2015 },
        { "post": "Communicatie", "year": 2016, "role": "LEAD", "titleNl": "Praeses" }
      ]
    }
  ]
}
```

- `year` is het **startjaar** van het werkingsjaar (2015 = "15-16").
- `role`: `LEAD` = groepscoördinator (gele pin op `/praesidium`), default `MEMBER`.
- `titleNl`/`titleEn`: optionele subtitel. Voor de historiek wordt enkel
  `titleNl` gebruikt; de titel staat **letterlijk** zoals op de oude site,
  inclusief hoofdletters ("Vice", "secretaris", "Vice-Praeses",
  "PAL - coördinator", ...).

### Titels: wat wél en niet

De oude site toont per lid een `<p>` onder de naam. Daaruit gelden deze regels:

- **"Groepscoördinator" wordt nooit als titel gezet** — die pin wordt op de
  nieuwe site afgeleid van `role: LEAD`. Een lid kan op de oude site én de pin
  én een echte titel hebben (bv. "Praeses" of "Recruitment"); dan krijgt het
  lid `role: LEAD` én de titel.
- **Bijnamen worden overgeslagen** (leeg gelaten): `Timbo`, `Coelmoes`,
  `Vince`, `Freddi`, `Fil`, `Willie`, `Fré`, `Bonas`, `Adel`, `Jelly`, `Gio`,
  `Morris` (praesidia 2006-2009) en `Vroem vroem` (2024-2025, een grap).
- Alle andere `<p>`-waarden zijn echte titels en worden letterlijk overgenomen
  (ook "Vice"/"secretaris" in kleine letters uit 2006-2008).

Deze filtering zit op **twee** plaatsen: de merge schrijft nooit een verboden
titel in de JSON, én de import filtert opnieuw (`SKIP_TITLES` in
`import-praesidium-history.ts`) zodat een ruwe scrape-uitvoer nooit verkeerde
titels in de DB zet.

### ID-schema voor nieuwe personen (geen litus-id)

Personen die niet in de bestaande data zaten (vooral de praesidia van
2006-2009) krijgen een id `vtk-<16 hex karakters van de profielfoto-hash van
hun eerste jaar op vtk.be>` (bv. `vtk-f12a0cb948875c3e`). Zonder foto: `vtk-<geslugified naam>`,
bij een botsing aangevuld met `-2`, `-3`, ... De keuze:

- **Stabiel**: dezelfde pagina geeft dezelfde hash; een herrun leidt tot
  dezelfde id.
- **Uniek**: kan nooit botsen met echte `litus-XXXXX`-ids.
- **Per persoon**: de merge matcht personen op genormaliseerde naam over alle
  jaren heen en maakt één entry per persoon, ook al verschilt de foto per jaar.

## Idempotentie (geen duplicaten, geen verlies)

- **Merge** (`merge-praesidium-history.py`): strikt additief. Bestaande
  personen en lidmaatschappen worden nooit verwijderd; een lidmaatschap dat er
  al is wordt niet opnieuw toegevoegd; een titel wordt enkel gezet, nooit
  gewist. Een tweede run op een gemerged bestand verandert niets meer.
- **Import** (`import-praesidium-history.ts`): users worden geupsert op de
  dummy-e-mail (`praesidium-history+<id>@import.vtk.be`), memberships op
  `(userId, groupId, year)`. Een herrun met méér accounts voegt enkel toe;
  bestaande accounts en memberships blijven onaangeraakt (`active` van
  bestaande users wordt niet gewijzigd). Bij een update worden titels enkel
  gezet als ze in de JSON staan — een JSON zonder titel wist geen bestaande
  titel.

## Draaien

### Lokaal (dry-run)

```bash
npm run import:praesidium -- scripts/praesidium-history.json --dry-run
npm run import:praesidium -- scripts/praesidium-history.json
```

Vereist `.env` met `DATABASE_URL`, `S3_*` (fallback) en `BETTER_AUTH_SECRET`
(nodig om de opgeslagen S3-config te ontsleutelen).

### Op de server (docker)

De runner-image bevat de volledige monorepo-`node_modules` (met `tsx`), maar
niet de `scripts/`-map. Kopieer de twee bestanden in de container en draai ze
met `npx tsx` (dezelfde aanpak als het `CMD` van de image). Draai altijd
eerst de dry-run:

```bash
# Vanuit de repo-root op de server (zelfde compose-file als de CI):
docker compose -f infra/docker-compose.yml exec web mkdir -p /app/scripts
docker compose -f infra/docker-compose.yml cp scripts/import-praesidium-history.ts web:/app/scripts/
docker compose -f infra/docker-compose.yml cp scripts/praesidium-history.json web:/app/scripts/

# 1. Dry-run: toont wat er zou gebeuren zonder iets te schrijven
docker compose -f infra/docker-compose.yml exec web npx tsx /app/scripts/import-praesidium-history.ts /app/scripts/praesidium-history.json --dry-run

# 2. Echte import (idempotent; een tweede run doet niets extra's)
docker compose -f infra/docker-compose.yml exec web npx tsx /app/scripts/import-praesidium-history.ts /app/scripts/praesidium-history.json
```

De container haalt `DATABASE_URL` en de S3-instellingen uit zijn eigen env
(`env_file: ../.env` + de in de DB opgeslagen `s3.config`), dus er is geen
extra config nodig. De profielfoto's worden bij de import van vtk.be gedownload
en naar de S3-bucket van de site geüpload.

Opmerkingen:

- De gekopieerde bestanden leven in het container-bestandssysteem en zijn dus
  vluchtig: bij een herdeploy (`docker compose up --build`) verdwijnen ze.
  Voor een eenmalige import is dat geen probleem; voor hergebruik kopieer je ze
  opnieuw of zet je de scripts in de image.
- Als de stack onder een andere projectnaam draait (`docker compose -p <naam>`
  of een aangepaste compose-file), gebruik dan dezelfde `-f`/`-p`-vlaggen als
  bij `docker compose ps`.
