import Link from 'next/link';
import { requireManage } from '@/lib/session';
import { formatDateOnly, todayDateOnly } from '@/lib/uitleen';
import { adminAgenda } from '@/lib/uitleen-server';

const DAYS_AHEAD = 30;

export default async function BeheerKalenderPage() {
  await requireManage();

  const from = todayDateOnly();
  const to = new Date(from.getTime() + DAYS_AHEAD * 24 * 60 * 60 * 1000);
  const agenda = await adminAgenda(from, to);

  type Entry = { kind: 'Afhaling' | 'Terugbrengen' | 'Camionette'; text: string; href: string };
  const byDay = new Map<string, Entry[]>();

  function push(day: Date, entry: Entry) {
    const key = day.toISOString().slice(0, 10);
    const list = byDay.get(key) ?? [];
    list.push(entry);
    byDay.set(key, list);
  }

  for (const reservation of agenda.pickups) {
    push(reservation.pickupDate, {
      kind: 'Afhaling',
      text: `${reservation.user.name}: ${reservation.lines.map((line) => `${line.quantity}× ${line.itemName}`).join(', ')}`,
      href: `/beheer/aanvragen/${reservation.id}`,
    });
  }
  for (const reservation of agenda.returns) {
    push(reservation.returnDate, {
      kind: 'Terugbrengen',
      text: `${reservation.user.name}: ${reservation.lines.map((line) => `${line.quantity}× ${line.itemName}`).join(', ')}`,
      href: `/beheer/aanvragen/${reservation.id}`,
    });
  }
  for (const booking of agenda.vanBookings) {
    const timeFormatter = new Intl.DateTimeFormat('nl-BE', {
      timeZone: 'Europe/Brussels',
      hour: '2-digit',
      minute: '2-digit',
    });
    const day = new Date(
      `${new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Brussels', year: 'numeric', month: '2-digit', day: '2-digit' }).format(booking.startAt)}T00:00:00.000Z`
    );
    push(day, {
      kind: 'Camionette',
      text: `${timeFormatter.format(booking.startAt)}-${timeFormatter.format(booking.endAt)} ${booking.user.name}: ${booking.purpose}${booking.driver ? ` (${booking.driver.name})` : ' (geen chauffeur)'}`,
      href: '/beheer/camionette',
    });
  }

  const days = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b));

  const KIND_STYLES: Record<Entry['kind'], string> = {
    Afhaling: 'bg-vtk-yellow/25 text-vtk-ink',
    Terugbrengen: 'bg-vtk-paper-2 text-vtk-navy',
    Camionette: 'bg-vtk-navy text-white',
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
                      className="flex flex-wrap items-center gap-3 rounded-[14px] border border-vtk-navy/10 bg-vtk-surface px-4 py-2.5 text-sm transition hover:border-vtk-navy/25"
                    >
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${KIND_STYLES[entry.kind]}`}
                      >
                        {entry.kind}
                      </span>
                      <span className="min-w-0 flex-1 text-vtk-body">{entry.text}</span>
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
