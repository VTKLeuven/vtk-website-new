"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "@/components/ui/Link";
import { Button, ConfirmDialog } from "@vtk/ui";
import { SearchPicker, type SearchPickerOption } from "@/components/admin/SearchPicker";
import { useToast } from "@/components/ui/toast";
import { UNSENT, useUnsentGuard } from "@/components/ui/unsentGuard";
import { MAX_DELETE_PER_CLICK } from "@/lib/google/kinds";
import { GroupMembers } from "../GroupMembers";
import {
  type MemberPeek,
  assignCategoryAction,
  deleteReviewedAction,
  mailGroupMembersAction,
  reviewMailGroupAction,
} from "../bulkActions";

export type ReviewItem = {
  id: string;
  email: string;
  name: string;
  category: string | null;
  categoryId: string | null;
  summary: string;
  memberCount: number;
  active: number;
  unknown: number;
  thisYear: boolean;
  /** "22-23": het jongste jaar waarin nog iemand actief was, enkel bij nul actief. */
  lastYear: string | null;
  decision: "KEEP" | "DELETE" | null;
};

type Decision = "KEEP" | "DELETE";
const NO_CATEGORY = "__none__";

/**
 * Eén groep tegelijk: wie erin zit en drie knoppen. Een beslissing gaat meteen
 * naar de server (zodat stoppen en later verdergaan kan) en schuift door naar
 * de volgende groep die nog niet nagekeken is. De toetsen staan op de knoppen.
 */
