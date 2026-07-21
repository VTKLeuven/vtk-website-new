import { Shift } from '@prisma/client';

/**
 * De velden die nodig zijn om een shift aan te maken/te valideren.
 *
 * Let op: dit zijn enkel de door de gebruiker aan te leveren velden. `id`,
 * `participantIds` en de `participants`-relatie worden nooit vanuit een
 * request body overgenomen.
 */
export type ShiftInput = {
  name: string;
  startTime: Date;
  endTime: Date;
  location: string;
  description: string;
  maxParticipants: number;
  reward: number;
  // Postcode (Group.code) of null. Vrije string: posten zijn nu GUI-beheerd, dus
  // dit valideert enkel het type; welke codes bestaan is een data-vraag.
  post: string | null;
};

/**
 * Wordt gegooid wanneer een waarde geen geldige shift voorstelt. `details`
 * bevat één string per gefaalde regel, zodat een endpoint ze rechtstreeks
 * kan teruggeven.
 */
export class ShiftValidationError extends Error {
  details: string[];

  constructor(details: string[]) {
    super(`Invalid shift: ${details.join('; ')}`);
    this.name = 'ShiftValidationError';
    this.details = details;
  }
}

/** Accepteert een Date, ISO-string of timestamp en geeft een geldige Date of null. */
function toDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

/**
 * Neemt een willekeurige waarde en geeft een gevalideerde {@link ShiftInput}
 * terug, of gooit een {@link ShiftValidationError} met wat er mis is.
 *
 * Alle regels worden gecontroleerd zodat de fout meteen álle problemen bevat,
 * niet enkel de eerste.
 */
export function parseShift(value: unknown): ShiftInput {
  if (typeof value !== 'object' || value === null) {
    throw new ShiftValidationError(['body must be an object']);
  }

  const { name, startTime, endTime, location, description, maxParticipants, reward, post } =
    value as Record<string, unknown>;

  const errors: string[] = [];

  if (typeof name !== 'string' || name.trim() === '') {
    errors.push('name is required');
  }

  const start = toDate(startTime);
  if (!start) errors.push('startTime must be a valid date');

  const end = toDate(endTime);
  if (!end) errors.push('endTime must be a valid date');

  if (start && end && end <= start) {
    errors.push('endTime must be after startTime');
  }

  if (typeof location !== 'string' || location.trim() === '') {
    errors.push('location is required');
  }

  if (typeof description !== 'string' || description.trim() === '') {
    errors.push('description is required');
  }

  if (!Number.isInteger(maxParticipants) || (maxParticipants as number) < 1) {
    errors.push('maxParticipants must be a positive integer');
  }

  if (!Number.isInteger(reward) || (reward as number) < 0) {
    errors.push('reward must be a non-negative integer');
  }

  if (post !== undefined && post !== null && typeof post !== 'string') {
    errors.push('post must be a group code string or null');
  }

  if (errors.length > 0) {
    throw new ShiftValidationError(errors);
  }

  return {
    name: (name as string).trim(),
    startTime: start!,
    endTime: end!,
    location: (location as string).trim(),
    description: (description as string).trim(),
    maxParticipants: maxParticipants as number,
    reward: reward as number,
    post: (post as string | null | undefined) ?? null,
  };
}

/**
 * Een shift zoals die uit een API-response komt: de velden van het `Shift`-model,
 * plus de afgeleide velden die sommige endpoints toevoegen. Die extra velden zijn
 * optioneel omdat ze per endpoint verschillen (bvb `GET /api/shift` geeft
 * `takenSpots`, terwijl `/all` en `/register` de `participants`-relatie meesturen).
 */
export type ShiftResponse = Shift & {
  takenSpots?: number;
  availableSpots?: number;
  isRegistered?: boolean;
  participants?: { userId: string; payedOut: boolean }[];
  /** ISO-tijdstip waarop de opvragende user zich inschreef (enkel op /register). */
  registeredAt?: string | null;
};

/**
 * Bedenktijd na inschrijven waarin uitschrijven nog mag, ook binnen de 24u-grens
 * voor de start. Moet gelijk blijven aan `UNREGISTER_GRACE_MS` in de API-route.
 */
export const UNREGISTER_GRACE_MS = 10 * 60 * 1000;

/** Binnen dit venster voor de start is uitschrijven geblokkeerd. */
export const UNREGISTER_LOCK_MS = 24 * 60 * 60 * 1000;

/**
 * Mag deze user zich nog uitschrijven? Binnen 24u voor de start niet, tenzij de
 * inschrijving zelf nog geen tien minuten oud is (misklik rechtzetten).
 */
export function canUnregister(shift: ShiftResponse, now: number): boolean {
  if (shift.startTime.getTime() - now >= UNREGISTER_LOCK_MS) return true;
  if (!shift.registeredAt) return false;
  const registeredAt = Date.parse(shift.registeredAt);
  return Number.isFinite(registeredAt) && now - registeredAt < UNREGISTER_GRACE_MS;
}

