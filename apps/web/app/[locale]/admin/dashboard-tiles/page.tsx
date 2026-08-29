import { prisma } from "@vtk/db";
import { notFound } from "next/navigation";
import { hasPermission } from "@vtk/auth";
import { hasLocale } from "@/lib/locale";
import { requireSession } from "@/lib/session";
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
  const session = await requireSession();
  const canManageGlobal = session.user.isSuperAdmin || hasPermission(session, "dashboard.manage");
  const canManageGroups = session.user.isSuperAdmin || hasPermission(session, "dashboard.manageOwn");
  const ownGroupIds = session.groups.map((group) => group.id);

  const [personalTilesRows, sharedTiles, groups] = await Promise.all([
    prisma.dashboardTile.findMany({
      where: { scope: "USER", userId: session.user.id },
      orderBy: { order: "asc" },
    }),
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

  const toSimple = (t: (typeof sharedTiles)[number]): SimpleTile => ({
    id: t.id,
    label: t.label,
    url: t.url,
    icon: t.icon,
    color: t.color,
    imageKey: t.imageKey,
    order: t.order,
  });

  const personalTiles = personalTilesRows.map(toSimple);
  const globalTiles = sharedTiles.filter((t) => t.scope === "GLOBAL").map(toSimple);
  const groupSections: GroupSection[] = groups.map((g) => ({
    id: g.id,
    name: locale === "nl" ? g.nameNl : g.nameEn,
    tiles: sharedTiles.filter((t) => t.scope === "GROUP" && t.groupId === g.id).map(toSimple),
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
        personalTiles={personalTiles}
        globalTiles={globalTiles}
        groups={groupSections}
      />
    </div>
  );
}
