"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "@/components/ui/Link";
import { Button, ConfirmDialog } from "@vtk/ui";
import { LinkedRow } from "@/components/ui/LinkedRow";
import { SearchPicker, type SearchPickerOption } from "@/components/admin/SearchPicker";
import { useToast } from "@/components/ui/toast";
import { UNSENT, useUnsentGuard } from "@/components/ui/unsentGuard";
import type { SaveState } from "@/lib/saveState";
import { MAX_DELETE_PER_CLICK } from "@/lib/google/kinds";
import { STATUS_TONE_CLASS, statusLabel } from "@/lib/google/activityLabels";
import {
  type MemberPeek,
  assignCategoryAction,
  deleteFromGoogleAction,
  mailGroupMembersAction,
} from "./bulkActions";

export type MailGroupRow = {
  id: string;
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
  lastSync: string;
  notInGoogle: boolean;
  lastError: string | null;
};

const NO_CATEGORY = "__none__";

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
  categoryOptions,
}: {
  nl: boolean;
  base: string;
  manageAll: boolean;
  rows: MailGroupRow[];
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
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

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
          <tbody>
            {rows.map((row) => (
              <LinkedRow
                key={row.id}
                href={`${base}/${row.id}`}
                className={[
                  "cursor-pointer border-b border-vtk-blue/5 last:border-0 hover:bg-vtk-blue-soft/30",
                  selected.has(row.id) ? "bg-vtk-blue-soft/40" : "",
                ].join(" ")}
              >
                {manageAll && (
                  <td className="px-4 py-3 align-top" data-row-action onClick={() => toggle(row.id)}>
                    <input
                      type="checkbox"
                      checked={selected.has(row.id)}
                      onChange={() => toggle(row.id)}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={nl ? `Aanvinken: ${row.email}` : `Select: ${row.email}`}
                    />
                  </td>
                )}
                <td className="px-4 py-3 align-top">
                  <Link href={`${base}/${row.id}`} className="font-medium text-vtk-ink">
                    {row.email}
                  </Link>
                  <span className="block text-xs text-zinc-500">
                    {row.name !== row.email.split("@")[0] && <>{row.name} · </>}
                    {row.category ?? (nl ? "zonder categorie" : "no category")}
                    {row.owner && <> · {row.owner}</>}
                    {row.archived && <> · {nl ? "archief" : "archive"}</>}
                    {!row.enabled && <> · {nl ? "niet beheerd" : "not managed"}</>}
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
            ))}
          </tbody>
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

function ActivityCell({ nl, row }: { nl: boolean; row: MailGroupRow }) {
  // Enkel de eerste regel krijgt de stippellijn: dat is het klikbare deel.
  const link = "underline decoration-dotted decoration-zinc-400 underline-offset-4";
  if (row.memberCount === 0) {
    return <span className={`text-sm text-amber-800 ${link}`}>{nl ? "leeg" : "empty"}</span>;
  }
  if (row.active === 0) {
    return (
      <span className="block text-sm">
        <span className={link}>
          <span className="text-amber-800">{nl ? "niemand" : "nobody"}</span>
          <span className="text-zinc-500"> {nl ? `van ${row.memberCount}` : `of ${row.memberCount}`}</span>
        </span>
        <span className="block text-xs text-zinc-500">
          {row.lastYear ? (nl ? `laatst ${row.lastYear}` : `last ${row.lastYear}`) : nl ? "niemand gekend" : "nobody known"}
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

/** Wie er in één groep zit, met per adres of het nog actief is. */
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
  const [members, setMembers] = useState<MemberPeek[] | null>(null);
  const [failed, setFailed] = useState(false);
  const unsent = useUnsentGuard();

  useEffect(() => {
    let cancelled = false;
    unsent
      .run(() => mailGroupMembersAction(row.id))
      .then((result) => {
        if (cancelled) return;
        if (result === UNSENT || result === null) setFailed(true);
        else setMembers(result);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [row.id, unsent]);

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
        <div className="border-b border-vtk-blue/10 px-5 py-4">
          <h2 className="font-semibold text-vtk-ink">{row.email}</h2>
          <p className="mt-1 text-sm text-zinc-500">
            {nl
              ? `${row.active} van ${row.memberCount} nog actief: een post dit werkingsjaar, of hun studie dit academiejaar bevestigd.`
              : `${row.active} of ${row.memberCount} still active: a post this working year, or their studies confirmed this academic year.`}
          </p>
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-5 py-3">
          {failed ? (
            <p className="text-sm text-red-700">
              {nl ? "De leden konden niet geladen worden. Probeer het opnieuw." : "Could not load the members. Try again."}
            </p>
          ) : members === null ? (
            <p className="text-sm text-zinc-500">{nl ? "Bezig met laden..." : "Loading..."}</p>
          ) : members.length === 0 ? (
            <p className="text-sm text-zinc-500">{nl ? "Niemand." : "Nobody."}</p>
          ) : (
            <ul className="divide-y divide-vtk-blue/5">
              {members.map((m) => {
                const l = statusLabel(m, nl);
                return (
                  <li key={m.email} className="flex items-start justify-between gap-3 py-2">
                    <span className="min-w-0 text-sm">
                      <span className="block break-all text-vtk-ink">{m.email}</span>
                      {m.name && <span className="block text-xs text-zinc-500">{m.name}</span>}
                    </span>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${STATUS_TONE_CLASS[l.tone]}`}>{l.text}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="flex items-center justify-end gap-3 border-t border-vtk-blue/10 px-5 py-3">
          <Link href={`${base}/${row.id}`} className="vtk-link text-sm">
            {nl ? "Groepsadres openen" : "Open group address"}
          </Link>
          <Button type="button" size="sm" variant="ghost" onClick={onClose}>
            {nl ? "Sluiten" : "Close"}
          </Button>
        </div>
      </div>
    </div>
  );
}
