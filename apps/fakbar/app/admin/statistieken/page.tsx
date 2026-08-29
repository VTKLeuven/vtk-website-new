import type { Metadata } from 'next';
import Link from 'next/link';
import { RankedBars, WeeklyRevenueChart } from './charts';
import { ElixirIcon } from '@/components/elixir-icon';
import { formatEuro } from '@/lib/fakbar-format';
import { getFakbarStats, isStatRange, STAT_RANGES, type StatRangeKey } from '@/lib/fakbar-stats';

export const metadata: Metadata = { title: 'Statistieken' };

/**
 * Wat de tellingen bij elkaar zeggen.
 *
 * Alles komt uit de avond- en stocktellingen zelf; er is geen aparte
 * statistiektabel die kan gaan afwijken van de bron. Een week zonder telling
 * telt daarom niet als nul mee, maar valt weg: "niet geteld" en "niets
 * verkocht" mogen niet hetzelfde getal opleveren.
 */
export default async function StatistiekenPage({
  searchParams,
}: {
  searchParams: Promise<{ periode?: string }>;
}) {
  const { periode } = await searchParams;
  const range: StatRangeKey = isStatRange(periode) ? periode : '12';
  const stats = await getFakbarStats(range);

  const hasData = stats.weeks.length > 0;
  const deltaTone = stats.totals.delta === null ? undefined : stats.totals.delta < 0 ? 'negative' : 'positive';

  return (
    <div className="space-y-8">
      <div className="fakbar-section-head">
        <h2>Statistieken</h2>
        <p>
          Uit de avond- en stocktellingen van de fakbar zelf. Weken waarvan de kassa niet geteld is, tellen niet mee;
          zo blijft een vergeten telling zichtbaar als een gat en niet als een slechte week.
        </p>
      </div>

      {/* De filter staat op één rij boven de grafieken, niet per grafiek. */}
      <nav className="fakbar-chart-filters" aria-label="Periode">
        {STAT_RANGES.map((entry) => (
          <Link
            key={entry.key}
            href={`/admin/statistieken?periode=${entry.key}`}
            className="fakbar-chip"
            aria-current={entry.key === range ? 'true' : undefined}
          >
            {entry.label}
          </Link>
        ))}
      </nav>

      {!hasData ? (
        <div className="fakbar-empty">
          <h3>Nog niets om te tonen</h3>
          <p>
            Er zijn in deze periode nog geen weken met tellingen. Vul een avondtelling in, dan verschijnen de cijfers
            hier vanzelf.
          </p>
          <Link href="/admin/avondtelling" className="fakbar-btn fakbar-btn-primary mt-2">
            Naar de avondtelling
          </Link>
        </div>
      ) : (
        <>
          <dl className="fakbar-stat-grid">
            <Stat
              label="Ontvangsten"
              value={formatEuro(stats.totals.revenue)}
              sub={`over ${stats.weeks.length} ${stats.weeks.length === 1 ? 'week' : 'weken'}`}
            />
            <Stat
              label="Per getelde avond"
              value={formatEuro(stats.totals.perEvening)}
              sub={`${stats.totals.countedEvenings} avonden geteld`}
            />
            <Stat
              label="Gemiste inkomsten"
              value={formatEuro(stats.totals.lostRevenue)}
              sub={`${(stats.totals.lostShare * 100).toFixed(1)}% van alles wat omging`}
              tone={stats.totals.lostRevenue > 0 ? 'negative' : undefined}
            />
            <Stat
              label="Verschil met de stock"
              value={stats.totals.delta === null ? 'geen telling' : formatEuro(stats.totals.delta)}
              sub={
                stats.totals.delta === null
                  ? 'vul een stocktelling in'
                  : stats.totals.delta < 0
                    ? 'minder ontvangen dan de stock zegt'
                    : 'meer ontvangen dan de stock zegt'
              }
              tone={deltaTone}
            />
          </dl>

          <ChartCard
            title="Ontvangsten per week"
            lead="Cash naar de kluis en Bancontact samen. Beweeg over een week voor de opsplitsing."
          >
            <WeeklyRevenueChart weeks={stats.weeks} />
          </ChartCard>

          <div className="grid gap-5 xl:grid-cols-2">
            <ChartCard title="Welke avond brengt op" lead="Ontvangsten per weekdag, over de hele periode.">
              <RankedBars data={stats.byWeekday} caption="Weekdag" unitLabel="Ontvangsten" />
            </ChartCard>

            <ChartCard
              title="Waar de omzet blijft"
              lead="Het tappersblad aan verkoopprijs: drank die weg is zonder dat er geld tegenover staat."
            >
              <RankedBars data={stats.lostByCategory} caption="Rubriek" unitLabel="Gemist" />
            </ChartCard>
          </div>

          <ChartCard
            title="Wat er door de toog gaat"
            lead="De acht artikelen met de grootste omzet volgens de stocktelling, aan verkoopprijs."
          >
            <RankedBars data={stats.topItems} caption="Artikel" unitLabel="Omzet" />
          </ChartCard>
        </>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone?: 'positive' | 'negative';
}) {
  return (
    <div className="fakbar-stat-card">
      <dt className="fakbar-stat-label">{label}</dt>
      <dd className="fakbar-stat-value" data-tone={tone}>
        {value}
      </dd>
      <dd className="fakbar-stat-sub">{sub}</dd>
    </div>
  );
}

function ChartCard({
  title,
  lead,
  children,
}: {
  title: string;
  lead: string;
  children: React.ReactNode;
}) {
  return (
    <section className="fakbar-card">
      <div className="flex items-start gap-2.5">
        <ElixirIcon name="dashboard" className="mt-1 h-4 w-4 shrink-0 text-[var(--muted)]" />
        <div>
          <h3 className="text-base font-semibold text-[var(--ink)]">{title}</h3>
          <p className="mt-1 max-w-[70ch] text-sm leading-relaxed text-[var(--muted)]">{lead}</p>
        </div>
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}
