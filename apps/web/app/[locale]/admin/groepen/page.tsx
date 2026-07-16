import Link from "next/link";
import { prisma } from "@vtk/db";
import { notFound } from "next/navigation";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import type { Locale } from "@vtk/i18n";
import { Card, Input, Label, Textarea } from "@vtk/ui";
import { publicUrl } from "@/lib/storage";
import { SaveForm } from "@/components/ui/SaveForm";
import { saveGroupAction, setGroupRoleAction } from "@/app/actions/users-groups";
import { formatWorkingYear, parseWorkingYear, workingYearTabs } from "@/lib/workingYear";
import { groupErrorMessages } from "./messages";
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

  const [groups, roles, distinctYears] = await Promise.all([
    prisma.group.findMany({
      orderBy: [{ active: "desc" }, { orderInPraesidium: "asc" }],
      include: {
        roleGrants: true,
        memberships: {
          where: { year },
          include: { user: true },
        },
      },
    }),
    prisma.role.findMany({ orderBy: [{ order: "asc" }, { nameNl: "asc" }] }),
    prisma.groupMembership.findMany({ distinct: ["year"], select: { year: true } }),
  ]);

  const tabs = workingYearTabs(distinctYears.map((r) => r.year));

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

      {/* Nieuwe post */}
      <Card className="space-y-3 p-5">
        <h2 className="text-lg font-semibold text-vtk-ink">{nl ? "Nieuwe post" : "New post"}</h2>
        <SaveForm
          action={saveGroupAction}
          className="grid grid-cols-1 gap-3 md:grid-cols-6 [&>button]:md:col-span-6 [&>button]:justify-self-start"
          {...saveLabels}
        >
          <div className="md:col-span-2"><Label>{nl ? "Naam (NL)" : "Name (NL)"}</Label><Input name="nameNl" required /></div>
          <div className="md:col-span-2"><Label>{nl ? "Naam (EN)" : "Name (EN)"}</Label><Input name="nameEn" required /></div>
          <div className="md:col-span-1"><Label>{nl ? "Code" : "Code"}</Label><Input name="code" placeholder={nl ? "auto" : "auto"} /></div>
          <div className="md:col-span-1"><Label>{nl ? "Volgorde" : "Order"}</Label><Input name="orderInPraesidium" type="number" defaultValue={0} /></div>
          <input type="hidden" name="active" value="on" />
        </SaveForm>
      </Card>

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
        const groupName = nl ? group.nameNl : group.nameEn;
        const grants = new Set(group.roleGrants.map((g) => `${g.roleId}:${g.kind}`));
        const members = [...group.memberships].sort((a, b) => {
          if (a.role !== b.role) return a.role === "LEAD" ? -1 : 1;
          return a.user.name.localeCompare(b.user.name, locale);
        });

        return (
          <Card key={group.id} className={"space-y-4 p-5" + (group.active ? "" : " opacity-70")}>
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-vtk-ink">{groupName}</h2>
                <code className="rounded bg-vtk-blue-soft/60 px-1.5 py-0.5 text-xs text-[#5c667f]">
                  {group.code}
                </code>
                {!group.active && (
                  <span className="rounded-full border border-vtk-blue/20 px-2 py-0.5 text-[11px] text-[#5c667f]">
                    {nl ? "inactief" : "inactive"}
                  </span>
                )}
              </div>
              <span className="text-xs text-[#5c667f]">
                {members.length} {nl ? "leden" : "members"} · {group.roleGrants.length}{" "}
                {nl ? "rol-grants" : "role grants"} · {formatWorkingYear(year)}
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

            <AddMemberForm groupId={group.id} year={year} locale={nl ? "nl" : "en"} />

            {/* Rollen die deze post toekent — standaard ingeklapt */}
            <details className="rounded-xl border border-vtk-blue/12">
              <summary className="cursor-pointer px-4 py-2 text-sm font-medium text-vtk-ink">
                {nl ? "Rollen van deze post" : "Roles of this post"}
              </summary>
              <div className="space-y-2 p-4">
                <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-4 gap-y-1 text-sm">
                  <span className="text-xs font-semibold uppercase text-zinc-500">{nl ? "Rol" : "Role"}</span>
                  <span className="text-xs font-semibold uppercase text-zinc-500">{nl ? "Elk lid" : "Every member"}</span>
                  <span className="text-xs font-semibold uppercase text-zinc-500">{nl ? "Enkel lead" : "Lead only"}</span>
                  {roles.map((role) => {
                    const roleName = nl ? role.nameNl : role.nameEn;
                    return (
                      <GrantRow
                        key={role.id}
                        groupId={group.id}
                        roleId={role.id}
                        roleName={roleName}
                        roleCode={role.code}
                        defaultOn={grants.has(`${role.id}:DEFAULT`)}
                        leaderOn={grants.has(`${role.id}:LEADER`)}
                        nl={nl}
                      />
                    );
                  })}
                </div>
                {roles.length === 0 && (
                  <p className="text-sm text-[#5c667f]">
                    {nl ? "Nog geen rollen. Maak er eerst aan bij Rollen." : "No roles yet. Create some under Roles first."}
                  </p>
                )}
              </div>
            </details>

            {/* Bewerken — standaard ingeklapt */}
            <details className="rounded-xl border border-vtk-blue/12">
              <summary className="cursor-pointer px-4 py-2 text-sm font-medium text-vtk-ink">
                {nl ? "Bewerken" : "Edit"}
              </summary>
              <SaveForm
                action={saveGroupAction}
                className="grid grid-cols-1 gap-3 p-4 md:grid-cols-5 [&>button]:md:col-span-5 [&>button]:justify-self-start"
                {...saveLabels}
              >
                <input type="hidden" name="id" value={group.id} />
                <div className="md:col-span-2"><Label>{nl ? "Naam (NL)" : "Name (NL)"}</Label><Input name="nameNl" defaultValue={group.nameNl} required /></div>
                <div className="md:col-span-2"><Label>{nl ? "Naam (EN)" : "Name (EN)"}</Label><Input name="nameEn" defaultValue={group.nameEn} required /></div>
                <div><Label>{nl ? "Volgorde" : "Order"}</Label><Input name="orderInPraesidium" type="number" defaultValue={group.orderInPraesidium} /></div>
                <div className="md:col-span-5"><Label>{nl ? "Beschrijving (NL)" : "Description (NL)"}</Label><Textarea name="descriptionNl" defaultValue={group.descriptionNl ?? ""} rows={2} /></div>
                <div className="md:col-span-5"><Label>{nl ? "Beschrijving (EN)" : "Description (EN)"}</Label><Textarea name="descriptionEn" defaultValue={group.descriptionEn ?? ""} rows={2} /></div>
                <label className="md:col-span-5 inline-flex items-center gap-2 text-sm text-vtk-ink">
                  <input type="checkbox" name="active" defaultChecked={group.active} className="size-4 rounded border-zinc-400" />
                  {nl
                    ? "Actief (een inactieve post verdwijnt uit de shift-keuzes; de historiek blijft)"
                    : "Active (an inactive post disappears from the shift choices; history is kept)"}
                </label>
              </SaveForm>
            </details>
          </Card>
        );
      })}
    </div>
  );
}

