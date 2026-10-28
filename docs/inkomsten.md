# Online inkomsten (`/admin/inkomsten`)

De opvolger van het rekenblad "Oriëntatie Online Inkomsten" van Beheer: wat er
via Payconiq en Mollie binnenkwam, per boekhoudcode en per bankrekening, voor de
boekhouder. De kringkeuzes staan in `docs/design-decisions.md` ("Online
inkomsten"); dit is de technische referentie.

Fase 1 en 1b zijn gebouwd: Payconiq en Mollie opladen, koppelen, Na te kijken,
het overzicht per periode, de eigen rekening van een post per kanaal, de
controlelijst met de Mollie-uitbetalingen om af te vinken, het kwartaalblad voor
de boekhouder en het controlebestand als xlsx, en afsluiten. De boekhoudcodes
kunnen als CSV opgeladen worden in `/admin/boekhoudcodes`. De koppeling met de
kassa's (fase 2) en SumUp en Europabank (fase 3) nog niet.

## Bestanden

| Bestand | Wat |
|---|---|
| `lib/inkomsten/parse.ts` | De exports lezen: CSV, bedragen, datums op de Brusselse klok, Mollie-uitbetalingsmaand. Puur. |
| `lib/inkomsten/match.ts` | De koppelregels als pure functie (`matchTransaction`), en de onthouden tekst (`incomeRuleText`). |
| `lib/inkomsten/overview.ts` | Het overzicht als pure som, de rekening op een dag, Mollie per uitbetaling (`groupMolliePayouts`), de controlelijst (`computeIncomeChecks`). |
| `lib/inkomsten/workbook.ts` | Het kwartaalblad en het controlebestand als bladen voor `write-excel-file`. Puur. |
| `lib/inkomsten/server.ts` | Database: opladen (met voorvertoning), opnieuw koppelen, Na te kijken, overzicht, uitbetalingen afvinken, het model voor de xlsx, lijsten. |
| `app/actions/inkomsten.ts` | Server actions, allemaal achter `income.manage`. |
| `app/[locale]/admin/inkomsten/` | Overzicht (met de controlelijst en de uitbetalingen), Opladen, Na te kijken, Transacties, Instellingen. |
| `app/api/admin/inkomsten/export/route.ts` | De twee xlsx-bestanden, voor `?van=2026-07&tot=2026-09` en `?soort=boekhouder` of `?soort=controle`. |
| `lib/accounting/import.ts` | De lijst van boekhoudcodes als CSV lezen, en plannen wat opladen doet. Puur. |
| `lib/csv.ts` | De CSV-lezer die beide gebruiken: scheidingsteken raden, aanhalingstekens volgens RFC 4180. |
| `test/inkomsten.test.ts`, `test/inkomstenWorkbook.test.ts`, `test/accountingCodesImport.test.ts` | Parsers, koppelregels, overzicht, controlelijst, de xlsx en de codelijst, zonder database, met verzonnen gegevens. |

Tabellen: `IncomeImport`, `IncomeChannel` (met de eigenaar, `ownerGroupId`),
`IncomeChannelAccount`, `IncomeTransaction`, `IncomeNameRule`, `IncomePeriod`,
`IncomePayoutCheck`. Instelling: `Setting` `income.config` (de kostencode).

## Wat de site leest

**Payconiq** (CSV met `;`): `id`, `date` (`dd/mm/jjjj`), `time`, `amount`,
`status`, `type`, `description`, `reference`, `shop_name`, `bulk_id`. Enkel
`SUCCEEDED` telt; `DEBIT` is een terugbetaling. `shop_name` is het kanaal: een
sticker, of `Ticketsysteem` voor betalingen via de site (en het printkrediet van
Cudi, dat over hetzelfde profiel loopt).

**Mollie**: de betalingenexport, met Engelse of Nederlandse koppen (zoals het
tabblad van Beheer, dat er drie eigen kolommen voor zet; die worden genegeerd).

| Regel | Herkend aan | Soort |
|---|---|---|
| Betaling | status `paid`, `paidout` of `refunded` | `PAYMENT`, voor het uitbetaalde bedrag |
| Terugbetaling | betaalmethode `refund` of `chargeback`, ID `re_...` | `REFUND`, negatief |
| Kosten | omschrijving begint met "Withheld fees" of "Invoice Compensation" | `FEE` |
| Reserve | omschrijving bevat "rolling reserve", of betaalmethode `rollingreserve` | `RESERVE` |
| De rest | vervallen, geannuleerd, mislukt | overgeslagen |

Een betaling telt in de **maand van haar uitbetaling**, uit de referentie
(`17112539.2510.03` is oktober 2025), zoals het rekenblad. Zonder uitbetaling
telt ze nog nergens; wordt ze later opnieuw opgeladen met een uitbetaling, dan
krijgt ze die alsnog. Alles van Payconiq telt in de maand van de betaling.

Het **balansrapport** van Mollie (`Transaction type`) weigert de site met een
uitleg: daarin staat bij een betaling niet in welke uitbetaling ze zit.

Nagekeken op het tabblad van Beheer voor het vierde kwartaal van 2025: totaal
€ 40.523,51, kosten −1.434,27, reserve −984,72, exact het kwartaalblad.

## Koppelregels

In `matchTransaction`, de eerste die past wint. Enkel voor `PAYMENT` en `REFUND`.

1. **Met de hand** (`MANUAL`): de beller slaat die rijen over.
2. **Betaling van de site** (`WEBSITE`): de ID uit de export is een
   `providerPaymentId` van `TicketPayment` (provider `bancontact` voor Payconiq,
   `mollie` voor Mollie), `MembershipPayment` of `UitleenPayment`, of een
   `providerRefundId` van `TicketRefund`. De code is de kopie op de bestelling.
   Nagekeken op live: 389 van 389 Payconiq-betalingen van de site, en elke
   Mollie-betaling van de site.
3. **Code in de tekst** (`CODE_IN_TEXT`): de Mollie-omschrijving begint met een
   code uit het register ("700100 10001 ..." of aaneen), of `reference` of
   `bulk_id` is er een.
5. **Onthouden tekst** (`NAME_RULE`): `incomeRuleText` van de omschrijving
   (kleine letters, zonder ordernummer, zonder e-mailadres) staat in
   `IncomeNameRule` voor die bron.
6. **Eigen rekening** (`OWN_ACCOUNT`): het kanaal heeft in de instellingen een
   post als eigenaar (`IncomeChannel.ownerGroupId`), zoals de QR-code van
   Theokot. Zulke transacties krijgen geen code en tellen niet mee; het
   overzicht noemt hoeveel het er zijn.
7. **Anders**: `rule` blijft `NULL`, en de transactie staat bij Na te kijken.

Regel 4 (de kassa's) komt in fase 2. Ze staat vóór regel 6, zodat een
activiteit van een andere post op de QR-code van Theokot dan toch meetelt.

Na een onthouden tekst, een vergeten tekst, een gewiste toewijzing of een
gewijzigde eigenaar loopt `rematchOpenTransactions` opnieuw over alles wat niet
met de hand gezet is, buiten de afgesloten periodes. Dat kan ook met de knop
"Opnieuw koppelen", na een nieuwe code in het register.

## Na te kijken

Gegroepeerd zodat één keuze veel transacties dekt (`groupKeyOf`):

- **Per tekst** bij Mollie en bij een Payconiq-betaling met een `reference`: die
  komt van een systeem (de site, Cudi, Uniflow) en draagt een vaste tekst. Die
  tekst kan onthouden worden.
- **Per sticker per dag** bij een Payconiq-betaling zonder referentie: wat
  iemand daar typt ("pintje"), zegt volgende week niets. Onthouden kan hier niet.

## Kanalen en rekeningen

Een kanaal (`IncomeChannel`) ontstaat bij de eerste import die het noemt. Beheer
vult in de instellingen in op welke rekening het stort, vanaf welke dag
(`IncomeChannelAccount`). De rekening van een transactie is die van de laatste
wissel op of voor haar Brusselse dag (`accountOn`). Niets daarvan staat in de
code of in een seed.

## Het kwartaalblad en het controlebestand

Het overzicht heeft twee downloads, beide xlsx met `write-excel-file`:

- **Voor de boekhouder** (`accountantWorkbook`): het kwartaalblad zoals in het
  rekenblad van Beheer, met dezelfde kleuren en euronotatie (`SHEET_STYLE`,
  uitgelezen uit het tabblad "4e Kwartaal"). Kolommen per bron en per rekening,
  Mollie eerst, dan een totaalblok per rekening; rijen per code in de volgorde
  van het register, dan de kosten, de reserve, Na te kijken en TOTAAL GEHEEL.
  Enkel bedragen.
- **Het controlebestand** (`controlWorkbook`), voor Beheer: zeven tabbladen die
  de lagen van het rekenblad volgen. Kwartaalblad (hetzelfde, maar elke cel een
  `SUMIFS` op Transacties), Transacties (met de kolom Waarom, uit `reasonOf`),
  Per groep, Mollie per uitbetaling, Na te kijken, Telt niet mee en Bestanden.
  Het bevat wat betalers zelf typten, dus het gaat niet naar de boekhouder.

De regel van een transactie in het kwartaalblad is `quarterLineKey`, en die
sleutel staat ook in kolom I van Transacties. Zo geeft elke formule exact het
bedrag van het blad voor de boekhouder; nagerekend in de preview (18 cellen,
geen verschil).

## De controlelijst

`computeIncomeChecks`, op het overzicht, in de volgorde van het werk:

1. elke voorbije maand van de periode heeft regels van elke bron die ooit
   opgeladen werd (de lopende maand niet: die kan nog niet volledig zijn);
2. elke maand met Mollie-betalingen heeft ook kostenregels;
3. elke Mollie-uitbetaling is afgevinkt tegen het uittreksel;
4. Na te kijken staat op nul;
5. elk kanaal heeft een rekening;
6. er is een kostencode, als er kosten zijn.

Afvinken (`IncomePayoutCheck`) bewaart wie, wanneer en het bedrag van dat
moment. Verandert het totaal van de uitbetaling daarna (een export met meer
regels), dan telt ze als gewijzigd en niet meer als afgevinkt. In een
afgesloten periode kan afvinken niet meer. Afsluiten kan met open stappen; de
bevestiging noemt ze.

## De boekhoudcodes als CSV

In `/admin/boekhoudcodes`, met hetzelfde stramien als de exports: eerst een
voorvertoning (`planAccountingCodeImport`: nieuw, hernoemd, niet in het bestand,
fouten), dan opladen.

- De kolommen worden op naam herkend: Boekhoudcode of Code, Subcode of
  Analytische code (optioneel), Naam of Omschrijving. Een subcode mag ook in
  dezelfde cel staan als de code ("700100 10001" of elf cijfers aaneen).
- Nieuwe codes komen erbij en namen worden bijgewerkt. Een code die niet in het
  bestand staat, blijft: ticketverkopen en bestellingen hangen eraan, dus
  verwijderen blijft een aparte, bevestigde stap.
- Bevat het bestand de hele lijst, dan wordt de volgorde die van het bestand.
  Een deel van de lijst laat de volgorde staan en zet nieuwe codes achteraan bij
  hun hoofdrekening; anders zou één nieuwe code de lijst door elkaar schudden.
- Eén foute regel (een dubbele code, een subcode zonder hoofdrekening) weigert
  het hele bestand.

## Vallen

- **De Brusselse klok.** Alle exports geven een lokaal uur zonder zone. Een
  betaling om 00:18 op 1 oktober staat in UTC nog op 30 september; de site leest
  elk uur als Brusselse tijd (`brusselsWallClockMinutes`).
- **Bedragen.** Nooit `Number()`: van een lege cel maakt dat stil 0.
  `parseDecimalCents` aanvaardt komma en punt en geeft `null` bij iets wat geen
  bedrag is; een onleesbare regel weigert het hele bestand.
- **Terugbetalingen bij Mollie.** De betaling met status `refunded` telt voor
  haar volle bedrag, en de terugbetaling is een eigen regel in de uitbetaling
  waarvan ze afging. Sla je die regel over, dan staat het kwartaal € 584 te hoog
  (het vierde kwartaal van 2025).
- **Geen persoonsgegevens.** De parsers nemen naam, rekeningnummer en BIC van de
  betaler niet over, en `cleanDescription` haalt e-mailadressen uit de
  omschrijving (Uniflow zet dat van de student erin). Het bestand zelf wordt niet
  bewaard.
- **Dubbel.** `IncomeTransaction` is uniek op bron en `externalKey` (soort plus
  ID, of een hash bij een regel zonder ID). De soort staat erin, zodat een
  terugbetaling met dezelfde ID als haar betaling niet als dubbel wegvalt.
- **Afgesloten.** Een import voegt niets toe aan een afgesloten periode, Na te
  kijken toont er niets uit, en een import met transacties erin kan niet weg.
- **Formules in `write-excel-file`.** Een waarde met `type: "Formula"` begint
  zonder `=`: de bibliotheek schrijft ze letterlijk in `<f>`, en met een `=`
  ervoor opent Excel een kapotte formule. Een bereik dat in elke rij hetzelfde
  moet blijven (de koprij met de rekeningen), is volledig absoluut: `$D$3:$F$3`.
- **Tijd in Excel.** Een xlsx kent geen tijdzone. `wallClock` zet een tijdstip
  om naar de Brusselse muurtijd, anders staat een betaling van 00:18 op de dag
  ervoor.
- **De eigenaar van een kanaal heeft (nog) geen datum.** Hij geldt voor elke
  transactie van dat kanaal buiten de afgesloten periodes, ook voor die van voor
  de dag waarop de QR-code naar de eigen rekening van de post wisselde. Staat er
  van voor die wissel nog iets in een open periode, dan valt dat ten onrechte
  weg.
- **Niets over VTK in de code**, ook niet in een hint of een standaard: de
  kostencode, de rekeningen en de eigenaar van een QR-code vult Beheer in.
