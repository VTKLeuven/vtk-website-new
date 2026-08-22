import Link from 'next/link';
import { ReservationStatusBadge, VanStatusBadge } from '@/components/status-badge';
import { requireManage } from '@/lib/session';
import {
  formatDateOnly,
  formatDateTime,
  formatDateWithPart,
  toDatetimeLocalValue,
} from '@/lib/uitleen';
import { adminEvents, eventLoad, type AdminEvent } from '@/lib/uitleen-server';
import { EventEditor } from './event-editor';

/**
 * Alles van één evenement naast elkaar: materiaal, flesserke en vervoer.
 *
 * Het vervangt niets. `/beheer/aanvragen` en `/beheer/vervoer` blijven de plek
 * waar je beslist; dit scherm beantwoordt één vraag die daar niet te stellen was:
 * "is voor dit evenement alles aangevraagd?".
 */
export const metadata = { title: 'Evenementen' };

function StatusCount({
  count,
  one,
  many,
}: {
  count: number;
  one: string;
  many: string;
}) {
  return (
    <span className="text-vtk-muted">
      {count} {count === 1 ? one : many}
    </span>
  );
}

function EventCard({ event }: { event: AdminEvent }) {
  const load = eventLoad(event);
  const material = event.reservations.filter((reservation) => reservation.lines.length > 0);
  const flesserke = event.reservations.filter(
    (reservation) => reservation.flesserkeLines.length > 0
  );
  // Wat er ontbreekt is de reden dat dit scherm bestaat: een evenement met
  // materiaal maar zonder vervoer is bijna altijd een vergetelheid.
  const missing = [
    material.length === 0 ? 'materiaal' : null,
    event.transport.length === 0 ? 'vervoer' : null,
  ].filter(Boolean);

  return (
    // Het id als anker: vanuit een aanvraag kan je zo terug naar het evenement
    // waar je vandaan kwam (N2), in plaats van bovenaan een lange lijst te
    // landen. `scroll-mt` houdt de kaart onder de vaste header.
    <li
      id={event.id}
      className="scroll-mt-24 rounded-[16px] border border-vtk-navy/10 bg-vtk-surface p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex flex-wrap items-center gap-2 text-lg font-semibold tracking-tight text-vtk-ink">
            {event.name}
            {event.group ? (
              <span className="rounded-full bg-vtk-paper-2 px-2.5 py-0.5 text-xs font-semibold text-vtk-navy">
                {event.group.nameNl}
              </span>
            ) : null}
          </h3>
        </div>
        <EventEditor
          event={{
            id: event.id,
            name: event.name,
            location: event.location ?? '',
            startAt: event.startAt ? toDatetimeLocalValue(event.startAt) : '',
            note: event.note ?? '',
          }}
          attached={event.reservations.length + event.transport.length}
        />
      </div>

      <dl className="logistics-fact-grid mt-4">
        <div>
          <dt>Start</dt>
          <dd>{event.startAt ? formatDateTime(event.startAt) : 'Nog niet ingevuld'}</dd>
        </div>
        <div>
          <dt>Locatie</dt>
          <dd>{event.location || 'Nog niet ingevuld'}</dd>
        </div>
        <div>
          <dt>Aangemaakt door</dt>
          <dd>{event.createdBy?.name ?? 'Onbekend'}</dd>
        </div>
      </dl>

      {missing.length > 0 ? (
        <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Nog geen {missing.join(' en ')} aangevraagd voor dit evenement.
        </p>
      ) : null}

      {event.note ? (
        <p className="mt-3 rounded-lg bg-vtk-paper px-3 py-2 text-sm text-vtk-body">{event.note}</p>
      ) : null}

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <section>
          <h4 className="text-sm font-semibold text-vtk-ink">Materiaal</h4>
          {material.length === 0 ? (
            <p className="mt-1 text-sm text-vtk-muted">Niets aangevraagd.</p>
          ) : (
            <ul className="mt-1 grid gap-2">
              {material.map((reservation) => (
                <li key={reservation.id} className="text-sm">
                  <Link
                    href={`/beheer/aanvragen/${reservation.id}`}
                    className="flex flex-wrap items-center gap-2 hover:underline"
                  >
                    <ReservationStatusBadge status={reservation.status} />
                    <span className="text-vtk-ink">{reservation.user.name}</span>
                  </Link>
                  <p className="text-vtk-muted">
                    {formatDateWithPart(reservation.pickupDate, reservation.pickupPart)} tot{' '}
                    {formatDateWithPart(reservation.returnDate, reservation.returnPart)}
                  </p>
                  <p className="text-vtk-muted">
                    {reservation.lines
                      .map((line) => `${line.quantity}× ${line.itemName}`)
                      .join(', ')}
                  </p>
                </li>
              ))}
            </ul>
          )}
          {/* De ladingsinschatting. Het volume is per item optioneel, dus we zeggen
              er expliciet bij hoeveel stuks we niet kennen; een half volume als
              "het totaal" tonen zou een te kleine kar laten kiezen. */}
          {load.items > 0 ? (
            <p className="mt-2 text-xs text-vtk-muted">
              Lading: {load.items} {load.items === 1 ? 'stuk' : 'stuks'}
              {load.liters > 0 ? ` · ${load.liters} liter gekend` : ''}
              {load.unknownItems > 0
                ? ` · van ${load.unknownItems} ${
                    load.unknownItems === 1 ? 'stuk' : 'stuks'
                  } is het volume niet ingevuld`
                : ''}
            </p>
          ) : null}
        </section>

        <section>
          <h4 className="text-sm font-semibold text-vtk-ink">Flesserke</h4>
          {flesserke.length === 0 ? (
            <p className="mt-1 text-sm text-vtk-muted">Niets aangevraagd.</p>
          ) : (
            <ul className="mt-1 grid gap-2">
              {flesserke.map((reservation) => (
                <li key={reservation.id} className="text-sm">
                  <Link
                    href={`/beheer/aanvragen/${reservation.id}`}
                    className="flex flex-wrap items-center gap-2 hover:underline"
                  >
                    <ReservationStatusBadge status={reservation.status} />
                    <span className="text-vtk-ink">{reservation.user.name}</span>
                  </Link>
                  <p className="text-vtk-muted">
                    {formatDateOnly(reservation.pickupDate)} ·{' '}
                    {reservation.flesserkeLines
                      .map((line) => `${line.quantity}× ${line.itemName}`)
                      .join(', ')}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h4 className="text-sm font-semibold text-vtk-ink">Vervoer</h4>
          {event.transport.length === 0 ? (
            <p className="mt-1 text-sm text-vtk-muted">Niets aangevraagd.</p>
          ) : (
            <ul className="mt-1 grid gap-2">
              {event.transport.map((booking) => (
                <li key={booking.id} className="text-sm">
                  <Link
                    href="/beheer/vervoer"
                    className="flex flex-wrap items-center gap-2 hover:underline"
                  >
                    <VanStatusBadge status={booking.status} />
                    <span className="text-vtk-ink">{booking.vehicle.nameNl}</span>
                    {booking.tripLeg ? (
                      <span className="text-xs text-vtk-muted">
                        {booking.tripLeg === 'HEEN' ? 'heenrit' : 'terugrit'}
                      </span>
                    ) : null}
                  </Link>
                  <p className="text-vtk-muted">
                    {formatDateTime(booking.startAt)} tot {formatDateTime(booking.endAt)}
                  </p>
                  <p className="text-vtk-muted">
                    {booking.driver ? `chauffeur: ${booking.driver.name}` : 'nog geen chauffeur'}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </li>
  );
}

export default async function BeheerEvenementenPage() {
  await requireManage();
  const events = await adminEvents();

  const upcoming = events.filter(
    (event) => !event.startAt || event.startAt.getTime() >= Date.now() - 24 * 60 * 60 * 1000
  );
  const past = events.filter((event) => !upcoming.includes(event));

  return (
    <div className="grid gap-6">
      <section className="rounded-[18px] border border-vtk-navy/10 bg-vtk-surface p-6">
        <h2 className="text-lg font-semibold tracking-tight text-vtk-ink">Evenementen</h2>
        <p className="mt-1 max-w-2xl text-sm text-vtk-muted">
          De koepel boven materiaal, flesserke en vervoer van hetzelfde evenement. Optioneel: een
          losse uitlening hoeft er niet onder. Leden hangen hun aanvraag er zelf aan; hier kan je er
          een aanmaken en aanvragen koppelen vanaf hun detailpagina.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-4 text-sm">
          <StatusCount count={events.length} one="evenement" many="evenementen" />
          <StatusCount
            count={upcoming.length}
            one="komend of zonder datum"
            many="komende of zonder datum"
          />
        </div>
        <div className="mt-4">
          <EventEditor attached={0} />
        </div>
      </section>

      {events.length === 0 ? (
        <p className="text-sm text-vtk-muted">
          Nog geen evenementen. Maak er een aan, of laat een lid er een aanmaken bij zijn aanvraag.
        </p>
      ) : null}

      {upcoming.length > 0 ? (
        <section>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-vtk-muted">
            Komend en zonder datum
          </h3>
          <ul className="mt-3 grid gap-4">
            {upcoming.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </ul>
        </section>
      ) : null}

      {past.length > 0 ? (
        <section>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-vtk-muted">Geweest</h3>
          <ul className="mt-3 grid gap-4">
            {past.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
