import Link from '@vtk/ui/link';
import { formatDateOnly, todayDateOnly } from '@/lib/uitleen';
import { requireManage } from '@/lib/session';
import { adminAgenda, adminWorkCounts } from '@/lib/uitleen-server';

/**
 * Het overzicht van het beheer: wat er te doen is, en wat er vandaag gebeurt.
 *
 * Voordien een blok "Werkvoorraad / Acties en lopend werk / De actuele stand van
 * materiaal en transport", twee kaarten met elk vier tellers, en "Operationeel
 * vandaag" (C2, L3 uit de audit van november 2026). De helft van die tellers
 * telde alles sinds het begin ("teruggebracht", "uitgevoerd") en vroeg dus niets;
 * de rijen van vandaag waren geen links. Nu staat er per rij één taak met haar
 * aantal, en elke regel van vandaag opent zijn aanvraag of rit.
 */
export default async function BeheerDashboardPage() {
  await requireManage();

  const today = todayDateOnly();
  const [work, agenda] = await Promise.all([adminWorkCounts(), adminAgenda(today, today)]);

  const tasks: Array<{ label: string; hint: string; count: number; href: string; urgent?: boolean }> = [
    {
      label: 'Materiaalaanvragen te beslissen',
      hint: 'Materiaal en flesserke die op een ja of nee wachten.',
      count: work.decideMaterial,
      href: '/beheer/aanvragen',
      urgent: true,
    },
    {
      label: 'Ritaanvragen te beslissen',
      hint: 'Heen en terug tellen als één aanvraag.',
      count: work.decideTrips,
      href: '/beheer/vervoer',
      urgent: true,
    },
    {
      label: 'Te laat terug',
      hint: 'Afgehaald materiaal waarvan de terugbrengdag voorbij is.',
      count: work.overdue,
      href: '/beheer/aanvragen',
      urgent: true,
    },
    {
      label: 'Ritten zonder chauffeur',
      hint: 'Goedgekeurd, nog niet gereden, en Logistiek rijdt het voertuig.',
      count: work.noDriver,
      href: '/beheer/vervoer',
      urgent: true,
    },
    {
      label: 'Nog niet betaald',
      hint: 'Goedgekeurde aanvragen en ritten van externen zonder betaling.',
      count: work.unpaid,
      href: '/beheer/aanvragen',
    },
    {
      label: 'Waarborg terug te geven',
      hint: 'Teruggebracht door een externe, waarborg nog niet terug.',
      count: work.deposits,
      href: '/beheer/aanvragen',
    },
  ];

  const nothingToday =
    agenda.pickups.length === 0 && agenda.returns.length === 0 && agenda.vanBookings.length === 0;

  return (
    <div className="grid gap-8">
      <section aria-labelledby="overview-title">
        <h2 id="overview-title" className="text-lg font-semibold tracking-tight text-vtk-ink">
          Overzicht
        </h2>
        <ul className="mt-3 overflow-hidden rounded-[18px] border border-vtk-navy/10 bg-vtk-surface">
          {tasks.map((task) => {
            const attention = task.count > 0 && task.urgent;
            return (
              <li key={task.label} className="border-b border-vtk-navy/10 last:border-b-0">
                <Link
                  href={task.href}
                  className={`flex items-center gap-4 px-4 py-3 transition hover:bg-vtk-navy/[0.03] ${
                    attention ? 'bg-vtk-yellow/10' : ''
                  }`}
                >
                  <span
                    className={`w-10 shrink-0 text-right text-xl font-semibold tabular-nums tracking-[-0.03em] ${
                      task.count > 0 ? 'text-vtk-ink' : 'text-vtk-muted'
                    }`}
                  >
                    {task.count}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={`block font-medium ${task.count > 0 ? 'text-vtk-ink' : 'text-vtk-muted'}`}>
                      {task.label}
                    </span>
                    <span className="block text-xs text-vtk-muted">{task.hint}</span>
                  </span>
                  <span aria-hidden className="text-vtk-muted">
                    →
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="today-title">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="today-title" className="text-lg font-semibold tracking-tight text-vtk-ink">
            Vandaag <span className="font-normal text-vtk-muted">· {formatDateOnly(today)}</span>
          </h2>
          <Link
            href="/beheer/kalender"
            className="text-sm font-semibold text-vtk-navy underline decoration-vtk-yellow underline-offset-4"
          >
            Volledige kalender
          </Link>
        </div>
        {nothingToday ? (
          <p className="mt-3 text-sm text-vtk-muted">Niets gepland vandaag.</p>
        ) : (
          <ul className="mt-3 overflow-hidden rounded-[18px] border border-vtk-navy/10 bg-vtk-surface text-sm">
            {agenda.pickups.map((reservation) => (
              <TodayRow
                key={`p-${reservation.id}`}
                href={`/beheer/aanvragen/${reservation.id}`}
                kind="Afhaling"
                tone="bg-vtk-yellow/40 text-vtk-ink"
                title={reservation.eventName}
                who={reservation.group?.nameNl ?? reservation.user.name}
                detail={reservation.lines.map((line) => `${line.quantity}× ${line.itemName}`).join(', ')}
              />
            ))}
            {agenda.returns.map((reservation) => (
              <TodayRow
                key={`r-${reservation.id}`}
                href={`/beheer/aanvragen/${reservation.id}`}
                kind="Terugbrengen"
                tone="bg-vtk-paper-2 text-vtk-navy"
                title={reservation.eventName}
                who={reservation.group?.nameNl ?? reservation.user.name}
                detail={reservation.lines.map((line) => `${line.quantity}× ${line.itemName}`).join(', ')}
              />
            ))}
            {agenda.vanBookings.map((booking) => (
              <TodayRow
                key={`v-${booking.id}`}
                href={`/beheer/vervoer?rit=${booking.id}`}
                kind="Rit"
                tone="bg-vtk-navy text-vtk-on-emphasis"
                title={booking.purpose.split('\n')[0]}
                who={booking.group?.nameNl ?? booking.user.name}
                detail={`${booking.vehicle.nameNl} · chauffeur: ${booking.driver?.name ?? 'nog te kiezen'}`}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** Eén regel van vandaag, als link naar de aanvraag of de rit. */
function TodayRow({
  href,
  kind,
  tone,
  title,
  who,
  detail,
}: {
  href: string;
  kind: string;
  tone: string;
  title: string;
  who: string;
  detail: string;
}) {
  return (
    <li className="border-b border-vtk-navy/10 last:border-b-0">
      <Link href={href} className="flex items-start gap-3 px-4 py-3 transition hover:bg-vtk-navy/[0.03]">
        <span className={`mt-0.5 shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${tone}`}>{kind}</span>
        <span className="min-w-0 flex-1">
          <span className="block font-medium text-vtk-ink">
            {title} <span className="font-normal text-vtk-muted">· {who}</span>
          </span>
          <span className="block truncate text-vtk-muted">{detail}</span>
        </span>
      </Link>
    </li>
  );
}
