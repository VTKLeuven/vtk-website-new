# De planning van Burgieclan in de app

Burgieclan heeft een planner: je KU Leuven-lessenrooster (de TimeEdit-feed), wat
je ermee deed (afgevinkt, verborgen, verplicht, wekelijkse regels), je deadlines,
en een geëxporteerde agenda. De VTK-app toont **dezelfde planner**, onder
Kalender › Planning, en je kan er VTK-evenementen in zetten zodat je lessen en
VTK in één agenda staan.

"Dezelfde" is letterlijk: de planner staat enkel in de database van Burgieclan.
De site bewaart er niets van, ze geeft elke aanvraag van de app door. Wat je in de
app afvinkt, is op burgieclan.be afgevinkt, en omgekeerd. De kringkeuze erachter
staat in `docs/design-decisions.md`, "De planning in de app is die van
Burgieclan".

## Het geheel

```
  app ──cookie──▶ vtk.be /api/app/v1/planning/*
                     │  ondertekend: X-Vtk-User / -Timestamp / -Signature
                     ▼
                  Burgieclan /api/study_planner/*  ──▶ TimeEdit (lessenrooster)
                     │
                     └──▶ vtk.be /api/burgieclan/v1/events (publiek)
                          (de VTK-evenementen in de planning, elk uur)

  agenda-app ──▶ Burgieclan /api/study_planner/feed/<token>.ics
                 (lessen + deadlines + VTK-evenementen; dezelfde link als op Burgieclan)
```

## Waarom de site tussen de app en Burgieclan staat

De app logt in met het sessiecookie van vtk.be en bewaart geen token (zie
`app-api.md`, "Sessie en toegang"). Burgieclan kent enkel zijn eigen JWT's. Een
tweede login in de app (een OAuth-flow naar Burgieclan, met een token in de app)
zou een tweede sessie zijn die apart vervalt en apart kan breken. In plaats
daarvan spreekt de site, die het lid al kent, zelf met Burgieclan.

Dat gebeurt met een HMAC over `METHODE\nPAD\nTIJDSTIP\nGEBRUIKER\nBODY` met een
gedeeld geheim, hetzelfde stramien als de collab-server van Burgieclan:

| Kant | Bestand |
|---|---|
| VTK tekent | `apps/web/lib/burgieclan/signature.ts`, `client.ts` |
| Burgieclan controleert | `backend/src/Service/VtkService/VtkServiceSignature.php`, `backend/src/Security/VtkServiceAuthenticator.php` |

`GEBRUIKER` is base64url-JSON `{ sub, email, name }`. Burgieclan zoekt het lid
zoals bij een SSO-login (`UserRepository::findOrCreateFromVtkIdentity`): eerst op
`sub`, dan op e-mail (en koppelt dan), anders maakt het een account aan. Wie nooit
op Burgieclan inlogde, kan de planning dus meteen in de app gebruiken, en een
latere login op Burgieclan komt op hetzelfde account uit.

## Configuratie

| Waar | Variabele | Wat |
|---|---|---|
| vtk.be | `BURGIECLAN_API_URL` | De publieke URL van de backend: in productie `https://burgieclan.vtk.be` (de nginx van Burgieclan stuurt `/api` naar Symfony), lokaal `http://localhost:8000`. Ook de geëxporteerde agenda staat daar. |
| vtk.be | `BURGIECLAN_SERVICE_SECRET` | Gedeeld geheim, minstens 32 tekens. |
| vtk.be | `BURGIECLAN_URL` | Optioneel: de site zelf, voor links naar een vak of de planner. Standaard gelijk aan `BURGIECLAN_API_URL`. |
| vtk.be | `BURGIECLAN_CLIENT_ID` | Vandaag niet nodig; enkel voor een pairwise client (zie hieronder). |
| Burgieclan | `VTK_SERVICE_SECRET` | Hetzelfde geheim. Leeg = de app krijgt geen toegang. |
| Burgieclan | `VTK_URL` | vtk.be, voor de VTK-evenementen. Lokaal `http://host.docker.internal:3000`. |

Ontbreekt een van de twee eerste op vtk.be, dan antwoordt `/planning` met
`available: false` en zegt de app dat de planning nog niet beschikbaar is.

## De VTK-evenementen in een planning

