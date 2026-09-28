/**
 * De shiftsjablonen, kant van de webapp: types en het samenstellen van een naam.
 *
 * De sjablonen zelf staan in de databank (`ShiftTemplate`) en worden beheerd op
 * /admin/shiften/sjablonen/beheer. Wat hier staat is bewust puur: dit bestand
 * wordt zowel door een client component (het sjabloonscherm) als door server
 * code geïmporteerd, dus geen Prisma en geen server-only. Het lezen en schrijven
 * gebeurt in `lib/shift/templateStore.ts`.
 */

export { THEOKOT_TEMPLATE_SLUG } from '@vtk/db/shiftTemplates';

/** Eén shift binnen een sjabloon, zoals het scherm ze leest. */
export type ShiftTemplateEntry = {
  id: string;
  /** Naam van de shift, zonder de evenementnaam erachter ("Bar 1"). */
  name: string;
  /** Minuten t.o.v. het gekozen startmoment; negatief = ervoor (opbouw). */
  startOffsetMinutes: number;
  durationMinutes: number;
  maxParticipants: number;
  /**
   * Aantal bonnetjes per deelnemer. Verplicht per shift, en bewust geen waarde
   * die het sjabloon centraal zet: een opbouw van een half uur is niet hetzelfde
   * waard als vier uur aan de tap, dus die keuze hoort bij de shift zelf.
   */
  reward: number;
  description: string;
  instructions: string | null;
  /** Eigen locatie; null = volgt de algemene locatie uit het scherm. */
  location: string | null;
  /**
   * Volgt deze shift de algemene post niet? Dan telt `post`, ook wanneer die
   * null is ("geen post"). Twee velden omdat er drie toestanden zijn en één
   * nullable veld er maar twee kan zeggen.
   */
  ownPost: boolean;
  post: string | null;
  openToInternationals: boolean;
  /** `false` = staat standaard uitgevinkt. */
  enabled: boolean;
};

/** Eén sjabloon met zijn shiften, chronologisch. */
export type ShiftTemplate = {
  id: string;
  /** Natuurlijke sleutel; `theokot` hangt aan het bemannen van een verkoopweek. */
  slug: string;
  label: string;
  /** Eén regel uitleg onder de keuzelijst; null = geen uitleg. */
  note: string | null;
  /** Meegeleverd met de seed: bewerkbaar, maar niet verwijderbaar. */
  builtIn: boolean;
  /** Startwaarden waarmee het sjabloonscherm opent; daar allemaal aanpasbaar. */
  eventName: string;
  location: string;
  post: string | null;
  /** Suggestie voor het uur van de eerste shift, "HH:mm"; null = 20:00. */
  timeOfDay: string | null;
  shifts: ShiftTemplateEntry[];
};

/**
 * De shiftnaam komt eerst, het evenement erachter: "Inkom - Cantus". Wat je in een
 * lijst van shiften zoekt, is wat je gaat doen; het evenement is de context erbij.
 */
export const composeName = (eventName: string, baseName: string) =>
  eventName.trim() === '' ? baseName : `${baseName} - ${eventName.trim()}`;

/** Het uur waarop een sjabloon standaard opent, met de val terug op 20:00. */
export const templateTimeOfDay = (template: Pick<ShiftTemplate, 'timeOfDay'>) =>
  /^\d{2}:\d{2}$/.test(template.timeOfDay ?? '') ? (template.timeOfDay as string) : '20:00';

// -----------------------------------------------------------------------------
// Wat het beheerscherm verstuurt
// -----------------------------------------------------------------------------

/**
 * De post van één shift binnen een sjabloon, zoals de keuzelijst ze verstuurt.
 * Drie toestanden, dus drie waarden: `INHERIT_POST` volgt de post van het
 * sjabloon, `NO_POST` is bewust geen post, en al de rest is een postcode.
 */
export const INHERIT_POST = 'inherit';
export const NO_POST = 'none';

/** Eén shiftrij zoals het beheerscherm ze verstuurt. */
export type ShiftTemplateDraftEntry = {
  name: string;
  startOffsetMinutes: number;
  durationMinutes: number;
  maxParticipants: number;
  reward: number;
  description: string;
  instructions: string;
  /** Leeg = volgt de locatie van het sjabloon. */
  location: string;
  /** `INHERIT_POST`, `NO_POST` of een postcode. */
  post: string;
  openToInternationals: boolean;
  enabled: boolean;
};

/** De shiftrij zoals ze uit een bestaand sjabloon in het formulier komt. */
export function toDraftEntry(entry: ShiftTemplateEntry): ShiftTemplateDraftEntry {
  return {
    name: entry.name,
    startOffsetMinutes: entry.startOffsetMinutes,
    durationMinutes: entry.durationMinutes,
    maxParticipants: entry.maxParticipants,
    reward: entry.reward,
    description: entry.description,
    instructions: entry.instructions ?? '',
    location: entry.location ?? '',
    post: entry.ownPost ? (entry.post ?? NO_POST) : INHERIT_POST,
    openToInternationals: entry.openToInternationals,
    enabled: entry.enabled,
  };
}

