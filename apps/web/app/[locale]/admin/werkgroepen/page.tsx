import Link from "next/link";
import { prisma } from "@vtk/db";
import { notFound } from "next/navigation";
import { hasLocale } from "@/lib/locale";
import { requireSession } from "@/lib/session";
import { hasPermission } from "@vtk/auth";
import type { Locale } from "@vtk/i18n";
import { publicUrl } from "@/lib/storage";
import { formatWorkingYear, parseWorkingYear, workingYearTabs } from "@/lib/workingYear";
import { werkgroepErrorMessages } from "./messages";
import { WerkgroepenTable, type WerkgroepRow, type RoleOption } from "./WerkgroepenTable";

export default async function AdminWerkgroepen({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ jaar?: string }>;
}) {
  const { locale: localeParam } = await params;
  const { jaar } = await searchParams;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === "nl";
  const base = nl ? "" : "/en";

  // Toegang: beheerders (werkgroepen.manage/superadmin) zien alle werkgroepen en
  // beheren leden/rollen; een gewoon lid ziet enkel de werkgroep(en) waar het lid
  // van is en mag daar enkel de infotekst + website aanpassen.
  const session = await requireSession();
  const canManage = hasPermission(session, "werkgroepen.manage");
  const myGroupIds = new Set(session.groups.map((g) => g.id));

  const year = parseWorkingYear(jaar);

  const [groups, roles, distinctYears] = await Promise.all([
    prisma.group.findMany({
      where: { type: "WERKGROEP" },
      orderBy: [{ active: "desc" }, { orderInPraesidium: "asc" }],
      include: {
        roleGrants: { include: { role: { select: { code: true, nameNl: true, nameEn: true } } } },
        memberships: { where: { year }, include: { user: true } },
      },
    }),
    prisma.role.findMany({
      orderBy: [{ order: "asc" }, { nameNl: "asc" }],
      select: { id: true, code: true, nameNl: true, nameEn: true },
    }),
    prisma.groupMembership.findMany({
      where: { group: { type: "WERKGROEP" } },
      distinct: ["year"],
      select: { year: true },
    }),
  ]);

  // Een lid ziet enkel de eigen werkgroepen.
  const visible = canManage ? groups : groups.filter((g) => myGroupIds.has(g.id));
  if (!canManage && visible.length === 0) notFound();

  const tabs = workingYearTabs(distinctYears.map((r) => r.year));
  const allRoles: RoleOption[] = roles.map((r) => ({ roleId: r.id, code: r.code, name: nl ? r.nameNl : r.nameEn }));

  const rows: WerkgroepRow[] = visible.map((group) => {
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
      descriptionNl: group.descriptionNl ?? "",
      descriptionEn: group.descriptionEn ?? "",
      website: group.website ?? "",
      orderInPraesidium: group.orderInPraesidium,
      active: group.active,
      memberCount: members.length,
      members,
      roleGrants,
      searchText,
    };
  });

  const saveLabels = {
    submitLabel: nl ? "Opslaan" : "Save",
    savingLabel: nl ? "Bezig..." : "Saving...",
    savedMessage: nl ? "Opgeslagen" : "Saved",
    fallbackErrorMessage: nl ? "Er ging iets mis bij het opslaan." : "Something went wrong while saving.",
    errorMessages: werkgroepErrorMessages(locale),
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{nl ? "Werkgroepen" : "Werkgroepen"}</h1>
        <p className="mt-1 text-sm text-[#5c667f]">
          {canManage
            ? nl
              ? "Werkgroepen werken zoals posten: ze verlenen rollen aan hun leden. Lidmaatschappen gelden per werkingsjaar en resetten op 15 juli. Elke werkgroep verschijnt op /werkgroepen met haar eigen infotekst en website."
              : "Werkgroepen work like posts: they grant roles to their members. Memberships apply per working year and reset on 15 July. Each werkgroep appears on /werkgroepen with its own info text and website."
            : nl
              ? "Hier pas je de infotekst en website van je eigen werkgroep aan. Die verschijnen op de publieke /werkgroepen-pagina."
              : "Here you edit the info text and website of your own werkgroep. They appear on the public /werkgroepen page."}
        </p>
      </div>

      {/* Werkingsjaar-tabjes (relevant voor de ledenlijst) */}
      <div className="flex flex-wrap gap-2">
        {tabs.map((y) => {
          const active = y === year;
          return (
            <Link
              key={y}
              href={`${base}/admin/werkgroepen?jaar=${y}`}
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

      <WerkgroepenTable
        werkgroepen={rows}
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
