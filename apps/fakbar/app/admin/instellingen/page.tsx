import type { Metadata } from 'next';
import { prisma } from '@vtk/db';

export const metadata: Metadata = { title: 'Instellingen' };

export default async function InstellingenPage() {
  const itemCount = await prisma.fakbarItem.count();
  const weekCount = await prisma.fakbarWeek.count();

  return (
    <div className="space-y-8">
      <div className="fakbar-section-head">
        <h2>Instellingen</h2>
        <p>Overzicht van de huidige configuratie van 't ElixIr.</p>
      </div>

      {/* Stats */}
      <div className="fakbar-stat-grid">
        <div className="fakbar-stat-card">
          <p className="fakbar-stat-label">Artikelen</p>
          <p className="fakbar-stat-value">{itemCount}</p>
          <p className="fakbar-stat-sub">in de drankkaart</p>
        </div>
        <div className="fakbar-stat-card">
          <p className="fakbar-stat-label">Weken geregistreerd</p>
          <p className="fakbar-stat-value">{weekCount}</p>
          <p className="fakbar-stat-sub">totaal</p>
        </div>
      </div>

      {/* Artikelen beheer */}
      <div>
        <div className="fakbar-section-head">
          <h2>Drankkaart artikelen</h2>
          <p>Beheer de items die op de drankkaart verschijnen en in tellingen gebruikt worden.</p>
        </div>
        <div className="overflow-hidden rounded-[18px] border border-[--line] bg-[--surface]">
          {(await prisma.fakbarItem.findMany({ orderBy: [{ category: 'asc' }, { name: 'asc' }] })).map((item, idx, arr) => (
            <div
              key={item.id}
              className={`flex items-center justify-between px-5 py-3.5 ${idx < arr.length - 1 ? 'border-b border-[--line]' : ''}`}
            >
              <div>
                <span className="font-medium text-[--ink]">{item.name}</span>
                <span className="ml-2 text-xs text-[--muted]">{item.category}</span>
              </div>
              <span className="tabular-nums text-sm font-semibold text-[--ink]">
                €{(item.salesPrice / 100).toFixed(2)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
