"use client";

import { unsentGuard, UNSENT } from "@/components/ui/unsentGuard";
import { useMemo, useRef, useState, useTransition } from "react";
import { Input, Label } from "@vtk/ui";
import { SaveForm } from "@/components/ui/SaveForm";
import { MarkdownEditorField } from "@/components/editor/MarkdownEditor";
import {
  saveWerkgroepAction,
  saveJaarwerkingAction,
  saveWerkgroepInfoAction,
  reorderWerkgroepenAction,
  reorderJaarwerkingenAction,
  setWerkgroepRoleAction,
  setJaarwerkingRoleAction,
} from "@/app/actions/users-groups";
import { AddMemberForm } from "../groepen/AddMemberForm";
import { RemoveMemberButton } from "../groepen/RemoveMemberButton";
import { LEAD_LABEL_MAX, LEAD_LABEL_SUGGESTIONS } from "@/lib/werkgroepen";
import { WERKING_KINDS, type WerkingKind } from "@/lib/groupKinds";
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

export type WerkingRow = {
  id: string;
  code: string;
  name: string;
  nameNl: string;
  nameEn: string;
  /** Hoe de verantwoordelijke van deze groep heet, bv. G3 of G4. */
  leadLabel: string;
  descriptionNl: string;
  descriptionEn: string;
  website: string;
  orderInPraesidium: number;
  active: boolean;
  memberCount: number;
  members: Member[];
  roleGrants: GrantedRole[];
  /**
   * Wat deze gebruiker met de ledenlijst van het getoonde jaar mag: alles
   * (`werkgroepen.manage`, `jaarwerkingen.manage`), enkel gewone leden (`own`,
   * de verantwoordelijke met `*.manageOwnMembers`, enkel in het huidige
   * werkingsjaar) of niets.
   */
  memberEdit: "full" | "own" | "none";
  /** Voorbereide, lowercased zoekstring (naam, code, rollen, leden). */
  searchText: string;
};

/**
 * Wat er per soort anders heet op dit scherm. De rest (leden, rollen, de
 * titel van de verantwoordelijke) werkt voor werkgroepen en jaarwerkingen
 * hetzelfde.
 */
const COPY = {
  WERKGROEP: {
    nl: {
      one: "werkgroep",
      many: "werkgroepen",
      column: "Werkgroep",
      create: "Nieuwe werkgroep",
      search: "Zoek op naam, code, beschrijving of lid",
      searchLabel: "Werkgroepen zoeken",
      settings: "Werkgroepinstellingen",
      active: "Actief (een inactieve werkgroep verdwijnt van /werkgroepen; de historiek blijft)",
      leadHint: "Zo heet de verantwoordelijke van deze werkgroep, hier en op /werkgroepen. Meestal G3 of G4, maar een eigen naam kan ook.",
    },
    en: {
      one: "werkgroep",
      many: "workgroups",
      column: "Workgroup",
      create: "New workgroup",
      search: "Search by name, code, description or member",
      searchLabel: "Search workgroups",
      settings: "Werkgroep settings",
      active: "Active (an inactive werkgroep disappears from /werkgroepen; history is kept)",
      leadHint: "How this werkgroep's lead is named, here and on /werkgroepen. Usually G3 or G4, but any name works.",
    },
  },
  JAARWERKING: {
    nl: {
      one: "jaarwerking",
      many: "jaarwerkingen",
      column: "Jaarwerking",
      create: "Nieuwe jaarwerking",
      search: "Zoek op naam, code, rol of lid",
      searchLabel: "Jaarwerkingen zoeken",
      settings: "Instellingen van de jaarwerking",
      active: "Actief (zet uit voor een jaarwerking die niet meer georganiseerd wordt; de historiek blijft)",
      leadHint: "Zo heet de verantwoordelijke van deze jaarwerking in het ledenbeheer en in de rolkeuze.",
    },
    en: {
      one: "yearly event",
      many: "yearly events",
      column: "Yearly event",
      create: "New yearly event",
      search: "Search by name, code, role or member",
      searchLabel: "Search yearly events",
      settings: "Yearly event settings",
      active: "Active (turn off for a yearly event that is no longer organised; history is kept)",
      leadHint: "How this yearly event's lead is named in member management and the role picker.",
    },
  },
} as const;

