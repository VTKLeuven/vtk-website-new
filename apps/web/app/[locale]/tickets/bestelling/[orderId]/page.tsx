import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getOrderForViewer } from "@/lib/ticketing/queries";
import { hasLocale } from "@/lib/locale";
import { staticMetadata } from "@/lib/pageMetadata";
import { OrderStatus } from "@/components/ticketing/public/OrderStatus";
import type { PublicOrder } from "@/components/ticketing/public/types";

import "@/app/design/vtk-tickets.css";

type Params = Promise<{ locale: string; orderId: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale, orderId } = await params;
  if (!hasLocale(locale)) return {};
  // Een bestelling is van één persoon: nooit indexeren, en de titel zegt bewust
  // niets over het event of de koper.
  return staticMetadata("ticketOrder", `/tickets/bestelling/${orderId}`, locale, {
    noIndex: true,
  });
}

export default async function TicketOrderPage({ params }: { params: Params }) {
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
