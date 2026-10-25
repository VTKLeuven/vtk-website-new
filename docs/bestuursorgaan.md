# Bestuursorgaan (budgetten en resultaten per post)

Elke week passeren op het Bestuursorgaan (BO) de budgetten en resultaten van de
posten. Die staan op de gedeelde drive Praesidium, in een vaste structuur.
`/admin/bestuursorgaan` (in de zijbalk onder Beheer als "Budgetten &
Resultaten") leest die map en toont in een verkenner met drie panelen per post
en per BO welke budgetten er al passeerden, of er al een resultaat is, en de
bedragen uit de rekenbladen, tot op de post (Zaal, Drank) toe.

Dit document beschrijft **hoe het werkt en waar het misloopt**. Het waarom van de
keuzes (enkel Groep 5, de naam wint, niets terugschrijven) staat in
`docs/design-decisions.md`, sectie "Bestuursorgaan". Het Drive-account en de
scope zet je op zoals in `docs/google-workspace.md`, sectie "Het Drive-account
voor het Bestuursorgaan".

---

## In één oogopslag

```
  Gedeelde drive Praesidium                         VTK-site
  ─────────────────────────                         ────────
  2026 - 2027 Tortubois                              google-worker (elke 5 min)
  └── Bestuursorgaan                                   └── om het halfuur: scanBestuursorgaan()
      ├── BO 5 - 20/09            ──▶ BoMeeting               │
      │   ├── Budgetten                                        ▼
      │   │   ├── 26-27_Budget_Theokot_Frigo  ──▶ BoDocument  (naam, map, bedragen)
      │   │   └── Budgetten (snelkoppeling              │
      │   │        naar de map van een werkgroep)        ▼
      │   └── Resultaten                         buildOverview(): per post, per
      └── Schriftelijke goedkeuring              activiteit een dossier
```

De site **leest enkel**. Ze schrijft niets in Drive, hernoemt niets en verplaatst
niets. Wat in Drive fout staat, zet je in Drive recht; het overzicht zegt waar.

---

## Waar wat staat

| Bestand                                          | Inhoud                                                             |
| ------------------------------------------------ | ------------------------------------------------------------------ |
| `apps/web/lib/bo/names.ts`                       | Namen van mappen en bestanden ontleden (puur, getest)              |
| `apps/web/lib/bo/posts.ts`                       | Welke post bij een naam hoort, met de aliassen (puur, getest)      |
| `apps/web/lib/bo/figures.ts`                     | De bedragen uit het blok "Overzicht" van het rekenblad (getest)    |
| `apps/web/lib/bo/dossiers.ts`                    | Budget en resultaat samenleggen, cijfers per post en per BO (puur) |
| `apps/web/lib/bo/explorer.ts`                    | Het overzicht als JSON voor de browser (datums als tekst)          |
| `apps/web/lib/bo/scan.ts`                        | De BO-map lezen en `BoMeeting`/`BoDocument` bijwerken              |
| `apps/web/lib/bo/settings.ts`                    | `bestuursorgaan.config` (waar de map staat) en de laatste scan     |
| `apps/web/lib/google/client.ts`                  | De Drive-aanroepen en `DRIVE_SCOPES`                               |
| `apps/web/app/api/google/maintenance/route.ts`   | Waar de worker de scan om het halfuur start                        |
| `apps/web/lib/bo/list.ts`                        | Filteren en groeperen voor de lijstweergave (puur, getest)         |
| `apps/web/lib/bo/views.ts`                       | De twee weergaven en de sleutel van de voorkeur                    |
| `apps/web/app/[locale]/admin/bestuursorgaan/`    | Het scherm: `BoViews.tsx` kiest tussen `BoExplorer.tsx` en `BoList.tsx`; wat ze delen staat in `BoParts.tsx`, "Na te kijken" en "Post wijzigen" in `BoReview.tsx` |
| `apps/web/components/admin/SearchMultiPicker.tsx` | De doorzoekbare keuzelijst met meer dan één keuze (twee posten)   |
| `apps/web/app/actions/bestuursorgaan.ts`         | Nu lezen, de map instellen, posten en resultaten koppelen          |
| `apps/web/lib/bo/own.ts`                         | Wat een post zelf ziet: haar posten, de volgorde, wat open staat (puur, getest) |
| `apps/web/app/[locale]/admin/bestuursorgaan/mijn/` | "Mijn budgetten" voor elke post (`BoOwn.tsx`); het blok op het dashboard is `BoDueCard.tsx` |

Het recht is `bestuursorgaan.manage`, via de rol `bestuursorgaan` aan Groep 5.
De rol `admin` draagt het bewust niet (`ADMIN_EXCLUDED_PERMISSIONS` in
`packages/db/src/permissions.ts`); de seed en de sync bij elke start slaan het
daar over. Een post ziet wel haar **eigen** budgetten, zonder recht; zie "Wat
een post zelf ziet" onderaan.

---

## Wat de scan leest

1. **De jaarmap.** In de ingestelde map (de drive Praesidium) zoekt de scan een
   map die begint met `2026 - 2027` (of `26-27`), en daarin `Bestuursorgaan`.
   Hij leest het lopende werkingsjaar en het vorige: de resultaten van vorig jaar
   komen nog binnen in de eerste BO's van het nieuwe. Heet een jaarmap anders,
   dan vult Groep 5 bij Instellingen de map Bestuursorgaan van dat jaar met de
   hand in.
2. **De vergaderingen.** Elke map `BO <n> - <dd/mm>` (ook `BO 4 - Begrotings BO -
   11/09`) en `Schriftelijke goedkeuring`. Andere mappen (sjablonen, een archief)
   slaat hij over en noemt hij op het scherm. Het jaar van `20/09` staat niet in
   de naam; het volgt uit wanneer de map aangemaakt werd, zodat `BO 0 - 25/06`
   in juni van het beginjaar valt en een BO eind juni van het eindjaar in het
   eindjaar.
3. **Wat onder een vergadering staat**, tot vier mappen diep. Snelkoppelingen
   worden gevolgd, naar bestanden en naar mappen. Een bestand telt wanneer de
   naam zegt dat het een budget of resultaat is, of wanneer het een rekenblad in
   een map `Budgetten` of `Resultaten` is. De agenda, het verslag, de slides en
   een offerte als pdf tellen niet. Bij een snelkoppeling bewaart de scan het
   doel (`name`, het bestand zelf) én de naam van de snelkoppeling
   (`linkName`): die tweede blijft staan wanneer de post het blad later
   hernoemt.
4. **De bedragen**, enkel bij een Google Sheet of een xlsx. Een Sheet wordt als
   xlsx geëxporteerd, zodat één lezer (`lib/praesidiumShifts/xlsx.ts`) beide
   leest, met de laatst berekende waarde van elke formule. Een ongewijzigd
   bestand (zelfde `modifiedTime`) wordt niet opnieuw gedownload.

De BO van een bestand is **de map in de hoofdboom waarlangs het gevonden werd**,
niet de map waar het echt staat: de map van een werkgroep heet `BO 7 - 4/10`
terwijl de hoofdmap `BO 7 - 04/10` heet.

Wat de scan niet meer vindt, wordt niet gewist maar krijgt `missingSince`. Het
overzicht is een register van wat er langs het BO passeerde.

## De naam van een bestand

De afspraak is `<jaar>_<Budget|Resultaat>_<post>_<activiteit>`. Wat de scan
daarnaast aanvaardt, omdat het in de map van 26-27 voorkwam:

| In de map                                     | Wordt                                          |
| --------------------------------------------- | ---------------------------------------------- |
| `26-27_budget_cursusdienst_zakjes`            | kleine letters maken niet uit                  |
| `26-27_Budget_Sport: VTKlimmen`               | een dubbelpunt telt als scheiding              |
| `26-27_Budget_Statix_Ontbijt .xlsx`           | de extensie (en de spatie ervoor) valt weg     |
| `26-27_Cultuur_Budget_VTK-Reis_Vluchten`      | de post mag vóór het soort staan               |
| `26-27_Development_ECC` in Budgetten          | geen soort in de naam: de map beslist          |
| `26-27_Budget_Statix_Ontbijt` in Resultaten   | **de naam wint**, en het scherm noemt de map   |
| `Budget Sport VTKlimmen`                      | spaties in plaats van underscores              |
| `26_27_...`, `2627_...`, `2026-2027_...`      | het jaar mag anders geschreven zijn            |
| `2026/09/07 Eetstand Wiskundeweek Begroting`  | een datum vooraan valt weg; "Begroting" achteraan is een budget |
| `26-27_Budget_Statix-Talks`                   | een streepje waar een underscore hoorde: Statix, activiteit Talks |
| `26-27_Budget Cultuur+Onthaal_Jeneverwandeling` | soort en post in één stuk, en twee posten   |

**De post** wordt herkend aan de naam, de code of de slug van een post, en aan
een afkorting die van precies één post het begin is (`Acti` is Activiteiten).
Daarnaast zijn er zes vaste vakken die geen `Group` zijn (`BO_EXTRA_POSTS` in
`lib/bo/posts.ts`): de vier rollen van Groep 5 (Praeses, Vice-praeses,
Secretaris, Beheer) en Jaarwerkingen (met Halftime en Studentenwelkom) en
Overige. Een post heet in de code een **sleutel**: `g:<groupId>` voor een post
of werkgroep, `x:vice` en zo voor een vak, en `l:<schrijfwijze>` voor een naam
die de site (nog) niet kent.

Een activiteit kan bij **meer dan één post** horen (`Dossier.postKeys`):
`Cultuur+Onthaal` (ook met `&`, `/`, `,` of " en ") wordt beide, maar enkel als
elk deel herkend wordt. Ze staat dan bij elke post en telt in elk totaal één
keer; wie een som maakt over posten heen, ontdubbelt op `dossier.key`.

Wat de site niet herkent, staat bij "Na te kijken", met een doorzoekbare lijst
waarin je één of meer posten aanvinkt:

- standaard geldt de keuze **enkel voor dat bestand** (`BoDocument.postKeys`).
  Een naam die geen post bleek ("Eetstand" bij Onthaal), blijft dan deel van de
  activiteit: "Eetstand Wiskundeweek";
- vink je "Ook voor volgende bestanden met ..." aan, dan wordt het een
  **schrijfwijze** (`BoPostAlias.postKeys`) die voor elk volgend bestand geldt,
  zoals `WERKGROEPEN`. Een naam zonder letters (enkel een datum) heeft dat
  vinkje niet.

Zit de naam ernaast, dan zet "Post wijzigen" in het detail van een activiteit
de post(en) voor al haar bestanden (`BoDocument.postKeys`); dat wint van de
naam en van een koppeling, en leeg toepassen zet het terug. Zonder keuze
verdwijnt er niets: de bestanden staan dan onder "Niet herkend".

**Budget en resultaat kunnen één blad zijn.** Het sjabloon heeft een kolom
Budget en een kolom Resultaat; een post vult de tweede vaak later in, hernoemt
het blad van `Budget` naar `Resultaat` en hangt het in de map Resultaten van
een latere BO. Wat het bestand op een BO was, beslist daarom per BO
(`kindAt` in `dossiers.ts`):

1. de naam van de snelkoppeling in die BO-map (die heet op de BO van het
   budget nog `Budget`);
2. anders de naam van het blad;
3. anders de map;
4. en een blad dat in Budgetten stond en op een latere BO als resultaat
   terugkomt, was op die eerste BO het budget, ook als het nu `Resultaat` heet.
   Dat vangt een werkgroep op die haar eigen map in de BO-map hangt (daarin
   staat het blad zelf, zonder snelkoppeling die de oude naam bewaart).

Het blad staat dan twee keer in het detail: als budget op de eerste BO en als
resultaat op de latere, elk met "zelfde blad als ...". Het budget is de kolom
Budget, het resultaat de kolom Resultaat. Een blad dat nog `Budget` heet maar
op een latere BO in Resultaten staat, blijft volgens de naam een budget ("ook
in BO 9").

**Een versie** achteraan de naam (`_v2`, `versie 3`, `(1)`, `_final`) of
"Kopie van" vooraan valt weg uit de activiteit (`ParsedDocumentName.version`):
de versies staan onder één activiteit, en het laatste budget telt (op dezelfde
BO de hoogste versie).

**Niet meetellen** haalt een bestand (of alle bestanden van een activiteit) uit
het overzicht: `BoDocument.hiddenAt`, voor elke rij met hetzelfde
`driveFileId`. `buildOverview` slaat het over, ook bij Na te kijken. De scan
raakt die kolom niet aan, dus het blijft weg; terugzetten gebeurt onder
Instellingen ("Niet meegeteld").

**Budget en resultaat horen samen** wanneer jaar en activiteit gelijk zijn en ze
minstens één post gemeen hebben, na het wegvegen van hoofdletters, accenten en
leestekens (`Familie- en vriendencantus` is `Familie en Vriendencantus`;
`Cultuur+Onthaal_Jeneverwandeling` en `Cultuur_Jeneverwandeling` zijn één
activiteit). Lijkt een resultaat op geen enkel budget, dan staat het bij "Na te
kijken" met de open budgetten van hetzelfde jaar, die van dezelfde post
bovenaan, en kiest Groep 5 er één (`BoDocument.pairedBudgetId`), of zegt ze dat
er geen budget op het BO kwam: "Versneld goedgekeurd door de grocomeet" of "Geen
budget nodig" (`BoDocument.budgetWaiver`). Dan telt het resultaat als afgerond,
zonder afwijking.

## De bedragen

Elke post vertrekt van het sjabloon van de penning: een blok "Overzicht" met de
kolommen Budget en Resultaat, en daaronder Inkomsten, Uitgaven, Totaal en
Begroting. Rechts staat "Info" met de datum. `figuresFromSheet` zoekt dat blok
**op zijn labels**, niet op vaste cellen: Totaal staat op rij 19, 20 of 21,
naargelang hoeveel kostenposten iemand toevoegde, en Info staat in kolom M, N of
O.

| Op het scherm   | Uit het rekenblad                                           |
| --------------- | ----------------------------------------------------------- |
| Begroting       | de regel Begroting, kolom Budget                            |
| Budget          | Totaal, kolom Budget, van het laatste budget                |
| Resultaat       | Totaal, kolom Resultaat, van het laatste resultaat          |
| Stand           | resultaat min budget; anders de status                      |
| activiteit op   | de cel onder "Datum" in Info (bij een bereik de eerste dag); enkel ter info |
| plaats          | de cel onder "Locatie" in Info                              |
| VTK draagt 50%  | de regel VTK onder "Verdeling", wanneer die kleiner is dan 1 |
| Bedragen        | elke regel boven "Inkomsten" (inkomst) en tussen "Inkomsten" en "Uitgaven" (kost), uit het laatste resultaat, anders uit het budget; een regel die op nul bleef, valt weg |

**De datum die telt, is die van de BO** waarop het eerste budget passeerde
(`Dossier.date`), niet die uit het rekenblad. Een budget zonder resultaat is
"Resultaat open" vanaf die BO, en "Open · 12 d" zijn de dagen sindsdien. Een
budget op een BO die nog moet komen, staat als "BO op 22 okt". Enkel een
schriftelijke goedkeuring heeft geen BO-datum ("Open · schriftelijk").

De datum uit het rekenblad (`Dossier.eventDate`) staat enkel ter info in het
detail en de tijdlijn, en ook dat enkel wanneer ze bij de BO's past (niet meer
dan 180 dagen voor de eerste of 400 dagen na de laatste; anders is het een oud
sjabloon). Een jaar buiten 2000 tot 2100 laat `figures.ts` al bij het lezen
vallen.

## De twee weergaven

Er zijn twee weergaven van dezelfde gegevens: de **verkenner** (drie panelen) en
de **lijst** (groeperen, filteren, en een formulier per activiteit, post en BO,
zoals Odoo). De schakelaar staat rechtsboven; de keuze wordt per account
onthouden in `UserViewPreference` (scherm `bestuursorgaan`).

### De verkenner

Links Posten, BO's of Open; in het midden de activiteiten; rechts alles over één
activiteit (Bedragen, Tijdlijn, Bestanden), of zonder gekozen activiteit de
cijfers van de post of de BO. De keuze staat in de URL, en een klik zet enkel die
URL (`history.pushState`): het hele werkingsjaar kwam al mee met de pagina.

| Parameter     | Wat                                                        |
| ------------- | ---------------------------------------------------------- |
| `jaar`        | het werkingsjaar (de jaarbalk bovenaan, een gewone link)   |
| `tab`         | `bos` of `open`; zonder: Posten                            |
| `post`        | de post (`g:<groupId>`, een vak als `x:vice`, of `l:<schrijfwijze>` als de site de post niet kent) |
| `bo`          | de id van een `BoMeeting`                                  |
| `leeftijd`    | in Open, sinds de BO van het budget: `2-maanden`, `1-maand`, `2-weken`, `recent`, `schriftelijk` |
| `activiteit`  | de sleutel van een dossier: jaar, posten (met `+`) en activiteit, gescheiden door een verticale streep. Wijzigt de post, dan vindt `findDossier` dezelfde activiteit in hetzelfde jaar terug |
| `blad`        | `tijdlijn` of `bestanden`; zonder: Bedragen               |

De lijst leest dezelfde `post`, `bo`, `activiteit` en `blad` (een post, een BO
of een activiteit opent dan haar formulier), en daarnaast:

| Parameter     | Wat                                                        |
| ------------- | ---------------------------------------------------------- |
| `groep`       | `bo`, `stand` of `maand`; zonder: per post                 |
| `filter`      | een of meer van `open`, `komt`, `af`, `slechter`, `boven`, met komma's; een "of", zoals in Odoo |
| `zoek`        | zoekt in de naam van de activiteit en van de post          |
| `grafiek`     | `1`: de grafiek in plaats van de tabel                     |
| `postblad`    | in het postformulier: `bos` of `posten`; zonder: Activiteiten |

"Voorbij en afgerond" telt enkel budgetten waarvan de BO al was (of die
schriftelijk goedgekeurd werden); "gem. tot resultaat" is het aantal dagen
tussen de BO van het budget en die van het resultaat. In de linkerkolom staat
dat per post als "3/4".

**Resultaten per post** onderaan (`BoSummary.tsx`, `lib/bo/summary.ts`) toont
dezelfde cijfers voor elke post en elk vak, ook zonder budget, met de totalen
voor VTK en de werkgroepen (een activiteit telt bij de werkgroepen wanneer al
haar posten werkgroepen zijn). Een vak voor uitzonderingen (Groep 5 als
geheel, Andere jaarwerking, Overige: `PostOption.catchAll`) staat er enkel
wanneer er iets in zit.

---

## Vallen waar we in gelopen zijn (of die op je liggen te wachten)

- **Een beheerder ziet de bestanden van een gedeelde drive niet.** Ook een super
  admin niet, tenzij hij er lid van is. Daarom leest de scan als een eigen
  account (`driveSubject`), niet als de beheerder van de groepssync.
- **Een snelkoppeling naar een map die niet gedeeld is, geeft een lege map.**
  Drive meldt geen fout bij het oplijsten van een map waar je niet bij kan. De
  scan vraagt daarom eerst het doel van elke snelkoppeling op; lukt dat niet,
  dan staat de naam bij "Na te kijken" ("de site kan ... niet openen") in plaats
  van stil te ontbreken.
- **De Drive-scope hoort niet in `GOOGLE_SCOPES`.** Staat hij er, en is hij niet
  gedelegeerd, dan faalt de hele groepssync met `unauthorized_client`. Hij
  heeft een eigen tokenaanvraag (`DRIVE_SCOPES`), zoals Gmail.
- **Een export van een Google Sheet bevat de berekende waarden**, een xlsx uit
  een ander programma zonder rekenkern soms niet. Dan staat er bij dat bestand
  "openen" in plaats van een bedrag; de bedragen komen terug zodra iemand het in
  Sheets of Excel opent en bewaart, want dan wijzigt het en leest de scan het
  opnieuw.
- **De bedragen zijn netto.** Totaal is inkomsten min uitgaven, dus een kost is
  negatief. "Stand" is resultaat min budget: positief is beter dan gepland.
- **Eén onmogelijke waarde hield de hele scan tegen.** Een cel "5/3/20026" werd
  het jaar 20026, Postgres weigerde `+020026-03-05`, en geen enkel bestand werd
  nog bewaard. Nu valt zo'n datum weg (`sane()` in `figures.ts`, ook voor
  bedragen boven de grens van een `Int`), en wordt elk bestand apart bewaard:
  wat toch faalt, staat bij "Niet bewaard" onder de scanregel en in Sentry,
  de rest loopt door.