type Copy = (typeof COPY)[WerkingKind]["nl" | "en"];

const ACTIONS = {
  WERKGROEP: { save: saveWerkgroepAction, reorder: reorderWerkgroepenAction, setRole: setWerkgroepRoleAction },
  JAARWERKING: { save: saveJaarwerkingAction, reorder: reorderJaarwerkingenAction, setRole: setJaarwerkingRoleAction },
} as const;

/** Wat het veld voorstelt; de groep mag ook iets anders intikken. */
const LEAD_SUGGESTIONS: Record<WerkingKind, readonly string[]> = {
  WERKGROEP: LEAD_LABEL_SUGGESTIONS,
  JAARWERKING: ["Verantwoordelijke", ...LEAD_LABEL_SUGGESTIONS],
};

/**
 * De titel van de verantwoordelijke: vrije tekst, met G3 en G4 als voorstel.
 * Het veld staat in twee formulieren (nieuwe werkgroep en de
 * werkgroepinstellingen) en meerdere rijen kunnen tegelijk openstaan, dus het
 * krijgt per formulier een eigen id, en zijn voorstellenlijst ook.
 */
function LeadLabelField({
  id,
  value,
  nl,
  copy,
  suggestions,
}: {
  id: string;
  value: string;
  nl: boolean;
  copy: Copy;
  suggestions: readonly string[];
}) {
  return (
    <div>
      <Label htmlFor={id}>{nl ? "Titel van de verantwoordelijke" : "Title of the lead"}</Label>
      <Input
        id={id}
        name="leadLabel"
        defaultValue={value}
        required
        maxLength={LEAD_LABEL_MAX}
        list={`${id}-suggestions`}
        autoComplete="off"
      />
      <datalist id={`${id}-suggestions`}>
        {suggestions.map((suggestion) => (
          <option key={suggestion} value={suggestion} />
        ))}
      </datalist>
      <p className="mt-1 text-xs text-[#5c667f]">{copy.leadHint}</p>
    </div>
  );
}

export type SaveLabels = {
  submitLabel: string;
  savingLabel: string;
  savedMessage: string;
  fallbackErrorMessage: string;
  errorMessages: Record<string, string>;
};

