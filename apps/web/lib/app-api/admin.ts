import "server-only";

import { prisma } from "@vtk/db";
import { hasPermission } from "@vtk/auth";
import type { Locale } from "@vtk/i18n";
import { isPocOnly } from "@/lib/pocPolls/access";
import { mergeTiles, tileColor, tileIconPath, tileImageUrl } from "@/lib/dashboard-tiles";
import { loadOwnBo } from "@/lib/bo/overview";
import { openResults } from "@/lib/bo/own";
import { brusselsYMD, ymdKey } from "@/lib/brussels";
import { visibleAdminNav } from "@/lib/admin-nav-visible";
import { adminNavIconMarkup } from "@/lib/admin-nav-icons";
import { isExternalUrl } from "@/lib/href";
import type { requireSession } from "@/lib/session";
import type { AppAdminBoDue, AppAdminDashboard, AppAdminSection, AppAdminTile } from "./contract";

type Session = Awaited<ReturnType<typeof requireSession>>;

/**
 * Het dashboard van /admin voor de app: dezelfde tegels, dezelfde deurknop,
 * hetzelfde blok "nog te brengen resultaten", en de zijbalk als lijst.
 *
 * De app toont dit native en opent elk onderdeel in een WebView zonder de kop
 * van de site (`html[data-vtk-app]`). Het beheer zelf (tabellen, formulieren,
 * bevestigingen) wordt niet nagebouwd: dat zijn tientallen schermen met hun
 * eigen regels, en ze op twee plaatsen hebben is ze twee keer kunnen breken.
 */
