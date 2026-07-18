import Link from 'next/link';
import { ReservationStatusBadge } from '@/components/status-badge';
import { requireManage } from '@/lib/session';
import { formatDateOnly, formatEuro } from '@/lib/uitleen';
import { adminReservations } from '@/lib/uitleen-server';

export default async function BeheerAanvragenPage() {
  await requireManage();

  const reservations = await adminReservations();
  const open = reservations.filter((reservation) => reservation.status === 'REQUESTED');
  const active = reservations.filter(
    (reservation) => reservation.status === 'APPROVED' || reservation.status === 'PICKED_UP'
  );
  const done = reservations.filter(
    (reservation) => !['REQUESTED', 'APPROVED', 'PICKED_UP'].includes(reservation.status)
  );

  function ReservationRow({ reservation }: { reservation: (typeof reservations)[number] }) {
    return (
      <li>
        <Link
          href={`/beheer/aanvragen/${reservation.id}`}
          className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-[14px] border border-vtk-navy/10 bg-vtk-surface px-4 py-3 transition hover:border-vtk-navy/25"
        >
          <div className="min-w-0 flex-1">
            <p className="font-medium text-vtk-ink">
              {reservation.user.name}
              <span className="ml-2 text-sm font-normal text-vtk-muted">
                {reservation.lines.map((line) => `${line.quantity}× ${line.itemName}`).join(', ')}
              </span>
            </p>
            <p className="mt-0.5 text-sm text-vtk-muted">
              {formatDateOnly(reservation.pickupDate)} tot {formatDateOnly(reservation.returnDate)}
              {reservation.totalPriceCents > 0 ? ` · ${formatEuro(reservation.totalPriceCents)}` : ''}
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

  return (
    <div className="grid gap-8">
      <section>
        <h2 className="text-lg font-semibold tracking-tight text-vtk-ink">
          Te beslissen ({open.length})
        </h2>
        {open.length === 0 ? (
          <p className="mt-3 text-sm text-vtk-muted">Geen open aanvragen.</p>
        ) : (
          <ul className="mt-4 grid gap-2">
            {open.map((reservation) => (
              <ReservationRow key={reservation.id} reservation={reservation} />
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold tracking-tight text-vtk-ink">
          Lopend ({active.length})
        </h2>
        {active.length === 0 ? (
          <p className="mt-3 text-sm text-vtk-muted">Niets lopend.</p>
        ) : (
          <ul className="mt-4 grid gap-2">
            {active.map((reservation) => (
              <ReservationRow key={reservation.id} reservation={reservation} />
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold tracking-tight text-vtk-ink">Afgerond</h2>
        {done.length === 0 ? (
          <p className="mt-3 text-sm text-vtk-muted">Nog niets afgerond.</p>
        ) : (
          <ul className="mt-4 grid gap-2">
            {done.map((reservation) => (
              <ReservationRow key={reservation.id} reservation={reservation} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
