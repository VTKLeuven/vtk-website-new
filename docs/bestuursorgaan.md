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

De datum uit het rekenblad (`Dossier.eventDate`) staat ter info in het detail
en de tijdlijn. Daarnaast doet ze maar één ding: de herinnering "Nog te brengen
resultaten" op het dashboard toont een open resultaat pas vanaf de dag na de
activiteit (`openResults` in `lib/bo/own.ts`). Ook dat enkel wanneer ze bij de
BO's past (niet meer
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
- **"Nog te brengen resultaten"** op het dashboard (`/admin`): enkel de resultaten die
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

---

## Budgetten op de site (proef)

**Een proef naast Drive, geen vervanging.** Het BO werkt met de rekenbladen in
de map Bestuursorgaan, en alles hierboven (de verkenner, de lijst, "Mijn
budgetten", het dashboardblok) leest enkel die map. Daarnaast kan een post een
budget op de site opstellen, het als rekenblad downloaden en dat in de map
Budgetten van een BO zetten, zoals elk ander blad. Zo blijft Drive de bron tot
er beslist is om over te stappen. Het waarom staat in `docs/design-decisions.md`
("Bestuursorgaan: budgetten op de site").

**Wie.** Groep 5 kan het altijd; een andere post pas wanneer Groep 5 ze aanvinkt
bij "Instellingen voor budgetten" (`/admin/bestuursorgaan/instellingen`,
`BudgetSettings.pilotPostKeys`, `siteBudgetPostKeys` in `server.ts`). Wie niet
meedoet, ziet van de site niets: geen lijst op "Mijn budgetten", geen rij in de
mappen, geen budgetpagina en geen download, ook niet van een budget dat Groep 5
voor haar post uit een rekenblad overnam (`canEditBudget` kijkt naar de
proeflijst, niet enkel naar het lidmaatschap). Dat was eerst anders: een post
die niet aangevinkt was, zag haar overgenomen bladen toch.

| Bestand | Inhoud |
| ------- | ------ |
| `apps/web/lib/bo/budget/types.ts` | Het document van een budget (`BudgetContent`) en de instellingen |
| `apps/web/lib/bo/budget/calc.ts` | Rekenen: BTW, verdelingen, eenheden, inkomsten, overzicht (puur) |
| `apps/web/lib/bo/budget/checks.ts` | Wat nog na te kijken is, en wat de GM bekijkt (puur) |
| `apps/web/lib/bo/budget/formula.ts` | Een berekening in een getalveld ("=2,79/4") en de eigen parameters (puur) |
| `apps/web/lib/bo/budget/begroting.ts` | De begroting van het werkingsjaar uit het rekenblad van Beheer lezen (puur) |
| `apps/web/lib/bo/budget/pot.ts` | Een potje: meer budgetten op één lijn van de begroting (puur) |
| `apps/web/lib/bo/budget/importSheet.ts`, `importStore.ts` | Een rekenblad van het BO omzetten naar een budget op de site, en het bewaren |
| `apps/web/lib/bo/budget/prices.ts` | Welke regels een product bij een webshop hebben, en wat het antwoord betekent (puur) |
| `apps/web/lib/priceCheck/` | De webshops: een productlink herkennen, de pagina ophalen, de prijs lezen |
| `apps/web/lib/bo/budget/sheet.ts` | Het budget als rekenblad voor Drive, in de vorm van het sjabloon van de penning |
| `apps/web/lib/bo/budget/schema.ts` | Wat de server aanvaardt (zod) |
| `apps/web/lib/bo/budget/templates.ts` | De sjablonen Standaard, Cantus, Fakfeestje en Sector Night |
| `apps/web/lib/bo/budget/server.ts` | Wie mag wat (lid of deellink), de instellingen, de begroting, de potjes |
| `apps/web/lib/collectgo/product.ts` | Collect&Go: het product uit een link en uit de JSON-LD van de pagina |
| `apps/web/app/actions/boBudgets.ts` | Aanmaken, bewaren, prijzen nakijken, verwijderen, instellingen |
| `apps/web/app/api/admin/bestuursorgaan/budget/[id]/route.ts` | De download voor Drive |
| `apps/web/components/bo-budget/` | Het blad (`BudgetEditor`, `BudgetTop`, `SectionCard`, `ControlCell`), `ShareDialog`, het paneel per regel, de instellingen |
| `apps/web/app/[locale]/admin/bestuursorgaan/mappen/` | Per BO een map, zoals in Drive |
| `apps/web/app/[locale]/budget/[token]/` | Een budget achter een deellink, buiten de admin |
| `apps/web/test/boBudget.test.ts` | Live Cantus, IT Nieuw Materiaal en PeMe van BO 12, Collect&Go, de download |
| `apps/web/test/boBudgetFormulas.test.ts` | Berekeningen, parameters, resultaat, potjes, de begroting, de webshops |

**Het model.** Een `BoBudget` hoort bij één post (`postKey`, zoals overal in
`lib/bo`) en één werkingsjaar, en draagt zijn inhoud als één JSON-document:
parameters, info, begroting, verdeling per organisatie en secties. Een sectie
is vast (aantal × prijs), variabel (per deelnemer, met een verdeling) of
inkomsten. Er staat geen som in: `totalCents` en co. worden bij elke bewaring
uit de regels gerekend, enkel voor de lijsten.

**BTW.** Elke regel zegt of de prijs incl. of excl. BTW is, en bij incl. het
tarief van het product (6 of 21 %). Telt: excl. × (1 + tarief van de post). Het
tarief van de post vult Beheer in bij de instellingen; zolang dat leeg is, telt
elke prijs zoals ingetypt, zoals in de bladen. Een budget kan een ander tarief
nemen, met verplichte reden.

**Verdelingen.** Een variabele sectie kan haar regels samen 100 % laten
verdelen. Een rest-regel krijgt wat overblijft (water op een cantus), en een
regel kan het percentage van een andere delen (Fruitsap met Cava is één
Mimosa). De controle loopt per sectie, niet over alles samen: zo gaven Live
Cantus (89,25 %), FIESTA I (200 %) en PeMe (114 %) in de bladen vals alarm.

**Bewaren.** De editor bewaart een halve seconde na elke wijziging
(`saveBoBudgetAction`), en zegt "Bewaard om ..." in de kop. Twee bewerkers
tegelijk: de server bewaart enkel als `updatedAt` nog klopt, anders een rode
toast met de vraag om te herladen.

**Naar het BO: download voor Drive.** De knop in de kop geeft
`26-27_Budget_<post>_<activiteit>.xlsx` (`sheet.ts`): bovenaan het blok
Overzicht met de kolommen Budget en Resultaat, rechts Info met Datum, Locatie en
Verdeling, en daaronder de secties met hun regels. Enkel waarden, geen
formules: een xlsx die niet door Sheets of Excel opende, heeft geen berekende
waarden, en dan zou de scan "openen" tonen. `test/boBudget.test.ts` leest het
blad terug met `figuresFromSheet` en vindt dezelfde bedragen als de editor.
Indienen op de site (`submitBoBudgetAction`) bestaat, maar staat niet in de
editor zolang het BO met Drive werkt.

**Prijzen nakijken gebeurt vanzelf, en kan ook met de knop.** De regels met een
link naar één product bij een gekende winkel worden nagekeken
(`lib/bo/budget/priceRound.ts`):

- **om de vier uur door de server**, voor de budgetten van het eerstvolgende BO
  (niet ingediend, BO-datum van vandaag tot en met de datum van de eerstvolgende
  BO-map in Drive), ook als niemand ze opent. Dat loopt in de
  `background-worker` (`refreshDueBudgetPrices` in
  `/api/background/maintenance`), die elke vijf minuten langskomt; per budget
  beslist `rowsToCheck` of het al tijd is. De worker wacht hoogstens twintig
  seconden op de ronde, en er loopt er nooit meer dan één tegelijk;
- **wanneer iemand een budget opent**, ook via een deellink, voor elk budget
  dat nog niet vastligt (`refreshBudgetPrices` via
  `POST /api/bo/budgets/[id]/prices`). Een nieuwe link in de editor gaat langs
  dezelfde route, met `rows`;
- **met "Prijzen opnieuw ophalen"** in het blok "Prijzen bij de webshops", voor
  wie mag wijzigen (`force`). Die vraagt elke nakijkbare regel vers bij de
  winkel, buiten het geheugen van vier uur om, en bewaart zoals de ronde.
  Hoogstens om de twee minuten per budget (`FORCE_COOLDOWN_MS`, in het geheugen
  van het proces); een budget dat vastligt, weigert met `FIXED`.

Dat zijn **route handlers en geen server actions**: Next stuurt server actions
vanuit de browser één voor één, dus een ronde van een halve minuut hield elke
bewaring van de editor zolang tegen. Verder:

- hoogstens één ronde per vier uur per budget (`BudgetContent.pricesAt`,
  `rowsToCheck`), en de server onthoudt elk product vier uur en voegt
  gelijktijdige aanvragen samen (`lib/priceCheck/fetch.ts`). Honderd mensen die
  samen een budget openen, zijn voor de winkel één bezoek per product;
- een nieuwe of gewijzigde link gaat meteen mee, zonder op de ronde te wachten;
- **niet meer eens het budget vastligt**: ingediend, of de datum van "Voor het
  BO van" is voorbij (`pricesStillChecked`). Er bestaat geen aparte
  goedkeuring op de site, dus dit is wat "goedgekeurd" hier betekent;
- de uitkomst komt in het budget zonder `updatedAt` te wijzigen, zodat een
  editor die openstaat gewoon blijft bewaren. Bewaarde iemand tijdens de ronde,
  dan leest de ronde het budget opnieuw en zet ze de antwoorden in die versie;
  bewaart een editor die de ronde nog niet had, dan houdt de server de jongste
  controle per regel (`keepNewerChecks`), zolang de link dezelfde bleef.

Wat er terugkomt, staat in `lastCheck` van de regel: klopt, gewijzigd (met
"overnemen"), niet gevonden, of geen antwoord. De uitkomst wordt bij het tonen
opnieuw berekend tegen de prijs in de regel (`liveCheck`): wie de prijs aanpast
naar die van de winkel, ziet meteen "klopt". "Nu nakijken" in het paneel van
een regel vraagt de winkel vers op. Groep 5 zet alles uit bij de instellingen
(`collectGoLive`).

**Het blok "Prijzen bij de webshops"** boven de secties telt de regels met een
winkel als bron per stand, met dezelfde iconen als de kolom Controle
(`priceSummary` in `lib/bo/budget/control.ts`), en zegt wanneer de laatste
volledige ronde liep (`pricesAt`) en vanaf wanneer de volgende kan. Daar staat
de knop, en voor Groep 5 een link naar het logboek van dit budget.

**Het logboek** (`/admin/bestuursorgaan/prijzen`, `BoPriceCheckLog`,
`lib/priceCheck/log.ts`) houdt elke opvraging bij een winkel bij: wanneer,
waarom (ronde, openen, nieuwe link, één regel nakijken, de knop, de test bij de
instellingen), voor welk budget, welke winkel en pagina, langs de prijsbrowser
of niet, de uitkomst met prijs of reden, en hoe lang het duurde. Een antwoord
uit het geheugen van vier uur staat er ook in (`cached`), zodat je ziet waarom
een ronde niets nieuws vroeg; wie meelift op een aanvraag die al loopt, logt
niet. Bovenaan de pagina staat hoe het nu staat (nakijken aan, de prijsbrowser,
de laatste ronde van de worker, het eerstvolgende BO) en per winkel de laatste
24 uur. Enkel Groep 5 (`bestuursorgaan.manage`). Na zestig dagen weg
(`prunePriceLog`, vanuit de ronde van de worker en bij het openen van de pagina).

**Zelf nagekeken.** Voor een link naar een winkel die de site niet kent (een
frituur, een verhuurder) en voor een regel zonder link zegt een mens dat hij de
prijs nakeek: de knop "Zelf nagekeken" in de kolom Controle, of in het paneel
van de regel. De regel toont daarna door wie en wanneer (`checkedBy`,
`checkedAt`). De naam komt van de server (`stampConfirmations`), niet van de
browser; via een deellink is dat "iemand met de deellink". Een bevestiging
vervalt wanneer de prijs of de link wijzigt, en wanneer de winkel later een
ander antwoord geeft dan toen (`PriceCheck.since`). De site zet `checkedAt`
nooit zelf.

**Vaste prijzen.** De huur van een zaal, een vat, licht en geluid: daar bestaat
geen offerte per activiteit voor, en "geen bron" stond er dus in elk budget.
Groep 5 houdt bij de instellingen een lijst "Vaste prijzen" bij (omschrijving,
prijs, optioneel een locatie), of zet er een bij vanuit het paneel van een regel
("onthouden als vaste prijs"). Een regel zonder bron met die omschrijving en die
prijs heeft daarmee een bron (`lib/bo/budget/fixed.ts`); met een locatie geldt
de prijs enkel daar, en valt een regel met een ander bedrag op zonder iets tegen
te houden. Herkennen gebeurt bij het tonen: de regel zelf verandert niet.

### Eén blad voor maken en nakijken

Er is één weergave (`BudgetEditor.tsx`, `BudgetTop.tsx`, `SectionCard.tsx`),
opgebouwd zoals het rekenblad: bovenaan **het Overzicht en de Parameters naast
elkaar**. Het overzicht toont elke sectie met haar bedrag (een link naar de
sectie, met "N open" als er iets scheelt), Inkomsten, Uitgaven, Totaal,
Begroting (in te typen) en het verschil; met het resultaat aan een tweede kolom
Resultaat, "N nog leeg" per sectie en het verschil met het budget. De
parameters groeperen de activiteit (BO, datum, locatie, lijn in de begroting),
waarmee gerekend wordt (deelnemers, eigen parameters) en BTW en verdeling.
Daaronder het concept, het blok "Prijzen bij de webshops" en de secties.

Per regel staan naast de cellen om in te typen **Bron** (waar de prijs vandaan
komt: de winkel als link naar het product, een offerte, een vaste prijs,
Flesserke; leeg is een cel om een link in te plakken) en **Controle** (een
icoon met de uitleg als tooltip: klopt, loopt, zelf nagekeken door wie en
wanneer, geen bron; enkel voor wat aandacht vraagt een kort woord onder de
iconen, zoals "winkel: 36,49" of "geen antwoord"). "Zelf nagekeken" en
"Intrekken" verschijnen bij hover of focus, op een smal scherm altijd; de prijs
van de winkel overnemen staat er meteen. Een bolletje voor de naam zegt dat er
aan de regel iets anders scheelt (tooltip, klik opent de regel).

Er is **geen lijst met aandachtspunten**: wat scheelt, staat bij de regel, onder
de kop van de sectie (een naam die niets zegt) of onder het veld in de
parameters en het overzicht. De kop zegt hoeveel punten er openstaan, met een
klik naar het eerste. Het totaal staat in de meescrollende kop pas wanneer het
overzicht uit beeld is.

Wie niet mag wijzigen (een ingediend budget, de deellink om te bekijken), ziet
hetzelfde blad met tekst in plaats van cellen (`viewOnly`, `readOnly`).

**Secties zijn vrij.** Zoveel als je wil (hoogstens dertig), met een naam naar
keuze, en met de pijlen te verplaatsen. De soort bepaalt enkel hoe de regels
rekenen: kosten (aantal × prijs), kosten per persoon, of inkomsten.

### Berekeningen en eigen parameters

Elk getalveld neemt ook een berekening aan, zoals een cel: `=2,79/4`,
`=5+1+2+2+7`, `=[Aantal bedrijven]*2+8`, `=omhoog(45/6)`. Het veld toont het
antwoord en een gele hoek; klik erin en de berekening staat er weer. Onder
"Deelnemers" voegt een post eigen parameters toe (aantal, % of €), zoals het
blok Parameters bovenaan het blad.

- De berekening staat in `fx` naast het veld (`row.fx.qty`), het antwoord in
  het veld zelf. `applyFormulas` rekent alles opnieuw uit bij elke wijziging in
  de editor én bij elke bewaring op de server; `calc.ts`, de controles en de
  download lezen enkel de getallen.
- Kan: getallen (komma of punt), + − × ÷, haakjes, `%`, parameters op naam
  (`[Aantal bedrijven]` of `aantal_bedrijven`), `Deelnemers`, en `omhoog`,
  `omlaag`, `afronden`, `min`, `max` (ook als ROUNDUP, ROUNDDOWN, ROUND). Kan
  bewust niet: verwijzen naar een andere regel, en ALS().
- Een berekening die niet uitkomt (een parameter die weg is, delen door nul)
  is een punt dat het indienen tegenhoudt, met de reden.
- Een variabele sectie rekent standaard op de deelnemers; "% van ... personen"
  geeft haar een eigen aantal (`section.base`), ook als berekening.

### Resultaat naast het budget

"Resultaat invullen" in het overzicht zet `content.result.on`. Elke regel
krijgt dan een kolom Resultaat (`row.result`, wat ze echt kostte of opbracht),
het overzicht toont budget en resultaat naast elkaar met het verschil, en de
download heet `26-27_Resultaat_<post>_<activiteit>.xlsx` met de kolom
Resultaat gevuld, zodat de scan het als resultaat leest. Een leeg veld is "nog
niet ingevuld", niet nul: de site telt hoeveel regels nog ontbreken, en een
tussentijds resultaat is dus gewoon een resultaat dat nog niet af is.

### De begroting en potjes

Groep 5 laadt bij de instellingen het rekenblad van de begroting op
(`uploadBegrotingAction`). `begroting.ts` leest per post-tabblad de lijnen
(kopje, naam, totaal) en bewaart enkel die in `Setting`
`bestuursorgaan.begroting`; in de code staat geen lijn en geen bedrag. In het
overzicht van een budget kiest de post de lijn; de site neemt het bedrag over
(het blijft aan te passen) en onthoudt de lijn in `content.begrotingRef`.

Twee budgetten met dezelfde lijn zijn een **potje** (`pot.ts`, `loadPot`):
materiaal dat door het jaar gekocht wordt, met telkens een budget en een
(tussentijds) resultaat. Het blad toont dan de andere
budgetten op de lijn met hun resultaat, en "verschil met begroting" vergelijkt
het potje als geheel (`CalcContext.pot`). Wie nog geen resultaat heeft, telt in
het resultaat van het potje mee met zijn budget.

### Delen met een link

"Delen" in de kop maakt twee soorten link (`BoBudget.viewToken` en
`editToken`, `/budget/<token>`): een om te **bekijken** (hetzelfde blad zonder
cellen, voor in de slides van het BO) en een om **aan te passen** (de editor, voor een
kring waarmee samengewerkt wordt en die niet in de admin kan). Geen account
nodig; de link is de toegang.

- Elke action en de download vragen `budgetAccess(budget, token)`: lid van de
  post, of een geldige link. Een link geeft toegang tot dat ene budget, niet
  tot de lijst, de instellingen, de begroting of de links zelf.
- Verwijderen, links maken en intrekken kan enkel een lid (`requireSession`).
- Een nieuwe link maakt de oude ongeldig; intrekken zet de kolom op NULL.
  Een onbekende of ingetrokken link is een 404.
- De pagina staat op `noindex` en `referrer: no-referrer`: de regels linken
  naar webshops, en die hoeven de link niet te krijgen.

### Mappen per BO ("Bestuursorgaan" in de zijbalk)

`/admin/bestuursorgaan/mappen` heet in de zijbalk **Bestuursorgaan**; het
overzicht per post op `/admin/bestuursorgaan` heet **Resultatenoverzicht**. De
instellingen voor budgetten hangen onder Bestuursorgaan (de knop bovenaan), niet
meer onder het overzicht. De URL's zijn niet gewijzigd.

Elke BO van het werkingsjaar is een rij in een lijst, met daarin Budgetten en
Resultaten. Een rij is een rekenblad uit Drive (opent in Drive) of een budget op
de site (opent het blad). **Een activiteit die in Drive én op de site staat,
is één rij** (zelfde post, zelfde naam) die naar de site leidt, met het blad in
Drive als tweede link; staan er in een map beide soorten, dan is ze gesplitst in
"Op de site" en "Enkel in Drive". "Rekenbladen opladen" is een dichtgeklapt blok
onderaan. Bovenaan zoekt één veld over alle mappen. Groep 5 ziet alles; een post enkel haar eigen
bestanden, op de server gefilterd op `postKeys` zoals `lib/bo/own.ts`. Een
budget op de site staat in de map van de BO met dezelfde datum als "Voor het
BO van", anders in een map op die datum of in "Nog geen BO gekozen".

### Rekenbladen overnemen

Wat al met een rekenblad langs het BO passeerde, kan alsnog op de site komen,
zodat de kring de site met echte cijfers beoordeelt. Enkel Groep 5, op
`/admin/bestuursorgaan/mappen`:

- **Uit Drive**: open de map van een BO en klik "Bladen van deze BO op de site
  zetten" (`importMeetingFromDriveAction`). De site downloadt wat de scan in
  die map vond (`downloadSpreadsheet`, dezelfde koppeling en dezelfde scope), met
  de post, de activiteit en budget-of-resultaat zoals het register ze al kent.
  In Drive verandert niets.
- **Opladen**: onderaan dezelfde pagina, een of meer `.xlsx` tegelijk
  (`importBudgetFilesAction`). De post en de activiteit komen uit de
  bestandsnaam (`parseDocumentName`, met de aliassen van Groep 5), anders uit
  A1 en C1 van het blad. Voor een server zonder Drive-koppeling, of om lokaal
  te proberen.

`importSheet.ts` leest het blad zoals de scan (de laatst berekende waarde van
elke cel) en maakt van elke regel een regel: naam, aantal, prijs, het resultaat
en de link uit "Opmerking/link" (de xlsx-lezer geeft daarvoor nu ook de
hyperlinks van een cel terug). Wat er bewust niet gebeurt, is de berekening
naspelen: een variabele regel komt binnen als haar uitkomst (zoveel eenheden
tegen die prijs). Zo klopt elk bedrag met wat het BO goedkeurde.

- **Het totaal moet kloppen met het blad, tot op de cent.** Komen de regels er
  niet op uit (het blad Fakfeestje, meer tabbladen, een eigen indeling), dan
  neemt de lezer het blok Overzicht: één regel per post. `content.source.mode`
  zegt welke van de twee, en het blad toont het.
- **Eén activiteit van een post is één budget.** Het resultaatblad vervangt het
  budgetblad van dezelfde activiteit (het bevat beide kolommen), niet omgekeerd.
- **Een import overschrijft nooit wat op de site opgesteld is**: enkel een
  budget dat zelf uit een rekenblad kwam (`content.source`), wordt vervangen.
  Opnieuw overnemen is dus veilig, en gooit wel weg wat iemand intussen in zo'n
  overgenomen budget wijzigde.
- Een overgenomen budget staat in opmaak (sjabloon "Uit een rekenblad"), in de
  map van zijn BO, en is te wijzigen, te delen en na te kijken zoals elk ander.
  De controles zeggen wat het blad niet had: een regel zonder bron, een prijs
  zonder incl. of excl.
- **De bladen zelf komen nooit in de repo.** `test/boBudgetImport.test.ts`
  bouwt een blad na met verzonnen cijfers. Tegen de 209 bladen van 26-27 is de
  lezer lokaal gedraaid: 155 regel per regel, 53 met het overzicht, 1 zonder
  blok Overzicht (geen budgetblad), en elk overgenomen totaal klopte.

### Prijzen bij de webshops

`lib/priceCheck/shops.ts` herkent een link naar één product en zegt hoe de
prijs opgehaald wordt (`via`). Getest in november 2026:

| Winkel | Bladen (van 209) | Hoe | Stand |
| ------ | ---------------- | --- | ----- |
| collectandgo.be | 90 | gewone aanvraag, JSON-LD; langs de prijsbrowser zodra die aan staat (`routeOf` in `lib/priceCheck/fetch.ts`), want Collect&Go weigert het IP van de server met HTTP 456. Daar één open pagina die de productpagina's zelf ophaalt (zie "De prijsbrowser") | werkt vanop een gewone verbinding; vanop de server enkel met `PRICE_BROWSER_PROXY` |
| bol.com | 35 | prijsbrowser, JSON-LD | werkt |
| partywinkel.be | 30 | prijsbrowser, JSON-LD en `og:price:amount` (de gekozen variant) | werkt |
| helloprint.com, drukzo.be | 14 en 4 | gewone aanvraag, JSON-LD, prijs van de gekozen configuratie, **excl. BTW** | werkt (505,99 excl. = 612,25 incl. op de pagina) |
| action.com | 7 | prijsbrowser, JSON-LD | werkt |
| colruyt.be | 9 | prijsbrowser: het product op zijn nummer, met de prijs van de winkel bij de ingestelde postcode | werkt (zes producten uit de bladen in vier seconden) |

Waar een winkel niet antwoordt, zegt de regel dat met de reden, en duidt een
mens aan dat hij de prijs zelf nakeek. Een prijs excl. (Helloprint) vergelijkt en neemt
de site over als excl. (`PriceCheck.basis`).

### De prijsbrowser

bol.com (HTTP 403), Partywinkel (429) en Action (een Cloudflare-wachtpagina)
weigeren alles wat geen browser is, wat de user-agent ook zegt. Voor die drie
vraagt `lib/priceCheck/fetch.ts` de pagina aan de **prijsbrowser**
(`infra/price-browser/server.cjs`): een echte Chromium in een eigen container,
die de pagina opent zoals een bezoeker en enkel de JSON-LD-blokken en de
prijs-metatag teruggeeft. Gemeten in die container: bol.com, Partywinkel en
Action elk onder de twee seconden per product.

**Colruyt gaat anders.** colruyt.be toont een prijs pas voor een gekozen
winkel. Groep 5 vult bij de instellingen de postcode van de Colruyt in
(`BudgetSettings.colruytPostcode`; in de code staat er geen). De prijsbrowser
houdt één Colruyt-pagina open, zoekt de winkel bij die postcode (de winkel
zelf, niet het afhaalpunt) en vraagt per product één lichte aanvraag aan de
API die de pagina zelf gebruikt, op het nummer uit de link. Geen pagina per
product: wie er twintig na elkaar opent, houdt de botbeveiliging van Colruyt
tegen (HTTP 456), en dat was ook wat er bij de eerste poging gebeurde. Zonder
postcode zegt de regel dat; een postcode zonder Colruyt-winkel ook.

**Collect&Go gaat ook zo.** Eerst opende de prijsbrowser per product een
volledige pagina, twee tegelijk: vijf tot vijftien seconden per product, dus
een budget met twintig dranken stond minuten te wachten, en de rest van de
editor wachtte mee. Nu houdt de prijsbrowser één Collect&Go-pagina open en haalt
die pagina de productpagina's zelf op (`fetch` vanuit de pagina, met haar
cookies), vier tegelijk, zonder ze te tekenen; gemeten een kwart tot driekwart
seconde per product. Stuurt de botbeveiliging van Colruyt ("Colruyt | AntiBot")
een wachtpagina, dan opent één product een volledige pagina die ze uitzit; de
andere wachten daarop en proberen één keer opnieuw. Komt ook die pagina niet
door, dan antwoordt de prijsbrowser tien minuten lang meteen "tegengehouden" in
plaats van elk product een halve minuut te laten wachten.