export function ReviewMode({
  nl,
  base,
  backHref,
  filterLabel,
  items: initialItems,
  startWithAll,
  deleteElsewhere,
  categoryOptions,
}: {
  nl: boolean;
  base: string;
  backHref: string;
  filterLabel: string;
  items: ReviewItem[];
  /** `?alles=1`: ook wat al nagekeken is, van het begin af. */
  startWithAll: boolean;
  /** Groepen op "weg" die niet in deze filter staan; enkel om te tellen. */
  deleteElsewhere: number;
  categoryOptions: SearchPickerOption[];
}) {
  const [items, setItems] = useState(initialItems);
  const firstOpen = startWithAll ? 0 : initialItems.findIndex((i) => !i.decision);
  const [index, setIndex] = useState(firstOpen === -1 ? initialItems.length : firstOpen);
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const showToast = useToast();
  const unsent = useUnsentGuard();
  // Wie erin zit, per groep; de volgende groep wordt vooraf geladen zodat
  // doorklikken niet op de server wacht. Eén Map voor het hele leven van het
  // scherm (een lazy state, geen ref die tijdens het renderen gelezen wordt).
  const [cache] = useState(() => new Map<string, MemberPeek[]>());

  const item = items[index] ?? null;
  const done = index >= items.length;
  const reviewed = items.filter((i) => i.decision).length;
  const toDelete = items.filter((i) => i.decision === "DELETE");
  const kept = items.filter((i) => i.decision === "KEEP").length;

  useEffect(() => {
    const next = items[index + 1];
    if (!next || cache.has(next.id)) return;
    let cancelled = false;
    unsent
      .run(() => mailGroupMembersAction(next.id))
      .then((result) => {
        if (!cancelled && result !== UNSENT && result) cache.set(next.id, result);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [index, items, cache, unsent]);

  const nextOpenAfter = useCallback(
    (from: number, list: ReviewItem[]) => {
      for (let i = from + 1; i < list.length; i++) if (!list[i].decision) return i;
      return list.length;
    },
    [],
  );

  const decide = useCallback(
    (decision: Decision | null) => {
      if (!item) return;
      const previous = item.decision;
      const updated = items.map((i) => (i.id === item.id ? { ...i, decision } : i));
      setItems(updated);
      if (decision) setIndex(nextOpenAfter(index, updated));
      void (async () => {
        const result = await unsent.run(() => reviewMailGroupAction(item.id, decision));
        if (result === UNSENT || result.status === "error") {
          // Terugzetten: wat de server niet kreeg, is niet beslist.
          setItems((list) => list.map((i) => (i.id === item.id ? { ...i, decision: previous } : i)));
          if (result !== UNSENT) {
            showToast({
              message: nl
                ? `Niet bewaard voor ${item.email}; probeer opnieuw.`
                : `Not saved for ${item.email}; try again.`,
              variant: "error",
              duration: 0,
            });
          }
        }
      })();
    },
    [item, items, index, nextOpenAfter, unsent, showToast, nl],
  );

  const go = useCallback((delta: number) => setIndex((i) => Math.min(Math.max(i + delta, 0), items.length)), [items.length]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (confirming || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [role='combobox'], [role='listbox']")) return;
      const key = event.key.toLowerCase();
      if (key === "h") decide("KEEP");
      else if (key === "v") decide("DELETE");
      else if (key === "s" || event.key === "ArrowRight") go(1);
      else if (event.key === "ArrowLeft") go(-1);
      else return;
      event.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [decide, go, confirming]);

  function assign(categoryId: string) {
    if (!item) return;
    const form = new FormData();
    form.append("id", item.id);
    form.append("categoryId", categoryId === NO_CATEGORY ? "" : categoryId);
    const option = categoryOptions.find((o) => o.value === categoryId);
    startTransition(async () => {
      const result = await unsent.run(() => assignCategoryAction(form));
      if (result === UNSENT) return;
      if (result.status === "error") {
        showToast({ message: nl ? "Categorie niet bewaard." : "Category not saved.", variant: "error", duration: 0 });
        return;
      }
      const label =
        categoryId === NO_CATEGORY
          ? null
          : option?.group && option.group !== option.label
            ? `${option.group} › ${option.label}`
            : (option?.label ?? null);
      setItems((list) =>
        list.map((i) =>
          i.id === item.id ? { ...i, categoryId: categoryId === NO_CATEGORY ? null : categoryId, category: label } : i,
        ),
      );
      showToast({ message: nl ? "Categorie bewaard." : "Category saved.", variant: "success" });
    });
  }

  function removeMarked() {
    const ids = toDelete.slice(0, MAX_DELETE_PER_CLICK).map((i) => i.id);
    startTransition(async () => {
      const result = await unsent.run(() => deleteReviewedAction(ids));
      setConfirming(false);
      if (result === UNSENT) return;
      if (result.status === "error") {
        showToast({
          message:
            result.code === "NOT_CONFIGURED"
              ? nl
                ? "Google Workspace is nog niet ingesteld (Admin > IT); er is niets verwijderd."
                : "Google Workspace is not set up yet (Admin > IT); nothing was deleted."
              : nl
                ? "Verwijderen is mislukt."
                : "Deleting failed.",
          variant: "error",
          duration: 0,
        });
        return;
      }
      showToast(
        result.problems
          ? { message: result.message, variant: "error", duration: 0 }
          : { message: result.message, variant: "success" },
      );
      // Enkel wat echt weg is, verdwijnt uit de stapel; wat mislukte, blijft op "weg".
      const gone = new Set(result.deletedIds);
      const currentId = item?.id;
      const left = items.filter((i) => !gone.has(i.id));
      setItems(left);
      const at = currentId ? left.findIndex((i) => i.id === currentId) : -1;
      setIndex(at >= 0 ? at : Math.min(index, left.length));
    });
  }

  const progress = items.length ? Math.round((reviewed / items.length) * 100) : 100;

  return (
    <div className="space-y-5 pb-28">
      <div>
        <Link href={backHref} className="vtk-link text-sm">
          {nl ? "Groepsadressen" : "Group addresses"}
        </Link>
        <h1 className="mt-1 text-xl font-semibold text-vtk-ink">{nl ? "Nakijken" : "Review"}</h1>
        <p className="mt-1 text-sm text-zinc-500">
          {filterLabel ? `${filterLabel} · ` : nl ? "Alle groepsadressen · " : "All group addresses · "}
          {nl
            ? `${reviewed} van ${items.length} nagekeken, ${kept} houden, ${toDelete.length} weg`
            : `${reviewed} of ${items.length} reviewed, ${kept} keep, ${toDelete.length} remove`}
        </p>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-vtk-blue-soft" aria-hidden="true">
          <div className="h-full bg-vtk-ink transition-[width]" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {done || !item ? (
        <div className="rounded-2xl border border-vtk-blue/15 bg-white px-5 py-6">
          <h2 className="font-semibold text-vtk-ink">
            {items.length === 0
              ? nl
                ? "Niets na te kijken in deze lijst."
                : "Nothing to review in this list."
              : nl
                ? "Alles in deze lijst is nagekeken."
                : "Everything in this list is reviewed."}
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            {toDelete.length > 0
              ? nl
                ? `${toDelete.length} ${toDelete.length === 1 ? "groep staat" : "groepen staan"} op weg. Er is nog niets verwijderd.`
                : `${toDelete.length} ${toDelete.length === 1 ? "group is" : "groups are"} marked to remove. Nothing has been deleted yet.`
              : nl
                ? "Niets op weg gezet."
                : "Nothing marked to remove."}
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            {items.length > 0 && (
              <Button type="button" variant="ghost" size="sm" onClick={() => setIndex(0)}>
                {nl ? "Opnieuw van het begin" : "Start over"}
              </Button>
            )}
            <Link href={backHref} className="vtk-link self-center text-sm">
              {nl ? "Terug naar het overzicht" : "Back to the overview"}
            </Link>
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-vtk-blue/15 bg-white">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-vtk-blue/10 px-5 py-4">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-wide text-zinc-500 tabular-nums">
                {index + 1} / {items.length}
              </p>
              <h2 className="break-all text-lg font-semibold text-vtk-ink">{item.email}</h2>
              <p className="text-sm text-zinc-500">
                {item.name !== item.email.split("@")[0] && <>{item.name} · </>}
                {item.summary || (nl ? "geen leden" : "no members")}
              </p>
              <p className="mt-2 text-sm">
                <Verdict nl={nl} item={item} />
              </p>
            </div>
            <div className="flex flex-col items-end gap-2">
              {item.decision && (
                <span
                  className={[
                    "rounded-full px-2.5 py-0.5 text-xs font-medium",
                    item.decision === "KEEP" ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800",
                  ].join(" ")}
                >
                  {item.decision === "KEEP" ? (nl ? "Houden" : "Keep") : nl ? "Weg" : "Remove"}
                </span>
              )}
              <Link href={`${base}/${item.id}`} className="vtk-link text-sm" target="_blank">
                {nl ? "Openen in een nieuw tabblad" : "Open in a new tab"}
              </Link>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 border-b border-vtk-blue/10 bg-vtk-blue-soft/20 px-5 py-3">
            <span className="text-sm text-zinc-600">{nl ? "Categorie" : "Category"}</span>
            <div className="w-72 max-w-full">
              <SearchPicker
                key={item.id}
                options={[{ value: NO_CATEGORY, label: nl ? "Zonder categorie" : "No category", muted: true }, ...categoryOptions]}
                value={item.categoryId ?? NO_CATEGORY}
                onChange={assign}
                placeholder={nl ? "Zonder categorie" : "No category"}
                searchPlaceholder={nl ? "Zoek een categorie" : "Search a category"}
                ariaLabel={nl ? "Categorie" : "Category"}
                emptyText={(q) =>
                  nl ? `Geen categorie "${q}". Maak ze aan op het overzicht.` : `No category "${q}". Create it on the overview.`
                }
              />
            </div>
            {item.decision && (
              <button type="button" className="vtk-link ml-auto text-sm" onClick={() => decide(null)}>
                {nl ? "Beslissing wissen" : "Clear decision"}
              </button>
            )}
          </div>

          <GroupMembers
            key={item.id}
            nl={nl}
            rootId={item.id}
            rootEmail={item.email}
            cache={cache}
            hideRootTitle
            className="max-h-[55vh]"
          />
        </div>
      )}

      <div className="sticky bottom-4 z-30 flex flex-wrap items-center gap-2 rounded-2xl border border-vtk-blue/15 bg-white px-4 py-3 shadow-[0_10px_30px_-12px_rgba(10,15,31,0.35)]">
        <Button type="button" variant="ghost" size="sm" disabled={index === 0} onClick={() => go(-1)}>
          ← {nl ? "Vorige" : "Previous"}
        </Button>
        <Button type="button" variant="ghost" size="sm" disabled={done} onClick={() => go(1)}>
          {nl ? "Overslaan" : "Skip"} <Kbd>S</Kbd>
        </Button>
        <Button type="button" variant="ghost" size="sm" disabled={done} onClick={() => decide("KEEP")}>
          {nl ? "Houden" : "Keep"} <Kbd>H</Kbd>
        </Button>
        <Button type="button" variant="danger" size="sm" disabled={done} onClick={() => decide("DELETE")}>
          {nl ? "Weg ermee" : "Remove"} <Kbd>V</Kbd>
        </Button>
        <span className="ml-auto flex flex-wrap items-center gap-3">
          {deleteElsewhere > 0 && (
            <span className="text-xs text-zinc-500">
              {nl ? `+ ${deleteElsewhere} buiten deze lijst` : `+ ${deleteElsewhere} outside this list`}
            </span>
          )}
          <Button
            type="button"
            size="sm"
            disabled={toDelete.length === 0 || pending}
            onClick={() => setConfirming(true)}
          >
            {nl
              ? `${toDelete.length} ${toDelete.length === 1 ? "groep" : "groepen"} verwijderen`
              : `Delete ${toDelete.length} ${toDelete.length === 1 ? "group" : "groups"}`}
          </Button>
        </span>
      </div>

      <ConfirmDialog
        open={confirming}
        title={
          nl
            ? `${Math.min(toDelete.length, MAX_DELETE_PER_CLICK)} groepen verwijderen uit Google?`
            : `Delete ${Math.min(toDelete.length, MAX_DELETE_PER_CLICK)} groups from Google?`
        }
        description={
          <div className="space-y-2">
            <p>
              {nl
                ? "Wat je in deze lijst op weg zette, verdwijnt in Google, met aliassen en het archief van de berichten, en hier op de site. Mail naar die adressen komt daarna terug als onbestelbaar."
                : "What you marked to remove in this list is deleted in Google, with aliases and message archive, and here on the site. Mail to those addresses bounces afterwards."}
            </p>
            <ul className="max-h-40 overflow-auto rounded-lg border border-vtk-blue/10 bg-white px-3 py-2 text-xs text-vtk-ink">
              {toDelete.slice(0, 8).map((i) => (
                <li key={i.id} className="truncate">
                  {i.email}
                </li>
              ))}
              {toDelete.length > 8 && (
                <li className="text-zinc-500">{nl ? `en nog ${toDelete.length - 8}` : `and ${toDelete.length - 8} more`}</li>
              )}
            </ul>
            {toDelete.some((i) => i.active > 0) && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-amber-900">
                {nl
                  ? `Let op: ${toDelete.filter((i) => i.active > 0).length} ervan hebben nog actieve leden.`
                  : `Note: ${toDelete.filter((i) => i.active > 0).length} of them still have active members.`}
              </p>
            )}
            {toDelete.length > MAX_DELETE_PER_CLICK && (
              <p>
                {nl
                  ? `Hoogstens ${MAX_DELETE_PER_CLICK} per keer; de rest blijft op weg staan voor een volgende keer.`
                  : `At most ${MAX_DELETE_PER_CLICK} at once; the rest stays marked for next time.`}
              </p>
            )}
            <p>
              {nl
                ? "Wie erin zat, staat per groep in het adminlogboek. Terugzetten kan niet vanuit de site."
                : "Who was in each group is in the admin log. It cannot be restored from the site."}
            </p>
          </div>
        }
        confirmLabel={pending ? (nl ? "Bezig met verwijderen..." : "Deleting...") : nl ? "Verwijderen" : "Delete"}
        cancelLabel={nl ? "Annuleren" : "Cancel"}
        pending={pending}
        onConfirm={removeMarked}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}

function Verdict({ nl, item }: { nl: boolean; item: ReviewItem }) {
  if (item.memberCount === 0) return <span className="text-amber-800">{nl ? "Leeg: niemand zit erin." : "Empty: nobody is in it."}</span>;
  if (item.active > 0)
    return (
      <span className="text-emerald-800">
        {nl ? `${item.active} van ${item.memberCount} nog actief.` : `${item.active} of ${item.memberCount} still active.`}
      </span>
    );
  if (item.thisYear)
    return (
      <span className="text-vtk-ink">
        {nl ? "Groep van dit werkingsjaar, nog niemand gekend." : "Group of this working year, nobody known yet."}
      </span>
    );
  return (
    <span className="text-amber-800">
      {nl ? `Niemand van de ${item.memberCount} nog actief` : `None of the ${item.memberCount} still active`}
      {item.lastYear
        ? nl
          ? `; laatst ${item.lastYear}.`
          : `; last ${item.lastYear}.`
        : item.unknown > 0
          ? nl
            ? `; ${item.unknown} ${item.unknown === 1 ? "adres" : "adressen"} onbekend.`
            : `; ${item.unknown} unknown.`
          : "."}
    </span>
  );
}

function Kbd({ children }: { children: string }) {
  return (
    <kbd className="ml-1.5 rounded border border-current/30 px-1 font-sans text-[11px] leading-4 opacity-70">{children}</kbd>
  );
}
