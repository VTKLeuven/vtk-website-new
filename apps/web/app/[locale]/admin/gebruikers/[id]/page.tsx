import { prisma } from "@vtk/db";
import { notFound } from "next/navigation";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import type { Locale } from "@vtk/i18n";
import { Button, Card, Input, Label, Select } from "@vtk/ui";
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

  const [user, groups] = await Promise.all([
    prisma.user.findUnique({
      where: { id },
      include: { memberships: { include: { group: true } } },
    }),
    prisma.group.findMany({ orderBy: { orderInPraesidium: "asc" } }),
  ]);
  if (!user) notFound();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{user.name}</h1>
      <Card className="p-5">
        <form action={saveUserAction} className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <input type="hidden" name="id" value={user.id} />
          <div><Label>{locale === "nl" ? "Naam" : "Name"}</Label><Input name="name" defaultValue={user.name} required /></div>
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
            <Button type="submit">{locale === "nl" ? "Opslaan" : "Save"}</Button>
          </div>
        </form>
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
              <form action={removeMembershipAction}>
                <input type="hidden" name="id" value={m.id} />
                <input type="hidden" name="userId" value={user.id} />
                <Button variant="ghost" size="sm" type="submit">{locale === "nl" ? "Verwijder" : "Remove"}</Button>
              </form>
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

      <form action={deleteUserAction}>
        <input type="hidden" name="id" value={user.id} />
        <Button variant="danger" type="submit">{locale === "nl" ? "Gebruiker verwijderen" : "Delete user"}</Button>
      </form>
    </div>
  );
}
