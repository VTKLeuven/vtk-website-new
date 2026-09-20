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
| 1 | De post ziet en regelt haar eigen ritten | F4.18, F4.19, F4.9, F4.8a, F4.8b, F4.12, F4.17 | ⬜ open |
| 2 | Leesbaarheid van de planning | F4.16, F4.1, F4.13, F4.15 | ⬜ open |
| 3 | Breedte en gsm | F4.6, F4.7, F4.14 | ⬜ open |
| 4 | Chauffeursnummers en werkgroepen | F4.3, F4.10 | 🟡 parser en script klaar |
| 5 | Beschikbaarheid | F4.2, F4.5 | ⬜ open |
| 6 | Ritten bewerken en noteren | F4.4, F4.20 | ⬜ open |
| 7 | Voertuigen | F4.21, F4.22 | ⬜ open |
| 8 | Statistiek | F4.23 | ⬜ open |
| - | Bewust niet gedaan | F4.11 | ⛔ |

Fase 1 eerst: daar zit het enige echte defect van deze ronde, en het draagt zeven
van de drieëntwintig punten.

---

# Fase 1: de post ziet en regelt haar eigen ritten

### ⬜ F4.18. Een goedgekeurde rit van je post staat niet onder "Mijn ritten"
**P1 · code**

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

**Fix.** `driverId: { not: null }` weg. De sectie heet "wat je medeleden rijden
én wat er nog een chauffeur mist"; die tweede helft werkte enkel via
`assignedGroupId`.

### ⬜ F4.19. Een rit die je zelf rijdt, verdwijnt bij je post
**P1 · code · 📝**

Zelfde functie, de regel eronder:

```ts
return trips.filter((trip) => trip.driverId !== userId);
```

Kies je jezelf als chauffeur, dan verhuist de rit van "Ritten van mijn post" naar
"Komende ritten". Logistiek wil hem in **beide** lijsten (D3).

