'use client';

import { useState, useTransition } from 'react';
import { Button } from '@vtk/ui';
import { useToast } from '@vtk/ui/toast';
import { UNSENT, unsentGuard } from '@vtk/ui/unsent-guard';
import { createTripShiftAction, deleteTripShiftAction, syncTripShiftAction } from '@/app/actions/uitleen';
import { LogisticsIcon } from '@/components/logistics-icon';
import { ConfirmActionButton } from '@/components/ui/confirm-action-button';
import { TRIP_SHIFT_PLACES, TRIP_SHIFT_REWARD, mayRemoveTripShift, shiftMatchesTrip } from '@/lib/bijrijdshift';
import type { TripShiftView } from '@/lib/uitleen-server/bijrijdshift';

/**
 * De bijrijdshift van een rit, onder de bijrijders: staat er een shift op
 * vtk.be/shift waarop leden zich inschrijven om mee te rijden, en wie schreef
 * zich al in? Zonder shift een knop om er een te maken.
 *
 * **Twee velden, in het blok zelf.** De knop schuift open met plaatsen en
 * bonnetjes; de rest (uren, post, vertrekplaats) volgt uit de rit
 * (`lib/bijrijdshift.ts`). Geen apart scherm en geen "weet je het zeker" bij
 * het aanmaken: wie zich vergiste, haalt de shift met de vuilbak weer weg en
 * zet een nieuwe. Dat weghalen vraagt wel een bevestiging, want wie al
 * ingeschreven stond, verliest zijn plaats (`deleteTripShiftAction`).
 *
 * Ligt de shift niet meer op de uren van de rit (de rit werd verschoven), dan
 * zegt het blok dat, met een knop om de shift mee te nemen. Dat gebeurt niet
 * vanzelf: wie al ingeschreven is, rekent op de uren waarvoor hij tekende.
 */

const timeFormatter = new Intl.DateTimeFormat('nl-BE', {
  timeZone: 'Europe/Brussels',
  hour: '2-digit',
  minute: '2-digit',
});
const dayFormatter = new Intl.DateTimeFormat('nl-BE', {
  timeZone: 'Europe/Brussels',
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});

/**
 * Wat er weg is en wat blijft. Wie ingeschreven stond, krijgt geen bericht (net
 * als bij verwijderen in /admin/shiften), dus de dialoog noemt hen bij naam.
 */
function removeDescription(name: string, participants: string[], en: boolean): string {
  const list = new Intl.ListFormat(en ? 'en' : 'nl-BE', { type: 'conjunction' }).format(participants);
  const one = participants.length === 1;
  if (en) {
    const who =
      participants.length === 0
        ? 'Nobody had signed up yet.'
        : `${list} ${one ? 'loses their' : 'lose their'} registration and ${one ? 'gets' : 'get'} no message about it, so let them know yourself.`;
    return `"${name}" disappears from vtk.be/shift. ${who} The trip and its passengers stay as they are.`;
  }
  const who =
    participants.length === 0
      ? 'Er stond nog niemand op.'
      : `${list} ${one ? 'verliest' : 'verliezen'} de inschrijving en ${one ? 'krijgt' : 'krijgen'} daar geen bericht van, dus laat het zelf weten.`;
  return `"${name}" verdwijnt van vtk.be/shift. ${who} De rit en de bijrijders blijven zoals ze zijn.`;
}

function timeRange(startAt: string, endAt: string): string {
  return `${dayFormatter.format(new Date(startAt))} ${timeFormatter.format(new Date(startAt))} tot ${timeFormatter.format(new Date(endAt))}`;
}

