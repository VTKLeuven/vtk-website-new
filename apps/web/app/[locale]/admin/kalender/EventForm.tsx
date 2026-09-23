'use client';

import { useState, type ReactNode } from 'react';
import Link from '@/components/ui/Link';
import { Card, Input, Label, Select } from '@vtk/ui';
import { saveEventAction } from '@/app/actions/calendar';
import { DEFAULT_EVENT_LINK_LABEL, EVENT_LINK_LABEL_MAX } from '@/lib/calendar/eventLink';
import { MarkdownEditorField } from '@/components/editor/MarkdownEditor';
import { SaveForm } from '@/components/ui/SaveForm';
import { saveErrorMessages } from '@/lib/saveMessages';
import { toImageFocus } from '@/lib/imageFocus';
import { EventImageField } from './EventImageField';
import { EventWhenField, type MomentValue } from './EventWhenField';

type Event = {
  id?: string;
  /** De publieke URL-naam. Leeg bij een nieuw evenement: die leidt de action af. */
  slug?: string;
  titleNl?: string;
  titleEn?: string | null;
  descriptionNl?: string | null;
  descriptionEn?: string | null;
  location?: string | null;
  groupId?: string;
  /** Vervangt de groepsnaam als organisator op de site; zie lib/calendar/organiser.ts. */
  organiserName?: string | null;
  start?: Date | null;
  end?: Date | null;
  allDay?: boolean;
  /**
   * De losse momenten, wanneer het evenement er meer dan één heeft. Leeg = het
   * evenement loopt van start tot einde door; zie `CalendarEventMoment`.
   */
  moments?: MomentValue[];
  url?: string | null;
  /** De tekst op de knop naar `url`; leeg = "Externe eventlink". */
  urlLabelNl?: string | null;
  urlLabelEn?: string | null;
  imageKey?: string | null;
  /** Waar de uitsnede van die foto rond draait; zie lib/imageFocus.ts. */
  imageFocusX?: number | null;
  imageFocusY?: number | null;
  publishedAt?: Date | null;
  categoryIds?: string[];
  /** Hangt er al een logistiek-evenement aan? Zie `UitleenEvent.calendarEventId`. */
  hasUitleenEvent?: boolean;
  /** Voorrang of uitsluiting in het weekoverzicht op de homepage. */
  heroWeek?: 'AUTO' | 'PINNED' | 'HIDDEN';
};

type Group = { id: string; nameNl: string; nameEn: string };
type Category = {
  id: string;
  nameNl: string;
  nameEn: string;
  colour: string;
  audience: string | null;
  /** De standaardbanner van dit thema, voor een evenement zonder eigen affiche. */
  bannerUrl?: string | null;
};

type Lang = 'nl' | 'en';

/** Eén aanvinkbare categorie; doelgroep en thema gebruiken dezelfde `name`. */
function CategoryCheckbox({
  category,
  checked,
  nl,
  onToggle,
}: {
  category: Category;
  checked: boolean;
  nl: boolean;
  /** Enkel bij een thema: de preview van de affiche volgt de keuze. */
  onToggle?: (checked: boolean) => void;
}) {
  return (
    <label className="inline-flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        name="categoryIds"
        value={category.id}
        defaultChecked={checked}
        onChange={onToggle ? (e) => onToggle(e.target.checked) : undefined}
      />
      <span aria-hidden className="inline-block size-2.5 rounded-full" style={{ background: category.colour }} />
      {nl ? category.nameNl : category.nameEn}
    </label>
  );
}

function EmptyCategoryMessage({
  audience,
  nl,
  canManageCategories,
  base,
}: {
  audience: boolean;
  nl: boolean;
  canManageCategories: boolean;
  base: string;
}) {
  return (
    <p className="rounded-xl border border-vtk-blue/15 bg-vtk-blue-soft/50 px-3 py-2 text-sm text-vtk-blue-muted">
      {audience
        ? nl
          ? 'Er zijn nog geen doelgroepen ingesteld. Dit evenement is voorlopig voor iedereen.'
          : 'No audiences have been configured yet. This event is for everyone for now.'
        : nl
          ? 'Er zijn nog geen categorieën ingesteld. Dit evenement wordt zonder categorie opgeslagen.'
          : 'No categories have been configured yet. This event will be saved without a category.'}{' '}
      {canManageCategories ? (
        <Link href={`${base}/admin/kalender/categorieen`} className="font-medium text-vtk-ink hover:underline">
          {nl ? 'Categorieën instellen' : 'Configure categories'}
        </Link>
      ) : null}
    </p>
  );
}