- **De sleutel van een activiteit bevat haar posten.** Na "Post wijzigen" bestaat
  de sleutel in de URL niet meer; zoek een dossier daarom altijd met
  `findDossier`, niet met een gelijkheid op `key`, anders sluit het detail net
  na het opslaan.
- **Zoek eerst op de naam, dan op de groep.** De keuzelijst zocht ook in de
  groepsnaam, en "overige" vond zo eerst Jaarwerkingen ("Jaarwerkingen en
  overige"); Enter vinkte dan de verkeerde aan.
- **Een datum meteen na "BO" is geen nummer.** Een map "BO 30/08" werd "BO 30"
  terwijl het jaar aan BO 9 zat. `parseMeetingFolderName` leest een getal dat
  meteen door `/`, `.` of een streepje zonder spaties gevolgd wordt als datum;
  "BO 5 - 20/09" blijft BO 5. De scan zet het nummer bij elke ronde opnieuw,
  dus een foute rij herstelt zich vanzelf.
- **Hetzelfde bestand kan in twee BO-mappen staan** (een snelkoppeling). Dat
  zijn twee rijen in `BoDocument` (per BO één), maar `buildOverview` toont het
  één keer per soort, op de eerste BO, met "ook in BO x" (`DocView.alsoIn`).
  Een koppeling naar de weggevallen rij volgt mee. Was het op de ene BO het
  budget en op de andere het resultaat, dan zijn het er twee
  (`DocView.sharedSheet`).
- **De naam van het doel is niet de naam in de BO-map.** Een snelkoppeling
  heeft haar eigen naam, en Drive past die niet aan wanneer het doel hernoemd
  wordt. Eerst bewaarde de scan enkel de naam van het doel: Stadsspel van
  Onthaal (26-27) heette in BO 3 nog `Budget`, maar het blad was intussen
  `Resultaat`, dus stond er een resultaat op BO 3 en "geen budget". Vandaar
  `BoDocument.linkName`. "Niet meetellen" werkt nog altijd per bestand: bij
  zo'n blad verdwijnen budget en resultaat samen, en de bevestiging zegt dat.
- **Een fout in de scan breekt de groepssync niet.** De worker roept beide in
  dezelfde ronde aan, maar de statuscode volgt enkel de groepssync; een fout in
  de BO-scan staat op `/admin/bestuursorgaan`.

---

## Wat een post zelf ziet

Het volledige overzicht is van Groep 5. Een post ziet haar eigen budgetten en
resultaten op twee plaatsen, allebei uit `lib/bo/own.ts`:

- **"Mijn budgetten"** (`/admin/bestuursorgaan/mijn`, in de zijbalk onder
  Beheer): per post de tabel van de lijstweergave (activiteit, BO, budget,
  resultaat, stand), wat open staat bovenaan, het langst open eerst. Een rij
  opent niets; het icoon opent het rekenblad in Drive.
- **"Nog naar het BO"** op het dashboard (`/admin`): enkel de resultaten die
  open staan, vijf per post, met de BO van het budget en hoe lang al. Zonder
  open resultaat staat er niets.

Wie wat ziet:

- **Het lidmaatschap van dit werkingsjaar beslist, geen recht.** Elke post en
  werkgroep waarvan iemand lid is (`session.groups`), als `g:<groupId>`. Wie in
  Groep 5 zit, krijgt er de vier vakken van Groep 5 bij, maar enkel wanneer er
  iets in zit. De jaarwerkingen en Overige hebben geen leden en staan er dus
  nooit.
- **Enkel de dossiers van die posten gaan naar de browser.** `ownPosts` filtert
  op de server; de pagina krijgt nooit het hele jaar zoals de verkenner.
- Een activiteit van twee posten (`Cultuur+Onthaal`) staat bij beide, met "met
  Cultuur" eronder.
- Het lopende werkingsjaar, zonder jaarbalk: het lidmaatschap is ook per jaar.

Het dashboard leest hiervoor het hele overzicht van het jaar
(`loadOwnBo`), maar enkel voor wie in een post zit.
