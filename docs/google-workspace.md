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
| `apps/web/lib/google/sync.ts`                    | `reconcileGoogle()` en de push per post/kiesploeg                        |
| `apps/web/lib/google/accountState.ts`            | Beperkt versus volwaardig, en de upgrade-only-regel                      |
| `apps/web/lib/google/addresses.ts`               | Adressjablonen, normalisatie, botsingen, wachtwoord                      |
| `apps/web/lib/google/provision.ts`               | Accounts plannen en aanmaken                                             |
| `apps/web/lib/google/linking.ts` + `link.ts`     | Naamvoorstellen voor het koppelscherm                                    |
| `apps/web/lib/google/oauthLink.ts`               | "Koppel je VTK-account": de OAuth-stroom                                 |
| `apps/web/app/api/google/maintenance/route.ts`   | Wat de `google-worker` elke 5 minuten aanroept                           |
| `apps/web/app/api/google/link/*`                 | Start en terugkeer van de koppeling                                      |
| `apps/web/proxy.ts` (`gateRedirect`)             | De verplichte koppeling voor praesidium- en werkgroepleden               |

| Route                                | Wat                                                            | Recht                    |
| ------------------------------------ | -------------------------------------------------------------- | ------------------------ |
| `/admin/groepsadressen`              | Lijsten opbouwen, bronnen, losse adressen, nu synchroniseren   | `mailgroups.manage`      |
| `/admin/groepsadressen/koppelingen`  | Bestaande `@vtk.be`-accounts aan leden hangen                  | `mailgroups.manage`      |
| `/admin/groepsadressen/accounts`     | Accounts aanmaken (voorbeeld eerst)                            | `googleAccounts.manage`  |
| `/admin/kiesploeg`                   | Kiesploeg, haar posten, leden en adressjablonen                | `kiesploeg.manage`       |
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
kiesploegaccounts), zet dan ook de **Gmail API** aan.

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
   https://www.googleapis.com/auth/gmail.settings.sharing
   ```

   Ze staan ook in `apps/web/lib/google/client.ts` (`GOOGLE_SCOPES` en
   `GMAIL_SCOPES`); dat is de bron van waarheid als er ooit één bijkomt.

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
mensen in en uit die OU.

1. **Directory → Organisatie-eenheden**: maak `/Kiesploeg/Beperkt` aan (de naam
   mag anders, je vult hem straks in bij Admin > IT).
2. **Apps → Google Workspace → Gmail → Routing**: voeg een regel toe op die OU,
   voor **uitgaande** berichten, met als actie **Reject message**. Beperk ze tot
   afzenders in die OU en laat de kiesploegalias door. Test ze met één account
   voor je de hele ploeg erin zet.
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
| Restricted org unit       | `/Kiesploeg/Beperkt` uit stap 4                                    |
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
npm run db:seed           # zet de nieuwe permissies in de registry
```

Ken daarna in `/admin/roles` de rechten toe: `mailgroups.manage` aan wie de
lijsten beheert, `googleAccounts.manage` aan wie accounts aanmaakt,
`kiesploeg.manage` aan wie de kiesploeg opvolgt. Bewust drie rechten: accounts
aanmaken is iets anders dan een lijst bijwerken.

---

## In gebruik nemen

### Bestaande accounts koppelen

`/admin/groepsadressen/koppelingen` leest de directory en stelt koppelingen voor
op naam. Enkel **eenduidige** overeenkomsten worden voorgesteld; naamgenoten
staan apart met een keuzelijst. "Alle voorstellen koppelen" herberekent
server-side en neemt niet over wat de browser terugstuurt.

Wat overblijft lost zichzelf op: nieuwe accounts worden door de site aangemaakt
(dan klopt de koppeling per constructie) en leden koppelen zichzelf via de gate.

### Een eerste groepsadres

1. `/admin/groepsadressen` → **Nieuw groepsadres**: `activiteiten@vtk.be`, naam
   "Activiteiten", "mail van buiten toelaten" aan.
2. Open het adres en voeg de bronnen toe: post **Activiteiten** en post **Groep
   5**. Dat g5 overal in zit, staat dus als zichtbare rij; wie het anders wil,
   haalt de rij weg.
3. Het scherm toont meteen hoeveel leden die regel oplevert, en wie er nog geen
   `@vtk.be`-adres heeft. Dat berekenen we zelf, los van Google, zodat je het
   ziet vóór de eerste sync.
4. **Nu synchroniseren.** Bestaat de groep al in Google, dan wordt ze
   hergebruikt op het adres; anders aangemaakt.

