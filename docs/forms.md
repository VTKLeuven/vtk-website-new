# Formulieren: architectuur & bestandsoverzicht

Leden bouwen een formulier in de admin, bezoekers vullen het in op de publieke
site, beheerders bekijken, exporteren en mailen de inzendingen. Dit is de "waar
staat wat"-kaart; de kringkeuzes staan in `docs/design-decisions.md`, de rechten
in `docs/permissions.md`.

De module leunt bewust op ticketing: dezelfde vorm van grants, dezelfde
adminskin, hetzelfde outboxpatroon. Wie ticketing kent, herkent dit.

## End-to-end flow

1. **Aanmaken**: een postlid met `forms.create` (of iemand met
   `forms.manageAll`) maakt een formulier op `/admin/formulieren/nieuw`. De maker
   en de leiding van de eigenaarspost krijgen meteen een expliciete
   `MANAGER`-grant. Daarnaast krijgt elk lid met `forms.create` automatisch
   volledig beheer over alle formulieren van de eigen post.
2. **Velden**: op `/admin/formulieren/<id>/velden` komen secties, velden,
   keuzeopties (met een eventueel quotum) en voorwaarden. Naast de editor staat
   een live preview die letterlijk dezelfde component gebruikt als de publieke
   pagina.
3. **Publiceren**: status op `PUBLISHED` in de instellingen. Zonder velden
   weigert de action dat. Staat het formulier op beide talen terwijl er stukken
   onvertaald zijn, dan somt het overzicht op wat er ontbreekt.
4. **Invullen**: `/formulieren/<slug>`. De pagina zegt waarom je niet kan
   invullen (nog niet open, gesloten, vol, enkel leden, al ingediend) in plaats
   van leeg te blijven.
5. **Indienen**: `submitFormAction` herberekent de zichtbaarheid, valideert
   elk veld, reserveert de quota en bewaart alles in één transactie. Daarna gaan
   de bevestigingsmail en de melding aan de organisatoren naar de outbox.
6. **Opvolgen**: `/admin/formulieren/<id>/inzendingen` heeft de tabel, het
   detail en de export (CSV, PDF en zip met de bestanden). Een editor kan op het
   detail de antwoorden aanpassen, de status, notitie en beoordelaar bijwerken,
   een inzending verwijderen en deelnemers mailen. Een beheerderswijziging
   herberekent de quota en verstuurt geen bevestigingsmail.

## Datamodel

Alles in `packages/db/prisma/schema.prisma`, sectie "Formulieren".

| Model | Wat het is |
| --- | --- |
| `Form` | Het formulier zelf: slug, NL/EN-titels en intro, status, doelpubliek, open- en sluitmoment, `maxEntries`, bevestigingsmail, meldingen, toestemming, `retentionDays`, optionele `calendarEventId` en `pageId`. |
| `FormSection` | Optionele groepering met volgorde; voedt de voortgangsbalk en draagt haar standaardvervolg (`nextSectionId`, `endsForm`). |
| `FormField` | Type, **stabiele `code`**, volgorde, labels, `required`, typespecifieke `config` (Json), `archivedAt` voor soft delete. |
| `FormFieldOption` | Keuzeopties als rijen (niet als JSON), met `quotaLimit`/`quotaUsed`/`version`, een eigen wachtlijst en een eigen sprong. |
| `FormFieldCondition` | "Toon dit veld wanneer veld X ...". Meerdere condities op één veld gelden samen (AND). |
| `FormEntry` | Eén inzending: `status` (DRAFT/SUBMITTED), `reviewStatus`, notitie, beoordelaar, `isTest`, `waitlisted`, inzender. |
| `FormAnswer` | Eén antwoord, met `fieldCode` als **momentopname** naast de FK. |
| `FormFileUpload` | Bestand in de objectopslag onder `forms/<formId>/`. |
| `FormUserGrant` / `FormGroupGrant` | Toegang per persoon en per post (`ALL_MEMBERS` vs. `LEADS_ONLY`). |
| `FormAuditLog` | Wie wijzigde wat. |
| `FormOutboxMessage` | Mailwachtrij met `dedupeKey` en herpogingen. |

