import type { Metadata } from 'next';
import { prisma } from '@vtk/db';
import { MenuManager } from './menu-manager';
import { SeedMenuButton } from './seed-menu-button';
import { CATEGORY_ORDER, CATEGORY_LABELS } from '@/lib/fakbar-format';

export const metadata: Metadata = { title: 'Drankkaart' };

export default async function DrankkaartBeheerPage() {
  const items = await prisma.fakbarItem.findMany({
    orderBy: [{ name: 'asc' }],
    select: {
      id: true,
      name: true,
      category: true,
      salesPrice: true,
      _count: { select: { consumptions: true, stockCounts: true } },
    },
  });

  const groups = CATEGORY_ORDER.map((category) => ({
    key: category,
    label: CATEGORY_LABELS[category],
    items: items.filter((item) => item.category === category),
  }));

  return (
    <div className="space-y-7">
      <div className="fakbar-section-head">
        <h2>Drankkaart</h2>
        <p>
          Deze lijst is tegelijk de publieke drankkaart en de artikellijst van de tellingen. Een prijs die je hier
          wijzigt, staat meteen op de site en wordt gebruikt om de gemiste inkomsten van het tappersblad te rekenen.
        </p>
      </div>

      {items.length === 0 ? (
        <div className="fakbar-empty">
          <h3>Nog geen artikelen</h3>
          <p>
            Begin met de standaardkaart van &rsquo;t ElixIr en pas daarna aan wat er anders is, of voeg de artikelen
            één voor één toe.
          </p>
          <SeedMenuButton />
        </div>
      ) : null}

      <MenuManager groups={groups} />
    </div>
  );
}
