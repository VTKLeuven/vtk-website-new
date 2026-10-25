"use client";

import { Fragment, useEffect, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { statsOf } from "@/lib/bo/dossiers";
import { findDossier, SECTIONS, type ExplorerData, type Stats, type XDoc, type XDossier, type XMeeting, type XPost } from "@/lib/bo/explorer";
import {
  groupByMeeting,
  groupDossiers,
  lastMeetingDate,
  LIST_FILTERS,
  LIST_GROUPS,
  matchesFilters,
  type ListFilter,
  type ListGroup,
} from "@/lib/bo/list";
import { boRange, dossierNotes, Files, HideDossierButton, Lines, linesOf, PostLinks, Progress, Stand, sumLines, Timeline, useFormat, type Fmt, type Locale, type Sheet } from "./BoParts";
import { ChangePosts, type PostChoice } from "./BoReview";

/*
 * De lijstweergave van /admin/bestuursorgaan, naast de verkenner: zoals Odoo
 * een lijst die je filtert en groepeert (op post, BO, stand of maand), met per
 * groep het aantal, het percentage en de sommen, en achter elke rij een
 * formulier. Een post en een BO hebben elk hun eigen formulier.
 *
 * Zelfde URL als de verkenner (`?post=`, `?bo=`, `?activiteit=`, `?blad=`),
 * zodat een gedeelde link in beide weergaven op dezelfde plek uitkomt. Wat
 * enkel hier bestaat: `groep`, `filter`, `zoek`, `grafiek` en `postblad`.
 */

const FILTER_LABELS: Record<ListFilter, [string, string]> = {
  open: ["Resultaat open", "Result missing"],
  komt: ["Komt nog", "Upcoming"],
  af: ["Resultaat binnen", "Result in"],
  slechter: ["Slechter dan budget", "Worse than budget"],
  boven: ["Budget boven begroting", "Budget above allocation"],
};

const GROUP_LABELS: Record<ListGroup, [string, string]> = {
  post: ["Post", "Post"],
  bo: ["BO", "Meeting"],
  stand: ["Stand", "Status"],
  maand: ["Maand van het budget", "Month of the budget"],
};

type PostSheet = "activiteiten" | "bos" | "posten";
type Go = (changes: Record<string, string | null>, push?: boolean) => void;

export function BoList({
  data,
  locale,
  errorMessages,
  posts,
  switcher,
}: {
  data: ExplorerData;
  locale: Locale;
  errorMessages: Record<string, string>;
  posts: readonly PostChoice[];
  switcher: ReactNode;
}) {
  const f = useFormat(locale);
  const { nl } = f;
  const params = useSearchParams();
  const [menu, setMenu] = useState<null | "filter" | "groep">(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const groupParam = params.get("groep");
  const group: ListGroup = (LIST_GROUPS as readonly string[]).includes(groupParam ?? "") ? (groupParam as ListGroup) : "post";
  const filters = (params.get("filter") ?? "")
    .split(",")
    .filter((x): x is ListFilter => (LIST_FILTERS as readonly string[]).includes(x));
  const query = params.get("zoek") ?? "";
  const graph = params.get("grafiek") === "1";
  const dossier = findDossier(data.dossiers, params.get("activiteit"));
  const meeting = data.meetings.find((m) => m.id === params.get("bo")) ?? null;
  const post = data.posts.find((p) => p.key === params.get("post")) ?? null;
  const sheetParam = params.get("blad");
  const sheet: Sheet = sheetParam === "tijdlijn" || sheetParam === "bestanden" ? sheetParam : "bedragen";
  const postSheetParam = params.get("postblad");
  const postSheet: PostSheet = postSheetParam === "bos" || postSheetParam === "posten" ? postSheetParam : "activiteiten";

  const go: Go = (changes, push = true) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value === null || value === "") next.delete(key);
      else next.set(key, value);
    }
    const url = `?${next.toString()}`;
    if (push) window.history.pushState(null, "", url);
    else window.history.replaceState(null, "", url);
  };

  useEffect(() => {
    if (!menu) return;
    const close = (event: MouseEvent) => {
      if (!(event.target as Element).closest(".vtk-bo-l-tools")) setMenu(null);
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [menu]);

  // Kruimelpad: de lijst, dan de post of de BO, dan de activiteit.
  const crumbs: { label: string; changes: Record<string, null> }[] = [
    { label: nl ? "Budgetten en resultaten" : "Budgets and results", changes: { post: null, bo: null, activiteit: null } },
  ];
  if (post) crumbs.push({ label: post.name, changes: { bo: null, activiteit: null } });
  if (meeting) crumbs.push({ label: meeting.label, changes: { activiteit: null } });
  if (dossier) crumbs.push({ label: dossier.activity, changes: {} });

  // Vorige en volgende BO, in de volgorde van het jaar.
  const chronological = [...data.meetings].reverse();
  const at = meeting ? chronological.findIndex((m) => m.id === meeting.id) : -1;
  const pager =
    meeting && !dossier ? (
      <span className="vtk-bo-l-pager">
        <span className="tabular-nums">
          {at + 1} / {chronological.length}
        </span>
        <button type="button" aria-label={nl ? "Vorige BO" : "Previous meeting"} disabled={at <= 0} onClick={() => go({ bo: chronological[at - 1].id })}>
          ‹
        </button>
        <button
          type="button"
          aria-label={nl ? "Volgende BO" : "Next meeting"}
          disabled={at >= chronological.length - 1}
          onClick={() => go({ bo: chronological[at + 1].id })}
        >
          ›
        </button>
      </span>
    ) : null;

  let body: ReactNode;
  if (dossier) {
    body = (
      <DossierForm
        dossier={dossier}
        sheet={sheet}
        today={data.today}
        f={f}
        errorMessages={errorMessages}
        posts={posts}
        locale={locale}
        go={go}
      />
    );
  } else if (meeting) {
    body = <MeetingForm meeting={meeting} data={data} f={f} go={go} />;
  } else if (post) {
    body = <PostForm post={post} data={data} sheet={postSheet} f={f} go={go} />;
  } else {
    const list = data.dossiers.filter((d) => matchesFilters(d, filters, query));
    // Wie zoekt of filtert, wil de rijen zien; anders begint elke groep dicht.
    const expandAll = Boolean(query) || filters.length > 0;
    const isOpen = (key: string) => (expandAll ? open[key] !== false : Boolean(open[key]));
    const toggle = (key: string) => setOpen((o) => ({ ...o, [key]: !isOpen(key) }));
    const groupKeys =
      group === "bo" ? groupByMeeting(list, data.meetings).map((g) => g.meeting.id) : groupDossiers(list, group, data.posts, nl).map((g) => g.key);
    const anyOpen = groupKeys.some(isOpen);

    body = (
      <>
        <div className="vtk-bo-l-searchrow">
          <label className="vtk-bo-l-search">
            {filters.map((key) => (
              <span key={key} className="vtk-bo-l-facet">
                <span className="k">Filter</span>
                {FILTER_LABELS[key][nl ? 0 : 1]}
                <button
                  type="button"
                  aria-label={nl ? `Filter weghalen: ${FILTER_LABELS[key][0]}` : `Remove filter: ${FILTER_LABELS[key][1]}`}
                  onClick={(event) => {
                    event.preventDefault();
                    go({ filter: filters.filter((x) => x !== key).join(",") || null }, false);
                  }}
                >
                  ×
                </button>
              </span>
            ))}
            <span className="vtk-bo-l-facet">
              <span className="k">{nl ? "Groeperen" : "Group"}</span>
              {GROUP_LABELS[group][nl ? 0 : 1]}
            </span>
            <input
              id="bo-list-search"
              type="search"
              defaultValue={query}
              placeholder={nl ? "Zoek een activiteit of post" : "Search an activity or post"}
              aria-label={nl ? "Zoeken" : "Search"}
              onChange={(event) => go({ zoek: event.target.value || null }, false)}
            />
          </label>
          <div className="vtk-bo-l-tools">
            <button type="button" className="vtk-bo-l-dd" aria-expanded={menu === "filter"} onClick={() => setMenu(menu === "filter" ? null : "filter")}>
              Filters ▾
            </button>
            <button type="button" className="vtk-bo-l-dd" aria-expanded={menu === "groep"} onClick={() => setMenu(menu === "groep" ? null : "groep")}>
              {nl ? "Groeperen" : "Group by"} ▾
            </button>
            <span className="vtk-bo-views" role="group" aria-label={nl ? "Lijst of grafiek" : "List or chart"}>
              <button type="button" aria-pressed={!graph} onClick={() => go({ grafiek: null }, false)}>
                {nl ? "Lijst" : "List"}
              </button>
              <button type="button" aria-pressed={graph} onClick={() => go({ grafiek: "1" }, false)}>
                {nl ? "Grafiek" : "Chart"}
              </button>
            </span>
            {menu === "filter" && (
              <div className="vtk-bo-l-menu" role="menu">
                <p className="hd">Filters</p>
                {LIST_FILTERS.map((key) => (
                  <button
                    key={key}
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={filters.includes(key)}
                    onClick={() =>
                      go({ filter: (filters.includes(key) ? filters.filter((x) => x !== key) : [...filters, key]).join(",") || null }, false)
                    }
                  >
                    <span className="chk">{filters.includes(key) ? "✓" : ""}</span>
                    {FILTER_LABELS[key][nl ? 0 : 1]}
                  </button>
                ))}
              </div>
            )}
            {menu === "groep" && (
              <div className="vtk-bo-l-menu" role="menu">
                <p className="hd">{nl ? "Groeperen op" : "Group by"}</p>
                {LIST_GROUPS.map((key) => (
                  <button
                    key={key}
                    type="button"
                    role="menuitemradio"
                    aria-checked={group === key}
                    onClick={() => {
                      setMenu(null);
                      setOpen({});
                      go({ groep: key === "post" ? null : key }, false);
                    }}
                  >
                    <span className="chk">{group === key ? "✓" : ""}</span>
                    {GROUP_LABELS[key][nl ? 0 : 1]}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        {!graph && (
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-vtk-muted">
            <span>
              {nl
                ? "Klik op een groep om ze open te klappen, op een rij om de activiteit te openen."
                : "Click a group to expand it, a row to open the activity."}
            </span>
            <button
              type="button"
              className="vtk-bo-link"
              onClick={() => setOpen(Object.fromEntries(groupKeys.map((key) => [key, !anyOpen])))}
            >
              {anyOpen ? (nl ? "Alles dichtklappen" : "Collapse all") : nl ? "Alles openklappen" : "Expand all"}
            </button>
          </div>
        )}
        {graph ? (
          <Graph list={list} group={group} data={data} f={f} />
        ) : group === "bo" ? (
          <MeetingTable list={list} data={data} f={f} go={go} isOpen={isOpen} toggle={toggle} />
        ) : (
          <GroupTable list={list} group={group} data={data} f={f} go={go} isOpen={isOpen} toggle={toggle} />
        )}
      </>
    );
  }

  return (
    <div className="vtk-bo-l grid gap-3">
      <div className="vtk-bo-l-cp">
        <nav className="vtk-bo-l-crumbs" aria-label={nl ? "Kruimelpad" : "Breadcrumb"}>
          {crumbs.map((crumb, i) =>
            i < crumbs.length - 1 ? (
              <span key={i} className="flex items-baseline gap-2">
                <button type="button" onClick={() => go(crumb.changes)}>
                  {crumb.label}
                </button>
                <span className="sep">/</span>
              </span>
            ) : (
              <span key={i} aria-current="page">
                {crumb.label}
              </span>
            ),
          )}
        </nav>
        <div className="flex flex-wrap items-center gap-2">
          {pager}
          {switcher}
        </div>
      </div>
      {body}
    </div>
  );
}

/** De stand: het woord in de pil, en wat erbij hoort als tekst ernaast. */
function sumOf(list: XDossier[], pick: (d: XDossier) => number | null): number {
  return list.reduce((total, d) => total + (pick(d) ?? 0), 0);
}

function Dev({ cents, f }: { cents: number; f: Fmt }) {
  return (
    <span className="vtk-bo-dev" data-tone={cents > 0 ? "up" : cents < 0 ? "down" : undefined} title={f.nl ? "Resultaat min budget" : "Result minus budget"}>
      {f.signed0(cents)}
    </span>
  );
}

/** Groepsrij: dicht toont ze al het aantal, het percentage en de sommen. */
function GroupHead({
  label,
  count,
  stats,
  budget,
  span,
  open,
  onToggle,
  onOpen,
  extra,
  f,
}: {
  label: string;
  count: number;
  stats: Stats;
  budget: number;
  span: number;
  open: boolean;
  onToggle: () => void;
  onOpen?: () => void;
  extra?: ReactNode;
  f: Fmt;
}) {
  const { nl } = f;
  return (
    <tr className="vtk-bo-l-grp" onClick={onToggle}>
      <td colSpan={span}>
        <span className="vtk-bo-l-gl">
          <button type="button" className="vtk-bo-l-car" aria-expanded={open} aria-label={open ? (nl ? `${label} dichtklappen` : `Collapse ${label}`) : nl ? `${label} openklappen` : `Expand ${label}`}>
            <span aria-hidden="true" data-open={open}>▸</span>
          </button>
          <b>{label}</b>
          <span className="text-vtk-muted">({count})</span>
          {stats.due > 0 ? (
            <span className="inline-flex items-center gap-1.5">
              <Progress value={stats.pct} />
              <span className="tabular-nums">
                {stats.done}/{stats.due} · {f.pct(stats.pct)}
              </span>
            </span>
          ) : (
            <span className="font-normal text-vtk-muted">{nl ? "nog niets voorbij" : "nothing past yet"}</span>
          )}
          {extra}
          {onOpen && (
            <button
              type="button"
              className="vtk-bo-link text-xs"
              onClick={(event) => {
                event.stopPropagation();
                onOpen();
              }}
            >
              {nl ? "openen" : "open"}
            </button>
          )}
        </span>
      </td>
      <td className="num" data-label="Budget">{f.euro0(budget)}</td>
      <td className="num" data-label={nl ? "Resultaat" : "Result"}>{stats.done ? f.euro0(stats.sumResult) : "–"}</td>
      <td data-label={nl ? "Afwijking" : "Deviation"}>{stats.done > 0 && <Dev cents={stats.sumDev} f={f} />}</td>
    </tr>
  );
}

/** "BO 5 (20 sep) → BO 9": waar het budget en het resultaat passeerden, met de datum die telt. */
function GroupTable({
  list,
  group,
  data,
  f,
  go,
  isOpen,
  toggle,
}: {
  list: XDossier[];
  group: Exclude<ListGroup, "bo">;
  data: ExplorerData;
  f: Fmt;
  go: Go;
  isOpen: (key: string) => boolean;
  toggle: (key: string) => void;
}) {
  const { nl } = f;
  const groups = groupDossiers(list, group, data.posts, nl);
  const showPost = group !== "post";
  const span = showPost ? 3 : 2;
  // Een activiteit van twee posten staat in twee groepen, maar telt één keer.
  const total = [...new Map(groups.flatMap((g) => g.dossiers).map((d) => [d.key, d])).values()];
  const all = statsOf(total);
  const sectionOf = (g: (typeof groups)[number]) => data.posts.find((p) => p.key === g.postKey)?.section;
  if (groups.length === 0) return <Empty f={f} />;
  return (
    <div className="vtk-bo-l-wrap">
      <table className="vtk-bo-l-table">
        <thead>
          <tr>
            <th>{nl ? "Activiteit" : "Activity"}</th>
            {showPost && <th>Post</th>}
            <th>BO</th>
            <th className="num">Budget</th>
            <th className="num">{nl ? "Resultaat" : "Result"}</th>
            <th>{nl ? "Stand" : "Status"}</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g, i) => (
            <Fragment key={g.key}>
              {group === "post" && sectionOf(g) !== (i > 0 ? sectionOf(groups[i - 1]) : undefined) && (
                <tr className="vtk-bo-l-sec">
                  <td colSpan={span + 3}>{SECTIONS.find(([key]) => key === sectionOf(g))?.[nl ? 1 : 2]}</td>
                </tr>
              )}
              <GroupHead
                label={g.label}
                count={g.dossiers.length}
                stats={g.stats}
                budget={sumOf(g.dossiers, (d) => d.budgetCents)}
                span={span}
                open={isOpen(g.key)}
                onToggle={() => toggle(g.key)}
                onOpen={g.postKey ? () => go({ post: g.postKey!, bo: null, activiteit: null }) : undefined}
                f={f}
              />
              {isOpen(g.key) &&
                g.dossiers.map((d) => (
                  <tr key={d.key} className="vtk-bo-l-row" onClick={() => go({ activiteit: d.key })}>
                    <td>
                      <button type="button" className="vtk-bo-l-title" onClick={(event) => { event.stopPropagation(); go({ activiteit: d.key }); }}>
                        {d.activity}
                      </button>
                      {d.budgets.length > 1 && <span className="vtk-bo-pill ml-1.5">{nl ? `${d.budgets.length} budgetten` : `${d.budgets.length} budgets`}</span>}
                      {!showPost && d.postKeys.length > 1 && (
                        <span className="block text-xs text-vtk-muted">
                          {nl ? "met" : "with"} {d.postNames.filter((_, j) => d.postKeys[j] !== g.postKey).join(" + ")}
                        </span>
                      )}
                    </td>
                    {showPost && <td data-label="Post">{d.postName}</td>}
                    <td data-label="BO" className="text-xs">{boRange(d, f)}</td>
                    <td data-label="Budget" className="num">{f.euro(d.budgetCents)}</td>
                    <td data-label={nl ? "Resultaat" : "Result"} className="num">{d.results.length ? f.euro(d.resultCents) : "–"}</td>
                    <td data-label={nl ? "Stand" : "Status"}><Stand d={d} f={f} /></td>
                  </tr>
                ))}
            </Fragment>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={span}>
              {nl ? "Totaal" : "Total"} · {total.length} {nl ? "activiteiten" : "activities"} · {all.done}/{all.due}{" "}
              {nl ? "resultaten binnen" : "results in"} ({f.pct(all.pct)})
            </td>
            <td className="num">{f.euro0(sumOf(total, (d) => d.budgetCents))}</td>
            <td className="num">{f.euro0(all.sumResult)}</td>
            <td>{all.done > 0 && <Dev cents={all.sumDev} f={f} />}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function MeetingTable({
  list,
  data,
  f,
  go,
  isOpen,
  toggle,
}: {
  list: XDossier[];
  data: ExplorerData;
  f: Fmt;
  go: Go;
  isOpen: (key: string) => boolean;
  toggle: (key: string) => void;
}) {
  const { nl } = f;
  const groups = groupByMeeting(list, data.meetings);
  if (groups.length === 0) return <Empty f={f} />;
  return (
    <div className="vtk-bo-l-wrap">
      <table className="vtk-bo-l-table">
        <thead>
          <tr>
            <th>{nl ? "Activiteit" : "Activity"}</th>
            <th>Post</th>
            <th>{nl ? "Soort" : "Kind"}</th>
            <th className="num">{nl ? "Bedrag" : "Amount"}</th>
            <th className="num">{nl ? "Resultaat" : "Result"}</th>
            <th>{nl ? "Stand" : "Status"}</th>
          </tr>
        </thead>
        <tbody>
          {groups.map(({ meeting: m, rows }) => {
            const results = rows.filter((r) => r.doc.kind === "RESULT").map((r) => r.dossier);
            const stats = statsOf(results);
            return (
              <Fragment key={m.id}>
                <GroupHead
                  label={m.label}
                  count={rows.length}
                  stats={stats}
                  budget={rows.filter((r) => r.doc.kind === "BUDGET").reduce((t, r) => t + (r.doc.totalCents ?? 0), 0)}
                  span={3}
                  open={isOpen(m.id)}
                  onToggle={() => toggle(m.id)}
                  onOpen={() => go({ bo: m.id, post: null, activiteit: null })}
                  extra={
                    <span className="font-normal text-vtk-muted">
                      {m.date ? `${f.day(m.date)} · ` : ""}
                      {f.count(m.budgets.length, "budget", nl ? "budgetten" : "budgets")},{" "}
                      {f.count(m.results.length, nl ? "resultaat" : "result", nl ? "resultaten" : "results")}
                      {m.upcoming && (nl ? " · volgende BO" : " · next meeting")}
                    </span>
                  }
                  f={f}
                />
                {isOpen(m.id) &&
                  rows.map(({ doc, dossier: d }) => (
                    <tr key={doc.id} className="vtk-bo-l-row" onClick={() => go({ activiteit: d.key })}>
                      <td>
                        <button type="button" className="vtk-bo-l-title" onClick={(event) => { event.stopPropagation(); go({ activiteit: d.key }); }}>
                          {d.activity}
                        </button>
                        <span className="block text-xs text-vtk-muted break-all">{doc.name}</span>
                      </td>
                      <td data-label="Post">{d.postName}</td>
                      <td data-label={nl ? "Soort" : "Kind"}>
                        <span className="vtk-bo-pill" data-tone={doc.kind === "RESULT" ? "ok" : undefined}>
                          {doc.kind === "BUDGET" ? "Budget" : nl ? "Resultaat" : "Result"}
                        </span>
                      </td>
                      <td data-label={nl ? "Bedrag" : "Amount"} className="num">{f.euro(doc.totalCents)}</td>
                      <td data-label={nl ? "Resultaat" : "Result"} className="num">{doc.kind === "BUDGET" && d.results.length ? f.euro(d.resultCents) : ""}</td>
                      <td data-label={nl ? "Stand" : "Status"}><Stand d={d} f={f} /></td>
                    </tr>
                  ))}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Empty({ f }: { f: Fmt }) {
  return (
    <p className="rounded-[18px] border border-vtk-blue/10 bg-vtk-surface-elevated p-5 text-sm text-vtk-muted">
      {f.nl ? "Niets dat met deze filters overeenkomt." : "Nothing matches these filters."}
    </p>
  );
}

function Graph({ list, group, data, f }: { list: XDossier[]; group: ListGroup; data: ExplorerData; f: Fmt }) {
  const { nl } = f;
  const rows =
    group === "bo"
      ? groupByMeeting(list, data.meetings).map((g) => ({
          key: g.meeting.id,
          label: g.meeting.label,
          dossiers: g.rows.filter((r) => r.doc.kind === "BUDGET").map((r) => r.dossier),
        }))
      : groupDossiers(list, group, data.posts, nl).map((g) => ({ key: g.key, label: g.label, dossiers: g.dossiers }));
  const max = Math.max(...rows.map((r) => r.dossiers.length), 1);
  const count = (r: (typeof rows)[number], status: XDossier["status"]) => r.dossiers.filter((d) => d.status === status).length;
  if (rows.length === 0) return <Empty f={f} />;
  return (
    <div className="vtk-bo-l-graph">
      <div className="vtk-bo-legend">
        <span><i data-series="result" />{nl ? "Resultaat binnen" : "Result in"}</span>
        <span><i data-series="open" />{nl ? "Resultaat open" : "Result missing"}</span>
        <span><i data-series="upcoming" />{nl ? "Komt nog" : "Upcoming"}</span>
      </div>
      {rows.map((r) => {
        const done = count(r, "DONE");
        const open = count(r, "OPEN");
        const upcoming = count(r, "UPCOMING");
        return (
          <div key={r.key} className="vtk-bo-l-gr">
            <span>{r.label}</span>
            <span className="vtk-bo-l-stack" aria-hidden="true">
              {done > 0 && <span data-series="result" style={{ width: `${(done / max) * 100}%` }} title={`${done}`} />}
              {open > 0 && <span data-series="open" style={{ width: `${(open / max) * 100}%` }} title={`${open}`} />}
              {upcoming > 0 && <span data-series="upcoming" style={{ width: `${(upcoming / max) * 100}%` }} title={`${upcoming}`} />}
            </span>
            <span className="tabular-nums text-vtk-muted">
              {done} · {open} · {upcoming}
            </span>
          </div>
        );
      })}
      <p className="text-xs text-vtk-muted">
        {nl ? "Per groep: binnen · open · komt nog." : "Per group: in · missing · upcoming."}
      </p>
    </div>
  );
}

function Smart({ items }: { items: { value: string; label: string; onClick?: () => void }[] }) {
  return (
    <div className="vtk-bo-l-smart">
      {items.map((item) =>
        item.onClick ? (
          <button key={item.label} type="button" onClick={item.onClick}>
            <span className="v">{item.value}</span>
            <span className="l">{item.label}</span>
          </button>
        ) : (
          <div key={item.label}>
            <span className="v">{item.value}</span>
            <span className="l">{item.label}</span>
          </div>
        ),
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="vtk-bo-l-field">
      <span>{label}</span>
      <span>{children}</span>
    </div>
  );
}

function DossierForm({
  dossier: d,
  sheet,
  today,
  f,
  errorMessages,
  posts,
  locale,
  go,
}: {
  dossier: XDossier;
  sheet: Sheet;
  today: string;
  f: Fmt;
  errorMessages: Record<string, string>;
  posts: readonly PostChoice[];
  locale: Locale;
  go: Go;
}) {
  const { nl } = f;
  const latest: XDoc | undefined = d.results.at(-1) ?? d.budgets.at(-1);
  const stage = d.status === "DONE" || d.status === "NO_BUDGET" ? 3 : d.status === "OPEN" ? 2 : 1;
  const steps: [string, number][] = [
    ["Budget", 1],
    [nl ? "Activiteit" : "Activity", 2],
    [nl ? "Resultaat binnen" : "Result in", 3],
  ];

  // Het logboek: wat de site over deze activiteit vond, nieuwste eerst.
  const log: { date: string; title: string; text: string }[] = [];
  d.budgets.forEach((b, i) =>
    log.push({
      date: b.meetingDate ?? "",
      title: nl ? `${i > 0 ? "Nieuwe versie van het budget" : "Budget"} op ${b.meetingLabel}` : `${i > 0 ? "New version of the budget" : "Budget"} at ${b.meetingLabel}`,
      text: `${nl ? "Netto" : "Net"} ${f.euro(b.totalCents)}${d.allocationCents !== null ? `, ${nl ? "begroting" : "allocation"} ${f.euro(d.allocationCents)}` : ""}`,
    }),
  );
  if (d.eventDate && d.eventDate <= today) {
    log.push({ date: d.eventDate, title: nl ? "Activiteit gepasseerd" : "Activity took place", text: d.location ?? "" });
  }
  for (const r of d.results) {
    log.push({
      date: r.meetingDate ?? "",
      title: nl ? `Resultaat op ${r.meetingLabel}` : `Result at ${r.meetingLabel}`,
      text: `${nl ? "Netto" : "Net"} ${f.euro(r.totalCents)}${d.devCents !== null ? ` (${f.signed(d.devCents)})` : ""}`,
    });
  }
  if (d.status === "OPEN") {
    log.push({
      date: today,
      title: nl ? "Nog geen resultaat" : "No result yet",
      text: d.overdueDays !== null ? `${d.overdueDays} ${nl ? "dagen na het budget" : "days after the budget"}` : "",
    });
  }
  log.sort((a, b) => b.date.localeCompare(a.date));

  const meetingLink = (doc: XDoc) => (
    <button key={doc.id} type="button" className="vtk-bo-link" onClick={() => go({ bo: doc.meetingId, activiteit: null, post: null })}>
      {doc.meetingLabel}
    </button>
  );

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          {latest && (
            <a href={latest.webUrl} target="_blank" rel="noreferrer" className="vtk-bo-l-dd">
              {nl ? "Openen in Drive" : "Open in Drive"}
            </a>
          )}
          <HideDossierButton dossier={d} nl={nl} errorMessages={errorMessages} className="vtk-bo-l-dd" />
        </div>
        <span className="vtk-bo-l-status" aria-label={nl ? "Stadium" : "Stage"}>
          {steps.map(([label, i]) => (
            <span key={i} data-state={i < stage || stage === 3 ? "done" : i === stage ? (d.status === "OPEN" ? "late" : "current") : undefined}>
              {(i < stage || stage === 3) && "✓ "}
              {label}
            </span>
          ))}
        </span>
      </div>
      <Smart
        items={[
          { value: String(d.budgets.length + d.results.length), label: nl ? "Bestanden" : "Files", onClick: () => go({ blad: "bestanden" }, false) },
          { value: f.euro0(d.budgetCents ?? 0), label: "Budget" },
          { value: d.results.length ? f.euro0(d.resultCents ?? 0) : "–", label: nl ? "Resultaat" : "Result" },
          { value: d.devCents === null ? "–" : f.signed0(d.devCents), label: nl ? "Afwijking" : "Deviation" },
          { value: d.lagDays === null ? "–" : `${d.lagDays} d`, label: nl ? "Tot resultaat" : "Until result" },
        ]}
      />
      <div className="vtk-bo-l-split">
        <div className="vtk-bo-l-sheet">
          <div>
            <p className="vtk-bo-kicker">{d.postName}</p>
            <h2 className="text-2xl font-bold tracking-tight">{d.activity}</h2>
          </div>
          {dossierNotes(d, f).map((note) => (
            <p key={note} className="vtk-bo-note">
              {note}
            </p>
          ))}
          <div className="vtk-bo-l-fields">
            <Field label={d.postKeys.length > 1 ? (nl ? "Posten" : "Posts") : "Post"}>
              <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <PostLinks dossier={d} className="" onPost={(key) => go({ post: key, bo: null, activiteit: null })} />
                {posts.length > 0 && (
                  <ChangePosts
                    locale={locale}
                    posts={posts}
                    docIds={[...d.budgets, ...d.results].map((doc) => doc.id)}
                    value={d.postKeys}
                    activity={d.activity}
                    errorMessages={errorMessages}
                  />
                )}
              </span>
            </Field>
            <Field label={nl ? "Activiteit op" : "Activity on"}>{d.eventDate ? f.day(d.eventDate, true) : <span className="text-vtk-muted">{nl ? "Niet in het rekenblad" : "Not in the spreadsheet"}</span>}</Field>
            <Field label={nl ? "Budget op" : "Budget at"}>{d.budgets.length ? d.budgets.map(meetingLink).reduce<ReactNode[]>((acc, el, i) => (i ? [...acc, ", ", el] : [el]), []) : "–"}</Field>
            <Field label={nl ? "Locatie" : "Location"}>{d.location ?? <span className="text-vtk-muted">{nl ? "Niet ingevuld" : "Not filled in"}</span>}</Field>
            <Field label={nl ? "Resultaat op" : "Result at"}>{d.results.length ? d.results.map(meetingLink) : <span className="text-vtk-muted">{nl ? "Nog niet" : "Not yet"}</span>}</Field>
            <Field label={nl ? "Begroting" : "Allocation"}>
              <span className="tabular-nums">{f.euro(d.allocationCents)}</span>
              {d.overAllocation && <span className="vtk-bo-pill ml-1.5" data-tone="low">{nl ? "budget erboven" : "budget above"}</span>}
            </Field>
            <Field label={nl ? "Stand" : "Status"}>
              <Stand d={d} f={f} />
            </Field>
            <Field label={nl ? "VTK-aandeel" : "VTK share"}>{d.vtkSharePercent !== null ? `${d.vtkSharePercent}%` : "100%"}</Field>
          </div>
          <div className="vtk-bo-tabs" role="group" aria-label={nl ? "Onderdeel" : "Section"}>
            {(
              [
                ["bedragen", nl ? "Bedragen per post" : "Amounts per line"],
                ["tijdlijn", nl ? "Tijdlijn" : "Timeline"],
                ["bestanden", nl ? "Bestanden" : "Files"],
              ] as const
            ).map(([key, label]) => (
              <button key={key} type="button" aria-pressed={sheet === key} onClick={() => go({ blad: key === "bedragen" ? null : key }, false)}>
                {label}
              </button>
            ))}
          </div>
          {sheet === "tijdlijn" ? (
            <Timeline dossier={d} f={f} onMeeting={(id) => go({ bo: id, activiteit: null, post: null })} />
          ) : sheet === "bestanden" ? (
            <Files dossier={d} f={f} errorMessages={errorMessages} />
          ) : (
            <Lines data={linesOf(d, nl)} f={f} />
          )}
        </div>
        <aside className="vtk-bo-l-log" aria-label={nl ? "Logboek" : "Log"}>
          <p className="vtk-bo-kicker">{nl ? "Logboek" : "Log"}</p>
          {log.map((entry, i) => (
            <div key={i} className="vtk-bo-l-msg">
              <span className="a" aria-hidden="true">BO</span>
              <span>
                <b>{entry.title}</b>
                {entry.text && <span className="block">{entry.text}</span>}
                <span className="t">{f.day(entry.date)}</span>
              </span>
            </div>
          ))}
        </aside>
      </div>
    </div>
  );
}

function PostForm({ post, data, sheet, f, go }: { post: XPost; data: ExplorerData; sheet: PostSheet; f: Fmt; go: Go }) {
  const { nl } = f;
  const s = post.stats;
  const list = data.dossiers.filter((d) => d.postKeys.includes(post.key)).sort((a, b) => lastMeetingDate(b).localeCompare(lastMeetingDate(a)));
  const meetings = data.meetings.filter((m) => m.postKeys.includes(post.key));
  const docsAt = (m: XMeeting, kind: "budgets" | "results") =>
    m[kind]
      .map(({ dossierKey }) => list.find((d) => d.key === dossierKey))
      .filter((d): d is XDossier => Boolean(d));
  return (
    <div className="grid gap-4">
      <Smart
        items={[
          { value: String(s.budgets), label: nl ? "Budgetten" : "Budgets" },
          { value: String(s.results), label: nl ? "Resultaten" : "Results" },
          { value: f.pct(s.pct), label: nl ? "Voorbij en afgerond" : "Past and closed" },
          { value: String(s.open), label: nl ? "Resultaat open" : "Result missing" },
          { value: f.euro0(s.sumBudget), label: nl ? "Netto gebudgetteerd" : "Net budgeted" },
          { value: f.signed0(s.sumDev), label: nl ? "Afwijking afgerond" : "Deviation, closed" },
          { value: s.avgLagDays === null ? "–" : `${s.avgLagDays} d`, label: nl ? "Gem. tot resultaat" : "Avg. until result" },
        ]}
      />
      <div className="vtk-bo-l-sheet">
        <div>
          <p className="vtk-bo-kicker">Post</p>
          <h2 className="text-2xl font-bold tracking-tight">{post.name}</h2>
        </div>
        <div className="vtk-bo-l-fields">
          <Field label={nl ? "Begroting" : "Allocation"}>
            <span className="tabular-nums">{f.euro(s.sumAllocation)}</span>
          </Field>
          <Field label={nl ? "Op BO's" : "At meetings"}>{meetings.length}</Field>
          <Field label={nl ? "Boven begroting" : "Above allocation"}>{f.count(s.overAllocation, "budget", nl ? "budgetten" : "budgets")}</Field>
          <Field label={nl ? "Oudste open" : "Oldest missing"}>
            {s.oldest ? (
              <button type="button" className="vtk-bo-link" onClick={() => go({ activiteit: s.oldest!.key })}>
                {s.oldest.activity} ({s.oldest.days} d)
              </button>
            ) : (
              "–"
            )}
          </Field>
        </div>
        <div className="vtk-bo-tabs" role="group" aria-label={nl ? "Onderdeel" : "Section"}>
          {(
            [
              ["activiteiten", nl ? "Activiteiten" : "Activities"],
              ["bos", nl ? "Per BO" : "Per meeting"],
              ["posten", nl ? "Per kostenpost" : "Per line"],
            ] as const
          ).map(([key, label]) => (
            <button key={key} type="button" aria-pressed={sheet === key} onClick={() => go({ postblad: key === "activiteiten" ? null : key }, false)}>
              {label}
            </button>
          ))}
        </div>
        {sheet === "bos" ? (
          <div className="vtk-bo-l-wrap">
            <table className="vtk-bo-l-table">
              <thead>
                <tr>
                  <th>BO</th>
                  <th>{nl ? "Datum" : "Date"}</th>
                  <th>{nl ? "Budgetten" : "Budgets"}</th>
                  <th>{nl ? "Resultaten" : "Results"}</th>
                </tr>
              </thead>
              <tbody>
                {meetings.map((m) => (
                  <tr key={m.id} className="vtk-bo-l-row" onClick={() => go({ bo: m.id, post: null, activiteit: null })}>
                    <td>
                      <button type="button" className="vtk-bo-l-title" onClick={(event) => { event.stopPropagation(); go({ bo: m.id, post: null, activiteit: null }); }}>
                        {m.label}
                      </button>
                    </td>
                    <td data-label={nl ? "Datum" : "Date"} className="tabular-nums">{m.date ? f.day(m.date) : "–"}</td>
                    <td data-label={nl ? "Budgetten" : "Budgets"}>{docsAt(m, "budgets").map((d) => d.activity).join(", ") || "–"}</td>
                    <td data-label={nl ? "Resultaten" : "Results"}>{docsAt(m, "results").map((d) => d.activity).join(", ") || "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : sheet === "posten" ? (
          <>
            <p className="text-xs text-vtk-muted">
              {nl ? "Opgeteld over de afgeronde activiteiten van deze post." : "Summed over the closed activities of this post."}
            </p>
            <Lines data={sumLines(list, nl)} f={f} />
          </>
        ) : (
          <div className="vtk-bo-l-wrap">
            <table className="vtk-bo-l-table">
              <thead>
                <tr>
                  <th>{nl ? "Activiteit" : "Activity"}</th>
                  <th>BO</th>
                  <th className="num">Budget</th>
                  <th className="num">{nl ? "Resultaat" : "Result"}</th>
                  <th>{nl ? "Stand" : "Status"}</th>
                </tr>
              </thead>
              <tbody>
                {list.map((d) => (
                  <tr key={d.key} className="vtk-bo-l-row" onClick={() => go({ activiteit: d.key })}>
                    <td>
                      <button type="button" className="vtk-bo-l-title" onClick={(event) => { event.stopPropagation(); go({ activiteit: d.key }); }}>
                        {d.activity}
                      </button>
                    </td>
                    <td data-label="BO" className="text-xs">{boRange(d, f)}</td>
                    <td data-label="Budget" className="num">{f.euro(d.budgetCents)}</td>
                    <td data-label={nl ? "Resultaat" : "Result"} className="num">{d.results.length ? f.euro(d.resultCents) : "–"}</td>
                    <td data-label={nl ? "Stand" : "Status"}><Stand d={d} f={f} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function MeetingForm({ meeting: m, data, f, go }: { meeting: XMeeting; data: ExplorerData; f: Fmt; go: Go }) {
  const { nl } = f;
  const dossiers = new Map(data.dossiers.map((d) => [d.key, d]));
  const rows = (items: XMeeting["budgets"]) =>
    items
      .map(({ docId, dossierKey }) => {
        const d = dossiers.get(dossierKey);
        const doc = d && [...d.budgets, ...d.results].find((x) => x.id === docId);
        return d && doc ? { d, doc } : null;
      })
      .filter((x): x is { d: XDossier; doc: XDoc } => x !== null);
  const table = (items: { d: XDossier; doc: XDoc }[]) =>
    items.length === 0 ? (
      <p className="text-sm text-vtk-muted">{nl ? "Geen." : "None."}</p>
    ) : (
      <div className="vtk-bo-l-wrap">
        <table className="vtk-bo-l-table">
          <thead>
            <tr>
              <th>{nl ? "Activiteit" : "Activity"}</th>
              <th>Post</th>
              <th className="num">{nl ? "Bedrag" : "Amount"}</th>
              <th>{nl ? "Stand" : "Status"}</th>
            </tr>
          </thead>
          <tbody>
            {items.map(({ d, doc }) => (
              <tr key={doc.id} className="vtk-bo-l-row" onClick={() => go({ activiteit: d.key })}>
                <td>
                  <button type="button" className="vtk-bo-l-title" onClick={(event) => { event.stopPropagation(); go({ activiteit: d.key }); }}>
                    {d.activity}
                  </button>
                  <span className="block break-all text-xs text-vtk-muted">{doc.name}</span>
                </td>
                <td data-label="Post" data-row-action onClick={(event) => event.stopPropagation()}>
                  <PostLinks dossier={d} className="" onPost={(key) => go({ post: key, bo: null, activiteit: null })} />
                </td>
                <td data-label={nl ? "Bedrag" : "Amount"} className="num">{f.euro(doc.totalCents)}</td>
                <td data-label={nl ? "Stand" : "Status"}><Stand d={d} f={f} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  const budgets = rows(m.budgets);
  const results = rows(m.results);
  const hasDev = results.some(({ d }) => d.devCents !== null);
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap gap-2">
        <a href={m.webUrl} target="_blank" rel="noreferrer" className="vtk-bo-l-dd">
          {nl ? "Map openen in Drive" : "Open folder in Drive"}
        </a>
      </div>
      <Smart
        items={[
          { value: String(m.budgets.length), label: nl ? "Budgetten" : "Budgets" },
          { value: String(m.results.length), label: nl ? "Resultaten" : "Results" },
          { value: String(m.postKeys.length), label: nl ? "Posten" : "Posts" },
          { value: f.euro0(m.sumBudget), label: nl ? "Netto gebudgetteerd" : "Net budgeted" },
          { value: hasDev ? f.signed0(m.sumDev) : "–", label: nl ? "Afwijking resultaten" : "Deviation of results" },
        ]}
      />
      <div className="vtk-bo-l-sheet">
        <div>
          <p className="vtk-bo-kicker">{m.upcoming ? (nl ? "Volgende vergadering" : "Next meeting") : nl ? "Vergadering" : "Meeting"}</p>
          <h2 className="text-2xl font-bold tracking-tight">{m.label}</h2>
          <p className="text-sm text-vtk-muted">
            {m.date ? f.day(m.date, true) : nl ? "Goedgekeurd zonder vergadering, doorheen het jaar" : "Approved without a meeting, throughout the year"} · {m.name}
          </p>
        </div>
        <h3 className="text-sm font-semibold">
          {nl ? "Budgetten" : "Budgets"} ({budgets.length})
        </h3>
        {table(budgets)}
        <h3 className="text-sm font-semibold">
          {nl ? "Resultaten" : "Results"} ({results.length})
        </h3>
        {table(results)}
      </div>
    </div>
  );
}
