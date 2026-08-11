'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@vtk/ui';
import type { UitleenPricingMode } from '@prisma/client';
import { createVanBookingAction } from '@/app/actions/uitleen';
import { formatDateTime, formatEuro, formatPriceCents, transportPriceCents } from '@/lib/uitleen';
import { useFormDraft } from '@/lib/use-form-draft';
import { EventPicker, type SelectableEvent } from '@/components/event-picker';
import type { RequesterOption } from '@/app/materiaal/event-fields';

type VehicleOption = { id: string; name: string; pricingMode: UitleenPricingMode; rateCents: number };

export function VanRequestForm({
  locale,
  vehicles,
  groups: _groups,
  draftKey,
  events,
}: {
  locale: 'nl' | 'en';
  vehicles: VehicleOption[];
  groups: RequesterOption[];
  /** Zie ReservationForm: lokaal concept, per lid. */
  draftKey?: string;
  /** Evenementen om deze rit onder te hangen (A8). */
  events?: SelectableEvent[];
}) {
  const en = locale === 'en';
  const router = useRouter();
  // Meerkeuze: een verhuis met de kar én de auto is één vraag. De eerste staat
  // aangevinkt, zodat de gewone aanvraag (één voertuig) even snel blijft.
  const [vehicleIds, setVehicleIds] = useState<string[]>(
    vehicles[0] ? [vehicles[0].id] : []
  );
  const toggleVehicle = (id: string) =>
    setVehicleIds((current) =>
      current.includes(id) ? current.filter((other) => other !== id) : [...current, id]
    );
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
  const [eventLink, setEventLink] = useState({ eventId: '', createEvent: false });
  /**
   * Een gekozen evenement vult de naam in plaats van dat je ze opnieuw typt; zie
   * het materiaalformulier. Loskoppelen geeft het veld weer vrij.
   */
  const linkedEvent = events?.find((entry) => entry.id === eventLink.eventId) ?? null;
  function chooseEvent(next: { eventId: string; createEvent: boolean }) {
    setEventLink(next);
    const picked = events?.find((entry) => entry.id === next.eventId);
    if (picked) setEventName(picked.name);
  }
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const chosen = vehicles.filter((v) => vehicleIds.includes(v.id));

  // Zelfde lokale concept als bij materiaal: een rit aanvragen is korter, maar
  // een dichtgevallen tab kost evengoed alles.
  const draftValue = useMemo(
    () => ({
      vehicleIds,
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
      roundTrip,
      returnStartAt,
      returnEndAt,
      note,
    }),
    [
      vehicleIds,
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
      roundTrip,
      returnStartAt,
      returnEndAt,
      note,
    ]
  );
  const draft = useFormDraft<typeof draftValue>(
    draftKey ?? null,
    draftValue,
    Boolean(draftKey),
    (value) => value.purpose.trim() === '' && value.startAt === '' && value.endAt === ''
  );

  function restoreDraft() {
    const saved = draft.restore();
    if (!saved) return;
    setVehicleIds(saved.vehicleIds);
    setStartAt(saved.startAt);
    setEndAt(saved.endAt);
    setPurpose(saved.purpose);
    setEventName(saved.eventName);
    setPickupAddress(saved.pickupAddress);
    setDestination(saved.destination);
    setHelpersNote(saved.helpersNote);
    setHelpersPhone(saved.helpersPhone);
    setContactPhone(saved.contactPhone);
    setNotifyEmail(saved.notifyEmail);
    setRoundTrip(saved.roundTrip);
    setReturnStartAt(saved.returnStartAt);
    setReturnEndAt(saved.returnEndAt);
    setNote(saved.note);
  }

  // Prijsindicatie: som over de gekozen voertuigen, en bij heen en terug over
  // beide ritten. Ze worden apart aangerekend, want het voertuig staat er
  // tussenin niet op. Zit er een per-km-voertuig bij, dan is het totaal pas na de
  // rit gekend en zeggen we dat ook.
  const estimate = useMemo(() => {
    if (chosen.length === 0) return { label: '-', tbd: false };
    const window = (from: string, to: string): { start: Date; end: Date } | null => {
      const start = new Date(from);
      const end = new Date(to);
      if (!from || !to || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
        return null;
      }
      return { start, end };
    };
    const windows: Array<{ start: Date; end: Date }> = [];
    for (const entry of [
      window(startAt, endAt),
      ...(roundTrip ? [window(returnStartAt, returnEndAt)] : []),
    ]) {
      if (!entry) return { label: '-', tbd: false };
      windows.push(entry);
    }

    const perKm = chosen.filter((v) => v.pricingMode === 'PER_KM');
    const fixed = chosen.filter((v) => v.pricingMode !== 'PER_KM');
    const total = fixed.reduce(
      (sum, v) =>
        sum +
        windows.reduce(
          (legs, entry) =>
            legs +
            // Null betekent "pas na de rit gekend", en dat kan hier niet: de
            // per-km-voertuigen zitten in `perKm` en niet in `fixed`.
            (transportPriceCents({
              pricingMode: v.pricingMode,
              rateCents: v.rateCents,
              startAt: entry.start,
              endAt: entry.end,
            }) ?? 0),
          0
        ),
      0
    );
    if (perKm.length === 0) return { label: formatPriceCents(total), tbd: false };
    const kmPart = perKm
      .map((v) => `${formatEuro(v.rateCents)} ${en ? 'per km' : 'per km'} (${v.name})`)
      .join(' + ');
    return {
      label: fixed.length > 0 ? `${formatPriceCents(total)} + ${kmPart}` : kmPart,
      tbd: true,
    };
  }, [chosen, startAt, endAt, roundTrip, returnStartAt, returnEndAt, en]);

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await createVanBookingAction({
        vehicleIds,
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
        eventId: eventLink.eventId || null,
        createEvent: eventLink.createEvent,
        note,
        returnStartAt: roundTrip ? returnStartAt : undefined,
        returnEndAt: roundTrip ? returnEndAt : undefined,
      });
      if (result.ok) {
        draft.clear();
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

      {draft.found ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-vtk-navy/15 bg-vtk-paper px-4 py-3 text-sm">
          <p className="text-vtk-body">
            <span className="font-semibold text-vtk-ink">
              {en ? 'You had a trip in progress' : 'Je had een rit in opbouw'}
            </span>
            {draft.savedAt ? (
              <span className="text-vtk-muted">
                {' '}
                · {en ? 'saved' : 'bewaard'} {formatDateTime(draft.savedAt, locale)}
              </span>
            ) : null}
          </p>
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" onClick={restoreDraft}>
              {en ? 'Continue' : 'Verder werken'}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={draft.discard}>
              {en ? 'Discard' : 'Weggooien'}
            </Button>
          </div>
        </div>
      ) : null}

      {events ? (
        <div className="mt-4">
          <EventPicker
            events={events}
            eventId={eventLink.eventId}
            createEvent={eventLink.createEvent}
            onChange={chooseEvent}
            locale={locale}
            newEventName={eventName}
          />
        </div>
      ) : null}

      <fieldset className="mt-4">
        <legend className="text-sm font-medium text-vtk-ink">
          {en ? 'Vehicle' : 'Voertuig'}
        </legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {vehicles.map((v) => (
            <label
              key={v.id}
              className={`cursor-pointer rounded-full border px-3.5 py-1.5 text-sm font-medium transition ${
                vehicleIds.includes(v.id)
                  ? 'border-vtk-navy bg-vtk-navy text-white'
                  : 'border-vtk-navy/15 text-vtk-ink hover:border-vtk-navy/40'
              }`}
            >
              <input
                type="checkbox"
                name="vehicle"
                value={v.id}
                checked={vehicleIds.includes(v.id)}
                onChange={() => toggleVehicle(v.id)}
                className="sr-only"
              />
              {v.name}
            </label>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-vtk-muted">
          {en
            ? 'You can pick more than one; they are decided together.'
            : 'Je kan er meerdere kiezen; ze worden samen beslist.'}
        </p>
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
        {linkedEvent ? (
          <div className="grid gap-1 text-sm sm:col-span-2">
            <span className="font-medium text-vtk-ink">{en ? 'Event' : 'Evenement'}</span>
            <p className="flex h-10 items-center rounded-lg border border-dashed border-vtk-navy/20 bg-vtk-paper px-3 text-vtk-muted">
              {linkedEvent.name}
            </p>
            <span className="text-xs text-vtk-muted">
              {en ? 'Comes from the event you picked above.' : 'Volgt uit het evenement dat je hierboven koos.'}
            </span>
          </div>
        ) : (
          <label className="grid gap-1 text-sm sm:col-span-2">
            <span className="font-medium text-vtk-ink">{en ? 'Event (optional)' : 'Evenement (optioneel)'}</span>
            <input type="text" value={eventName} onChange={(e) => setEventName(e.target.value)} className={inputClass} />
          </label>
        )}
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
          vehicleIds.length === 0 ||
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
