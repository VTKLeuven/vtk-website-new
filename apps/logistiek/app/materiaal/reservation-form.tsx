'use client';

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { Button } from '@vtk/ui';
import { checkAvailabilityAction, type ActionResult, type ReservationFormInput } from '@/app/actions/uitleen';
import { formatEuro } from '@/lib/uitleen';
import type { CatalogCategory } from '@/lib/uitleen-server';
import {
  EventRequesterFields,
  type EventReservationValues,
  type RequesterOption,
} from './event-fields';

export type ReservationFormInitial = {
  event: EventReservationValues;
  pickupDate: string;
  returnDate: string;
  note: string;
  quantities: Record<string, number>;
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
  mode = 'member',
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
  mode?: 'member' | 'team';
}) {
  const en = locale === 'en';
  const [event, setEvent] = useState<EventReservationValues>(initial.event);
  const [pickupDate, setPickupDate] = useState(initial.pickupDate);
  const [returnDate, setReturnDate] = useState(initial.returnDate);
  const [note, setNote] = useState(initial.note);
  const [quantities, setQuantities] = useState<Record<string, number>>(initial.quantities);
  const [availability, setAvailability] = useState<Record<string, number> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('all');

  const items = useMemo(() => catalog.flatMap((category) => category.items), [catalog]);

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
        note,
        lines: Object.entries(quantities).map(([itemId, quantity]) => ({ itemId, quantity })),
      });
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <div className="space-y-6">
      <EventRequesterFields value={event} onChange={setEvent} groups={groups} locale={locale} mode={mode} />

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
          </div>

          {shownCatalog.length === 0 ? (
            <p className="rounded-[18px] border border-vtk-navy/10 bg-vtk-surface p-6 text-sm text-vtk-muted">
              {en ? 'Nothing matches your search.' : 'Niets gevonden voor je zoekopdracht.'}
            </p>
          ) : null}

          {shownCatalog.map((category) => (
            <section
              key={category.id ?? 'overig'}
              className="rounded-[18px] border border-vtk-navy/10 bg-vtk-surface p-6"
            >
              <h2 className="text-lg font-semibold tracking-tight text-vtk-ink">{category.name}</h2>
              <ul className="mt-4 divide-y divide-vtk-navy/10">
                {category.items.map((item) => {
                  const quantity = quantities[item.id] ?? 0;
                  const available = availability?.[item.id];
                  return (
                    <li key={item.id} className="flex flex-wrap items-center gap-3 py-3">
                      <div className="min-w-0 flex-1">
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
                          <p className="mt-0.5 text-sm text-vtk-muted">{item.description}</p>
                        ) : null}
                        <p className="mt-0.5 text-xs text-vtk-muted">
                          {item.depositCents > 0
                            ? `${formatEuro(item.depositCents)} ${en ? 'deposit' : 'waarborg'}`
                            : en
                              ? 'No deposit'
                              : 'Geen waarborg'}
                          {available !== undefined ? (
                            available > 0 ? (
                              <span>
                                {' '}
                                · {available} {en ? 'available for your dates' : 'beschikbaar in je periode'}
                              </span>
                            ) : (
                              <span className="font-semibold text-red-700">
                                {' '}
                                · {en ? 'not available for your dates' : 'niet beschikbaar in je periode'}
                              </span>
                            )
                          ) : (
                            <span>
                              {' '}
                              · {item.quantity} {en ? 'in stock' : 'in voorraad'}
                            </span>
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setQuantity(item.id, quantity - 1)}
                          disabled={quantity <= 0}
                          aria-label={`${en ? 'Fewer' : 'Minder'}: ${item.name}`}
                          className="grid h-8 w-8 place-items-center rounded-full border border-vtk-navy/15 text-vtk-ink transition hover:border-vtk-navy/40 disabled:opacity-30"
                        >
                          −
                        </button>
                        <span className="w-6 text-center text-sm font-semibold text-vtk-ink">{quantity}</span>
                        <button
                          type="button"
                          onClick={() => setQuantity(item.id, quantity + 1)}
                          disabled={quantity >= (available ?? item.quantity)}
                          aria-label={`${en ? 'More' : 'Meer'}: ${item.name}`}
                          className="grid h-8 w-8 place-items-center rounded-full border border-vtk-navy/15 text-vtk-ink transition hover:border-vtk-navy/40 disabled:opacity-30"
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

        <aside className="h-fit rounded-[18px] border border-vtk-navy/10 bg-vtk-surface p-6 lg:sticky lg:top-6">
          <h2 className="text-lg font-semibold tracking-tight text-vtk-ink">
            {en ? 'Your request' : 'Jouw aanvraag'}
          </h2>

          <div className="mt-4 grid gap-3">
            <label className="grid gap-1 text-sm">
              <span className="font-medium text-vtk-ink">{en ? 'Collect on' : 'Afhalen op'}</span>
              <input
                type="date"
                value={pickupDate}
                onChange={(e) => setPickupDate(e.target.value)}
                className="h-10 rounded-lg border border-vtk-navy/15 bg-white px-3 text-vtk-ink"
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-medium text-vtk-ink">{en ? 'Return on' : 'Terugbrengen op'}</span>
              <input
                type="date"
                value={returnDate}
                min={pickupDate || undefined}
                onChange={(e) => setReturnDate(e.target.value)}
                className="h-10 rounded-lg border border-vtk-navy/15 bg-white px-3 text-vtk-ink"
              />
            </label>
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
            {en
              ? 'Your deposit is returned when everything comes back in good condition.'
              : 'De waarborg krijg je terug wanneer alles in orde terugkomt.'}
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
            disabled={pending || totals.count === 0 || !pickupDate || !returnDate || !event.eventName.trim()}
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
