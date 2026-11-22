# Online inkomsten (`/admin/inkomsten`)

De opvolger van het rekenblad "Oriëntatie Online Inkomsten" van Beheer: wat er
via Payconiq, Mollie, SumUp en Europabank binnenkwam, en wat iemand
rechtstreeks overschreef, per boekhoudcode en per bankrekening, voor de
boekhouder. De kringkeuzes staan in
`docs/design-decisions.md` ("Online inkomsten"); dit is de technische
referentie.

Fase 1, 1b en 3 zijn gebouwd: Payconiq, Mollie, SumUp en Europabank opladen,
koppelen, Na te kijken, het overzicht per periode, een standaardcode per kanaal,
de controlelijst met de Mollie-uitbetalingen om af te vinken, het kwartaalblad
voor de boekhouder en het controlebestand als xlsx, en afsluiten. De
boekhoudcodes kunnen als CSV opgeladen worden in `/admin/boekhoudcodes`. Van
fase 2 staan de kassacontrole met de lijst met afwijkingen, de code van een
kassa en koppelregel 4. Van de verfijningen: het balansrapport van Mollie,
SumUp per uitbetaling, de controlelijst per account, een dag van 9:00 tot 9:00
in Na te kijken, uitleningen van een toestel, de code van de gekoppelde
ticketverkoop als voorstel bij een kassa, bij het opladen per bron een "i"
met de kolommen die de site verwacht, en in Transacties elke code verbeteren,
per rij of voor veel rijen tegelijk.

## Bestanden

| Bestand | Wat |
|---|---|
| `lib/inkomsten/parse.ts` | De exports van Payconiq, Mollie (betalingen en balansrapport), SumUp en Europabank lezen: de kolommen per formaat (`EXPORT_COLUMNS`), CSV, bedragen, datums op de Brusselse klok, kosten per betaling, de uitbetalingen en de betalingen in het balansrapport. Puur. |
| `lib/inkomsten/match.ts` | De koppelregels als pure functie (`matchTransaction`), de kassa die een toestel had (`kassaAt`), de uitlening van een dag (`lendingOn`), en de onthouden tekst (`incomeRuleText`). |
| `lib/inkomsten/lending.ts` | De dagen van een uitlening nakijken (`checkLendingDays`, `overlappingLending`). Puur. |
| `lib/inkomsten/lendingServer.ts` | De uitleningen: lijst, bewaren, verwijderen, overnemen wat met de hand gezet werd. |
| `lib/inkomsten/columns.ts` | De kolommen die de site leest, per export (`EXPORT_COLUMNS`) en van het afschrift (`BANK_COLUMNS`). Zonder afhankelijkheden: de "i" bij Uploaden toont ze in de browser. |
| `lib/inkomsten/bank.ts` | Een afschrift van KBC lezen (enkel de regels van providers), een regel aan haar uitbetaling koppelen (`matchBankLine`), de volgende bankdag, en per rekening afstemmen (`reconcileAccounts`). Puur. |
| `lib/inkomsten/bankServer.ts` | De afschriften: opladen (met voorvertoning), de lijst, verwijderen, en wat het overzicht toont (`loadBankLines`, `loadBankOverview`). |
| `lib/inkomsten/transfer.ts` | Een overschrijving met de hand nakijken (`checkTransfer`, `parseTransferAmount`) en haar moment (`transferMoment`). Puur. |
| `lib/inkomsten/transferServer.ts` | De overschrijvingen met de hand: lijst, de gekende rekeningen, bewaren, verwijderen. |
| `lib/inkomsten/lines.ts` | `quarterLineKey`: op welke regel een transactie telt, of niet. Het overzicht en beide bestanden rekenen ermee. Puur. |
| `lib/inkomsten/reserve.ts` | De berekende wijziging van de dynamische reserve van Mollie (`computeMollieReserve`). Puur. |
| `lib/inkomsten/config.ts` | De instellingen (`income.config`) en wat meetelt (`lineRulesOf`). Puur. |
| `lib/inkomsten/overview.ts` | Het overzicht als pure som, de rekening op een dag, de dag in Na te kijken (`reviewDay`), per uitbetaling (`groupPayouts`, `payoutState`), de controlelijst (`computeIncomeChecks`). |
| `lib/inkomsten/workbook.ts` | Het kwartaalblad en het controlebestand als bladen voor `write-excel-file`. Puur. |
| `lib/inkomsten/server.ts` | Database: opladen (met voorvertoning), opnieuw koppelen (`rematchOpenTransactions`, met `matchContextsFor` en `matchUpdateOf` die de uitleningen ook gebruiken), Na te kijken, codes met de hand (`changeTransactions`), overzicht, uitbetalingen afvinken, het model voor de xlsx, lijsten. |
| `lib/inkomsten/transactionFilter.ts` | De filter van Transacties uit de URL (`parseTransactionFilter`) en als Prisma-where (`transactionWhere`). Puur; de lijst en "alles wat aan de filter voldoet" gebruiken dezelfde. |
| `lib/inkomsten/importSummary.ts` | De voorvertoning van meerdere gekozen bestanden samen (`combineImportSummaries`). Puur. |
| `lib/inkomsten/kassa.ts` | De kassacontrole: het venster van een kassa (`kassaControlWindow`) en het ingetikte bedrag naast de import (`kassaCheck`). Puur; het optellen is `kassaImportAmounts` in `server.ts`. |
| `app/actions/inkomsten.ts` | Server actions, allemaal achter `income.manage`. |
| `app/[locale]/admin/kassas/` | De code van een kassa (`AcceptForm`, `CodeForm`) en de kassacontrole in het telformulier (`CountForm`); de acties in `app/actions/kassas.ts`. |
| `app/[locale]/admin/inkomsten/` | Overzicht (met de controlelijst en de uitbetalingen), Opladen (met `FormatGuide`, de kolommen per bron), Na te kijken (met de uitleningen: `LendingForm`, `LendingList`), Transacties (met `TransactionTable`: het detail per rij en de vinkjes), Overschrijvingen (`TransferForm`, `TransferList`), Instellingen. |
| `components/ui/InfoTip.tsx` | De "i" met uitleg erachter: hoveren opent, klikken zet vast (ook op een telefoon). |
| `app/api/admin/inkomsten/export/route.ts` | De twee xlsx-bestanden, voor `?van=2026-07&tot=2026-09` en `?soort=boekhouder` of `?soort=controle`. |
| `lib/accounting/import.ts` | De lijst van boekhoudcodes als CSV lezen, en plannen wat opladen doet. Puur. |
| `lib/csv.ts` | De CSV-lezer die beide gebruiken: scheidingsteken raden, aanhalingstekens volgens RFC 4180. |
| `test/inkomsten.test.ts`, `test/inkomstenWorkbook.test.ts`, `test/inkomstenTransactionFilter.test.ts`, `test/inkomstenLending.test.ts`, `test/inkomstenTransfer.test.ts`, `test/inkomstenBank.test.ts`, `test/accountingCodesImport.test.ts` | Parsers, koppelregels, overzicht, controlelijst, de xlsx, de dagen van een uitlening, de overschrijvingen, de bankafschriften en de codelijst, zonder database, met verzonnen gegevens. |
| `test/integration/inkomsten-uitlening.integration.ts` | Een uitlening tegen een echte database: bewaren, later opladen, aanpassen, overlappen, afgesloten, overnemen en verwijderen. |
| `test/integration/inkomsten-bankafschrift.integration.ts` | Bankafschriften tegen een echte database: voorvertoning, enkel providers, overlappende afschriften, later koppelen, verwijderen. |
| `test/integration/inkomsten-overschrijving.integration.ts` | Een overschrijving tegen een echte database: toevoegen, in het overzicht, niet bij Uploaden, niet terug naar de regels, aanpassen, afgesloten, verwijderen. |

Tabellen: `IncomeImport`, `IncomeChannel`, `IncomeChannelAccount` (de rekening
vanaf een dag), `IncomeChannelCode` (de standaardcode vanaf een dag),
`IncomeChannelLending` (een uitlening van het toestel, van dag tot dag),
`IncomeBankStatement` en `IncomeBankLine` (een bankafschrift en zijn regels van
providers),
`IncomeTransaction`, `IncomeNameRule`, `IncomePeriod`, `IncomePayout` (een
uitbetaling zoals de provider ze noemt), `IncomePayoutCheck`.
Op de kassa: `CashRegister.accountingCodeId`, en `IncomeTransaction.cashRegisterId`
voor de kassa die de code gaf; `IncomeTransaction.channelLendingId` voor de
uitlening die ze gaf. Instelling: `Setting` `income.config` (de
kostencode).

## Wat de site leest

