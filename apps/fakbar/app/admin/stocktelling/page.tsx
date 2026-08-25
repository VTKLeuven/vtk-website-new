import type { Metadata } from 'next';
import { prisma } from '@vtk/db';

export const metadata: Metadata = { title: 'Stocktelling' };

export default async function StocktellingPage() {
  const items = await prisma.fakbarItem.findMany({
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
  });

  const currentWeek = await prisma.fakbarWeek.findFirst({
    where: { status: 'OPEN' },
    orderBy: [{ year: 'desc' }, { weekNumber: 'desc' }],
    include: {
      stockCounts: { include: { item: true } },
    },
  });

  const CATEGORIES: Record<string, string> = {
    VAT: "Bieren van 't Vat",
    BIER_WIJN: 'Bieren op Fles & Wijn',
    FRISDRANK: 'Frisdranken',
    STERK: 'Sterke Drank',
  };

  const grouped = Object.entries(CATEGORIES).map(([key, label]) => ({
    key,
    label,
    items: items.filter((i) => i.category === key),
  }));

  return (
    <div className="space-y-8">
      <div className="fakbar-section-head">
        <h2>Stocktelling</h2>
        <p>
          {currentWeek
            ? `Week ${currentWeek.weekNumber} — ${currentWeek.year}`
            : 'Geen open week gevonden.'}
        </p>
      </div>

      {!currentWeek ? (
        <p className="text-[--muted] text-sm">Maak eerst een week aan via het dashboard.</p>
      ) : (
        grouped.map(({ key, label, items }) => {
          if (items.length === 0) return null;
          return (
            <section key={key}>
              <p className="mb-3 text-sm font-semibold uppercase tracking-wider text-[--muted]">{label}</p>
              <div className="overflow-hidden rounded-[18px] border border-[--line] bg-[--surface]">
                {/* Header row */}
                <div className="grid grid-cols-[1fr_80px_80px_80px_80px] gap-4 border-b border-[--line] px-5 py-3 text-xs font-bold uppercase tracking-wider text-[--muted]">
                  <span>Artikel</span>
                  <span className="text-right">Begin</span>
                  <span className="text-right">Levering</span>
                  <span className="text-right">Eind</span>
                  <span className="text-right">Delta</span>
                </div>
                {items.map((item, idx) => {
                  const count = currentWeek.stockCounts.find((s) => s.itemId === item.id);
                  const delta = count ? count.eindTelling - count.beginTelling : 0;
                  return (
                    <div
                      key={item.id}
                      className={`grid grid-cols-[1fr_80px_80px_80px_80px] gap-4 items-center px-5 py-3 ${idx < items.length - 1 ? 'border-b border-[--line]' : ''}`}
                    >
                      <span className="font-medium text-[--ink]">{item.name}</span>
                      <span className="text-right text-sm text-[--muted]">{count?.beginTelling ?? '—'}</span>
                      <span className="text-right text-sm text-[--muted]">{count?.levering ?? '—'}</span>
                      <span className="text-right text-sm text-[--muted]">{count?.eindTelling ?? '—'}</span>
                      <span className={`text-right text-sm font-semibold ${delta < 0 ? 'text-red-600' : delta > 0 ? 'text-green-600' : 'text-[--muted]'}`}>
                        {count ? (delta >= 0 ? `+${delta}` : delta) : '—'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}
