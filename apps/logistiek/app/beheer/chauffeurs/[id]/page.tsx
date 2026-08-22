import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@vtk/db';
import { requireManage } from '@/lib/session';
import { formatDateTime, isNightTrip, tripHoursLabel } from '@/lib/uitleen';
import { tripsForDriver } from '@/lib/uitleen-server';

/**
 * Alle ritten van één chauffeur (T9).
 *
 * De chauffeurslijst zei "2 ritten gereden" en daar hield het op. De vraag
 * erachter is een verdeelvraag: krijgt niet altijd dezelfde persoon de late
 * ritten? Daarom staat er per rit bij of ze 's nachts eindigde, en hoeveel dat
 * er in totaal zijn.
 */
export default async function BeheerChauffeurRittenPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireManage();
  const { id } = await params;

  const [driver, trips] = await Promise.all([
    prisma.user.findUnique({ where: { id }, select: { name: true, email: true } }),
    tripsForDriver(id),
  ]);
  if (!driver) notFound();

  const nightTrips = trips.filter((trip) => isNightTrip(trip.startAt, trip.endAt));

  return (
    <section className="rounded-[18px] border border-vtk-navy/10 bg-vtk-surface p-6">
      <p className="text-sm text-vtk-muted">
        <Link href="/beheer/chauffeurs" className="hover:underline">
          ← Chauffeurs
        </Link>
      </p>
      <h2 className="mt-3 text-lg font-semibold tracking-tight text-vtk-ink">{driver.name}</h2>
      <p className="mt-1 text-sm text-vtk-muted">
        {trips.length === 0
          ? 'Nog geen ritten toegewezen.'
          : `${trips.length} rit${trips.length === 1 ? '' : 'ten'}, waarvan ${nightTrips.length} nachtrit${
              nightTrips.length === 1 ? '' : 'ten'
            } (eindigt na 22:00).`}
      </p>

      {trips.length > 0 ? (
        <div className="relative mt-5 overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-vtk-navy/15 text-left text-xs text-vtk-muted">
                <th className="py-2 pr-3 font-medium">Wanneer</th>
                <th className="py-2 pr-3 font-medium">Uren</th>
                <th className="py-2 pr-3 font-medium">Voertuig</th>
                <th className="py-2 pr-3 font-medium">Evenement</th>
                <th className="py-2 pr-3 font-medium">Aanvrager</th>
              </tr>
            </thead>
            <tbody>
              {trips.map((trip) => (
                <tr key={trip.id} className="border-b border-vtk-navy/10 align-top">
                  <td className="py-2 pr-3 text-vtk-ink">
                    <Link href={`/vervoer/${trip.id}`} className="hover:underline">
                      {formatDateTime(trip.startAt)}
                    </Link>
                  </td>
                  <td className="py-2 pr-3 tabular-nums text-vtk-body">
                    {tripHoursLabel(trip.startAt, trip.endAt)}
                    {isNightTrip(trip.startAt, trip.endAt) ? (
                      <span className="ml-2 rounded-full bg-vtk-navy px-2 py-0.5 text-[11px] font-semibold text-white">
                        Nacht
                      </span>
                    ) : null}
                  </td>
                  <td className="py-2 pr-3 text-vtk-body">{trip.vehicle.nameNl}</td>
                  <td className="py-2 pr-3 text-vtk-body">{trip.eventName ?? trip.purpose}</td>
                  <td className="py-2 pr-3 text-vtk-body">{trip.user.name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
