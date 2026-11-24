# Hoe de VTK-app gebruikt wordt

Admin › Website › App toont of de app een succes is: hoeveel mensen ze hebben,
hoe vaak ze ze openen, of ze terugkomen, wat ze erin doen, en hoeveel van wat er
besteld wordt uit de app komt in plaats van van de website. Sinds 24 november
2026.

## Wat de app meldt

De app (`src/usage.ts` in vtk-app) stuurt een rapport (`AppUsageReport`) naar
`POST /api/app/v1/gebruik`: bij de start, wanneer ze naar de achtergrond gaat,
en om de minuut zolang er iets te melden is. Het rapport draagt:

- **een installatie-id**: willekeurig, door de app gemaakt bij de eerste start en
  lokaal bewaard. Geen toestel-id van Apple of Google; wie de app opnieuw
  installeert, is een nieuwe installatie.
- **het toestel en de versie**: platform, versie van het besturingssysteem, het
  model (enkel op Android), de appversie, de EAS Update die draait, het kanaal,
  Expo Go of niet, de taal, en of meldingen aan staan. Bewaard als laatste stand
  in `AppInstall`.
- **de sessie**: een id en het begin. Een sessie is gebruik zonder pauze van een
  halfuur of langer; ze begint bij een koude start of wanneer de app na zo'n
  pauze terug op de voorgrond komt. Elk rapport telt de seconden op de voorgrond
  erbij (`AppSession.activeSeconds`).
- **de schermen**: het routepatroon uit expo-router (`evenement/[id]`, nooit de
  id zelf) of een tabblad binnen een scherm (`kalender:planning:semester`), met
  hoe vaak. Per dag, installatie en scherm één rij (`AppScreenDay`).
- **losse gebeurtenissen**, zoals een tik op een pushbericht (`push_open`), in
  `AppAction`.

Wie ingelogd is, krijgt zijn `userId` bij de installatie en de sessie. Zo kan het
beheer "hoeveel leden hebben de app" tellen. Het beheer toont enkel totalen, nooit
een lijst van wie wat deed.

Een rapport dat niet aankomt, gaat met het volgende mee; er gaat niets naar
schijf. Lukt ook dat niet (geen netwerk tot de app sluit), dan is dat stuk
gebruik weg. Dat is aanvaardbaar voor statistiek, en het houdt de app vrij van
een schrijfwachtrij.

## App of website

Wat er via de app besteld wordt, herkent de site zelf:

- **Tickets** dragen het in `TicketOrder.source` = `app`. De checkout zet dat
  voor elke aanvraag met de kop `X-VTK-Client: app`, ook als de app geen
  `source` meestuurt. In de ticketstatistieken heet die bron "VTK-app".
- **Broodjes, cursusdienst, piano**: hun app-route (`/api/app/v1/theokot/order`,
  `/cudi/bestellen`, `/piano/reservatie`) zet een `AppAction` met de id van wat
  ze maakte. Die routes zijn enkel voor de app, dus elke aanroep telt.
- **Shiften** gaan voor de site en de app langs `/api/shift/register`; daar telt
  enkel een aanvraag met de kop `X-VTK-Client`.

`recordAppAction` vangt elke fout op: statistiek mag een bestelling nooit doen
mislukken. De cursusdienst houdt haar eigen bestellingen bij op cudi.vtk.be,
dus daar toont het beheer enkel wat uit de app kwam.

## Wat de cijfers betekenen

- **Actief**: een installatie met een sessie in die periode.
- **Plakkerigheid**: gemiddeld dagelijks actief gedeeld door maandelijks actief.
  Boven 20% is een app een dagelijkse gewoonte.
- **Leden met de app tegenover actieve leden**: de noemer is wie de laatste 30
  dagen een sessie had op vtk.be of in de app (`session.updatedAt`).
- **Terugkomen na een dag, week, maand**: van de installaties uit de periode, het
  deel met een sessie minstens zo lang na de eerste start. Wie nog niet zo lang
  geleden installeerde, telt voor die termijn niet mee.
- **Cohorten**: per installatieweek het deel dat de app in week 0, 1, 2, ... nog
  opende. Een week die nog niet voorbij is, blijft leeg en is geen 0.

Alle dagen zijn dagen in Brussel. De cijfers beginnen op de dag van de eerste
installatie; een periode die vroeger begint, wordt ingekort.