De kolommen per formaat staan één keer, in `EXPORT_COLUMNS`: het herkennen
(`recognises`) en het lezen gebruiken ze, en de "i" naast elke bron bij het
opladen (`FormatGuide`) toont dezelfde lijst. Een kolom wordt op naam gelezen,
en hoofdletters, spaties, underscores, accenten en volgorde maken niet uit
(`headerKey`: `shop_name` is `shopName`); staat een kop er twee keer, dan telt
de eerste. Herkent de site een bestand niet, dan zegt ze op welk formaat het
het meest lijkt en welke verplichte kolommen het mist, als het er minstens de
helft van heeft (`closestFormat`); wat niet in de lijst staat (namen,
rekening- en kaartnummers), leest de site niet. Een bestand is van een formaat
wanneer elke verplichte kolom er is. Voeg je een kolom toe of verander je wat
een parser met een regel doet, pas dan ook de zinnen in `FormatGuide` aan.

**Payconiq**: `id`, `date` (`dd/mm/jjjj`), `time`, `amount`, `status`, `type`,
`description`, `reference`, de shop en de bulk-ID. Het portaal geeft twee
exports, en de site herkent ze allebei: de gewone, met `shop_name` en `bulk_id`
(meestal met `;`), en een tweede, met `shopName`, `bulkId` en `payoutId`, in
een andere volgorde (meestal met `,`). Het scheidingsteken raadt de site zelf
(`detectDelimiter`). Enkel `SUCCEEDED` telt; `DEBIT` is een terugbetaling. De
shop is het kanaal: een sticker, of de shop van het ticketsysteem voor
betalingen via de site (`Ticketsysteem`, sinds november 2026 `VTK Tickets`;
ook het printkrediet van Cudi loopt over dat profiel).

De `payoutId` is de uitbetaling waarin Payconiq de betaling stortte; de site
bewaart hem als `payoutReference`, zoals het nummer van een SumUp-uitbetaling.
Enkel die tweede export heeft hem, en enkel hij laat een Payconiq-regel op het
bankafschrift terugvinden: in de mededeling staat `JJJJMMDD-PA...`. De gewone
export rekent geen uitbetaling terug, want Payconiq telt een sticker per dag in
UTC en het ticketsysteem van middag tot middag. Met payoutId staat elke
Payconiq-uitbetaling in de lijst per uitbetaling en de controlestap
Uitbetalingen; de export zegt niet op welke dag en voor welk bedrag ze
vertrok, dus een bankafschrift bevestigt ze (zie "Bankafschriften"). Een bestand dat al opgeladen was,
opnieuw opladen in de tweede opmaak, vult de `payoutId` aan (behalve in een
afgesloten maand) en meldt die regels als "nu uitbetaald".

**Mollie**: de betalingenexport, met Engelse of Nederlandse koppen (zoals het
tabblad van Beheer, dat er drie eigen kolommen voor zet; die worden genegeerd).

| Regel | Herkend aan | Soort |
|---|---|---|
| Betaling | status `paid`, `paidout` of `refunded` | `PAYMENT`, voor het uitbetaalde bedrag |
| Terugbetaling | betaalmethode `refund` of `chargeback`, ID `re_...` | `REFUND`, negatief |
| Kosten | omschrijving begint met "Withheld fees" of "Invoice Compensation", of bevat "Balance correction" | `FEE` |
| Reserve | omschrijving bevat "rolling reserve", of betaalmethode `rollingreserve` | `RESERVE` |
| De rest | vervallen, geannuleerd, mislukt | overgeslagen |

Een betaling telt in de **maand van de betaling**, op de Brusselse klok, zoals
elke bron (Beheer, november 2026). Tot dan telde ze in de maand van haar
uitbetaling, zoals het rekenblad; de migratie
`20261122110000_online_income_mollie_payment_month` zette de bestaande rijen
om. De referentie van de uitbetaling (`12345678.2510.03`) blijft erbij: die zet
de betaling bij haar overschrijving in de lijst per uitbetaling. Een betaling
zonder uitbetaling telt gewoon in haar maand; het verschil met wat Mollie
overschreef, is de wijziging van de dynamische reserve (zie verder).

Het **balansrapport** van Mollie (`Transaction type`, `Settlement amount`) is
elke beweging op het Mollie-saldo (`parseMollieBalance`):

| Regel | Soort |
|---|---|
| `transfer` | een uitbetaling (`IncomePayout`): de referentie, de dag en het bedrag dat naar de bank ging |
| `payment` | telt niet (`ignored`): de betalingenexport heeft ze al. Haar ID, maand en bedrag gaan naar `IncomeMollieBalancePayment`, om na te kijken dat die export volledig is |
| `invoice` | `FEE`: de maandfactuur van Mollie, en een correctie van een paar cent; in haar eigen maand |
| `rolling reserves` | `RESERVE`, in haar eigen maand |
| `refund`, `chargeback` | `REFUND` |

De **maandfactuur en de reserve tellen in hun eigen maand**, zonder
uitbetaling. Mollie zet ze op de laatste seconde van de maand
(`2026-08-31 23:59:59`), na de laatste overschrijving, maar het geld ging er
die maand al af: Mollie houdt kosten en reserve wekelijks in op elke
overschrijving, en de export per uitbetaling toont ze zo, met het nummer van
de factuur van die maand ("Withheld fees MOL-NL-R2025.0001113445" van 4
augustus tot 8 september 2025). Het balansrapport zet ze nog eens als één
regel per maand. Een **terugbetaling** telt in haar eigen maand en krijgt de
eerstvolgende overschrijving in het bestand als uitbetaling, zoals in de
export per uitbetaling; staat er nog geen na, dan heeft ze (nog) geen
uitbetaling. Een kost uit het balansrapport heeft een sleutel die met
`FEE:bal:` begint (`BALANCE_KEY`).

Nagekeken op het balansrapport van het derde kwartaal van 2026: kosten
−43,39 in augustus en −98,62 in september, samen −142,01, zoals de eigen
poging van Beheer (−142,17 zonder de twee compensaties van +0,16).

Nagekeken op het tabblad van Beheer voor het vierde kwartaal van 2025: totaal
€ 40.523,51, kosten −1.434,27, reserve −984,72, exact het kwartaalblad. Dat
was onder de oude regel (Mollie in de maand van de uitbetaling); onder de
nieuwe is het derde kwartaal van 2026 de toets, zie "De wijziging van de
dynamische reserve".

### De wijziging van de dynamische reserve

Mollie telt in de maand van de betaling, maar wat Mollie in een periode
overschrijft, is iets anders: een overschrijving betaalt de betalingen van de
week ervoor uit, min kosten, en Mollie houdt een deel bij of geeft het later
vrij. Het verschil is de **wijziging van de dynamische reserve**, en de site
rekent het zelf uit (`computeMollieReserve` in `lib/inkomsten/reserve.ts`):

    overgeschreven in de periode − alles van Mollie in de periode

- **Teken**: negatief wanneer Mollie geld bijhield (betalingen van eind
  september die pas in oktober overgeschreven worden), positief wanneer Mollie
  meer overschreef dan er binnenkwam. Over twee periodes heen valt het weg.
- **Alles van Mollie** is elke Mollie-regel van de periode: wat meetelt, wat met
  de hand niet meetelt en de kosten met een aparte factuur. Zo komt een
  uitgesloten betaling niet als reserve terug. De Mollie-kolom is dan gelijk
  aan de overschrijvingen, min wat niet meetelt.
