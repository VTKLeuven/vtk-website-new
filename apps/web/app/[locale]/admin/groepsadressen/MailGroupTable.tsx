"use client";

import { Fragment, useEffect, useState, useTransition } from "react";
import { ChevronDown } from "lucide-react";
import Link from "@/components/ui/Link";
import { Button, ConfirmDialog } from "@vtk/ui";
import { LinkedRow } from "@/components/ui/LinkedRow";
import { SearchPicker, type SearchPickerOption } from "@/components/admin/SearchPicker";
import { useToast } from "@/components/ui/toast";
import { UNSENT, useUnsentGuard } from "@/components/ui/unsentGuard";
import type { SaveState } from "@/lib/saveState";
import { MAX_DELETE_PER_CLICK } from "@/lib/google/kinds";
import { GroupMembers } from "./GroupMembers";
import {
  assignCategoryAction,
  deleteFromGoogleAction,
} from "./bulkActions";

export type MailGroupRow = {
  id: string;
  categoryId: string | null;
  email: string;
  name: string;
  category: string | null;
  summary: string;
  owner: string | null;
  archived: boolean;
  enabled: boolean;
  memberCount: number;
  unlinked: number;
  /** Leden die nu een post hebben of hun studie dit jaar bevestigden. */
  active: number;
  /** Het jongste jaar waarin nog iemand actief was, als "22-23"; enkel bij nul actief. */
  lastYear: string | null;
  /** Adressen die de site niet kent (geen lid, geen groep van de kring). */
  unknown: number;
  /** De groep heet naar dit of volgend werkingsjaar (`sport_2627`). */
  thisYear: boolean;
  /** Uit de nakijkmodus. */
  decision: "KEEP" | "DELETE" | null;
  lastSync: string;
  notInGoogle: boolean;
  lastError: string | null;
};

const NO_CATEGORY = "__none__";

/**
 * Een categorie als uitklapbaar blok in de tabel ("Alle" zonder filter), met
 * haar subcategorieën eronder. `rowIds` zijn de rijen rechtstreeks erin.
 */
export type TableSection = {
  key: string;
  label: string;
  rowIds: string[];
  children: { key: string; label: string; rowIds: string[] }[];
};

/**
 * Het overzicht van de groepsadressen. Wie `mailgroups.manage` heeft, vinkt
 * aan en zet in bulk in een categorie of verwijdert uit Google; een klik op
 * "nog actief" toont wie erin zit zonder de lijst te verlaten.
 */
