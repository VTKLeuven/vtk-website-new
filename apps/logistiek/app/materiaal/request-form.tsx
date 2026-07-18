'use client';

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@vtk/ui';
import { checkAvailabilityAction, createReservationAction } from '@/app/actions/uitleen';
import { formatEuro } from '@/lib/uitleen';
import type { CatalogCategory } from '@/lib/uitleen-server';

export function MaterialRequestForm({
  catalog,
  locale,
  paymentNote,
}: {
  catalog: CatalogCategory[];
  locale: 'nl' | 'en';
  paymentNote: string;
}) {
  const en = locale === 'en';
  const router = useRouter();
  const [pickupDate, setPickupDate] = useState('');
  const [returnDate, setReturnDate] = useState('');
  const [note, setNote] = useState('');
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [availability, setAvailability] = useState<Record<string, number> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const items = useMemo(() => catalog.flatMap((category) => category.items), [catalog]);

  const setQuantity = useCallback((itemId: string, quantity: number) => {
    setQuantities((prev) => {
      const next = { ...prev };
      if (quantity <= 0) delete next[itemId];
      else next[itemId] = quantity;
      return next;
    });
  }, []);

  // Zachte beschikbaarheidsindicatie zodra een geldige periode gekozen is.
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
    let price = 0;
    let deposit = 0;
    let count = 0;
    for (const item of items) {
      const quantity = quantities[item.id] ?? 0;
      price += item.priceCents * quantity;
      deposit += item.depositCents * quantity;
      count += quantity;
    }
    return { price, deposit, count };
  }, [items, quantities]);

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await createReservationAction({
        pickupDate,
        returnDate,
        note,
        lines: Object.entries(quantities).map(([itemId, quantity]) => ({ itemId, quantity })),
      });
      if (result.ok) {
        router.push('/reservaties?aangevraagd=1');
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-6">
        {catalog.map((category) => (
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
                      <p className="font-medium text-vtk-ink">{item.name}</p>
                      {item.description ? (
                        <p className="mt-0.5 text-sm text-vtk-muted">{item.description}</p>
                      ) : null}
                      <p className="mt-0.5 text-xs text-vtk-muted">
                        {item.priceCents > 0 ? `${formatEuro(item.priceCents)} ${en ? 'rental' : 'huur'}` : en ? 'Free' : 'Gratis'}
                        {item.depositCents > 0 ? ` · ${formatEuro(item.depositCents)} ${en ? 'deposit' : 'waarborg'}` : ''}
                        {available !== undefined ? (
                          available > 0 ? (
                            <span> · {available} {en ? 'available for your dates' : 'beschikbaar in je periode'}</span>
                          ) : (
                            <span className="font-semibold text-red-700">
                              {' '}
                              · {en ? 'not available for your dates' : 'niet beschikbaar in je periode'}
                            </span>
                          )
                        ) : (
                          <span> · {item.quantity} {en ? 'in stock' : 'in voorraad'}</span>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setQuantity(item.id, quantity - 1)}
                        disabled={quantity <= 0}
                        aria-label={`Minder: ${item.name}`}
                        className="grid h-8 w-8 place-items-center rounded-full border border-vtk-navy/15 text-vtk-ink transition hover:border-vtk-navy/40 disabled:opacity-30"
                      >
                        −
                      </button>
                      <span className="w-6 text-center text-sm font-semibold text-vtk-ink">
                        {quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => setQuantity(item.id, quantity + 1)}
                        disabled={quantity >= (available ?? item.quantity)}
                        aria-label={`Meer: ${item.name}`}
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
        <h2 className="text-lg font-semibold tracking-tight text-vtk-ink">{en ? 'Request' : 'Aanvraag'}</h2>

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
            <span className="font-medium text-vtk-ink">{en ? 'What do you need it for?' : 'Waarvoor heb je het nodig?'}</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder={en ? 'E.g. event, move, activity...' : 'Bv. kiesweek-activiteit, verhuis, TD...'}
              className="rounded-lg border border-vtk-navy/15 bg-white px-3 py-2 text-vtk-ink"
            />
          </label>
        </div>

        <dl className="mt-5 space-y-1 border-t border-vtk-navy/10 pt-4 text-sm">
          <div className="flex justify-between">
            <dt className="text-vtk-muted">Items</dt>
            <dd className="font-medium text-vtk-ink">{totals.count}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-vtk-muted">{en ? 'Rental price' : 'Huurprijs'}</dt>
            <dd className="font-medium text-vtk-ink">{formatEuro(totals.price)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-vtk-muted">{en ? 'Deposit' : 'Waarborg'}</dt>
            <dd className="font-medium text-vtk-ink">{formatEuro(totals.deposit)}</dd>
          </div>
        </dl>
        {paymentNote ? (
          <p className="mt-2 text-xs leading-5 text-vtk-muted">{paymentNote}</p>
        ) : null}

        {error ? (
          <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}

          <p className="text-xs leading-5 text-vtk-muted">
            {en
              ? 'VTK uses the dates, selected equipment and note to handle this reservation. Avoid sensitive information in the free-text note unless necessary.'
              : 'VTK gebruikt de datums, het gekozen materiaal en de nota om deze reservatie af te handelen. Zet geen gevoelige informatie in de vrije nota tenzij noodzakelijk.'}
          </p>

          <Button
          type="button"
          size="lg"
          className="mt-5 w-full"
          onClick={submit}
          disabled={pending || totals.count === 0 || !pickupDate || !returnDate}
        >
          {pending ? (en ? 'Submitting...' : 'Indienen...') : en ? 'Submit request' : 'Aanvraag indienen'}
        </Button>
      </aside>
    </div>
  );
}
