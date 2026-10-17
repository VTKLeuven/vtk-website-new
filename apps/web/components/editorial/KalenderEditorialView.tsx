'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { getISOWeek } from 'date-fns';
import { markdownToPlainText } from '@/lib/markdown';
import { CalendarSubscribe } from '@/components/site/CalendarSubscribe';
import dynamic from 'next/dynamic';

// Via `next/dynamic`: de markdown-renderer (react-markdown, micromark en, via de
// fotogalerij, beide woordenboeken) is ~80 KB gzip. Statisch geïmporteerd kwam
// hij in een chunk die de bundler deelt met `Link` en dus op elke pagina laadde;
// zo komt hij enkel mee waar er echt markdown gerenderd wordt.
const Markdown = dynamic(() => import('@/components/ui/Markdown').then((m) => m.Markdown));
import { EventInterest } from '@/components/calendar/EventInterest';
import { EventStar, type EventStarLabels } from '@/components/calendar/EventStar';
import { CalendarPlusIcon, TicketIcon } from '@/components/ui/icons';
import Link from '@/components/ui/Link';
import { saveCalendarAudiencePreferenceAction } from '@/app/actions/calendarPreference';
import type { ViewerInterest } from '@/lib/calendar/interest';
import { momentsSummary } from '@/lib/calendar/moments';
import { MomentDays } from '@/components/calendar/MomentDays';
import {
  AGENDA_WEEKS,
  eventDayRange,
  eventLeadDate,
  eventOccursOnDay,
  isEventPast,
  isMultiDayEvent,
  momentOnDay,
  toMoments,
  weekEventSpans,
  monthGridCells,
  monthWeekDays,
  rollingWeeksGridCells,
  weekGridDays,
  dayRange,
  eventsRequestKey,
  isSameCalendarDay,
  startOfWeek,
  type GridDay,
} from './calendarGrid';
import { withSource } from '@/lib/ticketing/source';
import { CALENDAR_VIEW_COOKIE, type CalendarView } from '@/lib/calendar/viewCookie';
import { weekTimeline, type TimelineBlock } from '@/lib/calendar/weekTimeline';

/** Hoogte van één uur in de tijdlijn van de weekweergave, in pixels. */
const TIMELINE_HOUR_PX = 52;

