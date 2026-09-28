import type { Metadata } from "next";
import { staticMetadata } from "@/lib/pageMetadata";
import { notFound } from "next/navigation";
import { hasLocale } from "@/lib/locale";
import { requireSession } from "@/lib/session";
import { pick, type Locale } from "@vtk/i18n";
import { PleaseLogin } from "@/components/site/pleaseLogin";
import { canCancel, canOrderNow } from "@/lib/theokot";
import { loadOrderableSessions, remainingFor } from "@/lib/theokot-orders";
import { publicUrl } from "@/lib/storage";
import { TheokotOrderClient, type OrderSession, type OrderMessage } from "./TheokotOrderClient";

import "@/app/design/vtk-basic.css";
import "@/app/design/vtk-theokot.css";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(locale)) return {};
  return staticMetadata("theokot", "/theokot", locale);
}

export default async function TheokotOrderPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === "nl";
  const base = nl ? "" : "/en";

  let session;
  try {
    session = await requireSession();
  } catch {
    return <PleaseLogin locale={locale} nextPath={`${base}/theokot`} className="vtk-page-shell" />;
  }

  const userId = session.user.id;
  const now = new Date();

  // Zelfde lezing als de VTK-app doet (`/api/app/v1/theokot`), zodat het aanbod,
  // de voorraad en de ban niet op twee plaatsen berekend worden.
  const { config, ban, sessions, used, message: msgValue } = await loadOrderableSessions(userId, now);

  const dayFmt = new Intl.DateTimeFormat(nl ? "nl-BE" : "en-GB", {
    timeZone: "Europe/Brussels",
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const timeFmt = new Intl.DateTimeFormat(nl ? "nl-BE" : "en-GB", {
    timeZone: "Europe/Brussels",
    hour: "2-digit",
    minute: "2-digit",
  });
  // De korte vormen voor de dagtabs en de dagkolom: "ma 28 sep", "zo 12:00".
  const part = (date: Date, options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(nl ? "nl-BE" : "en-GB", { timeZone: "Europe/Brussels", ...options })
      .format(date)
      .replace(/\./g, "");
  const shortMoment = (date: Date) => `${part(date, { weekday: "short" })} ${timeFmt.format(date)}`;

  const orderSessions: OrderSession[] = sessions.map((s) => {
    const existing = s.orders[0];
    return {
      id: s.id,
      dateLabel: dayFmt.format(s.date),
      weekdayLabel: part(s.date, { weekday: "long" }),
      shortLabel: part(s.date, { weekday: "short", day: "numeric", month: "short" }),
      dow: part(s.date, { weekday: "short" }),
      dayNumber: part(s.date, { day: "numeric" }),
      orderOpenShort: shortMoment(s.orderOpenAt),
      orderCloseShort: shortMoment(s.orderCloseAt),
      pickupLabel: `${timeFmt.format(s.pickupStart)} – ${timeFmt.format(s.pickupEnd)}`,
      orderOpenLabel: `${dayFmt.format(s.orderOpenAt)}, ${timeFmt.format(s.orderOpenAt)}`,
      orderCloseLabel: `${dayFmt.format(s.orderCloseAt)}, ${timeFmt.format(s.orderCloseAt)}`,
      orderWindowState:
        now < s.orderOpenAt ? "UPCOMING" : now >= s.orderCloseAt ? "CLOSED" : "OPEN",
      canOrder: canOrderNow(s, now),
      items: s.items.map((i) => ({
        id: i.id,
        name: pick(i.nameNl, i.nameEn, locale) ?? i.nameNl,
        priceCents: i.priceCents,
        remaining: remainingFor(i, used),
        isWeeklySpecial: i.isWeeklySpecial,
        imageUrl: publicUrl(i.imageKey),
        // Beide talen leeg = geen ingrediënten, dus ook geen info-icoontje.
        ingredients: pick(i.ingredientsNl, i.ingredientsEn, locale)?.trim() || null,
      })),
      existingOrder: existing
        ? {
            orderId: existing.id,
            status: existing.status,
            totalCents: existing.totalCents,
            canCancel: existing.status === "RESERVED" && canCancel(s, now),
            // Aanpassen volgt het bestelvenster, net als bestellen zelf.
            canEdit: existing.status === "RESERVED" && canOrderNow(s, now),
            lines: existing.lines.map((l) => ({
              sessionItemId: l.sessionItemId,
              name: pick(l.sessionItem.nameNl, l.sessionItem.nameEn, locale) ?? l.sessionItem.nameNl,
              quantity: l.quantity,
              unitPriceCents: l.unitPriceCents,
            })),
          }
        : null,
    };
  });

  const message: OrderMessage = {
    body: (pick(msgValue?.bodyNl ?? "", msgValue?.bodyEn ?? "", locale) ?? "").trim(),
  };

  return (
    <div className="vtk-page">
      <header className="vtk-page-head">
        <div>
          <h1 className="vtk-page-title">{nl ? "Broodjes reserveren" : "Reserve sandwiches"}</h1>
          {/* De zaal huren is iets anders dan een broodje bestellen, maar het is
              wel hetzelfde Theokot; wie hier belandt op zoek naar de zaal, moet
              niet terug naar het menu. */}
          <p className="vtk-page-subtitle">
            {nl
              ? "Reserveer vooraf, haal af aan de balie en betaal daar. Wil je de zaal zelf huren? "
              : "Reserve ahead, pick up at the counter and pay there. Looking to rent the room itself? "}
            <a className="vtk-link" href={`${base}/theokot/verhuur`}>
              {nl ? "Dien hier een verhuuraanvraag in" : "Submit a rental request here"}
            </a>
            .
          </p>
        </div>
      </header>

      <div className="vtk-page-shell">
        <TheokotOrderClient
          nl={nl}
          sessions={orderSessions}
          message={message}
          maxItems={config.maxItemsPerOrder}
          maxWeeklySpecial={config.maxWeeklySpecialPerOrder}
          layout={config.itemLayout}
          ban={
            ban
              ? {
                  until: new Intl.DateTimeFormat(nl ? "nl-BE" : "en-GB", {
                    timeZone: "Europe/Brussels",
                    dateStyle: "long",
                  }).format(ban.endsAt),
                }
              : null
          }
        />
      </div>
    </div>
  );
}
