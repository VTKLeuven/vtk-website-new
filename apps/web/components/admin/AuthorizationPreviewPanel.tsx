"use client";

import { useMemo, useState } from "react";
import { Button, Card } from "@vtk/ui";
import { startAuthorizationPreview } from "@/app/actions/authorization-preview";
import { permissionInfoByCode, type PermissionInfo } from "@/lib/permissionCategories";

type RoleOption = {
  id: string;
  nameNl: string;
  nameEn: string;
  code: string;
  permissions: Array<{ permission: { code: string } }>;
};

type GroupOption = {
  id: string;
  nameNl: string;
  nameEn: string;
  type: "PRAESIDIUM" | "WERKGROEP";
  roleGrants: Array<{
    kind: "DEFAULT" | "LEADER";
    role: { id: string; nameNl: string; nameEn: string };
  }>;
};

type GroupChoice = { selected: boolean; lead: boolean };

/** Permissiecodes gegroepeerd per categorie, in de volgorde van de registry. */
function groupByCategory(
  codes: string[],
  info: Map<string, PermissionInfo>,
): Array<{ category: string; categoryLabel: string; permissions: PermissionInfo[] }> {
  const buckets = new Map<string, { categoryLabel: string; permissions: PermissionInfo[] }>();
  for (const code of codes) {
    const entry = info.get(code) ?? {
      code,
      label: code,
      category: "general",
      categoryLabel: code,
    };
    const bucket = buckets.get(entry.category);
    if (bucket) bucket.permissions.push(entry);
    else buckets.set(entry.category, { categoryLabel: entry.categoryLabel, permissions: [entry] });
  }
  return [...buckets.entries()].map(([category, bucket]) => ({ category, ...bucket }));
}

