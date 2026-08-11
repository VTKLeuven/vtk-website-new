# Design decisions & kringwerking

Dit document legt niet-vanzelfsprekende **product- en werkingskeuzes** van VTK vast:
beslissingen die voortkomen uit hoe onze kring concreet werkt en die je niet uit de
code of git-historiek kan afleiden. Bedoeld zodat toekomstige (AI-)sessies de context
kennen en betere keuzes maken.

> **Voor toekomstige agents:** wanneer je een feature implementeert waarvan de
> gewenste werking een _kringkeuze_ is (niet puur technisch, niet vanzelfsprekend),
> voeg hier een sectie toe. `CLAUDE.md` verwijst naar dit bestand.

De inhoud beschrijft _waarom_ het zo werkt. De concrete implementatie staat in de code
(schema in `packages/db/prisma/schema.prisma`, logica in `apps/web/lib/theokot*.ts`,
acties in `apps/web/app/actions/theokot.ts`).

---

## Hoofdnavigatie — Info, Theokot en Shiften

De tabs in de header komen uit de `HeaderTab`-tabel; `HEADER_TABS` in
`packages/db/src/groups.ts` is de seed én de fallback wanneer die tabel leeg is.
De volgorde en labels zijn dus een kringkeuze, geen technische:

- De vroegere **"Aanbod"**-tab heet nu **"Info"** en leeft op `/info`. Het is nog
  steeds dezelfde hub-pagina die naar de diensten doorverwijst; enkel de naam dekt
  de lading beter.
- **Theokot** en **Shiften** kregen een eigen tab (`/theokot`, `/shift`) meteen na
  Info, omdat het de twee diensten zijn die studenten het vaakst nodig hebben. Ze
  staan nog steeds ook als kaart op de Info-pagina.
- De tab-**code blijft `AANBOD`** ondanks de hernoeming. Codes zijn de sleutel
  waarop de seed upsert en waar bestaande `Page`-rijen aan hangen; een code
  wijzigen zou een tweede tab aanmaken in plaats van de bestaande te hernoemen.
- **"Over het ledenportaal"** verhuisde van `/info` naar `/ledenportaal` om die
  slug vrij te maken. Let op: die pagina is de bij KU Leuven geregistreerde SSO
  info-URL (`apps/web/lib/sso.ts`), dus de registratie bij KU Leuven moet mee
  aangepast worden.
- **Tweedehands en tijdsloten draaien op Cudi**, niet op deze site. De footer en de
  homepage-quicklinks linken daarom extern naar `cudi.vtk.be`.
- De **uitleendienst** (`logistiek.vtk.be`) hangt als menu-item onder Info, naast
  Kalender en Piano, en niet als twaalfde tab: elf tabs is al de grens waarop de
  header naar een menuknop overschakelt. Ze staat ook in de footerkolom Service,
  want ze is een dienst en geen categoriepagina.
- **Een hernoeming van een tab bereikt een bestaande database enkel via een
  migratie.** De seed doet `headerTab.upsert(... update: {} ...)` en werkt een
  bestaande rij bewust niet bij (labels, slug en volgorde zijn admin-beheerd).
  Toen "Aanbod" naar "Info" ging, is dat blijven liggen: elke database van voor de
  hernoeming stond nog op slug `aanbod`, dus `/info` gaf daar 404 terwijl de
  footer en de redirects van de oude vtk.be-adressen er wel naartoe wezen. De
  migratie `20260808150000_header_tab_aanbod_to_info` zet dat recht. Doe dit
  voortaan meteen mee: verander je een default in `HEADER_TABS`, schrijf er dan de
  migratie bij.

---

## Fotoalbums leven in Immich, en nergens anders

De publieke mediapagina (`/media`, met `/fotos` als redirect) leest haar albums
uitsluitend uit **Immich**: albums met de markering `[gallery]` in hun
beschrijving verschijnen op de site. Beheer gebeurt op één plek, `/admin/media`:
daar maak je een album aan, upload je de foto's en zie je meteen welke albums
publiek staan.

Daarnaast bestond er lang een tweede, lokale albumopslag (`PhotoAlbum` +
`PhotoPhoto`, beheerd via een eigen `/admin/albums`-scherm met uploads naar onze
eigen S3). Die kwam op geen enkele publieke pagina nog terecht: twee plaatsen om
een album te maken, waarvan er één niets deed. Het adminscherm en de bijhorende
acties zijn daarom verwijderd.

- De **tabellen en de bestaande rijen blijven staan**, samen met de publieke
  download-route `/api/albums/[slug]/download`. Er gaat dus geen data verloren en
  oude links blijven werken; er is enkel geen scherm meer om ze te beheren.
- `photos.manageAlbums` blijft de permissie voor fotoalbums: ze geeft nu toegang
  tot het albumgedeelte van `/admin/media`. `media.manage` blijft over voor
  magazines en promovideo's, zodat Communicatie en de fotografen apart bediend
  kunnen worden.
- De homepage-instelling **"Uitgelichte albums"** is mee verdwenen. Ze schreef
  `home.featuredAlbums` weg met vrij getypte slugs, maar de homepage toonde die
  albums nergens. Wil je later toch uitgelichte albums op de homepage, bouw dan
  eerst de sectie en kies de albums met een keuzelijst uit Immich.

---

## Aankondigingen op de homepage

Een aankondiging is een bericht dat als venster over de homepage komt, beheerd
via **Admin → Website → Aankondigingen** (recht: `home.edit`, want het is
homepage-inhoud).

- **Meerdere aankondigingen mogen naast elkaar bestaan**, elk met hun eigen
  venster (`startsAt`/`endsAt`, allebei optioneel) en een aan/uit-schakelaar. Zo
  kan je er een op voorhand klaarzetten zonder dat ze al verschijnt.
- **De homepage toont er hoogstens één**: twee berichten tegelijk over dezelfde
  pagina leest niemand. Staan er meerdere klaar, dan wint de meest recente.
- **Wie ze wegklikt, ziet ze niet opnieuw.** Dat onthoudt de browser per id in
  localStorage (de laatste tien), niet de server: het gaat om een venster
  wegklikken, niet om iets dat we per lid willen bijhouden. Een nieuwe
  aankondiging verschijnt dus wel weer, ook bij wie de vorige wegklikte.
- **Oude aankondigingen blijven staan** als historiek in het beheerscherm. Uit
  zetten haalt ze van de site; verwijderen wist ze ook uit die historiek.

---

## Headertabs kunnen naar een externe site linken

`HeaderTab.externalUrl` maakt van een tab een gewone link naar buiten: staat er
een URL in, dan opent de headerknop die site in een nieuw tabblad in plaats van
de categoriepagina `/<slug>` te tonen. **Career** gebruikt dit en gaat
rechtstreeks naar `career.vtk.be`, omdat Career daar zijn eigen site heeft; de
categoriepagina `/career` blijft bestaan voor wie ze via een directe link opent.

Dit is bewust een veld en geen uitzondering in de code: Cursusdienst (cudi) en
toekomstige werkingen met een eigen site kunnen hetzelfde doen zonder release.
Je stelt het in bij Admin → Website → Inhoud, op de tab zelf.

Elke tab klapt in de header ook uit. Wat erin staat:

- **De pagina's onder die categorie**, dezelfde selectie als de categoriepagina
  toont (zichtbaar in de header en gepubliceerd). Daar hoef je niets voor te
  doen; een nieuwe pagina staat meteen in het menu.
- **Extra items uit `HeaderTabLink`**, voor bestemmingen op een andere site.
  Career heeft zo *Jobfair* en *Contact voor bedrijven* op career.vtk.be;
  Cursusdienst heeft *Bestel boeken*, *Tweedehands*, *Printer* en *Subsidies* op
  cudi.vtk.be. Ook die beheer je op de tab in Admin → Website → Inhoud.

De seed zet die items create-only per (tab, URL): een hernoemd label blijft dus
staan, en een item dat de admin verwijderde komt bij een reseed niet terug zolang
de URL dezelfde blijft.

---

## Theokot — broodjes-reservatiesysteem

Theokot is de cafetaria/broodjesbar van VTK. Studenten reserveren vooraf broodjes,
halen ze af aan de balie en betalen daar. Post **Theokot** beheert het systeem.

### Verkoopsessies & aanbod

- Eén **`TheokotSession`** = één open verkoopdag. Iemand van Theokot zet wekelijks
  (meestal vrijdag/zaterdag) de sessies van de **volgende week** online.
- Er is een **standaardaanbod** (`TheokotProduct`, geseed) met vaste broodjes,
  aantallen en prijzen. Bij het aanmaken van een week wordt dit als **snapshot**
  naar `TheokotSessionItem` gekopieerd. Reden: latere catalogus- of prijswijzigingen
  mogen bestaande sessies en bestellingen niet met terugwerkende kracht veranderen.
- **Week aanmaken doe je met aanbod + uren voor de hele week**: bij het aanmaken van
  een verkoopweek stel je één keer het aanbod (broodjes/prijzen/aantallen) en de uren
  ('Afhalen vanaf/tot', 'Besteldeadline', 'Bestellen opent') in die voor álle gekozen
  dagen gelden. Dat scheelt werk in weken met een volledig ander aanbod. **Nadien** kan
  je nog steeds per dag bijsturen (uren, open/dicht, aanbod).
