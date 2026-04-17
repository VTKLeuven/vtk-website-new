import { prisma } from "@vtk/db";
import { notFound } from "next/navigation";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import type { Locale } from "@vtk/i18n";
import { Card, Input, Label, Button, Textarea } from "@vtk/ui";
import { saveGroupAction, setGroupPermissionAction } from "@/app/actions/users-groups";

export default async function AdminGroups({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  await requirePermission("groups.manage");

  const [groups, permissions] = await Promise.all([
    prisma.group.findMany({
      orderBy: { orderInPraesidium: "asc" },
      include: { permissions: true },
    }),
    prisma.permission.findMany({ orderBy: [{ category: "asc" }, { code: "asc" }] }),
  ]);

  const byCategory = new Map<string, typeof permissions>();
  for (const p of permissions) {
    const cat = p.category || "general";
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat)!.push(p);
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{locale === "nl" ? "Groepen & rechten" : "Groups & permissions"}</h1>

      {groups.map((group) => {
        const enabled = new Set(group.permissions.map((gp) => gp.permissionId));
        return (
          <Card key={group.id} className="p-5 space-y-4">
            <form action={saveGroupAction} className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
              <input type="hidden" name="id" value={group.id} />
              <div className="md:col-span-2"><Label>Name (NL)</Label><Input name="nameNl" defaultValue={group.nameNl} /></div>
              <div className="md:col-span-2"><Label>Name (EN)</Label><Input name="nameEn" defaultValue={group.nameEn} /></div>
              <div><Label>Order</Label><Input name="orderInPraesidium" type="number" defaultValue={group.orderInPraesidium} /></div>
              <div className="md:col-span-5"><Label>Description (NL)</Label><Textarea name="descriptionNl" defaultValue={group.descriptionNl ?? ""} rows={2} /></div>
              <div className="md:col-span-5"><Label>Description (EN)</Label><Textarea name="descriptionEn" defaultValue={group.descriptionEn ?? ""} rows={2} /></div>
              <div className="md:col-span-5"><Button type="submit">{locale === "nl" ? "Opslaan" : "Save"}</Button></div>
            </form>
            <div className="rounded-xl border border-zinc-200 p-4">
              <h3 className="font-semibold text-sm mb-2">{locale === "nl" ? "Rechten" : "Permissions"}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {Array.from(byCategory.entries()).map(([cat, perms]) => (
                  <div key={cat}>
                    <h4 className="text-xs font-semibold uppercase text-zinc-500 mb-1">{cat}</h4>
                    <ul className="space-y-1 text-sm">
                      {perms.map((p) => {
                        const on = enabled.has(p.id);
                        return (
                          <li key={p.id}>
                            <form action={setGroupPermissionAction}>
                              <input type="hidden" name="groupId" value={group.id} />
                              <input type="hidden" name="permissionId" value={p.id} />
                              <input type="hidden" name="enabled" value={on ? "0" : "1"} />
                              <label className="inline-flex items-center gap-2 cursor-pointer">
                                <button
                                  type="submit"
                                  className={"inline-block h-4 w-4 rounded border " + (on ? "bg-vtk-blue border-vtk-blue" : "border-zinc-400")}
                                  aria-pressed={on}
                                  title={p.code}
                                />
                                <span>{locale === "nl" ? p.labelNl : p.labelEn}</span>
                              </label>
                            </form>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
