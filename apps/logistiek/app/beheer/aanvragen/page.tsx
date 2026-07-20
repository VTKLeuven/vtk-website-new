import Link from 'next/link';
import { ReservationStatusBadge } from '@/components/status-badge';
import { requireManage } from '@/lib/session';
import { formatDateOnly, formatEuro, isLastMinute, REQUESTER_TYPE_LABELS } from '@/lib/uitleen';
import { adminReservations, type AdminReservation } from '@/lib/uitleen-server';

const TABS: Array<{ value: string; label: string }> = [
  { value: 'all', label: 'Alle' },
  { value: 'INTERN', label: 'Interne posten' },
  { value: 'WERKGROEP', label: 'Werkgroepen' },
  { value: 'EXTERN', label: 'Externen' },
];

export default async function BeheerAanvragenPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  await requireManage();
  const { type } = await searchParams;
  const activeTab = TABS.some((t) => t.value === type) ? type! : 'all';

  const all = await adminReservations();
  const reservations = activeTab === 'all' ? all : all.filter((r) => r.requesterType === activeTab);

  const open = reservations.filter((r) => r.status === 'REQUESTED');
  const active = reservations.filter((r) => r.status === 'APPROVED' || r.status === 'PICKED_UP');
  const done = reservations.filter((r) => !['REQUESTED', 'APPROVED', 'PICKED_UP'].includes(r.status));

  function requesterLabel(reservation: AdminReservation): string {
    if (reservation.requesterType === 'INTERN') {
      return reservation.group?.nameNl ?? REQUESTER_TYPE_LABELS.INTERN;
    }
    return reservation.requesterName ?? REQUESTER_TYPE_LABELS[reservation.requesterType];
  }

  function ReservationRow({ reservation }: { reservation: AdminReservation }) {
    const lastMinute = reservation.status === 'REQUESTED' && isLastMinute(reservation.pickupDate, reservation.createdAt);
    return (
      <li>
        <Link
          href={`/beheer/aanvragen/${reservation.id}`}
          className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-[14px] border border-vtk-navy/10 bg-vtk-surface px-4 py-3 transition hover:border-vtk-navy/25"
        >
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-2 font-medium text-vtk-ink">
              <span className="rounded-full bg-vtk-paper-2 px-2 py-0.5 text-[11px] font-semibold text-vtk-navy">
                {requesterLabel(reservation)}
              </span>
              {reservation.eventName}
              {lastMinute ? (
                <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700">
                  Last minute
                </span>
              ) : null}
            </p>
            <p className="mt-0.5 truncate text-sm text-vtk-muted">
              {reservation.user.name} ·{' '}
              {reservation.lines.map((line) => `${line.quantity}× ${line.itemName}`).join(', ')}
            </p>
            <p className="mt-0.5 text-sm text-vtk-muted">
              {formatDateOnly(reservation.pickupDate)} tot {formatDateOnly(reservation.returnDate)}
              {reservation.totalDepositCents > 0
                ? ` · ${formatEuro(reservation.totalDepositCents)} waarborg`
                : ''}
            </p>
          </div>
          <ReservationStatusBadge status={reservation.status} />
        </Link>
      </li>
    );
  }

  function Section({ title, list }: { title: string; list: AdminReservation[] }) {
    return (
      <section>
        <h2 className="text-lg font-semibold tracking-tight text-vtk-ink">
          {title} ({list.length})
        </h2>
        {list.length === 0 ? (
          <p className="mt-3 text-sm text-vtk-muted">Niets hier.</p>
        ) : (
          <ul className="mt-4 grid gap-2">
            {list.map((reservation) => (
              <ReservationRow key={reservation.id} reservation={reservation} />
            ))}
          </ul>
        )}
      </section>
    );
  }

  return (
    <div className="grid gap-8">
      <nav className="flex flex-wrap gap-2" aria-label="Filter op aanvrager">
        {TABS.map((tab) => (
          <Link
            key={tab.value}
            href={tab.value === 'all' ? '/beheer/aanvragen' : `/beheer/aanvragen?type=${tab.value}`}
            aria-current={activeTab === tab.value ? 'page' : undefined}
            className={
              activeTab === tab.value
                ? 'rounded-full bg-vtk-navy px-4 py-1.5 text-sm font-semibold text-white'
                : 'rounded-full border border-vtk-navy/15 px-4 py-1.5 text-sm font-medium text-vtk-ink transition hover:border-vtk-navy/40'
            }
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      <Section title="Te beslissen" list={open} />
      <Section title="Lopend" list={active} />
      <Section title="Afgerond" list={done} />
    </div>
  );
}
