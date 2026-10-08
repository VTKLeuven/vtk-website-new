import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DEFAULT_FAK_PERIOD_RULES } from '@vtk/db/fakscanner';
import { ElixirIcon } from '@/components/elixir-icon';
import { FakPeriodForm } from '@/components/fakscanner/period-form';
import { toDatetimeLocalValue } from '@/lib/brussels-datetime';
import {
  describePeriodInterval,
  describePeriodReward,
  describePeriodWindow,
  FAK_PERIOD_STATUS_LABEL,
  fakPeriodStatus,
  formatPeriodMoment,
  getFakPeriod,
  getFakPeriodRanking,
  RANK_PAGE_SIZE,
} from '@/lib/fakscanner-admin';

export const metadata: Metadata = { title: 'Periode · Fakscanner' };

/**
 * Eén periode: haar regels, de stand van iedereen die erin scande, en het
 * formulier om ze aan te passen. Per persoon staat er één rij met het aantal
 * check-ins en de laatste scan; welke uren iemand er was, bewaren we niet.
 */
export default async function FakPeriodPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ rang?: string }>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const period = await getFakPeriod(id);
  if (!period) notFound();

  const rankPage = Math.max(1, Number(sp.rang) || 1);
  const ranking = await getFakPeriodRanking(period.id, (rankPage - 1) * RANK_PAGE_SIZE, RANK_PAGE_SIZE);
  const rankPages = Math.max(1, Math.ceil(ranking.total / RANK_PAGE_SIZE));
  const firstRank = (rankPage - 1) * RANK_PAGE_SIZE;
  const status = fakPeriodStatus(period);

  const dateTimeFmt = new Intl.DateTimeFormat('nl-BE', {
    timeZone: 'Europe/Brussels',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const pageHref = (page: number) => `/admin/fakscanner/periodes/${period.id}?rang=${page}`;
  const pill = 'rounded-full border border-[var(--line)] px-3 py-1 text-xs font-medium text-[var(--muted)]';

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/fakscanner/periodes" className="fakbar-breadcrumb !text-[var(--muted)]">
          <ElixirIcon name="chevron" className="h-3.5 w-3.5 rotate-90" />
          Periodes
        </Link>
        <div className="fakbar-section-head mt-1">
          <h2 className="flex flex-wrap items-center gap-3">
            {period.name}
            <span
              className="fakbar-badge"
              data-tone={status === 'active' ? 'open' : status === 'ended' ? 'closed' : undefined}
            >
              {FAK_PERIOD_STATUS_LABEL[status]}
            </span>
          </h2>
          <p>
            {status === 'active'
              ? 'De scanner telt nu volgens deze periode; de jaarstand staat stil tot het einde.'
              : status === 'upcoming'
                ? 'Vanaf het begin telt de scanner volgens deze periode; tot dan telt alles zoals altijd.'
                : 'Afgelopen. De stand hieronder blijft bewaard; de scanner telt weer zoals altijd.'}
          </p>
        </div>
      </div>

      <dl className="fakbar-card grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="text-xs text-[var(--muted)]">Van</dt>
          <dd className="mt-0.5 font-medium tabular-nums text-[var(--ink)]">{formatPeriodMoment(period.startsAt)}</dd>
        </div>
        <div>
          <dt className="text-xs text-[var(--muted)]">Tot</dt>
          <dd className="mt-0.5 font-medium tabular-nums text-[var(--ink)]">{formatPeriodMoment(period.endsAt)}</dd>
        </div>
        <div>
          <dt className="text-xs text-[var(--muted)]">Telt</dt>
          <dd className="mt-0.5 font-medium text-[var(--ink)]">
            {describePeriodInterval(period.intervalMinutes)}, {describePeriodWindow(period).toLowerCase()}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-[var(--muted)]">Gratis pint</dt>
          <dd className="mt-0.5 font-medium text-[var(--ink)]">{describePeriodReward(period)}</dd>
        </div>
      </dl>

      {/* Stand */}
      <section className="fakbar-card space-y-3">
        <div>
          <h3 className="text-base font-semibold text-[var(--ink)]">Stand</h3>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {ranking.total === 0
              ? 'Nog niemand gescand in deze periode.'
              : `${ranking.total} ${ranking.total === 1 ? 'persoon' : 'mensen'} scanden minstens één keer.`}{' '}
            Deze check-ins tellen niet mee in de jaarstand.
          </p>
        </div>

        {ranking.rows.length > 0 ? (
          <>
            <div className="fakbar-table-wrap">
              <table className="fakbar-table fakbar-table-stack">
                <thead>
                  <tr>
                    <th className="w-10">#</th>
                    <th>Naam</th>
                    <th className="num">Check-ins</th>
                    {period.rewardEnabled ? <th className="num">Pinten</th> : null}
                    <th>Laatste check-in</th>
                  </tr>
                </thead>
                <tbody>
                  {ranking.rows.map((row, index) => (
                    <tr key={row.rNumber}>
                      <td className="tabular-nums text-[var(--muted)]" data-label="#">
                        {firstRank + index + 1}
                      </td>
                      <td data-label="Naam">
                        <span className="font-medium text-[var(--ink)]">
                          {row.name ?? <span className="tabular-nums">{row.rNumber}</span>}
                        </span>
                        <span className="ml-1.5 text-xs text-[var(--muted)]">
                          {row.name ? row.rNumber : '(geen VTK-account)'}
                        </span>
                      </td>
                      <td className="num font-medium tabular-nums text-[var(--ink)]" data-label="Check-ins">
                        {row.checkins}
                      </td>
                      {period.rewardEnabled ? (
                        <td className="num tabular-nums" data-label="Pinten">
                          {Math.floor(row.checkins / period.rewardEvery)}
                        </td>
                      ) : null}
                      <td className="whitespace-nowrap tabular-nums text-[var(--muted)]" data-label="Laatste check-in">
                        {dateTimeFmt.format(row.lastCheckinAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rankPages > 1 ? (
              <div className="flex items-center justify-between text-xs text-[var(--muted)]">
                <span>
                  Pagina {rankPage} / {rankPages}
                </span>
                <div className="flex gap-2">
                  {rankPage > 1 && (
                    <Link href={pageHref(rankPage - 1)} className={pill}>
                      Vorige
                    </Link>
                  )}
                  {rankPage < rankPages && (
                    <Link href={pageHref(rankPage + 1)} className={pill}>
                      Volgende
                    </Link>
                  )}
                </div>
              </div>
            ) : null}
          </>
        ) : null}
      </section>

      {/* Bewerken */}
      <div>
        <div className="fakbar-section-head">
          <h3 className="text-base font-semibold text-[var(--ink)]">Regels aanpassen</h3>
          <p>
            Een wijziging geldt vanaf de volgende scan. Check-ins die al geteld zijn, blijven staan; ook wanneer je
            het venster of het tijdvak verandert.
          </p>
        </div>
        <FakPeriodForm
          values={{
            id: period.id,
            name: period.name,
            startsAt: toDatetimeLocalValue(period.startsAt),
            endsAt: toDatetimeLocalValue(period.endsAt),
            windowEnabled: Boolean(period.windowStart && period.windowEnd),
            windowStart: period.windowStart ?? DEFAULT_FAK_PERIOD_RULES.windowStart,
            windowEnd: period.windowEnd ?? DEFAULT_FAK_PERIOD_RULES.windowEnd,
            intervalMinutes: period.intervalMinutes,
            rewardEnabled: period.rewardEnabled,
            rewardEvery: period.rewardEvery,
          }}
        />
      </div>
    </div>
  );
}
