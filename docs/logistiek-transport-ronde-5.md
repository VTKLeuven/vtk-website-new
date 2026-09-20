# Werkplan: transportronde 5 (september 2026)

Bron: het document "Feedback nieuwe website", sectie **Feedback ronde 4**.
Drieëntwintig punten, bijna allemaal over de transportplanning en over wat een
post zelf kan.

> **Let op de nummering.** De repo telt zijn eigen rondes (dit is de vijfde
> werkplan), het document van Logistiek telt de zijne. Wat daar "ronde 4" heet,
> is dit bestand. De taakcodes hieronder (`F4.1` … `F4.23`) volgen de volgorde
> van het document, zodat "punt 8 van ronde 4" aan beide kanten hetzelfde is.

Bouwt voort op `docs/logistiek-feedback-plan.md` (ronde 1),
`docs/logistiek-feedback-ronde-2.md`, `docs/logistiek-transport-ronde-3.md` en
`docs/logistiek-transport-ronde-4.md`, alle vier afgewerkt.

Technische kaart van de module: `docs/uitleendienst.md`.
Productkeuzes: `docs/design-decisions.md` (§ Uitleendienst).
Rechten: `docs/permissions.md`.

## Hoe je dit gebruikt

1. Kies een fase (of één taak) en geef die in plan-modus.
2. Taken met **🗄️** vragen een Prisma-migratie in `packages/db/prisma/schema.prisma`.
3. Taken met **📝** vragen een sectie in `docs/design-decisions.md`.
4. Vink af in dit bestand als iets af is; zet er het commit-hashje bij.

Prioriteiten: **P1** = bug of dagelijkse ergernis, **P2** = duidelijke
verbetering, **P3** = groter of "ooit".

Alles wordt op **390px breed** nagekeken, niet alleen op desktop.

## Beslissingen die al gevallen zijn

- **D1. De hele logistiek-app gebruikt de volle vensterbreedte.** Niet enkel de
  roosters: `--max: 1240px` verdwijnt in `apps/logistiek`. De styleguide in
  `CLAUDE.md` pint die 1240px voor vtk.be en krijgt hier een uitzondering bij.
  Zie F4.6.
- **D2. Bij het doorgeven van een rit aan een post vertrekt standaard geen
  mail.** Wie wél verwittigd wordt, is een instelling: niemand, de
  verantwoordelijken, het postadres, of een vast adres. Vandaag mailt
  `notifyGroupAssignedForTrip` onvoorwaardelijk de verantwoordelijken. Zie F4.8b.
- **D3. Een rit die je zelf rijdt, blijft ook bij je post staan.** Kies je jezelf
  als chauffeur, dan staat de rit zowel onder "Komende ritten" als onder "Ritten
  van mijn post". Vandaag verdwijnt hij uit de tweede lijst. Zie F4.19.
- **D4. De Google-agenda blijft traag, en dat laten we zo.** Google poolt een
  geabonneerde ICS op eigen tempo (8 tot 24 uur, soms langer) en negeert onze
  `REFRESH-INTERVAL:PT6H`. Apple en Outlook zijn sneller. Niet van ons op te
  lossen zonder er een mail of push naast te zetten, en dat wilde Logistiek niet.
  Zie F4.11.

## Statusoverzicht

| Fase | Inhoud | Taken | Status |
| --- | --- | --- | --- |
| 1 | De post ziet en regelt haar eigen ritten | F4.18, F4.19, F4.9, F4.8a, F4.8b, F4.12, F4.17 | ✅ af (`dce13cf7`) |
| 2 | Leesbaarheid van de planning | F4.16, F4.1, F4.13, F4.15 | ✅ af (`5835b84f`) |
| 3 | Breedte en gsm | F4.6, F4.7, F4.14 | ✅ af (`e65da138`) |
| 4 | Chauffeursnummers en werkgroepen | F4.3, F4.10 | 🟡 schermen af (`503735c0`), één nummer open |
| 5 | Beschikbaarheid | F4.2, F4.5 | ✅ af (`435ecf21`) |
| 6 | Ritten bewerken en noteren | F4.4, F4.20 | ✅ af (`634313e0`, deze commit) |
| 7 | Voertuigen | F4.21, F4.22 | ⬜ open |
| 8 | Statistiek | F4.23 | ⬜ open |
| - | Bewust niet gedaan | F4.11 | ⛔ |

Fase 1 eerst: daar zit het enige echte defect van deze ronde, en het draagt zeven
van de drieëntwintig punten. **Fase 1, 2, 3, 5 en 6 zijn af** (`dce13cf7`,
`5835b84f`, `e65da138`, `435ecf21`, `634313e0`) en van fase 4 staat alle code er
(`503735c0`); daar blijft enkel het juiste nummer van Sofie Bruggeman over, en
dat is geen code maar één veld op liv. Fase 7 is de volgende.

---

# Fase 1: de post ziet en regelt haar eigen ritten

