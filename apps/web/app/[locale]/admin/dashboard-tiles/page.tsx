import { prisma } from "@vtk/db";
import { notFound } from "next/navigation";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import type { Locale } from "@vtk/i18n";
import { DefaultTilesManager, type GroupSection, type SimpleTile } from "./DefaultTilesManager";

export default async function AdminDashboardTiles({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  await requirePermission("dashboard.manage");

  const [tiles, groups] = await Promise.all([
    prisma.dashboardTile.findMany({
      where: { scope: { in: ["GLOBAL", "GROUP"] } },
      orderBy: { order: "asc" },
    }),
    prisma.group.findMany({ orderBy: { orderInPraesidium: "asc" } }),
  ]);

  const toSimple = (t: (typeof tiles)[number]): SimpleTile => ({
    id: t.id,
    label: t.label,
    url: t.url,
    icon: t.icon,
    color: t.color,
    order: t.order,
  });

  const globalTiles = tiles.filter((t) => t.scope === "GLOBAL").map(toSimple);
  const groupSections: GroupSection[] = groups.map((g) => ({
    id: g.id,
    name: locale === "nl" ? g.nameNl : g.nameEn,
    tiles: tiles.filter((t) => t.scope === "GROUP" && t.groupId === g.id).map(toSimple),
  }));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">
        {locale === "nl" ? "Dashboardtegels" : "Dashboard tiles"}
      </h1>
      <DefaultTilesManager locale={locale} globalTiles={globalTiles} groups={groupSections} />
    </div>
  );
}
