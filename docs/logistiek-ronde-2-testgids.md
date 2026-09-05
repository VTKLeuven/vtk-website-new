# Testgids: feedbackronde 2 van Logistiek

Wat er gebouwd is naar aanleiding van `docs/logistiek-feedback-ronde-2.md`, waar je
het ziet, en hoe je het uitprobeert. Alle 43 taken van de zes fases zijn af.

Achtergrond bij de keuzes: `docs/design-decisions.md` (§ Uitleendienst).
Technische kaart van de module: `docs/uitleendienst.md`.

## Eerst dit

```bash
make up                              # databank en MinIO
npm run migrate:deploy -w @vtk/db    # zes nieuwe migraties, zie onderaan
npm run db:generate                  # Prisma-client bijwerken
npm run dev -w @vtk/logistiek        # http://localhost:3100
```

**Herstart de dev-server na `db:generate`.** De draaiende server houdt de oude
Prisma-client in het geheugen; je krijgt anders "Unknown argument" op precies de
nieuwe velden. Dat kost je een kwartier zoeken naar een bug die er niet is.

Inloggen doe je op `/test-login`. Zet daarvoor lokaal `LOGISTIEK_TEST_LOGIN=open`
in je `.env`: met `true` moet je eerst een echte sessie hebben die logistiek mag
beheren, en die is er op een laptop zonder draaiende hoofdsite niet. Speel je een
profiel, dan staat er bovenaan elke pagina een gele balk die zegt als wie je
kijkt, met de knop om terug te keren. De personas die je nodig hebt:

| Persona | Wat het is | Waarvoor je hem nodig hebt |
| --- | --- | --- |
| **Alice** (test logistiek) | post Logistiek, `logistiek.manage` | alles onder `/beheer` |
| **Carol** (test post) | gewoon praesidiumlid, post Sport | de kant van de aanvrager |
| **Frank** (test post + werkgroep) | post Cultuur én werkgroep Revue | kiezen namens wie je aanvraagt |
| **Eve** (test student) | geen enkele groep | de externe aanvrager |

---

## 1. De aanvrager: `/materiaal`, `/flesserke`, `/vervoer`

| Gevraagd | Waar | Hoe testen |
| --- | --- | --- |
| **R7** Verplichte velden markeren en zeggen wat ontbreekt | alle drie de aanvraagformulieren | Klik meteen op "Rit aanvragen" zonder iets in te vullen. De knop is niet langer uitgeschakeld: je krijgt "Vul in wanneer de rit begint", het scherm springt naar dat veld en het krijgt een rode rand. Verplichte labels dragen een rood sterretje. |
| **T12** Niet per ongeluk twee voertuigen kiezen | `/vervoer` | Klik Kar aan, dan Bakfiets. Elke gekozen pil krijgt een vinkje, en eronder staat "2 voertuigen geselecteerd: Kar, Bakfiets". Meerdere kiezen blijft met opzet mogelijk. |
| **T13** Meerdere adressen in kopie | `/vervoer` en `/materiaal`, veld "Extra adres dat op de hoogte blijft" | Vul `a@vtk.be, b@vtk.be` in. Eén verkeerd adres weigert de hele lijst met een leesbare melding; half verzenden zou erger zijn. |
| **M4** Sjabloon duidelijk toegepast, en weer weg | `/materiaal`, blok "Snel starten" | Kies een sjabloon. Je krijgt "X is toegevoegd. Jouw aanvraag bevat nu N items." met daarnaast **Toch niet**, dat exact weghaalt wat het sjabloon toevoegde en de rest van je selectie laat staan. |
| **M5** Iedereen mag een sjabloon maken | `/materiaal`, onderaan dezelfde keuzelijst | Kies wat materiaal, open de keuzelijst en neem de laatste optie "+ Nieuw sjabloon maken van mijn selectie". Geef het een naam en bewaar. Test als **Carol**, niet als Alice: het punt is dat een gewoon postlid dit kan. Een dubbele naam wordt geweigerd. |
| **M7** Lijstweergave voor de catalogus | `/materiaal`, knoppen "Kaarten / Lijst" boven de catalogus | Zet op Lijst: één rij per item zonder foto, met dezelfde plus- en minknoppen. Herlaad de pagina; de keuze blijft staan (per browser). |
| **F1** Overzicht van je flesserke-selectie | `/flesserke`, kader "Jouw aanvraag" | Zet twee items op 1. Ze verschijnen bij naam in het kader, niet enkel als aantal. |
| **N3** Eigen evenementen bovenaan | `/materiaal` en `/vervoer`, blok "Hoort dit bij een evenement?" | De lijst scrollt nu in plaats van na acht items te stoppen. Evenementen van je eigen post staan bovenaan onder "Van jouw post of werkgroep". |
| **E3** Externen zien geen evenementen of sjablonen | `/materiaal` als **Eve** | Het blok "Hoort dit bij een evenement?" en de sjabloonkiezer zijn weg. Ze zitten ook niet in de HTML van de pagina: de server haalt ze niet op. |

