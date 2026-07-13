import { GroupCode } from '@prisma/client';

/**
 * De velden die nodig zijn om een shift aan te maken/te valideren.
 *
 * Let op: dit zijn enkel de door de gebruiker aan te leveren velden. `id`,
 * `participantIds` en de `participants`-relatie worden nooit vanuit een
 * request body overgenomen.
 */
export type ShiftInput = {
  startTime: Date;
  endTime: Date;
  location: string;
  description: string;
  maxParticipants: number;
  reward: number;
  post: GroupCode | null;
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

const GROUP_CODES = new Set<string>(Object.values(GroupCode));

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

  const { startTime, endTime, location, description, maxParticipants, reward, post } =
    value as Record<string, unknown>;

  const errors: string[] = [];

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

  if (post !== undefined && post !== null && !GROUP_CODES.has(post as string)) {
    errors.push('post must be a valid group code');
  }

  if (errors.length > 0) {
    throw new ShiftValidationError(errors);
  }

  return {
    startTime: start!,
    endTime: end!,
    location: (location as string).trim(),
    description: (description as string).trim(),
    maxParticipants: maxParticipants as number,
    reward: reward as number,
    post: (post as GroupCode | null | undefined) ?? null,
  };
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
    if (post !== null && !GROUP_CODES.has(post as string)) {
      errors.push('post must be a valid group code');
    } else {
      result.post = post as GroupCode | null;
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
export function academicYearRange(reference: Date = new Date()): { start: Date; end: Date } {
  // getMonth() is 0-based: september = 8.
  const year = reference.getMonth() >= 8 ? reference.getFullYear() : reference.getFullYear() - 1;
  return {
    start: new Date(year, 8, 1),
    end: new Date(year + 1, 8, 1),
  };
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
