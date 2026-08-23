'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@vtk/ui';
import {
  createFlesserkeReservationAction,
  editFlesserkeReservationAction,
  type ActionResult,
} from '@/app/actions/uitleen';
import { adminEditFlesserkeReservationAction } from '@/app/actions/beheer';
import { FlesserkeItemName } from '@/components/flesserke-item-name';
import { DayPartSelect } from '@/components/day-part-select';
import { EventPicker, type SelectableEvent } from '@/components/event-picker';
import { useFormDraft } from '@/lib/use-form-draft';
import { fieldClass, firstMissing, focusField, type MissingField } from '@/lib/required-fields';
import { formatContentAmount, formatDateTime } from '@/lib/uitleen';
import { LastMinuteNotice } from '@/components/last-minute-notice';
import { QuantityInput } from '@/components/quantity-input';
import type { ReservationFormInput } from '@/lib/reservation-form';
import type { FlesserkeCatalogCategory } from '@/lib/uitleen-server';
import {
  EventRequesterFields,
  type EventReservationValues,
  type RequesterOption,
} from '@/app/materiaal/event-fields';

export type FlesserkeInitial = {
  event: EventReservationValues;
  pickupDate: string;
  pickupPart?: string;
  returnDate: string;
  note: string;
  quantities: Record<string, number>;
};

