# Audit: Theokot-broodjes (bestellen, afhalen, no-shows)

Datum: 21 september 2026
Scope: de broodjeskant van Theokot, functie per functie.

- `apps/web/lib/theokot.ts`, `theokot-server.ts`, `theokot-orders.ts`, `theokot-pickup.ts`
- `apps/web/app/actions/theokot.ts`
- `apps/web/app/api/app/v1/theokot/{route.ts,order/route.ts}`
- `apps/web/app/[locale]/theokot/**`, `apps/web/app/[locale]/admin/theokot/**`
  (zonder `verhuur/`), `apps/web/components/theokot/PickupCounter.tsx`
- `apps/web/lib/app-api/notifications.ts` (de twee Theokot-pushberichten),
  `apps/web/app/api/background/maintenance/route.ts`

Verhuur (`theokotVerhuur*`, `/theokot/verhuur`, `/admin/theokot/verhuur`) valt
buiten deze ronde.

> **Stand van zaken.** Alles behalve punt 6 is afgehandeld op 21 september; de
> tekst hieronder beschrijft nog de situatie van voor die wijziging, zodat het
> waarom bewaard blijft.
>
> - De punten 1, 2, 3, 5, 8, 9 en de code-fouten uit punt 10 waren gewoon fout en
>   zijn rechtgezet.
> - De punten 4 en 7 waren kringkeuzes; ze zijn beantwoord en staan nu in
>   `docs/design-decisions.md` onder "Sluiten, verwijderen en te weinig broodjes",
>   samen met de twee keuzes die daaruit volgden (sluiten tegenover verwijderen,
>   en het aanbod onder het bestelde aantal).
> - Punt 6 is beantwoord: de status "Geannuleerd" is uit de correctielijst
>   gehaald. Een bestelling echt schrappen gebeurt nu per bestelling bij de
>   verkoopdag zelf, met een mail naar die student.

## Samenvatting

De opzet klopt. De beslissingen staan op één plek (`lib/theokot-orders.ts`), de
website en de app lopen langs dezelfde deur, elke action checkt een permissie,
de voorraadcheck zit binnen een serialiseerbare transactie, de tijden rekenen
met `Europe/Brussels` in plaats van met een vaste offset, en de no-show-ronde
claimt haar sessie voor ze iets verstuurt. De tests leggen precies de
weigeringen vast die tussen site en app uit elkaar kunnen lopen.

Wat eruit komt, zijn tien punten. Eén ervan laat een student meer broodjes
reserveren dan er zijn; dat is de enige die deze week af moet. Daarna volgen
twee stille gevallen (een opgeheven ban die immuniteit geeft, een no-show-ronde
die op een mislukte mail blijft hangen) en zeven kleinere.

| # | Wat | Ernst | Bestand |
|---|---|---|---|
| 1 | Dubbele bestellijnen omzeilen de voorraad | Hoog | `lib/theokot.ts` |
| 2 | Een opgeheven ban schermt af tegen een nieuwe ban | Middel | `lib/theokot-server.ts`, `app/actions/theokot.ts` |
| 3 | Eén mislukte mail blokkeert de no-show-ronde van die dag | Middel | `lib/theokot-server.ts` |
| 4 | Een dag dichtzetten laat de no-shows ongemoeid | Middel (vraag) | `lib/theokot-server.ts` |
| 5 | "Week aanmaken" en "Ban opheffen" melden hun uitkomst niet | Middel (conventie) | `SessionsManager.tsx`, `BansClient.tsx` |
| 6 | Status "Geannuleerd" geeft voorraad noch plaats vrij | Laag | `app/actions/theokot.ts` |
| 7 | Bonnetjes verlagen het te betalen bedrag niet | Laag (vraag) | `PickupCounter.tsx` |
| 8 | Een bestelvenster dat nooit opengaat, is gewoon op te slaan | Laag | `app/actions/theokot.ts` |
| 9 | Een ban bijwerken verschuift stil haar einduur | Laag | `BansClient.tsx`, `app/actions/theokot.ts` |
| 10 | Kleinere punten (aanbod-editor, turflijst, adminlijst) | Laag | diverse |

---

## 1. Dubbele bestellijnen omzeilen de voorraad (hoog)

`validateOrderLines` (`lib/theokot.ts`) loopt de binnenkomende lijnen één voor
één af en vergelijkt elke lijn apart met de voorraad:

```ts
if (line.quantity > item.quantity) { ... }
```

