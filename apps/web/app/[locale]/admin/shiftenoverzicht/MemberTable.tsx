"use client";

import { useMemo, useState } from "react";
import { Input } from "@vtk/ui";
import { Modal } from "../admin-table";
import { CheckIcon, CopyIcon } from "@/components/ui/icons";
import { IconButton } from "@/components/ui/IconButton";
import { useToast } from "@/components/ui/toast";
import { formatCount } from "@/lib/praesidiumShifts/stats";
import type { OverviewListRow, OverviewMember } from "@/lib/praesidiumShifts/overview";
import type { Averages } from "@/lib/praesidiumShifts/stats";
import { NecessityToggle } from "./NecessityToggle";

type Basis = "lists" | "total";
type Filter = "all" | "below" | "above";
type View = "totals" | "perList";
type SortKey = "name" | "lists" | "site" | "siteNecessary" | "siteVoluntary" | "total" | "delta";

/** Een kommagetal zoals de vice het schrijft, met een teken ervoor. */
function signed(value: number, locale: "nl" | "en"): string {
  const rounded = Math.round(value * 10) / 10;
  if (rounded === 0) return "0";
  return `${rounded > 0 ? "+" : "−"}${formatCount(Math.abs(rounded), locale)}`;
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

/**
 * Hoe iemands shiften verdeeld zijn: shiftenlijsten, noodzakelijke en
 * vrijwillige shiften op /shift, naast elkaar op dezelfde schaal voor iedereen.
 * Het streepje is het gemiddelde van wat je vergelijkt: bij "Shiftenlijsten"
 * vergelijk je het einde van het blauwe deel, bij "Alles" het einde van de balk.
 */
function DistributionBar({
  member,
  max,
  average,
  nl,
}: {
  member: OverviewMember;
  max: number;
  average: number;
  nl: boolean;
}) {
  if (max <= 0) return null;
  const pct = (value: number) => `${(value / max) * 100}%`;
  const parts = [
    { value: member.lists, color: "var(--chart-1)", label: nl ? "Shiftenlijsten" : "Shift lists" },
    { value: member.siteNecessary, color: "var(--chart-2)", label: nl ? "Noodzakelijk op /shift" : "Necessary on /shift" },
    { value: member.siteVoluntary, color: "var(--chart-3)", label: nl ? "Vrije wil op /shift" : "Voluntary on /shift" },
  ].filter((part) => part.value > 0);
  return (
    <div className="relative h-3 w-full min-w-24" aria-hidden>
      <div className="absolute inset-y-0 left-0 flex gap-[2px]" style={{ width: pct(member.total) }}>
        {parts.map((part) => (
          <span
            key={part.label}
            title={`${part.label}: ${formatCount(part.value, nl ? "nl" : "en")}`}
            className="h-full first:rounded-l-[4px] last:rounded-r-[4px]"
            style={{ width: `${(part.value / member.total) * 100}%`, background: part.color }}
          />
        ))}
      </div>
      <span
        className="absolute -top-0.5 -bottom-0.5 w-[2px] rounded-full bg-vtk-ink"
        style={{ left: `calc(${pct(average)} - 1px)` }}
        title={nl ? "Gemiddelde" : "Average"}
      />
    </div>
  );
}

function Legend({ nl }: { nl: boolean }) {
  const items = [
    { color: "var(--chart-1)", label: nl ? "Shiftenlijsten" : "Shift lists" },
    { color: "var(--chart-2)", label: nl ? "Noodzakelijk op /shift" : "Necessary on /shift" },
    { color: "var(--chart-3)", label: nl ? "Vrije wil op /shift" : "Voluntary on /shift" },
  ];
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-vtk-muted">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          <span aria-hidden className="inline-block size-2.5 rounded-[3px]" style={{ background: item.color }} />
          {item.label}
        </li>
      ))}
      <li className="flex items-center gap-1.5">
        <span aria-hidden className="inline-block h-3 w-[2px] rounded-full bg-vtk-ink" />
        {nl ? "Gemiddelde" : "Average"}
      </li>
    </ul>
  );
}

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-semibold uppercase tracking-[0.08em] text-vtk-muted">{label}</span>
      <div className="inline-flex rounded-full border border-vtk-blue/15 bg-white p-0.5" role="group" aria-label={label}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              value === option.value ? "bg-vtk-ink text-white" : "text-vtk-ink hover:bg-vtk-blue-soft/60"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function MemberTable({
  locale,
  members,
  averages,
  lists,
}: {
  locale: "nl" | "en";
  members: OverviewMember[];
  averages: Averages;
  /** Bevestigde shiftenlijsten van dit jaar, in volgorde, voor de weergave per lijst. */
  lists: OverviewListRow[];
}) {
  const nl = locale === "nl";
  const showToast = useToast();
  const [basis, setBasis] = useState<Basis>("lists");
  const [filter, setFilter] = useState<Filter>("all");
  const [view, setView] = useState<View>("totals");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "delta", dir: 1 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const avg = basis === "lists" ? averages.lists : averages.total;
  const valueOf = (m: OverviewMember) => (basis === "lists" ? m.lists : m.total);
  const maxTotal = Math.max(0, ...members.map((m) => m.total));

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = members.filter((m) => {
      if (q && !m.name.toLowerCase().includes(q) && !m.posts.some((p) => p.toLowerCase().includes(q))) return false;
      const value = basis === "lists" ? m.lists : m.total;
      if (filter === "below") return value < avg;
      if (filter === "above") return value > avg;
      return true;
    });
    const key = (m: OverviewMember): number | string => {
      switch (sort.key) {
        case "name":
          return m.name.toLowerCase();
        case "delta":
          return (basis === "lists" ? m.lists : m.total) - avg;
        default:
          return m[sort.key];
      }
    };
    return [...filtered].sort((a, b) => {
      const ka = key(a);
      const kb = key(b);
      const cmp = typeof ka === "string" ? ka.localeCompare(String(kb), "nl") : ka - (kb as number);
      return cmp * sort.dir || a.name.localeCompare(b.name, "nl");
    });
  }, [members, query, filter, basis, avg, sort]);

  const selected = members.find((m) => m.userId === selectedId) ?? null;
  const withPhone = rows.filter((m) => m.phone);

  async function copyPhones() {
    const text = withPhone.map((m) => `${m.name}: ${m.phone}`).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      showToast({
        message: nl ? `${withPhone.length} nummers gekopieerd.` : `${withPhone.length} numbers copied.`,
        variant: "success",
      });
    } catch {
      showToast({
        message: nl ? "Kopiëren lukte niet; je browser liet het klembord niet toe." : "Copy failed; your browser blocked the clipboard.",
        variant: "error",
        duration: 0,
      });
    }
  }

  const sortButton = (key: SortKey, label: string, align: "left" | "right" = "right") => (
    <button
      type="button"
      onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : key === "name" ? 1 : -1 }))}
      className={`inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.08em] hover:text-vtk-ink ${align === "right" ? "w-full justify-end" : ""}`}
      aria-label={`${label}: ${nl ? "sorteren" : "sort"}`}
    >
      {label}
      {sort.key === key && <span aria-hidden>{sort.dir === 1 ? "↑" : "↓"}</span>}
    </button>
  );

  const delta = (m: OverviewMember) => {
    const d = valueOf(m) - avg;
    const tone =
      d <= -1 ? "text-vtk-danger" : d >= 1 ? "text-[var(--ok-ink)]" : "text-vtk-muted";
    return <span className={`font-medium tabular-nums ${tone}`}>{signed(d, locale)}</span>;
  };

  const sum = (pick: (m: OverviewMember) => number) => members.reduce((s, m) => s + pick(m), 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <Segmented
            label={nl ? "Vergelijk" : "Compare"}
            value={basis}
            onChange={setBasis}
            options={[
              { value: "lists", label: nl ? "Shiftenlijsten" : "Shift lists" },
              { value: "total", label: nl ? "Alles" : "Everything" },
            ]}
          />
          <Segmented
            label={nl ? "Toon" : "Show"}
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: nl ? "Iedereen" : "Everyone" },
              { value: "below", label: nl ? "Onder gemiddeld" : "Below average" },
              { value: "above", label: nl ? "Boven gemiddeld" : "Above average" },
            ]}
          />
          {lists.length > 0 && (
            <Segmented
              label={nl ? "Weergave" : "View"}
              value={view}
              onChange={setView}
              options={[
                { value: "totals", label: nl ? "Totalen" : "Totals" },
                { value: "perList", label: nl ? "Per lijst" : "Per list" },
              ]}
            />
          )}
        </div>
        <div className="flex items-center gap-2">
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
            placeholder={nl ? "Zoek op naam of post" : "Search name or post"}
            className="h-9 w-56"
            aria-label={nl ? "Zoek op naam of post" : "Search name or post"}
          />
          <IconButton
            label={
              withPhone.length
                ? nl
                  ? `Kopieer de nummers van wie je nu ziet (${withPhone.length})`
                  : `Copy the numbers of who you see (${withPhone.length})`
                : nl
                  ? "Niemand hierboven heeft een nummer"
                  : "Nobody shown has a number"
            }
            onClick={copyPhones}
            disabled={withPhone.length === 0}
          >
            {copied ? <CheckIcon /> : <CopyIcon />}
          </IconButton>
        </div>
      </div>

      <p className="text-sm text-vtk-body">
        {nl ? "Gemiddeld per praesidiumlid: " : "Average per praesidium member: "}
        <strong className="font-semibold tabular-nums">{formatCount(averages.lists, locale)}</strong>
        {nl ? " op de shiftenlijsten, " : " on the shift lists, "}
        <strong className="font-semibold tabular-nums">{formatCount(averages.total, locale)}</strong>
        {nl ? " met de shiften op /shift erbij (waarvan " : " including the shifts on /shift (of which "}
        <span className="tabular-nums">{formatCount(averages.siteNecessary, locale)}</span>
        {nl ? " noodzakelijk)." : " necessary)."}
        {filter !== "all" && (
          <span className="text-vtk-muted">
            {" "}
            {nl ? `${rows.length} van de ${members.length} getoond.` : `${rows.length} of ${members.length} shown.`}
          </span>
        )}
      </p>

      {view === "totals" ? (
        <>
          <Legend nl={nl} />
          <div className="relative overflow-x-auto rounded-[18px] border border-vtk-blue/10 bg-vtk-surface-elevated">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="border-b border-vtk-blue/10 text-left text-xs text-vtk-muted">
                <tr>
                  <th className="px-4 py-2.5">{sortButton("name", nl ? "Naam" : "Name", "left")}</th>
                  <th className="px-2 py-2.5 font-semibold">{nl ? "Telefoon" : "Phone"}</th>
                  <th className="px-2 py-2.5 text-right!">{sortButton("lists", nl ? "Lijsten" : "Lists")}</th>
                  <th className="px-2 py-2.5 text-right!">{sortButton("site", nl ? "Site" : "Site")}</th>
                  <th className="px-2 py-2.5 text-right!">{sortButton("siteNecessary", nl ? "Nood." : "Nec.")}</th>
                  <th className="px-2 py-2.5 text-right!">{sortButton("siteVoluntary", nl ? "Vrij" : "Vol.")}</th>
                  <th className="px-2 py-2.5 text-right!">{sortButton("total", nl ? "Alles" : "All")}</th>
                  <th className="px-2 py-2.5 text-right!">{sortButton("delta", nl ? "t.o.v. gem." : "vs avg.")}</th>
                  <th className="w-36 px-4 py-2.5 font-semibold">
                    <span className="sr-only">{nl ? "Verdeling" : "Distribution"}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => (
                  <tr
                    key={m.userId}
                    onClick={(event) => {
                      if ((event.target as Element).closest("a, button")) return;
                      setSelectedId(m.userId);
                    }}
                    className="cursor-pointer border-b border-vtk-blue/5 last:border-0 hover:bg-vtk-blue-soft/30"
                  >
                    <td className="px-4 py-2">
                      <button
                        type="button"
                        onClick={() => setSelectedId(m.userId)}
                        className="text-left font-medium text-vtk-ink hover:underline"
                      >
                        {m.name}
                      </button>
                      <div className="text-xs text-vtk-muted">{m.posts.join(", ")}</div>
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 text-vtk-body">
                      {m.phone ? (
                        <a href={`tel:${m.phone.replace(/\s/g, "")}`} className="tabular-nums hover:underline">
                          {m.phone}
                        </a>
                      ) : (
                        <span className="text-xs text-vtk-muted">{nl ? "geen nummer" : "no number"}</span>
                      )}
                      {m.phoneFromList && (
                        <span className="ml-1 text-[11px] text-vtk-muted" title={nl ? "Uit het overzicht van een shiftenlijst; niet op het profiel." : "From a shift list overview; not on the profile."}>
                          {nl ? "(lijst)" : "(list)"}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">{formatCount(m.lists, locale)}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{formatCount(m.site, locale)}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-vtk-body">{formatCount(m.siteNecessary, locale)}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-vtk-body">{formatCount(m.siteVoluntary, locale)}</td>
                    <td className="px-2 py-2 text-right font-semibold tabular-nums">{formatCount(m.total, locale)}</td>
                    <td className="px-2 py-2 text-right">{delta(m)}</td>
                    <td className="px-4 py-2">
                      <DistributionBar member={m} max={maxTotal} average={avg} nl={nl} />
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-6 text-center text-sm text-vtk-muted">
                      {nl ? "Niemand past bij deze filter." : "Nobody matches this filter."}
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot className="border-t border-vtk-blue/10 text-xs text-vtk-muted">
                <tr>
                  <th scope="row" className="px-4 py-2 text-left font-semibold">
                    {nl ? "Gemiddelde" : "Average"}
                  </th>
                  <td />
                  <td className="px-2 py-2 text-right tabular-nums">{formatCount(averages.lists, locale)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{formatCount(averages.site, locale)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{formatCount(averages.siteNecessary, locale)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{formatCount(averages.siteVoluntary, locale)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{formatCount(averages.total, locale)}</td>
                  <td colSpan={2} />
                </tr>
                <tr>
                  <th scope="row" className="px-4 pb-3 text-left font-semibold">
                    {nl ? "Totaal" : "Total"}
                  </th>
                  <td />
                  <td className="px-2 pb-3 text-right tabular-nums">{formatCount(sum((m) => m.lists), locale)}</td>
                  <td className="px-2 pb-3 text-right tabular-nums">{formatCount(sum((m) => m.site), locale)}</td>
                  <td className="px-2 pb-3 text-right tabular-nums">{formatCount(sum((m) => m.siteNecessary), locale)}</td>
                  <td className="px-2 pb-3 text-right tabular-nums">{formatCount(sum((m) => m.siteVoluntary), locale)}</td>
                  <td className="px-2 pb-3 text-right tabular-nums">{formatCount(sum((m) => m.total), locale)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      ) : (
        <div className="relative overflow-x-auto rounded-[18px] border border-vtk-blue/10 bg-vtk-surface-elevated">
          <table className="w-full text-sm">
            <thead className="border-b border-vtk-blue/10 text-left text-xs text-vtk-muted">
              <tr>
                <th className="sticky left-0 z-10 bg-vtk-surface-elevated px-4 py-2.5">{sortButton("name", nl ? "Naam" : "Name", "left")}</th>
                {lists.map((list) => (
                  <th key={list.id} className="px-2 py-2.5 text-right! font-semibold" title={list.name}>
                    <span className="block max-w-28 truncate">{list.name}</span>
                    {list.expectedPerMember !== null && (
                      <span className="block font-normal">
                        {nl ? "richtlijn " : "target "}
                        {formatCount(list.expectedPerMember, locale)}
                      </span>
                    )}
                  </th>
                ))}
                <th className="px-4 py-2.5 text-right!">{sortButton("lists", nl ? "Totaal" : "Total")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.userId} className="border-b border-vtk-blue/5 last:border-0">
                  <td className="sticky left-0 z-10 bg-vtk-surface-elevated px-4 py-2">
                    <button
                      type="button"
                      onClick={() => setSelectedId(m.userId)}
                      className="whitespace-nowrap text-left font-medium text-vtk-ink hover:underline"
                    >
                      {m.name}
                    </button>
                  </td>
                  {lists.map((list) => {
                    const value = m.perList[list.id] ?? 0;
                    const short = list.expectedPerMember !== null && value < list.expectedPerMember;
                    return (
                      <td
                        key={list.id}
                        className={`px-2 py-2 text-right tabular-nums ${
                          value === 0 ? "text-vtk-muted" : short ? "text-vtk-danger" : ""
                        }`}
                        title={
                          short
                            ? nl
                              ? `${formatCount(list.expectedPerMember! - value, locale)} onder de richtlijn`
                              : `${formatCount(list.expectedPerMember! - value, locale)} below the target`
                            : undefined
                        }
                      >
                        {formatCount(value, locale)}
                        {short && <span className="sr-only">{nl ? " (onder de richtlijn)" : " (below target)"}</span>}
                      </td>
                    );
                  })}
                  <td className="px-4 py-2 text-right font-semibold tabular-nums">{formatCount(m.lists, locale)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-vtk-blue/10 text-xs text-vtk-muted">
              <tr>
                <th scope="row" className="sticky left-0 bg-vtk-surface-elevated px-4 py-2 text-left font-semibold">
                  {nl ? "Gemiddelde" : "Average"}
                </th>
                {lists.map((list) => (
                  <td key={list.id} className="px-2 py-2 text-right tabular-nums">
                    {formatCount(list.average, locale)}
                  </td>
                ))}
                <td className="px-4 py-2 text-right tabular-nums">{formatCount(averages.lists, locale)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {selected && (
        <MemberDetail
          locale={locale}
          member={selected}
          averages={averages}
          lists={lists}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}

function MemberDetail({
  locale,
  member,
  averages,
  lists,
  onClose,
}: {
  locale: "nl" | "en";
  member: OverviewMember;
  averages: Averages;
  lists: OverviewListRow[];
  onClose: () => void;
}) {
  const nl = locale === "nl";
  const listName = (id: string) => lists.find((l) => l.id === id)?.name ?? "";
  const listIds = [...new Set(member.entries.map((e) => e.listId))];
  const missing = lists.filter((l) => !(member.perList[l.id] > 0));

  return (
    <Modal title={member.name} onClose={onClose} size="lg">
      <div className="space-y-5 text-sm">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-vtk-body">
          <span>{member.posts.join(", ")}</span>
          {member.phone ? (
            <a href={`tel:${member.phone.replace(/\s/g, "")}`} className="font-medium tabular-nums text-vtk-ink hover:underline">
              {member.phone}
              {member.phoneFromList && <span className="ml-1 text-xs font-normal text-vtk-muted">{nl ? "(uit een shiftenlijst)" : "(from a shift list)"}</span>}
            </a>
          ) : (
            <span className="text-vtk-muted">
              {nl ? "Geen nummer op het profiel of in een shiftenlijst." : "No number on the profile or in a shift list."}
            </span>
          )}
        </div>

        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: nl ? "Shiftenlijsten" : "Shift lists", value: member.lists, avg: averages.lists },
            { label: nl ? "Noodzakelijk op /shift" : "Necessary on /shift", value: member.siteNecessary, avg: averages.siteNecessary },
            { label: nl ? "Vrije wil op /shift" : "Voluntary on /shift", value: member.siteVoluntary, avg: averages.siteVoluntary },
            { label: nl ? "Alles" : "Everything", value: member.total, avg: averages.total },
          ].map((item) => (
            <div key={item.label} className="rounded-xl border border-vtk-blue/10 px-3 py-2">
              <dt className="text-xs text-vtk-muted">{item.label}</dt>
              <dd className="text-lg font-semibold tabular-nums">
                {formatCount(item.value, locale)}
                <span className="ml-1.5 text-xs font-normal text-vtk-muted">
                  {nl ? "gem. " : "avg. "}
                  {formatCount(item.avg, locale)}
                </span>
              </dd>
            </div>
          ))}
        </dl>

        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-vtk-muted">
            {nl ? "Op de shiftenlijsten" : "On the shift lists"}
          </h3>
          {listIds.length === 0 && (
            <p className="text-vtk-muted">{nl ? "Staat op geen enkele bevestigde shiftenlijst." : "Not on any confirmed shift list."}</p>
          )}
          {listIds.map((listId) => {
            const list = lists.find((l) => l.id === listId);
            const entries = member.entries.filter((e) => e.listId === listId);
            const count = member.perList[listId] ?? 0;
            return (
              <div key={listId} className="rounded-xl border border-vtk-blue/10">
                <div className="flex items-baseline justify-between gap-3 border-b border-vtk-blue/5 px-3 py-2">
                  <span className="font-medium">{listName(listId)}</span>
                  <span className="tabular-nums">
                    <strong>{formatCount(count, locale)}</strong>
                    {list?.expectedPerMember !== null && list?.expectedPerMember !== undefined && (
                      <span className={`ml-1 text-xs ${count < list.expectedPerMember ? "text-vtk-danger" : "text-vtk-muted"}`}>
                        / {formatCount(list.expectedPerMember, locale)}
                      </span>
                    )}
                  </span>
                </div>
                <ul className="divide-y divide-vtk-blue/5">
                  {entries.map((entry, i) => (
                    <li key={i} className="grid grid-cols-[7rem_7rem_1fr_auto] gap-2 px-3 py-1.5 text-xs text-vtk-body max-sm:grid-cols-2">
                      <span>{shortDate(entry.date, locale) || entry.sheet}</span>
                      <span className="tabular-nums">{entry.slot ?? ""}</span>
                      <span className="truncate" title={entry.role ?? ""}>
                        {entry.role ?? ""}
                        {entry.label !== member.name && <span className="text-vtk-muted"> · {entry.label}</span>}
                      </span>
                      <span className="text-right tabular-nums">{entry.weight !== 1 ? formatCount(entry.weight, locale) : ""}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
          {missing.length > 0 && listIds.length > 0 && (
            <p className="text-xs text-vtk-muted">
              {nl ? "Niet op: " : "Not on: "}
              {missing.map((l) => l.name).join(", ")}
            </p>
          )}
        </section>

        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-vtk-muted">{nl ? "Op /shift" : "On /shift"}</h3>
          {member.siteShifts.length === 0 ? (
            <p className="text-vtk-muted">{nl ? "Geen shiften op /shift dit werkingsjaar." : "No shifts on /shift this working year."}</p>
          ) : (
            <ul className="divide-y divide-vtk-blue/5 rounded-xl border border-vtk-blue/10">
              {member.siteShifts.map((shift) => (
                <li key={shift.shiftId} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                  <div>
                    <div className="font-medium">{shift.name}</div>
                    <div className="text-xs text-vtk-muted">
                      {shiftMoment(shift.startTime, locale)}
                      {shift.post ? ` · ${shift.post}` : ""}
                    </div>
                  </div>
                  <NecessityToggle shiftId={shift.shiftId} userIds={[member.userId]} necessary={shift.necessary} locale={locale} />
                </li>
              ))}
            </ul>
          )}
        </section>

        {member.weekly.length > 0 && (
          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-vtk-muted">
              {nl ? "Praesidiumshiften" : "Praesidium shifts"}
            </h3>
            <ul className="divide-y divide-vtk-blue/5 rounded-xl border border-vtk-blue/10">
              {member.weekly.map((entry, i) => (
                <li key={i} className="grid grid-cols-[7rem_1fr_auto] gap-2 px-3 py-1.5 text-xs text-vtk-body">
                  <span>{shortDate(entry.date, locale)}</span>
                  <span>{entry.role}</span>
                  <span className="tabular-nums">{entry.slot ?? ""}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </Modal>
  );
}
