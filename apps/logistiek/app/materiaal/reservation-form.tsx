'use client';

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@vtk/ui';
import {
  checkAvailabilityAction,
  createTemplateFromSelectionAction,
  type ActionResult,
} from '@/app/actions/uitleen';
import type { ReservationFormInput } from '@/lib/reservation-form';
import type { RequestTemplate } from '@/lib/uitleen-server';
import { formatDateTime, formatEuro } from '@/lib/uitleen';
import type { CatalogCategory } from '@/lib/uitleen-server';
import { CategoryThumb } from '@/components/category-thumb';
import { DayPartSelect } from '@/components/day-part-select';
import { EventPicker, type SelectableEvent } from '@/components/event-picker';
import { useFormDraft } from '@/lib/use-form-draft';
import { LastMinuteNotice } from '@/components/last-minute-notice';
import { QuantityInput } from '@/components/quantity-input';
import { SetContents } from '@/components/set-contents';
import {
  EventRequesterFields,
  type EventReservationValues,
  type RequesterOption,
} from './event-fields';
import { trackReservationSubmitted, trackTemplateLoaded } from '@/lib/analytics-client';

/** Waar de kijkvoorkeur voor de catalogus blijft staan (M7). */
const CATALOGUE_VIEW_KEY = 'vtk-logistiek-catalogusweergave';

export type ReservationFormInitial = {
  event: EventReservationValues;
  pickupDate: string;
  pickupPart?: string;
  returnPart?: string;
  returnDate: string;
  note: string;
  quantities: Record<string, number>;
  /** Opmerking per gekozen item, op itemId. */
  lineNotes?: Record<string, string>;
  flesserkeQuantities?: Record<string, number>;
};

/**
 * Gedeeld aanvraagformulier voor aanmaken en bewerken. De ouder levert de
 * begintoestand en de submit-actie; het formulier stelt de payload samen.
 */
