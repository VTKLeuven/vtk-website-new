# Google Workspace (groepsadressen, accounts en de kiesploeg)

De eigen adressen van de kring (`activiteiten@vtk.be`, `2027.g5@vtk.be`), de
`@vtk.be`-accounts van de leden en de kiesploeg. Dit document beschrijft **hoe je
het opzet en hoe je het draaiende houdt**. Voor het waarom van de keuzes zie
`docs/design-decisions.md`, sectie "Google Workspace: postadressen, accounts en
de kiesploeg"; voor het rechtenmodel `docs/permissions.md`.

**Verwar dit niet met de Brevo-mailinglijsten.** Dat zijn uitgaande
nieuwsbrieven naar studenten, opt-in per categorie. Dit zijn de ontvangende
adressen van de vereniging zelf: je staat erin omdat je in die post zit.

**De hele koppeling is optioneel en ligt stil tot ze ingesteld is.** Zonder
`google.config` synchroniseert er niets, worden er geen accounts aangemaakt en
gebeurt er niets bij een lidmaatschapswijziging; de beheerschermen laten je enkel
lijsten voorbereiden en zeggen dat er nog niets naar Google gaat. **De verplichte
koppeling voor leden staat daarbovenop nog eens apart uit** en moet expliciet
aangezet worden (stap 6). Zet ze pas aan als de accounts bestaan, anders klikt
iedereen "ik heb nog geen account" en heb je een week stilte gekocht zonder één
koppeling.

---

## In één oogopslag

```
  VTK-site                                    Google Workspace
  ────────                                    ────────────────
  GroupMembership (huidig werkingsjaar) ──┐
  KiesploegMember ────────────────────────┼──▶ MailGroup (regel)
  MailGroupExtra (los adres / uitsluiting)┘         │
                                                    ▼
                                            groep + leden        ──▶ gedeelde drive
                                            (Directory API)          (groep als lid)

  User.googleUserId ◀── koppeling ──▶ account in de directory
        │                                   │
        │                                   ├── OU  (volwaardig / beperkt)
        │                                   ├── alias (kiesploeg)
        └── zelf gekoppeld via OAuth        └── Gmail: afzender + doorsturen
            of aangemaakt door de site
```

Eén sync, twee delen: **de groepsadressen** (wie staat er in welke groep) en **de
accountstaat** (mag dit lid mailen). Allebei afgeleid uit de posten van het
huidige werkingsjaar, dus de 15-juli-wissel heeft geen eigen cron nodig.

---

## Waar wat staat

| Bestand                                          | Inhoud                                                                   |
| ------------------------------------------------ | ------------------------------------------------------------------------ |
| `apps/web/lib/google/config.ts`                  | `Setting`-sleutel `google.config`, geheimen versleuteld                  |
| `apps/web/lib/google/client.ts`                  | Directory API, Groups Settings API, Gmail-instellingen, de scopes        |
| `apps/web/lib/google/members.ts`                 | **De regel**: wie hoort er in een groepsadres (puur, getest)             |
| `apps/web/lib/google/desired.ts`                 | De rijen voor die regel ophalen; gedeeld door sync en beheerschermen     |
| `apps/web/lib/google/sync.ts`                    | `reconcileGoogle()`, jaargroepen, standaardinstellingen, 15 juli         |
| `apps/web/lib/google/accountState.ts`            | De vier accountstaten en wat de sync zelf mag (`transitionAllowed`)      |
| `apps/web/lib/google/access.ts`                  | Wie welke lijst mag beheren (IT, of een werkgroep haar eigen lijsten)    |
| `apps/web/lib/google/import.ts`                  | Een bestaande Google-groep overnemen                                     |
| `apps/web/lib/google/activity.ts`                | Wie in een lijst nog actief is (puur, getest); `activityData.ts` haalt de rijen |
| `apps/web/lib/google/werkgroepAccounts.ts`       | Accounts van werkgroepen aanvragen, goedkeuren, weigeren                 |
| `apps/web/lib/google/addresses.ts`               | Adressjablonen, normalisatie, botsingen, wachtwoord                      |
| `apps/web/lib/google/provision.ts`               | Accounts plannen en aanmaken                                             |
| `apps/web/lib/google/linking.ts` + `link.ts`     | Naamvoorstellen voor het koppelscherm                                    |
| `apps/web/lib/google/oauthLink.ts`               | "Koppel je VTK-account": de OAuth-stroom                                 |
| `apps/web/app/api/google/maintenance/route.ts`   | Wat de `google-worker` elke 5 minuten aanroept                           |
| `apps/web/app/api/google/link/*`                 | Start en terugkeer van de koppeling                                      |
| `apps/web/proxy.ts` (`gateRedirect`)             | De verplichte koppeling voor praesidium- en werkgroepleden               |

