import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@vtk/db';
import { ElixirIcon } from '@/components/elixir-icon';
import { EveningForm } from './evening-form';
import { EveningRentalForm } from './rental-form';
import { SpecialsForm, type SpecialRow } from './specials-form';
import { CATEGORY_ORDER, formatDate } from '@/lib/fakbar-format';
import { listTappers } from '@/lib/tappers';

export const metadata: Metadata = { title: 'Avondtelling' };

/**
 * Het scherm dat er nooit was.
 *
 * Zowel het dashboard als de avondtellingslijst linkten naar
 * /admin/avondtelling/<id>, maar die route bestond niet: elke klik gaf een 404.
 * De enige plek waar je een telling kon intikken was /admin/dag/<dag>, en dat
 * scherm had geen enkel formulier dat opsloeg; de invoervelden stonden er los,
 * en de knop "Telling Opslaan" had geen action.
 */
export default async function AvondtellingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const evening = await prisma.fakbarEvening.findUnique({
    where: { id },
    include: {
      week: { select: { id: true, weekNumber: true, year: true, status: true } },
      hoofdtapper: { select: { id: true, name: true } },
      cashCount: true,
      rental: true,
      consumption: { select: { itemId: true, category: true, quantity: true } },
      specials: { orderBy: { sortOrder: 'asc' } },
    },
  });

  if (!evening) notFound();

  const [items, tappers] = await Promise.all([
    prisma.fakbarItem.findMany({ orderBy: [{ name: 'asc' }] }),
    listTappers(evening.hoofdtapper),
  ]);

  const orderedItems = CATEGORY_ORDER.flatMap((category) => items.filter((item) => item.category === category));

  // Enkel de tellingen naar de client, niet de hele rij: `updatedAt` is een
  // Date en een client component heeft niets aan een tijdstip dat ze niet toont.
  const cashCount = evening.cashCount
    ? Object.fromEntries(
        Object.entries(evening.cashCount).filter(([, value]) => typeof value === 'number'),
      ) as Record<string, number>
    : null;

  const specials: SpecialRow[] = evening.specials.map((special) => ({
    kind: special.kind,
    title: special.title,
    note: special.note ?? '',
    itemId: special.itemId ?? '',
    price: special.price === null ? '' : (special.price / 100).toFixed(2),
  }));

  return (
    <div className="space-y-8">
      <div>
        <Link href="/admin/avondtelling" className="fakbar-breadcrumb !text-[var(--muted)]">
          <ElixirIcon name="chevron" className="h-3.5 w-3.5 rotate-90" />
          Avondtelling
        </Link>
        <div className="fakbar-section-head mt-1">
          <h2>
            {evening.dayOfWeek} {formatDate(evening.date)}
          </h2>
          <p>
            Week {evening.week.weekNumber} van {evening.week.year}
            {evening.week.status === 'CLOSED'
              ? '. Deze week is afgesloten; heropen ze in het weekoverzicht om nog iets te wijzigen.'
              : '.'}
          </p>
        </div>
      </div>

      <EveningForm
        eveningId={evening.id}
        readOnly={evening.week.status === 'CLOSED'}
        tappers={tappers}
        hoofdtapperId={evening.hoofdtapperId}
        specialeActiviteit={evening.specialeActiviteit}
        bancontactRevenue={evening.bancontactRevenue}
        cashToSafe={evening.cashToSafe}
        cashCount={cashCount}
        items={orderedItems.map((item) => ({
          id: item.id,
          name: item.name,
          category: item.category,
          salesPrice: item.salesPrice,
        }))}
        consumption={evening.consumption}
      />

      {/* Het anker waar /admin/specials naartoe linkt. */}
      <div id="specials" className="scroll-mt-24" />

      <SpecialsForm
        eveningId={evening.id}
        readOnly={evening.week.status === 'CLOSED'}
        items={orderedItems.map((item) => ({ id: item.id, name: item.name, salesPrice: item.salesPrice }))}
        initial={specials}
      />

      <EveningRentalForm eveningId={evening.id} rental={evening.rental} />
    </div>
  );
}