- **"Broodje van de week"** is gewoon het aanbod-item dat als _weekly special_
  gemarkeerd is (checkbox "V/d week" in de aanbod-editor). De **naam** van dat item is
  wat het die week concreet is (bv. hernoem "Broodje van de week" naar "Broodje kip
  curry"). Er is dus geen apart label-veld: je stelt het in bij "Aanbod bewerken", en
  de bestelpagina toont het item met een ★-markering. (De DB-kolommen
  `weeklySpecialLabel*` bestaan nog maar worden niet meer gebruikt.)

### Bestelvenster (tijden zijn Brussel-tijd, zomer én winter)

- Studenten bestellen **2 dagen op voorhand** (`orderLeadDays`), vanaf **12:00**
  (`orderOpenTime`). Dus om 12:00 komen de broodjes voor over 2 dagen online.
- Annuleren/wijzigen kan tot **10:30** op de verkoopdag (`cancelDeadline`); dan wordt
  de turf-lijst geprint.
- **Waarom expliciete Brussel-tijd:** "12:00" moet 12:00 lokale tijd zijn in zowel
  zomer- als winteruur. Daarom rekent `lib/theokot.ts` met `Europe/Brussels` via
  `Intl` (geen vaste UTC-offset).

### Limieten

- Max **X** items per bestelling (`maxItemsPerOrder`) waarvan max **Y** broodje van
  de week (`maxWeeklySpecialPerOrder`), met **X > Y**. Instelbaar in het admin-paneel;
  hoeft niet wekelijks te wijzigen.
- Eén bestelling per persoon per sessie (DB-uniek). **Annuleren = verwijderen** van de
  bestelling (geeft voorraad + het uniek-slot vrij, zodat opnieuw bestellen kan vóór
  de deadline). Er wordt dus geen annulatie-historiek bijgehouden — enkel no-shows.

### Afhalen

- **Afhaalpagina** (recht `theokot.pickup`): baliemedewerker geeft het **r-nummer** in of
  **scant de studentenkaart**, ziet de bestelling + totaal te betalen, en drukt op
  **"opgehaald"**. Daarna kan die bestelling geen tweede keer opgehaald worden. Bestaat in
  twee vormen die dezelfde component delen: in het admin-paneel
  (`/admin/theokot/afhalen`) én als **losstaande pagina buiten admin**
  (`/theokot/balie`) voor shifters die enkel de balie mogen bedienen (geen andere
  admin-toegang).
- De **studenten-reservatiepagina** leeft op `/theokot` (aliassen `/shop` en
  `/info/theokot` sturen ernaartoe) en heeft een eigen tab in de hoofdnavigatie.
- **Openingsuren** (startpagina) hebben een eigen tab onder Admin → Theokot, los van de
  overige instellingen.
- **Kaartscanner**: de scanner werkt als toetsenbord en tikt `serial;cardAppId` + Enter.
  Eén invoerveld verwerkt beide: bevat de invoer een `;` dan gaat ze naar de KU Leuven
  `idverification`-API (`lib/kul-card.ts`) die een r-nummer teruggeeft; anders wordt de
  invoer als r-nummer behandeld. Credentials (`KUL_CARD_*`) staan los van de OIDC-login —
  zie README.
- **Afhaaluren** (default **12:00–16:00**, per dag aanpasbaar) zijn NIET dezelfde als de
  **openingsuren van Theokot** op de startpagina (default ma–vr **10:30–18:00**). De
  r-nummerpagina werkt ook vóór 12:00.

### No-shows & bans

- Een bestelling telt pas als **no-show** vanaf **15 min na sluitingstijd**
  (`noShowGraceMinutes`). Verwerking gebeurt door een **ingebouwde scheduler**
  (`apps/web/instrumentation.ts`) die periodiek `processDueNoShows` draait — geen
  externe cron. Idempotent via `TheokotSession.processedAt`.
- Bij een no-show krijgt de student een **waarschuwingsmail** (`lib/mail.ts`,
  nodemailer/SMTP; logt enkel wanneer SMTP niet geconfigureerd is).
- Na **X** no-shows (`noShowThreshold`) volgt een **ban** van **Y** dagen
  (`banDurationDays`): tijdens de ban kan de persoon niets bestellen, daarna weer wel.
  No-shows worden geteld **sinds het einde van de laatste ban**, zodat iemand na een
  ban met een schone lei begint en niet meteen opnieuw geband wordt.
- Bans en no-show-historiek zijn zichtbaar en **corrigeerbaar** in het admin-paneel
  (`/admin/theokot/bans`). Een correctie kan meteen de actieve ban opheffen.

### Turf-lijst

- Voor elke verkoopdag kan een **turf-lijst** geprint worden (`/admin/theokot/turflijst`,
  print-geoptimaliseerde HTML → browser-PDF). Per broodjesoort: **aantal gereserveerd**,
  een **lege kolom om te turven** hoeveel er al gemaakt zijn, en een **checkmark-kolom**
  om af te vinken dat alle broodjes van die soort klaar zijn.

### Scheduler-caveat

- De no-show-scheduler draait in-proces. In deze single-container deploy is er precies
  één instance. Bij horizontaal schalen zou hij meervoudig draaien; de verwerking blijft
  correct (idempotent via `processedAt`), maar mails zouden dan dubbel geprobeerd kunnen
  worden. Verplaats de trigger in dat geval naar één externe cron die
  `processDueNoShows` aanroept.

### Permissies

- `theokot.manage` — sessies/aanbod, config, bericht, openingsuren, bans, historiek.
- `theokot.pickup` — afhaalbalie + turf-lijst.
- Beide worden in de seed toegekend aan groep **THEOKOT**.

---

## Piano (lokaal 01.52 in het kasteel)

VTK heeft een eigen piano in lokaal 01.52 van het kasteel, naast de promotiezaal.
Studenten mogen er gratis op spelen en reserveren daarvoor zelf een tijdslot op
`/piano`. Op de oude site stond dit op `/reservations/piano`; de afspraken
(gratis, wekelijks, begeleidende brief) zijn overgenomen, de manier waarop ze
afgedwongen worden niet helemaal. Zie hieronder.

### Slots bestaan niet als rijen

De uren volgen uit een handvol **terugkerende vensters** (`PianoWindow`, bv. "elke
ma/di/do 19u-22u van eind september tot eind mei") min de **sluitingsdagen**
(`PianoClosure`, in de praktijk de sluitingsdagen van de KU Leuven). De concrete
tijdsloten worden per keer berekend voor de week die op het scherm staat.

- Een academiejaar aan avondslots zou anders duizend rijen zijn die iemand elk
  jaar opnieuw moet aanmaken. Nu is dat één rij met een begin- en einddatum.
- De **slotlengte staat in de instellingen**, niet per venster: één piano, één
  ritme. Wijzig je ze, dan verschuiven de uren op de pagina; reeds gemaakte
  reservaties blijven op hun oorspronkelijke uur staan.
- Enkel een **geboekt** slot krijgt een rij (`PianoReservation`), met een unieke
  index op `startsAt`. De piano is er maar één, dus dubbel boeken hoort in de
  database te falen en niet enkel in de check vooraf.
- Annuleren **verwijdert** de rij. Er hangt geen geld en geen sanctie aan een
  pianoreservatie, dus historiek zou hier enkel ruis zijn (anders dan bij Theokot,
  waar no-shows tot een ban leiden).

### De weeklimiet is hard, de oude site was zachter

Op vtk.be stond: "One reservation each week will be assigned to you, if you want
to play more times a week, other students are given priority." Dat veronderstelt
iemand die de aanvragen manueel verdeelt. Hier is het een **harde limiet**
(`maxPerWeek`, standaard 1, per ISO-week van maandag tot zondag): een tweede slot
in dezelfde week wordt geweigerd met de uitleg dat je eerst moet annuleren.

- Bewuste keuze: automatisch toewijzen vraagt een aanvraag-en-verdeel-flow die
  niemand wil bedienen voor een piano. Wie er echt meer wil op, kan altijd de
  vice aanspreken; die kan een slot vrijmaken in het beheer.
- Enkel slots die **nog moeten komen** tellen mee. Een slot dat al gespeeld is
  blokkeert je week niet meer, want dan zou een annulering achteraf nooit meer
  helpen.
- Er is ook een **horizon** (`horizonDays`, standaard 28 dagen): zonder die grens
  zou één iemand het hele jaar kunnen volboeken.

### De begeleidende brief blijft mensenwerk

De brief die je bij de vice in Blok 6 haalt en aan de bewaking moet kunnen tonen,
staat in de tekst boven de agenda (`Setting` `piano.info`, Markdown, beheerd via
`/admin/piano`) en niet in de flow. We controleren niet of iemand ze heeft: dat
is een afspraak tussen het lid en de vice, geen toestand die de site kent.

### Uren zichtbaar zonder account, reserveren niet

De agenda staat er ook voor wie niet aangemeld is, met een melding erboven; enkel
het effectief boeken vraagt een aanmelding. Zo kan je nakijken wanneer de piano
vrij is zonder eerst door de KUL-login te moeten. Dat volgt de oude site
("Gelieve aan te melden om een slot te reserveren").

### Een sluitingsdag schrapt de reservaties die erin vielen

Wie al geboekt had binnen een periode die achteraf gesloten wordt, houdt anders
een reservatie over voor een slot dat niet meer bestaat. Het beheerscherm zegt dat
vooraf; er vertrekt **geen mail**, dus de vice verwittigt die leden zelf.

### Permissies & navigatie

- `piano.manage` — vensters, sluitingsdagen, instellingen, infotekst en het
  schrappen van andermans reservatie. Hoort bij de vice.
- De pagina hangt als menu-item onder de **Info**-tab (`HeaderTabLink` naar
  `/piano`), zoals ze op de oude site onder "Aanbod" stond. Het is een eigen route
  en geen contentpagina, dus ze komt er niet vanzelf in.

---

## Deurtoegang (kaartscanner op de deur)

Aan de deur hangt dezelfde KU Leuven-kaartlezer als aan de Theokot-balie, maar dan
gekoppeld aan een Raspberry Pi die een elektrische lock bedient. De scan wordt
server-side geverifieerd (`verifyStudentCard` → r-nummer → `User`), net als bij de
balie; de Pi stuurt enkel de ruwe scan door. Website-kant: `apps/web/app/api/door/*`
en `apps/web/lib/door-*.ts`; Pi-kant: `infra/door/`.

### Drie aparte rechten (bewust gescheiden)

- **`door.open`** — mag de deur openen met zijn studentenkaart. Dit ken je toe aan
  rollen in `/admin/roles`, zodat "wie geraakt binnen" gewoon werkingsjaar-gescoped
  meeloopt met de rollen/posten (reset dus mee op 15 juli, zoals alle rechten).
- **`door.remoteOpen`** — toont de "deur openen"-knop op het admin-dashboard.
  **Bewust los van `door.open`:** wie met zijn kaart binnen mag, hoeft daarom nog
  niet de deur voor anderen te kunnen openen vanop afstand. Dit is de kleinere,
  bewustere groep (bv. praesidium/onthaal).
- **`door.manage`** — de `/admin/deur`-tab: tijdelijke toegang geven, de
  gebruiksstatistiek en de log bekijken.

### Tijdelijke toegang los van de rollen

Naast `door.open` kan een `door.manage`-houder iemand **tijdelijke** toegang geven met
een start/eind-venster (`DoorAccessGrant`). Bedoeld voor gasten, externen of
kortlopende uitzonderingen waarvoor je geen rol wil aanmaken. `userMayOpenDoor` =
`door.open` **OF** een lopende grant. Verlopen grants blijven staan als historiek maar
tellen niet meer mee, en verdwijnen uit de beheerlijst.

### Alles wordt gelogd, ook wat weigerde

Elke deurgebeurtenis is één `DoorAccessLog`-rij: toegelaten én geweigerde kaarten,
onbekende kaarten (geverifieerd maar niet aan een gebruiker gekoppeld), fouten, en
remote-opens. Zo zie je in `/admin/deur` niet enkel wie binnenging, maar ook of er
kaarten geweigerd werden (bv. iemand zonder toegang die het toch probeert).

### Offline blijft de deur werken

De deur mag niet vastlopen als het internet of de site wegvalt. De Pi houdt daarom een
**offline-cache** (per kaart, TTL) en beslist daarop wanneer de site onbereikbaar is;
geweigerde/onbekende scans tijdens een outage worden lokaal gebufferd en naar de site
geflusht zodra ze terug bereikbaar is (die rijen dragen `offline = true`).

### Remote-open gaat rechtstreeks over Tailscale

De server en de Pi zitten op hetzelfde tailnet. De dashboardknop laat de **server de Pi
rechtstreeks aanroepen** (`POST /open` op de listener van de Pi), niet omgekeerd: geen
polling, geen command-queue, near-instant. De vorige oplossing (een iPhone-shortcut die
naar de server ssh'te) had merkbare vertraging. Eén gedeeld device-secret authenticeert
beide richtingen (Pi → site en site → Pi); het staat versleuteld onder Admin → IT met
een env-fallback.

---

## Ledenregistratie & onboarding (KUL SSO)

Studenten **registreren zichzelf** door voor het eerst in te loggen met KU Leuven
SSO. Concrete implementatie: hook in `packages/auth/src/auth.ts`, gate in
`apps/web/app/[locale]/layout.tsx` + `apps/web/proxy.ts`, formulier in
`apps/web/components/profile/ProfileForm.tsx`, actie in
`apps/web/app/actions/onboarding.ts`, velden in het `User`-model.

### Wie mag registreren

- **Elke KU Leuven-account** mag zichzelf aanmaken via SSO. Dit is een **bewuste
  omkering** van de vroegere policy (self-provisioning was geblokkeerd; enkel
  vooraf door admins toegevoegde leden konden inloggen). Reden: VTK is een
  studentenkring en wil dat studenten zich zelf kunnen inschrijven.
- Praktisch: er is geen `user.create`-hook meer die nieuwe SSO-identiteiten
  weigert. E-mail/wachtwoord-signup blijft uit; admin-aangemaakte gebruikers
  gaan rechtstreeks via `prisma.user.create` en raken deze flow niet.
- Een nieuw lid start **zonder groepen/permissies** en met `onboardedAt = null`.

### Verplichte onboarding

- Zolang `onboardedAt` null is, stuurt de **onboarding-gate** het lid bij elke
  pagina naar `/onboarding`. Pas na het invullen (dan wordt `onboardedAt`
  gestempeld) valt die gate weg. De gate (samen met de studiebevestiging-gate)
  zit in `proxy.ts`, niet in de `[locale]`-layout: een `redirect()` vanuit een
  gedeelde layout tijdens een client-side (RSC) navigatie zet de App
  Router-cache in een oneindige refetch-lus. Op de netwerkgrens is het een
  gewone 307 die de router netjes volgt. Zie `gateRedirect` in `proxy.ts`.
- Gevraagde gegevens: **naam** (voor- en achternaam apart), **r-nummer**
  (_optioneel_), **kotadres** (straat, huisnummer, bus _optioneel_, postcode,
  stad), **geboortedatum**, **persoonlijke mail**, en welk adres (universiteits-
  of persoonlijke mail) de **voorkeur** krijgt voor communicatie. De
  universiteitsmail is de SSO-/login-mail (`User.email`) en wordt niet apart
  gevraagd, enkel getoond.
- **Voor- en achternaam staan apart** (`User.firstName`/`lastName`) omdat de
  mailinglijst-exports die als aparte kolommen nodig hebben. `User.name` blijft
  de weergavenaam en wordt eruit samengesteld; enkel bij leden die de onboarding
  nog niet deden (of die via een bulk-import binnenkwamen) wordt `name` gesplitst
  als startwaarde. Zie `splitFullName`/`nameParts` in `@vtk/auth`.
- Het **r-nummer** moet `rXXXXXXX` zijn (7 cijfers) en is uniek over alle leden;
  het is optioneel zodat de registratie niet blokkeert voor wie het niet bij de
  hand heeft, maar de Theokot-kaartscanner zoekt er wel op.
- **Profielfoto is optioneel.** Ze wordt opgeslagen als `avatarKey` en verschijnt
  op `/praesidium` en `/pocs` **enkel** als het lid daar effectief in staat.
- Alles blijft achteraf bewerkbaar op `/account` (zelfde formulier, zonder dat
  `onboardedAt` opnieuw gezet wordt).

### Studie (richtingen & studiejaren)

- Een lid kan **meerdere richtingen** aanduiden (`StudyProgramme`-enum,
  `User.studyProgrammes` array) en ook **meerdere studiejaren** (`StudyYear`-enum,
  `User.studyYears` array): 1ste/2de/3de bachelor of 1ste/2de master. Meerdere
  jaren zijn nodig omdat een lid met een gespreid programma bv. tegelijk vakken
  van 2de en 3de bachelor opneemt; daarom checkboxes en geen dropdown.
- De lijst richtingen is **KU Leuven-ingenieurswetenschappen-specifiek** en staat
  vast in de enum; NL/EN-labels leven in de i18n-dictionaries (`onboarding.programmes`
  / `onboarding.years`). Nieuwe richting = enum-waarde + label toevoegen +
  `STUDY_PROGRAMMES` in `apps/web/lib/profile.ts` bijwerken.
- Beide zijn **optioneel** (geen harde vereiste in de onboarding), zodat de
  registratie niet blokkeert; te wijzigen op `/account`.
- **"Ik studeer niet aan de faculteit"** (`User.notAtFaculty`) is er voor leden
  zonder ingenieursopleiding aan de faculteit. Het is bewust **geen
  `StudyProgramme`-waarde** maar een apart veld: het is geen richting, en als
  enum-waarde zou het opduiken als fantoom-richting overal waar richtingen
  opgelijst worden (o.a. de mappen in de career-ZIP). Wie dit aanduidt valt uit
  **alle** career-lijsten, ook de algemene; de andere categorieën blijven gewoon
  werken.
- **"Ik studeer niet (meer)"** (`User.notStudying`) is er voor afgestudeerden of
  gestopte leden. Bewust **los van `notAtFaculty`**: dat betekent "studeert wél,
  maar elders"; dit betekent "studeert niet". Ook bewust **geen `StudyYear`**:
  het is geen jaar, en als enum-waarde zou het overal opduiken waar jaren
  opgelijst worden (o.a. de per-jaar-mappen in de career-ZIP). Het lid blijft
  lid, maar valt uit **élke** studiegerichte mailinglijst (zie hieronder). Beide
  vlaggen zijn onafhankelijk; wie niet (meer) studeert hoeft geen richting of
  jaar meer aan te duiden.

### Jaarlijkse studiebevestiging ("wie is nog actief student?")

- **Het probleem:** vroeger zat de cursusdienst in dezelfde applicatie. Wie boeken
  wou bestellen moest een richting aanduiden, en die werd elk jaar gereset. Dat
  gaf ongewild een jaarlijks signaal over wie nog actief studeerde. Nu cudi een
  aparte site is (en we die bewust **niet** koppelen), viel dat signaal weg.
- **De oplossing:** niet de koppeling herbouwen, maar de _jaarlijkse herdeclaratie_.
  `User.studyConfirmedYear` houdt bij in welk werkingsjaar het lid zijn studie
  laatst bevestigde. Loopt dat achter op `currentWorkingYear()` (rollover op
  15 juli, zie `lib/workingYear.ts`), dan is het profiel verlopen.
- Een verlopen profiel wordt **blokkerend** afgedwongen door een tweede gate in
  `app/[locale]/layout.tsx`, na de onboarding-gate: het lid gaat naar
  `/studie-bevestigen` voor het de site verder kan gebruiken.
- **Bewust geen reset van de data** (in tegenstelling tot het oude systeem): de
  vorige keuze blijft staan en wordt voorgevuld, zodat bevestigen één klik is.
  Dat verschil bepaalt of leden bevestigen of afhaken.
- **Waarom dit sterker is dan de oude cudi-truc:** inloggen gaat via KU Leuven
  SSO. Een afgestudeerde wiens KUL-account uit staat, geraakt niet meer binnen en
  kan dus nooit bevestigen. "Bevestigd dit werkingsjaar" betekent daardoor in de
  praktijk: heeft een werkend KUL-account **én** verklaart zelf nog te studeren.
- `saveProfileAction` (onboarding + `/account`) stempelt `studyConfirmedYear` ook,
  want wie dat formulier invult declareert daarmee net zijn studie.

### Mailinglijsten (admin-export)

- De admin-tab **Mailinglijsten** (`mailinglists.export`) exporteert per categorie
  de leden die ze aangevinkt hebben. Kolommen zijn altijd `firstname`, `lastname`,
  `email`, waarbij `email` het **voorkeursadres** is (`emailPreference`), niet per
  se de login-mail. Zonder ingevulde persoonlijke mail valt dat terug op de
  universiteitsmail.
- Enkel **actieve** leden komen in een export: een gedeactiveerd account hoort
  geen mails meer te krijgen.
- Enkel leden die hun studie **dit werkingsjaar bevestigd** hebben (zie de
  jaarlijkse studiebevestiging hierboven) zitten in een lijst; dat geldt voor
  **alle** lijsten, ook "Alle studenten". Afgestudeerden vallen er zo vanzelf
  uit, zonder manuele opkuis.
- Enkel leden die **nog studeren**: wie bij de bevestiging "ik studeer niet
  (meer)" (`notStudying`) aanduidde, bevestigt zijn profiel wél en passeert dus
  de gate, maar hoort in **geen enkele** studiegerichte lijst. Zonder deze extra
  filter zou zo'n lid via de bevestiging net terug in de lijsten belanden.
- **"Alle studenten"** is een synthetische lijst: iedereen, zonder opt-in. Ze is
  bewust **geen `MailCategory`** en heeft dus geen checkbox bij "Mijn account",
  want dit is de lijst om sowieso iedereen te kunnen bereiken.
- **Career werkt per richting** en exporteert daarom een ZIP i.p.v. één CSV:
  een algemene lijst, een opsplitsing per studiejaar (2de bachelor, 3de bachelor,
  alle bachelors, 1ste master, 2de master, alle masters) en per richting nog eens
  2de bachelor / 3de bachelor / masters. Alle lijsten zijn deelverzamelingen van
  de **Career-opt-ins**; wie Career niet aanvinkte zit in geen enkele.
- Eerste bachelors krijgen **geen eigen career-lijst** (enkel via "alle
  bachelors"), en per richting bestaan enkel 2de/3de bachelor en masters, want
  daar zijn de career-activiteiten op gericht.
- Omdat een lid meerdere studiejaren en richtingen kan aanduiden, **komt het in
  elke lijst waar het bij hoort**. Lege lijsten blijven in de ZIP zitten zodat de
  mappenstructuur voorspelbaar is.

### Mailinglijsten in Brevo (automatische sync)

De vroegere werkwijze was: begin van het jaar, nadat iedereen ingelogd en zijn
richting aangeduid had, de lijsten één keer downloaden en handmatig in Brevo
importeren. Dat had twee stille gebreken: leden die hun richting **later**
invulden werden gemist, en de voorkeuren die een lid op de site kon zetten (welke
mails, welke richting) **deden niets**, want de lijsten in Brevo werden nooit meer
bijgewerkt. De Brevo-sync (`apps/web/lib/brevo/`) haalt de tussenpersoon weg.

- **Optioneel, achter `BREVO_KEY`.** Geen key = integratie uit en alles gedraagt
  zich zoals vroeger; de CSV/ZIP-download blijft dan (en ook mét sync) bestaan als
  backup. Zelfde stramien als de cudi-koppeling.
- **Twee sporen, net als cudi.** Een **real-time** best-effort push bij elke
  profiel- of studiewijziging (via `after()` in de onboarding-/bevestig-actions,
  zodat een hapering bij Brevo het opslaan niet breekt), plus een **dagelijkse
  reconciliatie** (`POST /api/admin/mailinglijsten/sync`, bearer-secret
  `BREVO_SYNC_SECRET`) als vangnet. Er is ook een "Nu synchroniseren"-knop in de
  admin-tab.
- **De site is de enige bron van waarheid.** De reconciliatie doet upsert **én
  prune**: wie een categorie afvinkt, van richting verandert, afstudeert
  (`studyConfirmedYear` verloopt), gedeactiveerd wordt of "ik studeer niet meer"
  aanduidt, verdwijnt vanzelf uit de betrokken lijsten. Daarom zijn het **verse,
  door de site aangemaakte** Brevo-lijsten (folder "VTK Website"), niet bestaande
  lijsten waar ook handmatig toegevoegde contacten in kunnen zitten die een prune
  zou wissen.
- **Wie in welke lijst hoort, is exact dezelfde regel als de CSV-export.**
  `desiredListKeys()` in `lib/brevo/contacts.ts` is de JS-tegenhanger van
  `listWhere()` in `lib/mailinglists.ts`; `test/brevoSync.test.ts` bewaakt dat ze
  gelijk blijven. Lopen ze uiteen, dan verschilt de sync van de download.
- **Career splitst niet in tientallen lijsten, maar via attributen + segmenten.**
  Er is één `VTK - Career`-lijst; studiejaar en richting gaan als **boolean
  contactattributen** mee (`YEAR_BACHELOR_2`, `PROG_CIVIL`, ...). De Career-ploeg
  bouwt de opsplitsing (bv. Burgerlijk + 2de bach) in Brevo als **segment**. Dat
  vervangt de ~50 CSV's uit de ZIP door één lijst plus segmenten; veel minder te
  synchroniseren en te laten driften. De ZIP-download blijft wel bestaan voor wie
  liever de kant-en-klare opsplitsing heeft.
- **Consent blijft de website.** De site is de opt-in-plek; we importeren als
  reeds-opted-in (single opt-in via de API), geen dubbele-opt-in-mail vanuit Brevo.
- **Identiteit via het voorkeursadres, met `ext_id = user.id`.** Wisselt een lid
  tussen universiteits- en persoonlijke mail, dan haalt de real-time push het
  níét-gekozen adres uit alle lijsten, zodat er geen dubbele inschrijving op het
  oude adres achterblijft; de reconciliatie prunet zo'n restadres sowieso weg.
- **Lijst-ID's leven in de `Setting`-tabel** (`brevo.lists`), idempotent
  op naam aangemaakt: geen migratie, en een bestaande folder/lijst wordt
  hergebruikt in plaats van gedupliceerd.
- **Val om te kennen: Brevo's "Authorised IPs".** Staat die accountbeveiliging
  aan, dan geeft élke API-call een `401` met `code: "unauthorized"` en een
  IP-adres in de melding, ook al is de key geldig. Voeg het uitgaande IP van de
  productieserver toe in Brevo (Security, Authorised IPs) of zet de restrictie af;
  anders faalt de sync stil (real-time via `after()`) tot de reconciliatie ze
  opnieuw probeert en óók faalt. De folder/lijsten/attributen worden pas
  aangemaakt bij de eerste geslaagde sync (knop, cron of profielwijziging), niet
  bij het deployen; er wordt dus niets in Brevo gezet zolang de key/IP niet werkt.

### Posten (groepen) & werkingsjaren

- Een **post** = een `Group`. In de admin heet dit voortaan **"Posten"** (niet
  "Groepen"); intern blijven het `Group`/`GroupMembership`-modellen.
- **De praesidiumsamenstelling wisselt per jaar.** Elk lidmaatschap
  (`GroupMembership`) hoort bij een **werkingsjaar** (`year`, verplicht):
  het startjaar van het academiejaar, dus `2026` = "26-27". Uniek is
  `(userId, groupId, year)`, zodat iemand in meerdere jaren in dezelfde post kan
  zitten en de **historiek per jaar** bewaard blijft.
- Het **nieuwe werkingsjaar begint op 15 juli** (Brussel-tijd; zie
  `apps/web/lib/workingYear.ts`). Er is **geen cron of wisactie** nodig: omdat
  memberships per jaar staan, is de post in een nieuw werkingsjaar automatisch
  leeg tot ze ingevuld wordt, en blijven vorige jaren zichtbaar.
- **Tabjes per jaar** (zoals Theokot). De **admin-postenpagina** start bij
  **"26-27"** (`FIRST_WORKING_YEAR = 2026`) via `workingYearTabs()`; standaard
  staat het huidige werkingsjaar open. De gekozen jaar zit in de URL (`?jaar=`).
- **De publieke `/praesidium` toont bewust óók jaren van vóór 26-27.** Anders dan
  de admin en `/werkgroepen` bouwt die pagina haar jarenlijst uit de **distinct
  membership-jaren in de data** (plus het huidige werkingsjaar), niet uit
  `workingYearTabs()`/`parseWorkingYear()` (die klemmen op `FIRST_WORKING_YEAR` en
  zouden alle historiek droppen). Zo kan de **historiek van ~20 vorige
  praesidia** (zie hieronder) getoond worden zonder aparte historiek-tabel.
  Standaardjaar is het huidige werkingsjaar wanneer dat ingevuld is, anders het
  nieuwste jaar met data (zodat de pagina niet leeg opent).
- **Migratie-keuze:** bestaande memberships zonder jaar zijn bij de migratie op
  `2026` gezet, zodat de huidige samenstelling onder "26-27" verschijnt.
- **Admin-postenpagina** toont per post standaard enkel de **leden van het
  gekozen jaar + een "lid toevoegen"-balk**; beschrijving/instellingen en rechten
  staan **ingeklapt** (`<details>`). Een lid verwijderen gaat via een
  bevestigings-modal (verwijdert enkel dat jaar; andere jaren blijven).
- **Publieke `/praesidium`** toont per post de leden van het gekozen jaar met hun
  profielfoto (uit "Mijn account"), de **groepscoördinator** (`membership.role =
  LEAD`) eerst en daarna op `displayOrder` en alfabetisch. Een post zonder leden
  voor dat jaar verschijnt niet.
  - **Groepscoördinator én titel staan los van elkaar.** De `LEAD` van een post
    krijgt de gele pin "Groepscoördinator"; de optionele `titleNl/titleEn` (bv.
    "Praeses") is de subtitel. Iemand kan allebei zijn (de coördinator mét titel),
    dus ze worden apart getoond i.p.v. het één-of-het-ander dat er eerst stond.
  - **Inactieve leden blijven zichtbaar.** De pagina filtert bewust **niet** op
    `user.active`: afgestudeerde leden wiens account later gedeactiveerd wordt,
    horen in de historiek thuis (mét foto). Tombstones (`deletedAt` na een
    account-verwijdering) worden wél weggelaten.
- **Historiek-import zonder aparte tabel.** De ~20 vorige praesidia worden
  geïmporteerd als **inactieve `User`-rijen** (enkel naam + foto reëel, de rest
  dummy) met per lid `GroupMembership`-rijen (`groupId`, `year`, `role`,
  `titleNl/En`, `displayOrder`). `year` is het startjaar (2010 = "10-11"). Posten
  die intussen niet meer bestaan, maak je aan als **gedeactiveerde `Group`-rijen**
  (`active=false`, `type=PRAESIDIUM`) zodat hun historiek blijft renderen. Dit is
  een bewuste keuze: geen apart historiek-model, gewoon dezelfde memberships-
  machinerie met inactieve leden.
- **De post "Algemeen" is verwijderd** (hoorde niet in de praesidiumstructuur en
  was niet wisbaar in de admin). Verwijderd uit de seed en via de migratie uit de
  DB.
- **Posten zijn GUI-beheerd.** `Group.code` is geen `GroupCode`-enum meer
  maar een vrije, unieke string, zodat posten via `/admin/groepen` toegevoegd,
  bewerkt en gedeactiveerd kunnen worden. Een post uitzetten (`active=false`) haalt
  ze uit de nieuwe-shift-keuzes maar behoudt de historiek (memberships per jaar);
  posten worden dus gedeactiveerd, niet verwijderd.
- **Een post verleent rollen, geen losse rechten.** Het oude "recht per
  post"-raster is vervangen door rol-grants (`GroupRole`): een post kent rollen toe
  aan elk lid (`DEFAULT`) of enkel aan de verantwoordelijke (`LEADER`). De seed legt
  de rolset: **admin** op IT en Groep 5; **praesidium** (evenementen voor eigen groep +
  foto's uploaden) op elke post; **theokot** op de post Theokot; en **één rol per post**
  (met de postnaam, leeg) toegekend aan die post zelf. **werkgroep** en **medewerker**
  bestaan als toewijsbare rollen maar hangen nog aan geen enkele post. Alles als
  `DEFAULT` (elk lid). De lege rollen vul je met rechten via `/admin/roles`.

### Werkgroepen (BEST, Revue, ...)

- Een **werkgroep** is technisch **dezelfde `Group`** als een post, met een
  discriminator `Group.type` (`PRAESIDIUM` | `WERKGROEP`, default `PRAESIDIUM`).
  Ze deelt de volledige machinerie van de posten: leden per werkingsjaar
  (`GroupMembership`), rol-grants (`GroupRole`, DEFAULT/LEADER) en dezelfde
  add/remove-lid-flow. De seed maakt zeven werkgroepen (BEST, Biomedix, Chemix,
  Existenz, Mechanix, Revue, Statix), elk met een lege rol-container.
- **Waarom een `type`-discriminator en geen apart model?** Werkgroepen "werken
  zoals posten"; een tweede kopie van memberships + rollen + admin-UI zou pure
  duplicatie zijn. Het verschil zit enkel in *waar* ze verschijnen.
- **Niet op /praesidium, wel op /werkgroepen.** `/praesidium`, de admin-tab
  "Posten" en de shift-postkeuzes filteren op `type = PRAESIDIUM`; werkgroepen
  krijgen hun eigen publieke `/werkgroepen` (zelfde ledenraster + werkingsjaar-
  tabjes als praesidium) en een eigen admin-tab "Werkgroepen".
- **Eigen infotekst + website.** De werkgroep-`description*` is de blurb op
  `/werkgroepen`; `Group.website` is een optionele link (mag zonder schema
  ingevuld worden, wordt genormaliseerd naar `https://`). Beide staan los van de
  naam en de rollen.
- **Wie mag wat.** Leden en rollen beheren vraagt het aparte recht
  `werkgroepen.manage` (los van `groups.manage`, zodat het delegeerbaar is). De
  **infotekst + website** mag daarnaast **elk lid van díe werkgroep** zelf
  aanpassen (huidig werkingsjaar), maar enkel van de eigen werkgroep: de
  admin-tab toont een gewoon lid enkel zijn eigen werkgroep(en) en enkel het
  infotekst-formulier; `saveWerkgroepInfoAction` checkt het lidmaatschap
  server-side. Beheerders (met het recht of superadmin) zien en beheren alles.
- **Footer** linkt naar zowel `/praesidium` als `/werkgroepen`.

### Mailinglijsten (opt-in)

- Acht categorieën: **Feest, Career, Sport, Evenementen, Onderwijs, VTK
  International, Eerstejaars, Bakske** (`MailCategory`-enum, opgeslagen als
  opt-in array op `User.mailCategories`).
- **Default staat alles uit (opt-in):** een lid vinkt bij registratie expliciet
  aan waarvoor het mails wil. Bewuste keuze i.p.v. opt-out, om te stroken met de
  verwachting dat je zelf kiest waarvoor je ingeschreven wordt.

## Kalender: categorieën en agenda-feeds

### De site is de enige bron; geen koppeling met de Google-agenda

VTK had een gedeelde Google Workspace-agenda. Die wordt **niet** gekoppeld: niet
geïmporteerd, niet gespiegeld, niet gesynchroniseerd. De reden is dat
`CalendarEvent` dingen draagt waar een Google-agenda geen plaats voor heeft: een
Nederlandse én Engelse titel en beschrijving, `visibility` (publiek vs. enkel
leden), `groupId` (dat bepaalt wie het event mag bewerken), een foto, en een 1:1-
koppeling met `TicketEvent`. Zou Google de bron zijn, dan verlies je dat allemaal
of moet je het in de eventbeschrijving proppen.

Daar komt bij dat enkel praesidium en posten een `@vtk.be`-account hebben. Een
agenda "gedeeld met alle VTK-leden" bereikt de gewone leden dus sowieso niet;
daarvoor dient de persoonlijke feed hieronder.

Two-way sync is bewust nooit overwogen: event-ids, verwijderingen, herhalingen en
conflictresolutie leveren permanent onderhoud op voor iets wat een kring niet
nodig heeft.

### Categorieën staan naast de post, niet erin

`CalendarEvent.groupId` zegt **wie** het evenement organiseert. `CalendarCategory`
zegt **waarover het gaat** of **voor wie het is**. Dat zijn twee assen: een
fakbar-cantus kan een eerstejaarsevent zijn, en een evenement van de post
Internationaal hoeft niet op de internationale kalender te staan.

Vóór deze feature stonden de filterchips en de legende hardgecodeerd in de client
en mapten ze op groepscodes (gala=CULTUUR, career=BEDRIJVENRELATIES,
cantus=FAKBAR). Dat klopte inhoudelijk niet en vereiste een release voor elke
wijziging. Categorieën zijn nu GUI-beheerd (`/admin/kalender/categorieen`,
`calendar.manageAll`), inclusief hun kleur: die komt als `--cat` op het element
terecht, zodat er geen lijst CSS-klassen meer per categorie hoeft te bestaan.

Een categorie verwijderen laat de evenementen zelf staan; enkel de koppeling en
dus haar pagina en feed verdwijnen.

### Doelgroepen filteren vanzelf, en zijn geen filterknop

Een categorie kan een **doelgroep** dragen (`CalendarCategory.audience`:
`FIRST_YEARS` of `INTERNATIONALS`). Zo'n categorie gedraagt zich anders dan een
gewoon thema:

- **Geen filterchip.** Een eerstejaars hoort niet op "Eerstejaars" te moeten
  klikken om zijn eigen programma te zien; dat is precies de stap die niemand
  zet. De kalender kijkt naar het profiel en toont die evenementen vanzelf.
- **Wie er niet bij hoort, ziet ze standaard niet.** Dat is een standaard en geen
  slot: één schakelaar ("ook andere doelgroepen") en alles staat er. Er wordt
  dus niets afgeschermd; de kalender is enkel meteen relevant. De categoriepagina
  `/kalender/eerstejaars` en haar feed blijven ook zonder die schakelaar gewoon
  bereikbaar.
- **Altijd zichtbaar gelabeld.** In het maandraster, in de agendalijst én op de
  eventpagina draagt zo'n evenement de naam van zijn doelgroep in de kleur van de
  categorie. Een evenement dat maar voor een deel van de leden bedoeld is, mag er
  nooit uitzien als een gewoon evenement.

De doelgroep is een enum en geen vrij veld, omdat er bij elke waarde code hoort
die bepaalt wie erbij hoort (`lib/calendar/audience.ts`): eerstejaars zijn leden
met `BACHELOR_1` in `studyYears`, internationals leden met
`User.internationalStudent`. Een doelgroep toevoegen is dus bewust geen
GUI-actie.

**`internationalStudent` is een eigen profielveld**, gevraagd in de onboarding en
te wijzigen op `/account`. De sitetaal (`locale`) leek een gratis alternatief,
maar die zegt welke taal je leest, niet of je een uitwisselingsstudent bent: een
Vlaming die de site op Engels zet zou dan internationale events krijgen en een
Erasmusstudent die het in het Nederlands probeert niet. Vergelijk
`Shift.openToInternationals`, dat om dezelfde reden over de taal van de shift
gaat en niet over wie de persoon is.

De homepage ("Opkomende evenementen") past dezelfde filter toe. Anders zou een
eerstejaarsevent bij iedereen op de homepage staan terwijl het uit de kalender
gefilterd is.

### Eén dynamisch segment onder `/kalender`

`/kalender/<slug>` (categorie) en `/kalender/<id>` (evenement) delen hetzelfde
routesegment `[slugOrId]`, dat eerst een categorieslug probeert en anders een
event-id. Twee dynamische segmenten naast elkaar kan Next.js niet, en de
alternatieven waren slechter: `/kalender/c/<slug>` geeft een lelijke URL voor iets
wat je aan een eerstejaars wil kunnen doorgeven, en de events verhuizen naar
`/kalender/event/<id>` zou de bestaande links vanaf de homepage breken. Een
botsing is uitgesloten omdat een slug beheerd wordt en alleen kleine letters,
cijfers en koppeltekens mag bevatten, terwijl event-ids cuids zijn.

### Twee weergaven: Agenda en Lijst

`/kalender` had drie knoppen (Agenda, Maand, Lijst), maar Agenda en Lijst toonden
allebei dezelfde lijst van de **komende 14 dagen**, ongeacht welke maand je
bekeek; ze verschilden enkel in of de legende ernaast stond en of de lijst op
acht items werd afgekapt. Bladeren met de maandpijlen deed er niets aan, en in een
rustige periode waren beide leeg. Dat las als een defect.

Nu zijn er twee: **Agenda** is het maandraster (de standaard; het raster *is* de
agenda, dus "Maand" was een rare naam ernaast), met daaronder het blok
"Eerstvolgend · komende 14 dagen". **Lijst** is dezelfde maand chronologisch, dus
de pijlen werken in beide weergaven. Alleen het "eerstvolgend"-blok negeert
bewust de gekozen maand: dat is precies waarvoor het dient.

Een lege lijst zegt nu ook dát ze leeg is ("Geen evenementen deze maand"), in
plaats van een leeg vlak te tonen.

### Wat er in welke feed zit

- Publieke feeds (`/api/calendar/feed`, `.../feed/c/<slug>`, `.../feed/g/<slug>`)
  bevatten **enkel** `PUBLIC`-events. Een feed-URL is per definitie deelbaar, dus
  ledenexclusieve evenementen horen daar niet in.
- De algemene feed en de postfeeds laten **doelgroepevents weg**: dat is het
  algemene programma. Wie enkel de eerstejaarskalender wil, abonneert zich op
  `/feed/c/eerstejaars`.
- De persoonlijke feed (`/api/calendar/feed/me/<token>`) is de enige met
  `MEMBERS`-events, voegt de shiften toe waarvoor het lid is ingeschreven, en
  volgt de doelgroepen van dat lid; een eerstejaars hoeft zich dus niet apart op
  de eerstejaarsfeed te abonneren.
- Elke feed draagt een venster van 12 maanden terug tot 24 vooruit. Clients halen
  het bestand elk paar uur opnieuw op; de volledige historiek meesturen kost enkel
  bandbreedte.
- Feeds zijn abonnementen, geen downloads. Enkel op de detailpagina van één
  evenement staat een echte `.ics`-download: dat ene event verandert zelden nog.

### Feedtokens verlopen niet, deur-tokens wel

`CalendarFeedToken` heeft bewust géén `expiresAt`, anders dan
`DoorShortcutToken`. Een agenda-abonnement dat na 90 dagen stilletjes ophoudt met
verversen, is erger dan geen abonnement: de agenda blijft verouderde evenementen
tonen en niemand merkt dat er iets stuk is. Intrekken gebeurt expliciet vanuit
`/account`. Een ingetrokken token geeft dezelfde 404 als een verzonnen token, en
`lastUsedAt` wordt hoogstens één keer per uur weggeschreven; anders is elke poll
van elke client een database-write.

## Homepage-secties & bandenritme

De homepage is opgebouwd uit volle-breedte banden die bewust van kleur
afwisselen (zie ook de styling-sectie in `CLAUDE.md`). De volgorde van de
onderste helft is een ontwerpkeuze, geen toeval:

- **Wat we doen** (paper) → **Aftermovies** (navy + technisch patroon) →
  **Opkomende evenementen** (lichtblauw) → **VTK Career** (navy) → **Jouw POC's**
  (lichtblauw) → **Hoofdpartners** (paper).
- **Waarom POC's ná Career en niet ervoor?** De POC-band is _persoonlijk_: ze
  verschijnt enkel voor wie ingelogd is én richtingen op zijn profiel heeft. Voor
  iedereen anders valt ze weg. Stond ze tussen twee navy banden, dan botsten die
  twee zodra de band verdwijnt (navy tegen navy, geen naad). Als laatste
  lichtblauwe band vóór de paper-partners klopt het ritme in beide gevallen: valt
  ze weg, dan volgt Career (navy) gewoon op Partners (paper), precies zoals de
  pagina eruitzag vóór deze feature.

### Aftermovies op de homepage

- Dezelfde `media.aftermovies`-instelling als de /media-pagina, te beheren via
  **/admin/home**. De homepage toont er maximaal **zes** van in een 3-koloms
  rooster (2×3).
- **Enkel echte embeds** (YouTube/Vimeo) komen in het rooster; een losse mp4 of
  een niet-herkende link valt weg. De YouTube-herkenning is gedeeld met de
  /media-speler (`lib/videoEmbed.ts`).
- **Klik-om-te-laden:** de iframe wordt pas geplaatst na een klik op de poster.
  Zes YouTube-iframes meteen inladen zou trackers zetten en verkeer kosten op een
  pagina waar de meeste bezoekers voorbijscrollen; de poster is één afbeelding.

### Opkomende evenementen op de homepage

- Tot **zes** publieke, toekomstige evenementen in een 2×3 rooster, met de foto
  van het evenement (`CalendarEvent.imageKey`, met `/default-event.jpg` als
  fallback) op dezelfde manier als de "Wat we doen"-kaarten.
- **Minder dan zes vult geen lege plaatsen op:** het rooster krimpt mee (1, 2 of
  3 kaarten op een rij, links uitgelijnd) in plaats van gaten te tonen.
- Valt weg als er geen enkel toekomstig evenement is.

### POC's per richting (`Poc.studyProgrammes`)

- De homepage toont de POC's van **jouw eigen richtingen**: heb je bv.
  Elektrotechniek en Computerwetenschappen op je profiel, dan zie je de POC-leden
  van beide.
- Dit vereist een machineleesbare koppeling tussen een POC en een richting.
  `Poc.studyTrack` was vrije tekst ("Master Computer Science") en niet
  betrouwbaar te matchen op de `StudyProgramme`-enum van een profiel. Daarom
  heeft `Poc` nu een **`studyProgrammes`-array** (`StudyProgramme[]`), beheerd via
  een multi-select in **/admin/pocs**. `studyTrack` blijft de vrije tekst die op
  de POC-pagina zelf verschijnt.
- **Meerdere richtingen per POC** kan: één POC bedient soms verschillende
  opleidingen.
- **Eén mailadres per POC, geen persoonlijke adressen.** `Poc.email` (bv.
  `wtk-poc@vtk.be`) is het enige contactadres dat de site toont. Een student
  mailt de POC als geheel; wie er dit jaar in zit mag wisselen zonder dat een
  adres op de site verandert, en een vertegenwoordiger hoeft zijn persoonlijke
  adres niet publiek te zetten. `User.email` van een vertegenwoordiger
  verschijnt daarom nergens meer op `/pocs` of de homepage.
- **Geen beschrijvingen en geen rollen op de publieke POC-schermen.** De
  richtingsnaam en de gezichten zijn wat een student zoekt; een zin uitleg per
  POC en een functietitel per persoon werden als ruis ervaren. De kolommen
  `Poc.description*` en `PocRepresentative.role*` bestaan nog in de database
  (weggooien zou bestaande tekst vernietigen), maar worden nergens meer getoond
  of bewerkt.
- **`/pocs` gebruikt dezelfde kaarten als de homepage-band** (`.poc-grid` /
  `.poccard` uit `vtk-home.css`): wie zijn eigen POC op de homepage ziet en
  doorklikt, hoort hetzelfde beeld te krijgen.
- **Lege staat = sectie verbergen.** Zonder sessie, zonder richtingen, of zonder
  een matchende POC met vertegenwoordigers valt de hele sectie weg. Bewuste keuze
  boven "toon dan alle POC's" of een uitnodigingsbanner: de sectie is enkel
  zinvol als ze persoonlijk is, en zo blijft de homepage voor bezoekers exact
  zoals ze was.
- **Gevolg voor caching:** omdat de homepage nu de sessie leest, wordt ze per
  bezoeker gerenderd i.p.v. statisch gecachet. Dat was al zo qua DB-lezingen; het
  is één gerichte query extra (de richtingen van de ingelogde gebruiker), en enkel
  voor wie ingelogd is.

### Cursusdienst-openingsuren komen live van cudi.vtk.be

- De **Theokot**-uren beheert VTK zelf in de admin (`Setting`
  `home.openingHours.theokot`). De **cursusdienst**-uren daarentegen worden
  ingevoerd op het aparte cursusdienst-platform (cudi.vtk.be), waar ze meteen ook
  shiften en tijdsloten genereren. Dat platform is dus de single source of truth;
  ze hier nog eens met de hand overtypen zou onvermijdelijk uit elkaar lopen.
- Daarom haalt de homepage (en `/aanbod`) ze **live** op via een publieke,
  read-only endpoint op cudi (`GET /api/opening-hours?association=vtk`), gemapt in
  `lib/cursusdienstHours.ts` naar dezelfde `entries`-vorm als Theokot. De
  admin-form voor deze uren is verdwenen; `/admin/home` verwijst enkel nog door.
- **Waarom pullen i.p.v. een gedeelde DB of een push-webhook:** de twee apps
  hebben elk hun eigen database en deployment. Een directe cross-DB-lezing koppelt
  hun schema's op rendertijd; een push zou een write-endpoint + secret vragen. Een
  gecachte pull (Next data-cache, ~1×/uur) houdt ze losgekoppeld en de bron enkelvoudig.
- **Fallback in drie trappen** (uren wijzigen zelden, dus resilience gaat voor
  versheid): live fetch → de laatst succesvol opgehaalde week uit een DB-cache
  (`Setting` `cursusdienst.weekHoursCache`, best-effort weggeschreven bij elke
  verse fetch) → en als zelfs dat er niet is, de melding "De cursusdienst
  openingsuren zijn momenteel niet beschikbaar". Zo breekt de homepage nooit,
  ook niet bij een koude cache terwijl cudi plat ligt.

### Snelle knoppen staan op mobiel vóór de eventkaart

Op een breed scherm staan de hero-tekst en de eventkaart naast elkaar, en ligt de
rij snelle knoppen (Theokot, Cursusdienst, Tweedehands, Tijdsloten, Shiften,
Kalender) er meteen onder: allemaal in één blik, klikbaar zonder te scrollen.

Zodra de hero stapelt (**≤980px**) valt die volgorde uit elkaar. De eventkaart
gaat dan onder de tekst staan, en de knoppen kwamen daarachter: op een scherm van
390×844 begon de eerste knop pas op **1287px**, dus anderhalf scherm naar
beneden, met een kaart van ruim 500px ertussen. De knoppen zijn juist het
utilitaire deel van de homepage (waar eet ik, is de cursusdienst open), dus dat
is precies de verkeerde volgorde voor een telefoon.

- **Keuze:** onder 980px schuiven de knoppen tussen de hero-tekst en de
  eventkaart. Onder 640px staan ze bovendien in **twee kolommen** in plaats van
  zes onder elkaar. Resultaat op 390×844: eerste knop op **700px**, vier van de
  zes binnen het eerste scherm, en het blok krimpt van 682px naar 311px.
- **De eventkaart schuift dus naar beneden op mobiel.** Dat is bewust: hij blijft
  één korte scroll ver, terwijl de knoppen de bestemming zijn waar mensen
  meerdere keren per week naartoe gaan.
- **Desktop verandert niet.** Alles zit in `@media (max-width: 980px)` en
  `@media (max-width: 640px)` in `vtk-home.css`.
- **Hoe:** `.home-dark-zone` wordt een flex-kolom en `.home-hero` krijgt
  `display: contents`, zodat de twee hero-kinderen broers worden van de
  quick-sectie en met `order` te herschikken zijn. Enkel de box van de hero
  verdwijnt, niet het element, dus descendant-selectors (`.home-hero .hero-cal`)
  en `body:has(.home-hero)` in de header-CSS blijven werken. De padding van de
  hero verhuist wel mee naar zijn kinderen. Let op: `.quick` staat op
  `margin: 0 auto`, en een auto-marge in de dwarsrichting zet de stretch van een
  flex-kind uit; die marges moeten in dat blok expliciet op 0.

---

## Uitleendienst (logistiek.vtk.be)

Het reservatiesysteem voor de uitleendienst leeft in `apps/logistiek`, niet op de
hoofdsite: het is de eerste echte invulling van de submodule-opzet
(`logistiek.vtk.be`, gedeelde sessie via het `.vtk.be`-cookie). De UX volgt de
filosofie van de Cudi-app: een login-gated takenhub met grote taakkaarten
(Materiaal lenen / Camionette / Mijn reservaties), eenvoudige verticale flows en
een eigen account-overzicht. Technische kaart: `docs/uitleendienst.md`.

### Aanvraag + goedkeuring, geen instantboeking

- Een reservatie is een **aanvraag** (`REQUESTED`) die het Logistiek-team
  goedkeurt of afwijst. Bewuste keuze tegen instantboeking: **VTK-evenementen
  hebben voorrang op het materiaal** en het team wil elke aanvraag zien.
- `REQUESTED` neemt daarom nog **geen voorraad** in; de harde
  beschikbaarheidscheck (voorraad min overlappende `APPROVED`/`PICKED_UP`)
  gebeurt pas bij goedkeuring, in een Serializable-transactie. Leden zien bij het
  aanvragen wel een zachte indicator per item.
- Afwijzen vraagt een verplichte reden die het lid te zien krijgt.

### Camionette is een eigen model, geen catalogus-item

- Uurprijs (7,50 EUR/u, elk begonnen uur, minimum één uur), een tijdvenster
  i.p.v. een dagbereik, en een **chauffeur van VTK** (leden rijden nooit zelf):
  dat past niet in het item/lijn-model, dus `UitleenVanBooking` staat apart.
- Het uurtarief wordt bij de aanvraag gesnapshot en de prijs bij goedkeuring
  herberekend; één camionette betekent: geen twee goedgekeurde ritten die
  overlappen.

### Betalen: online of aan de balie, per reservatie

- Bij goedkeuring kiest het **team** de betaalwijze: `ONLINE` (Mollie-checkout
  via de gedeelde `@vtk/payments`-gateways) of `OFFLINE` (cash/Payconiq bij
  afhaling, team drukt "betaald"). Niet het lid: het team weet wanneer online
  betalen zinvol is.
- **Enkel de huurprijs gaat online; de waarborg blijft cash bij afhaling.**
  Online waarborgen zouden een refund-flow vragen; de balie geeft ze gewoon
  terug. `depositReturnedAt` registreert dat.
- Een al betaalde reservatie kan het lid niet meer zelf annuleren (dat zou een
  refund impliceren); dat loopt via logistiek@vtk.be.

### Kleinere keuzes

- **Interface in NL/EN, catalogusinhoud vrij**: de taalkeuze in de header wordt
  onthouden via een cookie en vertaalt de interface. Catalogusvelden blijven
  bewust enkel `name`/`description`: die inhoud wordt door Logistiek beheerd en
  krijgt geen verplicht tweede vertaalveld.
- **Geen mails in v1**: de status staat altijd onder "Mijn reservaties"; de
  ticketing-outbox is event-gebonden en werd niet veralgemeend.
- `SaveForm`/`toast`/`ConfirmActionButton` in `apps/logistiek/components/ui`
  zijn bewuste minimale kopieën van `apps/web/components/ui`; **kandidaat om te
  hoisten naar `@vtk/ui`** zodra een derde afnemer opduikt.
- De vroegere groepscheck op logistiek.vtk.be (groep "Logistiek", met verkeerde
  casing zodat ze niemand doorliet) is vervangen: **elk ingelogd lid** mag
  aanvragen, beheer hangt aan de permissie `logistiek.manage` (rol "logistiek",
  toegekend aan de post LOGISTIEK).

### Uitleendienst v2 (events, vervoer, sets, flesserke)

De uitleendienst kreeg een grondige uitbreiding op basis van de "How to logi" en
feedback van de groepscoordinator. De onderliggende werking:

- **Aanvragen zijn event-centrisch en dragen een aanvragertype** (INTERN eigen
  post / WERKGROEP / EXTERN), de drie kanalen uit de Logi-werking met elk een
  eigen behandelaar. Het beheer filtert de wachtrij op dat type.
- **Het aanvragertype wordt automatisch uit de login afgeleid; het lid kiest het
  nooit zelf.** Een praesidiumlid (in een post) vraagt aan als INTERN namens die
  post; wie geen post heeft, is EXTERN met de eigen naam. De server dwingt dit af
  en negeert wat de client meestuurt (niet te vervalsen). Enkel wanneer een lid
  in meerdere posten zit, kiest het nog *welke* post (geen type). In het beheer
  kan het team het type wel manueel zetten (het is daar zichtbaar en duidelijk).
  *Achterhaald sinds augustus 2026:* werkgroepen zitten intussen wél in de DB
  (`GroupType.WERKGROEP`, `WERKGROEP_SEEDS` in `packages/db/src/groups.ts`) en
  `deriveMemberRequester` leidt ze automatisch af. Enkel de keuzelijst in de UI
  noemt ze nog "post"; dat is taak M4 in het feedbackplan.
- **Flesserke is een aparte tab**, enkel zichtbaar en bruikbaar voor het
  praesidium (leden met een post). Het is een eigen aanvraagflow (aparte
  reservatie met enkel flesserke-lijnen), los van materiaal. Materiaal- en
  flesserke-aanvragen hebben elk hun eigen create/edit-actie zodat een bewerking
  van de ene de lijnen van de andere nooit overschrijft.
- **Bewerken.** Een lid bewerkt zolang de aanvraag `REQUESTED` is; daarna
  annuleert het of contacteert het team. Het team mag ook een `APPROVED` aanvraag
  bewerken: die save loopt in dezelfde Serializable-transactie als het goedkeuren
  en hercheckt de voorraad, zodat een goedgekeurde aanvraag altijd door voorraad
  gedekt blijft.
- **Vervoer i.p.v. camionette.** Kar, auto en bakfiets zijn DB-rijen
  (`UitleenVehicle`), geen enum, want de tarieven zijn **team-configureerbaar**
  (gratis / per uur / per km / vast) via het instellingenscherm. De kar rekent
  standaard per kilometer; die prijs is pas gekend na de rit, dus `priceCents` is
  nullable en het team voert de kilometers in bij het afronden. De **chauffeur
  wordt pas het weekend voor de rit toegewezen**, dus is optioneel bij
  goedkeuring. Materiaal rekent standaard enkel waarborg aan; een instelling
  (`logistiek.showRentPrices`, default uit) toont huurprijzen wanneer nodig.
- **Sets** zijn gewone catalogusitems met een beschrijvende inhoudslijst
  (`UitleenSetContent`). De inhoud koppelt bewust niet aan andere items, zodat de
  voorraad niet dubbel geteld wordt; de set heeft zijn eigen fysieke voorraad.
- **Flesserke** (voeding/drank/huishoud) is verbruiksstock in een **aparte tab,
  enkel voor het praesidium** (server-side afgedwongen). Een flesserke-aanvraag is
  een eigen reservatie met enkel flesserke-lijnen. Beschikbaar wordt altijd
  berekend (voorraad min status-gebaseerd gereserveerd), nooit opgeslagen. Bij het
  terugbrengen voert het team per lijn in hoeveel er gesloten terugkomt; het
  verschil is verbruik en wordt afgeboekt. "Stock moet kloppen" is hier de harde
  eis, dus alle voorraadmutaties gebeuren in een transactie.
- **Foto-serving via een eigen `/api/media`-proxy** (same-origin), niet via
  directe bucket-URL's, net als op de hoofdsite. De S3-config wordt gedeeld met de
  web-admin via de `Setting`-tabel.
- **NL-only DB-inhoud**; de UI-chrome is NL/EN via een eigen cookie-copysysteem.
- De import van de bestaande "Inventaris Loods.xlsx" is eenmalig en idempotent;
  ze deletet nooit, zodat een herimport na een sheet-correctie veilig is.

### Chauffeurs: een eigen lijst naast de post Logistiek

Wie mag rijden was tot nu een afgeleide: iedereen met een lidmaatschap van de post
`LOGISTIEK` in het huidige werkingsjaar stond in de chauffeurskeuze. Dat koppelt
twee dingen die niet samenhoren: rijden vraagt een rijbewijs en goodwill, niet een
praesidiumfunctie. Logistiek beheert nu zelf een chauffeurslijst in
`/beheer/chauffeurs`.

- **Unie van twee bronnen, geen vervanging.** De keuzelijst is de post Logistiek
  (automatisch, per werkingsjaar) plus de handmatig toegevoegde chauffeurs
  (`UitleenDriver`). De post blijft er automatisch bij: die lijst onderhoudt
  zichzelf al op vtk.be en rolt op 15 juli vanzelf mee. Het beheerscherm toont
  beide groepen apart, zodat zichtbaar is wat je waar aanpast.
- **Chauffeur zijn geeft geen beheerrechten.** Een toegevoegde chauffeur krijgt
  geen `logistiek.manage` (die hangt aan de rol van de post, niet aan deze lijst).
  Die persoon ziet enkel "Mijn ritten" (`/ritten`): de ritten met zijn eigen
  `driverId`, met laadadres, bestemming, contactpersoon en bijrijders, en zonder
  prijs of betaalstatus. Dat laatste is bewust: de prijs is een zaak tussen de
  aanvrager en Logistiek, en een chauffeur die een openstaande betaling ziet, gaat
  zich daar ter plaatse mee moeien.
- **De chauffeur is altijd een echte vtk.be-gebruiker**, gekozen via een
  zoekpicker, nooit een vrije naam. Enkel zo kan de app die persoon zijn ritten
  tonen na het inloggen, en enkel zo blijft de historiek ("wie reed die rit")
  betrouwbaar. Wie geen account heeft, logt eerst één keer in op vtk.be.
- **De lijst is niet werkingsjaar-gescoped.** Anders zou de 15-juli-reset de
  chauffeurs midden in de zomer wegvegen, net wanneer er verhuisd en gesjouwd
  wordt. Het team haalt iemand er zelf uit.
- **Iemand uit de lijst halen laat toegewezen ritten staan.** De rit is gepland of
  gereden; de naam wissen zou de planning en de historiek stukmaken. Die persoon
  blijft die ritten dus ook zien tot ze voorbij zijn. Wil je dat niet, wijs de rit
  dan eerst aan een andere chauffeur toe. In het beheer blijft een verwijderde
  chauffeur zichtbaar in de keuzelijst van zijn eigen rit, onder "Niet meer in de
  chauffeurslijst".

### Terugdraaien: één stap terug, behalve bij een online betaling

Elke stap in de flow kan één stap terug: goedkeuren en afwijzen naar
"aangevraagd", afgehaald naar goedgekeurd, teruggebracht naar afgehaald, en de
markeringen "betaald aan de balie" en "waarborg terug" kunnen gewist worden.
Bij vervoer geldt hetzelfde, plus het terugdraaien van een afronding. Zonder dit
betekende één verkeerde klik een ingreep in de database, en dat is net wat deze
app kwam vervangen.

Wat daarbij vastligt:

- **Voorraad wordt hercheckt zodra terugdraaien ze opnieuw inneemt.**
  "Teruggebracht" terugdraaien zet het materiaal weer buiten en zet het
  flesserke-verbruik terug op de plank; dat loopt in dezelfde
  Serializable-transactie en met dezelfde check als het goedkeuren. Is de
  periode intussen aan iemand anders toegewezen, dan gaat er niets door.
  Voorraad *vrijgeven* (een goedkeuring terugdraaien) is altijd veilig.
- **Een geslaagde online betaling draai je hier niet terug.** Dat vraagt een
  terugbetaling bij de betaalprovider, en een knop die enkel de markering wist,
  zou doen alsof het geld terug is. De actie weigert en zegt waarom. "Betaling
  terugdraaien" wist enkel de markering *aan de balie*.
- **Een goedkeuring terugdraaien kan niet zolang er betaald is.** Eerst de
  betaling terugdraaien, dan de goedkeuring; anders zou een aanvraag zonder
  betaalwijze toch als betaald blijven staan.
- **Een afronding terugdraaien wist de kilometers** bij een voertuig dat per
  kilometer rekent. Wie een afronding terugdraait, doet dat meestal net omdat de
  kilometers fout stonden, en het afrondformulier vraagt ze dan opnieuw.
- **Terugdraaien staat apart in de interface**, onder een eigen kopje
  "Rechtzetten", en nooit in de rij knoppen waar je normaal op klikt.

De velden op de aanvraag (`decidedAt`, `pickedUpAt`, ...) bewaren enkel de
laatste toestand, dus ze zijn geen historiek meer zodra je kan terugdraaien.
Daarom schrijft elke beheeractie een regel in `UitleenAuditLog`, in dezelfde
transactie als de wijziging: zo staat er nooit een regel voor iets dat niet
gebeurd is, en zie je op de detailpagina wie wat wanneer deed.

### Een alternatief is een suggestie, geen automatische vervanging

Items kunnen elkaars alternatief zijn ("geen actieve box meer? de passieve kan
ook"). Staat een item op nul beschikbaar in de gevraagde periode, dan toont de
catalogus die alternatieven onder de kaart; klikken zet er één in de aanvraag.

Wat daarbij vastligt:

- **De aanvrager kiest.** De app vervangt nooit zelf een item, ook niet wanneer
  er precies één alternatief vrij is. Wie een aanvraag indient, moet weten wat er
  in staat; een stille omwisseling merk je pas aan de balie.
- **De koppeling is wederzijds.** De actieve en de passieve box zijn elkaars
  alternatief, dus schrijft `saveItemAction` per paar twee rijen weg en ruimt hij
  ook de tegenrichting op. Een eenrichtingsrelatie blijkt in de praktijk altijd
  te weinig: wie A instelt, verwacht dat B het ook weet.
- **Alternatieven verschijnen enkel wanneer het gevraagde niet kan.** Anders
  staat er bij elk item een suggestie die niemand nodig heeft, en wordt het ruis.

Los daarvan draagt elke materiaallijn een eigen opmerking (`note`), in te vullen
door het lid ("liefst de zwarte") én door het team ("zie vorig event"). Eén veld
voor beide: wie het schreef blijkt uit de tekst, en twee notitievelden per lijn
worden in de praktijk allebei half ingevuld. De opmerking staat bij de lijn en
niet bij de algemene info onderaan, want daar vindt het team ze pas nadat het al
iets anders klaarzette.

### Heen en terug zijn twee ritten in één aanvraag

Wie de kar 's ochtends nodig heeft om op te bouwen en 's avonds om af te breken,
vult één formulier in met een tweede tijdvenster. Dat wordt in de database
**twee** `UitleenTransportBooking`-rijen met dezelfde `tripGroupId` en een
`tripLeg` (HEEN/TERUG).

Waarom niet één boeking met twee tijdvensters: tussen opbouw en afbraak is het
voertuig gewoon vrij, en iemand anders mag het dan gebruiken. Eén rij met
`returnStartAt`/`returnEndAt` zou betekenen dat élke query over "wanneer is dit
voertuig bezet" twee vensters moet kennen: de conflictcheck bij het goedkeuren,
de kalender, het weekoverzicht en het publieke overzicht. Eén ervan vergeten
levert een dubbel geboekte kar op, en dat merk je pas op de dag zelf.

Wat daarbij vastligt:

- **Beslissen gebeurt op de hele aanvraag.** Goedkeuren en afwijzen doen beide
  helften tegelijk; de heenrit goedkeuren en de terugrit laten hangen, levert een
  aanvrager op die niet meer thuisgeraakt. Annuleren door het lid werkt ook op de
  groep.
- **De uren blijven per helft.** In het goedkeurformulier staan beide
  tijdvensters apart, dus Logistiek kan de terugrit een uur opschuiven zonder de
  heenrit te raken.
- **De prijs is de som van beide ritten.** Ze worden apart aangerekend, want het
  voertuig staat er tussenin niet op.

### Uren verschuiven hoort bij het goedkeuren

Twee aanvragen voor dezelfde kar op dezelfde dag passen vaak samen na een
halfuur schuiven. Voordien kon het team enkel goedkeuren of afwijzen, en werd
dat schuiven een mailtje plus een ingreep in de database. Het goedkeurformulier
draagt nu de uren zelf: wat je daar invult, wordt de rit.

- De conflictcheck loopt in dezelfde Serializable-transactie als het opslaan, dus
  twee beheerders die tegelijk schuiven kunnen elkaar niet overschrijven.
- Botst het toch, dan noemt de melding de rit waarmee het botst ("Botst met de
  rit van Feest op za 12 sep 14:00 tot 18:00"), en staan de andere ritten van dat
  voertuig die dag al boven het formulier. "Voertuig bezet" zegt niet waarheen je
  moet schuiven.
- Verschoven uren komen apart in de historiek (`UitleenAuditLog`), want de nieuwe
  uren staan daarna als "de" uren op de rit; zonder die regel is niet meer te
  zien dat er iets veranderd is aan wat het lid vroeg.

### Karchauffeurs: één vlag, geen aparte soort

Een voertuig kan aangeduid staan als "vraagt een karchauffeur"
(`UitleenVehicle.needsTrailerDriver`), en een chauffeur als "rijdt met de kar"
(`UitleenDriver.canDriveTrailer`). Bij een rit met zo'n voertuig staan de
karchauffeurs bovenaan in de keuzelijst en de rest onder "Niet met de kar".

- **Eén vlag en geen enum AUTO/KAR:** elke karchauffeur rijdt ook gewoon met de
  auto, dus die twee sluiten elkaar niet uit.
- **De rest blijft kiesbaar,** uitgegrijsd noch geblokkeerd: het team beslist wie
  rijdt, de app zorgt er enkel voor dat je het niet per ongeluk doet.
- **Een vlag per voertuig en geen check op `code == "kar"`:** het team voert zelf
  voertuigen in, en een tweede aanhangwagen zou anders stil buiten de regel
  vallen.
- Leden van de post Logistiek hebben pas een `UitleenDriver`-rij zodra iemand die
  vlag bij hen zet. Gevolg om te kennen: verlaten ze later de post, dan blijven ze
  via die rij in de chauffeurslijst staan (onder "zelf toegevoegd", waar je ze kan
  weghalen).

### Flesserke: ladingen met een eigen vervaldatum

Een flesserke-item (`UitleenFlesserkeItem`) is het product; wat er ligt, staat in
**ladingen** (`UitleenFlesserkeBatch`), elk met een eigen aantal en vervaldatum.
Twee bakken cola die je op verschillende momenten kocht, vervallen op
verschillende dagen; met één datum per item sloeg de rode markering "vervalt
binnen 3 weken" op de hele stapel, ook op de bakken die nog maanden goed waren.

Wat daarbij vastligt:

- **De ladingen zijn de waarheid.** `item.quantity` en `item.expiryDate` zijn een
  bijgehouden samenvatting (de som en de eerstvolgende datum); de acties zetten
  ze bij elke wijziging opnieuw via `syncFlesserkeItemTotals`. Zo blijft de
  beschikbaarheidsberekening (`quantity` min gereserveerd), de zoekfilter en de
  sortering op één rij lezen, zonder join.
- **Verbruik gaat van de oudste lading eerst.** Dat is wat er in de kelder
  gebeurt: je neemt de bak die het eerst vervalt.
- **Een lege lading telt niet mee voor de vervaldatum.** Een leeggedronken bak van
  vorige maand mag het item niet rood houden.
- **Terugdraaien zet alles op de oudste lading.** Welke lading precies verbruikt
  werd, houden we niet bij; dat zou een koppeltabel per lijn vragen voor een
  correctie die zelden gebeurt. Het totaal klopt hoe dan ook, en bij één lading
  (het gewone geval) is het exact het spiegelbeeld.
- **De snelle voorraadbijstelling werkt enkel bij één lading.** Liggen er
  meerdere, dan is niet te weten van welke er twee bij of af moeten, en zou de app
  die keuze verzinnen; je past ze dan per lading aan in de bewerkrij.

### Flesserke is voor de hele interne werking, niet enkel het praesidium

De toegangsregel was altijd "heeft een groep" (`session.groups.length > 0`), dus
werkgroepen en jaarwerkingen konden flesserke gewoon aanvragen. De teksten zeiden
"enkel voor het praesidium", en werkgroepen concludeerden daaruit dat het niets
voor hen was. Dat is rechtgezet in de app en in `docs/uitleendienst.md`.

Ziet een werkgrooplid de tab toch niet, dan hangt zijn account dit werkingsjaar
aan geen enkele groep. Dat is ledenbeheer op vtk.be (`/admin/werkgroepen`) en geen
zaak van de uitleendienst; de gate opzetten zou het verbergen in plaats van het
oplossen.

### Dagdeel is een afspraak, geen boekingseenheid

Een aanvraag kan nu "dinsdagnamiddag" zeggen (`pickupPart`/`returnPart`,
optioneel). Dat stond tot nu toe in een mail naast het systeem.

- **De voorraadberekening blijft op hele dagen.** Halve dagen zouden élke
  overlapquery moeten herschrijven (de beschikbaarheid, de conflictcheck, de
  kalender), en niemand wint daarbij: twee posten die dezelfde dag dezelfde tafel
  willen, lossen dat op met een woord, niet met een halve boeking.
- **Geen uurveld.** Het uur spreekt het team af; een uurveld zou doen alsof de app
  openingsuren kent die ze niet kent.
- **Het dagdeel staat waar de datum staat**: in de kalender als tag (op een dag
  met acht afhalingen sorteer je daarop met je ogen), op het printblad, in de
  aanvraaglijst en in de wijzigingsmail. Enkel het dagdeel wijzigen telt als een
  wijziging: daar plant iemand zijn shift op.

### Conflicten: aanvragen mag, goedkeuren niet

Wie materiaal wil dat al volledig geboekt is, kon zijn vraag niet kwijt: de
knoppen stonden op nul en daarmee hield het op. Logistiek wist dan niet dat er
een tweede gegadigde was, en die tweede wist niet dat schuiven een optie was.

- **Indienen mag, met een expliciete bevestiging.** Het lid ziet per item wat er
  niet past en vinkt aan dat hij het tóch indient. Zonder die stap belandt het
  conflict bij Logistiek zonder dat de aanvrager het doorhad; met die stap is het
  een bewuste vraag om te bemiddelen.
- **Goedkeuren blijft hard geblokkeerd.** De voorraadcheck bij goedkeuring is
  ongewijzigd. Zo kan de voorraad nooit in de min gaan; het conflict leeft enkel
  in de wachtrij.
- **Het conflict wordt altijd opnieuw berekend, nooit opgeslagen.** Annuleert de
  eerste partij, dan is het conflict weg zonder dat iemand iets moet aanraken.
  Een opgeslagen vlag zou blijven staan tot ze toevallig herberekend werd.
- **Schuiven in plaats van afwijzen.** Vanaf de detailpagina kan het team de
  datums van beide aanvragen aanpassen, met een "past dit?"-knop die doorrekent
  zonder op te slaan. Twee aanvragen passen vaak samen na een dag schuiven, en
  dan is de tweede afwijzen te grof.
- **Schuiven mailt de aanvrager** (via A9). Er is dus geen aparte "voorstel
  mailen"-knop: een voorstel dat de app niet kan opvolgen, zou een onderhandeling
  starten die nergens bijgehouden wordt. Het team schuift, beide aanvragers
  krijgen bericht over hun eigen aanvraag, en wie niet akkoord is, antwoordt op
  de mail.
- **Een goedgekeurde aanvraag mag niet in een conflict geschoven worden.** Dan
  verplaats je het probleem naar een derde aanvraag. Een aanvraag die nog beslist
  moet worden, mag wel in een conflict blijven staan.

### Staat per exemplaar: kapot telt niet meer mee

`UitleenItem.condition` geldt voor de hele rij: van vier frigo's kon er geen
enkele als kapot gemarkeerd worden zonder ze alle vier te markeren. Wie dat
onderscheid nodig heeft, splitst het item in exemplaren (`UitleenItemUnit`).

- **Optioneel, per item.** Zonder exemplaren blijft `quantity` het getal dat het
  team invulde en verandert er niets. De inventaris hoeft dus niet in één keer
  opgesplitst te worden; 405 items in exemplaren splitsen is werk dat niemand
  doet, en dan blijft de hele functie ongebruikt.
- **`quantity` wordt de bijgehouden telling** van de bruikbare exemplaren, net
  zoals bij de flesserke-ladingen. Zo blijft elke beschikbaarheidsberekening één
  kolom lezen in plaats van te moeten weten of dit item exemplaren heeft. De
  keerzijde: `quantity` betekent dan "bruikbaar", niet "hoeveel er staan"; de
  editor zegt daarom "3 bruikbaar van 4".
- **Dit is een gedragswijziging.** Tot nu toe was `condition` puur informatief:
  een kapotte rij bleef gewoon uitleenbaar. Bij een item met exemplaren telt
  KAPOT niet meer mee voor de beschikbaarheid.
- **Alleen KAPOT is hard.** TESTEN en ONVOLLEDIG tellen wel mee: een onvolledige
  set is nog altijd uitleenbaar, en wie ze niet wil uitlenen zet het exemplaar op
  "niet in roulatie".
- **Reserveren blijft op itemniveau.** Een lid vraagt "twee boxen", geen "box 3".
  Welk exemplaar iemand meekrijgt, blijkt bij het klaarzetten (A7); dat in het
  aanvraagformulier leggen zou elke aanvraag een inventarisoefening maken.

### Klaarzetten: het scherm is de waarheid, het papier de werkkopie

Klaarzetten gebeurt per lijn (`preparedAt`/`preparedById` op
`UitleenReservationLine`), tussen de goedkeuring en de afhaling. Waarom niet één
knop "aanvraag klaargezet": een shift raakt zelden in één keer door een aanvraag,
en de volgende shift moet zien hoever de vorige geraakte.

- **Enkel materiaal, niet flesserke.** Een bak cola nemen is geen zoekwerk in de
  loods, en flesserke wordt bij het terugbrengen afgerekend in plaats van
  klaargezet. De teller ("7 van 12") telt dus de materiaallijnen.
- **Het vinkje schrijft geen historiekregel.** Twaalf regels "lijn afgevinkt"
  zouden de historiek van de aanvraag onleesbaar maken; wie wat klaarzette staat
  al op de lijn zelf.
- **Een team-edit behoudt het vinkje van een ongewijzigde lijn** (zelfde item,
  zelfde aantal). De lijnen worden bij een edit vervangen, dus zonder dit zou het
  team dat enkel de datum verschoof de halve loods opnieuw moeten afvinken.
  Wijzigt het aantal wel, dan klopt het vinkje niet meer en valt het weg.
- **Het printblad is een werkkopie.** Papier laat geen spoor na van wie wat
  klaarzette, dus het scherm blijft de waarheid; het blad is er voor aan het rek.
  Puur CSS `@media print`, geen PDF-generator: het is een afdruk van wat op het
  scherm staat en geen document dat bewaard moet worden.

### Mail: vier momenten, en een meelezend adres

De uitleendienst startte bewust zonder mails ("geen mails in v1"). Dat hield geen
stand zodra het team beslissingen kon terugdraaien, uren verschuiven en de inhoud
van een aanvraag aanpassen: de aanvrager merkte zo'n wijziging pas wanneer hij
toevallig opnieuw inlogde, meestal bij het afhalen.

Wat vastligt:

- **Vier momenten mailen: goedgekeurd, afgewezen, gewijzigd, teruggedraaid.** Niet
  "afgehaald", niet "betaald", niet elke statusstap in het beheer. Wie voor elke
  klik een mail krijgt, leest er geen enkele meer, en dan mist hij ook die ene
  die telde.
- **De mail zegt wát er veranderde.** "Tafel: 5 → 3", "Afhalen: za 12 → zo 13
  september", "Uren verschoven bij goedkeuring". Diezelfde regels staan in de
  historiek (A6): één beschrijving, twee bestemmingen. "Je aanvraag is gewijzigd"
  zonder meer stuurt de aanvrager terug naar het scherm om te gaan zoeken wat.
- **Een tweede adres leest mee** (`notifyEmail`, optioneel op een aanvraag en op
  een rit). Een aanvraag hoort bij een post of werkgroep, maar de mails komen bij
  één persoon toe; wie volgend jaar die post overneemt, vindt niets terug. Het
  adres van de werkgroep in kopie overleeft de wissel van aanvrager.
- **Een mislukte verzending draait de actie niet terug.** Een mailserver die er
  even niet is, mag geen goedkeuring ongedaan maken: er wordt gelogd en
  doorgegaan. Daarom vertrekt de mail ook ná de transactie en niet erin, anders
  gaat er een bericht de deur uit over een wijziging die door een rollback nooit
  gebeurd is.
- **Naar het voorkeursadres van het lid**, dezelfde regel als de hoofdsite: wie
  een persoonlijk adres instelde, leest zijn universiteitsmail niet.

### Feedbackronde augustus 2026: negen keuzes

Na een half werkingsjaar gaf het team Logistiek feedback op de app. Negen punten
daaruit waren geen bug maar een werkingskeuze; hieronder wat beslist is en
waarom. Het werkplan dat eruit volgt staat in `docs/logistiek-feedback-plan.md`.

- **Klaarzetten gebeurt online én op papier.** Per aanvraag vinkt het team elk
  item af (met een opmerking per lijn, bv. "zie vorig event"), en dezelfde
  aanvraag is afdrukbaar als A4 om aan het rek te hangen. Het papier alleen laat
  geen spoor na van wie wat klaarzette; het scherm alleen werkt niet aan een rek
  in de loods. Daarom beide, met het scherm als bron van waarheid.
- **Eén evenement wordt de koepel, maar blijft optioneel.** Materiaal,
  flesserke en transport van hetzelfde evenement komen onder één
  `UitleenEvent` te hangen, zodat je ziet dat er bijvoorbeeld nog geen transport
  aangevraagd is en de transportverantwoordelijke de lading kan inschatten. Het
  blijft optioneel: een losse aanvraag zonder evenement moet mogelijk blijven,
  anders wordt "snel twee tafels lenen" een formulier van drie schermen.
- **De catalogus blijft achter de login; schap en rek enkel voor Logistiek.**
  Wat we hebben mag elk lid zien, waar het ligt niet. Zo blijft de catalogus
  bruikbaar zonder dat een uitgelekte pagina een plattegrond van de loods is.
  Dit is de eerste keer dat een veld in deze module op permissie verborgen
  wordt; `logistiek.manage` is de grens.
- **Gas is een gewoon catalogusitem.** Geen aparte flow en geen verplichte
  waarschuwingstekst: het is materiaal zoals de rest, en een uitzonderingsflow
  voor één productgroep is onderhoud dat niemand later nog begrijpt. Moet er
  toch iets bij staan, dan hoort dat in de omschrijving van het item.
- **Last minute begint op 7 dagen, en het team stelt het zelf in.** De grens
  stond hardcoded op 14 dagen en dat bleek te ruim: bijna elke aanvraag kreeg de
  badge, en een badge die altijd oplicht leest niemand nog. Zeven dagen houdt ze
  betekenisvol. De waarde zit in de `logistiek.settings`-`Setting`, dus
  bijstellen vraagt geen deploy.
- **Een conflicterende aanvraag mag ingediend worden.** Wie materiaal vraagt dat
  in die periode al volledig geboekt is, kan dat voortaan tóch indienen, met
  zichtbaar wat er niet past. Anders heeft de tweede aanvrager geen enkel kanaal
  en verdwijnt het gesprek naar mail. **Goedkeuren blijft wel hard geblokkeerd
  zolang de voorraad niet klopt**: het conflict is een signaal, geen
  overboeking. Logistiek kan van daaruit beide aanvragers mailen en met de
  periodes schuiven, zodat de twee aanvragen samen wél passen; dat schuiven is
  de bedoeling van de functie, niet het afwijzen van de tweede.
- **Het publieke transportoverzicht toont bezet, niet wie.** Het weekraster mag
  zonder login te bekijken zijn, maar dan enkel voertuig, dag en tijdvenster:
  geen namen, doelen of adressen, en `noindex`. Zo kan iemand zien of de kar
  vrij is zonder dat de werking van de kring op straat ligt. Bouw dat op een
  eigen, geanonimiseerde projectie en niet op de beheerquery met een filter
  erover: dat laatste lekt vroeg of laat een veld mee.
- **Geen barcodes.** Het afvinken bij het klaarzetten levert dezelfde vraag
  ("wanneer is dit stuk laatst gezien") zonder labels, scanners of een extra
  model per exemplaar. De vraag komt terug als dat te weinig blijkt.
- **Dagdelen zijn een afspraak, geen boekingseenheid.** Afhalen en terugbrengen
  krijgen naast de dag een dagdeel (voormiddag / namiddag / avond), zodat
  "dinsdagnamiddag" in het systeem staat in plaats van in een mail. De
  **voorraadberekening blijft op hele dagen**. Halve dagen in de beschikbaarheid
  zouden élke overlapquery raken (aanvragen, goedkeuren, kalender, bewerken) en
  dubbele boekingen op dezelfde dag mogelijk maken; de winst daarvan weegt niet
  op tegen dat risico.

Twee dingen hierboven halen een eerdere keuze onderuit. **"Geen mails in v1"**
(zie § Kleinere keuzes) vervalt: wanneer Logistiek een aanvraag wijzigt, moet de
aanvrager dat weten zonder in te loggen, en een aanvraag kan een extra
mailadres meekrijgen (bv. logistiek.existenz@vtk.be) zodat een werkgroepmailbox
meeleest. En **`condition` is niet langer puur informatief** zodra de staat per
exemplaar bijgehouden wordt: een kapot exemplaar telt dan niet meer mee voor de
beschikbaarheid.

---

## Shiftpagina: week is de standaard, lijst is de tweede weergave

`/shift` toont **één week tegelijk** (maandag tot zondag), in twee weergaven die
naar diezelfde week en dezelfde postfilter kijken:

- **Weekrooster (standaard).** Een shift is in de eerste plaats een blok in je
  agenda: je wil zien of ze botst met je les of met een andere shift, en dat leest
  een raster meteen. Overlappende shiften komen naast elkaar in kolommen.
- **Lijst.** Dezelfde week per dag onder elkaar, met de details uitklapbaar. Beter
  wanneer de namen lang zijn of het scherm smal is, want daar wordt een raster
  onleesbaar. De lijst blijft dus bestaan; ze is geen restant van de oude tabel.

Verder vastgelegd:

- **Je eigen shiften staan in een rail náást het overzicht**, niet als een tweede
  tabel erboven. Ze blijven zo in beeld terwijl je door de week scrolt, en een
  lege "Mijn shiften" kost geen halve pagina meer. Op smal scherm gaat de rail
  bóven het overzicht staan: wat jij vandaag moet doen, hoort niet onder andermans
  shiften te liggen.
- **Je eigen shiften staan óók in het overzicht zelf** (geel randje,
  "Ingeschreven"). De rail is je persoonlijke lijstje, het overzicht is de
  volledige week; een week met een gat waar jouw shift hoort te staan, klopt niet.
- **De rail toont de stand van het academiejaar** (voltooide shiften + bonnetjes,
  zelfde telling als de admin-ranglijst: enkel shiften die al voorbij zijn). Dat
  geeft de shiftranking eindelijk een plek op de publieke pagina en maakt van
  `/shift/history` een logische doorklik i.p.v. een badge in de paginakop.
- **Een lege week is een boodschap met een volgende stap**, niet een lege tabel:
  ze noemt de eerstvolgende geplande shift en heeft een knop die naar die week
  springt. In het rooster blijft het raster staan onder de boodschap, zodat een
  rustige week er niet uitziet als een stuk pagina.
- **De postfilter zijn chips met tellers**, en enkel voor posten die deze week
  effectief voorkomen. De oude `<select>` + datumveld + sorteerknop zijn weg: de
  weeknavigatie vertelt al waar je zit, en chronologisch is de enige zinnige
  volgorde voor een week.
- **Plaatsen lezen als "Nog 1 plaats" of "Vol"**, niet als `5/6`. De exacte
  verhouding blijft in de tooltip en in het detailvenster staan.

### Klikken op een shift opent een detailvenster

Een klik op een blok in het rooster, op een rij in de lijst of op een kaart in de
rail opent hetzelfde venster met alles over die shift, mét de knop Schrijf in /
Uitschrijven erin. Inschrijven kost dus twee klikken. Dat is bewust: sinds een
shift een langere uitleg kan dragen (zie hieronder) valt er iets te lezen vóór je
intekent, en een blok dat je met één misklik inschrijft is daar te gevoelig voor.
Het venster sluit enkel wanneer de actie lukte; faalt ze (vol, overlap), dan blijft
het staan met de foutmelding als toast. In de lijst blijft de knop in de rij zelf
bestaan als snelle weg voor wie de shift al kent.

### `openToInternationals`: over de taal, niet over wie welkom is

De markering **"Ook voor internationals"** (EN: "No Dutch required") betekent: je
kan deze shift doen zónder Nederlands. Ze zegt niets over wie mag inschrijven,
want dat mag iedereen. Zo blijft ze bruikbaar voor de vraag die een international
zich effectief stelt, en leest een Nederlandstalige ze niet als "niet voor mij".

De markering krijgt een eigen, blauwe pil. Geel, groen en rood zijn op deze pagina
gereserveerd voor de vrije plaatsen; een taalmarkering in diezelfde kleuren zou
als een capaciteitsstatus lezen. In een roosterblok is er enkel plaats voor het
wereldbol-icoon; de volledige tekst zit in de tooltip, het aria-label en het
detailvenster.

### `instructions`: de lange uitleg, apart van `description`

Een shift heeft twee teksten met een verschillende rol:

- `description` blijft de **korte regel** ("Tapshift donderdagavond"), bovenaan het
  detailvenster.
- `instructions` is de **lange uitleg in Markdown**: wat je moet doen, waar je je
  meldt, wat je mag verwachten. Niet ingevuld betekent dat het blok gewoon niet
  verschijnt; er komt dus nooit een leeg kopje op de pagina.

Cudi-shiften krijgen deze twee velden niet mee uit de spiegeling: cudi kent ze
niet, en de mirror-update raakt enkel de velden die ze zelf stuurt. Een
verantwoordelijke die de uitleg op de main site invult, ziet die dus niet
overschreven worden bij de volgende sync.

---

## Cursusdienst-shiften op de main site (brug met cudi.vtk.be)

De cursusdienst-shiften worden **aangemaakt op cudi.vtk.be** (gegenereerd uit de
openingsuren-instances), maar leden schrijven zich **enkel op de main site** in.
De cudi-shiftpagina voor studenten gaat uit (`settings.useShifts`); cudi houdt
enkel nog de admin-authoring en zijn roster-/verantwoordelijke-views.

### Waarom een brug i.p.v. federatie

Er was een keuze: cursusdienst-shiften als een aparte, gefedereerde sectie tonen
(cudi blijft de enige eigenaar, main site is puur een client), óf ze **volwaardig
native** maken. VTK koos native: ze moeten meetellen voor de **shift-ranking** én
de **reward-payout**, en die draaien op de eigen tabellen van de main site
(`ranking` groepeert `ShiftParticipant` per `Shift.post`, `reward` sommeert
`Shift.reward`). Native meetellen kan dus enkel als elke cursusdienst-shift een
echte `Shift`-rij op de main site is en de inschrijving een echte
`ShiftParticipant`. Daarom een **twee-weg-brug**:

- **Definities cudi → main:** bij aanmaken/wijzigen/verwijderen van een
  cursusdienst-shift spiegelt cudi de shift naar een `Shift`-rij op de main site
  (gemarkeerd met zijn cudi-herkomst, zodat main-admins ze niet manueel bewerken
  en de spiegeling idempotent is). Zo verschijnt elke cudi-wijziging meteen op de
  main site.
- **Inschrijven native op main:** leden (de)registreren via de bestaande
  main-flow (`/shift` + `app/api/shift/register`), dus overlap-check,
  24u-uitschrijflock + bedenktijd, ranking, reward en history werken ongewijzigd.
- **Roster main → cudi:** elke (de)registratie wordt teruggeduwd naar cudi's
  `ShiftRegistration` zodat de cursusdienst-verantwoordelijken hun roster op cudi
  houden.

Identiteit tussen de twee auth-systemen (main = KUL OIDC, cudi = Better Auth)
loopt via de **r-nummer** (`User.rNumber` is `@unique` in beide DBs). Een lid dat
nog nooit op cudi kwam, krijgt bij de eerste inschrijving **automatisch** een
cudi-gebruiker aangemaakt op basis van zijn KUL-profiel (r-nummer, naam, e-mail).

### Reward: 1 bonnetje per begonnen uur

Een cursusdienst-shift is **1 bonnetje per begonnen uur** waard, dus
`reward = ⌈(eindtijd − starttijd) / 1u⌉`:

- 1u00 → 1, 1u30 → 2, 2u00 → 2, 2u01 → 3.

Deze regel wordt **berekend bij het spiegelen** (de producer zet `Shift.reward`);
centraliseer hem in één helper zodat hij op één plek aanpasbaar is. De reward
wordt **verbruikt** in `apps/web/app/api/shift/reward/route.ts`. Per deelname
houdt `ShiftParticipant.rewardPaid` exact bij hoeveel bonnetjes al toegekend of
digitaal gebruikt zijn; daardoor kan een beheerder bijvoorbeeld 10 van 12
openstaande bonnetjes uitbetalen. De afhaalbalie kan twee openstaande bonnetjes
atomair afboeken voor een broodje en schrijft daarvoor een auditrij in
`TheokotVoucherRedemption`. Wil je de waardering wijzigen, pas dan de
spiegel-helper aan; de saldo- en auditlogica blijft gelijk.

### Post: "Cursusdienst"

Gemirrorde shiften krijgen `Shift.post = "Cursusdienst"`, zodat ze als een aparte
post in de ranking verschijnen. De post wordt **gezet bij het spiegelen** (zelfde
producer/helper als de reward) en **verbruikt** in
`apps/web/app/api/shift/ranking/route.ts` (groepeert per `shift.post`; leeg valt
onder `GEEN`). Eén constante voor het post-label, zodat hernoemen op één plek
gebeurt.

### Inschrijven blokkeert bij een cudi-storing (bewust)

Inschrijven/uitschrijven op de main site handelt de cudi-registratie **blokkerend**
af (`apps/web/lib/cudiRegistrationSync.ts` + de shift-register-route): een
inschrijving slaagt enkel als cudi ze ook registreert, anders wordt de native
`ShiftParticipant` teruggedraaid en krijgt het lid een foutmelding. Zo blijven de
main-roster en de cudi-roster strikt consistent. De capaciteit wordt op de main
site afgedwongen (`maxParticipants`); cudi is een tweede gate + de roster voor de
verantwoordelijken. Een vangnet-reconcile (`/api/integrations/cudi/sync-registrations`,
voor een cron) zet zeldzame randgevallen alsnog gelijk.

### Volledig opt-in (uit by default)

De hele shift-brug staat **uit** tot je het gedeelde secret zet (`CUDI_SYNC_SECRET`
op de main site, gelijk aan `MAIN_SITE_SHIFT_SYNC_SECRET` op cudi). Zonder secret:
cudi spiegelt niets, het spiegel-endpoint weigert alles (401), er bestaan dus geen
`sourceSystem = "cudi"`-shiften, en de inschrijfflow doet geen enkele cudi-call
(gedraagt zich exact zoals vroeger). De migratie voegt enkel twee nullable kolommen
toe en verandert op zich niets.

### Roster-autoriteit ligt op de main site

Zodra de brug aanstaat, is de main site de autoriteit voor de inschrijvingen: een
reconcile duwt de main-roster naar cudi en **pruned** cudi-registraties die de main
site niet kent. Cudi-side roster-bewerkingen voor cursusdienst-shiften (bv.
`adminAddShiftRegistration`) worden dus door de volgende reconcile overschreven;
roster-beheer hoort daarom op de main site te gebeuren. Daarom zet cudi ook zijn
student-shiftpagina uit (fase 4); de admin-authoring van de shiften zelf blijft.

---

## Toegang tot externe applicaties (SSO)

VTK is OAuth2-provider: applicaties laten leden aanmelden met hun VTK-account.
Wie waar binnen mag, is een kringkeuze en geen technisch detail.

### Twee soorten applicaties

- **Open** (bv. de cudi-tool): elk lid met een VTK-account kan aanmelden.
  Permissies bepalen enkel wat iemand er *méér* mag; wie in het praesidium zit of
  cudiwerker is, krijgt verhoogde rechten, de rest kan gewoon binnen.
- **Beperkt** (bv. de interne wiki): enkel wie er expliciet toegang toe kreeg,
  raakt binnen. Iedereen anders wordt geweigerd tijdens het aanmelden en landt op
  een pagina die uitlegt waarom.

De blokkade zit in de aanmeldflow bij VTK, niet in de applicatie zelf. Een app
die zelf moet controleren of je binnen mag, vergeet dat ooit; en dan staat de
deur open zonder dat iemand het merkt.

### Toegang is een permissie, geen rol

Een beperkte applicatie heeft één speciale permissie, `<namespace>.access`, die
niets anders doet dan toegang verlenen. Ze wordt automatisch aangemaakt zodra je
een applicatie beperkt zet.

Toekennen gebeurt via de gewone weg: aan een VTK-rol, aan een post, of
rechtstreeks aan één lid. Maar wat de applicatie te horen krijgt, is enkel de
lijst permissiecodes; **niet** onze rollen, posten of interne permissies. Zo
schrijft een externe app onze postenstructuur niet in zijn code, en breekt hij
niet wanneer wij een post hernoemen.

**Via een rol is de normale weg.** Dat is niet enkel een aanbeveling: een rol
wordt beheerd op het rollenscherm, volgt het werkingsjaar, en overleeft het
vertrek van één persoon. Daarom staat een beperkte applicatie waaraan geen
enkele rol toegang geeft in "Aandacht vereist", ook wanneer er wel losse
toekenningen aan personen bestaan; die app werkt vandaag, maar valt stil zodra
die ene persoon vertrekt.

### Wie mag toekennen

Het **vocabulaire** definiëren (welke codes bestaan er, en is de app beperkt)
hoort bij de SSO-beheerder: dat is een technische beslissing over de integratie.

Het **toekennen** van bestaande codes aan een rol kan iedereen die rollen
beheert, vanaf het rollenscherm onder "Externe apps". Wie een post of werkgroep
runt, moet toegang tot de tools van die post kunnen regelen zonder daarvoor
SSO-beheerder te worden. Dat is ook geen verruiming: wie rollen beheert, kan
sowieso al élk VTK-recht aan een rol hangen.

Let op: een andere permissie van dezelfde applicatie hebben (`wiki.read`) geeft
géén toegang. Dat onderscheid is de reden dat `access` apart bestaat: je kan
iemand alvast rechten geven zonder hem al binnen te laten.

### Wat op 15 juli reset en wat niet

- Toekenningen **via een rol of een post** volgen het werkingsjaar en resetten
  dus mee op 15 juli. Dat is het punt van via een rol toekennen: wie de post
  verlaat, verliest de toegang vanzelf.
- **Rechtstreekse** toekenningen aan één lid blijven staan tot ze ingetrokken
  worden. De persoon die een integratie onderhoudt, is geen werkingsjaar-begrip,
  en elke externe toepassing 's nachts leegmaken is een storing die niemand zag
  aankomen. Wat wél tijdelijk is, krijgt een vervaldatum mee.

### De faalwijze om te kennen

Een applicatie beperkt zetten en vergeten de toegangspermissie toe te kennen,
sluit iedereen buiten, inclusief degene die de knop omzette. Daarom drie
vangnetten: de permissie wordt automatisch aangemaakt, het scherm waarschuwt
vooraf wanneer nog niemand ze heeft, en zo'n applicatie komt in "Aandacht
vereist" op /admin/sso.

## Dashboardtegels (snelkoppelingen op /admin)

Het dashboard opent met een raster snelkoppelingen naar de externe tools die een
post dagelijks nodig heeft: de drive, de wiki, een repository, de printbestellingen.
Er zijn drie soorten, en dat onderscheid is de kern van de feature.

- **Voor iedereen (GLOBAL).** Beheerders met `dashboard.manage` zetten deze op
  /admin/dashboard-tiles; elk ingelogd lid ziet ze.
- **Per post of werkgroep (GROUP).** Enkel leden van die groep zien ze. Wie in
  drie posten zit, krijgt dus drie extra reeksen.
- **Van jou (USER).** Elk lid mag eigen tegels maken. Die zijn persoonlijk en
  komen op niemand anders zijn dashboard.

Vastgelegde keuzes:

- **De tegels staan gegroepeerd onder een kop per herkomst**, niet in één plat
  raster. In één raster kon je niet zien welke snelkoppeling van welke post kwam,
  en dat is precies wat je wil weten voor je ze aan een collega doorgeeft ("die
  staat er alleen voor IT"). De kop noemt de post bij naam; een post zonder
  tegels krijgt geen lege sectie.
- **Slepen herschikt binnen één sectie.** Een volgorde tussen jouw tegel en die
  van IT bestaat niet: de secties worden toch opnieuw gegroepeerd, dus een tegel
  naar een andere sectie slepen zou terugspringen.
- **Een lid mag een gedeelde tegel voor zichzelf aanpassen of verbergen**, maar
  ze nooit voor anderen wijzigen. De aanpassing leeft in `UserDashboardTilePref`
  en is met één klik terug te zetten. Verbergen is geen verwijderen: zet een
  beheerder er later een andere URL op, dan krijg je die wel.
- **Een tegel toont een pictogram uit een gecureerde set, of een eigen logo.**
  Het logo is er voor tools met een sterk merk (een GitHub- of Notion-logo herken
  je sneller dan een generiek icoon). Het pictogram blijft bewaard zolang er een
  logo staat: haal je het logo weg, dan valt de tegel terug op het pictogram in
  plaats van leeg te worden.
- **Elk lid mag een tegellogo uploaden**, ook zonder uploadpermissie. Wie een
  persoonlijke tegel mag maken, moet ze ook kunnen afwerken. De upload is daarom
  apart gehouden (`kind=tile`): maximaal 2 MB, herschaald naar 128px, en onder een
  eigen `tiles/`-prefix zodat de tegel-actions een key van elders weigeren.

## Apple/Google Wallet-tickets

Naast de A4-PDF (`apps/web/lib/ticketing/pdf.ts`) kan een ticket ook als Apple- of
Google Wallet-pass gedownload worden, in hetzelfde ontwerp (kleuren, logo) als de
PDF. Code in `apps/web/lib/ticketing/wallet/`.

- **Twee providers naast elkaar: "direct" en walletwallet.dev.** Een geldige Apple
  Wallet-pass moet ondertekend zijn met een certificaat dat uiteindelijk naar Apple
  herleidt; daar is geen weg omheen. "Direct" betekent: VTK's eigen Apple Developer
  Program-account (99$/jaar) en Pass Type ID-certificaat, zelf ondertekend met
  `passkit-generator`. Zolang dat er niet is (of bewust niet de moeite waard wordt
  geacht), kan `WALLET_WALLETWALLET_API_KEY` gezet worden: een third-party API die
  zelf al zo'n certificaat heeft en passes namens hen uitgeeft. Dat kost geen eigen
  Apple-account, maar wel een terugkerend SaaS-abonnement (gratis tot 1000
  passes/maand, nadien betalend) en de pass wordt technisch uitgegeven via hún
  identiteit, niet die van VTK. Staat een direct-config voor een platform (Apple of
  Google) klaar, dan wint die per platform altijd van walletwallet.dev
  (`apps/web/lib/ticketing/wallet/index.ts`): vol eigenaarschap gaat voor wanneer het
  er is.
- **Elke knop verschijnt pas als de bijhorende config compleet is** (zie
  `.env.example`). Geen halfwerkende "Voeg toe aan Wallet"-knop die daarna een
  foutmelding geeft: ontbreekt de configuratie, dan bestaat de knop gewoon niet, net
  als de ticketmail die in dev stil wegvalt zonder `SMTP_HOST`.
- **Wat er van het ticketontwerp meegaat: kleuren, logo, footer en de hero-foto.**
  Het *sjabloon* (Classic / Poster / Gesplitst) gaat bewust niet mee: een walletpas
  heeft een vaste, door iOS/Android opgelegde indeling, dus "foto bovenaan" versus
  "foto ernaast" bestaat daar niet. De foto zelf heeft wel een vaste plek in beide
  formaten (Apple's strip-afbeelding, Google's `heroImage`) en wordt daar gebruikt.
  Op de directe Apple-weg snijden we de foto zelf bij naar 375x144pt (de
  strip-verhouding voor een eventticket met vierkante barcode) rond hetzelfde
  focuspunt dat de PDF gebruikt, zodat een staande foto niet blind gecentreerd
  wordt. walletwallet.dev neemt enkel een URL en stuurt de afbeelding ongesneden
  door; daar bepaalt het besturingssysteem de uitsnede. Wil je dat gelijktrekken,
  dan is daar een eigen publieke route nodig die een bijgesneden variant serveert.
- **Geen push-update-service.** Een pass wordt bij elke download vers opgebouwd uit
  de actuele ticket- en ontwerpgegevens (zoals de PDF), maar er is geen Apple
  Push/webservice-stuk dat een al toegevoegde pass op iemands telefoon achteraf
  bijwerkt als het event verandert. Dat is een apart, optioneel stuk Apple
  Wallet-infrastructuur (APNs + een update-webservice) dat bewust buiten deze eerste
  versie valt: het voegt reële complexiteit toe voor een randgeval (een gewijzigd
  event terwijl iemands pass al op hun telefoon staat) dat bij VTK's schaal zelden
  voorkomt.
- **Geen wallet-knoppen in de bevestigingsmail zelf.** De mail linkt (zoals
  voorheen) naar de ticketpagina, waar de wallet-knoppen naast de PDF-knop staan.
  Bij een bestelling met meerdere tickets zouden meerdere sets wallet-knoppen in de
  mail rommelig ogen en zijn ze bovendien pas na de eerste keer openen van de
  ticketpagina bruikbaar (dezelfde toegangscookie als de bestaande PDF-link vereist
  dat). "Ook via mail" is zo gelezen als: bereikbaar via de link die de mail al
  stuurt, niet letterlijk als knoppen in de mail-HTML.

---

## Wat er in Google mag staan (canonicals, sitemap, robots)

De site draait op twee URL-vormen voor dezelfde pagina: Nederlands leeft op de root
(`/kalender`), maar `/nl/kalender` rendert exact dezelfde inhoud omdat `proxy.ts`
een pad met taalvoorvoegsel gewoon doorlaat. De keuze die daaruit volgt is
product- en niet puur technisch:

- **De voorvoegselloze NL-URL is de echte URL.** Elke canonical wijst daarheen, en
  `x-default` in de hreflang-tabel ook: wie zonder taalvoorkeur binnenkomt, hoort
  op het Nederlands te landen. Engels leeft onder `/en/...`. Alles hiervoor loopt
  via `buildMetadata()` in `apps/web/lib/seo.ts`; schrijf geen losse `metadata` met
  een handgeschreven titel, want dan lopen canonical en hreflang uiteen.
- **`/nl/...` staat bewust niet op disallow in robots.txt.** Een crawler die een
  URL niet mag ophalen ziet de canonical erop ook niet en kan hem alsnog kaal
  indexeren. Duplicate content los je op met de canonical, niet met robots.txt.
- **Hreflang gebruikt `nl` en `en`, het `<html lang>`-attribuut `nl-BE` en `en`.**
  Dat lijkt inconsistent maar is het niet: `hreflang="nl-BE"` betekent voor een
  zoekmachine "enkel Nederlandstaligen in België", waardoor een zoeker uit
  Nederland buiten de match valt. Voor de taal van het document is de Belgische
  variant wel de juiste (spelling, uitspraak in een screenreader).
- **Wat in de sitemap komt**: de vaste publieke routes (expliciete lijst in
  `apps/web/lib/sitemap.ts`, geen scan van de bestandsboom, want `app/[locale]`
  bevat ook account- en bestelschermen), de zichtbare categorieën die een eigen
  pagina hebben, elke gepubliceerde infopagina, en enkel `PUBLIC`-evenementen. Een
  concept en een ledenexclusief evenement horen er niet in, ook niet als losse
  titel: dat zou het bestaan ervan alsnog verklappen.
- **Een pagina onder een categorie is canoniek `/<categorie>/<slug>`**, niet
  `/p/<slug>`, hoewel beide werken. De categorievorm is de weg die de navigatie
  aanbiedt, dus dat is de URL die gedeeld hoort te worden.
- **Het standaard deelbeeld is het Arenbergkasteel onder een navy scrim met het
  VTK-wordmerk** (`apps/web/app/opengraph-image.jpg`, gebouwd uit
  `public/hero-arenberg.jpg`). Eén beeld voor de hele site; een pagina met een
  echte eigen foto geeft die mee aan `buildMetadata()`.

---

## Zoeken: wat er in de resultaten mag staan

De zoekfunctie (`/zoeken`) doorzoekt **de pagina's van de site**, **de activiteiten
in de kalender**, **de fotoalbums** en **het materiaal van de uitleendienst**. Wat er
per soort in mag, is een zichtbaarheidskeuze en geen technische:

- **Enkel gepubliceerde pagina's.** Een concept (`publishedAt` leeg) staat niet in de
  resultaten, ook niet als losse titel: dat zou verklappen dat er iets in de maak is
  en waarover het gaat. Een gepubliceerde pagina die niet aan een headertab hangt,
  komt wél in de resultaten. Ze is niet via de navigatie bereikbaar, maar ze staat
  ook in de sitemap en is gewoon publiek; zoeken is dan vaak de enige manier om ze
  terug te vinden.
- **Enkel publieke evenementen, en enkel die van jouw doelgroep.** Een
  ledenexclusief of intern evenement hoort er niet in, en een evenement met een
  doelgroepcategorie (eerstejaars, internationals) verschijnt enkel bij wie erbij
  hoort; wie niet ingelogd is, ziet die dus niet. Dat is dezelfde regel als op de
  kalender zelf, waar een doelgroepevent ook pas opduikt bij het juiste profiel.
- **Die regels worden hergebruikt en niet nagebouwd.** De zoekopdracht haalt eerst
  kandidaten op met Postgres (rang en fragment), maar de rijen zelf komen via Prisma
  binnen met exact dezelfde `where` als de rest van de site: `publishedAt` voor een
  pagina, `visibility: "PUBLIC"` plus `audienceFilter()` uit
  `apps/web/lib/calendar/audience.ts` voor een evenement, precies zoals
  `/api/calendar/events` en de ics-feeds. Een tweede, met de hand geschreven
  zichtbaarheidsregel in SQL loopt vroeg of laat uiteen met de eerste, en dan lekt er
  een intern evenement in de zoekresultaten. Verandert de kalenderzichtbaarheid, dan
  verandert het zoekresultaat mee, zonder dat iemand daaraan hoeft te denken.
- **Uitleenmateriaal enkel voor wie ingelogd is.** "Hebben jullie een beamer" is
  precies het soort vraag waarmee iemand op de site landt, dus materiaal hoort
  vindbaar te zijn. Maar de catalogus zelf zit in de logistiek-app achter een login
  (zie `docs/uitleendienst.md`), en materiaalnamen in een publieke resultatenlijst
  zetten zou die keuze langs de achterdeur ongedaan maken. Een uitgelogde bezoeker
  zou bovendien op een loginscherm landen, wat een zoekresultaat is dat niets
  oplevert. Daarom draait die zoekpas enkel met een sessie, en het resultaat linkt
  naar `LOGISTIEK_PUBLIC_URL`; zonder die instelling toont de site geen materiaal,
  want dan valt er nergens naartoe te linken.
- **Fotoalbums volgen wat er op /media staat.** Ze komen niet uit de database maar
  uit Immich, en enkel albums met de `[gallery]`-markering zitten in die snapshot.
  Zichtbaarheid is dus gratis: wat niet publiek op /media staat, kan ook niet
  gevonden worden. Het matchen gebeurt in het geheugen (er valt niets te indexeren),
  en de aanroep zit in een try/catch: Immich is af en toe onbereikbaar, en dat mag
  een zoekopdracht hoogstens albums kosten, niet de hele resultatenlijst.
- **Wat er niet doorzocht wordt**: tickets, bestellingen, praesidiumleden en alles
  achter een login. Die schermen staan om dezelfde reden niet in de sitemap.
- **De resultatenpagina staat zelf op `noIndex`.** Elke zoekterm is een eigen URL, en
  die horen niet als duizenden dunne pagina's in Google te belanden.
- **In de sitekop staat op breed scherm een knop en geen invoerveld.** De elf tabs
  vullen de navigatiebalk tot op negen pixels na, en `.nav-inner` stopt met groeien
  op `--max` (1320px), dus een breder scherm levert geen ruimte op. Een zoekveld
  ernaast zou over de laatste tab vallen. De knop (vanaf 1280px, waar hij past)
  brengt je naar `/zoeken`, waar de cursor meteen in het veld staat. Onder 1211px
  zijn de tabs één menuknop en staat het echte veld bovenaan dat paneel. In de
  strook tussen 1211 en 1280px is er geen ingang in de balk; wil je die er wel,
  verklein dan eerst de navigatie zelf.
- **Zoeken is een gewoon GET-formulier.** De zoekterm staat in de URL, de pagina
  rendert op de server, en er is geen client-state. Zo is een zoekresultaat
  deelbaar en herlaadbaar en werkt de terugknop; een veld met eigen state en
  live-resultaten maakt die drie kapot en voegt bij tientallen pagina's weinig toe.

---

## De 404-pagina

- Er is er één, in de huisstijl: dezelfde donkere `.vtk-page-head`-band als elke
  andere pagina, en daaronder drie wegen terug (home, Info, kalender). Geen vierde
  of vijfde: dat zijn de drie plekken waar verdwaald verkeer op uitkomt.
- **Twee bestanden, één scherm.** `app/[locale]/not-found.tsx` vangt elke
  `notFound()` in een segment onder de taal (het gros: een onbekende
  `/[headerSlug]` valt gewoon binnen de routeboom); `app/not-found.tsx` vangt een
  adres dat op geen enkele route valt en staat buiten `[locale]/layout.tsx`, dus
  dat bestand haalt zelf de sitekop, de sitevoet en de ontwerp-CSS binnen. Beide
  renderen `components/site/NotFoundView.tsx`.
- Een not-found-component krijgt geen props, ook geen `params`. De taal komt daar
  uit de `x-pathname`-header die `proxy.ts` zet, net als in de root layout. De
  canonical wijst naar het adres dat niet bestond en de pagina staat op `noIndex`.

---

## Footer: welke socials, en de bevriende kringen

- **De socials in de footer zijn Instagram, Facebook, LinkedIn, YouTube en
  TikTok.** YouTube (`youtube.com/@VTKLeuven`) en TikTok
  (`tiktok.com/@vtkleuven`) stonden wel op de oude site en op de officiële
  linktree, maar niet in deze footer. De oude site linkte YouTube nog via de
  verouderde `youtube.com/user/...`-vorm; we gebruiken de handle-URL.
  Er bestaat ook een X/Twitter-account (`x.com/vtkleuven`), maar dat staat niet op
  de linktree die communicatie zelf onderhoudt en is van buitenaf niet te
  controleren op activiteit; het is dus niet toegevoegd. Wil VTK het er wel bij,
  voeg het dan toe zoals de andere vijf.
- **De bevriende kringen krijgen geen eigen lijst.** BEST, Biomedix, Chemix,
  Existenz, Mechanix, Revue en Statix staan al als `WERKGROEP` in de database
  (`WERKGROEP_SEEDS`) en dus op `/werkgroepen`, met hun ploeg per werkingsjaar en
  hun eigen website. De footerlink noemt ze daarom bij naam
  ("Werkgroepen & bevriende kringen") en wijst naar die ene pagina; een tweede,
  handgeschreven lijst zou binnen het jaar uit elkaar lopen met de eerste. De
  oude sleutel `footer.linkWerkgroepen` blijft ongebruikt achter in de
  i18n-bestanden: die mochten tijdens deze werkstroom enkel aangevuld worden.

---

## Contactformulier: één bestemming, geen bevestigingsmail

- **Alles gaat naar `info@vtk.be`.** Eén bestemming, geen keuzelijst met
  onderwerpen die elk naar een ander adres routeren en geen tabel met
  postadressen in de database. Beslist voor de uitvoering begon. De reden is
  onderhoud: zo'n tabel loopt binnen een werkingsjaar achter op de werkelijkheid,
  want posten wisselen elk jaar en een verkeerd gerouteerd bericht valt in een
  mailbox die niemand meer leest. Nu ziet altijd dezelfde mailbox alles binnenkomen
  en gaat het van daar intern verder; dat is één menselijke stap in ruil voor de
  garantie dat er niets verdwijnt. Het onderwerp dat de bezoeker zelf typt, komt in
  de titel van de mail met een `[Website]`-voorvoegsel ervoor, zodat er een filter
  of label op kan staan.
- **Er vertrekt geen automatische bevestigingsmail naar de verzender.** Iedereen
  kan om het even welk adres in het formulier typen, dus zo'n mail is te misbruiken
  als spamversterker: een bot vult het adres van zijn slachtoffer in en onze server
  levert de mail af, met onze reputatie eronder. De bevestiging staat daarom op het
  scherm (een groene toast plus een leeggelopen formulier). Wie wél een spoor wil,
  ziet ons antwoord vanzelf: `replyTo` staat op de bezoeker, dus "Beantwoorden"
  komt rechtstreeks bij hem terecht.
- **De afzender is een VTK-adres, niet dat van de bezoeker.** Mailen namens
  `@gmail.com` mag onze server niet ondertekenen; SPF en DKIM gooien zo'n bericht
  in de spam. De bezoeker zit in `replyTo`, en naam en adres staan ook in de tekst
  van de mail zelf, zodat doorsturen het antwoordadres niet verliest. De afzender
  staat los van `MAIL_FROM` (`MAIL_FROM_CONTACT`): die eerste is de ticket-
  afzender, en een contactvraag hoort niet als "VTK Tickets" binnen te komen.
- **Spam wordt tegengehouden met een honeypot en een limiet per IP, niet met een
  captcha.** Een captcha kost elke echte bezoeker moeite (en zet vaak een derde
  partij op de pagina) om een handvol scripts tegen te houden. Het verborgen veld
  levert bij invulling een **groene** toast op en er vertrekt niets: een bot die een
  foutmelding krijgt, weet dat hij ontdekt is en past zijn volgende poging aan. De
  limiet staat op drie berichten per kwartier per IP en telt in het geheugen van het
  proces; bij een herstart begint ze opnieuw. Dat is bewust: dit hoeft geen
  boekhouding te zijn, enkel een drempel, en het scheelt een tabel en een opkuistaak.
- **De inhoud van een bericht gaat nooit naar Sentry.** Mislukt het versturen, dan
  loggen we dát, niet wat er in stond. Het is de post van een bezoeker.
- **`/contact` is een eigen route en geen speciaal geval in het
  categorie-overzicht.** Contact is in de database een gewone `HeaderTab` (code
  `CONTACT`) met pagina's eronder, dus zonder eigen map zou `/contact` de generieke
  categorieweergave tonen. Een `if (slug === "contact")` daarin zou elke andere
  categorie meeslepen. Het statische segment `app/[locale]/contact` wint van
  `[headerSlug]` en neemt enkel `/contact` over; de pagina's eronder blijven op
  `/contact/<pagina>` bij de generieke weergave, en het formulierscherm herhaalt hun
  lijst onderaan zodat er niets onbereikbaar wordt. De titel en de intro komen nog
  altijd uit de categorie in `/admin/inhoud`; enkel het formulier is code. Wordt de
  slug van die categorie ooit hernoemd, dan blijft het formulier op `/contact` staan
  terwijl de navigatie naar de nieuwe slug wijst; die pagina laadt de categorie
  daarom op `code` en niet op slug.

---

## Bezoekersstatistieken: Umami op onze eigen server, enkel na toestemming

- **We meten zelf, of we meten niet.** De keuze was van bij het begin
  self-hosted: het verkeer van bezoekers van een studentenkring hoort niet bij een
  analytics-bedrijf terecht te komen, en zolang de meting op onze eigen server
  draait komt er geen verwerker bij in `docs/privacy-processors.md`. Een gehoste
  variant (Umami Cloud, Plausible Cloud) is dus geen terugvaloptie: dan meten we
  liever niets.
- **Umami, en niet Plausible.** De eerste keuze was Plausible Community Edition.
  Dat is afgevoerd tijdens de uitvoering, om één reden: Plausible slaat zijn
  events op in ClickHouse en sleept dus naast zijn eigen Postgres ook een
  ClickHouse-container mee. ClickHouse vraagt in de praktijk 1 tot 2 GB geheugen,
  en op deze server draaien al de website, de logistiekapp, drie workers en de
  volledige Immich-stack. Twee zware containers erbij voor het tellen van
  paginaweergaves staat niet in verhouding. Umami is een Node-app met enkel
  Postgres, en Postgres staat er al.
- **Umami deelt de bestaande Postgres.** Het krijgt daar een eigen database
  (`umami`), geen tweede Postgres-container zoals Immich die heeft. Dat scheelt een
  instantie om te back-uppen, te upgraden en in de gaten te houden, en de
  statistiekendata is klein. Gevolg: er is geen apart volume voor Umami; zijn
  gegevens zitten in `postgres-data`, dus in de bestaande back-up van die database.
  `POSTGRES_DB` maakt enkel bij een leeg volume een database aan en het volume op
  de productieserver bestaat al, dus maakt een eenmalige `umami-db-init`-stap in
  Compose de database aan wanneer ze ontbreekt.
- **Leeg `UMAMI_APP_SECRET` betekent uit.** Zelfde patroon als de workers: de
  container draait dan leeg in plaats van in een herstartlus te vallen, en de
  website laadt geen script zolang `UMAMI_PUBLIC_URL` of `UMAMI_WEBSITE_ID` leeg
  is. Zo blijft een omgeving zonder statistieken (lokaal, dev) gewoon werken.
- **Umami staat daarbovenop achter het compose-profiel `umami`**, en dat is geen
  dubbelop. Het "leeg secret = uit"-patroon schakelt een dienst uit *nadat* de
  container bestaat, en om die te maken haalt `docker compose up` eerst de image
  op. Voor de workers valt dat niet op (ze draaien op images die de server toch
  al heeft), maar Umami is een verse pull van ghcr.io, en die liet de deploy
  falen op `denied: denied` terwijl de dienst niet eens aan stond. Een profiel
  houdt de dienst helemaal buiten het project tot je hem bewust aanzet.
  - Aanzetten raakt daardoor **twee** bestanden: de sleutels in de root-`.env`
    (die gaat naar de containers) en `COMPOSE_PROFILES=umami` in `infra/.env`
    (dat leest compose zelf, voor zijn eigen interpolatie en profielen). Dat
    onderscheid kostte tijd: `${UMAMI_APP_SECRET}` in de compose-file resolveerde
    altijd naar leeg, want compose kijkt daarvoor niet in de root-`.env`. Het
    secret komt nu via `env_file`, precies zoals bij de workers.
  - Komt de pull daarna alsnog op `denied` terecht, kijk dan naar
    `~/.docker/config.json` op de server: een verlopen ghcr-login laat ghcr die
    credentials gebruiken en weigeren in plaats van anoniem door te laten. De
    image is publiek, dus `docker logout ghcr.io` volstaat.
- **Het script laadt pas na een expliciete keuze**, ook al plaatst Umami geen
  cookies. Dezelfde keuze als voor Sentry en dezelfde knop in de cookiebanner:
  er is geen tweede schakelaar bijgekomen. Omdat de beslissing server-side valt,
  herlaadt de banner de pagina na een wijziging; dat deed ze voor Sentry al.
  De banner en het cookiebeleid noemen nu allebei de statistieken, want een
  scherm dat enkel over monitoring spreekt terwijl er ook geteld wordt, liegt.
  De privacyverklaring hoefde niet aangepast: "met wie delen we je gegevens"
  blijft kloppen, er komt niemand bij.
- **Paginaweergaves, geen personen.** Geen custom events met persoonsgegevens,
  geen identificatie van aangemelde leden. Querystrings en fragmenten gaan er niet
  in mee (`data-exclude-search`, `data-exclude-hash`), want daar zitten tokens en
  zoektermen in. Umami zelf bewaart geen IP-adres, maar leidt er samen met de
  user-agent en een dagelijks wisselend zout een hash uit af om een herhaalde
  weergave binnen dezelfde dag te herkennen; dat staat zo in het cookiebeleid.
- **`/admin`, `/scan` en `/tickets/bestelling/...` worden niet gemeten.** De eerste
  twee zijn interne schermen waar bezoekersaantallen niets betekenen; het derde
  draagt een bestelnummer in het pad, en dat is een persoonsgegeven dat niet in een
  statistiekendatabase hoort. Dat gebeurt op twee plaatsen tegelijk, want één
  volstaat niet: de server rendert het script niet op zo'n pagina, en het script
  krijgt daarnaast een filter mee (`data-before-send`) voor de navigaties die
  daarna nog in de browser gebeuren. De App Router navigeert immers client-side,
  dus zonder die filter zou een klik van de homepage naar `/admin` alsnog een
  paginaweergave opleveren. Beide lagen lezen dezelfde lijst uit
  `apps/web/lib/analytics.ts`, zodat ze niet uiteen kunnen lopen.
- **Wat niet vanzelf een paginaweergave is, meten we apart.** Een deel van de
  site leeft binnen een pagina: de magazines openen in een leesvenster op
  `/media`, een aftermovie speelt daar af, en een klik naar career.vtk.be of de
  cudi-webshop verlaat de site zonder spoor. Zonder extra meting ziet een
  redactie enkel dat `/media` bezocht is, en dat is geen cijfer waar iemand iets
  aan heeft.
  - **Een geopend magazinenummer is een paginaweergave**, met een verzonnen adres
    per nummer (`/media/bakske/2025-2026-s2w6`), en geen los event. Zo staan de
    nummers gewoon naast elkaar in het Pages-overzicht; een redactie moet niet
    eerst leren waar de gebeurtenissenrapporten zitten om haar eigen cijfers te
    vinden. Downloaden en openen in een nieuw tabblad zijn wél events: dat zijn
    andere handelingen dan lezen en ze horen niet als weergave mee te tellen.
  - **Klikken naar buiten en downloads lopen via `data-umami-event`-attributen**
    en niet via klikafhandelaars. Umami vangt die zelf op met `closest()` en
    verstuurt met `keepalive`, dus het werkt op een link die meteen wegnavigeert,
    en het vraagt geen `use client` rond een server component. De helper
    `umamiEvent()` in `lib/analytics.ts` bouwt die attributen, want de sleutels
    moeten aan `[\w-_]+` voldoen: een sleutel met een accent wordt stil genegeerd
    en dan ontbreekt het cijfer zonder dat iets kapot lijkt.
  - **Bij een externe klik gaat enkel de hostnaam mee**, niet de volledige URL.
    Dat houdt het rapport leesbaar (`career.vtk.be` in plaats van twintig
    varianten) en voorkomt dat er per ongeluk een token in een querystring
    meegaat.
  - **De ticketmeting stopt bij "afrekenen gestart".** Dat getal zegt of de
    koopstroom werkt; het bestelnummer hoort bij een persoon en gaat dus niet
    mee, net zoals `/tickets/bestelling/...` niet gemeten wordt.
- **Eén uitzondering op "geen zoektermen": een zoekopdracht zonder resultaat.**
  De regel hierboven blijft staan; querystrings gaan nog altijd niet mee, dus
  een geslaagde zoekopdracht laat geen term achter. Maar een zoekopdracht die
  niets oplevert is het scherpste signaal dat er inhoud ontbreekt of anders heet
  dan mensen denken, en dat signaal is waardeloos zonder de term. Daarom stuurt
  enkel het lege resultaat een event `zoeken-zonder-resultaat` met de zoekterm.
  De afweging: de term kan een naam bevatten die niemand op de site kon vinden.
  Dat is bewust aanvaard omdat het om de mislukte gevallen gaat en het aantal
  klein is; wil je dat niet, dan haal je `zoekterm` uit `trackEmptySearch()` in
  `lib/analytics-client.ts` en blijft het aantal mislukte zoekopdrachten over.
- **De cijfers komen terug naar het beheer, niet naar de publieke site.** Bovenaan
  `/admin/media` staat per nummer hoe vaak het geopend is. Dat is waar de redactie
  toch al komt om een nummer te uploaden, en het spaart haar een Umami-login.
  Publiek zetten ("3.412 keer gelezen" op /media) is bewust niet gedaan: dat is een
  ander soort claim, en een tegenvallend cijfer naast een nummer is geen prettige
  plek om een jaargang mee af te sluiten.
  - **De toegang loopt via een share-token, niet via een wachtwoord.** In Umami zet
    je voor de website een Share URL aan; het id daaruit staat als `UMAMI_SHARE_ID`
    in de omgeving en geeft enkel leesrecht. Zo staat er geen beheerderswachtwoord
    in de `.env` van de website, en trek je de toegang met één klik in Umami weer
    in. Self-hosted Umami 3.x kent geen API-key (die is er enkel in Umami Cloud), en
    de andere weg (`/api/auth/login` met de beheerder) zou dat wachtwoord wél in de
    omgeving zetten.
  - **De koppeling nummer → adres gebeurt met dezelfde functie als bij het meten**
    (`magazineViewUrl` in `lib/analytics.ts`). Zou het beheer dat adres zelf
    opnieuw samenstellen, dan staat er bij de eerste wijziging aan het formaat
    overal nul terwijl er wel degelijk gemeten wordt.
  - **Geen cijfer is geen fout.** Ontbreekt de configuratie of antwoordt de
    statistiekserver niet, dan staat er één regel uitleg en werkt de rest van het
    mediabeheer gewoon. Downloads per nummer zijn best effort: lukt die tweede
    bevraging niet, dan tonen we de weergaven zonder downloads in plaats van
    helemaal niets.

---

## Herinnering voor een shift

Wie zich inschrijft voor een shift, krijgt standaard **twee** mails: een dag vooraf
en twee uur vooraf. Beide zijn per lid uitzetbaar in het profiel.

- **Waarom een dag vooraf.** Dat is exact het moment waarop je jezelf niet meer kan
  uitschrijven (`UNREGISTER_LOCK_MS` in `apps/web/lib/shift.ts`). De mail zegt dat er
  dus meteen bij: één bericht dat zowel herinnert als aankondigt dat het nu vastligt.
  Wie echt niet kan, weet dat op dat moment nog vroeg genoeg om iemand te zoeken.
- **Waarom twee uur vooraf erbovenop.** Een mail van gisteren is tegen vanavond weer
  vergeten. Deze tweede is het vangnet, en hij is kort: waar, hoe laat, en zeg het
  als je niet kan.
- **Waarom het uitzetbaar is.** Twee mails per shift is voor iemand die er vijftien
  per jaar doet veel post. De keuze staat in het profiel naast de mailvoorkeuren,
  maar bewust *niet* als `MailCategory`: die array is opt-in nieuwsbrieven, en dit is
  transactionele post over iets waarvoor je je zelf hebt ingeschreven. Daarom is er
  ook geen toestemming voor nodig en staat ze standaard aan.
- **Nooit twee mails vlak na elkaar.** Wie zich drie uur voor de start inschrijft,
  hoort geen bericht te krijgen dat begint met "morgen sta je ingepland". Bij het
  inschrijven worden de vensters die al voorbij zijn meteen als afgehandeld
  gemarkeerd (`handledLeadFields`), dus die persoon krijgt enkel de mail van twee uur
  vooraf. Hetzelfde geldt wanneer een admin iemand aan een shift toevoegt.
- **Een verplaatste shift waarschuwt opnieuw.** `Shift` heeft geen `updatedAt` en
  geen geannuleerd-status, dus de herinnering is het enige bericht dat een deelnemer
  over een nieuwe tijd te zien krijgt. Wijzigt `startTime` via de admin-PATCH, dan
  gaan beide markeringen leeg en beginnen de vensters opnieuw te lopen.
- **Bij twijfel geen mail in plaats van twee.** De markering wordt met een
  voorwaardelijke `updateMany` gezet *voor* er verstuurd wordt, en een mislukte
  verzending zet ze niet terug. Dezelfde afweging als bij de no-show-mails van
  Theokot: een dubbele herinnering is vervelender dan een gemiste.
- **Geen mailserver betekent niets versturen, niet alles afvinken.** `sendMail`
  logt zonder `SMTP_HOST` naar de console en meldt "gelukt"; dat is juist voor lokaal
  werk, maar hier staat de markering dan al. In productie zouden alle herinneringen
  dus als verstuurd afgevinkt worden zonder dat er ooit iets aankwam, en niemand zou
  dat merken. De verwerking stopt daarom meteen wanneer er in productie geen SMTP
  is, en de route antwoordt 503 zodat de healthcheck het ziet. Buiten productie
  blijft loggen wél de bedoeling; dezelfde grens als bij de ticketmailer, die enkel
  in productie gooit.
- **Eén SMTP-blok voor de hele site.** `.env.example` declareerde het ooit twee keer,
  met `SMTP_PASS` in het ene en `SMTP_PASSWORD` in het andere. In een plat `.env`
  wint de laatste, dus wie er één invulde kreeg stil een helft van de mails die niet
  authenticeerde. Er staat nu één blok; `lib/mail.ts` aanvaardt allebei de namen,
  zodat een omgeving die `SMTP_PASS` al gezet had blijft werken.
- **Een eigen worker.** `shift-worker` in `infra/docker-compose.yml` klopt elke vijf
  minuten aan bij `/api/shift/maintenance`. Bewust niet meeliftend op de
  `ticket-worker`: een klemgelopen mailserver mag de ticketbevestigingen niet
  meesleuren. Leeg `SHIFT_MAINTENANCE_SECRET` = geen herinneringen, de rest van de
  shiften werkt gewoon door.

---

## Aankondigingen: homepage of de hele site

Een aankondiging is het venster dat over de site verschijnt, beheerd op
`/admin/aankondigingen`. Er is één keuze per bericht: **enkel de homepage** of **elke
pagina**.

- **Waarom die keuze er is.** Het venster hing eerst alleen aan de homepage, en dat
  is de pagina waar het minst volk binnenkomt: wie via Google, een gedeelde link of
  een QR-code arriveert, landt op een infopagina of een activiteit en zag een
  afgelasting dus nooit. Altijd-overal was het alternatief, maar dan is er geen
  ontsnapping meer voor een bericht dat echt enkel bij de homepage hoort (een
  welkomstboodschap bij de start van het jaar). Standaard blijft `HOME`, zodat
  bestaande aankondigingen zich gedragen zoals ze bedoeld waren.
- **Nooit op `/admin`, `/scan` of tijdens het afrekenen.** Een reclamevenster over
  een lopende betaling is geen aankondiging maar een storing, en de ticketscanner
  draait op een gsm aan de deur. Die lijst staat los van de lijst met paden die niet
  gemeten worden, ook al is ze vandaag dezelfde: het ene gaat over wat we niet meten,
  het andere over waar we de bezoeker niet onderbreken.
- **Wegklikken geldt voor de hele site.** Dat zat al zo: de modal onthoudt in
  `localStorage` welke id's weggeklikt zijn. Nu ze op elke pagina kan verschijnen, is
  dat het verschil tussen één venster en een venster bij elke klik.
- **Het venster hangt in de gedeelde layout.** Die is toch al dynamisch (de header
  leest de sessie), dus het kost één query per render en geen omslag in caching. Wel
  belangrijk: de save-action revalideert daarom `revalidatePath("/", "layout")` en
  niet enkel `"/"`, anders blijft een site-brede aankondiging overal onzichtbaar tot
  ze vanzelf verloopt.

---

## Praesidiumlijst (CSV-export op /admin/groepen)

De knop "Download praesidiumlijst" op Ledenbeheer → Posten levert één CSV met twee
kolommen: naam en r-nummer. Het is de lijst die je aan de universiteit of aan een
externe partij doorgeeft wanneer die wil weten wie dit jaar praesidium is, dus de
inhoud is bewust een lijst van *personen*, niet van posten.

- **De export volgt het werkingsjaar dat op het scherm geselecteerd staat**, niet
  altijd het huidige. Wie op het tabje 25-26 staat en downloadt, krijgt 25-26.
  Anders zou de knop iets anders exporteren dan wat eronder in de tabel staat.
- **Eén rij per persoon.** Wie twee posten heeft (bv. een werkgroep en het
  praesidium) staat één keer in de lijst; welke post iemand heeft, staat er niet
  in. De vraag die deze lijst beantwoordt is "wie hoort erbij", niet "wie doet wat".
- **Ook leden van een inactieve post tellen mee.** Een post op inactief zetten
  verbergt ze in de shift-keuzes, maar dat jaar hingen er wel degelijk mensen aan;
  de historiek van een werkingsjaar mag niet veranderen doordat een post later
  gearchiveerd wordt.
- **Ook leden met een gedeactiveerd account tellen mee.** Een account deactiveren
  is een login-kwestie; het haalt iemand niet uit de post waaraan die dat jaar hing.
  Gewiste accounts (de geanonimiseerde tombstones) vallen er wel uit.
- **Het r-nummer mag leeg zijn.** Niet elk lid heeft er een (bv. een alumnus of
  een extern bestuurslid); die persoon hoort wel in de lijst, met een lege cel,
  zodat wie de lijst nakijkt zelf ziet dat er iets ontbreekt.

---

## De tickets zitten in de bevestigingsmail

De bevestigingsmail bevat naast de link naar de ticketpagina ook de tickets zelf:
één pdf met alle tickets van de bestelling, en per ticket een pas voor Apple
Wallet. Google Wallet kan geen bijlage zijn (een pas komt daar altijd via een
save-link binnen), dus die staat als knop in de mail.

- **De link blijft de hoofdweg, de bijlage is het vangnet.** De ticketpagina toont
  de laatste stand van zaken (ingetrokken, terugbetaald, een nieuwe qr na een
  reset); een bijlage is de toestand van het moment van versturen. De bijlage is er
  voor aan de deur: geen bereik, een lege batterij, of iemand die zijn ticket
  liever afdrukt. Daarom verdwijnt de knop "Bekijk je tickets" niet uit de mail.
- **Enkel geldige tickets gaan mee.** Bij een terugbetaalde of ingetrokken
  bestelling zit er geen pdf en geen pas in de mail. Een geweigerd ticket dat wel
  als bijlage in een mailbox staat, belooft iets dat aan de deur niet waar is.
- **De mail zegt enkel wat er echt bij zit.** Loopt de pdf-generator of de
  wallet-provider stuk, dan vertrekt de bevestiging toch, zonder die bijlage en
  zonder ze te noemen. De omgekeerde keuze (de mail laten mislukken) is al eens
  fout gelopen: dan blijft de outbox proberen, gaat de rij uiteindelijk op DEAD,
  en krijgt de koper helemaal niets.
- **Boven acht tickets vallen de wallet-passen weg.** Zo'n bestelling is er een
  voor een groep: die persoon deelt de tickets door via de link en heeft geen
  twintig passen in zijn eigen wallet nodig. De pdf gaat wel gewoon mee.
- **Er zit een grens van 8 MB op de bijlagen samen.** Mailservers weigeren een te
  grote boodschap in haar geheel; dan zou een bestelling met een zwaar
  ticketontwerp helemaal geen bevestiging opleveren. Boven de grens vallen de
  passen weg, de pdf eerst.
- **De Google Wallet-links staan enkel in de html-versie.** Zo'n save-link is een
  jwt van enkele kilobytes; in platte tekst is dat per ticket een onleesbaar blok
  dat mailclients afkappen, waarna de link stuk is. De tekstversie verwijst naar
  de ticketpagina, waar dezelfde knop staat.
- **Let op het verbruik bij walletwallet.dev.** Vroeger vertrok er pas een aanroep
  wanneer een koper op een wallet-knop klikte; nu gebeurt dat voor elk ticket van
  elke betaalde bestelling. Eén aanroep levert de Apple- en de Google-pas samen
  (de tweede komt uit de cache van tien minuten), dus reken op één aanroep per
  ticket. Op het gratis plan zijn dat er 1000 per maand.

---

## De mailserver wil weten wie er belt (EHLO)

Beide mailers zetten expliciet de naam waarmee de site zich voorstelt bij de
mailserver (`smtpEhloName()`, standaard `vtk.be`, te overschrijven met
`SMTP_EHLO_NAME`). Laat dat niet weg.

Zonder die instelling vult nodemailer zelf iets in, en in een container werd dat
`EHLO [127.0.0.1]`. De relay van Google antwoordt daarop met
`421 4.7.0 Try again later, closing connection. (EHLO)` en verbreekt de
verbinding voor er ook maar een afzender genoemd is. Dezelfde container, dezelfde
verbinding, met `EHLO vtk.be` krijgt gewoon `250`.

Waarom dit een avond kostte: de foutmelding leest als een tijdelijke storing bij
Google, dus de outbox blijft braaf herproberen met een oplopende wachttijd en
niemand denkt aan een configuratiefout. Bovendien werkte een test met `curl`
vanaf dezelfde machine wel, want die stuurt een andere EHLO-naam. Het lijkt dan
alsof de mailserver het ene moment wel en het andere niet doet.
