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
  const [helpersPhone, setHelpersPhone] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [notifyEmail, setNotifyEmail] = useState('');
  const [roundTrip, setRoundTrip] = useState(false);
  const [returnStartAt, setReturnStartAt] = useState('');
  const [returnEndAt, setReturnEndAt] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const vehicle = vehicles.find((v) => v.id === vehicleId);

  // Prijsindicatie volgens de tariefmodus van het gekozen voertuig. Bij heen en
  // terug is het de som van beide ritten: ze worden apart aangerekend, want het
  // voertuig staat er tussenin niet op.
  const estimate = useMemo(() => {
    if (!vehicle) return { label: '-', tbd: false };
    if (vehicle.pricingMode === 'PER_KM') {
      return { label: `${formatEuro(vehicle.rateCents)} ${en ? 'per km' : 'per km'}`, tbd: true };
    }
    const legCents = (from: string, to: string): number | null => {
      const start = new Date(from);
      const end = new Date(to);
      if (!from || !to || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
        return null;
      }
      return transportPriceCents({
        pricingMode: vehicle.pricingMode,
        rateCents: vehicle.rateCents,
        startAt: start,
        endAt: end,
      });
    };
    const outbound = legCents(startAt, endAt);
    if (outbound === null) return { label: '-', tbd: false };
    if (!roundTrip) return { label: formatPriceCents(outbound), tbd: false };
    const inbound = legCents(returnStartAt, returnEndAt);
    if (inbound === null) return { label: '-', tbd: false };
    return { label: formatPriceCents(outbound + inbound), tbd: false };
  }, [vehicle, startAt, endAt, roundTrip, returnStartAt, returnEndAt, en]);

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
        helpersPhone,
        contactPhone,
        notifyEmail,
        note,
        returnStartAt: roundTrip ? returnStartAt : undefined,
        returnEndAt: roundTrip ? returnEndAt : undefined,
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
          {/* step=900: ritten worden op het kwartier gepland, en de server weigert
              een ander tijdstip. De picker springt zo mee in kwartieren. */}
          <input
            type="datetime-local"
            step={900}
            value={startAt}
            onChange={(e) => setStartAt(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium text-vtk-ink">{en ? 'Until' : 'Tot'}</span>
          <input
            type="datetime-local"
            step={900}
            value={endAt}
            min={startAt || undefined}
            onChange={(e) => setEndAt(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input
            type="checkbox"
            checked={roundTrip}
            onChange={(e) => setRoundTrip(e.target.checked)}
            className="h-4 w-4"
          />
          <span className="font-medium text-vtk-ink">
            {en ? 'I also need a return trip' : 'Ik heb ook een terugrit nodig'}
          </span>
        </label>
        {roundTrip ? (
          <>
            <label className="grid gap-1 text-sm">
              <span className="font-medium text-vtk-ink">{en ? 'Back: from' : 'Terug: van'}</span>
              <input
                type="datetime-local"
                step={900}
                value={returnStartAt}
                min={endAt || undefined}
                onChange={(e) => setReturnStartAt(e.target.value)}
                className={inputClass}
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-medium text-vtk-ink">{en ? 'Back: until' : 'Terug: tot'}</span>
              <input
                type="datetime-local"
                step={900}
                value={returnEndAt}
                min={returnStartAt || undefined}
                onChange={(e) => setReturnEndAt(e.target.value)}
                className={inputClass}
              />
            </label>
            <p className="text-xs text-vtk-muted sm:col-span-2">
              {en
                ? 'The vehicle is free in between, so this becomes two trips in one request. Logistics decides on both at once.'
                : 'Tussenin is het voertuig vrij, dus dit worden twee ritten in één aanvraag. Logistiek beslist over allebei tegelijk.'}
            </p>
          </>
        ) : null}
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
        <label className="grid gap-1 text-sm">
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
        <label className="grid gap-1 text-sm">
          <span className="font-medium text-vtk-ink">
            {en ? 'Co-driver phone (optional)' : 'Telefoon bijrijder (optioneel)'}
          </span>
          <input
            type="tel"
            value={helpersPhone}
            onChange={(e) => setHelpersPhone(e.target.value)}
            placeholder="+32 4.."
            className={inputClass}
          />
        </label>
        <label className="grid gap-1 text-sm sm:col-span-2">
          <span className="font-medium text-vtk-ink">
            {en ? 'Your phone number' : 'Jouw telefoonnummer'}
          </span>
          <input
            type="tel"
            value={contactPhone}
            onChange={(e) => setContactPhone(e.target.value)}
            placeholder="+32 4.."
            className={inputClass}
          />
          <span className="text-xs text-vtk-muted">
            {en
              ? 'The driver calls this number if something changes on the road.'
              : 'De chauffeur belt dit nummer wanneer er onderweg iets wijzigt.'}
          </span>
        </label>
        <label className="grid gap-1 text-sm sm:col-span-2">
          <span className="font-medium text-vtk-ink">
            {en ? 'Extra address to keep posted' : 'Extra adres dat op de hoogte blijft'}
          </span>
          <input
            type="email"
            value={notifyEmail}
            onChange={(e) => setNotifyEmail(e.target.value)}
            placeholder="bv. logistiek.existenz@vtk.be"
            className={inputClass}
          />
          <span className="text-xs text-vtk-muted">
            {en
              ? 'Optional. Gets a copy of every mail about this trip.'
              : 'Optioneel. Krijgt elke mail over deze rit in kopie.'}
          </span>
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
        disabled={
          pending ||
          !vehicleId ||
          !startAt ||
          !endAt ||
          !purpose.trim() ||
          (roundTrip && (!returnStartAt || !returnEndAt))
        }
      >
        {pending ? (en ? 'Submitting...' : 'Indienen...') : en ? 'Request trip' : 'Rit aanvragen'}
      </Button>
    </section>
  );
}
