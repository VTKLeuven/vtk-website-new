import { prisma } from "@vtk/db";
import { notFound } from "next/navigation";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import type { Locale } from "@vtk/i18n";
import { publicUrl } from "@/lib/storage";
import { currentWorkingYear, formatWorkingYear } from "@/lib/workingYear";
import { roleErrorMessages } from "./messages";
import { RolesTable, type RoleRow, type Perm, type Post } from "./RolesTable";

export default async function AdminRoles({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === "nl";
  const session = await requirePermission("roles.manage");
  const canManageGroups = session.user.isSuperAdmin || session.permissions.includes("groups.manage");

  const year = currentWorkingYear();

  const [roles, permissions, posts] = await Promise.all([
    prisma.role.findMany({
      orderBy: [{ order: "asc" }, { nameNl: "asc" }],
      include: {
        permissions: true,
        users: { where: { year }, include: { user: true } },
        groupGrants: {
          include: {
            group: {
              include: { memberships: { where: { year }, select: { userId: true, role: true } } },
            },
          },
        },
      },
    }),
    prisma.permission.findMany({ orderBy: [{ category: "asc" }, { code: "asc" }] }),
    prisma.group.findMany({
      where: { active: true },
      orderBy: { orderInPraesidium: "asc" },
      select: { id: true, code: true, nameNl: true, nameEn: true },
    }),
  ]);

  const allPermissions: Perm[] = permissions.map((p) => ({
    id: p.id,
    code: p.code,
    label: nl ? p.labelNl : p.labelEn,
    category: p.category || "general",
  }));
  const permLabelById = new Map(allPermissions.map((p) => [p.id, p.label]));

  const allPosts: Post[] = posts.map((p) => ({ groupId: p.id, code: p.code, name: nl ? p.nameNl : p.nameEn }));

  const roleRows: RoleRow[] = roles.map((role) => {
    const directHolders = role.users.map((u) => ({
      userId: u.userId,
      name: u.user.name,
      email: u.user.email,
      avatarUrl: publicUrl(u.user.avatarKey),
    }));

    // "Currently hold" = rechtstreekse toewijzingen + leden van posten die de rol
    // toekennen (DEFAULT = elk lid, LEADER = enkel de lead), voor dit werkingsjaar.
    const effective = new Set(directHolders.map((d) => d.userId));
    for (const grant of role.groupGrants) {
      for (const m of grant.group.memberships) {
        if (grant.kind === "LEADER" && m.role !== "LEAD") continue;
        effective.add(m.userId);
      }
    }

    const postGrants = role.groupGrants.map((g) => ({
      groupId: g.groupId,
      code: g.group.code,
      name: nl ? g.group.nameNl : g.group.nameEn,
      kind: g.kind as "DEFAULT" | "LEADER",
    }));

    const permissionIds = role.permissions.map((rp) => rp.permissionId);
    const name = nl ? role.nameNl : role.nameEn;
    const description = nl ? role.descriptionNl : role.descriptionEn;

    const searchText = [
      name,
      role.nameNl,
      role.nameEn,
      role.code,
      description ?? "",
      ...permissionIds.map((id) => permLabelById.get(id) ?? ""),
      ...postGrants.map((g) => g.name),
      ...directHolders.map((h) => `${h.name} ${h.email}`),
    ]
      .join(" ")
      .toLowerCase();

    return {
      id: role.id,
      code: role.code,
      name,
      nameNl: role.nameNl,
      nameEn: role.nameEn,
      description,
      descriptionNl: role.descriptionNl ?? "",
      descriptionEn: role.descriptionEn ?? "",
      color: role.color,
      system: role.system,
      holderCount: effective.size,
      directHolders,
      postGrants,
      permissionIds,
      searchText,
    };
  });

  const saveLabels = {
    submitLabel: nl ? "Opslaan" : "Save",
    savingLabel: nl ? "Bezig..." : "Saving...",
    savedMessage: nl ? "Opgeslagen" : "Saved",
    fallbackErrorMessage: nl ? "Er ging iets mis bij het opslaan." : "Something went wrong while saving.",
    errorMessages: roleErrorMessages(locale),
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{nl ? "Rollen" : "Roles"}</h1>
        <p className="mt-1 text-sm text-[#5c667f]">
          {nl
            ? "Een rol bundelt rechten. Wijs rollen toe aan personen of laat een post ze automatisch toekennen. Toewijzingen gelden voor het huidige werkingsjaar en resetten op 15 juli."
            : "A role bundles permissions. Assign roles to people or let a post grant them automatically. Assignments apply to the current working year and reset on 15 July."}
        </p>
      </div>

      <RolesTable
        roles={roleRows}
        allPermissions={allPermissions}
        allPosts={allPosts}
        can={{ manageRoles: true, manageGroups: canManageGroups }}
        year={year}
        yearLabel={formatWorkingYear(year)}
        locale={nl ? "nl" : "en"}
        saveLabels={saveLabels}
      />
    </div>
  );
}
