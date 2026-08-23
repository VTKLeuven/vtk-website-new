import { notFound } from "next/navigation";
import { prisma } from "@vtk/db";
import { currentWorkingYear } from "@vtk/auth";
import type { Locale } from "@vtk/i18n";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import { getGoogleStatus } from "@/lib/google/config";
import { desiredMembers, type MembershipRow } from "@/lib/google/members";
import { MailGroupsAdmin, type MailGroupRow, type PostOption } from "./MailGroupsAdmin";

/**
 * Groepsadressen: de eigen adressen van de kring in Google Workspace
 * (`activiteiten@vtk.be`), die de posten van dit werkingsjaar volgen.
 *
 * Bewust iets anders dan /admin/mailinglijsten: dat zijn de opt-in
 * nieuwsbrieven naar studenten. Zie docs/design-decisions.md.
 *
 * Het scherm berekent de leden zelf, los van wat er in Google staat. Zo zie je
 * meteen wie een regel oplevert, ook voor de eerste sync en ook wanneer de
 * koppeling nog niet ingesteld is.
 */
export default async function AdminMailGroups({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === "nl";
  await requirePermission("mailgroups.manage");

  const year = currentWorkingYear();
  const [mailGroups, groups, status, linkedCount, unlinkedInPosts] = await Promise.all([
    prisma.mailGroup.findMany({
      orderBy: { email: "asc" },
      select: {
        id: true,
        email: true,
        name: true,
        description: true,
        enabled: true,
        allowExternalSenders: true,
        googleId: true,
        lastSyncAt: true,
        lastError: true,
        sources: {
          select: {
            id: true,
            groupId: true,
            onlyLead: true,
            group: { select: { nameNl: true, nameEn: true } },
          },
        },
        extras: {
          select: { id: true, email: true, kind: true, note: true },
          orderBy: { email: "asc" },
        },
      },
    }),
    prisma.group.findMany({
      where: { active: true },
      select: { id: true, nameNl: true, nameEn: true, type: true },
      orderBy: { nameNl: "asc" },
    }),
    getGoogleStatus(),
    prisma.user.count({ where: { googleEmail: { not: null }, deletedAt: null } }),
    // Leden die dit jaar in een post of werkgroep zitten en nog geen gekoppeld
    // @vtk.be-adres hebben. Dat getal is de reden dat een lijst korter is dan
    // verwacht, dus het hoort bovenaan te staan en niet weggestopt te zijn.
    prisma.user.count({
      where: {
        googleEmail: null,
        active: true,
        deletedAt: null,
        memberships: { some: { year } },
      },
    }),
  ]);

  // De lidmaatschappen van alle bronposten in één query, en daarna dezelfde
  // berekening als de sync gebruikt. Zo kan het scherm niet uit elkaar lopen met
  // wat er straks in Google terechtkomt.
  const sourceGroupIds = [
    ...new Set(mailGroups.flatMap((g) => g.sources.map((s) => s.groupId))),
  ];
  const memberships: MembershipRow[] = sourceGroupIds.length
    ? (
        await prisma.groupMembership.findMany({
          where: {
            year,
            groupId: { in: sourceGroupIds },
            user: { active: true, deletedAt: null },
          },
          select: {
            groupId: true,
            role: true,
            user: { select: { id: true, name: true, googleEmail: true } },
          },
        })
      ).map((m) => ({ groupId: m.groupId, role: m.role, user: m.user }))
    : [];

  const dateFmt = new Intl.DateTimeFormat(nl ? "nl-BE" : "en-GB", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  const rows: MailGroupRow[] = mailGroups.map((g) => {
    const computed = desiredMembers({
      sources: g.sources.map((s) => ({ groupId: s.groupId, onlyLead: s.onlyLead })),
      memberships,
      extras: g.extras.map((e) => ({ email: e.email, kind: e.kind })),
    });
    return {
      id: g.id,
      email: g.email,
      name: g.name,
      description: g.description,
      enabled: g.enabled,
      allowExternalSenders: g.allowExternalSenders,
      existsInGoogle: Boolean(g.googleId),
      lastSyncLabel: g.lastSyncAt ? dateFmt.format(g.lastSyncAt) : null,
      lastError: g.lastError,
      sources: g.sources.map((s) => ({
        id: s.id,
        groupId: s.groupId,
        onlyLead: s.onlyLead,
        name: nl ? s.group.nameNl : s.group.nameEn,
      })),
      extras: g.extras.map((e) => ({
        id: e.id,
        email: e.email,
        kind: e.kind,
        note: e.note,
      })),
      memberCount: computed.emails.length,
      unlinked: computed.unlinked.map((u) => u.name),
    };
  });

  const postOptions: PostOption[] = groups.map((g) => ({
    id: g.id,
    name: nl ? g.nameNl : g.nameEn,
    werkgroep: g.type === "WERKGROEP",
  }));

  return (
    <MailGroupsAdmin
      nl={nl}
      rows={rows}
      posts={postOptions}
      configured={status.configured}
      domain={status.domain}
      linkedCount={linkedCount}
      unlinkedInPosts={unlinkedInPosts}
      koppelingenHref={`${nl ? "" : "/en"}/admin/groepsadressen/koppelingen`}
    />
  );
}