// -----------------------------------------------------------------------------
// De offsets leesbaar maken
//
// De tijden van een sjabloon staan als afstand tot het startmoment, want
// hetzelfde sjabloon moet op elke datum en elk uur neergezet kunnen worden. Dat
// leest niet: "-150" zegt niemand iets. Deze hulpjes rekenen die minuten om naar
// het klokuur dat eruit volgt op het standaarduur van het sjabloon.
// -----------------------------------------------------------------------------

const pad = (n: number) => String(n).padStart(2, '0');

/** "2 u 30" / "45 min". */
export function formatTemplateDuration(minutes: number, nl: boolean): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  if (rest === 0) return nl ? `${hours} u` : `${hours}h`;
  return nl ? `${hours} u ${pad(rest)}` : `${hours}h${pad(rest)}`;
}

/** "op de start" / "1 u 30 ervoor" / "2 u erna". */
export function formatTemplateOffset(minutes: number, nl: boolean): string {
  if (minutes === 0) return nl ? 'op de start' : 'at the start';
  const amount = formatTemplateDuration(Math.abs(minutes), nl);
  if (minutes < 0) return nl ? `${amount} ervoor` : `${amount} before`;
  return nl ? `${amount} erna` : `${amount} after`;
}

/**
 * Het klokuur waarop een offset uitkomt, met de dag erbij wanneer het over
 * middernacht gaat. Een cantus bouwt om 02:00 af; zonder dat "+1" lijkt dat
 * 's ochtends voor de opbouw te vallen.
 */
export function templateClockAt(timeOfDay: string, offsetMinutes: number, nl: boolean): string {
  const [h, m] = timeOfDay.split(':').map(Number);
  const total = (Number.isFinite(h) ? h : 20) * 60 + (Number.isFinite(m) ? m : 0) + offsetMinutes;
  const day = Math.floor(total / 1440);
  const inDay = ((total % 1440) + 1440) % 1440;
  const clock = `${pad(Math.floor(inDay / 60))}:${pad(inDay % 60)}`;
  if (day === 0) return clock;
  return `${clock} (${day > 0 ? `+${day}` : day} ${nl ? 'dag' : 'day'})`;
}

// -----------------------------------------------------------------------------
// Wat het beheerscherm verstuurt, nakijken
// -----------------------------------------------------------------------------

/** Eén shiftrij zoals ze naar de databank gaat. */
export type ParsedTemplateEntry = {
  name: string;
  startOffsetMinutes: number;
  durationMinutes: number;
  maxParticipants: number;
  reward: number;
  description: string;
  instructions: string | null;
  location: string | null;
  ownPost: boolean;
  post: string | null;
  openToInternationals: boolean;
  enabled: boolean;
};

/**
 * Leest de shiftrijen uit het verborgen JSON-veld en kijkt ze na.
 *
 * Geeft een zin terug in plaats van een lijst wanneer er iets niet klopt; die
 * zin gaat als `detail` mee met de rode toast, zodat er "Shift 3" in kan staan
 * en de gebruiker niet zelf moet zoeken welke rij hij niet ingevuld heeft.
 *
 * `posts` is wat deze gebruiker mag kiezen: een postcode die er niet in staat,
 * weigeren we hier en niet stilletjes in de databank.
 */
