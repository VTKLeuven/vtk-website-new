import { prisma } from "@vtk/db";
import { notFound, redirect } from "next/navigation";
import { hasLocale } from "@/lib/locale";
import { requireSession } from "@/lib/session";
import type { Locale } from "@vtk/i18n";
import { formatEuro } from "@/lib/theokot";
import { getTheokotConfig } from "@/lib/theokot-server";
import { usageForSessionItems } from "@/lib/meetings-server";
import { brusselsWallClock, brusselsYMD, shiftYMD } from "@/lib/brussels";
import { TheokotAdminNav } from "./TheokotAdminNav";
import { SessionsManager, type AdminSession } from "./SessionsManager";
import type { OfferingRow } from "./OfferingRows";

import "@/app/design/vtk-basic.css";

/** Formatteert een Date naar Brussel-tijd volgens de opgegeven Intl-opties. */
function brussels(date: Date, opts: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Brussels", ...opts }).format(date);
}
/** "HH:mm" in Brussel-tijd. */
function hhmm(date: Date): string {
  return brussels(date, { hour: "2-digit", minute: "2-digit", hour12: false });
}
/** "YYYY-MM-DD" in Brussel-tijd (voor date-inputs). */
function ymd(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}
/** "YYYY-MM-DDTHH:mm" in Brussel-tijd (voor datetime-local inputs). */
function ymdhm(date: Date): string {
  return `${ymd(date)}T${hhmm(date)}`;
}