/**
 * Eén benoemde sectie van het formulier: een titel met de gele regel eronder,
 * één regel uitleg, en de velden.
 *
 * De uitleg staat hier één keer per sectie in plaats van onder elk veld apart.
 * Een scherm waarin onder elk invoervak twee regels grijze tekst hangen, leest
 * niemand nog; bij de sectie blijft het bij het stuk waar het over gaat.
 */
function Section({ title, note, children }: { title: string; note?: ReactNode; children: ReactNode }) {
  return (
    <Card className="vtk-ef-section">
      <h2 className="vtk-ef-section-title">{title}</h2>
      {note ? <p className="vtk-ef-section-note">{note}</p> : null}
      {children}
    </Card>
  );
}

/**
 * De NL/EN-schakelaar naast het opschrift van een tweetalig veld.
 *
 * Eén schakelaar per veld, maar allemaal op dezelfde toestand: wie het Engels
 * invult, doet dat meestal voor het hele formulier in één keer.
 */
function LangTabs({ value, onChange, nl }: { value: Lang; onChange: (lang: Lang) => void; nl: boolean }) {
  return (
    <span className="vtk-ef-langtabs" role="group" aria-label={nl ? 'Taal van dit veld' : 'Language of this field'}>
      <button
        type="button"
        aria-pressed={value === 'nl'}
        title={nl ? 'Nederlands' : 'Dutch'}
        onClick={() => onChange('nl')}
      >
        NL
      </button>
      <button
        type="button"
        aria-pressed={value === 'en'}
        title={nl ? 'Engels' : 'English'}
        onClick={() => onChange('en')}
      >
        EN
      </button>
    </span>
  );
}

