import Link from 'next/link';
import {
  GroceryStatusBadge,
  ReservationStatusBadge,
  VanStatusBadge,
} from '@/components/status-badge';
import { requireManage } from '@/lib/session';
import { SortChipLinks, compareText, nextSortDir, type SortDir } from '@/app/beheer/sort';
import {
  formatDateOnly,
  formatDateTime,
  formatDateWithPart,
  formatEventMoment,
  toBrusselsDateValue,
  toBrusselsTimeValue,
} from '@/lib/uitleen';
import { adminEvents, eventLoad, type AdminEvent } from '@/lib/uitleen-server';
import { LogisticsIcon } from '@/components/logistics-icon';
import { EventEditor } from './event-editor';

/** De hoofdsite, om terug te linken naar het kalenderevenement (E1). */
const MAIN_URL = process.env.VTK_MAIN_URL || 'https://vtk.be';

/**
 * Alles van één evenement naast elkaar: materiaal, flesserke, vervoer en de
 * boodschappen.
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
    event.transport.length === 0 ? 'transport' : null,
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
            {/* E1: dit evenement komt van de kalender op vtk.be. Naam, locatie en
                uren volgen dáár mee, dus wie ze hier aanpast, ziet ze bij de
                volgende bewerking daar weer overschreven worden. */}
            {event.calendarEventId ? (
              <a
                href={`${MAIN_URL}/admin/kalender/${event.calendarEventId}`}
                className="inline-flex items-center gap-1 rounded-full bg-vtk-yellow/25 px-2.5 py-0.5 text-xs font-semibold text-vtk-ink underline decoration-vtk-navy/30 underline-offset-2"
                title="Dit evenement komt van de kalender op vtk.be; naam, locatie en uren volgen daar mee."
              >
                van vtk.be
                <LogisticsIcon name="external" className="h-3 w-3" />
              </a>
            ) : null}
          </h3>
        </div>
        {/* De twee acties horen bij elkaar in één groep. Als losse kinderen in een
            `justify-between`-rij duwde de flexverdeling de Materiaallijst midden
            tussen de titel en Bewerken, alsof ze bij geen van beide hoorde. */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Eén blad met alles wat er die dag moet zijn (E4). */}
          <Link
            href={`/beheer/evenementen/${event.id}/print`}
            className="rounded-full border border-vtk-navy/15 px-3.5 py-1.5 text-sm font-semibold text-vtk-ink transition hover:border-vtk-navy/40 hover:bg-vtk-paper"
          >
            Materiaallijst
          </Link>
          <EventEditor
            event={{
              id: event.id,
              name: event.name,
              location: event.location ?? '',
              startDate: event.startAt ? toBrusselsDateValue(event.startAt) : '',
              startTime:
                event.startAt && event.startTimeKnown ? toBrusselsTimeValue(event.startAt) : '',
              endDate: event.endAt ? toBrusselsDateValue(event.endAt) : '',
              endTime: event.endAt ? toBrusselsTimeValue(event.endAt) : '',
              note: event.note ?? '',
            }}
            attached={event.reservations.length + event.transport.length}
          />
        </div>
      </div>

      <dl className="logistics-fact-grid mt-4">
        <div>
          <dt>Wanneer</dt>
          <dd>{formatEventMoment(event) ?? 'Nog niet ingevuld'}</dd>
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
          <h4 className="text-sm font-semibold text-vtk-ink">Transport</h4>
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

        {/* De boodschappen (E5). Enkel wanneer er een bestelling aan hangt, en
            niet met een "Niets gekoppeld"-regel zoals de drie hierboven: die
            drie zijn wat je voor een evenement aanvraagt, terwijl Collect&Go
            uit een mail komt en bij de meeste evenementen niet hoort. Een vaste
            vierde kolom die bijna altijd leeg is, zegt niets.

            De koppeling was tot nu enkel op de Materiaallijst te zien, dus je
            moest afdrukken om te weten of ze gelukt was. */}
        {event.groceryOrders.length > 0 ? (
          <section>
            <h4 className="text-sm font-semibold text-vtk-ink">Collect&amp;Go</h4>
            <ul className="mt-1 grid gap-2">
              {event.groceryOrders.map((order) => (
                <li key={order.id} className="text-sm">
                  <Link
                    href={`/beheer/collectengo/${order.id}`}
                    className="flex flex-wrap items-center gap-2 hover:underline"
                  >
                    <GroceryStatusBadge status={order.status} />
                    <span className="text-vtk-ink">{order.reservationNumber}</span>
                  </Link>
                  <p className="text-vtk-muted">
                    {order.lines.length} {order.lines.length === 1 ? 'product' : 'producten'}
                  </p>
                  {/* Wanneer en waar af te halen: dat is het enige wat je op dit
                      scherm over de bestelling moet weten. Zeventig productnamen
                      uitschrijven zoals bij materiaal zou de kaart onleesbaar
                      maken; daarvoor is de Materiaallijst er. */}
                  <p className="text-vtk-muted">
                    {order.pickupFrom
                      ? `afhalen ${formatDateTime(order.pickupFrom)}`
                      : 'afhaalmoment onbekend'}
                    {order.pickupPoint ? ` · ${order.pickupPoint}` : ''}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </li>
  );
}

/**
 * Sorteersleutels voor het evenementenoverzicht (E2).
 *
 * `defaultDir` is de richting waarin je begint zodra je erop klikt; een tweede
 * klik draait om (`nextSortDir`). Datum staat op oplopend omdat de lijst al in
 * "komend" en "voorbij" gesplitst is en je bij komend het eerstvolgende wil zien.
 */
const EVENT_SORTS = {
  datum: { label: 'Datum', defaultDir: 'asc' as const },
  naam: { label: 'Naam', defaultDir: 'asc' as const },
  post: { label: 'Post of werkgroep', defaultDir: 'asc' as const },
};

type EventSort = keyof typeof EVENT_SORTS;

function isEventSort(value: string | undefined): value is EventSort {
  return value !== undefined && value in EVENT_SORTS;
}

function sortEvents(events: AdminEvent[], sort: EventSort, dir: SortDir): AdminEvent[] {
  const factor = dir === 'asc' ? 1 : -1;
  // De naam is de tiebreak en draait **niet** mee: binnen dezelfde post hoort de
  // lijst alfabetisch te blijven, ook wanneer je de posten van z naar a zet.
  // Dezelfde regel als in `sortDrivers`.
  const byName = (a: AdminEvent, b: AdminEvent) => compareText(a.name, b.name, 'asc');
  if (sort === 'naam') return [...events].sort((a, b) => compareText(a.name, b.name, dir));
  if (sort === 'post') {
    // Zonder post achteraan: die vraag ("van wie is dit?") is precies waarom je
    // hierop sorteert, en een leeg vak bovenaan helpt daar niet bij. Ook bij
    // aflopend blijft het achteraan, want het is geen naam maar een gat.
    return [...events].sort((a, b) => {
      const noGroupA = a.group === null;
      const noGroupB = b.group === null;
      if (noGroupA !== noGroupB) return noGroupA ? 1 : -1;
      const diff = compareText(a.group?.nameNl ?? '', b.group?.nameNl ?? '', dir);
      return diff !== 0 ? diff : byName(a, b);
    });
  }
  // Datum: de lijst komt al chronologisch binnen, dus aflopend is ze omkeren.
  // Een evenement zonder datum houdt zijn plek in die volgorde.
  return dir === 'asc' ? events : [...events].reverse();
}

export default async function BeheerEvenementenPage({
  searchParams,
}: {
  searchParams: Promise<{ sorteer?: string; richting?: string }>;
}) {
  await requireManage();
  const { sorteer, richting } = await searchParams;
  // Zonder parameter blijft het datum-oplopend, zoals het altijd was: bestaande
  // links en bladwijzers komen op dezelfde lijst uit.
  const chosenSort = isEventSort(sorteer) ? sorteer : null;
  const sort: EventSort = chosenSort ?? 'datum';
  const dir: SortDir =
    richting === 'asc' || richting === 'desc' ? richting : EVENT_SORTS[sort].defaultDir;
  const events = await adminEvents();

  /** Waar een sorteerknop heen gaat; een tweede klik op dezelfde draait om. */
  function sortHref(key: EventSort): string {
    const params = new URLSearchParams({
      sorteer: key,
      richting: nextSortDir(key, chosenSort, dir, EVENT_SORTS[key].defaultDir),
    });
    return `/beheer/evenementen?${params.toString()}`;
  }

  const upcoming = sortEvents(
    events.filter(
      (event) => !event.startAt || event.startAt.getTime() >= Date.now() - 24 * 60 * 60 * 1000
    ),
    sort,
    dir
  );
  const past = sortEvents(
    events.filter(
      (event) => event.startAt !== null && event.startAt.getTime() < Date.now() - 24 * 60 * 60 * 1000
    ),
    sort,
    dir
  );

  return (
    <div className="grid gap-6">
      <section className="rounded-[18px] border border-vtk-navy/10 bg-vtk-surface p-6">
        <h2 className="text-lg font-semibold tracking-tight text-vtk-ink">Evenementen</h2>
        <p className="mt-1 max-w-2xl text-sm text-vtk-muted">
          De koepel boven materiaal, flesserke en transport van hetzelfde evenement. Optioneel: een
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
          <SortChipLinks
            activeKey={chosenSort}
            dir={dir}
            options={(Object.keys(EVENT_SORTS) as EventSort[]).map((key) => ({
              key,
              label: EVENT_SORTS[key].label,
              href: sortHref(key),
            }))}
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