### Waarom een veld nooit een antwoord kwijtspeelt

Dit is de reden dat verschillende keuzes eruitzien zoals ze eruitzien:

- **`FormField.code` is de sleutel**, niet de positie en niet het label. Hij
  wordt één keer afgeleid bij het aanmaken en wijzigt daarna nooit meer. Het is
  de kolomnaam in de CSV en de sleutel in een prefill-link.
- **`FormAnswer.fieldCode` bewaart een kopie** van die code. Zo houdt een
  antwoord zijn kolom, ook nadat het veld hernoemd of gearchiveerd is.
- **Velden en opties met antwoorden worden gearchiveerd, niet verwijderd**
  (`archivedAt`). Ze verdwijnen van het formulier en houden hun kolom in de
  export. De bevestigingsdialoog zegt welke van de twee er gaat gebeuren.
- **Een typewissel mag de opslagvorm niet veranderen** zodra er antwoorden zijn.
  `storageKindFor` in `lib/forms/schema.ts` beslist dat; de keuzelijst in de
  editor grijst de rest uit en de action weigert het nog eens.
- **Een quotum kan niet onder wat al gebruikt is.**

## Bestandsoverzicht

### Domeinlogica (`apps/web/lib/forms/`)
- `schema.ts`: de zestien veldtypes, hun config, de opslagvorm per type, en het
  afleiden van stabiele codes. Puur, dus gedeeld met de client.
- `visibility.ts`: welke velden zichtbaar zijn, plus kringdetectie voor de
  editor. Ook puur en gedeeld.
- `surface.ts`: alles wat nodig is om het formulier te tonen (velden,
  voorinvulling, of invullen kan). Gedeeld door de eigen pagina en het paneel in
  een contentpagina, zodat die twee nooit iets anders zeggen.
- `pageLink.ts`: de koppeling met een contentpagina vanaf beide kanten; wie wat
  mag kiezen, en de cache van de pagina verversen.
- `branching.ts`: welke secties het antwoordenpatroon aandoet, de stappen die
  daaruit volgen, en de kringdetectie voor sprongen. Ook puur en gedeeld.
- `validation.ts`: de serverside waarheid bij het indienen.
- `publicForm.ts`: het formulier laden en beslissen of het invulbaar is.
- `submit.ts`: de transactie: antwoorden, bestanden en quota.
- `authorization.ts`: capabilities per grant, `requireFormCapability`.
- `export.ts`: kolommen, CSV en het antwoordoverzicht.
- `pdf.ts`: de PDF-export.
- `mail.ts` / `outbox.ts`: de teksten en de wachtrij.
- `translation.ts`: wat er nog niet vertaald is.
- `antiSpam.ts`: honeypot, limiet per IP, minimale invultijd.
- `uploadToken.ts`: de ondertekende verwijzing naar een geüpload bestand.
- `audit.ts`: één plek die naar `FormAuditLog` schrijft.
- `grouping/`: de groepjesmaker: `algorithm.ts` (puur), `roles.ts` (welke rol
  bij welk veldtype), `run.ts` (indelen en bewaren), `due.ts` (automatisch
  sluiten en indelen), `view.ts` (wat het scherm toont), `pdf.ts` (de
  afdruklijst per groep).

### Routes - publiek (`apps/web/app/[locale]/formulieren/`)
- `page.tsx`: de open formulieren (enkel wat `listed` is)
- `[slug]/page.tsx`: het formulier
- `[slug]/bedankt/page.tsx`: de bevestiging

Daarnaast rendert `components/site/PageView.tsx` het paneel op een contentpagina
(`/<categorie>/<pagina>` en `/p/<pagina>`); de markering en het anker staan in
`lib/pageForm.ts`.

