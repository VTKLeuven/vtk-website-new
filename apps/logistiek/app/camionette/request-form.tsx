'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@vtk/ui';
import { createVanBookingAction } from '@/app/actions/uitleen';
import { formatEuro, VAN_HOURLY_RATE_CENTS } from '@/lib/uitleen';

export function VanRequestForm({ locale }: { locale: 'nl' | 'en' }) {
  const en = locale === 'en';
  const router = useRouter();
  const [startAt, setStartAt] = useState('');
  const [endAt, setEndAt] = useState('');
  const [purpose, setPurpose] = useState('');
  const [pickupAddress, setPickupAddress] = useState('');
  const [destination, setDestination] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Zelfde regel als op de server: elk begonnen uur telt, minimum één uur.
  const estimateCents = useMemo(() => {
    const start = new Date(startAt);
    const end = new Date(endAt);
    if (!startAt || !endAt || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return null;
    }
    const ms = end.getTime() - start.getTime();
    if (ms <= 0) return null;
    return Math.max(1, Math.ceil(ms / (60 * 60 * 1000))) * VAN_HOURLY_RATE_CENTS;
  }, [startAt, endAt]);

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await createVanBookingAction({
        startAt,
        endAt,
        purpose,
        pickupAddress,
        destination,
        note,
      });
      if (result.ok) {
        router.push('/reservaties?aangevraagd=1');
      } else {
        setError(result.error);
      }
    });
  }

  const inputClass = 'h-10 rounded-lg border border-vtk-navy/15 bg-white px-3 text-vtk-ink';

  return (
    <section className="rounded-[18px] border border-vtk-navy/10 bg-vtk-surface p-6">
      <h2 className="text-lg font-semibold tracking-tight text-vtk-ink">{en ? 'Request a trip' : 'Rit aanvragen'}</h2>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm">
          <span className="font-medium text-vtk-ink">{en ? 'From' : 'Van'}</span>
          <input
            type="datetime-local"
            value={startAt}
            onChange={(e) => setStartAt(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium text-vtk-ink">{en ? 'Until' : 'Tot'}</span>
          <input
            type="datetime-local"
            value={endAt}
            min={startAt || undefined}
            onChange={(e) => setEndAt(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="grid gap-1 text-sm sm:col-span-2">
          <span className="font-medium text-vtk-ink">{en ? 'What is the trip for?' : 'Waarvoor dient de rit?'}</span>
          <input
            type="text"
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            placeholder={en ? 'E.g. collect equipment for an event' : 'Bv. materiaal ophalen voor de 24 urenloop'}
            className={inputClass}
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium text-vtk-ink">{en ? 'Loading address (optional)' : 'Laadadres (optioneel)'}</span>
          <input
            type="text"
            value={pickupAddress}
            onChange={(e) => setPickupAddress(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium text-vtk-ink">{en ? 'Destination (optional)' : 'Bestemming (optioneel)'}</span>
          <input
            type="text"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="grid gap-1 text-sm sm:col-span-2">
          <span className="font-medium text-vtk-ink">{en ? 'Extra information (optional)' : 'Extra info (optioneel)'}</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            className="rounded-lg border border-vtk-navy/15 bg-white px-3 py-2 text-vtk-ink"
          />
        </label>
      </div>

      <p className="mt-4 text-sm text-vtk-body">
        {en ? 'Estimated price:' : 'Geschatte prijs:'}{' '}
        <strong className="text-vtk-ink">
          {estimateCents !== null ? formatEuro(estimateCents) : '-'}
        </strong>
        {estimateCents !== null ? (
          <span className="text-vtk-muted"> ({en ? 'final after approval' : 'definitief bij goedkeuring'})</span>
        ) : null}
      </p>
      <p className="mt-3 text-xs leading-5 text-vtk-muted">
        {en
          ? 'VTK uses these details to plan and administer the trip. Avoid sensitive information in the free-text note unless it is necessary.'
          : 'VTK gebruikt deze gegevens om de rit te plannen en administreren. Zet geen gevoelige informatie in de vrije nota tenzij dat noodzakelijk is.'}
      </p>

      {error ? (
        <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <Button
        type="button"
        size="lg"
        className="mt-5"
        onClick={submit}
        disabled={pending || !startAt || !endAt || !purpose.trim()}
      >
        {pending ? (en ? 'Submitting...' : 'Indienen...') : en ? 'Request trip' : 'Rit aanvragen'}
      </Button>
    </section>
  );
}
