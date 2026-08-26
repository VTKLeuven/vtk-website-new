"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { markdownToPlainText } from "@/lib/markdown";
import { CalendarSubscribe } from "@/components/site/CalendarSubscribe";
import { monthGridCells, weekGridDays, isSameCalendarDay } from "./calendarGrid";

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
    /**
     * Hoeveel mensen aanduidden dat ze komen, of `null` zolang het er te weinig
     * zijn. De drempel zit aan de serverkant (zie lib/calendar/interest.ts), dus
     * een laag getal komt hier niet eens aan.
     */
    interestedCount: number | null;
  };
};

/**
 * De eerste paar zinnen van een beschrijving, afgekapt op een woordgrens.
 *
 * Bewust geen `line-clamp` in CSS: die kapt het beeld af maar niet de tekst, dus
 * blijft de rest in de DOM staan en leest een screenreader een halve pagina voor
 * in een kaartje van drie regels.
 */
function previewSummary(text: string, max = 260): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

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
  /** Niet-null = doelgroepcategorie: aparte filterchip en een label op het event. */
  audience: string | null;
};

export function KalenderEditorialView({
  locale,
  labels,
  categories,
  feedBaseUrl,
  lockedCategory,
  heading,
  parentCrumb,
  intro,
  defaultOnlyMyAudiences = false,
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
    audienceFilters: string;
    onlyMyAudiences: string;
    onlyMyAudiencesHint: string;
    emptyMonth: string;
    emptyUpcoming: string;
    views: { agenda: string; week: string; list: string };
  };
  categories: CalendarCategoryOption[];
  /** Absolute URL van de hoofdfeed; de abonneerdialoog stelt de selectie samen. */
  feedBaseUrl: string;
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
  /**
   * Beginstand van "Afstemmen op mijn profiel", uit de accountvoorkeur van het
   * lid. Zonder dit stond het vinkje altijd uit en moest wie de voorkeur net
   * aanzette hem hier opnieuw aanklikken.
   */
  defaultOnlyMyAudiences?: boolean;
}) {
  const base = locale === "nl" ? "" : "/en";
  const now = new Date();
  const [cursor, setCursor] = useState(
    () => new Date(now.getFullYear(), now.getMonth(), now.getDate()),
  );
  const [filter, setFilter] = useState<string>(lockedCategory ?? "all");
  const [view, setView] = useState<"agenda" | "week" | "list">("agenda");
  // Alles is standaard zichtbaar. Personalisatie is een bewuste keuze en houdt
  // algemene events plus de doelgroepevents die bij het profiel horen over; de
  // beginstand komt uit de accountvoorkeur van het lid.
  const [onlyMyAudiences, setOnlyMyAudiences] = useState(defaultOnlyMyAudiences);
  // Enkel voor het smalle scherm: welke dag staat er open onder het raster. Op
  // een telefoon passen de eventpillen niet in een cel van 45 pixels, dus toont
  // het raster daar stippen en lees je de dag zelf hieronder.
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [monthEvents, setMonthEvents] = useState<ApiEvent[]>([]);
  const [agendaEvents, setAgendaEvents] = useState<ApiEvent[]>([]);
  // Het evenement waarvan de voorvertoning openstaat. Een klik in het raster
  // opent eerst dit kaartje: in een cel past hoogstens een afgekapte titel, en
  // meteen doorsturen naar een volledige pagina is een dure manier om te
  // ontdekken dat je het verkeerde evenement aanklikte.
  const [preview, setPreview] = useState<ApiEvent | null>(null);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const cells = useMemo(() => monthGridCells(year, month), [year, month]);
  const weekDays = useMemo(() => weekGridDays(cursor), [cursor]);

  const categoryName = useCallback(
    (c: { nameNl: string; nameEn: string }) => (locale === "nl" ? c.nameNl : c.nameEn),
    [locale],
  );
  const themeCategories = categories.filter((c) => c.audience === null);
  const audienceOptions = categories.filter((c) => c.audience !== null);
  const selectedAudience = audienceOptions.some((c) => c.slug === filter);

  const fetchForRange = useCallback(
    async (start: Date, end: Date) => {
      const url = new URL("/api/calendar/events", window.location.origin);
      url.searchParams.set("start", start.toISOString());
      url.searchParams.set("end", end.toISOString());
      if (filter !== "all") url.searchParams.set("category", filter);
      if (onlyMyAudiences) url.searchParams.set("audience", "mine");
      const res = await fetch(url.toString());
      if (!res.ok) return [];
      return (await res.json()) as ApiEvent[];
    },
    [filter, onlyMyAudiences],
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

  useEffect(() => {
    if (!preview) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setPreview(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [preview]);

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

  const weekEvents = useMemo(
    () => weekDays.flatMap((day) => eventsByDay.get(dayKey(day)) ?? []),
    [eventsByDay, weekDays],
  );

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
      .map((c) => ({
        key: c.slug,
        name: categoryName(c),
        colour: c.colour,
        count: counts.get(c.slug)!,
      }));
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

    const firstWithEvents = cells.find(
      (c) => c.inMonth && (eventsByDay.get(dayKey(c.date))?.length ?? 0) > 0,
    );
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
  const weekFrom = weekDays[0]!;
  const weekTo = weekDays[6]!;
  const weekLabel = `${weekFrom.toLocaleDateString(locale === "nl" ? "nl-BE" : "en-GB", {
    day: "numeric",
    month: "short",
  })} – ${weekTo.toLocaleDateString(locale === "nl" ? "nl-BE" : "en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })}`;

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

  /**
   * Een chip die al aanstaat, zet de filter uit. Zonder dit is "alles" enkel te
   * bereiken via de knop links, en dat is precies niet waar iemand kijkt die net
   * op "Alumni" duwde en het weer weg wil.
   */
  function toggleFilter(slug: string) {
    setFilter((current) => (current === slug ? "all" : slug));
  }

  function shiftPeriod(delta: number) {
    if (view === "week") {
      const next = new Date(cursor);
      next.setDate(next.getDate() + delta * 7);
      setCursor(next);
      return;
    }
    setCursor(new Date(year, month + delta, 1));
  }

  function eventHref(e: ApiEvent) {
    return `${base}/kalender/${e.id}`;
  }

  /**
   * Vangt de gewone klik op een evenement af en opent de voorvertoning. De
   * `href` blijft staan: middenklik, ctrl-klik en "link openen in nieuw tabblad"
   * horen gewoon naar de pagina te gaan, en een zoekmachine ziet nog altijd een
   * echte link.
   */
  function openPreview(event: React.MouseEvent, item: ApiEvent) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
      return;
    }
    event.preventDefault();
    setPreview(item);
  }

  /** "32 komen", of niets zolang de teller onder de drempel zit. */
  function interestLine(e: ApiEvent): string | null {
    const count = e.extendedProps.interestedCount;
    if (!count) return null;
    return locale === "nl" ? `${count} komen` : `${count} going`;
  }

  const showMonthGrid = view === "agenda";
  const periodCount = view === "week" ? weekEvents.length : monthOnlyEvents.length;

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
    const going = interestLine(e);
    return (
      <a
        key={e.id}
        href={eventHref(e)}
        className="ag-row"
        onClick={(event) => openPreview(event, e)}
      >
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
          {going ? <span className="ev-going">{going}</span> : null}
        </div>
        <div className="ag-desc">{pickDesc(e) || pickGroup(e)}</div>
        <div
          className="ag-tag"
          style={
            cat
              ? ({
                  background: cat.colour,
                  borderColor: cat.colour,
                  color: "#fff",
                } as React.CSSProperties)
              : undefined
          }
        >
          {cat ? categoryName(cat) : pickGroup(e)}
        </div>
        <div className="ag-go">→</div>
      </a>
    );
  }

  const periodNav = (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        marginTop: 32,
        flexWrap: "wrap",
        gap: 12,
      }}
    >
      <button type="button" className="btn btn-ghost arrow" onClick={() => shiftPeriod(-1)}>
        {view === "week" ? (locale === "nl" ? "Vorige week" : "Previous week") : labels.prevEvents}
      </button>
      <button type="button" className="btn btn-primary arrow" onClick={() => shiftPeriod(1)}>
        {view === "week" ? (locale === "nl" ? "Volgende week" : "Next week") : labels.nextMonth}
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
        feedBaseUrl={feedBaseUrl}
        categories={categories}
        selectedSlug={filter === "all" ? null : filter}
        locale={locale}
        labels={{ title: labels.subscribeTitle, sub: labels.subscribeSub }}
      />
    </aside>
  );

  /**
   * De voorvertoning. Toont wat een cel niet kwijt kan: de volledige titel, een
   * samenvatting, waar en wanneer, en of er al volk komt. De knop eronder gaat
   * pas naar de eventpagina, waar de tickets, het formulier en de
   * aanwezigheidslijst staan.
   */
  const previewCard = preview ? (
    <div
      className="ev-preview-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={pickTitle(preview)}
      onClick={() => setPreview(null)}
    >
      <div className="ev-preview" onClick={(event) => event.stopPropagation()}>
        <button
          type="button"
          className="ev-preview-close"
          onClick={() => setPreview(null)}
          aria-label={locale === "nl" ? "Sluiten" : "Close"}
        >
          ×
        </button>

        <div className="ev-preview-tags">
          {preview.extendedProps.categories.map((c) => (
            <span
              key={c.slug}
              className={`ev-preview-tag${c.audience ? " audience" : ""}`}
              style={{ "--cat": c.colour } as React.CSSProperties}
            >
              {categoryName(c)}
            </span>
          ))}
        </div>

        <h3>{pickTitle(preview)}</h3>

        <dl className="ev-preview-meta">
          <div>
            <dt>{locale === "nl" ? "Wanneer" : "When"}</dt>
            <dd>
              {new Date(preview.start).toLocaleDateString(locale === "nl" ? "nl-BE" : "en-GB", {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
              {" · "}
              {eventTime(preview)}
            </dd>
          </div>
          {preview.location ? (
            <div>
              <dt>{locale === "nl" ? "Waar" : "Where"}</dt>
              <dd>{preview.location}</dd>
            </div>
          ) : null}
          <div>
            <dt>{locale === "nl" ? "Door" : "By"}</dt>
            <dd>{pickGroup(preview)}</dd>
          </div>
        </dl>

        {pickDesc(preview) ? (
          <p className="ev-preview-desc">{previewSummary(pickDesc(preview))}</p>
        ) : null}

        {interestLine(preview) ? (
          <p className="ev-preview-going">{interestLine(preview)}</p>
        ) : null}

        <a href={eventHref(preview)} className="btn btn-primary arrow ev-preview-go">
          {locale === "nl" ? "Naar de evenementpagina" : "Go to the event page"}
        </a>
      </div>
    </div>
  ) : null;

  return (
    <>
      {previewCard}
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
          <b>{periodCount}</b>{" "}
          {view === "week"
            ? locale === "nl"
              ? "Evenementen (deze week)"
              : "Events (this week)"
            : labels.metaEvents}
        </div>
      </header>

      <div className="kal-wrap">
        {/* De weergavekeuze staat bovenaan bij de maandnavigatie, niet naast de
            filterchips: daar leek ze een categorie in plaats van "hoe kijk ik". */}
        <div className="toolbar">
          <div className="toolbar-top">
            <div className="nav-mo">
              <button
                type="button"
                onClick={() => shiftPeriod(-1)}
                aria-label={view === "week" ? "Previous week" : "Previous month"}
              >
                ←
              </button>
              <button
                type="button"
                onClick={() => shiftPeriod(1)}
                aria-label={view === "week" ? "Next week" : "Next month"}
              >
                →
              </button>
            </div>
            <div className="mo-label">
              {view === "week"
                ? weekLabel
                : monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1)}
              <small>
                {view === "week"
                  ? locale === "nl"
                    ? "Weekoverzicht"
                    : "Week overview"
                  : `${labels.weekLine} ${gridRange}`}{" "}
                · {periodCount}{" "}
                {periodCount === 1
                  ? locale === "nl"
                    ? "evenement"
                    : "event"
                  : locale === "nl"
                    ? "evenementen"
                    : "events"}
              </small>
            </div>
            <div
              className="view-switch"
              role="group"
              aria-label={locale === "nl" ? "Weergave" : "View"}
            >
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
                className={view === "week" ? "on" : ""}
                aria-pressed={view === "week"}
                onClick={() => setView("week")}
              >
                {labels.views.week}
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
                {themeCategories.map((c) => (
                  <button
                    key={c.slug}
                    type="button"
                    className={`filter${filter === c.slug ? " on" : ""}`}
                    aria-pressed={filter === c.slug}
                    onClick={() => toggleFilter(c.slug)}
                  >
                    {categoryName(c)}
                  </button>
                ))}
              </div>
              {audienceOptions.length > 0 ? (
                <div className="audience-filters" aria-label={labels.audienceFilters}>
                  <span>{labels.audienceFilters}</span>
                  {audienceOptions.map((c) => (
                    <button
                      key={c.slug}
                      type="button"
                      className={`filter audience-filter${filter === c.slug ? " on" : ""}`}
                      aria-pressed={filter === c.slug}
                      style={{ "--cat": c.colour } as React.CSSProperties}
                      onClick={() => {
                        toggleFilter(c.slug);
                        setOnlyMyAudiences(false);
                      }}
                    >
                      {categoryName(c)}
                    </button>
                  ))}
                  <label className="audience-toggle" title={labels.onlyMyAudiencesHint}>
                    <input
                      type="checkbox"
                      checked={onlyMyAudiences}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setOnlyMyAudiences(checked);
                        if (checked && selectedAudience) setFilter("all");
                      }}
                    />
                    {labels.onlyMyAudiences}
                  </label>
                </div>
              ) : null}
            </div>
          )}
        </div>

        {showMonthGrid && (
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
                              style={
                                cat ? ({ "--cat": cat.colour } as React.CSSProperties) : undefined
                              }
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
                          onClick={(event) => openPreview(event, e)}
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
                          {interestLine(e) ? (
                            <span className="ev-going">{interestLine(e)}</span>
                          ) : null}
                        </a>
                      );
                    })}
                    {more > 0 ? (
                      <div
                        className="ev-pill more"
                        title={list.map((e) => pickTitle(e)).join(", ")}
                      >
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
                        {
                          weekday: "long",
                          day: "numeric",
                          month: "long",
                        },
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
                          onClick={(event) => openPreview(event, e)}
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
                          {interestLine(e) ? (
                            <span className="ev-going">{interestLine(e)}</span>
                          ) : null}
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

        {view === "week" && (
          <div className="kal-main week-main">
            <div>
              <section
                className="week-cal"
                aria-label={locale === "nl" ? "Weekkalender" : "Week calendar"}
              >
                {weekDays.map((date) => {
                  const events = eventsByDay.get(dayKey(date)) ?? [];
                  const today = isSameCalendarDay(date, new Date());
                  return (
                    <div key={dayKey(date)} className={`week-day${today ? " today" : ""}`}>
                      <header>
                        <span>
                          {date.toLocaleDateString(locale === "nl" ? "nl-BE" : "en-GB", {
                            weekday: "short",
                          })}
                        </span>
                        <b>{date.getDate()}</b>
                        <small>
                          {date.toLocaleDateString(locale === "nl" ? "nl-BE" : "en-GB", {
                            month: "short",
                          })}
                        </small>
                      </header>
                      <div className="week-events">
                        {events.length === 0 ? (
                          <span className="week-empty">
                            {locale === "nl" ? "Geen evenementen" : "No events"}
                          </span>
                        ) : (
                          events.map((event) => {
                            const cat = primaryCategory(event);
                            return (
                              <a
                                key={event.id}
                                href={eventHref(event)}
                                className="week-event"
                                style={
                                  cat ? ({ "--cat": cat.colour } as React.CSSProperties) : undefined
                                }
                                onClick={(clicked) => openPreview(clicked, event)}
                              >
                                <span className="week-event-time">{eventTime(event)}</span>
                                <b>{pickTitle(event)}</b>
                                {event.location ? <small>{event.location}</small> : null}
                                {audienceCategories(event).map((audience) => (
                                  <span
                                    key={audience.slug}
                                    className="week-audience"
                                    style={{ "--cat": audience.colour } as React.CSSProperties}
                                  >
                                    {categoryName(audience)}
                                  </span>
                                ))}
                                {interestLine(event) ? (
                                  <span className="ev-going">{interestLine(event)}</span>
                                ) : null}
                              </a>
                            );
                          })
                        )}
                      </div>
                    </div>
                  );
                })}
              </section>
              {periodNav}
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
              {periodNav}
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
              {periodNav}
            </div>
          </section>
        )}
      </div>
    </>
  );
}
