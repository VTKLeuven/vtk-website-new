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
- **Tabjes per jaar** (zoals Theokot), startend bij **"26-27"**
  (`FIRST_WORKING_YEAR = 2026`; er is geen historiek van daarvoor). Zowel de
  admin-postenpagina als de publieke `/praesidium` tonen deze tabjes; standaard
  staat het huidige werkingsjaar open. De gekozen jaar zit in de URL (`?jaar=`).
- **Migratie-keuze:** bestaande memberships zonder jaar zijn bij de migratie op
  `2026` gezet, zodat de huidige samenstelling onder "26-27" verschijnt.
- **Admin-postenpagina** toont per post standaard enkel de **leden van het
  gekozen jaar + een "lid toevoegen"-balk**; beschrijving/instellingen en rechten
  staan **ingeklapt** (`<details>`). Een lid verwijderen gaat via een
  bevestigings-modal (verwijdert enkel dat jaar; andere jaren blijven).
- **Publieke `/praesidium`** toont per post de leden van het gekozen jaar met hun
  profielfoto (uit "Mijn account"), verantwoordelijke(n) eerst en daarna
  alfabetisch.
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

### Mailinglijsten (opt-in)

- Acht categorieën: **Feest, Career, Sport, Evenementen, Onderwijs, VTK
  International, Eerstejaars, Bakske** (`MailCategory`-enum, opgeslagen als
  opt-in array op `User.mailCategories`).
- **Default staat alles uit (opt-in):** een lid vinkt bij registratie expliciet
  aan waarvoor het mails wil. Bewuste keuze i.p.v. opt-out, om te stroken met de
  verwachting dat je zelf kiest waarvoor je ingeschreven wordt.

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
- **Lege staat = sectie verbergen.** Zonder sessie, zonder richtingen, of zonder
  een matchende POC met vertegenwoordigers valt de hele sectie weg. Bewuste keuze
  boven "toon dan alle POC's" of een uitnodigingsbanner: de sectie is enkel
  zinvol als ze persoonlijk is, en zo blijft de homepage voor bezoekers exact
  zoals ze was.
- **Gevolg voor caching:** omdat de homepage nu de sessie leest, wordt ze per
  bezoeker gerenderd i.p.v. statisch gecachet. Dat was al zo qua DB-lezingen; het
  is één gerichte query extra (de richtingen van de ingelogde gebruiker), en enkel
  voor wie ingelogd is.

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