Er wordt nergens per `sessionItemId` opgeteld. Twee lijnen voor hetzelfde
broodje zijn dus twee losse controles, en de som ervan komt alleen nog langs de
X/Y-limieten. Met de standaardconfig (`maxItemsPerOrder: 5`) en een broodje
waar er nog één van is:

```
lines = [ {item, 1}, {item, 1}, {item, 1}, {item, 1}, {item, 1} ]
→ totalItems 5 (≤ 5), elke lijn 1 (≤ 1) → aanvaard
```

Nagerekend tegen de echte functie: die bestelling komt er als vijf
bestellijnen van één stuk door, goed voor 13 euro aan broodjes waarvan er één
is. `placeOrder` neemt `normalized.lines` één op één over, dus de transactie
vangt dit niet: de voorraadcheck zit ín `validateOrderLines`, en die heeft al
ja gezegd.

De bestelpagina houdt haar aantallen in een `Record` per item-id en kan dus
geen dubbele lijn sturen. De weg loopt langs de VTK-app en langs elke
rechtstreekse aanroep: `appTheokotOrderSchema` laat 50 lijnen toe en zegt niets
over dubbels, en de server-action neemt `lines` zoals ze binnenkomen. De
bovengrens is `maxItemsPerOrder` stuks van één broodje; het broodje van de week
blijft door `maxWeeklySpecialPerOrder` wel beperkt.

Het gevolg is niet alleen een te grote bestelling: `remainingFor` klemt op nul,
dus de broodjes verdwijnen uit het aanbod van de volgende studenten en de
turflijst vraagt aan de smeerploeg vijf stuks van iets waar er één van is.

**Voorstel:** tel de lijnen eerst samen per `sessionItemId` en valideer daarna,
of weiger een dubbele lijn expliciet. Samentellen is vriendelijker voor een
beller die het goed bedoelt. Eén regel bovenaan de lus volstaat, plus een test
naast de bestaande in `test/theokotOrders.test.ts`.

## 2. Een opgeheven ban schermt af tegen een nieuwe ban (middel)

`applyNoShowConsequences` telt de no-shows sinds het einde van de laatste ban:

```ts
const lastBan = await tx.theokotBan.findFirst({
  where: { userId: order.userId },
  orderBy: { endsAt: 'desc' },
});
const since = lastBan ? lastBan.endsAt : new Date(0);
```

Er staat geen `active` in die `where`. Voor een ban die gewoon uitgedaan is,
klopt dat precies zoals het in `docs/design-decisions.md` beschreven staat: na
een ban begin je met een schone lei.

Maar `liftBanAction` en de `liftBan`-checkbox van `correctOrderStatusAction`
zetten enkel `active: false`; `endsAt` blijft staan waar hij stond. Wie op 1
oktober voor veertien dagen geband wordt en op 2 oktober vergiffenis krijgt,
houdt dus tot 15 oktober een `since` in de toekomst, `noShowCount` blijft nul,
en er kan in die twee weken geen automatische ban meer volgen. Precies iemand
die net liet zien dat het misloopt, is dan even onaantastbaar.

**Voorstel:** ofwel `active: true` in die `findFirst` en daarnaast een `endsAt`
in het verleden eisen, ofwel het opheffen `endsAt: new Date()` laten
meeschrijven. Het tweede is eerlijker tegenover de historiek: de ban heeft dan
echt geduurd wat hij geduurd heeft, en elke andere lezing van die tabel klopt
meteen mee.

Terzijde, dezelfde telling gebruikt `updatedAt > since` als "wanneer was die
no-show". `updatedAt` is de laatste wijziging van de rij, niet het moment van
de no-show: een oude no-show die later nog een notitie krijgt, schuift mee naar
voren en telt opnieuw mee. `noShowProcessedAt` staat er al en zegt wel wat het
moet zeggen.

## 3. Eén mislukte mail blokkeert de no-show-ronde van die dag (middel)

In `processDueNoShows` staat de mail vóór de markering, en `sendNoShowWarning`
roept `sendMail` met `throwOnError: true`. Loopt één adres vast (SMTP weigert,
een mailbox bestaat niet meer), dan:

- gooit `applyNoShowConsequences`,
- vangt de `catch` van de sessie dat op, zet `processingStartedAt` terug op
  null en logt,
- blijft `session.processedAt` leeg,
- probeert de worker het vijf minuten later opnieuw, en zo verder.