/**
 * Valideert één shift zoals die uit een API-response komt (dus mét `id`, en met
 * datums als ISO-strings) en geeft een getypeerde {@link ShiftResponse} terug.
 *
 * De kern-velden van het `Shift`-model worden gevalideerd en `startTime`/`endTime`
 * naar `Date` omgezet; alle overige velden op het object blijven ongewijzigd
 * behouden. Faalt de validatie, dan worden de redenen aan `errors` toegevoegd
 * (geprefixt met `label`, bvb `shift[2]`) en wordt `null` teruggegeven; zo kan
 * {@link parseShiftArray} álle fouten van álle elementen in één keer verzamelen.
 */
function parseShiftEntry(value: unknown, errors: string[], label: string): ShiftResponse | null {
  if (typeof value !== 'object' || value === null) {
    errors.push(`${label} must be an object`);
    return null;
  }

  const src = value as Record<string, unknown>;
  const before = errors.length;

  if (typeof src.id !== 'string' || src.id === '') {
    errors.push(`${label}.id must be a non-empty string`);
  }

  const start = toDate(src.startTime);
  if (!start) errors.push(`${label}.startTime must be a valid date`);

  const end = toDate(src.endTime);
  if (!end) errors.push(`${label}.endTime must be a valid date`);

  if (start && end && end <= start) {
    errors.push(`${label}.endTime must be after startTime`);
  }

  if (typeof src.name !== 'string') errors.push(`${label}.name must be a string`);
  if (typeof src.location !== 'string') errors.push(`${label}.location must be a string`);
  if (typeof src.description !== 'string') errors.push(`${label}.description must be a string`);

  if (!Number.isInteger(src.maxParticipants) || (src.maxParticipants as number) < 1) {
    errors.push(`${label}.maxParticipants must be a positive integer`);
  }

  if (!Number.isInteger(src.reward) || (src.reward as number) < 0) {
    errors.push(`${label}.reward must be a non-negative integer`);
  }

  if (src.post !== null && typeof src.post !== 'string') {
    errors.push(`${label}.post must be a group code string or null`);
  }

  // `participantIds` zit niet in elke response; is het aanwezig, dan moet het een
  // array van gehele getallen zijn. Anders vallen we terug op een lege lijst.
  let participantIds: number[] = [];
  if (src.participantIds !== undefined) {
    if (Array.isArray(src.participantIds) && src.participantIds.every((n) => Number.isInteger(n))) {
      participantIds = src.participantIds as number[];
    } else {
      errors.push(`${label}.participantIds must be an array of integers`);
    }
  }

  // Enkel een geldig object teruggeven; anders zou dit element stille onzin bevatten.
  if (errors.length > before) return null;

  // Behoud alle extra (afgeleide) velden via de spread; overschrijf enkel de
  // kern-velden met hun gevalideerde/gecoërceerde waardes.
  return {
    ...src,
    id: src.id as string,
    participantIds,
    name: src.name as string,
    startTime: start!,
    endTime: end!,
    location: src.location as string,
    description: src.description as string,
    maxParticipants: src.maxParticipants as number,
    reward: src.reward as number,
    post: src.post as string | null,
  } as ShiftResponse;
}

/**
 * Valideert een API-response die een array van shifts hoort te zijn (bvb het
 * resultaat van `GET /api/shift`) en geeft getypeerde {@link ShiftResponse}`[]`
 * terug. Datums komen via JSON binnen als ISO-strings en worden naar `Date`
 * omgezet; afgeleide velden die endpoints toevoegen (bvb `takenSpots`,
 * `isRegistered`, `participants`) blijven behouden.
 *
 * Bruikbaar in zowel client- als servercode (parset enkel `unknown`, geen
 * server-only imports). Gooit een {@link ShiftValidationError} met álle problemen
 * ineens, zodat de aanroeper ze rechtstreeks kan tonen/loggen.
 */
export function parseShiftArray(value: unknown): ShiftResponse[] {
  if (!Array.isArray(value)) {
    throw new ShiftValidationError(['response must be an array of shifts']);
  }

  const errors: string[] = [];
  const shifts: ShiftResponse[] = [];

  value.forEach((entry, index) => {
    const shift = parseShiftEntry(entry, errors, `shift[${index}]`);
    if (shift) shifts.push(shift);
  });

  if (errors.length > 0) {
    throw new ShiftValidationError(errors);
  }

  return shifts;
}

/**
 * Zoals {@link parseShift}, maar voor een gedeeltelijke update (PATCH): enkel de
 * velden die effectief in de body zitten worden gevalideerd en teruggegeven.
 *
 * De onderlinge check `endTime > startTime` gebeurt hier enkel wanneer beide in
 * de body zitten; een endpoint dat maar één van beide aanpast moet zelf tegen de
 * bestaande waarde valideren.
 */
