import { prisma } from "@vtk/db";
import { notFound } from "next/navigation";
import { hasPermission } from "@vtk/auth";
import { hasLocale } from "@/lib/locale";
import { requireAnyPermission } from "@/lib/session";
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
  const session = await requireAnyPermission(["dashboard.manage", "dashboard.manageOwn"]);
  const canManageGlobal = hasPermission(session, "dashboard.manage");
  const canManageGroups = hasPermission(session, "dashboard.manageOwn");
  const ownGroupIds = session.groups.map((group) => group.id);

  const [tiles, groups] = await Promise.all([
    prisma.dashboardTile.findMany({
      where: {
        OR: [
          ...(canManageGlobal ? [{ scope: "GLOBAL" as const }] : []),
          ...(canManageGroups
            ? [
                {
                  scope: "GROUP" as const,
                  ...(session.user.isSuperAdmin ? {} : { groupId: { in: ownGroupIds } }),
                },
              ]
            : []),
        ],
      },
      orderBy: { order: "asc" },
    }),
    canManageGroups
      ? prisma.group.findMany({
          where: session.user.isSuperAdmin ? undefined : { id: { in: ownGroupIds } },
          orderBy: { orderInPraesidium: "asc" },
        })
      : Promise.resolve([]),
  ]);

  const toSimple = (t: (typeof tiles)[number]): SimpleTile => ({
    id: t.id,
    label: t.label,
    url: t.url,
    icon: t.icon,
    color: t.color,
    imageKey: t.imageKey,
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
      <DefaultTilesManager
        locale={locale}
        canManageGlobal={canManageGlobal}
        canManageGroups={canManageGroups}
        globalTiles={globalTiles}
        groups={groupSections}
      />
    </div>
  );
}
