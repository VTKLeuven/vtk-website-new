import Link from "@/components/ui/Link";
import { prisma } from "@vtk/db";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/session";
import { hasPermission } from "@vtk/auth";
import type { Locale } from "@vtk/i18n";
import { publicUrl } from "@/lib/storage";
import { currentWorkingYear, formatWorkingYear, parseWorkingYear, workingYearTabs } from "@/lib/workingYear";
import { werkgroepenWithInfoRights, werkgroepenWithOwnMemberRights } from "@/lib/werkgroepMembers";
import { WERKING_KINDS, type WerkingKind } from "@/lib/groupKinds";
import { werkgroepErrorMessages } from "./messages";
import { WerkingenTable, type WerkingRow, type RoleOption } from "./WerkingenTable";
import { sortRolesByName } from "@/lib/roleOrder";

/**
 * Het beheerscherm van de werkgroepen (/admin/werkgroepen) en van de
 * jaarwerkingen (/admin/jaarwerkingen). Eén scherm, want de twee werken
 * hetzelfde: leden per werkingsjaar en rollen die de groep toekent. Wat
 * verschilt, staat in `lib/groupKinds.ts`.
 *
 * Toegang:
 * - wie het beheerrecht heeft (`werkgroepen.manage`, `jaarwerkingen.manage`) of
 *   superadmin is, ziet elke groep van dit soort en beheert leden, rollen en
 *   instellingen;
 * - de verantwoordelijke met het recht op de eigen leden
 *   (`*.manageOwnMembers`) beheert daarbovenop de gewone leden van dit
 *   werkingsjaar, enkel van de eigen groep;
 * - wie `werkgroepen.editOwnInfo` via zijn werkgroep krijgt (in productie de
 *   G3/G4), past de infotekst en website van die werkgroep aan. Een
 *   jaarwerking heeft die velden niet.
 *
 * Een gewoon lid zonder een van die rechten heeft hier niets te doen en ziet
 * het scherm niet: de tekst op /werkgroepen stond vroeger open voor elk lid.
 */
