# Bestuursorgaan (budgetten en resultaten per post)

Elke week passeren op het Bestuursorgaan (BO) de budgetten en resultaten van de
posten. Die staan op de gedeelde drive Praesidium, in een vaste structuur.
`/admin/bestuursorgaan` (in de zijbalk onder Beheer) leest die map en toont in
een verkenner met drie panelen per post en per BO welke budgetten er al
passeerden, of er al een resultaat is, en de bedragen uit de rekenbladen, tot op
de post (Zaal, Drank) toe.

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
| `apps/web/app/[locale]/admin/bestuursorgaan/`    | Het scherm: `BoViews.tsx` kiest tussen `BoExplorer.tsx` en `BoList.tsx`; wat ze delen staat in `BoParts.tsx` |
| `apps/web/app/actions/bestuursorgaan.ts`         | Nu lezen, de map instellen, posten en resultaten koppelen          |

Het recht is `bestuursorgaan.manage`, via de rol `bestuursorgaan` aan Groep 5.
De rol `admin` draagt het bewust niet (`ADMIN_EXCLUDED_PERMISSIONS` in
`packages/db/src/permissions.ts`); de seed en de sync bij elke start slaan het
daar over.

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
   een offerte als pdf tellen niet.
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

**De post** wordt herkend aan de naam, de code of de slug van een post, en aan
een afkorting die van precies één post het begin is (`Acti` is Activiteiten).
Wat de site niet herkent (`Vice`, `Secretaris`), staat bij "Na te kijken";
Groep 5 kiest één keer de post en die keuze (`BoPostAlias`) geldt voor elk
volgend bestand. Zonder keuze verdwijnt er niets: de bestanden staan dan onder
hun eigen schrijfwijze in de tabel.

**Budget en resultaat horen samen** wanneer jaar, post en activiteit gelijk zijn,
na het wegvegen van hoofdletters, accenten en leestekens
(`Familie- en vriendencantus` is `Familie en Vriendencantus`). Lijkt een
resultaat op geen enkel budget, dan staat het bij "Na te kijken" met de open
budgetten van dezelfde post en hetzelfde jaar, en kiest Groep 5 er één
(`BoDocument.pairedBudgetId`).

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
| datum           | de cel onder "Datum" in Info (bij een bereik de eerste dag) |
| plaats          | de cel onder "Locatie" in Info                              |
| VTK draagt 50%  | de regel VTK onder "Verdeling", wanneer die kleiner is dan 1 |
| Bedragen        | elke regel boven "Inkomsten" (inkomst) en tussen "Inkomsten" en "Uitgaven" (kost), uit het laatste resultaat, anders uit het budget; een regel die op nul bleef, valt weg |

Een budget zonder resultaat is "Resultaat open" zodra de datum uit het budget
voorbij is, of wanneer het budget er geen noemt; met een datum in de toekomst
staat er "Op 6 nov".

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
| `post`        | de post (`g:<groupId>`, of `l:<schrijfwijze>` als de site de post niet kent) |
| `bo`          | de id van een `BoMeeting`                                  |
| `leeftijd`    | in Open: `geen-datum`, `2-maanden`, `1-maand`, `2-weken`, `recent` |
| `activiteit`  | de sleutel van een dossier: jaar, post en activiteit, gescheiden door een verticale streep |
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

"Voorbij en afgerond" telt enkel activiteiten waarvan de datum voorbij is of die
geen datum hebben; "gem. tot resultaat" is het aantal dagen tussen de activiteit
en de BO waarop het resultaat passeerde.

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
- **Een fout in de scan breekt de groepssync niet.** De worker roept beide in
  dezelfde ronde aan, maar de statuscode volgt enkel de groepssync; een fout in
  de BO-scan staat op `/admin/bestuursorgaan`.