### Routes - admin (`apps/web/app/[locale]/admin/formulieren/`)
- `page.tsx`, `nieuw/page.tsx`
- `[formId]/{page,instellingen,velden,inzendingen,groepjes,toegang}`
- `[formId]/inzendingen/[entryId]`: detail met opvolging

### API (`apps/web/app/api/forms/`)
- `[formId]/uploads`: een bestand uploaden vóór het indienen
- `[formId]/bestanden/[uploadId]`: één bestand downloaden (grants gecheckt)
- `[formId]/exports/{entries,pdf,bestanden,groepjes}`: CSV, PDF, zip, groepjes-CSV
- `[formId]/exports/groepjes/pdf`: de groepjes als afdruklijst, één pagina per groep
- `maintenance`: de worker: outbox legen, samenvattingen en herinneringen, en
  de automatische groepjesmaker

### Componenten (`apps/web/components/forms/`)
- `FormFieldInput.tsx` + `FormFieldBlock.tsx`: **de** veldrenderer, gedeeld
  door het publieke formulier en de preview in de editor
- `public/PublicForm.tsx`, `public/FormFileField.tsx`
- `public/FormBody.tsx`: de melding waarom invullen niet kan, of de velden zelf,
  plus de statusregels; gedeeld door beide weergaven
- `public/PageFormPanel.tsx`: het paneel zoals het in een contentpagina staat
- `admin/FieldEditor.tsx` + `admin/FieldSettings.tsx`: de veldeditor
- `admin/SectionManager.tsx`, `admin/MailingPanel.tsx`, `admin/EntryTools.tsx`,
  `admin/SharePanel.tsx`, `admin/EntryReviewForm.tsx`

### Styling
- `apps/web/app/design/vtk-forms.css`: het formulier zoals de bezoeker het ziet
  (gedeeld met de preview), plus het paneel op een contentpagina
  (`.vtk-page-form`). De gele knop in de rail staat bij de rest van de rail in
  `vtk-base.css` (`.vtk-rail-form`).
- `apps/web/app/design/vtk-form-admin.css`: enkel wat eigen is aan de admin. De
  panelen, tabellen en velden komen uit `vtk-ticket-admin.css`; vandaar
  `ticket-admin` op de root van de formulierenschermen.

## Rechten

- `forms.create`: formulieren aanmaken voor de eigen post (in de seed op de
  rol `praesidium`, net als `tickets.create`). Geeft ook volledig beheer over de
  bestaande formulieren waarvan die post eigenaar is.
- `forms.manageAll`: alles beheren.
- Per formulier: `VIEWER` (lezen en exporteren, ook de groepjes), `EDITOR` (ook
  inzendingen beheren, deelnemers mailen en de groepjes maken), `MANAGER` (ook
  het formulier zelf). Een
  postgrant geldt voor alle leden of enkel de leads.
- De laatste `MANAGER` kan zichzelf niet verwijderen.

## Mail

De outbox draait op de worker `forms-worker` uit `infra/docker-compose.yml`, die
elke minuut `POST /api/forms/maintenance` aanroept met
`FORMS_MAINTENANCE_SECRET` (valt terug op `TICKETING_MAINTENANCE_SECRET`).

Vier berichttypes: `FORM_CONFIRMATION`, `FORM_NOTIFICATION`, `FORM_DIGEST` en
`FORM_DRAFT_REMINDER`. **Zonder mailserver haalt de outbox niets uit de
wachtrij**: anders staat alles op `SENT` terwijl er nooit iets vertrok.

## Privacy

- Inzendingen zitten in `exportUserData` (`lib/privacy/account.ts`).
- `eraseUserData` **verwijdert** de inzendingen van een gewist account, inclusief
  de bestanden, en geeft de quota terug. Bij ticketing volstaat het de identiteit
  te strippen; bij een formulier zitten de persoonsgegevens juist in de
  antwoorden.