De bestellingen staan op dat moment al op `NO_SHOW` (die `updateMany` zat in
een eigen transactie die wel doorging), dus de student is wel degelijk
gemarkeerd. Wat blijft hangen is de mail en de ban die erachter komt. Bij een
adres dat het blijvend begeeft, is dat een lus die nooit stopt en die het
mailkanaal elke vijf minuten opnieuw probeert.

Merk op dat wie al gemaild is, wel met rust gelaten wordt: de include filtert
op `noShowProcessedAt: null`, dus een herhaling raakt enkel de order die viel.
Het probleem is de order die altijd valt.

**Voorstel:** een mislukte waarschuwingsmail is geen reden om de verwerking
tegen te houden. Markeer de order alsnog als verwerkt (de mail staat met haar
fout in `EmailLog`, dus ze is terug te vinden), of tel een poging en geef het na
drie keer op. De ban hangt aan de no-show, niet aan de mail.

## 4. Een dag dichtzetten laat de no-shows ongemoeid (middel, eerst een vraag)

De sessiequery in `processDueNoShows` vraagt `isOpen: true`. Een verkoopdag die
na afloop dichtgezet wordt, wordt dus nooit verwerkt: de bestellingen blijven
op `RESERVED` staan, er vertrekt geen mail, en `processedAt` blijft voorgoed
leeg.

Als "dichtzetten" betekent "die dag ging niet door, reken niemand iets aan",
dan is dit precies goed en hoort er een zin over in
`docs/design-decisions.md`. Betekent het "de bestelronde is voorbij" en zet
iemand een dag dicht nadat de broodjes zijn uitgedeeld, dan verdwijnen de
no-shows van die dag stil.

**Voorstel:** kies één van de twee en schrijf het op. Wordt het de eerste
lezing, zet dan bij het dichtzetten van een dag die nog openstaande
bestellingen heeft in de bevestiging wat er met die bestellingen gebeurt.

## 5. "Week aanmaken" en "Ban opheffen" melden hun uitkomst niet (middel, conventie)

`CLAUDE.md` is hier uitgesproken over: een opslaan-knop die niets zichtbaars
doet is een bug, gebruik `SaveForm`, en verwachte invoerfouten geef je terug in
plaats van ze te gooien.

- `createWeekSessionsAction` hangt aan een kaal `<form action={...}>` in
  `SessionsManager.tsx`, geeft `void` terug en gooit `new Error("Ongeldige
  weekstart")` en `new Error("Ongeldige foto bij het aanbod")`. Een week
  aanmaken is de zwaarste handeling van het scherm (dagen, aanbod én shiften),
  en de enige bevestiging is dat de lijst eronder verandert. Overgeslagen dagen
  zegt hij niet: de samenvatting met "bestaande dagen overgeslagen" gaat naar
  het auditlogboek, niet naar de gebruiker. Wie een week opnieuw aanmaakt met
  een ander aanbod, krijgt dus een groen niets terwijl er niets gebeurd is.
- `liftBanAction` staat in hetzelfde patroon (`<form action={liftBanAction}>`,
  `Promise<void>`). Hier is het lichter: de knop verdwijnt na de revalidatie,
  dus er is wél iets te zien.

**Voorstel:** `createWeekSessionsAction` naar `SaveState` met `saveOk()` /
`saveError(code)`, de twee gegooide fouten als codes met een melding in
`errorMessages`, en in de geslaagde toast zeggen hoeveel dagen er bij kwamen en
hoeveel er al bestonden. `liftBanAction` mag mee in dezelfde beweging.

## 6. Status "Geannuleerd" geeft voorraad noch plaats vrij (laag)

Bij een student is annuleren wissen: `cancelOrder` doet `delete`, en dat geeft
zowel de voorraad als het uniek-slot vrij. Dat is ook zo gedocumenteerd.

De correctielijst in `/admin/theokot/bans` biedt daarnaast "Geannuleerd" als
status aan. Die zet enkel `status: "CANCELLED"`. De bestellijnen blijven staan,
en `usageForSessionItems` telt bestellijnen zonder naar de status te kijken, dus
de broodjes blijven bezet; de unieke sleutel `(sessionId, userId)` blijft
bezet, dus die student kan die dag ook niets nieuws bestellen. Voor een ronde
die al voorbij is maakt dat weinig uit, maar twee knoppen die "annuleren" heten
en iets anders doen, is er één te veel.