| Route                                | Wat                                                            | Recht                    |
| ------------------------------------ | -------------------------------------------------------------- | ------------------------ |
| `/admin/groepsadressen`              | Overzicht, categorieën, in bulk ordenen of verwijderen, nu synchroniseren (icoon) | `mailgroups.manage`, of een werkgroep (haar eigen lijsten) |
| `/admin/groepsadressen/nieuw`        | Nieuw groepsadres, meteen met bronnen, losse leden en categorie | idem                    |
| `/admin/groepsadressen/<id>`         | Eén lijst in tabbladen: leden, bronnen, jaargroepen, instellingen | idem                   |
| `/admin/groepsadressen/overnemen`    | Bestaande Google-groepen overnemen                             | `mailgroups.manage`      |
| `/admin/groepsadressen/aanvragen`    | Accounts van werkgroepen aanvragen en goedkeuren; voorvoegsels | werkgroep / `googleAccounts.manage` / `mailgroups.manage` |
| `/admin/groepsadressen/koppelingen`  | Bestaande `@vtk.be`-accounts aan leden hangen                  | `mailgroups.manage`      |
| `/admin/groepsadressen/accounts`     | Accounts aanmaken (voorbeeld eerst)                            | `googleAccounts.manage`  |
| `/admin/groepsadressen/organisatie-eenheden` | Accounts per OU, in bulk verplaatsen; terugzetten uit het logboek | `googleAccounts.manage` |
| `/admin/kiesploeg`                   | Kiesploeg, haar posten, leden, adressjablonen, 15 juli vooraf  | `kiesploeg.manage`       |
| `/admin/pocs`                        | POC-lijsten aanmaken en "verkozen" per werkingsjaar            | `pocs.manage`            |
| `/admin/it`                          | Service-account, OAuth-client, organisatie-eenheden            | superadmin               |
| `/koppel-vtk-account`                | Wat een lid zelf doet                                          | ingelogd                 |

---

## Opzetten

Reken op een uur, waarvan het meeste wachten op Google. Je hebt een **super
admin** van het Workspace-domein nodig en toegang tot een **Google Cloud-project**.

### 1. Cloud-project en API's

Maak (of kies) een Google Cloud-project en zet daar twee API's aan:

- **Admin SDK API** (groepen, leden, gebruikers, organisatie-eenheden)
- **Groups Settings API** (wie mag posten naar een groep)

Wil je later de Gmail-instellingen laten werken (afzenderadres en doorsturen bij
kiesploegaccounts), zet dan ook de **Gmail API** aan. Voor het overzicht van het
Bestuursorgaan (`/admin/bestuursorgaan`) is ook de **Google Drive API** nodig;
zie "Het Drive-account voor het Bestuursorgaan" hieronder.

### 2. Service-account met domain-wide delegation

1. In het project: **IAM & Admin → Service Accounts → Create**. Naam bijvoorbeeld
   `vtk-site`. Rollen in het project heeft het niet nodig.
2. **Keys → Add key → JSON.** Bewaar dat bestand als een wachtwoord; het is er
   ook een.
3. Noteer de **Unique ID** van het service-account (een getal van 21 cijfers).
   Dat is de client-id die je in de volgende stap nodig hebt, niet het
   mailadres.
4. In de **Admin console** (admin.google.com): **Beveiliging → Toegang en
   gegevensbeheer → API-besturing → Domeinbrede delegatie → Nieuwe toevoegen**.
   Plak de Unique ID en deze scopes, komma-gescheiden:

   ```
   https://www.googleapis.com/auth/admin.directory.group,
   https://www.googleapis.com/auth/admin.directory.group.member,
   https://www.googleapis.com/auth/admin.directory.user,
   https://www.googleapis.com/auth/admin.directory.user.alias,
   https://www.googleapis.com/auth/apps.groups.settings,
   https://www.googleapis.com/auth/gmail.settings.basic,
   https://www.googleapis.com/auth/gmail.settings.sharing,
   https://www.googleapis.com/auth/drive.readonly,
   https://www.googleapis.com/auth/admin.reports.audit.readonly
   ```

   Ze staan ook in `apps/web/lib/google/client.ts` (`GOOGLE_SCOPES`,
   `GMAIL_SCOPES`, `DRIVE_SCOPES` en `REPORTS_SCOPES`); dat is de bron van waarheid als er ooit één
   bijkomt.

   **Ontbreekt er één, dan faalt élke aanroep** met `unauthorized_client`. Dat
   leest als een kapotte sleutel maar is de delegatie. Voeg je later een scope
   toe, herstart dan de web-container of wacht een uur: het access token wordt
   per proces gecachet.

### 3. De beheerder die geïmpersonateerd wordt

Een service-account mag op zichzelf niets in de Directory; het handelt **namens
een beheerder**. Kies daarvoor een echt beheerdersaccount, bijvoorbeeld
`it@vtk.be`. Dat account moet groepen en gebruikers mogen beheren (de rol
*Groepsbeheerder* plus *Gebruikersbeheerder*, of super admin).

Neem hier niet het account van een persoon die volgend jaar vertrekt: verdwijnt
dat account, dan valt de hele koppeling stil.

### 4. Organisatie-eenheden en de regel die geen API heeft