- `runPrivacyRetention` ruimt inzendingen op van formulieren met een
  `retentionDays`. Leeg is de standaard en betekent: niets opruimen.
- `requireConsent` zet een verplicht vinkje met een link naar het privacybeleid.

## Het formulier op een contentpagina

`Form.pageId` hangt een formulier aan een CMS-pagina; het verschijnt daar als
paneel in de tekst. Uniek in beide richtingen: een pagina draagt hoogstens een
formulier, en een formulier staat op hoogstens een pagina.

- **Waar het paneel komt, staat in de tekst zelf.** De redacteur zet de
  markering `[[formulier]]` op een eigen regel in de markdown; `lib/pageForm.ts`
  splitst de inhoud daarop en `PageView` rendert tekst, paneel, tekst. Staat de
  markering er niet, dan komt het paneel onderaan. Zonder gekoppeld formulier
  wordt ze uit de tekst gehaald in plaats van als tekst gerenderd.
- **De rail zegt het.** Het formulier krijgt geen gewone regel in "Op deze
  pagina" maar een gele knop met de deadline eronder, op de plaats waar het
  paneel in de tekst staat. Is het dicht, vol of al ingediend, dan wordt die knop
  grijs; een gele "inschrijven"-knop op een gesloten formulier is een leugen.
- **Een formulier houdt zijn eigen adres.** `/formulieren/<slug>` blijft
  bestaan; de pagina is een tweede plek waar het staat, geen verhuizing.
- **Een concept of een gearchiveerd formulier laat het paneel weg**, in plaats
  van de hele pagina te weigeren. Wie het formulier beheert, ziet het concept wel,
  met dezelfde voorbeeldmelding als op de eigen pagina.
- **Na het versturen blijf je op de pagina staan.** `PublicForm` krijgt een
  `successHref`; het paneel wijst naar `?formulier=verstuurd#formulier` en toont
  daar de bedanking. Doorsturen naar `/formulieren/<slug>/bedankt` zou de bezoeker
  weghalen van waar hij naartoe kwam.
- **Koppelen kan vanaf beide kanten**: bij de instellingen van een formulier
  kies je de pagina, en op `/admin/paginas/<id>` staat een kaart waar je een
  bestaand formulier kiest of er meteen een nieuw voor aanmaakt. In beide
  richtingen geldt dezelfde regel: koppelen is de pagina bewerken, dus je hebt de
  bewerkrechten van die pagina nodig plus `MANAGE_FORM` op het formulier.
- **De MCP-server kan dit niet.** `form` in `lib/mcp/create.ts` is `.strict()` en
  kent geen `pageId`: een agent kan dus geen formulier op een pagina laten
  verschijnen.

## Springen tussen secties

Zet `Form.stepBySections` aan en het formulier komt stap voor stap: eerst de
velden zonder sectie, daarna elke sectie op het pad. Springen heeft enkel
betekenis in die weergave; op één pagina staat alles toch al onder elkaar.

De route komt uit drie lagen, van sterk naar zwak:

1. **Een gekozen optie** met een `nextSectionId` of `endsForm`. De eerste
   keuzevraag van de stap die iets aanwijst, beslist.
2. **Het standaardvervolg van de sectie** (`nextSectionId` / `endsForm`).
3. **De volgende sectie in volgorde.**

Twee dingen die gemakkelijk fout gaan en die de tests vastleggen:

- **De eerste stap mag ook sturen.** Staat de vraag "kom je?" bovenaan buiten
  elke sectie, dan bepaalt haar antwoord welke sectie volgt. De eerste versie
  keek enkel naar velden ín een sectie en begon altijd bij de eerste sectie; het
  formulier sprong dan gewoon niet.
