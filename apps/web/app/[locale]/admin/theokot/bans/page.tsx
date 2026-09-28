import { prisma } from "@vtk/db";
import { notFound } from "next/navigation";
import { hasLocale } from "@/lib/locale";
import { requireSession } from "@/lib/session";
import type { Locale } from "@vtk/i18n";
import Link from "@/components/ui/Link";
import { formatEuro } from "@/lib/theokot";
import { getTheokotConfig } from "@/lib/theokot-server";
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
  const [bans, noShows, config] = await Promise.all([
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
    getTheokotConfig(),
  ]);

  const dateFmt = new Intl.DateTimeFormat(nl ? "nl-BE" : "en-GB", {
    timeZone: "Europe/Brussels",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  // Het datumveld toonde de UTC-dag terwijl het label ernaast in Brussel-tijd
  // staat; bij een ban die na middernacht Brussel eindigt, scheelde dat een dag.
  const dayValue = (date: Date) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Brussels",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);

  const banRows: BanRow[] = bans.map((b) => ({
    id: b.id,
    userName: b.user.name,
    rNumber: b.user.rNumber ?? "",
    reason: b.reason,
    note: b.note ?? "",
    startsLabel: dateFmt.format(b.startsAt),
    endsValue: dayValue(b.endsAt),
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
    paused: o.noShowWaivedAt !== null,
  }));

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold">Theokot · {nl ? "Bans & no-shows" : "Bans & no-shows"}</h1>
      <TheokotAdminNav base={base} nl={nl} active="bans" caps={caps} />
      {config.noShowPaused ? (
        <div className="vtk-basic-alert vtk-basic-alert-warning">
          <div className="vtk-basic-alert-text">
            {nl
              ? "De no-show-verwerking staat gepauzeerd: wie niet ophaalt, krijgt geen mail en telt niet mee voor een ban. Lopende bans blijven gewoon lopen. "
              : "No-show processing is paused: people who don't pick up get no email and don't count towards a ban. Running bans stay in place. "}
            <Link href={`${base}/admin/theokot/instellingen`} className="font-semibold underline">
              {nl ? "Naar de instellingen" : "Go to settings"}
            </Link>
          </div>
        </div>
      ) : null}
      <BansClient nl={nl} bans={banRows} noShows={noShowRows} />
    </div>
  );
}