Aanzetten op een server:

1. `cp infra/price-browser/.env.example infra/price-browser/.env` en vul
   `PRICE_BROWSER_SECRET` in (`openssl rand -hex 24`).
2. Zet `price-browser` bij `COMPOSE_PROFILES` in `infra/.env`.
3. Deploy. De eerste start haalt het Playwright-image (ruim 2 GB) en installeert
   `playwright` in een volume; daarna staat de dienst in `docker ps` op healthy.

**Testen zonder budget.** Onderaan "Instellingen voor budgetten" staat
"Prijscontrole testen" (`PriceCheckTest.tsx`, `testPriceLookupAction`): plak een
productlink en de site vraagt de winkel meteen op, niet uit het geheugen van
vier uur, en bewaart niets. Het blok zegt ook of de prijsbrowser niet
ingesteld is, niet antwoordt of draait, zodat je na een deploy het verschil
ziet tussen "de container draait niet" en "de winkel weigert".

Zonder die twee stappen verandert er niets: de editor zegt bij die winkels
"deze winkel laat enkel browsers toe en de prijsbrowser staat niet aan".

Waarom zo:

- **Een eigen container, geen Chromium in de website.** Een browser die
  vreemde pagina's laadt, hoort niet in het proces dat de sessies en de
  databank heeft. De container krijgt enkel zijn eigen `.env` (het geheim),
  niet de root-`.env`, en heeft geen poort naar buiten.