## 2. De aanvrager: `/reservaties` en de detailpagina's

| Gevraagd | Waar | Hoe testen |
| --- | --- | --- |
| **R1** Evenementnaam bij een rit | `/reservaties`, sectie Transport | De koptekst van een rit is de naam van het evenement; voertuig en doel staan eronder als tag. |
| **R2** Afgelopen reservaties inklappen | `/reservaties`, elke sectie | Wat voorbij is, zit achter "Afgelopen (n)", standaard dicht. **Let op de uitzondering:** materiaal dat je afhaalde maar nog niet terugbracht, blijft altijd bovenaan staan, ook als de terugbrengdag gepasseerd is. Dat is precies de aanvraag die actie vraagt. |
| **R4** Geen bedragen voor posten en werkgroepen | `/reservaties` en de detailpagina | Als **Carol** zie je nergens prijs, waarborg, betaalstatus of betaalknop. Als **Eve** (extern) zie je ze wel. Ze zijn verborgen, niet op "€ 0,00" gezet. |
| **R5** Zien dat Logistiek iets wijzigde | `/reservaties` | Laat Alice iets aan een aanvraag van Carol veranderen (bv. een lijn niet toekennen). Bij Carol staat er een geel **Gewijzigd** naast de status. Open de aanvraag; het merkteken is weg. |
| **R8** Weten waar je levering blijft | `/reservaties`, aanvraag met levering | Er staat "Levering gevraagd; Logistiek plant de rit in", en zodra het team de rit aanmaakt "Levering gepland" met een link. *Anders opgelost dan gevraagd: een lid vraagt zelf nooit een leveringsrit aan, dus de gevraagde waarschuwing zou tot dubbele ritten leiden.* |
| **E7** Afgewezen materiaal blijft zichtbaar | `/reservaties/<id>` | Onder "Niet toegekend" staat het doorstreept, met de reden van Logistiek erbij. |
| **M2** Bewerken na goedkeuring | `/reservaties/<id>` van een goedgekeurde aanvraag | Er staat een gele waarschuwing vóór je klikt: aanpassen betekent opnieuw laten goedkeuren. Doe je het, dan gaat de aanvraag terug naar "Aangevraagd", de betaalwijze wordt gewist en het team ziet het in de historiek. Kan niet meer zodra er betaald of afgehaald is. |
| **T5** Rit aanpassen na goedkeuring | `/vervoer/<id>` | Knop "Rit aanpassen": uren, doel, laadadres en bestemming. Voertuig en chauffeur blijven van het team, want die hangen aan de weekplanning. |
| **N5 + E1** Je eigen evenement zien en beheren | `/evenementen` (nieuw in de navigatie) | Als **Carol**: alle evenementen van je post, met per evenement wat er al aangevraagd is. Klik door: alles wat eronder hangt met status, en je kan zelf locatie, begin, einde en verwachte opkomst aanpassen. De naam niet: daar hangen de aanvragen aan. |
| **E5** Materiaal dat niet van Logistiek komt | `/evenementen/<id>`, blok "Materiaal van elders" | Noteer "4× bierbak, Theokot". Puur informatief, geen voorraad, en het staat mee op het afdrukblad van dat evenement. |

## 3. Het beheer: `/beheer`

