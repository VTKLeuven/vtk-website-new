'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { previewShiftAction, shiftReservationDatesAction } from '@/app/actions/beheer';
import { SaveForm } from '@/components/ui/save-form';

/**
 * Twee aanvragen die om hetzelfde materiaal vechten, en de knoppen om ze uit
 * elkaar te schuiven.
 *
 * Afwijzen was tot nu toe het enige antwoord, terwijl twee aanvragen vaak samen
 * passen na een dag schuiven. Daarom staat hier van beide aanvragen de periode,
 * wie er eerst was, en per aanvraag een datumveld met een "past dit?"-knop.
 *
 * Schuiven mailt de aanvrager (A9), dus de twee partijen weten het zonder dat
 * iemand een mail moet typen.
 */
const SHIFT_ERRORS = {
  DATE_INVALID: 'Kies twee geldige datums.',
  DATE_ORDER: 'De terugbrengdatum ligt voor de afhaaldatum.',
  NOT_FOUND: 'Aanvraag niet gevonden.',
  LOCKED: 'Deze aanvraag kan niet meer verschoven worden.',
  UNCHANGED: 'Die datums staan er al.',
};

export type ConflictLine = {
  itemName: string;
  requested: number;
  available: number;
};

export type ConflictParty = {
  id: string;
  label: string;
  requester: string;
  pickupDate: string;
  returnDate: string;
  /** Wie het eerst indiende; dat is wat het team als argument gebruikt. */
  requestedAtLabel: string;
  /** Hoeveel stuks van de betwiste items deze aanvraag vasthoudt. */
  holding?: string;
  self?: boolean;
};

function ShiftForm({ party }: { party: ConflictParty }) {
  const [pickup, setPickup] = useState(party.pickupDate);
  const [ret, setRet] = useState(party.returnDate);
  const [preview, setPreview] = useState<{ fits: boolean; detail: string } | null>(null);
  const [checking, startChecking] = useTransition();

  function check() {
    startChecking(async () => {
      const result = await previewShiftAction(party.id, pickup, ret);
      setPreview(result.ok ? { fits: result.fits, detail: result.detail } : { fits: false, detail: result.error });
    });
  }

  return (
    <SaveForm
      action={shiftReservationDatesAction}
      submitLabel="Verschuiven"
      savingLabel="Bezig..."
      savedMessage="Datums verschoven; de aanvrager kreeg een mail."
      errorMessages={SHIFT_ERRORS}
      submitVariant="secondary"
      className="mt-2 grid gap-2 sm:grid-cols-[auto_auto_auto_minmax(0,1fr)] sm:items-end"
    >
      <input type="hidden" name="reservationId" value={party.id} />
      <label className="grid gap-1 text-[11px] font-medium text-vtk-muted">
        Afhalen
        <input
          type="date"
          name="pickupDate"
          value={pickup}
          onChange={(event) => {
            setPickup(event.target.value);
            setPreview(null);
          }}
          className="h-9 rounded-lg border border-vtk-navy/15 bg-white px-2 text-sm text-vtk-ink"
        />
      </label>
      <label className="grid gap-1 text-[11px] font-medium text-vtk-muted">
        Terugbrengen
        <input
          type="date"
          name="returnDate"
          value={ret}
          onChange={(event) => {
            setRet(event.target.value);
            setPreview(null);
          }}
          className="h-9 rounded-lg border border-vtk-navy/15 bg-white px-2 text-sm text-vtk-ink"
        />
      </label>
      <button
        type="button"
        onClick={check}
        disabled={checking}
        className="h-9 rounded-full border border-vtk-navy/15 px-3.5 text-sm font-semibold text-vtk-ink transition hover:border-vtk-navy/40 disabled:opacity-50"
      >
        {checking ? 'Nakijken...' : 'Past dit?'}
      </button>
      {preview ? (
        <p
          className={`text-xs ${preview.fits ? 'font-semibold text-green-700' : 'text-amber-900'}`}
          aria-live="polite"
        >
          {preview.detail}
        </p>
      ) : (
        <span />
      )}
    </SaveForm>
  );
}

export function ConflictPanel({
  lines,
  parties,
}: {
  lines: ConflictLine[];
  parties: ConflictParty[];
}) {
  return (
    <section className="mt-5 rounded-[16px] border border-amber-300 bg-amber-50/70 p-4">
      <h3 className="text-sm font-semibold text-amber-900">Botst met een andere aanvraag</h3>
      <ul className="mt-1.5 space-y-0.5 text-sm text-amber-900">
        {lines.map((line) => (
          <li key={line.itemName}>
            <span className="font-medium">{line.itemName}</span>: {line.requested} gevraagd,{' '}
            {line.available} vrij in deze periode
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-amber-900">
        Goedkeuren kan pas wanneer het past. Verschuif de periode van een van beide aanvragen; de
        aanvrager krijgt daar automatisch bericht van.
      </p>

      <div className="mt-3 grid gap-3">
        {parties.map((party) => (
          <div key={party.id} className="rounded-[12px] border border-amber-200 bg-white/70 p-3">
            <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
              <span className="font-semibold text-vtk-ink">
                {party.self ? 'Deze aanvraag' : party.label}
              </span>
              <span className="text-vtk-muted">
                {party.requester} · ingediend {party.requestedAtLabel}
                {party.holding ? ` · ${party.holding}` : ''}
              </span>
              {!party.self ? (
                <Link
                  href={`/beheer/aanvragen/${party.id}`}
                  className="text-xs font-semibold text-vtk-navy underline decoration-vtk-yellow underline-offset-4"
                >
                  Openen
                </Link>
              ) : null}
            </p>
            <ShiftForm party={party} />
          </div>
        ))}
      </div>
    </section>
  );
}
