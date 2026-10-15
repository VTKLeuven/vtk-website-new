"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import type { ExplorerData, Stats, XDossier, XMeeting, XPost } from "@/lib/bo/explorer";
import { Files, Lines, linesOf, Progress, StatusPill, Tiles, Timeline, useFormat, type Fmt, type Locale, type Sheet } from "./BoParts";

/*
 * De verkenner van /admin/bestuursorgaan: drie panelen naast elkaar.
 *
 *   links    Posten, BO's of wat open staat
 *   midden   de activiteiten van wat links gekozen is
 *   rechts   alles over één activiteit: bedragen per post, tijdlijn, bestanden
 *
 * De keuze staat in de URL (`?post=...&activiteit=...`), zodat een link naar
 * één activiteit te delen is en de terugknop werkt. Een klik verandert enkel de
 * URL in de browser (`history.pushState`, dat Next.js volgt); de gegevens van
 * het hele jaar kwamen al mee van de server, dus er is geen rondreis per klik.
 *
 * Op een smal scherm staat er één paneel tegelijk, met een terugknop. Zie
 * docs/design-decisions.md ("Bestuursorgaan: de verkenner").
 */

type Tab = "posten" | "bos" | "open";

/** Hoe lang een resultaat al uitblijft, als filter in de tab Open. */
const AGES = [
  { key: "alle", nl: "Alles open", en: "Everything open", test: () => true },
  { key: "geen-datum", nl: "Zonder datum", en: "Without a date", test: (d: XDossier) => !d.eventDate },
  { key: "2-maanden", nl: "Meer dan 2 maanden", en: "More than 2 months", test: (d: XDossier) => Boolean(d.eventDate) && (d.overdueDays ?? 0) >= 61 },
  { key: "1-maand", nl: "1 tot 2 maanden", en: "1 to 2 months", test: (d: XDossier) => Boolean(d.eventDate) && (d.overdueDays ?? 0) >= 28 && (d.overdueDays ?? 0) < 61 },
  { key: "2-weken", nl: "2 tot 4 weken", en: "2 to 4 weeks", test: (d: XDossier) => Boolean(d.eventDate) && (d.overdueDays ?? 0) >= 14 && (d.overdueDays ?? 0) < 28 },
  { key: "recent", nl: "Minder dan 2 weken", en: "Less than 2 weeks", test: (d: XDossier) => Boolean(d.eventDate) && (d.overdueDays ?? 0) < 14 },
] as const;