De **keuze** staat bij Burgieclan, bij de rest van de planner
(`StudyPlannerVtkEvent`). Wat het evenement **is** (titel, uur, plaats, momenten)
komt van vtk.be: Burgieclan haalt het zelf op bij het toevoegen, nooit uit de
aanvraag, en ververst het elk uur voor evenementen die nog niet voorbij zijn
(`VtkEventRefresher`). Een evenement dat vtk.be niet meer publiceert, krijgt
`goneAt` en verdwijnt uit de planner en de export; komt het terug, dan staat het
er weer.

`/api/burgieclan/v1/events` (`lib/burgieclan/events.ts`) is publiek en geeft
enkel gepubliceerde evenementen: dezelfde gegevens als de publieke ICS-feed. Een
reeks (loopweek) komt met haar momenten; Burgieclan maakt er per moment een
afspraak van, zoals onze eigen feeds doen.

Toevoegen kan op twee plaatsen: in de app op het scherm van een evenement ("Zet
in mijn planning", enkel met een gekoppeld lessenrooster), en op Burgieclan via
de knop VTK-evenementen in de planner.

## Endpoints van de app

Zie `app-api.md`, "Planning". Kort: `GET`/`DELETE /planning`, `POST
/planning/subscription`, `/planning/sync`, `/planning/operations` en
`/planning/feed-token`. Elke aanvraag antwoordt met de hele `AppPlanning`, net
als bij Burgieclan, dus de app vraagt nooit twee keer.

## Vakken en documenten in de app

Sinds november 2026 toont de app onder Studies › Burgieclan ook je vakken en hun
documenten. Hetzelfde stramien als de planning: de site spreekt ondertekend
namens het lid (`lib/burgieclan/courses.ts`), Burgieclan antwoordt vanuit
`VtkAppController` (`/api/vtk_app/*`). De routes in de app staan in `app-api.md`,
"Studies".

**Waarom een eigen controller en niet de API Platform-routes.** De handtekening
mocht tot dan enkel op `/api/study_planner`, met als reden dat een gelekt geheim
de rest van de API (uploaden, stemmen, moderatie) niet in iemands naam mag
openen. Dat blijft zo: `VtkServiceAuthenticator` aanvaardt de handtekening nu ook
op `/api/vtk_app/`, en daar staat bewust enkel wat de app toont: vakken lezen en
zoeken, de documenten van een vak (goedgekeurd, plus je eigen nog niet
goedgekeurde), een kortlevende link naar een bestand (`DocumentFileVoter`), en
een vak als favoriet zetten of weghalen. De API Platform-routes blijven dicht
voor de handtekening (`VtkAppTest::testRestOfTheApiStaysClosed`).

**De querystring wordt niet getekend.** Symfony tekent `getPathInfo()` na, zonder
`?q=...`; `burgieclanRequest` tekent daarom enkel het pad.

## Peilingen

Ook de POC-peilingen staan op Burgieclan, als tab in de zijbalk die er enkel is
wanneer er voor het lid een peiling open staat. Hier loopt het **omgekeerd**:
Burgieclan vraagt aan vtk.be, namens het lid dat daar aangemeld is.

```
  Burgieclan /api/vtk_polls ──▶ vtk.be /api/burgieclan/v1/polls
     ondertekend: X-Vtk-User / -Timestamp / -Signature (zelfde geheim)
```

| Kant | Bestand |
|---|---|
| Burgieclan tekent | `backend/src/Service/VtkService/VtkPolls.php` |
| VTK controleert | `apps/web/lib/burgieclan/signature.ts` (`verifyBurgieclanRequest`), `apps/web/app/api/burgieclan/v1/polls/route.ts` |

- De route geeft dezelfde `AppPolls` als de app (`lib/pocPolls/appPolls.ts`) en
  neemt antwoorden aan zoals de app ze stuurt. Wie de peiling krijgt en hoe een
  antwoord anoniem bewaard wordt, beslist enkel vtk.be; Burgieclan bewaart niets.
- vtk.be zoekt het lid op de `sub` (de id, bij een publieke client), anders op
  het universitaire adres. Een verwijderd of onbekend account krijgt een 404, en
  dan toont Burgieclan gewoon geen peilingen.
- Enkel accounts die via VTK aanmeldden (`fluxusSub` bij Burgieclan) kunnen
  peilingen krijgen; voor de andere vraagt Burgieclan niets.
- Het pad zit in de handtekening, dus wat Burgieclan voor deze route tekent,
  opent niets anders op vtk.be. Ook hier een gedeelde vector:
  `apps/web/test/burgieclanPolls.test.ts` en
  `VtkPollsTest::testSignatureMatchesTheVtkWebsite` bij Burgieclan.

## Studietimer

De Blok-kalender op Burgieclan heeft een studietimer, en die is **dezelfde sessie
als Samen blokken** in de app: wat je op Burgieclan start, telt mee in je groepen,
je dagdoel en je reeks, en een sessie die je in de app startte, loopt op
Burgieclan gewoon verder. Zelfde richting als de peilingen:

```
  Burgieclan /api/vtk_study ──▶ vtk.be /api/burgieclan/v1/studeren
     ondertekend: X-Vtk-User / -Timestamp / -Signature (zelfde geheim)
```

| Kant | Bestand |
|---|---|
| Burgieclan tekent | `backend/src/Service/VtkService/VtkStudy.php` |
| VTK controleert | `apps/web/app/api/burgieclan/v1/studeren/route.ts`, `apps/web/lib/burgieclan/study.ts` |

- `GET` geeft de stand (`BurgieclanStudy`): de lopende sessie, de sessies van
  vandaag (wanneer begonnen, wanneer gestopt), dagdoel, reeks, hoeveel
  groepsgenoten nu zitten en een totaal per dag voor de kalender. Namen en
  groepen blijven op vtk.be.
- `POST { action: start | pause | resume | heartbeat | stop }` gebruikt exact de
  functies van de app (`lib/app-api/study.ts`), dus dezelfde regels: het
  levensteken, de pauzemarge van een minuut, het maximum van acht uur. Starten
  stuurt ook hier het bericht "de eerste is begonnen" naar de groep.
- Burgieclan stuurt elke minuut een `heartbeat` zolang de pagina openstaat, ook
  in een tabblad op de achtergrond: op een laptop studeer je in een ander
  tabblad (je cursus), en dat is geen pauze. Sluit je de pagina, dan telt de
  sessie tot het laatste levensteken, zoals in de app.
- Enkel accounts die via VTK aanmeldden (`fluxusSub`) gebruiken deze timer; de
  andere houden de eigen timer van Burgieclan.
- Gedeelde vector: `apps/web/test/burgieclanStudy.test.ts` en
  `VtkStudyTest::testSignatureMatchesTheVtkWebsite` bij Burgieclan.

## Vallen waar we in gelopen zijn

1. **API Platform spreekt enkel JSON-LD.** Een `Content-Type: application/json`
   krijgt een 415. `client.ts` stuurt daarom `application/ld+json`; de velden
   zelf zijn gewone JSON.
2. **De handtekening geldt enkel onder `/api/study_planner`**, en niet voor de
   feed (die heeft geen login nodig). Een gelekt geheim mag niet de documenten of
   de moderatie van Burgieclan openzetten. Breid `PATH_PREFIX` in
   `VtkServiceAuthenticator` niet uit zonder die afweging.
3. **Een pairwise client.** Vandaag staat elke client op `public` (geen scherm in
   /admin/sso zet er een op pairwise), en dan is de `sub` gewoon de id van het
   lid. Komt de client van Burgieclan ooit op `pairwise`, dan is
   de `sub` die Burgieclan kent een HMAC van host en lid-id, niet de id zelf.
   `subjectFor` in `client.ts` rekent hem na zoals `computePairwiseSub` in
   `@better-auth/oauth-provider`, maar enkel met `BURGIECLAN_CLIENT_ID` erbij.
   Zonder klopt de `sub` niet, en dan koppelt Burgieclan op e-mail: werkt, tot
   iemand zijn universitaire adres verandert.
4. **`localhost` in de container van Burgieclan is de container zelf.** De
   `extra_hosts`-regel `localhost:host-gateway` komt in `/etc/hosts` ná
   `127.0.0.1 localhost`, dus wint niet. Lokaal is `VTK_URL` daarom
   `http://host.docker.internal:3000`.
5. **Dezelfde vector aan beide kanten.** `apps/web/test/burgieclanPlanning.test.ts`
   en `StudyPlannerVtkTest::testSignatureMatchesTheVtkWebsite` bij Burgieclan
   rekenen dezelfde handtekening uit. Verander je het schema, verander het dan
   aan beide kanten en in beide tests; anders krijgt de app stil 401's (de site
   logt dat als "Burgieclan weigerde de handtekening").
