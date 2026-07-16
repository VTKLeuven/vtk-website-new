import { notFound } from "next/navigation";
import { getOrderForViewer } from "@/lib/ticketing/queries";
import { hasLocale } from "@/lib/locale";
import { OrderStatus } from "@/components/ticketing/public/OrderStatus";
import type { PublicOrder } from "@/components/ticketing/public/types";

import "@/app/design/vtk-tickets.css";

export default async function MyTicketOrderPage({
  params,
}: {
  params: Promise<{ locale: string; orderId: string }>;
}) {
  const { locale: localeParam, orderId } = await params;
  if (!hasLocale(localeParam)) notFound();
  const order = (await getOrderForViewer(orderId)) as PublicOrder | null;
  if (!order) notFound();

  return (
    <main className="vtk-page ticket-order-page">
      <OrderStatus initialOrder={order} locale={localeParam} />
    </main>
  );
}
