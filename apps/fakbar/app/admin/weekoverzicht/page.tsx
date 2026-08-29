import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma } from '@vtk/db';
import { WeekActions } from './week-actions';
import { CreateWeekForm } from '../create-week-form';
import { formatEuro } from '@/lib/fakbar-format';
import { theoreticalRevenue, weekTotals } from '@/lib/fakbar-totals';
import { formatWeekRange, planningFakbarWeek } from '@/lib/fakbar-week';

export const metadata: Metadata = { title: 'Weekoverzicht' };

export default async function WeekOverzichtPage() {
  // De eerstvolgende week die je nog kan plannen; die staat voorgevuld in het
  // formulier hieronder. Zonder dit kon je enkel de allereerste week aanmaken
  // (het formulier stond alleen in de lege staat van het overzicht) en daarna
  // nooit meer een volgende.
  const planning = planningFakbarWeek(new Date());

  const weeks = await prisma.fakbarWeek.findMany({
    orderBy: [{ year: 'desc' }, { weekNumber: 'desc' }],
    take: 30,
    include: {
      evenings: {
        include: {
          cashCount: true,
          consumption: { select: { quantity: true, category: true, item: { select: { salesPrice: true } } } },
        },
      },
      stockCounts: { include: { item: { select: { salesPrice: true } } } },
    },
  });

  return (
    <div className="space-y-6">
      <div className="fakbar-section-head">
        <h2>Weekoverzicht</h2>
        <p>
          Alle geregistreerde weken, meest recent eerst. De verwachte omzet komt uit de stocktelling; het verschil met
          de ontvangsten is wat er niet verklaard is door het tappersblad.
        </p>
      </div>

      <div className="fakbar-card fakbar-card-accent">
        <h3 className="text-base font-semibold text-[var(--ink)]">Week aanmaken</h3>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Je krijgt zes avonden, zondag tot en met vrijdag, en een tellingsrij per artikel van de drankkaart.
        </p>
        <div className="mt-4">
          <CreateWeekForm defaultYear={planning.year} defaultWeek={planning.week} />
        </div>
      </div>

      {weeks.length === 0 ? (
        <div className="fakbar-empty">
          <h3>Nog geen weken</h3>
          <p>Maak de eerste week aan op het overzicht.</p>
          <Link href="/admin" className="fakbar-btn fakbar-btn-primary mt-2">
            Naar het overzicht
          </Link>
        </div>
      ) : (
        <div className="fakbar-table-wrap">
          <table className="fakbar-table fakbar-table-stack">
            <thead>
              <tr>
                <th>Week</th>
                <th>Periode</th>
                <th>Status</th>
                <th className="num">Ontvangsten</th>
                <th className="num">Verwacht</th>
                <th className="num">Verschil</th>
                <th className="num">Gemist</th>
                <th>
                  <span className="sr-only">Acties</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {weeks.map((week) => {
                const totals = weekTotals(week.evenings);
                const expected = theoreticalRevenue(week.stockCounts);
                // "We weten het niet" en "het klopt precies" mogen niet
                // hetzelfde tonen: zonder stocktelling is er geen verschil.
                const delta = expected === null ? null : totals.revenue + totals.lostRevenue - expected;
                const counted = week.evenings.filter((evening) => evening.cashCount).length;

                return (
                  <tr key={week.id}>
                    <td data-label="Week">
                      <span className="font-semibold text-[var(--ink)]">Week {week.weekNumber}</span>
                      <span className="ml-1.5 text-[var(--muted)]">{week.year}</span>
                      <span className="mt-0.5 block text-xs text-[var(--muted)]">
                        {counted} van {week.evenings.length} avonden geteld
                      </span>
                    </td>
                    <td data-label="Periode">{formatWeekRange(week.startDate, week.endDate)}</td>
                    <td data-label="Status">
                      <span className="fakbar-badge" data-tone={week.status === 'OPEN' ? 'open' : 'closed'}>
                        {week.status === 'OPEN' ? 'Open' : 'Afgesloten'}
                      </span>
                    </td>
                    <td className="num tabular-nums" data-label="Ontvangsten">
                      {formatEuro(totals.revenue)}
                    </td>
                    <td className="num tabular-nums" data-label="Verwacht">
                      {expected === null ? <span className="text-[var(--muted)]">geen telling</span> : formatEuro(expected)}
                    </td>
                    <td
                      className="num font-semibold tabular-nums"
                      data-label="Verschil"
                      style={{ color: delta === null || delta === 0 ? 'var(--muted)' : delta < 0 ? 'var(--danger)' : 'var(--success)' }}
                    >
                      {delta === null ? '·' : formatEuro(delta)}
                    </td>
                    <td className="num tabular-nums" data-label="Gemist">
                      {formatEuro(totals.lostRevenue)}
                    </td>
                    <td data-label="">
                      <div className="flex flex-wrap items-center justify-end gap-1.5">
                        <Link
                          href={`/admin/stocktelling?week=${week.id}`}
                          className="rounded-full px-3 py-1 text-xs font-medium text-[var(--ink)] underline underline-offset-2"
                        >
                          Stock
                        </Link>
                        <WeekActions
                          weekId={week.id}
                          label={`week ${week.weekNumber} van ${week.year}`}
                          status={week.status}
                          eveningCount={week.evenings.length}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
