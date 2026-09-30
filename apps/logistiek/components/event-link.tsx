'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ConfirmDialog } from '@vtk/ui';
import { linkToEventAction } from '@/app/actions/beheer';
import { linkCollectEnGoOrderToEventAction } from '@/app/actions/collectengo';
import { useToast } from '@/components/ui/toast';
import type { SelectableEvent } from '@/components/event-picker';

/**
 * Een aanvraag of rit onder een evenement hangen vanuit het beheer.
 *
 * Hoort thuis op de detailpagina en niet op het evenementscherm: daar zou je een
 * lijst van alle losse aanvragen moeten tonen om er een te vinden, terwijl je hier
 * al naar de aanvraag aan het kijken bent. Voor een rit staat het op twee
 * plekken, in de lijst Ritten en in het paneel van de transportplanning, en
 * beide gebruiken dit component met dezelfde actie.
 */
export function EventLink({
  target,
  events,
  current,
  looseName = null,
  showLabel = true,
}: {
  /** Een aanvraag, een rit, of een Collect&Go-bestelling (E5). */
  target: { kind: 'reservation' | 'transport' | 'collectengo'; id: string };
  events: SelectableEvent[];
  current: { id: string; name: string } | null;
  /**
   * Enkel bij een rit: een evenementnaam zonder koppeling. Dat is wat een lid
   * vrij intikte, of een naam die bleef staan toen "Loskoppelen" hem nog niet
   * meenam (tot september 2026). Het scherm toont hem als naam van de
   * aanvrager, met een knop om hem te wissen.
   */
  looseName?: string | null;
  /**
   * "Evenement" voor de naam zetten. Uit waar de rij al een opschrift heeft
   * ("Hoort bij evenement" in een feitenlijst); anders staat het er twee keer.
   */
  showLabel?: boolean;
}) {
  const router = useRouter();
  const showToast = useToast();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  function apply(eventId: string | null) {
    startTransition(async () => {
      const result =
        target.kind === 'collectengo'
          ? await linkCollectEnGoOrderToEventAction(target.id, eventId)
          : await linkToEventAction({ kind: target.kind, id: target.id }, eventId);
      setConfirmClear(false);
      if (result.ok) {
        showToast({ message: result.message ?? 'Bijgewerkt.', variant: 'success' });
        setOpen(false);
        router.refresh();
      } else {
        showToast({ message: result.error, variant: 'error', duration: 0 });
      }
    });
  }

  const linkButton = 'text-vtk-muted underline underline-offset-2 disabled:opacity-50';

  if (open) {
    return (
      <div className="grid gap-1.5">
        <label className="text-sm text-vtk-muted" htmlFor={`event-${target.id}`}>
          {current ? 'Naar welk evenement?' : 'Aan welk evenement?'}
        </label>
        <select
          id={`event-${target.id}`}
          defaultValue={current?.id ?? ''}
          disabled={pending}
          onChange={(event) => {
            if (event.target.value && event.target.value !== current?.id) apply(event.target.value);
          }}
          className="h-10 rounded-lg border border-vtk-navy/15 bg-vtk-field px-3 text-sm text-vtk-ink"
        >
          <option value="">Kies een evenement...</option>
          {events.map((event) => (
            <option key={event.id} value={event.id}>
              {event.name}
              {event.startAt ? ` · ${event.startAt}` : ''}
            </option>
          ))}
          {/* Het huidige evenement ligt buiten de lijst (ouder dan een maand):
              zonder deze regel toont de keuzelijst "Kies een evenement..." en
              lijkt de rit nergens aan te hangen. */}
          {current && !events.some((event) => event.id === current.id) ? (
            <option value={current.id}>{current.name}</option>
          ) : null}
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
        <button
          type="button"
          onClick={() => setOpen(false)}
          className={`justify-self-start text-xs ${linkButton}`}
        >
          Annuleren
        </button>
      </div>
    );
  }

  if (current) {
    return (
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        {showLabel ? <span className="text-vtk-muted">Evenement</span> : null}
        <Link
          href={`/beheer/evenementen#${current.id}`}
          className="font-medium text-vtk-ink underline decoration-vtk-yellow underline-offset-4"
        >
          {current.name}
        </Link>
        <button type="button" disabled={pending} onClick={() => setOpen(true)} className={linkButton}>
          Wijzigen
        </button>
        <button type="button" disabled={pending} onClick={() => apply(null)} className={linkButton}>
          Loskoppelen
        </button>
      </p>
    );
  }

  const name = looseName?.trim();
  return (
    <div className="grid gap-1 text-sm">
      {name ? (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-medium text-vtk-ink">{name}</span>
          <span className="text-xs text-vtk-muted">door de aanvrager ingevuld, niet gekoppeld</span>
          <button
            type="button"
            disabled={pending}
            onClick={() => setConfirmClear(true)}
            className={linkButton}
          >
            Wissen
          </button>
        </p>
      ) : null}
      <button type="button" onClick={() => setOpen(true)} className={`justify-self-start ${linkButton}`}>
        Aan een evenement koppelen
      </button>
      {name ? (
        <ConfirmDialog
          open={confirmClear}
          title="Deze naam wissen?"
          description={`"${name}" verdwijnt van de rit (bij een heen- en terugrit van beide helften). Waarvoor de rit dient en al de rest blijft staan, en de oude naam blijft leesbaar in de historiek.`}
          confirmLabel="Wissen"
          cancelLabel="Annuleren"
          destructive
          pending={pending}
          onConfirm={() => apply(null)}
          onCancel={() => setConfirmClear(false)}
        />
      ) : null}
    </div>
  );
}