export async function WerkingenAdmin({ kind, locale, jaar }: { kind: WerkingKind; locale: Locale; jaar?: string }) {
  const nl = locale === "nl";
  const base = nl ? "" : "/en";
  const config = WERKING_KINDS[kind];

  const session = await requireSession();
  const canManage = hasPermission(session, config.managePermission);

  const year = parseWorkingYear(jaar);
  const isCurrentYear = year === currentWorkingYear();
  const ownMemberGroupIds = canManage ? new Set<string>() : await werkgroepenWithOwnMemberRights(session, kind);
  const infoGroupIds =
    canManage || !config.publicPath ? new Set<string>() : await werkgroepenWithInfoRights(session);

  const [groups, roles, distinctYears] = await Promise.all([
    prisma.group.findMany({
      where: { type: kind },
      orderBy: [{ active: "desc" }, { orderInPraesidium: "asc" }],
      include: {
        roleGrants: { include: { role: { select: { code: true, nameNl: true, nameEn: true } } } },
        memberships: { where: { year }, include: { user: true } },
      },
    }),
    prisma.role.findMany({
      select: { id: true, code: true, nameNl: true, nameEn: true },
    }),
    prisma.groupMembership.findMany({
      where: { group: { type: kind } },
      distinct: ["year"],
      select: { year: true },
    }),
  ]);

  // Zonder beheerrecht enkel de groepen waarvan je de infotekst of de gewone
  // leden beheert; een gewoon lid ziet niets.
  const visible = canManage
    ? groups
    : groups.filter((g) => ownMemberGroupIds.has(g.id) || infoGroupIds.has(g.id));
  if (!canManage && visible.length === 0) notFound();

  const tabs = workingYearTabs(distinctYears.map((r) => r.year));
  const allRoles: RoleOption[] = sortRolesByName(roles, locale).map((r) => ({ roleId: r.id, code: r.code, name: nl ? r.nameNl : r.nameEn }));

  const rows: WerkingRow[] = visible.map((group) => {
    const members = [...group.memberships]
      .sort((a, b) => {
        if (a.role !== b.role) return a.role === "LEAD" ? -1 : 1;
        return a.user.name.localeCompare(b.user.name, locale);
      })
      .map((m) => ({
        membershipId: m.id,
        userId: m.userId,
        name: m.user.name,
        email: m.user.email,
        avatarUrl: publicUrl(m.user.avatarKey),
        role: m.role as "MEMBER" | "LEAD",
        title: nl ? m.titleNl ?? null : m.titleEn ?? m.titleNl ?? null,
      }));

    const roleGrants = group.roleGrants.map((g) => ({
      roleId: g.roleId,
      code: g.role.code,
      name: nl ? g.role.nameNl : g.role.nameEn,
      kind: g.kind as "DEFAULT" | "LEADER",
    }));

    const name = nl ? group.nameNl : group.nameEn;

    const searchText = [name, group.nameNl, group.nameEn, group.code, ...roleGrants.map((g) => g.name), ...members.map((m) => `${m.name} ${m.email}`)]
      .join(" ")
      .toLowerCase();

    return {
      id: group.id,
      code: group.code,
      name,
      nameNl: group.nameNl,
      nameEn: group.nameEn,
      leadLabel: group.leadLabel,
      descriptionNl: group.descriptionNl ?? "",
      descriptionEn: group.descriptionEn ?? "",
      website: group.website ?? "",
      orderInPraesidium: group.orderInPraesidium,
      active: group.active,
      memberCount: members.length,
      members,
      roleGrants,
      memberEdit: canManage ? "full" : isCurrentYear && ownMemberGroupIds.has(group.id) ? "own" : "none",
      infoEdit: Boolean(config.publicPath) && (canManage || infoGroupIds.has(group.id)),
      searchText,
    };
  });

  const saveLabels = {
    submitLabel: nl ? "Opslaan" : "Save",
    savingLabel: nl ? "Bezig..." : "Saving...",
    savedMessage: nl ? "Opgeslagen" : "Saved",
    fallbackErrorMessage: nl ? "Er ging iets mis bij het opslaan." : "Something went wrong while saving.",
    errorMessages: werkgroepErrorMessages(locale, kind),
  };

  const ownMembers = ownMemberGroupIds.size > 0;
  const ownInfo = infoGroupIds.size > 0;
  const intro =
    kind === "WERKGROEP"
      ? canManage
        ? nl
          ? "Werkgroepen werken zoals posten: ze verlenen rollen aan hun leden. Lidmaatschappen gelden per werkingsjaar en resetten op 15 juli. Elke werkgroep verschijnt op /werkgroepen met haar eigen infotekst en website."
          : "Werkgroepen work like posts: they grant roles to their members. Memberships apply per working year and reset on 15 July. Each werkgroep appears on /werkgroepen with its own info text and website."
        : ownMembers && ownInfo
          ? nl
            ? "Hier pas je de infotekst en website van je eigen werkgroep aan en beheer je de leden van dit werkingsjaar. De tekst en website verschijnen op de publieke /werkgroepen-pagina."
            : "Here you edit the info text and website of your own werkgroep and manage its members for this working year. The text and website appear on the public /werkgroepen page."
          : ownMembers
            ? nl
              ? "Hier beheer je de leden van je eigen werkgroep voor dit werkingsjaar."
              : "Here you manage the members of your own werkgroep for this working year."
            : nl
              ? "Hier pas je de infotekst en website van je eigen werkgroep aan. Die verschijnen op de publieke /werkgroepen-pagina."
              : "Here you edit the info text and website of your own werkgroep. They appear on the public /werkgroepen page."
      : canManage
        ? nl
          ? "Jaarwerkingen werken zoals werkgroepen: ze verlenen rollen aan hun leden. Lidmaatschappen gelden per werkingsjaar en resetten op 15 juli."
          : "Yearly events (jaarwerkingen) work like werkgroepen: they grant roles to their members. Memberships apply per working year and reset on 15 July."
        : nl
          ? "Hier beheer je de leden van je eigen jaarwerking voor dit werkingsjaar."
          : "Here you manage the members of your own yearly event for this working year.";

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-[#5c667f]">{intro}</p>
      </div>

      {/* Werkingsjaar-tabjes (relevant voor de ledenlijst) */}
      <div className="flex flex-wrap gap-2">
        {tabs.map((y) => {
          const active = y === year;
          return (
            <Link
              key={y}
              href={`${base}${config.adminPath}?jaar=${y}`}
              className={
                "rounded-full border px-4 py-1.5 text-sm font-medium transition " +
                (active
                  ? "border-vtk-ink bg-vtk-ink text-white"
                  : "border-vtk-blue/20 bg-white text-vtk-ink hover:bg-vtk-blue-soft/50")
              }
            >
              {formatWorkingYear(y)}
            </Link>
          );
        })}
      </div>

      <WerkingenTable
        kind={kind}
        rows={rows}
        allRoles={allRoles}
        year={year}
        yearLabel={formatWorkingYear(year)}
        locale={nl ? "nl" : "en"}
        canManage={canManage}
        saveLabels={saveLabels}
      />
    </div>
  );
}
