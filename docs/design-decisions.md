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

## Hoofdnavigatie: Info, Theokot en Shiften

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

## Theokot: broodjes-reservatiesysteem

Theokot is de cafetaria/broodjesbar van VTK. Studenten reserveren vooraf broodjes,
halen ze af aan de balie en betalen daar. Post **Theokot** beheert het systeem.

### Verkoopsessies & aanbod

- Eén **`TheokotSession`** = één open verkoopdag. Iemand van Theokot zet wekelijks
  (meestal vrijdag/zaterdag) de sessies van de **volgende week** online.
- Er is een **standaardaanbod** (`TheokotProduct`, geseed) met vaste broodjes,
  aantallen en prijzen. Bij het aanmaken van een week wordt dit als **snapshot**
  naar `TheokotSessionItem` gekopieerd. Reden: latere catalogus- of prijswijzigingen
  mogen bestaande sessies en bestellingen niet met terugwerkende kracht veranderen.
- **Een verkoopdag aanmaken zet meteen de shiften van die dag neer.** Wie de week
  online zet, vinkt de dagen aan; voor elke dag die daadwerkelijk nieuw is, komen
  ook de drie Theokot-shiften (smeren, middag, namiddag) op `/shift` te staan. Dat
  was vroeger een tweede, losse handeling in het shiftscherm, en precies dát werd
  vergeten: een verkoopdag zonder shifters is een dag waarop niemand de balie doet
  terwijl de broodjes wel besteld zijn.
  - **De uren volgen het afhaaluur van die dag**, niet een vast uur: zet je een dag
    later open, dan schuiven de shiften mee. De reeks zelf (welke shiften, hoe lang,
    hoeveel plaatsen, hoeveel bonnetjes) komt uit hetzelfde sjabloon als het scherm
    "Shiften uit sjabloon", zodat een aangepaste Theokot-shift op beide plaatsen
    tegelijk verandert.
  - **Een dag waar al een Theokot-shift op staat, blijft ongemoeid.** Anders krijgt
    wie de shiften al met de hand zette een tweede reeks bovenop de eerste, en
    schrijven leden zich in op de verkeerde helft.
  - **Wie de week aanmaakt heeft geen `shift.edit` nodig.** De shiften zijn hier een
    gevolg van het openzetten van een verkoopdag, geen aparte bevoegdheid; een extra
    recht eisen zou betekenen dat Theokot de week niet meer alleen online kan zetten.
- **Week aanmaken doe je met aanbod + uren voor de hele week**: bij het aanmaken van
  een verkoopweek stel je één keer het aanbod (broodjes/prijzen/aantallen) en de uren
  ('Afhalen vanaf/tot', 'Besteldeadline', 'Bestellen opent') in die voor álle gekozen
  dagen gelden. Dat scheelt werk in weken met een volledig ander aanbod. **Nadien** kan
  je nog steeds per dag bijsturen (uren, open/dicht, aanbod).
- **Foto en ingrediënten per broodje zijn optioneel.** Beheer ze in dezelfde
  aanbod-editor (uitklap "Foto & ingrediënten" per rij), zowel op het standaardaanbod
  als per verkoopdag. Een broodje zonder foto toont het gestreepte placeholder-patroon
  van de site in plaats van een gat, want het aanbod raakt in de praktijk maar
  geleidelijk gefotografeerd. Ingrediënten verschijnen achter een **info-icoontje**
  naast het broodje; ze staan bewust niet altijd uitgeschreven, anders wordt een lijst
  van tien broodjes onleesbaar.
- **De weergave van het aanbod (lijst of raster) is een instelling**, geen vaste keuze
  in de code: een raster geeft de foto's ruimte, een lijst blijft compacter zolang er
  weinig foto's zijn. Ze staat bij de overige Theokot-instellingen en geldt voor de
  hele bestelpagina (`itemLayout`). De standaard is een lijst, zodat een aanbod zonder
  foto's er niet leger uitziet dan vroeger.
- **Een foto in de catalogus vervangen verwijdert het oude bestand niet.** De
  storage-key wordt mee gekopieerd naar de sessie-items van elke week die er al mee
  aangemaakt is; opruimen zou de foto weghalen bij verkoopdagen die ze nog tonen.
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
  de deadline). Er wordt dus geen annulatie-historiek bijgehouden: enkel no-shows.

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
- **Openingsuren** (startpagina) staan samen onder Admin → Openingsuren. Theokot,
  Cursusdienst en Fakbar zien daar elk alleen hun eigen kaart.
- **Kaartscanner**: de scanner werkt als toetsenbord en tikt `serial;cardAppId` + Enter.
  Eén invoerveld verwerkt beide: bevat de invoer een `;` dan gaat ze naar de KU Leuven
  `idverification`-API (`lib/kul-card.ts`) die een r-nummer teruggeeft; anders wordt de
  invoer als r-nummer behandeld. Credentials (`KUL_CARD_*`) staan los van de OIDC-login (zie README).
- **Afhaaluren** (default **12:00–16:00**, per dag aanpasbaar) zijn NIET dezelfde als de
  **openingsuren van Theokot** op de startpagina (default ma–vr **10:30–18:00**). De
  r-nummerpagina werkt ook vóór 12:00.

### No-shows & bans

- Een bestelling telt pas als **no-show** vanaf **15 min na sluitingstijd**
  (`noShowGraceMinutes`). Verwerking gebeurt door een **ingebouwde scheduler**
  (`apps/web/instrumentation.ts`) die periodiek `processDueNoShows` draait (geen
  externe cron). Idempotent via `TheokotSession.processedAt`.
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

- `theokot.manage`: sessies/aanbod, config, bericht, bans, historiek.
- `openingHours.manageOwn`: openingsurenkaart van de eigen post; daarnaast wordt
  de exacte post (THEOKOT, CURSUSDIENST of FAKBAR) server-side gecontroleerd.
- `theokot.pickup`: afhaalbalie + turf-lijst.
- Beide worden in de seed toegekend aan groep **THEOKOT**.

---

## Grocomeet en VTK Bureau: broodjes voor een vergadering

Twee terugkerende vergaderingen waar vooraf een broodje en een drankje voor besteld
wordt. Ze staan in de code als één model (`Meeting`, met `kind`), want de werking is
identiek; enkel het publiek en de beheerder verschillen.

|  | Grocomeet (GM) | VTK Bureau |
|---|---|---|
| Wie | verantwoordelijken van de posten + Groep 5 | elke student |
| Ritme (default) | wekelijks, vrijdag 12:45 | tweewekelijks, donderdag 12:40 |
| Ingang | tabje in het profielmenu (`/grocomeet`) | gedeelde link per bureau (`/bureau/<slug>`) |
| Opent | meteen; grocos bestellen weken vooruit | instelbaar per bureau (`opensAt`) |
| Geld | per persoon bijgehouden en af te vinken | enkel totalen, Onderwijs betaalt |
| Beheer | Groep 5 (`grocomeet.manage`) | Onderwijs (`bureau.manage`) |

### Waarom dit geen formulier uit de formulierenmodule is

Het lijkt een form met twee keuzevragen, maar de bestelling moet dingen doen die een
generieke `FormEntry` niet kan: broodjes van de **Theokot-voorraad** afromen, de
**prijs op het moment van bestellen** vastklikken, in een **aparte kolom op de
turflijst** verschijnen (de doos voor de vergadering), en **ongeldig worden** wanneer
het aanbod van die dag wijzigt. Dat is domeinlogica, geen formulierveld.

### Aanbod en het uitlijnen met de verkoopdag

- Er kan **één broodje en één drankje** per persoon per vergadering besteld worden,
  allebei optioneel: enkel een drankje (of niets) kan ook.
- Het **broodje van de week** staat er nooit bij: dat blijft voor de studenten.
- Een reservatie wordt vaak **weken vooraf** gemaakt, terwijl Theokot het aanbod van
  die week pas een week op voorhand vastlegt. Zolang die verkoopdag niet bestaat,
  komen de keuzes uit de **catalogus** (`TheokotProduct`); bestaat ze wel, dan uit het
  **aanbod van die dag**, met de resterende voorraad erbij.
- Bij elke wijziging die dat aanbod raakt (week aanmaken, aanbod van een dag
  bewerken, dag sluiten, vergadering verzetten) lijnt `syncMeetingReservations` de
  reservaties opnieuw uit. Koppelen gebeurt **op naam** (`offeringNameKey`), want de
  catalogus en het aanbod van die dag hebben verschillende id's; de naam is wat ze
  gemeen hebben en waarop een mens ze ook vergelijkt.
- Wat niet meer kan, wordt **ongeldig**: die persoon krijgt een mail én ziet het op de
  reservatiepagina en op `/account`. Er wordt niets stil geschrapt en niets stil
  vervangen door een ander broodje.
- Blijft Theokot die dag helemaal weg (geen verkoopdag aangemaakt), dan blijft de
  reservatie staan en zegt het beheerscherm dat er geen verkoopdag is. Er draait
  bewust geen wachter op "de dag nadert en er is nog steeds niets": dat zou een tweede
  scheduler vragen voor iets wat het beheer sowieso op zijn scherm ziet.

### Eigen aanbod (bureau zonder Theokot)

Een bureau gaat altijd door, ook wanneer Theokot geen broodjes kan voorzien. Daarom kan
het aanbod per vergadering **losgekoppeld** worden van Theokot (`useTheokot = false`):
je zet dan zelf de keuzes met hun prijs (lasagne, broodjes van een bakker). Zo'n
vergadering raakt de Theokot-voorraad niet en krijgt geen kolom op de turflijst. Een GM
kan dat ook; het is dezelfde knop.

### Deadline

Aanpassen of annuleren kan tot **dezelfde deadline als voor studenten**: het moment
waarop de turflijst geprint wordt (`TheokotSession.orderCloseAt` van die dag). Is er
geen verkoopdag, dan geldt het begin van de vergadering. Er is bewust geen aparte
deadline per vergadering: twee deadlines voor hetzelfde broodje is één te veel.

### Geld

- Prijzen zijn **snapshots** op het moment van bestellen (broodje + drankje), zodat een
  prijswijziging in de catalogus een openstaande schuld niet met terugwerkende kracht
  verandert.
- Het **drankje** kost standaard €1; de lijst en de prijs staan in één setting
  (`meetings.drinks`) en gelden voor allebei de vergaderingen, want het is dezelfde koelkast.
- Bij de **GM** kan per bestelling afgevinkt worden dat er betaald is; het beheerscherm
  toont per persoon het totaal, het betaalde en het openstaande bedrag over het werkingsjaar.
- Bij het **bureau** betaalt de student niets: daar staan enkel totalen per bureau, per
  werkingsjaar en over alle bureaus heen, voor de boekhouding van Onderwijs.

### Plannen per semester

De kalender wordt **per semester** ingevuld: bij het begin van het academiejaar voor
semester 1 en vanaf januari voor semester 2 (`semesterToPlan`). Het beheerscherm toont
die kalender vanzelf zolang er voor dat semester nog geen plan is (`MeetingPlan`); daarna
blijft ze staan om aan te passen. Een dag met bestellingen kan **niet** via de kalender
verdwijnen; die verwijder je bewust bij de vergadering zelf, waar de bevestiging zegt
hoeveel bestellingen eraan hangen.

- **Uur en plaats staan per dag**, niet één keer bovenaan. Een vergadering verhuist
  geregeld naar een ander lokaal of een ander uur, en dan hoort de kalender dat te
  kunnen zeggen in plaats van je twintig keer naar het detailscherm te sturen. De twee
  velden bovenaan zijn enkel het startpunt voor de volgende dag die je aanduidt.
- **Het voorstel hangt aan de pariteit van het ISO-weeknummer** (`WeekParity`), niet aan
  "elke tweede vanaf de start van het semester". Zo blijft een tweewekelijkse vergadering
  kloppen over de kerstvakantie heen, en het is ook hoe een agenda erover praat. Met
  "Elke week / Even weken / Oneven weken" zet je het voorstel in één klik om wanneer het
  semester net verkeerd uitkomt; welke helft het juiste is, verschilt per jaar. Dagen
  waarvoor al besteld is, blijven bij zo'n omschakeling staan.

---

## Lesbezoeken

Een lesbezoek is een aankondiging van een paar minuten bij het begin (of einde) van een
les: een kring, een werkgroep of een externe organisatie stelt zich kort voor aan een
volle aula. Met de faculteit Ingenieurswetenschappen is afgesproken dat **VTK Onderwijs
dit coördineert**: aanvragers contacteren professoren niet zelf. Dat is de kern van de
hele werking, en de reden dat er een systeem voor bestaat in plaats van een adresboek.

### Wat dit vervangt

Vier losse dingen, die elk een stuk van hetzelfde proces droegen:

| Was | Nu |
|---|---|
| Google Form | `/lesbezoeken`, publiek en zonder login |
| Google Sheet met acht tabbladen | `Lesbezoek`, `LesbezoekOrganisation`, `LesbezoekPeculiarity` |
| Word-sjablonen + mailmerge-extensie | mailsjablonen in `Setting`, versturen vanuit het beheer |
| Aparte React-app met een eigen `users.json` | `/admin/lesbezoeken`, achter de gewone rollen |

De statussen van de aanvraag zijn de rijkleuren van de Sheet, maar dan met een naam:
groen was goedgekeurd, rood afgekeurd, wit nog te doen. Wat daar drie kleuren waren,
zijn hier zes statussen, want "afgekeurd" betekende twee verschillende dingen (VTK
stuurde het niet door, of de professor wilde niet) en dat verschil bepaalt wat de
aanvrager te horen krijgt.

### De weg van een aanvraag

```
publiek formulier (/lesbezoeken)
  -> PENDING    VTK Onderwijs kijkt na: duplicaat? bijzonderheid? organisatie te gulzig?
  -> REJECTED   niet doorgestuurd, met reden naar de aanvrager
  -> ASKED      mail naar de professor; eventueel later een herinnering
       -> APPROVED / DECLINED, telkens teruggekoppeld naar de aanvrager
```

### Waarom de aanvraag publiek is en niet achter een login

De helft van de aanvragers is geen VTK-lid: andere kringen, studentenverenigingen en
externe organisaties dienen hier evengoed in. Die een account laten aanmaken voor één
vraag vervangt het formulier door een drempel, en de Google Form die dit vervangt had er
ook geen. De bescherming is daarom dezelfde als bij het contactformulier: een honeypot en
een snelheidslimiet per IP (ruimer dan bij contact, want één organisatie dient vaak
meerdere doelgroepen na elkaar in). Elke aanvraag komt hoe dan ook als `PENDING` binnen
en gaat nergens naartoe voor een mens ernaar gekeken heeft.

Het formulier weigert wel een aanvraag die **minder dan twee weken** op voorhand komt.
Dat is de afspraak met de faculteit, en het is een grens en geen suggestie: korter dan
dat haalt het antwoord van de professor het moment niet meer, dus een aanvraag die toch
doorgaat kost alleen maar een mail.

### De professor krijgt geen account

Hij antwoordt per mail, zoals altijd. Een professor een login geven om één keer per jaar
op "ja" te klikken is een systeem bouwen voor iemand die het niet gevraagd heeft. Wie
beoordeelt zet zijn antwoord daarom zelf om in een status; dat is één handeling, en het
is exact wat er vroeger in het "Uitgevoerd"-tabblad met een kleurtje gebeurde.

### Er zit altijd een mens tussen de sjabloon en de verzendknop