**Fix.** De filter weg. Dan staat dezelfde rit twee keer op `/ritten`, en dat is
de bedoeling, maar de kaart in de postlijst moet dan wel zeggen dat jij het bent;
anders leest het als een dubbel. 📝 Eén bullet in `docs/design-decisions.md`: de
twee lijsten beantwoorden twee vragen ("wat moet ik doen" en "wat staat er bij
ons open"), en een rit kan in allebei thuishoren.

### ⬜ F4.9. Enkel chauffeurs van die post zijn kiesbaar
**P2 · code**

`groupMemberOptions` geeft élk lid van de post terug, dus een post kan iemand
zonder rijbewijs op een autorit zetten. Logistiek wil de doorsnede: leden van de
post die ook in de chauffeurspool zitten.

**Fix.** De pool is `logistiekTeamMembers()` plus de rijen in `UitleenDriver`,
zoals `driverOptions` hem samenstelt. Snijd daarmee.

**Let op de lege lijst.** Een post zonder chauffeurs krijgt zo een keuzelijst
zonder opties. Die moet zeggen wat er ontbreekt en naar wie ("niemand van jullie
staat in de chauffeurslijst; mail logistiek@vtk.be"), niet leeg blijven staan.
Dat is meteen de reden dat F4.10 in dezelfde ronde zit.

### ⬜ F4.8a. Een postlid voegt een bijrijder toe vanuit "Ritten van mijn post"
**P2 · code**

De serverkant kan het al: `addTripHelperAction` laat een collega van dezelfde
post toe, en `TripHelpers` is een bestaande component. Op `/ritten` worden de
bijrijders enkel **getoond**.

**Fix.** `<TripHelpers canEdit>` in de kaart van een postrit.

**Eén uitbreiding nodig.** `vanBookingForMember` matcht op `groupId` (de post die
de rit vroeg), niet op `assignedGroupId` (de post die hem rijdt). Zonder die tak
kan een post geen bijrijder zetten op een rit die ze doorgegeven kreeg van een
andere post, terwijl die rit wel in haar lijst staat.

### ⬜ F4.8b. Geen mail meer naar de verantwoordelijken, tenzij je dat instelt
**P2 · code · 📝**

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

**De melding ná het doorgeven moet meelopen.** Die zegt nu "de verantwoordelijken
krijgen een mail om een chauffeur aan te duiden". Staat de instelling op niemand,
dan belooft dat scherm iets wat niet gebeurt. 📝 Kort in `design-decisions.md`:
waarom de standaard "niemand" is (de postlijst op `/ritten` is de melding
geworden).

### ⬜ F4.12. "Post vult zelf in" heet voortaan "Post kiest zelf de chauffeur"
**P2 · code**

Logistiek vroeg letterlijk wat het veld betekent. Het zet `assignedGroupId`, en
dat is exact "deze post duidt zelf de chauffeur aan".

Twee plekken: `app/beheer/vervoer/week/new-trip-form.tsx:268` en
`app/beheer/vervoer/transport-controls.tsx:128`.

### ⬜ F4.17. De aanvragende post staat meteen voorgesteld
**P2 · code**

Maak je een autorit voor Sport, dan mag Sport meteen in "Post kiest zelf de
chauffeur" staan. Een voorstel en geen dwang: het veld blijft leeg te zetten,
anders krijgt elke rit die Logistiek zelf rijdt er stil een post op.

In `new-trip-form.tsx`: zet `assignedGroupId` mee wanneer de gebruiker een post
kiest bij "voor wie", zolang de gebruiker het veld zelf nog niet aanraakte, en
enkel voor een voertuig zonder `needsVanDriver` (de kar vraagt een goedgekeurde
karchauffeur; dat blijft een keuze van Logistiek).

---

# Fase 2: leesbaarheid van de planning

### ⬜ F4.16. De legende klopt niet, en "aangevraagd" is niet te herkennen
**P1 · code · 📝**

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

**Fix.** Geef "aangevraagd" een markering die géén arcering is, zodat ze naast
elk voertuigpatroon leesbaar blijft, en schrijf de legende naar wat er echt
staat. 📝 In `design-decisions.md`: de vulkleur is de chauffeur, de arcering is
het voertuig, en de status mag dus geen derde patroon zijn.

### ⬜ F4.1. Filteren op post
**P2 · code**

Met veel chauffeurs wordt de planning onoverzichtelijk; Logistiek wil "alle
ritten van Acti" kunnen zien. Er is al een filter op voertuig, chauffeur, status
en aanvragertype.

Nieuwe sleutel `post` in `lib/transport-filters.ts`, die matcht op `groupId`
**én** `assignedGroupId`. Vergeet `FILTER_QUERY_KEYS` niet: een filter die daar
niet in staat, is niet meer uit te zetten (dat was F4-ronde-4's R8). Zowel in het
beheer als op de publieke bezetting, want het punt zegt expliciet "zowel beheer
als algemeen".

### ⬜ F4.13. Het nummer van de chauffeur in de post- en werkgroepweergave
**P2 · code**

`driverPhones()` levert nummer plus bron al; `app/vervoer/bezetting/trip-card.tsx`
toont enkel `driverName`. Nummer erbij met `PhoneLink`, zodat bellen één tik is.

### ⬜ F4.15. De ritten van je eigen post vallen op
**P2 · code**

Kijkt iemand van Sport naar de planning, dan mogen alle ritten voor Sport (door
Logistiek én door henzelf) eruit springen.

**Let op de bestaande randtaal.** Rood vol = conflict, grijs gestreept = nog geen
chauffeur. Een derde randkleur erbij maakt er ruis van; gebruik de gele accentrail
(`box-shadow: inset 3px 0 0 var(--yellow)`), net zoals een uitgelichte kaart op
vtk.be.

---

# Fase 3: breedte en gsm

### ⬜ F4.6. De app gebruikt de volle breedte
**P1 · code · 📝**

*"Die zijkanten mogen opgevuld worden, zodat ik niet hoef in te zoomen."*

`--max: 1240px` uit `apps/logistiek/app/globals.css`; de bestaande
`clamp(20px, 3vw, 36px)` blijft de zijmarge. Geldt voor de hele app (D1).

**Nadien nakijken:** de beheertabellen met vaste `minmax()`-kolommen (die rekken
nu mee en mogen niet uit elkaar vallen) en de leesbreedte van lange formulieren.
📝 In `design-decisions.md` plus een uitzondering in `CLAUDE.md`, want daar staat
1240px als regel voor alle VTK-oppervlakken.

### ⬜ F4.7. "Vandaag" springt niet naar vandaag
**P1 · code**

In de dagweergave op gsm zet de knop wel de juiste week, maar niet de juiste dag.
`mobile-calendar.tsx` zet `index` één keer bij het monteren:

```ts
const [index, setIndex] = useState(() => { … });
```

`onToday` wisselt de week in de ouder; `index` blijft staan. **Fix.** Spring
lokaal naar vandaag wanneer die in het venster zit, en laat een effect `index`
verzetten wanneer `days` verandert en vandaag erbij zit.

### ⬜ F4.14. "Mijn ritten" is geen gsm-scherm
**P1 · code**

De kaarten in `app/ritten/page.tsx` hebben enkel `sm:`-breekpunten; daaronder
staat alles onder elkaar zonder ritme. Op 390px nakijken, samen met de bijrijders
uit F4.8a die er nog bij komen.

---

# Fase 4: chauffeursnummers en werkgroepen

### 🟡 F4.3. De nummers komen uit de gedeelde gsm-lijst
**P2 · code**

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

**Nog te doen:**

- Draaien op productie. Lokaal levert het nul koppelingen op, want de
  dev-databank draait op fixtures met verzonnen namen; de echte koppelgraad is
  enkel tegen dev of liv te meten.
- Een importscherm in `/beheer/chauffeurs`, zodat de lijst elk jaar opnieuw te
  gebruiken is zonder shell. Per rij: de chauffeur, wat er nu staat en waar dat
  vandaan komt, wat de lijst voorstelt, en een vinkje. Standaard aangevinkt
  wanneer er nog niets staat, standaard uit wanneer het team er zelf al iets
  zette. Onderaan de contacten zonder koppeling.

**Het bestand blijft buiten de repo**, om dezelfde reden als de fixtures: het zijn
namen met gsm-nummers. Het scherm leest de tekst in het geheugen en bewaart ze
niet.

### ⬜ F4.10. Chauffeurs aan werkgroepen toevoegen
**P2 · code**

*"Bij posten is het redelijk straight forward: de doorsnede van de post en de
lijst van chauffeurs."*

Precies dat, en voor werkgroepen geldt het ook: die gebruiken dezelfde
`GroupMembership`. Het mechanisme bestaat dus al; wat ontbreekt is het scherm.
In `/beheer/chauffeurs`: per post en werkgroep wie daar chauffeur is, met een knop
om iemand toe te voegen. Zonder dat blijft de keuzelijst uit F4.9 leeg en weet
niemand waarom.

---

# Fase 5: beschikbaarheid

### ⬜ F4.2. Een dag loopt van 5u tot 5u
**P1 · code**

*"Zodat mensen gemakkelijker 's nachts aanduiden."* Zaterdagnacht 02:00 hoort bij
zaterdag, niet bij zondag.

`lib/availability-day.ts` rekent in uren 0 tot 23 vanaf `startOfBrusselsDay`. Eén
constante `DAG_START_UUR = 5` erbij, waarna vakje 0 om 05:00 ligt en vakje 23 om
04:00 de volgende ochtend. Raakt het intekenraster, `availability-paint.tsx` en
de beschikbaarheidsband in de planning.

**Dit is het enige stuk van deze ronde waar stil iets fout kan gaan.**
`clipOutsideDay` knipt vensters op de dagrand; verschuift die rand zonder dat de
opgeslagen vensters meeschuiven, dan veegt het herschrijven van één dag de
buurdag weg. `test/availability-day.test.ts` moet mee.

### ⬜ F4.5. Eén algemene nota bij je beschikbaarheid
**P2 · code**

Er bestaat al een nota per venster (`UitleenDriverAvailability.note`); Logistiek
wil er één in het algemeen, "ni per individueel stukje". Eén vrij veld per
chauffeur per week, bovenaan het intekenscherm, dat het team in de
beschikbaarheidsband terugziet.

---

# Fase 6: ritten bewerken en noteren

### ⬜ F4.4. De post van een rit is nog te wijzigen na aanmaak
**P2 · code**

`adminEditTransportAction` raakt `groupId`, `requesterType` en `requesterName`
niet aan; die liggen vast bij het aanmaken. Veld "Voor wie" erbij, met een regel
in de historiek.

**De prijs verhuist niet mee.** `pricingMode` en `rateCents` zijn snapshots en
worden nooit herrekend (zie `docs/uitleendienst.md`), dus een rit die als extern
is aangemaakt en naar een post verhuist, houdt haar tarief. Het scherm moet dat
zeggen in plaats van het stil te doen.

### ⬜ F4.20. Eigen nota's, met zichtbaarheid
**P3 · code · 🗄️ · 📝**

*"Optie tot eigen nota toevoegen aan komende ritten en aan ritten van mijn post.
Miss optie tot zichtbaar voor mij alleen, zichtbaar voor mijn post, zichtbaar
voor mijn post en logi."*

Nieuw model `UitleenTransportNote`: rit, auteur, tekst, zichtbaarheid
(`PRIVE` / `POST` / `POST_EN_LOGISTIEK`).

🗄️ Bestaande ritten krijgen nul rijen in die tabel, dus geen backfill. Het model
moet wel in `RIT_MODELLEN` in `apps/logistiek/test/rit-kolommen.test.ts`: die
test faalt op elk nieuw `UitleenTransport*`-model, en dat is de bedoeling.

📝 `PRIVE` betekent letterlijk privé, ook voor Logistiek. Dat hoort in
`design-decisions.md` én in het formulier zelf te staan, want een nota waarvan je
denkt dat het team ze leest, is erger dan geen nota.

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
