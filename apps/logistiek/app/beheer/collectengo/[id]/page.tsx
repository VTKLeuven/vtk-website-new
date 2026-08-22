import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireManage } from '@/lib/session';
import { collectEnGoOrderForImport } from '@/lib/collectengo/server';
import { ImportOrderForm } from './import-form';

export default async function BeheerCollectEnGoOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireManage();
  const { id } = await params;
  const view = await collectEnGoOrderForImport(id);
  if (!view) notFound();

  return (
    <div className="grid gap-6">
      <Link href="/beheer/collectengo" className="text-sm text-vtk-muted underline-offset-2 hover:underline">
        ← Alle Collect&Go-bestellingen
      </Link>
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
