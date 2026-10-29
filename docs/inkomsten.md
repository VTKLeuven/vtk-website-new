# Online inkomsten (`/admin/inkomsten`)

De opvolger van het rekenblad "Oriëntatie Online Inkomsten" van Beheer: wat er
via Payconiq, Mollie, SumUp en Europabank binnenkwam, per boekhoudcode en per
bankrekening, voor de boekhouder. De kringkeuzes staan in
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
in Na te kijken, een hele dag met de hand, de code van de gekoppelde
ticketverkoop als voorstel bij een kassa, en bij het opladen per bron een "i"
met de kolommen die de site verwacht.

## Bestanden

| Bestand | Wat |
|---|---|
| `lib/inkomsten/parse.ts` | De exports van Payconiq, Mollie (betalingen en balansrapport), SumUp en Europabank lezen: de kolommen per formaat (`EXPORT_COLUMNS`), CSV, bedragen, datums op de Brusselse klok, Mollie-uitbetalingsmaand, kosten per betaling, de uitbetalingen. Puur. |
| `lib/inkomsten/match.ts` | De koppelregels als pure functie (`matchTransaction`), de kassa die een toestel had (`kassaAt`), en de onthouden tekst (`incomeRuleText`). |
| `lib/inkomsten/overview.ts` | Het overzicht als pure som, de rekening op een dag, de dag in Na te kijken (`reviewDay`), per uitbetaling (`groupPayouts`, `payoutState`), de controlelijst (`computeIncomeChecks`). |
| `lib/inkomsten/workbook.ts` | Het kwartaalblad en het controlebestand als bladen voor `write-excel-file`. Puur. |
| `lib/inkomsten/server.ts` | Database: opladen (met voorvertoning), opnieuw koppelen, Na te kijken, overzicht, uitbetalingen afvinken, het model voor de xlsx, lijsten. |
| `lib/inkomsten/importSummary.ts` | De voorvertoning van meerdere gekozen bestanden samen (`combineImportSummaries`). Puur. |
| `lib/inkomsten/kassa.ts` | De kassacontrole: het venster van een kassa (`kassaControlWindow`) en het ingetikte bedrag naast de import (`kassaCheck`). Puur; het optellen is `kassaImportAmounts` in `server.ts`. |
| `app/actions/inkomsten.ts` | Server actions, allemaal achter `income.manage`. |
| `app/[locale]/admin/kassas/` | De code van een kassa (`AcceptForm`, `CodeForm`) en de kassacontrole in het telformulier (`CountForm`); de acties in `app/actions/kassas.ts`. |
| `app/[locale]/admin/inkomsten/` | Overzicht (met de controlelijst en de uitbetalingen), Opladen (met `FormatGuide`, de kolommen per bron), Na te kijken (met `AssignDayForm`), Transacties, Instellingen. |
| `components/ui/InfoTip.tsx` | De "i" met uitleg erachter: hoveren opent, klikken zet vast (ook op een telefoon). |
| `app/api/admin/inkomsten/export/route.ts` | De twee xlsx-bestanden, voor `?van=2026-07&tot=2026-09` en `?soort=boekhouder` of `?soort=controle`. |
| `lib/accounting/import.ts` | De lijst van boekhoudcodes als CSV lezen, en plannen wat opladen doet. Puur. |
| `lib/csv.ts` | De CSV-lezer die beide gebruiken: scheidingsteken raden, aanhalingstekens volgens RFC 4180. |
| `test/inkomsten.test.ts`, `test/inkomstenWorkbook.test.ts`, `test/accountingCodesImport.test.ts` | Parsers, koppelregels, overzicht, controlelijst, de xlsx en de codelijst, zonder database, met verzonnen gegevens. |

Tabellen: `IncomeImport`, `IncomeChannel`, `IncomeChannelAccount` (de rekening
vanaf een dag), `IncomeChannelCode` (de standaardcode vanaf een dag),
`IncomeTransaction`, `IncomeNameRule`, `IncomePeriod`, `IncomePayout` (een
uitbetaling zoals de provider ze noemt), `IncomePayoutCheck`.
Op de kassa: `CashRegister.accountingCodeId`, en `IncomeTransaction.cashRegisterId`
voor de kassa die de code gaf. Instelling: `Setting` `income.config` (de
kostencode).

## Wat de site leest

De kolommen per formaat staan één keer, in `EXPORT_COLUMNS`: het herkennen
(`recognises`) en het lezen gebruiken ze, en de "i" naast elke bron bij het
opladen (`FormatGuide`) toont dezelfde lijst. Een kolom wordt op naam gelezen,
hoofdletters en volgorde maken niet uit; wat niet in de lijst staat (namen,
rekening- en kaartnummers), leest de site niet. Een bestand is van een formaat
wanneer elke verplichte kolom er is. Voeg je een kolom toe of verander je wat
een parser met een regel doet, pas dan ook de zinnen in `FormatGuide` aan.

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
(`12345678.2510.03` is oktober 2025), zoals het rekenblad. Zonder uitbetaling
telt ze nog nergens; wordt ze later opnieuw opgeladen met een uitbetaling, dan
krijgt ze die alsnog. Alles van Payconiq telt in de maand van de betaling.

