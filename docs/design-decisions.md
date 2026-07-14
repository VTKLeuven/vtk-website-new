# Design decisions & kringwerking

Dit document legt niet-vanzelfsprekende **product- en werkingskeuzes** van VTK vast:
beslissingen die voortkomen uit hoe onze kring concreet werkt en die je niet uit de
code of git-historiek kan afleiden. Bedoeld zodat toekomstige (AI-)sessies de context
kennen en betere keuzes maken.

> **Voor toekomstige agents:** wanneer je een feature implementeert waarvan de
> gewenste werking een *kringkeuze* is (niet puur technisch, niet vanzelfsprekend),
> voeg hier een sectie toe. `CLAUDE.md` verwijst naar dit bestand.

De inhoud beschrijft *waarom* het zo werkt. De concrete implementatie staat in de code
(schema in `packages/db/prisma/schema.prisma`, logica in `apps/web/lib/theokot*.ts`,
acties in `apps/web/app/actions/theokot.ts`).

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
- **"Broodje van de week"** is gewoon het aanbod-item dat als *weekly special*
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
  `/aanbod/theokot` sturen ernaartoe) en is bereikbaar via de Aanbod-sectie.
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
  gestempeld) valt die gate weg. De gate leest het huidige pad uit de door de
  proxy gezette `x-pathname`-header om geen redirect-loop op `/onboarding` te maken.
- Gevraagde gegevens: **kotadres** (straat, huisnummer, bus *optioneel*, postcode,
  stad), **geboortedatum**, **persoonlijke mail**, en welk adres (universiteits-
  of persoonlijke mail) de **voorkeur** krijgt voor communicatie. De
  universiteitsmail is de SSO-/login-mail (`User.email`) en wordt niet apart
  gevraagd, enkel getoond.
- **Profielfoto is optioneel.** Ze wordt opgeslagen als `avatarKey` en verschijnt
  op `/praesidium` en `/pocs` **enkel** als het lid daar effectief in staat.
- Alles blijft achteraf bewerkbaar op `/account` (zelfde formulier, zonder dat
  `onboardedAt` opnieuw gezet wordt).

### Studie (richtingen & studiejaar)
- Een lid kan **meerdere richtingen** aanduiden (`StudyProgramme`-enum,
  `User.studyProgrammes` array) en **één studiejaar** (`StudyYear`-enum,
  `User.studyYear`): 1ste/2de/3de bachelor of 1ste/2de master.
- De lijst richtingen is **KU Leuven-ingenieurswetenschappen-specifiek** en staat
  vast in de enum; NL/EN-labels leven in de i18n-dictionaries (`onboarding.programmes`
  / `onboarding.years`). Nieuwe richting = enum-waarde + label toevoegen +
  `STUDY_PROGRAMMES` in `apps/web/lib/profile.ts` bijwerken.
- Beide zijn **optioneel** (geen harde vereiste in de onboarding), zodat de
  registratie niet blokkeert; te wijzigen op `/account`.

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
  DB; de enum-waarde `GroupCode.ALGEMEEN` blijft ongebruikt bestaan.

### Mailinglijsten (opt-in)
- Acht categorieën: **Feest, Career, Sport, Evenementen, Onderwijs, VTK
  International, Eerstejaars, Bakske** (`MailCategory`-enum, opgeslagen als
  opt-in array op `User.mailCategories`).
- **Default staat alles uit (opt-in):** een lid vinkt bij registratie expliciet
  aan waarvoor het mails wil. Bewuste keuze i.p.v. opt-out, om te stroken met de
  verwachting dat je zelf kiest waarvoor je ingeschreven wordt.