- **Een overgeslagen sectie telt als verborgen.** Bij het indienen wordt het pad
  opnieuw uitgerekend: velden in een tak die de bezoeker nooit zag, zijn niet
  verplicht en hun antwoord wordt niet bewaard.

Kringen worden in de editor tegengehouden (`wouldLoop`). Komt er via oudere data
toch een door, dan stopt het pad bij een sectie die het al bezocht in plaats van
te bevriezen.

## Wachtlijst

Twee plekken, dezelfde uitkomst: `Form.allowWaitlist` voor wanneer `maxEntries`
bereikt is, en `FormFieldOption.allowWaitlist` voor wanneer één keuze vol zit.
In beide gevallen komt de inzending binnen met `waitlisted = true` en claimt ze
**geen** quotum.

- Een volle optie met wachtlijst blijft kiesbaar en staat er als "volzet,
  wachtlijst" bij; zonder wachtlijst is ze grijs.
- Zit één van de gekozen opties vol, dan claimt de inzending helemaal niets meer
  en gaat terug wat ze al claimde. Anders had ze de helft van haar keuzes bezet
  zonder plaats te hebben.
- Een beheerder haalt iemand erbij met "Een plaats geven" op de detailpagina.
  Dat claimt de quota op dat moment alsnog; lukt dat niet, dan blijft de
  inzending op de wachtlijst en zegt de melding dat het nog vol is. Automatisch
  opschuiven met een mail erbij is er bewust niet: dat is een eigen levenscyclus
  met een deadline en een vervaltermijn.

## Groepjesmaker

Onthaal (peter-metergroepen) en internationaal (kwisploegen) laten iedereen een
publieke form invullen en willen daarna groepjes op basis van de antwoorden. De
groepjesmaker hangt daarom aan een gewone form: de publieke link, de vragen,
het sluitmoment en het maximum zijn die van de form zelf.

In het beheer staat hij niet onder Forms maar in de zijbalkgroep **Apps**, de
plek voor kleine hulpmiddelen die een post af en toe nodig heeft. Elke app is
een item in die groep. Er komen er nog bij, en een eigen tab per hulpmiddel
maakt de zijbalk langer voor iets dat de meeste posten nooit openen. De groep
heeft `keepSingle` in `lib/admin-nav.ts`: een gewone groep met één zichtbaar
item wordt een losse tab, maar Apps blijft staan, zodat de groepjesmaker niet
van plaats wisselt zodra er een tweede app bijkomt. Het item volgt de
zichtbaarheid van Forms (`forms: true`), want het draait op een form.

- `/admin/apps/groepjesmaker`: alle groepjesmakers die je mag zien, en een
  nieuwe maken op een form die je beheert.
- `/admin/apps/groepjesmaker/<formId>`: één groepjesmaker, met dezelfde opbouw
  als de formuliereneditor (`GroupingAdminNav` naast `FormAdminNav`): een kop
  met de form waaraan hij hangt, en drie tabbladen.
  - **Groepjes** (de root): de stand van zaken, de waarschuwingen, de knop om in
    te delen, de laatkomers en de groepen zelf. Dat is waarvoor je het scherm
    opent, dus het is de eerste tab.
  - **Vragen**: wat elke vraag doet, met bovenaan welke form de vragen levert en
    een knop om ze te bewerken.
  - **Instellingen**: de grenzen per groep, wanneer er ingedeeld wordt, en het
    uitzetten van de groepjesmaker.
  De twee laatste tabs vragen `MANAGE_GROUPING` en hebben elk hun eigen
  opslaan-actie (`saveGroupingSettingsAction`, `saveGroupingRolesAction`), zodat
  een tabblad bewaart wat erop staat en niets anders.

De kringkeuzes erachter staan in `docs/design-decisions.md`, "De groepjesmaker".

### Uitproberen

