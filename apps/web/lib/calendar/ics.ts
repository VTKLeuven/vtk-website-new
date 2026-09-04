/**
 * iCalendar (RFC 5545) serialisatie voor de VTK-kalenderfeeds.
 *
 * Bewust zonder afhankelijkheden en zonder DB: `CalendarEvent` kent geen
 * herhaling, dus elk event is precies één VEVENT en de hele generator past in
 * dit bestand. Dat maakt hem ook volledig unit-testbaar (test/ics.test.ts).
 */

/** Tijdzone van de kring. Enkel hele-dag-events rekenen ermee; de rest gaat in UTC. */
const TIME_ZONE = "Europe/Brussels";

/**
 * `SEQUENCE` moet een integer zijn die stijgt bij elke wijziging. Epoch-seconden
 * lopen rond 2038 tegen de 32-bit grens waar sommige clients op rekenen, dus
 * tellen we vanaf 2020.
 */
const SEQUENCE_EPOCH = Date.UTC(2020, 0, 1);

export type IcsEvent = {
  /** Stabiel over de hele levensduur van het event; clients matchen hierop. */
  uid: string;
  start: Date;
  end: Date;
  allDay: boolean;
  summary: string;
  description?: string | null;
  location?: string | null;
  url?: string | null;
  categories?: string[];
  /** Voedt `DTSTAMP`, `LAST-MODIFIED` en `SEQUENCE`. */
  updatedAt: Date;
  /** Zet `CLASS:PRIVATE`; enkel voor events uit een persoonlijke feed. */
  private?: boolean;
};

export type IcsCalendar = {
  name: string;
  description?: string;
  /** Absolute URL van de pagina waar deze kalender bij hoort. */
  url?: string;
  /** Verversingsinterval voor geabonneerde agenda-apps (standaard PT6H). */
  refreshInterval?: string;
  events: IcsEvent[];
};

/**
 * Escapet een TEXT-waarde. De volgorde telt: de backslash moet eerst, anders
 * escapen we de backslashes die we zelf net toevoegden. `:` hoort hier
 * uitdrukkelijk niet bij; dat is enkel in parameterwaarden bijzonder.
 */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/**
 * Vouwt een contentregel op 75 **octets** (niet tekens): een regel met accenten
 * of emoji telt zwaarder dan hij lang lijkt. Vervolgen beginnen met een spatie,
 * die zelf meetelt, dus die dragen hoogstens 74 octets. We knippen nooit midden
 * in een UTF-8-teken: vervolgbytes zijn `10xxxxxx`, daar schuiven we voor terug.
 */
export function foldLine(line: string): string {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;

  const parts: string[] = [];
  let offset = 0;
  let limit = 75;
  while (offset < bytes.length) {
    let take = Math.min(limit, bytes.length - offset);
    while (take > 0 && offset + take < bytes.length && (bytes[offset + take]! & 0xc0) === 0x80) {
      take -= 1;
    }
    // Een teken dat zelfs alleen niet past, kan niet gevouwen worden; dan liever
    // een te lange regel dan een oneindige lus.
    if (take === 0) take = Math.min(limit, bytes.length - offset);
    parts.push(bytes.subarray(offset, offset + take).toString("utf8"));
    offset += take;
    limit = 74;
  }
  return parts.join("\r\n ");
}

function pad(n: number, width = 2): string {
  return String(n).padStart(width, "0");
}

/** `YYYYMMDDTHHMMSSZ`, altijd in UTC. */
export function formatUtc(date: Date): string {
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}

/**
 * De kalenderdatum van een moment in Brussel-tijd. Bewust niet via de
 * server-locale: een productiecontainer op UTC zou een event van 00:30 anders op
 * de vorige dag zetten.
 */
function brusselsParts(date: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  return { year: get("year"), month: get("month"), day: get("day") };
}