export function MailGroupTable({
  nl,
  base,
  manageAll,
  rows,
  sections,
  sectionsOpen,
  categoryOptions,
}: {
  nl: boolean;
  base: string;
  manageAll: boolean;
  rows: MailGroupRow[];
  /** `null`: één platte lijst (een categorie gekozen). */
  sections: TableSection[] | null;
  /** Open bij een zoekterm of filter: dan wil je zien wat er gevonden is. */
  sectionsOpen: boolean;
  categoryOptions: SearchPickerOption[];
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [category, setCategory] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [peek, setPeek] = useState<MailGroupRow | null>(null);
  const [pending, startTransition] = useTransition();
  const showToast = useToast();
  const unsent = useUnsentGuard();

  // Enkel wat nu in beeld staat, telt: een vinkje op een rij die door een
  // andere filter of een verwijdering verdween, verwijdert niets dat je niet ziet.
  const chosen = rows.filter((r) => selected.has(r.id));

  const allChecked = rows.length > 0 && chosen.length === rows.length;
  const byId = new Map(rows.map((r) => [r.id, r]));

  const [openSections, setOpenSections] = useState<Set<string>>(() =>
    sectionsOpen && sections ? new Set(sections.flatMap((s) => [s.key, ...s.children.map((c) => c.key)])) : new Set(),
  );
  const toggleSection = (key: string) =>
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  // De rijen in de volgorde waarin ze op het scherm staan; enkel wat open is.
  // Daarop werkt shift-klik: alles tussen de vorige klik en deze.
  const ordered: string[] = sections
    ? sections.flatMap((s) =>
        openSections.has(s.key)
          ? [...s.rowIds, ...s.children.flatMap((c) => (openSections.has(c.key) ? c.rowIds : []))]
          : [],
      )
    : rows.map((r) => r.id);
  const [anchor, setAnchor] = useState<string | null>(null);

  /** Klik op een vinkje of met Ctrl/Cmd op een rij: één rij; met shift: een reeks. */
  function pick(id: string, event: { shiftKey: boolean }) {
    const from = anchor ? ordered.indexOf(anchor) : -1;
    const to = ordered.indexOf(id);
    if (event.shiftKey && from >= 0 && to >= 0) {
      const [a, b] = from < to ? [from, to] : [to, from];
      const range = ordered.slice(a, b + 1);
      // Zoals in een bestandsbeheerder: de reeks krijgt de stand van het anker.
      const on = selected.has(anchor as string);
      setSelected((prev) => {
        const next = new Set(prev);
        for (const r of range) {
          if (on) next.add(r);
          else next.delete(r);
        }
        return next;
      });
      return;
    }
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setAnchor(id);
  }

  function setMany(ids: string[], on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  function report(result: SaveState, fallback: string) {
    if (result.status === "error") {
      const messages: Record<string, string> = nl
        ? {
            NOTHING_SELECTED: "Niets aangevinkt.",
            NOT_CONFIGURED: "Google Workspace is nog niet ingesteld (Admin > IT); er is niets verwijderd.",
            TOO_MANY: `Hoogstens ${MAX_DELETE_PER_CLICK} groepen per keer; vink er minder aan.`,
            INVALID_INPUT: "Die categorie bestaat niet meer. Herlaad de pagina.",
          }
        : {
            NOTHING_SELECTED: "Nothing selected.",
            NOT_CONFIGURED: "Google Workspace is not set up yet (Admin > IT); nothing was deleted.",
            TOO_MANY: `At most ${MAX_DELETE_PER_CLICK} groups at once; select fewer.`,
            INVALID_INPUT: "That category no longer exists. Reload the page.",
          };
      showToast({
        message: messages[result.code] ?? result.detail ?? fallback,
        variant: "error",
        duration: 0,
      });
      return false;
    }
    if (result.status === "success" && result.detail) {
      showToast({ message: result.detail, variant: "success" });
    }
    return true;
  }

  function assign() {
    const form = new FormData();
    for (const row of chosen) form.append("id", row.id);
    form.append("categoryId", category === NO_CATEGORY ? "" : category);
    startTransition(async () => {
      const result = await unsent.run(() => assignCategoryAction(form));
      if (result === UNSENT) return;
      if (report(result, nl ? "Toewijzen is mislukt." : "Assigning failed.")) setSelected(new Set());
    });
  }

  function remove() {
    const form = new FormData();
    for (const row of chosen) form.append("id", row.id);
    startTransition(async () => {
      const result = await unsent.run(() => deleteFromGoogleAction(form));
      setConfirming(false);
      if (result === UNSENT) return;
      report(result, nl ? "Verwijderen is mislukt." : "Deleting failed.");
      setSelected(new Set());
    });
  }

  const totalMembers = chosen.reduce((n, r) => n + r.memberCount, 0);
  const stillActive = chosen.filter((r) => r.active > 0);
  const preview = chosen.slice(0, 8);

  const deleteDescription = (
    <div className="space-y-2">
      <p>
        {nl
          ? `Deze ${chosen.length} ${chosen.length === 1 ? "groep verdwijnt" : "groepen verdwijnen"} in Google, met hun aliassen en het archief van hun berichten, en hun regel hier op de site. Mail naar die adressen komt daarna terug als onbestelbaar.`
          : `These ${chosen.length} ${chosen.length === 1 ? "group is" : "groups are"} deleted in Google, with their aliases and message archive, and their rule here on the site. Mail to those addresses bounces afterwards.`}
      </p>
      <ul className="max-h-40 overflow-auto rounded-lg border border-vtk-blue/10 bg-white px-3 py-2 text-xs text-vtk-ink">
        {preview.map((r) => (
          <li key={r.id} className="truncate">
            {r.email}
          </li>
        ))}
        {chosen.length > preview.length && (
          <li className="text-zinc-500">
            {nl ? `en nog ${chosen.length - preview.length}` : `and ${chosen.length - preview.length} more`}
          </li>
        )}
      </ul>
      {stillActive.length > 0 && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-amber-900">
          {nl
            ? `Let op: ${stillActive.length} ${stillActive.length === 1 ? "ervan heeft" : "ervan hebben"} nog actieve leden (${stillActive
                .slice(0, 3)
                .map((r) => r.email)
                .join(", ")}${stillActive.length > 3 ? ", ..." : ""}).`
            : `Note: ${stillActive.length} of them still ${stillActive.length === 1 ? "has" : "have"} active members (${stillActive
                .slice(0, 3)
                .map((r) => r.email)
                .join(", ")}${stillActive.length > 3 ? ", ..." : ""}).`}
        </p>
      )}
      <p>
        {nl
          ? `Wat blijft: de accounts van de ${totalMembers} leden, en wie erin zat, per groep in het adminlogboek. Terugzetten kan niet vanuit de site.`
          : `What stays: the accounts of the ${totalMembers} members, and who was in each group, in the admin log. It cannot be restored from the site.`}
      </p>
    </div>
  );

  function renderRow(row: MailGroupRow, depth: number) {
    return (
      <LinkedRow
        key={row.id}
        href={`${base}/${row.id}`}
        onModifierClick={manageAll ? (event) => pick(row.id, event) : undefined}
        className={[
          "cursor-pointer border-b border-vtk-blue/5 last:border-0 hover:bg-vtk-blue-soft/30",
          selected.has(row.id) ? "bg-vtk-blue-soft/40" : "",
        ].join(" ")}
      >
        {manageAll && (
          <td
            className="px-4 py-3 align-top"
            data-row-action
            onClick={(event) => pick(row.id, event)}
          >
            <input
              type="checkbox"
              checked={selected.has(row.id)}
              onChange={() => {}}
              onClick={(event) => {
                event.stopPropagation();
                pick(row.id, event);
              }}
              aria-label={nl ? `Aanvinken: ${row.email}` : `Select: ${row.email}`}
            />
          </td>
        )}
        <td className="px-4 py-3 align-top" style={depth ? { paddingLeft: `${16 + depth * 14}px` } : undefined}>
          <Link href={`${base}/${row.id}`} className="font-medium text-vtk-ink">
            {row.email}
          </Link>
          <span className="block text-xs text-zinc-500">
            {row.name !== row.email.split("@")[0] && <>{row.name} · </>}
            {!sections && (row.category ?? (nl ? "zonder categorie" : "no category"))}
            {row.owner && <> · {row.owner}</>}
            {row.archived && <> · {nl ? "archief" : "archive"}</>}
            {!row.enabled && <> · {nl ? "niet beheerd" : "not managed"}</>}
            {row.decision === "DELETE" && (
              <span className="text-red-700"> · {nl ? "op weg" : "marked to remove"}</span>
            )}
            {row.decision === "KEEP" && <> · {nl ? "houden" : "keep"}</>}
          </span>
        </td>
        <td className="px-4 py-3 align-top text-zinc-600">{row.summary || "-"}</td>
        <td className="px-4 py-3 align-top" data-row-action>
          <button
            type="button"
            className="text-left"
            onClick={() => setPeek(row)}
            aria-label={nl ? `Wie zit er in ${row.email}` : `Who is in ${row.email}`}
          >
            <ActivityCell nl={nl} row={row} />
          </button>
        </td>
        <td className="px-4 py-3 align-top text-xs text-zinc-500">
          {row.lastSync}
          {row.notInGoogle && !row.archived && (
            <span className="block">{nl ? "nog niet in Google" : "not in Google yet"}</span>
          )}
          {row.lastError && <span className="block text-red-700">{row.lastError}</span>}
        </td>
      </LinkedRow>
    );
  }

  return (
    <>
      <div className="relative overflow-x-auto rounded-2xl border border-vtk-blue/15 bg-white">
        <table className="w-full min-w-[48rem] text-sm">
          <thead className="border-b border-vtk-blue/10 text-left text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              {manageAll && (
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={allChecked}
                    aria-label={
                      nl ? `Alle ${rows.length} adressen in deze lijst aanvinken` : `Select all ${rows.length} addresses in this list`
                    }
                    onChange={() => setSelected(allChecked ? new Set() : new Set(rows.map((r) => r.id)))}
                  />
                </th>
              )}
              <th className="px-4 py-3 font-medium">{nl ? "Adres" : "Address"}</th>
              <th className="px-4 py-3 font-medium">{nl ? "Wie erin zit" : "Who is in it"}</th>
              <th className="px-4 py-3 font-medium">{nl ? "Nog actief" : "Still active"}</th>
              <th className="px-4 py-3 font-medium">{nl ? "Laatste sync" : "Last sync"}</th>
            </tr>
          </thead>
          {sections ? (
            sections.map((section) => {
              const allIds = [...section.rowIds, ...section.children.flatMap((c) => c.rowIds)];
              return (
                <tbody key={section.key}>
                  <SectionRow
                    nl={nl}
                    manageAll={manageAll}
                    label={section.label}
                    ids={allIds}
                    rows={byId}
                    depth={0}
                    open={openSections.has(section.key)}
                    selected={selected}
                    onToggle={() => toggleSection(section.key)}
                    onSelectAll={setMany}
                  />
                  {openSections.has(section.key) && (
                    <>
                      {section.rowIds.map((id) => renderRow(byId.get(id)!, 1))}
                      {section.children.map((child) => (
                        <Fragment key={child.key}>
                          <SectionRow
                            nl={nl}
                            manageAll={manageAll}
                            label={child.label}
                            ids={child.rowIds}
                            rows={byId}
                            depth={1}
                            open={openSections.has(child.key)}
                            selected={selected}
                            onToggle={() => toggleSection(child.key)}
                            onSelectAll={setMany}
                          />
                          {openSections.has(child.key) && child.rowIds.map((id) => renderRow(byId.get(id)!, 2))}
                        </Fragment>
                      ))}
                    </>
                  )}
                </tbody>
              );
            })
          ) : (
            <tbody>{rows.map((row) => renderRow(row, 0))}</tbody>
          )}
        </table>
      </div>

      {manageAll && chosen.length > 0 && (
        <div className="sticky bottom-4 z-30 mt-3 flex flex-wrap items-center gap-3 rounded-2xl border border-vtk-blue/15 bg-white px-4 py-3 shadow-[0_10px_30px_-12px_rgba(10,15,31,0.35)]">
          <span className="text-sm font-medium text-vtk-ink tabular-nums">
            {nl ? `${chosen.length} aangevinkt` : `${chosen.length} selected`}
          </span>
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <div className="w-64 max-w-full">
              <SearchPicker
                options={[
                  { value: NO_CATEGORY, label: nl ? "Zonder categorie" : "No category", muted: true },
                  ...categoryOptions,
                ]}
                value={category}
                onChange={setCategory}
                placeholder={nl ? "Kies een categorie" : "Pick a category"}
                searchPlaceholder={nl ? "Zoek een categorie" : "Search a category"}
                ariaLabel={nl ? "Categorie" : "Category"}
                emptyText={(q) =>
                  nl
                    ? `Geen categorie "${q}". Maak ze eerst aan bij Categorieën.`
                    : `No category "${q}". Create it under Categories first.`
                }
              />
            </div>
            <Button type="button" size="sm" variant="ghost" disabled={!category || pending} onClick={assign}>
              {nl ? "In categorie zetten" : "Put in category"}
            </Button>
          </div>
          <Button
            type="button"
            size="sm"
            variant="danger"
            disabled={pending || chosen.length > MAX_DELETE_PER_CLICK}
            onClick={() => setConfirming(true)}
            title={
              chosen.length > MAX_DELETE_PER_CLICK
                ? nl
                  ? `Hoogstens ${MAX_DELETE_PER_CLICK} per keer`
                  : `At most ${MAX_DELETE_PER_CLICK} at once`
                : undefined
            }
          >
            {nl ? "Verwijderen uit Google" : "Delete from Google"}
          </Button>
          <button type="button" className="vtk-link text-sm" onClick={() => setSelected(new Set())}>
            {nl ? "Selectie wissen" : "Clear selection"}
          </button>
        </div>
      )}

      <ConfirmDialog
        open={confirming}
        title={
          nl
            ? `${chosen.length} ${chosen.length === 1 ? "groep" : "groepen"} verwijderen uit Google?`
            : `Delete ${chosen.length} ${chosen.length === 1 ? "group" : "groups"} from Google?`
        }
        description={deleteDescription}
        confirmLabel={
          pending
            ? nl
              ? "Bezig met verwijderen..."
              : "Deleting..."
            : nl
              ? `${chosen.length} verwijderen`
              : `Delete ${chosen.length}`
        }
        cancelLabel={nl ? "Annuleren" : "Cancel"}
        pending={pending}
        onConfirm={remove}
        onCancel={() => setConfirming(false)}
      />

      {peek && <MembersPeek nl={nl} base={base} row={peek} onClose={() => setPeek(null)} />}
    </>
  );
}