export function BoExplorer({
  data,
  locale,
  errorMessages,
  switcher,
}: {
  data: ExplorerData;
  locale: Locale;
  errorMessages: Record<string, string>;
  /** De schakelaar naar de lijst, naast de cijfers van het jaar. */
  switcher?: ReactNode;
}) {
  const f = useFormat(locale);
  const { nl } = f;
  const params = useSearchParams();
  const detailRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const dossiers = new Map(data.dossiers.map((d) => [d.key, d]));
  const docs = new Map(data.dossiers.flatMap((d) => [...d.budgets, ...d.results].map((doc) => [doc.id, { doc, dossier: d }] as const)));

  const tabParam = params.get("tab");
  const tab: Tab = tabParam === "bos" || tabParam === "open" ? tabParam : "posten";
  const defaultPost = data.posts.find((p) => p.stats.open > 0) ?? data.posts[0];
  const post = data.posts.find((p) => p.key === params.get("post")) ?? defaultPost;
  const defaultMeeting =
    [...data.meetings].filter((m) => m.upcoming && m.date).sort((a, b) => (a.date! < b.date! ? -1 : 1))[0] ??
    data.meetings.find((m) => m.budgets.length + m.results.length > 0) ??
    data.meetings[0];
  const meeting = data.meetings.find((m) => m.id === params.get("bo")) ?? defaultMeeting;
  const age = AGES.find((a) => a.key === params.get("leeftijd")) ?? AGES[0];
  const dossier = dossiers.get(params.get("activiteit") ?? "") ?? null;
  const sheetParam = params.get("blad");
  const sheet: Sheet = sheetParam === "tijdlijn" || sheetParam === "bestanden" ? sheetParam : "bedragen";
  // Op een smal scherm: het diepste paneel dat gekozen is.
  const pane = dossier ? 2 : params.has("post") || params.has("bo") || params.has("leeftijd") ? 1 : 0;

  function go(changes: Record<string, string | null>, push = true) {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    const url = `?${next.toString()}`;
    if (push) window.history.pushState(null, "", url);
    else window.history.replaceState(null, "", url);
  }

  // Een activiteit onderaan de lijst openen, mag het detail niet boven de
  // rand van het scherm laten staan.
  const dossierKey = dossier?.key ?? null;
  useEffect(() => {
    if (!dossierKey) return;
    const el = detailRef.current;
    if (el && el.getBoundingClientRect().top < 0) el.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [dossierKey]);
  useEffect(() => {
    const el = rootRef.current;
    if (el && el.getBoundingClientRect().top < 0) el.scrollIntoView({ block: "start" });
  }, [pane]);

  const g = data.global;
  const ageOpen = (key: (typeof AGES)[number]) => data.dossiers.filter((d) => d.status === "OPEN" && key.test(d));

  const statusPill = (d: XDossier) => <StatusPill dossier={d} f={f} />;

  const row = (d: XDossier, sub: ReactNode, amount: number | null) => (
    <button
      key={d.key + (typeof sub === "string" ? sub : "")}
      type="button"
      className="vtk-bo-item"
      aria-current={dossier?.key === d.key ? "true" : undefined}
      onClick={() => go({ activiteit: d.key })}
    >
      <span className="vtk-bo-item-r1">
        <b>{d.activity}</b>
        <span className="tabular-nums">{f.euro0(amount ?? 0)}</span>
      </span>
      <span className="vtk-bo-item-r2">
        <span>{sub}</span>
        {statusPill(d)}
      </span>
    </button>
  );

  // ---- links ----
  let left: ReactNode;
  if (tab === "posten") {
    left = data.posts.map((p) => (
      <button
        key={p.key}
        type="button"
        className="vtk-bo-item"
        aria-current={p.key === post?.key ? "true" : undefined}
        onClick={() => go({ tab: null, post: p.key, activiteit: null })}
      >
        <span className="vtk-bo-item-r1">
          <b>{p.name}</b>
          <span className="tabular-nums">{f.pct(p.stats.pct)}</span>
        </span>
        <span className="vtk-bo-item-r2">
          <Progress value={p.stats.pct} />
          <span>
            {p.stats.due ? `${p.stats.done}/${p.stats.due}` : nl ? "niets voorbij" : "nothing past"}
            {p.stats.open > 0 && ` · ${p.stats.open} open`}
          </span>
        </span>
      </button>
    ));
  } else if (tab === "bos") {
    left = data.meetings.map((m) => (
      <button
        key={m.id}
        type="button"
        className="vtk-bo-item"
        aria-current={m.id === meeting?.id ? "true" : undefined}
        onClick={() => go({ bo: m.id, activiteit: null })}
      >
        <span className="vtk-bo-item-r1">
          <b>{m.label}</b>
          <span className="text-xs text-vtk-muted">{f.day(m.date)}</span>
        </span>
        <span className="vtk-bo-item-r2">
          <span>
            {f.count(m.budgets.length, "budget", nl ? "budgetten" : "budgets")} ·{" "}
            {f.count(m.results.length, nl ? "resultaat" : "result", nl ? "resultaten" : "results")}
          </span>
          {m.upcoming && <span className="vtk-bo-pill" data-tone="next">{nl ? "volgende" : "next"}</span>}
          {m.missing && <span className="vtk-bo-pill">{nl ? "niet meer in Drive" : "no longer in Drive"}</span>}
        </span>
      </button>
    ));
  } else {
    left = AGES.map((a) => (
      <button
        key={a.key}
        type="button"
        className="vtk-bo-item"
        aria-current={a.key === age.key ? "true" : undefined}
        onClick={() => go({ leeftijd: a.key, activiteit: null })}
      >
        <span className="vtk-bo-item-r1">
          <b>{nl ? a.nl : a.en}</b>
          <span className="tabular-nums">{ageOpen(a).length}</span>
        </span>
      </button>
    ));
  }

  // ---- midden ----
  let midHead: ReactNode = null;
  let mid: ReactNode = null;
  if (tab === "posten" && post) {
    const list = data.dossiers.filter((d) => d.postKey === post.key);
    const order = { OPEN: 0, UPCOMING: 1, DONE: 2, NO_BUDGET: 2 } as const;
    list.sort(
      (a, b) =>
        order[a.status] - order[b.status] ||
        (a.status === "OPEN" ? (b.overdueDays ?? 0) - (a.overdueDays ?? 0) : 0) ||
        (a.status === "UPCOMING" ? (a.eventDate ?? "").localeCompare(b.eventDate ?? "") : 0) ||
        lastDate(b).localeCompare(lastDate(a)),
    );
    midHead = (
      <>
        <b className="text-[15px] text-vtk-ink">{post.name}</b>
        <span>
          {post.stats.due ? `${post.stats.done}/${post.stats.due} ${nl ? "voorbij en afgerond" : "past and closed"}` : nl ? "nog niets voorbij" : "nothing past yet"}
          {post.stats.upcoming > 0 && ` · ${post.stats.upcoming} ${nl ? "komen nog" : "upcoming"}`}
        </span>
      </>
    );
    mid = list.map((d) =>
      row(d, d.eventDate ? f.day(d.eventDate) : nl ? "geen datum" : "no date", d.resultCents ?? d.budgetCents),
    );
  } else if (tab === "bos" && meeting) {
    const part = (items: XMeeting["budgets"], label: string) => (
      <>
        <div className="vtk-bo-section">{label} ({items.length})</div>
        {items.length === 0 && <p className="px-3 py-2 text-xs text-vtk-muted">{nl ? "Geen." : "None."}</p>}
        {items.map(({ docId }) => {
          const hit = docs.get(docId);
          return hit ? row(hit.dossier, hit.dossier.postName, hit.doc.totalCents) : null;
        })}
      </>
    );
    midHead = (
      <>
        <b className="text-[15px] text-vtk-ink">{meeting.label}</b>
        <span>
          {meeting.date ? f.day(meeting.date, true) : nl ? "Doorheen het jaar" : "Throughout the year"}
          {meeting.upcoming && (nl ? " · volgende BO" : " · next meeting")}
        </span>
      </>
    );
    mid = (
      <>
        {part(meeting.budgets, nl ? "Budgetten" : "Budgets")}
        {part(meeting.results, nl ? "Resultaten" : "Results")}
      </>
    );
  } else {
    const list = ageOpen(age).sort((a, b) => (b.overdueDays ?? 0) - (a.overdueDays ?? 0));
    midHead = (
      <>
        <b className="text-[15px] text-vtk-ink">{nl ? "Resultaat open" : "Result missing"}</b>
        <span>
          {nl ? age.nl : age.en} · {f.count(list.length, nl ? "activiteit" : "activity", nl ? "activiteiten" : "activities")}
        </span>
      </>
    );
    mid =
      list.length > 0 ? (
        list.map((d) => row(d, d.postName, d.budgetCents))
      ) : (
        <p className="px-3 py-3 text-sm text-vtk-muted">{nl ? "Niets in deze groep." : "Nothing in this group."}</p>
      );
  }

  // ---- rechts ----
  let right: ReactNode;
  if (dossier) {
    right = (
      <DossierDetail
        dossier={dossier}
        sheet={sheet}
        f={f}
        errorMessages={errorMessages}
        onSheet={(s) => go({ blad: s === "bedragen" ? null : s }, false)}
        onPost={() => go({ tab: null, post: dossier.postKey, activiteit: null })}
        onMeeting={(id) => go({ tab: "bos", bo: id })}
      />
    );
  } else if (tab === "posten" && post) {
    right = <Summary title={post.name} stats={post.stats} f={f} onOldest={(key) => go({ activiteit: key })} />;
  } else if (tab === "bos" && meeting) {
    // Een afwijking bestaat enkel bij een resultaat waarvan het budget gekend is.
    const hasDev = meeting.results.some(({ dossierKey }) => dossiers.get(dossierKey)?.devCents != null);
    right = <MeetingSummary meeting={meeting} hasDev={hasDev} f={f} posts={data.posts} onPost={(key) => go({ tab: null, post: key, activiteit: null })} />;
  } else {
    right = <Summary title={nl ? "Het hele jaar" : "The whole year"} stats={g} f={f} onOldest={(key) => go({ activiteit: key })} />;
  }

  return (
    <div ref={rootRef} className="grid scroll-mt-24 gap-3">
      <div className="flex flex-wrap items-start gap-3">
      <dl className="vtk-bo-strip min-w-0 flex-1" aria-label={nl ? "Het jaar in cijfers" : "The year in numbers"}>
        <div><dt>{nl ? "budgetten" : "budgets"}</dt><dd>{g.budgets}</dd></div>
        <div><dt>{nl ? "voorbij en afgerond" : "past and closed"}</dt><dd>{f.pct(g.pct)}</dd></div>
        <div><dt>{nl ? "resultaat open" : "result missing"}</dt><dd>{g.open}</dd></div>
        <div><dt>{nl ? "netto gebudgetteerd" : "net budgeted"}</dt><dd>{f.euro0(g.sumBudget)}</dd></div>
        <div><dt>{nl ? "afwijking afgerond" : "deviation, closed"}</dt><dd>{f.signed0(g.sumDev)}</dd></div>
        <div><dt>{nl ? "gem. tot resultaat" : "avg. until result"}</dt><dd>{g.avgLagDays === null ? "–" : `${g.avgLagDays} d`}</dd></div>
      </dl>
      {switcher}
      </div>

      <div className="vtk-bo-explorer-wrap">
        <div className="vtk-bo-explorer" data-pane={pane}>
          <section className="vtk-bo-pane" aria-label={nl ? "Kiezen" : "Choose"}>
            <div className="vtk-bo-pane-head">
              <div className="vtk-bo-ptabs" role="group" aria-label={nl ? "Bekijken per" : "View by"}>
                {(
                  [
                    ["posten", nl ? "Posten" : "Posts"],
                    ["bos", nl ? "BO's" : "Meetings"],
                    ["open", nl ? `Open (${g.open})` : `Open (${g.open})`],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={tab === key}
                    // Een andere tab sluit de activiteit: rechts komt dan de
                    // samenvatting van wat links gekozen is.
                    onClick={() => go({ tab: key === "posten" ? null : key, post: null, bo: null, leeftijd: null, activiteit: null })}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {left}
          </section>

          <section className="vtk-bo-pane" aria-label={nl ? "Activiteiten" : "Activities"}>
            <div className="vtk-bo-pane-head">
              <button type="button" className="vtk-bo-back" onClick={() => go({ post: null, bo: null, leeftijd: null, activiteit: null })}>
                ‹ {nl ? "Terug" : "Back"}
              </button>
              {midHead}
            </div>
            {mid}
          </section>

          <section className="vtk-bo-pane" aria-label={nl ? "Details" : "Details"}>
            <div ref={detailRef} className="vtk-bo-detail">
              {dossier && (
                <button type="button" className="vtk-bo-back" onClick={() => go({ activiteit: null })}>
                  ‹ {nl ? "Terug" : "Back"}
                </button>
              )}
              {right}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function lastDate(d: XDossier): string {
  return [...d.budgets, ...d.results].reduce((max, doc) => (doc.meetingDate && doc.meetingDate > max ? doc.meetingDate : max), "");
}

function Summary({ title, stats: s, f, onOldest }: { title: string; stats: Stats; f: Fmt; onOldest: (key: string) => void }) {
  const { nl } = f;
  return (
    <div className="grid gap-4">
      <div>
        <p className="vtk-bo-kicker">{nl ? "Overzicht" : "Overview"}</p>
        <h2 className="text-xl font-bold tracking-tight">{title}</h2>
      </div>
      <Tiles
        items={[
          [nl ? "Voorbij en afgerond" : "Past and closed", f.pct(s.pct), s.due ? `${s.done} ${nl ? "van" : "of"} ${s.due}` : undefined],
          [nl ? "Resultaat open" : "Result missing", String(s.open), s.upcoming ? `${s.upcoming} ${nl ? "komen nog" : "upcoming"}` : undefined],
          [nl ? "Netto gebudgetteerd" : "Net budgeted", f.euro0(s.sumBudget), `${nl ? "begroting" : "allocation"} ${f.euro0(s.sumAllocation)}`],
          [nl ? "Afwijking afgerond" : "Deviation, closed", f.signed0(s.sumDev), s.done ? `${s.better} ${nl ? "beter" : "better"}, ${s.worse} ${nl ? "slechter" : "worse"}` : undefined],
        ]}
      />
      <dl className="vtk-bo-facts">
        <dt>{nl ? "Gem. tot resultaat" : "Avg. until result"}</dt>
        <dd>{s.avgLagDays === null ? "–" : `${s.avgLagDays} ${nl ? "dagen na de activiteit" : "days after the activity"}`}</dd>
        <dt>{nl ? "Boven begroting" : "Above allocation"}</dt>
        <dd>{f.count(s.overAllocation, "budget", nl ? "budgetten" : "budgets")}</dd>
        <dt>{nl ? "Oudste open" : "Oldest missing"}</dt>
        <dd>
          {s.oldest ? (
            <button type="button" className="vtk-bo-link" onClick={() => onOldest(s.oldest!.key)}>
              {s.oldest.activity} ({s.oldest.days} d)
            </button>
          ) : (
            "–"
          )}
        </dd>
      </dl>
      <p className="text-xs text-vtk-muted">
        {nl
          ? "Kies in het midden een activiteit voor de bedragen per post, de tijdlijn en de bestanden."
          : "Pick an activity in the middle for the amounts per line, the timeline and the files."}
      </p>
    </div>
  );
}

function MeetingSummary({
  meeting: m,
  hasDev,
  f,
  posts,
  onPost,
}: {
  meeting: XMeeting;
  hasDev: boolean;
  f: Fmt;
  posts: XPost[];
  onPost: (key: string) => void;
}) {
  const { nl } = f;
  const names = m.postKeys.map((key) => posts.find((p) => p.key === key)).filter((p): p is XPost => Boolean(p));
  return (
    <div className="grid gap-4">
      <div>
        <p className="vtk-bo-kicker">{m.upcoming ? (nl ? "Volgende vergadering" : "Next meeting") : nl ? "Vergadering" : "Meeting"}</p>
        <h2 className="text-xl font-bold tracking-tight">{m.label}</h2>
        <p className="text-sm text-vtk-muted">{m.date ? f.day(m.date, true) : nl ? "Goedgekeurd zonder vergadering, doorheen het jaar" : "Approved without a meeting, throughout the year"}</p>
      </div>
      <Tiles
        items={[
          [nl ? "Budgetten" : "Budgets", String(m.budgets.length), `${nl ? "netto" : "net"} ${f.euro0(m.sumBudget)}`],
          [nl ? "Resultaten" : "Results", String(m.results.length), `${nl ? "netto" : "net"} ${f.euro0(m.sumResult)}`],
          [nl ? "Afwijking" : "Deviation", hasDev ? f.signed0(m.sumDev) : "–", nl ? "van de resultaten" : "of the results"],
          [nl ? "Posten" : "Posts", String(names.length)],
        ]}
      />
      {names.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {names.map((p) => (
            <button key={p.key} type="button" className="vtk-bo-chip" onClick={() => onPost(p.key)}>
              {p.name}
            </button>
          ))}
        </div>
      )}
      <a href={m.webUrl} target="_blank" rel="noreferrer" className="vtk-bo-link text-sm">
        {nl ? `Map ${m.name} openen in Drive` : `Open folder ${m.name} in Drive`}
      </a>
    </div>
  );
}

function DossierDetail({
  dossier: d,
  sheet,
  f,
  errorMessages,
  onSheet,
  onPost,
  onMeeting,
}: {
  dossier: XDossier;
  sheet: Sheet;
  f: Fmt;
  errorMessages: Record<string, string>;
  onSheet: (sheet: Sheet) => void;
  onPost: () => void;
  onMeeting: (id: string) => void;
}) {
  const { nl } = f;
  const fileCount = d.budgets.length + d.results.length;
  const notes = [
    d.overAllocation && d.budgetCents !== null && d.allocationCents !== null
      ? nl
        ? `Het budget plant ${f.euro(d.allocationCents - d.budgetCents)} slechter dan de begroting.`
        : `The budget plans ${f.euro(d.allocationCents - d.budgetCents)} worse than the allocation.`
      : null,
    d.vtkSharePercent !== null
      ? nl
        ? `Gedeeld met een andere kring: VTK draagt ${d.vtkSharePercent}% van het totaal.`
        : `Shared with another association: VTK carries ${d.vtkSharePercent}% of the total.`
      : null,
  ].filter(Boolean);

  return (
    <div className="grid gap-4">
      <div className="grid gap-1">
        <button type="button" className="vtk-bo-kicker vtk-bo-link justify-self-start" onClick={onPost}>
          {d.postName}
        </button>
        <h2 className="text-xl font-bold tracking-tight">{d.activity}</h2>
        <div className="flex flex-wrap items-center gap-2 text-xs text-vtk-muted">
          <StatusPill dossier={d} f={f} />
          <span>
            {d.eventDate ? f.day(d.eventDate, true) : nl ? "Geen datum in het budget" : "No date in the budget"}
            {d.location && ` · ${d.location}`}
          </span>
        </div>
      </div>
      <Tiles
        items={[
          [nl ? "Begroting" : "Allocation", f.euro(d.allocationCents)],
          ["Budget", f.euro(d.budgetCents)],
          [nl ? "Resultaat" : "Result", d.results.length ? f.euro(d.resultCents) : "–"],
          [nl ? "Afwijking" : "Deviation", f.signed(d.devCents)],
        ]}
      />
      {notes.map((note) => (
        <p key={note} className="vtk-bo-note">
          {note}
        </p>
      ))}
      <div className="vtk-bo-tabs" role="group" aria-label={nl ? "Onderdeel" : "Section"}>
        {(
          [
            ["bedragen", nl ? "Bedragen" : "Amounts"],
            ["tijdlijn", nl ? "Tijdlijn" : "Timeline"],
            ["bestanden", `${nl ? "Bestanden" : "Files"} (${fileCount})`],
          ] as const
        ).map(([key, label]) => (
          <button key={key} type="button" aria-pressed={sheet === key} onClick={() => onSheet(key)}>
            {label}
          </button>
        ))}
      </div>
      {sheet === "tijdlijn" ? (
        <Timeline dossier={d} f={f} onMeeting={onMeeting} />
      ) : sheet === "bestanden" ? (
        <Files dossier={d} f={f} errorMessages={errorMessages} />
      ) : (
        <Lines data={linesOf(d, nl)} f={f} />
      )}
    </div>
  );
}
