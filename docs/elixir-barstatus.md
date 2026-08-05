# Barstatus 't ElixIr (Munisense)

De homepage toont op de openingsurenkaart van 't ElixIr of de bar **nu** open is.
Die status leiden we af uit de geluidsmeter van Munisense: is er een lopend
geluidsevent en wordt er genoeg lawaai gemeten, dan staat de bar open.

We hebben geen API-sleutel van Munisense. De worker logt daarom in als gewone
gebruiker op `login.munisense.net` en praat daarna met de endpoints van hun
webapplicatie met de sessiecookies in de hand.

## Wie praat wanneer met Munisense

Enkel de worker. Een bezoeker raakt Munisense **nooit**, hoe druk de site ook is.

```
elixir-worker (docker-compose, elke 3 min)
   └─ POST /api/elixir/maintenance          (Bearer ELIXIR_MAINTENANCE_SECRET)
        └─ refreshBarStatus()
             ├─ login.munisense.net          (enkel als de sessie verlopen is)
             ├─ 4 calls naar leuven-geluid.munisense.net
             └─ schrijft de cache (geheugen + Setting-rij)

bezoeker → homepage of GET /api/bar-status
             └─ readBarStatus()  →  leest enkel de cache
```

Per dag: ongeveer 480 refresh-cycli en ongeveer 48 logins, ongeacht het aantal
bezoekers. Een pageview kost nul netwerkverkeer richting Munisense en, na de
eerste render van een proces, nul databasequery's.

## De HTTP-flow van de login

`lib/elixir/munisenseAuth.ts`. Drie stappen, allemaal met `redirect: "manual"`
zodat we de 302 en de cookies zelf in handen houden.

1. `GET /login`: levert `__Secure-PHPSESSID` en de HTML van het formulier.
   `lib/elixir/loginForm.ts` haalt daar **alle** hidden velden uit (dus ook het
   CSRF-token, hoe het ook heet) plus de namen van het gebruikersnaam- en
   wachtwoordveld. Zo hoeven we niets te gokken en overleeft dit een hernoeming.
2. `POST /login` als `multipart/form-data`. We bouwen een `FormData` en geven die
   rechtstreeks als `body` mee; undici zet dan zelf de juiste `Content-Type` met
   boundary. **Zet die header nooit handmatig**: dan klopt de boundary niet en
   weigert de server de post zonder duidelijke fout.
3. De 302 volgen we één keer met de hand, omdat het `MuniToken` vaak pas op de
   bestemming gezet wordt. Zit dat token daarna niet in de jar, dan gooien we
   (verkeerde credentials of gewijzigd formulier).

De cookiejar (`lib/elixir/cookieJar.ts`) is bewust minimaal: één map voor heel
`munisense.net`, zonder Domain/Path. `Set-Cookie` lezen we via
`headers.getSetCookie()`, want op komma's splitsen breekt op `Expires=Wed, 09 Jun`.

De sessie blijft 30 minuten in het procesgeheugen. Wijst Munisense een call af
(401/403, of een redirect naar de loginpagina, of HTML waar JSON hoort), dan
logt `withMuniSession` één keer opnieuw in en probeert het nog eens. Daarna niet
meer, zodat foute credentials geen retry-storm worden.

## De dataketen

`lib/elixir/munisenseClient.ts`, met de group-id uit `MUNISENSE_GROUP_ID` (81):

1. `GET /webservices/v2/groups/81/soundevents?fields=object_id,description,start_timestamp,end_timestamp&order_field=start_timestamp&order_dir=desc&offset=0&rowcount=5`
2. het lopende event eruit halen (`pickCurrentEvent`)
3. `GET /webservices/v2/soundeventapp/81/<eventId>/soundmeasurementpoints`
4. `GET /webservices/v2/soundeventapp/realtimesound/<measurementPointId>`

Munisense maakt **per dag** één soundevent per meter, met een venster van
ongeveer 10:00 tot 07:00 de volgende ochtend; de bar-avond valt daar dus binnen.
Er hoort altijd één te lopen. Zo ziet dat eruit:

```json
"486097": { "object_id": 486097, "description": "05-08-2026 - 't ElixIr",
            "start_timestamp": 1785916800, "end_timestamp": 1785992400 }
```

De tijdstempels zijn unix-seconden. Het antwoord is geen array maar een **map met
het event-id als sleutel**, plus een `link_next` voor de paginering.

Stap 3 geeft een array met één meetpunt (`object_id: "3413"`), inclusief
`is_active` en `laeq_last_period`. Die laatste houden we bij als reserve voor het
geval stap 4 wegvalt. Stap 4 is minimaal: `{"laeq": 47.9}`, zonder tijdstempel.

De parsers in `lib/elixir/munisenseParse.ts` zijn verdraagzaam: ze accepteren een
kale array, een omhulsel (`data`, `result`, ...) of een map met ids als sleutel,
kennen meerdere schrijfwijzen per veld (`object_id`/`id`,
`laeq`/`laeq_last_period`) en geven `null` in plaats van te gooien. Reden: we
hebben deze API nooit gedocumenteerd gezien. Herkent een parser de payload niet,
dan loggen we de **sleutels** van het antwoord naar Sentry (nooit de waarden)
zodat we hem kunnen bijstellen.

