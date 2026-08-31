import type {
  CollectEnGoOrderStatus,
  UitleenPricingMode,
  UitleenRequesterType,
  UitleenReservationStatus,
  UitleenTransportBookingStatus,
} from '@prisma/client';
import type { LogistiekLocale } from './i18n-shared';

/**
 * De soorten aanvragen die elk hun eigen meldingsadres(sen) hebben (M1).
 *
 * Hier en niet in `lib/uitleen-server.ts`: het instellingenscherm is een
 * client-component, en dat bestand draagt `import 'server-only'`. Een constante
 * daaruit importeren laat de hele pagina omvallen met "You're importing a module
 * that depends on server-only". Zie dezelfde comment bij `kalender-kinds.ts`.
 */
export const NOTIFY_KINDS = ['materiaal', 'flesserke', 'transport'] as const;

export type NotifyKind = (typeof NOTIFY_KINDS)[number];

export type LogistiekNotifyEmails = Record<NotifyKind, string[]>;

export function formatEuro(cents: number): string {
  const euros = Math.floor(Math.abs(cents) / 100);
  const rest = Math.abs(cents) % 100;
  const sign = cents < 0 ? '-' : '';
  return `${sign}€ ${euros},${rest.toString().padStart(2, '0')}`;
}

/** Prijs die nog niet gekend kan zijn (per-km voor de rit): toon een placeholder. */
export function formatPriceCents(
  cents: number | null | undefined,
  locale: LogistiekLocale = 'nl'
): string {
  if (cents != null) return formatEuro(cents);
  return locale === 'en' ? 'To be determined' : 'Nog te bepalen';
}

/**
 * Waar een item in de loods ligt, als één regel ("2R · A1"). Enkel voor het team:
 * schap en rek zijn achter `logistiek.manage` verborgen (zie M6 en
 * docs/design-decisions.md).
 */
export function itemLocation(item: {
  locationShelf: string | null;
  locationRack: string | null;
}): string | null {
  const parts = [item.locationShelf, item.locationRack]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(' · ') : null;
}

/**
 * Ziet dit eruit als een e-mailadres? Bewust minimaal: het adres wordt enkel in
 * kopie gezet, en een strengere regex weigert vroeg of laat een geldig adres.
 * Of het bestaat, weten we pas als de mailserver het aanneemt.
 */
export function isEmailish(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

/**
 * De adressen uit het veld "extra adres dat op de hoogte blijft", gesplitst op
 * komma of puntkomma.
 *
 * Eén werkgroep heeft vaak meer dan één mailbox die moet meelezen (de
 * werkgroepmailbox én de verantwoordelijke), en dat paste niet in één veld.
 * Geeft `null` zodra er één adres tussen staat dat geen adres is: half
 * verzenden en de rest stil laten vallen, is erger dan een foutmelding, want
 * dan denkt de aanvrager dat iedereen meeleest.
 *
 * Dubbels vallen weg (hoofdletterongevoelig), zodat niemand twee keer dezelfde
 * mail krijgt.
 */
export function parseNotifyEmails(value: string): string[] | null {
  const parts = value
    .split(/[,;]/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.some((part) => !isEmailish(part))) return null;
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const part of parts) {
    const key = part.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(part);
  }
  return unique;
}

/**
 * "YYYY-MM-DD" uit een date-input naar een Date op UTC-middernacht, zoals
 * Prisma `@db.Date`-kolommen ze bewaart. Ongeldige input geeft null.
 */
export function parseDateOnly(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) return null;
  return date;
}

/** Vandaag als date-only (UTC-middernacht), voor vergelijkingen met @db.Date. */
export function todayDateOnly(now: Date = new Date()): Date {
  // Belgische wall-clock datum, onafhankelijk van de server-timezone.
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Brussels',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return new Date(`${formatter.format(now)}T00:00:00.000Z`);
}

/**
 * De maandag van de week waarin dit moment valt, als date-only (UTC-middernacht,
 * zoals `todayDateOnly`). Belgische wall-clock, dus een rit van zondagavond
 * 23:00 hoort nog bij die week en niet bij de volgende.
 */
