# Formulieren — architectuur & bestandsoverzicht

Leden bouwen een formulier in de admin, bezoekers vullen het in op de publieke
site, beheerders bekijken, exporteren en mailen de inzendingen. Dit is de "waar
staat wat"-kaart; de kringkeuzes staan in `docs/design-decisions.md`, de rechten
in `docs/permissions.md`.

De module leunt bewust op ticketing: dezelfde vorm van grants, dezelfde
adminskin, hetzelfde outboxpatroon. Wie ticketing kent, herkent dit.

## End-to-end flow

1. **Aanmaken** — een postlid met `forms.create` (of iemand met
   `forms.manageAll`) maakt een formulier op `/admin/formulieren/nieuw`. De maker
   en de leiding van de eigenaarspost krijgen meteen een expliciete
   `MANAGER`-grant. Daarnaast krijgt elk lid met `forms.create` automatisch
   volledig beheer over alle formulieren van de eigen post.
2. **Velden** — op `/admin/formulieren/<id>/velden` komen secties, velden,
   keuzeopties (met een eventueel quotum) en voorwaarden. Naast de editor staat
   een live preview die letterlijk dezelfde component gebruikt als de publieke
   pagina.
3. **Publiceren** — status op `PUBLISHED` in de instellingen. Zonder velden
   weigert de action dat. Staat het formulier op beide talen terwijl er stukken
   onvertaald zijn, dan somt het overzicht op wat er ontbreekt.
4. **Invullen** — `/formulieren/<slug>`. De pagina zegt waarom je niet kan
   invullen (nog niet open, gesloten, vol, enkel leden, al ingediend) in plaats
   van leeg te blijven.
5. **Indienen** — `submitFormAction` herberekent de zichtbaarheid, valideert
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
| `Form` | Het formulier zelf: slug, NL/EN-titels en intro, status, doelpubliek, open- en sluitmoment, `maxEntries`, bevestigingsmail, meldingen, toestemming, `retentionDays`, optionele `calendarEventId`. |
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
- `schema.ts` — de zestien veldtypes, hun config, de opslagvorm per type, en het
  afleiden van stabiele codes. Puur, dus gedeeld met de client.
- `visibility.ts` — welke velden zichtbaar zijn, plus kringdetectie voor de
  editor. Ook puur en gedeeld.
- `branching.ts` — welke secties het antwoordenpatroon aandoet, de stappen die
  daaruit volgen, en de kringdetectie voor sprongen. Ook puur en gedeeld.
- `validation.ts` — de serverside waarheid bij het indienen.
- `publicForm.ts` — het formulier laden en beslissen of het invulbaar is.
- `submit.ts` — de transactie: antwoorden, bestanden en quota.
- `authorization.ts` — capabilities per grant, `requireFormCapability`.
- `export.ts` — kolommen, CSV en het antwoordoverzicht.
- `pdf.ts` — de PDF-export.
- `mail.ts` / `outbox.ts` — de teksten en de wachtrij.
- `translation.ts` — wat er nog niet vertaald is.
- `antiSpam.ts` — honeypot, limiet per IP, minimale invultijd.
- `uploadToken.ts` — de ondertekende verwijzing naar een geüpload bestand.
- `audit.ts` — één plek die naar `FormAuditLog` schrijft.

### Routes — publiek (`apps/web/app/[locale]/formulieren/`)
- `page.tsx` — de open formulieren (enkel wat `listed` is)
- `[slug]/page.tsx` — het formulier
- `[slug]/bedankt/page.tsx` — de bevestiging

### Routes — admin (`apps/web/app/[locale]/admin/formulieren/`)
- `page.tsx`, `nieuw/page.tsx`
- `[formId]/{page,instellingen,velden,inzendingen,toegang}`
- `[formId]/inzendingen/[entryId]` — detail met opvolging

### API (`apps/web/app/api/forms/`)
- `[formId]/uploads` — een bestand uploaden vóór het indienen
- `[formId]/bestanden/[uploadId]` — één bestand downloaden (grants gecheckt)
- `[formId]/exports/{entries,pdf,bestanden}` — CSV, PDF, zip
- `maintenance` — de worker: outbox legen, samenvattingen en herinneringen

### Componenten (`apps/web/components/forms/`)
- `FormFieldInput.tsx` + `FormFieldBlock.tsx` — **de** veldrenderer, gedeeld
  door het publieke formulier en de preview in de editor
- `public/PublicForm.tsx`, `public/FormFileField.tsx`
- `admin/FieldEditor.tsx` + `admin/FieldSettings.tsx` — de veldeditor
- `admin/SectionManager.tsx`, `admin/MailingPanel.tsx`, `admin/EntryTools.tsx`,
  `admin/SharePanel.tsx`, `admin/EntryReviewForm.tsx`

### Styling
- `apps/web/app/design/vtk-forms.css` — het formulier zoals de bezoeker het ziet
  (gedeeld met de preview)
- `apps/web/app/design/vtk-form-admin.css` — enkel wat eigen is aan de admin. De
  panelen, tabellen en velden komen uit `vtk-ticket-admin.css`; vandaar
  `ticket-admin` op de root van de formulierenschermen.

## Rechten

- `forms.create` — formulieren aanmaken voor de eigen post (in de seed op de
  rol `praesidium`, net als `tickets.create`). Geeft ook volledig beheer over de
  bestaande formulieren waarvan die post eigenaar is.
- `forms.manageAll` — alles beheren.
- Per formulier: `VIEWER` (lezen en exporteren), `EDITOR` (ook inzendingen
  beheren en deelnemers mailen), `MANAGER` (ook het formulier zelf). Een
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

## Wat er (nog) niet is

- Automatisch opschuiven van de wachtlijst.
- Betalingen, quizscores, en de migratie van de bestaande ticketvragen naar deze
  velden. Bewust buiten scope gehouden.

## Tests

`npm run test --workspace=@vtk/web`, in het bijzonder:
`formsSchema`, `formsVisibility`, `formsBranching`, `formsValidation`,
`formsExport`, `formsMail`, `formsPdf`, `formsTranslation` en
`formsAuthorization`.
