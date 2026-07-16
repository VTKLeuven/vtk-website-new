import Link from "next/link";
import { prisma } from "@vtk/db";
import { notFound } from "next/navigation";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import type { Locale } from "@vtk/i18n";
import { publicUrl } from "@/lib/storage";
import { formatWorkingYear, parseWorkingYear, workingYearTabs } from "@/lib/workingYear";
import { groupErrorMessages } from "./messages";
import { PostsTable, type PostRow, type RoleOption } from "./PostsTable";

export default async function AdminGroups({
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
  await requirePermission("groups.manage");

  const year = parseWorkingYear(jaar);

  const [groups, roles, distinctYears] = await Promise.all([
    prisma.group.findMany({
      orderBy: [{ active: "desc" }, { orderInPraesidium: "asc" }],
      include: {
        roleGrants: { include: { role: { select: { code: true, nameNl: true, nameEn: true } } } },
        memberships: { where: { year }, include: { user: true } },
      },
    }),
    prisma.role.findMany({ orderBy: [{ order: "asc" }, { nameNl: "asc" }], select: { id: true, code: true, nameNl: true, nameEn: true } }),
    prisma.groupMembership.findMany({ distinct: ["year"], select: { year: true } }),
  ]);

  const tabs = workingYearTabs(distinctYears.map((r) => r.year));

  const allRoles: RoleOption[] = roles.map((r) => ({ roleId: r.id, code: r.code, name: nl ? r.nameNl : r.nameEn }));

  const postRows: PostRow[] = groups.map((group) => {
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
    const description = nl ? group.descriptionNl : group.descriptionEn;

    const searchText = [
      name,
      group.nameNl,
      group.nameEn,
      group.code,
      description ?? "",
      ...roleGrants.map((g) => g.name),
      ...members.map((m) => `${m.name} ${m.email}`),
    ]
      .join(" ")
      .toLowerCase();

    return {
      id: group.id,
      code: group.code,
      name,
      nameNl: group.nameNl,
      nameEn: group.nameEn,
      description,
      descriptionNl: group.descriptionNl ?? "",
      descriptionEn: group.descriptionEn ?? "",
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
    errorMessages: groupErrorMessages(locale),
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{nl ? "Posten & rollen" : "Posts & roles"}</h1>
        <p className="mt-1 text-sm text-[#5c667f]">
          {nl
            ? "Een post verleent rollen aan haar leden: DEFAULT-rollen aan elk lid, LEADER-rollen enkel aan de verantwoordelijke. De rechten van een rol beheer je bij Rollen. Lidmaatschappen gelden per werkingsjaar en resetten op 15 juli."
            : "A post grants roles to its members: DEFAULT roles to every member, LEADER roles only to the lead. A role's permissions are managed under Roles. Memberships apply per working year and reset on 15 July."}
        </p>
      </div>

      {/* Werkingsjaar-tabjes */}
      <div className="flex flex-wrap gap-2">
        {tabs.map((y) => {
          const active = y === year;
          return (
            <Link
              key={y}
              href={`${base}/admin/groepen?jaar=${y}`}
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

      <PostsTable
        posts={postRows}
        allRoles={allRoles}
        year={year}
        yearLabel={formatWorkingYear(year)}
        locale={nl ? "nl" : "en"}
        saveLabels={saveLabels}
      />
    </div>
  );
}
