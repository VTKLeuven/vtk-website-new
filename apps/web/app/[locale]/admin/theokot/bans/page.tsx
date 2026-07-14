import { prisma } from "@vtk/db";
import { notFound } from "next/navigation";
import { hasLocale } from "@/lib/locale";
import { requireSession } from "@/lib/session";
import type { Locale } from "@vtk/i18n";
import { formatEuro } from "@/lib/theokot";
import { TheokotAdminNav } from "../TheokotAdminNav";
import { BansClient, type BanRow, type NoShowRow } from "./BansClient";

import "@/app/design/vtk-basic.css";

export default async function TheokotBansPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === "nl";
  const base = nl ? "" : "/en";
  const session = await requireSession(`${base}/inloggen?next=${base}/admin/theokot/bans`);
  const has = (p: string) => session.user.isSuperAdmin || session.permissions.includes(p);
  const caps = { manage: has("theokot.manage"), pickup: has("theokot.pickup") };
  if (!caps.manage) return <p className="text-sm text-zinc-500">{nl ? "Geen toegang." : "No access."}</p>;

  const now = new Date();
  const [bans, noShows] = await Promise.all([
    prisma.theokotBan.findMany({
      orderBy: [{ active: "desc" }, { endsAt: "desc" }],
      take: 200,
      include: { user: { select: { name: true, rNumber: true } } },
    }),
    prisma.theokotOrder.findMany({
      where: { status: "NO_SHOW" },
      orderBy: { updatedAt: "desc" },
      take: 200,
      include: {
        user: { select: { name: true, rNumber: true } },
        session: { select: { date: true } },
      },
    }),
  ]);

  const dateFmt = new Intl.DateTimeFormat(nl ? "nl-BE" : "en-GB", {
    timeZone: "Europe/Brussels",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  const banRows: BanRow[] = bans.map((b) => ({
    id: b.id,
    userName: b.user.name,
    rNumber: b.user.rNumber ?? "",
    reason: b.reason,
    note: b.note ?? "",
    startsLabel: dateFmt.format(b.startsAt),
    endsValue: b.endsAt.toISOString().slice(0, 10),
    endsLabel: dateFmt.format(b.endsAt),
    active: b.active && b.startsAt <= now && b.endsAt > now,
    stored: b.active,
  }));

  const noShowRows: NoShowRow[] = noShows.map((o) => ({
    orderId: o.id,
    userName: o.user.name,
    rNumber: o.user.rNumber ?? "",
    dateLabel: dateFmt.format(o.session.date),
    totalLabel: formatEuro(o.totalCents),
    note: o.statusNote ?? "",
  }));

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold">Theokot · {nl ? "Bans & no-shows" : "Bans & no-shows"}</h1>
      <TheokotAdminNav base={base} nl={nl} active="bans" caps={caps} />
      <BansClient nl={nl} bans={banRows} noShows={noShowRows} />
    </div>
  );
}
