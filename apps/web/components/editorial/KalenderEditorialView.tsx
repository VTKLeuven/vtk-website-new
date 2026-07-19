"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { markdownToPlainText } from "@/lib/markdown";
import { monthGridCells, isSameCalendarDay } from "./calendarGrid";

type ApiEvent = {
  id: string;
  title: string;
  titleEn: string;
  start: string;
  end: string;
  allDay: boolean;
  url: string | null;
  location: string | null;
  extendedProps: {
    groupCode: string;
    groupNameNl: string;
    groupNameEn: string;
    descriptionNl: string | null;
    descriptionEn: string | null;
  };
};

const FILTER_CHIPS: Array<{ id: string; codes: string[] | null }> = [
  { id: "all", codes: null },
  { id: "gala", codes: ["CULTUUR"] },
  { id: "career", codes: ["BEDRIJVENRELATIES"] },
  { id: "cantus", codes: ["FAKBAR"] },
  { id: "service", codes: ["THEOKOT", "CURSUSDIENST", "ONTHAAL", "LOGISTIEK"] },
];

function pillClass(code: string): "" | "gala" | "career" | "service" {
  if (code === "CULTUUR") return "gala";
  if (code === "BEDRIJVENRELATIES") return "career";
  if (code === "THEOKOT" || code === "CURSUSDIENST" || code === "ONTHAAL" || code === "LOGISTIEK")
    return "service";
  return "";
}

function legendKey(code: string): "gala" | "cantus" | "career" | "service" | "blok" {
  const p = pillClass(code);
  if (p === "gala") return "gala";
  if (p === "career") return "career";
  if (p === "service") return "service";
  if (code === "FAKBAR") return "cantus";
  return "blok";
}

type LegendCounts = { gala: number; cantus: number; career: number; service: number; blok: number };

/**
 * Legende plus abonneer-blok. Staat naast het maandraster, en naast de
 * agendalijst wanneer er geen raster is; daarom een eigen component in plaats
 * van twee keer dezelfde markup. Bewust op moduleniveau: een component die in
 * de render van een ander component wordt gedefinieerd, is bij elke render een
 * nieuw type en verliest dus zijn state (react-hooks/static-components).
 */
function LegendAside({
  labels,
  legendCounts,
}: {
  labels: { legendTitle: string; legendSub: string; subscribeTitle: string; subscribeSub: string; ical: string; google: string; outlook: string };
  legendCounts: LegendCounts;
}) {
  return (
    <aside className="agenda-side">
      <h3>{labels.legendTitle}</h3>
      <div className="sub">{labels.legendSub}</div>
      <ul className="agenda-side-list">
        <li className="gala">
          <span>
            <span className="sw" />
            Gala · TD
          </span>
          <span className="count">{String(legendCounts.gala).padStart(2, "0")}</span>
        </li>
        <li className="cantus">
          <span>
            <span className="sw" />
            Cantus
          </span>
          <span className="count">{String(legendCounts.cantus).padStart(2, "0")}</span>
        </li>
        <li className="career">
          <span>
            <span className="sw" />
            Career
          </span>
          <span className="count">{String(legendCounts.career).padStart(2, "0")}</span>
        </li>
        <li className="service">
          <span>
            <span className="sw" />
            Service
          </span>
          <span className="count">{String(legendCounts.service).padStart(2, "0")}</span>
        </li>
        <li className="blok">
          <span>
            <span className="sw" />
            Blok · studie
          </span>
          <span className="count">{String(legendCounts.blok).padStart(2, "0")}</span>
        </li>
      </ul>

      <div className="subscribe-box">
        <h3>{labels.subscribeTitle}</h3>
        <div className="sub">{labels.subscribeSub}</div>
        <div className="subscribe-actions">
          <span className="btn btn-ghost arrow">
            {labels.ical}
          </span>
          <span className="btn btn-ghost arrow">
            {labels.google}
          </span>
          <span className="btn btn-ghost arrow">
            {labels.outlook}
          </span>
        </div>
      </div>
    </aside>
  );
}

