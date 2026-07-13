import Link from "next/link";
import { prisma } from "@vtk/db";
import { notFound } from "next/navigation";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import type { Locale } from "@vtk/i18n";
import { Button, Card, Input, Label, Select, Textarea } from "@vtk/ui";
import { saveUserAction } from "@/app/actions/users-groups";
import { BulkImport } from "./BulkImport";

export default async function AdminUsers({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { locale: localeParam } = await params;
  const { q } = await searchParams;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const session = await requirePermission("users.view");
  const canEdit = session.user.isSuperAdmin || session.permissions.includes("users.edit");
  const base = locale === "nl" ? "" : "/en";

  const users = await prisma.user.findMany({
    where: q
      ? {
          OR: [
            { email: { contains: q, mode: "insensitive" } },
            { name: { contains: q, mode: "insensitive" } },
          ],
        }
      : undefined,
    orderBy: { name: "asc" },
    include: { memberships: { include: { group: true } } },
    take: 200,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">{locale === "nl" ? "Gebruikers" : "Users"}</h1>
        <form className="flex gap-2">
          <Input name="q" defaultValue={q ?? ""} placeholder={locale === "nl" ? "Zoeken..." : "Search..."} className="w-48" />
          <Button type="submit" variant="secondary">{locale === "nl" ? "Zoek" : "Search"}</Button>
        </form>
      </div>

      {canEdit && (
        <Card className="p-5">
          <h2 className="font-semibold mb-3">{locale === "nl" ? "Nieuwe gebruiker" : "New user"}</h2>
          <form action={saveUserAction} className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
            <div><Label>{locale === "nl" ? "Naam" : "Name"}</Label><Input name="name" required /></div>
            <div><Label>Email</Label><Input name="email" type="email" required /></div>
            <div><Label>{locale === "nl" ? "R-nummer" : "R-number"}</Label><Input name="rNumber" placeholder="r0123456" /></div>
            <div><Label>{locale === "nl" ? "Wachtwoord" : "Password"}</Label><Input name="password" type="text" required /></div>
            <div>
              <Label>Locale</Label>
              <Select name="locale" defaultValue="NL"><option value="NL">NL</option><option value="EN">EN</option></Select>
            </div>
            <div className="md:col-span-4 flex items-center gap-4">
              <label className="inline-flex items-center gap-2 text-sm">
                <input type="checkbox" name="active" defaultChecked />
                {locale === "nl" ? "Actief" : "Active"}
              </label>
              <label className="inline-flex items-center gap-2 text-sm">
                <input type="checkbox" name="isSuperAdmin" />
                Superadmin
              </label>
              <Button type="submit">{locale === "nl" ? "Aanmaken" : "Create"}</Button>
            </div>
          </form>
        </Card>
      )}

      {canEdit && session.permissions.includes("users.bulkImport") && (
        <Card className="p-5">
          <h2 className="font-semibold mb-2">
            {locale === "nl" ? "CSV bulk import" : "Bulk CSV import"}
          </h2>
          <p className="text-sm text-zinc-500 mb-3">
            {locale === "nl"
              ? "Kolommen: email, name, password, groupCode, role (MEMBER|LEAD), year, rNumber. Eerste rij mag een header zijn."
              : "Columns: email, name, password, groupCode, role (MEMBER|LEAD), year, rNumber. First row may be a header."}
          </p>
          <BulkImport locale={locale} />
        </Card>
      )}

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-vtk-blue-soft text-left">
            <tr>
              <th className="px-4 py-2">{locale === "nl" ? "Naam" : "Name"}</th>
              <th className="px-4 py-2">Email</th>
              <th className="px-4 py-2">{locale === "nl" ? "Groepen" : "Groups"}</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t border-zinc-200">
                <td className="px-4 py-2 font-medium">
                  {u.name}
                  {u.isSuperAdmin && <span className="ml-2 text-xs bg-vtk-yellow text-vtk-blue px-1 rounded">admin</span>}
                  {!u.active && <span className="ml-2 text-xs bg-zinc-300 text-zinc-700 px-1 rounded">inactive</span>}
                </td>
                <td className="px-4 py-2 text-zinc-500">{u.email}</td>
                <td className="px-4 py-2 text-xs text-zinc-500">
                  {u.memberships.map((m) => m.group.code).join(", ") || "—"}
                </td>
                <td className="px-4 py-2 text-right">
                  <Link href={`${base}/admin/gebruikers/${u.id}`} className="text-vtk-blue hover:underline">
                    {locale === "nl" ? "Bewerken" : "Edit"}
                  </Link>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-zinc-500">
                  —
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
