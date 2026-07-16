"use client";

import { useMemo, useState } from "react";
import { Input, Label, Textarea } from "@vtk/ui";
import { SaveForm } from "@/components/ui/SaveForm";
import { DeleteButton, DeleteIconButton } from "@/components/ui/DeleteIconButton";
import {
  saveRoleAction,
  deleteRoleAction,
  setRolePermissionAction,
  removeUserRoleAction,
} from "@/app/actions/roles";
import { setGroupRoleAction } from "@/app/actions/users-groups";
import { AddRoleMemberForm } from "./AddRoleMemberForm";
import {
  Avatar,
  Chevron,
  Modal,
  Panel,
  SearchBar,
  SortHeader,
  ToggleDot,
  useTableControls,
} from "../admin-table";

// ---- Data shapes (alles serialiseerbaar; server component vult ze) ----------

export type Person = { userId: string; name: string; email: string; avatarUrl: string | null };
export type PostGrant = { groupId: string; code: string; name: string; kind: "DEFAULT" | "LEADER" };
export type Perm = { id: string; code: string; label: string; category: string };
export type Post = { groupId: string; code: string; name: string };

export type RoleRow = {
  id: string;
  code: string;
  name: string;
  nameNl: string;
  nameEn: string;
  description: string | null;
  descriptionNl: string;
  descriptionEn: string;
  color: string | null;
  system: boolean;
  holderCount: number;
  directHolders: Person[];
  postGrants: PostGrant[];
  permissionIds: string[];
  /** Voorbereide, lowercased zoekstring (naam, code, beschrijving, rechten, posten, personen). */
  searchText: string;
};

export type SaveLabels = {
  submitLabel: string;
  savingLabel: string;
  savedMessage: string;
  fallbackErrorMessage: string;
  errorMessages: Record<string, string>;
};

export function RolesTable({
  roles,
  allPermissions,
  allPosts,
  can,
  year,
  yearLabel,
  locale,
  saveLabels,
}: {
  roles: RoleRow[];
  allPermissions: Perm[];
  allPosts: Post[];
  can: { manageRoles: boolean; manageGroups: boolean };
  year: number;
  yearLabel: string;
  locale: "nl" | "en";
  saveLabels: SaveLabels;
}) {
  const nl = locale === "nl";
  const [createOpen, setCreateOpen] = useState(false);
  const { query, setQuery, sort, toggleSort, filtered, isOpen, toggleRow } = useTableControls(roles, {
    searchOf: (r) => r.searchText,
    nameOf: (r) => r.name,
    countOf: (r) => r.holderCount,
    locale,
  });

  return (
    <div className="space-y-4">
      {/* Toolbar: zoeken + nieuwe rol */}
      <div className="flex flex-wrap items-center gap-3">
        <SearchBar
          value={query}
          onChange={setQuery}
          placeholder={nl ? "Zoek op naam, recht, post of persoon" : "Search by name, permission, post or person"}
          ariaLabel={nl ? "Rollen zoeken" : "Search roles"}
        />
        {can.manageRoles && (
          <button type="button" className="vtk-tile-btn vtk-tile-btn-primary" onClick={() => setCreateOpen(true)}>
            {nl ? "Nieuwe rol" : "New role"}
          </button>
        )}
      </div>

      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr>
              <SortHeader label={nl ? "Rol" : "Role"} active={sort?.key === "name" ? sort.dir : null} onClick={() => toggleSort("name")} />
              <SortHeader
                label={nl ? "Personen" : "People"}
                active={sort?.key === "count" ? sort.dir : null}
                onClick={() => toggleSort("count")}
                align="right"
              />
              <th aria-hidden />
            </tr>
          </thead>
          <tbody>
            {filtered.map((role) => (
              <RoleRowView
                key={role.id}
                role={role}
                isOpen={isOpen(role.id)}
                onToggle={() => toggleRow(role.id)}
                nl={nl}
                can={can}
                allPermissions={allPermissions}
                allPosts={allPosts}
                year={year}
                yearLabel={yearLabel}
                locale={locale}
                saveLabels={saveLabels}
              />
            ))}
          </tbody>
        </table>
      </div>

      {filtered.length === 0 && (
        <p className="text-sm text-[#5c667f]">
          {query ? (nl ? "Geen rollen gevonden." : "No roles found.") : nl ? "Nog geen rollen." : "No roles yet."}
        </p>
      )}

      {createOpen && (
        <Modal title={nl ? "Nieuwe rol" : "New role"} onClose={() => setCreateOpen(false)}>
          <SaveForm
            action={saveRoleAction}
            className="grid grid-cols-1 gap-3 md:grid-cols-6 [&>button]:md:col-span-6 [&>button]:justify-self-start"
            {...saveLabels}
            onSuccess={() => setCreateOpen(false)}
          >
            <div className="md:col-span-3"><Label>{nl ? "Naam (NL)" : "Name (NL)"}</Label><Input name="nameNl" required /></div>
            <div className="md:col-span-3"><Label>{nl ? "Naam (EN)" : "Name (EN)"}</Label><Input name="nameEn" required /></div>
            <div className="md:col-span-4"><Label>{nl ? "Code" : "Code"}</Label><Input name="code" placeholder={nl ? "auto" : "auto"} /></div>
            <div className="md:col-span-2"><Label>{nl ? "Volgorde" : "Order"}</Label><Input name="order" type="number" defaultValue={0} /></div>
            <div className="md:col-span-3"><Label>{nl ? "Beschrijving (NL)" : "Description (NL)"}</Label><Input name="descriptionNl" /></div>
            <div className="md:col-span-3"><Label>{nl ? "Beschrijving (EN)" : "Description (EN)"}</Label><Input name="descriptionEn" /></div>
            <div className="md:col-span-2"><Label>{nl ? "Kleur (optioneel)" : "Color (optional)"}</Label><Input name="color" placeholder="#FFD23F" /></div>
          </SaveForm>
        </Modal>
      )}
    </div>
  );
}

