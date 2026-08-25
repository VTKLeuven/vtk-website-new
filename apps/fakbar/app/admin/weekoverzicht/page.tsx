import type { Metadata } from 'next';
import { prisma } from '@vtk/db';
import Link from 'next/link';

export const metadata: Metadata = { title: 'Weekoverzicht' };

export default async function WeekOverzichtPage() {
  const weeks = await prisma.fakbarWeek.findMany({
    orderBy: [{ year: 'desc' }, { weekNumber: 'desc' }],
    take: 20,
    include: { evenings: { include: { hoofdtapper: { select: { name: true } } } } },
  });

  return (
    <div className="space-y-6">
      <div className="fakbar-section-head">
        <h2>Weekoverzicht</h2>
        <p>Alle geregistreerde weken, meest recent eerst.</p>
      </div>

      {weeks.length === 0 ? (
        <p className="text-[--muted] text-sm">Nog geen weken aangemaakt.</p>
      ) : (
        <div className="grid gap-3">
          {weeks.map((week) => {
            const totalCash = week.evenings.reduce((s, e) => s + e.cashToSafe, 0);
            const totalBancontact = week.evenings.reduce((s, e) => s + e.bancontactRevenue, 0);
            return (
              <div key={week.id} className="fakbar-row flex-col items-start gap-3 sm:flex-row sm:items-center">
                <div className="flex-1">
                  <span className="font-semibold text-[--ink]">
                    Week {week.weekNumber} — {week.year}
                  </span>
                  <span className={`ml-3 rounded-full px-2 py-0.5 text-xs font-semibold ${week.status === 'OPEN' ? 'bg-green-100 text-green-700' : 'bg-[--paper-2] text-[--muted]'}`}>
                    {week.status}
                  </span>
                </div>
                <div className="flex gap-6 text-sm text-[--muted]">
                  <span>{week.evenings.length} avonden</span>
                  <span>Kluis: <strong className="text-[--ink]">€{(totalCash / 100).toFixed(2)}</strong></span>
                  <span>BC: <strong className="text-[--ink]">€{(totalBancontact / 100).toFixed(2)}</strong></span>
                </div>
                <Link
                  href={`/admin/avondtelling?week=${week.id}`}
                  className="shrink-0 rounded-full border border-[--line-2] px-4 py-1.5 text-xs font-medium text-[--ink] transition hover:border-[--ink]"
                >
                  Bekijken →
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