export function ReservationForm({
  catalog,
  groups,
  locale,
  initial,
  submitLabel,
  submittingLabel,
  onSubmit,
  onCancel,
  cancelLabel,
  showRentPrices = false,
  paymentNote,
  lastMinuteDays,
  mode = 'member',
  draftKey,
  templates = [],
  events,
}: {
  catalog: CatalogCategory[];
  groups: RequesterOption[];
  locale: 'nl' | 'en';
  initial: ReservationFormInitial;
  submitLabel: string;
  submittingLabel: string;
  onSubmit: (payload: ReservationFormInput) => Promise<ActionResult>;
  onCancel?: () => void;
  cancelLabel?: string;
  showRentPrices?: boolean;
  /** Beheerbare waarborg-/betaalnota (getPublicCopy); valt terug op de vaste zin. */
  paymentNote?: string;
  /**
   * Termijn voor de last-minute-waarschuwing. Weggelaten in team-modus: het team
   * bepaalt die termijn zelf en hoeft er niet aan herinnerd te worden.
   */
  lastMinuteDays?: number;
  mode?: 'member' | 'team';
  /**
   * Sleutel om een half ingevulde aanvraag lokaal te bewaren, uniek per lid.
   * Weglaten bij het bewerken van een bestaande aanvraag: die heeft de server als
   * bron, en een concept eroverheen zou stil oude waarden terugzetten.
   */
  draftKey?: string;
  /** Vaste sets die het formulier in één klik invullen (M17). */
  templates?: RequestTemplate[];
  /** Evenementen om deze aanvraag onder te hangen (A8). */
  events?: SelectableEvent[];
}) {
  const en = locale === 'en';
  const [event, setEvent] = useState<EventReservationValues>(initial.event);
  const [pickupDate, setPickupDate] = useState(initial.pickupDate);
  const [pickupPart, setPickupPart] = useState(initial.pickupPart ?? '');
  const [returnPart, setReturnPart] = useState(initial.returnPart ?? '');
  const [returnDate, setReturnDate] = useState(initial.returnDate);
  const [note, setNote] = useState(initial.note);
  const [quantities, setQuantities] = useState<Record<string, number>>(initial.quantities);
  const [lineNotes, setLineNotes] = useState<Record<string, string>>(initial.lineNotes ?? {});
  const [availability, setAvailability] = useState<Record<string, number> | null>(null);
  const [acceptConflicts, setAcceptConflicts] = useState(false);
  const [eventLink, setEventLink] = useState({ eventId: '', createEvent: false });

  /**
   * Een gekozen evenement vult de naam in plaats van dat je ze opnieuw typt: ze
   * staat dan twee keer in het formulier en gaat scheef zodra er één van de twee
   * aangepast wordt. Loskoppelen geeft het veld weer vrij, met de naam die er
   * stond als vertrekpunt.
   */
  const linkedEvent = events?.find((entry) => entry.id === eventLink.eventId) ?? null;
  function chooseEvent(next: { eventId: string; createEvent: boolean }) {
    setEventLink(next);
    const picked = events?.find((entry) => entry.id === next.eventId);
    if (picked) setEvent((current) => ({ ...current, eventName: picked.name }));
  }

  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('all');
  // Kaarten of een compacte lijst (M7). Wie weet wat hij wil, hoeft niet langs
  // honderd foto's te scrollen. De voorkeur blijft plakken per browser; ze in de
  // URL of de databank zetten zou betekenen dat een gedeelde link of een
  // collega ze meeneemt, en dit is een kijkvoorkeur van deze persoon.
  const [view, setView] = useState<'cards' | 'list'>('cards');
  useEffect(() => {
    // In een effect en niet als beginwaarde: op de server bestaat localStorage
    // niet, en een andere eerste render dan de server geeft een hydratiefout.
    const saved = window.localStorage.getItem(CATALOGUE_VIEW_KEY);
    if (saved === 'list' || saved === 'cards') setView(saved);
  }, []);
  function chooseView(next: 'cards' | 'list') {
    setView(next);
    window.localStorage.setItem(CATALOGUE_VIEW_KEY, next);
  }
  // Wat het laatst toegepaste sjabloon effectief toevoegde, per item. Nodig om
  // het weer weg te kunnen halen (M4): het aantal dat erbij kwam kan lager zijn
  // dan wat in het sjabloon stond, want we knippen af op de voorraad.
  const [appliedTemplate, setAppliedTemplate] = useState<
    { name: string; added: Record<string, number> } | null
  >(null);
  const [newTemplate, setNewTemplate] = useState<{ name: string } | null>(null);
  const [templatePending, startTemplateTransition] = useTransition();
  // Eigen melding, geen toast: de ledenkant van de app heeft geen
  // ToastProvider (die staat enkel rond /beheer), en de uitkomst hoort hier
  // toch bij de knop te staan waar ze vandaan komt.
  const [templateNotice, setTemplateNotice] = useState<
    { kind: 'ok' | 'error'; text: string } | null
  >(null);

  /**
   * Een sjabloon vult de aantallen in en verdwijnt daarna uit beeld: wat er nu
   * staat is een gewone aanvraag. Bewust optellen bij wat er al staat in plaats
   * van te vervangen; wie eerst iets koos en dan een sjabloon neemt, is dat anders
   * kwijt zonder waarschuwing.
   */
  function applyTemplate(templateId: string) {
    const template = templates.find((entry) => entry.id === templateId);
    if (!template) return;
    trackTemplateLoaded(template.name);
    const added: Record<string, number> = {};
    setQuantities((current) => {
      const next = { ...current };
      for (const line of template.lines) {
        const item = itemsById.get(line.itemId);
        if (!item) continue;
        const before = next[line.itemId] ?? 0;
        const after = Math.min(item.quantity, before + line.quantity);
        if (after > before) added[line.itemId] = (added[line.itemId] ?? 0) + (after - before);
        next[line.itemId] = after;
      }
      return next;
    });
    setAppliedTemplate({ name: template.name, added });
  }

  /** Het laatst toegepaste sjabloon weer weghalen (M4), zonder de rest te raken. */
  function undoTemplate() {
    const applied = appliedTemplate;
    if (!applied) return;
    setQuantities((current) => {
      const next = { ...current };
      for (const [itemId, quantity] of Object.entries(applied.added)) {
        const left = (next[itemId] ?? 0) - quantity;
        if (left > 0) next[itemId] = left;
        else delete next[itemId];
      }
      return next;
    });
    setAppliedTemplate(null);
  }

  /** Wat er nu gekozen is, als sjabloonlijnen (M5). */
  function selectedLines(): Array<{ itemId: string; quantity: number }> {
    return Object.entries(quantities)
      .filter(([, quantity]) => quantity > 0)
      .map(([itemId, quantity]) => ({ itemId, quantity }));
  }

  function saveTemplate() {
    const name = newTemplate?.name.trim() ?? '';
    setTemplateNotice(null);
    startTemplateTransition(async () => {
      const result = await createTemplateFromSelectionAction({
        name,
        groupId: event.groupId || null,
        lines: selectedLines(),
      });
      if (!result.ok) {
        setTemplateNotice({ kind: 'error', text: result.error });
        return;
      }
      setTemplateNotice({ kind: 'ok', text: result.message ?? 'Sjabloon bewaard.' });
      setNewTemplate(null);
      // Zodat het nieuwe sjabloon meteen in de keuzelijst staat.
      router.refresh();
    });
  }

  // Alles wat het invullen van een aanvraag kost; de zoekterm en de gekozen
  // categorie horen er niet bij, dat is navigatie en geen invoer.
  const draftValue = useMemo(
    () => ({ event, pickupDate, returnDate, pickupPart, returnPart, note, quantities, lineNotes }),
    [event, pickupDate, returnDate, pickupPart, returnPart, note, quantities, lineNotes]
  );
  const draft = useFormDraft<typeof draftValue>(
    draftKey ?? null,
    draftValue,
    Boolean(draftKey),
    (value) =>
      value.event.eventName.trim() === '' &&
      value.pickupDate === '' &&
      value.returnDate === '' &&
      Object.keys(value.quantities).length === 0
  );

  function restoreDraft() {
    const saved = draft.restore();
    if (!saved) return;
    setEvent(saved.event);
    setPickupDate(saved.pickupDate);
    setReturnDate(saved.returnDate);
    setPickupPart(saved.pickupPart ?? '');
    setReturnPart(saved.returnPart ?? '');
    setNote(saved.note);
    setQuantities(saved.quantities);
    setLineNotes(saved.lineNotes ?? {});
  }

  const items = useMemo(() => catalog.flatMap((category) => category.items), [catalog]);
  const itemsById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);

  // Gefilterde weergave: op categorie en op een vrije zoekterm (naam/omschrijving).
  const shownCatalog = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return catalog
      .filter((category) => activeCategory === 'all' || (category.id ?? 'overig') === activeCategory)
      .map((category) => ({
        ...category,
        items: needle
          ? category.items.filter(
              (item) =>
                item.name.toLowerCase().includes(needle) ||
                (item.description ?? '').toLowerCase().includes(needle)
            )
          : category.items,
      }))
      .filter((category) => category.items.length > 0);
  }, [catalog, search, activeCategory]);

  // Eén knop terug naar de categorie-landing; anders moet je de zoekterm
  // wissen én de categorie terugzetten om weer een overzicht te krijgen.
  const filtersActive = search.trim() !== '' || activeCategory !== 'all';
  const clearFilters = useCallback(() => {
    setSearch('');
    setActiveCategory('all');
  }, []);

  const setQuantity = useCallback((itemId: string, quantity: number) => {
    setQuantities((prev) => {
      const next = { ...prev };
      if (quantity <= 0) delete next[itemId];
      else next[itemId] = quantity;
      return next;
    });
  }, []);

  useEffect(() => {
    if (!pickupDate || !returnDate) {
      setAvailability(null);
      return;
    }
    let cancelled = false;
    checkAvailabilityAction({ pickupDate, returnDate }).then((result) => {
      if (cancelled || !result.ok) return;
      setAvailability(Object.fromEntries(result.availability.map((a) => [a.itemId, a.available])));
    });
    return () => {
      cancelled = true;
    };
  }, [pickupDate, returnDate]);

  /**
   * Wat er niet past in de gevraagde periode. Afgeleid en nooit bewaard: zodra
   * een andere aanvraag geannuleerd wordt, verdwijnt het conflict vanzelf.
   */
  const conflictLines = useMemo(() => {
    if (!availability) return [];
    return items
      .map((item) => ({ item, quantity: quantities[item.id] ?? 0, free: availability[item.id] ?? 0 }))
      .filter((line) => line.quantity > 0 && line.quantity > line.free);
  }, [items, quantities, availability]);

  const totals = useMemo(() => {
    let deposit = 0;
    let rent = 0;
    let count = 0;
    for (const item of items) {
      const quantity = quantities[item.id] ?? 0;
      deposit += item.depositCents * quantity;
      rent += item.priceCents * quantity;
      count += quantity;
    }
    return { deposit, rent, count };
  }, [items, quantities]);

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await onSubmit({
        ...event,
        pickupDate,
        returnDate,
        pickupPart,
        returnPart,
        eventId: eventLink.eventId || null,
        createEvent: eventLink.createEvent,
        note,
        lines: Object.entries(quantities).map(([itemId, quantity]) => ({
          itemId,
          quantity,
          note: lineNotes[itemId],
        })),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      trackReservationSubmitted({
        type: event.requesterType ?? 'INTERN',
        itemCount: totals.count,
      });
      // Ingediend: het concept is geen concept meer.
      draft.clear();
    });
  }

  return (
    <div className="space-y-6">
      {/* Bewust een balk met een keuze en geen automatisch herstel: een formulier
          dat zichzelf invult met iets van vorige week is verwarrender dan een
          leeg formulier. */}
      {draft.found ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-vtk-navy/15 bg-vtk-paper px-4 py-3 text-sm">
          <p className="text-vtk-body">
            <span className="font-semibold text-vtk-ink">
              {en ? 'You had a request in progress' : 'Je had een aanvraag in opbouw'}
            </span>
            {draft.savedAt ? (
              <span className="text-vtk-muted">
                {' '}
                · {en ? 'saved' : 'bewaard'} {formatDateTime(draft.savedAt, locale)}
              </span>
            ) : null}
          </p>
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" onClick={restoreDraft}>
              {en ? 'Continue' : 'Verder werken'}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={draft.discard}>
              {en ? 'Discard' : 'Weggooien'}
            </Button>
          </div>
        </div>
      ) : null}

      {/* De keuzelijst met sjablonen, met "nieuw" als laatste optie erin (M5,
          beslissing B2). Bewust geen aparte knop ernaast: wie er een wil maken,
          is dan langs de bestaande gepasseerd waar het antwoord misschien al
          stond. Dat is de hele rem op dertig varianten van "cantus"; rechten
          staan er niet op, iedereen mag er een maken. */}
      {templates.length > 0 || mode === 'member' ? (
        <section className="logistics-template-picker" aria-labelledby="material-template-title">
          <div>
            <p className="logistics-form-kicker">{en ? 'Quick start' : 'Snel starten'}</p>
            <h2 id="material-template-title">
              {en ? 'Use a ready-made equipment list' : 'Gebruik een kant-en-klare materiaallijst'}
            </h2>
            <p>
              {en
                ? 'A template immediately adds its equipment to your request. You can still change every quantity.'
                : 'Een sjabloon voegt het materiaal meteen toe aan je aanvraag. Je kan elk aantal daarna nog aanpassen.'}
            </p>
          </div>
          <label>
            <span>{en ? 'Template' : 'Sjabloon'}</span>
            <select
              value=""
              onChange={(event) => {
                const chosen = event.target.value;
                event.target.value = '';
                if (chosen === '__new__') {
                  setNewTemplate({ name: '' });
                  return;
                }
                applyTemplate(chosen);
              }}
            >
              <option value="">{en ? 'Choose a template...' : 'Kies een sjabloon...'}</option>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                  {template.groupName ? ` (${template.groupName})` : ''}
                </option>
              ))}
              <option value="__new__">
                {en
                  ? '+ Save my selection as a new template'
                  : '+ Nieuw sjabloon maken van mijn selectie'}
              </option>
            </select>
          </label>
          {appliedTemplate ? (
            <p className="logistics-template-feedback" role="status" aria-live="polite">
              <span aria-hidden>✓</span>
              {en
                ? `${appliedTemplate.name} was added. Your request now contains ${totals.count} items.`
                : `${appliedTemplate.name} is toegevoegd. Jouw aanvraag bevat nu ${totals.count} items.`}{' '}
              <button
                type="button"
                onClick={undoTemplate}
                className="font-semibold underline underline-offset-2"
              >
                {en ? 'Undo' : 'Toch niet'}
              </button>
            </p>
          ) : null}

          {newTemplate ? (
            <div className="logistics-template-new">
              <label className="grid gap-1 text-sm">
                <span className="font-medium text-vtk-ink">
                  {en ? 'Name of the template' : 'Naam van het sjabloon'}
                </span>
                <input
                  type="text"
                  value={newTemplate.name}
                  onChange={(field) => setNewTemplate({ name: field.target.value })}
                  placeholder={en ? 'E.g. Cantus' : 'Bv. Cantus'}
                  className="h-10 rounded-lg border border-vtk-navy/15 bg-white px-3 text-sm text-vtk-ink"
                />
                <span className="text-xs text-vtk-muted">
                  {en
                    ? `Saves the ${totals.count} items you selected. Everyone can use it afterwards.`
                    : `Bewaart de ${totals.count} items die je nu koos. Iedereen kan het daarna gebruiken.`}
                </span>
              </label>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={saveTemplate}
                  disabled={templatePending || totals.count === 0 || !newTemplate.name.trim()}
                >
                  {templatePending
                    ? en
                      ? 'Saving...'
                      : 'Bewaren...'
                    : en
                      ? 'Save template'
                      : 'Sjabloon bewaren'}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setNewTemplate(null)}
                  disabled={templatePending}
                >
                  {en ? 'Cancel' : 'Annuleren'}
                </Button>
              </div>
            </div>
          ) : null}

          {templateNotice ? (
            <p
              role="status"
              aria-live="polite"
              className={`logistics-template-note ${
                templateNotice.kind === 'error' ? 'is-error' : ''
              }`}
            >
              {templateNotice.text}
            </p>
          ) : null}
        </section>
      ) : null}

      <EventRequesterFields
        value={event}
        onChange={setEvent}
        groups={groups}
        locale={locale}
        mode={mode}
        linkedEventName={linkedEvent?.name ?? null}
      />

      {/* Enkel bij een nieuwe aanvraag: een bestaande koppel je vanuit het beheer,
          waar je ziet wat er al onder het evenement hangt. */}
      {events ? (
        <EventPicker
          events={events}
          eventId={eventLink.eventId}
          createEvent={eventLink.createEvent}
          onChange={chooseEvent}
          locale={locale}
          newEventName={event.eventName}
        />
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={en ? 'Search equipment...' : 'Zoek materiaal...'}
              className="h-10 min-w-[200px] flex-1 rounded-lg border border-vtk-navy/15 bg-white px-3 text-sm text-vtk-ink"
            />
            <select
              value={activeCategory}
              onChange={(e) => setActiveCategory(e.target.value)}
              className="h-10 rounded-lg border border-vtk-navy/15 bg-white px-3 text-sm text-vtk-ink"
            >
              <option value="all">{en ? 'All categories' : 'Alle categorieën'}</option>
              {catalog.map((category) => (
                <option key={category.id ?? 'overig'} value={category.id ?? 'overig'}>
                  {category.name}
                </option>
              ))}
            </select>
            {filtersActive ? (
              <button
                type="button"
                onClick={clearFilters}
                className="h-10 rounded-lg border border-vtk-navy/15 px-3 text-sm font-medium text-vtk-ink transition hover:border-vtk-navy/40"
              >
                {en ? 'Clear filters' : 'Filters wissen'}
              </button>
            ) : null}
            {/* Kaarten of lijst (M7). */}
            <div className="ml-auto flex h-10 items-center gap-1 rounded-lg border border-vtk-navy/15 p-1">
              {(
                [
                  ['cards', en ? 'Cards' : 'Kaarten'],
                  ['list', en ? 'List' : 'Lijst'],
                ] as Array<['cards' | 'list', string]>
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => chooseView(value)}
                  aria-pressed={view === value}
                  className={`h-8 rounded-md px-2.5 text-sm font-medium transition ${
                    view === value ? 'bg-vtk-navy text-white' : 'text-vtk-ink hover:bg-vtk-navy/5'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Landing: enkel categorie-tegels; klik een categorie om de materialen te
              zien (drill-down zoals uitleendienst.vlaamsbrabant.be). Zoeken overschrijft
              dit en toont treffers over alle categorieën. */}
          {!search.trim() && activeCategory === 'all' ? (
            <section aria-label={en ? 'Categories' : 'Categorieën'}>
              <h2 className="mb-3 text-lg font-semibold text-vtk-ink">{en ? 'Choose a category' : 'Kies een categorie'}</h2>
              <div className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-3">
                {catalog.map((category) => (
                  <button
                    key={category.id ?? 'overig'}
                    type="button"
                    onClick={() => setActiveCategory(category.id ?? 'overig')}
                    className="rounded-[14px] border border-vtk-navy/10 bg-vtk-surface p-3 text-left transition hover:border-vtk-navy/35 sm:p-4"
                  >
                    <span className="block text-sm font-semibold text-vtk-ink">{category.name}</span>
                    <span className="mt-0.5 block text-xs text-vtk-muted">{category.items.length} {en ? 'items' : 'items'}</span>
                  </button>
                ))}
              </div>
            </section>
          ) : (
            <>
              {!search.trim() ? (
                <button
                  type="button"
                  onClick={() => setActiveCategory('all')}
                  className="inline-flex items-center gap-1 text-sm font-semibold text-vtk-navy"
                >
                  ← {en ? 'All categories' : 'Alle categorieën'}
                </button>
              ) : null}

          {shownCatalog.length === 0 ? (
            <p className="rounded-[18px] border border-vtk-navy/10 bg-vtk-surface p-6 text-sm text-vtk-muted">
              {en ? 'Nothing matches your search.' : 'Niets gevonden voor je zoekopdracht.'}
            </p>
          ) : null}

          {/* @container: het aantal kolommen volgt de breedte van dít blok, niet
              van het venster. Datzelfde formulier wordt ook in de smallere
              beheerkolom gerenderd, en daar liep de +-knop uit de kaart omdat
              sm:/xl: naar het venster keken. */}
          {shownCatalog.map((category) => (
            <section
              key={category.id ?? 'overig'}
              className="@container rounded-[18px] border border-vtk-navy/10 bg-vtk-surface p-6"
            >
              <h2 className="text-lg font-semibold tracking-tight text-vtk-ink">{category.name}</h2>
              <ul
                className={
                  view === 'list'
                    ? 'mt-4 divide-y divide-vtk-navy/10'
                    : 'mt-4 grid gap-4 @lg:grid-cols-2 @4xl:grid-cols-3'
                }
              >
                {category.items.map((item) => {
                  const quantity = quantities[item.id] ?? 0;
                  const available = availability?.[item.id];
                  const imageKey = item.photoKey ?? item.photoKeys[0];
                  // Meer vragen dan er in deze periode vrij is, mag: dan wordt het
                  // een conflict dat Logistiek kan oplossen door te schuiven. Meer
                  // dan er bestaat, kan nooit.
                  const atMax = quantity >= item.quantity;
                  const short = available !== undefined && quantity > available;

                  // Lijstweergave (M7): één rij per item, zonder foto. Dezelfde
                  // knoppen en dezelfde grenzen als op de kaart; enkel de
                  // omhulling verschilt.
                  if (view === 'list') {
                    return (
                      <li
                        key={item.id}
                        className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2.5"
                      >
                        <span className="min-w-0 flex-1">
                          <Link
                            href={`/materiaal/${item.id}`}
                            className="font-medium text-vtk-ink hover:underline"
                          >
                            {item.name}
                          </Link>
                          {item.isSet ? (
                            <span className="ml-2 rounded-full bg-vtk-yellow/25 px-2 py-0.5 text-[11px] font-semibold text-vtk-ink">
                              Set
                            </span>
                          ) : null}
                          {short ? (
                            <span className="ml-2 text-xs text-amber-900">
                              {en
                                ? `only ${available} free then`
                                : `maar ${available} vrij in die periode`}
                            </span>
                          ) : null}
                        </span>
                        <span
                          className={`shrink-0 text-sm tabular-nums ${
                            available === 0 ? 'font-semibold text-red-700' : 'text-vtk-muted'
                          }`}
                        >
                          {available !== undefined ? available : item.quantity}{' '}
                          {en ? 'free' : 'vrij'}
                        </span>
                        <span className="flex shrink-0 items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setQuantity(item.id, quantity - 1)}
                            disabled={quantity <= 0}
                            aria-label={`${en ? 'Fewer' : 'Minder'}: ${item.name}`}
                            className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-vtk-navy/25 text-lg font-medium text-vtk-navy transition hover:bg-vtk-navy/5 disabled:opacity-30"
                          >
                            −
                          </button>
                          <QuantityInput
                            value={quantity}
                            max={item.quantity}
                            onChange={(next) => setQuantity(item.id, next)}
                            label={`${en ? 'Number' : 'Aantal'}: ${item.name}`}
                          />
                          <button
                            type="button"
                            onClick={() => setQuantity(item.id, quantity + 1)}
                            disabled={atMax}
                            aria-label={`${en ? 'More' : 'Meer'}: ${item.name}`}
                            className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-vtk-navy text-lg font-medium text-white transition hover:bg-vtk-ink disabled:opacity-30"
                          >
                            +
                          </button>
                        </span>
                      </li>
                    );
                  }

                  return (
                    <li key={item.id} className="flex flex-col overflow-hidden rounded-[14px] border border-vtk-navy/10 bg-white">
                      <Link href={`/materiaal/${item.id}`} className="block aspect-[4/3] w-full bg-vtk-paper-2">
                        {imageKey ? (
                          <img
                            src={`/api/media/${imageKey.split('/').map(encodeURIComponent).join('/')}`}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <CategoryThumb categoryName={category.name} />
                        )}
                      </Link>
                      <div className="flex flex-1 flex-col p-4">
                        <p className="flex items-center gap-2 font-medium text-vtk-ink">
                          <Link href={`/materiaal/${item.id}`} className="hover:underline">
                            {item.name}
                          </Link>
                          {item.isSet ? (
                            <span className="rounded-full bg-vtk-yellow/25 px-2 py-0.5 text-[11px] font-semibold text-vtk-ink">
                              Set
                            </span>
                          ) : null}
                        </p>
                        {item.description ? (
                          <p className="mt-1 line-clamp-2 text-sm text-vtk-muted">{item.description}</p>
                        ) : null}
                        <SetContents contents={item.setContents} locale={locale} />
                        <dl className="mt-3 grid grid-cols-2 gap-3 border-t border-vtk-navy/10 pt-3 text-xs">
                          <div>
                            <dt className="font-semibold text-vtk-muted">
                              {en ? 'Deposit' : 'Waarborg'}
                            </dt>
                            <dd className="mt-0.5 text-vtk-ink">
                              {item.depositCents > 0
                                ? formatEuro(item.depositCents)
                                : en
                                  ? 'None'
                                  : 'Geen'}
                            </dd>
                          </div>
                          <div>
                            <dt className="font-semibold text-vtk-muted">
                              {available !== undefined
                                ? en
                                  ? 'Available for your dates'
                                  : 'Beschikbaar in je periode'
                                : en
                                  ? 'Stock'
                                  : 'Voorraad'}
                            </dt>
                            <dd
                              className={`mt-0.5 font-semibold ${available === 0 ? 'text-red-700' : 'text-vtk-ink'}`}
                            >
                              {available !== undefined ? available : item.quantity}
                            </dd>
                          </div>
                        </dl>
                        {short ? (
                          <p className="mt-1.5 rounded-lg bg-amber-50 px-2 py-1 text-xs text-amber-900">
                            {en
                              ? `You are asking for ${quantity}, but only ${available} are free then. Logistics will look at it.`
                              : `Je vraagt er ${quantity}, maar in die periode zijn er maar ${available} vrij. Logistiek bekijkt het.`}
                          </p>
                        ) : null}
                        {/* Alternatieven tonen we pas wanneer het gevraagde item
                            écht niet kan in deze periode: anders staat er bij elk
                            item een suggestie die niemand nodig heeft. */}
                        {available === 0 ? (
                          <p className="mt-1.5 text-xs text-vtk-body">
                            {item.alternativeIds
                              .map((id) => itemsById.get(id))
                              .filter(
                                (alt): alt is (typeof items)[number] =>
                                  Boolean(alt) && (availability?.[alt!.id] ?? alt!.quantity) > 0
                              )
                              .map((alt, index) => (
                                <span key={alt.id}>
                                  {index === 0 ? (en ? 'Also possible: ' : 'Ook mogelijk: ') : ', '}
                                  <button
                                    type="button"
                                    onClick={() => setQuantity(alt.id, (quantities[alt.id] ?? 0) + 1)}
                                    className="font-semibold text-vtk-navy underline underline-offset-2"
                                  >
                                    {alt.name}
                                  </button>
                                </span>
                              ))}
                          </p>
                        ) : null}
                        {/* Altijd onderaan de kaart, ongeacht de lengte van de beschrijving. */}
                        <div className="mt-auto flex items-center justify-between gap-2 pt-4">
                          <button
                            type="button"
                            onClick={() => setQuantity(item.id, quantity - 1)}
                            disabled={quantity <= 0}
                            aria-label={`${en ? 'Fewer' : 'Minder'}: ${item.name}`}
                            className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-vtk-navy/25 text-lg font-medium text-vtk-navy transition hover:bg-vtk-navy/5 disabled:opacity-30"
                          >
                            −
                          </button>
                          <QuantityInput
                            value={quantity}
                            max={item.quantity}
                            onChange={(next) => setQuantity(item.id, next)}
                            label={`${en ? 'Number' : 'Aantal'}: ${item.name}`}
                          />
                          <button
                            type="button"
                            onClick={() => setQuantity(item.id, quantity + 1)}
                            disabled={atMax}
                            aria-label={`${en ? 'More' : 'Meer'}: ${item.name}`}
                            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-vtk-navy text-lg font-medium text-white transition hover:bg-vtk-ink disabled:opacity-30"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
            </>
          )}
        </div>

        <aside className="h-fit rounded-[18px] border border-vtk-navy/10 bg-vtk-surface p-6 lg:sticky lg:top-6">
          <h2 className="text-lg font-semibold tracking-tight text-vtk-ink">
            {en ? 'Your request' : 'Jouw aanvraag'}
          </h2>

          <div className="mt-4 grid gap-3">
            {/* Dagdeel naast de datum: "dinsdagnamiddag" stond tot nu toe in een
                mail. Het is een afspraak tussen mensen, geen boekingseenheid; de
                voorraad blijft op hele dagen rekenen. */}
            <label className="grid gap-1 text-sm">
              <span className="font-medium text-vtk-ink">{en ? 'Collect on' : 'Afhalen op'}</span>
              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                <input
                  type="date"
                  value={pickupDate}
                  onChange={(e) => setPickupDate(e.target.value)}
                  className="h-10 min-w-0 rounded-lg border border-vtk-navy/15 bg-white px-3 text-vtk-ink"
                />
                <DayPartSelect
                  value={pickupPart}
                  onChange={setPickupPart}
                  locale={locale}
                  label={en ? 'Part of day for collecting' : 'Dagdeel afhalen'}
                />
              </div>
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-medium text-vtk-ink">{en ? 'Return on' : 'Terugbrengen op'}</span>
              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                <input
                  type="date"
                  value={returnDate}
                  min={pickupDate || undefined}
                  onChange={(e) => setReturnDate(e.target.value)}
                  className="h-10 min-w-0 rounded-lg border border-vtk-navy/15 bg-white px-3 text-vtk-ink"
                />
                <DayPartSelect
                  value={returnPart}
                  onChange={setReturnPart}
                  locale={locale}
                  label={en ? 'Part of day for returning' : 'Dagdeel terugbrengen'}
                />
              </div>
            </label>
            {lastMinuteDays !== undefined ? (
              <LastMinuteNotice pickupDate={pickupDate} days={lastMinuteDays} locale={locale} />
            ) : null}
            <label className="grid gap-1 text-sm">
              <span className="font-medium text-vtk-ink">{en ? 'Extra info (optional)' : 'Extra info (optioneel)'}</span>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder={en ? 'Anything the team should know' : 'Iets dat het team moet weten'}
                className="rounded-lg border border-vtk-navy/15 bg-white px-3 py-2 text-vtk-ink"
              />
            </label>
          </div>

          <dl className="mt-5 space-y-1 border-t border-vtk-navy/10 pt-4 text-sm">
            {/* Eigen scroll: bij een aanvraag van twintig items duwde deze lijst
                de indienknop voorbij de onderkant van het scherm. */}
            <div className="max-h-64 space-y-2 overflow-y-auto">
              {items
                .filter((item) => quantities[item.id])
                .map((item) => (
                  <div key={item.id}>
                    <div className="flex items-center justify-between gap-3">
                      <dt className="truncate text-vtk-muted">
                        {item.name} × {quantities[item.id]}
                      </dt>
                      <dd>
                        <button
                          type="button"
                          onClick={() => setQuantity(item.id, 0)}
                          aria-label={`${en ? 'Remove' : 'Verwijderen'}: ${item.name}`}
                          className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-base font-semibold text-red-600 transition hover:bg-red-50 hover:text-red-700"
                        >
                          ×
                        </button>
                      </dd>
                    </div>
                    {/* Opmerking per lijn: "liefst de zwarte" hoort bij dít item en
                        niet onderaan bij de algemene info, waar het team het pas
                        vindt als het al iets anders klaarzette. */}
                    <input
                      type="text"
                      value={lineNotes[item.id] ?? ''}
                      onChange={(e) =>
                        setLineNotes((prev) => ({ ...prev, [item.id]: e.target.value }))
                      }
                      placeholder={en ? 'Note (optional)' : 'Opmerking (optioneel)'}
                      aria-label={`${en ? 'Note' : 'Opmerking'}: ${item.name}`}
                      className="mt-0.5 h-8 w-full rounded-lg border border-vtk-navy/15 bg-white px-2 text-xs text-vtk-ink"
                    />
                  </div>
                ))}
            </div>
            <div className="flex justify-between">
              <dt className="text-vtk-muted">Items</dt>
              <dd className="font-medium text-vtk-ink">{totals.count}</dd>
            </div>
            {showRentPrices ? (
              <div className="flex justify-between">
                <dt className="text-vtk-muted">{en ? 'Rental price' : 'Huurprijs'}</dt>
                <dd className="font-medium text-vtk-ink">{formatEuro(totals.rent)}</dd>
              </div>
            ) : null}
            <div className="flex justify-between">
              <dt className="text-vtk-muted">{en ? 'Deposit' : 'Waarborg'}</dt>
              <dd className="font-medium text-vtk-ink">{formatEuro(totals.deposit)}</dd>
            </div>
          </dl>
          <p className="mt-2 text-xs leading-5 text-vtk-muted">
            {paymentNote ??
              (en
                ? 'Your deposit is returned when everything comes back in good condition.'
                : 'De waarborg krijg je terug wanneer alles in orde terugkomt.')}
          </p>

          {/* Indienen mag, maar niet per ongeluk: wie meer vraagt dan er vrij is,
              zegt hier expliciet dat hij dat weet. Zonder die stap belandt het
              conflict bij Logistiek zonder dat de aanvrager het doorhad. */}
          {conflictLines.length > 0 ? (
            <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
              <p className="font-semibold">
                {en ? 'Not everything is free then' : 'Niet alles is vrij in je periode'}
              </p>
              <ul className="mt-1 space-y-0.5">
                {conflictLines.map((line) => (
                  <li key={line.item.id}>
                    {line.item.name}: {en ? 'you ask' : 'je vraagt er'} {line.quantity},{' '}
                    {en ? 'free' : 'vrij'} {line.free}
                  </li>
                ))}
              </ul>
              <label className="mt-2 flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={acceptConflicts}
                  onChange={(e) => setAcceptConflicts(e.target.checked)}
                  className="mt-0.5 h-4 w-4"
                />
                <span>
                  {en
                    ? 'Send it anyway. Logistics will contact me to move the dates or find something else.'
                    : 'Toch indienen. Logistiek neemt contact op om de datums te verschuiven of iets anders te zoeken.'}
                </span>
              </label>
            </div>
          ) : null}

          {error ? (
            <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : null}

          <Button
            type="button"
            size="lg"
            className="mt-5 w-full"
            onClick={submit}
            disabled={
              pending ||
              totals.count === 0 ||
              !pickupDate ||
              !returnDate ||
              !event.eventName.trim() ||
              (conflictLines.length > 0 && !acceptConflicts)
            }
          >
            {pending ? submittingLabel : submitLabel}
          </Button>
          {onCancel ? (
            <Button
              type="button"
              variant="ghost"
              size="lg"
              className="mt-2 w-full"
              onClick={onCancel}
              disabled={pending}
            >
              {cancelLabel ?? (en ? 'Cancel' : 'Annuleren')}
            </Button>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