export default async function AdminTheokot({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === "nl";
  const base = nl ? "" : "/en";
  const session = await requireSession(`${base}/inloggen?next=${base}/admin/theokot`);
  const has = (p: string) => session.user.isSuperAdmin || session.permissions.includes(p);
  const caps = { manage: has("theokot.manage"), pickup: has("theokot.pickup") };

  if (!caps.manage && !caps.pickup) {
    return <p className="text-sm text-zinc-500">{nl ? "Geen toegang." : "No access."}</p>;
  }
  // Wie enkel de balie mag bedienen start op de afhaalpagina.
  if (!caps.manage) redirect(`${base}/admin/theokot/afhalen`);

  // Toon sessies van gisteren tot in de toekomst. In Brussel-tijd en niet in de
  // tijdzone van de container, en één dag terug in plaats van twee (de oude
  // berekening trok er na het aftrekken van een etmaal nog een dag af).
  const yesterday = shiftYMD(brusselsYMD(new Date()), -1);
  const from = brusselsWallClock(yesterday.year, yesterday.month, yesterday.day, "00:00");
  const [sessions, config, products] = await Promise.all([
    prisma.theokotSession.findMany({
      where: { date: { gte: from } },
      orderBy: { date: "asc" },
      include: {
        items: { orderBy: { order: "asc" }, include: { _count: { select: { lines: true } } } },
        orders: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            status: true,
            totalCents: true,
            createdAt: true,
            user: { select: { name: true, rNumber: true } },
            lines: {
              orderBy: { sessionItem: { order: "asc" } },
              select: { quantity: true, sessionItem: { select: { nameNl: true, nameEn: true } } },
            },
            voucherRedemption: { select: { id: true } },
          },
        },
        _count: { select: { orders: true } },
      },
    }),
    getTheokotConfig(),
    prisma.theokotProduct.findMany({ where: { active: true }, orderBy: { order: "asc" } }),
  ]);

  // Hoeveel er van elk broodje al weg is. De aanbod-editor heeft dat nodig om
  // vooraf te kunnen zeggen hoeveel bestellingen sneuvelen wanneer iemand het
  // aantal verlaagt; de vergaderingen tellen mee, want ze komen uit dezelfde
  // voorraad.
  const itemIds = sessions.flatMap((s) => s.items.map((i) => i.id));
  const ordered = await usageForSessionItems(itemIds);

  const dayFmt = (d: Date) => brussels(d, { weekday: "long", day: "numeric", month: "long" });

  const adminSessions: AdminSession[] = sessions.map((s) => ({
    id: s.id,
    dateLabel: dayFmt(s.date),
    dateValue: ymd(s.date),
    isOpen: s.isOpen,
    pickupStart: hhmm(s.pickupStart),
    pickupEnd: hhmm(s.pickupEnd),
    orderCloseTime: hhmm(s.orderCloseAt),
    orderOpenAt: ymdhm(s.orderOpenAt),
    processed: s.processedAt !== null,
    orderCount: s._count.orders,
    // Wat de dag onverwijderbaar maakt: opgehaalde bestellingen en bestellingen
    // waarop al bonnetjes afgeboekt zijn. Allebei zijn ze echt gebeurd.
    pickedUpCount: s.orders.filter(
      (o) => o.status === "PICKED_UP" || o.voucherRedemption !== null,
    ).length,
    closed: s.pickupEnd <= new Date(),
    orders: s.orders.map((o) => ({
      id: o.id,
      userName: o.user.name,
      rNumber: o.user.rNumber ?? "",
      status: o.status,
      totalLabel: formatEuro(o.totalCents),
      itemsLabel: o.lines
        .map((l) => `${l.quantity}\u00d7 ${nl ? l.sessionItem.nameNl : l.sessionItem.nameEn ?? l.sessionItem.nameNl}`)
        .join(", "),
      // Opgehaald of met bonnetjes betaald: dat is echt gebeurd en gaat er niet
      // meer af.
      canRemove: o.status !== "PICKED_UP" && o.voucherRedemption === null,
    })),
    items: s.items.map((i) => ({
      id: i.id,
      nameNl: i.nameNl,
      nameEn: i.nameEn ?? "",
      priceEuro: (i.priceCents / 100).toFixed(2),
      quantity: i.quantity,
      isWeeklySpecial: i.isWeeklySpecial,
      imageKey: i.imageKey,
      ingredientsNl: i.ingredientsNl ?? "",
      ingredientsEn: i.ingredientsEn ?? "",
      hasLines: i._count.lines > 0,
      ordered: ordered.get(i.id) ?? 0,
    })),
  }));

  // Standaardaanbod (catalogus) + standaarduren als startpunt voor "week aanmaken".
  const defaultProducts: OfferingRow[] = products.map((p) => ({
    id: "",
    nameNl: p.nameNl,
    nameEn: p.nameEn ?? "",
    priceEuro: (p.priceCents / 100).toFixed(2),
    quantity: p.defaultQuantity,
    isWeeklySpecial: p.isWeeklySpecialSlot,
    imageKey: p.imageKey,
    ingredientsNl: p.ingredientsNl ?? "",
    ingredientsEn: p.ingredientsEn ?? "",
    hasLines: false,
    ordered: 0,
  }));
  const defaultHours = {
    pickupStart: config.pickupDefaultStart,
    pickupEnd: config.pickupDefaultEnd,
    orderCloseTime: config.cancelDeadline,
    orderOpenTime: config.orderOpenTime,
  };

  // Eerstvolgende maandag (Brussel) als default voor "week aanmaken".
  const todayYmd = ymd(new Date()).split("-").map(Number);
  const todayNoonUtc = Date.UTC(todayYmd[0], todayYmd[1] - 1, todayYmd[2], 12);
  const dow = new Date(todayNoonUtc).getUTCDay(); // 0=zo..6=za
  const daysToMonday = ((8 - dow) % 7) || 7;
  const nextMonday = ymd(new Date(todayNoonUtc + daysToMonday * 86400000));

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold">Theokot</h1>
      <TheokotAdminNav base={base} nl={nl} active="sessies" caps={caps} />
      <SessionsManager
        nl={nl}
        sessions={adminSessions}
        nextMonday={nextMonday}
        defaultProducts={defaultProducts}
        defaultHours={defaultHours}
      />
    </div>
  );
}