/**
 * Eén rol-rij in het grant-raster van een post: twee toggle-knoppen (DEFAULT =
 * elk lid, LEADER = enkel de verantwoordelijke). Elke knop is een mini-form dat
 * de grant aan/uit zet via {@link setGroupRoleAction}.
 */
function GrantRow({
  groupId,
  roleId,
  roleName,
  roleCode,
  defaultOn,
  leaderOn,
  nl,
}: {
  groupId: string;
  roleId: string;
  roleName: string;
  roleCode: string;
  defaultOn: boolean;
  leaderOn: boolean;
  nl: boolean;
}) {
  return (
    <>
      <div className="flex items-center gap-2">
        <span className="text-vtk-ink">{roleName}</span>
        <code className="rounded bg-vtk-blue-soft/60 px-1.5 py-0.5 text-[11px] text-[#5c667f]">{roleCode}</code>
      </div>
      <GrantToggle groupId={groupId} roleId={roleId} kind="DEFAULT" on={defaultOn} roleName={roleName} nl={nl} />
      <GrantToggle groupId={groupId} roleId={roleId} kind="LEADER" on={leaderOn} roleName={roleName} nl={nl} />
    </>
  );
}

function GrantToggle({
  groupId,
  roleId,
  kind,
  on,
  roleName,
  nl,
}: {
  groupId: string;
  roleId: string;
  kind: "DEFAULT" | "LEADER";
  on: boolean;
  roleName: string;
  nl: boolean;
}) {
  const which = kind === "DEFAULT" ? (nl ? "elk lid" : "every member") : nl ? "enkel de lead" : "lead only";
  const label = on
    ? `${roleName}: ${which} (${nl ? "aan" : "on"})`
    : `${roleName}: ${which} (${nl ? "uit" : "off"})`;
  return (
    <form action={setGroupRoleAction} className="justify-self-center">
      <input type="hidden" name="groupId" value={groupId} />
      <input type="hidden" name="roleId" value={roleId} />
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="enabled" value={on ? "0" : "1"} />
      <button
        type="submit"
        className={"inline-block h-4 w-4 rounded border " + (on ? "border-vtk-blue bg-vtk-blue" : "border-zinc-400")}
        aria-pressed={on}
        title={label}
      />
    </form>
  );
}