Het scherm vult het sjabloon in, toont het in een bewerkbaar veld, en pas dan vertrekt
het. Dat is bewust één stap trager dan de mailmerge die dit vervangt. Die stuurde rij per
rij naar een professor zonder dat iemand de tekst nog zag, en een fout in het sjabloon
vertrok dan honderd keer. De sjablonen zelf staan in `Setting` en niet in code, want het
waren Word-documenten die elk jaar bijgeschaafd werden ("dit document is ook een work in
progress"); wie de lesbezoeken doet moet de aanhef kunnen wijzigen zonder een deploy.

De taalgok volgt de vuistregel uit de handleiding: bij een master is de professor
doorgaans Engelstalig, bij een bachelor niet. Het is een gok, dus het scherm laat ze
altijd overschrijven.

### Bijzonderheden staan in de database, niet in een tabblad

`LesbezoekPeculiarity` is het "Peculiarities"-tabblad: wat je van een professor, een vak
of een faculteit moet weten vóór je iets doorstuurt ("keurt alles af", "enkel op het
einde van de les", "spookvak", "enkel VTK"). Dat is precies de kennis die verdwijnt
wanneer de verantwoordelijke van vorig jaar vertrekt, en ze is alleen nuttig op het
moment van beslissen. Het beoordelingsscherm zoekt de regels dus zelf op en zet ze
bovenaan, in plaats van te hopen dat iemand een ander bestand opent.

Hetzelfde geldt voor de dubbelcheck (dezelfde professor, dezelfde dag) en voor de notitie
bij een organisatie: dat waren respectievelijk een formule met een kolom ernaast en het
"Shame"-tabblad, en ze staan nu allebei bij de aanvraag zelf.

### Organisaties zijn een tabel, geen tekstveld

Twee redenen. De kleur in de kalender moet bij dezelfde organisatie blijven horen; de app
die dit vervangt deelde kleuren uit in de volgorde waarin de rijen binnenkwamen, uit een
lijst van vijf, waardoor organisatie zes en verder allemaal hetzelfde rood werden en
dezelfde organisatie na een herlaadbeurt een andere kleur kon hebben. En "VTK - Onderwijs"
en "VTK Onderwijs" horen één lijn te zijn: een naam uit het publieke formulier wordt
hoofdletter- en leestekenongevoelig tegen de bestaande namen gelegd voor er een nieuwe rij
komt.

Een organisatie verdwijnt niet, ze gaat op niet-actief: verwijderen kan enkel zolang er
geen enkel bezoek aan hangt, want de kalender van vorig jaar mag niet halveren omdat
iemand opruimt.

### Een merge mag, maar niemand verstuurt ongelezen

"Alle aanvragen tegelijk insturen" is een echte vraag: een jobbeurs dient twintig
lesbezoeken na elkaar in en die één voor één openen is werk zonder inhoud. Het
bulkvenster (aanvinken in de werklijst, dan "Naar de docenten…") stelt daarom in één
beurt alle mails op, maar het stelt ze **op het scherm** op: elke mail staat er als een
eigen blok, met haar ontvanger, haar sjabloon en een uitklapbaar tekstveld, en met een
vinkje om ze uit de reeks te laten. Pas de knop onderaan verstuurt of plant.

Dat is precies één stap trager dan de mailmerge die dit vervangt, en dat is de bedoeling
(zie hierboven): die stuurde rij per rij zonder dat iemand de tekst nog zag, en een fout
in het sjabloon vertrok dan honderd keer. Wat de merge wél wegneemt is het opzoekwerk:
het juiste sjabloon per aanvraag (kort of lang, NL of EN), het invullen, en het
klikken tussen twintig panelen.

- **Ligt de vraag al bij de docent, dan wordt het de herinnering.** Dezelfde knop
  bedient dus het insturen van nieuwe aanvragen én het porren van de reeks die blijft
  liggen; per mail staat er in het venster of het een "Vraag" of een "Herinnering" is.
- **Inplannen is de standaard, ook hier.** Twintig mails die om elf uur 's avonds
  tegelijk bij professoren binnenvallen, zijn erger dan één.
- Een aangevinkt bezoek dat niet meer bij de docent ligt, valt uit de merge, met een
  regel bovenaan die zegt hoeveel en waarom. Stil weglaten zou betekenen dat je denkt
  dat er twintig mails vertrokken terwijl het er zeventien waren.

### Eén aanvrager krijgt één mail, geen twintig

Wie twintig lesbezoeken aanvraagt, kreeg twintig losse terugkoppelingen. Elk daarvan
klopte, maar samen vertelden ze niet wat een mens wil weten: wat gaat er door, wat ligt
er nog bij een professor, en wat niet. "Terugkoppeling bundelen…" maakt van de selectie
**één mail per aanvrager**, met het overzicht gegroepeerd per uitkomst
(`buildRequesterDigest`): goedgekeurd, nog in behandeling, niet doorgegaan, met de reden
onder het bezoek waar ze over gaat.

- **Gegroepeerd per organisatie én per aanvragersadres.** Enkel op het adres groeperen
  zou de lesbezoeken van twee organisaties door elkaar in dezelfde mail zetten wanneer
  dezelfde persoon voor allebei aanvraagt.
- De koppen in die mail zijn niet de statusnamen uit het beheer. "Afgewezen door ons" is
  een interne term; de aanvrager leest liever wat er met zijn aanvraag gebeurde dan wie
  het besliste.
- `{vak}`, `{datum}` en `{uur}` blijven leeg in een bundelsjabloon. Eén datum uit twintig
  in de onderwerpregel zetten is erger dan er geen zetten.
- In de database is dat één rij (`LesbezoekScheduledMail.bundledIds`), maar het versturen
  zet `requesterNotifiedAt` op **elk** bezoek van de bundel. Anders dook de rest morgen
  gewoon opnieuw in de bundel op.

### Een geplande mail naar de docent en een naar de aanvrager sluiten elkaar niet uit

Er staat hoogstens één openstaande geplande mail per bezoek **per kant**: een tweede
vraag aan dezelfde professor vervangt de eerste, maar een terugkoppeling naar de
aanvrager laat de vraag die morgenvroeg naar de professor moet gewoon staan. Zonder dat
onderscheid haalde het bundelen van een terugkoppeling stilletjes de merge weg die je
vijf minuten eerder had ingepland.

### De herinnering kondigt zichzelf aan

De vraag ligt bij de professor, hij antwoordde niet, en het bezoek nadert: dat is het
moment waarop de oude Sheet het liet afweten. Niemand ziet dat een rij al drie weken op
oranje staat tot het bezoek voorbij is. De werklijst zegt het nu zelf, vanaf drie dagen
voor het bezoek: een balk bovenaan ("tijd voor een herinnering"), een badge op de rij met
hoeveel dagen er nog zijn, een filter "Herinnering nodig", en in het paneel een knop die
meteen de herinneringsmail opstelt.

- **Afgeleid, geen kolom.** `needsNudgeReminder` rekent het per keer uit uit status,
  datum en of er al gepord of iets ingepland is. Er is dus geen tweede toestand die kan
  verlopen, en de drempel mag veranderen zonder dat er iets herberekend moet worden.
- **De drempel staat in de instellingen** (`nudgeLeadDays`, standaard 3): hoe lang je een
  professor laat zwijgen voor je nog eens port, is een afweging van wie de lesbezoeken
  doet, en die verschilt per jaar.
- **Enkel bij "Bij de prof".** Bij "Nieuw" is het probleem een ander (de vraag vertrok
  nog niet eens) en bij een verwerkte status valt er niets meer te porren. Een bezoek dat
  al bezig of voorbij is, valt weg: een herinnering is dan geen hulp meer maar ruis.
- **Het blijft in het scherm.** Geen mail naar de lesbezoekenmailbox: wie dit werk doet,
  opent dat scherm toch, en een dagelijkse herinneringsmail over herinneringen wordt
  weggeklikt.

### De werklijst is de standaard, niet de kalender

De app die dit vervangt had enkel een kalender. Daardoor was "welke aanvraag ligt hier al
een week te wachten?" net de vraag die je er niet aan kon stellen. De kalender blijft
(hij beantwoordt "wat staat er gepland" en levert de `.ics`-export), maar het scherm opent
op de openstaande aanvragen.

De export bevat **enkel goedgekeurde** bezoeken en is een download, geen abonneerbare
feed: de URL draagt geen geheim, en er staan namen van professoren in.

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

- `piano.manage`: vensters, sluitingsdagen, instellingen, infotekst en het
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

- **`door.open`**: mag de deur openen met zijn studentenkaart. Dit ken je toe aan
  rollen in `/admin/roles`, zodat "wie geraakt binnen" gewoon werkingsjaar-gescoped
  meeloopt met de rollen/posten (reset dus mee op 15 juli, zoals alle rechten).
- **`door.remoteOpen`**: toont de "deur openen"-knop op het admin-dashboard.
  **Bewust los van `door.open`:** wie met zijn kaart binnen mag, hoeft daarom nog
  niet de deur voor anderen te kunnen openen vanop afstand. Dit is de kleinere,
  bewustere groep (bv. praesidium/onthaal).
- **`door.manage`**: de `/admin/deur`-tab: tijdelijke toegang geven, de
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

## Fakscanner (kaartlezer aan de bar)

Aan de bar hangt een SpringCard Prox'n'Roll-kaartlezer op een Raspberry Pi. Een lid
scant zijn studentenkaart, krijgt punten, en om de zoveel punten een gratis pint.
De Pi stuurt enkel de ruwe scan door (`POST /api/fakscanner/scan`); het opzoeken,
tellen en beslissen gebeurt server-side. Website-kant:
`apps/web/app/api/fakscanner/`, `apps/web/lib/fakscanner*.ts` en
`/admin/fakscanner`; Pi-kant: `scripts/fakscanner.py`.

### Eén stand per persoon, geen lijst van avonden

`FakTally` houdt **één rij per r-nummer per werkingsjaar** bij: punten, aantal
check-ins en het moment van de laatste. Bewust geen rij per scan. De kring heeft
de stand nodig; een reconstrueerbare lijst van wie op welke avond aan de bar stond
heeft ze niet nodig, en die zouden we met een rij per check-in wel bijhouden.
Hetzelfde geldt voor de log: daar gaan enkel de **mislukte** scans in (zie
onderaan). Wat je dus niet uit deze database haalt, is wie er donderdag was.

### Eén check-in per **bardag**, niet per kalenderdag

Een fakavond loopt over middernacht. Met een kalenderdag als grens zou wie om 23u50
en om 00u10 scant twee check-ins hebben, en dat is precies één avond. De teller
gebruikt daarom een bardag die om een instelbaar uur begint (standaard 6u): alles
daarvoor telt nog bij de avond ervoor.

Zonder rij per dag doet de voorwaarde in de `UPDATE` het werk: enkel een rij
waarvan `lastCheckinAt` vóór het begin van deze bardag ligt, wordt opgehoogd.
Postgres voert dat atomair uit, dus van twee gelijktijdige scans raakt er precies
één binnen. Bestaat de rij nog niet, dan maken we ze aan; botst dat op de primaire
sleutel, dan was een gelijktijdige scan ons voor en is het dus ook "al gescand".

### De bardag hangt aan de wandklok, niet aan een aantal uren

De bar is soms open wanneer de klok verspringt. `fakDayStart` rekent daarom via de
Brusselse wandklok (`brusselsWallClockMinutes`) en niet met een vast aantal uren:
de nacht van de wissel duurt 23 of 25 uur, maar de bardag begint even goed om 6u op
de klok, en 02:30 dat twee keer voorkomt hoort beide keren bij dezelfde bardag. Om
dezelfde reden is het dubbeltelvenster een wandklokvenster. Eén randgeval: zet de
rollover niet tussen 02:00 en 03:00, want bij de overgang naar zomertijd bestaat
dat uur niet. Met de standaard 06:00 speelt dat nooit.

### Punten, niet check-ins

De ranglijst telt **punten**. Buiten het dubbeltelvenster is dat hetzelfde als
check-ins, binnen dat venster telt een scan voor twee. Het venster (standaard 22u
tot 23u) staat in de instellingen en niet in de code, want het is een middel om
volk naar de bar te krijgen op een moment dat de praeses kiest; dat verschuift van
jaar tot jaar en soms van avond tot avond. Het mag over middernacht lopen.

De pint valt bij het **passeren** van een veelvoud en niet bij `totaal % 10 == 0`.
Een dubbeltelling kan van 9 naar 11 springen, en die pint hoort niet verloren te
gaan omdat de teller toevallig nooit exact op 10 stond.

### Een VTK-account is niet nodig

De stand hangt aan het **r-nummer** en niet aan een `User`. Wie geen account heeft
spaart gewoon mee en krijgt zijn pinten; aan de toog is dat ook niemands vraag. Het
account dient enkel om er een naam bij te kunnen zetten: in het beheerscherm staat
wie geen account heeft met zijn r-nummer in de lijst, niet met de naam die op de
kaart stond. Het schermpje aan de bar begroet die persoon wél gewoon met zijn
voornaam, want die staat daar voor hemzelf.

### De stand reset mee met het werkingsjaar

Het werkingsjaar staat in de sleutel van de rij, dus op 15 juli begint iedereen
weer op nul, net als de rollen en de posten. De oude standen blijven staan: in
`/admin/fakscanner` kies je een ouder werkingsjaar en zie je de ranglijst van toen.
Een avond die over de cutover loopt telt in haar geheel bij het jaar waarin ze
begon, om dezelfde reden als de bardag hierboven.

De ranglijst toont dertig mensen per pagina. Op een goed jaar staan daar honderden
namen in, en dan is de vraag "wie staat er bovenaan" nog steeds de eerste die
iemand stelt.

### We tellen verdiende pinten, we volgen ze niet op

De site zegt hoeveel pinten iemand verdiend heeft; ze houdt niet bij of die pint
effectief getapt is. Dat gebeurt aan de toog, tussen de tapper en het lid, op het
moment dat de lezer oplicht. Een afhaalsysteem bovenop zou betekenen dat de tapper
tijdens een drukke avond nog een scherm moet bedienen, en dat gaat mis op de enige
momenten waarop het ertoe doet.

### De kaart-naar-r-nummer-map is gedeeld met de andere lezers

Wat de lezer typt (`serial;cardAppId`) hoort bij precies één r-nummer, en dat
verandert niet meer zolang de kaart bestaat. Na de eerste geslaagde verificatie
bewaren we die koppeling in `StudentCard`, en elke lezer bij ons (bar, deur,
Theokot-balie) kijkt daar eerst. Dat scheelt niet enkel een KU Leuven-call per
scan: het houdt de lezers ook werkend wanneer `account.kuleuven.be` er even uit
ligt, zolang de kaart al eens gescand is. Zie `apps/web/lib/student-card.ts`; die
vervangt het rechtstreekse gebruik van `verifyStudentCard` overal.

### Het token van de scanner staat enkel in de omgeving

`FAKSCANNER_TOKEN` (32 hex-tekens, `openssl rand -hex 16`) is het enige dat tussen
"iemand aan de bar" en "iedereen met een browser" staat. Het staat daarom bewust
**niet** in de DB en niet in een beheerscherm, anders dan het deur-secret: er is
hier geen tweede richting die configuratie nodig heeft, en een gecompromitteerd
adminaccount hoort geen check-ins te kunnen vervalsen. Leeg = het endpoint weigert
alles.

### Enkel de mislukte scans gaan naar de log

`FakScanLog` bevat wat misging: een onleesbare kaart of een KU Leuven dat niet
antwoordt (`CARD_ERROR`), en onze eigen kant die stukging nadat de kaart wel gelezen
was (`SERVER_ERROR`). Geslaagde check-ins loggen we niet, want dat zou precies de
aanwezigheidslijst zijn die `FakTally` hierboven vermijdt. Wat de beheerder wél moet
kunnen zien is of de lezer of KU Leuven het laat afweten: zonder die rijen is een
stille storing aan de bar pas zichtbaar wanneer iemand komt klagen dat zijn punten
ontbreken.

---

## Ledenregistratie & onboarding (KUL SSO)

Studenten **registreren zichzelf** door voor het eerst in te loggen met KU Leuven
SSO. Concrete implementatie: hook in `packages/auth/src/auth.ts`, gate in
`apps/web/proxy.ts`, formulier in
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
- Bij een zelfgemaakt **e-mail/wachtwoordaccount** is `User.email` al het
  persoonlijke loginadres. Daar blijft het r-nummer expliciet optioneel en toont
  het formulier geen veld met het misleidende label universiteitsmail, geen
  tweede persoonlijke mail en geen communicatiekeuze. Het loginadres wordt als
  persoonlijke voorkeur opgeslagen.
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

- Het blok begint met vier combineerbare profielstatussen: **Student**
  (`User.isStudent`), **Alumnus** (`User.alumni`), **Academisch Personeel**
  (`User.academicStaffRole != null`) en **Ik studeer niet**
  (`User.notStudying`). Student en "ik studeer niet" sluiten elkaar uit; andere
  combinaties zijn bewust mogelijk, bijvoorbeeld een alumnus die professor is.
- Alleen bij Student verschijnen studiejaar, richting, "niet aan de faculteit"
  en internationale/uitwisselingsstudent. Gaat Student uit, dan worden die
  studentvelden gewist. Bij Alumnus verschijnen afstudeerjaar, VTK-verleden en
  de alumni-mailopt-in. Bij Academisch Personeel is een subtype verplicht:
  professor, assistent, administratief medewerker of overig academisch personeel.
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
- **"Ik studeer niet"** (`User.notStudying`) is een profielstatus voor wie geen
  student, alumnus of academisch personeelslid is. Ze staat niet langer als
  pseudo-studiejaar tussen de jaren. Het lid blijft gewoon lid, maar krijgt geen
  studentvelden, jaarlijkse studiebevestiging of studiegerichte mailinglijsten.

### Jaarlijkse studiebevestiging ("wie is nog actief student?")

- **Het probleem:** vroeger zat de cursusdienst in dezelfde applicatie. Wie boeken
  wou bestellen moest een richting aanduiden, en die werd elk jaar gereset. Dat
  gaf ongewild een jaarlijks signaal over wie nog actief studeerde. Nu cudi een
  aparte site is (en we die bewust **niet** koppelen), viel dat signaal weg.
- **De oplossing:** niet de koppeling herbouwen, maar de _jaarlijkse herdeclaratie_.
  `User.isStudent` zegt expliciet wie student is; alleen voor die accounts houdt
  `User.studyConfirmedYear` bij in welk academiejaar het lid zijn studie laatst
  bevestigde. Loopt dat achter op `currentStudyYear()` (rollover op 27 september,
  zie `lib/workingYear.ts`), dan is het studentenprofiel verlopen. De gedeelde
  helper `needsStudyConfirmation()` bewaakt die regel in web en mobiele app.
- **De bevestiging vervalt op 27 september, niet op 15 juli.** Dat is bewust een
  andere dag dan de rest van de site: het werkingsjaar kantelt op 15 juli, maar
  het academiejaar loopt door tot eind september. Wie in juli gevraagd wordt "wat
  studeer je?" antwoordt met het jaar dat net gedaan is (in juli 2026 dus 25-26),
  en dan staat het hele werkingsjaar lang het verkeerde studiejaar in de
  mailinglijsten en in de career-mappen. Op 27 september is het nieuwe
  academiejaar effectief begonnen: de tweedezittijd is voorbij, wie heroriënteert
  weet het, en de eerste lesweek is bezig. Dan pas is "wat studeer je?" een vraag
  met een juist antwoord.
- **Gevolg: twee jaargrenzen naast elkaar.** `currentWorkingYear()` (15 juli,
  posten en rollen) en `currentStudyYear()` (27 september, enkel de
  studiebevestiging) staan samen in `packages/auth/src/lib/workingYear.ts`, zodat
  het verschil op één plek zichtbaar is. Alles wat aan `studyConfirmedYear` hangt
  gebruikt het studiejaar; dat is de gate, het bevestigingsscherm, én de
  geschiktheid voor de mailinglijsten. Zouden die uit elkaar lopen, dan valt
  iedereen tussen 15 juli en 27 september uit elke lijst zonder dat er iets
  gebeurd is.
- Het studiejaar is bewust **niet geklemd** op `FIRST_WORKING_YEAR` zoals het
  werkingsjaar (die klem bestaat omdat er geen roldata is van vóór 26-27). Met
  die klem zou de gate in de zomer van 2026 alsnog in juli vallen.
- **Eenmalige correctie bij de invoering (augustus 2026):** wie sinds 15 juli
  2026 al bevestigd had, stond op 2026 terwijl het antwoord in de praktijk over
  25-26 ging. De migratie `20260827160000_studiebevestiging_27_september` zet die
  stempels op 2025. Zo valt de eerste bevestiging onder de nieuwe regel op
  27 september 2026; tot dan is niemand gegate en blijven de mailinglijsten
  intact.
- Een verlopen studentenprofiel wordt **blokkerend** afgedwongen door een tweede gate in
  `apps/web/proxy.ts`, na de onboarding-gate: het lid gaat naar
  `/studie-bevestigen` voor het de site verder kan gebruiken.
- **Bewust geen reset van de data** (in tegenstelling tot het oude systeem): de
  vorige keuze blijft staan en wordt voorgevuld, zodat bevestigen één klik is.
  Dat verschil bepaalt of leden bevestigen of afhaken.
- De expliciete status voorkomt dat alumni, academisch personeel en andere
  niet-studenten door het ontbreken van een recente jaarstempel toch naar het
  bevestigingsscherm gestuurd worden.
- `saveProfileAction` (onboarding + `/account`) stempelt `studyConfirmedYear`
  alleen bij Student; voor elke andere status wordt die stempel leeggemaakt.

### Mailinglijsten (admin-export)

- De admin-tab **Mailinglijsten** (`mailinglists.export`) exporteert per categorie
  de leden die ze aangevinkt hebben. Kolommen zijn altijd `firstname`, `lastname`,
  `email`, waarbij `email` het **voorkeursadres** is (`emailPreference`), niet per
  se de login-mail. Zonder ingevulde persoonlijke mail valt dat terug op de
  universiteitsmail.
- Enkel **actieve** leden komen in een export: een gedeactiveerd account hoort
  geen mails meer te krijgen.
- Enkel leden met de status **Student** die hun studie **dit academiejaar bevestigd** hebben (zie de
  jaarlijkse studiebevestiging hierboven; die vervalt op 27 september, niet op
  15 juli) zitten in een lijst; dat geldt voor **alle** lijsten, ook "Alle
  studenten". Andere statussen vallen er meteen uit, zonder op een verlopen
  jaarstempel te moeten wachten.
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
  (`studyConfirmedYear` verloopt), de status Student uitzet of gedeactiveerd
  wordt, verdwijnt vanzelf uit de betrokken lijsten. Daarom zijn het **verse,
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

### Uitschrijven komt uit Brevo terug (de koppeling is tweerichting)

De sync hierboven was aanvankelijk eenrichting: de site duwde, Brevo ontving. Wie
op de uitschrijflink onderaan een campagne klikte, kreeg van Brevo inderdaad geen
mail meer, maar de site wist dat niet. Die persoon bleef in het beheer als
ingeschreven staan, bleef meegeteld bij de aantallen en kwam nog altijd in de
CSV/ZIP-download. Wie die download ooit ergens anders importeerde, mailde iemand
die net "stop" gezegd had. Sinds augustus 2026 leest de sync uitschrijvingen
terug (`apps/web/lib/brevo/unsubscribe.ts`).

- **Enkel uitschrijvingen komen terug, geen inschrijvingen.** De site blijft de
  plek waar iemand zich abonneert; daar staat de opt-in en daar hangt de
  toestemming aan vast. Brevo is enkel de plek waar iemand kan afhaken. Een
  contact dat in Brevo van de blacklist gehaald wordt, verandert op de site dus
  niets.
- **Twee signalen, twee betekenissen.** Brevo geeft per contact `emailBlacklisted`
  (geen enkele campagne meer) en `listUnsubscribed` (de lijsten waarvoor het
  contact zich apart uitschreef). Een blacklist zet `User.mailUnsubscribedAt`;
  een uitschrijving voor één categorielijst vinkt precies die `MailCategory` af.
  Uitschrijven voor "Alle studenten" telt als een blacklist: daar is op de site
  geen vinkje voor, dus het kan niets anders betekenen.
- **Afwezigheid is géén signaal.** Dat een adres niet (meer) in een lijst zit,
  lezen we bewust niet als een uitschrijving. De bulk-import bij Brevo verloopt
  asynchroon, dus een contact dat we net toevoegden kan een tel later nog
  ontbreken; die afwezigheid meetellen zou iemand uitschrijven omdát we hem
  inschreven.
- **`mailUnsubscribedAt` blokkeert álles, ook de alumnilijst.** Brevo kent maar
  één blacklist per contact, en de student- en alumnilijsten delen dat contact.
  "Stop" tegen de ene is dus ook "stop" tegen de andere; alles anders doen zou
  betekenen dat we blijven mailen naar iemand die op de knop drukte. `listWhere()`,
  `desiredListKeys()` en `listAlumniRecipients()` filteren er alle drie op.
- **De opt-ins blijven staan.** Een uitschrijving wist `mailCategories` of
  `alumniMailOptIn` niet. Schrijft het lid zich later opnieuw in, dan krijgt het
  zijn eigen keuzes terug in plaats van een leeg formulier.
- **Alleen het lid zelf kan terug, en dan gaat het in één keer.** Op /account
  verschijnt in dat geval een vinkje "ik wil weer mails ontvangen"
  (`mailResubscribe`). Dat wist `mailUnsubscribedAt` én haalt de uitschrijving in
  Brevo weg voor we opnieuw inschrijven, want een adres opnieuw in een lijst
  zetten heft de blacklist niet op. Een beheerder heeft die knop niet: de
  alumnitabel toont zo'n account als "zelf uitgeschreven" met een zin erbij in
  plaats van een knop die niets doet.
- **Eerst lezen, dan schrijven.** Beide sporen halen de uitschrijvingen op voor ze
  iets duwen: de reconciliatie leest élke lijst uit voor ze berekent wie waar
  hoort, en de real-time push haalt eerst het contact op. Andersom zou een
  profielopslag ("ik pas mijn adres aan") iemand stil terugzetten in de lijsten
  die hij net verlaten had, en zou de nachtelijke import de uitschrijving van die
  ochtend overschrijven.
- **Val om te kennen: een lijst-uitschrijving is niet te wissen via een veld.**
  Brevo heeft geen `listUnsubscribed` in de update-API. Wat wel werkt, is het
  contact van de lijst **loskoppelen** (`unlinkListIds`): die uitschrijving hangt
  aan het lidmaatschap, niet aan het contact. Daarom doet `clearUnsubscribe` een
  unlink van alle beheerde lijsten plus `emailBlacklisted: false`, en zet de
  gewone sync het contact daarna opnieuw in de lijsten waar het in hoort.
- **Matchen gebeurt op `ext_id`, dan pas op adres.** De sync stuurt `user.id` als
  `ext_id` mee, en dat blijft kloppen wanneer een lid van adres wisselt. Het adres
  is de terugval voor contacten die ooit anders binnenkwamen, hoofdletterongevoelig
  vergeleken: Brevo bewaart alles lowercase, een zelf ingevulde persoonlijke mail
  niet per se.

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
  - **De pagina is een gezichtenmuur, geen contactblad.** Alle posten staan onder
    elkaar op één lichtblauwe band; de postnaam loopt in de linkermarge mee zolang
    je door haar leden scrolt, en de portretten staan zonder kader op de band.
    Daarvoor stond er een vaste rail links met alle posten en een raster kleinere
    foto's per post. Het onderwerp van deze pagina zijn de mensen, en negentig
    gezichten achter elkaar zeggen wat de kring is; de rail liet de indeling meer
    plaats innemen dan de mensen zelf. Wat dat kost, is bewust aanvaard: springen
    naar een post gaat via de chips bovenaan in plaats van via een kolom die altijd
    in beeld staat, en op een smal scherm valt de meelopende marge weg.
    - Twee alternatieven zijn afgewogen en niet gekozen: **panelen per post** (twee
      kolommen witte kaders, halveert de paginalengte maar verkleint de gezichten
      en breekt de alfabetische leesvolgorde in twee kolommen) en een
      **doorzoekbaar register** (tabel met naam, post en functie; het bruikbaarst
      voor twintig jaar historiek, maar dan toont de pagina een databank en geen
      kring meer). Het register blijft een zinnige aanvulling *naast* de muur, niet
      in plaats ervan.
    - Ook afgewogen: **het dagelijks bestuur als donkere band bovenaan**, zodat
      Groep 5 niet alfabetisch tussen Fakbar en IT staat. Niet gekozen bij de muur,
      maar het is een losse laag die er later bovenop kan; ze leunt wel op de
      aanname dat Groep 5 de post met de titels is (in de historiek is dat elk jaar
      sinds 06-07 zo).
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

## Google Workspace: postadressen, accounts en de kiesploeg

Dit gaat over de **eigen adressen van de kring** (`activiteiten@vtk.be`,
`it@vtk.be`, `2027.g5@vtk.be`) en over de `@vtk.be`-accounts van de leden. De
code staat in `apps/web/lib/google/`; hoe je het opzet en draaiende houdt staat
in `docs/google-workspace.md`.

**Verwar dit niet met de Brevo-sync hierboven.** Dat zijn uitgaande
nieuwsbrieven naar studenten, opt-in per `MailCategory`, met consent als
grondslag. Dit hier zijn ontvangende adressen van de vereniging zelf: je staat
erin omdat je in die post zit, niet omdat je iets aanvinkte. Er is geen enkele
gedeelde regel tussen de twee, enkel een gedeeld sync-stramien (push bij
wijziging plus een reconcile als vangnet). Modelleer nieuwe code hier dus naar
`lib/vault` en niet naar `lib/brevo`.

### Waarom dit bestaat

De samenstelling van de posten en de werkgroepen wisselt elk werkingsjaar, en
tot nu toe werd die wissel **twee keer** ingevoerd: één keer in de admin van de
site (waar ze sowieso moet staan, voor `/praesidium`, rollen en rechten) en één
keer met de hand in de Google Admin console. Daar kwam het aanmaken van
accounts voor de nieuwe kiesploeg bovenop, plus losse vragen ("mag ik van die
lijst af", "wij willen een nieuwe lijst"). Die tweede invoer is wat hier
verdwijnt.

### Een lijst is een regel, geen ledenlijst

Een `MailGroup` beschrijft **wie erin hoort**, niet wie erin zit:

- **bronnen** (`MailGroupSource`): een post, een werkgroep, een kiesploegpost of
  een hele kiesploeg. Optioneel enkel de verantwoordelijke (`membership.role =
  LEAD`), zodat `verantwoordelijken@vtk.be` dezelfde machinerie gebruikt.
- **extra's** (`MailGroupExtra`): losse adressen die er sowieso bij horen (een
  oud-lid, een externe partner, iemand zonder website-account).
- **uitsluitingen**: de uitzondering die je anders in Google zou moeten
  najagen.

`activiteiten@vtk.be` is dus de regel "post Activiteiten + post Groep 5". Dat
g5 in élke postenlijst zit, staat als een **zichtbare bronrij** en niet als
verstopte regel in de code: de volgende IT'er moet het kunnen zien en wijzigen
zonder de code te lezen. Het aanmaakscherm zet die rij vanzelf klaar wanneer je
een lijst uit een post maakt.

### De 15-juli-wissel kost geen cron

Precies zoals bij de wachtwoordkluis: omdat `GroupMembership` per werkingsjaar
staat en de sync enkel het huidige jaar telt, loopt elke postgebonden lijst op
15 juli vanzelf leeg en vult de eerste reconcile daarna hem met het nieuwe
praesidium. Er is geen jaarwisselactie, en er hoort er ook geen te komen.

Hetzelfde geldt voor "haal mij van die lijst": wie niet meer in een bronpost van
dit jaar zit, verdwijnt bij de eerstvolgende reconcile. Enkel een handmatige
extra vraagt een handeling, en dat is één rij verwijderen.

### Wat de sync nooit doet

Drie grenzen, om dezelfde reden als bij de kluis: een bug in een sync die alles
mag, wist dingen die niemand kan terughalen.

- **Enkel gekoppelde groepen.** Een Google-groep zonder `MailGroup`-rij wordt
  niet gelezen en niet aangeraakt. IT kan dus lijsten met de hand blijven
  beheren zonder dat wij ze leegmaken.
- **Enkel gewone leden.** `OWNER` en `MANAGER` van een groep blijven staan, ook
  als ze niet in onze berekening zitten. Daar zit het botaccount tussen, en een
  sync die zichzelf uit de groep gooit kan nadien niets meer rechtzetten.
- **Nooit een groep verwijderen.** Verdwijnt de bron (post opgeheven), dan
  laten we de groep staan en beheren we ze niet meer. Aan een groepsadres hangt
  het archief van de conversaties, en het adres staat op affiches, in
  mailhandtekeningen en op de site van een bedrijf.

### Deze adressen ontvangen mail van buiten

Dat is het grote verschil met een nieuwsbrieflijst en het is de valkuil bij het
aanmaken: een groep met Google's defaults kan mail van externe afzenders
weigeren of naar moderatie sturen, en dat merk je pas wanneer een bedrijf klaagt
dat het nooit antwoord kreeg. "Wie mag posten" en "externe leden toegelaten"
zitten in de **Groups Settings API**, een aparte API van Directory, en worden
door de sync expliciet gezet in plaats van aan de default overgelaten.

### Gedeelde drives volgen de groepen, niet de mensen

Wie in het praesidium of in een kiesploeg komt, hoort ook bij de gedeelde drive
te kunnen (`Praesidium`, `Kiesploegen`). Daar is **geen Drive-koppeling** voor
gebouwd, en dat is een bewuste keuze: een gedeelde drive kan een **Google-groep**
als lid hebben, en die groepen beheren we al.

Zet de groep één keer met de hand op de drive, en de toegang volgt vanaf dan
precies dezelfde regel als het mailadres. Iemand toevoegen aan een post geeft
hem in één beweging de mailinglijst en de drive; iemand die de post verlaat,
verliest allebei. De drives van VTK staan trouwens al zo ingesteld (`Praesidium`
toont "3 groepen", `Kiesploegen` "1 groep").

- **Daarom bestaat het brontype "elke praesidiumpost".** `praesidium@vtk.be` is
  niet vijftien bronrijen die je moet aanvullen zodra er een post bijkomt, maar
  één regel. Hetzelfde voor "elke werkgroep".
- **We nemen de Drive-scope niet.** Die is breed, en wat ze zou opleveren is het
  automatiseren van een handeling die je per drive één keer doet. Dat is de
  verkeerde ruil.
- **Val: een los adres in zo'n groep krijgt óók drive-toegang.** Een oud-lid dat
  je met zijn privéadres aan `praesidium@vtk.be` toevoegt om mails te blijven
  krijgen, kan dan bij de bestanden. Wil je dat scheiden, gebruik dan een aparte
  groep voor de drive (zonder losse adressen) en hang de mailinglijst ergens
  anders aan.
- **De toegang volgt niet meteen.** Google cachet groepslidmaatschap voor Drive;
  reken op minuten tot soms langer. Wie net toegevoegd is en "ik zie niets"
  zegt, moet gewoon even wachten en opnieuw laden.
- **Een lid weghalen wist geen bestanden.** In een gedeelde drive is de drive de
  eigenaar, niet de persoon. Dat is precies waarom de kring gedeelde drives
  gebruikt en niet iemands "Mijn Drive".

### Identiteit: het `@vtk.be`-adres staat op de gebruiker

De site kent `jarne.plessers@student.kuleuven.be` (KU Leuven SSO), Google kent
`jarne.plessers@vtk.be`. Die twee bij elke sync op naam matchen is vragen om
ellende: naamgenoten, dubbele voornamen, tussenvoegsels. De koppeling staat
daarom **één keer opgeslagen op de `User`-rij** (`googleUserId`, het immutable
id van Google, plus `googleEmail`), en wordt op drie manieren gelegd:

1. **De site maakt het account zelf aan** (kiesploeg-flow hieronder). Dan klopt
   de koppeling per constructie.
2. **Zelfbediening met Google-login**, beperkt tot `hd=vtk.be`. Het lid logt één
   keer in met zijn VTK-account en de koppeling is geverifieerd.
3. **Een koppelscherm in de admin** met kandidaten op naam, om de bestaande
   accounts in te halen. Eenmalige kost.

**Voor praesidium- en werkgroepleden is (2) verplicht.** De gate staat naast de
onboarding en de studiebevestiging in `gateRedirect()` in `apps/web/proxy.ts`,
en niet in een layout: zie `docs/onboarding-study-gate.md` voor de oneindige
refetch-lus die dat oplevert.

Drie dingen die daar stil mislopen als je ze vergeet:

- `hd=vtk.be` op de autorisatie-URL is een **filter voor de gebruiker, geen
  beveiliging**. Controleer server-side dat het adres op `@vtk.be` eindigt en dat
  Google het als geverifieerd teruggeeft.
- Zet `prompt=select_account`. Zonder dat pakt Google het account dat toevallig
  in de browser ingelogd is, en dat is bij de helft van de leden hun privé-Gmail.
- Wie het tóch met een privéadres probeert, krijgt geen vage fout maar: "Dit is
  `jarne@gmail.com`. Log opnieuw in met je VTK-adres."

**De gate heeft een ontsnapping.** Wie nog geen `@vtk.be`-account heeft, kan
niets doen aan wat de gate vraagt, en een gate die zo iemand van de hele site
houdt is een storing en geen maatregel. De knop "ik heb nog geen VTK-account"
zet `User.googleLinkDeferredAt` en laat het lid een week door; daarna staat de
gate er weer. Dat veld is meteen ook de lijst voor IT van wie op een account
wacht.

**Een lid zonder koppeling wordt niet stil overgeslagen.** Het beheerscherm
toont "3 leden nog niet gekoppeld" bij de lijst. Zijn privéadres in een intern
postadres zetten kan, maar enkel met een bewuste klik: anders gaat interne mail
naar een gmail-adres zonder dat iemand die keuze maakte.

### De kiesploeg is een aparte structuur

Een kiesploeg heeft **eigen posten die niets met de praesidiumposten te maken
hebben** (marketing, ...), bestaat al vóór het werkingsjaar waarin ze aantreedt,
en verdwijnt daarna. Ze krijgt daarom een eigen model (`Kiesploeg` met jaar,
code, formele naam zoals "Kiesploeg Delta" en een informele naam die pas later
gekozen wordt) met eigen posten en leden, en **niet** een derde waarde in
`GroupType`. Gedeeld wordt enkel de mailinglijst-machinerie: een kiesploegpost
is gewoon een bron zoals een gewone post er een is.

De informele naam mag leeg blijven: de adressen hangen aan de code, niet aan de
naam.

#### De levensloop

1. **Enkel de g5 is bekend.** Zij krijgen `voornaam.achternaam@vtk.be` met een
   alias `kiesploeg<code>.voornaam.achternaam@vtk.be`, plus de groepen
   `<code>.g5@vtk.be` en `<code>.beheer@vtk.be` (de twee beheerders).
2. **De volledige ploeg komt erbij.** Zelfde adresvorm, maar: **geen
   verzendrecht** en **een mailbox die meteen doorstuurt** naar een adres dat ze
   zelf opgeven. Per persoon kan een beheerder dat opheffen (de marketingmensen
   moeten wel kunnen mailen).
3. **Mensen vallen af of komen erbij.** Lidmaatschap aanpassen in de admin, de
   reconcile zet Google recht.
4. **Verkozen: de postverdeling voor volgend werkingsjaar wordt ingevoerd.** Dat
   kan nu al: `workingYearTabs()` toont een vooruit aangemaakt jaar en
   `parseWorkingYear()` aanvaardt tot vijf jaar vooruit. Op 15 juli kantelt
   `currentWorkingYear()`, en de eerstvolgende reconcile zet de nieuwe mensen in
   de postenlijsten, maakt hun mailbox vrij en geeft hun verzendrecht.

#### Adressen zijn sjablonen, geen code

In de bestaande conventie staat de code op drie verschillende plaatsen
(`kiesploeg2027.voornaam.achternaam`, `2027.g5`, `marketing.2027`). Dat is
precies het soort afspraak dat volgend jaar anders is, dus de vormen staan als
**sjabloon op de kiesploeg-rij** met `{code}`, `{voornaam}`, `{achternaam}` en
`{post}`, met een voorbeeldregel eronder in de admin.

**Aanmaken gaat altijd via een voorbeeldscherm**
(`/admin/groepsadressen/accounts`, recht `googleAccounts.manage`). Je kiest een
post of een kiesploeg, ziet de volledige lijst voorgestelde adressen met een
vinkje per persoon, en pas dan gaat er iets naar Google. Het scherm herberekent
het voorstel server-side bij het uitvoeren: een adres dat de browser meestuurt,
is een adres dat de browser kan wijzigen.
Een mailadres is achteraf lastig te veranderen, en namen met accenten,
tussenvoegsels of naamgenoten (`jan.vandenbroeck` versus `jan.van.den.broeck`)
los je beter met ogen op dan met een regel. De normalisatie zelf is: kleine
letters, diacritics weg, niet-alfanumeriek weg, spaties in de achternaam
samengeplakt, en bij een botsing een cijfer erachter.

#### De standaardlijsten worden in één klik aangemaakt

De knop "standaardlijsten aanmaken" maakt per kiesploegpost een groepsadres uit
het lijstsjabloon, met **twee zichtbare bronrijen**: die post en de g5 van de
ploeg. Dat de g5 in elke lijst zit, staat dus in de bronnenlijst en niet als
regel in de sync, precies zoals bij Groep 5 en de praesidiumposten. Bestaande
adressen worden overgeslagen, zodat de knop twee keer indrukken niets breekt.

#### De accountstaat is afgeleid, met een override

Net als het groepslidmaatschap wordt de staat van een account **berekend** en
niet als losse knoppen bijgehouden:

- **beperkt**: zit enkel in een kiesploeg. Geen verzendrecht vanaf het primaire
  adres, mailbox stuurt door, de kiesploeg-alias is de standaardafzender.
- **volwaardig**: zit in een post of werkgroep van het huidige werkingsjaar.
- **override per persoon**: wint van allebei, voor de marketingmensen uit stap 2.

**Een afgeleide staat mag automatisch upgraden, nooit automatisch degraderen.**
Zonder die regel verliest op 15 juli het hele vertrekkende praesidium in één
reconcile zijn mailbox en zijn verzendrecht, want hun memberships van vorig jaar
tellen dan niet meer mee. Afsluiten, suspenderen en verzendrecht intrekken zijn
expliciete handelingen.

### Wat handmatig in de Admin console blijft

**Verhinderen dat iemand mailt vanaf zijn primaire adres kan niet via een API.**
In Gmail staat het primaire adres altijd in "Verzenden als" en dat is niet weg te
nemen; de enige afdwinging is een routing-/compliance-regel (Apps > Gmail >
Routing, uitgaand, actie Reject), en daar is geen publieke API voor.

De oplossing is dat die regel **eenmalig** op een **organisatie-eenheid** staat
(bijvoorbeeld `/Kiesploeg/Beperkt`) en dat de sync mensen in en uit die OU
verplaatst: `orgUnitPath` staat wél gewoon op de user in de Directory API.
Diezelfde OU regelt meteen de Gmail-service en de licentie. Handwerk dat je één
keer doet, lidmaatschap dat volledig geautomatiseerd is.

Wat we wél programmatisch afdwingen, is dat de alias de **standaardafzender** is
(`users.settings.sendAs` in de Gmail API). In de praktijk stuurt zo iemand dus
vanzelf vanaf zijn kiesploegadres, en de OU-regel vangt op wie het omzeilt.

### Vallen waar we in gaan lopen

- **De Gmail API werkt per gebruiker.** `sendAs` en automatisch doorsturen
  vragen domain-wide delegation waarbij je die ene gebruiker impersonateert, met
  eigen scopes. Dat is iets anders dan de Directory API, die je als
  admin-subject aanroept.
- **Een doorstuuradres moet bevestigd worden.** Gmail stuurt daarvoor een mail
  naar het doeladres. Dat is hier geen probleem maar een kenmerk: die bevestiging
  is meteen het bewijs dat het adres van hen is.
- **Een licentie kost geld vanaf dag één.** Elk kiesploeglid krijgt een
  volwaardige licentie met mailbox (bewuste keuze: betrouwbaarder dan een
  constructie zonder mailbox, en de omschakeling op 15 juli is één call). Bij een
  ploeg van zestig mensen is dat een begrotingspost, geen detail.
- **Het adres van een verwijderde gebruiker komt niet meteen vrij.** Dus geen
  accounts verwijderen; suspenderen.
- **De service-account-sleutel is een zwaar geheim.** Met domain-wide delegation
  kan die in principe beheerders aanmaken. Ze staat versleuteld in `Setting`
  (`google.config`, via `lib/secrets.ts`) achter een superadmin-scherm, precies
  zoals de organisatiesleutel van de kluis, en krijgt enkel de scopes die ze
  nodig heeft. `admin.directory.user` komt er pas bij wanneer we effectief
  accounts aanmaken.

#### Het wachtwoord wordt één keer getoond, nooit bewaard

Het gegenereerde wachtwoord staat na het aanmaken in de resultatentabel en
verdwijnt bij het herladen; het account staat op `changePasswordAtNextLogin`.
Bewust niet gemaild vanuit de site: dan zou er een wachtwoord in een mailbox
blijven liggen, en het adres waar we het naartoe zouden sturen is precies het
adres dat we nog niet geverifieerd hebben. De g5 geeft het door.

Dat is ook waarom het scherm er expliciet bij zegt dat de lijst na het verlaten
weg is. Een ploeg die haar wachtwoorden kwijt is voor ze ze doorgaf, is een
avond werk voor niets.

### Nog te beslissen

- Wat er gebeurt met het account van iemand die de kring verlaat, en na hoeveel
  tijd (mail en Drive-bestanden hangen eraan). Tot dat beslist is, degradeert de
  sync niemand automatisch en suspendt ze niemand.
- Of de kiesploegalias blijft staan als ontvangend adres nadat de ploeg
  aantreedt. Nu blijft hij staan: hij verwijderen zou mail doen bouncen die naar
  een adres uit die periode gestuurd wordt.

## Kalender: categorieën en agenda-feeds

### De site is de enige bron; geen koppeling met de Google-agenda

VTK had een gedeelde Google Workspace-agenda. Die wordt **niet** gekoppeld: niet
geïmporteerd, niet gespiegeld, niet gesynchroniseerd. De reden is dat
`CalendarEvent` dingen draagt waar een Google-agenda geen plaats voor heeft: een
Nederlandse én Engelse titel en beschrijving, `publishedAt` (concept vs. online),
`groupId` (dat bepaalt wie het event mag bewerken), een foto, en een 1:1-
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

## Categoriepagina: een lijst met een foto per pagina

De categoriepagina (`/info`, `/eerstejaars`, ...) toont de pagina's onder een
headertab. Ze zag er lang uit als een raster van witte kaartjes met enkel een
titel: op `/info` stonden zes kaarten waarvan er vier niets meer toonden dan hun
naam, want lang niet elke pagina heeft een `excerpt`. De oude site had daar wel
een foto per item, en die herkenbaarheid is precies wat een lijst van diensten
nodig heeft.

- **Elke pagina kan een eigen foto hebben** (`Page.imageKey`, een storage-key net
  als `HeaderTab.imageKey`), uploadbaar in de pagina-editor
  (`/admin/paginas/<id>`) met dezelfde `StorageImageField` als elders.
- **De foto staat als vierkant links van de tekst, niet als kop erboven.** Een
  categorie telt makkelijk tien items; in een lijst van brede kaarten (twee per
  rij) scrol je minder, en er blijft plaats voor de volledige samenvatting naast
  het beeld. Een fotokop bovenaan de kaart (zoals de aanbod-kaarten op de
  homepage) en een volledige fotokaart onder een navy scrim zijn allebei
  overwogen; de eerste maakt de pagina lang, de tweede dwingt elke kaart zonder
  foto in het donker.
- **Geen foto is een geldige toestand, geen fout.** De thumbnail toont dan het
  gestreepte placeholder-patroon van de site: zichtbaar onaf, maar de kaart blijft
  leesbaar en de rij blijft kloppen. In een lijst is dat een klein vlakje in
  plaats van een gat, wat mee de reden was om voor de lijst te kiezen.
- **Menu-items hebben nooit een foto.** Een categoriepagina toont ook de
  `HeaderTabLink`-items (piano reserveren, de cudi-webshop): dat zijn geen
  pagina's en er is dus niets om een foto aan te hangen. Ze houden het gestreepte
  patroon. Een eigen `imageKey` op `HeaderTabLink` is bewust niet gebouwd zolang
  niemand ernaar vraagt; het zou een tweede uploadscherm vragen voor items die
  vooral doorverwijzen.
- **Rechten volgen de inhoud, niet de structuur.** `savePageImageAction` checkt
  `canEditPageContent`, dus wie de tekst van een pagina schrijft, kiest ook de
  foto erbij; daar is geen `pages.manage` voor nodig.

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

### De frontpage: het donkere blok bovenaan

De **frontpage** is het bovenste deel van de homepage: de donkere zone met de
titel, de knoppen, de kaart ernaast en de rij snelle links, allemaal op één foto
(`.home-dark-zone`). De rest van de homepage staat daar los van, en wordt beheerd
onder Admin → Homepagina. De frontpage zelf heeft één eigen scherm: Admin →
Frontpage.

**Een frontpage is een component, geen ingevuld sjabloon.** Elke frontpage in
`apps/web/lib/frontpage/registry.ts` is een eigen ontwerp met eigen JSX en eigen
CSS, vrij om er totaal anders uit te zien dan de andere. Dat is een bewuste
keuze, en de tweede poging: de eerste versie was één generieke event-layout met
velden die je invulde.

- **Waarom dat niet werkte.** Een 24-urenloop-frontpage en een
  jobfair-frontpage zijn niet dezelfde pagina met andere woorden. De ene wil een
  aftelklok en rondetellers, de andere een muur van bedrijfslogo's. Door beide
  door één titel/subtitel/aftelklok-schema te duwen, kreeg elk evenement dezelfde
  vorm, en precies dat maakte de feature waardeloos.
- **Waarom het mag.** VTK heeft een handvol evenementen per jaar die een
  overname verdienen. Elk daarvan wordt één keer ontworpen en daarna jaarlijks
  hergebruikt met nieuwe datums. Een component per evenement is dus goedkoop; de
  abstractie eromheen was duurder dan het werk dat ze bespaarde.

**Velden staan per frontpage, niet gedeeld.** Elke module declareert zelf welke
velden ze aanbiedt (`fields` in het register) en het beheerscherm bouwt daar zijn
formulier uit. Een veld toevoegen is één regel in het register; er is geen
admin-werk aan. Zo hoeft niet elke tekstwijziging langs een deploy, zonder dat er
opnieuw een gedeeld schema ontstaat.

**De standaard is er ook een.** Ze staat in hetzelfde register met dezelfde
soort velden, zodat "de frontpage wijzigen" overal hetzelfde betekent. Ze heeft
geen venster en kan niet uitgezet worden: ze is wat er staat zodra geen enkele
andere frontpage actief is.

**Vensters, geen schakelaar.** Dezelfde reden als bij de aankondigingen: je zet
de jobfair weken vooraf klaar, ze gaat vanzelf live en verdwijnt vanzelf. Staan
er meerdere tegelijk klaar, dan wint de laatst gestarte; er is maar één
frontpage. Een rij die naar een verwijderde module wijst, wordt genegeerd (de
homepage valt terug op de standaard) en in het beheer als onbekend gemeld.

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
- **`/pocs` gebruikt hetzelfde wall-roster design als `/praesidium`** (`.vtk-wall`,
  `.vtk-wall-row`, `.vtk-wall-faces` uit `vtk-base.css`), aangevuld met het e-mailadres
  van de POC in het zijlabel (`.vtk-wall-email`). Bovenaan staat een quick-jump navigatie
  naar de verschillende richtingen. POC's zonder vertegenwoordigers in het
  geselecteerde jaar worden verborgen. Wie zijn eigen POC op de homepage ziet en
  doorklikt, kan zo het volledige overzicht en eerdere jaargangen raadplegen.
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
  `lib/cursusdienstHours.ts` naar dezelfde `entries`-vorm als Theokot. Het
  endpoint leest concrete weekinstanties: een week zonder instanties is dicht,
  niet het terugkerende sjabloon. Op zaterdag en zondag schuift het naar de
  volgende week; de kaart toont alleen maandag tot en met vrijdag. In de centrale
  Openingsuren-admin bewerkt Cursusdienst alleen de kaarttekst en linkt de kaart
  voor de concrete uren door naar Cudi.
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

### De weekplanning is één kalender, geen raster per voertuig

De transportplanning (`/beheer/vervoer/week`) en het publieke bezettingsoverzicht
(`/vervoer/bezetting`) tonen de week zoals een agenda-app dat doet: zeven
dagkolommen naast elkaar, de uren verticaal, elke rit een blok op zijn moment.

Dat is de tweede vorm. De ronde-2-feedback (T7) vroeg "de Litus-lay-out: uren als
rijen, voertuigen als kolommen", en zo is het eerst gebouwd: één raster per dag,
met een kolom per voertuig, zeven rasters onder elkaar. In gebruik bleek dat geen
weekoverzicht: "wat gebeurt er donderdag" stond pas na drie keer scrollen in
beeld, en dezelfde uren stonden zeven keer opnieuw getekend.

Wat daarbij vastligt:

- **Het voertuig is een eigenschap van de rit, geen kolom.** Het staat met zijn
  icoon in het blok (bestelwagen, auto, bakfiets), met een legende onder de
  kalender. Zo blijft de kolombreedte voor de dag, en niet voor drie voertuigen
  waarvan er meestal twee leegstaan.
- **De kleur blijft van de chauffeur** (zie B4), niet van het voertuig. Wie rijdt
  is de vraag bij het plannen; wat er rijdt lees je aan het icoon.
- **Overlappende ritten komen naast elkaar, ook over voertuigen heen.** Anders
  verbergt de auto de kar op precies het moment waarop je wil zien dat er twee
  dingen tegelijk rijden. De breedte wordt per groep elkaar rakende ritten
  gerekend en niet per dag: vier ritten die elkaar niet raken, staan alle vier
  volledig breed.
- **Staat een rit naast een andere, dan toont het blok enkel het beginuur.** Het
  einduur is af te lezen aan de onderrand en staat voluit in de tooltip; een
  afgekapt "08:0…" zegt niets.
- **De dagrand is Belgisch, niet UTC.** De dagen komen als UTC-middernacht binnen
  (zoals `todayDateOnly` ze maakt) terwijl de uren Belgisch zijn. Wie die twee
  door elkaar gebruikt, knipt de dag twee uur te laat: een rit van 23:00 tot 01:00
  kreeg dan een einduur vóór zijn beginuur (een blok met negatieve hoogte) en een
  rit van 00:30 belandde op de dag ervoor. `lib/week-lanes.ts` rekent de dagrand
  daarom om, en `test/week-lanes.test.ts` houdt dat vast.

### Karchauffeurs: één vlag, geen aparte soort

Een voertuig kan aangeduid staan als "vraagt een chauffeur die de kar mag
rijden" (`UitleenVehicle.needsVanDriver`), en een chauffeur als "rijdt met de
kar" (`UitleenDriver.canDriveVan`). Bij een rit met zo'n voertuig staan de
karchauffeurs bovenaan in de keuzelijst en de rest onder "Niet met de kar".

**"De kar" is bij VTK de bestelwagen (Angela), geen aanhangwagen; die heeft de
kring niet.** De velden heetten tot augustus 2026 `needsTrailerDriver` en
`canDriveTrailer`, het icoon bij een chauffeur was een auto met aanhangwagen, en
het voertuig "kar" had `nameEn: "Trailer"`. Dat was een leesfout van "met de kar
rijden" die tot in de Engelse UI doorliep. Hernoemd via een `RENAME COLUMN`, dus
de vlaggen die al gezet waren, staan er nog.

- **Eén vlag en geen enum AUTO/KAR:** elke karchauffeur rijdt ook gewoon met de
  auto, dus die twee sluiten elkaar niet uit.
- **De rest blijft kiesbaar,** uitgegrijsd noch geblokkeerd: het team beslist wie
  rijdt, de app zorgt er enkel voor dat je het niet per ongeluk doet.
- **Een vlag per voertuig en geen check op `code == "kar"`:** het team voert zelf
  voertuigen in, en een tweede bestelwagen zou anders stil buiten de regel
  vallen.
- **De knop is tekst en geen icoon,** anders dan de rij-acties ernaast: dit is
  een instelling met twee toestanden, niet een actie. Een icoon toont de
  uit-stand enkel als "hetzelfde, maar vager", en dat las niemand als een
  toestand. Nu staat er "Rijdt met de kar" (geel) of "Niet met de kar" (omrand).
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

### Collect&Go: de mail leest de bestelling, het team beslist waar ze landt

Boodschappen voor de kring worden bij Colruyt Collect&Go besteld. De
bevestigingsmail bevat alles wat de voorraad nodig heeft (product, aantal, prijs,
reservatienummer), en dat werd tot nu met de hand overgetypt in het
flesserke-scherm: bij zeventig lijnen een half uur werk, met dubbele items als
resultaat. De app leest die mails nu zelf en zet ze per **reservatienummer** klaar.

Wat daarbij vastligt:

- **Een bestelling wordt nooit blind geïmporteerd.** De app stelt per lijn een
  bestemming voor; het team bevestigt. Colruyt-namen ("BONI Choco Bubbles 750g")
  en onze catalogusnamen ("Choco Bubbles", merk BONI, 750 g) lopen genoeg uiteen
  dat automatisch inboeken vroeg of laat vijf bakken op het verkeerde item zet, en
  een verkeerde voorraad merk je pas wanneer je voor een cantus te weinig hebt.
  Wat het team kiest, wordt onthouden (`CollectEnGoProductMatch`), dus de tweede
  bestelling is grotendeels al ingevuld.
- **De vervaldatum wordt per lijn gevraagd.** Ze staat niet in de mail, en kebab
  en ijsbergsla vervallen niet op dezelfde dag. Eén datum voor de hele bestelling
  zou de rode "vervalt binnenkort"-markering weer waardeloos maken, precies het
  probleem dat de ladingen moesten oplossen. Leeg blijft toegelaten (kuisgerief).
  Er is één veld bovenaan om dezelfde datum snel op alle lijnen te zetten.
- **Prijzen blijven bij de bestelling, niet op de lading.** Een lading heeft geen
  prijs en krijgt er ook geen: wat een bak gekost heeft, is een vraag over een
  aankoop, niet over de plank. De mail bewaart subtotaal, kortingen, leeggoed en
  de prijs per lijn, dus de kost per acti is later te maken zonder migratie.
- **Een gekoppelde bestelling is te zien op het evenement zelf.** De koppeling
  (`CollectEnGoOrder.eventId`) zorgt ervoor dat de producten op de Materiaallijst
  van dat evenement belanden, en die lijst is het punt van de koppeling. Ze stond
  echter enkel daar: op `/beheer/evenementen` was niets te merken, dus je moest
  afdrukken om te weten of de koppeling gelukt was. De evenementkaart toont nu een
  vierde blok met reservatienummer, status, aantal producten en het afhaalmoment.
  Enkel wanneer er een bestelling aan hangt, anders dan materiaal, flesserke en
  transport: die drie zijn wat je voor een evenement aanvraagt en horen ook leeg
  vermeld te staan, terwijl boodschappen bij de meeste evenementen niet horen.
- **De notitie van de besteller gaat mee.** In Collect&Go typt de besteller er
  "Acti - livecantus" of "Ploeg - Cocktailworkshop - Theokot" bij. Dat is het enige
  spoor van waarvoor iets gekocht is; het staat in het importscherm en in de
  notitie van de lading.
- **Een lijn per gewicht ("1,0 Kg") vraagt een aantal.** Losse groenten worden per
  kilo verkocht en hebben geen stuksaantal. De app zet er een 1 en markeert de
  lijn; ze zelf een aantal laten verzinnen zou een fout zijn die niemand nog ziet.
- **Een tweede mail met hetzelfde reservatienummer vervangt de eerste, zolang die
  niet geïmporteerd is.** Wijzigt de bestelling, dan stuurt Collect&Go een nieuwe
  mail met datzelfde nummer; de oude lijst klopt dan niet meer. Is er al
  geïmporteerd, dan blijft die historiek staan en komt de nieuwe mail ernaast, met
  een waarschuwing in het scherm. Dedupe gebeurt op `Message-ID`, niet op het
  reservatienummer.
- **Lezen gebeurt met IMAP, en enkel voor mails van Collect&Go.** Er is nergens
  anders inkomende mail in deze apps; `@vtk/mail` stuurt enkel. Zonder config is de
  functie uit (zoals bij SMTP) en blijft het plakveld over. Mails van andere
  afzenders in dezelfde mailbox worden niet gelezen en niet als gelezen gemarkeerd:
  het is een mailbox van mensen, geen wachtrij van ons.

### Flesserke is voor de hele interne werking, niet enkel het praesidium

De toegangsregel was altijd "heeft een groep" (`session.groups.length > 0`), dus
werkgroepen en jaarwerkingen konden flesserke gewoon aanvragen. De teksten zeiden
"enkel voor het praesidium", en werkgroepen concludeerden daaruit dat het niets
voor hen was. Dat is rechtgezet in de app en in `docs/uitleendienst.md`.

Ziet een werkgrooplid de tab toch niet, dan hangt zijn account dit werkingsjaar
aan geen enkele groep. Dat is ledenbeheer op vtk.be (`/admin/werkgroepen`) en geen
zaak van de uitleendienst; de gate opzetten zou het verbergen in plaats van het
oplossen.

### Evenement: een koepel die je zelf opzet, niet een die vanzelf ontstaat

Materiaal, flesserke en vervoer van hetzelfde evenement kunnen onder één
`UitleenEvent` hangen. Het beantwoordt één vraag die nergens anders te stellen
was: "is voor dit evenement alles aangevraagd?".

- **Een evenement ontstaat niet vanzelf.** Het plan stelde voor "nieuw evenement"
  de default te maken in het aanvraagformulier. Dat is bewust niet gebeurd: dan
  krijgt elke uitlening van twee tafels een evenement, wordt het evenementscherm
  een tweede aanvraaglijst, en gaat de waarschuwing "nog geen vervoer
  aangevraagd" af op alles. Er ontstaat er een wanneer iemand er een maakt: het
  lid in het formulier ("maak hier een nieuw evenement van"), het team op
  /beheer/evenementen, of het groeperingsscript voor de historiek.
- **Het lid kan er zelf een maken**, en dat is nodig: de eerste aanvraag van een
  evenement heeft nog niets om aan te hangen. Wachten tot het team er een aanmaakt
  zou betekenen dat niemand het ooit gebruikt.
- **De koepel is geen eigenaar.** De aanvragen houden hun eigen `eventName`,
  datums en status; verwijder je het evenement, dan blijven ze bestaan
  (`onDelete: SetNull`). Ze zijn het werk, de koepel is een groepering.
- **Geen filter op post.** Elk evenement staat in de keuzelijst van elk lid: twee
  posten die samen een evenement doen, moeten er allebei aan kunnen hangen, en dat
  is precies waarvoor de koepel dient.
- **De ladingsinschatting zegt wat ze niet weet.** `volumeLiters` is optioneel per
  item, dus het scherm toont het gekende volume én hoeveel stuks er geen volume
  hebben. Een half volume als "het totaal" tonen zou de transportverantwoordelijke
  een te kleine kar laten kiezen.
- **De historiek groepeert enkel wat samenhoort.** Het script
  (`npm run group:events -w @vtk/logistiek`) clustert op genormaliseerde naam +
  post + week, en laat clusters van één aanvraag met rust. Het draait standaard
  als dry-run: een verkeerde groepering hangt aanvragen van twee posten onder één
  naam, en dat is vervelender dan geen groepering.
- **De losse overzichten blijven.** `/beheer/aanvragen` en `/beheer/vervoer` zijn
  waar je beslist; het evenementscherm komt erbij en vervangt niets.

### Sjablonen maakt Logistiek, niet de posten

Een vaste set materiaal (een cantus, een BBQ) staat als sjabloon in het
aanvraagformulier en vult daar de aantallen in.

- **Enkel Logistiek maakt ze aan.** Lieten we elke post zijn eigen sjablonen
  maken, dan staan er na één werkingsjaar dertig varianten van "cantus" in de
  keuzelijst en weet niemand nog welke de juiste is. *Achterhaald sinds
  feedbackronde 2: iedereen mag er een maken, maar de knop staat onderaan de
  keuzelijst zelf. Zie § Feedbackronde 2 (augustus 2026): vier keuzes vooraf.*
- **Twee wegen om er een te maken, met opzet.** Vanaf een bestaande aanvraag
  ("Bewaar als sjabloon") is de gewone: een cantus bestaat al voor iemand er een
  sjabloon van wil, en de lijst opnieuw intikken is precies het werk dat een
  sjabloon moet uitsparen. Met de hand (/beheer/sjablonen) is voor het opzetten
  van nul: dan bestaat die aanvraag nog niet, en drie nepaanvragen indienen en
  weer opruimen om aan drie sjablonen te geraken is geen manier van werken.
- **De handmatige kiezer is dezelfde catalogusbrowser als het
  aanvraagformulier**, min de datums, het evenement en de contactvelden. Wie een
  sjabloon opstelt zoekt op precies dezelfde manier als wie een aanvraag indient;
  een tweede, kalere itemkiezer leren kennen is werk zonder opbrengst.
- **Een handgemaakt sjabloon krijgt geen post.** Dat label kwam van de aanvraag
  waaruit het gemaakt werd; verzinnen welke post erbij hoort maakt het een gok.
- **Een sjabloon telt op bij wat er al staat**, en vervangt niet. Wie eerst iets
  koos en dan een sjabloon neemt, is zijn keuze anders kwijt zonder waarschuwing.
- **De post op een sjabloon is een label, geen filter.** Een sjabloon van Cultuur
  kan even goed voor een andere post passen; verbergen zou het onvindbaar maken
  voor wie het net nodig heeft.
- **Een item dat uit de catalogus verdwijnt, valt uit het sjabloon** maar de lijn
  blijft staan: komt het item terug, dan is het sjabloon weer compleet. Het
  beheerscherm zegt hoeveel lijnen overgeslagen worden.

### Meerdere voertuigen: één aanvraag, N boekingen

Een verhuis met de kar én de auto is één vraag. Ze komt binnen als één aanvraag
en wordt N boekingen met hetzelfde `tripGroupId`, dezelfde groepering als heen en
terug (V12). Bij twee voertuigen én een terugrit zijn dat er vier.

- **Waarom niet één boeking met een lijst voertuigen:** elke query over "wanneer
  is dit voertuig bezet" (de conflictcheck, de kalender, het weekoverzicht, het
  publieke bezettingsraster) leest één rij per voertuig per tijdvenster. Een lijst
  zou al die queries moeten aanpassen.
- **Ze worden standaard samen beslist.** Eén voertuig goedkeuren en het andere
  laten hangen, levert een verhuis op die half kan doorgaan. Goedkeuren, afwijzen
  en annuleren werken dus op de hele groep. *Sinds feedbackronde 2 kan het team
  wel expliciet "enkel deze rit beslissen" aanvinken: soms kan de heenrit al
  vast en moet de terugrit nog verschuiven, en dan is de heenrit vastleggen
  beter dan allebei laten hangen. Het vinkje staat standaard uit en zegt erbij
  dat de aanvrager anders zonder terugrit valt.*
- **Tarief per voertuig gesnapshot.** De kar is gratis en de auto per kilometer;
  de prijsindicatie telt de vaste tarieven op en zegt van de per-km-voertuigen dat
  ze pas na de rit gekend zijn.

### Concept: lokaal in de browser, niet in de database

Een half ingevulde aanvraag overleeft nu een gesloten tabblad. Ze staat in
`localStorage` van de browser, niet als `DRAFT` op `UitleenReservation`.

- **Een concept in de database raakt alles.** Elke query die vandaag "alle
  reservaties" zegt zou `DRAFT` moeten uitsluiten: de voorraad, de kalender, de
  beheerlijsten, mijn reservaties, de conflictberekening. Eén vergeten query en
  een half ingevuld formulier reserveert materiaal.
- **Dit dekt het geval waar het om gaat**: de tab viel dicht, de laptop ging toe,
  de aanvrager ging eerst nog eens kijken wat er in de loods lag. Wie op een ander
  toestel wil verder werken, is de uitzondering; komt die vraag terug, dan pas is
  een echte `DRAFT`-status de moeite.
- **Terugzetten gebeurt op een klik, nooit vanzelf.** Een formulier dat zichzelf
  invult met iets van vorige week is verwarrender dan een leeg formulier. Er staat
  een balk met "verder werken" of "weggooien", en het tijdstip erbij.
- **Per lid gesleuteld** (`draftKey`), want de pc in het logikot is gedeeld. Een
  leeg formulier wordt niet bewaard, en na twee weken vervalt het concept: dan is
  het geen aanvraag in opbouw meer maar iets dat blijven hangen is.

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
  set is nog altijd uitleenbaar, en wie ze niet wil uitlenen zet het vinkje
  "telt mee" van dat exemplaar uit. Dat vinkje (`active`) is voor een exemplaar
  dat bestaat maar er niet is: kwijt, in herstelling, of voor lang uitgeleend.
  Het heette "in roulatie", tot bleek dat niemand wist wat dat betekende.
- **Reserveren blijft op itemniveau.** Een lid vraagt "twee boxen", geen "box 3".
  Welk exemplaar iemand meekrijgt, blijkt bij het klaarzetten (A7); dat in het
  aanvraagformulier leggen zou elke aanvraag een inventarisoefening maken.
- **Staan ze allemaal weer op dezelfde staat, dan verdwijnen de exemplaren.** De
  opsplitsing bestaat om een verschil bij te houden; is dat verschil weg (de
  kapotte box is hersteld), dan zou de inventaris anders volblijven staan met
  opsplitsingen van vroeger, elk met hun eigen namenlijst. Het opslaan voegt ze
  weer samen tot één rij en zegt dat in de toast; de editor waarschuwt vooraf,
  want de namen van de exemplaren gaan daarbij verloren.
- **Behalve wanneer alles kapot staat.** Bij een item met exemplaren telt KAPOT
  niet mee voor de voorraad, bij een item zonder exemplaren wel. Vier kapotte
  frigo's samenvoegen zou de voorraad dus stil van 0 naar 4 tillen.
- **Eén opslaan-knop voor het hele item, exemplaren inbegrepen.** Elk exemplaar
  had een eigen "Bewaren", wat twee dingen brak: wie meerdere rijen aanpaste en
  één keer opsloeg, verloor de rest, en React 19 reset na een form action elk
  uncontrolled veld van dat formulier, dus de niet-bewaarde rijen sprongen terug
  naar de waarde waarmee de pagina geladen was. De exemplaren zijn nu een veld
  van het itemformulier (JSON in een hidden input) in plaats van formuliertjes
  in een formulier.

### Mijn reservaties: drie soorten, en materiaal is van de post

"Mijn reservaties" had twee kopjes: Materiaal en Vervoer. Een flesserke-aanvraag
bevat geen enkel materiaalitem maar stond wel onder Materiaal, met een lege
itemopsomming.

- **Drie secties: materiaal, flesserke, vervoer.** Een aanvraag met allebei hoort
  bij materiaal (daar zit het werk) en zegt in haar samenvatting dat er ook drank
  bij zit; ze twee keer tonen zou lijken op twee aanvragen.
- **Alle drie tonen de aanvragen van je hele post**, met eronder in het klein wie
  ze deed. Een post bestelt als post: wie op maandag materiaal aanvroeg en op
  woensdag ziek is, laat de rest anders in het ongewisse, en dan wordt hetzelfde
  twee keer aangevraagd. Dat geldt even hard voor een bak cola en voor de kar.
- **Zien is niet wijzigen.** Een aanvraag van een collega opent leesalleen: geen
  aanpassen, geen annuleren, geen betaalknop. Anders haalt iemand materiaal weg
  onder de aanvrager zonder dat die het merkt.
- **Enkel posten delen, geen werkgroepen.** Een werkgroepaanvraag bewaart geen
  `groupId` (zie `deriveMemberRequester`), enkel een vrije naam; er is dus niets
  om op te groeperen zonder daar eerst een echte koppeling van te maken.
- **Een rit hangt sinds dit ook aan zijn post.** `createVanBookingAction` zette
  `requesterType`/`groupId` niet, in tegenstelling tot de materiaal- en
  flesserke-aanvragen: elke rit van een lid stond in het beheer als "Interne
  post" zonder naam. Het vervoerformulier vraagt nu "Namens" wanneer het lid meer
  dan één post heeft, net als de andere twee. Ritten van voor deze wijziging
  hebben geen post en worden dus niet gedeeld.

### Een gekozen evenement vult de naam in

Het aanvraagformulier vroeg de naam van het evenement in een tekstveld, en
verderop kon je de aanvraag aan een bestaand evenement hangen. Wie dat deed,
had de naam twee keer ingevuld, en de twee liepen uit elkaar zodra er één
aangepast werd.

- **Koppel je aan een evenement, dan is de naam een gegeven.** Het veld toont ze
  met een onderbroken rand en je typt niets meer. Loskoppelen maakt er weer een
  gewoon veld van, met die naam als vertrekpunt.
- **Enkel de naam.** Locatie, startuur, opkomst, contact en de extra info blijven
  gewone velden: die verschillen per aanvraag, ook binnen hetzelfde evenement.
- Geldt in de drie formulieren (materiaal, flesserke, vervoer), want de
  dubbelinvoer zat in alle drie.

### "Levering nodig" wordt een echte rit

Het vinkje op de materiaalaanvraag zette enkel `delivery` en `deliveryNote` op de
aanvraag. Het maakte geen boeking aan, stond niet in de aanvragenlijst en niet in
de mail, en `/beheer/vervoer` toont enkel `UitleenTransportBooking`: een gevraagde
levering kwam daar dus nooit terecht. Wie die ene regel op de detailpagina niet
opmerkte, wist van niets.

- **Logistiek schuift ze door, het lid niet.** Een lid dat materiaal aanvraagt
  weet niet welk voertuig vrij is, en het laadadres is de loods. Het vinkje blijft
  dus een vraag; de knop "Rit aanmaken" op de aanvraag maakt er de rit van, met
  het evenement, de dagen, de bestemming en het telefoonnummer al ingevuld.
- **De rit komt op naam van de aanvrager**, niet van wie ze aanmaakt. Zo staat ze
  bij "Mijn aanvragen" van het lid en gaan de mails erover naar hem, net als bij
  een rit die hij zelf aanvroeg.
- **Ze wordt AANGEVRAAGD en niet meteen goedgekeurd.** De goedkeuring doet de
  botsingscontrole per voertuig, kiest de betaalwijze en wijst de chauffeur toe;
  die overslaan zou een tweede, zwakkere beslisweg maken. Eén klik extra, in ruil
  voor dezelfde controle als elke andere rit.
- **Heen én terug staat voorgevuld aan.** Wat geleverd wordt, moet ook weer
  opgehaald worden; de terugrit vertrekt van de terugbrengdag van de aanvraag.
- **`reservationId` is SET NULL, geen cascade.** Verdwijnt de aanvraag, dan blijft
  de rit bestaan: het voertuig is die dag nog altijd bezet, en een boeking laten
  verdampen omdat iemand een aanvraag opruimt slaat een gat in de planning.
- **De badge in de aanvragenlijst is geel tot de rit bestaat**, daarna "Levering
  gepland". Zonder die badge blijft de knop onvindbaar voor wie de lijst scant.

### De beheerbalk is een tabbalk, geen rij losse tegels

Twaalf beheerpagina's naast elkaar lezen als een opsomming waarin je
"Chauffeurs" alleen vindt als je al weet dat het bestaat. Ze groeperen hielp,
maar de kopjes stonden als losse woordjes ("UITLEEN", "VERVOER", "OVERIG")
tussen de knoppen en zagen eruit als kapotte knoppen.

- **Vier tabs, met de pagina's op een tweede rij eronder.** De tab waar je in
  zit staat open, dus elke pagina blijft op één klik.
- **Een tab openen navigeert niet.** Het wisselt enkel de onderste rij, zodat je
  kan rondkijken zonder de pagina te verlaten waar je aan bezig bent. Navigeer je
  wel, dan volgt de balk mee naar de afdeling waar je terechtkomt.
- Zet de groepslabels niet terug tussen de knoppen.

### Itemfoto's: de eerste is de thumbnail

Een item heeft een thumbnail (`photoKey`, de foto in de catalogus en in het
aanvraagformulier) en een galerij (`UitleenItemPhoto`, de rest van de
detailpagina). In het beheerscherm stonden daar twee aparte uploadknoppen voor,
en wie zijn eerste foto in het verkeerde vak zette, kreeg geen beeld in de
catalogus zonder te zien waarom.

- **Eén lijst in de editor.** De eerste foto is de thumbnail; de rest is de
  galerij. Wie een andere thumbnail wil, schuift die met "Thumbnail maken" naar
  voren. Het onderscheid bestaat dus nog in de database, maar het is geen keuze
  meer die je vooraf moet maken.
- **Geen apart "verwijderen" voor de thumbnail.** Ze weghalen promoveert gewoon
  de volgende foto, en een item zonder foto's heeft geen thumbnail.

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


### Goedkeuren gebeurt per lijn, en afgewezen materiaal blijft staan

Logistiek kon een aanvraag enkel in haar geheel goedkeuren of afwijzen. Vijf
items waarvan er één niet vrij is, werd daardoor ofwel volledig afgewezen ofwel
stilzwijgend uitgekleed via het bewerkscherm. Elke lijn draagt nu een eigen
beslissing (`UitleenReservationLine.lineStatus`).

- **Geen "deels goedgekeurd"-status op de aanvraag zelf.** Dat is af te leiden
  uit de lijnen, en een extra waarde in `UitleenReservationStatus` zou elke
  query, elk filter en elke voorraadberekening die op status kijkt moeten
  bijwerken, met één vergeten plek als prijs.
- **Een niet toegekende lijn neemt geen voorraad in** maar blijft wel op de
  aanvraag staan. De beschikbaarheidsquery filtert daarom op de lijn en niet
  enkel op de aanvraag: anders zou één geweigerde tafel de rest van de week als
  geboekt tellen.
- **Ze verdwijnt nergens, ook niet voor de aanvrager.** Doorstreept, in een eigen
  blokje "Niet toegekend", met de reden erbij; ook in de mail staat ze apart
  onderaan en niet tussen de rest. Wat verdwijnt zonder spoor, wordt de dag zelf
  alsnog verwacht.
- **Wel op het scherm, niet op het printblad.** Het blad aan het rek is een
  werklijst: wat niet meegaat, hoort daar niet op. De klaarzetlijst telt alleen
  de toegekende lijnen.
- **Een lijn opnieuw toekennen doet dezelfde harde voorraadcheck als het
  goedkeuren zelf**, want intussen kan die tafel aan iemand anders toegewezen
  zijn.
- **Alles weigeren is geen goedkeuring.** Blijft er niets over, dan weigert de
  actie; dan hoort de aanvraag afgewezen te worden, met een reden, in plaats van
  goedgekeurd met een lege lijst.
- **De teamnota staat naast die van het lid** (`adminNote` naast `note`), met een
  label "Lid:" en "Logi:" ervoor. Zie ook § Feedbackronde 2, waar staat waarom
  het gedeelde veld niet volstond.

### Een interne aanvraag toont geen bedragen

Prijs, waarborg en betaalstatus verdwijnen volledig zodra de aanvrager een post
of een werkgroep is (`chargesRequester` in `apps/logistiek/lib/uitleen.ts`);
enkel `EXTERN` betaalt.

- **De kring factureert niet aan zichzelf.** Een bedrag naast een interne
  aanvraag zet mensen aan het rekenen over geld dat nooit van hand wisselt, en
  een postverantwoordelijke die "45,00 EUR te betalen" ziet staan, mailt daarover.
- **Aan beide kanten van het scherm.** Ook het team ziet het bedrag niet, en een
  teller van openstaande betalingen telt interne aanvragen niet mee. Anders staat
  er in het beheer een openstaand bedrag dat niemand ooit gaat innen.
- **Verbergen, niet nullen.** "0,00 EUR" is een bewering over de prijs; een leeg
  vak is de afwezigheid van de vraag. Het onderliggende bedrag blijft wel
  berekend en opgeslagen: wordt een aanvraag alsnog naar extern omgezet, dan
  klopt de prijs nog.
- **Los van `showRentPrices`.** Die instelling gaat over de dagprijzen in de
  catalogus (mag een lid zien wat een beamer kost?) en niet over een concrete
  aanvraag. De twee combineren, de ene vervangt de andere niet.
- **Ook al vóór het indienen** (S2, ronde 3). De regel gold aanvankelijk enkel op
  een bestaande aanvraag; het aanvraagformulier zelf toonde de waarborg per item,
  in het totaal en in de betaalnota eronder, aan iedereen. Een post zag dus een
  bedrag terwijl hij koos, en pas erna nooit meer. Het formulier kent zijn
  aanvragertype (het leidt het af uit de gekozen groep, zoals de server dat bij
  het indienen opnieuw doet), dus het volgt nu dezelfde regel. Op de
  itemdetailpagina, waar er nog geen aanvraag is, geldt de regel van het
  formulier: wie bij geen enkele groep hoort, vraagt extern aan en ziet de
  waarborg wel.

### De uitleendienst gaat in fases open, en externen zijn de laatste

Vanaf het semester 2026-2027 werkt Logistiek écht met de app, maar niet met
iedereen tegelijk. De transportkant is het scherpst (het team plant er zijn week
mee); materiaal, flesserke en evenementen lopen bij de posten en de werkgroepen
naast hun bestaande Excels. Een externe student kan voorlopig niets indienen.

- **Eén schakelaar, geen deploy** (`externalRequestsOpen` in
  `logistiek.settings`, op /beheer/instellingen). Het team beslist wanneer het
  opengaat, en dat moment valt niet samen met een release.
- **Kijken mag, indienen niet.** De catalogus, de tarieven en het
  bezettingsoverzicht blijven zichtbaar; in de plaats van de indienknop staat het
  mailadres van Logistiek. Een externe die een leeg scherm krijgt, mailt niet en
  komt ook niet terug wanneer het wél opengaat.
- **De poort staat in de server action** (`externalGate` in
  `app/actions/uitleen.ts`), niet enkel in het formulier. De knop verbergen houdt
  niemand tegen die de actie rechtstreeks aanroept, en het is precies deze poort
  die bepaalt of er een aanvraag binnenkomt waar niemand naar kijkt.
- **Posten en werkgroepen merken er niets van.** De regel hangt aan "hoort dit
  werkingsjaar bij geen enkele groep", dezelfde regel die het aanvragertype
  bepaalt (`requestsAsExternal`). Eén begrip, niet twee die uit elkaar groeien.

### Feedbackronde 2 (augustus 2026): vier keuzes vooraf

De tweede feedbackronde (werkplan: `docs/logistiek-feedback-ronde-2.md`) begon
met vier vragen die eerst moesten vallen, omdat er taken van afhingen.

- **Een Collect&Go-bestelling wordt gekoppeld aan een evenement, niet opnieuw
  gebouwd.** De mailimport bestaat al (zie § Collect&Go); wat ontbrak is dat de
  bestelling bij het evenement hoort, zodat ze op de materiaallijst van dat
  evenement staat. Een tweede, handmatig ingevoerde soort bestelling ernaast zou
  betekenen dat dezelfde boodschappenlijst op twee plekken kan leven.
- **Iedereen mag een sjabloon maken, maar pas nadat hij de bestaande gezien
  heeft.** Dit draait § Sjablonen maakt Logistiek, niet de posten terug: de
  posten vroegen er zelf om, en het argument daar (na één jaar dertig varianten
  van "cantus") is een argument over de keuzelijst, niet over wie mag aanmaken.
  Daarom zit "Nieuw sjabloon" **onderaan de keuzelijst zelf**, na de bestaande
  sjablonen, en niet als eigen knop ernaast: wie er een wil maken, is dan
  langsheen de lijst gepasseerd waar het antwoord misschien al stond. Dat is de
  hele rem; er komt geen tweede in de vorm van rechten.
- **Iedereen blijft elk sjabloon zien.** De post op een sjabloon blijft een
  label en wordt geen filter (zie § Sjablonen maakt Logistiek, niet de posten):
  een cantussjabloon van Feest past even goed voor Cultuur, en verbergen zou het
  onvindbaar maken voor wie het net nodig heeft. Dat maakt de lijst ook langer,
  en precies daarom staat de knop om er een bij te maken onderaan.
- **Externen zien geen evenementen en geen sjablonen.** De evenementkeuze en de
  sjabloonkeuze verdwijnen uit het formulier van een externe aanvrager, en de
  lijst van evenementen wordt hem nooit getoond. Ze zijn voor hem toch niet
  bruikbaar (hij hoort bij geen enkele groep), en de namen van de evenementen
  zijn werking van de kring die een externe niet hoeft te kennen.
- **De kleur van een chauffeur volgt uit zijn id, ze wordt niet ingesteld.** Het
  weekoverzicht kleurt elke rit naar de toegewezen chauffeur. Een vaste hash op
  een palet van tokens geeft dezelfde chauffeur altijd dezelfde kleur, zonder
  migratie en zonder een beheerscherm waar iemand kleuren moet gaan zitten
  kiezen. Het doel is onderscheiden wie wat rijdt, niet dat Jonas geel wil.

Eén ding hierboven vraagt nog een tweede terugdraaiing. **Een reservatielijn
krijgt toch een apart notitieveld voor het team** (`adminNote` naast `note`).
`UitleenReservationLine.note` was met opzet één veld, met als argument dat twee
notitievelden allebei half ingevuld raken. In de praktijk kwam het omgekeerde
naar boven: de aanvrager schrijft "liefst de zwarte" en het team schrijft "staat
al klaar bij het rek", en in één veld overschrijft de tweede de eerste zonder
dat iemand ziet dat er iets weg is. Wie wat schreef, moet zichtbaar zijn bij het
item; daarom twee velden met elk hun eigen label.

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

### Wat een sync achterlaat

De spiegeling schrijft naar het **adminlogboek** (`/admin/it/logboek`), op naam van
"Systeem" onder `Cursusdienst-shiften (cudi)`. Bewust niet naar de containerlog:
die is enkel via de server te bereiken en wordt nergens verzameld, dus wat daar in
staat leest niemand op het moment dat het nodig is.

- **Een afgekeurde payload zegt wát er scheelde**, tot op de shift:
  `shifts[7] (cudi-412): startTime is geen geldige ISO-datum`. Die reden gaat ook
  mee in het 400-antwoord, want cudi logt zijn eigen kant en heeft niets aan een
  reden die enkel wij kennen.
- **Bij een prune staat erbij wélke shiften verdwenen** (`sourceId@starttijd`,
  afgekapt na twaalf). "Er zijn er zeven weg" volstaat niet om ze terug te zetten
  wanneer cudi een halve set stuurde. Een lege set is geldig (er kunnen echt geen
  komende shiften meer zijn) maar prunet alles vanaf de cutoff, en dat is ook net
  hoe een half mislukte generatie aan de cudi-kant eruitziet; vandaar dat de regel
  de namen bevat.
- **Een geslaagde routine-sync komt er niet in.** Cudi stuurt de volledige set bij
  élke wijziging aan zijn kant, dus één reeks gegenereerde shiften levert al
  tientallen syncs op. Die zouden het logboek verzuipen, en na dertig dagen
  (`AUDIT_RETENTION_DAYS`) staan ze er toch niet meer.
- **Een geweigerd token evenmin.** Het endpoint is onbeschermd bereikbaar, dus wie
  het adres kent zou het logboek kunnen volspammen. De aanroeper krijgt zijn 401.
- Een **onverwachte fout** gaat naar Sentry met de stacktrace (`console.error` +
  `captureException`, zoals overal); het logboek krijgt de leesbare versie en de
  melding dat de transactie is teruggedraaid.
- Er gaan **geen persoonsgegevens** in: een payload bevat enkel shiftdefinities.
  Inschrijvingen lopen langs de gewone main-flow en staan hier los van.

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

## Beheerschermen van een post in het accountmenu

Drie posten beheren hun werking op een site die niet deze site is: Logistiek de
uitleendienst, Bedrijvenrelaties de career-site, Cursusdienst de cudi-tool. Wie
daar moet zijn, vond die adressen tot nu toe enkel door ze te kennen. Ze hangen
daarom in het accountmenu onder de avatar, meteen na "Admin": dat is waar iemand
kijkt die "naar het beheer" wil, en het is ook de enige plaats op de site die al
per persoon verschilt.

- **Ze staan niet in de publieke navigatie.** Het zijn interne ingangen voor een
  handvol leden; een menu-item dat voor 99% van de bezoekers een 403 is, hoort
  niet in de hoofdnavigatie.
- **De namen blijven onvertaald**: "Logistiek Beheer", "Career Admin", "Cudi
  Admin". Dat zijn de namen van de tools zelf, niet een stuk sitecopy.
- **Alle drie hangen ze aan het lidmaatschap van de post**, niet aan een
  permissie. Voor career en cudi kan het niet anders: die apps kennen onze
  permissies niet en beslissen op hun eigen SSO-codes. Voor logistiek bestaat
  `logistiek.manage` wél, en dat is exact wat het beheer daarginds controleert,
  maar die permissie zit ook bij superadmins en bij rollen buiten de post. Die
  mensen openen het uitleenbeheer nooit, en dan is het menu-item enkel ruimte die
  iets nuttigers had kunnen tonen. Het accountmenu is kort: wat er staat, moet
  ergens over gaan.
- De prijs is dat het menu-item en de echte toegangscontrole uit elkaar kunnen
  lopen. Iemand met `logistiek.manage` buiten de post moet het adres kennen (of
  via /admin gaan), en een lid van Bedrijvenrelaties zonder beheerrechten op
  career.vtk.be ziet de link wel en botst daar op hun scherm. Dat is bewust: het
  alternatief is hun rechtenmodel bij ons dupliceren, en dat verloopt stil zodra
  zij iets wijzigen.
- **Enkel logistiek volgt de omgeving.** Die app is van ons en draait ook op
  `logistiek.dev.vtk.be`, dus het adres komt uit `LOGISTIEK_PUBLIC_URL`, dezelfde
  variabele die de zoekresultaten al gebruiken. Staat ze niet ingesteld, dan
  verschijnt het item niet. Career en cudi hebben geen testomgeving en staan als
  vast adres in de code.

**Waarom geen dashboardtegel per post?** Die bestaan (zie hieronder) en zouden
dit ook kunnen. Maar een dashboardtegel woont op /admin: je moet er al zijn om ze
te zien, en precies dat is de stap die deze drie posten wilden overslaan. De
tegels blijven voor wat een post zelf toevoegt; deze drie zijn vaste onderdelen
van onze eigen werking.

## Dashboardtegels (snelkoppelingen op /admin)

Het dashboard opent met een raster snelkoppelingen naar de externe tools die een
post dagelijks nodig heeft: de drive, de wiki, een repository, de printbestellingen.
Er zijn drie soorten, en dat onderscheid is de kern van de feature.

- **Voor iedereen (GLOBAL).** Beheerders met `dashboard.manage` zetten deze op
  /admin/dashboard-tiles; elk ingelogd lid ziet ze. Dit recht geeft geen beheer
  over posttegels.
- **Per post of werkgroep (GROUP).** Leden met `dashboard.manageOwn` beheren
  enkel de tegels van hun eigen post(en). Enkel leden van die groep zien ze. Wie
  in drie posten zit, krijgt dus drie extra reeksen.
- **Van jou (USER).** Elk lid mag eigen tegels maken. Die zijn persoonlijk en
  komen op niemand anders zijn dashboard.

Bij de opsplitsing kregen rollen die het vroegere gecombineerde
`dashboard.manage` hadden eenmalig ook `dashboard.manageOwn`. Zo behouden hun
leden bij de uitrol het beheer over de eigen post; daarna zijn beide rechten
onafhankelijk aan- en uitvinkbaar in het rollenbeheer.

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

## Eén centrale pagina met ticketvoorwaarden

De algemene verkoopvoorwaarden horen bij VTK als verkoper, niet bij één
ticketevent. Elk evenement naar een eigen URL laten verwijzen leverde verschillende
versies, dode links en vergeten velden op. Daarom gebruikt elke ticketshop dezelfde
vaste publieke pagina op `/tickets/voorwaarden`.

- **De inhoud staat in één `Setting` onder `tickets.terms`.** Een beheerder met
  `tickets.manageAll` bewerkt de Nederlandse en Engelse Markdown en de versie via
  Admin -> Tickets -> Voorwaarden. Eventbeheerders kunnen de pagina bekijken, maar
  wijzigen niet stil de voorwaarden voor alle andere organisatoren.
- **De fallback is de bestaande VTK-pagina.** Zolang niemand de nieuwe instelling
  heeft opgeslagen, toont de route de voorwaarden uit de vroegere pagina
  `algemene-voorwaarden-ticketverkoop`, inclusief de Engelse vertaling en
  versiedatum 23 november 2025. De verhuis begint daardoor nooit met een lege
  juridische pagina.
- **Een bestelling bewaart de aanvaarde versie.** De order verwijst niet naar de
  actuele tekst, want die kan later wijzigen. Bij checkout wordt de centrale
  versiewaarde op `TicketOrder.termsVersion` gekopieerd, naast het tijdstip van
  aanvaarding.
- **De koper is standaard de eerste aanwezige.** Bij een ingelogde bestelling
  worden naam en e-mail van het profiel in het eerste ticket ingevuld. Extra
  tickets blijven leeg, zodat de gegevens van vrienden niet per ongeluk die van
  de koper overnemen.

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
  uitschrijven (`UNREGISTER_LOCK_MS` in `apps/web/lib/shift/index.ts`). De mail zegt dat er
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

## Shiften uit een sjabloon (terugkerende evenementen)

Een cantus, een fakbaravond en een TD hebben elke editie dezelfde reeks shiften.
Enkel de datum, het uur en soms de locatie verschillen. Die reeks één voor één in
het gewone shiftformulier intikken is een half uur werk waarin je gegarandeerd één
shift vergeet. `/admin/shiften/sjablonen` doet het in drie stappen: sjabloon kiezen,
de globale velden zetten, de shiften nakijken en aanmaken.

- **De sjablonen staan in de code, in `apps/web/lib/shift/templates.ts`.** Bewust geen beheerscherm
  en geen tabel in de databank: de lijst verandert hooguit een paar keer per
  werkingsjaar, en dan is een blok JSON dat mee door review gaat makkelijker te
  lezen (en terug te draaien) dan een formulier met een formulier erin. Wie een
  nieuw terugkerend evenement heeft, zet er een blok bij.
- **Een sjabloon beschrijft tijden als offsets, niet als uren.** Elke shift heeft
  `startOffsetMinutes` t.o.v. het startmoment dat je bovenaan invult (0 = de eerste
  shift, negatief = opbouw ervoor) plus een `durationMinutes`. Zo blijft één veld
  bovenaan genoeg om de hele avond te verzetten, en klopt de opbouw automatisch mee.
  Het rekenwerk gebeurt op de **wandklok**: "twee uur later" is 20:00 → 22:00, ook in
  de nacht dat de klok verzet wordt. De server leest die tijden als Belgische tijd,
  net als het gewone shiftformulier.
- **De shiftnaam komt eerst, het evenement erachter:** "Inkom - Cantus", niet
  "Cantus - Inkom". In een lijst shiften is wát je gaat doen het onderscheidende
  deel; het evenement is de context erbij. Zet je de evenementnaam leeg, dan blijft
  enkel de shiftnaam over.
- **Het sjabloon is een startpunt, geen keurslijf.** Onderaan staat elke shift
  volledig open: tijden, aantal plaatsen, bonnetjes, locatie, post, beschrijving. Een
  shift die je deze keer niet nodig hebt, vink je uit in plaats van hem te
  verwijderen; hij staat er de volgende keer weer. Een shift die enkel bij een grote
  editie hoort, staat in het sjabloon al op `enabled: false`.
- **Sommige shiften hangen aan een vaste plek, niet aan het evenement.**
  "Bijrijden" vertrekt altijd aan de loods, waar de cantus zelf ook doorgaat.
  Zo'n shift krijgt in het sjabloon een eigen `location` (of `post`) en volgt het
  globale veld bovenaan dan niet meer. In het scherm blijft ze gewoon aanpasbaar,
  met een lijntje eronder dat zegt dat ze vastgezet is: anders lijkt het een bug
  dat die ene rij niet meeging toen je de locatie bovenaan wijzigde.
- **Wat je zelf aanpast, wordt niet meer overschreven.** Verzet je daarna nog het
  globale startmoment of de locatie, dan schuiven enkel de velden mee die je nog niet
  aangeraakt hebt. Anders zou het corrigeren van één tikfout bovenaan al je
  fijnafstelling wissen; dat is precies het werk dat deze pagina moest besparen.
- **Aanmaken is publiceren.** `/shift` toont gewoon alle toekomstige shiften, er is
  geen aparte publicatiestap en dus ook geen concept-toestand. Daarom staat álle
  nakijkwerk vóór de knop, en gaat de knop pas aan als elke aangevinkte shift
  volledig is.
- **Er blijft geen band met het sjabloon achter.** De aangemaakte shiften zijn gewone
  shiften: geen `templateId` in de databank, geen "bijwerken vanuit sjabloon". Een
  reeks aanpassen of verwijderen doe je in het gewone overzicht. Een tweede knop die
  achteraf een hele reeks kan herschrijven, is een knop die op een avond met
  ingeschreven leden veel schade doet.
- **De pagina is een sneltoets op het gewone shiftformulier, geen tweede manier om
  shiften te maken.** Ze doet per shift dezelfde `POST /api/shift` als
  `ShiftEditModal`, in plaats van via een eigen server action in één keer naar de
  databank te schrijven. Dat is trager (een request per shift), maar het houdt
  validatie, rechten en de regels in het adminlogboek op één plek: komt er ooit iets
  bij het aanmaken van een shift (een melding, een sync), dan krijgt het sjabloon dat
  vanzelf mee in plaats van er stilletjes van weg te groeien.
  - De prijs is dat een reeks geen transactie is. Valt de verbinding halverwege weg,
    dan staan de eerste shiften er wel en de rest niet. De pagina stopt daarom bij de
    eerste fout, zegt hoeveel er aangemaakt zijn, en maakt bij de volgende klik enkel
    de ontbrekende aan; wat er al staat, wordt nooit een tweede keer verstuurd.
- **Een geslaagde reeks stuurt je terug naar het shiftoverzicht**, met een groene
  toast die zegt hoeveel shiften er staan. Dat is meteen de bescherming tegen
  duplicaten: je blijft niet achter op een ingevuld formulier waar een tweede klik
  of een herlaadde pagina dezelfde avond nog eens neerzet. Duplicaten zijn hier duur,
  want leden schrijven zich in op de verkeerde helft. Bij een fout blijf je wél
  staan; daar heb je het formulier nog nodig om verder te kunnen.
- **Bonnetjes zijn per deelnemer.** De samenvatting bovenaan telt daarom
  `bonnetjes × plaatsen` en noemt dat expliciet "bij volle bezetting": dat getal is
  wat de avond in het slechtste geval aan de Theokot-kassa kost.
- **Het aantal bonnetjes staat per shift, niet per sjabloon.** Een inkomshift van
  een half uur is niet hetzelfde waard als vier uur aan de vaten, dus `reward` is
  een verplicht veld op elke shift in het sjabloon. Er is bewust geen sjabloonbrede
  standaard: die maakt van "vergeten in te vullen" stil "wat het sjabloon toevallig
  zei", en dat is net het getal waar leden achteraf op terugkomen.

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

---

## Formulieren: wat de kring ermee wil, en wat we bewust niet doen

De formulierenmodule (`docs/forms.md` legt uit waar wat staat) heeft een paar
keuzes die niet uit de code volgen.

- **Anonieme inzenders kunnen hun antwoord niet bewerken.** Bewerken en concepten
  gelden enkel voor wie ingelogd is. De alternatieve weg is een bewerklink met een
  token in de bevestigingsmail, en die hebben we bewust niet gebouwd: zo'n link is
  een sleutel naar persoonsgegevens die per mail rondgaat en doorgestuurd wordt.
  Wie zijn inzending wil kunnen aanpassen, logt in; de rest dient één keer in.
- **Een formulier dat vol zit, blijft leesbaar.** Een keuzeoptie met een quotum
  verdwijnt niet wanneer ze vol is, maar staat er grijs bij met "volzet". Anders
  denkt iemand die de affiche zag dat hij op het verkeerde formulier zit. Wie de
  optie al koos vóór ze vollliep, houdt ze bij het bewerken.
- **Dubbels waarschuwen, ze blokkeren niet.** Twee inzendingen met hetzelfde
  e-mailadres kunnen legitiem zijn (iemand schrijft zijn kotgenoot mee in), en een
  harde blokkade op e-mail is toch te omzeilen met een plusadres. De tweede
  inzending komt binnen; de bevestigingspagina zegt dat er al een was.
- **Een formulier staat niet automatisch in het overzicht.** `listed` bepaalt of
  het op `/formulieren` verschijnt. Een sollicitatie- of evaluatieformulier deel
  je gericht; het blijft wel gewoon bereikbaar via zijn link, want een verborgen
  formulier is geen beveiligd formulier.
- **Formulieren horen niet in Google.** Alle formulierpagina's staan op
  `noindex`. Een formulier is een actie met een deadline, geen inhoud om te
  vinden; een verlopen inschrijving in de zoekresultaten helpt niemand.
- **De bewaartermijn staat standaard uit.** Een beheerder kan er een instellen
  (`retentionDays`), maar zonder die keuze verdwijnt er niets vanzelf. Stil
  verdwijnende inzendingen zijn erger dan een volle tabel; wie een formulier met
  gevoelige antwoorden maakt, zet de termijn zelf.
- **Bij een gewist account verdwijnen de inzendingen echt.** Bij een
  ticketbestelling volstaat het de identiteit te strippen, want die rij is een
  financieel record. Een formulierantwoord is dat niet: de persoonsgegevens zitten
  juist in de antwoorden, en een vrije tekst met een naam erin blijft anders
  gewoon staan. De quota die de inzending innam, komen weer vrij.
- **Half vertaald publiceren mag, maar niet ongemerkt.** Een beheerder mag een
  formulier bewust in één taal aanbieden; dan krijgt de andere taal een eigen
  bericht ("Sorry, dit formulier is enkel voor internationals") in plaats van een
  halfleeg formulier of een 404. Staat het formulier op beide talen terwijl er
  stukken ontbreken, dan somt het overzicht op wélke, want een waarschuwing zonder
  lijstje leidt enkel tot zoeken.
- **Voorinvullen gebeurt enkel waar de beheerder het vraagt.** Het veldtype "uit
  het profiel" vult naam, e-mail, r-nummer, studierichting of jaar in. Raden op
  basis van de veldnaam is geprobeerd en meteen fout gegaan: de vraag "Naam van je
  partner" kreeg de naam van de ingelogde bezoeker. Enkel het eerste e-mailveld
  vult zichzelf nog automatisch in.
- **Geen captcha.** Zoals bij het contactformulier: een honeypot, een limiet per
  IP en een minimale invultijd. Een captcha kost elke echte bezoeker moeite en zet
  vaak een derde partij op de pagina, voor een handvol scripts.
- **Een inzending namens iemand stuurt geen bevestiging.** Wanneer een beheerder
  een inschrijving intikt die per mail of telefoon binnenkwam, krijgt die persoon
  geen "bedankt voor je inzending"-mail: hij heeft niets ingevuld en zou zich
  afvragen wat er gebeurd is. Het formulier hoeft daarvoor ook niet open te staan.

### Een formulier op een contentpagina

Een formulier kan als paneel in een gewone CMS-pagina staan. Dat is de reden om
onze eigen formulieren te gebruiken in plaats van een Google Form: het hoort
eruit te zien alsof het bij de pagina hoort, niet alsof het eraan geplakt is.

- **Een uitgelicht paneel, geen band en geen kale sectie.** Het formulier staat
  in de tekstkolom als witte kaart met de gele accentrail: hetzelfde materiaal
  dat de huisstijl al voor een uitgelichte kaart gebruikt. Vier richtingen zijn
  bekeken. Een kale inline-sectie zonder kader las te veel als een gewone alinea
  en werd bij het scrollen gemist. Een volle navy band viel op maar kan enkel
  ónder de tekst staan (een band van rand tot rand kan niet tussen twee
  alinea's) en overheerste een korte pagina. Een inzet onderaan met een
  actiepaneel in de rail zette het formulier te ver van de tekst waar het bij
  hoort. De kaart valt op zonder de pagina over te nemen, en past even goed op
  een korte als op een lange pagina.
- **De redacteur bepaalt waar het staat, in de tekst zelf.** De markering
  `[[formulier]]` op een eigen regel in de markdown zegt waar het paneel komt;
  staat ze er niet, dan komt het onderaan. Bewust geen keuzelijst met drie
  posities in een ander paneel: de tekst weet het beste waar de inschrijving
  hoort, en een markering die je ziet staan is duidelijker dan een instelling
  die je moet gaan zoeken.
- **De rail schreeuwt dat er iets in te vullen valt.** In "Op deze pagina" krijgt
  het formulier geen gewone regel tussen de tussentitels, maar een gele knop met
  de titel en de deadline, op de plaats waar het paneel in de tekst staat. Iemand
  die de pagina opent om in te schrijven, mag daar niet naar moeten zoeken. Staat
  het formulier dicht, vol of heb je al ingediend, dan wordt die knop grijs: een
  gele "schrijf je in"-knop op een gesloten formulier is een leugen.
- **Eén formulier per pagina.** Twee panelen in dezelfde tekstkolom lezen als een
  fout, en de markering zou niet meer weten welke van de twee ze aanwijst.
- **Een formulier verhuist niet, het staat er ook.** `/formulieren/<slug>` blijft
  gewoon werken. De affiche met de QR-code, de link in een mail en de lijst op
  `/formulieren` mogen niet breken omdat iemand het formulier ergens ook op een
  pagina zet.
- **Na het versturen blijf je op de pagina staan.** De bedanking komt in het
  paneel zelf. Doorsturen naar de bedanktpagina van het formulier haalt de
  bezoeker weg van de pagina waar hij naartoe kwam, en dat is precies het
  "aangeplakt"-gevoel dat we wilden vermijden.
- **Een concept laat het paneel weg, het weigert de pagina niet.** De tekst
  eromheen hoort er gewoon te staan. Wie het formulier beheert, ziet het concept
  wel, met de voorbeeldmelding erbij.
- **Koppelen is de pagina bewerken.** Vanaf beide kanten (bij de instellingen van
  het formulier, en op de pagina zelf) geldt dezelfde regel: je hebt de
  bewerkrechten van die pagina nodig én het beheer van dat formulier. Anders kan
  iemand met paginarechten het concept van een andere post online zetten, of kan
  een formulierbeheerder zijn inschrijving op een willekeurige pagina laten
  verschijnen.

### Springen en wachtlijsten (aanvulling op de formulierenmodule)

- **Springen kan enkel wanneer de secties stap voor stap komen.** Naar een
  sectie verderop springen heeft geen betekenis wanneer alles toch al op één
  pagina staat, dus `stepBySections` is een aparte instelling en geen automatisme.
  Zo blijft een kort formulier ook gewoon één pagina, want dat leest sneller.
- **Een sprong die het formulier beëindigt, is een volwaardige uitkomst.** "Kom
  je? Nee" hoort niet door te gaan naar de vragen over het menu. De bezoeker
  krijgt dan meteen de verzendknop, en de vragen die hij oversloeg zijn ook
  serverside niet verplicht.
- **Een wachtlijst claimt geen plaats.** Dat is het hele punt: de teller blijft
  kloppen met wie er echt binnen mag. Een beheerder haalt iemand er handmatig
  bij, en die actie probeert het quotum op dat moment alsnog te nemen; is het nog
  vol, dan blijft de inzending staan waar ze stond.
- **Automatisch opschuiven doen we niet.** Zodra een plaats vrijkomt de eerste
  van de wachtlijst binnenlaten klinkt logisch, maar dan hoort er ook een mail
  bij, een termijn om te bevestigen, en een regel voor wie niet reageert. Dat is
  een eigen systeem; handmatig opschuiven met een knop is voor een kring van deze
  grootte genoeg.
- **Zit één keuze vol, dan claimt de hele inzending niets.** Wie drie shiften
  aanduidt waarvan de tweede vol zit, komt volledig op de wachtlijst in plaats van
  twee plaatsen te bezetten en voor de derde te wachten. Half ingeschreven zijn is
  voor niemand bruikbaar.

## De onboarding en de jaarlijkse bevestiging zijn te bekijken onder Admin → IT

De twee gates uit `proxy.ts` zijn de enige schermen die een lid precies één keer
ziet. Daardoor is er geen manier om te controleren of ze nog kloppen: je eigen
account is al onboarded, en het werkingsjaar rolt maar één keer per jaar om. Wie
het toch wou zien, moest een testaccount aanmaken of `onboardedAt` in de database
op null zetten, en dat laatste is precies hoe je per ongeluk je eigen profiel
wist.

`/admin/it/flows` (superadmin) toont per gate wanneer hij afgaat, wat de eigen
staat van de kijker is (`onboardedAt`, `isStudent`, `studyConfirmedYear`, het huidige
academiejaar en de eerstvolgende omslag op 27 september), en het formulier zelf.

Dat is bewust **het echte formulier**, met een opslaan-actie die niets bewaart
(`previewNoopAction`). Een nagebouwde kopie zou vroeg of laat afwijken van wat een
nieuw lid werkelijk ziet, en dan is de voorvertoning erger dan geen
voorvertoning. `ProfileForm` heeft daarvoor een optionele `action`-prop; de
studiebevestiging hergebruikt hetzelfde `StudyFieldset` met dezelfde
`name`-attributen.

---

## Adminlogboek: wie deed wat in het beheer

Elke wijzigende beheerdersactie schrijft één regel in `AdminAuditLog`, te lezen op
`/admin/it/logboek`. De helper staat in `apps/web/lib/audit.ts`; de call sites zitten
in de server actions (`apps/web/app/actions/*`) en in de mutatie-endpoints van shiften
(`apps/web/app/api/shift/*`).

- **Het antwoord op "wie heeft dit gedaan" hoort op één plek te staan.** Er waren al
  logboeken per module (`TicketAuditLog`, `FormAuditLog`, `SsoAuditLog`,
  `UitleenAuditLog`, `DoorAccessLog`), maar die vertellen elk hun eigen verhaal en je
  moet vooraf weten waar je moet kijken. Het adminlogboek is de dwarsdoorsnede: elke
  tab, één tabel, één zoekbalk. De modulelogs blijven bestaan; ze staan dieper in
  detail en hangen aan het event of het formulier zelf.
- **Enkel wijzigende acties.** Aanmaken, wijzigen, verwijderen, publiceren, toegang
  geven of afnemen, en versturen. Lezen, exporteren, zoeken en de testknoppen in de
  IT-tab staan er niet in: die veranderen niets, en een logboek dat volloopt met
  paginabezoeken beantwoordt de vraag waarvoor het bestaat niet meer.
- **Zelfbediening van een lid staat er niet in.** Je eigen profiel, je eigen
  dashboardtegels, je eigen piano- of broodjesreservatie, je eigen deur-snelkoppeling:
  dat is geen beheer. Wat een beheerder mét dat lid doet (een reservatie schrappen, een
  ban zetten, een bestelling corrigeren) staat er wel in.
- **De balie van Theokot staat er bewust niet in.** Een broodje afvinken als opgehaald
  gebeurt tientallen keren per middag en staat al op de bestelling zelf
  (`pickedUpById`). In het logboek zou het al de rest wegdrukken. Correcties achteraf
  (status rechtzetten, ban opheffen) staan er wél in: dat is precies het geval waarin
  iemand achteraf vraagt wie dat deed.
- **Dertig dagen, daarna weg.** Het is een logboek, geen archief. Zolang wordt de vraag
  "wie heeft dat vorige week aangepast" gesteld; daarna is het vooral een verzameling
  namen naast handelingen. `logAudit` snoeit hoogstens één keer per uur per proces en de
  logboekpagina snoeit bij het openen, dus er is geen cron voor nodig.
- **Namen worden meegekopieerd, niet opgezocht.** De regel bewaart de naam van de
  handelende persoon én van het onderwerp zoals ze op dat moment waren. Een verwijderd
  evenement of een uitgetreden lid mag een regel niet onleesbaar maken, en een
  foreign key naar het onderwerp zou de regel mee weggooien.
- **De echte actor, niet de gespeelde.** Staat een superadmin in
  autorisatievoorbeeld-modus, dan noteert het logboek wie het écht deed. De vraag is
  wie handelde, niet in wiens rechten die persoon aan het kijken was.
- **Zichtbaar met `audit.view`, niet enkel voor superadmins.** Het staat onder de
  IT-tab omdat IT de vraag krijgt, maar het is een gewone permissie zodat ze aan een
  rol gehangen kan worden zonder iemand superadmin te maken. Het logboek toont geen
  inhoud, enkel wie wat wanneer aanraakte.
- **Een mislukte logregel breekt de actie niet.** `logAudit` vangt zijn eigen fouten op
  (en meldt ze aan Sentry). Een opslaan dat lukt maar een logregel die faalt, mag geen
  rode toast geven; andersom zou het logboek belangrijker worden dan het werk zelf.

## 24urenloop-app: gedeeld met kringen, niet met het internet

De 24urenloop-app (scorebord en wisselaars, `VTKLeuven/24urenloop-new`) is
gebouwd door VTK maar wordt gedeeld met andere kringen die aan de 24urenloop
meedoen. De repository staat sinds augustus 2026 op privé omdat we niet willen
dat concurrenten hem draaien, en daarmee waren de GitHub-downloadlinks meteen
een 404 voor precies de mensen voor wie ze bedoeld waren.

De keuze is dus: **wie de app krijgt, is een lijst die wij bijhouden**, en die
lijst staat op onze eigen website in Admin -> IT -> 24UL App Download.

- **Op e-mailadres, niet op `User`.** De gebruikers zijn andere kringen, geen
  VTK-leden. Ze een account op onze site laten maken om een installatiebestand te
  halen is een drempel voor iets wat ze één keer per jaar doen, en het zou ons
  ledenbestand vervuilen met mensen die geen lid zijn.
- **Een code per mail, geen wachtwoord.** Er is geen account om een wachtwoord bij
  te bewaren, en een gedeeld wachtwoord lekt: dat wordt doorgestuurd en staat
  binnen het jaar in een groepschat. Een code die één uur geldig is en één keer
  werkt, bewijst dat iemand op dat moment bij die mailbox kan.
- **De pagina zegt nooit of een adres op de lijst staat.** Zou ze dat wel doen,
  dan is het formulier een manier om uit te zoeken welke kringen de app hebben.
  Dat is precies de informatie die we niet publiek willen.
- **Na de code een dag toegang.** Een kring zet de app op de laptop van de
  wissel, van de tijdsopname en van de stand; drie keer een code aanvragen is
  gedoe zonder dat het iets veiliger maakt.
- **Iemand verwijderen werkt meteen.** Openstaande codes van dat adres worden mee
  verwijderd, en de downloadroute kijkt bij elke klik opnieuw of het adres nog op
  de lijst staat. Zonder dat zou een verwijderde kring nog een dag kunnen
  downloaden.

**Wat dit bewust niet oplost:** wie de app eenmaal heeft, kan het bestand
doorsturen. De poort bepaalt wie hem een eerste keer krijgt, niet wie hem draait.
Dat echt afdwingen zou betekenen dat de app zelf bij ons moet aankloppen voor hij
start, en dat is een app die tijdens een evenement zonder internet niet meer
opstart; precies het scenario waar de app juist voor gebouwd is (hij draait
volledig lokaal, inclusief zijn eigen database).

De **Windows-app haalt zijn updates op met een eigen token**, want een updater
kan geen mail lezen en geen code intikken. De app koppelt zich daarom één keer
per computer: hetzelfde adres, dezelfde code, en daarna een token dat bij elke
controle meegaat.

Waarom niet gewoon één geheim in de app bakken, wat veel minder werk was? Omdat
je dat niet per kring kan intrekken. Eén gedeeld geheim betekent dat een kring
uitzetten iedereen uitzet, en dan is de knop in de admin een knop die je nooit
durft te gebruiken. Een token per computer hangt aan één adres, dus intrekken
doet precies wat het belooft.

De prijs is een extra stap bij het installeren, en een computer die je vergeet te
koppelen ziet er hetzelfde uit als een die werkt. Daarom noemt het menu-item zijn
eigen toestand ("nog niet gekoppeld") en schrijft de app het bij elke start in
zijn log. Koppelen is nooit verplicht: zonder token werkt alles behalve het
automatisch bijwerken, en dat is bewust; een event-laptop mag niet afhangen van
onze website om op te starten.

Zie `DESKTOP_APP.md` in de app-repository voor de technische kant.

**Eén versie tegelijk in de opslag.** De CI schrijft naar vaste sleutels onder
`24ul-app/`, dus elke build overschrijft de vorige. Er is geen archief van oude
versies in de objectopslag: dat zou met elke push aangroeien met een halve
gigabyte, en wie echt terug moet kan bij de GitHub-release van die versie.

## Gedeelde wachtwoorden per post

Elke post heeft wachtwoorden die het hele jaar in Drive-documenten en
Messenger-berichten rondslingeren, en die bij de wissel op 15 juli niemand
systematisch intrekt. De kluis lost dat op met precies dezelfde regel als de rest
van de site: wie dit werkingsjaar in de post zit, ziet ze; wie eruit gaat, niet
meer. Er is geen aparte administratie en geen cron die "het jaar omzet";
`GroupMembership` staat per jaar en de synchronisatie leest enkel het huidige.

**We hosten Vaultwarden, niet Passbolt.** Passbolt was de eerste vraag, maar de
twee dingen die we nodig hadden, kosten daar samen het meest. SSO is er Pro-only
(~EUR 4,5/gebruiker/maand), en de automatische toegang die we willen, kan
Passbolt zelf niet: daar is elk wachtwoord apart versleuteld per gebruiker, dus
elke lidmaatschapswijziging vereist het herversleutelen van alle secrets van die
groep. Hun eigen LDAP- en SCIM-provisioning weigert dat expliciet ("group
managers must manually share credentials"). Bij Vaultwarden zijn items versleuteld
met één organisatiesleutel, is lidmaatschap dus gewone metadata, en zit OIDC-SSO
gratis in upstream sinds 1.35.0.

**De wachtwoorden worden in de VTK-admin beheerd én in de gewone
Bitwarden-clients gebruikt.** Dat is geen compromis tussen twee opties maar een
gevolg van dat crypto-model: de admin heeft de organisatiesleutel en schrijft
daarmee in hetzelfde formaat dat de browser-extensie en de mobiele apps al lezen.
Wij bouwen dus geen kluis en geen extensie; we schrijven items. Eén bron, twee
ingangen.

**De server kan elk gedeeld wachtwoord lezen.** Dat volgt onvermijdelijk uit de
vorige twee keuzes: een admin-tab die wachtwoorden toont en een sync die zelf
toegang uitdeelt, werkt alleen met de sleutel op de server. Persoonlijke kluizen
blijven wel buiten bereik; die hangen aan het master password van het lid.

Daarom hoort wat écht kritiek is (domeinregistrar, root-toegang, bankzaken) in
een **tweede Vaultwarden-organisatie waar het botaccount geen lid van is**. Die
sleutel staat dan nergens op onze server en die organisatie beheer je met de hand
in de client. Die splitsing is nu goedkoop en later duur om te forceren.

**Enkel gekoppelde posten.** Een post krijgt pas accounts wanneer IT hem koppelt
in `/admin/wachtwoorden/beheer`. Niet elk lid met een post heeft een kluis nodig,
en een uitnodiging naar iemand die nooit een wachtwoord zal zien is ruis.

**Uitstroom haalt het organisatielidmaatschap weg, niet het account.** "Toegang
verwijderen" en "account verwijderen" zijn hier niet hetzelfde: aan dat account
hangt ook de persoonlijke kluis van dat lid, en die is van hen, niet van VTK. Het
lidmaatschap verwijderen haalt élk VTK-wachtwoord bij hen weg, wat is wat we
bedoelen. Komen ze het jaar daarop in een andere gekoppelde post, dan hoeven ze
hun sleutelpaar niet opnieuw op te zetten.

**Uitgenodigd is een wachtstand, geen fout.** Een lid dat nog nooit ingelogd
heeft, heeft geen publieke sleutel en kan dus niet bevestigd worden: er is niets
om de organisatiesleutel naartoe te versleutelen. De sync probeert het elke ronde
opnieuw en het beheerscherm noemt dat met zoveel woorden ("wacht op eerste
login"), zodat IT niet gaat zoeken naar een storing die er niet is.

**Er blijft naast SSO een master password nodig.** Dat is geen tekortkoming van
deze keuze: bij Passbolt is het net zo, en daar komt nog een sleutelpaar-setup
bij. Het alternatief (Bitwarden Key Connector) is Enterprise en werkt niet op
Vaultwarden.

Technische kant: `docs/wachtwoorden.md`.

## Kaartcheck-in aan een cantus

Aan een cantus wil de deurploeg tweehonderd man binnen krijgen zonder dat
iedereen zijn mail openzoekt op een telefoon met één streepje bereik. Daarom kan
per event de **studentenkaart** de QR vervangen: dezelfde lezer als aan de
Theokot-balie, dezelfde `resolveStudentCard`. Technische kant:
`docs/ticketing.md`.

**Het r-nummer komt enkel van de ingelogde koper.** Het alternatief was het per
deelnemer verplicht te maken in het bestelformulier. Dat is bewust niet gekozen:
het legt een extra verplicht veld op elke aankoop, ook bij de evenementen waar de
kaart nooit gebruikt wordt, en wie voor vrienden koopt kent hun r-nummer zelden
uit het hoofd. De prijs is bekend en aanvaard: wie vier tickets koopt, levert
één regel met een r-nummer en drie zonder. Die drie gaan met de QR binnen of
krijgen hun nummer bijgevuld op de deelnemerspagina. De kaart is dus een snelle
weg naast de QR, geen vervanging ervan; een cantus met veel groepsbestellingen
moet dat weten voor de deur opengaat.

**Het r-nummer verdwijnt bij het archiveren.** Na het event heeft het geen
functie meer, en een ticketdatabase is niet de plek voor een blijvende koppeling
tussen een naam en een KU Leuven-nummer. Het archiveren van een event wist ze
allemaal; bestellingen, tickets en het scanlogboek blijven staan. Om dezelfde
reden staat er nooit een r-nummer of kaartnummer in `TicketScanLog`: dat logboek
overleeft het archiveren en zou het wissen anders stilletjes ongedaan maken.

**Kleur zegt welk ticket, niet of het geldig is.** Een cantus heeft drie
standaardtypes (water, bier, eigen drank) en wie tapt moet dat van drie meter
zien. Daarom kleurt een aanvaarde scan het scherm in de kleur van het tickettype,
met de naam van het type als grootste woord. Maar de bestaande betekenis van
kleur in de scanner (groen/oranje/rood = de uitkomst) blijft de baas: bij een
dubbele of geweigerde scan overrulen oranje en rood de typekleur volledig. Een
geweigerd bierticket dat geel oplicht, gaat binnen. En omdat een op de twaalf
mannen rood en groen niet uit elkaar houdt, staat het oordeel er altijd ook als
tekst.

**De kleur is een keuze uit een palet, geen vrije kleurkiezer.** Dat vlak is een
halve telefoon groot in een donkere zaal; een zelfgekozen pastel of een tweede
tint groen naast het groen van "aanvaard" is daar vroeg of laat onleesbaar.

## Wie mag scannen aan de deur

Voorheen kon je een event enkel scannen wanneer er expliciet een toekenning voor
je stond. Aan een deur klopt dat niet: de ploeg van een fuif is zelden precies de
post die het event aanmaakte, en wie om tien uur komt bijspringen moest eerst
iemand met OWNER vinden die op een adminpagina een grant toevoegde. Dat gebeurt
niet; er scant dan gewoon iemand anders met zijn eigen account, en dan klopt het
scanlogboek niet meer.

**De regel nu.** Elke praesidiumpost kan elk event scannen. Een werkgroep is
smaller: die kan enkel de events van haar eigen werkgroep. Een post mag dus wel
de events van een werkgroep scannen, maar niet omgekeerd.

Dat asymmetrische zit er bewust in. Een post is deel van de dagelijkse werking van
de kring en staat sowieso al eens aan andermans deur; een werkgroep is een aparte
ploeg rond één ding en heeft geen reden om bij de deelnemerslijst van een cantus
te kunnen.

**Wat je hiermee aanvaardt: wie kan scannen, ziet de namen van alle deelnemers.**
Dat is geen slordigheid maar een gevolg van het offline scannen: het manifest met
die lijst gaat mee naar het toestel, anders werkt de scanner niet in een kelder of
een tent. Voor een gastenlijst die niet bij het hele praesidium hoort te liggen
(een gala met externen, iets van alumni) zet je de schakelaar **Standaard
scantoegang** op `/admin/tickets/<event>/toegang` uit; dan telt enkel wie een
expliciete toekenning heeft.

**Mensen van buiten het praesidium** voeg je toe met de knop *Scanners* in de
scanner zelf, op het web en in de native app, door te zoeken op naam, e-mail of
r-nummer. Dat r-nummer staat op hun studentenkaart, en dat is aan een deur het
enige wat je van iemand zeker weet. Die weg kan enkel de rol `SCANNER` geven en
weghalen; alle andere rollen blijven achter het toegangstabblad in het beheer.

Wie dat mag, is de capability `MANAGE_SCANNERS`: `OWNER` en `MANAGER`, dus ook de
leads van de post die het event organiseert, plus IT via `tickets.manageAll`. Ze
bestaat apart van `MANAGE_ACCESS` omdat een MANAGER wél een deurploeg moet kunnen
samenstellen maar niet het eigenaarschap of de financiële rollen van een event
moet kunnen verzetten.

### Scannen geeft niets in de admin

De rol `SCANNER` droeg aanvankelijk ook `VIEW_EVENT`, en dat is net de capability
die het event-dashboard in de admin bewaakt. Gevolg: iedereen die mocht scannen,
kon `/admin/tickets/<event>` openen, en met de regel hierboven gold dat voor élk
praesidiumlid op élk event. Dat is niet wat we bedoelden met "mag scannen".

`SCANNER` draagt daarom enkel `SCAN`. De scanner zelf heeft `VIEW_EVENT` nergens
nodig; enkel het beheer gebruikt ze. Om dezelfde reden telt kunnen scannen niet
mee in `canAccessAnyTicketEvent()`, want die bepaalt of de **Tickets-tab** in de
adminnavigatie verschijnt. Wie enkel scant, ziet `/scan` en verder niets.

### De uitnodigings-QR

Aan een deur is een naam intikken traag en een r-nummer vragen omslachtig. Wie
`MANAGE_SCANNERS` heeft, kan daarom een **QR tonen** in de scanner (web en app).
Wie ze scant, logt in met zijn eigen VTK-account en heeft daarna scanrechten op
dat ene event; heeft hij de app, dan staat het event er vanzelf in, want dat volgt
uit de toekenning.

**De code rolt.** Het token leeft dertig seconden en het paneel haalt om de twintig
seconden een nieuwe op. Dat maakt een screenshot of een foto in een groepschat
waardeloos: tegen dat iemand ze doorstuurt, is de code dood. Wees eerlijk over de
grens: wie de code *binnen* die seconden doorstuurt, geraakt er wel mee binnen.
Dat geldt voor elke code die je aan een zaal toont, en de uitkomst is hoe dan ook
niet erger dan wat de standaardregel al toelaat: scannen, en niets anders.

Er is bewust geen tabel voor die uitnodigingen. Een token dat dertig seconden
leeft, hoef je niet te kunnen intrekken; het formaat staat in
`lib/ticketing/crypto.ts` naast de andere ondertekende tokens.

---

## Wanneer de app een pushbericht stuurt

De VTK-app kan pushberichten sturen. Dat is een kanaal dat rechtstreeks op de
telefoon van een lid landt, ook 's avonds, en dat je niet kan terugnemen. De
keuze wanneer dat gerechtvaardigd is, is een kringkeuze en geen technische; ze
staat daarom hier en niet in de code. De implementatie zit in
`apps/web/lib/app-api/notifications.ts`.

**De regel: een pushbericht gaat over iets dat je moet dóén, en dat anders
misloopt.** Nieuws is geen pushbericht. Een nieuwe fotoalbum, een aankondiging op
de homepage of een nieuwe activiteit in de kalender halen die drempel niet: wie
dat wil weten, opent de app. Een bericht dat niets van je vraagt, leert mensen
alleen om berichten weg te swipen, en dan mist ook het bericht dat er wél toe
doet.

Wat er vandaag vanzelf vertrekt:

- **"Je broodje ligt klaar"**, op het moment dat de afhaal bij het Theokot
  opengaat. Dit is de duidelijkste: je hebt betaald noch opgehaald, de deadline
  voor no-shows loopt, en drie no-shows leveren een schorsing op. Bewust op het
  openen van de afhaal en niet 's ochtends: een bericht een uur te vroeg stuurt
  iemand naar een gesloten deur.
- **"De broodjes staan open"**, wanneer een nieuwe bestelronde begint. Dit is het
  enige bericht dat naar iedereen met de app gaat in plaats van naar een handvol
  mensen die iets openstaan hebben, en dat verdient uitleg. Het haalt de drempel
  omdat een gemiste ronde betekent dat je die dag geen lunch hebt, en omdat de
  besteldeadline uren voor het eten ligt: wie het pas 's middags leest, is te
  laat. De prijs is een bericht per verkoopdag; wie dat te veel vindt, zet het uit
  onder Meer → Meldingen.
- **Een herinnering aan een shift**, een dag en twee uur vooraf. Die vertrekt
  **samen met de bestaande herinneringsmail** en binnen dezelfde markering, niet
  als een tweede systeem. "De herinnering voor dit venster is afgehandeld" hoort
  één ding te betekenen; twee wekkers voor één herinnering lopen vroeg of laat
  uit elkaar.
- **Een herinnering aan een evenement waar je een ster bij zette**, een dag
  vooraf. Je hebt er zelf om gevraagd door het aan te duiden, en een dag vooraf is
  het moment waarop je er nog iets aan kan doen: een ticket kopen, je avond
  vrijhouden, met iemand afspreken. Een kwartier vooraf is een verwijt.
- **"Nieuw in een categorie die je volgt."** Dit is de bewuste uitzondering op de
  regel hierboven, want dit ís nieuws. Het mag omdat een lid er zelf om vraagt,
  **per categorie**, en het met één tik weer uit kan. Iemand die "Cantus" volgt,
  heeft gezegd dat hij dat wil weten; dat is iets anders dan een kring die
  besluit dat iedereen het wil weten. Enkel wat de laatste 24 uur gepubliceerd is
  telt mee, en de doelgroepfilter geldt ook hier.

Wat er bewust **niet** vanzelf vertrekt, en waarom:

- **Tickets die in verkoop gaan.** Verleidelijk, maar het is het duidelijkste
  voorbeeld van een bericht dat commercieel aanvoelt in plaats van behulpzaam.
  Wil een post dat toch voor één groot event, dan kan dat met de hand via
  Admin → Pushberichten. Wie een evenement aanduidde, krijgt sowieso al zijn
  herinnering.
- **Een nieuwe aankondiging.** Die staat al als venster over de homepage en in de
  app op het hoofdscherm; een push erbovenop is hetzelfde bericht een tweede keer.

**Elk soort bericht is per lid uit te zetten** (Meer → Meldingen). Enkel
afwijkingen worden bewaard, dus een nieuw soort bericht heeft vanzelf de juiste
standaard voor iedereen die al bestond. Dat scherm zegt er ook bij dat de
toestemming van de telefoon een laag erboven is: staat die uit, dan komt er niets
binnen, hoe de schakelaars ook staan.

**Met de hand sturen kan, achter het recht `app.push`.** Dat scherm is klein
gehouden met opzet: je kiest iedereen of één post, en de knop zegt naar hoeveel
toestellen het gaat. Er is geen vrije selectie en er zijn geen segmenten; hoe
fijner de knoppen, hoe makkelijker je de verkeerde indrukt. Elke verzending komt
in het logboek met de tekst erbij.

**Toestemming wordt in de app niet bij de eerste start gevraagd**, maar via een
knop onder Meer → Meldingen met een zin erbij die zegt waarover het gaat. Een
systeemvenster meteen na het installeren wordt weggeklikt, en op iOS is dat
definitief: wie één keer weigert, moet daarna naar de systeeminstellingen van zijn
telefoon.

---

## De ster op een evenement is geen inschrijving

In de app staat bij elk evenement een ster: "ik ga hier waarschijnlijk naartoe".
Ze doet drie dingen en niet meer: het evenement verschijnt in je eigen lijst
(Kalender → Mijn lijst), je krijgt een dag vooraf een bericht, en de teller op de
detailpagina gaat één omhoog.

**Wat ze uitdrukkelijk niet doet is een plaats reserveren.** Dat onderscheid is
geen semantiek: wie denkt dat hij ingeschreven is, koopt geen ticket en vult geen
formulier in, en staat dan voor een uitverkochte zaal met een sterretje in zijn
telefoon. Daarom staat de ster in de app naast de rij en niet als hoofdactie, en
staat er onder een aangeduid evenement letterlijk "Dit is geen inschrijving en
geen ticket".

De teller (`interestedCount`) draagt **geen namen**. Hij is er om te zien of er
volk komt, en dat is precies zoveel als een ster mag beloven; een deelnemerslijst
zou hem tot een belofte maken die hij niet is. De enige uitzondering staat
hieronder bij de alumniwerking, en die is expliciet opt-in per evenement.

Een aangeduid evenement blijft in je lijst staan ook wanneer het buiten je
doelgroep valt. Iemand die in september eerstejaarsactiviteiten aanduidde en in
oktober zijn studiejaar bijwerkt, hoort ze niet zonder uitleg te zien verdwijnen.

### Dezelfde ster staat sinds augustus 2026 ook op de website

`/kalender/<id>` heeft een knop "Ik kom naar dit evenement" die in dezelfde
`CalendarEventInterest`-tabel schrijft. Wie in de app op de ster tikt en op de
site kijkt, krijgt dus geen twee verschillende antwoorden.

**De teller verschijnt pas vanaf 30 geïnteresseerden** (`INTEREST_PUBLIC_THRESHOLD`
in `lib/calendar/interest.ts`). Dat getal is een kringkeuze en geen technische
grens: onder die drempel zegt een getal het verkeerde. "3 mensen komen" leest als
"hier komt niemand" en houdt precies de mensen weg die je wou overtuigen; boven de
drempel keert dat om en werkt het als aanmoediging. Een laag getal verlaat de
server daarom niet eens: `publicInterestCounts()` geeft die rijen gewoon niet
terug, zodat het ook niet per ongeluk ergens opduikt.

De teller staat op vier plekken en overal met dezelfde drempel: de heroagenda en
de kaarten op de homepage, het kalenderraster, de voorvertoning bij een klik, en
de eventpagina zelf.

---

## Alumniwerking

Alles hieronder bestaat voor één doel: meer alumni op onze evenementen krijgen.
De rest volgt daaruit, en dat verklaart een paar keuzes die er los van elkaar
raar uitzien.

### Een tweede deur naast KU Leuven SSO

Studenten registreren zichzelf door voor het eerst met KU Leuven SSO in te loggen
(zie "Ledenregistratie & onboarding" hierboven). Een alumnus van 2004 kan dat
niet: zijn KU Leuven-account bestaat niet meer. Zolang SSO de enige deur was, kon
hij zich dus letterlijk nergens voor inschrijven.

- `/registreren` maakt een account met **e-mail en wachtwoord**. De implementatie
  staat in `packages/auth/src/server/selfSignup.ts`, bewust **niet** via
  better-auths `signUpEmail`: die staat uit (`disableSignUp: true`) en aanzetten
  zou `/api/auth/better/sign-up/email` openzetten voor iedereen, buiten elke
  controle die wij doen.
- **Het adres moet bevestigd worden.** `AccountEmailToken` draagt de eenmalige
  link (enkel de hash bewaard, zoals bij `CalendarFeedToken`). `selfRegisteredAt`
  is het veld dat zegt dat `emailVerified` hier iets betekent: voor een account
  dat een beheerder aanmaakte of dat via SSO binnenkwam, betekent het niets, en
  daarop gaan gaten zou elke bestaande admin buitensluiten.
- **De inlogfout verklapt niets.** `checkLoginBlocked` geeft enkel `UNVERIFIED`
  wanneer het wachtwoord klópte; anders is het gewoon `INVALID`. Hetzelfde geldt
  voor het registratieformulier en voor "wachtwoord vergeten": een adres dat al
  bezet is, levert exact hetzelfde scherm op als een geslaagde registratie.
  Anders is dat formulier een manier om onze ledenlijst af te tasten.
- **Zo'n account is een gewoon lid.** Geen aparte status, geen beperkte rechten.
  Wat aan de faculteit hangt (ledenkorting) volgt uit de KU Leuven-attributen
  (`firwStudent`, uit `eduPersonOrgUnitDN`), en die heeft dit account nu eenmaal
  niet; dat is de bestaande regel en niet iets nieuws.
- Er is ook een **wachtwoord-vergeten**-flow (`/wachtwoord-vergeten`), want zonder
  SSO is er anders geen enkele weg terug. Enkel voor accounts die een wachtwoord
  hébben: wie via KU Leuven binnenkomt, wordt daar expliciet naar het inlogscherm
  teruggestuurd in plaats van een mail te krijgen die zijn probleem niet oplost.

### Van KU Leuven naar een wachtwoord: het migratiepad

Wie via KU Leuven binnenkomt heeft hier geen wachtwoord, en dat is prima zolang
die login werkt. Maar een KU Leuven-account verdwijnt een tijd na het afstuderen,
en op dat moment is er geen enkele manier meer om binnen te geraken: geen
wachtwoord om mee in te loggen, en een herstelmail zou naar een mailbox gaan die
niet meer bestaat. Dat is precies de groep die we op onze evenementen willen.

Drie stukken, samen het pad:

- **`/account` heeft een paneel "Inloggen zonder KU Leuven"** waar een lid zelf
  een wachtwoord zet (`setOwnPassword`). Het toont ook waarmee je inlogt en waar
  een herstelmail heen zou gaan. Bewust géén huidig wachtwoord vereist: verreweg
  de meesten hebben er nog geen, en wie er wel een heeft zit achter een geldige
  sessie.
- **Het paneel dringt aan wanneer het nodig wordt.** Wie zichzelf als alumnus of
  als niet-meer-studerend aanduidde en nog geen wachtwoord heeft, krijgt het met
  een gele accentrail en opengeklapt; de rest ziet een gewone kaart.
- **De herstelmail gaat naar het persoonlijke adres** wanneer dat ingevuld is, en
  je kan **met dat adres ook inloggen** (`resolveLoginEmail`). Zonder dat laatste
  is het een val: je herstelt een wachtwoord via je persoonlijke adres en geraakt
  er vervolgens niet mee binnen, want `User.email` blijft het KU Leuven-adres.
  Enkel wanneer het persoonlijke adres precies één account aanwijst; botst het,
  dan faalt de login als een gewone foute login. Raden doen we hier niet.

### Het inlogscherm is één knop, met een regeltje eronder

Verreweg de meeste bezoekers zijn student. Twee even grote formulieren naast
elkaar zetten betekent dat de helft van hen eerst een wachtwoord probeert te
verzinnen dat niet bestaat. Dus: één grote knop "Inloggen met KU Leuven
Authenticator", en daaronder in het klein "Geen KU Leuven student (meer): klik
hier", dat het e-mailformulier openklapt met daarin de link naar registratie en
naar wachtwoord vergeten. Staat SSO uit (geen env-vars), dan staat dat formulier
gewoon open; er valt dan niets te verbergen.

### Ereleden

Een alumnus kan door een beheerder als **erelid** aangeduid worden
(`User.honoraryMember`, op `/admin/gebruikers/<id>`; nooit door het lid zelf).
Daarmee ziet hij ticketsoorten met `TicketAudience.HONORARY`, bijvoorbeeld
gratis naar een cantus.

Zo'n ticketsoort wordt voor iedereen anders **weggefilterd**, niet uitgegrijsd.
Wat de kring aan haar ereleden geeft, hoort geen zichtbare uitzondering te zijn
waar de rest van de site zich vragen bij stelt; wie geen erelid is, ziet gewoon
het gewone aanbod. `createTicketCheckout` weigert zo'n type ook serverside, met
dezelfde fout als bij een onbestaand type.

### "Ik kom" zonder account, maar enkel bij een alumni-evenement

Bij een evenement met de alumni-doelgroep kan iemand **zonder account** aanduiden
dat hij komt (`CalendarEventGuestInterest`). Bij elk ander evenement kan dat niet:
daar is interesse een ledenmarkering, en een anonieme rij zou de teller waardeloos
maken.

De prijs van die openheid is dat de bezoeker iets over zichzelf zegt: een
afstudeerjaar, of dat hij in VTK zat, of allebei. **De naam is optioneel**: "iemand
van 2004 die in VTK zat komt ook" is al genoeg om een andere alumnus over de
streep te trekken. Een volledig lege rij wordt geweigerd, want die verhoogt enkel
een teller zonder iemand iets te vertellen.

Een cookie (alleen de hash bewaard) laat de bezoeker zijn keuze terugnemen en
houdt dubbele klikken van hetzelfde toestel tegen. Dat is geen waterdichte
fraudebescherming, en die bestaat ook niet zonder login; het is de bewuste ruil
voor het wegnemen van de drempel.

### De aanwezigheidslijst is publiek, en dat is het punt

Op een alumni-evenement staat een tabel met wie er komt: naam, afstudeerjaar, en
of die persoon ooit in VTK zat. **Alleen wie zelf een vakje aanvinkte staat erin**
(`showName` / `showGraduationYear` / `showWasInVtk` op `CalendarEventInterest`,
alle drie standaard uit). Wie enkel "ik kom" duidt, telt mee in het getal en
verschijnt nergens.

De lijst is publiek zichtbaar, ook voor wie niet ingelogd is. Dat is een bewuste
kringkeuze: het domino-effect is de hele reden dat dit bestaat. Een alumnus
beslist te komen wanneer hij ziet dat hij er iemand gaat kennen, en die
overtuiging moet werken vóór hij een account maakt, niet erna.

De drie vlaggen staan **per evenement** en niet op het profiel: "ik wil zichtbaar
zijn op de reünie van mijn eigen lichting" is iets anders dan "ik wil altijd en
overal met naam op de website staan".

### Het adresboek staat naast de opt-in-nieuwsbrieven, niet erin

De mailinglijsten uit `lib/mailinglists.ts` zijn studiegericht: ze eisen een
de expliciete status Student plus een studiebevestiging van het huidige
academiejaar. Een alumnus zonder studentstatus valt daar dus per definitie uit.

Daarom een eigen bron, met twee helften die pas bij de export samenkomen:

- **`AlumniContact`** (`/admin/alumni`, permissie `alumni.manage`): namen die de
  kring van reünies, oud-praesidia en inschrijvingslijsten overhoudt, zonder
  account. Per lichting te beheren, met een plakvenster voor een geëxporteerde
  lijst; zonder dat is vijfhonderd alumni invoeren een middag typen, en dan
  gebeurt het niet.
- **Site-accounts** met `alumni` én `alumniMailOptIn`. Dat vinkje staat in de
  onboarding én in de jaarlijkse bevestiging, samen met het afstudeerjaar en "ik
  heb ooit in VTK gezeten"; die drie verschijnen pas zodra iemand zichzelf als
  alumnus aanduidt.

Ze worden **op e-mailadres ontdubbeld en het account wint**. Een alumnus die later
toch een account maakt, hoeft dus niet handmatig uit het adresboek gehaald te
worden, en niemand krijgt dezelfde mail twee keer.

**Beide bronnen staan ook in het beheerscherm**, niet enkel in de export. Een
beheerder die op een reünie hoort "zet mij ook op die lijst" moet dat kunnen doen
zonder te weten of die persoon toevallig een account heeft. Voer je iemand in wiens
adres al bij een account hoort, dan maken we géén tweede rij maar zetten we dat
account als alumnus in de mailinglijst; de plakimport doet hetzelfde. Aan zo'n
account valt hier maar één ding te wijzigen, en dat is of hij mails krijgt: naam,
afstudeerjaar en VTK-verleden blijven van het lid en staan in zijn eigen profiel.

**Uitschrijven is niet verwijderen.** Een uitgeschreven contact blijft in de tabel
staan met een `unsubscribedAt`, precies zodat de volgende import van een oude
lijst hem niet stilletjes weer toevoegt. Verwijderen is er voor een tikfout of een
dubbele rij.

In Brevo is dit **een eigen lijst met een eigen sync** (`lib/brevo/alumni.ts`,
`Setting`-sleutel `brevo.alumniList`), bewust buiten `BREVO_LIST_KEYS`. Die
lijsten worden elke nacht gereconcilieerd tegen `desiredListKeys()`, dat enkel
naar `User`-rijen kijkt en per definitie geen enkele alumnus teruggeeft; zat de
alumnilijst daarin, dan maakte de reconciliatie ze elke nacht leeg.

Die eigen sync draait wél mee in dezelfde nachtelijke cron-route, want ze haalt
ook de uitschrijvingen uit Brevo op (zie "Uitschrijven komt uit Brevo terug").
Zonder dat zou een alumnus die op de uitschrijflink klikt pas uit de lijst vallen
wanneer iemand toevallig op de sync-knop in het beheer drukt, en tot dan in elke
export blijven staan.

---

## Doelgroepen zijn een label, geen slot

Een `CalendarCategory` met een `audience` (eerstejaars, internationaal,
laatstejaars, alumni) zegt voor wie een evenement bedoeld is. Tot augustus 2026
verborg de site zo'n evenement ook voor wie er niet bij hoorde: op de homepage, in
de zoekresultaten en in de app zag een tweedejaars geen enkele alumni-activiteit.

Dat is de omgekeerde wereld voor een kring die net wil dat mensen ontdekken wat er
allemaal is. **Standaard staat nu alles overal.** Het filter blijft bestaan als
persoonlijke voorkeur: `User.calendarOnlyMyAudiences` (op /account) houdt de
algemene evenementen plus de eigen doelgroepen over, en geldt dan op de homepage,
de kalender, de zoekresultaten, de app en de persoonlijke agendafeed. Gebruik
`viewerAudienceFilter()` en niet `audienceFilter(await viewerAudiences())`: die
laatste combinatie negeert de voorkeur.

Op /kalender blijft de chip "Afstemmen op mijn profiel" bestaan om het per bezoek
aan of uit te zetten; zijn beginstand komt uit die accountvoorkeur.

### Er is geen ledenexclusief evenement meer

`EventVisibility.MEMBERS` is verdwenen (migratie
`20260826110000_drop_event_visibility`). VTK plant niets in wat niet op de
publieke kalender mag staan; wat wél besloten is (een vergadering, een intern
moment) staat sowieso nergens in `CalendarEvent`. De vlag leverde vooral een
extra regel in elke query op en een keuzelijst in de admin die niemand ooit anders
zette.

Wie een evenement niet online wil, zet het op **concept** (`publishedAt = null`).
Dat is sinds dezelfde release ook terug te draaien vanaf een gepubliceerd event
("Terug naar concept", met bevestiging: het verdwijnt meteen van de kalender, de
homepage, de feeds en de app, maar inhoud, categorieën, tickets en formulier
blijven bewaard).

---

## Abonneren op de kalender: vier samenstellingen

De abonneerknop wees vroeger naar de feed van de filterchip die toevallig aanstond
(zonder dat ergens te zeggen). Dat is de soort stille koppeling waar iemand pas
achter komt wanneer hij drie maanden later geen enkel evenement in zijn agenda
ziet.

Nu zegt de knop wat ze gaat doen ("Abonneren op de alumni-kalender") en zet een
dialoog de vier zinvolle keuzes naast elkaar:

1. **de hele kalender**: alles, alle doelgroepen inbegrepen;
2. **algemene evenementen + één doelgroep**: het antwoord voor een alumnus: de
   alumni-avonden én de fuiven waar iedereen welkom is, maar niet de
   eerstejaarsdoop;
3. **enkel die doelgroep of categorie**;
4. **een eigen selectie** van categorieën.

Dat gebeurt met **parameters op de bestaande feed-URL** (`?c=alumni&algemeen=1`)
en niet met een nieuw pad per combinatie. Een agenda-abonnement is een URL die
jaren in iemands telefoon blijft staan; hoe minder verschillende vormen daarvan
rondzwerven, hoe minder er ooit stil kapotgaat. `/api/calendar/feed/c/<slug>.ics`
blijft bestaan voor wie zich al abonneerde.

De dialoog zegt er ook bij dat het via je agenda-app, Google Calendar of een
abonnementslink gaat. "Abonneren" alleen laat in het midden of je een bestand
krijgt, een mail, of iets in je agenda, en dat is precies de onduidelijkheid die
maakt dat mensen er niet op klikken.

### De filterchips zijn links, geen knoppen

Elke categorie heeft een eigen pagina (`/kalender/alumni`), en die hoort in de
adresbalk te staan: dan is ze deelbaar, staat ze in de geschiedenis, en ziet
iemand die op "Alumni" duwt meteen **dat** er een alumnikalender bestaat. De chip
die al aanstaat wijst terug naar `/kalender` en zet zichzelf dus uit.

Gevolg: de gekozen categorie is geen clientstate meer maar de route zelf, en de
chips blijven ook op een categoriepagina staan (ze verdwenen daar vroeger, zodat
je van `/kalender/alumni` niet naar `/kalender/sport` kon zonder terug te gaan).

### Legende en abonneren staan boven het raster

Ze stonden als kolom van 260 pixels rechts naast de kalender en aten daarmee een
vijfde van de breedte op. In een dagcel bleef dan geen ruimte over voor een
eventtitel: je las "Alumni-r..." en moest klikken om te weten wat er stond. De
legende is een handvol korte namen die evengoed naast elkaar passen; de kalender
is het scherm.

### Klikken op een evenement opent eerst een kaartje

In een cel van het maandraster past hoogstens een afgekapte titel. Meteen
doorsturen naar een volledige pagina is dan een dure manier om te ontdekken dat je
het verkeerde evenement aanklikte. Een klik opent daarom een voorvertoning met de
volledige titel, een samenvatting, waar en wanneer, en de teller; de knop eronder
gaat pas naar de eventpagina. De `href` blijft op het element staan, zodat
middenklik, ctrl-klik en een zoekmachine nog altijd een echte link zien.

In dat kaartje staat ook **"ik kom naar dit evenement"**. Wie in de kalender op
iets klikt, heeft precies dán de vraag "ga ik?" in zijn hoofd; hem daarvoor eerst
naar een tweede pagina sturen kost de helft van de klikken. Een bezoeker zonder
account krijgt er een link naar de eventpagina: het gastformulier vraagt een
afstudeerjaar of een VTK-verleden, en dat hoort niet in een kaartje van tien
regels.

Op de eventpagina zelf staat dezelfde knop **in de knoppenrij** naast "Tickets
kopen" en "Zet in mijn agenda". Het is dezelfde soort beslissing over dit
evenement; een eigen box eronder maakte er een tweede, zwaarder ogende sectie van
die je pas zag na de beschrijving. Wat er méér nodig is (de
zichtbaarheidsvakjes, of het gastformulier) klapt open over de volle breedte van
die rij.

---

## Bonnetjes betalen aan een toog

Shiftbonnetjes bestonden al: één per begonnen uur, uit te betalen door een
beheerder of aan de afhaalbalie op te gebruiken voor een broodje. Wat erbij komt
is een derde weg: de student toont een QR in de app, een praesidiumlid scant hem
en tikt een bedrag in.

**Het heet "bonnetjes" en niet iets nieuws.** De admin, de mails en de
afhaalbalie zeggen het al zo; er een tweede woord naast zetten (VTK-coins, punten)
levert precies het soort discussie op waar aan een toog geen tijd voor is.

**Het saldo blijft één getal op één plek**: `Shift.reward` min
`ShiftParticipant.rewardPaid`. Er is geen aparte portefeuille, want dan zouden er
twee saldo's zijn die uit elkaar kunnen lopen, en dan is geen van beide nog te
vertrouwen. `ShiftRewardRedemption` is het logboek van deze derde weg, niet de
waarheid; dat staat ook in de app onder de historiek, want een lijst die niet
optelt naar het getal erboven is anders gewoon verwarrend.

Drie regels die het misbruik afdekken dat er anders zou zijn:

- **Aanvaarden zit achter een eigen recht** (`shift.rewardRedeem`), niet achter
  "zit in een praesidiumpost". Dit raakt geld aan, en het moet iemand afgenomen
  kunnen worden zonder hem uit zijn post te zetten. De seed geeft het aan de
  basisrol `praesidium`, dus in de praktijk heeft elk praesidiumlid het meteen.
- **Je kan niet bij jezelf afboeken.** Wie mag aanvaarden heeft zelf ook
  bonnetjes; zijn eigen pas scannen is de kortste weg naar een gratis pint zonder
  dat er iemand meekijkt.
- **Opzoeken en afboeken zijn twee stappen.** Wie scant, ziet eerst de naam en het
  saldo en tikt dan pas een aantal in. Eén gecombineerde beweging zou betekenen
  dat je afboekt bij iemand die je nog niet herkend hebt.

De pas zelf leeft twee minuten en vernieuwt zichzelf. Een QR die uren geldig
blijft, staat na één keer tonen in een groepschat. De prijs is dat je hem niet
offline kan tonen; aan een balie staat altijd iemand met netwerk. Een **ticket**
is bewust het omgekeerde: dat wordt uit de leescache getekend en werkt zonder
netwerk, want aan de ingang van een zaal is dat er vaak niet.

---

## Inchecken aan de fakbar met een opgehangen QR

Naast de kaartlezer aan de bar hangt een QR. Wie hem met de app scant, krijgt
dezelfde check-in als wie zijn studentenkaart voorlegt. De kaartlezer blijft: dit
is een tweede weg voor wie zijn kaart niet op zak heeft, geen vervanging.

**De beperking is echt en we lossen ze niet op in het token.** Die code hangt daar
maanden en verloopt dus niet; wie er een foto van neemt, heeft hem voorgoed. Een
rollende code zoals bij de scanner-uitnodiging kan niet, want daar hoort een
scherm bij en de Pi heeft er een van twee regels van zestien tekens.

Wat de code waardeloos maakt buiten de bar zijn drie grendels die er niet in
zitten:

1. **'t ElixIr moet op dat moment open gemeten worden.** De geluidsmeting die de
   openingsstatus op de site voedt, is hier de poort; is ze verouderd of stil, dan
   telt er niets. Dit is de grendel die er echt toe doet, want hij maakt de code
   buiten de openingsuren nutteloos.
2. **Eén keer per bardag**, precies zoals bij de kaartlezer. Dezelfde
   `registerCheckin`, dus dat kan niet uit elkaar lopen.
3. **Er moet een account met een r-nummer achter zitten.** De stand hangt aan het
   r-nummer.

Wie de code doorstuurt naar iemand die niet in de bar staat, geeft die persoon dus
hoogstens één check-in op een avond dat de bar toch open is. Dat is aanvaardbaar
voor een spaarkaart voor pinten; het zou dat niet zijn voor iets met geldwaarde,
en daarom hangt betalen met bonnetjes aan een kortlevende pas en niet aan een
opgehangen code.

## Samen blokken: studietijd meten onder vrienden

De app kan je studietijd meten en die naast die van je vrienden zetten. Dat is
geen ranglijst van VTK maar een blokgroep: je maakt er een, je deelt de code, en
binnen die groep zie je van elkaar wie er nu zit.

**Waarom de groep vooraan staat en niet je eigen cijfer.** Een ranglijst
motiveert de eerste drie. Wat wél voor iedereen werkt is de reden waarom mensen
naar de bib gaan terwijl ze thuis dezelfde stoel hebben: er zit iemand naast je.
Het scherm opent daarom met wie er nu bezig is en hoelang al, met jouw plaats er
leeg naast. De cijfers staan eronder, niet erboven.

**Er is geen ranglijst per opleiding en geen VTK-brede lijst.** Studietijd is
persoonlijk, en een kringbrede lijst meet vooral wie geen leven heeft. Niemand
gaf zich daarvoor op. Je totalen zijn zichtbaar voor wie in dezelfde groep zit en
voor niemand anders; stap je eruit, dan ben je weg uit die lijst. Het vak waaraan
je werkt mag je bovendien per sessie verbergen: dan telt de tijd wel mee maar
staat er niet bij waarvoor.

**Weg uit de app is pauze.** Een teller die doorloopt terwijl je op iets anders
zit, meet niets, en dan is de hele lijst een grap. Maar streng afkappen straft
wie even iets moet opzoeken. Daarom pauzeert de sessie zodra de app naar de
achtergrond gaat, en telt een pauze korter dan een minuut niet mee. Blijft het
levensteken van de app helemaal weg, dan telt de sessie tot het laatste moment
waarop de server wist dat ze liep; anders levert een telefoon die 's avonds
leegloopt de volgende ochtend veertien uur op. Boven de acht uur netto wordt een
sessie afgekapt.

**Een sessie hoort bij de dag waarop ze begon.** Wie om half twaalf 's avonds
begint en tot twee uur doorgaat, heeft dat op één avond gedaan. Die tijd over twee
kalenderdagen splitsen zou een reeks breken die niemand gebroken heeft.

**De code is de hele toegangscontrole.** Zes tekens, in een alfabet zonder de
tekens die je verkeerd overtikt. Dit is een blokgroep onder vrienden en geen
kluis; wie de code heeft, mag erbij. Wie de groep maakte, kan iemand er weer
uitzetten, want een code die rondgaat belandt vroeg of laat bij iemand voor wie ze
niet bedoeld was. Vertrekt de eigenaar zelf, dan gaat de groep naar wie er het
langst in zit; vertrekt de laatste, dan verdwijnt de groep, want een lege groep
met een rondslingerende code is niets dan een val.

**Het groepsdoel is er om het coöperatief te maken.** Samen honderd uur halen is
iets waar de laatste in de lijst ook aan meedoet, en dat is in een blokgroep
meestal het punt. Zonder zo'n doel blijft er enkel een wedstrijd over, en die
wint altijd dezelfde.

**Er vertrekt één bericht per groep per dag**, wanneer de eerste gaat zitten. Niet
bij elk van de acht: dan zet iedereen het na één dag uit. Zie ook "Wanneer de app
een pushbericht stuurt" hierboven; dit bericht is een uitzondering op de regel dat
push enkel voor "je moet nu iets doen" is, en het mag om dezelfde reden als het
volgen van een kalendercategorie: je vroeg er zelf om, en één tik zet het uit.

**De skyline is niet decoratie maar de meting zelf.** Elke tien minuten komt er
een verdieping bij en gaan er ramen aan; zolang je sessie loopt staat er een kraan
bovenop. In een groep is elk lid een gebouw, hoog naar wat het deze week zat, met
licht achter de ramen bij wie nu bezig is. Dat is de enige plek in de app waar een
beeld iets zegt dat een getal niet zegt: je ziet in één oogopslag of er iemand zit.
De vormen komen uit het VTK-posterbeeld en blijven binnen de huisstijl (navy
silhouetten, geel als enige accent), precies omdat een tekenfilmboom dat niet zou
doen.

## Rekeningen (de opvolger van billsheet)

Een lid koopt iets voor VTK; die kost moet terug bij het lid geraken en bij de
boekhouder. Dat liep tot 2026 via **billsheet**, een aparte Next.js-app op
Supabase met een eigen ledenlijst, een eigen login en een eigen postenlijst.
Alles daarvan zit nu in `/admin/rekeningen`. De werkende keuzes:

**De boekhouder wil één vast blad, dus dat blad blijft.** `blad.pdf` staat onder
`apps/web/public/rekeningen/`, en `lib/rekeningen/report.ts` vult het in op exact
dezelfde coördinaten als billsheet, met dezelfde bestandsnaam
(`26-27_Fakbar_Doopcantus_Bierbestelling_248.9.pdf`). De bladen van vóór en na de
overstap liggen bij de boekhouder in dezelfde map; ze moeten er dus hetzelfde
uitzien. Een mooiere, zelfgetekende PDF was hier de verkeerde verbetering.

**Het bonnetje kan gedraaid worden voor het vertrekt.** Een kassaticket komt van
een telefoon en ligt vaak op zijn kant. Het voorbeeldvenster genereert bij elke
draai gewoon een nieuw blad; wat je ziet is exact wat je downloadt of doorstuurt.
Billsheet had dit ook, en het is geen luxe: zonder dat krijgt de boekhouder een
liggende bon.

**Vier statussen, afgeleid uit drie datums.** `paidAt` (terugbetaald), `sentAt`
(blad vertrokken naar de boekhouder), `bookedAt` (boekhouder bevestigde). Daar
volgen "terug te betalen → door te sturen → in te boeken → afgehandeld" uit. Er is
bewust géén statuskolom in de database: die kan afwijken van de datums, en dan
weet niemand meer welke van de twee klopt. De statustabs bovenaan het overzicht
zijn dus gewoon vier `where`-fragmenten.

**Een rekening met de VTK-kaart staat meteen op "terugbetaald".** Er is niets
terug te betalen: het geld ging nooit uit de zak van het lid. Zo blijft de lijst
"terug te betalen" precies het bedrag dat nog ergens naartoe moet, wat de vraag is
die Groep 5 elke week stelt. Billsheet deed hetzelfde (`paid: values.paymentMethod
=== "vtk"`), en het is de reden dat het cijfer bovenaan bruikbaar is.

**Terugbetaald, doorgestuurd of ingeboekt = niet meer aanpasbaar.** Het bedrag op
het blad moet gelijk blijven aan wat er uitbetaald en geboekt is. Wie het toch moet
rechtzetten, haalt eerst het vinkje weg; dat kan enkel Groep 5. Nieuw tegenover
billsheet is dat de **indiener zelf** zijn rekening mag corrigeren zolang er niets
van dat alles gebeurd is: een tikfout in het bedrag was anders een berichtje naar
Groep 5.

**"Doorgestuurd" is geen vinkje.** Het wordt gezet door de mail effectief te
versturen, niet door te beweren dat je dat deed. Zonder mailserver weigert de
actie dus in plaats van een blad af te vinken dat nooit vertrok (zie de
waarschuwing bovenaan `@vtk/mail`); je kan het blad dan downloaden en zelf mailen.

**Het IBAN staat bij de rekening, niet bij het lid.** Billsheet bewaarde het op
het profiel. Dat betekent een permanent rekeningnummer in de ledentabel van
iedereen die ooit iets voorschoot, terwijl het maar voor één ding dient. Het
formulier vult het in vanuit je vorige rekening, dus je merkt het verschil niet;
verdwijnt die rekening ooit, dan verdwijnt het nummer mee.

**De postnaam wordt vastgeklikt bij het indienen.** `Expense.postLabel` is een
kopie van de naam zoals de post op dat moment heette, naast de gewone
`groupId`-relatie. Die naam staat op het blad bij de boekhouder; hernoemt de post
later, dan mag zijn map niet ineens twee namen bevatten voor hetzelfde jaar.

**Er is geen gebruikersbeheer meer.** Billsheet had een eigen `profiles`-tabel met
`admin`, `allowed_posts`, naam, post en IBAN, plus registratie op `@vtk.be` en een
wachtwoordreset. Dat is nu de gewone toegangscontrole van de site: posten,
rollen en KU Leuven SSO. `expenses.submit` zit in de rol `praesidium` (dus elke
post), `expenses.manage` in de rol `admin` (dus IT en Groep 5), en
`expenses.managePost` is er voor een postverantwoordelijke die de rekeningen van
zijn eigen post wil opvolgen.

**Wat billsheet fout deed en hier niet meer kan.** `requireAdmin` liet een
post-beheerder door voor `setPaid`, `setBooked`, `updateBill` én `deleteBill`
zónder ooit te toetsen of de rekening bij zijn post hoorde; enkel de *lijst* werd
in de browser gefilterd. Wie een id kende, kon met één POST elke rekening van de
hele kring op betaald zetten. Elke check zit nu serverkant en op de rekening zelf
(`lib/rekeningen/server.ts`).

**Bonnetjes gaan niet door `/api/media`.** Die route vraagt niets en vertrouwt
erop dat storage-keys onraadbaar zijn: prima voor een partnerlogo, fout voor een
kassabon met een naam, een bedrag en soms een rekeningnummer. Ze staan onder
`bonnetjes/` en gaan enkel via `/api/admin/rekeningen/[id]/bon`, die de rekening
opzoekt en de toegang erop toetst. De uploadroute hercodeert elke foto naar JPEG,
wat meteen de EXIF (inclusief GPS) weggooit die een telefoon in een bonfoto stopt.

**Zoeken gebeurt in de database, niet in de browser.** Billsheet haalde álle
rekeningen op en filterde ze met Fuse.js; dat is tolerant voor tikfouten en werkt
tot het niet meer werkt. Hier staan de filters in de URL en de selectie in
`?sel=`, zodat een gefilterde lijst en een geopende rekening deelbare links zijn,
de terugknop werkt, en de lijst met tienduizend rijen overweg kan.

**De opslagmeter is gebleven, de limiet niet.** Billsheet toonde het
Supabase-verbruik met een waarschuwing bij 80% van 1 GB, want daarboven werd het
hele project geblokkeerd. De objectopslag van de site heeft dat quotum niet, dus
het cijfer staat er nog als informatie en niet meer als alarm.

## Admin-navigatie: domeinen, losse modules en vastgepinde tabs

De zijbalk van `/admin` telde tweeëntwintig rijen voor wie alles mag zien (IT en
Groep 5), en dat is de ingeklapte stand: volledig open waren het er negenveertig.
Zeventien van die tweeëntwintig waren losse items zonder groep, vijf waren
groepen, en alles stond door elkaar alfabetisch. Het probleem was niet de lengte
maar de ontbrekende regel: je kon niet voorspellen waar iets stond.

**De volgorde staat nu vast in `apps/web/lib/admin-nav.ts` en er wordt niet meer
gesorteerd.** Ook niet binnen een groep. Alfabetisch sorteren zette een map met
tien schermen (IT) tussen twee losse tools, en omdat er op het *vertaalde* label
gesorteerd werd, kreeg dezelfde persoon een andere zijbalk zodra hij naar Engels
wisselde. Een vaste volgorde lost allebei op en laat toe om de vijf schermen die
samen de homepagina beschrijven ook naast elkaar te zetten.

**Een module die één post dagelijks gebruikt, blijft een los item.** Dit is de
belangrijkste uitzondering op "alles in een domein". Theokot, Piano, Fakscanner
en Grocomeet in een groep "Diensten" stoppen betekent dat net de mensen die er
het meest inzitten er elke keer naar moeten zoeken; de winst van een kortere
lijst gaat dan naar de mensen die die tab toch nooit openen. Rekeningen,
Wachtwoorden en Logistiek staan om dezelfde reden los: die gebruikt iedereen
rechtstreeks. Gevolg: zeven domeinen plus zeven losse modules, veertien rijen.

**Een groep met een vage naam is erger dan geen groep.** Er stond even een groep
"Werking" met Rekeningen, Wachtwoorden en Logistiek erin. Die is geschrapt: je
wist niet wat erin zat tot je hem opendeed, en dan is een groep enkel een extra
klik.

**Waar de twijfelgevallen terechtkwamen, en waarom.**

- *Forms en Shiften* staan bij Website, niet bij Evenementen. Ze hangen niet
  altijd aan een evenement; een formulier of een shift kan evengoed op zichzelf
  staan.
- *Media* staat bij Communicatie, samen met de mailinglijsten, de groepsadressen
  en de app-pushberichten. Dat is wat de kring naar buiten brengt.
  *App-pushberichten* stond onder IT, maar wie een pushbericht stuurt doet
  communicatie, geen systeembeheer.
- *Dashboard* is een groep met Overzicht en Dashboardtegels. Die tegels kan elke
  post aanpassen, dus ze horen bij het dashboard en niet bij IT.
- *Alumni* staat bij Ledenbeheer en niet bij Communicatie: het is een adresboek
  per lichting, geen opt-in lijst. Een afgestudeerde geeft per definitie nooit
  meer een studiebevestiging van dit werkingsjaar. Zie ook de drie dingen die
  "mailinglijst" heten, hierboven.
- *Wachtwoorden* blijft los van IT, om dezelfde reden als vroeger: een
  postverantwoordelijke beheert de wachtwoorden van zijn eigen post en hoort
  daarvoor niet in een IT-map te moeten kijken. Het kluisbeheer zelf staat er wel
  onder.

**Een groep waarvan je maar één item mag zien, rendert als los item.** Anders
betaalt de meerderheid, die drie tabs ziet, een klik voor een indeling die enkel
IT en Groep 5 nodig hebben.

### Vastgepinde tabs

Elke gebruiker kan tabs vastpinnen (`UserAdminNavPin`), en die staan dan bovenaan
onder "Vastgepind", met de volledige lijst er standaard open onder. IT en Groep 5
hebben een ander dagelijks lijstje dan de rest, en dit is het enige deel van de
indeling dat dat verschil erkent. Hetzelfde idee als de dashboardtegels, die ook
al per gebruiker te schikken zijn.

- **Er wordt op de tab-key gepind, niet op het pad.** Verhuist een scherm later
  naar een ander pad, dan blijft de pin staan.
- **Een pin op een tab die je niet meer mag zien, blijft bewaard.** Hij rendert
  gewoon niet. Rechten zijn werkingsjaar-gescoped; wie zijn post volgend jaar
  terugkrijgt, krijgt ook zijn pin terug.
- **Het verplaatsen van de tab is de bevestiging, dus geen toast bij succes.**
  Enkel als het opslaan mislukt komt er een rode toast en springt de pin terug.
  Dat is de uitzondering op de regel dat opslaan altijd zijn uitkomst meldt: hier
  is de uitkomst zichtbaar in de zijbalk zelf.
- **De volledige lijst staat er open onder, niet ingeklapt.** Anders vallen
  nieuwe tabs niet meer op bij wie enkel nog naar zijn pins kijkt.

---

## Twee fotogalerijen: vtk.be en 't ElixIr

De fakbar heeft een **eigen fotogalerij** op haar eigen app, los van die op
vtk.be, en dat is een kringkeuze en geen technische.

**Waarom.** VTK wil op de hoofdsite enkel kwalitatief, geselecteerd werk: de
fotogalerij daar is een visitekaartje dat ook door bedrijven, ouders en nieuwe
studenten bekeken wordt. De fakbar wil na elke avond gewoon alles kunnen posten,
ook wat minder scherp of minder flatteus is; voor wie er die avond bij was, is
dat net de waarde. Dat zijn twee verschillende redacties met twee verschillende
latten, en die passen niet in één galerij met een vinkje per album: één
verkeerde klik zet dan een rommelige barnacht op de voorpagina van de kring.

**Hoe het gescheiden blijft.** Eén Immich-installatie, één API-sleutel, maar per
galerij een eigen **merker** in de albumbeschrijving: `[gallery]` voor vtk.be,
`[fakbar]` voor 't ElixIr. Een album hoort bij de galerij waarvan het de merker
draagt **en bij die alleen**: draagt het er twee, dan verschijnt het nergens en
zet /admin/fotos het als "staat nergens" in beeld. Die wederzijdse uitsluiting
is het hele punt; zonder haar zou één album met beide merkers alsnog op de
hoofdsite belanden. De merker komt bij het uploaden altijd uit de client en
nooit uit het formulier, dus een upload vanuit de fakbar-app kan per constructie
niet in de galerij van vtk.be terechtkomen.

**Uploaden vanaf de hoofdsite staat standaard uit.** Wie in /admin/media werkt
heeft soms toch de foto's van de fakbar in handen, dus er is een bestemmingskeuze
per album. Die verschijnt pas nadat iemand met `media.manage` de schakelaar
aanzet (`Setting["media.fakbarUpload"]`). Standaard uit, omdat een keuze die er
altijd staat er ooit eentje is die verkeerd gaat, en dan is precies het
onderscheid weg waar dit hele verhaal om draait. De schakelaar geldt voor het
hele team en niet per gebruiker: het is een afspraak, geen voorkeur.

**Wat er bewust niet is.** De fakbargalerij heeft geen gezichtszoeker. Die op
vtk.be draait op een aparte Immich-databank en is gebouwd voor het geselecteerde
archief; hem hier bijzetten zou betekenen dat je jezelf kan terugvinden op elke
avond die iemand ooit gepost heeft, en dat is een ander gesprek dan een galerij.

De implementatie staat in `packages/gallery` (gedeeld), `apps/fakbar/lib/gallery.ts`
en `apps/web/lib/fakbar-gallery.ts`.