- **Geen open proxy.** De dienst vraagt het gedeelde geheim, opent enkel
  https-pagina's van `bol.com`, `partywinkel.be`, `action.com` en `colruyt.be`
  (`PRICE_BROWSER_HOSTS`), breekt een navigatie naar elders af en geeft geen
  HTML terug. De site bouwde het adres zelf op uit de herkende link.
- **Met een venster op een virtueel scherm (`xvfb-run`).** Headless Chromium
  houdt Cloudflare tegen; met een venster komt Action door. Een wachtpagina
  zit de browser uit, hoogstens twintig seconden. Er wordt geen captcha
  opgelost en geen vingerafdruk vervalst: lukt het zo niet, dan is het
  antwoord "geen antwoord".
- **Rustig.** Voor de budgetten van het eerstvolgende BO en wanneer iemand
  een budget opent dat nog niet vastligt, hoogstens één ronde per vier uur per
  budget, hoogstens twee volledige pagina's en vier lichte aanvragen tegelijk,
  zonder afbeeldingen, en een gevonden prijs blijft vier uur onthouden. Niet
  voor budgetten van een later BO die niemand opent.
- **Geen `build:` in compose.** Het officiële Playwright-image met het script
  erin gemount; zo blijven `infra/deploy.sh` (drie builds), de lockfile en
  `scripts/affected-apps.mjs` wat ze waren. Wijzigt `server.cjs`, herstart dan
  de container (`docker compose restart price-browser`); een bump van de
  Playwright-versie doe je op de twee plaatsen in de service én leeg je het
  volume `price-browser-modules`.

