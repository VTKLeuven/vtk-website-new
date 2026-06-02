import { prisma } from "@vtk/db";
import { hasLocale } from "@/lib/locale";
import { notFound } from "next/navigation";
import { getDictionary, type Locale } from "@vtk/i18n";
import { requireSession } from "@/lib/session";
import { hasPermission } from "@vtk/auth";
import { Card } from "@vtk/ui";
import { mergeTiles } from "@/lib/dashboard-tiles";
import { DashboardTiles } from "./DashboardTiles";

export default async function AdminDashboard({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const session = await requireSession();
  const dict = getDictionary(locale);
  const base = locale === "nl" ? "" : "/en";

  const groupIds = session.groups.map((g) => g.id);
  const userId = session.user.id;

  const [sharedRows, prefs, personalRows] = await Promise.all([
    prisma.dashboardTile.findMany({
      where: {
        OR: [{ scope: "GLOBAL" }, { scope: "GROUP", groupId: { in: groupIds } }],
      },
      include: { group: { select: { nameNl: true, nameEn: true } } },
      orderBy: { order: "asc" },
    }),
    prisma.userDashboardTilePref.findMany({ where: { userId } }),
    prisma.dashboardTile.findMany({
      where: { scope: "USER", userId },
      orderBy: { order: "asc" },
    }),
  ]);

  const tiles = mergeTiles(
    sharedRows.map((t) => ({
      id: t.id,
      label: t.label,
      url: t.url,
      icon: t.icon,
      color: t.color,
      order: t.order,
      scope: t.scope,
      groupId: t.groupId,
      groupLabel: t.group ? (locale === "nl" ? t.group.nameNl : t.group.nameEn) : undefined,
    })),
    prefs.map((p) => ({
      tileId: p.tileId,
      hidden: p.hidden,
      order: p.order,
      label: p.label,
      url: p.url,
      icon: p.icon,
      color: p.color,
    })),
    personalRows.map((t) => ({
      id: t.id,
      label: t.label,
      url: t.url,
      icon: t.icon,
      color: t.color,
      order: t.order,
    }))
  );

  const canManage = hasPermission(session, "dashboard.manage");

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">{dict.admin.dashboard}</h1>
        <p className="text-sm text-zinc-500">
          {locale === "nl" ? "Welkom" : "Welcome"}, {session.user.name}.
        </p>
      </header>

      <DashboardTiles
        tiles={tiles}
        locale={locale}
        manageHref={canManage ? `${base}/admin/dashboard-tiles` : undefined}
      />

      <details className="vtk-tiles-meta">
        <summary>{locale === "nl" ? "Jouw rechten & groepen" : "Your permissions & groups"}</summary>
        <Card className="p-5 mt-3">
          <h2 className="font-semibold mb-2">{locale === "nl" ? "Jouw rechten" : "Your permissions"}</h2>
          {session.user.isSuperAdmin ? (
            <p className="text-sm">
              {locale === "nl" ? "Superadmin – alle rechten." : "Super admin – all permissions."}
            </p>
          ) : (
            <ul className="flex flex-wrap gap-2 text-xs">
              {session.permissions.length === 0 ? (
                <li className="text-zinc-500">—</li>
              ) : (
                session.permissions.map((p) => (
                  <li key={p} className="rounded bg-vtk-blue-soft px-2 py-1">
                    {p}
                  </li>
                ))
              )}
            </ul>
          )}
          <h2 className="font-semibold mb-2 mt-4">{locale === "nl" ? "Groepen" : "Groups"}</h2>
          <ul className="flex flex-wrap gap-2 text-xs">
            {session.groups.length === 0 ? (
              <li className="text-zinc-500">—</li>
            ) : (
              session.groups.map((g) => (
                <li key={g.id} className="rounded bg-vtk-blue/10 text-vtk-blue px-2 py-1">
                  {locale === "nl" ? g.nameNl : g.nameEn} · {g.role}
                </li>
              ))
            )}
          </ul>
        </Card>
      </details>
    </div>
  );
}
