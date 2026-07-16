"use client";

import { useMemo, useState } from "react";
import { Input, Label, Textarea } from "@vtk/ui";
import { SaveForm } from "@/components/ui/SaveForm";
import { saveGroupAction, setGroupRoleAction } from "@/app/actions/users-groups";
import { AddMemberForm } from "./AddMemberForm";
import { RemoveMemberButton } from "./RemoveMemberButton";
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

// ---- Data shapes (serialiseerbaar; server component vult ze) ----------------

export type Member = {
  membershipId: string;
  userId: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  role: "MEMBER" | "LEAD";
  title: string | null;
};
export type GrantedRole = { roleId: string; code: string; name: string; kind: "DEFAULT" | "LEADER" };
export type RoleOption = { roleId: string; code: string; name: string };

export type PostRow = {
  id: string;
  code: string;
  name: string;
  nameNl: string;
  nameEn: string;
  description: string | null;
  descriptionNl: string;
  descriptionEn: string;
  orderInPraesidium: number;
  active: boolean;
  memberCount: number;
  members: Member[];
  roleGrants: GrantedRole[];
  /** Voorbereide, lowercased zoekstring (naam, code, beschrijving, rollen, leden). */
  searchText: string;
};

export type SaveLabels = {
  submitLabel: string;
  savingLabel: string;
  savedMessage: string;
  fallbackErrorMessage: string;
  errorMessages: Record<string, string>;
};