export function KalenderEditorialView({
  locale,
  labels,
}: {
  locale: "nl" | "en";
  labels: {
    crumbsHome: string;
    crumbsHere: string;
    metaEvents: string;
    metaCategories: string;
    metaExport: string;
    weekLine: string;
    legendTitle: string;
    legendSub: string;
    agendaNext: string;
    agendaSub: string;
    subscribeTitle: string;
    subscribeSub: string;
    ical: string;
    google: string;
    outlook: string;
    prevEvents: string;
    nextMonth: string;
    chips: Record<string, string>;
    views: { agenda: string; month: string; list: string };
  };
}) {
  const base = locale === "nl" ? "" : "/en";
  const now = new Date();
  const [cursor, setCursor] = useState(() => new Date(now.getFullYear(), now.getMonth(), 1));
  const [filter, setFilter] = useState("all");
  const [view, setView] = useState<"month" | "agenda" | "list">("month");
  const [monthEvents, setMonthEvents] = useState<ApiEvent[]>([]);
  const [agendaEvents, setAgendaEvents] = useState<ApiEvent[]>([]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const cells = useMemo(() => monthGridCells(year, month), [year, month]);

  const fetchForRange = useCallback(
    async (start: Date, end: Date) => {
      const url = new URL("/api/calendar/events", window.location.origin);
      url.searchParams.set("start", start.toISOString());
      url.searchParams.set("end", end.toISOString());
      const chip = FILTER_CHIPS.find((c) => c.id === filter);
      const codes = chip?.codes;
      if (codes && codes.length > 0) {
        for (const c of codes) url.searchParams.append("group", c);
      }
      const res = await fetch(url.toString());
      if (!res.ok) return [];
      return (await res.json()) as ApiEvent[];
    },
    [filter]
  );

  useEffect(() => {
    const start = new Date(cells[0]!.date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(cells[41]!.date);
    end.setHours(23, 59, 59, 999);
    let cancelled = false;
    void (async () => {
      const data = await fetchForRange(start, end);
      if (!cancelled) setMonthEvents(data);
    })();
    return () => {
      cancelled = true;
    };
  }, [cells, fetchForRange]);

  useEffect(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setDate(end.getDate() + 14);
    end.setHours(23, 59, 59, 999);
    let cancelled = false;
    void (async () => {
      const data = await fetchForRange(start, end);
      if (!cancelled) setAgendaEvents(data.sort((a, b) => +new Date(a.start) - +new Date(b.start)));
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchForRange, filter]);

  const eventsByDay = useMemo(() => {
    const m = new Map<string, ApiEvent[]>();
    for (const e of monthEvents) {
      const d = new Date(e.start);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      const arr = m.get(key) ?? [];
      arr.push(e);
      m.set(key, arr);
    }
    for (const arr of m.values()) {
      arr.sort((a, b) => +new Date(a.start) - +new Date(b.start));
    }
    return m;
  }, [monthEvents]);

  const legendCounts = useMemo(() => {
    const acc = { gala: 0, cantus: 0, career: 0, service: 0, blok: 0 };
    for (const e of monthEvents) {
      acc[legendKey(e.extendedProps.groupCode)] += 1;
    }
    return acc;
  }, [monthEvents]);

  const monthLabel = cursor.toLocaleDateString(locale === "nl" ? "nl-BE" : "en-GB", {
    month: "long",
    year: "numeric",
  });
  const gridFrom = cells[0]!.date;
  const gridTo = cells[41]!.date;
  const gridRange =
    gridFrom.toLocaleDateString(locale === "nl" ? "nl-BE" : "en-GB", {
      day: "2-digit",
      month: "short",
    }) +
    " — " +
    gridTo.toLocaleDateString(locale === "nl" ? "nl-BE" : "en-GB", {
      day: "2-digit",
      month: "short",
    });

  function pickTitle(e: ApiEvent) {
    return locale === "nl" ? e.title : e.titleEn || e.title;
  }

  function pickDesc(e: ApiEvent) {
    const d = locale === "nl" ? e.extendedProps.descriptionNl : e.extendedProps.descriptionEn;
    return markdownToPlainText(d ?? "");
  }

  function pickGroup(e: ApiEvent) {
    return locale === "nl" ? e.extendedProps.groupNameNl : e.extendedProps.groupNameEn;
  }

  function eventTime(e: ApiEvent) {
    if (e.allDay) return locale === "nl" ? "Hele dag" : "All day";
    return new Date(e.start).toLocaleTimeString(locale === "nl" ? "nl-BE" : "en-GB", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function shiftMonth(delta: number) {
    setCursor(new Date(year, month + delta, 1));
  }

  function eventHref(e: ApiEvent) {
    return `${base}/kalender/${e.id}`;
  }

  const showGrid = view === "month";

  return (
    <>
      <header className="page-head">
        <div>
          <div className="crumbs">
            {labels.crumbsHome} · <span style={{ color: "var(--ink)" }}>{labels.crumbsHere}</span>
          </div>
          <h1>
            {locale === "nl" ? "Kalender " : "Calendar "}
            <em>{year}.</em>
          </h1>
        </div>
        {/* Compacte kop: enkel de teller. De categorieën staan al als filters in
            de toolbar en als legende naast de kalender, en de export-opties in
            het abonneer-blok; drie keer hetzelfde duwde de kalender uit beeld. */}
        <div className="page-head-meta">
          <b>{monthEvents.length}</b> {labels.metaEvents}
        </div>
      </header>

      <div className="kal-wrap">
        <div className="toolbar">
          <div className="nav-mo">
            <button type="button" onClick={() => shiftMonth(-1)} aria-label="Previous month">
              ←
            </button>
            <button type="button" onClick={() => shiftMonth(1)} aria-label="Next month">
              →
            </button>
          </div>
          <div className="mo-label">
            {monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1)}
            <small>
              {labels.weekLine} {gridRange} · {monthEvents.length}{" "}
              {locale === "nl" ? "evenementen" : "events"}
            </small>
          </div>
          <div className="filters">
            {FILTER_CHIPS.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`filter${filter === c.id ? " on" : ""}`}
                onClick={() => setFilter(c.id)}
              >
                {labels.chips[c.id] ?? c.id}
              </button>
            ))}
          </div>
          <div className="view-switch">
            <button type="button" className={view === "agenda" ? "on" : ""} onClick={() => setView("agenda")}>
              {labels.views.agenda}
            </button>
            <button type="button" className={view === "month" ? "on" : ""} onClick={() => setView("month")}>
              {labels.views.month}
            </button>
            <button type="button" className={view === "list" ? "on" : ""} onClick={() => setView("list")}>
              {labels.views.list}
            </button>
          </div>
        </div>

        {/* De legende staat naast het maandraster: onder de kalender viel ze
            buiten beeld, en het raster hoeft niet de volle breedte. */}
        {showGrid && (
          <div className="kal-main">
            <div className="cal">
              <div className="cal-header">
                {(locale === "nl"
                  ? ["Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"]
                  : ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]
                ).map((d) => (
                  <div key={d}>{d}</div>
                ))}
              </div>
              {cells.map(({ date, inMonth }) => {
                const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
                const list = eventsByDay.get(key) ?? [];
                const isToday = isSameCalendarDay(date, new Date());
                const more = list.length > 2 ? list.length - 2 : 0;
                const show = list.slice(0, 2);
                return (
                  <div key={key} className={`cal-cell${!inMonth ? " out" : ""}${isToday ? " today" : ""}`}>
                    <div className="num">{String(date.getDate()).padStart(2, "0")}</div>
                    {show.map((e) => {
                      const pc = pillClass(e.extendedProps.groupCode);
                      return (
                        <a key={e.id} href={eventHref(e)} className={`ev-pill${pc ? ` ${pc}` : ""}`}>
                          <b>{pickTitle(e)}</b>
                          <span>
                            {eventTime(e)}
                            {e.location ? ` · ${e.location}` : ""}
                          </span>
                        </a>
                      );
                    })}
                    {more > 0 ? (
                      <div className="ev-pill more" title={list.map((e) => pickTitle(e)).join(", ")}>
                        +{more}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
            <LegendAside labels={labels} legendCounts={legendCounts} />
          </div>
        )}

        {(view === "month" || view === "agenda" || view === "list") && (
          <section
            className="agenda"
            style={{
              marginTop: view === "list" && !showGrid ? 0 : 48,
              gridTemplateColumns: view === "agenda" ? undefined : "1fr",
            }}
          >
            {view === "agenda" && <LegendAside labels={labels} legendCounts={legendCounts} />}

            <div>
              <div className="agenda-head">
                <h2>{labels.agendaNext}</h2>
                <div>{labels.agendaSub}</div>
              </div>
              <div className="agenda-list">
                {(view === "list" ? agendaEvents : agendaEvents.slice(0, 8)).map((e) => {
                  const d = new Date(e.start);
                  const tag =
                    legendKey(e.extendedProps.groupCode) === "gala"
                      ? "Gala"
                      : legendKey(e.extendedProps.groupCode) === "career"
                        ? "Career"
                        : legendKey(e.extendedProps.groupCode) === "service"
                          ? "Service"
                          : legendKey(e.extendedProps.groupCode) === "cantus"
                            ? "Cantus"
                            : "Blok";
                  const row = (
                    <>
                      <div className="ag-date">
                        <b>{String(d.getDate()).padStart(2, "0")}</b>
                        {d.toLocaleDateString(locale === "nl" ? "nl-BE" : "en-GB", {
                          month: "short",
                        })}{" "}
                        ·{" "}
                        {d.toLocaleDateString(locale === "nl" ? "nl-BE" : "en-GB", {
                          weekday: "short",
                        })}
                      </div>
                      <div className="ag-title">
                        {pickTitle(e)}
                        <small>
                          {eventTime(e)}
                          {e.location ? ` · ${e.location}` : ""}
                        </small>
                      </div>
                      <div className="ag-desc">{pickDesc(e) || pickGroup(e)}</div>
                      <div
                        className="ag-tag"
                        style={
                          tag === "Gala"
                            ? { background: "var(--accent)", borderColor: "var(--accent)" }
                            : undefined
                        }
                      >
                        {tag}
                      </div>
                      <div className="ag-go">→</div>
                    </>
                  );
                  return (
                    <a key={e.id} href={eventHref(e)} className="ag-row">
                      {row}
                    </a>
                  );
                })}
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 32, flexWrap: "wrap", gap: 12 }}>
                <button type="button" className="btn btn-ghost arrow" onClick={() => shiftMonth(-1)}>
                  {labels.prevEvents}
                </button>
                <button type="button" className="btn btn-primary arrow" onClick={() => shiftMonth(1)}>
                  {labels.nextMonth}
                </button>
              </div>
            </div>
          </section>
        )}
      </div>
    </>
  );
}
