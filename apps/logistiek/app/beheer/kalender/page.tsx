import Link from 'next/link';
import { requireManage } from '@/lib/session';
import { formatDateOnly, requesterLabel, todayDateOnly } from '@/lib/uitleen';
import { adminAgenda } from '@/lib/uitleen-server';

const DAYS_AHEAD = 30;

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

export default async function BeheerKalenderPage() {
  await requireManage();

  const from = todayDateOnly();
  const to = new Date(from.getTime() + DAYS_AHEAD * 24 * 60 * 60 * 1000);
  const agenda = await adminAgenda(from, to);

  type Entry = {
    kind: 'Afhaling' | 'Terugbrengen' | 'Vervoer';
    /** Post of werkgroep, plus het voertuig bij een rit. */
    tags: string[];
    /** Waar het over gaat: de evenementnaam, of het doel van de rit. */
    title: string;
    /** Wie het is en wat er meegaat. */
    detail: string;
    href: string;
  };
  const byDay = new Map<string, Entry[]>();

  function push(day: Date, entry: Entry) {
    const key = day.toISOString().slice(0, 10);
    const list = byDay.get(key) ?? [];
    list.push(entry);
    byDay.set(key, list);
  }

  const itemSummary = (lines: Array<{ quantity: number; itemName: string }>) =>
    lines.map((line) => `${line.quantity}× ${line.itemName}`).join(', ');

  for (const reservation of agenda.pickups) {
    push(reservation.pickupDate, {
      kind: 'Afhaling',
      tags: [requesterLabel(reservation)],
      title: reservation.eventName,
      detail: `${reservation.user.name}: ${itemSummary(reservation.lines)}`,
      href: `/beheer/aanvragen/${reservation.id}`,
    });
  }
  for (const reservation of agenda.returns) {
    push(reservation.returnDate, {
      kind: 'Terugbrengen',
      tags: [requesterLabel(reservation)],
      title: reservation.eventName,
      detail: `${reservation.user.name}: ${itemSummary(reservation.lines)}`,
      href: `/beheer/aanvragen/${reservation.id}`,
    });
  }
  for (const booking of agenda.vanBookings) {
    const day = new Date(`${dayKeyFormatter.format(booking.startAt)}T00:00:00.000Z`);
    push(day, {
      kind: 'Vervoer',
      tags: [booking.vehicle.nameNl, requesterLabel(booking)],
      title: booking.eventName ?? booking.purpose,
      detail: `${timeFormatter.format(booking.startAt)}-${timeFormatter.format(booking.endAt)} · ${booking.user.name} · ${
        booking.driver ? `chauffeur: ${booking.driver.name}` : 'nog geen chauffeur'
      }`,
      href: '/beheer/vervoer',
    });
  }

  const days = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b));

  const KIND_STYLES: Record<Entry['kind'], string> = {
    Afhaling: 'bg-vtk-yellow/25 text-vtk-ink',
    Terugbrengen: 'bg-vtk-paper-2 text-vtk-navy',
    Vervoer: 'bg-vtk-navy text-white',
  };

  return (
    <div>
      <h2 className="text-lg font-semibold tracking-tight text-vtk-ink">
        Komende {DAYS_AHEAD} dagen
      </h2>
      {days.length === 0 ? (
        <p className="mt-3 text-sm text-vtk-muted">Niets gepland in deze periode.</p>
      ) : (
        <div className="mt-4 grid gap-5">
          {days.map(([key, entries]) => (
            <section key={key}>
              <h3 className="text-sm font-semibold text-vtk-ink">
                {formatDateOnly(new Date(`${key}T00:00:00.000Z`))}
              </h3>
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
                        {entry.kind}
                      </span>
                      <span className="min-w-0">
                        <span className="flex flex-wrap items-center gap-2 font-medium text-vtk-ink">
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