Dit is het enige stuk handwerk dat blijft. **Verhinderen dat iemand mailt vanaf
zijn primaire adres kan je niet programmatisch instellen**; in Gmail staat het
primaire adres altijd in "Verzenden als". De enige afdwinging is een
routing-regel, en daar is geen publieke API voor.

Daarom hangt die regel aan een **organisatie-eenheid** en verplaatst de sync
mensen in en uit die OU. Er zijn er twee, want een kiesploeglid ontvangt enkel,
of mailt enkel vanaf zijn kiesploegadres:

1. **Directory → Organisatie-eenheden**: maak `/Kiesploeg/Ontvangen` en
   `/Kiesploeg/Verzenden` aan (de namen mogen anders, je vult ze straks in bij
   Admin > IT).
2. **Apps → Google Workspace → Gmail → Routing**, op `/Kiesploeg/Ontvangen`: een
   regel voor **uitgaande** berichten met als actie **Reject message**. Wie hier
   zit, verstuurt niets.
3. Zelfde plek, op `/Kiesploeg/Verzenden`: een regel voor **uitgaande**
   berichten, **Reject message**, maar enkel voor de envelopafzenders die het
   primaire adres zijn. Het primaire adres heeft twee delen
   (`voornaam.naam@vtk.be`), het kiesploegadres drie
   (`voornaam.naam.kiesploegepsilon@vtk.be`), dus het patroon
   `^[a-z0-9]+\.[a-z0-9]+@vtk\.be$` vangt het eerste en laat het tweede door.
   Gmail gebruikt RE2: een lookahead werkt niet.
4. Test beide regels met één account voor je de hele ploeg erin zet: verstuur
   vanaf het primaire adres en vanaf de alias, en kijk wat er terugkomt.
3. Wil je dat kiesploegaccounts ook geen Gmail-interface krijgen, zet dan de
   Gmail-service uit voor die OU. Let op: dan **bouncet** inkomende mail in
   plaats van door te sturen. Wij gaan ervan uit dat Gmail aan staat en dat de
   sync het doorsturen regelt.

### 5. OAuth-client voor "Koppel je VTK-account"

Los van het service-account: dit is een gewone webclient waarmee een lid zich
met zijn eigen account aanmeldt.

1. Cloud-project → **APIs & Services → Credentials → Create credentials → OAuth
   client ID → Web application**.
2. **Authorised redirect URI**: `https://<site>/api/google/link/callback`, met
   `<site>` het adres van de website (lokaal `http://localhost:3000`).
3. Zet het **OAuth consent screen** op **Internal**. Dan is er geen verificatie
   nodig en kunnen enkel accounts van het domein zich aanmelden.
4. Noteer de client-id en het client secret.

Zonder deze stap werkt de rest gewoon; enkel de zelfbedieningsknop ontbreekt en
de koppelpagina zegt dat IT dat nog moet afwerken.

### 6. Invullen in de site

**Admin → IT → Google Workspace** (superadmin):

| Veld                      | Waarde                                                             |
| ------------------------- | ------------------------------------------------------------------ |
| Domain                    | `vtk.be`                                                           |
| Admin to impersonate      | het account uit stap 3, bv. `it@vtk.be`                            |
| Service account           | `client_email` uit het JSON-bestand                                |
| Full org unit             | `/` (of de OU waar volwaardige accounts thuishoren)                |
| Restricted org unit       | `/Kiesploeg/Ontvangen` uit stap 4                                  |
| Alias sender org unit     | `/Kiesploeg/Verzenden` uit stap 4                                  |
| OAuth client ID + secret  | uit stap 5                                                         |
| Private key               | de `private_key` uit het JSON-bestand                              |
| Koppeling verplichten     | **laat dit uit** tot de accounts bestaan; zie hieronder            |

De private key mag je plakken met de letterlijke `\n`-reeksen erin; die worden
omgezet. Ze wordt versleuteld bewaard (`lib/secrets.ts`, sleutel afgeleid van
`BETTER_AUTH_SECRET`) en nooit teruggetoond. Leeg laten bij een latere
bewerking houdt de bestaande.

Laat je de **restricted org unit** leeg, dan verplaatst de sync niemand. Dat
betekent ook dat niets het verzenden tegenhoudt; het beheerscherm zegt dat er
dan bij.

**Het vinkje "koppeling verplichten" is de enige knop die iets aan gewone leden
laat zien.** Staat hij uit (standaard), dan merkt niemand iets van deze hele
feature: geen omleiding, geen melding. Staat hij aan, dan wordt elk lid met een
post of werkgroep van dit werkingsjaar naar `/koppel-vtk-account` gestuurd tot
het gekoppeld is. De stand wordt een minuut gecachet, dus na het omzetten duurt
het hoogstens zo lang. De gate slaat sowieso nooit toe zolang de OAuth-client
ontbreekt: een gate met een knop die niets doet, is een storing.

Een verstandige volgorde: eerst de lijsten en de sync (stap 1 tot 4 hieronder),
dan de bestaande accounts koppelen, dan de ontbrekende accounts aanmaken, en pas
daarna dit vinkje.