/** De kop van een categorie in de tabel: klik klapt open, het vinkje neemt alles erin. */
function SectionRow({
  nl,
  manageAll,
  label,
  ids,
  rows,
  depth,
  open,
  selected,
  onToggle,
  onSelectAll,
}: {
  nl: boolean;
  manageAll: boolean;
  label: string;
  ids: string[];
  rows: Map<string, MailGroupRow>;
  depth: number;
  open: boolean;
  selected: Set<string>;
  onToggle: () => void;
  onSelectAll: (ids: string[], on: boolean) => void;
}) {
  const inactive = ids.filter((id) => {
    const row = rows.get(id);
    return row && row.memberCount > 0 && row.active === 0 && !row.thisYear;
  }).length;
  const picked = ids.filter((id) => selected.has(id)).length;
  const all = ids.length > 0 && picked === ids.length;
  return (
    <tr
      className={[
        "cursor-pointer border-b border-vtk-blue/10 hover:bg-vtk-blue-soft/40",
        depth === 0 ? "bg-vtk-blue-soft/30" : "bg-vtk-blue-soft/10",
      ].join(" ")}
      onClick={(event) => {
        if ((event.target as Element).closest("input")) return;
        onToggle();
      }}
    >
      {manageAll && (
        <td className="px-4 py-2.5">
          <input
            type="checkbox"
            checked={all}
            ref={(el) => {
              if (el) el.indeterminate = picked > 0 && !all;
            }}
            onChange={() => onSelectAll(ids, !all)}
            aria-label={nl ? `Alles in ${label} aanvinken (${ids.length})` : `Select all in ${label} (${ids.length})`}
          />
        </td>
      )}
      <td colSpan={4} className="px-4 py-2.5" style={depth ? { paddingLeft: `${16 + depth * 14}px` } : undefined}>
        <button
          type="button"
          aria-expanded={open}
          onClick={(event) => {
            event.stopPropagation();
            onToggle();
          }}
          className="flex w-full items-center gap-2 text-left"
        >
          <ChevronDown
            aria-hidden="true"
            size={16}
            className={`shrink-0 text-zinc-500 transition-transform ${open ? "" : "-rotate-90"}`}
          />
          <span className={depth === 0 ? "font-semibold text-vtk-ink" : "font-medium text-vtk-ink"}>{label}</span>
          <span className="text-sm tabular-nums text-zinc-500">{ids.length}</span>
          {inactive > 0 && (
            <span className="ml-auto text-xs text-amber-800">
              {nl ? `${inactive} zonder actieve leden` : `${inactive} without active members`}
            </span>
          )}
        </button>
      </td>
    </tr>
  );
}