export function PostsTable({
  posts,
  allRoles,
  year,
  yearLabel,
  locale,
  saveLabels,
}: {
  posts: PostRow[];
  allRoles: RoleOption[];
  year: number;
  yearLabel: string;
  locale: "nl" | "en";
  saveLabels: SaveLabels;
}) {
  const nl = locale === "nl";
  const [createOpen, setCreateOpen] = useState(false);
  const { query, setQuery, sort, toggleSort, filtered, isOpen, toggleRow } = useTableControls(posts, {
    searchOf: (r) => r.searchText,
    nameOf: (r) => r.name,
    countOf: (r) => r.memberCount,
    locale,
  });

  return (
    <div className="space-y-4">
      {/* Toolbar: zoeken + nieuwe post */}
      <div className="flex flex-wrap items-center gap-3">
        <SearchBar
          value={query}
          onChange={setQuery}
          placeholder={nl ? "Zoek op naam, rol of lid" : "Search by name, role or member"}
          ariaLabel={nl ? "Posten zoeken" : "Search posts"}
        />
        <button type="button" className="vtk-tile-btn vtk-tile-btn-primary" onClick={() => setCreateOpen(true)}>
          {nl ? "Nieuwe post" : "New post"}
        </button>
      </div>

      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr>
              <SortHeader label={nl ? "Post" : "Post"} active={sort?.key === "name" ? sort.dir : null} onClick={() => toggleSort("name")} />
              <SortHeader
                label={nl ? "Leden" : "Members"}
                active={sort?.key === "count" ? sort.dir : null}
                onClick={() => toggleSort("count")}
                align="right"
              />
              <th aria-hidden />
            </tr>
          </thead>
          <tbody>
            {filtered.map((post) => (
              <PostRowView
                key={post.id}
                post={post}
                isOpen={isOpen(post.id)}
                onToggle={() => toggleRow(post.id)}
                nl={nl}
                allRoles={allRoles}
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
          {query ? (nl ? "Geen posten gevonden." : "No posts found.") : nl ? "Nog geen posten." : "No posts yet."}
        </p>
      )}

      {createOpen && (
        <Modal title={nl ? "Nieuwe post" : "New post"} onClose={() => setCreateOpen(false)}>
          <SaveForm
            action={saveGroupAction}
            className="grid grid-cols-1 gap-3 md:grid-cols-6 [&>button]:md:col-span-6 [&>button]:justify-self-start"
            {...saveLabels}
            onSuccess={() => setCreateOpen(false)}
          >
            <div className="md:col-span-3"><Label>{nl ? "Naam (NL)" : "Name (NL)"}</Label><Input name="nameNl" required /></div>
            <div className="md:col-span-3"><Label>{nl ? "Naam (EN)" : "Name (EN)"}</Label><Input name="nameEn" required /></div>
            <div className="md:col-span-4"><Label>{nl ? "Code" : "Code"}</Label><Input name="code" placeholder={nl ? "auto" : "auto"} /></div>
            <div className="md:col-span-2"><Label>{nl ? "Volgorde" : "Order"}</Label><Input name="orderInPraesidium" type="number" defaultValue={0} /></div>
            <input type="hidden" name="active" value="on" />
          </SaveForm>
        </Modal>
      )}
    </div>
  );
}

function PostRowView({
  post,
  isOpen,
  onToggle,
  nl,
  allRoles,
  year,
  yearLabel,
  locale,
  saveLabels,
}: {
  post: PostRow;
  isOpen: boolean;
  onToggle: () => void;
  nl: boolean;
  allRoles: RoleOption[];
  year: number;
  yearLabel: string;
  locale: "nl" | "en";
  saveLabels: SaveLabels;
}) {
  const detailId = `post-detail-${post.id}`;
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
        className={"cursor-pointer" + (post.active ? "" : " opacity-70")}
      >
        <td>
          <div className="flex items-start gap-2">
            <Chevron open={isOpen} />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-vtk-ink">{post.name}</span>
                <code className="rounded bg-vtk-blue-soft/60 px-1.5 py-0.5 text-[11px] text-[#5c667f]">{post.code}</code>
                {!post.active && (
                  <span className="rounded-full border border-vtk-blue/20 px-2 py-0.5 text-[10px] text-[#5c667f]">
                    {nl ? "inactief" : "inactive"}
                  </span>
                )}
              </div>
              {post.description && <div className="mt-0.5 text-xs text-[#5c667f]">{post.description}</div>}
            </div>
          </div>
        </td>
        <td className="text-right tabular-nums">{post.memberCount}</td>
        <td className="text-right text-[#5c667f]">{isOpen ? (nl ? "Sluiten" : "Close") : nl ? "Details" : "Details"}</td>
      </tr>
      {isOpen && (
        <tr id={detailId}>
          <td colSpan={3} className="bg-vtk-blue-soft/20">
            <PostDetail
              post={post}
              nl={nl}
              allRoles={allRoles}
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

function PostDetail({
  post,
  nl,
  allRoles,
  year,
  yearLabel,
  locale,
  saveLabels,
}: {
  post: PostRow;
  nl: boolean;
  allRoles: RoleOption[];
  year: number;
  yearLabel: string;
  locale: "nl" | "en";
  saveLabels: SaveLabels;
}) {
  const grants = useMemo(() => new Set(post.roleGrants.map((g) => `${g.roleId}:${g.kind}`)), [post.roleGrants]);
  const roleLabel = (m: Member) =>
    m.role === "LEAD" ? (nl ? "Verantwoordelijke" : "Lead") : nl ? "Lid" : "Member";

  return (
    <div className="space-y-4 py-1">
      {/* 1. Leden (geselecteerd werkingsjaar) */}
      <Panel
        title={nl ? `Leden (${yearLabel})` : `Members (${yearLabel})`}
        count={post.members.length}
        canEdit
        editLabel={nl ? "Bewerken" : "Edit"}
        doneLabel={nl ? "Klaar" : "Done"}
      >
        {(editing) =>
          editing ? (
            <div className="space-y-2">
              {post.members.length > 0 ? (
                <ul className="divide-y divide-vtk-blue/10">
                  {post.members.map((m) => (
                    <li key={m.membershipId} className="flex items-center gap-3 py-2">
                      <Avatar name={m.name} avatarUrl={m.avatarUrl} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-vtk-ink">{m.name}</div>
                        <div className="truncate text-xs text-[#5c667f]">
                          {roleLabel(m)}
                          {m.title ? ` · ${m.title}` : ""}
                        </div>
                      </div>
                      <RemoveMemberButton
                        membershipId={m.membershipId}
                        userId={m.userId}
                        memberName={m.name}
                        groupName={post.name}
                        yearLabel={yearLabel}
                        locale={locale}
                      />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-[#5c667f]">{nl ? "Nog geen leden voor dit jaar." : "No members for this year yet."}</p>
              )}
              <AddMemberForm groupId={post.id} year={year} locale={locale} />
            </div>
          ) : post.members.length > 0 ? (
            <ul className="flex flex-wrap gap-2">
              {post.members.map((m) => (
                <li key={m.membershipId} className="flex items-center gap-2 rounded-full border border-vtk-blue/12 bg-white py-1 pl-1 pr-3">
                  <Avatar name={m.name} avatarUrl={m.avatarUrl} sm />
                  <span className="text-sm text-vtk-ink">{m.name}</span>
                  {m.role === "LEAD" && (
                    <span className="rounded-full bg-vtk-yellow/70 px-1.5 py-0.5 text-[10px] font-semibold text-vtk-ink">
                      {nl ? "lead" : "lead"}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-[#5c667f]">{nl ? "Nog geen leden voor dit jaar." : "No members for this year yet."}</p>
          )
        }
      </Panel>

      {/* 2. Rollen die deze post toekent */}
      <Panel
        title={nl ? "Rollen die deze post toekent" : "Roles this post grants"}
        count={post.roleGrants.length}
        canEdit
        editLabel={nl ? "Bewerken" : "Edit"}
        doneLabel={nl ? "Klaar" : "Done"}
      >
        {(editing) =>
          editing ? (
            <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-4 gap-y-1 text-sm">
              <span className="text-[11px] font-semibold uppercase text-zinc-500">{nl ? "Rol" : "Role"}</span>
              <span className="text-[11px] font-semibold uppercase text-zinc-500">{nl ? "Elk lid" : "Every member"}</span>
              <span className="text-[11px] font-semibold uppercase text-zinc-500">{nl ? "Enkel lead" : "Lead only"}</span>
              {allRoles.map((role) => (
                <RoleGrantRow
                  key={role.roleId}
                  role={role}
                  groupId={post.id}
                  postName={post.name}
                  defaultOn={grants.has(`${role.roleId}:DEFAULT`)}
                  leaderOn={grants.has(`${role.roleId}:LEADER`)}
                  nl={nl}
                />
              ))}
              {allRoles.length === 0 && (
                <p className="col-span-3 text-sm text-[#5c667f]">
                  {nl ? "Nog geen rollen. Maak er eerst aan bij Rollen." : "No roles yet. Create some under Roles first."}
                </p>
              )}
            </div>
          ) : post.roleGrants.length > 0 ? (
            <ul className="flex flex-wrap gap-2">
              {post.roleGrants.map((g) => (
                <li key={`${g.roleId}:${g.kind}`} className="rounded-full border border-vtk-blue/12 bg-white px-3 py-1 text-sm text-vtk-ink">
                  {g.name}
                  <span className="ml-1 text-xs text-[#5c667f]">
                    · {g.kind === "DEFAULT" ? (nl ? "elk lid" : "every member") : nl ? "enkel lead" : "lead only"}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-[#5c667f]">{nl ? "Deze post kent geen rollen toe." : "This post grants no roles."}</p>
          )
        }
      </Panel>

      {/* Postinstellingen (naam/beschrijving/volgorde/actief) */}
      <details className="rounded-xl border border-vtk-blue/12 bg-white">
        <summary className="cursor-pointer px-4 py-2 text-sm font-medium text-vtk-ink">
          {nl ? "Postinstellingen" : "Post settings"}
        </summary>
        <div className="space-y-4 p-4">
          <SaveForm
            action={saveGroupAction}
            className="grid grid-cols-1 gap-3 md:grid-cols-5 [&>button]:md:col-span-5 [&>button]:justify-self-start"
            {...saveLabels}
          >
            <input type="hidden" name="id" value={post.id} />
            <div className="md:col-span-2"><Label>{nl ? "Naam (NL)" : "Name (NL)"}</Label><Input name="nameNl" defaultValue={post.nameNl} required /></div>
            <div className="md:col-span-2"><Label>{nl ? "Naam (EN)" : "Name (EN)"}</Label><Input name="nameEn" defaultValue={post.nameEn} required /></div>
            <div><Label>{nl ? "Volgorde" : "Order"}</Label><Input name="orderInPraesidium" type="number" defaultValue={post.orderInPraesidium} /></div>
            <div className="md:col-span-5"><Label>{nl ? "Beschrijving (NL)" : "Description (NL)"}</Label><Textarea name="descriptionNl" defaultValue={post.descriptionNl} rows={2} /></div>
            <div className="md:col-span-5"><Label>{nl ? "Beschrijving (EN)" : "Description (EN)"}</Label><Textarea name="descriptionEn" defaultValue={post.descriptionEn} rows={2} /></div>
            <label className="md:col-span-5 inline-flex items-center gap-2 text-sm text-vtk-ink">
              <input type="checkbox" name="active" defaultChecked={post.active} className="size-4 rounded border-zinc-400" />
              {nl
                ? "Actief (een inactieve post verdwijnt uit de shift-keuzes; de historiek blijft)"
                : "Active (an inactive post disappears from the shift choices; history is kept)"}
            </label>
          </SaveForm>
        </div>
      </details>
    </div>
  );
}

function RoleGrantRow({
  role,
  groupId,
  postName,
  defaultOn,
  leaderOn,
  nl,
}: {
  role: RoleOption;
  groupId: string;
  postName: string;
  defaultOn: boolean;
  leaderOn: boolean;
  nl: boolean;
}) {
  return (
    <>
      <div className="flex items-center gap-2">
        <span className="text-vtk-ink">{role.name}</span>
        <code className="rounded bg-vtk-blue-soft/60 px-1.5 py-0.5 text-[11px] text-[#5c667f]">{role.code}</code>
      </div>
      <GrantToggle role={role} groupId={groupId} postName={postName} kind="DEFAULT" on={defaultOn} nl={nl} />
      <GrantToggle role={role} groupId={groupId} postName={postName} kind="LEADER" on={leaderOn} nl={nl} />
    </>
  );
}

function GrantToggle({
  role,
  groupId,
  postName,
  kind,
  on,
  nl,
}: {
  role: RoleOption;
  groupId: string;
  postName: string;
  kind: "DEFAULT" | "LEADER";
  on: boolean;
  nl: boolean;
}) {
  const which = kind === "DEFAULT" ? (nl ? "elk lid" : "every member") : nl ? "enkel de lead" : "lead only";
  return (
    <form action={setGroupRoleAction} className="justify-self-center">
      <input type="hidden" name="groupId" value={groupId} />
      <input type="hidden" name="roleId" value={role.roleId} />
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="enabled" value={on ? "0" : "1"} />
      <ToggleDot on={on} title={`${postName} — ${role.name}: ${which}`} />
    </form>
  );
}