export function AuthorizationPreviewPanel({
  locale,
  roles,
  groups,
}: {
  locale: "nl" | "en";
  roles: RoleOption[];
  groups: GroupOption[];
}) {
  const nl = locale === "nl";
  const info = useMemo(() => permissionInfoByCode(locale), [locale]);

  const [selectedRoles, setSelectedRoles] = useState<Set<string>>(new Set());
  const [groupChoices, setGroupChoices] = useState<Record<string, GroupChoice>>({});

  const posts = groups.filter((group) => group.type !== "WERKGROEP");
  const werkgroepen = groups.filter((group) => group.type === "WERKGROEP");

  const permissionsByRole = useMemo(
    () => new Map(roles.map((role) => [role.id, role.permissions.map((entry) => entry.permission.code)])),
    [roles],
  );

  /**
   * Wat de selectie samen oplevert: rechtstreekse rollen plus de rollen die de
   * aangevinkte posten toekennen (LEADER-rollen enkel voor de
   * verantwoordelijke). Dit is de vraag waarvoor je hier komt, dus die staat
   * onderaan het formulier in plaats van dat je ze zelf moet optellen.
   */
  const effective = useMemo(() => {
    const roleIds = new Set(selectedRoles);
    for (const group of groups) {
      const choice = groupChoices[group.id];
      if (!choice?.selected) continue;
      for (const grant of group.roleGrants) {
        if (grant.kind === "LEADER" && !choice.lead) continue;
        roleIds.add(grant.role.id);
      }
    }
    const codes = new Set<string>();
    for (const roleId of roleIds) {
      for (const code of permissionsByRole.get(roleId) ?? []) codes.add(code);
    }
    return { roleIds, codes: [...codes] };
  }, [selectedRoles, groupChoices, groups, permissionsByRole]);

  const selectedGroupCount = Object.values(groupChoices).filter((choice) => choice.selected).length;
  const effectiveGroups = groupByCategory(effective.codes, info);

  function toggleRole(id: string) {
    setSelectedRoles((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleGroup(id: string) {
    setGroupChoices((current) => ({
      ...current,
      [id]: { selected: !current[id]?.selected, lead: current[id]?.lead ?? false },
    }));
  }

  function setGroupLead(id: string, lead: boolean) {
    setGroupChoices((current) => ({
      ...current,
      [id]: { selected: current[id]?.selected ?? false, lead },
    }));
  }

  function renderGroupCards(list: GroupOption[]) {
    return (
      <div className="grid gap-2 sm:grid-cols-2">
        {list.map((group) => {
          const choice = groupChoices[group.id] ?? { selected: false, lead: false };
          const memberRoles = group.roleGrants.filter((grant) => grant.kind === "DEFAULT");
          const leadRoles = group.roleGrants.filter((grant) => grant.kind === "LEADER");
          return (
            <div
              key={group.id}
              className={
                "rounded-xl border p-3 transition " +
                (choice.selected
                  ? "border-vtk-blue/35 bg-white shadow-sm"
                  : "border-vtk-blue/10 bg-vtk-blue-soft/25")
              }
            >
              <label className="flex items-start gap-3">
                <input
                  className="mt-1 shrink-0"
                  type="checkbox"
                  name="groupId"
                  value={group.id}
                  checked={choice.selected}
                  onChange={() => toggleGroup(group.id)}
                />
                <span className="min-w-0 flex-1 text-sm font-medium text-vtk-ink">
                  {nl ? group.nameNl : group.nameEn}
                </span>
              </label>

              {/* Het keuzemenu doet pas iets zodra de post aangevinkt is; anders
                  staat er een knop klaar die niets verandert. */}
              <div className="mt-2 pl-7">
                <select
                  name={`groupRole:${group.id}`}
                  value={choice.lead ? "LEAD" : "MEMBER"}
                  onChange={(event) => setGroupLead(group.id, event.target.value === "LEAD")}
                  disabled={!choice.selected}
                  aria-label={`${nl ? group.nameNl : group.nameEn}: ${nl ? "lidmaatschap" : "membership"}`}
                  className="w-full rounded-lg border border-vtk-blue/15 bg-white px-2 py-1.5 text-xs text-vtk-ink disabled:cursor-not-allowed disabled:bg-vtk-blue-soft/40 disabled:text-[#8a93ab]"
                >
                  <option value="MEMBER">{nl ? "Lid" : "Member"}</option>
                  <option value="LEAD">{nl ? "Verantwoordelijke" : "Lead"}</option>
                </select>

                <div className="mt-2 text-xs text-[#5c667f]">
                  {group.roleGrants.length === 0 ? (
                    <span className="text-[#8a93ab]">{nl ? "Geen rollen" : "No roles"}</span>
                  ) : (
                    <details className="group/details">
                      <summary className="cursor-pointer select-none text-xs text-[#5c667f] hover:text-vtk-ink">
                        {nl ? "Toon rollen" : "Show roles"} ({group.roleGrants.length})
                      </summary>
                      <div className="mt-1.5 space-y-1 rounded-lg border border-vtk-blue/10 bg-vtk-blue-soft/30 p-2 text-xs">
                        {memberRoles.length > 0 && (
                          <p>
                            <span className="font-medium text-[#8a93ab]">{nl ? "Elk lid: " : "Every member: "}</span>
                            <span className="text-vtk-ink">
                              {memberRoles.map((grant) => (nl ? grant.role.nameNl : grant.role.nameEn)).join(", ")}
                            </span>
                          </p>
                        )}
                        {leadRoles.length > 0 && (
                          <p className={choice.selected && !choice.lead ? "opacity-60" : undefined}>
                            <span className="font-medium text-[#8a93ab]">
                              {nl ? "Enkel de verantwoordelijke: " : "Lead only: "}
                            </span>
                            <span className="text-vtk-ink">
                              {leadRoles.map((grant) => (nl ? grant.role.nameNl : grant.role.nameEn)).join(", ")}
                            </span>
                          </p>
                        )}
                      </div>
                    </details>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <section className="space-y-3">
      <div>
        {/* Deze panel vult een eigen pagina (/admin/it/preview), dus dit is de
            paginakop en geen sectiekop. */}
        <h1 className="text-2xl font-semibold">
          {nl ? "Autorisatievoorbeeld" : "Authorization preview"}
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          {nl
            ? "Bekijk de frontend en admin alsof je deze rollen en posten hebt. Je echte identiteit blijft behouden; er wordt nooit een ander account geopend. De voorbeeldmodus is volledig alleen-lezen en stopt automatisch na twee uur."
            : "View the frontend and admin as if you had these roles and posts. Your real identity is preserved; another account is never opened. Preview mode is fully read-only and expires after two hours."}
        </p>
      </div>

      <Card className="p-5">
        <form action={startAuthorizationPreview} className="space-y-6">
          <input type="hidden" name="locale" value={locale} />

          <fieldset>
            <legend className="text-sm font-semibold text-vtk-ink">
              {nl ? "Rechtstreeks toegewezen rollen" : "Directly assigned roles"}
            </legend>
            <p className="mb-3 mt-1 text-xs text-zinc-500">
              {nl
                ? "Postrollen worden hieronder automatisch afgeleid en hoef je hier niet opnieuw aan te vinken."
                : "Roles granted by posts are derived below and do not need to be selected again here."}
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {roles.map((role) => {
                const codes = role.permissions.map((entry) => entry.permission.code);
                const categories = groupByCategory(codes, info);
                const checked = selectedRoles.has(role.id);
                return (
                  <div
                    key={role.id}
                    className={
                      "rounded-xl border p-3 text-sm transition " +
                      (checked
                        ? "border-vtk-blue/35 bg-white shadow-sm"
                        : "border-vtk-blue/10 bg-vtk-blue-soft/25")
                    }
                  >
                    <label className="flex items-start gap-3">
                      <input
                        className="mt-1 shrink-0"
                        type="checkbox"
                        name="roleId"
                        value={role.id}
                        checked={checked}
                        onChange={() => toggleRole(role.id)}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="font-medium text-vtk-ink">
                            {nl ? role.nameNl : role.nameEn}
                          </span>
                          <span className="shrink-0 text-xs text-[#5c667f]">
                            {codes.length === 0
                              ? nl
                                ? "geen rechten"
                                : "no permissions"
                              : `${codes.length} ${nl ? "rechten" : "permissions"}`}
                          </span>
                        </span>
                        <code className="mt-0.5 block text-[11px] text-[#8a93ab]">{role.code}</code>
                      </span>
                    </label>

                    {codes.length > 0 && (
                      <div className="mt-2 pl-7">
                        <details className="group/details">
                          <summary className="cursor-pointer select-none text-xs text-[#5c667f] hover:text-vtk-ink">
                            {nl ? "Toon rechten" : "Show permissions"} ({codes.length})
                          </summary>
                          <div className="mt-2 space-y-2 rounded-lg border border-vtk-blue/10 bg-vtk-blue-soft/20 p-2.5">
                            <div className="flex flex-wrap gap-1">
                              {categories.map((category) => (
                                <span
                                  key={category.category}
                                  className="rounded-full bg-white px-2 py-0.5 text-[11px] text-vtk-ink shadow-2xs"
                                >
                                  {category.categoryLabel}
                                  <span className="ml-1 text-[#5c667f]">{category.permissions.length}</span>
                                </span>
                              ))}
                            </div>
                            <div className="space-y-2 border-t border-vtk-blue/10 pt-2">
                              {categories.map((category) => (
                                <div key={category.category}>
                                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[#8a93ab]">
                                    {category.categoryLabel}
                                  </p>
                                  <ul className="mt-0.5 space-y-0.5 text-xs text-[#34405e]">
                                    {category.permissions.map((permission) => (
                                      <li key={permission.code} title={permission.code}>
                                        {permission.label}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              ))}
                            </div>
                          </div>
                        </details>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </fieldset>

          {/* Posten en werkgroepen delen hetzelfde model maar zijn twee
              verschillende dingen; door elkaar in één raster was dat enkel aan
              een klein labeltje te zien. */}
          <fieldset>
            <legend className="text-sm font-semibold text-vtk-ink">
              {nl ? "Posten" : "Posts"}
            </legend>
            <p className="mb-3 mt-1 text-xs text-zinc-500">
              {nl
                ? "Vink een post aan en kies of je er lid of verantwoordelijke bent."
                : "Tick a post and choose whether you are a member or the lead."}
            </p>
            {renderGroupCards(posts)}
          </fieldset>

          {werkgroepen.length > 0 && (
            <fieldset>
              <legend className="text-sm font-semibold text-vtk-ink">
                {nl ? "Werkgroepen" : "Working groups"}
              </legend>
              <p className="mb-3 mt-1 text-xs text-zinc-500">
                {nl
                  ? "Werkgroepen werken net als posten, maar staan op /werkgroepen in plaats van op /praesidium."
                  : "Working groups behave like posts, but live on /werkgroepen instead of /praesidium."}
              </p>
              {renderGroupCards(werkgroepen)}
            </fieldset>
          )}

          {/* Uitkomst van de selectie: anders moet je zelf optellen wat je
              rollen en posten samen opleveren. */}
          <div className="rounded-xl border border-vtk-blue/15 bg-vtk-blue-soft/30 p-4">
            <h2 className="text-sm font-semibold text-vtk-ink">
              {nl ? "Wat dit voorbeeld je geeft" : "What this preview gives you"}
            </h2>
            {effective.roleIds.size === 0 ? (
              <p className="mt-1 text-xs text-[#5c667f]">
                {nl
                  ? "Nog niets geselecteerd: je ziet de site zoals een lid zonder rollen of posten."
                  : "Nothing selected yet: you will see the site as a member without roles or posts."}
              </p>
            ) : (
              <>
                <p className="mt-1 text-xs text-[#5c667f]">
                  {nl
                    ? `${effective.roleIds.size} ${effective.roleIds.size === 1 ? "rol" : "rollen"} (rechtstreeks en via ${selectedGroupCount} ${selectedGroupCount === 1 ? "post" : "posten"}), samen ${effective.codes.length} ${effective.codes.length === 1 ? "recht" : "rechten"}.`
                    : `${effective.roleIds.size} ${effective.roleIds.size === 1 ? "role" : "roles"} (directly and through ${selectedGroupCount} ${selectedGroupCount === 1 ? "post" : "posts"}), ${effective.codes.length} ${effective.codes.length === 1 ? "permission" : "permissions"} in total.`}
                </p>
                {effective.codes.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {effectiveGroups.map((category) => (
                      <span
                        key={category.category}
                        className="rounded-full bg-white px-2 py-0.5 text-[11px] text-vtk-ink"
                      >
                        {category.categoryLabel}
                        <span className="ml-1 text-[#5c667f]">{category.permissions.length}</span>
                      </span>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-vtk-blue/10 pt-4">
            <p className="max-w-xl text-xs text-zinc-500">
              {nl
                ? "Accountgebonden gegevens zoals eigen tickets en persoonlijke voorkeuren blijven van je echte account; alleen de autorisatie wordt gesimuleerd."
                : "Account-specific data such as your own tickets and personal preferences remains tied to your real account; only authorization is simulated."}
            </p>
            <Button type="submit" variant="secondary">
              {nl ? "Voorbeeld starten" : "Start preview"}
            </Button>
          </div>
        </form>
      </Card>
    </section>
  );
}
