import Link from 'next/link';
import { requireManage } from '@/lib/session';
import {
  dayPartLabel,
  formatDateOnly,
  formatDateRange,
  parseDateOnly,
  requesterLabel,
  toDateInputValue,
  todayDateOnly,
} from '@/lib/uitleen';
import { activeVehicles, adminAgenda } from '@/lib/uitleen-server';
import { KalenderFilters } from './kalender-filters';
import {
  CALENDAR_KINDS,
  CONTENT_DOTS,
  CONTENT_KINDS,
  CONTENT_LABELS,
  KIND_LABELS,
  contentKind,
  type CalendarKind,
  type ContentKind,
} from './kalender-kinds';

const DEFAULT_DAYS = 30;
const PRESET_DAYS = [7, 30, 90];
/** Grens tegen een verkeerd getypt jaartal in de datumvelden. */
const MAX_DAYS = 400;

const DAY_MS = 24 * 60 * 60 * 1000;

const timeFormatter = new Intl.DateTimeFormat('nl-BE', {
  timeZone: 'Europe/Brussels',
  hour: '2-digit',
  minute: '2-digit',
});

const dayKeyFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Brussels',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function parseKinds(value: string | undefined): CalendarKind[] {
  if (value === undefined) return [...CALENDAR_KINDS];
  const parts = value.split(',').filter((part): part is CalendarKind =>
    (CALENDAR_KINDS as readonly string[]).includes(part)
  );
  return parts;
}

/** Het gekozen bereik, met vandaag + 30 dagen als standaard. */
function parseRange(van: string | undefined, tot: string | undefined) {
  const today = todayDateOnly();
  const from = (van && parseDateOnly(van)) || today;
  const fallbackTo = new Date(from.getTime() + DEFAULT_DAYS * DAY_MS);
  let to = (tot && parseDateOnly(tot)) || fallbackTo;
  if (to < from) to = from;
  if (to.getTime() - from.getTime() > MAX_DAYS * DAY_MS) {
    to = new Date(from.getTime() + MAX_DAYS * DAY_MS);
  }
  return { from, to };
}

