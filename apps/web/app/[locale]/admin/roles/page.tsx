import { prisma } from "@vtk/db";
import { notFound } from "next/navigation";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import type { Locale } from "@vtk/i18n";
import { Card, Input, Label, Button, Textarea } from "@vtk/ui";
import { publicUrl } from "@/lib/storage";
import { SaveForm } from "@/components/ui/SaveForm";
import { DeleteButton, DeleteIconButton } from "@/components/ui/DeleteIconButton";
import { currentWorkingYear, formatWorkingYear } from "@/lib/workingYear";
import {
  saveRoleAction,
  deleteRoleAction,
  setRolePermissionAction,
  removeUserRoleAction,
} from "@/app/actions/roles";
import { roleErrorMessages } from "./messages";
import { AddRoleMemberForm } from "./AddRoleMemberForm";

export default async function AdminRoles({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === "nl";
  await requirePermission("roles.manage");

  const year = currentWorkingYear();

  const [roles, permissions] = await Promise.all([
    prisma.role.findMany({
      orderBy: [{ order: "asc" }, { nameNl: "asc" }],
      include: {
        permissions: true,
        users: {
          where: { year },
          include: { user: true },
        },
      },
    }),
    prisma.permission.findMany({ orderBy: [{ category: "asc" }, { code: "asc" }] }),
  ]);

  const byCategory = new Map<string, typeof permissions>();
  for (const p of permissions) {
    const cat = p.category || "general";
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat)!.push(p);
  }

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
            ? "Een rol bundelt rechten. Wijs rollen toe aan personen (hier) of laat een post ze automatisch toekennen (bij Posten). Toewijzingen gelden voor het huidige werkingsjaar en resetten op 15 juli."
            : "A role bundles permissions. Assign roles to people (here) or let a post grant them automatically (under Posts). Assignments apply to the current working year and reset on 15 July."}
        </p>
      </div>

      {/* Nieuwe rol */}
      <Card className="space-y-3 p-5">
        <h2 className="text-lg font-semibold text-vtk-ink">{nl ? "Nieuwe rol" : "New role"}</h2>
        <SaveForm
          action={saveRoleAction}
          className="grid grid-cols-1 gap-3 md:grid-cols-6 [&>button]:md:col-span-6 [&>button]:justify-self-start"
          {...saveLabels}
        >
          <div className="md:col-span-2"><Label>{nl ? "Naam (NL)" : "Name (NL)"}</Label><Input name="nameNl" required /></div>
          <div className="md:col-span-2"><Label>{nl ? "Naam (EN)" : "Name (EN)"}</Label><Input name="nameEn" required /></div>
          <div className="md:col-span-1"><Label>{nl ? "Code" : "Code"}</Label><Input name="code" placeholder={nl ? "auto" : "auto"} /></div>
          <div className="md:col-span-1"><Label>{nl ? "Volgorde" : "Order"}</Label><Input name="order" type="number" defaultValue={0} /></div>
          <div className="md:col-span-3"><Label>{nl ? "Beschrijving (NL)" : "Description (NL)"}</Label><Input name="descriptionNl" /></div>
          <div className="md:col-span-3"><Label>{nl ? "Beschrijving (EN)" : "Description (EN)"}</Label><Input name="descriptionEn" /></div>
        </SaveForm>
      </Card>

      {roles.length === 0 && (
        <p className="text-sm text-[#5c667f]">{nl ? "Nog geen rollen." : "No roles yet."}</p>
      )}

      {roles.map((role) => {
        const enabled = new Set(role.permissions.map((rp) => rp.permissionId));
        const roleName = nl ? role.nameNl : role.nameEn;
        const members = [...role.users].sort((a, b) =>
          a.user.name.localeCompare(b.user.name, locale)
        );

        return (
          <Card key={role.id} className="space-y-4 p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <div className="flex items-center gap-2">
                {role.color && (
                  <span
                    className="inline-block size-3 rounded-full"
                    style={{ background: role.color }}
                    aria-hidden
                  />
                )}
                <h2 className="text-lg font-semibold text-vtk-ink">{roleName}</h2>
                <code className="rounded bg-vtk-blue-soft/60 px-1.5 py-0.5 text-xs text-[#5c667f]">
                  {role.code}
                </code>
                {role.system && (
                  <span className="rounded-full border border-vtk-blue/20 px-2 py-0.5 text-[11px] text-[#5c667f]">
                    {nl ? "systeem" : "system"}
                  </span>
                )}
              </div>
              <span className="text-xs text-[#5c667f]">
                {members.length} {nl ? "leden" : "members"} · {enabled.size}{" "}
                {nl ? "rechten" : "permissions"} · {formatWorkingYear(year)}
              </span>
            </div>

            {(role.descriptionNl || role.descriptionEn) && (
              <p className="text-sm text-[#34405e]">{nl ? role.descriptionNl : role.descriptionEn}</p>
            )}

            {/* Leden met deze rol (huidig werkingsjaar) */}
            <div className="space-y-2">
              {members.length > 0 ? (
                <ul className="divide-y divide-vtk-blue/10">
                  {members.map((m) => {
                    const src = publicUrl(m.user.avatarKey);
                    return (
                      <li key={m.userId} className="flex items-center gap-3 py-2">
                        <div className="h-8 w-8 shrink-0 overflow-hidden rounded-full border border-vtk-blue/10 bg-vtk-blue-soft">
                          {src ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={src} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <div className="grid h-full w-full place-items-center text-xs font-semibold text-[#5c667f]">
                              {m.user.name.slice(0, 1).toUpperCase()}
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium text-vtk-ink">{m.user.name}</div>
                          <div className="truncate text-xs text-[#5c667f]">{m.user.email}</div>
                        </div>
                        <DeleteIconButton
                          action={removeUserRoleAction}
                          fields={{ userId: m.userId, roleId: role.id, year: String(year) }}
                          label={nl ? "Rol intrekken" : "Remove role"}
                          srLabel={`${nl ? "Rol intrekken" : "Remove role"}: ${m.user.name}`}
                          title={nl ? "Rol intrekken?" : "Remove role?"}
                          description={
                            nl
                              ? `${m.user.name} verliest de rol "${roleName}" voor ${formatWorkingYear(year)}, samen met de rechten die enkel via deze rol kwamen. De historiek van andere jaren blijft.`
                              : `${m.user.name} loses the role "${roleName}" for ${formatWorkingYear(year)}, along with permissions that came only through this role. History of other years is kept.`
                          }
                          confirmLabel={nl ? "Intrekken" : "Remove"}
                          cancelLabel={nl ? "Annuleren" : "Cancel"}
                          successMessage={nl ? "Rol ingetrokken" : "Role removed"}
                        />
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-sm text-[#5c667f]">
                  {nl ? "Nog niemand met deze rol dit jaar." : "Nobody has this role this year yet."}
                </p>
              )}
              <AddRoleMemberForm roleId={role.id} locale={nl ? "nl" : "en"} />
            </div>

            {/* Rechten — standaard ingeklapt */}
            <details className="rounded-xl border border-vtk-blue/12">
              <summary className="cursor-pointer px-4 py-2 text-sm font-medium text-vtk-ink">
                {nl ? "Rechten" : "Permissions"}
              </summary>
              <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-2 lg:grid-cols-3">
                {Array.from(byCategory.entries()).map(([cat, perms]) => (
                  <div key={cat}>
                    <h4 className="mb-1 text-xs font-semibold uppercase text-zinc-500">{cat}</h4>
                    <ul className="space-y-1 text-sm">
                      {perms.map((p) => {
                        const on = enabled.has(p.id);
                        return (
                          <li key={p.id}>
                            <form action={setRolePermissionAction}>
                              <input type="hidden" name="roleId" value={role.id} />
                              <input type="hidden" name="permissionId" value={p.id} />
                              <input type="hidden" name="enabled" value={on ? "0" : "1"} />
                              <label className="inline-flex cursor-pointer items-center gap-2">
                                <button
                                  type="submit"
                                  className={
                                    "inline-block h-4 w-4 rounded border " +
                                    (on ? "border-vtk-blue bg-vtk-blue" : "border-zinc-400")
                                  }
                                  aria-pressed={on}
                                  title={p.code}
                                />
                                <span>{nl ? p.labelNl : p.labelEn}</span>
                              </label>
                            </form>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            </details>

            {/* Bewerken & verwijderen — standaard ingeklapt */}
            <details className="rounded-xl border border-vtk-blue/12">
              <summary className="cursor-pointer px-4 py-2 text-sm font-medium text-vtk-ink">
                {nl ? "Bewerken" : "Edit"}
              </summary>
              <div className="space-y-4 p-4">
                <SaveForm
                  action={saveRoleAction}
                  className="grid grid-cols-1 gap-3 md:grid-cols-6 [&>button]:md:col-span-6 [&>button]:justify-self-start"
                  {...saveLabels}
                >
                  <input type="hidden" name="id" value={role.id} />
                  <div className="md:col-span-2"><Label>{nl ? "Naam (NL)" : "Name (NL)"}</Label><Input name="nameNl" defaultValue={role.nameNl} required /></div>
                  <div className="md:col-span-2"><Label>{nl ? "Naam (EN)" : "Name (EN)"}</Label><Input name="nameEn" defaultValue={role.nameEn} required /></div>
                  <div className="md:col-span-1">
                    <Label>{nl ? "Code" : "Code"}</Label>
                    <Input name="code" defaultValue={role.code} disabled={role.system} />
                  </div>
                  <div className="md:col-span-1"><Label>{nl ? "Volgorde" : "Order"}</Label><Input name="order" type="number" defaultValue={role.order} /></div>
                  <div className="md:col-span-3"><Label>{nl ? "Beschrijving (NL)" : "Description (NL)"}</Label><Textarea name="descriptionNl" defaultValue={role.descriptionNl ?? ""} rows={2} /></div>
                  <div className="md:col-span-3"><Label>{nl ? "Beschrijving (EN)" : "Description (EN)"}</Label><Textarea name="descriptionEn" defaultValue={role.descriptionEn ?? ""} rows={2} /></div>
                  <div className="md:col-span-2"><Label>{nl ? "Kleur (optioneel)" : "Color (optional)"}</Label><Input name="color" defaultValue={role.color ?? ""} placeholder="#FFD23F" /></div>
                </SaveForm>

                {role.system ? (
                  <p className="text-xs text-[#5c667f]">
                    {nl
                      ? "Dit is een systeemrol en kan niet verwijderd worden."
                      : "This is a system role and cannot be deleted."}
                  </p>
                ) : (
                  <DeleteButton
                    action={deleteRoleAction}
                    fields={{ id: role.id }}
                    title={nl ? "Rol verwijderen?" : "Delete role?"}
                    description={
                      nl
                        ? `De rol "${roleName}" wordt verwijderd. ${members.length} toewijzing(en) voor ${formatWorkingYear(year)} vervallen en de rechten die deze rol gaf verdwijnen. Posten die deze rol toekenden, doen dat niet meer.`
                        : `The role "${roleName}" will be deleted. ${members.length} assignment(s) for ${formatWorkingYear(year)} are removed and the permissions this role granted disappear. Posts that granted this role stop doing so.`
                    }
                    confirmLabel={nl ? "Verwijderen" : "Delete"}
                    cancelLabel={nl ? "Annuleren" : "Cancel"}
                    successMessage={nl ? "Rol verwijderd" : "Role deleted"}
                  >
                    {nl ? "Rol verwijderen" : "Delete role"}
                  </DeleteButton>
                )}
              </div>
            </details>
          </Card>
        );
      })}
    </div>
  );
}
