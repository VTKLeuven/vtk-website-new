import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma } from '@vtk/db';
import { formatEuro, formatShortDate } from '@/lib/fakbar-format';
import { eveningTotals } from '@/lib/fakbar-totals';
import { formatWeekRange } from '@/lib/fakbar-week';

export const metadata: Metadata = { title: 'Avondtelling' };

export default async function AvondtellingPage() {
  const weeks = await prisma.fakbarWeek.findMany({
    where: { status: 'OPEN' },
    orderBy: [{ year: 'desc' }, { weekNumber: 'desc' }],
    take: 6,
    include: {
      evenings: {
        orderBy: { date: 'asc' },
        include: {
          hoofdtapper: { select: { name: true } },
          cashCount: true,
          consumption: { select: { quantity: true, category: true, item: { select: { salesPrice: true } } } },
          _count: { select: { specials: true } },
        },
      },
    },
  });

  return (
    <div className="space-y-9">
      <div className="fakbar-section-head">
        <h2>Avondtelling</h2>
        <p>
          De open weken, meest recent eerst. Kies een avond om de kassa, het tappersblad en wat er naar de kluis ging
          in te vullen. Een afgesloten week staat hier niet meer bij; die vind je onder Weekoverzicht.
        </p>
      </div>

      {weeks.length === 0 ? (
        <div className="fakbar-empty">
          <h3>Geen open weken</h3>
          <p>
            Er staat geen enkele week open om te tellen. Maak een week aan op het overzicht, of heropen een
            afgesloten week in het weekoverzicht.
          </p>
          <Link href="/admin" className="fakbar-btn fakbar-btn-primary mt-2">
            Naar het overzicht
          </Link>
        </div>
      ) : (
        weeks.map((week) => (
          <section key={week.id}>
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-sm font-bold uppercase tracking-[0.07em] text-[var(--muted)]">
                Week {week.weekNumber} van {week.year}
              </h3>
              <span className="text-xs text-[var(--muted)]">{formatWeekRange(week.startDate, week.endDate)}</span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {week.evenings.map((evening) => {
                const totals = eveningTotals(evening);
                const counted = Boolean(evening.cashCount);
                return (
                  <Link
                    key={evening.id}
                    href={`/admin/avondtelling/${evening.id}`}
                    className="fakbar-row flex-col !items-start gap-3"
                  >
                    <div className="flex w-full items-center justify-between gap-2">
                      <span className="font-semibold text-[var(--ink)]">{evening.dayOfWeek}</span>
                      <span className="text-xs font-medium text-[var(--muted)]">{formatShortDate(evening.date)}</span>
                    </div>
                    <dl className="w-full space-y-1.5 text-sm">
                      <div className="flex justify-between gap-3">
                        <dt className="text-[var(--muted)]">Hoofdtapper</dt>
                        <dd className="font-medium text-[var(--ink)]">{evening.hoofdtapper?.name ?? 'niet ingevuld'}</dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-[var(--muted)]">Ontvangsten</dt>
                        <dd className="font-medium text-[var(--ink)]">{formatEuro(totals.revenue)}</dd>
                      </div>
                    </dl>
                    <div className="flex flex-wrap gap-1.5">
                      <span className="fakbar-badge" data-tone={counted ? 'open' : undefined}>
                        {counted ? 'Geteld' : 'Nog te tellen'}
                      </span>
                      {evening._count.specials > 0 ? (
                        <span className="fakbar-badge" data-tone="open">
                          {evening._count.specials} {evening._count.specials === 1 ? 'special' : 'specials'}
                        </span>
                      ) : null}
                      {evening.specialeActiviteit ? (
                        <span className="fakbar-badge">{evening.specialeActiviteit}</span>
                      ) : null}
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