`packages/db/prisma/seed.ts` zet een demo klaar (`prisma/seed-groepjesmaker.ts`):
de form **Peter-metergroepjes** van onthaal met de vragen uit hun verslag (plus
een gsm-nummer, zodat de afdruklijst iets te tonen heeft), 65 inzendingen die
samen 83 personen dragen, drie peter-metergroepen die samen
inschreven (een ervan neemt er niemand meer bij) en vijf groepjes vrienden op
één inzending. Create-only op de slug `peter-meter-groepjes`: een tweede seed
voegt niets toe.

Ze staat op "nog niet ingedeeld", met `expectedPeople` op 85. Klik "Nu indelen"
om het resultaat te zien, of vul het publieke formulier zelf in met twee
personen: dan sluit de form en deelt de worker in.

### De rol van een vraag

Elke vraag krijgt hoogstens een rol (`FormGroupingField`). Zonder rol is ze
gewoon een gegeven: ze staat in de export maar telt niet mee.

| Rol | Veldtypes | Wat ze doet |
| --- | --- | --- |
| `NAME` | tekst | De naam in het resultaat; ook een partner kan ernaar verwijzen. |
| `IDENTIFIER` | tekst, e-mail | Nog iets waarmee een partner kan verwijzen (r-nummer, e-mail). |
| `GROUP_SIZE` | getal | Met hoeveel personen deze inzending telt, de invuller inbegrepen. Hoogstens één. |
| `GROUP_NAMES` | tekst | De anderen in die inschrijving, met komma's. Leeg aantal = 1 plus deze namen. |
| `PARTNER` | tekst | Wil samen met; wordt gezocht in `NAME`/`IDENTIFIER`/`GROUP_NAMES` van de anderen. |
| `ANCHOR` | keuze, ja/nee | De aangevinkte antwoorden maken iemand kern (peter/meter). Hoogstens één. |
| `ACCEPTS_EXTRA` | keuze, ja/nee | Kern die "nee" antwoordt, krijgt geen andere kern erbij. |
| `SIMILAR` | keuze, getal, schaal, korte tekst | Gelijk antwoord trekt samen; gewicht 1 tot 5. |
| `DIVERSE` | idem | Gelijk antwoord duwt uit elkaar (land); gewicht 1 tot 5. |

Welke rol bij welk type mag, staat op één plek (`lib/forms/grouping/roles.ts`)
en wordt door het scherm en de action allebei gebruikt.

### Het algoritme (`lib/forms/grouping/algorithm.ts`)

Puur en zonder database, dus getest in `test/formsGrouping.test.ts`.

1. **Blokken.** Elke inzending is een blok met als gewicht het aantal personen.
   Een partnerverwijzing voegt twee blokken samen, tenzij de ene kern is en de
   andere niet, of ze samen boven het maximum per groep uitkomen (dan een
   waarschuwing). Een blok wordt nooit gesplitst.
2. **Aantal groepen.** Uit het aantal gewone leden en het midden van de
   min/max per groep, begrensd door die min/max, door het min/max aantal groepen
   en door de kern: een kerngroep (kern met twee of meer personen) krijgt altijd
   een eigen groep.
3. **Beginindeling.** Kerngroepen eerst (elk een eigen groep, vast), dan de losse
   kern naar groepen zonder of met te weinig kern, dan de leden: eerst iedere
   groep tot het minimum, dan waar ze het best passen.
4. **Verbeteren.** Blokken verplaatsen en wisselen zolang het beter wordt:
   eerst minder buiten de grenzen, pas dan een hogere score (per paar in
   dezelfde groep: `SIMILAR` telt op, `DIVERSE` telt af, maal het gewicht en
   het aantal personen).

Zes pogingen met een andere volgorde, de beste wint. De seed volgt uit de
form-id: dezelfde inzendingen geven dezelfde groepen. Wat na afloop buiten de
grenzen valt, komt als waarschuwing (`FormGrouping.warnings`) op het scherm; de
indeling faalt nooit op een grens.

### Wanneer er ingedeeld wordt