### ✅ F4.18. Een goedgekeurde rit van je post staat niet onder "Mijn ritten"
**P1 · code · `dce13cf7`**

Logistiek speelde het na: post vraagt een autorit, Logistiek keurt goed, en de
rit verschijnt níét onder "Ritten van mijn post" van die post. Hij verschijnt
pas zodra je zegt dat de post zelf de chauffeur mag kiezen.

De oorzaak staat in `lib/uitleen-server.ts`, `tripsForGroups`:

```ts
OR: [
  { assignedGroupId: { in: groupIds } },
  { groupId: { in: groupIds }, driverId: { not: null } },
],
```

De tweede tak eist een chauffeur. Een goedgekeurde rit die er nog geen heeft,
valt dus weg, en dat is precies de rit waar een post iets mee moet.

**Gedaan.** `driverId: { not: null }` is weg. De sectie heet "wat je medeleden
rijden én wat er nog een chauffeur mist"; die tweede helft werkte enkel via
`assignedGroupId`.

`driverStatus` telt nu dezelfde twee takken, anders belooft de navigatie iets
anders dan het scherm toont. De integratietest legde het omgekeerde vast ("zonder
chauffeur valt de rit uit die lijst") en keert nu om: dat was de bug, zwart op
wit.

### ✅ F4.19. Een rit die je zelf rijdt, verdwijnt bij je post
**P1 · code · 📝 · `dce13cf7`**

Zelfde functie, de regel eronder:

```ts
return trips.filter((trip) => trip.driverId !== userId);
```

Kies je jezelf als chauffeur, dan verhuist de rit van "Ritten van mijn post" naar
"Komende ritten". Logistiek wil hem in **beide** lijsten (D3).

**Gedaan.** De filter is weg; de kaart in de postlijst draagt nu het merkteken
**"Jij rijdt"**, anders leest dezelfde rit twee keer als twee ritten. De teller op
de hub was daardoor dubbel (`ownTrips + groupTrips`) en is één telling geworden.
📝 Staat in `docs/design-decisions.md` onder "Een rit van je post staat op Mijn
ritten, ook als jij hem rijdt".

### ✅ F4.9. Enkel chauffeurs van die post zijn kiesbaar
**P2 · code · `dce13cf7`**

`groupMemberOptions` geeft élk lid van de post terug, dus een post kan iemand
zonder rijbewijs op een autorit zetten. Logistiek wil de doorsnede: leden van de
post die ook in de chauffeurspool zitten.

**Gedaan.** `groupMemberOptions` snijdt met de pool (`logistiekTeamMembers()`
plus de rijen in `UitleenDriver`, zoals `driverOptions` hem samenstelt).

**De lege lijst is afgehandeld.** Staat er niemand van die post in de
chauffeurslijst, dan toont `GroupDriverPicker` geen keuzelijst maar een zin met
het mailadres erin. Blijft wél een keuzelijst wanneer Logistiek er al iemand op
zette; anders verdwijnt die naam van het scherm. F4.10 (chauffeurs aan posten en
werkgroepen toevoegen) is het andere eind van dit punt en staat nog open.

### ✅ F4.8a. Een postlid voegt een bijrijder toe vanuit "Ritten van mijn post"
**P2 · code · `dce13cf7`**

De serverkant kan het al: `addTripHelperAction` laat een collega van dezelfde
post toe, en `TripHelpers` is een bestaande component. Op `/ritten` worden de
bijrijders enkel **getoond**.

**Gedaan.** `<TripHelpers canEdit>` staat onder het raster van een postrit, op
dezelfde plek als op het bezettingsoverzicht. De oude losse velden
(`helpersNote`, `helpersPhone`) reizen mee als één `legacyNote`.

`vanBookingForMember` kreeg de derde tak (`assignedGroupId`), en de leeskant
(`ownsTransportBooking`, `transportWeekForPraesidium`) is meegegaan: die twee
regels moeten hetzelfde zeggen, en `test/trip-access.test.ts` dwingt dat af.

### ✅ F4.8b. Geen mail meer naar de verantwoordelijken, tenzij je dat instelt
**P2 · code · 📝 · `dce13cf7`**

Vandaag mailt `notifyGroupAssignedForTrip` altijd `groupLeads()`. Dat wordt een
keuze in `/beheer/instellingen`, naast `showRentPrices` in dezelfde
`Setting`-sleutel (zie `saveLogistiekSettingsAction`):

```
Wie verwittigen bij het doorgeven van een rit aan een post?
( ) Niemand, de rit staat onder "Ritten van mijn post"   ← standaard
( ) De verantwoordelijken van die post
( ) Het postadres (bv. sport@vtk.be)
( ) Een vast adres: [                    ]
```

**Gedaan**, precies zoals hierboven. Het postadres komt uit de mailinglijsten
(`MailGroup`), en enkel uit een lijst die precies díé ene post als bron heeft:
`praesidium@vtk.be` is "elke actieve post" en is niet het adres van deze post.

**Twee schermen zeggen nu de waarheid in plaats van een belofte.** De zin onder
"Post kiest zelf de chauffeur" volgt de instelling, en de melding ná het doorgeven
ook: "geen mail" is daar geen waarschuwing meer (het is de bedoeling), terwijl een
post zonder verantwoordelijke of zonder eigen adres dat wél blijft. Die teksten
staan in `lib/uitleen.ts` (`handoverNote`, `mergeHandover`) en zijn getest;
ze zaten in een `'use server'`-module en waren daar niet te bereiken. Daar kwam
ook een tikfout uit boven die er al stond: "kreegen".

📝 `design-decisions.md`, "Een rit doorgeven aan een post mailt standaard
niemand".

### ✅ F4.12. "Post vult zelf in" heet voortaan "Post kiest zelf de chauffeur"
**P2 · code · `dce13cf7`**

Logistiek vroeg letterlijk wat het veld betekent. Het zet `assignedGroupId`, en
dat is exact "deze post duidt zelf de chauffeur aan".

Twee plekken: `app/beheer/vervoer/week/new-trip-form.tsx:268` en
`app/beheer/vervoer/transport-controls.tsx:128`.

### ✅ F4.17. De aanvragende post staat meteen voorgesteld
**P2 · code · `dce13cf7`**

Maak je een autorit voor Sport, dan mag Sport meteen in "Post kiest zelf de
chauffeur" staan. Een voorstel en geen dwang: het veld blijft leeg te zetten,
anders krijgt elke rit die Logistiek zelf rijdt er stil een post op.

**Gedaan** in `new-trip-form.tsx`, met een `assignedTouched`-vlag: zodra je het
veld zelf aanraakt, volgt het niets meer. Wisselen naar de kar haalt het voorstel
weg en terugwisselen naar de auto zet het terug, zolang je er zelf van af bleef;
anders verdwijnt het bij een wissel heen en weer zonder dat je het merkt.

---

# Fase 2: leesbaarheid van de planning

### ✅ F4.16. De legende klopt niet, en "aangevraagd" is niet te herkennen
**P1 · code · 📝 · `5835b84f`**

Twee dingen in één punt.

**1. De legende liegt.** Op `/vervoer/bezetting` staat:

> De vulkleur is de chauffeur, de arcering is het voertuig; een rit zonder
> chauffeur is geel met een rode streepjesrand.

`globals.css` tekent een rit zonder chauffeur grijs met `--driver-edge`, en de
comment in `trip-block.tsx` beweert nog steeds geel plus rood. Dat is in een
eerdere ronde gewijzigd zonder de tekst mee te nemen. Logistiek: *"ik zie geen
geel met rode streepjesrand (en die hoeft er ook niet te komen)"*.

**2. Arcering en status spreken dezelfde taal.** De voertuigarcering kan
`diagonal`, `vertical`, `dots` of `grid` zijn, en "nog te beslissen"
(`.week-block-requested`) is óók schuine strepen. Op de screenshot van Logistiek
staan stippen, verticale strepen en ruitjes door elkaar, en niets zegt welke
streep "dit moment kan nog vrijkomen" betekent. Met een voertuig op `diagonal`
zijn de twee letterlijk hetzelfde.

**Gedaan, en er zat meer achter dan onleesbaarheid.** De twee patronen
*stapelden niet eens*: `.week-block-requested` en `.trip-pattern-*` zetten
allebei `background-image`, en die van het voertuig stond verderop in
`globals.css` en won. Een aangevraagde rit met een gearceerd voertuig droeg dus
**helemaal geen** markering meer; de comment die beweerde dat 45 en 135 graden
samen als een ruit lezen, beschreef iets wat de browser nooit getekend heeft.

"Nog te beslissen" is nu een volle streep langs de bovenrand (`.trip-requested`),
als **rand** en niet als pseudo-element: hetzelfde blok is in de weekweergave een
absoluut gepositioneerde doos en in de maandweergave een `flex`-rij, waar een
`::before` een flex-item naast de tekst wordt in plaats van een streep erboven.

**De legende tekent nu de echte blokken** (`components/transport-calendar/legend.tsx`),
met dezelfde klassen. Een legende in woorden is een tweede waarheid over
hetzelfde, en precies daarom stond er nog "geel met een rode streepjesrand".
Alleen de voertuigen die écht een arcering hebben staan erin: drie identieke
vakjes met drie namen ernaast beweren dat je ze uit elkaar kan houden.

Nagekeken in de browser, in beide modi, met de auto op `diagonal` en de rit op
aangevraagd: de streep, de gele rail en de arcering zijn alle drie tegelijk te
zien. 📝 `design-decisions.md`, "Een blok op de transportplanning draagt drie
dingen, elk in een eigen taal".

### ✅ F4.1. Filteren op post
**P2 · code · `5835b84f`**

Met veel chauffeurs wordt de planning onoverzichtelijk; Logistiek wil "alle
ritten van Acti" kunnen zien. Er is al een filter op voertuig, chauffeur, status
en aanvragertype.

**Gedaan:** sleutel `post`, die matcht op `groupId` **én** `assignedGroupId`,
in `FILTER_QUERY_KEYS` (met een test die dat afdwingt), in beide schermen.

Twee dingen die onderweg bleken. `transportFilterWhere` gebruikte `OR` al voor de
chauffeursfilter, en twee `OR`-sleutels in hetzelfde object kan niet: het zijn nu
takken van één `AND`, zodat "van Acti én zonder chauffeur" ook echt een EN is. En
de filter wordt op het publieke overzicht gewist voor wie geen aanvrager mag
zien; een keuzelijst verbergen is geen poort, en `?post=<id>` zou anders laten
uitvissen wanneer één post rijdt.

### ✅ F4.13. Het nummer van de chauffeur in de post- en werkgroepweergave
**P2 · code · `5835b84f`**

**Gedaan** met `PhoneLink`, in allebei de lagen van het kaartje (het team en een
post), uit één `driverPhones`-query op precies de chauffeurs die op dat scherm
staan. Niets zonder login: daar staat geen naam, dus al zeker geen nummer.

### ✅ F4.15. De ritten van je eigen post vallen op
**P2 · code · `5835b84f`**

Kijkt iemand van Sport naar de planning, dan mogen alle ritten voor Sport (door
Logistiek én door henzelf) eruit springen.

**Gedaan** met de gele accentrail, maar als `border-left` en niet als
`box-shadow`: de selectie in de kalender is een Tailwind-`ring`, en dat ís een
box-shadow, dus een tweede schaduw had de ring van het aangeklikte blok
weggenomen. Rood vol blijft een conflict en grijs gestreept blijft "nog geen
chauffeur"; die staan op de andere randen en blijven dus zichtbaar.

Enkel op het bezettingsoverzicht. Op de planning van het team zou het niets
onderscheiden: daar is elke rit van jou. Een rit telt als "van ons" wanneer je
post ze aanvroeg **of** ze doorgegeven kreeg, net zoals de filter hierboven.

---

# Fase 3: breedte en gsm

### ✅ F4.6. De app gebruikt de volle breedte
**P1 · code · 📝** (`e65da138`)

*"Die zijkanten mogen opgevuld worden, zodat ik niet hoef in te zoomen."*

**Gedaan.** `--max` is weg uit `apps/logistiek/app/globals.css`, en met hem de
twee `max-width`-regels die eraan hingen. De zijmarge
(`clamp(20px, 3vw, 36px)`) heet nu `.logistics-gutter` en staat op alles wat over
de volle breedte loopt: de paginakop, de inhoud, het beheerblad, de voettekst en
de donkere band op de startpagina. Die klasse was nodig, geen opsmuk: zolang er
een kolom van 1240px was, lijnden die blokken vanzelf onder elkaar uit, en nu
doet enkel die marge dat nog. De voettekst en de band op de startpagina hadden
hun eigen `max-w-[1240px]` en sprongen dus in.

Het beheer had geen `--max` maar zijn eigen 1440/1720px met een knop om de
zijbalk in te klappen; die grens is ook weg (D1 zegt de hele app). Inklappen wint
nu enkel nog de breedte van de zijbalk, wat op de weekplanning dezelfde winst is.

**Nagekeken:** de beheertabellen met `minmax(0,1fr)`-kolommen rekken netjes mee.
De formulieren niet: een invoerveld van negenhonderd pixels voor één zin is
leegte, en een opslaanknop over de volle breedte ziet er niet uit als een knop.
Die houden hun leesbreedte met `.logistics-form-width` (1100px, precies wat ze
hiervoor hadden): instellingen, teksten, chauffeurs, sjablonen, het
aanvraagformulier voor een rit en de detailkaart van een rit of een aanvraag. De
catalogus van materiaal en flesserke blijft wél vol, want meer breedte is daar
meer items per rij.

📝 Staat in `design-decisions.md` ("De uitleendienst gebruikt de volle
vensterbreedte") met de uitzondering in `CLAUDE.md`, op de twee plekken die de
breedte pinden: de Layout-regel en de regel over functionele modules.

### ✅ F4.7. "Vandaag" springt niet naar vandaag
**P1 · code** (`e65da138`)

In de dagweergave op gsm zette de knop wel de juiste week, maar niet de juiste
dag: `onToday` navigeert naar deze week, en sta je daar al, dan verandert `days`
niet en gebeurt er dus niets.

**Gedaan.** De knop springt nu zelf naar vandaag wanneer die in het venster zit,
en een effect kiest de dag opnieuw zodra `days` verandert.

Onderweg bleek dezelfde oorzaak een tweede bug te dragen: vegen voorbij zondag
bracht je op zondag van de week erna in plaats van op maandag, want `index` bleef
staan terwijl het venster opschoof. Een veeg zet daarom nu de richting klaar, en
die wint van vandaag: terugvegen naar deze week hoort op zondag uit te komen en
niet op woensdag. Alle drie de gevallen nagekeken in de browser op 390px.

### ✅ F4.14. "Mijn ritten" is geen gsm-scherm
**P1 · code** (`e65da138`)

**Nagekeken op 390px**, met de bijrijders van F4.8a erbij. De kaart stapelt
correct, niets loopt buiten het scherm, en het blok bijrijders en de
chauffeurskeuze passen. Twee dingen aangepast:

- Het tijdvenster schreef de dag twee keer voluit ("di 22 september 2026 om 17:00
  tot di 22 september 2026 om 22:00"), goed voor twee regels. `formatTripWindow`
  in `lib/uitleen.ts` schrijft de dag één keer en zet de tweede dag er enkel bij
  wanneer de rit over middernacht gaat, hetzelfde stramien als
  `formatEventMoment`. Vier tests.
- Het feitenraster had één `gap`, dus "Laadadres" stond even ver van "VTK-kelder"
  als van "Bestemming": in één kolom bindt enkel die afstand een label nog aan
  zijn waarde. De rij-afstand is nu groter dan de afstand binnen een rij.

De koptekst van de site schuift op een telefoon horizontaal (zeven links in een
scroller). Dat is zo gebouwd en niet van deze taak, maar het valt op 390px op;
als het moet veranderen, is dat een eigen punt.

---

# Fase 4: chauffeursnummers en werkgroepen

### 🟡 F4.3. De nummers komen uit de gedeelde gsm-lijst
**P2 · code · `503735c0`** (de code is af; enkel het nummer van Sofie Bruggeman staat
nog open, en dat is een veld op liv)

*"Zou het mogelijk zijn om de telefoonnummers van de chauffeurs automatisch uit
deze lijst te halen? (Alleen de nummer van Viktor Meekers staat fout in die
lijst)"*

De lijst is `tortubois_gsm-lijst.vcf`: 94 contacten, elk `FN: Voornaam
Achternaam` met één nummer als `0032` plus negen cijfers, geen dubbele namen of
nummers.

**Klaar:**

- `apps/logistiek/lib/vcard.ts`: parsen (inclusief regelvouwing volgens RFC
  6350), normaliseren naar `0470 12 34 56`, en koppelen op naam. Koppelen doet
  exact op de genormaliseerde naam, daarna op gesorteerde naamdelen (vangt
  "Achternaam Voornaam"), en anders niets. **Nooit op een deel van een naam:**
  twee leden die Wout heten, zijn twee leden.
- `apps/logistiek/test/vcard.test.ts`: 15 tests, groen.
- `scripts/import-driver-phones.ts` (`npm run import:gsm`): schrijft standaard
  niets, `--apply` wel, `--overwrite` gaat ook over een bestaand teamnummer.
  Vult `UitleenDriver.phone` (bron `TEAM`, wint al binnen `driverPhones`), nooit
  het gsm-nummer op iemands account.

**Wat de lijst zelf leerde.** Eén contact staat als `0032` plus de nationale nul
(`0032 057…`), wat geen geldig internationaal nummer is; `+3257…` en `057…` zijn
twee verschillende nummers en raden is precies wat een import niet mag doen. Dat
is Sofie Bruggeman. Viktor Meekers staat er met een nummer dat van vorm klopt
maar volgens Logistiek niet van inhoud: de import ziet dat niet, een mens wel.
Samen zijn dat de twee redenen dat dit een nakijklijst is en geen knop.

**Gedraaid op liv, 20 september 2026.** Via de web-container, die `tsx`,
`packages/auth` en `packages/db` bevat en de `DATABASE_URL` al in haar omgeving
heeft (dezelfde weg als `prisma migrate deploy` bij het opstarten):

```
docker cp vcard.ts import-gsm.ts infra-web-1:/app/
docker cp lijst.vcf infra-web-1:/tmp/lijst.vcf
docker exec infra-web-1 npx tsx /app/import-gsm.ts /tmp/lijst.vcf [--apply]
```

Resultaat: 41 chauffeurs in de pool, **30 kregen een nummer**, 1 geweigerd (zie
hieronder), 11 staan niet in de lijst. Niets overschreven: geen enkele chauffeur
had al een nummer van het team. **De gekopieerde bestanden zijn daarna verwijderd**,
zowel uit `/tmp` op de host als uit de container; een lijst met 94 namen en
nummers hoort daar niet te blijven staan.

Lokaal levert het nul koppelingen op: de dev-databank draait op fixtures met
verzonnen namen.

**Het importscherm is er** (`503735c0`). "Nummers uit de gsm-lijst" in
`/beheer/chauffeurs`: je kiest de `.vcf` en krijgt de nakijklijst. Per regel de
chauffeur, wat er nu staat en waar dat vandaan komt, wat de lijst voorstelt, en
een vinkje. Aangevinkt wie nog geen nummer van het team heeft, uit wie er wel
een heeft; daaronder wie een naam kreeg maar geen leesbaar nummer, wie dubbel
staat, en dichtgeklapt de contacten zonder chauffeur plus wie er hierna nog
zonder nummer staat.

**Het bestand komt niet op de server.** Lezen, opkuisen en koppelen gebeuren in
de browser (`lib/vcard.ts` is pure TypeScript), en enkel de aangevinkte regels
gaan mee naar `importDriverPhonesAction`. Een lijst met vierennegentig namen en
nummers hoort niet in een request of een log, en om dezelfde reden ook niet in de
repo. De verdeling over de drie gevallen zit apart in `lib/phone-import.ts` met
zes tests: dat vinkje beslist of een bevestigd nummer overschreven wordt, en dat
zie je achteraf aan niets.

**Nog te doen, en dit is geen code:**

- Het nummer van Sofie Bruggeman met de hand rechtzetten op liv. In het bestand
  staat `0032573712678`: na het landnummer negen cijfers die met een 5 beginnen,
  wat noch een gsm (`4` plus acht) noch een vaste lijn (acht) is. Het is ofwel
  `0473 71 26 78` (een 5 waar een 4 hoorde) ofwel `057 37 12 67` (een cijfer te
  veel achteraan), en dat is niet uit het bestand af te leiden.

### ✅ F4.10. Chauffeurs aan werkgroepen toevoegen
**P2 · code · `503735c0`**

*"Bij posten is het redelijk straight forward: de doorsnede van de post en de
lijst van chauffeurs."*

Precies dat, en voor werkgroepen geldt het ook: die gebruiken dezelfde
`GroupMembership`. Het mechanisme bestaat dus al; wat ontbreekt is het scherm.
In `/beheer/chauffeurs`: per post en werkgroep wie daar chauffeur is, met een knop
om iemand toe te voegen. Zonder dat blijft de keuzelijst uit F4.9 leeg en weet
niemand waarom.

**Gedaan.** "Per post en werkgroep" onderaan `/beheer/chauffeurs`
(`driversPerGroup()` + `group-drivers.tsx`): per post de chauffeurs die erin
zitten, en achter een uitklapper de andere leden met een knop per naam. Posten en
werkgroepen staan apart, enkel actieve groepen met leden dit werkingsjaar komen
erin, en bovenaan staat het getal dat de reden van het scherm is: bij hoeveel
posten er vandaag niemand in de chauffeurslijst staat. Zo'n post krijgt in plaats
van een naamrij de zin dat ze zelf geen chauffeur kan aanduiden op een rit die je
doorgeeft.

**Eén lijst, geen lijst per post.** De knop zet iemand in dezelfde pool als de
picker bovenaan, en hij is daarna overal kiesbaar; dat staat er ook zo bij, want
een knop onder een postnaam belooft anders iets kleiners dan ze doet. De vier
controles van `addDriverAction` (bestaat, actief, niet al in de post, niet al
chauffeur) zitten nu in één `createDriverRow` die beide wegen gebruiken, in
plaats van een tweede kopie die er na de eerste wijziging naast loopt.

---

# Fase 5: beschikbaarheid

### ✅ F4.2. Een dag loopt van 5u tot 5u
**P1 · code**

*"Zodat mensen gemakkelijker 's nachts aanduiden."* Zaterdagnacht 02:00 hoort bij
zaterdag, niet bij zondag.

**Gedaan.** `DAG_START_UUR = 5` staat in `lib/availability-day.ts`, en
`availabilityDayBounds` is de enige plek waar een dagrand berekend wordt. Vakje 0
ligt op 05:00 en vakje 23 op 04:00 de ochtend erna; op een breed scherm loopt de
kolom van zaterdag door tot zondagochtend 05:00 (`placeForDay` kreeg een
`dayStartMinutes`, de `TimeGrid` een `dayStartHour`). Eén sleep van 22:00 tot
02:00 is nu één venster in plaats van twee, en dat is nagekeken: op het brede
scherm gaf één sleep één rij in de databank, op de telefoon gaf één veeg over de
vakjes 17 tot 20 hetzelfde.

**De band in de planning verschuift bewust niet mee.** De opgeslagen vensters
zijn gewone tijdstippen; enkel het intekenen kent een dag als eenheid. Een rit om
02:00 hoort in de planning op de datum waarop hij rijdt, en een band die daar vijf
uur naast de ritten erboven ligt, is een tweede soort dag op hetzelfde scherm.

**Het risico lag bij `clipOutsideDay`, en dat is uitgetest.** Een venster van
zaterdag 22:00 tot zondag 02:00 overleeft het herschrijven van zondag; een venster
dat écht over de nieuwe rand loopt (03:00 tot 07:00) blijft aan de kant van de
buurdag staan wanneer je de andere dag herschrijft. Beide gevallen staan nu in
`test/availability-day.test.ts` en `test/week-lanes.test.ts` (samen 393 tests,
was 379), en ze zijn ook end-to-end nagespeeld tegen de databank.

**De nachtknop is weg.** Van 00:00 tot 06:00 stond ingeklapt omdat er zelden
iemand rijdt, maar dat is precies wat deze mensen wél doen: na het opschuiven van
de dagrand zou die knop net de uren verbergen waarvoor de vraag gesteld werd. Het
raster toont nu alle vierentwintig rijen (op 390px: 24 rijen van ~24px, het
scherm loopt niet over) met een streepje op de middernachtgrens.

### ✅ F4.5. Eén algemene nota bij je beschikbaarheid
**P2 · code · 🗄️**

Er bestaat al een nota per venster (`UitleenDriverAvailability.note`); Logistiek
wil er één in het algemeen, "ni per individueel stukje".

**Gedaan.** Nieuw model `UitleenDriverAvailabilityNote` (chauffeur, maandag,
tekst), één rij per chauffeur per week. Het veld staat bovenaan allebei de
intekenschermen: een tekstvak op een computer, één regel boven het raster op een
telefoon, met dezelfde component erachter (`availability-note.tsx`).

🗄️ Een nieuwe tabel, dus nul rijen voor wat er al staat, en dat klopt: een nota
die niemand schreef, bestaat niet. De nota's per venster blijven staan waar ze
staan. Dit raakt geen enkele rit, dus `rit-kolommen.test.ts` heeft er niets over
te zeggen.

**Opslaan gebeurt bij het verlaten van het veld en niet met een knop**, zoals de
rest van dit scherm (je veeg is de opdracht). Maar wél zichtbaar: er staat
"Opslaan..." en daarna even "Bewaard". Een veeg zie je gebeuren, tekst niet, en
een veld waarvan je nooit weet of het aankwam is precies het soort stil verlies
waar deze nota tegen moet beschermen. Leeg maken wist de nota; een lege nota en
geen nota zijn hetzelfde.

**Het team leest ze onder de strook "Wie kan er rijden", niet in de naamkolom
ernaast.** Die kolom is 144px breed en draagt al een naam plus een urentelling;
"die week examens" wordt daar afgekapt tot ze niets meer zegt. Belangrijker: wie
een nota schreef maar niets aanduidde, heeft daar helemaal geen rij, en precies
díé nota is degene die het team moet lezen. Bestrijkt de weergave meer dan één
week (de maandweergave), dan staat het weeknummer erbij.

---

# Fase 6: ritten bewerken en noteren

### ✅ F4.4. De post van een rit is nog te wijzigen na aanmaak
**P2 · code**

`adminEditTransportAction` raakte `groupId`, `requesterType` en `requesterName`
niet aan; die lagen vast bij het aanmaken.

**Gedaan.** Het paneel naast de kalender heeft nu dezelfde keuzelijst als het
intekenformulier ("Logistiek zelf", de posten en werkgroepen, "Andere..." met een
vrij naamveld), en de wijziging komt als regel in de historiek van de rit: "Voor
wie: Logistiek → Sport". Staat de rit op een post die intussen op non-actief
staat, dan zet het formulier die er zelf bij; anders zou de lijst stilstaan op
"Logistiek zelf" en verhuisde één klik op opslaan de rit weg van een post die
niemand koos.

**Slepen in de kalender raakt het niet.** Dat gebaar stuurt de post niet mee, en
de actie wijzigt ze enkel wanneer ze die expliciet krijgt. Nagekeken: een rit
verschuiven laat `groupId` staan en schrijft enkel de urenregel.

**Twee grenzen.** Een rit wordt hier niet extern: `EXTERN` is de enige waarde
waar `chargesRequester` op afgaat, en prijs plus betaalstatus laten ontstaan met
een keuzelijst maakt van een geldbeslissing een tikfout. De lijst toont "Externe"
enkel bij een rit die het al is, en de actie weigert het ook wanneer de client
omzeild wordt (nagekeken met een gesmokkelde optie). En een externe rit met een
betaling (`UitleenPayment` of `paidOfflineAt`) verhuist niet naar een post, want
daar verdwijnen prijs en betaalstatus van het scherm.

**De prijs verhuist niet mee.** `pricingMode` en `rateCents` zijn snapshots en
worden nooit herrekend (zie `docs/uitleendienst.md`), dus een rit die als extern
is aangemaakt en naar een post verhuist, houdt haar tarief. Het formulier zegt
dat op het moment dat het erop aankomt, in plaats van het stil te doen.

### ✅ F4.20. Eigen nota's, met zichtbaarheid
**P3 · code · 🗄️ · 📝**

*"Optie tot eigen nota toevoegen aan komende ritten en aan ritten van mijn post.
Miss optie tot zichtbaar voor mij alleen, zichtbaar voor mijn post, zichtbaar
voor mijn post en logi."*

**Gedaan.** Nieuw model `UitleenTransportNote` (rit, auteur, tekst,
zichtbaarheid). Het blok staat op elke ritkaart van `/ritten` én in het paneel
van de planning, uit één component (`components/trip-notes.tsx`). De drie keuzes
staan alle drie in beeld met een regel wat ze betekenen, niet in een keuzelijst.
Standaard staat de meest gedeelde aan (post én Logistiek): een nota bij een rit
is meestal iets dat de anderen moeten weten.

🗄️ Een nieuwe tabel, dus nul rijen voor bestaande ritten. Gevraagd en beslist:
`memberNote` en `adminNote` blijven staan waar ze staan in plaats van hierheen
gekopieerd te worden, want `adminNote` hangt aan de mail naar de aanvrager en een
tekst die op twee plaatsen staat, loopt bij de eerste wijziging uiteen. Het model
staat in `RIT_MODELLEN` in `test/rit-kolommen.test.ts`.

📝 **`PRIVE` betekent letterlijk privé, ook voor Logistiek**, en die belofte
staat in de query en niet in het scherm: `tripNotesFor` haalt andermans
privénota niet uit de databank, ook niet met `logistiek.manage` en ook niet voor
een superadmin. Nagekeken in beide richtingen: een privénota van de aanvrager
staat niet in de HTML van de planning, en een privénota van de superadmin staat
niet in die van het teamlid. `canReadTripNote` is dezelfde regel als pure
functie, om de knoppen mee te tekenen.

**De chauffeur telt mee bij "wie hoort bij deze rit".** `onTripForNotes` is
ruimer dan `ownsTransportBooking`: die gaat over wie de rit mag wijzigen, deze
over wie erbij hoort. Wijzigen en wissen doet enkel de auteur, ook een beheerder
niet.

---

# Fase 7: voertuigen

### ⬜ F4.21. Een icoon per voertuig
**P3 · code · 🗄️**

*"Kunnen we een auto icoontje voor de auto fixen? Mogelijks aanpasbaar in
instellingen → voertuigen en tarieven."*

`UitleenVehicle` heeft al `pattern` (de arcering) maar geen icoon. Kolom `icon`
erbij, te kiezen uit de bestaande `LogisticsIcon`-set. Bestaande voertuigen
krijgen `null` en vallen terug op wat er nu getekend wordt.

### ⬜ F4.22. Klaar voor een gehuurd busje
**P3 · uitzoeken**

*"Soms gaan we een dockx busje moeten huren (bv gala, jobfair). Kunnen we ons
daar nu al op voorbereiden dat er dan geen problemen zijn?"*

Technisch staat er niets in de weg: voertuig toevoegen, `needsVanDriver` en het
tarief zetten, plannen. Na te kijken:

- De planning met vier voertuigen naast elkaar, ook op 390px.
- Achteraf op inactief zetten zonder dat gereden ritten of hun prijzen
  veranderen. `rateCents` is een snapshot, dus dat hoort te kloppen; bevestigen.
- Dat het niet het hele jaar in het aanvraagformulier blijft staan. Vraagt
  mogelijk een "beschikbaar van/tot" per voertuig; pas beslissen als de rest
  werkt.

---

# Fase 8: statistiek

### ⬜ F4.23. Uren per chauffeur per uur van de dag
**P3 · code**

*"x-as: de uren van de dag, y-as: balkje met elke chauffeur hoe vaak (hoe veel
uren) die dan al gereden heeft, ev x-as per 2 of 4 uur samenzetten."*

`lib/uitleen-stats.ts` heeft al een heatmap per weekdag en uur en een `perDriver`
met uren. Wat erbij komt is de kruising, uit dezelfde ene query en dezelfde
kwartier-sampling (een rit van 14:15 tot 15:45 telt correct half om 14u).
Gestapelde balk per uur met een segment per chauffeur, samen te nemen per 1, 2 of
4 uur.

---

# Bewust niet gedaan

### ⛔ F4.11. Wanneer werkt de Google-agenda bij?
**geen code**

*"Wanneer update de google agenda feature nadat ik een chauffeur heb toegewezen?
Het kan langer dan drie uur duren heb ik gemerkt."*

Wij zetten `REFRESH-INTERVAL:PT6H` en `X-PUBLISHED-TTL:PT6H` in de feed
(`lib/calendar/ics.ts`), maar **Google negeert die** en poolt een geabonneerde
agenda op eigen tempo: in de praktijk om de 8 tot 24 uur, soms langer. Apple en
Outlook houden zich er wel aan. Er is geen manier om Google van onze kant te
laten verversen.

Wat er naast kon: een mail naar de chauffeur zodra je hem toewijst, met een
`.ics`-bijlage. Logistiek wilde dat niet (D4).