- **De regel in het overzicht** is Mollies eigen reserveregels ("rolling
  reserve") plus het berekende bedrag. Ze heeft geen boekhoudcode: het is geld
  dat Mollie nog bijhoudt (Beheer, november 2026). Ze telt mee in TOTAAL
  GEHEEL.
- **Per rekening**: de overschrijvingen op de rekening van Mollie op hun dag
  (`IncomeChannelAccount`), de regels op de rekening van hun dag.
- **Nooit bewaard**: het overzicht en de twee Excel-bestanden rekenen ze uit
  dezelfde aanroep (`loadIncomeOverview`, en `loadIncomeWorkbookModel`
  hergebruikt die). In het controlebestand staat ze als een berekende regel in
  Transacties, met "Waarom" = de berekening, zodat de formules sluiten.
- **Enkel met volledige bestanden.** Een ontbrekende betaling zou stil in het
  verschil verdwijnen. Daarom kent de site de reserve pas wanneer de
  betalingenexport en het balansrapport dezelfde betalingen noemen
  (`mollieCompleteness`): elke betaling van de periode uit de export staat in
  een balansrapport, en omgekeerd, in welke maand ook (de twee bestanden zetten
  een betaling soms een seconde anders). Anders staat er "onbekend", met de
  stap in de controlelijst.

Nagekeken op het derde kwartaal van 2026 van Beheer
(`test/inkomstenQ3Beheer.test.ts`): betalingen € 9.130,50, kosten € −142,01,
reserve € −226,89, Mollie-kolom € 8.761,60, de negen overschrijvingen samen.
Beheer kwam zelf op € 8.761,44: het script liet de twee compensaties (+0,16)
weg uit de kosten maar telde ze in de reserve.

**SumUp** (CSV, één per account): `Datum`, `Transactie-ID`, `Transactietype`,
`Status`, `Totaal bedrag`, `Transactiekosten`, en het account (`email`), dat het
kanaal is. Ontbreekt die kolom, dan komt alles op één kanaal `SumUp`.

| Regel | Herkend aan | Soort |
|---|---|---|
| Verkoop | `Omzet` met status `Succesvol` of `Terugbetaald` | `PAYMENT`, voor het totaalbedrag |
| Terugbetaling | `Terugbetaling` of `Terugboeking` met status `Succesvol` | `REFUND`, negatief |
| Kosten | de kolom `Transactiekosten` van een betaling | `FEE`, één per betaling |
| Uitbetaling | `Uitbetaling` met status `Betaald`, dezelfde ID en hetzelfde bedrag als de verkoop | overgeslagen, apart geteld (`ignored`): hetzelfde geld nog eens. Het `Uitbetalingsnummer` en de `Uitbetaling datum` gaan naar de verkoop en haar kosten (`payoutReference`) en naar `IncomePayout` |
| De rest | `Mislukt`, `Geannuleerd` | overgeslagen |

**Europabank** (CSV per terminal), in twee opmaken: tot maart 2026
`Origineel bedrag (EUR)` met resultaat `Sale` of `Denied`, daarna `Bedrag` met
transactietype `Verkoop` en resultaat `Goedgekeurd`. De dag komt uit `Datum`,
het uur uit `Tijd` (`103804`, of `93015` zonder voorloopnul); de kolom
`Datum en tijd` van het rekenblad wordt genegeerd. Enkel `Sale` en
`Goedgekeurd` tellen. De `Commissie (EUR)` wordt per betaling een `FEE`-regel,
wat haar teken ook is; interchange en schemakost niet, zoals in het rekenblad.
Het terminalnummer is het kanaal.

De kostenregels van SumUp en Europabank zijn `derived`: ze staan niet als eigen
regel in het bestand, dus het opladen telt ze niet mee in "nieuw" of "al
gekend". SumUp en Europabank tellen in de maand van de betaling, zoals
Payconiq. Kaartgegevens, autorisatiecodes en het land van de kaart worden niet
overgenomen.

Nagekeken op de tabbladen van het rekenblad, met de lezers van de site:

- **Europabank, terminal van evenementen** (oktober 2025 tot juni 2026): 62 van
  de 63 vensters van "Overzicht EuropaBankEvenementen" exact. Het 63ste is de
  Kerstmarkt, waar Beheer de bedragen van tien posten met de hand aftrekt; de
  som van het venster zelf klopt. De commissie van het vierde kwartaal:
  −212,27, exact.
- **Europabank, terminals van Cudi**: 6 van de 6 vensters, en de commissie
  (−298,63) exact.
- **SumUp van Theokot**: de 3 vensters exact, op de mislukte betalingen na: de
  formule van het rekenblad filtert niet op status en telde € 104,60 aan
  mislukte pogingen mee.

## Opladen

Beheer kiest één of meer CSV's tegelijk, ook door ze te slepen: Europabank laat
enkel per dag downloaden, dus een kwartaal van één terminal is een negentigtal
bestanden. Eerst toont de site wat ze per bestand en samen zouden doen
(`previewIncomeImportAction`, `combineImportSummaries`), dan pas slaat ze op.
De voorvertoning toont vier getallen (nieuw, automatisch gekoppeld, na te
kijken, al eerder opgeladen) en, als het zo is, wat in een afgesloten periode
valt; de uitsplitsing per koppelregel staat onder "Details per koppelregel".

- Elk bestand wordt een eigen `IncomeImport`, zodat er één apart weg kan.
- Eén onleesbaar bestand houdt de hele keuze tegen: de voorvertoning noemt het
  bij naam en de knop blijft uit, en het opladen leest eerst alle bestanden
  voor het iets bewaart.
- In de voorvertoning staat nog niets in de database. Een dag die in twee
  gekozen bestanden zit, telt daar toch maar één keer als nieuw: `seen` draagt
  de sleutels van de eerdere bestanden mee. Bij het echte opladen gebeurt dat
  vanzelf, want de bestanden gaan na elkaar.
- Hoogstens 250 bestanden, elk tot 10 MB en samen tot 40 MB: onder de 50 MB
  die een server action mag ontvangen (`bodySizeLimit`).
- Een uitbetaling die er al is met dezelfde dag en hetzelfde bedrag, telt niet
  als nieuw. SumUp zegt geen bedrag per uitbetaling; dan blijft wat er stond.
- Komen de Mollie-kosten van een maand al uit de export per uitbetaling
  ("Withheld fees"), dan slaat het balansrapport zijn factuur van die maand
  over (`ignored`). Omgekeerd ziet de controlelijst het.
- Een bankafschrift van KBC mag in dezelfde keuze: de site herkent het eerst
  (`recognisesBankStatement`), anders is het een export. Zie
  "Bankafschriften".
- Een bestand wordt gelezen als UTF-8, en anders als Windows-1252
  (`decodeUpload`).

## Koppelregels

In `matchTransaction`, de eerste die past wint. Enkel voor `PAYMENT` en `REFUND`.

1. **Met de hand** (`MANUAL`): de beller slaat die rijen over.
2. **Betaling van de site** (`WEBSITE`): de ID uit de export is een
   `providerPaymentId` van `TicketPayment` (provider `bancontact` voor Payconiq,
   `mollie` voor Mollie), `MembershipPayment` of `UitleenPayment`, of een
   `providerRefundId` van `TicketRefund`. De code is de kopie op de bestelling.
   Nagekeken op live: 389 van 389 Payconiq-betalingen van de site, en elke
   Mollie-betaling van de site. SumUp en Europabank gebruikt de site niet.
3. **Code in de tekst** (`CODE_IN_TEXT`): de Mollie-omschrijving begint met een
   code uit het register ("700100 10001 ..." of aaneen), of `reference` of de
   bulk-ID (`bulk_id`, `bulkId`) is er een.
4. **Een kassa** (`CASH_REGISTER`): het kanaal is een toestel van de kassa's
   (zie De kassacontrole), en een aanvaarde kassa met een code had dat toestel
   (`kassaAt`, met de kassa's uit `cashRegisterContext`). De transactie
   onthoudt de kassa (`cashRegisterId`). Wanneer een kassa het toestel had,
   hangt af van de soort toestel:
   - **Een toestel van een post**, een kanaal met op die dag een standaardcode
     (de SumUp van Theokot), of een toestel met een uitlening op die dag: enkel
     tijdens de uren van de kassa en de marge. Daarvoor en daarna neemt regel 6
     of 7 het weer over.
   - **Een gedeeld toestel**, een kanaal zonder standaardcode (Evenementen 2,
     de terminal van evenementen): tijdens de uren van de kassa en de marge,
     plus de uitloop van diezelfde avond/nacht (tot 9:00 de ochtend erna,
     zolang er geen volgende kassa met dat toestel begon). Wat op een andere dag
     buiten elke kassa valt, blijft voor Na te kijken.
   - **De marge**: 2 uur voor en na de uren van een kassa
     (`KASSA_MARGIN_MINUTES` in `match.ts`), want niet iedereen betaalt tijdens
     de uren die op de kassa staan. Valt een betaling in de marge van twee
     kassa's met hetzelfde toestel, dan wint de dichtste; de uren van een kassa
     gaan altijd voor op de marge van een andere. De kassacontrole rekent met
     dezelfde marge (`withKassaMargin` in `kassa.ts`), zodat een betaling bij
     dezelfde kassa koppelt als waar ze geteld wordt.
   - Een kassa zonder uren loopt van middernacht tot middernacht van haar dag
     (`registerInterval`), zonder marge (`KassaSpan.wholeDay`).
   - Een kassa zonder code koppelt niets: wat in haar venster valt, gaat door
     naar regel 5 tot 7. Op een gedeeld toestel sluit ze wel de kassa ervoor af.
5. **Onthouden tekst** (`NAME_RULE`): `incomeRuleText` van de omschrijving
   (kleine letters, zonder ordernummer, zonder e-mailadres) staat in
   `IncomeNameRule` voor die bron.
6. **Uitlening van het toestel** (`CHANNEL_LENDING`): het kanaal heeft een
   uitlening (`IncomeChannelLending`) met een code op de dag van de transactie,
   een dag van 9:00 tot 9:00 zoals in Na te kijken (`lendingOn` op
   `reviewDay`). De transactie onthoudt de uitlening (`channelLendingId`). Een
   uitlening waarvan de code uit het register verdween, koppelt niets. Zie
   "Uitleningen" onder Na te kijken.
7. **Standaardcode van het kanaal** (`CHANNEL_DEFAULT`): het kanaal heeft op
   de dag van de transactie een standaardcode (`IncomeChannelCode`: de laatste
   regel op of voor die Brusselse dag, `channelCodeOn`), zoals de QR-code en de
   SumUp van Theokot onder de code van Theokot, of de terminals van Cudi onder
   die van Cudi. Een regel zonder code betekent: vanaf die dag geen. Zo'n
   transactie telt mee zoals elke andere, ook wanneer het kanaal op de eigen
   rekening van een post stort.
8. **Anders**: `rule` blijft `NULL`, en de transactie staat bij Na te kijken.

Regel 4 staat vóór regel 7, zodat een activiteit van een andere post op de
QR-code van Theokot haar eigen code krijgt in plaats van die van Theokot. Ze
staat na regel 3: een betaling die zelf haar code draagt, weet het beter dan
het uur waarop ze viel.

Regel 6 staat onder wat exact koppelt (de site, een code in de tekst, een
kassa tijdens haar uren en de marge, een onthouden tekst): die weten het beter
dan de datum. Ze staat boven de standaardcode, want die vervangt ze net. Een
uitgeleend toestel telt die dagen als toestel van een post (`deviceAt`): een
kassa die er een avond op stond, houdt enkel haar uren en de marge, en daarna
geldt de uitlening weer, niet de uitloop tot 9:00 van een gedeeld toestel. De uitlening
zegt wie het toestel die dagen had.

**Twee klokken.** Een uitlening gaat over dagen van 9:00 tot 9:00, zodat een
avond tot 3 uur bij de dag blijft waarop ze begon. De standaardcode gaat over
kalenderdagen (`channelCodeOn` op de Brusselse dag): ze wisselt om middernacht,
zoals een rekening. De maand waarin een transactie telt, is altijd de
kalendermaand van de betaling; geen van beide verandert die.

Na een onthouden tekst, een vergeten tekst, een gewiste toewijzing, een
gewijzigde standaardcode, een uitlening of een ander toestel bij een kanaal loopt
`rematchOpenTransactions` opnieuw over alles wat niet met de hand gezet is,
buiten de afgesloten periodes. Een kassa doet hetzelfde wanneer ze aanvaard,
gewijzigd, geteld of verwijderd wordt, of een andere code krijgt
(`rematchIncome` in `app/actions/kassas.ts`), en het register van de
boekhoudcodes wanneer er een code bijkomt, een ander nummer of een andere naam
krijgt, of een CSV er een toevoegt of hernoemt (`rematchIncome` in
`app/actions/accountingCodes.ts`): zo wordt "706200 62005" in de tekst van een
betaling herkend zonder dat Beheer iets moet weten. De vergelijking in
`rematchOpenTransactions` kijkt ook naar de naam, zodat een hernoemde code haar
nieuwe naam doorgeeft. De knop "Opnieuw koppelen" in de kop van Na te kijken
blijft, voor wanneer iets anders veranderde.

Een code verwijderen koppelt niet opnieuw: wat haar in de tekst had, houdt ze
tot de volgende keer dat de regels lopen.

## Na te kijken

Gegroepeerd zodat één keuze veel transacties dekt (`groupKeyOf`):

- **Per tekst** bij Mollie en bij een Payconiq-betaling met een `reference`: die
  komt van een systeem (de site, Cudi, Uniflow) en draagt een vaste tekst. Die
  tekst kan onthouden worden.
- **Per toestel per dag** bij een Payconiq-betaling zonder referentie en bij
  elke betaling van SumUp of Europabank: wat iemand bij een sticker typt
  ("pintje") zegt volgende week niets, en een kaartbetaling heeft geen tekst.
  Onthouden kan hier niet; een toestel dat altijd voor dezelfde post dient,
  krijgt beter een standaardcode.

Een dag loopt van 9:00 tot 9:00 de ochtend erna (`reviewDay`,
`REVIEW_DAY_START_HOUR`), zoals in het script van de eigen poging van Beheer:
een avond tot 4 uur is één groep, onder de dag waarop ze begon. Enkel het
groeperen verandert; de maand van een transactie niet. De tussenlaag "Per
groep" in het controlebestand gebruikt dezelfde groepen.

### Uitleningen

Onderaan Na te kijken: een toestel dat een of meer dagen voor iets anders
diende (de cursusdienst die een week de SumUp van Theokot leende). Het woord is
dat van Beheer; "toewijzen" is al de actie met de hand in Transacties.

- **Een uitlening is koppelregel 6, geen eenmalige wijziging.** Bewaren,
  aanpassen en verwijderen koppelen opnieuw (`rematchOpenTransactions`), en een
  import koppelt met de uitleningen zoals ze dan staan: wat later opgeladen
  wordt, krijgt ze ook. Enkel de code verandert, nooit de maand.
- **Het formulier**: kanaal, eerste dag, laatste dag (leeg is één dag) en code.
  Het is daarna leeg (een nieuwe `key`). Nagekeken in `checkLendingDays` en
  `saveChannelLending`: de dagen in volgorde (`LENDING_ORDER`), hoogstens 366
  (`LENDING_TOO_LONG`), en geen dag die een andere uitlening van hetzelfde
  kanaal al heeft (`LENDING_OVERLAP`).
- **De lijst** toont per uitlening het kanaal, de dagen, de code, hoeveel
  transacties ze koppelt en voor hoeveel (een link naar Transacties met
  `uitlening=<id>`), wie ze zette en wie ze aanpaste. Een klik op de rij opent
  de modal om ze aan te passen of te verwijderen. Verwijderen zegt wat er
  teruggaat naar de koppelregels.
- **Wat met de hand gezet werd, blijft.** `rematchOpenTransactions` slaat
  `MANUAL` over, dus ook een uitlening raakt het niet. De lijst toont hoeveel
  er op die dagen met de hand gezet werd, met een link naar Transacties
  (`status=met-de-hand`, `kanaal`, `van-dag`, `tot-dag`).
- **Overnemen.** Wat met de hand dezelfde code kreeg als de uitlening, kan in
  haar opgaan: de knop "Neem over in deze uitlening" in de modal
  (`takeOverChannelLending`). De code verandert niet, dus geen enkel totaal;
  enkel de regel. Enkel rijen die de koppelregels zelf aan deze uitlening
  zouden geven (`canTakeOver`), anders veranderden ze bij het volgende koppelen
  alsnog. Een andere code koos iemand bewust: die blijft met de hand. Zo zet
  Beheer de dagen om die met het oude formulier "Een hele dag van een kanaal
  anders toewijzen" (`assignChannelDay`, tot november 2026) gezet werden: maak
  een uitlening voor die dagen met die code en neem over. De migratie zet
  niets om; welke `MANUAL`-rijen van dat formulier kwamen, staat enkel in de
  auditlog.
- **Afgesloten.** Bewaren weigert met `LOCKED` wanneer de wijziging een
  transactie in een afgesloten periode een andere koppeling zou geven
  (`changesClosedMonths`: de koppeling met de oude en met de nieuwe
  uitleningen naast elkaar); verwijderen wanneer een gekoppelde transactie er
  ligt. Anders bleef er een rij achter met een uitlening die er niet meer is.
  Overnemen slaat een afgesloten maand over.

**Het aantal op een groep linkt naar haar rijen** in Transacties, om ze te zien
of er een deel van aan te vinken (een sticker die 's middags en 's avonds voor
iets anders diende). Een dag gaat met `status=na-te-kijken`, `bron`, `kanaal`
en `dag`; dat is precies de groep. Een vaste tekst gaat met `q` op de tekst
zoals ze getoond wordt: een andere open tekst die haar bevat ("Onthaaldagen
VIP" naast "Onthaaldagen") komt dan mee, want een `contains` kent de
normalisering van `incomeRuleText` niet.

**Een kassa zonder code** die het toestel had toen de betalingen van een groep
binnenkwamen, staat op de groep met een link naar haar code
(`/admin/kassas/[id]#online-inkomsten`). `deviceAt` in `match.ts` zoekt die
kassa op zoals regel 4 het doet, dus de hint en de koppeling kunnen niet uit
elkaar lopen. Kiest Beheer de code, dan koppelt `setCashRegisterCodeAction`
opnieuw en verdwijnt de groep.

## Transacties

Elke regel uit de exports, 100 per pagina, nieuwste eerst. Bovenaan staat
hoeveel er aan de filter voldoen en hoeveel geld dat samen is; elk bedrag in
het overzicht linkt hiernaartoe met zijn code (of Na te kijken, kosten,
reserve) en zijn bron, zodat dat totaal hetzelfde bedrag is als de cel.

De filter staat in de URL en `parseTransactionFilter` leest ze: `bron`,
`kanaal` (een `IncomeChannel.id`), `status` (een stand: `na-te-kijken`,
`gekoppeld`, `telt-niet-mee`, of de regel die de code gaf: `met-de-hand`,
`site`, `code-in-tekst`, `onthouden-tekst`, `kassa`, `uitlening`,
`standaardcode`), `soort` (`betaling`, `terugbetaling`, `kosten`, `reserve`),
`van`, `tot` (op de maand waarin een transactie telt), `van-dag`, `tot-dag`,
`dag`, `uitlening`, `code` en `q`. `pagina` hoort er niet bij.

- `van` en `tot` ("Telt in maand van, tot en met") gaan op `periodMonth`: de
  maand waarin het overzicht een transactie telt. De snelkeuzes onder het
  formulier (deze maand, vorige maand, de kwartalen) zetten die, zodat een
  kwartaal hier hetzelfde totaal geeft als de cel van het overzicht. Ze wissen
  de filters op dagen, anders snijden de twee elkaar.
- `van-dag` en `tot-dag` ("Betaald van, tot en met", "2026-10-01") gaan op het
  moment van de betaling, in dagen zoals in Na te kijken: van 9:00 op de eerste
  dag tot 9:00 na de laatste (`reviewDaysWhere`), op wens van Beheer. Een
  betaling om 0:30 op 1 oktober staat dus bij "tot en met 30 september" en telt
  in oktober; de "i" naast de velden zegt het. Omgekeerd ingevuld draait de
  site ze om. Een grens mag ontbreken.
- `dag` ("2026-10-09") is de dag zoals in Na te kijken, van 9:00 tot 9:00 de
  ochtend erna, op het moment van de betaling en niet op de maand waarin ze telt.
  Ze heeft geen eigen veld meer: de link van een groep in Na te kijken zet ze,
  en boven de lijst staat welke dag het is, met een link om ze te wissen. `dag`
  en de reeks staan beide in de `AND` van `transactionWhere`, zodat de ene de
  andere niet overschrijft.
- `uitlening` (een `IncomeChannelLending.id`) toont wat die uitlening koppelt,
  met het toestel en de dagen boven de lijst.
- `code` (`codeWhere`): een volledige code ("700100" of "700100 10002") is die
  code en niet haar subcodes. Zo linkt een rij van het overzicht, en 700100 en
  700100 10002 kunnen elk een eigen rij hebben; het totaal bovenaan moet dan
  hetzelfde blijven. Elf cijfers aaneen zijn beide schrijfwijzen, een deel van
  een nummer ("7001") is het begin van de code, en met letters ("theokot")
  zoekt het in de naam.

Een klik op een rij opent het detail, met de code zoals ze staat en de keuze om
ze te veranderen. Vinkjes kiezen er meer; is alles op de pagina aangevinkt, dan
kan de balk onderaan "alle die aan de filter voldoen" kiezen. Alles gaat door
`changeTransactions`:

- **Toewijzen** zet `rule: MANUAL` met de gekozen code, wat de regels ook
  zeiden; **Telt niet mee** zet `excluded`. De koppelregels raken `MANUAL`
  daarna niet meer aan (`rematchOpenTransactions` slaat ze over, een import
  schrijft nooit over een bestaande rij).
- Een koppeling met een kassa, ticketverkoop, lidgeld of de uitleendienst gaat
  mee weg: wie de code met de hand zet, zegt dat die koppeling fout was, en de
  kassacontrole telt de betaling dan niet meer mee. Het detail en de
  bevestiging zeggen het vooraf, de toast achteraf hoeveel.
- **Terug naar de regels** slaat een overschrijving met de hand over: die heeft
  geen koppelregel en stond anders bij Na te kijken. Het detail van zo'n rij
  linkt naar Overschrijvingen.
- **Terug naar de regels** wist enkel wat `MANUAL` is en koppelt opnieuw; dat
  legt ook een losgemaakte koppeling terug.
- Kosten en reserve krijgen geen vinkje en geen code: die hebben hun eigen
  regel. Een afgesloten maand blijft zoals ze is en telt mee in de toast.
- **"Alles wat aan de filter voldoet" telt opnieuw op de server.** De actie
  krijgt de filter als query en `expected`, hoeveel betalingen en
  terugbetalingen het scherm telde (`assignable` uit `listIncomeTransactions`).
  Kwam er sindsdien iets bij of ging er iets weg, dan weigert ze met
  `FILTER_CHANGED` en verandert er niets: anders raakt de keuze iets anders dan
  wat de bevestiging noemde.

## Overschrijvingen

Geld dat iemand rechtstreeks op een rekening van de kring stortte: "de
Overschrijvingen" van het oude rekenblad (Beheer, vraag 12 van de review van
november 2026). Er is geen export voor, en een lijn van een lid op een
bankafschrift bewaart de site bewust niet, dus voert Beheer ze per stuk in op
het tabblad Overschrijvingen (`/admin/inkomsten/overschrijvingen`).

- **Een eigen bron**, `IncomeSource` `TRANSFER` ("Overschrijvingen"), als
  laatste in `INCOME_SOURCES` en in het kwartaalblad. `EXPORT_SOURCES` zijn de
  vier exports: de controlelijst verwacht enkel daarvan elke maand een regel.
- **Een gewone transactie**: soort `PAYMENT` (negatief ingevuld: `REFUND`),
  regel `MANUAL`, de code, `externalKey` `TRANSFER:<import-id>`, het moment
  12:00 Brusselse tijd op de dag (`transferMoment`, zodat de maand nooit
  verschuift) en een korte omschrijving. Geen naam of rekeningnummer van wie
  stortte.
- **Eén `IncomeImport` per overschrijving**, met formaat `manual`
  (`MANUAL_FORMAT`): zo blijven het verwijderen (cascade) en elke query die een
  import verwacht, werken. `listIncomeImports` en het tabblad Bestanden van het
  controlebestand laten ze weg.
- **Eén kanaal per rekening** (`identifier` is de rekening), met die rekening
  vanaf het begin in `IncomeChannelAccount`. Het kwartaalblad maakt zo vanzelf
  een kolom per rekening onder "Overschrijvingen", en de controle per bron in
  het controlebestand sluit zoals bij de exports. Instellingen en de
  uitleningen tonen die kanalen niet (`listIncomeChannels` zonder
  `transfers`), en de acties op een kanaal weigeren ze: hun rekening ligt vast.
- **De rekening kies je uit wat de site kent** (`knownBankAccounts`: de
  rekeningen van de kanalen in Instellingen en van eerdere overschrijvingen),
  zodat er geen rekeningnummer in de code staat.
- **Afgesloten**: een overschrijving in een afgesloten maand, of een aanpassing
  van of naar zo'n maand, weigert de site met `LOCKED`; verwijderen ook.
- Na te kijken toont ze nooit (ze hebben altijd een code), de uitbetalingen
  negeren ze (geen `payoutReference`), en de tussenlaag "Per groep" van het
  controlebestand slaat ze over.

## Bankafschriften

Het CSV-uittreksel van één rekening uit KBC (`Rekeningnummer;...;vrije
mededeling`, met een `;` achteraan elke regel en soms losse CR als regeleinde),
opgeladen bij Uploaden. Het telt nergens mee: het bevestigt uitbetalingen en
stemt per rekening af.

- **Enkel de regels van providers.** `parseBankStatement` herkent SumUp,
  Payconiq (`BANCONTACT COMPANY NV`), Mollie en Europabank aan de naam van de
  tegenpartij, nooit aan de mededeling (die typt een lid zelf). Enkel de naam
  van het bedrijf telt (`STICHTING MOLLIE PAYMENTS`, `SumUp Limited`,
  `EUROPABANK N.V.`), niet het woord alleen: een lid dat Mollie heet, is geen
  provider (`PROVIDER_NAMES`). De site houdt van
  die regels enkel de dag, het bedrag en de referentie van de uitbetaling over.
  Al de rest (leden, leveranciers, interne overschrijvingen) en het bestand
  zelf bewaart de site niet. `IncomeBankStatement` onthoudt per afschrift de
  rekening en de dagen die het dekt (uit de bestandsnaam
  `..._01-08-2026_tot_30-09-2026.csv`, anders uit de regels).
- **De eigen rekening komt uit het bestand** en wordt vergeleken met de
  rekeningen van de kanalen in Instellingen (`normaliseAccount`: hoofdletters,
  zonder spaties). Een rekening die bij geen kanaal staat, mag; de
  voorvertoning en de lijst zeggen het.
- **Koppelen op de referentie, nooit op dag en bedrag** (`matchBankLine`):
  - SumUp: de hele mededeling ("MDA PID1317737") is het Uitbetalingsnummer;
  - Mollie: `REF T<referentie> MOLLIE`, de overschrijving uit het
    balansrapport;
  - Payconiq: `YYYYMMDD-PA...-NONE-...`, de `payoutId` van de export die hem
    noemt. Met de gewone export (zonder payoutId) kan het niet: wanneer
    Payconiq een dag afsluit, hangt af van de soort winkel (Ticketsysteem van
    middag tot middag, de stickers per UTC-dag);
  - Europabank: `OV.REF.<n>`, de OV-ref van de export, die sinds deze versie
    de uitbetaling is (één per kaartmerk en dag, het bruto min de commissie,
    op de Boekingsdatum).
- **De koppeling wordt bij het lezen berekend**, niet bewaard: een export of
  afschrift dat later komt of weggaat, verandert ze vanzelf.
- **Overlappende afschriften** houden elk hun eigen regels (uniek per afschrift
  op `externalKey`); wie leest, telt een regel één keer (`loadBankLines`). Zo
  haalt het verwijderen van één afschrift geen regel weg die een ander ook
  heeft. Verwijderen mag ook in een afgesloten periode: het verandert geen
  transactie, code of maand.
- **Per uitbetaling** toont het overzicht de dag op het afschrift, of een
  verschil. Een uitbetaling die op een gedekte dag van haar rekening
  verwacht werd maar er niet staat, krijgt "Niet op het afschrift".
- **Tegen de bankafschriften** (`reconcileAccounts`): per rekening wat de site
  in de periode op de bank verwacht, naast de regels van providers:

      verwacht = verkocht in de periode
               - verkocht in de periode, op de bank erna
               + verkocht ervoor, op de bank in de periode
               + de overschrijvingen van Mollie in de periode

  Per regel en niet per uitbetaling: één uitbetaling kan verkopen van twee
  periodes dragen (SumUp betaalde op 3 augustus juli uit). De dag op de bank
  is die van de gekoppelde bankregel, anders die van de uitbetaling in de
  export (SumUp, Europabank), en anders de volgende bankdag
  (`nextBankingDay`: geen weekend en geen sluitingsdag van TARGET2), als
  schatting, schuin op het scherm. Alles telt, ook wat niet meetelt en de
  kosten met een aparte factuur: het geld kwam toch op de bank. Een verschil
  staat er enkel voor een rekening waarvan afschriften elke dag van de periode
  dekken. Overschrijvingen met de hand staan er ter info bij.
- Op de afschriften van het derde kwartaal van 2026 (augustus en september):
  Mollie 9 van 9, SumUp 18 van 19 op de cent (de 19de, 3 augustus bij Fakbar,
  betaalde ook verkopen die niet in de export staan), Theokot afgestemd op
  € 0,00. Payconiq (26) wacht op de export met payoutId, Europabank (31) op
  de export van die terminal.

## Kanalen en rekeningen

Een kanaal (`IncomeChannel`) ontstaat bij de eerste import die het noemt. Beheer
vult in de instellingen in op welke rekening het stort, vanaf welke dag
(`IncomeChannelAccount`), en eventueel een standaardcode vanaf welke dag
(`IncomeChannelCode`; niet bij Mollie: dat is één kanaal voor alles).

**De eerste rekening en de eerste standaardcode mogen zonder dag**: dan gelden
ze vanaf het begin (`CHANNEL_FROM_START`, 2000-01-01, op het scherm "vanaf het
begin"). Een kanaal verschijnt pas na de eerste export, dus wie er daarna
"vandaag" invulde, liet de maanden die net opgeladen werden zonder rekening en
bij Na te kijken. Het begin is een vaste dag en niet de vroegste transactie: een
export van oudere maanden kan later nog komen. Een wissel vraagt wel een dag
("Wisselt vanaf"), anders zou een vergeten datum stil de eerste regel
vervangen.

Op het scherm is elk kanaal een rij die dichtgeklapt de rekening, de
standaardcode en het toestel van vandaag toont; een kanaal zonder rekening
staat open. Het kanaal
is de sticker bij Payconiq, het account bij SumUp en het terminalnummer bij
Europabank. De rekening van een transactie is die van de laatste wissel op of
voor haar Brusselse dag (`accountOn`); ze bepaalt de kolom in het kwartaalblad,
niet of de transactie meetelt. De standaardcode zoekt de site op dezelfde
manier op (`channelCodeOn`). Niets daarvan staat in de code of in een seed.

## De kassacontrole

Bij het tellen van een kassa (`/admin/kassas/[id]`) toont het telformulier per
toestel wat de online inkomsten erop zagen, naast het bedrag dat Beheer
intikte (`kassaImportAmounts`, `ImportCheckLine` in `CountForm`). De lijst met
afwijkingen (`/admin/kassas/controle`, `kassaControlList`) doet hetzelfde voor
elke aanvaarde kassa van een werkingsjaar, per toestel een rij.

- **Welk kanaal welk toestel is**, vult Beheer in bij de kanalen
  (`IncomeChannel.cashMethod` en `cashTerminal`): een Payconiq-kanaal is een
  Payconiq-rekening, een SumUp-account of Europabank-terminal een
  Bancontact-bakje, met de naam uit de instellingen van de kassa's. Meerdere
  kanalen kunnen één toestel zijn (de twee terminals van Cudi).
- **Het venster** (`kassaControlWindow`): de uren van de kassa met 2 uur marge
  ervoor en erna wanneer een andere kassa dat toestel dezelfde dag had, en
  anders de hele dag, tot het einde van de marge als die voorbij middernacht
  loopt. Zo leest Beheer af: voor en na een evenement, of het dagtotaal als dat
  evenement het enige was. Een andere kassa met hetzelfde toestel begrenst de
  marge (`withKassaMargin`): ligt ze minder dan 4 uur ervandaan, dan delen ze
  het gat in het midden, en waar ze overlappen, komt er geen marge bij. Zo telt
  een betaling nooit bij twee kassa's. Een kassa zonder uren telt altijd de
  hele dag, zonder marge. Het telformulier en de lijst tonen beide: "van 20:00
  tot 03:00, met marge van 18:00 tot 05:00" (`controlSpanLabel`).
- **Wat telt**: alle betalingen en terugbetalingen op die kanalen in dat
  venster, ook wat "telt niet mee" kreeg: dit is wat er op het toestel
  binnenkwam.
- **De import schrijft nooit in een kassa.** Een verschil is een
  waarschuwing; bij een leeg veld vult "Overnemen" het veld, en opslaan doet
  Beheer zelf.
- **Eén rekening voor beide.** Het telformulier en de lijst gaan langs
  `controlAmounts` in `server.ts`, met het venster (`deviceWindow`) en de som
  (`importAmountOf`) puur in `kassa.ts`. De lijst vraagt vier dingen op (de
  kassa's, de kanalen, wie welk toestel die dagen had en de transacties in de
  vensters), niet iets per kassa. Een kassa en de lijst kunnen dus niet iets
  anders zeggen.
- **De standen in de lijst**: verschil, niet afgelezen (de import kent een
  bedrag, het veld is leeg), niets in de import (wellicht ontbreekt de export
  van die dag), geen kanaal (geen kanaal is dat toestel) en klopt. Standaard
  staat de lijst op "verschil"; een rij opent het telformulier van die kassa
  (`#tellen`).
- Enkel voor wie de kassa's beheert en ook `income.manage` heeft
  (`CashRegisterAccess.canCheckIncome`); voor anderen staat het tabblad
  Controle er niet.

## De code van een kassa

Beheer kiest de code bij het aanvaarden (`AcceptForm`), niet de post bij haar
aanvraag; de reden staat in `docs/design-decisions.md`. De kiezer staat er
enkel wanneer de kassa een Bancontact-bakje of Payconiq-rekening vraagt, en
"Nog geen code" mag. Later aanpassen kan op de pagina van de kassa
(`CodeForm`, `setCashRegisterCodeAction`), zodra ze aanvaard is. Daar staat
ook hoeveel transacties hun code van de kassa kregen, voor wie
`income.manage` heeft. In de lijst met transacties en in het controlebestand
staat de kassa bij de regel.

Heeft een kassa nog geen code en hangen er ticketverkopen met een code aan
(`CashRegisterTicketEvent`), dan staat die code voorgesteld (`codeSuggestion`
in `[id]/page.tsx`), met de ticketverkoop erbij. Enkel een voorstel: het staat
ingevuld, opslaan of aanvaarden doet Beheer. Hebben de ticketverkopen
verschillende codes, dan staat er niets ingevuld en noemt de zin ze allemaal.

## Het kwartaalblad en het controlebestand

Het overzicht heeft twee downloads, beide xlsx met `write-excel-file`:

- **Voor de boekhouder** (`accountantWorkbook`): het kwartaalblad zoals in het
  rekenblad van Beheer, met dezelfde kleuren en euronotatie (`SHEET_STYLE`,
  uitgelezen uit het tabblad "4e Kwartaal"). Kolommen per bron en per rekening,
  in de volgorde van het rekenblad (Europabank, SumUp, Mollie, Payconiq), dan
  een totaalblok per rekening; rijen per code in de volgorde van het register,
  dan de kosten (van alle bronnen samen), de reserve, Na te kijken en TOTAAL
  GEHEEL. Enkel bedragen.
- **Het controlebestand** (`controlWorkbook`), voor Beheer: tabbladen die de
  lagen van het rekenblad volgen. Kwartaalblad (hetzelfde, maar elke cel een
  `SUMIFS` op Transacties), Transacties (met de kolom Waarom, uit `reasonOf`),
  een tabblad per bron met regels in de periode (`sourceSheet`), Per groep,
  Per uitbetaling, Na te kijken, Telt niet mee en Bestanden. Het bevat wat
  betalers zelf typten, dus het gaat niet naar de boekhouder.
- **Het tabblad van een bron** (Europabank, SumUp, Mollie, Payconiq) heeft de
  kolommen van Transacties zonder Bron, en rechtsboven een controleblok met
  formules op die regels: per soort, wat meetelt, wat niet, wat het
  kwartaalblad voor die bron telt (de som van haar kolommen in TOTAAL GEHEEL)
  en het verschil, afgerond op de cent. Dat verschil hoort nul te zijn.
  Nagerekend in de preview met de Python-bibliotheek `formulas`: nul bij alle
  vier.

De kolom Post noemt de hoofdrekening, ook bij een regel met een analytische
code: "Activiteiten opbrengsten", niet "Cantussen" (`postName` in
`lib/inkomsten/labels.ts`). De analytische code staat ernaast in haar eigen
kolom. Het overzicht op het scherm gebruikt dezelfde functie, zodat de lijnen
daar heten zoals in het bestand. Waar je één transactie ziet of een code kiest
(Transacties, Na te kijken, de codekiezer, de tabbladen per transactie in het
controlebestand), blijft de eigen naam van de code staan: daaraan herken je de
subcode.

De regel van een transactie in het kwartaalblad is `quarterLineKey` (in
`lib/inkomsten/lines.ts`), en die sleutel staat ook in kolom I van
Transacties. Zo geeft elke formule exact het bedrag van het blad voor de
boekhouder; nagerekend in de preview (18 cellen, geen verschil). Het overzicht
op het scherm telt met dezelfde functie (`computeIncomeOverview`).

**Kosten met een aparte factuur** (Instellingen, `separateFeeSources` in
`income.config`): een bron waarvan de kosten op een factuur komen die de
boekhouder zelf inboekt (SumUp, volgens Beheer in november 2026). Hun
kostenregels blijven in de database en in de som per uitbetaling (wat op de
bank kwam, is na de kosten), maar `quarterLineKey` geeft er null voor: niet in
het overzicht, niet in de twee bestanden, anders boekt de boekhouder ze twee
keer. In Transacties heten ze "Kosten, aparte factuur", en het tabblad "Telt
niet mee" laat ze weg (dat zijn enkel de uitsluitingen met de hand). Payconiq
heeft geen kostenregels; Europabank stuurt geen factuur. Of Mollie aangevinkt
moet worden, vraagt Beheer na bij de boekhouder: dan is de Mollie-kolom de
overschrijvingen plus die kosten.

De regel "Wijziging dynamische reserve" heeft geen boekhoudcode meer (het
rekenblad zette er "x"). In het controlebestand krijgt het tabblad van Mollie
twee regels extra: wat Mollie overschreef, en "kwartaalblad min overgeschreven,
plus wat niet meetelt", wat nul hoort te zijn.

## De controlelijst

`computeIncomeChecks`, op het overzicht, in de volgorde van het werk:

1. elke voorbije maand van de periode heeft regels van elke bron die ooit
   opgeladen werd (de lopende maand niet: die kan nog niet volledig zijn). Bij
   SumUp en Europabank, waar een export één kanaal is (`EXPORT_PER_CHANNEL`),
   per kanaal: elk account of elke terminal met regels in de periode of de
   drie maanden ervoor;
2. elke maand met Mollie-betalingen heeft ook kostenregels;
3. geen maand heeft Mollie-kosten uit het balansrapport én uit de export per
   uitbetaling;
4. de site kent de wijziging van de dynamische reserve: de betalingenexport en
   het balansrapport noemen dezelfde betalingen (`mollieReserve`). Zo niet,
   dan zegt de stap hoeveel betalingen aan welke kant ontbreken;
5. elke uitbetaling klopt: afgevinkt tegen het uittreksel, op een opgeladen
   bankafschrift met hetzelfde bedrag (`bank`), of een overschrijving van
   Mollie (`payoutState`). Bij Mollie is een verschil tussen de som van de
   betalingen en de overschrijving in orde: dat verschil zit in de reserve, en
   staat er ter informatie bij; op het afschrift volstaat de overschrijving.
   Een ander bedrag op de bank (`bankDiffers`) is niet in orde. De stap linkt
   naar "Per uitbetaling";
6. Na te kijken staat op nul;
7. elk kanaal heeft een rekening;
8. er is een kostencode, als er kosten zijn.

Op het scherm staan de open stappen bovenaan, met hun link onderlijnd; wat in
orde is, staat er grijs onder.

Afvinken (`IncomePayoutCheck`) bewaart wie, wanneer en het bedrag van dat
moment. Verandert het totaal van de uitbetaling daarna (een export met meer
regels), dan telt ze als gewijzigd en niet meer als afgevinkt. In een
afgesloten periode kan afvinken niet meer. Afsluiten kan met open stappen; de
bevestiging noemt ze.

**Per uitbetaling** op het overzicht: elke uitbetaling met een regel in de
periode, met al haar regels, ook die van buiten de periode (een
SumUp-verkoop telt in haar eigen maand, dus een uitbetaling kan over de rand
lopen). Zonder vinkje is een uitbetaling van Mollie in orde met de
overschrijving uit het balansrapport: gelijk (`provider`), of anders
(`differs`), en dan staat erbij hoeveel Mollie bijhield of meer overschreef.
Een vinkje gaat voor: Beheer zag het uittreksel. Bij SumUp is de som van de verkopen min hun kosten het bedrag
dat SumUp overschreef (in het derde kwartaal van 2026 per uitbetaling exact);
daar blijft het afvinken met de hand.

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
- **Europabank heeft geen ID.** De sleutel is een hash van terminal, datum,
  uur, bedrag en autorisatienummer, zonder voorloopnullen: een rekenblad
  schrapt die, het portaal niet. Zo krijgt dezelfde betaling in de oude en de
  nieuwe opmaak dezelfde sleutel. Twee identieke regels in één bestand krijgen
  een volgnummer; dat klopt zolang een export elke dag volledig bevat.
- **Een datum uit een rekenblad.** Daar staat soms `2025-09-30 00:00:00` in de
  kolom `Datum` van Europabank. De site neemt er enkel de dag uit, anders viel
  het uur uit `Tijd` weg en stond alles om middernacht. Zo liep de eerste
  vergelijking met Cudi mis.
- **Mislukte betalingen bij SumUp.** De formule van het rekenblad
  (`SUMIFS` op `Totaal bedrag` en de datum) filtert niet op status; de site
  telt enkel wat lukte. In het tabblad van het vierde kwartaal van 2025 scheelt
  dat € 104,60.
- **Terugbetalingen bij SumUp en Europabank** stonden in geen enkele export
  die we zagen. De site volgt Mollie (de verkoop voor haar volle bedrag, de
  terugbetaling als eigen negatieve regel), maar kijk het na bij de eerste
  echte terugbetaling.
- **De controlelijst kijkt per account, maar kent enkel accounts die al eens
  iets hadden.** Een SumUp-account of terminal met regels in de periode of de
  drie maanden ervoor, verwacht ze elke maand; een terminal die een maand niet
  gebruikt werd (de examens), meldt ze dus ook. Een account dat nog nooit
  opgeladen werd, kent de site niet.
- **Met de betalingenexport klopt de som per Mollie-uitbetaling niet.** Een
  overschrijving is de betalingen min de kosten die Mollie op die uitbetaling
  inhield, min de reserve die ze inhield, plus oudere reserve die vrijkwam. Die
  laatste drie staan per uitbetaling enkel in de export per uitbetaling; de
  betalingenexport heeft enkel de betalingen, en het balansrapport enkel een
  totaal per maand. In het derde kwartaal van 2026: bij 2608.02 zeven
  Bancontact-betalingen voor € 385,00 en € 382,27 overgeschreven, € 2,73 of
  7 × € 0,39 kosten; bij 2608.04 € 1.045,00 betaald en € 1.191,39
  overgeschreven, oudere reserve die vrijkwam. De site zet beide naast elkaar
  en noemt het verschil als informatie: het zit in de berekende wijziging van
  de dynamische reserve, dus de uitbetaling is in orde zonder vinkje.
- **Zonder balansrapport geen reserve.** De reserve is een verschil, en een
  ontbrekende betaling zou er stil in verdwijnen. Daarom kent de site ze pas
  wanneer de betalingenexport en het balansrapport dezelfde betalingen noemen.
  Download ze dus samen, voor de hele periode. De betalingen in het
  balansrapport las de site voor november 2026 niet: wie een periode van
  daarvoor bekijkt, uploadt het balansrapport één keer opnieuw (de knop
  Uploaden blijft dan actief, met "betalingen om de Mollie-export na te
  kijken").
- **De omzetting naar de maand van de betaling en afgesloten periodes.** De
  migratie `online_income_mollie_payment_month` laat een Mollie-regel staan
  wanneer zijn oude of nieuwe maand in een afgesloten periode valt. Heropen zo'n
  periode eerst en voer de `UPDATE` uit de migratie opnieuw uit; hij is
  idempotent. Een overschrijving van Mollie in een afgesloten maand wordt bij
  een import ook niet meer toegevoegd of gewijzigd: ze bepaalt de reserve van
  die maand.
- **De maandfactuur van Mollie staat na de laatste overschrijving.** Op de
  laatste seconde van de maand, dus aan de volgende overschrijving gehangen
  schoof ze een maand op, en die van de laatste maand van een kwartaal kreeg
  nooit een maand: een balansrapport van het volgende kwartaal begint pas de
  dag erna. Zo telde een eerste versie in het derde kwartaal van 2026 −43,39
  aan Mollie-kosten in plaats van −142,01. Ze tellen nu in hun eigen maand.
- **"Balance correction" heeft geen status.** In het tabblad van Beheer staan
  twee zulke regels (+19,68 in 2511.01 en −19,68 in 2511.03, een correctie op
  de minimumfactuur van oktober 2025 en haar terugdraaiing), zonder status of
  betaalmethode. Overgeslagen klopte november toevallig nog, maar elke van die
  twee uitbetalingen week 19,68 af, en een correctie die niet teruggedraaid
  wordt, viel stil weg. Ze tellen nu als kosten, zoals Beheer ze telde.
- **Mollie-kosten uit twee bestanden.** De maandfactuur in het balansrapport en
  "Withheld fees" in de export per uitbetaling zijn dezelfde kosten. Het
  balansrapport slaat zijn factuur over voor een maand die er al heeft;
  komt de export per uitbetaling erna, dan meldt de controlelijst het, en moet
  een van de twee weg.
- **Afgesloten.** Een import voegt niets toe aan een afgesloten periode, Na te
  kijken toont er niets uit, en een import met transacties erin kan niet weg.
- **Formules in `write-excel-file`.** Een waarde met `type: "Formula"` begint
  zonder `=`: de bibliotheek schrijft ze letterlijk in `<f>`, en met een `=`
  ervoor opent Excel een kapotte formule. Een bereik dat in elke rij hetzelfde
  moet blijven (de koprij met de rekeningen), is volledig absoluut: `$D$3:$F$3`.
- **Tijd in Excel.** Een xlsx kent geen tijdzone. `wallClock` zet een tijdstip
  om naar de Brusselse muurtijd, anders staat een betaling van 00:18 op de dag
  ervoor.
- **De standaardcode heeft een begin, geen einde.** Een regel geldt tot de
  volgende. Gebruikt een andere post het toestel een tijd, dan zijn het twee
  regels: vanaf die dag zonder code, vanaf de dag erna weer met. In september
  2026 gebruikte de cursusdienst zo een week de SumUp van Theokot
  (€ 41.228,86). Daarvoor is nu een uitlening (regel 6): één regel met een
  begin en een einde. Een dag waarop beide posten het toestel gebruikten, lost
  de standaardcode niet op; een kassa met een code op dat toestel wel, want die
  gaat tijdens haar uren voor (regel 4). Een regel opslaan of verwijderen
  koppelt opnieuw, buiten de afgesloten periodes. Geef een sticker die van
  evenement tot evenement doorgaat geen standaardcode.
- **Een standaardcode van voor de datum.** Bij de migratie naar
  `IncomeChannelCode` kreeg een bestaande standaardcode als begin de dag van de
  eerste transactie op dat kanaal, zodat niets wat ze al koppelde, losraakte.
- **Een gedeeld toestel stopt na de nacht van de kassa.** Zonder standaardcode
  loopt een kassa op een gedeeld toestel hoogstens tot 9:00 de ochtend na haar
  einde (`reviewDay`). Een evenement dagen later zonder kassa belandt zo bij
  Na te kijken in plaats van bij de vorige kassa.
- **De marge geldt pas na opnieuw koppelen.** Wat al gekoppeld was, houdt zijn
  regel tot de volgende keer dat de site opnieuw koppelt (een upload, een
  kassa die verandert, "Opnieuw koppelen" op Na te kijken). Dan krijgt een
  betaling tot 2 uur voor of na een kassa de code van die kassa in plaats van
  de standaardcode, ook in een open maand die Beheer al bekeek. Een afgesloten
  periode blijft zoals ze is. De marge koppelt en telt met dezelfde regel: wie
  hem aanpast, past `KASSA_MARGIN_MINUTES` aan, niet `kassaAt` of
  `withKassaMargin` apart.
- **Een bankafschrift bevat leden.** Herken een provider aan de naam van de
  tegenpartij, nooit aan de mededeling: een lid kan "MOLLIE" in zijn
  mededeling typen. En aan de volledige naam van het bedrijf, niet aan het
  woord: een lid dat Mollie heet, telde anders als overschrijving van Mollie,
  en de afstemming per rekening toonde een vals verschil. Komt een provider
  onder een nieuwe naam op het afschrift, dan staat die regel nergens: zet de
  naam erbij in `PROVIDER_NAMES`. Geef de parser geen kolom mee die je niet
  nodig hebt.
- **KBC eindigt een regel soms op een losse CR.** Wie de eerste regel op `\n`
  splitst, telt het scheidingsteken over het hele bestand (`detectDelimiter`).
- **`node:crypto` hoort niet in de browser.** De "i" bij Uploaden toont de
  kolommen in een clientcomponent; daarom staan ze in `columns.ts`, zonder
  afhankelijkheden, en niet in `parse.ts` of `bank.ts`.
- **Payconiq zonder payoutId** is niet aan de bank te koppelen, en de
  afstemming schat er de dag van: aan de rand van een periode wijkt ze dan af.
  Vraag de export met payoutId.
- **Een overschrijving is geen export.** Ze heeft een `IncomeImport` om de
  database eenvoudig te houden, maar geen bestand: wie een lijst van imports
  toont, filtert op `format` (`MANUAL_FORMAT`). En een maand zonder
  overschrijving is geen vergeten bestand: de controlelijst kijkt enkel naar
  `EXPORT_SOURCES`.
- **Een uitlening is geen periode.** `IncomePeriod` is een afgesloten reeks
  maanden; een uitlening (`IncomeChannelLending`) zegt wie een toestel een paar
  dagen had. Het scherm zegt dus altijd "uitlening", nooit "periode", en de
  foutcodes heten `LENDING_*`, niet `PERIOD_OVERLAP`.
- **Een uitlening verandert de code, nooit de maand.** Ze raakt `periodMonth`
  niet, dus ook niet de regel van het kwartaalblad of het totaal van een bron:
  enkel welke code een bedrag krijgt.
- **Een uitlening op een hernoemd kanaal.** Een sticker met een andere naam in
  de export is een nieuw kanaal (zie Payconiq), en een uitlening hangt aan het
  kanaal: op het oude gaat ze niet mee.
- **Een toestel hernoemen.** Regel 4 en de kassacontrole vergelijken de naam van
  het bakje of de rekening op de kassa met die op het kanaal. Een hernoemd
  toestel in de instellingen van de kassa's verandert niets aan oude kassa's,
  en het kanaal wijst maar naar één naam: ofwel de oude kassa's, ofwel de
  nieuwe vinden hun transacties dan niet meer. Sluit de periodes met de oude
  naam eerst af.
- **Niets over VTK in de code**, ook niet in een hint of een standaard: de
  kostencode, de rekeningen, de standaardcode van een QR-code en de code van
  een kassa vult Beheer in.
