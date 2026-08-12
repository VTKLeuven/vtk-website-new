'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@vtk/ui';
import type { UitleenTransportBookingStatus } from '@prisma/client';
import { createTransportForReservationAction } from '@/app/actions/beheer';
import { useToast } from '@/components/ui/toast';
import { VanStatusBadge } from '@/components/status-badge';
import { formatDateTime } from '@/lib/uitleen';

/**
 * "Levering nodig" doorschuiven naar een echte rit.
 *
 * Het vinkje stond hier als één regel tussen de gegevens en deed verder niets:
 * er kwam geen rit van, dus het vervoerbeheer wist van niets en de levering
 * bestond enkel in het hoofd van wie die regel opmerkte. Deze knop maakt er de
 * rit van, voorgevuld met wat de aanvraag al weet.
 *
 * Voertuig en adressen vult Logistiek zelf aan: een lid dat materiaal aanvraagt
 * weet niet welk voertuig vrij is, en het laadadres is de loods en niet iets wat
 * het lid invult.
 */
type Trip = {
  id: string;
  status: UitleenTransportBookingStatus;
  startAt: Date;
  endAt: Date;
  tripLeg: string | null;
  vehicle: { nameNl: string };
};

type VehicleOption = { id: string; name: string };

export function DeliveryPanel({
  reservationId,
  deliveryNote,
  trips,
  vehicles,
  initial,
}: {
  reservationId: string;
  deliveryNote: string | null;
  /** Ritten die al aan deze aanvraag hangen. */
  trips: Trip[];
  vehicles: VehicleOption[];
  initial: {
    startAt: string;
    endAt: string;
    returnStartAt: string;
    returnEndAt: string;
    purpose: string;
    eventName: string;
    destination: string;
    contactPhone: string;
    notifyEmail: string;
    note: string;
  };
}) {
  const router = useRouter();
  const showToast = useToast();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const [vehicleIds, setVehicleIds] = useState<string[]>(vehicles[0] ? [vehicles[0].id] : []);
  const [startAt, setStartAt] = useState(initial.startAt);
  const [endAt, setEndAt] = useState(initial.endAt);
  // Een levering is bijna altijd heen én terug: het materiaal moet ook weer
  // opgehaald worden. De terugrit staat daarom voorgevuld op de terugbrengdag.
  const [roundTrip, setRoundTrip] = useState(Boolean(initial.returnStartAt));
  const [returnStartAt, setReturnStartAt] = useState(initial.returnStartAt);
  const [returnEndAt, setReturnEndAt] = useState(initial.returnEndAt);
  const [purpose, setPurpose] = useState(initial.purpose);
  const [pickupAddress, setPickupAddress] = useState('');
  const [destination, setDestination] = useState(initial.destination);
  const [contactPhone, setContactPhone] = useState(initial.contactPhone);
  const [note, setNote] = useState(initial.note);

  const toggleVehicle = (id: string) =>
    setVehicleIds((current) =>
      current.includes(id) ? current.filter((other) => other !== id) : [...current, id]
    );

  function submit() {
    startTransition(async () => {
      const result = await createTransportForReservationAction(reservationId, {
        vehicleIds,
        startAt,
        endAt,
        returnStartAt: roundTrip ? returnStartAt : undefined,
        returnEndAt: roundTrip ? returnEndAt : undefined,
        purpose,
        eventName: initial.eventName,
        pickupAddress,
        destination,
        contactPhone,
        notifyEmail: initial.notifyEmail,
        note,
      });
      if (result.ok) {
        showToast({ message: result.message ?? 'Rit aangemaakt.', variant: 'success' });
        setOpen(false);
        router.refresh();
      } else {
        showToast({ message: result.error, variant: 'error', duration: 0 });
      }
    });
  }

  const inputClass = 'h-10 rounded-lg border border-vtk-navy/15 bg-white px-3 text-sm text-vtk-ink';

  return (
    <section className="rounded-[18px] border border-vtk-yellow bg-vtk-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold tracking-tight text-vtk-ink">Levering gevraagd</h2>
          <p className="mt-1 text-sm text-vtk-body">
            {deliveryNote || 'Het lid vinkte "Levering nodig" aan, zonder verdere details.'}
          </p>
        </div>
        {trips.length === 0 && !open ? (
          <Button type="button" size="sm" onClick={() => setOpen(true)}>
            Rit aanmaken
          </Button>
        ) : null}
      </div>

      {trips.length > 0 ? (
        <ul className="mt-3 grid gap-2">
          {trips.map((trip) => (
            <li
              key={trip.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-vtk-navy/10 bg-vtk-paper/60 px-3 py-2 text-sm"
            >
              <span className="text-vtk-ink">
                <span className="font-medium">{trip.vehicle.nameNl}</span>
                {trip.tripLeg ? (
                  <span className="text-vtk-muted"> · {trip.tripLeg === 'HEEN' ? 'heen' : 'terug'}</span>
                ) : null}
                <span className="text-vtk-muted">
                  {' '}
                  · {formatDateTime(trip.startAt)} tot {formatDateTime(trip.endAt)}
                </span>
              </span>
              <span className="flex items-center gap-3">
                <VanStatusBadge status={trip.status} />
                <Link
                  href="/beheer/vervoer"
                  className="text-sm font-semibold text-vtk-navy underline underline-offset-2"
                >
                  Naar vervoer
                </Link>
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {open ? (
        <div className="mt-4 grid gap-3 rounded-[14px] border border-vtk-navy/10 bg-vtk-paper/50 p-4">
          <fieldset>
            <legend className="text-sm font-medium text-vtk-ink">Voertuig</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {vehicles.map((vehicle) => (
                <label
                  key={vehicle.id}
                  className={`cursor-pointer rounded-full border px-3.5 py-1.5 text-sm font-medium transition ${
                    vehicleIds.includes(vehicle.id)
                      ? 'border-vtk-navy bg-vtk-navy text-white'
                      : 'border-vtk-navy/15 text-vtk-ink hover:border-vtk-navy/40'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={vehicleIds.includes(vehicle.id)}
                    onChange={() => toggleVehicle(vehicle.id)}
                    className="sr-only"
                  />
                  {vehicle.name}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm">
              <span className="font-medium text-vtk-ink">Heen: van</span>
              {/* step=900: ritten worden op het kwartier gepland en de server
                  weigert een ander tijdstip. */}
              <input
                type="datetime-local"
                step={900}
                value={startAt}
                onChange={(event) => setStartAt(event.target.value)}
                className={inputClass}
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-medium text-vtk-ink">Heen: tot</span>
              <input
                type="datetime-local"
                step={900}
                value={endAt}
                min={startAt || undefined}
                onChange={(event) => setEndAt(event.target.value)}
                className={inputClass}
              />
            </label>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input
                type="checkbox"
                checked={roundTrip}
                onChange={(event) => setRoundTrip(event.target.checked)}
                className="h-4 w-4"
              />
              <span className="font-medium text-vtk-ink">Ook terug ophalen</span>
            </label>
            {roundTrip ? (
              <>
                <label className="grid gap-1 text-sm">
                  <span className="font-medium text-vtk-ink">Terug: van</span>
                  <input
                    type="datetime-local"
                    step={900}
                    value={returnStartAt}
                    min={endAt || undefined}
                    onChange={(event) => setReturnStartAt(event.target.value)}
                    className={inputClass}
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="font-medium text-vtk-ink">Terug: tot</span>
                  <input
                    type="datetime-local"
                    step={900}
                    value={returnEndAt}
                    min={returnStartAt || undefined}
                    onChange={(event) => setReturnEndAt(event.target.value)}
                    className={inputClass}
                  />
                </label>
              </>
            ) : null}
            <label className="grid gap-1 text-sm sm:col-span-2">
              <span className="font-medium text-vtk-ink">Waarvoor dient de rit?</span>
              <input
                type="text"
                value={purpose}
                onChange={(event) => setPurpose(event.target.value)}
                className={inputClass}
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-medium text-vtk-ink">Laadadres</span>
              <input
                type="text"
                value={pickupAddress}
                onChange={(event) => setPickupAddress(event.target.value)}
                placeholder="Bv. de loods"
                className={inputClass}
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-medium text-vtk-ink">Bestemming</span>
              <input
                type="text"
                value={destination}
                onChange={(event) => setDestination(event.target.value)}
                placeholder="Bv. Alma 2"
                className={inputClass}
              />
            </label>
            <label className="grid gap-1 text-sm sm:col-span-2">
              <span className="font-medium text-vtk-ink">Telefoon van de aanvrager</span>
              <input
                type="tel"
                value={contactPhone}
                onChange={(event) => setContactPhone(event.target.value)}
                placeholder="+32 4.."
                className={inputClass}
              />
            </label>
            <label className="grid gap-1 text-sm sm:col-span-2">
              <span className="font-medium text-vtk-ink">Extra info</span>
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                rows={2}
                className="rounded-lg border border-vtk-navy/15 bg-white px-3 py-2 text-sm text-vtk-ink"
              />
            </label>
          </div>

          <p className="text-xs text-vtk-muted">
            De rit komt op naam van de aanvrager en staat op &ldquo;aangevraagd&rdquo;. Keur ze
            daarna goed bij Vervoer: daar gebeurt de botsingscontrole per voertuig en kies je de
            betaalwijze en de chauffeur.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              onClick={submit}
              disabled={pending || vehicleIds.length === 0 || !startAt || !endAt || !purpose.trim()}
            >
              {pending ? 'Aanmaken...' : 'Rit aanmaken'}
            </Button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-sm text-vtk-muted underline underline-offset-2"
            >
              Annuleren
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