**Voorstel:** ofwel de bestellijnen meetellen per status (en `CANCELLED` niet
meerekenen in `usageForSessionItems`), ofwel die optie uit de lijst halen en de
correctie beperken tot opgehaald / no-show / gereserveerd. De tweede is
kleiner en dekt wat het scherm eigenlijk moet kunnen.

## 7. Bonnetjes verlagen het te betalen bedrag niet (laag, vraag)

`redeemEmployeeVouchersAction` boekt twee bonnetjes af en schrijft een
`TheokotVoucherRedemption` van 2. In `PickupOrderPanel` blijft "Bestelwaarde"
daarna het volledige bedrag; eronder komt een regel dat er twee bonnetjes
gebruikt zijn "voor één broodje in deze bestelling". Wie aan de balie staat,
moet dus zelf uitrekenen wat er nog te betalen is, met een rij voor zich.

De transactie zelf is netjes (afboeken en registreren in één serialiseerbare
transactie, en `P2002` wordt opgevangen).

**Voorstel:** trek de prijs van het duurste (of het goedkoopste, wat de
kringkeuze ook is) broodje af en toon "nog te betalen". Welke van de twee het
is, hoort in `docs/design-decisions.md`, want dat is een kringkeuze en niet een
technische.

Kleinere zaken in hetzelfde scherm: de bevestigingsdialoog springt vanzelf open
zodra iemand met twee bonnetjes gescand wordt, en wie op "Nee" klikt, krijgt
hem enkel terug door opnieuw te scannen.

## 8. Een bestelvenster dat nooit opengaat, is gewoon op te slaan (laag)

Noch `createWeekSessionsAction` noch `updateSessionAction` vergelijkt de uren
met elkaar. Een dag met `orderOpenAt` ná `orderCloseAt` (bijvoorbeeld
`orderLeadDays: 0` met openen om 12:00 en een deadline om 10:30) slaat gewoon
op, en `canOrderNow` blijft dan altijd false: de dag staat online, niemand kan
bestellen, en niets zegt waarom. Hetzelfde voor een `pickupEnd` vóór
`pickupStart`.

`saveConfigAction` bewaakt de relatie X > Y ook niet, terwijl de documentatie
die wel stelt. En `num()` daar aanvaardt een kommagetal, terwijl `coerceInt` bij
het lezen `Number.isInteger` eist: een beheerder die 2,5 invult, ziet "opgeslagen"
en krijgt stilletjes de default terug.

`updateSessionAction` gebruikt bovendien de ruwe veldwaarde waar
`createWeekSessionsAction` `validTime()` gebruikt. Bij een niet-geldige tijd
levert `brusselsTimeOnDay` een Invalid Date en gooit Prisma. Dat is enkel via
een vervalste post te bereiken, maar het is dezelfde functie, twee regels
verderop, met twee verschillende gewoontes.

**Voorstel:** één `validateWindows`-helper die `orderOpenAt < orderCloseAt`,
`pickupStart < pickupEnd` en X > Y nakijkt, gebruikt door de drie actions, met
een foutcode per geval.

## 9. Een ban bijwerken verschuift stil haar einduur (laag)

`BansClient` vult het datumveld met `b.endsAt.toISOString().slice(0, 10)`, dus
de UTC-dag, terwijl het label ernaast in Brussel-tijd staat. Bij een ban die na
middernacht Brussel eindigt, tonen het veld en het label een andere dag.

`updateBanAction` leest dat veld terug met `new Date("2026-10-15")`, en dat is
middernacht UTC. Wie enkel een notitie bijwerkt, verzet daarmee het einde van
de ban naar 01:00 of 02:00 Brussel op die dag. Klein, maar het is het enige
plekje in dit onderdeel waar de Brussel-afspraak niet wordt aangehouden.

`updateBanAction` kijkt ook niet of de nieuwe einddatum na `startsAt` ligt.

**Voorstel:** `brusselsYMD` voor de weergave en `brusselsWallClock(..., "23:59")`
of `"00:00"` bij het terugschrijven, net zoals de sessie-uren dat doen.

## 10. Kleinere punten

- **Aanbod-editor raakt een item zonder zijn sessie te controleren.**
  `updateSessionItemsAction` doet `theokotSessionItem.update({ where: { id } })`
  zonder `sessionId` in de `where`. Wie `theokot.manage` heeft kan dus met een
  vervalst id een item van een andere verkoopdag herschrijven. Binnen dezelfde
  permissie, dus geen rechtenprobleem, maar `where: { id, sessionId }` kost
  niets.
