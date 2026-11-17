/**
 * Wat de server, het beheer en de testdata van de privélinks naar een album
 * delen. Geen databank, geen Immich en geen `node:crypto`: dit bestand belandt
 * ook in de browser. Zie docs/immich-gallery.md, "Een album delen met een link".
 */

/** Wie er met de link binnen mag; dezelfde waarden als de enum in de databank. */
export const SHARE_AUDIENCES = ["LINK", "PRAESIDIUM", "GROUP"] as const;
export type ShareAudience = (typeof SHARE_AUDIENCES)[number];

export function isShareAudience(value: unknown): value is ShareAudience {
  return typeof value === "string" && (SHARE_AUDIENCES as readonly string[]).includes(value);
}

/**
 * De termijnen in het venster. `year` loopt tot het einde van het werkingsjaar;
 * de andere worden daar ook op afgekapt, zie {@link shareExpiry}.
 */
export const SHARE_TERMS = ["week", "month", "quarter", "year"] as const;
export type ShareTerm = (typeof SHARE_TERMS)[number];
export const DEFAULT_SHARE_TERM: ShareTerm = "month";

export function isShareTerm(value: unknown): value is ShareTerm {
  return typeof value === "string" && (SHARE_TERMS as readonly string[]).includes(value);
}

/** Zo lang mag "Voor wie?" zijn; het is een naam in een lijst, geen uitleg. */
export const SHARE_LABEL_MAX = 80;

/**
 * 32 willekeurige bytes in base64url: altijd 43 tekens. De vorm controleren we
 * voor we de databank raadplegen, zodat niet elk pad onder /media/gedeeld/ een
 * query kost.
 */
const SHARE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function isShareToken(value: string): boolean {
  return SHARE_TOKEN_PATTERN.test(value);
}

const DAY_MS = 24 * 60 * 60 * 1000;
const TIME_ZONE = "Europe/Brussels";

/** De kalenderdag en het uur in Brussel van een moment. */
function brusselsParts(date: Date): { year: number; month: number; day: number; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute") };
}

/** Middernacht in Brussel op een kalenderdag (maand 1-12), als moment. */
function brusselsMidnight(year: number, month: number, day: number): Date {
  const guess = Date.UTC(year, month - 1, day);
  const local = brusselsParts(new Date(guess));
  const offset = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute) - guess;
  return new Date(guess - offset);
}

/**
 * Het moment waarop het werkingsjaar wisselt: de eerstvolgende 15 juli om
 * middernacht in Brussel, zoals `currentWorkingYear` het rekent.
 */
export function nextWorkingYearCutover(now: Date): Date {
  const today = brusselsParts(now);
  const passed = today.month > 7 || (today.month === 7 && today.day >= 15);
  return brusselsMidnight(passed ? today.year + 1 : today.year, 7, 15);
}

function addMonths(date: Date, months: number): Date {
  const next = new Date(date.getTime());
  const day = next.getUTCDate();
  next.setUTCMonth(next.getUTCMonth() + months);
  // 31 januari plus een maand is geen 3 maart, maar de laatste dag van februari.
  if (next.getUTCDate() !== day) next.setUTCDate(0);
  return next;
}

/**
 * Tot wanneer een link werkt die nu gemaakt of verlengd wordt.
 *
 * Nooit voorbij de wissel van het werkingsjaar: een link voor het praesidium of
 * een werkgroep kijkt bij elk bezoek wie er dit jaar in zit, dus na 15 juli zou
 * de nieuwe ploeg zien wat voor de vorige bedoeld was. Wie in juni een maand
 * kiest, krijgt dus tot 15 juli.
 */
export function shareExpiry(term: ShareTerm, now: Date): Date {
  const cutover = nextWorkingYearCutover(now);
  const until =
    term === "week"
      ? new Date(now.getTime() + 7 * DAY_MS)
      : term === "month"
        ? addMonths(now, 1)
        : term === "quarter"
          ? addMonths(now, 3)
          : cutover;
  return until > cutover ? cutover : until;
}

/**
 * Een linkvoorbeeld van een chatdienst of een zoekrobot, geen mens. WhatsApp,
 * Messenger en Discord halen de pagina op zodra iemand de link plakt; dat telt
 * niet als geopend. Zonder user-agent tellen we ook niet.
 */
const PREVIEW_AGENTS =
  /facebookexternalhit|facebot|whatsapp|telegrambot|twitterbot|slackbot|discordbot|linkedinbot|skypeuripreview|applebot|googlebot|bingbot|embedly|bot\b|crawler|spider/i;

export function isLinkPreviewAgent(userAgent: string | null | undefined): boolean {
  return !userAgent || PREVIEW_AGENTS.test(userAgent);
}