### Wat de 209 bladen van 26-27 vroegen

In november 2026 zijn alle bladen uit de BO-mappen van het jaar (BO 0 tot 13
en de schriftelijke goedkeuringen: 165 budgetten, 44 resultaten) naast het
model gelegd.

| Wat een blad doet | Bladen | Op de site |
| ----------------- | ------ | ---------- |
| Vaste kosten (aantal × prijs), variabel met verdeling of per persoon | bijna alle | kon al |
| Een parameter buiten "aantal personen" (bedrijven, percentages, prijzen) | 96 | eigen parameters en berekeningen |
| Een losse som in een cel (`=2.79/4`, `=97.47*1.21`) | 67 | berekeningen; de BTW-sommen via incl./excl. |
| Het resultaat ingevuld | 41 | resultaat per regel |
| Het blad Fakfeestje (drankpromo's, inkleding, dj's) | 19 | sjabloon Fakfeestje |
| Sector Night en co. van Bedrijvenrelaties | 14 | sjabloon Sector Night |
| Meer dan één organisatie in de verdeling | 9 | kon al |
| Cantus met het tabblad Locaties | 7 | kon al (sjabloon Cantus) |
| Meer tabbladen die naar elkaar verwijzen (Praesidiumweekend, 30 jaar 't ElixIr, VTK-reis) | 9 | niet: zie hieronder |
| Een regel die naar een andere regel verwijst (winst per consumptie = verkoopprijs min kost van een regel hoger) | 32 | niet rechtstreeks: de waarde als parameter, of de som in de cel |

### Wat nog niet gebouwd is

- De wachtrij voor de GM en de BO-modus om te projecteren.
- Een budget uit meer delen (een tabblad per dag of per maaltijd) en een regel
  die naar een andere regel verwijst. Vandaag: een sectie per deel, en een
  gedeelde waarde als parameter.
- De prijslijst van de Fakbar (Standaardaanbod) voor de drankpromo's: de post
  typt de verkoopprijs in de berekening.
- De som van de begroting per post uit de site: de begroting wordt opgeladen,
  niet op de site opgesteld.
- Prijzen nakijken zonder bezoek gebeurt enkel voor het eerstvolgende BO.
- Een echte goedkeuring door het BO: een budget ligt vast eens het ingediend is
  of de BO-datum voorbij is.
- Een deellink verloopt niet vanzelf; intrekken doet de post.

### Vallen

- **Een post die zelf "Totaal" heet.** IT Nieuw Materiaal (BO 7) had boven
  "Uitgaven" een kostenpost met die naam; `figuresFromSheet` las die +234,15 als
  het totaal van het blad, en het budget stond in het overzicht én na de import
  met een winst in plaats van een kost. Staat er een rij "Uitgaven", dan is het
  totaal de eerste "Totaal" daarna (`lib/bo/figures.ts`). Voor wat al gescand of
  overgenomen was: opnieuw scannen, en het blad opnieuw overnemen.

- **De prijsbrowser is getest vanop een gewone verbinding en in de container
  op een laptop, niet vanop de server bij Hetzner.** Een winkel kan het IP van
  een datacenter weigeren, ook voor een echte browser. Dan zegt elke regel van
  die winkel "de winkel hield ook de prijsbrowser tegen". `PRICE_BROWSER_PROXY`
  laat de browser langs een proxy gaan; zet daar enkel een proxy die daarvoor
  bedoeld is. De relay voor de studentenkaarten loopt over een IP van de KU
  Leuven: die hiervoor gebruiken is een beslissing van de kring samen met wie
  die relay beheert, en staat bewust nergens als standaard.
- **De winkels kunnen hun beveiliging aanscherpen.** Wat vandaag doorkomt,
  kan morgen een wachtpagina blijven. De site valt dan vanzelf terug op "geen
  antwoord" en een mens die bevestigt; er breekt niets.
- **Colruyt weert bots en blokkeert IP-adressen van datacenters.** Getest vanop
  een gewone verbinding: het werkt met een eerlijke user-agent ("VTK-budgetten"),
  terwijl `node` als user-agent geweigerd wordt (HTTP 456). Of het werkt vanop de
  server bij Hetzner, is niet getest; zo niet, dan zegt de editor bij elke regel
  "geen antwoord" en bevestigt de post de prijs. Zet geen browser-user-agent in
  de plaats om dat te omzeilen.
- **Geen prijzen van derden.** colruyt-prijzen.nasaj.be (en de repo's
  `colruyt-products-scraper` en `colruyt-price-history` erachter) zijn in
  november 2026 bekeken: de prijzen op die site stonden stil sinds maart 2024,
  en de scraper gebruikt dezelfde API van Colruyt (met de sleutel uit een
  browsersessie) als de prijsbrowser al doet, voor één vaste winkel. Er valt
  dus niets bij te halen, en een budget hangt dan niet af van iemands
  hobbyproject.
- **De site volgt nooit zomaar een link.** De actie herkent eerst een product op
  collectandgo.be en bouwt zelf de URL; zo kan niemand de server een willekeurig
  adres laten opvragen.
- **Een cel in de tabel is een `input` met `.vtk-bud-bare`.** `vtk-admin.css`
  geeft elk veld in de admin een kader en een achtergrond met `!important`; die
  regel slaat `.vtk-bud-bare` over. Een nieuwe cel zonder die klasse krijgt
  het kader van een formulierveld midden in het rekenblad.
- **Een getal typ je met een komma.** `NumberField` houdt bij wat je typt tot
  je het veld verlaat; zonder dat werd "80," meteen "80" en kon je geen
  decimaal meer typen.
- **Een sectie mag niet "Inkomsten" of "Totaal" heten in het blad voor Drive**:
  dat zijn de labels waarop de scan zoekt. `sheet.ts` zet er "(regels)" achter.