export default async function BeheerKalenderPage({
  searchParams,
}: {
  searchParams: Promise<{ soort?: string; voertuig?: string; van?: string; tot?: string }>;
}) {
  await requireManage();
  const { soort, voertuig, van, tot } = await searchParams;

  const kinds = parseKinds(soort);
  const vehicleFilter = voertuig ? voertuig.split(',').filter(Boolean) : [];
  const { from, to } = parseRange(van, tot);

  const [agenda, vehicles] = await Promise.all([adminAgenda(from, to), activeVehicles()]);

  type Entry = {
    kind: CalendarKind;
    /** Post of werkgroep, plus het voertuig bij een rit. */
    tags: string[];
    /** Waar het over gaat: de evenementnaam, of het doel van de rit. */
    title: string;
    /** Wie het is en wat er meegaat. */
    detail: string;
    /** Materiaal, flesserke of allebei; null bij een rit (F3). */
    content: ContentKind | null;
    href: string;
  };
  const byDay = new Map<string, Entry[]>();

  function push(day: Date, entry: Entry) {
    if (!kinds.includes(entry.kind)) return;
    const key = day.toISOString().slice(0, 10);
    const list = byDay.get(key) ?? [];
    list.push(entry);
    byDay.set(key, list);
  }

  const itemSummary = (lines: Array<{ quantity: number; itemName: string }>) =>
    lines.map((line) => `${line.quantity}× ${line.itemName}`).join(', ');

  // Wat niet toegekend is (M3), gaat die dag ook niet mee; het hoort dus niet in
  // de daglijst waarmee een shift de loods in stapt.
  const grantedOf = (reservation: {
    lines: Array<{ quantity: number; itemName: string; lineStatus: string }>;
  }) => reservation.lines.filter((line) => line.lineStatus !== 'REJECTED');

  // Het dagdeel hoort bij de tags en niet in de detailregel: op een dag met acht
  // afhalingen is "namiddag" het eerste waarop je sorteert met je ogen.
  const partTag = (part: string | null) => {
    const label = dayPartLabel(part);
    return label ? [label] : [];
  };

  for (const reservation of agenda.pickups) {
    push(reservation.pickupDate, {
      kind: 'afhaling',
      tags: [requesterLabel(reservation), ...partTag(reservation.pickupPart)],
      title: reservation.eventName,
      detail: `${reservation.user.name}: ${itemSummary([
        ...grantedOf(reservation),
        ...reservation.flesserkeLines,
      ])}`,
      content: contentKind({ ...reservation, lines: grantedOf(reservation) }),
      href: `/beheer/aanvragen/${reservation.id}`,
    });
  }
  for (const reservation of agenda.returns) {
    push(reservation.returnDate, {
      kind: 'terugbrengen',
      tags: [requesterLabel(reservation), ...partTag(reservation.returnPart)],
      title: reservation.eventName,
      detail: `${reservation.user.name}: ${itemSummary([
        ...grantedOf(reservation),
        ...reservation.flesserkeLines,
      ])}`,
      content: contentKind({ ...reservation, lines: grantedOf(reservation) }),
      href: `/beheer/aanvragen/${reservation.id}`,
    });
  }
  for (const booking of agenda.vanBookings) {
    if (vehicleFilter.length > 0 && !vehicleFilter.includes(booking.vehicleId)) continue;
    const day = new Date(`${dayKeyFormatter.format(booking.startAt)}T00:00:00.000Z`);
    push(day, {
      kind: 'vervoer',
      tags: [booking.vehicle.nameNl, requesterLabel(booking)],
      title: booking.eventName ?? booking.purpose,
      detail: `${timeFormatter.format(booking.startAt)}-${timeFormatter.format(booking.endAt)} · ${booking.user.name} · ${
        booking.driver ? `chauffeur: ${booking.driver.name}` : 'nog geen chauffeur'
      }`,
      content: null,
      // Naar de rit zelf en niet naar de kale lijst (S3): die lijst kan twintig
      // ritten lang zijn, en dan begint het zoeken pas na de klik.
      href: `/beheer/vervoer?rit=${booking.id}#rit-${booking.id}`,
    });
  }

  const days = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b));

  const KIND_STYLES: Record<CalendarKind, string> = {
    afhaling: 'bg-vtk-yellow/25 text-vtk-ink',
    terugbrengen: 'bg-vtk-paper-2 text-vtk-navy',
    vervoer: 'bg-vtk-navy text-white',
  };

  const spanDays = Math.round((to.getTime() - from.getTime()) / DAY_MS);
  const presetDays =
    from.getTime() === todayDateOnly().getTime() && PRESET_DAYS.includes(spanDays)
      ? spanDays
      : null;

  // Wat er niet getoond wordt, zodat de lege lijst niet als "niets gepland" leest.
  const hiddenKinds = CALENDAR_KINDS.filter((kind) => !kinds.includes(kind));
  const hiddenNote = [
    hiddenKinds.length > 0 ? hiddenKinds.map((k) => KIND_LABELS[k].toLowerCase()).join(' en ') : null,
    vehicleFilter.length > 0 && kinds.includes('vervoer')
      ? `enkel ${vehicles
          .filter((v) => vehicleFilter.includes(v.id))
          .map((v) => v.nameNl)
          .join(', ')}`
      : null,
  ].filter(Boolean);

  return (
    <div className="grid gap-5">
      <KalenderFilters
        vehicles={vehicles.map((v) => ({ id: v.id, name: v.nameNl }))}
        kinds={kinds}
        vehicleIds={vehicleFilter}
        from={toDateInputValue(from)}
        to={toDateInputValue(to)}
        presetDays={presetDays}
      />

      {/* Legende (F3): de kleuren zeggen niets zonder sleutel, en die sleutel
          hoort bij de kalender en niet in iemands hoofd. */}
      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-vtk-muted">
        {CONTENT_KINDS.map((kind) => (
          <span key={kind} className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className={`h-2 w-2 rounded-full ${CONTENT_DOTS[kind]}`} />
            {CONTENT_LABELS[kind]}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="inline-block rounded-full bg-vtk-navy px-1.5 py-0.5 text-[9px] font-semibold text-white"
          >
            Transport
          </span>
          rit met een voertuig
        </span>
      </p>

      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight text-vtk-ink">
          {formatDateRange(from, to)}
        </h2>
        <Link
          href="/beheer/vervoer/week"
          className="text-sm font-semibold text-vtk-navy underline decoration-vtk-yellow underline-offset-4"
        >
          Weekoverzicht transport
        </Link>
      </div>

      {days.length === 0 ? (
        <p className="text-sm text-vtk-muted">
          Niets gepland in deze periode
          {hiddenNote.length > 0 ? ` (${hiddenNote.join('; ')} staan uit)` : ''}.
        </p>
      ) : (
        <div className="grid gap-5">
          {days.map(([key, entries]) => (
            <section key={key}>
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h3 className="text-sm font-semibold text-vtk-ink">
                  {formatDateOnly(new Date(`${key}T00:00:00.000Z`))}
                </h3>
                {/* De hele shift op één stapel papier; enkel waar die dag ook
                    echt iets af te halen valt. */}
                {entries.some((entry) => entry.kind === 'afhaling') ? (
                  <Link
                    href={`/beheer/aanvragen/print?datum=${key}`}
                    className="text-xs font-semibold text-vtk-navy underline decoration-vtk-yellow underline-offset-4"
                  >
                    Print alle afhalingen van deze dag
                  </Link>
                ) : null}
              </div>
              <ul className="mt-2 grid gap-2">
                {entries.map((entry, index) => (
                  <li key={index}>
                    <Link
                      href={entry.href}
                      className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-3 rounded-[14px] border border-vtk-navy/10 bg-vtk-surface px-4 py-2.5 text-sm transition hover:border-vtk-navy/25"
                    >
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${KIND_STYLES[entry.kind]}`}
                      >
                        {KIND_LABELS[entry.kind]}
                      </span>
                      <span className="min-w-0">
                        <span className="flex flex-wrap items-center gap-2 font-medium text-vtk-ink">
                          {/* Materiaal of flesserke, met hetzelfde bolletje als in
                              de legende hierboven (F3). */}
                          {entry.content ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-vtk-paper-2 px-2 py-0.5 text-[11px] font-semibold text-vtk-navy">
                              <span
                                aria-hidden="true"
                                className={`h-2 w-2 rounded-full ${CONTENT_DOTS[entry.content]}`}
                              />
                              {CONTENT_LABELS[entry.content]}
                            </span>
                          ) : null}
                          {entry.tags.map((tag) => (
                            <span
                              key={tag}
                              className="rounded-full bg-vtk-paper-2 px-2 py-0.5 text-[11px] font-semibold text-vtk-navy"
                            >
                              {tag}
                            </span>
                          ))}
                          {entry.title}
                        </span>
                        <span className="mt-0.5 block truncate text-vtk-muted">{entry.detail}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