export function startOfWeek(date: Date = new Date()): Date {
  const day = todayDateOnly(date);
  const weekday = (day.getUTCDay() + 6) % 7; // maandag = 0
  return new Date(day.getTime() - weekday * 24 * 60 * 60 * 1000);
}

/**
 * ISO-weeknummer (maandag als eerste dag, week 1 bevat 4 januari). Voor de titel
 * van het weekoverzicht: "week 38" zegt Logistiek meer dan een datumbereik.
 */
export function isoWeekNumber(date: Date): number {
  const thursday = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
  // Naar de donderdag van deze week: die bepaalt in welk jaar de week valt.
  thursday.setUTCDate(thursday.getUTCDate() - ((thursday.getUTCDay() + 6) % 7) + 3);
  const firstThursday = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 4));
  firstThursday.setUTCDate(firstThursday.getUTCDate() - ((firstThursday.getUTCDay() + 6) % 7) + 3);
  return 1 + Math.round((thursday.getTime() - firstThursday.getTime()) / (7 * 24 * 60 * 60 * 1000));
}

export function formatDateOnly(date: Date, locale: LogistiekLocale = 'nl'): string {
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'nl-BE', {
    timeZone: 'UTC',
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

/**
 * Evenementen klaarmaken voor de keuzelijst in het aanvraagformulier: de datum
 * wordt hier al tekst. De picker is een client component, en een `Date` die de
 * grens over gaat, komt daar als string aan; ze dan pas formatteren zou de
 * server-timezone gebruiken in plaats van de Belgische.
 */
export function eventOptions(
  events: Array<{
    id: string;
    name: string;
    startAt: Date | null;
    groupName: string | null;
    own?: boolean;
  }>,
  locale: LogistiekLocale = 'nl'
): Array<{
  id: string;
  name: string;
  startAt: string | null;
  groupName: string | null;
  own: boolean;
}> {
  return events.map((event) => ({
    id: event.id,
    name: event.name,
    groupName: event.groupName,
    startAt: event.startAt ? formatDateOnly(event.startAt, locale) : null,
    own: event.own ?? false,
  }));
}

export type ChangeSnapshot = {
  pickupDate: Date;
  returnDate: Date;
  /** Dagdeel, wanneer de aanvraag er een heeft; zie M12. */
  pickupPart?: string | null;
  returnPart?: string | null;
  lines: Array<{ itemName: string; quantity: number }>;
};

/**
 * Wat er precies veranderde aan een aanvraag, in mensentaal.
 *
 * "3 materiaallijnen na de wijziging" staat in de historiek maar zegt de
 * aanvrager niets: hij weet niet wat er stond. Deze regels gaan zowel naar de
 * historiek (A6) als naar de mail (A9), en zijn de reden dat die mail bruikbaar
 * is: "Tafel: 5 → 3" is een bericht, "aanvraag gewijzigd" is een raadsel.
 *
 * Bewust op naam en niet op item-id: de lijnen bewaren de naam op het moment van
 * aanvragen (`itemName`), en dat is ook wat de aanvrager gelezen heeft.
 */
export function describeReservationChanges(
  before: ChangeSnapshot,
  after: ChangeSnapshot,
  locale: LogistiekLocale = 'nl'
): string[] {
  const en = locale === 'en';
  const changes: string[] = [];

  // Datum en dagdeel samen: "za 12 september 2026 (namiddag) → zo 13 september
  // 2026 (voormiddag)". Enkel het dagdeel wijzigen is ook een wijziging, want
  // daar plant iemand zijn shift op.
  const sameMoment = (a: Date, b: Date, partA?: string | null, partB?: string | null) =>
    a.getTime() === b.getTime() && (partA ?? null) === (partB ?? null);
  if (!sameMoment(before.pickupDate, after.pickupDate, before.pickupPart, after.pickupPart)) {
    changes.push(
      `${en ? 'Pickup' : 'Afhalen'}: ${formatDateWithPart(before.pickupDate, before.pickupPart, locale)} → ${formatDateWithPart(after.pickupDate, after.pickupPart, locale)}`
    );
  }
  if (!sameMoment(before.returnDate, after.returnDate, before.returnPart, after.returnPart)) {
    changes.push(
      `${en ? 'Return' : 'Terugbrengen'}: ${formatDateWithPart(before.returnDate, before.returnPart, locale)} → ${formatDateWithPart(after.returnDate, after.returnPart, locale)}`
    );
  }

  const sum = (lines: ChangeSnapshot['lines']) => {
    const totals = new Map<string, number>();
    for (const line of lines) {
      totals.set(line.itemName, (totals.get(line.itemName) ?? 0) + line.quantity);
    }
    return totals;
  };
  const oldLines = sum(before.lines);
  const newLines = sum(after.lines);

  for (const [name, quantity] of newLines) {
    const previous = oldLines.get(name);
    if (previous === undefined) {
      changes.push(`${name}: ${en ? 'added' : 'toegevoegd'} (${quantity})`);
    } else if (previous !== quantity) {
      changes.push(`${name}: ${previous} → ${quantity}`);
    }
  }
  for (const [name] of oldLines) {
    if (!newLines.has(name)) changes.push(`${name}: ${en ? 'removed' : 'verwijderd'}`);
  }

  return changes;
}

/**
 * Compacte periode: "1 tot 30 augustus 2026", "1 augustus tot 3 september 2026"
 * of twee volledige datums wanneer het jaar verschilt. Voor koppen boven een
 * lijst, waar twee volledige datums naast elkaar te veel ruis geven.
 */
export function formatDateRange(from: Date, to: Date, locale: LogistiekLocale = 'nl'): string {
  const tag = locale === 'en' ? 'en-GB' : 'nl-BE';
  const part = (date: Date, opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(tag, { timeZone: 'UTC', ...opts }).format(date);
  const joiner = locale === 'en' ? 'to' : 'tot';

  const sameYear = from.getUTCFullYear() === to.getUTCFullYear();
  const sameMonth = sameYear && from.getUTCMonth() === to.getUTCMonth();

  if (sameMonth) {
    return `${part(from, { day: 'numeric' })} ${joiner} ${part(to, { day: 'numeric', month: 'long', year: 'numeric' })}`;
  }
  if (sameYear) {
    return `${part(from, { day: 'numeric', month: 'long' })} ${joiner} ${part(to, { day: 'numeric', month: 'long', year: 'numeric' })}`;
  }
  const full = { day: 'numeric', month: 'long', year: 'numeric' } as const;
  return `${part(from, full)} ${joiner} ${part(to, full)}`;
}

/** Date (@db.Date, UTC-middernacht) naar de "YYYY-MM-DD"-waarde van een date-input. */
export function toDateInputValue(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** Date naar de "YYYY-MM-DDTHH:mm"-waarde van een datetime-local-input (Brussel). */
export function toDatetimeLocalValue(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Brussels',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const hour = get('hour') === '24' ? '00' : get('hour');
  return `${get('year')}-${get('month')}-${get('day')}T${hour}:${get('minute')}`;
}

/** De "YYYY-MM-DD" van een moment in Belgische tijd, voor een `type="date"`. */
export function toBrusselsDateValue(date: Date): string {
  return toDatetimeLocalValue(date).slice(0, 10);
}

/** Het "HH:mm" van een moment in Belgische tijd, voor een `type="time"`. */
export function toBrusselsTimeValue(date: Date): string {
  return toDatetimeLocalValue(date).slice(11);
}

/**
 * Het startmoment van een evenement in woorden, met of zonder uur (E2).
 *
 * Een evenement waarvan het uur nog niet gekend is, staat als middernacht in de
 * databank; "om 00:00" tonen zou een uur beweren dat niemand ingaf.
 */
export function formatEventMoment(
  event: { startAt: Date | null; startTimeKnown: boolean; endAt?: Date | null },
  locale: LogistiekLocale = 'nl'
): string | null {
  if (!event.startAt) return null;
  const start = event.startTimeKnown
    ? formatDateTime(event.startAt, locale)
    : formatBrusselsDay(event.startAt, locale);
  if (!event.endAt) return start;
  const sameDay = toBrusselsDateValue(event.startAt) === toBrusselsDateValue(event.endAt);
  const end = sameDay
    ? new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'nl-BE', {
        timeZone: 'Europe/Brussels',
        hour: '2-digit',
        minute: '2-digit',
      }).format(event.endAt)
    : formatBrusselsDay(event.endAt, locale);
  return `${start} ${locale === 'en' ? 'to' : 'tot'} ${end}`;
}

/**
 * De dag van een echt tijdstip, in Belgische tijd.
 *
 * Niet `formatDateOnly`: die leest bewust in UTC, want ze dient voor
 * `@db.Date`-kolommen die als UTC-middernacht bewaard worden. Een evenement dat
 * op 15 oktober om 00:00 Brussel begint, staat als 14 oktober 22:00 UTC in de
 * kolom en zou daar een dag te vroeg uitkomen.
 */
export function formatBrusselsDay(date: Date, locale: LogistiekLocale = 'nl'): string {
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'nl-BE', {
    timeZone: 'Europe/Brussels',
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

export function formatDateTime(date: Date, locale: LogistiekLocale = 'nl'): string {
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'nl-BE', {
    timeZone: 'Europe/Brussels',
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

/**
 * De uren van een rit, met de einddag erbij wanneer ze over middernacht gaat.
 * Gedeeld door het ritoverzicht en de chauffeurspagina, zodat "22:12-00:12 (di
 * 28 jul)" er overal hetzelfde uitziet.
 */
export function tripHoursLabel(
  startAt: Date,
  endAt: Date,
  locale: LogistiekLocale = 'nl'
): string {
  const tag = locale === 'en' ? 'en-GB' : 'nl-BE';
  const time = new Intl.DateTimeFormat(tag, {
    timeZone: 'Europe/Brussels',
    hour: '2-digit',
    minute: '2-digit',
  });
  const day = new Intl.DateTimeFormat(tag, {
    timeZone: 'Europe/Brussels',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  const dayKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Brussels' });
  const hours = `${time.format(startAt)}-${time.format(endAt)}`;
  return dayKey.format(startAt) === dayKey.format(endAt) ? hours : `${hours} (${day.format(endAt)})`;
}

/**
 * Eindigt deze rit 's nachts?
 *
 * Voor de vraag achter "hoeveel ritten heeft deze chauffeur gereden": krijgt niet
 * altijd dezelfde persoon de late ritten? De grens ligt op 22:00 Belgische tijd,
 * en een rit die over middernacht gaat telt sowieso mee.
 */
export function isNightTrip(startAt: Date, endAt: Date): boolean {
  const hour = (moment: Date) =>
    Number(
      new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/Brussels',
        hour: '2-digit',
        hour12: false,
      }).format(moment)
    ) % 24;
  const dayKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Brussels' });
  if (dayKey.format(startAt) !== dayKey.format(endAt)) return true;
  return hour(endAt) >= 22 || hour(startAt) >= 22;
}

/** Twee gesloten datumbereiken overlappen. */
export function rangesOverlap(aFrom: Date, aTo: Date, bFrom: Date, bTo: Date): boolean {
  return aFrom <= bTo && aTo >= bFrom;
}

/**
 * Ligt dit moment op een kwartier?
 *
 * Ritten worden op het kwartier gepland: zo plant Logistiek de kar in, en uren
 * als 14:07 maken het weekoverzicht onleesbaar. De server weigert een ander
 * tijdstip in plaats van stil af te ronden, want afronden verschuift een rit
 * zonder dat de aanvrager het ziet.
 *
 * In UTC gerekend zodat de server-timezone niet meespeelt; elke echte
 * tijdzone-offset is een veelvoud van een kwartier, dus het antwoord verandert
 * niet met de zone.
 */
export function isOnQuarterHour(date: Date): boolean {
  return (
    date.getUTCMinutes() % 15 === 0 && date.getUTCSeconds() === 0 && date.getUTCMilliseconds() === 0
  );
}

/** Aantal begonnen uren tussen twee momenten, met één uur als minimum. */
export function billedHours(startAt: Date, endAt: Date): number {
  const ms = endAt.getTime() - startAt.getTime();
  if (ms <= 0) return 1;
  return Math.max(1, Math.ceil(ms / (60 * 60 * 1000)));
}

/**
 * Prijs van een transportboeking volgens de tariefmodus van het voertuig.
 * Geeft null wanneer de prijs nog niet gekend is (PER_KM voor de rit, zonder
 * ingevoerde kilometers).
 */
export function transportPriceCents(params: {
  pricingMode: UitleenPricingMode;
  rateCents: number;
  startAt: Date;
  endAt: Date;
  kilometers?: number | null;
}): number | null {
  switch (params.pricingMode) {
    case 'FREE':
      return 0;
    case 'FLAT':
      return params.rateCents;
    case 'PER_HOUR':
      return billedHours(params.startAt, params.endAt) * params.rateCents;
    case 'PER_KM':
      return params.kilometers != null && params.kilometers >= 0
        ? params.kilometers * params.rateCents
        : null;
    default:
      return null;
  }
}

export const PRICING_MODE_LABELS: Record<UitleenPricingMode, string> = {
  FREE: 'Gratis',
  PER_HOUR: 'Per uur',
  PER_KM: 'Per kilometer',
  FLAT: 'Vast bedrag',
};

const PRICING_MODE_LABELS_EN: Record<UitleenPricingMode, string> = {
  FREE: 'Free',
  PER_HOUR: 'Per hour',
  PER_KM: 'Per kilometre',
  FLAT: 'Flat rate',
};

export function pricingModeLabel(mode: UitleenPricingMode, locale: LogistiekLocale): string {
  return (locale === 'en' ? PRICING_MODE_LABELS_EN : PRICING_MODE_LABELS)[mode];
}

export const REQUESTER_TYPE_LABELS: Record<UitleenRequesterType, string> = {
  INTERN: 'Interne post',
  WERKGROEP: 'Werkgroep',
  EXTERN: 'Extern',
};

const REQUESTER_TYPE_LABELS_EN: Record<UitleenRequesterType, string> = {
  INTERN: 'Internal post',
  WERKGROEP: 'Work group',
  EXTERN: 'External',
};

export function requesterTypeLabel(type: UitleenRequesterType, locale: LogistiekLocale): string {
  return (locale === 'en' ? REQUESTER_TYPE_LABELS_EN : REQUESTER_TYPE_LABELS)[type];
}

/**
 * Namens wie een aanvraag gebeurt, als één label: de post bij INTERN, anders de
 * bewaarde naam van de werkgroep of de externe. Gedeeld door de aanvragenlijst
 * en de kalender, zodat beide schermen dezelfde naam tonen.
 */
export function requesterLabel(request: {
  requesterType: UitleenRequesterType;
  requesterName: string | null;
  group: { nameNl: string } | null;
}): string {
  if (request.requesterType === 'INTERN') {
    return request.group?.nameNl ?? REQUESTER_TYPE_LABELS.INTERN;
  }
  return request.requesterName ?? REQUESTER_TYPE_LABELS[request.requesterType];
}

/**
 * Rekent de uitleendienst deze aanvrager iets aan?
 *
 * Enkel externen betalen. Een post of een werkgroep is de kring zelf: die
 * factureert niet aan zichzelf, en een bedrag naast een interne aanvraag zet
 * mensen aan het rekenen over geld dat nooit van hand wisselt. Prijs, waarborg
 * en betaalstatus verdwijnen daarom volledig bij een interne aanvraag, aan
 * beide kanten van het scherm: wat de aanvrager niet ziet, mag het team ook
 * niet als openstaand bedrag voorgeschoteld krijgen.
 *
 * Dit staat los van de instelling `showRentPrices`, die over de catalogus gaat
 * (tonen we de dagprijs bij een item?) en niet over een concrete aanvraag.
 */
export function chargesRequester(requesterType: UitleenRequesterType): boolean {
  return requesterType === 'EXTERN';
}

/**
 * Termijn waarbinnen een aanvraag "last minute" heet. Zeven dagen: met veertien
 * kreeg bijna elke aanvraag de badge, en een signaal dat overal staat is geen
 * signaal meer. Het team past dit zelf aan op /beheer/instellingen.
 */
export const DEFAULT_LAST_MINUTE_DAYS = 7;

/** Deadline-signaal: de afhaaldag valt binnen `days` na het moment van aanvragen. */
export function isLastMinute(
  pickupDate: Date,
  requestedAt: Date = new Date(),
  days: number = DEFAULT_LAST_MINUTE_DAYS
): boolean {
  const elapsed = (pickupDate.getTime() - requestedAt.getTime()) / (24 * 60 * 60 * 1000);
  return elapsed < days;
}

/**
 * De staat van een exemplaar, zoals het team ze noteert. Interne informatie: ze
 * staat in het beheer en op de detailpagina enkel voor `logistiek.manage`, want
 * ze zegt iets over onderhoud en niet over wat je kan aanvragen.
 */
/**
 * Dagdelen, in de volgorde van de dag. Enkel voor de mensen: de
 * voorraadberekening blijft op hele dagen rekenen (zie docs/design-decisions.md),
 * dus dit label staat naast de datum en niet in een query.
 */
export const DAY_PART_LABELS: Record<string, string> = {
  VOORMIDDAG: 'voormiddag',
  NAMIDDAG: 'namiddag',
  AVOND: 'avond',
};

const DAY_PART_LABELS_EN: Record<string, string> = {
  VOORMIDDAG: 'morning',
  NAMIDDAG: 'afternoon',
  AVOND: 'evening',
};

export const DAY_PARTS = ['VOORMIDDAG', 'NAMIDDAG', 'AVOND'] as const;

export function dayPartLabel(
  part: string | null | undefined,
  locale: LogistiekLocale = 'nl'
): string | null {
  if (!part) return null;
  return (locale === 'en' ? DAY_PART_LABELS_EN : DAY_PART_LABELS)[part] ?? null;
}

/** "za 12 september 2026 (namiddag)", of gewoon de datum zonder dagdeel. */
export function formatDateWithPart(
  date: Date,
  part: string | null | undefined,
  locale: LogistiekLocale = 'nl'
): string {
  const label = dayPartLabel(part, locale);
  return label ? `${formatDateOnly(date, locale)} (${label})` : formatDateOnly(date, locale);
}

/**
 * Uren waarmee een dagdeel voorgevuld wordt wanneer er een rit van gemaakt
 * wordt. Een afspraak, geen boeking: het dagdeel zelf blijft grof (zie
 * docs/design-decisions.md), maar een rit heeft wel een begin- en einduur nodig,
 * en dan is het midden van dat dagdeel de minst verkeerde gok.
 */
const DAY_PART_HOURS: Record<string, { from: string; to: string }> = {
  VOORMIDDAG: { from: '09:00', to: '11:00' },
  NAMIDDAG: { from: '13:00', to: '15:00' },
  AVOND: { from: '18:00', to: '20:00' },
};

/**
 * Een afhaal- of terugbrengdag plus dagdeel omzetten naar de twee
 * `datetime-local`-waarden waarmee het ritformulier voorgevuld wordt.
 *
 * De dagkolommen zijn `@db.Date` en komen als middernacht UTC terug, terwijl de
 * uren Belgische wall-clock zijn. Daarom lezen we de dag in UTC en plakken we er
 * een lokaal uur aan in plaats van de `Date` om te rekenen: dat laatste zou in
 * de winter een dag terugvallen.
 */
export function tripWindowFor(
  date: Date,
  part: string | null | undefined
): { startAt: string; endAt: string } {
  const day = date.toISOString().slice(0, 10);
  const hours = DAY_PART_HOURS[part ?? ''] ?? DAY_PART_HOURS.VOORMIDDAG;
  return { startAt: `${day}T${hours.from}`, endAt: `${day}T${hours.to}` };
}

export const ITEM_CONDITION_LABELS: Record<string, string> = {
  WERKT: 'Werkt',
  TESTEN: 'Nog testen',
  ONVOLLEDIG: 'Onvolledig',
  KAPOT: 'Kapot / vervangen',
};

export const RESERVATION_STATUS_LABELS: Record<UitleenReservationStatus, string> = {
  REQUESTED: 'Aangevraagd',
  APPROVED: 'Goedgekeurd',
  REJECTED: 'Afgewezen',
  CANCELLED: 'Geannuleerd',
  PICKED_UP: 'Afgehaald',
  RETURNED: 'Teruggebracht',
};

const RESERVATION_STATUS_LABELS_EN: Record<UitleenReservationStatus, string> = {
  REQUESTED: 'Requested',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
  PICKED_UP: 'Collected',
  RETURNED: 'Returned',
};

export function reservationStatusLabel(
  status: UitleenReservationStatus,
  locale: LogistiekLocale
): string {
  return (locale === 'en' ? RESERVATION_STATUS_LABELS_EN : RESERVATION_STATUS_LABELS)[status];
}

export const VAN_STATUS_LABELS: Record<UitleenTransportBookingStatus, string> = {
  REQUESTED: 'Aangevraagd',
  APPROVED: 'Goedgekeurd',
  REJECTED: 'Afgewezen',
  CANCELLED: 'Geannuleerd',
  COMPLETED: 'Uitgevoerd',
};

const VAN_STATUS_LABELS_EN: Record<UitleenTransportBookingStatus, string> = {
  REQUESTED: 'Requested',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
  COMPLETED: 'Completed',
};

export function vanStatusLabel(
  status: UitleenTransportBookingStatus,
  locale: LogistiekLocale
): string {
  return (locale === 'en' ? VAN_STATUS_LABELS_EN : VAN_STATUS_LABELS)[status];
}

/**
 * De status van een Collect&Go-bestelling.
 *
 * Geen Engelse tegenhanger zoals bij de reservatie- en ritstatussen: Collect&Go
 * bestaat enkel in het beheer, en dat is Nederlandstalig.
 */
export const GROCERY_STATUS_LABELS: Record<CollectEnGoOrderStatus, string> = {
  NEW: 'Klaar om te importeren',
  IMPORTED: 'Geïmporteerd',
  IGNORED: 'Terzijde',
};

/** Statussen die voorraad innemen bij de beschikbaarheidsberekening. */
export const STOCK_CONSUMING_STATUSES: UitleenReservationStatus[] = ['APPROVED', 'PICKED_UP'];

export type ReservationLineInput = {
  itemId: string;
  quantity: number;
  /** Opmerking bij deze lijn ("liefst de zwarte"); optioneel. */
  note?: string;
};

export class UitleenValidationError extends Error {
  readonly code: string;
  constructor(code: string, message?: string) {
    super(message ?? code);
    this.name = 'UitleenValidationError';
    this.code = code;
  }
}

/**
 * Eenheden die in de keuzelijst bij een flesserke-item staan.
 *
 * Bewust kort en bewust vrije tekst in de database: dit dekt alles wat er na de
 * Excel-import in stond (drank in liter, voeding in kilo, wegwerp per stuk), en
 * een item dat er niet in past mag gewoon niets hebben. Een enum zou een
 * migratie vragen voor elk product dat het team er anders bij zet.
 */
export const CONTENT_UNITS = ['L', 'cl', 'ml', 'kg', 'g', 'stuks', 'pak', 'rol', 'zakjes'] as const;

/**
 * "0,5 L" uit `contentAmount` en `contentUnit`.
 *
 * De getallen komen uit een Excel met een punt als decimaalteken; hier lezen we
 * Nederlands, dus wordt het een komma. Zonder eenheid blijft het getal alleen
 * staan: beter een kaal "0,5" dan een verzonnen eenheid.
 */
export function formatContentAmount(
  amount: string | null | undefined,
  unit: string | null | undefined
): string {
  const value = amount?.trim().replace('.', ',') ?? '';
  const suffix = unit?.trim() ?? '';
  if (!value) return suffix;
  return suffix ? `${value} ${suffix}` : value;
}