De fixtures in `apps/web/test/elixir.test.ts` zijn echte, ingekorte antwoorden.
Wijzigt Munisense iets, leg dan `npm run probe:elixir` naast die fixtures.

## Wanneer is de bar "open"

`lib/elixir/barStatus.ts`, zuiver en getest. Open betekent: we zitten **binnen de
openingsuren** (zo t/m do 22:00-07:00, Brusselse tijd, zie `openingWindow.ts`),
er loopt een soundevent, de meter staat op `is_active`, en de meting haalt de
drempel. Alles daarbuiten is dicht; bij twijfel dicht.

Het rooster bepaalt dus wanneer de bar open *kan* zijn en de meter bevestigt of
ze het *is*. Buiten het venster zegt de meter niets: een cantus op
zaterdagmiddag of een poetsploeg met de radio aan is geen open bar. De worker
belt Munisense buiten die uren dan ook niet.

Hysterese: open vanaf 65 dB, maar pas dicht na twee cycli op rij onder 60 dB.
Zonder die marge knippert de badge tussen twee nummers door.

De cache veroudert: staat er 15 minuten niets nieuws in (worker plat), dan meldt
`readBarStatus` `stale: true` en `isOpen: false`. Een verouderde "open" is erger
dan geen antwoord.

## Op de homepage

De openingsurenkaart van 't ElixIr gebruikt de meting zodra ze vers is. Ontbreekt
ze of is ze verouderd, dan valt de kaart terug op het vaste uurrooster (open
vanaf 22u, zondag tot en met donderdag). Zonder credentials werkt de kaart dus
gewoon zoals voorheen.

Het decibelgetal zelf tonen we niet: bezoekers willen weten of de bar open is,
niet hoe luid het er is.

## Endpoints

| Route | Auth | Doel |
| --- | --- | --- |
| `POST /api/elixir/maintenance` | `Bearer ELIXIR_MAINTENANCE_SECRET` | Worker-trigger: één verse meting, werkt de cache bij. Geeft enkel tellers terug |
| `GET /api/bar-status` | publiek | Leest de cache: `{ available, isOpen, currentDecibels, lastUpdated, stale }` |

## Configuratie

Verplicht in `.env` (leeg = integratie uit, kaart valt terug op het rooster):

| Variabele | Betekenis |
| --- | --- |
| `MUNISENSE_USERNAME` | Account op login.munisense.net |
| `MUNISENSE_PASSWORD` | Wachtwoord van dat account |
| `ELIXIR_MAINTENANCE_SECRET` | Bearer-secret voor de worker |

Optioneel, enkel zetten als je wil afwijken van de default:

| Variabele | Default |
| --- | --- |
| `MUNISENSE_LOGIN_ORIGIN` | `https://login.munisense.net` |
| `MUNISENSE_API_ORIGIN` | `https://leuven-geluid.munisense.net` |
| `MUNISENSE_GROUP_ID` | `81` |
| `MUNISENSE_SESSION_TTL_MINUTES` | `30` |
| `ELIXIR_OPEN_DB_THRESHOLD` | `65` |
| `ELIXIR_CLOSE_DB_THRESHOLD` | `60` |
| `ELIXIR_QUIET_CYCLES_TO_CLOSE` | `2` |
| `ELIXIR_SAMPLE_MAX_AGE_MINUTES` | `15` |
| `ELIXIR_STATUS_MAX_AGE_MINUTES` | `15` |

Gebruik een **dienstaccount**, geen persoonlijke login: de worker logt de klok
rond ongeveer elk half uur opnieuw in.

## Handmatig testen

```bash
# Eén cyclus forceren en zien wat eruit komt:
curl -i -X POST \
  -H "Authorization: Bearer $ELIXIR_MAINTENANCE_SECRET" \
  http://localhost:3000/api/elixir/maintenance

# De cache uitlezen zoals de site hem ziet:
curl -s http://localhost:3000/api/bar-status | jq
```

Antwoorden van de maintenance-route:

- `200 {"ok":true,"isOpen":...,"reason":"open"}` gelukt; `reason` zegt waarom de
  status is wat ze is (`no-event`, `event-inactive`, `too-quiet`,
  `measurement-stale`, `no-measurement`).
- `401` secret ontbreekt of klopt niet.
- `503 NOT_CONFIGURED` geen credentials gezet.
- `502` Munisense weigerde of gaf iets onherkenbaars; de foutboodschap staat in
  de body, de vorige cachewaarde blijft staan.

## Vallen waar we in gelopen zijn

- **Zet de `Content-Type` van de multipart-post niet zelf.** Dan ontbreekt de
  boundary die undici zou genereren en faalt de login zonder duidelijke melding.
- **`redirect: "follow"` verliest cookies.** De 302 na de login draagt
  `Set-Cookie`; volgt fetch hem automatisch, dan zie je die headers nooit.
- **200 met HTML is een mislukte call.** Bij een verlopen sessie serveert
  Munisense de loginpagina met status 200 terug; de client behandelt dat als
  "niet ingelogd" en logt opnieuw in.
- **Geen credentials in de database of in git.** Ze staan enkel in `.env`, en
  foutmeldingen bevatten nooit de response-body.