Begin met één adres en kijk in Google na wat er gebeurde voor je de rest
aanmaakt.

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

- `/admin/kiesploeg` → nieuwe kiesploeg: code `2027`, werkingsjaar `2027`,
  formele naam "Kiesploeg Delta". De informele naam mag leeg blijven; de
  adressen hangen aan de code.
- Voeg de posten toe die al bestaan, minstens de **g5** (vink "dit is de g5"
  aan) en **beheer**.
- Voeg de g5-leden toe, nog zonder post als de verdeling er niet is.
- **Accounts aanmaken** → kies de kiesploeg. Je ziet per persoon het
  voorgestelde adres (`voornaam.achternaam@vtk.be`) en de alias
  (`kiesploeg2027.voornaam.achternaam@vtk.be`). Vink aan, maak aan, **noteer de
  wachtwoorden meteen**: ze staan er één keer en nergens anders.
- **Standaardlijsten aanmaken** zet `g5.2027@vtk.be` en `beheer.2027@vtk.be`
  klaar (volgens het lijstsjabloon `{post}.{code}`), telkens met die post en de
  g5 als bron.

  Wil je voor die twee de omgekeerde volgorde (`2027.g5@vtk.be`), dan is er één
  sjabloon per ploeg en dus één vorm voor álle lijsten. Kies dan `{code}.{post}`,
  of maak die twee adressen met de hand aan bij Groepsadressen met de
  kiesploegpost als bron; het resultaat is hetzelfde.

**2. De volledige ploeg komt erbij**

- Leden toevoegen, post nog leeg waar die niet bekend is.
- Vul per lid het **doorstuuradres** in: zolang hun mailbox beperkt is, gaat de
  mail daarheen.
- Wie nu al moet kunnen mailen (marketing) krijgt het vinkje **"mag nu al
  mailen"**. Dat wint van de afgeleide staat.
- Accounts aanmaken zoals bij stap 1. Nieuwe accounts komen meteen in de
  beperkte OU terecht.

**3. Mensen vallen af of komen erbij**

Lidmaatschap aanpassen; de reconcile zet Google recht binnen de vijf minuten.
Iemand verwijderen haalt hem uit de lijsten maar **sluit zijn account niet af**;
dat is een bewuste beslissing die nog openstaat.

**4. Verkozen: de postverdeling voor volgend jaar**

- Voer de praesidiumverdeling in bij `/admin/groepen` met het **volgende
  werkingsjaar**. De jaarbalk toont dat jaar pas zodra er een lidmaatschap in
  staat, dus zet er de eerste keer `?jaar=2027` achter in de adresbalk; daarna
  staat het tabje er gewoon.
- Op 15 juli kantelt `currentWorkingYear()`. De eerstvolgende reconcile zet de
  nieuwe mensen in `activiteiten@vtk.be` en gezelschap, verplaatst hun account
  naar de volwaardige OU, zet het doorsturen uit en geeft hun verzendrecht.
- Het vertrekkende praesidium verliest zijn plaats in de lijsten, maar **niet**
  zijn mailbox: automatisch degraderen doet de sync nooit.

Zet de ploeg daarna op **inactief** in het kiesploegscherm. Haar lijsten blijven
bestaan; enkel de accountstaat wordt niet meer uit die ploeg afgeleid.

---

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
- **Een naamgenoot krijgt `jan.peeters2@vtk.be`.** Kijk het voorbeeldscherm na
  voor je aanmaakt; een adres is achteraf lastig te veranderen.

---

## Bewust niet gebouwd

- **Geen Drive-koppeling.** Een gedeelde drive kan een groep als lid hebben, en
  die beheren we al. De Drive-scope is breed en zou enkel een handeling
  automatiseren die je per drive één keer doet.
- **Geen accounts afsluiten of verwijderen.** Wat er gebeurt met de mailbox en
  de Drive-bestanden van iemand die de kring verlaat, is een kringkeuze die nog
  niet gemaakt is. Tot dan degradeert en suspendeert de sync niemand.
- **Geen beheer van groepen die we niet kennen.** Een Google-groep zonder
  `MailGroup`-rij wordt niet gelezen en niet aangeraakt, zodat IT lijsten met de
  hand kan blijven onderhouden.
- **Geen groepen verwijderen.** Aan een groepsadres hangt het archief, en het
  staat op affiches en in mailhandtekeningen.
- **Geen routing- of complianceregels via de API.** Die bestaan niet publiek;
  daarom de OU-constructie uit stap 4.
