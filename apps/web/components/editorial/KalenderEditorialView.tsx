'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { markdownToPlainText } from '@/lib/markdown';
import { CalendarSubscribe } from '@/components/site/CalendarSubscribe';
import { Markdown } from '@/components/ui/Markdown';
import { EventInterest } from '@/components/calendar/EventInterest';
import { EventStar, type EventStarLabels } from '@/components/calendar/EventStar';
import type { ViewerInterest } from '@/lib/calendar/interest';
import {
  eventOccursOnDay,
  isMultiDayEvent,
  weekEventSpans,
  monthGridCells,
  rollingWeeksGridCells,
  weekGridDays,
  isSameCalendarDay,
  startOfWeek,
  type GridDay,
} from './calendarGrid';

/**
 * Hoeveel weken de agenda vooruit toont. Zes rijen van 132 pixels waren hoger
 * dan het scherm van een 13-inch laptop; vier passen er samen met de kop op.
 */
const AGENDA_WEEKS = 4;

type ApiEvent = {
  id: string;
  slug: string;
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
    /** De cover van het evenement; de server koos de standaardfoto al als er geen eigen foto is. */
    image: string;
    /** `object-position` van de gekozen uitsnede, of `null` bij de standaardfoto. */
    imagePosition: string | null;
    /**
     * Hoeveel mensen aanduidden dat ze komen, of `null` zolang het er te weinig
     * zijn. De drempel zit aan de serverkant (zie lib/calendar/interest.ts), dus
     * een laag getal komt hier niet eens aan.
     */
    interestedCount: number | null;
    /** De eigen per-eventkeuzes, ook voor een alumnus met alleen een gastcookie. */
    viewerInterest: ViewerInterest;
    /** Heb jij dit aangeduid, afgeleid van `viewerInterest`. */
    interested: boolean;
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
  const lastSpace = cut.lastIndexOf(' ');
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
  descriptionNl: string | null;
  descriptionEn: string | null;
  colour: string;
  /** Niet-null = doelgroepcategorie: aparte filterchip en een label op het event. */
  audience: string | null;
};

