"use client";

import { Fragment, useEffect, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, RefreshCw, Search } from "lucide-react";
import Link from "@/components/ui/Link";
import { Button, ConfirmDialog } from "@vtk/ui";
import { LinkedRow } from "@/components/ui/LinkedRow";
import { IconButton, IconLink } from "@/components/ui/IconButton";
import { ListCheckIcon } from "@/components/ui/icons";
import { SearchPicker, type SearchPickerOption } from "@/components/admin/SearchPicker";
import { useFindShortcut } from "@/components/admin/useFindShortcut";
import { useToast } from "@/components/ui/toast";
import { UNSENT, useUnsentGuard } from "@/components/ui/unsentGuard";
import type { SaveState } from "@/lib/saveState";
import { MAX_DELETE_PER_CLICK } from "@/lib/google/kinds";
import { GroupMembers } from "./GroupMembers";
import {
  assignCategoryAction,
  deleteFromGoogleAction,
  setExternalSendersAction,
} from "./bulkActions";
import { syncMailGroupsAction } from "./actions";
import { rememberOverview } from "./overviewMemory";

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
  /** Leden die nu een post hebben of hun studie dit jaar bevestigden; enkel voor de waarschuwing bij verwijderen. */
  active: number;
  /** Uit de nakijkmodus. */
  decision: "KEEP" | "DELETE" | null;
  /** Enkel adressen van vtk.be mogen naar deze groep mailen. */
  internalOnly: boolean;
  lastSync: string;
  notInGoogle: boolean;
  lastError: string | null;
  /** Adres, naam, wie erin zit en categorie, zonder accenten en hoofdletters. */
  search: string;
};

