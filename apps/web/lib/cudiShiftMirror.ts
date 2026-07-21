/**
 * Cursusdienst-shiften worden op cudi.vtk.be aangemaakt en naar de main site
 * gespiegeld als native `Shift`-rijen, zodat ze meetellen voor de shift-ranking
 * en reward-payout. Deze module bevat de pure beslissingslogica van die
 * spiegeling (herkomst-marker, reward-regel, post-label, veld-mapping en de
 * validatie van de sync-payload). De IO (prisma-transactie) zit in de route
 * `app/api/integrations/cudi/shifts/route.ts`.
 *
 * Zie docs/design-decisions.md, "Cursusdienst-shiften op de main site".
 */

/** Herkomst-marker voor shiften die van cudi.vtk.be gespiegeld worden. */
export const CUDI_SHIFT_SOURCE = "cudi";

/**
 * Post waaronder cursusdienst-shiften meetellen in de shift-ranking
 * (`app/api/shift/ranking/route.ts` groepeert per `Shift.post`). Wijzig hier om
 * ze onder een andere post te laten vallen.
 */
export const CURSUSDIENST_SHIFT_POST = "Cursusdienst";

/**
 * Reward van een cursusdienst-shift: 1 bonnetje per begonnen uur.
 *   1u00 → 1, 1u30 → 2, 2u00 → 2, 2u01 → 3.
 * Verbruikt in `app/api/shift/reward/route.ts` (sommeert `Shift.reward`). Wijzig
 * hier om de waardering aan te passen; de rest van het reward-systeem blijft gelijk.
 */
export function bonnetjesForShift(start: Date, end: Date): number {
  const hours = (end.getTime() - start.getTime()) / 3_600_000;
  return hours <= 0 ? 0 : Math.ceil(hours);
}

/** Eén shift zoals cudi ze doorstuurt. */
export type CudiShiftInput = {
  sourceId: string;
  name: string;
  startTime: string; // ISO
  endTime: string; // ISO
  location?: string | null;
  description?: string | null;
  maxShifters: number;
};

export type CudiShiftSyncBody = {
  /** Alles vanaf dit moment is "toekomst": buiten deze set gespiegelde shiften worden gepruned. */
  cutoff: Date;
  shifts: CudiShiftInput[];
};

/** De prisma-`Shift`-data (zonder relaties/id) voor één gespiegelde shift. */
export type MirroredShiftData = {
  name: string;
  startTime: Date;
  endTime: Date;
  location: string;
  description: string;
  maxParticipants: number;
  reward: number;
  post: string;
  sourceSystem: string;
  sourceId: string;
};

/** Map één cudi-shift naar de native `Shift`-velden (reward + post afgeleid). */
export function mapCudiShift(input: CudiShiftInput): MirroredShiftData {
  const startTime = new Date(input.startTime);
  const endTime = new Date(input.endTime);
  return {
    name: input.name,
    startTime,
    endTime,
    // Main `Shift.location`/`description` zijn non-null; cudi mag ze leeg laten.
    location: input.location ?? "",
    description: input.description ?? "",
    maxParticipants: input.maxShifters,
    reward: bonnetjesForShift(startTime, endTime),
    post: CURSUSDIENST_SHIFT_POST,
    sourceSystem: CUDI_SHIFT_SOURCE,
    sourceId: input.sourceId,
  };
}

function isValidIso(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function parseShift(value: unknown): CudiShiftInput | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.sourceId !== "string" || v.sourceId.length === 0) return null;
  if (typeof v.name !== "string") return null;
  if (!isValidIso(v.startTime) || !isValidIso(v.endTime)) return null;
  if (typeof v.maxShifters !== "number" || !Number.isFinite(v.maxShifters)) return null;
  const location = v.location;
  const description = v.description;
  if (location != null && typeof location !== "string") return null;
  if (description != null && typeof description !== "string") return null;
  return {
    sourceId: v.sourceId,
    name: v.name,
    startTime: v.startTime,
    endTime: v.endTime,
    location: (location as string | null | undefined) ?? null,
    description: (description as string | null | undefined) ?? null,
    maxShifters: v.maxShifters,
  };
}

/** Valideer de volledige sync-payload; `null` = ongeldig (route antwoordt 400). */
export function parseCudiShiftSyncBody(value: unknown): CudiShiftSyncBody | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  if (!isValidIso(v.cutoff)) return null;
  if (!Array.isArray(v.shifts)) return null;
  const shifts: CudiShiftInput[] = [];
  for (const raw of v.shifts) {
    const parsed = parseShift(raw);
    if (!parsed) return null;
    shifts.push(parsed);
  }
  return { cutoff: new Date(v.cutoff), shifts };
}