- Met de knop **Nu indelen** / **Opnieuw indelen**. Opnieuw indelen vervangt
  alles, ook de handmatige verplaatsingen; de bevestiging noemt hoeveel.
- Automatisch, als `autoRun` aan staat: de forms-worker (`/api/forms/maintenance`,
  `lib/forms/grouping/due.ts`) sluit de form en deelt in zodra de form al
  gesloten is, het sluitmoment voorbij is, het maximum aantal inzendingen bereikt
  is, of `expectedPeople` personen ingeschreven zijn. **Een keer** (`ranAt` is
  dan gezet): wie daarna opnieuw wil, doet dat met de knop, zodat een
  handmatige verplaatsing nooit stil verdwijnt.

Wat meetelt: ingediend, geen test, niet op de wachtlijst. Een inzending die na
de indeling binnenkomt, staat onder "Nog niet ingedeeld" en kan met de hand in
een groep gezet worden.

### Meenemen: CSV en PDF

Twee formaten met twee doelen, naast elkaar boven de groepen:

- **CSV** (`exports/groepjes`): één rij per inzending met het groepsnummer, de
  kern-kolom en alle antwoorden. Daarmee maak je de WhatsApp-groepen of reken je
  verder in een spreadsheet.
- **PDF** (`exports/groepjes/pdf`): één pagina per groep, met per persoon een rij
  om af te vinken: naam (de kern vet), r-nummer, gsm en wie hij meebracht. In de
  kop staat hoe groot de groep is en wat ze kenmerkt. Welke vragen een kolom
  krijgen, beslist `isListColumn`: de herkenningsvelden (`IDENTIFIER`) en alles
  wat een telefoonnummer of e-mailadres is. De keuzevragen komen niet als kolom
  mee; die staan samengevat in de kop en voluit in de CSV.

### Wie wat mag

Twee capabilities per form, bovenop de rollen hierboven:

- `VIEW_GROUPING` (viewer, editor, manager): het resultaat zien en exporteren.
- `MANAGE_GROUPING` (editor, manager): instellen, indelen, verplaatsen,
  uitzetten.

Geen nieuwe permissie in de registry: wie `forms.create` heeft (elke
praesidiumpost, dus ook onthaal en internationaal) is manager van de forms van
de eigen post, en `forms.manageAll` van alles. Een andere post of een persoon
geef je toegang via de tab Toegang van de form, zoals bij de inzendingen zelf.

De groepen zijn enkel voor de beheerders: er gaat geen mail naar de deelnemers
en de publieke pagina toont niets. Daarom staat er ook niets op
`/admin/it/flows`.

### Datamodel

`FormGrouping` (een per form: parameters, `autoRun`, `expectedPeople`, laatste
indeling, waarschuwingen), `FormGroupingField` (rol per vraag),
`FormGroupingGroup` en `FormGroupingMember` (een rij per inzending, met
`isAnchor`). Alles cascadet mee met de form, de vraag of de inzending; wie een
inzending wist (ook via `eraseUserData`), haalt ze dus uit haar groep.

## Wat er (nog) niet is

- Automatisch opschuiven van de wachtlijst.
- Betalingen, quizscores, en de migratie van de bestaande ticketvragen naar deze
  velden. Bewust buiten scope gehouden.

## Tests

`npm run test --workspace=@vtk/web`, in het bijzonder:
`formsSchema`, `formsVisibility`, `formsBranching`, `formsValidation`,
`formsExport`, `formsMail`, `formsPdf`, `formsTranslation`,
`formsAuthorization` en `formsGrouping`. De groepjesmaker tegen een database:
`npm run test:integration -w @vtk/web` (`forms-grouping.integration.ts`). Voor het paneel op een contentpagina: `pageForm` (waar het
in de tekst komt) en `pageOutline` (waar het in de rail komt, en hoe de rail
meeloopt met het scrollen).
