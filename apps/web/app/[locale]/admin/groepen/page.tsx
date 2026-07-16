import Link from "next/link";
import { prisma } from "@vtk/db";
import { notFound } from "next/navigation";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import type { Locale } from "@vtk/i18n";
import { Card, Input, Label, Button, Textarea } from "@vtk/ui";
import { publicUrl } from "@/lib/storage";
import { saveGroupAction, setGroupPermissionAction } from "@/app/actions/users-groups";
import { formatWorkingYear, parseWorkingYear, workingYearTabs } from "@/lib/workingYear";
import { AddMemberForm } from "./AddMemberForm";
import { RemoveMemberButton } from "./RemoveMemberButton";

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

  const [groups, permissions, distinctYears] = await Promise.all([
    prisma.group.findMany({
      orderBy: { orderInPraesidium: "asc" },
      include: {
        permissions: true,
        memberships: {
          where: { year },
          include: { user: true },
        },
      },
    }),
    prisma.permission.findMany({ orderBy: [{ category: "asc" }, { code: "asc" }] }),
    prisma.groupMembership.findMany({ distinct: ["year"], select: { year: true } }),
  ]);

  const tabs = workingYearTabs(distinctYears.map((r) => r.year));

  const byCategory = new Map<string, typeof permissions>();
  for (const p of permissions) {
    const cat = p.category || "general";
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat)!.push(p);
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{nl ? "Posten & rechten" : "Posts & permissions"}</h1>

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

      {groups.map((group) => {
        const enabled = new Set(group.permissions.map((gp) => gp.permissionId));
        const groupName = nl ? group.nameNl : group.nameEn;
        const members = [...group.memberships].sort((a, b) => {
          if (a.role !== b.role) return a.role === "LEAD" ? -1 : 1;
          return a.user.name.localeCompare(b.user.name, locale);
        });

        return (
          <Card key={group.id} className="space-y-4 p-5">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-lg font-semibold text-vtk-ink">{groupName}</h2>
              <span className="text-xs text-[#5c667f]">
                {members.length} {nl ? "leden" : "members"} · {formatWorkingYear(year)}
              </span>
            </div>

            {/* Leden van deze post in het geselecteerde jaar */}
            {members.length > 0 ? (
              <ul className="divide-y divide-vtk-blue/10">
                {members.map((m) => {
                  const src = publicUrl(m.user.avatarKey);
                  return (
                    <li key={m.id} className="flex items-center gap-3 py-2">
                      <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full border border-vtk-blue/10 bg-vtk-blue-soft">
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
                        <div className="truncate text-xs text-[#5c667f]">
                          {m.role === "LEAD" ? (nl ? "Verantwoordelijke" : "Lead") : nl ? "Lid" : "Member"}
                          {m.titleNl ? ` · ${nl ? m.titleNl : m.titleEn ?? m.titleNl}` : ""}
                        </div>
                      </div>
                      <RemoveMemberButton
                        membershipId={m.id}
                        userId={m.userId}
                        memberName={m.user.name}
                        groupName={groupName}
                        yearLabel={formatWorkingYear(year)}
                        locale={locale}
                      />
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-[#5c667f]">
                {nl ? "Nog geen leden voor dit jaar." : "No members for this year yet."}
              </p>
            )}

            <AddMemberForm groupId={group.id} year={year} locale={locale} />

            {/* Beschrijving & instellingen — standaard ingeklapt */}
            <details className="rounded-xl border border-vtk-blue/12">
              <summary className="cursor-pointer px-4 py-2 text-sm font-medium text-vtk-ink">
                {nl ? "Beschrijving & instellingen" : "Description & settings"}
              </summary>
              <form action={saveGroupAction} className="grid grid-cols-1 gap-3 p-4 md:grid-cols-5">
                <input type="hidden" name="id" value={group.id} />
                <div className="md:col-span-2"><Label>Name (NL)</Label><Input name="nameNl" defaultValue={group.nameNl} /></div>
                <div className="md:col-span-2"><Label>Name (EN)</Label><Input name="nameEn" defaultValue={group.nameEn} /></div>
                <div><Label>Order</Label><Input name="orderInPraesidium" type="number" defaultValue={group.orderInPraesidium} /></div>
                <div className="md:col-span-5"><Label>Description (NL)</Label><Textarea name="descriptionNl" defaultValue={group.descriptionNl ?? ""} rows={2} /></div>
                <div className="md:col-span-5"><Label>Description (EN)</Label><Textarea name="descriptionEn" defaultValue={group.descriptionEn ?? ""} rows={2} /></div>
                <div className="md:col-span-5"><Button type="submit">{nl ? "Opslaan" : "Save"}</Button></div>
              </form>
            </details>

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
                            <form action={setGroupPermissionAction}>
                              <input type="hidden" name="groupId" value={group.id} />
                              <input type="hidden" name="permissionId" value={p.id} />
                              <input type="hidden" name="enabled" value={on ? "0" : "1"} />
                              <label className="inline-flex cursor-pointer items-center gap-2">
                                <button
                                  type="submit"
                                  className={"inline-block h-4 w-4 rounded border " + (on ? "bg-vtk-blue border-vtk-blue" : "border-zinc-400")}
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
          </Card>
        );
      })}
    </div>
  );
}
