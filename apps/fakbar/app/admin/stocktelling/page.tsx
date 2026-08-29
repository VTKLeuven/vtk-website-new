import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma } from '@vtk/db';
import { StockForm } from './stock-form';
import { CATEGORY_ORDER, CATEGORY_LABELS } from '@/lib/fakbar-format';
import { formatWeekRange } from '@/lib/fakbar-week';

export const metadata: Metadata = { title: 'Stocktelling' };

export default async function StocktellingPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const { week: weekId } = await searchParams;

  const week = weekId
    ? await prisma.fakbarWeek.findUnique({
        where: { id: weekId },
        include: { stockCounts: { include: { item: true } } },
      })
    : await prisma.fakbarWeek.findFirst({
        where: { status: 'OPEN' },
        orderBy: [{ year: 'desc' }, { weekNumber: 'desc' }],
        include: { stockCounts: { include: { item: true } } },
      });

  if (!week) {
    return (
      <div className="space-y-6">
        <div className="fakbar-section-head">
          <h2>Stocktelling</h2>
        </div>
        <div className="fakbar-empty">
          <h3>Geen open week</h3>
          <p>Maak eerst een week aan op het overzicht; de tellingsrijen komen er dan per artikel bij.</p>
          <Link href="/admin" className="fakbar-btn fakbar-btn-primary mt-2">
            Naar het overzicht
          </Link>
        </div>
      </div>
    );
  }

  // Artikelen die na het aanmaken van de week op de kaart gezet zijn, hebben
  // nog geen tellingsrij. Die melden we in plaats van ze stil weg te laten.
  const itemCount = await prisma.fakbarItem.count();
  const missing = itemCount - week.stockCounts.length;

  const groups = CATEGORY_ORDER.map((category) => ({
    key: category,
    label: CATEGORY_LABELS[category],
    counts: week.stockCounts
      .filter((count) => count.item.category === category)
      .sort((a, b) => a.item.name.localeCompare(b.item.name, 'nl-BE')),
  })).filter((group) => group.counts.length > 0);

  return (
    <div className="space-y-6">
      <div className="fakbar-section-head">
        <h2>
          Stocktelling week {week.weekNumber} van {week.year}
        </h2>
        <p>
          {formatWeekRange(week.startDate, week.endDate)}
          {week.status === 'CLOSED' ? '. Deze week is afgesloten en kan niet meer gewijzigd worden.' : '.'}{' '}
          De opslag en de toog worden apart geteld: wat er in het magazijn staat, en wat er in de frigo en aan de toog
          staat.
        </p>
      </div>

      {missing > 0 ? (
        <p className="rounded-xl border border-[var(--line-2)] bg-[var(--paper-2)] px-4 py-3 text-sm text-[var(--body)]">
          {missing === 1 ? 'Eén artikel staat' : `${missing} artikelen staan`} wel op de drankkaart maar niet in deze
          telling; {missing === 1 ? 'het is' : 'ze zijn'} na het aanmaken van de week toegevoegd. Vanaf de volgende
          week {missing === 1 ? 'staat het' : 'staan ze'} er automatisch bij.
        </p>
      ) : null}

      <StockForm weekId={week.id} readOnly={week.status === 'CLOSED'} groups={groups} />
    </div>
  );
}
