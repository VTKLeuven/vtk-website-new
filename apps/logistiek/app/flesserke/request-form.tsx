'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@vtk/ui';
import {
  createFlesserkeReservationAction,
  editFlesserkeReservationAction,
  type ActionResult,
} from '@/app/actions/uitleen';
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
  returnDate: string;
  note: string;
  quantities: Record<string, number>;
};

/** Flesserke-aanvraagformulier (praesidium). Aparte flow van het materiaal. */
export function FlesserkeForm({
  catalog,
  groups,
  locale,
  initial,
  mode,
  onCancel,
}: {
  catalog: FlesserkeCatalogCategory[];
  groups: RequesterOption[];
  locale: 'nl' | 'en';
  initial: FlesserkeInitial;
  /** 'create' of een reservatie-id om te bewerken. */
  mode: { kind: 'create' } | { kind: 'edit'; reservationId: string };
  onCancel?: () => void;
}) {
  const en = locale === 'en';
  const router = useRouter();
  const [event, setEvent] = useState<EventReservationValues>(initial.event);
  const [pickupDate, setPickupDate] = useState(initial.pickupDate);
  const [returnDate, setReturnDate] = useState(initial.returnDate);
  const [note, setNote] = useState(initial.note);
  const [quantities, setQuantities] = useState<Record<string, number>>(initial.quantities);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('all');

  const count = useMemo(() => Object.values(quantities).reduce((s, q) => s + q, 0), [quantities]);

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
    startTransition(async () => {
      const payload: ReservationFormInput = {
        ...event,
        pickupDate,
        returnDate,
        note,
        lines: [],
        flesserkeLines: Object.entries(quantities).map(([itemId, quantity]) => ({ itemId, quantity })),
      };
      const result: ActionResult =
        mode.kind === 'create'
          ? await createFlesserkeReservationAction(payload)
          : await editFlesserkeReservationAction(mode.reservationId, payload);
      if (result.ok) {
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
      <EventRequesterFields value={event} onChange={setEvent} groups={groups} locale={locale} mode="member" />

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
          </div>

          {shownCatalog.length === 0 ? (
            <p className="rounded-[18px] border border-vtk-navy/10 bg-vtk-surface p-6 text-sm text-vtk-muted">
              {en ? 'Nothing matches your search.' : 'Niets gevonden voor je zoekopdracht.'}
            </p>
          ) : null}

          {shownCatalog.map((category) => (
            <section key={category.id ?? 'overig'} className="rounded-[18px] border border-vtk-navy/10 bg-vtk-surface p-6">
              <h2 className="text-lg font-semibold tracking-tight text-vtk-ink">{category.name}</h2>
              <ul className="mt-4 divide-y divide-vtk-navy/10">
                {category.items.map((item) => {
                  const qty = quantities[item.id] ?? 0;
                  return (
                    <li key={item.id} className="flex flex-wrap items-center gap-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-vtk-ink">
                          {item.name}
                          {item.brand ? <span className="text-vtk-muted"> · {item.brand}</span> : null}
                        </p>
                        <p className="text-xs text-vtk-muted">
                          {item.contentAmount ? `${item.contentAmount} · ` : ''}
                          {item.quantity} {en ? 'in stock' : 'in voorraad'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setQty(item.id, qty - 1)}
                          disabled={qty <= 0}
                          aria-label={`${en ? 'Fewer' : 'Minder'}: ${item.name}`}
                          className="grid h-8 w-8 place-items-center rounded-full border border-vtk-navy/15 text-vtk-ink transition hover:border-vtk-navy/40 disabled:opacity-30"
                        >
                          −
                        </button>
                        <span className="w-6 text-center text-sm font-semibold text-vtk-ink">{qty}</span>
                        <button
                          type="button"
                          onClick={() => setQty(item.id, qty + 1)}
                          disabled={qty >= item.quantity}
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
          <h2 className="text-lg font-semibold tracking-tight text-vtk-ink">{en ? 'Your request' : 'Jouw aanvraag'}</h2>
          <div className="mt-4 grid gap-3">
            <label className="grid gap-1 text-sm">
              <span className="font-medium text-vtk-ink">{en ? 'Needed from' : 'Nodig vanaf'}</span>
              <input
                type="date"
                value={pickupDate}
                onChange={(e) => setPickupDate(e.target.value)}
                className="h-10 rounded-lg border border-vtk-navy/15 bg-white px-3 text-vtk-ink"
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-medium text-vtk-ink">{en ? 'Until' : 'Tot'}</span>
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
                className="rounded-lg border border-vtk-navy/15 bg-white px-3 py-2 text-vtk-ink"
              />
            </label>
          </div>

          <p className="mt-4 text-sm text-vtk-muted">
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
            disabled={pending || count === 0 || !pickupDate || !returnDate || !event.eventName.trim()}
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