/** Zonder accenten en hoofdletters; dezelfde vouw als `normalizeSearchText`. */
function fold(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

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
 * "wie erin zit" toont de leden zonder de lijst te verlaten.
 *
 * **Zoeken en open categorieën staan in de URL** (`?q=`, `?open=`), bijgewerkt
 * met `history.replaceState` zonder de server te vragen. Wie een adres opent en
 * terugkeert, vindt de lijst dus zoals hij ze achterliet; in een state alleen
 * begon je na elke klik weer met alles dicht en een leeg zoekveld.
 */
export function MailGroupTable({
  nl,
  base,
  manageAll,
  rows,
  sections,
  sectionsOpen,
  categoryOptions,
  canSync,
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
  /** Mag "Nu synchroniseren" (enkel `mailgroups.manage`). */
  canSync: boolean;
}) {
  const params = useSearchParams();
  const router = useRouter();
  const [query, setQuery] = useState(() => params.get("q") ?? "");
  const searchRef = useRef<HTMLInputElement>(null);
  useFindShortcut(searchRef);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [category, setCategory] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [peek, setPeek] = useState<MailGroupRow | null>(null);
  const [pending, startTransition] = useTransition();
  const showToast = useToast();
  const unsent = useUnsentGuard();

  /** Zet één parameter in de URL zonder naar de server te gaan. */
  function writeUrl(key: string, value: string | null) {
    const next = new URLSearchParams(window.location.search);
    if (value) next.set(key, value);
    else next.delete(key);
    const qs = next.toString();
    const url = `${window.location.pathname}${qs ? `?${qs}` : ""}`;
    window.history.replaceState(null, "", url);
    rememberOverview(url);
  }

  // Ook de lijst zoals ze geladen werd (een filter gekozen, nog niets getypt).
  useEffect(() => {
    rememberOverview(`${window.location.pathname}${window.location.search}`);
  }, []);

  // Zoeken gebeurt in de browser: alle rijen van de filter staan al op de pagina.
  const words = fold(query).split(/\s+/).filter(Boolean);
  const searching = words.length > 0;
  const shown = searching ? rows.filter((r) => words.every((w) => r.search.includes(w))) : rows;
  const shownIds = new Set(shown.map((r) => r.id));
  const visibleSections = sections
    ?.map((s) => ({
      ...s,
      rowIds: s.rowIds.filter((id) => shownIds.has(id)),
      children: s.children
        .map((c) => ({ ...c, rowIds: c.rowIds.filter((id) => shownIds.has(id)) }))
        .filter((c) => c.rowIds.length > 0),
    }))
    .filter((s) => s.rowIds.length > 0 || s.children.length > 0) ?? null;

  // Enkel wat nu in beeld staat, telt: een vinkje op een rij die door een
  // andere filter, een zoekterm of een verwijdering verdween, verwijdert niets
  // dat je niet ziet.
  const chosen = shown.filter((r) => selected.has(r.id));

  const allChecked = shown.length > 0 && chosen.length === shown.length;
  const byId = new Map(rows.map((r) => [r.id, r]));

  const [openSections, setOpenSections] = useState<Set<string>>(() => {
    const fromUrl = params.get("open");
    if (fromUrl) return new Set(fromUrl.split(",").filter(Boolean));
    return sectionsOpen && sections
      ? new Set(sections.flatMap((s) => [s.key, ...s.children.map((c) => c.key)]))
      : new Set();
  });
  // Met een zoekterm staat alles open waar iets gevonden is.
  const isOpen = (key: string) => searching || openSections.has(key);
  const toggleSection = (key: string) => {
    const next = new Set(openSections);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setOpenSections(next);
    writeUrl("open", [...next].join(",") || null);
  };

  // De rijen in de volgorde waarin ze op het scherm staan; enkel wat open is.
  // Daarop werkt shift-klik: alles tussen de vorige klik en deze.
  const ordered: string[] = visibleSections
    ? visibleSections.flatMap((s) =>
        isOpen(s.key) ? [...s.rowIds, ...s.children.flatMap((c) => (isOpen(c.key) ? c.rowIds : []))] : [],
      )
    : shown.map((r) => r.id);
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

  function setExternal(allow: boolean) {
    const form = new FormData();
    for (const row of chosen) form.append("id", row.id);
    form.append("allow", allow ? "1" : "0");
    startTransition(async () => {
      const result = await unsent.run(() => setExternalSendersAction(form));
      if (result === UNSENT) return;
      report(result, nl ? "Opslaan is mislukt." : "Saving failed.");
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

  function sync() {
    startTransition(async () => {
      const result = await unsent.run(() => syncMailGroupsAction());
      if (result === UNSENT) return;
      if (result.status === "error") {
        const messages: Record<string, string> = nl
          ? {
              NOT_CONFIGURED: "Google Workspace is nog niet ingesteld; vul eerst de configuratie in bij Admin > IT.",
              SYNC_PARTIAL: "Niet alles is gelukt. Kijk de foutmelding per adres na; de volgende ronde probeert het opnieuw.",
            }
          : {
              NOT_CONFIGURED: "Google Workspace is not set up yet; fill in the configuration under Admin > IT first.",
              SYNC_PARTIAL: "Not everything succeeded. Check the error per address; the next round will try again.",
            };
        showToast({
          message: messages[result.code] ?? (nl ? "Synchroniseren is mislukt." : "Synchronisation failed."),
          variant: "error",
          duration: 0,
        });
        return;
      }
      showToast({ message: nl ? "Synchronisatie afgerond." : "Synchronisation finished.", variant: "success" });
      router.refresh();
    });
  }

  // De nakijkmodus krijgt dezelfde filter en zoekterm mee, zonder de open blokken.
  const reviewParams = new URLSearchParams(params.toString());
  reviewParams.delete("open");
  if (query.trim()) reviewParams.set("q", query.trim());
  else reviewParams.delete("q");
  const reviewHref = `${base}/nakijken${reviewParams.toString() ? `?${reviewParams}` : ""}`;

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
            {!visibleSections && (row.category ?? (nl ? "zonder categorie" : "no category"))}
            {row.owner && <> · {row.owner}</>}
            {row.archived && <> · {nl ? "archief" : "archive"}</>}
            {!row.enabled && <> · {nl ? "niet beheerd" : "not managed"}</>}
            {row.decision === "DELETE" && (
              <span className="text-red-700"> · {nl ? "op weg" : "marked to remove"}</span>
            )}
            {row.decision === "KEEP" && <> · {nl ? "houden" : "keep"}</>}
            {row.internalOnly && <> · {nl ? "enkel vtk.be" : "vtk.be only"}</>}
          </span>
        </td>
        <td className="px-4 py-3 align-top" data-row-action>
          <button
            type="button"
            className="text-left text-zinc-600 underline decoration-dotted decoration-zinc-400 underline-offset-4 hover:text-vtk-ink"
            onClick={() => setPeek(row)}
            aria-label={nl ? `Wie zit er in ${row.email}` : `Who is in ${row.email}`}
          >
            {row.memberCount === 0 ? (
              <span className="text-amber-800">{nl ? "leeg" : "empty"}</span>
            ) : (
              row.summary || (nl ? `${row.memberCount} leden` : `${row.memberCount} members`)
            )}
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
      <div className="mb-3 flex items-center gap-2">
        <label className="relative min-w-0 flex-1 sm:max-w-sm">
          <span className="sr-only">{nl ? "Zoek een adres" : "Search an address"}</span>
          <Search
            aria-hidden="true"
            size={15}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400"
          />
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              writeUrl("q", e.target.value.trim() || null);
            }}
            placeholder={nl ? "Zoek, bv. activiteiten_" : "Search, e.g. activiteiten_"}
            className="h-9 w-full rounded-full border border-vtk-blue/15 bg-white pl-9 pr-14 text-sm"
          />
          <kbd className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded bg-vtk-blue-soft/70 px-1.5 text-[11px] text-zinc-500">
            ⌘F
          </kbd>
        </label>
        {searching && (
          <span className="text-sm tabular-nums text-zinc-500">
            {nl ? `${shown.length} gevonden` : `${shown.length} found`}
          </span>
        )}
        {manageAll && (
          <div className="ml-auto flex items-center gap-1.5">
            <IconLink href={reviewHref} label={nl ? "Eén voor één nakijken" : "Review one by one"}>
              <ListCheckIcon />
            </IconLink>
            {canSync && (
              <IconButton
                label={pending ? (nl ? "Bezig met synchroniseren..." : "Synchronising...") : nl ? "Nu synchroniseren" : "Synchronise now"}
                onClick={sync}
                disabled={pending}
              >
                <RefreshCw aria-hidden="true" size={15} className={pending ? "animate-spin" : undefined} />
              </IconButton>
            )}
          </div>
        )}
      </div>
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
                      nl ? `Alle ${shown.length} adressen in deze lijst aanvinken` : `Select all ${shown.length} addresses in this list`
                    }
                    onChange={() => setSelected(allChecked ? new Set() : new Set(shown.map((r) => r.id)))}
                  />
                </th>
              )}
              <th className="px-4 py-3 font-medium">{nl ? "Adres" : "Address"}</th>
              <th className="px-4 py-3 font-medium">{nl ? "Wie erin zit" : "Who is in it"}</th>
              <th className="px-4 py-3 font-medium">{nl ? "Laatste sync" : "Last sync"}</th>
            </tr>
          </thead>
          {shown.length === 0 ? (
            <tbody>
              <tr>
                <td colSpan={manageAll ? 4 : 3} className="px-4 py-4 text-sm text-zinc-500">
                  {rows.length === 0
                    ? nl
                      ? "Geen adressen voor deze filter."
                      : "No addresses for this filter."
                    : nl
                      ? `Niets gevonden voor "${query.trim()}".`
                      : `Nothing found for "${query.trim()}".`}
                </td>
              </tr>
            </tbody>
          ) : visibleSections ? (
            visibleSections.map((section) => {
              const allIds = [...section.rowIds, ...section.children.flatMap((c) => c.rowIds)];
              return (
                <tbody key={section.key}>
                  <SectionRow
                    nl={nl}
                    manageAll={manageAll}
                    label={section.label}
                    ids={allIds}
                    depth={0}
                    open={isOpen(section.key)}
                    selected={selected}
                    onToggle={() => toggleSection(section.key)}
                    onSelectAll={setMany}
                  />
                  {isOpen(section.key) && (
                    <>
                      {section.rowIds.map((id) => renderRow(byId.get(id)!, 1))}
                      {section.children.map((child) => (
                        <Fragment key={child.key}>
                          <SectionRow
                            nl={nl}
                            manageAll={manageAll}
                            label={child.label}
                            ids={child.rowIds}
                                    depth={1}
                            open={isOpen(child.key)}
                            selected={selected}
                            onToggle={() => toggleSection(child.key)}
                            onSelectAll={setMany}
                          />
                          {isOpen(child.key) && child.rowIds.map((id) => renderRow(byId.get(id)!, 2))}
                        </Fragment>
                      ))}
                    </>
                  )}
                </tbody>
              );
            })
          ) : (
            <tbody>{shown.map((row) => renderRow(row, 0))}</tbody>
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
          <div className="flex items-center gap-1.5" role="group" aria-label={nl ? "Wie mag mailen" : "Who may send"}>
            <span className="text-sm text-zinc-600">{nl ? "Wie mag mailen:" : "Who may send:"}</span>
            <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => setExternal(true)}>
              {nl ? "Iedereen" : "Anyone"}
            </Button>
            <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => setExternal(false)}>
              {nl ? "Enkel vtk.be" : "vtk.be only"}
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
  depth: number;
  open: boolean;
  selected: Set<string>;
  onToggle: () => void;
  onSelectAll: (ids: string[], on: boolean) => void;
}) {
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
      <td colSpan={3} className="px-4 py-2.5" style={depth ? { paddingLeft: `${16 + depth * 14}px` } : undefined}>
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
        </button>
      </td>
    </tr>
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