export function EventForm({
  event,
  groups,
  categories,
  locale,
  siteDefaultImage,
  canCreateTickets = false,
  canManageCategories = false,
  canHeroWeek = false,
}: {
  event: Event;
  groups: Group[];
  categories: Category[];
  locale: 'nl' | 'en';
  /** De sitebrede standaardfoto, voor een evenement waarvan geen thema er een draagt. */
  siteDefaultImage: string;
  /**
   * Toont "Publiceren en tickets toevoegen" bij een nieuw evenement.
   * Ticketevents aanmaken is een aparte permissie, dus wie enkel mag inplannen
   * ziet die knop niet.
   */
  canCreateTickets?: boolean;
  /** Geeft bij een lege keuzelijst een rechtstreekse link naar categoriebeheer. */
  canManageCategories?: boolean;
  /**
   * Toont de keuze voor het weekoverzicht op de homepage (`calendar.heroWeek`).
   * Zonder die permissie staat het veld er niet, en negeert de action het ook.
   */
  canHeroWeek?: boolean;
}) {
  const nl = locale === 'nl';
  const base = nl ? '' : '/en';
  const isNew = !event.id;
  const isDraft = Boolean(event.id) && !event.publishedAt;
  const isPublished = Boolean(event.id) && Boolean(event.publishedAt);

  /**
   * Welke taal de tweetalige velden tonen. Beide talen blijven in het formulier
   * staan (de verborgen taal in een `hidden` blok), zodat wat je in de andere
   * taal tikte niet verdwijnt bij het wisselen en gewoon mee opgeslagen wordt.
   */
  const [activeLang, setActiveLang] = useState<Lang>('nl');

  const selected = new Set(event.categoryIds ?? []);
  const audienceCategories = categories.filter((c) => c.audience !== null);
  const themeCategories = categories.filter((c) => c.audience === null);

  /**
   * De aangevinkte thema's, enkel om de affiche-preview te laten kloppen: zonder
   * eigen foto krijgt dit evenement de standaardbanner van zijn thema, en een
   * preview die dan de sitebrede foto toont liegt. De vinkjes zelf blijven
   * ongecontroleerd; dit is een kopie, geen bron.
   */
  const [selectedThemes, setSelectedThemes] = useState<Set<string>>(
    () => new Set(themeCategories.filter((c) => selected.has(c.id)).map((c) => c.id)),
  );
  // Het thema dat wint, is het hoogste uit het categoriebeheer; `categories`
  // komt al in die volgorde binnen. Zie lib/defaultEventImage.ts.
  const fallbackTheme =
    themeCategories.find((c) => selectedThemes.has(c.id) && c.bannerUrl) ?? null;

  const secondarySubmits = [
    ...(isNew || isDraft
      ? [
          {
            name: 'publication',
            value: 'draft',
            label: nl ? 'Opslaan als concept' : 'Save as draft',
          },
        ]
      : []),
    // Een gepubliceerd evenement terug offline halen. Dezelfde waarde als
    // hierboven, maar met een bevestiging: dit haalt iets weg dat bezoekers nu
    // zien, en dat verdient een vraag.
    ...(isPublished
      ? [
          {
            name: 'publication',
            value: 'draft',
            label: nl ? 'Terug naar concept' : 'Back to draft',
            confirm: {
              title: nl ? 'Terug naar concept?' : 'Back to draft?',
              description: nl
                ? 'Het evenement verdwijnt meteen van de kalender, de homepage, de agenda-feeds en de app. De inhoud, categorieën, tickets en het formulier blijven bewaard; publiceren zet alles in één klik terug online.'
                : 'The event disappears at once from the calendar, the home page, the calendar feeds and the app. Its content, categories, tickets and form are kept; publishing puts everything back online in one click.',
              confirmLabel: nl ? 'Terug naar concept' : 'Back to draft',
              cancelLabel: nl ? 'Annuleren' : 'Cancel',
            },
          },
        ]
      : []),
    ...(canCreateTickets && isNew
      ? [
          {
            name: 'andThen',
            value: 'tickets',
            label: nl ? 'Publiceren en tickets toevoegen' : 'Publish and add tickets',
          },
        ]
      : []),
  ];

  // Wat er nog ontbreekt aan een bestaand evenement. Bij een nieuw evenement
  // staat er nog niets ingevuld en zou dit enkel een lijst rode kruisjes zijn.
  const hasDescriptionNl = Boolean(event.descriptionNl?.trim());
  const hasDescriptionEn = Boolean(event.descriptionEn?.trim());
  const hasLocation = Boolean(event.location?.trim());
  const hasImage = Boolean(event.imageKey);
  const hasCategories = (event.categoryIds?.length ?? 0) > 0;

  // Staat er iets in "Meer instellingen" dat van de standaard afwijkt, dan gaat
  // die sectie open: een externe link die dicht staat, is een link die niemand
  // ziet staan tot hij verkeerd blijkt. De URL-naam telt niet mee; elk bestaand
  // evenement heeft er een.
  const hasMoreSettings = Boolean(
    event.url ||
      event.urlLabelNl ||
      event.urlLabelEn ||
      (canHeroWeek && event.heroWeek && event.heroWeek !== 'AUTO')
  );

  const checklistItems = [
    {
      done: true,
      label: nl ? 'Titel, groep en wanneer staan ingevuld' : 'Title, group and date/time are filled in',
    },
    {
      done: hasDescriptionNl,
      label: hasDescriptionNl
        ? nl
          ? 'Beschrijving in het Nederlands ingevuld'
          : 'Dutch description filled in'
        : nl
          ? 'Nog geen Nederlandse beschrijving'
          : 'No Dutch description yet',
    },
    {
      done: hasDescriptionEn,
      label: hasDescriptionEn
        ? nl
          ? 'Beschrijving in het Engels ingevuld'
          : 'English description filled in'
        : nl
          ? 'Nog geen Engelse beschrijving; de eventpagina toont dan de Nederlandse'
          : 'No English description yet; the event page will display Dutch',
    },
    {
      done: hasLocation,
      label: hasLocation
        ? nl
          ? `Locatie ingevuld (${event.location})`
          : `Location filled in (${event.location})`
        : nl
          ? 'Nog geen locatie ingevuld'
          : 'No location filled in yet',
    },
    {
      done: hasImage,
      label: hasImage
        ? nl
          ? 'Affiche ingesteld'
          : 'Poster image set'
        : nl
          ? 'Nog geen affiche gekozen; toont voorlopig de standaardfoto'
          : 'No poster chosen yet; displays default photo for now',
    },
    {
      done: hasCategories,
      label: hasCategories
        ? nl
          ? 'Categorieën gekozen'
          : 'Categories selected'
        : nl
          ? 'Nog geen categorieën gekozen; bepaalt de kleur in de kalender'
          : 'No categories chosen yet; determines the color in the calendar',
    },
  ];
  const allReady = checklistItems.every((item) => item.done);

  return (
    <SaveForm
      action={saveEventAction}
      className="vtk-ef"
      submitLabel={
        isPublished
          ? nl
            ? 'Wijzigingen opslaan'
            : 'Save changes'
          : nl
            ? 'Publiceren'
            : 'Publish'
      }
      savingLabel={nl ? 'Bezig met opslaan...' : 'Saving...'}
      savedMessage={nl ? 'Evenement opgeslagen' : 'Event saved'}
      errorMessages={{
        ...saveErrorMessages(locale),
        SLUG_TAKEN: nl
          ? 'Niet opgeslagen: die URL-naam is al van een ander evenement of van een kalendercategorie. Kies een andere, bijvoorbeeld met het jaartal erachter.'
          : 'Not saved: that URL name already belongs to another event or to a calendar category. Pick a different one, for instance with the year after it.',
        END_BEFORE_START: nl
          ? 'Niet opgeslagen: het einde ligt voor of op de start. Een evenement met uren duurt minstens een minuut; duurt het een hele dag, vink dan "hele dag" aan.'
          : 'Not saved: the end is at or before the start. An event with hours lasts at least a minute; if it takes all day, tick "all day".',
        NO_MOMENTS: nl
          ? 'Niet opgeslagen: er staat geen enkel moment ingevuld. Voeg er één toe, of kies "Eén doorlopende periode".'
          : 'Not saved: no moment has been filled in. Add one, or pick "One continuous period".',
        INVALID_MOMENT: nl
          ? 'Niet opgeslagen: een van de momenten heeft geen geldige dag of uren. Vul bij elk moment een dag, een beginuur en een einduur in.'
          : 'Not saved: one of the moments has no valid day or times. Fill in a day, a start time and an end time for every moment.',
      }}
      fallbackErrorMessage={nl ? 'Er ging iets mis bij het opslaan.' : 'Something went wrong while saving.'}
      secondarySubmit={secondarySubmits.length > 0 ? secondarySubmits : undefined}
      header={({ submitButton, secondaryButtons, confirmDialog }) => (
        <>
          <div className="vtk-ef-head">
            <div className="vtk-ef-head-text">
              <nav className="vtk-ef-crumbs" aria-label={nl ? 'Kruimelpad' : 'Breadcrumb'}>
                <Link href={`${base}/admin/kalender`}>{nl ? 'Kalender' : 'Calendar'}</Link>
                <span aria-hidden>›</span>
                <span>
                  {isNew
                    ? nl
                      ? 'Nieuw evenement'
                      : 'New event'
                    : nl
                      ? 'Bewerken'
                      : 'Edit'}
                </span>
              </nav>
              <h1>
                {isNew
                  ? nl
                    ? 'Nieuw evenement'
                    : 'New event'
                  : (event.titleNl ?? '')}
              </h1>
            </div>
            <div className="vtk-ef-head-actions">
              <span className={`vtk-ef-pill ${isPublished ? 'is-live' : 'is-draft'}`}>
                {isPublished
                  ? nl
                    ? 'Gepubliceerd'
                    : 'Published'
                  : isDraft
                    ? nl
                      ? 'Concept'
                      : 'Draft'
                    : nl
                      ? 'Nieuw'
                      : 'New'}
              </span>
              {submitButton}
              {secondaryButtons}
            </div>
          </div>
          <p className="vtk-ef-state">
            {isPublished
              ? nl
                ? 'Zichtbaar op de kalender, de homepage, de agenda-feeds en in de app.'
                : 'Visible on the calendar, the home page, the calendar feeds and in the app.'
              : isDraft
                ? nl
                  ? 'Dit evenement staat nog nergens online. Klik op Publiceren wanneer het klaar is.'
                  : 'This event is not online anywhere yet. Click Publish when it is ready.'
                : nl
                  ? 'Nog niets staat online. Publiceren zet het meteen op de kalender; opslaan als concept houdt het voor jezelf.'
                  : 'Nothing is online yet. Publishing puts it on the calendar at once; saving as a draft keeps it to yourself.'}
          </p>
          {confirmDialog}
        </>
      )}
    >
      {event.id ? <input type="hidden" name="id" value={event.id} /> : null}

      {event.id ? (
        <div className={`vtk-ef-todo ${allReady ? 'is-done' : ''}`}>
          <h2>
            {allReady
              ? nl
                ? 'Alles klaar om te publiceren'
                : 'Ready to publish'
              : nl
                ? 'Klaar om te publiceren?'
                : 'Ready to publish?'}
          </h2>
          <ul>
            {checklistItems.map((item, index) => (
              <li key={index} className={item.done ? 'is-ok' : 'is-missing'}>
                <span className="mark" aria-hidden>
                  {item.done ? '✓' : '!'}
                </span>
                <span>{item.label}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <Section
        title={nl ? 'Het evenement' : 'The event'}
        note={
          nl
            ? 'De naam zoals bezoekers hem zien, en wie het beheert.'
            : 'The name visitors see, and who manages it.'
        }
      >
        <div className="space-y-4">
          <div>
            <div className="vtk-ef-field-head">
              <Label htmlFor={`event-title-${activeLang}`}>
                {activeLang === 'nl'
                  ? nl
                    ? 'Titel (NL)'
                    : 'Title (NL)'
                  : nl
                    ? 'Titel (EN)'
                    : 'Title (EN)'}
              </Label>
              <LangTabs value={activeLang} onChange={setActiveLang} nl={nl} />
            </div>
            {/* Beide talen blijven staan; de verborgene stuurt zijn waarde mee.
                `required` hangt aan de zichtbare taal: een verplicht veld in een
                `display: none` blok kan de browser niet aanwijzen, en dan gebeurt
                er bij het verzenden helemaal niets. */}
            <div className={activeLang === 'nl' ? undefined : 'hidden'}>
              <Input
                id="event-title-nl"
                name="titleNl"
                defaultValue={event.titleNl ?? ''}
                placeholder={nl ? 'bv. Galabal 2026' : 'e.g. Gala 2026'}
                required={activeLang === 'nl'}
              />
            </div>
            <div className={activeLang === 'en' ? undefined : 'hidden'}>
              <Input
                id="event-title-en"
                name="titleEn"
                defaultValue={event.titleEn ?? ''}
                placeholder={nl ? 'Leeg = de Nederlandse titel' : 'Empty = the Dutch title'}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="event-group">{nl ? 'Groep' : 'Group'}</Label>
              <Select id="event-group" name="groupId" defaultValue={event.groupId ?? ''} required>
                <option value="" disabled>
                  {nl ? 'Kies een groep' : 'Choose a group'}
                </option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {nl ? g.nameNl : g.nameEn}
                  </option>
                ))}
              </Select>
              <p className="vtk-ef-hint">
                {nl ? 'Bepaalt wie het mag bewerken.' : 'Decides who may edit it.'}
              </p>
            </div>
            {/* De groep hierboven bepaalt wie mag bewerken; deze naam bepaalt wie
                er als organisator getoond wordt. Twee verschillende vragen, dus
                twee velden: bij een crossover of een gekocht evenement beheert de
                groep het wel, maar organiseert ze het niet. */}
            <div>
              <Label htmlFor="event-organiser">
                {nl ? 'Getoond als organisator' : 'Shown as organiser'}
              </Label>
              <Input
                id="event-organiser"
                name="organiserName"
                defaultValue={event.organiserName ?? ''}
                maxLength={120}
                placeholder={nl ? 'bv. Development x GHC' : 'e.g. Development x GHC'}
              />
              <p className="vtk-ef-hint">
                {nl
                  ? 'Enkel bij een crossover; leeg = de groep zelf.'
                  : 'Only for a crossover; empty = the group itself.'}
              </p>
            </div>
          </div>
        </div>
      </Section>

      <Section
        title={nl ? 'Wanneer en waar' : 'When and where'}
        note={
          nl
            ? 'Loopt het door van begin tot einde, of zijn het losse momenten op meerdere dagen?'
            : 'Does it run through from start to end, or are they separate moments on several days?'
        }
      >
        <EventWhenField
          start={event.start}
          end={event.end}
          allDay={event.allDay}
          moments={event.moments ?? []}
          locale={locale}
        />

        <hr className="vtk-ef-rule" />

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:items-start">
          <div>
            <Label htmlFor="event-location">{nl ? 'Locatie' : 'Location'}</Label>
            <Input
              id="event-location"
              name="location"
              defaultValue={event.location ?? ''}
              placeholder={nl ? 'bv. Aula Pieter De Somer' : 'e.g. Pieter De Somer Auditorium'}
            />
          </div>
          {/* E1: hiermee verschijnt dit evenement ook op logistiek.vtk.be, zodat
              materiaal, flesserke en transport eronder gegroepeerd kunnen worden.
              Standaard aan bij een nieuw evenement; wie het uitlaat, krijgt daar
              niets. Uitzetten koppelt niets los, want er kunnen al aanvragen aan
              hangen. */}
          <label className="vtk-ef-check">
            <input
              type="checkbox"
              name="needsLogistics"
              defaultChecked={event.id ? (event.hasUitleenEvent ?? false) : true}
            />
            <span>
              <b>{nl ? 'Logistiek nodig' : 'Needs logistics'}</b>
              <small>
                {nl
                  ? event.hasUitleenEvent
                    ? 'Dit evenement staat op logistiek.vtk.be; naam, locatie en uren volgen hier mee. Het vinkje weghalen laat het daar staan, want er kunnen al aanvragen aan hangen.'
                    : 'Zet dit evenement ook op logistiek.vtk.be, zodat materiaal, flesserke en transport eronder samen komen te staan.'
                  : event.hasUitleenEvent
                    ? 'This event exists on logistiek.vtk.be; its name, location and times follow this one. Unticking leaves it there, since requests may already be attached.'
                    : 'Also put this event on logistiek.vtk.be, so equipment, drinks and transport end up together.'}
              </small>
            </span>
          </label>
        </div>
      </Section>

      <Section
        title={nl ? 'Beschrijving' : 'Description'}
        note={
          nl
            ? 'Wat er op de eventpagina komt te staan. Laat je het Engels leeg, dan toont de site daar de Nederlandse tekst.'
            : 'What appears on the event page. Leave the English text empty and the site shows the Dutch one there.'
        }
      >
        <div className="vtk-ef-field-head">
          <Label htmlFor={activeLang === 'nl' ? 'calendar-description-nl' : 'calendar-description-en'}>
            {activeLang === 'nl'
              ? nl
                ? 'Tekst (NL)'
                : 'Text (NL)'
              : nl
                ? 'Tekst (EN)'
                : 'Text (EN)'}
          </Label>
          <LangTabs value={activeLang} onChange={setActiveLang} nl={nl} />
        </div>
        <div className={activeLang === 'nl' ? undefined : 'hidden'}>
          <MarkdownEditorField
            name="descriptionNl"
            defaultValue={event.descriptionNl}
            locale={locale}
            rows={8}
            textareaId="calendar-description-nl"
          />
        </div>
        <div className={activeLang === 'en' ? undefined : 'hidden'}>
          <MarkdownEditorField
            name="descriptionEn"
            defaultValue={event.descriptionEn}
            locale={locale}
            rows={8}
            textareaId="calendar-description-en"
          />
        </div>
      </Section>

      <Section
        title={nl ? 'Affiche' : 'Poster'}
        note={
          nl
            ? 'De foto op de kalenderkaart, de eventpagina en de homepage.'
            : 'The photo on the calendar card, the event page and the home page.'
        }
      >
        <EventImageField
          defaultKey={event.imageKey}
          defaultFocus={toImageFocus(event.imageFocusX, event.imageFocusY)}
          locale={locale}
          fallbackUrl={fallbackTheme?.bannerUrl ?? siteDefaultImage}
          fallbackHint={
            fallbackTheme
              ? `${nl ? 'Standaardfoto' : 'Default photo'} ${nl ? fallbackTheme.nameNl : fallbackTheme.nameEn}`
              : nl
                ? 'Sitebrede standaardfoto'
                : 'Site-wide default photo'
          }
        />
      </Section>

      {/* Twee assen, bewust apart gezet. De doelgroep bepaalt wie het event
          vanzelf in zijn kalender krijgt; het thema is enkel een filter en een
          kleur. Ze staan in dezelfde koppeltabel, vandaar dezelfde `name`. */}
      <Section
        title={nl ? 'Doelgroep en thema' : 'Audience and theme'}
        note={
          nl
            ? 'De doelgroep verbergt niets: ze laat leden filteren en hun kalender op hun profiel afstemmen. Het thema bepaalt de kleur in de kalender, de filterknop en de agenda-feed per categorie.'
            : 'The audience hides nothing: it lets members filter and tailor the calendar to their profile. The theme sets the colour in the calendar, the filter button and the per-category calendar feed.'
        }
      >
        <div className="space-y-4">
          <div>
            <Label>{nl ? 'Doelgroep' : 'Audience'}</Label>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {audienceCategories.length > 0 ? (
                audienceCategories.map((c) => (
                  <CategoryCheckbox key={c.id} category={c} checked={selected.has(c.id)} nl={nl} />
                ))
              ) : (
                <EmptyCategoryMessage audience nl={nl} canManageCategories={canManageCategories} base={base} />
              )}
            </div>
            <p className="vtk-ef-hint">
              {nl ? 'Leeg = een algemeen event, voor iedereen.' : 'Empty = a general event, for everyone.'}
            </p>
          </div>

          <div>
            <Label>{nl ? 'Thema' : 'Theme'}</Label>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {themeCategories.length > 0 ? (
                themeCategories.map((c) => (
                  <CategoryCheckbox
                    key={c.id}
                    category={c}
                    checked={selected.has(c.id)}
                    nl={nl}
                    onToggle={(on) =>
                      setSelectedThemes((prev) => {
                        const next = new Set(prev);
                        if (on) next.add(c.id);
                        else next.delete(c.id);
                        return next;
                      })
                    }
                  />
                ))
              ) : (
                <EmptyCategoryMessage
                  audience={false}
                  nl={nl}
                  canManageCategories={canManageCategories}
                  base={base}
                />
              )}
            </div>
            {fallbackTheme && !event.imageKey ? (
              <p className="vtk-ef-hint">
                {nl
                  ? `Zonder eigen affiche krijgt dit evenement de standaardbanner van ${fallbackTheme.nameNl}.`
                  : `Without its own poster this event gets the default banner of ${fallbackTheme.nameEn}.`}
              </p>
            ) : null}
          </div>
        </div>
      </Section>

      {/* De rest is per evenement zelden nodig: de URL-naam ontstaat vanzelf uit
          de titel, de meeste events hebben geen externe link, en het
          weekoverzicht staat goed op automatisch. Dicht dus, maar wel op het
          scherm zelf en niet op een tweede tabblad. */}
      <details className="vtk-ef-more" open={hasMoreSettings}>
        <summary>
          <span>
            <b>{nl ? 'Meer instellingen' : 'More settings'}</b>
            <small>
              {nl
                ? `URL-naam, externe link en knoptekst${canHeroWeek ? ', weekoverzicht op de homepage' : ''}`
                : `URL name, external link and button text${canHeroWeek ? ', week overview on the home page' : ''}`}
            </small>
          </span>
          <span className="chev" aria-hidden>
            ⌄
          </span>
        </summary>

        <div className="vtk-ef-more-body">
          <div>
            <Label htmlFor="event-slug">{nl ? 'URL-naam' : 'URL name'}</Label>
            <div className="flex items-center gap-2">
              <span className="shrink-0 text-sm text-vtk-muted">/kalender/</span>
              <Input
                id="event-slug"
                name="slug"
                defaultValue={event.slug ?? ''}
                maxLength={80}
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
                placeholder={nl ? 'galabal-2026 (leeg = uit de titel)' : 'galabal-2026 (empty = from the title)'}
              />
            </div>
            <p className="vtk-ef-hint">
              {event.slug
                ? nl
                  ? 'Dit staat in de link die leden delen en in hun agenda. Wijzig je hem, dan werkt de oude naam niet meer; het oude adres met de lange code blijft wel doorsturen.'
                  : 'This is in the link members share and in their calendar. Changing it breaks the old name; the old address with the long code keeps redirecting.'
                : nl
                  ? 'Laat leeg om hem uit de titel en het jaartal te maken, bijvoorbeeld galabal-2026.'
                  : 'Leave empty to build it from the title and the year, for example galabal-2026.'}
            </p>
          </div>

          {/* De knoptekst hoort bij de link en staat er dus onder: leeg blijven
              is de normale toestand, en wie de link invult, ziet meteen dat hij
              ze een naam kan geven. */}
          <div>
            <Label htmlFor="event-url">{nl ? 'Externe link' : 'External link'}</Label>
            <Input id="event-url" name="url" defaultValue={event.url ?? ''} placeholder="https://..." />
            <div className="mt-3">
              <div className="vtk-ef-field-head">
                <Label htmlFor={activeLang === 'nl' ? 'event-url-label-nl' : 'event-url-label-en'}>
                  {activeLang === 'nl'
                    ? nl
                      ? 'Knoptekst (NL)'
                      : 'Button text (NL)'
                    : nl
                      ? 'Knoptekst (EN)'
                      : 'Button text (EN)'}
                </Label>
                <LangTabs value={activeLang} onChange={setActiveLang} nl={nl} />
              </div>
              <div className={activeLang === 'nl' ? undefined : 'hidden'}>
                <Input
                  id="event-url-label-nl"
                  name="urlLabelNl"
                  defaultValue={event.urlLabelNl ?? ''}
                  maxLength={EVENT_LINK_LABEL_MAX}
                  placeholder={DEFAULT_EVENT_LINK_LABEL.nl}
                />
              </div>
              <div className={activeLang === 'en' ? undefined : 'hidden'}>
                <Input
                  id="event-url-label-en"
                  name="urlLabelEn"
                  defaultValue={event.urlLabelEn ?? ''}
                  maxLength={EVENT_LINK_LABEL_MAX}
                  placeholder={DEFAULT_EVENT_LINK_LABEL.en}
                />
              </div>
              <p className="vtk-ef-hint">
                {nl
                  ? 'Laat leeg voor "Externe eventlink". Gaat de link naar de inschrijvingen of de ticketverkoop van iemand anders, zet er dan "Inschrijflink" of "Ticketverkoop": dat scheelt of iemand klikt. De Engelse tekst valt terug op de Nederlandse.'
                  : 'Leave empty for "External event link". If the link goes to someone else’s sign-up form or ticket sales, write "Sign-up link" or "Tickets": that decides whether people click. The English text falls back to the Dutch one.'}
              </p>
            </div>
          </div>

          {canHeroWeek ? (
            <div>
              <Label htmlFor="heroWeek">
                {nl ? 'Weekoverzicht op de homepage' : 'Week overview on the home page'}
              </Label>
              <Select id="heroWeek" name="heroWeek" defaultValue={event.heroWeek ?? 'AUTO'}>
                <option value="AUTO">{nl ? 'Automatisch' : 'Automatic'}</option>
                <option value="PINNED">{nl ? 'Voorrang geven' : 'Give priority'}</option>
                <option value="HIDDEN">{nl ? 'Niet tonen' : 'Do not show'}</option>
              </Select>
              <p className="vtk-ef-hint">
                {nl
                  ? 'Het overzicht toont hoogstens drie evenementen per dag en tien in totaal. Voorrang zet dit evenement vooraan op zijn dag; niet tonen houdt het van de homepage zonder het uit de kalender te halen.'
                  : 'The overview shows at most three events per day and ten in total. Priority puts this event first on its day; do not show keeps it off the home page without removing it from the calendar.'}
              </p>
            </div>
          ) : null}
        </div>
      </details>
    </SaveForm>
  );
}