| Gevraagd | Waar | Hoe testen |
| --- | --- | --- |
| **N1** Navigatie herindelen | linkerkolom in `/beheer` | Overzicht, Evenementen, Aanvragen, Ritten, Flesserke, Kalender, Transportplanning los; de rest onder "Overig". |
| **R3 + M8** Zien wat voor aanvraag het is | `/beheer/aanvragen` | Elke regel draagt "Materiaal", "Flesserke" of beide, plus een pill "Evenement" wanneer ze onder een koepel hangt. De naam van het evenement staat er enkel bij als die verschilt van de titel; anders was het twee keer hetzelfde. |
| **R2** Afgelopen aanvragen inklappen | `/beheer/aanvragen` | "Afgelopen" is dicht. "Te beslissen" en "Lopend" blijven altijd open, ook bij een verlopen datum: dat is werk dat nog moet gebeuren. |
| **N4** Vijf aanvragen tegelijk afvinken | `/beheer/aanvragen`, sectie Lopend | Vink er een paar aan, "Markeer als afgehaald". Bevestiging zegt om hoeveel het gaat. **Aanvragen met flesserke gaan bewust niet mee in een bulk-terugbrenging**, want dan zou alles als verbruikt afgeboekt worden; ze worden apart gemeld. |
| **M1 + M3** Per lijn beslissen, met een teamnota | `/beheer/aanvragen/<id>` | Bij elk item: "Niet toekennen" en een veld "Logi:". Zet er één op niet toekennen met een reden, keur dan goed. De rest gaat door, het geweigerde item blijft doorstreept staan, de klaarzetlijst telt het niet mee en het staat niet op het printblad. Alles weigeren en dan goedkeuren wordt geweigerd: dan hoor je af te wijzen. |
| **R6** Historiek inklappen | `/beheer/aanvragen/<id>` en `/beheer/vervoer` | "Historiek (n)" staat dicht, met het aantal ernaast. |
| **N2** Terug naar het evenement | `/beheer/aanvragen/<id>` | Naast "← Aanvragen" staat "← <naam evenement>", die naar de juiste kaart in de lijst springt. |
| **F2** Begrijpelijke tekst bij terugdraaien | `/beheer/aanvragen/<id>` van een teruggebrachte aanvraag | "Terugbrengen terugdraaien" legt nu in gewone taal uit wat er met de flesserke gebeurt en vraagt de voorraad na te tellen. |
| **T1** "Transport" in plaats van "vervoer" | overal | Navigatie, titels, kalenderlegende, meldingen. Routes (`/vervoer`) blijven ongewijzigd: die hernoemen breekt bestaande links. |
| **T3 + T4** Ritten compact | `/beheer/vervoer` | "Te beslissen" is nu even compact als "Goedgekeurd", met het evenement op de dichtgeklapte rij en zonder bedragen. |
| **T6** Sneller bij de bezetting | `/beheer/vervoer`, rechtsboven | Twee knoppen: Transportplanning en Bezettingsoverzicht. |
| **T2** Heen en terug apart beslissen | `/beheer/vervoer`, goedkeurformulier van een heen-en-terugaanvraag | Vink "Enkel deze rit beslissen" aan. Standaard uit, met de waarschuwing dat de aanvrager anders zonder terugrit valt. |
| **T9 + T10** Ritten per chauffeur | `/beheer/chauffeurs` | "2 ritten gereden" is klikbaar en opent alle ritten van die chauffeur, met een **Nacht**-badge bij ritten die na 22:00 eindigen; bovenaan staat hoeveel dat er zijn. De lijst is te sorteren op naam, aantal ritten of wie met de kar rijdt. |
| **T13** Bakfiets zonder chauffeur | `/beheer/instellingen`, voertuig bewerken | Vinkje "Logistiek rijdt dit voertuig" (uit voor de bakfiets). Zo'n rit staat niet meer geel gemarkeerd als onafgewerkt en vraagt geen chauffeur. |
| **F3** Materiaal of flesserke in de kalender | `/beheer/kalender` | Bolletje en label per regel, met een legende erboven. Niet toegekend materiaal staat er niet meer bij. |
| **E2** Evenement met einde, uur optioneel | `/beheer/evenementen` | Startdag en startuur staan apart; het uur mag leeg. Er is een einddag en einduur. Sorteren op datum, naam of post. |
| **E4** Eén blad met alles | `/beheer/evenementen`, knop "Materiaallijst" | Liggend A4 met logi-materiaal (plaats, nota's, vinkvakjes), materiaal van elders, flesserke, de Collect&Go-bestelling en de ritten. |
| **E5** Collect&Go aan een evenement hangen | `/beheer/collectengo/<id>`, rechtsboven | "Aan een evenement koppelen". De boodschappen staan daarna op de materiaallijst van dat evenement, en de bestelling verschijnt als vierde blok op de evenementkaart in `/beheer/evenementen`. |
| **M6** Thumbnail bijsnijden | `/beheer/materiaal`, item met foto bewerken | Onder de thumbnail staat "Bijsnijden": sleep en zoom tot het juiste stuk in het 4:3-kader staat. De originele foto blijft in de galerij; het bijgesneden beeld wordt een nieuwe thumbnail. **Dit is het enige punt dat ik niet heb kunnen doorklikken** (de browserautomatisering bleef hangen op dat scherm), dus kijk hier zeker zelf naar. |

## 4. De transportplanning: `/beheer/vervoer/week`

**T7** vroeg de Litus-lay-out, en dit is het grootste stuk van de ronde.

- De week is **één kalender**: zeven dagkolommen naast elkaar, de uren verticaal,
  elke rit een blok op zijn moment. (Dit is de tweede vorm; de eerste zette de
  voertuigen als kolommen en herhaalde het raster per dag, wat zeven losse
  rasters onder elkaar gaf waarin "wat gebeurt er donderdag" pas na scrollen in
  beeld kwam.)
- Het **voertuig staat in het blok** met zijn icoon, met een legende onder de
  kalender; de kolombreedte is dus voor de dag en niet voor drie voertuigen
  waarvan er meestal twee leegstaan.
- **Elke chauffeur heeft zijn eigen kleur**, afgeleid uit zijn id: dezelfde
  persoon is altijd dezelfde kleur, zonder beheerscherm. Een rit zonder chauffeur
  is geel, gestreept betekent nog te beslissen, doorzichtig is afgerond, rood is
  een botsing.
- **Klik een rit aan** en er opent een venster: is ze nog te beslissen, dan staan
  daar de uren, de chauffeur en goedkeuren/afwijzen; daarna het voertuig, de
  chauffeur en "rit afronden". Je hoeft de planning niet meer te verlaten.
- Overlappende ritten komen naast elkaar te staan in plaats van elkaar te
  verbergen, ook wanneer het om verschillende voertuigen gaat. Staat een rit
  naast een andere, dan toont het blok enkel het beginuur; het einduur lees je aan
  de onderrand en in de tooltip.

Testen: maak twee ritten op dezelfde dag met hetzelfde voertuig en verschillende
chauffeurs, en één zonder chauffeur. Klik de onbesliste aan en keur ze goed; het
venster schakelt meteen over naar de knoppen van een goedgekeurde rit.

**T8** is hetzelfde raster op `/vervoer/bezetting`:

- **Ingelogd** zie je evenement en chauffeur, zonder de beslisknoppen.
- **Uitgelogd** enkel voertuig, dag en uur; geen namen. Test dat in een
  privévenster. *Dit wijkt af van wat het werkplan vroeg: ronde 1 besliste dat het
  publieke overzicht anoniem moet blijven, dus de namen zijn er enkel voor wie
  ingelogd is. Het zijn twee aparte queries, zodat één vergeten `if` niets kan
  lekken.*

## 5. Eén bug die overal zat

**T11** stond in het werkplan als "gewijzigde uren van een conflicterende rit
worden niet opgeslagen". Het zat niet in dat scherm maar in `SaveForm`: React 19
reset een `<form action={...}>` na élke action, ook wanneer die een fout
teruggeeft. Elk formulier in de app gooide dus je invoer weg op het moment dat de
foutmelding vroeg om ze te verbeteren.

Testen: `/beheer/vervoer`, een rit die botst met een goedgekeurde rit. Verschuif
de uren naar iets dat nóg botst en keur goed. Je krijgt de foutmelding en **de
uren die je intikte blijven staan**. Zet ze daarna naar een vrij moment: de rit
gaat goedgekeurd de lijst in.

## Nieuwe migraties

Zes stuks, allemaal `packages/db/prisma/migrations/`:

| Migratie | Wat ze doet |
| --- | --- |
| `20260822200000_uitleen_line_decision` | `adminNote` en `lineStatus` per reservatielijn, met backfill van wat al beslist was |
| `20260823000000_uitleen_vehicle_needs_driver` | `needsDriver` per voertuig; staat uit voor de bakfiets |
| `20260823010000_uitleen_event_period` | `endAt` en `startTimeKnown` op een evenement |
| `20260823020000_uitleen_event_attendance` | `expectedAttendance` op een evenement |
| `20260823030000_uitleen_event_extras` | tabel `UitleenEventExtraItem` en `CollectEnGoOrder.eventId` |
| `20260823040000_uitleen_requester_seen` | `requesterSeenAt` op aanvraag en rit |

## Wat ik anders deed dan gevraagd

Drie keer, telkens met de reden bij de taak in het werkplan:

1. **R8**: de premisse klopte niet meer. Sinds ronde 1 vraagt een lid nooit zelf
   een leveringsrit aan; de gevraagde waarschuwing zou tot dubbele ritten leiden.
2. **T8**: namen enkel voor wie ingelogd is, zodat het publieke overzicht anoniem
   blijft zoals in ronde 1 beslist.
3. **M3**: geen aparte `PARTIALLY_APPROVED`-status op de aanvraag. Dat is af te
   leiden uit de lijnen, en een extra enumwaarde zou élke statusquery en de
   voorraadberekening raken.

En één bewuste beperking: **bulk "teruggebracht" slaat aanvragen met flesserke
over**. Die zouden anders stilzwijgend als volledig verbruikt afgeboekt worden, en
dat is een voorraadfout die niemand ziet.