### 7. De worker

Zet `GOOGLE_MAINTENANCE_SECRET` in `.env` (bijvoorbeeld
`openssl rand -base64 32`). De `google-worker` uit `infra/docker-compose.yml`
roept daarmee elke vijf minuten `POST /api/google/maintenance` aan. Leeg laten =
geen synchronisatie; de groepen blijven dan staan zoals ze zijn.

De worker meldt zich ongezond zodra er iets blijft haperen. Leden zonder
gekoppeld adres en een doorstuuradres dat op zijn bevestiging wacht tellen daar
bewust niet in mee: dat is wachten op een mens, geen storing.

### 8. Migreren en eerste ronde

```
npm run db:migrate        # lokaal
# op de server draait `prisma migrate deploy` bij elke start
# de nieuwe permissies zet prisma/sync.ts bij elke start; lokaal: npm run db:seed
# (de seed weigert op productie, zie docs/dev-testdata.md)
```

Ken daarna in `/admin/roles` de rechten toe: `mailgroups.manage` aan wie de
lijsten beheert, `googleAccounts.manage` aan wie accounts aanmaakt,
`kiesploeg.manage` aan wie de kiesploeg opvolgt. Bewust drie rechten: accounts
aanmaken is iets anders dan een lijst bijwerken.

---

## In gebruik nemen

### Bestaande accounts koppelen

`/admin/groepsadressen/koppelingen` leest de directory en stelt koppelingen voor
op naam. Daaronder staan de leden met een post die nog geen gekoppeld account
hebben, elk met de vrije accounts in een zoekbare lijst; de vrije accounts zonder
lid (meestal oud-leden) staan dichtgeklapt, met een zoekveld. Enkel **eenduidige** overeenkomsten worden voorgesteld; naamgenoten
staan apart met een keuzelijst. "Alle voorstellen koppelen" herberekent
server-side en neemt niet over wat de browser terugstuurt.

Wat overblijft lost zichzelf op: nieuwe accounts worden door de site aangemaakt
(dan klopt de koppeling per constructie) en leden koppelen zichzelf via de gate.

### De bestaande groepen overnemen

`/admin/groepsadressen/overnemen` leest alle groepen van het domein en toont
die de site nog niet kent. Vink aan wat de site voortaan moet beheren.

- **Er verandert niets in Google.** Wie er nu als gewoon lid in staat, komt mee
  als los lid: een lid van de site wanneer het adres zijn gekoppelde account is,
  anders een vrij adres met de notitie "overgenomen uit Google". Een geneste
  groep (`groep5@vtk.be`) wordt zo een vrij adres, en blijft dus gewoon lid.
- Eigenaars en beheerders komen niet mee; de sync raakt ze nooit aan.
- Een groep die enkel intern bereikbaar was, blijft dat
  (`allowExternalSenders` volgt de huidige instelling). De andere
  toegangsinstellingen worden die van VTK (zie "Standaardinstellingen").
- Daarna per lijst: zet de juiste bron (de post, de POC, de werkgroep), kijk de
  berekende ledenlijst na, en klik "overgenomen adressen wissen".

Begin met een handvol lijsten en kijk na wat er in Google gebeurde.

In de zijbalk heet dit geheel **Google Admin**, een eigen item en niet meer
onder Communicatie. De routes hieronder zijn tabbladen van één layout
(`app/[locale]/admin/groepsadressen/layout.tsx`, `GoogleAdminTabs.tsx`); een
adres, de nakijkmodus en een nieuw adres vallen onder het tabblad
Groepsadressen. Een nieuw scherm erbij wordt een tabblad daar, geen link boven
het overzicht.

### Opruimen

Een klik op "wie erin zit" toont de leden met per adres de status (een post
dit werkingsjaar, een lopende kiesploeg, een studie die dit academiejaar
bevestigd is); een geneste groep klik je daar verder open. Het overzicht zelf
toont sinds 17 november 2026 geen kolom "nog actief" meer: na het grote
nakijken bleven vooral alumnilijsten over, waarin niemand "gekend" is en die
toch blijven. De berekening (`lib/google/activity.ts`) draait nog voor de
nakijkmodus, het venster met de leden en de waarschuwing bij verwijderen.

1. Filter op **Leeg** of zoek (`activiteiten_`, Cmd/Ctrl+F zet de cursor in het
   zoekveld). De zoekterm en de open categorieën staan in de URL: wie een adres
   opent en terugkeert, vindt de lijst zoals hij ze achterliet.
2. Vink aan wat weg mag; het vinkje in de kop neemt alles in de filter, dat van
   een categorieblok alles in dat blok. Shift-klik neemt een reeks, Ctrl- of
   Cmd-klik op een rij vinkt aan in plaats van te openen.
3. **Verwijderen uit Google**, tot 200 per keer. De bevestiging noemt wat weggaat
   en waarschuwt bij een groep met nog actieve leden.

