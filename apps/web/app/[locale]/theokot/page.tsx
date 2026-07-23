import { prisma } from "@vtk/db";
import { notFound } from "next/navigation";
import { hasLocale } from "@/lib/locale";
import { requireSession } from "@/lib/session";
import { pick, type Locale } from "@vtk/i18n";
import { PleaseLogin } from "@/components/site/pleaseLogin";
import { canCancel, canOrderNow } from "@/lib/theokot";
import { activeBanFor, getTheokotConfig } from "@/lib/theokot-server";
import { TheokotOrderClient, type OrderSession, type OrderMessage } from "./TheokotOrderClient";

import "@/app/design/vtk-basic.css";

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
  const config = await getTheokotConfig();

  const [ban, sessions, messageRow] = await Promise.all([
    activeBanFor(userId, now),
    prisma.theokotSession.findMany({
      where: { isOpen: true, pickupEnd: { gte: now } },
      orderBy: { date: "asc" },
      include: {
        items: { orderBy: { order: "asc" } },
        orders: {
          where: { userId },
          include: { lines: { include: { sessionItem: { select: { nameNl: true, nameEn: true } } } } },
        },
      },
    }),
    prisma.setting.findUnique({ where: { key: "theokot.orderMessage" } }),
  ]);

  // Reeds bestelde aantallen per sessie-item, om resterende voorraad te tonen.
  const allItemIds = sessions.flatMap((s) => s.items.map((i) => i.id));
  const used =
    allItemIds.length > 0
      ? await prisma.theokotOrderLine.groupBy({
          by: ["sessionItemId"],
          where: { sessionItemId: { in: allItemIds } },
          _sum: { quantity: true },
        })
      : [];
  const usedMap = new Map(used.map((u) => [u.sessionItemId, u._sum.quantity ?? 0]));

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

  const orderSessions: OrderSession[] = sessions.map((s) => {
    const existing = s.orders[0];
    // "Broodje van de week" = het aanbod-item dat als weekly special gemarkeerd is;
    // de naam ervan is wat het die week concreet is (ingesteld bij "Aanbod bewerken").
    const special = s.items.find((i) => i.isWeeklySpecial);
    return {
      id: s.id,
      dateLabel: dayFmt.format(s.date),
      pickupLabel: `${timeFmt.format(s.pickupStart)} – ${timeFmt.format(s.pickupEnd)}`,
      orderOpenLabel: `${dayFmt.format(s.orderOpenAt)}, ${timeFmt.format(s.orderOpenAt)}`,
      orderCloseLabel: `${dayFmt.format(s.orderCloseAt)}, ${timeFmt.format(s.orderCloseAt)}`,
      orderWindowState:
        now < s.orderOpenAt ? "UPCOMING" : now >= s.orderCloseAt ? "CLOSED" : "OPEN",
      weeklySpecialLabel: special ? (pick(special.nameNl, special.nameEn, locale) ?? special.nameNl) : null,
      canOrder: canOrderNow(s, now),
      items: s.items.map((i) => ({
        id: i.id,
        name: pick(i.nameNl, i.nameEn, locale) ?? i.nameNl,
        priceCents: i.priceCents,
        remaining: Math.max(0, i.quantity - (usedMap.get(i.id) ?? 0)),
        isWeeklySpecial: i.isWeeklySpecial,
      })),
      existingOrder: existing
        ? {
            orderId: existing.id,
            status: existing.status,
            totalCents: existing.totalCents,
            canCancel: existing.status === "RESERVED" && canCancel(s, now),
            lines: existing.lines.map((l) => ({
              name: pick(l.sessionItem.nameNl, l.sessionItem.nameEn, locale) ?? l.sessionItem.nameNl,
              quantity: l.quantity,
              unitPriceCents: l.unitPriceCents,
            })),
          }
        : null,
    };
  });

  const msgValue = messageRow?.value as { bodyNl?: string; bodyEn?: string } | undefined;
  const message: OrderMessage = {
    body: (pick(msgValue?.bodyNl ?? "", msgValue?.bodyEn ?? "", locale) ?? "").trim(),
  };

  return (
    <div className="vtk-page">
      <header className="vtk-page-head">
        <div>
          <div className="vtk-page-kicker">VTK · Theokot</div>
          <h1 className="vtk-page-title">{nl ? "Broodjes reserveren" : "Reserve sandwiches"}</h1>
        </div>
      </header>

      <div className="vtk-page-shell">
        <TheokotOrderClient
          nl={nl}
          sessions={orderSessions}
          message={message}
          maxItems={config.maxItemsPerOrder}
          maxWeeklySpecial={config.maxWeeklySpecialPerOrder}
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