Het **balansrapport** van Mollie (`Transaction type`, `Settlement amount`) is
elke beweging op het Mollie-saldo (`parseMollieBalance`):

| Regel | Soort |
|---|---|
| `transfer` | een uitbetaling (`IncomePayout`): de referentie, de dag en het bedrag dat naar de bank ging |
| `payment` | overgeslagen (`ignored`): zonder uitbetaling, en de betalingenexport heeft ze al |
| `invoice` | `FEE`: de maandfactuur van Mollie, en een correctie van een paar cent |
| `rolling reserves` | `RESERVE` |
| `refund`, `chargeback` | `REFUND` |

Een kost, reserve of terugbetaling gaat van het saldo af en dus mee met de
**eerstvolgende overschrijving** in het bestand: ze krijgt die uitbetaling en
haar maand. De factuur van 31 augustus telt zo in september. Staat er nog geen
overschrijving na, dan wacht ze zonder maand, zoals een betaling zonder
uitbetaling; een later balansrapport vult ze aan. Een kost uit het
balansrapport heeft een sleutel die met `FEE:bal:` begint (`BALANCE_KEY`).

Nagekeken op het tabblad van Beheer voor het vierde kwartaal van 2025: totaal
€ 40.523,51, kosten −1.434,27, reserve −984,72, exact het kwartaalblad.

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
   code uit het register ("700100 10001 ..." of aaneen), of `reference` of
   `bulk_id` is er een.
