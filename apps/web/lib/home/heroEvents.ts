import { addDays } from "date-fns";
import { MOMENT_TIME_ZONE, nextOccurrenceAt } from "@/lib/calendar/moments";

/** Hoeveel evenementen er in de hero staan. */
export const HERO_EVENT_SLOTS = 4;

type Occurrence = Parameters<typeof nextOccurrenceAt>[0];

/**
 * Welke evenementen er in de hero staan: eerst wat in /admin/kalender uitgelicht
 * is, en de plaatsen die dan overblijven gaan naar de eerstvolgende evenementen.
 * Zo staat de hero nooit half leeg omdat niemand iets aanduidde.
 *
 * `upcoming` staat al op de eerstvolgende keer gesorteerd, en die volgorde
 * blijft: de datumpins lezen van links naar rechts als een agenda, ook wanneer
 * het galabal van over drie weken uitgelicht is. Zijn er meer uitgelicht dan er
 * plaatsen zijn (de action weigert dat, maar een concept kan later gepubliceerd
 * worden), dan gaan de eerstvolgende voor.
 */
export function pickHeroEvents<T extends { homeFeaturedAt: Date | null }>(upcoming: readonly T[]): T[] {
  const featured = upcoming.filter((event) => event.homeFeaturedAt).slice(0, HERO_EVENT_SLOTS);
  const others = upcoming
    .filter((event) => !event.homeFeaturedAt)
    .slice(0, HERO_EVENT_SLOTS - featured.length);
  const picked = new Set<T>([...featured, ...others]);
  return upcoming.filter((event) => picked.has(event));
}

/**
 * "Deze week" mag enkel boven de kaarten staan als dat voor elke kaart klopt: een
 * uitgelicht evenement kan ver vooruit liggen.
 */
export function allWithinWeek(events: readonly Occurrence[], now: Date): boolean {
  const end = addDays(now, 7);
  return events.every((event) => nextOccurrenceAt(event, now) <= end);
}

/** Het dagnummer op de Brusselse klok, zodat 23:30 en 00:30 twee dagen zijn. */
function brusselsDayNumber(date: Date): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: MOMENT_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: "year" | "month" | "day") =>
    Number(parts.find((candidate) => candidate.type === type)?.value);
  return Date.UTC(part("year"), part("month") - 1, part("day")) / 86_400_000;
}

/** Vandaag of morgen op de Brusselse klok; elke andere dag staat al op de datumpin. */
export function relativeDay(date: Date, now: Date): "today" | "tomorrow" | null {
  const difference = brusselsDayNumber(date) - brusselsDayNumber(now);
  if (difference === 0) return "today";
  if (difference === 1) return "tomorrow";
  return null;
}