/** Flesserke-aanvraagformulier (interne werking). Aparte flow van het materiaal. */
export function FlesserkeForm({
  catalog,
  groups,
  locale,
  initial,
  mode,
  onCancel,
  lastMinuteDays,
  draftKey,
  events,
}: {
  catalog: FlesserkeCatalogCategory[];
  groups: RequesterOption[];
  locale: 'nl' | 'en';
  initial: FlesserkeInitial;
  /** Termijn voor de last-minute-waarschuwing; zie /beheer/instellingen. */
  lastMinuteDays: number;
  /**
   * 'create' of een reservatie-id om te bewerken. 'admin-edit' is dezelfde
   * bewerking door het team: die mag elke post kiezen en ook een goedgekeurde
   * aanvraag nog aanpassen.
   */
  mode:
    | { kind: 'create' }
    | { kind: 'edit'; reservationId: string }
    | { kind: 'admin-edit'; reservationId: string };
  onCancel?: () => void;
  /** Zie ReservationForm: lokaal concept, enkel bij een nieuwe aanvraag. */
  draftKey?: string;
  /** Evenementen om deze aanvraag onder te hangen (A8). */
  events?: SelectableEvent[];
}) {
  const en = locale === 'en';
  const router = useRouter();
  const [event, setEvent] = useState<EventReservationValues>(initial.event);
  const [pickupDate, setPickupDate] = useState(initial.pickupDate);
  const [pickupPart, setPickupPart] = useState(initial.pickupPart ?? '');
  const [returnDate, setReturnDate] = useState(initial.returnDate);
  const [note, setNote] = useState(initial.note);
  const [quantities, setQuantities] = useState<Record<string, number>>(initial.quantities);
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
  /** Het eerste verplichte veld dat nog leeg is (R7). */
  const [missing, setMissing] = useState<MissingField | null>(null);
  const [pending, startTransition] = useTransition();

  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('all');

  const draftValue = useMemo(
    () => ({ event, pickupDate, pickupPart, returnDate, note, quantities }),
    [event, pickupDate, pickupPart, returnDate, note, quantities]
  );
  const draft = useFormDraft<typeof draftValue>(
    draftKey ?? null,
    draftValue,
    Boolean(draftKey),
    (value) =>
      value.event.eventName.trim() === '' &&
      value.pickupDate === '' &&
      Object.keys(value.quantities).length === 0
  );

  function restoreDraft() {
    const saved = draft.restore();
    if (!saved) return;
    setEvent(saved.event);
    setPickupDate(saved.pickupDate);
    setPickupPart(saved.pickupPart ?? '');
    setReturnDate(saved.returnDate);
    setNote(saved.note);
    setQuantities(saved.quantities);
  }

  const count = useMemo(() => Object.values(quantities).reduce((s, q) => s + q, 0), [quantities]);

  // Wat je gekozen hebt, op één plek (F1). Bij materiaal stond dat er al; hier
  // moest je terugscrollen door de hele catalogus om te zien of die vier bakken
  // er nu in zaten of niet.
  const chosenLines = useMemo(() => {
    const byId = new Map(catalog.flatMap((category) => category.items).map((item) => [item.id, item]));
    return Object.entries(quantities)
      .filter(([, quantity]) => quantity > 0)
      .map(([itemId, quantity]) => ({ id: itemId, quantity, item: byId.get(itemId) ?? null }))
      .sort((a, b) => (a.item?.name ?? '').localeCompare(b.item?.name ?? '', 'nl'));
  }, [catalog, quantities]);

  // Gefilterde weergave: op categorie en op een vrije zoekterm (naam/merk).
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
                (item.brand ?? '').toLowerCase().includes(needle)
            )
          : category.items,
      }))
      .filter((category) => category.items.length > 0);
  }, [catalog, search, activeCategory]);

  const setQty = (itemId: string, qty: number) =>
    setQuantities((prev) => {
      const next = { ...prev };
      if (qty <= 0) delete next[itemId];
      else next[itemId] = qty;
      return next;
    });

  function submit() {
    setError(null);
    // Eerst zeggen wat er ontbreekt (R7).
    const missingField = firstMissing([
      {
        name: 'eventName',
        ok: Boolean(event.eventName.trim()),
        message: en ? 'Name the activity.' : 'Geef je activiteit een naam.',
      },
      {
        name: 'pickupDate',
        ok: Boolean(pickupDate),
        message: en ? 'Pick a date.' : 'Kies wanneer het klaar moet staan.',
      },
      {
        name: 'items',
        ok: count > 0,
        message: en ? 'Pick at least one item.' : 'Kies minstens één item.',
      },
    ]);
    setMissing(missingField);
    if (missingField) {
      setError(missingField.message);
      focusField(missingField.name);
      return;
    }
    startTransition(async () => {
      const payload: ReservationFormInput = {
        ...event,
        pickupDate,
        returnDate: returnDate || pickupDate,
        pickupPart,
        eventId: eventLink.eventId || null,
        createEvent: eventLink.createEvent,
        note,
        lines: [],
        flesserkeLines: Object.entries(quantities).map(([itemId, quantity]) => ({ itemId, quantity })),
      };
      const result: ActionResult =
        mode.kind === 'create'
          ? await createFlesserkeReservationAction(payload)
          : mode.kind === 'admin-edit'
            ? await adminEditFlesserkeReservationAction(mode.reservationId, payload)
            : await editFlesserkeReservationAction(mode.reservationId, payload);
      if (result.ok) {
        draft.clear();
        if (mode.kind === 'create') router.push('/reservaties?aangevraagd=1');
        else {
          onCancel?.();
          router.refresh();
        }
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="space-y-6">
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

      <EventRequesterFields
        value={event}
        onChange={setEvent}
        groups={groups}
        locale={locale}
        mode={mode.kind === 'admin-edit' ? 'team' : 'member'}
        linkedEventName={linkedEvent?.name ?? null}
      />

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
              placeholder={en ? 'Search flesserke...' : 'Zoek flesserke...'}
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
            {search.trim() !== '' || activeCategory !== 'all' ? (
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setActiveCategory('all');
                }}
                className="h-10 rounded-lg border border-vtk-navy/15 px-3 text-sm font-medium text-vtk-ink transition hover:border-vtk-navy/40"
              >
                {en ? 'Clear filters' : 'Filters wissen'}
              </button>
            ) : null}
          </div>

          {shownCatalog.length === 0 ? (
            <p className="rounded-[18px] border border-vtk-navy/10 bg-vtk-surface p-6 text-sm text-vtk-muted">
              {en ? 'Nothing matches your search.' : 'Niets gevonden voor je zoekopdracht.'}
            </p>
          ) : null}

          {shownCatalog.map((category) => (
            <section key={category.id ?? 'overig'} className="rounded-[18px] border border-vtk-navy/10 bg-vtk-surface p-6">
              <h2 className="text-lg font-semibold tracking-tight text-vtk-ink">{category.name}</h2>
              <div className="logistics-stock-table-head mt-4" aria-hidden="true">
                <span>{en ? 'Item' : 'Item'}</span>
                <span>{en ? 'Brand' : 'Merk'}</span>
                <span>{en ? 'Volume' : 'Volume'}</span>
                <span>{en ? 'Stock' : 'Voorraad'}</span>
                <span>{en ? 'Quantity' : 'Aantal'}</span>
              </div>
              <ul className="logistics-stock-table">
                {category.items.map((item) => {
                  const qty = quantities[item.id] ?? 0;
                  const volume = formatContentAmount(item.contentAmount, item.contentUnit);
                  return (
                    <li key={item.id} className="logistics-stock-row">
                      <div className="logistics-stock-name">
                        <span className="logistics-mobile-label">{en ? 'Item' : 'Item'}</span>
                        <p className="text-sm font-medium text-vtk-ink">
                          <FlesserkeItemName name={item.name} colruytUrl={item.colruytUrl} />
                        </p>
                      </div>
                      <div className="logistics-stock-cell">
                        <span className="logistics-mobile-label">{en ? 'Brand' : 'Merk'}</span>
                        <span>{item.brand || '–'}</span>
                      </div>
                      <div className="logistics-stock-cell">
                        <span className="logistics-mobile-label">{en ? 'Volume' : 'Volume'}</span>
                        <span>{volume || '–'}</span>
                      </div>
                      <div className="logistics-stock-cell">
                        <span className="logistics-mobile-label">{en ? 'Stock' : 'Voorraad'}</span>
                        <span>{item.quantity}</span>
                      </div>
                      <div className="logistics-stock-quantity">
                        <span className="logistics-mobile-label">{en ? 'Quantity' : 'Aantal'}</span>
                        <button
                          type="button"
                          onClick={() => setQty(item.id, qty - 1)}
                          disabled={qty <= 0}
                          aria-label={`${en ? 'Fewer' : 'Minder'}: ${item.name}`}
                          className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-vtk-navy/15 text-vtk-ink transition hover:border-vtk-navy/40 disabled:opacity-30"
                        >
                          −
                        </button>
                        <QuantityInput
                          value={qty}
                          max={item.quantity}
                          onChange={(next) => setQty(item.id, next)}
                          label={`${en ? 'Number' : 'Aantal'}: ${item.name}`}
                        />
                        <button
                          type="button"
                          onClick={() => setQty(item.id, qty + 1)}
                          disabled={qty >= item.quantity}
                          aria-label={`${en ? 'More' : 'Meer'}: ${item.name}`}
                          className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-vtk-navy/15 text-vtk-ink transition hover:border-vtk-navy/40 disabled:opacity-30"
                        >
                          +
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>

        <aside
          className="h-fit rounded-[18px] border border-vtk-navy/10 bg-vtk-surface p-6 lg:sticky lg:top-6"
          data-field="items"
          tabIndex={-1}
        >
          <h2 className="text-lg font-semibold tracking-tight text-vtk-ink">{en ? 'Your request' : 'Jouw aanvraag'}</h2>
          <div className="mt-4 grid gap-3">
            <label className="grid gap-1 text-sm">
              <span className="font-medium text-vtk-ink">
                {en ? 'Ready by' : 'Klaarzetten tegen'}
                <span aria-hidden="true" className="text-red-600"> *</span>
              </span>
              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                <input
                  type="date"
                  value={pickupDate}
                  onChange={(e) => setPickupDate(e.target.value)}
                  data-field="pickupDate"
                  aria-invalid={missing?.name === 'pickupDate'}
                  className={fieldClass(
                    'h-10 min-w-0 rounded-lg border border-vtk-navy/15 bg-white px-3 text-vtk-ink',
                    'pickupDate',
                    missing
                  )}
                />
                <DayPartSelect
                  value={pickupPart}
                  onChange={setPickupPart}
                  locale={locale}
                  label={en ? 'Part of day' : 'Dagdeel'}
                />
              </div>
            </label>
            {/* Flesserke is verbruiksgoed: wat geopend is, komt niet terug. Enkel
                het gesloten deel gaat terug naar de kelder, en meestal dezelfde
                dag; vandaar de default en het optionele karakter. */}
            <label className="grid gap-1 text-sm">
              <span className="font-medium text-vtk-ink">
                {en ? 'Rest back by (optional)' : 'Rest terug tegen (optioneel)'}
              </span>
              <input
                type="date"
                value={returnDate || pickupDate}
                min={pickupDate || undefined}
                onChange={(e) => setReturnDate(e.target.value)}
                className="h-10 rounded-lg border border-vtk-navy/15 bg-white px-3 text-vtk-ink"
              />
              <span className="text-xs text-vtk-muted">
                {en
                  ? 'Leave as is for the same day. Only unopened items come back.'
                  : 'Laat staan voor dezelfde dag. Enkel wat ongeopend blijft, komt terug.'}
              </span>
            </label>
            <LastMinuteNotice pickupDate={pickupDate} days={lastMinuteDays} locale={locale} />
            <label className="grid gap-1 text-sm">
              <span className="font-medium text-vtk-ink">{en ? 'Extra info (optional)' : 'Extra info (optioneel)'}</span>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                className="rounded-lg border border-vtk-navy/15 bg-white px-3 py-2 text-vtk-ink"
              />
            </label>
          </div>

          {/* De gekozen items zelf, niet enkel het aantal (F1). */}
          <div className="mt-4 border-t border-vtk-navy/10 pt-3">
            {chosenLines.length === 0 ? (
              <p className="text-sm text-vtk-muted">
                {en
                  ? 'Nothing selected yet. Pick from the list on the left.'
                  : 'Nog niets gekozen. Kies hiernaast uit de lijst.'}
              </p>
            ) : (
              <ul className="grid gap-1 text-sm">
                {chosenLines.map((line) => (
                  <li key={line.id} className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 text-vtk-body">
                      {line.item?.name ?? (en ? 'Unknown item' : 'Onbekend item')}
                    </span>
                    <span className="shrink-0 font-medium tabular-nums text-vtk-ink">
                      {line.quantity}×
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <p className="mt-3 text-sm text-vtk-muted">
            {count} {en ? 'items' : 'items'} · {en ? 'closed items come back, opened ones are consumed.' : 'gesloten komt terug, geopend is verbruik.'}
          </p>

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
            disabled={pending}
          >
            {pending
              ? en
                ? 'Submitting...'
                : 'Indienen...'
              : mode.kind === 'create'
                ? en
                  ? 'Submit request'
                  : 'Aanvraag indienen'
                : en
                  ? 'Save changes'
                  : 'Wijzigingen opslaan'}
          </Button>
          {onCancel ? (
            <Button type="button" variant="ghost" size="lg" className="mt-2 w-full" onClick={onCancel} disabled={pending}>
              {en ? 'Cancel' : 'Annuleren'}
            </Button>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