export function WerkingenTable({
  kind,
  rows: werkgroepen,
  allRoles,
  year,
  yearLabel,
  locale,
  canManage,
  saveLabels,
}: {
  kind: WerkingKind;
  rows: WerkingRow[];
  allRoles: RoleOption[];
  year: number;
  yearLabel: string;
  locale: "nl" | "en";
  canManage: boolean;
  saveLabels: SaveLabels;
}) {
  const nl = locale === "nl";
  const copy = COPY[kind][locale];
  const actions = ACTIONS[kind];
  const [prevWerkgroepen, setPrevWerkgroepen] = useState(werkgroepen);
  const [items, setItems] = useState<WerkingRow[]>(werkgroepen);
  const [createOpen, setCreateOpen] = useState(false);
  const [, startTransition] = useTransition();

  if (werkgroepen !== prevWerkgroepen) {
    setPrevWerkgroepen(werkgroepen);
    setItems(werkgroepen);
  }

  const { query, setQuery, sort, toggleSort, filtered, isOpen, toggleRow } = useTableControls(items, {
    searchOf: (r) => r.searchText,
    nameOf: (r) => r.name,
    countOf: (r) => r.memberCount,
    locale,
  });

  const dragFrom = useRef<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const isReorderable = canManage && !query && !sort;

  function onDrop(to: number) {
    const from = dragFrom.current;
    dragFrom.current = null;
    setOverIndex(null);
    if (from === null || from === to) return;
    const before = items;
    const next = [...items];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setItems(next);
    // Niet bewaard (`unsentGuard`): de oude volgorde terug. Een andere fout blijft
    // zoals voordien los van het scherm.
    startTransition(
      () =>
        void unsentGuard
          .run(() => actions.reorder(next.map((w) => w.id)))
          .then((result) => {
            if (result === UNSENT) setItems(before);
          }),
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar: zoeken + nieuwe groep (enkel beheerders) */}
      <div className="flex flex-wrap items-center gap-3">
        <SearchBar value={query} onChange={setQuery} placeholder={copy.search} ariaLabel={copy.searchLabel} />
        {canManage && (
          <button type="button" className="vtk-tile-btn vtk-tile-btn-primary" onClick={() => setCreateOpen(true)}>
            {copy.create}
          </button>
        )}
      </div>

      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th className="w-8" aria-hidden />
              <SortHeader label={copy.column} active={sort?.key === "name" ? sort.dir : null} onClick={() => toggleSort("name")} />
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
            {filtered.map((werkgroep, index) => (
              <WerkgroepRowView
                key={werkgroep.id}
                werkgroep={werkgroep}
                isReorderable={isReorderable}
                isOver={overIndex === index}
                onDragStart={() => { dragFrom.current = index; }}
                onDragEnd={() => { dragFrom.current = null; setOverIndex(null); }}
                onDragOver={(e) => {
                  if (!isReorderable) return;
                  e.preventDefault();
                  if (overIndex !== index) setOverIndex(index);
                }}
                onDrop={(e) => {
                  if (!isReorderable) return;
                  e.preventDefault();
                  onDrop(index);
                }}
                isOpen={isOpen(werkgroep.id)}
                onToggle={() => toggleRow(werkgroep.id)}
                nl={nl}
                kind={kind}
                copy={copy}
                allRoles={allRoles}
                year={year}
                yearLabel={yearLabel}
                locale={locale}
                canManage={canManage}
                saveLabels={saveLabels}
              />
            ))}
          </tbody>
        </table>
      </div>

      {filtered.length === 0 && (
        <p className="text-sm text-[#5c667f]">
          {query
            ? nl
              ? `Geen ${copy.many} gevonden.`
              : `No ${copy.many} found.`
            : nl
              ? `Nog geen ${copy.many}.`
              : `No ${copy.many} yet.`}
        </p>
      )}

      {createOpen && (
        <Modal title={copy.create} onClose={() => setCreateOpen(false)}>
          <SaveForm
            action={actions.save}
            className="grid grid-cols-1 gap-3 md:grid-cols-2 [&>button]:md:col-span-2 [&>button]:justify-self-start"
            {...saveLabels}
            onSuccess={() => setCreateOpen(false)}
          >
            <div><Label>{nl ? "Naam (NL)" : "Name (NL)"}</Label><Input name="nameNl" required /></div>
            <div><Label>{nl ? "Naam (EN)" : "Name (EN)"}</Label><Input name="nameEn" required /></div>
            <div><Label>{nl ? "Code" : "Code"}</Label><Input name="code" placeholder={nl ? "auto" : "auto"} /></div>
            <LeadLabelField
              id={`${kind.toLowerCase()}-new-lead-label`}
              value={WERKING_KINDS[kind].defaultLeadLabel}
              nl={nl}
              copy={copy}
              suggestions={LEAD_SUGGESTIONS[kind]}
            />
            <input type="hidden" name="active" value="on" />
          </SaveForm>
        </Modal>
      )}
    </div>
  );
}

