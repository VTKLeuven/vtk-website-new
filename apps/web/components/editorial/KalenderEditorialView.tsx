"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { markdownToPlainText } from "@/lib/markdown";
import { CalendarSubscribe } from "@/components/site/CalendarSubscribe";
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
    categories: Array<{
      slug: string;
      nameNl: string;
      nameEn: string;
      colour: string;
      audience: string | null;
    }>;
  };
};

/** Sleutel per kalenderdag; gedeeld door het raster, de selectie en de dagpanelen. */
function dayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

/** Categorie zoals de serverpagina ze doorgeeft; de kleur komt uit de database. */
export type CalendarCategoryOption = {
  slug: string;
  nameNl: string;
  nameEn: string;
  colour: string;
  /** Niet-null = doelgroepcategorie: geen filterchip, maar een label op het event. */
  audience: string | null;
};

export function KalenderEditorialView({
  locale,
  labels,
  categories,
  feedUrl,
  lockedCategory,
  heading,
  parentCrumb,
  intro,
}: {
  locale: "nl" | "en";
  labels: {
    crumbsHome: string;
    crumbsHere: string;
    metaEvents: string;
    weekLine: string;
    legendTitle: string;
    legendSub: string;
    agendaNext: string;
    agendaSub: string;
    subscribeTitle: string;
    subscribeSub: string;
    prevEvents: string;
    nextMonth: string;
    all: string;
    uncategorised: string;
    showAllAudiences: string;
    showAllAudiencesHint: string;
    emptyMonth: string;
    emptyUpcoming: string;
    views: { agenda: string; list: string };
  };
  categories: CalendarCategoryOption[];
  /** Absolute URL van de ICS-feed die bij deze weergave hoort. */
  feedUrl: string;
  /**
   * Op een categoriepagina staat de filter vast op die categorie: de chips
   * verdwijnen dan, want er valt niets meer te kiezen.
   */
  lockedCategory?: string;
  /** Vervangt "Kalender <jaar>." als paginatitel, bv. door de categorienaam. */
  heading?: string;
  /** Extra kruimel tussen Home en de huidige pagina, bv. terug naar /kalender. */
  parentCrumb?: { label: string; href: string };
  /** Introtekst onder de kop, bv. de beschrijving van een categorie. */
  intro?: React.ReactNode;
}) {
  const base = locale === "nl" ? "" : "/en";
  const now = new Date();
  const [cursor, setCursor] = useState(() => new Date(now.getFullYear(), now.getMonth(), 1));
  const [filter, setFilter] = useState<string>(lockedCategory ?? "all");
  const [view, setView] = useState<"agenda" | "list">("agenda");
  // Standaard toont de kalender enkel de doelgroepevents die bij jou horen. Dit
  // is een voorkeur, geen slot: één klik en alles staat er.
  const [showAllAudiences, setShowAllAudiences] = useState(false);
  // Enkel voor het smalle scherm: welke dag staat er open onder het raster. Op
  // een telefoon passen de eventpillen niet in een cel van 45 pixels, dus toont
  // het raster daar stippen en lees je de dag zelf hieronder.
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [monthEvents, setMonthEvents] = useState<ApiEvent[]>([]);
  const [agendaEvents, setAgendaEvents] = useState<ApiEvent[]>([]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const cells = useMemo(() => monthGridCells(year, month), [year, month]);

  const categoryName = useCallback(
    (c: { nameNl: string; nameEn: string }) => (locale === "nl" ? c.nameNl : c.nameEn),
    [locale],
  );

  const fetchForRange = useCallback(
    async (start: Date, end: Date) => {
      const url = new URL("/api/calendar/events", window.location.origin);
      url.searchParams.set("start", start.toISOString());
      url.searchParams.set("end", end.toISOString());
      if (filter !== "all") url.searchParams.set("category", filter);
      if (showAllAudiences) url.searchParams.set("audience", "all");
      const res = await fetch(url.toString());
      if (!res.ok) return [];
      return (await res.json()) as ApiEvent[];
    },
    [filter, showAllAudiences],
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
  }, [fetchForRange]);

  const eventsByDay = useMemo(() => {
    const m = new Map<string, ApiEvent[]>();
    for (const e of monthEvents) {
      const d = new Date(e.start);
      const key = dayKey(d);
      const arr = m.get(key) ?? [];
      arr.push(e);
      m.set(key, arr);
    }
    for (const arr of m.values()) {
      arr.sort((a, b) => +new Date(a.start) - +new Date(b.start));
    }
    return m;
  }, [monthEvents]);

  /**
   * De legende telt per categorie hoeveel events er deze maand in zitten. Een
   * event met twee categorieën telt in beide; een event zonder categorie belandt
   * in de restrij, die enkel verschijnt als ze niet leeg is.
   */
  /**
   * De evenementen van de maand zelf, chronologisch. `monthEvents` dekt het hele
   * raster van 42 cellen en bevat dus ook de uitlopers van de vorige en volgende
   * maand; die horen niet in een lijst met "Augustus 2026" erboven.
   */
  const monthOnlyEvents = useMemo(
    () =>
      monthEvents
        .filter((e) => {
          const d = new Date(e.start);
          return d.getFullYear() === year && d.getMonth() === month;
        })
        .sort((a, b) => +new Date(a.start) - +new Date(b.start)),
    [monthEvents, year, month],
  );

  const legend = useMemo(() => {
    const counts = new Map<string, number>();
    let uncategorised = 0;
    for (const e of monthEvents) {
      if (e.extendedProps.categories.length === 0) {
        uncategorised += 1;
        continue;
      }
      for (const c of e.extendedProps.categories) {
        counts.set(c.slug, (counts.get(c.slug) ?? 0) + 1);
      }
    }
    const rows = categories
      .filter((c) => (counts.get(c.slug) ?? 0) > 0)
      .map((c) => ({ key: c.slug, name: categoryName(c), colour: c.colour, count: counts.get(c.slug)! }));
    if (uncategorised > 0) {
      rows.push({ key: "__rest", name: labels.uncategorised, colour: "", count: uncategorised });
    }
    return rows;
  }, [monthEvents, categories, categoryName, labels.uncategorised]);

  /**
   * De dag die op smal scherm opengeklapt staat. Bewust afgeleid in plaats van in
   * een effect bijgehouden: bladert de gebruiker naar een andere maand, dan valt
   * de oude keuze buiten het raster en kiezen we meteen een zinnige nieuwe
   * (vandaag, anders de eerste dag met iets erop, anders de eerste van de maand).
   */
  const selectedDayKey = useMemo(() => {
    const inGrid = (key: string) => cells.some((c) => dayKey(c.date) === key);
    if (selectedKey && inGrid(selectedKey)) return selectedKey;

    const todayKey = dayKey(new Date());
    if (cells.some((c) => c.inMonth && dayKey(c.date) === todayKey)) return todayKey;

    const firstWithEvents = cells.find((c) => c.inMonth && (eventsByDay.get(dayKey(c.date))?.length ?? 0) > 0);
    if (firstWithEvents) return dayKey(firstWithEvents.date);

    const firstOfMonth = cells.find((c) => c.inMonth);
    return firstOfMonth ? dayKey(firstOfMonth.date) : null;
  }, [selectedKey, cells, eventsByDay]);

  const selectedDate = useMemo(
    () => cells.find((c) => dayKey(c.date) === selectedDayKey)?.date ?? null,
    [cells, selectedDayKey],
  );
  const selectedEvents = selectedDayKey ? (eventsByDay.get(selectedDayKey) ?? []) : [];

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
    " - " +
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

  /** De eerste categorie bepaalt de kleur van de pil en het label in de agendalijst. */
  function primaryCategory(e: ApiEvent) {
    return e.extendedProps.categories[0] ?? null;
  }

  /**
   * De doelgroepen van een event. Die moeten altijd zichtbaar zijn: een event dat
   * voor eerstejaars of internationals bedoeld is, mag niet als een gewoon
   * evenement in het raster staan waar iemand anders zich dan op verkijkt.
   */
  function audienceCategories(e: ApiEvent) {
    return e.extendedProps.categories.filter((c) => c.audience !== null);
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

  const showGrid = view === "agenda";

  /**
   * Eén rij in een evenementenlijst. Gedeeld door de "eerstvolgend"-lijst onder
   * het raster en de maandlijst, zodat beide dezelfde labels en dezelfde
   * kleurlogica houden.
   */
  function renderRow(e: ApiEvent) {
    // Het label rechts toont het thema. De doelgroep staat al bij de titel, dus
    // die hier herhalen zou twee keer "Eerstejaars" geven.
    const cat = e.extendedProps.categories.find((c) => c.audience === null) ?? null;
    const d = new Date(e.start);
    const dateLocale = locale === "nl" ? "nl-BE" : "en-GB";
    return (
      <a key={e.id} href={eventHref(e)} className="ag-row">
        <div className="ag-date">
          <b>{String(d.getDate()).padStart(2, "0")}</b>
          {d.toLocaleDateString(dateLocale, { month: "short" })} ·{" "}
          {d.toLocaleDateString(dateLocale, { weekday: "short" })}
        </div>
        <div className="ag-title">
          {pickTitle(e)}
          {audienceCategories(e).map((a) => (
            <span
              key={a.slug}
              className="ag-audience"
              style={{ "--cat": a.colour } as React.CSSProperties}
            >
              {categoryName(a)}
            </span>
          ))}
          <small>
            {eventTime(e)}
            {e.location ? ` · ${e.location}` : ""}
          </small>
        </div>
        <div className="ag-desc">{pickDesc(e) || pickGroup(e)}</div>
        <div
          className="ag-tag"
          style={
            cat
              ? ({ background: cat.colour, borderColor: cat.colour, color: "#fff" } as React.CSSProperties)
              : undefined
          }
        >
          {cat ? categoryName(cat) : pickGroup(e)}
        </div>
        <div className="ag-go">→</div>
      </a>
    );
  }

  const monthNav = (
    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 32, flexWrap: "wrap", gap: 12 }}>
      <button type="button" className="btn btn-ghost arrow" onClick={() => shiftMonth(-1)}>
        {labels.prevEvents}
      </button>
      <button type="button" className="btn btn-primary arrow" onClick={() => shiftMonth(1)}>
        {labels.nextMonth}
      </button>
    </div>
  );

  /**
   * Legende plus abonneerblok. Staat naast het maandraster, en naast de
   * agendalijst wanneer er geen raster is.
   */
  const aside = (
    <aside className="agenda-side">
      <h3>{labels.legendTitle}</h3>
      <div className="sub">{labels.legendSub}</div>
      <ul className="agenda-side-list">
        {legend.map((row) => (
          <li key={row.key}>
            <span>
              <span
                className="sw"
                style={row.colour ? ({ "--cat": row.colour } as React.CSSProperties) : undefined}
              />
              {row.name}
            </span>
            <span className="count">{String(row.count).padStart(2, "0")}</span>
          </li>
        ))}
      </ul>

      <CalendarSubscribe
        feedUrl={feedUrl}
        locale={locale}
        labels={{ title: labels.subscribeTitle, sub: labels.subscribeSub }}
      />
    </aside>
  );

  return (
    <>
      <header className="page-head">
        <div>
          <div className="crumbs">
            {labels.crumbsHome} ·{" "}
            {parentCrumb ? (
              <>
                <a href={parentCrumb.href}>{parentCrumb.label}</a> ·{" "}
              </>
            ) : null}
            <span style={{ color: "var(--ink)" }}>{labels.crumbsHere}</span>
          </div>
          <h1>
            {heading ? (
              heading
            ) : (
              <>
                {locale === "nl" ? "Kalender " : "Calendar "}
                <em>{year}.</em>
              </>
            )}
          </h1>
          {intro ? <div className="page-head-intro">{intro}</div> : null}
        </div>
        <div className="page-head-meta">
          <b>{monthEvents.length}</b> {labels.metaEvents}
        </div>
      </header>

      <div className="kal-wrap">
        {/* De weergavekeuze staat bovenaan bij de maandnavigatie, niet naast de
            filterchips: daar leek ze een categorie in plaats van "hoe kijk ik". */}
        <div className="toolbar">
          <div className="toolbar-top">
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
                {monthEvents.length === 1
                  ? locale === "nl"
                    ? "evenement"
                    : "event"
                  : locale === "nl"
                    ? "evenementen"
                    : "events"}
              </small>
            </div>
            <div className="view-switch" role="group" aria-label={locale === "nl" ? "Weergave" : "View"}>
              <button
                type="button"
                className={view === "agenda" ? "on" : ""}
                aria-pressed={view === "agenda"}
                onClick={() => setView("agenda")}
              >
                {labels.views.agenda}
              </button>
              <button
                type="button"
                className={view === "list" ? "on" : ""}
                aria-pressed={view === "list"}
                onClick={() => setView("list")}
              >
                {labels.views.list}
              </button>
            </div>
          </div>

          {!lockedCategory && (
            <div className="toolbar-filters">
              <div className="filters">
                <button
                  type="button"
                  className={`filter${filter === "all" ? " on" : ""}`}
                  onClick={() => setFilter("all")}
                >
                  {labels.all}
                </button>
                {/* Enkel gewone thema's. Doelgroepen (eerstejaars, internationaal)
                    zijn geen keuze maar volgen uit je profiel. */}
                {categories
                  .filter((c) => c.audience === null)
                  .map((c) => (
                    <button
                      key={c.slug}
                      type="button"
                      className={`filter${filter === c.slug ? " on" : ""}`}
                      onClick={() => setFilter(c.slug)}
                    >
                      {categoryName(c)}
                    </button>
                  ))}
              </div>
              <label className="audience-toggle" title={labels.showAllAudiencesHint}>
                <input
                  type="checkbox"
                  checked={showAllAudiences}
                  onChange={(e) => setShowAllAudiences(e.target.checked)}
                />
                {labels.showAllAudiences}
              </label>
            </div>
          )}
        </div>

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
                const key = dayKey(date);
                const list = eventsByDay.get(key) ?? [];
                const isToday = isSameCalendarDay(date, new Date());
                const more = list.length > 2 ? list.length - 2 : 0;
                const show = list.slice(0, 2);
                const isSelected = key === selectedDayKey;
                return (
                  <div
                    key={key}
                    className={`cal-cell${!inMonth ? " out" : ""}${isToday ? " today" : ""}${isSelected ? " selected" : ""}`}
                  >
                    <div className="num">{String(date.getDate()).padStart(2, "0")}</div>
                    {/* Enkel zichtbaar op smal scherm: één stip per evenement in de
                        kleur van zijn categorie, plus een knop over de hele cel.
                        De eventpillen hieronder passen daar niet in. */}
                    {list.length > 0 ? (
                      <span className="cal-dots" aria-hidden>
                        {list.slice(0, 3).map((e) => {
                          const cat = primaryCategory(e);
                          return (
                            <span
                              key={e.id}
                              className="cal-dot"
                              style={cat ? ({ "--cat": cat.colour } as React.CSSProperties) : undefined}
                            />
                          );
                        })}
                      </span>
                    ) : null}
                    <button
                      type="button"
                      className="cal-cell-tap"
                      aria-label={`${date.toLocaleDateString(locale === "nl" ? "nl-BE" : "en-GB", {
                        weekday: "long",
                        day: "numeric",
                        month: "long",
                      })}, ${list.length} ${
                        list.length === 1
                          ? locale === "nl"
                            ? "evenement"
                            : "event"
                          : locale === "nl"
                            ? "evenementen"
                            : "events"
                      }`}
                      aria-pressed={isSelected}
                      onClick={() => setSelectedKey(key)}
                    />
                    {show.map((e) => {
                      const cat = primaryCategory(e);
                      const audiences = audienceCategories(e);
                      return (
                        <a
                          key={e.id}
                          href={eventHref(e)}
                          className={`ev-pill${cat ? " tinted" : ""}`}
                          style={cat ? ({ "--cat": cat.colour } as React.CSSProperties) : undefined}
                        >
                          {audiences.map((a) => (
                            <span
                              key={a.slug}
                              className="ev-audience"
                              style={{ "--cat": a.colour } as React.CSSProperties}
                            >
                              {categoryName(a)}
                            </span>
                          ))}
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

            {/* De opengeklapte dag, enkel op smal scherm. Op een breed scherm
                staan de evenementen al in de cellen zelf. */}
            <div className="cal-day">
              <h3>
                {selectedDate
                  ? (() => {
                      const text = selectedDate.toLocaleDateString(
                        locale === "nl" ? "nl-BE" : "en-GB",
                        { weekday: "long", day: "numeric", month: "long" },
                      );
                      return text.charAt(0).toUpperCase() + text.slice(1);
                    })()
                  : ""}
              </h3>
              {selectedEvents.length === 0 ? (
                <p className="cal-day-empty">
                  {locale === "nl" ? "Niets gepland op deze dag." : "Nothing planned on this day."}
                </p>
              ) : (
                <ul className="cal-day-list">
                  {selectedEvents.map((e) => {
                    const cat = primaryCategory(e);
                    return (
                      <li key={e.id}>
                        <a
                          href={eventHref(e)}
                          style={cat ? ({ "--cat": cat.colour } as React.CSSProperties) : undefined}
                        >
                          <b>{pickTitle(e)}</b>
                          <span>
                            {eventTime(e)}
                            {e.location ? ` · ${e.location}` : ""}
                          </span>
                          {audienceCategories(e).map((a) => (
                            <span
                              key={a.slug}
                              className="cal-day-audience"
                              style={{ "--cat": a.colour } as React.CSSProperties}
                            >
                              {categoryName(a)}
                            </span>
                          ))}
                        </a>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {aside}
          </div>
        )}

        {/* Agenda: onder het raster staat wat er de komende twee weken op je
            afkomt. Dat is het enige blok dat bewust niet met de pijlen meegaat. */}
        {view === "agenda" && (
          <section className="agenda" style={{ marginTop: 48, gridTemplateColumns: "1fr" }}>
            <div>
              <div className="agenda-head">
                <h2>{labels.agendaNext}</h2>
                <div>{labels.agendaSub}</div>
              </div>
              {agendaEvents.length === 0 ? (
                <p className="agenda-empty">{labels.emptyUpcoming}</p>
              ) : (
                <div className="agenda-list">{agendaEvents.slice(0, 8).map(renderRow)}</div>
              )}
              {monthNav}
            </div>
          </section>
        )}

        {/* Lijst: dezelfde maand als het raster, chronologisch, met de legende en
            het abonneerblok ernaast. */}
        {view === "list" && (
          <section className="agenda" style={{ marginTop: 0 }}>
            {aside}
            <div>
              <div className="agenda-head">
                <h2>{monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1)}</h2>
                <div>
                  {monthOnlyEvents.length}{" "}
                  {monthOnlyEvents.length === 1
                    ? locale === "nl"
                      ? "evenement"
                      : "event"
                    : locale === "nl"
                      ? "evenementen"
                      : "events"}
                </div>
              </div>
              {monthOnlyEvents.length === 0 ? (
                <p className="agenda-empty">{labels.emptyMonth}</p>
              ) : (
                <div className="agenda-list">{monthOnlyEvents.map(renderRow)}</div>
              )}
              {monthNav}
            </div>
          </section>
        )}
      </div>
    </>
  );
}