- **Voorraad onder wat al besteld is, mag stil.** Dezelfde action laat toe om
  `quantity` lager te zetten dan er al gereserveerd is. `remainingFor` klemt op
  nul, de bestaande bestellingen blijven staan, en niets waarschuwt dat de
  smeerploeg minder broodjes ziet dan de turflijst vraagt. Toon het aantal dat
  al weg is naast het veld, of weiger onder dat aantal te gaan.
- **Turflijst laadt elke verkoopdag ooit.** `allSessions` haalt alle sessies op
  voor het keuzelijstje, zonder `take`. Na twee jaar is dat een lijst van
  honderden. Beperk tot bijvoorbeeld de laatste zestig dagen plus de toekomst.
- **Turflijst sleutelt op naam.** `<tr key={i.name}>`, en twee items met
  dezelfde naam in één dag geven een dubbele React-key en twee rijen die er
  identiek uitzien. Gebruik het item-id en tel gelijke namen eventueel samen.
- **Turflijst rekent met 24 uur.** `dayEnd = dayStart + 86400000` voor het
  ophalen van de vergaderingen van die dag. Op de twee dagen dat de klok
  verspringt, schuift dat venster een uur. Overal elders rekent dit onderdeel
  met `shiftYMD`.
- **Adminlijst rekent in servertijd.** `/admin/theokot` bouwt zijn ondergrens
  met `new Date(from.getFullYear(), ...)`, dus in de tijdzone van de container,
  en trekt er na de `-86400000` nog een dag af: het commentaar zegt "van
  gisteren", het resultaat is twee dagen terug. Gebruik `brusselsYMD` +
  `shiftYMD` zoals de rest.
- **Afhaalpagina telt unieke studenten door alles op te halen.** De
  `groupBy(["userId"])` zonder aggregatie haalt één rij per student op om er
  `length` van te nemen. Prima nu, minder prima na een paar jaar bonnetjes.
- **Een no-show kan aan de balie niet meer bediend worden.** `pickupForUser`
  filtert op `RESERVED` en `PICKED_UP`, dus vanaf het moment dat de worker de
  bestelling op `NO_SHOW` zet, zegt de balie "heeft geen bestelling voor
  vandaag". Dat klopt inhoudelijk (het is een kwartier na sluiting), maar het
  bericht klopt niet: er wás een bestelling. Toon de no-show met haar status in
  plaats van te zeggen dat er niets is.
- **`weeklySpecialLabelNl/En` staan nog in het schema** en worden nergens meer
  gelezen; dat is zo gedocumenteerd. Een migratie die ze weghaalt, scheelt de
  volgende lezer een zoektocht.

## Wat er goed zit

Het is de moeite om ook op te schrijven wat niet hoeft te veranderen, anders
leest een audit als een lijst van wat er mis is.

- **Eén implementatie voor twee bellers.** `lib/theokot-orders.ts` maakt het
  onmogelijk dat de app soepeler is dan de site, en de tests bewaken precies
  die weigeringen.
- **De voorraadcheck zit in de transactie**, en de bezetting telt de
  vergaderingen mee (`usageForSessionItems`). Dat is de val waar zo'n systeem
  normaal in loopt.
- **Annuleren geeft hetzelfde antwoord voor "bestaat niet" en "niet van jou",**
  en `P2025` bij het wissen wordt als succes gelezen.
- **Elke action checkt een permissie**, en de balie buiten admin doet dat
  bovendien nog eens op de pagina zelf.
- **De no-show-ronde claimt per sessie** met een vervallende lease van vijftien
  minuten, is idempotent via `processedAt`, en staat in de worker en niet in
  het renderproces. Ook de twee pushberichten claimen eerst en versturen dan.
- **De maintenance-route vergelijkt haar secret in constante tijd** en draait de
  taken naast elkaar in plaats van in één try-blok.
- **Tijd rekent met `Intl` in Europe/Brussels**, niet met een vaste offset, en
  de foto-velden onderscheiden "leeg gelaten" van "gewist".

## Voorgestelde volgorde

1. Punt 1 (dubbele lijnen). Klein, te testen, en het is de enige die vandaag
   broodjes kost.
2. Punt 2 en 3. Allebei stil, allebei een paar regels.
3. Punt 5 en 8. Dezelfde ronde door de drie beheer-actions.
4. Punt 4, 6 en 7 zijn eerst een kringkeuze; de code volgt uit het antwoord.
5. Punt 9 en 10 wanneer je toch in het bestand zit.
