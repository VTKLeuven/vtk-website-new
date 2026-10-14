"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { CheckIcon, CopyIcon } from "@/components/ui/icons";
import { IconButton } from "@/components/ui/IconButton";
import { useToast } from "@/components/ui/toast";
import { formatCount, formatWeight } from "@/lib/praesidiumShifts/stats";
import type { OverviewListRow, OverviewMember } from "@/lib/praesidiumShifts/overview";
import type { Averages } from "@/lib/praesidiumShifts/stats";
import { NecessityToggle } from "./NecessityToggle";
import { EntryRow } from "./EntryRow";

type View = "total" | "lists" | "perList";

/** Een kommagetal met een teken ervoor, zoals in de pil. */
function signed(value: number, locale: "nl" | "en"): string {
  const rounded = Math.round(value * 10) / 10;
  if (Math.abs(rounded) < 0.05) return "0";
  return `${rounded > 0 ? "+" : "−"}${formatCount(Math.abs(rounded), locale)}`;
}

/** Eronder telt pas vanaf een halve shift: een kwartje verschil is ruis. */
const BELOW = -0.5;

function DiffPill({ value, locale, title }: { value: number; locale: "nl" | "en"; title?: string }) {
  const tone = value <= -1 ? "down" : value >= 1 ? "up" : "even";
  return (
    <span className="vtk-psl-diff" data-tone={tone} title={title}>
      {signed(value, locale)}
    </span>
  );
}

function initials(name: string): string {
  const parts = name.split(" ").filter(Boolean);
  return `${parts[0]?.[0] ?? ""}${parts.length > 1 ? parts[parts.length - 1][0] : ""}`.toUpperCase();
}

function shortDate(iso: string | null, locale: "nl" | "en"): string {
  if (!iso) return "";
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString(locale === "nl" ? "nl-BE" : "en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function shiftMoment(iso: string, locale: "nl" | "en"): string {
  return new Date(iso).toLocaleString(locale === "nl" ? "nl-BE" : "en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Brussels",
  });
}

