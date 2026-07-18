import Link from 'next/link';
import { prisma } from '@vtk/db';
import { formatDateOnly, todayDateOnly } from '@/lib/uitleen';
import { requireManage } from '@/lib/session';
import { adminAgenda } from '@/lib/uitleen-server';

type StatusCount = { label: string; value: number; detail: string; tone: string };

function StatusGroup({
  title,
  href,
  description,
  counts,
}: {
  title: string;
  href: string;
  description: string;
  counts: StatusCount[];
}) {
  return (
    <section className="overflow-hidden rounded-[18px] border border-vtk-navy/10 bg-vtk-surface">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-vtk-navy/10 px-4 py-3.5">
        <div>
          <h2 className="text-lg font-semibold tracking-[-0.025em] text-vtk-ink">{title}</h2>
          <p className="mt-0.5 text-xs text-vtk-muted">{description}</p>
        </div>
        <Link
          href={href}
          className="inline-flex items-center gap-1.5 rounded-full border border-vtk-navy/15 px-3 py-1.5 text-xs font-semibold text-vtk-ink transition hover:border-vtk-navy/40 hover:bg-vtk-paper"
        >
          Bekijk alles <span aria-hidden>→</span>
        </Link>
      </div>
      <div className="grid divide-y divide-vtk-navy/10 sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-4">
        {counts.map((count) => (
          <div key={count.label} className="px-4 py-3">
            <span className={`inline-flex h-2 w-2 rounded-full ${count.tone}`} aria-hidden />
            <p className="mt-1.5 text-2xl font-semibold tracking-[-0.04em] text-vtk-ink">{count.value}</p>
            <p className="mt-0.5 text-xs font-semibold text-vtk-ink">{count.label}</p>
            <p className="mt-0.5 text-[11px] leading-4 text-vtk-muted">{count.detail}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export default async function BeheerDashboardPage() {
  await requireManage();

  const today = todayDateOnly();
  const [reservationStatuses, vanStatuses, agenda] = await Promise.all([
    prisma.uitleenReservation.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.uitleenVanBooking.groupBy({ by: ['status'], _count: { _all: true } }),
    adminAgenda(today, today),
  ]);

  const reservationCount = Object.fromEntries(
    reservationStatuses.map(({ status, _count }) => [status, _count._all])
  ) as Record<string, number>;
  const vanCount = Object.fromEntries(
    vanStatuses.map(({ status, _count }) => [status, _count._all])
  ) as Record<string, number>;
  const value = (counts: Record<string, number>, status: string) => counts[status] ?? 0;

  const pending = value(reservationCount, 'REQUESTED') + value(vanCount, 'REQUESTED');
  const materialCounts: StatusCount[] = [
    {
      label: 'Te beslissen',
      value: value(reservationCount, 'REQUESTED'),
      detail: 'Nieuwe aanvragen wachten op je keuze.',
      tone: 'bg-vtk-yellow',
    },
    {
      label: 'Lopend',
      value: value(reservationCount, 'APPROVED') + value(reservationCount, 'PICKED_UP'),
      detail: `${value(reservationCount, 'APPROVED')} ingepland · ${value(reservationCount, 'PICKED_UP')} uitgeleend`,
      tone: 'bg-vtk-navy',
    },
    {
      label: 'Afgerond',
      value: value(reservationCount, 'RETURNED'),
      detail: 'Materiaal is teruggebracht.',
      tone: 'bg-emerald-600',
    },
    {
      label: 'Niet doorgegaan',
      value: value(reservationCount, 'REJECTED') + value(reservationCount, 'CANCELLED'),
      detail: `${value(reservationCount, 'REJECTED')} afgewezen · ${value(reservationCount, 'CANCELLED')} geannuleerd`,
      tone: 'bg-vtk-blue-muted',
    },
  ];
  const vanCounts: StatusCount[] = [
    {
      label: 'Te beslissen',
      value: value(vanCount, 'REQUESTED'),
      detail: 'Nieuwe ritten wachten op je keuze.',
      tone: 'bg-vtk-yellow',
    },
    {
      label: 'Lopend',
      value: value(vanCount, 'APPROVED'),
      detail: 'Goedgekeurd en nog uit te voeren.',
      tone: 'bg-vtk-navy',
    },
    {
      label: 'Afgerond',
      value: value(vanCount, 'COMPLETED'),
      detail: 'Ritten die uitgevoerd zijn.',
      tone: 'bg-emerald-600',
    },
    {
      label: 'Niet doorgegaan',
      value: value(vanCount, 'REJECTED') + value(vanCount, 'CANCELLED'),
      detail: `${value(vanCount, 'REJECTED')} afgewezen · ${value(vanCount, 'CANCELLED')} geannuleerd`,
      tone: 'bg-vtk-blue-muted',
    },
  ];

  return (
    <div className="grid gap-8">
      <section className="overflow-hidden rounded-[18px] bg-vtk-navy text-white">
        <div className="flex flex-wrap items-center justify-between gap-5 px-5 py-5 sm:px-6">
          <div>
            <p className="flex items-center gap-2 text-sm text-white/70">
              <span className="h-1.5 w-1.5 rounded-full bg-vtk-yellow" aria-hidden />
              Werkvoorraad
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-[-0.03em]">Beheer in één oogopslag</h2>
          </div>
          <div className="rounded-[14px] bg-white/10 px-4 py-3">
            <p className="text-2xl font-semibold tracking-[-0.04em] text-vtk-yellow">{pending}</p>
            <p className="mt-0.5 text-xs text-white/70">te beslissen</p>
          </div>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-2">
        <StatusGroup
          title="Materiaal"
          href="/beheer/aanvragen"
          description="Reservaties en de uitleenstatus van je catalogus."
          counts={materialCounts}
        />
        <StatusGroup
          title="Camionette"
          href="/beheer/camionette"
          description="Ritaanvragen, geplande ritten en historiek."
          counts={vanCounts}
        />
      </div>

      <section>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm text-vtk-muted">Operationeel vandaag</p>
            <h2 className="mt-1 text-xl font-semibold tracking-[-0.025em] text-vtk-ink">
              {formatDateOnly(today)}
            </h2>
          </div>
          <Link href="/beheer/kalender" className="text-sm font-semibold text-vtk-navy underline decoration-vtk-yellow underline-offset-4">
            Volledige kalender
          </Link>
        </div>
        {agenda.pickups.length === 0 && agenda.returns.length === 0 && agenda.vanBookings.length === 0 ? (
          <p className="mt-4 rounded-[14px] border border-dashed border-vtk-navy/20 bg-vtk-surface px-4 py-4 text-sm text-vtk-muted">
            Niets gepland vandaag.
          </p>
        ) : (
          <ul className="mt-4 grid gap-2 text-sm">
            {agenda.pickups.map((reservation) => (
              <li key={`p-${reservation.id}`} className="flex flex-wrap items-center gap-3 rounded-[14px] border border-vtk-navy/10 bg-vtk-surface px-4 py-3">
                <span className="rounded-full bg-vtk-yellow/30 px-2.5 py-1 text-xs font-semibold text-vtk-ink">Afhaling</span>
                <span className="text-vtk-body"><strong className="text-vtk-ink">{reservation.user.name}</strong> · {reservation.lines.map((line) => `${line.quantity}× ${line.itemName}`).join(', ')}</span>
              </li>
            ))}
            {agenda.returns.map((reservation) => (
              <li key={`r-${reservation.id}`} className="flex flex-wrap items-center gap-3 rounded-[14px] border border-vtk-navy/10 bg-vtk-surface px-4 py-3">
                <span className="rounded-full bg-vtk-paper-2 px-2.5 py-1 text-xs font-semibold text-vtk-navy">Terugbrengen</span>
                <span className="text-vtk-body"><strong className="text-vtk-ink">{reservation.user.name}</strong> · {reservation.lines.map((line) => `${line.quantity}× ${line.itemName}`).join(', ')}</span>
              </li>
            ))}
            {agenda.vanBookings.map((booking) => (
              <li key={`v-${booking.id}`} className="flex flex-wrap items-center gap-3 rounded-[14px] border border-vtk-navy/10 bg-vtk-surface px-4 py-3">
                <span className="rounded-full bg-vtk-navy px-2.5 py-1 text-xs font-semibold text-white">Camionette</span>
                <span className="text-vtk-body"><strong className="text-vtk-ink">{booking.user.name}</strong> · {booking.purpose}{booking.driver ? ` · chauffeur: ${booking.driver.name}` : ' · chauffeur nog te kiezen'}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