export function parseTemplateEntries(raw: unknown, posts: string[]): ParsedTemplateEntry[] | string {
  if (!Array.isArray(raw)) return 'De shiften konden niet gelezen worden.';

  const entries: ParsedTemplateEntry[] = [];
  for (let i = 0; i < raw.length; i += 1) {
    const row = raw[i] as Partial<ShiftTemplateDraftEntry> | null;
    const at = `Shift ${i + 1}`;
    if (typeof row !== 'object' || row === null) return `${at}: kon niet gelezen worden.`;

    const name = typeof row.name === 'string' ? row.name.trim() : '';
    if (name === '') return `${at}: geef de shift een naam.`;

    const start = Number(row.startOffsetMinutes);
    if (!Number.isInteger(start)) return `${at}: de starttijd is geen geheel aantal minuten.`;

    const duration = Number(row.durationMinutes);
    if (!Number.isInteger(duration) || duration < 5) return `${at}: de shift moet minstens vijf minuten duren.`;

    const spots = Number(row.maxParticipants);
    if (!Number.isInteger(spots) || spots < 1) return `${at}: er moet minstens één plaats zijn.`;

    const reward = Number(row.reward);
    if (!Number.isInteger(reward) || reward < 0) return `${at}: het aantal bonnetjes kan niet negatief zijn.`;

    const description = typeof row.description === 'string' ? row.description.trim() : '';
    if (description === '') return `${at}: geef een korte beschrijving; die staat op /shift bij de shift.`;

    const postChoice = typeof row.post === 'string' ? row.post : INHERIT_POST;
    if (postChoice !== INHERIT_POST && postChoice !== NO_POST && !posts.includes(postChoice)) {
      return `${at}: je kan geen shift onder de post ${postChoice} zetten.`;
    }

    const instructions = typeof row.instructions === 'string' ? row.instructions.trim() : '';
    const location = typeof row.location === 'string' ? row.location.trim() : '';

    entries.push({
      name,
      startOffsetMinutes: start,
      durationMinutes: duration,
      maxParticipants: spots,
      reward,
      description,
      instructions: instructions === '' ? null : instructions,
      location: location === '' ? null : location,
      ownPost: postChoice !== INHERIT_POST,
      post: postChoice === INHERIT_POST || postChoice === NO_POST ? null : postChoice,
      openToInternationals: row.openToInternationals === true,
      enabled: row.enabled !== false,
    });
  }

  // Chronologisch, zodat de lijst leest zoals de avond verloopt. Een stabiele
  // sortering houdt twee shiften die tegelijk beginnen (tap en pispolitie) in de
  // volgorde waarin ze ingetikt zijn.
  return entries
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => a.entry.startOffsetMinutes - b.entry.startOffsetMinutes || a.index - b.index)
    .map((row) => row.entry);
}

// -----------------------------------------------------------------------------
// Datum- en weekhulpjes voor reeksen van shiften (terugkerende shiften)
// -----------------------------------------------------------------------------

/** Tel `days` kalenderdagen op bij "YYYY-MM-DD" via UTC-middernacht. */
export function addDaysToYmd(ymdStr: string, days: number): string {
  const [y, m, d] = ymdStr.split('-').map(Number);
  if (!y || !m || !d) return ymdStr;
  const dt = new Date(Date.UTC(y, m - 1, d, 12) + days * 86_400_000);
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

/** Maandag van de week waarin `refDateStr` ("YYYY-MM-DD") valt. */
export function getCurrentMonday(refDateStr: string): string {
  const [y, m, d] = refDateStr.split('-').map(Number);
  if (!y || !m || !d) return refDateStr;
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  const dow = dt.getUTCDay(); // 0=zo..6=za
  const daysBack = (dow + 6) % 7;
  return addDaysToYmd(refDateStr, -daysBack);
}

/** Eerstvolgende maandag ná `refDateStr` ("YYYY-MM-DD"). */
export function getNextMonday(refDateStr: string): string {
  const [y, m, d] = refDateStr.split('-').map(Number);
  if (!y || !m || !d) return refDateStr;
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  const dow = dt.getUTCDay(); // 0=zo..6=za
  const daysToMonday = ((8 - dow) % 7) || 7;
  return addDaysToYmd(refDateStr, daysToMonday);
}

/**
 * Lijst van kalenderdagen ("YYYY-MM-DD") tussen `startDate` en `endDate` inclusief,
 * gefilterd op `activeWeekdays` (0=zo, 1=ma, 2=di, 3=wo, 4=do, 5=vr, 6=za).
 */
export function getDatesBetween(startDate: string, endDate: string, activeWeekdays: number[]): string[] {
  const dates: string[] = [];
  const [sy, sm, sd] = startDate.split('-').map(Number);
  const [ey, em, ed] = endDate.split('-').map(Number);
  if (!sy || !sm || !sd || !ey || !em || !ed) return [];
  const cur = new Date(Date.UTC(sy, sm - 1, sd, 12));
  const end = new Date(Date.UTC(ey, em - 1, ed, 12));
  // Enkel een vangnet tegen een eindeloze lus; de grens op de lengte van een
  // reeks en op het aantal shiften legt het scherm op, met een foutmelding.
  let guard = 0;
  while (cur <= end && guard < 3660) {
    guard++;
    const y = cur.getUTCFullYear();
    const m = pad(cur.getUTCMonth() + 1);
    const d = pad(cur.getUTCDate());
    const dayOfWeek = cur.getUTCDay();
    if (activeWeekdays.includes(dayOfWeek)) {
      dates.push(`${y}-${m}-${d}`);
    }
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return dates;
}

/** Compacte datumtitel: "ma 28/09" of "Mon 28/09". */
export function formatDayLabel(dateStr: string, locale: 'nl' | 'en'): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  return new Intl.DateTimeFormat(locale === 'nl' ? 'nl-BE' : 'en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    timeZone: 'UTC',
  }).format(dt);
}