/** Hoeveel een lijst weegt voor dit lid: 0 is overgeslagen, 1 volledig. */
function weightOn(member: OverviewMember, listId: string): number {
  return member.listWeights[listId] ?? 1;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * De stand per praesidiumlid als rustig register: één regel per persoon, al
 * gesplitst in wie onder het gemiddelde zit en wie erop of erboven. Een klik op
 * een regel opent de lade met alles van die persoon.
 */
export function MemberTable({
  locale,
  members,
  averages,
  lists,
  errorMessages,
}: {
  locale: "nl" | "en";
  members: OverviewMember[];
  averages: Averages;
  /** Bevestigde shiftenlijsten van dit jaar, in volgorde, voor de weergave per lijst. */
  lists: OverviewListRow[];
  errorMessages: Record<string, string>;
}) {
  const nl = locale === "nl";
  const showToast = useToast();
  const [view, setView] = useState<View>("total");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const basisLists = view !== "total";
  const valueOf = (m: OverviewMember) => (basisLists ? m.lists : m.total);
  // Waarmee iemand vergeleken wordt: het gemiddelde zonder de lijsten waarop
  // hij overgeslagen wordt, en met het deel van de lijsten waarop hij voor een
  // deel meetelt. Zonder zo'n lijst is dat gewoon het gemiddelde.
  const expectedOf = (m: OverviewMember) => (basisLists ? m.expectedLists : m.expectedTotal);
  const diffOf = (m: OverviewMember) => valueOf(m) - expectedOf(m);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) => m.name.toLowerCase().includes(q) || m.posts.some((p) => p.toLowerCase().includes(q)));
  }, [members, query]);
  const sorted = [...filtered].sort((a, b) => diffOf(a) - diffOf(b) || a.name.localeCompare(b.name, "nl"));
  const below = sorted.filter((m) => diffOf(m) <= BELOW);
  const rest = sorted.filter((m) => diffOf(m) > BELOW);
  const selected = members.find((m) => m.userId === selectedId) ?? null;
  const belowWithPhone = below.filter((m) => m.phone);
  // Enkel de shiftenlijsten: een rooster weegt niet mee in deze tabel.
  const weightedLists = (m: OverviewMember) => lists.filter((l) => weightOn(m, l.id) < 1);
  const anyWeighted = members.some((m) => weightedLists(m).length > 0);

  async function copyBelow() {
    const ok = await copyText(belowWithPhone.map((m) => `${m.name}: ${m.phone}`).join("\n"));
    if (!ok) {
      showToast({
        message: nl ? "Kopiëren lukte niet; je browser liet het klembord niet toe." : "Copy failed; your browser blocked the clipboard.",
        variant: "error",
        duration: 0,
      });
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    showToast({
      message: nl
        ? `${belowWithPhone.length} nummers gekopieerd van wie onder het gemiddelde zit.`
        : `${belowWithPhone.length} numbers copied of who is below average.`,
      variant: "success",
    });
  }

  const weightedNote = (m: OverviewMember) => {
    const weighted = weightedLists(m);
    if (weighted.length === 0) return undefined;
    const skipped = weighted.filter((l) => weightOn(m, l.id) === 0).map((l) => l.name);
    const partial = weighted
      .filter((l) => weightOn(m, l.id) > 0)
      .map((l) => (nl ? `voor ${formatWeight(weightOn(m, l.id), locale)} op ${l.name}` : `for ${formatWeight(weightOn(m, l.id), locale)} on ${l.name}`));
    const where = [
      skipped.length ? (nl ? `overgeslagen op ${skipped.join(", ")}` : `skipped on ${skipped.join(", ")}`) : null,
      partial.length ? (nl ? `telt ${partial.join(", ")}` : `counts ${partial.join(", ")}`) : null,
    ]
      .filter(Boolean)
      .join("; ");
    const sentence = where.charAt(0).toUpperCase() + where.slice(1);
    return nl
      ? `${sentence}: vergeleken met ${formatCount(expectedOf(m), locale)} in plaats van het gemiddelde`
      : `${sentence}: compared with ${formatCount(expectedOf(m), locale)} instead of the average`;
  };

  const row = (m: OverviewMember) => (
    <tr
      key={m.userId}
      data-selected={m.userId === selectedId || undefined}
      onClick={(event) => {
        if ((event.target as Element).closest("a, button")) return;
        setSelectedId(m.userId);
      }}
      className="cursor-pointer"
    >
      <td>
        <button type="button" onClick={() => setSelectedId(m.userId)} className="text-left">
          <span className="font-semibold text-vtk-ink">{m.name}</span>{" "}
          <span className="text-xs text-vtk-muted">{m.posts.join(", ")}</span>
        </button>
      </td>
      <td className="whitespace-nowrap text-vtk-muted tabular-nums">
        {m.phone ?? <span className="text-xs">{nl ? "geen nummer" : "no number"}</span>}
      </td>
      <td className="text-right tabular-nums">
        {formatCount(m.lists, locale)}
        {weightedLists(m).length > 0 && (
          <sup className="text-vtk-muted" title={weightedNote(m)}>
            *
          </sup>
        )}
      </td>
      <td className="text-right tabular-nums">
        {m.site ? `${m.siteNecessary} · ${m.siteVoluntary}` : <span className="text-vtk-muted">0</span>}
      </td>
      <td className="text-right font-semibold tabular-nums">{formatCount(m.total, locale)}</td>
      <td className="text-right">
        <DiffPill value={diffOf(m)} locale={locale} title={weightedNote(m)} />
      </td>
    </tr>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={nl ? "Weergave" : "View"}>
          {(
            [
              ["total", nl ? "Alles samen" : "Everything"],
              ["lists", nl ? "Enkel lijsten" : "Lists only"],
              ...(lists.length > 0 ? [["perList", nl ? "Per lijst" : "Per list"]] : []),
            ] as [View, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-pressed={view === key}
              onClick={() => setView(key)}
              className={`rounded-full border px-3.5 py-1.5 text-sm ${
                view === key ? "border-vtk-ink bg-vtk-ink text-white" : "border-vtk-navy/20 text-vtk-ink hover:bg-vtk-blue-soft/60"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <label className="flex h-9 w-56 items-center gap-2 rounded-xl border border-vtk-navy/20 bg-[var(--paper)] px-3 text-sm text-vtk-muted">
            <Search size={15} aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.currentTarget.value)}
              placeholder={nl ? "Zoek naam of post" : "Search name or post"}
              aria-label={nl ? "Zoek naam of post" : "Search name or post"}
              className="min-w-0 flex-1 border-0! bg-transparent! p-0! text-vtk-ink shadow-none! outline-none!"
            />
          </label>
          <IconButton
            label={
              belowWithPhone.length
                ? nl
                  ? `Kopieer de nummers van wie onder het gemiddelde zit (${belowWithPhone.length})`
                  : `Copy the numbers of who is below average (${belowWithPhone.length})`
                : nl
                  ? "Niemand onder het gemiddelde heeft een nummer"
                  : "Nobody below average has a number"
            }
            onClick={copyBelow}
            disabled={belowWithPhone.length === 0}
          >
            {copied ? <CheckIcon /> : <CopyIcon />}
          </IconButton>
        </div>
      </div>

      <p className="text-sm text-vtk-muted">
        {view === "total" ? (
          <>
            {nl ? "Gemiddeld " : "On average "}
            <strong className="font-semibold text-vtk-ink tabular-nums">{formatCount(averages.total, locale)}</strong>
            {nl
              ? ` shiften per lid: ${formatCount(averages.lists, locale)} op de lijsten en ${formatCount(averages.site, locale)} op /shift, waarvan ${formatCount(averages.siteNecessary, locale)} noodzakelijk.`
              : ` shifts per member: ${formatCount(averages.lists, locale)} on the lists and ${formatCount(averages.site, locale)} on /shift, ${formatCount(averages.siteNecessary, locale)} of which necessary.`}
          </>
        ) : (
          <>
            {nl ? "Gemiddeld " : "On average "}
            <strong className="font-semibold text-vtk-ink tabular-nums">{formatCount(averages.lists, locale)}</strong>
            {nl ? " shiften per lid op de shiftenlijsten." : " shifts per member on the shift lists."}
          </>
        )}
      </p>

      {view !== "perList" ? (
        <div className="relative overflow-x-auto rounded-[18px] border border-vtk-blue/10 bg-vtk-surface-elevated">
          <table className="vtk-psl-table w-full min-w-[680px]">
            <thead>
              <tr>
                <th>{nl ? "Naam" : "Name"}</th>
                <th>{nl ? "Telefoon" : "Phone"}</th>
                <th className="vtk-psl-num">{nl ? "Lijsten" : "Lists"}</th>
                <th className="vtk-psl-num" title={nl ? "Noodzakelijk · vrije wil" : "Necessary · voluntary"}>
                  {nl ? "/shift nood · vrij" : "/shift nec. · vol."}
                </th>
                <th className="vtk-psl-num">{nl ? "Alles" : "All"}</th>
                <th className="vtk-psl-num">{nl ? "Verschil" : "Difference"}</th>
              </tr>
            </thead>
            <tbody>
              {below.length > 0 && (
                <tr className="vtk-psl-group">
                  <td colSpan={6}>
                    {nl ? "Onder het gemiddelde" : "Below average"} · {below.length}
                  </td>
                </tr>
              )}
              {below.map(row)}
              {rest.length > 0 && (
                <tr className="vtk-psl-group">
                  <td colSpan={6}>
                    {nl ? "Rond of boven het gemiddelde" : "Around or above average"} · {rest.length}
                  </td>
                </tr>
              )}
              {rest.map(row)}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-sm text-vtk-muted">
                    {nl ? `Niemand past bij "${query.trim()}".` : `Nobody matches "${query.trim()}".`}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="relative overflow-x-auto rounded-[18px] border border-vtk-blue/10 bg-vtk-surface-elevated">
          <table className="vtk-psl-table w-full">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-[var(--paper-2)]">{nl ? "Naam" : "Name"}</th>
                {lists.map((list) => (
                  <th key={list.id} className="vtk-psl-num" title={list.name}>
                    <span className="block max-w-28 truncate">{list.name}</span>
                    <span className="block font-medium normal-case tracking-normal">
                      {list.expectedPerMember !== null
                        ? `${nl ? "richtlijn" : "target"} ${formatCount(list.expectedPerMember, locale)}`
                        : `${nl ? "gem." : "avg."} ${formatCount(list.average, locale)}`}
                    </span>
                  </th>
                ))}
                <th className="vtk-psl-num">{nl ? "Totaal" : "Total"}</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((m) => (
                <tr key={m.userId} className="cursor-pointer" onClick={() => setSelectedId(m.userId)}>
                  <td className="sticky left-0 z-10 bg-vtk-surface-elevated whitespace-nowrap font-semibold">{m.name}</td>
                  {lists.map((list) => {
                    const weight = weightOn(m, list.id);
                    if (weight === 0) {
                      return (
                        <td key={list.id} className="text-right text-xs text-vtk-muted">
                          {nl ? "overgeslagen" : "skipped"}
                        </td>
                      );
                    }
                    // Wat telt, dus al met het gewicht vermenigvuldigd; de
                    // richtlijn krimpt mee.
                    const value = m.perList[list.id] ?? 0;
                    const short = list.expectedPerMember !== null && value < list.expectedPerMember * weight;
                    return (
                      <td
                        key={list.id}
                        className={`text-right tabular-nums ${value === 0 ? "text-vtk-muted" : ""} ${short ? "font-semibold text-vtk-danger" : ""}`}
                      >
                        {formatCount(value, locale)}
                        {weight < 1 && (
                          <span className="ml-1 text-[11px] font-normal text-vtk-muted" title={nl ? `Telt voor ${formatWeight(weight, locale)} op deze lijst` : `Counts for ${formatWeight(weight, locale)} on this list`}>
                            {formatWeight(weight, locale)}
                          </span>
                        )}
                        {short && <span className="sr-only">{nl ? " (onder de richtlijn)" : " (below target)"}</span>}
                      </td>
                    );
                  })}
                  <td className="text-right font-semibold tabular-nums">{formatCount(m.lists, locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {anyWeighted && view !== "perList" && (
        <p className="text-xs text-vtk-muted">
          {nl
            ? "* Overgeslagen of voor een deel meegeteld op een lijst (bv. logistiek op 24UL): die lijst weegt voor die persoon minder, in de shiften en in het gemiddelde waarmee ze vergeleken wordt. Overgeslagen is 0%."
            : "* Skipped or partly counted on a list (e.g. logistics at 24UL): that list weighs less for that person, in their shifts and in the average they are compared with. Skipped is 0%."}
        </p>
      )}

      {selected && (
        <MemberDrawer
          locale={locale}
          member={selected}
          members={members}
          averages={averages}
          lists={lists}
          errorMessages={errorMessages}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}

function MemberDrawer({
  locale,
  member,
  members,
  averages,
  lists,
  errorMessages,
  onClose,
}: {
  locale: "nl" | "en";
  member: OverviewMember;
  /** Iedereen van het praesidium, om een vakje aan iemand anders te geven. */
  members: OverviewMember[];
  averages: Averages;
  lists: OverviewListRow[];
  errorMessages: Record<string, string>;
  onClose: () => void;
}) {
  const nl = locale === "nl";
  const showToast = useToast();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const shownLists = lists.filter(
    (list) => (member.perList[list.id] ?? 0) > 0 || list.id in member.listWeights || member.entries.some((e) => e.listId === list.id),
  );
  const missing = lists.filter((list) => !shownLists.includes(list));
  const heading = "mb-1 text-[11px] font-bold uppercase tracking-[0.08em] text-vtk-muted";
  const people = members.map((m) => ({ userId: m.userId, name: m.name, posts: m.posts }));
  const self = { userId: member.userId, name: member.name, posts: member.posts };

  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label={member.name}>
      <div className="absolute inset-0 bg-vtk-ink/30" onClick={onClose} />
      <div className="absolute inset-y-0 right-0 flex w-[460px] max-w-full flex-col overflow-y-auto bg-vtk-surface-elevated p-6 shadow-[-20px_0_40px_-20px_rgba(10,15,31,0.35)]">
        <div className="flex justify-end">
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label={nl ? "Sluiten" : "Close"}
            className="grid size-8 place-items-center rounded-full border border-vtk-navy/20 text-vtk-ink hover:bg-vtk-blue-soft/60"
          >
            <X size={16} aria-hidden />
          </button>
        </div>
        <div className="space-y-5">
          <div className="flex items-center gap-3">
            <div className="grid size-11 place-items-center rounded-full bg-[var(--paper-2)] text-sm font-bold text-vtk-navy">
              {initials(member.name)}
            </div>
            <div>
              <div className="text-lg font-bold tracking-tight">{member.name}</div>
              <div className="text-xs text-vtk-muted">{member.posts.join(", ")}</div>
            </div>
          </div>

          {member.phone ? (
            <div className="flex items-center justify-between gap-2 rounded-xl bg-[var(--paper)] py-2 pl-3 pr-2">
              <a href={`tel:${member.phone.replace(/\s/g, "")}`} className="text-base font-bold tabular-nums">
                {member.phone}
              </a>
              <span className="flex items-center gap-2">
                {member.phoneFromList && <span className="text-xs text-vtk-muted">{nl ? "uit een shiftenlijst" : "from a shift list"}</span>}
                <IconButton
                  label={nl ? "Nummer kopiëren" : "Copy number"}
                  onClick={async () => {
                    const ok = await copyText(member.phone ?? "");
                    showToast(
                      ok
                        ? { message: nl ? "Nummer gekopieerd." : "Number copied.", variant: "success" }
                        : { message: nl ? "Kopiëren lukte niet." : "Copy failed.", variant: "error", duration: 0 },
                    );
                  }}
                >
                  <CopyIcon />
                </IconButton>
              </span>
            </div>
          ) : (
            <p className="text-sm text-vtk-muted">
              {nl ? "Geen nummer op het profiel of in een shiftenlijst." : "No number on the profile or in a shift list."}
            </p>
          )}

          <dl className="grid grid-cols-3 gap-3">
            <div>
              <dt className="text-xs text-vtk-muted">{nl ? "Shiftenlijsten" : "Shift lists"}</dt>
              <dd className="text-xl font-semibold tabular-nums">{formatCount(member.lists, locale)}</dd>
              <dd className="text-xs text-vtk-muted">
                {nl ? "gem. " : "avg. "}
                {formatCount(member.expectedLists, locale)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-vtk-muted">{nl ? "Op /shift" : "On /shift"}</dt>
              <dd className="text-xl font-semibold tabular-nums">{member.site}</dd>
              <dd className="text-xs text-vtk-muted">
                {member.siteNecessary} {nl ? "noodzakelijk" : "necessary"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-vtk-muted">{nl ? "Verschil" : "Difference"}</dt>
              <dd className="pt-1">
                <DiffPill value={member.total - member.expectedTotal} locale={locale} />
              </dd>
              <dd className="text-xs text-vtk-muted">{nl ? "met alles samen" : "everything counted"}</dd>
            </div>
          </dl>

          <section>
            <h3 className={heading}>{nl ? "Per lijst" : "Per list"}</h3>
            {shownLists.length === 0 && (
              <p className="text-sm text-vtk-muted">{nl ? "Staat op geen enkele bevestigde lijst." : "Not on any confirmed list."}</p>
            )}
            {shownLists.map((list) => {
              const weight = weightOn(member, list.id);
              const skipped = weight === 0;
              const count = member.perList[list.id] ?? 0;
              const entries = member.entries.filter((e) => e.listId === list.id);
              const target = list.expectedPerMember !== null ? list.expectedPerMember * weight : null;
              const short = target !== null && count < target;
              return (
                <details key={list.id} className="group border-t border-[var(--rule-soft)] py-2">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm">
                    <span>
                      <span className="font-semibold">{list.name}</span>
                      {weight < 1 && (
                        <span className="ml-2 rounded-full bg-[var(--paper-2)] px-2 py-0.5 text-[11px] font-semibold text-vtk-body">
                          {skipped ? (nl ? "overgeslagen" : "skipped") : nl ? `telt voor ${formatWeight(weight, locale)}` : `counts for ${formatWeight(weight, locale)}`}
                        </span>
                      )}
                    </span>
                    <span
                      className="tabular-nums"
                      title={
                        weight < 1 && !skipped
                          ? nl
                            ? `${formatCount(count / weight, locale)} op de lijst, telt voor ${formatWeight(weight, locale)}`
                            : `${formatCount(count / weight, locale)} on the list, counts for ${formatWeight(weight, locale)}`
                          : undefined
                      }
                    >
                      {skipped ? (
                        <span className="text-vtk-muted">{nl ? "telt niet" : "does not count"}</span>
                      ) : (
                        <>
                          <strong>{formatCount(count, locale)}</strong>
                          {target !== null && (
                            <span className={`ml-1 text-xs ${short ? "text-vtk-danger" : "text-vtk-muted"}`}>
                              / {formatCount(target, locale)}
                            </span>
                          )}
                        </>
                      )}
                    </span>
                  </summary>
                  <ul className={`mt-2 space-y-0.5 text-xs text-vtk-body ${skipped ? "opacity-60" : ""}`}>
                    {entries.map((entry, i) => (
                      <EntryRow
                        key={`${entry.sheet}\u0000${entry.cell}\u0000${entry.nameKey}\u0000${entry.state}\u0000${i}`}
                        locale={locale}
                        entry={entry}
                        when={shortDate(entry.date, locale) || entry.sheet}
                        member={self}
                        people={people}
                        errorMessages={errorMessages}
                      />
                    ))}
                  </ul>
                </details>
              );
            })}
            {missing.length > 0 && (
              <p className="border-t border-[var(--rule-soft)] pt-2 text-xs text-vtk-muted">
                {nl ? "Niet op: " : "Not on: "}
                {missing.map((l) => l.name).join(", ")}
              </p>
            )}
          </section>

          <section>
            <h3 className={heading}>{nl ? "Op /shift" : "On /shift"}</h3>
            {member.siteShifts.length === 0 ? (
              <p className="text-sm text-vtk-muted">{nl ? "Geen shiften op /shift dit werkingsjaar." : "No shifts on /shift this working year."}</p>
            ) : (
              <ul>
                {member.siteShifts.map((shift) => (
                  <li key={shift.shiftId} className="flex items-center justify-between gap-2 border-t border-[var(--rule-soft)] py-2 text-sm">
                    <span>
                      {shift.name}{" "}
                      <span className="text-xs text-vtk-muted">
                        {shiftMoment(shift.startTime, locale)}
                        {shift.post ? ` · ${shift.post}` : ""}
                      </span>
                    </span>
                    <NecessityToggle shiftId={shift.shiftId} userIds={[member.userId]} necessary={shift.necessary} locale={locale} compact />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <p className="text-xs text-vtk-muted">
            {nl
              ? `Praesidiumshiften: ${formatCount(member.weeklyPast, locale)} gedaan, ${formatCount(member.weeklyUpcoming, locale)} ingepland.`
              : `Praesidium shifts: ${formatCount(member.weeklyPast, locale)} done, ${formatCount(member.weeklyUpcoming, locale)} planned.`}
            {averages.weekly > 0 && (nl ? ` Gemiddeld ${formatCount(averages.weekly, locale)}.` : ` Average ${formatCount(averages.weekly, locale)}.`)}
          </p>
        </div>
      </div>
    </div>
  );
}