function RoleRowView({
  role,
  isOpen,
  onToggle,
  nl,
  can,
  allPermissions,
  allPosts,
  year,
  yearLabel,
  locale,
  saveLabels,
}: {
  role: RoleRow;
  isOpen: boolean;
  onToggle: () => void;
  nl: boolean;
  can: { manageRoles: boolean; manageGroups: boolean };
  allPermissions: Perm[];
  allPosts: Post[];
  year: number;
  yearLabel: string;
  locale: "nl" | "en";
  saveLabels: SaveLabels;
}) {
  const detailId = `role-detail-${role.id}`;
  return (
    <>
      <tr
        role="button"
        tabIndex={0}
        aria-expanded={isOpen}
        aria-controls={detailId}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
        className="cursor-pointer"
      >
        <td>
          <div className="flex items-start gap-2">
            <Chevron open={isOpen} />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                {role.color && (
                  <span className="inline-block size-2.5 shrink-0 rounded-full" style={{ background: role.color }} aria-hidden />
                )}
                <span className="font-medium text-vtk-ink">{role.name}</span>
                <code className="rounded bg-vtk-blue-soft/60 px-1.5 py-0.5 text-[11px] text-[#5c667f]">{role.code}</code>
                {role.system && (
                  <span className="rounded-full border border-vtk-blue/20 px-2 py-0.5 text-[10px] text-[#5c667f]">
                    {nl ? "systeem" : "system"}
                  </span>
                )}
              </div>
              {role.description && <div className="mt-0.5 text-xs text-[#5c667f]">{role.description}</div>}
            </div>
          </div>
        </td>
        <td className="text-right tabular-nums">{role.holderCount}</td>
        <td className="text-right text-[#5c667f]">{isOpen ? (nl ? "Sluiten" : "Close") : nl ? "Details" : "Details"}</td>
      </tr>
      {isOpen && (
        <tr id={detailId}>
          <td colSpan={3} className="bg-vtk-blue-soft/20">
            <RoleDetail
              role={role}
              nl={nl}
              can={can}
              allPermissions={allPermissions}
              allPosts={allPosts}
              year={year}
              yearLabel={yearLabel}
              locale={locale}
              saveLabels={saveLabels}
            />
          </td>
        </tr>
      )}
    </>
  );
}