/** `YYYYMMDD` voor een `VALUE=DATE`-waarde, met een optionele verschuiving in dagen. */
export function formatDate(date: Date, addDays = 0): string {
  const { year, month, day } = brusselsParts(date);
  // Via UTC rekenen zodat het optellen van een dag niet over een zomeruur-sprong
  // struikelt; we werken hier met kalenderdagen, niet met momenten.
  const shifted = new Date(Date.UTC(year, month - 1, day + addDays));
  return (
    `${shifted.getUTCFullYear()}${pad(shifted.getUTCMonth() + 1)}${pad(shifted.getUTCDate())}`
  );
}

function sequenceFor(updatedAt: Date): number {
  return Math.max(0, Math.floor((updatedAt.getTime() - SEQUENCE_EPOCH) / 1000));
}

function eventLines(event: IcsEvent, dtstamp: string): string[] {
  const lines: string[] = ["BEGIN:VEVENT", `UID:${escapeText(event.uid)}`, `DTSTAMP:${dtstamp}`];

  if (event.allDay) {
    // `DTEND` is bij een hele-dag-event **exclusief**: een event op 21 oktober
    // eindigt op de 22ste. Zonder die dag valt het in elke agenda een dag te kort.
    lines.push(`DTSTART;VALUE=DATE:${formatDate(event.start)}`);
    lines.push(`DTEND;VALUE=DATE:${formatDate(event.end, 1)}`);
  } else {
    lines.push(`DTSTART:${formatUtc(event.start)}`);
    lines.push(`DTEND:${formatUtc(event.end)}`);
  }

  lines.push(`SUMMARY:${escapeText(event.summary)}`);

  const description = event.description?.trim();
  if (description) lines.push(`DESCRIPTION:${escapeText(description)}`);

  const location = event.location?.trim();
  if (location) lines.push(`LOCATION:${escapeText(location)}`);

  if (event.url) lines.push(`URL:${escapeText(event.url)}`);

  if (event.categories?.length) {
    // De komma scheidt hier waarden, dus die moet binnen elke waarde geëscaped
    // blijven; escapeText doet dat al.
    lines.push(`CATEGORIES:${event.categories.map(escapeText).join(",")}`);
  }

  lines.push(`CLASS:${event.private ? "PRIVATE" : "PUBLIC"}`);
  lines.push("STATUS:CONFIRMED");
  lines.push(`LAST-MODIFIED:${formatUtc(event.updatedAt)}`);
  lines.push(`SEQUENCE:${sequenceFor(event.updatedAt)}`);
  lines.push("END:VEVENT");
  return lines;
}

/**
 * Bouwt een volledige VCALENDAR. `REFRESH-INTERVAL` en `X-PUBLISHED-TTL` zijn
 * een hint, geen garantie: Google ververst een geabonneerde feed traag (uren),
 * Apple en Outlook volgen de hint doorgaans wel.
 */
export function buildIcs(calendar: IcsCalendar, now = new Date()): string {
  const dtstamp = formatUtc(now);
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//VTK//Website//NL",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `NAME:${escapeText(calendar.name)}`,
    `X-WR-CALNAME:${escapeText(calendar.name)}`,
    `X-WR-TIMEZONE:${TIME_ZONE}`,
    `REFRESH-INTERVAL;VALUE=DURATION:${calendar.refreshInterval ?? "PT6H"}`,
    `X-PUBLISHED-TTL:${calendar.refreshInterval ?? "PT6H"}`,
  ];

  if (calendar.description) {
    lines.push(`DESCRIPTION:${escapeText(calendar.description)}`);
    lines.push(`X-WR-CALDESC:${escapeText(calendar.description)}`);
  }
  if (calendar.url) lines.push(`URL:${escapeText(calendar.url)}`);

  for (const event of calendar.events) lines.push(...eventLines(event, dtstamp));

  lines.push("END:VCALENDAR");
  return `${lines.map(foldLine).join("\r\n")}\r\n`;
}