export async function adminDashboard(session: Session, locale: Locale, origin: string): Promise<AppAdminDashboard> {
  const nl = locale === "nl";
  const base = nl ? "" : "/en";
  const absolute = (href: string) => (isExternalUrl(href) ? href : `${origin}${href.startsWith("/") ? "" : "/"}${href}`);

  const nodes = await visibleAdminNav(session, locale);
  const sections: AppAdminSection[] = [];
  let loose: AppAdminSection | null = null;
  for (const node of nodes) {
    if (node.type === "group") {
      loose = null;
      const links = node.items.filter((item) => !item.hidden).map((item) => ({
        key: item.key,
        label: item.label,
        url: absolute(item.href),
        external: isExternalUrl(item.href),
        icon: adminNavIconMarkup(item.key),
      }));
      if (links.length > 0) {
        sections.push({ key: node.key, label: node.label, icon: adminNavIconMarkup(node.key), links });
      }
    } else if (!node.item.hidden) {
      // Losse items na elkaar komen samen in één blok zonder kop, zoals in de zijbalk.
      if (!loose) {
        loose = { key: `los-${sections.length}`, label: null, icon: null, links: [] };
        sections.push(loose);
      }
      loose.links.push({
        key: node.item.key,
        label: node.item.label,
        url: absolute(node.item.href),
        external: isExternalUrl(node.item.href),
        icon: adminNavIconMarkup(node.item.key),
      });
    }
  }

  // Een RiVer zonder post komt enkel voor de peilingen: geen dashboard, zoals op de site.
  if (await isPocOnly(session)) {
    return { adminUrl: `${origin}${base}/admin/peilingen`, canOpenDoor: false, tiles: [], boDue: [], sections };
  }

  const groupIds = session.groups.map((g) => g.id);
  const userId = session.user.id;
  const [sharedRows, prefs, personalRows, ownBo] = await Promise.all([
    prisma.dashboardTile.findMany({
      where: { OR: [{ scope: "GLOBAL" }, { scope: "GROUP", groupId: { in: groupIds } }] },
      include: { group: { select: { nameNl: true, nameEn: true } } },
      orderBy: { order: "asc" },
    }),
    prisma.userDashboardTilePref.findMany({ where: { userId } }),
    prisma.dashboardTile.findMany({ where: { scope: "USER", userId }, orderBy: { order: "asc" } }),
    loadOwnBo(session.groups, nl),
  ]);

  const merged = mergeTiles(
    sharedRows.map((t) => ({
      id: t.id,
      label: t.label,
      url: t.url,
      icon: t.icon,
      color: t.color,
      imageKey: t.imageKey,
      order: t.order,
      scope: t.scope,
      groupId: t.groupId,
      groupLabel: t.group ? (nl ? t.group.nameNl : t.group.nameEn) : undefined,
    })),
    prefs.map((p) => ({
      tileId: p.tileId,
      hidden: p.hidden,
      order: p.order,
      label: p.label,
      url: p.url,
      icon: p.icon,
      color: p.color,
      imageKey: p.imageKey,
      imageCleared: p.imageCleared,
    })),
    personalRows.map((t) => ({
      id: t.id,
      label: t.label,
      url: t.url,
      icon: t.icon,
      color: t.color,
      imageKey: t.imageKey,
      order: t.order,
    })),
  );

  const sectionKind = (tile: (typeof merged)[number]) =>
    tile.source === "personal" ? ("own" as const) : tile.source === "group" ? ("group" as const) : ("global" as const);
  const sectionHint = (kind: "global" | "group" | "own") =>
    kind === "global"
      ? nl ? "door beheerders ingesteld" : "set by admins"
      : kind === "own"
        ? nl ? "alleen jij ziet deze" : "only you see these"
        : nl ? "jouw post" : "your post";
  const hostOf = (url: string) => {
    try {
      return new URL(absolute(url)).host.replace(/^www\./, "");
    } catch {
      return "";
    }
  };

  const sectionLabel = (tile: (typeof merged)[number]) =>
    tile.source === "personal"
      ? nl ? "Van jou" : "Yours"
      : tile.source === "group"
        ? (tile.groupLabel ?? (nl ? "Je post" : "Your post"))
        : nl ? "Voor iedereen" : "For everyone";

  const tiles: AppAdminTile[] = merged
    .filter((tile) => !tile.hidden && tile.url)
    .map((tile) => {
      const color = tileColor(tile.color);
      return {
        id: tile.key,
        label: tile.label,
        url: absolute(tile.url),
        external: isExternalUrl(tile.url),
        iconPath: tileIconPath(tile.icon),
        chip: { background: color.chipBg, foreground: color.chipFg },
        imageUrl: tile.imageKey ? absolute(tileImageUrl(tile.imageKey)) : null,
        section: sectionLabel(tile),
        sectionKind: sectionKind(tile),
        sectionHint: sectionHint(sectionKind(tile)),
        host: hostOf(tile.url),
      };
    });

  const boDue: AppAdminBoDue[] = openResults(ownBo, ymdKey(brusselsYMD(new Date()))).flatMap((post) =>
    post.dossiers.map((d) => {
      const budget = d.budgets[0];
      const sheet = d.budgets.at(-1);
      const days = d.overdueDays ?? 0;
      const detail =
        d.date === null || !budget
          ? nl ? "budget schriftelijk goedgekeurd" : "budget approved in writing"
          : nl
            ? `budget op ${budget.meetingLabel} · ${days === 1 ? "1 dag" : `${days} dagen`} open`
            : `budget at ${budget.meetingLabel} · open ${days === 1 ? "1 day" : `${days} days`}`;
      return {
        post: post.name,
        activity: d.activity,
        detail,
        url: sheet?.webUrl ?? `${origin}${base}/admin/bestuursorgaan/mijn`,
      };
    }),
  );

  return {
    adminUrl: `${origin}${base}/admin`,
    tilesUrl: `${origin}${base}/admin/dashboard-tiles`,
    canOpenDoor: hasPermission(session, "door.remoteOpen"),
    tiles,
    boDue,
    sections,
  };
}

/**
 * Mag deze persoon in het beheer? Dezelfde regel als de link "Beheer" in het
 * profielmenu van de site (`Header.tsx`): een superadmin, of wie minstens één
 * recht heeft. De routes erachter controleren elk onderdeel nog zelf.
 */
export function canUseAdmin(session: Pick<Session, "user" | "permissions">): boolean {
  return session.user.isSuperAdmin || session.permissions.length > 0;
}