/** Eén evenement zoals `/api/calendar/events` het teruggeeft; zie `lib/calendar/publicEvents.ts`. */
export type CalendarApiEvent = {
  id: string;
  slug: string;
  title: string;
  titleEn: string | null;
  start: string;
  end: string;
  allDay: boolean;
  url: string | null;
  location: string | null;
  /**
   * De losse momenten, wanneer het evenement er meer dan één heeft (een loopweek
   * met elke dag een loopje). Leeg = het evenement loopt van `start` tot `end`
   * door. `start` en `end` blijven in beide gevallen de envelop eromheen.
   */
  moments: Array<{ start: string; end: string; label: string | null }>;
  extendedProps: {
    groupCode: string;
    groupSlug: string;
    groupNameNl: string;
    groupNameEn: string;
    /** Ingevuld = die naam organiseert, niet de groep hierboven. */
    organiserName: string | null;
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
    /** De slug van de ticketpagina, enkel wanneer die online staat. */
    ticketSlug: string | null;
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

/** Het laatste moment van een kalenderdag: daarna is die dag voorbij. */
function endOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

/** Het aantal kalenderdagen van `from` tot `to`; afgerond, want een dag met een uurwissel duurt 23 of 25 uur. */
function daysBetween(from: Date, to: Date): number {
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const b = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((+b - +a) / 86_400_000);
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
  initialEvents,
  initialView = 'grid',
}: {
  locale: 'nl' | 'en';
  labels: {
    crumbsHome: string;
    crumbsHere: string;
    subscribeTitle: string;
    subscribeSub: string;
    all: string;
    audienceFilters: string;
    onlyMyAudiences: string;
    onlyMyAudiencesHint: string;
    emptyMonth: string;
    views: { grid: string; agenda: string; week: string };
    gridWeek: string;
    showPast: string;
    hidePast?: string;
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
  /**
   * De evenementen van de eerste weergave, al op de server opgehaald, met de
   * sleutel van de ophaling waarvoor ze gelden (`eventsRequestKey`). Zonder dit
   * stond er eerst "Geen evenementen deze maand" en sprong de pagina open zodra
   * de fetch binnenkwam. Zie `loadOpeningCalendarEvents`.
   */
  initialEvents?: { key: string; events: CalendarApiEvent[] };
  /**
   * De weergave waarin de kalender opent: de laatst gekozen, uit een cookie
   * (`lib/calendar/viewCookie.ts`). `initialEvents` is voor die weergave
   * opgehaald.
   */
  initialView?: CalendarView;
}) {
  const base = locale === 'nl' ? '' : '/en';
  const pathname = usePathname();
  // Eén vast "nu" zolang deze weergave openstaat. Het bepaalt welk moment van
  // een reeks het eerstvolgende is, en dus waar een kaart staat en welke dagen
  // haar strip toont; een nieuwe `Date` bij elke render zou die indeling telkens
  // opnieuw laten berekenen zonder dat er iets veranderd is.
  const now = useMemo(() => new Date(), []);
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
  // weekweergave blijven ernaast staan voor wie op een datum zoekt, en wie er
  // een koos, krijgt die de volgende keer meteen terug.
  const [view, setView] = useState<CalendarView>(initialView);
  // Binnen de huidige maand begint het raster bij deze week. Deze knop zet de
  // weken die al voorbij zijn er alsnog bij.
  const [showPast, setShowPast] = useState(false);
  // Alles is standaard zichtbaar. Personalisatie is een bewuste keuze en houdt
  // algemene events plus de doelgroepevents die bij het profiel horen over; de
  // beginstand komt uit de accountvoorkeur van het lid.
  const [onlyMyAudiences, setOnlyMyAudiences] = useState(defaultOnlyMyAudiences);
  // Het vinkje is dezelfde voorkeur als in het profiel en wordt dus bewaard,
  // zodat /kalender de volgende keer zo opent. Enkel met een account: zonder
  // profiel valt er niets af te stemmen of te onthouden. Lukt het bewaren niet,
  // dan werkt de filter wel in deze weergave; dat is geen reden om hem terug te
  // draaien.
  const changeOnlyMyAudiences = useCallback(
    (next: boolean) => {
      setOnlyMyAudiences(next);
      if (!signedIn) return;
      saveCalendarAudiencePreferenceAction(next).catch((error) => {
        console.error('Kalendervoorkeur bewaren mislukt', error);
      });
    },
    [signedIn]
  );
  // De dag die in de agenda onder zijn week openklapt, met de kaarten van het
  // raster erin. Geen paneel naast het raster: dat nam de breedte af van de
  // dagcellen, en daar wringt het net.
  const [openDayKey, setOpenDayKey] = useState<string | null>(null);
  const openDayRef = useRef<HTMLElement>(null);
  const chooseView = useCallback((next: CalendarView) => {
    setView(next);
    setOpenDayKey(null);
    document.cookie = `${CALENDAR_VIEW_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
  }, []);
  const [monthEvents, setMonthEvents] = useState<CalendarApiEvent[]>(initialEvents?.events ?? []);
  // Zolang dit staat, zijn `monthEvents` nog die van de server. Het valt weg
  // zodra de kalender iets anders ophaalt; terugkeren naar dezelfde weergave
  // haalt dan gewoon opnieuw op.
  const prefetchedKey = useRef(initialEvents?.key ?? null);
  // Het evenement waarvan de voorvertoning openstaat. Een klik in het raster
  // opent eerst dit kaartje: in een cel past hoogstens een afgekapte titel, en
  // meteen doorsturen naar een volledige pagina is een dure manier om te
  // ontdekken dat je het verkeerde evenement aanklikte.
  const [preview, setPreview] = useState<CalendarApiEvent | null>(null);

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
      return (await res.json()) as CalendarApiEvent[];
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
    const { start, end } = dayRange(rangeDays);
    // De server gaf de eerste weergave al mee. Rekent de browser een ander
    // bereik uit (een bezoeker in een andere tijdzone), dan haalt hij alsnog op.
    if (prefetchedKey.current === eventsRequestKey({ start, end }, filter, onlyMyAudiences)) return;
    prefetchedKey.current = null;
    let cancelled = false;
    void (async () => {
      const data = await fetchForRange(start, end);
      if (!cancelled) setMonthEvents(data);
    })();
    return () => {
      cancelled = true;
    };
  }, [rangeDays, filter, onlyMyAudiences, fetchForRange]);

  useEffect(() => {
    if (!preview) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setPreview(null);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [preview]);

  // Een dag die openklapt in de onderste weekrij, valt anders net onder de
  // vouw; "nearest" schuift enkel wanneer dat nodig is. Escape klapt hem dicht,
  // tenzij er een voorvertoning openstaat: die sluit eerst.
  useEffect(() => {
    if (openDayKey) openDayRef.current?.scrollIntoView({ block: 'nearest' });
  }, [openDayKey]);

  useEffect(() => {
    if (!openDayKey) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape' && !preview) setOpenDayKey(null);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openDayKey, preview]);

  const eventsByDay = useMemo(() => {
    const m = new Map<string, CalendarApiEvent[]>();
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
   * De evenementen van de weken van deze maand, chronologisch. Het raster deelt
   * ze per week op, dus een week die over de maandgrens loopt, staat er
   * volledig in: onder "Week van 28 september" horen ook 1 en 2 oktober. De
   * zesde rij van het maandraster, die helemaal in de volgende maand ligt, valt
   * wel weg. Zie `monthWeekDays`.
   */
  const monthWeeks = useMemo(() => monthWeekDays(year, month), [year, month]);
  const monthOnlyEvents = useMemo(
    () =>
      monthEvents
        .filter((e) => monthWeeks.some((date) => eventOccursOnDay(e, date)))
        // Op de datum die de kaart ook draagt, en niet op de start van de
        // envelop: een reeks die vorige week begon, hoort tussen de dagen die
        // nog komen te staan. Zie `eventLeadDate`.
        .sort((a, b) => +eventLeadDate(a, now) - +eventLeadDate(b, now)),
    [monthEvents, monthWeeks, now]
  );

  /**
   * De evenementen van het raster, gebundeld per week.
   *
   * Gegroepeerd op de maandag van **de dag die op de kaart staat**, en niet op
   * elke dag waarop een evenement valt: een meerdaags evenement zou anders in
   * twee weekblokken staan en twee keer geteld worden.
   *
   * Die dag is bij een reeks losse momenten de eerstvolgende keer dat er iets
   * is (`eventLeadDate`), niet de start van de envelop. Anders blijft een
   * loopweek die vrijdag begon in de week van die vrijdag hangen, en verdwijnt
   * ze op maandag achter "toon voorbije weken" terwijl er nog vier loopjes
   * komen.
   *
   * Binnen de huidige maand vallen de evenementen weg die al voorbij zijn. Het
   * raster is de eerste weergave die iemand ziet, en dan is "wat komt er" de
   * vraag, niet "wat heb ik gemist"; de knop erbij haalt ze alsnog terug. In een
   * maand die volledig achter ons ligt gebeurt dat niet, want dan blijft er niets
   * over.
   */
  const isPastMonth = useMemo(() => {
    // Het einde van de laatste week, niet van de maand: op 1 oktober komt er in
    // de laatste week van september nog iets.
    const lastDay = monthWeeks.at(-1)!;
    const monthEnd = new Date(lastDay.getFullYear(), lastDay.getMonth(), lastDay.getDate(), 23, 59, 59, 999);
    return monthEnd < now;
  }, [monthWeeks, now]);

  const pastEventsInMonth = useMemo(() => {
    return isPastMonth ? [] : monthOnlyEvents.filter((event) => isEventPast(event, now));
  }, [isPastMonth, monthOnlyEvents, now]);

  const upcomingEventsInMonth = useMemo(() => {
    return isPastMonth ? monthOnlyEvents : monthOnlyEvents.filter((event) => !isEventPast(event, now));
  }, [isPastMonth, monthOnlyEvents, now]);

  const eventsForGrid = useMemo(() => {
    return showPast || isPastMonth ? monthOnlyEvents : upcomingEventsInMonth;
  }, [showPast, isPastMonth, monthOnlyEvents, upcomingEventsInMonth]);

  const gridWeeks = useMemo(() => {
    const groups = new Map<string, { monday: Date; events: CalendarApiEvent[] }>();
    for (const event of eventsForGrid) {
      const monday = startOfWeek(eventLeadDate(event, now));
      const key = dayKey(monday);
      const group = groups.get(key);
      if (group) group.events.push(event);
      else groups.set(key, { monday, events: [event] });
    }
    return [...groups.values()].sort((a, b) => +a.monday - +b.monday);
  }, [eventsForGrid, now]);

  const shownGridWeeks = gridWeeks;
  const shownGridCount = eventsForGrid.length;
  const hiddenGridCount = pastEventsInMonth.length;

  /**
   * De dag die openstaat, enkel zolang hij in het raster staat. Afgeleid en niet
   * in een effect bijgehouden: wie verder bladert, laat de dag vanzelf achter.
   */
  const openDate = useMemo(
    () => (openDayKey ? (visibleCells.find((c) => dayKey(c.date) === openDayKey)?.date ?? null) : null),
    [visibleCells, openDayKey]
  );

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

  function pickTitle(e: CalendarApiEvent) {
    return locale === 'nl' ? e.title : e.titleEn || e.title;
  }

  function pickDesc(e: CalendarApiEvent) {
    const d = locale === 'nl' ? e.extendedProps.descriptionNl : e.extendedProps.descriptionEn;
    return markdownToPlainText(d ?? '');
  }

  /**
   * Van wie het evenement is, zoals de bezoeker het te zien krijgt: de
   * organisator wanneer die ingevuld is, anders de beherende groep. Zie
   * lib/calendar/organiser.ts; hier in de browser zonder die helper, want die
   * leest een Prisma-rij.
   */
  function pickGroup(e: CalendarApiEvent) {
    const organiser = e.extendedProps.organiserName?.trim();
    if (organiser) return organiser;
    return locale === 'nl' ? e.extendedProps.groupNameNl : e.extendedProps.groupNameEn;
  }

  /** De eerste categorie bepaalt de kleur van de pil en het label in de agendalijst. */
  function primaryCategory(e: CalendarApiEvent) {
    return e.extendedProps.categories[0] ?? null;
  }

  /**
   * De doelgroepen van een event. Die moeten altijd zichtbaar zijn: een event dat
   * voor eerstejaars of internationals bedoeld is, mag niet als een gewoon
   * evenement in het raster staan waar iemand anders zich dan op verkijkt.
   */
  function audienceCategories(e: CalendarApiEvent) {
    return e.extendedProps.categories.filter((c) => c.audience !== null);
  }

  function clock(date: Date) {
    return date.toLocaleTimeString(locale === 'nl' ? 'nl-BE' : 'en-GB', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  /**
   * Het uur van een evenement, en bij een evenement met losse momenten het uur
   * dat op déze dag telt.
   *
   * Zonder dag (een kaart, een lijstrij) wordt het de samenvatting van de
   * momenten: zeven keer "18:00" op één kaart zegt minder dan "telkens 18:00".
   */
  function eventTime(e: CalendarApiEvent, day?: Date | null) {
    if (e.allDay) return locale === 'nl' ? 'Hele dag' : 'All day';
    if (e.moments.length > 0) {
      const moment = day ? momentOnDay(e, day) : null;
      if (moment) return clock(moment.start);
      return momentsSummary(toMoments(e), locale) ?? clock(new Date(e.start));
    }
    return clock(new Date(e.start));
  }

  /**
   * De dag waarop een kaart of lijstrij staat: de eerstvolgende keer dat er iets
   * is, en niet de dag waarop een reeks momenten ooit begon.
   */
  function leadDate(e: CalendarApiEvent): Date {
    return eventLeadDate(e, now);
  }

  /**
   * De regel "Wanneer" in het venster van één evenement. Een reeks momenten
   * leest als een periode met het gedeelde uur erachter; de dagen ertussen
   * waarop niets staat, zijn daarbij de kalender zelf die het toont.
   */
  function whenLine(e: CalendarApiEvent): string {
    const dateLocale = locale === 'nl' ? 'nl-BE' : 'en-GB';
    const dayText = (date: Date) =>
      date.toLocaleDateString(dateLocale, { weekday: 'long', day: 'numeric', month: 'long' });
    const moments = toMoments(e);
    if (moments.length > 1) {
      const span = `${dayText(moments[0]!.start)} ${locale === 'nl' ? 't.e.m.' : 'to'} ${dayText(
        moments[moments.length - 1]!.start
      )}`;
      return `${span} · ${eventTime(e)}`;
    }
    return `${dayText(new Date(e.start))} · ${eventTime(e)}`;
  }

  /**
   * Bladeren doet wat de weergave toont: de lijst gaat per maand, de week per
   * week, en het raster schuift zijn venster van vier weken op. Dat laatste
   * verving een sprong naar het maandraster: die maakte het raster meteen weer
   * zes rijen hoog, precies wat het venster moest oplossen.
   */
  function shiftPeriod(delta: number) {
    setShowPast(false);
    setOpenDayKey(null);
    if (view === 'grid') {
      setCursor(new Date(year, month + delta, 1));
      return;
    }
    const next = new Date(cursor);
    next.setDate(next.getDate() + delta * (view === 'week' ? 7 : AGENDA_WEEKS * 7));
    setCursor(next);
  }

  // Met `via`, zodat een ticket dat via de eventpagina gekocht wordt voor de
  // kalender telt (zie lib/ticketing/source.ts).
  function eventHref(e: CalendarApiEvent) {
    return withSource(`${base}/kalender/${e.slug}`, 'kalender');
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
  function openPreview(event: React.MouseEvent, item: CalendarApiEvent) {
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
    const apply = (list: CalendarApiEvent[]) =>
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
  function interestLine(e: CalendarApiEvent): string | null {
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
  function starChanged(e: CalendarApiEvent, interested: boolean) {
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
   * Eén evenement als kaart in het raster: de affiche bovenaan, de datum als
   * vierkante pin die rechtsboven over de onderrand van de foto hangt, links
   * daarvan het thema, daaronder de titel met de gele streep, en onderaan het
   * uur, de plaats en de twee handelingen.
   *
   * De datum stond eerst als grijze regel boven de titel, in dezelfde grootte
   * en kleur als de plaats eronder, terwijl de datum net is waarop je een
   * kalender afscant. Als pin is ze het eerste wat je ziet. Daardoor kunnen ook
   * het thema en de doelgroep van de foto af: die stonden als pillen over een
   * affiche waar vaak precies daar de titel van het evenement staat.
   *
   * Net als bij de lijstrij is dit een `article` en geen `a`: de ster is een
   * knop, en een knop in een anker is ongeldige HTML. De titel is de link en
   * spant zich over de hele kaart (`.ev-card-link::after`); de handelingen
   * liggen erboven.
   *
   * De teller staat naast de ster onderaan, en niet op een eigen regel: die
   * regel viel weg zodra niemand had aangeduid dat hij kwam, en de kaarten in
   * een rij stonden dan ongelijk. De ster en de agendaknop staan er altijd, dus
   * de rij houdt haar hoogte.
   *
   * Met `day` staat de kaart op die dag, zoals in de opengeklapte dag van de
   * agenda: de pin en het uur zijn dan die van die dag, ook bij een reeks die
   * pas later weer iets heeft.
   */
  function renderCard(e: CalendarApiEvent, day?: Date) {
    const cat = e.extendedProps.categories.find((c) => c.audience === null) ?? null;
    const going = interestLine(e);
    const title = pickTitle(e);
    const start = day ?? leadDate(e);
    const isPast = isEventPast(e, now);
    const addToCalendar = locale === 'nl' ? 'Zet in mijn agenda' : 'Add to my calendar';
    const buyTickets = locale === 'nl' ? 'Tickets kopen' : 'Buy tickets';
    return (
      <article key={e.id} className={`ev-card${isPast ? ' is-past' : ''}`}>
        <div className="ev-card-shot">
          <Image
            src={e.extendedProps.image}
            alt=""
            fill
            sizes="(max-width: 620px) 100vw, (max-width: 1000px) 50vw, 380px"
            style={e.extendedProps.imagePosition ? { objectPosition: e.extendedProps.imagePosition } : undefined}
          />
          {/* Weekdag boven het getal, maand eronder: zo staat een datum op een
              kalenderblad, en zo blijft de pin vierkant. Ze hangt rechtsonder
              aan de foto en steekt er onderuit, zodat het tekstblok bovenaan
              begint en het klikvlak van de titel de hele kaart houdt. */}
          <span className="ev-card-pin">
            <i>{start.toLocaleDateString(dateLocale, { weekday: 'short' })}</i>
            <b>{start.getDate()}</b>
            <i>{start.toLocaleDateString(dateLocale, { month: 'short' })}</i>
          </span>
        </div>
        <div className="ev-card-body">
          <div className="ev-card-tags">
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
          <h3 className="ev-card-title">
            <a href={eventHref(e)} className="ev-card-link">
              {title}
            </a>
          </h3>
          {/* De dagen die de reeks nog te gaan heeft. "telkens 20:00" hieronder
              zegt hoe laat; dit zegt wanneer. Zie components/calendar/MomentDays. */}
          <MomentDays moments={toMoments(e)} now={now} locale={locale} />
          <div className="ev-card-foot">
            <span className="ev-card-when">
              {eventTime(e, day)}
              {e.location ? ` · ${e.location}` : ''}
            </span>
            <span className="ev-card-actions">
              {going ? <span className="ev-going">{going}</span> : null}
              <EventStar
                key={`${e.id}:${e.extendedProps.interested}`}
                eventId={e.id}
                title={title}
                interested={e.extendedProps.interested}
                signedIn={signedIn}
                loginHref={`${base}/inloggen?next=${encodeURIComponent(eventHref(e))}`}
                labels={starLabels}
                className="ev-card-action"
                onChanged={(interested) => starChanged(e, interested)}
              />
              {/* Gewone link naar de .ics, zonder `download`: iOS zet een
                  gedownload bestand in de Bestanden-app, terwijl het zo meteen
                  als evenement opent. Zie de route. */}
              <a
                href={`/api/calendar/event/${e.id}${locale === 'en' ? '?lang=en' : ''}`}
                className="ev-card-action"
                title={addToCalendar}
                aria-label={`${addToCalendar}: ${title}`}
              >
                <CalendarPlusIcon />
              </a>
              {e.extendedProps.ticketSlug ? (
                <Link
                  href={withSource(`${base}/tickets/${e.extendedProps.ticketSlug}`, "kalender")}
                  className="ev-card-action"
                  title={buyTickets}
                  aria-label={`${buyTickets}: ${title}`}
                >
                  <TicketIcon />
                </Link>
              ) : null}
            </span>
          </div>
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
  /** Het uur waarop een evenement op deze dag begint; wat de hele dag duurt, eerst. */
  function startOnDay(e: CalendarApiEvent, day: Date): number {
    if (e.allDay) return Number.NEGATIVE_INFINITY;
    return +(momentOnDay(e, day)?.start ?? new Date(e.start));
  }

  /** "Woensdag 14 oktober": de dag met een hoofdletter, de maand klein, zoals het hoort. */
  function longDay(date: Date): string {
    const text = date.toLocaleDateString(dateLocale, { weekday: 'long', day: 'numeric', month: 'long' });
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  /**
   * Een klik op een evenement in een dagcel klapt die dag open, met het
   * evenement als kaart tussen de rest van de dag. De `href` blijft staan voor
   * middenklik en "openen in nieuw tabblad", zoals bij `openPreview`.
   */
  function openDayFromEvent(event: React.MouseEvent, key: string) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
      return;
    }
    event.preventDefault();
    setOpenDayKey(key);
  }

  /**
   * De agenda: vier weken als maandraster, met de evenementen als regel per dag
   * en de dag die je aanklikt eronder opengeklapt met de kaarten van het raster.
   *
   * Het raster neemt de volle breedte, zonder paneel ernaast: een dagcel was
   * zo smal dat het uur en de titel naast elkaar in de volgende cel liepen. Het
   * weekend is smaller, want daar staat bij de kring zelden iets; het uur staat
   * in een eigen kolom en de titel loopt eronder door in plaats van af te
   * kappen. Zie docs/design-decisions.md.
   */
  function renderMonth() {
    const weekdays =
      locale === 'nl' ? ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo'] : ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
    return (
      <>
        <div className="kal-month">
          <div className="kal-month-cols kal-month-head" aria-hidden="true">
            {weekdays.map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
          {weekRows.map((weekCells) => {
            const dates = weekCells.map((cell) => cell.date);
            const spans = weekEventSpans(monthEvents, dates);
            const lanes = Math.max(0, ...spans.map((span) => span.lane + 1));
            const eventsRow = lanes + 2;
            const hasOpenDay = openDate !== null && dates.some((date) => isSameCalendarDay(date, openDate));
            return (
              <div className="kal-month-week" key={dayKey(dates[0]!)}>
                <div
                  className="kal-month-cols kal-month-row"
                  style={
                    lanes > 0
                      ? ({
                          '--kal-month-lanes': `repeat(${lanes}, 28px)`,
                          '--kal-month-lanes-sm': `repeat(${lanes}, 7px)`,
                        } as React.CSSProperties)
                      : undefined
                  }
                >
                  {dates.map((date, index) => {
                    const key = dayKey(date);
                    const count = eventsByDay.get(key)?.length ?? 0;
                    const isOpen = openDayKey === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        className={`kal-month-day${isSameCalendarDay(date, now) ? ' is-today' : ''}${
                          isOpen ? ' is-open' : ''
                        }`}
                        style={{ gridColumn: index + 1 }}
                        aria-expanded={isOpen}
                        aria-controls={isOpen ? 'kal-month-open-day' : undefined}
                        aria-label={`${longDay(date)}, ${count} ${
                          count === 1 ? (locale === 'nl' ? 'evenement' : 'event') : locale === 'nl' ? 'evenementen' : 'events'
                        }`}
                        onClick={() => setOpenDayKey(isOpen ? null : key)}
                      />
                    );
                  })}
                  {dates.map((date, index) => (
                    <span
                      key={dayKey(date)}
                      className={`kal-month-num${endOfDay(date) < now ? ' is-past' : ''}${
                        isSameCalendarDay(date, now) ? ' is-today' : ''
                      }${openDayKey === dayKey(date) ? ' is-open' : ''}`}
                      style={{ gridColumn: index + 1 }}
                      aria-hidden="true"
                    >
                      {date.getDate()}
                    </span>
                  ))}
                  <span className="kal-month-wk" aria-hidden="true">
                    wk {getISOWeek(dates[0]!)}
                  </span>
                  {spans.map(({ event, start, end, lane, continuesBefore, continuesAfter }) => {
                    const cat = primaryCategory(event);
                    const first = new Date(event.start);
                    const last = eventDayRange(event).last;
                    const short = (date: Date) =>
                      date.toLocaleDateString(dateLocale, { weekday: 'short', day: 'numeric' });
                    const range = `${short(first)} ${locale === 'nl' ? 'tot' : 'to'} ${short(last)}`;
                    return (
                      <a
                        key={event.id}
                        href={eventHref(event)}
                        className={`kal-month-span${continuesBefore ? ' continues-before' : ''}${
                          continuesAfter ? ' continues-after' : ''
                        }${isEventPast(event, now) ? ' is-past' : ''}`}
                        style={
                          {
                            gridColumn: `${start + 1} / ${end + 2}`,
                            gridRow: lane + 2,
                            '--cat': cat?.colour,
                          } as React.CSSProperties
                        }
                        title={`${pickTitle(event)} · ${range}`}
                        aria-label={`${pickTitle(event)} · ${range}`}
                        onClick={(clicked) => openPreview(clicked, event)}
                      >
                        <span className="kal-month-span-title">
                          {continuesBefore ? '‹ ' : ''}
                          {pickTitle(event)}
                          {continuesAfter ? ' ›' : ''}
                        </span>
                        {end > start ? <small>{range}</small> : null}
                      </a>
                    );
                  })}
                  {dates.map((date, index) => {
                    const key = dayKey(date);
                    const list = (eventsByDay.get(key) ?? [])
                      .filter((event) => !isMultiDayEvent(event))
                      .sort((a, b) => startOnDay(a, date) - startOnDay(b, date));
                    const past = endOfDay(date) < now;
                    return (
                      <div
                        key={key}
                        className="kal-month-items"
                        style={{ gridColumn: index + 1, gridRow: eventsRow }}
                      >
                        {list.map((e) => {
                          const cat = primaryCategory(e);
                          return (
                            <a
                              key={e.id}
                              href={eventHref(e)}
                              className={`kal-month-ev${past ? ' is-past' : ''}`}
                              style={cat ? ({ '--cat': cat.colour } as React.CSSProperties) : undefined}
                              onClick={(clicked) => openDayFromEvent(clicked, key)}
                            >
                              <time>{eventTime(e, date)}</time>
                              <b>{pickTitle(e)}</b>
                              {audienceCategories(e).map((a) => (
                                <span
                                  key={a.slug}
                                  className="kal-month-aud"
                                  style={{ '--cat': a.colour } as React.CSSProperties}
                                >
                                  {categoryName(a)}
                                </span>
                              ))}
                            </a>
                          );
                        })}
                        {/* Enkel op een telefoon: daar past er geen regel in een
                            cel, dus staat er een stip per evenement en lees je de
                            dag in wat eronder openklapt. */}
                        {(eventsByDay.get(key)?.length ?? 0) > 0 ? (
                          <span className="kal-month-dots" aria-hidden="true">
                            {(eventsByDay.get(key) ?? []).slice(0, 3).map((e) => (
                              <span
                                key={e.id}
                                style={
                                  primaryCategory(e)
                                    ? ({ '--cat': primaryCategory(e)!.colour } as React.CSSProperties)
                                    : undefined
                                }
                              />
                            ))}
                          </span>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
                {hasOpenDay ? renderOpenDay(openDate) : null}
              </div>
            );
          })}
        </div>
        <p className="kal-month-hint">
          {locale === 'nl' ? 'Tik op een dag om te zien wat er die dag is.' : 'Tap a day to see what is on.'}
        </p>
      </>
    );
  }

  /**
   * De opengeklapte dag onder zijn week: wat die dag doorloopt als korte regel,
   * en de evenementen als de kaarten van het raster, met ster, agenda en
   * tickets. Zo staat alles wat een cel niet kwijt kan, zonder een paneel naast
   * het raster dat de dagcellen smaller maakt.
   */
  function renderOpenDay(date: Date) {
    const list = eventsByDay.get(dayKey(date)) ?? [];
    const runs = list.filter(isMultiDayEvent);
    const items = list
      .filter((event) => !isMultiDayEvent(event))
      .sort((a, b) => startOnDay(a, date) - startOnDay(b, date));
    const isToday = isSameCalendarDay(date, now);
    const isPast = endOfDay(date) < now;
    const nl = locale === 'nl';
    return (
      <section id="kal-month-open-day" ref={openDayRef} className="kal-month-open" aria-label={longDay(date)}>
        <div className="kal-month-open-head">
          <h3>{longDay(date)}</h3>
          {isToday ? (
            <span className="kal-month-tag">{nl ? 'Vandaag' : 'Today'}</span>
          ) : isPast ? (
            <span className="kal-month-tag is-past">{nl ? 'Voorbij' : 'Past'}</span>
          ) : null}
          {items.length > 0 ? (
            <span className="kal-month-open-count">
              {items.length} {items.length === 1 ? (nl ? 'evenement' : 'event') : nl ? 'evenementen' : 'events'}
            </span>
          ) : null}
          <button type="button" className="kal-month-close" onClick={() => setOpenDayKey(null)}>
            {nl ? 'Dichtklappen' : 'Collapse'}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m6 15 6-6 6 6" />
            </svg>
          </button>
        </div>
        {runs.length > 0 ? (
          <div className="kal-month-runs">
            <span>{items.length > 0 ? (nl ? 'Loopt ook' : 'Also running') : nl ? 'Loopt die dag' : 'Running that day'}</span>
            {runs.map((e) => {
              const { first, last } = eventDayRange(e);
              const dayOf = daysBetween(first, date) + 1;
              const total = daysBetween(first, last) + 1;
              return (
                <a
                  key={e.id}
                  href={eventHref(e)}
                  className="kal-month-run"
                  style={primaryCategory(e) ? ({ '--cat': primaryCategory(e)!.colour } as React.CSSProperties) : undefined}
                  onClick={(clicked) => openPreview(clicked, e)}
                >
                  {pickTitle(e)}
                  <small>{nl ? `dag ${dayOf} van ${total}` : `day ${dayOf} of ${total}`}</small>
                </a>
              );
            })}
          </div>
        ) : null}
        {items.length > 0 ? (
          <div className="ev-grid">{items.map((e) => renderCard(e, date))}</div>
        ) : runs.length === 0 ? (
          <p className="kal-month-none">{nl ? 'Niets gepland op deze dag.' : 'Nothing planned on this day.'}</p>
        ) : null}
      </section>
    );
  }

  /** Eén evenement als blok in de tijdlijn, op zijn uur en zo lang als het duurt. */
  function renderTimelineBlock(block: TimelineBlock<CalendarApiEvent>, timelineFrom: number, timelineTo: number) {
    const e = block.event;
    const cat = primaryCategory(e);
    const title = pickTitle(e);
    const top = (block.from - timelineFrom) * TIMELINE_HOUR_PX + 1;
    const height = Math.max(26, (Math.min(block.to, timelineTo) - block.from) * TIMELINE_HOUR_PX - 3);
    const time = `${clock(block.start)} ${locale === 'nl' ? 'tot' : 'to'} ${clock(block.end)}`;
    return (
      <a
        key={`${e.id}-${block.start.toISOString()}`}
        href={eventHref(e)}
        className={`kal-tl-block${block.end < now ? ' is-past' : ''}${e.extendedProps.interested ? ' is-mine' : ''}${
          block.runsOn ? ' runs-on' : ''
        }`}
        style={
          {
            top,
            height,
            zIndex: 2 + block.lane,
            '--lane': block.lane,
            '--cat': cat?.colour,
          } as React.CSSProperties
        }
        title={`${title} · ${time}${e.location ? ` · ${e.location}` : ''}`}
        onClick={(clicked) => openPreview(clicked, e)}
      >
        <span className="kal-tl-time">{time}</span>
        <b>{title}</b>
        {height >= 74 && e.location ? <small>{e.location}</small> : null}
        {height >= 96
          ? audienceCategories(e).map((a) => (
              <span key={a.slug} className="kal-tl-aud" style={{ '--cat': a.colour } as React.CSSProperties}>
                {categoryName(a)}
              </span>
            ))
          : null}
      </a>
    );
  }

  /**
   * De week als tijdlijn: een uuras met de evenementen als blokken op hun uur,
   * wat de hele dag duurt of over dagen doorloopt als één balk bovenaan, en een
   * gele nu-lijn zoals bij de openingsuren. De rekenregels (welk venster, wat
   * een balk is, welk blok opzij schuift) staan in lib/calendar/weekTimeline.ts.
   */
  function renderWeek() {
    const timeline = weekTimeline(weekEvents, weekDays, now);
    const nl = locale === 'nl';
    const todayIndex = weekDays.findIndex((day) => isSameCalendarDay(day, now));
    // Een lege weekenddag krijgt minder breedte; de weekdagen hebben ze nodig.
    const columns = weekDays.map((_, index) =>
      index >= 5 &&
      timeline.days[index]!.length === 0 &&
      !timeline.bars.some((bar) => bar.start <= index && bar.end >= index)
        ? 'minmax(0, 0.66fr)'
        : 'minmax(0, 1fr)'
    );
    const hours = Array.from({ length: timeline.to - timeline.from + 1 }, (_, index) => timeline.from + index);
    const empty = timeline.bars.length === 0 && timeline.days.every((blocks) => blocks.length === 0);
    const anyMine = timeline.days.some((blocks) => blocks.some((block) => block.event.extendedProps.interested));
    const anyRunsOn = timeline.days.some((blocks) => blocks.some((block) => block.runsOn));
    return (
      <>
        <div className="kal-tl-scroll">
          <div
            className="kal-tl"
            style={
              {
                '--kal-tl-cols': `58px ${columns.join(' ')}`,
                '--kal-tl-hour': `${TIMELINE_HOUR_PX}px`,
              } as React.CSSProperties
            }
          >
            <div className="kal-tl-cols kal-tl-head">
              <span className="kal-tl-corner" />
              {weekDays.map((day, index) => (
                <div
                  key={dayKey(day)}
                  className={`kal-tl-day${index === todayIndex ? ' is-today' : ''}${endOfDay(day) < now ? ' is-past' : ''}`}
                >
                  <span>{day.toLocaleDateString(dateLocale, { weekday: 'short' })}</span>
                  <b>{day.getDate()}</b>
                  {index === todayIndex ? <em>{nl ? 'Vandaag' : 'Today'}</em> : null}
                </div>
              ))}
            </div>

            {timeline.bars.length > 0 ? (
              <div
                className="kal-tl-cols kal-tl-allday"
                style={{ gridTemplateRows: `repeat(${timeline.barLanes}, 32px)` }}
              >
                <span className="kal-tl-allday-label">{nl ? 'hele dag' : 'all day'}</span>
                {weekDays.map((day, index) => (
                  <span
                    key={dayKey(day)}
                    className={`kal-tl-allday-col${index === todayIndex ? ' is-today' : ''}`}
                    style={{ gridColumn: index + 2 }}
                  />
                ))}
                {timeline.bars.map(({ event, start, end, lane, continuesBefore, continuesAfter }) => {
                  const cat = primaryCategory(event);
                  const { first, last } = eventDayRange(event);
                  const short = (date: Date) =>
                    date.toLocaleDateString(dateLocale, { weekday: 'short', day: 'numeric' });
                  const range = event.allDay
                    ? isSameCalendarDay(first, last)
                      ? nl
                        ? 'hele dag'
                        : 'all day'
                      : `${short(first)} ${nl ? 'tot' : 'to'} ${short(last)}`
                    : `${short(new Date(event.start))} ${clock(new Date(event.start))} ${nl ? 'tot' : 'to'} ${short(
                        new Date(event.end)
                      )} ${clock(new Date(event.end))}`;
                  return (
                    <a
                      key={event.id}
                      href={eventHref(event)}
                      className={`kal-tl-bar${continuesBefore ? ' continues-before' : ''}${
                        continuesAfter ? ' continues-after' : ''
                      }${isEventPast(event, now) ? ' is-past' : ''}`}
                      style={
                        {
                          gridColumn: `${start + 2} / ${end + 3}`,
                          gridRow: lane + 1,
                          '--cat': cat?.colour,
                        } as React.CSSProperties
                      }
                      title={`${pickTitle(event)} · ${range}`}
                      onClick={(clicked) => openPreview(clicked, event)}
                    >
                      <span className="kal-tl-bar-title">
                        {continuesBefore ? '‹ ' : ''}
                        {pickTitle(event)}
                        {continuesAfter ? ' ›' : ''}
                      </span>
                      <small>{range}</small>
                    </a>
                  );
                })}
              </div>
            ) : null}

            <div
              className="kal-tl-cols kal-tl-body"
              style={{ height: (timeline.to - timeline.from) * TIMELINE_HOUR_PX }}
            >
              <div className="kal-tl-gutter" aria-hidden="true">
                {hours.slice(0, -1).map((hour) => (
                  <span key={hour} style={{ top: (hour - timeline.from) * TIMELINE_HOUR_PX }}>
                    {String(hour % 24).padStart(2, '0')}:00
                  </span>
                ))}
              </div>
              {weekDays.map((day, index) => (
                <div key={dayKey(day)} className={`kal-tl-col${index === todayIndex ? ' is-today' : ''}`}>
                  {timeline.days[index]!.map((block) => renderTimelineBlock(block, timeline.from, timeline.to))}
                  {timeline.now && timeline.now.day === index ? (
                    <span
                      className="kal-tl-now"
                      style={{ top: (timeline.now.hour - timeline.from) * TIMELINE_HOUR_PX }}
                      aria-hidden="true"
                    />
                  ) : null}
                </div>
              ))}
              {empty ? <p className="kal-tl-empty">{nl ? 'Niets gepland deze week.' : 'Nothing planned this week.'}</p> : null}
            </div>
          </div>
        </div>
        {timeline.now || anyMine || anyRunsOn ? (
          <div className="kal-tl-legend">
            {timeline.now ? (
              <span>
                <i className="kal-tl-legend-now" aria-hidden="true" />
                {nl ? 'Nu' : 'Now'}
              </span>
            ) : null}
            {anyMine ? (
              <span>
                <i className="kal-tl-legend-mine" aria-hidden="true" />
                {nl ? 'Jij komt' : 'You are going'}
              </span>
            ) : null}
            {anyRunsOn ? (
              <span>
                <i className="kal-tl-legend-runs" aria-hidden="true" />
                {nl ? 'Loopt nog verder' : 'Runs on later'}
              </span>
            ) : null}
          </div>
        ) : null}
      </>
    );
  }

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
            <dd>{whenLine(preview)}</dd>
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
            <span className="crumbs-here">
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
        {/* Weergave en abonneren staan in de donkere band zelf. Ze stonden
            eronder in een kaart op papier, en die kaart plus de kop samen
            duwden het raster zo ver naar beneden dat je bij het openen van de
            kalender nog geen anderhalve week zag. De filterchips blijven wel op
            papier: dat zijn er elf en die horen bij het raster, niet bij de
            titel. Het bladeren hoort daar intussen ook bij; zie
            `.toolbar-month` hieronder. */}
        <div className="page-head-tools">
          <div className="view-switch" role="group" aria-label={locale === 'nl' ? 'Weergave' : 'View'}>
            <button
              type="button"
              className={view === 'grid' ? 'on' : ''}
              aria-pressed={view === 'grid'}
              onClick={() => chooseView('grid')}
            >
              {labels.views.grid}
            </button>
            <button
              type="button"
              className={view === 'agenda' ? 'on' : ''}
              aria-pressed={view === 'agenda'}
              onClick={() => chooseView('agenda')}
            >
              {labels.views.agenda}
            </button>
            <button
              type="button"
              className={view === 'week' ? 'on' : ''}
              aria-pressed={view === 'week'}
              onClick={() => chooseView('week')}
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
          {/* De maand staat op papier, als eerste regel boven de filters. In de
              donkere band stond ze tussen de titel en de knoppenrij in, en daar
              hing ze los in het midden: ze is het meest linkse van drie dingen
              die naar rechts uitlijnen, met aan beide kanten lucht. Hier begint
              ze op dezelfde lijn als de chips en het raster die ze bepaalt. */}
          <div className="toolbar-month">
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
                  ? `Week ${getISOWeek(weekFrom)} · `
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
          </div>
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
            {/* Rechts op dezelfde rij als de categorieën: het is geen filter op
                inhoud maar op de periode, en het hoort wel bij deze rij knoppen
                in plaats van als losse balk boven het raster te hangen. Enkel in
                het raster, want alleen daar valt er iets te verbergen. */}
            {view === 'grid' && hiddenGridCount > 0 ? (
              <button
                type="button"
                className="ev-grid-past toolbar-past"
                onClick={() => setShowPast((prev) => !prev)}
                aria-pressed={showPast}
              >
                {showPast
                  ? labels.hidePast ?? (locale === 'nl' ? 'Voorbije evenementen verbergen' : 'Hide past events')
                  : labels.showPast}
                {!showPast ? <span>{hiddenGridCount}</span> : null}
              </button>
            ) : null}
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
                      onChange={(e) => changeOnlyMyAudiences(e.target.checked)}
                    />
                    {labels.onlyMyAudiences}
                  </label>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        {view === 'agenda' && renderMonth()}

        {view === 'week' && renderWeek()}

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
                  <div className="ev-grid">{group.events.map((e) => renderCard(e))}</div>
                </div>
              ))
            )}

            {hiddenGridCount > 0 && showPast && shownGridWeeks.length > 0 ? (
              <div className="ev-grid-past-bar">
                <button
                  type="button"
                  className="ev-grid-past"
                  onClick={() => setShowPast(false)}
                >
                  {labels.hidePast ?? (locale === 'nl' ? 'Voorbije evenementen verbergen' : 'Hide past events')}
                </button>
              </div>
            ) : null}
          </section>
        )}

      </div>
    </>
  );
}
