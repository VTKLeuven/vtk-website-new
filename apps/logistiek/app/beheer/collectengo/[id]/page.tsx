import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireManage } from '@/lib/session';
import { collectEnGoOrderForImport } from '@/lib/collectengo/server';
import { EventLink } from '@/components/event-link';
import { eventOptions } from '@/lib/uitleen';
import { selectableEvents } from '@/lib/uitleen-server';
import { ImportOrderForm } from './import-form';

export default async function BeheerCollectEnGoOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireManage();
  const { id } = await params;
  const [view, events] = await Promise.all([collectEnGoOrderForImport(id), selectableEvents()]);
  if (!view) notFound();

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/beheer/collectengo" className="text-sm text-vtk-muted underline-offset-2 hover:underline">
          ← Alle Collect&Go-bestellingen
        </Link>
        {/* Bij welk evenement de boodschappen horen (E5), zodat ze mee op de
            materiaallijst van dat evenement staan. */}
        <EventLink
          target={{ kind: 'collectengo', id: view.order.id }}
          events={eventOptions(events)}
          current={view.order.event}
        />
      </div>
      <ImportOrderForm
        order={{
          id: view.order.id,
          reservationNumber: view.order.reservationNumber,
          status: view.order.status,
          customerName: view.order.customerName,
          pickupPoint: view.order.pickupPoint,
          pickupFrom: view.order.pickupFrom,
          pickupUntil: view.order.pickupUntil,
          orderedAt: view.order.orderedAt,
          subtotalCents: view.order.subtotalCents,
          discountCents: view.order.discountCents,
          serviceCostCents: view.order.serviceCostCents,
          totalCents: view.order.totalCents,
          importedAt: view.order.importedAt,
          importedByName: view.order.importedBy?.name ?? null,
        }}
        lines={view.order.lines.map((line) => ({
          id: line.id,
          category: line.category,
          productName: line.productName,
          note: line.note,
          unit: line.unit,
          quantity: line.quantity,
          quantityText: line.quantityText,
          unitPriceCents: line.unitPriceCents,
          unitPriceBasis: line.unitPriceBasis,
          totalPriceCents: line.totalPriceCents,
          depositCents: line.depositCents,
          lineDiscountCents: line.lineDiscountCents,
          flesserkeItemId: line.flesserkeItemId,
          importedQuantity: line.importedQuantity,
        }))}
        items={view.items}
        categories={view.categories}
        suggestions={view.suggestions}
        siblings={view.siblings.map((sibling) => ({
          id: sibling.id,
          receivedAt: sibling.receivedAt,
          status: sibling.status,
        }))}
      />
    </div>
  );
}