function WerkgroepRowView({
  werkgroep,
  isReorderable,
  isOver,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  isOpen,
  onToggle,
  nl,
  kind,
  copy,
  allRoles,
  year,
  yearLabel,
  locale,
  canManage,
  saveLabels,
}: {
  werkgroep: WerkingRow;
  isReorderable: boolean;
  isOver: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  isOpen: boolean;
  onToggle: () => void;
  nl: boolean;
  kind: WerkingKind;
  copy: Copy;
  allRoles: RoleOption[];
  year: number;
  yearLabel: string;
  locale: "nl" | "en";
  canManage: boolean;
  saveLabels: SaveLabels;
}) {
  const detailId = `${kind.toLowerCase()}-detail-${werkgroep.id}`;
  return (
    <>
      <tr
        role="button"
        tabIndex={0}
        aria-expanded={isOpen}
        aria-controls={detailId}
        draggable={isReorderable}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
        className={`cursor-pointer transition-colors ${
          isOver ? "border-vtk-blue bg-vtk-yellow/20" : ""
        } ${werkgroep.active ? "" : " opacity-70"}`}
      >
        <td className="w-8 text-center text-zinc-400" onClick={(e) => isReorderable && e.stopPropagation()}>
          {isReorderable && (
            <span
              className="cursor-grab active:cursor-grabbing hover:text-vtk-ink text-base select-none px-1"
              title={nl ? "Sleep om volgorde te wijzigen" : "Drag to reorder"}
              aria-hidden="true"
            >
              ⠿
            </span>
          )}
        </td>
        <td>
          <div className="flex items-start gap-2">
            <Chevron open={isOpen} />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-vtk-ink">{werkgroep.name}</span>
                <code className="rounded bg-vtk-blue-soft/60 px-1.5 py-0.5 text-[11px] text-[#5c667f]">{werkgroep.code}</code>
                {!werkgroep.active && (
                  <span className="rounded-full border border-vtk-blue/20 px-2 py-0.5 text-[10px] text-[#5c667f]">
                    {nl ? "inactief" : "inactive"}
                  </span>
                )}
              </div>
            </div>
          </div>
        </td>
        <td className="text-right tabular-nums">{werkgroep.memberCount}</td>
        <td className="text-right text-[#5c667f]">{isOpen ? (nl ? "Sluiten" : "Close") : nl ? "Details" : "Details"}</td>
      </tr>
      {isOpen && (
        <tr id={detailId}>
          <td colSpan={4} className="bg-vtk-blue-soft/20">
            <WerkgroepDetail
              werkgroep={werkgroep}
              nl={nl}
              kind={kind}
              copy={copy}
              allRoles={allRoles}
              year={year}
              yearLabel={yearLabel}
              locale={locale}
              canManage={canManage}
              saveLabels={saveLabels}
            />
          </td>
        </tr>
      )}
    </>
  );
}

