/**
 * Welk kalenderevent hoort bij een ticketverkoop die nergens aan hangt?
 *
 * Een verkoop zonder `calendarEventId` staat live op /tickets, maar de
 * eventpagina (`/kalender/<slug>`) weet er niets van: die toont enkel de
 * verkopen die eraan gekoppeld zijn. Het ticketbeheer waarschuwt daarom bij
 * publiceren en stelt een event voor. Dit is dat voorstel, op datum en titel.
 *
 * Puur, zonder prisma: de pagina haalt de kandidaten op (enkel van de eigen
 * post, want koppelen kan enkel daarbinnen) en dit kiest eruit.
 */

/** Wat hier van een kalenderevent gelezen wordt. */
export type CalendarCandidate = {
  id: string;
  titleNl: string;
  titleEn: string | null;
  start: Date;
  end: Date;
  publishedAt: Date | null;
};

export type CalendarSuggestion = CalendarCandidate & {
  /** De verkoop begint op een dag waarop het event loopt. */
  sameDay: boolean;
  /** Minstens de helft van de woorden van de kortste titel komt in de andere voor. */
  similarTitle: boolean;
  /** Dagen tussen de start van de verkoop en het event; 0 wanneer ze erin valt. */
  dayDistance: number;
};

/** Hoe ver een event met een gelijkaardige titel mag liggen om nog voorgesteld te worden. */
export const SUGGESTION_WINDOW_DAYS = 45;
const MAX_SUGGESTIONS = 3;

/**
 * Woorden die in bijna elke titel staan en dus niets zeggen over welk event het
 * is. Een jaartal valt er ook buiten: "Galabal 2025" is niet "Galabal 2026", en
 * de datum zegt dat al beter.
 */
const NOISE = new Set([
  "de", "het", "een", "en", "van", "voor", "met", "op", "in", "aan", "bij",
  "the", "and", "of", "for", "an", "at", "on",
  "vtk", "ticket", "tickets", "editie", "edition",
]);

function titleWords(title: string | null | undefined): Set<string> {
  if (!title) return new Set();
  return new Set(
    title
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length >= 3 && !NOISE.has(word) && !/^\d{4}$/.test(word)),
  );
}

/** Welk deel van de woorden van de kortste titel ook in de andere staat (0 tot 1). */
export function titleSimilarity(a: string | null | undefined, b: string | null | undefined): number {
  const left = titleWords(a);
  const right = titleWords(b);
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const word of left) if (right.has(word)) shared += 1;
  return shared / Math.min(left.size, right.size);
}

const brusselsDay = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Brussels",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Dagnummer op de Brusselse kalender, zodat een cantus om 23:30 op haar eigen dag valt. */
function dayNumber(date: Date): number {
  return Math.round(Date.parse(`${brusselsDay.format(date)}T00:00:00Z`) / 86_400_000);
}

/**
 * Een einde voor zes uur 's ochtends hoort bij de avond ervoor: een cantus van
 * 20:00 tot 3:00 is een zaterdag, niet ook een zondag.
 */
const NIGHT_MS = 6 * 3_600_000;

/**
 * Dagen tussen de start van de verkoop en het event. Een event over meerdere
 * dagen (de 12u, een weekend) telt elke dag mee: wie op zaterdag tickets
 * verkoopt voor het weekend dat vrijdag begint, zit er middenin.
 */
function daysBetween(ticketStart: Date, candidate: CalendarCandidate): number {
  const day = dayNumber(ticketStart);
  const first = dayNumber(candidate.start);
  const last = Math.max(first, dayNumber(new Date(candidate.end.getTime() - NIGHT_MS)));
  if (day < first) return first - day;
  if (day > last) return day - last;
  return 0;
}

/**
 * De kalenderevents die het waarschijnlijkst bij deze verkoop horen, beste
 * eerst, hoogstens drie. Een event op dezelfde dag komt altijd in aanmerking;
 * een event op een andere dag enkel met een gelijkaardige titel en binnen
 * {@link SUGGESTION_WINDOW_DAYS}. Niets dat lijkt, dan een lege lijst: een
 * voorstel dat nergens op slaat is erger dan geen voorstel.
 */
export function suggestCalendarEvents(
  ticket: { titleNl: string; titleEn?: string | null; startsAt: Date },
  candidates: readonly CalendarCandidate[],
): CalendarSuggestion[] {
  return candidates
    .map((candidate) => {
      const dayDistance = daysBetween(ticket.startsAt, candidate);
      const similarity = Math.max(
        titleSimilarity(ticket.titleNl, candidate.titleNl),
        titleSimilarity(ticket.titleEn, candidate.titleEn),
      );
      const suggestion: CalendarSuggestion = {
        ...candidate,
        sameDay: dayDistance === 0,
        similarTitle: similarity >= 0.5,
        dayDistance,
      };
      return { suggestion, similarity };
    })
    .filter(
      ({ suggestion }) =>
        suggestion.sameDay ||
        (suggestion.similarTitle && suggestion.dayDistance <= SUGGESTION_WINDOW_DAYS),
    )
    .sort(
      (a, b) =>
        Number(b.suggestion.sameDay) - Number(a.suggestion.sameDay) ||
        b.similarity - a.similarity ||
        a.suggestion.dayDistance - b.suggestion.dayDistance ||
        // Een gepubliceerd event eerst: daar staat de eventpagina al.
        Number(b.suggestion.publishedAt !== null) - Number(a.suggestion.publishedAt !== null) ||
        a.suggestion.start.getTime() - b.suggestion.start.getTime(),
    )
    .slice(0, MAX_SUGGESTIONS)
    .map(({ suggestion }) => suggestion);
}
