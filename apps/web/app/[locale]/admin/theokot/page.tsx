import { prisma } from "@vtk/db";
import { notFound, redirect } from "next/navigation";
import { hasLocale } from "@/lib/locale";
import { requireSession } from "@/lib/session";
import type { Locale } from "@vtk/i18n";
import { getTheokotConfig } from "@/lib/theokot-server";
import { TheokotAdminNav } from "./TheokotAdminNav";
import { SessionsManager, type AdminItem, type AdminSession } from "./SessionsManager";

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

  // Toon sessies van gisteren tot in de toekomst.
  const from = new Date(new Date().getTime() - 86400000);
  const [sessions, config, products] = await Promise.all([
    prisma.theokotSession.findMany({
      where: { date: { gte: new Date(from.getFullYear(), from.getMonth(), from.getDate() - 1) } },
      orderBy: { date: "asc" },
      include: {
        items: { orderBy: { order: "asc" }, include: { _count: { select: { lines: true } } } },
        _count: { select: { orders: true } },
      },
    }),
    getTheokotConfig(),
    prisma.theokotProduct.findMany({ where: { active: true }, orderBy: { order: "asc" } }),
  ]);

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
    items: s.items.map((i) => ({
      id: i.id,
      nameNl: i.nameNl,
      nameEn: i.nameEn ?? "",
      priceEuro: (i.priceCents / 100).toFixed(2),
      quantity: i.quantity,
      isWeeklySpecial: i.isWeeklySpecial,
      hasLines: i._count.lines > 0,
    })),
  }));

  // Standaardaanbod (catalogus) + standaarduren als startpunt voor "week aanmaken".
  const defaultProducts: AdminItem[] = products.map((p) => ({
    id: "",
    nameNl: p.nameNl,
    nameEn: p.nameEn ?? "",
    priceEuro: (p.priceCents / 100).toFixed(2),
    quantity: p.defaultQuantity,
    isWeeklySpecial: p.isWeeklySpecialSlot,
    hasLines: false,
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
