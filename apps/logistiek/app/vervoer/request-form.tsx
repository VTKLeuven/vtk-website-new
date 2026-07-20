'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@vtk/ui';
import type { UitleenPricingMode } from '@prisma/client';
import { createVanBookingAction } from '@/app/actions/uitleen';
import { formatEuro, formatPriceCents, transportPriceCents } from '@/lib/uitleen';
import type { RequesterOption } from '@/app/materiaal/event-fields';

type VehicleOption = { id: string; name: string; pricingMode: UitleenPricingMode; rateCents: number };

export function VanRequestForm({
  locale,
  vehicles,
  groups: _groups,
}: {
  locale: 'nl' | 'en';
  vehicles: VehicleOption[];
  groups: RequesterOption[];
}) {
  const en = locale === 'en';
  const router = useRouter();
  const [vehicleId, setVehicleId] = useState(vehicles[0]?.id ?? '');
  const [startAt, setStartAt] = useState('');
  const [endAt, setEndAt] = useState('');
  const [purpose, setPurpose] = useState('');
  const [eventName, setEventName] = useState('');
  const [pickupAddress, setPickupAddress] = useState('');
  const [destination, setDestination] = useState('');
  const [helpersNote, setHelpersNote] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const vehicle = vehicles.find((v) => v.id === vehicleId);

  // Prijsindicatie volgens de tariefmodus van het gekozen voertuig.
  const estimate = useMemo(() => {
    if (!vehicle) return { label: '-', tbd: false };
    if (vehicle.pricingMode === 'PER_KM') {
      return { label: `${formatEuro(vehicle.rateCents)} ${en ? 'per km' : 'per km'}`, tbd: true };
    }
    const start = new Date(startAt);
    const end = new Date(endAt);
    if (!startAt || !endAt || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      return { label: '-', tbd: false };
    }
    const cents = transportPriceCents({
      pricingMode: vehicle.pricingMode,
      rateCents: vehicle.rateCents,
      startAt: start,
      endAt: end,
    });
    return { label: formatPriceCents(cents), tbd: false };
  }, [vehicle, startAt, endAt, en]);

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await createVanBookingAction({
        vehicleId,
        startAt,
        endAt,
        purpose,
        eventName,
        pickupAddress,
        destination,
        helpersNote,
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
      <h2 className="text-lg font-semibold tracking-tight text-vtk-ink">
        {en ? 'Request a trip' : 'Rit aanvragen'}
      </h2>

      <fieldset className="mt-4">
        <legend className="text-sm font-medium text-vtk-ink">{en ? 'Vehicle' : 'Voertuig'}</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {vehicles.map((v) => (
            <label
              key={v.id}
              className={`cursor-pointer rounded-full border px-3.5 py-1.5 text-sm font-medium transition ${
                vehicleId === v.id
                  ? 'border-vtk-navy bg-vtk-navy text-white'
                  : 'border-vtk-navy/15 text-vtk-ink hover:border-vtk-navy/40'
              }`}
            >
              <input
                type="radio"
                name="vehicle"
                value={v.id}
                checked={vehicleId === v.id}
                onChange={() => setVehicleId(v.id)}
                className="sr-only"
              />
              {v.name}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm">
          <span className="font-medium text-vtk-ink">{en ? 'From' : 'Van'}</span>
          <input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} className={inputClass} />
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
            placeholder={en ? 'E.g. collect equipment for the 24-hour run' : 'Bv. materiaal ophalen voor de 24 urenloop'}
            className={inputClass}
          />
        </label>
        <label className="grid gap-1 text-sm sm:col-span-2">
          <span className="font-medium text-vtk-ink">{en ? 'Event (optional)' : 'Evenement (optioneel)'}</span>
          <input type="text" value={eventName} onChange={(e) => setEventName(e.target.value)} className={inputClass} />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium text-vtk-ink">{en ? 'Loading address (optional)' : 'Laadadres (optioneel)'}</span>
          <input type="text" value={pickupAddress} onChange={(e) => setPickupAddress(e.target.value)} className={inputClass} />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium text-vtk-ink">{en ? 'Destination (optional)' : 'Bestemming (optioneel)'}</span>
          <input type="text" value={destination} onChange={(e) => setDestination(e.target.value)} className={inputClass} />
        </label>
        <label className="grid gap-1 text-sm sm:col-span-2">
          <span className="font-medium text-vtk-ink">
            {en ? 'Co-drivers you provide (optional)' : 'Bijrijders die je voorziet (optioneel)'}
          </span>
          <input
            type="text"
            value={helpersNote}
            onChange={(e) => setHelpersNote(e.target.value)}
            placeholder={en ? 'E.g. two helpers from our team' : 'Bv. twee helpers van onze werkgroep'}
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
        {en ? 'Estimated price:' : 'Geschatte prijs:'} <strong className="text-vtk-ink">{estimate.label}</strong>{' '}
        <span className="text-vtk-muted">
          {estimate.tbd
            ? en
              ? '(distance entered after the trip)'
              : '(kilometers na de rit)'
            : en
              ? '(final after approval)'
              : '(definitief bij goedkeuring)'}
        </span>
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
        disabled={pending || !vehicleId || !startAt || !endAt || !purpose.trim()}
      >
        {pending ? (en ? 'Submitting...' : 'Indienen...') : en ? 'Request trip' : 'Rit aanvragen'}
      </Button>
    </section>
  );
}
