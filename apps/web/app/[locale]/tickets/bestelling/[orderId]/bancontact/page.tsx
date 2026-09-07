import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getOrderForViewer } from "@/lib/ticketing/queries";
import { liveBancontactPayment } from "@/lib/ticketing/bancontactPayment";
import { hasLocale } from "@/lib/locale";
import { staticMetadata } from "@/lib/pageMetadata";
import { BancontactPayment } from "@/components/ticketing/public/BancontactPayment";
import { formatTicketPrice, type PublicOrder } from "@/components/ticketing/public/types";

import "@/app/design/vtk-tickets.css";

type Params = Promise<{ locale: string; orderId: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale, orderId } = await params;
  if (!hasLocale(locale)) return {};
  return staticMetadata("ticketOrder", `/tickets/bestelling/${orderId}/bancontact`, locale, {
    noIndex: true,
  });
}

export default async function BancontactPaymentPage({ params }: { params: Params }) {
  const { locale: localeParam, orderId } = await params;
  if (!hasLocale(localeParam)) notFound();

  const order = (await getOrderForViewer(orderId)) as PublicOrder | null;
  if (!order) notFound();

  const base = localeParam === "nl" ? "" : "/en";
  // Zonder lopende betaling valt er hier niets te tonen: de bestelpagina zelf
  // toont dan de tickets, de reden waarom er geen zijn, of de keuze opnieuw.
  const payment = order.status === "PENDING_PAYMENT" ? await liveBancontactPayment(orderId) : null;
  if (!payment?.providerDeeplink) redirect(`${base}/tickets/bestelling/${orderId}`);

  return (
    <main className="vtk-page ticket-order-page">
      <BancontactPayment
        orderId={orderId}
        locale={localeParam}
        deeplink={payment.providerDeeplink}
        orderNumber={order.orderNumber}
        amountLabel={formatTicketPrice(order.totalCents, order.currency, localeParam)}
      />
    </main>
  );
}