export function parsePartialShift(value: unknown): Partial<ShiftInput> {
  if (typeof value !== 'object' || value === null) {
    throw new ShiftValidationError(['body must be an object']);
  }

  const src = value as Record<string, unknown>;
  const errors: string[] = [];
  const result: Partial<ShiftInput> = {};

  let start: Date | null = null;
  let end: Date | null = null;

  if ('startTime' in src) {
    start = toDate(src.startTime);
    if (!start) errors.push('startTime must be a valid date');
    else result.startTime = start;
  }

  if ('endTime' in src) {
    end = toDate(src.endTime);
    if (!end) errors.push('endTime must be a valid date');
    else result.endTime = end;
  }

  if (start && end && end <= start) {
    errors.push('endTime must be after startTime');
  }

  if ('name' in src) {
    if (typeof src.name !== 'string' || src.name.trim() === '') {
      errors.push('name is required');
    } else {
      result.name = src.name.trim();
    }
  }

  if ('location' in src) {
    if (typeof src.location !== 'string' || src.location.trim() === '') {
      errors.push('location is required');
    } else {
      result.location = src.location.trim();
    }
  }

  if ('description' in src) {
    if (typeof src.description !== 'string' || src.description.trim() === '') {
      errors.push('description is required');
    } else {
      result.description = src.description.trim();
    }
  }

  if ('maxParticipants' in src) {
    if (!Number.isInteger(src.maxParticipants) || (src.maxParticipants as number) < 1) {
      errors.push('maxParticipants must be a positive integer');
    } else {
      result.maxParticipants = src.maxParticipants as number;
    }
  }

  if ('reward' in src) {
    if (!Number.isInteger(src.reward) || (src.reward as number) < 0) {
      errors.push('reward must be a non-negative integer');
    } else {
      result.reward = src.reward as number;
    }
  }

  if ('post' in src) {
    const post = src.post;
    if (post !== null && typeof post !== 'string') {
      errors.push('post must be a group code string or null');
    } else {
      result.post = post as string | null;
    }
  }

  if (Object.keys(result).length === 0) {
    errors.push('no valid fields to update');
  }

  if (errors.length > 0) {
    throw new ShiftValidationError(errors);
  }

  return result;
}

/**
 * Geeft de start (incl.) en einde (excl.) van een academiejaar terug. Een
 * academiejaar loopt van 1 september tot 1 september. Standaard het academiejaar
 * waarin `reference` valt.
 */
/**
 * Startjaar van het academiejaar waarin `reference` valt. Een academiejaar loopt
 * van 1 september tot 1 september, dus bvb 15 mei 2026 hoort bij startjaar 2025.
 */
export function currentAcademicYear(reference: Date = new Date()): number {
  // getMonth() is 0-based: september = 8.
  return reference.getMonth() >= 8 ? reference.getFullYear() : reference.getFullYear() - 1;
}

/** Geeft [1 sep `startYear`, 1 sep `startYear + 1`) terug (einde exclusief). */
export function academicYearRangeFor(startYear: number): { start: Date; end: Date } {
  return { start: new Date(startYear, 8, 1), end: new Date(startYear + 1, 8, 1) };
}

/** Het academiejaar waarin `reference` valt (standaard nu). */
export function academicYearRange(reference: Date = new Date()): { start: Date; end: Date } {
  return academicYearRangeFor(currentAcademicYear(reference));
}

/**
 * Parset een optionele `{ start, end }` range uit een request body. Ontbrekende
 * velden vallen terug op het huidige academiejaar (zie {@link academicYearRange}).
 */
export function parseShiftRange(value: unknown): { start: Date; end: Date } {
  const { start: defaultStart, end: defaultEnd } = academicYearRange();

  if (typeof value !== 'object' || value === null) {
    return { start: defaultStart, end: defaultEnd };
  }

  const src = value as Record<string, unknown>;
  const errors: string[] = [];
  let start = defaultStart;
  let end = defaultEnd;

  if (src.start !== undefined) {
    const parsed = toDate(src.start);
    if (!parsed) errors.push('start must be a valid date');
    else start = parsed;
  }

  if (src.end !== undefined) {
    const parsed = toDate(src.end);
    if (!parsed) errors.push('end must be a valid date');
    else end = parsed;
  }

  if (start >= end) {
    errors.push('start must be before end');
  }

  if (errors.length > 0) {
    throw new ShiftValidationError(errors);
  }

  return { start, end };
}

/** Leest de Prisma-foutcode (bvb `P2025`) uit een onbekende error, indien aanwezig. */
function prismaErrorCode(err: unknown): string | undefined {
  if (err && typeof err === 'object' && 'code' in err) {
    const code = (err as { code: unknown }).code;
    return typeof code === 'string' ? code : undefined;
  }
  return undefined;
}

/** True wanneer een Prisma-operatie faalde omdat het record niet bestaat (P2025). */
export const isRecordNotFound = (err: unknown): boolean => prismaErrorCode(err) === 'P2025';

/** True wanneer een Prisma-insert een unique/PK-constraint schond (P2002). */
export const isUniqueViolation = (err: unknown): boolean => prismaErrorCode(err) === 'P2002';

/** True wanneer een Prisma-operatie een foreign-key-constraint schond (P2003). */
export const isForeignKeyViolation = (err: unknown): boolean => prismaErrorCode(err) === 'P2003';
