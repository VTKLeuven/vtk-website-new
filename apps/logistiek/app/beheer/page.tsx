import Link from 'next/link';
import type { ReactNode } from 'react';
import { prisma } from '@vtk/db';
import { formatDateOnly, todayDateOnly } from '@/lib/uitleen';
import { requireManage } from '@/lib/session';
import { adminAgenda } from '@/lib/uitleen-server';

type StatusCount = { label: string; value: number; tone: string; attention?: boolean };

function AgendaRow({
  kind,
  tone,
  requester,
  detailLabel,
  detail,
}: {
  kind: string;
  tone: string;
  requester: string;
  detailLabel: string;
  detail: ReactNode;
}) {
  return (
    <li className="logistics-agenda-row">
      <span className={tone}>{kind}</span>
      <div className="logistics-reservation-cell">
        <span>Aanvrager</span>
        <strong>{requester}</strong>
      </div>
      <div className="logistics-reservation-cell">
        <span>{detailLabel}</span>
        <p>{detail}</p>
      </div>
    </li>
  );
}

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
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div>
          <h2 className="text-lg font-semibold tracking-[-0.025em] text-vtk-ink">{title}</h2>
          <p className="mt-0.5 text-sm text-vtk-muted">{description}</p>
        </div>
        <Link
          href={href}
          className="inline-flex items-center gap-1.5 rounded-full border border-vtk-navy/15 px-3 py-1.5 text-xs font-semibold text-vtk-ink transition hover:border-vtk-navy/40 hover:bg-vtk-paper"
        >
          Bekijk alles <span aria-hidden>→</span>
        </Link>
      </div>
      <dl className="grid border-t border-vtk-navy/10 sm:grid-cols-4 sm:divide-x sm:divide-vtk-navy/10">
        {counts.map((count) => (
          <div
            key={count.label}
            className={`flex items-center justify-between gap-3 border-b border-vtk-navy/10 px-4 py-3 last:border-b-0 sm:block sm:border-b-0 ${count.attention ? 'bg-vtk-yellow/10' : ''}`}
          >
            <dt className="flex items-center gap-2 text-xs font-medium text-vtk-muted">
              <span className={`inline-flex h-2 w-2 rounded-full ${count.tone}`} aria-hidden />
              {count.label}
            </dt>
            <dd className="text-xl font-semibold tabular-nums tracking-[-0.04em] text-vtk-ink sm:mt-2">
              {count.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export default async function BeheerDashboardPage() {
  await requireManage();

  const today = todayDateOnly();
  const [reservationStatuses, vanStatuses, agenda] = await Promise.all([
    prisma.uitleenReservation.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.uitleenTransportBooking.groupBy({ by: ['status'], _count: { _all: true } }),
    adminAgenda(today, today),
  ]);

  const reservationCount = Object.fromEntries(
    reservationStatuses.map(({ status, _count }) => [status, _count._all])
  ) as Record<string, number>;
  const vanCount = Object.fromEntries(vanStatuses.map(({ status, _count }) => [status, _count._all])) as Record<
    string,
    number
  >;
  const value = (counts: Record<string, number>, status: string) => counts[status] ?? 0;

  const pending = value(reservationCount, 'REQUESTED') + value(vanCount, 'REQUESTED');
  const materialCounts: StatusCount[] = [
    {
      label: 'Te beslissen',
      value: value(reservationCount, 'REQUESTED'),
      tone: 'bg-vtk-yellow',
      attention: true,
    },
    {
      label: 'Ingepland',
      value: value(reservationCount, 'APPROVED'),
      tone: 'bg-vtk-navy',
    },
    {
      label: 'Uitgeleend',
      value: value(reservationCount, 'PICKED_UP'),
      tone: 'bg-vtk-blue-muted',
    },
    {
      label: 'Teruggebracht',
      value: value(reservationCount, 'RETURNED'),
      tone: 'bg-emerald-600',
    },
  ];
  const vanCounts: StatusCount[] = [
    {
      label: 'Te beslissen',
      value: value(vanCount, 'REQUESTED'),
      tone: 'bg-vtk-yellow',
      attention: true,
    },
    {
      label: 'Goedgekeurd',
      value: value(vanCount, 'APPROVED'),
      tone: 'bg-vtk-navy',
    },
    {
      label: 'Uitgevoerd',
      value: value(vanCount, 'COMPLETED'),
      tone: 'bg-emerald-600',
    },
    {
      label: 'Niet doorgegaan',
      value: value(vanCount, 'REJECTED') + value(vanCount, 'CANCELLED'),
      tone: 'bg-vtk-blue-muted',
    },
  ];

  return (
    <div className="grid gap-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 text-sm text-vtk-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-vtk-yellow" aria-hidden />
            Werkvoorraad
          </p>
          <h2 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-vtk-ink">Acties en lopend werk</h2>
          <p className="mt-1 text-sm text-vtk-muted">De actuele stand van materiaal en vervoer.</p>
        </div>
        <div className="flex items-baseline gap-2 rounded-full border border-vtk-navy/10 bg-vtk-surface px-4 py-2">
          <strong className="text-lg tabular-nums text-vtk-ink">{pending}</strong>
          <span className="text-xs text-vtk-muted">openstaande beslissingen</span>
        </div>
      </div>

      <div className="grid gap-4">
        <StatusGroup
          title="Materiaal"
          href="/beheer/aanvragen"
          description="Aanvragen en uitleningen"
          counts={materialCounts}
        />
        <StatusGroup
          title="Vervoer"
          href="/beheer/vervoer"
          description="Ritaanvragen en geplande ritten"
          counts={vanCounts}
        />
      </div>

      <section>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm text-vtk-muted">Operationeel vandaag</p>
            <h2 className="mt-1 text-xl font-semibold tracking-[-0.025em] text-vtk-ink">{formatDateOnly(today)}</h2>
          </div>
          <Link
            href="/beheer/kalender"
            className="text-sm font-semibold text-vtk-navy underline decoration-vtk-yellow underline-offset-4"
          >
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
              <AgendaRow
                key={`p-${reservation.id}`}
                kind="Afhaling"
                tone="rounded-full bg-vtk-yellow/30 px-2.5 py-1 text-xs font-semibold text-vtk-ink"
                requester={reservation.user.name}
                detailLabel="Materiaal"
                detail={reservation.lines.map((line) => `${line.quantity}× ${line.itemName}`).join(', ')}
              />
            ))}
            {agenda.returns.map((reservation) => (
              <AgendaRow
                key={`r-${reservation.id}`}
                kind="Terugbrengen"
                tone="rounded-full bg-vtk-paper-2 px-2.5 py-1 text-xs font-semibold text-vtk-navy"
                requester={reservation.user.name}
                detailLabel="Materiaal"
                detail={reservation.lines.map((line) => `${line.quantity}× ${line.itemName}`).join(', ')}
              />
            ))}
            {agenda.vanBookings.map((booking) => (
              <AgendaRow
                key={`v-${booking.id}`}
                kind="Vervoer"
                tone="rounded-full bg-vtk-navy px-2.5 py-1 text-xs font-semibold text-white"
                requester={booking.user.name}
                detailLabel="Rit"
                detail={
                  <>
                    {booking.purpose}
                    <span className="mt-1 block text-xs">Chauffeur: {booking.driver?.name ?? 'nog te kiezen'}</span>
                  </>
                }
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
