'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { linkToEventAction } from '@/app/actions/beheer';
import { useToast } from '@/components/ui/toast';
import type { SelectableEvent } from '@/components/event-picker';

/**
 * Een aanvraag of rit onder een evenement hangen vanuit het beheer.
 *
 * Hoort thuis op de detailpagina en niet op het evenementscherm: daar zou je een
 * lijst van alle losse aanvragen moeten tonen om er een te vinden, terwijl je hier
 * al naar de aanvraag aan het kijken bent.
 */
export function EventLink({
  target,
  events,
  current,
}: {
  target: { kind: 'reservation' | 'transport'; id: string };
  events: SelectableEvent[];
  current: { id: string; name: string } | null;
}) {
  const router = useRouter();
  const showToast = useToast();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  function apply(eventId: string | null) {
    startTransition(async () => {
      const result = await linkToEventAction(target, eventId);
      if (result.ok) {
        showToast({ message: result.message ?? 'Bijgewerkt.', variant: 'success' });
        setOpen(false);
        router.refresh();
      } else {
        showToast({ message: result.error, variant: 'error', duration: 0 });
      }
    });
  }

  if (current) {
    return (
      <p className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-vtk-muted">Evenement</span>
        <Link
          href="/beheer/evenementen"
          className="font-medium text-vtk-ink underline decoration-vtk-yellow underline-offset-4"
        >
          {current.name}
        </Link>
        <button
          type="button"
          disabled={pending}
          onClick={() => apply(null)}
          className="text-vtk-muted underline underline-offset-2 disabled:opacity-50"
        >
          Loskoppelen
        </button>
      </p>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm text-vtk-muted underline underline-offset-2"
      >
        Aan een evenement koppelen
      </button>
    );
  }

  return (
    <div className="grid gap-1.5">
      <label className="text-sm text-vtk-muted" htmlFor={`event-${target.id}`}>
        Aan welk evenement?
      </label>
      <select
        id={`event-${target.id}`}
        defaultValue=""
        disabled={pending}
        onChange={(event) => {
          if (event.target.value) apply(event.target.value);
        }}
        className="h-10 rounded-lg border border-vtk-navy/15 bg-white px-3 text-sm text-vtk-ink"
      >
        <option value="">Kies een evenement...</option>
        {events.map((event) => (
          <option key={event.id} value={event.id}>
            {event.name}
            {event.startAt ? ` · ${event.startAt}` : ''}
          </option>
        ))}
      </select>
      {events.length === 0 ? (
        <p className="text-xs text-vtk-muted">
          Nog geen evenementen. Maak er een aan op{' '}
          <Link href="/beheer/evenementen" className="underline underline-offset-2">
            Evenementen
          </Link>
          .
        </p>
      ) : null}
    </div>
  );
}
