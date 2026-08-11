import Link from 'next/link';
import { prisma } from '@vtk/db';
import { requireManage } from '@/lib/session';
import { formatDateOnly, parseDateOnly, todayDateOnly, toDateInputValue } from '@/lib/uitleen';
import { PrintSheet, printSheetSelect } from '../print-sheet';
import { PrintButton } from '../print-button';

/**
 * Alle afhalingen van één dag, één A4 per aanvraag.
 *
 * Een shift die om negen uur begint, wil één keer naar de printer en niet
 * zeven keer. Enkel beslist materiaal: een aanvraag die nog goedgekeurd moet
 * worden, zet je niet klaar, en ze zou de stapel enkel langer maken.
 */
export default async function DagPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ datum?: string }>;
}) {
  await requireManage();

  const { datum } = await searchParams;
  const day = (datum && parseDateOnly(datum)) || todayDateOnly();

  const reservations = await prisma.uitleenReservation.findMany({
    where: { pickupDate: day, status: { in: ['APPROVED', 'PICKED_UP'] } },
    orderBy: { eventName: 'asc' },
    select: printSheetSelect,
  });

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div>
          <Link href="/beheer/kalender" className="text-sm text-vtk-muted hover:underline">
            ← Kalender
          </Link>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-vtk-ink">
            Afhalingen van {formatDateOnly(day)}
          </h2>
          <p className="text-sm text-vtk-muted">
            {reservations.length === 0
              ? 'Geen goedgekeurde afhalingen op deze dag.'
              : `${reservations.length} ${reservations.length === 1 ? 'aanvraag' : 'aanvragen'}, elk op een eigen blad.`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Een datumveld zonder formulier: de pagina is een afdrukvoorbeeld,
              geen scherm om in te werken. */}
          <form className="flex items-center gap-2">
            <label className="text-sm text-vtk-muted" htmlFor="datum">
              Dag
            </label>
            <input
              id="datum"
              type="date"
              name="datum"
              defaultValue={toDateInputValue(day)}
              className="h-10 rounded-lg border border-vtk-navy/15 bg-white px-3 text-sm text-vtk-ink"
            />
            <button
              type="submit"
              className="rounded-full border border-vtk-navy/15 px-3.5 py-2 text-sm font-medium text-vtk-ink transition hover:border-vtk-navy/40"
            >
              Tonen
            </button>
          </form>
          {reservations.length > 0 ? <PrintButton label="Alles afdrukken" /> : null}
        </div>
      </div>

      <div className="grid gap-6 print:gap-0">
        {reservations.map((reservation) => (
          <PrintSheet key={reservation.id} reservation={reservation} />
        ))}
      </div>
    </div>
  );
}