export function KalenderEditorialView({
  locale,
  labels,
  categories,
  feedBaseUrl,
  defaultOnlyMyAudiences = false,
  signedIn = false,
}: {
  locale: 'nl' | 'en';
  labels: {
    crumbsHome: string;
    crumbsHere: string;
    agendaNext: string;
    agendaSub: string;
    subscribeTitle: string;
    subscribeSub: string;
    all: string;
    audienceFilters: string;
    onlyMyAudiences: string;
    onlyMyAudiencesHint: string;
    emptyMonth: string;
    emptyUpcoming: string;
    views: { grid: string; agenda: string; week: string };
    gridWeek: string;
    showPast: string;
  };
  categories: CalendarCategoryOption[];
  /** Absolute URL van de hoofdfeed; de abonneerdialoog stelt de selectie samen. */
  feedBaseUrl: string;
  /**
   * Beginstand van "Afstemmen op mijn profiel", uit de accountvoorkeur van het
   * lid. Zonder dit stond het vinkje altijd uit en moest wie de voorkeur net
   * aanzette hem hier opnieuw aanklikken.
   */
  defaultOnlyMyAudiences?: boolean;
  /** Bepaalt of de voorvertoning een knop toont of een verwijzing naar inloggen. */
  signedIn?: boolean;
}) {
  const base = locale === 'nl' ? '' : '/en';
  const pathname = usePathname();
  const now = new Date();
  const [cursor, setCursor] = useState(() => new Date(now.getFullYear(), now.getMonth(), now.getDate()));
  // De gekozen categorie blijft een deelbare route, maar wordt uit de huidige
  // client-URL afgeleid. `history.pushState` wijzigt die URL zonder een nieuwe
  // Server Component-render op te halen; Next.js 16 houdt `usePathname` daarbij
  // zelf synchroon. Zo blijven terug/vooruit en een gekopieerde slug werken.
  const filter = useMemo(() => {
    const slug = pathname.split('/').filter(Boolean).at(-1);
    return categories.some((category) => category.slug === slug) ? slug! : 'all';
  }, [categories, pathname]);
  // Het raster met affiches is de standaard. Wie de kalender opendoet wil eerst
  // weten wát er is, en een kaart met de affiche erop zegt dat sneller dan een
  // dagcel waarin hoogstens een afgekapte titel past. Het maandraster en de
  // weekweergave blijven ernaast staan voor wie op een datum zoekt.
  const [view, setView] = useState<'grid' | 'agenda' | 'week'>('grid');
  // Binnen de huidige maand begint het raster bij deze week. Deze knop zet de
  // weken die al voorbij zijn er alsnog bij.
  const [showPast, setShowPast] = useState(false);
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
  // Het raster is een rollend venster van vier weken en blijft dat ook bij het
  // bladeren: de pijlen schuiven het venster op, ze springen niet naar een
  // maandraster van zes rijen dat weer buiten het scherm valt.
  const cells = useMemo(() => rollingWeeksGridCells(cursor, AGENDA_WEEKS), [cursor]);
  // De lijstweergave blijft wel per maand werken; die heeft geen rasterhoogte.
  const monthCells = useMemo(() => monthGridCells(year, month), [year, month]);
  const weekDays = useMemo(() => weekGridDays(cursor), [cursor]);

  const categoryName = useCallback(
    (c: { nameNl: string; nameEn: string }) => (locale === 'nl' ? c.nameNl : c.nameEn),
    [locale]
  );
  const selectedCategory = categories.find((category) => category.slug === filter) ?? null;
  const selectedDescription = selectedCategory
    ? locale === 'nl'
      ? selectedCategory.descriptionNl
      : selectedCategory.descriptionEn
    : null;
  const themeCategories = categories.filter((c) => c.audience === null);
  const audienceOptions = categories.filter((c) => c.audience !== null);

  const fetchForRange = useCallback(
    async (start: Date, end: Date) => {
      const url = new URL('/api/calendar/events', window.location.origin);
      url.searchParams.set('start', start.toISOString());
      url.searchParams.set('end', end.toISOString());
      if (filter !== 'all') url.searchParams.set('category', filter);
      if (onlyMyAudiences) url.searchParams.set('audience', 'mine');
      const res = await fetch(url.toString());
      if (!res.ok) return [];
      return (await res.json()) as ApiEvent[];
    },
    [filter, onlyMyAudiences]
  );

  /**
   * De dagen die de actieve weergave nodig heeft. Dat is meteen het bereik dat
   * we ophalen: de lijst werkt per maand, het raster per venster van vier weken.
   */
  const rangeDays = useMemo(() => {
    if (view === 'week') return weekDays;
    if (view === 'agenda') return cells.map((cell) => cell.date);
    return monthCells.map((cell) => cell.date);
  }, [view, weekDays, monthCells, cells]);

  useEffect(() => {
    const start = new Date(rangeDays[0]!);
    start.setHours(0, 0, 0, 0);
    const end = new Date(rangeDays.at(-1)!);
    end.setHours(23, 59, 59, 999);
    let cancelled = false;
    void (async () => {
      const data = await fetchForRange(start, end);
      if (!cancelled) setMonthEvents(data);
    })();
    return () => {
      cancelled = true;
    };
  }, [rangeDays, fetchForRange]);

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
      if (event.key === 'Escape') setPreview(null);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [preview]);

  const eventsByDay = useMemo(() => {
    const m = new Map<string, ApiEvent[]>();
    for (const { date } of cells) {
      m.set(
        dayKey(date),
        monthEvents.filter((event) => eventOccursOnDay(event, date))
      );
    }
    for (const arr of m.values()) {
      arr.sort((a, b) => +new Date(a.start) - +new Date(b.start));
    }
    return m;
  }, [monthEvents, cells]);

  /**
   * Het raster in weekrijen, zonder de lege weken aan het begin en het einde.
   * Een venster dat opent op een stille week toonde anders een rij van zeven
   * lege cellen die de weken met iets erin naar beneden duwde.
   *
   * Er blijft altijd minstens één rij staan, en er wordt pas ingekort zodra de
   * evenementen binnen zijn: anders knipt de eerste render, waarin nog niets
   * geladen is, het hele raster weg.
   */
  const weekRows = useMemo(() => {
    const rows: GridDay[][] = [];
    for (let index = 0; index < cells.length; index += 7) rows.push(cells.slice(index, index + 7));
    if (monthEvents.length === 0) return rows;
    const today = new Date();
    // De week van vandaag blijft staan, ook als er niets in gepland is: dat is
    // het punt waar iemand zich op oriënteert.
    const keep = (row: GridDay[]) =>
      row.some(
        (cell) => (eventsByDay.get(dayKey(cell.date))?.length ?? 0) > 0 || isSameCalendarDay(cell.date, today)
      );
    while (rows.length > 1 && !keep(rows[0]!)) rows.shift();
    while (rows.length > 1 && !keep(rows.at(-1)!)) rows.pop();
    return rows;
  }, [cells, eventsByDay, monthEvents.length]);

  const visibleCells = useMemo(() => weekRows.flat(), [weekRows]);

  const weekEvents = useMemo(
    () => monthEvents.filter((event) => weekDays.some((day) => eventOccursOnDay(event, day))),
    [monthEvents, weekDays]
  );

  /**
   * De evenementen van de maand zelf, chronologisch. Het maandraster loopt door
   * in de vorige en de volgende maand; die uitlopers horen niet in een lijst met
   * "Augustus 2026" erboven.
   */
  const monthOnlyEvents = useMemo(
    () =>
      monthEvents
        .filter((e) => {
          return monthCells.some(({ date, inMonth }) => inMonth && eventOccursOnDay(e, date));
        })
        .sort((a, b) => +new Date(a.start) - +new Date(b.start)),
    [monthEvents, monthCells]
  );

  /**
   * De evenementen van het raster, gebundeld per week.
   *
   * Gegroepeerd op de maandag van de **startdag**, en niet op elke dag waarop
   * een evenement valt: een meerdaags evenement zou anders in twee weekblokken
   * staan en twee keer geteld worden.
   *
   * Binnen de huidige maand vallen de weken weg die al voorbij zijn. Het raster
   * is de eerste weergave die iemand ziet, en dan is "wat komt er" de vraag, niet
   * "wat heb ik gemist"; de knop eronder haalt ze alsnog terug. In een maand die
   * volledig achter ons ligt gebeurt dat niet, want dan blijft er niets over.
   */
  const gridWeeks = useMemo(() => {
    const groups = new Map<string, { monday: Date; events: ApiEvent[] }>();
    for (const event of monthOnlyEvents) {
      const monday = startOfWeek(new Date(event.start));
      const key = dayKey(monday);
      const group = groups.get(key);
      if (group) group.events.push(event);
      else groups.set(key, { monday, events: [event] });
    }
    return [...groups.values()].sort((a, b) => +a.monday - +b.monday);
  }, [monthOnlyEvents]);

  const pastWeekCount = useMemo(() => {
    const monthEnd = new Date(year, month + 1, 0, 23, 59, 59, 999);
    if (monthEnd < new Date()) return 0;
    const thisMonday = startOfWeek(new Date());
    return gridWeeks.filter((group) => group.monday < thisMonday).length;
  }, [gridWeeks, year, month]);

  const shownGridWeeks = showPast || pastWeekCount === 0 ? gridWeeks : gridWeeks.slice(pastWeekCount);
  const shownGridCount = shownGridWeeks.reduce((total, group) => total + group.events.length, 0);
  const hiddenGridCount = monthOnlyEvents.length - shownGridCount;

  /**
   * De dag die op smal scherm opengeklapt staat. Bewust afgeleid in plaats van in
   * een effect bijgehouden: bladert de gebruiker naar een andere maand, dan valt
   * de oude keuze buiten het raster en kiezen we meteen een zinnige nieuwe
   * (vandaag, anders de eerste dag met iets erop, anders de eerste van de maand).
   */
  const selectedDayKey = useMemo(() => {
    const inGrid = (key: string) => visibleCells.some((c) => dayKey(c.date) === key);
    if (selectedKey && inGrid(selectedKey)) return selectedKey;

    const todayKey = dayKey(new Date());
    if (visibleCells.some((c) => c.inMonth && dayKey(c.date) === todayKey)) return todayKey;

    const firstWithEvents = visibleCells.find((c) => c.inMonth && (eventsByDay.get(dayKey(c.date))?.length ?? 0) > 0);
    if (firstWithEvents) return dayKey(firstWithEvents.date);

    const firstOfMonth = visibleCells.find((c) => c.inMonth);
    return firstOfMonth ? dayKey(firstOfMonth.date) : null;
  }, [selectedKey, visibleCells, eventsByDay]);

  const selectedDate = useMemo(
    () => visibleCells.find((c) => dayKey(c.date) === selectedDayKey)?.date ?? null,
    [visibleCells, selectedDayKey]
  );
  const selectedEvents = selectedDayKey ? (eventsByDay.get(selectedDayKey) ?? []) : [];

  const monthLabel = cursor.toLocaleDateString(locale === 'nl' ? 'nl-BE' : 'en-GB', {
    month: 'long',
    year: 'numeric',
  });
  const dateLocale = locale === 'nl' ? 'nl-BE' : 'en-GB';
  const gridFrom = visibleCells[0]!.date;
  const gridTo = visibleCells.at(-1)!.date;
  /** "14 sep - 11 okt 2026": het venster dat het raster nu toont. */
  const windowLabel =
    gridFrom.toLocaleDateString(dateLocale, { day: 'numeric', month: 'short' }) +
    ' - ' +
    gridTo.toLocaleDateString(dateLocale, { day: 'numeric', month: 'short', year: 'numeric' });
  const weekFrom = weekDays[0]!;
  const weekTo = weekDays[6]!;
  const weekLabel = `${weekFrom.toLocaleDateString(locale === 'nl' ? 'nl-BE' : 'en-GB', {
    day: 'numeric',
    month: 'short',
  })} - ${weekTo.toLocaleDateString(locale === 'nl' ? 'nl-BE' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })}`;

  function pickTitle(e: ApiEvent) {
    return locale === 'nl' ? e.title : e.titleEn || e.title;
  }

  function pickDesc(e: ApiEvent) {
    const d = locale === 'nl' ? e.extendedProps.descriptionNl : e.extendedProps.descriptionEn;
    return markdownToPlainText(d ?? '');
  }

  function pickGroup(e: ApiEvent) {
    return locale === 'nl' ? e.extendedProps.groupNameNl : e.extendedProps.groupNameEn;
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
    if (e.allDay) return locale === 'nl' ? 'Hele dag' : 'All day';
    return new Date(e.start).toLocaleTimeString(locale === 'nl' ? 'nl-BE' : 'en-GB', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  /**
   * Bladeren doet wat de weergave toont: de lijst gaat per maand, de week per
   * week, en het raster schuift zijn venster van vier weken op. Dat laatste
   * verving een sprong naar het maandraster: die maakte het raster meteen weer
   * zes rijen hoog, precies wat het venster moest oplossen.
   */
  function shiftPeriod(delta: number) {
    if (view === 'grid') {
      setCursor(new Date(year, month + delta, 1));
      return;
    }
    const next = new Date(cursor);
    next.setDate(next.getDate() + delta * (view === 'week' ? 7 : AGENDA_WEEKS * 7));
    setCursor(next);
  }

  function eventHref(e: ApiEvent) {
    return `${base}/kalender/${e.slug}`;
  }

  function filterHref(slug: string | null): string {
    if (!slug || filter === slug) return `${base}/kalender`;
    return `${base}/kalender/${slug}`;
  }

  /**
   * Houdt de echte link als no-JavaScript- en nieuw-tabbladfallback, maar vangt
   * een gewone klik client-side af. De API-fetch reageert daarna op `filter`;
   * het kalenderframe, de gekozen maand en de scrollpositie blijven staan.
   */
  function switchFilter(event: React.MouseEvent<HTMLAnchorElement>, slug: string | null) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
      return;
    }
    event.preventDefault();
    const href = filterHref(slug);
    if (href !== pathname) window.history.pushState(null, '', href);
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

  /**
   * Werkt de lokaal geladen evenementen bij na een klik op "ik kom".
   *
   * Zonder dit blijft de knop in de oude stand staan tot de volgende fetch, en
   * dat is precies het moment waarop iemand denkt dat zijn klik niet aankwam en
   * nog eens duwt. De teller schuift mee, maar enkel wanneer hij al zichtbaar was:
   * de drempel is een serverbeslissing, en die mogen we hier niet nabootsen.
   */
  function markInterest(eventId: string, nextViewer: ViewerInterest) {
    const next = nextViewer.kind !== 'none';
    const apply = (list: ApiEvent[]) =>
      list.map((item) =>
        item.id === eventId
          ? {
              ...item,
              extendedProps: {
                ...item.extendedProps,
                interested: next,
                viewerInterest: nextViewer,
                interestedCount:
                  item.extendedProps.interestedCount === null || item.extendedProps.interested === next
                    ? item.extendedProps.interestedCount
                    : Math.max(0, item.extendedProps.interestedCount + (next ? 1 : -1)),
              },
            }
          : item
      );
    setMonthEvents(apply);
    setAgendaEvents(apply);
    setPreview((current) =>
      current && current.id === eventId
        ? {
            ...current,
            extendedProps: {
              ...current.extendedProps,
              interested: next,
              viewerInterest: nextViewer,
              interestedCount:
                current.extendedProps.interestedCount === null || current.extendedProps.interested === next
                  ? current.extendedProps.interestedCount
                  : Math.max(0, current.extendedProps.interestedCount + (next ? 1 : -1)),
            },
          }
        : current
    );
  }

  /** "32 komen", of niets zolang de teller onder de drempel zit. */
  function interestLine(e: ApiEvent): string | null {
    const count = e.extendedProps.interestedCount;
    if (!count) return null;
    return locale === 'nl' ? `${count} komen` : `${count} going`;
  }

  const periodNoun =
    view === 'week'
      ? locale === 'nl'
        ? 'week'
        : 'week'
      : view === 'grid'
        ? locale === 'nl'
          ? 'maand'
          : 'month'
        : locale === 'nl'
          ? 'vier weken'
          : 'four weeks';
  const previousLabel = locale === 'nl' ? `Vorige ${periodNoun}` : `Previous ${periodNoun}`;
  const nextLabel = locale === 'nl' ? `Volgende ${periodNoun}` : `Next ${periodNoun}`;

  const showMonthGrid = view === 'agenda';
  const periodCount = view === 'week' ? weekEvents.length : view === 'grid' ? shownGridCount : monthEvents.length;

  const starLabels: EventStarLabels = {
    mark: locale === 'nl' ? 'Ik kom naar dit evenement' : 'I am coming to this event',
    marked: locale === 'nl' ? 'Je komt naar dit evenement' : 'You are coming to this event',
    signIn: locale === 'nl' ? 'Meld je aan om aan te duiden dat je komt' : 'Sign in to mark that you are coming',
    failed:
      locale === 'nl'
        ? 'Aanduiden lukte niet. Probeer het straks opnieuw.'
        : 'Marking this did not work. Try again in a moment.',
  };

  /**
   * De ster in een lijstrij houdt zijn eigen stand bij; dit trekt de rest van de
   * pagina mee, zodat de teller en een openstaande voorvertoning van hetzelfde
   * evenement niet achterblijven. Bestaande alumnigegevens blijven staan: de ster
   * zet enkel de markering aan of uit.
   */
  function starChanged(e: ApiEvent, interested: boolean) {
    const previous = e.extendedProps.viewerInterest;
    markInterest(
      e.id,
      interested
        ? previous.kind !== 'none'
          ? previous
          : {
              kind: 'member',
              displayName: null,
              graduationYear: null,
              wasInVtk: false,
              showName: false,
              showGraduationYear: false,
              showWasInVtk: false,
            }
        : { kind: 'none' }
    );
  }

  /**
   * Eén rij in een evenementenlijst. Gedeeld door de "eerstvolgend"-lijst onder
   * het raster en de maandlijst, zodat beide dezelfde labels en dezelfde
   * kleurlogica houden.
   *
   * De rij toont de affiche van het evenement en niet meer de eerste alinea van
   * de beschrijving: die liep over vijf regels, zei zelden wat het evenement is,
   * en duwde de rijen zo ver uit elkaar dat er nog drie op een scherm pasten.
   *
   * Een klik gaat rechtstreeks naar de eventpagina. De voorvertoning blijft waar
   * ze wél iets toevoegt: in het raster en de weekweergave staat hoogstens een
   * afgekapte titel in een cel, hier staat alles al.
   *
   * Daarom is de rij een `article` en geen `a`: een knop in een anker is
   * ongeldige HTML en op een telefoon opent de ster dan de eventpagina. De titel
   * is de link en spant zich over de kaart (`.ag-link::after`); de ster ligt
   * erboven.
   */
  function renderRow(e: ApiEvent) {
    // Het label rechts toont het thema. De doelgroep staat al bij de titel, dus
    // die hier herhalen zou twee keer "Eerstejaars" geven.
    const cat = e.extendedProps.categories.find((c) => c.audience === null) ?? null;
    const d = new Date(e.start);
    const dateLocale = locale === 'nl' ? 'nl-BE' : 'en-GB';
    const going = interestLine(e);
    const title = pickTitle(e);
    return (
      <article key={e.id} className="ag-row">
        <div className="ag-date">
          <b>{String(d.getDate()).padStart(2, '0')}</b>
          {d.toLocaleDateString(dateLocale, { month: 'short' })} ·{' '}
          {d.toLocaleDateString(dateLocale, { weekday: 'short' })}
        </div>
        <span className="ag-media" aria-hidden="true">
          <Image
            src={e.extendedProps.image}
            alt=""
            fill
            sizes="(max-width: 960px) 100vw, 220px"
            style={e.extendedProps.imagePosition ? { objectPosition: e.extendedProps.imagePosition } : undefined}
          />
        </span>
        <div className="ag-title">
          <a href={eventHref(e)} className="ag-link">
            {title}
          </a>
          {audienceCategories(e).map((a) => (
            <span key={a.slug} className="ag-audience" style={{ '--cat': a.colour } as React.CSSProperties}>
              {categoryName(a)}
            </span>
          ))}
          <small>
            {eventTime(e)}
            {e.location ? ` · ${e.location}` : ''}
          </small>
          {going ? <span className="ev-going">{going}</span> : null}
        </div>
        <div
          className="ag-tag"
          style={
            cat
              ? ({
                  background: cat.colour,
                  borderColor: cat.colour,
                  color: '#fff',
                } as React.CSSProperties)
              : undefined
          }
        >
          {cat ? categoryName(cat) : pickGroup(e)}
        </div>
        {/* De ster houdt zijn eigen stand bij; de sleutel laat hem opnieuw
            beginnen wanneer dit evenement elders van stand wisselt, bijvoorbeeld
            in de voorvertoning of na een verse fetch. Zonder dat blijft de ster
            in de lijst achter op wat de gebruiker net in de modal aanduidde. */}
        <EventStar
          key={`${e.id}:${e.extendedProps.interested}`}
          eventId={e.id}
          title={title}
          interested={e.extendedProps.interested}
          signedIn={signedIn}
          loginHref={`${base}/inloggen?next=${encodeURIComponent(eventHref(e))}`}
          labels={starLabels}
          className="ag-star"
          onChanged={(interested) => starChanged(e, interested)}
        />
        <div className="ag-go" aria-hidden>
          →
        </div>
      </article>
    );
  }

  /**
   * Eén evenement als kaart in het raster: de affiche bovenaan, daaronder de
   * datum, de titel en de plaats.
   *
   * Net als bij de lijstrij is dit een `article` en geen `a`: de ster is een
   * knop, en een knop in een anker is ongeldige HTML. De titel is de link en
   * spant zich over de hele kaart (`.ev-card-link::after`); de ster ligt erboven.
   *
   * De ster staat rechtsboven in het tekstblok, met de teller ernaast op
   * dezelfde regel als de datum. Onderaan stond hij op een eigen regel die de
   * kaart alleen maar hoger maakte, en die regel viel weg zodra niemand nog had
   * aangeduid dat hij kwam; de kaarten in een rij stonden dan ongelijk.
   */
  function renderCard(e: ApiEvent) {
    const cat = e.extendedProps.categories.find((c) => c.audience === null) ?? null;
    const going = interestLine(e);
    const title = pickTitle(e);
    const start = new Date(e.start);
    return (
      <article key={e.id} className="ev-card">
        <div className="ev-card-shot">
          <Image
            src={e.extendedProps.image}
            alt=""
            fill
            sizes="(max-width: 620px) 100vw, (max-width: 1000px) 50vw, 380px"
            style={e.extendedProps.imagePosition ? { objectPosition: e.extendedProps.imagePosition } : undefined}
          />
          {cat ? (
            <span className="ev-card-cat" style={{ '--cat': cat.colour } as React.CSSProperties}>
              {categoryName(cat)}
            </span>
          ) : null}
          {audienceCategories(e).map((a) => (
            <span key={a.slug} className="ev-card-aud" style={{ '--cat': a.colour } as React.CSSProperties}>
              {categoryName(a)}
            </span>
          ))}
        </div>
        <div className="ev-card-body">
          <div className="ev-card-meta">
            <span className="ev-card-when">
              {start.toLocaleDateString(dateLocale, { weekday: 'short', day: 'numeric', month: 'short' })} ·{' '}
              {eventTime(e)}
            </span>
            <span className="ev-card-right">
              {going ? <span className="ev-going">{going}</span> : null}
              <EventStar
                key={`${e.id}:${e.extendedProps.interested}`}
                eventId={e.id}
                title={title}
                interested={e.extendedProps.interested}
                signedIn={signedIn}
                loginHref={`${base}/inloggen?next=${encodeURIComponent(eventHref(e))}`}
                labels={starLabels}
                className="ev-card-star"
                onChanged={(interested) => starChanged(e, interested)}
              />
            </span>
          </div>
          <h3 className="ev-card-title">
            <a href={eventHref(e)} className="ev-card-link">
              {title}
            </a>
          </h3>
          {e.location ? <div className="ev-card-where">{e.location}</div> : null}
        </div>
      </article>
    );
  }

  // De knoppen "vorige/volgende maand" onder elke lijst zijn weg: bovenaan
  // staan dezelfde pijlen, en die blijven bij het bladeren in beeld terwijl deze
  // pas onder de laatste rij verschenen.

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
      <div
        className={`ev-preview${
          preview.extendedProps.viewerInterest.kind !== 'none' &&
          preview.extendedProps.categories.some((category) => category.audience === 'ALUMNI')
            ? ' has-interest'
            : ''
        }`}
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="ev-preview-close"
          onClick={() => setPreview(null)}
          aria-label={locale === 'nl' ? 'Sluiten' : 'Close'}
        >
          ×
        </button>

        <div className="ev-preview-tags">
          {preview.extendedProps.categories.map((c) => (
            <span
              key={c.slug}
              className={`ev-preview-tag${c.audience ? ' audience' : ''}`}
              style={{ '--cat': c.colour } as React.CSSProperties}
            >
              {categoryName(c)}
            </span>
          ))}
        </div>

        <h3>{pickTitle(preview)}</h3>

        <dl className="ev-preview-meta">
          <div>
            <dt>{locale === 'nl' ? 'Wanneer' : 'When'}</dt>
            <dd>
              {new Date(preview.start).toLocaleDateString(locale === 'nl' ? 'nl-BE' : 'en-GB', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              })}
              {' · '}
              {eventTime(preview)}
            </dd>
          </div>
          {preview.location ? (
            <div>
              <dt>{locale === 'nl' ? 'Waar' : 'Where'}</dt>
              <dd>{preview.location}</dd>
            </div>
          ) : null}
          <div>
            <dt>{locale === 'nl' ? 'Door' : 'By'}</dt>
            <dd>{pickGroup(preview)}</dd>
          </div>
        </dl>

        {pickDesc(preview) ? <p className="ev-preview-desc">{previewSummary(pickDesc(preview))}</p> : null}

        {interestLine(preview) ? <p className="ev-preview-going">{interestLine(preview)}</p> : null}

        {/* Aanduiden dat je komt hoort hier al te kunnen: wie in de kalender op
            een evenement klikt, heeft precies dan de vraag "ga ik?" in zijn
            hoofd, en hem daarvoor eerst naar een tweede pagina sturen kost de
            helft van de klikken. */}
        <div className="ev-preview-actions">
          <EventInterest
            eventId={preview.id}
            isAlumniEvent={preview.extendedProps.categories.some((category) => category.audience === 'ALUMNI')}
            signedIn={signedIn}
            viewer={preview.extendedProps.viewerInterest}
            loginHref={`${base}/inloggen?next=${encodeURIComponent(eventHref(preview))}`}
            labels={{
              interested: locale === 'nl' ? 'Geïnteresseerd' : 'Interested',
              removeInterest: locale === 'nl' ? 'Niet meer geïnteresseerd' : 'Remove interest',
              saving: locale === 'nl' ? 'Bezig...' : 'Working...',
              countLine: null,
              loginCta: locale === 'nl' ? 'Log in' : 'Sign in',
              detailsHeading:
                locale === 'nl'
                  ? 'Wat mogen anderen zien bij ‘Wie er komt’?'
                  : 'What may others see under ‘Who is coming’?',
              detailsHint:
                locale === 'nl'
                  ? 'Zo zien anderen wie er komt, en help je dus mede alumni te overtuigen om te komen door ze te laten weten dat ze mensen zullen herkennen!'
                  : 'This shows others who is coming and helps convince fellow alumni by letting them know they will recognise people there.',
              name: locale === 'nl' ? 'Naam (optioneel)' : 'Name (optional)',
              namePlaceholder: locale === 'nl' ? 'Jouw naam' : 'Your name',
              showName: locale === 'nl' ? 'Toon mijn naam' : 'Show my name',
              graduationYear: locale === 'nl' ? 'Afstudeerjaar (optioneel)' : 'Graduation year (optional)',
              showGraduationYear: locale === 'nl' ? 'Toon mijn afstudeerjaar' : 'Show my graduation year',
              wasInVtk: locale === 'nl' ? 'Ik zat in VTK Praesidium' : 'I was in the VTK Praesidium',
              showWasInVtk:
                locale === 'nl' ? 'Toon mijn antwoord over VTK Praesidium' : 'Show my answer about the VTK Praesidium',
              perEventHint:
                locale === 'nl'
                  ? 'Deze gegevens gelden alleen voor dit evenement en komen niet uit je profiel. Alleen aangevinkte informatie wordt publiek getoond.'
                  : 'These details apply only to this event and do not come from your profile. Only selected information is shown publicly.',
              saveDetails: locale === 'nl' ? 'Bewaren' : 'Save',
              detailsSaved: locale === 'nl' ? 'Opgeslagen.' : 'Saved.',
              errorVisibleValue:
                locale === 'nl'
                  ? 'Vul eerst de naam of het afstudeerjaar in dat je zichtbaar wilt maken.'
                  : 'First enter the name or graduation year you want to make visible.',
              errorGeneric:
                locale === 'nl' ? 'Dat lukte niet. Probeer het opnieuw.' : 'That did not work. Please try again.',
            }}
            onChanged={(viewer) => markInterest(preview.id, viewer)}
          />
          <a href={eventHref(preview)} className="btn btn-ghost arrow ev-preview-go">
            {locale === 'nl' ? 'Evenementpagina' : 'Event page'}
          </a>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <>
      {previewCard}
      <header className="page-head has-tools">
        <div>
          <div className="crumbs">
            {labels.crumbsHome} ·{' '}
            {selectedCategory ? (
              <>
                <a href={`${base}/kalender`} onClick={(event) => switchFilter(event, null)}>
                  {locale === 'nl' ? 'Kalender' : 'Calendar'}
                </a>{' '}
                ·{' '}
              </>
            ) : null}
            <span style={{ color: 'var(--ink)' }}>
              {selectedCategory ? categoryName(selectedCategory) : labels.crumbsHere}
            </span>
          </div>
          <h1>
            {selectedCategory ? (
              categoryName(selectedCategory)
            ) : (
              <>
                {locale === 'nl' ? 'Kalender ' : 'Calendar '}
                <em>{year}.</em>
              </>
            )}
          </h1>
          {selectedDescription ? (
            <div className="page-head-intro prose-vtk">
              <Markdown>{selectedDescription}</Markdown>
            </div>
          ) : null}
        </div>
        {/* Bladeren, weergave en abonneren staan in de donkere band zelf. Ze
            stonden eronder in een kaart op papier, en die kaart plus de kop
            samen duwden het raster zo ver naar beneden dat je bij het openen van
            de kalender nog geen anderhalve week zag. De filterchips blijven wel
            op papier: dat zijn er elf en die horen bij het raster, niet bij de
            titel. */}
        <div className="page-head-tools">
          <div className="nav-mo">
            <button type="button" onClick={() => shiftPeriod(-1)} aria-label={previousLabel}>
              ←
            </button>
            <button type="button" onClick={() => shiftPeriod(1)} aria-label={nextLabel}>
              →
            </button>
          </div>
          <div className="mo-label">
            {view === 'week'
              ? weekLabel
              : view === 'grid'
                ? monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1)
                : windowLabel}
            <small>
              {view === 'week'
                ? locale === 'nl'
                  ? 'Weekoverzicht · '
                  : 'Week overview · '
                : view === 'grid'
                  ? ''
                  : locale === 'nl'
                    ? 'Vier weken · '
                    : 'Four weeks · '}
              {periodCount}{' '}
              {periodCount === 1
                ? locale === 'nl'
                  ? 'evenement'
                  : 'event'
                : locale === 'nl'
                  ? 'evenementen'
                  : 'events'}
            </small>
          </div>
          <div className="view-switch" role="group" aria-label={locale === 'nl' ? 'Weergave' : 'View'}>
            <button
              type="button"
              className={view === 'grid' ? 'on' : ''}
              aria-pressed={view === 'grid'}
              onClick={() => setView('grid')}
            >
              {labels.views.grid}
            </button>
            <button
              type="button"
              className={view === 'agenda' ? 'on' : ''}
              aria-pressed={view === 'agenda'}
              onClick={() => setView('agenda')}
            >
              {labels.views.agenda}
            </button>
            <button
              type="button"
              className={view === 'week' ? 'on' : ''}
              aria-pressed={view === 'week'}
              onClick={() => setView('week')}
            >
              {labels.views.week}
            </button>
          </div>
          <CalendarSubscribe
            compact
            feedBaseUrl={feedBaseUrl}
            categories={categories}
            selectedSlug={filter === 'all' ? null : filter}
            locale={locale}
            labels={{ title: labels.subscribeTitle, sub: labels.subscribeSub }}
          />
        </div>
      </header>

      <div className="kal-wrap">
        <div className="toolbar">
          {/* De chips zijn links, geen knoppen: een categorie heeft een eigen
              pagina (/kalender/alumni) en die hoort in de adresbalk te staan.
              Zo is ze deelbaar, staat ze in de geschiedenis, en ziet iemand die
              op "Alumni" duwt meteen dát er een alumnikalender bestaat. De chip
              die al aanstaat wijst terug naar /kalender en zet zichzelf dus uit. */}
          <div className="toolbar-filters">
            <div className="filters">
              <a
                href={`${base}/kalender`}
                className={`filter${filter === 'all' ? ' on' : ''}`}
                aria-current={filter === 'all' ? 'page' : undefined}
                onClick={(event) => switchFilter(event, null)}
              >
                {labels.all}
              </a>
              {themeCategories.map((c) => (
                <a
                  key={c.slug}
                  href={filter === c.slug ? `${base}/kalender` : `${base}/kalender/${c.slug}`}
                  className={`filter category-filter${filter === c.slug ? ' on' : ''}`}
                  aria-current={filter === c.slug ? 'page' : undefined}
                  style={{ '--cat': c.colour } as React.CSSProperties}
                  onClick={(event) => switchFilter(event, c.slug)}
                >
                  {categoryName(c)}
                </a>
              ))}
            </div>
            {audienceOptions.length > 0 ? (
              <div className="audience-filters" aria-label={labels.audienceFilters}>
                <span>{labels.audienceFilters}</span>
                {audienceOptions.map((c) => (
                  <a
                    key={c.slug}
                    href={filter === c.slug ? `${base}/kalender` : `${base}/kalender/${c.slug}`}
                    className={`filter audience-filter${filter === c.slug ? ' on' : ''}`}
                    aria-current={filter === c.slug ? 'page' : undefined}
                    style={{ '--cat': c.colour } as React.CSSProperties}
                    onClick={(event) => switchFilter(event, c.slug)}
                  >
                    {categoryName(c)}
                  </a>
                ))}
                {/* Enkel op /kalender: op een categoriepagina is de doelgroep al
                    gekozen, en dan zou dit vinkje twee dingen tegelijk zeggen. */}
                {filter === 'all' ? (
                  <label className="audience-toggle" title={labels.onlyMyAudiencesHint}>
                    <input
                      type="checkbox"
                      checked={onlyMyAudiences}
                      onChange={(e) => setOnlyMyAudiences(e.target.checked)}
                    />
                    {labels.onlyMyAudiences}
                  </label>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        {showMonthGrid && (
          <div className="kal-main">
            <div className="cal">
              <div className="cal-header">
                {(locale === 'nl'
                  ? ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo']
                  : ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']
                ).map((d) => (
                  <div key={d}>{d}</div>
                ))}
              </div>
              {weekRows.map((weekCells) => {
                const spans = weekEventSpans(
                  monthEvents,
                  weekCells.map((cell) => cell.date)
                );
                const lanes = Math.max(0, ...spans.map((span) => span.lane + 1));
                return (
                  <div
                    className="cal-week"
                    key={dayKey(weekCells[0]!.date)}
                    style={{ '--span-lanes': lanes } as React.CSSProperties}
                  >
                    {weekCells.map(({ date, inMonth }) => {
                      const key = dayKey(date);
                      const list = eventsByDay.get(key) ?? [];
                      const isToday = isSameCalendarDay(date, new Date());
                      const singleDayEvents = list.filter((event) => !isMultiDayEvent(event));
                      const more = Math.max(0, singleDayEvents.length - 2);
                      const show = singleDayEvents.slice(0, 2);
                      const isSelected = key === selectedDayKey;
                      return (
                        <div
                          key={key}
                          className={`cal-cell${!inMonth ? ' out' : ''}${isToday ? ' today' : ''}${isSelected ? ' selected' : ''}`}
                        >
                          <div className="num">{String(date.getDate()).padStart(2, '0')}</div>
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
                                    style={cat ? ({ '--cat': cat.colour } as React.CSSProperties) : undefined}
                                  />
                                );
                              })}
                            </span>
                          ) : null}
                          <button
                            type="button"
                            className="cal-cell-tap"
                            aria-label={`${date.toLocaleDateString(locale === 'nl' ? 'nl-BE' : 'en-GB', {
                              weekday: 'long',
                              day: 'numeric',
                              month: 'long',
                            })}, ${list.length} ${
                              list.length === 1
                                ? locale === 'nl'
                                  ? 'evenement'
                                  : 'event'
                                : locale === 'nl'
                                  ? 'evenementen'
                                  : 'events'
                            }`}
                            aria-pressed={isSelected}
                            onClick={() => setSelectedKey(key)}
                          />
                          <div className="cal-span-space" aria-hidden="true" />
                          {show.map((e) => {
                            const cat = primaryCategory(e);
                            const audiences = audienceCategories(e);
                            return (
                              <a
                                key={e.id}
                                href={eventHref(e)}
                                className={`ev-pill${cat ? ' tinted' : ''}`}
                                style={cat ? ({ '--cat': cat.colour } as React.CSSProperties) : undefined}
                                onClick={(event) => openPreview(event, e)}
                              >
                                {audiences.map((a) => (
                                  <span
                                    key={a.slug}
                                    className="ev-audience"
                                    style={{ '--cat': a.colour } as React.CSSProperties}
                                  >
                                    {categoryName(a)}
                                  </span>
                                ))}
                                <b>{pickTitle(e)}</b>
                                <span>
                                  {eventTime(e)}
                                  {e.location ? ` · ${e.location}` : ''}
                                </span>
                                {interestLine(e) ? <span className="ev-going">{interestLine(e)}</span> : null}
                              </a>
                            );
                          })}
                          {more > 0 ? (
                            <div className="ev-pill more" title={list.map((e) => pickTitle(e)).join(', ')}>
                              +{more}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                    <div className="cal-spans">
                      {spans.map(({ event, start, end, lane, continuesBefore, continuesAfter }) => {
                        const cat = primaryCategory(event);
                        const dateLocale = locale === 'nl' ? 'nl-BE' : 'en-GB';
                        const range = `${new Date(event.start).toLocaleDateString(dateLocale)} – ${new Date(event.end).toLocaleDateString(dateLocale)}`;
                        return (
                          <a
                            key={event.id}
                            href={eventHref(event)}
                            className={`cal-span${continuesBefore ? ' continues-before' : ''}${continuesAfter ? ' continues-after' : ''}`}
                            style={
                              {
                                gridColumn: `${start + 1} / ${end + 2}`,
                                gridRow: lane + 1,
                                '--cat': cat?.colour,
                              } as React.CSSProperties
                            }
                            title={`${pickTitle(event)} · ${range}`}
                            aria-label={`${pickTitle(event)} · ${range}`}
                            onClick={(clicked) => openPreview(clicked, event)}
                          >
                            {continuesBefore ? '‹ ' : ''}
                            {pickTitle(event)}
                            {continuesAfter ? ' ›' : ''}
                          </a>
                        );
                      })}
                    </div>
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
                      const text = selectedDate.toLocaleDateString(locale === 'nl' ? 'nl-BE' : 'en-GB', {
                        weekday: 'long',
                        day: 'numeric',
                        month: 'long',
                      });
                      return text.charAt(0).toUpperCase() + text.slice(1);
                    })()
                  : ''}
              </h3>
              {selectedEvents.length === 0 ? (
                <p className="cal-day-empty">
                  {locale === 'nl' ? 'Niets gepland op deze dag.' : 'Nothing planned on this day.'}
                </p>
              ) : (
                <ul className="cal-day-list">
                  {selectedEvents.map((e) => {
                    const cat = primaryCategory(e);
                    return (
                      <li key={e.id}>
                        <a
                          href={eventHref(e)}
                          style={cat ? ({ '--cat': cat.colour } as React.CSSProperties) : undefined}
                          onClick={(event) => openPreview(event, e)}
                        >
                          <b>{pickTitle(e)}</b>
                          <span>
                            {eventTime(e)}
                            {e.location ? ` · ${e.location}` : ''}
                          </span>
                          {audienceCategories(e).map((a) => (
                            <span
                              key={a.slug}
                              className="cal-day-audience"
                              style={{ '--cat': a.colour } as React.CSSProperties}
                            >
                              {categoryName(a)}
                            </span>
                          ))}
                          {interestLine(e) ? <span className="ev-going">{interestLine(e)}</span> : null}
                        </a>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        )}

        {view === 'week' && (
          <div className="kal-main week-main">
            <div>
              <section className="week-cal" aria-label={locale === 'nl' ? 'Weekkalender' : 'Week calendar'}>
                {weekDays.map((date) => {
                  const events = eventsByDay.get(dayKey(date)) ?? [];
                  const today = isSameCalendarDay(date, new Date());
                  return (
                    <div key={dayKey(date)} className={`week-day${today ? ' today' : ''}`}>
                      <header>
                        <span>
                          {date.toLocaleDateString(locale === 'nl' ? 'nl-BE' : 'en-GB', {
                            weekday: 'short',
                          })}
                        </span>
                        <b>{date.getDate()}</b>
                        <small>
                          {date.toLocaleDateString(locale === 'nl' ? 'nl-BE' : 'en-GB', {
                            month: 'short',
                          })}
                        </small>
                      </header>
                      <div className="week-events">
                        {events.length === 0 ? (
                          <span className="week-empty">{locale === 'nl' ? 'Geen evenementen' : 'No events'}</span>
                        ) : (
                          events.map((event) => {
                            const cat = primaryCategory(event);
                            return (
                              <a
                                key={event.id}
                                href={eventHref(event)}
                                className="week-event"
                                style={cat ? ({ '--cat': cat.colour } as React.CSSProperties) : undefined}
                                onClick={(clicked) => openPreview(clicked, event)}
                              >
                                <span className="week-event-time">{eventTime(event)}</span>
                                <b>{pickTitle(event)}</b>
                                {event.location ? <small>{event.location}</small> : null}
                                {audienceCategories(event).map((audience) => (
                                  <span
                                    key={audience.slug}
                                    className="week-audience"
                                    style={{ '--cat': audience.colour } as React.CSSProperties}
                                  >
                                    {categoryName(audience)}
                                  </span>
                                ))}
                                {interestLine(event) ? <span className="ev-going">{interestLine(event)}</span> : null}
                              </a>
                            );
                          })
                        )}
                      </div>
                    </div>
                  );
                })}
              </section>
            </div>
          </div>
        )}

        {/* Agenda: onder het raster staat wat er de komende twee weken op je
            afkomt. Dat is het enige blok dat bewust niet met de pijlen meegaat. */}
        {view === 'agenda' && (
          <section className="agenda" style={{ marginTop: 48, gridTemplateColumns: '1fr' }}>
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
            </div>
          </section>
        )}

        {/* Raster: de maand als kaarten met de affiche erop, per week gebundeld. */}
        {view === 'grid' && (
          <section className="ev-grid-wrap">
            {shownGridWeeks.length === 0 ? (
              <p className="agenda-empty">{labels.emptyMonth}</p>
            ) : (
              shownGridWeeks.map((group) => (
                <div key={dayKey(group.monday)}>
                  <h2 className="ev-grid-week">
                    {labels.gridWeek}{' '}
                    {group.monday.toLocaleDateString(dateLocale, { day: 'numeric', month: 'long' })}
                  </h2>
                  <div className="ev-grid">{group.events.map(renderCard)}</div>
                </div>
              ))
            )}
            {pastWeekCount > 0 && !showPast ? (
              <button type="button" className="ev-grid-past" onClick={() => setShowPast(true)}>
                {labels.showPast}
                <span>{hiddenGridCount}</span>
              </button>
            ) : null}
          </section>
        )}

      </div>
    </>
  );
}