function WerkgroepDetail({
  werkgroep,
  nl,
  kind,
  copy,
  allRoles,
  year,
  yearLabel,
  locale,
  canManage,
  saveLabels,
}: {
  werkgroep: WerkingRow;
  nl: boolean;
  kind: WerkingKind;
  copy: Copy;
  allRoles: RoleOption[];
  year: number;
  yearLabel: string;
  locale: "nl" | "en";
  canManage: boolean;
  saveLabels: SaveLabels;
}) {
  const actions = ACTIONS[kind];
  const grants = useMemo(() => new Set(werkgroep.roleGrants.map((g) => `${g.roleId}:${g.kind}`)), [werkgroep.roleGrants]);
  // De verantwoordelijke heet zoals de groep het kiest (bij een werkgroep
  // meestal G3 of G4); dat staat in de instellingen van de groep.
  const roleLabel = (m: Member) => (m.role === "LEAD" ? werkgroep.leadLabel : nl ? "Lid" : "Member");

  return (
    <div className="space-y-4 py-1">
      {/* Infotekst + website: elk lid van de werkgroep mag dit aanpassen. Enkel
          voor een soort met een publieke pagina; een jaarwerking heeft er geen. */}
      {WERKING_KINDS[kind].publicPath && (
        <section className="rounded-xl border border-vtk-blue/12 bg-white p-4">
          <h4 className="mb-1 text-sm font-semibold text-vtk-ink">{nl ? "Infotekst & website" : "Info text & website"}</h4>
          <p className="mb-3 text-xs text-[#5c667f]">
            {nl
              ? "Deze tekst en link verschijnen op de publieke /werkgroepen-pagina."
              : "This text and link appear on the public /werkgroepen page."}
          </p>
          <SaveForm
            action={saveWerkgroepInfoAction}
            className="grid grid-cols-1 gap-3 md:grid-cols-2 [&>button]:md:col-span-2 [&>button]:justify-self-start"
            {...saveLabels}
          >
            <input type="hidden" name="id" value={werkgroep.id} />
            <div className="md:col-span-2">
              <Label htmlFor={`werkgroep-${werkgroep.id}-description-nl`}>
                {nl ? "Infotekst (NL)" : "Info text (NL)"}
              </Label>
              <MarkdownEditorField
                name="descriptionNl"
                defaultValue={werkgroep.descriptionNl}
                locale={locale}
                rows={8}
                textareaId={`werkgroep-${werkgroep.id}-description-nl`}
              />
            </div>
            <div className="md:col-span-2">
              <Label htmlFor={`werkgroep-${werkgroep.id}-description-en`}>
                {nl ? "Infotekst (EN)" : "Info text (EN)"}
              </Label>
              <MarkdownEditorField
                name="descriptionEn"
                defaultValue={werkgroep.descriptionEn}
                locale={locale}
                rows={8}
                textareaId={`werkgroep-${werkgroep.id}-description-en`}
              />
            </div>
            <div className="md:col-span-2"><Label>Website</Label><Input name="website" defaultValue={werkgroep.website} placeholder="https://best.vtk.be" /></div>
          </SaveForm>
        </section>
      )}

      {/* Leden (geselecteerd werkingsjaar) */}
      <Panel
        title={nl ? `Leden (${yearLabel})` : `Members (${yearLabel})`}
        count={werkgroep.members.length}
        canEdit={werkgroep.memberEdit !== "none"}
        editLabel={nl ? "Bewerken" : "Edit"}
        doneLabel={nl ? "Klaar" : "Done"}
      >
        {(editing) =>
          editing ? (
            <div className="space-y-2">
              {werkgroep.memberEdit === "own" && (
                <p className="text-xs text-[#5c667f]">
                  {nl
                    ? `Je kan gewone leden toevoegen en verwijderen. Een ${werkgroep.leadLabel} aanduiden of verwijderen vraag je aan IT.`
                    : `You can add and remove members. Ask IT to appoint or remove a ${werkgroep.leadLabel}.`}
                </p>
              )}
              {werkgroep.members.length > 0 ? (
                <ul className="divide-y divide-vtk-blue/10">
                  {werkgroep.members.map((m) => (
                    <li key={m.membershipId} className="flex items-center gap-3 py-2">
                      <Avatar name={m.name} avatarUrl={m.avatarUrl} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-vtk-ink">{m.name}</div>
                        <div className="truncate text-xs text-[#5c667f]">
                          {roleLabel(m)}
                          {m.title ? ` · ${m.title}` : ""}
                        </div>
                      </div>
                      {(werkgroep.memberEdit === "full" || m.role === "MEMBER") && (
                        <RemoveMemberButton
                          membershipId={m.membershipId}
                          userId={m.userId}
                          memberName={m.name}
                          groupName={werkgroep.name}
                          yearLabel={yearLabel}
                          locale={locale}
                        />
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-[#5c667f]">{nl ? "Nog geen leden voor dit jaar." : "No members for this year yet."}</p>
              )}
              <AddMemberForm
                groupId={werkgroep.id}
                year={year}
                locale={locale}
                leadLabel={werkgroep.leadLabel}
                allowLead={werkgroep.memberEdit === "full"}
              />
            </div>
          ) : werkgroep.members.length > 0 ? (
            <ul className="flex flex-wrap gap-2">
              {werkgroep.members.map((m) => (
                <li key={m.membershipId} className="flex items-center gap-2 rounded-full border border-vtk-blue/12 bg-white py-1 pl-1 pr-3">
                  <Avatar name={m.name} avatarUrl={m.avatarUrl} sm />
                  <span className="text-sm text-vtk-ink">{m.name}</span>
                  {m.role === "LEAD" && (
                    <span className="rounded-full bg-vtk-yellow/70 px-1.5 py-0.5 text-[10px] font-semibold text-vtk-ink">
                      {werkgroep.leadLabel}
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

      {/* Rollen + instellingen: enkel voor beheerders. */}
      {canManage && (
        <>
          <Panel
            title={nl ? `Rollen die deze ${copy.one} toekent` : `Roles this ${copy.one} grants`}
            count={werkgroep.roleGrants.length}
            canEdit
            editLabel={nl ? "Bewerken" : "Edit"}
            doneLabel={nl ? "Klaar" : "Done"}
          >
            {(editing) =>
              editing ? (
                <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-4 gap-y-1 text-sm">
                  <span className="text-[11px] font-semibold uppercase text-zinc-500">{nl ? "Rol" : "Role"}</span>
                  <span className="text-[11px] font-semibold uppercase text-zinc-500">{nl ? "Elk lid" : "Every member"}</span>
                  <span className="text-[11px] font-semibold uppercase text-zinc-500">
                    {nl ? `Enkel ${werkgroep.leadLabel}` : `${werkgroep.leadLabel} only`}
                  </span>
                  {allRoles.map((role) => (
                    <RoleGrantRow
                      key={role.roleId}
                      role={role}
                      groupId={werkgroep.id}
                      werkgroepName={werkgroep.name}
                      leadLabel={werkgroep.leadLabel}
                      setRole={actions.setRole}
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
              ) : werkgroep.roleGrants.length > 0 ? (
                <ul className="flex flex-wrap gap-2">
                  {werkgroep.roleGrants.map((g) => (
                    <li key={`${g.roleId}:${g.kind}`} className="rounded-full border border-vtk-blue/12 bg-white px-3 py-1 text-sm text-vtk-ink">
                      {g.name}
                      <span className="ml-1 text-xs text-[#5c667f]">
                        ·{" "}
                        {g.kind === "DEFAULT"
                          ? nl
                            ? "elk lid"
                            : "every member"
                          : nl
                            ? `enkel ${werkgroep.leadLabel}`
                            : `${werkgroep.leadLabel} only`}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-[#5c667f]">
                  {nl ? `Deze ${copy.one} kent geen rollen toe.` : `This ${copy.one} grants no roles.`}
                </p>
              )
            }
          </Panel>

          <details className="rounded-xl border border-vtk-blue/12 bg-white">
            <summary className="cursor-pointer px-4 py-2 text-sm font-medium text-vtk-ink">
              {copy.settings}
            </summary>
            <div className="space-y-4 p-4">
              <SaveForm
                action={actions.save}
                className="grid grid-cols-1 gap-3 md:grid-cols-2 [&>button]:md:col-span-2 [&>button]:justify-self-start"
                {...saveLabels}
              >
                <input type="hidden" name="id" value={werkgroep.id} />
                <div><Label>{nl ? "Naam (NL)" : "Name (NL)"}</Label><Input name="nameNl" defaultValue={werkgroep.nameNl} required /></div>
                <div><Label>{nl ? "Naam (EN)" : "Name (EN)"}</Label><Input name="nameEn" defaultValue={werkgroep.nameEn} required /></div>
                <LeadLabelField
                  id={`${kind.toLowerCase()}-${werkgroep.id}-lead-label`}
                  value={werkgroep.leadLabel}
                  nl={nl}
                  copy={copy}
                  suggestions={LEAD_SUGGESTIONS[kind]}
                />
                <label className="md:col-span-2 inline-flex items-center gap-2 text-sm text-vtk-ink">
                  <input type="checkbox" name="active" defaultChecked={werkgroep.active} className="size-4 rounded border-zinc-400" />
                  {copy.active}
                </label>
              </SaveForm>
            </div>
          </details>
        </>
      )}
    </div>
  );
}

type SetRoleAction = (formData: FormData) => Promise<void>;

function RoleGrantRow({
  role,
  groupId,
  werkgroepName,
  leadLabel,
  setRole,
  defaultOn,
  leaderOn,
  nl,
}: {
  role: RoleOption;
  groupId: string;
  werkgroepName: string;
  leadLabel: string;
  setRole: SetRoleAction;
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
      <GrantToggle role={role} groupId={groupId} werkgroepName={werkgroepName} leadLabel={leadLabel} setRole={setRole} kind="DEFAULT" on={defaultOn} nl={nl} />
      <GrantToggle role={role} groupId={groupId} werkgroepName={werkgroepName} leadLabel={leadLabel} setRole={setRole} kind="LEADER" on={leaderOn} nl={nl} />
    </>
  );
}

function GrantToggle({
  role,
  groupId,
  werkgroepName,
  leadLabel,
  setRole,
  kind,
  on,
  nl,
}: {
  role: RoleOption;
  groupId: string;
  werkgroepName: string;
  leadLabel: string;
  setRole: SetRoleAction;
  kind: "DEFAULT" | "LEADER";
  on: boolean;
  nl: boolean;
}) {
  const which =
    kind === "DEFAULT"
      ? nl
        ? "elk lid"
        : "every member"
      : nl
        ? `enkel de ${leadLabel}`
        : `${leadLabel} only`;
  return (
    <form action={unsentGuard.form(setRole)} className="justify-self-center">
      <input type="hidden" name="groupId" value={groupId} />
      <input type="hidden" name="roleId" value={role.roleId} />
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="enabled" value={on ? "0" : "1"} />
      <ToggleDot on={on} title={`${werkgroepName}, ${role.name}: ${which}`} />
    </form>
  );
}