4. **Een kassa** (`CASH_REGISTER`): het kanaal is een toestel van de kassa's
   (zie De kassacontrole), en een aanvaarde kassa met een code had dat toestel
   (`kassaAt`, met de kassa's uit `cashRegisterContext`). De transactie
   onthoudt de kassa (`cashRegisterId`). Wanneer een kassa het toestel had,
   hangt af van de soort toestel:
   - **Een toestel van een post**, een kanaal met op die dag een standaardcode
     (de SumUp van Theokot): enkel tijdens de uren van de kassa. Daarvoor en
     daarna neemt regel 6 het weer over.
   - **Een gedeeld toestel**, een kanaal zonder standaardcode (Evenementen 2,
     de terminal van evenementen): vanaf het begin van de kassa tot het begin
     van de volgende kassa met dat toestel. Wat voor de eerste kassa valt,
     koppelt deze regel niet.
   - Een kassa zonder uren loopt van middernacht tot middernacht van haar dag
     (`registerInterval`).
   - Een kassa zonder code koppelt niets: wat in haar venster valt, gaat door
     naar regel 5 en 6. Op een gedeeld toestel sluit ze wel de kassa ervoor af.
5. **Onthouden tekst** (`NAME_RULE`): `incomeRuleText` van de omschrijving
   (kleine letters, zonder ordernummer, zonder e-mailadres) staat in
   `IncomeNameRule` voor die bron.
6. **Standaardcode van het kanaal** (`CHANNEL_DEFAULT`): het kanaal heeft op
   de dag van de transactie een standaardcode (`IncomeChannelCode`: de laatste
   regel op of voor die Brusselse dag, `channelCodeOn`), zoals de QR-code en de
   SumUp van Theokot onder de code van Theokot, of de terminals van Cudi onder
   die van Cudi. Een regel zonder code betekent: vanaf die dag geen. Zo'n
   transactie telt mee zoals elke andere, ook wanneer het kanaal op de eigen
   rekening van een post stort.
7. **Anders**: `rule` blijft `NULL`, en de transactie staat bij Na te kijken.

Regel 4 staat vóór regel 6, zodat een activiteit van een andere post op de
QR-code van Theokot haar eigen code krijgt in plaats van die van Theokot. Ze
staat na regel 3: een betaling die zelf haar code draagt, weet het beter dan
het uur waarop ze viel.

Na een onthouden tekst, een vergeten tekst, een gewiste toewijzing, een
gewijzigde standaardcode of een ander toestel bij een kanaal loopt
`rematchOpenTransactions` opnieuw over alles wat niet met de hand gezet is,
buiten de afgesloten periodes. Een kassa doet hetzelfde wanneer ze aanvaard,
gewijzigd, geteld of verwijderd wordt, of een andere code krijgt
(`rematchIncome` in `app/actions/kassas.ts`). Dat kan ook met de knop "Opnieuw
koppelen", na een nieuwe code in het register.

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

**Een hele dag van een kanaal** (`assignChannelDay`, onderaan Na te kijken):
elke betaling van dat kanaal op die dag krijgt met de hand een code, ook wat de
standaardcode al had. Wat een exacte regel koppelde (de site, een code in de
tekst, een onthouden tekst, een kassa), blijft. "Terug naar de regels" zet wat
er die dag met de hand gezet werd, terug aan de koppelregels; ook wat in Na te
kijken voor die dag gekozen werd. Zo hoeft een dag die de cursusdienst de SumUp
van Theokot leende, geen twee regels met een standaardcode meer.

## Kanalen en rekeningen

Een kanaal (`IncomeChannel`) ontstaat bij de eerste import die het noemt. Beheer
vult in de instellingen in op welke rekening het stort, vanaf welke dag
(`IncomeChannelAccount`), en eventueel een standaardcode vanaf welke dag
(`IncomeChannelCode`; niet bij Mollie: dat is één kanaal voor alles). Het kanaal
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
- **Het venster** (`kassaControlWindow`): de uren van de kassa wanneer een
  andere kassa dat toestel dezelfde dag had, en anders de hele dag, tot het
  einde van een kassa die over middernacht loopt. Zo leest Beheer af: voor en
  na een evenement, of het dagtotaal als dat evenement het enige was. Een kassa
  zonder uren telt altijd de hele dag.
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
- **Het controlebestand** (`controlWorkbook`), voor Beheer: zeven tabbladen die
  de lagen van het rekenblad volgen. Kwartaalblad (hetzelfde, maar elke cel een
  `SUMIFS` op Transacties), Transacties (met de kolom Waarom, uit `reasonOf`),
  Per groep, Per uitbetaling, Na te kijken, Telt niet mee en Bestanden.
  Het bevat wat betalers zelf typten, dus het gaat niet naar de boekhouder.

De regel van een transactie in het kwartaalblad is `quarterLineKey`, en die
sleutel staat ook in kolom I van Transacties. Zo geeft elke formule exact het
bedrag van het blad voor de boekhouder; nagerekend in de preview (18 cellen,
geen verschil).

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
4. elke uitbetaling van Mollie en SumUp klopt: afgevinkt tegen het uittreksel,
   of gelijk aan de overschrijving van Mollie (`payoutState`);
5. Na te kijken staat op nul;
6. elk kanaal heeft een rekening;
7. er is een kostencode, als er kosten zijn.

Afvinken (`IncomePayoutCheck`) bewaart wie, wanneer en het bedrag van dat
moment. Verandert het totaal van de uitbetaling daarna (een export met meer
regels), dan telt ze als gewijzigd en niet meer als afgevinkt. In een
afgesloten periode kan afvinken niet meer. Afsluiten kan met open stappen; de
bevestiging noemt ze.

**Per uitbetaling** op het overzicht: elke uitbetaling met een regel in de
periode, met al haar regels, ook die van buiten de periode (een
SumUp-verkoop telt in haar eigen maand, dus een uitbetaling kan over de rand
lopen). Zonder vinkje is een uitbetaling van Mollie in orde wanneer de som van
de site gelijk is aan de overschrijving uit het balansrapport (`provider`);
anders staat het verschil erbij (`differs`). Een vinkje gaat voor: Beheer zag
het uittreksel. Bij SumUp is de som van de verkopen min hun kosten het bedrag
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
- **De som per Mollie-uitbetaling klopt niet altijd met de overschrijving.** In
  het derde kwartaal van 2026 week de som uit de betalingenexport per
  uitbetaling af van de overschrijving in het balansrapport, in beide
  richtingen, ook met de factuur erbij. Waarom, is nog niet duidelijk. De site
  zet daarom beide naast elkaar en noemt het verschil, in plaats van één van de
  twee te geloven; het uittreksel blijft het bewijs.
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
  (€ 41.228,86). Een dag waarop beide posten het toestel gebruikten, lost de
  standaardcode niet op; een kassa met een code op dat toestel wel, want die
  gaat tijdens haar uren voor (regel 4). Een regel opslaan of verwijderen
  koppelt opnieuw, buiten de afgesloten periodes. Geef een sticker die van
  evenement tot evenement doorgaat geen standaardcode.
- **Een standaardcode van voor de datum.** Bij de migratie naar
  `IncomeChannelCode` kreeg een bestaande standaardcode als begin de dag van de
  eerste transactie op dat kanaal, zodat niets wat ze al koppelde, losraakte.
- **Een gedeeld toestel blijft bij de laatste kassa.** Zonder standaardcode
  loopt een kassa door tot de volgende kassa met dat toestel, ook weken later.
  Dient zo'n toestel ook buiten de kassa's, dan komt dat bij de kassa ervoor.
  Geef het dan een standaardcode: dan telt een kassa er enkel tijdens haar uren.
- **Een toestel hernoemen.** Regel 4 en de kassacontrole vergelijken de naam van
  het bakje of de rekening op de kassa met die op het kanaal. Een hernoemd
  toestel in de instellingen van de kassa's verandert niets aan oude kassa's,
  en het kanaal wijst maar naar één naam: ofwel de oude kassa's, ofwel de
  nieuwe vinden hun transacties dan niet meer. Sluit de periodes met de oude
  naam eerst af.
- **Niets over VTK in de code**, ook niet in een hint of een standaard: de
  kostencode, de rekeningen, de standaardcode van een QR-code en de code van
  een kassa vult Beheer in.