function RoleDetail({
  role,
  nl,
  can,
  allPermissions,
  allPosts,
  year,
  yearLabel,
  locale,
  saveLabels,
}: {
  role: RoleRow;
  nl: boolean;
  can: { manageRoles: boolean; manageGroups: boolean };
  allPermissions: Perm[];
  allPosts: Post[];
  year: number;
  yearLabel: string;
  locale: "nl" | "en";
  saveLabels: SaveLabels;
}) {
  const permsByCategory = useMemo(() => {
    const map = new Map<string, Perm[]>();
    for (const p of allPermissions) {
      const cat = p.category || "general";
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(p);
    }
    return [...map.entries()];
  }, [allPermissions]);

  const enabledPerms = useMemo(() => new Set(role.permissionIds), [role.permissionIds]);
  const permLabel = (id: string) => allPermissions.find((p) => p.id === id)?.label ?? id;
  const grants = useMemo(() => new Set(role.postGrants.map((g) => `${g.groupId}:${g.kind}`)), [role.postGrants]);

  return (
    <div className="space-y-4 py-1">
      <p className="text-xs text-[#5c667f]">
        {nl
          ? `Totaal ${role.holderCount} ${role.holderCount === 1 ? "persoon" : "personen"} in ${yearLabel}: rechtstreekse toewijzingen plus de leden van posten die deze rol toekennen.`
          : `${role.holderCount} ${role.holderCount === 1 ? "person" : "people"} in ${yearLabel}: direct assignments plus members of posts that grant this role.`}
      </p>

      {/* 1. Rechtstreekse toewijzingen */}
      <Panel
        title={nl ? "Rechtstreekse toewijzingen" : "Direct assignments"}
        count={role.directHolders.length}
        canEdit={can.manageRoles}
        editLabel={nl ? "Bewerken" : "Edit"}
        doneLabel={nl ? "Klaar" : "Done"}
      >
        {(editing) =>
          editing ? (
            <div className="space-y-2">
              {role.directHolders.length > 0 ? (
                <ul className="divide-y divide-vtk-blue/10">
                  {role.directHolders.map((m) => (
                    <li key={m.userId} className="flex items-center gap-3 py-2">
                      <Avatar name={m.name} avatarUrl={m.avatarUrl} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-vtk-ink">{m.name}</div>
                        <div className="truncate text-xs text-[#5c667f]">{m.email}</div>
                      </div>
                      <DeleteIconButton
                        action={removeUserRoleAction}
                        fields={{ userId: m.userId, roleId: role.id, year: String(year) }}
                        label={nl ? "Rol intrekken" : "Remove role"}
                        srLabel={`${nl ? "Rol intrekken" : "Remove role"}: ${m.name}`}
                        title={nl ? "Rol intrekken?" : "Remove role?"}
                        description={
                          nl
                            ? `${m.name} verliest de rol "${role.name}" voor ${yearLabel}. De historiek van andere jaren blijft.`
                            : `${m.name} loses the role "${role.name}" for ${yearLabel}. History of other years is kept.`
                        }
                        confirmLabel={nl ? "Intrekken" : "Remove"}
                        cancelLabel={nl ? "Annuleren" : "Cancel"}
                        successMessage={nl ? "Rol ingetrokken" : "Role removed"}
                      />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-[#5c667f]">{nl ? "Nog niemand rechtstreeks." : "Nobody directly yet."}</p>
              )}
              <AddRoleMemberForm roleId={role.id} locale={locale} />
            </div>
          ) : role.directHolders.length > 0 ? (
            <ul className="flex flex-wrap gap-2">
              {role.directHolders.map((m) => (
                <li key={m.userId} className="flex items-center gap-2 rounded-full border border-vtk-blue/12 bg-white py-1 pl-1 pr-3">
                  <Avatar name={m.name} avatarUrl={m.avatarUrl} sm />
                  <span className="text-sm text-vtk-ink">{m.name}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-[#5c667f]">{nl ? "Niemand rechtstreeks toegewezen." : "Nobody assigned directly."}</p>
          )
        }
      </Panel>

      {/* 2. Posten die deze rol toekennen */}
      <Panel
        title={nl ? "Posten die deze rol toekennen" : "Posts that grant this role"}
        count={role.postGrants.length}
        canEdit={can.manageGroups}
        editLabel={nl ? "Bewerken" : "Edit"}
        doneLabel={nl ? "Klaar" : "Done"}
      >
        {(editing) =>
          editing ? (
            <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-4 gap-y-1 text-sm">
              <span className="text-[11px] font-semibold uppercase text-zinc-500">{nl ? "Post" : "Post"}</span>
              <span className="text-[11px] font-semibold uppercase text-zinc-500">{nl ? "Elk lid" : "Every member"}</span>
              <span className="text-[11px] font-semibold uppercase text-zinc-500">{nl ? "Enkel lead" : "Lead only"}</span>
              {allPosts.map((post) => (
                <PostGrantRow
                  key={post.groupId}
                  post={post}
                  roleId={role.id}
                  roleName={role.name}
                  defaultOn={grants.has(`${post.groupId}:DEFAULT`)}
                  leaderOn={grants.has(`${post.groupId}:LEADER`)}
                  nl={nl}
                />
              ))}
              {allPosts.length === 0 && (
                <p className="col-span-3 text-sm text-[#5c667f]">{nl ? "Geen actieve posten." : "No active posts."}</p>
              )}
            </div>
          ) : role.postGrants.length > 0 ? (
            <ul className="flex flex-wrap gap-2">
              {role.postGrants.map((g) => (
                <li key={`${g.groupId}:${g.kind}`} className="rounded-full border border-vtk-blue/12 bg-white px-3 py-1 text-sm text-vtk-ink">
                  {g.name}
                  <span className="ml-1 text-xs text-[#5c667f]">
                    · {g.kind === "DEFAULT" ? (nl ? "elk lid" : "every member") : nl ? "enkel lead" : "lead only"}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-[#5c667f]">{nl ? "Geen enkele post kent deze rol toe." : "No post grants this role."}</p>
          )
        }
      </Panel>

      {/* 3. Rechten */}
      <Panel
        title={nl ? "Rechten" : "Permissions"}
        count={role.permissionIds.length}
        canEdit={can.manageRoles}
        editLabel={nl ? "Bewerken" : "Edit"}
        doneLabel={nl ? "Klaar" : "Done"}
      >
        {(editing) =>
          editing ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {permsByCategory.map(([cat, perms]) => (
                <div key={cat}>
                  <h5 className="mb-1 text-[11px] font-semibold uppercase text-zinc-500">{cat}</h5>
                  <ul className="space-y-1 text-sm">
                    {perms.map((p) => {
                      const on = enabledPerms.has(p.id);
                      return (
                        <li key={p.id}>
                          <form action={setRolePermissionAction}>
                            <input type="hidden" name="roleId" value={role.id} />
                            <input type="hidden" name="permissionId" value={p.id} />
                            <input type="hidden" name="enabled" value={on ? "0" : "1"} />
                            <label className="inline-flex cursor-pointer items-center gap-2">
                              <ToggleDot on={on} title={p.code} />
                              <span>{p.label}</span>
                            </label>
                          </form>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          ) : role.permissionIds.length > 0 ? (
            <ul className="flex flex-wrap gap-1.5">
              {role.permissionIds.map((id) => (
                <li key={id} className="rounded-full bg-vtk-blue-soft/60 px-2.5 py-0.5 text-xs text-vtk-ink">
                  {permLabel(id)}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-[#5c667f]">{nl ? "Geen rechten." : "No permissions."}</p>
          )
        }
      </Panel>

      {/* Rolinstellingen (naam/beschrijving/kleur + verwijderen) */}
      {can.manageRoles && (
        <details className="rounded-xl border border-vtk-blue/12 bg-white">
          <summary className="cursor-pointer px-4 py-2 text-sm font-medium text-vtk-ink">
            {nl ? "Rolinstellingen" : "Role settings"}
          </summary>
          <div className="space-y-4 p-4">
            <SaveForm
              action={saveRoleAction}
              className="grid grid-cols-1 gap-3 md:grid-cols-6 [&>button]:md:col-span-6 [&>button]:justify-self-start"
              {...saveLabels}
            >
              <input type="hidden" name="id" value={role.id} />
              <div className="md:col-span-3"><Label>{nl ? "Naam (NL)" : "Name (NL)"}</Label><Input name="nameNl" defaultValue={role.nameNl} required /></div>
              <div className="md:col-span-3"><Label>{nl ? "Naam (EN)" : "Name (EN)"}</Label><Input name="nameEn" defaultValue={role.nameEn} required /></div>
              <div className="md:col-span-2">
                <Label>{nl ? "Code" : "Code"}</Label>
                <Input name="code" defaultValue={role.code} disabled={role.system} />
              </div>
              <div className="md:col-span-2"><Label>{nl ? "Kleur (optioneel)" : "Color (optional)"}</Label><Input name="color" defaultValue={role.color ?? ""} placeholder="#FFD23F" /></div>
              <div className="md:col-span-4"><Label>{nl ? "Beschrijving (NL)" : "Description (NL)"}</Label><Textarea name="descriptionNl" defaultValue={role.descriptionNl} rows={2} /></div>
              <div className="md:col-span-6"><Label>{nl ? "Beschrijving (EN)" : "Description (EN)"}</Label><Textarea name="descriptionEn" defaultValue={role.descriptionEn} rows={2} /></div>
            </SaveForm>

            {role.system ? (
              <p className="text-xs text-[#5c667f]">
                {nl ? "Dit is een systeemrol en kan niet verwijderd worden." : "This is a system role and cannot be deleted."}
              </p>
            ) : (
              <DeleteButton
                action={deleteRoleAction}
                fields={{ id: role.id }}
                title={nl ? "Rol verwijderen?" : "Delete role?"}
                description={
                  nl
                    ? `De rol "${role.name}" wordt verwijderd. Rechtstreekse toewijzingen vervallen en posten die deze rol toekenden, doen dat niet meer.`
                    : `The role "${role.name}" will be deleted. Direct assignments are removed and posts that granted this role stop doing so.`
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
      )}
    </div>
  );
}

function PostGrantRow({
  post,
  roleId,
  roleName,
  defaultOn,
  leaderOn,
  nl,
}: {
  post: Post;
  roleId: string;
  roleName: string;
  defaultOn: boolean;
  leaderOn: boolean;
  nl: boolean;
}) {
  return (
    <>
      <div className="flex items-center gap-2">
        <span className="text-vtk-ink">{post.name}</span>
        <code className="rounded bg-vtk-blue-soft/60 px-1.5 py-0.5 text-[11px] text-[#5c667f]">{post.code}</code>
      </div>
      <GrantToggle post={post} roleId={roleId} roleName={roleName} kind="DEFAULT" on={defaultOn} nl={nl} />
      <GrantToggle post={post} roleId={roleId} roleName={roleName} kind="LEADER" on={leaderOn} nl={nl} />
    </>
  );
}

function GrantToggle({
  post,
  roleId,
  roleName,
  kind,
  on,
  nl,
}: {
  post: Post;
  roleId: string;
  roleName: string;
  kind: "DEFAULT" | "LEADER";
  on: boolean;
  nl: boolean;
}) {
  const which = kind === "DEFAULT" ? (nl ? "elk lid" : "every member") : nl ? "enkel de lead" : "lead only";
  return (
    <form action={setGroupRoleAction} className="justify-self-center">
      <input type="hidden" name="groupId" value={post.groupId} />
      <input type="hidden" name="roleId" value={roleId} />
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="enabled" value={on ? "0" : "1"} />
      <ToggleDot on={on} title={`${roleName} — ${post.name}: ${which}`} />
    </form>
  );
}
