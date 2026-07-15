import { prisma } from "@vtk/db";
import { notFound } from "next/navigation";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import { getDictionary, type Locale } from "@vtk/i18n";
import { nameParts } from "@vtk/auth";
import { Button, Card, Input, Label, Select } from "@vtk/ui";
import { DeleteButton, DeleteIconButton } from "@/components/ui/DeleteIconButton";
import { SaveForm } from "@/components/ui/SaveForm";
import { userErrorMessages } from "../messages";
import {
  addMembershipAction,
  deleteUserAction,
  removeMembershipAction,
  saveUserAction,
} from "@/app/actions/users-groups";
import { currentWorkingYear } from "@/lib/workingYear";

export default async function EditUserPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale: localeParam, id } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  await requirePermission("users.edit");
  const dict = getDictionary(locale);

  const [user, groups] = await Promise.all([
    prisma.user.findUnique({
      where: { id },
      include: { memberships: { include: { group: true } } },
    }),
    prisma.group.findMany({ orderBy: { orderInPraesidium: "asc" } }),
  ]);
  if (!user) notFound();

  // Leden van voor de eerste onboarding hebben nog geen aparte voor-/achternaam;
  // dan tonen we een split van de weergavenaam als startwaarde.
  const parts = nameParts(user);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{user.name}</h1>
      <Card className="p-5">
        <SaveForm
          action={saveUserAction}
          className="grid grid-cols-1 md:grid-cols-2 gap-3 [&>button]:justify-self-start"
          submitLabel={dict.admin.save}
          savingLabel={dict.common.saving}
          savedMessage={dict.common.saved}
          errorMessages={userErrorMessages(locale)}
          fallbackErrorMessage={dict.common.saveError}
        >
          <input type="hidden" name="id" value={user.id} />
          <div><Label>{locale === "nl" ? "Voornaam" : "First name"}</Label><Input name="firstName" defaultValue={parts.firstName} required /></div>
          <div><Label>{locale === "nl" ? "Achternaam" : "Last name"}</Label><Input name="lastName" defaultValue={parts.lastName} required /></div>
          <div><Label>Email</Label><Input name="email" type="email" defaultValue={user.email} required /></div>
          <div><Label>{locale === "nl" ? "R-nummer" : "R-number"}</Label><Input name="rNumber" defaultValue={user.rNumber ?? ""} placeholder="r0123456" /></div>
          <div>
            <Label>{locale === "nl" ? "Nieuw wachtwoord" : "New password"}</Label>
            <Input name="password" type="text" placeholder={locale === "nl" ? "Leeg laten om niet te wijzigen" : "Leave blank to keep"} />
          </div>
          <div>
            <Label>Locale</Label>
            <Select name="locale" defaultValue={user.locale}><option value="NL">NL</option><option value="EN">EN</option></Select>
          </div>
          <div className="md:col-span-2 flex items-center gap-4">
            <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={user.active} />Active</label>
            <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" name="isSuperAdmin" defaultChecked={user.isSuperAdmin} />Superadmin</label>
          </div>
        </SaveForm>
      </Card>

      <Card className="p-5 space-y-4">
        <h2 className="font-semibold">{locale === "nl" ? "Groepslidmaatschappen" : "Memberships"}</h2>
        <ul className="divide-y divide-zinc-200">
          {user.memberships.map((m) => (
            <li key={m.id} className="py-2 flex items-center justify-between gap-3">
              <span className="text-sm">
                <span className="font-medium">{m.group.nameNl}</span> · {m.role}
                {m.titleNl ? ` · ${m.titleNl}` : ""}
                {m.year ? ` · ${m.year}` : ""}
              </span>
              <DeleteIconButton
                action={removeMembershipAction}
                fields={{ id: m.id, userId: user.id }}
                label={locale === "nl" ? "Verwijderen" : "Remove"}
                srLabel={`${locale === "nl" ? "Verwijderen" : "Remove"}: ${m.group.nameNl}`}
                title={locale === "nl" ? "Lidmaatschap verwijderen?" : "Remove membership?"}
                description={
                  locale === "nl"
                    ? `${user.name} wordt verwijderd uit ${m.group.nameNl}${m.year ? ` (${m.year})` : ""}. Rechten die via deze post kwamen, vervallen daarmee.`
                    : `${user.name} will be removed from ${m.group.nameNl}${m.year ? ` (${m.year})` : ""}. Permissions granted through this group will be lost.`
                }
                confirmLabel={locale === "nl" ? "Verwijderen" : "Remove"}
                cancelLabel={locale === "nl" ? "Annuleren" : "Cancel"}
                successMessage={locale === "nl" ? "Lidmaatschap verwijderd" : "Membership removed"}
              />
            </li>
          ))}
          {user.memberships.length === 0 && <li className="py-2 text-sm text-zinc-500">—</li>}
        </ul>
        <form action={addMembershipAction} className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
          <input type="hidden" name="userId" value={user.id} />
          <div className="md:col-span-2">
            <Label>Group</Label>
            <Select name="groupId" required defaultValue="">
              <option value="" disabled>—</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.nameNl}</option>)}
            </Select>
          </div>
          <div>
            <Label>Role</Label>
            <Select name="role" defaultValue="MEMBER">
              <option value="MEMBER">Member</option>
              <option value="LEAD">Lead</option>
            </Select>
          </div>
          <div><Label>Title (NL)</Label><Input name="titleNl" /></div>
          <div><Label>{locale === "nl" ? "Werkingsjaar" : "Working year"}</Label><Input name="year" type="number" defaultValue={currentWorkingYear()} /></div>
          <div><Button type="submit">{locale === "nl" ? "Toevoegen" : "Add"}</Button></div>
        </form>
      </Card>

      <DeleteButton
        action={deleteUserAction}
        fields={{ id: user.id }}
        title={locale === "nl" ? "Gebruiker verwijderen?" : "Delete user?"}
        description={
          locale === "nl"
            ? `Het account van ${user.name} (${user.email}) wordt permanent verwijderd, samen met ${user.memberships.length} lidmaatschap(pen). Dit kan niet ongedaan gemaakt worden. Overweeg het account op inactief te zetten als je de historiek wil bewaren.`
            : `The account of ${user.name} (${user.email}) will be permanently deleted, along with ${user.memberships.length} membership(s). This cannot be undone. Consider deactivating the account instead if you want to keep the history.`
        }
        confirmLabel={locale === "nl" ? "Verwijderen" : "Delete"}
        cancelLabel={locale === "nl" ? "Annuleren" : "Cancel"}
        // Geen toast: deze action redirect naar de gebruikerslijst, want deze
        // pagina bestaat nadien niet meer. Die navigatie is de bevestiging.
      >
        {locale === "nl" ? "Gebruiker verwijderen" : "Delete user"}
      </DeleteButton>
    </div>
  );
}
