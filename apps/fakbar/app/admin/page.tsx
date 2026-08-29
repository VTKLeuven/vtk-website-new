import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma } from '@vtk/db';
import { ElixirIcon } from '@/components/elixir-icon';
import { CreateWeekForm } from './create-week-form';
import { formatEuro, formatShortDate } from '@/lib/fakbar-format';
import { weekTotals, eveningTotals } from '@/lib/fakbar-totals';
import { currentFakbarWeek, formatWeekRange } from '@/lib/fakbar-week';

export const metadata: Metadata = { title: 'Overzicht' };

const eveningInclude = {
  hoofdtapper: { select: { name: true } },
  cashCount: true,
  rental: { select: { eveningId: true } },
  consumption: { select: { quantity: true, category: true, item: { select: { salesPrice: true } } } },
  _count: { select: { specials: true } },
} as const;

export default async function AdminDashboardPage() {
  const now = new Date();
  const current = currentFakbarWeek(now);

  // Bewust geen "maak aan als ze niet bestaat" bij het openen van het
  // dashboard: dat maakte stilzwijgend een week aan telkens iemand keek, ook in
  // een vakantie waarin de bar dicht is. Aanmaken is een knop.
  const [week, itemCount] = await Promise.all([
    prisma.fakbarWeek.findUnique({
      where: { year_weekNumber: { year: current.year, weekNumber: current.week } },
      include: { evenings: { orderBy: { date: 'asc' }, include: eveningInclude } },
    }),
    prisma.fakbarItem.count(),
  ]);

  if (!week) {
    return (
      <div className="space-y-6">
        <div className="fakbar-section-head">
          <h2>Week {current.week} van {current.year}</h2>
          <p>Voor de lopende week is er nog niets aangemaakt.</p>
        </div>
        <div className="fakbar-empty">
          <h3>Deze week staat nog niet klaar</h3>
          <p>
            Maak de week aan om de avonden en de stocktelling in te vullen. Je krijgt zes avonden, zondag tot en met
            vrijdag, en een tellingsrij per artikel van de drankkaart
            {itemCount === 0 ? '. Er staan momenteel nog geen artikelen op de kaart.' : ` (${itemCount} artikelen).`}
          </p>
          <div className="mt-2">
            <CreateWeekForm defaultYear={current.year} defaultWeek={current.week} />
          </div>
        </div>
      </div>
    );
  }

  const totals = weekTotals(week.evenings);
  const untouched = week.evenings.filter((evening) => !evening.cashCount).length;

  return (
    <div className="space-y-9">
      <section>
        <div className="fakbar-section-head">
          <h2>
            Week {week.weekNumber} van {week.year}
          </h2>
          <p>
            {formatWeekRange(week.startDate, week.endDate)} · {week.status === 'OPEN' ? 'open' : 'afgesloten'}
            {untouched > 0
              ? ` · ${untouched} van de ${week.evenings.length} avonden nog niet geteld`
              : ' · alle avonden geteld'}
          </p>
        </div>

        <div className="fakbar-stat-grid">
          <Stat label="Ontvangsten" value={formatEuro(totals.revenue)} sub="cash naar kluis plus Bancontact" />
          <Stat label="Naar de kluis" value={formatEuro(totals.cash)} sub="cash" />
          <Stat label="Bancontact" value={formatEuro(totals.bancontact)} sub="ontvangen" />
          <Stat
            label="Gemiste inkomsten"
            value={formatEuro(totals.lostRevenue)}
            sub="tappersblad, aan verkoopprijs"
            tone={totals.lostRevenue > 0 ? 'negative' : undefined}
          />
        </div>
      </section>

      <section>
        <div className="fakbar-section-head">
          <h2>Avonden</h2>
          <p>Klik een avond aan om de kassatelling en het tappersblad in te vullen.</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {week.evenings.map((evening) => {
            const one = eveningTotals(evening);
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
                  <Line label="Hoofdtapper" value={evening.hoofdtapper?.name ?? 'niet ingevuld'} />
                  <Line label="Ontvangsten" value={formatEuro(one.revenue)} />
                </dl>

                <div className="flex flex-wrap gap-1.5">
                  <span className="fakbar-badge" data-tone={counted ? 'open' : undefined}>
                    {counted ? 'Geteld' : 'Nog te tellen'}
                  </span>
                  {evening.rental ? <span className="fakbar-badge">Verhuur</span> : null}
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

      <section>
        <div className="fakbar-section-head">
          <h2>Verder</h2>
        </div>
        <div className="flex flex-wrap gap-3">
          <QuickLink href="/admin/stocktelling" icon="stock" label="Stocktelling invullen" />
          <QuickLink href="/admin/weekoverzicht" icon="calendar" label="Alle weken" />
          <QuickLink href="/admin/instellingen" icon="menu" label="Drankkaart beheren" />
        </div>
      </section>
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
      <p className="fakbar-stat-label">{label}</p>
      <p className="fakbar-stat-value" data-tone={tone}>
        {value}
      </p>
      <p className="fakbar-stat-sub">{sub}</p>
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-[var(--muted)]">{label}</dt>
      <dd className="font-medium text-[var(--ink)]">{value}</dd>
    </div>
  );
}

function QuickLink({ href, icon, label }: { href: string; icon: 'stock' | 'calendar' | 'menu'; label: string }) {
  return (
    <Link href={href} className="fakbar-btn fakbar-btn-ghost">
      <ElixirIcon name={icon} className="h-4 w-4 text-[var(--muted)]" />
      {label}
    </Link>
  );
}
