'use client';

import { useState } from 'react';
import Link from 'next/link';
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
};

/** Eén aanvinkbare categorie; doelgroep en thema gebruiken dezelfde `name`. */
function CategoryCheckbox({ category, checked, nl }: { category: Category; checked: boolean; nl: boolean }) {
  return (
    <label className="inline-flex items-center gap-2 text-sm">
      <input type="checkbox" name="categoryIds" value={category.id} defaultChecked={checked} />
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

export function EventForm({
  event,
  groups,
  categories,
  locale,
  canCreateTickets = false,
  canManageCategories = false,
  canHeroWeek = false,
}: {
  event: Event;
  groups: Group[];
  categories: Category[];
  locale: 'nl' | 'en';
  /**
   * Toont "Aanmaken en tickets toevoegen" bij een nieuw evenement. Ticketevents
   * aanmaken is een aparte permissie, dus wie enkel mag inplannen ziet die knop
   * niet.
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

  const [activeLang, setActiveLang] = useState<'nl' | 'en'>('nl');

  const selected = new Set(event.categoryIds ?? []);
  const audienceCategories = categories.filter((c) => c.audience !== null);
  const themeCategories = categories.filter((c) => c.audience === null);

  const secondarySubmits = [
    ...(isDraft
      ? [
          {
            name: 'publication',
            value: 'draft',
            label: nl ? 'Opslaan als concept' : 'Save as draft',
          },
        ]
      : []),
    // Een gepubliceerd evenement terug offline halen. Dezelfde knop en dezelfde
    // waarde als hierboven, maar met een andere naam en een bevestiging: dit
    // haalt iets weg dat bezoekers nu zien, en dat verdient een vraag.
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
            label: nl ? 'Aanmaken en tickets toevoegen' : 'Create and add tickets',
          },
        ]
      : []),
  ];

  // Checklist voor het bewerkscherm: wat is er al ingevuld en wat ontbreekt nog.
  const hasDescriptionNl = Boolean(event.descriptionNl?.trim());
  const hasDescriptionEn = Boolean(event.descriptionEn?.trim());
  const hasLocation = Boolean(event.location?.trim());
  const hasImage = Boolean(event.imageKey);
  const hasCategories = (event.categoryIds?.length ?? 0) > 0;

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
      className="space-y-6"
      submitLabel={
        isNew
          ? nl
            ? 'Aanmaken en verder'
            : 'Create and continue'
          : isDraft
            ? nl
              ? 'Publiceren'
              : 'Publish'
            : nl
              ? 'Wijzigingen opslaan'
              : 'Save changes'
      }
      savingLabel={
        isNew
          ? nl
            ? 'Bezig met aanmaken...'
            : 'Creating...'
          : nl
            ? 'Bezig met opslaan...'
            : 'Saving...'
      }
      savedMessage={nl ? 'Evenement opgeslagen' : 'Event saved'}
      errorMessages={{
        ...saveErrorMessages(locale),
        SLUG_TAKEN: nl
          ? 'Niet opgeslagen: die URL-naam is al van een ander evenement of van een kalendercategorie. Kies een andere, bijvoorbeeld met het jaartal erachter.'
          : 'Not saved: that URL name already belongs to another event or to a calendar category. Pick a different one, for instance with the year after it.',
        END_BEFORE_START: nl
          ? 'Niet opgeslagen: het einde ligt voor de start. Kies een einde na de startdatum.'
          : 'Not saved: the end is before the start. Pick an end after the start date.',
        NO_MOMENTS: nl
          ? 'Niet opgeslagen: er staat geen enkel moment ingevuld. Voeg er één toe, of kies "Eén doorlopende periode".'
          : 'Not saved: no moment has been filled in. Add one, or pick "One continuous period".',
        INVALID_MOMENT: nl
          ? 'Niet opgeslagen: een van de momenten heeft geen geldige dag of uren. Vul bij elk moment een dag, een beginuur en een einduur in.'
          : 'Not saved: one of the moments has no valid day or times. Fill in a day, a start time and an end time for every moment.',
      }}
      fallbackErrorMessage={nl ? 'Er ging iets mis bij het opslaan.' : 'Something went wrong while saving.'}
      secondarySubmit={secondarySubmits.length > 0 ? secondarySubmits : undefined}
      footer={({ submitButton, secondaryButtons, confirmDialog }) => (
        <>
          <div className="stickybar">
            <span className="state">
              {isNew ? (
                <>
                  <span className="pill draft">{nl ? 'Nieuw' : 'New'}</span>
                  <span>
                    {nl
                      ? 'Dit maakt een concept. Niets staat online tot je publiceert.'
                      : 'This creates a draft. Nothing is online until you publish.'}
                  </span>
                </>
              ) : isDraft ? (
                <>
                  <span className="pill draft">{nl ? 'Concept' : 'Draft'}</span>
                  <span>
                    {nl
                      ? 'Nog niet zichtbaar op de site. Klik op Publiceren wanneer het klaar is.'
                      : 'Not visible online yet. Click Publish when ready.'}
                  </span>
                </>
              ) : (
                <>
                  <span className="pill live">{nl ? 'Gepubliceerd' : 'Published'}</span>
                  <span>
                    {nl
                      ? 'Zichtbaar op de kalender, de homepage en in de app.'
                      : 'Visible on the calendar, home page and in the app.'}
                  </span>
                </>
              )}
            </span>
            <div className="flex items-center gap-3">
              {submitButton}
              {secondaryButtons}
              <Link
                href={`${base}/admin/kalender`}
                className="inline-flex h-9 items-center justify-center rounded-xl px-3 text-sm font-medium text-vtk-muted transition-colors hover:text-vtk-ink"
              >
                {isNew ? (nl ? 'Annuleren' : 'Cancel') : nl ? 'Terug naar overzicht' : 'Back to overview'}
              </Link>
            </div>
          </div>
          {confirmDialog}
        </>
      )}
    >
      {/* ----------------- NIEUW EVENEMENT (Optie C: stap 1) ----------------- */}
      {isNew ? (
        <>
          <input type="hidden" name="publication" value="draft" />

          <div className="step-head">
            <b>{nl ? 'Stap 1 van 2' : 'Step 1 of 2'}</b> ·{' '}
            {nl
              ? 'het evenement bestaat, de rest vul je erna aan'
              : 'the event exists, the rest you fill in afterwards'}
            <span className="bar">
              <i />
            </span>
          </div>

          {/* 1. Titel */}
          <Card className="p-5 space-y-4">
            <div className="sec-title">
              <h2>{nl ? 'Titel' : 'Title'}</h2>
            </div>
            <p className="sec-note">
              {nl
                ? 'De naam zoals hij op de kalender staat.'
                : 'The name as it appears on the calendar.'}
            </p>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <Label htmlFor="new-event-title-nl">
                  {activeLang === 'nl' ? 'Titel (NL)' : 'Title (EN)'}
                  <span className="langtabs">
                    <button
                      type="button"
                      aria-pressed={activeLang === 'nl'}
                      onClick={() => setActiveLang('nl')}
                    >
                      NL
                    </button>
                    <button
                      type="button"
                      aria-pressed={activeLang === 'en'}
                      onClick={() => setActiveLang('en')}
                    >
                      EN
                    </button>
                  </span>
                </Label>
              </div>
              <div className={activeLang === 'nl' ? 'block' : 'hidden'}>
                <Input
                  id="new-event-title-nl"
                  name="titleNl"
                  defaultValue=""
                  placeholder={nl ? 'bv. Galabal 2026' : 'e.g. Gala 2026'}
                  required
                />
              </div>
              <div className={activeLang === 'en' ? 'block' : 'hidden'}>
                <Input
                  name="titleEn"
                  defaultValue=""
                  placeholder={nl ? 'bv. Gala 2026 (Engelse titel)' : 'e.g. Gala 2026 (English title)'}
                />
              </div>
            </div>
          </Card>

          {/* 2. Wie en waar */}
          <Card className="p-5 space-y-4">
            <div className="sec-title">
              <h2>{nl ? 'Wie en waar' : 'Who and where'}</h2>
            </div>
            <p className="sec-note">
              {nl
                ? 'De groep bepaalt wie het mag bewerken. De organisator is wie er op de site bij staat.'
                : 'The group decides who can edit it. The organiser is what appears on the site.'}
            </p>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <Label>{nl ? 'Groep' : 'Group'}</Label>
                <Select name="groupId" defaultValue="" required>
                  <option value="" disabled>
                    {nl ? 'Kies een groep' : 'Choose a group'}
                  </option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {nl ? g.nameNl : g.nameEn}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="new-event-organiser">
                  {nl ? 'Organisator (optioneel)' : 'Organiser (optional)'}
                </Label>
                <Input
                  id="new-event-organiser"
                  name="organiserName"
                  defaultValue=""
                  maxLength={120}
                  placeholder={nl ? 'bv. Development x GHC' : 'e.g. Development x GHC'}
                />
                <p className="mt-1 text-xs text-vtk-muted">
                  {nl ? 'Laat leeg wanneer de post zelf organiseert.' : 'Leave empty when the post organises it.'}
                </p>
              </div>
              <div className="md:col-span-2">
                <Label>{nl ? 'Locatie' : 'Location'}</Label>
                <Input
                  name="location"
                  defaultValue=""
                  placeholder={nl ? 'bv. Aula Pieter De Somer' : 'e.g. Pieter De Somer Auditorium'}
                />
              </div>
            </div>
          </Card>

          {/* 3. Wanneer */}
          <Card className="p-5 space-y-4">
            <div className="sec-title">
              <h2>{nl ? 'Wanneer' : 'When'}</h2>
            </div>
            <p className="sec-note">
              {nl
                ? 'Eén doorlopende periode, of een reeks losse momenten zoals een loopweek met elke dag een loopje.'
                : 'One continuous period, or a series of separate moments such as a running week.'}
            </p>
            <EventWhenField moments={[]} locale={locale} />
          </Card>

          {/* 4. Logistiek */}
          <Card className="p-5 space-y-4">
            <div className="sec-title">
              <h2>{nl ? 'Logistiek' : 'Logistics'}</h2>
            </div>
            <label className="inline-flex items-start gap-2 text-sm">
              <input type="checkbox" name="needsLogistics" defaultChecked className="mt-1" />
              <span>
                {nl ? 'Logistiek nodig' : 'Needs logistics'}
                <span className="mt-0.5 block text-xs text-vtk-muted">
                  {nl
                    ? 'Dit evenement staat op logistiek.vtk.be; naam, locatie en uren volgen hier mee.'
                    : 'This event will appear on logistiek.vtk.be; its name, location and times follow this one.'}
                </span>
              </span>
            </label>
          </Card>
        </>
      ) : (
        /* ----------------- EVENEMENT BEWERKEN (Optie A) ----------------- */
        <>
          <input type="hidden" name="id" value={event.id} />

          {/* Checklist bovenaan */}
          <div className={`todo-card ${allReady ? 'all-done' : ''}`}>
            <h2>
              {allReady
                ? nl
                  ? 'Alles klaar om te publiceren'
                  : 'Ready to publish'
                : nl
                  ? 'Klaar om te publiceren?'
                  : 'Ready to publish?'}
            </h2>
            <ul className="todo-list">
              {checklistItems.map((item, idx) => (
                <li key={idx} className={item.done ? 'done' : 'miss'}>
                  <span className="mark" aria-hidden>
                    {item.done ? '✓' : '!'}
                  </span>
                  <span>{item.label}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* 1. Titel en adres */}
          <Card className="p-5 space-y-4">
            <div className="sec-title">
              <h2>{nl ? 'Titel en adres' : 'Title and address'}</h2>
            </div>
            <p className="sec-note">
              {nl
                ? 'De naam zoals hij op de kalender staat, en het adres dat leden delen.'
                : 'The name as it appears on the calendar, and the address members share.'}
            </p>
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <Label htmlFor="event-title-nl">
                    {activeLang === 'nl' ? 'Titel (NL)' : 'Title (EN)'}
                    <span className="langtabs">
                      <button
                        type="button"
                        aria-pressed={activeLang === 'nl'}
                        onClick={() => setActiveLang('nl')}
                      >
                        NL
                      </button>
                      <button
                        type="button"
                        aria-pressed={activeLang === 'en'}
                        onClick={() => setActiveLang('en')}
                      >
                        EN
                      </button>
                    </span>
                  </Label>
                </div>
                <div className={activeLang === 'nl' ? 'block' : 'hidden'}>
                  <Input
                    id="event-title-nl"
                    name="titleNl"
                    defaultValue={event.titleNl ?? ''}
                    placeholder={nl ? 'Galabal 2026' : 'Gala 2026'}
                    required
                  />
                </div>
                <div className={activeLang === 'en' ? 'block' : 'hidden'}>
                  <Input
                    name="titleEn"
                    defaultValue={event.titleEn ?? ''}
                    placeholder={nl ? 'Gala 2026 (Engelse titel)' : 'Gala 2026 (English title)'}
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="event-slug">{nl ? 'URL-naam' : 'URL name'}</Label>
                <div className="flex items-center gap-2">
                  <span className="shrink-0 text-sm text-vtk-blue-muted">/kalender/</span>
                  <Input
                    id="event-slug"
                    name="slug"
                    defaultValue={event.slug ?? ''}
                    maxLength={80}
                    pattern="[a-z0-9]+(-[a-z0-9]+)*"
                    placeholder={nl ? 'galabal-2026 (leeg = uit de titel)' : 'galabal-2026 (empty = from the title)'}
                  />
                </div>
                <p className="mt-1 text-xs text-vtk-muted">
                  {event.slug
                    ? nl
                      ? 'Dit staat in de link die leden delen en in hun agenda. Wijzig je hem, dan werkt de oude naam niet meer; het oude adres met de lange code blijft wel doorsturen.'
                      : 'This is in the link members share and in their calendar. Changing it breaks the old name; the old address with the long code keeps redirecting.'
                    : nl
                      ? 'Laat leeg om hem uit de titel en het jaartal te maken, bijvoorbeeld galabal-2026.'
                      : 'Leave empty to build it from the title and the year, for example galabal-2026.'}
                </p>
              </div>
            </div>
          </Card>

          {/* 2. Wie en waar */}
          <Card className="p-5 space-y-4">
            <div className="sec-title">
              <h2>{nl ? 'Wie en waar' : 'Who and where'}</h2>
            </div>
            <p className="sec-note">
              {nl
                ? 'De groep bepaalt wie het mag bewerken. De organisator is wie er op de site bij staat.'
                : 'The group decides who can edit it. The organiser is what appears on the site.'}
            </p>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <Label>{nl ? 'Groep' : 'Group'}</Label>
                <Select name="groupId" defaultValue={event.groupId ?? ''} required>
                  <option value="" disabled>
                    {nl ? 'Kies een groep' : 'Choose a group'}
                  </option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {nl ? g.nameNl : g.nameEn}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="event-organiser">
                  {nl ? 'Organisator (optioneel)' : 'Organiser (optional)'}
                </Label>
                <Input
                  id="event-organiser"
                  name="organiserName"
                  defaultValue={event.organiserName ?? ''}
                  maxLength={120}
                  placeholder={nl ? 'bv. Development x GHC' : 'e.g. Development x GHC'}
                />
                <p className="mt-1 text-xs text-vtk-muted">
                  {nl ? 'Laat leeg wanneer de post zelf organiseert.' : 'Leave empty when the post organises it.'}
                </p>
              </div>
              <div className="md:col-span-2">
                <Label>{nl ? 'Locatie' : 'Location'}</Label>
                <Input
                  name="location"
                  defaultValue={event.location ?? ''}
                  placeholder={nl ? 'bv. Aula Pieter De Somer' : 'e.g. Pieter De Somer Auditorium'}
                />
              </div>
            </div>
          </Card>

          {/* 3. Wanneer */}
          <Card className="p-5 space-y-4">
            <div className="sec-title">
              <h2>{nl ? 'Wanneer' : 'When'}</h2>
            </div>
            <p className="sec-note">
              {nl
                ? 'Eén doorlopende periode, of een reeks losse momenten zoals een loopweek met elke dag een loopje.'
                : 'One continuous period, or a series of separate moments such as a running week.'}
            </p>
            <EventWhenField
              start={event.start}
              end={event.end}
              allDay={event.allDay}
              moments={event.moments ?? []}
              locale={locale}
            />
          </Card>

          {/* 4. Beschrijving */}
          <Card className="p-5 space-y-4">
            <div className="sec-title">
              <h2>{nl ? 'Beschrijving' : 'Description'}</h2>
            </div>
            <p className="sec-note">
              {nl
                ? 'Wat er op de eventpagina komt te staan. Markdown; de Engelse tekst valt niet terug op de Nederlandse.'
                : 'What appears on the event page. Markdown; English text does not fall back to Dutch.'}
            </p>
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label htmlFor={activeLang === 'nl' ? 'calendar-description-nl' : 'calendar-description-en'}>
                  {activeLang === 'nl' ? 'Beschrijving (NL)' : 'Description (EN)'}
                  <span className="langtabs">
                    <button
                      type="button"
                      aria-pressed={activeLang === 'nl'}
                      onClick={() => setActiveLang('nl')}
                    >
                      NL
                    </button>
                    <button
                      type="button"
                      aria-pressed={activeLang === 'en'}
                      onClick={() => setActiveLang('en')}
                    >
                      EN
                    </button>
                  </span>
                </Label>
              </div>
              <div className={activeLang === 'nl' ? 'block' : 'hidden'}>
                <MarkdownEditorField
                  name="descriptionNl"
                  defaultValue={event.descriptionNl}
                  locale={locale}
                  rows={8}
                  textareaId="calendar-description-nl"
                />
              </div>
              <div className={activeLang === 'en' ? 'block' : 'hidden'}>
                <MarkdownEditorField
                  name="descriptionEn"
                  defaultValue={event.descriptionEn}
                  locale={locale}
                  rows={8}
                  textareaId="calendar-description-en"
                />
              </div>
            </div>
          </Card>

          {/* 5. Affiche */}
          <Card className="p-5 space-y-4">
            <div className="sec-title">
              <h2>{nl ? 'Affiche' : 'Poster'}</h2>
            </div>
            <p className="sec-note">
              {nl
                ? 'De foto op de kaart, de eventpagina en de homepage. Neem de originele affiche van minstens 1600 px breed.'
                : 'The photo on the card, event page and homepage. Use the original poster of at least 1600 px wide.'}
            </p>
            <EventImageField
              defaultKey={event.imageKey}
              defaultFocus={toImageFocus(event.imageFocusX, event.imageFocusY)}
              locale={locale}
            />
          </Card>

          {/* 6. Doelgroep en categorieën */}
          <Card className="p-5 space-y-4">
            <div className="sec-title">
              <h2>{nl ? 'Doelgroep en categorieën' : 'Audience and categories'}</h2>
            </div>
            <p className="sec-note">
              {nl
                ? 'De doelgroep bepaalt wie het vanzelf in zijn kalender krijgt; het thema bepaalt de kleur en de filterknop.'
                : 'The audience determines who sees it automatically in their calendar; the theme determines colour and filter button.'}
            </p>

            <div className="space-y-4">
              <div>
                <Label>{nl ? 'Doelgroep' : 'Audience'}</Label>
                <p className="mb-2 text-xs text-vtk-muted">
                  {nl
                    ? 'Laat leeg voor een algemeen event. Met een doelgroep blijft het event voor iedereen zichtbaar, maar bezoekers kunnen erop filteren of hun kalender op hun profiel afstemmen.'
                    : 'Leave empty for a general event. With a target audience it remains visible to everyone, while visitors can filter by it or tailor the calendar to their profile.'}
                </p>
                <div className="flex flex-wrap gap-x-5 gap-y-2">
                  {audienceCategories.length > 0 ? (
                    audienceCategories.map((c) => (
                      <CategoryCheckbox key={c.id} category={c} checked={selected.has(c.id)} nl={nl} />
                    ))
                  ) : (
                    <EmptyCategoryMessage audience nl={nl} canManageCategories={canManageCategories} base={base} />
                  )}
                </div>
              </div>

              <div>
                <Label>{nl ? 'Categorieën' : 'Categories'}</Label>
                <p className="mb-2 text-xs text-vtk-muted">
                  {nl
                    ? 'Het thema van het event. Bepaalt de kleur in de kalender, de filterknop en de agenda-feed per categorie.'
                    : "The event's theme. Determines its colour in the calendar, the filter button and the per-category calendar feed."}
                </p>
                <div className="flex flex-wrap gap-x-5 gap-y-2">
                  {themeCategories.length > 0 ? (
                    themeCategories.map((c) => (
                      <CategoryCheckbox key={c.id} category={c} checked={selected.has(c.id)} nl={nl} />
                    ))
                  ) : (
                    <EmptyCategoryMessage audience={false} nl={nl} canManageCategories={canManageCategories} base={base} />
                  )}
                </div>
              </div>
            </div>
          </Card>

          {/* 7. Link en homepage */}
          <Card className="p-5 space-y-4">
            <div className="sec-title">
              <h2>{nl ? 'Link en homepage' : 'Link and home page'}</h2>
            </div>
            <p className="sec-note">
              {nl
                ? 'Een externe inschrijflink, en wat dit evenement in het weekoverzicht van de homepage doet.'
                : 'An external registration link, and what this event does in the home page week overview.'}
            </p>

            <div className="space-y-4">
              <div>
                <Label htmlFor="event-url">URL</Label>
                <Input id="event-url" name="url" defaultValue={event.url ?? ''} placeholder="https://..." />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <Label htmlFor={activeLang === 'nl' ? 'event-url-label-nl' : 'event-url-label-en'}>
                    {activeLang === 'nl'
                      ? nl
                        ? 'Knoptekst (NL)'
                        : 'Button text (NL)'
                      : nl
                        ? 'Knoptekst (EN)'
                        : 'Button text (EN)'}
                    <span className="langtabs">
                      <button
                        type="button"
                        aria-pressed={activeLang === 'nl'}
                        onClick={() => setActiveLang('nl')}
                      >
                        NL
                      </button>
                      <button
                        type="button"
                        aria-pressed={activeLang === 'en'}
                        onClick={() => setActiveLang('en')}
                      >
                        EN
                      </button>
                    </span>
                  </Label>
                </div>
                <div className={activeLang === 'nl' ? 'block' : 'hidden'}>
                  <Input
                    id="event-url-label-nl"
                    name="urlLabelNl"
                    defaultValue={event.urlLabelNl ?? ''}
                    maxLength={EVENT_LINK_LABEL_MAX}
                    placeholder={DEFAULT_EVENT_LINK_LABEL.nl}
                  />
                </div>
                <div className={activeLang === 'en' ? 'block' : 'hidden'}>
                  <Input
                    id="event-url-label-en"
                    name="urlLabelEn"
                    defaultValue={event.urlLabelEn ?? ''}
                    maxLength={EVENT_LINK_LABEL_MAX}
                    placeholder={DEFAULT_EVENT_LINK_LABEL.en}
                  />
                </div>
                <p className="mt-1 text-xs text-vtk-muted">
                  {nl
                    ? 'Laat leeg voor "Externe eventlink". Gaat de link naar de inschrijvingen of de ticketverkoop van iemand anders, zet er dan bv. "Inschrijflink" of "Ticketverkoop": dat scheelt of iemand klikt.'
                    : 'Leave empty for "External event link". If the link leads to someone else’s sign-up form or ticket sales, enter "Sign-up link" or "Tickets".'}
                </p>
              </div>

              {canHeroWeek ? (
                <div>
                  <Label htmlFor="heroWeek">{nl ? 'Weekoverzicht op de homepage' : 'Week overview on the home page'}</Label>
                  <Select id="heroWeek" name="heroWeek" defaultValue={event.heroWeek ?? 'AUTO'}>
                    <option value="AUTO">{nl ? 'Automatisch' : 'Automatic'}</option>
                    <option value="PINNED">{nl ? 'Voorrang geven' : 'Give priority'}</option>
                    <option value="HIDDEN">{nl ? 'Niet tonen' : 'Do not show'}</option>
                  </Select>
                  <p className="mt-1 text-xs text-vtk-muted">
                    {nl
                      ? 'Sinds vandaag ook per rij te zetten in de lijst op /admin/kalender. Voorrang zet dit evenement vooraan op zijn dag; niet tonen houdt het van de homepage zonder het uit de kalender te halen.'
                      : 'Can also be toggled per row in the table on /admin/kalender. Priority puts this event first on its day; do not show keeps it off the home page without removing it from the calendar.'}
                  </p>
                </div>
              ) : null}
            </div>
          </Card>

          {/* 8. Logistiek */}
          <Card className="p-5 space-y-4">
            <div className="sec-title">
              <h2>{nl ? 'Logistiek' : 'Logistics'}</h2>
            </div>
            <label className="inline-flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                name="needsLogistics"
                defaultChecked={event.hasUitleenEvent ?? false}
                className="mt-1"
              />
              <span>
                {nl ? 'Logistiek nodig' : 'Needs logistics'}
                <span className="mt-0.5 block text-xs text-vtk-muted">
                  {nl
                    ? event.hasUitleenEvent
                      ? 'Dit evenement staat op logistiek.vtk.be; naam, locatie en uren volgen hier mee. Het vinkje weghalen laat het daar staan, want er kunnen al aanvragen aan hangen.'
                      : 'Zet dit evenement ook op logistiek.vtk.be, zodat materiaal, flesserke en transport eronder samen komen te staan.'
                    : event.hasUitleenEvent
                      ? 'This event exists on logistiek.vtk.be; its name, location and times follow this one. Unticking leaves it there, since requests may already be attached.'
                      : 'Also put this event on logistiek.vtk.be, so equipment, drinks and transport end up together.'}
                </span>
              </span>
            </label>
          </Card>
        </>
      )}
    </SaveForm>
  );
}