function ActivityCell({ nl, row }: { nl: boolean; row: MailGroupRow }) {
  // Enkel de eerste regel krijgt de stippellijn: dat is het klikbare deel.
  const link = "underline decoration-dotted decoration-zinc-400 underline-offset-4";
  if (row.memberCount === 0) {
    return <span className={`text-sm text-amber-800 ${link}`}>{nl ? "leeg" : "empty"}</span>;
  }
  if (row.active === 0 && row.thisYear) {
    return (
      <span className="block text-sm">
        <span className={link}>
          <span className="text-vtk-ink">{nl ? "groep van dit jaar" : "this year's group"}</span>
        </span>
        <span className="block text-xs text-zinc-500">
          {nl ? `${row.memberCount} leden, geen gekend` : `${row.memberCount} members, none known`}
        </span>
      </span>
    );
  }
  if (row.active === 0) {
    return (
      <span className="block text-sm">
        <span className={link}>
          <span className="text-amber-800">{nl ? "niemand" : "nobody"}</span>
          <span className="text-zinc-500"> {nl ? `van ${row.memberCount}` : `of ${row.memberCount}`}</span>
        </span>
        <span className="block text-xs text-zinc-500">
          {row.lastYear
            ? nl
              ? `laatst ${row.lastYear}`
              : `last ${row.lastYear}`
            : row.unknown > 0
              ? nl
                ? `${row.unknown} ${row.unknown === 1 ? "adres" : "adressen"} onbekend`
                : `${row.unknown} unknown ${row.unknown === 1 ? "address" : "addresses"}`
              : nl
                ? "niemand gekend"
                : "nobody known"}
        </span>
      </span>
    );
  }
  return (
    <span className="block text-sm tabular-nums">
      <span className={link}>
        <span className="text-vtk-ink">{row.active}</span>
        <span className="text-zinc-500"> {nl ? `van ${row.memberCount}` : `of ${row.memberCount}`}</span>
      </span>
      {row.unlinked > 0 && (
        <span className="block text-xs text-amber-700">
          {nl ? `${row.unlinked} zonder adres` : `${row.unlinked} without address`}
        </span>
      )}
    </span>
  );
}

/** Wie er in één groep zit, in een venster boven het overzicht. */
function MembersPeek({
  nl,
  base,
  row,
  onClose,
}: {
  nl: boolean;
  base: string;
  row: MailGroupRow;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-zinc-900/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={row.email}
      onClick={onClose}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-2xl border border-vtk-blue/15 bg-vtk-surface-elevated shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <GroupMembers
          nl={nl}
          rootId={row.id}
          rootEmail={row.email}
          footer={(current) => (
            <div className="flex items-center justify-end gap-3 border-t border-vtk-blue/10 px-5 py-3">
              <Link href={`${base}/${current.id}`} className="vtk-link text-sm">
                {nl ? "Groepsadres openen" : "Open group address"}
              </Link>
              <Button type="button" size="sm" variant="ghost" onClick={onClose}>
                {nl ? "Sluiten" : "Close"}
              </Button>
            </div>
          )}
        />
      </div>
    </div>
  );
}