export function TripShift({
  bookingId,
  trip,
  shifts,
  canCreate,
  groupName,
  shiftUrl,
  locale = 'nl',
}: {
  bookingId: string;
  trip: { status: string; startAt: string; endAt: string };
  shifts: TripShiftView[];
  /** Het team, of de aanvrager en de leden van de post (`createTripShiftAction`). */
  canCreate: boolean;
  /** De post waarvoor de shift telt; null bij een rit zonder post. */
  groupName: string | null;
  /** vtk.be/shift, waar leden zich inschrijven. */
  shiftUrl: string;
  locale?: 'nl' | 'en';
}) {
  const en = locale === 'en';
  const showToast = useToast();
  const [pending, startTransition] = useTransition();
  // Open voor deze rit; een andere rit kiezen in het paneel sluit het formulier.
  const [openFor, setOpenFor] = useState<string | null>(null);
  const open = openFor === bookingId;
  const [places, setPlaces] = useState(String(TRIP_SHIFT_PLACES.default));
  const [reward, setReward] = useState(String(TRIP_SHIFT_REWARD.default));

  // Eén keer bij het laden: een rit die vertrekt terwijl het paneel openstaat,
  // weigert de action zelf.
  const [loadedAt] = useState(() => Date.now());
  const upcoming = new Date(trip.startAt).getTime() > loadedAt;
  const mayCreate = canCreate && shifts.length === 0 && upcoming && trip.status === 'APPROVED';
  // Een aanvraag krijgt nog geen knop, maar de post weet wel dat het kan.
  const later = canCreate && shifts.length === 0 && upcoming && trip.status === 'REQUESTED';
  if (shifts.length === 0 && !mayCreate && !later) return null;

  function run(action: () => Promise<{ ok: true; message?: string } | { ok: false; error: string } | typeof UNSENT>) {
    startTransition(async () => {
      const result = await action();
      if (result === UNSENT) return;
      if (result.ok) {
        showToast({ message: result.message ?? (en ? 'Saved.' : 'Opgeslagen.'), variant: 'success' });
        setOpenFor(null);
      } else {
        showToast({ message: result.error, variant: 'error', duration: 0 });
      }
    });
  }

  const create = () =>
    run(() =>
      unsentGuard.run(() => createTripShiftAction(bookingId, { places: Number(places), reward: Number(reward) }))
    );
  const sync = (shiftId: string) => run(() => unsentGuard.run(() => syncTripShiftAction(shiftId)));

  const inputClass =
    'h-9 w-full rounded-lg border border-vtk-navy/15 bg-vtk-field px-3 text-sm tabular-nums text-vtk-ink';
  const linkClass = 'font-medium text-vtk-navy underline decoration-vtk-yellow underline-offset-4';

  return (
    <div className="grid gap-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-vtk-muted">
        {en ? 'Ride-along shift' : 'Bijrijdshift'}
      </p>

      {shifts.map((shift) => {
        const taken = shift.participants.length;
        const inSync = shiftMatchesTrip(shift, trip);
        const removable = canCreate && mayRemoveTripShift({ tripStartAt: trip.startAt, participants: taken }, loadedAt);
        return (
          <div key={shift.id} className="grid gap-1 text-sm">
            <div className="flex items-start justify-between gap-2">
              <p className="text-vtk-body">
                <span className="font-medium text-vtk-ink">
                  {en
                    ? `${taken} of ${shift.places} ${shift.places === 1 ? 'place' : 'places'} taken`
                    : `${taken} van ${shift.places} ${shift.places === 1 ? 'plaats' : 'plaatsen'} ingenomen`}
                </span>
                {taken > 0 ? `: ${shift.participants.join(', ')}` : ''}
                {'. '}
                <a href={shiftUrl} target="_blank" rel="noreferrer" className={linkClass}>
                  {en ? 'On vtk.be' : 'Op vtk.be'}
                </a>
              </p>
              {removable ? (
                <ConfirmActionButton
                  label={`${en ? 'Remove shift' : 'Shift weghalen'}: ${shift.name}`}
                  confirmLabel={en ? 'Remove' : 'Weghalen'}
                  cancelLabel={en ? 'Cancel' : 'Annuleren'}
                  icon={<LogisticsIcon name="trash" className="h-3.5 w-3.5" />}
                  action={deleteTripShiftAction.bind(null, shift.id)}
                  successMessage={en ? 'Shift removed.' : 'Bijrijdshift weggehaald.'}
                  destructive
                  dialogTitle={en ? 'Remove ride-along shift?' : 'Bijrijdshift weghalen?'}
                  dialogDescription={removeDescription(shift.name, shift.participants, en)}
                />
              ) : null}
            </div>
            {!inSync ? (
              <div className="grid gap-1.5 rounded-[10px] bg-vtk-warn-soft px-3 py-2 text-sm text-vtk-body">
                <p>
                  {en ? 'The trip moved; the shift still runs ' : 'De rit is verschoven; de shift staat nog op '}
                  <span className="font-medium tabular-nums text-vtk-ink">{timeRange(shift.startAt, shift.endAt)}</span>.
                </p>
                {canCreate ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="justify-self-start"
                    disabled={pending}
                    onClick={() => sync(shift.id)}
                  >
                    {en ? 'Move the shift along' : 'Shift meeverschuiven'}
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}

      {later ? (
        <p className="text-sm text-vtk-muted">
          {en
            ? 'Once Logistics approves the trip, you can put a shift on vtk.be here for members to ride along.'
            : 'Zodra Logistiek de rit goedkeurt, kan je hier een shift op vtk.be zetten om mee te rijden.'}
        </p>
      ) : null}

      {mayCreate ? (
        open ? (
          <div className="grid gap-2 rounded-[12px] border border-dashed border-vtk-navy/25 p-3">
            <div className="grid grid-cols-2 gap-2">
              <label className="grid gap-1 text-xs font-medium text-vtk-muted">
                {en ? 'Places' : 'Plaatsen'}
                <input
                  type="number"
                  inputMode="numeric"
                  min={TRIP_SHIFT_PLACES.min}
                  max={TRIP_SHIFT_PLACES.max}
                  value={places}
                  onChange={(event) => setPlaces(event.target.value)}
                  className={inputClass}
                />
              </label>
              <label className="grid gap-1 text-xs font-medium text-vtk-muted">
                {en ? 'Vouchers' : 'Bonnetjes'}
                <input
                  type="number"
                  inputMode="numeric"
                  min={TRIP_SHIFT_REWARD.min}
                  max={TRIP_SHIFT_REWARD.max}
                  value={reward}
                  onChange={(event) => setReward(event.target.value)}
                  className={inputClass}
                />
              </label>
            </div>
            <p className="text-xs leading-5 text-vtk-muted">
              {en ? 'On vtk.be/shift, ' : 'Op vtk.be/shift, '}
              <span className="tabular-nums">{timeRange(trip.startAt, trip.endAt)}</span>
              {groupName ? (en ? `, counts for ${groupName}.` : `, telt voor ${groupName}.`) : '.'}
            </p>
            <div className="flex items-center gap-2">
              <Button type="button" size="sm" onClick={create} disabled={pending}>
                {pending ? (en ? 'Creating...' : 'Aanmaken...') : en ? 'Create' : 'Aanmaken'}
              </Button>
              <button
                type="button"
                onClick={() => setOpenFor(null)}
                className="text-sm font-medium text-vtk-muted underline underline-offset-4"
              >
                {en ? 'Cancel' : 'Annuleren'}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setOpenFor(bookingId)}
            className="justify-self-start rounded-full border border-vtk-navy/15 px-3 py-1 text-sm font-medium text-vtk-ink transition hover:border-vtk-navy/40"
          >
            {en ? '+ Ride-along shift' : '+ Bijrijdshift'}
          </button>
        )
      ) : null}
    </div>
  );
}