Wat er gebeurt: de groep verdwijnt in Google (met aliassen en archief), de regel
op de site en het adres als los lid in andere lijsten ook. Wie erin zat, staat
per groep in het adminlogboek. De jaargroep van dit jaar van een hoofdgroep met
een sjabloon wordt overgeslagen: die maakt de sync gewoon opnieuw.

Groep per groep gaat sneller met **Eén voor één nakijken** (het lijstjesicoon
naast het zoekveld; `?opruimen=inactief` filtert daar nog op "niemand meer actief"):
dezelfde lijst, telkens één groep met wie erin zit, en Houden (H), Weg ermee (V)
of Overslaan (S). De beslissingen blijven bewaard; "weg" zet een groep op de
lijst **Te verwijderen**, die je daarna in één keer verwijdert.

Wie naar een groep mag mailen (iedereen, of enkel `@vtk.be`) zet je per groep
bij Instellingen, of voor de aangevinkte groepen in de balk onderaan ("Wie mag
mailen"). Het overzicht toont "enkel vtk.be" bij een groep die enkel intern
bereikbaar is.

Ordenen gaat met **categorieën** (Praesidium › Activiteiten): maak ze bij
"Categorieën", vink groepen aan en kies "In categorie zetten". Hoort een
categorie bij een werkgroep (Werkgroepen › Biomedix), kies die dan met het
potlood bij de categorie: ze komt op elk adres erin zonder werkgroep, en op wat
er later in komt. Een adres met een andere werkgroep houdt die. Zie
`docs/design-decisions.md`, "Categorieën: ordening, geen regel".

### Organisatie-eenheden

`/admin/groepsadressen/organisatie-eenheden` toont elk `@vtk.be`-account met
zijn OU, het gekoppelde lid en zijn post. Vink accounts aan (shift en
Ctrl/Cmd werken) en verplaats ze naar een andere OU. De site mag de lijst van
OU's zelf niet lezen (dat vraagt een extra scope), dus de keuzes zijn de OU's
waar nu al iemand in staat plus die uit de instellingen: een nieuwe, lege OU
vul je één keer in de Admin console.

**Terugzetten uit het logboek**, op dezelfde pagina: kies een periode en klik
"Uit Google lezen". De site leest de verhuizingen (`MOVE_USER_TO_ORG_UNIT`) zelf
uit het logboek van de Admin console, standaard enkel die van haar eigen
beheerdersaccount, en toont per account waar het stond en waar het nu staat.
Daarvoor is de scope `admin.reports.audit.readonly` nodig in de delegatie
(stap 2); ontbreekt ze, dan zegt het scherm hoe je ze toevoegt en loopt de rest
gewoon door. Een account gaat enkel terug als het
nog staat waar die verhuizing het zette. Gebouwd na 16 november 2026, toen de
sync tientallen accounts naar `/` verhuisde (zie "Vallen").

### Een lid toevoegen: één zoekveld

In het tabblad Leden zoekt "Lid, account of adres" tegelijk in de leden van de
site en in de accounts van Google Workspace (vijf minuten gecachet,
`lib/google/directoryCache.ts`). Rechts op elke rij staat **SITE**, **GW** of
**ADRES**. Een lid van de site komt in de lijst met zijn gekoppelde
`@vtk.be`-adres; heeft het er geen (enkel een privéadres op de site), dan zegt de
rij dat, en kies je de GW-rij met zijn `@vtk.be`-account. Een account dat al aan
een lid hangt, staat één keer, als lid. Een getypt adres dat nergens bij past,
voeg je toe als vrij adres. Een werkgroep die haar eigen lijsten beheert, kiest
nog altijd enkel uit haar eigen leden.

### Wijzigingen in de Admin console

Een lid toevoegen of verwijderen in de Admin console mag: de volgende ronde
neemt het over. Een toegevoegd lid komt als los lid op de site ("toegevoegd in
Google"), een verwijderd lid gaat ook op de site uit de lijst (een uitsluiting
als het er via een post in zat). Zie `docs/design-decisions.md`, "Een wijziging
in Google wordt overgenomen". De toegangsinstellingen (wie mag posten) zet de
sync wel terug; die stel je op de site in.

### Standaardinstellingen van een groep

Elke beheerde groep krijgt bij elke sync dezelfde toegangsinstellingen
(`wantedGroupSettings` in `lib/google/sync.ts`, vastgezet in
`test/googleGroupSettings.test.ts`): iedereen mag de eigenaars contacteren en
posten, enkel leden zien de gesprekken en de ledenlijst, enkel eigenaars en
beheerders beheren de leden, externe leden mogen. Het vinkje "mail van buiten
toelaten" zet posten op enkel de organisatie. Wie bij één lijst iets anders wil,
zet "de site beheert dit adres" uit; anders zet de volgende sync het terug.

### Jaargroepen (`activiteiten_2627@vtk.be`)

Open `activiteiten@vtk.be`, vul bij **Jaargroepen** `activiteiten_{jj}` en de
post Activiteiten in. Vanaf dan:

- maakt de sync `activiteiten_2627@vtk.be` met de leden van Activiteiten
  2026-27, en `activiteiten_2728` zodra iemand in de post van 2027-28 staat;
- hangt de jaargroep van het lopende jaar in `activiteiten@vtk.be`, en op 15 juli
  de nieuwe in de plaats van de oude;
- wordt een jaargroep van een voorbij jaar archief: niemand erbij, niemand eruit.

Was `activiteiten_2526` al overgenomen, dan wordt ze gekoppeld en archief, en
verdwijnen de jaargroepen die als los adres in de hoofdgroep stonden (de sync
hangt er nu zelf de juiste in). Groep 5 en de tablet blijven losse adressen.

### POC-lijsten

`/admin/pocs` → **Groepsadressen aanmaken of koppelen** maakt per POC met een
adres een lijst met de POC als bron, of zet de POC als bron op de overgenomen
lijst. Een POC-lijst volgt de vertegenwoordigers van `Poc.mailYear`; leeg is het
huidige werkingsjaar. Na de verkiezing: kies het tabje van het nieuwe jaar en
klik **verkozen: lijsten overzetten** (of per POC het vinkje). Wie je vooraf
voor dat jaar invoerde, kwam er tot dan niet in.

Een vertegenwoordiger zonder `@vtk.be`-account komt met het adres waarmee hij op
de site staat in de lijst; dat is meestal zijn studentenadres.

### Werkgroepen die hun eigen adressen beheren

1. IT vult bij `/admin/groepsadressen/aanvragen` → **Voorvoegsels** het
   voorvoegsel van de werkgroep in (`statix`).
2. Wie in die werkgroep haar leden mag beheren
   (`werkgroepen.manageOwnMembers`, de grant op de werkgroep zelf) ziet vanaf
   dan de tab Groepsadressen met enkel de lijsten waarvan de werkgroep
   eigenaar is, kan een nieuwe `statix.<iets>@vtk.be` maken, leden van de
   werkgroep in en uit zijn lijsten zetten, en accounts aanvragen.
3. Een overgenomen `statix.*`-lijst geef je de werkgroep als eigenaar bij de
   instellingen van die lijst.
4. Aanvragen staan bij `/admin/groepsadressen/aanvragen` voor wie
   `googleAccounts.manage` heeft (IT, de vice). Goedkeuren maakt het account
   meteen aan, in de volwaardige OU; het wachtwoord staat één keer op het scherm.

Een werkgroepaccount is een tweede account naast het persoonlijke. In de lijsten
van de werkgroep komt het werkgroepadres, elders het persoonlijke (zie
`memberAddress` in `lib/google/members.ts`).

### Een eerste groepsadres

1. `/admin/groepsadressen` → **Nieuw groepsadres** (rechtsboven):
   `activiteiten@vtk.be`, naam "Activiteiten", als bronnen post **Activiteiten**
   en post **Groep 5**, "mail van buiten toelaten" aan. Losse leden en een
   categorie kunnen in hetzelfde formulier. Dat g5 overal in zit, staat dus als
   zichtbare rij; wie het anders wil, haalt de rij weg.
2. Het adres opent meteen en toont hoeveel leden die regel oplevert, en wie er
   nog geen `@vtk.be`-adres heeft. Dat berekenen we zelf, los van Google.
3. Met bronnen of leden duwt de site de groep meteen naar Google; anders doet
   de volgende ronde het (of het icoon "Nu synchroniseren" naast het zoekveld).
   Bestaat de groep al in Google, dan wordt ze hergebruikt op het adres.

Begin met één adres en kijk in Google na wat er gebeurde voor je de rest
aanmaakt.

### Het Drive-account voor het Bestuursorgaan

`/admin/bestuursorgaan` leest de map Bestuursorgaan op de gedeelde drive
Praesidium (zie `docs/bestuursorgaan.md`). Dat gebeurt met dezelfde sleutel, maar
**als een ander account** dan de beheerder van stap 3: een beheerdersrol geeft
geen toegang tot de bestanden van een gedeelde drive waar je geen lid van bent.

1. Zet de **Google Drive API** aan in het Cloud-project en voeg
   `https://www.googleapis.com/auth/drive.readonly` toe aan de delegatie van
   stap 2. Ontbreekt hij, dan faalt enkel de BO-scan; de groepssync loopt door.
2. Kies het account dat de site impersoneert, bij voorkeur een eigen account
   zoals `bo-scan@vtk.be` in plaats van een persoon: wie het praesidium verlaat,
   verliest zijn toegang, en dan valt de scan stil. Het moet **lid zijn van de
   gedeelde drive Praesidium** (lezer volstaat) en de mappen kunnen openen
   waarnaar de snelkoppelingen in de BO-map wijzen: de rekenbladen van de posten
   en de mappen van de werkgroepen. Voeg het als lezer toe aan de gedeelde
   drive, en deel de mappen van de werkgroepen ermee. Zet het niet als los adres
   in `praesidium@vtk.be`: dan krijgt het ook elke mail aan het praesidium.
3. Vul het in bij `/admin/it`, veld **Drive account (Bestuursorgaan scan)**.
4. Groep 5 vult in `/admin/bestuursorgaan` bij Instellingen de link naar de
   gedeelde drive in en klikt **Nu lezen**. Daarna leest de worker de map om het
   halfuur.

`drive.readonly` is breed: met domain-wide delegation kan de sleutel daarmee de
bestanden van elk account in het domein lezen. Dat is waarom het account in het
superadminscherm staat en niet in het scherm van Groep 5, en waarom de scan enkel
leest wat onder de ingestelde map hangt. De sleutel kon via
`admin.directory.user` al wachtwoorden zetten, dus wie hem heeft, kon dit al;
wie de scope liever niet geeft, laat het veld leeg en de rest werkt gewoon.

### `praesidium@vtk.be` en de gedeelde drives

Gebruik als bron **"Elke praesidiumpost"** in plaats van vijftien losse rijen.
Die regel blijft kloppen als er een post bijkomt.

Voor de gedeelde drives is er niets te synchroniseren: zet die groep één keer als
lid op de drive (`Praesidium`, `Kiesploegen`), en de toegang volgt vanaf dan
dezelfde regel als het mailadres. Zie `docs/design-decisions.md` voor de vallen,
waarvan de belangrijkste: een **los adres** in zo'n groep krijgt óók
drive-toegang.

---

## De kiesploeg, stap voor stap door het jaar

**1. De ploeg start, enkel de g5 is bekend**

- `/admin/kiesploeg` → nieuwe kiesploeg: code `epsilon`, werkingsjaar `2027`,
  formele naam "Kiesploeg Epsilon". De sjablonen staan standaard op
  `voornaam.naam@vtk.be` (account), `voornaam.naam.kiesploegepsilon@vtk.be`
  (kiesploegadres) en `epsilon.<post>@vtk.be` (lijsten).
- Voeg de posten toe die al bestaan, minstens de **g5** (vink "dit is de g5"
  aan) en **beheer**, en de g5-leden.
- Zet bij wie mag mailen **Mailen: vanaf kiesploegadres**. Vanaf het primaire
  adres mailt geen enkel kiesploeglid; de rest ontvangt enkel.
- **Accounts aanmaken** → kies de kiesploeg. Wie nog geen account heeft, krijgt
  `voornaam.naam@vtk.be` met het kiesploegadres erop. **Wie al een account heeft
  (een praesidiumlid dat in de ploeg stapt), krijgt geen tweede account**, enkel
  het kiesploegadres erbij, en als afzender wanneer hij mag mailen. Noteer de
  wachtwoorden meteen: ze staan er één keer.
- **Standaardlijsten aanmaken** zet `epsilon.g5@vtk.be` en
  `epsilon.beheer@vtk.be` klaar, telkens met die post en de g5 als bron.

**2. De volledige ploeg komt erbij**

- Leden toevoegen, post nog leeg waar die niet bekend is.
- Vul eventueel een **doorstuuradres** in: zolang ze geen post hebben, gaat de
  mail daarheen.
- Accounts aanmaken zoals bij stap 1. Nieuwe accounts komen in
  `/Kiesploeg/Ontvangen`; wie mag mailen, verhuist naar `/Kiesploeg/Verzenden`.

**3. Mensen vallen af of komen erbij**

Lidmaatschap aanpassen; de reconcile zet Google recht binnen de vijf minuten.

**4. Verkozen: de postverdeling voor volgend jaar**

- Voer de praesidiumverdeling in bij `/admin/groepen` met het **volgende
  werkingsjaar** (de eerste keer met `?jaar=2027` in de adresbalk).
- Het kiesploegscherm toont vanaf dan **Op 15 juli**: wie volwaardig wordt en
  wie geschorst wordt. Kijk dat een week vooraf na.
- Op 15 juli kantelt `currentWorkingYear()`. De eerstvolgende reconcile:
  - maakt wie een post heeft volwaardig (eigen mailbox, doorsturen uit);
  - schorst wie geen post kreeg, enkel een account dat de kiesploeg maakte, en
    enkel wanneer er een postverdeling voor dat jaar ingevoerd is;
  - haalt het kiesploegadres weg bij iedereen van de ploeg
    (`KiesploegMember.aliasRemovedAt`, daarna `Kiesploeg.transitionedAt`).
- Een geschorst account zet je terug open met **Account terug openzetten** in
  het kiesploegscherm; de sync schorst het daarna niet opnieuw. Krijgt iemand
  later toch een post, dan maakt de sync hem vanzelf volwaardig.
- Het vertrekkende praesidium verliest zijn plaats in de lijsten, maar **niet**
  zijn mailbox: een volwaardig account degradeert de sync nooit.

## Vallen waar we in gelopen zijn (of die op je liggen te wachten)

- **`unauthorized_client` betekent bijna altijd de delegatie.** Niet de sleutel,
  niet de API's. Vergelijk de scopelijst letterlijk met `GOOGLE_SCOPES` en
  `GMAIL_SCOPES`; een ontbrekende komma volstaat.
- **De Gmail-instellingen lopen als het lid zelf**, niet als de beheerder.
  Daarvoor is een tweede tokenaanvraag met een andere `sub` nodig, en daarom
  moeten die twee scopes ook los gedelegeerd zijn. Vergeet je dat, dan werkt
  alles behalve het afzenderadres en het doorsturen; de sync meldt dat als
  waarschuwing en gaat door.
- **Een doorstuuradres moet bevestigd worden.** Google stuurt een mail naar het
  doeladres en tot iemand daarop klikt, gebeurt er niets. Dat is hier geen bug
  maar een kenmerk: die bevestiging is het bewijs dat het adres van hen is.
- **Google's defaults weigeren externe afzenders.** Een adres waar bedrijven en
  profs naartoe mailen, moet `ANYONE_CAN_POST` staan. De sync zet dat, maar
  raakt de **spam-moderatie** bewust niet aan: staat die op modereren, dan
  belandt post in een wachtrij die niemand leest. Kijk dat na als mail lijkt te
  verdwijnen.
- **`hd=vtk.be` is een filter, geen beveiliging.** De koppelflow controleert het
  domein en `email_verified` server-side, en haalt de id uit de directory. Sleutel
  daar niets aan los.
- **Drive-toegang volgt niet meteen.** Google cachet groepslidmaatschap voor
  Drive; reken op minuten. "Ik zie niets" is meestal wachten.
- **Het adres van een verwijderd account komt niet meteen vrij.** Verwijder
  daarom geen accounts; suspendeer ze.
- **De koppelgate heeft een ontsnapping, en dat is opzet.** Wie nog geen account
  heeft, kan niets doen aan wat de gate vraagt. De knop "ik heb nog geen
  VTK-account" stelt zeven dagen uit (`GOOGLE_LINK_DEFER_MS` in `proxy.ts`) en
  zet `User.googleLinkDeferredAt`, wat meteen de lijst is van wie op een account
  wacht.
- **Zonder postverdeling schorst de sync niemand.** Staat er op 16 juli nog
  geen enkel lidmaatschap in een praesidiumpost van het nieuwe jaar, dan houdt
  `postsEnteredFor` de schorsingen tegen. Dat is een vangnet, geen planning:
  één ingevoerde post volstaat om het los te laten, dus voer de verdeling
  volledig in voor 15 juli.
- **Overnemen kopieert, de bron vervangt.** Zet je een bron op een overgenomen
  lijst zonder de overgenomen adressen te wissen, dan staat iedereen er twee
  keer om dezelfde reden in, en blijft een oud-lid erin staan dat de bron al
  liet vallen. Wis ze pas nadat de berekende lijst klopt.
- **Volwaardig maken verhuist enkel uit de kiesploeg-OU's.** Tot 17 november
  2026 zette de sync elk account dat volwaardig werd in de "full" OU (`/`),
  ook de eerste keer dat ze het zag. Na het koppelen van de bestaande accounts
  verhuisde zo iedereen met een post uit /Praesidium, /Statix en /Oude Zakken
  naar /, en zette de sync bij hen het doorsturen uit en de standaardafzender
  terug. Nu haalt ze een account enkel uit de OU voor enkel ontvangen of voor
  mailen vanaf het kiesploegadres, en raakt ze doorsturen en afzender enkel aan
  bij een account dat ze zelf beperkte (`isInLimitingOrgUnit` en `setBySite` in
  `lib/google/accountState.ts`). Een eigen OU van de kring is van de kring.
- **Een naamgenoot krijgt `jan.peeters2@vtk.be`.** Kijk het voorbeeldscherm na
  voor je aanmaakt; een adres is achteraf lastig te veranderen.

---

## Bewust niet gebouwd

- **Geen beheer van gedeelde drives.** Een gedeelde drive kan een groep als lid
  hebben, en die beheren we al; wie er lid van is, automatiseren we dus niet.
  De Drive-scope wordt enkel gebruikt om de map van het Bestuursorgaan te
  lezen (`docs/bestuursorgaan.md`), en nooit om te schrijven.
- **Geen accounts verwijderen.** Schorsen doet de sync enkel bij een
  kiesploeglid zonder post na 15 juli. Wat er gebeurt met de mailbox van iemand
  die de kring verlaat, is een kringkeuze die nog niet gemaakt is.
- **Geen beheer van groepen die we niet kennen.** Een Google-groep zonder
  `MailGroup`-rij wordt niet aangeraakt; enkel het overnemenscherm leest de
  lijst. Wie een groep met de hand wil blijven onderhouden, neemt ze niet over
  (of zet "de site beheert dit adres" uit).
- **De sync verwijdert nooit een groep.** Aan een groepsadres hangt het
  archief, en het staat op affiches en in mailhandtekeningen. Verwijderen doet
  enkel een mens, op het overzicht (zie "Opruimen" hierboven).
- **Geen routing- of complianceregels via de API.** Die bestaan niet publiek;
  daarom de OU-constructie uit stap 4.
